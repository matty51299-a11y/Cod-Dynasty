const PLACEMENT_BANDS = [
  { min: 1, max: 1, label: "1st", shorthand: "1st" },
  { min: 2, max: 2, label: "2nd", shorthand: "2nd" },
  { min: 3, max: 3, label: "3rd", shorthand: "3rd" },
  { min: 4, max: 4, label: "4th", shorthand: "4th" },
  { min: 5, max: 6, label: "5th-6th", shorthand: "T6" },
  { min: 7, max: 8, label: "7th-8th", shorthand: "T8" },
  { min: 9, max: 12, label: "9th-12th", shorthand: "T12" },
  { min: 13, max: 16, label: "13th-16th", shorthand: "T16" },
];

function ordinal(n) {
  const v = Math.abs(Number(n));
  const mod100 = v % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (v % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

export function placementRankValue(place) {
  if (place == null) return null;
  const raw = String(place).trim();
  if (!raw) return null;
  const tie = raw.match(/^T(\d+)$/i);
  if (tie) return Number(tie[1]);
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function placementText(place, { shorthand = false } = {}) {
  const value = placementRankValue(place);
  if (value == null) return "Not tracked yet";
  const band = PLACEMENT_BANDS.find(b => value >= b.min && value <= b.max);
  if (band) return shorthand ? band.shorthand : band.label;
  return ordinal(value);
}

export function qualifierPlacementLabel(place) {
  const value = placementRankValue(place);
  if (value == null) return "Qualifier placement not tracked";
  if (value === 1) return "Qualifier Winner";
  if (value === 2) return "Qualifier Runner-up";
  return `Qualifier ${placementText(value)}`;
}
