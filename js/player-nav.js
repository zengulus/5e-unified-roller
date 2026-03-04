(function () {
    const PLAYER_NAV_ITEMS = [
        { id: 'sheet', label: 'Sheet', href: 'index.html', description: 'Command-console character sheet with combat, inventory, spells, and roller history.' },
        { id: 'dashboard', label: 'Dashboard', href: 'player-dashboard.html', description: 'Editable party grid for HP, AC, passives, and save DC at a glance.' },
        { id: 'timeline', label: 'Timeline', href: 'timeline.html', description: 'Case-scoped mission log for beats, fallout, deadlines, certainty, and heat.' },
        { id: 'leads', label: 'Leads', href: 'leads.html', description: 'Lead triage queue with voting, status control, and concrete next steps.' },
        { id: 'ledger', label: 'Ledger', href: 'ledger.html', description: 'Pinned immutable facts your table has locked in as true.' },
        { id: 'board', label: 'Board', href: 'board.html', description: 'Case board linking clues, theories, NPCs, locations, events, and requisitions.' },
        { id: 'hq', label: 'HQ', href: 'hq.html', description: 'HQ layout foundry with floor plans, downtime slots, and resource staging.' },
        { id: 'roster', label: 'Roster', href: 'roster.html', description: 'NPC roster with guild tags, wants, leverage notes, filters, and board jumps.' },
        { id: 'locations', label: 'Locations', href: 'locations.html', description: 'Location database for districts, notes, filtering, and board linking.' },
        { id: 'requisitions', label: 'Requisitions', href: 'requisitions.html', description: 'Shared requisition pipeline for requests, priority, approvals, and delivery.' },
        { id: 'prep', label: 'Prep/Procedure', href: 'prep-procedure.html', description: 'Prep/procedure clocks with token spend and timeline logging actions.' }
    ];
    const GM_NAV_ITEMS = [
        { id: 'tools', label: 'Portal (GM)', href: 'tools.html', description: 'GM-only tools hub for case switching, import/export, cloud sync, and utilities.' },
        { id: 'gm', label: 'GM Hub', href: 'gm.html', description: 'Session tracker for initiative, quick mobs, rollers, loot, and combat log.' },
        { id: 'dm-screen', label: 'DM Screen', href: 'dm-screen.html', description: 'Narrative engine for incident prompts, sensory texture, hazards, and fallout.' },
        { id: 'encounters', label: 'Encounters', href: 'encounters.html', description: 'Modular encounter recipe cards with tier/location/objective planning.' },
        { id: 'clocks', label: 'Clocks', href: 'clocks.html', description: 'Standalone progress/danger clocks with segment control and PNG export.' },
        { id: 'clue', label: 'Clue', href: 'clue.html', description: 'Signal-vs-noise clue intersection generator by guild and modality.' },
        { id: 'hub', label: 'Hub', href: 'hub.html', description: 'Campaign strategic dashboard for heat, faction standing, and downtime.' },
        { id: 'tourney', label: 'Tourney', href: 'tourney.html', description: 'Double-elimination bracket manager with auto-advance and score updates.' }
    ];
    const header = document.querySelector('.hero-header');
    if (!header || header.dataset.playerNavReady === '1') return;

    const body = document.body;
    const explicitActive = body && body.dataset ? String(body.dataset.playerNav || '').trim() : '';
    const path = String(window.location.pathname || '').split('/').pop().toLowerCase();
    const inferredActive = (
        PLAYER_NAV_ITEMS.find((item) => item.href.toLowerCase() === path)
        || GM_NAV_ITEMS.find((item) => item.href.toLowerCase() === path)
        || {}
    ).id || '';
    const activeId = explicitActive || inferredActive;

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

    function buildNavPanel(items, panelTitle, ariaLabel, panelClass = 'hero-menu-nav-panel') {
        const panel = document.createElement('div');
        panel.className = `hero-menu-panel ${panelClass}`.trim();
        panel.setAttribute('aria-hidden', 'true');

        const panelHeader = document.createElement('div');
        panelHeader.className = 'hero-menu-panel-title';
        panelHeader.textContent = panelTitle;
        panel.appendChild(panelHeader);

        const nav = document.createElement('nav');
        nav.className = 'hero-menu-nav';
        nav.setAttribute('aria-label', ariaLabel);

        items.forEach((item) => {
            const link = document.createElement('a');
            link.href = item.href;
            const isActive = item.id === activeId || item.href.toLowerCase() === path;
            link.className = `hero-btn ghost hero-menu-nav-link${isActive ? ' is-active' : ''}`;
            if (isActive) link.setAttribute('aria-current', 'page');
            if (item.description) {
                link.title = `${item.label}: ${item.description}`;
            }

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

            nav.appendChild(link);
        });

        panel.appendChild(nav);
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
        compassBtn.title = 'Left-click: Player pages. Right-click: GM pages.';
        compassBtn.setAttribute('aria-expanded', 'false');
        compassBtn.textContent = '🧭';

        const gearBtn = document.createElement('button');
        gearBtn.type = 'button';
        gearBtn.className = 'hero-menu-btn hero-menu-gear';
        gearBtn.setAttribute('aria-label', 'Open settings and action menu');
        gearBtn.setAttribute('aria-expanded', 'false');
        gearBtn.textContent = '⚙';

        controls.append(compassBtn, gearBtn);

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

        const navPanel = buildNavPanel(PLAYER_NAV_ITEMS, '🧭 Player Pages', 'Player navigation menu', 'hero-menu-nav-panel');
        const gmPanel = buildNavPanel(GM_NAV_ITEMS, '🎲 GM Pages', 'GM navigation menu', 'hero-menu-nav-panel hero-menu-gm-panel');

        const setOpenState = (targetPanel) => {
            const showNav = targetPanel === 'nav';
            const showGm = targetPanel === 'gm';
            const showSettings = targetPanel === 'settings';
            navPanel.classList.toggle('is-open', showNav);
            navPanel.setAttribute('aria-hidden', showNav ? 'false' : 'true');
            gmPanel.classList.toggle('is-open', showGm);
            gmPanel.setAttribute('aria-hidden', showGm ? 'false' : 'true');
            settingsPanel.classList.toggle('is-open', showSettings);
            settingsPanel.setAttribute('aria-hidden', showSettings ? 'false' : 'true');
            compassBtn.setAttribute('aria-expanded', (showNav || showGm) ? 'true' : 'false');
            gearBtn.setAttribute('aria-expanded', showSettings ? 'true' : 'false');
        };

        const togglePanel = (targetPanel) => {
            const navOpen = navPanel.classList.contains('is-open');
            const gmOpen = gmPanel.classList.contains('is-open');
            const settingsOpen = settingsPanel.classList.contains('is-open');
            if ((targetPanel === 'nav' && navOpen) || (targetPanel === 'gm' && gmOpen) || (targetPanel === 'settings' && settingsOpen)) {
                setOpenState('');
                return;
            }
            setOpenState(targetPanel);
        };

        compassBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            togglePanel('nav');
        });
        compassBtn.addEventListener('contextmenu', (event) => {
            event.preventDefault();
            event.stopPropagation();
            togglePanel('gm');
        });
        gearBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            togglePanel('settings');
        });

        document.addEventListener('click', (event) => {
            const anyOpen = navPanel.classList.contains('is-open')
                || gmPanel.classList.contains('is-open')
                || settingsPanel.classList.contains('is-open');
            if (!anyOpen) return;
            if (actions.contains(event.target)) return;
            setOpenState('');
        });
        document.addEventListener('keydown', (event) => {
            if (event.key !== 'Escape') return;
            const anyOpen = navPanel.classList.contains('is-open')
                || gmPanel.classList.contains('is-open')
                || settingsPanel.classList.contains('is-open');
            if (!anyOpen) return;
            setOpenState('');
        });

        actions.classList.add('has-hero-menu');
        actions.append(controls, navPanel, gmPanel, settingsPanel);
        actions.dataset.heroMenuReady = '1';
    }

    header.classList.add('has-player-nav');
    setupHeroMenu();
    header.dataset.playerNavReady = '1';
})();
