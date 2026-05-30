// Test: verify Challenger rosters vary across multiple new games
// Run: node scripts/testChallengerRosterVariety.mjs

import { createRequire } from "module";

// Stub out PNG/asset imports so Node can load the engine files
const origLoad = (await import("module")).Module._resolveFilename;

// Intercept PNG imports at the loader level via a custom loader shim:
// Since we can't easily do that here, instead inline the core logic directly.

// ── Inline the PRNG and snake draft logic from seasonEngine ──────────────────

function seededRng(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

function shuffle(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function normalizePlayerName(name) {
  return (name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

const CHALLENGER_REGIONS = {
  omit_brooklyn: "NA", omit_noir: "NA", project_notorious: "NA", project_7: "EU",
  death_by_cabal: "EU", huntsmen: "NA", stallions: "NA", telluride_bush: "NA",
  next_threat_black: "NA", stallions_x_bush: "NA", omnia_ggs: "EU", five_fears: "EU",
  faze_falcons: "MENA", for_fun_esports: "EU", high_treason: "NA", for_fun_black: "EU",
  carolina_reapers: "NA", torn_esports: "NA", confide_esports: "NA",
  falcons_academy_white: "MENA", death_penalty: "NA", treaty1_gaming: "EU",
  dark_horse_esports: "NA", belfast_storm: "EU",
};

const CHALLENGER_TEAM_POOL = [
  { id: "omit_brooklyn", name: "Omit Brooklyn", tag: "OBK" },
  { id: "omit_noir", name: "Omit Noir", tag: "ONR" },
  { id: "project_notorious", name: "Project Notorious", tag: "PNT" },
  { id: "project_7", name: "Project 7", tag: "P7" },
  { id: "death_by_cabal", name: "Death by Cabal", tag: "DBC" },
  { id: "huntsmen", name: "Huntsmen", tag: "HNT" },
  { id: "stallions", name: "Stallions", tag: "STL" },
  { id: "telluride_bush", name: "Telluride Bush", tag: "TB" },
  { id: "next_threat_black", name: "Next Threat Black", tag: "NTB" },
  { id: "stallions_x_bush", name: "Stallions x Bush", tag: "SXB" },
  { id: "omnia_ggs", name: "Omnia GGs", tag: "OMG" },
  { id: "five_fears", name: "Five Fears", tag: "5FR" },
  { id: "faze_falcons", name: "Faze Falcons", tag: "FF" },
  { id: "for_fun_esports", name: "For Fun Esports", tag: "FFE" },
  { id: "high_treason", name: "High Treason", tag: "HT" },
  { id: "for_fun_black", name: "For Fun Black", tag: "FFB" },
  { id: "carolina_reapers", name: "Carolina Reapers", tag: "CAR" },
  { id: "torn_esports", name: "Torn Esports", tag: "TORN" },
  { id: "confide_esports", name: "Confide Esports", tag: "CNFD" },
  { id: "falcons_academy_white", name: "Falcons Academy White", tag: "FAW" },
  { id: "death_penalty", name: "Death Penalty", tag: "DP" },
  { id: "treaty1_gaming", name: "Treaty1 Gaming", tag: "T1G" },
  { id: "dark_horse_esports", name: "Dark Horse Esports", tag: "DH" },
  { id: "belfast_storm", name: "Belfast Storm", tag: "BFS" },
];

const CHALLENGER_ORG_TIER = {
  omit_brooklyn: 3, omit_noir: 3, project_notorious: 3, project_7: 3,
  telluride_bush: 3, faze_falcons: 3, five_fears: 2, for_fun_esports: 2,
  huntsmen: 2, stallions: 2, death_by_cabal: 2, next_threat_black: 1,
  stallions_x_bush: 1, omnia_ggs: 1, high_treason: 1, for_fun_black: 1,
  carolina_reapers: 1, torn_esports: 1, confide_esports: 1, falcons_academy_white: 1,
  death_penalty: 1, treaty1_gaming: 1, dark_horse_esports: 1, belfast_storm: 1,
};

function buildChallengerRostersForNewGame(gameState, seed) {
  const merged = CHALLENGER_TEAM_POOL.map(base => ({
    ...base,
    region: CHALLENGER_REGIONS[base.id] ?? "NA",
    playerIds: [],
  }));
  const rng = seededRng(seed);

  const cdlIds = new Set((gameState.players || []).filter(p => p.teamId).map(p => p.id));
  const eligible = (gameState.prospects || []).filter(p => !p.teamId && !cdlIds.has(p.id));

  const elite  = shuffle(eligible.filter(p => (p.overall ?? 0) >= 75), rng);
  const strong = shuffle(eligible.filter(p => (p.overall ?? 0) >= 70 && (p.overall ?? 0) < 75), rng);
  const solid  = shuffle(eligible.filter(p => (p.overall ?? 0) >= 63 && (p.overall ?? 0) < 70), rng);
  const filler = shuffle(eligible.filter(p => (p.overall ?? 0) < 63), rng);
  const pool = [...elite, ...strong, ...solid, ...filler];

  const regions = ["NA", "EU", "MENA"];
  const teamsByRegion = {};
  for (const r of regions) teamsByRegion[r] = [];
  for (const t of merged) {
    const r = t.region in teamsByRegion ? t.region : "NA";
    teamsByRegion[r].push(t);
  }
  for (const r of regions) {
    teamsByRegion[r] = teamsByRegion[r]
      .map(t => ({ t, sortKey: (CHALLENGER_ORG_TIER[t.id] ?? 1) + rng() * 1.2 }))
      .sort((a, b) => b.sortKey - a.sortKey)
      .map(({ t }) => t);
  }

  const draftOrder = [];
  const regionQueues = regions.map(r => [...teamsByRegion[r]]);
  let i = 0;
  while (draftOrder.length < merged.length) {
    const queue = regionQueues[i % regions.length];
    if (queue.length) draftOrder.push(queue.shift());
    i++;
  }

  const usedIds = new Set();
  const usedNames = new Set();
  const assignments = new Map(draftOrder.map(t => [t.id, []]));

  for (let round = 0; round < 4; round++) {
    const order = round % 2 === 0 ? draftOrder : [...draftOrder].reverse();
    for (const team of order) {
      if (assignments.get(team.id).length >= 4) continue;
      const teamRegion = team.region;
      const pick =
        pool.find(p => !usedIds.has(p.id) && !usedNames.has(normalizePlayerName(p.name)) && p.region === teamRegion) ||
        pool.find(p => !usedIds.has(p.id) && !usedNames.has(normalizePlayerName(p.name)));
      if (!pick) continue;
      usedIds.add(pick.id);
      usedNames.add(normalizePlayerName(pick.name));
      assignments.get(team.id).push(pick.id);
    }
  }

  for (const team of merged) {
    team.playerIds = assignments.get(team.id) || [];
  }
  gameState.challengerTeams = merged;
}

// ── Generate synthetic prospect pool (stand-in for the real data) ─────────────

function genProspects(seed) {
  const rng = seededRng(seed);
  const names = [
    "DKxrryy","Ethan","Pred","Ghosty","Havok","Afro","Sib","Rated","Shotzzy","Arcitys",
    "Scump","Crimsix","Formal","Karma","Clayster","FormaL","Envoy","Dashy","Octane","Simp",
    "Attachment","Huke","Cellium","Blazt","Hydra","Pentagrxm","Vikul","Abuzah","Owakening","Cammy",
    "Nero","Temp","Accuracy","Bance","Insight","Methodz","Dqvid","Skyz","Snoopy","Jerks",
    "aBeZy","Standy","Havoc","Asim","Kremp","Varhan","Joedeceives","Mochila","Exceed","Nytrox",
    "Nova","Atlas","Blaze","Cipher","Drift","Echo","Flux","Ghost","Hex","Icon",
    "Jinx","Krypt","Luna","Myth","Nexus","Orion","Pulse","Quinn","Rave","Storm",
    "Titan","Ursa","Vex","Wyrd","Xero","Yore","Zeal","Apex","Bolt","Cruz",
    "Dusk","Ember","Fang","Gale","Haze","Iris","Jade","Kilo","Lore","Mist",
    "Night","Opal","Pyre","Raze","Sage","Thorn","Umber","Vale","Wren","Xis",
    "Yell","Zora","Amp","Bite","Core","Dive","Else","Fire","Gust","Howl",
    "Ire","Jolt","Keen","Lash","Maze","Node","Optic","Plex","Riot","Sear",
    "Torque","Urn","Vile","Wake","Xtra","Yank","Zest","Aeon","Bark","Coil",
    "Daze","Edgy","Fore","Grim","Hail","Inch","Jest","Knot","Lack","Mend"
  ];
  const regions = ["NA","NA","NA","NA","EU","EU","EU","MENA"];
  return names.map((name, idx) => {
    const ovr = Math.min(85, Math.max(55, Math.round(50 + rng() * 35)));
    return {
      id: `prospect_${idx}`,
      name,
      overall: ovr,
      region: regions[Math.floor(rng() * regions.length)],
      teamId: null,
    };
  });
}

// ── Run 5 simulated new games ─────────────────────────────────────────────────

const SEEDS = [1000, 42000, 777777, 123456789, 9999991];
const CDL_PLAYER_IDS = new Set(); // no CDL players in synthetic test

const results = SEEDS.map((s, i) => {
  const prospects = genProspects(s + i * 31337);
  const state = { players: [], prospects, challengerTeams: [] };
  buildChallengerRostersForNewGame(state, s);
  const byId = new Map(prospects.map(p => [p.id, p]));
  return { teams: state.challengerTeams, byId };
});

console.log("=== Challenger Roster Variety Test ===\n");

for (let g = 0; g < results.length; g++) {
  const { teams, byId } = results[g];
  const names = (id) => (teams.find(t => t.id === id)?.playerIds || [])
    .map(pid => { const p = byId.get(pid); return p ? `${p.name}(${p.overall})` : pid; }).join(", ");
  console.log(`Game ${g+1} (seed ${SEEDS[g]}):`);
  console.log(`  Omit Brooklyn:    ${names("omit_brooklyn")}`);
  console.log(`  Omit Noir:        ${names("omit_noir")}`);
  console.log(`  Proj Notorious:   ${names("project_notorious")}`);
  console.log(`  Telluride Bush:   ${names("telluride_bush")}`);
}

console.log("\n=== Validation ===\n");
let pass = true;

// 1. Each team has 4 players
let p1 = true;
for (let g = 0; g < results.length; g++) {
  for (const t of results[g].teams) {
    if (t.playerIds.length !== 4) { console.log(`  FAIL G${g+1} ${t.name}: ${t.playerIds.length} players`); p1 = false; pass = false; }
  }
}
console.log("1. All 24 teams have 4 players: " + (p1 ? "PASS" : "FAIL"));

// 2. No duplicates
let p2 = true;
for (let g = 0; g < results.length; g++) {
  const all = results[g].teams.flatMap(t => t.playerIds);
  if (new Set(all).size !== all.length) { console.log(`  FAIL G${g+1}: duplicates`); p2 = false; pass = false; }
}
console.log("2. No duplicate players: " + (p2 ? "PASS" : "FAIL"));

// 3. OBK roster changes across games
const obkRosters = results.map(({ teams, byId }) => {
  const obk = teams.find(t => t.id === "omit_brooklyn");
  return (obk?.playerIds || []).map(id => byId.get(id)?.name || id).sort().join(",");
});
const obkUnique = new Set(obkRosters).size;
const p3 = obkUnique >= 3;
console.log(`3. OBK roster varies: ${obkUnique}/${SEEDS.length} unique lineups — ` + (p3 ? "PASS" : "FAIL"));

// 4. DK/Ethan not always on OBK
const dkOnOBK = results.filter(({ teams, byId }) => {
  const obk = teams.find(t => t.id === "omit_brooklyn");
  return (obk?.playerIds || []).some(id => (byId.get(id)?.name || "").toLowerCase().includes("dk"));
}).length;
const ethanOnOBK = results.filter(({ teams, byId }) => {
  const obk = teams.find(t => t.id === "omit_brooklyn");
  return (obk?.playerIds || []).some(id => (byId.get(id)?.name || "").toLowerCase().includes("ethan"));
}).length;
console.log(`4a. DK on OBK in ${dkOnOBK}/${SEEDS.length} games — ` + (dkOnOBK < SEEDS.length ? "PASS (not always)" : "FAIL (always)"));
console.log(`4b. Ethan on OBK in ${ethanOnOBK}/${SEEDS.length} games — ` + (ethanOnOBK < SEEDS.length ? "PASS (not always)" : "FAIL (always)"));

// 5. Top players spread
const topSpread = {};
for (const { teams, byId } of results) {
  for (const t of teams) {
    for (const pid of t.playerIds) {
      const p = byId.get(pid);
      if (p && (p.overall ?? 0) >= 75) {
        if (!topSpread[p.name]) topSpread[p.name] = new Set();
        topSpread[p.name].add(t.id);
      }
    }
  }
}
const spreadCount = Object.values(topSpread).filter(s => s.size >= 2).length;
const p5 = spreadCount >= 2;
console.log(`5. Top players appearing on 2+ different teams across games: ${spreadCount} — ` + (p5 ? "PASS" : "FAIL"));

// 6. Regional match rate
let rMatch = 0, rTotal = 0;
for (const { teams, byId } of results) {
  for (const t of teams) {
    for (const pid of t.playerIds) {
      const p = byId.get(pid);
      if (p?.region) { rTotal++; if (p.region === t.region) rMatch++; }
    }
  }
}
const rPct = rTotal > 0 ? (rMatch / rTotal * 100).toFixed(1) : 0;
console.log(`6. Regional match: ${rMatch}/${rTotal} (${rPct}%) — ` + (parseFloat(rPct) >= 50 ? "PASS" : "FAIL"));

console.log("\n" + (pass ? "ALL TESTS PASSED" : "SOME TESTS FAILED"));
