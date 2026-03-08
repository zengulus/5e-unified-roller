# Campaign Board (`campaign-board.html`)

Campaign-level investigation board for cross-case references, scope artifacts, and long-arc thread mapping.

## Scope
- Reads/writes campaign meta board state (`campaign.meta.board`) instead of case boards.
- Uses the shared board room `campaign:meta` for live multiplayer layout, cursors, selections, advisory text-edit locks, and a hero status pill that surfaces live/degraded board state.
- Timeline-event linking uses campaign meta events (`campaign.meta.events`).
- Supports the same node, connection, popup, and context-menu tooling as Case Board, including touch long-press actions, `Undo Clear`, and the Cases object popup for quick case-reference nodes.

## Typical Use
1. Create case-reference nodes for scoped investigations and sequence planning.
2. Connect campaign-level events, NPC pressure, and requisition signals across cases.
3. Maintain strategic graph state separately from case execution boards.

## Integrations
- [Campaign Timeline](CampaignTimeline.md) (`campaign-timeline.html`) – Linked event nodes resolve against campaign meta events.
- [Tools Hub](ToolsHub.md) (`tools.html`) – Campaign Pulse quick actions include direct launch paths.
- [Case Board](CaseBoard.md) (`board.html`) – Case-scoped companion board for tactical detail.

## Related Project
For a less setting-specific version of this toolset, see [5e-unified-roller-base](https://github.com/zengulus-d-and-d-tools/5e-unified-roller-base).
