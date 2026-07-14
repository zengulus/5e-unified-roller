# Separate Light VTT Roadmap

## Summary
- Build a dedicated `vtt.html` that reuses board collaboration/storage internals but does not add tactical UI to `board.html`.
- Treat the VTT as desktop-only. Mobile-width browsers show an unsupported notice instead of the table interface.
- Keep the VTT case-scoped in v1.
- Add a separate case-scoped VTT payload in shared store rather than storing tactical state inside board nodes/connections.
- Keep a local-only `DM / Player` toggle. Both roles share the same synced active scene; Player mode hides DM tooling but still allows enemy-cone preview, local ruler use, and read-only initiative visibility.
- Use separate scenes with a shared `Load Scene` action that switches the active scene for everyone, while zoom/pan stay local-only.
- Keep initiative case-scoped so order, round, active turn, per-entry toggles, and DM-only inspection details persist between dialogue scenes, chaos scenes, and map changes.
- Make VTT initiative the canonical combat state for the case, with Character Sheet submissions feeding it rather than living only inside the sheet.
- Keep enemy vision token-attached: enemy tokens own facing/arc/range settings, and previews render from the token on hover.
- Add adjustable per-scene grid sizing and offset so the grid can align cleanly to the background map image.
- Add a local-only distance ruler against the grid.

## Key Changes
- Add a separate case-scoped VTT payload in shared store. Do not store tactical state inside board nodes/connections.
- Prefer the existing shared store/normalized sync path for v1/v2. Only add a dedicated VTT room transport if multi-browser token drag latency proves it necessary.
- Scene model:

```json
{
  "activeSceneId": "scene_1",
  "scenes": [
    {
      "id": "scene_1",
      "name": "Warehouse",
      "mapImageUrl": "",
      "grid": {
        "cellPx": 70,
        "offsetX": 0,
        "offsetY": 0,
        "cellDistance": 5
      },
      "tokens": [],
      "fog": []
    }
  ],
  "initiative": {
    "entries": [],
    "round": 1,
    "activeEntryId": ""
  }
}
```

- Scene rules:
  - `Load Scene` switches shared `activeSceneId` and therefore swaps the whole shared tactical scene for everyone
  - zoom, pan, and transient selection state stay local-only
  - scene duplication copies map, grid, tokens, and fog state
- Initiative rules:
  - initiative is case-scoped, not scene-scoped
  - VTT initiative is the canonical initiative/combat state for the case
  - order, round, active turn, and per-entry toggles persist across scene loads
  - the initiative rail is visible in both DM and Player mode
  - only DM mode can edit initiative order and admin controls
  - DM mode can click an initiative entry to reveal passive perception, AC, and defences when present
  - Player mode never exposes DM-only initiative inspection details
  - initiative entries may remain on the rail even when their linked token is not on the currently loaded scene
- Sheet initiative rules:
  - preserve the existing Character Sheet initiative roll UX while routing submissions into the canonical VTT initiative workflow
  - the VTT initiative rail should accept sheet-driven initiative submissions, update matching linked entries when possible, and store passive perception, AC, and defences when available
  - Session Tracker should align to VTT initiative rather than owning separate canonical initiative state
  - sheet interoperability in v1 is initiative-submission focused, not full sheet-state sync
- Token model:

```json
{
  "id": "token_x",
  "label": "Goblin 1",
  "side": "enemy",
  "imageUrl": "",
  "x": 0,
  "y": 0,
  "w": 1,
  "h": 1,
  "sourceType": "",
  "sourceId": "",
  "hpCurrent": null,
  "hpMax": null,
  "ac": null,
  "conditions": [],
  "hidden": false,
  "stealthDc": null,
  "vision": {
    "enabled": true,
    "facingDeg": 0,
    "arcDeg": 90,
    "baseRangeCells": 6,
    "passivePerception": 10
  }
}
```

- `side` values: `player`, `ally`, `enemy`, `neutral`.
- Image rules:
  - token image priority = token override, linked entity image, fallback initials/side badge
  - NPCs seed immediately from linked roster images; players fall back cleanly unless optional player portraits are added
  - shared-safe image sources in v1 are `https:` URLs and small inline `data:image/...` payloads
  - `blob:` URLs may be used for local previews but should not be relied on for shared synced tokens
