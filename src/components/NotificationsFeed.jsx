// src/components/NotificationsFeed.jsx
// Right-side slide-in panel showing chronological league events.
// Opened via the sidebar feed button; does not navigate away from current screen.

import { useState } from "react";
import { useGame } from "../store/gameStore.jsx";

// Per-type display config: icon + accent color
const FEED_META = {
  signing:        { icon: "✦", color: "var(--accent)" },
  release:        { icon: "↩", color: "var(--text-dim)" },
  retirement:     { icon: "⬡", color: "var(--text-dim)" },
  prospect_class: { icon: "◉", color: "var(--green)" },
  major_champ:    { icon: "★", color: "#f59e0b" },
  champs_champ:   { icon: "★", color: "#f59e0b" },
  major_result:   { icon: "◆", color: "#9db0d0" },
  major_upset:    { icon: "!", color: "#f59e0b" },
  major_elim:     { icon: "✕", color: "var(--red)" },
  major_points:   { icon: "◆", color: "#9db0d0" },
  qual_win:       { icon: "●", color: "var(--green)" },
  qual_top4:      { icon: "○", color: "#9db0d0" },
  qual_debut:     { icon: "✦", color: "var(--green)" },
  roster_move:    { icon: "↔", color: "var(--accent)" },
  standout_perf:  { icon: "◎", color: "var(--green)" },
  win_streak:     { icon: "▲", color: "var(--green)" },
  lose_streak:    { icon: "▼", color: "var(--red)" },
  kd_leader:      { icon: "↑", color: "var(--accent)" },
  top4_climb:     { icon: "▲", color: "var(--green)" },
  out_top8:       { icon: "▼", color: "var(--red)" },
  transfer_offer: { icon: "⇄", color: "#fbbf24" },
  transfer_done:  { icon: "⇄", color: "var(--accent)" },
};

// Maps feed type → filter category
const TYPE_CATEGORY = {
  major_champ:    "results",
  champs_champ:   "results",
  major_result:   "results",
  major_upset:    "results",
  major_elim:     "results",
  major_points:   "results",
  qual_win:       "results",
  qual_top4:      "results",
  qual_debut:     "results",
  signing:        "transfers",
  release:        "transfers",
  retirement:     "transfers",
  roster_move:    "transfers",
  prospect_class: "transfers",
  transfer_offer: "transfers",
  transfer_done:  "transfers",
  kd_leader:      "performance",
  standout_perf:  "performance",
  win_streak:     "performance",
  lose_streak:    "performance",
  top4_climb:     "performance",
  out_top8:       "performance",
};

const PHASE_LABEL = {
  stage:                "Stage",
  major:                "Major",
  challengerQualifier:  "Challenger Qualifier",
  preChamps:            "Pre-Champs",
  offseason:            "Offseason",
  contracts:            "Contracts",
};

const FILTERS = [
  { key: "all",         label: "All" },
  { key: "results",     label: "Results" },
  { key: "transfers",   label: "Transfers" },
  { key: "performance", label: "Performance" },
];

export default function NotificationsFeed({ isOpen, onClose }) {
  const { state, dispatch } = useGame();
  const [filter, setFilter] = useState("all");

  if (!state || !isOpen) return null;

  // Newest first
  const allFeed = [...(state.feed ?? [])].reverse();
  const feed    = filter === "all"
    ? allFeed
    : allFeed.filter(item => TYPE_CATEGORY[item.type] === filter);
  const unread  = allFeed.filter(f => !f.read).length;

  return (
    <>
      {/* Dim backdrop — click to close */}
      <div className="nf-backdrop" onClick={onClose} />

      {/* Panel */}
      <div className="nf-panel">
        {/* ── Header ── */}
        <div className="nf-header">
          <span className="nf-title">League Feed</span>
          {unread > 0 && (
            <button
              className="nf-mark-read"
              onClick={() => dispatch({ type: "MARK_FEED_READ" })}
            >
              Mark all read
            </button>
          )}
          <button className="nf-close" onClick={onClose}>✕</button>
        </div>

        {/* ── Filter tabs ── */}
        <div className="nf-filters">
          {FILTERS.map(f => (
            <button
              key={f.key}
              className={`nf-filter${filter === f.key ? " nf-filter--active" : ""}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* ── Content ── */}
        {feed.length === 0 ? (
          <div className="nf-empty">
            {filter === "all" ? "No events yet — play some matches." : `No ${filter} events yet.`}
          </div>
        ) : (
          <div className="nf-list">
            {feed.map(item => {
              const meta = FEED_META[item.type] ?? { icon: "·", color: "var(--text-dim)" };
              const isHigh = item.importance === "high";
              return (
                <div
                  key={item.id}
                  className={`nf-item${item.read ? "" : " nf-item--unread"}${isHigh ? " nf-item--high" : ""}`}
                >
                  <span className="nf-item-icon" style={{ color: meta.color }}>
                    {meta.icon}
                  </span>
                  <div className="nf-item-body">
                    {item.title ? (
                      <>
                        <span className="nf-item-title">{item.title}</span>
                        {item.body && <span className="nf-item-detail">{item.body}</span>}
                      </>
                    ) : (
                      <span className="nf-item-msg">{item.message}</span>
                    )}
                    <span className="nf-item-meta">
                      S{item.season} · {PHASE_LABEL[item.phase] ?? item.phase}
                    </span>
                  </div>
                  {!item.read && <span className="nf-item-dot" />}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
