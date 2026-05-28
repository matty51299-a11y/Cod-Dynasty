import { CDL_TEAMS } from "../data/teams.js";

function findQualifierTeam(teamId, schedule) {
  const cq = schedule?.currentChallengerQualifier;
  if (!cq) return null;
  const fromField = (cq.field ?? []).find(r => r.teamId === teamId);
  if (fromField) {
    return {
      id: fromField.teamId,
      name: fromField.teamName,
      tag: fromField.tag,
      color: fromField.color,
      logo: fromField.logo,
    };
  }
  return null;
}

export function resolveTeamDisplay(teamId, schedule = null) {
  const eventTeam = schedule?.currentMajorEventTeams?.[teamId];
  const qualifierTeam = !eventTeam ? findQualifierTeam(teamId, schedule) : null;
  const cdlTeam = CDL_TEAMS.find(t => t.id === teamId);
  const team = eventTeam ?? qualifierTeam ?? cdlTeam;
  if (!team) return { id: teamId, name: teamId, tag: String(teamId || "?").slice(0, 3).toUpperCase(), color: "#888", logo: null };
  return {
    id: team.id,
    name: team.name ?? teamId,
    tag: team.tag ?? String(team.name ?? teamId).slice(0, 3).toUpperCase(),
    color: team.color ?? "#888",
    logo: team.logo ?? null,
  };
}
