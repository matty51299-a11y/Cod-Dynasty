import assert from "node:assert/strict";
import { placementText, qualifierPlacementLabel, placementRankValue } from "../src/utils/placementDisplay.js";

const expectedBands = new Map([
  [1, "1st"],
  [2, "2nd"],
  [3, "3rd"],
  [4, "4th"],
  [5, "5th-6th"],
  [6, "5th-6th"],
  [7, "7th-8th"],
  [8, "7th-8th"],
  [9, "9th-12th"],
  [10, "9th-12th"],
  [11, "9th-12th"],
  [12, "9th-12th"],
  [13, "13th-16th"],
  [14, "13th-16th"],
  [15, "13th-16th"],
  [16, "13th-16th"],
]);

for (const [placement, label] of expectedBands) {
  assert.equal(placementText(placement), label, `placement ${placement}`);
}

assert.equal(placementText(5).includes("T5"), false, "5th-6th must not display T5");
assert.equal(placementText("T6"), "5th-6th", "old shorthand T6 saves still normalize to the band");
assert.equal(placementRankValue("5th-6th"), 5, "best-placement ranking can parse band labels");
assert.equal(qualifierPlacementLabel(5), "Qualifier 5th-6th");
assert.equal(qualifierPlacementLabel(9), "Qualifier 9th-12th");

console.log("Placement display bands verified.");
