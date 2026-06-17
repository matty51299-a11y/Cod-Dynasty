import assert from "node:assert/strict";
import { writeFileSync, mkdirSync } from "node:fs";
import { GHOSTS_TEAMS, GHOSTS_PLAYERS, AW_TEAMS, AW_PLAYERS } from "../src/data/historicalRosters.js";
import { ADVANCED_WARFARE_EVENTS } from "../src/data/advancedWarfareEventCalendar.js";
import { createInitialStandings } from "../src/engine/standingsEngine.js";
import { createHistoricalEventState } from "../src/engine/historicalEventEngine.js";
import { ensureFourPlayerRosters, getRosterIntegrityProblems } from "../src/engine/rosterIntegrity.js";
import { findPlayerLocation } from "../src/utils/playerLocation.js";
let pass=0; const check=(n,c,d="")=>{assert.ok(c,`${n}${d?` — ${d}`:""}`); pass++; console.log(`✓ ${n}${d?` (${d})`:""}`)};
console.log("═══ Advanced Warfare Transition Diagnostic ═══\n");
const userTeamId="optic_gaming";
const ghosts=ensureFourPlayerRosters({currentEraId:"ghosts",userTeamId,teams:GHOSTS_TEAMS,activeTeams:GHOSTS_TEAMS.map(t=>t.id),players:GHOSTS_PLAYERS.map(p=>({...p})),freeAgents:[],standings:createInitialStandings(GHOSTS_TEAMS)},"ghosts");
const beforeIds=new Set(ghosts.players.map(p=>p.id)); const userRoster=new Set(ghosts.players.filter(p=>p.teamId===userTeamId).map(p=>p.id)); const consumed=new Set(); const rows=[]; let players=[];
for (const awp of AW_PLAYERS) { const protectedExisting=ghosts.players.find(p=>userRoster.has(p.id)&&p.name.toLowerCase()===awp.name.toLowerCase()); if(protectedExisting){ consumed.add(protectedExisting.id); players.push({...protectedExisting,previousTeamId:protectedExisting.teamId,teamId:userTeamId,status:"active",currentStatus:"active"}); rows.push([protectedExisting.id,protectedExisting.displayName||protectedExisting.name,protectedExisting.teamId,userTeamId,"preserved_on_user_roster","controlled roster protected; AW duplicate skipped"]); continue; } const match=ghosts.players.find(p=>!consumed.has(p.id)&&p.name.toLowerCase()===awp.name.toLowerCase()); if(match){consumed.add(match.id); const protectedTarget=awp.teamId===userTeamId; players.push({...match,...awp,id:match.id,previousTeamId:match.teamId,teamId:protectedTarget?null:awp.teamId,status:protectedTarget?"free_agent":"active",currentStatus:protectedTarget?"free_agent":"active"}); rows.push([match.id,match.displayName||match.name,match.teamId,protectedTarget?"Free Agency":awp.teamId,protectedTarget?"moved_to_free_agency":"assigned_to_aw_team",protectedTarget?"controlled org protected":"matched AW spreadsheet"]);} else {const protectedTarget=awp.teamId===userTeamId; players.push({...awp,debutEraId:"advanced_warfare",teamId:protectedTarget?null:awp.teamId,status:protectedTarget?"free_agent":"active",currentStatus:protectedTarget?"free_agent":"active"}); rows.push([awp.id,awp.displayName||awp.name,"",protectedTarget?"Free Agency":awp.teamId,protectedTarget?"moved_to_free_agency":"assigned_to_aw_team",protectedTarget?"controlled org protected":"new AW entrant"]);} }
for (const p of ghosts.players) if(!consumed.has(p.id)){ if(userRoster.has(p.id)){players.push({...p,teamId:userTeamId,status:"active",currentStatus:"active"}); rows.push([p.id,p.displayName||p.name,p.teamId,userTeamId,"preserved_on_user_roster","controlled roster protected"]);} else {players.push({...p,previousTeamId:p.teamId,teamId:null,status:"free_agent",currentStatus:"free_agent",contractYears:0}); rows.push([p.id,p.displayName||p.name,p.teamId,"Free Agency","moved_to_free_agency","not on AW active roster"]);} }
let aw=ensureFourPlayerRosters({currentEraId:"advanced_warfare",userTeamId,teams:AW_TEAMS,activeTeams:AW_TEAMS.map(t=>t.id),players,freeAgents:players.filter(p=>!p.teamId),standings:createInitialStandings(AW_TEAMS),eventCalendar:ADVANCED_WARFARE_EVENTS},"advanced_warfare");
const afterIds=new Set(aw.players.map(p=>p.id)); for(const id of beforeIds) if(!afterIds.has(id)) rows.push([id,"","","","missing_error","Ghosts player absent after transition"]);
mkdirSync("data/research",{recursive:true}); writeFileSync("data/research/aw_transition_report.csv", [["playerId","displayName","previousTeam","newTeam","status","reason"],...rows].map(r=>r.map(v=>`"${String(v??"").replaceAll('"','""')}"`).join(",")).join("\n"));
const eventState=createHistoricalEventState(ADVANCED_WARFARE_EVENTS[0],aw.teams,aw.players,aw.standings,userTeamId,42);
check("Ghosts season advances to AW", aw.currentEraId==="advanced_warfare");
check("All AW teams from the AW sheet are loaded", aw.teams.length===AW_TEAMS.length && aw.activeTeams.length===AW_TEAMS.length);
check("Every active AW team has 4 players", aw.activeTeams.every(id=>aw.players.filter(p=>p.teamId===id).length===4));
check("No AW team has 3 players", !aw.activeTeams.some(id=>aw.players.filter(p=>p.teamId===id).length===3));
check("Ghosts players do not disappear", [...beforeIds].every(id=>afterIds.has(id)));
check("Displaced Ghosts players move to Free Agency", aw.freeAgents.some(p=>p.previousTeamId));
check("AW Free Agency is populated when displaced/unassigned players exist", aw.freeAgents.length>0);
check("User roster is preserved and has 4 players", [...userRoster].every(id=>aw.players.find(p=>p.id===id)?.teamId===userTeamId) && aw.players.filter(p=>p.teamId===userTeamId).length===4);
for (const important of ["TeePee","Karma","Crimsix","FormaL","ACHES"]) { const active = aw.players.filter(p=>p.teamId&&p.name.toLowerCase()===important.toLowerCase()); check(`${important} is active on one team only`, active.length===1, active.map(p=>p.teamId).join(",")); }
check("User preserved players are not copied elsewhere", [...userRoster].every(id=>aw.players.filter(p=>p.id===id&&p.teamId).length===1 && aw.players.find(p=>p.id===id)?.teamId===userTeamId));
check("No future-only players appear in AW Free Agency", aw.freeAgents.every(p=>[undefined,"ghosts","advanced_warfare"].includes(p.debutEraId||p.eraId)));
check("No Modern CDL or Challengers are required", !JSON.stringify(aw).toLowerCase().includes("challenger") && !aw.teams.some(t=>/breach|surge|koi|optic texas|atlanta faze/i.test(t.name)));
check("Every first AW event team has 4 players", eventState.field.every(t=>aw.players.filter(p=>p.teamId===t.teamId).length===4));
for (const important of ["Crimsix","FormaL","Karma","TeePee"]) { const loc=findPlayerLocation(aw, important); check(`${important} location after AW transition is clear`, loc.found && loc.status!=="missing", loc.currentTeamName || loc.status); }
check("No missing player state after AW transition", !rows.some(r=>r[4]==="missing_error") && aw.players.every(p=>findPlayerLocation(aw,p.id).status!=="missing"));
check("Roster integrity passes after AW transition", getRosterIntegrityProblems(aw,"advanced_warfare").length===0);
const storeSource = (await import("node:fs")).readFileSync(new URL("../src/store/dynastyStore.jsx", import.meta.url), "utf8");
check("AW transition now passes through Rostermania Hub", storeSource.includes("ENTER_ROSTERMANIA") && storeSource.includes("rostermaniaActive"));
check("User must confirm AW season start via CONFIRM_AW_SEASON", storeSource.includes("CONFIRM_AW_SEASON") && storeSource.includes("rostermaniaActive: false"));

// ── repairUserTeam: false during AW transition ──
check("buildAdvancedWarfareTransition uses repairUserTeam: false", storeSource.includes("repairUserTeam: false"));

{
  // User team can be 3/4 during Rostermania if user releases a player
  const userPlayer = aw.players.find(p => p.teamId === userTeamId);
  let rmAw = { ...aw, rostermaniaActive: true, players: aw.players.map(p => p.id === userPlayer.id ? { ...p, teamId: null, previousTeamId: p.teamId, status: "free_agent", currentStatus: "free_agent" } : p) };
  rmAw.freeAgents = rmAw.players.filter(p => !p.teamId);
  rmAw = ensureFourPlayerRosters(rmAw, "advanced_warfare", { repairUserTeam: false });
  const userCount = rmAw.players.filter(p => p.teamId === userTeamId).length;
  check("User team can be 3/4 during Rostermania if user releases a player", userCount === 3, `user team: ${userCount}/4 after release with repairUserTeam: false`);
}

console.log(`\nAdvanced Warfare transition diagnostic passed (${pass} checks).`);
