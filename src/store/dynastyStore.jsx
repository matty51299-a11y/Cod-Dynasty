import { createContext, useContext, useReducer } from "react";
import { GHOSTS_TEAMS, GHOSTS_PLAYERS, AW_TEAMS, AW_PLAYERS, getNewAWEntrants } from "../data/historicalRosters.js";
import { GHOSTS_EVENTS } from "../data/ghostsEventCalendar.js";
import { ADVANCED_WARFARE_EVENTS } from "../data/advancedWarfareEventCalendar.js";
import { getEra, HISTORICAL_START_ERA_ID } from "../data/codEras.js";
import { simulateEvent } from "../engine/eventSim.js";
import { createInitialStandings, updateStandings, getSortedStandings } from "../engine/standingsEngine.js";
import { createHistoricalEventState, getNextPendingMatch, getUserPendingMatch, simulateMatch, toEventResult, createHistoricalLiveMatch, playHistoricalLiveMap, advanceHistoricalLiveMap, applyPlayedMatchResult } from "../engine/historicalEventEngine.js";

const SAVE_KEY = "cod_dynasty_save";

export function saveGame(state) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch {}
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function deleteSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch {}
}

function addNotif(state, message) {
  return { ...state, notifications: [...(state.notifications || []), message] };
}

function getEventStatus(state, eventId) {
  if (state.completedEventIds?.includes(eventId)) return "completed";
  if (state.activeEventId === eventId) return "in_progress";
  const idx = state.eventCalendar.findIndex(e => e.id === eventId);
  if (idx === state.currentEventIndex) return "current";
  if (idx < state.currentEventIndex) return "completed";
  return "locked";
}

export function getCurrentEventInfo(state) {
  if (!state) return null;
  const activeProgress = state.activeEventId ? state.eventProgress?.[state.activeEventId] : null;
  const currentEvent = state.eventCalendar[state.currentEventIndex];
  const isEventInProgress = activeProgress && activeProgress.status !== "completed";
  const isEventComplete = activeProgress && activeProgress.status === "completed";
  const userMatch = isEventInProgress ? activeProgress.matches?.find(m => m.status === "pending" && m.userInvolved) : null;
  const allComplete = state.currentEventIndex >= state.eventCalendar.length;

  let buttonLabel = null;
  let buttonAction = null;

  if (allComplete) {
    buttonLabel = "Season Complete";
    buttonAction = null;
  } else if (userMatch) {
    buttonLabel = "Play Match";
    buttonAction = "play_match";
  } else if (isEventInProgress) {
    buttonLabel = "Continue Event";
    buttonAction = "continue_event";
  } else if (currentEvent) {
    buttonLabel = "Start Next Event";
    buttonAction = "start_event";
  }

  return {
    currentEvent,
    activeProgress,
    isEventInProgress,
    isEventComplete,
    userMatch,
    allComplete,
    buttonLabel,
    buttonAction,
  };
}

export function createNewGame(userTeamId) {
  const era = getEra(HISTORICAL_START_ERA_ID);
  const teams = [...GHOSTS_TEAMS];
  if (!teams.some(t => t.id === userTeamId)) return null;
  const players = GHOSTS_PLAYERS.map(p => ({ ...p }));
  const freeAgents = players.filter(p => !p.teamId);
  const standings = createInitialStandings(teams);

  return {
    gameName: "Cod Dynasty",
    currentEraId: era.id,
    currentGameTitle: era.gameTitle,
    seasonLabel: era.seasonLabel,
    currentSeasonLabel: era.seasonLabel,
    currentSeasonIndex: 0,
    completedEraIds: [],
    currentEventId: GHOSTS_EVENTS[0]?.id || null,
    userTeamId,
    teams,
    activeTeams: teams.map(t => t.id),
    inactiveTeams: [],
    historicalTeamRegistry: Object.fromEntries(teams.map(t => [t.id, { ...t, activeEraIds: [era.id] }])),
    players,
    playerRegistry: Object.fromEntries(players.map(p => [p.id, { ...p, debutEraId: p.debutEraId || p.eraId || era.id, currentStatus: p.teamId ? "active" : "freeAgent", currentTeamId: p.teamId || null }])),
    freeAgents,
    amateurPool: [],
    eventCalendar: [...GHOSTS_EVENTS],
    completedEvents: [],
    completedEventIds: [],
    eventProgress: {},
    activeEventId: null,
    standings,
    currentEventIndex: 0,
    notifications: [],
    inboxEvents: [],
    liveHistoricalMatch: null,
    seasonHistory: [],
    archivedStandings: {},
    archivedEventResults: {},
    pendingSeasonComplete: false,
    transitionSummary: null,
    saveExists: true,
  };
}

