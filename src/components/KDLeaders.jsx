// src/components/KDLeaders.jsx
// Season K/D leaderboard. Joins playerSeasonStats with players list.

import { useGame } from "../store/gameStore.jsx";
import { CDL_TEAMS } from "../data/teams.js";

function teamColor(id) { return CDL_TEAMS.find(t => t.id === id)?.color ?? "#888"; }
function teamTag(id)   { return CDL_TEAMS.find(t => t.id === id)?.tag   ?? id; }

export default function KDLeaders() {
  const { state } = useGame();
  if (!state) return null;

  const { playerSeasonStats, players, season, userTeamId } = state;

  if (!playerSeasonStats || Object.keys(playerSeasonStats).length === 0) {
    return (
      <div className="screen-padded">
        <h2 className="screen-title">K/D Leaders</h2>
        <p className="muted">No match data yet — play some matches to populate the leaderboard.</p>
      </div>
    );
  }

  // Build leaderboard rows: for each player, find their stats for the current season
  const rows = players
    .map(p => {
      const history = playerSeasonStats[p.id] ?? [];
      const seasonEntry = history.find(s => s.season === season);
      if (!seasonEntry || seasonEntry.matches === 0) return null;
      const { kills = 0, deaths = 0, matches = 0 } = seasonEntry;
      const kd = deaths > 0 ? kills / deaths : kills;
      return { id: p.id, name: p.name, teamId: p.teamId, kills, deaths, matches, kd };
    })
    .filter(Boolean)
    .sort((a, b) => b.kd - a.kd)
    .slice(0, 30);

  if (rows.length === 0) {
    return (
      <div className="screen-padded">
        <h2 className="screen-title">K/D Leaders</h2>
        <p className="muted">No match data for Season {season} yet.</p>
      </div>
    );
  }

  return (
    <div className="screen-padded">
      <h2 className="screen-title">K/D Leaders — Season {season}</h2>

      <div className="kd-table-wrap">
        <table className="kd-table">
          <thead>
            <tr>
              <th className="kd-th kd-th-rank">#</th>
              <th className="kd-th">Player</th>
              <th className="kd-th kd-th-team">Team</th>
              <th className="kd-th kd-th-num">K/D</th>
              <th className="kd-th kd-th-num">Kills</th>
              <th className="kd-th kd-th-num">Deaths</th>
              <th className="kd-th kd-th-num">Matches</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const isUser = row.teamId === userTeamId;
              return (
                <tr key={row.id} className={`kd-row ${isUser ? "kd-row-user" : ""}`}>
                  <td className="kd-td kd-td-rank">
                    {i < 3
                      ? <span className="kd-medal">{["🥇","🥈","🥉"][i]}</span>
                      : <span className="kd-rank-num">{i + 1}</span>}
                  </td>
                  <td className="kd-td kd-td-name">{row.name}</td>
                  <td className="kd-td">
                    <span className="kd-team-tag" style={{ color: teamColor(row.teamId) }}>
                      {teamTag(row.teamId)}
                    </span>
                  </td>
                  <td className="kd-td kd-td-num kd-td-kd">
                    <span className={row.kd >= 1 ? "kd-positive" : "kd-negative"}>
                      {row.kd.toFixed(2)}
                    </span>
                  </td>
                  <td className="kd-td kd-td-num">{row.kills}</td>
                  <td className="kd-td kd-td-num">{row.deaths}</td>
                  <td className="kd-td kd-td-num">{row.matches}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
