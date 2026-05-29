import { canAffordStarterResign, getContractReviewBudget } from "../src/utils/contractBudget.js";

const teamId = "lat";
const players = [
  { id: "locked_1", name: "Locked One", teamId, isSub: false, contractYears: 2, salary: 250_000 },
  { id: "locked_2", name: "Locked Two", teamId, isSub: false, contractYears: 3, salary: 254_000 },
  { id: "scrap", name: "Scrap", teamId, isSub: false, contractYears: 1, salary: 313_000 },
  { id: "nium", name: "Nium", teamId, isSub: false, contractYears: 1, salary: 88_000 },
];

const budget = getContractReviewBudget(players, teamId);
if (budget.cap !== 850_000) throw new Error(`Expected LAT cap 850000, got ${budget.cap}`);
if (budget.lockedCost !== 504_000) throw new Error(`Expected locked cost 504000, got ${budget.lockedCost}`);
if (budget.space !== 346_000) throw new Error(`Expected available space 346000, got ${budget.space}`);

const nium = canAffordStarterResign(players, teamId, "nium", 85_000);
if (!nium.affordable) throw new Error(`Expected Nium 85k to be affordable, got ${JSON.stringify(nium)}`);
if (nium.committedAfter !== 589_000) throw new Error(`Expected committedAfter 589000, got ${nium.committedAfter}`);
if (nium.spaceAfter !== 261_000) throw new Error(`Expected spaceAfter 261000, got ${nium.spaceAfter}`);

const scrapThenNiumPlayers = players.map(p => p.id === "scrap" ? { ...p, contractYears: 2, salary: 290_000 } : p);
const niumAfterScrap = canAffordStarterResign(scrapThenNiumPlayers, teamId, "nium", 85_000);
if (niumAfterScrap.affordable) throw new Error("Expected Nium after Scrap to be over budget at 879k total");
if (niumAfterScrap.committedAfter !== 879_000) throw new Error(`Expected committedAfter 879000, got ${niumAfterScrap.committedAfter}`);
if (niumAfterScrap.spaceAfter !== -29_000) throw new Error(`Expected spaceAfter -29000, got ${niumAfterScrap.spaceAfter}`);

console.log("Contract budget regression passed: expiring current salaries are excluded, Nium 85k is affordable from 346k space, and accepted re-signings are counted.");
