import { CDL_TEAMS } from "../data/teams.js";
import { placementText } from "./placementDisplay.js";
import { resolveTeamDisplay } from "./teamDisplay.js";

function kd(kills, deaths) {
  if (!deaths && !kills) return null;
  return deaths > 0 ? kills / deaths : kills;
}

function upsertBySeasonAndId(rows, snapshot, idKey) {
  const list = Array.isArray(rows) ? rows.filter(Boolean) : [];
  const idx = list.findIndex(r => Number(r?.season) === Number(snapshot.season) && String(r?.[idKey]) === String(snapshot[idKey]));
  if (idx >= 0) {
    const next = [...list];
    next[idx] = snapshot;
    return next;
  }
  return [...list, snapshot];
}

function getSeriesResultText(match, teamId) {
  if (!match || !teamId) return "Not tracked yet";
  const won = match.winnerId === teamId;
  const lost = match.loserId === teamId;
  if (!won && !lost) return "Not tracked yet";
  const prefix = won ? "W" : "L";
  const score = typeof match.score === "string" && match.score.trim() ? match.score.trim() : null;
  const perspectiveScore = score && lost ? score.split("-").reverse().join("-") : score;
  const opponent = won ? (match.loserName || match.loserId) : (match.winnerName || match.winnerId);
  return `${prefix}${perspectiveScore ? ` ${perspectiveScore}` : ""}${opponent ? ` vs ${opponent}` : ""}`;
}

function computeDEPlacements(bracket) {
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
  const bucketize = (roundName, places) => {
    const round = bracket.rounds.find(r => r.name === roundName);
    const losers = (round?.matches ?? []).filter(m => m.played && m.result?.loserId).map(m => m.result.loserId);
    losers.forEach((tid, i) => place(tid, places[Math.min(i, places.length - 1)]));
  };
  const lbFinal = bracket.rounds.find(r => r.name === "LB Final")?.matches?.[0];
  if (lbFinal?.played && lbFinal.result) place(lbFinal.result.loserId, 3);
  const lbR5 = bracket.rounds.find(r => r.name === "LB Round 5")?.matches?.[0];
  if (lbR5?.played && lbR5.result) place(lbR5.result.loserId, 4);
  bucketize("LB Round 4", [5, 6]);
  bucketize("LB Round 3", [7, 8]);
  bucketize("LB Round 2", [9, 10, 11, 12]);
  bucketize("LB Round 1", [13, 14, 15, 16]);
  return placements;
}

function computeSingleElimPlacements(bracket) {
  if (!bracket?.rounds?.length) return {};
  const placements = {};
  const claimed = new Set();
  const place = (teamId, p) => {
    if (!teamId || claimed.has(teamId)) return;
    placements[teamId] = p;
    claimed.add(teamId);
  };
  const final = bracket.rounds.find(r => r.name === "Grand Final")?.matches?.[0] ?? bracket.rounds.at(-1)?.matches?.[0];
  if (final?.played && final.result) {
    place(final.result.winnerId, 1);
    place(final.result.loserId, 2);
  } else if (bracket.champion) {
    place(bracket.champion, 1);
  }
  const semis = bracket.rounds.find(r => r.name === "Semifinals")?.matches ?? [];
  semis.filter(m => m.played && m.result?.loserId).forEach((m, i) => place(m.result.loserId, 3 + i));
  const quarters = bracket.rounds.find(r => r.name === "Quarterfinals")?.matches ?? [];
  quarters.filter(m => m.played && m.result?.loserId).forEach((m, i) => place(m.result.loserId, 5 + i));
  return placements;
}

function getMajorPlacement(major, teamId) {
  if (!major || !teamId) return null;
  const award = (major.pointsAwards || []).find(a => a.teamId === teamId);
  if (award?.place != null) return award.place;
  const placements = major.bracket?.type === "DE16" ? computeDEPlacements(major.bracket) : computeSingleElimPlacements(major.bracket);
  return placements[teamId] ?? null;
}

function getMatchesForTeam(matchLog, teamId, predicate = () => true) {
  return (matchLog || []).filter(m => predicate(m) && (m.winnerId === teamId || m.loserId === teamId || m.teamAId === teamId || m.teamBId === teamId));
}

