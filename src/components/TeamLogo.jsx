import { useState } from "react";

export default function TeamLogo({ team, size = 24, className = "" }) {
  const [broken, setBroken] = useState(false);
  const logo = team?.logo;
  if (logo && !broken) {
    return (
      <img
        src={logo}
        alt={`${team?.tag ?? "team"} logo`}
        className={`team-logo ${className}`}
        style={{ width: size, height: size }}
        onError={() => setBroken(true)}
      />
    );
  }
  return (
    <span
      className={`team-logo-fallback ${className}`}
      style={{ width: size, height: size, borderColor: team?.color ?? "#888", color: team?.color ?? "#888" }}
      title={team?.name ?? "Team"}
    >
      {(team?.tag ?? "?").slice(0, 3).toUpperCase()}
    </span>
  );
}
