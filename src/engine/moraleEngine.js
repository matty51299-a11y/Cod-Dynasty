// src/engine/moraleEngine.js
// Player Morale, Promises and Squad Dynamics engine.
//
// Pure logic layer (no React, no side effects beyond returning new state). It
// adds an emotional/relationship layer on top of the existing roster/contract/
// transfer systems WITHOUT changing match simulation, ratings, contracts,
// budgets, transfer fee logic, awards, brackets or save history.
//
// Design principles (see progress.md task brief):
//   - Incremental first pass. Effects are MODEST.
//   - Morale never directly changes OVR. It influences transfer willingness,
//     contract demands and chemistry only by small, bounded amounts.
//   - Deterministic: no Math.random(), so diagnostics stay stable.
//   - Save-safe: old saves hydrate to neutral morale (mostly Content/Happy) and
//     never crash. Missing entries are created lazily.
//
// Storage: a separate `state.playerMorale` object keyed by player id (chosen
// over an inline `player.morale` field for save compatibility — it can be added
// without touching the players array, and unknown players are tolerated).

import { isInactivePlayer } from "../utils/playerIdentity.js";
import { isChallengerMode } from "../utils/userTeam.js";

export const MORALE_VERSION = 2;

const RECENT_EVENTS_CAP = 8;
const CONVERSATION_HISTORY_CAP = 3;
const MORALE_EVENTS_CAP = 24;
const COOLDOWN_STAGES = 2;

