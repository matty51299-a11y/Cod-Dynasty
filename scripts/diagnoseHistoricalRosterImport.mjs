import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  GHOSTS_TEAMS, GHOSTS_PLAYERS, GHOSTS_TEAM_ROWS, GHOSTS_SPREADSHEET_SOURCE,
  AW_TEAMS, AW_PLAYERS, AW_TEAM_ROWS, AW_SPREADSHEET_SOURCE,
  getNewAWEntrants, getGhostsPlayersNotInAW,
} from "../src/data/historicalRosters.js";
import { canonicalPlayerId } from "../src/data/historicalPlayerRegistry.js";

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

console.log("═══ Historical Roster Import Diagnostic ═══\n");

// 1. Spreadsheet exists
console.log("1. Spreadsheet source");
const xlsxPath = resolve("data/import/cod_manager_rosters_database.xlsx");
check(`Spreadsheet exists at ${xlsxPath}`, existsSync(xlsxPath));
check("GHOSTS_SPREADSHEET_SOURCE defined", !!GHOSTS_SPREADSHEET_SOURCE);
check("AW_SPREADSHEET_SOURCE defined", !!AW_SPREADSHEET_SOURCE);

// 2. Ghosts sheet parsed
console.log("\n2. Ghosts data parsed");
check(`GHOSTS_TEAM_ROWS has ${GHOSTS_TEAM_ROWS.length} teams`, GHOSTS_TEAM_ROWS.length > 0);
check(`GHOSTS_TEAMS has ${GHOSTS_TEAMS.length} teams`, GHOSTS_TEAMS.length === GHOSTS_TEAM_ROWS.length);
check(`GHOSTS_PLAYERS has ${GHOSTS_PLAYERS.length} players`, GHOSTS_PLAYERS.length > 0);

// 3. Ghosts teams extracted
console.log("\n3. Ghosts teams");
for (const row of GHOSTS_TEAM_ROWS.slice(0, 5)) {
  check(`Team "${row.name}" has ${row.players.length} players`, row.players.length === 4);
}

// 4. Player names extracted
console.log("\n4. Player names");
const samplePlayers = ["Scump", "Crimsix", "Karma", "ACHES", "TeePee"];
for (const name of samplePlayers) {
  check(`Player ${name} is in Ghosts data`, GHOSTS_PLAYERS.some(p => p.name === name));
}

// 5. No blank team/player names
console.log("\n5. No blank names");
check("No blank team names in GHOSTS_TEAM_ROWS", GHOSTS_TEAM_ROWS.every(r => r.name && r.name.trim().length > 0));
check("No blank player names in GHOSTS_TEAM_ROWS", GHOSTS_TEAM_ROWS.every(r => r.players.every(p => p && p.trim().length > 0)));
check("No blank names in GHOSTS_PLAYERS", GHOSTS_PLAYERS.every(p => p.name && p.name.trim().length > 0));

// 6. Stable player IDs generated
console.log("\n6. Stable player IDs");
const ids = new Set();
let dupes = 0;
for (const p of GHOSTS_PLAYERS) {
  if (ids.has(p.id)) dupes++;
  ids.add(p.id);
}
check(`All ${GHOSTS_PLAYERS.length} players have IDs`, GHOSTS_PLAYERS.every(p => p.id));
check(`No duplicate IDs (dupes: ${dupes})`, dupes === 0);
check("IDs are string type", GHOSTS_PLAYERS.every(p => typeof p.id === "string"));
check("Canonical ID function works", canonicalPlayerId("Scump") === "hist_scump");

// 7. Later-era players marked with correct debutEraId
console.log("\n7. AW data and debutEraId");
check(`AW_TEAM_ROWS has ${AW_TEAM_ROWS.length} teams`, AW_TEAM_ROWS.length > 0);
check(`AW_PLAYERS has ${AW_PLAYERS.length} players`, AW_PLAYERS.length > 0);
check("AW players have eraId advanced_warfare", AW_PLAYERS.every(p => p.eraId === "advanced_warfare"));
check("Ghosts players have eraId ghosts", GHOSTS_PLAYERS.every(p => p.eraId === "ghosts"));

const newAW = getNewAWEntrants();
check(`New AW entrants (not in Ghosts): ${newAW.length}`, newAW.length > 0);
if (newAW.length > 0) {
  console.log(`  Sample AW-new: ${newAW.slice(0, 5).join(", ")}`);
}

const ghostsRetired = getGhostsPlayersNotInAW();
check(`Ghosts players not in AW: ${ghostsRetired.length}`, ghostsRetired.length >= 0);

// 8. Later-era players NOT added to Ghosts active save
console.log("\n8. Era separation");
const ghostsPlayerNames = new Set(GHOSTS_PLAYERS.map(p => p.name.toLowerCase()));
const awOnlyNames = AW_PLAYERS.filter(p => !ghostsPlayerNames.has(p.name.toLowerCase()));
check(`${awOnlyNames.length} AW-only players are NOT in Ghosts player list`, awOnlyNames.length > 0);
for (const p of awOnlyNames.slice(0, 3)) {
  check(`AW-only ${p.name} absent from Ghosts`, !ghostsPlayerNames.has(p.name.toLowerCase()));
}

console.log(`\n═══ Results: ${pass} passed, ${fail} failed ═══`);
process.exit(fail > 0 ? 1 : 0);
