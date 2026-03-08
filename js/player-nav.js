(function () {
    const PRIMARY_NAV_ITEMS = [
        { id: 'sheet', label: 'Character Sheet', href: 'index.html', description: 'Command-console character sheet with combat, inventory, spells, and roller history.', keywords: 'character player sheet' },
        { id: 'board', label: 'Case Board', href: 'board.html', description: 'Case board linking clues, theories, NPCs, locations, events, and requisitions.', keywords: 'case board evidence' },
        { id: 'timeline', label: 'Case Timeline', href: 'timeline.html', description: 'Case-scoped mission log for beats, fallout, deadlines, certainty, and heat.', keywords: 'timeline case mission' },
        { id: 'leads', label: 'Lead Queue', href: 'leads.html', description: 'Lead triage queue with voting, status control, and concrete next steps.', keywords: 'leads investigation queue' },
        { id: 'roster', label: 'NPC Roster', href: 'roster.html', description: 'NPC roster with guild tags, wants, leverage notes, filters, and board jumps.', keywords: 'npcs contacts' },
        { id: 'locations', label: 'Locations Database', href: 'locations.html', description: 'Location database for districts, notes, filtering, and board linking.', keywords: 'locations places districts' },
        { id: 'ledger', label: 'Campaign Ledger', href: 'ledger.html', description: 'Pinned immutable facts your table has locked in as true.', keywords: 'ledger facts evidence' },
        { id: 'requisitions', label: 'Requisition Vault', href: 'requisitions.html', description: 'Shared requisition pipeline for requests, priority, approvals, and delivery.', keywords: 'gear logistics' },
        { id: 'dashboard', label: 'Player Dashboard', href: 'player-dashboard.html', description: 'Editable party grid for HP, AC, passives, and save DC at a glance.', keywords: 'players dashboard' },
        { id: 'prep', label: 'Prep & Procedure Clocks', href: 'prep-procedure.html', description: 'Prep/procedure clocks with token spend and timeline logging actions.', keywords: 'prep procedure clocks' },
        { id: 'hq', label: 'HQ Layout Foundry', href: 'hq.html', description: 'HQ layout foundry with floor plans, downtime slots, and resource staging.', keywords: 'hq base map' },
        { id: 'campaign-timeline', label: 'Campaign Timeline', href: 'campaign-timeline.html', description: 'Campaign-level timeline for cross-case beats, blockers, and decisions.', keywords: 'campaign meta timeline' },
        { id: 'campaign-board', label: 'Campaign Board', href: 'campaign-board.html', description: 'Campaign meta-board for cross-case links, scope references, and arc mapping.', keywords: 'campaign meta board' }
    ];
    const GM_NAV_ITEMS = [
        { id: 'gm', label: 'GM Session Hub', href: 'gm.html', description: 'Session tracker for initiative, quick mobs, rollers, loot, and combat log.', keywords: 'gm combat initiative' },
        { id: 'tools', label: 'Campaign Hub (Tools)', href: 'tools.html', description: 'Campaign context hub for scope sequencing, import/export, cloud sync, and workflow actions.', keywords: 'tools scope pulse' },
        { id: 'hub', label: 'Campaign Strategic Hub', href: 'hub.html', description: 'Campaign strategic dashboard for heat, faction standing, and downtime.', keywords: 'campaign heat reputation' },
        { id: 'dm-screen', label: 'Narrative Engine (DM Screen)', href: 'dm-screen.html', description: 'Narrative engine for incident prompts, sensory texture, hazards, and fallout.', keywords: 'dm narrative screen' },
        { id: 'encounters', label: 'Encounter Recipes', href: 'encounters.html', description: 'Modular encounter recipe cards with tier/location/objective planning.', keywords: 'encounters combat planning' },
        { id: 'clocks', label: 'Generic Clocks', href: 'clocks.html', description: 'Standalone progress/danger clocks with segment control and PNG export.', keywords: 'clocks progress' },
        { id: 'clue', label: 'Clue Generator', href: 'clue.html', description: 'Signal-vs-noise clue intersection generator by guild and modality.', keywords: 'clue generator' },
        { id: 'tourney', label: 'Tournament Bracket', href: 'tourney.html', description: 'Double-elimination bracket manager with auto-advance and score updates.', keywords: 'tournament bracket' }
    ];
    const ALL_NAV_ITEMS = PRIMARY_NAV_ITEMS.concat(GM_NAV_ITEMS);

    const header = document.querySelector('.hero-header');
    if (!header || header.dataset.playerNavReady === '1') return;

    const body = document.body;
    const explicitActive = body && body.dataset ? String(body.dataset.playerNav || '').trim() : '';
    const path = String(window.location.pathname || '').split('/').pop().toLowerCase();
    const inferredActive = (ALL_NAV_ITEMS.find((item) => item.href.toLowerCase() === path) || {}).id || '';
    const activeId = explicitActive || inferredActive;
    const CONNECT_OPTIONAL_TABLE_KEYS = [
        'schema',
        'tableName',
        'boardRoomsTable',
        'normalizedCoreTable',
        'normalizedHQTable',
        'normalizedCaseStateTable',
        'normalizedCaseBoardsTable',
        'normalizedCaseEventsTable',
        'normalizedPlayersTable',
        'normalizedNPCsTable',
        'normalizedLocationsTable',
        'normalizedRequisitionsTable',
        'normalizedEncountersTable'
    ];

    function getStore() {
        if (!window.RTF_STORE || typeof window.RTF_STORE !== 'object') return null;
        return window.RTF_STORE;
    }

    function normalizeConnectPayload(raw) {
        const source = raw && typeof raw === 'object' ? raw : null;
        if (!source) return null;
        const supabaseUrl = String(source.supabaseUrl || source.projectUrl || source.url || '').trim();
        const anonKey = String(source.anonKey || source.key || '').trim();
        const campaignId = String(source.campaignId || source.campaign || '').trim().toLowerCase();
        const backendMode = String(source.backendMode || source.syncBackend || '').trim() || 'normalized';
        if (!supabaseUrl || !anonKey || !campaignId) return null;

        const payload = {
            enabled: true,
            autoConnect: source.autoConnect !== false,
            supabaseUrl,
            anonKey,
            campaignId,
            backendMode
        };

        CONNECT_OPTIONAL_TABLE_KEYS.forEach((key) => {
            const value = String(source[key] || '').trim();
            if (value) payload[key] = value;
        });
        return payload;
    }

    function getPlayerNavConnectProfileField() {
        const input = document.getElementById('player-nav-connect-profile');
        return input instanceof HTMLInputElement ? input : null;
    }

    function resolveConnectProfileName(existing = '') {
        const field = getPlayerNavConnectProfileField();
        const fieldValue = field ? String(field.value || '').trim() : '';
        return fieldValue || String(existing || '').trim();
    }

    async function applyConnectProfile(raw, options = {}) {
        const store = getStore();
        if (!store || typeof store.setSyncConfig !== 'function' || typeof store.connectSync !== 'function') {
            return { ok: false, error: 'Sync store is not available on this page.' };
        }
        const payload = normalizeConnectPayload(raw);
        if (!payload) return { ok: false, error: 'Invalid connect.json format.' };

        const opts = options && typeof options === 'object' ? options : {};
        const currentConfig = (typeof store.getSyncConfig === 'function') ? store.getSyncConfig() : {};
        const requestedName = String(
            opts.profileName
            || payload.profileName
            || currentConfig.profileName
            || ''
        ).trim();
        payload.profileName = resolveConnectProfileName(requestedName);
        const profileField = getPlayerNavConnectProfileField();
        if (profileField) profileField.value = payload.profileName;

        store.setSyncConfig(payload, { reconnect: false });
        const result = await store.connectSync();
        if (!result || result.ok === false) {
            const status = (typeof store.getSyncStatus === 'function') ? store.getSyncStatus() : null;
            return { ok: false, error: (status && status.lastError) || 'Connect failed.' };
        }
        return { ok: true };
    }

    async function importConnectFileFromSettings() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/json,.json';
        input.onchange = async (event) => {
            const target = event && event.target ? event.target : null;
            const file = target && target.files && target.files[0] ? target.files[0] : null;
            if (!file) return;
            try {
                const text = await file.text();
                const parsed = JSON.parse(text);
                const result = await applyConnectProfile(parsed);
                if (!result.ok) {
                    alert(result.error || 'Failed to import connect.json.');
                    return;
                }
                alert('connect.json imported and sync connected.');
            } catch (err) {
                alert('Invalid connect.json file.');
            }
        };
        input.click();
    }

    async function useBundledConnectFromSettings() {
        try {
            const response = await fetch('connect.json', { cache: 'no-store' });
            if (!response.ok) {
                alert('No valid bundled connect.json found at site root.');
                return;
            }
            const parsed = await response.json();
            const result = await applyConnectProfile(parsed);
            if (!result.ok) {
                alert(result.error || 'Failed using bundled connect.json.');
                return;
            }
            alert('Bundled connect.json applied and connected.');
        } catch (err) {
            alert('No valid bundled connect.json found at site root.');
        }
    }

    function exportConnectFileFromSettings() {
        const store = getStore();
        if (!store || typeof store.getSyncConfig !== 'function') {
            alert('Sync store is not available on this page.');
            return;
        }
        const config = store.getSyncConfig();
        const payload = {
            supabaseUrl: String(config && config.supabaseUrl || '').trim(),
            anonKey: String(config && config.anonKey || '').trim(),
            campaignId: String(config && config.campaignId || '').trim(),
            profileName: '',
            backendMode: String(config && config.backendMode || 'legacy').trim() || 'legacy',
            autoConnect: config ? (config.autoConnect !== false) : true
        };
        CONNECT_OPTIONAL_TABLE_KEYS.forEach((key) => {
            const value = String(config && config[key] || '').trim();
            if (value) payload[key] = value;
        });
        if (!payload.supabaseUrl || !payload.anonKey || !payload.campaignId) {
            alert('Missing URL, anon key, or campaign ID.');
            return;
        }
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'connect.json';
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    }

    function settingsPanelHasConnectActions(panel) {
        if (!panel) return false;
        return !!panel.querySelector('[data-onclick*="importConnectFile"], [data-onclick*="useBundledConnect"], [data-onclick*="exportConnectFile"], [data-player-nav-connect-action="1"]');
    }

    function buildGlobalConnectActionBar() {
        const bar = document.createElement('div');
        bar.className = 'hero-action-bar secondary';
        bar.dataset.playerNavConnectBar = '1';

        const profileField = document.createElement('label');
        profileField.className = 'hero-menu-connect-field';

        const profileLabel = document.createElement('span');
        profileLabel.className = 'hero-menu-connect-label';
        profileLabel.textContent = 'Shared name (optional)';

        const profileInput = document.createElement('input');
        profileInput.type = 'text';
        profileInput.id = 'player-nav-connect-profile';
        profileInput.className = 'hero-menu-search-input hero-menu-connect-input';
        profileInput.placeholder = 'Name shown on live boards';
        profileInput.autocomplete = 'off';

        const store = getStore();
        const config = store && typeof store.getSyncConfig === 'function' ? store.getSyncConfig() : null;
        profileInput.value = String(config && config.profileName || '').trim();
        profileInput.addEventListener('change', () => {
            const currentStore = getStore();
            if (!currentStore || typeof currentStore.setSyncConfig !== 'function') return;
            currentStore.setSyncConfig({ profileName: String(profileInput.value || '').trim() }, { reconnect: false });
        });

        profileField.append(profileLabel, profileInput);
        bar.appendChild(profileField);

        const mkBtn = (label, handler) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'hero-btn ghost';
            btn.dataset.playerNavConnectAction = '1';
            btn.textContent = label;
            btn.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                Promise.resolve(handler()).catch((err) => {
                    console.error('Connect action failed', err);
                    alert('Connect action failed.');
                });
            });
            return btn;
        };

        bar.append(
            mkBtn('🔑 Import connect.json', importConnectFileFromSettings),
            mkBtn('🧷 Use bundled connect.json', useBundledConnectFromSettings),
            mkBtn('📄 Export connect.json', exportConnectFileFromSettings)
        );
        return bar;
    }

    function hasConfiguredSync(config) {
        const source = config && typeof config === 'object' ? config : null;
        if (!source) return false;
        return !!(
            String(source.supabaseUrl || '').trim()
            && String(source.anonKey || '').trim()
            && String(source.campaignId || '').trim()
        );
    }

    function formatRelativeSyncTime(ts) {
        const stamp = Number(ts);
        if (!Number.isFinite(stamp) || stamp <= 0) return '';
        const diff = Math.max(0, Date.now() - stamp);
        if (diff < 15000) return 'just now';

        const minute = 60 * 1000;
        const hour = 60 * minute;
        const day = 24 * hour;
        if (diff < hour) {
            const mins = Math.max(1, Math.round(diff / minute));
            return `${mins} min ago`;
        }
        if (diff < day) {
            const hours = Math.max(1, Math.round(diff / hour));
            return `${hours} hr ago`;
        }
        const days = Math.max(1, Math.round(diff / day));
        return `${days} day${days === 1 ? '' : 's'} ago`;
    }

    function describeSyncExperience(status, conflict) {
        const store = getStore();
        const config = store && typeof store.getSyncConfig === 'function'
            ? store.getSyncConfig()
            : null;
        const configured = hasConfiguredSync(config);
        const profileName = config && config.profileName ? String(config.profileName).trim() : '';
        const campaignId = config && config.campaignId ? String(config.campaignId).trim() : '';
        const latestSharedAt = status
            ? Math.max(Number(status.lastPullAt) || 0, Number(status.lastPushAt) || 0)
            : 0;
        const latestSharedAge = formatRelativeSyncTime(latestSharedAt);
        const sharedMeta = [
            campaignId ? `Campaign: ${campaignId}.` : '',
            profileName ? `Name: ${profileName}.` : '',
            latestSharedAge ? `Last shared update: ${latestSharedAge}.` : ''
        ].filter(Boolean).join(' ');

        if (!store) {
            return {
                state: 'local-page',
                buttonLabel: 'Local only',
                title: 'This page stays local',
                detail: 'Cloud sync does not affect this page.',
                meta: 'Character sheets and standalone tools stay on this browser.',
                primaryAction: '',
                primaryLabel: '',
                secondaryAction: '',
                secondaryLabel: ''
            };
        }

        if (!status) {
            return {
                state: 'checking',
                buttonLabel: 'Checking',
                title: 'Checking shared sync',
                detail: 'This page is still loading sync status.',
                meta: campaignId ? `Campaign: ${campaignId}.` : '',
                primaryAction: '',
                primaryLabel: '',
                secondaryAction: '',
                secondaryLabel: ''
            };
        }

        if (status.pendingConflict || conflict) {
            const changedBy = conflict && (conflict.remoteUpdatedByName || conflict.remoteUpdatedBy)
                ? String(conflict.remoteUpdatedByName || conflict.remoteUpdatedBy).trim()
                : '';
            return {
                state: 'attention',
                buttonLabel: 'Review sync',
                title: 'Latest shared version is waiting',
                detail: 'A shared board or campaign document changed in two places. Choose which version to keep so this page can finish catching up.',
                meta: [
                    'Routine row edits already auto-resolve.',
                    changedBy ? `Latest shared change came from ${changedBy}.` : '',
                    sharedMeta
                ].filter(Boolean).join(' '),
                primaryAction: 'accept-remote',
                primaryLabel: 'Use latest shared version',
                secondaryAction: 'keep-local',
                secondaryLabel: 'Keep my shared changes'
            };
        }

        if (status.mode === 'connecting') {
            return {
                state: 'connecting',
                buttonLabel: 'Connecting',
                title: 'Connecting to shared campaign',
                detail: 'Shared updates will appear here once the connection is ready.',
                meta: sharedMeta,
                primaryAction: '',
                primaryLabel: '',
                secondaryAction: '',
                secondaryLabel: ''
            };
        }

        if (!status.enabled) {
            if (configured) {
                return {
                    state: 'offline',
                    buttonLabel: 'Turn on sync',
                    title: 'Shared sync is turned off',
                    detail: 'This page is using local data until cloud sync is turned back on.',
                    meta: sharedMeta,
                    primaryAction: 'enable-sync',
                    primaryLabel: 'Turn on sync',
                    secondaryAction: '',
                    secondaryLabel: ''
                };
            }
            return {
                state: 'not-configured',
                buttonLabel: 'Not connected',
                title: 'Shared sync is not connected',
                detail: 'This page is using local data on this device. You may be missing newer shared updates until you connect.',
                meta: 'Open connect actions here when you want this page to join the shared campaign.',
                primaryAction: 'settings',
                primaryLabel: 'Open connect actions',
                secondaryAction: '',
                secondaryLabel: ''
            };
        }

        if (!status.connected) {
            const hasLocalEdits = !!(status.pendingPush || Number(status.dirtyScopes) > 0);
            return {
                state: 'offline',
                buttonLabel: hasLocalEdits ? 'Reconnect' : 'Not connected',
                title: hasLocalEdits ? 'Your latest edits are still local' : 'Not connected to shared campaign',
                detail: hasLocalEdits
                    ? 'Reconnect to share these edits and catch up to the latest campaign state.'
                    : 'You may not have the latest shared version on this page until it reconnects.',
                meta: [
                    status.lastError ? `Last problem: ${status.lastError}.` : '',
                    sharedMeta
                ].filter(Boolean).join(' '),
                primaryAction: configured ? 'connect' : 'settings',
                primaryLabel: configured ? 'Reconnect now' : 'Open connect actions',
                secondaryAction: '',
                secondaryLabel: ''
            };
        }

        if (status.mode === 'locked' && Number(status.activeRemoteLocks) > 0) {
            return {
                state: 'shared-busy',
                buttonLabel: 'Shared busy',
                title: 'Another player is editing a shared document',
                detail: 'Routine row edits still auto-resolve. Shared boards and campaign documents may take a moment to update here.',
                meta: sharedMeta,
                primaryAction: 'refresh',
                primaryLabel: 'Refresh now',
                secondaryAction: '',
                secondaryLabel: ''
            };
        }

        if (status.pendingPush || Number(status.dirtyScopes) > 0) {
            return {
                state: 'saving',
                buttonLabel: 'Saving',
                title: 'Saving your changes',
                detail: 'Your edits are on their way to the shared campaign.',
                meta: sharedMeta,
                primaryAction: 'sync-now',
                primaryLabel: 'Sync now',
                secondaryAction: '',
                secondaryLabel: ''
            };
        }

        if (Number(status.remoteRevision) > Number(status.localRevision)) {
            return {
                state: 'updating',
                buttonLabel: 'Updating',
                title: 'Pulling the latest shared changes',
                detail: 'Another player updated the campaign. This page is catching up now.',
                meta: sharedMeta,
                primaryAction: 'refresh',
                primaryLabel: 'Refresh now',
                secondaryAction: '',
                secondaryLabel: ''
            };
        }

        return {
            state: 'ready',
            buttonLabel: 'Up to date',
            title: 'Up to date',
            detail: 'This page has the latest shared campaign data.',
            meta: sharedMeta,
            primaryAction: 'refresh',
            primaryLabel: 'Refresh now',
            secondaryAction: '',
            secondaryLabel: ''
        };
    }

    function isAddActionLabel(labelText) {
        const clean = String(labelText || '').trim().toLowerCase();
        return /^\+\s*(add|new|log)\b/.test(clean);
    }

    function hrefPointsToTools(linkEl) {
        if (!(linkEl instanceof HTMLAnchorElement)) return false;
        const rawHref = String(linkEl.getAttribute('href') || '').trim();
        if (!rawHref) return false;

        try {
            const resolved = new URL(rawHref, window.location.href);
            return String(resolved.pathname || '').toLowerCase().endsWith('/tools.html');
        } catch (err) {
            return rawHref.toLowerCase().replace(/^\.?\//, '').startsWith('tools.html');
        }
    }

    function stripPortalActionsFromBars(bars) {
        bars.forEach((bar) => {
            const links = Array.from(bar.querySelectorAll('a.hero-btn'));
            links.forEach((link) => {
                if (!hrefPointsToTools(link)) return;
                link.remove();
            });
            const hasControls = !!bar.querySelector('a, button, input, select, textarea');
            if (!hasControls) bar.remove();
        });
    }

    function isNavItemActive(item) {
        return item.id === activeId || item.href.toLowerCase() === path;
    }

    function getNavItemsForMode(mode) {
        return mode === 'gm' ? GM_NAV_ITEMS : PRIMARY_NAV_ITEMS;
    }

    function buildNavLink(item) {
        const link = document.createElement('a');
        link.href = item.href;

        const isActive = isNavItemActive(item);
        link.className = `hero-btn ghost hero-menu-nav-link${isActive ? ' is-active' : ''}`;
        if (isActive) link.setAttribute('aria-current', 'page');
        if (item.description) link.title = `${item.label}: ${item.description}`;
        link.dataset.search = [item.label, item.description, item.keywords].filter(Boolean).join(' ').toLowerCase();

        const label = document.createElement('span');
        label.className = 'hero-menu-nav-label';
        label.textContent = item.label;
        link.appendChild(label);

        if (item.description) {
            const desc = document.createElement('span');
            desc.className = 'hero-menu-nav-desc';
            desc.textContent = item.description;
            link.appendChild(desc);
        }

        return link;
    }

    function updateNavFilterState(panel, query) {
        const normalizedQuery = String(query || '').trim().toLowerCase();
        const links = Array.from(panel.querySelectorAll('.hero-menu-nav-link'));
        let visibleLinkCount = 0;

        links.forEach((link) => {
            const haystack = String(link.dataset.search || '').toLowerCase();
            const visible = !normalizedQuery || haystack.includes(normalizedQuery);
            link.classList.toggle('is-hidden', !visible);
            if (visible) visibleLinkCount += 1;
        });

        const empty = panel.querySelector('.hero-menu-nav-empty');
        if (empty) empty.classList.toggle('is-visible', normalizedQuery.length > 0 && visibleLinkCount === 0);
    }

    function clearNavFilter(panel) {
        const input = panel.querySelector('.hero-menu-search-input');
        if (!input) return;
        input.value = '';
        updateNavFilterState(panel, '');
    }

    function renderNavList(panel, mode) {
        const list = panel.querySelector('.hero-menu-nav-list');
        if (!list) return;

        panel.dataset.navMode = mode;
        list.textContent = '';
        getNavItemsForMode(mode).forEach((item) => {
            list.appendChild(buildNavLink(item));
        });

        const title = panel.querySelector('.hero-menu-panel-title');
        if (title) title.textContent = mode === 'gm' ? '🧭 GM Navigation' : '🧭 Navigation';

        const hint = panel.querySelector('.hero-menu-nav-hint');
        if (hint) hint.textContent = mode === 'gm'
            ? 'Left-click the compass for the main navigation list.'
            : 'Right-click the compass for GM pages.';

        const input = panel.querySelector('.hero-menu-search-input');
        updateNavFilterState(panel, input ? input.value : '');
    }

    function buildNavPanel(defaultMode) {
        const panel = document.createElement('div');
        panel.className = 'hero-menu-panel hero-menu-nav-panel';
        panel.setAttribute('aria-hidden', 'true');

        const panelTitle = document.createElement('div');
        panelTitle.className = 'hero-menu-panel-title';
        panel.appendChild(panelTitle);

        const searchWrap = document.createElement('label');
        searchWrap.className = 'hero-menu-search';
        const searchInput = document.createElement('input');
        searchInput.type = 'search';
        searchInput.className = 'hero-menu-search-input';
        searchInput.placeholder = 'Filter pages...';
        searchInput.setAttribute('aria-label', 'Filter navigation pages');
        searchInput.autocomplete = 'off';
        searchWrap.appendChild(searchInput);
        panel.appendChild(searchWrap);

        const hint = document.createElement('div');
        hint.className = 'hero-menu-nav-hint';
        panel.appendChild(hint);

        const list = document.createElement('nav');
        list.className = 'hero-menu-nav-list';
        list.setAttribute('aria-label', 'Navigation menu');
        panel.appendChild(list);

        const emptyState = document.createElement('div');
        emptyState.className = 'hero-menu-nav-empty';
        emptyState.textContent = 'No pages match this filter.';
        panel.appendChild(emptyState);

        searchInput.addEventListener('input', () => {
            updateNavFilterState(panel, searchInput.value);
        });

        renderNavList(panel, defaultMode);
        clearNavFilter(panel);
        return panel;
    }

    function moveAddButtonsBelowHero(bars) {
        const addButtons = [];
        bars.forEach((bar) => {
            const candidates = bar.querySelectorAll('a.hero-btn, button.hero-btn');
            candidates.forEach((btn) => {
                if (!isAddActionLabel(btn.textContent)) return;
                addButtons.push(btn);
            });
        });
        if (!addButtons.length) return;

        const row = document.createElement('div');
        row.className = 'hero-add-row';
        const inner = document.createElement('div');
        inner.className = 'hero-add-actions';
        addButtons.forEach((btn) => {
            btn.classList.add('hero-add-btn');
            inner.appendChild(btn);
        });
        row.appendChild(inner);
        header.insertAdjacentElement('afterend', row);
    }

    function setupHeroMenu() {
        const actions = header.querySelector('.hero-actions');
        if (!actions || actions.dataset.heroMenuReady === '1') return;

        let bars = Array.from(actions.querySelectorAll(':scope > .hero-action-bar'));
        if (!bars.length) {
            const fallbackItems = Array.from(actions.children).filter((child) => {
                if (!(child instanceof HTMLElement)) return false;
                if (child.classList.contains('sheet-nav-group')) return false;
                if (child.classList.contains('quick-actions-header')) return false;
                if (child.id === 'quickActionsHeader') return false;
                if (child.classList.contains('hero-menu-controls')) return false;
                if (child.classList.contains('hero-menu-panel')) return false;
                return true;
            });
            if (fallbackItems.length) {
                const fallbackBar = document.createElement('div');
                fallbackBar.className = 'hero-action-bar primary';
                fallbackItems.forEach((item) => fallbackBar.appendChild(item));
                actions.appendChild(fallbackBar);
                bars = [fallbackBar];
            }
        }
        if (!bars.length) return;

        stripPortalActionsFromBars(bars);
        bars = bars.filter((bar) => bar && bar.isConnected);
        moveAddButtonsBelowHero(bars);

        const controls = document.createElement('div');
        controls.className = 'hero-menu-controls';

        const compassBtn = document.createElement('button');
        compassBtn.type = 'button';
        compassBtn.className = 'hero-menu-btn hero-menu-compass';
        compassBtn.setAttribute('aria-label', 'Open navigation menu');
        compassBtn.title = 'Navigation';
        compassBtn.setAttribute('aria-expanded', 'false');
        compassBtn.textContent = '🧭';

        const gearBtn = document.createElement('button');
        gearBtn.type = 'button';
        gearBtn.className = 'hero-menu-btn hero-menu-gear';
        gearBtn.setAttribute('aria-label', 'Open settings and action menu');
        gearBtn.setAttribute('aria-expanded', 'false');
        gearBtn.textContent = '⚙';

        const syncBtn = document.createElement('button');
        syncBtn.type = 'button';
        syncBtn.className = 'hero-menu-btn hero-menu-sync';
        syncBtn.setAttribute('aria-label', 'Open shared sync status');
        syncBtn.setAttribute('aria-expanded', 'false');
        syncBtn.title = 'Shared sync status';

        const syncBtnDot = document.createElement('span');
        syncBtnDot.className = 'hero-menu-sync-dot';
        syncBtnDot.setAttribute('aria-hidden', 'true');

        const syncBtnLabel = document.createElement('span');
        syncBtnLabel.className = 'hero-menu-sync-label';
        syncBtnLabel.textContent = 'Checking';

        syncBtn.append(syncBtnDot, syncBtnLabel);
        controls.append(compassBtn, syncBtn, gearBtn);

        const defaultNavMode = GM_NAV_ITEMS.some((item) => isNavItemActive(item)) ? 'gm' : 'primary';
        const navPanel = buildNavPanel(defaultNavMode);
        const navSearchInput = navPanel.querySelector('.hero-menu-search-input');

        const settingsPanel = document.createElement('div');
        settingsPanel.className = 'hero-menu-panel hero-menu-settings-panel';
        settingsPanel.setAttribute('aria-hidden', 'true');

        const panelHeader = document.createElement('div');
        panelHeader.className = 'hero-menu-panel-title';
        panelHeader.textContent = '⚙ Settings & Actions';
        settingsPanel.appendChild(panelHeader);

        const characterSwitcher = document.querySelector('#card-settings .settings-character-switcher');
        if (characterSwitcher) {
            settingsPanel.appendChild(characterSwitcher);
        }

        bars.forEach((bar) => {
            if (bar.querySelector('.quick-actions-header, #quickActionsHeader')) return;
            const hasControls = !!bar.querySelector('a, button, input, select, textarea');
            if (!hasControls) return;
            settingsPanel.appendChild(bar);
        });
        if (!settingsPanelHasConnectActions(settingsPanel)) {
            settingsPanel.appendChild(buildGlobalConnectActionBar());
        }

        const syncPanel = document.createElement('div');
        syncPanel.className = 'hero-menu-panel hero-menu-sync-panel';
        syncPanel.setAttribute('aria-hidden', 'true');

        const syncEyebrow = document.createElement('div');
        syncEyebrow.className = 'hero-menu-panel-title hero-menu-sync-eyebrow';
        syncEyebrow.textContent = '☁ Shared Sync';

        const syncHeadline = document.createElement('div');
        syncHeadline.className = 'hero-menu-sync-headline';

        const syncHeadlineDot = document.createElement('span');
        syncHeadlineDot.className = 'hero-menu-sync-dot';
        syncHeadlineDot.setAttribute('aria-hidden', 'true');

        const syncHeadlineTitle = document.createElement('div');
        syncHeadlineTitle.className = 'hero-menu-sync-title';
        syncHeadlineTitle.textContent = 'Checking shared sync';

        syncHeadline.append(syncHeadlineDot, syncHeadlineTitle);

        const syncDetail = document.createElement('div');
        syncDetail.className = 'hero-menu-sync-detail';
        syncDetail.textContent = 'This page is still loading sync status.';

        const syncMeta = document.createElement('div');
        syncMeta.className = 'hero-menu-sync-meta';

        const syncNotice = document.createElement('div');
        syncNotice.className = 'hero-menu-sync-notice';
        syncNotice.hidden = true;

        const syncActions = document.createElement('div');
        syncActions.className = 'hero-menu-sync-actions';
        syncActions.hidden = true;

        const syncPrimaryBtn = document.createElement('button');
        syncPrimaryBtn.type = 'button';
        syncPrimaryBtn.className = 'hero-btn primary';

        const syncSecondaryBtn = document.createElement('button');
        syncSecondaryBtn.type = 'button';
        syncSecondaryBtn.className = 'hero-btn ghost';

        syncActions.append(syncPrimaryBtn, syncSecondaryBtn);
        syncPanel.append(syncEyebrow, syncHeadline, syncDetail, syncMeta, syncNotice, syncActions);

        let latestSyncStatus = null;
        let latestSyncConflict = null;
        let syncActionInFlight = false;
        let syncActionNotice = '';
        let syncActionNoticeIsError = false;

        const refreshSyncSnapshots = () => {
            const store = getStore();
            latestSyncStatus = store && typeof store.getSyncStatus === 'function'
                ? store.getSyncStatus()
                : null;
            latestSyncConflict = store && typeof store.getPendingConflict === 'function'
                ? store.getPendingConflict()
                : null;
        };

        const setSyncNotice = (message, isError = false) => {
            syncActionNotice = String(message || '').trim();
            syncActionNoticeIsError = !!(syncActionNotice && isError);
        };

        const setSyncActionButton = (button, action, label) => {
            const hasAction = !!action && !!label;
            button.hidden = !hasAction;
            button.disabled = syncActionInFlight || !hasAction;
            button.dataset.syncAction = hasAction ? action : '';
            if (hasAction) button.textContent = label;
        };

        const setOpenState = (targetPanel, navMode) => {
            const showNav = targetPanel === 'nav';
            const showSettings = targetPanel === 'settings';
            const showSync = targetPanel === 'sync';
            navPanel.classList.toggle('is-open', showNav);
            navPanel.setAttribute('aria-hidden', showNav ? 'false' : 'true');
            settingsPanel.classList.toggle('is-open', showSettings);
            settingsPanel.setAttribute('aria-hidden', showSettings ? 'false' : 'true');
            syncPanel.classList.toggle('is-open', showSync);
            syncPanel.setAttribute('aria-hidden', showSync ? 'false' : 'true');
            compassBtn.setAttribute('aria-expanded', showNav ? 'true' : 'false');
            gearBtn.setAttribute('aria-expanded', showSettings ? 'true' : 'false');
            syncBtn.setAttribute('aria-expanded', showSync ? 'true' : 'false');

            if (showNav) {
                renderNavList(navPanel, navMode === 'gm' ? 'gm' : 'primary');
                if (navSearchInput) {
                    requestAnimationFrame(() => {
                        try {
                            navSearchInput.focus({ preventScroll: true });
                        } catch (err) {
                            navSearchInput.focus();
                        }
                    });
                }
                return;
            }

            clearNavFilter(navPanel);
        };

        const renderSyncExperience = () => {
            const experience = describeSyncExperience(latestSyncStatus, latestSyncConflict);
            const panelMessage = syncActionInFlight ? 'Working...' : syncActionNotice;

            syncBtn.dataset.syncState = experience.state;
            syncPanel.dataset.syncState = experience.state;
            syncBtn.title = experience.title;
            syncBtn.setAttribute('aria-label', `${experience.title}. Open shared sync status`);
            syncBtnLabel.textContent = experience.buttonLabel;
            syncHeadlineTitle.textContent = experience.title;
            syncDetail.textContent = experience.detail;
            syncMeta.textContent = experience.meta || '';
            syncMeta.hidden = !experience.meta;

            syncNotice.hidden = !panelMessage;
            syncNotice.textContent = panelMessage;
            syncNotice.classList.toggle('is-error', !syncActionInFlight && !!panelMessage && syncActionNoticeIsError);

            setSyncActionButton(syncPrimaryBtn, experience.primaryAction, experience.primaryLabel);
            setSyncActionButton(syncSecondaryBtn, experience.secondaryAction, experience.secondaryLabel);
            syncActions.hidden = syncPrimaryBtn.hidden && syncSecondaryBtn.hidden;
        };

        async function runSyncAction(action) {
            if (!action) return;
            if (action === 'settings') {
                setOpenState('settings');
                return;
            }

            const store = getStore();
            if (!store || syncActionInFlight) return;

            syncActionInFlight = true;
            setSyncNotice('', false);
            renderSyncExperience();

            try {
                if (action === 'enable-sync') {
                    if (typeof store.setSyncConfig !== 'function') {
                        throw new Error('Shared sync controls are unavailable on this page.');
                    }
                    store.setSyncConfig({ enabled: true }, { reconnect: true });
                    setSyncNotice('Turning shared sync back on.');
                } else if (action === 'connect') {
                    if (typeof store.connectSync !== 'function') {
                        throw new Error('Reconnect is unavailable on this page.');
                    }
                    const result = await store.connectSync();
                    if (!result || result.ok === false) {
                        throw new Error((store.getSyncStatus && store.getSyncStatus().lastError) || 'Reconnect failed.');
                    }
                    setSyncNotice('Connected to the shared campaign.');
                } else if (action === 'refresh') {
                    if (typeof store.pullFromCloud !== 'function') {
                        throw new Error('Refresh is unavailable on this page.');
                    }
                    const result = await store.pullFromCloud({ force: false, silent: false });
                    if (result && result.ok === false) {
                        if (result.reason === 'conflict') {
                            setSyncNotice('The latest shared version needs review.', false);
                        } else {
                            throw new Error(result.error || 'Could not refresh shared data.');
                        }
                    } else {
                        setSyncNotice(
                            result && result.reason === 'up-to-date'
                                ? 'Already on the latest shared version.'
                                : 'Checked for new shared updates.'
                        );
                    }
                } else if (action === 'sync-now') {
                    const currentStatus = typeof store.getSyncStatus === 'function'
                        ? store.getSyncStatus()
                        : latestSyncStatus;
                    if (!currentStatus || !currentStatus.connected) {
                        if (typeof store.connectSync !== 'function') {
                            throw new Error('Reconnect is unavailable on this page.');
                        }
                        const result = await store.connectSync();
                        if (!result || result.ok === false) {
                            throw new Error((store.getSyncStatus && store.getSyncStatus().lastError) || 'Reconnect failed.');
                        }
                        setSyncNotice('Connected to the shared campaign.');
                    } else if (currentStatus.pendingPush || Number(currentStatus.dirtyScopes) > 0) {
                        if (typeof store.pushToCloud !== 'function') {
                            throw new Error('Sync is unavailable on this page.');
                        }
                        const result = await store.pushToCloud({ silent: false });
                        if (result && result.ok === false) {
                            if (result.reason === 'conflict') {
                                setSyncNotice('The latest shared version needs review.', false);
                            } else if (result.reason === 'locked') {
                                setSyncNotice('Another player is editing a shared document right now.', false);
                            } else {
                                throw new Error(result.error || 'Could not share your latest edits.');
                            }
                        } else {
                            setSyncNotice('Shared changes sent.');
                        }
                    } else if (typeof store.pullFromCloud === 'function') {
                        const result = await store.pullFromCloud({ force: false, silent: false });
                        if (result && result.ok === false) {
                            if (result.reason === 'conflict') {
                                setSyncNotice('The latest shared version needs review.', false);
                            } else {
                                throw new Error(result.error || 'Could not refresh shared data.');
                            }
                        } else {
                            setSyncNotice(
                                result && result.reason === 'up-to-date'
                                    ? 'Already on the latest shared version.'
                                    : 'Checked for new shared updates.'
                            );
                        }
                    }
                } else if (action === 'accept-remote') {
                    if (typeof store.resolvePendingConflict !== 'function') {
                        throw new Error('Conflict review is unavailable on this page.');
                    }
                    const result = await store.resolvePendingConflict('accept-remote');
                    if (!result || result.ok === false) {
                        throw new Error('Could not apply the latest shared version.');
                    }
                    setSyncNotice('Latest shared version applied.');
                } else if (action === 'keep-local') {
                    if (typeof store.resolvePendingConflict !== 'function') {
                        throw new Error('Conflict review is unavailable on this page.');
                    }
                    const result = await store.resolvePendingConflict('keep-local');
                    if (!result || result.ok === false) {
                        if (result && result.reason === 'conflict') {
                            setSyncNotice('Shared review is still needed.', false);
                        } else if (result && result.reason === 'locked') {
                            setSyncNotice('Another player is editing that shared document right now.', false);
                        } else {
                            throw new Error((result && result.error) || 'Could not keep your shared changes.');
                        }
                    } else {
                        setSyncNotice('Your shared changes were kept and synced.');
                    }
                }
            } catch (err) {
                setSyncNotice(err && err.message ? err.message : 'Sync action failed.', true);
            } finally {
                syncActionInFlight = false;
                refreshSyncSnapshots();
                renderSyncExperience();
            }
        }

        const toggleNavPanel = (mode) => {
            const navOpen = navPanel.classList.contains('is-open');
            const currentMode = String(navPanel.dataset.navMode || 'primary');
            const targetMode = mode === 'gm' ? 'gm' : 'primary';
            if (navOpen && currentMode === targetMode) {
                setOpenState('');
                return;
            }
            setOpenState('nav', targetMode);
        };

        compassBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            toggleNavPanel('primary');
        });

        compassBtn.addEventListener('contextmenu', (event) => {
            event.preventDefault();
            event.stopPropagation();
            toggleNavPanel('gm');
        });

        syncBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            const syncOpen = syncPanel.classList.contains('is-open');
            if (syncOpen) {
                setOpenState('');
                return;
            }
            setOpenState('sync');
        });

        gearBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            const navOpen = navPanel.classList.contains('is-open');
            const settingsOpen = settingsPanel.classList.contains('is-open');
            const syncOpen = syncPanel.classList.contains('is-open');
            if (settingsOpen) {
                setOpenState('');
                return;
            }
            if (navOpen || syncOpen) {
                setOpenState('settings');
                return;
            }
            setOpenState('settings');
        });

        [syncPrimaryBtn, syncSecondaryBtn].forEach((button) => {
            button.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                runSyncAction(button.dataset.syncAction || '').catch((err) => {
                    setSyncNotice(err && err.message ? err.message : 'Sync action failed.', true);
                    syncActionInFlight = false;
                    refreshSyncSnapshots();
                    renderSyncExperience();
                });
            });
        });

        document.addEventListener('click', (event) => {
            const anyOpen = navPanel.classList.contains('is-open')
                || settingsPanel.classList.contains('is-open')
                || syncPanel.classList.contains('is-open');
            if (!anyOpen) return;
            if (actions.contains(event.target)) return;
            setOpenState('');
        });

        document.addEventListener('keydown', (event) => {
            if (event.key !== 'Escape') return;
            const anyOpen = navPanel.classList.contains('is-open')
                || settingsPanel.classList.contains('is-open')
                || syncPanel.classList.contains('is-open');
            if (!anyOpen) return;
            setOpenState('');
        });

        refreshSyncSnapshots();
        renderSyncExperience();

        const store = getStore();
        if (store && typeof store.onSyncStatus === 'function') {
            store.onSyncStatus((status) => {
                if (!syncActionInFlight) setSyncNotice('', false);
                latestSyncStatus = status || null;
                latestSyncConflict = typeof store.getPendingConflict === 'function'
                    ? store.getPendingConflict()
                    : null;
                renderSyncExperience();
            });
        }
        window.addEventListener('rtf-sync-conflict', () => {
            if (!syncActionInFlight) setSyncNotice('', false);
            refreshSyncSnapshots();
            renderSyncExperience();
        });

        actions.classList.add('has-hero-menu');
        actions.append(controls, navPanel, syncPanel, settingsPanel);
        actions.dataset.heroMenuReady = '1';
    }

    header.classList.add('has-player-nav');
    setupHeroMenu();
    header.dataset.playerNavReady = '1';
})();
