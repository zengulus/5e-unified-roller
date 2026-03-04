# LLM Tracking Expansion Plan (Items 1-6)

Date: 2026-03-04  
Status: Draft for review

## Execution Progress Log
1. 2026-03-04: Phase 0 (Design Lock) completed.
2. Locked enums:
3. `impactSeverity`: `low|moderate|high|critical`
4. `impactScope`: `local|district|guildwide|citywide`
5. `reliability`: `unknown|rumored|corroborated|verified`
6. `ledger status`: `stable|contested|collapsed|resolved`
7. Ledger storage decision: start with Option A (`campaign.ledger` in `rtf_campaign_core.payload`) and re-evaluate Option B table split after real usage.
8. UI wording/defaults decision: use `Deadline` label in timeline UI and set default certainty to `50` for event/theory/clue unless explicitly set by user flow.
9. Current execution checkpoint: finished through Phase 0; next phase is Phase 1 (Store Foundation).

## 1. Objective
Add six narrative-tracking capabilities to improve LLM-generated prose, consequences, and situational descriptions:

1. Deadlines (`dueAt` / `deadline`)  
2. Event impact typing (`impactSeverity`, `impactScope`)  
3. Explicit impacted entities (`entityImpacts`)  
4. Statement confidence (`certainty` / `reliability`)  
5. Stable-truth Ledger (`ledgerTruths` / `stableFacts`)  
6. Change attribution (`lastChangedBy`, `lastChangedAt`)

This plan includes data model updates, interface placement, migration/backfill, sync updates, docs updates, and a step-by-step execution order.

## 2. Scope
In-scope:

1. `RTF_STORE` schema and sanitizers.
2. Timeline event model and UI.
3. Case Board metadata + context actions.
4. New Ledger feature (page + store path + cross-links).
5. Normalized cloud-sync support in docs and SQL.
6. LLM snapshot/export contract updates.
7. Documentation updates across key tool docs.

Out-of-scope for this pass:

1. Automatic natural-language world simulation generation (this remains an LLM consumer concern).
2. Retrofitting every legacy localStorage-only utility into `RTF_STORE`.

## 3. Proposed Data Contract
Add fields with safe defaults and backward-compatible sanitization.

### 3.1 Timeline Event Fields
Target: `cases.<id>.events[*]`

1. `dueAt: string` (ISO datetime, optional)
2. `impactSeverity: string` (`low|moderate|high|critical`, default `moderate`)
3. `impactScope: string` (`local|district|guildwide|citywide`, default `local`)
4. `entityImpacts: Array<{ type: string, id: string, note: string }>` (optional)
5. `certainty: number` (0-100, default 50)
6. `lastChangedBy: string` (optional)
7. `lastChangedAt: string` (ISO datetime, auto-written on update)

### 3.2 Board/Statement Confidence
Target: `cases.<id>.board.nodes[*].meta`

1. Reuse existing theory confidence (`confidence`) and status fields.
2. Extend non-theory nodes with optional:
3. `certainty: number` (0-100, default 50 for clue/event nodes)
4. `reliability: string` (`unknown|rumored|corroborated|verified`, default `unknown`)
5. `lastChangedBy`, `lastChangedAt`

### 3.3 Ledger Feature Model (New)
Target: `campaign.ledger`

1. `entries: Array<LedgerEntry>`
2. `ui: { filter: string, search: string, sort: string }`

`LedgerEntry`:

1. `id: string`
2. `caseId: string`
3. `statement: string`
4. `status: string` (`stable|contested|collapsed|resolved`)
5. `sourceType: string` (`event|theory|clue|npc|location|manual`)
6. `sourceId: string`
7. `certainty: number` (0-100)
8. `tags: string`
9. `notes: string`
10. `lastChangedBy: string`
11. `lastChangedAt: string`
12. `createdAt: string`

Derived export helpers:

1. `ledgerTruths` = entries where `status === stable`
2. `stableFacts` = compact list from `ledgerTruths` for LLM prompts

### 3.4 Change Attribution on Major Entities
Target entities:

1. Events
2. Board nodes
3. Ledger entries
4. Requisitions
5. Encounters
6. NPCs
7. Locations

Fields:

1. `lastChangedBy`
2. `lastChangedAt`

Author source priority:

