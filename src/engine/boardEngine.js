// src/engine/boardEngine.js
// Pure analytics engine for Owner Expectations / Board Objectives / Job Security.
// No side effects, no React imports. Read-only layer over existing game state.
//
// Design principle: board objectives are driven PRIMARILY by the team's OVR rank
// relative to the rest of the league. Owner ambition/patience apply light
// modifiers, but hard caps keyed to OVR rank prevent unrealistic objectives
// (e.g. a bottom-tier roster can never be told to "Reach the Champs Grand Final").

import { calcTeamOvr } from "./teamOvr.js";
import { calcChemistry } from "./chemistry.js";
import { getTeamCap } from "./rosterAI.js";
import { getMajorPlacementMap } from "../utils/historyProfiles.js";
import { isRookieEligible } from "../utils/seasonAwards.js";
import { CDL_TEAMS } from "../data/teams.js";
import { isInactivePlayer } from "../utils/playerIdentity.js";

// Bump when the objective generation logic changes in a way that makes old
// stored objectives invalid — triggers a safe one-time regeneration on load.
export const BOARD_OBJ_VERSION = 2;

// ── Clamp helper ──────────────────────────────────────────────────────────────
export function clamp(n) {
  return Math.max(0, Math.min(100, Math.round(n)));
}

// ── Migrate / init board state ────────────────────────────────────────────────
export function migrateBoardState(existing) {
  if (
    !existing ||
    typeof existing !== "object" ||
    typeof existing.confidence !== "number"
  ) {
    return { version: BOARD_OBJ_VERSION, confidence: 60, objectives: [], meta: null, verdict: null, history: [] };
  }
  return {
    version: typeof existing.version === "number" ? existing.version : 0,
    confidence: typeof existing.confidence === "number" ? existing.confidence : 60,
    objectives: Array.isArray(existing.objectives) ? existing.objectives : [],
    meta: existing.meta ?? null,
    verdict: existing.verdict ?? null,
    history: Array.isArray(existing.history) ? existing.history : [],
  };
}

// True when stored objectives predate the current logic and should be regenerated.
export function objectivesNeedRegen(boardState) {
  if (!boardState) return true;
  if (!Array.isArray(boardState.objectives) || boardState.objectives.length === 0) return true;
  if ((boardState.version ?? 0) < BOARD_OBJ_VERSION) return true;
  return false;
}

// ── Security band ─────────────────────────────────────────────────────────────
export function getSecurityBand(confidence) {
  const c = Number(confidence ?? 60);
  if (c >= 80) return "Secure";
  if (c >= 60) return "Stable";
  if (c >= 40) return "Shaky";
  if (c >= 20) return "At Risk";
  return "Critical";
}

export function bandColor(band) {
  switch (band) {
    case "Secure":   return "#34d399";
    case "Stable":   return "#60a5fa";
    case "Shaky":    return "#f97316";
    case "At Risk":  return "#f87171";
    case "Critical": return "#dc2626";
    default:         return "#60a5fa";
  }
}

// ── Owner lookup ──────────────────────────────────────────────────────────────
export function getOwner(teamId) {
  const team = CDL_TEAMS.find(t => t.id === teamId);
  const o = team?.owner;
  return {
    name: o?.name ?? "Team Ownership",
    ambition: typeof o?.ambition === "number" ? o.ambition : 60,
    patience: typeof o?.patience === "number" ? o.patience : 55,
  };
}

// ── League OVR ranking ────────────────────────────────────────────────────────
// Ranks all 12 CDL teams by average starter OVR (1 = strongest).
export function getLeagueOvrRanks(state) {
  const players = state?.players ?? [];
  const rows = CDL_TEAMS.map(t => ({ teamId: t.id, ovr: calcTeamOvr(t.id, players) }))
    .sort((a, b) => b.ovr - a.ovr);
  const rankById = {};
  rows.forEach((row, i) => { rankById[row.teamId] = i + 1; });
  return { rows, rankById };
}

export function getTeamOvrRank(state, teamId = state?.userTeamId) {
  return getLeagueOvrRanks(state).rankById[teamId] ?? 0;
}

