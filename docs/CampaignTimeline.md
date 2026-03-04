# Campaign Timeline (`campaign-timeline.html`)

Campaign-level timeline for cross-case beats, blockers, and strategic updates.

## Scope
- Uses campaign meta events (`campaign.meta.events`) instead of case events.
- Shares the same event model as Mission Timeline (heat delta, deadlines, severity/scope, certainty, impacted entities, tags, notes).
- Board links target `campaign-board.html` so event-node cross-links stay in campaign scope.
- Lead Queue actions are intentionally omitted here; lead triage stays case-scoped in `timeline.html`/`leads.html`.

## Typical Use
1. Log multi-case pivots, faction escalations, and blocker decisions.
2. Track campaign-level deadlines that do not belong to a single case.
3. Open linked events on Campaign Board to map cross-case threads.

## Integrations
- [Campaign Board](CampaignBoard.md) (`campaign-board.html`) – Focus or spawn linked timeline-event nodes.
- [Tools Hub](ToolsHub.md) (`tools.html`) – Launches this page from Campaign Pulse quick actions.
- [Mission Timeline](MissionTimeline.md) (`timeline.html`) – Case-scoped companion timeline.

## Related Project
For a less setting-specific version of this toolset, see [5e-unified-roller-base](https://github.com/zengulus-d-and-d-tools/5e-unified-roller-base).
