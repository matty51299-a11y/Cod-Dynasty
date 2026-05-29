import { buildInitialRoster } from "../src/data/players.js";
import { generateProspects } from "../src/data/prospects.js";
import { applyChallengerRatingOverride, normalizePlayerName } from "../src/data/challengerRatingOverrides.js";
import {
  buildSeason,
  continueFromChallengerQualifier,
  ensureChallengerTeams,
  simChallengerQualifier,
  simMajor,
  simStage,
} from "../src/engine/seasonEngine.js";
import { ensureCdlRosterIntegrity } from "../src/engine/rosterAI.js";

globalThis.__CLM_DEBUG_CHALLENGER_TX__ = true;

function newGame(seed = 12345) {
  const players = buildInitialRoster().map(applyChallengerRatingOverride);
  const seen = new Set();
  const prospects = generateProspects(seed)
    .map(applyChallengerRatingOverride)
    .filter((player) => {
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
  ensureChallengerTeams(state);
  return ensureCdlRosterIntegrity(state, { windowType: "diagnose_ui_new_game" });
}

function cloneForReducerAction(state) {
  // The reducer passes shallow copies into engine actions. Match that behavior
  // rather than using a deep-cloned helper-only state.
  return { ...state };
}

function txCount(state) {
  return state?.challengerTransactions?.length ?? 0;
}

function print(label, state) {
  console.log(`${label}: tx=${txCount(state)} phase=${state.schedule?.phase} majorIdx=${state.schedule?.majorIdx}`);
}

function finishNextMajor(state, majorNumber) {
  state = simStage(cloneForReducerAction(state));
  print(`Major ${majorNumber} after SIM_STAGE/reducer final state`, state);

  if (state.schedule?.phase === "challengerQualifier") {
    state = simChallengerQualifier(cloneForReducerAction(state));
    print(`Major ${majorNumber} after SIM_CHALLENGER_QUALIFIER/reducer final state`, state);
    state = continueFromChallengerQualifier(cloneForReducerAction(state));
    print(`Major ${majorNumber} after CONTINUE_FROM_CHALLENGER_QUALIFIER/reducer final state`, state);
  }

  console.log(`Major ${majorNumber} transaction count before Major completion: ${txCount(state)}`);
  state = simMajor(cloneForReducerAction(state));
  print(`Major ${majorNumber} after SIM_MAJOR/reducer final state`, state);
  console.log(`Major ${majorNumber} transaction count seen by Prospects.jsx: ${txCount(state)}`);

  const persisted = JSON.parse(JSON.stringify(state));
  print(`Major ${majorNumber} after localStorage JSON round-trip`, persisted);
  return persisted;
}

let state = newGame();
print("Fresh new game", state);
state = finishNextMajor(state, 1);
state = finishNextMajor(state, 2);

const latest = (state.challengerTransactions || []).slice(-10).reverse();
console.log("Latest Moves sample:");
for (const tx of latest) {
  console.log(`- S${tx.season} M${Number(tx.majorIdx) + 1}: ${tx.type} ${tx.playerName}`);
}

if (!state.challengerTransactions?.length) {
  throw new Error("Expected UI action path to preserve challengerTransactions after finishing majors.");
}
