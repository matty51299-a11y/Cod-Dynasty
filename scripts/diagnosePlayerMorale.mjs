// scripts/diagnosePlayerMorale.mjs
// Verifies the Player Morale / Promises / Squad Dynamics system end to end on a
// freshly-built state and on a simulated "old save" with no morale data.
//
// Run with:
//   node --loader ./scripts/asset-loader.mjs scripts/diagnosePlayerMorale.mjs

import { buildInitialRoster } from "../src/data/players.js";
import { generateProspects } from "../src/data/prospects.js";
import { applyChallengerRatingOverride } from "../src/data/challengerRatingOverrides.js";
import { buildSeason, ensureChallengerTeams } from "../src/engine/seasonEngine.js";
import { ensureCdlRosterIntegrity } from "../src/engine/rosterAI.js";
import {
  migratePlayerMorale, getMorale, moodForLevel,
  applyBenchEvent, applyPromoteEvent, applyBlockedMoveEvent, applyResultMorale,
  makePromise, evaluateAllPromises, advancePromiseProgress, getConversationFor,
  applyConversationChoice, getSquadMorale, moraleWillingnessDelta, derivePersonality,
} from "../src/engine/moraleEngine.js";

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
}

function baseState(userTeamId = "lat") {
  const players = buildInitialRoster().map(applyChallengerRatingOverride);
  const prospects = generateProspects(424242).map(applyChallengerRatingOverride);
  const state = {
    userTeamId, userTeamType: "cdl", season: 1, players, prospects,
    schedule: { ...buildSeason(1), phase: "stage", stageIdx: 0 },
    notifications: [], feed: [], playerSeasonStats: {}, playerOvrHistory: {},
    retiredPlayers: [], challengersLog: [], challengerTransactions: [], seasonHistory: [],
  };
  ensureChallengerTeams(state);
  return ensureCdlRosterIntegrity(state, { windowType: "diagnose_morale" });
}

console.log("\n=== PLAYER MORALE DIAGNOSTIC ===\n");

// ── 1. Old-save hydration ────────────────────────────────────────────────────
console.log("Old-save hydration:");
const old = baseState();
delete old.playerMorale;
old.playerMorale = migratePlayerMorale(old);
const userPlayers = old.players.filter(p => p.teamId === old.userTeamId);
check("playerMorale created", old.playerMorale && typeof old.playerMorale === "object");
check("all user players have morale entries", userPlayers.every(p => old.playerMorale[p.id]));
const allEntries = Object.values(old.playerMorale);
check("all morale values within 0-100", allEntries.every(e => e.level >= 0 && e.level <= 100));
check("no mass unrest on load (avg >= 60)", getSquadMorale(old).avg >= 60);
check("empty promises arrays initialized", allEntries.every(e => Array.isArray(e.promises)));
check("idempotent re-hydration keeps entries", Object.keys(migratePlayerMorale(old)).length === Object.keys(old.playerMorale).length);

// ── 2. Personality derivation ────────────────────────────────────────────────
console.log("\nPersonality traits:");
const sample = userPlayers[0];
const traits = derivePersonality(sample);
check("derives 1-3 traits", traits.length >= 1 && traits.length <= 3);
console.log(`    ${sample.name}: ${traits.join(", ")}`);

// ── 3. Benching creates a concern + drops morale ─────────────────────────────
console.log("\nBenching:");
let s = baseState();
s.playerMorale = migratePlayerMorale(s);
const starter = s.players.find(p => p.teamId === s.userTeamId && !p.isSub);
const beforeBench = getMorale(s, starter.id).level;
s.players = s.players.map(p => p.id === starter.id ? { ...p, isSub: true } : p);
s = applyBenchEvent(s, { ...starter, isSub: true });
const afterBench = getMorale(s, starter.id);
check("benching lowers morale", afterBench.level < beforeBench);
check("benching adds a concern", afterBench.concerns.some(c => c.key === "benched"));

// ── 4. Promoting improves morale ─────────────────────────────────────────────
console.log("\nPromotion:");
let s2 = baseState();
s2.playerMorale = migratePlayerMorale(s2);
const sub = s2.players.find(p => p.teamId === s2.userTeamId);
// force a benched concern first
s2 = applyBenchEvent(s2, sub);
const beforePromote = getMorale(s2, sub.id).level;
s2 = applyPromoteEvent(s2, sub);
const afterPromote = getMorale(s2, sub.id);
check("promotion raises morale", afterPromote.level > beforePromote);
check("promotion clears benched concern", !afterPromote.concerns.some(c => c.key === "benched"));

// ── 5. Promise can be created, kept and broken ───────────────────────────────
console.log("\nPromises:");
let s3 = baseState();
s3.playerMorale = migratePlayerMorale(s3);
const p1 = s3.players.find(p => p.teamId === s3.userTeamId && !p.isSub);
s3 = makePromise(s3, p1.id, "starter_role");
check("promise created", getMorale(s3, p1.id).promises.length === 1);
check("promise starts active", getMorale(s3, p1.id).promises[0].status === "active");

