// src/components/TeamHubOverlay.jsx
// Compact scouting panel — opens when any team name is clicked.
// Works for any team (user or AI). Derives all data from game state.

import { useState } from "react";
import { useTeamHub } from "../store/teamHubContext.jsx";
import { useGame }    from "../store/gameStore.jsx";
import { CDL_TEAMS }  from "../data/teams.js";
import { calcTeamOvr } from "../engine/teamOvr.js";
import { usePlayerProfile } from "../store/playerProfileContext.jsx";
import { buildTeamHistory, findTeamEverywhere, getTeamRoster, kdText } from "../utils/historyProfiles.js";

function kdColor(kd) {
  if (kd >= 1.4) return "var(--green)";
  if (kd >= 1.1) return "var(--green)";
  if (kd >= 0.9) return "var(--accent)";
  if (kd >= 0.7) return "var(--text-dim)";
  return "var(--red)";
}

export default function TeamHubOverlay() {
  const { openTeamId, closeTeamHub } = useTeamHub();
  const { state } = useGame();
  const { openPlayerProfile } = usePlayerProfile();
  const [tab, setTab] = useState(null);

  if (!openTeamId || !state) return null;

  const { schedule, players, userTeamId } = state;
  const team = findTeamEverywhere(state, openTeamId);
  if (!team) return null;

  const isCdl = CDL_TEAMS.some(t => t.id === openTeamId);
  const isUser    = openTeamId === userTeamId;
  const rosterForOvr = getTeamRoster(state, openTeamId);
  const teamOvr   = isCdl ? calcTeamOvr(openTeamId, players) : rosterForOvr.length ? Math.round(rosterForOvr.reduce((sum, p) => sum + (p.overall ?? 65), 0) / rosterForOvr.length) : (team.teamOvr ?? 0);
  const history = buildTeamHistory(state, openTeamId);
  const historySeasons = history.seasons.length ? history.seasons : [{ season: state.season, wins: 0, losses: 0, maps: 0, kills: 0, deaths: 0, events: [], rosterIds: new Set(rosterForOvr.map(p => p.id)) }];
  const activeSeason = tab ?? historySeasons[historySeasons.length - 1]?.season;
  const seasonHistory = historySeasons.find(s => s.season === activeSeason) ?? historySeasons[0];
  const matchLog  = schedule?.matchLog ?? [];
  const phase     = schedule?.phase;

  // ── Record ──────────────────────────────────────────────────────────────────
  const seasonRec = schedule?.standings?.[openTeamId]       ?? { wins: seasonHistory.wins ?? 0, losses: seasonHistory.losses ?? 0, points: team.circuitPoints ?? 0 };
  const stageRec  = schedule?.stageStandings?.[openTeamId]  ?? { wins: 0, losses: 0, points: 0 };
  const showStage = phase === "stage" || phase === "major";

  // ── League rank (by season pts) ─────────────────────────────────────────────
  const rank = isCdl ? CDL_TEAMS
    .map(t => ({ id: t.id, pts: schedule?.standings?.[t.id]?.points ?? 0 }))
    .sort((a, b) => b.pts - a.pts)
    .findIndex(t => t.id === openTeamId) + 1 : null;

  // ── Recent form (last 5 results, newest first) ───────────────────────────────
  const recentMatches = matchLog
    .filter(r => r.winnerId === openTeamId || r.loserId === openTeamId)
    .slice(-5)
    .reverse();
  const form = recentMatches.map(r => (r.winnerId === openTeamId ? "W" : "L"));

  // Streak from newest result
  let streak = 0;
  let streakType = null;
  for (const f of form) {
    if (streakType === null) streakType = f;
    if (f === streakType) streak++;
    else break;
  }
  const streakText = streak >= 2
    ? `${streak} ${streakType === "W" ? "win" : "loss"} streak`
    : null;

  // ── Roster ───────────────────────────────────────────────────────────────────
  const roster = getTeamRoster(state, openTeamId)
    .sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0));

  // ── Player K/D from matchLog ─────────────────────────────────────────────────
  const kdTotals = {};
  for (const entry of matchLog) {
    if (!entry.playerStats) continue;
    for (const [pid, stats] of Object.entries(entry.playerStats)) {
      if (stats.teamId !== openTeamId) continue;
      if (!kdTotals[pid]) kdTotals[pid] = { name: stats.name, kills: 0, deaths: 0 };
      kdTotals[pid].kills  += stats.kills  ?? 0;
      kdTotals[pid].deaths += stats.deaths ?? 0;
    }
  }

  const kdMap = {};
  let topPerformer = null;
  for (const [pid, data] of Object.entries(kdTotals)) {
    const kd = data.deaths > 0 ? data.kills / data.deaths : data.kills;
    kdMap[pid] = kd;
    if (!topPerformer || kd > topPerformer.kd) {
      topPerformer = { id: pid, name: data.name, kd };
    }
  }

  return (
    <div className="th-backdrop" onClick={closeTeamHub}>
      <div className="th-panel" onClick={e => e.stopPropagation()}>

        {/* Close */}
        <button className="th-close" onClick={closeTeamHub} aria-label="Close">✕</button>

        {/* ── Header ── */}
        <div className="th-header" style={{ borderLeftColor: team.color }}>
          <div className="th-name-row">
            <span className="th-dot" style={{ background: team.color }} />
            <span className="th-team-name" style={{ color: team.color }}>{team.name}</span>
            <span className="th-tag">{team.tag}</span>
            {isUser && <span className="th-you">YOU</span>}
          </div>
          <div className="th-rank muted">
            {isCdl ? `#${rank} in league · ` : `${team.region ?? "Challengers"} · `}{seasonRec.wins}W–{seasonRec.losses}L · {isCdl ? `${seasonRec.points} CDL pts` : `${team.circuitPoints ?? seasonRec.points ?? 0} circuit pts`}
          </div>
          <div className="th-ovr-row">
            <span className="th-ovr-label">Team OVR</span>
            <span className="th-ovr-value" style={{ color: team.color }}>{teamOvr}</span>
          </div>
        </div>

        {/* ── Stats ── */}
        <div className="th-stats">
          {showStage && (
            <div className="th-stat-row">
              <span className="th-stat-label">Stage</span>
              <span className="th-stat-val">{stageRec.wins}W–{stageRec.losses}L</span>
              <span className="th-stat-pts">{stageRec.points} pts</span>
            </div>
          )}
          <div className="th-stat-row">
            <span className="th-stat-label">Season</span>
            <span className="th-stat-val">{seasonRec.wins}W–{seasonRec.losses}L</span>
            <span className="th-stat-pts">{seasonRec.points} pts</span>
          </div>
        </div>

        {/* ── Recent form ── */}
        {form.length > 0 && (
          <div className="th-section">
            <div className="th-section-label">RECENT FORM</div>
            <div className="th-form-row">
              {form.map((f, i) => (
                <span key={i} className={`th-form-pip ${f === "W" ? "th-fw" : "th-fl"}`}>{f}</span>
              ))}
              {streakText && <span className="th-streak">{streakText}</span>}
            </div>
          </div>
        )}

        {/* ── Roster ── */}
        {roster.length > 0 && (
          <div className="th-section">
            <div className="th-section-label">ROSTER</div>
            <div className="th-roster">
              {roster.map(p => {
                const kd    = kdMap[p.id];
                const isTop = topPerformer?.id === p.id && kd != null;
                return (
                  <div key={p.id} className={`th-player ${isTop ? "th-player-top" : ""}`}>
                    <button className="link-button player-link th-p-name" onClick={() => openPlayerProfile(p)}>{p.name}</button>
                    <span className="th-p-ovr">{p.overall ?? "—"}</span>
                    {p.role && <span className="th-p-role">{p.role}</span>}
                    {kd != null && (
                      <span className="th-p-kd" style={{ color: kdColor(kd) }}>
                        {kd.toFixed(2)}
                      </span>
                    )}
                    {isTop && <span className="th-p-star">★</span>}
                  </div>
                );
              })}
            </div>
          </div>
        )}



        {/* ── Season history ── */}
        <div className="th-section">
          <div className="th-section-label">SEASON HISTORY</div>
          <div className="profile-tabs compact">
            {historySeasons.map(s => <button key={s.season} className={s.season === seasonHistory.season ? "active" : ""} onClick={() => setTab(s.season)}>S{ s.season }</button>)}
          </div>
          <div className="th-stat-row">
            <span className="th-stat-label">Season {seasonHistory.season}</span>
            <span className="th-stat-val">{seasonHistory.wins}W–{seasonHistory.losses}L</span>
            <span className="th-stat-pts">{seasonHistory.points ? `${seasonHistory.points} pts · ` : ""}{kdText(seasonHistory.kills, seasonHistory.deaths)} K/D</span>
          </div>
          {seasonHistory.events?.length ? (
            <div className="team-history-list">
              {seasonHistory.events.slice(-8).reverse().map((event, i) => (
                <div key={`${event.eventName}_${i}`} className="team-history-item">
                  <strong>{event.eventName}</strong>
                  <span>{event.result || event.placement || "Not tracked yet"}</span>
                </div>
              ))}
            </div>
          ) : <p className="muted">No tracked events for this team season yet.</p>}
          {(seasonHistory.roster?.length || roster.length > 0) && (
            <div className="team-history-roster muted">
              {seasonHistory.season === state.season ? "Current roster" : "Roster snapshot"}: {(seasonHistory.roster?.length ? seasonHistory.roster : roster).map((p, i) => <span key={p.id}>{i > 0 ? ", " : ""}<button className="link-button player-link" onClick={() => openPlayerProfile(p.id || p)}>{p.name}</button></span>)}
            </div>
          )}
        </div>

        {/* ── Top performer callout ── */}
        {topPerformer && (
          <div className="th-top-performer">
            <span className="th-tp-star">★</span>
            <button className="link-button player-link th-tp-name" onClick={() => openPlayerProfile(topPerformer.id)}>{topPerformer.name}</button>
            <span className="th-tp-kd" style={{ color: kdColor(topPerformer.kd) }}>
              {topPerformer.kd.toFixed(2)} K/D
            </span>
            <span className="th-tp-label">Team Leader</span>
          </div>
        )}

      </div>
    </div>
  );
}
