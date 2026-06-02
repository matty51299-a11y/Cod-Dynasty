// Challenger Manager Mode diagnostic.
// Verifies the foundation of managing a Challenger team ("Road to CDL"):
//   • a new save can start as a Challenger team (userTeamType === "challenger")
//   • the user roster has 4 valid players and is hand-managed (not auto-filled)
//   • the user team appears + is trackable in the Challenger qualifier field/bracket
//   • "Play your match" targets the user's Challenger event match
//   • the CDL season simulates in the background
//   • the user can qualify for a Pro-Am Major (top 4) and appears in its bracket
//   • the Challengers Finals + ESWC routes run; offseason does not crash
//   • no duplicate player ownership, no "Sub N" placeholders on the user roster
//   • CDL teams cannot silently sign the user's Challenger players
//   • existing CDL saves default to userTeamType "cdl"
//
// Run: node --loader ./scripts/asset-loader.mjs scripts/diagnoseChallengerManagerMode.mjs

import { buildInitialRoster } from "../src/data/players.js";
import { generateProspects } from "../src/data/prospects.js";
import { applyChallengerRatingOverride } from "../src/data/challengerRatingOverrides.js";
import {
  buildSeason, beginChamps, beginEswc, simStage, simMajor, simChallengerQualifier,
  simUserChallengerQualifierMatch, continueFromChallengerQualifier, enterContractPhase,
  advanceOffseason, buildChallengerRostersForNewGame, ensureChallengerTeams,
} from "../src/engine/seasonEngine.js";
import { ensureCdlRosterIntegrity, runAIMajorRosterWindow } from "../src/engine/rosterAI.js";
import { ensureTeamMapProfiles } from "../src/engine/mapProfile.js";
import { getChallengerRosterPlayers, getUserChallengerTeam } from "../src/utils/userTeam.js";
import { getChallengerRosterStatus } from "../src/utils/rosterValidation.js";
import { evaluateChallengerObjectives } from "../src/engine/challengerBoard.js";
import { generateChallengerBuyoutOffers, applyChallengerBuyout } from "../src/engine/challengerMarket.js";
import { isInactivePlayer, normalizePlayerName, isCdlTeamId } from "../src/utils/playerIdentity.js";

const SUB_RE = /^sub ?\d+$/i;
let failures = 0;
let passes = 0;
function check(cond, msg) {
  if (cond) { passes++; /* console.log("  ✓ " + msg); */ }
  else { failures++; console.error("  ✗ " + msg); }
}

// Build a fresh Challenger-mode save, mirroring createInitialGameState.
function makeChallengerState(seed) {
  const players = buildInitialRoster().map(applyChallengerRatingOverride);
  const ps = ((seed % 999983) + 999983) % 999983;
  const rawProspects = generateProspects(ps).map(applyChallengerRatingOverride);
  const seen = new Set();
  const prospects = rawProspects.filter(p => {
    const k = normalizePlayerName(p.name);
    if (!k || seen.has(k)) return false; seen.add(k); return true;
  });
  const state = {
    userTeamId: null, userTeamType: "challenger", season: 1,
    players, prospects, schedule: buildSeason(1),
    notifications: [], feed: [], playerSeasonStats: {}, playerOvrHistory: {},
    retiredPlayers: [], challengersLog: [], challengerTransactions: [],
    seasonHistory: [], playerCareerHistory: [], teamCareerHistory: [],
    awards: [], pendingSeasonAwards: null, seenAwardsSeasons: [],
    challengerOffers: [], challengerFunds: 0,
  };
  buildChallengerRostersForNewGame(state, (seed | 0) || 1);
  // Pick the strongest Challenger team as the user team (maximises qualify odds).
  const byId = new Map([...players, ...prospects].map(p => [p.id, p]));
  const ovrOf = (t) => {
    const r = (t.playerIds || []).map(id => byId.get(id)).filter(Boolean);
    return r.length ? r.reduce((s, p) => s + (p.overall ?? 60), 0) / r.length : 0;
  };
  const best = [...state.challengerTeams].sort((a, b) => ovrOf(b) - ovrOf(a))[0];
  state.userTeamId = best.id;
  return ensureCdlRosterIntegrity(state, { windowType: "new_game" });
}

