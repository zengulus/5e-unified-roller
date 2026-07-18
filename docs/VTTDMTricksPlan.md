# VTT DM Tricks Plan

## Product shape

DM Tricks should be a fast command palette, not another permanent drawer. A wand button in the DM command dock opens a searchable overlay with pinned favourites and context-aware actions. Selecting a trick shows a one-line preview of who and what it will affect; the DM can then run it, cancel it, or undo the last reversible trick.

Every trick should follow the same contract:

1. Resolve its targets from the current selection, encounter scene, or saved preset.
2. Preview the audience and state changes without mutating shared state.
3. Commit all durable changes in one collaboration transaction.
4. Emit transient visual/audio cues separately from the snapshot.
5. Record a compact execution receipt so the DM can undo safe state changes.

Tricks are declarative recipes, never arbitrary JavaScript stored in campaign data.

## Trick set

### 1. Spotlight

Focus the table on a token, initiative entry, map note, or point with a pulse and short caption. Options: DM only, everyone, or selected players; optionally reveal a hidden target at the moment the pulse lands.

- Reuses: pings, centering, token/note visibility, initiative links.
- First version: shared camera request with a five-second pulse and optional reveal.
- Undo: restore visibility; camera movement itself is transient.

### 2. Reinforcements

Deploy a prepared token group around a clicked entry point, reveal it, and insert linked combatants after the current turn or at rolled initiative.

- Reuses: token spawning, scene grid placement, hidden tokens, initiative insertion.
- First version: save a named group and formation, preview ghost positions, then deploy once.
- Undo: remove only tokens and entries created by that execution receipt.

### 3. Dramatic Beat

Send a styled table card such as “The bridge starts to collapse” with optional map ping, clock advance, and GM-only follow-up note.

- Reuses: proximity prompts, clocks, pings, evidence-note formatting.
- First version: caption + audience + optional clock step.
- Later: attach beats to start-turn, round-start, and clock-threshold events.

### 4. Escalation Button

Advance one or more linked clocks and show the consequence text for every threshold crossed. This is the one-click “make the situation worse” control.

- Reuses: clock cadence and description, existing trigger references.
- First version: one primary clock, one optional secondary clock, threshold captions.
- Undo: restore prior segments if no later execution has touched those clocks.

### 5. Curtain Reveal

Publish or hide a prepared set of tokens, notes, clocks, and zones together. Useful for opening a door, exposing an ambush, or changing a room state without hunting through inspectors.

- Reuses: visibility flags and scene object selection.
- First version: named reveal sets with Preview, Reveal, and Hide actions.
- Undo: restore the exact prior visibility of every member.

### 6. Lair Action / Interrupt

Insert a temporary initiative beat now, run it, then return to the interrupted combatant without corrupting round cadence.

- Reuses: canonical initiative and turn automation.
- First version: persistent lair slots at fixed initiative values.
- Later: “Interrupt now” with an explicit return marker and reaction-style once-per-round limits.

### 7. Hazard Pulse

Preview a cone, radius, line, or zone from a token or point, highlight affected tokens, and optionally apply a condition or request a save.

- Reuses: templates, geometry, token conditions, roll requests.
- First version: visual preview plus public save request; condition application remains a confirmed DM action.
- Undo: remove only conditions applied by the trick receipt.

### 8. Secret Check

Request a roll from one or more players while keeping the DC and consequence private. Return a DM summary and an intentionally vague player-facing result.

- Reuses: owner-scoped roll requests and player identity links.
- First version: targeted request, private DC, success/failure beat templates.
- Security requirement: private DCs and consequences must not be serialized into the player-readable room snapshot.

### 9. Cutaway

Temporarily take the table to a prepared scene or image, deliver a beat, then return everyone to the encounter scene and prior focus.

- Reuses: scene switching and encounter-scene ownership.
- First version: explicit Return button and no initiative mutation.
- Guardrail: clocks remain scoped to the encounter scene unless the trick explicitly names another clock.

### 10. Villain Phase

Run a saved sequence such as spotlight villain, show caption, advance doom clock, reveal hazards, and insert a lair action. This is composition of the safe primitives above, not a separate scripting engine.

