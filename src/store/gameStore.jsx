// src/store/gameStore.jsx
// Central game state manager using React Context + useReducer.
// Handles: new game, load/save (localStorage), all sim actions.

import { createContext, useContext, useReducer } from "react";
import { buildInitialRoster } from "../data/players.js";
import { generateProspects } from "../data/prospects.js";
import { buildSeason, simNextMatch, simMatchday, simUserMatchday, simStage, simMajor, simNextMajorMatch, simMajorRound, advanceOffseason, beginChamps, enterContractPhase } from "../engine/seasonEngine.js";
import { getSigningCost, getTeamCap } from "../engine/rosterAI.js";

const SAVE_KEY = "cdl_manager_save";

// ── Initial state factory ─────────────────────────────────────────────────────
function newGameState(userTeamId) {
  const players = buildInitialRoster();
  const prospects = generateProspects(Date.now() % 999983);
  return {
    userTeamId,
    season: 1,
    players,      // all pro players + any signed prospects (Roster reads from here)
    prospects,    // unsigned challengers pool only
    schedule: buildSeason(1),
    notifications: [],
    saveExists: true,
    enteredMajorIdx:   null,  // tracks which major the user has "entered" past the intro gate
    playerSeasonStats: {},    // { [playerId]: [{ season, kills, deaths, matches }, ...] }
    challengersLog:    [],    // per-season challengers pool snapshots (for Pool Health panel)
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

    case "SIM_USER_MATCHDAY":
      return simUserMatchday({ ...state });

    case "SIM_STAGE":
      return simStage({ ...state });

    case "SIM_MAJOR":
      return simMajor({ ...state });

    case "ENTER_MAJOR":
      return { ...state, enteredMajorIdx: action.majorIdx };

    case "DISMISS_MAJOR":
      return { ...state, enteredMajorIdx: null };

    case "BEGIN_CHAMPS":
      return beginChamps({ ...state });

    case "SIM_NEXT_MAJOR_MATCH":
      return simNextMajorMatch({ ...state });

    case "SIM_MAJOR_ROUND":
      return simMajorRound({ ...state });

    case "ENTER_CONTRACT_PHASE":
      return enterContractPhase({ ...state });

    case "ADVANCE_OFFSEASON":
      return { ...advanceOffseason({ ...state }), enteredMajorIdx: null };

    // ── RE-SIGN PLAYER ────────────────────────────────────────────────────────
    // Extends a player's contract during the contract review phase.
    // `years` is the NEW contractYears value (before the offseason decrement).
    case "RESIGN_PLAYER": {
      const { playerId, years } = action;
      return {
        ...state,
        players: state.players.map(p =>
          p.id === playerId ? { ...p, contractYears: years } : p
        ),
      };
    }

    // ── SIGN PLAYER ───────────────────────────────────────────────────────────
    // Prospects live in state.prospects; pros live in state.players.
    // Roster.jsx reads ONLY from state.players, so signed prospects must be
    // moved (not just updated) into state.players.
    case "SIGN_PLAYER": {
      const { playerId, slotType } = action;
      const userTeam = state.userTeamId;
      const rosterNow = state.players.filter(p => p.teamId === userTeam);

      if (slotType === "starter" && rosterNow.filter(p => !p.isSub).length >= 4) {
        return addNotif(state, "Starter roster is full (4/4). Release a player first.");
      }
      if (slotType === "sub" && rosterNow.filter(p => p.isSub).length >= 1) {
        return addNotif(state, "Sub slot is full (1/1). Release your sub first.");
      }

      // ── Hard budget check (starters only — subs do not count against cap) ──
      if (slotType === "starter") {
        const target = state.prospects.find(p => p.id === playerId)
                    || state.players.find(p => p.id === playerId);
        if (target) {
          const cap       = getTeamCap(userTeam);
          const committed = rosterNow
            .filter(p => !p.isSub)
            .reduce((s, p) => s + getSigningCost(p), 0);
          const cost  = getSigningCost(target);
          const over  = committed + cost - cap;
          if (over > 0) {
            return addNotif(state, `Over budget — signing ${target.name} would exceed your cap by $${(over / 1000).toFixed(0)}k.`);
          }
        }
      }

      const prospect = state.prospects.find(p => p.id === playerId);

      if (prospect) {
        // Move prospect out of prospects array, into players array
        const signed = { ...prospect, teamId: userTeam, isSub: slotType === "sub", scouted: true, contractYears: 2 };
        return addNotif({
          ...state,
          players: [...state.players, signed],
          prospects: state.prospects.filter(p => p.id !== playerId),
        }, `${signed.name} signed!`);
      }

      // Pro free agent already in players — just update teamId; give fresh 2-year deal
      const target = state.players.find(p => p.id === playerId);
      if (!target) return addNotif(state, "Player not found.");

      return addNotif({
        ...state,
        players: state.players.map(p =>
          p.id === playerId ? { ...p, teamId: userTeam, isSub: slotType === "sub", scouted: true, contractYears: 2 } : p
        ),
      }, `${target.name} signed!`);
    }

    // ── RELEASE PLAYER ────────────────────────────────────────────────────────
    // Prospects go back to prospects pool; pros stay in players with teamId null.
    case "RELEASE_PLAYER": {
      const player = state.players.find(p => p.id === action.playerId);
      if (!player) return state;

      if (player.isProspect) {
        const released = { ...player, teamId: null, isSub: false };
        return addNotif({
          ...state,
          players: state.players.filter(p => p.id !== action.playerId),
          prospects: [...state.prospects, released],
        }, `${player.name} released.`);
      }

      return addNotif({
        ...state,
        players: state.players.map(p =>
          p.id === action.playerId ? { ...p, teamId: null, isSub: false } : p
        ),
      }, `${player.name} released.`);
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
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function deleteSave() {
  localStorage.removeItem(SAVE_KEY);
}
