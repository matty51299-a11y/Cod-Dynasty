// src/engine/progression.js
// Offseason player development and regression.
//
// TWO-TIER MODEL
// ──────────────
// Tier 1 — Base development (runs for every player):
//   Roll for GROWTH / PLATEAU / DECLINE based on age curve.
//   Magnitude is continuous and weighted by traits + headroom + potential.
//   Result is probabilistically rounded to integer.
//   Typical outcome: −2 to +4 for most players.
//
// Tier 2 — Special event (independent roll, separate from Tier 1):
//   A percentage of players each offseason hit a BREAKOUT or COLLAPSE.
//   These are rolled independently so events can amplify or dampen the base.
//   Breakout probability:  high for young + high headroom + good workEthic
//   Collapse probability:  high for old + low workEthic + bad season
//
// Base age curve maxima (after rebalance):
//   eff age ≤18:  grow ~0–3.8  dec ~0–0.8
//   eff age 19-20: grow ~0–5.0  dec ~0–0.7   ← peak development
//   eff age 21-22: grow ~0–4.5  dec ~0–1.0
//   eff age 23-24: grow ~0–2.8  dec ~0–1.5
//   eff age 25-26: grow ~0–1.4  dec ~0–2.5
//   eff age 27-28: grow ~0–0.9  dec ~0–3.5
//   eff age 29-30: grow ~0–0.5  dec ~0–5.0
//   eff age 31+:   grow ~0–0.3  dec ~0–6.0
//
// potentialMult: scales growth with remaining headroom.
//   headroom=0:  1.00 (blocked by hrFactor anyway)
//   headroom=5:  1.11
//   headroom=10: 1.23
//   headroom=14: 1.32
//   headroom≥20: 1.45
//
// Breakout bonus range: +3 to +12 (magnitude biased toward lower end)
// Collapse drop range:  −3 to −8  (magnitude biased toward lower end)
// Expected breakouts league-wide per offseason: ~5–10
// Expected collapses league-wide per offseason: ~4–8

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

// ── Overall recalculation ─────────────────────────────────────────────────────
export function calcOverall(p) {
  const sum = STAT_KEYS.reduce((s, k) => s + (p[k] || 70), 0);
  return Math.round(sum / STAT_KEYS.length);
}

// ── Tier 1: Base age curve ────────────────────────────────────────────────────
// growChance + decChance < 1.0; remainder is plateau probability.
//
// Changes vs previous version:
//   ≤18: growChance +0.06, maxGrow +0.8
//   ≤20: growChance +0.07, maxGrow +1.0 (primary youth buff)
//   ≤22: growChance +0.07, maxGrow +1.0
//   ≤24: growChance +0.04, maxGrow +0.6
//   ≤26: maxGrow +0.1 (minimal)
//   28+: growChance slightly trimmed to offset potentialMult on veterans
function getAgeFactor(effAge) {
  if (effAge <= 18) return { growChance: 0.58, maxGrow: 3.8, decChance: 0.02, maxDec: 0.8  };
  if (effAge <= 20) return { growChance: 0.72, maxGrow: 5.0, decChance: 0.03, maxDec: 0.7  };
  if (effAge <= 22) return { growChance: 0.62, maxGrow: 4.5, decChance: 0.06, maxDec: 1.0  };
  if (effAge <= 24) return { growChance: 0.44, maxGrow: 2.8, decChance: 0.12, maxDec: 1.5  };
  if (effAge <= 26) return { growChance: 0.26, maxGrow: 1.4, decChance: 0.24, maxDec: 2.5  };
  if (effAge <= 28) return { growChance: 0.13, maxGrow: 0.9, decChance: 0.40, maxDec: 3.5  };
  if (effAge <= 30) return { growChance: 0.06, maxGrow: 0.5, decChance: 0.55, maxDec: 5.0  };
  return              { growChance: 0.03, maxGrow: 0.3, decChance: 0.68, maxDec: 6.0  };
}

// ── Team performance helper ───────────────────────────────────────────────────
function getTeamPerf(teamId, standings) {
  if (!teamId || !standings) return 0;
  const s = standings[teamId];
  if (!s) return 0;
  const total = (s.wins || 0) + (s.losses || 0);
  if (total === 0) return 0;
  return (s.wins / total - 0.5) * 2; // −1.0 .. +1.0
}