function summarizeTeamMatches(matches, teamId) {
  const out = { wins: 0, losses: 0, maps: 0, kills: 0, deaths: 0 };
  for (const match of matches) {
    if (match.winnerId === teamId) out.wins += 1;
    if (match.loserId === teamId) out.losses += 1;
    out.maps += match.mapResults?.length || 0;
    for (const ps of Object.values(match.playerStats || {})) {
      if (ps.teamId !== teamId) continue;
      out.kills += ps.kills || 0;
      out.deaths += ps.deaths || 0;
    }
  }
  return { ...out, avgKd: kd(out.kills, out.deaths) };
}

function resolveArchivedTeam(state, teamId) {
  const schedule = state.schedule || {};
  const display = resolveTeamDisplay(teamId, schedule);
  if (display?.name && display.name !== teamId) return display;
  const challenger = (state.challengerTeams || []).find(t => t.id === teamId);
  if (challenger) return { ...display, ...challenger };
  for (const q of schedule.challengerQualifierResults || []) {
    const row = (q.teams || []).find(r => r.teamId === teamId);
    if (row) return { ...display, id: teamId, name: row.teamName || teamId, tag: row.tag || display.tag, color: row.color || display.color, logo: row.logo || display.logo };
  }
  return display;
}

function makeTeamSnapshot(state, teamId, season) {
  const schedule = state.schedule || {};
  const team = resolveArchivedTeam(state, teamId);
  const allPlayers = [...(state.players || []), ...(state.prospects || []), ...(state.retiredPlayers || [])];
  const roster = allPlayers.filter(p => p.teamId === teamId || p.challengerTeamId === teamId || (state.challengerTeams || []).find(t => t.id === teamId)?.playerIds?.includes(p.id));
  const seasonMatches = getMatchesForTeam(schedule.matchLog, teamId);
  const totals = summarizeTeamMatches(seasonMatches, teamId);
  const standingsRecord = schedule.standings?.[teamId];
  const majors = (schedule.majors || []).slice(0, 4).map((major, idx) => {
    const majorMatches = getMatchesForTeam(schedule.matchLog, teamId, m => String(m.stage || "").startsWith(`Major ${idx + 1}`));
    const summary = summarizeTeamMatches(majorMatches, teamId);
    const award = (major.pointsAwards || []).find(a => a.teamId === teamId);
    const placement = getMajorPlacement(major, teamId);
    return {
      majorIdx: idx + 1,
      placement: placement != null ? placementText(placement) : null,
      place: placement,
      pointsAwarded: award?.points || 0,
      record: { wins: summary.wins, losses: summary.losses },
      avgKd: summary.avgKd,
    };
  });
  const champsMajor = schedule.majors?.[4];
  const champsPlace = getMajorPlacement(champsMajor, teamId);
  const champsMatches = getMatchesForTeam(schedule.matchLog, teamId, m => String(m.stage || "").includes("Champs"));
  const champsSummary = summarizeTeamMatches(champsMatches, teamId);
  const qResults = (schedule.challengerQualifierResults || [])
    .map(q => ({ q, row: (q.teams || []).find(r => r.teamId === teamId) }))
    .filter(x => x.row)
    .map(({ q, row }) => ({
      majorIdx: Number(q.majorIdx ?? 0) + 1,
      placement: placementText(row.placement),
      place: row.placement,
      qualified: !!row.qualified,
      circuitPoints: row.circuitPointsAwarded ?? 0,
      record: { wins: row.wins ?? 0, losses: row.losses ?? 0 },
      avgKd: row.avgKd ?? null,
    }));
  return {
    season,
    teamId,
    teamName: team.name || teamId,
    tag: team.tag || String(teamId).slice(0, 3).toUpperCase(),
    record: {
      wins: standingsRecord?.wins ?? totals.wins,
      losses: standingsRecord?.losses ?? totals.losses,
    },
    points: standingsRecord?.points ?? team.circuitPoints ?? 0,
    totalRecord: { wins: totals.wins, losses: totals.losses },
    avgKd: totals.avgKd,
    kills: totals.kills,
    deaths: totals.deaths,
    maps: totals.maps,
    rosterPlayerIds: roster.map(p => p.id),
    roster: roster.map(p => ({ id: p.id, name: p.name, role: p.primary || p.role || null, overall: p.overall ?? null })),
    majors,
    champs: champsPlace != null || champsMatches.length ? {
      placement: champsPlace != null ? placementText(champsPlace) : null,
      place: champsPlace,
      record: { wins: champsSummary.wins, losses: champsSummary.losses },
      avgKd: champsSummary.avgKd,
    } : null,
    challengerQualifiers: qResults,
    events: [
      ...qResults.map(q => ({ eventName: `Major ${q.majorIdx} Qualifier`, eventType: "challengerQualifier", result: `${q.placement}${q.qualified ? ", Qualified" : ", Missed"}`, placement: q.placement })),
      ...majors.filter(m => m.placement).map(m => ({ eventName: `Major ${m.majorIdx}`, eventType: "major", result: `${m.placement}${m.pointsAwarded ? ` · +${m.pointsAwarded} pts` : ""}`, placement: m.placement })),
      ...(champsPlace != null ? [{ eventName: "Champs", eventType: "champs", result: placementText(champsPlace), placement: placementText(champsPlace) }] : []),
    ],
  };
}

