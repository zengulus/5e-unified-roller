(function (root, factory) {
    'use strict';

    const api = factory();

    if (typeof module === 'object' && module.exports) {
        module.exports = api;
        return;
    }
    if (root && typeof root === 'object') {
        root.RTF_VTT_DOM = api;
    }
}(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';

    const ID_REFS = Object.freeze({
        stageEl: 'vtt-stage',
        mapWorldEl: 'vtt-map-world',
        worldEl: 'vtt-world',
        stageGridEl: 'vtt-stage-grid',
        mapImageEl: 'vtt-map-image',
        gridLayerEl: 'vtt-grid-layer',
        fogLayerEl: 'vtt-fog-layer',
        noteLayerEl: 'vtt-note-layer',
        templateLayerEl: 'vtt-template-layer',
        tokenLayerEl: 'vtt-token-layer',
        visionLayerEl: 'vtt-vision-layer',
        caseNameEl: 'vtt-case-name',
        syncChipEl: 'vtt-sync-chip',
        youtubeAudioPlayerEl: 'vtt-youtube-audio-player',
        roleToggleEl: 'vtt-role-toggle',
        spectatorToggleEl: 'vtt-spectator-toggle',
        tokenNamesToggleEl: 'vtt-token-names-toggle',
        activeSceneLabelEl: 'vtt-active-scene-label',
        scenePanelSceneLabelEl: 'vtt-scene-panel-scene-label',
        stageTitleEl: 'vtt-stage-title',
        stageMetaEl: 'vtt-stage-meta',
        stageEmptyEl: 'vtt-stage-empty',
        modeChipEl: 'vtt-mode-chip',
        roundPillEl: 'vtt-round-pill',
        selectionPillEl: 'vtt-selection-pill',
        tokenInspectorEl: 'vtt-token-inspector',
        inspectorPanelEl: 'vtt-inspector-panel',
        tokenInspectorPopoverEl: 'vtt-token-inspector-popover',
        stageContextMenuEl: 'vtt-stage-context-menu',
        sheetActionPopoverEl: 'vtt-sheet-action-popover',
        npcRollPopoverEl: 'vtt-npc-roll-popover',
        proximityPromptStackEl: 'vtt-proximity-prompt-stack',
        playerRollPanelEl: 'vtt-player-roll-panel',
        playerRollMenuEl: 'vtt-player-roll-menu',
        playerRollRailEl: 'vtt-player-roll-rail',
        initiativePanelEl: 'vtt-initiative-panel',
        adminPanelEl: 'vtt-admin-panel',
        playerDockStatusEl: 'vtt-player-dock-status',
        playerFindTokenEl: 'vtt-player-find-token',
        playerMeasureButtonEl: 'vtt-player-measure-btn',
        playerPingButtonEl: 'vtt-player-ping-btn',
        playerRollsButtonEl: 'vtt-player-rolls-btn',
        settingsRailTabEl: 'vtt-settings-rail-tab',
        playerRollRailTabEl: 'vtt-player-roll-rail-tab',
        initiativeRailTabEl: 'vtt-initiative-rail-tab',
        clockListEl: 'vtt-clock-list',
        initiativeListEl: 'vtt-initiative-list',
        initiativeDetailPanelEl: 'vtt-initiative-detail-panel',
        sceneListEl: 'vtt-scene-list',
        playerSpawnListEl: 'vtt-player-spawn-list',
        npcSearchToggleEl: 'vtt-npc-search-toggle',
        npcSearchPopoverEl: 'vtt-npc-search-popover',
        npcSearchInputEl: 'vtt-npc-search-input',
        npcSearchListEl: 'vtt-npc-search-list',
        quickSpawnMenuEl: 'vtt-quick-spawn-menu',
        spawnGhostEl: 'vtt-spawn-ghost',
        toolsMenuToggleEl: 'vtt-tools-menu-toggle',
        toolsMenuEl: 'vtt-tools-menu',
        rulerToggleEl: 'vtt-ruler-toggle',
        toolModeNavigateEl: 'vtt-tool-mode-navigate',
        toolModePingEl: 'vtt-tool-mode-ping',
        toolModeCircleEl: 'vtt-tool-mode-circle',
        toolModeConeEl: 'vtt-tool-mode-cone',
        toolModeNoteEl: 'vtt-tool-mode-note',
        toolModeFogEl: 'vtt-tool-mode-fog',
        toolModeFogRemoveEl: 'vtt-tool-mode-fog-remove',
        toolSizeInputEl: 'vtt-tool-size-input',
        stealthModeToggleEl: 'vtt-stealth-mode-toggle',
        clearFogButtonEl: 'vtt-clear-fog',
        accentButtonEl: 'vtt-accent-btn',
        accentPickerEl: 'accent-picker-input',
        viewMenuEl: 'vtt-view-menu',
        gridToggleEl: 'vtt-grid-toggle',
        topbarTabEl: 'vtt-topbar-tab',
        sidebarEl: 'vtt-settings-panel',
        rosterSelfModalEl: 'vtt-roster-self-modal',
        rosterSelfDetailEl: 'vtt-roster-self-detail',
        rosterSelfListEl: 'vtt-roster-self-list',
        rosterSelfErrorEl: 'vtt-roster-self-error',
        rosterSelfConfirmEl: 'vtt-roster-self-confirm',
        dmUnlockModalEl: 'vtt-dm-unlock-modal',
        dmUnlockFormEl: 'vtt-dm-unlock-form',
        dmUnlockInputEl: 'vtt-dm-unlock-input',
        dmUnlockErrorEl: 'vtt-dm-unlock-error'
    });

    const SELECTOR_REFS = Object.freeze({
        topbarEl: '.vtt-topbar',
        sceneMusicEditorEl: '.vtt-scene-music-editor'
    });

    const LIST_SELECTOR_REFS = Object.freeze({
        zoomResetEls: '[data-action="zoom-reset"]',
        viewMenuToggleEls: '[data-vtt-master-menu-toggle]'
    });

    const create = (documentRef) => {
        if (!documentRef || typeof documentRef.getElementById !== 'function' || typeof documentRef.querySelector !== 'function') {
            throw new TypeError('RTF_VTT_DOM.create requires a document-like object.');
        }
        const refs = { body: documentRef.body || null };
        Object.entries(ID_REFS).forEach(([key, id]) => {
            refs[key] = documentRef.getElementById(id);
        });
        Object.entries(SELECTOR_REFS).forEach(([key, selector]) => {
            refs[key] = documentRef.querySelector(selector);
        });
        Object.entries(LIST_SELECTOR_REFS).forEach(([key, selector]) => {
            refs[key] = Array.from(documentRef.querySelectorAll(selector));
        });
        return Object.freeze(refs);
    };

    return Object.freeze({ create, ID_REFS, SELECTOR_REFS, LIST_SELECTOR_REFS });
}));
