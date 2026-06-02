// src/App.jsx
// Root application component.
// Handles: save/load lifecycle, sidebar navigation, notifications, overlays.

import { useEffect, useState } from "react";
import { useGame, saveGame, loadGame, deleteSave } from "./store/gameStore.jsx";
import { isValidGameState } from "./store/gameValidation.js";
import "./engine/poolReport.js"; // registers window.poolReport() console utility
import { TeamHubProvider }        from "./store/teamHubContext.jsx";
import { PlayerProfileProvider }  from "./store/playerProfileContext.jsx";
import { MatchCenterProvider }    from "./store/matchCenterContext.jsx";
import ErrorBoundary              from "./components/ErrorBoundary.jsx";
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
import BoardObjectives   from "./components/BoardObjectives.jsx";
import FreeAgency        from "./components/FreeAgency.jsx";
import Prospects         from "./components/Prospects.jsx";
import Scouting          from "./components/Scouting.jsx";
import TransferCentre    from "./components/TransferCentre.jsx";
import MatchLog          from "./components/MatchLog.jsx";
import StaffPanel        from "./components/StaffPanel.jsx";
import MajorEntryOverlay    from "./components/MajorEntryOverlay.jsx";
import ChallengerQualifierOverlay from "./components/ChallengerQualifierOverlay.jsx";
import MajorTournamentOverlay from "./components/MajorTournamentOverlay.jsx";
import OffseasonReport   from "./components/OffseasonReport.jsx";
import TeamHubOverlay    from "./components/TeamHubOverlay.jsx";
import PlayerProfileOverlay from "./components/PlayerProfileOverlay.jsx";
import SeasonAwardsOverlay from "./components/SeasonAwardsOverlay.jsx";
import BoardReviewOverlay from "./components/BoardReviewOverlay.jsx";
import NotificationsFeed from "./components/NotificationsFeed.jsx";
import { CDL_TEAMS }     from "./data/teams.js";
import { getTeamThemeStyle } from "./utils/teamTheme.js";

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
  }, [dispatch]);

  // Auto-save only complete, playable game states. This prevents a reset to
  // team select from persisting over a deliberately cleared save.
  useEffect(() => {
    if (isValidGameState(state)) saveGame(state);
  }, [state]);

  // Notifications: auto-dismiss after 3.5s
  useEffect(() => {
    if (state?.notifications?.length > 0) {
      const t = setTimeout(() => dispatch({ type: "CLEAR_NOTIF" }), 3500);
      return () => clearTimeout(t);
    }
  }, [state?.notifications, dispatch]);

  // No save loaded yet → show team select
  if (!isValidGameState(state)) {
    return (
      <ErrorBoundary>
        <div className="app">
          <TeamSelect />
        </div>
      </ErrorBoundary>
    );
  }

  const team         = CDL_TEAMS.find(t => t.id === state.userTeamId);
  const teamThemeStyle = getTeamThemeStyle(team);
  const notification = state.notifications?.[0];

  function handleNewGame() {
    deleteSave();
    dispatch({ type: "RESET_TO_TEAM_SELECT" });
    setScreen("home");
    setShowMatchOverlay(false);
    setShowFeed(false);
    setConfirmNew(false);
  }

  return (
    <ErrorBoundary>
    <MatchCenterProvider>
    <TeamHubProvider>
    <PlayerProfileProvider>
    <div className="app" style={teamThemeStyle}>
      {/* ── Top bar ── */}
      <header className="topbar">
        <div className="topbar-left">
          <span className="app-title">CDL MANAGER</span>
          <span className="season-badge">S{state.season}</span>
          {team && (
            <span className="user-team-badge" style={{ color: "var(--shell-text)" }}>
              <strong>{team.tag}</strong>
              <span className="user-team-name">{team.name}</span>
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
        <PlayerProfileOverlay />
        <SeasonAwardsOverlay />
        <BoardReviewOverlay />
        <NotificationsFeed isOpen={showFeed} onClose={() => setShowFeed(false)} />

        {/* Screen content */}
        <main className="main-content">
          {screen === "home"      && <Dashboard setScreen={setScreen} />}
          {screen === "standings" && <Standings />}
          {screen === "schedule"  && <Schedule />}
          {screen === "kdleaders" && <KDLeaders />}
          {screen === "roster"    && <Roster />}
          {screen === "board"     && <BoardObjectives />}
          {screen === "fa"        && <FreeAgency />}
          {screen === "prospects" && <Prospects />}
          {screen === "scouting"  && <Scouting />}
          {screen === "transfers" && <TransferCentre />}
          {screen === "devreport" && <OffseasonReport />}
          {screen === "staff"     && <StaffPanel />}
          {screen === "log"       && <MatchLog />}
        </main>
      </div>
    </div>
    </PlayerProfileProvider>
    </TeamHubProvider>
    </MatchCenterProvider>
    </ErrorBoundary>
  );
}
