import { getSigningCost, getTeamCap } from "../engine/rosterAI.js";

export function getContractSalary(player) {
  return player?.salary ?? getSigningCost(player);
}

export function isStarterContractLocked(player) {
  return !player?.isSub && (player.contractYears ?? 2) > 1;
}

export function getContractReviewBudget(players, teamId) {
  const starters = (players || []).filter(p => p.teamId === teamId && !p.isSub);
  const lockedCost = starters
    .filter(isStarterContractLocked)
    .reduce((sum, player) => sum + getContractSalary(player), 0);
  const cap = getTeamCap(teamId);
  return { cap, lockedCost, space: cap - lockedCost };
}

export function canAffordStarterResign(players, teamId, playerId, newSalary) {
  const committedExcludingPlayer = (players || [])
    .filter(p => p.teamId === teamId && !p.isSub && p.id !== playerId)
    .filter(isStarterContractLocked)
    .reduce((sum, player) => sum + getContractSalary(player), 0);
  const cap = getTeamCap(teamId);
  const committedAfter = committedExcludingPlayer + (newSalary ?? 0);
  return {
    cap,
    committedExcludingPlayer,
    committedAfter,
    spaceAfter: cap - committedAfter,
    affordable: committedAfter <= cap,
  };
}
