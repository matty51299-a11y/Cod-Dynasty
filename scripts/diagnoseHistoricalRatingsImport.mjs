import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { HISTORICAL_PLAYER_RATINGS, HISTORICAL_RATING_ATTRIBUTES, getHistoricalPlayerRating, getHistoricalPlayerRatingByName } from "../src/data/historicalPlayerRatings.js";
import { GHOSTS_PLAYERS, AW_PLAYERS, GHOSTS_TEAM_ROWS, AW_TEAM_ROWS } from "../src/data/historicalRosters.js";
import { calcTeamOvr } from "../src/engine/teamOvr.js";

let pass = 0, fail = 0;
function check(label, condition) { condition ? (pass++, console.log(`  ✓ ${label}`)) : (fail++, console.log(`  ✗ ${label}`)); }
const inRange = v => Number.isFinite(v) && v >= 0 && v <= 100;
const allRatings = Object.values(HISTORICAL_PLAYER_RATINGS).flatMap(era => Object.values(era));
const rows = [...GHOSTS_PLAYERS.map(p => ({ eraId: "ghosts", p })), ...AW_PLAYERS.map(p => ({ eraId: "advanced_warfare", p }))];
const missing = rows.filter(({ eraId, p }) => p.ratingSource !== "historical_workbook").map(({ eraId, p }) => ({ eraId, playerId: p.playerId || p.id, displayName: p.name, teamName: [...GHOSTS_TEAM_ROWS, ...AW_TEAM_ROWS].find(r => r.players.includes(p.name))?.name || p.teamId || "", reason: "No matching row in Game Ready Ratings" }));
if (missing.length) writeFileSync("data/research/missing_player_ratings_report.csv", "eraId,playerId,displayName,teamName,reason\n" + missing.map(r => [r.eraId,r.playerId,r.displayName,r.teamName,r.reason].map(v => `"${String(v).replaceAll('"','""')}"`).join(",")).join("\n") + "\n");
else writeFileSync("data/research/missing_player_ratings_report.csv", "eraId,playerId,displayName,teamName,reason\nnone,none,none,none,No missing ratings\n");

console.log("═══ Historical Ratings Import Diagnostic ═══\n");
check("Ratings workbook exists", existsSync(resolve("data/import/cod_dynasty_historical_player_ratings_v2_fixed.xlsx")));
check("Game Ready Ratings sheet is readable via generated export", allRatings.length === 839);
check(`All rows are parsed (${allRatings.length})`, allRatings.length > 0);
check("eraId exists for every row", allRatings.every(r => r.eraId));
check("playerId exists for every row", allRatings.every(r => r.playerId));
check("displayName exists for every row", allRatings.every(r => r.displayName));
check("overall is between 0 and 100", allRatings.every(r => inRange(r.overall)));
check("potential is between 0 and 100", allRatings.every(r => inRange(r.potential)));
check("every attribute is between 0 and 100", allRatings.every(r => HISTORICAL_RATING_ATTRIBUTES.every(a => inRange(r.attributes?.[a]))));
check("traits parse correctly", allRatings.every(r => Array.isArray(r.personalityTraits) && Array.isArray(r.eraFitTraits)));
check("HISTORICAL_PLAYER_RATINGS exports successfully", !!HISTORICAL_PLAYER_RATINGS && typeof HISTORICAL_PLAYER_RATINGS === "object");
check("Ghosts ratings exist", Object.keys(HISTORICAL_PLAYER_RATINGS.ghosts || {}).length > 0);
check("Advanced Warfare ratings exist", Object.keys(HISTORICAL_PLAYER_RATINGS.advanced_warfare || {}).length > 0);
check("Crimsix has a Ghosts rating", !!getHistoricalPlayerRating("ghosts", "crimsix") || !!getHistoricalPlayerRatingByName("ghosts", "Crimsix"));
check("Scump has a Ghosts rating", !!getHistoricalPlayerRating("ghosts", "scump"));
check("ACHES has a Ghosts rating", !!getHistoricalPlayerRating("ghosts", "aches"));
check("AW ratings are separate from Ghosts ratings", getHistoricalPlayerRating("ghosts", "scump")?.overall !== getHistoricalPlayerRating("advanced_warfare", "scump")?.overall);
check("Player creation uses imported ratings", GHOSTS_PLAYERS.some(p => p.name === "Scump" && p.overall === getHistoricalPlayerRating("ghosts", "scump")?.overall && p.ratingSource === "historical_workbook"));
check("Team OVR is based on imported ratings", calcTeamOvr("complexity", GHOSTS_PLAYERS) === Math.round(GHOSTS_PLAYERS.filter(p => p.teamId === "complexity").reduce((s,p)=>s+p.overall,0)/4));
check("No Modern CDL or Challengers are required", !GHOSTS_PLAYERS.some(p => p.challengerTeamId) && !GHOSTS_PLAYERS.some(p => ["Shotzzy","Simp","aBeZy"].includes(p.name)));
console.log(`\nMissing rating rows: ${missing.length}`);
console.log(`═══ Results: ${pass} passed, ${fail} failed ═══`);
process.exit(fail > 0 ? 1 : 0);
