// src/engine/matchSim.js
// Simulates a CDL best-of-5 series in standard map rotation order.
//
// STAT MODEL DESIGN
// -----------------
// Previous model generated kills and deaths independently, which caused
// high-gunny players on winning teams to compound bonuses and produce
// unrealistic K/Ds like 1.8–2.1 routinely.
//
// New model:
//   1. Compute a TARGET K/D per player from a tight formula.
//   2. Generate KILLS from activity (role + mode + small noise).
//   3. Compute DEATHS = round(kills / targetKD).
//
// The K/D is now the primary controlled variable. Kills reflect activity
// level (slayers fire more, objective players fire less) but the ratio
// between kills and deaths is bounded from the start.
//
// Expected K/D distribution:
//   Typical player, close series:   0.90 – 1.10
//   Good player, winning series:    1.10 – 1.30
//   Elite player, dominant win:     1.25 – 1.45  (rare outliers to ~1.60)
//   Average player, losing series:  0.80 – 1.00
//   Poor player, bad loss:          0.65 – 0.85

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
function teamStrength(players, chemistry, mode) {
  if (!players || players.length === 0) return 40;
  const starters = players.slice(0, 4);

  const modeWeights = {
    "Hardpoint":        { gunny: 0.28, awareness: 0.12, searchIQ: 0.10, clutch: 0.22, objective: 0.16, adaptability: 0.12 },
    "Search & Destroy": { gunny: 0.20, awareness: 0.18, searchIQ: 0.28, clutch: 0.22, objective: 0.04, adaptability: 0.08 },
    "Control":          { gunny: 0.22, awareness: 0.15, searchIQ: 0.12, clutch: 0.20, objective: 0.18, adaptability: 0.13 },
  };
  const w = modeWeights[mode] ?? modeWeights["Hardpoint"];

  const ratingAvg = starters.reduce((s, p) =>
    s + (p.gunny * w.gunny + p.awareness * w.awareness + p.searchIQ * w.searchIQ +
         p.clutch * w.clutch + p.objective * w.objective + p.adaptability * w.adaptability)
  , 0) / starters.length;

  const formAvg    = starters.reduce((s, p) => s + (p.form || 70), 0) / starters.length;
  const formMod    = (formAvg - 70) * 0.2;
  const chemBonus  = (chemistry / 100) * 8;
  const avgMetaDep = starters.reduce((s, p) => s + (p.metaDependence || 2), 0) / starters.length;
  const metaRisk   = (avgMetaDep - 3) * 1.5;

  return ratingAvg + formMod + chemBonus - metaRisk;
}

// ── MAP WIN PROBABILITY ───────────────────────────────────────────────────────
function mapWinProb(strA, strB) {
  return 1 / (1 + Math.exp(-(strA - strB) / 8));
}

// ── MAP SCORE GENERATION ──────────────────────────────────────────────────────
function genMapScore(mode, rng) {
  if (mode === "Hardpoint")        return [250, ri(90, 249, rng)];
  if (mode === "Search & Destroy") return [6,   ri(0,   5, rng)];
  if (mode === "Control")          return [3,   ri(0,   2, rng)];
  return [1, 0];
}

// ── STAT MODEL ────────────────────────────────────────────────────────────────

// Per-role K/D tendency offset from 1.0.
// Slayers trend slightly above break-even; obj players slightly below.
// These are small by design — most of the variance comes from quality and noise.
const ROLE_KD_MOD = {
  "Slayer SMG":        0.07,
  "Entry SMG":         0.02,   // volatile, handled via wider noise below
  "Flex":              0.00,
  "Main AR":          -0.01,
  "Objective":        -0.06,
  "Search Specialist": -0.03,
};

// Per-role activity: how many kills a role typically racks up per map.
// Higher ≠ better K/D — it just means more gun-fight involvement.
const ROLE_KILL_MOD = {
  "Slayer SMG":        3,
  "Entry SMG":         2,
  "Flex":              1,
  "Main AR":           0,
  "Objective":        -2,
  "Search Specialist": -1,
};

// Realistic average kills per player per map (CDL pace).
//   HP:  20  — 250-point hill fight, lots of engagements
//   S&D:  5  — 6 short rounds, low overall kill count
//   CTL: 14  — 3 rounds with respawns, medium volume
const MODE_KILL_BASE = {
  "Hardpoint":         20,
  "Search & Destroy":   5,
  "Control":           14,
};

// Compute the target K/D for one player on one map.
// This is the anchor: kills/deaths will be derived so the ratio matches.
//
// Components:
//   quality  — elite players trend slightly above 1.0 (small effect)
//   win/loss — winning maps nudge K/D up slightly, losing maps down
//   role     — see ROLE_KD_MOD above
//   form     — very small effect so hot/cold streaks don't dominate
//   noise    — triangle distribution (sum of 2 uniforms): tighter than uniform,
//              most results cluster near 0; range ≈ ±0.10 for most roles,
//              ±0.13 for Entry SMG (intentionally more volatile)
function targetKDForMap(player, won, rng) {
  // (overall - 82) / 90  →  82-rated = 0.00, 95-rated = +0.14, 70-rated = −0.13
  const qualityMod = (player.overall - 82) / 90;
  const winMod     = won ? 0.06 : -0.06;
  const roleMod    = ROLE_KD_MOD[player.primary] ?? 0;
  const formMod    = ((player.form || 70) - 70) / 900;  // ±0.03 at extreme form

  // Triangle noise: sum of two [0,1] uniforms gives triangle on [0,2], mean=1.
  // Subtract 1 → center at 0. Scale to desired width.
  // Entry SMG deliberately wider (more volatile map-to-map).
  const noiseWidth = player.primary === "Entry SMG" ? 0.13 : 0.10;
  const noise      = (rng() + rng() - 1.0) * noiseWidth;

  const kd = 1.0 + qualityMod + winMod + roleMod + formMod + noise;

  // Hard clamp — prevents freak edge cases but almost never triggers
  return Math.max(0.50, Math.min(1.85, kd));
}

