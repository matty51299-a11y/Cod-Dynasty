// src/components/ChallengerQualifierOverlay.jsx
// Visible pre-Major Challenger Qualifier event. The event now progresses through
// a 16-team double-elimination bracket and its completed top four become Major
// seeds 13–16.

import { useGame } from "../store/gameStore.jsx";
import TeamLogo from "./TeamLogo.jsx";

function ratingColor(n) {
  return n >= 80 ? "#86efac" : n >= 74 ? "#bef264" : n >= 68 ? "#fcd34d" : "#fca5a5";
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

function teamById(fieldRows) {
  return Object.fromEntries((fieldRows || []).map(row => [row.teamId, row]));
}

function scoreFor(match, teamId) {
  if (!match?.played || !match.result) return "";
  if (match.result.teamAId === teamId) return match.result.winsA;
  if (match.result.teamBId === teamId) return match.result.winsB;
  return "";
}

function MatchTeam({ row, seed, score, winner }) {
  if (!row) return <div className="cqo-bracket-team empty"><span>TBD</span></div>;
  return (
    <div className={`cqo-bracket-team ${winner ? "winner" : ""}`}>
      <TeamLogo team={rowTeam(row)} size={18} />
      <span className="cqo-bracket-seed">#{seed ?? row.seed}</span>
      <span className="cqo-bracket-name">{row.teamName}</span>
      <strong>{score}</strong>
    </div>
  );
}

function BracketMatch({ match, fieldMap, next }) {
  const a = fieldMap[match.a];
  const b = fieldMap[match.b];
  const winnerId = match.result?.winnerId;
  return (
    <div className={`cqo-bracket-match ${match.played ? "played" : ""} ${next ? "next" : ""}`}>
      <MatchTeam row={a} seed={match.seedA} score={scoreFor(match, match.a)} winner={winnerId === match.a} />
      <MatchTeam row={b} seed={match.seedB} score={scoreFor(match, match.b)} winner={winnerId === match.b} />
    </div>
  );
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
  const fieldMap = teamById(fieldRows);
  const resultRows = completed ? (qualifier.results || []) : [];
  const qualified = resultRows.filter(r => r.qualified).sort((a, b) => a.placement - b.placement);
  const bracket = qualifier.bracket;
  let nextMatch = null;
  for (const [roundIdx, round] of (bracket?.rounds || []).entries()) {
    const matchIdx = (round.matches || []).findIndex(m => !m.played && m.a && m.b);
    if (matchIdx !== -1) {
      nextMatch = { roundIdx, roundName: round.name, matchIdx, match: round.matches[matchIdx] };
      break;
    }
  }
  const alive = fieldRows.filter(row => {
    const losses = (qualifier.matchLog || []).filter(m => m.loserId === row.teamId).length;
    return !completed && losses < 2;
  });

  return (
    <div className="cqo-backdrop">
      <div className="cqo-card">
        <div className="cqo-header">
          <div>
            <div className="cqo-kicker">CHALLENGERS EVENT</div>
            <h1>Challenger Qualifier</h1>
            <p>Season {schedule.season} · {majorName} Qualifier · 16-team double elimination · Top 4 become Major seeds 13–16</p>
          </div>
          <div className={`cqo-status ${completed ? "complete" : "pending"}`}>
            {completed ? "Complete" : nextMatch ? nextMatch.roundName : "Ready"}
          </div>
        </div>

        <section className="cqo-control-strip">
          <div>
            <span className="cqo-label">Next Match</span>
            <strong>{nextMatch ? `${fieldMap[nextMatch.match.a]?.teamName || "TBD"} vs ${fieldMap[nextMatch.match.b]?.teamName || "TBD"}` : completed ? "Qualifier complete" : "Building bracket"}</strong>
          </div>
          <div>
            <span className="cqo-label">Still Alive</span>
            <strong>{completed ? 1 : alive.length}</strong>
          </div>
          <div>
            <span className="cqo-label">Locked Qualified</span>
            <strong>{qualified.length ? qualified.map(r => r.tag || r.teamName).join(", ") : "Top 4 pending"}</strong>
          </div>
        </section>

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
                  <span style={{ color: ratingColor(row.teamOvr), fontWeight: 900 }}>{row.teamOvr}</span>
                  <span>{row.circuitPointsBefore}</span>
                  <span>{row.formBefore > 0 ? `+${row.formBefore}` : row.formBefore}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="cqo-panel cqo-bracket-panel">
            <div className="cqo-panel-title">Bracket Progress</div>
            <div className="cqo-bracket-scroller">
              {(bracket?.rounds || []).map((round, roundIdx) => (
                <div key={round.name} className={`cqo-bracket-round ${round.type?.toLowerCase() || ""}`}>
                  <h4>{round.name}</h4>
                  {round.matches?.length ? round.matches.map((match, matchIdx) => (
                    <BracketMatch key={`${round.name}_${matchIdx}`} match={match} fieldMap={fieldMap} next={nextMatch?.roundIdx === roundIdx && nextMatch?.matchIdx === matchIdx} />
                  )) : <div className="cqo-round-empty">Awaiting results</div>}
                </div>
              ))}
            </div>
          </section>
        </div>

        <section className="cqo-qualified-card">
          <div className="cqo-panel-title">{completed ? "Final Placements" : "Live Qualification Picture"}</div>
          {!completed ? (
            <p className="cqo-help">Play the bracket one match or one round at a time. Circuit points only seed the field; match results decide the four Major entrants.</p>
          ) : (
            <div className="cqo-table cqo-results-table">
              <div className="cqo-row cqo-row-head">
                <span>Place</span><span>Team</span><span>Record</span><span>Pts</span><span>Status</span>
              </div>
              {resultRows.map(row => (
                <div key={row.teamId} className={`cqo-row ${row.qualified ? "qualified" : "missed"}`}>
                  <span className="cqo-seed">#{row.placement}</span>
                  <span className="cqo-team">
                    <TeamLogo team={rowTeam(row)} size={22} />
                    <span>{row.teamName}</span>
                  </span>
                  <span>{row.bracketResult || row.performanceScore}</span>
                  <span>+{row.circuitPointsAwarded}</span>
                  <span className={row.qualified ? "cqo-qualified-pill" : "cqo-missed-pill"}>
                    {row.qualified ? "Qualified" : "Missed"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

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
            <>
              <button className="btn-secondary" onClick={() => dispatch({ type: "SIM_NEXT_CHALLENGER_QUALIFIER_MATCH" })}>Sim Next Match</button>
              <button className="btn-secondary" onClick={() => dispatch({ type: "SIM_CHALLENGER_QUALIFIER_ROUND" })}>Sim Current Round</button>
              <button className="btn-cta cqo-primary" onClick={() => dispatch({ type: "SIM_CHALLENGER_QUALIFIER" })}>Finish Qualifier</button>
            </>
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
