// src/components/Dashboard.jsx
// Main control panel showing:
//   - Current season / phase
//   - Your team summary
//   - Simulation action buttons
//   - Recent match log (last 5 results)

import { useGame } from "../store/gameStore.jsx";
import { CDL_TEAMS } from "../data/teams.js";
import { calcChemistry, chemLabel } from "../engine/chemistry.js";

export default function Dashboard() {
  const { state, dispatch } = useGame();
  if (!state) return null;

  const { schedule, userTeamId, season, players } = state;
  const team = CDL_TEAMS.find(t => t.id === userTeamId);
  const myPlayers = players.filter(p => p.teamId === userTeamId);
  const chem = calcChemistry(myPlayers);
  const chemText = chemLabel(chem);

  const standings = schedule.standings ?? {};
  const myStanding = standings[userTeamId] ?? { wins: 0, losses: 0, points: 0 };

  const phase = schedule.phase;
  const stageIdx = schedule.currentStage ?? 0;
  const stageName = schedule.stages?.[stageIdx]?.name ?? "—";
  const majorName = schedule.majors?.[stageIdx]?.name ?? "Major";

  // Recent log – last 5 involving user team
  const myLog = [...(schedule.matchLog || [])]
    .reverse()
    .filter(r => r.winnerId === userTeamId || r.loserId === userTeamId)
    .slice(0, 5);

  // Count remaining matches
  const currentStage = schedule.stages?.[stageIdx];
  const remaining = currentStage
    ? currentStage.matches.filter(m => !m.played).length
    : 0;

  const isOffseason = phase === "offseason";
  const isMajor = phase === "major";
  const isStage = phase === "stage";

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <div>
          <h2 style={{ color: team?.color ?? "#fff" }}>{team?.name ?? userTeamId}</h2>
          <p className="muted">Season {season} · {isOffseason ? "Offseason" : isMajor ? majorName : stageName}</p>
        </div>
        <div className="stat-row">
          <Stat label="Record" value={`${myStanding.wins}W – ${myStanding.losses}L`} />
          <Stat label="Points" value={myStanding.points} />
          <Stat label="Chemistry" value={`${chem} (${chemText})`} />
          <Stat label="Roster Size" value={myPlayers.length} />
        </div>
      </div>

      {/* Simulation buttons */}
      <div className="sim-controls">
        {isStage && (
          <>
            <button className="btn-primary" onClick={() => dispatch({ type: "SIM_MATCHDAY" })}>
              Simulate Matchday <span className="badge">{remaining} left</span>
            </button>
            <button className="btn-secondary" onClick={() => dispatch({ type: "SIM_STAGE" })}>
              Sim Rest of {stageName}
            </button>
          </>
        )}
        {isMajor && (
          <button className="btn-primary" onClick={() => dispatch({ type: "SIM_MAJOR" })}>
            Simulate {majorName}
          </button>
        )}
        {isOffseason && (
          <button className="btn-accent" onClick={() => dispatch({ type: "ADVANCE_OFFSEASON" })}>
            Start Season {season + 1}
          </button>
        )}
      </div>

      {/* Recent results */}
      <div className="section">
        <h3>Recent Results</h3>
        {myLog.length === 0 ? (
          <p className="muted">No matches played yet.</p>
        ) : (
          <table className="results-table">
            <thead>
              <tr>
                <th>Stage</th>
                <th>Result</th>
                <th>Score</th>
                <th>Standout</th>
              </tr>
            </thead>
            <tbody>
              {myLog.map((r, i) => {
                const won = r.winnerId === userTeamId;
                const opp = won ? r.loserName : r.winnerName;
                return (
                  <tr key={i}>
                    <td className="muted">{r.stage}</td>
                    <td className={won ? "win" : "loss"}>{won ? `W vs ${opp}` : `L vs ${opp}`}</td>
                    <td>{r.score}</td>
                    <td>{r.standoutName ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Championship results if available */}
      {schedule.majors?.map((major, i) => {
        if (!major.completed || !major.bracket?.champion) return null;
        const champ = CDL_TEAMS.find(t => t.id === major.bracket.champion);
        return (
          <div key={i} className="champion-banner" style={{ borderColor: champ?.color }}>
            🏆 {major.name} Champion: <strong style={{ color: champ?.color }}>{champ?.name ?? major.bracket.champion}</strong>
          </div>
        );
      })}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="stat-box">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  );
}