// Generate kill count for one player on one map.
// Role and mode determine activity level; quality has a minor effect.
// Noise is tight (±3.5 range) so individual map kill counts vary naturally.
function killsForMap(player, won, mode, rng) {
  const base    = MODE_KILL_BASE[mode] ?? 15;
  const roleMod = ROLE_KILL_MOD[player.primary] ?? 0;
  // (overall - 80) / 25 → 80-rated = 0, 95-rated ≈ +0.6, 65-rated ≈ −0.6
  const qualMod = (player.overall - 80) / 25;
  // Small win bonus on activity: winners take more fights
  const wonMod  = won ? 1 : -1;
  // Tight noise: (rng-0.5)*7 gives range ±3.5, mean 0
  const noise   = (rng() - 0.5) * 7;
  return Math.max(0, Math.round(base + roleMod + qualMod + wonMod + noise));
}

// ── FORM UPDATE ───────────────────────────────────────────────────────────────
function updateForm(player, won, rng) {
  const delta      = won ? ri(2, 8, rng) : ri(-8, -2, rng);
  const resistance = (player.tiltResistance || 2) - 1;
  const adjusted   = won ? delta : Math.max(delta + resistance * 2, -12);
  player.form      = Math.max(30, Math.min(100, (player.form || 70) + adjusted));
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
  const rng  = seededRng(seed);
  const chemA = calcChemistry(teamA.players);
  const chemB = calcChemistry(teamB.players);

  let winsA = 0, winsB = 0;

  // Accumulated kills/deaths per player across all maps played
  const accStats = {};
  function ensureStat(p, tId) {
    if (!accStats[p.id])
      accStats[p.id] = { name: p.name, teamId: p.teamId ?? tId, kills: 0, deaths: 0 };
  }

  const mapResults = [];

  for (let m = 0; m < 5; m++) {
    if (winsA === 3 || winsB === 3) break;

    const mapDef = MAP_ROTATION[m];
    const strA   = teamStrength(teamA.players, chemA, mapDef.mode);
    const strB   = teamStrength(teamB.players, chemB, mapDef.mode);
    const aWon   = rng() < mapWinProb(strA, strB);

    if (aWon) winsA++; else winsB++;

    const [winScore, loseScore] = genMapScore(mapDef.mode, rng);
    const scoreA = aWon ? winScore : loseScore;
    const scoreB = aWon ? loseScore : winScore;

    // ── Per-player stats for this map ──────────────────────────────────────
    // For each player: compute target K/D → generate kills → deaths = kills/kd
    const allPlayers = [
      ...teamA.players.slice(0, 4).map(p => ({ p, won: aWon,  tId: teamA.id })),
      ...teamB.players.slice(0, 4).map(p => ({ p, won: !aWon, tId: teamB.id })),
    ];

    for (const { p, won, tId } of allPlayers) {
      ensureStat(p, tId);

      const kd     = targetKDForMap(p, won, rng);          // target ratio
      const kills  = killsForMap(p, won, mapDef.mode, rng); // activity
      // deaths derived from kills and target K/D
      // clamp minimum 1 so we never divide by zero when finalising K/D
      const deaths = kills > 0 ? Math.max(1, Math.round(kills / kd)) : 1;

      accStats[p.id].kills  += kills;
      accStats[p.id].deaths += deaths;
    }

    const winnerId   = aWon ? teamA.id : teamB.id;
    const winnerName = aWon ? teamA.name : teamB.name;
    const loserId    = aWon ? teamB.id : teamA.id;
    const loserName  = aWon ? teamB.name : teamA.name;

    mapResults.push({
      mapNum: m + 1,
      mode:   mapDef.mode,
      short:  mapDef.short,
      winnerId, winnerName, loserId, loserName,
      scoreA, scoreB,
      scoreWinner: aWon ? scoreA : scoreB,
      scoreLoser:  aWon ? scoreB : scoreA,
    });
  }

  // ── Finalise stats: compute realised K/D ──────────────────────────────────
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

  // Standout = best K/D among winning players with at least 3 kills total
  const winnerStats = winner.players.slice(0, 4)
    .map(p => ({ p, stat: playerStats[p.id] }))
    .filter(x => x.stat && x.stat.kills >= 3)
    .sort((a, b) => b.stat.kd - a.stat.kd);

  const standout = winnerStats[0]?.p ?? winner.players[0];

  // Update form for all starters
  teamA.players.slice(0, 4).forEach(p => updateForm(p, winsA === 3, rng));
  teamB.players.slice(0, 4).forEach(p => updateForm(p, winsB === 3, rng));

  return {
    winnerId:     winner.id,
    loserId:      loser.id,
    winnerName:   winner.name,
    loserName:    loser.name,
    score,
    teamAId:      teamA.id,
    teamAName:    teamA.name,
    teamBId:      teamB.id,
    teamBName:    teamB.name,
    winsA,
    winsB,
    mapResults,
    playerStats,
    standoutId:   standout?.id   ?? null,
    standoutName: standout?.name ?? null,
    standoutKD:   standout ? (playerStats[standout.id]?.kd ?? 0) : 0,
    chemA,
    chemB,
  };
}
