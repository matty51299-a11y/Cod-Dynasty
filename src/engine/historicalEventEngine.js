function seededRandom(seed) {
  let s = seed | 0;
  return () => {
    s = (s * 1664525 + 1013904223) | 0;
    return (s >>> 0) / 4294967296;
  };
}

export function teamOvr(players, teamId) {
  const roster = players.filter(p => p.teamId === teamId);
  if (!roster.length) return 65;
  return roster.reduce((sum, p) => sum + (p.overall || 65), 0) / roster.length;
}

export function getHistoricalEventFormat(event) {
  const name = `${event.name} ${event.format} ${event.type}`.toLowerCase();
  if (name.includes("online qualifier") || event.id === "cod_champs_qualifier") return "single_elimination";
  if (name.includes("round robin") || event.type === "league") return "round_robin";
  return "double_elimination";
}

export function placementPoints(event, placement) {
  if (event.proPoints?.[placement]) return event.proPoints[placement];
  if (placement <= 1) return 100;
  if (placement === 2) return 75;
  if (placement === 3) return 60;
  if (placement === 4) return 45;
  if (placement <= 6) return 30;
  if (placement <= 8) return 15;
  if (placement <= 16) return 5;
  return 0;
}

function selectField(event, teams, players, standings) {
  // Cod Dynasty historical flow: every active pro team enters every event for now.
  // Event teamCount remains display/flavour only; it must not gate participation.
  return teams
    .map(t => ({
      teamId: t.id,
      teamName: t.name,
      teamTag: t.tag || t.shortName,
      ovr: teamOvr(players, t.id),
      proPoints: standings?.[t.id]?.proPoints || 0,
    }))
    .sort((a, b) => b.proPoints - a.proPoints || b.ovr - a.ovr || a.teamName.localeCompare(b.teamName))
    .map((t, i) => ({ ...t, seed: i + 1 }));
}

function bracketSide(format, losses) {
  if (format === "single_elimination") return "Single Elimination";
  if (format === "round_robin") return "League Round Robin";
  return losses > 0 ? "Losers Bracket" : "Winners Bracket";
}

function createMatch(eventId, roundNumber, matchIndex, teamA, teamB, format, userTeamId) {
  const losses = Math.max(teamA?.losses || 0, teamB?.losses || 0);
  return {
    id: `${eventId}_r${roundNumber}_m${matchIndex}`,
    eventId,
    round: roundNumber,
    roundLabel: `${bracketSide(format, losses)} Round ${roundNumber}`,
    bracketSide: bracketSide(format, losses),
    teamA: teamA ? { teamId: teamA.teamId, teamName: teamA.teamName, teamTag: teamA.teamTag, seed: teamA.seed, ovr: teamA.ovr } : null,
    teamB: teamB ? { teamId: teamB.teamId, teamName: teamB.teamName, teamTag: teamB.teamTag, seed: teamB.seed, ovr: teamB.ovr } : null,
    scoreA: null,
    scoreB: null,
    winnerId: null,
    loserId: null,
    status: "pending",
    userInvolved: [teamA?.teamId, teamB?.teamId].includes(userTeamId),
    mapSummary: "Best of 5",
  };
}

function makeRoundMatches(eventState, userTeamId) {
  const alive = Object.values(eventState.teamStates).filter(t => !t.eliminated);
  if (alive.length <= 1) return [];
  const groups = eventState.format === "double_elimination"
    ? [alive.filter(t => t.losses === 0), alive.filter(t => t.losses === 1)]
    : [alive];
  const matches = [];
  const leftovers = [];
  let idx = 1;
  for (const group of groups) {
    const sorted = [...group].sort((a, b) => a.losses - b.losses || a.seed - b.seed);
    for (let i = 0; i < sorted.length; i += 2) {
      const a = sorted[i];
      const b = sorted[i + 1];
      if (!b) {
        leftovers.push(a);
        continue;
      }
      matches.push(createMatch(eventState.eventId, eventState.currentRound, idx++, a, b, eventState.format, userTeamId));
    }
  }
  for (let i = 0; i < leftovers.length; i += 2) {
    const a = leftovers[i];
    const b = leftovers[i + 1];
    if (a && b) matches.push(createMatch(eventState.eventId, eventState.currentRound, idx++, a, b, eventState.format, userTeamId));
  }
  return matches;
}

