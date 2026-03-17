// src/components/MatchLog.jsx
// Full season match log as expandable cards.
// Click any card header to show/hide the series breakdown + player stats.

import { useState } from "react";
import { useGame } from "../store/gameStore.jsx";
import { CDL_TEAMS } from "../data/teams.js";
import SeriesDetail from "./SeriesDetail.jsx";

function tag(id)   { return CDL_TEAMS.find(t => t.id === id)?.tag   ?? id; }
function color(id) { return CDL_TEAMS.find(t => t.id === id)?.color ?? "#aaa"; }

export default function MatchLog() {
  const { state } = useGame();
  const [expanded, setExpanded] = useState(null);

  if (!state) return null;

  const log = [...(state.schedule.matchLog || [])].reverse();

  function toggle(i) {
    setExpanded(prev => (prev === i ? null : i));
  }

  return (
    <div className="matchlog-page">
      <h2>Match Log – Season {state.season}</h2>
      <p className="muted" style={{ marginBottom: 14 }}>
        {log.length} match{log.length !== 1 ? "es" : ""} · click any row to expand the full series breakdown and player stats
      </p>

      {log.length === 0 ? (
        <p className="muted">No matches played yet. Simulate a matchday to see results here.</p>
      ) : (
        <div className="log-list">
          {log.map((r, i) => {
            const isUser  = r.winnerId === state.userTeamId || r.loserId === state.userTeamId;
            const userWon = r.winnerId === state.userTeamId;
            const isOpen  = expanded === i;

            return (
              <div
                key={i}
                className={`log-entry ${isUser ? (userWon ? "user-win" : "user-loss") : ""}`}
              >
                {/* ── Clickable header ── */}
                <div className="log-summary" onClick={() => toggle(i)}>

                  <span className="log-num muted">#{log.length - i}</span>

                  <span className="log-stage muted">{r.stage}</span>

                  {/* Winner vs Loser with team colors */}
                  <span className="log-teams">
                    <span style={{ color: color(r.winnerId), fontWeight: 700 }}>
                      {tag(r.winnerId)}
                    </span>
                    <span className="log-score">&nbsp;{r.score}&nbsp;</span>
                    <span style={{ color: color(r.loserId) }}>
                      {tag(r.loserId)}
                    </span>
                  </span>

                  {/* Map sequence if available */}
                  {r.mapResults && (
                    <span className="log-maps muted">
                      {r.mapResults.map(m => m.short).join(" · ")}
                    </span>
                  )}

                  {/* Standout player */}
                  <span className="log-standout muted">
                    ⭐ {r.standoutName ?? "—"}
                    {r.standoutKD > 0 && ` (${r.standoutKD.toFixed(2)} K/D)`}
                  </span>

                  {/* Expand/collapse cue — always visible */}
                  <button className="log-expand-btn" onClick={e => { e.stopPropagation(); toggle(i); }}>
                    {isOpen ? "Hide ▲" : "Details ▼"}
                  </button>

                </div>

                {/* ── Expanded series detail ── */}
                {isOpen && <SeriesDetail result={r} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
