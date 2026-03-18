// src/components/MajorMatchOverlay.jsx
// Pre-match → result overlay for the user's active tournament match.
//
// Same flow as NextMatchOverlay (stage matches) with bracket context layered on.
// Reuses nmo-* CSS classes so both overlays feel like the same system.
// Adds only mmo-backdrop (z-index above tournament) and mmo-consequence
// for tournament-specific outcome messaging.

import { useEffect, useRef, useState } from "react";
import { useGame } from "../store/gameStore.jsx";
import { CDL_TEAMS } from "../data/teams.js";
import SeriesDetail from "./SeriesDetail.jsx";
import { useTeamHub } from "../store/teamHubContext.jsx";

function teamColor(id) { return CDL_TEAMS.find(t => t.id === id)?.color ?? "#888"; }
function teamName(id)  { return CDL_TEAMS.find(t => t.id === id)?.name  ?? id; }
function teamTag(id)   { return CDL_TEAMS.find(t => t.id === id)?.tag   ?? id; }

function seedNum(bracket, teamId, fallback) {
  if (fallback != null) return fallback;
  const idx = bracket?.seeds?.indexOf(teamId) ?? -1;
  return idx >= 0 ? idx + 1 : null;
}

// Derive the tournament consequence from the bracket state after the match.
// Called only for the winning case; elimination is always shown when user lost.
function getWinConsequence(bracket, userTeamId, majorName) {
  if (!bracket) return null;
  if (bracket.champion === userTeamId) {
    return { type: "champion", text: `${majorName} Champion` };
  }
  for (const round of bracket.rounds) {
    if (round.matches.some(m => !m.played && (m.a === userTeamId || m.b === userTeamId))) {
      return { type: "advanced", text: `Advanced to the ${round.name}` };
    }
  }
  return null;
}

// ── Pre-match view ────────────────────────────────────────────────────────────
function PreMatchView({ match, bracket, roundName, majorName, userTeamId, onPlay }) {
  const { openTeamHub } = useTeamHub();
  const oppId    = match.a === userTeamId ? match.b : match.a;
  const userSeed = seedNum(bracket, userTeamId, match.a === userTeamId ? match.seedA : match.seedB);
  const oppSeed  = seedNum(bracket, oppId,      match.a === userTeamId ? match.seedB : match.seedA);

  return (
    <>
      <div className="nmo-context">{majorName} — {roundName}</div>
      <div className="nmo-title">YOUR NEXT MATCH</div>

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
          {userSeed != null && <div className="nmo-team-rec">Seed #{userSeed}</div>}
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
          {oppSeed != null && <div className="nmo-team-rec">Seed #{oppSeed}</div>}
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
function ResultView({ result, userTeamId, latestBracket, majorName, roundName, onClose }) {
  const { openTeamHub } = useTeamHub();
  const won        = result.winnerId === userTeamId;
  const consequence = won ? getWinConsequence(latestBracket, userTeamId, majorName) : null;

  return (
    <>
      {/* Win / Loss banner — same structure and classes as qualifier ResultView */}
      <div className={`nmo-result-banner ${won ? "nmo-win" : "nmo-loss"}`}>
        <span className="nmo-result-outcome">{won ? "VICTORY" : "DEFEAT"}</span>
        <div className="nmo-result-score">{result.score}</div>
        <div className="nmo-result-teams">
          <span className="team-link" style={{ color: teamColor(result.winnerId) }} onClick={() => openTeamHub(result.winnerId)}>
            {teamTag(result.winnerId)}
          </span>
          <span className="nmo-result-sep">—</span>
          <span className="team-link" style={{ color: teamColor(result.loserId), opacity: 0.6 }} onClick={() => openTeamHub(result.loserId)}>
            {teamTag(result.loserId)}
          </span>
        </div>
      </div>

      {/* Tournament consequence — what this result means in the bracket */}
      {won && consequence && (
        <div className={`mmo-consequence ${consequence.type === "champion" ? "mmo-cons-champ" : "mmo-cons-advanced"}`}>
          {consequence.type === "champion" ? "🏆 " : "→ "}
          {consequence.text}
        </div>
      )}
      {!won && (
        <div className="mmo-consequence mmo-cons-eliminated">
          Eliminated — fell in the {roundName}
        </div>
      )}

      {/* Series MVP — same structure and classes as qualifier */}
      {result.standoutName && result.standoutKD > 0 && (
        <div className="nmo-result-mvp">
          <span className="nmo-mvp-star">⭐</span>
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
          {won ? "Back to Bracket →" : "Return to Bracket →"}
        </button>
      </div>
    </>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function MajorMatchOverlay({ isOpen, onClose }) {
  const { state, dispatch } = useGame();
  const [view, setView]               = useState("pre");
  const [postSimResult, setPostSimResult] = useState(null);
  const preSimLenRef = useRef(null);

  // Reset when overlay opens
  useEffect(() => {
    if (isOpen) {
      setView("pre");
      setPostSimResult(null);
      preSimLenRef.current = null;
    }
  }, [isOpen]);

  // Detect result after SIM_NEXT_MAJOR_MATCH state update
  useEffect(() => {
    if (preSimLenRef.current === null) return;
    const matchLog = state?.schedule?.matchLog ?? [];
    if (matchLog.length <= preSimLenRef.current) return;

    const { userTeamId } = state;
    const newEntries = matchLog.slice(preSimLenRef.current);
    const userEntry  = newEntries.find(
      r => r.winnerId === userTeamId || r.loserId === userTeamId
    ) ?? null;

    setPostSimResult(userEntry);
    preSimLenRef.current = null;
    setView("result");
  }, [state?.schedule?.matchLog?.length]); // eslint-disable-line

  if (!isOpen || !state) return null;

  const { schedule, userTeamId, enteredMajorIdx } = state;

  // Derive bracket context — always reads latest state so result view is current
  const enteredMajor  = schedule.majors?.[enteredMajorIdx];
  const latestBracket = enteredMajor?.bracket ?? null;
  const majorName     = enteredMajor?.name ?? "";

  // Find the user's current match (for pre view)
  let userMatch  = null;
  let roundName  = null;
  if (latestBracket) {
    for (const round of latestBracket.rounds) {
      const m = round.matches.find(
        mx => !mx.played && (mx.a === userTeamId || mx.b === userTeamId)
      );
      if (m) { userMatch = m; roundName = round.name; break; }
    }
  }

  function handlePlay() {
    preSimLenRef.current = schedule.matchLog?.length ?? 0;
    dispatch({ type: "SIM_NEXT_MAJOR_MATCH" });
  }

  // For result view: derive roundName from pre-existing postSimResult stage field
  const resultRoundName = postSimResult?.stage?.split(" – ")[1] ?? roundName ?? "";

  return (
    <div className="mmo-backdrop" onClick={onClose}>
      <div
        className={`nmo-card ${view === "result" ? "nmo-card-result" : ""}`}
        onClick={e => e.stopPropagation()}
      >
        <button className="nmo-close" onClick={onClose} aria-label="Close">✕</button>

        {view === "pre" && userMatch && (
          <PreMatchView
            match={userMatch}
            bracket={latestBracket}
            roundName={roundName}
            majorName={majorName}
            userTeamId={userTeamId}
            onPlay={handlePlay}
          />
        )}

        {view === "result" && postSimResult && (
          <ResultView
            result={postSimResult}
            userTeamId={userTeamId}
            latestBracket={latestBracket}
            majorName={majorName}
            roundName={resultRoundName}
            onClose={onClose}
          />
        )}
      </div>
    </div>
  );
}
