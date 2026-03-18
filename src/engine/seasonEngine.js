// src/engine/seasonEngine.js
// Drives the CDL season structure:
//   Stage 1 → Major 1 → Stage 2 → Major 2 → Stage 3 → Major 3 →
//   Stage 4 → Major 4 → Pre-Champs Window → Champs → Offseason
//
// schedule.stageIdx  — index into stages[] (0–3), meaningful during phase "stage"
// schedule.majorIdx  — index into majors[] (0–4), meaningful during phase "major"
// schedule.standings      — cumulative season W/L/pts (never reset mid-season)
// schedule.stageStandings — per-stage W/L/pts; snapshot kept during active Major,
//                           reset when transitioning Major → next Stage
//
// Regular Majors (1–4) seeded by stageStandings.points
// Champs seeded by standings.points (cumulative season total)

import { simMatch } from "./matchSim.js";
import { CDL_TEAMS } from "../data/teams.js";
import { runProgression } from "./progression.js";
import { runAIMajorRosterWindow, runAIOffseasonRosterWindow } from "./rosterAI.js";

// ── PRNG / helpers ────────────────────────────────────────────────────────────
function seededRng(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

function shuffle(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildRoundRobin(teamIds) {
  const pairs = [];
  for (let i = 0; i < teamIds.length; i++)
    for (let j = i + 1; j < teamIds.length; j++)
      pairs.push([teamIds[i], teamIds[j]]);
  return pairs;
}

// Deterministic seed for a specific major match (no seed collisions)
function majorSeed(season, majorIdx, roundIdx, matchIdx) {
  return season * 1_000_000 + majorIdx * 100_000 + (roundIdx + 1) * 10_000 + (matchIdx + 1) * 100 + 7;
}

// ── Initial standings ─────────────────────────────────────────────────────────
export function initStandings(teamIds) {
  return Object.fromEntries(teamIds.map(id => [id, { wins: 0, losses: 0, points: 0 }]));
}

// ── Build season schedule ─────────────────────────────────────────────────────
export function buildSeason(season) {
  const teamIds = CDL_TEAMS.map(t => t.id);
  const rng = seededRng(season * 9999 + 1);
  const mkStage = name => ({
    name,
    matches: shuffle(buildRoundRobin(teamIds), rng)
      .map(([a, b]) => ({ a, b, played: false, result: null })),
  });

  return {
    season,
    stages: [
      mkStage("Stage 1"),
      mkStage("Stage 2"),
      mkStage("Stage 3"),
      mkStage("Stage 4"),
    ],
    majors: [
      { name: "Major 1", bracket: null, completed: false },
      { name: "Major 2", bracket: null, completed: false },
      { name: "Major 3", bracket: null, completed: false },
      { name: "Major 4", bracket: null, completed: false },
      { name: "Champs",  bracket: null, completed: false },
    ],
    standings:      initStandings(teamIds),  // cumulative season W/L/pts
    stageStandings: initStandings(teamIds),  // per-stage; kept as bracket snapshot, reset on Major→Stage
    stageIdx:        0,     // current stage index (0–3)
    majorIdx:        null,  // current major index (0–4); null when not in major phase
    phase:           "stage",  // "stage" | "major" | "preChamps" | "offseason"
    currentMatchday: 0,
    matchLog:        [],
  };
}

// ── Build major bracket ───────────────────────────────────────────────────────
// Accepts any standings object with { [teamId]: { points, ... } }.
// Regular Majors pass stageStandings; Champs passes cumulative standings.
function buildMajorBracket(standings) {
  const sorted = Object.entries(standings)
    .sort((a, b) => b[1].points - a[1].points)
    .slice(0, 8)
    .map(([id]) => id);

  return {
    seeds: sorted,
    rounds: [
      {
        name: "Quarterfinals",
        matches: [
          { a: sorted[0], b: sorted[7], seedA: 1, seedB: 8, played: false, result: null },
          { a: sorted[1], b: sorted[6], seedA: 2, seedB: 7, played: false, result: null },
          { a: sorted[2], b: sorted[5], seedA: 3, seedB: 6, played: false, result: null },
          { a: sorted[3], b: sorted[4], seedA: 4, seedB: 5, played: false, result: null },
        ],
      },
      { name: "Semifinals",  matches: [] },
      { name: "Grand Final", matches: [] },
    ],
    completed: false,
    champion:  null,
  };
}

// ── Internal: play exactly ONE unplayed major match ───────────────────────────
// Mutates schedule in place. Returns { roundIdx, allComplete }.
function _simOneMajorMatch(schedule, gameState) {
  const majorIdx = schedule.majorIdx;
  const major    = schedule.majors[majorIdx];
  const bracket  = major.bracket;

  // Find the first round that still has unplayed matches
  let roundIdx = -1;
  for (let r = 0; r < bracket.rounds.length; r++) {
    const round = bracket.rounds[r];
    if (round.matches.length > 0 && round.matches.some(m => !m.played)) {
      roundIdx = r;
      break;
    }
  }
  if (roundIdx === -1) return { roundIdx: -1, allComplete: true };

  const round    = bracket.rounds[roundIdx];
  const matchIdx = round.matches.findIndex(m => !m.played);
  const match    = round.matches[matchIdx];

  const seed  = majorSeed(schedule.season, majorIdx, roundIdx, matchIdx);
  const teamA = buildTeamObj(match.a, gameState);
  const teamB = buildTeamObj(match.b, gameState);
  const result = simMatch(teamA, teamB, seed);

  match.played = true;
  match.result = result;

  schedule.matchLog.push({
    ...result,
    stage: `${major.name} – ${round.name}`,
  });

  // If this round is fully played, wire up the next round
  const roundDone = round.matches.every(m => m.played);
  if (roundDone) {
    const winners = round.matches.map(m => m.result.winnerId);
    if (roundIdx + 1 < bracket.rounds.length) {
      const nextMatches = [];
      for (let w = 0; w < winners.length; w += 2) {
        if (w + 1 < winners.length)
          nextMatches.push({ a: winners[w], b: winners[w + 1], played: false, result: null });
      }
      bracket.rounds[roundIdx + 1].matches = nextMatches;
    } else {
      // Grand Final done → major complete
      bracket.champion = winners[0];
      major.completed  = true;
      return { roundIdx, allComplete: true };
    }
  }

  return { roundIdx, allComplete: false };
}

// ── Internal: advance season phase after a major completes ────────────────────
function _advanceMajorPhase(schedule, gameState) {
  const majorIdx = schedule.majorIdx;
  let nextState = gameState;

  // AI roster window after each regular major (not after Champs)
  if (majorIdx <= 3) nextState = runAIMajorRosterWindow(nextState, majorIdx);

  const teamIds = CDL_TEAMS.map(t => t.id);

  if (majorIdx <= 2) {
    // Major 1/2/3 → next Stage
    // Reset stageStandings now (entering new stage, not when building the bracket)
    schedule.stageStandings = initStandings(teamIds);
    schedule.phase    = "stage";
    schedule.stageIdx = majorIdx + 1;
    schedule.majorIdx = null;
    schedule.currentMatchday = 0;
  } else if (majorIdx === 3) {
    // Major 4 → Pre-Champs roster window
    schedule.stageStandings = initStandings(teamIds);
    schedule.phase    = "preChamps";
    schedule.majorIdx = null;
  } else {
    // Champs → Offseason
    schedule.phase    = "offseason";
    schedule.majorIdx = null;
  }

  return nextState;
}

// ── PUBLIC: Begin Championship (triggered by user from preChamps window) ───────
export function beginChamps(gameState) {
  const schedule = gameState.schedule;
  if (schedule.phase !== "preChamps") return gameState;

  // Champs bracket seeded by cumulative season standings.points
  schedule.phase    = "major";
  schedule.majorIdx = 4;
  schedule.majors[4].bracket = buildMajorBracket(schedule.standings);
  return { ...gameState, schedule: { ...schedule } };
}

// ── PUBLIC: Simulate one major match ──────────────────────────────────────────
export function simNextMajorMatch(gameState) {
  const schedule = gameState.schedule;
  if (schedule.phase !== "major") return gameState;

  const major = schedule.majors[schedule.majorIdx];
  if (!major || major.completed) return gameState;

  const { allComplete } = _simOneMajorMatch(schedule, gameState);
  let nextState = gameState;
  if (allComplete) nextState = _advanceMajorPhase(schedule, gameState);

  return { ...nextState, schedule: { ...schedule } };
}

// ── PUBLIC: Simulate all remaining matches in the current round ───────────────
export function simMajorRound(gameState) {
  const schedule = gameState.schedule;
  if (schedule.phase !== "major") return gameState;

  const major = schedule.majors[schedule.majorIdx];
  if (!major || major.completed) return gameState;

  // Snapshot which round we're starting in so we stop after it finishes
  let startRound = -1;
  for (let r = 0; r < major.bracket.rounds.length; r++) {
    const rnd = major.bracket.rounds[r];
    if (rnd.matches.length > 0 && rnd.matches.some(m => !m.played)) {
      startRound = r;
      break;
    }
  }
  if (startRound === -1) return gameState;

  let safety = 0;
  while (safety++ < 20) {
    const bracket = schedule.majors[schedule.majorIdx].bracket;
    const rnd     = bracket.rounds[startRound];
    if (!rnd || rnd.matches.every(m => m.played)) break;

    const { allComplete } = _simOneMajorMatch(schedule, gameState);
    if (allComplete) {
      gameState = _advanceMajorPhase(schedule, gameState);
      break;
    }
  }

  return { ...gameState, schedule: { ...schedule } };
}

// ── PUBLIC: Simulate the entire remaining bracket ─────────────────────────────
export function simMajor(gameState) {
  const schedule  = gameState.schedule;
  if (schedule.phase !== "major") return gameState;

  const targetIdx = schedule.majorIdx;
  const major     = schedule.majors[targetIdx];
  if (!major || major.completed) return gameState;

  let safety = 0;
  while (!schedule.majors[targetIdx].completed && safety++ < 100) {
    const { allComplete } = _simOneMajorMatch(schedule, gameState);
    if (allComplete) {
      gameState = _advanceMajorPhase(schedule, gameState);
      break;
    }
  }

  return { ...gameState, schedule: { ...schedule } };
}

// ── Stage simulation ───────────────────────────────────────────────────────────
export function simNextMatch(gameState) {
  const schedule = gameState.schedule;
  if (!schedule || schedule.phase !== "stage") return gameState;

  const stage    = schedule.stages[schedule.stageIdx];
  const unplayed = stage.matches.findIndex(m => !m.played);

  if (unplayed === -1) {
    // Stage done → build Major bracket from stageStandings (keep snapshot intact)
    schedule.phase    = "major";
    schedule.majorIdx = schedule.stageIdx;  // Stage N → Major N (indices align)
    schedule.majors[schedule.majorIdx].bracket = buildMajorBracket(schedule.stageStandings);
    return { ...gameState, schedule: { ...schedule } };
  }

  const match = stage.matches[unplayed];
  const seed  = schedule.season * 100_000 + schedule.stageIdx * 10_000 + unplayed;
  const teamA = buildTeamObj(match.a, gameState);
  const teamB = buildTeamObj(match.b, gameState);
  const result = simMatch(teamA, teamB, seed);

  match.played = true;
  match.result = result;

  // Update cumulative season standings
  schedule.standings[result.winnerId].wins++;
  schedule.standings[result.winnerId].points += 3;
  schedule.standings[result.loserId].losses++;
  schedule.standings[result.loserId].points += 1;

  // Update per-stage standings
  schedule.stageStandings[result.winnerId].wins++;
  schedule.stageStandings[result.winnerId].points += 3;
  schedule.stageStandings[result.loserId].losses++;
  schedule.stageStandings[result.loserId].points += 1;

  schedule.matchLog.push({ ...result, stage: stage.name });
  schedule.currentMatchday++;

  return { ...gameState, schedule: { ...schedule } };
}

export function simMatchday(gameState) {
  const schedule = gameState.schedule;
  if (!schedule || schedule.phase !== "stage") return gameState;

  const stage           = schedule.stages[schedule.stageIdx];
  const unplayedIndices = stage.matches.map((m, i) => !m.played ? i : -1).filter(i => i !== -1);

  if (unplayedIndices.length === 0) return simNextMatch(gameState);

  const usedTeams    = new Set();
  const todayIndices = [];
  for (const idx of unplayedIndices) {
    const { a, b } = stage.matches[idx];
    if (!usedTeams.has(a) && !usedTeams.has(b)) {
      todayIndices.push(idx);
      usedTeams.add(a);
      usedTeams.add(b);
    }
    if (todayIndices.length === 6) break;
  }

  if (todayIndices.length === 0) return simNextMatch(gameState);

  for (const idx of todayIndices) {
    const match  = stage.matches[idx];
    if (match.played) continue;
    const seed   = schedule.season * 100_000 + schedule.stageIdx * 10_000 + idx;
    const teamA  = buildTeamObj(match.a, gameState);
    const teamB  = buildTeamObj(match.b, gameState);
    const result = simMatch(teamA, teamB, seed);

    match.played = true;
    match.result = result;

    // Cumulative season standings
    schedule.standings[result.winnerId].wins++;
    schedule.standings[result.winnerId].points += 3;
    schedule.standings[result.loserId].losses++;
    schedule.standings[result.loserId].points += 1;

    // Per-stage standings
    schedule.stageStandings[result.winnerId].wins++;
    schedule.stageStandings[result.winnerId].points += 3;
    schedule.stageStandings[result.loserId].losses++;
    schedule.stageStandings[result.loserId].points += 1;

    schedule.matchLog.push({ ...result, stage: stage.name });
  }

  if (stage.matches.every(m => m.played)) {
    // Stage done → build bracket from stageStandings, keep snapshot intact
    schedule.phase    = "major";
    schedule.majorIdx = schedule.stageIdx;
    schedule.majors[schedule.majorIdx].bracket = buildMajorBracket(schedule.stageStandings);
  }

  schedule.currentMatchday++;
  return { ...gameState, schedule: { ...schedule } };
}

export function simStage(gameState) {
  let state = gameState;
  let safety = 0;
  while (state.schedule.phase === "stage" && safety++ < 500)
    state = simMatchday(state);
  return state;
}

// ── Simulate a matchday that always includes the user's next match ─────────────
// Used by the "Play Matchday" overlay so the user's result is guaranteed.
// Fills remaining slots with non-overlapping league matches.
export function simUserMatchday(gameState) {
  const schedule = gameState.schedule;
  if (!schedule || schedule.phase !== "stage") return gameState;

  const { userTeamId } = gameState;
  const stage      = schedule.stages[schedule.stageIdx];
  const allUnplayed = stage.matches
    .map((m, i) => (!m.played ? i : -1))
    .filter(i => i !== -1);

  if (allUnplayed.length === 0) return gameState;

  // Find the user's next unplayed match index
  const userMatchIdx = allUnplayed.find(
    i => stage.matches[i].a === userTeamId || stage.matches[i].b === userTeamId
  ) ?? -1;

  if (userMatchIdx < 0) {
    // User has no remaining matches — fall back to a normal matchday
    return simMatchday(gameState);
  }

  // Build today's batch: user's match first, then fill up to 6 with
  // non-overlapping matches from the rest of the unplayed list.
  const { a: ua, b: ub } = stage.matches[userMatchIdx];
  const usedTeams   = new Set([ua, ub]);
  const todayIndices = [userMatchIdx];

  for (const idx of allUnplayed) {
    if (idx === userMatchIdx) continue;
    const { a, b } = stage.matches[idx];
    if (!usedTeams.has(a) && !usedTeams.has(b)) {
      todayIndices.push(idx);
      usedTeams.add(a);
      usedTeams.add(b);
    }
    if (todayIndices.length === 6) break;
  }

  // Simulate each match in the batch
  for (const idx of todayIndices) {
    const match  = stage.matches[idx];
    if (match.played) continue;
    const seed   = schedule.season * 100_000 + schedule.stageIdx * 10_000 + idx;
    const teamA  = buildTeamObj(match.a, gameState);
    const teamB  = buildTeamObj(match.b, gameState);
    const result = simMatch(teamA, teamB, seed);

    match.played = true;
    match.result = result;

    schedule.standings[result.winnerId].wins++;
    schedule.standings[result.winnerId].points += 3;
    schedule.standings[result.loserId].losses++;
    schedule.standings[result.loserId].points += 1;

    schedule.stageStandings[result.winnerId].wins++;
    schedule.stageStandings[result.winnerId].points += 3;
    schedule.stageStandings[result.loserId].losses++;
    schedule.stageStandings[result.loserId].points += 1;

    schedule.matchLog.push({ ...result, stage: stage.name });
  }

  // If stage is now complete, advance to major phase
  if (stage.matches.every(m => m.played)) {
    schedule.phase    = "major";
    schedule.majorIdx = schedule.stageIdx;
    schedule.majors[schedule.majorIdx].bracket = buildMajorBracket(schedule.stageStandings);
  }

  schedule.currentMatchday++;
  return { ...gameState, schedule: { ...schedule } };
}

// ── Offseason ─────────────────────────────────────────────────────────────────
export function advanceOffseason(gameState) {
  const standings      = gameState.schedule?.standings ?? {};
  const newSeason      = (gameState.schedule?.season ?? 1) + 1;
  const outgoingSeason = gameState.schedule?.season ?? 1;
  const matchLog       = gameState.schedule?.matchLog ?? [];

  // Accumulate this season's matchLog into per-player season stats before wiping
  const playerSeasonStats = { ...(gameState.playerSeasonStats ?? {}) };
  for (const result of matchLog) {
    if (!result.playerStats) continue;
    for (const [playerId, stats] of Object.entries(result.playerStats)) {
      if (!playerSeasonStats[playerId]) playerSeasonStats[playerId] = [];
      let entry = playerSeasonStats[playerId].find(e => e.season === outgoingSeason);
      if (!entry) {
        entry = { season: outgoingSeason, kills: 0, deaths: 0, matches: 0 };
        playerSeasonStats[playerId].push(entry);
      }
      entry.kills   += stats.kills  ?? 0;
      entry.deaths  += stats.deaths ?? 0;
      entry.matches += 1;
    }
  }

  // Age up all players and prospects, reset form
  const agedPlayers = (gameState.players || []).map(p => ({
    ...p,
    age:        (p.age || 18) + 1,
    experience: (p.experience || 0) + 1,
    form:       70,
  }));

  const agedProspects = (gameState.prospects || []).map(p => ({
    ...p,
    age:        (p.age || 18) + 1,
    experience: (p.experience || 0),
    form:       65,
  }));

  // Run progression/regression on the aged players
  const { updatedPlayers, updatedProspects, progressionLog } =
    runProgression(agedPlayers, agedProspects, standings, newSeason);

  const withProgression = {
    ...gameState,
    players:          updatedPlayers,
    prospects:        updatedProspects,
    progressionLog,
    playerSeasonStats,
    schedule:         buildSeason(newSeason),
    season:           newSeason,
  };

  return runAIOffseasonRosterWindow(withProgression);
}

// ── Helper ────────────────────────────────────────────────────────────────────
function buildTeamObj(teamId, gameState) {
  const meta    = CDL_TEAMS.find(t => t.id === teamId) ?? { id: teamId, name: teamId };
  const players = (gameState.players || []).filter(p => p.teamId === teamId);
  return { id: meta.id, name: meta.name, players };
}
