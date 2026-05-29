import { CDL_TEAMS } from "../data/teams.js";
import { resolveTeamDisplay } from "./teamDisplay.js";

function kd(kills, deaths) {
  if (!kills && !deaths) return null;
  return deaths > 0 ? kills / deaths : kills;
}

function kdText(value) {
  return value == null || Number.isNaN(value) ? null : `${value.toFixed(2)} K/D`;
}

function roleOf(player, stat) {
  return player?.primary || player?.role || stat?.role || null;
}

function normalizeRole(role) {
  return String(role || "").toLowerCase().replace(/[^a-z]/g, "");
}

function awardId(season, key) {
  return `s${season}_${key}`;
}

function getAllPlayers(state) {
  return [...(state?.players || []), ...(state?.prospects || []), ...(state?.retiredPlayers || [])];
}

function findPlayer(state, playerId) {
  const id = String(playerId);
  return getAllPlayers(state).find(p => String(p.id) === id) || null;
}

function challengerTeamById(state, teamId) {
  return (state?.challengerTeams || []).find(t => t.id === teamId) || null;
}

function teamInfo(state, teamId) {
  if (!teamId) return null;
  const cdl = CDL_TEAMS.find(t => t.id === teamId);
  if (cdl) return cdl;
  const challenger = challengerTeamById(state, teamId);
  if (challenger) return challenger;
  for (const q of state?.schedule?.challengerQualifierResults || []) {
    const row = (q.teams || []).find(t => t.teamId === teamId);
    if (row) return { id: teamId, name: row.teamName || teamId, tag: row.tag || String(teamId).slice(0, 3).toUpperCase(), logo: row.logo, color: row.color };
  }
  return resolveTeamDisplay(teamId, state?.schedule);
}

function buildPlayerAward(state, season, key, name, candidate, contextParts = []) {
  if (!candidate) return null;
  const player = findPlayer(state, candidate.playerId);
  const teamId = candidate.teamId || player?.teamId || player?.challengerTeamId || null;
  const team = teamInfo(state, teamId);
  const context = contextParts.filter(Boolean).join(", ");
  return {
    id: awardId(season, key),
    season,
    key,
    type: "player",
    awardName: name,
    playerId: String(candidate.playerId),
    playerName: candidate.playerName || player?.name || String(candidate.playerId),
    teamId,
    teamName: team?.name || teamId || null,
    teamTag: team?.tag || null,
    role: candidate.role || roleOf(player, candidate) || null,
    kd: candidate.kd ?? null,
    context,
  };
}

function buildTeamAward(state, season, key, name, candidate, contextParts = []) {
  if (!candidate) return null;
  const team = teamInfo(state, candidate.teamId);
  return {
    id: awardId(season, key),
    season,
    key,
    type: "team",
    awardName: name,
    teamId: candidate.teamId,
    teamName: candidate.teamName || team?.name || candidate.teamId,
    teamTag: candidate.teamTag || team?.tag || null,
    context: contextParts.filter(Boolean).join(", "),
  };
}

function aggregateCdlPlayerStats(state) {
  const cdlIds = new Set(CDL_TEAMS.map(t => t.id));
  const players = getAllPlayers(state);
  const rows = new Map();
  const majorWins = new Map();
  for (const major of (state?.schedule?.majors || []).slice(0, 4)) {
    const champ = major?.bracket?.champion;
    if (champ) majorWins.set(champ, (majorWins.get(champ) || 0) + 1);
  }

  for (const match of state?.schedule?.matchLog || []) {
    for (const [playerId, stat] of Object.entries(match.playerStats || {})) {
      if (!cdlIds.has(stat.teamId)) continue;
      const player = players.find(p => String(p.id) === String(playerId));
      const id = String(playerId);
      if (!rows.has(id)) {
        rows.set(id, {
          playerId: id,
          playerName: stat.name || player?.name || id,
          teamId: stat.teamId,
          role: roleOf(player, stat),
          age: player?.age ?? null,
          isProspect: !!player?.isProspect,
          kills: 0,
          deaths: 0,
          matches: 0,
          majorWins: 0,
        });
      }
      const row = rows.get(id);
      row.kills += stat.kills || 0;
      row.deaths += stat.deaths || 0;
      row.matches += 1;
      row.teamId = stat.teamId || row.teamId;
      row.role = row.role || roleOf(player, stat);
    }
  }

  for (const row of rows.values()) {
    row.kd = kd(row.kills, row.deaths);
    row.majorWins = majorWins.get(row.teamId) || 0;
    row.score = (row.kd ?? 0) * 100 + Math.min(row.matches, 40) * 1.25 + row.majorWins * 12;
  }
  return [...rows.values()].filter(r => r.matches >= 3 && r.kd != null);
}

