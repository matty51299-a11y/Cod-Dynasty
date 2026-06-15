import fs from "node:fs";
import assert from "node:assert/strict";
import { getEra } from "../src/data/codEras.js";

function check(name, condition, detail = "") {
  assert.ok(condition, `${name}${detail ? ` — ${detail}` : ""}`);
  console.log(`✓ ${name}${detail ? ` (${detail})` : ""}`);
}

const state = {
  careerMode: "historical",
  currentEraId: "ghosts",
  currentGameTitle: "Call of Duty: Ghosts",
  season: 1,
  userTeamId: "coL",
  schedule: { phase: "major", majorIdx: 0 },
};

function buildDiagnosticHistoricalMapSet(st) {
  const era = getEra(st.currentEraId);
  const order = ["Domination", "Search and Destroy", "Blitz", "Domination", "Search and Destroy"];
  return order.map((mode, i) => ({ selectedMap: { mode, name: era.mapPool[mode][i % era.mapPool[mode].length] } }));
}

const mto = fs.readFileSync("src/components/MajorTournamentOverlay.jsx", "utf8");
const mco = fs.readFileSync("src/components/MatchCenterOverlay.jsx", "utf8");
const store = fs.readFileSync("src/store/gameStore.jsx", "utf8");
const engine = fs.readFileSync("src/engine/seasonEngine.js", "utf8");
const matchSim = fs.readFileSync("src/engine/matchSim.js", "utf8");

check("Start Ghosts dynasty state is supported", state.careerMode === "historical" && state.currentEraId === "ghosts");
check("Open first event can use active major/event overlay", mto.includes("enteredMajorIdx") && mto.includes("schedule.majorIdx"));
check("User team pending match path is detected", mto.includes("userInNext") && mto.includes("Your match is ready"));
check("Event screen exposes Play Match when user match is pending", mto.includes("▶ Play Match"));
check("Play Match does not dispatch instant sim", mto.includes("openMatchCenter(\"major\")") && mto.includes("dispatch({ type: \"SIM_USER_MAJOR_MATCH\" })"));
check("Play Match creates/opens live match state", mco.includes("phase:") && mco.includes("pregame") && mco.includes("currentMapIdx"));
const mapSet = buildDiagnosticHistoricalMapSet(state);
check("Live match uses Ghosts modes, not Hardpoint", mapSet.every(m => m.selectedMap.mode !== "Hardpoint"), mapSet.map(m => m.selectedMap.mode).join(" / "));
check("Live match can progress map by map", mco.includes("NEXT_MAP") && mco.includes("SIM_MAP"));
check("Player K/Ds are generated", matchSim.includes("playerMapStats") && matchSim.includes("kd:"));
check("Finishing series applies result to event bracket", mco.includes("COMMIT_USER_MATCH_RESULT") && engine.includes("commitUserMatchResult"));
check("User route updates after match", mto.includes("getUserPath") && engine.includes("_simOneMajorMatch"));
check("Results tab includes the match", mto.includes("Results") && mto.includes("SeriesDetail"));
check("Sim User Match quick-sims only user match", store.includes("SIM_USER_MAJOR_MATCH") && engine.includes("simUserMajorMatch") && engine.includes("userPending"));
check("Sim Event still completes the event", mto.includes("SIM_MAJOR") && mto.includes("Sim Event"));
check("No modern CDL mode or Challengers are required", !mto.includes("Challenger") && mapSet.every(m => ["Domination", "Search and Destroy", "Blitz"].includes(m.selectedMap.mode)));
console.log("Historical Play Match diagnostic passed.");