// ── Clamp helpers ─────────────────────────────────────────────────────────────
export function clampMorale(n) {
  return Math.max(0, Math.min(100, Math.round(Number.isFinite(n) ? n : 70)));
}
function clampRange(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

// ── Morale bands ──────────────────────────────────────────────────────────────
// 0-100 score → mood label. Bands match the task brief.
export function moodForLevel(level) {
  const l = clampMorale(level);
  if (l >= 90) return "Excellent";
  if (l >= 75) return "Happy";
  if (l >= 60) return "Content";
  if (l >= 45) return "Concerned";
  if (l >= 30) return "Frustrated";
  if (l >= 15) return "Unhappy";
  return "Wants Out";
}

// Coarse tone used for colour coding on roster rows / pills.
//   positive | neutral | concerned | frustrated | wantsout
export function moraleTone(level) {
  const l = clampMorale(level);
  if (l >= 75) return "positive";
  if (l >= 60) return "neutral";
  if (l >= 45) return "concerned";
  if (l >= 30) return "frustrated";
  return "wantsout";
}

export function moraleColor(level) {
  switch (moraleTone(level)) {
    case "positive":   return "#34d399"; // green
    case "neutral":    return "#60a5fa"; // blue/grey
    case "concerned":  return "#fbbf24"; // yellow
    case "frustrated": return "#fb923c"; // orange
    case "wantsout":   return "#f87171"; // red
    default:           return "#60a5fa";
  }
}

// ── Personality traits (derived, not stored) ──────────────────────────────────
// The player system already carries hidden traits (ego, workEthic,
// tiltResistance, leadership, metaDependence on a 1-5 scale) plus age / overall
// / potential. Rather than add a risky new stored field, we DERIVE 1-3
// personality tags from those. Deterministic and read-only.
export function derivePersonality(player) {
  if (!player) return [];
  const tags = [];
  const ego = player.ego ?? 2;
  const work = player.workEthic ?? 3;
  const tilt = player.tiltResistance ?? 3;
  const lead = player.leadership ?? 3;
  const age = player.age ?? 24;
  const ovr = player.overall ?? 70;
  const pot = player.potential ?? ovr;

  if (lead >= 4 && age >= 26) tags.push("Veteran Leader");
  else if (lead >= 4) tags.push("Team First");
  if (ego >= 4) tags.push("Ego");
  if (work >= 5) tags.push("Professional");
  else if (work <= 2) tags.push("Hard to Manage");
  if (tilt <= 2) tags.push("Streaky");
  else if (tilt >= 4 && ovr >= 82) tags.push("Big Match Player");
  if (age <= 21 && pot >= 86) tags.push("Young Prospect");
  if (ovr >= 85 && ego >= 3) tags.push("High Standards");
  if (ego >= 3 && lead <= 2 && age <= 24) tags.push("Ambitious");
  if (work >= 4 && tilt >= 4 && tags.length === 0) tags.push("Coachable");

  // Always return at least one, never more than three.
  if (!tags.length) tags.push("Professional");
  return tags.slice(0, 3);
}

// True when a personality is comparatively easy-going about setbacks (used to
// soften morale hits and accept "earn your place" answers).
function isProfessional(player) {
  return (player?.workEthic ?? 3) >= 4 && (player?.ego ?? 2) <= 2;
}
function isHotHeaded(player) {
  return (player?.ego ?? 2) >= 4 || (player?.workEthic ?? 3) <= 2;
}

// ── Default / migrate entry ───────────────────────────────────────────────────
function defaultEntry(level = 70) {
  return {
    level: clampMorale(level),
    mood: moodForLevel(level),
    trust: 60,
    concerns: [],
    promises: [],
    recentEvents: [],
    conversationHistory: [],
    lastUpdatedSeason: 1,
    lastUpdatedStage: 0,
  };
}

function normalizeEntry(raw) {
  if (!raw || typeof raw !== "object") return defaultEntry();
  const level = clampMorale(raw.level);
  return {
    level,
    mood: moodForLevel(level),
    trust: clampMorale(typeof raw.trust === "number" ? raw.trust : 60),
    concerns: Array.isArray(raw.concerns) ? raw.concerns : [],
    promises: Array.isArray(raw.promises) ? raw.promises : [],
    recentEvents: Array.isArray(raw.recentEvents) ? raw.recentEvents.slice(-RECENT_EVENTS_CAP) : [],
    conversationHistory: Array.isArray(raw.conversationHistory) ? raw.conversationHistory.slice(-CONVERSATION_HISTORY_CAP) : [],
    lastUpdatedSeason: raw.lastUpdatedSeason ?? 1,
    lastUpdatedStage: raw.lastUpdatedStage ?? 0,
  };
}

// Initial morale for an existing-save player. Neutral-positive so no save ever
// boots into mass unrest. Bounded to 55-85 (Content → Happy).
function seedLevelFor(player) {
  let base = 70;
  if (player?.isSub) base -= 6;
  else base += 4;
  if ((player?.contractYears ?? 2) <= 1) base -= 4;
  const form = player?.form ?? 70;
  base += clampRange((form - 70) / 6, -4, 4);
  if ((player?.overall ?? 70) >= 85) base += 2;
  return clampMorale(clampRange(base, 55, 85));
}

// ── State-level hydration ─────────────────────────────────────────────────────
// Ensures `state.playerMorale` exists and every currently-rostered player has an
// entry. Never wipes existing entries. Returns a NEW playerMorale object.
export function migratePlayerMorale(state) {
  const existing = (state && typeof state.playerMorale === "object" && state.playerMorale) || {};
  const out = {};
  // Preserve known entries (normalized).
  for (const [pid, raw] of Object.entries(existing)) {
    out[pid] = normalizeEntry(raw);
  }
  // Seed entries for active rostered players that don't have one yet.
  const all = [...(state?.players ?? []), ...(state?.prospects ?? [])];
  const season = state?.season ?? 1;
  const stage = state?.schedule?.stageIdx ?? 0;
  for (const p of all) {
    if (!p || isInactivePlayer(p)) continue;
    const rostered = !!p.teamId || !!p.challengerTeamId;
    if (!rostered) continue;
    if (!out[p.id]) {
      const e = defaultEntry(seedLevelFor(p));
      e.lastUpdatedSeason = season;
      e.lastUpdatedStage = stage;
      e.mood = moodForLevel(e.level);
      out[p.id] = e;
    }
  }
  return out;
}

// Return the morale entry for a player, creating a lazy default if absent. Does
// NOT mutate state — pairs with writeMorale.
export function getMorale(state, playerId) {
  const pm = state?.playerMorale;
  if (pm && pm[playerId]) return pm[playerId];
  return defaultEntry();
}

function writeMorale(state, playerId, entry) {
  return {
    ...state,
    playerMorale: { ...(state.playerMorale || {}), [playerId]: normalizeEntry(entry) },
  };
}

// ── Core event application ────────────────────────────────────────────────────
// Apply a morale event to a single entry. Returns a NEW entry. `delta` and
// `trustDelta` are bounded; concerns are de-duplicated by key.
export function applyEventToEntry(entry, {
  delta = 0, trustDelta = 0, label = "", concernsAdd = [], concernsRemove = [],
  season = 1, stage = 0,
} = {}) {
  const e = normalizeEntry(entry);
  const level = clampMorale(e.level + clampRange(delta, -40, 40));
  const trust = clampMorale(e.trust + clampRange(trustDelta, -40, 40));
  let concerns = e.concerns;
  if (concernsRemove.length) {
    const rm = new Set(concernsRemove);
    concerns = concerns.filter(c => !rm.has(c.key));
  }
  for (const add of concernsAdd) {
    if (!add || !add.key) continue;
    if (concerns.some(c => c.key === add.key)) continue;
    concerns = [...concerns, { key: add.key, label: add.label || add.key, season, stage }];
  }
  const recentEvents = label
    ? [...e.recentEvents, { label, delta: Math.round(delta), season, stage }].slice(-RECENT_EVENTS_CAP)
    : e.recentEvents;
  return {
    ...e, level, trust, mood: moodForLevel(level), concerns, recentEvents,
    lastUpdatedSeason: season, lastUpdatedStage: stage,
  };
}

// Convenience: apply an event to a player within state, scaling the delta by the
// player's temperament. Returns NEW state.
export function applyPlayerEvent(state, player, opts) {
  if (!state || !player) return state;
  const season = state.season ?? 1;
  const stage = state.schedule?.stageIdx ?? 0;
  let delta = opts.delta ?? 0;
  // Temperament scaling: professionals shrug off negatives; hot-heads amplify.
  if (delta < 0) {
    if (isProfessional(player)) delta *= 0.7;
    if (isHotHeaded(player)) delta *= 1.25;
  } else if (delta > 0) {
    if (isHotHeaded(player)) delta *= 1.1;
  }
  const entry = applyEventToEntry(getMorale(state, player.id), { ...opts, delta, season, stage });
  return writeMorale(state, player.id, entry);
}

// ── Concern catalogue (keys + default labels) ─────────────────────────────────
export const CONCERNS = {
  WANTS_START:       { key: "wants_start",       label: "Wants starting spot" },
  BENCHED:           { key: "benched",           label: "Frustrated at being benched" },
  ROLE:              { key: "role",              label: "Concerned about role" },
  WANTS_CONTRACT:    { key: "wants_contract",    label: "Wants new contract" },
  EXPIRING:          { key: "expiring",          label: "Concerned about expiring deal" },
  LOW_OFFER:         { key: "low_offer",         label: "Unhappy with low offer" },
  WANTS_CDL_MOVE:    { key: "wants_cdl_move",    label: "Wants CDL move" },
  WANTS_MOVE:        { key: "wants_move",        label: "Interested in transfer" },
  BLOCKED_MOVE:      { key: "blocked_move",      label: "Angry at blocked move" },
  LOSING:            { key: "losing",            label: "Frustrated by losing" },
  MISSED_MAJOR:      { key: "missed_major",      label: "Concerned by missing Major" },
  DEMANDS_ROSTER:    { key: "demands_roster",    label: "Demands stronger roster" },
  BROKEN_PROMISE:    { key: "broken_promise",    label: "Frustrated by broken promise" },
  LOST_TRUST:        { key: "lost_trust",        label: "Lost trust in management" },
  WANTS_DEV:         { key: "wants_dev",         label: "Wants to be developed" },
};

// ── Promise catalogue ─────────────────────────────────────────────────────────
// Each type: label, importance, default deadline (stages ahead), and how it is
// evaluated. `evaluate(promise, state, player)` returns "kept" | "broken" | null
// (null = still active / not yet decidable).
export const PROMISE_TYPES = {
  starter_role: {
    label: "Promised a starting role",
    importance: "High",
    deadlineStages: 2,
    removesConcern: ["wants_start", "benched", "role"],
  },
  more_maps: {
    label: "Promised more maps soon",
    importance: "Medium",
    deadlineStages: 1,
    removesConcern: ["wants_start", "benched"],
  },
  no_bench_unless_form: {
    label: "Promised not to bench unless form drops",
    importance: "Medium",
    deadlineStages: 2,
    removesConcern: ["benched", "role"],
  },
  new_contract: {
    label: "Promised a new contract",
    importance: "High",
    deadlineStages: 4,
    removesConcern: ["wants_contract", "expiring"],
  },
  contract_talks: {
    label: "Promised contract talks in the offseason",
    importance: "Medium",
    deadlineStages: 4,
    removesConcern: ["wants_contract", "expiring"],
  },
  consider_offers: {
    label: "Promised to consider fair offers",
    importance: "Medium",
    deadlineStages: 4,
    removesConcern: ["wants_move", "wants_cdl_move", "blocked_move"],
  },
  can_leave_for_contender: {
    label: "Promised he can leave for a contender",
    importance: "High",
    deadlineStages: 4,
    removesConcern: ["wants_move", "wants_cdl_move", "blocked_move"],
  },
  roster_upgrade: {
    label: "Promised a roster upgrade",
    importance: "Medium",
    deadlineStages: 4,
    removesConcern: ["demands_roster"],
  },
  build_around: {
    label: "Promised to build the team around him",
    importance: "High",
    deadlineStages: 4,
    removesConcern: ["demands_roster", "wants_move"],
  },
  development_focus: {
    label: "Promised a development focus",
    importance: "Low",
    deadlineStages: 2,
    removesConcern: ["wants_dev", "role"],
  },
};

// Linear stage index used for deadlines: season is 0-based here, 6 "stages" per
// season is a coarse-but-monotonic clock (4 stages + pre-champs + offseason).
export function stageClock(season, stageIdx) {
  return (Number(season ?? 1)) * 6 + Number(stageIdx ?? 0);
}

function isStarterNow(state, player) {
  if (!player) return false;
  return !player.isSub && (!!player.teamId || !!player.challengerTeamId);
}

// Evaluate a single promise's outcome given current state. Returns one of
// "kept" | "broken" | null (still pending).
export function evaluatePromiseOutcome(promise, state, player) {
  if (!promise || !player) return null;
  const now = stageClock(state.season, state.schedule?.stageIdx ?? 0);
  const deadline = stageClock(promise.deadlineSeason, promise.deadlineStage);
  const expired = now >= deadline;

  switch (promise.type) {
    case "starter_role":
    case "more_maps":
    case "no_bench_unless_form": {
      // Broken immediately if the player has been benched after the promise.
      if (player.isSub) return "broken";
      return expired ? "kept" : null;
    }
    case "new_contract":
    case "contract_talks": {
      // Kept once the player's contract has been extended past the promise's
      // baseline (re-signed). The reducer bumps progress on RESIGN_PLAYER.
      if (promise.progress >= 1) return "kept";
      return expired ? "broken" : null;
    }
    case "consider_offers":
    case "can_leave_for_contender": {
      // These are about NOT blocking the player. Broken if a blocked-move
      // concern is logged after the promise; kept if it survives the deadline.
      const m = getMorale(state, player.id);
      if (m.concerns.some(c => c.key === "blocked_move" && stageClock(c.season, c.stage) >= stageClock(promise.madeSeason, promise.madeStage))) {
        return "broken";
      }
      return expired ? "kept" : null;
    }
    case "roster_upgrade":
    case "build_around": {
      if (promise.progress >= 1) return "kept";
      return expired ? "broken" : null;
    }
    case "development_focus": {
      // Low-stakes: kept if the player is still a starter at the deadline.
      if (!expired) return null;
      return isStarterNow(state, player) ? "kept" : "broken";
    }
    default:
      return expired ? "kept" : null;
  }
}

// Apply the morale/trust consequence of a resolved promise. Returns NEW state.
function resolvePromiseConsequence(state, player, promise, outcome) {
  const def = PROMISE_TYPES[promise.type] || {};
  const importanceMult = promise.importance === "High" ? 1.4 : promise.importance === "Low" ? 0.6 : 1;
  if (outcome === "kept") {
    return applyPlayerEvent(state, player, {
      delta: 10 * importanceMult,
      trustDelta: 12 * importanceMult,
      label: `Promise kept: ${def.label || promise.type}`,
      concernsRemove: def.removesConcern || [],
    });
  }
  // broken
  const concernsAdd = [CONCERNS.BROKEN_PROMISE];
  // A badly-broken high-importance promise also costs trust in management.
  if (promise.importance === "High") concernsAdd.push(CONCERNS.LOST_TRUST);
  return applyPlayerEvent(state, player, {
    delta: -12 * importanceMult,
    trustDelta: -16 * importanceMult,
    label: `Promise broken: ${def.label || promise.type}`,
    concernsAdd,
  });
}

// ── Promise lifecycle on state ────────────────────────────────────────────────
let _promiseSeq = 0;
function nextPromiseId() {
  _promiseSeq += 1;
  return `promise_${Date.now().toString(36)}_${_promiseSeq}`;
}

// Create a promise to a player. Returns NEW state. No-op if the player has an
// identical active promise already.
export function makePromise(state, playerId, type) {
  const def = PROMISE_TYPES[type];
  const player = (state.players || []).concat(state.prospects || []).find(p => p.id === playerId);
  if (!def || !player) return state;
  const entry = getMorale(state, playerId);
  if ((entry.promises || []).some(p => p.type === type && p.status === "active")) return state;
  const season = state.season ?? 1;
  const stage = state.schedule?.stageIdx ?? 0;
  const promise = {
    id: nextPromiseId(),
    playerId,
    type,
    label: def.label,
    madeSeason: season,
    madeStage: stage,
    deadlineSeason: season + Math.floor((stage + def.deadlineStages) / 6),
    deadlineStage: (stage + def.deadlineStages) % 6,
    status: "active",
    progress: 0,
    target: 1,
    importance: def.importance,
  };
  const updated = { ...entry, promises: [...(entry.promises || []), promise] };
  return writeMorale(state, playerId, updated);
}

// Mark progress on a player's active promises of a given type (e.g. a re-sign
// fulfils a new_contract / contract_talks promise). Returns NEW state.
export function advancePromiseProgress(state, playerId, types, amount = 1) {
  const entry = getMorale(state, playerId);
  if (!entry.promises?.length) return state;
  const set = new Set(Array.isArray(types) ? types : [types]);
  const promises = entry.promises.map(p =>
    p.status === "active" && set.has(p.type)
      ? { ...p, progress: Math.min(p.target ?? 1, (p.progress ?? 0) + amount) }
      : p
  );
  return writeMorale(state, playerId, { ...entry, promises });
}

// Evaluate every active promise across the user squad and resolve the ones that
// are now decidable. Returns NEW state. Safe to call at any "trigger" moment.
export function evaluateAllPromises(state) {
  let next = state;
  const ids = Object.keys(next.playerMorale || {});
  for (const pid of ids) {
    const player = (next.players || []).concat(next.prospects || []).find(p => p.id === pid);
    if (!player) continue;
    const entry = getMorale(next, pid);
    const active = (entry.promises || []).filter(p => p.status === "active");
    if (!active.length) continue;
    for (const promise of active) {
      const outcome = evaluatePromiseOutcome(promise, next, player);
      if (!outcome) continue;
      // Update the promise status first, then apply consequence.
      const e2 = getMorale(next, pid);
      const promises = e2.promises.map(p => p.id === promise.id ? { ...p, status: outcome } : p);
      next = writeMorale(next, pid, { ...e2, promises });
      next = resolvePromiseConsequence(next, player, promise, outcome);
    }
  }
  return next;
}

// ── Result / performance morale (after matches & stages) ──────────────────────
// Modest nudges for the USER team only, based on each player's current form
// relative to neutral. Idempotency: a per-stage result effect runs once per
// (season, stage) via lastUpdatedStage guard so repeated sims don't compound.
export function applyResultMorale(state) {
  if (!state) return state;
  const userTeamId = state.userTeamId;
  const challenger = isChallengerMode(state);
  const players = (state.players || []).concat(state.prospects || []);
  const roster = players.filter(p => {
    if (isInactivePlayer(p)) return false;
    return challenger ? p.challengerTeamId === userTeamId : p.teamId === userTeamId;
  });
  if (!roster.length) return state;

  const season = state.season ?? 1;
  const stage = state.schedule?.stageIdx ?? 0;
  let next = state;
  for (const p of roster) {
    const entry = getMorale(next, p.id);
    // Skip if we already applied a result nudge this stage for this player.
    if (entry.lastResultKey === `${season}:${stage}`) continue;
    const form = p.form ?? 70;
    let delta = clampRange((form - 70) / 10, -3, 3); // ±3 max from form
    if (delta === 0) continue;
    const label = delta > 0 ? "Good recent form" : "Poor recent form";
    const concernsRemove = delta > 0 ? ["losing"] : [];
    const concernsAdd = delta <= -2 ? [{ key: "losing", label: CONCERNS.LOSING.label }] : [];
    const updated = applyEventToEntry(entry, { delta, label, concernsAdd, concernsRemove, season, stage });
    updated.lastResultKey = `${season}:${stage}`;
    next = writeMorale(next, p.id, updated);
  }
  return next;
}

// ── Major morale (after a Major / Champs completes) ───────────────────────────
// `placement` is the user team's finishing band (1 = win). Qualification for the
// next stage's Major is assumed for CDL (all 12 enter), so we focus on result.
export function applyMajorMorale(state, placement) {
  if (!state) return state;
  const userTeamId = state.userTeamId;
  const challenger = isChallengerMode(state);
  const players = (state.players || []).concat(state.prospects || []);
  const roster = players.filter(p => {
    if (isInactivePlayer(p)) return false;
    return challenger ? p.challengerTeamId === userTeamId : p.teamId === userTeamId;
  });
  if (!roster.length) return state;

  let delta = 0; let label = "Major result"; const concernsAdd = []; const concernsRemove = [];
  const place = Number(placement) || 99;
  if (place === 1) { delta = 8; label = "Won the Major"; concernsRemove.push("losing", "missed_major"); }
  else if (place <= 4) { delta = 4; label = "Strong Major run"; concernsRemove.push("losing"); }
  else if (place <= 8) { delta = 1; label = "Made the Major bracket"; }
  else { delta = -4; label = "Missed deep in the Major"; concernsAdd.push({ key: "missed_major", label: CONCERNS.MISSED_MAJOR.label }); }

  // Mark roster_upgrade / build_around / major_push promises progressed on a deep run.
  let next = state;
  for (const p of roster) {
    next = applyPlayerEvent(next, p, { delta, label, concernsAdd, concernsRemove });
    if (place <= 4) next = advancePromiseProgress(next, p.id, ["roster_upgrade", "build_around"]);
  }
  return next;
}

// ── Roster-management events ──────────────────────────────────────────────────
export function applyBenchEvent(state, player) {
  // Being dropped to the bench: a broken no_bench promise is handled by the
  // promise evaluator; here we add the immediate morale hit + concern.
  const next = applyPlayerEvent(state, player, {
    delta: -10,
    label: "Dropped to the bench",
    concernsAdd: [{ key: "benched", label: CONCERNS.BENCHED.label }, { key: "wants_start", label: CONCERNS.WANTS_START.label }],
  });
  return createMoraleConversationEvent(next, player, { topic: "playing_time", trigger: "Benched after being in the rotation.", severity: "medium" });
}

export function applyPromoteEvent(state, player) {
  let next = applyPlayerEvent(state, player, {
    delta: 9,
    label: "Promoted to the starting roster",
    concernsRemove: ["benched", "wants_start", "role"],
  });
  next = advancePromiseProgress(next, player.id, ["starter_role", "more_maps", "no_bench_unless_form"]);
  return next;
}

export function applyReleaseEvent(state, player) {
  // The released player is leaving; we still log it so the morale entry is
  // coherent (and so a Challenger re-sign keeps context). Teammates are not
  // mass-affected in this first pass (kept modest).
  return applyPlayerEvent(state, player, {
    delta: -14, label: "Released by the club",
  });
}

export function applyBlockedMoveEvent(state, player) {
  const next = applyPlayerEvent(state, player, {
    delta: -8,
    label: "Transfer request blocked",
    trustDelta: -6,
    concernsAdd: [{ key: "blocked_move", label: CONCERNS.BLOCKED_MOVE.label }],
  });
  return createMoraleConversationEvent(next, player, { topic: "transfer", trigger: "A move or buyout was blocked by management.", severity: "critical" });
}

export function applyTransferInterestEvent(state, player) {
  // A concrete offer arriving: ambitious players get a small lift / itch.
  const ambitious = (player?.ego ?? 2) >= 3;
  const next = applyPlayerEvent(state, player, {
    delta: ambitious ? 2 : 0,
    label: "Attracted transfer interest",
    concernsAdd: ambitious ? [{ key: "wants_move", label: CONCERNS.WANTS_MOVE.label }] : [],
  });
  return ambitious ? createMoraleConversationEvent(next, player, { topic: "transfer", trigger: "Concrete transfer interest has reached the player.", severity: "medium" }) : next;
}

export function applyNewContractEvent(state, player) {
  let next = applyPlayerEvent(state, player, {
    delta: 10,
    label: "Signed a new contract",
    trustDelta: 6,
    concernsRemove: ["wants_contract", "expiring", "low_offer"],
  });
  next = advancePromiseProgress(next, player.id, ["new_contract", "contract_talks"]);
  return next;
}

export function applySignedEvent(state, player) {
  // Joining the user's club: arrive content/optimistic.
  const entry = applyEventToEntry(getMorale(state, player.id), {
    delta: 6, label: "Joined the club", season: state.season ?? 1, stage: state.schedule?.stageIdx ?? 0,
  });
  return writeMorale(state, player.id, entry);
}

// ── Conversations / action-required events ────────────────────────────────────
let _conversationSeq = 0;
function nextConversationId() {
  _conversationSeq += 1;
  return `meeting_${Date.now().toString(36)}_${_conversationSeq}`;
}

function topicForState(state, player, forcedTopic = null) {
  if (forcedTopic) return forcedTopic;
  const entry = getMorale(state, player?.id);
  const concernKeys = new Set((entry.concerns || []).map(c => c.key));
  const challenger = isChallengerMode(state);
  if (concernKeys.has("broken_promise") || concernKeys.has("lost_trust")) return "broken_promise";
  if (concernKeys.has("benched") || concernKeys.has("wants_start")) return "playing_time";
  if (concernKeys.has("wants_cdl_move") || (challenger && concernKeys.has("wants_move"))) return "cdl_move";
  if (concernKeys.has("blocked_move") || concernKeys.has("wants_move")) return "transfer";
  if (concernKeys.has("wants_contract") || concernKeys.has("expiring") || concernKeys.has("low_offer")) return "contract";
  if (concernKeys.has("demands_roster") || concernKeys.has("missed_major")) return "ambition";
  if (concernKeys.has("losing")) return "poor_form";
  if (concernKeys.has("wants_dev")) return "development";
  return "general";
}

function eventSeverityFor(topic, entry, player) {
  if (entry?.level < 25 || topic === "broken_promise" || topic === "blocked_move") return "critical";
  if (topic === "transfer" && entry?.concerns?.some(c => c.key === "blocked_move")) return "critical";
  if (["contract", "cdl_move"].includes(topic) || entry?.level < 45) return "high";
  if (["playing_time", "ambition", "poor_form"].includes(topic)) return "medium";
  return player?.isSub ? "medium" : "low";
}

function severityRank(sev) {
  return { low: 1, medium: 2, high: 3, critical: 4 }[sev] || 1;
}

export function conversationRequiresPopup(event) {
  return severityRank(event?.severity) >= 3;
}

export function ensureMoraleConversationState(state) {
  if (!state) return state;
  const now = stageClock(state.season, state.schedule?.stageIdx ?? 0);
  const events = Array.isArray(state.moraleConversationEvents)
    ? state.moraleConversationEvents
        .filter(e => e && e.id && e.playerId)
        .map(e => ({
          id: e.id,
          playerId: e.playerId,
          topic: e.topic || "general",
          title: e.title || "Player meeting requested",
          trigger: e.trigger || "A morale concern needs attention.",
          severity: ["low", "medium", "high", "critical"].includes(e.severity) ? e.severity : "medium",
          actionRequired: e.actionRequired !== false,
          popupRequired: !!e.popupRequired,
          status: e.status || "open",
          createdSeason: e.createdSeason ?? state.season ?? 1,
          createdStage: e.createdStage ?? state.schedule?.stageIdx ?? 0,
          delayedUntil: e.delayedUntil ?? null,
        }))
        .slice(-MORALE_EVENTS_CAP)
    : [];
  const cooldowns = (state.moraleConversationCooldowns && typeof state.moraleConversationCooldowns === "object")
    ? state.moraleConversationCooldowns
    : {};
  const cleanedCooldowns = Object.fromEntries(Object.entries(cooldowns).filter(([, until]) => Number(until) >= now - 12));
  return {
    ...state,
    moraleConversationEvents: events,
    moraleActionRequired: events.filter(e => e.status === "open" && e.actionRequired && (e.delayedUntil == null || e.delayedUntil <= now)).map(e => e.id),
    moraleConversationCooldowns: cleanedCooldowns,
    lastMoraleConversationOutcome: state.lastMoraleConversationOutcome ?? null,
  };
}

function eventKey(playerId, topic) {
  return `${playerId}:${topic}`;
}

export function createMoraleConversationEvent(state, player, { topic = null, trigger = "A morale concern needs attention.", severity = null, force = false } = {}) {
  if (!state || !player) return state;
  let next = ensureMoraleConversationState(state);
  const resolvedTopic = topicForState(next, player, topic);
  const entry = getMorale(next, player.id);
  const resolvedSeverity = severity || eventSeverityFor(resolvedTopic, entry, player);
  const now = stageClock(next.season, next.schedule?.stageIdx ?? 0);
  const key = eventKey(player.id, resolvedTopic);
  if (!force) {
    if (Number(next.moraleConversationCooldowns?.[key] ?? -1) > now) return next;
    if ((next.moraleConversationEvents || []).some(e => e.status === "open" && e.playerId === player.id && e.topic === resolvedTopic)) return next;
  }
  const title = `${player.name} wants to discuss ${topicTitle(resolvedTopic).toLowerCase()}`;
  const event = {
    id: nextConversationId(),
    playerId: player.id,
    topic: resolvedTopic,
    title,
    trigger,
    severity: resolvedSeverity,
    actionRequired: true,
    popupRequired: severityRank(resolvedSeverity) >= 3,
    status: "open",
    createdSeason: next.season ?? 1,
    createdStage: next.schedule?.stageIdx ?? 0,
    delayedUntil: null,
  };
  const moraleConversationCooldowns = { ...(next.moraleConversationCooldowns || {}), [key]: now + COOLDOWN_STAGES };
  const moraleConversationEvents = [...(next.moraleConversationEvents || []), event].slice(-MORALE_EVENTS_CAP);
  return ensureMoraleConversationState({ ...next, moraleConversationEvents, moraleConversationCooldowns });
}

export function delayMoraleConversationEvent(state, eventId, stages = 1) {
  const next = ensureMoraleConversationState(state);
  const until = stageClock(next.season, next.schedule?.stageIdx ?? 0) + stages;
  return ensureMoraleConversationState({
    ...next,
    moraleConversationEvents: (next.moraleConversationEvents || []).map(e => e.id === eventId ? { ...e, delayedUntil: until } : e),
  });
}

export function dismissMoraleConversationEvent(state, eventId) {
  const next = ensureMoraleConversationState(state);
  return ensureMoraleConversationState({
    ...next,
    moraleConversationEvents: (next.moraleConversationEvents || []).map(e => e.id === eventId ? { ...e, status: "dismissed", actionRequired: false } : e),
  });
}

export function getActionRequiredMoraleEvents(state) {
  const next = ensureMoraleConversationState(state);
  const now = stageClock(next.season, next.schedule?.stageIdx ?? 0);
  const players = [...(next.players || []), ...(next.prospects || [])];
  return (next.moraleConversationEvents || [])
    .filter(e => e.status === "open" && e.actionRequired && (e.delayedUntil == null || e.delayedUntil <= now))
    .map(e => ({ ...e, player: players.find(p => p.id === e.playerId) }))
    .filter(e => e.player)
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
}

function pickTemplate(templates, state, player, topic) {
  const arr = templates?.length ? templates : ["I wanted to talk about where things stand."];
  const seed = Math.abs(String(`${player?.id || "p"}:${topic}:${state?.season || 1}:${state?.schedule?.stageIdx || 0}`).split("").reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) | 0, 7));
  return arr[seed % arr.length];
}

