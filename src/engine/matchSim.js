// src/engine/matchSim.js
// Simulates a CDL best-of-5 series in standard map rotation order.
//
// STAT MODEL DESIGN
// -----------------
// 1. Compute a TARGET K/D per player from a tight formula.
// 2. Generate KILLS from activity (role + mode + small noise).
// 3. Compute DEATHS = round(kills / targetKD).
//
// Expected K/D distribution:
//   Typical player, close series:   0.90 – 1.10
//   Good player, winning series:    1.10 – 1.30
//   Elite player, dominant win:     1.25 – 1.45  (rare outliers to ~1.60)
//   Average player, losing series:  0.80 – 1.00
//   Poor player, bad loss:          0.65 – 0.85
//
// TRAIT SYSTEM (per-map, interactive play only)
// ─────────────────────────────────────────────
// applyTraitModifiers() modifies player attribute copies before each map:
//   Tilt Resistance  — losers with low tiltResistance get −5% on all key attrs
//   Clutch           — map 5 / S&D: players with clutch ≥ 4 get +10% all attrs
//   Leadership       — if team leader's last-map K/D > 1.0, rest get +3% teamwork
// Tactical boosts (user choices at intermission) are also applied here.

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

/**
 * makeMatchRng — create a standalone seeded RNG for interactive match play.
 * The overlay owns this function reference and advances it across map calls.
 */
export function makeMatchRng(seed) {
  return seededRng(seed);
}

function ri(min, max, rng) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

