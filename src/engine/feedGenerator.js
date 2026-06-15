// src/engine/feedGenerator.js
// Rich feed-item generators for the League News panel.
// Pure functions — no side effects, no imports from store.

import { CDL_TEAMS } from "../data/teams.js";

function teamTag(id) {
  return CDL_TEAMS.find(t => t.id === id)?.tag ?? id;
}

function teamName(id) {
  return CDL_TEAMS.find(t => t.id === id)?.name ?? id;
}

function makeItem(type, message, season, phase, extras) {
  const base = { type, message, season: season ?? 1, phase: phase ?? "major", read: false };
  return extras ? { ...base, ...extras } : base;
}

// Top-4 team IDs from a DE bracket without importing seasonEngine
function bracketTop4(bracket) {
  if (!bracket?.rounds?.length) return new Set();
  const ids = [];
  const gfRound = bracket.rounds.find(r => r.type === "GF") ?? bracket.rounds[bracket.rounds.length - 1];
  const gfMatch = gfRound?.matches?.[0];
  if (gfMatch?.played && gfMatch.result) {
    ids.push(gfMatch.result.winnerId, gfMatch.result.loserId);
  } else if (bracket.champion) {
    ids.push(bracket.champion);
  }
  const lbFinal = bracket.rounds.find(r => r.name === "LB Final")?.matches?.[0];
  if (lbFinal?.played && lbFinal.result) ids.push(lbFinal.result.loserId);
  const lbR5 = bracket.rounds.find(r => r.name === "LB Round 5")?.matches?.[0];
  if (lbR5?.played && lbR5.result) ids.push(lbR5.result.loserId);
  return new Set(ids.filter(Boolean));
}

// Aggregate K/D stats from a matchLog array
function aggregateKD(matchLog) {
  const acc = {};
  for (const m of matchLog) {
    if (!m.playerStats) continue;
    for (const [pid, ps] of Object.entries(m.playerStats)) {
      if (!ps.name) continue;
      if (!acc[pid]) acc[pid] = { name: ps.name, teamId: ps.teamId, kills: 0, deaths: 0, maps: 0 };
      acc[pid].kills  += ps.kills  ?? 0;
      acc[pid].deaths += ps.deaths ?? 0;
      acc[pid].maps   += 1;
    }
  }
  return acc;
}

// Best K/D entry from aggregated stats, requiring a minimum map count
function topKDEntry(stats, minMaps) {
  let best = null;
  for (const [pid, s] of Object.entries(stats)) {
    if (s.maps < minMaps) continue;
    const kd = s.deaths > 0 ? s.kills / s.deaths : s.kills;
    if (!best || kd > best.kd) best = { pid, kd, name: s.name, teamId: s.teamId };
  }
  return best;
}

