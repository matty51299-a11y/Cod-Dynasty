import { useDynasty } from "../store/dynastyStore.jsx";
import { getSortedStandings } from "../engine/standingsEngine.js";

export default function Home({ setScreen }) {
  const { state } = useDynasty();
  if (!state) return null;

  const team = state.teams.find(t => t.id === state.userTeamId);
  const roster = state.players.filter(p => p.teamId === state.userTeamId);
  const sorted = getSortedStandings(state.standings);
  const userStanding = sorted.find(s => s.teamId === state.userTeamId);
  const nextEvent = state.eventCalendar[state.currentEventIndex];
  const lastEvent = state.completedEvents[state.completedEvents.length - 1];

  return (
    <div className="dynasty-home">
      <div className="home-header">
        <h2>{team?.name || "My Team"}</h2>
        <div className="home-meta">
          <span className="home-chip">{state.currentGameTitle}</span>
          <span className="home-chip">{state.seasonLabel}</span>
        </div>
      </div>

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
          <h3>Next Event</h3>
          {nextEvent ? (
            <>
              <div className="home-event-name">{nextEvent.name}</div>
              <div className="home-event-meta">
                <span>{nextEvent.dateLabel}</span>
                <span>{nextEvent.format}</span>
                <span>{nextEvent.teamCount} teams</span>
              </div>
              <button className="btn-link" onClick={() => setScreen("events")}>View Calendar →</button>
            </>
          ) : (
            <p className="dim-text">Season complete.</p>
          )}
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
      </div>
    </div>
  );
}