function personalityTone(player) {
  const tags = derivePersonality(player);
  if (tags.includes("Ego") || tags.includes("Hard to Manage")) return "confrontational";
  if (tags.includes("Ambitious") || tags.includes("High Standards")) return "ambitious";
  if (tags.includes("Young Prospect")) return "prospect";
  if (tags.includes("Veteran Leader")) return "leader";
  return "professional";
}

function toneLine(tone, topic) {
  const lines = {
    professional: "He is calm, but wants a straight answer.",
    ambitious: "He is pushing for a clear plan and will judge you on action.",
    confrontational: "The tone is tense; vague answers could damage trust.",
    prospect: "He wants guidance and a route into meaningful maps.",
    leader: "He is measuring whether the dressing room is being managed properly.",
  };
  if (topic === "broken_promise") return "Trust has already taken a hit, so another empty promise will not land well.";
  return lines[tone] || lines.professional;
}

function topicTitle(topic) {
  return ({
    playing_time: "His role",
    contract: "Contract talks",
    transfer: "A potential move",
    ambition: "Team direction",
    poor_form: "Backing after poor form",
    broken_promise: "A broken promise",
    cdl_move: "A CDL opportunity",
    development: "His development plan",
    general: "His squad status",
  })[topic] || "Squad dynamics";
}

