// Simulate a large sample of CDL series and report K/D distribution.
// Run before and after tuning to compare spread.
//
// Usage: node scripts/statDistribution.mjs [--quiet]
import { buildInitialRoster } from "../src/data/players.js";
import { simMatch } from "../src/engine/matchSim.js";
import { CDL_TEAMS } from "../src/data/teams.js";

const QUIET = process.argv.includes("--quiet");

function buildTeamObj(teamId, players) {
  const teamPlayers = players.filter(p => p.teamId === teamId && !p.isSub).slice(0, 4);
  const team = CDL_TEAMS.find(t => t.id === teamId) ?? { id: teamId, name: teamId, tag: teamId };
  return { id: teamId, name: team.name, players: teamPlayers };
}

const players = buildInitialRoster();
const teams = CDL_TEAMS.map(t => buildTeamObj(t.id, players));

const SIMULATIONS = 8000;

const allSeriesKDs = [];
const playerSeriesKDs = {};   // { playerId: { name, ovr, kds[] } }
const playerSeasonAccum = {}; // { playerId: { kills, deaths } } — accumulated over the run

let seed = 99991;
function lcg(s) {
  s = (s * 1664525 + 1013904223) & 0xffffffff;
  return (s >>> 0) / 0xffffffff;
}

let s = seed;
function rng() { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff; }

for (let i = 0; i < SIMULATIONS; i++) {
  const iA = Math.floor(rng() * teams.length);
  let iB = Math.floor(rng() * teams.length);
  while (iB === iA) iB = Math.floor(rng() * teams.length);

  const result = simMatch(teams[iA], teams[iB], seed + i);

  for (const [pid, stat] of Object.entries(result.playerStats)) {
    if (!playerSeriesKDs[pid]) {
      const p = players.find(x => x.id === pid);
      playerSeriesKDs[pid] = { name: stat.name, ovr: p?.overall ?? 80, kds: [] };
    }
    if (stat.kills > 0 || stat.deaths > 0) {
      const kd = stat.deaths > 0 ? stat.kills / stat.deaths : (stat.kills > 0 ? stat.kills : 0);
      playerSeriesKDs[pid].kds.push(kd);
      allSeriesKDs.push(kd);

      if (!playerSeasonAccum[pid]) playerSeasonAccum[pid] = { name: stat.name, ovr: players.find(x=>x.id===pid)?.overall??80, kills: 0, deaths: 0 };
      playerSeasonAccum[pid].kills  += stat.kills;
      playerSeasonAccum[pid].deaths += stat.deaths;
    }
  }
}

allSeriesKDs.sort((a, b) => a - b);
const n = allSeriesKDs.length;
const avg = allSeriesKDs.reduce((s, v) => s + v, 0) / n;
const median = allSeriesKDs[Math.floor(n / 2)];

function pAbove(thresh) { return (allSeriesKDs.filter(kd => kd > thresh).length / n * 100).toFixed(2); }
function pBelow(thresh) { return (allSeriesKDs.filter(kd => kd < thresh).length / n * 100).toFixed(2); }

console.log("\n========== K/D SERIES DISTRIBUTION ==========");
console.log(`Series sampled  : ${SIMULATIONS}  |  Player-series: ${n}`);
console.log(`Average K/D     : ${avg.toFixed(3)}`);
console.log(`Median K/D      : ${median.toFixed(3)}`);

console.log("\n--- High K/D thresholds ---");
console.log(`  > 1.30 : ${pAbove(1.30)}%`);
console.log(`  > 1.50 : ${pAbove(1.50)}%`);
console.log(`  > 1.70 : ${pAbove(1.70)}%`);
console.log(`  > 2.00 : ${pAbove(2.00)}%`);
console.log(`  > 2.50 : ${pAbove(2.50)}%`);

console.log("\n--- Low K/D thresholds ---");
console.log(`  < 0.80 : ${pBelow(0.80)}%`);
console.log(`  < 0.60 : ${pBelow(0.60)}%`);
console.log(`  < 0.50 : ${pBelow(0.50)}%`);
console.log(`  < 0.40 : ${pBelow(0.40)}%`);

if (!QUIET) {
  console.log("\n--- Top 20 highest series K/Ds ---");
  allSeriesKDs.slice(-20).reverse().forEach((kd, i) => {
    process.stdout.write(`  ${String(i+1).padStart(2)}. ${kd.toFixed(2)}  `);
    if ((i+1) % 5 === 0) process.stdout.write("\n");
  });
  process.stdout.write("\n");

  console.log("\n--- Bottom 20 lowest series K/Ds ---");
  allSeriesKDs.slice(0, 20).forEach((kd, i) => {
    process.stdout.write(`  ${String(i+1).padStart(2)}. ${kd.toFixed(2)}  `);
    if ((i+1) % 5 === 0) process.stdout.write("\n");
  });
  process.stdout.write("\n");

  // Season leader averages
  const leaders = Object.values(playerSeasonAccum)
    .filter(p => p.deaths > 0)
    .map(p => ({ ...p, kd: p.kills / p.deaths }))
    .sort((a, b) => b.kd - a.kd);

  console.log("\n--- Top 15 season K/D leaders ---");
  leaders.slice(0, 15).forEach((p, i) => {
    console.log(`  ${String(i+1).padStart(2)}. ${p.name.padEnd(14)} OVR:${p.ovr}  K/D:${p.kd.toFixed(3)}`);
  });

  console.log("\n--- Bottom 10 season K/D ---");
  leaders.slice(-10).reverse().forEach((p, i) => {
    console.log(`  ${String(i+1).padStart(2)}. ${p.name.padEnd(14)} OVR:${p.ovr}  K/D:${p.kd.toFixed(3)}`);
  });
}
