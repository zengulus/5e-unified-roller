(function () {
    const delegatedHandlerEvents = ['click', 'change', 'input'];
    const delegatedHandlerCache = new Map();
    let delegatedHandlersBound = false;
    const LEDGER_STATUSES = ['stable', 'contested', 'collapsed', 'resolved'];
    const LEDGER_SOURCE_TYPES = ['manual', 'event', 'theory', 'clue', 'npc', 'location', 'requisition'];
    const STATUS_LABELS = {
        stable: 'Stable',
        contested: 'Contested',
        collapsed: 'Collapsed',
        resolved: 'Resolved'
    };
    const SOURCE_LABELS = {
        manual: 'Manual',
        event: 'Event',
        theory: 'Theory',
        clue: 'Clue',
        npc: 'NPC',
        location: 'Location',
        requisition: 'Requisition'
    };
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

    function buildStatusOptions(selected = 'stable') {
        const cleanSelected = LEDGER_STATUSES.includes(selected) ? selected : 'stable';
        return LEDGER_STATUSES.map((status) =>
            `<option value="${status}" ${status === cleanSelected ? 'selected' : ''}>${escapeHtml(STATUS_LABELS[status])}</option>`
        ).join('');
    }

    function buildSourceOptions(selected = 'manual') {
        const cleanSelected = LEDGER_SOURCE_TYPES.includes(selected) ? selected : 'manual';
        return LEDGER_SOURCE_TYPES.map((type) =>
            `<option value="${type}" ${type === cleanSelected ? 'selected' : ''}>${escapeHtml(SOURCE_LABELS[type])}</option>`
        ).join('');
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

        const selectedCase = caseSelect.value || activeCaseId;
        const selectedFilterCase = caseFilter.value || 'all';
        caseSelect.innerHTML = cases.map((entry) => {
            const id = String(entry && entry.id || '');
            const name = String(entry && entry.name || id || 'Case');
            return `<option value="${escapeHtml(id)}">${escapeHtml(name)}</option>`;
        }).join('');
        if (!caseSelect.value && cases.length) caseSelect.value = cases[0].id;
        if (cases.some((entry) => String(entry.id || '') === selectedCase)) {
            caseSelect.value = selectedCase;
        } else if (cases.some((entry) => String(entry.id || '') === activeCaseId)) {
            caseSelect.value = activeCaseId;
        }

        caseFilter.innerHTML = '<option value="all">All Cases</option>' + cases.map((entry) => {
            const id = String(entry && entry.id || '');
            const name = String(entry && entry.name || id || 'Case');
            return `<option value="${escapeHtml(id)}">${escapeHtml(name)}</option>`;
        }).join('');
        if (selectedFilterCase === 'all' || cases.some((entry) => String(entry.id || '') === selectedFilterCase)) {
            caseFilter.value = selectedFilterCase;
        }
    }

    function hydrateUIFromLedgerState() {
        if (filtersHydrated) return;
        const store = getStore();
        if (!store || typeof store.getLedgerState !== 'function') return;
        const state = store.getLedgerState();
        const ui = state && state.ui && typeof state.ui === 'object' ? state.ui : {};
        const statusFilter = document.getElementById('ledgerFilterStatus');
        const searchInput = document.getElementById('ledgerSearch');
        const sortSelect = document.getElementById('ledgerSort');
        if (statusFilter && ui.filter) statusFilter.value = String(ui.filter);
        if (searchInput && ui.search) searchInput.value = String(ui.search);
        if (sortSelect && ui.sort) sortSelect.value = String(ui.sort);
        filtersHydrated = true;
    }

    function persistLedgerUIState() {
        const store = getStore();
        if (!store || typeof store.updateLedgerUI !== 'function') return;
        const filterStatus = String((document.getElementById('ledgerFilterStatus') || {}).value || 'all');
        const search = String((document.getElementById('ledgerSearch') || {}).value || '').trim();
        const sort = String((document.getElementById('ledgerSort') || {}).value || 'updated_desc');
        store.updateLedgerUI({ filter: filterStatus, search, sort });
    }

    function getFilterValues() {
        const caseFilter = String((document.getElementById('ledgerFilterCase') || {}).value || 'all');
        const statusFilter = String((document.getElementById('ledgerFilterStatus') || {}).value || 'all');
        const sourceFilter = String((document.getElementById('ledgerFilterSource') || {}).value || 'all');
        const search = String((document.getElementById('ledgerSearch') || {}).value || '').trim().toLowerCase();
        const sort = String((document.getElementById('ledgerSort') || {}).value || 'updated_desc');
        return { caseFilter, statusFilter, sourceFilter, search, sort };
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
        if (sortMode === 'certainty_desc') {
            list.sort((a, b) => Number(b.certainty || 0) - Number(a.certainty || 0));
            return list;
        }
        if (sortMode === 'certainty_asc') {
            list.sort((a, b) => Number(a.certainty || 0) - Number(b.certainty || 0));
            return list;
        }
        if (sortMode === 'status') {
            const order = new Map(LEDGER_STATUSES.map((status, idx) => [status, idx]));
            list.sort((a, b) => {
                const diff = (order.get(String(a.status || 'stable')) || 0) - (order.get(String(b.status || 'stable')) || 0);
                if (diff !== 0) return diff;
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
            const statusMatch = cleanFilters.statusFilter === 'all' || String(entry.status || '') === cleanFilters.statusFilter;
            const sourceMatch = cleanFilters.sourceFilter === 'all' || String(entry.sourceType || '') === cleanFilters.sourceFilter;
            const haystack = `${entry.statement || ''} ${entry.tags || ''} ${entry.notes || ''} ${entry.sourceId || ''} ${entry.lastChangedBy || ''}`.toLowerCase();
            const searchMatch = cleanFilters.search ? haystack.includes(cleanFilters.search) : true;
            return caseMatch && statusMatch && sourceMatch && searchMatch;
        });
        return sortEntries(filtered, cleanFilters.sort);
    }

    function findEntryById(id) {
        const cleanId = String(id || '').trim();
        if (!cleanId) return null;
        const list = readEntries();
        return list.find((entry) => String(entry && entry.id || '') === cleanId) || null;
    }

    function buildEntryCard(entry) {
        const entryId = escapeJsString(entry.id || '');
        const status = LEDGER_STATUSES.includes(entry.status) ? entry.status : 'stable';
        const sourceType = LEDGER_SOURCE_TYPES.includes(entry.sourceType) ? entry.sourceType : 'manual';
        const sourceTimelineAction = sourceType === 'event' && entry.sourceId
            ? `<button class="btn" data-onclick="openLedgerSourceOnTimeline('${entryId}')">Timeline</button>`
            : '';
        const sourceBoardAction = (sourceType !== 'manual' && entry.sourceId)
            ? `<button class="btn" data-onclick="openLedgerSourceOnBoard('${entryId}')">Board</button>`
            : '';
        return `
            <article class="ledger-entry">
                <div class="ledger-entry-head">
                    <div class="ledger-pill-row">
                        <span class="ledger-pill status-${status}">${escapeHtml(STATUS_LABELS[status] || status)}</span>
                        <span class="ledger-pill">${escapeHtml(SOURCE_LABELS[sourceType] || sourceType)}</span>
                        <span class="ledger-pill">Case: ${escapeHtml(getCaseName(entry.caseId))}</span>
                        <span class="ledger-pill">Certainty ${Math.max(0, Math.min(100, Number(entry.certainty || 0)))}%</span>
                    </div>
                </div>
                <div class="ledger-entry-grid">
                    <div class="ledger-field ledger-field-wide">
                        <label>Statement</label>
                        <textarea rows="2" data-onchange="updateLedgerField('${entryId}', 'statement', this.value)">${escapeHtml(entry.statement || '')}</textarea>
                    </div>
                    <div class="ledger-field">
                        <label>Status</label>
                        <select data-onchange="updateLedgerField('${entryId}', 'status', this.value)">
                            ${buildStatusOptions(status)}
                        </select>
                    </div>
                    <div class="ledger-field">
                        <label>Source Type</label>
                        <select data-onchange="updateLedgerField('${entryId}', 'sourceType', this.value)">
                            ${buildSourceOptions(sourceType)}
                        </select>
                    </div>
                    <div class="ledger-field">
                        <label>Source ID</label>
                        <input type="text" value="${escapeHtml(entry.sourceId || '')}" data-onchange="updateLedgerField('${entryId}', 'sourceId', this.value)">
                    </div>
                    <div class="ledger-field">
                        <label>Case</label>
                        <select data-onchange="updateLedgerField('${entryId}', 'caseId', this.value)">
                            ${getCases().map((row) => {
                                const id = String(row && row.id || '');
                                const name = String(row && row.name || id || 'Case');
                                return `<option value="${escapeHtml(id)}" ${id === String(entry.caseId || '') ? 'selected' : ''}>${escapeHtml(name)}</option>`;
                            }).join('')}
                        </select>
                    </div>
                    <div class="ledger-field">
                        <label>Certainty</label>
                        <input type="number" min="0" max="100" step="1" value="${Math.max(0, Math.min(100, Number(entry.certainty || 0)))}"
                            data-onchange="updateLedgerField('${entryId}', 'certainty', this.value)">
                    </div>
                    <div class="ledger-field ledger-field-wide">
                        <label>Tags</label>
                        <input type="text" value="${escapeHtml(entry.tags || '')}" data-onchange="updateLedgerField('${entryId}', 'tags', this.value)">
                    </div>
                    <div class="ledger-field ledger-field-wide">
                        <label>Notes</label>
                        <textarea rows="2" data-onchange="updateLedgerField('${entryId}', 'notes', this.value)">${escapeHtml(entry.notes || '')}</textarea>
                    </div>
                </div>
                <div class="ledger-meta">
                    Updated ${entry.lastChangedAt ? new Date(entry.lastChangedAt).toLocaleString() : '—'}${entry.lastChangedBy ? ` by ${escapeHtml(entry.lastChangedBy)}` : ''} • Created ${entry.createdAt ? new Date(entry.createdAt).toLocaleString() : '—'}
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
        const contestedList = document.getElementById('ledgerContestedFacts');
        if (!stableSummary || !stableList || !contestedList) return;
        const allEntries = Array.isArray(entries) ? entries : [];
        const caseFilter = filters.caseFilter === 'all' ? '' : filters.caseFilter;
        const scoped = caseFilter
            ? allEntries.filter((entry) => String(entry.caseId || '') === caseFilter)
            : allEntries;
        const stable = scoped.filter((entry) => String(entry.status || '') === 'stable');
        const contestedEntries = scoped.filter((entry) => String(entry.status || '') === 'contested');
        const collapsedEntries = scoped.filter((entry) => String(entry.status || '') === 'collapsed');
        const contested = contestedEntries.length;
        const collapsed = collapsedEntries.length;
        const resolved = scoped.filter((entry) => String(entry.status || '') === 'resolved').length;
        stableSummary.textContent = `${stable.length} stable • ${contested} contested • ${collapsed} collapsed • ${resolved} resolved${caseFilter ? ` • ${getCaseName(caseFilter)}` : ''}`;

        if (!stable.length) {
            stableList.innerHTML = '<div class="ledger-empty">No stable facts yet.</div>';
        } else {
            stableList.innerHTML = stable.map((entry) => `<div class="stable-fact-item">${escapeHtml(entry.statement || '')}</div>`).join('');
        }
        const unstable = [...contestedEntries, ...collapsedEntries];
        if (!unstable.length) {
            contestedList.innerHTML = '<div class="ledger-empty">No contested or collapsed entries.</div>';
            return;
        }
        contestedList.innerHTML = unstable.map((entry) => {
            const status = String(entry.status || '');
            const statusLabel = status === 'collapsed' ? 'Collapsed' : 'Contested';
            const klass = status === 'collapsed' ? 'is-collapsed' : 'is-contested';
            return `<div class="stable-fact-item ${klass}"><strong>${statusLabel}:</strong> ${escapeHtml(entry.statement || '')}</div>`;
        }).join('');
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
        hydrateUIFromLedgerState();
        const filters = getFilterValues();
        const entries = readEntries();
        const filtered = getFilteredEntries(entries, filters);
        summaryEl.textContent = `${filtered.length} visible entries • ${entries.length} total`;
        listEl.innerHTML = filtered.length
            ? filtered.map(buildEntryCard).join('')
            : '<div class="ledger-empty">No entries match these filters.</div>';
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
            alert('Statement is required.');
            return;
        }
        ensureCaseSelectOptions();
        const caseId = String((document.getElementById('ledgerCase') || {}).value || '');
        const status = String((document.getElementById('ledgerStatus') || {}).value || 'stable');
        const sourceType = String((document.getElementById('ledgerSourceType') || {}).value || 'manual');
        const sourceId = String((document.getElementById('ledgerSourceId') || {}).value || '').trim();
        const certainty = Number((document.getElementById('ledgerCertainty') || {}).value || 50);
        const tags = String((document.getElementById('ledgerTags') || {}).value || '');
        const notes = String((document.getElementById('ledgerNotes') || {}).value || '');
        const entryId = store.addLedgerEntry({
            caseId,
            statement,
            status,
            sourceType,
            sourceId,
            certainty,
            tags,
            notes
        });
        if (!entryId) {
            alert('Could not add ledger entry.');
            return;
        }
        if (statementEl) statementEl.value = '';
        const sourceIdEl = document.getElementById('ledgerSourceId');
        if (sourceIdEl) sourceIdEl.value = '';
        const tagsEl = document.getElementById('ledgerTags');
        if (tagsEl) tagsEl.value = '';
        const notesEl = document.getElementById('ledgerNotes');
        if (notesEl) notesEl.value = '';
        renderLedger();
    }

    function updateLedgerField(id, field, value) {
        const store = getStore();
        if (!store || typeof store.updateLedgerEntry !== 'function') return;
        const cleanField = String(field || '').trim();
        if (!cleanField) return;
        const patch = cleanField === 'certainty'
            ? { certainty: Number(value) }
            : { [cleanField]: value };
        store.updateLedgerEntry(id, patch);
        renderLedger();
    }

    function deleteLedgerEntry(id) {
        const store = getStore();
        if (!store || typeof store.deleteLedgerEntry !== 'function') return;
        if (!confirm('Delete this ledger entry?')) return;
        store.deleteLedgerEntry(id);
        renderLedger();
    }

    function openLedgerSourceOnTimeline(id) {
        const entry = findEntryById(id);
        if (!entry || String(entry.sourceType || '') !== 'event' || !entry.sourceId) {
            alert('This entry is not linked to a timeline event source.');
            return;
        }
        const url = new URL('timeline.html', window.location.href);
        url.searchParams.set('id', String(entry.sourceId));
        window.location.assign(url.toString());
    }

    function openLedgerSourceOnBoard(id) {
        const entry = findEntryById(id);
        if (!entry || !entry.sourceId) {
            alert('This entry has no source link.');
            return;
        }
        const sourceType = String(entry.sourceType || '');
        const sourceId = String(entry.sourceId || '');
        const url = new URL('board.html', window.location.href);
        if (sourceType === 'event') {
            url.searchParams.set('linkType', 'timeline-event');
            url.searchParams.set('id', sourceId);
            window.location.assign(url.toString());
            return;
        }
        if (sourceType === 'npc' || sourceType === 'location' || sourceType === 'requisition') {
            url.searchParams.set('linkType', sourceType);
            url.searchParams.set('id', sourceId);
            window.location.assign(url.toString());
            return;
        }
        if (sourceType === 'theory' || sourceType === 'clue') {
            url.searchParams.set('nodeId', sourceId);
            window.location.assign(url.toString());
            return;
        }
        alert('No board jump available for this source type.');
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
            alert('No stable facts to copy.');
            return;
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(() => {
                alert('Stable facts copied.');
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
            alert('No stable facts to export.');
            return;
        }
        const dateStamp = new Date().toISOString().slice(0, 10);
        const blob = new Blob([text + '\n'], { type: 'text/plain' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `ledger-stable-facts-${dateStamp}.txt`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(link.href), 500);
    }

    function waitForStore() {
        if (getStore()) {
            renderLedger();
            return;
        }
        setTimeout(waitForStore, 100);
    }

    window.renderLedger = renderLedger;
    window.onLedgerFilterChange = onLedgerFilterChange;
    window.createLedgerEntry = createLedgerEntry;
    window.updateLedgerField = updateLedgerField;
    window.deleteLedgerEntry = deleteLedgerEntry;
    window.openLedgerSourceOnTimeline = openLedgerSourceOnTimeline;
    window.openLedgerSourceOnBoard = openLedgerSourceOnBoard;
    window.copyStableFacts = copyStableFacts;
    window.exportStableFacts = exportStableFacts;

    bindDelegatedDataHandlers();
    window.addEventListener('load', waitForStore);
    window.addEventListener('rtf-store-updated', (event) => {
        if (!event || !event.detail) return;
        renderLedger();
    });
})();
