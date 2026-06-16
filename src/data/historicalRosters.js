// src/data/historicalRosters.js
// Historical starting data for Cod Dynasty.
// Source of truth: rosters from data/import/cod_manager_rosters_database.xlsx plus ratings from cod_dynasty_historical_player_ratings_v2_fixed.xlsx.

import { createFallbackHistoricalRating, getHistoricalPlayerRating, getHistoricalPlayerRatingByName, normalizeHistoricalRatingKey } from "./historicalPlayerRatings.js";

function slug(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function hashString(str) {
  let h = 2166136261;
  for (const ch of String(str || "")) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function clamp(v, min = 58, max = 94) { return Math.max(min, Math.min(max, Math.round(v))); }
function attr(base, salt) { return clamp(base + ((salt % 13) - 6), 45, 99); }

function findRatingForRosterPlayer(eraId, name) {
  return getHistoricalPlayerRating(eraId, normalizeHistoricalRatingKey(name)) || getHistoricalPlayerRatingByName(eraId, name);
}

function applyHistoricalRating(basePlayer, eraId, teamName) {
  const rating = findRatingForRosterPlayer(eraId, basePlayer.name) || createFallbackHistoricalRating(eraId, basePlayer.playerId || basePlayer.name, basePlayer.name, teamName);
  if (rating.confidence === "Low" && rating.researchNotes === "Missing from ratings workbook") {
    console.warn(`[Cod Dynasty] Missing historical rating for ${eraId}/${basePlayer.name}; using conservative fallback.`);
  }
  const attrs = rating.attributes || {};
  return {
    ...basePlayer,
    playerId: rating.playerId,
    displayName: rating.displayName || basePlayer.name,
    aliases: rating.aliases || [],
    primary: rating.role || basePlayer.primary || "Unknown",
    role: rating.role || basePlayer.role || "Unknown",
    overall: rating.overall,
    potential: rating.potential,
    gunny: attrs.gunny ?? basePlayer.gunny,
    awareness: attrs.awareness ?? basePlayer.awareness,
    objective: attrs.objective ?? basePlayer.objective,
    searchIQ: attrs.sndIQ ?? basePlayer.searchIQ,
    sndIQ: attrs.sndIQ ?? basePlayer.sndIQ,
    clutch: attrs.clutch ?? basePlayer.clutch,
    teamwork: attrs.teamwork ?? basePlayer.teamwork,
    composure: attrs.composure ?? basePlayer.composure,
    adaptability: attrs.adaptability ?? basePlayer.adaptability,
    pace: attrs.pace ?? basePlayer.pace,
    movement: attrs.movement ?? basePlayer.movement,
    consistency: attrs.consistency ?? basePlayer.consistency,
    leadership: attrs.leadership ?? basePlayer.leadership,
    workRate: attrs.workRate ?? basePlayer.workRate,
    personalityTraits: rating.personalityTraits || [],
    eraFitTraits: rating.eraFitTraits || [],
    confidence: rating.confidence,
    researchNotes: rating.researchNotes,
    sourceLinks: rating.sourceLinks,
    ratingSource: rating.confidence === "Low" && rating.researchNotes === "Missing from ratings workbook" ? "fallback" : "historical_workbook",
  };
}

function teamTag(name) {
  const words = String(name).match(/[A-Za-z0-9]+/g) || [];
  const initials = words.map(w => w[0]).join("").slice(0, 4).toUpperCase();
  return initials || String(name).slice(0, 4).toUpperCase();
}

export const GHOSTS_SPREADSHEET_SOURCE = "data/import/cod_manager_rosters_database.xlsx#Ghosts";

export const GHOSTS_TEAM_ROWS = [
  { name: "compLexity", players: ["ACHES", "TeePee", "Crimsix", "Karma"] },
  { name: "Envy", players: ["Rambo", "MerK", "NAMELESS", "StuDyy"] },
  { name: "OpTic Gaming", players: ["NaDeSHoT", "Clayster", "MBoZe", "Scump"] },
  { name: "Strictly Business", players: ["Censor", "Apathy", "Saints", "Dedo"] },
  { name: "Trident T1 Dotters", players: ["Iskatuu", "Chilean", "Denz", "Damage"] },
  { name: "FaZe Clan", players: ["Replays", "Classic", "JKap", "ProoFy"] },
  { name: "Rise Nation", players: ["Pacman", "Whea7s", "Loony", "FEARS"] },
  { name: "VexX Revenge", players: ["Slumber", "iLLSkiLL", "Mech", "Demon"] },
  { name: "Epsilon Esports", players: ["Jurd", "Swanny", "Tommey", "Flux"] },
  { name: "TCM-Gaming", players: ["MarkyB", "Moose", "GunShy", "MadCat"] },
  { name: "Xfinity Gaming", players: ["Muddawg", "Crowster", "SinfuL", "Doubt"] },
  { name: "Vitality.Rises", players: ["Gotaga", "BroKeN", "Krnage", "bLue"] },
  { name: "Team Kaliber", players: ["Sharp", "Theory", "Goonjar", "FormaL"] },
  { name: "Team Immunity", players: ["BuZZO", "Naked", "Shockz", "Rampage"] },
  { name: "WiLD Gaming", players: ["Brock", "Incepts", "Anticity", "NeXxX"] },
  { name: "Vitality.Returns", players: ["Agonie", "AzoX", "Getsom", "dyLux"] },
  { name: "Team RiZe ZA", players: ["JB", "ParadoxX", "Pupsky", "Mance"] },
  { name: "Team Orbit", players: ["EndurAAA", "Lewis", "Jacko", "BounCe"] },
  { name: "Lightning Pandas", players: ["ShAnE", "NeCRoMe", "RaMba", "Randm"] },
  { name: "SK Gaming", players: ["QuiCky", "Kivi", "RockZ", "raidN"] },
  { name: "TEC Intensity", players: ["Realize", "MeLo", "Robz", "Wonder"] },
  { name: "Wizards e-Sports Club", players: ["FlexZ", "T Mac", "KiNDoK", "JorGeh"] },
  { name: "New Star Player", players: ["ArtShot", "Doloshi", "BenjiNuri", "Turbo"] },
  { name: "KILLERFISH eSport", players: ["Blackk", "hAsbroken", "Theros", "AyKoN"] },
  { name: "Sublime Gaming", players: ["Kolgaa", "Frido", "Pibo", "POW3R"] },
  { name: "Real AllStars", players: ["Blackk", "Bissell", "Torres", "DaReDeViL"] },
  { name: "Reign Mix", players: ["Reece", "Joocy", "Vizze", "IceManN"] },
  { name: "Aztek Gaming", players: ["NeooosZ", "Clumzy", "Dynamic", "Afro"] },
];

export const GHOSTS_TEAMS = GHOSTS_TEAM_ROWS.map((row, index) => ({
  id: slug(row.name),
  name: row.name,
  tag: teamTag(row.name),
  shortName: teamTag(row.name),
  color: ["#2f80ed", "#27ae60", "#f2c94c", "#eb5757", "#9b51e0", "#56ccf2", "#f2994a", "#6fcf97"][index % 8],
  budgetTier: 3,
  eraId: "ghosts",
  eraLabel: "Ghosts",
  source: GHOSTS_SPREADSHEET_SOURCE,
  roster: row.players,
}));

export function makeGhostsPlayer(name, teamId, slot = 0, teamName = "") {
  const h = hashString(`${teamId}|${name}`);
  const base = 70 + (h % 17);
  const roles = ["Main AR", "Slayer SMG", "Objective", "Flex"];
  const primary = roles[slot % roles.length];
  const secondary = roles[(slot + 1) % roles.length];
  const overall = clamp(base + (slot === 0 ? 2 : 0), 60, 94);
  const basePlayer = {
    id: `${teamId}_${slug(name)}`,
    name,
    teamId,
    age: 19 + (h % 10),
    primary,
    secondary,
    region: "NA",
    salary: Math.round((overall / 99) * 180 + 20) * 1000,
    overall,
    potential: clamp(overall + 4 + ((h >> 3) % 9), overall, 99),
    gunny: attr(overall, h),
    awareness: attr(overall, h >> 3),
    objective: attr(overall, h >> 6),
    searchIQ: attr(overall, h >> 9),
    clutch: attr(overall, h >> 12),
    teamwork: attr(overall, h >> 15),
    composure: attr(overall, h >> 18),
    adaptability: attr(overall, h >> 21),
    ego: 1 + (h % 5),
    workEthic: 1 + ((h >> 3) % 5),
    tiltResistance: 1 + ((h >> 6) % 5),
    leadership: 1 + ((h >> 9) % 5),
    metaDependence: 1 + ((h >> 12) % 5),
    form: 70,
    experience: 1,
    isProspect: false,
    contractYears: 1 + (h % 3),
    eraId: "ghosts",
  };
  return applyHistoricalRating(basePlayer, "ghosts", teamName);
}

export const GHOSTS_PLAYERS = GHOSTS_TEAM_ROWS.flatMap((row) => {
  const teamId = slug(row.name);
  return row.players.map((name, index) => makeGhostsPlayer(name, teamId, index, row.name));
});

export function getGhostsRosterForTeam(teamId) {
  return GHOSTS_PLAYERS.filter(player => player.teamId === teamId);
}

export function getGhostsTeamOvr(teamId) {
  const roster = getGhostsRosterForTeam(teamId);
  if (!roster.length) return null;
  return Math.round(roster.reduce((sum, player) => sum + (player.overall || 0), 0) / roster.length);
}

export const AW_SPREADSHEET_SOURCE = "data/import/cod_manager_rosters_database.xlsx#Advanced Warfare";

export const AW_TEAM_ROWS = [
  { name: "OpTic Gaming", players: ["Scump", "FormaL", "Crimsix", "NaDeSHoT"] },
  { name: "Denial Esports", players: ["ZooMaa", "Replays", "JKap", "Attach"] },
  { name: "FaZe Clan", players: ["Slasher", "Enable", "Huke", "Apathy"] },
  { name: "Team EnVyUs", players: ["NAMELESS", "Saints", "Loony", "MerK"] },
  { name: "Team Kaliber", players: ["Sharp", "Theory", "Goonjar", "Neslo"] },
  { name: "Rise Nation", players: ["Pacman", "Whea7s", "Classic", "FEARS"] },
  { name: "Epsilon Esports", players: ["Swanny", "Jurd", "Tommey", "MadCat"] },
  { name: "Strictly Business", players: ["Censor", "Dedo", "StuDyy", "Karma"] },
  { name: "compLexity", players: ["Ricky", "Parasite", "Mirx", "ACHES"] },
  { name: "TCM-Gaming", players: ["MarkyB", "Moose", "Flux", "GunShy"] },
  { name: "Vitality.Rises", players: ["Gotaga", "BroKeN", "Krnage", "bLue"] },
  { name: "Team Immunity", players: ["BuZZO", "Naked", "Shockz", "Rampage"] },
];

export const AW_TEAMS = AW_TEAM_ROWS.map((row, index) => ({
  id: slug(row.name),
  name: row.name,
  tag: teamTag(row.name),
  shortName: teamTag(row.name),
  color: ["#2f80ed", "#27ae60", "#f2c94c", "#eb5757", "#9b51e0", "#56ccf2", "#f2994a", "#6fcf97"][index % 8],
  budgetTier: 3,
  eraId: "advanced_warfare",
  eraLabel: "Advanced Warfare",
  source: AW_SPREADSHEET_SOURCE,
  roster: row.players,
}));

export function makeAWPlayer(name, teamId, slot = 0, teamName = "") {
  const h = hashString(`${teamId}|${name}`);
  const base = 70 + (h % 17);
  const roles = ["Main AR", "Slayer SMG", "Objective", "Flex"];
  const primary = roles[slot % roles.length];
  const overall = clamp(base + (slot === 0 ? 2 : 0), 60, 94);
  const basePlayer = {
    id: `${teamId}_${slug(name)}`,
    name,
    teamId,
    age: 19 + (h % 10),
    primary,
    secondary: roles[(slot + 1) % roles.length],
    region: "NA",
    salary: Math.round((overall / 99) * 180 + 20) * 1000,
    overall,
    potential: clamp(overall + 4 + ((h >> 3) % 9), overall, 99),
    gunny: attr(overall, h),
    awareness: attr(overall, h >> 3),
    objective: attr(overall, h >> 6),
    searchIQ: attr(overall, h >> 9),
    clutch: attr(overall, h >> 12),
    teamwork: attr(overall, h >> 15),
    composure: attr(overall, h >> 18),
    adaptability: attr(overall, h >> 21),
    ego: 1 + (h % 5),
    workEthic: 1 + ((h >> 3) % 5),
    tiltResistance: 1 + ((h >> 6) % 5),
    leadership: 1 + ((h >> 9) % 5),
    metaDependence: 1 + ((h >> 12) % 5),
    form: 70,
    experience: 1,
    isProspect: false,
    contractYears: 1 + (h % 3),
    eraId: "advanced_warfare",
  };
  return applyHistoricalRating(basePlayer, "advanced_warfare", teamName);
}

export const AW_PLAYERS = AW_TEAM_ROWS.flatMap((row) => {
  const teamId = slug(row.name);
  return row.players.map((name, index) => makeAWPlayer(name, teamId, index, row.name));
});

// Get the historical AW target roster for a given team
export function getAWTargetRoster(teamId) {
  const row = AW_TEAM_ROWS.find(r => slug(r.name) === teamId);
  return row ? row.players : [];
}

// Get all AW players that are NEW (not in Ghosts rosters)
export function getNewAWEntrants() {
  const ghostsNames = new Set(GHOSTS_TEAM_ROWS.flatMap(r => r.players).map(n => n.toLowerCase()));
  const awNames = AW_TEAM_ROWS.flatMap(r => r.players);
  return [...new Set(awNames.filter(n => !ghostsNames.has(n.toLowerCase())))];
}

// Get players who were in Ghosts but not in any AW target roster
export function getGhostsPlayersNotInAW() {
  const awNames = new Set(AW_TEAM_ROWS.flatMap(r => r.players).map(n => n.toLowerCase()));
  const ghostsNames = GHOSTS_TEAM_ROWS.flatMap(r => r.players);
  return [...new Set(ghostsNames.filter(n => !awNames.has(n.toLowerCase())))];
}
