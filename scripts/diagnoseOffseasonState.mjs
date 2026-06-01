import { buildInitialRoster } from "../src/data/players.js";
import { generateProspects } from "../src/data/prospects.js";
import { applyChallengerRatingOverride } from "../src/data/challengerRatingOverrides.js";
import { CDL_TEAMS } from "../src/data/teams.js";
import { buildSeason, enterContractPhase, advanceOffseason, ensureChallengerTeams } from "../src/engine/seasonEngine.js";
import { ensureCdlRosterIntegrity, getResignDemand, getSigningCost, getTeamCap } from "../src/engine/rosterAI.js";
import { isInactivePlayer, normalizePlayerName } from "../src/utils/playerIdentity.js";

function section(title) {
  console.log(`\n=== ${title} ===`);
}

function activeStarters(state, teamId) {
  return (state.players || []).filter(p => p.teamId === teamId && !p.isSub && !isInactivePlayer(p));
}

function freeAgents(state) {
  return (state.players || []).filter(p => !p.teamId && p.status === "freeAgent" && !isInactivePlayer(p));
}

function duplicateProblems(state) {
  const ids = new Set();
  const names = new Set();
  const problems = [];
  for (const p of state.players || []) {
    if (!p.teamId || p.isSub || isInactivePlayer(p)) continue;
    const key = normalizePlayerName(p.name);
    if (ids.has(p.id)) problems.push(`duplicate active id: ${p.id}`);
    if (names.has(key)) problems.push(`duplicate active name: ${p.name}`);
    ids.add(p.id);
    names.add(key);
  }
  for (const p of state.players || []) {
    if (p.status === "freeAgent" && p.teamId) problems.push(`${p.name} is freeAgent with teamId ${p.teamId}`);
    if (!p.teamId && p.status === "cdl") problems.push(`${p.name} is cdl with no teamId`);
  }
  return problems;
}

function byPreviousTeam(rows) {
  return rows.reduce((acc, p) => {
    const key = p.previousTeamId || "unsigned";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function makeState(userTeamId = "optic") {
  const rosterOrderByTeam = new Map();
  const players = buildInitialRoster().map(applyChallengerRatingOverride).map(p => {
    if (!p.teamId) return { ...p, contractYears: p.contractYears ?? 2 };
    const index = rosterOrderByTeam.get(p.teamId) || 0;
    rosterOrderByTeam.set(p.teamId, index + 1);
    // Force enough expiring contracts to make the diagnostic deterministic.
    const forcedExpiring = index < 2;
    return { ...p, contractYears: forcedExpiring ? 1 : 2, status: "cdl", circuit: "cdl" };
  });
  const prospects = generateProspects(8675309).map(applyChallengerRatingOverride);
  const state = {
    userTeamId,
    season: 1,
    players,
    prospects,
    schedule: { ...buildSeason(1), phase: "offseason" },
    notifications: [],
    feed: [],
    playerSeasonStats: {},
    playerOvrHistory: {},
    retiredPlayers: [],
    challengersLog: [],
    challengerTransactions: [],
    rosterMovesLog: [],
  };
  ensureChallengerTeams(state);
  return ensureCdlRosterIntegrity(state, { windowType: "diagnose_offseason_state_initial" });
}

let state = makeState("optic");
state = enterContractPhase(state);
const userExpiring = activeStarters(state, state.userTeamId).filter(p => (p.contractYears ?? 2) <= 1).sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0));
const aiExpiring = (state.players || []).filter(p => p.teamId && p.teamId !== state.userTeamId && (p.contractYears ?? 2) <= 1 && !p.isSub && !isInactivePlayer(p));
section("After season end / before contract review");
console.table(userExpiring.map(p => ({ name: p.name, ovr: p.overall, teamId: p.teamId, contractYears: p.contractYears })));
console.log("AI expiring starters:", aiExpiring.length);
console.log("contractYears <= 0:", (state.players || []).filter(p => (p.contractYears ?? 1) <= 0).length);
console.log("initial problems:", duplicateProblems(state));

if (userExpiring.length < 2) throw new Error("Need at least two user expiring players for diagnostic.");
const reSigned = userExpiring[0];
const letWalk = userExpiring[1];
const demand = getResignDemand(reSigned, 2, state.playerSeasonStats, state.season);
state = {
  ...state,
  players: state.players.map(p => p.id === reSigned.id ? { ...p, contractYears: 3, salary: demand } : p),
};
state = advanceOffseason(state);
const marketAfterContracts = freeAgents(state);
section("After contract review decisions / user free agency window");
console.log("Re-signed user:", reSigned.name);
console.log("Let-walk user:", letWalk.name);
console.log("Free agents count:", marketAfterContracts.length);
console.log("Free agents by previous team:", byPreviousTeam(marketAfterContracts));
console.table(marketAfterContracts.sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0)).slice(0, 20).map(p => ({ name: p.name, ovr: p.overall, age: p.age, previousTeamId: p.previousTeamId, demand: getSigningCost(p) })));
if (marketAfterContracts.some(p => p.id === reSigned.id)) throw new Error("Re-signed user player appeared in market.");
if (!marketAfterContracts.some(p => p.id === letWalk.id)) throw new Error("Let-walk user player did not enter market.");
if (!marketAfterContracts.some(p => p.previousTeamId && p.previousTeamId !== state.userTeamId)) throw new Error("No former AI players reached free agency.");
console.log("freeAgent with teamId:", state.players.filter(p => p.status === "freeAgent" && p.teamId).length);
console.log("cdl with no teamId:", state.players.filter(p => p.status === "cdl" && !p.teamId).length);

