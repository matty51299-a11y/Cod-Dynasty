// src/components/MajorTournamentOverlay.jsx
// Full-screen tournament mode takeover.
//
// Supports both:
//   SE (Champs)  — 3-round single elimination, 8 teams
//   DE (Majors)  — 11-round double elimination, 12 teams
//
// Rendered from App.jsx in two situations:
//   1. LIVE    — phase === "major" && user has entered
//   2. CHAMPION — phase just left "major" && enteredMajor.completed

import { useState } from "react";
import { useGame } from "../store/gameStore.jsx";
import { CDL_TEAMS } from "../data/teams.js";
import SeriesDetail from "./SeriesDetail.jsx";
import MajorMatchOverlay from "./MajorMatchOverlay.jsx";
import { useTeamHub } from "../store/teamHubContext.jsx";

function teamName(id) { return CDL_TEAMS.find(t => t.id === id)?.name  ?? id; }
function teamTag(id)  { return CDL_TEAMS.find(t => t.id === id)?.tag   ?? id; }
function teamColor(id){ return CDL_TEAMS.find(t => t.id === id)?.color ?? "#888"; }

// ── Helpers ───────────────────────────────────────────────────────────────────

// Returns { result, roundName } if user has been fully eliminated, otherwise null.
// Works for both SE and DE: user is out when they have no remaining unplayed matches.
function getUserElimination(bracket, userTeamId) {
  if (!bracket) return null;
  const allRounds = bracket.rounds ?? [];
  const stillIn = allRounds.some(r =>
    r.matches.some(m => !m.played && (m.a === userTeamId || m.b === userTeamId))
  );
  if (stillIn) return null;

  // Find the last match the user played and lost
  let lastLoss = null;
  for (const round of allRounds) {
    for (const m of round.matches) {
      if (m.played && m.result?.loserId === userTeamId) {
        lastLoss = { result: m.result, roundName: round.name };
      }
    }
  }
  return lastLoss;
}

function getSeedNum(bracket, teamId, fallback) {
  if (fallback != null) return fallback;
  const idx = bracket.seeds?.indexOf(teamId) ?? -1;
  return idx >= 0 ? idx + 1 : null;
}

// Returns index of the first round with unplayed matches, or -1.
function currentRoundIdx(bracket) {
  if (!bracket) return -1;
  const rounds = bracket.rounds ?? [];
  for (let r = 0; r < rounds.length; r++) {
    if (rounds[r].matches.length > 0 && rounds[r].matches.some(m => !m.played)) return r;
  }
  return -1;
}

// Teams alive = those with fewer than 2 tournament losses (DE) or 1 loss (SE).
function teamsAlive(bracket, userTeamId) {
  if (!bracket) return null;
  const isDE = bracket.type === "DE";
  const maxLosses = isDE ? 1 : 0; // alive while losses <= maxLosses

  const lossCount = {};
  for (const round of bracket.rounds) {
    for (const m of round.matches) {
      if (!m.played || !m.result?.loserId) continue;
      const id = m.result.loserId;
      lossCount[id] = (lossCount[id] ?? 0) + 1;
    }
  }

  // Grand Final loser is eliminated even though they only have 1 loss in DE
  const gfRound = isDE ? bracket.rounds[10] : bracket.rounds[2];
  const gfPlayed = gfRound?.matches?.[0]?.played;
  if (gfPlayed) return 1; // champion only

  const totalTeams = bracket.seeds?.length ?? (isDE ? 12 : 8);
  return totalTeams - Object.values(lossCount).filter(c => c > maxLosses).length;
}

