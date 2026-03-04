# Ledger (`ledger.html`)

Campaign truth register for separating what is stable from what is disputed or collapsed.

## Layout
- **Add Ledger Entry** – Create entries with statement, case, status, provenance type, filterable link picker, certainty, tags, and notes.
- **Filter + Sort** – Search by statement/tags/notes/source and filter by case/status/source type.
- **Entry Cards** – Inline edit and delete controls for every field, plus quick source jumps back to Timeline or Board when supported.
- **Stable Truths Panel** – Aggregates stable facts with copy/export actions for prompt prep plus a contested/collapsed list for complication framing.

## Status Model
- `stable` – Treated as currently reliable in-world truth.
- `contested` – Active dispute; evidence supports multiple interpretations.
- `collapsed` – Prior truth has broken under new evidence or narrative contradiction.
- `resolved` – Closed question; kept for history/audit.

## Source Linking
- **Timeline Event** – `sourceType=event`, `sourceId=<event_id>` enables Timeline and Board jumps.
- **Board Theory/Clue** – `sourceType=theory|clue`, `sourceId=<node_id>` enables Board node focus jump.
- **Manual Provenance** – Use `sourceType=manual` when the evidence came from witness testimony, site observation, document review, or other non-linkable channels. Capture specifics in `notes`/`tags`.
- **Board Link Picker** – Linked provenance pickers include timeline events and all current case board nodes (`node_...`). For existing entries, their own spawned ledger note node is excluded from selection.

## Integrations
- **Case Board** – Context menu action `Add to Ledger` creates source-linked entries from clue/theory/event nodes.
- **Campaign Hub** – Narrative Pressure block surfaces stable vs contested/collapsed counts.
- **LLM Snapshot** – `RTF_STORE.buildLLMSnapshot()` includes ledger entries and `stableFacts`.

## Tips
- Keep statements short and atomic; split compound claims into separate entries.
- Move stale assumptions to `collapsed` rather than deleting to preserve narrative audit history.
- Use certainty + tags (`witness`, `record`, `theory`) to quickly prep “what can break next” prompts.
