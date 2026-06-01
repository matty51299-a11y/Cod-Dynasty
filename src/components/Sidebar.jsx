// src/components/Sidebar.jsx
// Left sidebar navigation — replaces the horizontal nav-tabs bar.

import { useGame } from "../store/gameStore.jsx";
import { CDL_TEAMS } from "../data/teams.js";
import { getTeamUiTheme } from "../utils/teamTheme.js";

const NAV_ITEMS = [
  { id: "home",      icon: "⌂",  label: "Home" },
  { id: "standings", icon: "≡",  label: "Standings" },
  { id: "schedule",  icon: "◫",  label: "Schedule" },
  { id: "kdleaders", icon: "↑",  label: "K/D Leaders" },
  { id: "roster",    icon: "♟",  label: "Roster" },
  { id: "board",     icon: "⚖",  label: "Board" },
  { id: "fa",        icon: "$",  label: "Free Agency", offseasonOnly: true },
  { id: "prospects", icon: "◉",  label: "Challengers" },
  { id: "devreport", icon: "⬡",  label: "Dev Report" },
  { id: "staff",     icon: "✦",  label: "Staff" },
  { id: "log",       icon: "▤",  label: "Match Log" },
];

export default function Sidebar({ screen, setScreen, onOpenFeed }) {
  const { state } = useGame();
  if (!state) return null;

  const { schedule, userTeamId } = state;
  const team  = CDL_TEAMS.find(t => t.id === userTeamId);
  const teamTheme = getTeamUiTheme(team);
  const phase = schedule.phase;

  // Phase pill text
  const stageIdx  = schedule.stageIdx ?? 0;
  const stageName = schedule.stages?.[stageIdx]?.name ?? "Stage";
  const majorName = schedule.majors?.[schedule.majorIdx ?? 0]?.name ?? "Major";
  const remaining = (() => {
    if (phase !== "stage") return null;
    const st = schedule.stages?.[stageIdx];
    return st ? st.matches.filter(m => !m.played).length : null;
  })();

  const pillText = (() => {
    if (phase === "stage")      return `${stageName}${remaining != null ? ` · ${remaining} left` : ""}`;
    if (phase === "challengerQualifier") return `${majorName} Qualifier`;
    if (phase === "major")      return `${majorName} — LIVE`;
    if (phase === "preChamps")  return "Pre-Championship";
    if (phase === "offseason")  return "Offseason";
    return phase;
  })();

  const pillClass = phase === "major" || phase === "challengerQualifier" ? "sb-pill sb-pill-live"
                  : phase === "offseason" ? "sb-pill sb-pill-dim"
                  : "sb-pill";

  const hasDevData  = state.progressionLog?.length > 0;
  const unreadFeed  = (state.feed ?? []).filter(f => !f.read).length;
  const showFreeAgency = phase === "offseason" || phase === "contracts" || !!state.offseason?.freeAgencyOpen;
  const visibleNavItems = NAV_ITEMS.filter(item => !item.offseasonOnly || showFreeAgency);

  return (
    <aside className="sidebar">
      {/* Team identity */}
      <div className="sb-team-block">
        <span className="sb-team-dot" style={{ background: teamTheme.primaryAccent, boxShadow: `0 0 12px ${teamTheme.borderAccent}` }} />
        <span className="sb-team-tag" style={{ color: teamTheme.textAccent }}>
          {team?.tag ?? "???"}
        </span>
        <span className="sb-season">S{state.season}</span>
      </div>

      {/* Nav items */}
      <nav className="sb-nav">
        {visibleNavItems.map(item => (
          <button
            key={item.id}
            className={`sb-item ${screen === item.id ? "active" : ""}`}
            onClick={() => setScreen(item.id)}
          >
            <span className="sb-icon">{item.icon}</span>
            <span className="sb-label">{item.label}</span>
            {item.id === "devreport" && hasDevData && <span className="sb-dot" />}
          </button>
        ))}

        {/* Feed button — opens overlay, does not navigate screens */}
        <button className="sb-item sb-feed-btn" onClick={onOpenFeed}>
          <span className="sb-icon">◈</span>
          <span className="sb-label">Feed</span>
          {unreadFeed > 0 && (
            <span className="sb-badge">{unreadFeed > 99 ? "99+" : unreadFeed}</span>
          )}
        </button>
      </nav>

      {/* Phase status pill at bottom */}
      <div className="sb-footer">
        <span className={pillClass}>{pillText}</span>
      </div>
    </aside>
  );
}
