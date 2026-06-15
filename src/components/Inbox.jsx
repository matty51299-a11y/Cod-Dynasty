// src/components/Inbox.jsx
// Full-page Inbox / Event Centre — the manager's primary news and action hub.

import { useState, useMemo } from "react";
import { useGame } from "../store/gameStore.jsx";
import { usePlayerProfile } from "../store/playerProfileContext.jsx";
import {
  getSortedEvents, getActiveEvents, getActionRequiredCount, getUnreadCount,
  EVENT_CATEGORIES, CATEGORY_LIST, CATEGORY_ICON, SEVERITY_ORDER,
  severityColor, severityBg,
} from "../engine/eventCentreEngine.js";

const PHASE_LABEL = {
  stage: "Stage", major: "Major", challengerQualifier: "Qualifier",
  preChamps: "Pre-Champs", offseason: "Offseason", contracts: "Contracts",
};

export default function Inbox({ setScreen }) {
  const { state, dispatch } = useGame();
  const { openProfile } = usePlayerProfile?.() ?? {};
  const [selectedId, setSelectedId] = useState(null);
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterMode, setFilterMode] = useState("all"); // all | unread | action

  const ec = state?.eventCentre;
  const sortedAll = useMemo(() => getSortedEvents(ec), [ec]);

  const filtered = useMemo(() => {
    let items = sortedAll;
    if (filterMode === "unread") items = items.filter(e => !e.read);
    if (filterMode === "action") items = items.filter(e => e.actionRequired && !e.read);
    if (filterCategory !== "all") items = items.filter(e => e.category === filterCategory);
    return items;
  }, [sortedAll, filterMode, filterCategory]);

  const selected = useMemo(() => {
    if (!selectedId) return filtered[0] ?? null;
    return (ec?.events ?? []).find(e => e.id === selectedId) ?? filtered[0] ?? null;
  }, [selectedId, ec, filtered]);

  const categoryCounts = useMemo(() => {
    const active = getActiveEvents(ec);
    const counts = {};
    for (const c of CATEGORY_LIST) counts[c] = 0;
    for (const e of active) {
      if (e.category) counts[e.category] = (counts[e.category] || 0) + 1;
    }
    return counts;
  }, [ec]);

  const actionCount = getActionRequiredCount(ec);
  const unreadCount = getUnreadCount(ec);

  function handleSelectEvent(ev) {
    setSelectedId(ev.id);
    if (!ev.read) dispatch({ type: "MARK_EVENT_READ", eventId: ev.id });
  }

  function handleDismiss(ev) {
    dispatch({ type: "DISMISS_EVENT", eventId: ev.id });
    if (selectedId === ev.id) setSelectedId(null);
  }

  function handleMarkAllRead() {
    dispatch({ type: "MARK_ALL_EVENTS_READ" });
  }

  function handleAction(ev, action) {
    if (!ev.read) dispatch({ type: "MARK_EVENT_READ", eventId: ev.id });
    switch (action) {
      case "review_offer":
      case "open_transfers":
        setScreen?.("transfers");
        break;
      case "open_player":
        if (ev.relatedPlayerId && openProfile) {
          const p = (state.players ?? []).find(pl => pl.id === ev.relatedPlayerId)
            || (state.prospects ?? []).find(pl => pl.id === ev.relatedPlayerId);
          if (p) openProfile(p);
        }
        break;
      case "talk_now":
      case "go_dynamics":
      case "open_dynamics":
        setScreen?.("dynamics");
        break;
      case "view_board":
      case "review_objectives":
        setScreen?.("board");
        break;
      case "view_report":
      case "shortlist":
      case "scout_again":
        setScreen?.("scouting");
        break;
      case "review_contracts":
        setScreen?.("home");
        break;
      case "open_fa":
        setScreen?.("fa");
        break;
      case "view_bracket":
        setScreen?.("home");
        break;
      case "view_standings":
        setScreen?.("standings");
        break;
      case "view_schedule":
        setScreen?.("schedule");
        break;
      case "view_details":
      case "open_match_log":
        setScreen?.("log");
        break;
      case "open_roster":
        setScreen?.("roster");
        break;
      case "dismiss":
        handleDismiss(ev);
        break;
      default:
        break;
    }
  }

  if (!ec) return <div className="inbox-empty">Loading...</div>;

  return (
    <div className="inbox-page">
      {/* Header */}
      <div className="inbox-header">
        <div className="inbox-header-left">
          <h1 className="inbox-title">Inbox</h1>
          <div className="inbox-counts">
            {actionCount > 0 && <span className="inbox-action-count">{actionCount} action{actionCount !== 1 ? "s" : ""} required</span>}
            {unreadCount > 0 && <span className="inbox-unread-count">{unreadCount} unread</span>}
          </div>
        </div>
        <div className="inbox-header-right">
          {unreadCount > 0 && (
            <button className="inbox-mark-all-btn" onClick={handleMarkAllRead}>Mark All Read</button>
          )}
        </div>
      </div>

      <div className="inbox-body">
        {/* Left filter sidebar */}
        <aside className="inbox-filters">
          <div className="inbox-filter-section">
            <div className="inbox-filter-label">View</div>
            {[
              { key: "all", label: "All Events" },
              { key: "unread", label: "Unread" },
              { key: "action", label: "Action Required" },
            ].map(f => (
              <button
                key={f.key}
                className={`inbox-filter-btn ${filterMode === f.key ? "active" : ""}`}
                onClick={() => setFilterMode(f.key)}
              >
                {f.label}
                {f.key === "action" && actionCount > 0 && <span className="inbox-filter-badge">{actionCount}</span>}
                {f.key === "unread" && unreadCount > 0 && <span className="inbox-filter-badge">{unreadCount}</span>}
              </button>
            ))}
          </div>

          <div className="inbox-filter-section">
            <div className="inbox-filter-label">Categories</div>
            <button
              className={`inbox-filter-btn ${filterCategory === "all" ? "active" : ""}`}
              onClick={() => setFilterCategory("all")}
            >All Categories</button>
            {CATEGORY_LIST.map(cat => (
              <button
                key={cat}
                className={`inbox-filter-btn ${filterCategory === cat ? "active" : ""}`}
                onClick={() => setFilterCategory(cat)}
              >
                <span className="inbox-cat-icon">{CATEGORY_ICON[cat] ?? "·"}</span>
                {cat}
                {categoryCounts[cat] > 0 && <span className="inbox-filter-count">{categoryCounts[cat]}</span>}
              </button>
            ))}
          </div>
        </aside>

        {/* Main event list */}
        <div className="inbox-list">
          {filtered.length === 0 ? (
            <div className="inbox-list-empty">
              <div className="inbox-empty-icon">◈</div>
              <div className="inbox-empty-text">
                {filterMode === "action" ? "No action required right now." :
                 filterMode === "unread" ? "All caught up!" :
                 "No events yet. Play some matches to see updates here."}
              </div>
            </div>
          ) : filtered.map(ev => (
            <div
              key={ev.id}
              className={`inbox-card ${!ev.read ? "inbox-card--unread" : ""} ${ev.actionRequired && !ev.read ? "inbox-card--action" : ""} ${selected?.id === ev.id ? "inbox-card--selected" : ""}`}
              style={{ borderLeftColor: severityColor(ev.severity), background: ev.actionRequired && !ev.read ? severityBg(ev.severity) : undefined }}
              onClick={() => handleSelectEvent(ev)}
            >
              <div className="inbox-card-top">
                <span className="inbox-card-category" style={{ color: severityColor(ev.severity) }}>
                  {CATEGORY_ICON[ev.category] ?? "·"} {ev.category}
                </span>
                {ev.actionRequired && !ev.read && <span className="inbox-card-action-chip">Action Required</span>}
                {!ev.read && <span className="inbox-card-unread-dot" />}
              </div>
              <div className="inbox-card-title">{ev.title}</div>
              {ev.summary && <div className="inbox-card-summary">{ev.summary}</div>}
              <div className="inbox-card-meta">
                <span>S{ev.season} · {PHASE_LABEL[ev.phase] ?? ev.phase}</span>
                <span className="inbox-card-sev" style={{ color: severityColor(ev.severity) }}>
                  {ev.severity}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Right detail panel */}
        <aside className="inbox-detail">
          {selected ? (
            <div className="inbox-detail-inner">
              <div className="inbox-detail-header">
                <span className="inbox-detail-cat" style={{ color: severityColor(selected.severity) }}>
                  {CATEGORY_ICON[selected.category] ?? "·"} {selected.category}
                </span>
                <span className="inbox-detail-sev" style={{ background: severityColor(selected.severity) }}>
                  {selected.severity}
                </span>
              </div>
              <h2 className="inbox-detail-title">{selected.title}</h2>
              <p className="inbox-detail-summary">{selected.summary}</p>
              <div className="inbox-detail-meta">
                <span>Season {selected.season}</span>
                <span>{PHASE_LABEL[selected.phase] ?? selected.phase}</span>
              </div>

              {/* Related context */}
              {selected.relatedPlayerId && (() => {
                const p = (state.players ?? []).find(pl => pl.id === selected.relatedPlayerId)
                  || (state.prospects ?? []).find(pl => pl.id === selected.relatedPlayerId);
                if (!p) return null;
                return (
                  <div className="inbox-detail-related">
                    <div className="inbox-detail-related-label">Related Player</div>
                    <div className="inbox-detail-related-name">{p.name}</div>
                    <div className="inbox-detail-related-info">
                      OVR {p.overall} · Age {p.age} · {p.primary}
                      {p.teamId ? ` · ${state.players?.find(pl => pl.id === p.id)?.teamId}` : ""}
                    </div>
                  </div>
                );
              })()}

              {/* Recommendation */}
              {selected.type === "transfer_offer" && (
                <div className="inbox-detail-recommendation">
                  Assistant GM: "Review this offer carefully. Consider the player's value to your squad and the fee on the table."
                </div>
              )}
              {selected.type === "morale_meeting" && (
                <div className="inbox-detail-recommendation">
                  Assistant GM: "This player has something on their mind. A timely conversation could prevent issues."
                </div>
              )}
              {selected.type === "board_warning" && (
                <div className="inbox-detail-recommendation">
                  Assistant GM: "The board expects a response. Improved results or a strategic plan could restore confidence."
                </div>
              )}
              {selected.type === "contract_review" && (
                <div className="inbox-detail-recommendation">
                  Assistant GM: "Don't let key players slip away. Review expiring contracts before free agency opens."
                </div>
              )}
              {selected.type === "scout_report" && (
                <div className="inbox-detail-recommendation">
                  Analyst: "This report is ready for review. Deeper scouting could narrow our estimates further."
                </div>
              )}
              {selected.type === "promise_at_risk" && (
                <div className="inbox-detail-recommendation">
                  Assistant GM: "This promise is at risk of being broken. Act now to maintain trust."
                </div>
              )}

              {/* Action buttons */}
              {selected.actions?.length > 0 && (
                <div className="inbox-detail-actions">
                  {selected.actions.map(a => (
                    <button
                      key={a}
                      className={`inbox-action-btn ${a === "dismiss" ? "inbox-action-btn--secondary" : ""}`}
                      onClick={() => handleAction(selected, a)}
                    >
                      {formatActionLabel(a)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="inbox-detail-empty">
              <div className="inbox-empty-icon">◈</div>
              <div>Select an event to see details</div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function formatActionLabel(action) {
  const labels = {
    review_offer: "Review Offer",
    open_player: "View Player",
    open_transfers: "Open Transfers",
    dismiss: "Dismiss",
    talk_now: "Talk Now",
    go_dynamics: "Open Dynamics",
    open_dynamics: "Open Dynamics",
    delay: "Delay",
    view_board: "View Board",
    review_objectives: "Review Objectives",
    view_report: "View Report",
    scout_again: "Scout Again",
    shortlist: "Shortlist",
    review_contracts: "Review Contracts",
    open_fa: "Open Free Agency",
    open_roster: "Open Roster",
    view_bracket: "View Bracket",
    view_standings: "View Standings",
    view_schedule: "View Schedule",
    view_details: "View Details",
    open_match_log: "Open Match Log",
  };
  return labels[action] ?? action.replaceAll("_", " ").replace(/^./, c => c.toUpperCase());
}