const TOPIC_QUOTES = {
  playing_time: [
    "I need more maps. I'm not getting into rhythm like this.",
    "If I'm just here as cover, tell me now.",
    "I think I've done enough to start.",
    "I can accept being benched if there's a reason, but I need one.",
  ],
  contract: [
    "I've been performing, and I think my deal should reflect that.",
    "I don't want this dragging into the offseason.",
    "If I'm part of the future, I need to see that in the contract.",
    "I'm not asking for madness. I just want something fair.",
  ],
  transfer: [
    "A CDL team came in. I want to hear them out.",
    "I don't want my buyout blocking every opportunity.",
    "If a contender calls, I need you to be realistic.",
    "You said you'd consider serious offers. That one was serious.",
  ],
  ambition: [
    "We keep saying we're building, but what are we actually building?",
    "I want to know if we're trying to win or just survive.",
    "The roster needs help. Everyone can see it.",
    "If we miss another Major, people are going to start looking around.",
  ],
  poor_form: [
    "I know I've been poor. I just need some backing.",
    "I'm trying to play through it, but it's getting in my head.",
    "If you bench me now, I get it. But I want a way back.",
    "I don't want one bad stage to define me.",
  ],
  broken_promise: [
    "You told me I'd get a chance. I didn't.",
    "That wasn't what we agreed.",
    "I trusted you on this, and nothing changed.",
    "I'm not interested in another promise if the last one didn't mean anything.",
  ],
  cdl_move: [
    "I want the CDL shot. That's why I'm here.",
    "I'm not trying to disrespect the team, but I've earned a look.",
    "If you block every CDL offer, what's the point?",
    "I'll give everything while I'm here, but I need a route up.",
  ],
  development: [
    "I need a development plan, not just practice reps.",
    "I can be patient if there's a real path.",
    "Tell me what I need to improve and when I'll get a look.",
  ],
  general: [
    "Where do you actually see me fitting into the team?",
    "I need to understand the plan before this drifts.",
    "I'm not kicking off, but I do need clarity.",
  ],
};

