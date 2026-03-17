// src/components/MatchLog.jsx
// Shows the full match log for the current season.

import { useGame } from "../store/gameStore.jsx";
import { CDL_TEAMS } from "../data/teams.js";

export default function MatchLog() {
  const { state } = useGame();
  if (!state) return null;

  const log = [...(state.schedule.matchLog || [])].reverse();

  function teamName(id) {
    return CDL_TEAMS.find(t => t.id === id)?.name ?? id;
  }

  return (
    <div className="matchlog-page">
      <h2>Match Log – Season {state.season}</h2>
      {log.length === 0 ? (
        <p className="muted">No matches played yet.</p>
      ) : (
        <table className="results-table full-log">
          <thead>
            <tr>
              <th>#</th>
              <th>Stage</th>
              <th>Winner</th>
              <th>Loser</th>
              <th>Score</th>
              <th>Standout</th>
            </tr>
          </thead>
          <tbody>
            {log.map((r, i) => (
              <tr key={i} className={
                r.winnerId === state.userTeamId ? "win-row" :
                r.loserId === state.userTeamId ? "loss-row" : ""
              }>
                <td className="muted">{log.length - i}</td>
                <td className="muted">{r.stage}</td>
                <td className="win">{teamName(r.winnerId)}</td>
                <td className="loss">{teamName(r.loserId)}</td>
                <td>{r.score}</td>
                <td>{r.standoutName ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
