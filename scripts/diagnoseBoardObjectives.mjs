// scripts/diagnoseBoardObjectives.mjs
// Prints each CDL team's starter OVR, league OVR rank, owner personality, and the
// board objectives the new logic generates for them. Makes balancing the Owner
// Expectations / Board Objectives system easy to eyeball.
//
// Run with:
//   node --loader ./scripts/asset-loader.mjs scripts/diagnoseBoardObjectives.mjs

import { buildInitialRoster } from "../src/data/players.js";
import { generateProspects } from "../src/data/prospects.js";
import { applyChallengerRatingOverride } from "../src/data/challengerRatingOverrides.js";
import { CDL_TEAMS } from "../src/data/teams.js";
import { buildSeason, ensureChallengerTeams } from "../src/engine/seasonEngine.js";
import { ensureCdlRosterIntegrity } from "../src/engine/rosterAI.js";
import { calcTeamOvr } from "../src/engine/teamOvr.js";
import { getLeagueOvrRanks, buildBoardObjectives, getOwner } from "../src/engine/boardEngine.js";

function baseState() {
  const players = buildInitialRoster().map(applyChallengerRatingOverride);
  const prospects = generateProspects(424242).map(applyChallengerRatingOverride);
  const state = {
    userTeamId: "lat", season: 1, players, prospects,
    schedule: { ...buildSeason(1), phase: "stage" },
    notifications: [], feed: [], playerSeasonStats: {}, playerOvrHistory: {},
    retiredPlayers: [], challengersLog: [], challengerTransactions: [], seasonHistory: [],
  };
  ensureChallengerTeams(state);
  return ensureCdlRosterIntegrity(state, { windowType: "diagnose_board" });
}

const state = baseState();
const { rankById } = getLeagueOvrRanks(state);

const rows = CDL_TEAMS
  .map(t => ({ team: t, ovr: calcTeamOvr(t.id, state.players), rank: rankById[t.id] }))
  .sort((a, b) => a.rank - b.rank);

console.log("\n=== BOARD OBJECTIVES DIAGNOSTIC (Season 1) ===\n");

for (const { team, ovr, rank } of rows) {
  const owner = getOwner(team.id);
  const { objectives, meta } = buildBoardObjectives({ ...state, userTeamId: team.id });
  const primary = objectives.find(o => o.weight === "primary");
  const secondary = objectives.filter(o => o.weight === "secondary");
  const stretch = objectives.find(o => o.weight === "stretch");

  console.log(`#${rank}  ${team.name}  (OVR ${ovr})  [${meta.tierLabel}]`);
  console.log(`     Owner: ${owner.name} — ambition ${owner.ambition}, patience ${owner.patience}`);
  console.log(`     Primary  : ${primary?.label ?? "—"}`);
  for (const s of secondary) console.log(`     Secondary: ${s.label}`);
  console.log(`     Stretch  : ${stretch?.label ?? "—"}`);
  console.log("");
}

// ── Hard-cap assertions ──
console.log("=== HARD-CAP CHECKS ===");
let failures = 0;
for (const { team, rank } of rows) {
  const { objectives } = buildBoardObjectives({ ...state, userTeamId: team.id });
  const has = (pred) => objectives.some(pred);
  const champsGF = has(o => o.type === "champsResult" && o.target != null && o.target <= 2);
  const winMajor = has(o => o.type === "majorResult" && o.target === 1);
  const top6Primary = has(o => o.type === "finishTopN" && o.target != null && o.target <= 6 && o.weight === "primary");
  const winChampsPrimary = has(o => o.type === "champsResult" && o.target === 1 && o.weight === "primary");

  const problems = [];
  if (rank > 3 && champsGF) problems.push("has Champs GF/Win (rank > 3)");
  if (rank > 5 && winMajor) problems.push("has Win-a-Major (rank > 5)");
  if (rank >= 9 && top6Primary) problems.push("has top-6 primary (rank >= 9)");
  if (rank > 3 && winChampsPrimary) problems.push("has Win-Champs primary (rank > 3)");

  if (problems.length) {
    failures++;
    console.log(`  ✗ #${rank} ${team.name}: ${problems.join("; ")}`);
  }
}
if (failures === 0) console.log("  ✓ All hard caps respected across all 12 teams.");
console.log("");
process.exit(failures === 0 ? 0 : 1);
