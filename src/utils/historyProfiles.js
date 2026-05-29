import { CDL_TEAMS } from "../data/teams.js";
import { isInactivePlayer } from "./playerIdentity.js";
import { resolveTeamDisplay } from "./teamDisplay.js";
import { placementRankValue, placementText } from "./placementDisplay.js";

export function kd(kills, deaths) {
  if (!deaths && !kills) return null;
  return deaths > 0 ? kills / deaths : kills;
}

export function kdText(kills, deaths) {
  const value = kd(kills, deaths);
  return value == null ? "—" : value.toFixed(2);
}

export function getSeriesResultText(match, teamId) {
  if (!match || !teamId) return "Not tracked yet";
  const won = match.winnerId === teamId;
  const lost = match.loserId === teamId;
  if (!won && !lost) return "Not tracked yet";
  const prefix = won ? "W" : "L";
  const score = typeof match.score === "string" && match.score.trim() ? match.score.trim() : null;
  const perspectiveScore = score && lost ? score.split("-").reverse().join("-") : score;
  const opponentId = won ? match.loserId : match.winnerId;
  const opponentName = won ? match.loserName : match.winnerName;
  const opponent = opponentName || opponentId;
  return `${prefix}${perspectiveScore ? ` ${perspectiveScore}` : ""}${opponent ? ` vs ${opponent}` : ""}`;
}

export function getMajorPlacementMap(major) {
  const bracket = major?.bracket;
  if (!bracket?.rounds?.length) return {};
  const placements = {};
  const claimed = new Set();
  const place = (teamId, p) => {
    if (!teamId || claimed.has(teamId)) return;
    placements[teamId] = p;
    claimed.add(teamId);
  };
  const gfRound = bracket.rounds.find(r => r.type === "GF") ?? bracket.rounds[bracket.rounds.length - 1];
  const gfMatch = gfRound?.matches?.[0];
  if (gfMatch?.played && gfMatch.result) {
    place(gfMatch.result.winnerId, 1);
    place(gfMatch.result.loserId, 2);
  } else if (bracket.champion) {
    place(bracket.champion, 1);
  }
  const lbFinalMatch = bracket.rounds.find(r => r.name === "LB Final")?.matches?.[0];
  if (lbFinalMatch?.played && lbFinalMatch.result) place(lbFinalMatch.result.loserId, 3);
  const lbR5Match = bracket.rounds.find(r => r.name === "LB Round 5")?.matches?.[0];
  if (lbR5Match?.played && lbR5Match.result) place(lbR5Match.result.loserId, 4);
  const bucketize = (roundName, places) => {
    const round = bracket.rounds.find(r => r.name === roundName);
    const losers = (round?.matches ?? [])
      .filter(m => m.played && m.result?.loserId)
      .map(m => m.result.loserId);
    losers.forEach((tid, i) => place(tid, places[Math.min(i, places.length - 1)]));
  };
  bucketize("LB Round 4", [5, 6]);
  bucketize("LB Round 3", [7, 8]);
  bucketize("LB Round 2", [9, 10, 11, 12]);
  bucketize("LB Round 1", [13, 14, 15, 16]);
  return placements;
}

function majorIndexFromName(name) {
  const m = String(name || "").match(/Major\s+(\d+)/i);
  return m ? Number(m[1]) - 1 : null;
}


function getMajorPlacementForTeam(state, season, majorIdx, teamId) {
  if (!teamId || majorIdx == null) return null;
  const major = state?.schedule?.majors?.[majorIdx];
  if (!major) return null;
  const award = (major.pointsAwards || []).find(a => a.teamId === teamId);
  if (award?.place != null) return award.place;
  const placements = getMajorPlacementMap(major);
  return placements[teamId] ?? null;
}

