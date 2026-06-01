// src/engine/mapProfile.js
// CDL 2026 Map Pool / Mode Strength / Veto foundation.
//
// Pure, deterministic, read-only layer over existing roster / staff / chemistry
// data. Produces per-team mode + map ratings, identity labels, an automatic
// best-of-5 veto (projected map set), per-mode edge comparisons for previews,
// and a small (capped) map-strength modifier the match sim can opt into.
//
// Determinism: map-specific variance is seeded from a hash of (teamId + mapId)
// so a team's map "personality" is stable across renders and across a season.
// Mode ratings shift only when the underlying roster / staff / chemistry change.

import {
  CDL_2026_MAP_POOL, MODE_KEYS, MODE_META, SERIES_MODE_ORDER, MAP_BY_ID,
} from "../data/mapPool.js";
import { calcChemistry } from "./chemistry.js";

// ── Helpers ─────────────────────────────────────────────────────────────────
function clampRating(n, lo = 50, hi = 99) {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

// Small deterministic hash → unit value in [-1, 1].
function hashUnit(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // 0..1
  const u = ((h >>> 0) % 100000) / 100000;
  return u * 2 - 1;
}

function avg(arr, fn) {
  if (!arr || arr.length === 0) return 0;
  return arr.reduce((s, x) => s + fn(x), 0) / arr.length;
}

// Per-mode attribute lean from existing player attributes (same fields the
// match sim's teamStrength uses). Returns a 0–99-ish score.
function modeAttrScore(starters, modeKey) {
  const weights = {
    hardpoint: { gunny: 0.40, awareness: 0.30, objective: 0.30 },
    snd:       { searchIQ: 0.40, clutch: 0.30, composure: 0.30 },
    overload:  { gunny: 0.30, objective: 0.40, teamwork: 0.30 },
  }[modeKey];
  return avg(starters, p => {
    let s = 0;
    for (const [attr, w] of Object.entries(weights)) s += (p[attr] ?? 60) * w;
    return s;
  });
}

// Role lean — modest nudges from existing player.primary role labels.
function roleLean(starters, modeKey) {
  let n = 0;
  for (const p of starters) {
    const role = p.primary ?? "";
    if (modeKey === "hardpoint") {
      if (role === "Entry SMG" || role === "Slayer SMG") n += 1;
    } else if (modeKey === "snd") {
      if (role === "Main AR" || role === "Flex" || role === "Search Specialist") n += 1;
    } else { // overload
      if (role === "Main AR" || role === "Flex") n += 1;
    }
  }
  // 0..4 helpful starters → about 0..+2.5
  return n * 0.6;
}

// ── Staff prep bonus (modest, capped) ─────────────────────────────────────────
// Returns { hardpoint, snd, overload, vetoQuality, headCoach, analyst }.
// Bonuses are intentionally small — great staff cannot carry a bad roster.
export function calcStaffPrep(staff, teamId) {
  const teamStaff = (staff || []).filter(s => s.currentTeamId === teamId);
  const hc = teamStaff.find(s => s.role === "head_coach") ?? null;
  const an = teamStaff.find(s => s.role === "analyst") ?? null;

  const n = (v, base = 70) => ((v ?? base) - base) / 10; // ~ -2..+3 per 100-scale attr

  // Head coach: tactical helps all, respawn helps HP+OVR, snd helps S&D, discipline = consistency.
  const hcTac  = hc ? n(hc.tactical)  : 0;
  const hcResp = hc ? n(hc.respawn)   : 0;
  const hcSnd  = hc ? n(hc.snd)       : 0;
  const hcDisc = hc ? n(hc.discipline): 0;
  // Analyst: scouting helps prep across the board, tactical drives veto quality.
  const anScout = an ? n(an.scouting) : 0;
  const anTac   = an ? n(an.tactical) : 0;

  const allSmall = hcTac * 0.5 + hcDisc * 0.25 + anScout * 0.4;

  const cap = (x) => Math.max(-1, Math.min(3, x));
  return {
    hardpoint:   cap(allSmall + hcResp * 0.6),
    snd:         cap(allSmall + hcSnd  * 0.7),
    overload:    cap(allSmall + hcResp * 0.5),
    vetoQuality: Math.max(0, Math.min(3, anTac * 0.7 + anScout * 0.3)),
    headCoach:   hc,
    analyst:     an,
  };
}

// ── Build one team's map profile ──────────────────────────────────────────────
// Pure + deterministic. teamId, players (full array), staff array, season.
export function buildTeamMapProfile(teamId, players, staff, season = 1) {
  const starters = (players || []).filter(p => p.teamId === teamId && !p.isSub).slice(0, 4);
  const baseOvr = starters.length ? avg(starters, p => p.overall ?? 60) : 60;
  const chem = calcChemistry(starters.length ? starters : (players || []));
  const formAvg = starters.length ? avg(starters, p => p.form ?? 70) : 70;
  const prep = calcStaffPrep(staff, teamId);

  const chemMod = (chem - 60) * 0.05;   // ~ -3..+2
  const formMod = (formAvg - 70) * 0.05; // ~ -1.5..+1.5

  // Persistent per-franchise mode lean (stable across seasons) so teams develop
  // real HP / S&D / Overload identities even when raw attributes are balanced.
  const modeBias = {
    hardpoint: hashUnit(`${teamId}:bias:hardpoint`) * 4,
    snd:       hashUnit(`${teamId}:bias:snd`) * 4,
    overload:  hashUnit(`${teamId}:bias:overload`) * 4,
  };

  const modeRatings = {};
  for (const modeKey of MODE_KEYS) {
    const attr = modeAttrScore(starters, modeKey);      // ~ player attribute lean
    const lean = roleLean(starters, modeKey);
    // Blend: mostly base OVR, nudged by mode attribute lean relative to OVR.
    const attrNudge = (attr - baseOvr) * 0.35;
    const raw = baseOvr + attrNudge + lean + chemMod + formMod + modeBias[modeKey] + (prep[modeKey] ?? 0);
    modeRatings[modeKey] = clampRating(raw);
  }

  // Map ratings: mode rating + deterministic per-map variance (persistent).
  // Stronger teams get a tighter (deeper) pool; weaker teams more uneven.
  const spread = baseOvr >= 86 ? 4 : baseOvr >= 80 ? 5.5 : baseOvr >= 74 ? 7 : 8.5;
  const mapRatings = {};
  for (const modeKey of MODE_KEYS) {
    for (const m of CDL_2026_MAP_POOL[modeKey]) {
      const variance = hashUnit(`${teamId}:${m.id}`) * spread;
      mapRatings[m.id] = clampRating(modeRatings[modeKey] + variance);
    }
  }

  const { strengths, weaknesses } = deriveStrengthsWeaknesses(mapRatings);
  const identity = deriveIdentity(modeRatings, mapRatings);

  return {
    teamId,
    modeRatings,
    mapRatings,
    strengths,
    weaknesses,
    identity,
    staffPrep: { hardpoint: round1(prep.hardpoint), snd: round1(prep.snd), overload: round1(prep.overload), vetoQuality: round1(prep.vetoQuality) },
    lastUpdatedSeason: season,
  };
}

function round1(n) { return Math.round((n ?? 0) * 10) / 10; }

function deriveStrengthsWeaknesses(mapRatings) {
  const rows = Object.entries(mapRatings)
    .map(([id, r]) => ({ id, r, label: `${MAP_BY_ID[id]?.name} ${MODE_META[MAP_BY_ID[id]?.modeKey]?.short}` }))
    .sort((a, b) => b.r - a.r);
  const strengths = rows.slice(0, 3).map(x => x.label);
  const weaknesses = rows.slice(-2).reverse().map(x => x.label);
  return { strengths, weaknesses };
}

function deriveIdentity(modeRatings, mapRatings) {
  const hp = modeRatings.hardpoint, sd = modeRatings.snd, ov = modeRatings.overload;
  const max = Math.max(hp, sd, ov), min = Math.min(hp, sd, ov);
  const modeSpread = max - min;
  const mapVals = Object.values(mapRatings);
  const mapSpread = Math.max(...mapVals) - Math.min(...mapVals);
  const overall = (hp + sd + ov) / 3;

  // Shallow / upset descriptors first.
  if (mapSpread >= 14 && overall < 76) return "Shallow Map Pool";
  if (overall < 74 && max >= 78) return "Upset Threat";

  if (modeSpread <= 3) return overall >= 84 ? "Balanced Contender" : "Fundamentals Team";

  if (hp === max) return hp - Math.max(sd, ov) >= 5 ? "Hardpoint Heavy" : "Respawn Heavy";
  if (sd === max) return "S&D Specialist";
  if (ov === max) return "Overload Specialists";
  if (sd === min && max - sd >= 6) return "Weak S&D Side";
  return "Balanced Contender";
}

// ── Read a team's profile from state, with safe fallback derivation ────────────
// Never mutates state. If a stored profile is missing/stale it derives one on
// the fly (deterministic, so identical to what would be stored).
export function getTeamMapProfile(state, teamId) {
  const season = state?.season ?? 1;
  const stored = state?.teamMapProfiles?.[teamId];
  if (stored && stored.lastUpdatedSeason === season && stored.modeRatings) return stored;

  // Challenger / temporary event teams: derive from their event roster, no staff.
  const eventTeam = state?.schedule?.currentMajorEventTeams?.[teamId];
  if (eventTeam) {
    const players = (eventTeam.players || []).map(p => ({ ...p, teamId }));
    return buildTeamMapProfile(teamId, players, [], season);
  }
  return buildTeamMapProfile(teamId, state?.players || [], state?.staff || [], season);
}

// ── Build / refresh all CDL team profiles (stored in save state) ───────────────
export function buildAllMapProfiles(state) {
  const season = state?.season ?? 1;
  const out = {};
  // Lazy import avoided — CDL_TEAMS is small; read teamIds from players + known set.
  const teamIds = new Set((state?.players || []).map(p => p.teamId).filter(Boolean));
  for (const teamId of teamIds) {
    out[teamId] = buildTeamMapProfile(teamId, state.players, state.staff || [], season);
  }
  return out;
}

// Ensure profiles exist & match the current season. Returns a (possibly new)
// teamMapProfiles object. Call only from reducer triggers — never on render.
export function ensureTeamMapProfiles(state, { force = false } = {}) {
  const season = state?.season ?? 1;
  const existing = state?.teamMapProfiles;
  const valid = existing && Object.values(existing).some(p => p?.lastUpdatedSeason === season);
  if (!force && valid) return existing;
  return buildAllMapProfiles(state);
}

// ── Per-mode edge comparison (for previews) ────────────────────────────────────
export function computeModeEdges(profileA, profileB) {
  const out = {};
  for (const modeKey of MODE_KEYS) {
    const a = profileA?.modeRatings?.[modeKey] ?? 70;
    const b = profileB?.modeRatings?.[modeKey] ?? 70;
    out[modeKey] = a - b; // positive = A favoured
  }
  return out;
}

// ── Automatic best-of-5 veto / projected map set ───────────────────────────────
// Deterministic from the two profiles (seeded by team ids) so the preview and the
// actual simulated series agree. Models alternating pick / counter-pick:
//   slot order modes: HP, S&D, OVR, HP, S&D
//   pick order:       fav, dog, fav, dog, fav
// Favourite picks maps that maximise its own rating + edge; underdog picks comfort
// maps (its own best), occasionally forcing a high-variance map.
export function autoVeto(profileA, profileB) {
  const idA = profileA?.teamId ?? "a";
  const idB = profileB?.teamId ?? "b";
  const sumA = MODE_KEYS.reduce((s, k) => s + (profileA?.modeRatings?.[k] ?? 70), 0);
  const sumB = MODE_KEYS.reduce((s, k) => s + (profileB?.modeRatings?.[k] ?? 70), 0);
  const favIsA = sumA >= sumB;
  const fav = favIsA ? profileA : profileB;
  const dog = favIsA ? profileB : profileA;

  // Underdogs sometimes (deterministically) gamble on high-variance maps.
  const dogGambles = hashUnit(`${idA}|${idB}|veto`) > 0.45;

  const usedByMode = { hardpoint: new Set(), snd: new Set(), overload: new Set() };
  const pickOrder = ["fav", "dog", "fav", "dog", "fav"];

  const ratingOf = (profile, mapId) =>
    profile?.mapRatings?.[mapId] ?? profile?.modeRatings?.[MAP_BY_ID[mapId]?.modeKey] ?? 70;

  const series = SERIES_MODE_ORDER.map((modeKey, slot) => {
    const candidates = (CDL_2026_MAP_POOL[modeKey] || []).filter(m => !usedByMode[modeKey].has(m.id));
    const picker = pickOrder[slot];
    let best = candidates[0];
    let bestScore = -Infinity;
    for (const m of candidates) {
      const rFav = ratingOf(fav, m.id);
      const rDog = ratingOf(dog, m.id);
      let score;
      if (picker === "fav") {
        // Favourite: maximise own rating + its edge over the dog.
        score = rFav * 0.6 + (rFav - rDog) * 0.4;
      } else {
        // Underdog: comfort (own best) — or gamble on its single biggest edge map.
        score = dogGambles ? (rDog - rFav) * 0.5 + rDog * 0.5 : rDog;
      }
      // Deterministic tie-break.
      score += hashUnit(`${idA}|${idB}|${m.id}|${slot}`) * 0.01;
      if (score > bestScore) { bestScore = score; best = m; }
    }
    if (best) usedByMode[modeKey].add(best.id);
    const rA = ratingOf(profileA, best?.id);
    const rB = ratingOf(profileB, best?.id);
    return {
      slot: slot + 1,
      modeKey,
      mode: MODE_META[modeKey].name,
      short: MODE_META[modeKey].short,
      id: best?.id ?? null,
      name: best ? MAP_BY_ID[best.id]?.name : "TBD",
      ratingA: rA,
      ratingB: rB,
      edgeA: rA - rB, // positive = team A favoured on this map
    };
  });
  return series;
}

// ── Match-sim influence: capped strength modifier from a map edge ──────────────
// raw = ratingA - ratingB on the selected map. Returns a small strength delta to
// add to team A's map strength (and implicitly subtract from B). Capped tightly
// so a strong map pool helps but never makes a result automatic.
export function mapStrengthMod(edgeA) {
  const MOD_SCALE = 0.2;   // 0.2 strength per rating point of edge
  const CAP = 3.5;         // hard cap in strength units (mapWinProb divides by 8)
  return Math.max(-CAP, Math.min(CAP, (edgeA ?? 0) * MOD_SCALE));
}
