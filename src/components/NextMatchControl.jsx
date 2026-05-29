// src/components/NextMatchControl.jsx
// Top-right topbar launcher — primary stage-play progression control.
// Clicking opens NextMatchOverlay; no simulation dispatched from here.

import { useGame } from "../store/gameStore.jsx";
import { CDL_TEAMS } from "../data/teams.js";
import { isUserRosterPlayable } from "../utils/rosterValidation.js";

export default function NextMatchControl({ onOpen }) {
  const { state, dispatch } = useGame();
  if (!state) return null;

  const { schedule, userTeamId } = state;
  if (schedule.phase !== "stage") return null;

  const stageIdx = schedule.stageIdx ?? 0;
  const stage    = schedule.stages?.[stageIdx];
  if (!stage) return null;

  const nextMatch = stage.matches.find(
    m => !m.played && (m.a === userTeamId || m.b === userTeamId)
  );
  if (!nextMatch) return null;

  const oppId   = nextMatch.a === userTeamId ? nextMatch.b : nextMatch.a;
  const oppTeam = CDL_TEAMS.find(t => t.id === oppId);

  function handleOpen() {
    if (!isUserRosterPlayable(state)) {
      dispatch({ type: "SHOW_ROSTER_INCOMPLETE" });
      return;
    }
    onOpen();
  }

  return (
    <button className="nmc-btn" onClick={handleOpen} title={`Play next matchday vs ${oppTeam?.name ?? oppId}`}>
      <span className="nmc-play-label">Play Matchday</span>
      <span className="nmc-divider">·</span>
      <span className="nmc-vs">vs</span>
      <span className="nmc-opp" style={{ color: oppTeam?.color ?? "var(--text-head)" }}>
        {oppTeam?.tag ?? oppId}
      </span>
      <span className="nmc-arrow">▶</span>
    </button>
  );
}
