// src/engine/matchSim.js
// Simulates a CDL best-of-5 series in standard map rotation order.
// Generates per-map scores and per-player K/D stats.
// Does NOT simulate bullet-by-bullet — outcomes are computed from ratings.

import { calcChemistry } from "./chemistry.js";

// Standard CDL BO5 rotation
const MAP_ROTATION = [
  { mode: "Hardpoint",        short: "HP"  },
  { mode: "Search & Destroy", short: "S&D" },
  { mode: "Control",          short: "CTL" },
  { mode: "Hardpoint",        short: "HP"  },
  { mode: "Search & Destroy", short: "S&D" },
];

// ── PRNG ──────────────────────────────────────────────────────────────────────
function seededRng(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

function ri(min, max, rng) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

// ── TEAM STRENGTH ─────────────────────────────────────────────────────────────
// Weights differ slightly by mode to reward relevant skills.
function teamStrength(players, chemistry, mode) {
  if (!players || players.length === 0) return 40;
  const starters = players.slice(0, 4);

  const modeWeights = {
    "Hardpoint":        { gunny: 0.28, awareness: 0.12, searchIQ: 0.10, clutch: 0.22, objective: 0.16, adaptability: 0.12 },
    "Search & Destroy": { gunny: 0.20, awareness: 0.18, searchIQ: 0.28, clutch: 0.22, objective: 0.04, adaptability: 0.08 },
    "Control":          { gunny: 0.22, awareness: 0.15, searchIQ: 0.12, clutch: 0.20, objective: 0.18, adaptability: 0.13 },
  };
  const w = modeWeights[mode] ?? modeWeights["Hardpoint"];

  const ratingAvg = starters.reduce((s, p) => {
    return s + (p.gunny * w.gunny + p.awareness * w.awareness + p.searchIQ * w.searchIQ +
                p.clutch * w.clutch + p.objective * w.objective + p.adaptability * w.adaptability);
  }, 0) / starters.length;

  const formAvg = starters.reduce((s, p) => s + (p.form || 70), 0) / starters.length;
  const formMod = (formAvg - 70) * 0.2;
  const chemBonus = (chemistry / 100) * 8;
  const avgMetaDep = starters.reduce((s, p) => s + (p.metaDependence || 2), 0) / starters.length;
  const metaRisk = (avgMetaDep - 3) * 1.5;

  return ratingAvg + formMod + chemBonus - metaRisk;
}

// ── MAP WIN PROBABILITY ───────────────────────────────────────────────────────
function mapWinProb(strA, strB) {
  const diff = strA - strB;
  return 1 / (1 + Math.exp(-diff / 8)); // logistic curve
}

// ── MAP SCORE GENERATION ──────────────────────────────────────────────────────
// Returns [winnerScore, loserScore] for the given mode.
function genMapScore(mode, rng) {
  if (mode === "Hardpoint") {
    return [250, ri(90, 249, rng)];
  }
  if (mode === "Search & Destroy") {
    return [6, ri(0, 5, rng)];
  }
  if (mode === "Control") {
    return [3, ri(0, 2, rng)];
  }
  return [1, 0];
}

// ── PLAYER KILL GENERATION PER MAP ───────────────────────────────────────────
// Roles that typically frag more
const ROLE_KILL_BONUS = {
  "Slayer SMG":       5,
  "Entry SMG":        3,
  "Flex":             1,
  "Main AR":          0,
  "Objective":       -3,
  "Search Specialist":-2,
};

// Average kills per player per map varies by mode
const MODE_KILL_BASE = {
  "Hardpoint":        24,
  "Search & Destroy":  7,
  "Control":          16,
};

function genPlayerKillsForMap(players, won, mode, rng) {
  const base = MODE_KILL_BASE[mode] ?? 20;
  const wonMod = won ? 3 : -3;

  return players.slice(0, 4).map(p => {
    const roleMod  = ROLE_KILL_BONUS[p.primary] ?? 0;
    const gunMod   = (p.gunny - 75) / 7;
    const formMod  = ((p.form || 70) - 70) / 14;
    const noise    = (rng() - 0.5) * 10;
    return Math.max(0, Math.round(base + roleMod + gunMod + formMod + wonMod + noise));
  });
}

// Distribute the opponent's total kills as deaths across a team.
// Better-gunny players die less (inverse weight).
function distributeDeaths(totalOpponentKills, players, rng) {
  const starters = players.slice(0, 4);
  // weight = inverted gunny so bad gunners absorb more deaths
  const weights = starters.map(p => Math.max(1, 99 - p.gunny + 10));
  const totalW  = weights.reduce((s, w) => s + w, 0);
  return starters.map((_, i) => {
    const share = weights[i] / totalW;
    const base  = Math.round(totalOpponentKills * share);
    const noise = ri(-3, 3, rng);
    return Math.max(0, base + noise);
  });
}

// ── FORM UPDATE ───────────────────────────────────────────────────────────────
function updateForm(player, won, rng) {
  const delta = won ? ri(2, 8, rng) : ri(-8, -2, rng);
  const resistance = (player.tiltResistance || 2) - 1;
  const adjusted = won ? delta : Math.max(delta + resistance * 2, -12);
  player.form = Math.max(30, Math.min(100, (player.form || 70) + adjusted));
}

// ── MAIN SIM FUNCTION ─────────────────────────────────────────────────────────
/**
 * simMatch — simulate one CDL BO5 series
 * @param {{ id, name, players }} teamA
 * @param {{ id, name, players }} teamB
 * @param {number} seed
 * @returns {object} full match result with mapResults and playerStats
 */
export function simMatch(teamA, teamB, seed) {
  const rng = seededRng(seed);

  const chemA = calcChemistry(teamA.players);
  const chemB = calcChemistry(teamB.players);

  let winsA = 0, winsB = 0;

  // Accumulated kills/deaths per player across all maps played
  // { [playerId]: { name, teamId, kills, deaths } }
  const accStats = {};

  function ensureStat(p) {
    if (!accStats[p.id]) {
      accStats[p.id] = { name: p.name, teamId: p.teamId ?? teamA.id, kills: 0, deaths: 0 };
    }
  }

  const mapResults = [];

  for (let m = 0; m < 5; m++) {
    if (winsA === 3 || winsB === 3) break;

    const mapDef  = MAP_ROTATION[m];
    const strA    = teamStrength(teamA.players, chemA, mapDef.mode);
    const strB    = teamStrength(teamB.players, chemB, mapDef.mode);
    const probA   = mapWinProb(strA, strB);
    const aWon    = rng() < probA;

    if (aWon) winsA++; else winsB++;

    // Map score
    const [winScore, loseScore] = genMapScore(mapDef.mode, rng);
    const scoreA = aWon ? winScore : loseScore;
    const scoreB = aWon ? loseScore : winScore;

    // Player kills this map
    const killsA = genPlayerKillsForMap(teamA.players, aWon,  mapDef.mode, rng);
    const killsB = genPlayerKillsForMap(teamB.players, !aWon, mapDef.mode, rng);

    const totalKillsA = killsA.reduce((s, k) => s + k, 0);
    const totalKillsB = killsB.reduce((s, k) => s + k, 0);

    const deathsA = distributeDeaths(totalKillsB, teamA.players, rng);
    const deathsB = distributeDeaths(totalKillsA, teamB.players, rng);

    // Accumulate stats
    teamA.players.slice(0, 4).forEach((p, i) => {
      ensureStat(p);
      accStats[p.id].kills  += killsA[i];
      accStats[p.id].deaths += deathsA[i];
    });
    teamB.players.slice(0, 4).forEach((p, i) => {
      ensureStat(p);
      accStats[p.id].kills  += killsB[i];
      accStats[p.id].deaths += deathsB[i];
    });

    const winnerId   = aWon ? teamA.id : teamB.id;
    const winnerName = aWon ? teamA.name : teamB.name;
    const loserId    = aWon ? teamB.id : teamA.id;
    const loserName  = aWon ? teamB.name : teamA.name;

    mapResults.push({
      mapNum:     m + 1,
      mode:       mapDef.mode,
      short:      mapDef.short,
      winnerId,
      winnerName,
      loserId,
      loserName,
      // Scores labeled by team for easy display
      scoreA,   // teamA's score on this map
      scoreB,   // teamB's score on this map
      scoreWinner: aWon ? scoreA : scoreB,
      scoreLoser:  aWon ? scoreB : scoreA,
    });
  }

  // Finalise player stats — compute K/D
  const playerStats = {};
  for (const [id, s] of Object.entries(accStats)) {
    playerStats[id] = {
      ...s,
      kd: s.deaths > 0 ? +(s.kills / s.deaths).toFixed(2) : s.kills > 0 ? s.kills : 0,
    };
  }

  const winner = winsA === 3 ? teamA : teamB;
  const loser  = winsA === 3 ? teamB : teamA;
  const score  = `${Math.max(winsA, winsB)}-${Math.min(winsA, winsB)}`;

  // Standout = best K/D (min 5 kills) on the winning team
  const winnerStats = winner.players.slice(0, 4)
    .map(p => ({ p, stat: playerStats[p.id] }))
    .filter(x => x.stat && x.stat.kills >= 5)
    .sort((a, b) => b.stat.kd - a.stat.kd);

  const standout = winnerStats[0]?.p ?? winner.players[0];

  // Update form for all starters
  teamA.players.slice(0, 4).forEach(p => updateForm(p, winsA === 3, rng));
  teamB.players.slice(0, 4).forEach(p => updateForm(p, winsB === 3, rng));

  return {
    winnerId:      winner.id,
    loserId:       loser.id,
    winnerName:    winner.name,
    loserName:     loser.name,
    score,
    // Series breakdown
    teamAId:       teamA.id,
    teamAName:     teamA.name,
    teamBId:       teamB.id,
    teamBName:     teamB.name,
    winsA,
    winsB,
    mapResults,    // array of per-map results
    playerStats,   // keyed by playerId
    standoutId:    standout?.id   ?? null,
    standoutName:  standout?.name ?? null,
    standoutKD:    standout ? (playerStats[standout.id]?.kd ?? 0) : 0,
    chemA,
    chemB,
  };
}
