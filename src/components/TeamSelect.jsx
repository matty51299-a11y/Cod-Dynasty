// src/components/TeamSelect.jsx
// Cod Dynasty start flow: historical-only Ghosts dynasty team selection.

import { getGhostsRosterForTeam, getGhostsTeamOvr } from "../data/historicalRosters.js";
import { HISTORICAL_STARTING_TEAMS } from "../data/teams.js";
import { useGame } from "../store/gameStore.jsx";

export default function TeamSelect() {
  const { dispatch } = useGame();

  function startDynasty(teamId) {
    dispatch({ type: "NEW_GAME", teamId, teamType: "cdl", careerMode: "historical" });
  }

  return (
    <div className="team-select">
      <h1 className="title">COD DYNASTY</h1>
      <p className="subtitle">Start in Call of Duty: Ghosts and build through COD history.</p>

      <div className="ts-mode-tabs" aria-label="Dynasty start">
        <div className="ts-mode-tab active" role="note">
          Start Dynasty
          <span className="ts-mode-sub">Ghosts Era · 4v4 · Domination / Search and Destroy / Blitz</span>
        </div>
      </div>

      <div className="team-grid">
        {HISTORICAL_STARTING_TEAMS.map(team => {
          const roster = getGhostsRosterForTeam(team.id);
          const rosterNames = roster.map(player => player.name).join(", ");
          const ovr = getGhostsTeamOvr(team.id);
          return (
            <button
              key={team.id}
              className="team-card"
              style={{ borderColor: team.color }}
              onClick={() => startDynasty(team.id)}
            >
              <span className="team-tag" style={{ color: team.color }}>{team.shortName || team.tag}</span>
              <span className="team-name">{team.name}</span>
              <span className="ts-challenger-meta">
                <span className="ts-chip">Ghosts Era</span>
                {ovr != null && <span className="ts-chip">OVR {ovr}</span>}
              </span>
              <span className="ts-mode-sub">{rosterNames}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