function makePlayerSnapshots(state, season) {
  const schedule = state.schedule || {};
  const byPlayer = new Map();
  const allPlayers = [...(state.players || []), ...(state.prospects || []), ...(state.retiredPlayers || [])];
  const ensure = (playerId, seed = {}) => {
    const id = String(playerId);
    if (!byPlayer.has(id)) {
      const player = allPlayers.find(p => String(p.id) === id) || {};
      byPlayer.set(id, {
        season,
        playerId: id,
        playerName: seed.playerName || seed.name || player.name || id,
        teams: [],
        roles: [],
        maps: 0,
        kills: 0,
        deaths: 0,
        kd: null,
        matches: 0,
        majorApps: 0,
        champsApps: 0,
        cqApps: 0,
        bestMajor: "Not tracked yet",
        bestChamps: "Not tracked yet",
        bestCQ: "Not tracked yet",
        events: [],
      });
    }
    return byPlayer.get(id);
  };
  const addUnique = (arr, value) => {
    if (value && !arr.includes(value)) arr.push(value);
  };
  const addPlaceBest = (current, next) => {
    if (!next || next === "Not tracked yet") return current;
    if (!current || current === "Not tracked yet") return next;
    const a = Number(String(current).match(/\d+/)?.[0] ?? 999);
    const b = Number(String(next).match(/\d+/)?.[0] ?? 999);
    return b < a ? next : current;
  };

  for (const match of schedule.matchLog || []) {
    const eventType = String(match.stage || "").includes("Champs") ? "champs" : String(match.stage || "").includes("Major") ? "major" : "stage";
    for (const [playerId, ps] of Object.entries(match.playerStats || {})) {
      const row = ensure(playerId, ps);
      const teamId = ps.teamId;
      const maps = match.mapResults?.length || 0;
      row.kills += ps.kills || 0;
      row.deaths += ps.deaths || 0;
      row.maps += maps;
      row.matches += 1;
      addUnique(row.teams, teamId);
      const player = allPlayers.find(p => String(p.id) === String(playerId));
      addUnique(row.roles, player?.primary || player?.role || ps.role);
      let placement = "Not tracked yet";
      if (eventType === "major") {
        const idx = Number(String(match.stage || "").match(/Major\s+(\d+)/i)?.[1] ?? 0) - 1;
        const place = getMajorPlacement(schedule.majors?.[idx], teamId);
        if (place != null) placement = placementText(place);
        row.majorApps += 1;
        row.bestMajor = addPlaceBest(row.bestMajor, placement);
      } else if (eventType === "champs") {
        const place = getMajorPlacement(schedule.majors?.[4], teamId);
        if (place != null) placement = placementText(place);
        row.champsApps += 1;
        row.bestChamps = addPlaceBest(row.bestChamps, placement);
      }
      row.events.push({
        season,
        eventName: match.stage || "Match",
        eventType,
        teamId,
        teamName: teamId ? resolveArchivedTeam(state, teamId).name : null,
        role: player?.primary || player?.role || ps.role || null,
        maps,
        kills: ps.kills || 0,
        deaths: ps.deaths || 0,
        kd: kd(ps.kills || 0, ps.deaths || 0),
        result: getSeriesResultText(match, teamId),
        placement,
      });
    }
  }

  for (const q of schedule.challengerQualifierResults || []) {
    for (const qMatch of q.matchLog || []) {
      const result = qMatch.result || qMatch;
      for (const [playerId, ps] of Object.entries(result.playerStats || {})) {
        const row = ensure(playerId, ps);
        const qr = (q.teams || []).find(r => r.teamId === ps.teamId || r.rosterIds?.map(String).includes(String(playerId)));
        const teamId = ps.teamId || qr?.teamId;
        const maps = result.mapResults?.length || 0;
        row.kills += ps.kills || 0;
        row.deaths += ps.deaths || 0;
        row.maps += maps;
        row.matches += 1;
        row.cqApps += 1;
        addUnique(row.teams, teamId);
        const player = allPlayers.find(p => String(p.id) === String(playerId));
        addUnique(row.roles, player?.primary || player?.role || ps.role);
        const placement = placementText(qr?.placement);
        row.bestCQ = addPlaceBest(row.bestCQ, placement);
        row.events.push({
          season,
          eventName: `Major ${Number(q.majorIdx ?? 0) + 1} Qualifier — ${qMatch.roundName || "Match"}`,
          eventType: "challengerQualifier",
          teamId,
          teamName: qr?.teamName || (teamId ? resolveArchivedTeam(state, teamId).name : null),
          role: player?.primary || player?.role || ps.role || null,
          maps,
          kills: ps.kills || 0,
          deaths: ps.deaths || 0,
          kd: kd(ps.kills || 0, ps.deaths || 0),
          result: getSeriesResultText(result, teamId),
          placement,
        });
      }
    }
  }

  for (const row of byPlayer.values()) {
    row.kd = kd(row.kills, row.deaths);
  }
  return [...byPlayer.values()];
}

