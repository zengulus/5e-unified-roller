const escapeHtml = (str = '') => String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const render = () => {
    const grid = document.getElementById('playerGrid');
    const empty = document.getElementById('emptyState');
    grid.innerHTML = '';

    const players = window.RTF_STORE ? window.RTF_STORE.getPlayers() : [];

    if (!players || players.length === 0) {
        empty.style.display = 'block';
        return;
    }
    empty.style.display = 'none';

    players.forEach((p, i) => {
        const name = escapeHtml(p.name || '');
        const ac = Number.isFinite(Number(p.ac)) ? Number(p.ac) : 0;
        const pp = Number.isFinite(Number(p.pp)) ? Number(p.pp) : 0;
        const dc = Number.isFinite(Number(p.dc)) ? Number(p.dc) : 0;
        const hpValue = escapeHtml(p.hp || 0);
        const hpNum = parseInt(p.hp, 10);
        const hpLow = !isNaN(hpNum) && hpNum < 10;
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `
        <div class="card-header">
            <input type="text" class="input-name" value="${name}"
                onchange="updatePlayer(${i}, 'name', this.value)" placeholder="AGENT NAME">
                <button class="btn btn-del" onclick="deletePlayer(${i})">&times;</button>
        </div>

        <div class="stat-grid">
            <div class="stat-box">
                <span class="stat-label">AC</span>
                <input type="number" class="stat-val" value="${ac}"
                    onchange="updatePlayer(${i}, 'ac', parseInt(this.value))">
            </div>
            <div class="stat-box">
                <span class="stat-label">Passive Perc</span>
                <input type="number" class="stat-val" value="${pp}"
                    style="color: ${pp >= 15 ? 'var(--accent)' : 'inherit'}"
                    onchange="updatePlayer(${i}, 'pp', parseInt(this.value))">
            </div>
            <div class="stat-box">
                <span class="stat-label">Save DC</span>
                <input type="number" class="stat-val" value="${dc}"
                    onchange="updatePlayer(${i}, 'dc', parseInt(this.value))">
            </div>
        </div>

        <div class="stat-box" style="margin-top: 5px; border-color: ${hpLow ? 'var(--danger)' : 'transparent'}">
            <span class="stat-label" style="color:${hpLow ? 'var(--danger)' : '#888'}">Hit Points</span>
            <input type="text" class="stat-val" value="${hpValue}"
                onchange="updatePlayer(${i}, 'hp', this.value)" placeholder="Max/Curr">
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

const updatePlayer = (idx, field, val) => {
    if (window.RTF_STORE) {
        const players = window.RTF_STORE.getPlayers();
        if (players[idx]) {
            players[idx][field] = val;
            window.RTF_STORE.save();
            // render(); // Optional: re-render if needed, but input handles display
        }
    }
};

const deletePlayer = (idx) => {
    if (confirm("Disavow this agent? (Delete Player)")) {
        if (window.RTF_STORE) {
            const players = window.RTF_STORE.getPlayers();
            players.splice(idx, 1);
            window.RTF_STORE.save();
            render();
        }
    }
};

const initDashboard = () => {
    if (window.RTF_STORE) {
        render();
    } else {
        setTimeout(render, 100);
    }

    window.addEventListener('rtf-store-updated', (event) => {
        if (!event || !event.detail || event.detail.source !== 'remote') return;
        render();
    });
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDashboard);
} else {
    initDashboard();
}
