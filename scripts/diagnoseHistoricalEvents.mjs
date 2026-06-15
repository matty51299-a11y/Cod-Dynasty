import fs from "node:fs";
import assert from "node:assert/strict";
const mto = fs.readFileSync("src/components/MajorTournamentOverlay.jsx", "utf8");
assert.ok(mto.includes("▶ Play Match"), "Historical event screen must expose Play Match for pending user matches");
assert.ok(mto.includes("SIM_USER_MAJOR_MATCH"), "Historical event screen must keep quick Sim User Match separate");
assert.ok(mto.includes("SIM_NEXT_MAJOR_MATCH"), "Historical event screen must still expose Sim Next Match");
console.log("✓ Historical event Play Match controls are present");
