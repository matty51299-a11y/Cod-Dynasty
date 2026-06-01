// scripts/testBoardLifecycle.mjs
// Verifies the Board Objectives lifecycle over a full simulated season:
//   generate → per-Major confidence nudge → season-end review.
// Confirms objectives evaluate to terminal states at season end and that the
// board review produces a verdict without crashing.
//
// Run with:
//   node --loader ./scripts/asset-loader.mjs scripts/testBoardLifecycle.mjs

import { buildInitialRoster } from "../src/data/players.js";
import { generateProspects } from "../src/data/prospects.js";
import { applyChallengerRatingOverride } from "../src/data/challengerRatingOverrides.js";
import { CDL_TEAMS } from "../src/data/teams.js";
import {
  buildSeason, ensureChallengerTeams, beginChamps,
  simStage, simMajor, simChallengerQualifier, continueFromChallengerQualifier,
} from "../src/engine/seasonEngine.js";
import { ensureCdlRosterIntegrity } from "../src/engine/rosterAI.js";
import {
  buildBoardObjectives, migrateBoardState, nudgeConfidenceAfterMajor,
  runBoardReview, isMetStatus, BOARD_OBJ_VERSION,
} from "../src/engine/boardEngine.js";

function newGame(teamId) {
  const players = buildInitialRoster().map(applyChallengerRatingOverride);
  const prospects = generateProspects(424242).map(applyChallengerRatingOverride);
  const state = {
    userTeamId: teamId, season: 1, players, prospects,
    schedule: buildSeason(1), notifications: [], feed: [],
    playerSeasonStats: {}, playerOvrHistory: {}, retiredPlayers: [],
    challengersLog: [], challengerTransactions: [], seasonHistory: [],
    boardState: migrateBoardState(null), pendingBoardReview: null,
  };
  ensureChallengerTeams(state);
  const s = ensureCdlRosterIntegrity(state, { windowType: "test_board_new_game" });
  const { objectives, meta } = buildBoardObjectives(s);
  s.boardState = { ...s.boardState, objectives, meta, version: BOARD_OBJ_VERSION };
  return s;
}

function simSeason(teamId) {
  let state = newGame(teamId);
  let steps = 0;
  let nudges = 0;
  while (state.schedule.phase !== "offseason" && steps++ < 200) {
    const phase = state.schedule.phase;
    if (phase === "stage") {
      state = simStage({ ...state });
    } else if (phase === "challengerQualifier") {
      state = simChallengerQualifier({ ...state });
      if (state.schedule.currentChallengerQualifier?.completed) {
        state = continueFromChallengerQualifier({ ...state });
      }
    } else if (phase === "major") {
      const majorIdx = state.schedule.majorIdx;
      state = simMajor({ ...state });
      // Mirror the reducer's withMajorBoardNudge for regular Majors.
      if (majorIdx != null && majorIdx <= 3 && state.schedule.majors?.[majorIdx]?.completed) {
        const nudged = nudgeConfidenceAfterMajor(state.boardState, state, majorIdx);
        if (nudged.confidence !== state.boardState.confidence) nudges++;
        state = { ...state, boardState: nudged };
      }
    } else if (phase === "preChamps") {
      state = beginChamps({ ...state });
    } else {
      throw new Error(`Unexpected phase ${phase}`);
    }
  }
  return { state, nudges };
}

console.log("\n=== BOARD LIFECYCLE TEST ===\n");
let failures = 0;

for (const team of CDL_TEAMS) {
  const { state, nudges } = simSeason(team.id);
  const { newBoardState, pendingBoardReview } = runBoardReview(state.boardState, state);

  const objs = pendingBoardReview.objectives;
  const nonTerminal = objs.filter(o => !(isMetStatus(o.status) || o.status === "failed"));
  const primary = objs.find(o => o.weight === "primary");

  const problems = [];
  if (!pendingBoardReview.verdict) problems.push("no verdict");
  if (nonTerminal.length) problems.push(`non-terminal objectives at season end: ${nonTerminal.map(o => `${o.label}=${o.status}`).join(", ")}`);
  if (typeof newBoardState.confidence !== "number" || newBoardState.confidence < 0 || newBoardState.confidence > 100) problems.push(`bad confidence ${newBoardState.confidence}`);

  const flag = problems.length ? "✗" : "✓";
  if (problems.length) failures++;
  console.log(`${flag} ${team.tag.padEnd(5)} primary "${primary?.label}" → ${primary?.status}; verdict ${pendingBoardReview.verdict}; conf ${pendingBoardReview.confidenceBefore}→${pendingBoardReview.confidenceAfter} (Δ${pendingBoardReview.delta}); majorNudges ${nudges}`);
  if (problems.length) console.log(`      ${problems.join("\n      ")}`);
}

console.log("");
if (failures === 0) console.log("✓ Board lifecycle passed for all 12 teams.\n");
else console.log(`✗ ${failures} team(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
