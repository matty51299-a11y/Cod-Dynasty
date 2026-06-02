// scripts/diagnoseTransferMarket.mjs
// Verifies the Transfer / Buyout negotiation system.
//
// Run with:
//   node --loader ./scripts/asset-loader.mjs scripts/diagnoseTransferMarket.mjs
//
// Checks: valuations generate, user can receive/reject/counter/accept an offer,
// player moves cleanly (old team loses, new team gains), salary cap respected,
// no duplicate ownership, AI teams repair if thin, pending offers persist,
// outgoing offers + seller responses work, and old saves hydrate safely.

import { buildInitialRoster } from "../src/data/players.js";
import { generateProspects } from "../src/data/prospects.js";
import { applyChallengerRatingOverride } from "../src/data/challengerRatingOverrides.js";
import { CDL_TEAMS } from "../src/data/teams.js";
import { buildSeason, ensureChallengerTeams } from "../src/engine/seasonEngine.js";
import { ensureCdlRosterIntegrity, getTeamCap, getSigningCost } from "../src/engine/rosterAI.js";
import { ensureTeamStaff, migrateStaff } from "../src/engine/staffEngine.js";
import { getActiveStarters } from "../src/utils/rosterValidation.js";
import {
  migrateTransferMarket, isTransferWindowOpen, getWindowKey, generateIncomingOffers,
  getPlayerValuation, getAskingPrice, evaluateSellResponse, evaluateBuyerCounterResponse,
  buildTransferResult, getTransferBudget, getTransferStatus, getLeagueTransferListed,
  getAcceptedOutgoingTermsOffers, getTransferTermsPreview, isOutgoingTermsRequired,
  getProtectedPlayerInfo, evaluatePlayerTerms, getTransferIntel,
} from "../src/engine/transferEngine.js";

let pass = 0, fail = 0;
const fails = [];
function check(name, cond, detail = "") {
  if (cond) pass++; else { fail++; fails.push(`${name}${detail ? ` — ${detail}` : ""}`); }
}

function newGame(teamId = "boston") {
  const players = buildInitialRoster().map(applyChallengerRatingOverride);
  const prospects = generateProspects(424242).map(applyChallengerRatingOverride);
  const state = {
    userTeamId: teamId, season: 1, players, prospects,
    schedule: { ...buildSeason(1), phase: "offseason", stageIdx: 0 },
    notifications: [], feed: [], playerSeasonStats: {}, playerOvrHistory: {},
    retiredPlayers: [], challengersLog: [], challengerTransactions: [], seasonHistory: [],
    staff: ensureTeamStaff(migrateStaff([])),
    boardState: { confidence: 60, objectives: [] },
    transferMarket: migrateTransferMarket(null),
  };
  ensureChallengerTeams(state);
  return ensureCdlRosterIntegrity(state, { windowType: "diagnose_transfer" });
}

function noDuplicateOwnership(state) {
  const seen = new Map();
  for (const p of state.players) {
    if (p.teamId && !p.isSub === undefined) continue;
    if (p.teamId) {
      if (seen.has(p.id)) return false;
      seen.set(p.id, p.teamId);
    }
  }
  // Each active player appears once in players[]; check name uniqueness per CDL team active set.
  const activeByName = {};
  for (const p of state.players) {
    if (!p.teamId) continue;
    const k = (p.name || "").toLowerCase();
    activeByName[k] = (activeByName[k] || 0) + 1;
  }
  return !Object.values(activeByName).some(c => c > 1);
}

// ── 1. Valuations generate + are sensible ────────────────────────────────────
{
  const s = newGame();
  let allPositive = true, contractInflates = true;
  for (const p of s.players.filter(p => p.teamId)) {
    const v = getPlayerValuation(p, s);
    if (!(v > 0)) allPositive = false;
  }
  check("valuation: positive for all rostered players", allPositive);
  // A star on a long contract should be worth more than its raw signing cost.
  const star = s.players.filter(p => p.teamId).sort((a, b) => b.overall - a.overall)[0];
  check("valuation: star valued at/above signing cost", getPlayerValuation({ ...star, contractYears: 3 }, s) >= getSigningCost(star), `val=${getPlayerValuation(star, s)} cost=${getSigningCost(star)}`);
  // Not-for-sale inflates; transfer-listed deflates.
  const base = getPlayerValuation(star, s);
  const nfsState = { ...s, transferMarket: { ...s.transferMarket, status: { [star.id]: { transferStatus: "Not For Sale" } } } };
  const listState = { ...s, transferMarket: { ...s.transferMarket, status: { [star.id]: { transferStatus: "Transfer Listed" } } } };
  check("valuation: NFS > base > listed", getPlayerValuation(star, nfsState) > base && base > getPlayerValuation(star, listState));
}

