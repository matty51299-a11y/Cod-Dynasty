// src/components/MatchLog.jsx
// Full season match log. Click any row to expand the series breakdown:
//   - Map-by-map results with mode and score
//   - Player stats (K/D) grouped by team

import { useState } from "react";
import { useGame } from "../store/gameStore.jsx";
import { CDL_TEAMS } from "../data/teams.js";

function teamName(id) {
  return CDL_TEAMS.find(t => t.id === id)?.name ?? id;
}
function teamTag(id) {
  return CDL_TEAMS.find(t => t.id === id)?.tag ?? id;
}
function teamColor(id) {
  return CDL_TEAMS.find(t => t.id === id)?.color ?? "#888";
}

function kdColor(kd) {
  if (kd >= 1.4) return "#00e676";
  if (kd >= 1.1) return "#69f0ae";
  if (kd >= 0.9) return "#ffeb3b";
  if (kd >= 0.7) return "#ffa726";
  return "#ef5350";
}

// ── Series breakdown panel ────────────────────────────────────────────────────
function SeriesDetail({ result }) {
  if (!result) return null;

  const { mapResults, playerStats, teamAId, teamAName, teamBId, teamBName } = result;

  if (!mapResults || mapResults.length === 0) {
    return <p className="muted" style={{ padding: "10px 16px" }}>No map detail available for this match.</p>;
  }

  // Build per-team stat rows
  const statsA = Object.values(playerStats || {}).filter(s => s.teamId === teamAId);
  const statsB = Object.values(playerStats || {}).filter(s => s.teamId === teamBId);

  // Sort by kills desc within each team
  statsA.sort((a, b) => b.kills - a.kills);
  statsB.sort((a, b) => b.kills - a.kills);

  return (
    <div className="series-detail">
      {/* Map-by-map breakdown */}
      <div className="map-breakdown">
        <div className="breakdown-title">Series Breakdown</div>
        {mapResults.map((m) => {
          const aWon = m.winnerId === teamAId;
          return (
            <div key={m.mapNum} className="map-row">
              <span className="map-num">Map {m.mapNum}</span>
              <span className="map-mode">{m.mode}</span>
              <span className={`map-team ${aWon ? "win" : "loss"}`}>{teamTag(teamAId)}</span>
              <span className="map-score">
                <span style={{ color: aWon ? "#00e676" : "#ef5350" }}>{m.scoreA}</span>
                {" – "}
                <span style={{ color: aWon ? "#ef5350" : "#00e676" }}>{m.scoreB}</span>
              </span>
              <span className={`map-team ${!aWon ? "win" : "loss"}`}>{teamTag(teamBId)}</span>
              <span className="map-winner-label" style={{ color: teamColor(m.winnerId) }}>
                {teamTag(m.winnerId)} win
              </span>
            </div>
          );
        })}

        {/* Series result summary */}
        <div className="series-result-row">
          <span style={{ color: teamColor(result.winnerId), fontWeight: 700 }}>
            {result.winnerName}
          </span>
          {" wins "}
          <span style={{ fontWeight: 700 }}>{result.score}</span>
        </div>
      </div>

      {/* Player stats */}
      {playerStats && Object.keys(playerStats).length > 0 && (
        <div className="stats-section">
          <div className="stats-teams">
            <PlayerStatsTable teamId={teamAId} teamName={teamAName} stats={statsA} winnerId={result.winnerId} />
            <PlayerStatsTable teamId={teamBId} teamName={teamBName} stats={statsB} winnerId={result.winnerId} />
          </div>
        </div>
      )}
    </div>
  );
}

function PlayerStatsTable({ teamId, teamName, stats, winnerId }) {
  const won = teamId === winnerId;
  const color = teamColor(teamId);

  return (
    <div className="stats-team-block">
      <div className="stats-team-header" style={{ color }}>
        {teamName}
        <span className={`result-badge ${won ? "win-badge" : "loss-badge"}`}>{won ? "W" : "L"}</span>
      </div>
      <table className="stats-table">
        <thead>
          <tr>
            <th>Player</th>
            <th>K</th>
            <th>D</th>
            <th>K/D</th>
          </tr>
        </thead>
        <tbody>
          {stats.map((s, i) => (
            <tr key={i}>
              <td className="player-name">{s.name}</td>
              <td>{s.kills}</td>
              <td>{s.deaths}</td>
              <td style={{ color: kdColor(s.kd), fontWeight: 600 }}>{s.kd.toFixed(2)}</td>
            </tr>
          ))}
          {stats.length === 0 && (
            <tr><td colSpan={4} className="muted">No stats</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ── Main MatchLog ─────────────────────────────────────────────────────────────
export default function MatchLog() {
  const { state } = useGame();
  const [expanded, setExpanded] = useState(null); // index of expanded match

  if (!state) return null;

  const log = [...(state.schedule.matchLog || [])].reverse();

  function toggle(i) {
    setExpanded(prev => prev === i ? null : i);
  }

  return (
    <div className="matchlog-page">
      <h2>Match Log – Season {state.season}</h2>
      <p className="muted" style={{ marginBottom: 12 }}>Click any match to see the full series breakdown and player stats.</p>

      {log.length === 0 ? (
        <p className="muted">No matches played yet.</p>
      ) : (
        <div className="log-list">
          {log.map((r, i) => {
            const isUser  = r.winnerId === state.userTeamId || r.loserId === state.userTeamId;
            const userWon = r.winnerId === state.userTeamId;
            const isOpen  = expanded === i;

            return (
              <div key={i} className={`log-entry ${isUser ? (userWon ? "user-win" : "user-loss") : ""}`}>
                {/* Summary row – click to expand */}
                <div className="log-summary" onClick={() => toggle(i)}>
                  <span className="log-num muted">#{log.length - i}</span>
                  <span className="log-stage muted">{r.stage}</span>
                  <span className="log-teams">
                    <span style={{ color: teamColor(r.winnerId), fontWeight: 700 }}>
                      {teamTag(r.winnerId)}
                    </span>
                    <span className="log-score"> {r.score} </span>
                    <span style={{ color: teamColor(r.loserId) }}>
                      {teamTag(r.loserId)}
                    </span>
                  </span>
                  <span className="log-standout muted">
                    ⭐ {r.standoutName ?? "—"}{r.standoutKD > 0 ? ` (${r.standoutKD.toFixed(2)} K/D)` : ""}
                  </span>
                  <span className="log-expand-icon">{isOpen ? "▲" : "▼"}</span>
                </div>

                {/* Expanded detail */}
                {isOpen && <SeriesDetail result={r} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