// ── Major results ─────────────────────────────────────────────────────────────
export function generateMajorFeed(wasCompleted, newState, majorIdx) {
  if (wasCompleted) return [];
  const major = newState.schedule?.majors?.[majorIdx];
  if (!major?.completed) return [];

  const season   = newState.schedule?.season ?? newState.season ?? 1;
  const champId  = major.bracket?.champion;
  if (!champId) return [];

  const isChamps = majorIdx === 4;
  const items    = [];

  // 1. Champion headline
  if (isChamps) {
    items.push(makeItem("champs_champ", `${teamTag(champId)} are World Champions!`, season, "major", {
      title:      `${teamTag(champId)} are World Champions`,
      body:       `${teamName(champId)} take the CDL Championship.`,
      importance: "high",
      teamIds:    [champId],
    }));
  } else {
    items.push(makeItem("major_champ", `${teamTag(champId)} win ${major.name}`, season, "major", {
      title:      `${teamTag(champId)} win ${major.name}`,
      importance: "high",
      teamIds:    [champId],
    }));
  }

  // 2. Runner-up
  const awards  = (major.pointsAwards ?? []).filter(a => (a.points ?? 0) > 0).sort((a, b) => a.place - b.place);
  const ruEntry = awards.find(a => a.place === 2);
  if (ruEntry) {
    items.push(makeItem("major_result",
      `${teamTag(ruEntry.teamId)} finish runner-up at ${major.name}`, season, "major",
      { teamIds: [ruEntry.teamId] }
    ));
  }

  // 3. Challenger upset — any challenger team in top 4
  const challengers = newState.schedule?.currentMajorEventTeams ?? {};
  if (Object.keys(challengers).length > 0 && major.bracket) {
    const top4 = bracketTop4(major.bracket);
    for (const [cId, cTeam] of Object.entries(challengers)) {
      if (top4.has(cId)) {
        const cName = cTeam?.name ?? cId;
        items.push(makeItem("major_upset",
          `${cName} (Open Circuit) reach top 4 at ${major.name}`, season, "major",
          {
            title:      `${cName} make top 4 at ${major.name}`,
            body:       `Amateur squad ${cName} upset CDL pros.`,
            importance: "high",
          }
        ));
        break;
      }
    }
  }

  // 4. First-round eliminations
  const firstRound = major.bracket?.rounds?.[0];
  if (firstRound?.matches) {
    for (const m of firstRound.matches) {
      if (m.result?.loserId) {
        items.push(makeItem("major_elim",
          `${teamTag(m.result.loserId)} out in ${firstRound.name ?? "Round 1"}`, season, "major",
          { teamIds: [m.result.loserId] }
        ));
      }
    }
  }

  // 5. Points summary (top 4 CDL teams)
  if (awards.length) {
    const top = awards.slice(0, 4).map(a => `${teamTag(a.teamId)} +${a.points}`).join(" · ");
    items.push(makeItem("major_points", `${major.name} points: ${top}`, season, "major"));
  }

  // 6. Standout performer at this specific major
  const majorLog = (newState.schedule?.matchLog ?? []).filter(m =>
    typeof m.stage === "string" && m.stage.startsWith(major.name + " –")
  );
  if (majorLog.length > 0) {
    const mStats = aggregateKD(majorLog);
    const top    = topKDEntry(mStats, 3);
    if (top && top.kd >= 1.30) {
      items.push(makeItem("standout_perf",
        `${top.name} posts ${top.kd.toFixed(2)} K/D at ${major.name}`, season, "major",
        {
          title:      `${top.name} dominates ${major.name}`,
          body:       `${top.kd.toFixed(2)} K/D across the tournament.`,
          importance: top.kd >= 1.50 ? "high" : "normal",
          teamIds:    top.teamId ? [top.teamId] : [],
        }
      ));
    }
  }

  // 7. Season K/D leader
  const allStats = aggregateKD(newState.schedule?.matchLog ?? []);
  const leader   = topKDEntry(allStats, 5);
  if (leader) {
    items.push(makeItem("kd_leader",
      `${leader.name} leads the league at ${leader.kd.toFixed(2)} K/D`, season, "major"
    ));
  }

  return items;
}

// ── Challenger qualifier results ──────────────────────────────────────────────
export function generateChallengerQualFeed(newState, majorIdx) {
  const results    = newState.schedule?.challengerQualifierResults ?? [];
  const qualResult = results.find(r => r.majorIdx === majorIdx);
  if (!qualResult?.teams?.length) return [];

  const season    = newState.schedule?.season ?? newState.season ?? 1;
  const majorName = newState.schedule?.majors?.[majorIdx]?.name ?? `Major ${majorIdx + 1}`;
  const qualified = [...qualResult.teams]
    .filter(t => t.qualified)
    .sort((a, b) => a.placement - b.placement);

  if (qualified.length === 0) return [];

  const items = [];

  // Qualifier winner
  const w = qualified[0];
  items.push(makeItem("qual_win",
    `${w.teamName} win the Qualifier for ${majorName}`, season, "challengerQualifier",
    {
      title:      `${w.teamName} earn a Major spot`,
      body:       `${w.teamName} top the Open Qualifier for ${majorName}.`,
      importance: "high",
    }
  ));

  // First-time qualifiers (places 2–4)
  const firstTimers = [];
  const veterans    = [];
  for (const t of qualified.slice(1)) {
    const ctEntry  = (newState.challengerTeams ?? []).find(ct => ct.id === t.teamId);
    const prevQuals = (ctEntry?.qualifiedMajorIdxs ?? []).filter(idx => idx !== majorIdx);
    if (prevQuals.length === 0) {
      firstTimers.push(t);
    } else {
      veterans.push(t);
    }
  }

  for (const t of firstTimers) {
    items.push(makeItem("qual_debut",
      `${t.teamName} qualify for their first CDL Major`, season, "challengerQualifier",
      { title: `${t.teamName} qualify for the first time`, importance: "high" }
    ));
  }

  if (veterans.length > 0) {
    items.push(makeItem("qual_top4",
      `Also qualifying for ${majorName}: ${veterans.map(t => t.teamName).join(", ")}`,
      season, "challengerQualifier"
    ));
  }

  return items;
}