export function createHistoricalEventState(event, teams, players, standings, userTeamId, seed = Date.now()) {
  const format = getHistoricalEventFormat(event);
  const field = selectField(event, teams, players, standings);
  const teamStates = Object.fromEntries(field.map(t => [t.teamId, { ...t, losses: 0, wins: 0, eliminated: false, eliminatedOrder: null }]));
  const base = {
    eventId: event.id,
    eventName: event.name,
    eventType: event.type,
    dateLabel: event.dateLabel,
    gameTitle: event.gameTitle || "Call of Duty: Ghosts",
    format,
    displayFormat: format.replaceAll("_", " "),
    status: "in_progress",
    seed,
    rngStep: 0,
    currentRound: 1,
    field,
    teamStates,
    matches: [],
    latestResults: [],
    champion: null,
    placements: [],
    userPlacement: null,
    userProPointsAwarded: 0,
    pointsAwarded: false,
  };
  return { ...base, matches: makeRoundMatches(base, userTeamId) };
}

export function getHistoricalSeriesMapSet(era) {
  const rotation = era?.id === "ghosts"
    ? ["Domination", "Search and Destroy", "Blitz", "Domination", "Search and Destroy"]
    : (era?.modes?.length ? [era.modes[0], era.modes[1] || era.modes[0], era.modes[2] || era.modes[0], era.modes[0], era.modes[1] || era.modes[0]] : ["Domination", "Search and Destroy", "Blitz", "Domination", "Search and Destroy"]);
  const fallback = ["Freight", "Octane", "Warhawk", "Sovereign", "Strikezone"];
  return rotation.map((mode, index) => {
    const pool = era?.mapPool?.[mode]?.length ? era.mapPool[mode] : fallback;
    return { mapNumber: index + 1, mode, mapName: pool[index % pool.length] };
  });
}

function playerPower(player, teamStrength, rng) {
  const roleBonus = player.role === "Slayer" ? 3 : player.role === "Objective" ? 1.5 : player.role === "Support" ? -0.5 : 0;
  return (player.overall || player.ovr || 65) * 0.72 + teamStrength * 0.28 + roleBonus + (rng() * 8 - 4);
}

export function generateHistoricalMapResult(liveMatch, players, era, seedOffset = 0) {
  const map = liveMatch.mapSet[liveMatch.currentMapIndex];
  const rng = seededRandom((liveMatch.seed || 1) + ((liveMatch.mapResults.length + 1 + seedOffset) * 1319));
  const teamAPlayers = players.filter(p => p.teamId === liveMatch.teamA.teamId).slice(0, 4);
  const teamBPlayers = players.filter(p => p.teamId === liveMatch.teamB.teamId).slice(0, 4);
  const strengthA = liveMatch.teamA.ovr || teamOvr(players, liveMatch.teamA.teamId);
  const strengthB = liveMatch.teamB.ovr || teamOvr(players, liveMatch.teamB.teamId);
  const aPower = strengthA + rng() * 18 + (liveMatch.scoreA - liveMatch.scoreB) * -1.5;
  const bPower = strengthB + rng() * 18 + (liveMatch.scoreB - liveMatch.scoreA) * -1.5;
  const winnerSide = aPower >= bPower ? "A" : "B";
  const scoreGap = Math.max(6, Math.min(55, Math.round(Math.abs(aPower - bPower) * 2.8 + rng() * 14)));
  const score = map.mode === "Search and Destroy"
    ? (winnerSide === "A" ? { a: 6, b: Math.max(0, Math.min(5, 6 - Math.ceil(scoreGap / 12))) } : { a: Math.max(0, Math.min(5, 6 - Math.ceil(scoreGap / 12))), b: 6 })
    : (winnerSide === "A" ? { a: 200, b: 200 - scoreGap } : { a: 200 - scoreGap, b: 200 });
  function makeStats(list, teamStrength, won) {
    return list.map((player) => {
      const power = playerPower(player, teamStrength, rng);
      const base = map.mode === "Search and Destroy" ? 8 : 24;
      const kills = Math.max(2, Math.round(base + (power - 70) * 0.45 + (won ? 4 : -2) + rng() * 8));
      const deaths = Math.max(2, Math.round(base + (70 - power) * 0.28 + (won ? -2 : 4) + rng() * 7));
      return { playerId: player.id, name: player.name, role: player.role, overall: player.overall, kills, deaths, kd: Number((kills / Math.max(1, deaths)).toFixed(2)) };
    });
  }
  const statsA = makeStats(teamAPlayers, strengthA, winnerSide === "A");
  const statsB = makeStats(teamBPlayers, strengthB, winnerSide === "B");
  const all = [...statsA, ...statsB];
  const best = [...all].sort((a, b) => b.kd - a.kd || b.kills - a.kills)[0];
  return { ...map, winnerSide, winnerId: winnerSide === "A" ? liveMatch.teamA.teamId : liveMatch.teamB.teamId, scoreA: score.a, scoreB: score.b, playerStats: { teamA: statsA, teamB: statsB }, bestPerformer: best };
}

