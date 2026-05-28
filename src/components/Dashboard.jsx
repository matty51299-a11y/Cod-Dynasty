// src/components/Dashboard.jsx
// FM-style dashboard: full-width two-column layout with club banner, card grid, and right panel.

import { useState } from "react";
import { useGame } from "../store/gameStore.jsx";
import { CDL_TEAMS } from "../data/teams.js";
import { calcChemistry, chemLabel } from "../engine/chemistry.js";
import { calcTeamOvr } from "../engine/teamOvr.js";
import { getTeamCap, getSigningCost, getResignDemand } from "../engine/rosterAI.js";
import SeriesDetail from "./SeriesDetail.jsx";
import { useTeamHub } from "../store/teamHubContext.jsx";

function teamColor(id) { return CDL_TEAMS.find(t => t.id === id)?.color ?? "#888"; }
function teamName(id)  { return CDL_TEAMS.find(t => t.id === id)?.name  ?? id; }

// Darken a hex color until it meets the target contrast ratio vs white (#ffffff).
// minRatio: 4.5 for body text, 3.0 for large/bold text (WCAG AA).
function ensureContrast(hex, minRatio = 4.5) {
  try {
    if (!hex || !hex.startsWith('#') || hex.length !== 7) return hex;
    const toLinear = c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    const lum = h => {
      const r = parseInt(h.slice(1, 3), 16) / 255;
      const g = parseInt(h.slice(3, 5), 16) / 255;
      const b = parseInt(h.slice(5, 7), 16) / 255;
      return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
    };
    let factor = 1.0;
    let current = hex;
    while (factor >= 0.3) {
      if (1.05 / (lum(current) + 0.05) >= minRatio) return current;
      factor -= 0.05;
      const ri = Math.round(parseInt(hex.slice(1, 3), 16) * factor);
      const gi = Math.round(parseInt(hex.slice(3, 5), 16) * factor);
      const bi = Math.round(parseInt(hex.slice(5, 7), 16) * factor);
      current = `#${ri.toString(16).padStart(2, '0')}${gi.toString(16).padStart(2, '0')}${bi.toString(16).padStart(2, '0')}`;
    }
    return current;
  } catch { return hex; }
}

function ratingColor(v) {
  if (v >= 90) return "#b45309";   // dark gold (readable on light)
  if (v >= 85) return "#15803d";   // dark green
  if (v >= 80) return "#0f766e";   // teal
  if (v >= 70) return "#d97706";   // amber
  return "#dc2626";                // red
}

function chemColor(chem) {
  if (chem >= 80) return "#15803d";
  if (chem >= 60) return "#d97706";
  return "#dc2626";
}

// Hex color with alpha suffix (e.g. teamColor + "18" = 9% opacity)
function hexAlpha(hex, alphaHex) {
  return `${hex}${alphaHex}`;
}

