// src/data/historicalPlayerRegistry.js
// Unified historical player registry for Cod Dynasty.
// Each player has a stable canonical ID used across all eras to prevent duplicates.

function slug(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

// Canonical ID: always derived from player gamertag, stable across eras.
export function canonicalPlayerId(name) {
  return `hist_${slug(name)}`;
}

// Alias map for players whose name changed between eras.
const ALIASES = {
  methodz: "methodz",
  MethodZ: "methodz",
  Methodz: "methodz",
};

export function resolvePlayerName(name) {
  return ALIASES[name] || name;
}

// Check if a player already exists in the current save state.
export function playerExistsInSave(state, name) {
  const canonical = canonicalPlayerId(resolvePlayerName(name));
  const allPlayers = [...(state.players || []), ...(state.prospects || [])];
  return allPlayers.some(p => p.id === canonical || canonicalPlayerId(p.name) === canonical);
}

// Get existing player from save by canonical name lookup.
export function findExistingPlayer(state, name) {
  const canonical = canonicalPlayerId(resolvePlayerName(name));
  const allPlayers = [...(state.players || []), ...(state.prospects || [])];
  return allPlayers.find(p => p.id === canonical || canonicalPlayerId(p.name) === canonical) || null;
}
