# CDL Manager — Project Progress (UPDATED)

> Read this file at the start of every session before making any changes.
> This document reflects the CURRENT implemented state of the game, not planned features.

---

# 🔹 1. Current Game Overview

The game simulates a full CDL-style season with:

```
Stage 1 → Major 1
Stage 2 → Major 2
Stage 3 → Major 3
Stage 4 → Major 4
→ Pre-Champs
→ Champs
→ Offseason → Contract Period → next season
```

Key principles:
- Match-driven gameplay loop
- Event-based presentation (Majors & Champs as overlays)
- Football Manager–style navigation with a clean, modern UI

---

# 🔹 2. Core Systems (Implemented)

## Season Structure

- 4 stages and 4 Majors per season
- Pre-Champs roster window
- Championship tournament
- Offseason: contract review → progression → AI roster window → new season

### Major Format (Double Elimination)
- 12 teams (all teams enter), seeded by stage standings
- Seeds 1–4: WB Round 1 bye → enter at WB Round 2
- Seeds 5–12: play WB Round 1 (4 matches)
- 11 rounds total: WB R1, LB R1, WB R2, LB R2, LB R3, WB SF, LB R4, WB Final, LB R5, LB Final, Grand Final
- LB rounds use generic names (LB Round 1–5, LB Final) — no "Quarterfinals"/"Semifinals" naming in LB
- Teams alive = teams with fewer than 2 losses
- Engine: `buildMajorBracketDE()` in `seasonEngine.js`; `_simOneMajorMatchDE()` wires each round

### Champs Format (Single Elimination — unchanged)
- Top-8 teams by cumulative season standings
- 3 rounds: Quarterfinals → Semifinals → Grand Final
- Engine: `buildMajorBracket()` in `seasonEngine.js` (unchanged)

State fields:
- `stageIdx` → current stage
- `majorIdx` → current major
- `phase` → `"stage" | "major" | "preChamps" | "offseason" | "contracts"`

---

## Standings System

Two parallel standings models:

- `standings` — cumulative across entire season; used for Champs seeding
- `stageStandings` — resets every stage; used for Major seeding

UI behavior:
- Stage/Major → defaults to **This Stage**
- Pre-Champs/Offseason → defaults to **Season Total**

---

## Match Simulation

- BO5 CDL format: HP → S&D → CTL → HP → S&D
- Series ends at 3 map wins
- Includes map-by-map results, player stats (kills, deaths, K/D), standout detection

---

## Player Stats System

```
playerSeasonStats: {
  [playerId]: [{ season, kills, deaths, matches }]
}
```

- Current season K/D
- Career K/D (true cumulative)
- Season-by-season history via player modal

---

## Career History System

```
playerOvrHistory: {
  [playerId]: [{ season, overall }]   // overall = OVR played at that season (pre-progression)
}
```

Recorded in `advanceOffseason()` from `progressionLog.oldOverall`. Cumulative, never reset.

```
player.teamHistory: [{ season, teamId }]
```

Per-player, travels with the player across transfers. Written:
- In `advanceOffseason()`: snapshot each signed player's `teamId` at season end (pre-expiry), so released players still get their last team recorded
- In `SIGN_PLAYER` reducer: appended when user signs a player mid-season (deduplicated by season)

Migration: existing saves without these fields default to `{}` / `[]` gracefully.

---

## Contract System

Each player has `contractYears` (integer, years remaining).

**Initial values:** 1–3 years, assigned deterministically via name hash in `players.js`.

**Offseason flow:**
1. Champs ends → `phase = "offseason"`
2. Dashboard shows **"Review Contracts →"** button
3. `ENTER_CONTRACT_PHASE` action → `phase = "contracts"` (migrates legacy saves without `contractYears`)
4. `ContractReviewPanel` in Dashboard shows:
   - **Expiring** players (`contractYears === 1`) — with +1/+2/+3 yr re-sign buttons
   - **Locked** players — shows years remaining after the upcoming decrement
5. User clicks **"Advance Offseason →"** → `ADVANCE_OFFSEASON` action
6. `advanceOffseason()` processes contracts:
   - AI teams: any player on 1-yr contract auto-renews to 2 yrs (prevents star exodus)
   - All signed players: `contractYears -= 1`
   - Players hitting 0: `teamId = null` → become free agents
7. Then: age, retire, progress, **prospect pool refresh**, AI offseason roster window, new season built

**Prospect Pool Refresh** (runs after progression each offseason):
- Shields strong players (75+ OVR, age < 32) from cleanup regardless of age
- Removes unsigned challengers: age 30+ & OVR < 68 (hard), age 28+ & OVR < 63 (hard), age 26+ & OVR < 68 (60% chance), age 24+ & OVR < 60 (50% chance)
- Generates ~20 new prospects per year: 2–4 elite (OVR 75–83, POT 87–95), 4–6 mid-tier, rest lower
- Top-up batch fires if pool drops below 150 (fills to 175)
- New prospects are mostly age 18–20 (occasional 21)
- Pool targets: min 150 · fill target 175 · hard cap 200

**Pool Health Panel** (`PoolHealth.jsx`, embedded in Challengers page):
- Collapsible debug panel: pool size, avg age/OVR, age 26+ count, OVR 75+ count
- Age and OVR bucket bar charts
- Last offseason change breakdown (retirement/cleanup/intake/top-up/cap-trim)
- Top 20 unsigned challengers table
- Season-by-season pool history from `challengersLog`
- `window.poolReport()` browser console utility (registered via `src/engine/poolReport.js` imported in `App.jsx`)

**Signing:** `SIGN_PLAYER` gives all newly signed players `contractYears: 2`.

**Re-sign action:** `RESIGN_PLAYER` accepts `{ playerId, years, salary }`. Validates budget (starters only, same hard-cap logic as `SIGN_PLAYER`) then sets `contractYears` and `salary`. `salary` is optional for backwards compatibility.

**Salary demands:** `getResignDemand(player, dealLength, playerSeasonStats, season)` in `rosterAI.js` calculates deterministic re-sign demand (dealLength 1/2/3). Baseline = `getSigningCost(player)` with modifiers:
- K/D: ±5–10% based on current season stats
- Age: +5% (≤22), −5% (27–28), −10% (29+)
- Potential: +3–8% for high-pot young players (age ≤25, pot ≥85/92)
- Ego: +5–10% for high-ego players
- Work ethic + leadership: −2% stability discount if combined avg ≥75
- Deal length: 1yr ×0.90, 2yr baseline, 3yr ×1.12 (or ×0.95 for declining players age ≥28 OVR <80)
- Rounded to nearest $5k

**AI auto-renew:** unchanged (renews all AI 1-yr contracts to 2), but now also sets `salary` via `getResignDemand(p, 1, ...)` for display consistency.

**Roster display:** Roster table shows a "Yrs" column (red if expiring). Player modal bio shows contract remaining with ⚠ warning when 1 yr left.

---

## Progression System

- Age-based growth / plateau / decline
- Breakout and collapse events
- Development curves (early / standard / late)
- Headroom-based growth (potential − overall)

---

## Retirement System

Age-curve based retirement probabilities:
- < 27: 0% | 27: 3% | 28: 8% | 29: 20% | 30: 35% | 31: 50% | 32: 65% | 33+: 80%

Modifiers: elite players (90+ OVR) retire much later; players far below potential retire sooner.
Retirees are removed from rosters; AI fills gaps in the offseason window.

---

## Budget / Economy System

- Each franchise has a `budgetTier` (2–6) defined in `teams.js`
- `BUDGET_CAPS` maps tier → max combined signing cost for 4 starters
- `getSigningCost()` uses a power curve (OVR-based): $25k (70 OVR) → $600k (99 OVR)
- Prospects cheaper: $15k–$65k
- Hard cap enforced on SIGN_PLAYER; AI respects budget in all windows

---

## Roster / AI System

- CPU teams use philosophy-based decision making (`win_now`, `youth_upside`, `chemistry_stability`, `balanced_value`, `high_risk_gamble`)
- Windows: after each Major, after Champs (offseason)
- AI decisions influenced by: standings, chemistry, age, upside, budget, K/D performance
- Drop protection: elite (87+ OVR) and top-2 starters rarely cut
- Champion teams protected by strong stability bias
- Minimum roster guarantee: AI teams always filled to 4 starters

---

## Free Agency / Challengers

- Pro FAs: players with `teamId === null` in `players` array
- Challengers: unsigned prospects in `prospects` array
- User signs from both via Free Agency and Prospects screens
- Budget shown on both screens

---

# 🔹 3. UI Architecture (CURRENT)

## Event Overlay System

### Major Entry
- `MajorEntryOverlay` — full-screen takeover, animated sequence, non-dismissable
- DE (Majors): shows all 12 seeds; seeds 1–4 display "WB Round 1 Bye" banner; seeds 5–12 show opening WB Round 1 matchup
- SE (Champs): shows top-8 seeds with QF matchups (unchanged)

### Major Tournament Mode
- `MajorTournamentOverlay` — full-screen event mode (no tab navigation)
- Bracket, seedings, sim controls, champion screen
- DE bracket: split into WB / LB / GF color-coded sections
- SE bracket: original 3-column single-elimination layout (Champs only)

### Match Center Overlay
- `MatchCenterOverlay` — map-by-map interactive match player; launched via `openMatchCenter("stage" | "major")`
- Flow: pregame → simming (600ms auto-sim) → map_result → intermission (tactic choice) → repeat → complete
- Tactical adjustments: Regain (clear tilt, one-use), Vibes (+teamwork), Slayout (+gunny, −awareness)
- On complete: dispatches `COMMIT_USER_MATCH_RESULT` which applies result to bracket and sims remaining same-round matches
- **z-index: 1002** — must stay above `mto-backdrop` (998); was previously incorrectly set to 120 (bug: overlay hidden behind tournament screen)

### Next Match Overlay
- `NextMatchOverlay` — triggered from top-right control
- Shows opponent, match context, play/sim options

### Team Hub Overlay
- `TeamHubOverlay` — team info, recent form, roster overview

---

## Navigation

- Left sidebar (FM-style) with screen routing
- Top bar: season badge, team badge, Next Match control
- Screens: Dashboard, Standings, Schedule, K/D Leaders, Roster, Free Agency, Challengers, Dev Report, Match Log

---

## Team OVR

- `calcTeamOvr(teamId, players)` in `src/engine/teamOvr.js`
- Rounded average of the 4 active starters' `overall` (bench/sub players excluded via `!p.isSub`)
- Displayed in: Dashboard banner, Team Hub Overlay, NextMatchOverlay, MajorMatchOverlay, Standings table (optional column)

---

## Dashboard

Phase-aware hub. Shows:
- Phase card (stage/major/preChamps/offseason/contracts)
- Contract review panel during `"contracts"` phase
- Standing snapshot, recent results, team stats
- Phase-specific CTAs (next match, enter major, review contracts, advance offseason)

---

## Player UI

