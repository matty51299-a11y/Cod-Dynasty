import { HISTORICAL_STARTING_TEAMS } from "../src/data/teams.js";
import { getGhostsRosterForTeam, GHOSTS_SPREADSHEET_SOURCE, AW_TEAM_ROWS } from "../src/data/historicalRosters.js";

const failures = [];
function check(label, pass, detail = "") {
  if (pass) console.log(`PASS: ${label}`);
  else { failures.push(`${label}${detail ? ` (${detail})` : ""}`); console.error(`FAIL: ${label}${detail ? ` (${detail})` : ""}`); }
}

check("Historical roster source points at Ghosts spreadsheet", GHOSTS_SPREADSHEET_SOURCE.endsWith("#Ghosts"), GHOSTS_SPREADSHEET_SOURCE);
check("Ghosts historical team list is populated", HISTORICAL_STARTING_TEAMS.length >= 12, String(HISTORICAL_STARTING_TEAMS.length));
check("Expected Ghosts examples are present", ["compLexity", "OpTic Gaming", "Team Kaliber", "FaZe Clan", "Strictly Business", "Rise Nation", "Epsilon Esports", "TCM-Gaming"].every(name => HISTORICAL_STARTING_TEAMS.some(team => team.name === name)));
check("Every historical team has exactly four active roster players", HISTORICAL_STARTING_TEAMS.every(team => getGhostsRosterForTeam(team.id).length === 4));
check("No current CDL franchise teams are in historical start teams", !["Boston Breach", "Carolina Royal Ravens", "Cloud9 New York", "Paris Gentle Mates", "Toronto KOI", "Vancouver Surge"].some(name => HISTORICAL_STARTING_TEAMS.some(team => team.name === name)));

// Advanced Warfare roster checks
check("AW historical team list is populated", AW_TEAM_ROWS.length >= 10, String(AW_TEAM_ROWS.length));
check("AW expected teams are present", ["OpTic Gaming", "Denial Esports", "FaZe Clan", "Team EnVyUs", "compLexity"].every(name => AW_TEAM_ROWS.some(team => team.name === name)));
check("Every AW team has exactly four roster players", AW_TEAM_ROWS.every(row => row.players.length === 4));

if (failures.length) {
  console.error(`Historical roster diagnostic FAILED with ${failures.length} problem(s).`);
  process.exit(1);
}
console.log("Historical roster diagnostic passed.");
