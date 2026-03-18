// src/components/MajorTournamentOverlay.jsx
// Full-screen tournament mode takeover.
//
// Rendered from App.jsx in two situations:
//   1. LIVE   — phase === "major" && user has entered (isEntered === true)
//               → cinematic bracket view with next-match centerpiece
//   2. CHAMPION — phase just left "major" && enteredMajor.completed
//               → champion celebration screen with return-to-season CTA

import { useState } from "react";
import { useGame } from "../store/gameStore.jsx";
import { CDL_TEAMS } from "../data/teams.js";
import SeriesDetail from "./SeriesDetail.jsx";
import MajorMatchOverlay from "./MajorMatchOverlay.jsx";

function teamName(id) { return CDL_TEAMS.find(t => t.id === id)?.name  ?? id; }
function teamTag(id)  { return CDL_TEAMS.find(t => t.id === id)?.tag   ?? id; }
function teamColor(id){ return CDL_TEAMS.find(t => t.id === id)?.color ?? "#888"; }

// ── Helpers ───────────────────────────────────────────────────────────────────

// Returns { result, roundName } if user was eliminated, otherwise null.
function getUserElimination(bracket, userTeamId) {
  if (!bracket) return null;
  let lastUserMatch = null;
  let lastRoundName = null;
  for (const round of bracket.rounds) {
    for (const m of round.matches) {
      if (m.played && (m.a === userTeamId || m.b === userTeamId)) {
        lastUserMatch = m;
        lastRoundName = round.name;
      }
    }
  }
  if (!lastUserMatch || lastUserMatch.result?.winnerId === userTeamId) return null;
  // Confirm no unplayed match still includes them
  const stillIn = bracket.rounds.some(rnd =>
    rnd.matches.some(m => !m.played && (m.a === userTeamId || m.b === userTeamId))
  );
  if (stillIn) return null;
  return { result: lastUserMatch.result, roundName: lastRoundName };
}

function getSeedNum(bracket, teamId, fallback) {
  if (fallback != null) return fallback;
  const idx = bracket.seeds?.indexOf(teamId) ?? -1;
  return idx >= 0 ? idx + 1 : null;
}

function currentRoundIdx(bracket) {
  if (!bracket) return -1;
  for (let r = 0; r < bracket.rounds.length; r++) {
    if (bracket.rounds[r].matches.some(m => !m.played)) return r;
  }
  return -1;
}

// ── Champion celebration screen ───────────────────────────────────────────────
function ChampionScreen({ major, dispatch }) {
  const bracket   = major.bracket;
  const champId   = bracket?.champion;
  const champTeam = CDL_TEAMS.find(t => t.id === champId);
  const gf        = bracket?.rounds?.[2]?.matches?.[0];
  const gfResult  = gf?.result;

  return (
    <div className="mto-champion-screen">
      {/* Radial glow behind everything */}
      <div
        className="mto-champ-glow"
        style={{ background: `radial-gradient(ellipse 600px 400px at 50% 40%, ${champTeam?.color ?? "#4f8ef7"}1a 0%, transparent 70%)` }}
      />

      <div className="mto-champ-content">
        <div className="mto-champ-trophy">🏆</div>
        <div className="mto-champ-event-label">{major.name.toUpperCase()} — COMPLETE</div>
        <div className="mto-champ-name" style={{ color: champTeam?.color ?? "var(--text-head)" }}>
          {champTeam?.name ?? champId}
        </div>
        <div className="mto-champ-subtitle">Season Champions</div>

        {/* Grand Final result */}
        {gfResult && (
          <div className="mto-champ-result">
            <span className="mto-champ-res-side mto-champ-res-winner" style={{ color: teamColor(gfResult.winnerId) }}>
              {teamTag(gfResult.winnerId)}
            </span>
            <span className="mto-champ-res-score">{gfResult.score}</span>
            <span className="mto-champ-res-side" style={{ color: teamColor(gfResult.loserId), opacity: 0.55 }}>
              {teamTag(gfResult.loserId)}
            </span>
          </div>
        )}

        {/* Series MVP */}
        {gfResult?.standoutName && gfResult.standoutKD > 0 && (
          <div className="mto-champ-mvp">
            ⭐ <strong>{gfResult.standoutName}</strong>
            <span className="mto-champ-mvp-kd"> {gfResult.standoutKD.toFixed(2)} K/D · Finals MVP</span>
          </div>
        )}

        <button className="mto-return-btn" onClick={() => dispatch({ type: "DISMISS_MAJOR" })}>
          Return to Season →
        </button>
      </div>
    </div>
  );
}

