import assert from "node:assert/strict";
import { resolveSigningSlot, autoPickStarterIds, hasDuplicateRosterIds } from "../src/utils/rosterSlots.js";
import { getTeamRosterStatus, getRosterIncompleteMessage } from "../src/utils/rosterValidation.js";
import { simMatch } from "../src/engine/matchSim.js";
import { buildTransferResult, migrateTransferMarket } from "../src/engine/transferEngine.js";

const teamId = "boston";
const otherTeamId = "atlanta";
const mk = (id, overall, isSub = false, team = teamId) => ({
  id, name: id, teamId: team, isSub, overall, potential: overall,
  primary: "Flex", gunny: overall, awareness: overall, objective: overall,
  searchIQ: overall, clutch: overall, teamwork: overall, composure: overall,
  adaptability: overall, form: 70, contractYears: 2, salary: 25_000,
  status: "cdl", circuit: "cdl",
});

function applySign(players, player) {
  const slot = resolveSigningSlot(players, teamId, "starter");
  return [...players, { ...player, teamId, isSub: slot === "sub" }];
}

function starters(players) { return players.filter(p => p.teamId === teamId && !p.isSub); }
function bench(players) { return players.filter(p => p.teamId === teamId && p.isSub); }

let players = [mk("s1", 75), mk("s2", 76), mk("s3", 77)];
players = applySign(players, mk("new_open", 80, false, null));
assert.equal(players.find(p => p.id === "new_open").isSub, false, "open starter slot signing becomes starter");
assert.equal(starters(players).length, 4);

players = applySign(players, mk("new_full", 90, false, null));
assert.equal(players.find(p => p.id === "new_full").isSub, true, "full starter lineup signing becomes bench");
assert.equal(starters(players).length, 4);
assert.equal(bench(players).length, 1);
assert.equal(hasDuplicateRosterIds(players, teamId), false, "no duplicate after signing");

// Promote with full starters is a swap: selected sub in, selected starter out.
players = players.map(p => p.id === "new_full" ? { ...p, isSub: false } : p.id === "s1" ? { ...p, isSub: true } : p);
assert.equal(players.find(p => p.id === "new_full").isSub, false, "promote/swap puts sub into starters");
assert.equal(players.find(p => p.id === "s1").isSub, true, "promote/swap moves starter to bench");
assert.equal(starters(players).length, 4);

// Explicit swap back.
players = players.map(p => p.id === "new_full" ? { ...p, isSub: true } : p.id === "s1" ? { ...p, isSub: false } : p);
assert.equal(players.find(p => p.id === "s1").isSub, false, "swap restores starter");
assert.equal(players.find(p => p.id === "new_full").isSub, true, "swap moves sub back to bench");

const bestIds = autoPickStarterIds(players, teamId, 4);
players = players.map(p => p.teamId === teamId ? { ...p, isSub: !bestIds.has(p.id) } : p);
assert.deepEqual(starters(players).map(p => p.id).sort(), ["new_full", "new_open", "s2", "s3"].sort(), "auto pick chooses top 4 OVR");
assert.equal(hasDuplicateRosterIds(players, teamId), false, "no duplicate after auto pick");

const thin = players.map(p => p.id === "s2" ? { ...p, isSub: true } : p);
assert.equal(getTeamRosterStatus(thin, teamId).valid, false, "thin roster is invalid for matchday");
assert.match(getRosterIncompleteMessage({ players: thin, userTeamId: teamId, userTeamType: "cdl" }), /Roster incomplete.+3\/4 starters.+Promote or sign 1 more player/);

// simMatch consumes the first four players supplied; seasonEngine now orders starters before bench.
const matchPlayers = [...starters(players), ...bench(players)];
const result = simMatch({ id: teamId, name: "User", players: matchPlayers }, { id: otherTeamId, name: "Other", players: [mk("o1", 70, false, otherTeamId), mk("o2", 70, false, otherTeamId), mk("o3", 70, false, otherTeamId), mk("o4", 70, false, otherTeamId)] }, 1234);
assert.equal(Boolean(result.playerStats?.new_full), true, "selected starter appears in match stats");
assert.equal(Boolean(result.playerStats?.s1), false, "bench player is not used in match stats");

// Transfer user-buying path: open starter slots start, full starter slots bench.
const transferBase = {
  userTeamId: teamId,
  season: 1,
  schedule: { phase: "stage", stageIdx: 0 },
  players: [mk("t1", 72), mk("t2", 73), mk("t3", 74), mk("seller_target", 82, false, otherTeamId)],
  transferMarket: migrateTransferMarket(null),
};
let tr = buildTransferResult(transferBase, { fromTeamId: teamId, toTeamId: otherTeamId, playerId: "seller_target", id: "n1" }, 25_000, { salary: 25_000, contractYears: 2, promisedRole: "Starter" });
assert.equal(tr.players.find(p => p.id === "seller_target").isSub, false, "transfer with open starter slot becomes starter");
const fullTransferBase = { ...transferBase, players: [mk("t1", 72), mk("t2", 73), mk("t3", 74), mk("t4", 75), mk("seller_target", 82, false, otherTeamId)] };
tr = buildTransferResult(fullTransferBase, { fromTeamId: teamId, toTeamId: otherTeamId, playerId: "seller_target", id: "n2" }, 25_000, { salary: 25_000, contractYears: 2, promisedRole: "Starter" });
assert.equal(tr.players.find(p => p.id === "seller_target").isSub, true, "transfer with full starters becomes bench");

console.log("diagnoseUserRosterControls: all checks passed");
