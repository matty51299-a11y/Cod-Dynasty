// src/engine/scoutingEngine.js
// Prospect Scouting 2.0 — visibility / uncertainty layer.
//
// IMPORTANT: this module NEVER mutates player ratings. True OVR/POT stay on the
// player objects and remain the source of truth for the match sim, progression,
// roster AI, awards, etc. Everything here is a pure, deterministic *derivation*
// that controls what the user is allowed to see and how confident the scout
// report is. Established CDL players / user-owned players are shown exactly;
// prospects, young unsigned players and low-sample challengers are obscured into
// estimated ranges until the user scouts them.
//
// Storage lives in `state.userScouting` (see migrateUserScouting). Old saves
// that lack the field hydrate to an empty structure and estimates are generated
// lazily on view — nothing is baked into the save unless the user scouts.

import { isCdlTeamId, isInactivePlayer } from "../utils/playerIdentity.js";

export const SCOUT_VERSION = 1;

// Confidence band boundaries (inclusive lower bound).
export const SCOUT_BANDS = [
  { min: 0,   level: 0, label: "Unknown",        report: "Not enough information" },
  { min: 25,  level: 1, label: "Basic Report",   report: "Early read, wide margins" },
  { min: 50,  level: 2, label: "Detailed Report", report: "Solid read on the profile" },
  { min: 75,  level: 3, label: "Advanced Report", report: "Reliable projection" },
  { min: 100, level: 4, label: "Fully Scouted",  report: "Complete profile" },
];

// Tuning constants.
const OVR_MAX_HALF = 9;     // half-width of OVR range at 0% confidence
const POT_MAX_HALF = 11;    // POT is inherently more uncertain than current OVR
const BIAS_SCALE   = 4;     // how far a scout's central estimate can be "wrong"
const ESTABLISHED_MAPS = 36; // CDL maps of sample that make a player "known"
const BASE_FLOOR_MIN = 8;
const BASE_FLOOR_MAX = 96;

