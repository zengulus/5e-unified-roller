let latestSyncStatus = null;
const delegatedHandlerEvents = ['click', 'change', 'input'];
const delegatedHandlerCache = new Map();
let delegatedHandlersBound = false;
const AUTO_CONNECT_CANCEL_KEY = 'rtf_sync_autoconnect_cancelled';
let campaignSequenceDragCaseId = '';

function isAutoConnectCancelledPreference() {
    try {
        return localStorage.getItem(AUTO_CONNECT_CANCEL_KEY) === '1';
    } catch (err) {
        return false;
    }
}

function setAutoConnectCancelledPreference(cancelled) {
    try {
        if (cancelled) {
            localStorage.setItem(AUTO_CONNECT_CANCEL_KEY, '1');
        } else {
            localStorage.removeItem(AUTO_CONNECT_CANCEL_KEY);
        }
    } catch (err) {
        // noop: preference persistence is best-effort.
    }
}

function parseBooleanInput(value, fallback = true) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') {
        const raw = value.trim().toLowerCase();
        if (!raw) return fallback;
        if (raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on') return true;
        if (raw === '0' || raw === 'false' || raw === 'no' || raw === 'off') return false;
    }
    return fallback;
}

function getDelegatedHandlerFn(code) {
    if (!delegatedHandlerCache.has(code)) {
        delegatedHandlerCache.set(code, window.RTF_DELEGATED_HANDLER.compile(code));
    }
    return delegatedHandlerCache.get(code);
}

function runDelegatedHandler(el, attrName, event) {
    const code = el.getAttribute(attrName);
    if (!code) return;

    try {
        const result = getDelegatedHandlerFn(code).call(el, event);
        if (result === false) {
            event.preventDefault();
            event.stopPropagation();
        }
    }
    catch (err) {
        console.error(`Delegated handler failed for ${attrName}:`, code, err);
    }
}

function handleDelegatedDataEvent(event) {
    const attrName = `data-on${event.type}`;
    let node = event.target instanceof Element ? event.target : null;

    while (node) {
        if (node.hasAttribute(attrName)) {
            runDelegatedHandler(node, attrName, event);
            if (event.cancelBubble) break;
        }
        node = node.parentElement;
    }
}

function bindDelegatedDataHandlers() {
    if (delegatedHandlersBound) return;
    delegatedHandlersBound = true;
    delegatedHandlerEvents.forEach((eventName) => {
        document.addEventListener(eventName, handleDelegatedDataEvent);
    });
}

function syncSecretModeUi() {
    const isSecret = document.body.classList.contains('secret-active');
    const titleEl = document.getElementById('pageTitle');
    if (titleEl) titleEl.innerText = isSecret ? "Campaign Hub (Tools): GM Controls" : "Campaign Hub (Tools)";
    const secretBtn = document.getElementById('btn-secret-mode');
    if (secretBtn) {
        secretBtn.innerText = isSecret ? '🧩 GM Mode: ON' : '🧩 GM Mode: OFF';
    }
    updateSyncPanelVisibility(latestSyncStatus);
}

function toggleSecretMode(forceState) {
    if (typeof forceState === 'boolean') {
        document.body.classList.toggle('secret-active', forceState);
    } else {
        document.body.classList.toggle('secret-active');
    }
    syncSecretModeUi();
}

// Secret Toggle Logic (Alt+Shift+Click on title)
function trySecretToggle(e) {
    if (!e || !e.altKey || !e.shiftKey) return;
    toggleSecretMode();
}

// Store Interaction
function handleExport() {
    if (window.RTF_STORE) {
        window.RTF_STORE.export();
    } else {
        alert("Store not loaded.");
    }
}

function chooseLLMSnapshotMode(defaultMode = 'full') {
    const fallback = defaultMode === 'compact' ? 'compact' : 'full';
    const raw = prompt('LLM snapshot mode? Enter "full" or "compact".', fallback);
    if (raw === null) return null;
    const mode = String(raw || '').trim().toLowerCase();
    if (!mode) return fallback;
    if (mode === 'full' || mode === 'f') return 'full';
    if (mode === 'compact' || mode === 'c') return 'compact';
    alert('Invalid mode. Use "full" or "compact".');
    return null;
}

function exportLLMSnapshotByTarget(target = 'campaign') {
    const cleanTarget = String(target || '').trim().toLowerCase() === 'case' ? 'case' : 'campaign';
    if (!window.RTF_STORE) {
        alert("Store not loaded.");
        return;
    }
    if (typeof window.RTF_STORE.exportLLMSnapshot !== 'function') {
        alert('This build does not support LLM snapshot export yet.');
        return;
    }
    const mode = chooseLLMSnapshotMode(cleanTarget === 'case' ? 'compact' : 'full');
    if (!mode) return;
    window.RTF_STORE.exportLLMSnapshot({ mode, target: cleanTarget });
}

function handleExportCaseLLMSnapshot() {
    exportLLMSnapshotByTarget('case');
}

function handleExportCampaignLLMSnapshot() {
    exportLLMSnapshotByTarget('campaign');
}

function handleExportLLMSnapshot() {
    exportLLMSnapshotByTarget('campaign');
}

function handleImport() {
    if (window.RTF_STORE) {
        window.RTF_STORE.import().then(success => {
            if (success) alert("Data imported successfully!");
            renderCaseSwitcher();
            renderCampaignContext();
            renderCampaignOverview();
        });
    } else {
        alert("Store not loaded.");
    }
}

function setCaseSwitcherStatus(message, isError = false) {
    const el = document.getElementById('case-switcher-status');
    if (!el) return;
    el.textContent = message;
    el.classList.toggle('is-error', !!isError);
}

function setCampaignScopeStatus(message, isError = false) {
    const el = document.getElementById('campaign-scope-status');
    if (!el) return;
    el.textContent = message;
    el.classList.toggle('is-error', !!isError);
}

function setCampaignWorkflowStatus(message, isError = false) {
    const el = document.getElementById('campaign-workflow-status');
    if (!el) return;
    el.textContent = message;
    el.classList.toggle('is-error', !!isError);
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function buildCaseBoardReferenceLink(caseId) {
    const url = new URL('board.html', window.location.href);
    url.searchParams.set('linkType', 'case');
    url.searchParams.set('id', String(caseId || '').trim());
    return url.toString();
}

function openCaseReferenceInBoard(caseId) {
    const id = String(caseId || '').trim();
    if (!id) return;
    window.location.assign(buildCaseBoardReferenceLink(id));
}

function readCampaignContextFromStore() {
    const store = window.RTF_STORE;
    if (!store) return null;
    if (typeof store.getCampaignScopes === 'function'
        && typeof store.getActiveCampaignScopeId === 'function'
        && typeof store.getActiveCampaignScope === 'function') {
        const scopes = store.getCampaignScopes();
        const activeScopeId = store.getActiveCampaignScopeId();
        const activeScope = store.getActiveCampaignScope();
        return { scopes, activeScopeId, activeScope };
    }
    const rawContext = store.state && store.state.campaignContext;
    const scopes = rawContext && Array.isArray(rawContext.scopes) ? rawContext.scopes.slice() : [];
    const activeScopeId = rawContext && rawContext.activeScopeId ? String(rawContext.activeScopeId) : '';
    const activeScope = scopes.find((entry) => String(entry && entry.id || '') === activeScopeId) || scopes[0] || null;
    return { scopes, activeScopeId: activeScope ? String(activeScope.id || '') : '', activeScope };
}

function renderCampaignScopeCasePicker(activeScope, cases, caseLookup) {
    const picker = document.getElementById('campaign-scope-case-add');
    const addBtn = document.getElementById('campaign-scope-add-case-btn');
    if (!picker) return;
    const scoped = new Set(Array.isArray(activeScope && activeScope.caseOrder) ? activeScope.caseOrder.map((id) => String(id || '')) : []);
    const available = (Array.isArray(cases) ? cases : []).filter((entry) => entry && !scoped.has(String(entry.id || '')));
    picker.innerHTML = '';
    if (!available.length) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'All cases already in scope';
        picker.appendChild(option);
        picker.disabled = true;
        if (addBtn) addBtn.disabled = true;
        return;
    }
    available.forEach((entry) => {
        const option = document.createElement('option');
        option.value = entry.id;
        option.textContent = entry.name || caseLookup.get(entry.id) || entry.id;
        picker.appendChild(option);
    });
    picker.disabled = false;
    if (addBtn) addBtn.disabled = false;
}

function reorderCampaignScopeCaseBefore(sourceCaseId, targetCaseId) {
    const sourceId = String(sourceCaseId || '').trim();
    const targetId = String(targetCaseId || '').trim();
    if (!sourceId || !targetId || sourceId === targetId) return false;
    const store = window.RTF_STORE;
    if (!store || typeof store.getActiveCampaignScope !== 'function' || typeof store.setCampaignScopeCaseOrder !== 'function') {
        setCampaignScopeStatus('Case reordering is unavailable in this build.', true);
        return false;
    }
    const scope = store.getActiveCampaignScope();
    const activeScopeId = typeof store.getActiveCampaignScopeId === 'function' ? store.getActiveCampaignScopeId() : '';
    const order = Array.isArray(scope && scope.caseOrder) ? scope.caseOrder.slice() : [];
    const fromIdx = order.findIndex((entry) => String(entry || '') === sourceId);
    const targetIdx = order.findIndex((entry) => String(entry || '') === targetId);
    if (fromIdx < 0 || targetIdx < 0) return false;
    const [moved] = order.splice(fromIdx, 1);
    const insertIdx = fromIdx < targetIdx ? targetIdx - 1 : targetIdx;
    order.splice(insertIdx, 0, moved);
    if (!activeScopeId || !store.setCampaignScopeCaseOrder(activeScopeId, order, { syncCase: false })) {
        setCampaignScopeStatus('Could not reorder this case in the active scope.', true);
        return false;
    }
    renderCampaignContext();
    renderCampaignOverview();
    setCampaignScopeStatus('Scope sequence reordered.');
    return true;
}

function clearCampaignSequenceDragState() {
    const listEl = document.getElementById('campaign-sequence-list');
    if (listEl) {
        listEl.querySelectorAll('.campaign-seq-row').forEach((row) => {
            row.classList.remove('is-drag-over');
            row.classList.remove('is-dragging');
        });
    }
}

function handleCampaignSequenceDragStart(event) {
    const handle = event.currentTarget;
    const caseId = String(handle && handle.dataset && handle.dataset.caseId || '').trim();
    if (!caseId) return;
    campaignSequenceDragCaseId = caseId;
    const row = handle.closest('.campaign-seq-row');
    if (row) row.classList.add('is-dragging');
    if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', caseId);
    }
}

function handleCampaignSequenceDragOver(event) {
    if (!campaignSequenceDragCaseId) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    const row = event.currentTarget;
    if (!(row instanceof Element)) return;
    row.classList.add('is-drag-over');
}

function handleCampaignSequenceDragLeave(event) {
    const row = event.currentTarget;
    if (!(row instanceof Element)) return;
    row.classList.remove('is-drag-over');
}

function handleCampaignSequenceDrop(event) {
    event.preventDefault();
    const row = event.currentTarget;
    const targetCaseId = String(row && row.dataset && row.dataset.caseId || '').trim();
    const fallbackId = event.dataTransfer ? String(event.dataTransfer.getData('text/plain') || '').trim() : '';
    const sourceCaseId = campaignSequenceDragCaseId || fallbackId;
    clearCampaignSequenceDragState();
    campaignSequenceDragCaseId = '';
    if (!sourceCaseId || !targetCaseId || sourceCaseId === targetCaseId) return;
    reorderCampaignScopeCaseBefore(sourceCaseId, targetCaseId);
}

function handleCampaignSequenceDragEnd() {
    clearCampaignSequenceDragState();
    campaignSequenceDragCaseId = '';
}

function bindCampaignSequenceDragHandlers(listEl) {
    if (!listEl) return;
    const handles = listEl.querySelectorAll('.campaign-seq-drag');
    handles.forEach((handle) => {
        handle.addEventListener('dragstart', handleCampaignSequenceDragStart);
        handle.addEventListener('dragend', handleCampaignSequenceDragEnd);
    });
    const rows = listEl.querySelectorAll('.campaign-seq-row');
    rows.forEach((row) => {
        row.addEventListener('dragover', handleCampaignSequenceDragOver);
        row.addEventListener('dragleave', handleCampaignSequenceDragLeave);
        row.addEventListener('drop', handleCampaignSequenceDrop);
    });
}