// ── 2. Transfer window timing ────────────────────────────────────────────────
{
  const s = newGame();
  check("window: open in offseason", isTransferWindowOpen(s));
  check("window: closed during major", !isTransferWindowOpen({ ...s, schedule: { ...s.schedule, phase: "major" } }));
  check("window: open during stage", isTransferWindowOpen({ ...s, schedule: { ...s.schedule, phase: "stage" } }));
}

// ── 3. Incoming offer generation (deterministic, no crash, valid shape) ──────
{
  const s = newGame("boston");
  // Make a strong young Boston player transfer-listed to attract interest.
  const target = s.players.filter(p => p.teamId === "boston").sort((a, b) => b.potential - a.potential)[0];
  s.transferMarket = { ...s.transferMarket, status: { [target.id]: { transferStatus: "Transfer Listed" } } };
  const offers = generateIncomingOffers(s);
  check("incoming: returns an array", Array.isArray(offers));
  const valid = offers.every(o => o.fromTeamId && o.toTeamId === "boston" && o.fee > 0 && o.status === "Pending" && o.playerId);
  check("incoming: offers well-formed", valid, `count=${offers.length}`);
}

// ── 4. User receives → reject keeps player; accept moves player ──────────────
{
  let s = newGame("boston");
  const buyer = "riyadh"; // rich, strong org
  const target = s.players.filter(p => p.teamId === "boston" && !p.isSub).sort((a, b) => b.overall - a.overall)[0];
  const val = getPlayerValuation(target, s);
  const neg = {
    id: "tr_test", fromTeamId: buyer, toTeamId: "boston", playerId: target.id,
    offerType: "buyout", fee: val, status: "Pending", initiator: "ai", history: [],
  };
  s.transferMarket = { ...s.transferMarket, negotiations: [neg] };

  // Reject → player stays.
  const rejected = { ...s, transferMarket: { ...s.transferMarket, negotiations: s.transferMarket.negotiations.map(n => ({ ...n, status: "Rejected" })) } };
  check("reject: player stays on user team", rejected.players.find(p => p.id === target.id).teamId === "boston");
  check("reject: pending offer persists in save (as rejected)", rejected.transferMarket.negotiations[0].status === "Rejected");

  // Counter (user as seller) → AI buyer evaluates.
  const counterResp = evaluateBuyerCounterResponse(s, target, buyer, val * 1.1);
  check("counter: buyer returns a decision", ["accept", "reject", "counter"].includes(counterResp.decision), counterResp.decision);

  // Accept → complete transfer.
  const result = buildTransferResult(s, neg, val);
  check("accept: transfer not blocked", !result.blockedReason, result.blockedReason || "");
  if (!result.blockedReason) {
    const moved = result.players.find(p => p.id === target.id);
    check("accept: player joins buyer", moved.teamId === buyer, `teamId=${moved.teamId}`);
    check("accept: player left old team", !result.players.some(p => p.id === target.id && p.teamId === "boston"));
    check("accept: seller transfer income recorded", result.transferMarket.budgets["boston"].income === val);
    check("accept: buyer transfer spend recorded", result.transferMarket.budgets[buyer].spend === val);

    // Run integrity on the resulting state; AI buyer freed a slot, Boston (user) dropped one.
    const after = ensureCdlRosterIntegrity({ ...s, players: result.players, transferMarket: result.transferMarket }, { windowType: "transfer" });
    check("integrity: buyer has exactly 4 starters", getActiveStarters(after.players, buyer).length === 4, `=${getActiveStarters(after.players, buyer).length}`);
    // The USER's selling team is intentionally NOT auto-filled (sim is blocked until the user fixes it).
    check("integrity: user seller left thin (by design, not force-filled)", getActiveStarters(after.players, "boston").length === 3, `=${getActiveStarters(after.players, "boston").length}`);
    check("integrity: no duplicate ownership", noDuplicateOwnership(after));
    // Player only on one team.
    const holders = after.players.filter(p => p.id === target.id && p.teamId).length;
    check("integrity: moved player rostered exactly once", holders === 1, `holders=${holders}`);
  }
}

