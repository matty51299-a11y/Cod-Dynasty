// src/engine/eraTransitionEngine.js
// Handles era transitions (e.g., Ghosts → Advanced Warfare) in Cod Dynasty.
// Core design rule: historical rosters as pressure, not destiny.

import { getEra, getNextEra } from "../data/codEras.js";
import { AW_TEAM_ROWS, AW_PLAYERS, getAWTargetRoster, getNewAWEntrants, getGhostsPlayersNotInAW, makeAWPlayer } from "../data/historicalRosters.js";
import { getTransitionEvents, getChurnConfig } from "../data/historicalEvents.js";
import { canonicalPlayerId, resolvePlayerName, playerExistsInSave, findExistingPlayer } from "../data/historicalPlayerRegistry.js";

function slug(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function hashString(str) {
  let h = 2166136261;
  for (const ch of String(str || "")) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function clamp(v, min = 40, max = 99) { return Math.max(min, Math.min(max, Math.round(v))); }

// ── ERA FIT MODEL ──────────────────────────────────────────────────────────────

const ERA_FIT_TAGS = {
  advanced_warfare: {
    boosted: ["Jetpack Demon", "Pace Merchant", "High Ceiling", "Fast SMG"],
    penalized: ["Boots Specialist"],
    neutralTags: ["Fundamental AR", "S&D Mind", "Flex Friendly"],
  },
};

export function calculateEraFit(player, eraId) {
  const config = ERA_FIT_TAGS[eraId];
  if (!config) return { fit: "neutral", modifier: 0 };
  const traits = player.eraFitTraits || [];
  let modifier = 0;
  let fit = "neutral";
  for (const trait of traits) {
    if (config.boosted.includes(trait)) { modifier += 2; fit = "strong"; }
    if (config.penalized.includes(trait)) { modifier -= 2; fit = "weak"; }
  }
  // Pace and aggression attributes give a small bonus in jetpack eras
  if (eraId === "advanced_warfare" || eraId === "black_ops_3" || eraId === "infinite_warfare") {
    if ((player.adaptability || 70) >= 80) modifier += 1;
    if ((player.clutch || 70) >= 85) modifier += 1;
  }
  return { fit: modifier > 0 ? "strong" : modifier < 0 ? "weak" : "neutral", modifier: clamp(modifier, -5, 5) };
}

// ── HISTORICAL TARGET ROSTER ──────────────────────────────────────────────────

export function getHistoricalTargetRoster(eraId, teamId) {
  if (eraId === "advanced_warfare") {
    return getAWTargetRoster(teamId);
  }
  return [];
}

// ── INTRODUCE NEW ERA PLAYERS ─────────────────────────────────────────────────
// Players from AW rosters who don't exist yet in the save are created and
// placed into Free Agency or Amateur Pool.

export function introduceNewEraPlayers(state, newEraId) {
  if (newEraId !== "advanced_warfare") return state;

  const newEntrants = getNewAWEntrants();
  const newPlayers = [];
  const existingIds = new Set([...(state.players || []), ...(state.prospects || [])].map(p => p.id));
  const existingNames = new Set([...(state.players || []), ...(state.prospects || [])].map(p => p.name.toLowerCase()));

  for (const name of newEntrants) {
    if (existingNames.has(name.toLowerCase())) continue;

    // Find which AW team this player belongs to
    const awTeamRow = AW_TEAM_ROWS.find(r => r.players.some(p => p.toLowerCase() === name.toLowerCase()));
    const teamId = awTeamRow ? slug(awTeamRow.name) : "free_agent";
    const slot = awTeamRow ? awTeamRow.players.findIndex(p => p.toLowerCase() === name.toLowerCase()) : 0;

    const player = makeAWPlayer(name, teamId, slot);
    // Override: new entrants go to free agency, not assigned to a team
    player.teamId = null;
    player.id = `hist_${slug(name)}`;
    player.status = "freeAgent";
    player.contractYears = 0;
    player.eraId = "advanced_warfare";

    if (!existingIds.has(player.id)) {
      newPlayers.push(player);
      existingIds.add(player.id);
      existingNames.add(name.toLowerCase());
    }
  }

  return {
    ...state,
    players: [...(state.players || []), ...newPlayers],
  };
}

// ── HANDLE DISPLACED GHOSTS PLAYERS ───────────────────────────────────────────
// Players from Ghosts who are no longer on any AW target roster get moved
// to free agency (not deleted, not retired).

export function handleDisplacedPlayers(state, userTeamId) {
  const displacedNames = getGhostsPlayersNotInAW();
  const displacedSet = new Set(displacedNames.map(n => n.toLowerCase()));

  const players = (state.players || []).map(player => {
    // Never touch user team players
    if (player.teamId === userTeamId) return player;
    // Only displace players who are on AI teams and not in AW rosters
    if (!player.teamId) return player;
    if (!displacedSet.has(player.name.toLowerCase())) return player;

    return {
      ...player,
      teamId: null,
      previousTeamId: player.teamId,
      status: "freeAgent",
      contractYears: 0,
    };
  });

  return { ...state, players };
}

// ── AI ROSTERMANIA ────────────────────────────────────────────────────────────
// AI teams try to move toward their historical AW target rosters.
// User team is NEVER modified. If AI wants a user player, it creates
// transfer interest instead.

export function runAIRostermania(state, userTeamId, churnIntensity = "very_high") {
  const churnConfig = getChurnConfig(churnIntensity);
  const [minChanges, maxChanges] = churnConfig.aiTeamChanges;
  let players = [...(state.players || [])];
  const transferInterests = [];
  const rosterMoves = [];

  // Get all AI team IDs (teams that have players assigned)
  const aiTeamIds = new Set();
  for (const p of players) {
    if (p.teamId && p.teamId !== userTeamId) aiTeamIds.add(p.teamId);
  }

  // Also add teams from AW target rosters
  for (const row of AW_TEAM_ROWS) {
    const tid = slug(row.name);
    if (tid !== userTeamId) aiTeamIds.add(tid);
  }

  for (const teamId of aiTeamIds) {
    const targetNames = getHistoricalTargetRoster("advanced_warfare", teamId);
    if (!targetNames.length) continue;

    const currentRoster = players.filter(p => p.teamId === teamId);
    const targetNamesLower = new Set(targetNames.map(n => n.toLowerCase()));

    // Determine how many changes to make (random based on team hash)
    const teamHash = hashString(teamId);
    const numChanges = minChanges + (teamHash % (maxChanges - minChanges + 1));
    let changesMade = 0;

    // Step 1: Try to acquire target players
    for (const targetName of targetNames) {
      if (changesMade >= numChanges) break;

      // Check if target is already on this team
      if (currentRoster.some(p => p.name.toLowerCase() === targetName.toLowerCase())) continue;

      // Find the target player in the save
      const targetPlayer = players.find(p =>
        p.name.toLowerCase() === targetName.toLowerCase()
      );

      if (!targetPlayer) continue;

      // If target is on user team, create interest instead
      if (targetPlayer.teamId === userTeamId) {
        transferInterests.push({
          playerId: targetPlayer.id,
          playerName: targetPlayer.name,
          interestedTeamId: teamId,
          type: "transfer_interest",
        });
        continue;
      }

      // If target is a free agent, sign them
      if (!targetPlayer.teamId) {
        const idx = players.findIndex(p => p.id === targetPlayer.id);
        if (idx >= 0) {
          players[idx] = { ...players[idx], teamId, status: "cdl", contractYears: 2 };
          rosterMoves.push({ type: "AI_SIGNING", playerName: targetPlayer.name, toTeamId: teamId, note: `${targetName} signed by ${teamId}` });
          changesMade++;
        }
        continue;
      }

      // If target is on another AI team, execute transfer
      if (targetPlayer.teamId !== userTeamId) {
        const idx = players.findIndex(p => p.id === targetPlayer.id);
        if (idx >= 0) {
          const fromTeam = players[idx].teamId;
          players[idx] = { ...players[idx], teamId, previousTeamId: fromTeam, status: "cdl", contractYears: 2 };
          rosterMoves.push({ type: "AI_TRANSFER", playerName: targetPlayer.name, fromTeamId: fromTeam, toTeamId: teamId, note: `${targetName} transferred to ${teamId}` });
          changesMade++;
        }
      }
    }

    // Step 2: Release non-target players if roster is too big
    const updatedRoster = players.filter(p => p.teamId === teamId);
    if (updatedRoster.length > 4) {
      const surplus = updatedRoster
        .filter(p => !targetNamesLower.has(p.name.toLowerCase()))
        .sort((a, b) => (a.overall || 0) - (b.overall || 0));

      for (const p of surplus) {
        if (updatedRoster.filter(x => x.teamId === teamId).length <= 4) break;
        const idx = players.findIndex(x => x.id === p.id);
        if (idx >= 0) {
          players[idx] = { ...players[idx], teamId: null, previousTeamId: teamId, status: "freeAgent", contractYears: 0 };
          rosterMoves.push({ type: "AI_RELEASE", playerName: p.name, fromTeamId: teamId, note: `${p.name} released by ${teamId}` });
        }
      }
    }

    // Step 3: Fill empty slots from free agents if roster under 4
    const finalRoster = players.filter(p => p.teamId === teamId);
    if (finalRoster.length < 4) {
      const freeAgents = players
        .filter(p => !p.teamId && !p.isProspect && p.status !== "retired")
        .sort((a, b) => (b.overall || 0) - (a.overall || 0));

      for (const fa of freeAgents) {
        if (players.filter(p => p.teamId === teamId).length >= 4) break;
        const idx = players.findIndex(p => p.id === fa.id);
        if (idx >= 0) {
          players[idx] = { ...players[idx], teamId, status: "cdl", contractYears: 2 };
          rosterMoves.push({ type: "AI_SIGNING", playerName: fa.name, toTeamId: teamId, note: `${fa.name} signed by ${teamId}` });
        }
      }
    }
  }

  return {
    ...state,
    players,
    transferInterests: [...(state.transferInterests || []), ...transferInterests],
    rosterMovesLog: [...(state.rosterMovesLog || []), ...rosterMoves],
  };
}

// ── FULL ERA TRANSITION ───────────────────────────────────────────────────────
// Orchestrates the complete Ghosts → AW transition.

export function executeEraTransition(state, fromEraId, toEraId) {
  if (toEraId !== "advanced_warfare") return state;

  const userTeamId = state.userTeamId;
  let next = state;

  // 1. Introduce new AW players into the market
  next = introduceNewEraPlayers(next, toEraId);

  // 2. Handle displaced Ghosts players
  next = handleDisplacedPlayers(next, userTeamId);

  // 3. Run AI rostermania
  const transitionEvents = getTransitionEvents(fromEraId, toEraId);
  const churnIntensity = transitionEvents?.churnIntensity || "very_high";
  next = runAIRostermania(next, userTeamId, churnIntensity);

  // 4. Apply era fit modifiers (small nudges only)
  next = applyEraFitNudges(next, toEraId);

  return next;
}

// ── ERA FIT NUDGES ────────────────────────────────────────────────────────────
// Small form/rating adjustments based on era fit. Never large OVR changes.

function applyEraFitNudges(state, eraId) {
  const players = (state.players || []).map(player => {
    const { fit, modifier } = calculateEraFit(player, eraId);
    if (modifier === 0) return player;

    return {
      ...player,
      form: clamp((player.form || 70) + modifier, 50, 90),
      eraFit: fit,
      eraFitModifier: modifier,
    };
  });

  return { ...state, players };
}

// ── GENERATE TRANSITION INBOX EVENTS ──────────────────────────────────────────

export function generateTransitionInboxEvents(state, fromEraId, toEraId) {
  const transitionData = getTransitionEvents(fromEraId, toEraId);
  if (!transitionData) return [];

  const events = [];
  const season = state.season || 1;
  const timestamp = Date.now();

  // Title release event
  events.push({
    id: `era_${toEraId}_${timestamp}`,
    type: "era_transition",
    category: "League News",
    severity: "high",
    title: transitionData.title,
    summary: transitionData.subtitle,
    body: transitionData.keyChanges.join("\n"),
    season,
    read: false,
    actionRequired: false,
    createdAt: timestamp,
  });

  // Rostermania event
  events.push({
    id: `rostermania_${toEraId}_${timestamp}`,
    type: "era_transition",
    category: "League News",
    severity: "high",
    title: "Rostermania Begins",
    summary: "Teams across the scene are making major roster changes.",
    season,
    read: false,
    actionRequired: false,
    createdAt: timestamp + 1,
  });

  // New players event
  const newEntrants = getNewAWEntrants();
  if (newEntrants.length > 0) {
    events.push({
      id: `new_players_${toEraId}_${timestamp}`,
      type: "era_transition",
      category: "League News",
      severity: "medium",
      title: "New Players Enter the Scene",
      summary: `${newEntrants.length} new players are entering Free Agency for Advanced Warfare.`,
      body: `Notable new entrants: ${newEntrants.slice(0, 5).join(", ")}`,
      season,
      read: false,
      actionRequired: false,
      createdAt: timestamp + 2,
    });
  }

  // Transfer interest events for user players
  const interests = state.transferInterests || [];
  for (const interest of interests) {
    events.push({
      id: `interest_${interest.playerId}_${interest.interestedTeamId}_${timestamp}`,
      type: "transfer_interest",
      category: "Transfers",
      severity: "medium",
      title: `${interest.playerName} Attracting Interest`,
      summary: `${interest.interestedTeamId} have expressed interest in ${interest.playerName}.`,
      season,
      read: false,
      actionRequired: true,
      createdAt: timestamp + 3,
    });
  }

  return events;
}