function renderCampaignScopeSequence(activeScope, activeCaseId, caseLookup) {
    const listEl = document.getElementById('campaign-sequence-list');
    if (!listEl) return;
    const scope = activeScope && typeof activeScope === 'object' ? activeScope : null;
    const order = Array.isArray(scope && scope.caseOrder) ? scope.caseOrder : [];
    const statusMap = scope && scope.caseStatus && typeof scope.caseStatus === 'object' ? scope.caseStatus : {};
    if (!order.length) {
        listEl.innerHTML = '<div class="campaign-seq-empty">No cases in this scope yet.</div>';
        return;
    }
    const html = order.map((caseId, index) => {
        const safeCaseId = escapeHtml(caseId);
        const caseName = caseLookup.get(caseId) || caseId;
        const isActiveCase = String(caseId) === String(activeCaseId);
        const status = String(statusMap[caseId] || (isActiveCase ? 'active' : 'planned')).toLowerCase();
        const rowClass = isActiveCase ? 'campaign-seq-row is-active' : 'campaign-seq-row';
        return `
            <div class="${rowClass}" data-case-id="${safeCaseId}" data-onclick="setCampaignScopeActiveCase('${safeCaseId}')">
                <button class="campaign-seq-drag" type="button" draggable="true" data-case-id="${safeCaseId}" title="Drag to reorder" data-onclick="event.stopPropagation()">
                    :: 
                </button>
                <div class="campaign-seq-main">
                    <div class="campaign-seq-title">${escapeHtml(caseName)}</div>
                    <div class="campaign-seq-meta">#${index + 1} · ${isActiveCase ? 'Now' : 'Queued'} · Scope status: ${escapeHtml(status)}</div>
                </div>
                <details class="campaign-seq-menu" data-onclick="event.stopPropagation()">
                    <summary class="sync-btn campaign-seq-overflow">...</summary>
                    <div class="campaign-seq-menu-pop">
                        <button class="sync-btn" data-onclick="event.stopPropagation(); setCampaignScopeActiveCase('${safeCaseId}');">Set Active</button>
                        <button class="sync-btn" data-onclick="event.stopPropagation(); updateCampaignScopeCaseStatus('${safeCaseId}', 'planned');">Mark Planned</button>
                        <button class="sync-btn" data-onclick="event.stopPropagation(); updateCampaignScopeCaseStatus('${safeCaseId}', 'resolved');">Mark Resolved</button>
                        <button class="sync-btn" data-onclick="event.stopPropagation(); referenceCaseOnBoard('${safeCaseId}');">Board Ref + Open</button>
                        <button class="sync-btn" data-onclick="event.stopPropagation(); deleteCampaignCaseById('${safeCaseId}');">Delete Case</button>
                        <button class="sync-btn" data-onclick="event.stopPropagation(); removeCaseFromActiveScope('${safeCaseId}');">Remove From Scope</button>
                    </div>
                </details>
            </div>
        `;
    }).join('');
    listEl.innerHTML = html;
    bindCampaignSequenceDragHandlers(listEl);
}

function getActiveScopeBoardRef(refId) {
    const cleanRefId = String(refId || '').trim();
    if (!cleanRefId || !window.RTF_STORE || typeof window.RTF_STORE.getActiveCampaignScope !== 'function') return null;
    const scope = window.RTF_STORE.getActiveCampaignScope();
    const refs = Array.isArray(scope && scope.boardRefs) ? scope.boardRefs : [];
    const ref = refs.find((entry) => String(entry && entry.id || '') === cleanRefId) || null;
    if (!ref) return null;
    const scopeId = typeof window.RTF_STORE.getActiveCampaignScopeId === 'function'
        ? window.RTF_STORE.getActiveCampaignScopeId()
        : '';
    return { scopeId, scope, ref };
}

function renderCampaignScopeBoardReferences(activeScope, caseLookup) {
    const listEl = document.getElementById('scope-board-ref-list');
    if (!listEl) return;
    const refs = Array.isArray(activeScope && activeScope.boardRefs) ? activeScope.boardRefs : [];
    if (!refs.length) {
        listEl.innerHTML = '<div class="campaign-seq-empty">No board references in this scope yet.</div>';
        return;
    }
    listEl.innerHTML = refs.map((ref) => {
        const safeRefId = escapeHtml(ref.id);
        const caseId = String(ref && ref.caseId || '').trim();
        const label = String(ref && ref.label || '').trim()
            || caseLookup.get(caseId)
            || caseId
            || 'Unknown Case';
        const note = String(ref && ref.note || '').trim();
        return `
            <div class="scope-board-ref-row">
                <div class="scope-board-ref-main">
                    <div class="scope-board-ref-title">${escapeHtml(label)}</div>
                    <div class="scope-board-ref-note">${note ? escapeHtml(note) : 'No note yet.'}</div>
                </div>
                <div class="scope-board-ref-actions">
                    <button class="sync-btn" data-onclick="focusScopeBoardRef('${safeRefId}')">Open / Focus</button>
                    <button class="sync-btn" data-onclick="renameScopeBoardRefNote('${safeRefId}')">Rename Note</button>
                    <button class="sync-btn" data-onclick="removeScopeBoardRef('${safeRefId}')">Remove</button>
                </div>
            </div>
        `;
    }).join('');
}

function addActiveCaseBoardRef() {
    const store = window.RTF_STORE;
    if (!store || typeof store.getActiveCampaignScopeId !== 'function' || typeof store.addCampaignScopeBoardRef !== 'function') {
        setCampaignScopeStatus('Scope board references are unavailable in this build.', true);
        return;
    }
    const scopeId = store.getActiveCampaignScopeId();
    const activeCaseId = typeof store.getActiveCaseId === 'function' ? String(store.getActiveCaseId() || '') : '';
    if (!scopeId || !activeCaseId) {
        setCampaignScopeStatus('No active scope or case to reference.', true);
        return;
    }
    const ref = store.addCampaignScopeBoardRef(scopeId, activeCaseId, {});
    if (!ref) {
        setCampaignScopeStatus('Could not add active case board reference.', true);
        return;
    }
    renderCampaignContext();
    renderCampaignOverview();
    setCampaignScopeStatus('Active case added to scope board references.');
}

function focusScopeBoardRef(refId) {
    const resolved = getActiveScopeBoardRef(refId);
    if (!resolved || !resolved.ref) {
        setCampaignScopeStatus('Board reference not found in this scope.', true);
        return;
    }
    openCaseReferenceInBoard(resolved.ref.caseId);
}

function renameScopeBoardRefNote(refId) {
    const resolved = getActiveScopeBoardRef(refId);
    if (!resolved || !resolved.ref) {
        setCampaignScopeStatus('Board reference not found in this scope.', true);
        return;
    }
    if (!window.RTF_STORE || typeof window.RTF_STORE.addCampaignScopeBoardRef !== 'function') {
        setCampaignScopeStatus('Board reference note editing is unavailable in this build.', true);
        return;
    }
    const next = prompt('Rename board reference note:', resolved.ref.note || '');
    if (next === null) return;
    const trimmed = String(next || '').trim();
    if (!window.RTF_STORE.addCampaignScopeBoardRef(resolved.scopeId, resolved.ref.caseId, {
        label: resolved.ref.label || '',
        note: trimmed
    })) {
        setCampaignScopeStatus('Could not update board reference note.', true);
        return;
    }
    renderCampaignContext();
    renderCampaignOverview();
    setCampaignScopeStatus('Board reference note updated.');
}

function removeScopeBoardRef(refId) {
    const resolved = getActiveScopeBoardRef(refId);
    if (!resolved || !resolved.ref) {
        setCampaignScopeStatus('Board reference not found in this scope.', true);
        return;
    }
    if (!window.RTF_STORE || typeof window.RTF_STORE.removeCampaignScopeBoardRef !== 'function') {
        setCampaignScopeStatus('Board reference removal is unavailable in this build.', true);
        return;
    }
    const ok = confirm('Remove this scope board reference?');
    if (!ok) return;
    if (!window.RTF_STORE.removeCampaignScopeBoardRef(resolved.scopeId, resolved.ref.id)) {
        setCampaignScopeStatus('Could not remove that board reference.', true);
        return;
    }
    renderCampaignContext();
    renderCampaignOverview();
    setCampaignScopeStatus('Scope board reference removed.');
}

function findNextPlannedScopeCaseId(scope, activeCaseId) {
    const order = Array.isArray(scope && scope.caseOrder) ? scope.caseOrder : [];
    const statusMap = scope && scope.caseStatus && typeof scope.caseStatus === 'object' ? scope.caseStatus : {};
    const activeId = String(activeCaseId || scope && scope.activeCaseId || '').trim();
    const activeIdx = order.findIndex((id) => String(id || '') === activeId);
    const inOrder = activeIdx >= 0
        ? [...order.slice(activeIdx + 1), ...order.slice(0, activeIdx)]
        : order.slice();
    return inOrder.find((id) => String(statusMap[id] || '').toLowerCase() === 'planned') || '';
}

function startNextScopeCase() {
    if (!window.RTF_STORE
        || typeof window.RTF_STORE.getActiveCampaignScope !== 'function'
        || typeof window.RTF_STORE.setCampaignScopeActiveCase !== 'function') {
        setCampaignWorkflowStatus('Scope workflow actions are unavailable in this build.', true);
        return;
    }
    const scope = window.RTF_STORE.getActiveCampaignScope();
    const scopeId = typeof window.RTF_STORE.getActiveCampaignScopeId === 'function'
        ? window.RTF_STORE.getActiveCampaignScopeId()
        : '';
    if (!scopeId || !scope) {
        setCampaignWorkflowStatus('No active scope found.', true);
        return;
    }
    const activeCaseId = typeof window.RTF_STORE.getActiveCaseId === 'function' ? window.RTF_STORE.getActiveCaseId() : '';
    const nextCaseId = findNextPlannedScopeCaseId(scope, activeCaseId);
    if (!nextCaseId) {
        setCampaignWorkflowStatus('No planned case is queued after the current active case.', true);
        return;
    }
    if (!window.RTF_STORE.setCampaignScopeActiveCase(scopeId, nextCaseId, { syncCase: true })) {
        setCampaignWorkflowStatus('Could not start the next scoped case.', true);
        return;
    }
    renderCaseSwitcher();
    renderCampaignContext();
    renderCampaignOverview();
    const cases = typeof window.RTF_STORE.getCases === 'function' ? window.RTF_STORE.getCases() : [];
    const nextName = cases.find((entry) => String(entry && entry.id || '') === String(nextCaseId))
        || { name: nextCaseId };
    setCampaignWorkflowStatus(`Started next case: ${nextName.name || nextCaseId}.`);
}

function markResolvedAndAdvanceScopeCase() {
    if (!window.RTF_STORE
        || typeof window.RTF_STORE.getActiveCampaignScope !== 'function'
        || typeof window.RTF_STORE.setCampaignScopeCaseStatus !== 'function'
        || typeof window.RTF_STORE.setCampaignScopeActiveCase !== 'function') {
        setCampaignWorkflowStatus('Scope workflow actions are unavailable in this build.', true);
        return;
    }
    const scope = window.RTF_STORE.getActiveCampaignScope();
    const scopeId = typeof window.RTF_STORE.getActiveCampaignScopeId === 'function'
        ? window.RTF_STORE.getActiveCampaignScopeId()
        : '';
    const activeCaseId = String(typeof window.RTF_STORE.getActiveCaseId === 'function' ? window.RTF_STORE.getActiveCaseId() : '').trim();
    if (!scopeId || !activeCaseId) {
        setCampaignWorkflowStatus('No active scope case to resolve.', true);
        return;
    }
    const nextCaseId = findNextPlannedScopeCaseId(scope, activeCaseId);
    if (!window.RTF_STORE.setCampaignScopeCaseStatus(scopeId, activeCaseId, 'resolved')) {
        setCampaignWorkflowStatus('Could not mark the active case as resolved.', true);
        return;
    }
    if (nextCaseId) {
        window.RTF_STORE.setCampaignScopeActiveCase(scopeId, nextCaseId, { syncCase: true });
    }
    renderCaseSwitcher();
    renderCampaignContext();
    renderCampaignOverview();

    const refreshedScope = typeof window.RTF_STORE.getActiveCampaignScope === 'function'
        ? window.RTF_STORE.getActiveCampaignScope()
        : null;
    const refreshedActiveCaseId = String(refreshedScope && refreshedScope.activeCaseId || activeCaseId);
    const cases = typeof window.RTF_STORE.getCases === 'function' ? window.RTF_STORE.getCases() : [];
    const nameLookup = new Map(cases.map((entry) => [String(entry && entry.id || ''), String(entry && entry.name || entry && entry.id || '')]));
    const resolvedName = nameLookup.get(activeCaseId) || activeCaseId;
    const activeName = nameLookup.get(refreshedActiveCaseId) || refreshedActiveCaseId;
    if (refreshedActiveCaseId === activeCaseId) {
        setCampaignWorkflowStatus(`Resolved "${resolvedName}". No planned case was available to advance.`, true);
    } else {
        setCampaignWorkflowStatus(`Resolved "${resolvedName}" and advanced to "${activeName}".`);
    }
}

