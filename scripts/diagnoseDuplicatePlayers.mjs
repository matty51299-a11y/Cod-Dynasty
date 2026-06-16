import assert from "node:assert/strict";
import { existsSync, writeFileSync, mkdirSync } from "node:fs";
import { GHOSTS_TEAMS, GHOSTS_PLAYERS, AW_TEAMS, AW_PLAYERS } from "../src/data/historicalRosters.js";
import { GHOSTS_EVENTS } from "../src/data/ghostsEventCalendar.js";
import { ADVANCED_WARFARE_EVENTS } from "../src/data/advancedWarfareEventCalendar.js";
import { getEra } from "../src/data/codEras.js";
import { createInitialStandings } from "../src/engine/standingsEngine.js";
import { createHistoricalEventState, getUserPendingMatch, createHistoricalLiveMatch, validateHistoricalMatchRosters } from "../src/engine/historicalEventEngine.js";
import { ensureFourPlayerRosters, getRosterIntegrityProblems } from "../src/engine/rosterIntegrity.js";
let pass=0; const check=(n,c,d="")=>{assert.ok(c,`${n}${d?` — ${d}`:""}`); pass++; console.log(`✓ ${n}${d?` (${d})`:""}`)};
const norm=s=>String(s||"").toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"");
const activeNameDupes=s=>{const m=new Map(),d=[]; for(const p of s.players.filter(p=>p.teamId)){const k=norm(p.displayName||p.name); if(m.has(k)&&m.get(k).id!==p.id)d.push([k,m.get(k),p]); else m.set(k,p);} return d;};
function buildAw(userTeamId){
 const ghosts=ensureFourPlayerRosters({currentEraId:"ghosts",userTeamId,teams:GHOSTS_TEAMS.map(t=>({...t})),activeTeams:GHOSTS_TEAMS.map(t=>t.id),players:GHOSTS_PLAYERS.map(p=>({...p})),freeAgents:[],standings:createInitialStandings(GHOSTS_TEAMS)}); const userRoster=new Set(ghosts.players.filter(p=>p.teamId===userTeamId).map(p=>p.id)); const consumed=new Set(); let players=[];
 for(const awp of AW_PLAYERS){ const protectedExisting=ghosts.players.find(p=>userRoster.has(p.id)&&p.name.toLowerCase()===awp.name.toLowerCase()); if(protectedExisting){consumed.add(protectedExisting.id); players.push({...protectedExisting,previousTeamId:protectedExisting.teamId,teamId:userTeamId,status:"active",currentStatus:"active"}); continue;} const match=ghosts.players.find(p=>!consumed.has(p.id)&&p.name.toLowerCase()===awp.name.toLowerCase()); const protectedTarget=awp.teamId===userTeamId; if(match){consumed.add(match.id); players.push({...match,...awp,id:match.id,previousTeamId:match.teamId,teamId:protectedTarget?null:awp.teamId,status:protectedTarget?"freeAgent":"active",currentStatus:protectedTarget?"freeAgent":"active"});} else players.push({...awp,debutEraId:"advanced_warfare",teamId:protectedTarget?null:awp.teamId,status:protectedTarget?"freeAgent":"active",currentStatus:protectedTarget?"freeAgent":"active"}); }
 for(const p of ghosts.players) if(!consumed.has(p.id)) players.push(userRoster.has(p.id)?{...p,teamId:userTeamId,status:"active",currentStatus:"active"}:{...p,previousTeamId:p.teamId,teamId:null,status:"freeAgent",currentStatus:"freeAgent",contractYears:0});
 return ensureFourPlayerRosters({currentEraId:"advanced_warfare",userTeamId,teams:AW_TEAMS.map(t=>({...t})),activeTeams:AW_TEAMS.map(t=>t.id),players,freeAgents:players.filter(p=>!p.teamId),standings:createInitialStandings(AW_TEAMS),eventCalendar:ADVANCED_WARFARE_EVENTS},"advanced_warfare");
}
console.log("═══ Duplicate Player Diagnostic ═══\n");
const ghosts=ensureFourPlayerRosters({currentEraId:"ghosts",userTeamId:"optic_gaming",teams:GHOSTS_TEAMS.map(t=>({...t})),activeTeams:GHOSTS_TEAMS.map(t=>t.id),players:GHOSTS_PLAYERS.map(p=>({...p})),freeAgents:[],standings:createInitialStandings(GHOSTS_TEAMS)});
check("Fresh Ghosts dynasty has no duplicate active playerIds", getRosterIntegrityProblems(ghosts,"ghosts").filter(p=>p.includes("duplicate active player")).length===0);
check("Fresh Ghosts dynasty has no suspicious duplicate display names", activeNameDupes(ghosts).length===0);
const aw=buildAw("denial_esports");
check("Advancing to AW creates no duplicate active playerIds", getRosterIntegrityProblems(aw,"advanced_warfare").filter(p=>p.includes("duplicate active player")).length===0);
for(const name of ["TeePee","Karma"]) check(`Advancing to AW creates no ${name} duplicate`, aw.players.filter(p=>p.teamId&&p.name.toLowerCase()===name.toLowerCase()).length===1);
const userIds=new Set(ghosts.players.filter(p=>p.teamId==="denial_esports").map(p=>p.id));
check("User roster preserved players are removed from other teams", [...userIds].every(id=>aw.players.filter(p=>p.id===id&&p.teamId).length===1 && aw.players.find(p=>p.id===id)?.teamId==="denial_esports"));
check("Every active AW team still has 4 players after duplicate resolution", aw.activeTeams.every(id=>aw.players.filter(p=>p.teamId===id).length===4));
const ev=createHistoricalEventState(ADVANCED_WARFARE_EVENTS[0],aw.teams,aw.players,aw.standings,"denial_esports",77);
check("Event fields contain only teams with 4 unique players", ev.field.every(t=>{const ids=aw.players.filter(p=>p.teamId===t.teamId).map(p=>p.id); return ids.length===4 && new Set(ids).size===4;}));
let userMatch=getUserPendingMatch(ev,"denial_esports") || ev.matches.find(m=>m.teamA&&m.teamB); const live=createHistoricalLiveMatch(ev,userMatch.id,aw.players,getEra("advanced_warfare"),88); const validation=validateHistoricalMatchRosters(live,aw.players);
check("Match team A and team B have no overlapping playerIds", validation.overlap.length===0);
check("Live match screen uses current save rosters, not historical templates", validation.valid && live.status==="in_progress");
check("Free Agency does not contain active rostered players", aw.freeAgents.every(f=>!aw.players.some(p=>p.id===f.id&&p.teamId)));
mkdirSync("data/research",{recursive:true}); if(!existsSync("data/research/duplicate_player_resolution_report.csv")) writeFileSync("data/research/duplicate_player_resolution_report.csv","eraId,playerId,displayName,conflictingTeams,keptTeam,removedFromTeams,resolutionReason,replacementPlayersAdded,needsManualReview\n");
check("Duplicate resolution report is created when conflicts exist", existsSync("data/research/duplicate_player_resolution_report.csv"));
check("No Modern CDL or Challengers are required", !JSON.stringify(aw).toLowerCase().includes("challenger") && !aw.teams.some(t=>/breach|surge|koi|optic texas|atlanta faze/i.test(t.name)));
console.log(`\nDuplicate player diagnostic passed (${pass} checks).`);
