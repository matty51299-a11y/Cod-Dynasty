// src/App.jsx
// Root application component.
// Handles: save/load lifecycle, navigation, notifications.

import { useEffect, useState } from "react";
import { useGame, saveGame, loadGame, deleteSave } from "./store/gameStore.jsx";
import TeamSelect from "./components/TeamSelect.jsx";
import Dashboard from "./components/Dashboard.jsx";
import Standings from "./components/Standings.jsx";
import Roster from "./components/Roster.jsx";
import FreeAgency from "./components/FreeAgency.jsx";
import Prospects from "./components/Prospects.jsx";
import MatchLog from "./components/MatchLog.jsx";
import MajorBracket from "./components/MajorBracket.jsx";
import OffseasonReport from "./components/OffseasonReport.jsx";
import { CDL_TEAMS } from "./data/teams.js";

const TABS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "standings", label: "Standings" },
  { id: "major",     label: "Major" },
  { id: "roster",    label: "Roster" },
  { id: "fa",        label: "Free Agency" },
  { id: "prospects", label: "Challengers" },
  { id: "devreport", label: "Dev Report" },
  { id: "log",       label: "Match Log" },
];

export default function App() {
  const { state, dispatch } = useGame();
  const [tab, setTab] = useState("dashboard");
  const [confirmNew, setConfirmNew] = useState(false);

  // On mount: auto-load a save if one exists
  useEffect(() => {
    const saved = loadGame();
    if (saved) {
      dispatch({ type: "LOAD_GAME", state: saved });
    }
  }, []);

  // Auto-save whenever state changes
  useEffect(() => {
    if (state) saveGame(state);
  }, [state]);

  // Notifications: auto-dismiss after 3.5s
  useEffect(() => {
    if (state?.notifications?.length > 0) {
      const t = setTimeout(() => dispatch({ type: "CLEAR_NOTIF" }), 3500);
      return () => clearTimeout(t);
    }
  }, [state?.notifications]);

  // No save loaded yet → show team select
  if (!state) {
    return (
      <div className="app">
        <TeamSelect />
      </div>
    );
  }

  const team = CDL_TEAMS.find(t => t.id === state.userTeamId);
  const notification = state.notifications?.[0];

  function handleNewGame() {
    deleteSave();
    dispatch({ type: "LOAD_GAME", state: null });
    setConfirmNew(false);
  }

  return (
    <div className="app">
      {/* Top bar */}
      <header className="topbar">
        <div className="topbar-left">
          <span className="app-title">CDL MANAGER</span>
          <span className="season-badge">S{state.season}</span>
          {team && (
            <span className="user-team-badge" style={{ color: team.color }}>
              {team.tag}
            </span>
          )}
        </div>
        <div className="topbar-right">
          {!confirmNew ? (
            <button className="btn-new-game" onClick={() => setConfirmNew(true)}>
              New Game
            </button>
          ) : (
            <span className="confirm-row">
              <span className="confirm-text">Erase save?</span>
              <button className="btn-danger-sm" onClick={handleNewGame}>Yes</button>
              <button className="btn-secondary-sm" onClick={() => setConfirmNew(false)}>Cancel</button>
            </span>
          )}
        </div>
      </header>

      {/* Notification toast */}
      {notification && (
        <div className="toast">{notification}</div>
      )}

      {/* Navigation tabs */}
      <nav className="nav-tabs">
        {TABS.map(t => {
          // Add a live indicator dot on the Major tab when a major is active
          const isMajorLive = t.id === "major" && state.schedule?.phase === "major";
          const hasDevData  = t.id === "devreport" && state.progressionLog?.length > 0;
          return (
            <button
              key={t.id}
              className={`nav-tab ${tab === t.id ? "active" : ""}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
              {isMajorLive && <span className="tab-live-dot" />}
              {hasDevData   && <span className="tab-dev-dot" />}
            </button>
          );
        })}
      </nav>

      {/* Page content */}
      <main className="main-content">
        {tab === "dashboard" && <Dashboard />}
        {tab === "standings" && <Standings />}
        {tab === "major"     && <MajorBracket />}
        {tab === "roster"    && <Roster />}
        {tab === "fa"        && <FreeAgency />}
        {tab === "prospects" && <Prospects />}
        {tab === "devreport" && <OffseasonReport />}
        {tab === "log"       && <MatchLog />}
      </main>
    </div>
  );
}
