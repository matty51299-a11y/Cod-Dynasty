// src/components/Dashboard.jsx
// Main game hub: phase card, primary action, major event panel, recent results.

import { useState } from "react";
import { useGame } from "../store/gameStore.jsx";
import { CDL_TEAMS } from "../data/teams.js";
import { calcChemistry, chemLabel } from "../engine/chemistry.js";
import SeriesDetail from "./SeriesDetail.jsx";

function teamColor(id) { return CDL_TEAMS.find(t => t.id === id)?.color ?? "#888"; }
function teamName(id)  { return CDL_TEAMS.find(t => t.id === id)?.name  ?? id; }
function teamTag(id)   { return CDL_TEAMS.find(t => t.id === id)?.tag   ?? id; }

export default function Dashboard({ setTab }) {
  const { state, dispatch } = useGame();
  const [expandedIdx, setExpandedIdx] = useState(null);

  if (!state) return null;

  const { schedule, userTeamId, season, players } = state;
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

  const myLog = [...(schedule.matchLog || [])]
    .reverse()
    .filter(r => r.winnerId === userTeamId || r.loserId === userTeamId)
    .slice(0, 5);

  function toggleRow(i) { setExpandedIdx(prev => (prev === i ? null : i)); }

  function enterTournament() {
    dispatch({ type: "ENTER_MAJOR", majorIdx });
    if (setTab) setTab("major");
  }

  const phaseLabel = isOffseason ? "Offseason"
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
            {isOffseason && (
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
        <div className="pc-actions">
          {isStage && (
            <>
              <button
                className="btn-primary pc-cta"
                onClick={() => { dispatch({ type: "SIM_MATCHDAY" }); setExpandedIdx(null); }}
              >
                ▶ Play Next Matchday
                <span className="pc-cta-badge">{remaining} left</span>
              </button>
              <button
                className="btn-secondary"
                onClick={() => { dispatch({ type: "SIM_STAGE" }); setExpandedIdx(null); }}
              >
                Sim Rest of {stageName}
              </button>
            </>
          )}
          {isMajor && isEntered && (
            <button className="btn-primary pc-cta" onClick={() => setTab?.("major")}>
              ▶ Continue Tournament
              <span className="pc-cta-badge">LIVE</span>
            </button>
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
              onClick={() => dispatch({ type: "ADVANCE_OFFSEASON" })}
            >
              Start Season {season + 1} →
            </button>
          )}
        </div>
      </div>

      {/* ── Major Event Panel (shown before user enters tournament) ── */}
      {isMajor && !isEntered && bracket && (
        <MajorEventPanel
          major={activeMajor}
          majorIdx={majorIdx}
          schedule={schedule}
          userTeamId={userTeamId}
          onEnter={enterTournament}
        />
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

      {/* ── Stage mini-standings ── */}
      {isStage && top5.length > 0 && (
        <div className="mini-standings">
          <div className="ms-title">
            {stageName} Standings
            <button className="ms-full-link" onClick={() => setTab?.("standings")}>
              View full →
            </button>
          </div>
          <div className="ms-rows">
            {top5.map((t, i) => (
              <div key={t.id} className={`ms-row ${t.id === userTeamId ? "ms-row-you" : ""}`}>
                <span className="ms-rank">{i + 1}</span>
                <span className="ms-dot" style={{ background: t.color }} />
                <span className="ms-name">{t.tag}</span>
                <span className="ms-record muted">{t.rec.wins}W–{t.rec.losses}L</span>
                <span className="ms-pts">{t.rec.points} pts</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Recent Results ── */}
      <div className="section">
        <h3>
          Recent Results
          <span className="muted" style={{ fontWeight: 400, fontSize: 11 }}> — click for series detail</span>
        </h3>
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
                  <div className="rr-summary">
                    <span className={`rr-wl ${won ? "win" : "loss"}`}>{won ? "W" : "L"}</span>
                    <span className="rr-opp">vs {opp}</span>
                    <span className="rr-score">{r.score}</span>
                    {maps && <span className="rr-maps muted">{maps}</span>}
                    <span className="rr-standout muted">
                      ⭐ {r.standoutName ?? "—"}
                      {r.standoutKD > 0 && ` · ${r.standoutKD.toFixed(2)} K/D`}
                    </span>
                    <span className="rr-stage muted">{r.stage}</span>
                    <span className="rr-chevron">{isOpen ? "▲" : "▼"}</span>
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
            <strong style={{ color: champ?.color }}>{champ?.name ?? major.bracket.champion}</strong>
          </div>
        );
      })}
    </div>
  );
}

// ── Major Event Announcement Panel ────────────────────────────────────────────
function MajorEventPanel({ major, majorIdx, schedule, userTeamId, onEnter }) {
  const bracket = major.bracket;
  if (!bracket) return null;

  const seedStandings = majorIdx === 4
    ? (schedule.standings ?? {})
    : (schedule.stageStandings ?? schedule.standings ?? {});

  const userSeed = bracket.seeds?.indexOf(userTeamId) ?? -1;
  const userQF   = bracket.rounds?.[0]?.matches?.find(m => m.a === userTeamId || m.b === userTeamId);
  const userOpp  = userQF ? (userQF.a === userTeamId ? userQF.b : userQF.a) : null;

  return (
    <div className="major-event-panel">
      <div className="mep-header">
        <div className="mep-badge-row">
          <span className="mep-badge">TOURNAMENT</span>
          {majorIdx === 4 && <span className="mep-badge mep-badge-champs">CHAMPIONSHIP</span>}
        </div>
        <h2 className="mep-title">{major.name.toUpperCase()}</h2>
        <span className="mep-season muted">Season {schedule.season}</span>
      </div>

      {userSeed >= 0 && (
        <div className="mep-user-matchup">
          <div className="mep-um-label">YOUR OPENING MATCH</div>
          <div className="mep-um-teams">
            <span style={{ color: teamColor(userTeamId) }}>
              #{userSeed + 1} {teamTag(userTeamId)}
            </span>
            <span className="mep-um-vs">vs</span>
            {userOpp
              ? <span style={{ color: teamColor(userOpp) }}>
                  #{(bracket.seeds.indexOf(userOpp) + 1)} {teamTag(userOpp)}
                </span>
              : <span className="muted">TBD</span>
            }
          </div>
        </div>
      )}

      <div className="mep-seeds">
        <div className="mep-seeds-label">QUALIFIED TEAMS</div>
        <div className="mep-seeds-grid">
          {bracket.seeds.map((id, i) => {
            const rec    = seedStandings[id] ?? { wins: 0, losses: 0, points: 0 };
            const isUser = id === userTeamId;
            return (
              <div key={id} className={`mep-seed-row ${isUser ? "mep-seed-you" : ""}`}>
                <span className="mep-seed-num">{i + 1}</span>
                <span className="mep-seed-dot" style={{ background: teamColor(id) }} />
                <span className="mep-seed-name">{teamName(id)}</span>
                <span className="mep-seed-rec muted">{rec.wins}W–{rec.losses}L · {rec.points}pts</span>
                {isUser && <span className="you-badge">YOU</span>}
              </div>
            );
          })}
        </div>
      </div>

      <button className="btn-primary mep-enter-btn" onClick={onEnter}>
        Enter Tournament →
      </button>
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
