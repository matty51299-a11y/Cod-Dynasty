// src/App.jsx
// Root application component.
// Handles: save/load lifecycle, sidebar navigation, notifications, overlays.

import { useEffect, useState } from "react";
import { useGame, saveGame, loadGame, deleteSave } from "./store/gameStore.jsx";
import "./engine/poolReport.js"; // registers window.poolReport() console utility
import { TeamHubProvider }        from "./store/teamHubContext.jsx";
import { MatchCenterProvider }    from "./store/matchCenterContext.jsx";
import MatchCenterOverlay         from "./components/MatchCenterOverlay.jsx";
import TeamSelect        from "./components/TeamSelect.jsx";
import Sidebar           from "./components/Sidebar.jsx";
import NextMatchControl  from "./components/NextMatchControl.jsx";
import NextMatchOverlay  from "./components/NextMatchOverlay.jsx";
import Dashboard         from "./components/Dashboard.jsx";
import Standings         from "./components/Standings.jsx";
import Schedule          from "./components/Schedule.jsx";
import KDLeaders         from "./components/KDLeaders.jsx";
import Roster            from "./components/Roster.jsx";
import FreeAgency        from "./components/FreeAgency.jsx";
import Prospects         from "./components/Prospects.jsx";
import MatchLog          from "./components/MatchLog.jsx";
import MajorEntryOverlay    from "./components/MajorEntryOverlay.jsx";
import ChallengerQualifierOverlay from "./components/ChallengerQualifierOverlay.jsx";
import MajorTournamentOverlay from "./components/MajorTournamentOverlay.jsx";
import OffseasonReport   from "./components/OffseasonReport.jsx";
import TeamHubOverlay    from "./components/TeamHubOverlay.jsx";
import NotificationsFeed from "./components/NotificationsFeed.jsx";
import { CDL_TEAMS }     from "./data/teams.js";

export default function App() {
  const { state, dispatch } = useGame();
  const [screen, setScreen]           = useState("home");
  const [confirmNew, setConfirmNew]   = useState(false);
  const [showMatchOverlay, setShowMatchOverlay] = useState(false);
  const [showFeed, setShowFeed]       = useState(false);

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

  const team         = CDL_TEAMS.find(t => t.id === state.userTeamId);
  const notification = state.notifications?.[0];

  function handleNewGame() {
    deleteSave();
    dispatch({ type: "LOAD_GAME", state: null });
    setConfirmNew(false);
  }

  return (
    <MatchCenterProvider>
    <TeamHubProvider>
    <div className="app">
      {/* ── Top bar ── */}
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
          {/* Next Match launcher — opens NextMatchOverlay (no direct sim) */}
          <NextMatchControl onOpen={() => setShowMatchOverlay(true)} />

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

      {/* ── Notification toast ── */}
      {notification && (
        <div className="toast">{notification}</div>
      )}

      {/* ── App body: sidebar + main ── */}
      <div className="app-body">
        <Sidebar screen={screen} setScreen={setScreen} onOpenFeed={() => setShowFeed(true)} />

        {/* Event overlays — sit above sidebar + main content */}
        <NextMatchOverlay
          isOpen={showMatchOverlay}
          onClose={() => setShowMatchOverlay(false)}
        />
        <MatchCenterOverlay />
        <ChallengerQualifierOverlay />
        <MajorEntryOverlay />
        <MajorTournamentOverlay />
        <TeamHubOverlay />
        <NotificationsFeed isOpen={showFeed} onClose={() => setShowFeed(false)} />

        {/* Screen content */}
        <main className="main-content">
          {screen === "home"      && <Dashboard setScreen={setScreen} />}
          {screen === "standings" && <Standings />}
          {screen === "schedule"  && <Schedule />}
          {screen === "kdleaders" && <KDLeaders />}
          {screen === "roster"    && <Roster />}
          {screen === "fa"        && <FreeAgency />}
          {screen === "prospects" && <Prospects />}
          {screen === "devreport" && <OffseasonReport />}
          {screen === "log"       && <MatchLog />}
        </main>
      </div>
    </div>
    </TeamHubProvider>
    </MatchCenterProvider>
  );
}
