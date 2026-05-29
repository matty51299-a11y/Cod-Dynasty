// src/components/MatchLog.jsx
// Full season match log as result cards.
// Click any card to show/hide the full series breakdown + player stats.

import { useState } from "react";
import { useGame } from "../store/gameStore.jsx";
import { CDL_TEAMS } from "../data/teams.js";
import SeriesDetail from "./SeriesDetail.jsx";
import { useTeamHub } from "../store/teamHubContext.jsx";
import TeamLogo from "./TeamLogo.jsx";
import { resolveTeamDisplay } from "../utils/teamDisplay.js";
import { usePlayerProfile } from "../store/playerProfileContext.jsx";

function nameOf(id) { return CDL_TEAMS.find(t => t.id === id)?.name  ?? id; }
function colorOf(id){ return CDL_TEAMS.find(t => t.id === id)?.color ?? "#aaa"; }

export default function MatchLog() {
  const { state } = useGame();
  const { openTeamHub } = useTeamHub();
  const { openPlayerProfile } = usePlayerProfile();
  const [expanded, setExpanded] = useState(null);

  if (!state) return null;

  const log    = [...(state.schedule.matchLog || [])].reverse();
  const userId = state.userTeamId;

  function toggle(i) { setExpanded(prev => (prev === i ? null : i)); }

  return (
    <div className="matchlog-page">
      <h2>Match Log – Season {state.season}</h2>
      <p className="muted log-subtitle">
        {log.length} match{log.length !== 1 ? "es" : ""} · click a card to expand the full series
      </p>

      {log.length === 0 ? (
        <p className="muted" style={{ marginTop: 16 }}>No matches played yet.</p>
      ) : (
        <div className="log-list">
          {log.map((r, i) => {
            const isUser  = r.winnerId === userId || r.loserId === userId;
            const userWon = r.winnerId === userId;
            const isOpen  = expanded === i;

            return (
              <div
                key={i}
                className={`result-card ${isUser ? (userWon ? "rc-user-win" : "rc-user-loss") : "rc-neutral"}`}
              >
                {/* ── Clickable header ── */}
                <div className="rc-main" onClick={() => toggle(i)}>

                  <div className="rc-row-top">
                    {isUser && (
                      <span className={`rc-outcome ${userWon ? "rco-win" : "rco-loss"}`}>
                        {userWon ? "W" : "L"}
                      </span>
                    )}

                    <div className="rc-teams">
                      <span
                        className="rc-winner team-link"
                        style={{ color: colorOf(r.winnerId) }}
                        onClick={e => { e.stopPropagation(); openTeamHub(r.winnerId); }}
                      >
                        <TeamLogo team={resolveTeamDisplay(r.winnerId, state.schedule)} size={16} />
                        {nameOf(r.winnerId)}
                      </span>
                      <span className="rc-score">{r.score}</span>
                      <span
                        className="rc-loser team-link"
                        style={{ color: colorOf(r.loserId) }}
                        onClick={e => { e.stopPropagation(); openTeamHub(r.loserId); }}
                      >
                        <TeamLogo team={resolveTeamDisplay(r.loserId, state.schedule)} size={16} />
                        {nameOf(r.loserId)}
                      </span>
                    </div>

                    <button
                      className="rc-toggle"
                      onClick={e => { e.stopPropagation(); toggle(i); }}
                    >
                      {isOpen ? "Hide ▲" : "Details ▼"}
                    </button>
                  </div>

                  <div className="rc-row-meta">
                    <span className="rc-context">{r.stage}</span>
                    {r.standoutName && (
                      <span className="rc-standout">
                        ★ <button className="link-button player-link" onClick={(e) => { e.stopPropagation(); openPlayerProfile(r.standoutId); }}>{r.standoutName}</button>
                        {r.standoutKD > 0 && (
                          <span className="rc-standout-kd"> {r.standoutKD.toFixed(2)} K/D</span>
                        )}
                      </span>
                    )}
                    {r.mapResults && r.mapResults.length > 0 && (
                      <span className="rc-map-chips">
                        {r.mapResults.map((m, mi) => (
                          <span key={mi} className="rc-map-chip">{m.short}</span>
                        ))}
                      </span>
                    )}
                  </div>
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
