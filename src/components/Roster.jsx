// src/components/Roster.jsx
// Displays every team's roster with full player stat breakdown.
// User team is shown first. Allows releasing players from user's team.

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

// Color scale: red → yellow → green
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
  const [expandedPlayer, setExpandedPlayer] = useState(null);

  if (!state) return null;

  const { players, userTeamId } = state;
  const myPlayers = players.filter(p => p.teamId === selectedTeam);
  const chem = calcChemistry(myPlayers);
  const team = CDL_TEAMS.find(t => t.id === selectedTeam);

  // Sort: starters first, then subs
  const starters = myPlayers.filter(p => !p.isSub);
  const subs = myPlayers.filter(p => p.isSub);
  const sorted = [...starters, ...subs];

  return (
    <div className="roster-page">
      {/* Team selector */}
      <div className="team-tabs">
        {CDL_TEAMS.map(t => (
          <button
            key={t.id}
            className={`tab-btn ${selectedTeam === t.id ? "active" : ""}`}
            style={selectedTeam === t.id ? { borderBottomColor: t.color, color: t.color } : {}}
            onClick={() => { setSelectedTeam(t.id); setExpandedPlayer(null); }}
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
              <>
                <tr
                  key={p.id}
                  className={`player-row ${p.isSub ? "sub-row" : ""} ${expandedPlayer === p.id ? "expanded" : ""}`}
                  onClick={() => setExpandedPlayer(expandedPlayer === p.id ? null : p.id)}
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
                {expandedPlayer === p.id && (
                  <tr key={`${p.id}-expand`} className="expand-row">
                    <td colSpan={selectedTeam === userTeamId ? 15 : 14}>
                      <PlayerDetail
                        player={p}
                        isUserTeam={selectedTeam === userTeamId}
                        matchLog={state?.schedule?.matchLog}
                        playerSeasonStats={state?.playerSeasonStats}
                      />
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// Expanded detail panel: traits (user-team only) + K/D stats for all
function PlayerDetail({ player, isUserTeam, matchLog, playerSeasonStats }) {
  // ── Current season K/D from live matchLog ──────────────────────────────────
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

  // ── Career stats from completed seasons ───────────────────────────────────
  const history = ((playerSeasonStats ?? {})[player.id] ?? [])
    .slice()
    .sort((a, b) => a.season - b.season);
  const careerKills  = history.reduce((s, e) => s + e.kills,  0);
  const careerDeaths = history.reduce((s, e) => s + e.deaths, 0);
  const careerKD = careerDeaths > 0 ? (careerKills / careerDeaths).toFixed(2) : "—";

  const traits = [
    { label: "Ego",             key: "ego",             desc: "High ego = ego clashes, volatile", invert: true },
    { label: "Work Ethic",      key: "workEthic",        desc: "Higher = faster development" },
    { label: "Tilt Resistance", key: "tiltResistance",   desc: "Higher = bounces back from losses" },
    { label: "Leadership",      key: "leadership",       desc: "Boosts team chemistry" },
    { label: "Meta Dependence", key: "metaDependence",   desc: "High = risky on meta shifts", invert: true },
  ];

  function traitColor(val, invert) {
    const effective = invert ? 6 - val : val;
    if (effective >= 4) return "#00e676";
    if (effective >= 3) return "#ffeb3b";
    return "#ef5350";
  }

  return (
    <div className="player-detail">
      <div className="detail-col">
        <strong>Secondary Role:</strong> {player.secondary}
        <br /><strong>Region:</strong> {player.region ?? "NA"}
        <br /><strong>Dev Curve:</strong> {player.developmentCurve ?? "standard"}
        <br /><strong>Experience:</strong> {player.experience} seasons
      </div>
      {isUserTeam && (
        <div className="detail-col">
          <strong>Hidden Traits:</strong>
          {traits.map(t => (
            <div key={t.key} className="trait-row">
              <span className="trait-label">{t.label}</span>
              <span className="trait-dots">
                {[1,2,3,4,5].map(d => (
                  <span key={d} className={`dot-pip ${d <= player[t.key] ? "filled" : ""}`}
                    style={d <= player[t.key] ? { background: traitColor(player[t.key], t.invert) } : {}} />
                ))}
              </span>
              <span className="trait-desc muted">{t.desc}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── K/D Stats ── */}
      <div className="detail-col detail-kd">
        <strong>K/D Stats</strong>
        <div className="kd-summary">
          <span>Current Season: <strong>{curKD}</strong> <span className="muted">({curMatches}G)</span></span>
          {history.length > 0 && (
            <span>Career: <strong>{careerKD}</strong></span>
          )}
        </div>
        {history.length > 0 && (
          <table className="kd-history-table">
            <thead>
              <tr><th>S</th><th>G</th><th>K</th><th>D</th><th>K/D</th></tr>
            </thead>
            <tbody>
              {history.map(e => {
                const kd = e.deaths > 0 ? (e.kills / e.deaths).toFixed(2) : "—";
                return (
                  <tr key={e.season}>
                    <td>{e.season}</td>
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
        {history.length === 0 && curMatches === 0 && (
          <p className="muted" style={{ fontSize: 11, marginTop: 4 }}>No matches played yet.</p>
        )}
      </div>
    </div>
  );
}
