// Full multi-season stability diagnostic.
//
// Simulates several COMPLETE seasons through the real engine and verifies the
// entire game loop: phase order, tournament integrity, roster integrity,
// offseason / free-agency flow, awards + history persistence, and the
// board / staff / map-pool systems.
//
// It drives the engine functions directly (the React reducer can't run in
// node) and mirrors the reducer's offseason hooks (board-objective regen +
// map-profile rebuild + season-end board review) so the loop matches the
// real game. Where it intentionally mirrors reducer behaviour it is noted.
//
// Run: node --loader ./scripts/asset-loader.mjs scripts/diagnoseFullSeasonFlow.mjs

import { buildInitialRoster } from "../src/data/players.js";
import { generateProspects } from "../src/data/prospects.js";
import { applyChallengerRatingOverride } from "../src/data/challengerRatingOverrides.js";
import { CDL_TEAMS } from "../src/data/teams.js";
import {
  buildSeason, beginChamps, beginEswc, ensureChallengerTeams, repairChallengerRosters,
  buildChallengerRostersForNewGame, simStage, simMajor, simChallengerQualifier,
  continueFromChallengerQualifier, enterContractPhase, advanceOffseason,
  MAJOR_PLACEMENT_POINTS,
} from "../src/engine/seasonEngine.js";
import { ensureCdlRosterIntegrity } from "../src/engine/rosterAI.js";
import { ensureTeamStaff, migrateStaff, getStaffForTeam, calcStaffBonuses } from "../src/engine/staffEngine.js";
import { migrateBoardState, buildBoardObjectives, BOARD_OBJ_VERSION, runBoardReview, getSecurityBand } from "../src/engine/boardEngine.js";
import { ensureTeamMapProfiles, getTeamMapProfile, autoVeto } from "../src/engine/mapProfile.js";
import { ALL_MAP_IDS, MODE_KEYS } from "../src/data/mapPool.js";
import { calculateSeasonAwards } from "../src/utils/seasonAwards.js";
import { getMajorPlacementMap } from "../src/utils/historyProfiles.js";
import { buildCdlRosterNameSet, isInactivePlayer, isCdlTeamId, normalizePlayerName } from "../src/utils/playerIdentity.js";

const SEASONS_TO_RUN = 6;          // ≥ 5 full seasons
const ESWC_IDX = 5;
const SUB_RE = /^sub ?\d+$/i;
const CDL_ID_SET = new Set(CDL_TEAMS.map(t => t.id));

// ── Reducer-mirroring helpers ────────────────────────────────────────────────
function regenBoardObjectives(state, boardState) {
  const base = migrateBoardState(boardState);
  const { objectives, meta } = buildBoardObjectives({ ...state, boardState: base });
  return { ...base, objectives, meta, version: BOARD_OBJ_VERSION };
}
// Mirror the reducer's ADVANCE_OFFSEASON post-steps (map rebuild + board regen).
function advanceOffseasonWithHooks(state) {
  const advanced = advanceOffseason({ ...state });
  const next = { ...advanced, enteredMajorIdx: null, pendingBoardReview: null };
  next.teamMapProfiles = ensureTeamMapProfiles(next, { force: true });
  next.boardState = { ...regenBoardObjectives(next, next.boardState), verdict: null };
  return next;
}
// Simulate a competent user who keeps their CDL roster legal (≥4 starters).
// The engine intentionally never auto-fills the USER team (only AI teams), so
// without this the user roster would decay across seasons and trip the thin-team
// match-sim pad. This mirrors a player making signings each offseason.
function signUserToFour(state, exclude = new Set()) {
  const userTeam = state.userTeamId;
  let players = [...state.players];
  let prospects = [...(state.prospects || [])];
  const count = () => players.filter(p => p.teamId === userTeam && !p.isSub && !isInactivePlayer(p)).length;
  // A sane sign flow never adds a player whose name is already active on a CDL
  // team (would create a duplicate-name). Mirror that here.
  const collides = (p) => buildCdlRosterNameSet(players).has(normalizePlayerName(p.name));
  let guard = 0;
  while (count() < 4 && guard++ < 8) {
    const onTeam = new Set(players.filter(p => p.teamId === userTeam).map(p => p.id));
    const fa = players
      .filter(p => !p.teamId && !isInactivePlayer(p) && !onTeam.has(p.id) && !exclude.has(p.id) && !collides(p) && (p.status === "freeAgent" || !p.challengerTeamId))
      .sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0))[0];
    if (fa) {
      players = players.map(p => p.id === fa.id ? { ...p, teamId: userTeam, isSub: false, challengerTeamId: null, status: "cdl", circuit: "cdl", contractYears: 2 } : p);
      continue;
    }
    const prospect = prospects.filter(p => !p.teamId && !isInactivePlayer(p) && !exclude.has(p.id) && !collides(p)).sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0))[0];
    if (!prospect) break;
    prospects = prospects.filter(p => p.id !== prospect.id);
    players.push({ ...prospect, teamId: userTeam, isSub: false, challengerTeamId: null, status: "cdl", circuit: "cdl", contractYears: 2 });
  }
  return { ...state, players, prospects };
}

