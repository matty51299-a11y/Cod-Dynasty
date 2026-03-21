// src/components/NextMatchOverlay.jsx
// Phase 2: full matchday loop overlay.
//
// Pre-match  → fixture preview + stakes context → "Play Matchday"
// Result     → user's result only + consequence lines → "Continue"
// Continue   → onClose(); sidebar screens reflect updated state

import { useEffect, useRef, useState } from "react";
import { useGame } from "../store/gameStore.jsx";
import { CDL_TEAMS } from "../data/teams.js";
import SeriesDetail from "./SeriesDetail.jsx";
import { useTeamHub } from "../store/teamHubContext.jsx";
import { calcTeamOvr } from "../engine/teamOvr.js";
import { useMatchCenter } from "../store/matchCenterContext.jsx";

function teamColor(id) { return CDL_TEAMS.find(t => t.id === id)?.color ?? "#888"; }
function teamName(id)  { return CDL_TEAMS.find(t => t.id === id)?.name  ?? id; }
function teamTag(id)   { return CDL_TEAMS.find(t => t.id === id)?.tag   ?? id; }

function ordinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// ── Standings rank helper ─────────────────────────────────────────────────────
// Returns 1-based rank: number of teams with strictly more points + 1.
function getRank(standings, teamId) {
  const myPts = standings[teamId]?.points ?? 0;
  return Object.values(standings).filter(r => r.points > myPts).length + 1;
}

// ── Post-match consequence lines ──────────────────────────────────────────────
// Derives up to 2 punchy consequence sentences from before/after standings,
// the match result, streak, and live K/D data. No engine changes needed.
function getConsequences(result, userTeamId, preStandings, postStandings, matchLog) {
  if (!result || !preStandings || !postStandings) return [];

  const won  = result.winnerId === userTeamId;
  const oppId = won ? result.loserId : result.winnerId;
  const tag   = teamTag(userTeamId);
  const lines = [];

  // ── 1. User rank / Top-8 movement ──────────────────────────────────────────
  const preRank  = getRank(preStandings, userTeamId);
  const postRank = getRank(postStandings, userTeamId);
  const wasTop8  = preRank  <= 8;
  const nowTop8  = postRank <= 8;

  if (!wasTop8 && nowTop8)       lines.push(`${tag} move into the Top 8`);
  else if (wasTop8 && !nowTop8)  lines.push(`${tag} fall out of the Top 8`);
  else if (postRank < preRank)   lines.push(`${tag} climb to ${ordinal(postRank)}`);
  else if (postRank > preRank)   lines.push(`${tag} slip to ${ordinal(postRank)}`);
  else if (postRank === 1)       lines.push(`${tag} hold the top spot`);

  // ── 2. Streak ───────────────────────────────────────────────────────────────
  if (lines.length < 2) {
    const myLog = [...(matchLog ?? [])]
      .reverse()
      .filter(r => r.winnerId === userTeamId || r.loserId === userTeamId);
    let streak = 0, streakWon = null;
    for (const r of myLog) {
      const w = r.winnerId === userTeamId;
      if (streakWon === null) streakWon = w;
      if (w === streakWon) streak++;
      else break;
    }
    if (streak >= 3) {
      lines.push(streakWon ? `Win streak reaches ${streak}` : `Losing streak hits ${streak}`);
    } else if (streak === 2) {
      lines.push(streakWon ? "Back-to-back wins" : "Two straight defeats");
    }
  }

  // ── 3. K/D league-leader moment ─────────────────────────────────────────────
  // Only when the series MVP is genuinely exceptional AND leads the live table.
  if (lines.length < 2 && result.standoutName && result.standoutKD >= 1.15) {
    const totals = {};
    for (const entry of matchLog ?? []) {
      if (!entry.playerStats) continue;
      for (const stats of Object.values(entry.playerStats)) {
        if (!totals[stats.name]) totals[stats.name] = { kills: 0, deaths: 0 };
        totals[stats.name].kills  += stats.kills  ?? 0;
        totals[stats.name].deaths += stats.deaths ?? 0;
      }
    }
    const leader = Object.entries(totals)
      .map(([name, t]) => ({ name, kd: t.deaths > 0 ? t.kills / t.deaths : t.kills }))
      .sort((a, b) => b.kd - a.kd)[0];
    if (leader?.name === result.standoutName) {
      lines.push(`${result.standoutName} leads the league at ${leader.kd.toFixed(2)} K/D`);
    }
  }

  // ── 4. Opponent's notable movement (fallback) ───────────────────────────────
  if (lines.length < 2) {
    const oppPre  = getRank(preStandings, oppId);
    const oppPost = getRank(postStandings, oppId);
    const ot = teamTag(oppId);
    if (oppPre <= 8 && oppPost > 8)       lines.push(`${ot} fall out of the Top 8`);
    else if (oppPre > 8 && oppPost <= 8)  lines.push(`${ot} move into the Top 8`);
    else if (oppPost > oppPre + 1)        lines.push(`${ot} drop to ${ordinal(oppPost)}`);
    else if (oppPost < oppPre - 1)        lines.push(`${ot} rise to ${ordinal(oppPost)}`);
  }

  return lines.slice(0, 2);
}

