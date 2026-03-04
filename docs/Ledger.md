# Ledger (`ledger.html`)

Campaign fact register for pinning immutable truths your table has confirmed.

## Layout
- **Add Ledger Entry** – Create entries with statement, case, fact type, optional linked record, tags, and notes.
- **Filter + Sort** – Search by statement/tags/notes/source and filter by case/source type.
- **Entry Cards** – Inline edit and delete controls for every field, plus quick source jumps back to Timeline or Board when supported.
- **Case Fact Digest** – Aggregates pinned facts with copy/export actions for prep and briefing handoffs.

## Source Linking
- **Timeline Event** – `sourceType=event`, `sourceId=<event_id>` enables Timeline and Board jumps.
- **Board Theory/Clue** – `sourceType=theory|clue`, `sourceId=<node_id>` enables Board node focus jump.
- **Manual Provenance** – Use `sourceType=other` when the evidence came from witness testimony, site observation, document review, or other non-linkable channels. Capture specifics in `notes`/`tags`.
- **Board Link Picker** – Linked provenance pickers include timeline events and all current case board nodes (`node_...`). For existing entries, their own spawned ledger note node is excluded from selection.

## Integrations
- **Case Board** – Context menu action `Add to Ledger` creates source-linked entries from clue/theory/event nodes.
- **Campaign Hub** – Narrative Pressure block surfaces pinned facts vs review queue counts.
- **LLM Snapshot** – `RTF_STORE.buildLLMSnapshot()` includes ledger entries and `stableFacts`.

## Tips
- Keep statements short and atomic; split compound claims into separate entries.
- If a statement is no longer immutable, remove or rewrite the pin so the ledger remains trustworthy.
- Use tags (`witness`, `record`, `theory`) to quickly prep references and source checks.
