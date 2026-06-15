import { useDynasty } from "../store/dynastyStore.jsx";
import { getSortedStandings } from "../engine/standingsEngine.js";

export default function DynastyStandings() {
  const { state } = useDynasty();
  if (!state) return null;

  const sorted = getSortedStandings(state.standings);

  return (
    <div className="dynasty-standings">
      <h2>Pro Circuit Standings</h2>
      <p className="dim-text">{state.currentGameTitle} · {state.seasonLabel}</p>

      <div className="standings-table">
        <div className="standings-header">
          <span className="col-rank">#</span>
          <span className="col-team">Team</span>
          <span className="col-pp">Pro Points</span>
          <span className="col-wins">Event Wins</span>
          <span className="col-recent">Recent</span>
        </div>
        {sorted.map(entry => {
          const lastPlacement = entry.placements.length
            ? `#${entry.placements[entry.placements.length - 1].placement}`
            : "—";
          return (
            <div
              key={entry.teamId}
              className={`standings-row ${entry.teamId === state.userTeamId ? "user-row" : ""}`}
            >
              <span className="col-rank">{entry.rank}</span>
              <span className="col-team">{entry.teamName}</span>
              <span className="col-pp">{entry.proPoints.toLocaleString()}</span>
              <span className="col-wins">{entry.eventWins}</span>
              <span className="col-recent">{lastPlacement}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
