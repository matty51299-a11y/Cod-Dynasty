import { createContext, useContext, useReducer } from "react";
import { GHOSTS_TEAMS, GHOSTS_PLAYERS } from "../data/historicalRosters.js";
import { GHOSTS_EVENTS } from "../data/ghostsEventCalendar.js";
import { getEra, HISTORICAL_START_ERA_ID } from "../data/codEras.js";
import { simulateEvent } from "../engine/eventSim.js";
import { createInitialStandings, updateStandings } from "../engine/standingsEngine.js";

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
    standings,
    currentEventIndex: 0,
    notifications: [],
    inboxEvents: [],
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

function dynastyReducer(state, action) {
  switch (action.type) {
    case "NEW_GAME":
      return createNewGame(action.teamId);

    case "LOAD_GAME":
      return isValidDynastyState(action.state) ? action.state : null;

    case "RESET":
      return null;

    case "CLEAR_NOTIF":
      return { ...state, notifications: [] };

    case "SIM_EVENT": {
      if (!state) return state;
      const idx = state.currentEventIndex;
      if (idx >= state.eventCalendar.length) {
        return addNotif(state, "All events for this season have been completed.");
      }
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
      return addNotif({
        ...state,
        standings: newStandings,
        completedEvents: [...state.completedEvents, result],
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
