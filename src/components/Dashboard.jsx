// src/components/Dashboard.jsx
// FM-style dashboard: full-width two-column layout with club banner, card grid, and right panel.

import { useState } from "react";
import { useGame } from "../store/gameStore.jsx";
import { CDL_TEAMS } from "../data/teams.js";
import { calcChemistry, chemLabel } from "../engine/chemistry.js";
import { calcTeamOvr } from "../engine/teamOvr.js";
import { getSigningCost, getResignDemand, getTeamCap, getChallengerStockLabel } from "../engine/rosterAI.js";
import { getContractReviewBudget } from "../utils/contractBudget.js";
import SeriesDetail from "./SeriesDetail.jsx";
import { useTeamHub } from "../store/teamHubContext.jsx";
import { usePlayerProfile } from "../store/playerProfileContext.jsx";
import TeamLogo from "./TeamLogo.jsx";
import { resolveTeamDisplay } from "../utils/teamDisplay.js";
import { getMajorPlacementMap } from "../utils/historyProfiles.js";
import { isInactivePlayer } from "../utils/playerIdentity.js";

function teamColor(id) { return CDL_TEAMS.find(t => t.id === id)?.color ?? "#888"; }
function fmtMoney(n) { return `$${Math.round((n || 0) / 1000)}k`; }
function placementText(place) {
  if (place == null) return "Not tracked yet";
  const n = Number(place);
  if (n === 1) return "1st";
  if (n === 2) return "2nd";
  if (n === 3) return "3rd";
  return `${n}th`;
}
function readableMoveType(type) {
  const t = String(type || "");
  if (t === "CDL_SIGNING") return "Signing";
  if (t === "FREE_AGENT_ENTERED") return "Free agent";
  if (t === "FREE_AGENT_SIGNING") return "FA signing";
  if (t === "FREE_AGENT_TO_CHALLENGERS") return "To Challengers";
  if (t === "FREE_AGENT_RETIRED") return "Retirement";
  if (t === "CDL_RELEASE_TO_CHALLENGERS") return "Release";
  if (t === "RETIREMENT") return "Retirement";
  if (t === "EMERGENCY_ROSTER_FILL") return "Emergency fill";
  if (t === "INACTIVE") return "Inactive";
  return t.replaceAll("_", " ").toLowerCase().replace(/^./, c => c.toUpperCase());
}

function formatRecentKd(player, playerSeasonStats, season) {
  if (!player?.id || !playerSeasonStats || season == null) return "—";
  const rows = (playerSeasonStats[player.id] || []).filter(r => Number(r.season) === Number(season) && (r.matches || 0) > 0);
  if (!rows.length) return "—";
  const kills = rows.reduce((sum, r) => sum + (r.kills || 0), 0);
  const deaths = rows.reduce((sum, r) => sum + (r.deaths || 0), 0);
  const kd = deaths > 0 ? kills / deaths : kills > 0 ? kills : 1;
  return kd.toFixed(2);
}

function previousTeamLabel(teamId, schedule) {
  if (!teamId) return "Unsigned";
  return resolveTeamDisplay(teamId, schedule)?.tag || teamId;
}

function stockLabel(player) {
  const ovr = player?.overall || 0;
  const pot = player?.potential || ovr;
  if (isInactivePlayer(player)) return "Inactive";
  if (pot >= 88 && ovr >= 75) return "Blue-chip";
  if (pot >= 86) return "High upside";
  if (ovr >= 82) return "Ready now";
  if (player?.isProspect) return "Developmental";
  return "Depth option";
}

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

