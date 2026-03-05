(function () {
    const escapeHtml = (str = '') => String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    const escapeJsString = (str = '') => String(str)
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/\r/g, '\\r')
        .replace(/\n/g, '\\n')
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029');
    const escapeHandlerArg = (str = '') => escapeHtml(escapeJsString(str));
    const delegatedHandlerEvents = ['click', 'change', 'input'];
    const delegatedHandlerCache = new Map();
    let delegatedHandlersBound = false;

    const LEAD_STORAGE_KEY = 'rtf_lead_queue_v1';
    const LEAD_VOTER_NAME_KEY = 'rtf_lead_voter_name_v1';
    const LEAD_TYPES = ['npc', 'location', 'clue', 'event', 'requisition', 'theory', 'other'];
    const LEAD_STATUSES = ['open', 'blocked', 'resolved', 'dead-end'];
    const LEAD_STATUS_LABELS = {
        open: 'Open',
        blocked: 'Blocked',
        resolved: 'Resolved',
        'dead-end': 'Dead End'
    };
    const LEAD_VOTE_LABELS = {
        hot: 'Hot',
        cold: 'Cold',
        'dead-end': 'Dead End'
    };
    const LEAD_VOTE_SCORES = {
        hot: 2,
        cold: 0,
        'dead-end': -2
    };
    const LEAD_LINKABLE_TYPES = new Set(['event', 'npc', 'location', 'requisition', 'theory', 'clue']);
    const LEAD_TARGET_INDEX = {
        event: [],
        npc: [],
        location: [],
        requisition: [],
        theory: [],
        clue: []
    };
    let focusedLeadId = '';

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

    bindDelegatedDataHandlers();

    function getStore() {
        return window.RTF_STORE;
    }

    function getActiveCaseId() {
        const store = getStore();
        if (!store || typeof store.getActiveCaseId !== 'function') return 'case_primary';
        return String(store.getActiveCaseId() || 'case_primary');
    }

    function normalizeLeadType(value) {
        const clean = String(value || '').trim().toLowerCase();
        return LEAD_TYPES.includes(clean) ? clean : 'other';
    }

    function normalizeLeadStatus(value) {
        const clean = String(value || '').trim().toLowerCase();
        return LEAD_STATUSES.includes(clean) ? clean : 'open';
    }

    function normalizeTargetId(value) {
        return String(value || '').trim().slice(0, 120);
    }

    function isLinkableLeadType(value) {
        return LEAD_LINKABLE_TYPES.has(normalizeLeadType(value));
    }

    function clearLeadTargetIndex() {
        LEAD_TARGET_INDEX.event = [];
        LEAD_TARGET_INDEX.npc = [];
        LEAD_TARGET_INDEX.location = [];
        LEAD_TARGET_INDEX.requisition = [];
        LEAD_TARGET_INDEX.theory = [];
        LEAD_TARGET_INDEX.clue = [];
    }

    function getLeadSelfNodeIds(leadId, caseId = getActiveCaseId()) {
        const cleanLeadId = String(leadId || '').trim();
        const out = new Set();
        if (!cleanLeadId) return out;
        const store = getStore();
        if (!store || typeof store.getBoard !== 'function') return out;
        const board = store.getBoard(caseId);
        const nodes = Array.isArray(board && board.nodes) ? board.nodes : [];
        nodes.forEach((node) => {
            const nodeId = normalizeTargetId(node && node.id || '');
            if (!isBoardNodeId(nodeId)) return;
            const meta = node && typeof node.meta === 'object' ? node.meta : {};
            if (String(meta.sourceType || '').trim().toLowerCase() !== 'lead') return;
            if (String(meta.leadId || '').trim() !== cleanLeadId) return;
            out.add(nodeId);
        });
        return out;
    }

    function refreshLeadTargetIndex() {
        clearLeadTargetIndex();
        const store = getStore();
        if (!store) return;
        const seen = new Set();
        const pushOption = (type, id, label) => {
            const cleanType = normalizeLeadType(type);
            if (!isLinkableLeadType(cleanType)) return;
            const cleanId = normalizeTargetId(id);
            if (!cleanId) return;
            const key = `${cleanType}:${cleanId}`;
            if (seen.has(key)) return;
            seen.add(key);
            LEAD_TARGET_INDEX[cleanType].push({
                id: cleanId,
                label: String(label || cleanId).trim().slice(0, 240) || cleanId
            });
        };

        if (typeof store.getNPCs === 'function') {
            const npcs = store.getNPCs();
            (Array.isArray(npcs) ? npcs : []).forEach((entry) => {
                const id = normalizeTargetId(entry && entry.id || '');
                if (!id) return;
                const name = String(entry && entry.name || id).trim() || id;
                pushOption('npc', id, name);
            });
        }
        if (typeof store.getLocations === 'function') {
            const locations = store.getLocations();
            (Array.isArray(locations) ? locations : []).forEach((entry) => {
                const id = normalizeTargetId(entry && entry.id || '');
                if (!id) return;
                const name = String(entry && entry.name || id).trim() || id;
                pushOption('location', id, name);
            });
        }
        if (typeof store.getRequisitions === 'function') {
            const reqs = store.getRequisitions();
            (Array.isArray(reqs) ? reqs : []).forEach((entry) => {
                const id = normalizeTargetId(entry && entry.id || '');
                if (!id) return;
                const name = String(entry && (entry.item || entry.requester) || id).trim() || id;
                pushOption('requisition', id, name);
            });
        }

        const activeCaseId = getActiveCaseId();
        if (typeof store.getEvents === 'function') {
            const events = store.getEvents(activeCaseId);
            (Array.isArray(events) ? events : []).forEach((entry) => {
                const id = normalizeTargetId(entry && entry.id || '');
                if (!id) return;
                const title = String(entry && entry.title || id).trim() || id;
                pushOption('event', id, title);
            });
        }
        if (typeof store.getBoard === 'function') {
            const board = store.getBoard(activeCaseId);
            const nodes = Array.isArray(board && board.nodes) ? board.nodes : [];
            nodes.forEach((node) => {
                const id = normalizeTargetId(node && node.id || '');
                if (!isBoardNodeId(id)) return;
                const title = String(node && node.title || id).trim() || id;
                const nodeType = String(node && node.type || 'node').trim().toLowerCase();
                const boardLabel = `[Board] ${title} (${nodeType || 'node'})`;
                LEAD_LINKABLE_TYPES.forEach((type) => {
                    pushOption(type, id, boardLabel);
                });
            });
        }

        Object.keys(LEAD_TARGET_INDEX).forEach((key) => {
            LEAD_TARGET_INDEX[key].sort((a, b) => {
                const labelDelta = String(a.label || '').localeCompare(String(b.label || ''));
                if (labelDelta !== 0) return labelDelta;
                return String(a.id || '').localeCompare(String(b.id || ''));
            });
        });
    }

    function getLeadTargetOptions(type, leadId = '') {
        const cleanType = normalizeLeadType(type);
        if (!isLinkableLeadType(cleanType)) return [];
        const list = Array.isArray(LEAD_TARGET_INDEX[cleanType]) ? LEAD_TARGET_INDEX[cleanType] : [];
        const blockedIds = getLeadSelfNodeIds(leadId);
        if (!blockedIds.size) return list;
        return list.filter((entry) => !blockedIds.has(String(entry && entry.id || '')));
    }

    function getLeadTargetDisplayOptions(type, leadId = '') {
        const options = getLeadTargetOptions(type, leadId);
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

    function resolveLeadTargetInputToId(type, value, leadId = '') {
        const cleanType = normalizeLeadType(type);
        const raw = String(value || '').trim();
        if (!isLinkableLeadType(cleanType)) return '';
        if (!raw) return '';
        const options = getLeadTargetDisplayOptions(cleanType, leadId);
        const byDisplay = options.find((entry) => String(entry && entry.displayLabel || '').trim() === raw);
        if (byDisplay && byDisplay.id) return String(byDisplay.id);
        const byLabel = options.find((entry) => String(entry && entry.label || '').trim() === raw);
        if (byLabel && byLabel.id) return String(byLabel.id);
        const byId = options.find((entry) => String(entry && entry.id || '').trim() === raw);
        if (byId && byId.id) return String(byId.id);
        return '';
    }

    function getLeadTargetDisplayValue(type, targetId, leadId = '') {
        const cleanType = normalizeLeadType(type);
        const cleanId = normalizeTargetId(targetId);
        if (!isLinkableLeadType(cleanType) || !cleanId) return '';
        const options = getLeadTargetDisplayOptions(cleanType, leadId);
        const match = options.find((entry) => String(entry && entry.id || '') === cleanId);
        return String(match && match.displayLabel || '').trim();
    }

    function isValidLeadTarget(type, targetId, leadId = '') {
        const cleanType = normalizeLeadType(type);
        const cleanId = normalizeTargetId(targetId);
        if (!isLinkableLeadType(cleanType)) return !cleanId;
        if (!cleanId) return true;
        return getLeadTargetOptions(cleanType, leadId).some((entry) => String(entry && entry.id || '') === cleanId);
    }

    function buildLeadTargetDatalist(type, leadId = '') {
        return getLeadTargetDisplayOptions(type, leadId).map((entry) => {
            const display = String(entry && entry.displayLabel || '');
            return `<option value="${escapeHtml(display)}"></option>`;
        }).join('');
    }

    function getLeadTargetPlaceholder(type, optionCount) {
        const cleanType = normalizeLeadType(type);
        if (!isLinkableLeadType(cleanType)) return 'No linked record for this type';
        return optionCount ? 'Filter and select a record' : 'No records available';
    }

    function refreshLeadTargetPicker() {
        refreshLeadTargetIndex();
        const typeEl = document.getElementById('leadType');
        const targetEl = document.getElementById('leadTargetId');
        const datalistEl = document.getElementById('leadTargetOptions');
        if (!typeEl || !targetEl || !datalistEl) return;
        const type = normalizeLeadType(typeEl.value);
        const options = getLeadTargetOptions(type);
        if (!isLinkableLeadType(type)) {
            targetEl.value = '';
            targetEl.disabled = true;
            targetEl.removeAttribute('list');
            targetEl.placeholder = getLeadTargetPlaceholder(type, 0);
            datalistEl.innerHTML = '';
            return;
        }
        targetEl.disabled = false;
        targetEl.setAttribute('list', 'leadTargetOptions');
        targetEl.placeholder = getLeadTargetPlaceholder(type, options.length);
        datalistEl.innerHTML = buildLeadTargetDatalist(type);
        const resolved = resolveLeadTargetInputToId(type, targetEl.value || '');
        if (resolved) {
            const display = getLeadTargetDisplayValue(type, resolved);
            if (display) targetEl.value = display;
        }
    }

    function buildLeadTargetEditor(leadId, type, value) {
        const cleanType = normalizeLeadType(type);
        if (!isLinkableLeadType(cleanType)) {
            return '<input type="text" value="" disabled placeholder="No linked record for this type">';
        }
        const options = getLeadTargetOptions(cleanType, leadId);
        const listId = `leadTargetOptions_${String(leadId || '').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 64) || 'lead'}`;
        const safeLeadId = escapeHandlerArg(String(leadId || ''));
        return `
            <input type="text" value="${escapeHtml(getLeadTargetDisplayValue(cleanType, value, leadId))}" list="${listId}" placeholder="${escapeHtml(getLeadTargetPlaceholder(cleanType, options.length))}"
                data-onchange="updateLeadField('${safeLeadId}', 'targetId', this.value)">
            <datalist id="${listId}">
                ${buildLeadTargetDatalist(cleanType, leadId)}
            </datalist>
        `;
    }

    function normalizeLeadVotes(votes) {
        const source = votes && typeof votes === 'object' ? votes : {};
        const out = {};
        Object.keys(source).forEach((name) => {
            const cleanName = String(name || '').trim().slice(0, 60);
            const vote = String(source[name] || '').trim().toLowerCase();
            if (!cleanName) return;
            if (!Object.prototype.hasOwnProperty.call(LEAD_VOTE_LABELS, vote)) return;
            out[cleanName] = vote;
        });
        return out;
    }

    function createLeadId() {
        return `lead_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    }

    function sanitizeLead(raw, idx = 0) {
        const source = raw && typeof raw === 'object' ? raw : {};
        const nowIso = new Date().toISOString();
        return {
            id: String(source.id || `lead_${idx + 1}`).trim() || createLeadId(),
            type: normalizeLeadType(source.type),
            targetId: String(source.targetId || '').trim().slice(0, 120),
            title: String(source.title || '').trim().slice(0, 180) || `Lead ${idx + 1}`,
            question: String(source.question || '').trim().slice(0, 500),
            nextStep: String(source.nextStep || '').trim().slice(0, 500),
            status: normalizeLeadStatus(source.status),
            votes: normalizeLeadVotes(source.votes),
            created: String(source.created || nowIso),
            updated: String(source.updated || source.created || nowIso)
        };
    }

    function readLeadStorage() {
        try {
            const raw = localStorage.getItem(LEAD_STORAGE_KEY);
            if (!raw) return {};
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (err) {
            return {};
        }
    }

    function writeLeadStorage(value) {
        const clean = value && typeof value === 'object' ? value : {};
        localStorage.setItem(LEAD_STORAGE_KEY, JSON.stringify(clean));
    }

    function readLegacyCaseLeads(caseId = getActiveCaseId()) {
        const all = readLeadStorage();
        const list = Array.isArray(all[caseId]) ? all[caseId] : [];
        return list.map((entry, idx) => sanitizeLead(entry, idx));
    }

    function writeLegacyCaseLeads(leads, caseId = getActiveCaseId()) {
        const all = readLeadStorage();
        const clean = Array.isArray(leads) ? leads.map((entry, idx) => sanitizeLead(entry, idx)) : [];
        all[caseId] = clean;
        writeLeadStorage(all);
        return clean;
    }

    function getLeadTimestamp(lead) {
        const raw = String((lead && (lead.updated || lead.created)) || '');
        const parsed = Date.parse(raw);
        return Number.isFinite(parsed) ? parsed : 0;
    }

    function mergeLeadListsById(primaryList, secondaryList) {
        const merged = new Map();
        const ingest = (list, sourceRank) => {
            (Array.isArray(list) ? list : []).forEach((entry, idx) => {
                const clean = sanitizeLead(entry, idx);
                const existing = merged.get(clean.id);
                if (!existing) {
                    merged.set(clean.id, { lead: clean, sourceRank });
                    return;
                }
                const existingTs = getLeadTimestamp(existing.lead);
                const nextTs = getLeadTimestamp(clean);
                if (nextTs > existingTs || (nextTs === existingTs && sourceRank < existing.sourceRank)) {
                    merged.set(clean.id, { lead: clean, sourceRank });
                }
            });
        };

        ingest(primaryList, 0);
        ingest(secondaryList, 1);
        return Array.from(merged.values()).map((entry) => entry.lead);
    }

    function areLeadListsEqual(left, right) {
        const leftClean = Array.isArray(left) ? left.map((entry, idx) => sanitizeLead(entry, idx)) : [];
        const rightClean = Array.isArray(right) ? right.map((entry, idx) => sanitizeLead(entry, idx)) : [];
        if (leftClean.length !== rightClean.length) return false;
        for (let i = 0; i < leftClean.length; i += 1) {
            if (JSON.stringify(leftClean[i]) !== JSON.stringify(rightClean[i])) return false;
        }
        return true;
    }

    function getCaseLeadsFromStore(caseId = getActiveCaseId()) {
        const store = getStore();
        if (!store || typeof store.getLeads !== 'function') return null;
        const list = store.getLeads(caseId);
        if (!Array.isArray(list)) return [];
        return list.map((entry, idx) => sanitizeLead(entry, idx));
    }

    function setCaseLeadsInStore(leads, caseId = getActiveCaseId()) {
        const store = getStore();
        if (!store || typeof store.setLeads !== 'function') return false;
        store.setLeads(leads, caseId);
        return true;
    }

    function getCaseLeads(caseId = getActiveCaseId()) {
        const storeLeads = getCaseLeadsFromStore(caseId);
        const legacyLeads = readLegacyCaseLeads(caseId);
        const mergedLeads = mergeLeadListsById(storeLeads, legacyLeads);

        if (Array.isArray(storeLeads) && !areLeadListsEqual(storeLeads, mergedLeads)) {
            setCaseLeadsInStore(mergedLeads, caseId);
        }
        if (!areLeadListsEqual(legacyLeads, mergedLeads)) {
            writeLegacyCaseLeads(mergedLeads, caseId);
        }
        return mergedLeads;
    }

    function saveCaseLeads(leads, caseId = getActiveCaseId()) {
        const clean = Array.isArray(leads) ? leads.map((entry, idx) => sanitizeLead(entry, idx)) : [];
        setCaseLeadsInStore(clean, caseId);
        writeLegacyCaseLeads(clean, caseId);
    }

    function getLeadScore(lead) {
        if (!lead || !lead.votes || typeof lead.votes !== 'object') return 0;
        return Object.values(lead.votes).reduce((sum, vote) => {
            if (!Object.prototype.hasOwnProperty.call(LEAD_VOTE_SCORES, vote)) return sum;
            return sum + LEAD_VOTE_SCORES[vote];
        }, 0);
    }

    function formatLeadVotes(lead) {
        if (!lead || !lead.votes || typeof lead.votes !== 'object') return 'No votes yet';
        const voters = Object.keys(lead.votes);
        if (!voters.length) return 'No votes yet';
        return voters.map((name) => `${name}: ${LEAD_VOTE_LABELS[lead.votes[name]] || lead.votes[name]}`).join(' | ');
    }

    function getLeadStatusRank(status) {
        if (status === 'open') return 0;
        if (status === 'blocked') return 1;
        if (status === 'resolved') return 2;
        if (status === 'dead-end') return 3;
        return 4;
    }

    function createDefaultLeadVoter() {
        return `Player-${Math.floor(1000 + Math.random() * 9000)}`;
    }

    function getStoredLeadVoter() {
        return String(localStorage.getItem(LEAD_VOTER_NAME_KEY) || '').trim().slice(0, 60);
    }

    function getOrCreateLeadVoter() {
        const existing = getStoredLeadVoter();
        if (existing) return existing;
        const generated = createDefaultLeadVoter();
        localStorage.setItem(LEAD_VOTER_NAME_KEY, generated);
        return generated;
    }

    function getCurrentLeadVoter() {
        const input = document.getElementById('leadVoter');
        const fromInput = input ? String(input.value || '').trim() : '';
        if (fromInput) {
            localStorage.setItem(LEAD_VOTER_NAME_KEY, fromInput);
            return fromInput.slice(0, 60);
        }
        const stored = getStoredLeadVoter();
        if (stored) {
            if (input) input.value = stored;
            return stored;
        }
        const generated = getOrCreateLeadVoter();
        if (input) input.value = generated;
        return generated;
    }

    function clearLeadLinkParamFromUrl() {
        if (!window.history || typeof window.history.replaceState !== 'function') return;
        const url = new URL(window.location.href);
        if (!url.searchParams.has('leadId')) return;
        url.searchParams.delete('leadId');
        window.history.replaceState({}, document.title, url.toString());
    }

    function readFocusedLeadFromUrl() {
        const params = new URLSearchParams(window.location.search);
        return String(params.get('leadId') || '').trim();
    }

    function addLead(leadLike) {
        const caseId = getActiveCaseId();
        const existing = getCaseLeads(caseId);
        const lead = sanitizeLead({
            ...leadLike,
            id: createLeadId(),
            created: new Date().toISOString(),
            updated: new Date().toISOString()
        }, existing.length);
        existing.push(lead);
        saveCaseLeads(existing, caseId);
        renderLeadQueue();
        return lead;
    }

    function addLeadFromForm() {
        refreshLeadTargetIndex();
        const type = normalizeLeadType(document.getElementById('leadType').value);
        const title = String(document.getElementById('leadTitle').value || '').trim();
        const targetInput = String(document.getElementById('leadTargetId').value || '');
        let targetId = resolveLeadTargetInputToId(type, targetInput);
        const question = String(document.getElementById('leadQuestion').value || '').trim();
        const nextStep = String(document.getElementById('leadNextStep').value || '').trim();
        if (!title || !question || !nextStep) {
            alert('Lead title, question, and next step are required.');
            return;
        }
        if (!isLinkableLeadType(type)) {
            targetId = '';
        } else if (targetInput.trim() && !targetId) {
            alert('Select a valid target from the filterable list.');
            return;
        }
        addLead({
            type,
            title,
            targetId,
            question,
            nextStep,
            status: 'open',
            votes: {}
        });
        document.getElementById('leadTitle').value = '';
        document.getElementById('leadTargetId').value = '';
        document.getElementById('leadQuestion').value = '';
        document.getElementById('leadNextStep').value = '';
        refreshLeadTargetPicker();
    }

    function updateLeadField(leadId, field, value) {
        const id = String(leadId || '').trim();
        if (!id) return;
        refreshLeadTargetIndex();
        const caseId = getActiveCaseId();
        const list = getCaseLeads(caseId);
        const idx = list.findIndex((lead) => lead.id === id);
        if (idx < 0) return;

        if (field === 'title' || field === 'question' || field === 'nextStep') {
            list[idx][field] = String(value || '').trim();
        }
        if (field === 'type') {
            const nextType = normalizeLeadType(value);
            list[idx].type = nextType;
            const currentTarget = normalizeTargetId(list[idx].targetId || '');
            if (!isLinkableLeadType(nextType)) {
                list[idx].targetId = '';
            } else if (currentTarget && !isValidLeadTarget(nextType, currentTarget, id)) {
                list[idx].targetId = '';
            }
        }
        if (field === 'targetId') {
            const leadType = normalizeLeadType(list[idx].type);
            const currentTarget = normalizeTargetId(list[idx].targetId || '');
            const nextTargetInput = String(value || '');
            const nextTarget = resolveLeadTargetInputToId(leadType, nextTargetInput, id);
            if (!isLinkableLeadType(leadType)) {
                list[idx].targetId = '';
            } else if (nextTargetInput.trim() && !nextTarget && nextTarget !== currentTarget) {
                alert('Select a valid target from the filterable list.');
                renderLeadQueue();
                return;
            } else {
                list[idx].targetId = nextTarget;
            }
        }
        if (field === 'status') list[idx].status = normalizeLeadStatus(value);
        list[idx].updated = new Date().toISOString();
        saveCaseLeads(list, caseId);
        renderLeadQueue();
    }

    function setLeadVote(leadId, vote) {
        const id = String(leadId || '').trim();
        const voteKey = String(vote || '').trim().toLowerCase();
        if (!id || !Object.prototype.hasOwnProperty.call(LEAD_VOTE_LABELS, voteKey)) return;
        const voter = getCurrentLeadVoter();
        if (!voter) return;
        const caseId = getActiveCaseId();
        const list = getCaseLeads(caseId);
        const idx = list.findIndex((lead) => lead.id === id);
        if (idx < 0) return;
        list[idx].votes = list[idx].votes && typeof list[idx].votes === 'object' ? list[idx].votes : {};
        list[idx].votes[voter] = voteKey;
        list[idx].updated = new Date().toISOString();
        saveCaseLeads(list, caseId);
        renderLeadQueue();
    }

    function clearLeadVote(leadId) {
        const id = String(leadId || '').trim();
        if (!id) return;
        const voter = getCurrentLeadVoter();
        if (!voter) return;
        const caseId = getActiveCaseId();
        const list = getCaseLeads(caseId);
        const idx = list.findIndex((lead) => lead.id === id);
        if (idx < 0) return;
        if (!list[idx].votes || typeof list[idx].votes !== 'object') return;
        delete list[idx].votes[voter];
        list[idx].updated = new Date().toISOString();
        saveCaseLeads(list, caseId);
        renderLeadQueue();
    }

    function deleteLead(leadId) {
        const id = String(leadId || '').trim();
        if (!id) return;
        const caseId = getActiveCaseId();
        const list = getCaseLeads(caseId);
        const idx = list.findIndex((lead) => lead.id === id);
        if (idx < 0) return;
        list.splice(idx, 1);
        saveCaseLeads(list, caseId);
        renderLeadQueue();
    }

    function isBoardNodeId(value) {
        const clean = String(value || '').trim();
        return /^node_[a-z0-9_-]+$/i.test(clean);
    }

    function openLeadOnBoard(leadId) {
        const id = String(leadId || '').trim();
        if (!id) return;
        const list = getCaseLeads(getActiveCaseId());
        const lead = list.find((entry) => entry.id === id);
        if (!lead) return;
        const target = String(lead.targetId || '').trim();
        if (!target) {
            alert('This lead has no linked record to open on board.');
            return;
        }

        const url = new URL('board.html', window.location.href);
        if (isBoardNodeId(target)) {
            url.searchParams.set('nodeId', target);
            window.location.assign(url.toString());
            return;
        }

        const linkTypeMap = {
            npc: 'npc',
            location: 'location',
            event: 'timeline-event',
            requisition: 'requisition'
        };
        const linkType = linkTypeMap[lead.type];
        if (linkType) {
            url.searchParams.set('linkType', linkType);
            url.searchParams.set('id', target);
            window.location.assign(url.toString());
            return;
        }

        alert('Board jump needs a board node ID (node_...) or an NPC/location/event/requisition lead.');
    }

    function openLeadOnTimeline(leadId) {
        const id = String(leadId || '').trim();
        if (!id) return;
        const list = getCaseLeads(getActiveCaseId());
        const lead = list.find((entry) => entry.id === id);
        if (!lead) return;
        const target = String(lead.targetId || '').trim();
        const queryCandidates = [
            String(lead.title || '').trim(),
            String(lead.question || '').trim(),
            isBoardNodeId(target) ? '' : target
        ];
        let query = queryCandidates.find((entry) => entry) || '';
        if (!query) query = target;
        if (!query) {
            alert('This lead does not have enough data to jump to timeline.');
            return;
        }
        const url = new URL('timeline.html', window.location.href);
        url.searchParams.set('search', query);
        if (target) url.searchParams.set('id', target);
        window.location.assign(url.toString());
    }

    function buildFullLeadCardMarkup(lead, voter, focusedClass = '') {
        const leadId = escapeHandlerArg(lead.id);
        const score = getLeadScore(lead);
        const currentVote = voter && lead.votes ? lead.votes[voter] : '';
        return `
            <article class="lead-card${focusedClass}" data-lead-id="${escapeHtml(lead.id)}">
                <div class="lead-head">
                    <strong>${escapeHtml(lead.title)}</strong>
                    <div class="lead-meta">
                        <span class="lead-pill">${escapeHtml((lead.type || 'other').toUpperCase())}</span>
                        <span class="lead-pill">${escapeHtml(LEAD_STATUS_LABELS[lead.status] || 'Open')}</span>
                        <span class="lead-pill score">Score ${score >= 0 ? '+' : ''}${score}</span>
                    </div>
                </div>
                <div class="lead-row">
                    <div>
                        <label>Question</label>
                        <input type="text" value="${escapeHtml(lead.question || '')}" data-onchange="updateLeadField('${leadId}', 'question', this.value)">
                    </div>
                    <div>
                        <label>Next Step</label>
                        <input type="text" value="${escapeHtml(lead.nextStep || '')}" data-onchange="updateLeadField('${leadId}', 'nextStep', this.value)">
                    </div>
                </div>
                <div class="lead-row">
                    <div>
                        <label>Status</label>
                        <select data-onchange="updateLeadField('${leadId}', 'status', this.value)">
                            ${LEAD_STATUSES.map((status) => `<option value="${status}" ${status === lead.status ? 'selected' : ''}>${escapeHtml(LEAD_STATUS_LABELS[status])}</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label>Linked Record</label>
                        ${buildLeadTargetEditor(lead.id, lead.type, lead.targetId)}
                    </div>
                </div>
                <div class="lead-vote-row">
                    <button class="btn ${currentVote === 'hot' ? 'is-selected' : ''}" data-onclick="setLeadVote('${leadId}', 'hot')">Hot</button>
                    <button class="btn ${currentVote === 'cold' ? 'is-selected' : ''}" data-onclick="setLeadVote('${leadId}', 'cold')">Cold</button>
                    <button class="btn ${currentVote === 'dead-end' ? 'is-selected' : ''}" data-onclick="setLeadVote('${leadId}', 'dead-end')">Dead End</button>
                    <button class="btn" data-onclick="clearLeadVote('${leadId}')">Clear Vote</button>
                </div>
                <div class="lead-vote-summary">${escapeHtml(formatLeadVotes(lead))}</div>
                <div class="lead-actions">
                    <button class="btn" data-onclick="openLeadOnTimeline('${leadId}')">Timeline</button>
                    <button class="btn" data-onclick="openLeadOnBoard('${leadId}')">Board</button>
                    <button class="btn btn-danger" data-onclick="deleteLead('${leadId}')">Delete</button>
                </div>
            </article>
        `;
    }

    function buildFallbackLeadCardMarkup(lead, voter, focusedClass = '') {
        const leadId = escapeHandlerArg(String(lead && lead.id || ''));
        const score = getLeadScore(lead);
        const currentVote = voter && lead && lead.votes ? lead.votes[voter] : '';
        return `
            <article class="lead-card${focusedClass}" data-lead-id="${escapeHtml(String(lead && lead.id || ''))}">
                <div class="lead-head">
                    <strong>${escapeHtml(String(lead && lead.title || 'Untitled Lead'))}</strong>
                    <div class="lead-meta">
                        <span class="lead-pill">${escapeHtml(LEAD_STATUS_LABELS[String(lead && lead.status || 'open')] || 'Open')}</span>
                        <span class="lead-pill score">Score ${score >= 0 ? '+' : ''}${score}</span>
                    </div>
                </div>
                <div class="lead-vote-row">
                    <button class="btn ${currentVote === 'hot' ? 'is-selected' : ''}" data-onclick="setLeadVote('${leadId}', 'hot')">Hot</button>
                    <button class="btn ${currentVote === 'cold' ? 'is-selected' : ''}" data-onclick="setLeadVote('${leadId}', 'cold')">Cold</button>
                    <button class="btn ${currentVote === 'dead-end' ? 'is-selected' : ''}" data-onclick="setLeadVote('${leadId}', 'dead-end')">Dead End</button>
                    <button class="btn" data-onclick="clearLeadVote('${leadId}')">Clear Vote</button>
                </div>
                <div class="lead-actions">
                    <button class="btn" data-onclick="openLeadOnTimeline('${leadId}')">Timeline</button>
                    <button class="btn" data-onclick="openLeadOnBoard('${leadId}')">Board</button>
                    <button class="btn btn-danger" data-onclick="deleteLead('${leadId}')">Delete</button>
                </div>
            </article>
        `;
    }

    function renderLeadQueue() {
        const listEl = document.getElementById('leadList');
        const summaryEl = document.getElementById('leadSummary');
        if (!listEl || !summaryEl) return;

        refreshLeadTargetPicker();
        const voter = getCurrentLeadVoter();
        const leads = getCaseLeads(getActiveCaseId());
        const sorted = leads.slice().sort((a, b) => {
            const statusDelta = getLeadStatusRank(a.status) - getLeadStatusRank(b.status);
            if (statusDelta !== 0) return statusDelta;
            const scoreDelta = getLeadScore(b) - getLeadScore(a);
            if (scoreDelta !== 0) return scoreDelta;
            return String(b.updated || '').localeCompare(String(a.updated || ''));
        });

        const openCount = sorted.filter((lead) => lead.status === 'open').length;
        const blockedCount = sorted.filter((lead) => lead.status === 'blocked').length;
        summaryEl.textContent = `${sorted.length} leads • ${openCount} open • ${blockedCount} blocked${voter ? ` • voting as ${voter}` : ''}`;

        if (!sorted.length) {
            listEl.innerHTML = '<div class="lead-empty">No leads yet. Add one from Timeline/Board or create manually.</div>';
            return;
        }

        listEl.innerHTML = sorted.map((lead) => {
            const focusedClass = focusedLeadId && focusedLeadId === lead.id ? ' is-focused' : '';
            try {
                return buildFullLeadCardMarkup(lead, voter, focusedClass);
            } catch (err) {
                console.error('Lead Queue card render failed; using fallback for lead:', lead && lead.id, err);
                return buildFallbackLeadCardMarkup(lead, voter, focusedClass);
            }
        }).join('');
    }

    function focusLeadFromUrlIfPresent() {
        focusedLeadId = readFocusedLeadFromUrl();
        if (!focusedLeadId) return;

        requestAnimationFrame(() => {
            const cards = Array.from(document.querySelectorAll('.lead-card[data-lead-id]'));
            const target = cards.find((card) => card.getAttribute('data-lead-id') === focusedLeadId);
            if (!target) return;
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setTimeout(() => {
                focusedLeadId = '';
                clearLeadLinkParamFromUrl();
                renderLeadQueue();
            }, 2200);
        });
    }

    function init() {
        refreshLeadTargetPicker();
        const voterInput = document.getElementById('leadVoter');
        if (voterInput) {
            voterInput.value = getOrCreateLeadVoter();
            voterInput.addEventListener('input', () => {
                localStorage.setItem(LEAD_VOTER_NAME_KEY, String(voterInput.value || '').trim().slice(0, 60));
                renderLeadQueue();
            });
        }
        renderLeadQueue();
        focusLeadFromUrlIfPresent();
    }

    function waitForStore() {
        if (getStore()) {
            init();
        } else {
            setTimeout(waitForStore, 100);
        }
    }

    window.addLeadFromForm = addLeadFromForm;
    window.refreshLeadTargetPicker = refreshLeadTargetPicker;
    window.updateLeadField = updateLeadField;
    window.setLeadVote = setLeadVote;
    window.clearLeadVote = clearLeadVote;
    window.deleteLead = deleteLead;
    window.openLeadOnBoard = openLeadOnBoard;
    window.openLeadOnTimeline = openLeadOnTimeline;

    window.addEventListener('load', waitForStore);
    window.addEventListener('storage', (event) => {
        if (!event || event.key !== LEAD_STORAGE_KEY) return;
        renderLeadQueue();
    });
    window.addEventListener('rtf-store-updated', (event) => {
        if (!event || !event.detail || event.detail.source !== 'remote') return;
        renderLeadQueue();
    });
})();
