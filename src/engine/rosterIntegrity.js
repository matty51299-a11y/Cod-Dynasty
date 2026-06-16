import { getEra } from "../data/codEras.js";

const REQUIRED_PLAYERS = 4;

function slug(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function playerName(player) {
  return player?.displayName || player?.name || player?.id || "";
}

function normalizedIdentity(player) {
  return slug(playerName(player));
}

function hashString(str) {
  let h = 2166136261;
  for (const ch of String(str || "")) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function eraAllowed(player, eraId) {
  const debut = player.debutEraId || player.eraId;
  if (!debut) return true;
  const order = ["ghosts", "advanced_warfare", "black_ops_3", "infinite_warfare", "wwii", "black_ops_4", "modern_warfare"];
  const p = order.indexOf(debut);
  const e = order.indexOf(eraId);
  return p === -1 || e === -1 ? debut === eraId : p <= e;
}

function teamActiveIds(state) {
  return new Set(state.activeTeams?.length ? state.activeTeams : (state.teams || []).map(t => t.id));
}

function makeReplacement(teamId, eraId, ordinal) {
  const h = hashString(`${eraId}|${teamId}|${ordinal}`);
  const overall = 65 + (h % 6);
  const name = `Replacement Player ${ordinal}`;
  return {
    id: `replacement_${eraId}_${slug(teamId)}_${ordinal}_${h.toString(16)}`,
    name,
    displayName: name,
    teamId,
    age: 19 + (h % 8),
    primary: ["Main AR", "Slayer SMG", "Objective", "Flex"][ordinal % 4],
    role: ["Main AR", "Slayer SMG", "Objective", "Flex"][ordinal % 4],
    region: "NA",
    salary: 50000,
    overall,
    potential: overall + 3,
    gunny: overall,
    awareness: overall,
    objective: overall,
    searchIQ: overall,
    sndIQ: overall,
    clutch: overall,
    teamwork: overall,
    composure: overall,
    adaptability: overall,
    contractYears: 1,
    eraId,
    debutEraId: eraId,
    status: "active",
    currentStatus: "active",
    confidence: "Low",
    researchNotes: "Emergency roster integrity filler",
    ratingSource: "emergency_roster_integrity_filler",
  };
}

function rebuildFreeAgents(players, eraId) {
  const seen = new Set();
  return players.filter(p => {
    if (p.teamId) return false;
    if (p.currentStatus === "inactive" || p.status === "inactive" || p.status === "retired") return false;
    if (!eraAllowed(p, eraId)) return false;
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  }).map(p => ({ ...p, teamId: null, status: "freeAgent", currentStatus: "freeAgent" }));
}

export function getControlledTeamId(state) {
  const active = teamActiveIds(state || {});
  const candidate = state?.currentUserTeamId || state?.controlledTeamId || state?.userTeamId;
  if (candidate && active.has(candidate)) return candidate;
  if (state?.userTeamId && active.has(state.userTeamId)) return state.userTeamId;
  return candidate || null;
}

export function isUserTeamMatch(match, stateOrTeamId) {
  const userTeamId = typeof stateOrTeamId === "string" ? stateOrTeamId : getControlledTeamId(stateOrTeamId);
  if (!match || !userTeamId || match.status !== "pending" || !match.teamA?.teamId || !match.teamB?.teamId) return false;
  return match.teamA.teamId === userTeamId || match.teamB.teamId === userTeamId;
}

export function ensureFourPlayerRosters(state, eraId = state?.currentEraId || "ghosts") {
  if (!state) return state;
  const activeIds = teamActiveIds(state);
  let players = (state.players || []).map(p => ({ ...p }));
  const diagnostics = [];
  const duplicateResolutionRows = [...(state.duplicatePlayerResolutionRows || [])];
  const controlledTeamId = getControlledTeamId(state);
  const teamName = (teamId) => (state.teams || []).find(t => t.id === teamId)?.name || teamId || "Free Agency";

  const chooseKeeper = (group) => {
    const userOwned = group.find(p => p.teamId === controlledTeamId);
    if (userOwned) return userOwned;
    return [...group].sort((a,b) => {
      const aEra = Number((a.eraId || a.debutEraId) === eraId);
      const bEra = Number((b.eraId || b.debutEraId) === eraId);
      return bEra - aEra || (b.overall || 0) - (a.overall || 0) || String(a.teamId).localeCompare(String(b.teamId));
    })[0];
  };

  const resolveActiveGroup = (key, group, reason) => {
    const activeGroup = group.filter(p => p.teamId && activeIds.has(p.teamId));
    const uniqueTeams = [...new Set(activeGroup.map(p => p.teamId))];
    if (activeGroup.length <= 1 || uniqueTeams.length <= 1) return;
    const kept = chooseKeeper(activeGroup);
    const removed = activeGroup.filter(p => p !== kept);
    const replacements = [];
    duplicateResolutionRows.push({
      eraId,
      playerId: kept.id,
      displayName: playerName(kept),
      conflictingTeams: uniqueTeams.map(teamName).join("; "),
      keptTeam: teamName(kept.teamId),
      removedFromTeams: [...new Set(removed.map(p => p.teamId))].map(teamName).join("; "),
      resolutionReason: kept.teamId === controlledTeamId ? "preserved_on_user_roster" : reason,
      replacementPlayersAdded: replacements,
      needsManualReview: false,
    });
    diagnostics.push(`Duplicate active ${reason} resolved for ${playerName(kept)} (${key}); kept ${teamName(kept.teamId)}`);
    const removedObjects = new Set(removed);
    players = players.map(p => removedObjects.has(p)
      ? { ...p, previousTeamId: p.teamId, teamId: null, status: "freeAgent", currentStatus: "freeAgent", contractYears: 0, duplicateResolvedFromTeamId: p.teamId }
      : p.teamId && activeIds.has(p.teamId) ? { ...p, status: "active", currentStatus: "active" } : p);
  };

  // De-duplicate active player ids and suspicious display-name/alias clones.
  const byId = new Map();
  for (const p of players) {
    if (!p.teamId || !activeIds.has(p.teamId)) continue;
    byId.set(p.id, [...(byId.get(p.id) || []), p]);
  }
  for (const [id, group] of byId) resolveActiveGroup(id, group, "duplicate_player_id");

  const byName = new Map();
  for (const p of players) {
    if (!p.teamId || !activeIds.has(p.teamId)) continue;
    const keys = new Set([normalizedIdentity(p), ...(p.aliases || []).map(slug)].filter(Boolean));
    for (const key of keys) byName.set(key, [...(byName.get(key) || []), p]);
  }
  for (const [key, group] of byName) {
    if (new Set(group.map(p => p.id)).size > 1) resolveActiveGroup(key, group, "duplicate_display_name_or_alias");
  }

  let replacementOrdinal = 1;
  for (const teamId of activeIds) {
    let roster = players.filter(p => p.teamId === teamId);
    if (roster.length > REQUIRED_PLAYERS) {
      const keep = new Set([...roster].sort((a,b) => (b.overall || 0) - (a.overall || 0) || String(a.name).localeCompare(String(b.name))).slice(0, REQUIRED_PLAYERS).map(p => p.id));
      players = players.map(p => p.teamId === teamId && !keep.has(p.id) ? { ...p, previousTeamId: teamId, teamId: null, status: "freeAgent", currentStatus: "freeAgent", contractYears: 0 } : p);
      diagnostics.push(`${teamId} trimmed to best 4; extras moved to Free Agency`);
    }
    while (players.filter(p => p.teamId === teamId).length < REQUIRED_PLAYERS) {
      const fa = players
        .filter(p => {
          if (p.teamId || !eraAllowed(p, eraId) || p.status === "retired" || p.currentStatus === "inactive") return false;
          const candidateName = normalizedIdentity(p);
          return !players.some(active => active.teamId && activeIds.has(active.teamId) && active.id !== p.id && normalizedIdentity(active) === candidateName);
        })
        .sort((a,b) => {
          const sameEra = Number((b.eraId || b.debutEraId) === eraId) - Number((a.eraId || a.debutEraId) === eraId);
          const displaced = Number(Boolean(b.previousTeamId)) - Number(Boolean(a.previousTeamId));
          return sameEra || displaced || (b.overall || 0) - (a.overall || 0);
        })[0];
      if (fa) {
        players = players.map(p => p.id === fa.id ? { ...p, teamId, status: "active", currentStatus: "active", contractYears: Math.max(p.contractYears || 0, 1) } : p);
        const latest = duplicateResolutionRows[duplicateResolutionRows.length - 1];
        if (latest && !latest.replacementPlayersAdded.includes(fa.id)) latest.replacementPlayersAdded.push(fa.id);
      } else {
        const replacement = makeReplacement(teamId, eraId, replacementOrdinal++);
        diagnostics.push(`Emergency replacement created for ${teamId}: ${replacement.name}`);
        players = [...players, replacement];
        const latest = duplicateResolutionRows[duplicateResolutionRows.length - 1];
        if (latest) latest.replacementPlayersAdded.push(replacement.id);
      }
    }
  }
  const freeAgents = rebuildFreeAgents(players, eraId);
  const playerRegistry = { ...(state.playerRegistry || {}) };
  for (const p of players) playerRegistry[p.id] = { ...(playerRegistry[p.id] || {}), ...p, currentStatus: p.teamId ? "active" : (p.currentStatus || p.status || "freeAgent"), currentTeamId: p.teamId || null };
  return { ...state, players, freeAgents, playerRegistry, duplicatePlayerResolutionRows: duplicateResolutionRows, rosterIntegrityWarnings: diagnostics };
}

export function validateUniqueActivePlayers(state, eraId = state?.currentEraId || "ghosts") {
  return getRosterIntegrityProblems(state, eraId).length === 0;
}

export function getRosterIntegrityProblems(state, eraId = state?.currentEraId || "ghosts") {
  const activeIds = teamActiveIds(state || {});
  const problems = [];
  for (const teamId of activeIds) {
    const count = (state.players || []).filter(p => p.teamId === teamId).length;
    if (count !== REQUIRED_PLAYERS) problems.push(`${teamId} has ${count}/${REQUIRED_PLAYERS} players`);
  }
  const seen = new Set();
  const names = new Map();
  for (const p of state.players || []) {
    if (!p.teamId || !activeIds.has(p.teamId)) continue;
    if (seen.has(p.id)) problems.push(`duplicate active player ${p.id}`);
    seen.add(p.id);
    const nameKey = normalizedIdentity(p);
    if (nameKey && names.has(nameKey) && names.get(nameKey).id !== p.id) problems.push(`suspicious duplicate active display name ${playerName(p)} on ${names.get(nameKey).teamId} and ${p.teamId}`);
    if (nameKey) names.set(nameKey, p);
  }
  for (const p of state.freeAgents || []) if (!eraAllowed(p, eraId)) problems.push(`future player in FA ${p.id}`);
  return problems;
}
