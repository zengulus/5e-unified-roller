// Use global data if available, fallback to hardcoded (safety)
const guilds = (typeof window.getRTFGuilds === 'function')
    ? window.getRTFGuilds({ includeGuildless: true })
    : ((window.RTF_DATA && window.RTF_DATA.guilds)
        ? window.RTF_DATA.guilds
        : ["Azorius", "Boros", "Dimir", "Golgari", "Gruul", "Izzet", "Orzhov", "Rakdos", "Selesnya", "Simic", "Guildless"]);

// Rewards converted to a datalist for suggestions while allowing free text
const projectRewards = ["+1 Reputation", "Reduce Heat by 1", "Gain a Contact", "Professional Dev (New Tool/Lang)", "Nonmagical Perk"];

const escapeHtml = (str = '') => String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
const escapeJsString = (value = '') => String(value)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
const delegatedHandlerEvents = ['click', 'change', 'input'];
const delegatedHandlerCache = new Map();
let delegatedHandlersBound = false;
const PLAYER_SCOPE_PREFIX = 'campaign.players';
const SHARED_TRACK_MIN = 0;
const SHARED_TRACK_MAX = 6;
let systemDetailToggleBound = false;

function normalizePlayerScopeId(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return '';
    return raw.replace(/[^a-z0-9_-]/g, '').slice(0, 80);
}

