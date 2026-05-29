// Stress test: run many full seasons (multiple teams, different seeds, sim
// every action path) and report any uncaught TypeError.
import { buildInitialRoster } from "../src/data/players.js";
import { generateProspects } from "../src/data/prospects.js";
import { applyChallengerRatingOverride } from "../src/data/challengerRatingOverrides.js";
import { normalizePlayerName } from "../src/utils/playerIdentity.js";
import { CDL_TEAMS } from "../src/data/teams.js";
import {
  buildSeason,
  beginChamps,
  ensureChallengerTeams,
  simMajor,
  simStage,
  simMatchday,
  simNextMajorMatch,
  simMajorRound,
  simChallengerQualifier,
  simNextChallengerQualifierMatch,
  simChallengerQualifierRound,
  continueFromChallengerQualifier,
  advanceOffseason,
  enterContractPhase,
} from "../src/engine/seasonEngine.js";

function newGame(teamId, seed) {
  const players = buildInitialRoster().map(applyChallengerRatingOverride);
  const rawProspects = generateProspects(seed).map(applyChallengerRatingOverride);
  const seen = new Set();
  const prospects = rawProspects.filter((p) => {
    const key = normalizePlayerName(p.name);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const state = {
    userTeamId: teamId,
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
  return state;
}

function pickPath(rng) {
  // Random sim style — exercise different code paths.
  return Math.floor(rng() * 4);
}

function rngFromSeed(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

const crashes = [];

function tryAction(label, state, fn) {
  try {
    return fn(state);
  } catch (err) {
    crashes.push({
      label, message: err.message, stack: err.stack?.split("\n").slice(0, 6).join("\n"),
      phase: state.schedule?.phase, majorIdx: state.schedule?.majorIdx, stageIdx: state.schedule?.stageIdx, season: state.season,
    });
    throw err;
  }
}

function runSeason(teamId, seed) {
  let state = newGame(teamId, seed);
  const rng = rngFromSeed(seed + 7777);

  for (let step = 0; step < 800; step++) {
    const phase = state.schedule.phase;

    if (phase === "stage") {
      const style = pickPath(rng);
      if (style === 0) state = tryAction(`simStage[${teamId}]`, state, simStage);
      else if (style === 1) state = tryAction(`simMatchday[${teamId}]`, state, simMatchday);
      else state = tryAction(`simMatchday[${teamId}]`, state, simMatchday);
    } else if (phase === "challengerQualifier") {
      const style = pickPath(rng);
      if (style === 0) state = tryAction(`simChallengerQualifier[${teamId}]`, state, simChallengerQualifier);
      else if (style === 1) state = tryAction(`simChallengerQualifierRound[${teamId}]`, state, simChallengerQualifierRound);
      else state = tryAction(`simNextChallengerQualifierMatch[${teamId}]`, state, simNextChallengerQualifierMatch);

      if (state.schedule.currentChallengerQualifier?.completed) {
        state = tryAction(`continueFromChallengerQualifier[${teamId}]`, state, continueFromChallengerQualifier);
      }
    } else if (phase === "major") {
      const style = pickPath(rng);
      if (style === 0) state = tryAction(`simMajor[${teamId}]`, state, simMajor);
      else if (style === 1) state = tryAction(`simMajorRound[${teamId}]`, state, simMajorRound);
      else state = tryAction(`simNextMajorMatch[${teamId}]`, state, simNextMajorMatch);
    } else if (phase === "preChamps") {
      state = tryAction(`beginChamps[${teamId}]`, state, beginChamps);
    } else if (phase === "offseason") {
      state = tryAction(`enterContractPhase[${teamId}]`, state, enterContractPhase);
    } else if (phase === "contracts") {
      state = tryAction(`advanceOffseason[${teamId}]`, state, advanceOffseason);
      if (state.season > 2) return state;
    } else {
      console.error("unknown phase", phase);
      break;
    }
  }
  return state;
}

const teams = CDL_TEAMS.map(t => t.id);
const seeds = [1, 17, 42, 99, 137, 314, 1024, 9001, 55555, 88888];

let runs = 0;
outer: for (const teamId of teams) {
  for (const seed of seeds) {
    runs++;
    try {
      runSeason(teamId, seed);
    } catch {
      console.log(`run ${teamId}/${seed} crashed`);
      break outer;
    }
  }
}

console.log(`Completed ${runs} runs. Crashes: ${crashes.length}`);
for (const c of crashes) {
  console.log("---");
  console.log(JSON.stringify(c, null, 2));
}
process.exit(crashes.length ? 1 : 0);
