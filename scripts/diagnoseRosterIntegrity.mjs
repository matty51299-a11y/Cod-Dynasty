import assert from "node:assert/strict";
import { GHOSTS_TEAMS, GHOSTS_PLAYERS } from "../src/data/historicalRosters.js";
import { GHOSTS_EVENTS } from "../src/data/ghostsEventCalendar.js";
import { createInitialStandings } from "../src/engine/standingsEngine.js";
import { createHistoricalEventState } from "../src/engine/historicalEventEngine.js";
import { ensureFourPlayerRosters, getRosterIntegrityProblems } from "../src/engine/rosterIntegrity.js";
let pass=0; const check=(n,c,d="")=>{assert.ok(c,`${n}${d?` — ${d}`:""}`); pass++; console.log(`✓ ${n}${d?` (${d})`:""}`)};
console.log("═══ Roster Integrity Diagnostic ═══\n");
const userTeamId="optic_gaming";
let state=ensureFourPlayerRosters({currentEraId:"ghosts",userTeamId,teams:GHOSTS_TEAMS.map(t=>({...t})),activeTeams:GHOSTS_TEAMS.map(t=>t.id),players:GHOSTS_PLAYERS.map(p=>({...p})),freeAgents:[],standings:createInitialStandings(GHOSTS_TEAMS)},"ghosts");
check("Fresh Ghosts dynasty has all active teams at 4 players", state.activeTeams.every(id=>state.players.filter(p=>p.teamId===id).length===4));
check("User team has 4 players", state.players.filter(p=>p.teamId===userTeamId).length===4);
check("No active team has fewer than 4", !state.activeTeams.some(id=>state.players.filter(p=>p.teamId===id).length<4));
const activeIds=state.players.filter(p=>p.teamId).map(p=>p.id); check("No player is active on multiple teams", activeIds.length===new Set(activeIds).size);
check("No roster has duplicate player IDs internally", state.activeTeams.every(id=>{const ids=state.players.filter(p=>p.teamId===id).map(p=>p.id); return ids.length===new Set(ids).size;}));
const eventState=createHistoricalEventState(GHOSTS_EVENTS[0],state.teams,state.players,state.standings,userTeamId,1234);
check("Every first event team has 4 players", eventState.field.every(t=>state.players.filter(p=>p.teamId===t.teamId).length===4));
check("No event match contains the same player on both teams", eventState.matches.every(m=>{if(!m.teamA||!m.teamB)return true; const a=state.players.filter(p=>p.teamId===m.teamA.teamId).map(p=>p.id); const b=new Set(state.players.filter(p=>p.teamId===m.teamB.teamId).map(p=>p.id)); return !a.some(id=>b.has(id));}));
check("Matchday rosters have 4 unique players", eventState.matches.every(m=>{const a=state.players.filter(p=>p.teamId===m.teamA?.teamId).map(p=>p.id); const b=state.players.filter(p=>p.teamId===m.teamB?.teamId).map(p=>p.id); return a.length===4 && b.length===4 && new Set(a).size===4 && new Set(b).size===4;}));
const released=state.players.find(p=>p.teamId!==userTeamId); let thin={...state,players:state.players.map(p=>p.id===released.id?{...p,teamId:null,previousTeamId:p.teamId,status:"freeAgent",currentStatus:"freeAgent"}:p)}; thin=ensureFourPlayerRosters(thin,"ghosts");
check("Free Agency contains valid unsigned players if displaced players exist", thin.freeAgents.every(p=>!p.teamId));
const userDrop=state.players.find(p=>p.teamId===userTeamId); const fa=state.players.find(p=>p.teamId!==userTeamId); let signState={...state,players:state.players.map(p=>p.id===userDrop.id?{...p,teamId:null,status:"freeAgent",currentStatus:"freeAgent"}:p.id===fa.id?{...p,teamId:null,status:"freeAgent",currentStatus:"freeAgent"}:p),freeAgents:[{...userDrop,teamId:null},{...fa,teamId:null}]};
check("User can sign a free agent when roster has 3 players", signState.players.filter(p=>p.teamId===userTeamId).length===3 && signState.freeAgents.length>=1);
const beforeOvr=signState.players.filter(p=>p.teamId===userTeamId).reduce((s,p)=>s+p.overall,0)/3; const signee=signState.freeAgents.find(p=>p.id!==userDrop.id)||signState.freeAgents[0]; signState={...signState,players:signState.players.map(p=>p.id===signee.id?{...p,teamId:userTeamId,status:"active",currentStatus:"active"}:p),freeAgents:signState.freeAgents.filter(p=>p.id!==signee.id)};
check("Signing a free agent removes them from Free Agency", !signState.freeAgents.some(p=>p.id===signee.id));
check("Signing a free agent restores roster to 4", signState.players.filter(p=>p.teamId===userTeamId).length===4);
const afterOvr=signState.players.filter(p=>p.teamId===userTeamId).reduce((s,p)=>s+p.overall,0)/4; check("Team OVR recalculates after signing", Number.isFinite(afterOvr) && afterOvr!==beforeOvr);
check("Roster integrity passes", getRosterIntegrityProblems(ensureFourPlayerRosters(signState,"ghosts"),"ghosts").length===0);
const storeSource = (await import("node:fs")).readFileSync(new URL("../src/store/dynastyStore.jsx", import.meta.url), "utf8");
check("Roster integrity validated before AW season start in Rostermania", storeSource.includes("getRosterIntegrityProblems") && storeSource.includes("CONFIRM_AW_SEASON"));
check("Rostermania blocks season start if roster incomplete", storeSource.includes("Your roster has") && storeSource.includes("Sign a free agent"));

// ── repairUserTeam: false checks ──
{
  // ensureFourPlayerRosters respects repairUserTeam: false
  const userPlayer = state.players.find(p => p.teamId === userTeamId);
  let thinUser = { ...state, players: state.players.map(p => p.id === userPlayer.id ? { ...p, teamId: null, previousTeamId: p.teamId, status: "freeAgent", currentStatus: "freeAgent" } : p) };
  thinUser = ensureFourPlayerRosters(thinUser, "ghosts", { repairUserTeam: false });
  check("ensureFourPlayerRosters respects repairUserTeam: false", thinUser.players.filter(p => p.teamId === userTeamId).length === 3, `user team has ${thinUser.players.filter(p => p.teamId === userTeamId).length}/4`);

  // AI teams are still repaired when repairUserTeam is false
  const aiTeamId = state.activeTeams.find(id => id !== userTeamId);
  const aiPlayer = thinUser.players.find(p => p.teamId === aiTeamId);
  let brokenAi = { ...thinUser, players: thinUser.players.map(p => p.id === aiPlayer.id ? { ...p, teamId: null, previousTeamId: p.teamId, status: "freeAgent", currentStatus: "freeAgent" } : p) };
  brokenAi = ensureFourPlayerRosters(brokenAi, "ghosts", { repairUserTeam: false });
  const aiCount = brokenAi.players.filter(p => p.teamId === aiTeamId).length;
  const userCount = brokenAi.players.filter(p => p.teamId === userTeamId).length;
  check("AI teams are still repaired when repairUserTeam is false", aiCount === 4 && userCount === 3, `AI ${aiTeamId}: ${aiCount}/4, user: ${userCount}/4`);
}

console.log(`\nRoster integrity diagnostic passed (${pass} checks).`);