// ── Strength tiers (by OVR rank) ──────────────────────────────────────────────
export function getTierForRank(rank) {
  if (rank <= 0) return { key: "unknown", label: "Unrated" };
  if (rank <= 3)  return { key: "elite",   label: "Elite Contender" };
  if (rank <= 5)  return { key: "strong",  label: "Strong Playoff Team" };
  if (rank <= 8)  return { key: "mid",     label: "Mid-Table" };
  if (rank <= 10) return { key: "weak",    label: "Lower-Tier" };
  return { key: "rebuild", label: "Rebuild" };
}

// ── Objective status labels / colors (shared by all UI surfaces) ──────────────
export function objStatusLabel(status) {
  switch (status) {
    case "completed": return "Completed";
    case "met":       return "Completed";
    case "ahead":     return "Ahead of expectations";
    case "onTrack":   return "On track";
    case "atRisk":    return "At risk";
    case "failed":    return "Failed";
    case "notStarted":return "Not started";
    default:          return "Not started";
  }
}

export function objStatusColor(status) {
  switch (status) {
    case "completed":
    case "met":       return "#34d399";
    case "ahead":     return "#22c55e";
    case "onTrack":   return "#60a5fa";
    case "atRisk":    return "#f97316";
    case "failed":    return "#f87171";
    default:          return "var(--text-dim)";
  }
}

export function isMetStatus(status) {
  return status === "completed" || status === "met";
}

// ── Objective factory ─────────────────────────────────────────────────────────
let _objCounter = 0;
function makeObj(weight, season, type, target, label, importance) {
  _objCounter += 1;
  return {
    id: `obj_${weight}_s${season}_${type}_${target ?? "x"}_${_objCounter}`,
    label,
    type,
    target: target ?? null,
    weight, // "primary" | "secondary" | "stretch"
    importance: importance ?? (weight === "primary" ? "High" : weight === "secondary" ? "Medium" : "Bonus"),
    status: "notStarted",
    progressNote: "",
  };
}

// Stage-win targets scale with tier (regular season = 44 matches/team).
function stageWinTarget(tierKey) {
  switch (tierKey) {
    case "elite":   return 26;
    case "strong":  return 22;
    case "mid":     return 18;
    case "weak":    return 13;
    default:        return 10; // rebuild
  }
}

// ── Generate objectives for the current season ────────────────────────────────
// Returns ONLY the objectives array (kept for back-compat + diagnostics).
// Use buildBoardObjectives() to also get the explanatory meta.
export function generateObjectives(state) {
  return buildBoardObjectives(state).objectives;
}