function openActiveScopeBoard() {
    if (!window.RTF_STORE) {
        setCampaignWorkflowStatus('Store not loaded.', true);
        return;
    }
    const scopeId = typeof window.RTF_STORE.getActiveCampaignScopeId === 'function'
        ? window.RTF_STORE.getActiveCampaignScopeId()
        : '';
    const activeCaseId = String(typeof window.RTF_STORE.getActiveCaseId === 'function' ? window.RTF_STORE.getActiveCaseId() : '').trim();
    if (!scopeId || !activeCaseId) {
        setCampaignWorkflowStatus('No active scope case to open.', true);
        return;
    }
    if (typeof window.RTF_STORE.addCampaignScopeBoardRef === 'function') {
        window.RTF_STORE.addCampaignScopeBoardRef(scopeId, activeCaseId, {});
    }
    openCaseReferenceInBoard(activeCaseId);
}

function renderCampaignOverview() {
    const metaEl = document.getElementById('campaign-overview-meta');
    const gridEl = document.getElementById('campaign-overview-grid');
    const workflowGridEl = document.getElementById('campaign-workflow-grid');
    if (!metaEl || !gridEl || !workflowGridEl) return;
    const store = window.RTF_STORE;
    if (!store || !store.state || !store.state.campaign) {
        metaEl.textContent = 'Store unavailable';
        gridEl.textContent = 'Campaign overview unavailable until store loads.';
        workflowGridEl.textContent = 'Campaign workflow unavailable until store loads.';
        return;
    }

    const cases = typeof store.getCases === 'function' ? store.getCases() : [];
    const caseLookup = new Map(cases.map((entry) => [String(entry && entry.id || ''), String(entry && entry.name || entry && entry.id || '')]));
    const activeCaseId = typeof store.getActiveCaseId === 'function' ? store.getActiveCaseId() : '';
    const activeCase = cases.find((entry) => String(entry && entry.id || '') === String(activeCaseId)) || null;
    const context = readCampaignContextFromStore();
    const activeScope = context && context.activeScope ? context.activeScope : null;

    const campaign = store.state.campaign;
    const heat = Number(campaign.heat) || 0;
    const cognitiveRisk = Number(campaign.cognitiveRisk) || 0;
    const activeEvents = (typeof store.getEvents === 'function' ? store.getEvents(activeCaseId) : campaign.events) || [];

    const scopedCases = Array.isArray(activeScope && activeScope.caseOrder) ? activeScope.caseOrder : [];
    const scopedStatus = activeScope && activeScope.caseStatus && typeof activeScope.caseStatus === 'object' ? activeScope.caseStatus : {};
    const resolvedCount = scopedCases.filter((id) => String(scopedStatus[id] || '').toLowerCase() === 'resolved').length;
    const boardRefCount = Array.isArray(activeScope && activeScope.boardRefs) ? activeScope.boardRefs.length : 0;
    const nextCaseId = findNextPlannedScopeCaseId(activeScope, activeCaseId);
    const nextCaseLabel = caseLookup.get(String(nextCaseId || '')) || nextCaseId || 'No planned case queued';
    const nowCaseLabel = activeCase && activeCase.name ? activeCase.name : (activeCaseId || '—');
    const blockers = (Array.isArray(activeEvents) ? activeEvents : []).filter((evt) => {
        if (!evt || evt.resolved) return false;
        const heat = parseInt(evt.heatDelta, 10);
        return (!isNaN(heat) && heat !== 0) || !!String(evt.fallout || '').trim();
    });
    const rawBlockedLabel = blockers.length
        ? (String(blockers[0].title || blockers[0].focus || '').trim() || `${blockers.length} unresolved blocker(s)`)
        : 'No blockers';
    const blockedLabel = rawBlockedLabel.length > 64 ? `${rawBlockedLabel.slice(0, 61)}...` : rawBlockedLabel;
    metaEl.textContent = `${cases.length} case${cases.length === 1 ? '' : 's'} across ${context && Array.isArray(context.scopes) ? context.scopes.length : 0} scope${context && Array.isArray(context.scopes) && context.scopes.length === 1 ? '' : 's'}`;
    workflowGridEl.innerHTML = [
        ['Now', nowCaseLabel],
        ['Next', nextCaseLabel],
        ['Blocked', blockedLabel]
    ].map(([label, value]) => `
        <div class="campaign-workflow-kpi">
            <div class="campaign-overview-kpi-label">${escapeHtml(label)}</div>
            <div class="campaign-overview-kpi-value">${escapeHtml(value)}</div>
        </div>
    `).join('');
    setCampaignWorkflowStatus('Workflow actions ready.');

    const kpis = [
        ['Active Scope', activeScope && activeScope.name ? activeScope.name : '—'],
        ['Active Case', activeCase && activeCase.name ? activeCase.name : (activeCaseId || '—')],
        ['Heat', String(heat)],
        ['Cognitive Risk', String(cognitiveRisk)],
        ['Scoped Cases', String(scopedCases.length)],
        ['Scoped Resolved', String(resolvedCount)],
        ['Scope Board Refs', String(boardRefCount)],
        ['Case Events', String(Array.isArray(activeEvents) ? activeEvents.length : 0)]
    ];
    gridEl.innerHTML = kpis.map(([label, value]) => `
        <div class="campaign-overview-kpi">
            <div class="campaign-overview-kpi-label">${escapeHtml(label)}</div>
            <div class="campaign-overview-kpi-value">${escapeHtml(value)}</div>
        </div>
    `).join('');
}

function renderCampaignContext() {
    const scopeSelectEl = document.getElementById('campaign-scope-select');
    const scopeMetaEl = document.getElementById('campaign-scope-meta');
    const scopeCreateBtn = document.getElementById('campaign-scope-create-btn');
    const scopeRenameBtn = document.getElementById('campaign-scope-rename-btn');
    const scopeDeleteBtn = document.getElementById('campaign-scope-delete-btn');
    const boardRefListEl = document.getElementById('scope-board-ref-list');
    if (!scopeSelectEl || !scopeMetaEl) return;

    const store = window.RTF_STORE;
    if (!store || typeof store.getCases !== 'function') {
        scopeSelectEl.innerHTML = '';
        scopeMetaEl.textContent = 'Store unavailable';
        if (scopeCreateBtn) scopeCreateBtn.disabled = true;
        if (scopeRenameBtn) scopeRenameBtn.disabled = true;
        if (scopeDeleteBtn) scopeDeleteBtn.disabled = true;
        if (boardRefListEl) boardRefListEl.textContent = 'Scope board references unavailable until store loads.';
        setCampaignScopeStatus('Campaign scope is unavailable until store loads.', true);
        return;
    }

    const cases = store.getCases();
    const caseLookup = new Map(cases.map((entry) => [String(entry.id || ''), String(entry.name || entry.id || '')]));
    const activeCaseId = typeof store.getActiveCaseId === 'function' ? store.getActiveCaseId() : '';
    const context = readCampaignContextFromStore();
    const scopes = context && Array.isArray(context.scopes) ? context.scopes : [];
    const activeScopeId = context ? context.activeScopeId : '';
    const activeScope = context && context.activeScope ? context.activeScope : (scopes[0] || null);

    const previous = scopeSelectEl.value;
    scopeSelectEl.innerHTML = '';
    scopes.forEach((scope) => {
        const option = document.createElement('option');
        option.value = scope.id;
        option.textContent = scope.name || scope.id;
        scopeSelectEl.appendChild(option);
    });
    if (scopes.some((scope) => scope.id === activeScopeId)) {
        scopeSelectEl.value = activeScopeId;
    } else if (scopes.some((scope) => scope.id === previous)) {
        scopeSelectEl.value = previous;
    }

    const statusMap = activeScope && activeScope.caseStatus && typeof activeScope.caseStatus === 'object'
        ? activeScope.caseStatus
        : {};
    const caseOrder = Array.isArray(activeScope && activeScope.caseOrder) ? activeScope.caseOrder : [];
    let planned = 0;
    let active = 0;
    let resolved = 0;
    caseOrder.forEach((id) => {
        const token = String(statusMap[id] || '').trim().toLowerCase();
        if (token === 'active') active += 1;
        else if (token === 'resolved') resolved += 1;
        else planned += 1;
    });

    const activeScopeName = activeScope && activeScope.name ? activeScope.name : '—';
    const activeCaseName = caseLookup.get(String(activeCaseId || '')) || activeCaseId || '—';
    const boardRefCount = Array.isArray(activeScope && activeScope.boardRefs) ? activeScope.boardRefs.length : 0;
    scopeMetaEl.textContent = `Active Scope: ${activeScopeName} · Cases: ${caseOrder.length} · Board Refs: ${boardRefCount} · Active Case: ${activeCaseName}`;

    if (scopeCreateBtn) scopeCreateBtn.disabled = false;
    if (scopeRenameBtn) scopeRenameBtn.disabled = !activeScope;
    if (scopeDeleteBtn) scopeDeleteBtn.disabled = !activeScope || scopes.length <= 1;

    renderCampaignScopeCasePicker(activeScope, cases, caseLookup);
    renderCampaignScopeSequence(activeScope, activeCaseId, caseLookup);
    renderCampaignScopeBoardReferences(activeScope, caseLookup);
    const activeCountMessage = active === 1 ? '1 active case enforced' : `${active} active cases found`;
    setCampaignScopeStatus(`Scope "${activeScopeName}" ready. Planned ${planned} · Resolved ${resolved} · ${activeCountMessage}.`);
}

function renderCaseSwitcher() {
    const selectEl = document.getElementById('active-case-select');
    const metaEl = document.getElementById('case-switcher-meta');
    const deleteBtns = [
        document.getElementById('case-delete-btn'),
        document.getElementById('campaign-case-delete-btn')
    ].filter(Boolean);
    const renameBtn = document.getElementById('case-rename-btn');
    const createBtn = document.getElementById('case-create-btn');
    if (!selectEl || !metaEl) return;

    if (!window.RTF_STORE || typeof window.RTF_STORE.getCases !== 'function') {
        selectEl.innerHTML = '';
        metaEl.textContent = 'Store unavailable';
        deleteBtns.forEach((btn) => { btn.disabled = true; });
        if (renameBtn) renameBtn.disabled = true;
        if (createBtn) createBtn.disabled = true;
        setCaseSwitcherStatus('Store not loaded yet.', true);
        return;
    }

    const cases = window.RTF_STORE.getCases();
    const activeId = window.RTF_STORE.getActiveCaseId();
    const activeCase = typeof window.RTF_STORE.getActiveCase === 'function'
        ? window.RTF_STORE.getActiveCase()
        : null;

    const previous = selectEl.value;
    selectEl.innerHTML = '';
    cases.forEach((entry) => {
        const option = document.createElement('option');
        option.value = entry.id;
        option.textContent = entry.name || entry.id;
        selectEl.appendChild(option);
    });

    if (cases.some((entry) => entry.id === activeId)) {
        selectEl.value = activeId;
    } else if (cases.some((entry) => entry.id === previous)) {
        selectEl.value = previous;
    }

    const count = cases.length;
    const activeLabel = activeCase && activeCase.name ? activeCase.name : (selectEl.options[selectEl.selectedIndex] && selectEl.options[selectEl.selectedIndex].textContent) || '—';
    const context = readCampaignContextFromStore();
    const activeScopeLabel = context && context.activeScope && context.activeScope.name
        ? context.activeScope.name
        : '—';
    metaEl.textContent = `${count} case${count === 1 ? '' : 's'} | Active: ${activeLabel} | Scope: ${activeScopeLabel}`;
    deleteBtns.forEach((btn) => { btn.disabled = count <= 1; });
    if (renameBtn) renameBtn.disabled = !count;
    if (createBtn) createBtn.disabled = false;
    setCaseSwitcherStatus(`Case context set to "${activeLabel}".`);
}

function selectActiveCase(caseId) {
    if (!window.RTF_STORE || typeof window.RTF_STORE.setActiveCase !== 'function') {
        setCaseSwitcherStatus('Case switching unavailable in this store version.', true);
        return;
    }
    if (!window.RTF_STORE.setActiveCase(caseId)) {
        setCaseSwitcherStatus('Could not switch to that case.', true);
        renderCaseSwitcher();
        return;
    }
    renderCaseSwitcher();
    renderCampaignContext();
    renderCampaignOverview();
}

