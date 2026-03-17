// src/components/MajorBracket.jsx
// Dedicated Major/Championship bracket screen.
//
// Layout:
//   Tab strip  → Major 1 | Major 2 | Championship
//   Controls   → Sim Next Match | Sim Current Round | Sim Entire Major
//   Seedings   → top-8 seed list with standings points
//   Rounds     → Quarterfinals → Semifinals → Grand Final
//     Each match card shows team names, scores if played, and a
//     "Details ▼" button that expands the full BO5 SeriesDetail inline.

import { useState } from "react";
import { useGame } from "../store/gameStore.jsx";
import { CDL_TEAMS } from "../data/teams.js";
import SeriesDetail from "./SeriesDetail.jsx";

function teamName(id) { return CDL_TEAMS.find(t => t.id === id)?.name  ?? id; }
function teamTag(id)  { return CDL_TEAMS.find(t => t.id === id)?.tag   ?? id; }
function teamColor(id){ return CDL_TEAMS.find(t => t.id === id)?.color ?? "#888"; }

// ── Seed list ─────────────────────────────────────────────────────────────────
function SeedList({ seeds, standings }) {
  return (
    <div className="seed-list">
      <div className="seed-list-title">Seedings</div>
      <div className="seed-rows">
        {seeds.map((id, i) => {
          const rec = standings[id] ?? { wins: 0, losses: 0, points: 0 };
          return (
            <div key={id} className="seed-row">
              <span className="seed-num">{i + 1}</span>
              <span className="seed-dot" style={{ background: teamColor(id) }} />
              <span className="seed-name">{teamName(id)}</span>
              <span className="seed-record muted">{rec.wins}W–{rec.losses}L</span>
              <span className="seed-pts">{rec.points} pts</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Single match card ─────────────────────────────────────────────────────────
function MatchCard({ match, bracket, roundName, userTeamId, expandedKey, setExpandedKey, cardKey }) {
  const isPlayed = match.played;
  const result   = match.result;

  // Seed lookup (seeds only on QF matches — SF/GF don't have seedA/seedB)
  const seedA = match.seedA ?? (bracket.seeds ? bracket.seeds.indexOf(match.a) + 1 : null);
  const seedB = match.seedB ?? (bracket.seeds ? bracket.seeds.indexOf(match.b) + 1 : null);

  const userInvolved = match.a === userTeamId || match.b === userTeamId;
  const userWon      = isPlayed && result?.winnerId === userTeamId && userInvolved;
  const userLost     = isPlayed && result?.loserId  === userTeamId && userInvolved;

  const isOpen = expandedKey === cardKey;

  // Scores: teamA won or lost
  const scoreA = isPlayed ? (result.teamAId === match.a ? result.winsA : result.winsB) : null;
  const scoreB = isPlayed ? (result.teamAId === match.a ? result.winsB : result.winsA) : null;

  function toggle(e) {
    e.stopPropagation();
    setExpandedKey(prev => prev === cardKey ? null : cardKey);
  }

  return (
    <div className={`bracket-card ${userWon ? "bc-user-win" : userLost ? "bc-user-loss" : ""}`}>
      {/* Team A row */}
      <div className={`bc-team ${isPlayed && result?.winnerId === match.a ? "bc-winner" : isPlayed ? "bc-loser" : ""}`}>
        {seedA !== null && seedA > 0 && <span className="bc-seed">{seedA}</span>}
        <span className="bc-name" style={{ color: teamColor(match.a) }}>{teamTag(match.a)}</span>
        {isPlayed && (
          <span className={`bc-score ${result?.winnerId === match.a ? "bc-score-win" : "bc-score-loss"}`}>
            {scoreA}
          </span>
        )}
      </div>

      {/* Team B row */}
      <div className={`bc-team ${isPlayed && result?.winnerId === match.b ? "bc-winner" : isPlayed ? "bc-loser" : ""}`}>
        {seedB !== null && seedB > 0 && <span className="bc-seed">{seedB}</span>}
        <span className="bc-name" style={{ color: teamColor(match.b) }}>{teamTag(match.b)}</span>
        {isPlayed && (
          <span className={`bc-score ${result?.winnerId === match.b ? "bc-score-win" : "bc-score-loss"}`}>
            {scoreB}
          </span>
        )}
      </div>

      {/* Details button — only shown when match is played */}
      {isPlayed && (
        <button className="bc-details-btn" onClick={toggle}>
          {isOpen ? "Hide ▲" : "Details ▼"}
        </button>
      )}

      {/* Expanded series breakdown */}
      {isOpen && isPlayed && (
        <div className="bc-expansion">
          <SeriesDetail result={result} />
        </div>
      )}
    </div>
  );
}

// ── TBD placeholder card ──────────────────────────────────────────────────────
function TBDCard() {
  return (
    <div className="bracket-card bc-tbd">
      <div className="bc-team"><span className="bc-seed">—</span><span className="bc-name muted">TBD</span></div>
      <div className="bc-team"><span className="bc-seed">—</span><span className="bc-name muted">TBD</span></div>
    </div>
  );
}

// ── One round section ─────────────────────────────────────────────────────────
function RoundSection({ round, bracket, isCurrentRound, userTeamId, expandedKey, setExpandedKey, roundIdx }) {
  const hasMatches = round.matches.length > 0;

  return (
    <div className={`bracket-round-section ${isCurrentRound ? "brs-active" : ""}`}>
      <div className="brs-header">
        <span className="brs-name">{round.name}</span>
        {isCurrentRound && <span className="brs-badge">▶ In Progress</span>}
        {!isCurrentRound && hasMatches && round.matches.every(m => m.played) && (
          <span className="brs-badge brs-done">✓ Complete</span>
        )}
      </div>

      <div className="brs-matches">
        {hasMatches ? (
          round.matches.map((match, mi) => (
            <MatchCard
              key={mi}
              match={match}
              bracket={bracket}
              roundName={round.name}
              userTeamId={userTeamId}
              expandedKey={expandedKey}
              setExpandedKey={setExpandedKey}
              cardKey={`${roundIdx}-${mi}`}
            />
          ))
        ) : (
          // Next round not seeded yet — show placeholders
          Array.from({ length: roundIdx === 1 ? 2 : 1 }).map((_, i) => (
            <TBDCard key={i} />
          ))
        )}
      </div>
    </div>
  );
}

// ── One full major view ───────────────────────────────────────────────────────
function MajorView({ major, majorIdx, isActive, schedule, userTeamId, dispatch }) {
  const [expandedKey, setExpandedKey] = useState(null);
  const bracket = major.bracket;

  if (!bracket) {
    return (
      <div className="bracket-empty">
        <p className="muted">This event hasn't started yet. Complete the preceding stage to seed the bracket.</p>
      </div>
    );
  }

  // Determine current round index (first round with unplayed matches)
  let currentRoundIdx = -1;
  if (!major.completed) {
    for (let r = 0; r < bracket.rounds.length; r++) {
      const rnd = bracket.rounds[r];
      if (rnd.matches.length > 0 && rnd.matches.some(m => !m.played)) {
        currentRoundIdx = r;
        break;
      }
    }
  }

  // Champion
  const champTeam = bracket.champion ? CDL_TEAMS.find(t => t.id === bracket.champion) : null;

  return (
    <div>
      {/* ── Sim controls (only when this major is active and not done) ── */}
      {isActive && !major.completed && (
        <div className="sim-controls bracket-controls">
          <button className="btn-primary" onClick={() => dispatch({ type: "SIM_NEXT_MAJOR_MATCH" })}>
            ▶ Sim Next Match
          </button>
          <button className="btn-secondary" onClick={() => dispatch({ type: "SIM_MAJOR_ROUND" })}>
            ▶▶ Sim Current Round
          </button>
          <button className="btn-secondary" onClick={() => dispatch({ type: "SIM_MAJOR" })}>
            ▶▶▶ Sim Entire Major
          </button>
        </div>
      )}

      {/* ── Champion banner ── */}
      {champTeam && (
        <div className="bracket-champion-banner" style={{ borderColor: champTeam.color }}>
          🏆 <strong style={{ color: champTeam.color }}>{champTeam.name}</strong> — {major.name} Champion
        </div>
      )}

      {/* ── Seedings ── */}
      {bracket.seeds && (
        <SeedList seeds={bracket.seeds} standings={schedule.standings} />
      )}

      {/* ── Rounds ── */}
      <div className="bracket-rounds">
        {bracket.rounds.map((round, ri) => (
          <RoundSection
            key={ri}
            round={round}
            roundIdx={ri}
            bracket={bracket}
            isCurrentRound={ri === currentRoundIdx}
            userTeamId={userTeamId}
            expandedKey={expandedKey}
            setExpandedKey={setExpandedKey}
          />
        ))}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function MajorBracket() {
  const { state, dispatch } = useGame();

  // Default to the active major tab; fall back to most recent completed one
  const activeMajorIdx = state?.schedule?.phase === "major" ? state.schedule.currentStage : null;
  const [viewIdx, setViewIdx] = useState(activeMajorIdx ?? 0);

  if (!state) return null;

  const { schedule, userTeamId, season } = state;
  const majors = schedule.majors ?? [];

  // Sync tab to active major when phase changes
  const displayIdx = activeMajorIdx !== null ? viewIdx : viewIdx;

  return (
    <div className="major-page">
      {/* ── Page header ── */}
      <div className="major-page-header">
        <h2>Tournaments — Season {season}</h2>
        <p className="muted">
          {schedule.phase === "major"
            ? `▶ ${majors[schedule.currentStage]?.name} is live`
            : schedule.phase === "stage"
            ? `Stage play in progress — ${majors.filter(m => m.completed).length} event(s) completed`
            : "Season complete"}
        </p>
      </div>

      {/* ── Major tab strip ── */}
      <div className="major-tabs">
        {majors.map((major, i) => {
          const isActive = i === activeMajorIdx;
          const isDone   = major.completed;
          const hasStarted = !!major.bracket;
          return (
            <button
              key={i}
              className={`major-tab ${viewIdx === i ? "mt-selected" : ""} ${isActive ? "mt-live" : ""}`}
              onClick={() => setViewIdx(i)}
            >
              {major.name}
              {isActive && <span className="mt-live-dot" />}
              {isDone && !isActive && <span className="mt-done"> ✓</span>}
              {!hasStarted && !isActive && <span className="muted"> –</span>}
            </button>
          );
        })}
      </div>

      {/* ── Selected major view ── */}
      <MajorView
        major={majors[viewIdx]}
        majorIdx={viewIdx}
        isActive={viewIdx === activeMajorIdx}
        schedule={schedule}
        userTeamId={userTeamId}
        dispatch={dispatch}
      />
    </div>
  );
}