export default function Dashboard({ setScreen }) {
  const { state, dispatch } = useGame();
  const { openTeamHub } = useTeamHub();
  const [expandedIdx, setExpandedIdx] = useState(null);

  if (!state) return null;

  const { schedule, userTeamId, season, players, progressionLog } = state;
  const team      = CDL_TEAMS.find(t => t.id === userTeamId);
  const myPlayers = players.filter(p => p.teamId === userTeamId);
  const chem      = calcChemistry(myPlayers);
  const teamOvr   = calcTeamOvr(userTeamId, players);

  const phase      = schedule.phase;
  const stageIdx   = schedule.stageIdx  ?? schedule.currentStage ?? 0;
  const majorIdx   = schedule.majorIdx  ?? (phase === "major" ? (schedule.currentStage ?? 0) : 0);
  const stageName  = schedule.stages?.[stageIdx]?.name  ?? "Stage";
  const majorName  = schedule.majors?.[majorIdx]?.name  ?? "Major";

  const stageStandings = schedule.stageStandings ?? {};
  const cumStandings   = schedule.standings ?? {};
  const myStage  = stageStandings[userTeamId] ?? { wins: 0, losses: 0, points: 0 };
  const mySeason = cumStandings[userTeamId]   ?? { wins: 0, losses: 0, points: 0 };

  const isStage     = phase === "stage";
  const isMajor     = phase === "major";
  const isPreChamps = phase === "preChamps";
  const isOffseason = phase === "offseason";
  const isContracts = phase === "contracts";

  // Stage progress
  const currentStage = isStage ? schedule.stages?.[stageIdx] : null;
  const remaining    = currentStage ? currentStage.matches.filter(m => !m.played).length : 0;
  const totalMatches = currentStage ? currentStage.matches.length : 0;
  const played       = totalMatches - remaining;
  const progress     = totalMatches > 0 ? Math.round((played / totalMatches) * 100) : 0;

  // Standings snapshot
  const standingsSource = (isStage || isMajor) ? stageStandings : cumStandings;
  const allTeamsRanked = CDL_TEAMS
    .map(t => ({ id: t.id, name: t.name, tag: t.tag, color: t.color,
                 rec: standingsSource[t.id] ?? { wins: 0, losses: 0, points: 0 } }))
    .sort((a, b) => b.rec.points - a.rec.points);

  const top5 = allTeamsRanked.slice(0, 5);

  // Next unplayed match for user
  const nextMatchInStage = isStage && currentStage
    ? currentStage.matches.find(m => !m.played && (m.a === userTeamId || m.b === userTeamId))
    : null;
  const nextOppId   = nextMatchInStage ? (nextMatchInStage.a === userTeamId ? nextMatchInStage.b : nextMatchInStage.a) : null;
  const nextOppTeam = nextOppId ? CDL_TEAMS.find(t => t.id === nextOppId) : null;
  const nextOppRec  = nextOppId ? (stageStandings[nextOppId] ?? { wins: 0, losses: 0 }) : null;

  // Remaining fixtures for user in this stage
  const remainingFixtures = isStage && currentStage
    ? currentStage.matches
        .filter(m => !m.played && (m.a === userTeamId || m.b === userTeamId))
        .slice(0, 6)
    : [];

  // Highlights
  const topPlayer = myPlayers.filter(p => !p.isSub).sort((a, b) => b.overall - a.overall)[0] ?? null;

  const topTeamEntry = allTeamsRanked[0];
  const topTeam       = topTeamEntry;
  const topTeamHasMatches = (topTeam?.rec.wins ?? 0) + (topTeam?.rec.losses ?? 0) > 0;

  const progLog = progressionLog ?? [];
  const breakouts = progLog.filter(e => e.eventType === "breakout" && e.delta > 0).sort((a, b) => b.delta - a.delta);
  const collapses = progLog.filter(e => e.eventType === "collapse" && e.delta < 0).sort((a, b) => a.delta - b.delta);
  const biggestBreakout = breakouts[0] ?? null;
  const biggestCollapse = collapses[0] ?? null;

  // Recent results
  const myLog = [...(schedule.matchLog || [])]
    .reverse()
    .filter(r => r.winnerId === userTeamId || r.loserId === userTeamId)
    .slice(0, 5);

  // Form guide: last 5 as W/L
  const formResults = myLog.slice(0, 5);
  const formWins  = formResults.filter(r => r.winnerId === userTeamId).length;
  const formLoss  = formResults.length - formWins;

  function toggleRow(i) { setExpandedIdx(prev => (prev === i ? null : i)); }

  const phaseChipClass = isMajor ? "db-phase-chip db-phase-chip-major"
    : (isOffseason || isContracts) ? "db-phase-chip db-phase-chip-offseason"
    : "db-phase-chip";

  const phaseLabel = isOffseason  ? "Offseason"
    : isContracts  ? "Contract Period"
    : isMajor      ? majorName
    : isPreChamps   ? "Pre-Champs Window"
    : stageName;

  const teamHex = team?.color ?? "#2563eb";
  const teamHexSafe = ensureContrast(teamHex, 3.0);   // large/bold text threshold
  const teamHexBody = ensureContrast(teamHex, 4.5);   // body-size text threshold
  const bannerGradient = `linear-gradient(135deg, ${teamHex}18 0%, #ffffff 60%)`;

  return (
    <div className="dashboard">

      {/* ── Club Banner (full width) ── */}
      <div
        className="db-club-banner"
        style={{ borderTop: `3px solid ${teamHex}`, background: bannerGradient }}
      >
        <div className="db-cb-inner">
          <div className="db-cb-left">
            <div>
              <h2 className="db-cb-team-name" style={{ color: teamHexSafe }}>
                {team?.name ?? userTeamId}
              </h2>
              <div className="db-cb-meta">
                <span className={phaseChipClass}>{phaseLabel}</span>
                <span className="db-season-tag">Season {season}</span>
              </div>
            </div>

            <div className="db-stat-chips">
              {isStage && (
                <>
                  <div className="db-stat-chip">
                    <span className="db-stat-chip-label">{stageName}</span>
                    <span className="db-stat-chip-value">{myStage.wins}W – {myStage.losses}L</span>
                  </div>
                  <div className="db-stat-chip">
                    <span className="db-stat-chip-label">Stage Pts</span>
                    <span className="db-stat-chip-value">{myStage.points}</span>
                  </div>
                  <div className="db-stat-chip">
                    <span className="db-stat-chip-label">Season Pts</span>
                    <span className="db-stat-chip-value">{mySeason.points}</span>
                  </div>
                </>
              )}
              {(isMajor || isPreChamps) && (
                <>
                  <div className="db-stat-chip">
                    <span className="db-stat-chip-label">Season Record</span>
                    <span className="db-stat-chip-value">{mySeason.wins}W – {mySeason.losses}L</span>
                  </div>
                  <div className="db-stat-chip">
                    <span className="db-stat-chip-label">Season Pts</span>
                    <span className="db-stat-chip-value">{mySeason.points}</span>
                  </div>
                </>
              )}
              {(isOffseason || isContracts) && (
                <div className="db-stat-chip">
                  <span className="db-stat-chip-label">Final Record</span>
                  <span className="db-stat-chip-value">{mySeason.wins}W – {mySeason.losses}L</span>
                </div>
              )}
              <div className="db-stat-chip">
                <span className="db-stat-chip-label">Chemistry</span>
                <span className="db-stat-chip-value" style={{ color: chemColor(chem) }}>
                  {chem}
                  <span style={{ fontSize: 11, fontWeight: 500, color: "var(--text-dim)", marginLeft: 4 }}>
                    ({chemLabel(chem)})
                  </span>
                </span>
              </div>
              <div className="db-stat-chip">
                <span className="db-stat-chip-label">Team OVR</span>
                <span className="db-stat-chip-value" style={{ color: ratingColor(teamOvr) }}>
                  {teamOvr}
                </span>
              </div>
            </div>

            {isStage && totalMatches > 0 && (
              <div className="db-progress">
                <div className="db-progress-bar">
                  <div
                    className="db-progress-fill"
                    style={{ width: `${progress}%`, background: teamHex }}
                  />
                </div>
                <span className="db-progress-label">{played} / {totalMatches} matches</span>
              </div>
            )}
          </div>

          <div className="db-cb-right">
            {isStage && remaining > 0 && (
              <>
                <span className="db-cb-cta-hint">Skip ahead</span>
                <button
                  className="btn-cta"
                  style={{ background: "var(--bg3)", color: "var(--text)", border: "1px solid var(--border)" }}
                  onClick={() => { dispatch({ type: "SIM_STAGE" }); setExpandedIdx(null); }}
                >
                  Sim Rest of {stageName}
                  <span className="btn-cta-badge" style={{ background: "rgba(0,0,0,0.08)" }}>{remaining} left</span>
                </button>
              </>
            )}
            {isPreChamps && (
              <>
                <span className="db-cb-cta-hint">Roster lock incoming</span>
                <button className="btn-cta" onClick={() => dispatch({ type: "BEGIN_CHAMPS" })}>
                  Begin Championship →
                </button>
              </>
            )}
            {isOffseason && (
              <>
                <span className="db-cb-cta-hint">Season complete</span>
                <button className="btn-cta" onClick={() => dispatch({ type: "ENTER_CONTRACT_PHASE" })}>
                  Review Contracts →
                </button>
              </>
            )}
            {isContracts && (
              <>
                <span className="db-cb-cta-hint">Review below then continue</span>
                <button className="btn-cta" onClick={() => dispatch({ type: "ADVANCE_OFFSEASON" })}>
                  Advance Offseason →
                </button>
              </>
            )}
            {isMajor && (
              <span style={{ fontSize: 12, color: "var(--text-dim)", maxWidth: 180 }}>
                Tournament in progress — use the overlay above to proceed.
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Two-column layout ── */}
      <div className="db-layout">

        {/* ── Main column ── */}
        <div className="db-main">

          {/* Card grid */}
          <div className="db-grid">

            {/* Squad card */}
            {topPlayer && (
              <div className="db-card" style={{ borderTopColor: teamHex }}>
                <div className="db-card-header">Your Squad</div>
                <div className="db-card-body">
                  <div className="db-top-player-name">{topPlayer.name}</div>
                  <div className="db-top-player-ovr" style={{ color: ratingColor(topPlayer.overall) }}>
                    {topPlayer.overall}
                  </div>
                  <div className="db-top-player-role">{topPlayer.primary} · Best OVR</div>
                  <div style={{ marginTop: 6, fontSize: 11, color: "var(--text-dim)" }}>
                    {myPlayers.filter(p => !p.isSub).length} starters
                    {myPlayers.filter(p => p.isSub).length > 0 &&
                      ` · ${myPlayers.filter(p => p.isSub).length} sub`}
                  </div>
                </div>
              </div>
            )}

            {/* Next Match card */}
            {isStage && nextOppTeam && (
              <div className="db-card" style={{ borderTopColor: "var(--accent)" }}>
                <div className="db-card-header">Next Match · {stageName}</div>
                <div className="db-card-body">
                  <div className="db-match-teams">
                    <span className="db-match-you" style={{ color: teamHexBody }}>
                      {team?.tag ?? userTeamId}
                    </span>
                    <span className="db-match-vs">vs</span>
                    <span
                      className="db-match-opp db-link"
                      style={{ color: ensureContrast(nextOppTeam.color, 4.5) }}
                      onClick={() => openTeamHub(nextOppId)}
                    >
                      {nextOppTeam.tag}
                    </span>
                  </div>
                  <div className="db-match-records">
                    <span>{myStage.wins}W – {myStage.losses}L</span>
                    <span>{nextOppRec.wins}W – {nextOppRec.losses}L</span>
                  </div>
                  <div style={{ marginTop: 8, fontSize: 11, color: "var(--text-dim)" }}>
                    {nextOppTeam.name}
                  </div>
                </div>
              </div>
            )}

            {/* Stage Standings card (top 5) */}
            {top5.length > 0 && (
              <div className="db-card" style={{ borderTopColor: "var(--border)" }}>
                <div className="db-card-header">
                  {isStage ? `${stageName} Standings` : "Stage Standings"}
                  <button
                    style={{ background: "none", border: "none", color: "var(--accent)", fontSize: 11, cursor: "pointer", padding: 0 }}
                    onClick={() => setScreen?.("standings")}
                  >
                    Full →
                  </button>
                </div>
                <div className="db-card-body" style={{ gap: 0 }}>
                  {top5.map((t, i) => (
                    <div
                      key={t.id}
                      className={`db-standing-row ${t.id === userTeamId ? "db-standing-you" : ""}`}
                    >
                      <span className="db-standing-rank">{i + 1}</span>
                      <span className="db-standing-dot" style={{ background: t.color }} />
                      <span
                        className="db-standing-name db-link"
                        style={{ color: t.id === userTeamId ? "var(--text-head)" : "var(--text)" }}
                        onClick={() => openTeamHub(t.id)}
                      >
                        {t.tag}
                      </span>
                      <span className="db-standing-rec">{t.rec.wins}W–{t.rec.losses}L</span>
                      <span className="db-standing-pts">{t.rec.points}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Stage/Season Leader card */}
            {topTeamHasMatches && topTeam && (
              <div className="db-card" style={{ borderTopColor: topTeam.color }}>
                <div className="db-card-header">
                  {(isStage || isMajor) ? "Stage Leader" : "Season Leader"}
                </div>
                <div className="db-card-body">
                  <div
                    className="db-hl-name db-link"
                    style={{ color: topTeam.color }}
                    onClick={() => openTeamHub(topTeam.id)}
                  >
                    {topTeam.name}
                  </div>
                  <div className="db-hl-val" style={{ color: topTeam.color }}>
                    {topTeam.rec.points}
                  </div>
                  <div className="db-hl-sub">
                    {topTeam.rec.wins}W – {topTeam.rec.losses}L · pts
                  </div>
                </div>
              </div>
            )}

            {/* Breakout card */}
            {biggestBreakout && (
              <div className="db-card" style={{ borderTopColor: "var(--green)" }}>
                <div className="db-card-header">Breakout</div>
                <div className="db-card-body">
                  <div className="db-hl-name">{biggestBreakout.name}</div>
                  <div className="db-hl-val db-val-green">+{biggestBreakout.delta}</div>
                  <div className="db-hl-sub">
                    {biggestBreakout.oldOverall} → {biggestBreakout.newOverall} OVR
                  </div>
                </div>
              </div>
            )}

            {/* Collapse card */}
            {biggestCollapse && (
              <div className="db-card" style={{ borderTopColor: "var(--red)" }}>
                <div className="db-card-header">Collapse</div>
                <div className="db-card-body">
                  <div className="db-hl-name">{biggestCollapse.name}</div>
                  <div className="db-hl-val db-val-red">{biggestCollapse.delta}</div>
                  <div className="db-hl-sub">
                    {biggestCollapse.oldOverall} → {biggestCollapse.newOverall} OVR
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Pre-Champs seeding */}
          {isPreChamps && (
            <div className="prechamps-info-box">
              <div className="pib-header">
                <span className="pib-icon">🏆</span>
                <div>
                  <div className="pib-title">Championship Seeding</div>
                  <div className="pib-note muted">
                    Top 8 by cumulative season points. Make roster moves before locking in.
                  </div>
                </div>
              </div>
              <div className="pib-seeds">
                {CDL_TEAMS
                  .map(t => ({ ...t, rec: cumStandings[t.id] ?? { wins: 0, losses: 0, points: 0 } }))
                  .sort((a, b) => b.rec.points - a.rec.points)
                  .slice(0, 8)
                  .map((t, i) => (
                    <div key={t.id} className={`pib-seed-row ${t.id === userTeamId ? "pib-seed-you" : ""}`}>
                      <span className="pib-seed-num">{i + 1}</span>
                      <span className="pib-dot" style={{ background: t.color }} />
                      <span className="pib-name">{t.name}</span>
                      <span className="pib-pts muted">{t.rec.points} pts</span>
                      {t.id === userTeamId && <span className="you-badge">YOU</span>}
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Contract review */}
          {isContracts && (
            <ContractReviewPanel
              players={myPlayers}
              dispatch={dispatch}
              season={season}
              userTeamId={userTeamId}
              playerSeasonStats={state.playerSeasonStats}
            />
          )}

          {/* Recent Results */}
          <div className="db-results-card">
            <div className="db-results-header">
              Recent Results
              <span className="db-results-hint">click for breakdown</span>
            </div>
            <div className="db-results-body">
              {myLog.length === 0 ? (
                <p className="muted" style={{ padding: "10px 6px" }}>No matches played yet.</p>
              ) : (
                <div className="recent-results-list">
                  {myLog.map((r, i) => {
                    const won    = r.winnerId === userTeamId;
                    const opp    = won ? r.loserName : r.winnerName;
                    const oppId  = won ? r.loserId : r.winnerId;
                    const isOpen = expandedIdx === i;
                    return (
                      <div
                        key={i}
                        className={`result-card ${won ? "rc-user-win" : "rc-user-loss"}`}
                        onClick={() => toggleRow(i)}
                      >
                        <div className="rc-main">
                          <div className="rc-row-top">
                            <span className={`rc-outcome ${won ? "rco-win" : "rco-loss"}`}>{won ? "W" : "L"}</span>
                            <div className="rc-teams">
                              <span
                                className="rc-winner team-link"
                                style={{ color: won ? teamHexBody : ensureContrast(teamColor(oppId)) }}
                                onClick={e => { e.stopPropagation(); openTeamHub(won ? userTeamId : oppId); }}
                              >
                                {won ? (team?.name ?? userTeamId) : opp}
                              </span>
                              <span className="rc-score">{r.score}</span>
                              <span
                                className="rc-loser team-link"
                                style={{ color: won ? ensureContrast(teamColor(oppId)) : teamHexBody }}
                                onClick={e => { e.stopPropagation(); openTeamHub(won ? oppId : userTeamId); }}
                              >
                                {won ? opp : (team?.name ?? userTeamId)}
                              </span>
                            </div>
                            <span className="rc-chevron">{isOpen ? "▲" : "▼"}</span>
                          </div>
                          <div className="rc-row-meta">
                            <span className="rc-context">{r.stage}</span>
                            {r.standoutName && (
                              <span className="rc-standout">
                                ★ <strong>{r.standoutName}</strong>
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
          </div>

          {/* Champion banners */}
          {schedule.majors?.map((major, i) => {
            if (!major.completed || !major.bracket?.champion) return null;
            const champ = CDL_TEAMS.find(t => t.id === major.bracket.champion);
            return (
              <div key={i} className="champion-banner" style={{ borderColor: champ?.color }}>
                🏆 {major.name} Champion:{" "}
                <strong
                  className="team-link"
                  style={{ color: champ?.color }}
                  onClick={() => openTeamHub(major.bracket.champion)}
                >
                  {champ?.name ?? major.bracket.champion}
                </strong>
              </div>
            );
          })}
        </div>

        {/* ── Right Panel ── */}
        <div className="db-right-panel">

          {/* League Table */}
          <div className="db-rp-card">
            <div className="db-rp-header">
              {isStage ? `${stageName} Table` : isMajor ? "Stage Table" : "Season Table"}
              <button className="db-rp-link" onClick={() => setScreen?.("standings")}>
                Full →
              </button>
            </div>
            <div>
              {allTeamsRanked.map((t, i) => (
                <div
                  key={t.id}
                  className={`db-rp-row ${t.id === userTeamId ? "db-rp-row-you" : ""}`}
                >
                  <span className="db-rp-rank">{i + 1}</span>
                  <span className="db-rp-dot" style={{ background: t.color }} />
                  <span
                    className="db-rp-name"
                    onClick={() => openTeamHub(t.id)}
                  >
                    {t.tag}
                  </span>
                  <span className="db-rp-rec">{t.rec.wins}W–{t.rec.losses}L</span>
                  <span className="db-rp-pts">{t.rec.points}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Remaining Fixtures — stage only */}
          {remainingFixtures.length > 0 && (
            <div className="db-rp-card">
              <div className="db-rp-header">Your Remaining Fixtures</div>
              <div>
                {remainingFixtures.map((m, i) => {
                  const oppId  = m.a === userTeamId ? m.b : m.a;
                  const oppTeam = CDL_TEAMS.find(t => t.id === oppId);
                  const oppRec  = stageStandings[oppId] ?? { wins: 0, losses: 0 };
                  return (
                    <div key={i} className="db-fixture-row">
                      <span className="db-fixture-you" style={{ color: teamHexBody }}>
                        {team?.tag ?? userTeamId}
                      </span>
                      <span className="db-fixture-vs">vs</span>
                      <span
                        className="db-fixture-opp"
                        style={{ color: oppTeam ? ensureContrast(oppTeam.color, 4.5) : "var(--text-head)" }}
                        onClick={() => openTeamHub(oppId)}
                      >
                        {oppTeam?.tag ?? oppId}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Form Guide */}
          {formResults.length > 0 && (
            <div className="db-rp-card">
              <div className="db-rp-header">Recent Form</div>
              <div className="db-form-pips">
                {formResults.map((r, i) => {
                  const won = r.winnerId === userTeamId;
                  return (
                    <div key={i} className={`db-form-pip ${won ? "db-pip-w" : "db-pip-l"}`}>
                      {won ? "W" : "L"}
                    </div>
                  );
                })}
              </div>
              <div className="db-form-summary">
                {formWins}W {formLoss}L last {formResults.length}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Contract Review Panel ─────────────────────────────────────────────────────
function ContractReviewPanel({ players, dispatch, season, userTeamId, playerSeasonStats }) {
  const starters = players.filter(p => !p.isSub);
  const subs     = players.filter(p => p.isSub);
  const expiring = starters.filter(p => (p.contractYears ?? 2) === 1);
  const locked   = starters.filter(p => (p.contractYears ?? 2) > 1);

  const cap        = getTeamCap(userTeamId);
  const lockedCost = locked.reduce((s, p) => s + getSigningCost(p), 0);
  const space      = cap - lockedCost;

  function fmt(n) { return `$${Math.round(n / 1000)}k`; }

  const DEALS = [
    { label: "1 yr",  dealLength: 1, contractYears: 2 },
    { label: "2 yrs", dealLength: 2, contractYears: 3 },
    { label: "3 yrs", dealLength: 3, contractYears: 4 },
  ];

  return (
    <div className="contract-panel">
      <div className="cp-header">
        <span className="cp-icon">📋</span>
        <div>
          <div className="cp-title">Contract Review — End of Season {season}</div>
          <div className="cp-note muted">
            Extend expiring contracts now or let players walk to free agency.
          </div>
        </div>
      </div>

      {/* Budget summary */}
      <div className="cp-budget-bar">
        <span className="cp-budget-item">
          <span className="cp-budget-label">Cap</span>
          <span className="cp-budget-val">{fmt(cap)}</span>
        </span>
        <span className="cp-budget-sep">·</span>
        <span className="cp-budget-item">
          <span className="cp-budget-label">Locked</span>
          <span className="cp-budget-val">{fmt(lockedCost)}</span>
        </span>
        <span className="cp-budget-sep">·</span>
        <span className="cp-budget-item">
          <span className="cp-budget-label">Available</span>
          <span className="cp-budget-val" style={{ color: space > 0 ? "var(--green)" : "var(--red)" }}>
            {fmt(Math.max(0, space))}
          </span>
        </span>
      </div>

      {expiring.length === 0 && locked.length === 0 && (
        <p className="muted" style={{ padding: "8px 0" }}>
          No players on your roster. Sign players from Free Agency.
        </p>
      )}

      {expiring.length > 0 && (
        <div className="cp-section">
          <div className="cp-section-label">Expiring Contracts</div>
          {expiring.map(p => {
            const curSalary = p.salary ?? getSigningCost(p);
            const demands = DEALS.map(d => ({
              ...d,
              demand: getResignDemand(p, d.dealLength, playerSeasonStats, season),
            }));
            return (
              <div key={p.id} className="cp-row cp-row--expiring">
                <div className="cp-player-info">
                  <span className="cp-name">{p.name}</span>
                  <span className="cp-role">{p.primary}</span>
                  <span className="cp-ovr"
                    style={{ color: p.overall >= 90 ? "#b45309" : p.overall >= 80 ? "#15803d" : "#d97706" }}>
                    {p.overall} OVR
                  </span>
                  <span className="cp-current-salary">Current: {fmt(curSalary)}</span>
                </div>
                <div className="cp-demand-options">
                  {demands.map(d => {
                    const canAfford = d.demand <= space;
                    return (
                      <button
                        key={d.label}
                        className={`cp-deal-btn${canAfford ? "" : " cp-deal-btn--over"}`}
                        disabled={!canAfford}
                        title={canAfford
                          ? `Re-sign for ${d.label} at ${fmt(d.demand)}`
                          : `Over budget by ${fmt(d.demand - space)}`}
                        onClick={() => dispatch({
                          type: "RESIGN_PLAYER",
                          playerId: p.id,
                          years: d.contractYears,
                          salary: d.demand,
                        })}
                      >
                        <span className="cp-deal-length">{d.label}</span>
                        <span className="cp-deal-price">{fmt(d.demand)}</span>
                        {!canAfford && <span className="cp-deal-over">✕</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {locked.length > 0 && (
        <div className="cp-section">
          <div className="cp-section-label">Under Contract</div>
          {locked.map(p => {
            const rem = (p.contractYears ?? 2) - 1;
            return (
              <div key={p.id} className="cp-row">
                <div className="cp-player-info">
                  <span className="cp-name">{p.name}</span>
                  <span className="cp-role">{p.primary}</span>
                  <span className="cp-ovr"
                    style={{ color: p.overall >= 90 ? "#b45309" : p.overall >= 80 ? "#15803d" : "#d97706" }}>
                    {p.overall} OVR
                  </span>
                </div>
                <span className="cp-years-remaining">
                  {rem} yr{rem !== 1 ? "s" : ""} remaining
                </span>
              </div>
            );
          })}
        </div>
      )}

      {subs.length > 0 && (
        <div className="cp-section">
          <div className="cp-section-label">Sub</div>
          {subs.map(p => {
            const years       = p.contractYears ?? 2;
            const expiresSoon = years === 1;
            const subDeals    = DEALS.slice(0, 2); // subs: 1 yr and 2 yrs only
            return (
              <div key={p.id} className={`cp-row ${expiresSoon ? "cp-row--expiring" : ""}`}>
                <div className="cp-player-info">
                  <span className="cp-name">{p.name}</span>
                  <span className="cp-role">SUB</span>
                  <span className="cp-ovr">{p.overall} OVR</span>
                  {expiresSoon && (
                    <span className="cp-current-salary">
                      Current: {fmt(p.salary ?? getSigningCost(p))}
                    </span>
                  )}
                </div>
                {expiresSoon ? (
                  <div className="cp-demand-options">
                    {subDeals.map(d => {
                      const demand = getResignDemand(p, d.dealLength, playerSeasonStats, season);
                      return (
                        <button
                          key={d.label}
                          className="cp-deal-btn"
                          title={`Re-sign sub for ${d.label} at ${fmt(demand)}`}
                          onClick={() => dispatch({
                            type: "RESIGN_PLAYER",
                            playerId: p.id,
                            years: d.contractYears,
                            salary: demand,
                          })}
                        >
                          <span className="cp-deal-length">{d.label}</span>
                          <span className="cp-deal-price">{fmt(demand)}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <span className="cp-years-remaining">
                    {years - 1} yr{(years - 1) !== 1 ? "s" : ""} remaining
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
