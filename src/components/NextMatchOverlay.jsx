// src/components/NextMatchOverlay.jsx
// Phase 1 shell: full-screen match preview overlay.
// The "Simulate" action is intentionally NOT wired here.
// Phase 2 will turn this into the main match progression loop.

import { useGame } from "../store/gameStore.jsx";
import { CDL_TEAMS } from "../data/teams.js";

function teamColor(id) { return CDL_TEAMS.find(t => t.id === id)?.color ?? "#888"; }
function teamName(id)  { return CDL_TEAMS.find(t => t.id === id)?.name  ?? id; }
function teamTag(id)   { return CDL_TEAMS.find(t => t.id === id)?.tag   ?? id; }

export default function NextMatchOverlay({ isOpen, onClose }) {
  const { state } = useGame();

  if (!isOpen || !state) return null;

  const { schedule, userTeamId } = state;
  const stageIdx = schedule.stageIdx ?? 0;
  const stage    = schedule.stages?.[stageIdx];
  const stageName = stage?.name ?? "Stage";

  const nextMatch = stage?.matches.find(
    m => !m.played && (m.a === userTeamId || m.b === userTeamId)
  ) ?? null;

  const oppId     = nextMatch ? (nextMatch.a === userTeamId ? nextMatch.b : nextMatch.a) : null;
  const stageStandings = schedule.stageStandings ?? {};

  function getRecord(id) {
    const r = stageStandings[id] ?? { wins: 0, losses: 0 };
    return `${r.wins}W–${r.losses}L`;
  }

  // Find matchday index for context label
  const matchdayCtx = (() => {
    if (!stage || !nextMatch) return null;
    // Group matches into matchdays by finding index of nextMatch
    const matchIdx = stage.matches.indexOf(nextMatch);
    if (matchIdx < 0) return null;
    const teamsCount = 12; // 12 teams → 6 matches per matchday
    const matchday = Math.floor(matchIdx / 6) + 1;
    return `${stageName} — Matchday ${matchday}`;
  })();

  return (
    <div className="nmo-backdrop" onClick={onClose}>
      <div className="nmo-card" onClick={e => e.stopPropagation()}>
        {/* Close */}
        <button className="nmo-close" onClick={onClose} aria-label="Close">✕</button>

        {/* Context label */}
        <div className="nmo-context">
          {matchdayCtx ?? stageName}
        </div>
        <div className="nmo-title">YOUR NEXT MATCH</div>

        {nextMatch ? (
          <>
            {/* Team matchup */}
            <div className="nmo-matchup">
              {/* User team */}
              <div className="nmo-team nmo-team-user">
                <div className="nmo-team-name" style={{ color: teamColor(userTeamId) }}>
                  {teamName(userTeamId)}
                </div>
                <div className="nmo-team-tag" style={{ color: teamColor(userTeamId) }}>
                  {teamTag(userTeamId)}
                </div>
                <div className="nmo-team-rec">{getRecord(userTeamId)}</div>
                <span className="nmo-you-badge">YOU</span>
              </div>

              <div className="nmo-vs-block">
                <span className="nmo-vs">vs</span>
              </div>

              {/* Opponent */}
              <div className="nmo-team">
                <div className="nmo-team-name" style={{ color: teamColor(oppId) }}>
                  {teamName(oppId)}
                </div>
                <div className="nmo-team-tag" style={{ color: teamColor(oppId) }}>
                  {teamTag(oppId)}
                </div>
                <div className="nmo-team-rec">{getRecord(oppId)}</div>
              </div>
            </div>

            {/* Phase 1: placeholder action area — Phase 2 will wire the match loop here */}
            <div className="nmo-actions">
              {/* TODO (Phase 2): replace with SimMatchButton that drives the interactive match loop */}
              <button className="nmo-sim-placeholder" disabled>
                ▶ Simulate Match
                <span className="nmo-phase-badge">Phase 2</span>
              </button>
              <button className="btn-secondary" onClick={onClose}>Close</button>
            </div>
          </>
        ) : (
          <div className="nmo-no-match">
            <p>No upcoming match found for this stage.</p>
            <button className="btn-secondary" onClick={onClose}>Close</button>
          </div>
        )}
      </div>
    </div>
  );
}
