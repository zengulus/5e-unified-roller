# Architecture and State Authority

This repository is the private Ravnica Task Force campaign platform. It remains dependency-light, but it is not a single application: several page families own different state.

## Authoritative State Map

| Subsystem | Authoritative state | Local persistence | Cloud/live transport | Important rule |
|---|---|---|---|---|
| Character sheet | The selected character inside `unifiedSheetData.json` | Local Storage in the player's browser | None by default; it publishes selected summaries/actions into shared systems | The sheet is player/browser-owned. A roster link is a projection, not a second character-sheet authority. |
| NPC roster | `RTF_STORE.campaign.npcs` | IndexedDB row store with a defensive Local Storage mirror | Supabase row-normalized v2 tables when configured | Roster edits go through `RTF_STORE`; do not write a second roster key. |
| GM tracker | `gmDashboardData` for presets, log and the current local mirror | Local Storage | Can pull from VTT and send webhooks | The tracker is not canonical for shared combat. Pulling VTT initiative replaces its local encounter mirror. |
| VTT | Active case VTT state, especially case-scoped initiative | `RTF_STORE`/IndexedDB snapshot and room caches | Yjs room `vtt:case:<case_id>` over the Render relay when configured; Supabase room checkpoints for recovery | VTT initiative is canonical combat state. In relay mode the GM seeds a cold room. |
| Campaign store | `RTF_STORE` campaign, cases, entities, HQ and metadata | IndexedDB row stores; `ravnica_unified_v1` is a compatibility/backup mirror | Supabase row-normalized v2 sync | First cloud connection pulls remote state. Subsequent entity writes use scoped rows and revision/conflict handling. |
| Board collaboration | Yjs document for the active board room while live; persisted room checkpoint for recovery | IndexedDB Yjs room cache plus `RTF_STORE` snapshot projection | `campaign:meta` or `case:<case_id>` room via relay/Supabase collaboration | Live room state owns collaborative layout. Campaign-store board data is a mirror/fallback, not a competing live authority. |

## Runtime Layers

1. Page controllers (`js/index.js`, `js/gm.js`, `js/roster.js`, `js/vtt.js`, and peers) bind DOM interactions and compose feature modules.
2. Shared domain modules own deterministic rules. Dice parsing/rolling lives in `js/dice.js`; character calculations live in `js/character-model.js`; legacy sheet conversion lives in `js/data-migrations.js`. The VTT composition root is `js/vtt.js`: geometry/fog, sheet and monster rules, roll requests, proximity prompts, collaboration lifecycle, stage rendering, and domain action routing live in the focused `js/vtt-*.js` modules beside it.
3. `js/store.js` owns campaign entities, local row persistence, scope tracking, conflict handling, and cloud orchestration. `js/supabase-transport.js` separately owns Supabase library loading and shared client lifecycle.
4. `js/board-collab.js` and `js/vtt-collab.js` own Yjs documents and collaboration sessions. `js/collab-relay-client.js` is the WebSocket relay transport.
5. `sw.js` provides the application shell cache. `scripts/check-sw-assets.mjs` verifies that every directly referenced entry asset exists in its cache list.

### VTT Feature Boundaries

| Module | Responsibility |
|---|---|
| `js/vtt.js` | Composition, shared snapshot transactions, selection reconciliation, and feature wiring |
| `js/vtt-config.js` | Immutable VTT constants and fresh default snapshot construction |
| `js/vtt-runtime-state.js` | Categorized session, stage, UI, and resource state plus live consumer ports |
| `js/vtt-dom.js` | Validated VTT DOM reference registry |
| `js/vtt-inspector-markup.js` | Token, evidence, and proximity inspector presentation and read-only rendering |
| `js/vtt-session.js` | Collaboration lifecycle, authority changes, status, retry, and room recovery |
| `js/vtt-stage-view.js` | Map viewport, rendering layers, transient effects, and remote token tweening |
| `js/vtt-stage-input.js` | Pointer, touch, wheel, context-menu, and keyboard interaction state |
| `js/vtt-field-router.js` | DOM field decoding and delegation to scene, token, evidence, clock, and initiative mutations |
| `js/vtt-proximity.js` | Trigger schema, candidate selection, persistence, prompt rendering, and resolution |
| `js/vtt-rolls.js` / `js/vtt-rules.js` | Roll/search/request rules and sheet/monster domain rules |
| `js/vtt-geometry.js` / `js/vtt-markup.js` | Deterministic geometry/fog calculations and stateless overlay markup |
| `js/vtt-actions-*.js` | Domain-grouped click command routing for rolls, table tools, scenes, tokens, and initiative |

## Persistence Failure Contract

Character-sheet saves catch JSON serialization and storage-quota failures, keep the in-memory state intact, show a user-facing backup warning, and emit an `rtf-operation-error` event with a structured detail object. Webhook failures include the operation, category, message, and timestamp and never undo the local action. The shared campaign store logs persistence failures separately from sync failures and retains IndexedDB as the primary local row store.

## Security Model

- The repository assumes one trusted campaign group.
- The supplied Supabase policy grants all authenticated users full RTF table access. It is not multi-tenant isolation.
- A bundled anon key is not a secret; a shared-login password in `connect.json` is a credential and must not be committed or shared outside the group.
- Public or multi-group deployment requires campaign-membership RLS, controlled account provisioning, and relay authorization before use.