function optionsForTopic(topic, player) {
  const honestHint = isProfessional(player) ? "Professional players usually accept clear standards." : "Honest, but may sting if he wanted reassurance.";
  const hardHint = isHotHeaded(player) ? "High risk: his mood can swing sharply." : "No promise, modest morale risk.";
  const byTopic = {
    playing_time: [
      { id: "ask_expectation", label: "Tell me what you're expecting", followUp: "I don't need every series, but I need a real chance before the next Major.", hint: "Opens a second step before you commit." },
      { id: "promise_starter", label: "Promise him a starting role", promise: "starter_role", hint: "Morale boost now, high promise risk." },
      { id: "promise_maps", label: "Promise more maps soon", promise: "more_maps", hint: "Morale boost now, medium promise risk." },
      { id: "earn", label: "Tell him he has to earn it", morale: { delta: -3, label: "Told to earn his place" }, hint: honestHint },
    ],
    contract: [
      { id: "promise_contract", label: "Promise a new contract", promise: "new_contract", hint: "Strong lift now; high deadline risk if ignored." },
      { id: "promise_talks", label: "Promise offseason talks", promise: "contract_talks", hint: "Buys time with medium promise risk." },
      { id: "wait", label: "Ask him to keep performing first", morale: { delta: -3, label: "Asked to wait on contract" }, hint: honestHint },
      { id: "none", label: "Say you cannot guarantee anything", morale: { delta: -2, label: "No contract reassurance" }, hint: hardHint },
    ],
    transfer: [
      { id: "promise_consider", label: "Promise to consider fair offers", promise: "consider_offers", hint: "Morale boost, but blocking later risks trust." },
      { id: "promise_can_leave", label: "Agree he can leave for a contender", promise: "can_leave_for_contender", hint: "Big reassurance, high transfer risk." },
      { id: "stay", label: "Ask him to commit to the project", morale: { delta: 2, label: "Asked to commit to the project", trustDelta: 1 }, hint: "Small lift if he buys in." },
      { id: "not_for_sale", label: "Tell him he is not for sale", morale: { delta: -5, label: "Refused to discuss a move", trustDelta: -4 }, concern: "blocked_move", hint: "No promise, but high frustration risk." },
    ],
    ambition: [
      { id: "promise_upgrade", label: "Promise a roster upgrade", promise: "roster_upgrade", hint: "Reassures leaders; needs results or additions." },
      { id: "promise_build", label: "Promise to build around him", promise: "build_around", hint: "High-stakes promise with strong trust upside." },
      { id: "realistic", label: "Set realistic expectations", morale: { delta: -2, label: "Given realistic expectations" }, hint: honestHint },
      { id: "none", label: "Make no promises", morale: { delta: -2, label: "No direction promised" }, hint: hardHint },
    ],
    poor_form: [
      { id: "reassure", label: "Back him publicly", morale: { delta: 4, label: "Backed through poor form", trustDelta: 2 }, hint: "Morale lift, no promise." },
      { id: "promise_dev", label: "Promise a development focus", promise: "development_focus", hint: "Low-risk promise with a clear plan." },
      { id: "earn", label: "Tell him form has to improve", morale: { delta: -2, label: "Asked to improve form" }, hint: honestHint },
      { id: "bench_path", label: "Offer a bench role with a way back", promise: "no_bench_unless_form", hint: "Medium promise risk if you bench without reason." },
    ],
    broken_promise: [
      { id: "apologize", label: "Apologize and promise to fix it", promise: "more_maps", hint: "Repairs some trust, but another miss will hurt." },
      { id: "own_it", label: "Own the mistake without another promise", morale: { delta: 1, label: "Owned a broken promise", trustDelta: 3 }, hint: "Honest and controlled; concern may remain." },
      { id: "defend", label: "Defend the decision", morale: { delta: -5, label: "Defended broken promise", trustDelta: -5 }, hint: "No new promise, high trust risk." },
      { id: "reset", label: "Offer a clean slate after the next Major", promise: "development_focus", hint: "Lower-risk promise; may not satisfy stars." },
    ],
    cdl_move: [
      { id: "promise_consider", label: "Promise to consider fair CDL offers", promise: "consider_offers", hint: "Morale boost, increases move risk." },
      { id: "route_up", label: "Lay out a route to a CDL shot", promise: "development_focus", hint: "Good for prospects if you keep developing him." },
      { id: "promise_build", label: "Promise to build around him here", promise: "build_around", hint: "High-stakes retention promise." },
      { id: "block", label: "Say the team comes first", morale: { delta: -5, label: "CDL route blocked", trustDelta: -3 }, concern: "blocked_move", hint: "Can make him feel trapped." },
    ],
    development: [
      { id: "promise_dev", label: "Promise a development focus", promise: "development_focus", hint: "Low promise risk, clear pathway." },
      { id: "promise_maps", label: "Promise more maps soon", promise: "more_maps", hint: "Medium risk if rotation stays fixed." },
      { id: "reassure", label: "Reassure him he's valued", morale: { delta: 3, label: "Reassured about development", trustDelta: 2 }, hint: "Small lift, no deadline." },
      { id: "earn", label: "Tell him training standards decide it", morale: { delta: -2, label: "Asked to earn development reps" }, hint: honestHint },
    ],
    general: [
      { id: "reassure", label: "Reassure him he's part of the plan", morale: { delta: 4, label: "Reassured about role", trustDelta: 3 }, hint: "Small lift, no promise." },
      { id: "promise_starter", label: "Promise a starting role", promise: "starter_role", hint: "High promise risk." },
      { id: "honest", label: "Be honest about competition", morale: { delta: -2, label: "Told about squad competition" }, hint: honestHint },
      { id: "none", label: "Keep it non-committal", morale: { delta: -1, label: "Non-committal chat" }, hint: "Safe but underwhelming." },
    ],
  };
  return byTopic[topic] || byTopic.general;
}