1. Sync profile name (if present)
2. Sync user id / instance id
3. Manual local fallback (`local`)

## 4. Interface Placement Plan
### 4.1 Mission Timeline (`timeline.html`)
Placement:

1. Event create/edit form adds:
2. Due date/time input.
3. Severity select.
4. Scope select.
5. Certainty slider or numeric input.
6. Impacted entities editor:
7. Fast-add chips from NPC/Location/Requisition/Event.
8. Optional note per impacted entity.

Card UI:

1. Add pills for Due, Severity, Scope, Certainty.
2. Add impacted-entity badge row.
3. Highlight overdue unresolved events.

### 4.2 Case Board (`board.html`)
Placement:

1. Context menu additions for clue/theory/event nodes:
2. Set certainty.
3. Set reliability.
4. Add to Ledger.

Node popup/card display:

1. Show certainty/reliability indicators in node detail rendering.

### 4.3 New Ledger Tool (`ledger.html`) (Recommended)
Placement:

1. Add Tools Hub card.
2. Add player-nav entry (`js/player-nav.js`) under player pages.
3. Add Hub quick link in hero actions or global status card.

Ledger UI sections:

1. Entry form (manual or linked source).
2. Filterable table/list by case, status, tags, source type.
3. “Stable Truths” compact panel for copy/export to LLM prompt.
4. “Contested / Collapsed” panel for risk narration prompts.

### 4.4 Campaign Hub (`hub.html`)
Placement:

1. New “Narrative Pressure” summary block:
2. Overdue unresolved deadlines count.
3. High-impact unresolved count.
4. Ledger stable vs contested counts.
5. Quick buttons:
6. Open Timeline filtered to overdue.
7. Open Ledger.

## 5. Store + Sync Plan
### 5.1 `RTF_STORE` Changes (`js/store.js`)

1. Extend default campaign state with `ledger`.
2. Add sanitizers for new event fields and ledger entries.
3. Update add/update methods:
4. `addEvent`, `updateEvent` include new fields.
5. New methods:
6. `getLedgerEntries(caseId?)`
7. `addLedgerEntry(entry)`
8. `updateLedgerEntry(id, updates)`
9. `deleteLedgerEntry(id)`
10. Write `lastChangedAt` automatically on mutating actions.
11. Set `lastChangedBy` from sync profile/instance when available.

### 5.2 Normalized Sync Mapping
Option A (fastest): keep ledger payload in `rtf_campaign_core.payload.ledger`.  
Option B (better concurrency, recommended): add dedicated `rtf_campaign_ledger` table (row-per-entry).

Recommended path:

1. Implement Option A first for speed.
2. Plan Option B migration if edit contention on Ledger appears.

### 5.3 SQL + Sync Docs

1. Update `docs/SupabaseSyncNormalized.sql`:
2. Add ledger key in core migration payload (Option A).
3. Or add DDL + sync routes for ledger table (Option B).
4. Update `docs/SupabaseSyncNormalized.md` scope mapping.
5. Update conflict/resolution notes to include new scopes.

## 6. LLM Snapshot/Export Plan
Add exporter contract update (`rtf_llm_snapshot_v2`):

1. Include deadlines, severity, scope, certainty, entity impacts.
2. Include `stableFacts` and contested ledger entries.
3. Include `lastChangedBy`/`lastChangedAt` for narrative reliability.
4. Include derived urgency buckets:
5. `overdue_now`
6. `high_impact_open`
7. `low_certainty_high_impact`

## 7. Documentation Update Plan
Update these docs:

1. `README.md`:
2. Add Ledger tool row if `ledger.html` is added.
3. Mention expanded narrative tracking fields in campaign stack.
4. `docs/MissionTimeline.md`:
5. Document new event fields and their GM usage.
6. `docs/CaseBoard.md`:
7. Document certainty/reliability actions and Ledger linking.
8. `docs/CampaignHub.md`:
9. Document Narrative Pressure summary and quick links.
10. `docs/ToolsHub.md`:
11. Add Ledger card and workflow note.
12. New `docs/Ledger.md`:
13. Define Ledger intent, statuses, and GM workflow.
14. `docs/SupabaseSyncNormalized.md` + `.sql`:
15. Add schema/scope references for new fields and ledger storage.

## 8. Step-by-Step Execution Checklist
### Phase 0: Design Lock

