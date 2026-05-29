import { CDL_TEAMS } from "../data/teams.js";
import { isInactivePlayer } from "./playerIdentity.js";

export const REQUIRED_CDL_STARTERS = 4;

export function getActiveStarters(players, teamId) {
  return (players || []).filter(p => p.teamId === teamId && !p.isSub && !isInactivePlayer(p));
}

export function getTeamRosterStatus(players, teamId) {
  const activeStarters = getActiveStarters(players, teamId);
  const required = REQUIRED_CDL_STARTERS;
  const count = activeStarters.length;
  return {
    activeStarters,
    count,
    required,
    missing: Math.max(0, required - count),
    valid: count >= required,
  };
}

export function getRosterIncompleteMessage(state, teamId = state?.userTeamId) {
  const status = getTeamRosterStatus(state?.players, teamId);
  const teamName = CDL_TEAMS.find(t => t.id === teamId)?.name ?? teamId ?? "Your team";
  if (status.valid) return null;
  const playerWord = status.missing === 1 ? "player" : "players";
  return `Roster incomplete — ${teamName} have ${status.count}/${status.required} starters. Sign ${status.missing} more ${playerWord} before continuing.`;
}

export function isUserRosterPlayable(state) {
  return getTeamRosterStatus(state?.players, state?.userTeamId).valid;
}
