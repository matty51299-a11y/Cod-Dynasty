import { readFileSync } from "node:fs";
import { getEra } from "../src/data/codEras.js";
import { HISTORICAL_STARTING_TEAMS } from "../src/data/teams.js";
import { getGhostsRosterForTeam } from "../src/data/historicalRosters.js";

const failures = [];
function check(label, pass, detail = "") {
  if (pass) console.log(`PASS: ${label}`);
  else { failures.push(`${label}${detail ? ` (${detail})` : ""}`); console.error(`FAIL: ${label}${detail ? ` (${detail})` : ""}`); }
}

const teamSelect = readFileSync(new URL("../src/components/TeamSelect.jsx", import.meta.url), "utf8");
const combinedStartText = `${teamSelect}\n${HISTORICAL_STARTING_TEAMS.map(t => t.name).join("\n")}`;

check("New game screen does not show Modern CDL 2026", !teamSelect.includes("Modern CDL 2026"));
check("New game screen does not show Manage CDL Team", !teamSelect.includes("Manage CDL Team"));
check("New game screen does not show Manage Challenger Team", !teamSelect.includes("Manage Challenger Team"));

const gameStore = readFileSync(new URL("../src/store/gameStore.jsx", import.meta.url), "utf8");
check("Starting a new game sets currentEraId to ghosts", gameStore.includes("createHistoricalStateFields(careerMode)") && getEra("ghosts").id === "ghosts");
check("Starting a new game sets currentGameTitle to Call of Duty: Ghosts", getEra("ghosts").gameTitle === "Call of Duty: Ghosts", getEra("ghosts").gameTitle);
check("Team selection shows Ghosts teams", ["compLexity", "OpTic Gaming", "Team Kaliber", "FaZe Clan"].every(name => combinedStartText.includes(name)));
for (const modernTeam of ["Boston Breach", "Carolina Royal Ravens", "Cloud9 New York", "Paris Gentle Mates"]) {
  check(`Team selection does not show ${modernTeam}`, !combinedStartText.includes(modernTeam));
}
check("Ghosts rosters use 4 active players", HISTORICAL_STARTING_TEAMS.every(team => getGhostsRosterForTeam(team.id).length === 4));
const ghosts = getEra("ghosts");
check("Ghosts modes include Domination, Search and Destroy and Blitz", ["Domination", "Search and Destroy", "Blitz"].every(mode => ghosts.modes.includes(mode)), ghosts.modes.join(", "));
check("Ghosts modes do not include Hardpoint", !ghosts.modes.includes("Hardpoint"), ghosts.modes.join(", "));

if (failures.length) {
  console.error(`Cod Dynasty start diagnostic FAILED with ${failures.length} problem(s):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("Cod Dynasty start diagnostic passed.");