- [x] Confirm enum values for `impactSeverity`, `impactScope`, `reliability`, `ledger status`.
- [x] Confirm whether Ledger starts in core payload (Option A) or new table (Option B).
- [x] Confirm UI wording and default certainty values.

### Phase 1: Store Foundation

- [ ] Add `campaign.ledger` default state and sanitizers.
- [ ] Extend event sanitization with fields 1-4 and 6.
- [ ] Add ledger CRUD methods to `RTF_STORE`.
- [ ] Add attribution helpers (`lastChangedBy`, `lastChangedAt`) for target entities.
- [ ] Backfill defaults for existing loaded data.

### Phase 2: Timeline UI + Logic

- [ ] Add new form controls and edit inputs.
- [ ] Render new pills/sections in event cards.
- [ ] Implement impacted-entity selector and serialization.
- [ ] Add overdue/high-impact visual treatment.
- [ ] Ensure save scopes remain granular for sync.

### Phase 3: Board Integration

- [ ] Add certainty/reliability context menu actions for relevant node types.
- [ ] Persist new node metadata fields.
- [ ] Add “Add to Ledger” action for node-driven truth capture.
- [ ] Ensure linked source ids are included in generated ledger entries.

### Phase 4: Ledger Feature (New)

- [ ] Create `ledger.html`, `js/ledger.js`, `css/ledger.css`.
- [ ] Implement list, filters, create/edit/delete.
- [ ] Add “Stable Truths” export panel.
- [ ] Add cross-links back to board/timeline source entries.

### Phase 5: Navigation + Placement

- [ ] Add Ledger card in `tools.html`.
- [ ] Add Ledger entry in `js/player-nav.js`.
- [ ] Add Hub summary block + quick links.
- [ ] Validate desktop/mobile layout behavior.

### Phase 6: Sync + SQL + Migration

- [ ] Update normalized sync scopes and writes in `js/store.js`.
- [ ] Update SQL migration script and docs.
- [ ] Validate local-only mode and synced mode behavior.
- [ ] Validate conflict handling with concurrent edits.

### Phase 7: LLM Snapshot v2

- [ ] Extend snapshot builder with new fields and derived signals.
- [ ] Add compact/full output mode updates.
- [ ] Validate snapshot readability and prompt token size.

### Phase 8: Documentation

- [ ] Update README component table and usage notes.
- [ ] Update Timeline, Board, Hub, ToolsHub docs.
- [ ] Add `docs/Ledger.md`.
- [ ] Update Supabase normalized docs and SQL notes.

### Phase 9: QA + Release

- [ ] Regression test legacy data import.
- [ ] Regression test case switching behavior.
- [ ] Regression test board-to-timeline and board-to-ledger links.
- [ ] Regression test mobile interactions for Timeline/Board/Ledger.
- [ ] Verify export/import round trip includes new fields.
- [ ] Verify no breaking changes in non-campaign tools.

## 9. Acceptance Criteria

1. Existing campaigns load without migration errors.
2. New fields are editable, persisted, exported, and synced.
3. Ledger supports manual and linked entries.
4. LLM snapshot includes stable facts, deadlines, impact metadata, and attribution.
5. Docs reflect all new user workflows and storage mappings.

## 10. Risks and Mitigations

1. Risk: Timeline form bloat.
2. Mitigation: collapsible “Advanced Impact” section.
3. Risk: Sync conflicts on ledger-heavy sessions.
4. Mitigation: start with scoped writes + consider table split later.
5. Risk: Metadata inconsistency across tools.
6. Mitigation: central sanitizer + shared enums/constants in one module.

## 11. Design Lock Decisions (Phase 0 Resolved)

1. `dueAt` UI input: datetime (`datetime-local`) with ISO storage.
2. Certainty default: `50` for events/theories/clues.
3. Ledger scope: campaign-wide storage with case linkage via `caseId` on each entry.
4. Attribution visibility: `lastChangedBy`/`lastChangedAt` included in snapshot and available in GM-facing views by default; player views may hide later as presentation-only policy.

## 12. Snapshot Contract Appendix (`rtf_llm_snapshot_v2`)
This section defines the complete snapshot contract so implementation and prompt consumers stay aligned.

### 12.1 Required Baseline (Always Included)

