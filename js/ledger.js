(function () {
    const delegatedHandlerEvents = ['click', 'change', 'input'];
    const delegatedHandlerCache = new Map();
    let delegatedHandlersBound = false;

    const LEDGER_SOURCE_TYPES = ['case', 'event', 'npc', 'location', 'theory', 'clue', 'requisition', 'other'];
    const SOURCE_LABELS = {
        case: 'Case',
        event: 'Event',
        npc: 'NPC',
        location: 'Location',
        theory: 'Theory',
        clue: 'Clue',
        requisition: 'Requisition',
        other: 'Other'
    };

    const LINKED_SOURCE_TYPE_LIST = ['case', 'event', 'npc', 'location', 'theory', 'clue', 'requisition'];
    const LINKED_SOURCE_TYPES = new Set(LINKED_SOURCE_TYPE_LIST);
    const SOURCE_LINK_INDEX = Object.fromEntries(LINKED_SOURCE_TYPE_LIST.map((type) => [type, []]));

    let filtersHydrated = false;

    const escapeHtml = (value = '') => String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    const escapeJsString = (value = '') => String(value || '')
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/\r/g, '\\r')
        .replace(/\n/g, '\\n')
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029');

    const getStore = () => window.RTF_STORE;

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
        } catch (err) {
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

    function getCases() {
        const store = getStore();
        if (!store || typeof store.getCases !== 'function') return [];
        const list = store.getCases();
        return Array.isArray(list) ? list : [];
    }

    function getCaseName(caseId) {
        const cleanId = String(caseId || '').trim();
        if (!cleanId) return 'Unknown Case';
        const match = getCases().find((entry) => String(entry && entry.id || '') === cleanId);
        if (!match) return cleanId;
        return String(match.name || cleanId);
    }

    function normalizeSourceType(value, fallback = 'other') {
        const clean = String(value || '').trim().toLowerCase();
        const mapped = clean === 'manual' ? 'other' : (clean === 'person' ? 'npc' : clean);
        if (LEDGER_SOURCE_TYPES.includes(mapped)) return mapped;
        return LEDGER_SOURCE_TYPES.includes(fallback) ? fallback : 'other';
    }

    function normalizeSourceId(value) {
        return String(value || '').trim();
    }

    function isBoardNodeId(value) {
        return /^node_[a-z0-9_-]+$/i.test(normalizeSourceId(value));
    }

    function isLinkedSourceType(sourceType) {
        return LINKED_SOURCE_TYPES.has(normalizeSourceType(sourceType));
    }

    function clearSourceLinkIndex() {
        LINKED_SOURCE_TYPE_LIST.forEach((type) => {
            SOURCE_LINK_INDEX[type] = [];
        });
    }

    function mapBoardNodeTypeToSourceTypes(nodeType) {
        switch (String(nodeType || '').trim().toLowerCase()) {
            case 'person':
                return ['npc'];
            case 'location':
                return ['location'];
            case 'theory':
                return ['theory'];
            case 'clue':
                return ['clue'];
            case 'event':
                return ['event'];
            case 'requisition':
                return ['requisition'];
            default:
                return [];
        }
    }

    function refreshSourceLinkIndex() {
        clearSourceLinkIndex();
        const store = getStore();
        if (!store) return;

        const cases = getCases();
        const seen = new Set();

        const pushOption = (sourceType, sourceId, label, caseId = '') => {
            const cleanType = normalizeSourceType(sourceType);
            if (!isLinkedSourceType(cleanType)) return;
            const cleanId = normalizeSourceId(sourceId);
            if (!cleanId) return;
            const cleanCaseId = String(caseId || '').trim();
            const key = `${cleanType}:${cleanCaseId}:${cleanId}`;
            if (seen.has(key)) return;
            seen.add(key);
            SOURCE_LINK_INDEX[cleanType].push({
                id: cleanId,
                label: String(label || cleanId).trim().slice(0, 240) || cleanId,
                caseId: cleanCaseId
            });
        };

        cases.forEach((caseEntry) => {
            const caseId = String(caseEntry && caseEntry.id || '').trim();
            if (!caseId) return;
            const caseName = String(caseEntry && caseEntry.name || caseId).trim() || caseId;
            pushOption('case', caseId, `[Case] ${caseName}`, caseId);

            if (typeof store.getEvents === 'function') {
                const events = store.getEvents(caseId);
                (Array.isArray(events) ? events : []).forEach((evt) => {
                    const evtId = String(evt && evt.id || '').trim();
                    if (!evtId) return;
                    const evtTitle = String(evt && evt.title || evtId).trim() || evtId;
                    pushOption('event', evtId, `[Timeline] ${evtTitle} • ${caseName}`, caseId);
                });
            }

            if (typeof store.getBoard === 'function') {
                const board = store.getBoard(caseId);
                const nodes = Array.isArray(board && board.nodes) ? board.nodes : [];
                nodes.forEach((node) => {
                    const nodeId = String(node && node.id || '').trim();
                    if (!isBoardNodeId(nodeId)) return;
                    const nodeTitle = String(node && node.title || nodeId).trim() || nodeId;
                    const nodeType = String(node && node.type || 'node').trim().toLowerCase();
                    const sourceTypes = mapBoardNodeTypeToSourceTypes(nodeType);
                    sourceTypes.forEach((type) => {
                        pushOption(type, nodeId, `[Board] ${nodeTitle} (${nodeType}) • ${caseName}`, caseId);
                    });
                });
            }
        });

        if (typeof store.getNPCs === 'function') {
            const npcs = store.getNPCs();
            (Array.isArray(npcs) ? npcs : []).forEach((npc) => {
                const id = String(npc && npc.id || '').trim();
                if (!id) return;
                const name = String(npc && (npc.name || npc.title) || id).trim() || id;
                pushOption('npc', id, `[NPC] ${name}`, '');
            });
        }

        if (typeof store.getLocations === 'function') {
            const locations = store.getLocations();
            (Array.isArray(locations) ? locations : []).forEach((location) => {
                const id = String(location && location.id || '').trim();
                if (!id) return;
                const name = String(location && (location.name || location.title) || id).trim() || id;
                pushOption('location', id, `[Location] ${name}`, '');
            });
        }

        if (typeof store.getRequisitions === 'function') {
            const requisitions = store.getRequisitions();
            (Array.isArray(requisitions) ? requisitions : []).forEach((requisition) => {
                const id = String(requisition && requisition.id || '').trim();
                if (!id) return;
                const name = String(requisition && (requisition.item || requisition.title || requisition.name) || id).trim() || id;
                pushOption('requisition', id, `[Req] ${name}`, '');
            });
        }

        LINKED_SOURCE_TYPE_LIST.forEach((type) => {
            SOURCE_LINK_INDEX[type].sort((a, b) => {
                const labelDelta = String(a.label || '').localeCompare(String(b.label || ''));
                if (labelDelta !== 0) return labelDelta;
                return String(a.id || '').localeCompare(String(b.id || ''));
            });
        });
    }

    function getSourceOptionsForType(sourceType, caseId = '') {
        const cleanType = normalizeSourceType(sourceType);
        if (!isLinkedSourceType(cleanType)) return [];

        const list = Array.isArray(SOURCE_LINK_INDEX[cleanType]) ? SOURCE_LINK_INDEX[cleanType] : [];
        const cleanCaseId = String(caseId || '').trim();
        if (!cleanCaseId) return list;

        const scoped = list.filter((entry) => {
            const entryCaseId = String(entry && entry.caseId || '').trim();
            return !entryCaseId || entryCaseId === cleanCaseId;
        });

        return scoped.length ? scoped : list;
    }

    function getSourceDisplayOptions(sourceType, caseId = '') {
        const options = getSourceOptionsForType(sourceType, caseId);
        const seenLabels = new Map();
        return options.map((entry) => {
            const baseLabel = String(entry && entry.label || entry && entry.id || '').trim();
            const safeLabel = baseLabel || String(entry && entry.id || '').trim();
            const count = (seenLabels.get(safeLabel) || 0) + 1;
            seenLabels.set(safeLabel, count);
            return {
                ...(entry || {}),
                displayLabel: count === 1 ? safeLabel : `${safeLabel} (${count})`
            };
        });
    }

    function resolveSourceInputToId(sourceType, value, caseId = '') {
        const cleanType = normalizeSourceType(sourceType);
        const raw = String(value || '').trim();
        if (!isLinkedSourceType(cleanType)) return '';
        if (!raw) return '';
        const options = getSourceDisplayOptions(cleanType, caseId);
        const byDisplay = options.find((entry) => String(entry && entry.displayLabel || '').trim() === raw);
        if (byDisplay && byDisplay.id) return String(byDisplay.id);
        const byLabel = options.find((entry) => String(entry && entry.label || '').trim() === raw);
        if (byLabel && byLabel.id) return String(byLabel.id);
        const byId = options.find((entry) => String(entry && entry.id || '').trim() === raw);
        if (byId && byId.id) return String(byId.id);
        return '';
    }

    function getSourceDisplayValue(sourceType, sourceId, caseId = '') {
        const cleanType = normalizeSourceType(sourceType);
        const cleanId = normalizeSourceId(sourceId);
        if (!isLinkedSourceType(cleanType) || !cleanId) return '';
        const options = getSourceDisplayOptions(cleanType, caseId);
        const match = options.find((entry) => String(entry && entry.id || '') === cleanId);
        return String(match && match.displayLabel || '').trim();
    }

    function getSourcePickerPlaceholder(sourceType, optionsCount) {
        const cleanType = normalizeSourceType(sourceType);
        if (!isLinkedSourceType(cleanType)) return 'No linked record required';
        const label = String(SOURCE_LABELS[cleanType] || cleanType).toLowerCase();
        return optionsCount
            ? `Filter ${label} records`
            : `No ${label} records available`;
    }

    function isValidLinkedSourceId(sourceType, sourceId, caseId = '') {
        const cleanType = normalizeSourceType(sourceType);
        const cleanId = normalizeSourceId(sourceId);
        if (!isLinkedSourceType(cleanType)) return !cleanId;
        if (!cleanId) return true;
        return getSourceOptionsForType(cleanType, caseId).some((entry) => String(entry && entry.id || '') === cleanId);
    }

    function buildSourceDatalistOptions(sourceType, caseId = '') {
        const options = getSourceDisplayOptions(sourceType, caseId);
        return options.map((entry) => {
            const display = String(entry && entry.displayLabel || '');
            return `<option value="${escapeHtml(display)}"></option>`;
        }).join('');
    }

    function buildSourceTypeOptions(selected = 'other', includeAll = false, fallback = 'other') {
        const selectedToken = includeAll && String(selected || '').trim().toLowerCase() === 'all'
            ? 'all'
            : normalizeSourceType(selected, fallback);
        const optionRows = LEDGER_SOURCE_TYPES.map((type) =>
            `<option value="${type}" ${type === selectedToken ? 'selected' : ''}>${escapeHtml(SOURCE_LABELS[type] || type)}</option>`
        ).join('');
        if (!includeAll) return optionRows;
        const allSelected = selectedToken === 'all' ? 'selected' : '';
        return `<option value="all" ${allSelected}>All</option>${optionRows}`;
    }

    function ensureSourceTypeOptions() {
        const sourceSelect = document.getElementById('ledgerSourceType');
        const sourceFilterSelect = document.getElementById('ledgerFilterSource');
        if (sourceSelect) {
            const selected = normalizeSourceType(sourceSelect.value || 'case', 'case');
            sourceSelect.innerHTML = buildSourceTypeOptions(selected, false, 'case');
            sourceSelect.value = selected;
        }
        if (sourceFilterSelect) {
            const selectedFilterRaw = String(sourceFilterSelect.value || 'all').trim().toLowerCase();
            const selectedFilter = (selectedFilterRaw === 'all' || LEDGER_SOURCE_TYPES.includes(selectedFilterRaw))
                ? selectedFilterRaw
                : 'all';
            sourceFilterSelect.innerHTML = buildSourceTypeOptions(selectedFilter, true, 'other');
            sourceFilterSelect.value = selectedFilter;
        }
    }

    function refreshLedgerSourcePicker() {
        refreshSourceLinkIndex();
        ensureSourceTypeOptions();

        const sourceTypeEl = document.getElementById('ledgerSourceType');
        const caseEl = document.getElementById('ledgerCase');
        const sourceIdEl = document.getElementById('ledgerSourceId');
        const datalistEl = document.getElementById('ledgerSourceOptions');
        if (!sourceTypeEl || !sourceIdEl || !datalistEl) return;

        const sourceType = normalizeSourceType(sourceTypeEl.value, 'case');
        const caseId = String(caseEl && caseEl.value || '').trim();
        const options = getSourceOptionsForType(sourceType, caseId);

        if (!isLinkedSourceType(sourceType)) {
            sourceIdEl.value = '';
            sourceIdEl.disabled = true;
            sourceIdEl.placeholder = getSourcePickerPlaceholder(sourceType, 0);
            sourceIdEl.removeAttribute('list');
            datalistEl.innerHTML = '';
            return;
        }

        sourceIdEl.disabled = false;
        sourceIdEl.setAttribute('list', 'ledgerSourceOptions');
        sourceIdEl.placeholder = getSourcePickerPlaceholder(sourceType, options.length);
        datalistEl.innerHTML = buildSourceDatalistOptions(sourceType, caseId);
        const resolved = resolveSourceInputToId(sourceType, sourceIdEl.value || '', caseId);
        if (resolved) {
            const display = getSourceDisplayValue(sourceType, resolved, caseId);
            if (display) sourceIdEl.value = display;
        } else if (sourceIdEl.value && !isValidLinkedSourceId(sourceType, sourceIdEl.value, caseId)) {
            sourceIdEl.value = '';
        }
    }

    function ensureCaseSelectOptions() {
        const caseSelect = document.getElementById('ledgerCase');
        const caseFilter = document.getElementById('ledgerFilterCase');
        if (!caseSelect || !caseFilter) return;

        const store = getStore();
        const cases = getCases();
        const activeCaseId = store && typeof store.getActiveCaseId === 'function'
            ? String(store.getActiveCaseId() || 'case_primary')
            : 'case_primary';

        const selectedCase = String(caseSelect.value || activeCaseId);
        const selectedFilterCase = String(caseFilter.value || 'all');

        caseSelect.innerHTML = cases.map((entry) => {
            const id = String(entry && entry.id || '');
            const name = String(entry && entry.name || id || 'Case');
            return `<option value="${escapeHtml(id)}">${escapeHtml(name)}</option>`;
        }).join('');

        if (cases.some((entry) => String(entry && entry.id || '') === selectedCase)) {
            caseSelect.value = selectedCase;
        } else if (cases.some((entry) => String(entry && entry.id || '') === activeCaseId)) {
            caseSelect.value = activeCaseId;
        } else if (cases.length) {
            caseSelect.value = String(cases[0].id || '');
        }

        caseFilter.innerHTML = '<option value="all">All Cases</option>' + cases.map((entry) => {
            const id = String(entry && entry.id || '');
            const name = String(entry && entry.name || id || 'Case');
            return `<option value="${escapeHtml(id)}">${escapeHtml(name)}</option>`;
        }).join('');

        if (selectedFilterCase === 'all' || cases.some((entry) => String(entry && entry.id || '') === selectedFilterCase)) {
            caseFilter.value = selectedFilterCase;
        }
    }

    function hydrateUIFromLedgerState() {
        if (filtersHydrated) return;
        const store = getStore();
        if (!store || typeof store.getLedgerState !== 'function') return;

        const state = store.getLedgerState();
        const ui = state && state.ui && typeof state.ui === 'object' ? state.ui : {};
        const sourceFilter = document.getElementById('ledgerFilterSource');
        const searchInput = document.getElementById('ledgerSearch');
        const sortSelect = document.getElementById('ledgerSort');

        if (sourceFilter && ui.filter) sourceFilter.value = String(ui.filter);
        if (searchInput && ui.search) searchInput.value = String(ui.search);
        if (sortSelect && ui.sort) sortSelect.value = String(ui.sort);

        filtersHydrated = true;
    }

    function persistLedgerUIState() {
        const store = getStore();
        if (!store || typeof store.updateLedgerUI !== 'function') return;

        const sourceFilter = String((document.getElementById('ledgerFilterSource') || {}).value || 'all');
        const search = String((document.getElementById('ledgerSearch') || {}).value || '').trim();
        const sort = String((document.getElementById('ledgerSort') || {}).value || 'updated_desc');
        store.updateLedgerUI({ filter: sourceFilter, search, sort });
    }

    function getFilterValues() {
        const caseFilter = String((document.getElementById('ledgerFilterCase') || {}).value || 'all');
        const sourceFilter = String((document.getElementById('ledgerFilterSource') || {}).value || 'all');
        const search = String((document.getElementById('ledgerSearch') || {}).value || '').trim().toLowerCase();
        const sort = String((document.getElementById('ledgerSort') || {}).value || 'updated_desc');
        return { caseFilter, sourceFilter, search, sort };
    }

    function readEntries() {
        const store = getStore();
        if (!store || typeof store.getLedgerEntries !== 'function') return [];
        const list = store.getLedgerEntries();
        return Array.isArray(list) ? list.slice() : [];
    }

    function sortEntries(entries, sortMode) {
        const list = entries.slice();
        if (sortMode === 'updated_asc') {
            list.sort((a, b) => String(a.lastChangedAt || '').localeCompare(String(b.lastChangedAt || '')));
            return list;
        }
        if (sortMode === 'statement_asc') {
            list.sort((a, b) => String(a.statement || '').localeCompare(String(b.statement || '')));
            return list;
        }
        if (sortMode === 'statement_desc') {
            list.sort((a, b) => String(b.statement || '').localeCompare(String(a.statement || '')));
            return list;
        }
        if (sortMode === 'source') {
            list.sort((a, b) => {
                const aSource = String(SOURCE_LABELS[normalizeSourceType(a && a.sourceType)] || normalizeSourceType(a && a.sourceType));
                const bSource = String(SOURCE_LABELS[normalizeSourceType(b && b.sourceType)] || normalizeSourceType(b && b.sourceType));
                const sourceDelta = aSource.localeCompare(bSource);
                if (sourceDelta !== 0) return sourceDelta;
                return String(b.lastChangedAt || '').localeCompare(String(a.lastChangedAt || ''));
            });
            return list;
        }
        list.sort((a, b) => String(b.lastChangedAt || '').localeCompare(String(a.lastChangedAt || '')));
        return list;
    }

    function getFilteredEntries(entries, filters) {
        const cleanFilters = filters || getFilterValues();
        const filtered = entries.filter((entry) => {
            if (!entry || typeof entry !== 'object') return false;
            const caseMatch = cleanFilters.caseFilter === 'all' || String(entry.caseId || '') === cleanFilters.caseFilter;
            const sourceType = normalizeSourceType(entry.sourceType);
            const sourceMatch = cleanFilters.sourceFilter === 'all' || sourceType === cleanFilters.sourceFilter;
            const haystack = `${entry.statement || ''} ${entry.tags || ''} ${entry.notes || ''} ${entry.sourceId || ''} ${entry.lastChangedBy || ''} ${sourceType}`.toLowerCase();
            const searchMatch = cleanFilters.search ? haystack.includes(cleanFilters.search) : true;
            return caseMatch && sourceMatch && searchMatch;
        });
        return sortEntries(filtered, cleanFilters.sort);
    }

    function findEntryById(id) {
        const cleanId = String(id || '').trim();
        if (!cleanId) return null;
        const list = readEntries();
        return list.find((entry) => String(entry && entry.id || '') === cleanId) || null;
    }

    function renderFactStatement(statement) {
        return escapeHtml(String(statement || '').trim()).replace(/\n/g, '<br>');
    }

    function buildEntryCard(entry) {
        const entryId = escapeJsString(entry.id || '');
        const sourceType = normalizeSourceType(entry.sourceType);
        const sourceLabel = SOURCE_LABELS[sourceType] || sourceType;
        const sourceId = normalizeSourceId(entry.sourceId);
        const sourceDisplay = getSourceDisplayValue(sourceType, sourceId, entry.caseId) || '';
        const caseName = getCaseName(entry.caseId);
        const tags = String(entry.tags || '').trim();

        const sourceTimelineAction = sourceType === 'event' && sourceId && !isBoardNodeId(sourceId)
            ? `<button class="btn" data-onclick="openLedgerSourceOnTimeline('${entryId}')">Timeline</button>`
            : '';

        const sourceBoardAction = sourceId && (
            isBoardNodeId(sourceId)
            || sourceType === 'event'
            || sourceType === 'npc'
            || sourceType === 'location'
            || sourceType === 'requisition'
        )
            ? `<button class="btn" data-onclick="openLedgerSourceOnBoard('${entryId}')">Board</button>`
            : '';

        return `
            <article class="ledger-entry">
                <div class="ledger-entry-head">
                    <div class="ledger-pill-row">
                        <span class="ledger-pill">${escapeHtml(sourceLabel)}</span>
                        <span class="ledger-pill">Case: ${escapeHtml(caseName)}</span>
                        ${sourceDisplay ? `<span class="ledger-pill">Link: ${escapeHtml(sourceDisplay)}</span>` : ''}
                        ${tags ? `<span class="ledger-pill">Tags: ${escapeHtml(tags)}</span>` : ''}
                    </div>
                </div>
                <div class="ledger-fact-text">${renderFactStatement(entry.statement)}</div>
                ${entry.notes ? `<div class="ledger-fact-notes">${renderFactStatement(entry.notes)}</div>` : ''}
                <div class="ledger-meta">
                    Updated ${entry.lastChangedAt ? new Date(entry.lastChangedAt).toLocaleString() : '—'}${entry.lastChangedBy ? ` by ${escapeHtml(entry.lastChangedBy)}` : ''}
                </div>
                <div class="ledger-actions">
                    ${sourceTimelineAction}
                    ${sourceBoardAction}
                    <button class="btn btn-danger" data-onclick="deleteLedgerEntry('${entryId}')">Delete</button>
                </div>
            </article>
        `;
    }

    function renderStableFactsPanel(entries, filters) {
        const stableSummary = document.getElementById('ledgerStableSummary');
        const stableList = document.getElementById('ledgerStableFacts');
        if (!stableSummary || !stableList) return;

        const allEntries = Array.isArray(entries) ? entries : [];
        const caseFilter = filters.caseFilter === 'all' ? '' : filters.caseFilter;
        const scoped = caseFilter
            ? allEntries.filter((entry) => String(entry && entry.caseId || '') === caseFilter)
            : allEntries;

        stableSummary.textContent = `${scoped.length} pinned facts${caseFilter ? ` • ${getCaseName(caseFilter)}` : ''}`;

        if (!scoped.length) {
            stableList.innerHTML = '<div class="ledger-empty">No pinned facts yet.</div>';
            return;
        }

        stableList.innerHTML = scoped
            .map((entry) => `<div class="stable-fact-item">${renderFactStatement(entry && entry.statement || '')}</div>`)
            .join('');
    }

    function renderLedger() {
        const listEl = document.getElementById('ledgerList');
        const summaryEl = document.getElementById('ledgerSummary');
        if (!listEl || !summaryEl) return;

        if (!getStore()) {
            listEl.innerHTML = '<div class="ledger-empty">Store unavailable.</div>';
            summaryEl.textContent = 'Waiting for store...';
            return;
        }

        ensureCaseSelectOptions();
        ensureSourceTypeOptions();
        hydrateUIFromLedgerState();
        refreshLedgerSourcePicker();

        const filters = getFilterValues();
        const entries = readEntries();
        const filtered = getFilteredEntries(entries, filters);

        summaryEl.textContent = `${filtered.length} visible facts • ${entries.length} total`;
        listEl.innerHTML = filtered.length
            ? filtered.map(buildEntryCard).join('')
            : '<div class="ledger-empty">No facts match these filters.</div>';

        renderStableFactsPanel(entries, filters);
    }

    function onLedgerFilterChange() {
        persistLedgerUIState();
        renderLedger();
    }

    function createLedgerEntry() {
        const store = getStore();
        if (!store || typeof store.addLedgerEntry !== 'function') {
            alert('Store not ready. Reload and try again.');
            return;
        }

        const statementEl = document.getElementById('ledgerStatement');
        const statement = String(statementEl && statementEl.value || '').trim();
        if (!statement) {
            alert('Fact statement is required.');
            return;
        }

        refreshSourceLinkIndex();
        ensureCaseSelectOptions();

        const caseId = String((document.getElementById('ledgerCase') || {}).value || '');
        const sourceType = normalizeSourceType(String((document.getElementById('ledgerSourceType') || {}).value || 'case'), 'case');
        const sourceInput = String((document.getElementById('ledgerSourceId') || {}).value || '');
        let sourceId = resolveSourceInputToId(sourceType, sourceInput, caseId);

        if (!isLinkedSourceType(sourceType)) {
            sourceId = '';
        } else if (sourceInput.trim() && !sourceId) {
            alert('Select a valid linked record from the filterable list.');
            return;
        }

        const tags = String((document.getElementById('ledgerTags') || {}).value || '');
        const notes = String((document.getElementById('ledgerNotes') || {}).value || '');

        const entryId = store.addLedgerEntry({
            caseId,
            statement,
            sourceType,
            sourceId,
            tags,
            notes
        });

        if (!entryId) {
            alert('Could not pin fact.');
            return;
        }

        if (statementEl) statementEl.value = '';
        const sourceIdEl = document.getElementById('ledgerSourceId');
        if (sourceIdEl) sourceIdEl.value = '';
        const tagsEl = document.getElementById('ledgerTags');
        if (tagsEl) tagsEl.value = '';
        const notesEl = document.getElementById('ledgerNotes');
        if (notesEl) notesEl.value = '';

        refreshLedgerSourcePicker();
        renderLedger();
    }

    function deleteLedgerEntry(id) {
        const store = getStore();
        if (!store || typeof store.deleteLedgerEntry !== 'function') return;
        if (!confirm('Delete this pinned fact?')) return;
        store.deleteLedgerEntry(id);
        renderLedger();
    }

    function openLedgerSourceOnTimeline(id) {
        const entry = findEntryById(id);
        if (!entry || normalizeSourceType(entry.sourceType) !== 'event') {
            alert('This fact is not linked to an event source.');
            return;
        }
        const sourceId = normalizeSourceId(entry.sourceId);
        if (!sourceId || isBoardNodeId(sourceId)) {
            alert('No timeline event record is linked.');
            return;
        }
        const url = new URL('timeline.html', window.location.href);
        url.searchParams.set('id', sourceId);
        window.location.assign(url.toString());
    }

    function openLedgerSourceOnBoard(id) {
        const entry = findEntryById(id);
        if (!entry) {
            alert('Fact not found.');
            return;
        }

        const sourceType = normalizeSourceType(entry.sourceType);
        const sourceId = normalizeSourceId(entry.sourceId);
        if (!sourceId) {
            alert('This fact has no linked record.');
            return;
        }

        const url = new URL('board.html', window.location.href);
        if (isBoardNodeId(sourceId)) {
            url.searchParams.set('nodeId', sourceId);
            window.location.assign(url.toString());
            return;
        }

        if (sourceType === 'event') {
            url.searchParams.set('linkType', 'timeline-event');
            url.searchParams.set('id', sourceId);
            window.location.assign(url.toString());
            return;
        }

        if (sourceType === 'npc') {
            url.searchParams.set('linkType', 'npc');
            url.searchParams.set('id', sourceId);
            window.location.assign(url.toString());
            return;
        }

        if (sourceType === 'location') {
            url.searchParams.set('linkType', 'location');
            url.searchParams.set('id', sourceId);
            window.location.assign(url.toString());
            return;
        }

        if (sourceType === 'requisition') {
            url.searchParams.set('linkType', 'requisition');
            url.searchParams.set('id', sourceId);
            window.location.assign(url.toString());
            return;
        }

        alert('No board jump is available for this fact type.');
    }

    function getStableFactsText() {
        const filters = getFilterValues();
        const caseFilter = filters.caseFilter === 'all' ? null : filters.caseFilter;
        const store = getStore();
        if (!store || typeof store.getStableFacts !== 'function') return '';

        const facts = store.getStableFacts(caseFilter);
        if (!Array.isArray(facts) || !facts.length) return '';

        return facts.map((fact, idx) => `${idx + 1}. ${fact}`).join('\n');
    }

    function copyStableFacts() {
        const text = getStableFactsText();
        if (!text) {
            alert('No pinned facts to copy.');
            return;
        }

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(() => {
                alert('Facts copied.');
            }).catch(() => {
                alert('Clipboard write failed.');
            });
            return;
        }

        alert('Clipboard API unavailable.');
    }

    function exportStableFacts() {
        const text = getStableFactsText();
        if (!text) {
            alert('No pinned facts to export.');
            return;
        }

        const dateStamp = new Date().toISOString().slice(0, 10);
        const blob = new Blob([text + '\n'], { type: 'text/plain' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `ledger-facts-${dateStamp}.txt`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(link.href), 500);
    }

    let ledgerInitialized = false;

    function isWaitingForCloudStore() {
        const store = getStore();
        return !!(store
            && typeof store.isCloudOnlyMode === 'function'
            && store.isCloudOnlyMode()
            && typeof store.isInitialCloudPullPending === 'function'
            && store.isInitialCloudPullPending());
    }

    function waitForStore() {
        if (ledgerInitialized) return;
        if (!getStore() || isWaitingForCloudStore()) {
            setTimeout(waitForStore, 100);
            return;
        }
        renderLedger();
        ledgerInitialized = true;
    }

    window.renderLedger = renderLedger;
    window.onLedgerFilterChange = onLedgerFilterChange;
    window.refreshLedgerSourcePicker = refreshLedgerSourcePicker;
    window.createLedgerEntry = createLedgerEntry;
    window.deleteLedgerEntry = deleteLedgerEntry;
    window.openLedgerSourceOnTimeline = openLedgerSourceOnTimeline;
    window.openLedgerSourceOnBoard = openLedgerSourceOnBoard;
    window.copyStableFacts = copyStableFacts;
    window.exportStableFacts = exportStableFacts;

    bindDelegatedDataHandlers();
    window.addEventListener('load', waitForStore);
    window.addEventListener('rtf-store-updated', (event) => {
        if (!event || !event.detail) return;
        if (!ledgerInitialized) {
            waitForStore();
            return;
        }
        renderLedger();
    });
    window.addEventListener('rtf-sync-status', () => {
        if (!ledgerInitialized) waitForStore();
    });
})();