// Returns { objectives, meta }. meta drives the Board page header/explanation.
export function buildBoardObjectives(state) {
  const { userTeamId, players } = state || {};
  if (!userTeamId || !players) return { objectives: [], meta: null };

  const season = state.season ?? 1;
  const ovr = calcTeamOvr(userTeamId, players);
  const { rankById } = getLeagueOvrRanks(state);
  const rank = rankById[userTeamId] ?? 0;
  const tier = getTierForRank(rank);
  const owner = getOwner(userTeamId);
  const isSeasonOne = season <= 1 && (state.seasonHistory?.length ?? 0) === 0;

  const userPlayers = players.filter(p => p.teamId === userTeamId && !p.isSub && !isInactivePlayer(p));
  const chemBaseline = calcChemistry(userPlayers);

  const high = owner.ambition >= 75;   // owner pushes one notch harder

  let objectives = [];

  switch (tier.key) {
    case "elite": {
      // Rank 1-3 — trophies, deep Champs runs expected.
      const primary = high
        ? makeObj("primary", season, "majorResult", 1, "Win at least one Major", "Critical")
        : makeObj("primary", season, "finishTopN", 3, "Finish the regular season top 3", "Critical");
      objectives = [
        primary,
        makeObj("secondary", season, "majorResult", 2, "Reach at least one Major final"),
        makeObj("secondary", season, "champsResult", 4, "Reach the Champs semi-final"),
        // Champs Grand Final stays a STRETCH unless ambition is sky-high.
        high
          ? makeObj("stretch", season, "champsResult", 1, "Win Champs")
          : makeObj("stretch", season, "champsResult", 2, "Reach the Champs Grand Final"),
      ];
      break;
    }
    case "strong": {
      // Rank 4-5 — Champs qualification, Major semis; trophies are a stretch.
      objectives = [
        makeObj("primary", season, "finishTopN", high ? 5 : 6, `Finish the regular season top ${high ? 5 : 6}`, "High"),
        makeObj("secondary", season, "qualifyChamps", 8, "Qualify for Champs"),
        makeObj("secondary", season, "majorResult", 4, "Reach at least one Major semi-final"),
        // Win a Major allowed only at rank ≤5, and only as a stretch.
        high
          ? makeObj("stretch", season, "majorResult", 1, "Win a Major")
          : makeObj("stretch", season, "champsResult", 2, "Reach the Champs Grand Final"),
      ];
      break;
    }
    case "mid": {
      // Rank 6-8 — top 8, Champs race, decent stage record.
      objectives = [
        makeObj("primary", season, "finishTopN", 8, "Finish the regular season top 8", "High"),
        makeObj("secondary", season, "qualifyChamps", 8, "Stay in the Champs race (top 8)"),
        makeObj("secondary", season, "winStageMatches", stageWinTarget("mid"), `Win at least ${stageWinTarget("mid")} stage matches`),
        makeObj("stretch", season, "majorResult", 6, "Reach a Major top 6"),
      ];
      break;
    }
    case "weak": {
      // Rank 9-10 — avoid the bottom 2, develop, show progress.
      const sec2 = isSeasonOne
        ? makeObj("secondary", season, "improveChemistry", 0, "Build team chemistry")
        : makeObj("secondary", season, "improveChemistry", 0, "Improve or maintain team chemistry");
      objectives = [
        makeObj("primary", season, "avoidBottomN", 2, "Avoid finishing in the bottom 2", "High"),
        makeObj("secondary", season, "developRookie", 10, "Develop a young player with real pro maps"),
        sec2,
        // Champs only if the owner is unusually ambitious; otherwise an upset.
        high
          ? makeObj("stretch", season, "qualifyChamps", 8, "Sneak into the Champs race (top 8)")
          : makeObj("stretch", season, "majorResult", 8, "Reach a Major top 8"),
      ];
      break;
    }
    default: {
      // rebuild (rank 11-12) — avoid last, modest wins, develop, stay competitive.
      objectives = [
        makeObj("primary", season, "avoidBottomN", 1, "Avoid finishing last", "High"),
        makeObj("secondary", season, "winStageMatches", stageWinTarget("rebuild"), `Win at least ${stageWinTarget("rebuild")} stage matches`),
        makeObj("secondary", season, "developRookie", 10, "Develop a rookie/prospect with real maps"),
        // No top 6 / no trophies / no Champs GF for rebuild rosters.
        makeObj("stretch", season, "finishTopN", 10, "Climb to a top-10 finish"),
      ];
      break;
    }
  }

  // Safety net: enforce the hard caps regardless of how objectives were built.
  objectives = applyHardCaps(objectives, rank);

  const meta = {
    season,
    ovr,
    ovrRank: rank,
    tierKey: tier.key,
    tierLabel: tier.label,
    ownerName: owner.name,
    ambition: owner.ambition,
    patience: owner.patience,
    chemBaseline,
    ovrBaseline: ovr,
    isSeasonOne,
    explanation: buildExplanation({ tier, rank, ovr, owner }),
  };

  return { objectives, meta };
}

