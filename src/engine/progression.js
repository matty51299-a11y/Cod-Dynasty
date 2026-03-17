// src/engine/progression.js
// Offseason player development and regression.
//
// MODEL OVERVIEW
// ──────────────
// Each offseason, every player rolls for one of three outcomes:
//   GROWTH   – ratings improve (likely for young high-potential players)
//   PLATEAU  – no change (common near peak age or for low-headroom players)
//   DECLINE  – ratings fall (likely for older players or those with bad traits)
//
// Factors that influence the roll and magnitude:
//   age             – primary driver; peak window is ~20-23, decline starts ~26-27
//   developmentCurve – "early" shifts age factors -2yr, "late" shifts +2yr
//   potential        – headroom (potential - overall) gates how much growth is possible
//   workEthic        – boosts growth magnitude, reduces decline magnitude
//   adaptability     – secondary trait boost to growth
//   team performance – light modifier using season standings (wins/losses)
//
// Implementation notes:
//   - floatDelta is computed from the model, then probabilistically rounded to int
//     (e.g. 0.7 → +1 with 70% chance) to avoid always rounding small gains to 0
//   - overall is changed directly, then N individual stats are nudged ±1 to keep
//     the sim-side ratings consistent with the displayed overall
//   - calcOverall() provides a recompute function for verification purposes

// ── Stat keys used by match simulation ───────────────────────────────────────
const STAT_KEYS = [
  "gunny", "awareness", "objective", "searchIQ",
  "clutch", "teamwork", "composure", "adaptability",
];

