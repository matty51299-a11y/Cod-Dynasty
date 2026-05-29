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
