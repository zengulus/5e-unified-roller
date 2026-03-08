# Tools Hub (`tools.html`)

Landing grid for the entire suite. Open it first to import/export the unified data store, tweak the accent palette, or hand players a jumping-off point.

## Layout
- **Hero Header** – Import/Export plus **Case Snapshot** and **Campaign Snapshot** buttons live up top along with the accent picker and background cycler. Alt+Shift+Click the title to expose DM-only cards (Hub, GM deck, Clue tools, etc.).
- **Campaign Scope Panel** – Primary context selector for campaign scopes. Includes scope create/rename/delete, per-scope case ordering, one-and-only-one active case enforcement, and scope board references.
- **Active Case Overrides** – Optional advanced panel for direct active-case switching when you need to bypass scope-derived sequencing.
- **Campaign Pulse** – Workflow actions (`Start Next Case`, `Mark Resolved + Advance`, `Open Active Scope Board`) plus KPI cards for scope health and campaign pressure.
- **Meta Surface Links** – Quick actions for `campaign-timeline.html` and `campaign-board.html`, alongside case-scoped timeline/board links.
- **Cloud Connect Panel** – Player-facing import for `connect.json` plus a bundled-default shortcut so clients can join without manual key entry.
- **Cloud Sync Panel (Secret Mode)** – Manual Supabase URL/key/campaign controls, export of `connect.json`, and admin pull/push actions. This panel is intentionally behind Alt+Shift secret mode.
- **Board Recovery Panel (Secret Mode)** – Inspect the live Campaign/Case board room, restore recent snapshots, promote this browser's mirrored board to live, bust a corrupted room, clear stale browser board caches before reseeding, and run `Sync Linked Timeline Events` to rebuild clue-linked timeline event notes/deeplinks from persisted board nodes.
- **Customise Seed Panel (Secret Mode)** – Hidden fork helper that loads default/store guild + NPC + location data and exports fork-ready `data-guilds*.js`, `data-npcs*.js`, and `data-locations*.js` files.
- **Card Grid** – Responsive cards link to every HTML tool (player sheet, dashboards, HQ, timeline, etc.). Icons and short blurbs help the table pick the right door quickly.
- **Ledger Card** – Dedicated jump into `ledger.html` for pinned immutable facts and source-linked narrative evidence.
- **Secret Panel** – DM-only cards are tagged with 🔒-red borders; once the secret mode is active they fade in with a light animation.

## Tips
- Always import campaign data here first—the Hub, Campaign Board, Case Board, Dashboard, Roster, Locations, Requisitions, Campaign Timeline, Case Timeline, Encounters, and HQ pages all read from the same store, so one import primes the entire campaign stack.
- Treat campaign scope as the default selector, then use `campaign-timeline.html`/`campaign-board.html` for campaign-level tracking and `timeline.html`/`board.html` for case-level execution.
- Set the active case (derived from scope sequence, or via optional override) before opening case-scoped tools so edits land in the intended investigation.
- For multiplayer web deployments, set up Supabase once and use the Cloud Sync panel for realtime-ish shared campaign updates.
- If a shared board goes bad, use the secret Board Recovery panel before manually poking Supabase rows. Restore a recent snapshot when possible; use `Bust Live Room` only when you want the next clean browser to reseed the room.
- If you’re forking this repo, use the secret Customise panel to export fresh preload scripts for guilds/NPCs/locations, then drop them into `js/data-guilds.js`, `js/data-npcs.js`, and `js/data-locations.js`.
- Use the accent picker before a session so all other pages inherit the same neon colorway.
- Hide DM cards during open-table play so players only see approved utilities.
- Import/export here touches the unified `RTF_STORE` stack (Hub, Campaign Board, Case Board, Dashboard, Roster, Locations, Requisitions, Campaign Timeline, Case Timeline, Ledger, Encounters, HQ). Standalone utilities like the Character Sheet, Session Tracker, Narrative Engine, and Tournament Bracket keep their own local saves.
- Use `🤖 Case Snapshot` for active-case exports and `🤖 Campaign Snapshot` for full-campaign exports. Both support `full`/`compact` mode prompts.

## Related Project
For a less setting-specific version of this toolset, see [5e-unified-roller-base](https://github.com/zengulus-d-and-d-tools/5e-unified-roller-base).
