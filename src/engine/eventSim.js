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
  return roster.reduce((s, p) => s + (p.overall || 65), 0) / roster.length;
}

export function simulateEvent(event, teams, players, standings, seed) {
  const rng = seededRandom(seed || Date.now());
  const teamCount = Math.min(event.teamCount || teams.length, teams.length);

  const eligible = teams
    .map(t => ({
      ...t,
      ovr: teamOvr(players, t.id),
      pts: standings[t.id]?.proPoints || 0,
    }))
    .sort((a, b) => b.pts - a.pts || b.ovr - a.ovr)
    .slice(0, teamCount);

  const scored = eligible.map(t => ({
    teamId: t.id,
    teamName: t.name,
    teamTag: t.tag || t.shortName,
    ovr: t.ovr,
    score: t.ovr + (rng() * 20 - 10) + (rng() * 8 - 4),
  }));

  scored.sort((a, b) => b.score - a.score);

  const results = scored.map((t, i) => ({
    teamId: t.teamId,
    teamName: t.teamName,
    teamTag: t.teamTag,
    placement: i + 1,
    proPointsAwarded: event.proPoints[i + 1] || 0,
    score: Math.round(t.score * 10) / 10,
  }));

  const champion = results[0];

  return {
    eventId: event.id,
    eventName: event.name,
    eventType: event.type,
    dateLabel: event.dateLabel,
    champion: { teamId: champion.teamId, teamName: champion.teamName, teamTag: champion.teamTag },
    results,
    teamCount: results.length,
  };
}