// ── Cinematic hero (live mode) ────────────────────────────────────────────────
const TEAMS_REMAINING = [8, 4, 2];

function MvHero({ major, roundName, curRound }) {
  const remaining = curRound >= 0 ? (TEAMS_REMAINING[curRound] ?? null) : null;
  return (
    <div className="mto-hero">
      <div className="mto-hero-live">LIVE</div>
      <div className="mto-hero-name">{major.name.toUpperCase()}</div>
      {roundName && <div className="mto-hero-round">{roundName}</div>}
      {remaining != null && <div className="mto-hero-count">{remaining} teams remain</div>}
    </div>
  );
}

// ── Elimination result banner ─────────────────────────────────────────────────
function EliminatedBanner({ elimination, userTeamId }) {
  const { result, roundName } = elimination;
  const oppId = result.winnerId === userTeamId ? result.loserId : result.winnerId;
  return (
    <div className="mto-elim-banner">
      <div className="mto-elim-outcome">ELIMINATED</div>
      <div className="mto-elim-round">Fell in the {roundName}</div>
      <div className="mto-elim-matchup">
        <span style={{ color: teamColor(result.winnerId) }}>{teamTag(result.winnerId)}</span>
        <span className="mto-elim-score">{result.score}</span>
        <span style={{ color: teamColor(result.loserId), opacity: 0.55 }}>{teamTag(result.loserId)}</span>
      </div>
      {result.standoutName && result.standoutKD > 0 && (
        <div className="mto-elim-mvp">
          ⭐ <strong>{result.standoutName}</strong>
          <span className="mto-elim-mvp-kd"> {result.standoutKD.toFixed(2)} K/D · Series MVP</span>
        </div>
      )}
    </div>
  );
}

