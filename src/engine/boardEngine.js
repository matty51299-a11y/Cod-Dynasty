// src/engine/boardEngine.js
// Pure analytics layer: Owner Expectations / Job Security system.
// No side effects, no React imports — reads existing state and produces UI data.

import { calcTeamOvr } from "./teamOvr.js";
import { getTeamCap } from "./rosterAI.js";
import { getMajorPlacementMap } from "../utils/historyProfiles.js";
import { isRookieEligible } from "../utils/seasonAwards.js";
import { CDL_TEAMS } from "../data/teams.js";
import { isInactivePlayer } from "../utils/playerIdentity.js";

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
    return { confidence: 60, objectives: [], verdict: null, history: [] };
  }
  return {
    confidence: typeof existing.confidence === "number" ? existing.confidence : 60,
    objectives: Array.isArray(existing.objectives) ? existing.objectives : [],
    verdict: existing.verdict ?? null,
    history: Array.isArray(existing.history) ? existing.history : [],
  };
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

// ── Generate objectives for the current season ─────────────────────────────────
export function generateObjectives(state) {
  const { userTeamId, players, season } = state || {};
  if (!userTeamId || !players) return [];

  const ovr = calcTeamOvr(userTeamId, players);
  const s = season ?? 1;

  let primary;
  let secondaries;

  if (ovr >= 84) {
    // Elite tier
    primary = makeObj("primary", s, "reachChamps", 2, "Win or reach the Champs Grand Final");
    secondaries = [
      makeObj("secondary", s, "finishTopN", 3, "Finish top 3 in regular season standings"),
      makeObj("secondary", s, "majorResult", 4, "Achieve a top-4 result at a Major"),
    ];
  } else if (ovr >= 80) {
    // Strong tier
    primary = makeObj("primary", s, "finishTopN", 4, "Finish top 4 in regular season standings");
    secondaries = [
      makeObj("secondary", s, "reachChamps", 6, "Reach the top 6 at Champs"),
      makeObj("secondary", s, "majorResult", 6, "Achieve a top-6 result at a Major"),
    ];
  } else if (ovr >= 75) {
    // Mid tier
    primary = makeObj("primary", s, "finishTopN", 6, "Finish top 6 in regular season standings");
    secondaries = [
      makeObj("secondary", s, "developRookie", null, "Develop a rookie into a CDL contributor"),
      makeObj("secondary", s, "majorResult", 8, "Achieve a top-8 result at a Major"),
    ];
  } else {
    // Weak tier
    primary = makeObj("primary", s, "finishTopN", 8, "Finish top 8 in regular season standings");
    secondaries = [
      makeObj("secondary", s, "developRookie", null, "Develop a rookie into a CDL contributor"),
      makeObj("secondary", s, "salaryTarget", null, "Keep salary within budget constraints"),
    ];
  }

  return [primary, ...secondaries];
}