function buildPlayerScope(playerId) {
    const id = normalizePlayerScopeId(playerId);
    if (!id || id === '__order') return PLAYER_SCOPE_PREFIX;
    return `${PLAYER_SCOPE_PREFIX}.${id}`;
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

bindDelegatedDataHandlers();

function clampSharedTrack(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return SHARED_TRACK_MIN;
    return Math.max(SHARED_TRACK_MIN, Math.min(SHARED_TRACK_MAX, parsed));
}

function getHeatWarning(heat) {
    if (heat >= 6) return "CRITICAL: Hard Constraint mandated.";
    if (heat >= 3) return "WARNING: Complication Scene triggered.";
    return "";
}

function getCognitiveRiskWarning(risk) {
    if (risk >= 6) return "NARRATIVE COLLAPSE: Official records and witness accounts destabilize.";
    if (risk >= 5) return "SEVERE DISCONTINUITY: A major prior-case detail has collapsed.";
    if (risk >= 4) return "IDENTITY DRIFT: Bureaucratic checks degrade and records start failing.";
    if (risk >= 3) return "MEMORY FRACTURES: Temporary personal-memory loss is in play.";
    if (risk >= 2) return "MINOR SLIPPAGE: Notes, names, and report copies begin to conflict.";
    return "";
}

function bindSystemDetailToggle() {
    if (systemDetailToggleBound) return;
    systemDetailToggleBound = true;
    const title = document.getElementById('hubPageTitle');
    if (!title) return;
    title.addEventListener('click', (event) => {
        if (!event.altKey) return;
        event.preventDefault();
        document.body.classList.toggle('hub-system-details-visible');
    });
}

// Shortcut to Store Campaign Data
function getCampaign() {
    if (!window.RTF_STORE) return null;
    return window.RTF_STORE.state.campaign;
}

function save(scope = 'campaign') {
    if (window.RTF_STORE) window.RTF_STORE.save({ scope });
    render();
}

function exportData() {
    if (window.RTF_STORE) window.RTF_STORE.export();
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

function exportLLMSnapshot() {
    if (!window.RTF_STORE) {
        alert('Store not loaded.');
        return;
    }
    if (typeof window.RTF_STORE.exportLLMSnapshot !== 'function') {
        alert('This build does not support LLM snapshot export yet.');
        return;
    }
    const mode = chooseLLMSnapshotMode('full');
    if (!mode) return;
    window.RTF_STORE.exportLLMSnapshot({ mode });
}

function importData() {
    if (window.RTF_STORE) {
        window.RTF_STORE.import().then(success => {
            if (success) {
                alert("Data imported successfully!");
                render();
            }
        });
    }
}

function getAllCaseEvents() {
    if (!window.RTF_STORE || !window.RTF_STORE.state) return [];
    if (!window.RTF_STORE.state.cases) {
        const legacyEvents = window.RTF_STORE.state.campaign && Array.isArray(window.RTF_STORE.state.campaign.events)
            ? window.RTF_STORE.state.campaign.events
            : [];
        return legacyEvents.slice();
    }
    const cases = Array.isArray(window.RTF_STORE.state.cases.items) ? window.RTF_STORE.state.cases.items : [];
    const out = [];
    cases.forEach((entry) => {
        const events = entry && Array.isArray(entry.events) ? entry.events : [];
        events.forEach((evt) => out.push(evt));
    });
    return out;
}

function renderNarrativePressure() {
    const summaryEl = document.getElementById('hubNarrativePressureSummary');
    if (!summaryEl || !window.RTF_STORE) return;
    const events = getAllCaseEvents();
    const now = Date.now();
    const overdueCount = events.filter((evt) => {
        if (!evt || evt.resolved) return false;
        const dueTs = Date.parse(String(evt.dueAt || '').trim());
        return Number.isFinite(dueTs) && dueTs < now;
    }).length;
    const highImpactCount = events.filter((evt) => {
        if (!evt || evt.resolved) return false;
        const severity = String(evt.impactSeverity || '').trim().toLowerCase();
        return severity === 'high' || severity === 'critical';
    }).length;
    const ledger = window.RTF_STORE.state && window.RTF_STORE.state.campaign && window.RTF_STORE.state.campaign.ledger
        ? window.RTF_STORE.state.campaign.ledger
        : { entries: [] };
    const entries = Array.isArray(ledger.entries) ? ledger.entries : [];
    const stableCount = entries.filter((entry) => String(entry && entry.status || '') === 'stable').length;
    const contestedCount = entries.filter((entry) => {
        const status = String(entry && entry.status || '');
        return status === 'contested' || status === 'collapsed';
    }).length;

    summaryEl.innerHTML = `
        <div>Overdue unresolved deadlines: <strong>${overdueCount}</strong></div>
        <div>High-impact unresolved events: <strong>${highImpactCount}</strong></div>
        <div>Ledger stable vs contested/collapsed: <strong>${stableCount} / ${contestedCount}</strong></div>
    `;
}

function saveCase() {
    const campaign = getCampaign();
    if (!campaign || !campaign.case) return;
    const c = campaign.case;
    c.title = document.getElementById('caseTitle').value;
    c.guilds = document.getElementById('caseGuilds').value;
    c.goal = document.getElementById('caseGoal').value;
    c.clock = document.getElementById('caseClock').value;
    c.obstacles = document.getElementById('caseObstacles').value;
    c.setPiece = document.getElementById('caseSetPiece').value;
    save('campaign.case');
}

function resetAll() {
    if (confirm("Reset everything? This will wipe the Unified Store.")) {
        localStorage.removeItem('ravnica_unified_v1');
        localStorage.removeItem('invBoardData');
        location.reload();
    }
}

function modRep(g, amt) {
    const campaign = getCampaign();
    if (!campaign || !campaign.rep) return;
    const rep = campaign.rep;
    const key = String(g || '');
    if (key === '__proto__' || key === 'prototype' || key === 'constructor') return;
    rep[key] = Math.max(-2, Math.min(2, (Number(rep[key]) || 0) + amt));
    save('campaign.rep');
}

function modHeat(amt) {
    const c = getCampaign();
    if (!c) return;
    c.heat = clampSharedTrack((Number(c.heat) || 0) + Number(amt || 0));
    save('campaign.heat');
}

function modCognitiveRisk(amt) {
    const c = getCampaign();
    if (!c) return;
    c.cognitiveRisk = clampSharedTrack((Number(c.cognitiveRisk) || 0) + Number(amt || 0));
    save('campaign.cognitiveRisk');
}

// --- PLAYER LOGIC ---
function addPlayer() {
    const c = getCampaign();
    if (!c || !Array.isArray(c.players)) return;
    const player = {
        id: 'player_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 5),
        name: "New Recruit",
        dp: 2,
        projectClock: 0,
        projectName: "",
        projectReward: "+1 Reputation",
        ac: 10,
        hp: 10,
        pp: 10,
        dc: 10
    };
    c.players.push(player);
    save(buildPlayerScope(player.id));
}

function modDP(idx, amt) {
    const campaign = getCampaign();
    if (!campaign || !Array.isArray(campaign.players)) return;
    const p = campaign.players[idx];
    if (!p) return;
    p.dp = Math.max(0, Math.min(4, (Number(p.dp) || 0) + amt));
    save(buildPlayerScope(p.id));
}

function grantWeeklyDP() {
    const campaign = getCampaign();
    if (!campaign || !Array.isArray(campaign.players)) return;
    campaign.players.forEach((p) => {
        if (!p) return;
        p.dp = Math.max(0, Math.min(4, (Number(p.dp) || 0) + 2));
    });
    const scopes = campaign.players
        .filter((p) => p && typeof p === 'object')
        .map((p) => buildPlayerScope(p.id));
    save(scopes.length ? scopes : PLAYER_SCOPE_PREFIX);
}

function modClock(idx, amt) {
    const campaign = getCampaign();
    if (!campaign || !Array.isArray(campaign.players)) return;
    const p = campaign.players[idx];
    if (!p) return;
    p.projectClock = Math.max(0, Math.min(4, (Number(p.projectClock) || 0) + amt));
    save(buildPlayerScope(p.id));
}

function deletePlayer(idx) {
    if (!confirm('Delete?')) return;
    const campaign = getCampaign();
    if (!campaign || !Array.isArray(campaign.players)) return;
    const player = campaign.players[idx];
    if (!player) return;
    const playerId = player.id;
    campaign.players.splice(idx, 1);
    save(buildPlayerScope(playerId));
}

function renderClockPie(value, total = 4, extraClass = '') {
    const maxSegments = total === 6 ? 6 : 4;
    const safeValue = Math.max(0, Math.min(maxSegments, Number(value) || 0));
    const fill = (safeValue / maxSegments) * 360;
    const className = extraClass ? `clock-pie ${extraClass}` : 'clock-pie';
    return `<div class="${className}" data-clock-total="${maxSegments}" data-clock-fill="${fill.toFixed(2)}" role="img" aria-label="Clock ${safeValue} of ${maxSegments}"></div>`;
}

function applyClockPieStyles(scopeEl) {
    const root = scopeEl && typeof scopeEl.querySelectorAll === 'function' ? scopeEl : document;
    root.querySelectorAll('.clock-pie[data-clock-total][data-clock-fill]').forEach((el) => {
        const total = parseInt(el.getAttribute('data-clock-total'), 10);
        const fill = parseFloat(el.getAttribute('data-clock-fill'));
        el.style.setProperty('--clock-total', String(Number.isFinite(total) ? total : 4));
        el.style.setProperty('--clock-fill', `${Number.isFinite(fill) ? fill : 0}deg`);
    });
}

function updatePlayer(idx, field, val) {
    const campaign = getCampaign();
    if (!campaign || !Array.isArray(campaign.players)) return;
    if (!campaign.players[idx]) return;
    if (!['name', 'projectName', 'projectReward'].includes(field)) return;
    campaign.players[idx][field] = val;
    save(buildPlayerScope(campaign.players[idx].id));
}



function render() {
    const c = getCampaign();
    if (!c) return; // Wait for store load
    const players = Array.isArray(c.players) ? c.players : [];

    // Render Case Info
    const caseData = c.case || {};
    document.getElementById('caseTitle').value = caseData.title || "";
    document.getElementById('caseGuilds').value = caseData.guilds || "";
    document.getElementById('caseGoal').value = caseData.goal || "";
    document.getElementById('caseClock').value = caseData.clock || "";
    document.getElementById('caseObstacles').value = caseData.obstacles || "";
    document.getElementById('caseSetPiece').value = caseData.setPiece || "";

    // Shared Status
    document.getElementById('repGrid').innerHTML = guilds.map((g) => {
        const repRaw = Number(c.rep && c.rep[g]);
        const repVal = Number.isFinite(repRaw) ? Math.max(-2, Math.min(2, repRaw)) : 0;
        const repClass = repVal > 0 ? 'hub-rep-value-pos' : repVal < 0 ? 'hub-rep-value-neg' : 'hub-rep-value-neutral';
        const guildArg = escapeJsString(g);
        return `
            <div class="hub-rep-card">
                <div class="mini-label hub-rep-mini-label">${escapeHtml(g)}</div>
                <div class="hub-rep-value ${repClass}">${repVal > 0 ? '+' : ''}${repVal}</div>
                <div class="hub-rep-actions">
                    <button class="btn hub-btn-compact" data-onclick="modRep('${guildArg}', -1)">-</button>
                    <button class="btn hub-btn-compact" data-onclick="modRep('${guildArg}', 1)">+</button>
                </div>
            </div>
        `;
    }).join('');

    const safeHeat = clampSharedTrack(c.heat);
    document.getElementById('heatVal').innerText = safeHeat;
    document.getElementById('heatFill').style.width = ((safeHeat / SHARED_TRACK_MAX) * 100) + '%';
    document.getElementById('heatWarning').innerText = getHeatWarning(safeHeat);

    const safeCognitiveRisk = clampSharedTrack(c.cognitiveRisk);
    const cognitiveRiskValEl = document.getElementById('cognitiveRiskVal');
    const cognitiveRiskFillEl = document.getElementById('cognitiveRiskFill');
    const cognitiveRiskWarningEl = document.getElementById('cognitiveRiskWarning');
    if (cognitiveRiskValEl) cognitiveRiskValEl.innerText = safeCognitiveRisk;
    if (cognitiveRiskFillEl) cognitiveRiskFillEl.style.width = ((safeCognitiveRisk / SHARED_TRACK_MAX) * 100) + '%';
    if (cognitiveRiskWarningEl) cognitiveRiskWarningEl.innerText = getCognitiveRiskWarning(safeCognitiveRisk);

    // Player List
    const rewardOptions = projectRewards.map((reward) => `<option value="${escapeHtml(reward)}"></option>`).join('');
    const rosterMarkup = players.map((p, i) => {
        const safeName = escapeHtml(p.name || '');
        const safeProjectName = escapeHtml(p.projectName || '');
        const safeProjectReward = escapeHtml(p.projectReward || '');
        const safeDP = Number.isFinite(Number(p.dp)) ? Number(p.dp) : 0;
        const safeClock = Math.max(0, Math.min(4, Number(p.projectClock) || 0));
        return `
            <div class="player-row">
                <div>
                    <input type="text" value="${safeName}" data-onchange="updatePlayer(${i}, 'name', this.value)">
                    <div class="dp-counter hub-dp-counter">${safeDP} DP</div>
                    <div class="hub-player-dp-actions">
                        <button class="btn" data-onclick="modDP(${i},-1)">Spend</button>
                        <button class="btn" data-onclick="modDP(${i},1)">Add</button>
                    </div>
                </div>
                <div class="hub-player-project-col">
                    <span class="mini-label">Active Project Clock (4 Segments)</span>
                    <input type="text" class="hub-project-name-input" placeholder="Project Name (e.g., Learn Draconic)..." value="${safeProjectName}" data-onchange="updatePlayer(${i}, 'projectName', this.value)">
                    <div class="hub-project-row">
                        <input type="text" class="hub-project-reward-input" list="reward-options" placeholder="Reward Goal..." value="${safeProjectReward}" data-onchange="updatePlayer(${i}, 'projectReward', this.value)">
                        <div class="clock-container hub-clock-container-end">
                            ${renderClockPie(safeClock, 4)}
                            <span class="clock-readout">${safeClock}/4</span>
                            <button class="btn clock-btn" data-onclick="modClock(${i},1)">+</button>
                            <button class="btn clock-btn" data-onclick="modClock(${i},-1)">-</button>
                        </div>
                    </div>
                </div>
                <button class="btn hub-btn-delete-player" data-onclick="deletePlayer(${i})">&times;</button>
            </div>
        `;
    }).join('');
    document.getElementById('rosterList').innerHTML = `${rosterMarkup}<datalist id="reward-options">${rewardOptions}</datalist>`;

    applyClockPieStyles(document.getElementById('rosterList'));
    renderNarrativePressure();

}

// Initial render on load
window.addEventListener('load', () => {
    bindSystemDetailToggle();
    // Check if store loaded
    if (window.RTF_STORE) {
        render();
    } else {
        setTimeout(render, 100); // Simple retry
    }
});

bindSystemDetailToggle();