- Grid rules:
  - grid is stored per scene
  - v1 grid stays square
  - DM can change cell size and nudge X/Y offset for background alignment
  - add a simple calibration flow so map alignment is faster than hand-entering values
  - no grid rotation, perspective correction, or non-square cells in v1
- Vision UI rules:
  - only `enemy` tokens expose editable vision settings
  - vision cones are token-attached, not independent placeable scene objects
  - cones move and rotate with their parent token
  - both DM and Player mode can preview enemy cones
  - only DM mode can edit enemy vision settings
- Vision preview rules:
  - preview is local-only rendering
  - preview triggers on hover
  - no wall or LOS blocking in v1
  - effective range in cells = `baseRangeCells + max(0, floor((passivePerception - 10) / 2))`
  - tokens inside the cone compare enemy `passivePerception` against target `stealthDc`
  - if `stealthDc` is `null`, the target is treated as normally visible
  - preview may visually mark targets as `detected` or `unseen`, but does not mutate shared state
  - `hidden` DM-only tokens are never auto-revealed to Player mode by cone preview
- Role toggle rules:
  - role selection is local-only UI state
  - Player mode hides scene CRUD, fog editing, hidden-token controls, and initiative admin controls
  - Player mode still permits enemy-cone preview and local ruler use, and still shows read-only initiative order and active turn

## Phase 1 — Zero To MVP
- Create `vtt.html` with map layer, grid layer, token layer, and local `DM / Player` toggle.
- Add VTT store state, sanitization, save/load, and realtime sync using shared board-style infrastructure.
- Add a scene container with one default shared active scene and local zoom/pan state.
- Add a basic case-level synced initiative rail with:
  - initiative ordering
  - round counter
  - active turn marker
  - Player-mode read-only visibility
- Preserve the existing Character Sheet initiative roll flow while targeting VTT initiative as the canonical destination.
- Add one active scene with:
  - map image URL
  - adjustable grid cell size and offset
  - simple grid calibration/nudge workflow for map alignment
  - token create/delete
  - token drag and snap
  - token resize `1x1` and `2x2`
  - token label, side, image, HP, AC, and conditions
- Add token seeding from players and NPCs already in `RTF_STORE`, with linked images when available and initials fallback when not.
- MVP acceptance:
  - VTT persists independently of `board.html`
  - two browsers see token create/move/edit in realtime
  - initiative order, round, and active turn sync across browsers
  - old campaign data loads without migration errors
  - grid alignment settings persist safely per scene
  - `board.html` behavior is unchanged

## Phase 2 — Useful Table Version
- Add scene management: create, rename, duplicate, delete, load, and switch active scene.
- Shared scene loading rules:
  - loading a scene swaps the shared map, grid, tokens, and fog for all connected browsers
  - case-level initiative state persists unchanged across scene loads
  - viewport remains local-only
- Add encounter-ready token workflow:
  - spawn from players, NPCs, and encounter records
  - auto-name duplicates
  - default token image from linked entity image
  - default `side` for encounter spawns is `enemy`
- Expand the synced initiative rail:
  - initiative ordering
  - round counter
  - active turn marker
  - reaction and concentration toggles
  - HP edits sync between token inspector and initiative rail
  - DM-mode click/tap reveal for passive perception, AC, and defences
  - quick add/remove/reorder without requiring the current scene to contain every participant
- Add Character Sheet initiative submission interoperability:
  - initiative rolled in the Character Sheet should enqueue or update the canonical VTT initiative workflow
  - passive perception, AC, and defences should pass through into matching initiative entries when available
  - matching linked entries should update in place rather than duplicating unnecessarily
  - align Session Tracker behavior with the VTT initiative rail without treating Tracker as the canonical source
- Add visibility workflow:
  - `hidden` for DM-hidden tokens
  - `stealthDc` for stealth/detection checks against enemy cones
  - Player mode suppresses `hidden` tokens
- Add local-only distance ruler against grid:
  - snap-to-grid measurement by default
  - optional free-measure mode
  - desktop pointer trigger
