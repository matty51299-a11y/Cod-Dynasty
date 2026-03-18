// src/data/teams.js
// The 12 CDL franchises for the 2026 season.
// Each team has a unique id, display name, short tag, and primary color.

// budgetTier: 1–5 franchise spending capacity.
//   5 = elite org (can build star rosters)
//   4 = strong org (1 star + quality depth)
//   3 = mid org (solid, competitive builds)
//   2 = small org (challenger/value path preferred)
export const CDL_TEAMS = [
  { id: "boston",    name: "Boston Breach",          tag: "BOS",  color: "#C8102E", budgetTier: 2 },
  { id: "carolina",  name: "Carolina Royal Ravens",  tag: "CAR",  color: "#7B2D8B", budgetTier: 3 },
  { id: "cloud9",    name: "Cloud9 New York",        tag: "C9",   color: "#1B94DB", budgetTier: 4 },
  { id: "faze",      name: "FaZe Vegas",             tag: "FaZe", color: "#CC0000", budgetTier: 5 },
  { id: "g2",        name: "G2 Minnesota",           tag: "G2",   color: "#56BE5A", budgetTier: 4 },
  { id: "lat",       name: "Los Angeles Thieves",    tag: "LAT",  color: "#FF4500", budgetTier: 5 },
  { id: "miami",     name: "Miami Heretics",         tag: "MIA",  color: "#00B2A9", budgetTier: 4 },
  { id: "optic",     name: "OpTic Texas",            tag: "OTX",  color: "#3BA03A", budgetTier: 5 },
  { id: "paris",     name: "Paris Gentle Mates",     tag: "PGM",  color: "#0055A4", budgetTier: 2 },
  { id: "riyadh",    name: "Riyadh Falcons",         tag: "RFL",  color: "#006C35", budgetTier: 3 },
  { id: "toronto",   name: "Toronto KOI",            tag: "TOR",  color: "#9B1CDB", budgetTier: 3 },
  { id: "vancouver", name: "Vancouver Surge",        tag: "VAN",  color: "#00AEEF", budgetTier: 2 },
];
