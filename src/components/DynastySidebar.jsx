import { useDynasty } from "../store/dynastyStore.jsx";

const NAV_ITEMS = [
  { id: "home",       icon: "⌂",  label: "Home" },
  { id: "standings",  icon: "≡",  label: "Standings" },
  { id: "roster",     icon: "♟",  label: "Roster" },
  { id: "league",     icon: "◎",  label: "League Rosters" },
  { id: "fa",         icon: "$",  label: "Free Agency" },
  { id: "amateurs",   icon: "◉",  label: "Amateur Pool" },
  { id: "events",     icon: "◫",  label: "Event Calendar" },
  { id: "eventresult", icon: "🏆", label: "Last Result" },
];

const ROSTERMANIA_NAV = [
  { id: "home",        icon: "⌂",  label: "Home" },
  { id: "rostermania", icon: "↻",  label: "Rostermania Hub" },
  { id: "roster",      icon: "♟",  label: "Roster" },
  { id: "league",      icon: "◎",  label: "League Rosters" },
  { id: "fa",          icon: "$",  label: "Free Agency" },
];

export default function DynastySidebar({ screen, setScreen }) {
  const { state } = useDynasty();
  if (!state) return null;

  const team = state.teams.find(t => t.id === state.userTeamId);
  const nextEvent = state.eventCalendar[state.currentEventIndex];
  const eventsLeft = state.eventCalendar.length - state.currentEventIndex;
  const isRostermania = state.rostermaniaActive;
  const navItems = isRostermania ? ROSTERMANIA_NAV : NAV_ITEMS;

  return (
    <aside className="sidebar">
      <div className="sb-team-block">
        <span className="sb-team-dot" style={{ background: team?.color || "#5b9dff" }} />
        <span className="sb-team-tag" style={{ color: team?.color || "#5b9dff" }}>
          {team?.tag || "???"}
        </span>
        <span className="sb-season">{state.seasonLabel}</span>
      </div>

      {isRostermania && <div className="sb-rostermania-badge">Rostermania</div>}

      <nav className="sb-nav">
        {navItems.map(item => (
          <button
            key={item.id}
            className={`sb-item ${screen === item.id ? "active" : ""}`}
            onClick={() => setScreen(item.id)}
          >
            <span className="sb-icon">{item.icon}</span>
            <span className="sb-label">{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="sb-footer">
        <span className="sb-pill">
          {isRostermania
            ? "Offseason — Rostermania"
            : eventsLeft > 0
              ? `${nextEvent?.name || "Next Event"} · ${eventsLeft} left`
              : "Season Complete"
          }
        </span>
      </div>
    </aside>
  );
}
