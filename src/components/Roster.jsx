// src/components/Roster.jsx
// Displays every team's roster. Clicking a player opens the global player profile.

import { useState } from "react";
import { useGame } from "../store/gameStore.jsx";
import { CDL_TEAMS } from "../data/teams.js";
import { calcChemistry, chemLabel } from "../engine/chemistry.js";
import { getTeamRosterStatus } from "../utils/rosterValidation.js";
import { usePlayerProfile } from "../store/playerProfileContext.jsx";

const RATING_KEYS = [
  { key: "gunny",        label: "Gunny" },
  { key: "awareness",    label: "Awareness" },
  { key: "objective",    label: "Obj" },
  { key: "searchIQ",     label: "S.IQ" },
  { key: "clutch",       label: "Clutch" },
  { key: "teamwork",     label: "T.Work" },
  { key: "composure",    label: "Composure" },
  { key: "adaptability", label: "Adapt." },
];

function ratingColor(v) {
  if (v >= 90) return "#166534";
  if (v >= 80) return "#15803d";
  if (v >= 70) return "#b45309";
  if (v >= 60) return "#c2410c";
  return "#ef5350";
}

export default function Roster() {
  const { state, dispatch } = useGame();
  const { openPlayerProfile } = usePlayerProfile();
  const [selectedTeam, setSelectedTeam] = useState(state?.userTeamId ?? "boston");

  if (!state) return null;

  const { players, userTeamId } = state;
  const myPlayers = players.filter(p => p.teamId === selectedTeam);
  const chem = calcChemistry(myPlayers);
  const team = CDL_TEAMS.find(t => t.id === selectedTeam);

  const starters = myPlayers.filter(p => !p.isSub);
  const subs     = myPlayers.filter(p => p.isSub);
  const sorted   = [...starters, ...subs];
  const rosterStatus = getTeamRosterStatus(players, selectedTeam);
  const showIncomplete = selectedTeam === userTeamId && !rosterStatus.valid;

  return (
    <div className="roster-page">
      {/* Team selector */}
      <div className="team-tabs">
        {CDL_TEAMS.map(t => (
          <button
            key={t.id}
            className={`tab-btn ${selectedTeam === t.id ? "active" : ""}`}
            style={selectedTeam === t.id ? { borderBottomColor: t.color, color: t.color } : {}}
            onClick={() => setSelectedTeam(t.id)}
          >
            {t.tag}
          </button>
        ))}
      </div>

      <div className="roster-header">
        <h2 style={{ color: team?.color }}>{team?.name}</h2>
        <span className="chem-badge">Chemistry: {chem} – {chemLabel(chem)}</span>
      </div>

      {showIncomplete && (
        <div className="roster-warning" role="status">
          <strong>Roster incomplete</strong> — {team?.name} have {rosterStatus.count}/{rosterStatus.required} starters.
          Sign {rosterStatus.missing} more {rosterStatus.missing === 1 ? "player" : "players"} before playing or simming matches.
        </div>
      )}

      {sorted.length === 0 ? (
        <p className="muted">No players on this roster.</p>
      ) : (
        <table className="roster-table">
          <thead>
            <tr>
              <th>Player</th>
              <th>Age</th>
              <th>Role</th>
              <th>OVR</th>
              <th>POT</th>
              <th>Form</th>
              {RATING_KEYS.map(r => <th key={r.key}>{r.label}</th>)}
              <th>Salary</th>
              <th>Yrs</th>
              {selectedTeam === userTeamId && <th>Action</th>}
            </tr>
          </thead>
          <tbody>
            {sorted.map(p => (
              <tr
                key={p.id}
                className={`player-row ${p.isSub ? "sub-row" : ""}`}
                onClick={() => openPlayerProfile(p)}
                title="Click for player detail"
              >
                <td
                  className="player-name"
                  style={{
                    borderLeft: `3px solid ${
                      p.overall >= 90 ? "#b45309"
                      : p.overall >= 85 ? "#15803d"
                      : p.overall >= 80 ? "#3d8f5f"
                      : "var(--border)"
                    }`,
                    borderRadius: "6px 0 0 6px",
                    paddingLeft: 8,
                  }}
                >
                  {p.name} {p.isSub && <span className="sub-label">SUB</span>}
                </td>
                <td>{p.age}</td>
                <td><span className="role-pill">{p.primary}</span></td>
                <td><span style={{ color: ratingColor(p.overall), fontWeight: "bold" }}>{p.overall}</span></td>
                <td><span style={{ color: ratingColor(p.potential) }}>{p.potential}</span></td>
                <td>
                  <div className="form-bar">
                    <div className="form-fill" style={{ width: `${p.form}%`, background: ratingColor(p.form) }} />
                  </div>
                  <span className="form-num">{Math.round(p.form)}</span>
                </td>
                {RATING_KEYS.map(r => (
                  <td key={r.key} style={{ color: ratingColor(p[r.key]) }}>{p[r.key]}</td>
                ))}
                <td className="salary">${(p.salary / 1000).toFixed(0)}k</td>
                <td style={{ color: (p.contractYears ?? 2) <= 1 ? "#ff6450" : "var(--text-dim)", fontSize: 12 }}>
                  {p.contractYears ?? "—"}
                </td>
                {selectedTeam === userTeamId && (
                  <td>
                    <button
                      className="btn-danger-sm"
                      onClick={e => { e.stopPropagation(); dispatch({ type: "RELEASE_PLAYER", playerId: p.id }); }}
                    >
                      Release
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

    </div>
  );
}