// ── Champion celebration screen ───────────────────────────────────────────────
function ChampionScreen({ major, dispatch }) {
  const bracket  = major.bracket;
  const champId  = bracket?.champion;
  const champTeam = CDL_TEAMS.find(t => t.id === champId);
  const isDE     = bracket?.type === "DE";
  // Grand Final is last round
  const gfRound  = isDE ? bracket?.rounds?.[10] : bracket?.rounds?.[2];
  const gfResult = gfRound?.matches?.[0]?.result;

  return (
    <div className="mto-champion-screen">
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
        <div className="mto-champ-subtitle">{isDE ? "Major Champion" : "Season Champions"}</div>
        {gfResult && (
          <div className="mto-champ-result">
            <span className="mto-champ-res-side mto-champ-res-winner" style={{ color: teamColor(gfResult.winnerId) }}>
              {teamTag(gfResult.winnerId)}
            </span>
            <span className="mto-champ-res-score">{gfResult.score}</span>
            <span className="mto-champ-res-side" style={{ color: teamColor(gfResult.loserId) }}>
              {teamTag(gfResult.loserId)}
            </span>
          </div>
        )}
        {gfResult?.standoutName && gfResult.standoutKD > 0 && (
          <div className="mto-champ-mvp">
            ★ <strong>{gfResult.standoutName}</strong>
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
function MvHero({ major, roundName, alive }) {
  const isDE = major.bracket?.type === "DE";
  return (
    <div className="mto-hero">
      <div className="mto-hero-live">LIVE</div>
      <div className="mto-hero-name">{major.name.toUpperCase()}</div>
      {roundName && <div className="mto-hero-round">{roundName}</div>}
      {alive != null && (
        <div className="mto-hero-count">{alive} team{alive !== 1 ? "s" : ""} alive</div>
      )}
    </div>
  );
}

// ── Elimination result banner ─────────────────────────────────────────────────
function EliminatedBanner({ elimination, userTeamId }) {
  const { result, roundName } = elimination;
  return (
    <div className="mto-elim-banner">
      <div className="mto-elim-outcome">ELIMINATED</div>
      <div className="mto-elim-round">Fell in the {roundName}</div>
      <div className="mto-elim-matchup">
        <span style={{ color: teamColor(result.winnerId) }}>{teamTag(result.winnerId)}</span>
        <span className="mto-elim-score">{result.score}</span>
        <span style={{ color: teamColor(result.loserId) }}>{teamTag(result.loserId)}</span>
      </div>
      {result.standoutName && result.standoutKD > 0 && (
        <div className="mto-elim-mvp">
          ★ <strong>{result.standoutName}</strong>
          <span className="mto-elim-mvp-kd"> {result.standoutKD.toFixed(2)} K/D · Series MVP</span>
        </div>
      )}
    </div>
  );
}

// ── Next match spotlight with sim controls ────────────────────────────────────
function NextMatchCard({ bracket, curRound, userTeamId, dispatch, onPlayMatch }) {
  if (curRound < 0) return null;
  const round = bracket.rounds[curRound];
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
          ▶▶ Sim {round.name}
        </button>
        <button className="btn-secondary mto-sim-btn" onClick={() => dispatch({ type: "SIM_MAJOR" })}>
          ▶▶▶ Finish {major?.name ?? "Major"}
        </button>
      </div>
    </div>
  );
}

// ── Single bracket match card ─────────────────────────────────────────────────
function MatchCard({ match, bracket, userTeamId, expandedKey, setExpandedKey, cardKey }) {
  const { openTeamHub } = useTeamHub();
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

  if (!isPlayed) {
    return (
      <div className="mto-bracket-card">
        <div className="mto-bc-team">
          {seedA && <span className="mto-bc-seed">{seedA}</span>}
          <span className="mto-bc-name team-link" style={{ color: teamColor(match.a) }} onClick={() => openTeamHub(match.a)}>{teamTag(match.a)}</span>
        </div>
        <div className="mto-bc-team">
          {seedB && <span className="mto-bc-seed">{seedB}</span>}
          <span className="mto-bc-name team-link" style={{ color: teamColor(match.b) }} onClick={() => openTeamHub(match.b)}>{teamTag(match.b)}</span>
        </div>
      </div>
    );
  }

  const winnerId   = result.winnerId;
  const loserId    = result.loserId;
  const winnerSeed = winnerId === match.a ? seedA : seedB;
  const loserSeed  = loserId  === match.a ? seedA : seedB;

  return (
    <div className={`mto-bracket-card mto-bc-played ${userWon ? "mbc-user-win" : userLost ? "mbc-user-loss" : ""}`}>
      {userInvolved && (
        <div className={`mto-bc-outcome ${userWon ? "mto-bco-win" : "mto-bco-loss"}`}>
          {userWon ? "VICTORY" : "DEFEAT"}
        </div>
      )}
      <div className="mto-bc-score-center">
        <div className="mto-bc-sc-side">
          {winnerSeed && <span className="mto-bc-seed">{winnerSeed}</span>}
          <span className="mto-bc-sc-tag team-link" style={{ color: teamColor(winnerId) }} onClick={() => openTeamHub(winnerId)}>
            {teamTag(winnerId)}
          </span>
        </div>
        <span className="mto-bc-sc-score">{result.score}</span>
        <div className="mto-bc-sc-side mto-bc-sc-loser">
          <span className="mto-bc-sc-tag team-link" style={{ color: teamColor(loserId) }} onClick={() => openTeamHub(loserId)}>
            {teamTag(loserId)}
          </span>
          {loserSeed && <span className="mto-bc-seed">{loserSeed}</span>}
        </div>
      </div>
      {result.standoutName && result.standoutKD > 0 && (
        <div className="mto-bc-mvp-row">
          <span className="mto-bc-mvp-star">★</span>
          <strong className="mto-bc-mvp-name">{result.standoutName}</strong>
          <span className="mto-bc-mvp-kd">{result.standoutKD.toFixed(2)} K/D</span>
          <span className="mto-bc-mvp-label">MVP</span>
        </div>
      )}
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
function RoundSection({ round, roundIdx, bracket, isCurrentRound, userTeamId, expandedKey, setExpandedKey, tbd }) {
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
          Array.from({ length: tbd ?? 1 }).map((_, i) => <TBDCard key={i} />)
        )}
      </div>
    </div>
  );
}

// ── DE bracket layout (WB / LB / GF sections) ────────────────────────────────
// DE round indices: 0=WBR1 1=LBR1 2=WBR2 3=LBR2 4=LBR3 5=WBSF 6=LBR4 7=WBF 8=LBR5 9=LBF 10=GF
const DE_WB_ROUNDS  = [0, 2, 5, 7];   // WB Round 1, WB Round 2, WB Semifinals, WB Final
const DE_LB_ROUNDS  = [1, 3, 4, 6, 8, 9]; // LB Round 1–5 + LB Final
const DE_GF_ROUNDS  = [10];            // Grand Final
const DE_TBD_COUNTS = { 0:4, 2:4, 5:2, 7:1, 1:2, 3:2, 4:2, 6:2, 8:1, 9:1, 10:1 };

function DEBracketView({ bracket, curRound, userTeamId, expandedKey, setExpandedKey }) {
  const rounds = bracket.rounds;
  const mkSection = (indices, label, cls) => (
    <div className={`mto-de-section ${cls}`}>
      <div className="mto-de-section-label">{label}</div>
      <div className="mto-bracket-rounds">
        {indices.map(ri => (
          <RoundSection
            key={ri}
            round={rounds[ri]}
            roundIdx={ri}
            bracket={bracket}
            isCurrentRound={ri === curRound}
            userTeamId={userTeamId}
            expandedKey={expandedKey}
            setExpandedKey={setExpandedKey}
            tbd={DE_TBD_COUNTS[ri] ?? 1}
          />
        ))}
      </div>
    </div>
  );

  return (
    <div className="mto-de-bracket">
      {mkSection(DE_WB_ROUNDS, "WINNERS BRACKET", "mto-de-wb")}
      {mkSection(DE_LB_ROUNDS, "LOSERS BRACKET",  "mto-de-lb")}
      {mkSection(DE_GF_ROUNDS, "GRAND FINAL",      "mto-de-gf")}
    </div>
  );
}

// ── SE bracket layout (Champs — 3-round single elimination) ──────────────────
function SEBracketView({ bracket, curRound, userTeamId, expandedKey, setExpandedKey }) {
  const tbd = [4, 2, 1]; // QF=4, SF=2, GF=1
  return (
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
          tbd={tbd[ri] ?? 1}
        />
      ))}
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function MajorTournamentOverlay() {
  const { state, dispatch } = useGame();
  const { openTeamHub } = useTeamHub();
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

  if (!showLive && !showChampion && !showMatchOverlay) return null;

  const matchOverlay = (
    <MajorMatchOverlay
      isOpen={showMatchOverlay}
      onClose={() => setShowMatchOverlay(false)}
    />
  );

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

  const major     = schedule.majors[activeMajorIdx];
  const bracket   = major.bracket;
  const isDE      = bracket?.type === "DE";
  const curRound  = currentRoundIdx(bracket);
  const roundName = curRound >= 0 ? bracket.rounds[curRound].name : null;
  const elimination = getUserElimination(bracket, userTeamId);
  const alive     = teamsAlive(bracket, userTeamId);

  return (
    <>
      {matchOverlay}

      <div className="mto-backdrop">
        <div className="mto-scroll-area">
          <div className="mto-content">

            <MvHero major={major} roundName={roundName} alive={alive} />

            {elimination && (
              <EliminatedBanner elimination={elimination} userTeamId={userTeamId} />
            )}

            {curRound >= 0 && !elimination && (
              <NextMatchCard
                bracket={bracket}
                curRound={curRound}
                userTeamId={userTeamId}
                dispatch={dispatch}
                major={major}
                onPlayMatch={() => setShowMatchOverlay(true)}
              />
            )}

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

            <div className="mto-bracket-section">
              <div className="mto-bracket-label">BRACKET</div>
              {isDE
                ? <DEBracketView bracket={bracket} curRound={curRound} userTeamId={userTeamId} expandedKey={expandedKey} setExpandedKey={setExpandedKey} />
                : <SEBracketView bracket={bracket} curRound={curRound} userTeamId={userTeamId} expandedKey={expandedKey} setExpandedKey={setExpandedKey} />
              }
            </div>

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
                        <span
                          className="mto-seed-name team-link"
                          style={isUser ? { color: teamColor(id) } : {}}
                          onClick={() => openTeamHub(id)}
                        >
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