// ── TEAM STRENGTH ─────────────────────────────────────────────────────────────
// Weights updated per spec: 3 primary attributes per mode, not 6.
function teamStrength(players, chemistry, mode) {
  if (!players || players.length === 0) return 40;
  const starters = players.slice(0, 4);

  const modeWeights = {
    "Hardpoint":        { gunny: 0.40, awareness: 0.30, objective: 0.30 },
    "Search & Destroy": { searchIQ: 0.40, clutch: 0.30, composure: 0.30 },
    "Control":          { gunny: 0.30, objective: 0.40, teamwork: 0.30 },
  };
  const w = modeWeights[mode] ?? modeWeights["Hardpoint"];

  const ratingAvg = starters.reduce((s, p) => {
    let score = 0;
    for (const [attr, weight] of Object.entries(w)) {
      score += (p[attr] ?? 60) * weight;
    }
    return s + score;
  }, 0) / starters.length;

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

const ROLE_KD_MOD = {
  "Slayer SMG":        0.07,
  "Entry SMG":         0.02,
  "Flex":              0.00,
  "Main AR":          -0.01,
  "Objective":        -0.06,
  "Search Specialist": -0.03,
};

const ROLE_KILL_MOD = {
  "Slayer SMG":        3,
  "Entry SMG":         2,
  "Flex":              1,
  "Main AR":           0,
  "Objective":        -2,
  "Search Specialist": -1,
};

const MODE_KILL_BASE = {
  "Hardpoint":         20,
  "Search & Destroy":   5,
  "Control":           14,
};

function targetKDForMap(player, won, rng) {
  const qualityMod = (player.overall - 82) / 90;
  const winMod     = won ? 0.06 : -0.06;
  const roleMod    = ROLE_KD_MOD[player.primary] ?? 0;
  const formMod    = ((player.form || 70) - 70) / 900;

  const noiseWidth = player.primary === "Entry SMG" ? 0.13 : 0.10;
  const noise      = (rng() + rng() - 1.0) * noiseWidth;

  const kd = 1.0 + qualityMod + winMod + roleMod + formMod + noise;
  return Math.max(0.50, Math.min(1.85, kd));
}

function killsForMap(player, won, mode, rng) {
  const base    = MODE_KILL_BASE[mode] ?? 15;
  const roleMod = ROLE_KILL_MOD[player.primary] ?? 0;
  const qualMod = (player.overall - 80) / 25;
  const wonMod  = won ? 1 : -1;
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

// ── TRAIT MODIFIERS ──────────────────────────────────────────────────────────
/**
 * applyTraitModifiers — returns new player attribute copies with traits applied.
 * Does NOT mutate the original player objects.
 *
 * ctx = {
 *   mapIdx:            number        — 0-based map index in series
 *   mode:              string        — "Hardpoint" | "Search & Destroy" | "Control"
 *   tiltedIds:         Set<string>   — player IDs with active tilt penalty
 *   lastMapKDByPlayer: object        — { [playerId]: kd } from previous map
 *   extraBoosts:       object        — { gunny, awareness, teamwork } flat boosts
 * }
 *
 * Returns { modifiedPlayers, procs }
 * procs = [{ playerId, playerName, label }]
 */
function applyTraitModifiers(players, ctx) {
  const { mapIdx, mode, tiltedIds, lastMapKDByPlayer, extraBoosts } = ctx;

  const KEY_ATTRS = ["gunny", "awareness", "searchIQ", "clutch", "composure", "objective", "teamwork", "adaptability"];

  // Find the player with the highest leadership on this team (the "leader")
  let leaderId = null;
  let maxLeadership = -Infinity;
  for (const p of players) {
    if ((p.leadership ?? 2) > maxLeadership) {
      maxLeadership = p.leadership ?? 2;
      leaderId = p.id;
    }
  }
  const leaderKD = leaderId ? (lastMapKDByPlayer[leaderId] ?? 0) : 0;
  const leaderIsHot = leaderKD > 1.0;

  const procs = [];

  const modifiedPlayers = players.map(p => {
    const attrs = { ...p };

    // 1. Tilt penalty — player lost last map and has low tilt resistance
    if (tiltedIds.has(p.id) && (p.tiltResistance ?? 3) < 3) {
      for (const a of KEY_ATTRS) {
        if (attrs[a] != null) attrs[a] = attrs[a] * 0.95;
      }
    }

    // 2. Clutch proc — map 5 or S&D, player has high clutch
    const isClutchMap = mapIdx === 4 || mode === "Search & Destroy";
    if (isClutchMap && (p.clutch ?? 2) >= 4) {
      for (const a of KEY_ATTRS) {
        if (attrs[a] != null) attrs[a] = attrs[a] * 1.10;
      }
      procs.push({ playerId: p.id, playerName: p.name, label: "Clutch Play!" });
    }

    // 3. Leadership boost — leader is performing well, non-leaders get teamwork boost
    if (leaderIsHot && p.id !== leaderId) {
      attrs.teamwork = (attrs.teamwork ?? 50) * 1.03;
      if (procs.every(pr => pr.label !== "Leader Up!" || pr.playerId !== p.id)) {
        procs.push({ playerId: p.id, playerName: p.name, label: "Leader Up!" });
      }
    }

    // 4. Tactical adjustment boosts from the user's intermission choice
    if (extraBoosts) {
      if (extraBoosts.gunny)     attrs.gunny     = (attrs.gunny     ?? 50) + extraBoosts.gunny;
      if (extraBoosts.awareness) attrs.awareness = (attrs.awareness ?? 50) + extraBoosts.awareness;
      if (extraBoosts.teamwork)  attrs.teamwork  = (attrs.teamwork  ?? 50) + extraBoosts.teamwork;
    }

    return attrs;
  });

  return { modifiedPlayers, procs };
}

// ── SINGLE MAP SIM ────────────────────────────────────────────────────────────
/**
 * simMap — simulate one map in a BO5 series.
 * Called by both MatchCenterOverlay (interactive) and simMatch (AI/burst).
 *
 * @param {{ id, name, players }} teamAObj
 * @param {{ id, name, players }} teamBObj
 * @param {number}  mapIdx   — 0-based index into MAP_ROTATION
 * @param {object}  matchCtx — trait and boost context
 * @param {function} rng     — seeded RNG (advanced in place across calls)
 *
 * matchCtx = {
 *   tiltedIdsA:        Set   — tilted player IDs on team A
 *   tiltedIdsB:        Set   — tilted player IDs on team B
 *   lastMapKDByPlayer: {}    — { [playerId]: kd }
 *   extraBoostsA:      {}    — { gunny, awareness, teamwork }
 *   extraBoostsB:      {}    — same for team B
 * }
 *
 * Returns {
 *   mapResult:      object         — standard mapResult entry
 *   playerMapStats: {}             — { [playerId]: { name, teamId, kills, deaths, kd } }
 *   procs:          []             — trait proc events for UI
 *   newTiltedIdsA:  Set            — tilted players heading into next map (team A)
 *   newTiltedIdsB:  Set            — tilted players heading into next map (team B)
 *   momentum:       number 0–1    — strA / (strA + strB)
 * }
 */
export function simMap(teamAObj, teamBObj, mapIdx, matchCtx, rng) {
  const mapDef = MAP_ROTATION[mapIdx];
  const chemA  = calcChemistry(teamAObj.players);
  const chemB  = calcChemistry(teamBObj.players);

  const ctx = matchCtx ?? {};
  const tiltedIdsA        = ctx.tiltedIdsA        ?? new Set();
  const tiltedIdsB        = ctx.tiltedIdsB        ?? new Set();
  const lastMapKDByPlayer = ctx.lastMapKDByPlayer  ?? {};
  const extraBoostsA      = ctx.extraBoostsA       ?? {};
  const extraBoostsB      = ctx.extraBoostsB       ?? {};

  const { modifiedPlayers: modA, procs: procsA } = applyTraitModifiers(
    teamAObj.players.slice(0, 4),
    { mapIdx, mode: mapDef.mode, tiltedIds: tiltedIdsA, lastMapKDByPlayer, extraBoosts: extraBoostsA }
  );
  const { modifiedPlayers: modB, procs: procsB } = applyTraitModifiers(
    teamBObj.players.slice(0, 4),
    { mapIdx, mode: mapDef.mode, tiltedIds: tiltedIdsB, lastMapKDByPlayer, extraBoosts: extraBoostsB }
  );

  const strA = teamStrength(modA, chemA, mapDef.mode);
  const strB = teamStrength(modB, chemB, mapDef.mode);
  const aWon = rng() < mapWinProb(strA, strB);

  const [winScore, loseScore] = genMapScore(mapDef.mode, rng);
  const scoreA = aWon ? winScore : loseScore;
  const scoreB = aWon ? loseScore : winScore;

  // Per-player stats using modified attribute copies for strength, original refs for K/D formula
  const playerMapStats = {};
  const allSlots = [
    ...teamAObj.players.slice(0, 4).map((orig, i) => ({ orig, mod: modA[i], won: aWon,  tId: teamAObj.id })),
    ...teamBObj.players.slice(0, 4).map((orig, i) => ({ orig, mod: modB[i], won: !aWon, tId: teamBObj.id })),
  ];

  for (const { orig, mod, won, tId } of allSlots) {
    const kd     = targetKDForMap(mod, won, rng);
    const kills  = killsForMap(mod, won, mapDef.mode, rng);
    const deaths = kills > 0 ? Math.max(1, Math.round(kills / kd)) : 1;
    playerMapStats[orig.id] = {
      name:   orig.name,
      teamId: tId,
      kills,
      deaths,
      kd: deaths > 0 ? +(kills / deaths).toFixed(2) : kills > 0 ? kills : 0,
    };
  }

  // Tilt propagation: losing team's players with low tilt resistance become tilted next map
  const loserTeamPlayers = aWon ? teamBObj.players.slice(0, 4) : teamAObj.players.slice(0, 4);
  const winnerTeamPlayers = aWon ? teamAObj.players.slice(0, 4) : teamBObj.players.slice(0, 4);

  const newTiltedIdsLoser  = new Set(loserTeamPlayers .filter(p => (p.tiltResistance ?? 3) < 3).map(p => p.id));
  const newTiltedIdsWinner = new Set(winnerTeamPlayers.filter(p => tiltedIdsA.has(p.id) || tiltedIdsB.has(p.id) ? false : false)); // winners clear tilt
  void newTiltedIdsWinner; // intentionally empty — winners always clear tilt

  const newTiltedIdsA = aWon ? new Set() : new Set(teamAObj.players.slice(0, 4).filter(p => (p.tiltResistance ?? 3) < 3).map(p => p.id));
  const newTiltedIdsB = aWon ? new Set(teamBObj.players.slice(0, 4).filter(p => (p.tiltResistance ?? 3) < 3).map(p => p.id)) : new Set();

  const totalStr = strA + strB;
  const momentum = totalStr > 0 ? strA / totalStr : 0.5;

  return {
    mapResult: {
      mapNum:      mapIdx + 1,
      mode:        mapDef.mode,
      short:       mapDef.short,
      winnerId:    aWon ? teamAObj.id : teamBObj.id,
      winnerName:  aWon ? teamAObj.name : teamBObj.name,
      loserId:     aWon ? teamBObj.id : teamAObj.id,
      loserName:   aWon ? teamBObj.name : teamAObj.name,
      scoreA,
      scoreB,
      scoreWinner: aWon ? scoreA : scoreB,
      scoreLoser:  aWon ? scoreB : scoreA,
    },
    playerMapStats,
    procs: [...procsA, ...procsB],
    newTiltedIdsA,
    newTiltedIdsB,
    momentum,
  };
}

// ── MAIN SIM FUNCTION ─────────────────────────────────────────────────────────
/**
 * simMatch — simulate one CDL BO5 series (AI/burst mode).
 * Internally uses simMap so trait logic is consistent.
 * External result shape is unchanged.
 */
export function simMatch(teamA, teamB, seed) {
  const rng   = seededRng(seed);
  const chemA = calcChemistry(teamA.players);
  const chemB = calcChemistry(teamB.players);
  void chemA; void chemB; // chemistry used inside simMap per call

  let winsA = 0, winsB = 0;

  const accStats = {};
  function ensureStat(id, name, tId) {
    if (!accStats[id]) accStats[id] = { name, teamId: tId, kills: 0, deaths: 0 };
  }

  const mapResults = [];

  let tiltedIdsA        = new Set();
  let tiltedIdsB        = new Set();
  let lastMapKDByPlayer = {};

  for (let m = 0; m < 5; m++) {
    if (winsA === 3 || winsB === 3) break;

    const { mapResult, playerMapStats, newTiltedIdsA, newTiltedIdsB } = simMap(
      teamA, teamB, m,
      { tiltedIdsA, tiltedIdsB, lastMapKDByPlayer },
      rng
    );

    if (mapResult.winnerId === teamA.id) winsA++; else winsB++;
    mapResults.push(mapResult);

    for (const [id, s] of Object.entries(playerMapStats)) {
      ensureStat(id, s.name, s.teamId);
      accStats[id].kills  += s.kills;
      accStats[id].deaths += s.deaths;
    }

    tiltedIdsA        = newTiltedIdsA;
    tiltedIdsB        = newTiltedIdsB;
    lastMapKDByPlayer = Object.fromEntries(
      Object.entries(playerMapStats).map(([id, s]) => [id, s.kd])
    );
  }

  // Finalise stats
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

  const winnerStats = winner.players.slice(0, 4)
    .map(p => ({ p, stat: playerStats[p.id] }))
    .filter(x => x.stat && x.stat.kills >= 3)
    .sort((a, b) => b.stat.kd - a.stat.kd);

  const standout = winnerStats[0]?.p ?? winner.players[0];

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
    chemA: calcChemistry(teamA.players),
    chemB: calcChemistry(teamB.players),
  };
}