// ── Hard caps keyed to OVR rank ───────────────────────────────────────────────
// Downgrades any objective that is unrealistic for the team's strength tier.
// This is the safety net that guarantees the "Important hard rules" hold even
// if owner modifiers or future edits try to push targets too far.
export function applyHardCaps(objectives, rank) {
  if (rank <= 0) return objectives;
  return objectives.map(obj => {
    let o = obj;

    // Champs Grand Final / Win Champs (champsResult target ≤ 2) — rank 1-3 only.
    if (o.type === "champsResult" && o.target != null && o.target <= 2 && rank > 3) {
      o = retarget(o, "champsResult", 6, "Reach the Champs top 6");
    }
    // Win a Major (majorResult target 1) — rank 1-5 only.
    if (o.type === "majorResult" && o.target === 1 && rank > 5) {
      o = retarget(o, "majorResult", 4, "Reach a Major semi-final");
    }
    // Win Champs as a MAIN (primary) objective — rank 1-3 only.
    if (o.type === "champsResult" && o.target === 1 && o.weight === "primary" && rank > 3) {
      o = retarget(o, "finishTopN", 4, "Finish the regular season top 4");
    }
    // Finish top 6 (or better) as a MAIN objective — never for rank 9+.
    if (o.type === "finishTopN" && o.target != null && o.target <= 6 && o.weight === "primary" && rank >= 9) {
      o = retarget(o, "avoidBottomN", rank >= 11 ? 1 : 2,
        rank >= 11 ? "Avoid finishing last" : "Avoid finishing in the bottom 2");
    }
    // Rebuild teams (rank 11-12) can never be asked to reach Champs GF / top 6 / win a Major.
    if (rank >= 11) {
      if (o.type === "champsResult") {
        o = retarget(o, "qualifyChamps", 8, "Reach the Champs race (top 8)");
      }
      if (o.type === "finishTopN" && o.target != null && o.target <= 6) {
        o = retarget(o, "finishTopN", 10, "Climb to a top-10 finish");
      }
    }
    return o;
  });
}

function retarget(obj, type, target, label) {
  return { ...obj, type, target, label, _capped: true };
}

// ── Explanation panel text ────────────────────────────────────────────────────
function buildExplanation({ tier, rank, ovr, owner }) {
  const ambWord = owner.ambition >= 80 ? "high-ambition" : owner.ambition <= 40 ? "patient, budget-minded" : "balanced";
  const rankStr = `${rank}${ordinal(rank)}`;
  switch (tier.key) {
    case "elite":
      return `Ranked ${rankStr} by starter OVR (${ovr}) — among the strongest rosters in the league. With a ${ambWord} owner, the board expects trophies and a deep Champs run.`;
    case "strong":
      return `Ranked ${rankStr} by starter OVR (${ovr}) — a clear playoff-calibre roster. The board expects Champs qualification and Major semi-final runs, with a trophy as upside.`;
    case "mid":
      return `Ranked ${rankStr} by starter OVR (${ovr}) — a mid-table roster. The board wants a top-8 finish and to stay in the Champs race rather than contend for trophies.`;
    case "weak":
      return `Ranked ${rankStr} by starter OVR (${ovr}) — a lower-tier roster. The board's priority is avoiding the bottom 2 and developing players, not contending for Champs.`;
    case "rebuild":
      return `Ranked ${rankStr} by starter OVR (${ovr}) — one of the weakest rosters in the league, so the board expects a rebuild season. The main target is to avoid last place and show progress, not to chase Champs or trophies.`;
    default:
      return `Roster strength is still being assessed; objectives are set conservatively.`;
  }
}

// ── Live cumulative rank helper ───────────────────────────────────────────────
function cumRank(state) {
  const standings = state?.schedule?.standings ?? {};
  const sorted = Object.entries(standings).sort((a, b) => (b[1].points ?? 0) - (a[1].points ?? 0));
  return sorted.findIndex(([id]) => id === state?.userTeamId) + 1 || 0;
}

function cumWins(state) {
  const standings = state?.schedule?.standings ?? {};
  return standings[state?.userTeamId]?.wins ?? 0;
}

