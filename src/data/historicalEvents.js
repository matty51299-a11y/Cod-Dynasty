// src/data/historicalEvents.js
// Historical events for era transitions in Cod Dynasty.

export const ERA_TRANSITION_EVENTS = {
  ghosts_to_advanced_warfare: {
    fromEraId: "ghosts",
    toEraId: "advanced_warfare",
    title: "New Title Released: Advanced Warfare",
    subtitle: "The jetpack era begins. Rosters across the scene are changing.",
    churnIntensity: "very_high",
    keyChanges: [
      "Movement shifts from boots to jetpack",
      "Uplink introduced as a competitive mode",
      "Hardpoint replaces Domination in the rotation",
      "Blitz removed from competitive play",
      "Major roster changes expected across all teams",
    ],
    newPlayersEntering: [
      "FormaL transitions from Halo",
      "Huke emerges as a top SMG prospect",
      "New talent floods the scene",
    ],
    inboxEvents: [
      { type: "era_transition", title: "New Title Released: Advanced Warfare", summary: "The jetpack era begins. Major roster changes expected across all teams.", severity: "high", category: "League News" },
      { type: "era_transition", title: "Jetpack Era Begins", summary: "Advanced Warfare introduces exo suits and a completely new movement system. Players with pace and mechanical skill will thrive.", severity: "medium", category: "League News" },
      { type: "era_transition", title: "Rostermania Begins", summary: "Teams across the scene are making major roster changes heading into Advanced Warfare.", severity: "high", category: "League News" },
      { type: "era_transition", title: "New Players Enter the Scene", summary: "Multiple new players are entering the pro circuit for Advanced Warfare.", severity: "medium", category: "League News" },
    ],
  },
};

export const CHURN_INTENSITY = {
  low: { aiTeamChanges: [0, 1], newEntrants: 2, description: "Minor roster tweaks" },
  medium: { aiTeamChanges: [1, 2], newEntrants: 4, description: "Moderate roster movement" },
  high: { aiTeamChanges: [2, 3], newEntrants: 6, description: "Significant roster changes" },
  very_high: { aiTeamChanges: [2, 4], newEntrants: 10, description: "Major rostermania - most teams overhaul" },
};

export function getTransitionEvents(fromEraId, toEraId) {
  const key = `${fromEraId}_to_${toEraId}`;
  return ERA_TRANSITION_EVENTS[key] || null;
}

export function getChurnConfig(intensity) {
  return CHURN_INTENSITY[intensity] || CHURN_INTENSITY.medium;
}