export function createHistoricalLiveMatch(eventState, matchId, players, era, seed = Date.now()) {
  const match = eventState.matches.find(m => m.id === matchId);
  if (!match || match.status !== "pending" || !match.teamA || !match.teamB) return null;
  return { id: `live_${match.id}_${seed}`, eventId: eventState.eventId, eventName: eventState.eventName, matchId, roundLabel: match.roundLabel, gameTitle: era?.gameTitle || eventState.gameTitle, teamA: match.teamA, teamB: match.teamB, scoreA: 0, scoreB: 0, currentMapIndex: 0, mapSet: getHistoricalSeriesMapSet(era), mapResults: [], status: "in_progress", winnerId: null, seed };
}

export function playHistoricalLiveMap(liveMatch, players, era) {
  if (!liveMatch || liveMatch.status === "completed") return liveMatch;
  const mapIndex = liveMatch.mapResults.length;
  if (mapIndex >= liveMatch.mapSet.length) return liveMatch;
  const result = generateHistoricalMapResult({ ...liveMatch, currentMapIndex: mapIndex }, players, era);
  const scoreA = liveMatch.scoreA + (result.winnerSide === "A" ? 1 : 0);
  const scoreB = liveMatch.scoreB + (result.winnerSide === "B" ? 1 : 0);
  const completed = scoreA === 3 || scoreB === 3;
  return { ...liveMatch, scoreA, scoreB, mapResults: [...liveMatch.mapResults, result], status: completed ? "completed" : "in_progress", winnerId: completed ? (scoreA > scoreB ? liveMatch.teamA.teamId : liveMatch.teamB.teamId) : null };
}

export function advanceHistoricalLiveMap(liveMatch) {
  if (!liveMatch || liveMatch.status === "completed") return liveMatch;
  return { ...liveMatch, currentMapIndex: liveMatch.mapResults.length };
}

export function applyPlayedMatchResult(eventState, liveMatch, event, userTeamId) {
  if (!liveMatch || liveMatch.status !== "completed") return eventState;
  return applyMatchResult(eventState, liveMatch.matchId, event, userTeamId, liveMatch.scoreA, liveMatch.scoreB, liveMatch.mapResults);
}

function randomFor(state) {
  return seededRandom((state.seed || 1) + ((state.rngStep || 0) * 9973));
}

export function getNextPendingMatch(eventState) {
  return eventState.matches.find(m => m.status === "pending") || null;
}

export function getUserPendingMatch(eventState, userTeamId) {
  return eventState.matches.find(m => m.status === "pending" && m.userInvolved && [m.teamA?.teamId, m.teamB?.teamId].includes(userTeamId)) || null;
}