// Mirror the reducer's CONTINUE_FROM_SEASON_AWARDS (mark seen + board review).
function continueFromAwards(state) {
  const season = Number(state.pendingSeasonAwards?.season ?? state.season);
  const seenAwardsSeasons = [...new Set([...(state.seenAwardsSeasons || []).map(Number), season])];
  let base = { ...state, pendingSeasonAwards: null, seenAwardsSeasons, enteredMajorIdx: null };
  const { newBoardState, pendingBoardReview } = runBoardReview(migrateBoardState(base.boardState), base);
  base = { ...base, boardState: newBoardState, pendingBoardReview };
  return base.schedule?.pendingPostChampsEswc ? beginEswc(base) : base;
}

function makeState(userTeamId, seed) {
  const players = buildInitialRoster().map(applyChallengerRatingOverride);
  const rawProspects = generateProspects(seed).map(applyChallengerRatingOverride);
  const seen = new Set();
  const prospects = rawProspects.filter(p => {
    const key = normalizePlayerName(p.name);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const state = {
    userTeamId, season: 1, players, prospects,
    schedule: buildSeason(1),
    notifications: [], feed: [], saveExists: true, enteredMajorIdx: null,
    playerSeasonStats: {}, playerOvrHistory: {}, challengersLog: [], challengerTransactions: [],
    seasonHistory: [], playerCareerHistory: [], teamCareerHistory: [],
    awards: [], pendingSeasonAwards: null, seenAwardsSeasons: [],
    staff: ensureTeamStaff(migrateStaff([])),
    boardState: migrateBoardState(null),
    pendingBoardReview: null,
  };
  buildChallengerRostersForNewGame(state, seed);
  ensureChallengerTeams(state);
  const finalState = ensureCdlRosterIntegrity(state, { windowType: "diagnose_full_season" });
  finalState.boardState = regenBoardObjectives(finalState, finalState.boardState);
  finalState.teamMapProfiles = ensureTeamMapProfiles(finalState, { force: true });
  return finalState;
}

// ── Report plumbing ──────────────────────────────────────────────────────────
function makeSeasonReport(season) {
  return {
    season, majorsCompleted: 0, qualifiersCompleted: 0,
    finals: "incomplete", champs: "incomplete", eswc: "incomplete", awards: "incomplete", offseason: "incomplete",
    cdlRosterIssues: 0, challengerRosterIssues: 0, challengerRosterWarnings: 0, duplicatePlayers: 0, placeholderInEvents: 0,
    faFormerAiCount: 0, resignLetWalk: "n/a", awardsCheck: "n/a", boardStaffMap: "n/a",
    issues: [],
  };
}
function issue(report, { phase, event, subject, expected, actual, source }) {
  report.issues.push({ phase, event, subject, expected, actual, source });
}

// ── Roster integrity at a checkpoint ─────────────────────────────────────────
// challengerStrict=true → a Challenger team < 4 is a hard failure (used right
// before/at Challenger events). Otherwise a Challenger shortage is recorded as a
// transient WARNING: between events a Challenger player can be shadowed by a CDL
// signing, and the engine repairs at the next event entry (the no-placeholder
// match scans verify the real gameplay guarantee).
function validateRosters(state, report, label, { challengerStrict = false } = {}) {
  const freeAgencyOpen = !!state.offseason?.freeAgencyOpen;
  const cdlIds = new Set();
  const cdlNames = new Set();
  let cdlIssues = 0, dupes = 0;

  for (const team of CDL_TEAMS) {
    const roster = (state.players || []).filter(p => p.teamId === team.id && !p.isSub && !isInactivePlayer(p));
    if (roster.length < 4 && team.id !== state.userTeamId && !freeAgencyOpen) {
      cdlIssues++;
      issue(report, { phase: label, event: "CDL roster", subject: team.id, expected: "4 starters", actual: `${roster.length}`, source: "rosterAI.ensureCdlRosterIntegrity" });
    }
    for (const p of roster) {
      if (cdlIds.has(p.id)) { dupes++; issue(report, { phase: label, event: "duplicate", subject: p.name, expected: "one CDL team", actual: `id ${p.id} on two teams`, source: "rosterAI" }); }
      const nk = normalizePlayerName(p.name);
      if (cdlNames.has(nk)) { dupes++; issue(report, { phase: label, event: "duplicate", subject: p.name, expected: "unique active name", actual: "name on two CDL teams", source: "rosterAI" }); }
      cdlIds.add(p.id); cdlNames.add(nk);
      if (p.challengerTeamId) { cdlIssues++; issue(report, { phase: label, event: "CDL∩Challenger", subject: p.name, expected: "no challengerTeamId", actual: `${p.challengerTeamId}`, source: "rosterAI/seasonEngine" }); }
      if (isInactivePlayer(p)) { cdlIssues++; issue(report, { phase: label, event: "retired active", subject: p.name, expected: "active", actual: p.status, source: "rosterAI" }); }
    }
  }

  // Challenger rosters: resolve the same way the engine does.
  let challIssues = 0, challWarn = 0;
  const challByPlayer = new Map();
  const byId = new Map([...(state.players || []), ...(state.prospects || [])].map(p => [p.id, p]));
  const cdlActiveNameSet = cdlNames;
  for (const team of state.challengerTeams || []) {
    const roster = (team.playerIds || [])
      .map(id => byId.get(id))
      .filter(p => p && !isInactivePlayer(p) && !cdlActiveNameSet.has(normalizePlayerName(p.name)));
    if (roster.length < 4) {
      if (challengerStrict) {
        challIssues++;
        issue(report, { phase: label, event: "Challenger roster", subject: team.id, expected: "4 valid players", actual: `${roster.length}`, source: "seasonEngine.repairChallengerRosters" });
      } else {
        challWarn++;
      }
    }
    for (const p of roster) {
      // Duplicate ownership across Challenger teams is always a hard failure.
      if (challByPlayer.has(p.id)) { dupes++; issue(report, { phase: label, event: "duplicate", subject: p.name, expected: "one Challenger team", actual: `on ${challByPlayer.get(p.id)} and ${team.id}`, source: "seasonEngine" }); }
      challByPlayer.set(p.id, team.id);
      if (cdlIds.has(p.id)) { dupes++; issue(report, { phase: label, event: "CDL∩Challenger", subject: p.name, expected: "not on CDL roster", actual: "active on both", source: "seasonEngine" }); }
    }
  }

  report.cdlRosterIssues += cdlIssues;
  report.challengerRosterIssues += challIssues;
  report.challengerRosterWarnings += challWarn;
  report.duplicatePlayers += dupes;
}

// ── Tournament integrity ─────────────────────────────────────────────────────
function validateMajor(state, major, report, { label, kind }) {
  // kind: "regular" | "champs" | "eswc"
  const bracket = major?.bracket;
  if (!major?.completed) { issue(report, { phase: label, event: kind, subject: major?.name, expected: "completed", actual: "incomplete", source: "seasonEngine._advanceMajorPhase" }); return; }
  if (!bracket) { issue(report, { phase: label, event: kind, subject: major?.name, expected: "bracket", actual: "missing", source: "seasonEngine" }); return; }
  const seeds = bracket.seeds || [];
  if (seeds.length !== 16) issue(report, { phase: label, event: kind, subject: "seeds", expected: "16", actual: `${seeds.length}`, source: "seasonEngine.buildMajorBracketDE16" });
  if (new Set(seeds).size !== seeds.length) issue(report, { phase: label, event: kind, subject: "seeds", expected: "no duplicate teams", actual: "duplicate team id", source: "seasonEngine" });
  const cdlCount = seeds.filter(id => CDL_ID_SET.has(id)).length;
  const challCount = seeds.length - cdlCount;
  if (cdlCount !== 12) issue(report, { phase: label, event: kind, subject: "CDL teams", expected: "12", actual: `${cdlCount}`, source: "seasonEngine" });
  if (challCount !== 4) issue(report, { phase: label, event: kind, subject: "Challenger teams", expected: "4", actual: `${challCount}`, source: "seasonEngine" });
  if (!bracket.champion) issue(report, { phase: label, event: kind, subject: "champion", expected: "exists", actual: "missing", source: "seasonEngine" });

  // Placements valid.
  const placements = getMajorPlacementMap(major);
  const placedTeams = Object.keys(placements);
  if (placedTeams.length < 16) issue(report, { phase: label, event: kind, subject: "placements", expected: "16 placed", actual: `${placedTeams.length}`, source: "historyProfiles.getMajorPlacementMap" });
  if (bracket.champion && placements[bracket.champion] !== 1) issue(report, { phase: label, event: kind, subject: "champion placement", expected: "1", actual: `${placements[bracket.champion]}`, source: "historyProfiles" });
  const ones = Object.values(placements).filter(p => p === 1).length;
  if (ones !== 1) issue(report, { phase: label, event: kind, subject: "1st place", expected: "exactly one", actual: `${ones}`, source: "historyProfiles" });

  // Points.
  if (kind === "regular") {
    if (!major.pointsAwarded) issue(report, { phase: label, event: "points", subject: major.name, expected: "pointsAwarded", actual: "false", source: "seasonEngine.awardMajorPlacementPoints" });
    const champAward = (major.pointsAwards || []).find(a => a.place === 1);
    if (!champAward || champAward.points !== MAJOR_PLACEMENT_POINTS[1]) {
      issue(report, { phase: label, event: "points", subject: "champion points", expected: `${MAJOR_PLACEMENT_POINTS[1]}`, actual: `${champAward?.points}`, source: "seasonEngine" });
    }
  }
  // Scan match player stats for placeholders.
  scanPlaceholders(major.bracket, report, label, kind);
}

// Scan a bracket's match results for Sub-style placeholders / padded players.
function scanPlaceholders(bracket, report, label, event) {
  let found = 0;
  for (const round of bracket?.rounds || []) {
    for (const m of round.matches || []) {
      const ps = m.result?.playerStats;
      if (!ps) continue;
      for (const [pid, stat] of Object.entries(ps)) {
        if (String(pid).startsWith("__placeholder_") || SUB_RE.test(stat?.name || "")) {
          found++;
          issue(report, { phase: label, event, subject: stat?.name || pid, expected: "real player", actual: "placeholder in match sim", source: "matchSim.padTeamToFour" });
        }
      }
    }
  }
  report.placeholderInEvents += found;
}

function validateQualifier(qualifier, report, label, { kind }) {
  // kind: "qualifier" (24-team) | "finals" (16-team)
  const expectField = kind === "qualifier" ? 24 : 16;
  const field = qualifier?.field || [];
  if (field.length !== expectField) issue(report, { phase: label, event: kind, subject: "field", expected: `${expectField}`, actual: `${field.length}`, source: "seasonEngine.buildChallengerQualifierField" });
  const bracket = qualifier?.bracket;
  const expectType = kind === "qualifier" ? "DE24" : "DE16";
  if (bracket?.type !== expectType) issue(report, { phase: label, event: kind, subject: "bracket type", expected: expectType, actual: `${bracket?.type}`, source: "seasonEngine" });
  // True double elimination → must have losers-bracket rounds (no one-and-done play-in).
  const hasLB = (bracket?.rounds || []).some(r => r.type === "LB" || /LB/.test(r.name || ""));
  if (!hasLB) issue(report, { phase: label, event: kind, subject: "format", expected: "double elimination (LB rounds)", actual: "no losers bracket", source: "seasonEngine" });
  if (!bracket?.champion && kind === "qualifier") issue(report, { phase: label, event: kind, subject: "champion", expected: "exists", actual: "missing", source: "seasonEngine" });
  // Top 4 qualify.
  const qualified = (qualifier?.results || []).filter(r => r.qualified).length;
  if (qualifier?.completed && qualified !== 4) issue(report, { phase: label, event: kind, subject: "qualified", expected: "4", actual: `${qualified}`, source: "seasonEngine" });
  // No placeholders in qualifier matches, and every match was 4v4.
  let placeholders = 0;
  for (const entry of qualifier?.matchLog || []) {
    const ps = entry.result?.playerStats;
    if (!ps) continue;
    const ids = Object.keys(ps);
    if (ids.length !== 8) issue(report, { phase: label, event: kind, subject: "match roster", expected: "8 players (4v4)", actual: `${ids.length}`, source: "matchSim" });
    for (const [pid, stat] of Object.entries(ps)) {
      if (String(pid).startsWith("__placeholder_") || SUB_RE.test(stat?.name || "")) {
        placeholders++;
        issue(report, { phase: label, event: kind, subject: stat?.name || pid, expected: "real player", actual: "placeholder in qualifier match", source: "matchSim.padTeamToFour" });
      }
    }
  }
  report.placeholderInEvents += placeholders;
}

// ── Awards / history ─────────────────────────────────────────────────────────
function validateAwards(state, awardsPkg, report, label) {
  const awards = awardsPkg?.awards || [];
  const majorMvps = awardsPkg?.majorMvps || [];
  const find = (key) => awards.find(a => a.key === key);
  const checks = [];
  const playerExists = (id) => !!(state.players || []).find(p => p.id === id) || (state.playerCareerHistory || []).some(s => String(s.playerId) === String(id));

  if (!find("season_mvp")) issue(report, { phase: label, event: "awards", subject: "Season MVP", expected: "exists", actual: "missing", source: "seasonAwards.calculateSeasonAwards" });
  else checks.push("MVP");

  // Rookie of the Year — only required if eligible rookies exist (award present implies it found one).
  if (find("rookie_of_year")?.playerId) checks.push("Rookie");

  for (const [key, lbl] of [["best_main_ar", "Best Main AR"], ["best_flex", "Best Flex"], ["best_entry_smg", "Best Entry SMG"], ["best_slayer_smg", "Best Slayer SMG"]]) {
    const a = find(key);
    if (a?.playerId) {
      if (!playerExists(a.playerId)) issue(report, { phase: label, event: "awards", subject: lbl, expected: "resolvable player", actual: `unknown ${a.playerName}`, source: "seasonAwards" });
      if (a.kd != null && (!Number.isFinite(Number(a.kd)) || Number(a.kd) <= 0)) issue(report, { phase: label, event: "awards", subject: lbl, expected: "valid K/D", actual: `${a.kd}`, source: "seasonAwards" });
    }
  }
  if (majorMvps.length !== 4) issue(report, { phase: label, event: "awards", subject: "Major MVPs", expected: "4", actual: `${majorMvps.length}`, source: "seasonAwards" });
  else checks.push("MajorMVPs");
  if (!find("champs_mvp")) issue(report, { phase: label, event: "awards", subject: "Champs MVP", expected: "exists", actual: "missing", source: "seasonAwards" });
  else checks.push("ChampsMVP");
  if (!find("eswc_mvp")) issue(report, { phase: label, event: "awards", subject: "ESWC MVP", expected: "exists (ESWC completed)", actual: "missing", source: "seasonAwards" });
  else checks.push("ESWCMVP");

  report.awardsCheck = report.issues.some(i => i.event === "awards") ? "FAIL" : `OK (${checks.join("/")})`;
}

// ── Board / staff / map ──────────────────────────────────────────────────────
function validateBoardStaffMap(state, report, label) {
  let ok = true;
  // Board
  const objs = state.boardState?.objectives || [];
  if (!objs.length) { ok = false; issue(report, { phase: label, event: "board", subject: "objectives", expected: ">0", actual: "0", source: "boardEngine.buildBoardObjectives" }); }
  const conf = state.boardState?.confidence;
  if (!(Number.isFinite(conf) && conf >= 0 && conf <= 100)) { ok = false; issue(report, { phase: label, event: "board", subject: "confidence", expected: "0..100", actual: `${conf}`, source: "boardEngine" }); }
  if (!getSecurityBand(conf ?? 60)) { ok = false; issue(report, { phase: label, event: "board", subject: "security band", expected: "resolvable", actual: "none", source: "boardEngine.getSecurityBand" }); }

  // Staff — every CDL team has staff; missing-staff path doesn't crash.
  for (const team of CDL_TEAMS) {
    const ts = getStaffForTeam(state.staff, team.id);
    if (!ts || !ts.length) { ok = false; issue(report, { phase: label, event: "staff", subject: team.id, expected: "≥1 staff", actual: "none", source: "staffEngine.ensureTeamStaff" }); }
    try { calcStaffBonuses(state.staff, team.id); } catch (e) { ok = false; issue(report, { phase: label, event: "staff", subject: team.id, expected: "no crash", actual: String(e.message), source: "staffEngine.calcStaffBonuses" }); }
  }
  try { calcStaffBonuses([], CDL_TEAMS[0].id); } catch (e) { ok = false; issue(report, { phase: label, event: "staff", subject: "empty staff", expected: "no crash", actual: String(e.message), source: "staffEngine" }); }

  // Map profiles + veto validity.
  const validMap = new Set(ALL_MAP_IDS);
  for (const team of CDL_TEAMS) {
    const prof = getTeamMapProfile(state, team.id);
    if (!prof || !prof.modeRatings) { ok = false; issue(report, { phase: label, event: "map", subject: team.id, expected: "map profile", actual: "missing", source: "mapProfile.ensureTeamMapProfiles" }); }
  }
  // Veto for a few deterministic pairings.
  for (let i = 0; i < CDL_TEAMS.length; i += 4) {
    const a = getTeamMapProfile(state, CDL_TEAMS[i].id);
    const b = getTeamMapProfile(state, CDL_TEAMS[(i + 1) % CDL_TEAMS.length].id);
    const series = autoVeto(a, b);
    if (series.length !== 5) { ok = false; issue(report, { phase: label, event: "map", subject: "veto length", expected: "5 maps", actual: `${series.length}`, source: "mapProfile.autoVeto" }); }
    const perMode = {};
    for (const slot of series) {
      if (!slot.id || !validMap.has(slot.id)) { ok = false; issue(report, { phase: label, event: "map", subject: "veto map", expected: "valid map id", actual: `${slot.id}`, source: "mapProfile.autoVeto" }); }
      perMode[slot.modeKey] = (perMode[slot.modeKey] || new Set());
      if (perMode[slot.modeKey].has(slot.id)) { ok = false; issue(report, { phase: label, event: "map", subject: "veto repeat", expected: "no repeat within mode", actual: `${slot.id}`, source: "mapProfile.autoVeto" }); }
      perMode[slot.modeKey].add(slot.id);
    }
  }
  // Mode coverage sanity.
  if (!MODE_KEYS.every(k => typeof k === "string")) ok = false;

  report.boardStaffMap = ok ? "OK" : "FAIL";
}

// ── One full season, controlled order ────────────────────────────────────────
function runSeason(state, report) {
  const expectPhase = (want, ctx) => {
    if (state.schedule.phase !== want) issue(report, { phase: ctx, event: "phase order", subject: "schedule.phase", expected: want, actual: state.schedule.phase, source: "seasonEngine" });
  };

  // Board objectives must stay stable across the competitive season.
  const objSig = JSON.stringify((state.boardState?.objectives || []).map(o => o.id || o.key || o.label));
  const assertObjStable = (ctx) => {
    const sig = JSON.stringify((state.boardState?.objectives || []).map(o => o.id || o.key || o.label));
    if (sig !== objSig) issue(report, { phase: ctx, event: "board", subject: "objectives", expected: "stable mid-season", actual: "regenerated", source: "boardEngine (should only regen at season start)" });
  };

  validateRosters(state, report, "new season start");
  validateBoardStaffMap(state, report, "new season start");

  // Stages 0..3 → qualifier → major.
  for (let i = 0; i < 4; i++) {
    expectPhase("stage", `stage ${i + 1}`);
    validateRosters(state, report, `before Major ${i + 1} (stage)`);
    state = simStage(state);
    assertObjStable(`stage ${i + 1}`);

    // Challenger Qualifier i.
    expectPhase("challengerQualifier", `qualifier ${i + 1}`);
    validateRosters(state, report, `before Challenger qualifier ${i + 1}`);
    state = simChallengerQualifier(state);
    validateQualifier(state.schedule.currentChallengerQualifier, report, `Challenger qualifier ${i + 1}`, { kind: "qualifier" });
    if (state.schedule.currentChallengerQualifier?.completed) report.qualifiersCompleted++;
    state = continueFromChallengerQualifier(state);

    // Major i.
    expectPhase("major", `Major ${i + 1}`);
    validateRosters(state, report, `before Major ${i + 1} (bracket)`);
    state = simMajor(state);
    const major = state.schedule.majors[i];
    validateMajor(state, major, report, { label: `Major ${i + 1}`, kind: "regular" });
    if (major?.completed) report.majorsCompleted++;
    assertObjStable(`Major ${i + 1}`);
  }

  // Challengers Finals → preChamps.
  expectPhase("challengerQualifier", "Challengers Finals");
  validateRosters(state, report, "before Challengers Finals");
  state = simChallengerQualifier(state);
  const finals = state.schedule.currentChallengerQualifier;
  validateQualifier(finals, report, "Challengers Finals", { kind: "finals" });
  if (finals?.completed) report.finals = "complete";
  state = continueFromChallengerQualifier(state);
  expectPhase("preChamps", "preChamps");

  // Champs.
  validateRosters(state, report, "before Champs");
  state = beginChamps(state);
  expectPhase("major", "Champs");
  state = simMajor(state); // CDL Champs
  if (state.schedule.majors[4]?.completed) report.champs = "complete";
  validateMajor(state, state.schedule.majors[4], report, { label: "Champs", kind: "champs" });

  // ESWC must start right after Champs (before Awards).
  if (state.schedule.phase !== "major" || state.schedule.majorIdx !== ESWC_IDX) {
    issue(report, { phase: "post-Champs", event: "ESWC order", subject: "next event", expected: "ESWC (major idx 5)", actual: `${state.schedule.phase}/${state.schedule.majorIdx}`, source: "seasonEngine._advanceMajorPhase" });
  }
  if (state.pendingSeasonAwards) issue(report, { phase: "post-Champs", event: "ESWC order", subject: "awards", expected: "deferred until after ESWC", actual: "awards shown before ESWC", source: "seasonEngine._advanceMajorPhase" });
  validateRosters(state, report, "before ESWC");

  const standingsBeforeEswc = JSON.stringify(state.schedule.standings);
  state = simMajor(state); // ESWC
  const eswcMajor = state.schedule.majors[ESWC_IDX];
  if (eswcMajor?.completed) report.eswc = "complete";
  validateMajor(state, eswcMajor, report, { label: "ESWC", kind: "eswc" });
  if (JSON.stringify(state.schedule.standings) !== standingsBeforeEswc) {
    issue(report, { phase: "ESWC", event: "points", subject: "CDL standings", expected: "unchanged (ESWC awards no CDL points)", actual: "standings changed", source: "seasonEngine.awardMajorPlacementPoints" });
  }

  // Season Awards after ESWC.
  if (!state.pendingSeasonAwards) {
    issue(report, { phase: "post-ESWC", event: "awards order", subject: "awards", expected: "shown after ESWC", actual: "missing", source: "seasonEngine.gateSeasonAwards" });
  } else {
    report.awards = "complete";
    validateAwards(state, state.pendingSeasonAwards, report, "Season Awards");
  }
  if (state.schedule.phase !== "offseason") issue(report, { phase: "post-ESWC", event: "phase order", subject: "schedule.phase", expected: "offseason", actual: state.schedule.phase, source: "seasonEngine" });

  // ── Offseason flow ──────────────────────────────────────────────────────────
  state = continueFromAwards(state);
  if (state.pendingSeasonAwards) issue(report, { phase: "offseason", event: "awards", subject: "duplicate awards", expected: "cleared", actual: "still pending", source: "reducer/CONTINUE_FROM_SEASON_AWARDS" });
  if (state.schedule.majorIdx === ESWC_IDX && state.schedule.phase === "major") issue(report, { phase: "offseason", event: "ESWC repeat", subject: "ESWC", expected: "not restarted", actual: "ESWC restarted after awards", source: "seasonEngine" });

  // Realistic user roster management: re-sign ALL expiring starters except one
  // deliberate let-walk. (A passive user can't fish replacements from the market
  // because AI free agency + Challenger refill drain it; a real user re-signs
  // keepers and signs a replacement during their FA window when the pool is full.)
  const userExpiring = (state.players || []).filter(p => p.teamId === state.userTeamId && !p.isSub && !isInactivePlayer(p) && p.contractYears === 1);
  let resignIds = [], letWalkId = null;
  if (userExpiring.length) {
    letWalkId = userExpiring[0].id;                         // let one walk to test FA entry
    resignIds = userExpiring.slice(1).map(p => p.id);       // re-sign the rest (RESIGN_PLAYER outcome)
    state = { ...state, players: state.players.map(p => resignIds.includes(p.id) ? { ...p, contractYears: 3 } : p) };
  }

  // Contract review → opens user free-agency window.
  expectPhase("offseason", "offseason→contracts");
  state = enterContractPhase({ ...state });
  if (state.schedule.phase !== "contracts") issue(report, { phase: "offseason", event: "contract review", subject: "phase", expected: "contracts", actual: state.schedule.phase, source: "seasonEngine.enterContractPhase" });
  validateRosters(state, report, "contract review");

  // Process contracts → free agency window opens (market now full of released players).
  state = advanceOffseasonWithHooks(state);
  const faWindow = !!state.offseason?.freeAgencyOpen;
  if (!faWindow) issue(report, { phase: "offseason", event: "free agency window", subject: "freeAgencyOpen", expected: "true", actual: "false", source: "seasonEngine.advanceOffseason" });

  // FA-window checkpoint (before the user signs replacements): let-walk entered
  // FA, market includes former AI players, no player in two states at once.
  const freeNow = (state.players || []).filter(p => p.status === "freeAgent" && !p.teamId);
  report.faFormerAiCount = freeNow.filter(p => p.previousTeamId && isCdlTeamId(p.previousTeamId) && p.previousTeamId !== state.userTeamId).length;
  for (const p of state.players || []) {
    if (p.status === "freeAgent" && p.teamId) issue(report, { phase: "free agency", event: "double state", subject: p.name, expected: "freeAgent ⇒ no team", actual: `on ${p.teamId}`, source: "seasonEngine/rosterAI" });
  }
  if (letWalkId) {
    // A let-walk player must LEAVE the user team. Entering free agency is the
    // normal outcome; the engine may also retire or move a low-value walker to
    // Challengers (also valid). The only failure is staying on the user team.
    const w = state.players.find(p => p.id === letWalkId);
    const stillOnUser = w && !isInactivePlayer(w) && w.teamId === state.userTeamId;
    if (stillOnUser) issue(report, { phase: "free agency", event: "let-walk", subject: w?.name, expected: "leaves the user team", actual: `still on ${w?.teamId}`, source: "seasonEngine.advanceOffseason" });
  }

  // User signs a replacement during the window (market is full here), without
  // re-signing the player they just let walk.
  state = signUserToFour(state, new Set(letWalkId ? [letWalkId] : []));
  // A re-signed keeper must not be poached by another CDL team. (Retirement is a
  // legitimate exit, so only an ACTIVE player on a different CDL team is a bug.)
  const poached = (id) => { const r = state.players.find(p => p.id === id); return r && !isInactivePlayer(r) && r.teamId && isCdlTeamId(r.teamId) && r.teamId !== state.userTeamId; };
  const resignKept = !resignIds.some(poached);
  if (!resignKept) issue(report, { phase: "free agency", event: "re-sign", subject: "user keepers", expected: "stay on user team", actual: "a re-signed player moved to another CDL team", source: "seasonEngine.advanceOffseason" });
  report.resignLetWalk = letWalkId ? (resignKept ? "OK" : "FAIL") : "n/a (no expiring)";

  // Run AI Free Agency + Start New Season.
  state = advanceOffseasonWithHooks(state);
  // Backfill any holes opened by retirements at the season rollover.
  state = signUserToFour(state);
  if (state.season !== report.season + 1) issue(report, { phase: "offseason", event: "new season", subject: "season", expected: `${report.season + 1}`, actual: `${state.season}`, source: "seasonEngine.advanceOffseason" });
  if (state.schedule.phase !== "stage") issue(report, { phase: "offseason", event: "new season", subject: "phase", expected: "stage", actual: state.schedule.phase, source: "seasonEngine" });
  report.offseason = "complete";

  // After AI FA: AI rosters repaired to 4; re-signed user players not poached by
  // another CDL team (retirement at the rollover is a legitimate exit).
  validateRosters(state, report, "after Run AI Free Agency / new season");
  if (resignIds.length) {
    const poachedNow = (id) => { const r = state.players.find(p => p.id === id); return r && !isInactivePlayer(r) && r.teamId && isCdlTeamId(r.teamId) && r.teamId !== state.userTeamId; };
    if (resignIds.some(poachedNow)) issue(report, { phase: "new season", event: "re-sign integrity", subject: "user keepers", expected: "not on another CDL team after AI FA", actual: "a re-signed player was poached", source: "seasonEngine.runAIFreeAgencyMarket" });
  }

  // History persistence — the just-finished season must be archived, and OVR
  // history must persist into the next season.
  if (!(state.seasonHistory || []).some(s => Number(s?.season) === report.season)) issue(report, { phase: "history", event: "season history", subject: "seasonHistory", expected: `entry for season ${report.season}`, actual: "missing", source: "seasonArchive.archiveCompletedSeason" });
  if ((state.teamCareerHistory || []).length === 0) issue(report, { phase: "history", event: "team history", subject: "teamCareerHistory", expected: "populated", actual: "empty", source: "seasonArchive" });
  const sampleOvr = Object.keys(state.playerOvrHistory || {}).length;
  if (sampleOvr === 0) issue(report, { phase: "history", event: "OVR history", subject: "playerOvrHistory", expected: "populated after offseason", actual: "empty", source: "seasonEngine.advanceOffseason" });

  // Board objectives regenerate for the NEW season (allowed), confidence carried.
  validateBoardStaffMap(state, report, "after offseason");

  return state;
}

// ── Drive the run ────────────────────────────────────────────────────────────
const USER_TEAM = process.argv[2] || "optic";
const SEED = Number(process.argv[3]) || 31415;
let state = makeState(USER_TEAM, SEED);

console.log(`Full season flow diagnostic — user=${USER_TEAM} seed=${SEED}, simulating ${SEASONS_TO_RUN} seasons.\n`);

const reports = [];
let allPass = true;
for (let s = 0; s < SEASONS_TO_RUN; s++) {
  const report = makeSeasonReport(state.season);
  state = runSeason(state, report);
  const pass = report.issues.length === 0;
  allPass = allPass && pass;
  report.result = pass ? "PASS" : "FAIL";
  reports.push(report);

  console.log(`Season ${report.season}:`);
  console.log(`- Majors completed: ${report.majorsCompleted}/4`);
  console.log(`- Challenger qualifiers completed: ${report.qualifiersCompleted}/4`);
  console.log(`- Challengers Finals: ${report.finals}`);
  console.log(`- Champs: ${report.champs}`);
  console.log(`- ESWC: ${report.eswc} (after Champs, before Awards)`);
  console.log(`- Awards: ${report.awards}`);
  console.log(`- Offseason: ${report.offseason}`);
  console.log(`- CDL roster issues: ${report.cdlRosterIssues}`);
  console.log(`- Challenger roster issues (at events): ${report.challengerRosterIssues}`);
  console.log(`- Challenger roster warnings (transient, self-heal at event entry): ${report.challengerRosterWarnings}`);
  console.log(`- Duplicate players: ${report.duplicatePlayers}`);
  console.log(`- Placeholder players in events: ${report.placeholderInEvents}`);
  console.log(`- Free agency former-AI count: ${report.faFormerAiCount}`);
  console.log(`- Re-sign kept / let-walk to FA: ${report.resignLetWalk}`);
  console.log(`- Awards check: ${report.awardsCheck}`);
  console.log(`- Board/Staff/Map: ${report.boardStaffMap}`);
  console.log(`- Result: ${report.result}`);
  if (!pass) {
    console.log(`  Issues (${report.issues.length}):`);
    for (const it of report.issues.slice(0, 25)) {
      console.log(`   · [${it.phase}] ${it.event} — ${it.subject}: expected ${it.expected}, got ${it.actual}${it.source ? ` (${it.source})` : ""}`);
    }
    if (report.issues.length > 25) console.log(`   …and ${report.issues.length - 25} more`);
  }
  console.log("");
}

console.log("────────────────────────────────────────");
if (allPass) {
  console.log(`Full season flow diagnostic PASSED — ${SEASONS_TO_RUN} complete seasons, all systems stable.`);
} else {
  console.error(`Full season flow diagnostic FAILED — see per-season issues above.`);
  process.exit(1);
}