export function archiveCompletedSeason(gameState) {
  if (!gameState?.schedule) return gameState;
  const season = gameState.schedule.season ?? gameState.season ?? 1;
  const cdlTeamIds = CDL_TEAMS.map(t => t.id);
  const challengerTeamIds = new Set();
  for (const q of gameState.schedule.challengerQualifierResults || []) {
    for (const row of q.teams || []) if (row.teamId) challengerTeamIds.add(row.teamId);
  }
  const teamIds = [...cdlTeamIds, ...challengerTeamIds];
  let teamCareerHistory = Array.isArray(gameState.teamCareerHistory) ? [...gameState.teamCareerHistory] : [];
  for (const teamId of teamIds) {
    teamCareerHistory = upsertBySeasonAndId(teamCareerHistory, makeTeamSnapshot(gameState, teamId, season), "teamId");
  }
  let playerCareerHistory = Array.isArray(gameState.playerCareerHistory) ? [...gameState.playerCareerHistory] : [];
  const playerSnapshots = makePlayerSnapshots(gameState, season);
  for (const snapshot of playerSnapshots) {
    playerCareerHistory = upsertBySeasonAndId(playerCareerHistory, snapshot, "playerId");
  }
  const existingSeasonHistory = Array.isArray(gameState.seasonHistory) ? gameState.seasonHistory.filter(Boolean) : [];
  const seasonSummary = {
    season,
    archivedAt: new Date().toISOString(),
    teamCount: teamIds.length,
    playerCount: playerSnapshots.length,
    completedMajors: (gameState.schedule.majors || []).filter(m => m.completed).length,
  };
  const seasonHistory = existingSeasonHistory.some(s => Number(s?.season) === Number(season))
    ? existingSeasonHistory.map(s => Number(s?.season) === Number(season) ? seasonSummary : s)
    : [...existingSeasonHistory, seasonSummary];
  return { ...gameState, seasonHistory, teamCareerHistory, playerCareerHistory };
}
