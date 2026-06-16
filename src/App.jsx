import { useEffect, useState } from "react";
import { useDynasty, saveGame, loadGame, deleteSave, isValidDynastyState, getCurrentEventInfo } from "./store/dynastyStore.jsx";
import StartScreen from "./components/StartScreen.jsx";
import DynastySidebar from "./components/DynastySidebar.jsx";
import Home from "./components/Home.jsx";
import DynastyRoster from "./components/DynastyRoster.jsx";
import DynastyFreeAgency from "./components/DynastyFreeAgency.jsx";
import AmateurPool from "./components/AmateurPool.jsx";
import EventCalendar from "./components/EventCalendar.jsx";
import EventResult from "./components/EventResult.jsx";
import EventDetail from "./components/EventDetail.jsx";
import DynastyStandings from "./components/DynastyStandings.jsx";
import LeagueRosters from "./components/LeagueRosters.jsx";

export default function App() {
  const { state, dispatch } = useDynasty();
  const [screen, setScreen] = useState("home");
  const [confirmNew, setConfirmNew] = useState(false);

  useEffect(() => {
    const saved = loadGame();
    if (saved && isValidDynastyState(saved)) {
      dispatch({ type: "LOAD_GAME", state: saved });
    }
  }, [dispatch]);

  useEffect(() => {
    if (isValidDynastyState(state)) saveGame(state);
  }, [state]);

  useEffect(() => {
    if (state?.notifications?.length > 0) {
      const t = setTimeout(() => dispatch({ type: "CLEAR_NOTIF" }), 3500);
      return () => clearTimeout(t);
    }
  }, [state?.notifications, dispatch]);

  if (!isValidDynastyState(state)) {
    return (
      <div className="app">
        <StartScreen />
      </div>
    );
  }

  const team = state.teams.find(t => t.id === state.userTeamId);
  const notification = state.notifications?.[0];
  const eventInfo = getCurrentEventInfo(state);

  function handleNewGame() {
    deleteSave();
    dispatch({ type: "RESET" });
    setScreen("home");
    setConfirmNew(false);
  }

  function handleTopbarAction() {
    if (!eventInfo) return;
    const { buttonAction, currentEvent } = eventInfo;
    if (buttonAction === "play_match" || buttonAction === "start_event") {
      dispatch({ type: "OPEN_EVENT", eventId: currentEvent.id });
      setScreen("eventdetail");
    } else if (buttonAction === "continue_event") {
      setScreen("eventdetail");
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-left">
          <span className="app-title">COD DYNASTY</span>
          <span className="season-badge">{state.seasonLabel}</span>
          {team && (
            <span className="user-team-badge">
              <strong>{team.tag}</strong>
              <span className="user-team-name"> {team.name}</span>
            </span>
          )}
        </div>
        <div className="topbar-right">
          {eventInfo?.buttonLabel && eventInfo.buttonAction && (
            <button className="btn-primary topbar-play-btn" onClick={handleTopbarAction}>
              {eventInfo.buttonLabel === "Play Match" ? "▶ " : ""}{eventInfo.buttonLabel}
            </button>
          )}
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

      {notification && <div className="toast">{notification}</div>}

      <div className="app-body">
        <DynastySidebar screen={screen} setScreen={setScreen} />
        <main className="main-content">
          {screen === "home" && <Home setScreen={setScreen} />}
          {screen === "standings" && <DynastyStandings />}
          {screen === "roster" && <DynastyRoster />}
          {screen === "league" && <LeagueRosters />}
          {screen === "fa" && <DynastyFreeAgency />}
          {screen === "amateurs" && <AmateurPool />}
          {screen === "events" && <EventCalendar setScreen={setScreen} />}
          {screen === "eventresult" && <EventResult setScreen={setScreen} />}
          {screen === "eventdetail" && <EventDetail setScreen={setScreen} />}
        </main>
      </div>
    </div>
  );
}
