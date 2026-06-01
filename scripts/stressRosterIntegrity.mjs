import { buildInitialRoster } from "../src/data/players.js";
import { generateProspects } from "../src/data/prospects.js";
import { applyChallengerRatingOverride } from "../src/data/challengerRatingOverrides.js";
import { CDL_TEAMS } from "../src/data/teams.js";
import { buildSeason, beginChamps, ensureChallengerTeams, simMajor, simMajorRound, simNextMajorMatch, simMatchday, simStage, simChallengerQualifier, simChallengerQualifierRound, simNextChallengerQualifierMatch, continueFromChallengerQualifier, enterContractPhase, advanceOffseason } from "../src/engine/seasonEngine.js";
import { ensureCdlRosterIntegrity } from "../src/engine/rosterAI.js";
import { isInactivePlayer, normalizePlayerName } from "../src/utils/playerIdentity.js";

function rngFromSeed(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

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
  return ensureCdlRosterIntegrity(state, { windowType: "stress_new_game" });
}

function activeRoster(state, teamId) {
  return (state.players || []).filter(p => p.teamId === teamId && !p.isSub && !isInactivePlayer(p));
}

function validate(state, label) {
  const ids = new Set();
  const names = new Set();
  const problems = [];
  for (const team of CDL_TEAMS) {
    const roster = activeRoster(state, team.id);
    if (team.id !== state.userTeamId && roster.length < 4 && !state.offseason?.freeAgencyOpen) problems.push(`${label}: ${team.id} has ${roster.length} active CDL players`);
    for (const p of roster) {
      const key = normalizePlayerName(p.name);
      if (ids.has(p.id)) problems.push(`${label}: duplicate active player id ${p.id}`);
      if (names.has(key)) problems.push(`${label}: duplicate active player name ${p.name}`);
      ids.add(p.id);
      names.add(key);
      if (p.challengerTeamId) problems.push(`${label}: ${p.name} is listed on CDL and Challengers`);
      if (p.status && p.status !== "cdl") problems.push(`${label}: ${p.name} has non-CDL status ${p.status}`);
    }
  }
  if (problems.length) throw new Error(problems.join("\n"));
}

function runAction(state, label, fn) {
  validate(state, `${label}:before`);
  const next = fn(state);
  validate(next, `${label}:after`);
  return next;
}

function exhaustMarketRegression() {
  let state = newGame("lat", 777);
  const torontoKeep = activeRoster(state, "toronto").slice(0, 3).map(p => p.id);
  state = {
    ...state,
    players: state.players
      .filter(p => (p.teamId && p.teamId !== "toronto") || torontoKeep.includes(p.id))
      .map(p => torontoKeep.includes(p.id) ? { ...p, teamId: "toronto", isSub: false } : p),
    prospects: [],
    challengerTeams: (state.challengerTeams || []).map(t => ({ ...t, playerIds: [] })),
  };
  const { state: repaired, repairs } = ensureCdlRosterIntegrity(state, { windowType: "market_exhausted_regression", returnRepairs: true });
  validate(repaired, "market_exhausted_regression");
  const generated = repairs.filter(r => r.type === "generated_emergency_replacement").length;
  if (generated < 1) throw new Error("market_exhausted_regression did not generate an emergency replacement");
  return generated;
}

function runSimulation(teamId, seed) {
  let state = newGame(teamId, seed);
  const rng = rngFromSeed(seed + 9001);
  validate(state, `${teamId}/${seed}:start`);
  let steps = 0;
  while (state.season < 4 && steps++ < 1400) {
    const phase = state.schedule.phase;
    const style = Math.floor(rng() * 4);
    if (phase === "stage") {
      state = runAction(state, `${teamId}/${seed}:stage:${state.season}:${steps}`, style === 0 ? simStage : simMatchday);
    } else if (phase === "challengerQualifier") {
      const fn = style === 0 ? simChallengerQualifier : style === 1 ? simChallengerQualifierRound : simNextChallengerQualifierMatch;
      state = runAction(state, `${teamId}/${seed}:qualifier:${state.season}:${steps}`, fn);
      if (state.schedule.currentChallengerQualifier?.completed) {
        state = runAction(state, `${teamId}/${seed}:continueQualifier:${state.season}:${steps}`, continueFromChallengerQualifier);
      }
    } else if (phase === "major") {
      const fn = style === 0 ? simMajor : style === 1 ? simMajorRound : simNextMajorMatch;
      state = runAction(state, `${teamId}/${seed}:major:${state.season}:${steps}`, fn);
    } else if (phase === "preChamps") {
      state = runAction(state, `${teamId}/${seed}:beginChamps:${state.season}:${steps}`, beginChamps);
    } else if (phase === "offseason") {
      state = state.offseason?.freeAgencyOpen
        ? runAction(state, `${teamId}/${seed}:aiFreeAgency:${state.season}:${steps}`, advanceOffseason)
        : runAction(state, `${teamId}/${seed}:contracts:${state.season}:${steps}`, enterContractPhase);
    } else if (phase === "contracts") {
      state = runAction(state, `${teamId}/${seed}:advanceOffseason:${state.season}:${steps}`, advanceOffseason);
    } else {
      throw new Error(`Unknown phase ${phase}`);
    }
  }
  if (state.season < 4) throw new Error(`${teamId}/${seed} did not reach Season 4 within safety limit`);
  validate(state, `${teamId}/${seed}:final`);
  return state;
}

const selectedTeams = CDL_TEAMS.map(t => t.id);
const seeds = [11, 23]; // 12 teams × 2 seeds = 24 multi-season simulations
let runs = 0;
for (const teamId of selectedTeams) {
  for (const seed of seeds) {
    runSimulation(teamId, seed);
    runs++;
    console.log(`  passed ${runs}/24: ${teamId} seed ${seed}`);
  }
}
const generated = exhaustMarketRegression();
console.log(`Roster integrity stress passed: ${runs} runs reached Season 4 with AI CDL rosters >= 4 active players; user-managed teams may be temporarily thin.`);
console.log(`Emergency market-exhaustion regression generated ${generated} replacement(s) and remained valid.`);
