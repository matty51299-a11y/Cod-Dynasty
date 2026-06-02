// src/engine/transferEngine.js
// In-contract Transfer / Buyout / Trade negotiation system.
//
// Pure, deterministic helpers + state transitions. NEVER changes match sim,
// ratings, brackets, points, awards, map/veto logic. Builds on the existing
// contract (player.contractYears / player.salary), budget (getTeamCap /
// getSigningCost), roster-integrity (ensureCdlRosterIntegrity), staff (Assistant
// GM negotiation/reputation) and board (boardState.confidence) systems.
//
// Storage lives in `state.transferMarket` (see migrateTransferMarket). User-set
// transfer statuses / asking prices are stored there keyed by playerId rather
// than mutated onto player objects, so old saves hydrate safely and player data
// stays clean. Buyout values are derived on demand from a valuation model.

import { CDL_TEAMS } from "../data/teams.js";
import { getTeamCap, getSigningCost, getTeamBudgetTier } from "./rosterAI.js";
import { calcTeamOvr } from "./teamOvr.js";
import { isCdlTeamId, isInactivePlayer } from "../utils/playerIdentity.js";
import { getActiveStarters } from "../utils/rosterValidation.js";

export const TRANSFER_VERSION = 1;

export const TRANSFER_STATUSES = [
  "Open to Offers", "Transfer Listed", "Not For Sale",
  "Unsettled", "Wants Move", "Recently Signed", "Protected",
];
export const OFFER_STATUSES = ["Pending", "Accepted", "Rejected", "Countered", "Withdrawn", "Expired"];