- Useful-version acceptance:
  - scene loads/switches sync across browsers
  - initiative and turn state persist across scene loads and sync across browsers
  - Player mode shows initiative read-only while hiding initiative admin controls
  - Player mode hides DM controls cleanly
  - side assignment and hidden-token behavior work predictably
  - ruler never mutates shared state

## Phase 3 — Polished Shared Table
- Add synced rectangular fog-of-war masks with DM-only editing.
- Add enemy-vision configuration in the token inspector and token-attached handle UX:
  - enable/disable vision
  - facing angle
  - cone width
  - base range
  - passive perception
  - facing/cone controls stay attached to the token and move with it
- Add enemy-cone preview behavior:
  - desktop hover shows the stored cone for enemy tokens
  - preview highlights targets in range and marks stealth pass/fail against `stealthDc`
  - preview clears on hover exit
- Add docs:
  - VTT user doc
  - README/docs index entry
  - Supabase sync note for VTT payload/room behavior
- Polished acceptance:
  - fog persists and syncs
  - Player mode cleanly hides DM tooling
  - enemy-cone preview works on desktop hover
  - token-attached cone settings persist and follow token movement
  - passive perception correctly affects range and stealth detection
  - VTT recovery path works without affecting board recovery

## Test Plan
- Load existing campaigns with no VTT payload and verify default VTT state and default scene are created safely.
- Open the same case VTT in two browsers and verify scene CRUD/load, token movement, HP edits, initiative edits, and fog changes sync.
- Verify `DM / Player` toggle is local-only and does not alter shared data.
- Verify scene loading:
  - changing `activeSceneId` swaps the shared tactical scene in both browsers
  - zoom/pan remain local-only
- Verify initiative persistence:
  - initiative order, round, active turn, and per-entry toggles survive scene loads
  - DM-only initiative inspection details survive scene loads
  - Player mode shows the rail read-only
  - scene duplication does not clone or reset case-level initiative state
- Verify sheet initiative interoperability:
  - initiative rolled from the Character Sheet reaches the canonical VTT initiative workflow
  - passive perception, AC, and defences populate or refresh on matching initiative entries when supported
  - matching linked initiative entries update in place when supported
  - sheet initiative submission does not require full sheet-state sync
  - Session Tracker aligns to VTT initiative without becoming the source of truth
- Verify grid alignment:
  - cell size and offset persist
  - calibrated grid still lines up after reload and sync
- Verify `hidden` tokens:
  - visible in DM mode
  - suppressed in Player mode
  - not auto-revealed by enemy-cone preview
- Verify token images:
  - linked NPC images seed correctly
  - player/NPC tokens fall back cleanly when no image exists
  - shared scenes do not depend on local-only `blob:` URLs
- Verify local ruler:
  - works against the configured grid
  - stays local-only
- Verify DM-only initiative inspection:
  - DM mode can click an initiative entry to reveal passive perception, AC, and defences when present
  - Player mode cannot see DM-only initiative inspection details
- Verify enemy-cone preview:
  - only activates on `enemy` tokens
  - uses the fixed passive-perception range formula
  - marks `stealthDc` success/failure correctly
  - follows token facing and movement
  - works on hover
- Verify mobile-width browsers show the unsupported notice and do not expose the VTT interface.
- Verify `board.html` remains unchanged before and after VTT work.

## Assumptions And Defaults
- VTT is case-scoped only in v1.
- `board.html` remains investigation-only.
- DM/Player is a visibility toggle, not a permissions system.
- Shared active scene is synced; zoom/pan/selection/ruler state are local-only.
- Initiative is case-scoped, canonical for combat state, and persists across scene loads; scenes do not own initiative state.
- Character Sheet interoperability in v1 is limited to initiative submission/handoff, not full sheet sync.
- Enemy vision is token-attached persistent config plus local preview/adjudication aid, not a separate placeable object or persistent reveal system.
- Grid is square with size/offset calibration in v1; no rotation or perspective correction.
- No upload backend, no separate player-safe payload, and no wall geometry system.
- Token images rely on token overrides or linked entity images in v1, with fallback badges when no image exists.
- Fog uses rectangular masks only to keep the polished scope constrained.