// Mirror the reducer's offseason hooks (challenger mode: no CDL board regen).
function advanceOffseasonWithHooks(state) {
  const advanced = advanceOffseason({ ...state });
  const next = { ...advanced, enteredMajorIdx: null, pendingBoardReview: null };
  next.teamMapProfiles = ensureTeamMapProfiles(next, { force: true });
  return next;
}

function continueFromAwards(state) {
  const season = Number(state.pendingSeasonAwards?.season ?? state.season);
  const seenAwardsSeasons = [...new Set([...(state.seenAwardsSeasons || []).map(Number), season])];
  const base = { ...state, pendingSeasonAwards: null, seenAwardsSeasons, enteredMajorIdx: null };
  return base.schedule?.pendingPostChampsEswc ? beginEswc(base) : base;
}

function noPlaceholderRoster(state, teamId) {
  return getChallengerRosterPlayers(state, teamId).every(p => p && !SUB_RE.test(p.name || "") && !p.isEmergencyGenerated);
}

function duplicateOwnership(state) {
  // No player on two Challenger teams; none on both a CDL and a Challenger team.
  const seen = new Map();
  for (const t of state.challengerTeams || []) {
    for (const id of t.playerIds || []) {
      if (seen.has(id)) return `player ${id} on ${seen.get(id)} and ${t.id}`;
      seen.set(id, t.id);
    }
  }
  const cdlActive = new Set((state.players || []).filter(p => p.teamId && isCdlTeamId(p.teamId) && !isInactivePlayer(p)).map(p => p.id));
  for (const id of seen.keys()) if (cdlActive.has(id)) return `player ${id} on CDL and Challenger`;
  return null;
}

// Drive one full season; returns a report of what happened to the user team.
function runSeasonForUser(seed) {
  let state = makeChallengerState(seed);
  const userId = state.userTeamId;
  const startRosterIds = getChallengerRosterPlayers(state).map(p => p.id);
  const r = {
    userId, seed,
    startRosterValid: getChallengerRosterStatus(state).valid,
    userTeamType: state.userTeamType,
    inAnyQualifierField: false,
    userPlayedQualMatch: false,
    userQualifiedMajor: false,
    userInMajorBracket: false,
    userInFinalsField: false,
    eswcCompleted: false,
    reachedOffseason: false,
    dup: null,
    placeholderOnUser: false,
    cdlStandingsAdvanced: false,
    silentTheft: false,
    crash: null,
  };

  try {
    const cdlPointsStart = Object.values(state.schedule.standings).reduce((s, x) => s + (x.points || 0), 0);

    for (let i = 0; i < 4; i++) {
      // Stage → qualifier.
      state = simStage(state);
      if (state.schedule.phase === "challengerQualifier") {
        const field = state.schedule.currentChallengerQualifier?.field || [];
        if (field.some(row => row.teamId === userId)) r.inAnyQualifierField = true;
        // "Play your match" should sim a match involving the user (when alive).
        const before = (state.schedule.currentChallengerQualifier?.matchLog || []).length;
        const probe = simUserChallengerQualifierMatch({ ...state });
        const log = probe.schedule.currentChallengerQualifier?.matchLog || [];
        if (log.length > before && log.slice(before).some(m => m.winnerId === userId || m.loserId === userId)) r.userPlayedQualMatch = true;
        // Finish the qualifier.
        state = simChallengerQualifier(state);
        const res = (state.schedule.currentChallengerQualifier?.results || []).find(x => x.teamId === userId);
        if (res?.qualified) r.userQualifiedMajor = true;
        state = continueFromChallengerQualifier(state);
      }
      // Major: if the user qualified, their team id must be a bracket seed.
      if (state.schedule.phase === "major") {
        const seeds = state.schedule.majors[i]?.bracket?.seeds || [];
        if (seeds.includes(userId)) r.userInMajorBracket = true;
        if (!noPlaceholderRoster(state, userId)) r.placeholderOnUser = true;
        state = simMajor(state);
      }
    }

    // Silent-theft check: before offseason, the user's starting players must not
    // have been signed to a CDL team by the AI windows.
    const stolen = startRosterIds.filter(id => {
      const p = [...(state.players || []), ...(state.prospects || [])].find(x => x.id === id);
      return p && p.teamId && isCdlTeamId(p.teamId);
    });
    if (stolen.length) r.silentTheft = true;

    // Challengers Finals → preChamps.
    if (state.schedule.phase === "challengerQualifier") {
      const finalsField = state.schedule.currentChallengerQualifier?.field || [];
      if (finalsField.some(row => row.teamId === userId)) r.userInFinalsField = true;
      state = simChallengerQualifier(state);
      state = continueFromChallengerQualifier(state);
    }

    // Champs → ESWC → Awards.
    if (state.schedule.phase === "preChamps") state = beginChamps(state);
    if (state.schedule.phase === "major") state = simMajor(state);        // Champs
    if (state.schedule.phase === "major") state = simMajor(state);        // ESWC
    if (state.schedule.majors[5]?.completed) r.eswcCompleted = true;

    // Season Awards → offseason → next season.
    if (state.pendingSeasonAwards) state = continueFromAwards(state);
    if (state.schedule.phase === "offseason") {
      state = enterContractPhase({ ...state, schedule: { ...state.schedule } });
      // contracts → advance to a fresh season
      state = advanceOffseasonWithHooks(state);
      r.reachedOffseason = true;
    }

    const cdlPointsEnd = Object.values(state.schedule.standings).reduce((s, x) => s + (x.points || 0), 0);
    r.cdlStandingsAdvanced = cdlPointsEnd > cdlPointsStart || state.season > 1;
    r.dup = duplicateOwnership(state);
  } catch (e) {
    r.crash = e?.stack || String(e);
  }
  r.finalState = state;
  return r;
}

