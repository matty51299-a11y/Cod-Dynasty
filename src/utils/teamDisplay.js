import { CDL_TEAMS } from "../data/teams.js";

export function resolveTeamDisplay(teamId, schedule = null) {
  const eventTeam = schedule?.currentMajorEventTeams?.[teamId];
  const cdlTeam = CDL_TEAMS.find(t => t.id === teamId);
  const team = eventTeam ?? cdlTeam;
  if (!team) return { id: teamId, name: teamId, tag: String(teamId || "?").slice(0, 3).toUpperCase(), color: "#888", logo: null };
  return {
    id: team.id,
    name: team.name ?? teamId,
    tag: team.tag ?? String(team.name ?? teamId).slice(0, 3).toUpperCase(),
    color: team.color ?? "#888",
    logo: team.logo ?? null,
  };
}