function promiseRiskLabel(option, state, player) {
  if (!option.promise) return "No promise";
  if (["starter_role", "can_leave_for_contender", "build_around", "new_contract"].includes(option.promise)) return "High risk";
  if (option.promise === "more_maps" && player?.isSub) return "Already at risk";
  if (["more_maps", "contract_talks", "consider_offers", "no_bench_unless_form", "roster_upgrade"].includes(option.promise)) return "Medium risk";
  return "Low risk";
}

function enrichOptions(options, state, player) {
  return options.map(o => ({
    ...o,
    impact: o.promise
      ? `Morale boost now, ${promiseRiskLabel(o, state, player).toLowerCase()}.`
      : o.morale?.delta > 0
        ? "Positive morale/trust nudge, no promise created."
        : "No promise; morale may dip depending on personality.",
    risk: promiseRiskLabel(o, state, player),
  }));
}

export function getPromiseRiskLabel(promise, state, player) {
  if (!promise || promise.status !== "active") return "Resolved";
  if (promise.type === "starter_role" || promise.type === "more_maps" || promise.type === "no_bench_unless_form") return player?.isSub ? "Already at risk" : (promise.importance === "High" ? "Medium risk" : "Low risk");
  if (promise.type === "new_contract" || promise.type === "contract_talks") return promise.progress >= 1 ? "Low risk" : "Medium risk";
  const m = getMorale(state, promise.playerId);
  if (m.concerns?.some(c => c.key === "blocked_move" || c.key === "broken_promise")) return "Already at risk";
  return promise.importance === "High" ? "High risk" : promise.importance === "Low" ? "Low risk" : "Medium risk";
}

