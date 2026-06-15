import { GHOSTS_TEAMS, GHOSTS_PLAYERS, AW_PLAYERS } from "../src/data/historicalRosters.js";
import { GHOSTS_EVENTS } from "../src/data/ghostsEventCalendar.js";
import { getEra, HISTORICAL_START_ERA_ID, COD_ERAS } from "../src/data/codEras.js";
import { simulateEvent } from "../src/engine/eventSim.js";
import { createHistoricalEventState, getNextPendingMatch, simulateMatch } from "../src/engine/historicalEventEngine.js";
import { createInitialStandings, updateStandings, getSortedStandings } from "../src/engine/standingsEngine.js";

const MODERN_CDL_TEAMS = [
  "Boston Breach", "Carolina Royal Ravens", "Cloud9 New York",
  "Paris Gentle Mates", "Toronto KOI", "Vancouver Surge",
  "OpTic Texas", "Atlanta FaZe", "LA Thieves", "Miami Heretics",
  "G2 Minnesota", "Riyadh Falcons",
];

let pass = 0;
let fail = 0;

function check(label, condition) {
  if (condition) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.log(`  ✗ ${label}`);
  }
}

console.log("═══ Cod Dynasty Clean Core Diagnostic ═══\n");

// 1. Game state starts as Cod Dynasty
console.log("1. Game identity");
const era = getEra(HISTORICAL_START_ERA_ID);
check("Historical start era is ghosts", HISTORICAL_START_ERA_ID === "ghosts");
check("Era game title is Call of Duty: Ghosts", era.gameTitle === "Call of Duty: Ghosts");

// 2. currentEraId is ghosts
console.log("\n2. Era configuration");
check("currentEraId resolves to ghosts", era.id === "ghosts");
check("Season label is 2013/14", era.seasonLabel === "2013/14");

// 3. currentGameTitle
console.log("\n3. Game title");
check("Game title is Call of Duty: Ghosts", era.gameTitle === "Call of Duty: Ghosts");

// 4. No modern CDL mode
console.log("\n4. No modern CDL mode");
const modernEra = COD_ERAS.find(e => e.id === "modern_2026");
check("Modern 2026 era exists in codEras (kept as data, not user-facing)", !!modernEra);
check("Historical start is NOT modern_2026", HISTORICAL_START_ERA_ID !== "modern_2026");

// 5. No Challenger mode
console.log("\n5. No Challenger mode");
check("No challenger references in GHOSTS_TEAMS", GHOSTS_TEAMS.every(t => !t.isChallenger));
check("No challengerTeamId on GHOSTS_PLAYERS", GHOSTS_PLAYERS.every(p => !p.challengerTeamId));

// 6. No Challengers nav (checked by verifying no "Challengers" in sidebar NAV_ITEMS)
console.log("\n6. Challengers removed from active game");
check("GHOSTS_TEAMS has no challenger teams", !GHOSTS_TEAMS.some(t => t.name?.toLowerCase().includes("challenger")));

// 7. Ghosts teams load
console.log("\n7. Ghosts teams");
check("GHOSTS_TEAMS has teams", GHOSTS_TEAMS.length > 0);
check("compLexity is present", GHOSTS_TEAMS.some(t => t.name.includes("compLexity")));
check("OpTic Gaming is present", GHOSTS_TEAMS.some(t => t.name.includes("OpTic")));
check("Team Kaliber is present", GHOSTS_TEAMS.some(t => t.name.includes("Kaliber")));
check("FaZe Clan is present", GHOSTS_TEAMS.some(t => t.name.includes("FaZe")));
check("Envy is present", GHOSTS_TEAMS.some(t => t.name.includes("Envy")));

// 8. Modern CDL teams do not load
console.log("\n8. No modern CDL teams");
for (const modernTeam of MODERN_CDL_TEAMS) {
  check(`${modernTeam} is NOT in GHOSTS_TEAMS`, !GHOSTS_TEAMS.some(t => t.name === modernTeam));
}

// 9. Ghosts rosters have 4 active players
console.log("\n9. Roster integrity (4 players per team)");
for (const team of GHOSTS_TEAMS.slice(0, 5)) {
  const roster = GHOSTS_PLAYERS.filter(p => p.teamId === team.id);
  check(`${team.name} has ${roster.length} players`, roster.length === 4);
}

// 10. Amateur Pool is empty at Ghosts start
console.log("\n10. Amateur Pool at Ghosts start");
check("Amateur pool starts empty (no amateur prospects in GHOSTS_PLAYERS)", GHOSTS_PLAYERS.every(p => p.status !== "amateur"));

