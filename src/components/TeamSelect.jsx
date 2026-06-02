// src/components/TeamSelect.jsx
// Startup screen shown when no save exists. The user chooses a career path:
//   • Manage CDL Team       → pick one of the 12 CDL franchises
//   • Manage Challenger Team → pick one of the 24 Challenger teams ("Road to CDL")
// The Challenger picker shows live roster OVR estimates seeded so the started
// save matches the preview.

import { useMemo, useState } from "react";
import { CDL_TEAMS } from "../data/teams.js";
import { useGame, buildChallengerPreview } from "../store/gameStore.jsx";

export default function TeamSelect() {
  const { dispatch } = useGame();
  const [mode, setMode] = useState("cdl"); // "cdl" | "challenger"
  // One stable seed for this picker session → preview matches the started save.
  // Lazy state initializer runs once; keeps render pure on subsequent renders.
  const [seed] = useState(() => ((Date.now() % 999983) * 31 + 7) | 0 || 1);
  const challengerTeams = useMemo(() => (mode === "challenger" ? buildChallengerPreview(seed) : []), [mode, seed]);

  function selectCdl(teamId) {
    dispatch({ type: "NEW_GAME", teamId, teamType: "cdl" });
  }
  function selectChallenger(teamId) {
    dispatch({ type: "NEW_GAME", teamId, teamType: "challenger", seed });
  }

  return (
    <div className="team-select">
      <h1 className="title">CDL MANAGER 2026</h1>
      <p className="subtitle">Choose your career path</p>

      <div className="ts-mode-tabs">
        <button
          className={`ts-mode-tab ${mode === "cdl" ? "active" : ""}`}
          onClick={() => setMode("cdl")}
        >
          Manage CDL Team
          <span className="ts-mode-sub">12 franchises · compete for Champs</span>
        </button>
        <button
          className={`ts-mode-tab ${mode === "challenger" ? "active" : ""}`}
          onClick={() => setMode("challenger")}
        >
          Manage Challenger Team
          <span className="ts-mode-sub">24 teams · Road to CDL career</span>
        </button>
      </div>

      {mode === "cdl" ? (
        <div className="team-grid">
          {CDL_TEAMS.map(team => (
            <button
              key={team.id}
              className="team-card"
              style={{ borderColor: team.color }}
              onClick={() => selectCdl(team.id)}
            >
              <span className="team-tag" style={{ color: team.color }}>{team.tag}</span>
              <span className="team-name">{team.name}</span>
            </button>
          ))}
        </div>
      ) : (
        <>
          <p className="ts-challenger-note">
            Develop players, win qualifiers, qualify for Pro-Am Majors, the Challengers Finals and ESWC —
            but bigger CDL teams will try to buy out your best talent.
          </p>
          <div className="team-grid ts-challenger-grid">
            {challengerTeams.map(team => (
              <button
                key={team.id}
                className="team-card ts-challenger-card"
                style={{ borderColor: team.color }}
                onClick={() => selectChallenger(team.id)}
              >
                <span className="team-tag" style={{ color: team.color }}>{team.tag}</span>
                <span className="team-name">{team.name}</span>
                <span className="ts-challenger-meta">
                  <span className="ts-chip">{team.region}</span>
                  <span className="ts-chip">Est. OVR {team.ovr}</span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