// ── AI roster moves ───────────────────────────────────────────────────────────
export function generateRosterMoveFeed(newState, prevMovesLen) {
  const log = newState.rosterMovesLog ?? [];
  if (log.length <= prevMovesLen) return [];

  const newEntries = log.slice(prevMovesLen).filter(e => (e.additions?.length ?? 0) > 0);
  if (!newEntries.length) return [];

  const season = newState.season ?? 1;
  // Most significant moves first, cap at 4 items
  const top = [...newEntries].sort((a, b) => b.additions.length - a.additions.length).slice(0, 4);

  return top.map(entry => {
    const tag   = teamTag(entry.teamId);
    const n     = entry.additions.length;
    const swaps = entry.additions.map(a => `${a.out} → ${a.in}`).join(", ");
    return makeItem("roster_move",
      `${tag} make ${n} roster change${n > 1 ? "s" : ""}: ${swaps}`,
      season, "offseason",
      { title: `${tag} shake up roster`, body: swaps, teamIds: [entry.teamId] }
    );
  });
}

// ── Offseason stories ─────────────────────────────────────────────────────────
export function generateOffseasonFeed(prevRetiredLen, prevFreeIds, newState, season) {
  const items = [];

  // Retirements (grouped if multiple)
  const retired = (newState.retiredPlayers ?? []).slice(prevRetiredLen).filter(r => !r.isProspect);
  if (retired.length === 1) {
    const r = retired[0];
    items.push(makeItem("retirement", `${r.name} retires at ${r.age}`, season, "offseason", {
      title: `${r.name} retires`,
      body:  `${r.name} calls it a career at age ${r.age}.`,
    }));
  } else if (retired.length > 1) {
    items.push(makeItem("retirement",
      `${retired.length} pros retire this offseason`, season, "offseason",
      {
        title: `${retired.length} veterans retire`,
        body:  retired.map(r => `${r.name} (${r.age})`).join(", ") + ".",
      }
    ));
  }

  // Notable AI signings (80+ OVR free agents who found a new home)
  const aiSigned = (newState.players ?? []).filter(p =>
    p.teamId && p.teamId !== newState.userTeamId && prevFreeIds.has(p.id) && (p.overall ?? 0) >= 80
  );
  for (const p of aiSigned.slice(0, 4)) {
    const tag = teamTag(p.teamId);
    items.push(makeItem("signing", `${tag} sign ${p.name}`, season, "offseason", {
      title:      `${tag} sign ${p.name}`,
      body:       (p.overall ?? 0) >= 85 ? `${p.name} (${p.overall} OVR) joins ${teamName(p.teamId)}.` : null,
      importance: (p.overall ?? 0) >= 85 ? "high" : "normal",
      teamIds:    [p.teamId],
    }));
  }

  // Prospect class
  const lastLog = newState.challengersLog?.slice(-1)[0];
  if ((lastLog?.annualIntake ?? 0) > 0) {
    items.push(makeItem("prospect_class",
      `Season ${newState.season} draft class: ${lastLog.annualIntake} new prospects`,
      season, "offseason",
      {
        title: `Season ${newState.season} draft class arrives`,
        body:  `${lastLog.annualIntake} new prospects enter the amateur pool.`,
      }
    ));
  }

  return items;
}
