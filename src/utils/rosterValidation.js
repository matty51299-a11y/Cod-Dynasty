import { CDL_TEAMS } from "../data/teams.js";
import { isInactivePlayer } from "./playerIdentity.js";
import { isChallengerMode, getChallengerRosterPlayers, resolveUserTeamMeta } from "./userTeam.js";

export const REQUIRED_CDL_STARTERS = 4;
export const REQUIRED_CHALLENGER_STARTERS = 4;

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

// Roster status for the user-managed Challenger team.
export function getChallengerRosterStatus(state, teamId = state?.userTeamId) {
  const activeStarters = getChallengerRosterPlayers(state, teamId);
  const required = REQUIRED_CHALLENGER_STARTERS;
  const count = activeStarters.length;
  return {
    activeStarters,
    count,
    required,
    missing: Math.max(0, required - count),
    valid: count >= required,
  };
}

// Mode-aware status for the user's own team (CDL or Challenger).
export function getUserRosterStatus(state) {
  if (isChallengerMode(state)) return getChallengerRosterStatus(state);
  return getTeamRosterStatus(state?.players, state?.userTeamId);
}

export function getRosterIncompleteMessage(state, teamId = state?.userTeamId) {
  // The user team uses mode-aware status; other teams use the CDL check.
  if (teamId === state?.userTeamId) {
    const status = getUserRosterStatus(state);
    if (status.valid) return null;
    const teamName = resolveUserTeamMeta(state)?.name ?? teamId ?? "Your team";
    const playerWord = status.missing === 1 ? "player" : "players";
    return `Roster incomplete — ${teamName} have ${status.count}/${status.required} starters. Sign ${status.missing} more ${playerWord} before continuing.`;
  }
  const status = getTeamRosterStatus(state?.players, teamId);
  if (status.valid) return null;
  const teamName = CDL_TEAMS.find(t => t.id === teamId)?.name ?? teamId ?? "Your team";
  const playerWord = status.missing === 1 ? "player" : "players";
  return `Roster incomplete — ${teamName} have ${status.count}/${status.required} starters. Sign ${status.missing} more ${playerWord} before continuing.`;
}

export function isUserRosterPlayable(state) {
  return getUserRosterStatus(state).valid;
}