// ── Evaluate a single objective ───────────────────────────────────────────────
export function evalObjective(obj, state, isFinal = false) {
  if (!obj || !state) return obj;

  const { userTeamId, schedule, players } = state;
  const season = state.season ?? 1;
  let status = obj.status;
  let progressNote = obj.progressNote ?? "";

  try {
    switch (obj.type) {
      case "finishTopN": {
        const rank = cumRank(state);
        if (rank === 0) {
          status = "notStarted";
          progressNote = "Season standings not yet available.";
        } else if (isFinal) {
          status = rank <= obj.target ? "completed" : "failed";
          progressNote = `Finished ${rank}${ordinal(rank)} (target: top ${obj.target}).`;
        } else {
          status = placementLiveStatus(rank, obj.target);
          progressNote = `Currently ${rank}${ordinal(rank)} (target: top ${obj.target}).`;
        }
        break;
      }

      case "avoidBottomN": {
        // target = how many bottom places to avoid (1 = avoid last, 2 = avoid bottom 2)
        const threshold = 12 - obj.target; // must finish at or above this rank
        const rank = cumRank(state);
        if (rank === 0) {
          status = "notStarted";
          progressNote = "Season standings not yet available.";
        } else if (isFinal) {
          status = rank <= threshold ? "completed" : "failed";
          progressNote = `Finished ${rank}${ordinal(rank)} (must avoid bottom ${obj.target}).`;
        } else {
          status = placementLiveStatus(rank, threshold);
          progressNote = `Currently ${rank}${ordinal(rank)} (must stay above ${threshold + 1}${ordinal(threshold + 1)}).`;
        }
        break;
      }

      case "qualifyChamps": {
        const champs = schedule?.majors?.[4];
        if (champs?.completed && champs.bracket) {
          const place = getMajorPlacementMap(champs)[userTeamId] ?? null;
          status = place != null ? "completed" : "failed";
          progressNote = place != null ? `Qualified for Champs (finished ${place}${ordinal(place)}).` : "Did not qualify for Champs.";
        } else {
          const rank = cumRank(state);
          if (rank === 0) { status = "notStarted"; progressNote = "Season standings not yet available."; }
          else if (isFinal) {
            status = rank <= 8 ? "completed" : "failed";
            progressNote = `Season ended ${rank}${ordinal(rank)} (top 8 qualifies for Champs).`;
          } else {
            status = placementLiveStatus(rank, 8);
            progressNote = `Currently ${rank}${ordinal(rank)} — top 8 qualifies for Champs.`;
          }
        }
        break;
      }

      case "champsResult": {
        const champs = schedule?.majors?.[4];
        if (champs?.completed && champs.bracket) {
          const place = getMajorPlacementMap(champs)[userTeamId] ?? null;
          if (place != null) {
            status = place <= obj.target ? "completed" : "failed";
            progressNote = `Finished ${place}${ordinal(place)} at Champs (target: top ${obj.target}).`;
          } else {
            status = "failed";
            progressNote = "Did not reach Champs.";
          }
        } else {
          const rank = cumRank(state);
          status = rank > 0 && rank <= 8 ? "onTrack" : (rank > 0 ? "atRisk" : "notStarted");
          progressNote = rank > 0
            ? `Champs not played yet — currently ${rank}${ordinal(rank)} (top 8 qualifies).`
            : "Champs not played yet.";
          if (isFinal) {
            status = "failed";
            progressNote = "Champs result not recorded.";
          }
        }
        break;
      }

      case "majorResult": {
        const majors = schedule?.majors ?? [];
        let bestPlace = null;
        let completedCount = 0;
        for (let i = 0; i <= 3; i++) {
          const major = majors[i];
          if (!major?.completed || !major.bracket) continue;
          completedCount++;
          const place = getMajorPlacementMap(major)[userTeamId] ?? null;
          if (place != null && (bestPlace === null || place < bestPlace)) bestPlace = place;
        }
        if (bestPlace != null) {
          if (isFinal) {
            status = bestPlace <= obj.target ? "completed" : "failed";
          } else {
            status = bestPlace <= obj.target ? "ahead" : (completedCount >= 3 ? "atRisk" : "onTrack");
          }
          progressNote = `Best Major result so far: ${bestPlace}${ordinal(bestPlace)} (target: top ${obj.target}).`;
        } else {
          status = isFinal ? "failed" : "notStarted";
          progressNote = isFinal ? `No qualifying Major result (target: top ${obj.target}).` : "No Majors completed yet.";
        }
        break;
      }

      case "winStageMatches": {
        const wins = cumWins(state);
        if (isFinal) {
          status = wins >= obj.target ? "completed" : "failed";
          progressNote = `${wins} stage-match wins (target: ${obj.target}).`;
        } else if (wins >= obj.target) {
          status = "completed";
          progressNote = `${wins} stage-match wins — target of ${obj.target} reached.`;
        } else {
          status = wins > 0 ? "onTrack" : "notStarted";
          progressNote = `${wins} / ${obj.target} stage-match wins.`;
        }
        break;
      }

      case "developRookie": {
        const matchLog = schedule?.matchLog ?? [];
        const userPlayers = (players ?? []).filter(p => p.teamId === userTeamId && !isInactivePlayer(p));
        let bestMaps = 0, bestName = null;
        for (const player of userPlayers) {
          if (!isRookieEligible(player, season, state)) continue;
          let maps = 0;
          for (const entry of matchLog) {
            for (const mr of (entry.mapResults ?? [])) {
              const allPlayers = [...(mr.team1Players ?? []), ...(mr.team2Players ?? []), ...(mr.players ?? [])];
              if (allPlayers.some(pl => (pl.id ?? pl.playerId) === player.id)) maps++;
            }
          }
          if (maps > bestMaps) { bestMaps = maps; bestName = player.name; }
        }
        const target = obj.target ?? 10;
        if (bestMaps >= target) {
          status = "completed";
          progressNote = bestName ? `${bestName} has logged ${bestMaps} CDL maps as a rookie.` : `${bestMaps} rookie maps logged.`;
        } else if (bestMaps >= Math.ceil(target / 2)) {
          status = isFinal ? "failed" : "onTrack";
          progressNote = bestName ? `${bestName} at ${bestMaps}/${target} rookie maps.` : `${bestMaps}/${target} rookie maps.`;
        } else {
          status = isFinal ? "failed" : "notStarted";
          progressNote = bestMaps > 0 ? `${bestMaps}/${target} rookie maps tracked.` : "No rookie contribution recorded yet.";
        }
        break;
      }

      case "improveChemistry": {
        const userPlayers = (players ?? []).filter(p => p.teamId === userTeamId && !p.isSub && !isInactivePlayer(p));
        const current = calcChemistry(userPlayers);
        const baseline = state.boardState?.meta?.chemBaseline ?? current;
        const need = baseline + (obj.target ?? 0);
        if (current >= need) {
          status = isFinal ? "completed" : (current >= need + 4 ? "ahead" : "onTrack");
          progressNote = `Chemistry ${current} (baseline ${baseline}${obj.target ? `, +${obj.target} target` : ""}).`;
        } else {
          status = isFinal ? "failed" : "atRisk";
          progressNote = `Chemistry ${current} — below target of ${need} (baseline ${baseline}).`;
        }
        break;
      }

      case "salaryTarget": {
        const starters = (players ?? []).filter(p => p.teamId === userTeamId && !p.isSub && !isInactivePlayer(p));
        const committed = starters.reduce((sum, p) => sum + (p.salary ?? 0), 0);
        const cap = getTeamCap(userTeamId);
        if (committed <= cap) {
          status = "completed";
          progressNote = `Salary within budget ($${Math.round(committed / 1000)}k / $${Math.round(cap / 1000)}k cap).`;
        } else {
          status = isFinal ? "failed" : "atRisk";
          progressNote = `Over cap by $${Math.round((committed - cap) / 1000)}k.`;
        }
        break;
      }

      // Legacy types from v1 saves — map onto the closest current behaviour so a
      // mid-season save still evaluates sensibly before the next regeneration.
      case "reachChamps": {
        return evalObjective({ ...obj, type: "champsResult" }, state, isFinal);
      }

      default:
        break;
    }
  } catch {
    // Fail safe — leave status unchanged on error
  }

  return { ...obj, status, progressNote };
}

