import { buildInitialRoster } from "../src/data/players.js";
import { generateProspects } from "../src/data/prospects.js";
import { applyChallengerRatingOverride } from "../src/data/challengerRatingOverrides.js";
import { CDL_TEAMS } from "../src/data/teams.js";
import { buildSeason, enterContractPhase, advanceOffseason, ensureChallengerTeams } from "../src/engine/seasonEngine.js";
import { ensureCdlRosterIntegrity, getSigningCost, getTeamCap } from "../src/engine/rosterAI.js";
import { isInactivePlayer, normalizePlayerName } from "../src/utils/playerIdentity.js";

function newGame(teamId = "lat") {
  const indexByTeam = new Map();
  const players = buildInitialRoster().map(applyChallengerRatingOverride).map((p) => {
    if (!p.teamId) return { ...p, contractYears: p.contractYears ?? 2 };
    const idx = indexByTeam.get(p.teamId) || 0;
    indexByTeam.set(p.teamId, idx + 1);
    return { ...p, contractYears: p.teamId === teamId || idx < 2 ? 1 : (p.contractYears ?? 2) };
  });
  const prospects = generateProspects(424242).map(applyChallengerRatingOverride);
  const state = { userTeamId: teamId, season: 1, players, prospects, schedule: { ...buildSeason(1), phase: "offseason" }, notifications: [], feed: [], playerSeasonStats: {}, playerOvrHistory: {}, retiredPlayers: [], challengersLog: [], challengerTransactions: [] };
  ensureChallengerTeams(state);
  return ensureCdlRosterIntegrity(state, { windowType: "diagnose_free_agency_new_game" });
}

function activeStarters(state, teamId) {
  return (state.players || []).filter(p => p.teamId === teamId && !p.isSub && !isInactivePlayer(p));
}

function validateNoDuplicates(state) {
  const ids = new Set();
  const names = new Set();
  const challengerIds = new Set((state.challengerTeams || []).flatMap(t => t.playerIds || []));
  const problems = [];
  for (const p of state.players || []) {
    if (p.teamId && !isInactivePlayer(p)) {
      const key = normalizePlayerName(p.name);
      if (ids.has(p.id)) problems.push(`duplicate CDL id ${p.id}`);
      if (names.has(key)) problems.push(`duplicate CDL name ${p.name}`);
      if (challengerIds.has(p.id) || p.challengerTeamId) problems.push(`${p.name} is both CDL/free-agent pool and Challengers`);
      ids.add(p.id); names.add(key);
    }
    if (p.status === "freeAgent" && (p.teamId || p.challengerTeamId || challengerIds.has(p.id))) problems.push(`${p.name} freeAgent has active assignment`);
  }
  for (const team of CDL_TEAMS) {
    if (team.id !== state.userTeamId && activeStarters(state, team.id).length < 4) problems.push(`${team.id} has fewer than 4 starters`);
  }
  if (problems.length) throw new Error(problems.join("\n"));
}

let state = newGame("lat");
state = enterContractPhase(state);
const userExpiring = activeStarters(state, state.userTeamId).sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0))[0];
console.log(`Letting ${userExpiring.name} (${userExpiring.overall} OVR) walk from ${state.userTeamId}.`);
state = advanceOffseason(state);

const freeAgents = (state.players || []).filter(p => p.status === "freeAgent" && !p.teamId).sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0));
console.log("\nFree agents entering market:", freeAgents.length);
console.table(freeAgents.slice(0, 20).map(p => ({ name: p.name, ovr: p.overall, role: p.primary, age: p.age, previousTeamId: p.previousTeamId, demand: getSigningCost(p) })));
if (!freeAgents.some(p => p.id === userExpiring.id)) throw new Error("User expiring player did not enter free agency.");
if (!freeAgents.some(p => p.previousTeamId && p.previousTeamId !== state.userTeamId)) throw new Error("AI expiring players did not reach free agency.");

const cap = getTeamCap(state.userTeamId);
const committed = activeStarters(state, state.userTeamId).reduce((s, p) => s + (p.salary ?? getSigningCost(p)), 0);
const affordable = freeAgents.find(p => activeStarters(state, state.userTeamId).length < 4 && committed + getSigningCost(p) <= cap);
if (affordable) {
  console.log(`\nUser could sign: ${affordable.name} (${affordable.overall} OVR) for $${getSigningCost(affordable) / 1000}k before AI runs.`);
}

console.log("\nAI team needs before free agency:");
console.table(CDL_TEAMS.filter(t => t.id !== state.userTeamId).map(t => ({ team: t.id, starters: activeStarters(state, t.id).length, cap: getTeamCap(t.id) })));

state = advanceOffseason(state);
validateNoDuplicates(state);
const diag = state.offseasonFreeAgencyDiagnostics || {};
console.log("\nOffers made (top 30):");
console.table((diag.offers || []).slice(0, 30));
console.log("\nSignings completed:");
console.table(diag.signings || []);
console.log("\nPlayers left unsigned:");
console.table((diag.leftUnsigned || []).slice(0, 20));
console.log("\nPlayers moved to Challengers/inactive/retired:");
console.table(diag.marketExits || []);
console.log("\nRoster sizes after free agency:");
console.table(CDL_TEAMS.map(t => ({ team: t.id, starters: activeStarters(state, t.id).length })));
console.log("\nOffseason free agency diagnostic passed.");
