// src/components/StaffPanel.jsx
// Staff & Coaching management screen.
// Shows current staff for the user's team + available (free agent) staff pool.

import { useState } from "react";
import { useGame } from "../store/gameStore.jsx";
import { CDL_TEAMS } from "../data/teams.js";
import { STAFF_ROLES } from "../data/staff.js";
import {
  getStaffForTeam,
  getFreeStaff,
  getKeyAttributes,
  roleLabel,
  calcStaffBonuses,
  staffPayroll,
} from "../engine/staffEngine.js";

const ROLE_ORDER  = ["head_coach", "gm", "analyst", "performance_coach"];
const ROLE_COLORS = {
  head_coach:        "#60a5fa",
  gm:                "#fbbf24",
  analyst:           "#a78bfa",
  performance_coach: "#34d399",
};

function repColor(rep) {
  if (rep >= 90) return "var(--green)";
  if (rep >= 80) return "var(--accent)";
  if (rep >= 70) return "var(--text)";
  return "var(--text-dim)";
}

function attrBar(val) {
  const pct = Math.min(100, Math.max(0, val ?? 0));
  const color = pct >= 80 ? "var(--green)" : pct >= 65 ? "var(--accent)" : "var(--text-dim)";
  return (
    <span className="staff-attr-bar-wrap">
      <span className="staff-attr-bar" style={{ width: `${pct}%`, background: color }} />
    </span>
  );
}

function AttrCell({ attrs }) {
  return (
    <div className="staff-attrs">
      {attrs.map(a => (
        <span key={a.key} className="staff-attr-item">
          <span className="staff-attr-label">{a.key}</span>
          {attrBar(a.value)}
          <span className="staff-attr-val" style={{ color: a.value >= 80 ? "var(--green)" : a.value >= 65 ? "var(--accent)" : "var(--text-dim)" }}>
            {a.value}
          </span>
        </span>
      ))}
    </div>
  );
}

function TraitList({ traits }) {
  if (!traits?.length) return <span className="staff-no-traits">—</span>;
  return (
    <div className="staff-traits">
      {traits.map(t => <span key={t} className="staff-trait-pill">{t}</span>)}
    </div>
  );
}

function SalaryFmt({ salary }) {
  if (!salary) return <span>—</span>;
  if (salary >= 1000) return <span>${(salary / 1000).toFixed(0)}k</span>;
  return <span>${salary}</span>;
}

function RoleBadge({ role }) {
  const color = ROLE_COLORS[role] ?? "var(--text-dim)";
  return (
    <span className="staff-role-badge" style={{ borderColor: color, color }}>
      {roleLabel(role)}
    </span>
  );
}

