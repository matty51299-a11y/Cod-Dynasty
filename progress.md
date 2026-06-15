# Cod Dynasty Progress

Cod Dynasty is a standalone historical Call of Duty dynasty game repo at `matty51299-a11y/Cod-Dynasty`.

## Current Status — Clean Historical Core Complete

The game has been rebuilt from the ground up as a clean historical COD dynasty. All CDL Manager / Challenger systems have been bypassed from the active game.

### What works now

- **Start screen**: Cod Dynasty branding with "Start Dynasty" button. No modern CDL mode. No Challenger mode.
- **Team selection**: 28 Ghosts-era teams from the spreadsheet. No modern CDL franchise teams.
- **Home screen**: Shows team name, game title (Call of Duty: Ghosts), season (2013/14), Pro Points, event record, roster summary, next/last event.
- **Roster screen**: 4 active players per team with OVR, role, age, potential, attributes, contract years. Release player support.
- **Free Agency**: Shows Ghosts-era free agents only. Currently empty (all players assigned to teams).
- **Amateur Pool**: Empty at Ghosts start. Shows "New players will emerge as later titles begin."
- **Event Calendar**: 12 Ghosts-era historical events (UMG Philly, CoD Champs, MLG League, Anaheim, ESWC, etc.)
- **Historical Event Hub**: Events can be opened from the calendar into a full control-room screen with Overview / Bracket or Fixtures / Matches / Results / Placements tabs, user-team tracking, match details, and controls to sim the next match, user match, current round, or full event.
- **Historical Event Simulation**: Generic Ghosts-era event engine creates bracket/match state, uses simple OVR + randomness best-of-5 match results, advances rounds, records results, and awards Pro Points based on placement.
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
    ghostsEventCalendar.js          — 12 Ghosts-era tournament events

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
- **Event calendar**: 12 historical Ghosts events with Pro Points payouts

### Diagnostics

- `scripts/diagnoseCodDynastyCleanCore.mjs` — 58 tests, all pass
- `scripts/diagnoseHistoricalEvents.mjs` — verifies event opening, user-match sim, next-match sim, round sim, full-event completion, placements, Pro Points, standings, save/load, and historical terminology
- `scripts/diagnoseHistoricalRosterImport.mjs` — 33 tests, all pass

### Preserved

- Vite/React build setup
- package.json scripts
- data/import/cod_manager_rosters_database.xlsx
- Existing dark esports UI theme / CSS
- All old source files (kept as reference, not imported)
- Git history

## Next Historical Work

1. **Ghosts → Advanced Warfare transition**: Introduce AW-new players into Amateur Pool / Free Agency when era advances.
2. **Full bracket simulation**: Improve event sim with exact historical pool play / double-elimination bracket shapes and qualification feeds.
3. **Offseason flow**: Contract expiry, roster moves between events.
4. **Additional eras**: Parse BO3, IW, WWII, BO4, MW2019 spreadsheet sheets.
5. **Roster AI**: AI teams make roster moves between events/eras.
