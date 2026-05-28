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