- Clicking player opens modal overlay
- Header: name, team·region·role meta row, info strip (age/POT/salary/contract/dev/exp), OVR block with ▲/▼ last-offseason delta
- Performance section: season K/D bubble, career K/D bubble, last offseason Δ bubble with event label
- Season History table: per-season K/D from `playerSeasonStats`
- OVR History table: per-season OVR from `playerOvrHistory` (shows after first offseason)
- Career Teams list: per-season team from `player.teamHistory` (shows after first offseason)
- Attributes: 2-column grid with bar charts
- Hidden Traits: visible on user team only (WorkEthic, Tilt Resistance, Leadership, Ego, Meta Dependence)
- `player.region` displayed prominently in meta row (reflects player nationality, not org)

---

# 🔹 4. Design Direction

- Fast, addictive match-driven loop
- Strong event moments (Majors & Champs)
- Football Manager–inspired structure
- Clarity, speed, and visual hierarchy over dense information

Core philosophy: **focus → action → result → world update**

## Visual System (Current)

**Palette (navy/slate dark theme):**
```
--bg: #0f1724        (page background)
--bg2: #182235       (card surfaces)
--bg3: #1f2b42       (elevated / inner elements)
--border: #2a3a57    (card borders)
--text: #e8eefc      (body text)
--text-dim: #9db0d0  (labels, muted)
--text-head: #f0f4ff (headings)
--accent: #60a5fa    (blue accent)
--green: #34d399     (wins, growth, positive)
--red: #f87171       (losses, decline, negative)
--yellow: #fbbf24    (warnings, major events, amber)
--shadow: 0 2px 16px rgba(0,0,0,0.4)
```

**Card anatomy:** `background: --bg2`, `border: 1px solid --border`, colored 3px top border, `box-shadow: --shadow`, card header section + card body section.

**Dashboard layout (FM-style full-width two-column):**
- Full-width club banner (team-color gradient wash, phase chip, stat chips, progress bar, CTA)
- Two-column layout: main area (flex-1) + right panel (292px, sticky)
  - **Main:** card grid (`auto-fill minmax(200px, 1fr)`): Squad, Next Match, Standings Snapshot, Leader, Breakout, Collapse; then full-width Pre-Champs/Contracts panels; Recent Results card; Champion banners
  - **Right panel:** Full League Table (all 12 teams), Remaining Fixtures (stage only), Form Guide (last 5 W/L pips)

