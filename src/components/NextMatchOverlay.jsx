// src/components/NextMatchOverlay.jsx
// Phase 2: full matchday loop overlay.
//
// Pre-match  → user sees upcoming fixture + stakes context → clicks "Play Matchday"
// Result     → overlay shows ONLY the user's result (other league results live
//              in Schedule / Standings / Match Log per design intent)
// Continue   → onClose(); sidebar screens auto-reflect updated state

import { useEffect, useRef, useState } from "react";
import { useGame } from "../store/gameStore.jsx";
import { CDL_TEAMS } from "../data/teams.js";
import SeriesDetail from "./SeriesDetail.jsx";

function teamColor(id) { return CDL_TEAMS.find(t => t.id === id)?.color ?? "#888"; }
function teamName(id)  { return CDL_TEAMS.find(t => t.id === id)?.name  ?? id; }
function teamTag(id)   { return CDL_TEAMS.find(t => t.id === id)?.tag   ?? id; }

function ordinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// Derive a short stakes/context sentence for the pre-match card
function getStakesLine(userTeamId, stageStandings, matchLog) {
  // Streak check from most-recent matches backward
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

  // Ranking-based stakes
  const sorted = CDL_TEAMS
    .map(t => ({ id: t.id, pts: (stageStandings[t.id]?.points ?? 0) }))
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
function PreMatchView({ nextMatch, userTeamId, stageStandings, matchLog, matchdayCtx, onPlay }) {
  const oppId    = nextMatch.a === userTeamId ? nextMatch.b : nextMatch.a;
  const stakes   = getStakesLine(userTeamId, stageStandings, matchLog);

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
        {/* User team */}
        <div className="nmo-team nmo-team-user">
          <div className="nmo-team-name" style={{ color: teamColor(userTeamId) }}>
            {teamName(userTeamId)}
          </div>
          <div className="nmo-team-tag" style={{ color: teamColor(userTeamId) }}>
            {teamTag(userTeamId)}
          </div>
          <div className="nmo-team-rec">{rec(userTeamId)}</div>
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
          <div className="nmo-team-rec">{rec(oppId)}</div>
        </div>
      </div>

      <div className="nmo-actions">
        <button className="btn-primary nmo-play-btn" onClick={onPlay}>
          ▶ Play Matchday
        </button>
      </div>
    </>
  );
}

// ── Result view ───────────────────────────────────────────────────────────────
function ResultView({ result, userTeamId, onClose }) {
  if (!result) {
    // Edge case: user's team wasn't scheduled this matchday
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

  const won    = result.winnerId === userTeamId;
  const oppId  = won ? result.loserId : result.winnerId;

  return (
    <>
      {/* Win / Loss banner */}
      <div className={`nmo-result-banner ${won ? "nmo-win" : "nmo-loss"}`}>
        <span className="nmo-result-outcome">{won ? "VICTORY" : "DEFEAT"}</span>
        <div className="nmo-result-score">{result.score}</div>
        <div className="nmo-result-teams">
          <span style={{ color: teamColor(won ? userTeamId : oppId) }}>
            {teamTag(won ? userTeamId : oppId)}
          </span>
          <span className="nmo-result-sep">—</span>
          <span style={{ color: teamColor(won ? oppId : userTeamId), opacity: 0.6 }}>
            {teamTag(won ? oppId : userTeamId)}
          </span>
        </div>
      </div>

      {/* MVP / standout */}
      {result.standoutName && result.standoutKD > 0 && (
        <div className="nmo-result-mvp">
          <span className="nmo-mvp-star">⭐</span>
          <strong className="nmo-mvp-name">{result.standoutName}</strong>
          <span className="nmo-mvp-kd">{result.standoutKD.toFixed(2)} K/D</span>
          <span className="nmo-mvp-label">Series MVP</span>
        </div>
      )}

      {/* Map-by-map breakdown via existing component */}
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
  const { state, dispatch } = useGame();

  // "pre" = pre-match view   "result" = post-sim result view
  const [view, setView]           = useState("pre");
  const [userResult, setUserResult] = useState(null);
  const preSimLenRef               = useRef(null); // matchLog length before SIM_MATCHDAY

  // Reset to pre-match state whenever the overlay opens
  useEffect(() => {
    if (isOpen) {
      setView("pre");
      setUserResult(null);
      preSimLenRef.current = null;
    }
  }, [isOpen]);

  // After SIM_MATCHDAY fires, detect the user's result from new matchLog entries
  useEffect(() => {
    if (preSimLenRef.current === null) return;
    const matchLog = state?.schedule?.matchLog ?? [];
    if (matchLog.length <= preSimLenRef.current) return; // not yet updated

    const newEntries = matchLog.slice(preSimLenRef.current);
    const userEntry  = newEntries.find(
      r => r.winnerId === state.userTeamId || r.loserId === state.userTeamId
    ) ?? null;

    preSimLenRef.current = null;
    setUserResult(userEntry);
    setView("result");
  }, [state?.schedule?.matchLog?.length]); // eslint-disable-line

  if (!isOpen || !state) return null;

  const { schedule, userTeamId } = state;
  const stageIdx       = schedule.stageIdx ?? 0;
  const stage          = schedule.stages?.[stageIdx];
  const stageName      = stage?.name ?? "Stage";
  const stageStandings = schedule.stageStandings ?? {};

  // Next unplayed user match
  const nextMatch = stage?.matches.find(
    m => !m.played && (m.a === userTeamId || m.b === userTeamId)
  ) ?? null;

  // Matchday context label
  const matchdayCtx = (() => {
    if (!stage || !nextMatch) return stageName;
    const matchIdx = stage.matches.indexOf(nextMatch);
    const matchday = matchIdx >= 0 ? Math.floor(matchIdx / 6) + 1 : "?";
    return `${stageName} — Matchday ${matchday}`;
  })();

  function handlePlay() {
    preSimLenRef.current = state.schedule.matchLog?.length ?? 0;
    // SIM_USER_MATCHDAY guarantees the user's next match is included in the
    // simmed batch, regardless of how the shuffled schedule is ordered.
    dispatch({ type: "SIM_USER_MATCHDAY" });
  }

  function handleClose() {
    onClose();
    // Reset happens via the isOpen useEffect on next open
  }

  return (
    <div className="nmo-backdrop" onClick={handleClose}>
      <div
        className={`nmo-card ${view === "result" ? "nmo-card-result" : ""}`}
        onClick={e => e.stopPropagation()}
      >
        <button className="nmo-close" onClick={handleClose} aria-label="Close">✕</button>

        {view === "pre" && nextMatch && (
          <PreMatchView
            nextMatch={nextMatch}
            userTeamId={userTeamId}
            stageStandings={stageStandings}
            matchLog={schedule.matchLog}
            matchdayCtx={matchdayCtx}
            onPlay={handlePlay}
          />
        )}

        {view === "pre" && !nextMatch && (
          <div className="nmo-no-match">
            <div className="nmo-title">NO MATCH SCHEDULED</div>
            <p className="muted">No upcoming match found for your team in this stage.</p>
            <div className="nmo-actions">
              <button className="btn-secondary" onClick={handleClose}>Close</button>
            </div>
          </div>
        )}

        {view === "result" && (
          <ResultView
            result={userResult}
            userTeamId={userTeamId}
            onClose={handleClose}
          />
        )}
      </div>
    </div>
  );
}
