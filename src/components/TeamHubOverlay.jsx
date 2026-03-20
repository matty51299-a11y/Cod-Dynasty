// src/components/TeamHubOverlay.jsx
// Compact scouting panel — opens when any team name is clicked.
// Works for any team (user or AI). Derives all data from game state.

import { useTeamHub } from "../store/teamHubContext.jsx";
import { useGame }    from "../store/gameStore.jsx";
import { CDL_TEAMS }  from "../data/teams.js";
import { calcTeamOvr } from "../engine/teamOvr.js";

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

  if (!openTeamId || !state) return null;

  const { schedule, players, userTeamId } = state;
  const team = CDL_TEAMS.find(t => t.id === openTeamId);
  if (!team) return null;

  const isUser    = openTeamId === userTeamId;
  const teamOvr   = calcTeamOvr(openTeamId, players);
  const matchLog  = schedule?.matchLog ?? [];
  const phase     = schedule?.phase;

  // ── Record ──────────────────────────────────────────────────────────────────
  const seasonRec = schedule?.standings?.[openTeamId]       ?? { wins: 0, losses: 0, points: 0 };
  const stageRec  = schedule?.stageStandings?.[openTeamId]  ?? { wins: 0, losses: 0, points: 0 };
  const showStage = phase === "stage" || phase === "major";

  // ── League rank (by season pts) ─────────────────────────────────────────────
  const rank = CDL_TEAMS
    .map(t => ({ id: t.id, pts: schedule?.standings?.[t.id]?.points ?? 0 }))
    .sort((a, b) => b.pts - a.pts)
    .findIndex(t => t.id === openTeamId) + 1;

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
  const roster = players
    .filter(p => p.teamId === openTeamId)
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
            #{rank} in league · {seasonRec.wins}W–{seasonRec.losses}L · {seasonRec.points} pts
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
                    <span className="th-p-name">{p.name}</span>
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

        {/* ── Top performer callout ── */}
        {topPerformer && (
          <div className="th-top-performer">
            <span className="th-tp-star">★</span>
            <strong className="th-tp-name">{topPerformer.name}</strong>
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