**Sidebar:** Dark navy (#182235) hardcoded — stays dark against light page background. Left-border active indicator, tinted active bg, box-shadow elevation.

**Topbar:** Dark navy (#182235) hardcoded — FM-style contrast header.

---

# 🔹 5. Known Limitations

- Match loop not fully implemented yet (NextMatchOverlay exists but flow not complete)
- Navigation system mid-transition (some legacy top-tab remnants)
- No league narrative (news, storylines)
- No opponent roster viewer
- Budget display in ContractReviewPanel uses `getSigningCost()` for locked players, not `player.salary`; slight drift possible after multi-season progression (acceptable, consistent with rest of system)
- OVR history and team history only populate after the first offseason (new games start with empty history)
- `progressionLog` is replaced each offseason (not cumulative) — profile only shows "Last Offseason Δ" from it; full OVR history is now in `playerOvrHistory` instead
- `isSub` field on players not yet fully wired for roster sub management — `calcTeamOvr` correctly excludes subs but the sub system itself is minimal

---

---

# 🔹 7. Key Principles (DO NOT BREAK)

- Major and Champs must remain **event overlays**, not pages
- Match simulation must remain **target-K/D based**
- `stageStandings` must reset every stage
- `standings` must remain cumulative
- Player history must persist across seasons
- Contract years must decrement **once per offseason** in `advanceOffseason()`
- AI teams auto-renew 1-yr contracts before decrement (do not change this — prevents star churn)
- `phase = "contracts"` must come **between** `"offseason"` and `ADVANCE_OFFSEASON` dispatch
- Budget caps are hard limits — never sign over cap in AI or user flows
- Roster minimum is 4 starters — AI fill runs after every window

---

# 🔹 8. State Shape Reference

```js
{
  userTeamId,
  season,           // current season number
  players,          // all pros + signed prospects; teamId null = free agent
  prospects,        // unsigned challengers only
  schedule: {
    season, phase, stageIdx, majorIdx,
    stages[], majors[], standings, stageStandings,
    matchLog[], currentMatchday
  },
  notifications[],
  enteredMajorIdx,
  playerSeasonStats: { [playerId]: [{ season, kills, deaths, matches }] },
  playerOvrHistory:  { [playerId]: [{ season, overall }] },
  progressionLog[],
  retiredPlayers[],
  rosterMovesLog[],
  challengersLog[],
  teamContexts: { [teamId]: { philosophy, loyalty, volatility, challengerTrust, pressure } },
}
```

Player shape (key fields):
```js
{
  id, name, teamId, age, primary, secondary,
  region,          // player nationality (NOT org/team location)
  overall, potential, salary,
  contractYears,   // years remaining; 0 = expired → FA
  form, experience, isProspect,
  developmentCurve, // "early" | "standard" | "late"
  gunny, awareness, objective, searchIQ, clutch, teamwork, composure, adaptability,
  ego, workEthic, tiltResistance, leadership, metaDependence,
  teamHistory: [{ season, teamId }],   // which team per season; travels with player
}
```

## Update 2026-05-28
- Regular Majors now run as a 16-team DE event: 12 CDL seeds from `stageStandings` + 4 temporary Challenger qualifier seeds (13–16).
- Added Challenger qualifier simulation from unsigned prospects and temporary event-team support via `schedule.currentMajorEventTeams`.
- Added DE16 bracket build + simulation path for Majors while leaving Champs flow untouched.
- Major Tournament overlay layout widened and compressed vertically for better bracket visibility; bracket columns now support horizontal overflow instead of cramped/cut-off cards.
- Challenger qualifier teams now draw from a fixed named identity pool (name/tag/color) instead of generic temporary labels.
- Match Center now resolves temporary Major event teams via `schedule.currentMajorEventTeams` for names/tags/colors + roster loading + OVR display, and uses Overload/OVR labels instead of Control/CTL.
- Added static `challengerRatingOverrides` data + normalized-name matching and prospect-time override application for manually reviewed Challenger OVR/POT values.
- Manual Challenger override import now also creates missing rated players as unsigned prospects (deterministic defaults), applies overrides to existing players/prospects, and dedupes normalized-name collisions.
- Challengers screen refreshed as a market-style "Challengers Circuit" view with hero chips, tabs, cleaner filters, readable archetype labels, shortlist stars, and collapsed debug Pool Health.
- Added shared team-display + TeamLogo fallback component and wired logo-safe rendering into core surfaces (dashboard banner, standings, schedule, next match overlay, match center pre/final, match log), including temporary event-team metadata support.

- Champs now uses a 16-team DE bracket: top 12 CDL teams by cumulative `standings` plus 4 temporary Challenger qualifiers (seeds 13–16), sharing the existing DE16 bracket builder/simulation path used by regular Majors.
- MajorTournamentOverlay bracket match cards now render teams through shared `resolveTeamDisplay` + `TeamLogo` with compact logo badges and seed/tag alignment to avoid raw team-id/tag-only rendering in Major/Champs cards.

- Regular Majors now award CDL placement points to CDL teams only (Major placements 1–12 mapped to 100/75/60/45/30/30/15/15/0/0/0/0) and add them to cumulative `standings` after bracket completion; Challenger event teams receive no CDL standings points.
- Challenger circuit identity pool now has **16 persistent teams** (up from 14), including newly added **High Treason** and **For Fun Black**.
- `ensureChallengerTeams()` now performs safe save backfill/merge: if a save is missing teams (e.g., legacy 14-team saves), only missing teams are added and only missing roster slots are filled to 4 per team (regional-first, no duplicate assignment), while preserving existing circuit points/form/history.
- Qualifier storage now includes per-team `score` in `schedule.challengerQualifierResults` in addition to season/major/team/placement/qualified/teamOvr/circuitPoints/form fields.
- Challengers screen now includes a dedicated **Challenger Qualifier** section:
  - Latest qualifier table (full ranked field, qualified/missed states, score/points/form delta)
  - Empty state when no qualifier has run
  - Compact qualifier history cards with season/major, winner, and top-4 qualified teams
- Major Entry overlay now explicitly shows **Challenger Qualifiers (Seeds 13–16)** with qualifier ordering, team identity, region, and OVR so qualifier entrants are clearly visible before the event starts.

## Update 2026-05-28 (Champs blank-screen safety net)
- Added `ErrorBoundary` (`src/components/ErrorBoundary.jsx`) wrapping the entire app. Any uncaught render error now shows a diagnostic panel (phase, season, stage/major idx, userTeamId, entered major, event team ids, last dispatched action, current major / champs / qualifier summary, error message + stack + component stack) instead of blanking the screen. The save is preserved.
- Reducer is now wrapped in `instrumentedReducer` that records `window.__lastAction = { type, payloadKeys, phaseBefore, phaseAfter, timestamp }` and runs `findPhaseInvariantViolations` after every action. Violations are logged to the console with full detail and exposed on `window.__phaseProblems` for the error panel.
- `findPhaseInvariantViolations` (`src/store/gameValidation.js`) checks: userTeamId valid, phase in known set, stage phase has a stage, challengerQualifier phase has a populated qualifier, major phase has a bracket with seeds that all resolve to either a CDL team or a `currentMajorEventTeams` entry — and that every team-id referenced by any bracket match resolves.
- `_advanceMajorPhase()` now clears `currentMajorEventTeams` AND `currentChallengerQualifier` after every major (regular AND Champs), so stale event metadata can never leak into the next phase's rendering. Previously the Champs branch left both populated.
- `beginChamps()` now builds the Champs bracket BEFORE flipping `phase`/`majorIdx`, pads to 12 CDL seeds when standings is sparse, pads the bracket to 16 entrants if the qualifier produced fewer (defensive — better than indexing into undefined inside `buildMajorBracketDE16`), and explicitly resets `majors[4].completed = false` so a partially-played Champs from an interrupted run can't be treated as already-finished.
- `MajorTournamentOverlay` now returns a recoverable in-overlay error panel ("Return to Season" button) when `phase === "major"` and `enteredMajorIdx === majorIdx` but the bracket is missing/empty, and a similar fallback for ChampionScreen if `enteredMajor.bracket` is missing. Previously both threw on `bracket.rounds`.
- `MajorEntryOverlay` returns null if `bracket.seeds` is missing/empty (previously rendered into `bracket.seeds.map`).

## Update 2026-05-29 (Cannot read properties of undefined (reading 'id'))
- Root cause: after offseason transitions, `fillMinimumRoster` only signed candidates the AI could afford. When the FA / unsigned-challenger pool was too pricey for a low-budget team, the team entered Season N+1 with only 2–3 starters. `simMap` indexes `teamA4[i]` for `i=0..3` unconditionally, so the very next stage match threw on the missing 4th-slot player. The stack was `simMap → simMatch → simMatchday` and surfaced through `useReducer`, blanking the screen.
- Engine fix: `padTeamToFour` in `matchSim.js` pads any team object's `.players` array to four entries with low-rated placeholders. Applied at the top of both `simMap` and `simMatch`, so every code path (AI burst sim and the interactive Match Center) sees a consistent 4-starter slate. Thin teams now play badly instead of crashing.
- Engine fix: `fillMinimumRoster` now has a last-resort over-cap fill — if no affordable candidate is available, it signs the cheapest remaining candidate regardless of budget (logged as `reason: "roster_fill_over_cap"`). AI teams can no longer enter a stage thin.
- Validation: `findPhaseInvariantViolations` now also reports any CDL team with fewer than 4 starters, so the ErrorBoundary panel and `window.__phaseProblems` will surface the condition next time it appears (the user is still allowed to play with a thin roster — only the AI is force-filled).
- Verified by `scripts/reproThinRoster.mjs` (Season 1 → offseason → Season 2 Stage 1 matchday, previously crashed, now passes) and `scripts/stressSeason.mjs` (120 randomized runs across every CDL team — 0 crashes).


## Update 2026-05-29 (Season 3 CDL roster integrity hardening)
- Added `ensureCdlRosterIntegrity()` as the single CDL active-roster repair pass. It validates the player-array roster source used by UI/match sim, removes invalid/inactive/duplicate active CDL references, normalizes signed CDL fields, fills teams back to 4, removes promoted players from Challenger rosters, and logs repairs.
- Emergency CDL roster fill is now absolute: affordable signings are preferred, then the cheapest eligible player can be signed with an emergency budget exception, and a generated minimum-salary emergency replacement is created if the market is exhausted.
- Roster-affecting transitions now re-run integrity at new game, load migration, contract phase entry, offseason completion, post-major transition, pre-Champs generation, and immediately before stage/major match simulation.
- AI roster-window cuts are transaction-like: release transaction logs are deferred until a replacement signing succeeds, and failed replacement attempts roll back the release candidate instead of leaving the roster thin.
- User active-starter releases are blocked when they would drop a CDL team below 4 active players.
- Added `scripts/stressRosterIntegrity.mjs`, which validates 24 multi-season simulations through Season 4 plus an exhausted-market emergency replacement regression.

## Update 2026-05-29 (Contract review re-sign budget validation)
- Contract review budget math now uses shared helpers in `src/utils/contractBudget.js` so the UI summary, deal after-space display, and `RESIGN_PLAYER` affordability validation use the same source of truth.
- Expiring starters whose deals have not been accepted are excluded from committed salary during contract review; selecting a new deal replaces that player's old expiring salary instead of stacking on top of it.
- Accepted re-signings immediately become locked (`contractYears > 1`) and count toward the remaining available space for later expiring-player decisions.
- Added `scripts/testContractBudget.mjs` to cover the LA Thieves-style case where $504k locked + $346k available makes an $85k Nium re-sign affordable before other accepted deals are counted.

## Update 2026-05-29 (User roster release grace period)
- User-managed CDL teams can now release an active starter even when the move drops them below 4 starters. The existing release destinations and transaction logging remain unchanged, and the release notification includes roster-incomplete context when applicable.
- Progression and match-entry actions now gate on the user roster having 4 valid active starters. Stage play/sim, Major/Champs sim, Challenger Qualifier sim/continue, interactive match commit, Champs start, and offseason advancement show a clear "Roster incomplete" notification instead of silently simming or emergency-filling the user team.
- Roster UI now marks the user roster incomplete with a 3/4-style warning so the user can intentionally create cap space and then manually sign a replacement.
- AI roster integrity remains automatic: `ensureCdlRosterIntegrity()` skips emergency filling only for the user-managed team, while AI CDL teams below 4 are still repaired with pool, over-cap, or generated emergency replacements.

## Update 2026-05-29 (Player and Team profile history surfaces)
- Added a global player profile overlay opened from shared `PlayerProfileProvider`. It resolves CDL, Challenger, unsigned, inactive/retired, and match-log-only player references safely, then derives career totals, current status, season tabs, and per-event rows from existing `playerSeasonStats`, current `matchLog`, team history, and challenger transaction data. Mode-specific K/D and placements remain explicitly marked as not tracked when the existing save data does not contain them.
- Roster, Free Agency, K/D Leaders, Match Log standouts, SeriesDetail stat tables, Match Center stat rows, Challengers pool rows, Challenger team cards, qualifier field chips, and recent Challenger/CDL move entries now expose clickable player/team profile links where the underlying ids are available.
- TeamHub now works as a broader Team Profile for CDL teams and persistent Challenger teams. It resolves Challenger teams from the save, shows current roster/OVR/record/points context, clickable roster players, season tabs, match-log-derived records/stat summaries, Major placement rows when available, and Challenger qualifier history/circuit-point rows where stored.
- Added `scripts/testProfileHistory.mjs` to verify profile lookup and history aggregation from existing match logs without changing simulation, ratings, contracts, budgets, bracket logic, points, or logos.

## Update 2026-05-29 (Placement band display formatter)
- Added a shared placement display helper that renders event placement bands as `1st`, `2nd`, `3rd`, `4th`, `5th-6th`, `7th-8th`, `9th-12th`, and `13th-16th` instead of raw tie labels like `T5`.
- Player profile Major/CQ summaries, player event rows, Team Profile season/event history, Challenger Qualifier final placements, Prospects qualifier history tables, and qualifier labels now use the same placement formatter.
- Best Major and Best CQ summary ranking now parses formatted band labels safely, preserving existing-save compatibility while avoiding `T5` for 5th-6th finishes.
- Added `scripts/testPlacementDisplay.mjs` to verify the required placement band wording and legacy shorthand normalization.

## Update 2026-05-29 (Open offseason free agency market)
- Split the end-of-season contract flow so contract review now opens a user free-agency window before AI teams bid. Expiring players who are not re-signed are standardized as `status: "freeAgent"`, `teamId: null`, `challengerTeamId: null`, `contractYears: 0`, and retain `previousTeamId` for transaction context.
- Added AI free-agency waves for elite players, veterans, and depth options. AI offers score player OVR/POT, age, role need, recent K/D, budget room, team strength/standing, team philosophy, and stock labels; winning bids sign players to 1–3 year deals while respecting normal cap rules outside emergency roster repair.
- Challenger/inactive/retirement outcomes now happen after market evaluation. Low-value unsigned free agents may move to Challengers or retire, while stronger remaining players can stay unsigned as free agents. Challenger team refill excludes open `freeAgent` players to avoid duplicate assignments.
- Offseason Hub now labels the user free-agency window, exposes a Free Agents section with salary/stock context and sign buttons, and only runs AI free agency when the user advances from that window. The Free Agency page also explains that AI bidding is paused during the user window.
- Added readable free-agency transaction types (`FREE_AGENT_ENTERED`, `FREE_AGENT_SIGNING`, `FREE_AGENT_TO_CHALLENGERS`, `FREE_AGENT_RETIRED`) and a diagnostic script (`scripts/diagnoseOffseasonFreeAgency.mjs`) that prints market entrants, top free agents, AI needs, offers, signings, leftovers, market exits, and roster sizes.
- Updated the roster-integrity stress script for the two-step offseason flow (`contracts -> free agency window -> AI free agency/new season`).

## Update 2026-06-01 (General Manager → Assistant GM rename)
- Renamed the `"gm"` staff role key to `"assistant_gm"` and its display label from `"General Manager"` to `"Assistant GM"` across all files. Internal key change only — same slot, same attributes, same bonus effects.
- `src/data/staff.js`: `STAFF_ROLES.assistant_gm = "Assistant GM"`, all 19 seed entries updated to `role: "assistant_gm"`.
- `src/engine/staffEngine.js`: `migrateStaff()` now converts any loaded `role === "gm"` → `"assistant_gm"` so old saves migrate on load without crashing. `calcStaffBonuses`, `ensureTeamStaff`, `getKeyAttributes` all updated to reference `"assistant_gm"`.
- `src/components/StaffPanel.jsx`: `ROLE_ORDER` and `ROLE_COLORS` keys updated.
- `src/components/TeamHubOverlay.jsx`: staff lookup updated to `"assistant_gm"`.
- There is no hireable "General Manager" role anymore; the user is the GM. The renamed slot is the deputy role.

## Update 2026-06-01 (Owner Expectations / Job Security system)
- Added a board-level stakes system for the user-controlled CDL team. Reads existing data only — does not change match sim, roster AI, contracts, budgets, awards, brackets, or ratings.

### Data model (`boardState`)
Stored on the top-level game state for the user team only:
```js
boardState: {
  confidence: 60,      // 0–100; starts at 60 on new game / first migration
  objectives: [],      // generated each season (see below)
  verdict: null,       // "Retained" | "Final Warning" | "Released" | null
  history: [],         // per-season archived review records
}
pendingBoardReview: null  // set after awards overlay; drives BoardReviewOverlay
```
Old saves without `boardState` hydrate to defaults via `migrateBoardState()`. Objectives are generated on first load if the array is empty.

### Security band (derived, not stored)
- 80–100: Secure · 60–79: Stable · 40–59: Shaky · 20–39: At Risk · 0–19: Critical

### Objective generation (`generateObjectives`)
1 primary + 1–2 secondary objectives generated at each season start, tailored by team OVR:
| Tier | OVR | Primary | Secondary |
|------|-----|---------|-----------|
| Elite | 84+ | Reach Champs Grand Final (top 2) | Finish Top 3, Reach Major Top 4 |
| Strong | 80–83 | Finish Top 4 | Reach Champs Top 6, Major Top 6 |
| Mid | 75–79 | Finish Top 6 | Develop a Rookie, Major Top 8 |
| Weak | <75 | Finish Top 8 | Develop a Rookie, Stay Under Cap |

Objective types: `reachChamps`, `finishTopN`, `majorResult`, `developRookie`, `salaryTarget`. Evaluation reads `schedule.standings`, Major bracket placements via `getMajorPlacementMap`, match log map counts for rookie progress, and `getTeamCap` for salary checks.

### Confidence updates
- After each regular Major (idx 0–3): ±5/3/0/−3/−5 by placement band. Hooked into all major-sim actions via `withMajorBoardNudge` helper.
- Season-end board review: primary met +20 / failed −20; each secondary met +8 / failed −8. Clamped 0–100.

### Season-end board review
Triggered by `CONTINUE_FROM_SEASON_AWARDS`. Runs `runBoardReview` → evaluates all objectives with `isFinal=true`, computes delta, derives verdict:
- **Retained**: confidence > 40 OR primary met
- **Final Warning**: confidence 20–40 AND primary failed
- **Released**: confidence < 20 AND primary failed

Result stored in `pendingBoardReview`; `BoardReviewOverlay` shows on top of the offseason hub.

### Released verdict options
1. **Accept New Mandate** → resets confidence to 60, clears overlay, game continues (`BOARD_ACCEPT_NEW_MANDATE`)
2. **Start New Game** → `deleteSave()` + `RESET_TO_TEAM_SELECT`; no save corruption

### Hook points in reducer
- `createInitialGameState`: boardState initialised; objectives generated after integrity check
- `LOAD_GAME`: `migrateBoardState` + objective backfill if empty
- `SIM_MAJOR` / `SIM_NEXT_MAJOR_MATCH` / `SIM_MAJOR_ROUND` / `COMMIT_USER_MATCH_RESULT`: `withMajorBoardNudge` applied when a regular Major completes
- `CONTINUE_FROM_SEASON_AWARDS`: `runBoardReview` → `pendingBoardReview` set; `boardState` updated
- `ADVANCE_OFFSEASON`: new objectives generated for incoming season; `board_mandate` feed entry posted; `pendingBoardReview` cleared

### UI surfaces
- **Dashboard Board widget** (`fm-board-widget`): security band dot + label, confidence bar + number, primary objective + status badge. Appears in the main widget grid during stage/major/preChamps phases.
- **Offseason Hub Owner Review card** (`oh-board-card`): all objectives with status badges and progress notes, confidence before/after, verdict badge, last 2 history entries. First card in the right aside of the Offseason Hub.
- **BoardReviewOverlay** (`src/components/BoardReviewOverlay.jsx`): modal shown after the awards popup. Verdict badge, confidence change visualisation, per-objective results, owner flavour text, action buttons.

### New files
- `src/engine/boardEngine.js` — pure functions: `migrateBoardState`, `getSecurityBand`, `bandColor`, `generateObjectives`, `evalObjective`, `evalAllObjectives`, `nudgeConfidenceAfterMajor`, `runBoardReview`
- `src/components/BoardReviewOverlay.jsx` — season-end board review modal

## Update 2026-06-01 (Board Objectives realism + visibility overhaul)
- Reworked the Owner Expectations system so objectives are driven **primarily by the team's OVR rank relative to the league**, not by absolute OVR thresholds. Added owner personalities, stretch objectives, hard caps, a dedicated Board page, and expectation-relative confidence. Still reads existing data only — no change to match sim, roster AI, staff, free agency, ratings, brackets, points, or saves.

### Owner data (`src/data/teams.js`)
- Each CDL team now has `owner: { name, ambition, patience }` (0–100). Read-only flavour + light modifiers; never overrides the OVR-rank hard caps.

### OVR-rank tiers (`boardEngine.js`)
- `getLeagueOvrRanks(state)` ranks all 12 teams by `calcTeamOvr` (avg starter OVR). `getTierForRank(rank)` → Elite (1–3), Strong (4–5), Mid (6–8), Weak (9–10), Rebuild (11–12). **Team OVR rank is the dominant factor.**
- `buildBoardObjectives(state)` → `{ objectives, meta }`. Each team gets **1 primary + 2 secondary + 1 stretch**. `meta` carries season, ovr, ovrRank, tier, owner ambition/patience, chem/ovr baselines, and an explanation string for the UI.

### Owner modifiers
- Ambition ≥75 pushes one notch harder (e.g. elite primary becomes "Win a Major"; strong stretch becomes "Win a Major"; weak stretch becomes a Champs-race push). Ambition only ever moves objectives **within** the hard caps.
- Patience scales confidence swings (`applyPatienceToDelta`): low patience amplifies penalties ×1.3, high patience softens ×0.75, and shifts the Released/Final-Warning verdict floors.

### Hard caps (`applyHardCaps`, enforced after generation)
- Champs Grand Final / Win Champs (champsResult ≤2): **rank 1–3 only**.
- Win a Major (majorResult target 1): **rank 1–5 only**.
- Win Champs as a *primary*: rank 1–3 only.
- Finish top 6 (or better) as a *primary*: **never for rank 9+**.
- Rebuild (rank 11–12): no Champs objectives, no top-6, no trophies — downgraded automatically.
- Verified by `scripts/diagnoseBoardObjectives.mjs` hard-cap assertions across all 12 teams.

### Objective types (evaluated from existing data)
`finishTopN`, `avoidBottomN` (avoid last / bottom 2), `qualifyChamps` (top 8), `champsResult` (Champs placement), `majorResult` (best regular Major), `winStageMatches` (cumulative standings wins), `developRookie` (rookie maps from matchLog), `improveChemistry` (vs stored baseline), `salaryTarget`. Legacy v1 `reachChamps` maps onto `champsResult`. Statuses: Not started · On track · Ahead of expectations · At risk · Failed · Completed.

### Expectation-relative confidence
- `nudgeConfidenceAfterMajor` compares the user's Major placement to their **expected placement (= OVR rank)** — overachieving raises confidence, underachieving lowers it, scaled by patience. (Rank-12 roster finishing mid-pack is positive; rank-1 roster bombing is a major concern.)
- `runBoardReview` (season end): primary ±18, secondary ±8, stretch +6 (upside-only), plus an expectation-relative final-standings adjustment, patience-scaled. Produces verdict + overachievement/underperformance lists. **Uses the same objectives shown all season** — no surprise end-of-season objectives.

### Visibility
- **New "Board" sidebar tab** → `src/components/BoardObjectives.jsx`. Header (owner name, ambition, patience, confidence band, season, OVR rank, expected tier, league position, OVR + delta), full mandate list (priority / importance / target / live progress / status), "Why these objectives?" explanation panel, and a season-progress panel (position, stage record, points, best Major, Champs status, chemistry trend, OVR change).
- **Dashboard Owner widget** now live-evaluates objectives and has a "View Board Objectives ›" button + "Board ›" panel link.
- **BoardReviewOverlay** now shows the stretch group and the overachievement/underperformance summary.

### Save compatibility
- `boardState.version` (`BOARD_OBJ_VERSION = 2`). `objectivesNeedRegen()` triggers a **safe one-time regeneration** on load when objectives are missing or predate v2 — this replaces old unrealistic objectives. Confidence/history are preserved. Objectives are generated only at new game / season start / load-migration, never on render.

### Reducer hook points (`gameStore.jsx`)
- `regenBoardObjectives(state, boardState)` sets objectives + meta + version. Called from `createInitialGameState`, `LOAD_GAME` (when `objectivesNeedRegen`), and `ADVANCE_OFFSEASON`.

### New files
- `src/components/BoardObjectives.jsx` — Board Objectives page
- `scripts/diagnoseBoardObjectives.mjs` — prints each team's OVR/rank/owner/objectives + hard-cap assertions
- `scripts/testBoardLifecycle.mjs` — sims a full season for all 12 teams and verifies generate → per-Major nudge → season-end review

### Testing
- `npm run build` ✓ · `scripts/stressRosterIntegrity.mjs` 24/24 ✓ · `scripts/diagnoseBoardObjectives.mjs` ✓ · `scripts/testBoardLifecycle.mjs` 12/12 ✓

## Update 2026-06-01 (Tournament screen redesign — Major/Champs control room)
- Redesigned `src/components/MajorTournamentOverlay.jsx` (the live Major + Champs bracket screen) into a compact, FM-style "tournament control room". UI/UX only — no change to tournament logic, bracket generation, seeding, results, points, or simulation. All data is derived read-only from existing bracket state. `MajorBracket.jsx` was already dead code (not imported); the Challenger Qualifier overlay is a separate component and is unchanged.

### Layout
- **Sticky command header** (`mto-cmd-header`, lives outside the scroll area so it never scrolls away): event name · current round · teams alive · user status (Alive/Eliminated/Champion) · user record · best-possible/finish · next opponent or latest result · compact command bar (Play Your Match / Sim Next / Sim Round / Finish Event).
- **Two-column body** (`mto-layout`): tabbed bracket on the left, sticky **Event Summary aside** on the right (`mto-aside`, `position: sticky`). On ≤1080px the aside stacks above the bracket (`order: -1`).
- **Tabs** (`mto-tabs`): DE (Majors/Champs) → Overview / Winners / Losers / Results / Placements; SE fallback → Overview / Bracket / Results / Placements. Default **Overview** shows the current round + most-recent completed round only (no scroll to see live action).

### Event Summary aside
- **My Team**: logo, seed, status, record, bracket side (Winners/Losers/Eliminated/Champion), best-possible/finish, projected points (regular Majors only, from `MAJOR_PLACEMENT_POINTS`).
- **Current Match**: next match with seeds/tags, user marker, primary "Play Your Match" (opens Match Center) or "Sim This Match".
- **My Team Path** (`getUserPath`): the user's route — each played leg (Won/Lost score vs opp) + the next upcoming leg + final placement when eliminated.
- **Latest Results** (`getLatestResults`, most-recent-first, 8 rows): round · winner · score · loser · MVP · Details (jumps to Results tab and expands the series).
- **Placements & Points** (`getMajorPlacementMap` grouped into bands Champion→13th–16th): live as teams are eliminated; full ladder when complete; points per band for regular Majors.

### User-team highlighting (everywhere)
- "YOUR TEAM"/"YOU" pills, accent left-border + tint on bracket cards involving the user (`mto-bc-user-involved`), green glow on the user's win cards, distinct tint on the user's team line, glow on the user's tag in score rows, highlighted aside rows, and a ◆ marker in the placements list.

### Active-match visibility
- The next unplayed match in the current round gets a **NEXT MATCH** badge (or **YOUR NEXT MATCH**, green) and a stronger border/glow (`mto-bc-next` / `mto-bc-next-user`). The same match appears in the aside Current Match panel.

### Save compatibility / safety
- No save migration. All new display helpers are pure derivations over existing bracket state with safe fallbacks (missing MVP/K/D, TBD slots, bye teams with no populated match, missing placements). Existing defensive guards (missing bracket → recoverable panel) are preserved.
- Build ✓ · roster-integrity stress 24/24 ✓.

## Update 2026-06-01 (CDL 2026 Map Pool / Mode Strength / Veto foundation)
- Added a map/mode identity + veto layer so teams differ beyond raw OVR. Reads existing roster/staff/chemistry/form data only; does not change roster AI, contracts, budgets, free agency, awards, owner/board, brackets, points, ratings, or tournament formats.

### Data (`src/data/mapPool.js`)
- `CDL_2026_MAP_POOL` (HP: Sake/Colossus/Den/Scar/Gridlock/Hacienda · S&D: Den/Gridlock/Raid/Fringe/Sake/Hacienda · Overload: Den/Exposure/Scar/Gridlock), `SERIES_MODE_ORDER` (HP, S&D, Overload, HP, S&D), `MODE_META`, `MAP_BY_ID`. Overload is the third mode (not renamed to Control).

### Engine (`src/engine/mapProfile.js`, pure + deterministic)
- `buildTeamMapProfile(teamId, players, staff, season)` → `{ modeRatings, mapRatings, strengths, weaknesses, identity, staffPrep, lastUpdatedSeason }`.
  - **Mode ratings**: base = avg starter OVR, nudged by the same per-mode attribute weights the sim uses, role lean, chemistry, form, a small capped staff-prep bonus, and a persistent per-franchise mode bias (hash of teamId, ±4) so teams develop HP/S&D/Overload identities. Clamped 50–99.
  - **Map ratings**: mode rating ± deterministic per-(teamId,mapId) variance; spread is smaller for strong teams (deeper pool), larger for weak teams. Persistent across seasons; base shifts with roster.
  - **Identity**: Balanced Contender / Fundamentals Team / Hardpoint Heavy / Respawn Heavy / S&D Specialist / Overload Specialists / Weak S&D Side / Shallow Map Pool / Upset Threat.
- `calcStaffPrep(staff, teamId)`: Head Coach tactical (all modes), respawn (HP+OVR), snd (S&D), discipline (consistency); Analyst scouting (prep) + tactical (veto quality). Capped −1..+3; GM/Owner give nothing.
- `autoVeto(profileA, profileB)`: deterministic best-of-5 (HP/S&D/OVR/HP/HP→S&D order), alternating fav/dog pick/counter-pick, no repeated map within a mode, favourites prefer strong+edge maps, underdogs prefer comfort (sometimes gamble). Same result in preview and sim.
- `computeModeEdges`, `mapStrengthMod(edgeA)` (0.2/pt, capped ±3.5 strength).
- `getTeamMapProfile(state, teamId)` (stored or safe on-the-fly derivation), `ensureTeamMapProfiles`, `buildAllMapProfiles`.

### Match-sim influence (modest, opt-in, backwards-compatible)
- `simMap` accepts optional `ctx.selectedMap` / `ctx.mapStrModA` / `ctx.mapEdgeA`; adds a capped strength delta (±3.5, mapWinProb÷8) and surfaces `mapId`/`mapName`/`mapEdgeA` on the result. Zero/null by default → unchanged behaviour for legacy callers.
- `simMatch` derives the veto + per-map mods when both team objects carry `.mapProfile` (attached by `buildTeamObj` / `challengerTeamObj` / the Match Center); otherwise behaves exactly as before. So map names + a small upset-friendly edge apply to stage, Major, Champs and qualifier series, while diagnostic scripts that call `simMatch(a,b,seed)` are unaffected.

### Storage / hydration (`gameStore.jsx`)
- `state.teamMapProfiles` generated at: new game, load (hydrate if missing/stale-season), offseason→new season (force rebuild), and after roster/staff changes (SIGN/RELEASE/RESIGN/HIRE/FIRE → deterministic rebuild). Never regenerated on render. Old saves hydrate safely; no reset.

### UI
- **Team Profile (TeamHub)**: `MapPoolPanel.jsx` — identity, HP/S&D/OVR ratings (+staff prep), best/weak maps.
- **Match preview**: `MatchPreview.jsx` — OVR, per-mode edges, projected map set + per-map edge. Shown in NextMatchOverlay and the bracket Current Match panel.
- **Match details**: `SeriesDetail.jsx` now shows the map name and a map-edge chip per map; Match Center map-history rows show the map name.
- **Staff page**: `MapPrepChips` shows HP/S&D/OVR prep + veto edge from the user's staff.
- League Feed map-pool stories intentionally skipped this pass (avoids feed spam).

### What is display-only / TODO
- Map-pool sim influence is active (capped). Manual user veto UI is intentionally not added (auto veto only). League-feed stories deferred.

### New files
- `src/data/mapPool.js`, `src/engine/mapProfile.js`, `src/components/MapPoolPanel.jsx`, `src/components/MatchPreview.jsx`, `scripts/diagnoseMapProfiles.mjs`.

### Testing
- `npm run build` ✓ · `scripts/stressRosterIntegrity.mjs` 24/24 ✓ · `scripts/diagnoseMapProfiles.mjs` ✓ (range/variety/determinism/veto/named-maps/legacy-compat) · `scripts/testBoardLifecycle.mjs` 12/12 ✓.

## Update 2026-06-01 (Matchday map set / tactics polish)
- Polished `MatchCenterOverlay` live match presentation to use real map names/modes in current-map, next-map, and result labels instead of dev-style mode slots.
- Reworked the live scoreboard into a horizontal series score with a compact current/next map line, and replaced the right-side map-history-only panel with a full Series Map Set panel showing completed results, the next map, and softened upcoming map edges.
- Added shared map display helpers for formatted map labels and softened edge wording. UI now bands map-pool edges as Even/Slight/Edge/Strong/Heavy and caps visible numbers at +12 while leaving internal map-edge calculations unchanged.
- Replaced the old intermission tactic buttons with next-map manager choices: Standard, Aggressive Pace, Slow Fundamentals, Protect Lead, and Swing Momentum. Effects are consumed on the next map only and stay modest through small attribute/map-strength nudges.
- Staff tactical/discipline input can lightly improve tactic effectiveness or soften downside when data is present; missing staff data safely falls back to no extra help.
- Match sim, roster AI, contracts, budgets, free agency, awards, owner/board, profile history, brackets, points, ratings, save data, and logos remain unchanged except for optional next-map tactic boosts passed into the existing map sim.

## Update 2026-06-01 (Challenger DE24 / Challengers Finals / ESWC)
- Fixed the visible 24-team Challenger Qualifier so it is true double elimination from the start: seeds 9–24 play WB Round 1, seeds 1–8 receive byes into WB Round 2, WB Round 1 losers drop into LB Round 1 after WB Round 2, and teams are only eliminated on a second loss. The UI now labels this as WB/LB rounds rather than Play-In.
- Qualifier seeding uses circuit points, team OVR, form, prior qualifier placement, and small seeded noise; random ordering is only a small fallback nudge.
- Added Challengers Finals after Major 4 and before the Pre-Champs window. The top 16 Challenger teams qualify by the same season-long seeding score, play a 16-team double-elimination bracket, receive extra circuit-prestige points, and the top 4 qualify for ESWC.
- Added ESWC after CDL Champs season awards and before offseason. ESWC is a 16-team DE bracket using all 12 CDL teams plus the top 4 Challengers Finals teams. It is a prestige event only and does not award CDL points.
- Existing saves hydrate safely with an ESWC major slot if missing; saves already past the new event point continue without crashing rather than being rewound.
- Added diagnostics: `scripts/diagnoseChallengerQualifier24.mjs` and `scripts/diagnosePostSeasonEvents.mjs`.
- Testing: `npm run build` ✓, offseason diagnostics ✓, DE24 qualifier diagnostic ✓, postseason event diagnostic ✓, roster-integrity stress 24/24 ✓.

## Update 2026-06-01 (Challenger roster integrity + ESWC postseason order)

### Part 1 — Challenger "Sub 4" root cause + repair pipeline
- **Root cause:** Challenger event rosters resolve from `team.playerIds`; when a team came up short (player promoted to CDL / unsigned pool drained), `padTeamToFour()` in `matchSim.js` invented throwaway `Sub 1..4` players at sim time. The real gap was the offseason free-agency rework: unsigned players now live in the `players` array as `status: "freeAgent"`, but the Challenger fill only drew from `gameState.prospects`. With the prospect pool thin, teams stayed below 4 even though plenty of real free agents existed → `Sub 4`.
- **New repair pipeline:** `repairChallengerRosters(gameState, { seeds, allowEmergency, includeFreeAgents })` in `seasonEngine.js`:
  1. `ensureChallengerTeams()` — clean invalid refs + prospect fill (unchanged).
  2. Build a **real candidate pool** = free-agent players (`players[]` with `status:"freeAgent"` / unattached) **plus** free unsigned prospects; excludes CDL-active, retired/inactive, duplicate-name, already-rostered.
  3. **Fill** every team to 4 from the pool, highest-priority team first, region-preferred, OVR-sorted.
  4. **Seed-aware poaching:** any still-short top team takes the best player from the *lowest*-priority team that has one; donors are processed later in the same top-down pass and refill from teams below them, so the shortage cascades to the very bottom/backfill teams only.
  5. **Emergency generated player** with a believable gamertag from `FRESH_PROSPECT_NAMES` (never `Sub N`), pushed into `prospects` so profile clicks resolve. Logs a `[challenger-repair] LAST RESORT` warning. True last resort.
- **Priority** = same season-long seeding score the qualifier/finals use (circuit points + OVR + form + prior placement), or explicit `seeds` when supplied.
- **Where it runs:** `buildChallengerQualifierField()` (covers Challenger qualifier, Challengers Finals, ESWC fallback field) and `beginEswc()` before building ESWC event teams.
- **Duplicate-ownership prevention:** a single `used` id-set + `usedNames` name-set spans all teams during the fill/poach passes; `resolveEventRoster()` backfills captured-but-short event rosters from the team's current repaired roster so a player promoted to CDL between events can't leave a hole.
- **Last-resort name fix:** `padTeamToFour()` in `matchSim.js` now uses a small believable gamertag pool + `isEmergencyGenerated`, so even the absolute defensive pad never renders `Sub 4`.

### Part 2 — ESWC moved to after Champs, before Awards/Offseason
- New competitive calendar: **CDL Champs → ESWC → Season Awards → Offseason/Contract Review → User FA Window → AI FA → New Season.**
- `_advanceMajorPhase()` (`seasonEngine.js`): when Champs (idx 4) completes it now starts **ESWC immediately** via `beginEswc()` instead of opening the awards gate. When ESWC (idx 5) completes, the new `gateSeasonAwards()` helper archives the season, computes awards (now including ESWC stats), and opens the Season Awards overlay.
- `gateSeasonAwards()` skips re-showing awards when the season is already in `seenAwardsSeasons` (legacy saves that saw awards before ESWC), preventing duplicate awards popups.
- ESWC completion tracked by `schedule.majors[5].completed`; `pendingPostChampsEswc` is cleared once ESWC is live (stops `CONTINUE_FROM_SEASON_AWARDS` from restarting it). Board review still runs on `CONTINUE_FROM_SEASON_AWARDS` — now after ESWC, correctly closing the year.
- **Awards content:** awards compute after ESWC, so Season MVP / role awards naturally include ESWC stats (the preferred "up to and including ESWC" behavior). Added a separate **ESWC MVP** award (`eswc_mvp`, additive, only when ESWC completed) — Season MVP / Rookie / Champs MVP / Major MVP selection logic is unchanged.
- **Recap:** `SeasonAwardsOverlay` now shows an **ESWC** block (Champion · Runner-up · MVP). League feed already emits the ESWC winner story when ESWC completes (`generateMajorFeed`, idx 5), which now lands before the awards screen — correct order, no extra spam.
- **Save compatibility:** old saves still hydrate the ESWC major slot on load. Saves already in offseason are not forced back into ESWC. Saves stuck at awards-before-ESWC (old order) still route through `beginEswc` on continue, run ESWC, then land in offseason with no duplicate awards.

### Diagnostics
- Added `scripts/diagnoseChallengerRosterIntegrity.mjs` — reports team/roster/valid counts, candidate-pool sizes (free-agent vs prospect), fills, poaches, donor repairs, emergencies, duplicate ownership, CDL∩Challenger overlap, and top-8 placeholders; **fails** if any event team has <4 valid players, any top-8 seed has a placeholder, any player is double-owned, or `Sub N` appears while real candidates exist. Includes two stress scenarios (prospect pool drained → free-agent fill; all pools drained → seed-aware poaching + bottom-team emergency).
- Added `scripts/diagnosePostSeasonFlow.mjs` — asserts Champs → ESWC → Awards → Offseason → Contract Review with no skips/loops/duplicate awards.
- Updated `scripts/diagnosePostSeasonEvents.mjs` for the new order.

### Testing
- `npm run build` ✓ · `diagnoseChallengerRosterIntegrity` ✓ (incl. free-agent fill + poaching stress) · `diagnosePostSeasonFlow` ✓ · `diagnosePostSeasonEvents` ✓ · `stressRosterIntegrity` 24/24 ✓ · `diagnoseOffseasonFreeAgency`/`diagnoseOffseasonState` ✓ · `diagnoseChallengerQualifier24`/`testChallengerRosterVariety`/`testProfileHistory`/`testBoardLifecycle`/`testPlacementDisplay`/`verifyMajorCompletion`/`test:rookie-awards` ✓.

### Known limitations
- Emergency Challenger players are intentionally still possible if *every* real pool is exhausted AND no lower team can be poached (only the bottom/backfill teams), but they now carry realistic gamertags. Literal `Sub N` is gone from normal gameplay.
- Event-time Challenger repair pulls free agents into Challenger teams; the offseason **user/AI free-agency window** still excludes them to avoid stealing signings mid-window (repair only runs at event entry, after the window).
- Season MVP/role awards now fold in ESWC match stats (a consequence of awards moving after ESWC). This is intended; ESWC MVP is tracked separately.

## Update 2026-06-01 (Full multi-season stability diagnostic + integrity hardening)

### New diagnostic: `scripts/diagnoseFullSeasonFlow.mjs`
Simulates **6 complete seasons** through the real engine (default `optic`, configurable via `node … diagnoseFullSeasonFlow.mjs <team> <seed>`) and verifies the entire loop. It mirrors the reducer's offseason hooks (board-objective regen, map-profile rebuild, season-end board review) and simulates a competent user (re-sign keepers, let one walk, sign a replacement during the FA window). Validates per season:
- **Phase order**: Stage→Qualifier→Major ×4 → Challengers Finals → Champs → ESWC → Awards → Offseason/Contracts → User FA → AI FA → New Season (asserts the intended competitive order Champs → ESWC → Awards → Offseason).
- **Tournaments**: every Major/Champs/ESWC = 16 teams (12 CDL + 4 Challengers), no duplicate teams, bracket completes, champion + valid placements, regular-Major points awarded (champion +100), ESWC/Champs award **no** CDL standings points; qualifiers = 24-team true DE (LB rounds, top-4 qualify); Challengers Finals = 16-team DE. Scans **every match's player stats** for `Sub`/`__placeholder_` and 4v4 integrity.
- **Rosters**: CDL teams 4 valid starters, no player on two CDL teams / two Challenger teams / both, no retired-active, no undefined player in sim. Challenger shortages at non-event checkpoints are reported as transient warnings (they self-heal at the next event-entry repair); placeholders reaching a real event match are hard failures.
- **Offseason/FA**: contract review after awards, user re-signed keepers not poached by AI, let-walk players leave the user team, FA market includes former-AI players, no player both FA and rostered, AI rosters repaired after FA.
- **Awards/history**: Season MVP, Rookie (if eligible), role awards resolve to real players, 4 Major MVPs, Champs MVP, ESWC MVP; season/team/OVR history persists into the next season.
- **Board/Staff/Map**: board objectives + confidence exist and stay stable mid-season, every CDL team has staff, empty-staff path doesn't crash, every CDL team has a map profile, `autoVeto` always yields 5 valid maps with no intra-mode repeat.

Prints a per-season report (majors/qualifiers completed, finals/champs/eswc/awards/offseason status, roster issues, duplicates, placeholders-in-events, FA former-AI count, re-sign/let-walk, awards check, board/staff/map) + PASS/FAIL with phase·event·subject·expected·actual·source for any failure.

### Bugs found & fixed (small, targeted)
1. **Placeholders in later-season events.** The post-Major AI roster window signs Challenger players to CDL *after* the event field is built, shadowing already-captured event rosters → teams short at sim time → placeholder pads. Fix (`seasonEngine.js`): re-run `repairChallengerRosters` at the start of the qualifier/finals sims (`simChallengerQualifier`/`…Round`/`…NextMatch`), before baking regular-Major event teams (`continueFromChallengerQualifier`), before Champs event teams (`beginChamps`), and at the new-season transition (`advanceOffseason`). `resolveEventRoster` now resolves from the team's **current, globally-deduped repaired roster** first (falling back to captured rosterIds only if short) — this also fixes a duplicate-ownership case where two event teams shared a player ("7-player match").
2. **Duplicate active player names across two CDL teams** (e.g. "Snoopy on two CDL teams"), created when AI signs a regenerated same-named player. Fix: `resolveDuplicateActiveCdlNames` runs at the new-season transition — keeps the user's player (roster is sacrosanct) or the highest-OVR holder, releases the rest to free agency; the integrity pass then refills. Deterministic; only fires on the illegal duplicate-name state.

These are spec-aligned with the prior Challenger-integrity work ("run repair at season start / after offseason / after CDL teams sign Challenger players"). No changes to match simulation, ratings, contracts/budgets, brackets, points, awards selection, staff, board, or map/veto logic.

### Testing
`npm run build` ✓ · `diagnoseFullSeasonFlow` ✓ across 12 team/seed combos (72 season-runs, 0 placeholders / 0 duplicates / 0 CDL roster issues) · `diagnosePostSeasonFlow`/`diagnosePostSeasonEvents`/`diagnoseChallengerRosterIntegrity`/`stressRosterIntegrity` 24/24/`diagnoseOffseasonFreeAgency`/`diagnoseOffseasonState`/`diagnoseChallengerQualifier24`/`testChallengerRosterVariety`/`testProfileHistory`/`testBoardLifecycle`/`testPlacementDisplay`/`verifyMajorCompletion`/`test:rookie-awards` ✓.

### Known limitations
- Between events a Challenger team can transiently carry a CDL-shadowed reference until the next event-entry repair (reported as a warning, not a failure; never reaches a match). The diagnostic's gameplay guarantee is "no placeholder/Sub in any event match", which holds.
- CDL duplicate-name resolution runs at the season rollover; a duplicate created mid-season by an AI roster window would persist until the next season start (none observed reaching a match in 72 season-runs).
- The diagnostic simulates a competent user (keeps roster ≥4); a passive user can still play a thin roster in-game (the UI blocks simming with <4, by design).

## Update 2026-06-02 (Prospect Scouting 2.0 — uncertainty / visibility layer)
- Added a scouting visibility layer so prospects and young/unknown players are no longer fully obvious. Instead of always showing exact OVR/POT, the user sees **estimated ranges + a scout-confidence score** that tightens as they invest scouting assignments. True OVR/POT remain untouched on the player objects and stay the source of truth for match sim, progression, roster AI, awards, contracts, free agency, board and map logic — none of which were changed.

### Where scouting data is stored (`state.userScouting`)
```js
userScouting: {
  version: 1,
  players: { [playerId]: { applied, reportLevel, lastSeason, lastStage, deepUsed } },
  shortlist: [playerId, ...],        // persists in save (replaces old localStorage shortlist)
  assignmentsUsed: { [`${season}:${stageIdx}`]: count },
}
```
- Hydrates safely: missing on old saves → empty structure via `migrateUserScouting`. Only stores user-applied scouting; all estimates/ranges/risk/notes are **derived lazily on view**, nothing baked into the save.

### New engine: `src/engine/scoutingEngine.js` (pure, deterministic, no rating mutation)
- **Who is obscured** — `isEstablishedPlayer` (exact ratings): user-owned, active non-prospect on any CDL roster, ≥36 CDL maps of sample, or older former-pro free agents. `isScoutTarget` = everyone else (prospects, young unsigned, low-sample challengers, yearly pool).
- **Confidence** — `getBaseConfidence` (intrinsic floor from staff power + sample + age + per-player jitter) + stored `applied` from user scouting, clamped 0–100. Established → 100. Bands: 0–24 Unknown · 25–49 Basic · 50–74 Detailed · 75–99 Advanced · 100 Fully Scouted.
- **Estimated ranges** — `getDisplayOvr`/`getDisplayPot` return `{exact:true,value}` or `{exact:false,min,max}`. Width = `round((1-conf/100)*maxHalf)` (OVR 9, POT 11), plus a small deterministic per-player **bias** (±4, shrinks with confidence) so some prospects read overrated and some as hidden gems ("scouts can be wrong"). Width never collapses to an exact number until conf=100, so exact ratings are never exposed early.
- **Risk** — `computeRisk` blends potential gap, ego, composure, tilt resistance, age and scouting uncertainty → Low / Medium / High / Boom/Bust / High Ceiling / Safe Floor. De-escalates as confidence rises (matches the spec example).
- **Hidden gem / bust** — `analystHunch` correlates with the true potential gap but is degraded into noise by a weak Analyst, so strong analysts reliably surface real gems (`isHiddenGemCandidate`) and flag `isBustRiskCandidate`. Used only to *recommend who to investigate* — never reveals the number.
- **Progressive report** — `getScoutingSummary` reveals more strengths/weaknesses/traits by band (0 at Unknown → all at Fully Scouted). Helpers: `getDisplayOvr/Pot`, `getScoutingSummary`, `getPlayerScoutingConfidence`, `formatDisplayRating`, `getConfidenceBand`.

### How staff affects scouting
- `getStaffScoutPower(state, teamId)` → 0..1 from the user team's **Assistant GM** (scouting/reputation/negotiation — identification & efficiency), **Analyst** (scouting/tactical/discipline — accuracy & gem detection, weighted highest) and **Head Coach** (development/tactical — smaller dev-projection signal). Higher power → higher base confidence, bigger `scoutGain` per action, and +1/+2 scouting assignments per stage.

### Scouting actions (reducer in `gameStore.jsx`)
- `SCOUT_PLAYER {playerId, deep}` → `applyScout`: basic scout = 1 assignment, +20–35 conf (staff-scaled); Deep = 2 assignments, +40–60. Caps at 100, reveals more at each band.
- `TOGGLE_SHORTLIST {playerId}` → `toggleShortlist`: add/remove, persists in save.
- **Assignments**: base 5 + staff bonus per stage, tracked by `assignmentsUsed[`${season}:${stageIdx}`]`, so they **refresh automatically at each stage start** (key changes) with zero migration.

### Screens updated
- **New "Scouting" sidebar tab → `src/components/Scouting.jsx`** (Prospect Hub): overview (assignments remaining, GM/Analyst scout ratings, shortlist count, scout power, hidden-gem count), tabbed pool (Prospect Pool / Recommended / Shortlist) with estimated OVR/POT ranges + confidence bar + risk + revealed traits + Scout/Deep/Shortlist actions, and a sticky **Scout Report** aside (ranges, confidence, strengths/weaknesses, traits, recommendation, hidden-gem/bust flags, sign cost).
- **Challengers (`Prospects.jsx`)**: pool table now uses scouting estimates (range OVR/POT), confidence %, risk, a 💎 hidden-gem marker, an inline **Scout** button, and the state-backed shortlist (old localStorage shortlist removed).
- **Free Agency (`FreeAgency.jsx`)**: young/unknown free-agent scout targets show estimated OVR/POT (with confidence tooltip); established former pros still show exact ratings.

### Save compatibility
- `migrateUserScouting` runs in `createInitialGameState` and `LOAD_GAME`. Old saves load with no userScouting → empty structure, estimates generated on view. No rosters/stats/history/contracts/FA/staff/board/map data touched. Established CDL players and user-owned players always show exact ratings, so core screens are unaffected.

### Diagnostics
- Added `scripts/diagnoseProspectScouting.mjs` (26 checks): hydration of a save missing `userScouting`, pool produces summaries, confidence always 0–100, estimates plausible vs true rating, scouting raises confidence + narrows range + reveals more, established players show exact ratings, assignments cap + stage-refresh, shortlist add/remove, better staff → bigger gains/base, and **true internal OVR/POT never mutated** (fully-scouted reveals the exact true value).

### Testing
- `npm run build` ✓ · `diagnoseProspectScouting` 26/26 ✓ · `diagnoseFullSeasonFlow` PASS (6 seasons) · `stressRosterIntegrity` 24/24 ✓ · `diagnoseOffseasonFreeAgency`/`diagnoseOffseasonState`/`diagnoseChallengerRosterIntegrity`/`diagnosePostSeasonFlow`/`diagnoseChallengerQualifier24`/`test:rookie-awards` ✓ · ESLint clean on new/changed files.

### Known limitations
- Free Agency still shows exact per-attribute columns (Gunny/Clutch/S.IQ/T.Work) for scout targets — only OVR/POT are ranged there; the dedicated Scouting/Challengers screens are the intended scouting surfaces. Most FAs are established former pros anyway.
- AI continues to use true ratings internally (by design); AI scouting uncertainty is future work.
- Assignment limits refresh per stage only; no separate per-Major refresh. Deep Scout has no hard per-stage cap beyond the shared assignment pool.
- Player Profile overlay still shows stored values; it was not converted to the scouting layer this pass (the spec deferred broad rating replacement to avoid breaking core screens).

## Update 2026-06-02 (Transfer / Buyout negotiation system)
- Added in-contract player movement (buyouts) on top of the existing contract, budget, roster-integrity, staff/GM and board systems. No change to match sim, ratings, brackets, points, awards, map/veto or profile-history logic. True ratings and the salary cap are untouched; transfer fees use a **separate transfer budget**.

### Where transfer data is stored (`state.transferMarket`)
```js
transferMarket: {
  version: 1,
  negotiations: [ { id, fromTeamId(buyer), toTeamId(seller), playerId, offerType:"buyout",
                    fee, counterFee, counterBy, status, round, initiator:"ai"|"user",
                    reason, agreedFee, createdKey, expiresKey, history:[...] } ],
  status: { [playerId]: { transferStatus, askingPrice } },   // user-set, keyed by id (player objects untouched)
  budgets: { [teamId]: { balance, spend, income } },         // separate from salary cap
  recentlyTransferred: { [playerId]: windowKey },            // post-move protection
  cooldowns: { [`${buyerTeam}:${playerId}`]: windowKey },    // anti-spam
  lastWaveKey, waveNonce, nextId,
}
```
Hydrated by `migrateTransferMarket` in `createInitialGameState` and `LOAD_GAME`; old saves get an empty structure, statuses default to "Open to Offers", buyout values derive on demand.

### New engine: `src/engine/transferEngine.js` (pure, deterministic)
- **Valuation/buyout** — `getPlayerValuation` builds on `getSigningCost` and inflates for contract years (×1.16/yr), age, potential, recent form, the selling owner's ambition and transfer status (Not For Sale ×2.3, Transfer Listed ×0.7, Unsettled/Wants Move ×0.85). `getAskingPrice` uses the user's set price if any, else valuation.
- **Transfer budget** — `getTransferBudget` (separate pot, lazy default ≈ 0.6 × salary cap); buyouts debit the buyer / credit the seller. Salary cap still applies to the player's wage after the move.
- **Windows** — `isTransferWindowOpen`: open in stage / preChamps / offseason / contracts; closed during Major / Champs / ESWC / qualifier (event rosters baked). `getWindowKey` keys waves/cooldowns per `season:stage|phase`.
- **AI interest** — `aiInterestInPlayer` scores role need, team upgrade, bigger-team-eyes-weaker, youth upside, transfer status, owner ambition and GM negotiation; gated by transfer budget. `generateIncomingOffers` produces a *calm* wave (≤1 mid-stage, ≤2 in offseason) with anti-spam cooldowns and dedupe.
- **Responses** — `evaluateSellResponse` (AI seller: accept/reject/counter vs asking, NFS needs a huge bid), `evaluateBuyerCounterResponse` (AI buyer weighs the user's counter vs valuation tolerance + budget). `playerWillingness` (user buys): team strength delta, budget tier, GM reputation, wage uplift, sub demotion, loyalty.
- **Movement** — `buildTransferResult` moves the player (carries contract/salary), debits/credits transfer budgets, frees the AI buyer's weakest starter (or signs the user's pick as a cap-free sub when the XI is full), blocks the user on cap/roster overflow, marks the player "Recently Signed" (protected), withdraws competing offers. `boardNudgeForTransfer` applies a small clamped confidence swing (sell a star cheap −4, statement signing +4, etc.).

### Reducer actions (`gameStore.jsx`)
- `RUN_TRANSFER_WAVE` (auto-dispatched once per open window from the Transfer Centre via a window-key guard — never every render; `force` allows a manual re-scan) → generates AI incoming offers + feed/notification.
- `SET_TRANSFER_STATUS {playerId, status, askingPrice}` → user sets own player's availability/price.
- `MAKE_TRANSFER_OFFER {playerId, fee}` → user outgoing offer; AI seller responds synchronously (accept/reject/counter).
- `RESPOND_TRANSFER_OFFER {negotiationId, action, fee}` → `accept` / `reject` / `counter` / `withdraw` / `nfs`. Accept runs `buildTransferResult` → `ensureCdlRosterIntegrity` (AI teams repaired; user team may go thin and the existing roster-lock blocks simming) → `cleanupDuplicateActiveAssignments` → map-profile rebuild → board nudge → feed + notification.

### UI added
- **New "Transfers" sidebar tab → `src/components/TransferCentre.jsx`**: budget/window header; tabs for **Incoming Offers** (accept/counter/reject/NFS + confirm sale), **Outgoing Offers** (accept counter / re-counter / withdraw / complete signing), **Transfer Listed** around the league (make offer), and **My Squad** (valuation, set asking price, set status). Compact FM-style tables, team-accent action buttons.
- **Player Profile**: new Transfer section — for own players, quick Transfer-List / Open to Offers / Not For Sale + asking/value/budget; for rival CDL players, current club + estimated value + a Make Offer field (disabled when the window is closed).

### Popups / feed stories
- Notifications: incoming offer received, AI counter, accept-to-confirm, sold/ signed, rejection.
- League Feed (`transfer_offer`, `transfer_done`, categorised under "transfers" with ⇄ icons): "TEAM table a $Xk buyout offer for PLAYER", "TEAM complete $Xk buyout for PLAYER". Failed/spam offers are not feed-spammed.

### Save compatibility
- Missing `transferMarket` → empty structure on load. No change to contracts, rosters, stats, history, FA, staff, board or map data. Stability diagnostics call engine functions directly (the AI wave only runs through the reducer/UI), so the full-season and roster-integrity flows are unaffected.

### Diagnostics added
- `scripts/diagnoseTransferMarket.mjs` (35 checks): valuations generate & are sensible (NFS > base > listed; star ≥ signing cost), window timing, well-formed incoming offers, reject keeps player, accept moves player cleanly (old team loses / new team gains, income & spend recorded, AI buyer ends on 4, user seller intentionally left thin), AI→AI buyout repairs the AI seller, salary-cap handling on user buys (cap-free sub when full; over-cap starter blocked / within-cap when completed), seller response tiers (derisory→reject, mid→counter, full→accept, NFS→reject), transfer budget, league-listed selector, and safe hydration of saves missing the field.

### Testing
- `npm run build` ✓ · `diagnoseTransferMarket` 35/35 ✓ · `diagnoseFullSeasonFlow` PASS (6 seasons) · `stressRosterIntegrity` 24/24 ✓ · `diagnoseOffseasonFreeAgency`/`diagnoseOffseasonState`/`diagnoseChallengerRosterIntegrity`/`diagnosePostSeasonFlow`/`diagnoseProspectScouting` ✓ · ESLint clean on new/changed files.

### Known limitations
- Buyouts only (priority per spec); player-for-player **trades/swaps** are scaffolded in the data model (`offerType`, `includedPlayerIds`) but not yet implemented — left as TODO.
- AI↔AI transfers happen only through the in-game reducer wave (not in headless diagnostics) and currently arrive as offers to the user / are completed via `buildTransferResult`; a fully autonomous AI↔AI market each window is future work.
- Transfer budgets are a separate accounting pot (display + affordability); they don't yet roll over or refill on a schedule.
- Counter negotiations are capped to a couple of rounds for simplicity; no agent/personality depth beyond `playerWillingness`.

## Update 2026-06-02 (Challenger Manager Mode — foundation / "Road to CDL")
- Added the foundation for managing a **Challenger team** as an alternative career to the CDL manager mode. The CDL season, ratings, match sim, contracts, budgets, free agency, awards, staff, owner/board, map/veto, brackets, points, profile history and logos are unchanged; the existing 24-team Challenger ecosystem is reused. Existing CDL saves are never migrated into Challenger mode.

### User team type (`state.userTeamType`)
```js
userTeamType: "cdl" | "challenger"   // defaults to "cdl"; challenger → userTeamId is a Challenger team id
challengerOffers: []                 // pending CDL buyout offers for the user's Challenger players
challengerFunds: 0                   // transfer income from selling Challenger players
```
- Old saves with no `userTeamType` default to `"cdl"` on load (`LOAD_GAME`) and are never flipped.
- New helper module `src/utils/userTeam.js`: `getUserTeamType`, `isChallengerMode`, `getUserChallengerTeam`, `resolveUserTeamMeta` (uniform `{id,name,tag,color,logo,region}` for either mode), `getChallengerRosterPlayers`, `isUserChallengerPlayer`.
- Validation (`gameValidation.js`): `isValidUserTeam` accepts a Challenger user whose id resolves in `state.challengerTeams`; `isValidGameState` / `findPhaseInvariantViolations` updated.

### New game setup
- `TeamSelect.jsx` now has two paths: **Manage CDL Team** (12 franchises) and **Manage Challenger Team** (24 teams). The Challenger picker shows name, region, tag/logo and an **Est. OVR** computed from a stable seed via the new exported `buildChallengerPreview(seed)`; the same seed is passed to `NEW_GAME` so the started save's rosters match the preview.
- `NEW_GAME` accepts `{ teamId, teamType, seed }`; `createInitialGameState(userTeamId, userTeamType, seedOverride)` sets `userTeamType`, validates the Challenger id against the built teams, and uses a neutral (unused) CDL `boardState` for Challenger teams.

### Roster integrity / protection (the user's Challenger roster is hand-managed)
- `ensureChallengerTeams` and `repairChallengerRosters` (`seasonEngine.js`) **skip the user's Challenger team** for auto-fill, seed-aware poaching (as donor or recipient) and emergency padding — the user signs their own players and the sim gate blocks events while < 4.
- `rosterAI.js` computes a locked-id set at each AI entry (`ensureCdlRosterIntegrity`, roster windows, free agency) and **excludes the user's Challenger players from every CDL candidate pool**, so CDL AI can never silently sign them. `refillAllChallengerRosters` skips the user team.
- Mode-aware roster gating: `rosterValidation.js` adds `getChallengerRosterStatus` / `getUserRosterStatus`; `isUserRosterPlayable` and `getRosterIncompleteMessage` resolve the user's Challenger roster (4 valid players) so the existing "Roster incomplete — sign N more" block applies to Challenger teams too.

### Dashboard / Roster / Standings / Board / Matchday
- **`ChallengerDashboard.jsx`** (shown for Challenger users): club banner (region, tier, roster OVR, circuit points, circuit rank, transfer funds), current roster, owner objectives + confidence, qualifier position/seed, route context, player development, latest moves, **CDL buyout offers (accept/reject)**, and a compact CDL league panel.
- **Roster** screen is mode-aware: leads with the user's Challenger team (sign via Market / release via `RELEASE_CHALLENGER_PLAYER`, 4-man block) and keeps CDL rosters viewable read-only.
- **Standings** defaults Challenger users to a **Challenger Circuit** table (circuit points / form / best qualifier / OVR) with a toggle to the CDL league.
- **Board** screen routes to **`ChallengerBoard.jsx`** with Challenger-appropriate objectives (no CDL Champs/top-6 goals). Objectives + confidence are derived live in `src/engine/challengerBoard.js` (tiered weak/mid/strong/elite: win a qualifier match, reach top 8/4, win a qualifier, qualify for Majors, reach Finals, develop a prospect, build circuit points).
- **Matchday**: `NextMatchControl` shows **"Sim to Qualifier"** (SIM_STAGE) during the stage for Challenger users (the CDL season sims in the background). The **Challenger Qualifier overlay** highlights the user team in the field/bracket and adds **"Play Your Match"** (`SIM_USER_CHALLENGER_QUALIFIER_MATCH` → `simUserChallengerQualifierMatch`). Because a qualified Challenger team's id flows directly into the Major bracket seeds, the existing Major Tournament overlay highlights and plays the user team with no extra wiring.
- Sidebar adapts labels in Challenger mode (Standings→Circuit, Transfers→Buyouts, Challengers→Market) and resolves the team badge via `resolveUserTeamMeta`.

### Transfers / buyouts (CDL teams poach the user's players)
- New `src/engine/challengerMarket.js`: `generateChallengerBuyoutOffers` (deterministic per window for poach-worthy players), `applyChallengerBuyout` (moves the player to the CDL buyer as a sub if their XI is full, credits transfer income, removes from the user roster), `buildBuyoutTransaction`.
- Reducer actions: `GENERATE_CHALLENGER_OFFERS` (window-keyed, auto-dispatched once per window from the dashboard), `RESPOND_CHALLENGER_OFFER {accept|reject}`, `SIGN_CHALLENGER_PLAYER`, `RELEASE_CHALLENGER_PLAYER`. Players never move without an explicit user decision; CDL board lifecycle (nudge / review / mandate feed) is skipped for Challenger users.

### Diagnostics
- Added **`scripts/diagnoseChallengerManagerMode.mjs`** (33 checks): new save starts as Challenger with `userTeamType` challenger + 4 valid players + no placeholders/dupes + Challenger objectives; released slots are not auto-filled; AI windows do not poach user players; buyout flow moves a player + pays income; a full multi-season flow across 5 seeds verifies qualifier-field presence, "Play your match", top-4 Major qualification → user in Major bracket, background CDL standings, ESWC route, offseason without crash, no dup ownership; and CDL-save default-to-cdl.

### Testing
- `npm run build` ✓ · `diagnoseChallengerManagerMode` 33/33 ✓ · `diagnoseFullSeasonFlow` PASS (6 seasons) · `stressRosterIntegrity` 24/24 ✓ · `diagnoseChallengerRosterIntegrity` ✓ · `diagnosePostSeasonFlow` ✓ · ESLint clean on new/changed files.

### Known limitations
- Interactive Match Center for a qualified Challenger team in a **Pro-Am Major** is wired through the shared overlay (the team id is a real bracket seed) but was validated primarily via the Sim controls; the "Play Your Match" path in Majors may need polish.
- Some secondary CDL-centric screens (Transfer Centre "My Squad", Staff, Scouting, Dev Report) are not yet fully reskinned for Challenger teams — they render CDL data or empty user panels rather than crashing. Buyout offers live on the dashboard.
- Challenger board is display/eval only this pass — no season-end verdict/confidence-history lifecycle.
- Buyout offers are sell-only (CDL teams buying from the user); the user cannot yet spend `challengerFunds` to buy players. Challenger staff depth is minimal.

## Update 2026-06-02 (Focused bug pass — CDL + Challenger modes)
Bug-fix pass only — no new systems, no rebalancing, no format/logic changes beyond the fixes below.

### Bugs found & fixed
- **Challenger mode phase dead-end (significant).** The phase-advance CTAs (Begin Champs, Review Contracts, Open/Run Free Agency) live only in the CDL `Dashboard`, which `ChallengerDashboard` replaces — so a Challenger user had **no way to advance past `preChamps`, `offseason`, `contracts`, or the user free-agency window** (hard stuck mid-save). Fixed by adding an "Action Required" phase-advance banner to `ChallengerDashboard` that dispatches the exact same actions (`BEGIN_CHAMPS` / `ENTER_CONTRACT_PHASE` / `ADVANCE_OFFSEASON`) using the same conditions as the CDL hub. No engine/flow change — the reducer actions are unchanged.
- **Stale mode label in a doc comment.** `matchSim.js` `simMap` ctx comment said the third mode was `"Control"`; the engine and UI use `"Overload"`. Corrected the comment (no logic change). `SeriesDetail.jsx`'s `"CTL"` handling is intentional backward-compat for old-save match logs and was left in place.

### Investigated and confirmed NOT broken (no change needed)
- Save/load hydration: `userTeamType`, staff, board, transfer market, map profiles, scouting, ESWC/Challengers Finals slots all hydrate on old saves; CDL saves default to `userTeamType: "cdl"`.
- Season phase order Champs → ESWC → Awards → Offseason → Contracts → User FA → AI FA → new season (no skips/dupes/stuck states).
- CDL + Challenger roster integrity (no `Sub N` placeholders, no duplicate/dual ownership, user Challenger roster protected from AI signing).
- Contract review / free agency (re-signed kept, let-walk leaves, league-wide market, no AI override of user signings).
- Transfer/buyout flow — "Action Required" + "Confirm Signing" + sidebar badge surface accepted-fee/terms offers (no dead-ends).
- Staff/board: CDL-team lookups for a Challenger `userTeamId` use optional chaining (no crash); board hard-caps respected.
- Map pool/veto uses Hardpoint / Search & Destroy / Overload in the correct series order.
- Awards/history/profiles persist; brackets/events complete with valid placements.

### Known limitations / recommended follow-ups (not bugs; deferred to avoid feature creep)
- Secondary CDL-centric screens (Transfer Centre "My Squad", Staff, Scouting, Dev Report, and the Market/Free Agency budget header) render CDL or empty panels for a Challenger user — functional and non-crashing, but should be reskinned for Challenger teams.
- The Challenger offseason contract-review step is a pass-through (Challenger teams have no CDL contracts); a Challenger-specific offseason summary would be clearer.

### Testing
- `npm run build` ✓ · `diagnoseFullSeasonFlow` PASS (6 seasons) · `stressRosterIntegrity` 24/24 ✓ · `diagnoseOffseasonFreeAgency`/`diagnoseOffseasonState`/`diagnoseChallengerRosterIntegrity`/`diagnosePostSeasonFlow`/`diagnoseTransferMarket` (49/49)/`diagnoseProspectScouting` (26/26)/`diagnoseChallengerManagerMode` (33/33)/`diagnoseBoardObjectives`/`diagnoseMapProfiles`/`diagnoseChallengerQualifier24`/`diagnosePostSeasonEvents` ✓ · ESLint clean on changed files (pre-existing matchSim unused-var warnings untouched).

## Update 2026-06-02 (Challenger-mode UI context pass — secondary screens)
UI/context only — no engine, gameplay, format, or diagnostic changes. Only components + CSS touched. All screens detect mode via `isChallengerMode(state)` (defaults to CDL when `userTeamType` is missing); CDL saves render exactly as before.

### Screens reskinned for Challenger mode
- **Transfer Centre** (`TransferCentre.jsx`): Challenger users get a dedicated buyout-focused view (`ChallengerTransferCentre`) reusing the existing `state.challengerOffers` flow — tabs **CDL Interest** (incoming buyout offers, Accept/Reject → `RESPOND_CHALLENGER_OFFER`) and **My Challenger Squad** (roster with Development Value, Buyout Risk, live CDL Interest). Transfer-Funds/open-offers/window header, and a clear empty state ("Transfer activity will appear here when CDL teams make offers for your players…"). CDL Transfer Centre is unchanged.
- **Staff** (`StaffPanel.jsx`): title becomes "Challenger Staff", team name resolved via `resolveUserTeamMeta`, plus a framing note ("Staff resources are lighter at Challenger level…"). Hiring stays functional; CDL staff screen unchanged.
- **Scouting** (`Scouting.jsx`): title "Prospect Scouting" with Challenger-focused eyebrow/subtitle ("Find affordable talent, hidden gems and players with a route back to CDL…").
- **Dev Report** (`OffseasonReport.jsx`): title "Challenger Development" + framing line; the "My Team" filter/highlight is now Challenger-aware (matches the user's Challenger roster ids, since Challenger players have `teamId: null`) and relabeled "My Squad".
- **Free Agency** (`FreeAgency.jsx`): Challenger-specific header/subtitle, recruitment-context stat cards (Market / Former CDL / Challenger Roster x/4 / Transfer Funds) replacing the CDL cap cards, the CDL salary-cap budget bar hidden, and sign-gating driven by the 4-man Challenger roster instead of the CDL cap.
- **Market** (`Prospects.jsx`): Challenger header/subtitle ("…players with a route back to CDL. Replace players poached by CDL teams…"), CDL cap row/budget bar hidden, Squad x/4 chip, and 4-man sign-gating.
- **Offseason summary** (`ChallengerDashboard.jsx`): a Challenger "Offseason — Challenger Review" card (circuit finish, Majors qualified, players sold to CDL, transfer funds) with a contract pass-through explanation ("Your Challenger contracts have been reviewed. Focus now shifts to recruitment, development and protecting key players from CDL interest…").

### Intentionally unchanged
- All engine/store/data/diagnostics. CDL mode UI across every screen. The CDL transfer engine, scouting engine, staff engine and budgets (Challenger screens reuse existing state/actions only; no new logic).
- The "Sign As" starter/sub dropdown still renders in the Market/FA tables for Challenger users (ignored by `SIGN_CHALLENGER_PLAYER`); a future pass could hide it.

### Testing
`npm run build` ✓ · `diagnoseFullSeasonFlow` PASS (6 seasons) · `stressRosterIntegrity` 24/24 ✓ · `diagnoseChallengerManagerMode` 33/33 ✓ · `diagnoseTransferMarket` 49/49 ✓ · `diagnoseProspectScouting` 26/26 ✓ · ESLint clean on changed files.