export function findPlayerEverywhere(state, ref) {
  if (!ref) return null;
  if (typeof ref === "object" && ref.id) return ref;
  const id = String(ref);
  const pools = [
    state?.players || [],
    state?.prospects || [],
    state?.retiredPlayers || [],
    ...(Object.values(state?.schedule?.currentMajorEventTeams || {}).map(t => t.players || [])),
  ];
  for (const pool of pools) {
    const found = pool.find(p => String(p.id) === id);
    if (found) return found;
  }
  for (const match of state?.schedule?.matchLog || []) {
    const stat = match.playerStats?.[id];
    if (stat) return { id, name: stat.name, teamId: stat.teamId, status: "historical" };
  }
  for (const tx of state?.challengerTransactions || []) {
    if (String(tx.playerId) === id) return { id, name: tx.playerName, teamId: tx.toTeamId ?? tx.fromTeamId ?? null, status: "historical" };
  }
  return null;
}

export function findTeamEverywhere(state, teamId) {
  const id = teamId;
  const cdl = CDL_TEAMS.find(t => t.id === id);
  if (cdl) return { ...cdl, circuit: "cdl" };
  const challenger = (state?.challengerTeams || []).find(t => t.id === id);
  if (challenger) return { ...challenger, circuit: "challengers" };
  const eventTeam = state?.schedule?.currentMajorEventTeams?.[id];
  if (eventTeam) return { ...eventTeam, circuit: eventTeam.source === "challengerQualifier" ? "challengers" : "event" };
  const qRow = (state?.schedule?.currentChallengerQualifier?.field || []).find(r => r.teamId === id);
  if (qRow) return { id: qRow.teamId, name: qRow.teamName, tag: qRow.tag, color: qRow.color, logo: qRow.logo, region: qRow.region, circuit: "challengers" };
  for (const result of state?.schedule?.challengerQualifierResults || []) {
    const row = (result.teams || []).find(r => r.teamId === id);
    if (row) return { id: row.teamId, name: row.teamName || row.teamId, tag: row.tag, region: row.region, circuit: "challengers" };
  }
  return id ? { id, name: id, tag: String(id).slice(0, 3).toUpperCase(), color: "#888", circuit: "unknown" } : null;
}

export function getPlayerCurrentStatus(player, state) {
  if (!player) return { label: "Unknown", team: null, teamId: null };
  if (player.status === "retired" || isInactivePlayer(player)) return { label: "Retired / inactive", team: null, teamId: null };
  if (player.teamId) {
    const team = resolveTeamDisplay(player.teamId, state?.schedule);
    return { label: `CDL · ${team.name}`, team, teamId: player.teamId };
  }
  if (player.challengerTeamId) {
    const team = findTeamEverywhere(state, player.challengerTeamId);
    return { label: `Challengers · ${team?.name ?? player.challengerTeamId}`, team, teamId: player.challengerTeamId };
  }
  if (player.isProspect) return { label: "Unsigned Challenger", team: null, teamId: null };
  return { label: "Unsigned Free Agent", team: null, teamId: null };
}

export function getTeamRoster(state, teamId) {
  const eventTeam = state?.schedule?.currentMajorEventTeams?.[teamId];
  if (eventTeam?.players) return eventTeam.players;
  const cdl = CDL_TEAMS.some(t => t.id === teamId);
  if (cdl) return (state?.players || []).filter(p => p.teamId === teamId);
  const team = (state?.challengerTeams || []).find(t => t.id === teamId);
  if (!team) return [];
  const all = [...(state?.prospects || []), ...(state?.players || [])];
  return (team.playerIds || []).map(pid => all.find(p => p.id === pid)).filter(Boolean);
}

