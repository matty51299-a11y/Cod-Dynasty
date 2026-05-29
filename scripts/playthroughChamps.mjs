// Playthrough driver: drives the actual UI through a full Season 1 → Champs
// using engine functions (via window.__gameDispatch helpers we'll inject).
//
// Captures any uncaught JS error / unhandled promise rejection so we can
// pinpoint exactly where the blank screen originates.

import { chromium } from "playwright";

const URL = process.env.URL || "http://localhost:5173";

const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();

const errors = [];
page.on("pageerror", err => {
  errors.push({ kind: "pageerror", message: err.message, stack: err.stack });
  console.error("[pageerror]", err.message);
});
page.on("console", msg => {
  if (msg.type() === "error" || msg.type() === "warning") {
    console.error(`[console.${msg.type()}]`, msg.text());
  }
});

await page.goto(URL, { waitUntil: "networkidle" });

// Clear any old save so we always start fresh.
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle" });

// Pick a team — click the first team card if the team selector is up.
// Wait for the team select screen
await page.waitForSelector("body");
const hasTeamSelect = await page.$("text=/CDL MANAGER/i");
const teamButtons = await page.$$("button");
console.log("Loaded. Team select buttons:", teamButtons.length);

// Try clicking a known team name
const fazeBtn = await page.$('text="Atlanta FaZe"');
if (fazeBtn) {
  await fazeBtn.click();
} else {
  // Fallback: click the first visible button
  await teamButtons[0]?.click();
}
await page.waitForTimeout(500);

console.log("URL after team select:", page.url());

// Helper: dispatch via the exposed __gameState by reaching into React tree is hard.
// Instead, simulate by clicking UI buttons.

async function clickByText(rx, opts = {}) {
  const el = await page.$(`text=${rx}`);
  if (!el) return false;
  await el.click(opts);
  return true;
}

async function getPhase() {
  return await page.evaluate(() => window.__gameState?.schedule?.phase ?? null);
}

async function getMajorIdx() {
  return await page.evaluate(() => window.__gameState?.schedule?.majorIdx ?? null);
}

async function getEnteredIdx() {
  return await page.evaluate(() => window.__gameState?.enteredMajorIdx ?? null);
}

async function snapshot(label) {
  const s = await page.evaluate(() => {
    const gs = window.__gameState;
    if (!gs) return { error: "no game state" };
    return {
      phase: gs.schedule?.phase,
      stageIdx: gs.schedule?.stageIdx,
      majorIdx: gs.schedule?.majorIdx,
      enteredMajorIdx: gs.enteredMajorIdx,
      majorName: gs.schedule?.majorIdx != null ? gs.schedule?.majors?.[gs.schedule.majorIdx]?.name : null,
      majorCompleted: gs.schedule?.majorIdx != null ? gs.schedule?.majors?.[gs.schedule.majorIdx]?.completed : null,
      hasBracket: gs.schedule?.majorIdx != null ? !!gs.schedule?.majors?.[gs.schedule.majorIdx]?.bracket : null,
      bracketSeedCount: gs.schedule?.majorIdx != null ? gs.schedule?.majors?.[gs.schedule.majorIdx]?.bracket?.seeds?.length : null,
      eventTeamIds: gs.schedule?.currentMajorEventTeams ? Object.keys(gs.schedule.currentMajorEventTeams) : null,
    };
  });
  console.log(`\n[${label}]`, JSON.stringify(s, null, 2));
  return s;
}

await page.waitForTimeout(800);
await snapshot("after team select");

// Drive the season — phase by phase
const MAX_STEPS = 200;
for (let step = 0; step < MAX_STEPS; step++) {
  const phase = await getPhase();
  if (!phase) break;

  if (phase === "stage") {
    // Click "Sim Rest of Stage X"
    const ok = await clickByText(/Sim Rest of Stage/);
    if (!ok) {
      console.error("Could not find Sim Rest of Stage button — body text:");
      console.error((await page.$eval("body", el => el.innerText)).slice(0, 500));
      break;
    }
    await page.waitForTimeout(400);
  } else if (phase === "challengerQualifier") {
    // First try Finish Qualifier
    const ok = await clickByText(/Finish Qualifier/);
    if (!ok) {
      await clickByText(/Continue to/);
    }
    await page.waitForTimeout(400);
    const phase2 = await getPhase();
    if (phase2 === "challengerQualifier") {
      // Click Continue
      await clickByText(/Continue to/);
      await page.waitForTimeout(400);
    }
  } else if (phase === "major") {
    // Enter tournament if MajorEntryOverlay is shown
    const enteredIdx = await getEnteredIdx();
    const majorIdx = await getMajorIdx();
    if (enteredIdx !== majorIdx) {
      const ok = await clickByText(/Enter Tournament/);
      if (!ok) {
        console.error("Could not find Enter Tournament button");
        break;
      }
      await page.waitForTimeout(400);
    }
    // Click Finish Major
    const ok = await clickByText(/Finish/);
    if (!ok) {
      console.error("Could not find Finish button. Body:");
      console.error((await page.$eval("body", el => el.innerText)).slice(0, 800));
      break;
    }
    await page.waitForTimeout(800);
    // If ChampionScreen appears, click Return
    const ret = await clickByText(/Return to Season/);
    if (ret) await page.waitForTimeout(400);
    await snapshot(`after major ${majorIdx}`);
  } else if (phase === "preChamps") {
    await snapshot("preChamps");
    // Click Begin Championship
    const ok = await clickByText(/Begin Championship/);
    if (!ok) {
      console.error("Could not find Begin Championship button. Body:");
      console.error((await page.$eval("body", el => el.innerText)).slice(0, 800));
      break;
    }
    await page.waitForTimeout(800);
    await snapshot("after Begin Championship");
  } else if (phase === "offseason" || phase === "contracts") {
    await snapshot("offseason/contracts");
    console.log("Reached offseason — stopping.");
    break;
  } else {
    console.error("Unknown phase:", phase);
    break;
  }
}

await snapshot("final");

if (errors.length) {
  console.error("\n=== UNCAUGHT ERRORS ===");
  for (const e of errors) {
    console.error(e.kind, ":", e.message);
    if (e.stack) console.error(e.stack);
  }
} else {
  console.log("\nNo uncaught errors captured.");
}

await browser.close();
process.exit(errors.length ? 1 : 0);
