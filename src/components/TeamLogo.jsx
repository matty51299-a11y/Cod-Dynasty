import { useState } from "react";

const VARIANT_SIZES = {
  default: { width: 24, height: 24 },
  table: { width: 32, height: 32 },
  bracket: { width: 20, height: 20 },
  hero: { width: 52, height: 52 },
};

export default function TeamLogo({ team, size = 24, width, height, variant = "default", className = "" }) {
  const [broken, setBroken] = useState(false);
  const variantSize = VARIANT_SIZES[variant] ?? VARIANT_SIZES.default;
  const finalWidth = width ?? size ?? variantSize.width;
  const finalHeight = height ?? size ?? variantSize.height;
  const logo = team?.logo;

  if (logo && !broken) {
    return (
      <img
        src={logo}
        alt={`${team?.tag ?? "team"} logo`}
        className={`team-logo team-logo--${variant} ${className}`}
        style={{ width: finalWidth, height: finalHeight }}
        onError={() => setBroken(true)}
      />
    );
  }
  return (
    <span
      className={`team-logo-fallback team-logo-fallback--${variant} ${className}`}
      style={{ width: finalWidth, height: finalHeight, borderColor: team?.color ?? "#888", color: team?.color ?? "#888" }}
      title={team?.name ?? "Team"}
    >
      {(team?.tag ?? "?").slice(0, 3).toUpperCase()}
    </span>
  );
}