export function buildPlayerHistory(state, player) {
  if (!state || !player) return { seasons: [], summary: {}, events: [] };
  const id = String(player.id);
  const seasonMap = new Map();
  const events = [];
  const ensureSeason = (season) => {
    const s = Number(season || state.season || 1);
    if (!seasonMap.has(s)) seasonMap.set(s, { season: s, kills: 0, deaths: 0, matches: 0, maps: 0, teams: new Set(), roles: new Set(), events: [] });
    return seasonMap.get(s);
  };

  for (const h of (state.playerSeasonStats?.[id] || [])) {
    const row = ensureSeason(h.season);
    row.kills += h.kills || 0;
    row.deaths += h.deaths || 0;
    row.matches += h.matches || 0;
    row.events.push({ eventName: `Season ${h.season} archived total`, eventType: "season", teamId: null, maps: null, kills: h.kills || 0, deaths: h.deaths || 0, placement: "Not tracked yet" });
  }

  for (const match of state.schedule?.matchLog || []) {
    const ps = match.playerStats?.[id];
    if (!ps) continue;
    const season = match.season ?? state.schedule?.season ?? state.season;
    const row = ensureSeason(season);
    const maps = match.mapResults?.length || 0;
    row.kills += ps.kills || 0;
    row.deaths += ps.deaths || 0;
    row.matches += 1;
    row.maps += maps;
    if (ps.teamId) row.teams.add(ps.teamId);
    if (player.primary) row.roles.add(player.primary);
    const event = {
      season,
      eventName: match.stage || "Match",
      eventType: String(match.stage || "").includes("Major") ? "major" : String(match.stage || "").includes("Champs") ? "champs" : "stage",
      teamId: ps.teamId,
      teamName: resolveTeamDisplay(ps.teamId, state.schedule).name,
      role: player.primary,
      maps,
      kills: ps.kills || 0,
      deaths: ps.deaths || 0,
      kd: kd(ps.kills || 0, ps.deaths || 0),
      hpKd: null,
      sndKd: null,
      overloadKd: null,
      result: getSeriesResultText(match, ps.teamId),
      placement: "Not tracked yet",
    };
    if (event.eventType === "major") {
      const majorIdx = majorIndexFromName(match.stage);
      const place = getMajorPlacementForTeam(state, season, majorIdx, ps.teamId);
      if (place != null) event.placement = placementText(place);
    }
    row.events.push(event);
    events.push(event);
  }

  for (const q of state.schedule?.challengerQualifierResults || []) {
    const season = q.season ?? state.season;
    for (const qMatch of q.matchLog || []) {
      const result = qMatch.result || qMatch;
      const ps = result.playerStats?.[id];
      if (!ps) continue;
      const teamId = ps.teamId || (result.winnerId === qMatch.winnerId ? qMatch.winnerId : null);
      const qr = (q.teams || []).find(r => r.teamId === teamId || r.rosterIds?.map(String).includes(id));
      const row = ensureSeason(season);
      if (teamId || qr?.teamId) row.teams.add(teamId || qr.teamId);
      const maps = result.mapResults?.length || 0;
      row.kills += ps.kills || 0;
      row.deaths += ps.deaths || 0;
      row.matches += 1;
      row.maps += maps;
      const event = {
        season,
        eventName: `Major ${Number(q.majorIdx ?? 0) + 1} Qualifier — ${qMatch.roundName || "Match"}`,
        eventType: "challengerQualifier",
        teamId: teamId || qr?.teamId,
        teamName: qr?.teamName || findTeamEverywhere(state, teamId || qr?.teamId)?.name,
        role: player.primary,
        maps,
        kills: ps.kills || 0,
        deaths: ps.deaths || 0,
        kd: kd(ps.kills || 0, ps.deaths || 0),
        result: getSeriesResultText(result, teamId || qr?.teamId),
        placement: placementText(qr?.placement),
      };
      row.events.push(event);
      events.push(event);
    }
  }

  for (const tx of state.challengerTransactions || []) {
    if (String(tx.playerId) !== id) continue;
    const row = ensureSeason(tx.season);
    const teamId = tx.toTeamId ?? tx.fromTeamId ?? null;
    if (teamId) row.teams.add(teamId);
    row.events.push({ season: tx.season, eventName: tx.type?.replaceAll("_", " ") || "Roster move", eventType: "transaction", teamId, teamName: findTeamEverywhere(state, teamId)?.name, maps: null, kills: null, deaths: null, placement: tx.note || "Roster move" });
  }

  for (const th of player.teamHistory || []) {
    const row = ensureSeason(th.season);
    if (th.teamId) row.teams.add(th.teamId);
  }

  const seasons = [...seasonMap.values()].sort((a, b) => a.season - b.season);
  const teamIds = new Set();
  seasons.forEach(s => s.teams.forEach(t => teamIds.add(t)));
  const kills = seasons.reduce((sum, s) => sum + s.kills, 0);
  const deaths = seasons.reduce((sum, s) => sum + s.deaths, 0);
  const maps = seasons.reduce((sum, s) => sum + s.maps, 0);
  const majorAppearances = events.filter(e => e.eventType === "major").length;
  const champsAppearances = events.filter(e => e.eventType === "champs").length;
  const challengerQualifierAppearances = events.filter(e => e.eventType === "challengerQualifier").length;
  const majorPlaces = events
    .filter(e => e.eventType === "major" && e.placement && e.placement !== "Not tracked yet")
    .map(e => ({ text: e.placement, value: placementRankValue(e.placement) }))
    .filter(e => Number.isFinite(e.value));
  const bestMajor = majorPlaces.length ? majorPlaces.sort((a, b) => a.value - b.value)[0].text : "Not tracked yet";
  const cqPlaces = events
    .filter(e => e.eventType === "challengerQualifier" && e.placement && e.placement !== "Not tracked yet")
    .map(e => ({ text: e.placement, value: placementRankValue(e.placement) }))
    .filter(e => Number.isFinite(e.value));
  const bestCQ = cqPlaces.length ? cqPlaces.sort((a, b) => a.value - b.value)[0].text : "Not tracked yet";
  return {
    seasons,
    events,
    summary: { seasonsPlayed: seasons.length, teamsPlayed: teamIds.size, maps, kills, deaths, kd: kd(kills, deaths), majorAppearances, champsAppearances, challengerQualifierAppearances, bestMajor, bestCQ },
  };
}