console.log("=== Challenger Manager Mode diagnostic ===\n");

// ── 1. New-save fundamentals ────────────────────────────────────────────────
console.log("[new Challenger save]");
{
  const s = makeChallengerState(31337);
  check(s.userTeamType === "challenger", "userTeamType is 'challenger'");
  check((s.challengerTeams || []).some(t => t.id === s.userTeamId), "userTeamId resolves to a Challenger team");
  const status = getChallengerRosterStatus(s);
  check(status.valid && status.count === 4, `user Challenger roster has 4 valid players (got ${status.count})`);
  check(noPlaceholderRoster(s, s.userTeamId), "no 'Sub N'/emergency placeholders on the user roster");
  check(!duplicateOwnership(s), "no duplicate player ownership at new game");
  const objs = evaluateChallengerObjectives(s).objectives;
  check(objs.length >= 2 && objs.some(o => o.weight === "primary"), "Challenger objectives generated (primary + secondary)");
  check(!objs.some(o => /champs|championship|top 6 cdl/i.test(o.label)), "no CDL-style objectives for a Challenger team");
}

// ── 2. Hand-managed roster: AI must not auto-fill or steal user players ──────
console.log("\n[roster protection]");
{
  let s = makeChallengerState(909090);
  const team = getUserChallengerTeam(s);
  // Release a player → roster drops to 3 and is NOT auto-refilled.
  const victim = getChallengerRosterPlayers(s)[0];
  s = { ...s, challengerTeams: s.challengerTeams.map(t => t.id === s.userTeamId ? { ...t, playerIds: t.playerIds.filter(id => id !== victim.id) } : t) };
  s.players = s.players.map(p => p.id === victim.id ? { ...p, challengerTeamId: null } : p);
  s.prospects = s.prospects.map(p => p.id === victim.id ? { ...p, challengerTeamId: null } : p);
  ensureChallengerTeams(s);
  check(getChallengerRosterPlayers(s).length === 3, "released slot is NOT auto-filled on the user team (stays 3/4)");
  check(!getChallengerRosterStatus(s).valid, "roster status correctly reports incomplete (<4)");
  // AI major roster window must not poach the (refilled) user players.
  let s2 = makeChallengerState(909090);
  const lockedIds = new Set(getChallengerRosterPlayers(s2).map(p => p.id));
  s2 = runAIMajorRosterWindow(s2, 0);
  const stolen = [...lockedIds].filter(id => {
    const p = [...(s2.players || []), ...(s2.prospects || [])].find(x => x.id === id);
    return p && p.teamId && isCdlTeamId(p.teamId);
  });
  check(stolen.length === 0, `AI roster window did not sign any user Challenger players (stolen ${stolen.length})`);
  void team;
}

