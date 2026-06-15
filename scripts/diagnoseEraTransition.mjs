import { readFileSync } from "node:fs";
import { getEra, getNextEra } from "../src/data/codEras.js";
import { GHOSTS_TEAMS, AW_TEAM_ROWS, getNewAWEntrants, getGhostsPlayersNotInAW } from "../src/data/historicalRosters.js";
import { createHistoricalStateFields, advanceHistoricalEraIfNeeded } from "../src/engine/historicalDynasty.js";
import { getTransitionEvents, getChurnConfig } from "../src/data/historicalEvents.js";

const failures = [];
function check(label, pass, detail = "") {
  if (pass) console.log(`PASS: ${label}`);
  else { failures.push(`${label}${detail ? ` (${detail})` : ""}`); console.error(`FAIL: ${label}${detail ? ` (${detail})` : ""}`); }
}

// 1. Ghosts era exists and has nextEraId
const ghosts = getEra("ghosts");
check("Ghosts era exists", !!ghosts);
check("Ghosts has nextEraId advanced_warfare", ghosts.nextEraId === "advanced_warfare");

// 2. AW era exists with correct properties
const aw = getEra("advanced_warfare");
check("Advanced Warfare era exists", !!aw);
check("AW gameTitle is correct", aw.gameTitle === "Call of Duty: Advanced Warfare", aw.gameTitle);
check("AW movementStyle is jetpack", aw.movementStyle === "jetpack", aw.movementStyle);
check("AW rosterSize is 4", aw.rosterSize === 4, String(aw.rosterSize));
check("AW has Hardpoint mode", aw.modes.includes("Hardpoint"));
check("AW has Uplink mode", aw.modes.includes("Uplink"));

// 3. Historical state can be created
const stateFields = createHistoricalStateFields();
check("Historical state starts with ghosts era", stateFields.currentEraId === "ghosts");
check("Historical state has correct game title", stateFields.currentGameTitle === "Call of Duty: Ghosts");

// 4. Era advancement works
const mockState = {
  ...stateFields,
  players: [],
  prospects: [],
  season: 1,
};
const advanced = advanceHistoricalEraIfNeeded(mockState);
check("Era advancement changes currentEraId to advanced_warfare", advanced.currentEraId === "advanced_warfare");
check("Era advancement changes game title", advanced.currentGameTitle === "Call of Duty: Advanced Warfare");
check("Era advancement creates pendingEraTransition", !!advanced.pendingEraTransition);
check("Pending transition has correct previousEraId", advanced.pendingEraTransition?.previousEraId === "ghosts");
check("Pending transition has correct newEraId", advanced.pendingEraTransition?.newEraId === "advanced_warfare");

// 5. AW historical roster data exists
check("AW team rows exist", AW_TEAM_ROWS.length >= 10, String(AW_TEAM_ROWS.length));
check("AW teams include OpTic Gaming", AW_TEAM_ROWS.some(r => r.name === "OpTic Gaming"));
check("AW teams include Denial Esports", AW_TEAM_ROWS.some(r => r.name === "Denial Esports"));

// 6. New AW entrants identified
const newEntrants = getNewAWEntrants();
check("New AW entrants found", newEntrants.length > 0, `Found ${newEntrants.length}`);

// 7. Displaced Ghosts players identified
const displaced = getGhostsPlayersNotInAW();
check("Displaced Ghosts players found", displaced.length > 0, `Found ${displaced.length}`);

// 8. No Challenger terminology in transition events
const transitionEvents = getTransitionEvents("ghosts", "advanced_warfare");
check("Transition events exist for Ghosts to AW", !!transitionEvents);
if (transitionEvents) {
  check("Transition title does not mention Challengers", !transitionEvents.title.includes("Challenger"));
  check("Transition subtitle does not mention Challengers", !transitionEvents.subtitle.includes("Challenger"));
}

// 9. No duplicates in AW target rosters
const allAWPlayers = AW_TEAM_ROWS.flatMap(r => r.players);
const awPlayerSet = new Set(allAWPlayers.map(n => n.toLowerCase()));
check("No duplicate players across AW team rosters", awPlayerSet.size === allAWPlayers.length, `${allAWPlayers.length} total, ${awPlayerSet.size} unique`);

// 10. Churn config exists
const churnConfig = getChurnConfig("very_high");
check("Very high churn config exists", !!churnConfig);
check("Very high churn has AI team changes", Array.isArray(churnConfig.aiTeamChanges));

// 11. Check no Challengers in user-facing navigation
const sidebar = readFileSync(new URL("../src/components/Sidebar.jsx", import.meta.url), "utf8");
check("Sidebar does not show Challengers nav label", !sidebar.includes('label: "Challengers"'));

// 12. Check era transition modal exists and uses correct terminology
const dashboard = readFileSync(new URL("../src/components/Dashboard.jsx", import.meta.url), "utf8");
check("Dashboard has EraTransitionModal component", dashboard.includes("EraTransitionModal"));
check("Era transition modal mentions rostermania or Rostermania", dashboard.includes("ostermania"));

if (failures.length) {
  console.error(`\nEra transition diagnostic FAILED with ${failures.length} problem(s):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("\nEra transition diagnostic passed.");