function aggregateChallengerStats(state) {
  const players = getAllPlayers(state);
  const rows = new Map();
  const teamStats = new Map();

  for (const q of state?.schedule?.challengerQualifierResults || []) {
    for (const team of q.teams || []) {
      const id = team.teamId;
      if (!id) continue;
      if (!teamStats.has(id)) teamStats.set(id, { teamId: id, teamName: team.teamName, teamTag: team.tag, qualifierWins: 0, majorQualifications: 0, circuitPoints: 0, placements: [] });
      const row = teamStats.get(id);
      if (Number(team.placement) === 1) row.qualifierWins += 1;
      if (team.qualified) row.majorQualifications += 1;
      row.circuitPoints += team.circuitPointsAwarded || 0;
      if (team.placement != null) row.placements.push(team.placement);
    }
    for (const qMatch of q.matchLog || []) {
      const result = qMatch.result || qMatch;
      for (const [playerId, stat] of Object.entries(result.playerStats || {})) {
        const qr = (q.teams || []).find(t => t.teamId === stat.teamId || (t.rosterIds || []).map(String).includes(String(playerId)));
        const teamId = stat.teamId || qr?.teamId;
        const player = players.find(p => String(p.id) === String(playerId));
        const id = String(playerId);
        if (!rows.has(id)) rows.set(id, { playerId: id, playerName: stat.name || player?.name || id, teamId, role: roleOf(player, stat), kills: 0, deaths: 0, matches: 0, majorQualifications: 0 });
        const row = rows.get(id);
        row.kills += stat.kills || 0;
        row.deaths += stat.deaths || 0;
        row.matches += 1;
        row.teamId = teamId || row.teamId;
        row.role = row.role || roleOf(player, stat);
      }
    }
  }

  for (const row of rows.values()) {
    row.kd = kd(row.kills, row.deaths);
    const team = teamStats.get(row.teamId);
    row.majorQualifications = team?.majorQualifications || 0;
    row.score = (row.kd ?? 0) * 100 + Math.min(row.matches, 20) + row.majorQualifications * 8;
  }
  for (const row of teamStats.values()) {
    row.score = row.circuitPoints + row.majorQualifications * 20 + row.qualifierWins * 15;
  }
  return { players: [...rows.values()].filter(r => r.matches >= 2 && r.kd != null), teams: [...teamStats.values()] };
}

function bestBy(rows, predicate, score = row => row.score ?? row.kd ?? 0) {
  return rows.filter(predicate).sort((a, b) => score(b) - score(a))[0] || null;
}

function finalMatchResult(major) {
  const rounds = major?.bracket?.rounds || [];
  const gf = rounds.find(r => r.type === "GF" || r.name === "Grand Final") || rounds.at(-1);
  return gf?.matches?.[0]?.result || null;
}

function majorMvpAward(state, season, major, idx, keyPrefix = "major") {
  const result = finalMatchResult(major);
  if (!result?.standoutId) return null;
  return buildPlayerAward(state, season, `${keyPrefix}_${idx + 1}_mvp`, `${major?.name || `Major ${idx + 1}`} MVP`, {
    playerId: result.standoutId,
    playerName: result.standoutName,
    teamId: result.winnerId,
    kd: result.standoutKD,
  }, [kdText(result.standoutKD), result.winnerName ? `${result.winnerName} winner` : null]);
}