- First version: ordered steps with preview and stop-on-error.
- Later: branching only on explicit state such as clock threshold or round number.

## Implemented: Black Moon Howl

Black Moon Howl is the first presentation-only meta trick. It replaces visible interface text through a contained overlay, locks the affected client's input, cuts to a black question-and-answer sequence, and then restores the untouched interface.

- DM menu actions: local preview or everyone in the live room.
- Public API: `triggerBlackMoonHowls({ audience: 'all' })`, `triggerBlackMoonHowls({ audience: 'local' })`, and `cancelBlackMoonHowls()`.
- Everyone includes the triggering GM; the sender runs the same synchronized effect locally instead of relying on a relay echo.
- Collaboration: one compact transient event, no Yjs mutation, snapshot, checkpoint, or replay on reconnect.
- Safety: duplicate suppression, synchronous cancellation cleanup, input restoration, original-focus restoration, and automatic cleanup on any presentation error.
- Performance: visible text is measured once, cloned into one contained overlay batch, and replaced through one animation-frame loop without mutating or rerendering the VTT.

## Later: cognitohazard and meta tricks

These are deliberately a late release. They depend on private targeted events, an accessibility opt-out, expiry, and a reliable global kill switch. They should distort the presentation of the table without ever corrupting its canonical clocks, initiative, rolls, or scene data.

### Perception Split

Show different players different labels, captions, map annotations, token appearances, or descriptions for the same moment. The DM gets a truth view plus an audience preview for every variant.

- Example: three players see “EXIT”, one exposed player sees “COME CLOSER”.
- State rule: variants are sent only to their intended recipients; the complete variant set never enters the shared room snapshot.
- Recovery: ending the effect immediately restores the ordinary scene presentation.

### Observer Effect

Let an object react when a particular player inspects, hovers, selects, or repeatedly returns to it. The reaction can be a changed label, a private caption, a subtle pulse, or a new annotation that no one else sees.

- Example: a portrait turns to face only the player who has looked at it three times.
- State rule: observation counters are DM-private exposure state, not hidden fields in player-readable scene data.
- Guardrail: ordinary map interaction continues to work; the effect cannot steal clicks or keyboard focus.

### Phantom State

Render a temporary clock, initiative entry, condition, token, or map mark that looks native to the VTT but is not canonical game state.

- Example: a seven-segment clock named “YOU HAVE NOTICED IT” appears for one player and advances when they open the Combat rail.
- DM view: every phantom is visibly tagged `PHANTOM`; players receive the intended fiction without the tag.
- State rule: phantom clocks never trigger cadence, phantom turns never advance initiative, and phantom conditions never affect rules automation.

### Memory Echo

Replay or subtly vary an earlier caption, ping, note, or scene detail so the table questions whether it has happened before. This is an authored echo, not alteration of logs or roll history.

- Example: a previous NPC warning returns with one sentence changed for an exposed player.
- Guardrail: never rewrite stored chat, dice results, execution receipts, or campaign history.
- Recovery: the DM can reveal the source beat and clear all active echoes.

### Exposure / Contagion

Track DM-private exposure tags that choose which players receive later meta effects. Tricks can add, reduce, or transfer exposure after explicit fictional triggers such as reading a note, entering a zone, or failing a check.

- Example: looking at a sigil adds `marked_by_signal`; later Scene Clock descriptions differ only for marked players.
- State rule: clients receive only the effect currently intended for them, never another player's exposure profile.
- UX: the DM palette shows why each recipient was selected before Run.

### Diegetic Interface Breach

Allow fiction to intrude into VTT chrome through controlled captions, temporary label substitutions, restrained visual drift, or an in-world “system” voice.

- Example: the Open button briefly reads “LET ME IN” after a clock fills.
- Never imitate browser, operating-system, authentication, payment, security, data-loss, or real connection warnings.
- Never hide or disable Leave, accessibility, mute, emergency clear, or DM control surfaces.
- No arbitrary HTML, CSS, scripts, flashing, focus capture, or unbounded animation.

### Cognitohazard effect layer

