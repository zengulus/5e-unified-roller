(function () {
    const SOFT_DELETE_MS = 12000;
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
    let deleteManager = null;
    let pendingDeepLinkFocus = '';
    const sanitizeImageUrl = (url = '') => {
        const candidate = String(url || '').trim();
        if (!candidate) return '';

        if (/^data:image\/[a-zA-Z0-9.+-]+;base64,[a-zA-Z0-9+/=]+$/i.test(candidate)) {
            return candidate;
        }

        try {
            const parsed = new URL(candidate, window.location.href);
            if (parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'file:' || parsed.protocol === 'blob:') {
                return parsed.href;
            }
        } catch (err) {
            return '';
        }

        return '';
    };

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

    const getStore = () => window.RTF_STORE;
    const VIEW_SCOPE = String(window.RTF_VIEW_SCOPE || '').trim().toLowerCase() === 'campaign' ? 'campaign' : 'case';
    const isCampaignMetaView = () => VIEW_SCOPE === 'campaign';
    const getBoardPageHref = () => isCampaignMetaView() ? 'campaign-board.html' : 'board.html';
    const getDeleteManager = () => {
        if (deleteManager) return deleteManager;
        const api = window.RTF_SOFT_DELETE;
        if (!api || typeof api.createSoftDeleteManager !== 'function') return null;
        deleteManager = api.createSoftDeleteManager({
            undoMs: SOFT_DELETE_MS,
            host: document.body,
            onStateChange: () => renderTimeline()
        });
        return deleteManager;
    };
    const HEAT_SYNC_KEY = 'rtf_timeline_auto_heat';
    const HEAT_MIN = 0;
    const HEAT_MAX = 6;
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
        hot: 1,
        cold: 0,
        'dead-end': -1
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
    const PREP_PROCEDURE_STATE_KEY = 'rtf_prep_procedure_state_v1';
    const FREE_SHIELD_SESSION_PREFIX = 'rtf_procedure_free_shield_used_v1:';
    const CERTAINTY_DEFAULT = 50;
    const IMPACT_SEVERITY_OPTIONS = ['low', 'moderate', 'high', 'critical'];
    const IMPACT_SCOPE_OPTIONS = ['local', 'district', 'guildwide', 'citywide'];
    const IMPACT_SEVERITY_LABELS = {
        low: 'Low',
        moderate: 'Moderate',
        high: 'High',
        critical: 'Critical'
    };
    const IMPACT_SCOPE_LABELS = {
        local: 'Local',
        district: 'District',
        guildwide: 'Guildwide',
        citywide: 'Citywide'
    };
    const createDefaultLeadVoter = () => `Player-${Math.floor(1000 + Math.random() * 9000)}`;
    const getStoredLeadVoter = () => String(localStorage.getItem(LEAD_VOTER_NAME_KEY) || '').trim().slice(0, 60);
    const getOrCreateLeadVoter = () => {
        const existing = getStoredLeadVoter();
        if (existing) return existing;
        const generated = createDefaultLeadVoter();
        localStorage.setItem(LEAD_VOTER_NAME_KEY, generated);
        return generated;
    };

    const clampCertainty = (value, fallback = CERTAINTY_DEFAULT) => {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) return fallback;
        return Math.max(0, Math.min(100, Math.round(parsed)));
    };
    const sanitizeImpactSeverity = (value, fallback = 'moderate') => {
        const clean = String(value || '').trim().toLowerCase();
        return IMPACT_SEVERITY_OPTIONS.includes(clean) ? clean : fallback;
    };
    const sanitizeImpactScope = (value, fallback = 'local') => {
        const clean = String(value || '').trim().toLowerCase();
        return IMPACT_SCOPE_OPTIONS.includes(clean) ? clean : fallback;
    };
    const getImpactSeverityLabel = (value) => IMPACT_SEVERITY_LABELS[sanitizeImpactSeverity(value, 'moderate')] || 'Moderate';
    const getImpactScopeLabel = (value) => IMPACT_SCOPE_LABELS[sanitizeImpactScope(value, 'local')] || 'Local';
    const hasHighImpact = (evt) => {
        const severity = sanitizeImpactSeverity(evt && evt.impactSeverity, 'moderate');
        return severity === 'high' || severity === 'critical';
    };

    const parseHeatDelta = (value) => {
        const parsed = parseInt(value, 10);
        return Number.isFinite(parsed) ? parsed : 0;
    };

    const clampHeat = (value) => Math.max(HEAT_MIN, Math.min(HEAT_MAX, value));

    const isHeatAutoSyncEnabled = () => {
        const stored = localStorage.getItem(HEAT_SYNC_KEY);
        if (stored === null) return true;
        return stored === 'true';
    };

    const setHeatAutoSync = (enabled) => {
        localStorage.setItem(HEAT_SYNC_KEY, String(Boolean(enabled)));
    };

    const applyHeatDelta = (delta, store) => {
        if (!delta || !store || !store.state || !store.state.campaign) return;
        if (!isHeatAutoSyncEnabled()) return;
        const current = Number(store.state.campaign.heat) || 0;
        store.state.campaign.heat = clampHeat(current + delta);
        if (typeof store.save === 'function') store.save({ scope: 'campaign.heat' });
    };

    const getActiveCaseId = () => {
        const store = getStore();
        if (!store || typeof store.getActiveCaseId !== 'function') return 'case_primary';
        return String(store.getActiveCaseId() || 'case_primary');
    };
    const getTimelineScopeId = () => (isCampaignMetaView() ? 'campaign_meta' : getActiveCaseId());
    const getTimelineEvents = (store = getStore()) => {
        if (!store) return [];
        if (isCampaignMetaView() && typeof store.getCampaignMetaEvents === 'function') {
            return store.getCampaignMetaEvents();
        }
        if (typeof store.getEvents === 'function') {
            return store.getEvents(getActiveCaseId());
        }
        return [];
    };
    const addTimelineEventToStore = (store, payload) => {
        if (!store) return '';
        if (isCampaignMetaView() && typeof store.addCampaignMetaEvent === 'function') {
            return store.addCampaignMetaEvent(payload);
        }
        if (typeof store.addEvent === 'function') {
            return store.addEvent(payload, getActiveCaseId());
        }
        return '';
    };
    const updateTimelineEventInStore = (store, id, updates) => {
        if (!store) return;
        if (isCampaignMetaView() && typeof store.updateCampaignMetaEvent === 'function') {
            store.updateCampaignMetaEvent(id, updates);
            return;
        }
        if (typeof store.updateEvent === 'function') {
            store.updateEvent(id, updates, getActiveCaseId());
        }
    };
    const deleteTimelineEventFromStore = (store, id) => {
        if (!store) return;
        if (isCampaignMetaView() && typeof store.deleteCampaignMetaEvent === 'function') {
            store.deleteCampaignMetaEvent(id);
            return;
        }
        if (typeof store.deleteEvent === 'function') {
            store.deleteEvent(id, getActiveCaseId());
        }
    };
    const getTimelineBoard = (store = getStore()) => {
        if (!store) return null;
        if (isCampaignMetaView() && typeof store.getCampaignMetaBoard === 'function') {
            return store.getCampaignMetaBoard();
        }
        if (typeof store.getBoard === 'function') {
            return store.getBoard(getActiveCaseId());
        }
        return null;
    };
    const getTimelineOrderScope = () => (isCampaignMetaView()
        ? 'campaign.meta.events.__order'
        : `cases.${getActiveCaseId()}.events.__order`);
    const getTimelineSortMode = () => {
        const sortEl = document.getElementById('eventSort');
        const mode = String(sortEl && sortEl.value || '').trim().toLowerCase();
        return mode === 'oldest' || mode === 'heat' ? mode : 'newest';
    };
    const isChronologicalSortSelected = () => {
        const mode = getTimelineSortMode();
        return mode === 'oldest' || mode === 'newest';
    };
    const isMoveModeEnabled = () => isButtonPressed('eventMoveMode') && isChronologicalSortSelected();

    const normalizeLeadType = (value) => {
        const clean = String(value || '').trim().toLowerCase();
        return LEAD_TYPES.includes(clean) ? clean : 'other';
    };

    const normalizeLeadStatus = (value) => {
        const clean = String(value || '').trim().toLowerCase();
        return LEAD_STATUSES.includes(clean) ? clean : 'open';
    };

    const normalizeTargetId = (value) => String(value || '').trim().slice(0, 120);
    const isLinkableLeadType = (value) => LEAD_LINKABLE_TYPES.has(normalizeLeadType(value));
    const clearLeadTargetIndex = () => {
        LEAD_TARGET_INDEX.event = [];
        LEAD_TARGET_INDEX.npc = [];
        LEAD_TARGET_INDEX.location = [];
        LEAD_TARGET_INDEX.requisition = [];
        LEAD_TARGET_INDEX.theory = [];
        LEAD_TARGET_INDEX.clue = [];
    };
    const getLeadSelfNodeIds = (leadId) => {
        const cleanLeadId = String(leadId || '').trim();
        const out = new Set();
        if (!cleanLeadId) return out;
        const store = getStore();
        if (!store) return out;
        let board = null;
        try {
            board = getTimelineBoard(store);
        } catch (err) {
            console.error('Timeline lead target index: failed to read board state for self-node filtering.', err);
            return out;
        }
        if (!board) return out;
        const nodes = Array.isArray(board && board.nodes) ? board.nodes : [];
        nodes.forEach((node) => {
            const nodeId = normalizeTargetId(node && node.id || '');
            if (!isBoardNodeId(nodeId)) return;
            const meta = node && node.meta && typeof node.meta === 'object' ? node.meta : {};
            if (String(meta.sourceType || '').trim().toLowerCase() !== 'lead') return;
            if (String(meta.leadId || '').trim() !== cleanLeadId) return;
            out.add(nodeId);
        });
        return out;
    };
    const refreshLeadTargetIndex = () => {
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
        const events = getTimelineEvents(store);
        (Array.isArray(events) ? events : []).forEach((entry) => {
            const id = normalizeTargetId(entry && entry.id || '');
            if (!id) return;
            const title = String(entry && entry.title || id).trim() || id;
            pushOption('event', id, title);
        });
        const board = getTimelineBoard(store);
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
        Object.keys(LEAD_TARGET_INDEX).forEach((key) => {
            LEAD_TARGET_INDEX[key].sort((a, b) => {
                const labelDelta = String(a.label || '').localeCompare(String(b.label || ''));
                if (labelDelta !== 0) return labelDelta;
                return String(a.id || '').localeCompare(String(b.id || ''));
            });
        });
    };
    const getLeadTargetOptions = (type, leadId = '') => {
        const cleanType = normalizeLeadType(type);
        if (!isLinkableLeadType(cleanType)) return [];
        const list = Array.isArray(LEAD_TARGET_INDEX[cleanType]) ? LEAD_TARGET_INDEX[cleanType] : [];
        const blockedIds = getLeadSelfNodeIds(leadId);
        if (!blockedIds.size) return list;
        return list.filter((entry) => !blockedIds.has(String(entry && entry.id || '')));
    };
    const getLeadTargetDisplayOptions = (type, leadId = '') => {
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
    };
    const resolveLeadTargetInputToId = (type, value, leadId = '') => {
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
    };
    const getLeadTargetDisplayValue = (type, targetId, leadId = '') => {
        const cleanType = normalizeLeadType(type);
        const cleanId = normalizeTargetId(targetId);
        if (!isLinkableLeadType(cleanType) || !cleanId) return '';
        const options = getLeadTargetDisplayOptions(cleanType, leadId);
        const match = options.find((entry) => String(entry && entry.id || '') === cleanId);
        return String(match && match.displayLabel || '').trim();
    };
    const isValidLeadTarget = (type, targetId, leadId = '') => {
        const cleanType = normalizeLeadType(type);
        const cleanId = normalizeTargetId(targetId);
        if (!isLinkableLeadType(cleanType)) return !cleanId;
        if (!cleanId) return true;
        return getLeadTargetOptions(cleanType, leadId).some((entry) => String(entry && entry.id || '') === cleanId);
    };
    const buildLeadTargetDatalist = (type, leadId = '') => (
        getLeadTargetDisplayOptions(type, leadId).map((entry) => {
            const display = String(entry && entry.displayLabel || '');
            return `<option value="${escapeHtml(display)}"></option>`;
        }).join('')
    );
    const getLeadTargetPlaceholder = (type, optionCount) => {
        const cleanType = normalizeLeadType(type);
        if (!isLinkableLeadType(cleanType)) return 'No linked record for this type';
        return optionCount ? 'Filter and select a record' : 'No records available';
    };
    const refreshLeadTargetPicker = () => {
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
    };
    const buildLeadTargetEditor = (leadId, type, value) => {
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
    };

    const normalizeLeadVotes = (votes) => {
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
    };

    const createLeadId = () => `lead_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

    const sanitizeLead = (raw, idx = 0) => {
        const source = raw && typeof raw === 'object' ? raw : {};
        const nowIso = new Date().toISOString();
        return {
            id: String(source.id || `lead_${idx + 1}`).trim() || createLeadId(),
            type: normalizeLeadType(source.type),
            targetId: normalizeTargetId(source.targetId || ''),
            title: String(source.title || '').trim().slice(0, 180) || `Lead ${idx + 1}`,
            question: String(source.question || '').trim().slice(0, 500),
            nextStep: String(source.nextStep || '').trim().slice(0, 500),
            status: normalizeLeadStatus(source.status),
            votes: normalizeLeadVotes(source.votes),
            created: String(source.created || nowIso),
            updated: String(source.updated || source.created || nowIso)
        };
    };

    const readLeadStorage = () => {
        try {
            const raw = localStorage.getItem(LEAD_STORAGE_KEY);
            if (!raw) return {};
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (err) {
            return {};
        }
    };

    const writeLeadStorage = (value) => {
        const clean = value && typeof value === 'object' ? value : {};
        localStorage.setItem(LEAD_STORAGE_KEY, JSON.stringify(clean));
    };

    const readLegacyCaseLeads = (caseId = getTimelineScopeId()) => {
        const all = readLeadStorage();
        const list = Array.isArray(all[caseId]) ? all[caseId] : [];
        return list.map((entry, idx) => sanitizeLead(entry, idx));
    };

    const writeLegacyCaseLeads = (leads, caseId = getTimelineScopeId()) => {
        const all = readLeadStorage();
        const clean = Array.isArray(leads) ? leads.map((entry, idx) => sanitizeLead(entry, idx)) : [];
        all[caseId] = clean;
        writeLeadStorage(all);
        return clean;
    };

    const getCaseLeadsFromStore = (caseId = getTimelineScopeId()) => {
        const store = getStore();
        if (!store || typeof store.getLeads !== 'function') return null;
        const list = store.getLeads(caseId);
        if (!Array.isArray(list)) return [];
        return list.map((entry, idx) => sanitizeLead(entry, idx));
    };

    const setCaseLeadsInStore = (leads, caseId = getTimelineScopeId()) => {
        const store = getStore();
        if (!store || typeof store.setLeads !== 'function') return false;
        store.setLeads(leads, caseId);
        return true;
    };

    const getLeadTimestamp = (lead) => {
        const raw = String((lead && (lead.updated || lead.created)) || '');
        const parsed = Date.parse(raw);
        return Number.isFinite(parsed) ? parsed : 0;
    };

    const mergeLeadListsById = (primaryList, secondaryList) => {
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
    };

    const areLeadListsEqual = (left, right) => {
        const leftClean = Array.isArray(left) ? left.map((entry, idx) => sanitizeLead(entry, idx)) : [];
        const rightClean = Array.isArray(right) ? right.map((entry, idx) => sanitizeLead(entry, idx)) : [];
        if (leftClean.length !== rightClean.length) return false;
        for (let i = 0; i < leftClean.length; i += 1) {
            if (JSON.stringify(leftClean[i]) !== JSON.stringify(rightClean[i])) return false;
        }
        return true;
    };

    const getCaseLeads = (caseId = getTimelineScopeId()) => {
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
    };

    const saveCaseLeads = (leads, caseId = getTimelineScopeId()) => {
        const clean = Array.isArray(leads) ? leads.map((entry, idx) => sanitizeLead(entry, idx)) : [];
        setCaseLeadsInStore(clean, caseId);
        writeLegacyCaseLeads(clean, caseId);
    };

    const getLeadScore = (lead) => {
        if (!lead || !lead.votes || typeof lead.votes !== 'object') return 0;
        return Object.values(lead.votes).reduce((sum, vote) => {
            if (!Object.prototype.hasOwnProperty.call(LEAD_VOTE_SCORES, vote)) return sum;
            return sum + LEAD_VOTE_SCORES[vote];
        }, 0);
    };

    const formatLeadVotes = (lead) => {
        if (!lead || !lead.votes || typeof lead.votes !== 'object') return 'No votes yet';
        const voters = Object.keys(lead.votes);
        if (!voters.length) return 'No votes yet';
        return voters.map((name) => `${name}: ${LEAD_VOTE_LABELS[lead.votes[name]] || lead.votes[name]}`).join(' | ');
    };

    const getLeadStatusRank = (status) => {
        if (status === 'open') return 0;
        if (status === 'blocked') return 1;
        if (status === 'resolved') return 2;
        if (status === 'dead-end') return 3;
        return 4;
    };

    const getCurrentLeadVoter = () => {
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
    };

    const getProcedureState = () => {
        try {
            const raw = localStorage.getItem(PREP_PROCEDURE_STATE_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') return null;
            const prep = parsed.prep && typeof parsed.prep === 'object' ? parsed.prep : null;
            const procedure = parsed.procedure && typeof parsed.procedure === 'object' ? parsed.procedure : null;
            if (!prep || !procedure) return null;
            const prepTotal = Number.isFinite(Number(prep.total)) ? Math.max(1, Number(prep.total)) : 4;
            const prepFilled = Number.isFinite(Number(prep.filled)) ? Math.max(0, Math.min(prepTotal, Number(prep.filled))) : 0;
            const procedureTotal = Number.isFinite(Number(procedure.total)) ? Math.max(1, Number(procedure.total)) : 4;
            const procedureFilled = Number.isFinite(Number(procedure.filled)) ? Math.max(0, Math.min(procedureTotal, Number(procedure.filled))) : 0;
            return {
                ...parsed,
                prep: { ...prep, total: prepTotal, filled: prepFilled },
                procedure: { ...procedure, total: procedureTotal, filled: procedureFilled }
            };
        } catch (err) {
            return null;
        }
    };

    const saveProcedureState = (state) => {
        if (!state || typeof state !== 'object') return;
        localStorage.setItem(PREP_PROCEDURE_STATE_KEY, JSON.stringify(state));
    };

    const getFreeShieldSessionKey = () => `${FREE_SHIELD_SESSION_PREFIX}${getTimelineScopeId()}`;

    const hasFreeShieldAvailable = (procedureState = getProcedureState()) => {
        if (!procedureState || !procedureState.prep) return false;
        const prep = procedureState.prep;
        const prepReady = Number(prep.total) > 0 && Number(prep.filled) >= Number(prep.total);
        if (!prepReady) return false;
        return sessionStorage.getItem(getFreeShieldSessionKey()) !== '1';
    };

    function clearTimelineLinkParamsFromUrl() {
        if (!window.history || typeof window.history.replaceState !== 'function') return;
        const url = new URL(window.location.href);
        const keys = ['search', 'focus', 'source', 'id'];
        let changed = false;
        keys.forEach((key) => {
            if (!url.searchParams.has(key)) return;
            url.searchParams.delete(key);
            changed = true;
        });
        if (changed) window.history.replaceState({}, document.title, url.toString());
    }

    function applyTimelineLinkFiltersFromUrl() {
        const params = new URLSearchParams(window.location.search);
        const search = String(params.get('search') || '').trim();
        const focus = String(params.get('focus') || '').trim();
        const id = String(params.get('id') || '').trim();
        const effectiveSearch = search || id;
        if (!effectiveSearch && !focus) return;

        const searchInput = document.getElementById('eventSearch');
        if (searchInput && effectiveSearch) searchInput.value = effectiveSearch;
        pendingDeepLinkFocus = focus;
        clearTimelineLinkParamsFromUrl();
    }

    function buildBoardLinkForEvent(id) {
        const cleanId = String(id || '').trim();
        const url = new URL(getBoardPageHref(), window.location.href);
        if (!cleanId) return url.toString();

        const store = getStore();
        const evt = store
            ? (getTimelineEvents(store) || []).find((entry) => String(entry && entry.id || '') === cleanId)
            : null;
        const boardLinkType = String(evt && evt.boardLinkType || '').trim().toLowerCase();
        const boardLinkId = String(evt && (evt.boardLinkId || evt.boardNodeId) || '').trim();

        if ((boardLinkType === 'node' || (!boardLinkType && isBoardNodeId(boardLinkId))) && isBoardNodeId(boardLinkId)) {
            url.searchParams.set('nodeId', boardLinkId);
            return url.toString();
        }

        if (boardLinkType && boardLinkType !== 'node' && boardLinkId) {
            url.searchParams.set('linkType', boardLinkType);
            url.searchParams.set('id', boardLinkId);
            return url.toString();
        }

        url.searchParams.set('linkType', 'timeline-event');
        url.searchParams.set('id', cleanId);
        return url.toString();
    }

    function openTimelineEventInBoard(id) {
        const cleanId = String(id || '').trim();
        if (!cleanId) return;
        window.location.assign(buildBoardLinkForEvent(cleanId));
    }

    function persistTimelineEventOrder(store) {
        if (!store || typeof store.save !== 'function') return;
        if (!isCampaignMetaView() && typeof store.syncActiveCaseLegacyState === 'function') {
            store.syncActiveCaseLegacyState();
        }
        store.save({ scope: getTimelineOrderScope() });
    }

    function moveTimelineEvent(id, direction) {
        const cleanId = String(id || '').trim();
        const step = Number(direction);
        const store = getStore();
        if (!cleanId || !store || !Number.isFinite(step) || step === 0) return;

        const sortEl = document.getElementById('eventSort');
        if (sortEl) {
            const currentSort = String(sortEl.value || '').trim().toLowerCase();
            if (currentSort !== 'oldest' && currentSort !== 'newest') {
                sortEl.value = 'oldest';
            }
        }

        const { filtered } = getFilteredEvents();
        const filteredIds = filtered.map((evt) => String(evt && evt.id || '').trim()).filter(Boolean);
        const currentIndex = filteredIds.indexOf(cleanId);
        const targetIndex = currentIndex + (step < 0 ? -1 : 1);
        if (currentIndex < 0 || targetIndex < 0 || targetIndex >= filteredIds.length) return;

        const events = getTimelineEvents(store);
        if (!Array.isArray(events)) return;
        const sourceIdx = events.findIndex((evt) => String(evt && evt.id || '').trim() === cleanId);
        const targetId = filteredIds[targetIndex];
        const destinationIdx = events.findIndex((evt) => String(evt && evt.id || '').trim() === targetId);
        if (sourceIdx < 0 || destinationIdx < 0 || sourceIdx === destinationIdx) return;

        const [moved] = events.splice(sourceIdx, 1);
        events.splice(destinationIdx, 0, moved);
        persistTimelineEventOrder(store);
        renderTimeline();
    }

    function toggleEventForm() {
        const form = document.getElementById('eventForm');
        if (!form) return;
        form.style.display = form.style.display === 'block' ? 'none' : 'block';
        if (form.style.display === 'block') {
            document.getElementById('eventTitle').focus();
        }
    }

    function resetForm() {
        ['eventTitle', 'eventFocus', 'eventTags', 'eventImageUrl', 'eventHighlights', 'eventFallout', 'eventFollow'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        const heat = document.getElementById('eventHeat');
        if (heat) heat.value = '';
        const certainty = document.getElementById('eventCertainty');
        if (certainty) certainty.value = String(CERTAINTY_DEFAULT);
        const severity = document.getElementById('eventImpactSeverity');
        if (severity) severity.value = 'moderate';
        const scope = document.getElementById('eventImpactScope');
        if (scope) scope.value = 'local';
    }

    function addTimelineEvent() {
        const store = getStore();
        if (!store) return;
        const title = document.getElementById('eventTitle').value.trim();
        if (!title) {
            alert('Event name required.');
            return;
        }
        const imageRaw = document.getElementById('eventImageUrl').value.trim();
        const imageUrl = sanitizeImageUrl(imageRaw);
        if (imageRaw && !imageUrl) {
            alert('Please provide a valid image URL.');
            return;
        }
        const data = {
            id: 'event_' + Date.now(),
            title,
            focus: document.getElementById('eventFocus').value,
            heatDelta: document.getElementById('eventHeat').value,
            impactSeverity: sanitizeImpactSeverity(document.getElementById('eventImpactSeverity').value, 'moderate'),
            impactScope: sanitizeImpactScope(document.getElementById('eventImpactScope').value, 'local'),
            certainty: clampCertainty(document.getElementById('eventCertainty').value, CERTAINTY_DEFAULT),
            tags: document.getElementById('eventTags').value,
            imageUrl,
            highlights: document.getElementById('eventHighlights').value,
            fallout: document.getElementById('eventFallout').value,
            followUp: document.getElementById('eventFollow').value,
            resolved: false,
            created: new Date().toISOString()
        };
        addTimelineEventToStore(store, data);
        applyHeatDelta(parseHeatDelta(data.heatDelta), store);
        resetForm();
        toggleEventForm();
        renderTimeline();
    }

    function addLead(leadLike) {
        const caseId = getTimelineScopeId();
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

    function addLeadFromEvent(eventId) {
        const cleanId = String(eventId || '').trim();
        if (!cleanId) return;
        const existing = getCaseLeads(getTimelineScopeId()).find((lead) =>
            lead && lead.type === 'event' &&
            String(lead.targetId || '') === cleanId &&
            lead.status !== 'resolved' &&
            lead.status !== 'dead-end'
        );
        if (existing) return existing;
        const store = getStore();
        if (!store) return;
        const evt = (getTimelineEvents(store) || []).find((entry) => String(entry && entry.id || '') === cleanId);
        if (!evt) return;
        return addLead({
            type: 'event',
            targetId: cleanId,
            title: evt.title || 'Untitled Event',
            question: `What does this event reveal about the case?`,
            nextStep: `Follow up on "${evt.title || 'event'}".`,
            status: 'open',
            votes: {}
        });
    }

    function openLeadsPage(leadId = '') {
        const url = new URL('leads.html', window.location.href);
        const cleanLeadId = String(leadId || '').trim();
        if (cleanLeadId) url.searchParams.set('leadId', cleanLeadId);
        window.location.assign(url.toString());
    }

    function queueLeadFromEvent(eventId) {
        if (isCampaignMetaView()) {
            alert('Lead Queue is case-scoped. Use Case Timeline for lead triage.');
            return;
        }
        const lead = addLeadFromEvent(eventId);
        if (!lead || !lead.id) return;
        openLeadsPage(lead.id);
    }

    function updateLeadField(leadId, field, value) {
        const id = String(leadId || '').trim();
        if (!id) return;
        refreshLeadTargetIndex();
        const caseId = getTimelineScopeId();
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
        if (!voter) {
            alert('Enter your voter name before voting.');
            return;
        }
        const caseId = getTimelineScopeId();
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
        const caseId = getTimelineScopeId();
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
        const caseId = getTimelineScopeId();
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
        const list = getCaseLeads(getTimelineScopeId());
        const lead = list.find((entry) => entry.id === id);
        if (!lead) return;
        const target = String(lead.targetId || '').trim();
        if (!target) {
            alert('This lead has no linked record to open on board.');
            return;
        }

        const url = new URL(getBoardPageHref(), window.location.href);
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

    function buildTimelineFullLeadCardMarkup(lead, voter) {
        const leadId = escapeHandlerArg(lead.id);
        const score = getLeadScore(lead);
        const currentVote = voter && lead.votes ? lead.votes[voter] : '';
        return `
            <article class="lead-card">
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
                    <button class="btn" data-onclick="openLeadOnBoard('${leadId}')">Board</button>
                    <button class="btn btn-danger" data-onclick="deleteLead('${leadId}')">Delete</button>
                </div>
            </article>
        `;
    }

    function buildTimelineFallbackLeadCardMarkup(lead, voter) {
        const leadId = escapeHandlerArg(String(lead && lead.id || ''));
        const score = getLeadScore(lead);
        const currentVote = voter && lead && lead.votes ? lead.votes[voter] : '';
        const typeLabel = escapeHtml(String(lead && lead.type || 'other').trim().toUpperCase() || 'OTHER');
        const question = escapeHtml(String(lead && lead.question || '').trim());
        const nextStep = escapeHtml(String(lead && lead.nextStep || '').trim());
        const statusValue = String(lead && lead.status || 'open');
        const rawTarget = String(lead && lead.targetId || '').trim();
        const targetDisplay = escapeHtml(getLeadTargetDisplayValue(String(lead && lead.type || 'other'), rawTarget, String(lead && lead.id || '')) || '');
        const linkedRecord = rawTarget
            ? `${typeLabel} • ${targetDisplay || escapeHtml(rawTarget)}`
            : 'None';
        const voteSummary = escapeHtml(formatLeadVotes(lead));
        return `
            <article class="lead-card">
                <div class="lead-head">
                    <strong>${escapeHtml(String(lead && lead.title || 'Untitled Lead'))}</strong>
                    <div class="lead-meta">
                        <span class="lead-pill">${typeLabel}</span>
                        <span class="lead-pill">${escapeHtml(LEAD_STATUS_LABELS[String(lead && lead.status || 'open')] || 'Open')}</span>
                        <span class="lead-pill score">Score ${score >= 0 ? '+' : ''}${score}</span>
                    </div>
                </div>
                <div class="lead-row">
                    <div>
                        <label>Question</label>
                        <input type="text" value="${question}" data-onchange="updateLeadField('${leadId}', 'question', this.value)">
                    </div>
                    <div>
                        <label>Next Step</label>
                        <input type="text" value="${nextStep}" data-onchange="updateLeadField('${leadId}', 'nextStep', this.value)">
                    </div>
                </div>
                <div class="lead-row">
                    <div>
                        <label>Status</label>
                        <select data-onchange="updateLeadField('${leadId}', 'status', this.value)">
                            ${LEAD_STATUSES.map((status) => `<option value="${status}" ${status === statusValue ? 'selected' : ''}>${escapeHtml(LEAD_STATUS_LABELS[status])}</option>`).join('')}
                        </select>
                    </div>
                    <div class="lead-fallback-info">
                        <div class="lead-fallback-line"><span class="lead-fallback-label">Linked:</span> ${linkedRecord}</div>
                    </div>
                </div>
                <div class="lead-vote-row">
                    <button class="btn ${currentVote === 'hot' ? 'is-selected' : ''}" data-onclick="setLeadVote('${leadId}', 'hot')">Hot</button>
                    <button class="btn ${currentVote === 'cold' ? 'is-selected' : ''}" data-onclick="setLeadVote('${leadId}', 'cold')">Cold</button>
                    <button class="btn ${currentVote === 'dead-end' ? 'is-selected' : ''}" data-onclick="setLeadVote('${leadId}', 'dead-end')">Dead End</button>
                    <button class="btn" data-onclick="clearLeadVote('${leadId}')">Clear Vote</button>
                </div>
                <div class="lead-vote-summary">${voteSummary}</div>
                <div class="lead-actions">
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
        const leads = getCaseLeads(getTimelineScopeId());
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
            listEl.innerHTML = '<div class="lead-empty">No leads yet. Create one from events or add manually.</div>';
            return;
        }

        listEl.innerHTML = sorted.map((lead) => {
            try {
                return buildTimelineFullLeadCardMarkup(lead, voter);
            } catch (err) {
                console.error('Timeline lead card render failed; using fallback for lead:', lead && lead.id, err);
                return buildTimelineFallbackLeadCardMarkup(lead, voter);
            }
        }).join('');
    }

    function spendProcedureShield(eventId) {
        const cleanId = String(eventId || '').trim();
        if (!cleanId) return;
        const store = getStore();
        if (!store) return;
        const events = getTimelineEvents(store) || [];
        const evt = events.find((entry) => String(entry && entry.id || '') === cleanId);
        if (!evt) return;

        const heat = parseHeatDelta(evt.heatDelta);
        if (heat <= 0) {
            alert('Procedure Shield can only be used on events with positive Heat.');
            return;
        }

        const procedureState = getProcedureState();
        if (!procedureState) {
            alert('Open Prep & Procedure Clocks first so shield resources are available.');
            return;
        }

        const freeShield = hasFreeShieldAvailable(procedureState);
        if (!freeShield && Number(procedureState.procedure.filled || 0) < 1) {
            alert('No Procedure segments available to spend.');
            return;
        }

        if (freeShield) {
            sessionStorage.setItem(getFreeShieldSessionKey(), '1');
        } else {
            procedureState.procedure.filled = Math.max(0, Number(procedureState.procedure.filled || 0) - 1);
            saveProcedureState(procedureState);
        }

        const nextHeat = Math.max(0, heat - 1);
        updateEventField(cleanId, 'heatDelta', String(nextHeat));

        const priorFollowUp = String(evt.followUp || '').trim();
        const shieldLine = `Procedure Shield used (${freeShield ? 'free prep bonus' : 'spent 1 Procedure'}): Heat ${heat > 0 ? '+' : ''}${heat} -> ${nextHeat > 0 ? '+' : ''}${nextHeat}.`;
        const mergedFollowUp = priorFollowUp ? `${priorFollowUp}\n${shieldLine}` : shieldLine;
        updateEventField(cleanId, 'followUp', mergedFollowUp);

        addTimelineEventToStore(store, {
            id: `event_proc_shield_${Date.now()}`,
            title: 'Procedure Shield Activated',
            focus: evt.focus || 'Timeline',
            heatDelta: '',
            tags: 'procedure,shield,heat-control',
            highlights: `${shieldLine} Source event: ${evt.title || cleanId}.`,
            fallout: '',
            followUp: '',
            source: 'timeline',
            kind: 'procedure-shield',
            resolved: false,
            created: new Date().toISOString()
        });
        renderTimeline();
    }

    function updateEventField(id, field, value) {
        const store = getStore();
        if (!store) return;
        let nextValue = value;
        if (field === 'imageUrl') {
            const raw = String(value || '').trim();
            const clean = sanitizeImageUrl(raw);
            if (raw && !clean) {
                alert('Please provide a valid image URL.');
                renderTimeline();
                return;
            }
            nextValue = clean;
        }
        if (field === 'certainty') {
            nextValue = clampCertainty(value, CERTAINTY_DEFAULT);
        }
        if (field === 'impactSeverity') {
            nextValue = sanitizeImpactSeverity(value, 'moderate');
        }
        if (field === 'impactScope') {
            nextValue = sanitizeImpactScope(value, 'local');
        }
        const existing = (getTimelineEvents(store) || []).find((evt) => evt && evt.id === id);
        const previousHeat = existing ? parseHeatDelta(existing.heatDelta) : 0;
        updateTimelineEventInStore(store, id, { [field]: nextValue });
        if (field === 'heatDelta') {
            const nextHeat = parseHeatDelta(nextValue);
            applyHeatDelta(nextHeat - previousHeat, store);
        }
        renderTimeline();
    }

    function deleteTimelineEvent(id) {
        const store = getStore();
        if (!store) return;
        const existing = (getTimelineEvents(store) || []).find((evt) => evt && evt.id === id);
        if (!existing) return;
        const previousHeat = existing ? parseHeatDelta(existing.heatDelta) : 0;

        const manager = getDeleteManager();
        if (!manager) {
            if (!confirm('Delete this logged event?')) return;
            deleteTimelineEventFromStore(store, id);
            applyHeatDelta(-previousHeat, store);
            renderTimeline();
            return;
        }

        manager.schedule({
            id,
            label: `Event removed: ${existing.title || 'Untitled Event'}`,
            onFinalize: () => {
                deleteTimelineEventFromStore(store, id);
                applyHeatDelta(-previousHeat, store);
                renderTimeline();
            },
            onUndo: () => {
                renderTimeline();
            }
        });
        renderTimeline();
    }

    function copyEventToCampaignTimeline(id) {
        if (isCampaignMetaView()) {
            alert('You are already on the Campaign Timeline.');
            return;
        }
        const store = getStore();
        if (!store || typeof store.addCampaignMetaEvent !== 'function') {
            alert('Campaign Timeline copy is unavailable in this build.');
            return;
        }
        const cleanId = String(id || '').trim();
        if (!cleanId) return;
        const sourceEvent = (getTimelineEvents(store) || []).find((evt) => evt && String(evt.id || '') === cleanId);
        if (!sourceEvent) {
            alert('Source event was not found.');
            return;
        }

        const activeCase = typeof store.getActiveCase === 'function' ? store.getActiveCase() : null;
        const sourceCaseId = getActiveCaseId();
        const sourceCaseName = activeCase && activeCase.name ? String(activeCase.name).trim() : '';
        const copiedId = store.addCampaignMetaEvent({
            title: String(sourceEvent.title || '').trim(),
            focus: String(sourceEvent.focus || '').trim(),
            heatDelta: String(sourceEvent.heatDelta || '').trim(),
            tags: String(sourceEvent.tags || '').trim(),
            imageUrl: String(sourceEvent.imageUrl || '').trim(),
            highlights: String(sourceEvent.highlights || '').trim(),
            fallout: String(sourceEvent.fallout || '').trim(),
            followUp: String(sourceEvent.followUp || '').trim(),
            source: String(sourceEvent.source || 'case-timeline-copy').trim() || 'case-timeline-copy',
            kind: 'copied-from-case',
            resolved: Boolean(sourceEvent.resolved),
            impactSeverity: String(sourceEvent.impactSeverity || '').trim(),
            impactScope: String(sourceEvent.impactScope || '').trim(),
            certainty: clampCertainty(sourceEvent.certainty, CERTAINTY_DEFAULT),
            originCaseId: sourceCaseId,
            originCaseName: sourceCaseName,
            originEventId: cleanId,
            created: new Date().toISOString()
        });
        if (!copiedId) {
            alert('Could not copy this event to Campaign Timeline.');
            return;
        }
        alert('Copied to Campaign Timeline.');
    }

    function renderTagPills(tags) {
        if (!tags) return '';
        return tags.split(',').map(t => t.trim()).filter(Boolean)
            .map(tag => `<span class="tag-pill">${escapeHtml(tag)}</span>`)
            .join('');
    }

    function normalizeRecapText(value) {
        if (!value) return '—';
        const cleaned = String(value).trim();
        if (!cleaned) return '—';
        return cleaned.replace(/\s*\n+\s*/g, ' ');
    }

    function buildEventCard(evt, index = 0, total = 0, reorderMode = false) {
        const evtId = escapeJsString(evt.id || '');
        const heat = parseInt(evt.heatDelta, 10);
        const heatClass = heat > 0 ? 'tag-pill-heat-up' : 'tag-pill-heat-down';
        const heatText = !isNaN(heat) && heat !== 0
            ? `<span class="tag-pill ${heatClass}">Heat ${heat > 0 ? '+' : ''}${heat}</span>`
            : '';
        const focusDisplay = evt.focus ? `<span class="tag-pill">${escapeHtml(evt.focus)}</span>` : '';
        const severity = sanitizeImpactSeverity(evt.impactSeverity, 'moderate');
        const scope = sanitizeImpactScope(evt.impactScope, 'local');
        const certainty = clampCertainty(evt.certainty, CERTAINTY_DEFAULT);
        const severityText = `<span class="tag-pill tag-pill-severity severity-${severity}">${escapeHtml(getImpactSeverityLabel(severity))}</span>`;
        const scopeText = `<span class="tag-pill tag-pill-scope">${escapeHtml(getImpactScopeLabel(scope))}</span>`;
        const certaintyText = `<span class="tag-pill tag-pill-certainty">Certainty ${certainty}%</span>`;
        const resolved = Boolean(evt.resolved);
        const statusClass = resolved ? 'resolved' : 'pending';
        const statusLabel = resolved ? 'Resolved' : 'Pending';
        const imageUrl = sanitizeImageUrl(evt.imageUrl || '');
        const imageMarkup = imageUrl
            ? `<div class="event-image-block"><img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(evt.title || 'Event')} image"></div>`
            : '';
        const showProcedureShield = !isNaN(heat) && heat > 0;
        const freeShieldAvailable = showProcedureShield && hasFreeShieldAvailable(getProcedureState());
        const procedureShieldButton = showProcedureShield
            ? `<button class="btn btn-procedure ${freeShieldAvailable ? 'is-free' : ''}" data-onclick="spendProcedureShield('${evtId}')">${freeShieldAvailable ? 'Shield -1 (Free)' : 'Shield -1'}</button>`
            : '';
        const highImpactClass = (!resolved && hasHighImpact(evt)) ? ' event-high-impact' : '';
        const attribution = (evt.lastChangedBy || evt.lastChangedAt)
            ? `Updated ${evt.lastChangedAt ? new Date(evt.lastChangedAt).toLocaleString() : '—'}${evt.lastChangedBy ? ` by ${escapeHtml(evt.lastChangedBy)}` : ''}`
            : '';
        const leadActionButton = isCampaignMetaView()
            ? ''
            : `<button class="btn" data-onclick="queueLeadFromEvent('${evtId}')">Lead Queue</button>`;
        const copyToCampaignButton = isCampaignMetaView()
            ? ''
            : `<button class="btn" data-onclick="copyEventToCampaignTimeline('${evtId}')">Copy to Campaign Timeline</button>`;
        const reorderControls = reorderMode
            ? `<div class="event-reorder-controls">
                    <button class="btn" ${index <= 0 ? 'disabled' : ''} data-onclick="moveTimelineEvent('${evtId}', -1)">Up</button>
                    <button class="btn" ${index >= total - 1 ? 'disabled' : ''} data-onclick="moveTimelineEvent('${evtId}', 1)">Down</button>
               </div>`
            : '';

        return `
        <div class="event-card${imageMarkup ? ' has-image' : ''}${highImpactClass}">
            ${imageMarkup}
            <div class="event-card-content">
                <div class="event-head">
                    <h3><input type="text" value="${escapeHtml(evt.title || '')}" placeholder="Title"
                        data-onchange="updateEventField('${evtId}', 'title', this.value)"></h3>
                    <button class="toggle-btn status-toggle status-pill ${statusClass} ${resolved ? 'active' : ''}" type="button"
                        aria-pressed="${resolved ? 'true' : 'false'}"
                        data-onclick="toggleResolved('${evtId}', this)">${statusLabel}</button>
                </div>
                <div class="event-meta">
                    <div>
                        <label>Focus</label>
                        <input type="text" value="${escapeHtml(evt.focus || '')}" placeholder="District / Guild"
                            data-onchange="updateEventField('${evtId}', 'focus', this.value)">
                    </div>
                    <div>
                        <label>Heat Δ</label>
                        <input type="number" value="${escapeHtml(evt.heatDelta || '')}" placeholder="0"
                            data-onchange="updateEventField('${evtId}', 'heatDelta', this.value)">
                    </div>
                    <div>
                        <label>Severity</label>
                        <select data-onchange="updateEventField('${evtId}', 'impactSeverity', this.value)">
                            ${IMPACT_SEVERITY_OPTIONS.map((option) => `<option value="${option}" ${option === severity ? 'selected' : ''}>${escapeHtml(getImpactSeverityLabel(option))}</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label>Scope</label>
                        <select data-onchange="updateEventField('${evtId}', 'impactScope', this.value)">
                            ${IMPACT_SCOPE_OPTIONS.map((option) => `<option value="${option}" ${option === scope ? 'selected' : ''}>${escapeHtml(getImpactScopeLabel(option))}</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label>Certainty (0-100)</label>
                        <input type="number" min="0" max="100" step="1" value="${certainty}"
                            data-onchange="updateEventField('${evtId}', 'certainty', this.value)">
                    </div>
                    <div>
                        <label>Tags</label>
                        <input type="text" value="${escapeHtml(evt.tags || '')}" placeholder="tags"
                            data-onchange="updateEventField('${evtId}', 'tags', this.value)">
                    </div>
                    <div>
                        <label>Image URL</label>
                        <input type="url" value="${escapeHtml(evt.imageUrl || '')}" placeholder="https://..."
                            data-onchange="updateEventField('${evtId}', 'imageUrl', this.value)">
                    </div>
                </div>
                <div class="event-pill-row">${heatText} ${severityText} ${scopeText} ${certaintyText} ${focusDisplay} ${renderTagPills(evt.tags)}</div>
                <div class="event-body">
                    <textarea placeholder="Highlights" data-onchange="updateEventField('${evtId}', 'highlights', this.value)">${escapeHtml(evt.highlights || '')}</textarea>
                    <textarea placeholder="Fallout" data-onchange="updateEventField('${evtId}', 'fallout', this.value)">${escapeHtml(evt.fallout || '')}</textarea>
                    <textarea placeholder="Follow Ups" data-onchange="updateEventField('${evtId}', 'followUp', this.value)">${escapeHtml(evt.followUp || '')}</textarea>
                </div>
                <div class="event-actions">
                    <small class="event-log-meta">Logged ${evt.created ? new Date(evt.created).toLocaleString() : '—'}</small>
                    ${attribution ? `<small class="event-log-meta">${attribution}</small>` : ''}
                    ${reorderControls}
                    ${procedureShieldButton}
                    ${leadActionButton}
                    ${copyToCampaignButton}
                    <button class="btn" data-onclick="openTimelineEventInBoard('${evtId}')">Board</button>
                    <button class="btn btn-danger" data-onclick="deleteTimelineEvent('${evtId}')">Delete</button>
                </div>
            </div>
        </div>`;
    }

    function populateFocusFilter(events) {
        const filter = document.getElementById('eventFocusFilter');
        if (!filter) return;
        const preserved = filter.value;
        const focusValues = Array.from(new Set(events.map(e => e.focus).filter(Boolean))).sort();
        filter.innerHTML = '<option value="">All Focuses</option>' + focusValues.map(focus => `<option value="${escapeHtml(focus)}">${escapeHtml(focus)}</option>`).join('');
        if (pendingDeepLinkFocus && focusValues.includes(pendingDeepLinkFocus)) {
            filter.value = pendingDeepLinkFocus;
            pendingDeepLinkFocus = '';
            return;
        }
        if (focusValues.includes(preserved)) {
            filter.value = preserved;
        }
    }

    function getFilteredEvents() {
        const store = getStore();
        const manager = getDeleteManager();
        if (!store) {
            return { filtered: [], filters: null };
        }
        const events = (getTimelineEvents(store) || []).slice();
        populateFocusFilter(events);

        const search = (document.getElementById('eventSearch').value || '').toLowerCase();
        const focusFilter = document.getElementById('eventFocusFilter').value;
        const sort = getTimelineSortMode();
        const impactOnly = isButtonPressed('eventImpactOnly');
        const hideResolved = isButtonPressed('eventHideResolved');

        const filtered = events.filter(evt => {
            if (manager && manager.isPending(evt.id)) return false;
            const text = `${evt.id || ''} ${evt.title || ''} ${evt.focus || ''} ${evt.highlights || ''} ${evt.fallout || ''} ${evt.followUp || ''} ${evt.tags || ''} ${evt.impactSeverity || ''} ${evt.impactScope || ''} ${evt.certainty || ''}`.toLowerCase();
            const matchesSearch = search ? text.includes(search) : true;
            const matchesFocus = focusFilter ? evt.focus === focusFilter : true;
            const heat = parseInt(evt.heatDelta, 10);
            const matchesImpact = impactOnly
                ? (!isNaN(heat) && heat !== 0)
                    || (evt.fallout && evt.fallout.trim())
                    || hasHighImpact(evt)
                : true;
            const matchesResolved = hideResolved ? !evt.resolved : true;
            return matchesSearch && matchesFocus && matchesImpact && matchesResolved;
        });

        if (sort === 'heat') {
            filtered.sort((a, b) => {
                const aHeat = Math.abs(parseInt(a.heatDelta || '0', 10));
                const bHeat = Math.abs(parseInt(b.heatDelta || '0', 10));
                return bHeat - aHeat;
            });
        } else if (sort === 'newest') {
            filtered.reverse();
        }

        return {
            filtered,
            filters: {
                search,
                focusFilter,
                sort,
                impactOnly,
                hideResolved
            }
        };
    }

    function buildExportRecap(events, filters) {
        const lines = [];
        lines.push('# Mission Timeline Recap');
        lines.push(`Generated: ${new Date().toLocaleString()}`);
        lines.push('');
        lines.push('## Active Filters');
        lines.push(`- Search: ${filters.search ? `"${filters.search}"` : 'None'}`);
        lines.push(`- Focus: ${filters.focusFilter || 'All'}`);
        lines.push(`- Sort: ${filters.sort}`);
        lines.push(`- Impact only: ${filters.impactOnly ? 'Yes' : 'No'}`);
        lines.push(`- Hide resolved: ${filters.hideResolved ? 'Yes' : 'No'}`);
        lines.push('');

        events.forEach(evt => {
            const title = normalizeRecapText(evt.title);
            const focus = normalizeRecapText(evt.focus);
            const heat = parseInt(evt.heatDelta, 10);
            const heatDisplay = Number.isNaN(heat) ? '—' : `${heat > 0 ? '+' : ''}${heat}`;
            const severity = getImpactSeverityLabel(evt.impactSeverity);
            const scope = getImpactScopeLabel(evt.impactScope);
            const certainty = `${clampCertainty(evt.certainty, CERTAINTY_DEFAULT)}%`;
            lines.push(`### ${title}`);
            lines.push(`- Focus: ${focus}`);
            lines.push(`- Heat Δ: ${heatDisplay}`);
            lines.push(`- Severity: ${severity}`);
            lines.push(`- Scope: ${scope}`);
            lines.push(`- Certainty: ${certainty}`);
            lines.push(`- Status: ${evt.resolved ? 'Resolved' : 'Pending'}`);
            lines.push(`- Image: ${normalizeRecapText(evt.imageUrl)}`);
            lines.push(`- Highlights: ${normalizeRecapText(evt.highlights)}`);
            lines.push(`- Fallout: ${normalizeRecapText(evt.fallout)}`);
            lines.push(`- Follow-up: ${normalizeRecapText(evt.followUp)}`);
            lines.push('');
        });

        return lines.join('\n').trim() + '\n';
    }

    function triggerRecapDownload(text) {
        const dateStamp = new Date().toISOString().slice(0, 10);
        const blob = new Blob([text], { type: 'text/markdown' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `mission-timeline-recap-${dateStamp}.md`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(link.href), 500);
    }

    function exportTimelineRecap() {
        const { filtered, filters } = getFilteredEvents();
        if (!filters) return;
        if (!filtered.length) {
            alert('No matching events to export.');
            return;
        }
        const recapText = buildExportRecap(filtered, filters);
        triggerRecapDownload(recapText);

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(recapText).catch(() => {
                // Clipboard may be blocked; download already started.
            });
        }
    }

    function renderTimeline() {
        const container = document.getElementById('timelineList');
        if (!container) return;
        const { filtered } = getFilteredEvents();
        const moveModeButton = document.getElementById('eventMoveMode');
        if (moveModeButton && !isChronologicalSortSelected() && moveModeButton.getAttribute('aria-pressed') === 'true') {
            setButtonPressed(moveModeButton, false);
        }
        const reorderMode = isMoveModeEnabled();

        container.innerHTML = filtered.length
            ? filtered.map((evt, index) => buildEventCard(evt, index, filtered.length, reorderMode)).join('')
            : '<div class="empty-state">No events logged yet.</div>';
        renderLeadQueue();
    }

    function init() {
        getDeleteManager();
        const autoHeatToggle = document.getElementById('eventAutoHeat');
        if (autoHeatToggle) {
            setButtonPressed(autoHeatToggle, isHeatAutoSyncEnabled());
        }
        applyTimelineLinkFiltersFromUrl();
        const voterInput = document.getElementById('leadVoter');
        if (voterInput) {
            voterInput.value = getOrCreateLeadVoter();
            voterInput.addEventListener('input', () => {
                localStorage.setItem(LEAD_VOTER_NAME_KEY, String(voterInput.value || '').trim().slice(0, 60));
                renderLeadQueue();
            });
        }
        renderTimeline();
    }

    function waitForStore() {
        if (getStore()) {
            init();
        } else {
            setTimeout(waitForStore, 100);
        }
    }

    window.toggleEventForm = toggleEventForm;
    window.addTimelineEvent = addTimelineEvent;
    window.renderTimeline = renderTimeline;
    window.moveTimelineEvent = moveTimelineEvent;
    window.updateEventField = updateEventField;
    window.deleteTimelineEvent = deleteTimelineEvent;
    window.copyEventToCampaignTimeline = copyEventToCampaignTimeline;
    window.setHeatAutoSync = setHeatAutoSync;
    window.exportTimelineRecap = exportTimelineRecap;
    window.openTimelineEventInBoard = openTimelineEventInBoard;
    window.spendProcedureShield = spendProcedureShield;
    window.addLeadFromEvent = addLeadFromEvent;
    window.queueLeadFromEvent = queueLeadFromEvent;
    window.addLeadFromForm = addLeadFromForm;
    window.refreshLeadTargetPicker = refreshLeadTargetPicker;
    window.openLeadsPage = openLeadsPage;
    window.updateLeadField = updateLeadField;
    window.setLeadVote = setLeadVote;
    window.clearLeadVote = clearLeadVote;
    window.deleteLead = deleteLead;
    window.openLeadOnBoard = openLeadOnBoard;
    window.toggleFilterButton = toggleFilterButton;
    window.toggleAutoHeat = toggleAutoHeat;
    window.toggleMoveMode = toggleMoveMode;
    window.toggleResolved = toggleResolved;

    window.addEventListener('load', waitForStore);
    window.addEventListener('beforeunload', () => {
        const manager = getDeleteManager();
        if (manager && typeof manager.flush === 'function') manager.flush();
    });
    window.addEventListener('storage', (event) => {
        if (!event || event.key !== LEAD_STORAGE_KEY) return;
        renderLeadQueue();
    });
    window.addEventListener('rtf-store-updated', (event) => {
        if (!event || !event.detail || event.detail.source !== 'remote') return;
        renderTimeline();
    });

    function setButtonPressed(button, pressed) {
        if (!button) return;
        const isPressed = Boolean(pressed);
        button.setAttribute('aria-pressed', String(isPressed));
        button.classList.toggle('active', isPressed);
    }

    function isButtonPressed(id) {
        const button = document.getElementById(id);
        return button ? button.getAttribute('aria-pressed') === 'true' : false;
    }

    function toggleFilterButton(button, callback) {
        if (!button) return;
        const next = button.getAttribute('aria-pressed') !== 'true';
        setButtonPressed(button, next);
        if (typeof callback === 'function') callback();
    }

    function toggleAutoHeat(button) {
        if (!button) return;
        const next = button.getAttribute('aria-pressed') !== 'true';
        setButtonPressed(button, next);
        setHeatAutoSync(next);
    }

    function toggleMoveMode(button) {
        if (!button) return;
        const next = button.getAttribute('aria-pressed') !== 'true';
        const sortEl = document.getElementById('eventSort');
        if (next && sortEl) {
            const currentSort = String(sortEl.value || '').trim().toLowerCase();
            if (currentSort !== 'oldest' && currentSort !== 'newest') {
                sortEl.value = 'oldest';
            }
        }
        setButtonPressed(button, next);
        renderTimeline();
    }

    function toggleResolved(id, button) {
        if (!button) return;
        const next = button.getAttribute('aria-pressed') !== 'true';
        setButtonPressed(button, next);
        updateEventField(id, 'resolved', next);
    }
})();