export function calculateSeasonAwards(gameState) {
  const season = gameState?.schedule?.season ?? gameState?.season ?? 1;
  const cdl = aggregateCdlPlayerStats(gameState);
  const challenger = aggregateChallengerStats(gameState);
  const awards = [];

  const mvp = bestBy(cdl, () => true);
  const rookie = bestBy(cdl, r => r.isProspect || (r.age != null && r.age <= 21), r => (r.score ?? 0) + (r.isProspect ? 15 : 0))
    || [...cdl].sort((a, b) => (a.age ?? 99) - (b.age ?? 99) || (b.score ?? 0) - (a.score ?? 0))[0]
    || null;
  const mainAr = bestBy(cdl, r => normalizeRole(r.role).includes("mainar") || normalizeRole(r.role) === "ar");
  const flex = bestBy(cdl, r => normalizeRole(r.role).includes("flex"));
  const entry = bestBy(cdl, r => normalizeRole(r.role).includes("entry"));
  const slayer = bestBy(cdl, r => normalizeRole(r.role).includes("slayersmg") || normalizeRole(r.role) === "slayer");
  const challengerPoty = bestBy(challenger.players, () => true);
  const challengerTeam = bestBy(challenger.teams, () => true);
  const champsMvp = majorMvpAward(gameState, season, gameState?.schedule?.majors?.[4], 4, "champs");

  const playerContext = r => [kdText(r?.kd), r?.majorWins ? `${r.majorWins} Major win${r.majorWins === 1 ? "" : "s"}` : null];
  awards.push(buildPlayerAward(gameState, season, "season_mvp", "Season MVP", mvp, playerContext(mvp)));
  awards.push(buildPlayerAward(gameState, season, "rookie_of_year", rookie?.isProspect ? "Rookie of the Year" : "Prospect of the Year", rookie, playerContext(rookie)));
  awards.push(buildPlayerAward(gameState, season, "best_main_ar", "Best Main AR", mainAr, playerContext(mainAr)));
  awards.push(buildPlayerAward(gameState, season, "best_flex", "Best Flex", flex, playerContext(flex)));
  awards.push(buildPlayerAward(gameState, season, "best_entry_smg", "Best Entry SMG", entry, playerContext(entry)));
  awards.push(buildPlayerAward(gameState, season, "best_slayer_smg", "Best Slayer SMG", slayer, playerContext(slayer)));
  awards.push(buildPlayerAward(gameState, season, "challenger_poty", "Challenger Player of the Year", challengerPoty, [kdText(challengerPoty?.kd), challengerPoty?.majorQualifications ? `${challengerPoty.majorQualifications} Major qualification${challengerPoty.majorQualifications === 1 ? "" : "s"}` : null]));
  awards.push(buildTeamAward(gameState, season, "challenger_team_of_year", "Challenger Team of the Year", challengerTeam, [challengerTeam?.qualifierWins ? `${challengerTeam.qualifierWins} qualifier win${challengerTeam.qualifierWins === 1 ? "" : "s"}` : null, challengerTeam?.majorQualifications ? `${challengerTeam.majorQualifications} Major qualification${challengerTeam.majorQualifications === 1 ? "" : "s"}` : null]));
  awards.push(champsMvp ? { ...champsMvp, awardName: "Champs MVP", key: "champs_mvp", id: awardId(season, "champs_mvp") } : null);

  const majorMvps = (gameState?.schedule?.majors || []).slice(0, 4).map((major, idx) => majorMvpAward(gameState, season, major, idx)).filter(Boolean);

  return {
    season,
    title: `Season ${season} Awards`,
    awards: awards.filter(Boolean),
    majorMvps,
    createdAt: new Date().toISOString(),
  };
}

export function mergeSeasonAwards(gameState, seasonAwards) {
  if (!seasonAwards?.season) return gameState;
  const existing = Array.isArray(gameState.awards) ? gameState.awards.filter(Boolean) : [];
  const byId = new Map(existing.map(a => [a.id || `${a.season}_${a.key}_${a.playerId || a.teamId}`, a]));
  for (const award of [...(seasonAwards.awards || []), ...(seasonAwards.majorMvps || [])]) {
    byId.set(award.id || `${award.season}_${award.key}_${award.playerId || award.teamId}`, award);
  }
  const awards = [...byId.values()].sort((a, b) => Number(a.season) - Number(b.season));

  const decoratePlayer = (snapshot) => {
    const won = awards.filter(a => Number(a.season) === Number(snapshot.season) && a.type === "player" && String(a.playerId) === String(snapshot.playerId));
    return won.length ? { ...snapshot, awards: won } : { ...snapshot, awards: snapshot.awards ?? [] };
  };
  const decorateTeam = (snapshot) => {
    const won = awards.filter(a => Number(a.season) === Number(snapshot.season) && a.teamId && String(a.teamId) === String(snapshot.teamId));
    return won.length ? { ...snapshot, awards: won } : { ...snapshot, awards: snapshot.awards ?? [] };
  };

  return {
    ...gameState,
    awards,
    playerCareerHistory: (gameState.playerCareerHistory || []).map(decoratePlayer),
    teamCareerHistory: (gameState.teamCareerHistory || []).map(decorateTeam),
    seasonHistory: (gameState.seasonHistory || []).map(s => Number(s?.season) === Number(seasonAwards.season) ? { ...s, awards: seasonAwards.awards || [], majorMvps: seasonAwards.majorMvps || [] } : s),
  };
}
