// src/engine/teamOvr.js
// Reusable helper: Team Overall Rating (Team OVR).
// Based on the 4 active starters only — bench/sub players are excluded.

/**
 * Returns the Team OVR: rounded average of active starters' overall ratings.
 * Works for any team (user, AI, or any team clicked in Team Hub).
 *
 * @param {string} teamId
 * @param {Array}  players  - full players array from game state
 * @returns {number} 0–99
 */
export function calcTeamOvr(teamId, players) {
  const starters = players.filter(p => p.teamId === teamId && !p.isSub);
  if (starters.length === 0) return 0;
  const sum = starters.reduce((acc, p) => acc + (p.overall ?? 0), 0);
  return Math.round(sum / starters.length);
}
