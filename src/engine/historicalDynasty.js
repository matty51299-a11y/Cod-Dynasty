import { getEra, getNextEra, HISTORICAL_START_ERA_ID } from "../data/codEras.js";
import { HISTORICAL_ROOKIE_CLASSES } from "../data/historicalRookieClasses.js";

function clamp(v, min = 40, max = 99) { return Math.max(min, Math.min(max, Math.round(v))); }
function hashString(str) { let h = 2166136261; for (const ch of String(str || "")) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function attr(base, salt) { return clamp(base + ((salt % 13) - 6)); }

export function migrateHistoricalDynastyState(state) {
  const careerMode = "historical";
  const era = getEra(state?.currentEraId || HISTORICAL_START_ERA_ID);
  return {
    ...state,
    careerMode,
    currentEraId: era.id,
    currentGameTitle: state?.currentGameTitle || era.gameTitle,
    historicalSeasonIndex: Number.isFinite(state?.historicalSeasonIndex) ? state.historicalSeasonIndex : 0,
    eraHistory: Array.isArray(state?.eraHistory) ? state.eraHistory : [],
    introducedRookieClassIds: Array.isArray(state?.introducedRookieClassIds) ? state.introducedRookieClassIds : [],
    pendingEraTransition: state?.pendingEraTransition || null,
  };
}

export function buildHistoricalProspect(row, eraId) {
  const overall = clamp(row.initialOvr ?? 68);
  const potential = clamp(row.potential ?? overall + 10);
  const h = hashString(`${row.id}|${eraId}`);
  return {
    id: row.id,
    name: row.name,
    teamId: null,
    challengerTeamId: null,
    primary: row.role || "Flex",
    secondary: "Flex",
    region: row.region || "NA",
    age: 18 + (h % 4),
    developmentCurve: potential - overall >= 14 ? "late" : "standard",
    salary: Math.round((overall / 99) * 50 + 15) * 1000,
    overall,
    potential,
    gunny: attr(overall, h), awareness: attr(overall, h >> 3), objective: attr(overall, h >> 6), searchIQ: attr(overall, h >> 9),
    clutch: attr(overall, h >> 12), teamwork: attr(overall, h >> 15), composure: attr(overall, h >> 18), adaptability: attr(overall, h >> 21),
    ego: 1 + (h % 5), workEthic: 1 + ((h >> 3) % 5), tiltResistance: 1 + ((h >> 6) % 5), leadership: 1 + ((h >> 9) % 5), metaDependence: 1 + ((h >> 12) % 5),
    scoutedOverall: overall, scoutedPotential: potential, scouted: false, form: 65, experience: 0, isProspect: true, contractYears: 0,
    status: "challengers", debutEraId: eraId, rookieClassId: `${eraId}_rookies`, eraFitTraits: row.traits || [],
  };
}

export function introduceHistoricalRookieClass(state, eraId) {
  const era = getEra(eraId);
  const classId = era.rookieClassId || `${era.id}_rookies`;
  if (!state || state.careerMode !== "historical" || !classId) return state;
  const introduced = new Set(state.introducedRookieClassIds || []);
  if (introduced.has(classId)) return state;
  const existingIds = new Set([...(state.players || []), ...(state.prospects || [])].map(p => p.id));
  const rookies = (HISTORICAL_ROOKIE_CLASSES[era.id] || [])
    .map(row => buildHistoricalProspect(row, era.id))
    .filter(p => !existingIds.has(p.id));
  return {
    ...state,
    prospects: [...(state.prospects || []), ...rookies],
    introducedRookieClassIds: [...introduced, classId],
  };
}

export function createHistoricalStateFields() {
  const era = getEra(HISTORICAL_START_ERA_ID);
  return { careerMode: "historical", currentEraId: era.id, currentGameTitle: era.gameTitle, historicalSeasonIndex: 0, eraHistory: [], introducedRookieClassIds: [], pendingEraTransition: null };
}

export function advanceHistoricalEraIfNeeded(state) {
  const migrated = migrateHistoricalDynastyState(state);
  if (migrated.careerMode !== "historical") return migrated;
  const previousEra = getEra(migrated.currentEraId);
  const nextEra = getNextEra(previousEra.id);
  if (!nextEra) return migrated;
  let next = {
    ...migrated,
    currentEraId: nextEra.id,
    currentGameTitle: nextEra.gameTitle,
    historicalSeasonIndex: (migrated.historicalSeasonIndex || 0) + 1,
    eraHistory: [...(migrated.eraHistory || []), { fromEraId: previousEra.id, toEraId: nextEra.id, season: migrated.season ?? migrated.schedule?.season ?? 1, previousTitle: previousEra.gameTitle, newTitle: nextEra.gameTitle }],
    pendingEraTransition: { previousEraId: previousEra.id, newEraId: nextEra.id, previousTitle: previousEra.gameTitle, newTitle: nextEra.gameTitle, movementStyle: nextEra.movementStyle, modes: nextEra.modes, rookieClassId: nextEra.rookieClassId, rulesNote: nextEra.rulesNote },
  };
  return introduceHistoricalRookieClass(next, nextEra.id);
}
