import { useDynasty } from "../store/dynastyStore.jsx";

export default function EventResult({ setScreen }) {
  const { state } = useDynasty();
  if (!state) return null;

  const lastResult = state.completedEvents[state.completedEvents.length - 1];
  if (!lastResult) {
    return (
      <div className="event-result">
        <h2>Event Results</h2>
        <p className="dim-text">No events completed yet.</p>
        <button className="btn-secondary" onClick={() => setScreen("events")}>Back to Calendar</button>
      </div>
    );
  }

  const userResult = lastResult.results.find(r => r.teamId === state.userTeamId);

  return (
    <div className="event-result">
      <div className="result-header">
        <h2>{lastResult.eventName}</h2>
        <p className="dim-text">{lastResult.dateLabel} · {lastResult.teamCount} teams</p>
      </div>

      <div className="result-champion">
        <span className="champion-label">Champion</span>
        <span className="champion-name">{lastResult.champion.teamName}</span>
      </div>

      {userResult && (
        <div className="result-user">
          <span>Your Finish: <strong>#{userResult.placement}</strong></span>
          <span>Pro Points: <strong>+{userResult.proPointsAwarded.toLocaleString()}</strong></span>
        </div>
      )}

      <div className="result-table">
        <div className="result-table-header">
          <span>#</span>
          <span>Team</span>
          <span>Pro Points</span>
        </div>
        {lastResult.results.map(r => (
          <div
            key={r.teamId}
            className={`result-table-row ${r.teamId === state.userTeamId ? "user-row" : ""} ${r.placement === 1 ? "champion-row" : ""}`}
          >
            <span className="placement">#{r.placement}</span>
            <span className="team-name">{r.teamName}</span>
            <span className="pp-awarded">+{r.proPointsAwarded.toLocaleString()}</span>
          </div>
        ))}
      </div>

      <div className="result-actions">
        <button className="btn-secondary" onClick={() => setScreen("events")}>Back to Calendar</button>
        <button className="btn-secondary" onClick={() => setScreen("standings")}>View Standings</button>
        <button className="btn-primary" onClick={() => setScreen("home")}>Home</button>
      </div>
    </div>
  );
}
