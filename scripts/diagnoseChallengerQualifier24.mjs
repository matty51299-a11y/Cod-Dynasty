import { buildInitialRoster } from "../src/data/players.js";
import { generateProspects } from "../src/data/prospects.js";
import { applyChallengerRatingOverride } from "../src/data/challengerRatingOverrides.js";
import { buildSeason, ensureChallengerTeams, buildChallengerRostersForNewGame, simStage, simChallengerQualifier, continueFromChallengerQualifier } from "../src/engine/seasonEngine.js";
import { ensureCdlRosterIntegrity } from "../src/engine/rosterAI.js";

function makeState(seed = 24024) {
  const state = {
    userTeamId: "optic",
    season: 1,
    players: buildInitialRoster().map(applyChallengerRatingOverride),
    prospects: generateProspects(seed).map(applyChallengerRatingOverride),
    schedule: buildSeason(1),
    notifications: [], feed: [], playerSeasonStats: {}, playerOvrHistory: {}, retiredPlayers: [], challengersLog: [], challengerTransactions: [],
  };
  buildChallengerRostersForNewGame(state, seed);
  ensureChallengerTeams(state);
  return ensureCdlRosterIntegrity(state, { windowType: "diagnose_challenger_qualifier_24" });
}

let state = makeState();
state = simStage(state);
if (state.schedule.phase !== "challengerQualifier") throw new Error(`Expected challengerQualifier phase, got ${state.schedule.phase}`);
const qualifier = state.schedule.currentChallengerQualifier;
const bracket = qualifier?.bracket;
console.log("Qualifier:", qualifier?.name, "field", qualifier?.field?.length, "type", bracket?.type);
console.table((bracket?.rounds || []).slice(0, 4).map(r => ({ round: r.name, type: r.type, matches: r.matches.length })));
if (qualifier.field.length !== 24) throw new Error(`Expected 24-team field, got ${qualifier.field.length}`);
if (bracket.type !== "DE24") throw new Error(`Expected DE24 bracket, got ${bracket.type}`);
if (bracket.rounds[0].name !== "WB Round 1") throw new Error(`First round should be WB Round 1, got ${bracket.rounds[0].name}`);
if (bracket.rounds[0].matches.length !== 8) throw new Error("Seeds 9-24 should play eight WB Round 1 matches.");
if ((bracket.byes || []).length !== 8) throw new Error("Seeds 1-8 should be recorded as byes.");

state = simChallengerQualifier(state);
const completed = state.schedule.currentChallengerQualifier;
const losses = Object.fromEntries((completed.field || []).map(row => [row.teamId, 0]));
for (const match of completed.matchLog || []) losses[match.loserId] = (losses[match.loserId] || 0) + 1;
const oneLossElims = completed.results.filter(r => r.placement > 4 && (losses[r.teamId] || 0) < 2);
const top4 = completed.results.filter(r => r.qualified).sort((a, b) => a.placement - b.placement);
console.table(completed.results.slice(0, 12).map(r => ({ team: r.teamName, seed: r.seed, place: r.placement, losses: losses[r.teamId], qualified: r.qualified })));
if (oneLossElims.length) throw new Error(`Teams eliminated with fewer than two losses: ${oneLossElims.map(t => t.teamName).join(", ")}`);
if (top4.length !== 4) throw new Error(`Expected 4 Major qualifiers, got ${top4.length}`);
state = continueFromChallengerQualifier(state);
if (state.schedule.phase !== "major") throw new Error(`Expected Major phase after qualifier, got ${state.schedule.phase}`);
const majorSeeds = state.schedule.majors[state.schedule.majorIdx].bracket.seeds || [];
if (majorSeeds.length !== 16) throw new Error(`Expected 16-team Pro-Am Major, got ${majorSeeds.length}`);
console.log("Challenger qualifier diagnostic passed.");
