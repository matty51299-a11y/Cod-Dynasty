// src/components/KDLeaders.jsx
// Live K/D leaderboard — aggregated from the current season's matchLog.
// playerSeasonStats is the offseason archive; matchLog is the live source.

import { useGame } from "../store/gameStore.jsx";
import { CDL_TEAMS } from "../data/teams.js";
import { useTeamHub } from "../store/teamHubContext.jsx";

function teamColor(id) { return CDL_TEAMS.find(t => t.id === id)?.color ?? "#888"; }
function teamTag(id)   { return CDL_TEAMS.find(t => t.id === id)?.tag   ?? id; }

export default function KDLeaders() {
  const { state } = useGame();
  const { openTeamHub } = useTeamHub();
  if (!state) return null;

  const { schedule, players, season, userTeamId } = state;
  const matchLog = schedule?.matchLog ?? [];

  if (matchLog.length === 0) {
    return (
      <div className="screen-padded">
        <h2 className="screen-title">K/D Leaders — Season {season}</h2>
        <p className="muted">No matches played yet — play some matchdays to populate the leaderboard.</p>
      </div>
    );
  }

  // Aggregate kills/deaths/matches per player from current-season matchLog.
  // Each entry carries playerStats: { [playerId]: { name, teamId, kills, deaths, kd } }
  const totals = {};
  for (const entry of matchLog) {
    if (!entry.playerStats) continue;
    for (const [pid, stats] of Object.entries(entry.playerStats)) {
      if (!totals[pid]) totals[pid] = { kills: 0, deaths: 0, matches: 0, name: stats.name, teamId: stats.teamId };
      totals[pid].kills   += stats.kills  ?? 0;
      totals[pid].deaths  += stats.deaths ?? 0;
      totals[pid].matches += 1;
    }
  }

  const rows = Object.entries(totals)
    .map(([pid, t]) => ({
      id:      pid,
      name:    t.name,
      teamId:  t.teamId,
      kills:   t.kills,
      deaths:  t.deaths,
      matches: t.matches,
      kd:      t.deaths > 0 ? t.kills / t.deaths : t.kills,
    }))
    .sort((a, b) => b.kd - a.kd)
    .slice(0, 30);

  if (rows.length === 0) {
    return (
      <div className="screen-padded">
        <h2 className="screen-title">K/D Leaders — Season {season}</h2>
        <p className="muted">No player stat data found in match log.</p>
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
                    <span
                      className="kd-team-tag team-link"
                      style={{ color: teamColor(row.teamId) }}
                      onClick={() => openTeamHub(row.teamId)}
                    >
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
