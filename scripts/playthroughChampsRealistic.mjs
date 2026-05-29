// Drives Champs by clicking "Sim Next Match" repeatedly, mimicking a player
// who clicks through one match at a time. Also tries "Sim WB Round 1" etc.
import { chromium } from "playwright";

const URL = process.env.URL || "http://localhost:5173";

const browser = await chromium.launch();
const page = await browser.newPage();

const errors = [];
page.on("pageerror", err => {
  errors.push({ kind: "pageerror", message: err.message, stack: err.stack });
  console.error("[pageerror]", err.message);
  if (err.stack) console.error(err.stack.split("\n").slice(0, 6).join("\n"));
});
page.on("console", msg => {
  if (msg.type() === "error") console.error(`[console.error]`, msg.text());
});

await page.goto(URL);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForTimeout(500);

// Pick the first team card.
await page.click(".team-card");
await page.waitForTimeout(800);
console.log("phase after team select:", await page.evaluate(() => window.__gameState?.schedule?.phase ?? null));

async function getPhase() {
  return await page.evaluate(() => window.__gameState?.schedule?.phase ?? null);
}
async function getMajorIdx() {
  return await page.evaluate(() => window.__gameState?.schedule?.majorIdx ?? null);
}
async function getEnteredIdx() {
  return await page.evaluate(() => window.__gameState?.enteredMajorIdx ?? null);
}
async function clickByText(rx) {
  const el = await page.$(`text=${rx}`);
  if (!el) return false;
  try { await el.click({ timeout: 1500 }); return true; } catch { return false; }
}

// Drive all stages and majors as before, but for Champs (major 4) use
// "Sim Next Match" individually.
for (let step = 0; step < 400; step++) {
  const phase = await getPhase();
  if (!phase) break;

  if (phase === "stage") {
    if (!(await clickByText(/Sim Rest of Stage/))) {
      console.error("no Sim Rest button");
      break;
    }
    await page.waitForTimeout(300);
  } else if (phase === "challengerQualifier") {
    if (!(await clickByText(/Finish Qualifier/))) {
      await clickByText(/Continue to/);
    }
    await page.waitForTimeout(300);
    const phase2 = await getPhase();
    if (phase2 === "challengerQualifier") {
      await clickByText(/Continue to/);
      await page.waitForTimeout(300);
    }
  } else if (phase === "major") {
    const enteredIdx = await getEnteredIdx();
    const majorIdx = await getMajorIdx();
    if (enteredIdx !== majorIdx) {
      if (!(await clickByText(/Enter Tournament/))) {
        console.error("can't find Enter Tournament");
        break;
      }
      await page.waitForTimeout(300);
    }
    if (majorIdx === 4) {
      // Champs — click Sim Next Match one at a time
      console.log(`Champs step ${step}: simming next match`);
      let clicked = await clickByText(/Sim Next Match/);
      if (!clicked) {
        // Try Play Match for user team
        clicked = await clickByText(/Play Match/);
      }
      if (!clicked) {
        // Try Sim round
        clicked = await clickByText(/Sim WB Round/) || await clickByText(/Sim LB Round/) || await clickByText(/Sim Grand Final/);
      }
      if (!clicked) {
        // Major is complete — return
        if (await clickByText(/Return to Season/)) {
          await page.waitForTimeout(300);
          continue;
        }
        console.error("Champs: no actionable button");
        console.error(((await page.$eval("body", el => el.innerText)).slice(0, 1000)));
        break;
      }
      await page.waitForTimeout(500);
      // If the result modal opens (match center), play through it
      while (true) {
        const startBtn = await page.$('text="Start Match"');
        if (startBtn) { await startBtn.click(); await page.waitForTimeout(800); continue; }
        const continueBtn = await page.$('text="Continue"');
        if (continueBtn) { await continueBtn.click(); await page.waitForTimeout(400); continue; }
        const doneBtn = await page.$('text="Done"');
        if (doneBtn) { await doneBtn.click(); await page.waitForTimeout(400); continue; }
        break;
      }
    } else {
      // Regular major — finish it
      if (!(await clickByText(/Finish/))) {
        console.error("no Finish button in regular major");
        break;
      }
      await page.waitForTimeout(500);
      await clickByText(/Return to Season/);
      await page.waitForTimeout(300);
    }
  } else if (phase === "preChamps") {
    if (!(await clickByText(/Begin Championship/))) {
      console.error("no Begin Championship");
      break;
    }
    await page.waitForTimeout(500);
  } else if (phase === "offseason" || phase === "contracts") {
    console.log("Reached offseason — stop.");
    break;
  } else {
    console.error("Unknown phase:", phase);
    break;
  }
}

if (errors.length) {
  console.error("\n=== UNCAUGHT ERRORS ===");
  for (const e of errors) {
    console.error(e.kind, ":", e.message);
    if (e.stack) console.error(e.stack);
  }
}
console.log("Final phase:", await getPhase());
console.log("Errors:", errors.length);
await browser.close();
process.exit(errors.length ? 1 : 0);
