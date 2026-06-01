// Challenger roster integrity diagnostic.
// Drives a fresh save through the season and verifies that every Challenger
// event team fields 4 real, valid players — no "Sub N" placeholders while real
// candidates exist, no duplicate ownership, no player on both a CDL and a
// Challenger roster, and that top seeds never carry an emergency placeholder.
//
// Run: node --loader ./scripts/asset-loader.mjs scripts/diagnoseChallengerRosterIntegrity.mjs

import { buildInitialRoster } from "../src/data/players.js";
import { generateProspects } from "../src/data/prospects.js";
import { applyChallengerRatingOverride } from "../src/data/challengerRatingOverrides.js";
import {
  buildSeason, ensureChallengerTeams, repairChallengerRosters,
  buildChallengerRostersForNewGame, simStage, simMajor,
  simChallengerQualifier, continueFromChallengerQualifier,
} from "../src/engine/seasonEngine.js";
import { ensureCdlRosterIntegrity } from "../src/engine/rosterAI.js";
import { buildCdlRosterNameSet, isCdlTeamId, isInactivePlayer, normalizePlayerName } from "../src/utils/playerIdentity.js";

const SUB_RE = /^sub ?\d+$/i;
const failures = [];
const fail = (msg) => { failures.push(msg); console.error("  ✗ " + msg); };

function makeState(seed = 4242) {
  const state = {
    userTeamId: "optic",
    season: 1,
    players: buildInitialRoster().map(applyChallengerRatingOverride),
    prospects: generateProspects(seed).map(applyChallengerRatingOverride),
    schedule: buildSeason(1),
    notifications: [], feed: [], playerSeasonStats: {}, playerOvrHistory: {},
    retiredPlayers: [], challengersLog: [], challengerTransactions: [],
  };
  buildChallengerRostersForNewGame(state, seed);
  ensureChallengerTeams(state);
  return ensureCdlRosterIntegrity(state, { windowType: "diagnose_challenger_integrity" });
}

// Resolve a Challenger team's roster the same way the engine does.
function teamRoster(state, team) {
  const cdlNames = buildCdlRosterNameSet(state.players || []);
  const byId = new Map([...(state.players || []), ...(state.prospects || [])].map(p => [p.id, p]));
  return (team.playerIds || [])
    .map(id => byId.get(id))
    .filter(p => p && !isInactivePlayer(p) && !cdlNames.has(normalizePlayerName(p.name)));
}

// Assert integrity over the current Challenger teams. `seedOrder` (optional)
// is an array of teamIds best→worst used to check the top-8 seeds.
function checkIntegrity(label, state, seedOrder = null) {
  console.log(`\n[${label}]`);
  const teams = state.challengerTeams || [];
  const diag = state.__challengerRepairDiag || {};
  const ownership = new Map(); // playerId -> [teamId,...]
  const cdlActiveIds = new Set((state.players || []).filter(p => p.teamId && isCdlTeamId(p.teamId) && !isInactivePlayer(p)).map(p => p.id));

  let subsWhileRealExist = 0;
  let placeholderTeams = 0;
  const byId = new Map([...(state.players || []), ...(state.prospects || [])].map(p => [p.id, p]));

  for (const team of teams) {
    const roster = teamRoster(state, team);
    if (roster.length < 4) fail(`${team.id} has only ${roster.length} valid players`);
    for (const p of roster) {
      ownership.set(p.id, [...(ownership.get(p.id) || []), team.id]);
      if (cdlActiveIds.has(p.id)) fail(`${p.name} is on CDL roster AND Challenger team ${team.id}`);
      if (SUB_RE.test(p.name || "")) {
        placeholderTeams++;
        // A literal "Sub N" while real candidates exist is the bug we fixed.
        const realPoolLeft = (diag.poolSize ?? 0) > 0;
        if (realPoolLeft) subsWhileRealExist++;
        fail(`${team.id} uses placeholder "${p.name}"`);
      }
    }
  }

  // Duplicate ownership across teams.
  let dupes = 0;
  for (const [pid, owners] of ownership) {
    if (owners.length > 1) { dupes++; fail(`player ${byId.get(pid)?.name ?? pid} owned by teams ${owners.join(", ")}`); }
  }

  // Top-8 seeds must not carry an emergency placeholder.
  const seeds = seedOrder || teams.map(t => t.id);
  const top8 = seeds.slice(0, 8);
  let top8Placeholders = 0;
  for (const tid of top8) {
    const team = teams.find(t => t.id === tid);
    if (!team) continue;
    const roster = teamRoster(state, team);
    const emergency = roster.filter(p => p.isEmergencyGenerated || SUB_RE.test(p.name || ""));
    if (emergency.length) { top8Placeholders++; fail(`TOP-8 seed ${tid} has emergency player(s) ${emergency.map(p => p.name).join(", ")}`); }
  }

  console.log(`  total Challenger teams ......... ${teams.length}`);
  console.log(`  candidate pool size ........... ${diag.poolSize ?? "n/a"}`);
  console.log(`  freeAgent candidates .......... ${diag.freeAgentCandidates ?? "n/a"}`);
  console.log(`  prospect candidates ........... ${diag.prospectCandidates ?? "n/a"}`);
  console.log(`  filled from pool .............. ${diag.filledFromPool ?? "n/a"}`);
  console.log(`  poaching moves ................ ${(diag.poaches || []).length}`);
  console.log(`  donor teams repaired .......... ${(diag.donorTeamsRepaired || []).length}`);
  console.log(`  emergency players created ..... ${(diag.emergencies || []).length}`);
  console.log(`  duplicate-owned players ....... ${dupes}`);
  console.log(`  placeholder ("Sub N") players . ${placeholderTeams}`);
  console.log(`  "Sub N" while real available .. ${subsWhileRealExist}`);
  console.log(`  top-8 seeds w/ placeholders ... ${top8Placeholders}`);
  for (const t of teams) {
    const roster = teamRoster(state, t);
    if (roster.length !== 4) console.log(`    · ${t.id}: ${roster.length} valid (${roster.map(p => p.name).join(", ")})`);
  }
}

