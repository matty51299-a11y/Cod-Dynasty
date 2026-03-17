// src/components/Standings.jsx
// Shows full league standings table sorted by points,
// plus the major bracket results when available.

import { useGame } from "../store/gameStore.jsx";
import { CDL_TEAMS } from "../data/teams.js";

export default function Standings() {
  const { state } = useGame();
  if (!state) return null;

  const { schedule, userTeamId } = state;
  const standings = schedule.standings ?? {};

  const sorted = CDL_TEAMS
    .map(team => ({
      team,
      record: standings[team.id] ?? { wins: 0, losses: 0, points: 0 },
    }))
    .sort((a, b) => b.record.points - a.record.points);

  return (
    <div className="standings-page">
      <h2>League Standings – Season {state.season}</h2>
      <p className="muted">Phase: {
        schedule.phase === "stage"     ? schedule.stages?.[schedule.stageIdx ?? schedule.currentStage ?? 0]?.name
        : schedule.phase === "major"   ? schedule.majors?.[schedule.majorIdx ?? schedule.currentStage ?? 0]?.name
        : schedule.phase === "preChamps" ? "Pre-Championship Window"
        : "Offseason"
      }</p>

      <table className="standings-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Team</th>
            <th>W</th>
            <th>L</th>
            <th>Pts</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(({ team, record }, i) => (
            <tr key={team.id} className={team.id === userTeamId ? "user-row" : ""}>
              <td>{i + 1}</td>
              <td>
                <span className="dot" style={{ background: team.color }} />
                {team.name}
                {team.id === userTeamId && <span className="you-badge"> YOU</span>}
              </td>
              <td>{record.wins}</td>
              <td>{record.losses}</td>
              <td className="pts">{record.points}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Show major bracket results */}
      {schedule.majors?.map((major, i) => {
        if (!major.bracket) return null;
        return <MajorBracket key={i} major={major} />;
      })}
    </div>
  );
}

function MajorBracket({ major }) {
  const { bracket } = major;
  if (!bracket?.rounds) return null;

  return (
    <div className="bracket-section">
      <h3>{major.name}</h3>
      {bracket.champion && (
        <p className="champion-text">
          Champion: <strong>{CDL_TEAMS.find(t => t.id === bracket.champion)?.name ?? bracket.champion}</strong>
        </p>
      )}
      {bracket.rounds.map((round, ri) => {
        if (!round.matches || round.matches.length === 0) return null;
        return (
          <div key={ri} className="bracket-round">
            <h4>{round.name}</h4>
            <div className="bracket-matches">
              {round.matches.map((m, mi) => {
                if (!m.a && !m.b) return null;
                const teamA = CDL_TEAMS.find(t => t.id === m.a);
                const teamB = CDL_TEAMS.find(t => t.id === m.b);
                const winnerA = m.result?.winnerId === m.a;
                const winnerB = m.result?.winnerId === m.b;
                return (
                  <div key={mi} className="bracket-match">
                    <span className={winnerA ? "winner" : (m.played ? "loser" : "")}>
                      {teamA?.tag ?? m.a}
                    </span>
                    {" vs "}
                    <span className={winnerB ? "winner" : (m.played ? "loser" : "")}>
                      {teamB?.tag ?? m.b}
                    </span>
                    {m.result && <span className="score"> {m.result.score}</span>}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
