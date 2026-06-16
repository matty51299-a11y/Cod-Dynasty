import { EVENT_TIERS } from "./ghostsEventCalendar.js";
import { AW_TEAMS } from "./historicalRosters.js";

export { EVENT_TIERS };

const AW_POINTS = {
  online_2k: { 1: 25, 2: 15, 3: 10, 4: 10, 5: 5, 6: 5, 7: 5, 8: 5 },
  online_5k: { 1: 40, 2: 25, 3: 15, 4: 15, 5: 10, 6: 10, 7: 10, 8: 10 },
  lan: { 1: 100, 2: 75, 3: 60, 4: 45, 5: 30, 6: 30, 7: 15, 8: 15 },
  major: { 1: 125, 2: 90, 3: 70, 4: 50, 5: 35, 6: 35, 7: 20, 8: 20 },
  championship: { 1: 200, 2: 140, 3: 100, 4: 75, 5: 50, 6: 50, 7: 30, 8: 30 },
};

const allTeams = () => AW_TEAMS.length;
const awEvent = (id, name, type, tier, dateLabel, format, points) => ({
  id,
  name,
  type,
  tier,
  dateLabel,
  teamCount: allTeams(),
  format,
  gameTitle: "Call of Duty: Advanced Warfare",
  proPoints: points,
  entryRule: "all_active_teams",
});

export const ADVANCED_WARFARE_EVENTS = [
  awEvent("aw_online_2k_1", "AW Online 2K Series #1", "online_2k", "online_2k", "Nov 2014", "Single Elimination", AW_POINTS.online_2k),
  awEvent("aw_online_2k_2", "AW Online 2K Series #2", "online_2k", "online_2k", "Dec 2014", "Single Elimination", AW_POINTS.online_2k),
  awEvent("aw_mlg_columbus_2014", "MLG Columbus 2014", "lan_open", "lan", "Nov 2014", "Pool Play → Bracket", AW_POINTS.lan),
  awEvent("aw_umg_orlando_2015", "UMG Orlando 2015", "lan_open", "lan", "Jan 2015", "Pool Play → Bracket", AW_POINTS.lan),
  awEvent("aw_online_5k_1", "AW Online 5K Series #1", "online_5k", "online_5k", "Feb 2015", "Single Elimination", AW_POINTS.online_5k),
  awEvent("aw_champs_regional_qualifier", "Call of Duty Championship 2015 Regional Qualifier", "qualifier", "qualifier", "Mar 2015", "Open Qualifier Bracket", AW_POINTS.lan),
  awEvent("aw_cod_championship_2015", "Call of Duty Championship 2015", "championship", "championship", "Mar 2015", "Group Stage → Championship Bracket", AW_POINTS.championship),
  awEvent("aw_umg_california_2015", "UMG California 2015", "lan_open", "lan", "May 2015", "Pool Play → Bracket", AW_POINTS.lan),
  awEvent("aw_gfinity_spring_masters_2015", "Gfinity Spring Masters 2015", "invitational", "major", "May 2015", "Invitational Bracket", AW_POINTS.major),
  awEvent("aw_mlg_season_2_playoffs", "MLG Season 2 Playoffs", "playoffs", "major", "Jun 2015", "Playoffs Bracket", AW_POINTS.major),
  awEvent("aw_umg_dallas_2015", "UMG Dallas 2015", "lan_open", "lan", "Aug 2015", "Pool Play → Bracket", AW_POINTS.lan),
  awEvent("aw_gfinity_summer_championship", "Gfinity Summer Championship", "invitational", "major", "Sep 2015", "Invitational Bracket", AW_POINTS.major),
  awEvent("aw_mlg_world_finals_2015", "MLG World Finals 2015", "championship", "championship", "Oct 2015", "World Finals Bracket", AW_POINTS.championship),
];