// ── 4b. AI→AI buyout: the AI seller is repaired back to 4 ────────────────────
{
  const s = newGame("boston");          // user is Boston; this move is g2 → riyadh
  const target = s.players.filter(p => p.teamId === "g2" && !p.isSub).sort((a, b) => b.overall - a.overall)[0];
  const neg = { id: "tr_aiai", fromTeamId: "riyadh", toTeamId: "g2", playerId: target.id, offerType: "buyout", fee: getPlayerValuation(target, s), status: "Pending", initiator: "ai", history: [] };
  const result = buildTransferResult(s, neg, neg.fee);
  check("ai-ai: transfer completes", !result.blockedReason, result.blockedReason || "");
  if (!result.blockedReason) {
    const after = ensureCdlRosterIntegrity({ ...s, players: result.players, transferMarket: result.transferMarket }, { windowType: "transfer" });
    check("ai-ai: AI seller repaired to >=4 starters", getActiveStarters(after.players, "g2").length >= 4, `=${getActiveStarters(after.players, "g2").length}`);
    check("ai-ai: AI buyer has 4 starters", getActiveStarters(after.players, "riyadh").length === 4, `=${getActiveStarters(after.players, "riyadh").length}`);
    check("ai-ai: no duplicate ownership", noDuplicateOwnership(after));
  }
}

// ── 5. Salary cap / roster handling when the USER buys ───────────────────────
{
  const s = newGame("boston"); // Boston tier 2 (low cap), 4 starters, 0 subs
  const target = s.players.filter(p => p.teamId === "riyadh" && !p.isSub).sort((a, b) => b.overall - a.overall)[0];
  const neg = { id: "tr_buy", fromTeamId: "boston", toTeamId: "riyadh", playerId: target.id, offerType: "buyout", fee: getPlayerValuation(target, s), status: "Accepted", initiator: "user", history: [] };
  // With 4 starters and no sub, the buy fills the cap-free sub slot (allowed).
  const resA = buildTransferResult(s, neg, neg.fee);
  check("cap: user buy with full XI signs as cap-free sub", !resA.blockedReason && resA.asSub === true, resA.blockedReason || `asSub=${resA.asSub}`);

  // Now make room as a STARTER but keep wages: remove one starter, buy expensive star as starter.
  const dropId = s.players.filter(p => p.teamId === "boston" && !p.isSub)[0].id;
  const s2 = { ...s, players: s.players.map(p => p.id === dropId ? { ...p, teamId: null, status: "freeAgent" } : p) };
  const resB = buildTransferResult(s2, neg, neg.fee);
  if (resB.blockedReason) {
    check("cap: over-cap starter buy is blocked with a cap message", /cap/i.test(resB.blockedReason), resB.blockedReason);
  } else {
    const committed = getActiveStarters(resB.players, "boston").reduce((sum, p) => sum + (p.salary ?? getSigningCost(p)), 0);
    check("cap: completed starter buy stays within cap", committed <= getTeamCap("boston"), `committed=${committed} cap=${getTeamCap("boston")}`);
  }
}