| Path | Type | Required | Notes |
|---|---|---|---|
| `schema` | string | Yes | `rtf_llm_snapshot_v2` |
| `generatedAt` | string (ISO) | Yes | Snapshot generation timestamp |
| `source` | object | Yes | Snapshot metadata (`appVersion`, `mode`, `activeCaseId`) |
| `campaign` | object | Yes | Core campaign layer |
| `campaign.heat` | number | Yes | 0-6 |
| `campaign.cognitiveRisk` | number | Yes | 0-6 |
| `campaign.rep` | object | Yes | Guild/faction rep map |
| `campaign.caseTemplate` | object | Yes | `title`, `guilds`, `goal`, `clock`, `obstacles`, `setPiece` |
| `cases` | object | Yes | Case context wrapper |
| `cases.activeCaseId` | string | Yes | Active case id |
| `cases.items` | array | Yes | Every case summary |
| `cases.items[].id` | string | Yes | Case id |
| `cases.items[].name` | string | Yes | Case name |
| `cases.items[].events` | array | Yes | Case events (full in `full`, summarized in `compact`) |
| `cases.items[].boardSummary` | object | Yes | Node/connection summary; theory summary |
| `entities` | object | Yes | Shared entity collections |
| `entities.players` | array | Yes | Current roster |
| `entities.npcs` | array | Yes | Campaign NPCs |
| `entities.locations` | array | Yes | Campaign locations |
| `entities.requisitions` | array | Yes | Requisition state |
| `entities.encounters` | array | Yes | Encounter recipes |
| `signals` | object | Yes | Derived narrative signals |
| `signals.worldPressure` | array | Yes | Heat/Cognitive risk derived pressure |
| `signals.openThreads` | array | Yes | High-priority unresolved threads |
| `signals.immediateComplications` | array | Yes | Near-term complications |
| `llmHints` | object | Yes | Prompt framing defaults |

### 12.2 New Additions (Items 1-6) in Snapshot

| Path | Type | Required | Default |
|---|---|---|---|
| `cases.items[].events[].dueAt` | string (ISO) | No | `""` |
| `cases.items[].events[].impactSeverity` | string | Yes (normalized) | `moderate` |
| `cases.items[].events[].impactScope` | string | Yes (normalized) | `local` |
| `cases.items[].events[].entityImpacts` | array | No | `[]` |
| `cases.items[].events[].certainty` | number | Yes (normalized) | `50` |
| `cases.items[].events[].lastChangedBy` | string | No | `""` |
| `cases.items[].events[].lastChangedAt` | string (ISO) | No | `""` |
| `cases.items[].boardSummary.theories[].certainty` | number | Yes (normalized) | `50` |
| `cases.items[].boardSummary.theories[].reliability` | string | Yes (normalized) | `unknown` |
| `cases.items[].boardSummary.theories[].lastChangedBy` | string | No | `""` |
| `cases.items[].boardSummary.theories[].lastChangedAt` | string (ISO) | No | `""` |
| `ledger` | object | Yes | `{ entries: [], stableFacts: [] }` |
| `ledger.entries[]` | array entry | No | n/a |
| `ledger.stableFacts[]` | array | Yes | `[]` |
| `attributionSummary` | object | Yes | Generated from `lastChanged*` fields |

### 12.3 Sidecar Inclusion Rules (Non-RTF_STORE Sources)
Include these in snapshot under `sidecar` when available:

| Source | Storage Key | Snapshot Path | Inclusion Rule |
|---|---|---|---|
| Lead Queue | `rtf_lead_queue_v1` | `sidecar.leadsByCase` | Include always; sanitize per case |
| Prep/Procedure | `rtf_prep_procedure_state_v1` | `sidecar.prepProcedure` | Include always |
| Generic Clocks | `rtf_clocks_page_v1` | `sidecar.clocks` | Include in `full`; include summary in `compact` |
| Timeline auto-heat flag | `rtf_timeline_auto_heat` | `sidecar.timelineAutoHeatSync` | Include always |

If sidecar keys are missing, snapshot includes empty/default containers instead of omitting paths.

### 12.4 Optional Modules Policy
Optional modules are excluded by default in `compact` and opt-in in `full` via flags.