// ── Tier 2: Breakout / Collapse event ─────────────────────────────────────────
// Always consumes exactly 2 rng draws for the probability rolls.
// Consumes 2 more only if an event fires (magnitude draws).
// Returns { eventDelta, eventType: "breakout" | "collapse" | null }
function specialEvent(player, rng, teamPerf, headroom) {
  const age    = player.age;
  const curve  = player.developmentCurve || "standard";
  const offset = curve === "early" ? -2 : curve === "late" ? 2 : 0;
  const effAge = age + offset;
  const we     = (player.workEthic || 3) / 5; // 0.2–1.0

  // ── Breakout probability ──────────────────────────────────────────────────
  // Only young players with genuine headroom can break out.
  // Rates increased vs previous: young + high-headroom prospects now break out
  // more often to match the expectation that high-potential players develop.
  let breakChance = 0;
  if (headroom > 0) {
    if (effAge <= 20) {
      breakChance = headroom >= 15 ? 0.22
                  : headroom >= 12 ? 0.18   // was 0.14
                  : headroom >= 8  ? 0.12   // was 0.10
                  : headroom >= 5  ? 0.07   // was 0.06
                  : 0.02;
    } else if (effAge <= 22) {
      breakChance = headroom >= 12 ? 0.12   // was 0.09 (at >= 10)
                  : headroom >= 8  ? 0.07   // restructured (was 0.05 at >= 6)
                  : headroom >= 5  ? 0.04   // was 0.02 (at >= 3)
                  : headroom >= 3  ? 0.02
                  : 0;
    } else if (effAge <= 24) {
      breakChance = headroom >= 12 ? 0.07   // was 0.05 (at >= 10)
                  : headroom >= 8  ? 0.04   // was 0.02 (at >= 6)
                  : headroom >= 5  ? 0.01   // new
                  : 0;
    } else if (effAge <= 26) {
      // Late developer — slightly raised
      breakChance = headroom >= 10 ? 0.025 : headroom >= 8 ? 0.015 : 0;
    }
    // workEthic multiplier: 0.55 (workEthic=1) → 1.45 (workEthic=5)
    breakChance *= (0.55 + we * 0.90);
    // Good young performance gives a small nudge
    if (effAge <= 24 && teamPerf > 0.3) breakChance += 0.025;
  }

  // ── Collapse probability (unchanged) ─────────────────────────────────────
  let collapseChance = 0;
  if      (effAge >= 31) collapseChance = 0.18;
  else if (effAge >= 29) collapseChance = 0.12;
  else if (effAge >= 27) collapseChance = 0.06;
  else if (effAge >= 25) collapseChance = 0.02;

  // Low workEthic dramatically raises collapse risk
  if      (we < 0.4) collapseChance += 0.09;  // workEthic 1
  else if (we < 0.6) collapseChance += 0.04;  // workEthic 2

  // Bad season significantly raises collapse risk for aging players
  if (teamPerf < -0.3 && effAge >= 25) collapseChance += 0.10;

  // ── Rolls (both always consumed to keep PRNG sequence stable) ────────────
  const breakRoll    = rng();
  const collapseRoll = rng();

  if (breakRoll < breakChance) {
    // Bonus magnitude: 3–12, biased toward lower end via min(u, v).
    // Higher ceiling for very large headroom (was max 9).
    const maxBonus = headroom >= 15 ? 12
                   : headroom >= 12 ? 10   // was 9
                   : headroom >= 8  ? 8    // was 7
                   : headroom >= 5  ? 6    // was 5
                   : 4;
    const bonus = 3 + Math.floor(Math.min(rng(), rng()) * (maxBonus - 2));
    return { eventDelta: Math.min(headroom, bonus), eventType: "breakout" };
  }

  if (collapseRoll < collapseChance) {
    // Drop magnitude: 3–8, biased toward 3–4 via min(u, v) — unchanged
    const maxDrop = effAge >= 31 ? 8
                  : effAge >= 29 ? 6
                  : effAge >= 27 ? 5
                  : 4;
    const drop = 3 + Math.floor(Math.min(rng(), rng()) * (maxDrop - 2));
    return { eventDelta: -drop, eventType: "collapse" };
  }

  return { eventDelta: 0, eventType: null };
}