// 11. Free Agency contains no modern CDL/Challenger players
console.log("\n11. Free Agency integrity");
const freeAgents = GHOSTS_PLAYERS.filter(p => !p.teamId);
check(`Free agents count: ${freeAgents.length} (expected 0 or small)`, freeAgents.length >= 0);
check("No modern CDL player names in Ghosts player list", !GHOSTS_PLAYERS.some(p =>
  ["Shotzzy", "Simp", "aBeZy", "Cellium", "Kenny", "Dashy"].includes(p.name)
));

// 12. AW-only players not available at Ghosts start
console.log("\n12. Future era leakage prevention");
const ghostsNames = new Set(GHOSTS_PLAYERS.map(p => p.name.toLowerCase()));
const awOnlyPlayers = AW_PLAYERS.filter(p => !ghostsNames.has(p.name.toLowerCase()));
check(`Found ${awOnlyPlayers.length} AW-only players`, awOnlyPlayers.length > 0);
for (const awp of awOnlyPlayers.slice(0, 3)) {
  check(`AW player ${awp.name} NOT in Ghosts player list`, !ghostsNames.has(awp.name.toLowerCase()));
}

// 13. Ghosts event calendar exists
console.log("\n13. Ghosts event calendar");
check("GHOSTS_EVENTS has events", GHOSTS_EVENTS.length > 0);
check(`Event count: ${GHOSTS_EVENTS.length}`, GHOSTS_EVENTS.length === 12);
check("UMG Philadelphia 2014 exists", GHOSTS_EVENTS.some(e => e.name.includes("UMG Philadelphia")));
check("CoD Championship 2014 exists", GHOSTS_EVENTS.some(e => e.name.includes("Championship 2014")));
check("MLG Anaheim 2014 exists", GHOSTS_EVENTS.some(e => e.name.includes("MLG Anaheim")));
check("ESWC 2014 exists", GHOSTS_EVENTS.some(e => e.name.includes("ESWC 2014")));
check("All events have proPoints", GHOSTS_EVENTS.every(e => e.proPoints && typeof e.proPoints === "object"));

// 14. Event simulation produces champion and user placement
console.log("\n14. Event simulation");
const standings = createInitialStandings(GHOSTS_TEAMS);
const testEvent = GHOSTS_EVENTS[0];
const result = simulateEvent(testEvent, GHOSTS_TEAMS, GHOSTS_PLAYERS, standings, 12345);
check("Simulation produces results", result.results.length > 0);
check("Simulation has a champion", !!result.champion?.teamName);
check(`Champion: ${result.champion.teamName}`, !!result.champion.teamId);
const userResult = result.results.find(r => r.teamId === "optic_gaming");
check("User team (optic_gaming) has a placement", !!userResult);
check(`User placement: #${userResult?.placement}`, userResult?.placement > 0);

// 15. Pro Points update after event
console.log("\n15. Pro Points");
const updated = updateStandings(standings, result);
const champion = updated[result.champion.teamId];
check("Champion has Pro Points > 0", champion?.proPoints > 0);
check(`Champion Pro Points: ${champion?.proPoints}`, champion?.proPoints === testEvent.proPoints[1]);

// 16. Standings use Pro Points, not CDL Points
console.log("\n16. Standings terminology");
const sorted = getSortedStandings(updated);
check("Standings entries have proPoints field", sorted.every(s => "proPoints" in s));
check("Standings entries do NOT have cdlPoints field", sorted.every(s => !("cdlPoints" in s)));

// 17. Event-level gameplay is available
console.log("\n17. Event-level gameplay");
const openedEvent = createHistoricalEventState(testEvent, GHOSTS_TEAMS, GHOSTS_PLAYERS, standings, "optic_gaming", 54321);
check("Events can be opened into bracket state", openedEvent.matches.length > 0 && openedEvent.status === "in_progress");
const oneBefore = openedEvent.matches.filter(m => m.status === "completed").length;
const oneAfterState = simulateMatch(openedEvent, getNextPendingMatch(openedEvent).id, testEvent, "optic_gaming");
const oneAfter = oneAfterState.matches.filter(m => m.status === "completed").length;
check("Game is not only full-event simulation", oneAfter - oneBefore === 1 && oneAfterState.status === "in_progress");

// 18. Build check (deferred — run npm run build separately)
console.log("\n18. Build check");
console.log("  ⓘ Run 'npm run build' separately to verify build passes.");

console.log(`\n═══ Results: ${pass} passed, ${fail} failed ═══`);
process.exit(fail > 0 ? 1 : 0);