// ── Next match spotlight with sim controls ────────────────────────────────────
function NextMatchCard({ bracket, roundIdx, userTeamId, dispatch, roundName, onPlayMatch }) {
  if (roundIdx < 0) return null;
  const round = bracket.rounds[roundIdx];
  const next  = round?.matches.find(m => !m.played);
  if (!next) return null;

  const seedA  = getSeedNum(bracket, next.a, next.seedA);
  const seedB  = getSeedNum(bracket, next.b, next.seedB);
  const userIn = next.a === userTeamId || next.b === userTeamId;

  return (
    <div className={`mto-next-match ${userIn ? "mto-nm-user" : ""}`}>
      <div className="mto-nm-label">NEXT MATCH · {round.name.toUpperCase()}</div>
      <div className="mto-nm-matchup">
        <div className="mto-nm-team">
          {seedA && <span className="mto-nm-seed">#{seedA}</span>}
          <span className="mto-nm-name" style={{ color: teamColor(next.a) }}>{teamName(next.a)}</span>
          {next.a === userTeamId && <span className="mto-nm-you">YOUR TEAM</span>}
        </div>
        <span className="mto-nm-vs">vs</span>
        <div className="mto-nm-team mto-nm-team-b">
          {next.b === userTeamId && <span className="mto-nm-you">YOUR TEAM</span>}
          <span className="mto-nm-name" style={{ color: teamColor(next.b) }}>{teamName(next.b)}</span>
          {seedB && <span className="mto-nm-seed">#{seedB}</span>}
        </div>
      </div>
      <div className="mto-nm-actions">
        {/* User's match: featured Play Match CTA opens the full overlay */}
        {userIn ? (
          <button className="btn-primary mto-sim-btn mto-play-match-btn" onClick={onPlayMatch}>
            ▶ Play Match
          </button>
        ) : (
          <button className="btn-secondary mto-sim-btn" onClick={() => dispatch({ type: "SIM_NEXT_MAJOR_MATCH" })}>
            ▶ Sim Next Match
          </button>
        )}
        <button className="btn-secondary mto-sim-btn" onClick={() => dispatch({ type: "SIM_MAJOR_ROUND" })}>
          ▶▶ Sim {roundName ?? "Round"}
        </button>
        <button className="btn-secondary mto-sim-btn" onClick={() => dispatch({ type: "SIM_MAJOR" })}>
          ▶▶▶ Sim Entire {round.name === "Grand Final" ? "Final" : "Major"}
        </button>
      </div>
    </div>
  );
}

// ── Single bracket match card ─────────────────────────────────────────────────
function MatchCard({ match, bracket, userTeamId, expandedKey, setExpandedKey, cardKey }) {
  const isPlayed     = match.played;
  const result       = match.result;
  const seedA        = getSeedNum(bracket, match.a, match.seedA);
  const seedB        = getSeedNum(bracket, match.b, match.seedB);
  const userInvolved = match.a === userTeamId || match.b === userTeamId;
  const userWon      = isPlayed && result?.winnerId === userTeamId && userInvolved;
  const userLost     = isPlayed && result?.loserId  === userTeamId && userInvolved;
  const isOpen       = expandedKey === cardKey;

  function toggle(e) {
    e.stopPropagation();
    setExpandedKey(prev => (prev === cardKey ? null : cardKey));
  }

  // ── Unplayed: compact matchup ──────────────────────────────────────────────
  if (!isPlayed) {
    return (
      <div className="mto-bracket-card">
        <div className="mto-bc-team">
          {seedA && <span className="mto-bc-seed">{seedA}</span>}
          <span className="mto-bc-name" style={{ color: teamColor(match.a) }}>{teamTag(match.a)}</span>
        </div>
        <div className="mto-bc-team">
          {seedB && <span className="mto-bc-seed">{seedB}</span>}
          <span className="mto-bc-name" style={{ color: teamColor(match.b) }}>{teamTag(match.b)}</span>
        </div>
      </div>
    );
  }

  // ── Played: qualifier-family result card (score as centerpiece) ────────────
  const winnerId   = result.winnerId;
  const loserId    = result.loserId;
  const winnerSeed = winnerId === match.a ? seedA : seedB;
  const loserSeed  = loserId  === match.a ? seedA : seedB;

  return (
    <div className={`mto-bracket-card mto-bc-played ${userWon ? "mbc-user-win" : userLost ? "mbc-user-loss" : ""}`}>

      {/* Outcome word — only for user's matches, mirrors qualifier banner */}
      {userInvolved && (
        <div className={`mto-bc-outcome ${userWon ? "mto-bco-win" : "mto-bco-loss"}`}>
          {userWon ? "VICTORY" : "DEFEAT"}
        </div>
      )}

      {/* Score centerpiece: winner — score — loser */}
      <div className="mto-bc-score-center">
        <div className="mto-bc-sc-side">
          {winnerSeed && <span className="mto-bc-seed">{winnerSeed}</span>}
          <span className="mto-bc-sc-tag" style={{ color: teamColor(winnerId) }}>
            {teamTag(winnerId)}
          </span>
        </div>
        <span className="mto-bc-sc-score">{result.score}</span>
        <div className="mto-bc-sc-side mto-bc-sc-loser">
          <span className="mto-bc-sc-tag" style={{ color: teamColor(loserId) }}>
            {teamTag(loserId)}
          </span>
          {loserSeed && <span className="mto-bc-seed">{loserSeed}</span>}
        </div>
      </div>

      {/* MVP — always visible, matches qualifier MVP block style */}
      {result.standoutName && result.standoutKD > 0 && (
        <div className="mto-bc-mvp-row">
          <span className="mto-bc-mvp-star">⭐</span>
          <strong className="mto-bc-mvp-name">{result.standoutName}</strong>
          <span className="mto-bc-mvp-kd">{result.standoutKD.toFixed(2)} K/D</span>
          <span className="mto-bc-mvp-label">MVP</span>
        </div>
      )}

      {/* Details expand → full SeriesDetail breakdown */}
      <button className="mto-bc-details" onClick={toggle}>
        {isOpen ? "Hide ▲" : "Details ▼"}
      </button>
      {isOpen && (
        <div className="mto-bc-expand">
          <SeriesDetail result={result} />
        </div>
      )}
    </div>
  );
}

function TBDCard() {
  return (
    <div className="mto-bracket-card mto-bc-tbd">
      <div className="mto-bc-team"><span className="mto-bc-seed">—</span><span className="mto-bc-name muted">TBD</span></div>
      <div className="mto-bc-team"><span className="mto-bc-seed">—</span><span className="mto-bc-name muted">TBD</span></div>
    </div>
  );
}

// ── One round column ──────────────────────────────────────────────────────────
function RoundSection({ round, roundIdx, bracket, isCurrentRound, userTeamId, expandedKey, setExpandedKey }) {
  const hasMatches = round.matches.length > 0;
  const isDone     = hasMatches && round.matches.every(m => m.played);
  return (
    <div className={`mto-round ${isCurrentRound ? "mto-round-active" : ""}`}>
      <div className="mto-round-header">
        <span className="mto-round-name">{round.name}</span>
        {isCurrentRound && <span className="mto-round-badge mto-rb-live">▶ Now</span>}
        {isDone && !isCurrentRound && <span className="mto-round-badge mto-rb-done">✓</span>}
      </div>
      <div className="mto-round-matches">
        {hasMatches ? (
          round.matches.map((match, mi) => (
            <MatchCard
              key={mi}
              match={match}
              bracket={bracket}
              userTeamId={userTeamId}
              expandedKey={expandedKey}
              setExpandedKey={setExpandedKey}
              cardKey={`${roundIdx}-${mi}`}
            />
          ))
        ) : (
          Array.from({ length: roundIdx === 1 ? 2 : 1 }).map((_, i) => (
            <TBDCard key={i} />
          ))
        )}
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function MajorTournamentOverlay() {
  const { state, dispatch } = useGame();
  const [expandedKey,      setExpandedKey]      = useState(null);
  const [showMatchOverlay, setShowMatchOverlay]  = useState(false);

  if (!state) return null;

  const { schedule, userTeamId } = state;
  const enteredIdx  = state.enteredMajorIdx;
  if (enteredIdx == null) return null;

  const isMajorPhase   = schedule.phase === "major";
  const activeMajorIdx = isMajorPhase ? (schedule.majorIdx ?? null) : null;
  const isEntered      = activeMajorIdx !== null && enteredIdx === activeMajorIdx;

  const showLive     = isEntered && isMajorPhase;
  const enteredMajor = schedule.majors?.[enteredIdx];
  const showChampion = !isMajorPhase && enteredMajor?.completed;

  // Keep component alive when the match overlay is open so its effects can fire
  // even if a Grand Final win transitions the phase mid-sim.
  if (!showLive && !showChampion && !showMatchOverlay) return null;

  // ── MajorMatchOverlay — rendered outside live/champion conditional ──────────
  // This ensures it stays mounted through phase transitions (e.g. GF win).
  const matchOverlay = (
    <MajorMatchOverlay
      isOpen={showMatchOverlay}
      onClose={() => setShowMatchOverlay(false)}
    />
  );

  // ── Champion screen ──────────────────────────────────────────────────────────
  if (showChampion) {
    return (
      <>
        {matchOverlay}
        <div className="mto-backdrop mto-backdrop-champ">
          <ChampionScreen major={enteredMajor} dispatch={dispatch} />
        </div>
      </>
    );
  }

  // ── Live tournament view ─────────────────────────────────────────────────────
  const major     = schedule.majors[activeMajorIdx];
  const bracket   = major.bracket;
  const curRound  = currentRoundIdx(bracket);
  const roundName = curRound >= 0 ? bracket.rounds[curRound].name : null;
  const elimination = getUserElimination(bracket, userTeamId);

  return (
    <>
      {matchOverlay}

      <div className="mto-backdrop">
        <div className="mto-scroll-area">
          <div className="mto-content">

            {/* Hero header */}
            <MvHero major={major} roundName={roundName} curRound={curRound} />

            {/* Elimination banner — shown when user has been knocked out */}
            {elimination && (
              <EliminatedBanner elimination={elimination} userTeamId={userTeamId} />
            )}

            {/* Next match card — hidden when eliminated */}
            {curRound >= 0 && !elimination && (
              <NextMatchCard
                bracket={bracket}
                roundIdx={curRound}
                userTeamId={userTeamId}
                dispatch={dispatch}
                roundName={roundName}
                onPlayMatch={() => setShowMatchOverlay(true)}
              />
            )}

            {/* Sim controls when eliminated */}
            {curRound >= 0 && elimination && (
              <div className="mto-elim-sim-controls">
                <button className="btn-secondary mto-sim-btn" onClick={() => dispatch({ type: "SIM_MAJOR_ROUND" })}>
                  ▶▶ Sim {roundName ?? "Round"}
                </button>
                <button className="btn-secondary mto-sim-btn" onClick={() => dispatch({ type: "SIM_MAJOR" })}>
                  ▶▶▶ Finish {major.name}
                </button>
              </div>
            )}

            {/* Bracket */}
            <div className="mto-bracket-section">
              <div className="mto-bracket-label">BRACKET</div>
              <div className="mto-bracket-rounds">
                {bracket.rounds.map((round, ri) => (
                  <RoundSection
                    key={ri}
                    round={round}
                    roundIdx={ri}
                    bracket={bracket}
                    isCurrentRound={ri === curRound}
                    userTeamId={userTeamId}
                    expandedKey={expandedKey}
                    setExpandedKey={setExpandedKey}
                  />
                ))}
              </div>
            </div>

            {/* Seedings — collapsible */}
            {bracket.seeds && (
              <details className="mto-seeds-collapse">
                <summary className="mto-seeds-summary">Seedings ▾</summary>
                <div className="mto-seeds-list">
                  {bracket.seeds.map((id, i) => {
                    const standings = enteredIdx === 4
                      ? (schedule.standings ?? {})
                      : (schedule.stageStandings ?? schedule.standings ?? {});
                    const rec    = standings[id] ?? { wins: 0, losses: 0 };
                    const isUser = id === userTeamId;
                    return (
                      <div key={id} className={`mto-seed-row ${isUser ? "mto-seed-you" : ""}`}>
                        <span className="mto-seed-num">{i + 1}</span>
                        <span className="mto-seed-dot" style={{ background: teamColor(id) }} />
                        <span className="mto-seed-name" style={isUser ? { color: teamColor(id) } : {}}>
                          {teamTag(id)}
                        </span>
                        <span className="mto-seed-rec">{rec.wins}W–{rec.losses}L</span>
                        {isUser && <span className="you-badge">YOU</span>}
                      </div>
                    );
                  })}
                </div>
              </details>
            )}

          </div>
        </div>
      </div>
    </>
  );
}
