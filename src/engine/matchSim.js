// src/engine/matchSim.js
// Simulates a single CDL match between two teams.
// No bullet-by-bullet simulation – we compute team strength scores
// and resolve a best-of-5 map series with controlled randomness.

import { calcChemistry } from "./chemistry.js";

// Seeded PRNG for reproducible sims (pass a numeric seed)
function seededRng(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

// Computes a single team's overall match-ready strength
function teamStrength(players, chemistry) {
  if (!players || players.length === 0) return 40;

  const starters = players.slice(0, 4);

  // Core ratings average (weighted by role importance)
  const ratingAvg = starters.reduce((s, p) => {
    const core = (p.gunny * 0.25 + p.awareness * 0.15 + p.searchIQ * 0.15 +
                  p.clutch * 0.2 + p.objective * 0.1 + p.adaptability * 0.15);
    return s + core;
  }, 0) / starters.length;

  // Form modifier (-10 to +10 based on 0–100 form)
  const formAvg = starters.reduce((s, p) => s + (p.form || 70), 0) / starters.length;
  const formMod = (formAvg - 70) * 0.2;

  // Chemistry bonus (up to +8)
  const chemBonus = (chemistry / 100) * 8;

  // Meta dependence risk: high metaDependence on a meta-shift patch can hurt
  const avgMetaDep = starters.reduce((s, p) => s + (p.metaDependence || 2), 0) / starters.length;
  const metaRisk = (avgMetaDep - 3) * 1.5; // slight penalty if avg > 3

  return ratingAvg + formMod + chemBonus - metaRisk;
}

// Pick the standout player from the winning team based on ratings + luck
function pickStandout(players, rng) {
  if (!players || players.length === 0) return null;
  const starters = players.slice(0, 4);
  const weights = starters.map(p => p.gunny + p.clutch + (rng() * 20));
  const maxIdx = weights.indexOf(Math.max(...weights));
  return starters[maxIdx];
}

// Simulate a single map – returns true if teamA wins the map
function simMap(strengthA, strengthB, rng) {
  // Logistic-like: stronger team wins more often, but upsets happen
  const diff = strengthA - strengthB;
  const prob = 1 / (1 + Math.exp(-diff / 8));
  return rng() < prob;
}

// Update player form after a match
function updateForm(player, won, rng) {
  const delta = won ? ri(2, 8, rng) : ri(-8, -2, rng);
  // Tilt resistance softens bad runs
  const resistance = (player.tiltResistance || 2) - 1; // 0–4
  const adjusted = won ? delta : Math.max(delta + resistance * 2, -12);
  player.form = Math.max(30, Math.min(100, (player.form || 70) + adjusted));
}

function ri(min, max, rng) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

/**
 * simMatch – simulate one CDL match (best of 5)
 * @param {object} teamA  { id, name, players }
 * @param {object} teamB  { id, name, players }
 * @param {number} seed   numeric seed for reproducibility
 * @returns {object} match result
 */
export function simMatch(teamA, teamB, seed) {
  const rng = seededRng(seed);

  const chemA = calcChemistry(teamA.players);
  const chemB = calcChemistry(teamB.players);

  const strA = teamStrength(teamA.players, chemA);
  const strB = teamStrength(teamB.players, chemB);

  let winsA = 0, winsB = 0;
  const maps = [];

  // Play up to 5 maps
  for (let m = 0; m < 5; m++) {
    if (winsA === 3 || winsB === 3) break;
    const aWon = simMap(strA, strB, rng);
    if (aWon) winsA++; else winsB++;
    maps.push(aWon ? teamA.id : teamB.id);
  }

  const winner = winsA === 3 ? teamA : teamB;
  const loser  = winsA === 3 ? teamB : teamA;
  const score  = winsA === 3 ? `3-${winsB}` : `${winsA}-3`;

  const standout = pickStandout(winner.players, rng);

  // Update form for all players
  [...(teamA.players || [])].slice(0, 4).forEach(p => updateForm(p, winsA === 3, rng));
  [...(teamB.players || [])].slice(0, 4).forEach(p => updateForm(p, winsB === 3, rng));

  return {
    winnerId: winner.id,
    loserId: loser.id,
    winnerName: winner.name,
    loserName: loser.name,
    score,                      // e.g. "3-1"
    maps,                       // array of winner ids per map
    standoutId: standout?.id ?? null,
    standoutName: standout?.name ?? null,
    chemA,
    chemB,
  };
}
