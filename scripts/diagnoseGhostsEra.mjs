import { getEra } from "../src/data/codEras.js";

const failures = [];
function check(label, pass, detail = "") {
  if (pass) console.log(`PASS: ${label}`);
  else { failures.push(`${label}${detail ? ` (${detail})` : ""}`); console.error(`FAIL: ${label}${detail ? ` (${detail})` : ""}`); }
}

const ghosts = getEra("ghosts");
check("Ghosts era id is ghosts", ghosts.id === "ghosts", ghosts.id);
check("Ghosts game title is Call of Duty: Ghosts", ghosts.gameTitle === "Call of Duty: Ghosts", ghosts.gameTitle);
check("Ghosts roster size is 4", ghosts.rosterSize === 4, String(ghosts.rosterSize));
check("Ghosts modes are Domination, Search and Destroy and Blitz", ["Domination", "Search and Destroy", "Blitz"].every(mode => ghosts.modes.includes(mode)), ghosts.modes.join(", "));
check("Ghosts modes exclude Hardpoint", !ghosts.modes.includes("Hardpoint"), ghosts.modes.join(", "));

if (failures.length) {
  console.error(`Ghosts era diagnostic FAILED with ${failures.length} problem(s).`);
  process.exit(1);
}
console.log("Ghosts era diagnostic passed.");
