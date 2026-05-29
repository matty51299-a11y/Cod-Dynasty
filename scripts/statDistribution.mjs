// Simulate a large sample of CDL series and report K/D distribution.
// Includes team-correlation metrics so over-correlated win/loss splits are visible.
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
const playerSeasonAccum = {}; // { playerId: { kills, deaths } } — accumulated over the run

// Team-correlation trackers
let totalSeries = 0;
let allWinnersPositive = 0;  // all 4 winners K/D > 1.0
let allLosersNegative = 0;   // all 4 losers K/D < 1.0
let loserHasPositive = 0;    // losing team has at least 1 player K/D >= 1.0
let winnerHasNegative = 0;   // winning team has at least 1 player K/D < 1.0

// Per score-line breakdowns  { total, loserPos, losAllNeg, winAllPos, winHasNeg }
const byScore = { "3-0": { t:0,lp:0,lan:0,wap:0,whn:0 }, "3-1": { t:0,lp:0,lan:0,wap:0,whn:0 }, "3-2": { t:0,lp:0,lan:0,wap:0,whn:0 } };

let s = 99991;
function rng() { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff; }

for (let i = 0; i < SIMULATIONS; i++) {
  const iA = Math.floor(rng() * teams.length);
  let iB = Math.floor(rng() * teams.length);
  while (iB === iA) iB = Math.floor(rng() * teams.length);

  const result = simMatch(teams[iA], teams[iB], 99991 + i);

  const winnerKDs = [];
  const loserKDs  = [];

  for (const [pid, stat] of Object.entries(result.playerStats)) {
    if (stat.kills === 0 && stat.deaths === 0) continue;
    const kd = stat.deaths > 0 ? stat.kills / stat.deaths : (stat.kills > 0 ? stat.kills : 0);
    allSeriesKDs.push(kd);

    if (stat.teamId === result.winnerId) winnerKDs.push(kd);
    else loserKDs.push(kd);

    if (!playerSeasonAccum[pid]) {
      playerSeasonAccum[pid] = {
        name: stat.name,
        ovr: players.find(x => x.id === pid)?.overall ?? 80,
        kills: 0,
        deaths: 0,
      };
    }
    playerSeasonAccum[pid].kills  += stat.kills;
    playerSeasonAccum[pid].deaths += stat.deaths;
  }

  if (winnerKDs.length === 4 && loserKDs.length === 4) {
    totalSeries++;
    const wap = winnerKDs.every(k => k >= 1.0);
    const lan = loserKDs .every(k => k <  1.0);
    const lp  = loserKDs .some(k  => k >= 1.0);
    const whn = winnerKDs.some(k  => k <  1.0);
    if (wap) allWinnersPositive++;
    if (lan) allLosersNegative++;
    if (lp)  loserHasPositive++;
    if (whn) winnerHasNegative++;

    const wins  = Math.max(result.winsA, result.winsB);
    const losses = Math.min(result.winsA, result.winsB);
    const key = `${wins}-${losses}`;
    if (byScore[key]) {
      byScore[key].t++;
      if (lp)  byScore[key].lp++;
      if (lan) byScore[key].lan++;
      if (wap) byScore[key].wap++;
      if (whn) byScore[key].whn++;
    }
  }
}

allSeriesKDs.sort((a, b) => a - b);
const n = allSeriesKDs.length;
const avg = allSeriesKDs.reduce((s, v) => s + v, 0) / n;
const median = allSeriesKDs[Math.floor(n / 2)];

function pAbove(thresh) { return (allSeriesKDs.filter(kd => kd > thresh).length / n * 100).toFixed(2); }
function pBelow(thresh) { return (allSeriesKDs.filter(kd => kd < thresh).length / n * 100).toFixed(2); }
function pct(num, den) { return den > 0 ? (num / den * 100).toFixed(1) : "n/a"; }

console.log("\n========== K/D SERIES DISTRIBUTION ==========");
console.log(`Series sampled  : ${SIMULATIONS}  |  Player-series: ${n}`);
console.log(`Average K/D     : ${avg.toFixed(3)}`);
console.log(`Median K/D      : ${median.toFixed(3)}`);

console.log("\n--- High K/D thresholds ---");
console.log(`  > 1.25 : ${pAbove(1.25)}%`);
console.log(`  > 1.40 : ${pAbove(1.40)}%`);
console.log(`  > 1.50 : ${pAbove(1.50)}%`);
console.log(`  > 1.70 : ${pAbove(1.70)}%`);
console.log(`  > 2.00 : ${pAbove(2.00)}%`);

console.log("\n--- Low K/D thresholds ---");
console.log(`  < 0.80 : ${pBelow(0.80)}%`);
console.log(`  < 0.65 : ${pBelow(0.65)}%`);
console.log(`  < 0.50 : ${pBelow(0.50)}%`);
console.log(`  < 0.40 : ${pBelow(0.40)}%`);

console.log(`\n--- Team correlation (${totalSeries} full 4v4 series) ---`);
console.log(`  All 4 winners K/D ≥ 1.00          : ${pct(allWinnersPositive, totalSeries)}%`);
console.log(`  All 4 losers  K/D < 1.00           : ${pct(allLosersNegative,  totalSeries)}%`);
console.log(`  Losing team has ≥1 player K/D≥1.00 : ${pct(loserHasPositive,   totalSeries)}%`);
console.log(`  Winning team has ≥1 player K/D<1.00: ${pct(winnerHasNegative,  totalSeries)}%`);

console.log("\n--- Correlation by series score ---");
for (const [score, d] of Object.entries(byScore)) {
  if (d.t === 0) continue;
  console.log(`  ${score}  (n=${d.t})  allWinPos:${pct(d.wap,d.t)}%  allLosNeg:${pct(d.lan,d.t)}%  loserPos:${pct(d.lp,d.t)}%  winNeg:${pct(d.whn,d.t)}%`);
}

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