// ── Core: develop one player ──────────────────────────────────────────────────
// player.age must be incremented (+1) BEFORE calling.
// Returns { player, eventType } — eventType NOT stored on the player object.
export function developPlayer(player, rng, teamPerf = 0) {
  const age      = player.age;
  const curve    = player.developmentCurve || "standard";
  const offset   = curve === "early" ? -2 : curve === "late" ? 2 : 0;
  const effAge   = age + offset;

  const af       = getAgeFactor(effAge);
  const overall  = player.overall  || 75;
  const potential= player.potential || 80;
  const headroom = Math.max(0, potential - overall);

  const we       = (player.workEthic     || 3) / 5;
  const adaptNorm= Math.min(99, player.adaptability || 75) / 99;

  // ── Tier 1: Base development roll ────────────────────────────────────────
  const perfMod       = teamPerf * (age >= 26 ? 0.12 : 0.06);
  const adjDecChance  = Math.max(0.01, af.decChance - perfMod * 0.25);
  const adjGrowChance = Math.min(0.88, Math.max(0.02, af.growChance + perfMod * 0.25));

  const roll = rng();
  let floatDelta = 0;

  if (roll < adjDecChance) {
    const resist    = 0.5 + we * 0.5;
    floatDelta      = -(rng() * af.maxDec / resist);
  } else if (roll < adjDecChance + adjGrowChance) {
    // hrFactor: smoothed bands (was 0.22/0.55/0.85/1.0)
    const hrFactor  = headroom <= 0  ? 0.00
                    : headroom <= 2  ? 0.28   // was 0.22
                    : headroom <= 5  ? 0.60   // was 0.55
                    : headroom <= 10 ? 0.88   // was 0.85
                    : 1.00;

    // potentialMult: NEW — continuously scales with remaining headroom so that
    // high-potential players grow materially faster than low-headroom ones.
    //   headroom=0:  1.00 (moot; hrFactor already = 0)
    //   headroom=5:  1.11
    //   headroom=10: 1.23
    //   headroom=14: 1.32
    //   headroom≥20: 1.45
    const potentialMult = headroom > 0
      ? (1.0 + (Math.min(headroom, 20) / 20) * 0.45)
      : 1.0;

    const traitBoost = 0.50 + we * 0.40 + adaptNorm * 0.15;
    floatDelta       = rng() * af.maxGrow * traitBoost * hrFactor * potentialMult;
  }

  // Probabilistic integer rounding (0.7 → +1 with 70% prob, etc.)
  const sign      = Math.sign(floatDelta);
  const abs       = Math.abs(floatDelta);
  const intPart   = Math.floor(abs);
  const fracPart  = abs - intPart;
  let   baseDelta = (intPart + (rng() < fracPart ? 1 : 0)) * sign;

  // ── Tier 2: Special event ─────────────────────────────────────────────────
  const { eventDelta, eventType } = specialEvent(player, rng, teamPerf, headroom);

  // ── Combine ──────────────────────────────────────────────────────────────
  let totalDelta = baseDelta + eventDelta;
  // Growth cannot exceed remaining headroom
  if (totalDelta > 0) totalDelta = Math.min(totalDelta, headroom);

  if (totalDelta === 0) {
    return { player: { ...player }, eventType: null };
  }

  const updated = { ...player };
  updated.overall = Math.max(40, Math.min(99, overall + totalDelta));

  // Nudge individual stats to keep sim-side ratings consistent.
  // 2 stat points per overall point of change.
  const numStats = Math.min(STAT_KEYS.length, Math.abs(totalDelta) * 2);
  const shuffled = shuffleArr(STAT_KEYS, rng);
  const perStat  = totalDelta > 0 ? 1 : -1;
  for (const stat of shuffled.slice(0, numStats)) {
    updated[stat] = Math.max(40, Math.min(99, (updated[stat] || 70) + perStat));
  }

  // Only recalculate salary for unsigned players (free agents and prospects).
  // Signed players keep their negotiated salary for the life of their contract.
  if (!updated.teamId) {
    if (player.isProspect) {
      updated.salary = Math.round((updated.overall / 99) * 50 + 15) * 1000;
    } else {
      const t = Math.max(0, (updated.overall - 70) / 29);
      updated.salary = Math.round((Math.pow(t, 2.5) * 575 + 25)) * 1000;
    }
  }

  return { player: updated, eventType: eventType || null };
}

// ── runProgression: process all players + prospects each offseason ─────────────
// player.age must already be incremented before calling.
// Returns { updatedPlayers, updatedProspects, progressionLog }
export function runProgression(players, prospects, standings, season) {
  const rng = seededRng(season * 77777 + 13);
  const log = [];

  function processOne(p) {
    const oldOverall = p.overall;
    const teamPerf   = getTeamPerf(p.teamId, standings);
    const { player: developed, eventType } = developPlayer({ ...p }, rng, teamPerf);
    log.push({
      id:         developed.id,
      name:       developed.name,
      teamId:     developed.teamId,
      age:        developed.age,
      oldOverall,
      newOverall: developed.overall,
      delta:      developed.overall - oldOverall,
      isProspect: !!developed.isProspect,
      eventType,  // "breakout" | "collapse" | null
    });
    return developed;
  }

  const updatedPlayers   = players.map(processOne);
  const updatedProspects = prospects.map(processOne);

  return { updatedPlayers, updatedProspects, progressionLog: log };
}