export function getConversationFor(state, player, event = null) {
  if (!player) return null;
  const entry = getMorale(state, player.id);
  const topic = topicForState(state, player, event?.topic);
  const tone = personalityTone(player);
  const quote = pickTemplate(TOPIC_QUOTES[topic], state, player, topic);
  const activePromises = (entry.promises || []).filter(p => p.status === "active");
  const context = [
    { label: "Morale", value: `${entry.level} ${moodForLevel(entry.level)}` },
    { label: "Status", value: player.isSub ? "Substitute" : "Starter" },
    { label: "Concern", value: topicTitle(topic) },
    { label: "Tone", value: toneLine(tone, topic) },
  ];
  const conflictWarning = activePromises.length
    ? `Already active: ${activePromises.map(p => `${p.label} (${getPromiseRiskLabel(p, state, player)})`).join(", ")}.`
    : "No active promise conflicts.";
  return {
    topic,
    title: topicTitle(topic),
    intro: `${player.name}: "${quote}"`,
    quote,
    tone,
    toneLine: toneLine(tone, topic),
    trigger: event?.trigger || entry.concerns?.[entry.concerns.length - 1]?.label || "A squad dynamics concern needs attention.",
    severity: event?.severity || eventSeverityFor(topic, entry, player),
    context,
    activePromises,
    conflictWarning,
    options: enrichOptions(optionsForTopic(topic, player), state, player),
  };
}

function describeOutcome(player, option, before, after, promiseCreated) {
  if (option.promise && promiseCreated) return `${player.name} is satisfied for now, but expects you to follow through.`;
  if (option.promise && !promiseCreated) return `${player.name} heard the reassurance, but you had already made that promise.`;
  if ((after.level ?? 70) > (before.level ?? 70)) return `${player.name} appreciated the honesty and left the meeting calmer.`;
  if ((after.level ?? 70) < (before.level ?? 70)) return `${player.name} remains concerned and the issue may need action later.`;
  return `${player.name} accepted the answer, but the situation is still worth monitoring.`;
}

export function applyConversationChoice(state, player, option, event = null) {
  if (!player || !option) return state;
  let next = ensureMoraleConversationState(state);
  const before = getMorale(next, player.id);
  const promiseCountBefore = (before.promises || []).filter(p => p.status === "active").length;
  if (option.promise) {
    next = makePromise(next, player.id, option.promise);
    const def = PROMISE_TYPES[option.promise] || {};
    next = applyPlayerEvent(next, player, {
      delta: def.importance === "High" ? 7 : def.importance === "Low" ? 4 : 6,
      trustDelta: def.importance === "High" ? 5 : 3,
      label: `Meeting promise: ${def.label || option.label}`,
      concernsRemove: def.removesConcern || [],
    });
  }
  if (option.morale) next = applyPlayerEvent(next, player, option.morale);
  if (option.concern) {
    const def = Object.values(CONCERNS).find(c => c.key === option.concern);
    next = applyPlayerEvent(next, player, { delta: 0, concernsAdd: [{ key: option.concern, label: def?.label || option.concern }] });
  }
  const after = getMorale(next, player.id);
  const activeAfter = (after.promises || []).filter(p => p.status === "active");
  const promiseCreated = activeAfter.length > promiseCountBefore;
  const createdPromise = promiseCreated ? activeAfter[activeAfter.length - 1] : null;
  const outcome = {
    id: `outcome_${Date.now().toString(36)}`,
    playerId: player.id,
    playerName: player.name,
    topic: event?.topic || topicForState(state, player),
    response: option.label,
    summary: describeOutcome(player, option, before, after, promiseCreated),
    effects: [
      `Morale: ${after.level - before.level >= 0 ? "+" : ""}${after.level - before.level}`,
      `Trust: ${after.trust - before.trust >= 0 ? "+" : ""}${after.trust - before.trust}`,
      promiseCreated ? `Promise added: ${createdPromise.label}` : "No promise created",
      after.concerns?.length ? `Active concerns: ${after.concerns.map(c => c.label).slice(-2).join(", ")}` : "Concern settled for now",
    ],
    promiseCreated: createdPromise ? { id: createdPromise.id, label: createdPromise.label, deadlineSeason: createdPromise.deadlineSeason, deadlineStage: createdPromise.deadlineStage } : null,
    season: next.season ?? 1,
    stage: next.schedule?.stageIdx ?? 0,
  };
  const history = [...(after.conversationHistory || []), {
    date: `S${outcome.season} Stage ${(outcome.stage ?? 0) + 1}`,
    topic: topicTitle(outcome.topic),
    response: option.label,
    outcome: outcome.summary,
    promise: createdPromise?.label || null,
  }].slice(-CONVERSATION_HISTORY_CAP);
  next = writeMorale(next, player.id, { ...after, conversationHistory: history });
  if (event?.id) {
    next = {
      ...next,
      moraleConversationEvents: (next.moraleConversationEvents || []).map(e => e.id === event.id ? { ...e, status: "resolved", actionRequired: false, resolvedSeason: outcome.season, resolvedStage: outcome.stage } : e),
    };
  }
  const key = eventKey(player.id, outcome.topic);
  next = {
    ...next,
    lastMoraleConversationOutcome: outcome,
    moraleConversationCooldowns: { ...(next.moraleConversationCooldowns || {}), [key]: stageClock(next.season, next.schedule?.stageIdx ?? 0) + COOLDOWN_STAGES },
  };
  return ensureMoraleConversationState(next);
}