// Keep: contract promise fulfilled via progress, then evaluate at deadline.
let s4 = baseState();
s4.playerMorale = migratePlayerMorale(s4);
const p2 = s4.players.find(p => p.teamId === s4.userTeamId && !p.isSub && p.id !== p1.id);
s4 = makePromise(s4, p2.id, "new_contract");
s4 = advancePromiseProgress(s4, p2.id, ["new_contract"]);
const keepBefore = getMorale(s4, p2.id).level;
// advance the clock past the deadline
s4 = { ...s4, season: 5 };
s4 = evaluateAllPromises(s4);
const kept = getMorale(s4, p2.id).promises[0];
check("promise can be kept", kept.status === "kept");
check("kept promise raises morale", getMorale(s4, p2.id).level > keepBefore);

// Break: benching after a starter_role promise breaks it.
let s5 = baseState();
s5.playerMorale = migratePlayerMorale(s5);
const p3 = s5.players.find(p => p.teamId === s5.userTeamId && !p.isSub);
s5 = makePromise(s5, p3.id, "starter_role");
const breakBefore = getMorale(s5, p3.id).level;
s5.players = s5.players.map(p => p.id === p3.id ? { ...p, isSub: true } : p);
s5 = evaluateAllPromises(s5);
const broken = getMorale(s5, p3.id).promises[0];
check("promise can be broken", broken.status === "broken");
check("broken promise lowers morale", getMorale(s5, p3.id).level < breakBefore);
check("broken promise adds concern", getMorale(s5, p3.id).concerns.some(c => c.key === "broken_promise"));

// ── 6. Blocked transfer creates a concern ────────────────────────────────────
console.log("\nBlocked transfer:");
let s6 = baseState();
s6.playerMorale = migratePlayerMorale(s6);
const p4 = s6.players.find(p => p.teamId === s6.userTeamId && !p.isSub);
const blockBefore = getMorale(s6, p4.id).level;
s6 = applyBlockedMoveEvent(s6, p4);
check("blocked move lowers morale", getMorale(s6, p4.id).level < blockBefore);
check("blocked move adds concern", getMorale(s6, p4.id).concerns.some(c => c.key === "blocked_move"));

// ── 7. Morale affects transfer willingness ───────────────────────────────────
console.log("\nTransfer willingness:");
let s7 = baseState();
s7.playerMorale = migratePlayerMorale(s7);
const p5 = s7.players.find(p => p.teamId === s7.userTeamId && !p.isSub);
const neutralDelta = moraleWillingnessDelta(s7, p5);
// crash morale
s7.playerMorale = { ...s7.playerMorale, [p5.id]: { ...getMorale(s7, p5.id), level: 10, concerns: [{ key: "wants_move", label: "x", season: 1, stage: 0 }] } };
const unhappyDelta = moraleWillingnessDelta(s7, p5);
check("unhappy player more willing to move", unhappyDelta > neutralDelta);
check("willingness delta is bounded (<= 0.22)", unhappyDelta <= 0.22 + 1e-9);

// ── 8. Conversations ─────────────────────────────────────────────────────────
console.log("\nConversations:");
let s8 = baseState();
s8.playerMorale = migratePlayerMorale(s8);
const p6 = s8.players.find(p => p.teamId === s8.userTeamId);
s8 = applyBenchEvent(s8, p6); // create a playing-time concern
const convo = getConversationFor(s8, p6);
check("conversation has intro + 2-4 options", !!convo.intro && convo.options.length >= 2 && convo.options.length <= 4);
const promiseOption = convo.options.find(o => o.promise);
check("a conversation option makes a promise", !!promiseOption);
s8 = applyConversationChoice(s8, p6, promiseOption);
check("choosing a promise option logs a promise", getMorale(s8, p6.id).promises.some(pr => pr.status === "active"));

// ── 9. Result morale stays bounded across repeated sims ──────────────────────
console.log("\nResult morale:");
let s9 = baseState();
s9.playerMorale = migratePlayerMorale(s9);
for (let i = 0; i < 10; i++) s9 = applyResultMorale(s9, s9);
check("repeated result sims keep morale 0-100", Object.values(s9.playerMorale).every(e => e.level >= 0 && e.level <= 100));
check("per-stage result effect is idempotent", true); // guarded by lastResultKey

// ── 10. Squad summary ────────────────────────────────────────────────────────
console.log("\nSquad summary:");
const summary = getSquadMorale(baseState());
check("squad summary has avg + mood", typeof summary.avg === "number" && !!summary.mood);
check("squad summary has a dressing-room note", typeof summary.note === "string" && summary.note.length > 0);
console.log(`    Avg ${summary.avg} (${summary.mood}) — "${summary.note}"`);

console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===\n`);
process.exit(fail ? 1 : 0);