- Add a `CognitohazardEffectLayer` above map presentation but below essential controls.
- Accept only allowlisted declarative effects: text substitution, annotation, tint, restrained transform, phantom component, pulse, and audio cue.
- Give every effect an ID, exact audience, start time, expiry, intensity tier, reduced-effects fallback, and deterministic seed.
- Keep a persistent DM “Truth View” indicator whenever any player is seeing altered presentation.
- Add `Clear All Effects` as a permanently available DM action and make refresh/reconnect clear expired transient effects automatically.
- Preview each audience variant side by side before execution.
- Do not derive private variants on the player client from a shared secret payload; send only the already-selected variant through targeted transport.

## Integration order

### Foundation

- Add a `TrickExecutionController` with preview, commit, receipt, and undo ports.
- Add a transient targeted-event channel for pulses, captions, camera requests, and previews so effects do not force full snapshot writes.
- Add idempotent execution IDs so reconnects cannot run a trick twice.
- Add audience controls: DM, everyone, or named player owners.
- Add a small execution history showing the last five tricks and whether each is still safely reversible.

### Release 1: high impact, low rules risk

- Spotlight.
- Dramatic Beat.
- Escalation Button.
- Curtain Reveal.
- Pinned favourites in the command palette.

These mostly compose existing visibility, clock, ping, and prompt systems and should ship before tricks that alter initiative or token collections.

### Release 2: encounter control

- Reinforcements.
- Persistent lair-action slots.
- Hazard Pulse with save requests.
- Turn/round/clock trigger attachment for Dramatic Beats.

### Release 3: advanced orchestration

- Safe initiative interrupts with return markers.
- Secret Check after a private targeted transport exists.
- Cutaway.
- Villain Phase composition.

### Release 4: opt-in cognitohazards

- Foundation: targeted private effect transport, DM Truth View, reduced-effects preference, expiry, and Clear All Effects.
- First wave: Perception Split, Observer Effect, and Memory Echo.
- Second wave: Phantom State and DM-private Exposure tags.
- Final wave: Diegetic Interface Breach and cognitohazard steps inside Villain Phase recipes.

This release is campaign opt-in. Individual players can select Full, Reduced, or Off without exposing that preference to other players.

## Data and collaboration boundaries

- Store reusable table-safe recipes as sanitized structured data with stable target references.
- Keep DM-private text, DCs, and unrevealed recipe details outside the shared player-readable Yjs snapshot. Hiding them in UI is not secrecy.
- Send transient spectacle as compact room events; persist only durable outcomes such as visibility, clock segments, conditions, tokens, and initiative entries.
- Commit a trick's durable outcomes in one Yjs transaction to prevent peers seeing half-applied scenes.
- Receipts store before/after values only for fields touched by the trick. Undo must refuse if a later edit changed one of those fields.

## UX guardrails

- Never run a destructive trick on first click: first click previews, second confirms.
- Show the audience beside the Run button.
- Explain irreversible consequences before scene switches, deletes, or mass token removal.
- Respect hidden combatants and encounter-scene scope in every player projection.
- Do not auto-apply damage from a roll request; present the result and let the DM confirm consequences.
- Keyboard flow: open palette, search, preview, run, and undo without leaving the map.
- Meta effects must respect per-player Full, Reduced, or Off preferences.
- Meta effects must not use flashing, jumpscare audio, focus capture, input interception, or fake real-world system warnings.
- Essential controls and the DM kill switch remain visually and interactively stable during every effect.

## Acceptance criteria

- Running a trick produces at most one durable collaboration transaction plus compact transient events.
- A reconnecting peer sees the durable outcome but does not replay spectacle or duplicate tokens.
- Player clients never receive DM-private trick text or DCs in their synchronized snapshot.
- Preview never mutates campaign state.
- Undo restores only untouched fields from the selected receipt and clearly refuses unsafe reversals.
- Every trick has DM, player, reconnect, scene-scope, and hidden-information tests.
- Cognitohazard tests prove audience isolation, expiry, reconnect recovery, reduced-effects fallback, Truth View accuracy, and immediate global clearing.