export default function Dashboard({ setScreen }) {
  const { state, dispatch } = useGame();
  const { openTeamHub } = useTeamHub();
  const { openPlayerProfile } = usePlayerProfile();
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
  const isChallengerQualifier = phase === "challengerQualifier";
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

  if (isOffseason || isContracts) {
    return (
      <OffseasonHub
        state={state}
        dispatch={dispatch}
        setScreen={setScreen}
        userTeamId={userTeamId}
        team={team}
        season={season}
        players={players}
        myPlayers={myPlayers}
        mySeason={mySeason}
        chem={chem}
        teamOvr={teamOvr}
        isContracts={isContracts}
        openTeamHub={openTeamHub}
        openPlayerProfile={openPlayerProfile}
      />
    );
  }

  return (
    <div className="dashboard">

      {/* ── Club Banner (full width) ── */}
      <div
        className="db-club-banner"
        style={{ borderTop: `3px solid ${teamHex}`, background: bannerGradient }}
      >
        <TeamLogo team={resolveTeamDisplay(userTeamId, schedule)} size={44} className="db-banner-logo" />
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
              {(isChallengerQualifier || isMajor || isPreChamps) && (
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
            {isChallengerQualifier && (
              <>
                <span className="db-cb-cta-hint">Pro-Am spots on the line</span>
                <button className="btn-cta" onClick={() => dispatch({ type: schedule.currentChallengerQualifier?.completed ? "CONTINUE_FROM_CHALLENGER_QUALIFIER" : "SIM_CHALLENGER_QUALIFIER" })}>
                  {schedule.currentChallengerQualifier?.completed ? "Continue to Major →" : "Run Challenger Qualifier"}
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
                <span className="db-cb-cta-hint">{state.offseason?.freeAgencyOpen ? "Free agency open" : "Season complete"}</span>
                <button className="btn-cta" onClick={() => dispatch({ type: state.offseason?.freeAgencyOpen ? "ADVANCE_OFFSEASON" : "ENTER_CONTRACT_PHASE" })}>
                  {state.offseason?.freeAgencyOpen ? "Advance Offseason →" : "Review Contracts →"}
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


function OffseasonHub({ state, dispatch, setScreen, userTeamId, team, season, players, myPlayers, mySeason, chem, teamOvr, isContracts, openTeamHub, openPlayerProfile }) {
  const schedule = state.schedule || {};
  const activeStarters = myPlayers.filter(p => !p.isSub && !isInactivePlayer(p));
  const subs = myPlayers.filter(p => p.isSub && !isInactivePlayer(p));
  const roles = ["Main AR", "Flex", "Entry SMG", "Slayer SMG"];
  const roleCounts = roles.map(role => ({ role, count: activeStarters.filter(p => p.primary === role).length }));
  const missingRoles = roleCounts.filter(r => r.count === 0).map(r => r.role);
  const weakest = activeStarters.length ? [...activeStarters].sort((a, b) => (a.overall || 0) - (b.overall || 0))[0] : null;
  const bestPlayer = activeStarters.length ? [...activeStarters].sort((a, b) => (b.overall || 0) - (a.overall || 0))[0] : null;
  const { cap, lockedCost, space } = getContractReviewBudget(myPlayers, userTeamId);
  const rosterWarning = activeStarters.length < 4 ? `Roster incomplete: ${activeStarters.length}/4 starters signed.` : null;
  const completedSeason = season;
  const nextSeason = Number(season || 1) + 1;

  const standingsRows = CDL_TEAMS
    .map(t => ({ ...t, rec: schedule.standings?.[t.id] || { wins: 0, losses: 0, points: 0 } }))
    .sort((a, b) => (b.rec.points || 0) - (a.rec.points || 0) || (b.rec.wins || 0) - (a.rec.wins || 0));
  const standingsWinner = standingsRows[0] || null;
  const champs = schedule.majors?.[4];
  const champsWinnerId = champs?.bracket?.champion || null;
  const champsWinner = champsWinnerId ? resolveTeamDisplay(champsWinnerId, schedule) : null;
  const champsPlacement = champs?.bracket ? getMajorPlacementMap(champs)[userTeamId] : null;
  const majorWinners = (schedule.majors || []).slice(0, 4).map((major, idx) => ({
    name: major?.name || `Major ${idx + 1}`,
    winnerId: major?.bracket?.champion || null,
    winner: major?.bracket?.champion ? resolveTeamDisplay(major.bracket.champion, schedule) : null,
  }));
  const seasonAwards = (state.awards || []).filter(a => Number(a.season) === Number(completedSeason));
  const awardByKey = key => seasonAwards.find(a => a.key === key) || null;
  const seasonMvp = awardByKey("season_mvp");
  const rookie = awardByKey("rookie_of_year");
  const champsMvp = awardByKey("champs_mvp");

  const recentMoves = [...(state.challengerTransactions || [])]
    .filter(tx => Number(tx.season ?? completedSeason) === Number(completedSeason))
    .slice(-8)
    .reverse();
  const graduates = recentMoves.filter(tx => tx.type === "CDL_SIGNING" && tx.fromTeamId && tx.toTeamId).slice(0, 5);
  const [marketSearch, setMarketSearch] = useState("");
  const [marketRole, setMarketRole] = useState("All");
  const freeAgentPool = (players || [])
    .filter(ply => !ply.teamId && !ply.isProspect && !isInactivePlayer(ply))
    .filter(ply => !ply.status || ply.status === "freeAgent")
    .sort((a, b) => (b.overall || 0) - (a.overall || 0) || (b.potential || 0) - (a.potential || 0));
  const marketRoles = ["All", ...Array.from(new Set(freeAgentPool.map(ply => ply.primary).filter(Boolean))).sort()];
  const searchNeedle = marketSearch.trim().toLowerCase();
  const filteredFreeAgents = freeAgentPool.filter(ply => {
    const roleOk = marketRole === "All" || ply.primary === marketRole;
    const searchOk = !searchNeedle || [ply.name, ply.primary, previousTeamLabel(ply.previousTeamId, schedule)]
      .some(value => String(value || "").toLowerCase().includes(searchNeedle));
    return roleOk && searchOk;
  });
  const marketPreview = filteredFreeAgents.slice(0, 25);
  const powerRankings = CDL_TEAMS.map(t => {
    const starters = (players || []).filter(ply => ply.teamId === t.id && !ply.isSub && !isInactivePlayer(ply));
    const keyPlayer = starters.sort((a, b) => (b.overall || 0) - (a.overall || 0))[0];
    const history = (state.teamCareerHistory || []).find(h => h.teamId === t.id && Number(h.season) === Number(completedSeason));
    const prev = history?.champs?.placement || history?.bestChamps || (history?.record ? `${history.record.wins}W-${history.record.losses}L` : "Season archived");
    return { team: t, ovr: calcTeamOvr(t.id, players || []), keyPlayer, prev };
  }).sort((a, b) => b.ovr - a.ovr).slice(0, 6);

  const freeAgencyOpen = !!state.offseason?.freeAgencyOpen;
  const primaryAction = isContracts
    ? { label: "Open Free Agency →", hint: "Process expiring contracts; AI waits while you shop the market", type: "ADVANCE_OFFSEASON" }
    : freeAgencyOpen
      ? { label: `Run AI Free Agency → Season ${nextSeason}`, hint: "Sign anyone you want first; AI bids after this click", type: "ADVANCE_OFFSEASON" }
      : { label: "Review Contracts →", hint: "Lock in extensions before the market opens", type: "ENTER_CONTRACT_PHASE" };

  return (
    <div className="dashboard offseason-hub">
      <section className="oh-hero" style={{ borderTopColor: team?.color || "var(--accent)" }}>
        <div className="oh-hero-left">
          <TeamLogo team={resolveTeamDisplay(userTeamId, schedule)} size={54} className="oh-logo" />
          <div>
            <div className="oh-kicker">Season {completedSeason} Complete</div>
            <h2>Offseason Hub</h2>
            <div className="oh-team-line">
              <button className="link-button team-link" onClick={() => openTeamHub(userTeamId)}>{team?.name || userTeamId}</button>
              <span>{mySeason.wins}W – {mySeason.losses}L</span>
              <span>{mySeason.points || 0} CDL pts</span>
              <span>{champsPlacement ? `Champs: ${placementText(champsPlacement)}` : "Champs: Not tracked"}</span>
            </div>
          </div>
        </div>
        <div className="oh-hero-stats">
          <div><span>Team OVR</span><strong>{teamOvr || "—"}</strong></div>
          <div><span>Chemistry</span><strong>{chem} <em>{chemLabel(chem)}</em></strong></div>
          <div><span>Cap Space</span><strong>{fmtMoney(Math.max(0, space))}</strong></div>
        </div>
        <div className="oh-hero-action">
          <span>{primaryAction.hint}</span>
          <button className="btn-cta" onClick={() => dispatch({ type: primaryAction.type })}>{primaryAction.label}</button>
        </div>
      </section>

      <div className="oh-layout">
        <main className="oh-main">
          <section className="oh-card oh-contract-card">
            <div className="oh-card-header">
              <div>
                <h3>Your Team Contract Center</h3>
                <p>{activeStarters.length}/4 starters · {subs.length} sub · locked {fmtMoney(lockedCost)} / {fmtMoney(cap)}</p>
              </div>
              {rosterWarning ? <span className="oh-warning">{rosterWarning}</span> : <span className="oh-ok">Roster complete</span>}
            </div>
            <ContractReviewPanel
              players={myPlayers}
              dispatch={dispatch}
              season={season}
              userTeamId={userTeamId}
              playerSeasonStats={state.playerSeasonStats}
            />
            <div className="oh-contract-footer">
              <span>{isContracts ? "Unre-signed players will enter free agency first." : freeAgencyOpen ? "Open market is live. AI teams wait until you advance." : "Enter the contract period to preserve the current offseason flow."}</span>
              <button className="btn-primary" onClick={() => dispatch({ type: primaryAction.type })}>{primaryAction.label}</button>
            </div>
          </section>

          {freeAgencyOpen && (
            <section className="oh-card oh-market-card">
              <div className="oh-card-header oh-market-header">
                <div>
                  <h3>Free Agency Market</h3>
                  <p>AI teams are paused. Sign players now before running AI free agency.</p>
                </div>
                <button className="btn-secondary" onClick={() => setScreen?.("fa")}>Open Full Free Agency</button>
              </div>
              <div className="oh-market-toolbar">
                <strong>Free Agency Open</strong>
                <span>AI teams will not sign players until you click Run AI Free Agency.</span>
                <input
                  type="search"
                  value={marketSearch}
                  onChange={(e) => setMarketSearch(e.target.value)}
                  placeholder="Search player, role, previous team…"
                  aria-label="Search free agents"
                />
                <select value={marketRole} onChange={(e) => setMarketRole(e.target.value)} aria-label="Filter free agents by role">
                  {marketRoles.map(role => <option key={role} value={role}>{role}</option>)}
                </select>
              </div>
              {marketPreview.length ? (
                <>
                  <div className="oh-market-table-wrap">
                    <table className="oh-market-table">
                      <thead>
                        <tr>
                          <th>Player</th>
                          <th>Age</th>
                          <th>Role</th>
                          <th>Previous Team</th>
                          <th>OVR</th>
                          <th>POT</th>
                          <th>Recent K/D</th>
                          <th>Stock</th>
                          <th>Salary Demand</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {marketPreview.map(ply => {
                          const roster = players.filter(p => p.teamId === userTeamId && !isInactivePlayer(p));
                          const starters = roster.filter(p => !p.isSub);
                          const subCount = roster.filter(p => p.isSub).length;
                          const committed = starters.reduce((sum, p) => sum + (p.salary ?? getSigningCost(p)), 0);
                          const demand = getSigningCost(ply);
                          const cap = getTeamCap(userTeamId);
                          const starterOverBy = Math.max(0, committed + demand - cap);
                          const starterDisabledReason = starters.length >= 4
                            ? "Roster full"
                            : starterOverBy > 0
                              ? `Over cap by ${fmtMoney(starterOverBy)}`
                              : null;
                          const subDisabledReason = subCount >= 1 ? "Sub slot full" : null;
                          return (
                            <tr key={ply.id}>
                              <td><button className="link-button player-link" onClick={() => openPlayerProfile(ply.id)}>{ply.name}</button></td>
                              <td>{ply.age ?? "—"}</td>
                              <td><span className="role-pill">{ply.primary || "Role TBD"}</span></td>
                              <td>{previousTeamLabel(ply.previousTeamId, schedule)}</td>
                              <td><strong style={{ color: ratingColor(ply.overall || 0) }}>{ply.overall || "—"}</strong></td>
                              <td><span style={{ color: ratingColor(ply.potential || 0) }}>{ply.potential || "—"}</span></td>
                              <td>{formatRecentKd(ply, state.playerSeasonStats, completedSeason)}</td>
                              <td>{getChallengerStockLabel(ply, state)}</td>
                              <td>{fmtMoney(demand)}</td>
                              <td>
                                <div className="oh-market-actions">
                                  <button
                                    className="btn-primary-sm"
                                    disabled={!!starterDisabledReason}
                                    title={starterDisabledReason || `Sign ${ply.name} as a starter`}
                                    onClick={() => dispatch({ type: "SIGN_PLAYER", playerId: ply.id, slotType: "starter" })}
                                  >
                                    {starterDisabledReason || "Sign as Starter"}
                                  </button>
                                  <button
                                    className="btn-secondary-sm"
                                    disabled={!!subDisabledReason}
                                    title={subDisabledReason || `Sign ${ply.name} as a sub`}
                                    onClick={() => dispatch({ type: "SIGN_PLAYER", playerId: ply.id, slotType: "sub" })}
                                  >
                                    {subDisabledReason || "Sign as Sub"}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {filteredFreeAgents.length > marketPreview.length && (
                    <div className="oh-market-footer">
                      <span>Showing top {marketPreview.length} of {filteredFreeAgents.length} free agents.</span>
                      <button className="db-rp-link" onClick={() => setScreen?.("fa")}>View Full Free Agency</button>
                    </div>
                  )}
                </>
              ) : (
                <p className="oh-empty">No free agents available yet.</p>
              )}
            </section>
          )}

          <section className="oh-card">
            <div className="oh-card-header"><h3>Roster Needs / Team Outlook</h3></div>
            <div className="oh-outlook-grid">
              <div><span>Need</span><strong>{missingRoles.length ? missingRoles.map(r => `1 ${r}`).join(", ") : "No role gaps"}</strong></div>
              <div><span>Roles covered</span><strong>{roleCounts.filter(r => r.count > 0).map(r => r.role).join(", ") || "None"}</strong></div>
              <div><span>Weakest starter</span><strong>{weakest ? `${weakest.name} (${weakest.overall})` : "No starters"}</strong></div>
              <div><span>Best player</span><strong>{bestPlayer ? `${bestPlayer.name} (${bestPlayer.overall})` : "No starters"}</strong></div>
              <div><span>Core under contract</span><strong>{activeStarters.filter(p => (p.contractYears ?? 2) > 1).map(p => p.name).slice(0, 4).join(", ") || "None locked yet"}</strong></div>
              <div><span>Available now</span><strong>{fmtMoney(Math.max(0, space))}</strong></div>
            </div>
          </section>

          <section className="oh-card">
            <div className="oh-card-header"><h3>Early Power Rankings</h3></div>
            <div className="oh-list">
              {powerRankings.map((row, idx) => (
                <div className="oh-rank-row" key={row.team.id}>
                  <span className="oh-rank-num">#{idx + 1}</span>
                  <TeamLogo team={row.team} size={24} />
                  <button className="link-button team-link" onClick={() => openTeamHub(row.team.id)}>{row.team.name}</button>
                  <strong>{row.ovr || "—"} OVR</strong>
                  <span>{row.keyPlayer?.name || "No key player"}</span>
                  <em>{row.prev || "No previous result"}</em>
                </div>
              ))}
            </div>
          </section>
        </main>

        <aside className="oh-side">
          <section className="oh-card">
            <div className="oh-card-header"><h3>Season Recap</h3></div>
            <div className="oh-recap-list">
              <RecapRow label="Champs Winner" value={champsWinner?.name || "Not tracked"} teamId={champsWinnerId} openTeamHub={openTeamHub} />
              <RecapRow label="Your Champs Result" value={champsPlacement ? placementText(champsPlacement) : "Not tracked"} />
              <RecapRow label="Season Standings Winner" value={standingsWinner?.name || "Not tracked"} teamId={standingsWinner?.id} openTeamHub={openTeamHub} />
              <RecapRow label="Season MVP" value={seasonMvp?.playerName || "Not awarded"} playerId={seasonMvp?.playerId} openPlayerProfile={openPlayerProfile} />
              <RecapRow label="Rookie of the Year" value={rookie?.playerName || "No eligible rookie"} playerId={rookie?.playerId} openPlayerProfile={openPlayerProfile} />
              <RecapRow label="Champs MVP" value={champsMvp?.playerName || "Not awarded"} playerId={champsMvp?.playerId} openPlayerProfile={openPlayerProfile} />
            </div>
            <div className="oh-major-winners">
              {majorWinners.map(m => (
                <div key={m.name}><span>{m.name}</span>{m.winnerId ? <button className="link-button team-link" onClick={() => openTeamHub(m.winnerId)}>{m.winner?.tag || m.winnerId}</button> : <em>—</em>}</div>
              ))}
            </div>
          </section>

          <section className="oh-card">
            <div className="oh-card-header"><h3>League Moves</h3></div>
            {recentMoves.length ? <div className="oh-list compact">
              {recentMoves.map((tx, idx) => (
                <div className="oh-move-row" key={`${tx.playerId || tx.playerName}_${idx}`}>
                  <strong>{readableMoveType(tx.type)}</strong>
                  <span>{tx.note || `${tx.playerName} ${readableMoveType(tx.type).toLowerCase()}`}</span>
                </div>
              ))}
            </div> : <p className="oh-empty">No offseason moves yet.</p>}
          </section>

          <section className="oh-card">
            <div className="oh-card-header"><h3>Challenger Graduates</h3></div>
            {graduates.length ? <div className="oh-list compact">
              {graduates.map((tx, idx) => (
                <div className="oh-grad-row" key={`${tx.playerId}_${idx}`}>
                  <button className="link-button player-link" onClick={() => openPlayerProfile(tx.playerId)}>{tx.playerName}</button>
                  <span>{resolveTeamDisplay(tx.fromTeamId, schedule).name} → {resolveTeamDisplay(tx.toTeamId, schedule).tag}</span>
                  <em>{players.find(p => p.id === tx.playerId)?.primary || "Role TBD"} · {stockLabel(players.find(p => p.id === tx.playerId) || {})}</em>
                </div>
              ))}
            </div> : <p className="oh-empty">No Challenger graduates yet.</p>}
          </section>

          <section className="oh-card">
            <div className="oh-card-header"><h3>{freeAgencyOpen ? "Free Agents — User Window" : "Top Available Players"}</h3><button className="db-rp-link" onClick={() => setScreen?.("fa")}>Free Agency →</button></div>
            {freeAgencyOpen && <p className="oh-empty">AI signings are paused until you advance. Normal cap and roster limits apply.</p>}
            {freeAgentPool.length ? <div className="oh-list compact">
              {freeAgentPool.slice(0, 6).map(ply => {
                const roster = players.filter(p => p.teamId === userTeamId);
                const starters = roster.filter(p => !p.isSub);
                const committed = starters.reduce((sum, p) => sum + (p.salary ?? getSigningCost(p)), 0);
                const canSign = freeAgencyOpen && starters.length < 4 && committed + getSigningCost(ply) <= getTeamCap(userTeamId);
                return (
                <div className="oh-available-row" key={ply.id}>
                  <button className="link-button player-link" onClick={() => openPlayerProfile(ply.id)}>{ply.name}</button>
                  <span>{ply.primary || ply.role || "Role TBD"} · {ply.overall || "—"}/{ply.potential || "—"}</span>
                  <em>{fmtMoney(getSigningCost(ply))} · {stockLabel(ply)} · {ply.region || "NA"}</em>
                  {freeAgencyOpen && (canSign ? <button className="btn-primary-sm" onClick={() => dispatch({ type: "SIGN_PLAYER", playerId: ply.id, slotType: "starter" })}>Sign</button> : <small className="muted">Full/over cap</small>)}
                </div>
              );})}
            </div> : <p className="oh-empty">No available free agents found.</p>}
          </section>
        </aside>
      </div>
    </div>
  );
}

function RecapRow({ label, value, teamId, playerId, openTeamHub, openPlayerProfile }) {
  const clickable = teamId || playerId;
  return (
    <div className="oh-recap-row">
      <span>{label}</span>
      {clickable ? (
        <button className={`link-button ${teamId ? "team-link" : "player-link"}`} onClick={() => teamId ? openTeamHub?.(teamId) : openPlayerProfile?.(playerId)}>{value}</button>
      ) : <strong>{value}</strong>}
    </div>
  );
}

// ── Contract Review Panel ─────────────────────────────────────────────────────
function ContractReviewPanel({ players, dispatch, season, userTeamId, playerSeasonStats }) {
  const starters = players.filter(p => !p.isSub);
  const subs     = players.filter(p => p.isSub);
  const expiring = starters.filter(p => (p.contractYears ?? 2) === 1);
  const locked   = starters.filter(p => (p.contractYears ?? 2) > 1);

  const { cap, lockedCost, space } = getContractReviewBudget(players, userTeamId);

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
                <div className="cp-expiring-header">
                  <span className="cp-name">{p.name}</span>
                  <span className="cp-role">{p.primary}</span>
                  <span className="cp-ovr"
                    style={{ color: p.overall >= 90 ? "#b45309" : p.overall >= 80 ? "#15803d" : "#d97706" }}>
                    {p.overall} OVR
                  </span>
                  <span className="cp-expiring-meta">
                    Current <strong>{fmt(curSalary)}</strong>
                    <span className="cp-meta-sep">·</span>
                    Available <strong style={{ color: space > 0 ? "var(--green)" : "var(--red)" }}>
                      {fmt(Math.max(0, space))}
                    </strong>
                  </span>
                </div>
                <div className="cp-demand-options">
                  {demands.map(d => {
                    const canAfford  = d.demand <= space;
                    const delta      = d.demand - curSalary;
                    const afterSpace = space - d.demand;
                    const deltaColor = delta > 0 ? "var(--red)" : delta < 0 ? "var(--green)" : "var(--text-dim)";
                    const deltaLabel = delta === 0
                      ? "no change"
                      : `${delta > 0 ? "▲" : "▼"} ${fmt(Math.abs(delta))}`;
                    return (
                      <button
                        key={d.label}
                        className={`cp-deal-btn${canAfford ? "" : " cp-deal-btn--over"}`}
                        disabled={!canAfford}
                        onClick={() => dispatch({
                          type: "RESIGN_PLAYER",
                          playerId: p.id,
                          years: d.contractYears,
                          salary: d.demand,
                        })}
                      >
                        <span className="cp-deal-length">{d.label}</span>
                        <span className="cp-deal-price">{fmt(d.demand)}</span>
                        <span className="cp-deal-delta" style={{ color: deltaColor }}>{deltaLabel}</span>
                        {canAfford
                          ? <span className="cp-deal-after" style={{ color: afterSpace < 50000 ? "var(--yellow)" : "var(--text-dim)" }}>
                              after: {fmt(afterSpace)}
                            </span>
                          : <span className="cp-deal-over">over by {fmt(d.demand - space)}</span>
                        }
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
            const salary = p.salary ?? getSigningCost(p);
            return (
              <div key={p.id} className="cp-row">
                <div className="cp-player-info">
                  <span className="cp-name">{p.name}</span>
                  <span className="cp-role">{p.primary}</span>
                  <span className="cp-ovr"
                    style={{ color: p.overall >= 90 ? "#b45309" : p.overall >= 80 ? "#15803d" : "#d97706" }}>
                    {p.overall} OVR
                  </span>
                  <span className="cp-current-salary">{fmt(salary)}/yr</span>
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
