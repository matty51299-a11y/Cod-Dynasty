// src/components/Dashboard.jsx
// Main hub: team summary, sim controls, clickable Recent Results.
// Clicking a result row expands a full series breakdown inline.

import { useState } from "react";
import { useGame } from "../store/gameStore.jsx";
import { CDL_TEAMS } from "../data/teams.js";
import { calcChemistry, chemLabel } from "../engine/chemistry.js";
import SeriesDetail from "./SeriesDetail.jsx";

export default function Dashboard() {
  const { state, dispatch } = useGame();
  // Index (into myLog) of the currently expanded result row, or null
  const [expandedIdx, setExpandedIdx] = useState(null);

  if (!state) return null;

  const { schedule, userTeamId, season, players } = state;
  const team     = CDL_TEAMS.find(t => t.id === userTeamId);
  const myPlayers = players.filter(p => p.teamId === userTeamId);
  const chem      = calcChemistry(myPlayers);

  const standings  = schedule.standings ?? {};
  const myStanding = standings[userTeamId] ?? { wins: 0, losses: 0, points: 0 };

  const phase    = schedule.phase;
  const stageIdx = schedule.currentStage ?? 0;
  const stageName = schedule.stages?.[stageIdx]?.name ?? "—";
  const majorName = schedule.majors?.[stageIdx]?.name ?? "Major";

  // Last 5 matches involving the user's team, newest first
  const myLog = [...(schedule.matchLog || [])]
    .reverse()
    .filter(r => r.winnerId === userTeamId || r.loserId === userTeamId)
    .slice(0, 5);

  const currentStage = schedule.stages?.[stageIdx];
  const remaining    = currentStage ? currentStage.matches.filter(m => !m.played).length : 0;

  const isOffseason = phase === "offseason";
  const isMajor     = phase === "major";
  const isStage     = phase === "stage";

  function toggleRow(i) {
    setExpandedIdx(prev => (prev === i ? null : i));
  }

  return (
    <div className="dashboard">
      {/* ── Header ── */}
      <div className="dashboard-header">
        <div>
          <h2 style={{ color: team?.color ?? "#fff" }}>{team?.name ?? userTeamId}</h2>
          <p className="muted">
            Season {season} · {isOffseason ? "Offseason" : isMajor ? majorName : stageName}
          </p>
        </div>
        <div className="stat-row">
          <Stat label="Record"    value={`${myStanding.wins}W – ${myStanding.losses}L`} />
          <Stat label="Points"    value={myStanding.points} />
          <Stat label="Chemistry" value={`${chem} (${chemLabel(chem)})`} />
          <Stat label="Roster"    value={`${myPlayers.length} players`} />
        </div>
      </div>

      {/* ── Sim controls ── */}
      <div className="sim-controls">
        {isStage && (
          <>
            <button className="btn-primary" onClick={() => { dispatch({ type: "SIM_MATCHDAY" }); setExpandedIdx(null); }}>
              Simulate Matchday <span className="badge">{remaining} left</span>
            </button>
            <button className="btn-secondary" onClick={() => { dispatch({ type: "SIM_STAGE" }); setExpandedIdx(null); }}>
              Sim Rest of {stageName}
            </button>
          </>
        )}
        {isMajor && (
          <p className="muted" style={{ fontSize: 13, alignSelf: "center" }}>
            ▶ {majorName} is live — go to the <strong>Major</strong> tab to simulate
          </p>
        )}
        {isOffseason && (
          <button className="btn-accent" onClick={() => dispatch({ type: "ADVANCE_OFFSEASON" })}>
            Start Season {season + 1}
          </button>
        )}
      </div>

      {/* ── Recent Results ── */}
      <div className="section">
        <h3>Recent Results <span className="muted" style={{ fontWeight: 400, fontSize: 11 }}>— click a row for full breakdown</span></h3>

        {myLog.length === 0 ? (
          <p className="muted">No matches played yet.</p>
        ) : (
          <div className="recent-results-list">
            {myLog.map((r, i) => {
              const won    = r.winnerId === userTeamId;
              const opp    = won ? r.loserName : r.winnerName;
              const isOpen = expandedIdx === i;
              const maps   = r.mapResults?.map(m => m.short).join(" · ") ?? null;

              return (
                <div
                  key={i}
                  className={`recent-result-card ${won ? "rr-win" : "rr-loss"} ${isOpen ? "rr-open" : ""}`}
                  onClick={() => toggleRow(i)}
                >
                  {/* ── Compact summary row ── */}
                  <div className="rr-summary">
                    <span className={`rr-wl ${won ? "win" : "loss"}`}>{won ? "W" : "L"}</span>
                    <span className="rr-opp">{won ? `vs ${opp}` : `vs ${opp}`}</span>
                    <span className="rr-score">{r.score}</span>
                    {maps && <span className="rr-maps muted">{maps}</span>}
                    <span className="rr-standout muted">
                      ⭐ {r.standoutName ?? "—"}
                      {r.standoutKD > 0 && ` · ${r.standoutKD.toFixed(2)} K/D`}
                    </span>
                    <span className="rr-stage muted">{r.stage}</span>
                    <span className="rr-chevron">{isOpen ? "▲" : "▼"}</span>
                  </div>

                  {/* ── Expanded series detail ── */}
                  {isOpen && (
                    <div onClick={e => e.stopPropagation()}>
                      <SeriesDetail result={r} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Champion banners ── */}
      {schedule.majors?.map((major, i) => {
        if (!major.completed || !major.bracket?.champion) return null;
        const champ = CDL_TEAMS.find(t => t.id === major.bracket.champion);
        return (
          <div key={i} className="champion-banner" style={{ borderColor: champ?.color }}>
            🏆 {major.name} Champion:{" "}
            <strong style={{ color: champ?.color }}>{champ?.name ?? major.bracket.champion}</strong>
          </div>
        );
      })}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="stat-box">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  );
}
