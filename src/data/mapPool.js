// src/data/mapPool.js
// CDL 2026 map pool + best-of-5 series mode order.
// Single source of truth for map identities used by the Map Pool / Mode Strength
// / Veto layer (src/engine/mapProfile.js) and match presentation.

export const CDL_2026_MAP_POOL = {
  hardpoint: [
    { id: "sake_hp",     name: "Sake",     mode: "Hardpoint" },
    { id: "colossus_hp", name: "Colossus", mode: "Hardpoint" },
    { id: "den_hp",      name: "Den",      mode: "Hardpoint" },
    { id: "scar_hp",     name: "Scar",     mode: "Hardpoint" },
    { id: "gridlock_hp", name: "Gridlock", mode: "Hardpoint" },
    { id: "hacienda_hp", name: "Hacienda", mode: "Hardpoint" },
  ],
  snd: [
    { id: "den_snd",      name: "Den",      mode: "Search & Destroy" },
    { id: "gridlock_snd", name: "Gridlock", mode: "Search & Destroy" },
    { id: "raid_snd",     name: "Raid",     mode: "Search & Destroy" },
    { id: "fringe_snd",   name: "Fringe",   mode: "Search & Destroy" },
    { id: "sake_snd",     name: "Sake",     mode: "Search & Destroy" },
    { id: "hacienda_snd", name: "Hacienda", mode: "Search & Destroy" },
  ],
  overload: [
    { id: "den_overload",      name: "Den",      mode: "Overload" },
    { id: "exposure_overload", name: "Exposure", mode: "Overload" },
    { id: "scar_overload",     name: "Scar",     mode: "Overload" },
    { id: "gridlock_overload", name: "Gridlock", mode: "Overload" },
  ],
};

// Internal mode keys used across the system.
export const MODE_KEYS = ["hardpoint", "snd", "overload"];

// Map a mode key to its display name and short tag.
export const MODE_META = {
  hardpoint: { name: "Hardpoint",        short: "HP"  },
  snd:       { name: "Search & Destroy", short: "S&D" },
  overload:  { name: "Overload",         short: "OVR" },
};

// CDL best-of-5 series order (mode per map slot).
export const SERIES_MODE_ORDER = ["hardpoint", "snd", "overload", "hardpoint", "snd"];

// Flat lookup: mapId -> { id, name, mode, modeKey }
export const MAP_BY_ID = (() => {
  const out = {};
  for (const key of MODE_KEYS) {
    for (const m of CDL_2026_MAP_POOL[key]) {
      out[m.id] = { ...m, modeKey: key };
    }
  }
  return out;
})();

// All map ids in pool order (handy for iterating profiles).
export const ALL_MAP_IDS = MODE_KEYS.flatMap(k => CDL_2026_MAP_POOL[k].map(m => m.id));

export function mapsForMode(modeKey) {
  return CDL_2026_MAP_POOL[modeKey] ?? [];
}