function createCaseFromInput() {
    const input = document.getElementById('new-case-name');
    if (!input) return;
    if (!window.RTF_STORE || typeof window.RTF_STORE.createCase !== 'function') {
        setCaseSwitcherStatus('Case creation unavailable in this store version.', true);
        return;
    }
    const name = (input.value || '').trim();
    if (!name) {
        setCaseSwitcherStatus('Enter a case name first.', true);
        input.focus();
        return;
    }
    const id = window.RTF_STORE.createCase(name);
    input.value = '';
    renderCaseSwitcher();
    renderCampaignContext();
    renderCampaignOverview();
    if (id) setCaseSwitcherStatus(`Created and switched to "${name}".`);
}

function renameActiveCase() {
    if (!window.RTF_STORE || typeof window.RTF_STORE.renameCase !== 'function') {
        setCaseSwitcherStatus('Case rename unavailable in this store version.', true);
        return;
    }
    const active = window.RTF_STORE.getActiveCase && window.RTF_STORE.getActiveCase();
    if (!active || !active.id) {
        setCaseSwitcherStatus('No active case to rename.', true);
        return;
    }
    const next = prompt('Rename active case:', active.name || '');
    if (next === null) return;
    const trimmed = next.trim();
    if (!trimmed) {
        setCaseSwitcherStatus('Case name cannot be empty.', true);
        return;
    }
    if (!window.RTF_STORE.renameCase(active.id, trimmed)) {
        setCaseSwitcherStatus('Case rename failed.', true);
        return;
    }
    renderCaseSwitcher();
    renderCampaignContext();
    renderCampaignOverview();
    setCaseSwitcherStatus(`Renamed case to "${trimmed}".`);
}

function deleteActiveCase() {
    const active = window.RTF_STORE && window.RTF_STORE.getActiveCase && window.RTF_STORE.getActiveCase();
    const caseId = active && active.id ? active.id : '';
    deleteCampaignCaseById(caseId);
}

function deleteCampaignCaseById(caseId) {
    if (!window.RTF_STORE || typeof window.RTF_STORE.deleteCase !== 'function') {
        setCaseSwitcherStatus('Case delete unavailable in this store version.', true);
        return;
    }
    const targetId = String(caseId || '').trim();
    if (!targetId) {
        setCaseSwitcherStatus('No case selected to delete.', true);
        return;
    }
    const allCases = window.RTF_STORE.getCases && window.RTF_STORE.getCases();
    const target = Array.isArray(allCases)
        ? allCases.find((entry) => String(entry && entry.id || '') === targetId)
        : null;
    if (!target || !target.id) {
        setCaseSwitcherStatus('That case could not be found.', true);
        return;
    }
    if (!Array.isArray(allCases) || allCases.length <= 1) {
        setCaseSwitcherStatus('At least one case must remain.', true);
        return;
    }
    const targetName = String(target.name || target.id || 'Unnamed Case').trim();
    const ok = confirm(`Delete case "${targetName}"?\n\nThis removes that case's board and timeline events.`);
    if (!ok) return;
    if (!window.RTF_STORE.deleteCase(target.id)) {
        setCaseSwitcherStatus('Case delete failed.', true);
        return;
    }
    renderCaseSwitcher();
    renderCampaignContext();
    renderCampaignOverview();
    setCaseSwitcherStatus(`Deleted case "${targetName}".`);
    setCampaignScopeStatus(`Deleted case "${targetName}".`);
}

function selectCampaignScope(scopeId) {
    if (!window.RTF_STORE || typeof window.RTF_STORE.setActiveCampaignScope !== 'function') {
        setCampaignScopeStatus('Campaign scope switching is unavailable in this build.', true);
        return;
    }
    if (!window.RTF_STORE.setActiveCampaignScope(scopeId, { syncCase: true })) {
        setCampaignScopeStatus('Could not switch to that campaign scope.', true);
        renderCampaignContext();
        return;
    }
    renderCaseSwitcher();
    renderCampaignContext();
    renderCampaignOverview();
}

function createCampaignScopeFromInput() {
    const input = document.getElementById('campaign-scope-name');
    if (!input) return;
    if (!window.RTF_STORE || typeof window.RTF_STORE.createCampaignScope !== 'function') {
        setCampaignScopeStatus('Campaign scope creation unavailable in this build.', true);
        return;
    }
    const name = String(input.value || '').trim();
    if (!name) {
        setCampaignScopeStatus('Enter a campaign scope name first.', true);
        input.focus();
        return;
    }
    const id = window.RTF_STORE.createCampaignScope(name, { syncCase: true });
    input.value = '';
    renderCaseSwitcher();
    renderCampaignContext();
    renderCampaignOverview();
    if (id) setCampaignScopeStatus(`Created and switched to scope "${name}".`);
}

function renameCampaignScope() {
    if (!window.RTF_STORE || typeof window.RTF_STORE.renameCampaignScope !== 'function') {
        setCampaignScopeStatus('Campaign scope rename unavailable in this build.', true);
        return;
    }
    const active = typeof window.RTF_STORE.getActiveCampaignScope === 'function'
        ? window.RTF_STORE.getActiveCampaignScope()
        : null;
    if (!active || !active.id) {
        setCampaignScopeStatus('No active campaign scope to rename.', true);
        return;
    }
    const next = prompt('Rename active campaign scope:', active.name || '');
    if (next === null) return;
    const trimmed = next.trim();
    if (!trimmed) {
        setCampaignScopeStatus('Campaign scope name cannot be empty.', true);
        return;
    }
    if (!window.RTF_STORE.renameCampaignScope(active.id, trimmed)) {
        setCampaignScopeStatus('Campaign scope rename failed.', true);
        return;
    }
    renderCampaignContext();
    renderCampaignOverview();
    renderCaseSwitcher();
    setCampaignScopeStatus(`Renamed campaign scope to "${trimmed}".`);
}

function deleteCampaignScope() {
    if (!window.RTF_STORE || typeof window.RTF_STORE.deleteCampaignScope !== 'function') {
        setCampaignScopeStatus('Campaign scope delete unavailable in this build.', true);
        return;
    }
    const active = typeof window.RTF_STORE.getActiveCampaignScope === 'function'
        ? window.RTF_STORE.getActiveCampaignScope()
        : null;
    const allScopes = typeof window.RTF_STORE.getCampaignScopes === 'function'
        ? window.RTF_STORE.getCampaignScopes()
        : [];
    if (!active || !active.id) {
        setCampaignScopeStatus('No active campaign scope to delete.', true);
        return;
    }
    if (!Array.isArray(allScopes) || allScopes.length <= 1) {
        setCampaignScopeStatus('At least one campaign scope must remain.', true);
        return;
    }
    const ok = confirm(`Delete campaign scope "${active.name}"?`);
    if (!ok) return;
    if (!window.RTF_STORE.deleteCampaignScope(active.id, { syncCase: true })) {
        setCampaignScopeStatus('Campaign scope delete failed.', true);
        return;
    }
    renderCaseSwitcher();
    renderCampaignContext();
    renderCampaignOverview();
}

function addCaseToActiveScope() {
    const picker = document.getElementById('campaign-scope-case-add');
    if (!picker) return;
    const caseId = String(picker.value || '').trim();
    if (!caseId) return;
    if (!window.RTF_STORE || typeof window.RTF_STORE.addCaseToCampaignScope !== 'function') {
        setCampaignScopeStatus('Adding cases to scope is unavailable in this build.', true);
        return;
    }
    const activeScopeId = typeof window.RTF_STORE.getActiveCampaignScopeId === 'function'
        ? window.RTF_STORE.getActiveCampaignScopeId()
        : '';
    if (!activeScopeId) {
        setCampaignScopeStatus('No active campaign scope found.', true);
        return;
    }
    if (!window.RTF_STORE.addCaseToCampaignScope(activeScopeId, caseId, { syncCase: false })) {
        setCampaignScopeStatus('Could not add that case to the active scope.', true);
        return;
    }
    renderCampaignContext();
    renderCampaignOverview();
    setCampaignScopeStatus('Case added to active scope.');
}

function removeCaseFromActiveScope(caseId) {
    const cleanCaseId = String(caseId || '').trim();
    if (!cleanCaseId) return;
    if (!window.RTF_STORE || typeof window.RTF_STORE.removeCaseFromCampaignScope !== 'function') {
        setCampaignScopeStatus('Removing cases from scope is unavailable in this build.', true);
        return;
    }
    const activeScopeId = typeof window.RTF_STORE.getActiveCampaignScopeId === 'function'
        ? window.RTF_STORE.getActiveCampaignScopeId()
        : '';
    if (!activeScopeId) return;
    const ok = confirm('Remove this case from the active campaign scope?');
    if (!ok) return;
    if (!window.RTF_STORE.removeCaseFromCampaignScope(activeScopeId, cleanCaseId, { syncCase: true })) {
        setCampaignScopeStatus('Could not remove that case from the active scope.', true);
        return;
    }
    renderCaseSwitcher();
    renderCampaignContext();
    renderCampaignOverview();
}

function moveCampaignScopeCase(caseId, delta) {
    const cleanCaseId = String(caseId || '').trim();
    const shift = Number(delta || 0);
    if (!cleanCaseId || !shift) return;
    if (!window.RTF_STORE || typeof window.RTF_STORE.moveCampaignScopeCase !== 'function') {
        setCampaignScopeStatus('Case reordering is unavailable in this build.', true);
        return;
    }
    const activeScopeId = typeof window.RTF_STORE.getActiveCampaignScopeId === 'function'
        ? window.RTF_STORE.getActiveCampaignScopeId()
        : '';
    if (!activeScopeId) return;
    if (!window.RTF_STORE.moveCampaignScopeCase(activeScopeId, cleanCaseId, shift, { syncCase: false })) {
        setCampaignScopeStatus('Could not reorder this case in the active scope.', true);
        return;
    }
    renderCampaignContext();
    renderCampaignOverview();
}

function updateCampaignScopeCaseStatus(caseId, status) {
    const cleanCaseId = String(caseId || '').trim();
    const cleanStatus = String(status || '').trim().toLowerCase();
    if (!cleanCaseId || !cleanStatus) return;
    if (!window.RTF_STORE || typeof window.RTF_STORE.setCampaignScopeCaseStatus !== 'function') {
        setCampaignScopeStatus('Scope status edits are unavailable in this build.', true);
        return;
    }
    const activeScopeId = typeof window.RTF_STORE.getActiveCampaignScopeId === 'function'
        ? window.RTF_STORE.getActiveCampaignScopeId()
        : '';
    if (!activeScopeId) return;
    if (!window.RTF_STORE.setCampaignScopeCaseStatus(activeScopeId, cleanCaseId, cleanStatus)) {
        setCampaignScopeStatus('Could not update case status in this scope.', true);
        return;
    }
    renderCaseSwitcher();
    renderCampaignContext();
    renderCampaignOverview();
    setCampaignScopeStatus(`Case status set to "${cleanStatus}".`);
}

function setCampaignScopeActiveCase(caseId) {
    const cleanCaseId = String(caseId || '').trim();
    if (!cleanCaseId) return;
    if (!window.RTF_STORE || typeof window.RTF_STORE.setCampaignScopeActiveCase !== 'function') {
        setCampaignScopeStatus('Scope active-case selection is unavailable in this build.', true);
        return;
    }
    const activeScopeId = typeof window.RTF_STORE.getActiveCampaignScopeId === 'function'
        ? window.RTF_STORE.getActiveCampaignScopeId()
        : '';
    if (!activeScopeId) return;
    if (!window.RTF_STORE.setCampaignScopeActiveCase(activeScopeId, cleanCaseId, { syncCase: true })) {
        setCampaignScopeStatus('Could not set that case active for this scope.', true);
        return;
    }
    renderCaseSwitcher();
    renderCampaignContext();
    renderCampaignOverview();
    setCampaignScopeStatus('Scope active case updated.');
}

function referenceCaseOnBoard(caseId) {
    const cleanCaseId = String(caseId || '').trim();
    if (!cleanCaseId) return;
    const store = window.RTF_STORE;
    if (store && typeof store.addCampaignScopeBoardRef === 'function' && typeof store.getActiveCampaignScopeId === 'function') {
        const activeScopeId = store.getActiveCampaignScopeId();
        if (activeScopeId) {
            store.addCampaignScopeBoardRef(activeScopeId, cleanCaseId, {});
        }
    }
    openCaseReferenceInBoard(cleanCaseId);
}

function setBoardAdminStatus(message, isError = false) {
    const el = document.getElementById('board-admin-status');
    if (!el) return;
    el.textContent = message;
    el.classList.toggle('is-error', !!isError);
}