// ── Current Staff table ───────────────────────────────────────────────────────
function CurrentStaffTable({ teamStaff, onFire }) {
  const sorted = [...teamStaff].sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role));

  if (!sorted.length) {
    return <p className="staff-empty">No staff assigned. Use the Available Staff section below to hire.</p>;
  }

  return (
    <div className="staff-table-wrap">
      <table className="staff-table">
        <thead>
          <tr>
            <th>Role</th>
            <th>Name</th>
            <th>Rep</th>
            <th>Key Attributes</th>
            <th>Salary</th>
            <th>Contract</th>
            <th>Traits</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(s => (
            <tr key={s.id}>
              <td><RoleBadge role={s.role} /></td>
              <td className="staff-name-cell">
                <span className="staff-name">{s.name}</span>
                {s.age && <span className="staff-age-dim">Age {s.age}</span>}
              </td>
              <td>
                <span style={{ color: repColor(s.reputation), fontWeight: 700 }}>{s.reputation}</span>
              </td>
              <td><AttrCell attrs={getKeyAttributes(s)} /></td>
              <td className="staff-salary-cell"><SalaryFmt salary={s.salary} /></td>
              <td className="staff-contract-cell">
                <span className={s.contractYears <= 1 ? "staff-expiring" : ""}>
                  {s.contractYears > 0 ? `${s.contractYears} yr${s.contractYears !== 1 ? "s" : ""}` : "Exp"}
                </span>
              </td>
              <td><TraitList traits={s.traits} /></td>
              <td>
                <button className="staff-fire-btn" onClick={() => onFire(s.id)} title={`Release ${s.name}`}>
                  Release
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Available Staff table ─────────────────────────────────────────────────────
function AvailableStaffTable({ freeStaff, onHire, userTeamStaff, filterRole }) {
  const filtered = freeStaff
    .filter(s => !filterRole || s.role === filterRole)
    .sort((a, b) => b.reputation - a.reputation);

  if (!filtered.length) {
    return <p className="staff-empty">No available staff{filterRole ? ` for this role` : ""} right now.</p>;
  }

  return (
    <div className="staff-table-wrap">
      <table className="staff-table">
        <thead>
          <tr>
            <th>Role</th>
            <th>Name</th>
            <th>Rep</th>
            <th>Tactical</th>
            <th>Dev</th>
            <th>Scout</th>
            <th>Negot</th>
            <th>Chem</th>
            <th>Demand</th>
            <th>Traits</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {filtered.map(s => {
            const incumbent = userTeamStaff.find(ts => ts.role === s.role);
            return (
              <tr key={s.id}>
                <td><RoleBadge role={s.role} /></td>
                <td className="staff-name-cell">
                  <span className="staff-name">{s.name}</span>
                  {s.age && <span className="staff-age-dim">Age {s.age}</span>}
                </td>
                <td><span style={{ color: repColor(s.reputation), fontWeight: 700 }}>{s.reputation}</span></td>
                <td><span className="staff-stat">{s.tactical}</span></td>
                <td><span className="staff-stat">{s.development}</span></td>
                <td><span className="staff-stat">{s.scouting}</span></td>
                <td><span className="staff-stat">{s.negotiation}</span></td>
                <td><span className="staff-stat">{s.chemistry}</span></td>
                <td className="staff-salary-cell"><SalaryFmt salary={s.salary} /></td>
                <td><TraitList traits={s.traits} /></td>
                <td>
                  <button className="staff-hire-btn" onClick={() => onHire(s.id)}>
                    {incumbent ? "Replace" : "Hire"}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Bonuses display ───────────────────────────────────────────────────────────
function BonusChips({ bonuses }) {
  if (!bonuses) return null;
  const items = [
    { key: "Chemistry",    icon: "⚗", val: bonuses.chemistry,   color: "#34d399" },
    { key: "Development",  icon: "↑",  val: bonuses.development, color: "#60a5fa" },
    { key: "Scouting",     icon: "◉",  val: bonuses.scouting,    color: "#a78bfa" },
    { key: "Negotiation",  icon: "$",  val: bonuses.negotiation, color: "#fbbf24" },
    { key: "Tactical",     icon: "⚙",  val: bonuses.tactical,    color: "#f87171" },
  ];
  return (
    <div className="staff-bonus-row">
      {items.map(b => (
        <span key={b.key} className="staff-bonus-chip" title={b.key}>
          <span className="staff-bonus-icon" style={{ color: b.color }}>{b.icon}</span>
          <span className="staff-bonus-label">{b.key}</span>
          <span className="staff-bonus-val" style={{ color: b.val > 0 ? b.color : "var(--text-dim)" }}>
            {b.val > 0 ? `+${b.val}` : b.val}
          </span>
        </span>
      ))}
      <span className="staff-bonus-note">Display only — match sim wiring TODO</span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function StaffPanel() {
  const { state, dispatch } = useGame();
  const [filterRole, setFilterRole] = useState("");

  if (!state) return null;
  const { userTeamId, staff = [], season } = state;
  const team = CDL_TEAMS.find(t => t.id === userTeamId);

  const teamStaff = getStaffForTeam(staff, userTeamId);
  const freeStaff = getFreeStaff(staff);
  const bonuses   = calcStaffBonuses(staff, userTeamId);
  const payroll   = staffPayroll(staff, userTeamId);

  function handleHire(staffId) {
    dispatch({ type: "HIRE_STAFF", staffId, teamId: userTeamId });
  }

  function handleFire(staffId) {
    dispatch({ type: "FIRE_STAFF", staffId });
  }

  return (
    <div className="staff-panel">
      {/* ── Header ── */}
      <div className="staff-header">
        <div>
          <h2 className="staff-title">Staff &amp; Coaching</h2>
          <p className="staff-subtitle" style={{ color: team?.color ?? "var(--accent)" }}>
            {team?.name ?? "Your Team"}
          </p>
        </div>
        <div className="staff-payroll-chip">
          <span className="staff-payroll-label">Staff Payroll</span>
          <span className="staff-payroll-val">${(payroll / 1000).toFixed(0)}k / yr</span>
        </div>
      </div>

      {/* ── Staff bonuses overview ── */}
      <div className="staff-bonuses-card">
        <div className="staff-card-label">COACHING BONUSES</div>
        <BonusChips bonuses={bonuses} />
      </div>

      {/* ── Current staff ── */}
      <div className="staff-section">
        <div className="staff-section-header">
          <h3>Current Staff</h3>
          <span className="staff-count">{teamStaff.length} / 4</span>
        </div>
        <CurrentStaffTable teamStaff={teamStaff} onFire={handleFire} />
      </div>

      {/* ── Available staff ── */}
      <div className="staff-section">
        <div className="staff-section-header">
          <h3>Available Staff</h3>
          <span className="staff-count">{freeStaff.length} candidates</span>
          <div className="staff-role-filters">
            <button
              className={`staff-filter-btn ${!filterRole ? "active" : ""}`}
              onClick={() => setFilterRole("")}
            >All</button>
            {Object.entries(STAFF_ROLES).map(([key, label]) => (
              <button
                key={key}
                className={`staff-filter-btn ${filterRole === key ? "active" : ""}`}
                onClick={() => setFilterRole(filterRole === key ? "" : key)}
              >{label}</button>
            ))}
          </div>
        </div>
        <AvailableStaffTable
          freeStaff={freeStaff}
          onHire={handleHire}
          userTeamStaff={teamStaff}
          filterRole={filterRole}
        />
      </div>
    </div>
  );
}