// ── Stakes line (pre-match) ───────────────────────────────────────────────────
function getStakesLine(userTeamId, stageStandings, matchLog) {
  const myLog = [...(matchLog ?? [])].reverse()
    .filter(r => r.winnerId === userTeamId || r.loserId === userTeamId);

  let streakLen = 0, streakWon = null;
  for (const r of myLog) {
    const won = r.winnerId === userTeamId;
    if (streakWon === null) streakWon = won;
    if (won === streakWon) streakLen++;
    else break;
  }
  if (streakLen >= 3 && !streakWon) return `${streakLen}-match losing streak`;
  if (streakLen >= 3 && streakWon)  return `${streakLen}-match win streak`;
  if (streakLen === 2 && !streakWon) return "Two-match losing streak";
  if (streakLen === 2 && streakWon)  return "Two straight wins";

  const sorted = CDL_TEAMS
    .map(t => ({ id: t.id, pts: stageStandings[t.id]?.points ?? 0 }))
    .sort((a, b) => b.pts - a.pts);
  const myPts  = stageStandings[userTeamId]?.points ?? 0;
  const myRank = sorted.findIndex(t => t.id === userTeamId) + 1;

  const rankAfterWin  = sorted.filter(t => t.id !== userTeamId && t.pts >= myPts + 3).length + 1;
  const rankAfterLoss = sorted.filter(t => t.id !== userTeamId && t.pts >= myPts + 1).length + 1;

  if (myRank > 1 && rankAfterWin < myRank) return `Win moves you to ${ordinal(rankAfterWin)}`;
  if (myRank <= 4) return `${ordinal(myRank)} — hold your position`;
  if (rankAfterLoss > myRank) return `Loss drops you to ${ordinal(rankAfterLoss)}`;
  return null;
}

// ── Pre-match view ────────────────────────────────────────────────────────────
function PreMatchView({ nextMatch, userTeamId, stageStandings, matchLog, matchdayCtx, onPlay, players }) {
  const { openTeamHub } = useTeamHub();
  const oppId  = nextMatch.a === userTeamId ? nextMatch.b : nextMatch.a;
  const stakes = getStakesLine(userTeamId, stageStandings, matchLog);
  const userOvr = calcTeamOvr(userTeamId, players);
  const oppOvr  = calcTeamOvr(oppId, players);

  function rec(id) {
    const r = stageStandings[id] ?? { wins: 0, losses: 0 };
    return `${r.wins}W – ${r.losses}L`;
  }

  return (
    <>
      <div className="nmo-context">{matchdayCtx}</div>
      <div className="nmo-title">YOUR NEXT MATCH</div>

      {stakes && <div className="nmo-stakes">{stakes}</div>}

      <div className="nmo-matchup">
        <div className="nmo-team nmo-team-user">
          <div className="nmo-team-name" style={{ color: teamColor(userTeamId) }}>
            {teamName(userTeamId)}
          </div>
          <div
            className="nmo-team-tag team-link"
            style={{ color: teamColor(userTeamId) }}
            onClick={() => openTeamHub(userTeamId)}
          >
            {teamTag(userTeamId)}
          </div>
          <div className="nmo-team-rec">{rec(userTeamId)}</div>
          <div className="nmo-team-ovr">{userOvr} OVR</div>
          <span className="nmo-you-badge">YOU</span>
        </div>

        <div className="nmo-vs-block">
          <span className="nmo-vs">vs</span>
        </div>

        <div className="nmo-team">
          <div className="nmo-team-name" style={{ color: teamColor(oppId) }}>
            {teamName(oppId)}
          </div>
          <div
            className="nmo-team-tag team-link"
            style={{ color: teamColor(oppId) }}
            onClick={() => openTeamHub(oppId)}
          >
            {teamTag(oppId)}
          </div>
          <div className="nmo-team-rec">{rec(oppId)}</div>
          <div className="nmo-team-ovr">{oppOvr} OVR</div>
        </div>
      </div>

      <div className="nmo-actions">
        <button className="btn-primary nmo-play-btn" onClick={onPlay}>
          ▶ Play Match
        </button>
      </div>
    </>
  );
}