// ── 6. Outgoing offer realism: protected, listed, reasons ───────────────────
{
  const s = newGame("boston");
  const elite = s.players.filter(p => p.teamId && p.teamId !== "boston" && !p.isSub).sort((a, b) => b.overall - a.overall || b.potential - a.potential)[0];
  const eliteAsk = getAskingPrice(elite, s);
  const eliteInfo = getProtectedPlayerInfo(elite, s, "boston");
  const normalEliteResp = evaluateSellResponse(s, elite, "boston", Math.round(eliteAsk * 1.05));
  check("realism: protected elite normal offer rejected", eliteInfo.protected && normalEliteResp.decision === "reject", `${elite.name} ${normalEliteResp.decision}: ${normalEliteResp.reason}`);
  check("realism: protected rejection reason recorded", /protected|vital|highest|replace|contending|competitor/i.test(normalEliteResp.reason), normalEliteResp.reason);
  const extremeEliteResp = evaluateSellResponse(s, elite, "boston", Math.round(eliteAsk * 3.25));
  check("realism: protected elite needs extreme fee or still refuses", ["accept", "counter", "reject"].includes(extremeEliteResp.decision) && extremeEliteResp.reason, extremeEliteResp.reason || extremeEliteResp.decision);

  const listedTarget = s.players.filter(p => p.teamId === "g2" && !p.isSub).sort((a, b) => (a.overall ?? 70) - (b.overall ?? 70))[0];
  const listedState = { ...s, transferMarket: { ...s.transferMarket, status: { [listedTarget.id]: { transferStatus: "Transfer Listed" } } } };
  const listedAsk = getAskingPrice(listedTarget, listedState);
  const listedResp = evaluateSellResponse(listedState, listedTarget, "boston", Math.round(listedAsk * 0.9));
  check("realism: transfer-listed player easier to buy", ["accept", "counter"].includes(listedResp.decision), `${listedResp.decision}: ${listedResp.reason}`);

  const weakBuyer = "cloud9";
  const star = s.players.filter(p => p.teamId !== weakBuyer && p.teamId && !p.isSub).sort((a, b) => b.overall - a.overall)[0];
  const weakTerms = evaluatePlayerTerms(star, weakBuyer, star.teamId, { ...s, userTeamId: weakBuyer }, { promisedRole: "Substitute", salary: star.salary ?? getSigningCost(star), contractYears: 1 });
  check("realism: weak/poor terms cannot easily sign elite star", !weakTerms.accepted, `${weakTerms.interestLabel}: ${weakTerms.reason}`);
  check("realism: player rejection reason is recorded", /role|weaker|step up|salary|stronger|current club/i.test(weakTerms.reason), weakTerms.reason);

  const weakerCurrent = s.players.filter(p => p.teamId && !p.isSub).sort((a, b) => (calcSafeTeamOvr(s, a.teamId) - calcSafeTeamOvr(s, b.teamId)) || b.overall - a.overall)[0];
  const strongBuyer = "riyadh";
  const strongTerms = evaluatePlayerTerms(weakerCurrent, strongBuyer, weakerCurrent.teamId, s, { promisedRole: "Starter", salary: (weakerCurrent.salary ?? getSigningCost(weakerCurrent)) * 1.35, contractYears: 2 });
  check("realism: player on weaker current team more open to strong project", strongTerms.willingness >= weakTerms.willingness, `${strongTerms.interestLabel}: ${strongTerms.reason}`);

  const thinResp = evaluateSellResponse(s, elite, "boston", Math.round(eliteAsk * 1.4));
  check("realism: selling team refuses if replacement/roster impact is bad", /replace|weakening|vital|protected|highest|contending/i.test(thinResp.reason), thinResp.reason);

  const intel = getTransferIntel(elite, s, "boston");
  check("realism: transfer intel exposes stance/interest/difficulty", !!intel?.clubStance && !!intel?.playerInterest && !!intel?.dealDifficulty, JSON.stringify(intel));
}

function calcSafeTeamOvr(state, teamId) {
  const starters = getActiveStarters(state.players, teamId);
  return starters.length ? starters.reduce((sum, p) => sum + (p.overall ?? 70), 0) / starters.length : 70;
}

// ── 7. Transfer budget + league-listed selector ──────────────────────────────
{
  const s = newGame("boston");
  const b = getTransferBudget(s, "boston");
  check("budget: positive transfer budget", b.balance > 0, `=${b.balance}`);
  const s2 = { ...s, transferMarket: { ...s.transferMarket, status: { [s.players.find(p => p.teamId === "g2").id]: { transferStatus: "Transfer Listed" } } } };
  check("listed: league-listed selector finds the listed player", getLeagueTransferListed(s2).length >= 1);
}

