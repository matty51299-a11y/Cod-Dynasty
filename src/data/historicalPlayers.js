import { GHOSTS_PLAYERS, AW_PLAYERS, getNewAWEntrants } from "./historicalRosters.js";
import { canonicalPlayerId } from "./historicalPlayerRegistry.js";

export function getGhostsPlayerUniverse() {
  return GHOSTS_PLAYERS.map(p => ({ ...p }));
}

export function getAWNewEntrants() {
  const ghostsNames = new Set(GHOSTS_PLAYERS.map(p => p.name.toLowerCase()));
  return AW_PLAYERS.filter(p => !ghostsNames.has(p.name.toLowerCase())).map(p => ({
    ...p,
    debutEraId: "advanced_warfare",
  }));
}

export function isPlayerAvailableInEra(player, eraId) {
  const debutEra = player.debutEraId || player.eraId || "ghosts";
  const eraOrder = ["ghosts", "advanced_warfare", "black_ops_3", "infinite_warfare", "wwii", "black_ops_4", "modern_warfare_2019"];
  const debutIdx = eraOrder.indexOf(debutEra);
  const currentIdx = eraOrder.indexOf(eraId);
  if (debutIdx === -1 || currentIdx === -1) return true;
  return currentIdx >= debutIdx;
}

export function buildPlayerUniverseForEra(eraId) {
  if (eraId === "ghosts") return getGhostsPlayerUniverse();

  const players = [...getGhostsPlayerUniverse()];
  if (eraId === "advanced_warfare" || eraOrder("advanced_warfare", eraId)) {
    players.push(...getAWNewEntrants());
  }
  return players;
}

function eraOrder(checkEra, currentEra) {
  const order = ["ghosts", "advanced_warfare", "black_ops_3", "infinite_warfare", "wwii", "black_ops_4", "modern_warfare_2019"];
  return order.indexOf(checkEra) <= order.indexOf(currentEra);
}