// Live status for a placement-style target (lower rank number = better).
function placementLiveStatus(rank, target) {
  if (rank <= 0) return "notStarted";
  if (rank <= target - 2) return "ahead";
  if (rank <= target) return "onTrack";
  return "atRisk";
}

// ── Evaluate all objectives ───────────────────────────────────────────────────
export function evalAllObjectives(objectives, state, isFinal = false) {
  if (!Array.isArray(objectives)) return [];
  return objectives.map(obj => evalObjective(obj, state, isFinal));
}

// ── Expectation-relative confidence after a regular-season Major ──────────────
export function nudgeConfidenceAfterMajor(boardState, state, majorIdx) {
  if (majorIdx == null || majorIdx > 3 || majorIdx < 0) return boardState;

  const major = state?.schedule?.majors?.[majorIdx];
  if (!major?.completed || !major.bracket) return boardState;

  const place = getMajorPlacementMap(major)[state.userTeamId] ?? null;
  if (place == null) return boardState;

  // Expected Major placement ≈ the team's OVR rank (12 CDL seeds entered).
  const rank = boardState.meta?.ovrRank || getTeamOvrRank(state);
  const expected = rank > 0 ? rank : 6;
  const diff = expected - place; // positive = better than expected

  let delta;
  if (diff >= 4) delta = 6;
  else if (diff >= 2) delta = 4;
  else if (diff >= 1) delta = 2;
  else if (diff === 0) delta = 0;
  else if (diff >= -2) delta = -3;
  else delta = -5;

  delta = applyPatienceToDelta(delta, boardState.meta?.patience);

  const newConfidence = clamp((boardState.confidence ?? 60) + delta);
  const updatedObjs = evalAllObjectives(boardState.objectives ?? [], { ...state, boardState }, false);

  return { ...boardState, confidence: newConfidence, objectives: updatedObjs };
}

