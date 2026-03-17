// src/store/gameStore.jsx
// Central game state manager using React Context + useReducer.
// Handles: new game, load/save (localStorage), all sim actions.

import { createContext, useContext, useReducer } from "react";
import { buildInitialRoster } from "../data/players.js";
import { generateProspects } from "../data/prospects.js";
import { buildSeason, simNextMatch, simMatchday, simStage, simMajor, advanceOffseason } from "../engine/seasonEngine.js";
import { CDL_TEAMS } from "../data/teams.js";

const SAVE_KEY = "cdl_manager_save";

// ── Initial state factory ─────────────────────────────────────────────────────
function newGameState(userTeamId) {
  const players = buildInitialRoster();
  const prospects = generateProspects(Date.now() % 999983); // seeded but varied per new game
  return {
    userTeamId,
    season: 1,
    players,           // all pro players
    prospects,         // challengers pool
    schedule: buildSeason(1),
    notifications: [],
    saveExists: true,
  };
}

// ── Reducer ──────────────────────────────────────────────────────────────────
function reducer(state, action) {
  switch (action.type) {
    case "NEW_GAME":
      return newGameState(action.teamId);

    case "LOAD_GAME":
      return action.state;

    case "SIM_NEXT_MATCH":
      return simNextMatch({ ...state });

    case "SIM_MATCHDAY":
      return simMatchday({ ...state });

    case "SIM_STAGE":
      return simStage({ ...state });

    case "SIM_MAJOR":
      return simMajor({ ...state });

    case "ADVANCE_OFFSEASON":
      return advanceOffseason({ ...state });

    // Free agency: sign a prospect / free agent to user's team
    case "SIGN_PLAYER": {
      const { playerId, slotType } = action; // slotType: "starter" | "sub"
      const userTeam = state.userTeamId;
      const currentRoster = state.players.filter(p => p.teamId === userTeam);

      // Max 4 starters + 1 sub
      if (slotType === "starter" && currentRoster.filter(p => !p.isSub).length >= 4) {
        return addNotif(state, "Starter roster is full (4/4). Release a player first.");
      }
      if (slotType === "sub" && currentRoster.filter(p => p.isSub).length >= 1) {
        return addNotif(state, "Sub slot is full (1/1). Release your sub first.");
      }

      const players = state.players.map(p =>
        p.id === playerId ? { ...p, teamId: userTeam, isSub: slotType === "sub", scouted: true } : p
      );
      const prospects = state.prospects.map(p =>
        p.id === playerId ? { ...p, teamId: userTeam, isSub: slotType === "sub", scouted: true } : p
      );
      return addNotif({ ...state, players, prospects }, "Player signed successfully.");
    }

    // Release a player from user's team back to free agency
    case "RELEASE_PLAYER": {
      const players = state.players.map(p =>
        p.id === action.playerId ? { ...p, teamId: null, isSub: false } : p
      );
      const prospects = state.prospects.map(p =>
        p.id === action.playerId ? { ...p, teamId: null, isSub: false } : p
      );
      return addNotif({ ...state, players, prospects }, "Player released.");
    }

    case "CLEAR_NOTIF":
      return { ...state, notifications: state.notifications.slice(1) };

    default:
      return state;
  }
}

function addNotif(state, msg) {
  return { ...state, notifications: [...state.notifications, msg] };
}

// ── Context ───────────────────────────────────────────────────────────────────
const GameContext = createContext(null);

export function GameProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, null);

  // Save to localStorage after every action
  function wrappedDispatch(action) {
    dispatch(action);
    // Save will happen via effect in App.jsx
  }

  return (
    <GameContext.Provider value={{ state, dispatch: wrappedDispatch }}>
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
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function deleteSave() {
  localStorage.removeItem(SAVE_KEY);
}
