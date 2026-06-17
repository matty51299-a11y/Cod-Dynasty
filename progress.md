# Cod Dynasty Progress

Cod Dynasty is a standalone historical Call of Duty dynasty game repo at `matty51299-a11y/Cod-Dynasty`.

## Current Status — Clean Historical Core Complete

The game has been rebuilt from the ground up as a clean historical COD dynasty. All CDL Manager / Challenger systems have been bypassed from the active game.

### What works now

- **Start screen**: Cod Dynasty branding with "Start Dynasty" button. No modern CDL mode. No Challenger mode.
- **Team selection**: 28 Ghosts-era teams from the spreadsheet. No modern CDL franchise teams. Scrollable team grid (fixed scroll bug).
- **Home screen**: Shows team name, game title (Call of Duty: Ghosts), season (2013/14), Pro Points, event record, roster summary, next/last event. Primary action button (Start Next Event / Continue Event / Play Match) in header and current event banner. Topbar also has persistent play button.
- **Roster screen**: 4 active players per team with OVR, role, age, potential, attributes, contract years. Release player support.
- **Free Agency**: Shows Ghosts-era free agents only. Currently empty (all players assigned to teams).
- **Amateur Pool**: Empty at Ghosts start. Shows "New players will emerge as later titles begin."
- **Event Calendar**: 19 Ghosts-era historical events including 12 original LANs/majors plus 7 online 2K/5K events. Event tier system (Online 2K, Qualifier, Regional, LAN, Invitational, Playoffs, Championship). Future events locked until earlier events completed. Completed events view-only.
- **Historical Event Hub**: Events can be opened from the calendar into a full control-room screen with Overview / Bracket or Fixtures / Matches / Results / Placements tabs, user-team tracking, match details, and controls to sim the next match, user match, current round, or full event.
- **Historical Event Simulation**: Generic Ghosts-era event engine creates bracket/match state, uses simple OVR + randomness best-of-5 match results, advances rounds, records results, and awards Pro Points based on placement.
- **Play Match flow**: Interactive map-by-map matchday experience. Play Match button appears in event hero, Your Match panel, and user tracker when a user match is pending. Opens a live match modal with two-step flow: Play Map → review results/K/Ds → Next Map → repeat until series ends → Finish Match updates the bracket. Separate from Sim User Match (instant quick-sim). Uses Ghosts modes (Domination, Search and Destroy, Blitz — no Hardpoint) with era map pools. Player K/Ds generated using OVR, role, team strength, and randomness. Best performer highlighted. Match report added to inbox.
- **Event Results**: Shows champion, user placement, full placement table with Pro Points awarded.
- **Pro Circuit Standings**: Rank, team, Pro Points, event wins, recent placement. Uses Pro Points, not CDL Points.
- **Save/load**: Clean localStorage save state with Cod Dynasty schema.

### Architecture

The active game uses a completely new clean architecture:

```
src/
  App.jsx                          — clean app shell (no CDL/Challenger imports)
  main.jsx                         — DynastyProvider context wrapper

  store/
    dynastyStore.jsx               — clean game store (React Context + useReducer)

  data/
    codEras.js                     — era definitions (Ghosts → AW → BO3 → ... → Modern)
    historicalRosters.js            — Ghosts + AW team/player data from spreadsheet
    historicalPlayers.js            — unified player universe builder
    historicalPlayerRegistry.js     — canonical player ID system
    historicalEvents.js             — era transition event data
    ghostsEventCalendar.js          — 19 Ghosts-era tournament events + EVENT_TIERS system

  engine/
    eventSim.js                     — legacy/simple full-event simulation
    historicalEventEngine.js          — interactive historical event hub/bracket simulation
    standingsEngine.js              — Pro Points standings
    historicalImport.js             — spreadsheet import metadata
    eraTransitionEngine.js          — era transition logic (existing)
    historicalDynasty.js            — historical dynasty state management (existing)

  components/
    StartScreen.jsx                 — title screen
    DynastyTeamSelect.jsx           — Ghosts-era team selection
    Home.jsx                        — home dashboard
    DynastyRoster.jsx               — roster management
    DynastyFreeAgency.jsx           — free agent signing
    AmateurPool.jsx                 — amateur prospect pool (empty at Ghosts start)
    EventCalendar.jsx               — historical event schedule + open-event entry point
    EventDetail.jsx                 — event hub / bracket / matches / results / placements
    EventResult.jsx                 — event result display
    DynastyStandings.jsx            — Pro Circuit standings
    DynastySidebar.jsx              — navigation sidebar
    PlayerCard.jsx                  — player profile card
    SeasonReview.jsx                — end-of-season summary before Rostermania
    RostermaniaHub.jsx              — offseason hub: Overview, My Roster, Free Agency, New Teams, Departed Teams, Roster Moves
```

### What was bypassed / removed from active game

The following CDL Manager systems are **not imported** by the active game. Old files remain in the repo as reference but are not part of the import chain from `main.jsx`:

- Modern CDL 2026 mode
- Challengers / Challenger teams / Challenger players / Challenger roster repair
- CDL Majors structure / CDL Champs structure
- Modern free agent / prospect pools
- Current CDL player database
- Old gameStore.jsx (1700+ lines of CDL-specific reducer logic)
- CDL Board / Staff / Morale / Scouting / Transfer systems
- All CDL-specific overlay components (MajorBracket, MajorTournament, ChallengerQualifier, etc.)

### Data sources

- **Ghosts teams/players**: 28 teams, 112 players from `data/import/cod_manager_rosters_database.xlsx` Ghosts sheet
- **AW teams/players**: 12 teams, 48 players parsed and stored, not active at Ghosts start
- **AW-only entrants**: 9 players (ZooMaa, Attach, Slasher, Enable, Huke, etc.) identified and blocked from Ghosts
- **Event calendar**: 19 historical Ghosts events (12 original + 7 online 2K/5K events) with Pro Points payouts and event tier system

### Diagnostics

- `scripts/diagnoseCodDynastyCleanCore.mjs` — 58 tests, all pass
- `scripts/diagnoseHistoricalSeasonFlow.mjs` — 45 tests, all pass (event flow, locking, 2K events, tier system, save/load)
- `scripts/diagnoseHistoricalPlayMatch.mjs` — 19 tests, all pass (live match flow, map-by-map advance, K/Ds, Ghosts modes, bracket integration)
- `scripts/diagnoseHistoricalEvents.mjs` — verifies event opening, user-match sim, next-match sim, round sim, full-event completion, placements, Pro Points, standings, save/load, and historical terminology
- `scripts/diagnoseHistoricalRosterImport.mjs` — 33 tests, all pass
- `scripts/diagnoseRostermaniaHub.mjs` — 35 tests, all pass (Rostermania flow, season review, roster management, free agency, team select, validation)
- `scripts/diagnoseEraTransition.mjs` — 36 tests, all pass (updated with Rostermania awareness)
- `scripts/diagnoseAdvancedWarfareTransition.mjs` — 25 tests, all pass (updated with Rostermania awareness)
- `scripts/diagnoseRosterIntegrity.mjs` — 15 tests, all pass (updated with Rostermania validation)
- `scripts/diagnoseDuplicatePlayers.mjs` — 14 tests, all pass (updated with Rostermania validation)

### Preserved

- Vite/React build setup
- package.json scripts
- data/import/cod_manager_rosters_database.xlsx
- Existing dark esports UI theme / CSS
- All old source files (kept as reference, not imported)
- Git history

## Offseason / Rostermania Hub — Complete

The Ghosts → Advanced Warfare transition now passes through a proper Rostermania Hub instead of happening instantly.

### Flow
1. Ghosts final event ends → Season Complete screen on Home
2. User clicks "View Season Review" → SeasonReview screen shows final standings, event winners, user stats, roster
3. User clicks "Enter Rostermania" → dispatches ENTER_ROSTERMANIA, archives Ghosts season, builds AW transition data
4. Rostermania Hub opens with 6 tabs: Overview, My Roster, Free Agency, New Teams, Departed Teams, Roster Moves
5. User can sign/release players, inspect AW teams and free agents
6. User clicks "Start Advanced Warfare Season" → validates all rosters (4/4, no duplicates), sets rostermaniaActive=false
7. Home shows AW 2014/15 with first event ready

### Features
- **Season Review**: Final standings, event winners, user rank/PP/wins/best finish, roster at season end
- **Rostermania Hub Overview**: Era transition info, team status, league summary, new entrants
- **My Roster tab**: Player cards with OVR, potential, role, era fit, release button, empty slot indicators
- **Free Agency tab**: Searchable list of era-valid free agents with OVR, role, potential, previous team, sign button
- **New Teams tab**: AW teams not in Ghosts, with roster and OVR
- **Departed Teams tab**: Ghosts teams not in AW, showing where each player went
- **Roster Moves tab**: Major headline moves + full transition log
- **Team Selection**: If user's Ghosts team doesn't exist in AW, team select screen lets user pick an AW team
- **Validation**: Start season blocked unless user roster is 4/4, all teams 4/4, no duplicate active players
- **Save/Load**: Rostermania state persists through page refresh (rostermaniaActive, rostermaniaData saved to localStorage)
- **Sidebar**: Shows "Rostermania" badge and offseason-specific navigation during Rostermania
- **Topbar**: Shows "Rostermania Hub" button instead of event play buttons during offseason

## Next Historical Work

1. **Full bracket simulation**: Improve event sim with exact historical pool play / double-elimination bracket shapes and qualification feeds.
2. **Offseason flow**: Contract expiry, roster moves between events within a season.
3. **Additional eras**: Parse BO3, IW, WWII, BO4, MW2019 spreadsheet sheets.
4. **Roster AI**: AI teams make roster moves between events/eras.
5. **AW → BO3 Rostermania**: Extend Rostermania Hub to work for all era transitions (not just Ghosts→AW).