function makeObj(weight, season, type, target, label) {
  return {
    id: `obj_${weight}_s${season}_${type}`,
    label,
    type,
    target,
    weight,
    status: "pending",
    progressNote: "",
  };
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
        const standings = schedule?.standings ?? {};
        const sorted = Object.entries(standings).sort((a, b) => b[1].points - a[1].points);
        const rank = sorted.findIndex(([id]) => id === userTeamId) + 1 || 0;
        if (rank === 0) {
          status = "pending";
          progressNote = "Season standings not yet available.";
        } else if (isFinal) {
          status = rank <= obj.target ? "met" : "failed";
          progressNote = `Finished ${rank}${ordinal(rank)} (target: top ${obj.target}).`;
        } else {
          status = rank <= obj.target ? "onTrack" : "pending";
          progressNote = `Currently ranked ${rank}${ordinal(rank)} (target: top ${obj.target}).`;
        }
        break;
      }

      case "reachChamps": {
        const champs = schedule?.majors?.[4];
        if (champs?.completed && champs.bracket) {
          const placements = getMajorPlacementMap(champs);
          const place = placements[userTeamId] ?? null;
          if (place != null) {
            if (isFinal) {
              status = place <= obj.target ? "met" : "failed";
              progressNote = `Finished ${place}${ordinal(place)} at Champs (target: top ${obj.target}).`;
            } else {
              status = place <= obj.target ? "met" : "failed";
              progressNote = `Champs complete — finished ${place}${ordinal(place)}.`;
            }
          } else {
            if (isFinal) {
              status = "failed";
              progressNote = "Did not qualify for Champs.";
            } else {
              status = "pending";
              progressNote = "Did not compete at Champs.";
            }
          }
        } else {
          // Champs not yet started — use regular season rank as proxy
          const standings = schedule?.standings ?? {};
          const sorted = Object.entries(standings).sort((a, b) => b[1].points - a[1].points);
          const rank = sorted.findIndex(([id]) => id === userTeamId) + 1 || 0;
          if (rank > 0 && rank <= 8) {
            status = "onTrack";
            progressNote = `On track — currently ranked ${rank}${ordinal(rank)}, top 8 qualifies.`;
          } else if (rank > 0) {
            status = "pending";
            progressNote = `Currently ranked ${rank}${ordinal(rank)}, need top 8 to qualify.`;
          } else {
            status = "pending";
            progressNote = "Season standings not yet available.";
          }
          if (isFinal) {
            status = rank > 0 && rank <= 8 ? "met" : "failed";
            progressNote = rank > 0
              ? `Season ended ranked ${rank}${ordinal(rank)} (top 8 = Champs qualifying).`
              : "Season ended without qualifying for Champs.";
          }
        }
        break;
      }

      case "majorResult": {
        // Look at Majors 0-3 (regular season majors)
        const majors = schedule?.majors ?? [];
        let bestPlace = null;
        for (let i = 0; i <= 3; i++) {
          const major = majors[i];
          if (!major?.completed || !major.bracket) continue;
          const placements = getMajorPlacementMap(major);
          const place = placements[userTeamId] ?? null;
          if (place != null && (bestPlace === null || place < bestPlace)) {
            bestPlace = place;
          }
        }
        if (bestPlace != null) {
          if (isFinal) {
            status = bestPlace <= obj.target ? "met" : "failed";
            progressNote = `Best Major result: ${bestPlace}${ordinal(bestPlace)} (target: top ${obj.target}).`;
          } else {
            status = bestPlace <= obj.target ? "onTrack" : "pending";
            progressNote = `Best Major result so far: ${bestPlace}${ordinal(bestPlace)} (target: top ${obj.target}).`;
          }
        } else {
          status = isFinal ? "failed" : "pending";
          progressNote = isFinal
            ? `No Major placements recorded (target: top ${obj.target}).`
            : "No Majors completed yet.";
        }
        break;
      }

      case "developRookie": {
        // Count maps played by rookie-eligible players on user team
        const matchLog = schedule?.matchLog ?? [];
        const userPlayers = (players ?? []).filter(
          p => p.teamId === userTeamId && !isInactivePlayer(p)
        );

        let bestMaps = 0;
        let bestName = null;

        for (const player of userPlayers) {
          if (!isRookieEligible(player, season, state)) continue;
          // Count maps from matchLog entries involving this player
          let maps = 0;
          for (const entry of matchLog) {
            const results = entry.mapResults ?? [];
            for (const mr of results) {
              const allPlayers = [
                ...(mr.team1Players ?? []),
                ...(mr.team2Players ?? []),
                ...(mr.players ?? []),
              ];
              if (allPlayers.some(pl => (pl.id ?? pl.playerId) === player.id)) {
                maps++;
              }
            }
          }
          if (maps > bestMaps) {
            bestMaps = maps;
            bestName = player.name;
          }
        }

        if (bestMaps >= 10) {
          status = "met";
          progressNote = bestName
            ? `${bestName} has logged ${bestMaps} CDL maps as a rookie.`
            : `${bestMaps} maps played by a rookie contributor.`;
        } else if (bestMaps >= 5) {
          status = isFinal ? "failed" : "onTrack";
          progressNote = bestName
            ? `${bestName} at ${bestMaps} maps — needs 10 to qualify.`
            : `${bestMaps} maps played by a rookie in progress.`;
        } else {
          status = isFinal ? "failed" : "pending";
          progressNote = bestMaps > 0
            ? `${bestMaps} rookie maps tracked so far (target: 10).`
            : "No rookie contribution recorded yet.";
        }
        break;
      }

      case "salaryTarget": {
        const starters = (players ?? []).filter(
          p => p.teamId === userTeamId && !p.isSub && !isInactivePlayer(p)
        );
        const committed = starters.reduce((sum, p) => sum + (p.salary ?? 0), 0);
        const cap = getTeamCap(userTeamId);
        if (committed <= cap) {
          status = "met";
          progressNote = `Salary within budget ($${Math.round(committed / 1000)}k / $${Math.round(cap / 1000)}k cap).`;
        } else {
          status = isFinal ? "failed" : "pending";
          const over = committed - cap;
          progressNote = `Over cap by $${Math.round(over / 1000)}k.`;
        }
        break;
      }

      default:
        break;
    }
  } catch {
    // Fail safe — leave status unchanged on error
  }

  return { ...obj, status, progressNote };
}

