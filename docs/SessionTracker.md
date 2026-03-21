# Session Tracker (`gm.html`)

GM control deck for combat, ad-hoc rolling, and loot/reference pulls. Tracker data still lives in its own Local Storage key (`gmDashboardData`) for presets, log history, and scratchpad notes, but the active case VTT initiative in `RTF_STORE` is the canonical combat state. Use the Tracker's `Pull VTT Initiative` control when you want a fresh widescreen mirror of the current case combat order.
The Tracker tab is intentionally optimized for widescreen/tabletop displays rather than mobile layouts.

## Tabs & Panels
- **Tracker Tab** – Add single combatants with init/dex/HP, roll whole mobs with auto-numbering, and maintain an ordered list of actors. Track per-entity conditions (with round durations), reaction/concentration/legendary state, and use Undo + Combat Log to recover from mistakes.
- **VTT Initiative Pull** – Pull the active case's canonical VTT initiative into Tracker, including order, round, active turn, HP, AC, conditions, and reaction/concentration state. Pulling replaces the local Tracker encounter list.
- **Roller Tab** – Inline log shows the latest result, name/reason, and modifiers. Configure advantage state, custom bonuses, "secret" spoiler rolls, and luck bias. Tier buttons roll preset difficulty bands (Crap → Master) and a manual panel handles arbitrary bonuses or DC estimation sliders.
- **Ref & Loot Tab** – Save/load Mob presets, fire off quick loot tables (pocket lint vs trinket) with optional multipliers, manage data export/import, keep a scratchpad, and browse an auto-populated Conditions reference list.

## Utilities
- **Discord Integration** – Provide a webhook URL, enable Active, and optionally toggle **Tracker Turn Pings** so `Next Turn` posts a simple `{EntityName}'s Turn!` message to Discord. Keep spoiler mode on for hidden roller output.
- **Condition Expiry Ping** – When a timed condition drops to 0 on turn advance, the tracker logs and pings Discord with `{EntityName}'s {ConditionName} condition has expired!` (uses the same Tracker Turn Ping webhook/toggle path).
- **Sheet Initiative Sync** – Initiative rolled from the Character Sheet can still mirror into Tracker on the same browser/profile for convenience, but VTT remains the shared source of truth for the case combat state.
- **Data Portability** – Use the built-in export/import to move the GM deck; the Tools Hub export handles the rest of the `RTF_STORE` campaign data.
- **Accent & BG Controls** – The hero header exposes the 🎨 picker and 🌌 cycler so even the DM console matches the current vibe.

## Suggested Flow
1. (Optional) Export/import the GM deck if you want to shuttle presets or scratchpad notes between browsers.
2. If combat is already running in the VTT, hit `Pull VTT Initiative` first so Tracker mirrors the current case order, round, and active turn.
3. Add extra local combatants or mobs here if you want Tracker-only scratch management for a quick encounter.
4. Use condition chips for timed effects (for example `Stunned 2`); durations tick down when that combatant's turn comes up.
5. Mark reaction/concentration/legendary usage directly on each row and use Undo/Combat Log if you need to rewind.
6. Flip to the Roller tab whenever you need opposition rolls, DC calls, or Discord-ready results.
7. Use the Ref & Loot tab between fights for treasure drops, jotting quick notes or referencing conditions without leaving the page.

## Related Project
For a less setting-specific version of this toolset, see [5e-unified-roller-base](https://github.com/zengulus-d-and-d-tools/5e-unified-roller-base).
