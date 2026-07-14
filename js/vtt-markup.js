(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.RTF_VTT_MARKUP = api;
}(typeof window !== 'undefined' ? window : null, function () {
    'use strict';

    const REQUIRED_FUNCTION_DEPENDENCIES = Object.freeze([
        'escapeHtml',
        'toNumber',
        'clamp',
        'normalizeAngleDeg',
        'getPointAtAngle',
        'normalizeClockMax',
        'normalizeClockCurrent',
        'getVisionConeGeometry',
        'getStealthVisionTargetSummary',
        'getAreaTemplateWorldGeometry',
        'getAskRollRequestFromPing',
        'getSceneCellPx',
        'normalizeHexColor',
        'getHexColorRgbString',
        'normalizePingVariant',
        'isEvidenceNotePin',
        'normalizeEvidenceNoteCategory',
        'getEvidenceNoteCategoryLabel',
        'getEvidenceNoteDisplayTitle',
        'buildEvidenceNoteAreaLabel',
        'getEvidenceNoteHighlightColor',
        'getEvidenceNoteHighlightRgb',
        'normalizeEvidenceNoteShape',
        'getEvidenceNoteCategoryShortLabel',
        'getTemplateWorldPoint'
    ]);

    const validateDependencies = (deps) => {
        if (!deps || typeof deps !== 'object' || Array.isArray(deps)) {
            throw new TypeError('RTF_VTT_MARKUP.create requires a dependency object.');
        }
        REQUIRED_FUNCTION_DEPENDENCIES.forEach((name) => {
            if (typeof deps[name] !== 'function') {
                throw new TypeError(`RTF_VTT_MARKUP.create requires deps.${name} to be a function.`);
            }
        });
        if (!deps.pingVariantOptions || typeof deps.pingVariantOptions !== 'object' || Array.isArray(deps.pingVariantOptions)) {
            throw new TypeError('RTF_VTT_MARKUP.create requires deps.pingVariantOptions to be an object.');
        }
        if (!deps.pingVariantOptions.attention || typeof deps.pingVariantOptions.attention.icon !== 'string') {
            throw new TypeError('RTF_VTT_MARKUP.create requires deps.pingVariantOptions.attention.icon.');
        }
    };

    const create = (deps) => {
        validateDependencies(deps);

        const {
            escapeHtml,
            toNumber,
            clamp,
            normalizeAngleDeg,
            getPointAtAngle,
            normalizeClockMax,
            normalizeClockCurrent,
            getVisionConeGeometry,
            getStealthVisionTargetSummary,
            getAreaTemplateWorldGeometry,
            getAskRollRequestFromPing,
            getSceneCellPx,
            normalizeHexColor,
            getHexColorRgbString,
            normalizePingVariant,
            isEvidenceNotePin,
            normalizeEvidenceNoteCategory,
            getEvidenceNoteCategoryLabel,
            getEvidenceNoteDisplayTitle,
            buildEvidenceNoteAreaLabel,
            getEvidenceNoteHighlightColor,
            getEvidenceNoteHighlightRgb,
            normalizeEvidenceNoteShape,
            getEvidenceNoteCategoryShortLabel,
            getTemplateWorldPoint,
            pingVariantOptions
        } = deps;

        const buildClockPieMarkup = (clock) => {
            const max = normalizeClockMax(clock && clock.max, 4);
            const current = normalizeClockCurrent(clock && clock.current, max, 0);
            const progressDeg = max > 0 ? Math.round((current / max) * 3600) / 10 : 0;
            const segmentDeg = Math.round((360 / max) * 1000) / 1000;
            return `
            <div class="vtt-clock-pie"
                aria-label="${escapeHtml(`${current} of ${max}`)}"
                style="--vtt-clock-progress-deg:${escapeHtml(String(progressDeg))}deg;--vtt-clock-segment-deg:${escapeHtml(String(segmentDeg))}deg;">
                <span>${escapeHtml(String(current))}/${escapeHtml(String(max))}</span>
            </div>
        `;
        };

        const buildVisionConeMarkup = (token, scene, sceneSize, options = {}) => {
            const renderedToken = options.renderedToken || token;
            const geometry = getVisionConeGeometry(renderedToken, scene, sceneSize);
            if (!geometry) return '';
            const targetSummary = options.targetSummary
                || getStealthVisionTargetSummary(renderedToken, scene, options.state);
            const hasDetectedTargets = targetSummary.detectedIds.length > 0;
            const hasUnseenTargets = targetSummary.unseenIds.length > 0;
            const fill = hasDetectedTargets
                ? 'rgba(255, 102, 102, 0.24)'
                : (hasUnseenTargets ? 'rgba(255, 211, 102, 0.24)' : 'rgba(94, 176, 255, 0.22)');
            const stroke = hasDetectedTargets
                ? 'rgba(255, 132, 132, 0.82)'
                : (hasUnseenTargets ? 'rgba(255, 227, 163, 0.88)' : 'rgba(122, 194, 255, 0.78)');
            const classes = ['vtt-overlay-item', 'vtt-vision-cone'];
            const arcDeg = clamp(toNumber(geometry.arcDeg, 90), 1, 360);
            const facingDeg = normalizeAngleDeg(toNumber(geometry.facingDeg, 0));
            const centerX = toNumber(geometry.centerX, 0);
            const centerY = toNumber(geometry.centerY, 0);
            const radiusPx = Math.max(1, toNumber(geometry.radiusPx, 0));
            const handleGuidePoint = getPointAtAngle(centerX, centerY, radiusPx, facingDeg);
            const shapeMarkup = arcDeg >= 359.5
                ? `
                <circle cx="${centerX.toFixed(3)}" cy="${centerY.toFixed(3)}" r="${radiusPx.toFixed(3)}"
                    fill="${fill}"
                    stroke="${stroke}"
                    stroke-width="8"
                    vector-effect="non-scaling-stroke"></circle>
            `
                : (() => {
                    const startPoint = getPointAtAngle(centerX, centerY, radiusPx, facingDeg - arcDeg / 2);
                    const endPoint = getPointAtAngle(centerX, centerY, radiusPx, facingDeg + arcDeg / 2);
                    const largeArcFlag = arcDeg > 180 ? 1 : 0;
                    const path = [
                        `M ${centerX.toFixed(3)} ${centerY.toFixed(3)}`,
                        `L ${startPoint.x.toFixed(3)} ${startPoint.y.toFixed(3)}`,
                        `A ${radiusPx.toFixed(3)} ${radiusPx.toFixed(3)} 0 ${largeArcFlag} 1 ${endPoint.x.toFixed(3)} ${endPoint.y.toFixed(3)}`,
                        'Z'
                    ].join(' ');
                    return `
                    <path d="${path}"
                        fill="${fill}"
                        stroke="${stroke}"
                        stroke-width="8"
                        vector-effect="non-scaling-stroke"></path>
                `;
                })();
            const rotationState = options.visionConeRotateState;
            if (rotationState && rotationState.tokenId === token.id) classes.push('is-rotating');
            const guideMarkup = options.selectedTokenId === token.id && options.canMoveToken
                ? `
                <line class="vtt-vision-cone-guide"
                    x1="${centerX.toFixed(3)}"
                    y1="${centerY.toFixed(3)}"
                    x2="${handleGuidePoint.x.toFixed(3)}"
                    y2="${handleGuidePoint.y.toFixed(3)}"
                    vector-effect="non-scaling-stroke"></line>
            `
                : '';
            return `
            <div class="${classes.join(' ')}"
                data-token-id="${escapeHtml(String(token.id || ''))}"
                data-world-left="${escapeHtml(String(geometry.left))}"
                data-world-top="${escapeHtml(String(geometry.top))}"
                data-world-width="${escapeHtml(String(geometry.width))}"
                data-world-height="${escapeHtml(String(geometry.height))}">
                <svg viewBox="0 0 ${escapeHtml(String(geometry.width))} ${escapeHtml(String(geometry.height))}" preserveAspectRatio="none" aria-hidden="true">
                    ${shapeMarkup}
                    ${guideMarkup}
                </svg>
            </div>
        `;
        };

        const buildVisionConeHandleMarkup = (token, scene, sceneSize, options = {}) => {
            if (!options.isDM || options.selectedTokenId !== token.id) return '';
            const renderedToken = options.renderedToken || token;
            const geometry = getVisionConeGeometry(renderedToken, scene, sceneSize);
            if (!geometry) return '';
            const handleOffsetPx = 18 / Math.max(0.25, toNumber(options.zoom, 1));
            const handlePoint = getPointAtAngle(
                toNumber(geometry.centerX, 0),
                toNumber(geometry.centerY, 0),
                Math.max(1, toNumber(geometry.radiusPx, 0)) + handleOffsetPx,
                normalizeAngleDeg(toNumber(geometry.facingDeg, 0))
            );
            const leftPercent = geometry.width ? (handlePoint.x / geometry.width) * 100 : 0;
            const topPercent = geometry.height ? (handlePoint.y / geometry.height) * 100 : 0;
            return `
            <div class="vtt-overlay-item vtt-vision-handle-overlay"
                data-world-left="${escapeHtml(String(geometry.left))}"
                data-world-top="${escapeHtml(String(geometry.top))}"
                data-world-width="${escapeHtml(String(geometry.width))}"
                data-world-height="${escapeHtml(String(geometry.height))}">
                <button class="vtt-template-rotate-handle vtt-vision-cone-rotate-handle" type="button"
                    data-token-id="${escapeHtml(String(token.id || ''))}"
                    style="left:${escapeHtml(String(leftPercent))}%;top:${escapeHtml(String(topPercent))}%;"
                    aria-label="Rotate sight cone"></button>
            </div>
        `;
        };

        const buildAreaTemplateMarkup = (template, scene, { preview = false, transient = false } = {}) => {
            const geometry = getAreaTemplateWorldGeometry(template, scene);
            if (!geometry) return '';
            const classes = [
                'vtt-overlay-item',
                'vtt-area-template',
                template.kind === 'cone' ? 'is-cone' : 'is-circle'
            ];
            if (preview) classes.push('is-preview');
            if (transient) classes.push('is-transient');
            const shapeMarkup = template.kind === 'cone'
                ? `
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                    <polygon points="0,50 100,0 100,100"
                        fill="rgba(255, 211, 102, 0.2)"
                        stroke="rgba(255, 227, 163, 0.84)"
                        stroke-width="1.8"></polygon>
                </svg>
            `
                : `
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                    <circle cx="50" cy="50" r="48"
                        fill="rgba(255, 211, 102, 0.18)"
                        stroke="rgba(255, 227, 163, 0.84)"
                        stroke-width="2"></circle>
                </svg>
            `;
            return `
            <div class="${classes.join(' ')}"
                data-template-id="${escapeHtml(String(template.id || ''))}"
                data-world-left="${escapeHtml(String(geometry.left))}"
                data-world-top="${escapeHtml(String(geometry.top))}"
                data-world-width="${escapeHtml(String(geometry.width))}"
                data-world-height="${escapeHtml(String(geometry.height))}"
                data-world-rotation="${escapeHtml(String(geometry.rotationDeg))}">
                ${shapeMarkup}
            </div>
        `;
        };

        const buildAskRollMarkup = (ping, scene, request = null, options = {}) => {
            if (!ping || !scene) return '';
            const cellPx = getSceneCellPx(scene);
            const markerSize = Math.max(54, cellPx * 1.45);
            const panelWidth = Math.max(184, markerSize * 3.25);
            const gap = Math.max(10, markerSize * 0.2);
            const boxWidth = markerSize + gap + panelWidth;
            const boxHeight = Math.max(markerSize, 82);
            const pingId = String(ping.id || '').trim();
            const cleanRequest = request || getAskRollRequestFromPing(ping);
            const requestLabel = String(cleanRequest && cleanRequest.label || '').trim().slice(0, 48) || 'Roll?';
            const canRoll = !!options.canRoll;
            const canCancel = !!options.canCancel;
            const color = normalizeHexColor(ping.color, '#7ee787');
            const rgb = getHexColorRgbString(color, '#7ee787');
            return `
            <div class="vtt-overlay-item vtt-ask-roll-marker"
                data-ping-id="${escapeHtml(pingId)}"
                data-world-left="${escapeHtml(String(toNumber(ping.x, 0) - markerSize / 2))}"
                data-world-top="${escapeHtml(String(toNumber(ping.y, 0) - boxHeight / 2))}"
                data-world-width="${escapeHtml(String(boxWidth))}"
                data-world-height="${escapeHtml(String(boxHeight))}"
                style="--vtt-ask-roll-color:${escapeHtml(color)};--vtt-ask-roll-rgb:${escapeHtml(rgb)};--vtt-ask-roll-pin-size:${escapeHtml(String(markerSize))}px;">
                <button class="vtt-ask-roll-pin" type="button"${canRoll ? ` data-action="roll-ask-roll-ping" data-id="${escapeHtml(pingId)}" title="Roll ${escapeHtml(requestLabel)}"` : ' disabled aria-disabled="true" title="Waiting for the owner to roll"'} >
                    <span class="vtt-ask-roll-pin-dot"></span>
                </button>
                <div class="vtt-ask-roll-card" aria-label="Ask to roll ${escapeHtml(requestLabel)}" style="left:${escapeHtml(String(markerSize + gap))}px;width:${escapeHtml(String(panelWidth))}px;">
                    <span class="vtt-ask-roll-title">Ask To Roll</span>
                    <strong>${escapeHtml(requestLabel)}</strong>
                    ${canRoll || canCancel ? `
                        <span class="vtt-ask-roll-actions">
                            ${canRoll ? `<button class="vtt-chip-btn strong" type="button" data-action="roll-ask-roll-ping" data-id="${escapeHtml(pingId)}">Roll</button>` : ''}
                            ${canCancel ? `<button class="vtt-chip-btn" type="button" data-action="cancel-ask-roll-ping" data-id="${escapeHtml(pingId)}">Cancel</button>` : ''}
                        </span>
                    ` : '<span class="vtt-ask-roll-note">Waiting for owner</span>'}
                </div>
            </div>
        `;
        };

        const buildPingMarkup = (ping, scene, options = {}) => {
            if (!ping || !scene) return '';
            const askRollRequest = Object.prototype.hasOwnProperty.call(options, 'askRollRequest')
                ? options.askRollRequest
                : getAskRollRequestFromPing(ping);
            if (askRollRequest) return buildAskRollMarkup(ping, scene, askRollRequest, options);
            const cellPx = getSceneCellPx(scene);
            const markerSize = Math.max(72, cellPx * 2.25);
            const color = normalizeHexColor(ping.color, '#4f8dff');
            const rgb = getHexColorRgbString(color, '#4f8dff');
            const label = String(ping.label || 'Ping').trim().slice(0, 80) || 'Ping';
            const variant = String(ping.variant || 'attention').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-') || 'attention';
            const icon = (pingVariantOptions[normalizePingVariant(variant)] || pingVariantOptions.attention).icon;
            const pingId = String(ping.id || '').trim();
            return `
            <div class="vtt-overlay-item vtt-ping is-${escapeHtml(variant)}"
                data-ping-id="${escapeHtml(pingId)}"
                data-world-left="${escapeHtml(String(toNumber(ping.x, 0) - markerSize / 2))}"
                data-world-top="${escapeHtml(String(toNumber(ping.y, 0) - markerSize / 2))}"
                data-world-width="${escapeHtml(String(markerSize))}"
                data-world-height="${escapeHtml(String(markerSize))}"
                style="--vtt-ping-color:${escapeHtml(color)};--vtt-ping-rgb:${escapeHtml(rgb)};">
                <div class="vtt-ping-ring"></div>
                <div class="vtt-ping-core">${escapeHtml(icon)}</div>
                <div class="vtt-ping-label">${escapeHtml(label)}</div>
            </div>
        `;
        };

        const buildEvidenceNoteMarkup = (note, scene, options = {}) => {
            if (!note || !scene) return '';
            const { preview = false, selected = false, activeProximityPrompt = null } = options;
            const classes = ['vtt-overlay-item', 'vtt-map-note'];
            if (preview) classes.push('is-preview');
            if (selected) classes.push('is-selected');
            if (note.hidden) classes.push('is-hidden');
            if (isEvidenceNotePin(note)) classes.push('is-pin', 'is-icon-only');
            if (activeProximityPrompt && activeProximityPrompt.sourceKind === 'note' && String(activeProximityPrompt.sourceId || '').trim() === String(note.id || '').trim()) {
                classes.push('is-proximity-source');
            }
            const category = normalizeEvidenceNoteCategory(note.category);
            const categoryLabel = getEvidenceNoteCategoryLabel(category);
            const displayTitle = getEvidenceNoteDisplayTitle(note);
            const description = String(note && note.body || '').trim();
            const areaLabel = buildEvidenceNoteAreaLabel(note, scene);
            const highlightColor = getEvidenceNoteHighlightColor(note);
            const highlightRgb = getEvidenceNoteHighlightRgb(note);
            const kicker = note.hidden ? `DM Only · ${categoryLabel}` : categoryLabel;
            const isPin = isEvidenceNotePin(note);
            const noteX = toNumber(note.x, 0);
            const noteY = toNumber(note.y, 0);
            const noteW = Math.max(1, toNumber(note.w, 1));
            const noteH = Math.max(1, toNumber(note.h, 1));
            const worldLeft = isPin ? noteX - noteW / 2 : noteX;
            const worldTop = isPin ? noteY - noteH / 2 : noteY;
            return `
            <div class="${classes.join(' ')}"
                data-note-id="${escapeHtml(String(note.id || ''))}"
                data-note-shape="${escapeHtml(normalizeEvidenceNoteShape(note.shape, 'zone'))}"
                data-note-category="${escapeHtml(category)}"
                data-note-title="${escapeHtml(displayTitle)}"
                data-world-left="${escapeHtml(String(worldLeft))}"
                data-world-top="${escapeHtml(String(worldTop))}"
                data-world-width="${escapeHtml(String(noteW))}"
                data-world-height="${escapeHtml(String(noteH))}"
                style="--vtt-note-color:${escapeHtml(highlightColor)};--vtt-note-rgb:${escapeHtml(highlightRgb)};">
                <div class="vtt-map-note-chip">
                    <span class="vtt-map-note-kicker">${escapeHtml(kicker)}</span>
                    <strong class="vtt-map-note-title" data-note-category-short="${escapeHtml(getEvidenceNoteCategoryShortLabel(category))}">${escapeHtml(displayTitle)}</strong>
                    <span class="vtt-map-note-body">${escapeHtml(description || 'No marker details shared yet.')}</span>
                    <span class="vtt-map-note-meta">${escapeHtml(areaLabel)}</span>
                </div>
            </div>
        `;
        };

        const buildRulerMarkup = (scene, rulerState) => {
            if (!scene || !rulerState || !rulerState.dragging || rulerState.sceneId !== scene.id || !rulerState.start || !rulerState.end) return '';
            const start = getTemplateWorldPoint(scene, rulerState.start);
            const end = getTemplateWorldPoint(scene, rulerState.end);
            const dx = end.x - start.x;
            const dy = end.y - start.y;
            const distanceCells = Math.hypot(toNumber(rulerState.end.x, 0) - toNumber(rulerState.start.x, 0), toNumber(rulerState.end.y, 0) - toNumber(rulerState.start.y, 0));
            const distanceFeet = Math.round(distanceCells * Math.max(1, toNumber(scene.grid && scene.grid.cellDistance, 5)));
            const label = `${Number.isInteger(distanceCells) ? distanceCells : Math.round(distanceCells * 10) / 10} sq · ${distanceFeet} ft`;
            return `
            <div class="vtt-overlay-item vtt-ruler-line"
                data-world-left="${escapeHtml(String(start.x))}"
                data-world-top="${escapeHtml(String(start.y - 10))}"
                data-world-width="${escapeHtml(String(Math.max(1, Math.hypot(dx, dy))))}"
                data-world-height="20"
                data-world-rotation="${escapeHtml(String(normalizeAngleDeg(Math.atan2(dy, dx) * 180 / Math.PI)))}">
                <div class="vtt-ruler-label">${escapeHtml(label)}</div>
            </div>
        `;
        };

        return Object.freeze({
            buildClockPieMarkup,
            buildVisionConeMarkup,
            buildVisionConeHandleMarkup,
            buildAreaTemplateMarkup,
            buildPingMarkup,
            buildAskRollMarkup,
            buildEvidenceNoteMarkup,
            buildRulerMarkup
        });
    };

    return Object.freeze({ create });
}));