let state = makeState();

// New save: every team should already have 4 real players.
repairChallengerRosters(state);
checkIntegrity("new save", state);

// Drive through the season, repairing + checking before each qualifier + the
// Challengers Finals.
for (let i = 0; i < 4; i++) {
  state = simStage(state);
  // Visible qualifier field was just built (repair ran inside it).
  const q = state.schedule.currentChallengerQualifier;
  const seedOrder = (q?.field || []).slice().sort((a, b) => a.seed - b.seed).map(r => r.teamId);
  checkIntegrity(`Major ${i + 1} qualifier`, state, seedOrder);
  state = simChallengerQualifier(state);
  state = continueFromChallengerQualifier(state);
  state = simMajor(state);
}

// Challengers Finals.
const finalsEvent = state.schedule.currentChallengerQualifier;
const finalsSeedOrder = (finalsEvent?.field || []).slice().sort((a, b) => a.seed - b.seed).map(r => r.teamId);
checkIntegrity("Challengers Finals", state, finalsSeedOrder);

// Verify the Finals field carries no "Sub N" in any captured roster.
const cdlNames = buildCdlRosterNameSet(state.players || []);
for (const row of finalsEvent?.field || []) {
  const byId = new Map([...(state.players || []), ...(state.prospects || [])].map(p => [p.id, p]));
  const names = (row.rosterIds || []).map(id => byId.get(id)?.name).filter(Boolean);
  if (names.length < 4) fail(`Finals seed ${row.seed} (${row.teamName}) captured only ${names.length} roster ids`);
  for (const n of names) if (SUB_RE.test(n)) fail(`Finals seed ${row.seed} captured placeholder "${n}"`);
}

// Purge a player id from every pool so a knocked hole cannot be silently
// refilled by the orphaned player (simulates a player leaving entirely).
function purgePlayer(s, id) {
  s.players = (s.players || []).filter(p => p.id !== id);
  s.prospects = (s.prospects || []).filter(p => p.id !== id);
  s.challengerTeams = (s.challengerTeams || []).map(t => ({ ...t, playerIds: (t.playerIds || []).filter(pid => pid !== id) }));
}
// Knock a real hole in a team: remove its lowest-OVR player and purge it.
function knockHole(s, teamId) {
  const byId = new Map([...(s.players || []), ...(s.prospects || [])].map(p => [p.id, p]));
  const team = s.challengerTeams.find(t => t.id === teamId);
  const roster = (team.playerIds || []).map(id => byId.get(id)).filter(Boolean).sort((a, b) => (a.overall ?? 0) - (b.overall ?? 0));
  if (roster[0]) purgePlayer(s, roster[0].id);
}

