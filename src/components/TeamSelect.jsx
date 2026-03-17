// src/components/TeamSelect.jsx
// Screen shown at startup when no save exists.
// Player picks one of the 12 CDL teams to manage.

import { CDL_TEAMS } from "../data/teams.js";
import { useGame } from "../store/gameStore.jsx";

export default function TeamSelect() {
  const { dispatch } = useGame();

  function handleSelect(teamId) {
    dispatch({ type: "NEW_GAME", teamId });
  }

  return (
    <div className="team-select">
      <h1 className="title">CDL MANAGER 2026</h1>
      <p className="subtitle">Select your franchise to manage</p>
      <div className="team-grid">
        {CDL_TEAMS.map(team => (
          <button
            key={team.id}
            className="team-card"
            style={{ borderColor: team.color }}
            onClick={() => handleSelect(team.id)}
          >
            <span className="team-tag" style={{ color: team.color }}>{team.tag}</span>
            <span className="team-name">{team.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
