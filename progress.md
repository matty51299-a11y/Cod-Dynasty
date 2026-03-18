# CDL Manager — Project Progress (UPDATED)

> Read this file at the start of every session before making any changes.
> This document reflects the CURRENT implemented state of the game, not planned features.

---

# 🔹 1. Current Game Overview

The game simulates a full CDL-style season with:


Stage 1 → Major 1
Stage 2 → Major 2
Stage 3 → Major 3
Stage 4 → Major 4
→ Pre-Champs
→ Champs
→ Offseason


Key principles:
- Match-driven gameplay loop
- Event-based presentation (Majors & Champs as overlays)
- Transitioning toward Football Manager–style navigation with a cleaner, modern UI

---

# 🔹 2. Core Systems (Implemented)

## Season Structure

- 4 stages and 4 Majors per season
- Pre-Champs roster window
- Championship tournament
- Offseason progression and reset

State fields:
- `stageIdx` → current stage
- `majorIdx` → current major
- `phase` → `"stage" | "major" | "preChamps" | "champs" | "offseason"`

---

## Standings System

Two parallel standings models:

- `standings`
  - cumulative across entire season
  - used for Champs seeding

- `stageStandings`
  - resets every stage
  - used for Major seeding

UI behavior:
- Stage/Major → defaults to **This Stage**
- Pre-Champs/Offseason → defaults to **Season Total**

---

## Match Simulation

- BO5 CDL format:

HP → S&D → CTL → HP → S&D

- Series ends at 3 map wins

Simulation includes:
- map-by-map results
- player stats (kills, deaths, K/D)
- standout player detection

---

## Player Stats System

Stored in:


playerSeasonStats: {
[playerId]: [
{ season, kills, deaths, matches }
]
}


Features:
- current season K/D
- career K/D (true cumulative, not averaged)
- season-by-season history

Displayed via player modal overlay.

---

## Progression System

- Age-based growth / plateau / decline
- Breakout and collapse events
- Development curves (early / standard / late)
- Headroom-based growth (potential − overall)

---

## Roster / AI System

- CPU teams use philosophy-based decision making
- Can:
  - sign players
  - release players
  - call up challengers
- Decisions influenced by:
  - standings
  - age
  - chemistry
  - upside

---

# 🔹 3. UI Architecture (CURRENT)

## Event Overlay System (CORE DESIGN)

The game now uses overlays instead of navigation for key moments.

### Major Entry

- `MajorEntryOverlay`
- full-screen takeover
- animated sequence:
  - badge → title → matchup → seedings → CTA
- non-dismissable
- only exits via `Enter Tournament`

---

### Major Tournament Mode

- `MajorTournamentOverlay`
- full-screen event mode (no tab navigation)
- includes:
  - cinematic hero header
  - round label + teams remaining
  - featured next match (primary focus)
  - bracket (QF / SF / GF)
  - sim controls
  - collapsible seeding info

---

### Champion Screen

- appears after final match
- shows:
  - champion team
  - final score
  - MVP
- `Return to Season →` exits event via `DISMISS_MAJOR`

---

## Match Flow (PARTIALLY IMPLEMENTED / IN PROGRESS)

Target loop:


Next Match → Sim → Result → Other Results → Repeat


Planned/partially implemented:
- persistent "Next Match" control
- match overlay
- result reveal flow

---

## Navigation (TRANSITIONING)

Current state:
- Major tab removed
- overlays replace event navigation
- top-tab system still partially in use

Next step:
- move to left sidebar navigation (FM-style)
- introduce top-right "Next Match" progression control

---

## Dashboard

Acts as league-mode hub.

Currently shows:
- team summary
- standings snapshot
- recent results
- phase-based controls

---

## Player UI

- clicking player opens modal
- displays:
  - attributes
  - K/D stats
  - history
  - bio info

---

# 🔹 4. Design Direction

The game is evolving toward:

- fast, addictive match-driven loop
- strong event moments (Majors / Champs)
- Football Manager–inspired structure
- cleaner, more modern UI (less clutter than FM)

Core philosophy:
- **focus → action → result → world update**

---

# 🔹 5. Known Limitations

- Match loop not fully implemented yet
- Navigation system still mid-transition
- No persistent sidebar yet
- No league narrative (news, storylines)
- No player contracts or salary system
- No retirement system
- Prospect pool does not refresh yearly
- No opponent roster viewer

---

# 🔹 6. Next Priorities

## HIGH PRIORITY

1. UI architecture overhaul
   - left sidebar navigation
   - remove top tabs fully
   - top-right Next Match system

2. Core match loop
   - match overlay
   - result reveal
   - other results after user match

---

## MID PRIORITY

3. K/D Leaders screen
4. Schedule / fixtures screen
5. History / records screen

---

## LOW PRIORITY

6. Narrative system (news, storylines)
7. Contracts / salary cap
8. Player retirement
9. Prospect regeneration

---

# 🔹 7. Key Principles (DO NOT BREAK)

- Major and Champs must remain **event overlays**, not pages
- Match simulation must remain **target-K/D based**
- `stageStandings` must reset every stage
- `standings` must remain cumulative
- Player history must persist across seasons
- UI should prioritize **clarity and flow over density**

---

# 🔹 8. Summary

The project has moved from:

> basic simulation with tabs

to:

> event-driven sports management game
> ## 🔹 Current UX Direction (IMPORTANT)

Core gameplay loop:
Next Match → Sim → Result → Other Results → Repeat

UI direction:
- Left sidebar navigation (Football Manager style)
- Top-right "Next Match" as the primary action
- Event overlays for Majors and Champs (not separate screens)
- Focus on clarity, speed, and visual hierarchy over dense information

Next phase:
- refine core loop
- finalize UI architecture
- increase immersion and presentation quality
