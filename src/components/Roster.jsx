// src/components/Roster.jsx
// Displays every team's roster. Clicking a player opens a centered modal.

import { useState } from "react";
import { useGame } from "../store/gameStore.jsx";
import { CDL_TEAMS } from "../data/teams.js";
import { calcChemistry, chemLabel } from "../engine/chemistry.js";

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
  if (v >= 90) return "#00e676";
  if (v >= 80) return "#69f0ae";
  if (v >= 70) return "#ffeb3b";
  if (v >= 60) return "#ffa726";
  return "#ef5350";
}

export default function Roster() {
  const { state, dispatch } = useGame();
  const [selectedTeam, setSelectedTeam] = useState(state?.userTeamId ?? "boston");
  const [modalPlayer,  setModalPlayer]  = useState(null);

  if (!state) return null;

  const { players, userTeamId } = state;
  const myPlayers = players.filter(p => p.teamId === selectedTeam);
  const chem = calcChemistry(myPlayers);
  const team = CDL_TEAMS.find(t => t.id === selectedTeam);

  const starters = myPlayers.filter(p => !p.isSub);
  const subs     = myPlayers.filter(p => p.isSub);
  const sorted   = [...starters, ...subs];

  return (
    <div className="roster-page">
      {/* Team selector */}
      <div className="team-tabs">
        {CDL_TEAMS.map(t => (
          <button
            key={t.id}
            className={`tab-btn ${selectedTeam === t.id ? "active" : ""}`}
            style={selectedTeam === t.id ? { borderBottomColor: t.color, color: t.color } : {}}
            onClick={() => { setSelectedTeam(t.id); setModalPlayer(null); }}
          >
            {t.tag}
          </button>
        ))}
      </div>

      <div className="roster-header">
        <h2 style={{ color: team?.color }}>{team?.name}</h2>
        <span className="chem-badge">Chemistry: {chem} – {chemLabel(chem)}</span>
      </div>

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
              {selectedTeam === userTeamId && <th>Action</th>}
            </tr>
          </thead>
          <tbody>
            {sorted.map(p => (
              <tr
                key={p.id}
                className={`player-row ${p.isSub ? "sub-row" : ""}`}
                onClick={() => setModalPlayer(p)}
                title="Click for player detail"
              >
                <td className="player-name">
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

      {/* ── Player detail modal ── */}
      {modalPlayer && (
        <PlayerModal
          player={modalPlayer}
          teamId={selectedTeam}
          isUserTeam={selectedTeam === userTeamId}
          matchLog={state?.schedule?.matchLog}
          playerSeasonStats={state?.playerSeasonStats}
          onClose={() => setModalPlayer(null)}
        />
      )}
    </div>
  );
}

// ── Player Modal ──────────────────────────────────────────────────────────────
function PlayerModal({ player, teamId, isUserTeam, matchLog, playerSeasonStats, onClose }) {
  const team = CDL_TEAMS.find(t => t.id === teamId);

  // Current season K/D
  let curKills = 0, curDeaths = 0, curMatches = 0;
  for (const result of (matchLog ?? [])) {
    const ps = result.playerStats?.[player.id];
    if (ps) {
      curKills   += ps.kills  ?? 0;
      curDeaths  += ps.deaths ?? 0;
      curMatches += 1;
    }
  }
  const curKD = curDeaths > 0
    ? (curKills / curDeaths).toFixed(2)
    : curMatches > 0 ? curKills.toFixed(2) : "—";

  // Career stats
  const history = ((playerSeasonStats ?? {})[player.id] ?? [])
    .slice().sort((a, b) => a.season - b.season);
  const careerKills  = history.reduce((s, e) => s + e.kills,  0);
  const careerDeaths = history.reduce((s, e) => s + e.deaths, 0);
  const careerKD     = careerDeaths > 0 ? (careerKills / careerDeaths).toFixed(2) : "—";

  const traits = [
    { label: "Ego",             key: "ego",           desc: "High = volatile", invert: true },
    { label: "Work Ethic",      key: "workEthic",     desc: "Higher = faster dev" },
    { label: "Tilt Resistance", key: "tiltResistance",desc: "Higher = bounces back" },
    { label: "Leadership",      key: "leadership",    desc: "Boosts chemistry" },
    { label: "Meta Dependence", key: "metaDependence",desc: "High = risky on shifts", invert: true },
  ];

  function traitColor(val, invert) {
    const e = invert ? 6 - val : val;
    return e >= 4 ? "#00e676" : e >= 3 ? "#ffeb3b" : "#ef5350";
  }

  function ratingColor(v) {
    if (v >= 90) return "#00e676";
    if (v >= 80) return "#69f0ae";
    if (v >= 70) return "#ffeb3b";
    if (v >= 60) return "#ffa726";
    return "#ef5350";
  }

  return (
    <div className="player-modal-backdrop" onClick={onClose}>
      <div className="player-modal" onClick={e => e.stopPropagation()}>

        {/* ── Header ── */}
        <div className="pm-header" style={{ borderTopColor: team?.color ?? "var(--accent)" }}>
          <div className="pm-identity">
            <div className="pm-name">{player.name}</div>
            <div className="pm-meta">
              <span className="pm-team" style={{ color: team?.color }}>{team?.name ?? teamId}</span>
              <span className="pm-role role-pill">{player.primary}</span>
              {player.isSub && <span className="sub-label">SUB</span>}
            </div>
          </div>
          <div className="pm-ovr-block">
            <div className="pm-ovr" style={{ color: ratingColor(player.overall) }}>
              {player.overall}
            </div>
            <div className="pm-ovr-label">OVR</div>
          </div>
          <button className="pm-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="pm-body">
          {/* ── Attributes grid ── */}
          <div className="pm-section">
            <div className="pm-section-title">Attributes</div>
            <div className="pm-attr-grid">
              {RATING_KEYS.map(r => (
                <div key={r.key} className="pm-attr-row">
                  <span className="pm-attr-label">{r.label}</span>
                  <div className="pm-attr-bar">
                    <div
                      className="pm-attr-fill"
                      style={{ width: `${player[r.key]}%`, background: ratingColor(player[r.key]) }}
                    />
                  </div>
                  <span className="pm-attr-val" style={{ color: ratingColor(player[r.key]) }}>
                    {player[r.key]}
                  </span>
                </div>
              ))}
              <div className="pm-attr-row">
                <span className="pm-attr-label">Potential</span>
                <div className="pm-attr-bar">
                  <div
                    className="pm-attr-fill"
                    style={{ width: `${player.potential}%`, background: ratingColor(player.potential) }}
                  />
                </div>
                <span className="pm-attr-val" style={{ color: ratingColor(player.potential) }}>
                  {player.potential}
                </span>
              </div>
            </div>
          </div>

          {/* ── K/D Stats ── */}
          <div className="pm-section">
            <div className="pm-section-title">Performance</div>
            <div className="pm-kd-summary">
              <div className="pm-kd-stat">
                <div className="pm-kd-val">{curKD}</div>
                <div className="pm-kd-label">This Season K/D</div>
                <div className="pm-kd-sub muted">{curMatches} matches</div>
              </div>
              {history.length > 0 && (
                <div className="pm-kd-stat">
                  <div className="pm-kd-val">{careerKD}</div>
                  <div className="pm-kd-label">Career K/D</div>
                  <div className="pm-kd-sub muted">{history.reduce((s, e) => s + e.matches, 0)} matches</div>
                </div>
              )}
            </div>
            {history.length > 0 && (
              <table className="kd-history-table">
                <thead>
                  <tr><th>Season</th><th>G</th><th>K</th><th>D</th><th>K/D</th></tr>
                </thead>
                <tbody>
                  {history.map(e => {
                    const kd = e.deaths > 0 ? (e.kills / e.deaths).toFixed(2) : "—";
                    return (
                      <tr key={e.season}>
                        <td>S{e.season}</td>
                        <td>{e.matches}</td>
                        <td>{e.kills}</td>
                        <td>{e.deaths}</td>
                        <td className={parseFloat(kd) >= 1 ? "kd-pos" : "kd-neg"}>{kd}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            {curMatches === 0 && history.length === 0 && (
              <p className="muted" style={{ fontSize: 12 }}>No matches played yet.</p>
            )}
          </div>

          {/* ── Hidden traits (user team only) ── */}
          {isUserTeam && (
            <div className="pm-section">
              <div className="pm-section-title">Hidden Traits</div>
              {traits.map(t => (
                <div key={t.key} className="trait-row">
                  <span className="trait-label">{t.label}</span>
                  <span className="trait-dots">
                    {[1,2,3,4,5].map(d => (
                      <span
                        key={d}
                        className={`dot-pip ${d <= player[t.key] ? "filled" : ""}`}
                        style={d <= player[t.key] ? { background: traitColor(player[t.key], t.invert) } : {}}
                      />
                    ))}
                  </span>
                  <span className="trait-desc muted">{t.desc}</span>
                </div>
              ))}
            </div>
          )}

          {/* ── Bio ── */}
          <div className="pm-section pm-bio">
            <div className="pm-bio-row">
              <span className="pm-bio-label">Age</span>
              <span>{player.age}</span>
            </div>
            <div className="pm-bio-row">
              <span className="pm-bio-label">Region</span>
              <span>{player.region ?? "NA"}</span>
            </div>
            <div className="pm-bio-row">
              <span className="pm-bio-label">Experience</span>
              <span>{player.experience} season{player.experience !== 1 ? "s" : ""}</span>
            </div>
            <div className="pm-bio-row">
              <span className="pm-bio-label">Dev Curve</span>
              <span>{player.developmentCurve ?? "standard"}</span>
            </div>
            <div className="pm-bio-row">
              <span className="pm-bio-label">Salary</span>
              <span>${(player.salary / 1000).toFixed(0)}k</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
