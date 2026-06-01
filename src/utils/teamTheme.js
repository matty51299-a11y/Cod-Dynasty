// src/utils/teamTheme.js
// Display-only team colour identity helpers for the UI shell.
// Keeps dark management surfaces intact while deriving safe accent tokens from
// the user's current franchise colour.

const DARK_SURFACE = "#14161a";

const TEAM_ACCENT_OVERRIDES = {
  optic: { primaryAccent: "#7CFF6B", secondaryAccent: "#2FB344" },
  g2: { primaryAccent: "#FF4F6D", secondaryAccent: "#9B5CFF" },
  faze: { primaryAccent: "#FF4D4D", secondaryAccent: "#CC0000" },
  riyadh: { primaryAccent: "#35D978", secondaryAccent: "#0C8A47" },
  toronto: { primaryAccent: "#C084FC", secondaryAccent: "#8B5CF6" },
  cloud9: { primaryAccent: "#5BCBFF", secondaryAccent: "#1B94DB" },
  boston: { primaryAccent: "#4ADE80", secondaryAccent: "#16A34A" },
  miami: { primaryAccent: "#2DD4BF", secondaryAccent: "#FB923C" },
  lat: { primaryAccent: "#FF5A5F", secondaryAccent: "#FF4500" },
  vancouver: { primaryAccent: "#38D9FF", secondaryAccent: "#0EA5E9" },
  carolina: { primaryAccent: "#60A5FA", secondaryAccent: "#2563EB" },
  paris: { primaryAccent: "#F472B6", secondaryAccent: "#A78BFA" },
};

function clamp(n, min = 0, max = 255) {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function parseHex(hex) {
  if (!hex || typeof hex !== "string") return null;
  const raw = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) return null;
  return {
    r: parseInt(raw.slice(0, 2), 16),
    g: parseInt(raw.slice(2, 4), 16),
    b: parseInt(raw.slice(4, 6), 16),
  };
}

function toHex({ r, g, b }) {
  return `#${clamp(r).toString(16).padStart(2, "0")}${clamp(g).toString(16).padStart(2, "0")}${clamp(b).toString(16).padStart(2, "0")}`;
}

function mix(hex, target, amount) {
  const a = parseHex(hex);
  const b = parseHex(target);
  if (!a || !b) return hex || target;
  return toHex({
    r: a.r + (b.r - a.r) * amount,
    g: a.g + (b.g - a.g) * amount,
    b: a.b + (b.b - a.b) * amount,
  });
}

function luminance(hex) {
  const rgb = parseHex(hex);
  if (!rgb) return 0;
  const lin = c => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(rgb.r) + 0.7152 * lin(rgb.g) + 0.0722 * lin(rgb.b);
}

function contrast(a, b) {
  const l1 = luminance(a);
  const l2 = luminance(b);
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

function ensureContrastOnDark(hex, minRatio = 4.5) {
  let current = hex || "#60A5FA";
  for (let i = 0; i <= 12; i += 1) {
    if (contrast(current, DARK_SURFACE) >= minRatio) return current;
    current = mix(current, "#FFFFFF", 0.18);
  }
  return current;
}

function readableOnAccent(hex) {
  const black = "#06110A";
  const white = "#FFFFFF";
  return contrast(hex, black) >= contrast(hex, white) ? black : white;
}

function alpha(hex, opacity) {
  const rgb = parseHex(hex) || parseHex("#60A5FA");
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity})`;
}

export function getTeamUiTheme(team) {
  const override = TEAM_ACCENT_OVERRIDES[team?.id] ?? {};
  const base = override.primaryAccent || team?.color || "#60A5FA";
  const primaryAccent = ensureContrastOnDark(base, 4.5);
  const secondaryAccent = ensureContrastOnDark(override.secondaryAccent || mix(primaryAccent, "#FFFFFF", 0.22), 3.0);
  const borderAccent = alpha(primaryAccent, 0.58);
  const softAccentBg = alpha(primaryAccent, 0.12);
  const softerAccentBg = alpha(primaryAccent, 0.07);
  const textAccent = ensureContrastOnDark(primaryAccent, 4.5);

  return {
    primaryAccent,
    secondaryAccent,
    softAccentBg,
    softerAccentBg,
    borderAccent,
    textAccent,
    dangerAccent: "#F87171",
    readableAccentText: readableOnAccent(primaryAccent),
  };
}

export function getTeamThemeStyle(team) {
  const theme = getTeamUiTheme(team);
  return {
    "--accent": theme.primaryAccent,
    "--user-accent": theme.primaryAccent,
    "--user-accent-2": theme.secondaryAccent,
    "--user-accent-soft": theme.softAccentBg,
    "--user-accent-softer": theme.softerAccentBg,
    "--user-accent-border": theme.borderAccent,
    "--user-accent-text": theme.textAccent,
    "--readable-accent-text": theme.readableAccentText,
    "--danger-accent": theme.dangerAccent,
  };
}

export function getTeamTextAccent(team) {
  return getTeamUiTheme(team).textAccent;
}