// ── Tiny deterministic helpers ───────────────────────────────────────────────
function hashStr(str) {
  let h = 2166136261 >>> 0;
  const s = String(str ?? "");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
// deterministic unit float 0..1 from any key
function unit(key) { return (hashStr(key) % 100000) / 100000; }
// deterministic signed unit -1..1
function signedUnit(key) { return unit(key) * 2 - 1; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function clamp01(v) { return clamp(v, 0, 1); }
function clampRating(v) { return clamp(Math.round(v), 40, 99); }

// ── Migration / hydration ────────────────────────────────────────────────────
export function migrateUserScouting(existing) {
  const e = existing && typeof existing === "object" ? existing : {};
  return {
    version: SCOUT_VERSION,
    players: e.players && typeof e.players === "object" ? e.players : {},
    shortlist: Array.isArray(e.shortlist) ? e.shortlist.filter(Boolean) : [],
    assignmentsUsed: e.assignmentsUsed && typeof e.assignmentsUsed === "object" ? e.assignmentsUsed : {},
  };
}

// ── Staff scouting power ─────────────────────────────────────────────────────
// Combines the user team's Assistant GM, Analyst and Head Coach into a single
// 0..1 "power" plus per-role sub-scores. GM drives identification/efficiency,
// Analyst drives report accuracy / hidden-gem detection, Head Coach contributes
// a smaller development-projection signal.
export function getStaffScoutPower(state, teamId = state?.userTeamId) {
  const staff = (state?.staff || []).filter(s => s.currentTeamId === teamId);
  const gm = staff.find(s => s.role === "assistant_gm");
  const an = staff.find(s => s.role === "analyst");
  const hc = staff.find(s => s.role === "head_coach");

  const gmScore = (gm?.scouting ?? 55) * 0.6 + (gm?.reputation ?? 55) * 0.2 + (gm?.negotiation ?? 55) * 0.2;
  const anScore = (an?.scouting ?? 50) * 0.5 + (an?.tactical ?? 55) * 0.3 + (an?.discipline ?? 55) * 0.2;
  const hcScore = (hc?.development ?? 55) * 0.5 + (hc?.tactical ?? 55) * 0.5;

  const raw = gmScore * 0.4 + anScore * 0.45 + hcScore * 0.15; // ~40..95
  const power = clamp01((raw - 42) / 48);                      // 42→0, 90→1
  return { gm, an, hc, gmScore, anScore, hcScore, raw, power, hasAnalyst: !!an, hasGm: !!gm };
}

// ── Sample / established detection ───────────────────────────────────────────
export function getPlayerCdlSample(player, state) {
  if (!player?.id) return 0;
  const rows = state?.playerSeasonStats?.[player.id] || [];
  return rows.reduce((sum, r) => sum + (r.matches || 0), 0);
}

// A player is "established" (shown with exact ratings) when the user owns them,
// when they are an active non-prospect on any CDL roster, when they carry a
// meaningful CDL sample, or when they are an older former-pro free agent.
export function isEstablishedPlayer(player, state) {
  if (!player) return true;
  if (player.teamId && player.teamId === state?.userTeamId) return true;
  if (player.teamId && isCdlTeamId(player.teamId) && !player.isProspect && !isInactivePlayer(player)) return true;
  if (getPlayerCdlSample(player, state) >= ESTABLISHED_MAPS) return true;
  // Older former-pro free agents are reasonably well known.
  if ((player.age ?? 22) >= 26 && player.previousTeamId && isCdlTeamId(player.previousTeamId)) return true;
  return false;
}

// Scouting uncertainty applies to everyone who isn't established: prospects,
// young unsigned players, low-sample challengers, the yearly prospect pool, etc.
export function isScoutTarget(player, state) {
  if (!player || isInactivePlayer(player)) return false;
  return !isEstablishedPlayer(player, state);
}

// ── Confidence ───────────────────────────────────────────────────────────────
// Intrinsic floor before any user scouting. Better staff, more sample and older
// players start at a higher floor; raw teenage prospects start very low.
export function getBaseConfidence(player, state) {
  if (isEstablishedPlayer(player, state)) return 100;
  const { power } = getStaffScoutPower(state, state?.userTeamId);
  const sample = getPlayerCdlSample(player, state);
  const age = player.age ?? 20;

  let base = 12;
  base += power * 22;                       // staff knowledge
  base += Math.min(sample, 30) * 0.5;       // any prior data helps
  base += age >= 23 ? 7 : age >= 21 ? 3 : 0; // older = a known quantity
  base += unit((player.id || player.name) + ":basejit") * 8; // per-player variety
  return Math.round(clamp(base, BASE_FLOOR_MIN, BASE_FLOOR_MAX));
}

// Total confidence shown to the user (0..100).
export function getPlayerScoutingConfidence(player, state) {
  if (isEstablishedPlayer(player, state)) return 100;
  const applied = state?.userScouting?.players?.[player.id]?.applied || 0;
  return Math.round(clamp(getBaseConfidence(player, state) + applied, 0, 100));
}

export function getConfidenceBand(conf) {
  let band = SCOUT_BANDS[0];
  for (const b of SCOUT_BANDS) if (conf >= b.min) band = b;
  return band;
}

// ── Estimated ranges ─────────────────────────────────────────────────────────
// Based on the true value but widened by uncertainty and shifted by a small,
// deterministic per-player bias (so some prospects read as overrated and some
// as hidden gems). The bias and width both shrink to zero as confidence → 100.
function estimateRange(trueVal, conf, player, salt, maxHalf) {
  const frac = clamp01(1 - conf / 100);
  let half = Math.round(frac * maxHalf);
  if (conf < 100) half = Math.max(half, 1); // never collapse to an exact number early
  const bias = Math.round(signedUnit((player.id || player.name) + ":" + salt) * frac * BIAS_SCALE);
  const center = clampRating(trueVal + bias);
  const min = clampRating(center - half);
  const max = clampRating(center + half);
  return { min: Math.min(min, max), max: Math.max(min, max) };
}

// Returns { exact:true, value } for established/fully-scouted players, otherwise
// { exact:false, min, max }. UI should render the range when exact is false and
// must not surface the precise number until exact is true.
export function getDisplayOvr(player, state) {
  if (!player) return { exact: true, value: 0 };
  if (isEstablishedPlayer(player, state)) return { exact: true, value: player.overall };
  const conf = getPlayerScoutingConfidence(player, state);
  if (conf >= 100) return { exact: true, value: player.overall };
  return { exact: false, ...estimateRange(player.overall, conf, player, "ovr", OVR_MAX_HALF) };
}

export function getDisplayPot(player, state) {
  if (!player) return { exact: true, value: 0 };
  if (isEstablishedPlayer(player, state)) return { exact: true, value: player.potential };
  const conf = getPlayerScoutingConfidence(player, state);
  if (conf >= 100) return { exact: true, value: player.potential };
  return { exact: false, ...estimateRange(player.potential, conf, player, "pot", POT_MAX_HALF) };
}

// Convenience formatter: "75" or "73-76".
export function formatDisplayRating(disp) {
  if (!disp) return "?";
  return disp.exact ? `${disp.value}` : `${disp.min}-${disp.max}`;
}

// ── Risk ─────────────────────────────────────────────────────────────────────
// Risk blends real variance signals (potential gap, ego, composure, age) with
// scouting uncertainty: a thinly-scouted player reads as riskier because the
// scout simply doesn't know yet. Risk de-escalates as confidence improves.
export function computeRisk(player, state, conf = getPlayerScoutingConfidence(player, state)) {
  if (isEstablishedPlayer(player, state) && conf >= 100) {
    return (player.potential - player.overall) >= 9 ? "High Ceiling" : "Low";
  }
  const gap = (player.potential ?? player.overall) - (player.overall ?? 70);
  const ego = player.ego ?? 2;                 // 1..5
  const composure = player.composure ?? 70;
  const tilt = player.tiltResistance ?? 3;     // 1..5
  const age = player.age ?? 20;

  let score = 0;
  score += gap >= 14 ? 3 : gap >= 9 ? 2 : gap >= 5 ? 1 : 0; // upside = volatility
  score += ego >= 4 ? 2 : ego >= 3 ? 1 : 0;
  score += composure < 68 ? 2 : composure < 74 ? 1 : 0;
  score += tilt <= 2 ? 1 : 0;
  score += age <= 18 ? 1 : 0;
  score += (100 - conf) / 30;                  // uncertainty penalty (0..~3)

  if (gap >= 12 && (ego >= 4 || tilt <= 2)) return "Boom/Bust";
  if (gap >= 11 && score >= 4) return "High Ceiling";
  if (score >= 6) return "High";
  if (score >= 3) return "Medium";
  if (gap <= 4 && composure >= 76) return "Safe Floor";
  return "Low";
}

// ── Hidden gem / bust signals (analyst-driven, noisy) ────────────────────────
// An "analyst hunch" correlates with the true potential gap but is degraded by a
// weak analyst into noise — so strong analysts reliably surface real gems while
// weak ones produce false positives. Returns 0..1. Used only to *recommend who
// to investigate*; it never reveals the exact rating.
export function analystHunch(player, state) {
  const gap = (player.potential ?? player.overall) - (player.overall ?? 70);
  const gapSignal = clamp01(gap / 18);
  const recent = clamp01(((player.form ?? 65) - 60) / 30);
  const truthSignal = clamp01(gapSignal * 0.75 + recent * 0.25);
  const { anScore } = getStaffScoutPower(state, state?.userTeamId);
  const accuracy = clamp01((anScore - 45) / 45);
  const noise = unit((player.id || player.name) + ":hunch");
  return clamp01(truthSignal * accuracy + noise * (1 - accuracy));
}

export function isHiddenGemCandidate(player, state) {
  if (!isScoutTarget(player, state)) return false;
  const ovr = getDisplayOvr(player, state);
  const ovrMid = ovr.exact ? ovr.value : (ovr.min + ovr.max) / 2;
  const conf = getPlayerScoutingConfidence(player, state);
  return (player.age ?? 20) <= 21 && ovrMid < 76 && conf < 75 && analystHunch(player, state) >= 0.62;
}

export function isBustRiskCandidate(player, state) {
  if (!isScoutTarget(player, state)) return false;
  const risk = computeRisk(player, state);
  const pot = getDisplayPot(player, state);
  const potMid = pot.exact ? pot.value : (pot.min + pot.max) / 2;
  return (risk === "Boom/Bust" || risk === "High") && potMid >= 84;
}

// ── Strengths / weaknesses / traits / notes (progressive reveal) ─────────────
const STRENGTH_SOURCES = [
  { key: "gunny",        hi: "Explosive slaying pace",  ent: "Strong entry pace" },
  { key: "searchIQ",     hi: "Elite S&D instincts",     ent: "Good S&D reads" },
  { key: "awareness",    hi: "High map awareness",      ent: "Reads rotations well" },
  { key: "objective",    hi: "Objective monster",       ent: "Plays the objective" },
  { key: "clutch",       hi: "Ice-cold in clutches",    ent: "Calm in close maps" },
  { key: "teamwork",     hi: "Excellent comms",         ent: "Plays for the team" },
  { key: "composure",    hi: "Unshakeable composure",   ent: "Steady under pressure" },
  { key: "adaptability", hi: "Flexible role fit",       ent: "Adapts to any role" },
];
const WEAKNESS_SOURCES = [
  { key: "awareness",    lo: "Raw positioning" },
  { key: "objective",    lo: "Weak respawn fundamentals" },
  { key: "searchIQ",     lo: "Shaky S&D discipline" },
  { key: "composure",    lo: "Rattles under pressure" },
  { key: "teamwork",     lo: "Plays too individually" },
  { key: "gunny",        lo: "Inconsistent slaying" },
  { key: "clutch",       lo: "Struggles in clutches" },
];

function strengthsFor(player, count) {
  const ranked = STRENGTH_SOURCES
    .map(s => ({ ...s, v: player[s.key] ?? 60 }))
    .sort((a, b) => b.v - a.v);
  return ranked.slice(0, count).map(s => (s.v >= 86 ? s.hi : s.ent));
}
function weaknessesFor(player, count) {
  const ranked = WEAKNESS_SOURCES
    .map(s => ({ ...s, v: player[s.key] ?? 60 }))
    .sort((a, b) => a.v - b.v);
  const out = [];
  for (const s of ranked) {
    if (s.v <= 72 && out.length < count) out.push(s.lo);
  }
  // low sample is always a fair early note for prospects
  return out;
}

// Hidden-trait → scouting label mapping. Revealed progressively with confidence.
function traitLabelsFor(player) {
  const out = [];
  if ((player.gunny ?? 70) >= 84) out.push("High Pace");
  if ((player.workEthic ?? 3) >= 4) out.push("Coachable");
  if ((player.workEthic ?? 3) <= 2) out.push("Low Motor");
  if ((player.ego ?? 2) >= 4) out.push("High Ego");
  if ((player.tiltResistance ?? 3) <= 2) out.push("Streaky");
  if ((player.tiltResistance ?? 3) >= 4) out.push("Calm Under Fire");
  if ((player.leadership ?? 2) >= 4) out.push("Vocal Leader");
  if ((player.metaDependence ?? 2) >= 4) out.push("Meta Dependent");
  if ((player.adaptability ?? 70) >= 84) out.push("Role Flexible");
  return out;
}

// ── Full scouting summary (the report object the UI renders) ──────────────────
export function getScoutingSummary(player, state) {
  const established = isEstablishedPlayer(player, state);
  const conf = getPlayerScoutingConfidence(player, state);
  const band = getConfidenceBand(conf);
  const target = isScoutTarget(player, state);
  const displayOvr = getDisplayOvr(player, state);
  const displayPot = getDisplayPot(player, state);
  const risk = computeRisk(player, state, conf);

  // How much of the profile is revealed, by band level.
  const strengthCount = [0, 1, 2, 3, 4][band.level];
  const weaknessCount = [0, 1, 2, 2, 3][band.level];
  const traitCount    = [0, 1, 2, 4, 99][band.level];

  const strengths = strengthsFor(player, strengthCount);
  const weaknesses = band.level >= 1 ? weaknessesFor(player, weaknessCount) : [];
  if (band.level >= 1 && (getPlayerCdlSample(player, state) < 6) && weaknesses.length < weaknessCount + 1) {
    weaknesses.push("Low sample size");
  }
  const allTraits = traitLabelsFor(player);
  const revealedTraits = band.level >= 4 ? allTraits : allTraits.slice(0, traitCount);

  const report = band.level === 0 ? "Not enough information" : band.report;

  return {
    established,
    target,
    confidence: conf,
    band: band.label,
    level: band.level,
    reportLevel: band.level,
    report,
    risk,
    displayOvr,
    displayPot,
    displayOvrText: formatDisplayRating(displayOvr),
    displayPotText: formatDisplayRating(displayPot),
    strengths,
    weaknesses,
    revealedTraits,
    hiddenGem: isHiddenGemCandidate(player, state),
    bustRisk: isBustRiskCandidate(player, state),
    recommendation: recommendAction(player, state, conf, target),
    lastScouted: state?.userScouting?.players?.[player.id]?.lastSeason
      ? `S${state.userScouting.players[player.id].lastSeason}`
      : null,
  };
}

function recommendAction(player, state, conf, target) {
  if (!target) return "Established player — ratings reliable";
  if (conf >= 100) return "Fully scouted — make a decision";
  if (conf < 40) return "Investigate further before judging";
  if (isHiddenGemCandidate(player, state)) return "Possible hidden gem — keep scouting";
  if (isBustRiskCandidate(player, state)) return "High-risk profile — scout before committing";
  return conf < 75 ? "Worth another look" : "Close to a full read";
}

// ── Scouting assignments (refresh each stage) ────────────────────────────────
export function getAssignmentsKey(state) {
  const season = state?.season ?? 1;
  const stageIdx = state?.schedule?.stageIdx ?? 0;
  return `${season}:${stageIdx}`;
}

export function getMaxAssignments(state) {
  const { power } = getStaffScoutPower(state, state?.userTeamId);
  let max = 5;
  if (power >= 0.6) max += 1;
  if (power >= 0.85) max += 1;
  return max;
}

export function getAssignmentsRemaining(state) {
  const key = getAssignmentsKey(state);
  const used = state?.userScouting?.assignmentsUsed?.[key] || 0;
  return Math.max(0, getMaxAssignments(state) - used);
}

// Confidence gained by a single scouting action. Better staff → bigger gains.
// `deep` uses 2 assignments for a larger gain. Deterministic but varied per
// player+attempt so repeated scouting doesn't feel flat.
export function scoutGain(state, player, deep) {
  const { power } = getStaffScoutPower(state, state?.userTeamId);
  const [lo, hi] = deep ? [40, 60] : [20, 35];
  const applied = state?.userScouting?.players?.[player.id]?.applied || 0;
  const jitter = unit((player.id || player.name) + ":" + (deep ? "d" : "b") + ":" + applied);
  const t = clamp01(power * 0.7 + jitter * 0.3);
  return Math.round(lo + t * (hi - lo));
}

// ── Pure state transition used by the reducer ────────────────────────────────
// Returns { ok, scouting, confidence, gain, reason }. Does NOT mutate input.
export function applyScout(state, playerId, { deep = false } = {}) {
  const scouting = migrateUserScouting(state?.userScouting);
  const player = (state?.prospects || []).find(p => p.id === playerId)
    || (state?.players || []).find(p => p.id === playerId);
  if (!player) return { ok: false, reason: "Player not found.", scouting };
  if (!isScoutTarget(player, state)) {
    return { ok: false, reason: `${player.name} is already a known quantity.`, scouting };
  }
  const conf = getPlayerScoutingConfidence(player, state);
  if (conf >= 100) return { ok: false, reason: `${player.name} is already fully scouted.`, scouting };

  const cost = deep ? 2 : 1;
  const remaining = getAssignmentsRemaining(state);
  if (remaining < cost) {
    return { ok: false, reason: "No scouting assignments left this stage.", scouting };
  }

  const gain = scoutGain(state, player, deep);
  const prev = scouting.players[playerId] || { applied: 0 };
  // Clamp applied so total confidence never exceeds 100.
  const base = getBaseConfidence(player, state);
  const maxApplied = Math.max(0, 100 - base);
  const applied = Math.min(maxApplied, (prev.applied || 0) + gain);

  const key = getAssignmentsKey(state);
  const nextScouting = {
    ...scouting,
    players: {
      ...scouting.players,
      [playerId]: {
        ...prev,
        applied,
        reportLevel: getConfidenceBand(Math.round(clamp(base + applied, 0, 100))).level,
        lastSeason: state?.season ?? 1,
        lastStage: state?.schedule?.stageIdx ?? 0,
        deepUsed: (prev.deepUsed || 0) + (deep ? 1 : 0),
      },
    },
    assignmentsUsed: {
      ...scouting.assignmentsUsed,
      [key]: (scouting.assignmentsUsed[key] || 0) + cost,
    },
  };
  const newConf = Math.round(clamp(base + applied, 0, 100));
  return { ok: true, scouting: nextScouting, confidence: newConf, gain, player, deep };
}

export function toggleShortlist(state, playerId) {
  const scouting = migrateUserScouting(state?.userScouting);
  const has = scouting.shortlist.includes(playerId);
  const shortlist = has
    ? scouting.shortlist.filter(id => id !== playerId)
    : [...scouting.shortlist, playerId];
  return { scouting: { ...scouting, shortlist }, added: !has };
}

export function isShortlisted(state, playerId) {
  return !!state?.userScouting?.shortlist?.includes(playerId);
}
