// src/components/MajorEntryOverlay.jsx
// Full-screen animated overlay shown at the start of every major tournament.
// Rendered from App.jsx so it truly sits above the entire application.
// Dismissed only by clicking "Enter Tournament" (non-closable backdrop).

import { useGame } from "../store/gameStore.jsx";
import { CDL_TEAMS } from "../data/teams.js";

function teamColor(id) { return CDL_TEAMS.find(t => t.id === id)?.color ?? "#888"; }
function teamName(id)  { return CDL_TEAMS.find(t => t.id === id)?.name  ?? id; }
function teamTag(id)   { return CDL_TEAMS.find(t => t.id === id)?.tag   ?? id; }

export default function MajorEntryOverlay() {
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
  const isDE     = bracket.type === "DE";

  const seedStandings = isChamps
    ? (schedule.standings ?? {})
    : (schedule.stageStandings ?? schedule.standings ?? {});

  // Find the user's seed index (0-based)
  const userSeedIdx = bracket.seeds?.indexOf(userTeamId) ?? -1;
  const userHasBye  = isDE && !isChamps && userSeedIdx >= 0 && userSeedIdx <= 3; // seeds 1–4 (no byes in Champs DE)

  // For seeds 5–12: find the opening WB Round 1 match
  const userWBR1Match = isDE && !userHasBye
    ? bracket.rounds?.[0]?.matches?.find(m => m.a === userTeamId || m.b === userTeamId)
    : null;
  const userWBR1Opp = userWBR1Match
    ? (userWBR1Match.a === userTeamId ? userWBR1Match.b : userWBR1Match.a)
    : null;
  const userWBR1OppSeedIdx = userWBR1Opp != null
    ? (bracket.seeds?.indexOf(userWBR1Opp) ?? -1)
    : -1;

  // For SE Champs: use existing QF logic
  const userQF = !isDE
    ? bracket.rounds?.[0]?.matches?.find(m => m.a === userTeamId || m.b === userTeamId)
    : null;
  const userQFOpp     = userQF ? (userQF.a === userTeamId ? userQF.b : userQF.a) : null;
  const userQFOppSeed = userQFOpp != null ? (bracket.seeds?.indexOf(userQFOpp) ?? -1) : -1;

  function enter() {
    dispatch({ type: "ENTER_MAJOR", majorIdx });
  }

  const seedCount = bracket.seeds?.length ?? (isDE ? 12 : 8);
  const formatStr = isDE
    ? `${seedCount} Teams · Double Elimination`
    : "Eight Teams · Single Elimination";

  return (
    <div className="meo-backdrop">
      <div className="meo-card">

        {/* ── Badge row ── */}
        <div className="meo-badges anim-stagger" style={{ "--stagger": 0 }}>
          <span className="meo-badge-event">TOURNAMENT EVENT</span>
          {isChamps && <span className="meo-badge-champs">WORLD CHAMPIONSHIP</span>}
          {isDE && !isChamps && <span className="meo-badge-de">DOUBLE ELIMINATION</span>}
        </div>

        {/* ── Title ── */}
        <div className="meo-title anim-stagger" style={{ "--stagger": 1 }}>
          {major.name.toUpperCase()}
        </div>
        <div className="meo-season anim-stagger" style={{ "--stagger": 2 }}>
          Season {schedule.season} · {formatStr}
        </div>

        {/* ── User's tournament situation ── */}
        {userSeedIdx >= 0 && (
          <div className="meo-user-match anim-stagger" style={{ "--stagger": 3 }}>
            {isDE && userHasBye ? (
              // Seeds 1–4: earned a WB Round 1 bye
              <>
                <div className="meo-um-label">YOUR OPENING ROUND</div>
                <div className="meo-um-bye-row">
                  <div className="meo-um-team">
                    <span className="meo-um-seed">#{userSeedIdx + 1}</span>
                    <span className="meo-um-name" style={{ color: teamColor(userTeamId) }}>
                      {teamName(userTeamId)}
                    </span>
                    <span className="meo-um-you">YOU</span>
                  </div>
                  <div className="meo-um-bye-badge">WB Round 1 Bye</div>
                  <div className="meo-um-bye-note muted">
                    You enter in WB Round 2 — earned by finishing in the top 4
                  </div>
                </div>
              </>
            ) : isDE && userWBR1Match ? (
              // Seeds 5–12: show WB Round 1 opening match
              <>
                <div className="meo-um-label">YOUR OPENING MATCH · WB ROUND 1</div>
                <div className="meo-um-row">
                  <div className="meo-um-team">
                    <span className="meo-um-seed">#{userSeedIdx + 1}</span>
                    <span className="meo-um-name" style={{ color: teamColor(userTeamId) }}>
                      {teamName(userTeamId)}
                    </span>
                    <span className="meo-um-you">YOU</span>
                  </div>
                  <span className="meo-um-vs">vs</span>
                  <div className="meo-um-team meo-um-team-opp">
                    {userWBR1Opp != null ? (
                      <>
                        <span className="meo-um-seed">#{userWBR1OppSeedIdx + 1}</span>
                        <span className="meo-um-name" style={{ color: teamColor(userWBR1Opp) }}>
                          {teamName(userWBR1Opp)}
                        </span>
                      </>
                    ) : (
                      <span className="muted">TBD</span>
                    )}
                  </div>
                </div>
              </>
            ) : !isDE && userQF ? (
              // SE Champs: show Quarterfinal match
              <>
                <div className="meo-um-label">YOUR OPENING MATCH</div>
                <div className="meo-um-row">
                  <div className="meo-um-team">
                    <span className="meo-um-seed">#{userSeedIdx + 1}</span>
                    <span className="meo-um-name" style={{ color: teamColor(userTeamId) }}>
                      {teamName(userTeamId)}
                    </span>
                    <span className="meo-um-you">YOU</span>
                  </div>
                  <span className="meo-um-vs">vs</span>
                  <div className="meo-um-team meo-um-team-opp">
                    {userQFOpp != null ? (
                      <>
                        <span className="meo-um-seed">#{userQFOppSeed + 1}</span>
                        <span className="meo-um-name" style={{ color: teamColor(userQFOpp) }}>
                          {teamName(userQFOpp)}
                        </span>
                      </>
                    ) : (
                      <span className="muted">TBD</span>
                    )}
                  </div>
                </div>
              </>
            ) : null}
          </div>
        )}

        {/* ── Seedings grid ── */}
        <div className="meo-seeds-block anim-stagger" style={{ "--stagger": 4 }}>
          <div className="meo-seeds-label">
            {isDE && !isChamps ? `ALL ${seedCount} TEAMS` : "QUALIFIED TEAMS"}
          </div>
          <div className={`meo-seeds-grid ${isDE ? "meo-seeds-grid-de" : ""}`}>
            {bracket.seeds.map((id, i) => {
              const rec    = seedStandings[id] ?? { wins: 0, losses: 0, points: 0 };
              const isUser = id === userTeamId;
              const hasBye = isDE && !isChamps && i <= 3;
              return (
                <div key={id} className={`meo-seed-row ${isUser ? "meo-seed-you" : ""}`}>
                  <span className="meo-seed-num">{i + 1}</span>
                  <span className="meo-seed-dot" style={{ background: teamColor(id) }} />
                  <span className="meo-seed-name" style={isUser ? { color: teamColor(id) } : {}}>
                    {isUser ? teamName(id) : teamTag(id)}
                  </span>
                  <span className="meo-seed-rec">{rec.wins}W–{rec.losses}L</span>
                  {hasBye && <span className="meo-bye-badge">Bye</span>}
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