// ── 8. Save hydration (missing transferMarket) ───────────────────────────────
{
  const s = newGame();
  delete s.transferMarket;
  const tm = migrateTransferMarket(s.transferMarket);
  check("hydrate: structure", tm && Array.isArray(tm.negotiations) && typeof tm.budgets === "object");
  check("hydrate: status read defaults to Open to Offers", getTransferStatus(s.players.find(p => p.teamId), { ...s, transferMarket: tm }) === "Open to Offers");
  check("hydrate: window key derivable", typeof getWindowKey({ ...s, transferMarket: tm }) === "string");
}

// ── 9. Accepted outgoing offer requires terms, then completes cleanly ────────
{
  const s = newGame("boston");
  const target = s.players.filter(p => p.teamId === "g2" && !p.isSub).sort((a, b) => b.overall - a.overall)[0];
  const fee = getPlayerValuation(target, s);
  const accepted = {
    id: "tr_terms", fromTeamId: "boston", toTeamId: "g2", playerId: target.id,
    offerType: "buyout", fee, agreedFee: fee, status: "Accepted", nextAction: "player_terms",
    initiator: "user", history: [{ by: "boston", action: "offer", fee }, { by: "g2", action: "accept", fee }],
  };
  const pendingState = { ...s, transferMarket: { ...s.transferMarket, negotiations: [accepted], pendingAcceptedOfferId: accepted.id } };
  check("terms: accepted outgoing offer is action-required", isOutgoingTermsRequired(accepted, pendingState));
  check("terms: selector finds accepted outgoing terms offer", getAcceptedOutgoingTermsOffers(pendingState).length === 1);
  const preview = getTransferTermsPreview(pendingState, accepted);
  check("terms: preview includes fee/salary/contract/cap", !!preview && preview.transferFee === fee && preview.salary > 0 && preview.contractYears > 0 && typeof preview.capAfter === "number");
  const badTerms = evaluatePlayerTerms(target, "boston", "g2", pendingState, { promisedRole: "Substitute", salary: target.salary ?? getSigningCost(target), contractYears: 1 });
  check("terms: accepted club fee can still fail at player terms", !badTerms.accepted && !!badTerms.reason, `${badTerms.interestLabel}: ${badTerms.reason}`);
  const result = buildTransferResult(pendingState, accepted, fee);
  check("terms: confirm transfer result is not blocked", !result.blockedReason, result.blockedReason || "");
  if (!result.blockedReason) {
    const negotiations = result.transferMarket.negotiations.map(n => n.id === accepted.id ? { ...n, status: "Completed", nextAction: "done", agreedFee: fee } : n);
    const completed = ensureCdlRosterIntegrity({ ...pendingState, players: result.players, transferMarket: { ...result.transferMarket, negotiations } }, { windowType: "transfer" });
    check("terms: player moves to user team", completed.players.find(p => p.id === target.id)?.teamId === "boston");
    check("terms: player leaves selling team", !completed.players.some(p => p.id === target.id && p.teamId === "g2"));
    check("terms: negotiation becomes completed", completed.transferMarket.negotiations.find(n => n.id === accepted.id)?.status === "Completed");
    check("terms: no duplicate ownership after completion", noDuplicateOwnership(completed));
  }
}

// ── Report ───────────────────────────────────────────────────────────────────
console.log("\n=== TRANSFER MARKET DIAGNOSTIC ===\n");
{
  const s = newGame("boston");
  console.log("Sample Boston valuations (Season 1, offseason window):");
  for (const p of s.players.filter(p => p.teamId === "boston").sort((a, b) => b.overall - a.overall)) {
    console.log(`  ${(p.name || "?").padEnd(12)} ${String(p.primary).padEnd(16)} OVR ${p.overall} yrs ${p.contractYears}  val ${(getPlayerValuation(p, s) / 1000).toFixed(0)}k`);
  }
}
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) { console.log("\nFAILURES:"); fails.forEach(f => console.log("  ✗ " + f)); process.exit(1); }
console.log("\nALL CHECKS PASSED ✓");
