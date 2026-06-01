// src/components/SeriesDetail.jsx
// Shared component: full breakdown of one simulated series.
// Used by Dashboard recent results, MatchLog, and MajorBracket match cards.

import { softenedMapEdge } from "../utils/mapDisplay.js";
import { resolveTeamDisplay } from "../utils/teamDisplay.js";
import { usePlayerProfile } from "../store/playerProfileContext.jsx";

function makeTag(schedule)   { return (id) => resolveTeamDisplay(id, schedule).tag ?? id; }
function makeColor(schedule) { return (id) => resolveTeamDisplay(id, schedule).color ?? "#aaa"; }

function kdColor(kd) {
  if (kd >= 1.4) return "var(--green)";
  if (kd >= 1.1) return "var(--green)";
  if (kd >= 0.9) return "var(--accent)";
  if (kd >= 0.7) return "var(--text-dim)";
  return "var(--red)";
}

function modeColor(short) {
  if (short === "HP")  return "var(--accent)";
  if (short === "S&D") return "var(--red)";
  if (short === "OVR" || short === "CTL") return "var(--green)";
  return "var(--text-dim)";
}

// ── Player stats table ───────────────────────────────────────────────────────
function StatsTable({ teamId, teamName: tName, stats, won, color, onPlayer }) {
  const sorted = [...stats].sort((a, b) => (b.kd ?? 0) - (a.kd ?? 0));

  return (
    <div className="stats-team-block">
      <div className="stats-team-header" style={{ color: color(teamId) }}>
        {tName}
        <span className={`result-badge ${won ? "win-badge" : "loss-badge"}`}>
          {won ? "W" : "L"}
        </span>
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
          {sorted.length === 0 ? (
            <tr>
              <td colSpan={4} className="muted" style={{ padding: "6px 8px" }}>
                No stats recorded
              </td>
            </tr>
          ) : (
            sorted.map((s, i) => (
              <tr key={i}>
                <td className="player-name"><button className="link-button player-link" onClick={() => onPlayer(s.id)}>{s.name}</button></td>
                <td>{s.kills}</td>
                <td>{s.deaths}</td>
                <td style={{ color: kdColor(s.kd ?? 0), fontWeight: 600 }}>
                  {typeof s.kd === "number" ? s.kd.toFixed(2) : "—"}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function SeriesDetail({ result, schedule = null }) {
  const { openPlayerProfile } = usePlayerProfile();
  if (!result) return null;
  const tag = makeTag(schedule);
  const color = makeColor(schedule);

  const {
    mapResults, playerStats,
    teamAId, teamAName, teamBId, teamBName,
    winnerId, winnerName, score,
    standoutName, standoutKD,
  } = result;

  if (!mapResults || mapResults.length === 0) {
    return (
      <div className="series-detail">
        <p className="muted" style={{ fontSize: 12 }}>
          No map detail for this match — simulate new matches to see full breakdowns.
        </p>
      </div>
    );
  }

  const rawStats = Object.entries(playerStats || {}).map(([id, stats]) => ({ id, ...stats }));
  const statsA   = rawStats.filter(s => s.teamId === teamAId);
  const statsB   = rawStats.filter(s => s.teamId === teamBId);

  return (
    <div className="series-detail">

      {/* ── MVP / standout callout ── */}
      {standoutName && standoutKD > 0 && (
        <div className="sd-standout">
          <span className="sd-so-icon">★</span>
          <div className="sd-so-body">
            <span className="sd-so-name">{standoutName}</span>
            <span className="sd-so-kd" style={{ color: kdColor(standoutKD) }}>
              {standoutKD.toFixed(2)} K/D
            </span>
          </div>
          <span className="sd-so-label">MVP</span>
        </div>
      )}

      {/* ── Map-by-map breakdown ── */}
      <div className="map-breakdown">
        <div className="breakdown-title">Map Breakdown</div>

        {mapResults.map((m) => {
          const aWon = m.winnerId === teamAId;
          return (
            <div key={m.mapNum} className="map-row">
              <span className="map-num">Map {m.mapNum}</span>

              <span
                className="map-mode-badge"
                style={{
                  background: modeColor(m.short) + "22",
                  color: modeColor(m.short),
                  borderColor: modeColor(m.short) + "55",
                }}
              >
                {m.short}
              </span>

              {m.mapName && <span className="map-name-label">{m.mapName}</span>}

              <span
                className={`map-team-tag ${aWon ? "mtag-win" : "mtag-loss"}`}
                style={{ color: color(teamAId) }}
              >
                {tag(teamAId)}
              </span>

              <span className="map-score-block">
                <span className={aWon ? "mscore-win" : "mscore-loss"}>{m.scoreA}</span>
                <span className="map-score-sep">–</span>
                <span className={aWon ? "mscore-loss" : "mscore-win"}>{m.scoreB}</span>
              </span>

              <span
                className={`map-team-tag ${!aWon ? "mtag-win" : "mtag-loss"}`}
                style={{ color: color(teamBId) }}
              >
                {tag(teamBId)}
              </span>

              <span className="map-winner-label" style={{ color: color(m.winnerId) }}>
                {tag(m.winnerId)} win
              </span>

              {typeof m.mapEdgeA === "number" && m.mapEdgeA !== 0 && (
                <span className="map-edge-chip" title="Pre-map map-pool edge">
                  {softenedMapEdge(m.mapEdgeA, tag(teamAId), tag(teamBId)).text}
                </span>
              )}
            </div>
          );
        })}

        <div className="series-result-row">
          <span style={{ color: color(winnerId), fontWeight: 700 }}>{winnerName}</span>
          {" wins "}
          <span style={{ fontWeight: 700, color: "var(--text-head)" }}>{score}</span>
        </div>
      </div>

      {/* ── Player stats ── */}
      <div className="stats-section">
        <div className="breakdown-title" style={{ marginBottom: 8 }}>Player Stats</div>
        <div className="stats-teams">
          <StatsTable
            teamId={teamAId}
            teamName={teamAName}
            stats={statsA}
            won={teamAId === winnerId}
            color={color}
            onPlayer={openPlayerProfile}
          />
          <StatsTable
            teamId={teamBId}
            teamName={teamBName}
            stats={statsB}
            won={teamBId === winnerId}
            color={color}
            onPlayer={openPlayerProfile}
          />
        </div>
      </div>

    </div>
  );
}
