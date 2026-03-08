const escapeHtml = (str = '') => String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
const delegatedHandlerEvents = ['click', 'change', 'input'];
const delegatedHandlerCache = new Map();
let delegatedHandlersBound = false;
const PLAYER_SCOPE_PREFIX = 'campaign.players';

const normalizePlayerScopeId = (value) => {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return '';
    return raw.replace(/[^a-z0-9_-]/g, '').slice(0, 80);
};

const buildPlayerScope = (playerId) => {
    const id = normalizePlayerScopeId(playerId);
    if (!id || id === '__order') return PLAYER_SCOPE_PREFIX;
    return `${PLAYER_SCOPE_PREFIX}.${id}`;
};
const buildPlayerMutationScopes = (playerId, includeOrder = false) => {
    const scopes = [buildPlayerScope(playerId)];
    if (includeOrder) scopes.push(`${PLAYER_SCOPE_PREFIX}.__order`);
    return scopes;
};

const getDelegatedHandlerFn = (code) => {
    if (!delegatedHandlerCache.has(code)) {
        delegatedHandlerCache.set(code, window.RTF_DELEGATED_HANDLER.compile(code));
    }
    return delegatedHandlerCache.get(code);
};

const runDelegatedHandler = (el, attrName, event) => {
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
};

const handleDelegatedDataEvent = (event) => {
    const attrName = `data-on${event.type}`;
    let node = event.target instanceof Element ? event.target : null;

    while (node) {
        if (node.hasAttribute(attrName)) {
            runDelegatedHandler(node, attrName, event);
            if (event.cancelBubble) break;
        }
        node = node.parentElement;
    }
};

const bindDelegatedDataHandlers = () => {
    if (delegatedHandlersBound) return;
    delegatedHandlersBound = true;
    delegatedHandlerEvents.forEach((eventName) => {
        document.addEventListener(eventName, handleDelegatedDataEvent);
    });
};

const PLAYER_LOW_HP_THRESHOLD = 10;
const PLAYER_PASSIVE_PERCEPTION_STRONG_THRESHOLD = 15;

const readSignedIntegers = (value) => {
    const matches = String(value ?? '').match(/-?\d+/g);
    if (!matches) return [];
    return matches
        .map((entry) => Number.parseInt(entry, 10))
        .filter((entry) => Number.isFinite(entry));
};

const getTrackedPlayerHpValue = (value) => {
    const raw = String(value ?? '').trim();
    if (!raw) return null;

    if (raw.includes('/')) {
        const currentSegment = raw.split('/').slice(1).join('/');
        const currentValues = readSignedIntegers(currentSegment);
        if (currentValues.length) {
            return currentValues.reduce((sum, entry) => sum + entry, 0);
        }
    }

    const values = readSignedIntegers(raw);
    if (!values.length) return null;
    return values.reduce((sum, entry) => sum + entry, 0);
};

const getPlayerCardState = (player) => {
    const pp = Number.isFinite(Number(player && player.pp)) ? Number(player.pp) : 0;
    const trackedHp = getTrackedPlayerHpValue(player && player.hp);
    return {
        ppStrong: pp >= PLAYER_PASSIVE_PERCEPTION_STRONG_THRESHOLD,
        hpLow: Number.isFinite(trackedHp) && trackedHp < PLAYER_LOW_HP_THRESHOLD
    };
};

const getPlayerCardAtIndex = (idx) => {
    const grid = document.getElementById('playerGrid');
    if (!grid || !Number.isInteger(idx) || idx < 0) return null;
    return grid.children[idx] instanceof HTMLElement ? grid.children[idx] : null;
};

const applyPlayerCardState = (card, player) => {
    if (!card || !player) return;
    const state = getPlayerCardState(player);
    const ppInput = card.querySelector('[data-player-field="pp"]');
    const hpBox = card.querySelector('[data-player-hp-box]');
    const hpLabel = card.querySelector('[data-player-hp-label]');

    if (ppInput) ppInput.classList.toggle('player-pp-strong', state.ppStrong);
    if (hpBox) hpBox.classList.toggle('player-hp-low', state.hpLow);
    if (hpLabel) hpLabel.classList.toggle('player-hp-label-low', state.hpLow);
};

