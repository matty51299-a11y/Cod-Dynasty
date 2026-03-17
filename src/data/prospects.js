// src/data/prospects.js
// Generates 150 fictional Challengers/prospect players.
// Scouting is imperfect: true ratings are hidden behind a scouted version
// with noise until the player is signed or fully scouted.

// Seeded PRNG so the same save always gets the same 150 prospects.
function seededRng(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

const FIRST_NAMES = [
  "Apex","Bolt","Crypt","Drift","Echo","Flux","Ghost","Haze","Ion","Jinx",
  "Koda","Lux","Mirage","Nova","Orbit","Pulse","Quill","Rex","Sable","Titan",
  "Umbra","Vex","Wrath","Xero","Yeti","Zane","Blaze","Cole","Dusk","Edge",
  "Fable","Grail","Hawk","Iron","Jade","Knox","Lance","Moss","Neon","Onyx",
  "Pike","Quinn","Raze","Shift","Tide","Uzi","Vane","Wolf","Xion","York",
  "Arlo","Brix","Cruz","Dino","Enzo","Finn","Gage","Holt","Ivan","Jace",
  "Kane","Luca","Mace","Nash","Oslo","Pax","Reef","Sage","Tao","Uno",
  "Vale","Wade","Xavi","Zack","Ash","Ben","Cal","Dev","Eli","Fenn",
  "Gray","Hex","Jax","Kai","Leo","Max","Nyx","Oak","Ray","Sky",
  "Tav","Van","Wes","Yul","Zen","Ace","Bane","Colt","Dax","Eon",
  "Fal","Gil","Hal","Ikar","Jay","Kell","Lorn","Mok","Nox","Oz",
  "Phen","Ral","Sol","Trix","Ulk","Vik","Wyn","Xul","Yon","Zur",
  "Aiden","Blake","Chase","Drew","Evan","Flynn","Grant","Hayes","Ike","Joel",
  "Kyle","Lane","Miles","Neal","Owen","Paul","Rhys","Scott","Troy","Vince",
];

const LAST_NAMES_TAGS = [
  "GG","XD","FPS","Pro","AIM","Zap","Rng","Leet","IGL","Frag",
  "SMG","AR","HP","Obj","Snip","Rush","Roam","Lurk","Push","Flank",
  "V2","V3","X","Zero","One","99","777","420","360","noscope",
  "EU","NA","AP","MENA","LA","NY","TX","FL","CA","UK",
  "Jr","II","III","IV","The","Real","True","Pure","Raw","Based",
];

const ROLES = [
  "Entry SMG","Slayer SMG","Flex","Main AR","Objective","Search Specialist"
];

const REGIONS = ["NA","EU","AP","MENA","SA"];

// Archetype templates define the distribution shape for a type of prospect
const ARCHETYPES = [
  // raw high-upside
  { label:"raw_upside",    weight:18, overallMin:62, overallMax:74, potentialBonus:14, roles:["Entry SMG","Slayer SMG","Flex"] },
  // polished low-ceiling
  { label:"polished",      weight:15, overallMin:74, overallMax:83, potentialBonus:3,  roles:["Main AR","Search Specialist","Objective"] },
  // SMG heavy
  { label:"smg_heavy",     weight:20, overallMin:68, overallMax:80, potentialBonus:8,  roles:["Entry SMG","Slayer SMG"] },
  // AR/flex
  { label:"ar_flex",       weight:20, overallMin:68, overallMax:80, potentialBonus:9,  roles:["Main AR","Flex"] },
  // search specialist
  { label:"search_spec",   weight:12, overallMin:70, overallMax:82, potentialBonus:6,  roles:["Search Specialist"] },
  // toxic/high-ego risky
  { label:"risky_ego",     weight:10, overallMin:72, overallMax:86, potentialBonus:10, roles:["Slayer SMG","Entry SMG","Flex"] },
  // glue/teamwork
  { label:"glue",          weight:15, overallMin:68, overallMax:79, potentialBonus:7,  roles:["Objective","Flex","Main AR"] },
  // objective specialist
  { label:"obj_spec",      weight:10, overallMin:66, overallMax:78, potentialBonus:9,  roles:["Objective"] },
];

function pickWeighted(items, rng) {
  const total = items.reduce((s, a) => s + a.weight, 0);
  let r = rng() * total;
  for (const item of items) {
    r -= item.weight;
    if (r <= 0) return item;
  }
  return items[items.length - 1];
}

function ri(min, max, rng) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function clamp(v, min=40, max=99) {
  return Math.max(min, Math.min(max, Math.round(v)));
}

export function generateProspects(seed = 42) {
  const rng = seededRng(seed);
  const prospects = [];

  for (let i = 0; i < 150; i++) {
    const arch = pickWeighted(ARCHETYPES, rng);
    const firstName = FIRST_NAMES[Math.floor(rng() * FIRST_NAMES.length)];
    const tag = LAST_NAMES_TAGS[Math.floor(rng() * LAST_NAMES_TAGS.length)];
    const name = `${firstName}${rng() > 0.5 ? tag : ""}`;

    const age = ri(17, 22, rng);
    const primary = arch.roles[Math.floor(rng() * arch.roles.length)];
    const secondary = ROLES[Math.floor(rng() * ROLES.length)];
    const overall = ri(arch.overallMin, arch.overallMax, rng);
    const potential = clamp(overall + ri(arch.potentialBonus - 3, arch.potentialBonus + 5, rng));

    // Build individual ratings around overall with archetype bias
    const isSmg = primary === "Entry SMG" || primary === "Slayer SMG";
    const isSearch = primary === "Search Specialist";
    const isObj = primary === "Objective";

    const gunny       = clamp(overall + (isSmg   ? ri(2,10,rng)  : ri(-8,4,rng)));
    const awareness   = clamp(overall + (isSearch ? ri(4,12,rng) : ri(-6,6,rng)));
    const objective   = clamp(overall + (isObj    ? ri(4,12,rng) : ri(-8,4,rng)));
    const searchIQ    = clamp(overall + (isSearch ? ri(6,14,rng) : ri(-6,6,rng)));
    const clutch      = clamp(overall + ri(-8, 8, rng));
    const teamwork    = clamp(overall + ri(-10, 10, rng));
    const composure   = clamp(overall + ri(-10, 8, rng));
    const adaptability= clamp(overall + ri(-8, 10, rng));

    // Hidden traits: archetypes influence distribution
    const isRisky = arch.label === "risky_ego";
    const isGlue  = arch.label === "glue";
    const ego           = isRisky ? ri(3,5,rng) : (isGlue ? ri(1,2,rng) : ri(1,4,rng));
    const workEthic     = isGlue  ? ri(4,5,rng) : (isRisky ? ri(1,3,rng) : ri(2,5,rng));
    const tiltResistance= isRisky ? ri(1,3,rng) : ri(2,5,rng);
    const leadership    = isGlue  ? ri(3,5,rng) : ri(1,4,rng);
    const metaDependence= ri(1,5,rng);

    // Salary expectation based on overall
    const salary = Math.round((overall / 99) * 80 + 15) * 1000;

    // Scouting noise: scouts see an approximation, not the real value.
    // scoutedOverall is what the UI shows until player is signed.
    const scoutNoise = ri(-8, 8, rng);
    const scoutedOverall = clamp(overall + scoutNoise, 40, 99);
    const scoutedPotential = clamp(potential + ri(-6, 6, rng), 40, 99);

    const region = REGIONS[Math.floor(rng() * REGIONS.length)];

    // developmentCurve: "early" peaks fast, "standard", "late" bloomer
    const curves = ["early","standard","late"];
    const curvePick = rng();
    const developmentCurve = curvePick < 0.25 ? "early" : curvePick < 0.75 ? "standard" : "late";

    prospects.push({
      id: `prospect_${i}_${seed}`,
      name,
      teamId: null, // free agent / challenger
      age,
      primary,
      secondary,
      region,
      archetype: arch.label,
      developmentCurve,
      salary,
      overall,
      potential,
      // displayed ratings (real, known once signed)
      gunny, awareness, objective, searchIQ, clutch, teamwork, composure, adaptability,
      // hidden traits
      ego, workEthic, tiltResistance, leadership, metaDependence,
      // scouted approximations (shown before signing)
      scoutedOverall,
      scoutedPotential,
      scouted: false, // true once fully scouted / signed
      form: 65,
      experience: 0,
      isProspect: true,
    });
  }

  return prospects;
}
