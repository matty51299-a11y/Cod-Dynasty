import { CDL_TEAMS } from "../data/teams.js";

const NAME_ALIASES = {
  reeal: "reeal",
  mythix: "mythix",
  mythixx: "mythix",
  snoopy: "snoopy",
  abe: "abe",
  dk: "dkxrryy",
};

export function normalizePlayerName(name = "") {
  const normalized = String(name)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return NAME_ALIASES[normalized] ?? normalized;
}

export function isInactivePlayer(player) {
  const status = String(player?.status ?? "").toLowerCase();
  return status === "inactive" || status === "retired" || status === "duplicate_hidden";
}

export function isCdlTeamId(teamId) {
  return CDL_TEAMS.some((team) => team.id === teamId);
}

export function buildCdlRosterNameSet(players = []) {
  return new Set(
    (players || [])
      .filter((player) => player?.teamId && isCdlTeamId(player.teamId) && !isInactivePlayer(player))
      .map((player) => normalizePlayerName(player.name))
      .filter(Boolean)
  );
}

function activeLocation(player, challengerTeamIds = new Set()) {
  if (!player || isInactivePlayer(player)) return null;
  if (player.teamId && isCdlTeamId(player.teamId)) return "cdl";
  if (player.challengerTeamId || challengerTeamIds.has(player.id)) return "challenger";
  if (player.teamId) return "assigned";
  return "unsigned";
}

function priorityFor(player, location) {
  if (location === "cdl") return 400000 + (player.overall ?? 0);
  if (location === "challenger") return 300000 + (player.overall ?? 0) * 100 + (player.potential ?? 0);
  if (location === "unsigned") return 200000 + (player.overall ?? 0) * 100 + (player.potential ?? 0);
  return 100000 + (player.overall ?? 0);
}

export function buildActivePlayerNameIndex(state = {}) {
  const challengerTeamIds = new Set((state.challengerTeams || []).flatMap((team) => team.playerIds || []));
  const rows = [
    ...(state.players || []).map((player) => ({ player, source: "players" })),
    ...(state.prospects || []).map((player) => ({ player, source: "prospects" })),
  ];
  const index = new Map();
  for (const row of rows) {
    const key = normalizePlayerName(row.player?.name);
    const location = activeLocation(row.player, challengerTeamIds);
    if (!key || !location) continue;
    const entry = { ...row, key, location, priority: priorityFor(row.player, location) };
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(entry);
  }
  for (const entries of index.values()) {
    entries.sort((a, b) => b.priority - a.priority);
  }
  return index;
}

export function findDuplicateActivePlayers(state = {}) {
  return [...buildActivePlayerNameIndex(state).entries()]
    .filter(([, entries]) => entries.length > 1)
    .map(([normalizedName, entries]) => ({ normalizedName, winner: entries[0], duplicates: entries.slice(1), entries }));
}

export function shouldExcludeFromChallengers(player, cdlNames, assignedIds = new Set(), usedNames = new Set()) {
  const key = normalizePlayerName(player?.name);
  if (!key || isInactivePlayer(player)) return true;
  if (player?.teamId && isCdlTeamId(player.teamId)) return true;
  if (cdlNames?.has(key)) return true;
  if (assignedIds?.has(player?.id)) return true;
  if (usedNames?.has(key)) return true;
  return false;
}
