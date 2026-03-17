// src/engine/chemistry.js
// Calculates team chemistry score (0–100) from:
//   1. Role balance – does the team have good positional coverage?
//   2. Teamwork average – average teamwork rating across starters
//   3. Ego clashes – high-ego players reduce cohesion
//   4. Experience bonus – shared seasons together

const IDEAL_ROLES = ["Entry SMG", "Slayer SMG", "Main AR", "Flex"];

export function calcChemistry(players) {
  if (!players || players.length === 0) return 50;

  const starters = players.slice(0, 4);

  // 1. Role balance score (0–25)
  const primaryRoles = starters.map(p => p.primary);
  const uniqueRoles = new Set(primaryRoles).size;
  const roleScore = Math.min(25, uniqueRoles * 6.25);

  // 2. Teamwork average (0–25)
  const twAvg = starters.reduce((s, p) => s + p.teamwork, 0) / starters.length;
  const teamworkScore = (twAvg / 99) * 25;

  // 3. Ego clash penalty (0 to -20)
  const totalEgo = starters.reduce((s, p) => s + (p.ego || 2), 0);
  const avgEgo = totalEgo / starters.length;
  // ego 1 = no clash, ego 5 = heavy clash
  const egoClashPenalty = Math.max(0, (avgEgo - 2) * 5);

  // 4. Experience bonus (0–20)
  const avgExp = starters.reduce((s, p) => s + (p.experience || 0), 0) / starters.length;
  const expBonus = Math.min(20, avgExp * 4);

  // 5. Leadership bonus – at least one leader helps (0–10)
  const maxLeadership = Math.max(...starters.map(p => p.leadership || 2));
  const leaderBonus = (maxLeadership / 5) * 10;

  const raw = roleScore + teamworkScore - egoClashPenalty + expBonus + leaderBonus;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

// Returns a short text label for chemistry level
export function chemLabel(score) {
  if (score >= 80) return "Excellent";
  if (score >= 60) return "Good";
  if (score >= 40) return "Average";
  if (score >= 20) return "Poor";
  return "Toxic";
}