// ── Evaluate all objectives ───────────────────────────────────────────────────
export function evalAllObjectives(objectives, state, isFinal = false) {
  if (!Array.isArray(objectives)) return [];
  return objectives.map(obj => evalObjective(obj, state, isFinal));
}

// ── Nudge confidence after a regular-season Major ────────────────────────────
export function nudgeConfidenceAfterMajor(boardState, state, majorIdx) {
  if (majorIdx == null || majorIdx > 3 || majorIdx < 0) return boardState;

  const major = state?.schedule?.majors?.[majorIdx];
  if (!major?.completed || !major.bracket) return boardState;

  const placements = getMajorPlacementMap(major);
  const place = placements[state.userTeamId] ?? null;

  let delta = 0;
  if (place != null) {
    if (place <= 3) delta = 5;
    else if (place <= 6) delta = 3;
    else if (place <= 8) delta = 0;
    else if (place <= 12) delta = -3;
    else delta = -5;
  }

  const newConfidence = clamp((boardState.confidence ?? 60) + delta);
  const updatedObjs = evalAllObjectives(boardState.objectives ?? [], state, false);

  return {
    ...boardState,
    confidence: newConfidence,
    objectives: updatedObjs,
  };
}

// ── End-of-season board review ────────────────────────────────────────────────
export function runBoardReview(boardState, state) {
  const season = state?.season ?? 1;
  const evaluatedObjs = evalAllObjectives(boardState.objectives ?? [], state, true);

  const primaryObj = evaluatedObjs.find(o => o.weight === "primary");
  const secObjs = evaluatedObjs.filter(o => o.weight === "secondary");

  const primaryMet = primaryObj?.status === "met";
  const primaryFailed = primaryObj && primaryObj.status !== "met";

  let delta = 0;
  if (primaryMet) delta += 20;
  else if (primaryFailed) delta -= 20;

  for (const obj of secObjs) {
    if (obj.status === "met") delta += 8;
    else if (obj.status === "failed") delta -= 8;
  }

  const confidenceBefore = boardState.confidence ?? 60;
  const newConfidence = clamp(confidenceBefore + delta);

  // Determine verdict
  let verdict;
  if (newConfidence > 40 || primaryMet) {
    verdict = "Retained";
  } else if (newConfidence >= 20) {
    verdict = "Final Warning";
  } else {
    verdict = "Released";
  }

  // Flavour text — short, sharp, owner voice
  const tag = CDL_TEAMS.find(t => t.id === state?.userTeamId)?.tag ?? "Coach";
  const flavour = buildFlavour(verdict, primaryMet, newConfidence, primaryObj, tag);

  const archiveEntry = {
    season,
    confidenceBefore,
    confidenceAfter: newConfidence,
    delta,
    objectives: evaluatedObjs,
    verdict,
  };

  const newBoardState = {
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
    return `You kept your job — barely. The owner is watching closely next season.`;
  }
  if (verdict === "Final Warning") {
    const objLabel = primaryObj?.label ?? "the primary objective";
    return `Last chance. Failing "${objLabel}" is unacceptable. One more season — deliver or you're done.`;
  }
  // Released
  return `Results speak for themselves. The owner has lost confidence. Your contract is terminated.`;
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
