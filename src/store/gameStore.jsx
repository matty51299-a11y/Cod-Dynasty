// src/store/gameStore.jsx
// Central game state manager using React Context + useReducer.
// Handles: new game, load/save (localStorage), all sim actions.

import { createContext, useContext, useReducer } from "react";
import { buildInitialRoster } from "../data/players.js";
import { generateProspects } from "../data/prospects.js";
import { applyChallengerRatingOverride } from "../data/challengerRatingOverrides.js";
import { buildCdlRosterNameSet, findDuplicateActivePlayers, isCdlTeamId, isInactivePlayer, normalizePlayerName } from "../utils/playerIdentity.js";
import { buildSeason, simNextMatch, simMatchday, simUserMatchday, simStage, simMajor, simNextMajorMatch, simMajorRound, advanceOffseason, beginChamps, beginEswc, enterContractPhase, commitUserMatchResult, ensureChallengerTeams, buildChallengerRostersForNewGame, simChallengerQualifier, simNextChallengerQualifierMatch, simChallengerQualifierRound, continueFromChallengerQualifier } from "../engine/seasonEngine.js";
import { generateMajorFeed, generateChallengerQualFeed, generateRosterMoveFeed, generateOffseasonFeed } from "../engine/feedGenerator.js";
import { ensureCdlRosterIntegrity, getSigningCost, getTeamCap } from "../engine/rosterAI.js";
import { canAffordStarterResign } from "../utils/contractBudget.js";
import { getRosterIncompleteMessage, getTeamRosterStatus } from "../utils/rosterValidation.js";
import { CDL_TEAMS } from "../data/teams.js";
import { isValidGameState, isValidTeamId, findPhaseInvariantViolations } from "./gameValidation.js";
import { migrateStaff, hireStaff, fireStaff, ensureTeamStaff, roleLabel } from "../engine/staffEngine.js";
import { migrateBoardState, buildBoardObjectives, objectivesNeedRegen, BOARD_OBJ_VERSION, nudgeConfidenceAfterMajor, runBoardReview } from "../engine/boardEngine.js";
import { ensureTeamMapProfiles } from "../engine/mapProfile.js";
import { migrateUserScouting, applyScout, toggleShortlist } from "../engine/scoutingEngine.js";

const SAVE_KEY  = "cdl_manager_save";
const FEED_CAP  = 200;

// ── Feed helpers ──────────────────────────────────────────────────────────────
// Each feed item: { id, type, message, season, phase, read }
// id is derived from feed length at insertion — unique and stable per session.

function mkFeed(type, message, season, phase) {
  return { type, message, season: season ?? 1, phase: phase ?? "stage", read: false };
}

function pushFeed(state, items) {
  if (!items.length) return state;
  const base    = state.feed?.length ?? 0;
  const stamped = items.map((item, i) => ({ ...item, id: `f_${base + i}` }));
  const combined = [...(state.feed ?? []), ...stamped];
  const feed = combined.length > FEED_CAP ? combined.slice(combined.length - FEED_CAP) : combined;
  return { ...state, feed };
}

// ── Team rank helper ──────────────────────────────────────────────────────────
function teamRank(standings, teamId) {
  const sorted = Object.entries(standings ?? {}).sort((a, b) => b[1].points - a[1].points);
  const idx = sorted.findIndex(([id]) => id === teamId);
  return idx >= 0 ? idx + 1 : 0;
}


// ── Streak detection ──────────────────────────────────────────────────────────
// Called after stage sims. `fullLog` is the final log; `prevLen` is how many
// entries existed before the sim ran (captured as a number, immune to mutation).
function detectStreakFeed(fullLog, prevLen, season) {
  const items = [];
  const newStageMatches = fullLog.slice(prevLen).filter(m => !m.stage?.includes("–"));
  if (!newStageMatches.length) return items;

  const teamsPlayed = new Set();
  newStageMatches.forEach(m => { teamsPlayed.add(m.winnerId); teamsPlayed.add(m.loserId); });

  for (const teamId of teamsPlayed) {
    const stageLog = fullLog.filter(
      m => (m.winnerId === teamId || m.loserId === teamId) && !m.stage?.includes("–")
    );
    if (stageLog.length < 3) continue;

    const last3 = stageLog.slice(-3);
    const prev4 = stageLog.length >= 4 ? stageLog[stageLog.length - 4] : null;

    const allWin  = last3.every(m => m.winnerId === teamId);
    const allLoss = last3.every(m => m.loserId  === teamId);
    if (!allWin && !allLoss) continue;

    // Only emit when streak JUST hit 3 (the 4th-back went the other way)
    const justStarted = !prev4
      || (allWin  && prev4.loserId  === teamId)
      || (allLoss && prev4.winnerId === teamId);
    if (!justStarted) continue;

    const tag = CDL_TEAMS.find(t => t.id === teamId)?.tag ?? teamId;
    if (allWin)  items.push(mkFeed("win_streak",  `${tag} win 3 straight`,    season, "stage"));
    if (allLoss) items.push(mkFeed("lose_streak", `${tag} drop 3 in a row`,   season, "stage"));
  }
  return items;
}