function formatBoardAdminTimestamp(value) {
    const stamp = Date.parse(value || '');
    if (!Number.isFinite(stamp)) return 'Unknown time';
    try {
        return new Date(stamp).toLocaleString();
    } catch (err) {
        return new Date(stamp).toISOString();
    }
}

function formatBoardHistoryReason(value) {
    const clean = String(value || 'snapshot').trim().replace(/[-_]+/g, ' ');
    if (!clean) return 'Snapshot';
    return clean.charAt(0).toUpperCase() + clean.slice(1);
}

function cloneBoardAdminData(value, fallback = null) {
    try {
        return JSON.parse(JSON.stringify(value));
    } catch (err) {
        return fallback;
    }
}

function clampBoardAdminPercent(value, fallback = 50) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(0, Math.min(100, Math.round(parsed)));
}

function createBoardAdminClueTimelineEventId(nodeId = '') {
    const cleanNodeId = String(nodeId || '')
        .trim()
        .replace(/[^a-z0-9_-]/gi, '')
        .slice(0, 60);
    if (cleanNodeId) return `event_clue_${cleanNodeId}`;
    return `event_clue_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function getBoardAdminSourceDescriptor(meta) {
    if (!meta || !meta.sourceType) return '';
    const type = String(meta.sourceType || '').trim().toLowerCase();
    if (type === 'player') return ' from player roster';
    if (type === 'npc') return ' from NPC roster';
    if (type === 'location') return ' from locations database';
    if (type === 'timeline-event') return ' from mission timeline';
    if (type === 'requisition') return ' from requisitions';
    if (type === 'case') return ' from campaign scope';
    if (type === 'guild') return ' from guild reference';
    return '';
}

function boardAdminHtmlToText(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const shell = document.createElement('div');
    shell.innerHTML = raw.replace(/<br\s*\/?>/gi, '\n');
    const text = typeof shell.innerText === 'string' ? shell.innerText : String(shell.textContent || '');
    return text
        .replace(/\r/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function buildBoardAdminClueTimelinePayload(node, boardName) {
    const source = node && typeof node === 'object' ? node : {};
    const meta = source.meta && typeof source.meta === 'object' ? source.meta : {};
    const nodeId = String(source.id || '').trim();
    const title = String(source.title || '').trim() || 'Untitled Clue';
    const notes = boardAdminHtmlToText(source.body || '');
    const sourceTag = String(meta.sourceType || '').trim().toLowerCase();
    const tags = ['clue', 'board', 'clue-discovery'];
    if (sourceTag) tags.push(sourceTag);
    return {
        title: `Clue: ${title}`,
        focus: String(boardName || '').trim() || 'Case Board',
        heatDelta: '',
        tags: Array.from(new Set(tags)).join(', '),
        imageUrl: String(meta.imageUrl || '').trim(),
        highlights: notes || `${title}${getBoardAdminSourceDescriptor(meta)}.`,
        fallout: '',
        followUp: '',
        source: 'board',
        kind: 'clue-discovered',
        resolved: false,
        boardNodeId: nodeId,
        boardLinkType: 'node',
        boardLinkId: nodeId
    };
}

function getBoardAdminBoardState(store, target) {
    if (!store || !target) return null;
    if (target.scope === 'campaign') {
        return typeof store.getCampaignMetaBoard === 'function' ? store.getCampaignMetaBoard() : null;
    }
    return typeof store.getBoard === 'function' ? store.getBoard(target.caseId || null) : null;
}

function getBoardAdminTimelineEvents(store, target) {
    if (!store || !target) return [];
    if (target.scope === 'campaign') {
        return typeof store.getCampaignMetaEvents === 'function' ? store.getCampaignMetaEvents() : [];
    }
    return typeof store.getEvents === 'function' ? store.getEvents(target.caseId || null) : [];
}

function updateBoardAdminTimelineEvent(store, target, eventId, updates) {
    if (!store || !target || !eventId || !updates) return;
    if (target.scope === 'campaign') {
        if (typeof store.updateCampaignMetaEvent === 'function') store.updateCampaignMetaEvent(eventId, updates);
        return;
    }
    if (typeof store.updateEvent === 'function') store.updateEvent(eventId, updates, target.caseId || null);
}

function addBoardAdminTimelineEvent(store, target, payload) {
    if (!store || !target || !payload) return '';
    if (target.scope === 'campaign') {
        return typeof store.addCampaignMetaEvent === 'function' ? store.addCampaignMetaEvent(payload) : '';
    }
    return typeof store.addEvent === 'function' ? store.addEvent(payload, target.caseId || null) : '';
}

function persistBoardAdminBoardState(store, target, board) {
    if (!store || !target || !board) return;
    if (target.scope === 'campaign') {
        if (typeof store.updateCampaignMetaBoard === 'function') store.updateCampaignMetaBoard(board);
        return;
    }
    if (typeof store.updateBoard === 'function') store.updateBoard(board, target.caseId || null);
}

function syncBoardAdminLinkedTimelineEvents() {
    const store = window.RTF_STORE;
    if (!store) {
        setBoardAdminStatus('Store unavailable.', true);
        return;
    }
    const target = getBoardAdminTarget();
    const board = cloneBoardAdminData(getBoardAdminBoardState(store, target), null);
    if (!board || !Array.isArray(board.nodes)) {
        setBoardAdminStatus(`Board data unavailable for ${target.label}.`, true);
        return;
    }

    const clueNodes = board.nodes.filter((node) =>
        node
        && String(node.type || '').trim().toLowerCase() === 'clue'
        && String(node.id || '').trim()
    );
    if (!clueNodes.length) {
        setBoardAdminStatus(`No clue nodes found on ${target.label}.`);
        return;
    }

    const confirmed = confirm(
        `Sync linked timeline events for ${target.label}?\n\n`
        + 'This will create missing clue-linked events, refresh clue note text, and repair direct board deeplinks.'
    );
    if (!confirmed) return;

    setBoardAdminStatus(`Syncing linked timeline events for ${target.label}...`);

    try {
        const boardName = String(board.name || '').trim() || target.label;
        const existingEvents = getBoardAdminTimelineEvents(store, target);
        const existingEventMap = new Map();
        (Array.isArray(existingEvents) ? existingEvents : []).forEach((entry) => {
            const id = String(entry && entry.id || '').trim();
            if (!id || existingEventMap.has(id)) return;
            existingEventMap.set(id, entry);
        });

        let created = 0;
        let updated = 0;
        let unchanged = 0;
        let boardPatched = 0;

        clueNodes.forEach((node) => {
            const nodeId = String(node.id || '').trim();
            if (!nodeId) return;
            const meta = node.meta && typeof node.meta === 'object' ? { ...node.meta } : {};
            const currentEventId = String(meta.clueTimelineEventId || '').trim();
            const eventId = currentEventId || createBoardAdminClueTimelineEventId(nodeId);
            if (currentEventId !== eventId) {
                meta.clueTimelineEventId = eventId;
                node.meta = meta;
                boardPatched += 1;
            } else if (node.meta !== meta) {
                node.meta = meta;
            }

            const existing = existingEventMap.get(eventId);
            const payload = buildBoardAdminClueTimelinePayload({ ...node, meta }, boardName);

            if (!existing) {
                addBoardAdminTimelineEvent(store, target, {
                    id: eventId,
                    ...payload,
                    created: new Date().toISOString()
                });
                existingEventMap.set(eventId, { id: eventId, ...payload });
                created += 1;
                return;
            }

            const patch = {
                title: payload.title,
                imageUrl: payload.imageUrl,
                highlights: payload.highlights,
                source: payload.source,
                kind: payload.kind,
                boardNodeId: payload.boardNodeId,
                boardLinkType: payload.boardLinkType,
                boardLinkId: payload.boardLinkId
            };
            const changed = Object.keys(patch).some((key) => {
                const prev = existing && Object.prototype.hasOwnProperty.call(existing, key) ? existing[key] : '';
                return String(prev ?? '') !== String(patch[key] ?? '');
            });

            if (!changed) {
                unchanged += 1;
                return;
            }

            updateBoardAdminTimelineEvent(store, target, eventId, patch);
            existingEventMap.set(eventId, { ...existing, ...patch });
            updated += 1;
        });

        if (boardPatched > 0) {
            persistBoardAdminBoardState(store, target, board);
        }

        const unchangedText = unchanged > 0 ? ` ${unchanged} already matched.` : '';
        const boardPatchText = boardPatched > 0 ? ` Repaired ${boardPatched} clue link id${boardPatched === 1 ? '' : 's'} on the board.` : '';
        setBoardAdminStatus(
            `Linked timeline sync complete for ${target.label}. `
            + `Created ${created}, updated ${updated}.${unchangedText}${boardPatchText}`
        );
    } catch (err) {
        setBoardAdminStatus(err && err.message ? err.message : 'Failed to sync linked timeline events.', true);
    }
}

function getBoardAdminTarget() {
    const store = window.RTF_STORE;
    const scopeEl = document.getElementById('board-admin-scope');
    const caseEl = document.getElementById('board-admin-case');
    const scope = scopeEl && String(scopeEl.value || '').trim().toLowerCase() === 'campaign' ? 'campaign' : 'case';
    const fallbackCaseId = store && typeof store.getActiveCaseId === 'function' ? store.getActiveCaseId() : '';
    const caseId = scope === 'campaign' ? '' : String(caseEl && caseEl.value || fallbackCaseId || '').trim();
    if (store && typeof store.resolveBoardRoomTarget === 'function') {
        return store.resolveBoardRoomTarget({ scope, caseId });
    }
    return {
        scope,
        caseId,
        roomId: scope === 'campaign' ? 'campaign:meta' : `case:${caseId || 'case_primary'}`,
        label: scope === 'campaign' ? 'Campaign Meta Board' : `Case Board: ${caseId || 'case_primary'}`
    };
}

function renderBoardAdminSelectors() {
    const scopeEl = document.getElementById('board-admin-scope');
    const caseEl = document.getElementById('board-admin-case');
    const roomEl = document.getElementById('board-admin-room-id');
    if (!scopeEl || !caseEl || !roomEl) return;

    const store = window.RTF_STORE;
    const scope = String(scopeEl.value || 'campaign').trim().toLowerCase() === 'campaign' ? 'campaign' : 'case';
    const cases = store && typeof store.getCases === 'function' ? store.getCases() : [];
    const activeCaseId = store && typeof store.getActiveCaseId === 'function' ? store.getActiveCaseId() : '';
    const previous = String(caseEl.value || '').trim();

    caseEl.innerHTML = '';
    cases.forEach((entry) => {
        if (!entry || !entry.id) return;
        const option = document.createElement('option');
        option.value = entry.id;
        option.textContent = entry.name || entry.id;
        caseEl.appendChild(option);
    });

    if (scope === 'case') {
        const preferred = cases.some((entry) => entry && entry.id === previous)
            ? previous
            : (cases.some((entry) => entry && entry.id === activeCaseId) ? activeCaseId : (cases[0] && cases[0].id) || '');
        if (preferred) caseEl.value = preferred;
    }

    caseEl.disabled = scope !== 'case' || !cases.length;
    const target = getBoardAdminTarget();
    roomEl.textContent = target.roomId;
}

function renderBoardAdminHistoryList(liveSnapshot, historyEntries) {
    const listEl = document.getElementById('board-admin-history-list');
    if (!listEl) return;

    const liveSig = liveSnapshot ? JSON.stringify(liveSnapshot.payload || {}) : '';
    const liveRevision = liveSnapshot ? Number(liveSnapshot.revision || 0) : 0;
    const entries = Array.isArray(historyEntries) ? historyEntries : [];
    if (!entries.length) {
        listEl.innerHTML = '<div class="board-admin-history-empty">No board snapshots recorded for this room yet.</div>';
        return;
    }

    listEl.innerHTML = entries.map((entry) => {
        const sig = JSON.stringify(entry && entry.payload ? entry.payload : {});
        const isCurrent = !!liveSnapshot && ((entry.revision && entry.revision === liveRevision) || (sig && sig === liveSig));
        const title = `${formatBoardHistoryReason(entry.reason)} · ${entry.nodeCount} node${entry.nodeCount === 1 ? '' : 's'} · ${entry.connectionCount} connection${entry.connectionCount === 1 ? '' : 's'}`;
        const capturedBy = entry.capturedByName || entry.capturedBy || 'Unknown source';
        const meta = `${formatBoardAdminTimestamp(entry.capturedAt)} · rev ${entry.revision || 0} · ${capturedBy}`;
        return `
            <div class="board-admin-history-row${isCurrent ? ' is-current' : ''}">
                <div class="board-admin-history-main">
                    <div class="board-admin-history-title">${escapeHtml(title)}</div>
                    <div class="board-admin-history-meta">${escapeHtml(meta)}</div>
                </div>
                <div class="board-admin-history-actions">
                    <button class="sync-btn" data-onclick="restoreBoardAdminHistory(${Number(entry.id || 0)})">Restore</button>
                </div>
            </div>
        `;
    }).join('');
}

async function refreshBoardAdminPanel() {
    renderBoardAdminSelectors();
    const liveMetaEl = document.getElementById('board-admin-live-meta');
    const listEl = document.getElementById('board-admin-history-list');
    const store = window.RTF_STORE;
    if (!liveMetaEl || !listEl) return;

    if (!store || typeof store.loadBoardRoomSnapshot !== 'function' || typeof store.listBoardRoomHistory !== 'function') {
        liveMetaEl.textContent = 'Store unavailable';
        listEl.innerHTML = '<div class="board-admin-history-empty">Board recovery APIs are unavailable in this build.</div>';
        setBoardAdminStatus('Board recovery APIs are unavailable in this build.', true);
        return;
    }

    const target = getBoardAdminTarget();
    liveMetaEl.textContent = 'Loading live room...';
    listEl.innerHTML = '<div class="board-admin-history-empty">Loading snapshots...</div>';
    setBoardAdminStatus(`Loading ${target.label}...`);

    const [live, history] = await Promise.all([
        store.loadBoardRoomSnapshot(target),
        store.listBoardRoomHistory({ ...target, limit: 18 })
    ]);

    if (!live.ok) {
        liveMetaEl.textContent = 'Live room unavailable';
        listEl.innerHTML = '<div class="board-admin-history-empty">No snapshot history available.</div>';
        setBoardAdminStatus(live.error || 'Failed to load the live board room.', true);
        return;
    }

    if (!live.snapshot) {
        liveMetaEl.textContent = 'No live row currently saved';
    } else {
        const payload = live.snapshot.payload || {};
        const nodeCount = Array.isArray(payload.nodes) ? payload.nodes.length : 0;
        const connectionCount = Array.isArray(payload.connections) ? payload.connections.length : 0;
        const updatedBy = live.snapshot.updatedByName || live.snapshot.updatedBy || 'Unknown source';
        liveMetaEl.textContent = `${nodeCount} node${nodeCount === 1 ? '' : 's'} · ${connectionCount} connection${connectionCount === 1 ? '' : 's'} · rev ${live.snapshot.revision || 0} · ${formatBoardAdminTimestamp(live.snapshot.updatedAt)} · ${updatedBy}`;
    }

    if (!history.ok) {
        listEl.innerHTML = '<div class="board-admin-history-empty">History could not be loaded.</div>';
        setBoardAdminStatus(history.error || 'History load failed.', true);
        return;
    }

    renderBoardAdminHistoryList(live.snapshot, history.history || []);
    if (live.snapshot) {
        setBoardAdminStatus(`${target.label} loaded. Review snapshots before restoring or busting.`);
    } else {
        setBoardAdminStatus(`${target.label} has no live room row. Promote a clean browser mirror to reseed it.`);
    }
}

async function promoteBoardAdminLocalMirror() {
    const store = window.RTF_STORE;
    if (!store || typeof store.promoteBoardRoomStateToLive !== 'function') {
        setBoardAdminStatus('Board promotion is unavailable in this build.', true);
        return;
    }
    const target = getBoardAdminTarget();
    setBoardAdminStatus(`Promoting this browser mirror for ${target.label}...`);
    const result = await store.promoteBoardRoomStateToLive(target);
    if (!result.ok) {
        setBoardAdminStatus(result.error || 'Failed to promote this browser mirror.', true);
        return;
    }
    setBoardAdminStatus(`Promoted this browser mirror for ${target.label}.`);
    await refreshBoardAdminPanel();
}

async function restoreBoardAdminHistory(historyId) {
    const store = window.RTF_STORE;
    if (!store || typeof store.restoreBoardRoomHistoryEntry !== 'function') {
        setBoardAdminStatus('Board snapshot restore is unavailable in this build.', true);
        return;
    }
    const target = getBoardAdminTarget();
    const cleanId = Number(historyId || 0);
    if (!cleanId) return;
    const ok = confirm(`Restore snapshot #${cleanId} to ${target.label}?\n\nThis replaces the live room with that snapshot for everyone in the room.`);
    if (!ok) return;
    setBoardAdminStatus(`Restoring snapshot #${cleanId} to ${target.label}...`);
    const result = await store.restoreBoardRoomHistoryEntry({ ...target, historyId: cleanId });
    if (!result.ok) {
        setBoardAdminStatus(result.error || 'Failed to restore board snapshot.', true);
        return;
    }
    setBoardAdminStatus(`Restored snapshot #${cleanId} to ${target.label}.`);
    await refreshBoardAdminPanel();
}