// ── Result view ───────────────────────────────────────────────────────────────
function ResultView({ result, userTeamId, preStandings, postStandings, matchLog, onClose }) {
  const { openTeamHub } = useTeamHub();
  if (!result) {
    return (
      <>
        <div className="nmo-title">MATCHDAY COMPLETE</div>
        <p className="nmo-no-match muted">Your team didn't play this matchday.</p>
        <div className="nmo-actions">
          <button className="btn-primary nmo-play-btn" onClick={onClose}>Continue →</button>
        </div>
      </>
    );
  }

  const won  = result.winnerId === userTeamId;
  const oppId = won ? result.loserId : result.winnerId;
  const consequences = getConsequences(result, userTeamId, preStandings, postStandings, matchLog);

  return (
    <>
      {/* Win / Loss banner */}
      <div className={`nmo-result-banner ${won ? "nmo-win" : "nmo-loss"}`}>
        <span className="nmo-result-outcome">{won ? "VICTORY" : "DEFEAT"}</span>
        <div className="nmo-result-score">{result.score}</div>
        <div className="nmo-result-teams">
          <span className="team-link" style={{ color: teamColor(won ? userTeamId : oppId) }} onClick={() => openTeamHub(won ? userTeamId : oppId)}>
            {teamTag(won ? userTeamId : oppId)}
          </span>
          <span className="nmo-result-sep">—</span>
          <span className="team-link" style={{ color: teamColor(won ? oppId : userTeamId), opacity: 0.6 }} onClick={() => openTeamHub(won ? oppId : userTeamId)}>
            {teamTag(won ? oppId : userTeamId)}
          </span>
        </div>
      </div>

      {/* Consequence lines */}
      {consequences.length > 0 && (
        <div className="nmo-consequences">
          {consequences.map((line, i) => (
            <div key={i} className="nmo-consequence-line">
              {line}
            </div>
          ))}
        </div>
      )}

      {/* Series MVP */}
      {result.standoutName && result.standoutKD > 0 && (
        <div className="nmo-result-mvp">
          <span className="nmo-mvp-star">★</span>
          <strong className="nmo-mvp-name">{result.standoutName}</strong>
          <span className="nmo-mvp-kd">{result.standoutKD.toFixed(2)} K/D</span>
          <span className="nmo-mvp-label">Series MVP</span>
        </div>
      )}

      {/* Map-by-map breakdown */}
      {result.mapResults?.length > 0 && (
        <div className="nmo-result-series">
          <SeriesDetail result={result} />
        </div>
      )}

      <div className="nmo-actions nmo-result-actions">
        <button className="btn-primary nmo-play-btn" onClick={onClose}>
          Continue →
        </button>
      </div>
    </>
  );
}

// ── Main overlay ──────────────────────────────────────────────────────────────
export default function NextMatchOverlay({ isOpen, onClose }) {
  const { state } = useGame();
  const { openMatchCenter } = useMatchCenter();

  if (!isOpen || !state) return null;

  const { schedule, userTeamId, players } = state;
  const stageIdx       = schedule.stageIdx ?? 0;
  const stage          = schedule.stages?.[stageIdx];
  const stageName      = stage?.name ?? "Stage";
  const stageStandings = schedule.stageStandings ?? {};

  const nextMatch = stage?.matches.find(
    m => !m.played && (m.a === userTeamId || m.b === userTeamId)
  ) ?? null;

  const matchdayCtx = (() => {
    if (!stage || !nextMatch) return stageName;
    const matchIdx = stage.matches.indexOf(nextMatch);
    const matchday = matchIdx >= 0 ? Math.floor(matchIdx / 6) + 1 : "?";
    return `${stageName} — Matchday ${matchday}`;
  })();

  function handlePlay() {
    onClose();
    openMatchCenter("stage");
  }

  return (
    <div className="nmo-backdrop" onClick={onClose}>
      <div className="nmo-card" onClick={e => e.stopPropagation()}>
        <button className="nmo-close" onClick={onClose} aria-label="Close">✕</button>

        {nextMatch ? (
          <PreMatchView
            nextMatch={nextMatch}
            userTeamId={userTeamId}
            stageStandings={stageStandings}
            matchLog={schedule.matchLog}
            matchdayCtx={matchdayCtx}
            onPlay={handlePlay}
            players={players}
          />
        ) : (
          <div className="nmo-no-match">
            <div className="nmo-title">NO MATCH SCHEDULED</div>
            <p className="muted">No upcoming match found for your team in this stage.</p>
            <div className="nmo-actions">
              <button className="btn-secondary" onClick={onClose}>Close</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
