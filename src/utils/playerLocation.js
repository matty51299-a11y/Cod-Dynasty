const KNOWN_ALIASES = {
  formal: ["formal", "formal", "forml"],
  crimsix: ["crimsix", "c6"],
};

export function normalizePlayerSearch(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function playerNames(player) {
  const names = [player?.displayName, player?.name, player?.id, player?.playerId, ...(player?.aliases || [])].filter(Boolean);
  const base = normalizePlayerSearch(player?.displayName || player?.name || player?.playerId || player?.id);
  for (const alias of KNOWN_ALIASES[base] || []) names.push(alias);
  if (base === "formal") names.push("FormaL", "Formal");
  if (base === "crimsix") names.push("Crimsix", "C6");
  return [...new Set(names)];
}

export function playerMatchesQuery(player, query) {
  const q = normalizePlayerSearch(query);
  if (!q) return false;
  return playerNames(player).some(name => normalizePlayerSearch(name).includes(q) || q.includes(normalizePlayerSearch(name)));
}

function statusKey(status) {
  const normalized = String(status || "").toLowerCase().replace(/[^a-z0-9]+/g, "_");
  if (normalized === "freeagent") return "free_agent";
  if (["active", "free_agent", "inactive", "retired", "missing"].includes(normalized)) return normalized;
  return "missing";
}

export function getPlayerStatus(player, assignments = []) {
  if (assignments.length) return "active";
  if (!player) return "missing";
  if (!player.teamId && !player.currentTeamId) return statusKey(player.currentStatus || player.status || "free_agent");
  return statusKey(player.currentStatus || player.status || "active");
}

export function getTeamRoster(state, teamId) {
  return (state?.players || []).filter(p => p.teamId === teamId || p.currentTeamId === teamId);
}

export function getTeamOvr(state, teamId) {
  const roster = getTeamRoster(state, teamId);
  if (!roster.length) return 0;
  return Math.round(roster.reduce((sum, p) => sum + (p.overall || 0), 0) / roster.length);
}

export function findPlayerLocation(state, playerIdOrName) {
  const teamsById = new Map((state?.teams || []).map(t => [t.id, t]));
  const registryPlayers = Object.values(state?.playerRegistry || {});
  const allPlayers = [...(state?.players || []), ...(state?.freeAgents || []), ...(state?.inactivePlayers || []), ...(state?.retiredPlayers || []), ...registryPlayers];
  const unique = new Map();
  for (const player of allPlayers) if (player?.id && !unique.has(player.id)) unique.set(player.id, player);
  const matches = [...unique.values()].filter(p => playerMatchesQuery(p, playerIdOrName));
  const player = matches[0] || null;
  if (!player) return { found: false, query: playerIdOrName, status: "missing", assignments: [], duplicateAssignments: [], notes: ["No matching player found in active rosters, pools, retired lists, or registry."] };
  const ids = new Set([player.id, player.playerId].filter(Boolean));
  const names = new Set(playerNames(player).map(normalizePlayerSearch));
  const assignments = (state?.players || [])
    .filter(p => p.teamId && (ids.has(p.id) || ids.has(p.playerId) || names.has(normalizePlayerSearch(p.displayName || p.name))))
    .map(p => ({ playerId: p.id, displayName: p.displayName || p.name, teamId: p.teamId, teamName: teamsById.get(p.teamId)?.name || p.teamId, role: p.role || p.primary, overall: p.overall, potential: p.potential }));
  const duplicateAssignments = assignments.length > 1 ? assignments : [];
  const status = getPlayerStatus(player, assignments);
  return {
    found: true,
    playerId: player.id,
    displayName: player.displayName || player.name,
    status,
    currentTeamId: assignments[0]?.teamId || null,
    currentTeamName: assignments[0]?.teamName || (status === "free_agent" ? "Free Agency" : status),
    role: player.role || player.primary,
    overall: player.overall,
    potential: player.potential,
    confidence: player.confidence,
    assignments,
    duplicateAssignments,
    notes: duplicateAssignments.length ? ["Duplicate active assignments detected."] : [],
  };
}

export function searchPlayers(state, query) {
  if (!query) return [];
  const registryPlayers = Object.values(state?.playerRegistry || {});
  const all = [...(state?.players || []), ...(state?.freeAgents || []), ...(state?.inactivePlayers || []), ...(state?.retiredPlayers || []), ...registryPlayers];
  const seen = new Set();
  return all.filter(p => p?.id && !seen.has(p.id) && seen.add(p.id) && playerMatchesQuery(p, query)).map(p => findPlayerLocation(state, p.displayName || p.name || p.id));
}

export function auditPlayerStatuses(state) {
  return Object.values(state?.playerRegistry || {}).filter(p => !["active", "free_agent", "inactive", "retired"].includes(getPlayerStatus(p, findPlayerLocation(state, p.id).assignments)));
}