async function bustBoardAdminLiveRoom() {
    const store = window.RTF_STORE;
    if (!store || typeof store.bustBoardRoom !== 'function') {
        setBoardAdminStatus('Live room bust is unavailable in this build.', true);
        return;
    }
    const target = getBoardAdminTarget();
    const ok = confirm(`Bust the live room for ${target.label}?\n\nThis archives the current live payload, disconnects live writers, deletes the live row, and requires a clean browser mirror to reseed it.`);
    if (!ok) return;
    setBoardAdminStatus(`Busting ${target.label}...`);
    const result = await store.bustBoardRoom(target);
    if (!result.ok) {
        setBoardAdminStatus(result.error || 'Failed to bust the live board room.', true);
        return;
    }
    setBoardAdminStatus(`Live room busted for ${target.label}. Clear stale browser caches, then reseed from a clean browser mirror.`);
    await refreshBoardAdminPanel();
}

async function clearBoardAdminLocalCache() {
    const store = window.RTF_STORE;
    if (!store || typeof store.clearBoardRoomLocalState !== 'function') {
        setBoardAdminStatus('Local board cache clearing is unavailable in this build.', true);
        return;
    }
    const target = getBoardAdminTarget();
    const ok = confirm(`Clear this browser's local cached board data for ${target.label}?\n\nThis browser will no longer be able to reseed stale data for that room until it pulls or receives a fresh snapshot.`);
    if (!ok) return;
    setBoardAdminStatus(`Clearing this browser cache for ${target.label}...`);
    const result = await store.clearBoardRoomLocalState(target);
    if (!result.ok) {
        setBoardAdminStatus(result.error || 'Failed to clear this browser cache.', true);
        return;
    }
    const suffix = result.cacheError ? ` IndexedDB: ${result.cacheError}` : '';
    setBoardAdminStatus(`Cleared this browser's mirrored board data for ${target.label}.${suffix}`, !!result.cacheError);
    await refreshBoardAdminPanel();
}

function getSyncFormValues() {
    const autoConnectEl = document.getElementById('sync-autoconnect');
    const currentConfig = (window.RTF_STORE && typeof window.RTF_STORE.getSyncConfig === 'function')
        ? window.RTF_STORE.getSyncConfig()
        : null;
    const loginEmail = (document.getElementById('sync-email').value || '').trim();
    const rawLoginPassword = (document.getElementById('sync-password').value || '').trim();
    const storedLoginEmail = String(currentConfig && currentConfig.loginEmail || '').trim();
    const storedLoginPassword = String(currentConfig && currentConfig.loginPassword || '');
    const loginPassword = rawLoginPassword || (loginEmail && loginEmail === storedLoginEmail ? storedLoginPassword : '');
    return {
        supabaseUrl: (document.getElementById('sync-url').value || '').trim(),
        anonKey: (document.getElementById('sync-key').value || '').trim(),
        campaignId: (document.getElementById('sync-campaign').value || '').trim(),
        profileName: (document.getElementById('sync-profile').value || '').trim(),
        loginEmail,
        loginPassword,
        collabRelayUrl: (document.getElementById('sync-collab-relay').value || '').trim(),
        autoConnect: autoConnectEl ? !!autoConnectEl.checked : true
    };
}

function normalizeConnectPayload(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const supabaseUrl = (raw.supabaseUrl || raw.projectUrl || raw.url || '').trim();
    const anonKey = (raw.anonKey || raw.key || raw.publicKey || '').trim();
    const campaignId = (raw.campaignId || raw.slug || raw.campaign || '').trim();
    const profileName = (raw.profileName || raw.profile || '').trim();
    const rawLogin = raw.login && typeof raw.login === 'object' ? raw.login : {};
    const loginEmail = String(raw.loginEmail || raw.email || rawLogin.email || '').trim();
    const loginPassword = String(raw.loginPassword || raw.password || rawLogin.password || '').trim();
    const autoConnect = parseBooleanInput(raw.autoConnect, true);
    const backendMode = String(raw.backendMode || raw.syncBackend || '').trim() || 'normalized';
    if (!supabaseUrl || !anonKey || !campaignId) return null;
    const payload = {
        supabaseUrl,
        anonKey,
        campaignId,
        profileName,
        collabRelayUrl: String(raw.collabRelayUrl || raw.collabServerUrl || raw.relayUrl || '').trim(),
        enabled: true,
        autoConnect,
        backendMode
    };
    if (loginEmail && loginPassword) {
        payload.loginEmail = loginEmail;
        payload.loginPassword = loginPassword;
    }
    const optionalMap = [
        ['schema', raw.schema || ''],
        ['tableName', raw.tableName || raw.stateTable || ''],
        ['boardRoomsTable', raw.boardRoomsTable || raw.boardRoomTable || ''],
        ['boardHistoryTable', raw.boardHistoryTable || raw.boardRoomHistoryTable || ''],
        ['normalizedCoreTable', raw.normalizedCoreTable || raw.coreTable || ''],
        ['normalizedHQTable', raw.normalizedHQTable || raw.hqTable || ''],
        ['normalizedCaseStateTable', raw.normalizedCaseStateTable || raw.caseStateTable || ''],
        ['normalizedCaseBoardsTable', raw.normalizedCaseBoardsTable || raw.caseBoardsTable || ''],
        ['normalizedCaseEventsTable', raw.normalizedCaseEventsTable || raw.caseEventsTable || ''],
        ['normalizedScopeVersionsTable', raw.normalizedScopeVersionsTable || raw.scopeVersionsTable || ''],
        ['normalizedPlayersTable', raw.normalizedPlayersTable || raw.playersTable || ''],
        ['normalizedNPCsTable', raw.normalizedNPCsTable || raw.npcsTable || ''],
        ['normalizedLocationsTable', raw.normalizedLocationsTable || raw.locationsTable || ''],
        ['normalizedRequisitionsTable', raw.normalizedRequisitionsTable || raw.requisitionsTable || ''],
        ['normalizedEncountersTable', raw.normalizedEncountersTable || raw.encountersTable || '']
    ];
    optionalMap.forEach(([key, value]) => {
        const next = String(value || '').trim();
        if (next) payload[key] = next;
    });
    return payload;
}

function resolveConnectProfileName(fallback = '') {
    const field = document.getElementById('sync-profile');
    const fieldValue = field ? String(field.value || '').trim() : '';
    return String(fieldValue || fallback || '').trim();
}

async function applyConnectProfile(raw, opts = {}) {
    if (!window.RTF_STORE) return { ok: false, error: 'Store not loaded.' };
    const options = opts && typeof opts === 'object' ? opts : {};
    const payload = normalizeConnectPayload(raw);
    if (!payload) return { ok: false, error: 'Invalid connect.json format.' };
    const suppliedProfileName = typeof options.profileName === 'string' ? options.profileName.trim() : '';
    const currentConfig = (window.RTF_STORE && typeof window.RTF_STORE.getSyncConfig === 'function')
        ? window.RTF_STORE.getSyncConfig()
        : null;
    payload.profileName = resolveConnectProfileName(
        suppliedProfileName
        || String(payload.profileName || '').trim()
        || String(currentConfig && currentConfig.profileName || '').trim()
    );
    setAutoConnectCancelledPreference(payload.autoConnect === false);

    window.RTF_STORE.setSyncConfig(payload, { reconnect: false });
    applySyncConfigToForm(window.RTF_STORE.getSyncConfig());

    if (options.connect === false) return { ok: true, connected: false };

    if (payload.loginEmail && payload.loginPassword && typeof window.RTF_STORE.signInWithPassword === 'function') {
        const login = await window.RTF_STORE.signInWithPassword(payload.loginEmail, payload.loginPassword, payload.profileName);
        if (!login.ok) return { ok: false, error: login.error || 'Player login failed.' };
    }

    const result = await window.RTF_STORE.connectSync({ explicit: true });
    if (!result.ok) {
        const status = window.RTF_STORE.getSyncStatus();
        return { ok: false, error: status.lastError || 'Connect failed.' };
    }
    return { ok: true, connected: true };
}

function importConnectFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = async (event) => {
        const target = event && event.target ? event.target : null;
        const file = target && target.files && target.files[0] ? target.files[0] : null;
        if (!file) return;
        try {
            setQuickStatus('importing connect.json...');
            const text = await file.text();
            const parsed = JSON.parse(text);
            const result = await applyConnectProfile(parsed);
            if (!result.ok) {
                setQuickStatus(result.error || 'failed to import connect.json.');
                alert(result.error || 'Failed to import connect.json.');
                return;
            }
            setQuickStatus('connected.');
            alert('connect.json imported and sync connected.');
        } catch (err) {
            setQuickStatus('invalid connect.json file.');
            alert('Invalid connect.json file.');
        }
    };
    input.click();
}

async function readBundledConnect() {
    try {
        const response = await fetch('connect.json', { cache: 'no-store' });
        if (!response.ok) return null;
        const json = await response.json();
        return normalizeConnectPayload(json);
    } catch (err) {
        return null;
    }
}

async function useBundledConnect() {
    setQuickStatus('checking bundled connect.json...');
    const payload = await readBundledConnect();
    if (!payload) {
        setQuickStatus('no valid bundled connect.json found.');
        alert('No valid bundled connect.json found at site root.');
        return;
    }
    setQuickStatus('connecting with bundled config...');
    const result = await applyConnectProfile(payload);
    if (!result.ok) {
        setQuickStatus(result.error || 'failed using bundled connect.json.');
        alert(result.error || 'Failed using bundled connect.json.');
        return;
    }
    setQuickStatus('connected.');
    alert('Bundled connect.json applied and connected.');
}

async function tryAutoConnectFromBundledDefault() {
    if (!window.RTF_STORE) return;
    if (isAutoConnectCancelledPreference()) {
        setQuickStatus('auto-connect is disabled on this browser.');
        return;
    }
    const current = window.RTF_STORE.getSyncConfig();
    const hasStoredConfig = !!(current && current.supabaseUrl && current.anonKey && current.campaignId);
    if (hasStoredConfig) return;

    const payload = await readBundledConnect();
    if (!payload) return;
    await applyConnectProfile(payload);
}

function applySyncConfigToForm(config) {
    if (!config) return;
    document.getElementById('sync-url').value = config.supabaseUrl || '';
    document.getElementById('sync-key').value = config.anonKey || '';
    document.getElementById('sync-campaign').value = config.campaignId || '';
    document.getElementById('sync-profile').value = config.profileName || '';
    const emailEl = document.getElementById('sync-email');
    const passwordEl = document.getElementById('sync-password');
    if (emailEl && !emailEl.value) emailEl.value = config.loginEmail || '';
    if (passwordEl && !passwordEl.value) passwordEl.value = '';
    document.getElementById('sync-collab-relay').value = config.collabRelayUrl || '';
    const autoConnectEl = document.getElementById('sync-autoconnect');
    if (autoConnectEl) autoConnectEl.checked = config.autoConnect !== false;
}

function fmtSyncTime(ts) {
    if (!ts) return '—';
    try {
        return new Date(ts).toLocaleString();
    } catch (err) {
        return '—';
    }
}

function setSyncStatusText(status) {
    const el = document.getElementById('sync-status');
    if (!el) return;
    if (!status) {
        el.textContent = 'Cloud sync status unavailable.';
        renderSyncConflictPanel(null);
        return;
    }
    const config = (window.RTF_STORE && typeof window.RTF_STORE.getSyncConfig === 'function')
        ? window.RTF_STORE.getSyncConfig()
        : null;
    const autoConnect = config ? (config.autoConnect !== false ? 'on' : 'off') : '—';
    const parts = [
        `Mode: ${status.mode || 'unknown'}`,
        `Backend: ${status.backendMode || 'legacy'}`,
        `Auto-Connect: ${autoConnect}`,
        `Connected: ${status.connected ? 'yes' : 'no'}`,
        `Campaign: ${status.campaignId || '—'}`,
        `User: ${status.userId ? status.userId.slice(0, 8) + '…' : '—'}`,
        `Local Rev: ${Number.isFinite(status.localRevision) ? status.localRevision : 0}`,
        `Remote Rev: ${Number.isFinite(status.remoteRevision) ? status.remoteRevision : 0}`,
        `Last Pull: ${fmtSyncTime(status.lastPullAt)}`,
        `Last Push: ${fmtSyncTime(status.lastPushAt)}`,
        `Peers: ${Number.isFinite(status.presencePeers) ? status.presencePeers : 0}`,
        `Remote Locks: ${Number.isFinite(status.activeRemoteLocks) ? status.activeRemoteLocks : 0}`,
        `Dirty Scopes: ${Number.isFinite(status.dirtyScopes) ? status.dirtyScopes : 0}`,
        status.pendingPush ? 'Pending Local Push: yes' : 'Pending Local Push: no',
        status.message ? `Note: ${status.message}` : ''
    ].filter(Boolean);
    el.textContent = parts.join(' | ');
    renderSyncConflictPanel(status);
}

function formatScopeList(scopes) {
    if (!Array.isArray(scopes) || !scopes.length) return '—';
    return scopes.join(', ');
}

function renderSyncConflictPanel(status) {
    const panel = document.getElementById('sync-conflict-box');
    const detail = document.getElementById('sync-conflict-detail');
    if (!panel || !detail) return;

    const conflict = (window.RTF_STORE && typeof window.RTF_STORE.getPendingConflict === 'function')
        ? window.RTF_STORE.getPendingConflict()
        : null;
    const hasConflict = !!(conflict || (status && status.pendingConflict));
    panel.classList.toggle('tools-hidden', !hasConflict);
    if (!hasConflict) {
        detail.textContent = 'Protected shared scopes overlap local edits. Routine row edits auto-resolve.';
        return;
    }

    const dirtyScopes = conflict ? formatScopeList(conflict.dirtyScopes) : formatScopeList(status && status.conflictScopes);
    const remoteScopes = conflict ? formatScopeList(conflict.remoteChangedScopes) : '—';
    const overlap = conflict ? formatScopeList(conflict.overlappingScopes) : formatScopeList(status && status.conflictScopes);
    detail.textContent = `Protected scopes only | Local: ${dirtyScopes} | Remote: ${remoteScopes} | Overlap: ${overlap}`;
}

function setQuickStatus(message) {
    const el = document.getElementById('sync-quick-status');
    if (!el) return;
    el.textContent = `Status: ${message}`;
}

function setQuickStatusFromSync(status) {
    if (!status) {
        setQuickStatus('sync status unavailable.');
        return;
    }
    if (status.mode === 'conflict' || status.pendingConflict) {
        setQuickStatus('protected conflict detected: resolve in Cloud Sync panel.');
        return;
    }
    if (status.mode === 'locked') {
        setQuickStatus('soft lock detected on a remote peer.');
        return;
    }
    if (status.connected) {
        const campaign = status.campaignId || 'unknown';
        const user = status.userId ? status.userId.slice(0, 8) + '…' : 'user';
        setQuickStatus(`connected to "${campaign}" as ${user}.`);
        return;
    }
    if (status.mode === 'connecting') {
        setQuickStatus('connecting...');
        return;
    }
    if (status.lastError) {
        setQuickStatus(`error: ${status.lastError}`);
        return;
    }
    setQuickStatus(status.message || 'not connected.');
}

function setCustomizeStatus(message, isError = false) {
    const el = document.getElementById('customize-status');
    if (!el) return;
    el.textContent = message;
    el.classList.toggle('is-error', !!isError);
}

function normalizeFilenameLabel(raw) {
    return String(raw || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 40);
}

function parseSeedArray(rawText, label) {
    const text = String(rawText || '').trim();
    if (!text) return [];
    let parsed = null;
    try {
        parsed = JSON.parse(text);
    } catch (err) {
        throw new Error(`${label} JSON is invalid.`);
    }
    if (!Array.isArray(parsed)) {
        throw new Error(`${label} JSON must be an array.`);
    }
    return parsed;
}

function coerceGuildSeedEntry(entry) {
    if (typeof entry === 'string') return entry.trim();
    if (entry && typeof entry === 'object') return String(entry.name || '').trim();
    return '';
}

function normalizeGuildSeedEntry(entry, idx) {
    const name = coerceGuildSeedEntry(entry);
    if (!name) throw new Error(`Guild row ${idx + 1} is missing "name".`);
    return name;
}

function dedupeStringsPreserveOrder(values) {
    const seen = new Set();
    const out = [];
    values.forEach((value) => {
        const name = String(value || '').trim();
        if (!name) return;
        const key = name.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        out.push(name);
    });
    return out;
}

function coerceNpcSeedRow(row) {
    const source = row && typeof row === 'object' ? row : {};
    return {
        name: String(source.name || '').trim(),
        guild: String(source.guild || '').trim(),
        wants: String(source.wants || '').trim(),
        leverage: String(source.leverage || '').trim(),
        notes: String(source.notes || '').trim()
    };
}

function normalizeNpcSeedRow(row, idx) {
    const item = coerceNpcSeedRow(row);
    if (!item.name) throw new Error(`NPC row ${idx + 1} is missing "name".`);
    return item;
}

function coerceLocationSeedRow(row) {
    const source = row && typeof row === 'object' ? row : {};
    return {
        name: String(source.name || '').trim(),
        district: String(source.district || '').trim(),
        desc: String(source.desc || '').trim(),
        notes: String(source.notes || '').trim()
    };
}

function normalizeLocationSeedRow(row, idx) {
    const item = coerceLocationSeedRow(row);
    if (!item.name) throw new Error(`Location row ${idx + 1} is missing "name".`);
    return item;
}

function buildPreloadFile(varName, items) {
    const json = JSON.stringify(items, null, 4);
    const indentedJson = json
        .split('\n')
        .map((line, idx) => (idx === 0 ? line : `    ${line}`))
        .join('\n');

    return `(function (global) {\n    global.${varName} = ${indentedJson};\n})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));\n`;
}

