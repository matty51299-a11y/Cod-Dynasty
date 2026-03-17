// src/components/MajorEntryOverlay.jsx
// Full-screen animated overlay shown at the start of every major tournament.
// Rendered from App.jsx so it truly sits above the entire application.
// Dismissed only by clicking "Enter Tournament" (non-closable backdrop).

import { useGame } from "../store/gameStore.jsx";
import { CDL_TEAMS } from "../data/teams.js";

function teamColor(id) { return CDL_TEAMS.find(t => t.id === id)?.color ?? "#888"; }
function teamName(id)  { return CDL_TEAMS.find(t => t.id === id)?.name  ?? id; }
function teamTag(id)   { return CDL_TEAMS.find(t => t.id === id)?.tag   ?? id; }

export default function MajorEntryOverlay({ setTab }) {
  const { state, dispatch } = useGame();
  if (!state) return null;

  const { schedule, userTeamId } = state;
  if (schedule.phase !== "major") return null;

  const majorIdx = schedule.majorIdx ?? (schedule.currentStage ?? 0);
  const major    = schedule.majors?.[majorIdx];
  const bracket  = major?.bracket;
  const isEntered = (state.enteredMajorIdx ?? null) === majorIdx;

  if (!bracket || isEntered) return null;

  const isChamps = majorIdx === 4;

  // Correct standings source
  const seedStandings = isChamps
    ? (schedule.standings ?? {})
    : (schedule.stageStandings ?? schedule.standings ?? {});

  const userSeed    = bracket.seeds?.indexOf(userTeamId) ?? -1;
  const userQF      = bracket.rounds?.[0]?.matches?.find(m => m.a === userTeamId || m.b === userTeamId);
  const userOpp     = userQF ? (userQF.a === userTeamId ? userQF.b : userQF.a) : null;
  const userOppSeed = userOpp != null ? (bracket.seeds?.indexOf(userOpp) ?? -1) : -1;

  function enter() {
    dispatch({ type: "ENTER_MAJOR", majorIdx });
    if (setTab) setTab("major");
  }

  return (
    <div className="meo-backdrop">
      <div className="meo-card">

        {/* ── Badge row ── */}
        <div className="meo-badges anim-stagger" style={{ "--stagger": 0 }}>
          <span className="meo-badge-event">TOURNAMENT EVENT</span>
          {isChamps && <span className="meo-badge-champs">WORLD CHAMPIONSHIP</span>}
        </div>

        {/* ── Title ── */}
        <div className="meo-title anim-stagger" style={{ "--stagger": 1 }}>
          {major.name.toUpperCase()}
        </div>
        <div className="meo-season anim-stagger" style={{ "--stagger": 2 }}>
          Season {schedule.season} · Eight Teams · Single Elimination
        </div>

        {/* ── Your opening match ── */}
        {userSeed >= 0 && (
          <div className="meo-user-match anim-stagger" style={{ "--stagger": 3 }}>
            <div className="meo-um-label">YOUR OPENING MATCH</div>
            <div className="meo-um-row">
              <div className="meo-um-team">
                <span className="meo-um-seed">#{userSeed + 1}</span>
                <span className="meo-um-name" style={{ color: teamColor(userTeamId) }}>
                  {teamName(userTeamId)}
                </span>
                <span className="meo-um-you">YOU</span>
              </div>
              <span className="meo-um-vs">vs</span>
              <div className="meo-um-team meo-um-team-opp">
                {userOpp != null ? (
                  <>
                    <span className="meo-um-seed">#{userOppSeed + 1}</span>
                    <span className="meo-um-name" style={{ color: teamColor(userOpp) }}>
                      {teamName(userOpp)}
                    </span>
                  </>
                ) : (
                  <span className="muted">TBD</span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Seedings grid ── */}
        <div className="meo-seeds-block anim-stagger" style={{ "--stagger": 4 }}>
          <div className="meo-seeds-label">QUALIFIED TEAMS</div>
          <div className="meo-seeds-grid">
            {bracket.seeds.map((id, i) => {
              const rec    = seedStandings[id] ?? { wins: 0, losses: 0, points: 0 };
              const isUser = id === userTeamId;
              return (
                <div key={id} className={`meo-seed-row ${isUser ? "meo-seed-you" : ""}`}>
                  <span className="meo-seed-num">{i + 1}</span>
                  <span className="meo-seed-dot" style={{ background: teamColor(id) }} />
                  <span className="meo-seed-name" style={isUser ? { color: teamColor(id) } : {}}>
                    {isUser ? teamName(id) : teamTag(id)}
                  </span>
                  <span className="meo-seed-rec">{rec.wins}W–{rec.losses}L</span>
                  {isUser && <span className="you-badge">YOU</span>}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── CTA ── */}
        <button
          className="meo-enter-btn anim-stagger"
          style={{ "--stagger": 5 }}
          onClick={enter}
        >
          Enter Tournament →
        </button>

      </div>
    </div>
  );
}
