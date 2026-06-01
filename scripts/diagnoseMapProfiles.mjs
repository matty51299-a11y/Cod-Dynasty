// scripts/diagnoseMapProfiles.mjs
// Prints each CDL team's CDL 2026 map/mode profile + a sample veto, and runs a
// few sanity assertions (ratings in range, not all identical, deterministic,
// real map names in a simulated series).
//
// Run with:
//   node --loader ./scripts/asset-loader.mjs scripts/diagnoseMapProfiles.mjs

import { buildInitialRoster } from "../src/data/players.js";
import { generateProspects } from "../src/data/prospects.js";
import { applyChallengerRatingOverride } from "../src/data/challengerRatingOverrides.js";
import { CDL_TEAMS } from "../src/data/teams.js";
import { buildSeason, ensureChallengerTeams } from "../src/engine/seasonEngine.js";
import { ensureCdlRosterIntegrity } from "../src/engine/rosterAI.js";
import { ensureTeamStaff, migrateStaff, getStaffForTeam } from "../src/engine/staffEngine.js";
import { calcTeamOvr } from "../src/engine/teamOvr.js";
import { buildTeamMapProfile, autoVeto } from "../src/engine/mapProfile.js";
import { simMatch } from "../src/engine/matchSim.js";

function newGame(teamId = "lat") {
  const players = buildInitialRoster().map(applyChallengerRatingOverride);
  const prospects = generateProspects(424242).map(applyChallengerRatingOverride);
  const state = {
    userTeamId: teamId, season: 1, players, prospects,
    schedule: { ...buildSeason(1), phase: "stage" },
    notifications: [], feed: [], playerSeasonStats: {}, playerOvrHistory: {},
    retiredPlayers: [], challengersLog: [], challengerTransactions: [], seasonHistory: [],
    staff: ensureTeamStaff(migrateStaff([])),
  };
  ensureChallengerTeams(state);
  return ensureCdlRosterIntegrity(state, { windowType: "diagnose_map" });
}

const state = newGame();

console.log("\n=== CDL 2026 MAP / MODE PROFILES (Season 1) ===\n");

const profiles = {};
for (const team of CDL_TEAMS) {
  const profile = buildTeamMapProfile(team.id, state.players, state.staff, 1);
  profiles[team.id] = profile;
  const ovr = calcTeamOvr(team.id, state.players);
  const staff = getStaffForTeam(state.staff, team.id);
  const hc = staff.find(s => s.role === "head_coach");
  const an = staff.find(s => s.role === "analyst");
  const mr = profile.modeRatings;
  console.log(`${team.name}  (OVR ${ovr})  — ${profile.identity}`);
  console.log(`   HP ${mr.hardpoint}  ·  S&D ${mr.snd}  ·  OVR ${mr.overload}`);
  console.log(`   Best: ${profile.strengths.join(", ")}`);
  console.log(`   Weak: ${profile.weaknesses.join(", ")}`);
  console.log(`   HC: ${hc?.name ?? "—"}   Analyst: ${an?.name ?? "—"}`);
  console.log("");
}

// Sample veto: top OVR team vs bottom OVR team
const ranked = CDL_TEAMS.map(t => ({ id: t.id, ovr: calcTeamOvr(t.id, state.players) })).sort((a, b) => b.ovr - a.ovr);
const fav = ranked[0].id, dog = ranked[ranked.length - 1].id;
console.log(`=== SAMPLE VETO: ${fav} (fav) vs ${dog} (dog) ===`);
for (const m of autoVeto(profiles[fav], profiles[dog])) {
  console.log(`   Map ${m.slot}: ${m.name} ${m.short}  (edge ${m.edgeA >= 0 ? fav : dog} +${Math.abs(m.edgeA)})`);
}
console.log("");

// ── Assertions ──
console.log("=== SANITY CHECKS ===");
let fails = 0;
const fail = (m) => { console.log(`  ✗ ${m}`); fails++; };

// 1. ratings in range
for (const team of CDL_TEAMS) {
  const mr = profiles[team.id].modeRatings;
  for (const k of ["hardpoint", "snd", "overload"]) {
    if (mr[k] < 50 || mr[k] > 99) fail(`${team.id} ${k} rating out of range: ${mr[k]}`);
  }
}
// 2. not all identical across teams
const hpVals = new Set(CDL_TEAMS.map(t => profiles[t.id].modeRatings.hardpoint));
if (hpVals.size < 4) fail(`HP ratings not varied enough (${hpVals.size} distinct)`);
// 3. map ratings not all identical within a team
for (const team of CDL_TEAMS) {
  const vals = new Set(Object.values(profiles[team.id].mapRatings));
  if (vals.size < 3) fail(`${team.id} map ratings too uniform (${vals.size} distinct)`);
}
// 4. deterministic
const again = buildTeamMapProfile(fav, state.players, state.staff, 1);
if (JSON.stringify(again.mapRatings) !== JSON.stringify(profiles[fav].mapRatings)) fail("profile not deterministic");
// 5. veto = 5 maps, modes correct, no repeat map within a mode
const veto = autoVeto(profiles[fav], profiles[dog]);
if (veto.length !== 5) fail(`veto not 5 maps: ${veto.length}`);
const expectModes = ["Hardpoint", "Search & Destroy", "Overload", "Hardpoint", "Search & Destroy"];
veto.forEach((m, i) => { if (m.mode !== expectModes[i]) fail(`veto slot ${i + 1} mode ${m.mode} != ${expectModes[i]}`); });
const hpMaps = veto.filter(m => m.mode === "Hardpoint").map(m => m.id);
const sndMaps = veto.filter(m => m.mode === "Search & Destroy").map(m => m.id);
if (new Set(hpMaps).size !== hpMaps.length) fail("HP map repeated in series");
if (new Set(sndMaps).size !== sndMaps.length) fail("S&D map repeated in series");
// 6. simMatch surfaces real map names when profiles attached
const teamObj = (id) => ({ id, name: id, players: state.players.filter(p => p.teamId === id), mapProfile: profiles[id] });
const res = simMatch(teamObj(fav), teamObj(dog), 12345);
const named = res.mapResults.filter(m => m.mapName).length;
if (named !== res.mapResults.length) fail(`not all map results have names: ${named}/${res.mapResults.length}`);
console.log(`  simMatch produced ${res.mapResults.length} maps, all named: ${res.mapResults.map(m => `${m.mapName} ${m.short}`).join(" | ")}`);
// 7. backwards-compat: no profile → no map names, no crash
const resNoProfile = simMatch(
  { id: fav, name: fav, players: state.players.filter(p => p.teamId === fav) },
  { id: dog, name: dog, players: state.players.filter(p => p.teamId === dog) },
  12345
);
if (resNoProfile.mapResults.some(m => m.mapName)) fail("legacy call (no profile) unexpectedly has map names");

if (fails === 0) console.log("  ✓ All map-profile sanity checks passed.");
console.log("");
process.exit(fails === 0 ? 0 : 1);