function completePlacements(state, event) {
  const teams = Object.values(state.teamStates);
  const ordered = [...teams].sort((a, b) => {
    if (a.eliminated !== b.eliminated) return a.eliminated ? 1 : -1;
    return (b.wins - a.wins) || (a.losses - b.losses) || a.seed - b.seed;
  });
  const placements = ordered.map((t, i) => ({
    teamId: t.teamId,
    teamName: t.teamName,
    teamTag: t.teamTag,
    placement: i + 1,
    proPointsAwarded: placementPoints(event, i + 1),
    wins: t.wins,
    losses: t.losses,
  }));
  return placements;
}

function maybeAdvanceRound(state, event, userTeamId) {
  if (state.matches.some(m => m.status === "pending")) return state;
  const alive = Object.values(state.teamStates).filter(t => !t.eliminated);
  if (alive.length <= 1) {
    const championTeam = alive[0] || Object.values(state.teamStates).sort((a,b) => b.wins - a.wins)[0];
    const placements = completePlacements(state, event);
    const userResult = placements.find(p => p.teamId === userTeamId);
    return {
      ...state,
      status: "completed",
      champion: championTeam ? { teamId: championTeam.teamId, teamName: championTeam.teamName, teamTag: championTeam.teamTag } : null,
      placements,
      userPlacement: userResult?.placement || null,
      userProPointsAwarded: userResult?.proPointsAwarded || 0,
    };
  }
  const next = { ...state, currentRound: state.currentRound + 1 };
  return { ...next, matches: [...state.matches, ...makeRoundMatches(next, userTeamId)] };
}

function applyMatchResult(eventState, matchId, event, userTeamId, scoreA, scoreB, mapResults = null) {
  const match = eventState.matches.find(m => m.id === matchId);
  if (!match || match.status !== "pending" || !match.teamA || !match.teamB) return eventState;
  const aWins = scoreA > scoreB;
  const winner = aWins ? match.teamA : match.teamB;
  const loser = aWins ? match.teamB : match.teamA;
  const completed = { ...match, status: "completed", completedAt: (eventState.rngStep || 0) + 1, winnerId: winner.teamId, loserId: loser.teamId, scoreA, scoreB, mapResults };
  const teamStates = { ...eventState.teamStates };
  teamStates[winner.teamId] = { ...teamStates[winner.teamId], wins: teamStates[winner.teamId].wins + 1 };
  const maxLosses = eventState.format === "double_elimination" ? 2 : 1;
  const loserState = { ...teamStates[loser.teamId], losses: teamStates[loser.teamId].losses + 1 };
  if (loserState.losses >= maxLosses) { loserState.eliminated = true; loserState.eliminatedOrder = Object.values(teamStates).filter(t => t.eliminated).length + 1; }
  teamStates[loser.teamId] = loserState;
  const latest = `${winner.teamName} def. ${loser.teamName} ${aWins ? scoreA : scoreB}-${aWins ? scoreB : scoreA}`;
  const next = { ...eventState, rngStep: (eventState.rngStep || 0) + 1, teamStates, matches: eventState.matches.map(m => m.id === matchId ? completed : m), latestResults: [latest, ...(eventState.latestResults || [])].slice(0, 8) };
  return maybeAdvanceRound(next, event, userTeamId);
}

export function simulateMatch(eventState, matchId, event, userTeamId) {
  const match = eventState.matches.find(m => m.id === matchId);
  if (!match || match.status !== "pending" || !match.teamA || !match.teamB) return eventState;
  const rng = randomFor(eventState);
  const aPower = match.teamA.ovr + rng() * 18;
  const bPower = match.teamB.ovr + rng() * 18;
  const aWins = aPower >= bPower;
  const close = Math.abs(aPower - bPower) < 6;
  const loserMaps = close ? (rng() > 0.5 ? 2 : 1) : (rng() > 0.65 ? 1 : 0);
  return applyMatchResult(eventState, matchId, event, userTeamId, aWins ? 3 : loserMaps, aWins ? loserMaps : 3);
}

export function toEventResult(eventState, event) {
  return { eventId: eventState.eventId, eventName: eventState.eventName, eventType: eventState.eventType, dateLabel: eventState.dateLabel, champion: eventState.champion, results: eventState.placements, teamCount: eventState.field.length };
}