| Module | Source | Flag | Default |
|---|---|---|---|
| GM Tracker State | `gmDashboardData` | `includeGM` | `false` |
| Character Sheet Bundle | `unifiedSheetData.json` | `includeSheets` | `false` |

Rules:

1. If `includeGM` is false, omit `optional.gm`.
2. If `includeSheets` is false, omit `optional.sheets`.
3. If enabled but missing data, include object with `available: false` and empty arrays.

### 12.5 Compact vs Full Inclusion Matrix

| Section | Compact | Full |
|---|---|---|
| Campaign core (`heat`, `cognitiveRisk`, `rep`, case template) | Full | Full |
| Cases list + active case id | Full | Full |
| Events | Last 25 per case + unresolved priority | Full case event history |
| Board data | Aggregated summary only | Summary + selected node/theory detail |
| Entities (NPC/location/requisition/encounter/player) | Summarized key fields | Full sanitized records |
| Ledger | Stable + contested summaries | Full ledger entries + derived stable facts |
| Sidecar leads | Top unresolved + score summary | Full lead records by case |
| Prep/Procedure | Full current state | Full current state |
| Generic clocks | Aggregated completion view | Full clocks array |
| Attribution fields (`lastChanged*`) | For active case + overdue items | For all included records |
| Optional GM/Sheets | Off by default | Off by default (opt-in) |

### 12.6 Field Normalization Rules

1. Missing enums normalize to defaults.
2. Numeric certainty clamps to `0-100`.
3. Invalid dates become empty strings (not dropped).
4. Unknown entity references in `entityImpacts` are retained with a `missingRef: true` marker in `full`.
5. All arrays exist even when empty.

### 12.7 Example Snapshot (Compact)
```json
{
  "schema": "rtf_llm_snapshot_v2",
  "generatedAt": "2026-03-04T20:10:00.000Z",
  "source": {
    "mode": "compact",
    "activeCaseId": "case_primary",
    "appVersion": "local-dev"
  },
  "campaign": {
    "heat": 4,
    "cognitiveRisk": 2,
    "rep": {
      "Azorius": -1,
      "Boros": 1
    },
    "caseTemplate": {
      "title": "Guild Archive Breach",
      "guilds": "Azorius, Dimir",
      "goal": "Recover redacted warrants",
      "clock": "2/4/6 fallout beats",
      "obstacles": "Jurisdiction lockouts",
      "setPiece": "Records vault collapse window"
    }
  },
  "cases": {
    "activeCaseId": "case_primary",
    "items": [
      {
        "id": "case_primary",
        "name": "Primary Case",
        "events": [
          {
            "id": "event_01",
            "title": "Archive Alarm Triggered",
            "resolved": false,
            "heatDelta": "+1",
            "dueAt": "2026-03-05T03:00:00.000Z",
            "impactSeverity": "high",
            "impactScope": "district",
            "entityImpacts": [
              { "type": "location", "id": "loc_archive", "note": "Checkpoint lockdown" }
            ],
            "certainty": 70,
            "lastChangedBy": "DM Console",
            "lastChangedAt": "2026-03-04T19:50:00.000Z"
          }
        ],
        "boardSummary": {
          "nodes": 22,
          "connections": 31,
          "theories": [
            {
              "id": "node_theory_3",
              "title": "Inside Clerk Altered Warrants",
              "certainty": 62,
              "reliability": "corroborated",
              "status": "unproven"
            }
          ]
        }
      }
    ]
  },
  "entities": {
    "players": [],
    "npcs": [],
    "locations": [],
    "requisitions": [],
    "encounters": []
  },
  "ledger": {
    "entries": [],
    "stableFacts": [
      "Archive breach occurred during second watch."
    ]
  },
  "sidecar": {
    "leadsByCase": {},
    "prepProcedure": {
      "prep": { "filled": 2, "total": 4 },
      "procedure": { "filled": 1, "total": 4 },
      "tokens": { "count": 1, "max": 6 }
    },
    "clocks": [],
    "timelineAutoHeatSync": true
  },
  "signals": {
    "worldPressure": ["Heat in complication range (3-5)."],
    "immediateComplications": ["Overdue or near-due unresolved events exist."],
    "openThreads": ["Archive Alarm Triggered"]
  },
  "llmHints": {
    "writingGoal": "prose consequences + situational descriptions",
    "focusWindow": "next scene to next session"
  }
}
```