export function isValidDynastyState(state) {
  return Boolean(
    state &&
    state.gameName === "Cod Dynasty" &&
    state.userTeamId &&
    Array.isArray(state.teams) &&
    state.teams.length > 0 &&
    Array.isArray(state.players) &&
    state.standings &&
    Array.isArray(state.eventCalendar)
  );
}

function migrateState(state) {
  if (!state.completedEventIds) {
    state.completedEventIds = (state.completedEvents || []).map(e => e.eventId);
  }
  const era = getEra(state.currentEraId || HISTORICAL_START_ERA_ID);
  state.currentGameTitle ||= era.gameTitle;
  state.seasonLabel ||= era.seasonLabel;
  state.currentSeasonLabel ||= state.seasonLabel;
  state.currentSeasonIndex ??= state.currentEraId === "advanced_warfare" ? 1 : 0;
  state.completedEraIds ||= [];
  state.currentEventId ||= state.eventCalendar?.[state.currentEventIndex || 0]?.id || null;
  state.activeTeams ||= (state.teams || []).map(t => t.id);
  state.inactiveTeams ||= [];
  state.historicalTeamRegistry ||= Object.fromEntries((state.teams || []).map(t => [t.id, { ...t, activeEraIds: [state.currentEraId || "ghosts"] }]));
  state.playerRegistry ||= Object.fromEntries((state.players || []).map(p => [p.id, { ...p, debutEraId: p.debutEraId || p.eraId || "ghosts", currentStatus: p.teamId ? "active" : "freeAgent", currentTeamId: p.teamId || null }]));
  state.seasonHistory ||= [];
  state.archivedStandings ||= {};
  state.archivedEventResults ||= {};
  state.pendingSeasonComplete ||= false;
  return state;
}


