(function () {
    const NAV_GROUPS = [
        {
            id: 'workflow',
            title: 'Workflow',
            items: [
                { id: 'tools', label: 'Campaign Hub', href: 'tools.html', description: 'Campaign context hub for scope sequencing, import/export, cloud sync, and workflow actions.', keywords: 'scope pulse' },
                { id: 'hub', label: 'Strategic Hub', href: 'hub.html', description: 'Campaign strategic dashboard for heat, faction standing, and downtime.', keywords: 'heat rep' },
                { id: 'campaign-timeline', label: 'Camp Timeline', href: 'campaign-timeline.html', description: 'Campaign-level timeline for cross-case beats, blockers, and decisions.', keywords: 'meta timeline' },
                { id: 'timeline', label: 'Mission Timeline', href: 'timeline.html', description: 'Case-scoped mission log for beats, fallout, deadlines, certainty, and heat.', keywords: 'case timeline' },
                { id: 'campaign-board', label: 'Camp Board', href: 'campaign-board.html', description: 'Campaign meta-board for cross-case links, scope references, and arc mapping.', keywords: 'meta board' },
                { id: 'board', label: 'Case Board', href: 'board.html', description: 'Case board linking clues, theories, NPCs, locations, events, and requisitions.', keywords: 'case board' },
                { id: 'leads', label: 'Leads', href: 'leads.html', description: 'Lead triage queue with voting, status control, and concrete next steps.', keywords: 'queue investigation' },
                { id: 'ledger', label: 'Ledger', href: 'ledger.html', description: 'Pinned immutable facts your table has locked in as true.', keywords: 'facts evidence' }
            ]
        },
        {
            id: 'campaign-data',
            title: 'Campaign Data',
            items: [
                { id: 'dashboard', label: 'Dashboard', href: 'player-dashboard.html', description: 'Editable party grid for HP, AC, passives, and save DC at a glance.', keywords: 'players' },
                { id: 'roster', label: 'Roster', href: 'roster.html', description: 'NPC roster with guild tags, wants, leverage notes, filters, and board jumps.', keywords: 'npc contacts' },
                { id: 'locations', label: 'Locations', href: 'locations.html', description: 'Location database for districts, notes, filtering, and board linking.', keywords: 'places' },
                { id: 'requisitions', label: 'Requisitions', href: 'requisitions.html', description: 'Shared requisition pipeline for requests, priority, approvals, and delivery.', keywords: 'gear assets' },
                { id: 'hq', label: 'HQ', href: 'hq.html', description: 'HQ layout foundry with floor plans, downtime slots, and resource staging.', keywords: 'base map' },
                { id: 'prep', label: 'Prep/Procedure', href: 'prep-procedure.html', description: 'Prep/procedure clocks with token spend and timeline logging actions.', keywords: 'clocks' },
                { id: 'sheet', label: 'Sheet', href: 'index.html', description: 'Command-console character sheet with combat, inventory, spells, and roller history.', keywords: 'character' }
            ]
        },
        {
            id: 'gm-tools',
            title: 'GM Tools',
            items: [
                { id: 'gm', label: 'GM Hub', href: 'gm.html', description: 'Session tracker for initiative, quick mobs, rollers, loot, and combat log.', keywords: 'initiative tracker' },
                { id: 'dm-screen', label: 'DM Screen', href: 'dm-screen.html', description: 'Narrative engine for incident prompts, sensory texture, hazards, and fallout.', keywords: 'narrative engine' },
                { id: 'encounters', label: 'Encounters', href: 'encounters.html', description: 'Modular encounter recipe cards with tier/location/objective planning.', keywords: 'combat planning' },
                { id: 'clocks', label: 'Clocks', href: 'clocks.html', description: 'Standalone progress/danger clocks with segment control and PNG export.', keywords: 'segments progress' },
                { id: 'clue', label: 'Clue', href: 'clue.html', description: 'Signal-vs-noise clue intersection generator by guild and modality.', keywords: 'generator' },
                { id: 'tourney', label: 'Tourney', href: 'tourney.html', description: 'Double-elimination bracket manager with auto-advance and score updates.', keywords: 'bracket' }
            ]
        }
    ];
    const QUICK_NAV_IDS = ['tools', 'campaign-timeline', 'campaign-board', 'timeline', 'board', 'leads'];
    const ALL_NAV_ITEMS = NAV_GROUPS.flatMap((group) => group.items);
    const NAV_ITEM_MAP = new Map(ALL_NAV_ITEMS.map((item) => [item.id, item]));

    const header = document.querySelector('.hero-header');
    if (!header || header.dataset.playerNavReady === '1') return;

    const body = document.body;
    const explicitActive = body && body.dataset ? String(body.dataset.playerNav || '').trim() : '';
    const path = String(window.location.pathname || '').split('/').pop().toLowerCase();
    const inferredActive = (ALL_NAV_ITEMS.find((item) => item.href.toLowerCase() === path) || {}).id || '';
    const activeId = explicitActive || inferredActive;

    function resolveNavItemById(id) {
        return NAV_ITEM_MAP.get(id) || null;
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

    function buildNavLink(item, mode) {
        const link = document.createElement('a');
        link.href = item.href;

        const isActive = isNavItemActive(item);
        const isQuick = mode === 'quick';
        link.className = `hero-btn ghost hero-menu-nav-link${isQuick ? ' hero-menu-nav-link-quick' : ''}${isActive ? ' is-active' : ''}`;
        if (isActive) link.setAttribute('aria-current', 'page');
        if (item.description) link.title = `${item.label}: ${item.description}`;
        link.dataset.search = [item.label, item.description, item.keywords].filter(Boolean).join(' ').toLowerCase();

        const label = document.createElement('span');
        label.className = 'hero-menu-nav-label';
        label.textContent = item.label;
        link.appendChild(label);

        return link;
    }

    function buildNavSection(group) {
        const section = document.createElement('details');
        section.className = 'hero-menu-nav-section';
        section.dataset.groupId = group.id;

        const sectionHasActive = group.items.some((item) => isNavItemActive(item));
        if (group.id === 'workflow' || sectionHasActive) section.open = true;

        const summary = document.createElement('summary');
        summary.className = 'hero-menu-nav-summary';

        const sectionTitleEl = document.createElement('span');
        sectionTitleEl.className = 'hero-menu-nav-summary-title';
        sectionTitleEl.textContent = group.title;
        summary.appendChild(sectionTitleEl);

        const sectionCountEl = document.createElement('span');
        sectionCountEl.className = 'hero-menu-nav-count';
        sectionCountEl.textContent = String(group.items.length);
        summary.appendChild(sectionCountEl);

        section.appendChild(summary);

        const nav = document.createElement('div');
        nav.className = 'hero-menu-nav';
        nav.setAttribute('aria-label', `${group.title} navigation menu`);

        group.items.forEach((item) => {
            nav.appendChild(buildNavLink(item, 'default'));
        });

        section.appendChild(nav);
        return section;
    }

    function buildQuickNavSection() {
        const section = document.createElement('section');
        section.className = 'hero-menu-quick';

        const title = document.createElement('div');
        title.className = 'hero-menu-panel-title';
        title.textContent = 'Quick Jump';
        section.appendChild(title);

        const nav = document.createElement('div');
        nav.className = 'hero-menu-quick-grid';
        QUICK_NAV_IDS.forEach((id) => {
            const item = resolveNavItemById(id);
            if (!item) return;
            nav.appendChild(buildNavLink(item, 'quick'));
        });
        section.appendChild(nav);

        return section;
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

        const quickSection = panel.querySelector('.hero-menu-quick');
        if (quickSection) {
            const quickVisibleCount = quickSection.querySelectorAll('.hero-menu-nav-link:not(.is-hidden)').length;
            quickSection.classList.toggle('is-filter-hidden', quickVisibleCount === 0);
        }

        panel.querySelectorAll('.hero-menu-nav-section').forEach((section) => {
            const visibleCount = section.querySelectorAll('.hero-menu-nav-link:not(.is-hidden)').length;
            section.classList.toggle('is-filter-hidden', visibleCount === 0);
            const countEl = section.querySelector('.hero-menu-nav-count');
            if (countEl) countEl.textContent = String(visibleCount);
            if (normalizedQuery && visibleCount > 0) section.open = true;
        });

        const empty = panel.querySelector('.hero-menu-nav-empty');
        if (empty) empty.classList.toggle('is-visible', normalizedQuery.length > 0 && visibleLinkCount === 0);
    }

    function resetNavFilter(panel) {
        const input = panel.querySelector('.hero-menu-search-input');
        if (!input || !input.value) return;
        input.value = '';
        updateNavFilterState(panel, '');
    }

    function buildNavPanel() {
        const panel = document.createElement('div');
        panel.className = 'hero-menu-panel hero-menu-nav-panel';
        panel.setAttribute('aria-hidden', 'true');

        const panelTitle = document.createElement('div');
        panelTitle.className = 'hero-menu-panel-title';
        panelTitle.textContent = '🧭 Navigation';
        panel.appendChild(panelTitle);

        const searchWrap = document.createElement('label');
        searchWrap.className = 'hero-menu-search';
        const searchInput = document.createElement('input');
        searchInput.type = 'search';
        searchInput.className = 'hero-menu-search-input';
        searchInput.placeholder = 'Search pages...';
        searchInput.setAttribute('aria-label', 'Filter navigation pages');
        searchInput.autocomplete = 'off';
        searchWrap.appendChild(searchInput);
        panel.appendChild(searchWrap);

        panel.appendChild(buildQuickNavSection());
        NAV_GROUPS.forEach((group) => {
            panel.appendChild(buildNavSection(group));
        });

        const emptyState = document.createElement('div');
        emptyState.className = 'hero-menu-nav-empty';
        emptyState.textContent = 'No pages match this filter.';
        panel.appendChild(emptyState);

        searchInput.addEventListener('input', () => {
            updateNavFilterState(panel, searchInput.value);
        });

        updateNavFilterState(panel, '');
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

        controls.append(compassBtn, gearBtn);

        const navPanel = buildNavPanel();
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

        const setOpenState = (targetPanel) => {
            const showNav = targetPanel === 'nav';
            const showSettings = targetPanel === 'settings';
            navPanel.classList.toggle('is-open', showNav);
            navPanel.setAttribute('aria-hidden', showNav ? 'false' : 'true');
            settingsPanel.classList.toggle('is-open', showSettings);
            settingsPanel.setAttribute('aria-hidden', showSettings ? 'false' : 'true');
            compassBtn.setAttribute('aria-expanded', showNav ? 'true' : 'false');
            gearBtn.setAttribute('aria-expanded', showSettings ? 'true' : 'false');
            if (showNav && navSearchInput) {
                requestAnimationFrame(() => {
                    try {
                        navSearchInput.focus({ preventScroll: true });
                    } catch (err) {
                        navSearchInput.focus();
                    }
                });
            }
            if (!showNav) resetNavFilter(navPanel);
        };

        const togglePanel = (targetPanel) => {
            const navOpen = navPanel.classList.contains('is-open');
            const settingsOpen = settingsPanel.classList.contains('is-open');
            if ((targetPanel === 'nav' && navOpen) || (targetPanel === 'settings' && settingsOpen)) {
                setOpenState('');
                return;
            }
            setOpenState(targetPanel);
        };

        compassBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            togglePanel('nav');
        });

        gearBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            togglePanel('settings');
        });

        document.addEventListener('click', (event) => {
            const anyOpen = navPanel.classList.contains('is-open') || settingsPanel.classList.contains('is-open');
            if (!anyOpen) return;
            if (actions.contains(event.target)) return;
            setOpenState('');
        });

        document.addEventListener('keydown', (event) => {
            if (event.key !== 'Escape') return;
            const anyOpen = navPanel.classList.contains('is-open') || settingsPanel.classList.contains('is-open');
            if (!anyOpen) return;
            setOpenState('');
        });

        actions.classList.add('has-hero-menu');
        actions.append(controls, navPanel, settingsPanel);
        actions.dataset.heroMenuReady = '1';
    }

    header.classList.add('has-player-nav');
    setupHeroMenu();
    header.dataset.playerNavReady = '1';
})();