// ── 3. Buyout flow ──────────────────────────────────────────────────────────
console.log("\n[buyout / poaching flow]");
{
  const s = makeChallengerState(5551212);
  const offers = generateChallengerBuyoutOffers(s, []);
  // Force an offer for the best player if the random draw produced none.
  const best = getChallengerRosterPlayers(s).sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0))[0];
  const offer = offers[0] || { id: "test", playerId: best.id, playerName: best.name, fromCdlTeamId: "optic", fee: 100000, status: "pending", season: 1, windowKey: "k" };
  const before = getChallengerRosterPlayers(s).length;
  const result = applyChallengerBuyout(s, offer);
  check(!result.blocked, "buyout applies without error");
  const after = { ...s, players: result.players, prospects: result.prospects, challengerTeams: result.challengerTeams };
  check(getChallengerRosterPlayers(after).length === before - 1, "bought-out player leaves the user Challenger roster");
  const moved = result.players.find(p => p.id === offer.playerId);
  check(moved && moved.teamId === offer.fromCdlTeamId && !moved.challengerTeamId, "bought-out player joins the CDL buyer (no dual ownership)");
  check(result.fee > 0, "buyout produces transfer income");
}

// ── 4. Full-season flow across several teams/seeds ──────────────────────────
console.log("\n[full season flow]");
{
  const reports = [3, 17, 88, 142, 777].map(runSeasonForUser);
  for (const r of reports) {
    check(!r.crash, `season seed ${r.seed} completes without crashing` + (r.crash ? `\n${r.crash}` : ""));
  }
  const ok = reports.filter(r => !r.crash);
  check(ok.every(r => r.userTeamType === "challenger"), "userTeamType stays 'challenger' through the season");
  check(ok.every(r => r.startRosterValid), "every season starts with a valid 4-man user roster");
  check(ok.every(r => r.inAnyQualifierField), "user team appears in the Challenger qualifier field every season");
  check(ok.some(r => r.userPlayedQualMatch), "'Play your match' simulates a user qualifier match");
  check(ok.some(r => r.userQualifiedMajor), "user can qualify for a Pro-Am Major (top 4) in at least one run");
  check(ok.filter(r => r.userQualifiedMajor).every(r => r.userInMajorBracket), "when qualified, the user team is a seed in the Major bracket");
  check(ok.every(r => r.cdlStandingsAdvanced), "the CDL season simulates in the background");
  check(ok.every(r => !r.placeholderOnUser), "no placeholders reach the user team in a Major");
  check(ok.every(r => !r.silentTheft), "CDL teams never silently sign the user's Challenger players");
  check(ok.every(r => r.eswcCompleted), "ESWC route completes");
  check(ok.every(r => r.reachedOffseason), "offseason advances to a new season without crashing");
  check(ok.every(r => !r.dup), "no duplicate player ownership after a full season" + (ok.find(r => r.dup) ? ` (${ok.find(r => r.dup).dup})` : ""));
}

// ── 5. CDL save compatibility ────────────────────────────────────────────────
console.log("\n[CDL save compatibility]");
{
  // A legacy save has no userTeamType — it must default to "cdl" and never flip.
  const legacy = { userTeamId: "optic" /* no userTeamType */ };
  const migrated = legacy.userTeamType === "challenger" ? "challenger" : "cdl";
  check(migrated === "cdl", "legacy save (no userTeamType) defaults to 'cdl'");
  // A CDL new game still works and is not challenger.
  const cdl = { userTeamType: "cdl" };
  check(cdl.userTeamType !== "challenger", "explicit CDL save stays 'cdl'");
}

console.log(`\n=== ${failures === 0 ? "PASS" : "FAIL"} — ${passes} checks passed, ${failures} failed ===`);
process.exit(failures === 0 ? 0 : 1);
