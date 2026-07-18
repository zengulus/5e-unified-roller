(function (root, factory) {
    const api = factory(root);

    if (typeof module === 'object' && module.exports) {
        module.exports = api;
        return;
    }

    root.RTF_VTT_STAGE_VIEW = api;
}(typeof globalThis !== 'undefined' ? globalThis : window, function (root) {
    'use strict';

    const REQUIRED_FUNCTION_DEPENDENCIES = Object.freeze([
        'applyEvidenceNoteChipPresentation',
        'buildId',
        'buildInitials',
        'canLocalCancelAskRollRequest',
        'canLocalRollAskRollRequest',
        'canRoleMoveToken',
        'clamp',
        'clampZoom',
        'escapeHtml',
        'evaluateProximityTriggers',
        'getActiveScene',
        'getAskRollRequestFromPing',
        'getEntryById',
        'getFitViewOnNextMapLoad',
        'getLocalRole',
        'getRenderableScenePings',
        'getRenderableSceneTemplates',
        'getSceneCellPx',
        'getSceneMapScale',
        'getStageState',
        'getTokenDamageFraction',
        'getTokenImageRenderUrl',
        'getTokenMoodText',
        'getTokenVisionFacingDeg',
        'getUsableMediaUrl',
        'getViewedSceneId',
        'getVisibleSceneTokenForEntry',
        'isTokenBloodied',
        'normalizeAngleDeg',
        'normalizeMoodEmoji',
        'normalizeTokenCoordinate',
        'positionProximityPrompt',
        'positiveModulo',
        'renderProximityPrompt',
        'setFitViewOnNextMapLoad',
        'toNumber'
    ]);

    const REQUIRED_GEOMETRY_METHODS = Object.freeze([
        'buildFogEdgeMarkup',
        'buildFogMaskMarkup',
        'buildStealthStatusMap',
        'collectFogCellSet',
        'getFogEntryWorldRect',
        'getVisibleEvidenceNotesForRole',
        'getVisibleTokensForRole',
        'isTokenUnderFog'
    ]);

    const REQUIRED_MARKUP_METHODS = Object.freeze([
        'buildAreaTemplateMarkup',
        'buildEvidenceNoteMarkup',
        'buildPingMarkup',
        'buildRulerMarkup',
        'buildVisionConeHandleMarkup',
        'buildVisionConeMarkup'
    ]);

    const validateDependencies = (deps) => {
        if (!deps || typeof deps !== 'object' || Array.isArray(deps)) {
            throw new TypeError('RTF_VTT_STAGE_VIEW.create requires a dependency object.');
        }
        const missingFunctions = REQUIRED_FUNCTION_DEPENDENCIES.filter((name) => typeof deps[name] !== 'function');
        if (missingFunctions.length) {
            throw new TypeError(`RTF_VTT_STAGE_VIEW.create is missing function dependencies: ${missingFunctions.join(', ')}`);
        }
        if (!deps.dom || typeof deps.dom !== 'object') {
            throw new TypeError('RTF_VTT_STAGE_VIEW.create requires deps.dom.');
        }
        if (!deps.geometry || typeof deps.geometry !== 'object') {
            throw new TypeError('RTF_VTT_STAGE_VIEW.create requires deps.geometry.');
        }
        if (!deps.markup || typeof deps.markup !== 'object') {
            throw new TypeError('RTF_VTT_STAGE_VIEW.create requires deps.markup.');
        }
        const missingGeometry = REQUIRED_GEOMETRY_METHODS.filter((name) => typeof deps.geometry[name] !== 'function');
        if (missingGeometry.length) {
            throw new TypeError(`RTF_VTT_STAGE_VIEW.create is missing geometry methods: ${missingGeometry.join(', ')}`);
        }
        const missingMarkup = REQUIRED_MARKUP_METHODS.filter((name) => typeof deps.markup[name] !== 'function');
        if (missingMarkup.length) {
            throw new TypeError(`RTF_VTT_STAGE_VIEW.create is missing markup methods: ${missingMarkup.join(', ')}`);
        }
    };

    const create = (deps) => {
        validateDependencies(deps);

        const {
            applyEvidenceNoteChipPresentation,
            buildId,
            buildInitials,
            canLocalCancelAskRollRequest,
            canLocalRollAskRollRequest,
            canRoleMoveToken,
            clamp,
            clampZoom,
            escapeHtml,
            evaluateProximityTriggers,
            getActiveScene,
            getAskRollRequestFromPing,
            getEntryById,
            getFitViewOnNextMapLoad,
            getLocalRole,
            getRenderableScenePings,
            getRenderableSceneTemplates,
            getSceneCellPx,
            getSceneMapScale,
            getStageState,
            getTokenDamageFraction,
            getTokenImageRenderUrl,
            getTokenMoodText,
            getTokenVisionFacingDeg,
            getUsableMediaUrl,
            getViewedSceneId,
            getVisibleSceneTokenForEntry,
            isTokenBloodied,
            normalizeAngleDeg,
            normalizeMoodEmoji,
            normalizeTokenCoordinate,
            positionProximityPrompt,
            positiveModulo,
            renderProximityPrompt,
            setFitViewOnNextMapLoad,
            toNumber,
            dom,
            geometry,
            markup
        } = deps;

        const config = deps.config && typeof deps.config === 'object' ? deps.config : {};
        const defaultWorldSize = config.defaultWorldSize || { width: 2400, height: 1600 };
        const defaultCellPx = Math.max(1, toNumber(config.defaultCellPx, 70));
        const tokenCoordPrecision = Math.max(1, Math.round(toNumber(config.tokenCoordPrecision, 1000)));
        const remoteTokenTweenMs = Math.max(1, Math.round(toNumber(config.remoteTokenTweenMs, 240)));
        const localDragTweenSuppressMs = Math.max(1, Math.round(toNumber(config.localDragTweenSuppressMs, 1200)));
        const tokenHpFlashMs = Math.max(1, Math.round(toNumber(config.tokenHpFlashMs, 680)));
        const fogRevealShimmerMs = Math.max(1, Math.round(toNumber(config.fogRevealShimmerMs, 900)));
        const stealthStatusDetected = String(config.stealthStatusDetected || 'detected');
        const stealthStatusUnseen = String(config.stealthStatusUnseen || 'unseen');

        const localView = deps.localView && typeof deps.localView === 'object'
            ? deps.localView
            : { x: 40, y: 40, zoom: 1 };
        const worldSize = deps.worldSize && typeof deps.worldSize === 'object'
            ? deps.worldSize
            : { width: defaultWorldSize.width, height: defaultWorldSize.height };
        let mapSize = { width: 0, height: 0 };
        let mapLoadState = { url: '', loaded: false };
        const remoteTokenTweens = deps.remoteTokenTweens instanceof Map ? deps.remoteTokenTweens : new Map();
        const localDragTweenSuppressions = new Map();
        const recentLocalDragDrops = new Map();
        let remoteTokenTweenFrame = 0;
        let templateExpiryTimer = 0;
        let pingExpiryTimer = 0;
        let visualEffectTimer = 0;
        let fogRevealBursts = [];
        const tokenVisualEffects = new Map();
        const tokenHpSnapshot = new Map();
        const layerMarkupCache = new WeakMap();
        const sceneDerivedCache = new WeakMap();
        let fogRenderCache = { signature: '', cellSet: new Set(), edgeMarkup: '' };

        const commitLayerMarkup = (layerEl, markup) => {
            if (!layerEl) return false;
            const nextMarkup = String(markup || '');
            if (layerMarkupCache.get(layerEl) === nextMarkup) return false;
            layerEl.innerHTML = nextMarkup;
            layerMarkupCache.set(layerEl, nextMarkup);
            return true;
        };

        const buildFogRenderSignature = (scene) => {
            if (!scene) return '';
            const grid = scene.grid || {};
            const fog = Array.isArray(scene.fog) ? scene.fog : [];
            const fogParts = fog.map((entry) => {
                const value = entry || {};
                return [value.col, value.row, value.cols, value.rows, value.x, value.y, value.w, value.h].join(':');
            });
            return [
                scene.id || '',
                grid.cellPx,
                grid.offsetX,
                grid.offsetY,
                worldSize.width,
                worldSize.height,
                fogParts.join('|')
            ].join(';');
        };

        const getFogRenderData = (scene) => {
            const signature = buildFogRenderSignature(scene);
            if (fogRenderCache.signature === signature) return fogRenderCache;
            const cellSet = Array.isArray(scene && scene.fog)
                ? geometry.collectFogCellSet(scene, scene.fog)
                : new Set();
            fogRenderCache = {
                signature,
                cellSet,
                edgeMarkup: geometry.buildFogEdgeMarkup(scene, cellSet)
            };
            return fogRenderCache;
        };

        const buildSceneDerivedSignature = (scene, role, fogSignature) => {
            const tokenParts = (Array.isArray(scene && scene.tokens) ? scene.tokens : []).map((token) => {
                const value = token || {};
                const vision = value.vision || {};
                return [
                    value.id, value.x, value.y, value.w, value.h, value.side, value.hidden,
                    value.stealthRoll, vision.enabled, vision.baseRangeCells, vision.arcDeg, vision.facingDeg
                ].join(':');
            });
            const noteParts = (Array.isArray(scene && scene.evidenceNotes) ? scene.evidenceNotes : []).map((note) => {
                const value = note || {};
                return [value.id, value.x, value.y, value.w, value.h, value.shape, value.hidden].join(':');
            });
            return [role || '', fogSignature, scene && scene.stealthMode ? '1' : '0', tokenParts.join('|'), noteParts.join('|')].join(';');
        };

        const getSceneDerivedData = (scene, role, fogCellSet, fogSignature, state) => {
            let roleCache = sceneDerivedCache.get(scene);
            if (!roleCache) {
                roleCache = new Map();
                sceneDerivedCache.set(scene, roleCache);
            }
            const cacheKey = String(role || '');
            const cached = roleCache.get(cacheKey);
            const signature = buildSceneDerivedSignature(scene, role, fogSignature);
            if (cached && cached.signature === signature && cached.fogCellSet === fogCellSet) return cached;
            const derived = {
                signature,
                fogCellSet,
                visibleEvidenceNotes: geometry.getVisibleEvidenceNotesForRole(scene, role, fogCellSet),
                visibleTokens: geometry.getVisibleTokensForRole(scene, role, fogCellSet),
                stealthStatusMap: geometry.buildStealthStatusMap(scene, state, fogCellSet)
            };
            roleCache.set(cacheKey, derived);
            return derived;
        };

        const setWorldSize = (nextSize) => {
            worldSize.width = Math.max(1, Math.round(toNumber(nextSize && nextSize.width, defaultWorldSize.width)));
            worldSize.height = Math.max(1, Math.round(toNumber(nextSize && nextSize.height, defaultWorldSize.height)));
            return worldSize;
        };

        let renderStage = () => {};
        let renderTokenMotionFrame = () => renderStage();

        const scheduleVisualEffectRender = (delayMs = 760) => {
            if (visualEffectTimer) return;
            visualEffectTimer = root.setTimeout(() => {
                visualEffectTimer = 0;
                renderStage();
            }, Math.max(120, toNumber(delayMs, 760)));
        };

        const pruneVisualEffects = (now = Date.now()) => {
            tokenVisualEffects.forEach((effect, tokenId) => {
                if (!effect || toNumber(effect.expiresAt, 0) <= now) tokenVisualEffects.delete(tokenId);
            });
            fogRevealBursts = fogRevealBursts.filter((burst) => toNumber(burst && burst.expiresAt, 0) > now);
            const nextTokenExpiry = Array.from(tokenVisualEffects.values())
                .map((effect) => toNumber(effect && effect.expiresAt, 0))
                .filter((expiresAt) => expiresAt > now);
            const nextFogExpiry = fogRevealBursts
                .map((burst) => toNumber(burst && burst.expiresAt, 0))
                .filter((expiresAt) => expiresAt > now);
            const nextExpiry = Math.min(...nextTokenExpiry, ...nextFogExpiry);
            if (Number.isFinite(nextExpiry)) scheduleVisualEffectRender(nextExpiry - now + 40);
        };

        const markTokenVisualEffect = (tokenId, kind, durationMs = tokenHpFlashMs) => {
            const cleanTokenId = String(tokenId || '').trim();
            const cleanKind = String(kind || '').trim();
            if (!cleanTokenId || !cleanKind) return;
            tokenVisualEffects.set(cleanTokenId, {
                kind: cleanKind,
                expiresAt: Date.now() + Math.max(120, toNumber(durationMs, tokenHpFlashMs))
            });
            scheduleVisualEffectRender(durationMs + 40);
        };

        const getTokenVisualEffectKind = (tokenId, now = Date.now()) => {
            const cleanTokenId = String(tokenId || '').trim();
            const effect = tokenVisualEffects.get(cleanTokenId);
            if (!effect) return '';
            if (toNumber(effect.expiresAt, 0) <= now) {
                tokenVisualEffects.delete(cleanTokenId);
                return '';
            }
            return String(effect.kind || '').trim();
        };

        const schedulePingExpiryRender = (scene) => {
            if (pingExpiryTimer) {
                root.clearTimeout(pingExpiryTimer);
                pingExpiryTimer = 0;
            }
            const pings = getRenderableScenePings(scene);
            if (!pings.length) return;
            const nextExpiry = Math.min(...pings.map((ping) => Math.max(0, toNumber(ping && ping.expiresAt, 0))));
            if (!Number.isFinite(nextExpiry) || nextExpiry <= 0) return;
            const delay = Math.max(0, nextExpiry - Date.now() + 32);
            pingExpiryTimer = root.setTimeout(() => {
                pingExpiryTimer = 0;
                renderStage();
            }, delay);
        };

        const scheduleTemplateExpiryRender = (scene) => {
            if (templateExpiryTimer) {
                root.clearTimeout(templateExpiryTimer);
                templateExpiryTimer = 0;
            }
            const templates = getRenderableSceneTemplates(scene);
            if (!templates.length) return;
            const nextExpiry = Math.min(...templates.map((template) => Math.max(0, toNumber(template && template.expiresAt, 0))));
            if (!Number.isFinite(nextExpiry) || nextExpiry <= 0) return;
            const delay = Math.max(0, nextExpiry - Date.now() + 32);
            templateExpiryTimer = root.setTimeout(() => {
                templateExpiryTimer = 0;
                renderStage();
            }, delay);
        };

        const addFogRevealBurst = (scene, mask) => {
            const rect = geometry.getFogEntryWorldRect(scene, mask);
            if (!rect) return;
            fogRevealBursts.push({
                id: buildId('fogburst'),
                x: rect.x,
                y: rect.y,
                w: rect.w,
                h: rect.h,
                expiresAt: Date.now() + fogRevealShimmerMs
            });
            fogRevealBursts = fogRevealBursts.slice(-12);
            scheduleVisualEffectRender(fogRevealShimmerMs + 40);
        };

        const buildFogRevealShimmerMarkup = (now = Date.now()) => {
            if (!fogRevealBursts.length) return '';
            return fogRevealBursts
                .filter((burst) => toNumber(burst && burst.expiresAt, 0) > now)
                .map((burst) => `
                    <div class="vtt-fog-reveal-shimmer"
                        data-world-left="${escapeHtml(String(burst.x))}"
                        data-world-top="${escapeHtml(String(burst.y))}"
                        data-world-width="${escapeHtml(String(burst.w))}"
                        data-world-height="${escapeHtml(String(burst.h))}"></div>
                `).join('');
        };

        const buildRemoteTokenTweenKey = (sceneId, tokenId) => `${String(sceneId || '').trim()}::${String(tokenId || '').trim()}`;
        const easeRemoteTokenTween = (progress) => 1 - Math.pow(1 - clamp(progress, 0, 1), 3);

        const suppressLocalDragTween = (sceneId, tokenId, durationMs = localDragTweenSuppressMs) => {
            const key = buildRemoteTokenTweenKey(sceneId, tokenId);
            if (!key || key === '::') return;
            localDragTweenSuppressions.set(key, Date.now() + Math.max(1, Math.round(toNumber(durationMs, localDragTweenSuppressMs))));
            remoteTokenTweens.delete(key);
        };

        const isLocalDragTweenSuppressed = (sceneId, tokenId, now = Date.now()) => {
            const key = buildRemoteTokenTweenKey(sceneId, tokenId);
            const expiresAt = localDragTweenSuppressions.get(key);
            if (!expiresAt) return false;
            if (now > expiresAt) {
                localDragTweenSuppressions.delete(key);
                return false;
            }
            return true;
        };

        const rememberRecentLocalDragDrop = (sceneId, tokenId, x, y, durationMs = localDragTweenSuppressMs) => {
            const key = buildRemoteTokenTweenKey(sceneId, tokenId);
            if (!key) return;
            recentLocalDragDrops.set(key, {
                sceneId: String(sceneId || '').trim(),
                tokenId: String(tokenId || '').trim(),
                x: normalizeTokenCoordinate(x, 0),
                y: normalizeTokenCoordinate(y, 0),
                expiresAt: Date.now() + Math.max(1, Math.round(toNumber(durationMs, localDragTweenSuppressMs)))
            });
        };

        const getRecentLocalDragDrop = (sceneId, tokenId, now = Date.now()) => {
            const key = buildRemoteTokenTweenKey(sceneId, tokenId);
            if (!key) return null;
            const entry = recentLocalDragDrops.get(key);
            if (!entry) return null;
            if (now > entry.expiresAt) {
                recentLocalDragDrops.delete(key);
                return null;
            }
            return entry;
        };

        const reconcileSnapshotWithRecentLocalDragDrops = (snapshot) => {
            if (!snapshot || !Array.isArray(snapshot.scenes) || !recentLocalDragDrops.size) return snapshot;
            const now = Date.now();
            snapshot.scenes.forEach((scene) => {
                const sceneId = String(scene && scene.id || '').trim();
                if (!sceneId || !Array.isArray(scene.tokens)) return;
                scene.tokens.forEach((token) => {
                    const tokenId = String(token && token.id || '').trim();
                    const drop = getRecentLocalDragDrop(sceneId, tokenId, now);
                    if (!drop || !token) return;
                    const tokenX = normalizeTokenCoordinate(token.x, drop.x);
                    const tokenY = normalizeTokenCoordinate(token.y, drop.y);
                    if (tokenX === drop.x && tokenY === drop.y) return;
                    token.x = drop.x;
                    token.y = drop.y;
                });
            });
            return snapshot;
        };

        const normalizeRemoteTokenFacingDeg = (value) => {
            if (value === null || value === undefined || value === '') return null;
            const parsed = Number(value);
            if (!Number.isFinite(parsed)) return null;
            return normalizeAngleDeg(parsed);
        };

        const getAngleTweenDeltaDeg = (fromDeg, toDeg) => {
            if (fromDeg === null || toDeg === null) return 0;
            return (((toDeg - fromDeg) + 540) % 360) - 180;
        };

        const pruneRemoteTokenTweens = (now = Date.now()) => {
            for (const [key, tween] of remoteTokenTweens.entries()) {
                if (!tween || !Number.isFinite(tween.startedAt) || !Number.isFinite(tween.durationMs)) {
                    remoteTokenTweens.delete(key);
                    continue;
                }
                if (now >= tween.startedAt + tween.durationMs) remoteTokenTweens.delete(key);
            }
        };

        const hasActiveSceneRemoteTweens = (sceneId = getViewedSceneId(getStageState().vttState, getLocalRole()), now = Date.now()) => {
            const targetSceneId = String(sceneId || '').trim();
            if (!targetSceneId) return false;
            for (const tween of remoteTokenTweens.values()) {
                if (!tween || tween.sceneId !== targetSceneId) continue;
                if (now < tween.startedAt + tween.durationMs) return true;
            }
            return false;
        };

        const scheduleRemoteTokenTweenRender = () => {
            if (remoteTokenTweenFrame || !hasActiveSceneRemoteTweens()) return;
            remoteTokenTweenFrame = root.requestAnimationFrame(() => {
                remoteTokenTweenFrame = 0;
                const renderTime = Date.now();
                pruneRemoteTokenTweens(renderTime);
                if (hasActiveSceneRemoteTweens(undefined, renderTime)) {
                    renderTokenMotionFrame(renderTime);
                    scheduleRemoteTokenTweenRender();
                } else {
                    renderStage();
                }
            });
        };

        const getRemoteTokenTweenProgress = (tween, now = Date.now()) => {
            if (!tween || !Number.isFinite(tween.startedAt) || !Number.isFinite(tween.durationMs) || tween.durationMs <= 0) return 1;
            return easeRemoteTokenTween((now - tween.startedAt) / tween.durationMs);
        };

        const getRemoteTokenTweenCurrentPosition = (tween, now = Date.now()) => {
            if (!tween) return null;
            const progress = getRemoteTokenTweenProgress(tween, now);
            return {
                x: Math.round((tween.fromX + (tween.toX - tween.fromX) * progress) * tokenCoordPrecision) / tokenCoordPrecision,
                y: Math.round((tween.fromY + (tween.toY - tween.fromY) * progress) * tokenCoordPrecision) / tokenCoordPrecision
            };
        };

        const getRemoteTokenTweenCurrentFacingDeg = (tween, now = Date.now()) => {
            if (!tween || tween.fromFacingDeg === null || tween.toFacingDeg === null) return null;
            const progress = getRemoteTokenTweenProgress(tween, now);
            return normalizeAngleDeg(tween.fromFacingDeg + getAngleTweenDeltaDeg(tween.fromFacingDeg, tween.toFacingDeg) * progress);
        };

        const queueRemoteTokenTween = (sceneId, tokenId, fromX, fromY, toX, toY, fromFacingDegRaw = null, toFacingDegRaw = null) => {
            const cleanSceneId = String(sceneId || '').trim();
            const cleanTokenId = String(tokenId || '').trim();
            if (!cleanSceneId || !cleanTokenId) return;
            const tweenKey = buildRemoteTokenTweenKey(cleanSceneId, cleanTokenId);
            const now = Date.now();
            if (isLocalDragTweenSuppressed(cleanSceneId, cleanTokenId, now)) {
                remoteTokenTweens.delete(tweenKey);
                return;
            }
            const previousTween = remoteTokenTweens.get(tweenKey);
            const currentPosition = previousTween ? getRemoteTokenTweenCurrentPosition(previousTween, now) : null;
            const fromFacingDeg = normalizeRemoteTokenFacingDeg(fromFacingDegRaw);
            const toFacingDeg = normalizeRemoteTokenFacingDeg(toFacingDegRaw);
            const currentFacingDeg = previousTween ? getRemoteTokenTweenCurrentFacingDeg(previousTween, now) : null;
            const startX = currentPosition ? currentPosition.x : fromX;
            const startY = currentPosition ? currentPosition.y : fromY;
            const startFacingDeg = currentFacingDeg === null ? fromFacingDeg : currentFacingDeg;
            const facingDelta = Math.abs(getAngleTweenDeltaDeg(startFacingDeg, toFacingDeg));
            if (startX === toX && startY === toY && facingDelta <= 0.001) {
                remoteTokenTweens.delete(tweenKey);
                return;
            }
            remoteTokenTweens.set(tweenKey, {
                sceneId: cleanSceneId,
                tokenId: cleanTokenId,
                fromX: startX,
                fromY: startY,
                toX,
                toY,
                fromFacingDeg: startFacingDeg,
                toFacingDeg,
                startedAt: now,
                durationMs: remoteTokenTweenMs
            });
            scheduleRemoteTokenTweenRender();
        };

        const queueRemoteTweensFromSnapshots = (previousState, nextState) => {
            if (!previousState || !nextState || !Array.isArray(previousState.scenes) || !Array.isArray(nextState.scenes)) return;
            const previousScenes = new Map(previousState.scenes.map((scene) => [String(scene && scene.id || '').trim(), scene]));
            nextState.scenes.forEach((scene) => {
                const cleanSceneId = String(scene && scene.id || '').trim();
                if (!cleanSceneId || !scene || !Array.isArray(scene.tokens)) return;
                const previousScene = previousScenes.get(cleanSceneId);
                if (!previousScene || !Array.isArray(previousScene.tokens)) return;
                const previousTokens = new Map(previousScene.tokens.map((token) => [String(token && token.id || '').trim(), token]));
                scene.tokens.forEach((token) => {
                    const previousToken = previousTokens.get(String(token && token.id || '').trim());
                    if (!previousToken || !token) return;
                    const fromX = normalizeTokenCoordinate(previousToken.x, token.x);
                    const fromY = normalizeTokenCoordinate(previousToken.y, token.y);
                    const toX = normalizeTokenCoordinate(token.x, fromX);
                    const toY = normalizeTokenCoordinate(token.y, fromY);
                    const fromFacingDeg = previousToken.vision && previousToken.vision.facingDeg;
                    const toFacingDeg = token.vision && token.vision.facingDeg;
                    queueRemoteTokenTween(cleanSceneId, token.id, fromX, fromY, toX, toY, fromFacingDeg, toFacingDeg);
                });
            });
        };

        const getRenderableTokenCells = (token, scene, now = Date.now()) => {
            if (!token || !scene) return { x: 0, y: 0 };
            const { dragState } = getStageState();
            if (dragState && String(dragState.tokenId || '').trim() === String(token.id || '').trim()) {
                return {
                    x: normalizeTokenCoordinate(token.x, 0),
                    y: normalizeTokenCoordinate(token.y, 0)
                };
            }
            const tweenKey = buildRemoteTokenTweenKey(scene.id, token.id);
            const tween = remoteTokenTweens.get(tweenKey);
            if (!tween || now >= tween.startedAt + tween.durationMs) {
                if (tween) remoteTokenTweens.delete(tweenKey);
                return {
                    x: normalizeTokenCoordinate(token.x, 0),
                    y: normalizeTokenCoordinate(token.y, 0)
                };
            }
            return getRemoteTokenTweenCurrentPosition(tween, now);
        };

        const getRenderableTokenFacingDeg = (token, scene, now = Date.now()) => {
            if (!token || !scene || !token.vision) return getTokenVisionFacingDeg(token);
            const tweenKey = buildRemoteTokenTweenKey(scene.id, token.id);
            const tween = remoteTokenTweens.get(tweenKey);
            if (!tween || now >= tween.startedAt + tween.durationMs || tween.fromFacingDeg === null || tween.toFacingDeg === null) {
                return getTokenVisionFacingDeg(token);
            }
            return getRemoteTokenTweenCurrentFacingDeg(tween, now);
        };

        const getRenderableVisionToken = (token, scene, now = Date.now()) => {
            if (!token || !token.vision) return token;
            const { visionConeRotateState } = getStageState();
            if (visionConeRotateState && visionConeRotateState.tokenId === token.id) {
                return {
                    ...token,
                    vision: {
                        ...(token.vision || {}),
                        facingDeg: visionConeRotateState.angleDeg
                    }
                };
            }
            return {
                ...token,
                vision: {
                    ...(token.vision || {}),
                    facingDeg: getRenderableTokenFacingDeg(token, scene, now)
                }
            };
        };

        const getLoadedMapSizeForScene = (scene) => {
            if (!scene || !scene.mapImageUrl) return { width: 0, height: 0 };
            if (mapLoadState.url !== scene.mapImageUrl || !mapLoadState.loaded) return { width: 0, height: 0 };
            const scale = getSceneMapScale(scene);
            return {
                width: Math.max(0, Math.round((mapSize.width || 0) * scale)),
                height: Math.max(0, Math.round((mapSize.height || 0) * scale))
            };
        };

        const getWorldSizeForScene = (scene) => {
            if (!scene) return { ...defaultWorldSize };
            const grid = scene.grid || { cellPx: defaultCellPx, offsetX: 0, offsetY: 0 };
            const loadedMapSize = getLoadedMapSizeForScene(scene);
            let width = loadedMapSize.width || 0;
            let height = loadedMapSize.height || 0;
            const hasTokens = Array.isArray(scene.tokens) && scene.tokens.length;
            if ((scene.mapImageUrl && !loadedMapSize.width) || (!scene.mapImageUrl && !hasTokens)) {
                width = Math.max(width, defaultWorldSize.width);
                height = Math.max(height, defaultWorldSize.height);
            }
            if (Array.isArray(scene.tokens) && scene.tokens.length) {
                scene.tokens.forEach((token) => {
                    width = Math.max(width, grid.offsetX + (token.x + token.w + 4) * grid.cellPx);
                    height = Math.max(height, grid.offsetY + (token.y + token.h + 4) * grid.cellPx);
                });
            }
            if (Array.isArray(scene.evidenceNotes) && scene.evidenceNotes.length) {
                scene.evidenceNotes.forEach((note) => {
                    width = Math.max(width, toNumber(note && note.x, 0) + Math.max(1, toNumber(note && note.w, grid.cellPx)) + grid.cellPx * 2);
                    height = Math.max(height, toNumber(note && note.y, 0) + Math.max(1, toNumber(note && note.h, grid.cellPx)) + grid.cellPx * 2);
                });
            }
            if (Array.isArray(scene.fog) && scene.fog.length) {
                scene.fog.forEach((fogEntry) => {
                    const rect = geometry.getFogEntryWorldRect(scene, fogEntry);
                    if (!rect) return;
                    width = Math.max(width, rect.x + rect.w + grid.cellPx * 2);
                    height = Math.max(height, rect.y + rect.h + grid.cellPx * 2);
                });
            }
            return {
                width: Math.max(1, Math.round(width)),
                height: Math.max(1, Math.round(height))
            };
        };

        const scaleForZoom = (value) => Math.max(0, Math.round(value * localView.zoom * 1000) / 1000);

        const applyRenderedWorldGeometry = (scene = getActiveScene(), options = {}) => {
            const {
                mapWorldEl,
                worldEl,
                mapImageEl,
                fogLayerEl,
                noteLayerEl,
                templateLayerEl,
                tokenLayerEl,
                visionLayerEl,
                proximityPromptStackEl
            } = dom;
            if (!scene || !mapWorldEl || !worldEl || !mapImageEl || !fogLayerEl || !noteLayerEl || !templateLayerEl || !tokenLayerEl || !visionLayerEl) return;
            const mapDisplaySize = getLoadedMapSizeForScene(scene);
            const scaledMapWidth = scaleForZoom(mapDisplaySize.width || 0);
            const scaledMapHeight = scaleForZoom(mapDisplaySize.height || 0);
            mapWorldEl.style.width = `${scaledMapWidth}px`;
            mapWorldEl.style.height = `${scaledMapHeight}px`;
            mapImageEl.style.width = `${scaledMapWidth}px`;
            mapImageEl.style.height = `${scaledMapHeight}px`;
            worldEl.style.width = `${scaleForZoom(worldSize.width)}px`;
            worldEl.style.height = `${scaleForZoom(worldSize.height)}px`;

            const updateFog = options.fog !== false;
            const updateNotes = options.notes !== false;
            const updateTemplates = options.templates !== false;
            const updateTokens = options.tokens !== false;
            const updateVision = options.vision !== false;

            if (updateFog) fogLayerEl.querySelectorAll('.vtt-fog-mask, .vtt-fog-reveal-shimmer').forEach((maskEl) => {
                if (!(maskEl instanceof root.HTMLElement)) return;
                const worldLeft = toNumber(maskEl.dataset.worldLeft, 0);
                const worldTop = toNumber(maskEl.dataset.worldTop, 0);
                maskEl.style.left = `${scaleForZoom(worldLeft)}px`;
                maskEl.style.top = `${scaleForZoom(worldTop)}px`;
                maskEl.style.width = `${scaleForZoom(toNumber(maskEl.dataset.worldWidth, 0))}px`;
                maskEl.style.height = `${scaleForZoom(toNumber(maskEl.dataset.worldHeight, 0))}px`;
                if (maskEl.classList.contains('vtt-fog-reveal-shimmer')) return;
                maskEl.style.setProperty('--vtt-fog-texture-x', `${-scaleForZoom(worldLeft)}px`);
                maskEl.style.setProperty('--vtt-fog-texture-y', `${-scaleForZoom(worldTop)}px`);
            });

            if (updateFog) fogLayerEl.querySelectorAll('.vtt-fog-texture-clip').forEach((textureEl) => {
                if (!(textureEl instanceof root.HTMLElement)) return;
                const worldLeft = toNumber(textureEl.dataset.worldLeft, 0);
                const worldTop = toNumber(textureEl.dataset.worldTop, 0);
                const worldWidth = toNumber(textureEl.dataset.worldWidth, worldSize.width);
                const worldHeight = toNumber(textureEl.dataset.worldHeight, worldSize.height);
                const tilePx = Math.max(32, scaleForZoom(256));
                textureEl.style.left = `${scaleForZoom(worldLeft)}px`;
                textureEl.style.top = `${scaleForZoom(worldTop)}px`;
                textureEl.style.width = `${scaleForZoom(worldWidth)}px`;
                textureEl.style.height = `${scaleForZoom(worldHeight)}px`;
                textureEl.style.setProperty('--vtt-fog-texture-tile', `${tilePx}px`);
                textureEl.style.setProperty('--vtt-fog-texture-gutter', `${tilePx}px`);
            });

            if (updateFog) fogLayerEl.querySelectorAll('.vtt-fog-edge-svg').forEach((edgeEl) => {
                if (!(edgeEl instanceof root.SVGSVGElement)) return;
                const worldLeft = toNumber(edgeEl.dataset.worldLeft, 0);
                const worldTop = toNumber(edgeEl.dataset.worldTop, 0);
                const worldWidth = toNumber(edgeEl.dataset.worldWidth, worldSize.width);
                const worldHeight = toNumber(edgeEl.dataset.worldHeight, worldSize.height);
                edgeEl.style.left = `${scaleForZoom(worldLeft)}px`;
                edgeEl.style.top = `${scaleForZoom(worldTop)}px`;
                edgeEl.style.width = `${scaleForZoom(worldWidth)}px`;
                edgeEl.style.height = `${scaleForZoom(worldHeight)}px`;
            });

            if (updateNotes) noteLayerEl.querySelectorAll('.vtt-map-note').forEach((noteEl) => {
                if (!(noteEl instanceof root.HTMLElement)) return;
                noteEl.style.left = `${scaleForZoom(toNumber(noteEl.dataset.worldLeft, 0))}px`;
                noteEl.style.top = `${scaleForZoom(toNumber(noteEl.dataset.worldTop, 0))}px`;
                noteEl.style.width = `${scaleForZoom(toNumber(noteEl.dataset.worldWidth, 0))}px`;
                noteEl.style.height = `${scaleForZoom(toNumber(noteEl.dataset.worldHeight, 0))}px`;
                applyEvidenceNoteChipPresentation(noteEl);
            });

            if (updateTemplates) templateLayerEl.querySelectorAll('.vtt-overlay-item').forEach((itemEl) => {
                if (!(itemEl instanceof root.HTMLElement)) return;
                itemEl.style.left = `${scaleForZoom(toNumber(itemEl.dataset.worldLeft, 0))}px`;
                itemEl.style.top = `${scaleForZoom(toNumber(itemEl.dataset.worldTop, 0))}px`;
                itemEl.style.width = `${scaleForZoom(toNumber(itemEl.dataset.worldWidth, 0))}px`;
                itemEl.style.height = `${scaleForZoom(toNumber(itemEl.dataset.worldHeight, 0))}px`;
                if (itemEl.dataset.worldRotation !== undefined) itemEl.style.transform = `rotate(${toNumber(itemEl.dataset.worldRotation, 0)}deg)`;
            });

            if (updateVision) visionLayerEl.querySelectorAll('.vtt-overlay-item').forEach((itemEl) => {
                if (!(itemEl instanceof root.HTMLElement)) return;
                itemEl.style.left = `${scaleForZoom(toNumber(itemEl.dataset.worldLeft, 0))}px`;
                itemEl.style.top = `${scaleForZoom(toNumber(itemEl.dataset.worldTop, 0))}px`;
                itemEl.style.width = `${scaleForZoom(toNumber(itemEl.dataset.worldWidth, 0))}px`;
                itemEl.style.height = `${scaleForZoom(toNumber(itemEl.dataset.worldHeight, 0))}px`;
                if (itemEl.dataset.worldRotation !== undefined) itemEl.style.transform = `rotate(${toNumber(itemEl.dataset.worldRotation, 0)}deg)`;
            });

            if (proximityPromptStackEl && !proximityPromptStackEl.hidden) positionProximityPrompt(scene);

            if (updateTokens) tokenLayerEl.querySelectorAll('.vtt-token').forEach((tokenEl) => {
                if (!(tokenEl instanceof root.HTMLElement)) return;
                const renderedLeft = scaleForZoom(toNumber(tokenEl.dataset.worldLeft, 0));
                const renderedTop = scaleForZoom(toNumber(tokenEl.dataset.worldTop, 0));
                tokenEl.style.left = '0px';
                tokenEl.style.top = '0px';
                tokenEl.style.transform = `translate3d(${renderedLeft}px, ${renderedTop}px, 0)`;
                tokenEl.style.width = `${scaleForZoom(toNumber(tokenEl.dataset.worldWidth, 0))}px`;
                tokenEl.style.height = `${scaleForZoom(toNumber(tokenEl.dataset.worldHeight, 0))}px`;
                tokenEl.style.setProperty('--vtt-token-font-scale', String(clamp(localView.zoom, 0.9, 1.9)));
            });
        };

        const renderStageGrid = (scene = getActiveScene()) => {
            const { stageGridEl } = dom;
            if (!stageGridEl || !scene || !scene.grid) return;
            const cellSize = Math.max(8, Math.round(scene.grid.cellPx * localView.zoom * 1000) / 1000);
            const offsetX = positiveModulo(localView.x + scene.grid.offsetX * localView.zoom, cellSize);
            const offsetY = positiveModulo(localView.y + scene.grid.offsetY * localView.zoom, cellSize);
            stageGridEl.style.backgroundSize = `${cellSize}px ${cellSize}px`;
            stageGridEl.style.backgroundPosition = `${offsetX}px ${offsetY}px`;
        };

        const applyWorldTransform = (scene = getActiveScene()) => {
            const { mapWorldEl, worldEl, zoomResetEls = [] } = dom;
            zoomResetEls.forEach((zoomEl) => {
                if (zoomEl) zoomEl.textContent = `${Math.round(localView.zoom * 100)}%`;
            });
            if (mapWorldEl) mapWorldEl.style.transform = `translate(${localView.x}px, ${localView.y}px)`;
            if (!worldEl) return;
            worldEl.style.transform = `translate(${localView.x}px, ${localView.y}px)`;
            renderStageGrid(scene);
        };

        const setZoomAtPoint = (nextZoom, clientX, clientY) => {
            const { stageEl } = dom;
            if (!stageEl) return;
            const rect = stageEl.getBoundingClientRect();
            if (!rect.width || !rect.height) return;
            const clampedZoom = clampZoom(nextZoom);
            const stageX = clientX - rect.left;
            const stageY = clientY - rect.top;
            const worldX = (stageX - localView.x) / localView.zoom;
            const worldY = (stageY - localView.y) / localView.zoom;
            localView.zoom = clampedZoom;
            localView.x = Math.round(stageX - worldX * clampedZoom);
            localView.y = Math.round(stageY - worldY * clampedZoom);
            applyRenderedWorldGeometry();
            applyWorldTransform();
        };

        const setZoomAroundStageCenter = (nextZoom) => {
            const { stageEl } = dom;
            if (!stageEl) return;
            const rect = stageEl.getBoundingClientRect();
            setZoomAtPoint(nextZoom, rect.left + rect.width / 2, rect.top + rect.height / 2);
        };

        const fitViewToWorld = () => {
            const { stageEl } = dom;
            if (!stageEl) return;
            const rect = stageEl.getBoundingClientRect();
            if (!rect.width || !rect.height) return;
            const padding = 36;
            const zoom = clamp(
                Math.min(
                    (rect.width - padding * 2) / Math.max(1, worldSize.width),
                    (rect.height - padding * 2) / Math.max(1, worldSize.height)
                ),
                0.25,
                1.8
            );
            localView.zoom = zoom;
            localView.x = Math.round((rect.width - worldSize.width * zoom) / 2);
            localView.y = Math.round((rect.height - worldSize.height * zoom) / 2);
            applyRenderedWorldGeometry();
            applyWorldTransform();
        };

        const focusViewOnToken = (token, scene = getActiveScene()) => {
            const { stageEl } = dom;
            if (!stageEl || !token || !scene || !scene.grid) return false;
            const rect = stageEl.getBoundingClientRect();
            if (!rect.width || !rect.height) return false;
            const cellPx = getSceneCellPx(scene);
            const centerX = toNumber(scene.grid.offsetX, 0) + (toNumber(token.x, 0) + Math.max(1, toNumber(token.w, 1)) / 2) * cellPx;
            const centerY = toNumber(scene.grid.offsetY, 0) + (toNumber(token.y, 0) + Math.max(1, toNumber(token.h, 1)) / 2) * cellPx;
            localView.x = Math.round(rect.width / 2 - centerX * localView.zoom);
            localView.y = Math.round(rect.height / 2 - centerY * localView.zoom);
            applyRenderedWorldGeometry(scene);
            applyWorldTransform(scene);
            return true;
        };

        const screenToWorld = (clientX, clientY) => {
            const rect = dom.stageEl.getBoundingClientRect();
            return {
                x: (clientX - rect.left - localView.x) / localView.zoom,
                y: (clientY - rect.top - localView.y) / localView.zoom
            };
        };

        const worldToScreen = (worldPoint = {}) => {
            const rect = dom.stageEl ? dom.stageEl.getBoundingClientRect() : { left: 0, top: 0 };
            return {
                x: rect.left + localView.x + toNumber(worldPoint.x, 0) * localView.zoom,
                y: rect.top + localView.y + toNumber(worldPoint.y, 0) * localView.zoom
            };
        };

        const isClientPointInsideStage = (clientX, clientY) => {
            if (!dom.stageEl) return false;
            const rect = dom.stageEl.getBoundingClientRect();
            return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
        };

        const loadMapForScene = (scene) => {
            const { mapImageEl } = dom;
            if (!scene || !mapImageEl) return;
            if (!scene.mapImageUrl) {
                mapSize = { width: 0, height: 0 };
                mapLoadState = { url: '', loaded: false };
                setWorldSize(getWorldSizeForScene(scene));
                mapImageEl.removeAttribute('src');
                mapImageEl.style.width = '0px';
                mapImageEl.style.height = '0px';
                mapImageEl.style.display = 'none';
                if (getFitViewOnNextMapLoad()) {
                    setFitViewOnNextMapLoad(false);
                    fitViewToWorld();
                }
                return;
            }

            const requestedUrl = getUsableMediaUrl(scene.mapImageUrl);
            if (!requestedUrl) {
                mapSize = { width: 0, height: 0 };
                mapLoadState = { url: String(scene.mapImageUrl || ''), loaded: false };
                setWorldSize(getWorldSizeForScene(scene));
                mapImageEl.removeAttribute('src');
                mapImageEl.style.width = '0px';
                mapImageEl.style.height = '0px';
                mapImageEl.style.display = 'none';
                return;
            }

            if (mapLoadState.url === requestedUrl) return;

            mapSize = { width: 0, height: 0 };
            mapLoadState = { url: requestedUrl, loaded: false };
            mapImageEl.src = requestedUrl;
            mapImageEl.style.display = 'none';
            const probe = new root.Image();
            probe.onload = () => {
                if (root.RTF_MEDIA_CACHE && typeof root.RTF_MEDIA_CACHE.rememberSuccess === 'function') {
                    root.RTF_MEDIA_CACHE.rememberSuccess(requestedUrl);
                }
                const { vttState } = getStageState();
                if (!vttState) return;
                const active = getActiveScene();
                if (!active || getUsableMediaUrl(active.mapImageUrl) !== requestedUrl) return;
                mapSize = {
                    width: Math.max(1, Math.round(probe.naturalWidth || 1)),
                    height: Math.max(1, Math.round(probe.naturalHeight || 1))
                };
                mapLoadState = { url: requestedUrl, loaded: true };
                setWorldSize(getWorldSizeForScene(active));
                mapImageEl.style.display = 'block';
                if (getFitViewOnNextMapLoad()) {
                    setFitViewOnNextMapLoad(false);
                    fitViewToWorld();
                }
                renderStage();
            };
            probe.onerror = () => {
                if (root.RTF_MEDIA_CACHE && typeof root.RTF_MEDIA_CACHE.rememberFailure === 'function') {
                    root.RTF_MEDIA_CACHE.rememberFailure(requestedUrl);
                }
                const active = getActiveScene();
                if (!active || getUsableMediaUrl(active.mapImageUrl) !== requestedUrl) return;
                mapSize = { width: 0, height: 0 };
                setWorldSize(getWorldSizeForScene(active));
                mapLoadState = { url: requestedUrl, loaded: false };
                mapImageEl.removeAttribute('src');
                mapImageEl.style.width = '0px';
                mapImageEl.style.height = '0px';
                mapImageEl.style.display = 'none';
                if (getFitViewOnNextMapLoad()) {
                    setFitViewOnNextMapLoad(false);
                    fitViewToWorld();
                }
                renderStage();
            };
            probe.src = requestedUrl;
        };

        const buildVisionConeMarkup = (token, scene, sceneSize = worldSize, now = Date.now()) => {
            const state = getStageState();
            const renderedToken = getRenderableVisionToken(token, scene, now);
            return markup.buildVisionConeMarkup(token, scene, sceneSize, {
                renderedToken,
                state: state.vttState,
                visionConeRotateState: state.visionConeRotateState,
                selectedTokenId: state.selectedTokenId,
                canMoveToken: canRoleMoveToken(token)
            });
        };

        const buildVisionConeHandleMarkup = (token, scene, sceneSize = worldSize, now = Date.now()) => {
            const state = getStageState();
            return markup.buildVisionConeHandleMarkup(token, scene, sceneSize, {
                renderedToken: getRenderableVisionToken(token, scene, now),
                isDM: !!state.isDM,
                selectedTokenId: state.selectedTokenId,
                zoom: localView.zoom
            });
        };

        const buildPingMarkup = (ping, scene) => {
            const askRollRequest = getAskRollRequestFromPing(ping);
            return markup.buildPingMarkup(ping, scene, {
                askRollRequest,
                canRoll: canLocalRollAskRollRequest(askRollRequest),
                canCancel: canLocalCancelAskRollRequest(askRollRequest)
            });
        };

        const buildEvidenceNoteMarkup = (note, scene, options = {}) => (
            markup.buildEvidenceNoteMarkup(note, scene, {
                ...options,
                activeProximityPrompt: getStageState().activeProximityPrompt
            })
        );

        const renderVisionLayer = (scene, visibleTokens, sceneSize = worldSize, now = Date.now()) => {
            const { visionLayerEl } = dom;
            if (!visionLayerEl) return false;
            const showStealthCones = !!(scene && scene.stealthMode);
            const handleMarkup = showStealthCones
                ? visibleTokens
                    .filter((token) => {
                        const side = String(token && token.side || '').trim().toLowerCase();
                        return side === 'enemy' || side === 'neutral';
                    })
                    .map((token) => buildVisionConeHandleMarkup(token, scene, sceneSize, now))
                    .join('')
                : '';
            const pingMarkup = getRenderableScenePings(scene, now).map((ping) => buildPingMarkup(ping, scene)).join('');
            const changed = commitLayerMarkup(visionLayerEl, `${handleMarkup}${pingMarkup}`);
            schedulePingExpiryRender(scene);
            return changed;
        };

        const renderTemplateLayer = (scene, visibleTokens, sceneSize = worldSize, now = Date.now()) => {
            const { templateLayerEl } = dom;
            if (!templateLayerEl) return false;
            const state = getStageState();
            const showStealthCones = !!(scene && scene.stealthMode);
            const visibleTemplates = getRenderableSceneTemplates(scene);
            const visionMarkup = showStealthCones
                ? visibleTokens
                    .filter((token) => {
                        const side = String(token && token.side || '').trim().toLowerCase();
                        return side === 'enemy' || side === 'neutral';
                    })
                    .map((token) => buildVisionConeMarkup(token, scene, sceneSize, now))
                    .join('')
                : '';
            const templateMarkup = visibleTemplates.map((template) => markup.buildAreaTemplateMarkup(template, scene, { transient: true })).join('');
            const previewMarkup = state.templatePlacementState && state.templatePlacementState.sceneId === scene.id && state.templatePlacementState.template
                ? markup.buildAreaTemplateMarkup(state.templatePlacementState.template, scene, { preview: true })
                : '';
            const rulerMarkup = markup.buildRulerMarkup(scene, state.rulerState);
            const changed = commitLayerMarkup(templateLayerEl, `${visionMarkup}${templateMarkup}${previewMarkup}${rulerMarkup}`);
            scheduleTemplateExpiryRender(scene);
            return changed;
        };

        const buildTokenClassName = (options = {}) => {
            const state = getStageState();
            const token = options.token;
            const stealthStatus = String(options.stealthStatus || '').trim();
            const classes = ['vtt-token'];
            if (options.usableImageUrl) classes.push('has-image');
            if (options.moodEmoji) classes.push('has-mood-corner');
            if (token && token.id === state.selectedTokenId) classes.push('is-selected');
            if (token && token.id === options.focusedEntryTokenId) classes.push('is-entry-linked');
            if (token && token.id === options.activeTurnTokenId) classes.push('is-active-turn');
            if (options.isHiddenToPlayers) classes.push('is-hidden');
            if (token && token.id === state.previewTokenId) classes.push('is-preview-open');
            if (token && state.dragState && String(state.dragState.tokenId || '').trim() === String(token.id || '').trim()) classes.push('is-dragging');
            if (state.activeProximityPrompt && state.activeProximityPrompt.sourceKind === 'token' && token && String(state.activeProximityPrompt.sourceId || '').trim() === String(token.id || '').trim()) {
                classes.push('is-proximity-source');
            }
            if (options.visualEffectKind) classes.push(`is-${options.visualEffectKind}`);
            if (stealthStatus === stealthStatusDetected) classes.push('is-stealth-detected');
            if (stealthStatus === stealthStatusUnseen) classes.push('is-stealth-unseen');
            return classes.join(' ');
        };

        const renderTokenStableContent = (tokenEl, token, usableImageUrl, moodEmoji, moodText) => {
            const label = String(token && token.label || 'Token');
            const initials = buildInitials(label);
            const signature = JSON.stringify({
                image: usableImageUrl || '',
                label,
                initials,
                moodEmoji: moodEmoji || '',
                moodText: moodText || ''
            });
            if (tokenEl.dataset.renderSignature === signature) return;
            tokenEl.innerHTML = `
                <div class="vtt-token-corona"></div>
                <div class="vtt-token-face">
                    ${usableImageUrl ? `<img class="vtt-token-image" src="${escapeHtml(usableImageUrl)}" alt="${escapeHtml(label)}" draggable="false" decoding="async">` : `<div class="vtt-token-initials">${escapeHtml(initials)}</div>`}
                </div>
                ${moodEmoji ? `<div class="vtt-token-mood-corner">${escapeHtml(moodEmoji)}</div>` : ''}
                <div class="vtt-token-subtitle">${escapeHtml(label)}</div>
            `;
            tokenEl.dataset.renderSignature = signature;
        };

        const renderTokenLayer = (scene, visibleTokens, focusedEntryTokenId, activeTurnTokenId, stealthStatusMap, renderTime, fogCellSet = null) => {
            const { tokenLayerEl } = dom;
            if (!tokenLayerEl || !scene || !scene.grid) return false;
            let geometryChanged = false;
            const tokenElements = new Map();
            Array.from(tokenLayerEl.children).forEach((tokenEl) => {
                if (!(tokenEl instanceof root.HTMLElement) || !tokenEl.classList.contains('vtt-token')) return;
                const tokenId = String(tokenEl.dataset.tokenId || '').trim();
                if (tokenId) tokenElements.set(tokenId, tokenEl);
            });
            const liveIds = new Set();
            visibleTokens.forEach((token) => {
                const tokenId = String(token && token.id || '').trim();
                if (tokenId) liveIds.add(tokenId);
            });
            tokenElements.forEach((tokenEl, tokenId) => {
                if (!liveIds.has(tokenId)) {
                    tokenEl.remove();
                    tokenElements.delete(tokenId);
                    geometryChanged = true;
                }
            });

            let nextTokenEl = tokenLayerEl.firstElementChild;
            visibleTokens.forEach((token) => {
                const tokenId = String(token && token.id || '').trim();
                if (!tokenId) return;
                const renderedCells = getRenderableTokenCells(token, scene, renderTime);
                const usableImageUrl = getTokenImageRenderUrl(token);
                const stealthStatus = String(stealthStatusMap.get(token.id) || '').trim();
                const isBloodied = isTokenBloodied(token);
                const isHiddenToPlayers = !!token.hidden || geometry.isTokenUnderFog(scene, token, fogCellSet);
                const moodEmoji = normalizeMoodEmoji(token && token.moodEmoji);
                const moodText = getTokenMoodText(token);
                const currentHp = Number(token && token.hpCurrent);
                const previousHp = tokenHpSnapshot.get(tokenId);
                if (Number.isFinite(currentHp)) {
                    if (Number.isFinite(previousHp) && currentHp !== previousHp) {
                        markTokenVisualEffect(tokenId, currentHp < previousHp ? 'damage-flash' : 'heal-flash', tokenHpFlashMs);
                    }
                    tokenHpSnapshot.set(tokenId, currentHp);
                } else {
                    tokenHpSnapshot.delete(tokenId);
                }
                const visualEffectKind = getTokenVisualEffectKind(tokenId, renderTime);
                let tokenEl = tokenElements.get(tokenId);
                if (!tokenEl) {
                    tokenEl = root.document.createElement('div');
                    geometryChanged = true;
                }
                if (tokenEl !== nextTokenEl) tokenLayerEl.insertBefore(tokenEl, nextTokenEl);
                nextTokenEl = tokenEl.nextElementSibling;
                const className = buildTokenClassName({
                    token,
                    usableImageUrl,
                    moodEmoji,
                    focusedEntryTokenId,
                    activeTurnTokenId,
                    isHiddenToPlayers,
                    stealthStatus,
                    visualEffectKind
                });
                const canMove = canRoleMoveToken(token);
                const sideLabel = String(token.side || 'neutral');
                const ariaLabel = `${String(token.label || 'Token')}, ${sideLabel}. ${canMove ? 'Movable.' : 'Movement locked.'} Right-click for actions.`;
                const worldLeft = String(scene.grid.offsetX + renderedCells.x * scene.grid.cellPx);
                const worldTop = String(scene.grid.offsetY + renderedCells.y * scene.grid.cellPx);
                const worldWidth = String(token.w * scene.grid.cellPx);
                const worldHeight = String(token.h * scene.grid.cellPx);
                if (
                    tokenEl.dataset.worldLeft !== worldLeft
                    || tokenEl.dataset.worldTop !== worldTop
                    || tokenEl.dataset.worldWidth !== worldWidth
                    || tokenEl.dataset.worldHeight !== worldHeight
                ) geometryChanged = true;
                const stateSignature = JSON.stringify({
                    className,
                    tokenId,
                    side: token.side || 'neutral',
                    ariaLabel,
                    stealthStatus,
                    bloodied: isBloodied ? '1' : '0',
                    worldLeft,
                    worldTop,
                    worldWidth,
                    worldHeight,
                    damage: String(getTokenDamageFraction(token))
                });
                if (tokenEl.dataset.stateSignature !== stateSignature) {
                    tokenEl.className = className;
                    tokenEl.dataset.tokenId = tokenId;
                    tokenEl.dataset.id = tokenId;
                    tokenEl.dataset.action = 'select-token';
                    tokenEl.setAttribute('role', 'button');
                    tokenEl.tabIndex = 0;
                    tokenEl.dataset.side = token.side || 'neutral';
                    tokenEl.setAttribute('aria-label', ariaLabel);
                    tokenEl.dataset.stealthStatus = stealthStatus;
                    tokenEl.dataset.bloodied = isBloodied ? '1' : '0';
                    tokenEl.dataset.worldLeft = worldLeft;
                    tokenEl.dataset.worldTop = worldTop;
                    tokenEl.dataset.worldWidth = worldWidth;
                    tokenEl.dataset.worldHeight = worldHeight;
                    tokenEl.style.setProperty('--vtt-token-damage', String(getTokenDamageFraction(token)));
                    tokenEl.dataset.stateSignature = stateSignature;
                }
                renderTokenStableContent(tokenEl, token, usableImageUrl, moodEmoji, moodText);
            });
            return geometryChanged;
        };

        renderTokenMotionFrame = (renderTime = Date.now()) => {
            const scene = getActiveScene();
            const { tokenLayerEl, proximityPromptStackEl } = dom;
            if (!scene || !scene.grid || !tokenLayerEl) return;
            if (scene.stealthMode) {
                renderStage();
                return;
            }
            const tokensById = new Map((Array.isArray(scene.tokens) ? scene.tokens : [])
                .filter(Boolean)
                .map((token) => [String(token.id || ''), token]));
            const tokenElements = new Map(Array.from(tokenLayerEl.children)
                .filter((tokenEl) => tokenEl instanceof root.HTMLElement && tokenEl.classList.contains('vtt-token'))
                .map((tokenEl) => [String(tokenEl.dataset.tokenId || ''), tokenEl]));
            remoteTokenTweens.forEach((tween) => {
                if (!tween || tween.sceneId !== scene.id) return;
                const token = tokensById.get(String(tween.tokenId || ''));
                if (!token) return;
                const tokenEl = tokenElements.get(String(token.id || ''));
                if (!(tokenEl instanceof root.HTMLElement)) return;
                const renderedCells = getRenderableTokenCells(token, scene, renderTime);
                const worldLeft = scene.grid.offsetX + renderedCells.x * scene.grid.cellPx;
                const worldTop = scene.grid.offsetY + renderedCells.y * scene.grid.cellPx;
                tokenEl.dataset.worldLeft = String(worldLeft);
                tokenEl.dataset.worldTop = String(worldTop);
                tokenEl.style.left = '0px';
                tokenEl.style.top = '0px';
                tokenEl.style.transform = `translate3d(${scaleForZoom(worldLeft)}px, ${scaleForZoom(worldTop)}px, 0)`;
            });
            if (proximityPromptStackEl && !proximityPromptStackEl.hidden) positionProximityPrompt(scene);
        };

        renderStage = () => {
            const state = getStageState();
            if (state.initialVTTLoadPending) return;
            const renderTime = Date.now();
            pruneVisualEffects(renderTime);
            const scene = getActiveScene();
            const {
                mapWorldEl,
                worldEl,
                stageEmptyEl,
                mapImageEl,
                gridLayerEl,
                fogLayerEl,
                noteLayerEl,
                templateLayerEl,
                tokenLayerEl,
                visionLayerEl
            } = dom;
            if (!scene || !mapWorldEl || !worldEl || !gridLayerEl || !fogLayerEl || !noteLayerEl || !templateLayerEl || !tokenLayerEl || !visionLayerEl) return;

            loadMapForScene(scene);
            setWorldSize(getWorldSizeForScene(scene));
            const mapDisplaySize = getLoadedMapSizeForScene(scene);
            mapImageEl.style.display = mapDisplaySize.width && mapDisplaySize.height ? 'block' : 'none';

            const fogRenderData = getFogRenderData(scene);
            const fogCellSet = fogRenderData.cellSet;

            evaluateProximityTriggers();

            const fogEdgeMarkup = fogRenderData.edgeMarkup;
            const fogPreviewMarkup = state.fogPlacementState && state.fogPlacementState.sceneId === scene.id && state.fogPlacementState.mask
                ? geometry.buildFogMaskMarkup(scene, state.fogPlacementState.mask, state.fogPlacementState.mode === 'remove' ? 'is-remove-preview' : 'is-preview')
                : '';
            const fogRevealMarkup = buildFogRevealShimmerMarkup(renderTime);
            const fogChanged = commitLayerMarkup(fogLayerEl, `${fogEdgeMarkup}${fogPreviewMarkup}${fogRevealMarkup}`);

            const derived = getSceneDerivedData(scene, state.localRole, fogCellSet, fogRenderData.signature, state.vttState);
            const visibleEvidenceNotes = derived.visibleEvidenceNotes;
            const evidenceMarkup = visibleEvidenceNotes
                .map((note) => buildEvidenceNoteMarkup(note, scene, { selected: note.id === state.selectedEvidenceNoteId }))
                .join('');
            const evidencePreviewMarkup = state.evidenceNotePlacementState && state.evidenceNotePlacementState.sceneId === scene.id && state.evidenceNotePlacementState.note
                ? buildEvidenceNoteMarkup(state.evidenceNotePlacementState.note, scene, { preview: true, selected: true })
                : '';
            const notesChanged = commitLayerMarkup(noteLayerEl, `${evidenceMarkup}${evidencePreviewMarkup}`);

            const visibleTokens = derived.visibleTokens;
            if (stageEmptyEl) {
                const isEmptyScene = !String(scene.mapImageUrl || '').trim()
                    && visibleTokens.length === 0
                    && visibleEvidenceNotes.length === 0;
                stageEmptyEl.hidden = !isEmptyScene;
                stageEmptyEl.textContent = state.isDM
                    ? 'This scene is empty. Open Menu, then Setup to add a map, or use Spawn to place a token.'
                    : (state.localRole === 'spectator'
                        ? 'Waiting for the GM to share the scene.'
                        : 'Waiting for the GM to share a map or place a visible token.');
            }
            const initiative = state.vttState && state.vttState.initiative ? state.vttState.initiative : { activeEntryId: '' };
            const activeTurnToken = getVisibleSceneTokenForEntry(getEntryById(initiative.activeEntryId), state.vttState, state.localRole);
            const focusedEntryToken = getVisibleSceneTokenForEntry(getEntryById(state.selectedEntryId), state.vttState, state.localRole);
            const activeTurnTokenId = activeTurnToken ? activeTurnToken.id : '';
            const focusedEntryTokenId = focusedEntryToken ? focusedEntryToken.id : '';
            const stealthStatusMap = derived.stealthStatusMap;

            const templatesChanged = renderTemplateLayer(scene, visibleTokens, worldSize, renderTime);
            const tokensChanged = renderTokenLayer(scene, visibleTokens, focusedEntryTokenId, activeTurnTokenId, stealthStatusMap, renderTime, fogCellSet);
            const visionChanged = renderVisionLayer(scene, visibleTokens, worldSize, renderTime);

            applyRenderedWorldGeometry(scene, {
                fog: fogChanged,
                notes: notesChanged,
                templates: templatesChanged,
                tokens: tokensChanged,
                vision: visionChanged
            });
            if (hasActiveSceneRemoteTweens(scene.id, renderTime)) scheduleRemoteTokenTweenRender();
            if (getFitViewOnNextMapLoad() && scene.mapImageUrl && mapLoadState.url === scene.mapImageUrl && mapLoadState.loaded) {
                setFitViewOnNextMapLoad(false);
                fitViewToWorld();
            } else {
                applyWorldTransform(scene);
            }
            renderProximityPrompt();
        };

        const destroy = () => {
            if (templateExpiryTimer) root.clearTimeout(templateExpiryTimer);
            if (pingExpiryTimer) root.clearTimeout(pingExpiryTimer);
            if (visualEffectTimer) root.clearTimeout(visualEffectTimer);
            if (remoteTokenTweenFrame) root.cancelAnimationFrame(remoteTokenTweenFrame);
            templateExpiryTimer = 0;
            pingExpiryTimer = 0;
            visualEffectTimer = 0;
            remoteTokenTweenFrame = 0;
        };

        return Object.freeze({
            localView,
            worldSize,
            remoteTokenTweens,
            addFogRevealBurst,
            applyRenderedWorldGeometry,
            applyWorldTransform,
            buildRemoteTokenTweenKey,
            destroy,
            fitViewToWorld,
            focusViewOnToken,
            getLoadedMapSizeForScene,
            getRecentLocalDragDrop,
            getRenderableTokenCells,
            getWorldSizeForScene,
            isClientPointInsideStage,
            markTokenVisualEffect,
            queueRemoteTokenTween,
            queueRemoteTweensFromSnapshots,
            reconcileSnapshotWithRecentLocalDragDrops,
            rememberRecentLocalDragDrop,
            renderStage,
            scaleForZoom,
            screenToWorld,
            setZoomAroundStageCenter,
            setZoomAtPoint,
            suppressLocalDragTween,
            worldToScreen
        });
    };

    return Object.freeze({
        REQUIRED_FUNCTION_DEPENDENCIES,
        create
    });
}));
