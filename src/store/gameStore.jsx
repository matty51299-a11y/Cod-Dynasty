// src/store/gameStore.jsx
// Central game state manager using React Context + useReducer.
// Handles: new game, load/save (localStorage), all sim actions.

import { createContext, useContext, useReducer } from "react";
import { buildInitialRoster } from "../data/players.js";
import { generateProspects } from "../data/prospects.js";
import { buildSeason, simNextMatch, simMatchday, simUserMatchday, simStage, simMajor, simNextMajorMatch, simMajorRound, advanceOffseason, beginChamps, enterContractPhase } from "../engine/seasonEngine.js";
import { getSigningCost, getTeamCap } from "../engine/rosterAI.js";
import { CDL_TEAMS } from "../data/teams.js";

const SAVE_KEY  = "cdl_manager_save";
const FEED_CAP  = 100;

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

// ── K/D leader from matchLog ──────────────────────────────────────────────────
function computeKDLeader(matchLog) {
  const stats = {};
  for (const m of matchLog) {
    if (!m.playerStats) continue;
    for (const [, ps] of Object.entries(m.playerStats)) {
      if (!ps.name) continue;
      const key = ps.name;
      if (!stats[key]) stats[key] = { kills: 0, deaths: 0, matches: 0 };
      stats[key].kills   += ps.kills  ?? 0;
      stats[key].deaths  += ps.deaths ?? 0;
      stats[key].matches += 1;
    }
  }
  let bestName = null, bestKD = 0;
  for (const [name, s] of Object.entries(stats)) {
    if (s.matches < 5) continue;
    const kd = s.deaths > 0 ? s.kills / s.deaths : s.kills;
    if (kd > bestKD) { bestKD = kd; bestName = name; }
  }
  return bestName ? { name: bestName, kd: bestKD } : null;
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

// ── Major completion feed ─────────────────────────────────────────────────────
// `wasCompleted` captured as boolean before sim — immune to mutation.
function detectMajorFeed(wasCompleted, newState, majorIdx) {
  if (wasCompleted) return [];
  const major = newState.schedule?.majors?.[majorIdx];
  if (!major?.completed) return [];

  const season  = newState.schedule?.season ?? newState.season ?? 1;
  const champId = major.bracket?.champion;
  if (!champId) return [];

  const champTag  = CDL_TEAMS.find(t => t.id === champId)?.tag ?? champId;
  const items = [];

  if (majorIdx === 4) {
    items.push(mkFeed("champs_champ", `${champTag} are World Champions!`, season, "major"));
  } else {
    items.push(mkFeed("major_champ",  `${champTag} win ${major.name}`,    season, "major"));
  }

  // QF eliminations
  const qf = major.bracket?.rounds?.[0];
  if (qf?.matches) {
    for (const m of qf.matches) {
      if (m.result?.loserId) {
        const tag = CDL_TEAMS.find(t => t.id === m.result.loserId)?.tag ?? m.result.loserId;
        items.push(mkFeed("major_elim", `${tag} out in Quarterfinals`, season, "major"));
      }
    }
  }

  // K/D leader after each major
  const leader = computeKDLeader(newState.schedule?.matchLog ?? []);
  if (leader) {
    items.push(mkFeed("kd_leader",
      `${leader.name} leads the league at ${leader.kd.toFixed(2)} K/D`, season, "major"));
  }

  return items;
}

// ── Initial state factory ─────────────────────────────────────────────────────
function newGameState(userTeamId) {
  const players  = buildInitialRoster();
  const prospects = generateProspects(Date.now() % 999983);
  return {
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
  };
}

// ── Reducer ──────────────────────────────────────────────────────────────────
function reducer(state, action) {
  switch (action.type) {

    case "NEW_GAME":
      return newGameState(action.teamId);

    case "LOAD_GAME":
      // Backfill `feed` for saves that predate this feature
      return { ...action.state, feed: action.state?.feed ?? [] };

    // ── Stage sims — detect streaks + standings changes ────────────────────
    case "SIM_NEXT_MATCH": {
      const prevLogLen = state.schedule?.matchLog?.length ?? 0;
      const prevRank   = teamRank(state.schedule?.standings ?? {}, state.userTeamId);
      const season     = state.season;
      const newState   = simNextMatch({ ...state });
      return pushFeed(newState, [
        ...detectStreakFeed(newState.schedule?.matchLog ?? [], prevLogLen, season),
        ...detectStandingsFeed(prevRank, newState.schedule?.standings ?? {}, state.userTeamId, season, newState.schedule?.phase),
      ]);
    }

    case "SIM_MATCHDAY": {
      const prevLogLen = state.schedule?.matchLog?.length ?? 0;
      const prevRank   = teamRank(state.schedule?.standings ?? {}, state.userTeamId);
      const season     = state.season;
      const newState   = simMatchday({ ...state });
      return pushFeed(newState, [
        ...detectStreakFeed(newState.schedule?.matchLog ?? [], prevLogLen, season),
        ...detectStandingsFeed(prevRank, newState.schedule?.standings ?? {}, state.userTeamId, season, newState.schedule?.phase),
      ]);
    }

    case "SIM_USER_MATCHDAY": {
      const prevLogLen = state.schedule?.matchLog?.length ?? 0;
      const prevRank   = teamRank(state.schedule?.standings ?? {}, state.userTeamId);
      const season     = state.season;
      const newState   = simUserMatchday({ ...state });
      return pushFeed(newState, [
        ...detectStreakFeed(newState.schedule?.matchLog ?? [], prevLogLen, season),
        ...detectStandingsFeed(prevRank, newState.schedule?.standings ?? {}, state.userTeamId, season, newState.schedule?.phase),
      ]);
    }

    case "SIM_STAGE": {
      const prevLogLen = state.schedule?.matchLog?.length ?? 0;
      const prevRank   = teamRank(state.schedule?.standings ?? {}, state.userTeamId);
      const season     = state.season;
      const newState   = simStage({ ...state });
      return pushFeed(newState, [
        ...detectStreakFeed(newState.schedule?.matchLog ?? [], prevLogLen, season),
        ...detectStandingsFeed(prevRank, newState.schedule?.standings ?? {}, state.userTeamId, season, newState.schedule?.phase),
      ]);
    }

    // ── Major sims — detect champion + eliminations + K/D leader ──────────
    case "SIM_MAJOR": {
      const majorIdx     = state.schedule?.majorIdx;
      const wasCompleted = state.schedule?.majors?.[majorIdx]?.completed ?? true;
      const newState     = simMajor({ ...state });
      return pushFeed(newState, detectMajorFeed(wasCompleted, newState, majorIdx));
    }

    case "SIM_NEXT_MAJOR_MATCH": {
      const majorIdx     = state.schedule?.majorIdx;
      const wasCompleted = state.schedule?.majors?.[majorIdx]?.completed ?? true;
      const newState     = simNextMajorMatch({ ...state });
      return pushFeed(newState, detectMajorFeed(wasCompleted, newState, majorIdx));
    }

    case "SIM_MAJOR_ROUND": {
      const majorIdx     = state.schedule?.majorIdx;
      const wasCompleted = state.schedule?.majors?.[majorIdx]?.completed ?? true;
      const newState     = simMajorRound({ ...state });
      return pushFeed(newState, detectMajorFeed(wasCompleted, newState, majorIdx));
    }

    case "ENTER_MAJOR":
      return { ...state, enteredMajorIdx: action.majorIdx };

    case "DISMISS_MAJOR":
      return { ...state, enteredMajorIdx: null };

    case "BEGIN_CHAMPS":
      return beginChamps({ ...state });

    case "ENTER_CONTRACT_PHASE":
      return enterContractPhase({ ...state });

    // ── Offseason — retirements, prospect class, notable AI signings ───────
    case "ADVANCE_OFFSEASON": {
      const prevRetiredLen = state.retiredPlayers?.length ?? 0;
      const prevFreeIds    = new Set(
        (state.players ?? []).filter(p => !p.teamId).map(p => p.id)
      );
      const season = state.season; // outgoing season

      const advanced = advanceOffseason({ ...state });
      const newState = { ...advanced, enteredMajorIdx: null };

      const feedItems = [];

      // Pro retirements (skip prospect retirements — less visible)
      const newlyRetired = (newState.retiredPlayers ?? []).slice(prevRetiredLen);
      for (const r of newlyRetired) {
        if (!r.isProspect) {
          feedItems.push(mkFeed("retirement", `${r.name} retires at ${r.age}`, season, "offseason"));
        }
      }

      // Notable AI signings (80+ OVR free agents who found a new home)
      const aiSigned = (newState.players ?? []).filter(p =>
        p.teamId &&
        p.teamId !== state.userTeamId &&
        prevFreeIds.has(p.id) &&
        (p.overall ?? 0) >= 80
      );
      for (const p of aiSigned.slice(0, 3)) {
        const tag = CDL_TEAMS.find(t => t.id === p.teamId)?.tag ?? p.teamId;
        feedItems.push(mkFeed("signing", `${tag} sign ${p.name}`, season, "offseason"));
      }

      // Prospect class size
      const lastLog = newState.challengersLog?.slice(-1)[0];
      if (lastLog?.annualIntake > 0) {
        feedItems.push(mkFeed(
          "prospect_class",
          `Season ${newState.season} draft class: ${lastLog.annualIntake} new challengers`,
          season,
          "offseason"
        ));
      }

      return pushFeed(newState, feedItems);
    }

    // ── RE-SIGN PLAYER ────────────────────────────────────────────────────────
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
            .reduce((s, p) => s + getSigningCost(p), 0);
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

      const prospect = state.prospects.find(p => p.id === playerId);

      if (prospect) {
        const existingHistory = prospect.teamHistory || [];
        const historyUpdated  = existingHistory.some(e => e.season === state.season)
          ? existingHistory
          : [...existingHistory, { season: state.season, teamId: userTeam }];
        const signed = {
          ...prospect, teamId: userTeam, isSub: slotType === "sub",
          scouted: true, contractYears: 2, teamHistory: historyUpdated,
        };
        return pushFeed(
          addNotif({
            ...state,
            players:  [...state.players, signed],
            prospects: state.prospects.filter(p => p.id !== playerId),
          }, `${signed.name} signed!`),
          [mkFeed("signing", `${tag} sign ${signed.name}`, state.season, phase)]
        );
      }

      // Pro free agent
      const target = state.players.find(p => p.id === playerId);
      if (!target) return addNotif(state, "Player not found.");

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
              ...p, teamId: userTeam, isSub: slotType === "sub",
              scouted: true, contractYears: 2, teamHistory: historyUpdated,
            };
          }),
        }, `${target.name} signed!`),
        [mkFeed("signing", `${tag} sign ${target.name}`, state.season, phase)]
      );
    }

    // ── RELEASE PLAYER ────────────────────────────────────────────────────────
    case "RELEASE_PLAYER": {
      const player = state.players.find(p => p.id === action.playerId);
      if (!player) return state;

      const tag   = CDL_TEAMS.find(t => t.id === player.teamId)?.tag ?? player.teamId ?? "FA";
      const phase = state.schedule?.phase ?? "stage";
      const feedItem = mkFeed("release", `${tag} release ${player.name}`, state.season, phase);

      if (player.isProspect) {
        const released = { ...player, teamId: null, isSub: false };
        return pushFeed(
          addNotif({
            ...state,
            players:  state.players.filter(p => p.id !== action.playerId),
            prospects: [...state.prospects, released],
          }, `${player.name} released.`),
          [feedItem]
        );
      }

      return pushFeed(
        addNotif({
          ...state,
          players: state.players.map(p =>
            p.id === action.playerId ? { ...p, teamId: null, isSub: false } : p
          ),
        }, `${player.name} released.`),
        [feedItem]
      );
    }

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
