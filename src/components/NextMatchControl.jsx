// src/components/NextMatchControl.jsx
// Top-right topbar launcher — primary progression control.
//   • CDL mode: opens NextMatchOverlay for the user's next stage match.
//   • Challenger mode (stage phase): advances the CDL season in the background
//     to the next Challenger Qualifier (the user's next relevant event). During
//     qualifier/major phases the dedicated event overlays drive play.

import { useGame } from "../store/gameStore.jsx";
import { CDL_TEAMS } from "../data/teams.js";
import { isUserRosterPlayable } from "../utils/rosterValidation.js";
import { isChallengerMode } from "../utils/userTeam.js";

export default function NextMatchControl({ onOpen }) {
  const { state, dispatch } = useGame();
  if (!state) return null;

  const { schedule, userTeamId } = state;

  // ── Challenger mode ──────────────────────────────────────────────────────
  if (isChallengerMode(state)) {
    if (schedule.phase !== "stage") return null; // qualifier/major overlays take over
    function advance() {
      if (!isUserRosterPlayable(state)) { dispatch({ type: "SHOW_ROSTER_INCOMPLETE" }); return; }
      dispatch({ type: "SIM_STAGE" });
    }
    return (
      <button className="nmc-btn" onClick={advance} title="Simulate the pro stage and advance to your next Open Qualifier">
        <span className="nmc-play-label">Sim to Qualifier</span>
        <span className="nmc-arrow">▶</span>
      </button>
    );
  }

  // ── CDL mode ─────────────────────────────────────────────────────────────
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
