// src/utils/mapDisplay.js
// Presentation helpers for CDL map labels and softened map-edge display.

export const MODE_SHORT_DISPLAY = {
  "Hardpoint": "HP",
  "Search & Destroy": "S&D",
  "Overload": "OVR",
};

export function formatMapLabel(slot, mapIdx = 0, { compact = false, includePrefix = true } = {}) {
  const num = Number.isFinite(slot?.slot) ? slot.slot : mapIdx + 1;
  const map = slot?.selectedMap ?? slot ?? {};
  const name = map.name ?? `Map ${num}`;
  const mode = map.mode ?? slot?.mode ?? "";
  const short = MODE_SHORT_DISPLAY[mode] ?? mode;
  if (compact) return `${includePrefix ? `Map ${num} · ` : ""}${name}${short ? ` ${short}` : ""}`;
  return `${includePrefix ? `Map ${num}: ` : ""}${name}${mode ? ` ${mode}` : ""}`;
}

export function softenedMapEdge(edge, tagA, tagB, { includeNumber = true } = {}) {
  const raw = Number(edge) || 0;
  const abs = Math.abs(Math.round(raw));
  if (abs <= 2) return { text: "Even", numberText: "", teamTag: null, visibleValue: 0 };

  const band = abs <= 5 ? "Slight" : abs <= 9 ? "" : abs <= 14 ? "Strong" : "Heavy";
  const teamTag = raw > 0 ? tagA : tagB;
  const visibleValue = Math.min(abs, 12);
  const label = band ? `${band} ${teamTag} edge` : `${teamTag} edge`;
  return {
    text: includeNumber ? `${label} (+${visibleValue})` : label,
    numberText: `+${visibleValue}`,
    teamTag,
    visibleValue,
  };
}
