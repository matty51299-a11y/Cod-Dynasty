// src/components/Schedule.jsx
// Stage schedule view: matches grouped by matchday, played results + upcoming.

import { useGame } from "../store/gameStore.jsx";
import { CDL_TEAMS } from "../data/teams.js";

function teamColor(id) { return CDL_TEAMS.find(t => t.id === id)?.color ?? "#888"; }
function teamTag(id)   { return CDL_TEAMS.find(t => t.id === id)?.tag   ?? id; }

const MATCHES_PER_DAY = 6; // 12 teams → 6 matches per matchday

function groupByMatchday(matches) {
  const days = [];
  for (let i = 0; i < matches.length; i += MATCHES_PER_DAY) {
    days.push(matches.slice(i, i + MATCHES_PER_DAY));
  }
  return days;
}

export default function Schedule() {
  const { state } = useGame();
  if (!state) return null;

  const { schedule, userTeamId } = state;
  const phase = schedule.phase;

  if (phase !== "stage") {
    const phaseLabel =
      phase === "major"     ? "Major in progress" :
      phase === "preChamps" ? "Pre-Championship window" :
      phase === "offseason" ? "Offseason — no active stage" :
      phase;
    return (
      <div className="screen-padded">
        <h2 className="screen-title">Schedule</h2>
        <p className="muted">{phaseLabel}. Stage schedule will appear here when a stage is active.</p>
      </div>
    );
  }

  const stageIdx  = schedule.stageIdx ?? 0;
  const stage     = schedule.stages?.[stageIdx];
  const stageName = stage?.name ?? "Stage";
  const matches   = stage?.matches ?? [];
  const matchdays = groupByMatchday(matches);
  const currentMatchday = matchdays.findIndex(day => day.some(m => !m.played));

  return (
    <div className="screen-padded">
      <h2 className="screen-title">{stageName} — Schedule</h2>

      <div className="sched-matchdays">
        {matchdays.map((day, di) => {
          const isCurrentDay = di === currentMatchday;
          const isDone       = day.every(m => m.played);
          return (
            <div key={di} className={`sched-day ${isCurrentDay ? "sched-day-active" : ""}`}>
              <div className="sched-day-header">
                <span className="sched-day-label">Matchday {di + 1}</span>
                {isCurrentDay && <span className="sched-badge sched-badge-live">▶ Next</span>}
                {isDone && !isCurrentDay && <span className="sched-badge sched-badge-done">✓ Done</span>}
              </div>

              <div className="sched-matches">
                {day.map((match, mi) => {
                  const isUser = match.a === userTeamId || match.b === userTeamId;
                  const result = match.result;
                  return (
                    <div
                      key={mi}
                      className={`sched-match ${isUser ? "sched-match-user" : ""} ${match.played ? "sched-match-played" : ""}`}
                    >
                      <span className="sched-team" style={{ color: teamColor(match.a) }}>
                        {teamTag(match.a)}
                        {match.played && result && (
                          <span className={`sched-score ${result.winnerId === match.a ? "sc-win" : "sc-loss"}`}>
                            {result.teamAId === match.a ? result.winsA : result.winsB}
                          </span>
                        )}
                      </span>

                      {match.played ? (
                        <span className="sched-sep">—</span>
                      ) : (
                        <span className="sched-sep">vs</span>
                      )}

                      <span className="sched-team sched-team-b" style={{ color: teamColor(match.b) }}>
                        {match.played && result && (
                          <span className={`sched-score ${result.winnerId === match.b ? "sc-win" : "sc-loss"}`}>
                            {result.teamAId === match.a ? result.winsB : result.winsA}
                          </span>
                        )}
                        {teamTag(match.b)}
                      </span>

                      {!match.played && isUser && (
                        <span className="sched-upcoming">UPCOMING</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