// Low patience amplifies penalties; high patience softens them. Bonuses are
// lightly muted for very patient owners (they don't overreact to good news either).
function applyPatienceToDelta(delta, patience) {
  const p = typeof patience === "number" ? patience : 55;
  if (delta < 0) {
    const factor = p <= 40 ? 1.3 : p >= 75 ? 0.75 : 1.0;
    return Math.round(delta * factor);
  }
  if (delta > 0) {
    const factor = p >= 75 ? 0.9 : 1.0;
    return Math.round(delta * factor);
  }
  return 0;
}

// ── End-of-season board review ────────────────────────────────────────────────
export function runBoardReview(boardState, state) {
  const season = state?.season ?? 1;
  const evalState = { ...state, boardState };
  const evaluatedObjs = evalAllObjectives(boardState.objectives ?? [], evalState, true);

  const primaryObj = evaluatedObjs.find(o => o.weight === "primary");
  const secObjs = evaluatedObjs.filter(o => o.weight === "secondary");
  const stretchObjs = evaluatedObjs.filter(o => o.weight === "stretch");

  const primaryMet = isMetStatus(primaryObj?.status);
  const primaryFailed = primaryObj && !isMetStatus(primaryObj.status);

  let delta = 0;
  if (primaryMet) delta += 18;
  else if (primaryFailed) delta -= 18;

  for (const obj of secObjs) {
    if (isMetStatus(obj.status)) delta += 8;
    else if (obj.status === "failed") delta -= 8;
  }
  // Stretch objectives are upside-only: hitting them is a bonus, missing is neutral.
  for (const obj of stretchObjs) {
    if (isMetStatus(obj.status)) delta += 6;
  }

  // Expectation-relative finish: reward overachievement vs OVR rank, punish the reverse.
  const rank = boardState.meta?.ovrRank || getTeamOvrRank(state);
  const finalRank = cumRank(state);
  const overachievements = [];
  const underperformances = [];
  if (rank > 0 && finalRank > 0) {
    const finishDiff = rank - finalRank; // positive = finished better than OVR rank
    if (finishDiff >= 3) { delta += 8; overachievements.push(`Finished ${finalRank}${ordinal(finalRank)} despite a ${rank}${ordinal(rank)}-ranked roster`); }
    else if (finishDiff >= 1) { delta += 4; overachievements.push(`Finished ${finalRank}${ordinal(finalRank)}, above the roster's ${rank}${ordinal(rank)} OVR rank`); }
    else if (finishDiff <= -3) { delta -= 8; underperformances.push(`Finished ${finalRank}${ordinal(finalRank)} with a ${rank}${ordinal(rank)}-ranked roster`); }
    else if (finishDiff <= -1) { delta -= 4; underperformances.push(`Finished ${finalRank}${ordinal(finalRank)}, below the roster's ${rank}${ordinal(rank)} OVR rank`); }
  }

  for (const o of evaluatedObjs) {
    if (isMetStatus(o.status) && o.weight === "stretch") overachievements.push(`Hit stretch goal: ${o.label}`);
    if (o.status === "failed" && o.weight !== "stretch") underperformances.push(`Missed: ${o.label}`);
  }

  // Patience scales the net negative swing.
  if (delta < 0) delta = applyPatienceToDelta(delta, boardState.meta?.patience);

  const confidenceBefore = boardState.confidence ?? 60;
  const newConfidence = clamp(confidenceBefore + delta);

  // Verdict — thresholds shift with owner patience.
  const patience = boardState.meta?.patience ?? 55;
  const releasedFloor = patience <= 40 ? 25 : patience >= 75 ? 15 : 20;
  const warningFloor = patience <= 40 ? 45 : patience >= 75 ? 35 : 40;

  let verdict;
  if (!primaryFailed || newConfidence > warningFloor) {
    verdict = "Retained";
  } else if (newConfidence >= releasedFloor) {
    verdict = "Final Warning";
  } else {
    verdict = "Released";
  }

  const tag = CDL_TEAMS.find(t => t.id === state?.userTeamId)?.tag ?? "Coach";
  const flavour = buildFlavour(verdict, primaryMet, newConfidence, primaryObj, tag);

  const archiveEntry = {
    season,
    confidenceBefore,
    confidenceAfter: newConfidence,
    delta,
    objectives: evaluatedObjs,
    verdict,
    overachievements,
    underperformances,
    meta: boardState.meta ?? null,
  };

  const newBoardState = {
    ...boardState,
    confidence: newConfidence,
    objectives: evaluatedObjs,
    verdict,
    history: [...(boardState.history ?? []), archiveEntry],
  };

  const pendingBoardReview = {
    season,
    verdict,
    objectives: evaluatedObjs,
    confidenceBefore,
    confidenceAfter: newConfidence,
    delta,
    flavour,
    overachievements,
    underperformances,
    meta: boardState.meta ?? null,
  };

  return { newBoardState, pendingBoardReview };
}