const cap = getTeamCap(state.userTeamId);
const committed = activeStarters(state, state.userTeamId).reduce((sum, p) => sum + (p.salary ?? getSigningCost(p)), 0);
const signTarget = marketAfterContracts
  .filter(p => p.id !== letWalk.id)
  .sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0))
  .find(p => committed + getSigningCost(p) <= cap) || marketAfterContracts.find(p => p.id !== letWalk.id);
if (!signTarget) throw new Error("No market candidate available for user signing check.");
state = {
  ...state,
  players: state.players.map(p => p.id === signTarget.id ? {
    ...p,
    teamId: state.userTeamId,
    challengerTeamId: null,
    status: "cdl",
    circuit: "cdl",
    isSub: false,
    contractYears: 2,
    salary: getSigningCost(p),
  } : p),
};
section("After user signs a free agent");
console.log("Signed:", signTarget.name);
console.table(activeStarters(state, state.userTeamId).map(p => ({ name: p.name, ovr: p.overall, contractYears: p.contractYears, status: p.status })));
console.log("Market count:", freeAgents(state).length);
if (freeAgents(state).some(p => p.id === signTarget.id)) throw new Error("User signed free agent still appears in market.");

const rosterBeforeAi = activeStarters(state, state.userTeamId).map(p => p.id).sort().join("|");
state = advanceOffseason(state);
const rosterAfterAi = activeStarters(state, state.userTeamId).map(p => p.id).sort().join("|");
section("After Run AI Free Agency / before new season schedule begins");
console.log("AI signings:", state.offseasonFreeAgencyDiagnostics?.signings?.length ?? 0);
console.log("Remaining free agents:", freeAgents(state).length);
console.log("User roster unchanged by AI:", rosterBeforeAi === rosterAfterAi);
console.log("Let-walk returned to user:", activeStarters(state, state.userTeamId).some(p => p.id === letWalk.id));
console.table(CDL_TEAMS.map(t => ({ team: t.id, starters: activeStarters(state, t.id).length })));
const problems = duplicateProblems(state);
console.log("Final problems:", problems);
if (rosterBeforeAi !== rosterAfterAi) throw new Error("AI free agency changed the user roster.");
if (activeStarters(state, state.userTeamId).some(p => p.id === letWalk.id)) throw new Error("Let-walk user player silently returned.");
if (problems.length) throw new Error(problems.join("\n"));
console.log("\nOffseason state diagnostic passed.");
