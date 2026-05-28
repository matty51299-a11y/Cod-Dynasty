// src/components/ChallengerQualifierOverlay.jsx
// Visible pre-Major Challenger Qualifier event. The event is simulated once and
// its completed top four become Major seeds 13–16.

import { useGame } from "../store/gameStore.jsx";
import TeamLogo from "./TeamLogo.jsx";

function ratingColor(n) {
  return n >= 80 ? "#22c55e" : n >= 74 ? "#84cc16" : n >= 68 ? "#f59e0b" : "#ef4444";
}

function rowTeam(row) {
  return {
    id: row.teamId,
    name: row.teamName,
    tag: row.tag,
    color: row.color,
    logo: row.logo,
    region: row.region,
  };
}

export default function ChallengerQualifierOverlay() {
  const { state, dispatch } = useGame();
  if (!state) return null;

  const { schedule } = state;
  if (schedule?.phase !== "challengerQualifier") return null;

  const qualifier = schedule.currentChallengerQualifier;
  if (!qualifier) return null;

  const majorIdx = qualifier.majorIdx ?? schedule.majorIdx ?? 0;
  const majorName = schedule.majors?.[majorIdx]?.name ?? `Major ${majorIdx + 1}`;
  const completed = !!qualifier.completed;
  const fieldRows = qualifier.field || [];
  const resultRows = completed ? (qualifier.results || []) : [];
  const qualified = resultRows.filter(r => r.qualified).sort((a, b) => a.placement - b.placement);

  return (
    <div className="cqo-backdrop">
      <div className="cqo-card">
        <div className="cqo-header">
          <div>
            <div className="cqo-kicker">CHALLENGERS EVENT</div>
            <h1>Challenger Qualifier</h1>
            <p>Season {schedule.season} · {majorName} Qualifier · Top 4 qualify for Major seeds 13–16</p>
          </div>
          <div className={`cqo-status ${completed ? "complete" : "pending"}`}>
            {completed ? "Complete" : "Ready to Sim"}
          </div>
        </div>

        <div className="cqo-grid">
          <section className="cqo-panel">
            <div className="cqo-panel-title">Qualifier Field</div>
            <div className="cqo-table cqo-field-table">
              <div className="cqo-row cqo-row-head">
                <span>Seed</span><span>Team</span><span>Region</span><span>OVR</span><span>Circuit</span><span>Form</span>
              </div>
              {fieldRows.map(row => (
                <div key={row.teamId} className="cqo-row">
                  <span className="cqo-seed">#{row.seed}</span>
                  <span className="cqo-team">
                    <TeamLogo team={rowTeam(row)} size={22} />
                    <span>{row.teamName}</span>
                  </span>
                  <span>{row.region}</span>
                  <span style={{ color: ratingColor(row.teamOvr), fontWeight: 800 }}>{row.teamOvr}</span>
                  <span>{row.circuitPointsBefore}</span>
                  <span>{row.formBefore > 0 ? `+${row.formBefore}` : row.formBefore}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="cqo-panel">
            <div className="cqo-panel-title">Qualifier Results</div>
            {!completed ? (
              <div className="cqo-empty">
                <div className="cqo-empty-icon">◈</div>
                <h3>16 teams are seeded and waiting.</h3>
                <p>Circuit points drive seeding, while current roster OVR, form, path advantage, roster disruption, and controlled variance decide the final table.</p>
              </div>
            ) : (
              <div className="cqo-table cqo-results-table">
                <div className="cqo-row cqo-row-head">
                  <span>Place</span><span>Team</span><span>Score</span><span>Pts</span><span>Status</span>
                </div>
                {resultRows.map(row => (
                  <div key={row.teamId} className={`cqo-row ${row.qualified ? "qualified" : "missed"}`}>
                    <span className="cqo-seed">#{row.placement}</span>
                    <span className="cqo-team">
                      <TeamLogo team={rowTeam(row)} size={22} />
                      <span>{row.teamName}</span>
                    </span>
                    <span>{row.performanceScore}</span>
                    <span>+{row.circuitPointsAwarded}</span>
                    <span className={row.qualified ? "cqo-qualified-pill" : "cqo-missed-pill"}>
                      {row.qualified ? "Qualified" : "Missed"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {completed && (
          <section className="cqo-qualified-card">
            <div className="cqo-panel-title">Major Seeds 13–16</div>
            <div className="cqo-qualified-grid">
              {qualified.map((row, idx) => (
                <div key={`q_${row.teamId}`} className="cqo-qualified-team">
                  <span className="cqo-seed-large">{idx + 13}</span>
                  <TeamLogo team={rowTeam(row)} size={28} />
                  <div>
                    <strong>{row.teamName}</strong>
                    <span>{row.placementLabel} · OVR {row.teamOvr}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="cqo-actions">
          {!completed ? (
            <button className="btn-cta cqo-primary" onClick={() => dispatch({ type: "SIM_CHALLENGER_QUALIFIER" })}>
              Sim Qualifier
            </button>
          ) : (
            <button className="btn-cta cqo-primary" onClick={() => dispatch({ type: "CONTINUE_FROM_CHALLENGER_QUALIFIER" })}>
              Continue to Major →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
