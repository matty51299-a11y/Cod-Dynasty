import { useDynasty } from "../store/dynastyStore.jsx";
import { getSortedStandings } from "../engine/standingsEngine.js";

export default function SeasonReview({ setScreen }) {
  const { state, dispatch } = useDynasty();
  if (!state) return null;

  const sorted = getSortedStandings(state.standings);
  const team = state.teams.find(t => t.id === state.userTeamId);
  const userStanding = sorted.find(s => s.teamId === state.userTeamId);
  const roster = state.players.filter(p => p.teamId === state.userTeamId);
  const userResults = (state.completedEvents || []).map(ev => ev.results?.find(r => r.teamId === state.userTeamId)).filter(Boolean);
  const bestFinish = userResults.length ? Math.min(...userResults.map(r => r.placement)) : null;
  const eventWins = userStanding?.eventWins || 0;

  function handleEnterRostermania() {
    dispatch({ type: "ENTER_ROSTERMANIA" });
    setScreen("rostermania");
  }

  return (
    <div className="dynasty-home">
      <div className="home-header">
        <div>
          <h2>Season Review</h2>
          <div className="home-meta">
            <span className="home-chip">{state.currentGameTitle}</span>
            <span className="home-chip">{state.seasonLabel}</span>
          </div>
        </div>
      </div>

      <div className="home-grid">
        <div className="home-card">
          <h3>Your Season — {team?.name || "My Team"}</h3>
          <div className="home-stat-row"><span>Final Rank</span><strong>#{userStanding?.rank || "—"}</strong></div>
          <div className="home-stat-row"><span>Pro Points</span><strong>{(userStanding?.proPoints || 0).toLocaleString()}</strong></div>
          <div className="home-stat-row"><span>Event Wins</span><strong>{eventWins}</strong></div>
          <div className="home-stat-row"><span>Best Finish</span><strong>{bestFinish ? `#${bestFinish}` : "—"}</strong></div>
          <div className="home-stat-row"><span>Events Played</span><strong>{userStanding?.eventsPlayed || 0} / {state.eventCalendar.length}</strong></div>
        </div>

        <div className="home-card">
          <h3>Roster at Season End</h3>
          {roster.map(p => (
            <div key={p.id} className="home-roster-row">
              <span className="player-name">{p.name}</span>
              <span className="player-role">{p.primary}</span>
              <span className="player-ovr">OVR {p.overall}</span>
            </div>
          ))}
          {roster.length === 0 && <p className="dim-text">No players on roster.</p>}
        </div>

        <div className="home-card">
          <h3>Final Standings</h3>
          <div className="sr-standings-table">
            {sorted.slice(0, 12).map((s, i) => (
              <div key={s.teamId} className={`home-stat-row ${s.teamId === state.userTeamId ? "sr-user-row" : ""}`}>
                <span>#{i + 1} {s.teamName}</span>
                <strong>{(s.proPoints || 0).toLocaleString()} PP</strong>
              </div>
            ))}
          </div>
        </div>

        <div className="home-card">
          <h3>Event Winners</h3>
          {(state.completedEvents || []).map(ev => (
            <div key={ev.eventId} className="home-stat-row">
              <span>{ev.eventName}</span>
              <strong>{ev.champion?.teamName}</strong>
            </div>
          ))}
        </div>
      </div>

      <div className="rostermania-action-bar">
        <p className="dim-text">The {state.seasonLabel} season is complete. The offseason begins — new teams, roster moves, and free agency await.</p>
        <button className="btn-primary btn-lg" onClick={handleEnterRostermania}>
          Enter Rostermania →
        </button>
      </div>
    </div>
  );
}
