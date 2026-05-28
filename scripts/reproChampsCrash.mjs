// Reproduces the Champs blank-screen crash by simulating a full Season 1
// through Champs entirely at the engine level.
import { buildInitialRoster } from "../src/data/players.js";
import { generateProspects } from "../src/data/prospects.js";
import { applyChallengerRatingOverride } from "../src/data/challengerRatingOverrides.js";
import { normalizePlayerName } from "../src/utils/playerIdentity.js";
import { CDL_TEAMS } from "../src/data/teams.js";
import {
  buildSeason,
  beginChamps,
  debugMajorBracketState,
  ensureChallengerTeams,
  simMajor,
  simStage,
  simChallengerQualifier,
  continueFromChallengerQualifier,
} from "../src/engine/seasonEngine.js";

function newGame(seed = 12345) {
  const players = buildInitialRoster().map(applyChallengerRatingOverride);
  const rawProspects = generateProspects(seed).map(applyChallengerRatingOverride);
  const seen = new Set();
  const prospects = rawProspects.filter((p) => {
    const key = normalizePlayerName(p.name);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const state = {
    userTeamId: "atlanta_faze",
    season: 1,
    players,
    prospects,
    schedule: buildSeason(1),
    notifications: [],
    feed: [],
    saveExists: true,
    enteredMajorIdx: null,
    playerSeasonStats: {},
    playerOvrHistory: {},
    challengersLog: [],
    challengerTransactions: [],
  };
  ensureChallengerTeams(state);
  return state;
}

function snapshot(label, state) {
  const s = state.schedule;
  const dump = {
    label,
    season: s.season,
    phase: s.phase,
    stageIdx: s.stageIdx,
    majorIdx: s.majorIdx,
    currentMajor: s.majorIdx != null ? {
      name: s.majors[s.majorIdx]?.name,
      hasBracket: !!s.majors[s.majorIdx]?.bracket,
      bracketType: s.majors[s.majorIdx]?.bracket?.type,
      seedsCount: s.majors[s.majorIdx]?.bracket?.seeds?.length,
      completed: s.majors[s.majorIdx]?.completed,
    } : null,
    currentMajorEventTeams: s.currentMajorEventTeams
      ? Object.keys(s.currentMajorEventTeams)
      : null,
    enteredMajorIdx: state.enteredMajorIdx,
  };
  console.log(JSON.stringify(dump, null, 2));
}

let state = newGame();

for (let stageIdx = 0; stageIdx < 4; stageIdx++) {
  snapshot(`before stage ${stageIdx + 1}`, state);
  state = simStage(state);
  snapshot(`after stage ${stageIdx + 1}`, state);

  if (state.schedule.phase === "challengerQualifier") {
    state = simChallengerQualifier(state);
    snapshot(`after qualifier (stage ${stageIdx + 1})`, state);
    state = continueFromChallengerQualifier(state);
    snapshot(`after continueFromChallengerQualifier (stage ${stageIdx + 1})`, state);
  }

  if (state.schedule.phase !== "major") {
    console.error(`Expected major phase after qualifier, got ${state.schedule.phase}`);
    process.exit(1);
  }

  state = simMajor(state);
  snapshot(`after major ${stageIdx + 1}`, state);
}

// At this point phase should be preChamps.
if (state.schedule.phase !== "preChamps") {
  console.error(`Expected preChamps after Major 4, got ${state.schedule.phase}`);
  process.exit(1);
}

// Enter Champs.
console.log("\n--- entering Champs via beginChamps ---");
let crashed = false;
try {
  state = beginChamps(state);
} catch (err) {
  crashed = true;
  console.error("beginChamps threw:", err.stack || err);
}
snapshot("after beginChamps", state);

if (state.schedule.phase !== "major" || state.schedule.majorIdx !== 4) {
  console.error("Champs did not enter major phase / idx 4 correctly");
  process.exit(1);
}

const champsBracket = state.schedule.majors[4]?.bracket;
console.log("Champs bracket seeds:", champsBracket?.seeds);
console.log("Champs bracket type:", champsBracket?.type);
console.log("Champs bracket round count:", champsBracket?.rounds?.length);
console.log(
  "Champs bracket WBR1 matches:",
  JSON.stringify(champsBracket?.rounds?.[0]?.matches?.map(m => ({ a: m.a, b: m.b, seedA: m.seedA, seedB: m.seedB })), null, 2)
);
console.log("Champs eventTeams keys:", Object.keys(state.schedule.currentMajorEventTeams ?? {}));

// Validate every seed resolves to either a CDL team or an event-team entry.
const cdlIds = new Set(CDL_TEAMS.map(t => t.id));
const evIds = new Set(Object.keys(state.schedule.currentMajorEventTeams ?? {}));
const unresolved = (champsBracket?.seeds ?? []).filter(id => !cdlIds.has(id) && !evIds.has(id));
if (unresolved.length) {
  console.error("UNRESOLVED Champs seeds:", unresolved);
}

// Sim through Champs
try {
  state = simMajor(state);
  snapshot("after simMajor (Champs)", state);
} catch (err) {
  crashed = true;
  console.error("simMajor (Champs) threw:", err.stack || err);
}

const champsAfter = state.schedule.majors[4];
console.log("Champs completed:", champsAfter?.completed);
console.log("Champion:", champsAfter?.bracket?.champion);
console.log("Phase after Champs:", state.schedule.phase);

process.exit(crashed ? 1 : 0);