// ── Standings change detection (user team only) ───────────────────────────────
// prevRank captured as a number before mutation — immune to in-place updates.
function detectStandingsFeed(prevRank, newStandings, userTeamId, season, phase) {
  const items = [];
  if (!userTeamId || !prevRank) return items;
  const newRank = teamRank(newStandings, userTeamId);
  const tag     = CDL_TEAMS.find(t => t.id === userTeamId)?.tag ?? userTeamId;
  if (prevRank > 4 && newRank <= 4)
    items.push(mkFeed("top4_climb", `${tag} move into top 4`, season, phase ?? "stage"));
  if (prevRank <= 8 && newRank > 8)
    items.push(mkFeed("out_top8",   `${tag} fall out of top 8`, season, phase ?? "stage"));
  return items;
}



function blockIfUserRosterInvalid(state) {
  const message = getRosterIncompleteMessage(state);
  return message ? addNotif(state, message) : null;
}

function runIfUserRosterValid(state, runner) {
  const blocked = blockIfUserRosterInvalid(state);
  return blocked ?? runner();
}

function blockIfUserOffseasonAdvanceInvalid(state) {
  // Contract review may intentionally create openings; the user gets the next
  // offseason hub/free-agency screen to repair them before the new season starts.
  if (state?.schedule?.phase === "contracts") return null;
  return blockIfUserRosterInvalid(state);
}

function shouldRetireOnRelease(player) {
  return (player.age ?? 25) >= 33 || ((player.age ?? 25) >= 30 && (player.overall ?? 70) < 70);
}

function shouldMoveToChallengersOnRelease(player) {
  return ((player.overall ?? 70) >= 75 || (player.age ?? 25) < 29) && !shouldRetireOnRelease(player);
}

function txKey(tx) {
  return [
    tx.season ?? "",
    tx.stageIdx ?? "",
    tx.majorIdx ?? "",
    tx.type ?? "",
    tx.playerId ?? normalizePlayerName(tx.playerName),
    normalizePlayerName(tx.playerName),
    tx.fromTeamId ?? "",
    tx.toTeamId ?? "",
  ].join("|");
}

function pushChallengerTransaction(transactions, state, entry) {
  const playerName = entry.playerName || entry.name;
  if (!entry?.type || !playerName) return transactions || [];
  const tx = {
    season: state.season,
    stageIdx: state.schedule?.stageIdx ?? null,
    majorIdx: state.schedule?.majorIdx ?? null,
    ...entry,
    playerName,
  };
  const key = txKey(tx);
  return (transactions || []).some((existing) => txKey(existing) === key)
    ? (transactions || [])
    : [...(transactions || []), tx];
}

function cdlRosterHasName(players, name, exceptId = null) {
  const key = normalizePlayerName(name);
  if (!key) return false;
  return (players || []).some((player) => (exceptId == null || player.id !== exceptId)
    && player.teamId && isCdlTeamId(player.teamId) && !isInactivePlayer(player)
    && normalizePlayerName(player.name) === key);
}

function cleanupDuplicateActiveAssignments(state) {
  const cdlNames = buildCdlRosterNameSet(state.players || []);
  const duplicateIds = new Set();
  for (const group of findDuplicateActivePlayers(state)) {
    for (const dup of group.duplicates) {
      if (dup.location !== "cdl") duplicateIds.add(dup.player.id);
    }
  }

  const prospects = (state.prospects || []).filter((prospect) => {
    const key = normalizePlayerName(prospect.name);
    return key && !cdlNames.has(key) && !duplicateIds.has(prospect.id) && !isInactivePlayer(prospect);
  });

  const players = (state.players || []).map((player) => {
    const key = normalizePlayerName(player.name);
    if (!player.teamId && key && (cdlNames.has(key) || duplicateIds.has(player.id))) {
      return { ...player, challengerTeamId: null, status: "duplicate_hidden" };
    }
    return player;
  });

  const validIds = new Set([...players, ...prospects].filter((player) => !isInactivePlayer(player)).map((player) => player.id));
  const nameById = new Map([...players, ...prospects].map((player) => [player.id, normalizePlayerName(player.name)]));
  const assignedNames = new Set();
  const challengerTeams = (state.challengerTeams || []).map((team) => {
    const playerIds = [];
    for (const pid of team.playerIds || []) {
      const key = nameById.get(pid);
      if (!pid || !validIds.has(pid) || !key || cdlNames.has(key) || assignedNames.has(key)) continue;
      playerIds.push(pid);
      assignedNames.add(key);
    }
    return { ...team, playerIds: playerIds.slice(0, 4) };
  });

  const cleaned = { ...state, players, prospects, challengerTeams };
  ensureChallengerTeams(cleaned);
  return cleaned;
}

