// Thorough Champs playthrough: drives through stages/majors, then in Champs,
// visits every sidebar screen after each round, opens player modal, opens
// team hub, plays a match interactively, etc.
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
  if (msg.type() === "error") console.error("[console.error]", msg.text());
});

await page.goto(URL);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForTimeout(500);
await page.click(".team-card");
await page.waitForTimeout(500);

async function getPhase() { return await page.evaluate(() => window.__gameState?.schedule?.phase ?? null); }
async function getMajorIdx() { return await page.evaluate(() => window.__gameState?.schedule?.majorIdx ?? null); }
async function getEnteredIdx() { return await page.evaluate(() => window.__gameState?.enteredMajorIdx ?? null); }

async function clickByText(rx) {
  const el = await page.$(`text=${rx}`);
  if (!el) return false;
  try { await el.click({ timeout: 1500 }); return true; } catch { return false; }
}

async function visitSidebar() {
  const screens = ["standings", "schedule", "kdleaders", "roster", "fa", "prospects", "devreport", "log", "home"];
  for (const s of screens) {
    const btn = await page.$(`[data-screen="${s}"]`);
    if (btn) {
      await btn.click({ timeout: 1000 }).catch(() => {});
      await page.waitForTimeout(150);
    } else {
      // Try by sidebar text
      const sidebarTexts = { standings: "Standings", schedule: "Schedule", kdleaders: "K/D", roster: "Roster", fa: "Free Agency", prospects: "Challengers", devreport: "Dev", log: "Match Log", home: "Dashboard" };
      const txt = sidebarTexts[s];
      if (txt) {
        await clickByText(new RegExp(`^${txt}`));
        await page.waitForTimeout(150);
      }
    }
  }
}

for (let step = 0; step < 400; step++) {
  const phase = await getPhase();
  if (!phase) break;

  if (phase === "stage") {
    if (!(await clickByText(/Sim Rest of Stage/))) break;
    await page.waitForTimeout(300);
  } else if (phase === "challengerQualifier") {
    if (!(await clickByText(/Finish Qualifier/))) {
      await clickByText(/Continue to/);
    }
    await page.waitForTimeout(300);
    if ((await getPhase()) === "challengerQualifier") {
      await clickByText(/Continue to/);
      await page.waitForTimeout(300);
    }
  } else if (phase === "major") {
    const enteredIdx = await getEnteredIdx();
    const majorIdx = await getMajorIdx();
    if (enteredIdx !== majorIdx) {
      if (!(await clickByText(/Enter Tournament/))) break;
      await page.waitForTimeout(300);
    }
    if (majorIdx === 4) {
      console.log(`Champs step ${step}: try every action`);
      await visitSidebar();
      // Open seedings
      const seedSum = await page.$('.mto-seeds-summary');
      if (seedSum) { await seedSum.click().catch(() => {}); await page.waitForTimeout(120); }
      // Click sim round
      let acted = false;
      acted = (await clickByText(/Sim WB Round/)) || (await clickByText(/Sim LB Round/)) ||
              (await clickByText(/Sim Grand Final/)) || (await clickByText(/Sim WB Semifinals/)) ||
              (await clickByText(/Sim WB Final/)) || (await clickByText(/Sim LB Final/));
      if (!acted) acted = await clickByText(/Sim Next Match/);
      if (!acted) acted = await clickByText(/Play Match/);
      if (!acted) {
        if (await clickByText(/Return to Season/)) {
          await page.waitForTimeout(400);
          continue;
        }
        console.error("Champs: no action; body:");
        console.error((await page.$eval("body", el => el.innerText)).slice(0, 1000));
        break;
      }
      await page.waitForTimeout(400);
      // Walk through match center if opened
      for (let i = 0; i < 20; i++) {
        if (await clickByText(/Start Match/)) { await page.waitForTimeout(600); continue; }
        if (await clickByText(/Continue/)) { await page.waitForTimeout(300); continue; }
        if (await clickByText(/Done/)) { await page.waitForTimeout(300); continue; }
        break;
      }
    } else {
      if (!(await clickByText(/Finish/))) break;
      await page.waitForTimeout(400);
      await clickByText(/Return to Season/);
      await page.waitForTimeout(200);
    }
  } else if (phase === "preChamps") {
    await visitSidebar();
    if (!(await clickByText(/Begin Championship/))) break;
    await page.waitForTimeout(500);
  } else if (phase === "offseason" || phase === "contracts") {
    await visitSidebar();
    break;
  } else {
    break;
  }
}

console.log("Final phase:", await getPhase());
console.log("Errors:", errors.length);
await browser.close();
process.exit(errors.length ? 1 : 0);