// ── Tiny deterministic helpers ───────────────────────────────────────────────
function hashStr(str) {
  let h = 2166136261 >>> 0;
  const s = String(str ?? "");
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
function unit(key) { return (hashStr(key) % 100000) / 100000; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function clamp01(v) { return clamp(v, 0, 1); }
function round5k(v) { return Math.round(v / 5000) * 5000; }
export function fmtFee(n) { return `$${Math.round((n || 0) / 1000)}k`; }
export function teamTag(id) { return CDL_TEAMS.find(t => t.id === id)?.tag ?? id; }
export function teamName(id) { return CDL_TEAMS.find(t => t.id === id)?.name ?? id; }

// ── Migration / hydration ────────────────────────────────────────────────────
export function migrateTransferMarket(existing) {
  const e = existing && typeof existing === "object" ? existing : {};
  return {
    version: TRANSFER_VERSION,
    negotiations: Array.isArray(e.negotiations) ? e.negotiations : [],
    status: e.status && typeof e.status === "object" ? e.status : {},        // { [playerId]: {transferStatus, askingPrice} }
    budgets: e.budgets && typeof e.budgets === "object" ? e.budgets : {},    // { [teamId]: {balance, spend, income} }
    recentlyTransferred: e.recentlyTransferred && typeof e.recentlyTransferred === "object" ? e.recentlyTransferred : {},
    cooldowns: e.cooldowns && typeof e.cooldowns === "object" ? e.cooldowns : {},
    lastWaveKey: e.lastWaveKey ?? null,
    waveNonce: e.waveNonce ?? 0,
    nextId: e.nextId ?? 1,
  };
}

// ── Transfer windows / timing ────────────────────────────────────────────────
// Open during offseason, contract review, pre-champs and the regular stage
// (between matchdays). Closed during live events (Major / Champs / ESWC / the
// Challenger qualifier) once event rosters are baked.
export function isTransferWindowOpen(state) {
  const phase = state?.schedule?.phase;
  return phase === "stage" || phase === "preChamps" || phase === "offseason" || phase === "contracts";
}
export function getWindowKey(state) {
  const season = state?.season ?? 1;
  const phase = state?.schedule?.phase ?? "stage";
  const stageIdx = state?.schedule?.stageIdx ?? 0;
  return phase === "stage" ? `${season}:st${stageIdx}` : `${season}:${phase}`;
}
export function transferWindowLabel(state) {
  if (!isTransferWindowOpen(state)) return "Closed (live event)";
  const phase = state?.schedule?.phase;
  if (phase === "offseason" || phase === "contracts") return "Offseason window — open";
  if (phase === "preChamps") return "Pre-Champs window — open";
  return `Stage ${(state?.schedule?.stageIdx ?? 0) + 1} window — open`;
}

// ── Staff (GM) negotiation influence — modest ────────────────────────────────
function teamGm(state, teamId) {
  return (state?.staff || []).find(s => s.currentTeamId === teamId && s.role === "assistant_gm");
}
// 0..1 negotiation skill of a team's Assistant GM (drives fee leverage).
export function getGmNegotiation(state, teamId) {
  const gm = teamGm(state, teamId);
  return clamp01(((gm?.negotiation ?? 55) - 40) / 50);
}
// 0..1 reputation (helps attract players / big moves).
export function getGmReputation(state, teamId) {
  const gm = teamGm(state, teamId);
  return clamp01(((gm?.reputation ?? 55) - 40) / 50);
}

// ── User-set status / asking price (stored in transferMarket.status) ─────────
export function getTransferStatus(player, state) {
  if (!player) return "Open to Offers";
  const tm = state?.transferMarket;
  const recent = tm?.recentlyTransferred?.[player.id];
  if (recent) return "Recently Signed";
  const set = tm?.status?.[player.id]?.transferStatus;
  return set || "Open to Offers";
}
export function getAskingPriceOverride(player, state) {
  return state?.transferMarket?.status?.[player.id]?.askingPrice ?? null;
}
export function isNotForSale(player, state) { return getTransferStatus(player, state) === "Not For Sale"; }
export function isTransferListed(player, state) { return getTransferStatus(player, state) === "Transfer Listed"; }

// ── Valuation / buyout ───────────────────────────────────────────────────────
// Builds on getSigningCost (the salary/market curve) and inflates it for an
// in-contract buyout based on contract length, age, potential, recent form,
// transfer status and the selling owner's ambition. Deterministic.
export function getPlayerValuation(player, state) {
  if (!player) return 0;
  const base = getSigningCost(player);
  const ovr = player.overall ?? 70;
  const pot = player.potential ?? ovr;
  const age = player.age ?? 23;
  const years = clamp(player.contractYears ?? 1, 0, 4);

  let mult = 1.05;
  mult += 0.16 * years;                                    // long contract = expensive to prise away
  if (age <= 20) mult += 0.18; else if (age <= 22) mult += 0.10;
  else if (age >= 30) mult -= 0.32; else if (age >= 28) mult -= 0.18; else if (age >= 26) mult -= 0.08;
  const gap = pot - ovr;
  if (age <= 24 && pot >= 90) mult += 0.22; else if (age <= 25 && gap >= 8) mult += 0.10;
  if (ovr >= 90) mult += 0.15; else if (ovr >= 86) mult += 0.08;

  // Recent form (rolling) nudges value ±8%.
  const form = player.form ?? 65;
  mult += clamp((form - 65) / 35, -1, 1) * 0.08;

  // Selling owner ambition: ambitious orgs price their players higher.
  const owner = CDL_TEAMS.find(t => t.id === player.teamId)?.owner;
  if (owner) mult += clamp((owner.ambition - 60) / 100, -0.15, 0.2);

  // Transfer status.
  const status = getTransferStatus(player, state);
  if (status === "Not For Sale") mult *= 2.3;
  else if (status === "Transfer Listed") mult *= 0.7;
  else if (status === "Wants Move" || status === "Unsettled") mult *= 0.85;

  return Math.max(15000, round5k(base * Math.max(0.4, mult)));
}

// The seller's anchor: user asking price (if set) wins, else valuation.
export function getAskingPrice(player, state) {
  const override = getAskingPriceOverride(player, state);
  if (override != null) return round5k(override);
  return getPlayerValuation(player, state);
}

// ── Transfer budget (separate from salary cap) ───────────────────────────────
export function getTransferBudget(state, teamId) {
  const stored = state?.transferMarket?.budgets?.[teamId];
  if (stored && typeof stored.balance === "number") return stored;
  // Lazy default: proportional to the org's salary cap.
  const balance = round5k(getTeamCap(teamId) * 0.6);
  return { balance, spend: 0, income: 0 };
}

// Salary-cap room for a buyer to add `salary` as a starter (subs are cap-free).
function capRoomForStarter(state, teamId, addSalary, excludePlayerId = null) {
  const starters = getActiveStarters(state.players, teamId).filter(p => p.id !== excludePlayerId);
  const committed = starters.reduce((s, p) => s + (p.salary ?? getSigningCost(p)), 0);
  return getTeamCap(teamId) - committed - addSalary;
}

// ── Player willingness to move (buyer = destination) ─────────────────────────
// 0..1 chance the player accepts joining `buyerTeamId`. First-pass: team
// strength delta, budget tier, GM reputation, salary uplift, age, loyalty.
export function playerWillingness(player, buyerTeamId, sellerTeamId, state, opts = {}) {
  if (!player) return 0;
  const buyerOvr = calcTeamOvr(buyerTeamId, state.players) || 75;
  const sellerOvr = calcTeamOvr(sellerTeamId, state.players) || 75;
  let w = 0.5;
  const delta = buyerOvr - sellerOvr;
  w += clamp(delta / 20, -0.35, 0.35);                 // upgrade good, downgrade bad
  w += (getTeamBudgetTier(buyerTeamId) - getTeamBudgetTier(sellerTeamId)) * 0.04;
  w += getGmReputation(state, buyerTeamId) * 0.12;
  // Salary uplift offered (default: keep current salary).
  const offeredSalary = opts.salary ?? player.salary ?? getSigningCost(player);
  const cur = player.salary ?? getSigningCost(player);
  w += clamp((offeredSalary - cur) / Math.max(cur, 1), -0.5, 0.5) * 0.2;
  // Joining as a substitute is unattractive for a starter-quality player.
  if (opts.asSub) w -= 0.25;
  // Age: veterans chase contention, youngsters chase playing time on the rise.
  const age = player.age ?? 23;
  if (age >= 28) w += clamp(delta / 25, -0.1, 0.15);
  // Loyalty / leadership: settled veterans are harder to move.
  const loyalty = ((player.leadership ?? 50) + (player.workEthic ?? 50)) / 2;
  if (loyalty >= 78) w -= 0.1;
  const status = getTransferStatus(player, state);
  if (status === "Wants Move" || status === "Unsettled") w += 0.2;
  return clamp01(w);
}

// ── Seller AI response to a buy offer (buyer offers `fee`) ────────────────────
// Returns { decision: "accept"|"reject"|"counter", counterFee, reason }.
export function evaluateSellResponse(state, player, buyerTeamId, fee) {
  const ask = getAskingPrice(player, state);
  const status = getTransferStatus(player, state);
  const sellerTeamId = player.teamId;

  // Not For Sale: only an enormous bid from a strong org gets considered.
  if (status === "Not For Sale") {
    const buyerStrong = getTeamBudgetTier(buyerTeamId) >= 5 || calcTeamOvr(buyerTeamId, state.players) >= 86;
    if (fee >= ask * (buyerStrong ? 1.1 : 1.5)) return { decision: "accept", reason: "Blown away by the bid" };
    return { decision: "reject", reason: "Not for sale" };
  }

  // GM negotiation lets the seller hold out for a touch more.
  const sellerNeg = getGmNegotiation(state, sellerTeamId);
  const acceptThreshold = ask * (0.96 + sellerNeg * 0.06);     // ~0.96–1.02× asking
  if (fee >= acceptThreshold) return { decision: "accept", reason: "Fee meets valuation" };

  // Way too low → reject; otherwise counter toward the asking price.
  if (fee < ask * 0.5) return { decision: "reject", reason: "Derisory bid" };
  const counterFee = round5k(Math.max(fee * 1.15, (ask + fee) / 2 + ask * 0.05));
  return { decision: "counter", counterFee, reason: "Below valuation — countered" };
}

// ── Buyer (AI) response when the user counters an incoming offer ─────────────
// The AI buyer decides whether to pay the user's counter. Bounded by what the
// AI is willing/able to pay (valuation tolerance + transfer budget + cap room).
export function evaluateBuyerCounterResponse(state, player, buyerTeamId, counterFee) {
  const ask = getPlayerValuation(player, state);
  const buyerNeg = getGmNegotiation(state, buyerTeamId);
  const maxPay = Math.min(
    ask * (1.18 + buyerNeg * 0.12),                          // up to ~1.3× valuation
    getTransferBudget(state, buyerTeamId).balance
  );
  const salary = player.salary ?? getSigningCost(player);
  const capOk = capRoomForStarter(state, buyerTeamId, salary, /*they will free a slot*/ null) > -salary; // lenient: AI frees weakest
  if (!capOk) return { decision: "reject", reason: "Cannot fit wages" };
  if (counterFee <= maxPay) return { decision: "accept", reason: "Met the counter" };
  if (counterFee <= maxPay * 1.15) {
    return { decision: "counter", counterFee: round5k((counterFee + maxPay) / 2), reason: "Final improved offer" };
  }
  return { decision: "reject", reason: "Counter too rich" };
}

// ── AI interest in buying a specific user player ─────────────────────────────
// Returns an interest score 0..1 and a human reason, or null if no interest.
export function aiInterestInPlayer(state, buyerTeamId, player) {
  if (!player || player.teamId === buyerTeamId) return null;
  if (isInactivePlayer(player)) return null;
  if (getTransferStatus(player, state) === "Recently Signed") return null;

  const buyerOvr = calcTeamOvr(buyerTeamId, state.players) || 75;
  const sellerOvr = calcTeamOvr(player.teamId, state.players) || 75;
  const ovr = player.overall ?? 70;
  const age = player.age ?? 23;
  const pot = player.potential ?? ovr;

  // Role need: does the buyer have a weak starter in the player's primary role?
  const buyerStarters = getActiveStarters(state.players, buyerTeamId);
  const roleStarters = buyerStarters.filter(p => p.primary === player.primary);
  const weakestInRole = roleStarters.length ? Math.min(...roleStarters.map(p => p.overall ?? 70)) : 0;
  const upgradesRole = ovr > weakestInRole + 2;
  const upgradesTeam = ovr >= buyerOvr - 1;

  let score = 0;
  if (upgradesRole) score += 0.35;
  if (upgradesTeam) score += 0.25;
  if (buyerOvr > sellerOvr) score += 0.15;                   // bigger team eyeing weaker team's player
  if (age <= 23 && pot >= 86) score += 0.2;                  // young upside
  if (getTransferStatus(player, state) === "Transfer Listed") score += 0.25;
  if (getTransferStatus(player, state) === "Wants Move") score += 0.2;
  // Ambition of the buying owner.
  const owner = CDL_TEAMS.find(t => t.id === buyerTeamId)?.owner;
  if (owner) score += clamp((owner.ambition - 60) / 200, -0.1, 0.15);
  // GM scouting/negotiation sharpens recruitment.
  score += getGmNegotiation(state, buyerTeamId) * 0.1;

  if (score < 0.45) return null;

  // Affordability: transfer budget for the fee + cap room for wages (AI frees a slot).
  const val = getPlayerValuation(player, state);
  const budget = getTransferBudget(state, buyerTeamId).balance;
  if (budget < val * 0.8) return null;

  const reasons = [];
  if (upgradesRole) reasons.push(`upgrade at ${player.primary}`);
  else if (upgradesTeam) reasons.push("immediate starter");
  if (age <= 23 && pot >= 86) reasons.push("high-potential youngster");
  if (buyerOvr > sellerOvr) reasons.push("targeting a weaker rival");
  return { score: clamp01(score), reason: reasons.join(", ") || "squad depth", valuation: val };
}

// ── Generate incoming AI offers for the user's players (one wave) ────────────
// Deterministic per window key; controlled frequency + anti-spam cooldowns.
export function generateIncomingOffers(state) {
  const tm = migrateTransferMarket(state.transferMarket);
  const userTeamId = state.userTeamId;
  const windowKey = getWindowKey(state);
  const phase = state?.schedule?.phase;
  const offseasonish = phase === "offseason" || phase === "contracts" || phase === "preChamps";

  // Window budget for how many offers can arrive (kept calm).
  const seedBase = `${windowKey}:${userTeamId}:${tm.waveNonce}`;
  const maxOffers = offseasonish ? 2 : (unit(seedBase + ":freq") < 0.5 ? 1 : 0);
  if (maxOffers === 0) return [];

  const userPlayers = state.players.filter(p => p.teamId === userTeamId && !isInactivePlayer(p));
  const aiTeams = CDL_TEAMS.map(t => t.id).filter(id => id !== userTeamId);

  // Score all (team, player) pairs, take the strongest, de-duped per player.
  const candidates = [];
  for (const buyerTeamId of aiTeams) {
    for (const player of userPlayers) {
      const cdKey = `${buyerTeamId}:${player.id}`;
      if (tm.cooldowns[cdKey] === windowKey) continue;                       // already approached this window
      if (tm.recentlyTransferred[player.id]) continue;                       // protected after a move
      // Don't re-offer if a live negotiation already exists for this pair.
      if (tm.negotiations.some(n => n.status === "Pending" && n.playerId === player.id && n.fromTeamId === buyerTeamId)) continue;
      const interest = aiInterestInPlayer(state, buyerTeamId, player);
      if (!interest) continue;
      // Deterministic gate so not every interested team bids.
      const roll = unit(`${seedBase}:${buyerTeamId}:${player.id}`);
      if (roll > 0.45 + interest.score * 0.4) continue;
      candidates.push({ buyerTeamId, player, interest, roll });
    }
  }
  candidates.sort((a, b) => (b.interest.score - a.interest.score) || (a.roll - b.roll));

  const offers = [];
  const usedPlayers = new Set();
  let id = tm.nextId;
  for (const c of candidates) {
    if (offers.length >= maxOffers) break;
    if (usedPlayers.has(c.player.id)) continue;
    usedPlayers.add(c.player.id);
    // Opening fee: a bit below valuation (room to negotiate), listed players lower.
    const val = c.interest.valuation;
    const listed = isTransferListed(c.player, state);
    const fee = round5k(val * (listed ? 0.8 : 0.85 + unit(`${seedBase}:${c.player.id}:fee`) * 0.08));
    offers.push({
      id: `tr_${id++}`,
      fromTeamId: c.buyerTeamId, toTeamId: userTeamId, playerId: c.player.id,
      offerType: "buyout", fee, includedPlayerIds: [],
      status: "Pending", counterFee: null, counterBy: null, round: 0,
      initiator: "ai", reason: c.interest.reason,
      season: state.season, stageIdx: state.schedule?.stageIdx ?? 0, phase: state.schedule?.phase,
      createdKey: windowKey, expiresKey: windowKey,
      history: [{ by: c.buyerTeamId, action: "offer", fee }],
    });
  }
  return offers;
}

// ── Apply a completed transfer (player moves buyer←seller) ───────────────────
// Returns { players, transferMarket, feed, notif, blockedReason }. Does not run
// integrity itself (the reducer runs ensureCdlRosterIntegrity afterwards).
export function buildTransferResult(state, neg, agreedFee) {
  const buyerTeamId = neg.fromTeamId;
  const sellerTeamId = neg.toTeamId;
  const player = state.players.find(p => p.id === neg.playerId);
  if (!player || player.teamId !== sellerTeamId) {
    return { blockedReason: "Player is no longer available." };
  }
  const salary = player.salary ?? getSigningCost(player);
  const userIsBuyer = buyerTeamId === state.userTeamId;

  // Determine destination slot.
  const buyerStarters = getActiveStarters(state.players, buyerTeamId);
  let asSub = false;
  let releaseId = null;
  if (buyerStarters.length >= 4) {
    if (userIsBuyer) {
      const subs = state.players.filter(p => p.teamId === buyerTeamId && p.isSub && !isInactivePlayer(p));
      if (subs.length >= 1) {
        return { blockedReason: "Roster full — release a starter or your sub to make room." };
      }
      asSub = true; // user signs as sub
    } else {
      // AI frees its weakest starter (not the target's slot) to FA.
      const weakest = [...buyerStarters].sort((a, b) => (a.overall ?? 70) - (b.overall ?? 70))[0];
      releaseId = weakest?.id ?? null;
    }
  }

  // Salary-cap check for the buyer (subs are cap-free; AI release frees room).
  if (!asSub) {
    const room = capRoomForStarter(state, buyerTeamId, salary, releaseId);
    if (room < 0) {
      if (userIsBuyer) return { blockedReason: `Over salary cap — wages exceed cap by ${fmtFee(-room)}.` };
      // AI shouldn't reach here (affordability pre-checked); bail safely.
      return { blockedReason: "Buyer cannot fit wages." };
    }
  }

  const tm = migrateTransferMarket(state.transferMarket);
  const windowKey = getWindowKey(state);

  // Move the player.
  const players = state.players.map(p => {
    if (p.id === player.id) {
      const hist = p.teamHistory || [];
      const teamHistory = hist.some(e => e.season === state.season)
        ? hist : [...hist, { season: state.season, teamId: buyerTeamId }];
      return {
        ...p, teamId: buyerTeamId, challengerTeamId: null, status: "cdl", circuit: "cdl",
        isSub: asSub, contractYears: Math.max(1, p.contractYears ?? 2), teamHistory,
        previousTeamId: sellerTeamId,
      };
    }
    if (p.id === releaseId) {
      return { ...p, teamId: null, challengerTeamId: null, isSub: false, status: "freeAgent", previousTeamId: buyerTeamId, contractYears: 0 };
    }
    return p;
  });

  // Budgets (display-only accounting separate from the salary cap).
  const buyerBudget = getTransferBudget(state, buyerTeamId);
  const sellerBudget = getTransferBudget(state, sellerTeamId);
  const budgets = {
    ...tm.budgets,
    [buyerTeamId]: { balance: round5k(buyerBudget.balance - agreedFee), spend: (buyerBudget.spend || 0) + agreedFee, income: buyerBudget.income || 0 },
    [sellerTeamId]: { balance: round5k(sellerBudget.balance + agreedFee), spend: sellerBudget.spend || 0, income: (sellerBudget.income || 0) + agreedFee },
  };

  // Withdraw any other live offers for the same player; mark this protected.
  const negotiations = tm.negotiations.map(n =>
    n.playerId === player.id && n.id !== neg.id && n.status === "Pending"
      ? { ...n, status: "Withdrawn", history: [...(n.history || []), { by: "system", action: "withdrawn-sold" }] }
      : n
  );
  const recentlyTransferred = { ...tm.recentlyTransferred, [player.id]: windowKey };
  // Clear any user-set status for the moved player.
  const status = { ...tm.status };
  delete status[player.id];

  const transferMarket = { ...tm, negotiations, budgets, recentlyTransferred, status };

  return { players, transferMarket, player, buyerTeamId, sellerTeamId, agreedFee, asSub, releaseId };
}

// ── Board nudge for the user after a sale/buy (small, clamped) ────────────────
export function boardNudgeForTransfer(boardState, { userIsSeller, player, fee, state }) {
  if (!boardState || typeof boardState.confidence !== "number") return boardState;
  const ovr = player.overall ?? 70;
  const val = getPlayerValuation(player, state);
  let delta = 0;
  if (userIsSeller) {
    if (ovr >= 85 && fee < val * 0.8) delta -= 4;            // sold a star cheaply
    else if (ovr >= 85) delta += 2;                          // cashed in on a star at value
    else if (fee > val) delta += 2;                          // good business
  } else {
    if (ovr >= 85) delta += 4;                               // statement signing
    else if (ovr >= 80) delta += 2;
  }
  if (delta === 0) return boardState;
  return { ...boardState, confidence: clamp(boardState.confidence + delta, 0, 100) };
}

// ── Convenience selectors for UI ─────────────────────────────────────────────
export function getIncomingOffers(state) {
  return (state?.transferMarket?.negotiations || []).filter(n => n.toTeamId === state.userTeamId && n.initiator === "ai");
}
export function getOutgoingOffers(state) {
  return (state?.transferMarket?.negotiations || []).filter(n => n.fromTeamId === state.userTeamId && n.initiator === "user");
}
export function getLeagueTransferListed(state) {
  const tm = state?.transferMarket;
  if (!tm?.status) return [];
  return Object.entries(tm.status)
    .filter(([, v]) => v.transferStatus === "Transfer Listed")
    .map(([pid]) => (state.players || []).find(p => p.id === pid))
    .filter(p => p && !isInactivePlayer(p) && p.teamId && isCdlTeamId(p.teamId));
}
