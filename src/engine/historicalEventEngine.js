function seededRandom(seed) {
  let s = seed | 0;
  return () => {
    s = (s * 1664525 + 1013904223) | 0;
    return (s >>> 0) / 4294967296;
  };
}

function teamOvr(players, teamId) {
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
  const teamCount = Math.min(event.teamCount || teams.length, teams.length);
  return teams
    .map(t => ({
      teamId: t.id,
      teamName: t.name,
      teamTag: t.tag || t.shortName,
      ovr: teamOvr(players, t.id),
      proPoints: standings?.[t.id]?.proPoints || 0,
    }))
    .sort((a, b) => b.proPoints - a.proPoints || b.ovr - a.ovr || a.teamName.localeCompare(b.teamName))
    .slice(0, teamCount)
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
    mapSummary: "Best of 5 · Hardpoint / Search & Destroy / Blitz",
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
    gameTitle: "Call of Duty: Ghosts",
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

export function simulateMatch(eventState, matchId, event, userTeamId) {
  const match = eventState.matches.find(m => m.id === matchId);
  if (!match || match.status !== "pending" || !match.teamA || !match.teamB) return eventState;
  const rng = randomFor(eventState);
  const aPower = match.teamA.ovr + rng() * 18;
  const bPower = match.teamB.ovr + rng() * 18;
  const aWins = aPower >= bPower;
  const close = Math.abs(aPower - bPower) < 6;
  const loserMaps = close ? (rng() > 0.5 ? 2 : 1) : (rng() > 0.65 ? 1 : 0);
  const winner = aWins ? match.teamA : match.teamB;
  const loser = aWins ? match.teamB : match.teamA;
  const completed = { ...match, status: "completed", completedAt: (eventState.rngStep || 0) + 1, winnerId: winner.teamId, loserId: loser.teamId, scoreA: aWins ? 3 : loserMaps, scoreB: aWins ? loserMaps : 3 };
  const teamStates = { ...eventState.teamStates };
  teamStates[winner.teamId] = { ...teamStates[winner.teamId], wins: teamStates[winner.teamId].wins + 1 };
  const maxLosses = eventState.format === "double_elimination" ? 2 : 1;
  const loserState = { ...teamStates[loser.teamId], losses: teamStates[loser.teamId].losses + 1 };
  if (loserState.losses >= maxLosses) {
    loserState.eliminated = true;
    loserState.eliminatedOrder = Object.values(teamStates).filter(t => t.eliminated).length + 1;
  }
  teamStates[loser.teamId] = loserState;
  const latest = `${winner.teamName} def. ${loser.teamName} ${aWins ? completed.scoreA : completed.scoreB}-${aWins ? completed.scoreB : completed.scoreA}`;
  const next = { ...eventState, rngStep: (eventState.rngStep || 0) + 1, teamStates, matches: eventState.matches.map(m => m.id === matchId ? completed : m), latestResults: [latest, ...(eventState.latestResults || [])].slice(0, 8) };
  return maybeAdvanceRound(next, event, userTeamId);
}

export function toEventResult(eventState, event) {
  return { eventId: eventState.eventId, eventName: eventState.eventName, eventType: eventState.eventType, dateLabel: eventState.dateLabel, champion: eventState.champion, results: eventState.placements, teamCount: eventState.field.length };
}