// ── Squad-level summary (for the Dynamics page) ───────────────────────────────
export function getSquadMorale(state) {
  const userTeamId = state?.userTeamId;
  const challenger = isChallengerMode(state);
  const players = (state?.players || []).concat(state?.prospects || []);
  const roster = players.filter(p => {
    if (isInactivePlayer(p)) return false;
    return challenger ? p.challengerTeamId === userTeamId : p.teamId === userTeamId;
  });
  const rows = roster.map(p => {
    const m = getMorale(state, p.id);
    return { player: p, morale: m, level: m.level, mood: m.mood, trust: m.trust };
  });
  const avg = rows.length ? Math.round(rows.reduce((s, r) => s + r.level, 0) / rows.length) : 70;
  const leaders = rows.filter(r => (r.player.leadership ?? 3) >= 4).map(r => r.player);
  const unhappy = rows.filter(r => r.level < 45).map(r => r);
  const atRisk = rows.filter(r => r.level < 30).map(r => r);
  const activePromises = [];
  const brokenPromises = [];
  for (const r of rows) {
    for (const pr of r.morale.promises || []) {
      if (pr.status === "active") activePromises.push({ ...pr, player: r.player });
      else if (pr.status === "broken") brokenPromises.push({ ...pr, player: r.player });
    }
  }
  return {
    rows, avg, mood: moodForLevel(avg), leaders, unhappy, atRisk,
    actionRequired: getActionRequiredMoraleEvents(state),
    activePromises, brokenPromises,
    note: getDressingRoomNote({ avg, unhappy, atRisk, rows, brokenPromises, activePromises }),
  };
}

function getDressingRoomNote({ avg, unhappy, atRisk, rows, brokenPromises }) {
  const notes = [];
  if (avg >= 78) notes.push("The squad is in a great place and morale is high.");
  else if (avg >= 64) notes.push("The squad is broadly happy with how things are going.");
  else if (avg >= 50) notes.push("The dressing room is settled but a few issues are simmering.");
  else if (avg >= 38) notes.push("Morale is fragile and unrest is building in the dressing room.");
  else notes.push("The dressing room is close to breaking point.");

  const benchConcern = rows.filter(r => r.morale.concerns.some(c => c.key === "benched" || c.key === "wants_start")).length;
  if (benchConcern >= 2) notes.push("Several bench players are concerned about playing time.");
  if (rows.some(r => r.morale.concerns.some(c => c.key === "blocked_move"))) notes.push("One player is frustrated after a blocked move.");
  if (rows.some(r => r.morale.concerns.some(c => c.key === "missed_major"))) notes.push("Morale took a knock after a disappointing Major.");
  if (brokenPromises.length) notes.push(`${brokenPromises.length} broken promise${brokenPromises.length === 1 ? "" : "s"} ${brokenPromises.length === 1 ? "is" : "are"} weighing on trust.`);
  if (atRisk.length) notes.push(`${atRisk.length} player${atRisk.length === 1 ? "" : "s"} ${atRisk.length === 1 ? "is" : "are"} at risk of wanting out.`);
  else if (unhappy.length) notes.push(`${unhappy.length} player${unhappy.length === 1 ? "" : "s"} ${unhappy.length === 1 ? "is" : "are"} unsettled.`);
  return notes.join(" ");
}

// ── Transfer / contract influence (MODEST, bounded) ───────────────────────────
// Small willingness delta added to the transfer engine's player-terms score.
// Range roughly -0.08 (very happy/loyal) to +0.18 (wants out). Returns 0 when
// no morale entry exists, so AI players without morale are unaffected.
export function moraleWillingnessDelta(state, player) {
  const pm = state?.playerMorale;
  if (!pm || !player || !pm[player.id]) return 0;
  const m = pm[player.id];
  const level = m.level ?? 70;
  let d = 0;
  if (level < 30) d += 0.18;
  else if (level < 45) d += 0.11;
  else if (level < 60) d += 0.05;
  else if (level >= 80) d -= 0.06;
  if (m.concerns?.some(c => c.key === "wants_move" || c.key === "wants_cdl_move" || c.key === "blocked_move")) d += 0.06;
  if (m.concerns?.some(c => c.key === "broken_promise" || c.key === "lost_trust")) d += 0.05;
  return clampRange(d, -0.08, 0.22);
}

// Multiplier applied to a re-sign salary demand. Happy players are slightly
// cheaper to keep; unhappy / mistrustful players cost more (or are reluctant).
// Bounded to 0.95–1.12 so it never dominates the existing demand math.
export function moraleContractMultiplier(state, player) {
  const pm = state?.playerMorale;
  if (!pm || !player || !pm[player.id]) return 1;
  const m = pm[player.id];
  const level = m.level ?? 70;
  let mult = 1;
  if (level >= 80) mult -= 0.05;
  else if (level < 45) mult += 0.08;
  else if (level < 60) mult += 0.04;
  if (m.concerns?.some(c => c.key === "broken_promise" || c.key === "lost_trust")) mult += 0.04;
  return clampRange(mult, 0.95, 1.12);
}

// Tiny chemistry nudge (bounded ±3) so a happy room plays marginally better and
// an unhappy one slightly worse. Read-only helper; callers decide whether to use.
export function moraleChemistryDelta(state, teamPlayers = []) {
  if (!teamPlayers.length) return 0;
  const pm = state?.playerMorale || {};
  const levels = teamPlayers.map(p => pm[p.id]?.level).filter(n => typeof n === "number");
  if (!levels.length) return 0;
  const avg = levels.reduce((a, b) => a + b, 0) / levels.length;
  return clampRange(Math.round((avg - 65) / 8), -3, 3);
}
