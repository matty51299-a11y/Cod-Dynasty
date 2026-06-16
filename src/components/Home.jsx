import { useDynasty, getCurrentEventInfo } from "../store/dynastyStore.jsx";
import { getSortedStandings } from "../engine/standingsEngine.js";
import { EVENT_TIERS } from "../data/ghostsEventCalendar.js";

export default function Home({ setScreen }) {
  const { state, dispatch } = useDynasty();
  if (!state) return null;

  const team = state.teams.find(t => t.id === state.userTeamId);
  const roster = state.players.filter(p => p.teamId === state.userTeamId);
  const sorted = getSortedStandings(state.standings);
  const userStanding = sorted.find(s => s.teamId === state.userTeamId);
  const eventInfo = getCurrentEventInfo(state);
  const lastEvent = state.completedEvents[state.completedEvents.length - 1];

  function handlePrimaryAction() {
    if (!eventInfo) return;
    const { buttonAction, currentEvent } = eventInfo;
    if (buttonAction === "play_match") {
      dispatch({ type: "OPEN_EVENT", eventId: currentEvent.id });
      setScreen("eventdetail");
    } else if (buttonAction === "continue_event") {
      setScreen("eventdetail");
    } else if (buttonAction === "start_event") {
      dispatch({ type: "OPEN_EVENT", eventId: currentEvent.id });
      setScreen("eventdetail");
    }
  }

  const tierInfo = eventInfo?.currentEvent ? EVENT_TIERS[eventInfo.currentEvent.tier] : null;

  return (
    <div className="dynasty-home">
      <div className="home-header">
        <div className="home-header-left">
          <h2>{team?.name || "My Team"}</h2>
          <div className="home-meta">
            <span className="home-chip">{state.currentGameTitle}</span>
            <span className="home-chip">{state.seasonLabel}</span>
          </div>
        </div>
        {eventInfo?.buttonLabel && eventInfo.buttonAction && (
          <button className="btn-primary home-play-btn" onClick={handlePrimaryAction}>
            {eventInfo.buttonLabel === "Play Match" ? "▶ " : ""}{eventInfo.buttonLabel}
          </button>
        )}
        {eventInfo?.allComplete && (
          <span className="home-season-complete-badge">Season Complete</span>
        )}
      </div>

      {eventInfo?.currentEvent && !eventInfo.allComplete && (
        <div className="home-current-event-banner">
          <div className="home-event-banner-left">
            <div className="home-event-banner-kicker">
              {eventInfo.isEventInProgress ? "Current Event — In Progress" : "Next Event"}
            </div>
            <h3 className="home-event-banner-name">{eventInfo.currentEvent.name}</h3>
            <div className="home-event-banner-meta">
              <span>{eventInfo.currentEvent.dateLabel}</span>
              {tierInfo && <span className="home-tier-badge" style={{ color: tierInfo.color }}>{tierInfo.label}</span>}
              <span>{eventInfo.currentEvent.format}</span>
              <span>{eventInfo.currentEvent.teamCount} teams</span>
              <span>1st: +{(eventInfo.currentEvent.proPoints?.[1] || 0).toLocaleString()} PP</span>
            </div>
            {eventInfo.userMatch && (
              <div className="home-event-banner-match">
                Your Match: <strong>{eventInfo.userMatch.teamA?.teamName}</strong> vs <strong>{eventInfo.userMatch.teamB?.teamName}</strong>
              </div>
            )}
          </div>
          <div className="home-event-banner-actions">
            <button className="btn-primary" onClick={handlePrimaryAction}>
              {eventInfo.buttonLabel === "Play Match" ? "▶ " : ""}{eventInfo.buttonLabel}
            </button>
            <button className="btn-link" onClick={() => setScreen("events")}>View Calendar →</button>
          </div>
        </div>
      )}

      <div className="home-grid">
        <div className="home-card">
          <h3>Team Record</h3>
          <div className="home-stat-row">
            <span>Pro Points</span>
            <strong>{(userStanding?.proPoints || 0).toLocaleString()}</strong>
          </div>
          <div className="home-stat-row">
            <span>Event Wins</span>
            <strong>{userStanding?.eventWins || 0}</strong>
          </div>
          <div className="home-stat-row">
            <span>Rank</span>
            <strong>#{userStanding?.rank || "—"}</strong>
          </div>
          <div className="home-stat-row">
            <span>Events Played</span>
            <strong>{userStanding?.eventsPlayed || 0} / {state.eventCalendar.length}</strong>
          </div>
        </div>

        <div className="home-card">
          <h3>Roster ({roster.length}/4)</h3>
          {roster.map(p => (
            <div key={p.id} className="home-roster-row">
              <span className="player-name">{p.name}</span>
              <span className="player-role">{p.primary}</span>
              <span className="player-ovr">OVR {p.overall}</span>
            </div>
          ))}
          <button className="btn-link" onClick={() => setScreen("roster")}>View Roster →</button>
        </div>

        <div className="home-card">
          <h3>Last Event</h3>
          {lastEvent ? (
            <>
              <div className="home-event-name">{lastEvent.eventName}</div>
              <p>Champion: <strong>{lastEvent.champion.teamName}</strong></p>
              {(() => {
                const userResult = lastEvent.results.find(r => r.teamId === state.userTeamId);
                return userResult ? <p>Your finish: <strong>#{userResult.placement}</strong> (+{userResult.proPointsAwarded.toLocaleString()} PP)</p> : null;
              })()}
            </>
          ) : (
            <p className="dim-text">No events completed yet.</p>
          )}
        </div>

        <div className="home-card">
          <h3>Season Progress</h3>
          <div className="home-stat-row">
            <span>Events Completed</span>
            <strong>{state.completedEvents.length} / {state.eventCalendar.length}</strong>
          </div>
          <div className="home-stat-row">
            <span>Events Remaining</span>
            <strong>{state.eventCalendar.length - state.currentEventIndex}</strong>
          </div>
          <button className="btn-link" onClick={() => setScreen("events")}>View Calendar →</button>
        </div>
      </div>
    </div>
  );
}
