import { EVENT_TIERS } from "./ghostsEventCalendar.js";

export { EVENT_TIERS };

const AW_POINTS = {
  online_2k: { 1: 2500, 2: 1500, 3: 1000, 4: 1000, 5: 500, 6: 500, 7: 250, 8: 250 },
  open: { 1: 10000, 2: 7500, 3: 5000, 4: 3750, 5: 2500, 6: 2500, 7: 1500, 8: 1500 },
  championship: { 1: 50000, 2: 30000, 3: 20000, 4: 15000, 5: 10000, 6: 10000, 7: 7500, 8: 7500 },
};

export const ADVANCED_WARFARE_EVENTS = [
  { id: "aw_online_2k_1", name: "AW Online 2K Series #1", type: "online_2k", tier: "online_2k", dateLabel: "Nov 2014", teamCount: 12, format: "Single Elimination", gameTitle: "Call of Duty: Advanced Warfare", proPoints: AW_POINTS.online_2k },
  { id: "aw_online_2k_2", name: "AW Online 2K Series #2", type: "online_2k", tier: "online_2k", dateLabel: "Dec 2014", teamCount: 12, format: "Single Elimination", gameTitle: "Call of Duty: Advanced Warfare", proPoints: AW_POINTS.online_2k },
  { id: "aw_season_opening_lan", name: "AW Season Opening LAN", type: "open", tier: "open", dateLabel: "Jan 2015", teamCount: 12, format: "Pool Play → Bracket", gameTitle: "Call of Duty: Advanced Warfare", proPoints: AW_POINTS.open },
  { id: "aw_pro_circuit_event_1", name: "AW Pro Circuit Event #1", type: "open", tier: "open", dateLabel: "Feb 2015", teamCount: 12, format: "Pool Play → Bracket", gameTitle: "Call of Duty: Advanced Warfare", proPoints: AW_POINTS.open },
  { id: "aw_pro_circuit_event_2", name: "AW Pro Circuit Event #2", type: "open", tier: "open", dateLabel: "Mar 2015", teamCount: 12, format: "Pool Play → Bracket", gameTitle: "Call of Duty: Advanced Warfare", proPoints: AW_POINTS.open },
  { id: "aw_championship_event", name: "AW Championship Event", type: "championship", tier: "championship", dateLabel: "Apr 2015", teamCount: 12, format: "Group Stage → Double Elimination", gameTitle: "Call of Duty: Advanced Warfare", proPoints: AW_POINTS.championship },
];
