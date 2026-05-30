import assert from "node:assert/strict";
import { buildInitialRoster } from "../src/data/players.js";
import { generateProspects } from "../src/data/prospects.js";
import { applyChallengerRatingOverride, normalizePlayerName } from "../src/data/challengerRatingOverrides.js";
import { CDL_TEAMS } from "../src/data/teams.js";
import {
  buildSeason,
  buildChallengerRostersForNewGame,
  debugMajorBracketState,
  ensureChallengerTeams,
  simChallengerQualifier,
  continueFromChallengerQualifier,
  simMajor,
  simStage,
} from "../src/engine/seasonEngine.js";

function newGame(seed = 12345) {
  const players = buildInitialRoster().map(applyChallengerRatingOverride);
  const rawProspects = generateProspects(seed).map(applyChallengerRatingOverride);
  const seen = new Set();
  const prospects = rawProspects.filter((player) => {
    const key = normalizePlayerName(player.name);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const state = {
    userTeamId: "atlanta_faze",
    season: 1,
    players,
    prospects,
    schedule: buildSeason(1),
    notifications: [],
    feed: [],
    saveExists: true,
    enteredMajorIdx: null,
    playerSeasonStats: {},
    playerOvrHistory: {},
    challengersLog: [],
    challengerTransactions: [],
  };
  buildChallengerRostersForNewGame(state, seed);
  return state;
}

// Advance through challengerQualifier phase if needed, then into major phase.
function simThroughQualifier(state) {
  if (state.schedule.phase === "challengerQualifier") {
    state = simChallengerQualifier(state);
    state = continueFromChallengerQualifier(state);
  }
  return state;
}

function cdlPoints(standings) {
  return Object.fromEntries(CDL_TEAMS.map(team => [team.id, standings[team.id]?.points ?? 0]));
}

function pointDelta(before, after) {
  return Object.fromEntries(CDL_TEAMS.map(team => [team.id, (after[team.id] ?? 0) - (before[team.id] ?? 0)]));
}

function assertFinishedMajor(state, majorIdx, beforeMajorPoints) {
  const major = state.schedule.majors[majorIdx];
  const debug = debugMajorBracketState(major, state);
  assert.notEqual(state.schedule.phase, "major", `Major ${majorIdx + 1} should advance out of major phase`);
  assert.equal(major.completed, true, `Major ${majorIdx + 1} should be marked completed`);
  assert.ok(major.bracket?.champion, `Major ${majorIdx + 1} should record a champion`);
  assert.equal(debug.pendingMatchesWithBothTeams.length, 0, `Major ${majorIdx + 1} should have no unplayed ready matches`);
  assert.equal(debug.blockedMatches.length, 0, `Major ${majorIdx + 1} should have no blocked created matches`);
  assert.equal(debug.invalidTeamMatches.length, 0, `Major ${majorIdx + 1} should have no invalid team ids`);
  assert.equal(major.pointsAwarded, true, `Major ${majorIdx + 1} should award placement points`);
  assert.ok((major.pointsAwards || []).every(award => CDL_TEAMS.some(team => team.id === award.teamId)), `Major ${majorIdx + 1} points should only go to CDL teams`);

  const afterMajorPoints = cdlPoints(state.schedule.standings);
  const firstDelta = pointDelta(beforeMajorPoints, afterMajorPoints);
  const replayState = simMajor(state);
  const replayPoints = cdlPoints(replayState.schedule.standings);
  assert.deepEqual(replayPoints, afterMajorPoints, `Major ${majorIdx + 1} placement points should not double-award`);

  return {
    major: majorIdx + 1,
    phase: state.schedule.phase,
    nextStageIdx: state.schedule.stageIdx,
    champion: major.bracket.champion,
    totalMatches: debug.totalMatches,
    completedMatches: debug.completedMatches,
    blockedMatches: debug.blockedMatches.length,
    invalidTeamMatches: debug.invalidTeamMatches.length,
    pointAwards: major.pointsAwards,
    cdlPointDelta: firstDelta,
  };
}

let state = newGame();
const summaries = [];

state = simStage(state);
// Stage completes → challengerQualifier phase, then → major
state = simThroughQualifier(state);
assert.equal(state.schedule.phase, "major", "Stage 1 should feed Major 1");
assert.equal(debugMajorBracketState(state.schedule.majors[0], state).bracketType, "DE16", "Major 1 should use DE16");
let beforePoints = cdlPoints(state.schedule.standings);
state = simMajor(state);
summaries.push(assertFinishedMajor(state, 0, beforePoints));

state = simStage(state);
state = simThroughQualifier(state);
assert.equal(state.schedule.phase, "major", "Stage 2 should feed Major 2");
assert.equal(debugMajorBracketState(state.schedule.majors[1], state).bracketType, "DE16", "Major 2 should use DE16");
assert.ok(state.schedule.majors[1].bracket.seeds.some(id => !CDL_TEAMS.some(team => team.id === id)), "Major 2 should include Challenger qualifier IDs");
beforePoints = cdlPoints(state.schedule.standings);
state = simMajor(state);
summaries.push(assertFinishedMajor(state, 1, beforePoints));

console.log(JSON.stringify({ ok: true, summaries }, null, 2));
