// src/components/Dashboard.jsx
// Main game hub: phase card, primary action, major event panel, recent results.

import { useState } from "react";
import { useGame } from "../store/gameStore.jsx";
import { CDL_TEAMS } from "../data/teams.js";
import { calcChemistry, chemLabel } from "../engine/chemistry.js";
import SeriesDetail from "./SeriesDetail.jsx";
import { useTeamHub } from "../store/teamHubContext.jsx";

function teamColor(id) { return CDL_TEAMS.find(t => t.id === id)?.color ?? "#888"; }
function teamName(id)  { return CDL_TEAMS.find(t => t.id === id)?.name  ?? id; }
function teamTag(id)   { return CDL_TEAMS.find(t => t.id === id)?.tag   ?? id; }

function ratingColor(v) {
  if (v >= 90) return "#ffd700";
  if (v >= 85) return "#00e676";
  if (v >= 80) return "#69f0ae";
  if (v >= 70) return "#ffeb3b";
  return "#ef5350";
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

  const phase      = schedule.phase;
  const stageIdx   = schedule.stageIdx  ?? schedule.currentStage ?? 0;
  const majorIdx   = schedule.majorIdx  ?? (phase === "major" ? (schedule.currentStage ?? 0) : 0);
  const stageName  = schedule.stages?.[stageIdx]?.name  ?? "Stage";
  const majorName  = schedule.majors?.[majorIdx]?.name  ?? "Major";

  // Use stageStandings for in-stage record; cumulative for season total
  const stageStandings = schedule.stageStandings ?? {};
  const cumStandings   = schedule.standings ?? {};
  const myStage  = stageStandings[userTeamId] ?? { wins: 0, losses: 0, points: 0 };
  const mySeason = cumStandings[userTeamId]   ?? { wins: 0, losses: 0, points: 0 };

  const isStage     = phase === "stage";
  const isMajor     = phase === "major";
  const isPreChamps = phase === "preChamps";
  const isOffseason = phase === "offseason";
  const isContracts = phase === "contracts";

  // Major entry state
  const activeMajor = isMajor ? (schedule.majors?.[majorIdx] ?? null) : null;
  const isEntered   = isMajor && (state.enteredMajorIdx ?? null) === majorIdx;
  const bracket     = activeMajor?.bracket ?? null;

  // Stage progress
  const currentStage = isStage ? schedule.stages?.[stageIdx] : null;
  const remaining    = currentStage ? currentStage.matches.filter(m => !m.played).length : 0;
  const totalMatches = currentStage ? currentStage.matches.length : 0;
  const played       = totalMatches - remaining;
  const progress     = totalMatches > 0 ? Math.round((played / totalMatches) * 100) : 0;

  // Top-5 mini standings from stageStandings
  const top5 = isStage
    ? CDL_TEAMS
        .map(t => ({ id: t.id, name: t.name, tag: t.tag, color: t.color,
                     rec: stageStandings[t.id] ?? { wins: 0, losses: 0, points: 0 } }))
        .sort((a, b) => b.rec.points - a.rec.points)
        .slice(0, 5)
    : [];

  // Next unplayed match for user's team in current stage
  const nextMatchInStage = isStage && currentStage
    ? currentStage.matches.find(m => !m.played && (m.a === userTeamId || m.b === userTeamId))
    : null;
  const nextOppId   = nextMatchInStage ? (nextMatchInStage.a === userTeamId ? nextMatchInStage.b : nextMatchInStage.a) : null;
  const nextOppTeam = nextOppId ? CDL_TEAMS.find(t => t.id === nextOppId) : null;
  const nextOppRec  = nextOppId ? (stageStandings[nextOppId] ?? { wins: 0, losses: 0 }) : null;

  // ── Highlights data ──────────────────────────────────────────────────────────
  // Top player on user's team
  const topPlayer = myPlayers.filter(p => !p.isSub).sort((a, b) => b.overall - a.overall)[0] ?? null;

  // Top team by points in current standings view
  const standingsForHighlights = isStage ? stageStandings : cumStandings;
  const topTeamEntry = CDL_TEAMS
    .map(t => ({ t, rec: standingsForHighlights[t.id] ?? { wins: 0, losses: 0, points: 0 } }))
    .sort((a, b) => b.rec.points - a.rec.points)[0];
  const topTeam       = topTeamEntry?.t ?? null;
  const topTeamRecord = topTeamEntry?.rec ?? null;
  const topTeamHasMatches = (topTeamRecord?.wins ?? 0) + (topTeamRecord?.losses ?? 0) > 0;

  // Biggest breakout and collapse from last offseason's progressionLog
  const progLog = progressionLog ?? [];
  const breakouts = progLog.filter(e => e.eventType === "breakout" && e.delta > 0).sort((a, b) => b.delta - a.delta);
  const collapses = progLog.filter(e => e.eventType === "collapse" && e.delta < 0).sort((a, b) => a.delta - b.delta);
  const biggestBreakout = breakouts[0] ?? null;
  const biggestCollapse = collapses[0] ?? null;
  const showHighlights = topPlayer || topTeamHasMatches || biggestBreakout || biggestCollapse;

  const myLog = [...(schedule.matchLog || [])]
    .reverse()
    .filter(r => r.winnerId === userTeamId || r.loserId === userTeamId)
    .slice(0, 5);

  function toggleRow(i) { setExpandedIdx(prev => (prev === i ? null : i)); }

  function enterTournament() {
    dispatch({ type: "ENTER_MAJOR", majorIdx });
    // Navigation is handled by MajorEntryOverlay / MajorTournamentOverlay overlays
  }

  const phaseLabel = isOffseason  ? "Offseason"
    : isContracts  ? "Contract Period"
    : isMajor      ? majorName
    : isPreChamps   ? "Pre-Champs Window"
    : stageName;

  return (
    <div className="dashboard">

      {/* ── Phase Card ── */}
      <div className="phase-card" style={{ borderLeftColor: team?.color ?? "var(--accent)" }}>
        <div className="pc-top">
          <div className="pc-team-info">
            <h2 className="pc-team-name" style={{ color: team?.color ?? "#fff" }}>
              {team?.name ?? userTeamId}
            </h2>
            <span className="pc-phase-label">Season {season} · {phaseLabel}</span>
          </div>

          <div className="stat-row">
            {isStage && (
              <>
                <Stat label={`${stageName}`} value={`${myStage.wins}W – ${myStage.losses}L`} />
                <Stat label="Stage Pts"      value={myStage.points} />
                <Stat label="Season Pts"     value={mySeason.points} />
              </>
            )}
            {(isMajor || isPreChamps) && (
              <>
                <Stat label="Season Record" value={`${mySeason.wins}W – ${mySeason.losses}L`} />
                <Stat label="Season Pts"    value={mySeason.points} />
              </>
            )}
            {(isOffseason || isContracts) && (
              <Stat label="Final Record" value={`${mySeason.wins}W – ${mySeason.losses}L`} />
            )}
            <Stat label="Chemistry" value={`${chem} (${chemLabel(chem)})`} />
          </div>
        </div>

        {/* Stage progress bar */}
        {isStage && totalMatches > 0 && (
          <div className="stage-progress">
            <div className="sp-bar">
              <div
                className="sp-fill"
                style={{ width: `${progress}%`, background: team?.color ?? "var(--accent)" }}
              />
            </div>
            <span className="sp-label muted">{played} / {totalMatches} matches played</span>
          </div>
        )}

        {/* ── Primary action ── */}
        {/* During stage play the top-right "Play Matchday" control is the main
            progression action. Only bulk/end-of-stage actions live here. */}
        <div className="pc-actions">
          {isStage && remaining > 0 && (
            <button
              className="btn-secondary pc-sim-rest"
              onClick={() => { dispatch({ type: "SIM_STAGE" }); setExpandedIdx(null); }}
            >
              Sim Rest of {stageName}
              <span className="pc-cta-badge">{remaining} left</span>
            </button>
          )}
          {isMajor && !isEntered && (
            <div className="pc-major-hint muted" style={{ fontSize: 12, padding: "8px 0" }}>
              A tournament event is starting — enter it via the overlay above.
            </div>
          )}
          {isPreChamps && (
            <button
              className="btn-accent pc-cta"
              onClick={() => dispatch({ type: "BEGIN_CHAMPS" })}
            >
              Begin Championship →
            </button>
          )}
          {isOffseason && (
            <button
              className="btn-accent pc-cta"
              onClick={() => dispatch({ type: "ENTER_CONTRACT_PHASE" })}
            >
              Review Contracts →
            </button>
          )}
          {isContracts && (
            <button
              className="btn-accent pc-cta"
              onClick={() => dispatch({ type: "ADVANCE_OFFSEASON" })}
            >
              Advance Offseason →
            </button>
          )}
        </div>
      </div>

      {/* ── Highlights grid ── */}
      {showHighlights && (
        <div className="highlights-grid">
          {topPlayer && (
            <div className="highlight-card" style={{ borderTopColor: team?.color ?? "var(--accent)" }}>
              <div className="hl-label">Your Best Player</div>
              <div className="hl-name">{topPlayer.name}</div>
              <div className="hl-value" style={{ color: ratingColor(topPlayer.overall) }}>
                {topPlayer.overall}
              </div>
              <div className="hl-sub">{topPlayer.primary} · OVR</div>
            </div>
          )}

          {topTeamHasMatches && topTeam && (
            <div className="highlight-card" style={{ borderTopColor: topTeam.color }}>
              <div className="hl-label">{isStage ? "Stage Leader" : "Season Leader"}</div>
              <div className="hl-name" style={{ color: topTeam.color }}>{topTeam.name}</div>
              <div className="hl-value" style={{ color: topTeam.color }}>{topTeamRecord.points}</div>
              <div className="hl-sub">{topTeamRecord.wins}W – {topTeamRecord.losses}L · pts</div>
            </div>
          )}

          {biggestBreakout && (
            <div className="highlight-card hl-card-green">
              <div className="hl-label">Breakout</div>
              <div className="hl-name">{biggestBreakout.name}</div>
              <div className="hl-value hl-val-green">+{biggestBreakout.delta}</div>
              <div className="hl-sub">{biggestBreakout.oldOverall} → {biggestBreakout.newOverall} OVR</div>
            </div>
          )}

          {biggestCollapse && (
            <div className="highlight-card hl-card-red">
              <div className="hl-label">Collapse</div>
              <div className="hl-name">{biggestCollapse.name}</div>
              <div className="hl-value hl-val-red">{biggestCollapse.delta}</div>
              <div className="hl-sub">{biggestCollapse.oldOverall} → {biggestCollapse.newOverall} OVR</div>
            </div>
          )}
        </div>
      )}

      {/* ── Pre-Champs seeding preview ── */}
      {isPreChamps && (
        <div className="prechamps-info-box">
          <div className="pib-header">
            <span className="pib-icon">🏆</span>
            <div>
              <div className="pib-title">Championship Seeding</div>
              <div className="pib-note muted">Top 8 by cumulative season points. Make roster moves before locking in.</div>
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
              ))
            }
          </div>
        </div>
      )}

      {/* ── Contract review panel ── */}
      {isContracts && (
        <ContractReviewPanel players={myPlayers} dispatch={dispatch} season={season} />
      )}

      {/* ── Stage mini-standings ── */}
      {isStage && top5.length > 0 && (
        <div className="mini-standings">
          <div className="ms-title">
            {stageName} Standings
            <button className="ms-full-link" onClick={() => setScreen?.("standings")}>
              View full →
            </button>
          </div>
          <div className="ms-rows">
            {top5.map((t, i) => (
              <div key={t.id} className={`ms-row ${t.id === userTeamId ? "ms-row-you" : ""}`}>
                <span className="ms-rank">{i + 1}</span>
                <span className="ms-dot" style={{ background: t.color }} />
                <span
                  className="ms-name team-link"
                  style={{ color: t.color }}
                  onClick={() => openTeamHub(t.id)}
                >
                  {t.tag}
                </span>
                <span className="ms-record muted">{t.rec.wins}W–{t.rec.losses}L</span>
                <span className="ms-pts">{t.rec.points} pts</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Your Next Match preview (stage only) ── */}
      {isStage && nextOppTeam && (
        <div className="next-match-preview">
          <div className="nmp-label">YOUR NEXT MATCH · {stageName}</div>
          <div className="nmp-row">
            <div className="nmp-team-side">
              <span className="nmp-you-name" style={{ color: team?.color }}>{team?.name}</span>
              <span className="nmp-record-you muted">{myStage.wins}W–{myStage.losses}L</span>
            </div>
            <span className="nmp-vs">vs</span>
            <div className="nmp-team-side nmp-team-right">
              <span
                className="nmp-opp-name team-link"
                style={{ color: nextOppTeam.color }}
                onClick={() => openTeamHub(nextOppId)}
              >
                {nextOppTeam.name}
              </span>
              <span className="nmp-record-opp muted">{nextOppRec.wins}W–{nextOppRec.losses}L</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Recent Results ── */}
      <div className="section">
        <h3>
          Recent Results
          <span className="muted" style={{ fontWeight: 400, fontSize: 11 }}> — click for breakdown</span>
        </h3>
        {myLog.length === 0 ? (
          <p className="muted">No matches played yet.</p>
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
                          style={{ color: won ? (team?.color ?? "#fff") : teamColor(oppId) }}
                          onClick={e => { e.stopPropagation(); openTeamHub(won ? userTeamId : oppId); }}
                        >
                          {won ? (team?.name ?? userTeamId) : opp}
                        </span>
                        <span className="rc-score">{r.score}</span>
                        <span
                          className="rc-loser team-link"
                          style={{ color: won ? teamColor(oppId) : (team?.color ?? "#fff"), opacity: 0.7 }}
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
                          ⭐ <strong>{r.standoutName}</strong>
                          {r.standoutKD > 0 && <span className="rc-standout-kd"> {r.standoutKD.toFixed(2)} K/D</span>}
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

      {/* ── Champion banners ── */}
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

// ── Contract Review Panel ─────────────────────────────────────────────────────
// Shown during "contracts" phase. Players with contractYears === 1 are expiring
// this offseason. User can extend (sets contractYears to 2/3/4 before decrement)
// or let them walk (they'll automatically become free agents when offseason runs).
function ContractReviewPanel({ players, dispatch, season }) {
  const starters  = players.filter(p => !p.isSub);
  const subs      = players.filter(p => p.isSub);
  const expiring  = starters.filter(p => (p.contractYears ?? 2) === 1);
  const locked    = starters.filter(p => (p.contractYears ?? 2) > 1);

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

      {expiring.length === 0 && locked.length === 0 && (
        <p className="muted" style={{ padding: "8px 0" }}>
          No players on your roster. Sign players from Free Agency.
        </p>
      )}

      {expiring.length > 0 && (
        <div className="cp-section">
          <div className="cp-section-label">Expiring Contracts</div>
          {expiring.map(p => (
            <div key={p.id} className="cp-row cp-row--expiring">
              <div className="cp-player-info">
                <span className="cp-name">{p.name}</span>
                <span className="cp-role">{p.primary}</span>
                <span className="cp-ovr" style={{ color: p.overall >= 90 ? "#00e676" : p.overall >= 80 ? "#69f0ae" : "#ffeb3b" }}>
                  {p.overall} OVR
                </span>
              </div>
              <div className="cp-actions">
                <span className="cp-badge cp-badge--expiring">Contract Ending</span>
                <button
                  className="btn-secondary-sm"
                  title="Extend 1 more year"
                  onClick={() => dispatch({ type: "RESIGN_PLAYER", playerId: p.id, years: 2 })}
                >
                  +1 yr
                </button>
                <button
                  className="btn-secondary-sm"
                  title="Extend 2 more years"
                  onClick={() => dispatch({ type: "RESIGN_PLAYER", playerId: p.id, years: 3 })}
                >
                  +2 yr
                </button>
                <button
                  className="btn-secondary-sm"
                  title="Extend 3 more years"
                  onClick={() => dispatch({ type: "RESIGN_PLAYER", playerId: p.id, years: 4 })}
                >
                  +3 yr
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {locked.length > 0 && (
        <div className="cp-section">
          <div className="cp-section-label">Under Contract</div>
          {locked.map(p => {
            const remaining = (p.contractYears ?? 2) - 1;  // years left after offseason decrement
            return (
              <div key={p.id} className="cp-row">
                <div className="cp-player-info">
                  <span className="cp-name">{p.name}</span>
                  <span className="cp-role">{p.primary}</span>
                  <span className="cp-ovr" style={{ color: p.overall >= 90 ? "#00e676" : p.overall >= 80 ? "#69f0ae" : "#ffeb3b" }}>
                    {p.overall} OVR
                  </span>
                </div>
                <span className="cp-years-remaining">
                  {remaining} yr{remaining !== 1 ? "s" : ""} remaining
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
            const years = p.contractYears ?? 2;
            const expiresSoon = years === 1;
            return (
              <div key={p.id} className={`cp-row ${expiresSoon ? "cp-row--expiring" : ""}`}>
                <div className="cp-player-info">
                  <span className="cp-name">{p.name}</span>
                  <span className="cp-role">SUB</span>
                  <span className="cp-ovr">{p.overall} OVR</span>
                </div>
                {expiresSoon ? (
                  <div className="cp-actions">
                    <span className="cp-badge cp-badge--expiring">Contract Ending</span>
                    <button className="btn-secondary-sm" onClick={() => dispatch({ type: "RESIGN_PLAYER", playerId: p.id, years: 2 })}>+1 yr</button>
                    <button className="btn-secondary-sm" onClick={() => dispatch({ type: "RESIGN_PLAYER", playerId: p.id, years: 3 })}>+2 yr</button>
                  </div>
                ) : (
                  <span className="cp-years-remaining">{(years - 1)} yr{(years - 1) !== 1 ? "s" : ""} remaining</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