const render = () => {
    const grid = document.getElementById('playerGrid');
    const empty = document.getElementById('emptyState');
    grid.innerHTML = '';

    const players = window.RTF_STORE ? window.RTF_STORE.getPlayers() : [];

    if (!players || players.length === 0) {
        empty.classList.remove('player-hidden');
        return;
    }
    empty.classList.add('player-hidden');

    players.forEach((p, i) => {
        const name = escapeHtml(p.name || '');
        const ac = Number.isFinite(Number(p.ac)) ? Number(p.ac) : 0;
        const init = Number.isFinite(Number(p.init)) ? Number(p.init) : 0;
        const pp = Number.isFinite(Number(p.pp)) ? Number(p.pp) : 0;
        const dc = Number.isFinite(Number(p.dc)) ? Number(p.dc) : 0;
        const hpRawValue = p && Object.prototype.hasOwnProperty.call(p, 'hp') ? p.hp : '';
        const hpValue = escapeHtml(hpRawValue === 0 ? '0' : (hpRawValue || ''));
        const state = getPlayerCardState(p);
        const ppClass = state.ppStrong ? ' player-pp-strong' : '';
        const hpBoxClass = state.hpLow ? ' player-hp-low' : '';
        const hpLabelClass = state.hpLow ? ' player-hp-label-low' : '';
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `
<div class="card-header">
    <input type="text" class="input-name" value="${name}"
        data-oninput="updatePlayer(${i}, 'name', this.value)"
        data-onchange="updatePlayer(${i}, 'name', this.value)" placeholder="AGENT NAME">
        <button class="btn btn-del" data-onclick="deletePlayer(${i})">&times;</button>
</div>

<div class="stat-grid">
    <div class="stat-box">
        <span class="stat-label">AC</span>
        <input type="number" class="stat-val" value="${ac}"
            data-oninput="updatePlayer(${i}, 'ac', this.value)"
            data-onchange="updatePlayer(${i}, 'ac', this.value)">
    </div>
    <div class="stat-box">
        <span class="stat-label">Initiative</span>
        <input type="number" class="stat-val" value="${init}"
            data-oninput="updatePlayer(${i}, 'init', this.value)"
            data-onchange="updatePlayer(${i}, 'init', this.value)">
    </div>
    <div class="stat-box">
        <span class="stat-label">Passive Perc</span>
        <input type="number" class="stat-val${ppClass}" data-player-field="pp" value="${pp}"
            data-oninput="updatePlayer(${i}, 'pp', this.value)"
            data-onchange="updatePlayer(${i}, 'pp', this.value)">
    </div>
    <div class="stat-box">
        <span class="stat-label">Save DC</span>
        <input type="number" class="stat-val" value="${dc}"
            data-oninput="updatePlayer(${i}, 'dc', this.value)"
            data-onchange="updatePlayer(${i}, 'dc', this.value)">
    </div>
</div>

<div class="stat-box player-hp-box${hpBoxClass}" data-player-hp-box="1">
    <span class="stat-label${hpLabelClass}" data-player-hp-label="1">Hit Points</span>
    <input type="text" class="stat-val" value="${hpValue}"
        data-oninput="updatePlayer(${i}, 'hp', this.value)"
        data-onchange="updatePlayer(${i}, 'hp', this.value)" placeholder="Max/Curr">
</div>
    `;
        grid.appendChild(card);
    });
};

const addPlayer = () => {
    if (window.RTF_STORE) {
        window.RTF_STORE.addPlayer({
            name: "New Agent",
            ac: 10,
            init: 0,
            hp: 10,
            pp: 10,
            dc: 10,
            dp: 2,
            projectClock: 0,
            projectName: "",
            projectReward: "+1 Reputation"
        });
        render();
    }
};

const ALLOWED_PLAYER_FIELDS = new Set(['name', 'ac', 'init', 'pp', 'dc', 'hp']);
const sanitizePlayerUpdateValue = (field, rawValue) => {
    if (field === 'name') return String(rawValue || '').slice(0, 160);
    if (field === 'hp') return String(rawValue || '').slice(0, 40);

    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) return 0;
    if (field === 'init') return Math.max(-99, Math.min(999, Math.round(parsed)));
    return Math.max(0, Math.min(999, Math.round(parsed)));
};

const updatePlayer = (idx, field, val) => {
    if (window.RTF_STORE) {
        const players = window.RTF_STORE.getPlayers();
        if (!Array.isArray(players)) return;
        if (!Number.isInteger(idx) || idx < 0 || idx >= players.length) return;
        if (!ALLOWED_PLAYER_FIELDS.has(field)) return;
        if (!players[idx] || typeof players[idx] !== 'object') return;

        players[idx][field] = sanitizePlayerUpdateValue(field, val);
        window.RTF_STORE.save({ scope: buildPlayerScope(players[idx].id) });
        applyPlayerCardState(getPlayerCardAtIndex(idx), players[idx]);
    }
};

const deletePlayer = (idx) => {
    if (confirm("Disavow this agent? (Delete Player)")) {
        if (window.RTF_STORE) {
            const players = window.RTF_STORE.getPlayers();
            if (!Array.isArray(players) || !Number.isInteger(idx) || idx < 0 || idx >= players.length) return;
            const playerId = players[idx] && players[idx].id;
            players.splice(idx, 1);
            window.RTF_STORE.save({ scope: buildPlayerMutationScopes(playerId, true) });
            render();
        }
    }
};

window.addPlayer = addPlayer;
window.updatePlayer = updatePlayer;
window.deletePlayer = deletePlayer;

// Init
bindDelegatedDataHandlers();

window.addEventListener('load', () => {
    if (window.RTF_STORE) {
        render();
    } else {
        setTimeout(render, 100);
    }
});

window.addEventListener('rtf-store-updated', (event) => {
    if (!event || !event.detail) return;
    if (event.detail.source !== 'remote' && event.detail.source !== 'storage') return;
    render();
});