// ── PRNG (same LCG used throughout the engine) ────────────────────────────────
function seededRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function shuffleArr(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Overall recalculation (simple average of all 8 stats) ────────────────────
// Used for verification — progression modifies overall directly for consistency.
export function calcOverall(p) {
  const sum = STAT_KEYS.reduce((s, k) => s + (p[k] || 70), 0);
  return Math.round(sum / STAT_KEYS.length);
}

// ── Age factor table ──────────────────────────────────────────────────────────
// effAge already accounts for developmentCurve offset (-2 early / +2 late).
// growChance + decChance < 1.0; the remainder is plateau.
function getAgeFactor(effAge) {
  // effAge : growChance / maxGrow / decChance / maxDec
  if (effAge <= 18) return { growChance: 0.52, maxGrow: 2.2, decChance: 0.02, maxDec: 0.8 };
  if (effAge <= 20) return { growChance: 0.65, maxGrow: 3.0, decChance: 0.04, maxDec: 0.8 };
  if (effAge <= 22) return { growChance: 0.55, maxGrow: 2.5, decChance: 0.07, maxDec: 1.0 };
  if (effAge <= 24) return { growChance: 0.40, maxGrow: 1.5, decChance: 0.12, maxDec: 1.2 };
  if (effAge <= 26) return { growChance: 0.25, maxGrow: 1.0, decChance: 0.22, maxDec: 1.8 };
  if (effAge <= 28) return { growChance: 0.14, maxGrow: 0.8, decChance: 0.38, maxDec: 2.2 };
  if (effAge <= 30) return { growChance: 0.07, maxGrow: 0.5, decChance: 0.52, maxDec: 2.8 };
  return              { growChance: 0.04, maxGrow: 0.4, decChance: 0.65, maxDec: 3.5 };
}

// ── Team performance helper ───────────────────────────────────────────────────
// Returns -1.0 (terrible season) .. +1.0 (dominant season), 0 = neutral.
function getTeamPerf(teamId, standings) {
  if (!teamId || !standings) return 0;
  const s = standings[teamId];
  if (!s) return 0;
  const total = (s.wins || 0) + (s.losses || 0);
  if (total === 0) return 0;
  return (s.wins / total - 0.5) * 2;
}

// ── Core: develop one player ──────────────────────────────────────────────────
// player.age must already be incremented (+1) BEFORE calling this.
// teamPerf: -1..+1 from getTeamPerf().
// Returns the (possibly mutated) player with an `overallDelta` field attached.
export function developPlayer(player, rng, teamPerf = 0) {
  const age      = player.age;
  const curve    = player.developmentCurve || "standard";
  const offset   = curve === "early" ? -2 : curve === "late" ? 2 : 0;
  const effAge   = age + offset;

  const af       = getAgeFactor(effAge);
  const overall  = player.overall  || 75;
  const potential= player.potential || 80;
  const headroom = Math.max(0, potential - overall);

  // Traits (1-5 scale for hidden traits, already on players)
  const we       = (player.workEthic     || 3) / 5;   // 0.2–1.0
  const adaptNorm= Math.min(99, player.adaptability || 75) / 99; // 0.4–1.0

  // Light performance modifier — affects probabilities slightly, not magnitude
  const perfMod      = teamPerf * (age >= 26 ? 0.12 : 0.06);
  const adjDecChance = Math.max(0.01, af.decChance - perfMod * 0.25);
  const adjGrowChance= Math.min(0.88, Math.max(0.02, af.growChance + perfMod * 0.25));

  const roll = rng();
  let floatDelta = 0;

  if (roll < adjDecChance) {
    // ── DECLINE ──────────────────────────────────────────────────────────────
    // High work ethic / composure resists decline
    const resist    = 0.5 + we * 0.5;
    const magnitude = rng() * af.maxDec / resist;
    floatDelta = -magnitude;

  } else if (roll < adjDecChance + adjGrowChance) {
    // ── GROWTH ───────────────────────────────────────────────────────────────
    // Headroom gates growth; traits amplify magnitude
    const hrFactor  = headroom <= 0  ? 0.00
                    : headroom <= 2  ? 0.20
                    : headroom <= 5  ? 0.55
                    : headroom <= 10 ? 0.85
                    : 1.00;
    const traitBoost = 0.50 + we * 0.40 + adaptNorm * 0.15;  // 0.5–1.05
    floatDelta = rng() * af.maxGrow * traitBoost * hrFactor;
  }
  // else PLATEAU — floatDelta stays 0

  // ── Probabilistic integer rounding ───────────────────────────────────────
  // Avoids always flushing small floats to 0.
  // 0.7 → +1 with 70% probability; 1.4 → +2 with 40% prob, else +1; etc.
  const sign     = Math.sign(floatDelta);
  const abs      = Math.abs(floatDelta);
  const intPart  = Math.floor(abs);
  const fracPart = abs - intPart;
  let intDelta   = intPart + (rng() < fracPart ? 1 : 0);
  intDelta       = intDelta * sign;

  // Clamp growth to headroom
  if (intDelta > 0) intDelta = Math.min(intDelta, headroom);

  if (intDelta === 0) {
    return { ...player, overallDelta: 0 };
  }

  const updated = { ...player };

  // Apply overall change directly
  updated.overall = Math.max(40, Math.min(99, overall + intDelta));

  // Nudge individual stats to keep sim-side ratings tracking overall.
  // Each overall point of change → 2 stat nudges of ±1.
  const numStats = Math.min(STAT_KEYS.length, Math.abs(intDelta) * 2);
  const shuffled = shuffleArr(STAT_KEYS, rng);
  const perStat  = intDelta > 0 ? 1 : -1;
  for (const stat of shuffled.slice(0, numStats)) {
    updated[stat] = Math.max(40, Math.min(99, (updated[stat] || 70) + perStat));
  }

  updated.overallDelta = updated.overall - overall;

  // Recalculate salary from new overall
  const salBase  = player.isProspect ? 80  : 180;
  const salFloor = player.isProspect ? 15  : 40;
  updated.salary = Math.round((updated.overall / 99) * salBase + salFloor) * 1000;

  return updated;
}

// ── runProgression: process all players + prospects each offseason ─────────────
// Call AFTER incrementing age (+1) on all players.
// Returns { updatedPlayers, updatedProspects, progressionLog }
export function runProgression(players, prospects, standings, season) {
  const rng = seededRng(season * 77777 + 13);
  const log = [];

  function processOne(player) {
    const oldOverall = player.overall;
    const teamPerf   = getTeamPerf(player.teamId, standings);
    const developed  = developPlayer({ ...player }, rng, teamPerf);
    log.push({
      id:         developed.id,
      name:       developed.name,
      teamId:     developed.teamId,
      age:        developed.age,
      oldOverall,
      newOverall: developed.overall,
      delta:      developed.overall - oldOverall,
      isProspect: !!developed.isProspect,
    });
    return developed;
  }

  const updatedPlayers   = players.map(processOne);
  const updatedProspects = prospects.map(processOne);

  return { updatedPlayers, updatedProspects, progressionLog: log };
}