function completeHistoricalEvent(state, event, eventState) {
  if (state.completedEvents.some(e => e.eventId === event.id)) return state;
  const result = toEventResult(eventState, event);
  const userResult = result.results.find(r => r.teamId === state.userTeamId);
  const newStandings = updateStandings(state.standings, result);
  const idx = state.eventCalendar.findIndex(e => e.id === event.id);
  const inboxEntry = {
    id: `event_${event.id}`,
    type: "event_result",
    title: `${event.name} Complete`,
    summary: `Champion: ${result.champion?.teamName}${userResult ? ` | Your finish: #${userResult.placement}` : ""}`,
    champion: result.champion,
    userPlacement: userResult?.placement,
    userProPoints: userResult?.proPointsAwarded || 0,
    timestamp: Date.now(),
  };
  const newCompletedIds = [...(state.completedEventIds || [])];
  if (!newCompletedIds.includes(event.id)) newCompletedIds.push(event.id);
  const seasonComplete = idx + 1 >= state.eventCalendar.length;
  return addNotif({
    ...state,
    standings: newStandings,
    completedEvents: [...state.completedEvents, result],
    completedEventIds: newCompletedIds,
    currentEventIndex: Math.max(state.currentEventIndex, idx + 1),
    currentEventId: state.eventCalendar[Math.max(state.currentEventIndex, idx + 1)]?.id || null,
    pendingSeasonComplete: seasonComplete,
    activeEventId: event.id,
    inboxEvents: [...(state.inboxEvents || []), inboxEntry],
  }, `${result.champion?.teamName} win ${event.name}!${userResult ? ` You placed #${userResult.placement}.` : ""}`);
}

function simulateHistoricalEventAction(state, mode) {
  const eventId = state.activeEventId || state.eventCalendar[state.currentEventIndex]?.id;
  const event = state.eventCalendar.find(e => e.id === eventId);
  if (!event) return addNotif(state, "No active event to simulate.");
  let eventState = state.eventProgress?.[eventId] || createHistoricalEventState(event, state.teams, state.players, state.standings, state.userTeamId, Date.now());
  if (eventState.status === "completed") return completeHistoricalEvent({ ...state, eventProgress: { ...(state.eventProgress || {}), [eventId]: eventState } }, event, eventState);

  if (mode === "user") {
    const userMatch = getUserPendingMatch(eventState, state.userTeamId);
    if (!userMatch) {
      const userStatus = eventState.teamStates?.[state.userTeamId];
      return addNotif({ ...state, activeEventId: eventId, eventProgress: { ...(state.eventProgress || {}), [eventId]: eventState } }, userStatus?.eliminated ? "Your team has been eliminated from this event." : "Waiting for other matches to finish.");
    }
    eventState = simulateMatch(eventState, userMatch.id, event, state.userTeamId);
  } else if (mode === "round") {
    const round = getNextPendingMatch(eventState)?.round;
    if (!round) return addNotif(state, "No pending matches in this event.");
    let ids = eventState.matches.filter(m => m.status === "pending" && m.round === round).map(m => m.id);
    for (const id of ids) eventState = simulateMatch(eventState, id, event, state.userTeamId);
  } else {
    const match = getNextPendingMatch(eventState);
    if (!match) return addNotif(state, "No pending matches in this event.");
    eventState = simulateMatch(eventState, match.id, event, state.userTeamId);
  }

  let nextState = { ...state, activeEventId: eventId, eventProgress: { ...(state.eventProgress || {}), [eventId]: eventState } };
  if (eventState.status === "completed") nextState = completeHistoricalEvent(nextState, event, eventState);
  return nextState;
}

function commitPlayedHistoricalMatch(state) {
  const live = state.liveHistoricalMatch;
  if (!live || live.status !== "completed") return addNotif(state, "Finish the live series before applying the match result.");
  const event = state.eventCalendar.find(e => e.id === live.eventId);
  const eventState = state.eventProgress?.[live.eventId];
  if (!event || !eventState) return addNotif(state, "Live match event was not found.");
  const nextEventState = applyPlayedMatchResult(eventState, live, event, state.userTeamId);
  const winner = live.winnerId === live.teamA.teamId ? live.teamA : live.teamB;
  const loser = live.winnerId === live.teamA.teamId ? live.teamB : live.teamA;
  const report = {
    id: `match_${live.matchId}_${Date.now()}`,
    type: "match_report",
    title: `Match Report: ${winner.teamName} beat ${loser.teamName} ${Math.max(live.scoreA, live.scoreB)}-${Math.min(live.scoreA, live.scoreB)} at ${event.name}`,
    summary: `${live.roundLabel}: ${winner.teamName} def. ${loser.teamName} ${Math.max(live.scoreA, live.scoreB)}-${Math.min(live.scoreA, live.scoreB)}`,
    timestamp: Date.now(),
  };
  let nextState = { ...state, liveHistoricalMatch: null, activeEventId: live.eventId, eventProgress: { ...(state.eventProgress || {}), [live.eventId]: nextEventState }, inboxEvents: [...(state.inboxEvents || []), report] };
  if (nextEventState.status === "completed") nextState = completeHistoricalEvent(nextState, event, nextEventState);
  return addNotif(nextState, report.title);
}


function archiveCurrentSeason(state) {
  const sorted = getSortedStandings(state.standings || {});
  const userStanding = sorted.find(s => s.teamId === state.userTeamId);
  const userResults = (state.completedEvents || []).map(ev => ev.results?.find(r => r.teamId === state.userTeamId)).filter(Boolean);
  const bestFinish = userResults.length ? Math.min(...userResults.map(r => r.placement)) : null;
  const rosterSnapshot = (state.players || []).filter(p => p.teamId === state.userTeamId).map(p => ({ id: p.id, name: p.name, overall: p.overall, primary: p.primary }));
  const archive = {
    eraId: state.currentEraId,
    gameTitle: state.currentGameTitle,
    seasonLabel: state.seasonLabel,
    standings: sorted,
    eventResults: state.completedEvents || [],
    eventWinners: (state.completedEvents || []).map(ev => ({ eventId: ev.eventId, eventName: ev.eventName, champion: ev.champion })),
    userTeamId: state.userTeamId,
    userProPoints: userStanding?.proPoints || 0,
    userEventWins: userStanding?.eventWins || 0,
    userBestFinish: bestFinish,
    userRoster: rosterSnapshot,
    archivedAt: Date.now(),
  };
  return {
    ...state,
    seasonHistory: [...(state.seasonHistory || []), archive],
    archivedStandings: { ...(state.archivedStandings || {}), [state.currentEraId]: sorted },
    archivedEventResults: { ...(state.archivedEventResults || {}), [state.currentEraId]: state.completedEvents || [] },
  };
}

export function buildAdvancedWarfareTransition(state) {
  const fromEraId = state.currentEraId || "ghosts";
  const nextEra = getEra("advanced_warfare");
  const userRosterIds = new Set((state.players || []).filter(p => p.teamId === state.userTeamId).map(p => p.id));
  const userTeamExists = AW_TEAMS.some(t => t.id === state.userTeamId);
  const userTeamId = userTeamExists ? state.userTeamId : AW_TEAMS[0]?.id;
  const oldTeamIds = new Set((state.teams || []).map(t => t.id));
  const awTeamIds = new Set(AW_TEAMS.map(t => t.id));
  const newTeams = AW_TEAMS.filter(t => !oldTeamIds.has(t.id));
  const departedTeams = (state.teams || []).filter(t => !awTeamIds.has(t.id));
  const playersByName = new Map((state.players || []).map(p => [String(p.name).toLowerCase(), { ...p }]));
  const majorRosterChanges = [];
  for (const rowPlayer of AW_PLAYERS) {
    const key = String(rowPlayer.name).toLowerCase();
    const existing = playersByName.get(key);
    if (!existing) {
      const protectedTarget = userTeamExists && rowPlayer.teamId === userTeamId;
      playersByName.set(key, { ...rowPlayer, teamId: protectedTarget ? null : rowPlayer.teamId, debutEraId: "advanced_warfare", firstActiveSeason: nextEra.seasonLabel, currentStatus: protectedTarget ? "freeAgent" : "active", status: protectedTarget ? "freeAgent" : "active", historicalTargetTeamId: protectedTarget ? rowPlayer.teamId : undefined });
      continue;
    }
    if (userRosterIds.has(existing.id)) {
      playersByName.set(key, { ...existing, ...rowPlayer, id: existing.id, teamId: userTeamId, previousTeamId: existing.teamId, currentStatus: "active", status: "active", contractYears: Math.max(existing.contractYears || 0, 1) });
      continue;
    }
    if (existing.teamId !== rowPlayer.teamId) {
      majorRosterChanges.push(`${existing.name}: ${existing.teamId || "Free Agent"} → ${rowPlayer.teamId}`);
      const protectedTarget = userTeamExists && rowPlayer.teamId === userTeamId;
      playersByName.set(key, { ...existing, ...rowPlayer, id: existing.id, previousTeamId: existing.teamId, teamId: protectedTarget ? null : rowPlayer.teamId, historicalTargetTeamId: protectedTarget ? rowPlayer.teamId : undefined, eraId: rowPlayer.eraId || existing.eraId, currentStatus: protectedTarget ? "freeAgent" : "active", status: protectedTarget ? "freeAgent" : "active", contractYears: protectedTarget ? 0 : Math.max(existing.contractYears || 0, 1) });
    }
  }
  const awNames = new Set(AW_PLAYERS.map(p => String(p.name).toLowerCase()));
  const activeTeamIds = new Set(AW_TEAMS.map(t => t.id));
  const players = [...playersByName.values()].map(p => {
    if (userRosterIds.has(p.id)) return { ...p, teamId: userTeamId, currentStatus: "active", status: "active" };
    if (p.teamId && !activeTeamIds.has(p.teamId)) return { ...p, previousTeamId: p.teamId, teamId: null, currentStatus: "freeAgent", status: "freeAgent", contractYears: 0 };
    if (!awNames.has(String(p.name).toLowerCase()) && p.debutEraId && p.debutEraId !== "ghosts" && p.debutEraId !== "advanced_warfare") return { ...p, teamId: null, currentStatus: "inactive", status: "inactive" };
    return { ...p, currentStatus: p.teamId ? "active" : "freeAgent", status: p.teamId ? "active" : "freeAgent" };
  });
  const freeAgents = players.filter(p => !p.teamId && p.currentStatus !== "inactive" && ["ghosts", "advanced_warfare", undefined].includes(p.debutEraId || p.eraId));
  const teams = AW_TEAMS.map(t => ({ ...t }));
  const historicalTeamRegistry = { ...(state.historicalTeamRegistry || {}) };
  for (const team of state.teams || []) historicalTeamRegistry[team.id] ||= { ...team, activeEraIds: [fromEraId] };
  for (const team of AW_TEAMS) historicalTeamRegistry[team.id] = { ...(historicalTeamRegistry[team.id] || team), ...team, activeEraIds: [...new Set([...(historicalTeamRegistry[team.id]?.activeEraIds || []), "advanced_warfare"])] };
  const playerRegistry = Object.fromEntries(players.map(p => [p.id, { ...p, debutEraId: p.debutEraId || p.eraId || (awNames.has(String(p.name).toLowerCase()) ? "advanced_warfare" : "ghosts"), firstActiveSeason: p.firstActiveSeason || (p.debutEraId === "advanced_warfare" ? nextEra.seasonLabel : "2013/14"), currentStatus: p.currentStatus, currentTeamId: p.teamId || null }]));
  const summary = {
    fromEraId,
    toEraId: "advanced_warfare",
    title: "Welcome to Call of Duty: Advanced Warfare",
    newTeams: newTeams.map(t => t.name),
    departedTeams: departedTeams.map(t => t.name),
    majorRosterChanges: majorRosterChanges.slice(0, 16),
    newPlayers: getNewAWEntrants(),
    movedToFreeAgency: freeAgents.filter(p => p.previousTeamId).map(p => p.name).slice(0, 20),
    userTeamStatus: userTeamExists ? "preserved" : "requires_team_selection",
    previousUserTeamId: state.userTeamId,
    userTeamId,
    userRosterProtected: true,
  };
  return {
    ...state,
    currentEraId: "advanced_warfare",
    currentGameTitle: nextEra.gameTitle,
    seasonLabel: nextEra.seasonLabel,
    currentSeasonLabel: nextEra.seasonLabel,
    currentSeasonIndex: (state.currentSeasonIndex || 0) + 1,
    completedEraIds: [...new Set([...(state.completedEraIds || []), fromEraId])],
    userTeamId,
    teams,
    activeTeams: teams.map(t => t.id),
    inactiveTeams: departedTeams.map(t => t.id),
    historicalTeamRegistry,
    players,
    playerRegistry,
    freeAgents,
    eventCalendar: ADVANCED_WARFARE_EVENTS.map(e => ({ ...e, teamCount: teams.length })),
    completedEvents: [],
    completedEventIds: [],
    eventProgress: {},
    activeEventId: null,
    currentEventId: ADVANCED_WARFARE_EVENTS[0]?.id || null,
    currentEventIndex: 0,
    standings: createInitialStandings(teams),
    liveHistoricalMatch: null,
    pendingSeasonComplete: false,
    transitionSummary: summary,
  };
}

export function dynastyReducer(state, action) {
  switch (action.type) {
    case "NEW_GAME":
      return createNewGame(action.teamId);

    case "LOAD_GAME":
      return isValidDynastyState(action.state) ? migrateState(action.state) : null;

    case "RESET":
      return null;

    case "CLEAR_NOTIF":
      return { ...state, notifications: [] };

    case "ADVANCE_TO_ADVANCED_WARFARE": {
      if (!state || state.currentEraId !== "ghosts") return state;
      if ((state.completedEventIds || []).length < (state.eventCalendar || []).length) return addNotif(state, "Complete the Ghosts season before advancing eras.");
      const archived = archiveCurrentSeason(state);
      return addNotif(buildAdvancedWarfareTransition(archived), "Advanced Warfare 2014/15 is ready.");
    }

    case "ACK_TRANSITION_SUMMARY":
      return state ? { ...state, transitionSummary: null } : state;


    case "OPEN_EVENT": {
      if (!state) return state;
      const eventId = action.eventId || state.eventCalendar[state.currentEventIndex]?.id;
      const event = state.eventCalendar.find(e => e.id === eventId);
      if (!event) return addNotif(state, "Event not found.");
      const idx = state.eventCalendar.findIndex(e => e.id === eventId);
      const status = getEventStatus(state, eventId);
      if (status === "locked") return addNotif(state, `${event.name} is not yet available. Complete earlier events first.`);
      if (state.eventProgress?.[eventId]) return { ...state, activeEventId: eventId };
      const seed = Date.now() ^ ((idx + 1) * 7919);
      const eventState = createHistoricalEventState(event, state.teams, state.players, state.standings, state.userTeamId, seed);
      return { ...state, activeEventId: eventId, eventProgress: { ...(state.eventProgress || {}), [eventId]: eventState } };
    }


    case "START_PLAY_MATCH": {
      if (!state) return state;
      const eventId = state.activeEventId || state.eventCalendar[state.currentEventIndex]?.id;
      const event = state.eventCalendar.find(e => e.id === eventId);
      const eventState = state.eventProgress?.[eventId];
      if (!event || !eventState) return addNotif(state, "Open an event before playing a match.");
      const userMatch = getUserPendingMatch(eventState, state.userTeamId);
      if (!userMatch) return addNotif(state, eventState.teamStates?.[state.userTeamId]?.eliminated ? "Your team has been eliminated from this event." : "Waiting for other event matches to finish.");
      const live = createHistoricalLiveMatch(eventState, userMatch.id, state.players, getEra(state.currentEraId), Date.now());
      return { ...state, liveHistoricalMatch: live };
    }

    case "PLAY_HISTORICAL_MAP": {
      if (!state?.liveHistoricalMatch) return state;
      return { ...state, liveHistoricalMatch: playHistoricalLiveMap(state.liveHistoricalMatch, state.players, getEra(state.currentEraId)) };
    }

    case "ADVANCE_HISTORICAL_MAP": {
      if (!state?.liveHistoricalMatch) return state;
      return { ...state, liveHistoricalMatch: advanceHistoricalLiveMap(state.liveHistoricalMatch) };
    }

    case "CANCEL_PLAY_MATCH":
      return state?.liveHistoricalMatch?.mapResults?.length ? addNotif(state, "Cannot back out after maps have been played.") : { ...state, liveHistoricalMatch: null };

    case "FINISH_PLAY_MATCH":
      if (!state) return state;
      return commitPlayedHistoricalMatch(state);

    case "SIM_NEXT_MATCH": {
      if (!state) return state;
      return simulateHistoricalEventAction(state, "next");
    }

    case "SIM_USER_MATCH": {
      if (!state) return state;
      return simulateHistoricalEventAction(state, "user");
    }

    case "SIM_ROUND": {
      if (!state) return state;
      return simulateHistoricalEventAction(state, "round");
    }

    case "SIM_EVENT": {
      if (!state) return state;
      if (state.activeEventId || state.eventCalendar[state.currentEventIndex]) {
        let nextState = state;
        const eventId = state.activeEventId || state.eventCalendar[state.currentEventIndex]?.id;
        if (eventId && !nextState.eventProgress?.[eventId]) {
          nextState = dynastyReducer(nextState, { type: "OPEN_EVENT", eventId });
        }
        while (nextState.eventProgress?.[eventId]?.status !== "completed") {
          const before = nextState.eventProgress?.[eventId]?.matches?.filter(m => m.status === "completed").length || 0;
          nextState = simulateHistoricalEventAction(nextState, "next");
          const after = nextState.eventProgress?.[eventId]?.matches?.filter(m => m.status === "completed").length || 0;
          if (after === before) break;
        }
        return nextState;
      }
      const idx = state.currentEventIndex;
      if (idx >= state.eventCalendar.length) return addNotif(state, "All events for this season have been completed.");
      const event = state.eventCalendar[idx];
      const seed = Date.now() ^ (idx * 7919);
      const result = simulateEvent(event, state.teams, state.players, state.standings, seed);
      const userResult = result.results.find(r => r.teamId === state.userTeamId);
      const newStandings = updateStandings(state.standings, result);
      const inboxEntry = {
        id: `event_${event.id}`,
        type: "event_result",
        title: `${event.name} Complete`,
        summary: `Champion: ${result.champion.teamName}${userResult ? ` | Your finish: #${userResult.placement}` : ""}`,
        champion: result.champion,
        userPlacement: userResult?.placement,
        userProPoints: userResult?.proPointsAwarded || 0,
        timestamp: Date.now(),
      };
      const newCompletedIds = [...(state.completedEventIds || [])];
      if (!newCompletedIds.includes(event.id)) newCompletedIds.push(event.id);
      return addNotif({
        ...state,
        standings: newStandings,
        completedEvents: [...state.completedEvents, result],
        completedEventIds: newCompletedIds,
        currentEventIndex: idx + 1,
        currentEventId: state.eventCalendar[idx + 1]?.id || null,
        pendingSeasonComplete: idx + 1 >= state.eventCalendar.length,
        inboxEvents: [...(state.inboxEvents || []), inboxEntry],
      }, `${result.champion.teamName} win ${event.name}!${userResult ? ` You placed #${userResult.placement}.` : ""}`);
    }

    case "SIGN_PLAYER": {
      if (!state) return state;
      const { playerId } = action;
      const player = state.players.find(p => p.id === playerId) || state.freeAgents.find(p => p.id === playerId);
      if (!player) return addNotif(state, "Player not found.");
      if (player.teamId === state.userTeamId) return addNotif(state, `${player.name} is already on your roster.`);
      if (player.teamId) return addNotif(state, `${player.name} is not available.`);
      const rosterCount = state.players.filter(p => p.teamId === state.userTeamId).length;
      if (rosterCount >= 4) return addNotif(state, "Roster is full (4/4). Release a player first.");
      return addNotif({
        ...state,
        players: state.players.map(p =>
          p.id === playerId ? { ...p, teamId: state.userTeamId } : p
        ),
        freeAgents: state.freeAgents.filter(p => p.id !== playerId),
      }, `${player.name} signed!`);
    }

    case "RELEASE_PLAYER": {
      if (!state) return state;
      const { playerId } = action;
      const player = state.players.find(p => p.id === playerId);
      if (!player || player.teamId !== state.userTeamId) return addNotif(state, "Cannot release this player.");
      return addNotif({
        ...state,
        players: state.players.map(p =>
          p.id === playerId ? { ...p, teamId: null } : p
        ),
        freeAgents: [...state.freeAgents, { ...player, teamId: null }],
      }, `${player.name} released.`);
    }

    default:
      return state;
  }
}

const DynastyContext = createContext(null);

export function DynastyProvider({ children }) {
  const [state, dispatch] = useReducer(dynastyReducer, null);
  return (
    <DynastyContext.Provider value={{ state, dispatch }}>
      {children}
    </DynastyContext.Provider>
  );
}

export function useDynasty() {
  const ctx = useContext(DynastyContext);
  if (!ctx) throw new Error("useDynasty must be used inside DynastyProvider");
  return ctx;
}
