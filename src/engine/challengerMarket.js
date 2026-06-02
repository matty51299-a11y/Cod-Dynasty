// src/engine/challengerMarket.js
// CDL teams poaching the user's Challenger players — the core pressure of
// Challenger manager mode. CDL teams table buyout offers for the user's best
// developed players; the user can accept (for transfer income, but losing the
// player) or reject. Players are never moved without an explicit user decision.
//
// Pure helpers; the reducer owns state mutation. Reads existing data only —
// does not change match sim, ratings, contracts, brackets, points or the CDL
// transfer engine.

import { CDL_TEAMS } from "../data/teams.js";
import { getSigningCost } from "./rosterAI.js";
import { getChallengerRosterPlayers } from "../utils/userTeam.js";
import { isInactivePlayer } from "../utils/playerIdentity.js";

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < String(str).length; i++) { h ^= String(str).charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// Buyout windows mirror the CDL transfer windows — open while the rosters are
// not baked into a live event.
export function isChallengerMarketOpen(state) {
  const phase = state?.schedule?.phase;
  return phase === "stage" || phase === "preChamps" || phase === "offseason" || phase === "contracts";
}

export function getChallengerWindowKey(state) {
  const s = state?.schedule || {};
  return `${s.season ?? state?.season ?? 1}:${s.phase ?? "stage"}:${s.stageIdx ?? 0}`;
}

// A CDL team's interest in poaching a developing Challenger player.
function buyoutFee(player) {
  const base = getSigningCost(player);
  const pot = player.potential ?? player.overall ?? 70;
  const ageMod = (player.age ?? 24) <= 21 ? 1.35 : (player.age ?? 24) <= 24 ? 1.15 : 1.0;
  const potMod = 1 + Math.max(0, pot - (player.overall ?? 70)) * 0.03;
  return Math.round((base * 1.8 * ageMod * potMod) / 1000) * 1000;
}

function isPoachWorthy(player) {
  const ovr = player.overall ?? 0;
  const pot = player.potential ?? ovr;
  return ovr >= 70 || pot >= 82;
}

// Pick a deterministic CDL buyer that plausibly wants this player.
function pickBuyer(player, seed) {
  const candidates = CDL_TEAMS.filter(t => (t.budgetTier ?? 2) >= 3);
  const pool = candidates.length ? candidates : CDL_TEAMS;
  return pool[seed % pool.length];
}

// Generate fresh buyout offers for the user's Challenger players this window.
// Deterministic per (window, player); returns up to `maxOffers` offers that are
// not already live/cooling for that player.
export function generateChallengerBuyoutOffers(state, existingOffers = [], maxOffers = 2) {
  if (!isChallengerMarketOpen(state)) return [];
  const windowKey = getChallengerWindowKey(state);
  const roster = getChallengerRosterPlayers(state).filter(isPoachWorthy);
  const liveForPlayer = new Set(
    existingOffers.filter(o => o.status === "pending").map(o => o.playerId)
  );
  const offers = [];
  for (const player of roster) {
    if (liveForPlayer.has(player.id)) continue;
    const seed = hashString(`${windowKey}:${player.id}:challenger_buyout`);
    // ~40% of eligible players draw interest per window (best players more often).
    const chance = (player.potential ?? player.overall ?? 70) >= 86 ? 0.65 : 0.4;
    if ((seed % 1000) / 1000 > chance) continue;
    const buyer = pickBuyer(player, seed >>> 5);
    offers.push({
      id: `cbo_${windowKey}_${player.id}`,
      playerId: player.id,
      playerName: player.name,
      fromCdlTeamId: buyer.id,
      fee: buyoutFee(player),
      status: "pending",
      season: state.season,
      windowKey,
    });
    if (offers.length >= maxOffers) break;
  }
  return offers;
}

// Move a bought-out player to the CDL buyer. Returns patched arrays + the fee.
// The player joins the buyer (as a sub if the XI is already full) and is removed
// from the user's Challenger roster. The buyer is repaired by the caller via
// ensureCdlRosterIntegrity.
export function applyChallengerBuyout(state, offer) {
  const buyerId = offer.fromCdlTeamId;
  const pool = [...(state.players || []), ...(state.prospects || [])];
  const player = pool.find(p => p.id === offer.playerId);
  if (!player || isInactivePlayer(player)) return { blocked: "Player is no longer available." };

  const buyerStarters = (state.players || []).filter(p => p.teamId === buyerId && !p.isSub && !isInactivePlayer(p)).length;
  const asSub = buyerStarters >= 4;

  const signed = {
    ...player,
    teamId: buyerId,
    challengerTeamId: null,
    status: "cdl",
    circuit: "cdl",
    isSub: asSub,
    scouted: true,
    contractYears: Math.max(2, player.contractYears ?? 2),
    salary: player.salary ?? getSigningCost(player),
  };

  // The player may live in either players[] or prospects[]; normalize into players[].
  const players = [
    ...(state.players || []).filter(p => p.id !== offer.playerId),
    signed,
  ];
  const prospects = (state.prospects || []).filter(p => p.id !== offer.playerId);
  const challengerTeams = (state.challengerTeams || []).map(t =>
    t.id === state.userTeamId
      ? { ...t, playerIds: (t.playerIds || []).filter(id => id !== offer.playerId) }
      : t
  );

  return { players, prospects, challengerTeams, fee: offer.fee, buyerId, player: signed };
}

export function buildBuyoutTransaction(state, offer) {
  const buyer = CDL_TEAMS.find(t => t.id === offer.fromCdlTeamId);
  return {
    type: "CHALLENGER_BUYOUT",
    playerId: offer.playerId,
    playerName: offer.playerName,
    fromTeamId: state.userTeamId,
    toTeamId: offer.fromCdlTeamId,
    note: `${buyer?.name ?? offer.fromCdlTeamId} bought out ${offer.playerName} from your Challenger team for $${Math.round(offer.fee / 1000)}k.`,
  };
}
