export function createInitialStandings(teams) {
  const standings = {};
  for (const team of teams) {
    standings[team.id] = {
      teamId: team.id,
      teamName: team.name,
      teamTag: team.tag || team.shortName,
      proPoints: 0,
      eventWins: 0,
      eventsPlayed: 0,
      placements: [],
    };
  }
  return standings;
}

export function updateStandings(standings, eventResult) {
  const next = { ...standings };
  for (const result of eventResult.results) {
    const entry = next[result.teamId];
    if (!entry) continue;
    next[result.teamId] = {
      ...entry,
      proPoints: entry.proPoints + (result.proPointsAwarded || 0),
      eventWins: entry.eventWins + (result.placement === 1 ? 1 : 0),
      eventsPlayed: entry.eventsPlayed + 1,
      placements: [...entry.placements, { eventId: eventResult.eventId, eventName: eventResult.eventName, placement: result.placement }],
    };
  }
  return next;
}

export function getSortedStandings(standings) {
  return Object.values(standings)
    .sort((a, b) => b.proPoints - a.proPoints || b.eventWins - a.eventWins)
    .map((entry, i) => ({ ...entry, rank: i + 1 }));
}
