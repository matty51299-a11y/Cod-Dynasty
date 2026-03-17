// src/engine/seasonEngine.js
// Drives the CDL season structure:
//   Stage 1 (Regular) → Major 1 → Stage 2 → Major 2 → Championship
//
// Each stage is a round-robin group play where every team plays each other once.
// Majors are single-elimination brackets using stage standings.
//
// This engine mutates the gameState passed in and returns it.

import { simMatch } from "./matchSim.js";
import { CDL_TEAMS } from "../data/teams.js";

// Build all unique matchups from a team list (round-robin)
function buildRoundRobin(teamIds) {
  const pairs = [];
  for (let i = 0; i < teamIds.length; i++) {
    for (let j = i + 1; j < teamIds.length; j++) {
      pairs.push([teamIds[i], teamIds[j]]);
    }
  }
  return pairs;
}

// Shuffle array with seeded rng
function shuffle(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function seededRng(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

// Initialise blank standings for a list of team ids
export function initStandings(teamIds) {
  return Object.fromEntries(teamIds.map(id => [id, { wins: 0, losses: 0, points: 0 }]));
}

// Build a fresh season schedule
export function buildSeason(season) {
  const teamIds = CDL_TEAMS.map(t => t.id);
  const rng = seededRng(season * 9999 + 1);

  const stage1 = shuffle(buildRoundRobin(teamIds), rng);
  const stage2 = shuffle(buildRoundRobin(teamIds), rng);

  return {
    season,
    stages: [
      { name: "Stage 1", matches: stage1.map(([a, b]) => ({ a, b, played: false, result: null })) },
      { name: "Stage 2", matches: stage2.map(([a, b]) => ({ a, b, played: false, result: null })) },
    ],
    majors: [
      { name: "Major 1", bracket: null, completed: false },
      { name: "Major 2", bracket: null, completed: false },
      { name: "Championship", bracket: null, completed: false },
    ],
    standings: initStandings(teamIds),
    currentStage: 0,       // 0 = Stage 1, 1 = Stage 2
    currentMatchday: 0,    // index into current stage matches
    phase: "stage",        // "stage" | "major" | "offseason"
    matchLog: [],          // all played match results
  };
}

// Play the next unplayed match in the current stage
export function simNextMatch(gameState) {
  const schedule = gameState.schedule;
  if (!schedule || schedule.phase === "offseason") return gameState;

  const stage = schedule.stages[schedule.currentStage];
  const unplayed = stage.matches.findIndex(m => !m.played);

  if (unplayed === -1) {
    // Stage finished – advance to major
    schedule.phase = "major";
    schedule.majors[schedule.currentStage].bracket = buildMajorBracket(schedule.standings, gameState.players);
    return gameState;
  }

  const match = stage.matches[unplayed];
  const seed = schedule.season * 100000 + schedule.currentStage * 10000 + unplayed;

  const teamA = buildTeamObj(match.a, gameState);
  const teamB = buildTeamObj(match.b, gameState);

  const result = simMatch(teamA, teamB, seed);
  match.played = true;
  match.result = result;

  // Update standings
  const s = schedule.standings;
  s[result.winnerId].wins++;
  s[result.winnerId].points += 3;
  s[result.loserId].losses++;
  s[result.loserId].points += 1;

  schedule.matchLog.push({ ...result, stage: stage.name });
  schedule.currentMatchday++;

  return { ...gameState, schedule: { ...schedule } };
}

// Simulate a full matchday (12 teams = 6 matches per day, no team plays twice)
export function simMatchday(gameState) {
  const schedule = gameState.schedule;
  if (!schedule || schedule.phase !== "stage") return gameState;

  const stage = schedule.stages[schedule.currentStage];
  const unplayedIndices = stage.matches
    .map((m, i) => (!m.played ? i : -1))
    .filter(i => i !== -1);

  if (unplayedIndices.length === 0) return simNextMatch(gameState);

  // Greedily pick 6 non-overlapping matches for today
  const usedTeams = new Set();
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

  if (todayIndices.length === 0) {
    // Leftover matches that couldn't pair cleanly – just play first unplayed
    return simNextMatch(gameState);
  }

  let state = gameState;
  for (const idx of todayIndices) {
    const match = schedule.stages[schedule.currentStage].matches[idx];
    if (match.played) continue;

    const seed = schedule.season * 100000 + schedule.currentStage * 10000 + idx;
    const teamA = buildTeamObj(match.a, state);
    const teamB = buildTeamObj(match.b, state);
    const result = simMatch(teamA, teamB, seed);

    match.played = true;
    match.result = result;

    const s = schedule.standings;
    s[result.winnerId].wins++;
    s[result.winnerId].points += 3;
    s[result.loserId].losses++;
    s[result.loserId].points += 1;

    schedule.matchLog.push({ ...result, stage: schedule.stages[schedule.currentStage].name });
  }

  // Check if stage done
  const allDone = stage.matches.every(m => m.played);
  if (allDone) {
    schedule.phase = "major";
    schedule.majors[schedule.currentStage].bracket = buildMajorBracket(schedule.standings, state.players);
  }

  schedule.currentMatchday++;
  return { ...state, schedule: { ...schedule } };
}

// Simulate the entire remaining stage
export function simStage(gameState) {
  let state = gameState;
  let safety = 0;
  while (state.schedule.phase === "stage" && safety++ < 500) {
    state = simMatchday(state);
  }
  return state;
}

// ── MAJOR BRACKET ─────────────────────────────────────────────────────────────

// Build a single-elimination bracket from top 8 teams by standings points
function buildMajorBracket(standings, players) {
  const sorted = Object.entries(standings)
    .sort((a, b) => b[1].points - a[1].points)
    .slice(0, 8)
    .map(([id]) => id);

  // [1v8, 2v7, 3v6, 4v5]
  return {
    rounds: [
      {
        name: "Quarterfinals",
        matches: [
          { a: sorted[0], b: sorted[7], played: false, result: null },
          { a: sorted[1], b: sorted[6], played: false, result: null },
          { a: sorted[2], b: sorted[5], played: false, result: null },
          { a: sorted[3], b: sorted[4], played: false, result: null },
        ],
      },
      { name: "Semifinals", matches: [] },
      { name: "Grand Final",  matches: [] },
    ],
    completed: false,
    champion: null,
  };
}

// Play through an entire major bracket (single-elim, best of 5 each match)
export function simMajor(gameState) {
  const schedule = gameState.schedule;
  if (schedule.phase !== "major") return gameState;

  const majorIdx = schedule.currentStage;
  const major = schedule.majors[majorIdx];
  if (!major || major.completed) return gameState;

  const bracket = major.bracket;
  let seed = schedule.season * 200000 + majorIdx * 50000;

  // Sim each round
  for (let r = 0; r < bracket.rounds.length; r++) {
    const round = bracket.rounds[r];
    const winners = [];

    for (const match of round.matches) {
      if (match.played) {
        winners.push(match.result.winnerId);
        continue;
      }
      const teamA = buildTeamObj(match.a, gameState);
      const teamB = buildTeamObj(match.b, gameState);
      const result = simMatch(teamA, teamB, seed++);
      match.played = true;
      match.result = result;
      winners.push(result.winnerId);

      schedule.matchLog.push({
        ...result,
        stage: `${schedule.majors[majorIdx].name} – ${round.name}`,
      });
    }

    // Set up next round
    if (r + 1 < bracket.rounds.length) {
      const nextMatches = [];
      for (let w = 0; w < winners.length; w += 2) {
        if (w + 1 < winners.length) {
          nextMatches.push({ a: winners[w], b: winners[w + 1], played: false, result: null });
        }
      }
      bracket.rounds[r + 1].matches = nextMatches;
    } else {
      bracket.champion = winners[0];
    }
  }

  major.completed = true;

  // Advance phase
  if (majorIdx < 2) {
    // Move to next stage (or Stage 2 → Major 2 → Championship)
    if (majorIdx === 0) {
      schedule.phase = "stage";
      schedule.currentStage = 1;
      schedule.currentMatchday = 0;
    } else if (majorIdx === 1) {
      // Both stages and majors done → championship bracket already set
      schedule.phase = "major";
      schedule.currentStage = 2;
      schedule.majors[2].bracket = buildMajorBracket(schedule.standings, gameState.players);
    }
  } else {
    schedule.phase = "offseason";
  }

  return { ...gameState, schedule: { ...schedule } };
}

// ── OFFSEASON ─────────────────────────────────────────────────────────────────

// Advance to a new season: increment experience, age players, reset schedule
export function advanceOffseason(gameState) {
  const players = gameState.players.map(p => ({
    ...p,
    age: p.age + 1,
    experience: p.experience + 1,
    form: 70,                               // reset form to neutral
    // Slight natural development for young players
    overall: p.age < 23 ? Math.min(p.potential, p.overall + Math.floor(Math.random() * 3)) : p.overall,
  }));

  const newSeason = (gameState.schedule?.season ?? 1) + 1;

  return {
    ...gameState,
    players,
    schedule: buildSeason(newSeason),
    season: newSeason,
  };
}

// ── HELPERS ───────────────────────────────────────────────────────────────────

// Build the { id, name, players } object that simMatch expects
function buildTeamObj(teamId, gameState) {
  const meta = CDL_TEAMS.find(t => t.id === teamId) ?? { id: teamId, name: teamId };
  const players = (gameState.players || []).filter(p => p.teamId === teamId);
  return { id: meta.id, name: meta.name, players };
}