// ── Initial state factory ─────────────────────────────────────────────────────
function createInitialGameState(userTeamId) {
  if (!isValidTeamId(userTeamId)) return null;
  const players  = buildInitialRoster().map(applyChallengerRatingOverride);
  const rawProspects = generateProspects(Date.now() % 999983).map(applyChallengerRatingOverride);
  const seen = new Set();
  const prospects = rawProspects.filter((p) => {
    const key = normalizePlayerName(p.name);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  // Generate a unique seed for this save's initial Challenger roster draft.
  // Two bits of entropy: milliseconds and a secondary counter derived from the
  // prospect generation seed, so rapid successive new-games still differ.
  const t = Date.now();
  const challengerDraftSeed = ((t % 999983) * 1009 + (t % 97) * 37 + 1) | 0;
  const state = {
    userTeamId,
    season: 1,
    players,      // all pro players + any signed prospects (Roster reads from here)
    prospects,    // unsigned challengers pool only
    schedule: buildSeason(1),
    notifications: [],
    feed: [],
    saveExists: true,
    enteredMajorIdx:   null,  // tracks which major the user has "entered" past the intro gate
    playerSeasonStats: {},    // { [playerId]: [{ season, kills, deaths, matches }, ...] }
    playerOvrHistory:  {},    // { [playerId]: [{ season, overall }, ...] }
    challengersLog:    [],    // per-season challengers pool snapshots (for Pool Health panel)
    challengerTransactions: [],
    seasonHistory: [],
    playerCareerHistory: [],
    teamCareerHistory: [],
    awards: [],
    pendingSeasonAwards: null,
    seenAwardsSeasons: [],
    challengerDraftSeed,      // stored for reference; roster is already built — do not re-use
    staff: ensureTeamStaff(migrateStaff([])),
    boardState: migrateBoardState(null),
    pendingBoardReview: null,
    userScouting: migrateUserScouting(null),
  };
  // Build randomized starting Challenger rosters for this new save.
  buildChallengerRostersForNewGame(state, challengerDraftSeed);
  const finalState = ensureCdlRosterIntegrity(cleanupDuplicateActiveAssignments(state), { windowType: "new_game" });
  finalState.boardState = regenBoardObjectives(finalState, finalState.boardState);
  // CDL 2026 map pool: generate every team's map/mode profile once at new game.
  finalState.teamMapProfiles = ensureTeamMapProfiles(finalState, { force: true });
  return finalState;
}

// ── Board objective (re)generation — sets objectives + explanatory meta ───────
// Generated at season start and stored in the save. Never call this on render.
function regenBoardObjectives(state, boardState) {
  const base = migrateBoardState(boardState);
  const { objectives, meta } = buildBoardObjectives({ ...state, boardState: base });
  return { ...base, objectives, meta, version: BOARD_OBJ_VERSION };
}

// ── Board nudge helper — applies after a Major completes ──────────────────────
function withMajorBoardNudge(beforeState, afterState, majorIdx) {
  if (majorIdx == null || majorIdx > 3 || majorIdx < 0) return afterState;
  if (!afterState.boardState) return afterState;
  const wasCompleted = beforeState.schedule?.majors?.[majorIdx]?.completed ?? true;
  const nowCompleted = afterState.schedule?.majors?.[majorIdx]?.completed ?? false;
  if (!wasCompleted && nowCompleted) {
    const nudged = nudgeConfidenceAfterMajor(afterState.boardState, afterState, majorIdx);
    return { ...afterState, boardState: nudged };
  }
  return afterState;
}

// ── Reducer ──────────────────────────────────────────────────────────────────
function reducer(state, action) {
  switch (action.type) {

    case "RESET_TO_TEAM_SELECT":
      return null;

    case "NEW_GAME":
      return createInitialGameState(action.teamId);

    case "LOAD_GAME": {
      if (!action.state || !isValidGameState(action.state)) return null;

      // Backfill `feed` for saves that predate this feature
      const loaded = {
        ...action.state,
        feed: action.state?.feed ?? [],
        seasonHistory: action.state?.seasonHistory ?? [],
        playerCareerHistory: action.state?.playerCareerHistory ?? [],
        teamCareerHistory: action.state?.teamCareerHistory ?? [],
        awards: action.state?.awards ?? [],
        pendingSeasonAwards: action.state?.pendingSeasonAwards ?? null,
        seenAwardsSeasons: action.state?.seenAwardsSeasons ?? [],
      };
      const migratedMajors = [...(loaded.schedule?.majors ?? [])];
      if (!migratedMajors[5]) migratedMajors[5] = { name: "ESWC", bracket: null, completed: false, eventType: "eswc", pointsAwarded: true };
      loaded.schedule = {
        ...loaded.schedule,
        majors: migratedMajors,
        challengerQualifierResults: loaded.schedule?.challengerQualifierResults ?? [],
        currentChallengerQualifier: loaded.schedule?.currentChallengerQualifier ?? null,
        currentMajorEventTeams: loaded.schedule?.currentMajorEventTeams ?? null,
      };
      ensureChallengerTeams(loaded);
      const cleaned = ensureCdlRosterIntegrity(cleanupDuplicateActiveAssignments(loaded), { windowType: "load_migration" });
      cleaned.challengerTransactions = cleaned.challengerTransactions ?? [];
      // Migrate staff: old saves without staff get the full starting pool
      cleaned.staff = ensureTeamStaff(migrateStaff(cleaned.staff));
      // Migrate board state: old saves without boardState get a fresh one.
      // Also safely regenerate objectives if they are missing OR predate the
      // current (realism-fixed) objective logic — a one-time mid-season migration
      // that replaces clearly-invalid legacy objectives. Placement/Major/Champs
      // objectives evaluate from current standings, so regenerating mid-season is safe.
      cleaned.boardState = migrateBoardState(cleaned.boardState);
      if (objectivesNeedRegen(cleaned.boardState)) {
        cleaned.boardState = regenBoardObjectives(cleaned, cleaned.boardState);
      }
      // Map pool: hydrate profiles for old saves; rebuild if stale (new season).
      cleaned.teamMapProfiles = ensureTeamMapProfiles(cleaned);
      // Prospect Scouting 2.0: hydrate the scouting visibility layer. Missing on
      // old saves → empty structure; estimates are derived lazily on view.
      cleaned.userScouting = migrateUserScouting(cleaned.userScouting);
      return isValidGameState(cleaned) ? cleaned : null;
    }

    // ── Stage sims — detect streaks + standings changes ────────────────────
    case "SIM_NEXT_MATCH": {
      return runIfUserRosterValid(state, () => {
      const prevLogLen = state.schedule?.matchLog?.length ?? 0;
      const prevRank   = teamRank(state.schedule?.standings ?? {}, state.userTeamId);
      const season     = state.season;
      const newState   = simNextMatch({ ...state });
      return pushFeed(newState, [
        ...detectStreakFeed(newState.schedule?.matchLog ?? [], prevLogLen, season),
        ...detectStandingsFeed(prevRank, newState.schedule?.standings ?? {}, state.userTeamId, season, newState.schedule?.phase),
      ]);
      });
    }

    case "SIM_MATCHDAY": {
      return runIfUserRosterValid(state, () => {
      const prevLogLen = state.schedule?.matchLog?.length ?? 0;
      const prevRank   = teamRank(state.schedule?.standings ?? {}, state.userTeamId);
      const season     = state.season;
      const newState   = simMatchday({ ...state });
      return pushFeed(newState, [
        ...detectStreakFeed(newState.schedule?.matchLog ?? [], prevLogLen, season),
        ...detectStandingsFeed(prevRank, newState.schedule?.standings ?? {}, state.userTeamId, season, newState.schedule?.phase),
      ]);
      });
    }

    case "SIM_USER_MATCHDAY": {
      return runIfUserRosterValid(state, () => {
      const prevLogLen = state.schedule?.matchLog?.length ?? 0;
      const prevRank   = teamRank(state.schedule?.standings ?? {}, state.userTeamId);
      const season     = state.season;
      const newState   = simUserMatchday({ ...state });
      return pushFeed(newState, [
        ...detectStreakFeed(newState.schedule?.matchLog ?? [], prevLogLen, season),
        ...detectStandingsFeed(prevRank, newState.schedule?.standings ?? {}, state.userTeamId, season, newState.schedule?.phase),
      ]);
      });
    }

    case "SIM_STAGE": {
      return runIfUserRosterValid(state, () => {
      const prevLogLen = state.schedule?.matchLog?.length ?? 0;
      const prevRank   = teamRank(state.schedule?.standings ?? {}, state.userTeamId);
      const season     = state.season;
      const newState   = simStage({ ...state });
      return pushFeed(newState, [
        ...detectStreakFeed(newState.schedule?.matchLog ?? [], prevLogLen, season),
        ...detectStandingsFeed(prevRank, newState.schedule?.standings ?? {}, state.userTeamId, season, newState.schedule?.phase),
      ]);
      });
    }

    // ── Major sims — detect champion + eliminations + K/D leader ──────────
    case "SIM_MAJOR": {
      return runIfUserRosterValid(state, () => {
      const majorIdx     = state.schedule?.majorIdx;
      const wasCompleted = state.schedule?.majors?.[majorIdx]?.completed ?? true;
      const newState     = simMajor({ ...state });
      const withFeed = pushFeed(newState, generateMajorFeed(wasCompleted, newState, majorIdx));
      return withMajorBoardNudge(state, withFeed, majorIdx);
      });
    }

    case "SIM_NEXT_MAJOR_MATCH": {
      return runIfUserRosterValid(state, () => {
      const majorIdx     = state.schedule?.majorIdx;
      const wasCompleted = state.schedule?.majors?.[majorIdx]?.completed ?? true;
      const newState     = simNextMajorMatch({ ...state });
      const withFeed = pushFeed(newState, generateMajorFeed(wasCompleted, newState, majorIdx));
      return withMajorBoardNudge(state, withFeed, majorIdx);
      });
    }

    case "SIM_MAJOR_ROUND": {
      return runIfUserRosterValid(state, () => {
      const majorIdx     = state.schedule?.majorIdx;
      const wasCompleted = state.schedule?.majors?.[majorIdx]?.completed ?? true;
      const newState     = simMajorRound({ ...state });
      const withFeed = pushFeed(newState, generateMajorFeed(wasCompleted, newState, majorIdx));
      return withMajorBoardNudge(state, withFeed, majorIdx);
      });
    }

    // ── Interactive match result from MatchCenterOverlay ──────────────
    case "COMMIT_USER_MATCH_RESULT": {
      return runIfUserRosterValid(state, () => {
      const majorIdx     = state.schedule?.majorIdx;
      const wasCompleted = majorIdx != null
        ? (state.schedule?.majors?.[majorIdx]?.completed ?? true)
        : true;
      const prevLogLen = state.schedule?.matchLog?.length ?? 0;
      const prevRank   = teamRank(state.schedule?.standings ?? {}, state.userTeamId);
      const season     = state.season;

      const newState = commitUserMatchResult({ ...state }, action.result);

      const feedItems = [
        ...detectStreakFeed(newState.schedule?.matchLog ?? [], prevLogLen, season),
        ...detectStandingsFeed(prevRank, newState.schedule?.standings ?? {}, state.userTeamId, season, newState.schedule?.phase),
        ...(majorIdx != null ? generateMajorFeed(wasCompleted, newState, majorIdx) : []),
      ];
      const result = pushFeed(newState, feedItems);
      return withMajorBoardNudge(state, result, majorIdx);
      });
    }

    case "ENTER_MAJOR":
      return runIfUserRosterValid(state, () => ({ ...state, enteredMajorIdx: action.majorIdx }));

    case "DISMISS_MAJOR":
      return { ...state, enteredMajorIdx: null };

    case "SIM_CHALLENGER_QUALIFIER":
      return runIfUserRosterValid(state, () => simChallengerQualifier({ ...state }));

    case "SIM_NEXT_CHALLENGER_QUALIFIER_MATCH":
      return runIfUserRosterValid(state, () => simNextChallengerQualifierMatch({ ...state }));

    case "SIM_CHALLENGER_QUALIFIER_ROUND":
      return runIfUserRosterValid(state, () => simChallengerQualifierRound({ ...state }));

    case "CONTINUE_FROM_CHALLENGER_QUALIFIER": {
      return runIfUserRosterValid(state, () => {
        const event = state.schedule?.currentChallengerQualifier;
        const majorIdx = state.schedule?.majorIdx ?? state.schedule?.stageIdx ?? 0;
        const newState = continueFromChallengerQualifier({ ...state });
        if (event?.eventType === "challengersFinals") {
          const winner = event.results?.find(r => r.placement === 1);
          const eswcTeams = (event.results || []).filter(r => r.qualified).sort((a, b) => a.placement - b.placement).map(r => r.teamName).join(", ");
          return pushFeed(newState, [
            ...(winner ? [mkFeed("challengers_finals", `${winner.teamName} win Challengers Finals`, newState.season, "challengerQualifier")] : []),
            ...(eswcTeams ? [mkFeed("eswc_field", `Challenger ESWC qualifiers: ${eswcTeams}`, newState.season, "challengerQualifier")] : []),
          ]);
        }
        return pushFeed(newState, generateChallengerQualFeed(newState, majorIdx));
      });
    }

    case "BEGIN_CHAMPS":
      return runIfUserRosterValid(state, () => beginChamps({ ...state }));

    case "ENTER_CONTRACT_PHASE":
      if (state.pendingSeasonAwards) return state;
      return enterContractPhase({ ...state });

    case "CONTINUE_FROM_SEASON_AWARDS": {
      const season = Number(action.season ?? state.pendingSeasonAwards?.season);
      const seenAwardsSeasons = Number.isFinite(season)
        ? [...new Set([...(state.seenAwardsSeasons || []).map(Number), season])]
        : (state.seenAwardsSeasons || []);
      const baseState = { ...state, pendingSeasonAwards: null, seenAwardsSeasons, enteredMajorIdx: null };
      const currentBoard = migrateBoardState(baseState.boardState);
      const { newBoardState, pendingBoardReview } = runBoardReview(currentBoard, baseState);
      const reviewedState = { ...baseState, boardState: newBoardState, pendingBoardReview };
      return reviewedState.schedule?.pendingPostChampsEswc ? beginEswc(reviewedState) : reviewedState;
    }

    // ── Offseason — retirements, prospect class, notable AI signings, roster moves ──
    case "ADVANCE_OFFSEASON": {
      const blocked = blockIfUserOffseasonAdvanceInvalid(state);
      if (blocked) return blocked;
      const runAdvance = () => {
      const prevRetiredLen = state.retiredPlayers?.length ?? 0;
      const prevFreeIds    = new Set(
        (state.players ?? []).filter(p => !p.teamId).map(p => p.id)
      );
      const prevMovesLen = state.rosterMovesLog?.length ?? 0;
      const season       = state.season; // outgoing season

      const advanced = advanceOffseason({ ...state });
      const newState = { ...advanced, enteredMajorIdx: null, pendingBoardReview: null };
      // New season → regenerate every team's map profile from the updated rosters.
      newState.teamMapProfiles = ensureTeamMapProfiles(newState, { force: true });

      // Build new objectives for the incoming season (carries confidence/history forward)
      const newBoardState = {
        ...regenBoardObjectives(newState, newState.boardState),
        verdict: null,
      };
      const tag = CDL_TEAMS.find(t => t.id === newState.userTeamId)?.tag ?? "Owner";
      const primObj = newBoardState.objectives.find(o => o.weight === "primary");
      const secObjs = newBoardState.objectives.filter(o => o.weight === "secondary");
      const boardFeed = mkFeed(
        "board_mandate",
        `${tag} owner sets Season ${newState.season} mandate — ${primObj?.label ?? ""}${secObjs.length ? "; " + secObjs.map(o => o.label).join(", ") : ""}`,
        newState.season,
        "stage"
      );
      const stateWithBoard = { ...newState, boardState: newBoardState };

      return pushFeed(stateWithBoard, [
        boardFeed,
        ...generateOffseasonFeed(prevRetiredLen, prevFreeIds, stateWithBoard, season),
        ...generateRosterMoveFeed(stateWithBoard, prevMovesLen),
      ]);
      };
      return state.schedule?.phase === "contracts" ? runAdvance() : runIfUserRosterValid(state, runAdvance);
    }

    // ── RE-SIGN PLAYER ────────────────────────────────────────────────────────
    case "RESIGN_PLAYER": {
      const { playerId, years, salary } = action;
      const player = state.players.find(p => p.id === playerId);
      if (!player || player.teamId !== state.userTeamId) return state;

      // Hard budget check for starters (subs exempt, matching SIGN_PLAYER logic).
      // Contract review excludes unaccepted expiring salaries, so a new deal replaces
      // this player's old expiring salary instead of stacking on top of it.
      if (salary != null && !player.isSub) {
        const budget = canAffordStarterResign(state.players, state.userTeamId, playerId, salary);
        if (!budget.affordable) {
          return addNotif(state, `Over budget — re-signing ${player.name} would exceed your cap.`);
        }
      }

      return {
        ...state,
        players: state.players.map(p =>
          p.id === playerId
            ? { ...p, contractYears: years, ...(salary != null ? { salary } : {}) }
            : p
        ),
      };
    }

    // ── SIGN PLAYER ───────────────────────────────────────────────────────────
    case "SIGN_PLAYER": {
      const { playerId, slotType } = action;
      const userTeam  = state.userTeamId;
      const rosterNow = state.players.filter(p => p.teamId === userTeam);

      if (slotType === "starter" && rosterNow.filter(p => !p.isSub).length >= 4) {
        return addNotif(state, "Starter roster is full (4/4). Release a player first.");
      }
      if (slotType === "sub" && rosterNow.filter(p => p.isSub).length >= 1) {
        return addNotif(state, "Sub slot is full (1/1). Release your sub first.");
      }

      // Hard budget check (starters only)
      if (slotType === "starter") {
        const target = state.prospects.find(p => p.id === playerId)
                    || state.players.find(p => p.id === playerId);
        if (target) {
          const cap       = getTeamCap(userTeam);
          const committed = rosterNow
            .filter(p => !p.isSub)
            .reduce((s, p) => s + (p.salary ?? getSigningCost(p)), 0);
          const cost = getSigningCost(target);
          const over = committed + cost - cap;
          if (over > 0) {
            return addNotif(state,
              `Over budget — signing ${target.name} would exceed your cap by $${(over / 1000).toFixed(0)}k.`
            );
          }
        }
      }

      const tag = CDL_TEAMS.find(t => t.id === userTeam)?.tag ?? userTeam;
      const phase = state.schedule?.phase ?? "stage";
      const targetForDuplicateCheck = state.prospects.find(p => p.id === playerId)
        || state.players.find(p => p.id === playerId);
      if (!targetForDuplicateCheck || isInactivePlayer(targetForDuplicateCheck)) {
        return addNotif(state, "Player is not available to sign.");
      }
      if (targetForDuplicateCheck.teamId === userTeam) {
        return addNotif(state, `${targetForDuplicateCheck.name} is already on your roster.`);
      }
      if (targetForDuplicateCheck.teamId && targetForDuplicateCheck.teamId !== userTeam) {
        return addNotif(state, `${targetForDuplicateCheck.name} is not available to sign.`);
      }
      if (cdlRosterHasName(state.players, targetForDuplicateCheck.name, targetForDuplicateCheck.id)) {
        return addNotif(state, `${targetForDuplicateCheck.name} is already active on a CDL roster.`);
      }

      const prospect = state.prospects.find(p => p.id === playerId);

      if (prospect) {
        const existingHistory = prospect.teamHistory || [];
        const historyUpdated  = existingHistory.some(e => e.season === state.season)
          ? existingHistory
          : [...existingHistory, { season: state.season, teamId: userTeam }];
        const demand = getSigningCost(prospect);
        const signed = {
          ...prospect, teamId: userTeam, challengerTeamId: null, status: "cdl", circuit: "cdl", isSub: slotType === "sub",
          scouted: true, contractYears: 2, salary: demand, teamHistory: historyUpdated,
        };
        return pushFeed(
          addNotif({
            ...state,
            players:  [...state.players, signed],
            prospects: state.prospects.filter(p => p.id !== playerId),
            challengerTeams: (state.challengerTeams || []).map(t => t.id === signed.challengerTeamId ? { ...t, playerIds: (t.playerIds || []).filter(id => id !== signed.id) } : t),
            challengerTransactions: pushChallengerTransaction(state.challengerTransactions, state, {
              type: "CDL_SIGNING", playerId: signed.id, playerName: signed.name, fromTeamId: signed.challengerTeamId ?? null, toTeamId: userTeam,
              note: `${tag} signed ${signed.name} from Challengers`,
            }),
          }, `${signed.name} signed!`),
          [mkFeed("signing", `${tag} sign ${signed.name}`, state.season, phase)]
        );
      }

      // Pro free agent
      const target = state.players.find(p => p.id === playerId);
      if (!target) return addNotif(state, "Player not found.");

      const demand = getSigningCost(target);

      return pushFeed(
        addNotif({
          ...state,
          players: state.players.map(p => {
            if (p.id !== playerId) return p;
            const existingHistory = p.teamHistory || [];
            const historyUpdated  = existingHistory.some(e => e.season === state.season)
              ? existingHistory
              : [...existingHistory, { season: state.season, teamId: userTeam }];
            return {
              ...p, teamId: userTeam, challengerTeamId: null, status: "cdl", circuit: "cdl", isSub: slotType === "sub",
              scouted: true, contractYears: 2, salary: demand, teamHistory: historyUpdated,
            };
          }),
          challengerTeams: (state.challengerTeams || []).map(t => t.id === target.challengerTeamId ? { ...t, playerIds: (t.playerIds || []).filter(id => id !== target.id) } : t),
          challengerTransactions: pushChallengerTransaction(state.challengerTransactions, state, {
            type: target.status === "freeAgent" ? "FREE_AGENT_SIGNING" : "CDL_SIGNING", playerId: target.id, playerName: target.name, fromTeamId: target.previousTeamId ?? target.challengerTeamId ?? null, toTeamId: userTeam,
            note: target.status === "freeAgent" ? `${tag} signed ${target.name} in free agency` : `${tag} signed ${target.name}`,
          }),
        }, `${target.name} signed!`),
        [mkFeed("signing", `${tag} sign ${target.name}`, state.season, phase)]
      );
    }

    // ── RELEASE PLAYER ────────────────────────────────────────────────────────
    case "RELEASE_PLAYER": {
      const player = state.players.find(p => p.id === action.playerId);
      if (!player) return state;
      const wasOnCdlRoster = !!player.teamId && isCdlTeamId(player.teamId) && !isInactivePlayer(player);
      if (!wasOnCdlRoster) return addNotif(state, `${player.name || "Player"} is not on an active CDL roster.`);

      const activeStarters = getTeamRosterStatus(state.players, player.teamId).count;
      if (player.teamId !== state.userTeamId && !player.isSub && activeStarters <= 4) {
        return addNotif(state, `Cannot release ${player.name}; CDL rosters must keep at least 4 active players.`);
      }

      const tag   = CDL_TEAMS.find(t => t.id === player.teamId)?.tag ?? player.teamId ?? "FA";
      const phase = state.schedule?.phase ?? "stage";
      const feedItem = mkFeed("release", `${tag} release ${player.name}`, state.season, phase);

      if (player.isProspect) {
        const releaseToRetire = shouldRetireOnRelease(player);
        const released = { ...player, teamId: null, isSub: false, challengerTeamId: null };
        return pushFeed(
          addNotif({
            ...state,
            players:  state.players.filter(p => p.id !== action.playerId),
            prospects: releaseToRetire ? state.prospects : [...state.prospects, released],
            challengerTransactions: pushChallengerTransaction(state.challengerTransactions, state, {
              type: releaseToRetire ? "RETIREMENT" : "CDL_RELEASE_TO_CHALLENGERS", playerId: released.id, playerName: released.name, fromTeamId: player.teamId, toTeamId: null,
              note: releaseToRetire ? `${released.name} retired after release` : `${released.name} moved to Challengers pool`,
            }),
          }, !player.isSub && player.teamId === state.userTeamId
            ? `${player.name} released. ${getRosterIncompleteMessage({ ...state, players: state.players.filter(p => p.id !== action.playerId) }) ?? ""}`.trim()
            : `${player.name} released.`),
          [feedItem]
        );
      }

      const releaseToChallengers = shouldMoveToChallengersOnRelease(player);
      const txType = releaseToChallengers ? "CDL_RELEASE_TO_CHALLENGERS" : "RETIREMENT";
      return pushFeed(
        addNotif({
          ...state,
          players: state.players.filter(p => p.id !== action.playerId),
          prospects: releaseToChallengers
            ? [...state.prospects, { ...player, teamId: null, isSub: false, challengerTeamId: null, contractYears: 0 }]
            : state.prospects,
          challengerTransactions: pushChallengerTransaction(state.challengerTransactions, state, {
            type: txType,
            playerId: player.id, playerName: player.name, fromTeamId: player.teamId, toTeamId: null,
            note: releaseToChallengers ? `${player.name} moved to Challengers pool` : `${player.name} retired after release`,
          }),
        }, !player.isSub && player.teamId === state.userTeamId
          ? `${player.name} released. ${getRosterIncompleteMessage({ ...state, players: state.players.filter(p => p.id !== action.playerId) }) ?? ""}`.trim()
          : `${player.name} released.`),
        [feedItem]
      );
    }

    // ── SCOUT PLAYER (Prospect Scouting 2.0) ──────────────────────────────────
    case "SCOUT_PLAYER": {
      const result = applyScout(state, action.playerId, { deep: !!action.deep });
      if (!result.ok) return addNotif(state, result.reason);
      const verb = action.deep ? "Deep scouted" : "Scouted";
      return addNotif(
        { ...state, userScouting: result.scouting },
        `${verb} ${result.player.name} (+${result.gain}) — confidence ${result.confidence}%`
      );
    }

    // ── SHORTLIST TOGGLE ──────────────────────────────────────────────────────
    case "TOGGLE_SHORTLIST": {
      const { scouting, added } = toggleShortlist(state, action.playerId);
      const p = (state.prospects || []).find(x => x.id === action.playerId)
        || (state.players || []).find(x => x.id === action.playerId);
      const name = p?.name || "Player";
      return addNotif(
        { ...state, userScouting: scouting },
        added ? `${name} added to shortlist.` : `${name} removed from shortlist.`
      );
    }

    // ── HIRE STAFF ────────────────────────────────────────────────────────────
    case "HIRE_STAFF": {
      const { staffId, teamId } = action;
      if (!staffId || !teamId) return state;
      const target = (state.staff || []).find(s => s.id === staffId);
      if (!target) return addNotif(state, "Staff member not found.");
      const newStaff = hireStaff(state.staff, staffId, teamId);
      const teamTag  = CDL_TEAMS.find(t => t.id === teamId)?.tag ?? teamId;
      const role     = roleLabel(target.role);
      return pushFeed(
        addNotif({ ...state, staff: newStaff }, `${target.name} hired as ${role}!`),
        [mkFeed("staff_hire", `${teamTag} hire ${target.name} as ${role}`, state.season, state.schedule?.phase ?? "stage")]
      );
    }

    // ── FIRE STAFF ────────────────────────────────────────────────────────────
    case "FIRE_STAFF": {
      const { staffId } = action;
      if (!staffId) return state;
      const target = (state.staff || []).find(s => s.id === staffId);
      if (!target || target.currentTeamId !== state.userTeamId) return state;
      const newStaff = fireStaff(state.staff, staffId);
      const teamTag  = CDL_TEAMS.find(t => t.id === state.userTeamId)?.tag ?? state.userTeamId;
      const role     = roleLabel(target.role);
      return pushFeed(
        addNotif({ ...state, staff: newStaff }, `${target.name} released.`),
        [mkFeed("staff_fire", `${teamTag} part ways with ${target.name} (${role})`, state.season, state.schedule?.phase ?? "stage")]
      );
    }

    case "BOARD_REVIEW_CONTINUE":
      return { ...state, pendingBoardReview: null };

    case "BOARD_ACCEPT_NEW_MANDATE":
      return {
        ...state,
        pendingBoardReview: null,
        boardState: {
          ...migrateBoardState(state.boardState),
          confidence: 60,
        },
      };

    case "SHOW_ROSTER_INCOMPLETE":
      return blockIfUserRosterInvalid(state) ?? state;

    case "CLEAR_NOTIF":
      return { ...state, notifications: state.notifications.slice(1) };

    case "MARK_FEED_READ":
      return { ...state, feed: (state.feed ?? []).map(f => ({ ...f, read: true })) };

    default:
      return state;
  }
}

function addNotif(state, msg) {
  return { ...state, notifications: [...state.notifications, msg] };
}

// ── Reducer wrapper: track lastAction + validate post-state invariants ────────
// Stores diagnostics on `window.__lastAction` and `window.__phaseProblems` so
// the ErrorBoundary can show them when a render crash happens, and so console
// users can inspect what just happened. Never throws.
// Actions that change rosters or staff → safe trigger to refresh map profiles
// mid-season (deterministic rebuild, so it stays stable until the next change).
const MAP_PROFILE_REFRESH_ACTIONS = new Set([
  "SIGN_PLAYER", "RELEASE_PLAYER", "RESIGN_PLAYER", "HIRE_STAFF", "FIRE_STAFF",
]);

function instrumentedReducer(prevState, action) {
  const phaseBefore = prevState?.schedule?.phase ?? null;
  const txBefore = prevState?.challengerTransactions?.length ?? 0;
  let nextState = reducer(prevState, action);
  if (nextState && MAP_PROFILE_REFRESH_ACTIONS.has(action?.type) && nextState !== prevState) {
    nextState = { ...nextState, teamMapProfiles: ensureTeamMapProfiles(nextState, { force: true }) };
  }
  const phaseAfter = nextState?.schedule?.phase ?? null;
  const txAfter = nextState?.challengerTransactions?.length ?? 0;
  if (typeof window !== "undefined") {
    const payloadKeys = action && typeof action === "object"
      ? Object.keys(action).filter(k => k !== "type" && k !== "state").slice(0, 8)
      : [];
    window.__lastAction = {
      type: action?.type ?? "(unknown)",
      payloadKeys,
      phaseBefore,
      phaseAfter,
      challengerTransactionsBefore: txBefore,
      challengerTransactionsAfter: txAfter,
      timestamp: new Date().toISOString(),
    };
    if (window.__CLM_DEBUG_CHALLENGER_TX__) {
      console.debug("[challenger-tx] reducer final state", {
        action: action?.type ?? "(unknown)",
        phaseBefore,
        phaseAfter,
        before: txBefore,
        after: txAfter,
      });
    }
    if (nextState) {
      const problems = findPhaseInvariantViolations(nextState);
      window.__phaseProblems = problems;
      if (problems.length) {
        console.warn(
          `[gameStore] phase invariants violated after ${action?.type}:`,
          problems,
          { phaseBefore, phaseAfter }
        );
      }
    } else {
      window.__phaseProblems = [];
    }
  }
  return nextState;
}

// ── Context ───────────────────────────────────────────────────────────────────
const GameContext = createContext(null);

export function GameProvider({ children }) {
  const [state, dispatch] = useReducer(instrumentedReducer, null);

  // Expose state on window so the poolReport() console utility can access it.
  if (typeof window !== "undefined") window.__gameState = state;

  return (
    <GameContext.Provider value={{ state, dispatch }}>
      {children}
    </GameContext.Provider>
  );
}

export function useGame() {
  return useContext(GameContext);
}

// ── localStorage helpers ──────────────────────────────────────────────────────
export function saveGame(state) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn("Save failed:", e);
  }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!isValidGameState(parsed)) {
      localStorage.removeItem(SAVE_KEY);
      return null;
    }
    return parsed;
  } catch {
    localStorage.removeItem(SAVE_KEY);
    return null;
  }
}

export function deleteSave() {
  localStorage.removeItem(SAVE_KEY);
}
