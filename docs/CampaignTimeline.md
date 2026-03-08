# Campaign Timeline (`campaign-timeline.html`)

Campaign-level timeline for cross-case beats, blockers, and strategic updates.

## Scope
- Uses campaign meta events (`campaign.meta.events`) instead of case events.
- Shares the same event model as Case Timeline (heat delta, tags, notes, and optional image).
- Board links target `campaign-board.html` so event-node cross-links stay in campaign scope.
- Lead Queue actions are intentionally omitted here; lead triage stays case-scoped in `timeline.html`/`leads.html`.
- Supports the same GM-only `Admin Move Mode` as Case Timeline: Alt+Shift+Click the title to reveal it, then use the filtered `Top` / `Up` / `Swap` / `Down` / `Bottom` controls in `Latest to Earliest` or `Earliest to Latest` without losing search/focus filters. The underlying order is a manually maintained earliest-to-latest sequence, not a timestamp sort.

## Typical Use
1. Log multi-case pivots, faction escalations, and blocker decisions.
2. Track campaign-level escalations that do not belong to a single case.
3. Open linked events on Campaign Board to map cross-case threads.

## Integrations
- [Campaign Board](CampaignBoard.md) (`campaign-board.html`) – Focus or spawn linked timeline-event nodes.
- [Tools Hub](ToolsHub.md) (`tools.html`) – Launches this page from Campaign Pulse quick actions.
- [Case Timeline](MissionTimeline.md) (`timeline.html`) – Case-scoped companion timeline.

## Related Project
For a less setting-specific version of this toolset, see [5e-unified-roller-base](https://github.com/zengulus-d-and-d-tools/5e-unified-roller-base).