// ── Stress 1: prospect pool drained — repair must use free-agent PLAYERS ──────
// Convert every unsigned prospect into a freeAgent in the players array, drop
// the rest, then knock holes in several Challenger rosters. Repair must backfill
// from the free-agent pool (proving the root-cause fix), not create "Sub N".
{
  let s = makeState(909);
  repairChallengerRosters(s);
  // Recreate every unsigned prospect as a freeAgent in players; remove from prospects.
  const freed = (s.prospects || [])
    .filter(p => !p.challengerTeamId && !isInactivePlayer(p))
    .map(p => ({ ...p, status: "freeAgent", isProspect: false, teamId: null, challengerTeamId: null }));
  s.prospects = (s.prospects || []).filter(p => p.challengerTeamId);
  s.players = [...s.players, ...freed];
  // Knock 6 genuine holes (purged so they can't be reused from prospects).
  for (const t of s.challengerTeams.slice(0, 6)) knockHole(s, t.id);
  repairChallengerRosters(s);
  const d = s.__challengerRepairDiag || {};
  console.log(`\n[stress: prospects→freeAgents] filledFromPool=${d.filledFromPool} freeAgentCandidates=${d.freeAgentCandidates} prospectCandidates=${d.prospectCandidates}`);
  if ((d.filledFromPool ?? 0) <= 0) fail("free-agent pool was not used to repair Challenger holes");
  if ((d.emergencies || []).length > 0) fail("emergency players created while free agents were available");
  checkIntegrity("stress: free-agent fill", s);
}

// ── Stress 2: ALL real pools drained + hole in the #1 seed — must poach ───────
// With no free candidates anywhere, a top seed missing a starter must poach a
// strong player from a lower-priority team; the bottom team absorbs the
// shortage (emergency). Top-8 must stay placeholder-free.
{
  let s = makeState(1234);
  repairChallengerRosters(s);
  // Remove ALL unsigned real candidates everywhere.
  s.prospects = (s.prospects || []).filter(p => p.challengerTeamId);
  s.players = (s.players || []).filter(p => p.teamId || p.status === "cdl");
  repairChallengerRosters(s); // settle after pruning
  // Order teams by the engine's priority proxy; knock a hole in the very top seed.
  const teams = s.challengerTeams;
  const byId = new Map([...(s.players || []), ...(s.prospects || [])].map(p => [p.id, p]));
  const ovrOf = (t) => {
    const r = (t.playerIds || []).map(id => byId.get(id)).filter(Boolean);
    return r.length ? r.reduce((x, p) => x + (p.overall ?? 65), 0) / r.length : 0;
  };
  const ordered = [...teams].sort((a, b) =>
    ((b.circuitPoints ?? 0) + (ovrOf(b) - 65) * 1.35 + (b.form ?? 0) * 2.2) -
    ((a.circuitPoints ?? 0) + (ovrOf(a) - 65) * 1.35 + (a.form ?? 0) * 2.2)
  );
  const topSeed = ordered[0];
  knockHole(s, topSeed.id);
  const seedOrder = ordered.map(t => t.id);
  repairChallengerRosters(s, { seeds: seedOrder });
  const d = s.__challengerRepairDiag || {};
  console.log(`\n[stress: poach] topSeed=${topSeed.id} poaches=${(d.poaches || []).length} emergencies=${(d.emergencies || []).length}`);
  if ((d.poaches || []).length <= 0) fail("expected seed-aware poaching when real pools are drained");
  const filledTop = teamRoster(s, s.challengerTeams.find(t => t.id === topSeed.id));
  if (filledTop.length !== 4) fail(`top seed not repaired to 4 (${filledTop.length})`);
  if (filledTop.some(p => p.isEmergencyGenerated)) fail("top seed received an emergency player instead of a poached real one");
  checkIntegrity("stress: poaching + bottom-team emergency", s, seedOrder);
}

console.log("\n────────────────────────────────────────");
if (failures.length) {
  console.error(`Challenger roster integrity diagnostic FAILED with ${failures.length} problem(s).`);
  process.exit(1);
}
console.log("Challenger roster integrity diagnostic passed.");