export function buildTeamHistory(state, teamId) {
  if (!state || !teamId) return { seasons: [], current: {} };
  const seasonMap = new Map();
  const ensureSeason = (season) => {
    const s = Number(season || state.season || 1);
    if (!seasonMap.has(s)) seasonMap.set(s, { season: s, wins: 0, losses: 0, maps: 0, kills: 0, deaths: 0, events: [], rosterIds: new Set() });
    return seasonMap.get(s);
  };
  for (const match of state.schedule?.matchLog || []) {
    if (match.winnerId !== teamId && match.loserId !== teamId && match.teamAId !== teamId && match.teamBId !== teamId) continue;
    const row = ensureSeason(match.season ?? state.season);
    if (match.winnerId === teamId) row.wins += 1;
    if (match.loserId === teamId) row.losses += 1;
    row.maps += match.mapResults?.length || 0;
    for (const [pid, ps] of Object.entries(match.playerStats || {})) {
      if (ps.teamId !== teamId) continue;
      row.kills += ps.kills || 0;
      row.deaths += ps.deaths || 0;
      row.rosterIds.add(pid);
    }
    row.events.push({ eventName: match.stage || "Match", result: getSeriesResultText(match, teamId), score: match.score, maps: match.mapResults?.length || 0 });
  }
  for (const q of state.schedule?.challengerQualifierResults || []) {
    const qr = (q.teams || []).find(r => r.teamId === teamId);
    if (!qr) continue;
    const row = ensureSeason(q.season);
    row.events.push({ eventName: `Major ${Number(q.majorIdx ?? 0) + 1} Qualifier`, result: `${placementText(qr.placement)}, ${qr.qualified ? "Qualified" : "Missed"}`, placement: placementText(qr.placement), circuitPoints: qr.circuitPointsAwarded ?? 0 });
  }
  for (const [majorIdx, major] of (state.schedule?.majors || []).entries()) {
    const award = (major.pointsAwards || []).find(a => a.teamId === teamId);
    const bracketPlace = getMajorPlacementMap(major)[teamId];
    const place = award?.place ?? bracketPlace;
    if (place == null) continue;
    const row = ensureSeason(state.season);
    const pointsText = award ? ` · +${award.points || 0} pts` : " · played Major bracket";
    row.events.push({ eventName: major.name || `Major ${majorIdx + 1}`, result: `${placementText(place)}${pointsText}`, placement: placementText(place), cdlPoints: award?.points || 0 });
  }
  const roster = getTeamRoster(state, teamId);
  const currentRec = state.schedule?.standings?.[teamId] ?? { wins: 0, losses: 0, points: 0 };
  const seasons = [...seasonMap.values()].sort((a, b) => a.season - b.season);
  return { seasons, current: { roster, record: currentRec } };
}
