// src/data/teams.js
// The 12 CDL franchises for the 2026 season.
// Each team has a unique id, display name, short tag, and primary color.

import atlantaFazeLogo from "../assets/logos/Atlanta_FaZe_logo.png";
import bostonBreachLogo from "../assets/logos/Boston_Breach_logo.png";
import carolinaRoyalRavensLogo from "../assets/logos/Carolina_Royal_Ravens_logo.png";
import cloud9NewYorkLogo from "../assets/logos/C9_New_York.png";
import g2MinnesotaLogo from "../assets/logos/G2_Minnesota_logo.png";
import laThievesLogo from "../assets/logos/Cdl_la_thieves-red_la.png";
import miamiHereticsLogo from "../assets/logos/Miami_Heretics_logo.png";
import opticTexasLogo from "../assets/logos/Optic-Texas.png";
import parisGentleMatesLogo from "../assets/logos/Paris_Gentle_Mates_logo.png";
import riyadhFalconsLogo from "../assets/logos/Riyadh_Falcons_logo.png";
import torontoKoiLogo from "../assets/logos/Toronto_KOI_logo.png";
import vancouverSurgeLogo from "../assets/logos/Vancouver_Surge_logo.png";

// budgetTier: 2–6 franchise spending capacity.
//   6 = Riyadh Falcons only — highest budget in the CDL
//   5 = top spenders (OpTic, FaZe, Paris) — can build star-heavy rosters
//   4 = upper-mid orgs (LAT, Toronto, Miami, G2) — one star + solid depth
//   3 = (fallback default — no teams currently here)
//   2 = budget orgs (Boston, Carolina, Cloud9, VAN) — challenger/value path
export const CDL_TEAMS = [
  { id: "boston",    name: "Boston Breach",          tag: "BOS",  color: "#C8102E", budgetTier: 2, logo: bostonBreachLogo },
  { id: "carolina",  name: "Carolina Royal Ravens",  tag: "CAR",  color: "#7B2D8B", budgetTier: 2, logo: carolinaRoyalRavensLogo },
  { id: "cloud9",    name: "Cloud9 New York",        tag: "C9",   color: "#1B94DB", budgetTier: 2, logo: cloud9NewYorkLogo },
  { id: "faze",      name: "FaZe Vegas",             tag: "FaZe", color: "#CC0000", budgetTier: 5, logo: atlantaFazeLogo },
  { id: "g2",        name: "G2 Minnesota",           tag: "G2",   color: "#56BE5A", budgetTier: 4, logo: g2MinnesotaLogo },
  { id: "lat",       name: "Los Angeles Thieves",    tag: "LAT",  color: "#FF4500", budgetTier: 4, logo: laThievesLogo },
  { id: "miami",     name: "Miami Heretics",         tag: "MIA",  color: "#00B2A9", budgetTier: 4, logo: miamiHereticsLogo },
  { id: "optic",     name: "OpTic Texas",            tag: "OTX",  color: "#3BA03A", budgetTier: 5, logo: opticTexasLogo },
  { id: "paris",     name: "Paris Gentle Mates",     tag: "PGM",  color: "#0055A4", budgetTier: 5, logo: parisGentleMatesLogo },
  { id: "riyadh",    name: "Riyadh Falcons",         tag: "RFL",  color: "#006C35", budgetTier: 6, logo: riyadhFalconsLogo },
  { id: "toronto",   name: "Toronto KOI",            tag: "TOR",  color: "#9B1CDB", budgetTier: 4, logo: torontoKoiLogo },
  { id: "vancouver", name: "Vancouver Surge",        tag: "VAN",  color: "#00AEEF", budgetTier: 2, logo: vancouverSurgeLogo },
];
