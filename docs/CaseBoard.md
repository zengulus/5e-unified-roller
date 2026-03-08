# Case Board (`board.html`)

Modular clue board with physics nodes, quick-reference popups, and case-scoped layouts/events.
Case-scoped by design. For campaign-level graphing, use [Campaign Board](CampaignBoard.md) (`campaign-board.html`).

## Core Concepts
- **Case File Meta** – The hero header exposes an editable case name that renders across exports and sessions. Portal, save, and clear buttons live in the same action bar along with pan-mode and background/accent controls.
- **Shared Data** – The board pulls guilds, NPCs, locations, timeline events, requisitions, and cases from `RTF_STORE`, so popups always reflect the latest campaign state without retyping.
- **Live Collaboration** – With Supabase sync configured, case boards use a shared board room (`case:<case_id>`) for live node movement, connection changes, cursors, selection outlines, advisory text-edit locks, and a hero status pill that shows whether the room is live, connecting, or degraded.
- **Save Behavior** – Most node/connection edits save immediately, and the hero `💾 Save` button is always available before major layout changes. `🗑️ Clear` now keeps an `Undo Clear` recovery action on the current browser.

## Building the Web
- **Toolbar** – Drag People, Locations, Clues, and other custom node types straight onto the board. The `Notes` popover now offers `Freeform Note`, `Leads`, and `Ledger` options so you can drop structured note nodes without retyping.
- **Editing Nodes** – Right-click a node and choose `Edit Text` for inline title/body edits. On touch devices, long-press a node to open the same action menu. The edit toolbar now includes sliders for Theory `confidence` and Clue/Theory `reliability` (4-step), while the context menu keeps operational actions like image updates, ledger capture, delete, and "Center & Optimize".
- **Connections** – Drag from a node edge/port to another node to create a link, then use the connection label controls to set text, toggle arrowheads, or remove the link.

## Navigation
- **Pan vs Edit** – The hero `🖐️ Pan` button toggles camera panning mode so you can reposition the view without dragging nodes.
- **Zoom & Focus** – Scroll to zoom anywhere on the infinite canvas. Double-click a node to temporarily isolate its direct connections and reduce visual noise during briefings.
- **Keyboard Shortcuts** – `+` zooms in, `-` zooms out, and `P` toggles pan mode. Shortcuts are ignored while typing in editable fields, and each action shows a brief on-screen alert.

## Case Context
- **Active Case Source** – Board reads the currently active case from Tools Hub campaign scope sequencing (or optional active-case override).
- **Case CRUD Location** – Create, rename, switch, and delete cases from Tools Hub. Board loads/saves against that active case’s board/events scope.
- **Shared Layout** – Node positions are now canonical for the active case board instead of per-browser local-only.

## Cross-Link Entry Points
- **Direct Node Focus** – Opening `board.html?nodeId=<node_id>` centers and flashes an existing node.
- **Store-Backed Links** – Opening `board.html?linkType=<npc|location|timeline-event|requisition|case>&id=<entity_id>` focuses an existing linked node or spawns one from campaign data.
- **Lead Queue + Timeline Bridge** – Lead cards and timeline event actions use those URL params, so board jumps stay deterministic and case-scoped.
- **URL Hygiene** – After resolving a cross-link request, Board clears `nodeId` / `linkType` / `id` from the URL.

## Companion Surface
- **Campaign Board** – `campaign-board.html` shares the same interaction model but reads/writes campaign-level meta board + timeline records.

## Narrative Metadata + Ledger
- **Certainty / Reliability / Confidence** – Clues expose `certainty`; Clues and Theories expose `reliability`; Theories expose `confidence`. Reliability renders as a bar badge and confidence uses the theory confidence bar, both tinted from the active accent.
- **Theory Confidence Bridge** – Snapshot consumers can derive certainty from theory confidence when needed.
- **Add to Ledger** – Context action creates `campaign.ledger` entries with source links (`eventId` or node id), certainty carryover, and case linkage.

## Tips
- Use guild popups to seed consistent iconography/colors that match your campaign; it keeps silhouettes recognizable when the web gets dense.
- Save often (hero action) before trying aggressive experimentation with physics or mass deletes.
- Pair the board with the Clue Generator: the generated Signal/Noise pairs make great node text, and you can color-code the nodes to match those results.

## Related Project
For a less setting-specific version of this toolset, see [5e-unified-roller-base](https://github.com/zengulus-d-and-d-tools/5e-unified-roller-base).
