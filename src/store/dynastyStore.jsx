import { createContext, useContext, useReducer } from "react";
import { GHOSTS_TEAMS, GHOSTS_PLAYERS } from "../data/historicalRosters.js";
import { GHOSTS_EVENTS } from "../data/ghostsEventCalendar.js";
import { getEra, HISTORICAL_START_ERA_ID } from "../data/codEras.js";
import { simulateEvent } from "../engine/eventSim.js";
import { createInitialStandings, updateStandings } from "../engine/standingsEngine.js";
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

function createNewGame(userTeamId) {
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
    userTeamId,
    teams,
    players,
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
  return addNotif({
    ...state,
    standings: newStandings,
    completedEvents: [...state.completedEvents, result],
    completedEventIds: newCompletedIds,
    currentEventIndex: Math.max(state.currentEventIndex, idx + 1),
    activeEventId: null,
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

function dynastyReducer(state, action) {
  switch (action.type) {
    case "NEW_GAME":
      return createNewGame(action.teamId);

    case "LOAD_GAME":
      return isValidDynastyState(action.state) ? migrateState(action.state) : null;

    case "RESET":
      return null;

    case "CLEAR_NOTIF":
      return { ...state, notifications: [] };


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