function downloadTextFile(filename, text, type = 'text/javascript') {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

function getCustomizeSeedArrays() {
    const guildsRaw = parseSeedArray(document.getElementById('customize-guilds-json').value, 'Guild seed');
    const npcsRaw = parseSeedArray(document.getElementById('customize-npcs-json').value, 'NPC seed');
    const locationsRaw = parseSeedArray(document.getElementById('customize-locations-json').value, 'Location seed');
    return {
        guilds: dedupeStringsPreserveOrder(guildsRaw.map(normalizeGuildSeedEntry)),
        npcs: npcsRaw.map(normalizeNpcSeedRow),
        locations: locationsRaw.map(normalizeLocationSeedRow)
    };
}

function writeCustomizeForm(guilds, npcs, locations) {
    document.getElementById('customize-guilds-json').value = JSON.stringify(guilds, null, 2);
    document.getElementById('customize-npcs-json').value = JSON.stringify(npcs, null, 2);
    document.getElementById('customize-locations-json').value = JSON.stringify(locations, null, 2);
}

async function loadCustomizeDefaults() {
    try {
        if (window.RTF_DATA_LOADER && typeof window.RTF_DATA_LOADER.ensureDatasets === 'function') {
            await window.RTF_DATA_LOADER.ensureDatasets(['npcs', 'locations']);
        }
        const guilds = (typeof window.getRTFGuilds === 'function')
            ? window.getRTFGuilds({ includeGuildless: true }).map(coerceGuildSeedEntry).filter(Boolean)
            : (Array.isArray(window.PRELOADED_GUILDS) ? window.PRELOADED_GUILDS.map(coerceGuildSeedEntry).filter(Boolean) : []);
        const npcs = Array.isArray(window.PRELOADED_NPCS) ? window.PRELOADED_NPCS.map(coerceNpcSeedRow) : [];
        const locations = Array.isArray(window.PRELOADED_LOCATIONS) ? window.PRELOADED_LOCATIONS.map(coerceLocationSeedRow) : [];
        writeCustomizeForm(guilds, npcs, locations);
        setCustomizeStatus(`Loaded defaults (${guilds.length} Guilds, ${npcs.length} NPCs, ${locations.length} Locations).`);
    } catch (err) {
        setCustomizeStatus(err && err.message ? err.message : 'Failed to load defaults.', true);
    }
}

function loadCustomizeFromCampaign() {
    if (!window.RTF_STORE || !window.RTF_STORE.state || !window.RTF_STORE.state.campaign) {
        setCustomizeStatus('Campaign store is not ready yet.', true);
        return;
    }
    try {
        const c = window.RTF_STORE.state.campaign;
        const npcs = (Array.isArray(c.npcs) ? c.npcs : []).map(coerceNpcSeedRow);
        const locations = (Array.isArray(c.locations) ? c.locations : []).map(coerceLocationSeedRow);
        const guilds = dedupeStringsPreserveOrder([
            ...Object.keys(c.rep || {}),
            ...npcs.map((npc) => npc.guild),
            ...locations.map((loc) => loc.district)
        ]);
        writeCustomizeForm(guilds, npcs, locations);
        setCustomizeStatus(`Loaded campaign store (${guilds.length} Guilds, ${npcs.length} NPCs, ${locations.length} Locations).`);
    } catch (err) {
        setCustomizeStatus(err && err.message ? err.message : 'Failed to load campaign data.', true);
    }
}

function buildCustomDataFiles() {
    const seed = getCustomizeSeedArrays();
    const labelRaw = document.getElementById('customize-label').value;
    const label = normalizeFilenameLabel(labelRaw);
    const suffix = label ? `-${label}` : '';
    return {
        guilds: {
            filename: `data-guilds${suffix}.js`,
            content: buildPreloadFile('PRELOADED_GUILDS', seed.guilds)
        },
        npcs: {
            filename: `data-npcs${suffix}.js`,
            content: buildPreloadFile('PRELOADED_NPCS', seed.npcs)
        },
        locations: {
            filename: `data-locations${suffix}.js`,
            content: buildPreloadFile('PRELOADED_LOCATIONS', seed.locations)
        }
    };
}

function downloadCustomDataFile(kind) {
    try {
        const files = buildCustomDataFiles();
        const selected = kind === 'guilds'
            ? files.guilds
            : (kind === 'locations' ? files.locations : files.npcs);
        downloadTextFile(selected.filename, selected.content, 'text/javascript');
        setCustomizeStatus(`Downloaded ${selected.filename}.`);
    } catch (err) {
        setCustomizeStatus(err && err.message ? err.message : 'Failed to build data file.', true);
    }
}

function downloadCustomDataFiles() {
    try {
        const files = buildCustomDataFiles();
        downloadTextFile(files.guilds.filename, files.guilds.content, 'text/javascript');
        downloadTextFile(files.npcs.filename, files.npcs.content, 'text/javascript');
        downloadTextFile(files.locations.filename, files.locations.content, 'text/javascript');
        setCustomizeStatus(`Downloaded ${files.guilds.filename}, ${files.npcs.filename}, and ${files.locations.filename}.`);
    } catch (err) {
        setCustomizeStatus(err && err.message ? err.message : 'Failed to build data files.', true);
    }
}

function updateSyncPanelVisibility(status) {
    const panel = document.getElementById('sync-panel');
    const boardAdmin = document.getElementById('board-admin-panel');
    const customize = document.getElementById('customize-panel');
    const quick = document.getElementById('sync-quick');
    if (!panel) return;

    const isSecret = document.body.classList.contains('secret-active');
    const connected = !!(status && status.connected);

    // Manual credentials/admin controls stay behind secret mode.
    panel.classList.toggle('tools-hidden', !isSecret);
    if (boardAdmin) boardAdmin.classList.toggle('tools-hidden', !isSecret);
    if (customize) customize.classList.toggle('tools-hidden', !isSecret);
    // Quick connect is for onboarding only; hide after successful connection.
    if (quick) quick.classList.toggle('tools-hidden', connected);
}

function saveSyncConfig() {
    if (!window.RTF_STORE) {
        alert('Store not loaded.');
        return;
    }
    const form = getSyncFormValues();
    setAutoConnectCancelledPreference(form.autoConnect === false);
    window.RTF_STORE.setSyncConfig({
        ...form,
        enabled: true
    }, { reconnect: false });
    applySyncConfigToForm(window.RTF_STORE.getSyncConfig());
    setSyncStatusText(window.RTF_STORE.getSyncStatus());
    alert('Sync config saved locally.');
}

async function connectSync() {
    if (!window.RTF_STORE) {
        alert('Store not loaded.');
        return;
    }
    const form = getSyncFormValues();
    setAutoConnectCancelledPreference(form.autoConnect === false);
    window.RTF_STORE.setSyncConfig({
        ...form,
        enabled: true
    }, { reconnect: false });
    applySyncConfigToForm(window.RTF_STORE.getSyncConfig());
    const result = await window.RTF_STORE.connectSync({ explicit: true });
    if (!result.ok) {
        const status = window.RTF_STORE.getSyncStatus();
        alert(status.lastError || 'Failed to connect cloud sync.');
    }
}

async function disconnectSync() {
    if (!window.RTF_STORE) return;
    await window.RTF_STORE.disconnectSync('manual');
}

async function cancelAutoConnect() {
    setAutoConnectCancelledPreference(true);
    if (!window.RTF_STORE) {
        setQuickStatus('auto-connect disabled for this browser.');
        return;
    }

    window.RTF_STORE.setSyncConfig({ autoConnect: false }, { reconnect: false });
    applySyncConfigToForm(window.RTF_STORE.getSyncConfig());

    const status = window.RTF_STORE.getSyncStatus();
    if (status && (status.connected || status.mode === 'connecting')) {
        await window.RTF_STORE.disconnectSync('manual');
    }

    const nextStatus = window.RTF_STORE.getSyncStatus();
    setSyncStatusText(nextStatus);
    setQuickStatus('auto-connect disabled for this browser.');
    alert('Auto-connect disabled for this browser. Re-check "Auto-connect on load" and save config to re-enable.');
}

async function pullSyncNow() {
    if (!window.RTF_STORE) return;
    const result = await window.RTF_STORE.pullFromCloud({ force: true });
    if (!result.ok) {
        if (result.reason === 'conflict') {
            alert('Protected sync conflict detected while pulling. Resolve it in the Cloud Sync panel.');
            return;
        }
        const status = window.RTF_STORE.getSyncStatus();
        alert(status.lastError || 'Cloud pull failed.');
    }
}

async function pushSyncNow() {
    if (!window.RTF_STORE) return;
    const result = await window.RTF_STORE.pushToCloud();
    if (!result.ok) {
        if (result.reason === 'conflict') {
            alert('Protected sync conflict detected. Routine row edits auto-resolve; use "Accept Remote" or "Keep Local + Merge Push" for shared boards/core/HQ changes.');
            return;
        }
        if (result.reason === 'locked') {
            const proceed = confirm('Another player has an active soft lock on one of your dirty scopes. Force push anyway?');
            if (proceed) {
                const forced = await window.RTF_STORE.pushToCloud({ force: true });
                if (forced.ok) return;
            }
        }
        const status = window.RTF_STORE.getSyncStatus();
        alert(status.lastError || 'Cloud push failed.');
    }
}

async function anonymousSignIn() {
    if (!window.RTF_STORE) return;
    const profile = (document.getElementById('sync-profile').value || '').trim();
    const result = await window.RTF_STORE.signInAnonymously(profile);
    if (!result.ok) {
        const status = window.RTF_STORE.getSyncStatus();
        alert(status.lastError || 'Anonymous sign-in failed.');
    }
}

async function passwordSignIn() {
    if (!window.RTF_STORE || typeof window.RTF_STORE.signInWithPassword !== 'function') return;
    const email = (document.getElementById('sync-email').value || '').trim();
    const password = (document.getElementById('sync-password').value || '').trim();
    const profile = (document.getElementById('sync-profile').value || '').trim();
    const result = await window.RTF_STORE.signInWithPassword(email, password, profile);
    if (!result.ok) {
        alert(result.error || 'Player login failed.');
        return;
    }
    setQuickStatus('player login saved for this browser.');
}

async function signOutSync() {
    if (!window.RTF_STORE) return;
    const result = await window.RTF_STORE.signOutSyncUser();
    if (!result.ok) alert(result.error || 'Sign out failed.');
}

async function acceptRemoteConflict() {
    if (!window.RTF_STORE || typeof window.RTF_STORE.resolvePendingConflict !== 'function') return;
    const result = await window.RTF_STORE.resolvePendingConflict('accept-remote');
    if (!result.ok) {
        alert(result.error || 'Failed to accept remote state.');
    }
}

async function keepLocalConflict() {
    if (!window.RTF_STORE || typeof window.RTF_STORE.resolvePendingConflict !== 'function') return;
    const result = await window.RTF_STORE.resolvePendingConflict('keep-local');
    if (!result.ok) {
        const status = window.RTF_STORE.getSyncStatus ? window.RTF_STORE.getSyncStatus() : null;
        alert((status && status.lastError) || result.error || 'Failed to keep local changes.');
    }
}

function exportConnectFile() {
    if (!window.RTF_STORE) {
        alert('Store not loaded.');
        return;
    }
    const config = window.RTF_STORE.getSyncConfig();
    const payload = {
        supabaseUrl: config.supabaseUrl || '',
        anonKey: config.anonKey || '',
        campaignId: config.campaignId || '',
        profileName: '',
        collabRelayUrl: config.collabRelayUrl || '',
        backendMode: config.backendMode || 'legacy',
        autoConnect: config.autoConnect !== false
    };
    const form = getSyncFormValues();
    const loginEmail = form.loginEmail;
    const loginPassword = form.loginPassword;
    if (loginEmail || loginPassword) {
        if (!loginEmail || !loginPassword) {
            alert('Enter both Login Email and Login Password before exporting them in connect.json.');
            return;
        }
        payload.login = {
            email: loginEmail,
            password: loginPassword
        };
    }
    const optionalTableKeys = [
        'schema',
        'tableName',
        'boardRoomsTable',
        'boardHistoryTable',
        'normalizedCoreTable',
        'normalizedHQTable',
        'normalizedCaseStateTable',
        'normalizedCaseBoardsTable',
        'normalizedCaseEventsTable',
        'normalizedScopeVersionsTable',
        'normalizedPlayersTable',
        'normalizedNPCsTable',
        'normalizedLocationsTable',
        'normalizedRequisitionsTable',
        'normalizedEncountersTable'
    ];
    optionalTableKeys.forEach((key) => {
        const value = config[key];
        if (typeof value === 'string' && value.trim()) payload[key] = value.trim();
    });
    if (!payload.supabaseUrl || !payload.anonKey || !payload.campaignId) {
        alert('Missing URL, anon key, or campaign ID.');
        return;
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'connect.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

function initSyncPanel() {
    if (!window.RTF_STORE) {
        setTimeout(initSyncPanel, 120);
        return;
    }
    renderCaseSwitcher();
    renderCampaignContext();
    renderCampaignOverview();
    const caseInput = document.getElementById('new-case-name');
    if (caseInput && !caseInput.dataset.boundEnter) {
        caseInput.dataset.boundEnter = '1';
        caseInput.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            createCaseFromInput();
        });
    }
    const scopeInput = document.getElementById('campaign-scope-name');
    if (scopeInput && !scopeInput.dataset.boundEnter) {
        scopeInput.dataset.boundEnter = '1';
        scopeInput.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            createCampaignScopeFromInput();
        });
    }
    loadCustomizeDefaults();
    applySyncConfigToForm(window.RTF_STORE.getSyncConfig());
    renderBoardAdminSelectors();
    latestSyncStatus = window.RTF_STORE.getSyncStatus();
    setSyncStatusText(latestSyncStatus);
    setQuickStatusFromSync(latestSyncStatus);
    syncSecretModeUi();
    refreshBoardAdminPanel().catch(() => { });
    window.RTF_STORE.onSyncStatus((status) => {
        latestSyncStatus = status;
        setSyncStatusText(status);
        setQuickStatusFromSync(status);
        updateSyncPanelVisibility(status);
        refreshBoardAdminPanel().catch(() => { });
    });
    tryAutoConnectFromBundledDefault();
}

bindDelegatedDataHandlers();

window.addEventListener('load', initSyncPanel);
window.addEventListener('rtf-store-updated', () => {
    renderCaseSwitcher();
    renderCampaignContext();
    renderCampaignOverview();
    renderBoardAdminSelectors();
    refreshBoardAdminPanel().catch(() => { });
});
window.addEventListener('rtf-sync-status', (event) => {
    latestSyncStatus = event.detail || null;
    setSyncStatusText(latestSyncStatus);
    setQuickStatusFromSync(latestSyncStatus);
    updateSyncPanelVisibility(latestSyncStatus);
    refreshBoardAdminPanel().catch(() => { });
});
window.addEventListener('rtf-sync-conflict', () => {
    const status = window.RTF_STORE && window.RTF_STORE.getSyncStatus ? window.RTF_STORE.getSyncStatus() : latestSyncStatus;
    setSyncStatusText(status || latestSyncStatus);
});