// ── Flavour text generator ────────────────────────────────────────────────────
function buildFlavour(verdict, primaryMet, confidence, primaryObj, tag) {
  if (verdict === "Retained" && confidence >= 80) {
    return `Outstanding. You've exceeded expectations — ${tag} looks primed for next season.`;
  }
  if (verdict === "Retained" && primaryMet) {
    return `Mandate delivered. The owner is satisfied. Don't let standards slip.`;
  }
  if (verdict === "Retained") {
    return `The board recognises the roster's limits — progress matters more than the trophy cabinet this year. Keep building.`;
  }
  if (verdict === "Final Warning") {
    const objLabel = primaryObj?.label ?? "the primary objective";
    return `Last chance. Failing "${objLabel}" is unacceptable. One more season — deliver or you're done.`;
  }
  return `Results speak for themselves. The owner has lost confidence. Your contract is terminated.`;
}

// ── Board context for the Board page header / progress panel ──────────────────
export function getBoardContext(state) {
  if (!state?.userTeamId) return null;
  const board = state.boardState ?? null;
  const meta = board?.meta ?? null;
  const liveRank = getTeamOvrRank(state);
  const currentOvr = calcTeamOvr(state.userTeamId, state.players ?? []);
  const leaguePos = cumRank(state);
  const userPlayers = (state.players ?? []).filter(p => p.teamId === state.userTeamId && !p.isSub && !isInactivePlayer(p));
  const chem = calcChemistry(userPlayers);

  return {
    ownerName: meta?.ownerName ?? getOwner(state.userTeamId).name,
    ambition: meta?.ambition ?? getOwner(state.userTeamId).ambition,
    patience: meta?.patience ?? getOwner(state.userTeamId).patience,
    confidence: board?.confidence ?? 60,
    band: getSecurityBand(board?.confidence ?? 60),
    season: state.season ?? 1,
    ovrRank: liveRank,
    tier: getTierForRank(liveRank),
    leaguePos,
    currentOvr,
    ovrBaseline: meta?.ovrBaseline ?? currentOvr,
    chem,
    chemBaseline: meta?.chemBaseline ?? chem,
    explanation: meta?.explanation ?? buildExplanation({ tier: getTierForRank(liveRank), rank: liveRank, ovr: currentOvr, owner: getOwner(state.userTeamId) }),
    verdict: board?.verdict ?? null,
  };
}

// ── Ordinal suffix helper ─────────────────────────────────────────────────────
function ordinal(n) {
  const abs = Math.abs(n);
  const mod100 = abs % 100;
  if (mod100 >= 11 && mod100 <= 13) return "th";
  switch (abs % 10) {
    case 1: return "st";
    case 2: return "nd";
    case 3: return "rd";
    default: return "th";
  }
}
