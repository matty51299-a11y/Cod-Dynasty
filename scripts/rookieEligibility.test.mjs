import assert from "node:assert/strict";
import { createServer } from "vite";

const server = await createServer({
  logLevel: "error",
  server: { middlewareMode: true },
  appType: "custom",
});

try {
  const { calculateSeasonAwards, isRookieEligible } = await server.ssrLoadModule("/src/utils/seasonAwards.js");
  const originalInfo = console.info;
  const originalTable = console.table;
  console.info = () => {};
  console.table = () => {};

  const player = (id, teamId = "toronto", extra = {}) => ({
    id,
    name: extra.name || id,
    teamId,
    primary: extra.primary || "Flex",
    role: extra.primary || "Flex",
    age: extra.age ?? 20,
    overall: extra.overall ?? 78,
    potential: extra.potential ?? 88,
    isProspect: extra.isProspect ?? true,
  });

  const cdlMatch = (p, { teamId = p.teamId, maps = 3, kills = 30, deaths = 24, stage = "Stage 1" } = {}) => ({
    stage,
    mapResults: Array.from({ length: maps }, () => ({})),
    playerStats: {
      [p.id]: { name: p.name, teamId, role: p.primary, kills, deaths },
    },
  });

  const baseState = ({ season = 2, players = [], matchLog = [], history = [], awards = [] } = {}) => ({
    season,
    players,
    prospects: [],
    retiredPlayers: [],
    playerCareerHistory: history,
    teamCareerHistory: [],
    seasonHistory: [],
    awards,
    schedule: {
      season,
      standings: {
        toronto: { teamId: "toronto", points: 220, wins: 20 },
        boston: { teamId: "boston", points: 180, wins: 17 },
      },
      majors: [
        { name: "Major 1", bracket: null, completed: false },
        { name: "Major 2", bracket: null, completed: false },
        { name: "Major 3", bracket: null, completed: false },
        { name: "Major 4", bracket: null, completed: false },
        { name: "Champs", bracket: null, completed: false },
      ],
      matchLog,
      challengerQualifierResults: [],
    },
  });

  const meaningfulCurrent = (p, opts = {}) => [
    cdlMatch(p, opts), cdlMatch(p, opts), cdlMatch(p, opts), cdlMatch(p, opts),
  ];

  {
    const p = player("prior_cdl_stage");
    const state = baseState({
      players: [p],
      matchLog: meaningfulCurrent(p),
      history: [{ playerId: p.id, season: 1, maps: 12, events: [{ season: 1, eventType: "stage", teamId: "toronto", maps: 12 }] }],
    });
    assert.equal(isRookieEligible(p, 2, state), false, "prior CDL stage maps burn rookie eligibility");
  }

  {
    const p = player("prior_cdl_champs");
    const state = baseState({
      players: [p],
      matchLog: meaningfulCurrent(p),
      history: [{ playerId: p.id, season: 1, maps: 15, events: [{ season: 1, eventType: "champs", teamId: "toronto", maps: 15 }] }],
    });
    assert.equal(isRookieEligible(p, 2, state), false, "prior CDL-team Champs maps burn rookie eligibility");
  }

  {
    const p = player("prior_cq_ok");
    const state = baseState({
      players: [p],
      matchLog: meaningfulCurrent(p),
      history: [{ playerId: p.id, season: 1, maps: 30, events: [{ season: 1, eventType: "challengerQualifier", teamId: "omit_brooklyn", maps: 30 }] }],
    });
    assert.equal(isRookieEligible(p, 2, state), true, "prior Challenger qualifier maps do not burn rookie eligibility");
  }

  {
    const p = player("prior_challenger_major_ok");
    const state = baseState({
      players: [p],
      matchLog: meaningfulCurrent(p),
      history: [{ playerId: p.id, season: 1, maps: 30, events: [{ season: 1, eventType: "major", teamId: "omit_brooklyn", maps: 30 }] }],
    });
    assert.equal(isRookieEligible(p, 2, state), true, "prior Challenger-team Major maps do not burn rookie eligibility");
  }

  {
    const star = player("later_cdl_rookie", "toronto", { name: "Later CDL Rookie", potential: 92 });
    const support = player("support_rookie", "boston", { name: "Support Rookie", potential: 82 });
    const state = baseState({
      players: [star, support],
      matchLog: [
        ...meaningfulCurrent(star, { kills: 36, deaths: 24 }),
        ...meaningfulCurrent(support, { teamId: "boston", kills: 27, deaths: 25 }),
      ],
      history: [{ playerId: star.id, season: 1, maps: 24, events: [{ season: 1, eventType: "major", teamId: "omit_brooklyn", maps: 24 }] }],
    });
    const awards = calculateSeasonAwards(state);
    const rookie = awards.awards.find(a => a.key === "rookie_of_year");
    assert.equal(rookie?.playerId, star.id, "Challenger Major player can win ROTY in first CDL season");
  }

  {
    const p = player("repeat_rookie");
    const state = baseState({
      players: [p],
      matchLog: meaningfulCurrent(p),
      awards: [{ season: 1, key: "rookie_of_year", awardName: "Rookie of the Year", type: "player", playerId: p.id }],
    });
    assert.equal(isRookieEligible(p, 2, state), false, "repeat Rookie of the Year winners are blocked");
    const awards = calculateSeasonAwards(state);
    assert.equal(awards.awards.some(a => a.key === "rookie_of_year"), false, "repeat ROTY is not forced into awards");
  }

  {
    const p = player("too_few_maps");
    const state = baseState({ players: [p], matchLog: [cdlMatch(p, { maps: 3 }), cdlMatch(p, { maps: 3 }), cdlMatch(p, { maps: 3 })] });
    assert.equal(isRookieEligible(p, 2, state), false, "too few current CDL maps cannot win");
    const awards = calculateSeasonAwards(state);
    assert.equal(awards.awards.some(a => a.key === "rookie_of_year"), false, "too-few-map player is not given fake ROTY");
  }

  {
    const p = player("no_eligible", "toronto", { isProspect: false, age: 27 });
    const state = baseState({
      players: [p],
      matchLog: meaningfulCurrent(p),
      history: [{ playerId: p.id, season: 1, maps: 12, events: [{ season: 1, eventType: "stage", teamId: "toronto", maps: 12 }] }],
    });
    const awards = calculateSeasonAwards(state);
    assert.equal(awards.awards.some(a => a.key === "rookie_of_year"), false, "no eligible rookies means no fake rookie award");
  }

  {
    const p = player("legacy_safe");
    const legacyState = { ...baseState({ players: [p], matchLog: meaningfulCurrent(p) }) };
    delete legacyState.playerCareerHistory;
    delete legacyState.awards;
    assert.doesNotThrow(() => calculateSeasonAwards(legacyState), "legacy saves without award/history arrays load safely");
  }

  console.info = originalInfo;
  console.table = originalTable;
  console.log("Rookie eligibility tests passed (11 assertions).");
} finally {
  await server.close();
}
