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

  const { players, userTeamId, progressionLog } = state;
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
              <th>Yrs</th>
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

      {/* ── Player detail modal ── */}
      {modalPlayer && (
        <PlayerModal
          player={modalPlayer}
          teamId={selectedTeam}
          isUserTeam={selectedTeam === userTeamId}
          matchLog={state?.schedule?.matchLog}
          playerSeasonStats={state?.playerSeasonStats}
          progressionLog={progressionLog}
          onClose={() => setModalPlayer(null)}
        />
      )}
    </div>
  );
}

// ── Player Modal ──────────────────────────────────────────────────────────────
function PlayerModal({ player, teamId, isUserTeam, matchLog, playerSeasonStats, progressionLog, onClose }) {
  const team = CDL_TEAMS.find(t => t.id === teamId);

  // ── Stats ─────────────────────────────────────────────────────────────────
  // Current-season K/D from live matchLog
  let curKills = 0, curDeaths = 0, curMatches = 0;
  for (const result of (matchLog ?? [])) {
    const ps = result.playerStats?.[player.id];
    if (ps) { curKills += ps.kills ?? 0; curDeaths += ps.deaths ?? 0; curMatches += 1; }
  }
  const curKD = curDeaths > 0 ? (curKills / curDeaths).toFixed(2)
              : curMatches > 0 ? curKills.toFixed(2) : "—";

  // Career K/D from playerSeasonStats (completed seasons)
  const history = ((playerSeasonStats ?? {})[player.id] ?? [])
    .slice().sort((a, b) => a.season - b.season);
  const careerKills  = history.reduce((s, e) => s + e.kills,  0);
  const careerDeaths = history.reduce((s, e) => s + e.deaths, 0);
  const careerKD = careerDeaths > 0 ? (careerKills / careerDeaths).toFixed(2) : "—";
  const careerMatches = history.reduce((s, e) => s + e.matches, 0);

  // Last offseason OVR delta from progressionLog (current season's log only)
  const lastProg = (progressionLog ?? []).find(e => e.id === player.id);

  // ── Derived identity fields ───────────────────────────────────────────────
  const region = player.region ?? "Unknown";
  const isUnsigned = !player.teamId;
  const isChallenger = isUnsigned && player.isProspect;
  const statusLabel = isChallenger ? "Challengers" : isUnsigned ? "Free Agent" : null;

  const TRAITS = [
    { label: "Work Ethic",      key: "workEthic",     desc: "Higher = faster dev",       invert: false },
    { label: "Tilt Resistance", key: "tiltResistance",desc: "Higher = bounces back",      invert: false },
    { label: "Leadership",      key: "leadership",    desc: "Boosts team chemistry",      invert: false },
    { label: "Ego",             key: "ego",           desc: "High = volatile",            invert: true  },
    { label: "Meta Dependence", key: "metaDependence",desc: "High = risky on meta shifts",invert: true  },
  ];

  function traitColor(val, invert) {
    const e = invert ? 6 - val : val;
    return e >= 4 ? "#00e676" : e >= 3 ? "#ffeb3b" : "#ef5350";
  }

  const contractColor = (player.contractYears ?? 2) <= 1 ? "#ff6450" : "var(--text)";

  return (
    <div className="player-modal-backdrop" onClick={onClose}>
      <div className="player-modal pm-wide" onClick={e => e.stopPropagation()}>

        {/* ════ HEADER ════════════════════════════════════════════════════════ */}
        <div className="pm-header" style={{ borderTopColor: team?.color ?? "var(--accent)" }}>
          <div className="pm-identity">

            {/* Name */}
            <div className="pm-name">{player.name}</div>

            {/* Team · Region · Role · [SUB] */}
            <div className="pm-meta">
              {!isUnsigned && (
                <span className="pm-team" style={{ color: team?.color }}>
                  {team?.name ?? teamId}
                </span>
              )}
              {isUnsigned && (
                <span style={{ color: "#777", fontSize: "12px" }}>{statusLabel}</span>
              )}
              <span className="pm-dot">·</span>
              <span className="pm-region-badge">{region}</span>
              <span className="pm-dot">·</span>
              <span className="role-pill pm-role">{player.primary}</span>
              {player.secondary && (
                <span className="pm-secondary muted">/ {player.secondary}</span>
              )}
              {player.isSub && <span className="sub-label">SUB</span>}
            </div>

            {/* Info strip: Age · POT · Salary · Contract · Dev */}
            <div className="pm-info-strip">
              <span><span className="pm-strip-lbl">Age</span> {player.age}</span>
              <span>
                <span className="pm-strip-lbl">POT</span>{" "}
                <span style={{ color: ratingColor(player.potential), fontWeight: 700 }}>
                  {player.potential}
                </span>
              </span>
              <span><span className="pm-strip-lbl">Salary</span> ${(player.salary / 1000).toFixed(0)}k</span>
              {player.contractYears != null && (
                <span style={{ color: contractColor }}>
                  {player.contractYears} yr{player.contractYears !== 1 ? "s" : ""}
                  {player.contractYears <= 1 && " ⚠"}
                </span>
              )}
              <span>
                <span className="pm-strip-lbl">Dev</span>{" "}
                {player.developmentCurve ?? "standard"}
              </span>
              {(player.experience ?? 0) > 0 && (
                <span>
                  <span className="pm-strip-lbl">Exp</span>{" "}
                  {player.experience} season{player.experience !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          </div>

          {/* OVR block */}
          <div className="pm-ovr-block">
            <div className="pm-ovr" style={{ color: ratingColor(player.overall) }}>
              {player.overall}
            </div>
            <div className="pm-ovr-label">OVR</div>
            {lastProg && lastProg.delta !== 0 && (
              <div className="pm-ovr-delta" style={{
                color: lastProg.delta > 0 ? "#69f0ae" : "#ef5350",
              }}>
                {lastProg.delta > 0 ? "▲" : "▼"}{Math.abs(lastProg.delta)}
              </div>
            )}
          </div>

          <button className="pm-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* ════ BODY ══════════════════════════════════════════════════════════ */}
        <div className="pm-body">

          {/* ── Performance summary bubbles ── */}
          {(curMatches > 0 || history.length > 0) && (
            <div className="pm-section">
              <div className="pm-section-title">Performance</div>
              <div className="pm-kd-summary">
                {curMatches > 0 && (
                  <div className="pm-kd-stat">
                    <div className="pm-kd-val">{curKD}</div>
                    <div className="pm-kd-label">This Season K/D</div>
                    <div className="pm-kd-sub muted">{curMatches} match{curMatches !== 1 ? "es" : ""}</div>
                  </div>
                )}
                {careerMatches > 0 && (
                  <div className="pm-kd-stat">
                    <div className="pm-kd-val">{careerKD}</div>
                    <div className="pm-kd-label">Career K/D</div>
                    <div className="pm-kd-sub muted">{careerMatches} total</div>
                  </div>
                )}
                {lastProg && (
                  <div className="pm-kd-stat">
                    <div className="pm-kd-val" style={{
                      color: lastProg.delta > 0 ? "#69f0ae" : lastProg.delta < 0 ? "#ef5350" : "#777"
                    }}>
                      {lastProg.delta > 0 ? "+" : ""}{lastProg.delta}
                    </div>
                    <div className="pm-kd-label">Last Offseason Δ</div>
                    <div className="pm-kd-sub muted">
                      {lastProg.eventType
                        ? (lastProg.eventType === "breakout" ? "⚡ Breakout" : "⚡ Collapse")
                        : (lastProg.delta === 0 ? "Plateau" : "Progression")}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Season history table ── */}
          {history.length > 0 && (
            <div className="pm-section">
              <div className="pm-section-title">Season History</div>
              <table className="kd-history-table">
                <thead>
                  <tr>
                    <th>Season</th>
                    <th>G</th>
                    <th>Kills</th>
                    <th>Deaths</th>
                    <th>K/D</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map(e => {
                    const kd = e.deaths > 0 ? (e.kills / e.deaths).toFixed(2)
                             : e.kills > 0   ? e.kills.toFixed(2) : "—";
                    return (
                      <tr key={e.season}>
                        <td style={{ fontWeight: 600 }}>S{e.season}</td>
                        <td>{e.matches}</td>
                        <td>{e.kills}</td>
                        <td>{e.deaths}</td>
                        <td className={parseFloat(kd) >= 1 ? "kd-pos" : "kd-neg"}>{kd}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Attributes – 2-column grid ── */}
          <div className="pm-section">
            <div className="pm-section-title">Attributes</div>
            <div className="pm-attr-2col">
              {RATING_KEYS.map(r => (
                <div key={r.key} className="pm-attr-row">
                  <span className="pm-attr-label">{r.label}</span>
                  <div className="pm-attr-bar">
                    <div className="pm-attr-fill"
                      style={{ width: `${player[r.key]}%`, background: ratingColor(player[r.key]) }} />
                  </div>
                  <span className="pm-attr-val" style={{ color: ratingColor(player[r.key]) }}>
                    {player[r.key]}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Hidden traits (user team only) ── */}
          {isUserTeam && (
            <div className="pm-section">
              <div className="pm-section-title">Hidden Traits</div>
              <div className="pm-traits-grid">
                {TRAITS.map(t => (
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
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
