# Cod Dynasty Progress

Cod Dynasty is a standalone historical Call of Duty dynasty game repo at `matty51299-a11y/Cod-Dynasty`.

The old CDL Manager 2026 codebase was copied only as an engine foundation. CDL Manager 2026 should not be affected by changes made in this standalone repo, and Cod Dynasty should not present itself as CDL Manager 2026.

## Current Direction

- Cod Dynasty is a standalone historical COD dynasty game.
- Modern CDL 2026 mode is being removed from the user-facing game.
- The game starts in Call of Duty: Ghosts.
- Historical rosters come from `data/import/cod_manager_rosters_database.xlsx`.
- The long-term loop is Ghosts → Advanced Warfare → Black Ops 3 → Infinite Warfare → WWII → Black Ops 4 → Modern Warfare 2019 and beyond.

## Engine Foundation Kept

The copied engine systems remain useful as a simulation foundation while the user-facing flow becomes historical only:

- Match simulation
- Rosters and player profiles
- Season stats
- Inbox/feed/event flow
- Transfers, scouting, contracts, staff and board systems where currently required
- Season history, awards and career summaries

## Current Status

- New games start in historical mode with `currentEraId: "ghosts"` and `currentGameTitle: "Call of Duty: Ghosts"`.
- The start flow shows Cod Dynasty branding and Ghosts-era team selection only.
- Modern CDL 2026, Manage CDL Team, Manage Challenger Team and current CDL franchise team choices are not user-facing start options.
- Ghosts uses 4-player rosters and the Ghosts modes Domination, Search and Destroy and Blitz. Hardpoint is not part of the Ghosts start mode list.

## Next Historical Work

1. Ghosts event calendar.
2. Call of Duty Championship 2014 qualification.
3. Historical event naming and points structure.
4. Era transition tuning from Ghosts to Advanced Warfare and later titles.
