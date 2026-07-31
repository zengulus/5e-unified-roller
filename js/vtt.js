(function () {
    const Dice = window.RTF_DICE;
    if (!Dice) throw new Error('Shared dice engine failed to load.');
    const vttConfig = window.RTF_VTT_CONFIG;
    if (!vttConfig || !vttConfig.constants || typeof vttConfig.createDefaultVTTState !== 'function') {
        throw new Error('VTT configuration module failed to load.');
    }
    const C = vttConfig.constants;
    const TOOL_MODE_DRAW = 'draw';
    const vttSessionModuleReady = import('./vtt-session.js?v=20260718d')
        .then(() => window.RTF_VTT_SESSION || null)
        .catch((err) => {
            console.warn('VTT session module failed to load', err);
            return null;
        });
    const reportVTTError = (operation, category, error) => {
        const report = {
            ok: false,
            operation,
            category,
            message: error && error.message ? error.message : String(error),
            timestamp: new Date().toISOString()
        };
        console.error('RTF_OPERATION_ERROR', report, error);
        window.dispatchEvent(new CustomEvent('rtf-operation-error', { detail: report }));
        return report;
    };
    const runtimeStateFactory = window.RTF_VTT_RUNTIME_STATE;
    if (!runtimeStateFactory || typeof runtimeStateFactory.create !== 'function') {
        throw new Error('VTT runtime state module failed to load.');
    }
    const runtimeState = runtimeStateFactory.create({
        defaultWorldSize: C.DEFAULT_WORLD_SIZE,
        sceneViewMode: C.SCENE_VIEW_SHARED,
        toolMode: C.TOOL_MODE_NAVIGATE,
        toolSizeCells: C.DEFAULT_TOOL_SIZE_CELLS
    });
    const {
        session: sessionState,
        stage: stageState,
        ui: uiRuntime,
        resources
    } = runtimeState;
    const requireStageView = () => {
        if (!resources.stageView) throw new Error('VTT stage view is not initialized.');
        return resources.stageView;
    };
    const requireStageInput = () => {
        if (!resources.stageInput) throw new Error('VTT stage input is not initialized.');
        return resources.stageInput;
    };
    const addFogRevealBurst = (...args) => requireStageView().addFogRevealBurst(...args);
    const applyRenderedWorldGeometry = (...args) => requireStageView().applyRenderedWorldGeometry(...args);
    const applyWorldTransform = (...args) => requireStageView().applyWorldTransform(...args);
    const buildRemoteTokenTweenKey = (...args) => requireStageView().buildRemoteTokenTweenKey(...args);
    const fitViewToWorld = (...args) => requireStageView().fitViewToWorld(...args);
    const focusViewOnToken = (...args) => requireStageView().focusViewOnToken(...args);
    const getRecentLocalDragDrop = (...args) => requireStageView().getRecentLocalDragDrop(...args);
    const getRenderableTokenCells = (...args) => requireStageView().getRenderableTokenCells(...args);
    const getWorldSizeForScene = (...args) => requireStageView().getWorldSizeForScene(...args);
    const isClientPointInsideStage = (...args) => requireStageView().isClientPointInsideStage(...args);
    const markTokenVisualEffect = (...args) => requireStageView().markTokenVisualEffect(...args);
    const previewTokenPositions = (...args) => requireStageView().previewTokenPositions(...args);
    const queueRemoteTokenTween = (...args) => requireStageView().queueRemoteTokenTween(...args);
    const queueRemoteTweensFromSnapshots = (...args) => requireStageView().queueRemoteTweensFromSnapshots(...args);
    const reconcileSnapshotWithRecentLocalDragDrops = (...args) => requireStageView().reconcileSnapshotWithRecentLocalDragDrops(...args);
    const rememberRecentLocalDragDrop = (...args) => requireStageView().rememberRecentLocalDragDrop(...args);
    const renderStage = (...args) => requireStageView().renderStage(...args);
    const scaleForZoom = (...args) => requireStageView().scaleForZoom(...args);
    const screenToWorld = (...args) => requireStageView().screenToWorld(...args);
    const setZoomAroundStageCenter = (...args) => requireStageView().setZoomAroundStageCenter(...args);
    const setZoomAtPoint = (...args) => requireStageView().setZoomAtPoint(...args);
    const suppressLocalDragTween = (...args) => requireStageView().suppressLocalDragTween(...args);
    const worldToScreen = (...args) => requireStageView().worldToScreen(...args);
    const vttDomFactory = window.RTF_VTT_DOM;
    if (!vttDomFactory || typeof vttDomFactory.create !== 'function') {
        throw new Error('VTT DOM registry module failed to load.');
    }
    const dom = vttDomFactory.create(document);
    const blackMoonFactory = window.RTF_VTT_BLACK_MOON;
    if (!blackMoonFactory || typeof blackMoonFactory.create !== 'function') {
        throw new Error('Black Moon Howl presentation module failed to load.');
    }
    const blackMoonController = blackMoonFactory.create({ document, window });
    let activeBlackMoonRun = null;
    let blackMoonBroadcastPending = false;

    const escapeHtml = (value = '') => String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    const deepClone = (value) => JSON.parse(JSON.stringify(value));
    const toNumber = (value, fallback = 0) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    };
    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
    const hasValue = (value) => value !== null && value !== undefined && value !== '';
    const clampMapScale = (value, fallback = 1) => {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) return clamp(Math.round(fallback * 1000) / 1000, C.MIN_VTT_MAP_SCALE, C.MAX_VTT_MAP_SCALE);
        return clamp(Math.round(parsed * 1000) / 1000, C.MIN_VTT_MAP_SCALE, C.MAX_VTT_MAP_SCALE);
    };
    const normalizeTokenCoordinate = (value, fallback = 0) => {
        const parsed = toNumber(value, fallback);
        return Math.max(0, Math.round(parsed * C.TOKEN_COORD_PRECISION) / C.TOKEN_COORD_PRECISION);
    };
    const normalizeGridCoordinate = (value, fallback = 0) => {
        const parsed = toNumber(value, fallback);
        return Math.max(0, Math.round(parsed * C.TOKEN_COORD_PRECISION) / C.TOKEN_COORD_PRECISION);
    };
    const normalizeWorldCoordinate = (value, fallback = 0) => {
        const parsed = toNumber(value, fallback);
        return Math.round(parsed * C.TOKEN_COORD_PRECISION) / C.TOKEN_COORD_PRECISION;
    };
    const snapTokenCoordinate = (value, fallback = 0) => {
        const safe = normalizeTokenCoordinate(value, fallback);
        const base = Math.floor(safe);
        return safe - base > 0.5 ? base + 1 : base;
    };
    const clampZoom = (value) => clamp(Math.round(value * 1000) / 1000, 0.25, 2.2);
    const positiveModulo = (value, divisor) => {
        if (!divisor) return 0;
        const result = value % divisor;
        return result < 0 ? result + divisor : result;
    };
    const toImageUrl = (value) => {
        const raw = String(value || '').trim();
        if (!raw) return '';
        if (/^data:image\//i.test(raw)) return raw;
        try {
            return new URL(raw, window.location.href).toString();
        } catch (err) {
            return '';
        }
    };
    const toSharedTokenImageUrl = (value) => {
        const raw = toImageUrl(value);
        if (!raw) return '';
        return /^https?:\/\//i.test(raw) || /^data:image\//i.test(raw) ? raw : '';
    };
    const getUsableMediaUrl = (value) => {
        const raw = toImageUrl(value);
        if (!raw) return '';
        if (window.RTF_MEDIA_CACHE && typeof window.RTF_MEDIA_CACHE.getUsableUrl === 'function') {
            return window.RTF_MEDIA_CACHE.getUsableUrl(raw);
        }
        return raw;
    };
    const appendTokenImageRetryKey = (value, retryKey) => {
        const raw = toImageUrl(value);
        const key = String(retryKey || '').trim();
        if (!raw || !key || /^data:image\//i.test(raw)) return raw;
        try {
            const parsed = new URL(raw, window.location.href);
            parsed.searchParams.set('rtfTokenRetry', key);
            return parsed.toString();
        } catch (err) {
            return raw;
        }
    };
    const getTokenImageRenderUrl = (token) => {
        if (!token) return '';
        const retryKey = resources.tokenImageRetryKeys.get(String(token.id || '').trim()) || '';
        return getUsableMediaUrl(appendTokenImageRetryKey(getCanonicalTokenImageUrl(token), retryKey));
    };
    const trimTrailingSlashes = (value = '') => String(value || '').replace(/\/+$/, '');
    const randomIntInclusive = (min, max) => {
        const safeMin = Math.min(min, max);
        const safeMax = Math.max(min, max);
        return Math.floor(Math.random() * (safeMax - safeMin + 1)) + safeMin;
    };
    const getConfiguredSupabaseUrl = () => {
        const store = getStore();
        if (!store || typeof store.getSyncConfig !== 'function') return '';
        const config = store.getSyncConfig();
        return trimTrailingSlashes(config && config.supabaseUrl ? config.supabaseUrl : '');
    };
    const buildSupabasePublicObjectUrl = (bucket, assetPath) => {
        const baseUrl = getConfiguredSupabaseUrl();
        const cleanBucket = String(bucket || '').trim().replace(/^\/+|\/+$/g, '');
        const cleanPath = String(assetPath || '').trim().replace(/^\/+/, '');
        if (!baseUrl || !cleanBucket || !cleanPath) return '';
        try {
            return new URL(`/storage/v1/object/public/${cleanBucket}/${cleanPath}`, `${baseUrl}/`).toString();
        } catch (err) {
            return '';
        }
    };
    const buildGuildlessImageUrl = () => {
        const imageNumber = randomIntInclusive(C.GUILDLESS_TOKEN_MIN, C.GUILDLESS_TOKEN_MAX);
        return buildSupabasePublicObjectUrl(C.GUILDLESS_TOKEN_BUCKET, `${C.GUILDLESS_TOKEN_FOLDER}/${imageNumber}.png`);
    };
    const buildId = (prefix) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const buildInitials = (label = '') => {
        const words = String(label || '').trim().split(/\s+/).filter(Boolean);
        if (!words.length) return '?';
        return words.slice(0, 2).map((word) => word.charAt(0).toUpperCase()).join('');
    };
    const toTitleCaseWords = (value = '') => String(value || '').replace(/\w\S*/g, (word) =>
        word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    );
    const normalizeSearchText = (value = '') => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const normalizeMusicTension = (value, fallback = 'passive') => {
        const clean = String(value || '').trim().toLowerCase();
        if (C.MUSIC_TENSION_LEVELS.includes(clean)) return clean;
        return C.MUSIC_TENSION_LEVELS.includes(fallback) ? fallback : 'passive';
    };
    const normalizeOptionalMusicTension = (value) => {
        const clean = String(value || '').trim().toLowerCase();
        return C.MUSIC_TENSION_LEVELS.includes(clean) ? clean : '';
    };
    const normalizeYouTubeUrl = (value) => {
        const raw = String(value || '').trim();
        if (!raw) return '';
        try {
            const parsed = new URL(raw, window.location.href);
            const host = parsed.hostname.replace(/^www\./i, '').toLowerCase();
            if (host === 'youtu.be' || host.endsWith('.youtu.be')) return parsed.toString();
            if (host === 'youtube.com' || host.endsWith('.youtube.com')) return parsed.toString();
        } catch (err) {
            return '';
        }
        return '';
    };
    const normalizeSceneMusic = (music) => {
        const source = music && typeof music === 'object' ? music : {};
        const sourceTracks = source.tracks && typeof source.tracks === 'object' ? source.tracks : {};
        const sourceTitles = source.titles && typeof source.titles === 'object' ? source.titles : {};
        const tracks = {};
        const titles = {};
        C.MUSIC_TENSION_LEVELS.forEach((level) => {
            const trackValue = Object.prototype.hasOwnProperty.call(sourceTracks, level)
                ? sourceTracks[level]
                : source[level];
            const titleValue = Object.prototype.hasOwnProperty.call(sourceTitles, level)
                ? sourceTitles[level]
                : source[`${level}Title`];
            tracks[level] = String(trackValue || '').trim().slice(0, 4000);
            titles[level] = String(titleValue || '').trim().slice(0, 160);
        });
        return {
            tension: normalizeMusicTension(source.tension),
            tracks,
            titles
        };
    };
    const getYouTubeVideoId = (value) => {
        const raw = normalizeYouTubeUrl(value);
        if (!raw) return '';
        try {
            const parsed = new URL(raw, window.location.href);
            const host = parsed.hostname.replace(/^www\./i, '').toLowerCase();
            if (host === 'youtu.be' || host.endsWith('.youtu.be')) {
                return parsed.pathname.split('/').filter(Boolean)[0] || '';
            }
            if (parsed.pathname.startsWith('/shorts/')) {
                return parsed.pathname.split('/').filter(Boolean)[1] || '';
            }
            if (parsed.pathname.startsWith('/embed/')) {
                return parsed.pathname.split('/').filter(Boolean)[1] || '';
            }
            return parsed.searchParams.get('v') || '';
        } catch (err) {
            return '';
        }
    };
    const getYouTubeEmbedUrl = (value, options = {}) => {
        const videoId = getYouTubeVideoId(value).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32);
        if (!videoId) return '';
        const opts = options && typeof options === 'object' ? options : {};
        const params = new URLSearchParams({
            controls: '1',
            enablejsapi: '1',
            loop: '1',
            modestbranding: '1',
            playlist: videoId,
            rel: '0',
            playsinline: '1'
        });
        if (opts.autoplay) params.set('autoplay', '1');
        if (window.location && /^https?:$/i.test(window.location.protocol)) {
            params.set('origin', window.location.origin);
        }
        return `https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`;
    };
    const vttRulesFactory = window.RTF_VTT_RULES;
    if (!vttRulesFactory || typeof vttRulesFactory.create !== 'function') {
        throw new Error('VTT rules module failed to load.');
    }
    const vttRules = vttRulesFactory.create({ buildId, toImageUrl });
    const sheetSkillsMap = vttRules.SHEET_SKILLS_MAP;
    const normalizeDefences = vttRules.normalizeDefences;
    const parsePlayerHp = vttRules.parsePlayerHp;
    const getSheetMod = vttRules.getSheetMod;
    const getSheetPB = vttRules.getSheetPB;
    const getSheetSkillMiscBonus = vttRules.getSheetSkillMiscBonus;
    const getSheetSkillBonus = vttRules.getSheetSkillBonus;
    const getSheetArmorClass = vttRules.getSheetArmorClass;
    const getSheetDefences = vttRules.getSheetDefences;
    const getSheetStealthRoll = vttRules.getSheetStealthRoll;
    const abilityModFromScore = vttRules.abilityModFromScore;
    const formatSignedBonus = vttRules.formatSignedBonus;
    const normalizeMonsterRollKeyPart = vttRules.normalizeMonsterRollKeyPart;
    const normalizeMonsterRecord = vttRules.normalizeMonsterRecord;
    const buildTokenFromPlayer = vttRules.buildTokenFromPlayer;
    const buildTokenFromNPC = vttRules.buildTokenFromNPC;
    const buildTokenFromMonster = vttRules.buildTokenFromMonster;
    const applyMonsterStatBlockToToken = vttRules.applyMonsterStatBlockToToken;
    const updateMonsterRollOverrideForToken = vttRules.updateMonsterRollOverrideForToken;
    const buildCustomToken = vttRules.buildCustomToken;
    const filterMonsterRollPresets = vttRules.filterMonsterRollPresets;
    const vttRollsFactory = window.RTF_VTT_ROLLS;
    if (!vttRollsFactory || typeof vttRollsFactory.create !== 'function') {
        throw new Error('VTT rolls module failed to load.');
    }
    const vttRolls = vttRollsFactory.create({
        normalizeSearchText,
        sheetSkillsMap,
        defaultSearchLimit: C.QUICK_ACTION_SEARCH_RESULT_LIMIT
    });
    const normalizeRollMode = vttRolls.normalizeRollMode;
    const getRollModeLabel = (mode = uiRuntime.playerRoll.mode) => vttRolls.getRollModeLabel(mode);
    const vttProximityFactory = window.RTF_VTT_PROXIMITY;
    if (!vttProximityFactory || typeof vttProximityFactory.createModel !== 'function') {
        throw new Error('VTT proximity module failed to load.');
    }
    const vttProximityModel = vttProximityFactory.createModel({
        buildId,
        clamp,
        normalizeRollMode,
        toNumber,
        toTitleCaseWords
    });
    const {
        PROXIMITY_TRIGGER_KIND_OPTIONS,
        PROXIMITY_TRIGGER_TYPE_OPTIONS,
        PROXIMITY_TRIGGER_TARGET_OPTIONS,
        PROXIMITY_TRIGGER_REPEAT_OPTIONS,
        PROXIMITY_TRIGGER_SKILL_OPTIONS,
        normalizeProximityTriggerSkill,
        getProximitySkillLabel,
        normalizeProximityTrigger,
        normalizeProximityTriggers,
        normalizeProximityPromptResult,
        normalizeProximityPromptStateEntry,
        normalizeProximityPromptStates,
        buildSeededProximityTrigger
    } = vttProximityModel;
    const readJSONStorage = (key, fallback = null) => {
        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : fallback;
        } catch (err) {
            return fallback;
        }
    };
    const getActiveSheetBundle = (preferredSheetKey = '') => {
        const allData = readJSONStorage(C.SHEET_STORAGE_KEY, null);
        if (!allData || typeof allData !== 'object' || !allData.characters || typeof allData.characters !== 'object') return null;
        const cleanSheetKey = String(preferredSheetKey || '').trim();
        if (cleanSheetKey) {
            const matched = Object.entries(allData.characters).find(([, character]) =>
                String(character && character.meta && character.meta.sheetKey || '').trim() === cleanSheetKey
            );
            if (matched && matched[1]) return { allData, activeId: matched[0], character: matched[1] };
        }
        const activeId = String(allData.activeId || '').trim();
        const character = allData.characters[activeId] || Object.values(allData.characters)[0] || null;
        if (!character || typeof character !== 'object') return null;
        return { allData, activeId: allData.characters[activeId] ? activeId : Object.keys(allData.characters)[0], character };
    };
    const buildSheetActionCatalog = () => {
        const bundle = getActiveSheetBundle(uiRuntime.overlays.sheetAction && uiRuntime.overlays.sheetAction.sheetKey);
        return vttRules.buildSheetActionCatalog(bundle && bundle.character);
    };
    const buildSceneRecord = (scenes, sourceScene = null) => {
        const source = sourceScene && typeof sourceScene === 'object' ? sourceScene : null;
        const nextSceneNumber = (Array.isArray(scenes) ? scenes.length : 0) + 1;
        const nextName = source
            ? `${String(source.name || 'Scene').trim() || 'Scene'} Copy`
            : `Scene ${nextSceneNumber}`;
        const clonedTokens = deepClone(Array.isArray(source && source.tokens) ? source.tokens : []).map((token) => ({
            ...token,
            id: buildId('token')
        }));
        const clonedTemplates = deepClone(Array.isArray(source && source.templates) ? source.templates : []).map((template) => ({
            ...template,
            id: buildId('template')
        }));
        const clonedEvidenceNotes = deepClone(Array.isArray(source && source.evidenceNotes) ? source.evidenceNotes : []).map((note) => ({
            ...note,
            id: buildId('evidence')
        }));
        const clonedAnnotations = deepClone(Array.isArray(source && source.annotations) ? source.annotations : []).map((annotation) => ({
            ...annotation,
            id: buildId('annotation')
        }));
        const sourceClocks = deepClone(Array.isArray(source && source.clocks) ? source.clocks : []);
        const clonedClockIdMap = new Map();
        const clonedClocks = sourceClocks.map((clock) => {
            const sourceClockId = String(clock && clock.id || '').trim();
            const clonedClock = {
                ...clock,
                id: buildId('clock')
            };
            if (sourceClockId) clonedClockIdMap.set(sourceClockId, clonedClock.id);
            return clonedClock;
        });
        const remapClonedTriggerClockReferences = (owners) => {
            owners.forEach((owner) => {
                if (!owner || !Array.isArray(owner.triggers)) return;
                owner.triggers = owner.triggers.map((trigger) => {
                    if (!trigger || typeof trigger !== 'object') return trigger;
                    const sourceClockId = String(trigger.clockId || '').trim();
                    if (!sourceClockId) return trigger;
                    const clonedClockId = clonedClockIdMap.get(sourceClockId) || '';
                    if (clonedClockId) return { ...trigger, clockId: clonedClockId };
                    return {
                        ...trigger,
                        clockId: '',
                        clockSuccessDelta: 0,
                        clockFailDelta: 0
                    };
                });
            });
        };
        remapClonedTriggerClockReferences(clonedTokens);
        remapClonedTriggerClockReferences(clonedEvidenceNotes);
        return {
            id: buildId('scene'),
            name: nextName,
            mapImageUrl: source ? String(source.mapImageUrl || '') : '',
            mapScale: source ? clampMapScale(source.mapScale, 1) : 1,
            grid: deepClone(source && source.grid ? source.grid : {
                cellPx: C.DEFAULT_VTT_CELL_PX,
                offsetX: 0,
                offsetY: 0,
                cellDistance: 5
            }),
            stealthMode: !!(source && source.stealthMode),
            music: normalizeSceneMusic(source && source.music),
            tokens: clonedTokens,
            templates: clonedTemplates,
            evidenceNotes: clonedEvidenceNotes,
            annotations: clonedAnnotations,
            clocks: clonedClocks,
            pings: [],
            fog: deepClone(Array.isArray(source && source.fog) ? source.fog : [])
        };
    };
    const serializeConditions = (conditions) => (Array.isArray(conditions) ? conditions.join(', ') : '');
    const parseConditions = (value) => String(value || '')
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
        .slice(0, 24);
    const normalizeHexColor = (value, fallback = '#4f8dff') => {
        const clean = String(value || '').trim();
        return /^#[0-9A-Fa-f]{6}$/.test(clean) ? clean : fallback;
    };
    const getHexColorRgbString = (value, fallback = '#4f8dff') => {
        const clean = normalizeHexColor(value, fallback).slice(1);
        const parsed = parseInt(clean, 16);
        if (!Number.isFinite(parsed)) return '79, 141, 255';
        return `${(parsed >> 16) & 255}, ${(parsed >> 8) & 255}, ${parsed & 255}`;
    };
    const normalizeMoodEmoji = (value) => String(value || '').trim().slice(0, 16);
    const normalizeMoodLabel = (value) => String(value || '').trim().slice(0, 40);
    const hasTokenMood = (token) => !!(normalizeMoodEmoji(token && token.moodEmoji) || normalizeMoodLabel(token && token.moodLabel));
    const getTokenMoodText = (token) => {
        const emoji = normalizeMoodEmoji(token && token.moodEmoji);
        const label = normalizeMoodLabel(token && token.moodLabel);
        return `${emoji}${emoji && label ? ' ' : ''}${label}`.trim();
    };
    const serializeHp = (current, max) => {
        const hasCurrent = hasValue(current);
        const hasMax = hasValue(max);
        if (!hasCurrent && !hasMax) return 'HP -';
        if (hasCurrent && hasMax) return `HP ${current}/${max}`;
        if (hasCurrent) return `HP ${current}`;
        return `HP -/${max}`;
    };
    const normalizeStealthRoll = (value, fallback = null) => {
        if (!hasValue(value)) return fallback;
        return clamp(Math.round(toNumber(value, 0)), 0, 99);
    };
    const getTokenStealthRoll = (token) => normalizeStealthRoll(
        token && token.stealthRoll !== undefined ? token.stealthRoll : token && token.stealthDc,
        null
    );
    const getEntryStealthRoll = (entry) => normalizeStealthRoll(
        entry && entry.stealthRoll !== undefined ? entry.stealthRoll : entry && entry.stealthDc,
        null
    );
    const getVisionPassivePerception = (token) => {
        if (hasValue(token && token.passivePerception)) {
            return clamp(Math.round(toNumber(token.passivePerception, 10)), 0, 99);
        }
        if (hasValue(token && token.vision && token.vision.passivePerception)) {
            return clamp(Math.round(toNumber(token.vision.passivePerception, 10)), 0, 99);
        }
        return 10;
    };
    const getTokenDamageFraction = (token) => {
        if (!token) return 0;
        const hpCurrent = Number(token.hpCurrent);
        const hpMax = Number(token.hpMax);
        if (!Number.isFinite(hpCurrent) || !Number.isFinite(hpMax) || hpMax <= 0) return 0;
        const ratio = clamp(hpCurrent / hpMax, 0, 1);
        return Math.round((1 - ratio) * 1000) / 1000;
    };
    const isTokenBloodied = (token) => {
        if (!token) return false;
        if (String(token.sourceType || '').trim().toLowerCase() !== 'npc') return false;
        const hpCurrent = Number(token.hpCurrent);
        const hpMax = Number(token.hpMax);
        if (!Number.isFinite(hpCurrent) || !Number.isFinite(hpMax) || hpMax <= 0) return false;
        return hpCurrent <= hpMax / 2;
    };
    const vttGeometryFactory = window.RTF_VTT_GEOMETRY;
    if (!vttGeometryFactory || typeof vttGeometryFactory.create !== 'function') {
        throw new Error('VTT geometry module failed to load.');
    }
    const vttGeometry = vttGeometryFactory.create({
        buildId,
        clamp,
        escapeHtml,
        getHexColorRgbString,
        getLocalRole: () => sessionState.role,
        getLocalToolSizeCells: () => stageState.tool.current.sizeCells,
        getSceneCellPx: (...args) => getSceneCellPx(...args),
        getTokenStealthRoll,
        getVisionPassivePerception,
        getVTTState: () => sessionState.snapshot,
        getWorldSize: () => stageState.view.world,
        getWorldSizeForScene: (...args) => getWorldSizeForScene(...args),
        normalizeAngleDeg: (...args) => normalizeAngleDeg(...args),
        normalizeGridCoordinate,
        normalizeProximityPromptStates,
        normalizeProximityTriggers,
        normalizeTokenCoordinate,
        normalizeToolSizeCells: (...args) => normalizeToolSizeCells(...args),
        normalizeWorldCoordinate,
        snapWorldPointToTemplateAnchor: (...args) => snapWorldPointToTemplateAnchor(...args),
        toNumber,
        config: {
            defaultWorldSize: C.DEFAULT_WORLD_SIZE,
            defaultToolSizeCells: C.DEFAULT_TOOL_SIZE_CELLS,
            templateKindCircle: C.TEMPLATE_KIND_CIRCLE,
            templateKindCone: C.TEMPLATE_KIND_CONE,
            fogEdgeOverdrawPx: C.FOG_EDGE_OVERDRAW_PX,
            defaultEvidenceNoteCategory: C.DEFAULT_EVIDENCE_NOTE_CATEGORY,
            defaultEvidenceNoteColor: C.DEFAULT_EVIDENCE_NOTE_COLOR,
            evidenceNoteShapePin: C.EVIDENCE_NOTE_SHAPE_PIN,
            evidenceNoteShapeZone: C.EVIDENCE_NOTE_SHAPE_ZONE,
            evidenceNoteShapeOptions: C.EVIDENCE_NOTE_SHAPE_OPTIONS,
            evidenceNoteCategoryMeta: C.EVIDENCE_NOTE_CATEGORY_META,
            stealthStatusDetected: C.STEALTH_STATUS_DETECTED,
            stealthStatusUnseen: C.STEALTH_STATUS_UNSEEN
        }
    });
    const {
        applyFogMaskMutation,
        areFogEntriesEquivalent,
        buildAreaTemplate,
        buildEvidenceNoteAreaLabel,
        buildEvidenceNoteFromCellBounds,
        buildEvidenceNoteFromWorldPoints,
        buildFogCellsFromCellSet,
        buildFogEdgeMarkup,
        buildFogMaskFromWorldPoints,
        buildFogMaskMarkup,
        buildStealthStatusMap,
        collectFogCellSet,
        getAreaTemplateWorldGeometry,
        getDefaultEvidenceNoteHighlightColor,
        getDefaultEvidenceNoteTitle,
        getEvidenceNoteCategoryLabel,
        getEvidenceNoteCategoryShortLabel,
        getEvidenceNoteCellBounds,
        getEvidenceNoteCellPoint,
        getEvidenceNoteDisplayTitle,
        getEvidenceNoteHighlightColor,
        getEvidenceNoteHighlightRgb,
        getEvidenceNoteShapeLabel,
        getFogEntryWorldRect,
        getPointAtAngle,
        getRenderableScenePings,
        getRenderableSceneTemplates,
        getSceneEvidenceNotes,
        getStealthVisionTargetSummary,
        getTemplateAngleFromWorldPoint,
            getTemplateWorldPoint,
        getTokenCenterInCells,
        getTokenVisionFacingDeg,
        getVisibleEvidenceNotesForRole,
        getVisibleTokensForRole,
        getVisionConeGeometry,
        isEvidenceNotePin,
        isEvidenceNoteVisibleToRole,
        isTokenHiddenForRole,
        isTokenUnderFog,
        normalizeEvidenceNoteBody,
        normalizeEvidenceNoteCategory,
        normalizeEvidenceNoteShape,
        normalizeEvidenceNoteTitle
    } = vttGeometry;
    const getRetainedSharedTemplates = (scene, now = Date.now()) => {
        const limit = Math.max(1, Math.round(toNumber(C.MAX_SHARED_TEMPLATES_PER_SCENE, 18)));
        return getRenderableSceneTemplates(scene, now).slice(-limit);
    };
    const compactSharedTemplatesForScene = (scene, now = Date.now()) => {
        if (!scene || !Array.isArray(scene.templates)) return false;
        const retainedTemplates = getRetainedSharedTemplates(scene, now);
        if (retainedTemplates.length === scene.templates.length) return false;
        scene.templates = retainedTemplates;
        return true;
    };
    const compactSharedTemplatesInSnapshot = (snapshot, now = Date.now()) => {
        if (!snapshot || !Array.isArray(snapshot.scenes)) return false;
        return snapshot.scenes.reduce((changed, scene) => (
            compactSharedTemplatesForScene(scene, now) || changed
        ), false);
    };
    const snapshotNeedsSharedTemplateCompaction = (snapshot, now = Date.now()) => {
        if (!snapshot || !Array.isArray(snapshot.scenes)) return false;
        return snapshot.scenes.some((scene) => (
            Array.isArray(scene && scene.templates)
            && getRetainedSharedTemplates(scene, now).length !== scene.templates.length
        ));
    };
    const queueSharedTransientTemplate = (template) => {
        const sourceScene = getActiveScene();
        if (!template || !isSharedSceneForBroadcast(sourceScene)) return false;
        const now = Date.now();
        const payload = {
            ...template,
            expiresAt: now + C.TEMPLATE_SHARED_LIFETIME_MS
        };
        const sourceSceneId = String(sourceScene.id || '').trim();
        let queued = false;
        const persisted = withDraft((draft) => {
            const sharedSceneId = getSharedSceneId(draft);
            const scene = Array.isArray(draft.scenes)
                ? draft.scenes.find((entry) => String(entry && entry.id || '').trim() === sourceSceneId)
                : null;
            if (!scene || sourceSceneId !== sharedSceneId) return;
            if (!Array.isArray(scene.templates)) scene.templates = [];
            compactSharedTemplatesForScene(scene, now);
            scene.templates.push(payload);
            compactSharedTemplatesForScene(scene, now);
            queued = true;
        }, { reason: 'shared-transient-template' });
        return !!persisted && queued;
    };
    const normalizePingVariant = (value) => {
        const clean = String(value || '').trim().toLowerCase();
        if (C.PING_VARIANT_OPTIONS[clean]) return clean;
        const matched = Object.entries(C.PING_VARIANT_OPTIONS)
            .find(([, option]) => String(option && option.variant || '').trim().toLowerCase() === clean);
        return matched ? matched[0] : 'attention';
    };
    const getPingVariantOptions = (event = null, variant = stageState.tool.pingVariant) => {
        if (event && event.altKey) return C.PING_VARIANT_OPTIONS.danger;
        if (event && event.shiftKey) return C.PING_VARIANT_OPTIONS.question;
        return C.PING_VARIANT_OPTIONS[normalizePingVariant(variant)] || C.PING_VARIANT_OPTIONS.attention;
    };
    const queueSharedPing = (scene, worldPoint, options = {}) => {
        if (!scene || !worldPoint || !isSharedSceneForBroadcast(scene)) return false;
        const now = Date.now();
        const variant = String(options.variant || 'attention').trim().slice(0, 40) || 'attention';
        const label = String(options.label || 'Ping').trim().slice(0, 80) || 'Ping';
        const color = normalizeHexColor(options.color, '#4f8dff');
        const askRoll = options.askRoll && typeof options.askRoll === 'object'
            ? {
                label: String(options.askRoll.label || '').trim().replace(/\s+/g, ' ').slice(0, 48),
                actionKey: String(options.askRoll.actionKey || '').trim().slice(0, 120),
                ownerPlayerId: String(options.askRoll.ownerPlayerId || '').trim().slice(0, 120),
                ownerSheetKey: String(options.askRoll.ownerSheetKey || '').trim().slice(0, 160),
                ownerName: String(options.askRoll.ownerName || '').trim().replace(/\s+/g, ' ').slice(0, 80)
            }
            : null;
        const ping = {
            id: buildId('ping'),
            x: Math.round(toNumber(worldPoint.x, 0)),
            y: Math.round(toNumber(worldPoint.y, 0)),
            label,
            color,
            variant,
            createdAt: now,
            expiresAt: now + (askRoll ? 2 * 60 * 1000 : C.PING_SHARED_LIFETIME_MS)
        };
        if (askRoll && askRoll.label) ping.askRoll = askRoll;
        const sourceSceneId = String(scene.id || '').trim();
        let queued = false;
        const persisted = withDraft((draft) => {
            const sharedSceneId = getSharedSceneId(draft);
            const draftScene = Array.isArray(draft.scenes)
                ? draft.scenes.find((entry) => String(entry && entry.id || '').trim() === sourceSceneId)
                : null;
            if (!draftScene || sourceSceneId !== sharedSceneId) return;
            const activePings = getRenderableScenePings(draftScene, now);
            draftScene.pings = activePings.concat(ping).slice(-18);
            queued = true;
        }, { reason: 'shared-ping' });
        return !!persisted && queued;
    };
    const removeSharedPingById = (pingId) => {
        const targetId = String(pingId || '').trim();
        if (!targetId) return false;
        let removed = false;
        withDraft((draft) => {
            const scene = getActiveScene(draft);
            if (!scene || !Array.isArray(scene.pings)) return;
            const before = scene.pings.length;
            scene.pings = scene.pings.filter((ping) => String(ping && ping.id || '').trim() !== targetId);
            removed = scene.pings.length !== before;
        });
        return removed;
    };
    const coerceSceneFogToCellMask = (scene) => {
        if (!scene) return false;

        if (!Array.isArray(scene.fog)) {
            scene.fog = [];
            return true;
        }

        const cellSet = collectFogCellSet(scene, scene.fog);
        const nextFog = buildFogCellsFromCellSet(scene, cellSet);

        if (areFogEntriesEquivalent(scene.fog, nextFog)) return false;

        scene.fog = nextFog;
        return true;
    };

    const coerceSnapshotFogToCellMasks = (snapshot) => {
        if (!snapshot || !Array.isArray(snapshot.scenes)) return false;

        let mutated = false;

        snapshot.scenes.forEach((scene) => {
            if (coerceSceneFogToCellMask(scene)) mutated = true;
        });

        return mutated;
    };
    const getSceneClocks = (scene) => (Array.isArray(scene && scene.clocks) ? scene.clocks : []);
    const getVisibleSceneClocksForRole = (scene, role = sessionState.role) => {
        const clocks = getSceneClocks(scene);
        if (role === 'dm') return clocks;
        return clocks.filter((clock) => !clock.hidden);
    };
    const normalizeClockTitle = (value, fallback = 'Scene Clock') => {
        const clean = String(value || '').trim().slice(0, 120);
        return clean || fallback;
    };
    const normalizeClockMax = (value, fallback = 4) => clamp(Math.round(toNumber(value, fallback)), 1, 20);
    const normalizeClockCurrent = (value, max, fallback = 0) => clamp(Math.round(toNumber(value, fallback)), 0, normalizeClockMax(max, 4));
    const normalizeClockNote = (value) => String(value || '').trim().slice(0, 240);
    const updateSceneClock = (clockId, mutator) => {
        const targetId = String(clockId || '').trim();
        if (!targetId || typeof mutator !== 'function' || !isDM()) return false;
        withDraft((draft) => {
            const scene = getCombatScene(draft);
            if (!scene || !Array.isArray(scene.clocks)) return;
            const idx = scene.clocks.findIndex((clock) => String(clock && clock.id || '').trim() === targetId);
            if (idx < 0) return;
            mutator(scene.clocks[idx], scene);
        });
        return true;
    };
    const getEvidenceNoteById = (noteId, state = sessionState.snapshot, role = sessionState.role) => {
        const targetId = String(noteId || '').trim();
        if (!targetId) return null;
        const scene = getActiveScene(state);
        if (!scene) return null;
        return getVisibleEvidenceNotesForRole(scene, role).find((note) => String(note && note.id || '').trim() === targetId) || null;
    };
    const applyEvidenceNoteChipPresentation = (noteEl) => {
        if (!(noteEl instanceof HTMLElement)) return;
        const titleEl = noteEl.querySelector('.vtt-map-note-title');
        if (!(titleEl instanceof HTMLElement)) return;
        const fullTitle = normalizeEvidenceNoteTitle(
            noteEl.dataset.noteTitle,
            getDefaultEvidenceNoteTitle(noteEl.dataset.noteCategory)
        );
        const noteWidthPx = Math.max(1, Math.round(noteEl.offsetWidth || toNumber(noteEl.dataset.worldWidth, 1) * stageState.view.local.zoom));
        const availableWidthPx = clamp(noteWidthPx - 14, C.EVIDENCE_NOTE_CHIP_MIN_WIDTH_PX, C.EVIDENCE_NOTE_CHIP_MAX_WIDTH_PX);
        const estimatedTitleWidthPx = Math.max(
            C.EVIDENCE_NOTE_CHIP_MIN_WIDTH_PX,
            Math.round(fullTitle.length * C.EVIDENCE_NOTE_CHIP_ESTIMATED_CHAR_WIDTH_PX + C.EVIDENCE_NOTE_CHIP_ESTIMATED_PADDING_PX)
        );
        const collapsed = estimatedTitleWidthPx > availableWidthPx;
        noteEl.classList.toggle('is-icon-only', collapsed);
        noteEl.style.setProperty('--vtt-note-chip-max-width', `${collapsed ? C.EVIDENCE_NOTE_CHIP_MIN_WIDTH_PX : availableWidthPx}px`);
        titleEl.textContent = fullTitle;
        titleEl.dataset.noteCategoryShort = getEvidenceNoteCategoryShortLabel(noteEl.dataset.noteCategory);
        titleEl.setAttribute('aria-label', fullTitle);
        titleEl.title = fullTitle;
    };
    const clearPendingTouchContext = (...args) => requireStageInput().clearPendingTouchContext(...args);
    const activateTokenSelection = (tokenId) => {
        const token = getTokenById(tokenId);
        if (!token) return null;
        stageState.selection.tokenId = token.id;
        stageState.selection.templateId = '';
        stageState.selection.evidenceNoteId = '';
        stageState.placement.visionConeRotate = null;
        const linkedEntry = findEntryForToken(token.id);
        stageState.selection.entryId = linkedEntry ? linkedEntry.id : '';
        return token;
    };
    const isLocalPlayerOwnToken = (token) => {
        if (!isPlayer() || !token) return false;
        const context = getLocalPlayerFocusContext();
        return !!(context && context.token && String(context.token.id || '').trim() === String(token.id || '').trim());
    };
    const canPreviewTokenPortrait = (token) => {
        return false;
    };
    const clearTokenPortraitPreview = ({ render = false } = {}) => {
        if (stageState.preview.timerId) {
            window.clearTimeout(stageState.preview.timerId);
            stageState.preview.timerId = 0;
        }
        if (!stageState.preview.tokenId) return false;
        stageState.preview.tokenId = '';
        if (render) renderStage();
        return true;
    };
    const showTokenPortraitPreview = (tokenId, durationMs = C.TOKEN_PORTRAIT_PREVIEW_MS) => {
        const token = getTokenById(tokenId);
        if (!canPreviewTokenPortrait(token)) {
            clearTokenPortraitPreview();
            return false;
        }
        if (stageState.preview.timerId) window.clearTimeout(stageState.preview.timerId);
        stageState.preview.tokenId = token.id;
        stageState.preview.timerId = window.setTimeout(() => {
            if (stageState.preview.tokenId !== token.id) return;
            stageState.preview.timerId = 0;
            stageState.preview.tokenId = '';
            renderStage();
        }, Math.max(1, Math.round(toNumber(durationMs, C.TOKEN_PORTRAIT_PREVIEW_MS))));
        return true;
    };
    const activateEvidenceNoteSelection = (noteId) => {
        const note = getEvidenceNoteById(noteId);
        if (!note) return null;
        stageState.selection.evidenceNoteId = note.id;
        stageState.selection.tokenId = '';
        stageState.selection.entryId = '';
        stageState.selection.templateId = '';
        stageState.preview.tokenId = '';
        stageState.placement.visionConeRotate = null;
        return note;
    };
    const getStore = () => (window.RTF_STORE && typeof window.RTF_STORE.getVTTState === 'function' ? window.RTF_STORE : null);
    const getActiveCaseId = () => {
        const store = getStore();
        if (!store || typeof store.getActiveCaseId !== 'function') return 'case_primary';
        return String(store.getActiveCaseId() || 'case_primary');
    };
    const getVTTCollabRoomId = (caseId = getActiveCaseId()) => {
        const store = getStore();
        if (store && typeof store.resolveVTTRoomTarget === 'function') {
            const target = store.resolveVTTRoomTarget({ caseId });
            return String(target && target.roomId || '').trim() || `vtt:case:${String(caseId || 'case_primary').trim() || 'case_primary'}`;
        }
        return `vtt:case:${String(caseId || 'case_primary').trim() || 'case_primary'}`;
    };
    const getUIPrefsStorageKey = () => `${C.UI_PREFS_STORAGE_PREFIX}${getActiveCaseId()}`;
    const getProcessedInitStorageKey = () => `${C.PROCESSED_INIT_STORAGE_PREFIX}${getActiveCaseId()}`;
    const getRolePrefsStorageKey = () => {
        const store = getStore();
        return store && typeof store.getVTTLocalPrefsStorageKey === 'function'
            ? String(store.getVTTLocalPrefsStorageKey() || '').trim()
            : '';
    };
    const getVTTCollabTransport = () => (
        resources.sessionController && typeof resources.sessionController.getTransport === 'function'
            ? resources.sessionController.getTransport()
            : null
    );
    const getVTTCollabStatus = () => (
        resources.sessionController && typeof resources.sessionController.getStatus === 'function'
            ? resources.sessionController.getStatus()
            : null
    );
    const isVTTCollabReady = () => !!(
        resources.sessionController
        && typeof resources.sessionController.isReady === 'function'
        && resources.sessionController.isReady()
    );
    const isVTTCollabInitializing = () => !!(
        resources.sessionController
        && typeof resources.sessionController.isInitializing === 'function'
        && resources.sessionController.isInitializing()
    );
    const requiresLiveVTTRoom = () => !!(
        resources.sessionController
        && typeof resources.sessionController.hasLiveConfig === 'function'
        && resources.sessionController.hasLiveConfig()
    );
    const canMutateLiveVTTState = (reason = 'vtt-mutation') => {
        if (!requiresLiveVTTRoom() || isVTTCollabReady()) return true;
        const status = getVTTCollabStatus();
        const detail = status && status.detail
            ? status.detail
            : 'Live VTT room is not ready. Changes were not applied locally.';
        setVTTCollabStatus({
            state: isVTTCollabInitializing() ? 'connecting' : 'degraded',
            detail,
            peerCount: status && Number.isFinite(status.peerCount) ? status.peerCount : 0
        });
        console.warn(`VTT room mutation blocked before live room was ready: ${reason}`);
        return false;
    };
    const canDeleteLiveVTTState = (reason = 'vtt-delete') => {
        if (sessionState.initialLoadPending) {
            setVTTCollabStatus({
                state: 'connecting',
                detail: 'VTT is still loading. Delete actions are disabled until the live room is ready.',
                peerCount: 0
            });
            console.warn(`VTT delete blocked during initial load: ${reason}`);
            return false;
        }
        if (!requiresLiveVTTRoom()) return true;
        if (isVTTCollabReady()) return true;
        const status = getVTTCollabStatus();
        setVTTCollabStatus({
            state: status && status.state ? status.state : 'connecting',
            detail: 'Delete actions are disabled until the live VTT room is connected.',
            peerCount: status && Number.isFinite(status.peerCount) ? status.peerCount : 0
        });
        console.warn(`VTT delete blocked before live room was ready: ${reason}`);
        return false;
    };
    const confirmSceneDeletion = (scene, impact = {}) => {
        const sceneName = String(scene && scene.name || 'this scene').trim() || 'this scene';
        const tokenCount = Math.max(0, Math.round(toNumber(impact && impact.tokenCount, 0)));
        const initiativeEntryCount = Math.max(0, Math.round(toNumber(impact && impact.initiativeEntryCount, 0)));
        const consequences = [
            `Its map, ${tokenCount} token${tokenCount === 1 ? '' : 's'}, notes, clocks, and fog will be removed.`
        ];
        if (initiativeEntryCount) {
            consequences.push(`${initiativeEntryCount} linked combatant${initiativeEntryCount === 1 ? '' : 's'} will be removed or relinked to matching tokens in another scene.`);
        }
        if (impact && impact.endsEncounter) consequences.push('The active encounter scoped to this scene will end.');
        return window.confirm(`Delete "${sceneName}"?\n\n${consequences.join('\n')}\n\nThis cannot be undone.`);
    };
    const confirmClearSceneFog = (scene) => {
        const sceneName = String(scene && scene.name || 'this scene').trim() || 'this scene';
        const fogCount = Array.isArray(scene && scene.fog) ? scene.fog.length : 0;
        return window.confirm(
            `Clear all fog from "${sceneName}"?\n\n`
            + `This will reveal ${fogCount} fog cell${fogCount === 1 ? '' : 's'} to every connected player. This cannot be undone.`
        );
    };
    const normalizeLocalRole = (role) => {
        const clean = String(role || '').trim().toLowerCase();
        if (clean === 'dm') return 'dm';
        if (clean === 'spectator') return 'spectator';
        return 'player';
    };
    const isDM = () => sessionState.role === 'dm';
    const isPlayer = () => sessionState.role === 'player';
    const isSpectator = () => sessionState.role === 'spectator';

    const runBlackMoonHowlLocally = async ({ effectId, startsAt = 0, audience = 'local' } = {}) => {
        const id = String(effectId || buildId('black_moon')).trim();
        if (blackMoonController.isActive()) {
            return { ok: false, reason: 'active', effectId: activeBlackMoonRun && activeBlackMoonRun.effectId || id };
        }
        const run = { effectId: id, audience };
        activeBlackMoonRun = run;
        const result = await blackMoonController.trigger({ effectId: id, startsAt });
        if (activeBlackMoonRun === run) activeBlackMoonRun = null;
        return result;
    };

    const triggerBlackMoonHowls = async (options = {}) => {
        const source = options && typeof options === 'object' ? options : {};
        const audience = String(source.audience || 'all').trim().toLowerCase() === 'local' ? 'local' : 'all';
        if (!isDM()) return { ok: false, reason: 'dm-only' };
        if (blackMoonBroadcastPending || blackMoonController.isActive()) {
            return { ok: false, reason: 'active', effectId: activeBlackMoonRun && activeBlackMoonRun.effectId || '' };
        }
        const effectId = buildId('black_moon');
        if (audience === 'local') {
            return runBlackMoonHowlLocally({ effectId, audience });
        }

        const transport = getVTTCollabTransport();
        if (!isVTTCollabReady() || !transport || typeof transport.broadcastBlackMoonHowl !== 'function') {
            return { ok: false, reason: 'room-unavailable', effectId };
        }
        const startsAt = Date.now() + 350;
        blackMoonBroadcastPending = true;
        let broadcastResult;
        try {
            broadcastResult = await transport.broadcastBlackMoonHowl({ effectId, command: 'start', startsAt });
        } finally {
            blackMoonBroadcastPending = false;
        }
        if (!broadcastResult || !broadcastResult.ok) {
            return {
                ok: false,
                reason: broadcastResult && broadcastResult.reason || 'send-failed',
                effectId
            };
        }

        // The relay excludes its sender, so the GM explicitly runs the same timed effect locally.
        const result = await runBlackMoonHowlLocally({ effectId, startsAt, audience: 'all' });
        if (!result.ok && result.reason === 'error') {
            transport.broadcastBlackMoonHowl({ effectId, command: 'cancel' }).catch(() => { });
        }
        return result;
    };

    const cancelBlackMoonHowls = () => {
        const run = activeBlackMoonRun;
        const cancelled = blackMoonController.cancel();
        activeBlackMoonRun = null;
        if (run && run.audience === 'all' && isDM()) {
            const transport = getVTTCollabTransport();
            if (transport && typeof transport.broadcastBlackMoonHowl === 'function') {
                transport.broadcastBlackMoonHowl({ effectId: run.effectId, command: 'cancel' }).catch(() => { });
            }
        }
        return cancelled;
    };

    const handleRemoteBlackMoonHowl = (event) => {
        const detail = event && event.detail && typeof event.detail === 'object' ? event.detail : {};
        const effectId = String(detail.effectId || '').trim();
        if (!effectId) return;
        if (detail.command === 'cancel') {
            if (activeBlackMoonRun && activeBlackMoonRun.effectId === effectId) {
                blackMoonController.cancel();
                activeBlackMoonRun = null;
            }
            return;
        }
        runBlackMoonHowlLocally({
            effectId,
            startsAt: Math.max(0, Number(detail.startsAt) || 0),
            audience: 'remote'
        }).catch((err) => {
            blackMoonController.cancel();
            console.error('Remote Black Moon Howl failed', err);
        });
    };

    window.triggerBlackMoonHowls = triggerBlackMoonHowls;
    window.cancelBlackMoonHowls = cancelBlackMoonHowls;
    const canUseSharedPlayerTools = () => !isSpectator();
    const closeNPCSearch = ({ clearQuery = false } = {}) => {
        const wasOpen = !!(uiRuntime.npcSearch.open || uiRuntime.npcSearch.state);
        uiRuntime.npcSearch.open = false;
        uiRuntime.npcSearch.state = null;
        if (clearQuery) uiRuntime.npcSearch.query = '';
        return wasOpen;
    };
    const normalizeToolMode = (value) => {
        const token = String(value || '').trim().toLowerCase();
        if (token === C.TOOL_MODE_PING || token === C.TOOL_MODE_RULER || token === C.TOOL_MODE_CIRCLE || token === C.TOOL_MODE_CONE || token === C.TOOL_MODE_NOTE || token === TOOL_MODE_DRAW || token === C.TOOL_MODE_FOG || token === C.TOOL_MODE_FOG_REMOVE) return token;
        return C.TOOL_MODE_NAVIGATE;
    };
    const getToolModeLabel = (mode = stageState.tool.current.mode) => {
        const clean = normalizeToolMode(mode);
        if (clean === C.TOOL_MODE_PING) return 'Ping';
        if (clean === C.TOOL_MODE_RULER) return 'Ruler';
        if (clean === C.TOOL_MODE_CIRCLE) return 'Circle';
        if (clean === C.TOOL_MODE_CONE) return 'Cone';
        if (clean === C.TOOL_MODE_NOTE) return 'Pin / Zone';
        if (clean === TOOL_MODE_DRAW) return 'Draw';
        if (clean === C.TOOL_MODE_FOG) return 'Fog';
        if (clean === C.TOOL_MODE_FOG_REMOVE) return 'Unfog';
        return 'Navigate';
    };
    const normalizeToolSizeCells = (value, fallback = C.DEFAULT_TOOL_SIZE_CELLS) => clamp(Math.round(toNumber(value, fallback)), 1, 99);
    const normalizeAngleDeg = (value) => {
        const parsed = Math.round(toNumber(value, 0));
        const result = parsed % 360;
        return result < 0 ? result + 360 : result;
    };
    const getSceneCellPx = (scene) => Math.max(1, toNumber(scene && scene.grid && scene.grid.cellPx, C.DEFAULT_VTT_CELL_PX));
    const snapTemplateCenterCellCoordinate = (value) => Math.max(0.5, Math.round(toNumber(value, 0.5) - 0.5) + 0.5);
    const snapTemplateIntersectionCellCoordinate = (value) => Math.max(0, Math.round(toNumber(value, 0)));
    const snapWorldPointToTemplateAnchor = (scene, worldPoint) => {
        const cellPx = getSceneCellPx(scene);
        const offsetX = toNumber(scene && scene.grid && scene.grid.offsetX, 0);
        const offsetY = toNumber(scene && scene.grid && scene.grid.offsetY, 0);
        const rawX = (toNumber(worldPoint && worldPoint.x, 0) - offsetX) / cellPx;
        const rawY = (toNumber(worldPoint && worldPoint.y, 0) - offsetY) / cellPx;
        const centerAnchor = {
            x: snapTemplateCenterCellCoordinate(rawX),
            y: snapTemplateCenterCellCoordinate(rawY)
        };
        const intersectionAnchor = {
            x: snapTemplateIntersectionCellCoordinate(rawX),
            y: snapTemplateIntersectionCellCoordinate(rawY)
        };
        const centerDistanceSq = Math.pow(rawX - centerAnchor.x, 2) + Math.pow(rawY - centerAnchor.y, 2);
        const intersectionDistanceSq = Math.pow(rawX - intersectionAnchor.x, 2) + Math.pow(rawY - intersectionAnchor.y, 2);
        if (intersectionDistanceSq < centerDistanceSq) {
            return intersectionAnchor;
        }
        return {
            x: centerAnchor.x,
            y: centerAnchor.y
        };
    };
    const getTemplateById = (templateId, state = sessionState.snapshot) => {
        const scene = getActiveScene(state);
        if (!scene || !Array.isArray(scene.templates)) return null;
        return scene.templates.find((template) => String(template && template.id || '').trim() === String(templateId || '').trim()) || null;
    };
    const deleteTemplateById = (templateId) => {
        if (!canDeleteLiveVTTState('delete-template')) return false;
        const targetId = String(templateId || '').trim();
        if (!targetId) return false;
        withDraft((draft) => {
            const scene = getActiveScene(draft);
            if (!scene || !Array.isArray(scene.templates)) return;
            scene.templates = scene.templates.filter((template) => String(template && template.id || '').trim() !== targetId);
            if (stageState.selection.templateId === targetId) stageState.selection.templateId = '';
            if (stageState.placement.templateRotate && stageState.placement.templateRotate.templateId === targetId) stageState.placement.templateRotate = null;
        });
        return true;
    };
    const clearTemplatePlacementState = () => {
        if (!stageState.placement.annotation && !stageState.placement.template && !stageState.placement.templateRotate && !stageState.placement.visionConeRotate && !stageState.placement.ruler && !stageState.placement.fog && !stageState.placement.evidenceNote && !stageState.placement.evidenceNoteDrag) return false;
        stageState.placement.template = null;
        stageState.placement.templateRotate = null;
        stageState.placement.visionConeRotate = null;
        stageState.placement.ruler = null;
        stageState.placement.fog = null;
        stageState.placement.evidenceNote = null;
        stageState.placement.evidenceNoteDrag = null;
        stageState.placement.annotation = null;
        return true;
    };
    const setToolMode = (mode) => {
        clearTemplatePlacementState();
        stageState.tool.current.mode = normalizeToolMode(mode);
        if (stageState.tool.current.mode !== C.TOOL_MODE_PING) stageState.tool.pendingAskRollRequest = null;
    };
    const setAskRollPickMode = (enabled) => {
        stageState.tool.askRollPickMode = !!enabled && isPlayer() && canUseSharedPlayerTools();
        if (stageState.tool.askRollPickMode) {
            stageState.tool.pendingAskRollRequest = null;
            closeSheetActionPopover();
            closeNPCRollPopover();
            if (stageState.tool.current.mode === C.TOOL_MODE_PING) setToolMode(C.TOOL_MODE_NAVIGATE);
        }
        render();
        return stageState.tool.askRollPickMode;
    };
    const closeToolsMenu = () => {
        if (!uiRuntime.menus.toolsOpen) return false;
        uiRuntime.menus.toolsOpen = false;
        renderToolsMenu();
        return true;
    };

    let activeVTTPanelOpener = null;
    let vttPanelLayoutRevision = 0;
    let pendingVTTStageCenter = null;

    const captureVTTStageCenter = () => {
        if (!dom.stageEl) return null;
        const rect = dom.stageEl.getBoundingClientRect();
        const view = stageState.view.local;
        const zoom = Math.max(0.01, toNumber(view.zoom, 1));
        if (!rect.width || !rect.height) return null;
        if (pendingVTTStageCenter
            && toNumber(view.x, 0) === pendingVTTStageCenter.viewX
            && toNumber(view.y, 0) === pendingVTTStageCenter.viewY
            && zoom === pendingVTTStageCenter.zoom) {
            return pendingVTTStageCenter;
        }
        pendingVTTStageCenter = {
            x: (rect.width / 2 - toNumber(view.x, 0)) / zoom,
            y: (rect.height / 2 - toNumber(view.y, 0)) / zoom,
            viewX: toNumber(view.x, 0),
            viewY: toNumber(view.y, 0),
            zoom
        };
        return pendingVTTStageCenter;
    };

    const restoreVTTStageCenterAfterLayout = (worldPoint) => {
        if (!worldPoint || !dom.stageEl) return;
        const revision = ++vttPanelLayoutRevision;
        window.setTimeout(() => {
            if (revision !== vttPanelLayoutRevision || !dom.stageEl) return;
            if (pendingVTTStageCenter === worldPoint) pendingVTTStageCenter = null;
            const rect = dom.stageEl.getBoundingClientRect();
            const view = stageState.view.local;
            const zoom = Math.max(0.01, toNumber(view.zoom, 1));
            if (!rect.width || !rect.height) return;
            if (toNumber(view.x, 0) !== worldPoint.viewX
                || toNumber(view.y, 0) !== worldPoint.viewY
                || zoom !== worldPoint.zoom) return;
            view.x = Math.round(rect.width / 2 - worldPoint.x * zoom);
            view.y = Math.round(rect.height / 2 - worldPoint.y * zoom);
            applyWorldTransform();
        }, 220);
    };

    const resolveVTTPanelOpener = (candidate) => {
        const opener = candidate instanceof HTMLElement ? candidate : document.activeElement;
        if (!(opener instanceof HTMLElement) || !opener.closest('#vtt-view-menu')) return opener;
        return Array.from(dom.viewMenuToggleEls || []).find((toggleEl) => (
            toggleEl instanceof HTMLElement && toggleEl.getClientRects().length > 0
        )) || opener;
    };

    const findVisibleVTTPanelLauncher = (panel) => Array.from(
        document.querySelectorAll('[data-action="open-vtt-panel"][data-panel]')
    ).find((buttonEl) => (
        buttonEl instanceof HTMLElement
        && String(buttonEl.dataset.panel || '').trim() === panel
        && !buttonEl.closest('.vtt-drawer-tabs')
        && buttonEl.getClientRects().length > 0
    )) || null;

    const getAllowedVTTPanel = (panel) => {
        const clean = String(panel || '').trim();
        if (!clean) return '';
        if (clean === 'combat') return clean;
        if (isDM() && (clean === 'setup' || clean === 'spawn' || clean === 'inspector' || clean === 'admin')) return clean;
        if (isPlayer() && clean === 'player-rolls') return clean;
        return '';
    };

    const setActiveVTTPanel = (panel, options = {}) => {
        const stageCenter = captureVTTStageCenter();
        const nextPanel = getAllowedVTTPanel(panel);
        const opener = resolveVTTPanelOpener(options.opener);
        if (nextPanel && opener instanceof HTMLElement && !opener.closest('.vtt-drawer-tabs')) {
            activeVTTPanelOpener = opener;
        }
        if (!nextPanel) activeVTTPanelOpener = null;
        uiRuntime.preferences.activeVttPanel = nextPanel;
        uiRuntime.menus.toolsOpen = false;
        if (nextPanel !== 'player-rolls') uiRuntime.playerRoll.menuOpen = false;
        if (nextPanel === 'player-rolls') uiRuntime.playerRoll.menuOpen = true;
        applyUIPreferences();
        renderToolsMenu();
        renderPlayerRollMenu();
        restoreVTTStageCenterAfterLayout(stageCenter);
        if (options.focus === false || !nextPanel) return;
        window.requestAnimationFrame(() => {
            const focusTarget = nextPanel === 'combat'
                ? dom.initiativePanelEl
                : (nextPanel === 'admin'
                    ? dom.adminPanelEl
                    : (nextPanel === 'player-rolls'
                        ? dom.playerRollPanelEl
                        : ((nextPanel === 'setup' || nextPanel === 'spawn' || nextPanel === 'inspector') ? dom.sidebarEl : null)));
            if (focusTarget && typeof focusTarget.focus === 'function') focusTarget.focus({ preventScroll: true });
        });
    };

    const closeActiveVTTPanel = (options = {}) => {
        const cancelledAskRollPick = cancelAskRollPickMode();
        if (!uiRuntime.preferences.activeVttPanel && !uiRuntime.menus.toolsOpen && !cancelledAskRollPick) return false;
        const stageCenter = captureVTTStageCenter();
        uiRuntime.preferences.activeVttPanel = '';
        uiRuntime.menus.toolsOpen = false;
        uiRuntime.playerRoll.menuOpen = false;
        applyUIPreferences();
        renderToolsMenu();
        renderPlayerRollMenu();
        restoreVTTStageCenterAfterLayout(stageCenter);
        const returnTarget = activeVTTPanelOpener;
        activeVTTPanelOpener = null;
        if (options.restoreFocus !== false && returnTarget && returnTarget.isConnected && typeof returnTarget.focus === 'function') {
            window.requestAnimationFrame(() => returnTarget.focus({ preventScroll: true }));
        }
        return true;
    };

    const renderViewMenu = () => {
        if (dom.viewMenuEl) dom.viewMenuEl.hidden = !uiRuntime.menus.viewOpen;
        dom.viewMenuToggleEls.forEach((toggleEl) => {
            toggleEl.setAttribute('aria-expanded', uiRuntime.menus.viewOpen ? 'true' : 'false');
        });
    };

    const renderToolsMenu = () => {
        const canBroadcastFromCurrentScene = canBroadcastFromViewedScene();
        const localPlayerContext = isPlayer() ? getLocalPlayerFocusContext() : null;
        const canPlayerDraw = !!(
            isPlayer()
            && canBroadcastFromCurrentScene
            && String(localPlayerContext && localPlayerContext.playerId || '').trim()
        );
        const broadcastToolsUnavailableMessage = isUsingLocalSceneView(sessionState.snapshot, sessionState.role)
            ? 'Return to the shared scene to send markers to players.'
            : 'This role cannot send shared markers.';
        if (!isDM() && [C.TOOL_MODE_NOTE, C.TOOL_MODE_FOG, C.TOOL_MODE_FOG_REMOVE].includes(stageState.tool.current.mode)) {
            setToolMode(C.TOOL_MODE_NAVIGATE);
        }
        if (!isDM() && stageState.tool.current.mode === TOOL_MODE_DRAW && !canPlayerDraw) {
            setToolMode(C.TOOL_MODE_NAVIGATE);
        }
        if (isSpectator() && ![C.TOOL_MODE_NAVIGATE, C.TOOL_MODE_RULER].includes(stageState.tool.current.mode)) {
            setToolMode(C.TOOL_MODE_NAVIGATE);
        }
        if (!canBroadcastFromCurrentScene && [C.TOOL_MODE_PING, C.TOOL_MODE_CIRCLE, C.TOOL_MODE_CONE].includes(stageState.tool.current.mode)) {
            setToolMode(C.TOOL_MODE_NAVIGATE);
        }
        if (dom.toolsMenuEl) dom.toolsMenuEl.hidden = !uiRuntime.menus.toolsOpen;
        if (dom.toolsMenuToggleEl) dom.toolsMenuToggleEl.setAttribute('aria-expanded', uiRuntime.menus.toolsOpen ? 'true' : 'false');
        if (dom.rulerToggleEl) dom.rulerToggleEl.setAttribute('aria-pressed', stageState.tool.current.mode === C.TOOL_MODE_RULER ? 'true' : 'false');
        if (dom.toolModeNavigateEl) dom.toolModeNavigateEl.setAttribute('aria-pressed', stageState.tool.current.mode === C.TOOL_MODE_NAVIGATE ? 'true' : 'false');
        if (dom.toolModePingEl) {
            dom.toolModePingEl.setAttribute('aria-pressed', stageState.tool.current.mode === C.TOOL_MODE_PING ? 'true' : 'false');
            dom.toolModePingEl.disabled = !canBroadcastFromCurrentScene;
            dom.toolModePingEl.title = canBroadcastFromCurrentScene ? 'Ping the map' : broadcastToolsUnavailableMessage;
        }
        if (dom.toolModeCircleEl) {
            dom.toolModeCircleEl.setAttribute('aria-pressed', stageState.tool.current.mode === C.TOOL_MODE_CIRCLE ? 'true' : 'false');
            dom.toolModeCircleEl.disabled = !canBroadcastFromCurrentScene;
            dom.toolModeCircleEl.title = canBroadcastFromCurrentScene ? 'Place a shared circle marker' : broadcastToolsUnavailableMessage;
        }
        if (dom.toolModeConeEl) {
            dom.toolModeConeEl.setAttribute('aria-pressed', stageState.tool.current.mode === C.TOOL_MODE_CONE ? 'true' : 'false');
            dom.toolModeConeEl.disabled = !canBroadcastFromCurrentScene;
            dom.toolModeConeEl.title = canBroadcastFromCurrentScene ? 'Place a shared cone marker' : broadcastToolsUnavailableMessage;
        }
        if (dom.toolModeNoteEl) {
            dom.toolModeNoteEl.setAttribute('aria-pressed', stageState.tool.current.mode === C.TOOL_MODE_NOTE ? 'true' : 'false');
            dom.toolModeNoteEl.hidden = !isDM();
            dom.toolModeNoteEl.disabled = false;
        }
        if (dom.toolModeDrawEl) {
            dom.toolModeDrawEl.setAttribute('aria-pressed', stageState.tool.current.mode === TOOL_MODE_DRAW ? 'true' : 'false');
            dom.toolModeDrawEl.hidden = !isDM();
            dom.toolModeDrawEl.disabled = false;
        }
        if (dom.toolModeFogEl) {
            dom.toolModeFogEl.setAttribute('aria-pressed', stageState.tool.current.mode === C.TOOL_MODE_FOG ? 'true' : 'false');
            dom.toolModeFogEl.hidden = !isDM();
            dom.toolModeFogEl.disabled = false;
        }
        if (dom.toolModeFogRemoveEl) {
            dom.toolModeFogRemoveEl.setAttribute('aria-pressed', stageState.tool.current.mode === C.TOOL_MODE_FOG_REMOVE ? 'true' : 'false');
            dom.toolModeFogRemoveEl.hidden = !isDM();
            dom.toolModeFogRemoveEl.disabled = false;
        }
        if (dom.toolSizeInputEl && document.activeElement !== dom.toolSizeInputEl) {
            dom.toolSizeInputEl.value = String(stageState.tool.current.sizeCells);
        }
        if (dom.toolSizeInputEl) {
            const dragAreaModeActive = stageState.tool.current.mode === C.TOOL_MODE_FOG || stageState.tool.current.mode === C.TOOL_MODE_FOG_REMOVE || stageState.tool.current.mode === C.TOOL_MODE_NOTE || stageState.tool.current.mode === C.TOOL_MODE_PING;
            dom.toolSizeInputEl.disabled = dragAreaModeActive;
            dom.toolSizeInputEl.title = dragAreaModeActive ? 'Ping, Fog, and Zone tools do not use template size.' : '';
        }
        if (dom.stealthModeToggleEl) {
            const scene = getActiveScene();
            const enabled = !!(scene && scene.stealthMode);
            dom.stealthModeToggleEl.textContent = `Sight Cones: ${enabled ? 'On' : 'Off'}`;
            dom.stealthModeToggleEl.setAttribute('aria-pressed', enabled ? 'true' : 'false');
            dom.stealthModeToggleEl.hidden = !isDM();
            dom.stealthModeToggleEl.disabled = false;
        }
        if (dom.clearFogButtonEl) {
            const scene = getActiveScene();
            const fogCount = scene && Array.isArray(scene.fog) ? scene.fog.length : 0;
            dom.clearFogButtonEl.hidden = !isDM() || fogCount === 0;
            dom.clearFogButtonEl.disabled = false;
            dom.clearFogButtonEl.textContent = fogCount > 0 ? `Clear Fog (${fogCount})` : 'Clear Fog';
        }
        if (dom.body) dom.body.dataset.toolMode = stageState.tool.current.mode;
        renderModeChip();
    };

    const renderModeChip = () => {
        if (!dom.modeChipEl) return;
        const activeMode = normalizeToolMode(stageState.tool.current.mode);
        const showChip = activeMode !== C.TOOL_MODE_NAVIGATE;
        dom.modeChipEl.hidden = !showChip;
        if (!showChip) {
            dom.modeChipEl.textContent = '';
            return;
        }
        if (activeMode === C.TOOL_MODE_PING) {
            if (stageState.tool.pendingAskRollRequest) {
                dom.modeChipEl.textContent = `Ask to roll ${stageState.tool.pendingAskRollRequest.label} - click the map location`;
                return;
            }
            dom.modeChipEl.textContent = `${getPingVariantOptions().label} ping - click the map once · Esc or Select to cancel`;
            return;
        }
        dom.modeChipEl.textContent = `${getToolModeLabel(activeMode)} active · Esc or Select to finish`;
    };

    const positionNPCSearchPopover = () => {
        if (!dom.npcSearchPopoverEl || dom.npcSearchPopoverEl.hidden) return;
        const margin = 12;
        const gap = 8;
        const viewportWidth = Math.max(0, window.innerWidth || document.documentElement.clientWidth || 0);
        const viewportHeight = Math.max(0, window.innerHeight || document.documentElement.clientHeight || 0);
        const maxWidth = Math.max(0, viewportWidth - margin * 2);
        const maxHeight = Math.max(0, viewportHeight - margin * 2);

        dom.npcSearchPopoverEl.style.right = 'auto';
        dom.npcSearchPopoverEl.style.maxWidth = `${Math.round(maxWidth)}px`;
        dom.npcSearchPopoverEl.style.maxHeight = `${Math.round(maxHeight)}px`;

        const popoverWidth = Math.max(0, Math.min(dom.npcSearchPopoverEl.offsetWidth || maxWidth, maxWidth));
        const popoverHeight = dom.npcSearchPopoverEl.offsetHeight || 0;
        let left = margin;
        let top = margin;

        if (uiRuntime.npcSearch.state) {
            left = uiRuntime.npcSearch.state.clientX + 14;
            top = uiRuntime.npcSearch.state.clientY + 14;
            if (left + popoverWidth > viewportWidth - margin) {
                left = Math.max(margin, uiRuntime.npcSearch.state.clientX - popoverWidth - 14);
            }
            if (top + popoverHeight > viewportHeight - margin) {
                top = Math.max(margin, viewportHeight - popoverHeight - margin);
            }
        } else if (dom.npcSearchToggleEl) {
            const toggleRect = dom.npcSearchToggleEl.getBoundingClientRect();
            left = toggleRect.right - popoverWidth;
            left = clamp(left, margin, Math.max(margin, viewportWidth - popoverWidth - margin));

            top = toggleRect.bottom + gap;
            if (top + popoverHeight > viewportHeight - margin) {
                const aboveTop = toggleRect.top - popoverHeight - gap;
                top = aboveTop >= margin
                    ? aboveTop
                    : Math.max(margin, viewportHeight - popoverHeight - margin);
            }
        }

        dom.npcSearchPopoverEl.style.left = `${Math.round(left)}px`;
        dom.npcSearchPopoverEl.style.top = `${Math.round(top)}px`;
    };

    const positionTokenInspectorPopover = () => {
        if (!dom.tokenInspectorPopoverEl || dom.tokenInspectorPopoverEl.hidden || !uiRuntime.overlays.tokenInspector) return;
        const width = dom.tokenInspectorPopoverEl.offsetWidth || 420;
        const height = dom.tokenInspectorPopoverEl.offsetHeight || 520;
        const margin = 12;
        let left = uiRuntime.overlays.tokenInspector.clientX + 14;
        let top = uiRuntime.overlays.tokenInspector.clientY + 14;
        if (left + width > window.innerWidth - margin) {
            left = Math.max(margin, uiRuntime.overlays.tokenInspector.clientX - width - 14);
        }
        let bottomBoundary = window.innerHeight - margin;
        if (window.matchMedia('(min-width: 861px)').matches) {
            const tableHud = document.getElementById('vtt-table-hud');
            const hudRect = tableHud ? tableHud.getBoundingClientRect() : null;
            const hudStyle = tableHud ? window.getComputedStyle(tableHud) : null;
            if (hudRect && hudRect.height > 0 && hudStyle && hudStyle.opacity !== '0') {
                bottomBoundary = Math.min(bottomBoundary, hudRect.top - margin);
            }
        }
        if (top + height > bottomBoundary) {
            top = Math.max(margin, bottomBoundary - height);
        }
        if (window.matchMedia('(min-width: 861px)').matches) {
            const obstructionSelector = '.vtt-sidebar, .vtt-player-roll-rail, .vtt-initiative-panel, .vtt-admin-panel';
            document.querySelectorAll(obstructionSelector).forEach((obstruction) => {
                if (obstruction === dom.tokenInspectorPopoverEl) return;
                const style = window.getComputedStyle(obstruction);
                if (style.display === 'none' || style.visibility === 'hidden' || style.pointerEvents === 'none') return;
                const rect = obstruction.getBoundingClientRect();
                const overlapsVertically = top < rect.bottom && top + height > rect.top;
                const overlapsHorizontally = left < rect.right && left + width > rect.left;
                if (!overlapsVertically || !overlapsHorizontally) return;
                if (rect.left >= window.innerWidth / 2) {
                    left = Math.max(margin, rect.left - width - margin);
                } else {
                    left = Math.min(window.innerWidth - width - margin, rect.right + margin);
                }
            });
        }
        dom.tokenInspectorPopoverEl.style.left = `${Math.round(left)}px`;
        dom.tokenInspectorPopoverEl.style.top = `${Math.round(top)}px`;
    };

    const positionAnchoredPopover = (popoverEl, state, fallbackWidth = 360, fallbackHeight = 420, options = {}) => {
        if (!popoverEl || popoverEl.hidden || !state) return;
        const width = popoverEl.offsetWidth || fallbackWidth;
        const height = popoverEl.offsetHeight || fallbackHeight;
        const margin = 12;
        let left = toNumber(state.clientX, window.innerWidth / 2) + 14;
        let top = toNumber(state.clientY, window.innerHeight / 2) + 14;
        if (left + width > window.innerWidth - margin) {
            left = Math.max(margin, toNumber(state.clientX, window.innerWidth / 2) - width - 14);
        }
        let bottomBoundary = window.innerHeight - margin;
        if (options.avoidTableHud && window.matchMedia('(min-width: 861px)').matches) {
            const tableHud = document.getElementById('vtt-table-hud');
            const hudRect = tableHud ? tableHud.getBoundingClientRect() : null;
            const hudStyle = tableHud ? window.getComputedStyle(tableHud) : null;
            if (hudRect && hudRect.height > 0 && hudStyle && hudStyle.opacity !== '0') {
                bottomBoundary = Math.min(bottomBoundary, hudRect.top - margin);
            }
        }
        if (top + height > bottomBoundary) {
            top = Math.max(margin, bottomBoundary - height);
        }
        popoverEl.style.left = `${Math.round(left)}px`;
        popoverEl.style.top = `${Math.round(top)}px`;
    };

    const positionSheetActionPopover = () => positionAnchoredPopover(dom.sheetActionPopoverEl, uiRuntime.overlays.sheetAction, 380, 460);
    const positionNPCRollPopover = () => positionAnchoredPopover(dom.npcRollPopoverEl, uiRuntime.overlays.npcRoll, 360, 340);
    const positionStageContextMenu = () => positionAnchoredPopover(dom.stageContextMenuEl, uiRuntime.overlays.stageContextMenu, 340, 360, { avoidTableHud: true });

    const closeSheetActionPopover = () => {
        if (!uiRuntime.overlays.sheetAction && (!dom.sheetActionPopoverEl || dom.sheetActionPopoverEl.hidden)) return false;
        uiRuntime.overlays.sheetAction = null;
        uiRuntime.queries.sheetAction = '';
        if (dom.sheetActionPopoverEl) {
            dom.sheetActionPopoverEl.hidden = true;
            dom.sheetActionPopoverEl.innerHTML = '';
        }
        return true;
    };

    const closeNPCRollPopover = () => {
        if (!uiRuntime.overlays.npcRoll && (!dom.npcRollPopoverEl || dom.npcRollPopoverEl.hidden)) return false;
        uiRuntime.overlays.npcRoll = null;
        if (dom.npcRollPopoverEl) {
            dom.npcRollPopoverEl.hidden = true;
            dom.npcRollPopoverEl.innerHTML = '';
        }
        return true;
    };

    const closeStageContextMenu = () => {
        if (!uiRuntime.overlays.stageContextMenu && (!dom.stageContextMenuEl || dom.stageContextMenuEl.hidden)) return false;
        const closingState = uiRuntime.overlays.stageContextMenu;
        const shouldRestoreKeyboardFocus = !!(
            closingState
            && closingState.source === 'keyboard'
            && dom.stageContextMenuEl
            && typeof dom.stageContextMenuEl.contains === 'function'
            && dom.stageContextMenuEl.contains(document.activeElement)
        );
        uiRuntime.overlays.stageContextMenu = null;
        if (dom.stageContextMenuEl) {
            dom.stageContextMenuEl.hidden = true;
            dom.stageContextMenuEl.innerHTML = '';
        }
        if (shouldRestoreKeyboardFocus) {
            window.requestAnimationFrame(() => {
                const tokenId = String(closingState.tokenId || '').trim();
                const noteId = String(closingState.noteId || '').trim();
                const escapeSelector = (value) => window.CSS && typeof window.CSS.escape === 'function'
                    ? window.CSS.escape(value)
                    : value.replace(/"/g, '\\"');
                const returnTarget = tokenId
                    ? document.querySelector(`.vtt-token[data-token-id="${escapeSelector(tokenId)}"]`)
                    : (noteId
                        ? document.querySelector(`.vtt-map-note[data-note-id="${escapeSelector(noteId)}"]`)
                        : dom.stageEl);
                if (returnTarget && typeof returnTarget.focus === 'function') returnTarget.focus();
            });
        }
        return true;
    };

    const closeInitiativeDetail = (options = {}) => {
        if (!uiRuntime.overlays.initiativeDetail && (!dom.initiativeDetailPanelEl || dom.initiativeDetailPanelEl.hidden)) return false;
        const closingEntryId = String(uiRuntime.overlays.initiativeDetail && uiRuntime.overlays.initiativeDetail.entryId || '').trim();
        uiRuntime.overlays.initiativeDetail = null;
        if (dom.initiativeDetailPanelEl) dom.initiativeDetailPanelEl.hidden = true;
        if (options.restoreFocus && closingEntryId) {
            window.requestAnimationFrame(() => {
                const selectorId = window.CSS && typeof window.CSS.escape === 'function'
                    ? window.CSS.escape(closingEntryId)
                    : closingEntryId.replace(/"/g, '\\"');
                const returnTarget = dom.initiativeListEl
                    ? dom.initiativeListEl.querySelector(`[data-action="edit-entry"][data-id="${selectorId}"]`)
                    : null;
                if (returnTarget && typeof returnTarget.focus === 'function') returnTarget.focus({ preventScroll: true });
            });
        }
        return true;
    };

    const openInitiativeDetail = (entryId, clientX, clientY) => {
        const targetId = String(entryId || '').trim();
        if (!targetId || !isDM()) return false;
        if (getAllowedVTTPanel(uiRuntime.preferences.activeVttPanel) !== 'combat') {
            setActiveVTTPanel('combat', { focus: false });
        }
        setCombatView('turns');
        stageState.selection.entryId = targetId;
        uiRuntime.overlays.initiativeDetail = {
            entryId: targetId,
            clientX: Math.round(toNumber(clientX, window.innerWidth / 2)),
            clientY: Math.round(toNumber(clientY, window.innerHeight / 2)),
            focusRequested: true
        };
        return true;
    };

    const positionInitiativeDetail = () => {
        if (!dom.initiativeDetailPanelEl || dom.initiativeDetailPanelEl.hidden || !uiRuntime.overlays.initiativeDetail) return;
        if (getAllowedVTTPanel(uiRuntime.preferences.activeVttPanel) === 'combat'
            && dom.initiativePanelEl
            && dom.initiativePanelEl.contains(dom.initiativeDetailPanelEl)) {
            dom.initiativeDetailPanelEl.style.removeProperty('left');
            dom.initiativeDetailPanelEl.style.removeProperty('top');
            return;
        }
        const width = dom.initiativeDetailPanelEl.offsetWidth || 360;
        const height = dom.initiativeDetailPanelEl.offsetHeight || 420;
        const margin = 12;
        let left = uiRuntime.overlays.initiativeDetail.clientX + 14;
        let top = uiRuntime.overlays.initiativeDetail.clientY + 14;
        if (left + width > window.innerWidth - margin) {
            left = Math.max(margin, uiRuntime.overlays.initiativeDetail.clientX - width - 14);
        }
        if (top + height > window.innerHeight - margin) {
            top = Math.max(margin, window.innerHeight - height - margin);
        }
        dom.initiativeDetailPanelEl.style.left = `${Math.round(left)}px`;
        dom.initiativeDetailPanelEl.style.top = `${Math.round(top)}px`;
    };

    const normalizeCombatView = (view) => String(view || '').trim() === 'clocks' ? 'clocks' : 'turns';

    const applyCombatWorkspaceView = () => {
        const view = normalizeCombatView(uiRuntime.combat && uiRuntime.combat.view);
        if (uiRuntime.combat) uiRuntime.combat.view = view;
        const expanded = getAllowedVTTPanel(uiRuntime.preferences.activeVttPanel) === 'combat';
        if (dom.body) dom.body.dataset.combatView = view;
        const turnsPanel = document.getElementById('vtt-initiative-workspace');
        const clocksPanel = document.getElementById('vtt-clock-panel');
        document.querySelectorAll('[data-action="set-combat-view"][data-combat-view]').forEach((buttonEl) => {
            const selected = normalizeCombatView(buttonEl.dataset.combatView) === view;
            buttonEl.setAttribute('aria-selected', selected ? 'true' : 'false');
            buttonEl.tabIndex = selected ? 0 : -1;
        });
        if (turnsPanel) {
            turnsPanel.hidden = expanded && view !== 'turns';
            turnsPanel.setAttribute('aria-hidden', expanded && view !== 'turns' ? 'true' : 'false');
        }
        if (clocksPanel) {
            clocksPanel.hidden = expanded && view !== 'clocks';
            clocksPanel.setAttribute('aria-hidden', expanded && view !== 'clocks' ? 'true' : 'false');
        }
    };

    const setCombatView = (view) => {
        if (!uiRuntime.combat) uiRuntime.combat = { view: 'turns' };
        uiRuntime.combat.view = normalizeCombatView(view);
        applyCombatWorkspaceView();
    };

    const focusClockEditor = (clockId) => {
        const targetId = String(clockId || '').trim();
        if (!targetId) return;
        window.requestAnimationFrame(() => {
            const selectorId = window.CSS && typeof window.CSS.escape === 'function'
                ? window.CSS.escape(targetId)
                : targetId.replace(/"/g, '\\"');
            const editor = dom.clockListEl
                ? dom.clockListEl.querySelector(`[data-clock-editor="${selectorId}"]`)
                : null;
            if (!editor) return;
            if (typeof editor.scrollIntoView === 'function') editor.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            const titleInput = editor.querySelector('[data-clock-field="title"]');
            if (titleInput && typeof titleInput.focus === 'function') {
                titleInput.focus({ preventScroll: true });
                if (typeof titleInput.select === 'function') titleInput.select();
            }
        });
    };

    const applyUIPreferences = () => {
        if (dom.body) {
            dom.body.dataset.topbarCollapsed = uiRuntime.preferences.topbarCollapsed ? '1' : '0';
            dom.body.dataset.gridHidden = uiRuntime.preferences.showGrid ? '0' : '1';
            dom.body.dataset.tokenNamesHidden = uiRuntime.preferences.showTokenNames ? '0' : '1';
            dom.body.dataset.activeVttPanel = getAllowedVTTPanel(uiRuntime.preferences.activeVttPanel);
        }
        applyCombatWorkspaceView();
        if (dom.topbarTabEl) {
            dom.topbarTabEl.textContent = uiRuntime.preferences.topbarCollapsed ? 'Table info' : 'Hide header';
            dom.topbarTabEl.title = uiRuntime.preferences.topbarCollapsed ? 'Show table information and view controls' : 'Hide the table header';
            dom.topbarTabEl.setAttribute('aria-label', uiRuntime.preferences.topbarCollapsed ? 'Show table information and view controls' : 'Hide the table header');
            dom.topbarTabEl.setAttribute('aria-pressed', uiRuntime.preferences.topbarCollapsed ? 'false' : 'true');
        }
        if (dom.topbarEl) {
            dom.topbarEl.querySelectorAll('.vtt-topbar-brand, .vtt-topbar-toolbar').forEach((sectionEl) => {
                sectionEl.inert = !!uiRuntime.preferences.topbarCollapsed;
                sectionEl.setAttribute('aria-hidden', uiRuntime.preferences.topbarCollapsed ? 'true' : 'false');
            });
        }
        if (dom.settingsRailTabEl) {
            dom.settingsRailTabEl.textContent = 'Close';
            dom.settingsRailTabEl.title = 'Close table workspace';
            dom.settingsRailTabEl.setAttribute('aria-label', 'Close table workspace');
            dom.settingsRailTabEl.removeAttribute('aria-pressed');
        }
        if (dom.playerRollRailTabEl) {
            dom.playerRollRailTabEl.textContent = 'Close';
            dom.playerRollRailTabEl.title = 'Close player controls';
            dom.playerRollRailTabEl.setAttribute('aria-label', 'Close player controls');
            dom.playerRollRailTabEl.removeAttribute('aria-pressed');
        }
        if (dom.initiativeRailTabEl) {
            dom.initiativeRailTabEl.textContent = 'Collapse';
            dom.initiativeRailTabEl.title = 'Collapse combat panel';
            dom.initiativeRailTabEl.setAttribute('aria-label', 'Collapse combat panel');
            dom.initiativeRailTabEl.removeAttribute('aria-pressed');
        }
        if (dom.tokenNamesToggleEl) {
            dom.tokenNamesToggleEl.textContent = `Token Names: ${uiRuntime.preferences.showTokenNames ? 'On' : 'Off'}`;
            dom.tokenNamesToggleEl.setAttribute('aria-pressed', uiRuntime.preferences.showTokenNames ? 'true' : 'false');
        }
        if (dom.gridToggleEl) {
            dom.gridToggleEl.textContent = `Grid: ${uiRuntime.preferences.showGrid ? 'On' : 'Off'}`;
            dom.gridToggleEl.setAttribute('aria-pressed', uiRuntime.preferences.showGrid ? 'true' : 'false');
        }
        const activePanel = getAllowedVTTPanel(uiRuntime.preferences.activeVttPanel);
        document.querySelectorAll('[data-action="open-vtt-panel"][data-panel]').forEach((buttonEl) => {
            const isActive = String(buttonEl.dataset.panel || '').trim() === activePanel;
            buttonEl.setAttribute('aria-expanded', isActive ? 'true' : 'false');
            if (buttonEl.closest('.vtt-drawer-tabs')) buttonEl.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });
        if (dom.sidebarEl) {
            dom.sidebarEl.tabIndex = -1;
            const sidebarOpen = activePanel === 'setup' || activePanel === 'spawn' || activePanel === 'inspector';
            dom.sidebarEl.inert = !sidebarOpen;
            dom.sidebarEl.setAttribute('aria-hidden', sidebarOpen ? 'false' : 'true');
        }
        if (dom.playerRollPanelEl) {
            dom.playerRollPanelEl.tabIndex = -1;
            const playerActionsOpen = activePanel === 'player-rolls';
            if (dom.playerRollRailEl) dom.playerRollRailEl.inert = !playerActionsOpen;
            dom.playerRollPanelEl.setAttribute('aria-hidden', playerActionsOpen ? 'false' : 'true');
        }
        if (dom.initiativePanelEl) {
            dom.initiativePanelEl.tabIndex = -1;
            const combatSuppressed = !!(activePanel && activePanel !== 'combat');
            dom.initiativePanelEl.inert = combatSuppressed;
            dom.initiativePanelEl.setAttribute('aria-hidden', combatSuppressed ? 'true' : 'false');
            dom.initiativePanelEl.querySelectorAll('.vtt-initiative-expand').forEach((buttonEl) => {
                buttonEl.setAttribute('aria-expanded', activePanel === 'combat' ? 'true' : 'false');
            });
        }
        if (dom.adminPanelEl) {
            dom.adminPanelEl.tabIndex = -1;
            const adminOpen = activePanel === 'admin';
            dom.adminPanelEl.inert = !adminOpen;
            dom.adminPanelEl.setAttribute('aria-hidden', adminOpen ? 'false' : 'true');
        }
        if (dom.playerRollsButtonEl) {
            dom.playerRollsButtonEl.setAttribute('aria-expanded', activePanel === 'player-rolls' ? 'true' : 'false');
        }
        renderViewMenu();
    };

    const loadUIPreferences = (options = {}) => {
        const preservedActivePanel = options.preserveActivePanel
            ? getAllowedVTTPanel(uiRuntime.preferences.activeVttPanel)
            : '';
        try {
            const raw = localStorage.getItem(getUIPrefsStorageKey());
            const parsed = raw ? JSON.parse(raw) : {};
            uiRuntime.preferences = {
                topbarCollapsed: parsed && Object.prototype.hasOwnProperty.call(parsed, 'topbarCollapsed') ? !!parsed.topbarCollapsed : true,
                showGrid: parsed && parsed.showGrid !== undefined ? !!parsed.showGrid : true,
                showTokenNames: parsed && parsed.showTokenNames !== undefined ? !!parsed.showTokenNames : true,
                sceneViewMode: parsed && parsed.sceneViewMode === C.SCENE_VIEW_LOCAL ? C.SCENE_VIEW_LOCAL : C.SCENE_VIEW_SHARED,
                localSceneId: String(parsed && parsed.localSceneId || '').trim(),
                activeVttPanel: preservedActivePanel
            };
        } catch (err) {
            uiRuntime.preferences = {
                topbarCollapsed: true,
                showGrid: true,
                showTokenNames: true,
                sceneViewMode: C.SCENE_VIEW_SHARED,
                localSceneId: '',
                activeVttPanel: preservedActivePanel
            };
        }
        applyUIPreferences();
    };

    const persistUIPreferences = () => {
        try {
            const { activeVttPanel, ...persistentPreferences } = uiRuntime.preferences;
            localStorage.setItem(getUIPrefsStorageKey(), JSON.stringify(persistentPreferences));
        } catch (err) {
            // Ignore local-only preference persistence failures.
        }
    };

    const toggleUIPreference = (key) => {
        uiRuntime.preferences[key] = !uiRuntime.preferences[key];
        persistUIPreferences();
        applyUIPreferences();
        window.requestAnimationFrame(() => {
            applyWorldTransform();
        });
    };

    const cancelAskRollPickMode = () => {
        const wasActive = !!(stageState.tool.askRollPickMode || stageState.tool.pendingAskRollRequest);
        stageState.tool.askRollPickMode = false;
        stageState.tool.pendingAskRollRequest = null;
        if (wasActive && stageState.tool.current.mode === C.TOOL_MODE_PING) setToolMode(C.TOOL_MODE_NAVIGATE);
        return wasActive;
    };

    const getActiveScene = (state = sessionState.snapshot) => {
        if (!state || !Array.isArray(state.scenes) || !state.scenes.length) return null;
        const viewedSceneId = getViewedSceneId(state);
        return state.scenes.find((scene) => scene.id === viewedSceneId) || state.scenes[0] || null;
    };

    const getCombatScene = (state = sessionState.snapshot) => {
        if (!state || !Array.isArray(state.scenes) || !state.scenes.length) return null;
        const initiative = state.initiative && typeof state.initiative === 'object' ? state.initiative : {};
        const encounterSceneId = initiative.encounterActive ? String(initiative.sceneId || '').trim() : '';
        if (encounterSceneId) {
            const encounterScene = state.scenes.find((scene) => String(scene && scene.id || '').trim() === encounterSceneId);
            if (encounterScene) return encounterScene;
        }
        return getActiveScene(state);
    };

    const getSceneById = (sceneId, state = sessionState.snapshot) => {
        if (!state || !Array.isArray(state.scenes) || !state.scenes.length) return null;
        const targetId = String(sceneId || '').trim();
        if (!targetId) return null;
        return state.scenes.find((scene) => scene.id === targetId) || null;
    };

    const getSceneMapScale = (scene) => clampMapScale(scene && scene.mapScale, 1);

    const getSharedSceneId = (state = sessionState.snapshot) => {
        if (!state || !Array.isArray(state.scenes) || !state.scenes.length) return '';
        const preferredId = String(state.activeSceneId || '').trim();
        return state.scenes.some((scene) => scene.id === preferredId)
            ? preferredId
            : String(state.scenes[0] && state.scenes[0].id || '').trim();
    };

    const getSnapshotChangedSceneIds = (previousSnapshot, nextSnapshot) => {
        const changedSceneIds = new Set();
        const previousScenes = Array.isArray(previousSnapshot && previousSnapshot.scenes) ? previousSnapshot.scenes : [];
        const nextScenes = Array.isArray(nextSnapshot && nextSnapshot.scenes) ? nextSnapshot.scenes : [];
        const previousSceneMap = new Map(previousScenes.map((scene) => [String(scene && scene.id || '').trim(), scene]));
        const nextSceneMap = new Map(nextScenes.map((scene) => [String(scene && scene.id || '').trim(), scene]));
        const allSceneIds = new Set([...previousSceneMap.keys(), ...nextSceneMap.keys()].filter(Boolean));

        allSceneIds.forEach((sceneId) => {
            const previousScene = previousSceneMap.get(sceneId) || null;
            const nextScene = nextSceneMap.get(sceneId) || null;
            if (JSON.stringify(previousScene) !== JSON.stringify(nextScene)) changedSceneIds.add(sceneId);
        });

        const previousSharedSceneId = getSharedSceneId(previousSnapshot);
        const nextSharedSceneId = getSharedSceneId(nextSnapshot);
        if (previousSharedSceneId !== nextSharedSceneId && nextSharedSceneId) {
            changedSceneIds.add(nextSharedSceneId);
        }

        const previousInitiative = previousSnapshot && previousSnapshot.initiative ? previousSnapshot.initiative : null;
        const nextInitiative = nextSnapshot && nextSnapshot.initiative ? nextSnapshot.initiative : null;
        if (JSON.stringify(previousInitiative) !== JSON.stringify(nextInitiative) && nextSharedSceneId) {
            changedSceneIds.add(nextSharedSceneId);
        }

        return changedSceneIds;
    };

    const isUsingLocalSceneView = (state = sessionState.snapshot, role = sessionState.role) => {
        if (role !== 'dm') return false;
        if (uiRuntime.preferences.sceneViewMode !== C.SCENE_VIEW_LOCAL) return false;
        const localSceneId = String(uiRuntime.preferences.localSceneId || '').trim();
        return !!(localSceneId && state && Array.isArray(state.scenes) && state.scenes.some((scene) => scene.id === localSceneId));
    };

    const getViewedSceneId = (state = sessionState.snapshot, role = sessionState.role) => (
        isUsingLocalSceneView(state, role) ? String(uiRuntime.preferences.localSceneId || '').trim() : getSharedSceneId(state)
    );

    const isSharedSceneForBroadcast = (scene = getActiveScene(), state = sessionState.snapshot) => {
        if (!canUseSharedPlayerTools() || !scene || !state) return false;
        const sceneId = String(scene.id || '').trim();
        return !!sceneId && sceneId === getSharedSceneId(state);
    };
    const canBroadcastFromViewedScene = () => isSharedSceneForBroadcast();

    const setSceneViewPreference = (mode, sceneId = '') => {
        const cleanMode = mode === C.SCENE_VIEW_LOCAL && isDM() ? C.SCENE_VIEW_LOCAL : C.SCENE_VIEW_SHARED;
        const cleanSceneId = String(sceneId || '').trim();
        uiRuntime.preferences.sceneViewMode = cleanMode;
        uiRuntime.preferences.localSceneId = cleanMode === C.SCENE_VIEW_LOCAL ? cleanSceneId : '';
        persistUIPreferences();
    };
    const maybeFollowRemoteActivityForDM = (sceneIds = new Set(), state = sessionState.snapshot) => {
        if (!isDM() || !isUsingLocalSceneView(state, sessionState.role)) return false;
        if (stageState.pointer.drag || stageState.pointer.spawnDrag || stageState.placement.annotation || stageState.placement.fog || stageState.placement.evidenceNote || stageState.placement.evidenceNoteDrag || stageState.placement.template || stageState.placement.templateRotate || stageState.placement.visionConeRotate || stageState.placement.ruler) return false;
        const sharedSceneId = getSharedSceneId(state);
        if (!sharedSceneId || !sceneIds.has(sharedSceneId)) return false;
        const viewedSceneId = getViewedSceneId(state, sessionState.role);
        if (viewedSceneId === sharedSceneId) return false;
        setSceneViewPreference(C.SCENE_VIEW_SHARED);
        stageState.preview.tokenId = '';
        stageState.view.fitOnNextMapLoad = true;
        return true;
    };
    const canEditInitiative = () => isDM();

    const getTokenById = (tokenId, state = sessionState.snapshot) => {
        const scene = getActiveScene(state);
        if (!scene || !Array.isArray(scene.tokens)) return null;
        return scene.tokens.find((token) => token.id === tokenId) || null;
    };

    const getEntryById = (entryId, state = sessionState.snapshot) => {
        const entries = state && state.initiative && Array.isArray(state.initiative.entries) ? state.initiative.entries : [];
        return entries.find((entry) => entry.id === entryId) || null;
    };

    const getPlayers = () => {
        const store = getStore();
        return store && typeof store.getPlayers === 'function' ? store.getPlayers() : [];
    };

    const findPlayerById = (playerId) => {
        const targetId = String(playerId || '').trim();
        if (!targetId) return null;
        return getPlayers().find((player) => String(player && player.id || '') === targetId) || null;
    };

    const capturePlayerImagesAtLoad = () => {
        resources.playerImageUrlsAtLoad.clear();
        getPlayers().forEach((player) => {
            const playerId = String(player && player.id || '').trim();
            if (!playerId) return;
            resources.playerImageUrlsAtLoad.set(playerId, toSharedTokenImageUrl(player && player.imageUrl));
        });
    };

    const refreshPlayerImageCache = () => {
        capturePlayerImagesAtLoad();
    };

    const getNPCs = () => {
        const store = getStore();
        return store && typeof store.getNPCs === 'function' ? store.getNPCs() : [];
    };

    const ensureNPCSearchData = async () => {
        if (resources.npcSearch.refreshPromise) return resources.npcSearch.refreshPromise;
        const store = getStore();
        resources.npcSearch.loading = true;
        renderNPCSearchPopover();
        resources.npcSearch.refreshPromise = (async () => {
            if (window.RTF_DATA_LOADER && typeof window.RTF_DATA_LOADER.ensureDatasets === 'function') {
                try {
                    await window.RTF_DATA_LOADER.ensureDatasets(['npcs']);
                } catch (err) {
                    console.warn('Failed loading VTT NPC dataset', err);
                }
            }
            await ensureMonsterDirectory();
            if (store && typeof store.refreshNPCDirectoryForVTT === 'function') {
                try {
                    await store.refreshNPCDirectoryForVTT();
                } catch (err) {
                    console.warn('Failed refreshing VTT NPC directory', err);
                }
            }
        })().finally(() => {
            resources.npcSearch.loading = false;
            resources.npcSearch.refreshPromise = null;
            renderNPCSearchPopover();
        });
        return resources.npcSearch.refreshPromise;
    };

    const normalizeMoveAccess = (value, fallback = 'dm') => {
        const clean = String(value || fallback || 'dm').trim().toLowerCase();
        return clean === 'player' ? 'player' : 'dm';
    };

    const hasLocalSheetKey = (sheetKey) => {
        const cleanSheetKey = String(sheetKey || '').trim();
        if (!cleanSheetKey) return false;
        const bundle = getActiveSheetBundle(cleanSheetKey);
        return !!(
            bundle
            && bundle.character
            && String(bundle.character.meta && bundle.character.meta.sheetKey || '').trim() === cleanSheetKey
        );
    };

    const getRosterPlayerForRecord = (record) => {
        const source = record && typeof record === 'object' ? record : null;
        if (!source) return null;
        if (String(source.sourceType || '').trim() === 'player') {
            return findPlayerById(source.sourceId);
        }
        return null;
    };

    const getTokenLinkedSheetKey = (token) => {
        if (!token || typeof token !== 'object') return '';
        if (String(token.sourceType || '').trim() === 'sheet') return String(token.sourceId || '').trim();
        const rosterPlayer = getRosterPlayerForRecord(token);
        return String(rosterPlayer && rosterPlayer.sheetKey || '').trim();
    };

    const getRosterPlayerImageUrlForToken = (token) => {
        if (String(token && token.sourceType || '').trim() !== 'player') return null;
        const playerId = String(token && token.sourceId || '').trim();
        if (!playerId || !resources.playerImageUrlsAtLoad.has(playerId)) return '';
        return resources.playerImageUrlsAtLoad.get(playerId) || '';
    };

    const getCanonicalTokenImageUrl = (token) => {
        if (!token) return '';
        const rosterImageUrl = getRosterPlayerImageUrlForToken(token);
        if (rosterImageUrl !== null) return rosterImageUrl || String(token.imageUrl || '').trim();
        return String(token.imageUrl || '').trim();
    };

    const getTokenMetadataImageUrl = (token) => {
        if (String(token && token.sourceType || '').trim() === 'player') return '';
        return String(token && token.imageUrl || '').trim();
    };

    const syncTokenRosterIdentity = (token, player) => {
        if (!token || !player) return false;
        const nextLabel = String(player.name || 'Player').trim() || 'Player';
        let mutated = false;
        if (token.label !== nextLabel) {
            token.label = nextLabel;
            mutated = true;
        }
        if (token.imageUrl) {
            token.imageUrl = '';
            mutated = true;
        }
        return mutated;
    };

    const syncEntryRosterIdentity = (entry, player) => {
        if (!entry || !player) return false;
        const nextName = String(player.name || 'Player').trim() || 'Player';
        let mutated = false;
        if (entry.name !== nextName) {
            entry.name = nextName;
            mutated = true;
        }
        if (entry.imageUrl) {
            entry.imageUrl = '';
            mutated = true;
        }
        if (entry.sourceType !== 'player') {
            entry.sourceType = 'player';
            mutated = true;
        }
        const nextSourceId = String(player.id || '').trim();
        if ((entry.sourceId || '') !== nextSourceId) {
            entry.sourceId = nextSourceId;
            mutated = true;
        }
        return mutated;
    };

    const syncRosterLinkedPlayerPresentation = (state = sessionState.snapshot) => {
        if (!state || !Array.isArray(state.scenes) || !state.initiative || !Array.isArray(state.initiative.entries)) return false;
        const players = getPlayers();
        if (!players.length) return false;
        const playersById = new Map(players.map((player) => [String(player && player.id || '').trim(), player]).filter(([id]) => !!id));
        if (!playersById.size) return false;

        let mutated = false;
        const playerByTokenId = new Map();
        state.scenes.forEach((scene) => {
            if (!scene || !Array.isArray(scene.tokens)) return;
            scene.tokens.forEach((token) => {
                const player = playersById.get(String(token && token.sourceId || '').trim());
                if (!player || String(token && token.sourceType || '').trim() !== 'player') return;
                if (syncTokenRosterIdentity(token, player)) mutated = true;
                playerByTokenId.set(String(token.id || '').trim(), player);
            });
        });

        state.initiative.entries.forEach((entry) => {
            const isPlayerEntry = String(entry && entry.sourceType || '').trim() === 'player';
            const linkedPlayer = (isPlayerEntry ? playersById.get(String(entry && entry.sourceId || '').trim()) : null)
                || playerByTokenId.get(String(entry && entry.linkedTokenId || '').trim())
                || null;
            if (!linkedPlayer) return;
            if (syncEntryRosterIdentity(entry, linkedPlayer)) mutated = true;
        });

        return mutated;
    };

    const canRoleMoveToken = (token, role = sessionState.role) => {
        if (!token) return false;
        if (role === 'dm') return true;
        if (role === 'spectator') return false;
        if (normalizeMoveAccess(token.moveAccess, token.sourceType === 'player' ? 'player' : 'dm') !== 'player') return false;
        const sourceType = String(token.sourceType || '').trim();
        if (sourceType === 'player') {
            const tokenPlayerId = String(token.sourceId || '').trim();
            const localPlayerId = String(getLocalPlayerFocusContext().playerId || '').trim();
            // A roster player token has no trustworthy local owner until its roster entry is
            // linked to a local sheet. Keep it locked rather than granting every player client
            // control during that setup window.
            return !!(tokenPlayerId && localPlayerId && tokenPlayerId === localPlayerId);
        }
        const linkedSheetKey = getTokenLinkedSheetKey(token);
        if (linkedSheetKey) return hasLocalSheetKey(linkedSheetKey);
        return true;
    };

    const getActiveCaseName = () => {
        const store = getStore();
        if (!store || typeof store.getActiveCase !== 'function') return 'Primary Case';
        const active = store.getActiveCase();
        return active && active.name ? active.name : 'Primary Case';
    };

    const getCaseSwitcherEntries = () => {
        const store = getStore();
        if (!store || typeof store.getCases !== 'function') return [];
        return store.getCases()
            .map((entry) => ({
                id: String(entry && entry.id || '').trim(),
                name: String(entry && entry.name || entry && entry.id || '').trim()
            }))
            .filter((entry) => entry.id);
    };

    const switchVTTCase = async (caseId) => {
        const store = getStore();
        const targetId = String(caseId || '').trim();
        if (!targetId || !store || typeof store.setActiveCase !== 'function') return false;
        const previousCaseId = getActiveCaseId();
        if (targetId === previousCaseId && sessionState.stateCaseId === targetId && !sessionState.initialLoadPending) return true;
        const transitionId = ++sessionState.caseTransitionId;
        sessionState.pendingCaseId = targetId;
        sessionState.initialLoadPending = true;
        if (targetId !== getActiveCaseId() && !store.setActiveCase(targetId)) {
            if (transitionId === sessionState.caseTransitionId) {
                sessionState.pendingCaseId = '';
                sessionState.initialLoadPending = false;
            }
            return false;
        }

        clearTokenPortraitPreview();
        closeQuickSpawnMenu();
        closeStageContextMenu();
        closeTokenInspectorPopover();
        closeSheetActionPopover();
        closeNPCRollPopover();
        stageState.selection.tokenId = '';
        stageState.selection.entryId = '';
        stageState.selection.templateId = '';
        stageState.selection.evidenceNoteId = '';
        stageState.selection.clockId = '';
        sessionState.pendingRemoteSnapshot = null;
        stageState.pointer.drag = null;
        stageState.pointer.pan = null;
        clearTemplatePlacementState();
        stageState.view.fitOnNextMapLoad = true;

        loadUIPreferences();
        loadRolePreference();
        const nextSnapshot = await loadInitialVTTSnapshot(store, targetId);
        if (transitionId !== sessionState.caseTransitionId || getActiveCaseId() !== targetId) return false;
        if (!nextSnapshot) {
            const collabStatus = getVTTCollabPendingStatus();
            const preflightFailureDetail = String(
                collabStatus && collabStatus.detail
                    ? collabStatus.detail
                    : 'The selected VTT case could not be loaded.'
            ).trim();
            const restoredPreviousCase = !previousCaseId
                || previousCaseId === targetId
                || store.setActiveCase(previousCaseId);
            sessionState.pendingCaseId = '';
            sessionState.initialLoadPending = false;
            if (!restoredPreviousCase) {
                sessionState.snapshot = null;
                sessionState.stateCaseId = '';
                if (dom.mapImageEl) {
                    dom.mapImageEl.removeAttribute('src');
                    dom.mapImageEl.style.display = 'none';
                }
                [dom.gridLayerEl, dom.fogLayerEl, dom.annotationLayerEl, dom.noteLayerEl, dom.templateLayerEl, dom.tokenLayerEl, dom.visionLayerEl]
                    .filter(Boolean)
                    .forEach((layer) => layer.replaceChildren());
                renderSceneList();
                setVTTCollabStatus({
                    state: 'degraded',
                    detail: `${preflightFailureDetail} The previous case could not be restored, so the stage was cleared.`,
                    peerCount: 0
                });
                return false;
            }
            loadUIPreferences();
            loadRolePreference();
            normalizeSelections();
            render();
            setVTTCollabStatus({
                state: 'degraded',
                detail: `${preflightFailureDetail} Stayed on the previous case.`,
                peerCount: 0
            });
            return false;
        }
        sessionState.snapshot = ensureRosterLinkedPlayerPresentationPersisted(nextSnapshot, {
            persist: false,
            reason: 'case-switch'
        }).snapshot;
        sessionState.stateCaseId = targetId;
        sessionState.pendingCaseId = '';
        sessionState.initialLoadPending = false;
        normalizeSelections();
        render();

        await refreshVTTCollabRoomIfNeeded(targetId, transitionId);
        return true;
    };

    const readProcessedRollIds = () => {
        try {
            const raw = localStorage.getItem(getProcessedInitStorageKey());
            const parsed = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed) ? parsed.map((entry) => String(entry || '')).filter(Boolean) : [];
        } catch (err) {
            return [];
        }
    };

    const markProcessedRollIds = (rollIds) => {
        const existing = new Set(readProcessedRollIds());
        (Array.isArray(rollIds) ? rollIds : [rollIds]).forEach((entry) => {
            const token = String(entry || '').trim();
            if (token) existing.add(token);
        });
        const next = Array.from(existing.values()).slice(-500);
        localStorage.setItem(getProcessedInitStorageKey(), JSON.stringify(next));
    };

    const getMonsterDirectory = () => resources.monsters.directory;
    const findMonsterById = (monsterId) => vttRules.findMonsterById(getMonsterDirectory(), monsterId);
    const filterMonsterDirectory = (query = '', limit = C.MONSTER_ASSIGN_RESULT_LIMIT) => (
        vttRules.filterMonsterDirectory(getMonsterDirectory(), query, limit)
    );
    const findMonsterForAssignmentQuery = (query = '', selectedId = '') => (
        vttRules.findMonsterForAssignmentQuery(getMonsterDirectory(), query, selectedId)
    );
    const buildMonsterAssignResultsMarkup = (query = '', selectedId = '') => {
        if (resources.monsters.loading) return '<div class="vtt-empty">Loading SRD monsters...</div>';
        const monsters = filterMonsterDirectory(query, C.MONSTER_ASSIGN_RESULT_LIMIT);
        if (!monsters.length) {
            return `<div class="vtt-empty">${query ? 'No SRD monsters match that filter.' : 'No SRD monsters loaded yet.'}</div>`;
        }
        return monsters.map((monster) => {
            const monsterId = String(monster && monster.id || '').trim();
            const isSelected = selectedId && monsterId === selectedId;
            return `
                <button class="vtt-token-spawn vtt-monster-assign-result${isSelected ? ' is-selected' : ''}" type="button" data-action="select-token-monster-assignment" data-monster-id="${escapeHtml(monsterId)}">
                    <span class="vtt-token-spawn-name">${escapeHtml(monster.name || 'Monster')}</span>
                    <span class="vtt-token-spawn-meta">CR ${escapeHtml(monster.challengeRating || '?')}${monster.type ? ` · ${escapeHtml(monster.type)}` : ''}${monster.size ? ` · ${escapeHtml(monster.size)}` : ''}</span>
                </button>
            `;
        }).join('');
    };
    const ensureMonsterDirectory = async () => {
        if (resources.monsters.directory.length) return resources.monsters.directory;
        if (resources.monsters.promise) return resources.monsters.promise;
        resources.monsters.loading = true;
        renderNPCSearchPopover();
        resources.monsters.promise = fetch(C.SRD_MONSTER_DATA_URL)
            .then((response) => {
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                return response.json();
            })
            .then((payload) => {
                const records = payload && typeof payload === 'object'
                    ? Object.entries(payload).filter(([key, value]) => key !== '_info' && value && typeof value === 'object')
                    : [];
                resources.monsters.directory = records
                    .map(([key, value]) => normalizeMonsterRecord(value, key))
                    .sort((left, right) => left.name.localeCompare(right.name));
                return resources.monsters.directory;
            })
            .catch((err) => {
                console.warn('Failed loading SRD monster directory', err);
                resources.monsters.directory = [];
                return resources.monsters.directory;
            })
            .finally(() => {
                resources.monsters.loading = false;
                resources.monsters.promise = null;
                renderNPCSearchPopover();
                renderTokenInspector();
                renderTokenInspectorPopover();
                renderNPCRollPopover();
            });
        return resources.monsters.promise;
    };

    const getNextGuildlessTokenNumber = (scene) => {
        if (!scene || !Array.isArray(scene.tokens)) return 1;
        let maxGuildlessNumber = 0;
        scene.tokens.forEach((token) => {
            const label = String(token && token.label || '').trim();
            const match = label.match(C.GUILDLESS_LABEL_PATTERN);
            if (!match) return;
            const nextNumber = match[1] ? Math.max(1, Math.round(toNumber(match[1], 1))) : 1;
            if (nextNumber > maxGuildlessNumber) maxGuildlessNumber = nextNumber;
        });
        return maxGuildlessNumber + 1;
    };

    const buildGuildlessTokenLabel = (scene = null) => `Guildless ${getNextGuildlessTokenNumber(scene)}`;

    const buildGuildlessToken = (label = 'Guildless') => ({
        ...buildCustomToken(),
        label,
        imageUrl: buildGuildlessImageUrl()
    });

    const findSpawnSource = (kind, id = '') => {
        const sourceId = String(id || '').trim();
        if (kind === 'player') {
            return getPlayers().find((entry) => String(entry && entry.id || '') === sourceId) || null;
        }
        if (kind === 'npc') {
            return getNPCs().find((entry) => String(entry && entry.id || '') === sourceId) || null;
        }
        if (kind === 'monster') {
            return findMonsterById(sourceId);
        }
        if (kind === 'guildless') {
            return { name: 'Guildless' };
        }
        if (kind === 'custom') {
            return { name: 'Custom Token' };
        }
        return null;
    };

    const getSpawnDescriptorLabel = (kind, id = '') => {
        if (kind === 'guildless') return buildGuildlessTokenLabel(getActiveScene(sessionState.snapshot));
        const source = findSpawnSource(kind, id);
        if (source && source.name) return String(source.name).trim() || 'Token';
        if (kind === 'player') return 'Player';
        if (kind === 'npc') return 'NPC';
        if (kind === 'monster') return 'Monster';
        return 'Custom Token';
    };

    const buildTokenFromSpawnDescriptor = (kind, id = '') => {
        if (kind === 'player') {
            const player = findSpawnSource('player', id);
            return player ? buildTokenFromPlayer(player) : null;
        }
        if (kind === 'npc') {
            const npc = findSpawnSource('npc', id);
            return npc ? buildTokenFromNPC(npc) : null;
        }
        if (kind === 'monster') {
            const monster = findSpawnSource('monster', id);
            return monster ? buildTokenFromMonster(monster) : null;
        }
        if (kind === 'guildless') {
            return buildGuildlessToken();
        }
        if (kind === 'custom') {
            return buildCustomToken();
        }
        return null;
    };

    const positionTokenAtWorldPoint = (token, scene, worldPoint) => {
        if (!token || !scene || !scene.grid || !worldPoint) return token;
        const cellPx = Math.max(1, toNumber(scene.grid.cellPx, C.DEFAULT_VTT_CELL_PX));
        const offsetX = toNumber(scene.grid.offsetX, 0);
        const offsetY = toNumber(scene.grid.offsetY, 0);
        const tokenWidth = Math.max(1, toNumber(token.w, 1));
        const tokenHeight = Math.max(1, toNumber(token.h, 1));
        const cellX = (toNumber(worldPoint.x, 0) - offsetX) / cellPx;
        const cellY = (toNumber(worldPoint.y, 0) - offsetY) / cellPx;
        token.x = normalizeTokenCoordinate(cellX - tokenWidth / 2, token.x);
        token.y = normalizeTokenCoordinate(cellY - tokenHeight / 2, token.y);
        return token;
    };

    const cloneTokenRecord = (token) => {
        if (!token) return null;
        const clone = deepClone(token);
        clone.id = buildId('token');
        clone.x = normalizeTokenCoordinate(toNumber(token.x, 0) + 1, toNumber(token.x, 0));
        clone.y = normalizeTokenCoordinate(toNumber(token.y, 0) + 1, toNumber(token.y, 0));
        clone.sourceType = '';
        clone.sourceId = '';
        return clone;
    };

    const cloneTokenById = (tokenId) => {
        const targetId = String(tokenId || '').trim();
        if (!targetId) return false;
        let clonedTokenId = '';
        withDraft((draft) => {
            const scene = getActiveScene(draft);
            if (!scene || !Array.isArray(scene.tokens)) return;
            const sourceToken = scene.tokens.find((entry) => String(entry && entry.id || '').trim() === targetId);
            if (!sourceToken) return;
            const clonedToken = cloneTokenRecord(sourceToken);
            if (!clonedToken) return;
            if (C.GUILDLESS_LABEL_PATTERN.test(String(sourceToken.label || '').trim())) {
                clonedToken.label = buildGuildlessTokenLabel(scene);
            }
            scene.tokens.push(clonedToken);
            clonedTokenId = clonedToken.id;
            stageState.selection.tokenId = clonedToken.id;
            stageState.selection.entryId = '';
            stageState.selection.evidenceNoteId = '';
            if (uiRuntime.overlays.tokenInspector && uiRuntime.overlays.tokenInspector.kind === 'token' && uiRuntime.overlays.tokenInspector.targetId === targetId) {
                uiRuntime.overlays.tokenInspector = {
                    ...uiRuntime.overlays.tokenInspector,
                    targetId: clonedToken.id,
                    tokenId: clonedToken.id
                };
            }
        });
        return !!clonedTokenId;
    };

    const spawnTokenFromDescriptor = (kind, id = '', worldPoint = null) => {
        const quickSpawnState = uiRuntime.overlays.quickSpawn;
        const nextToken = buildTokenFromSpawnDescriptor(kind, id);
        if (!nextToken) return false;
        if (kind === 'npc' || kind === 'monster') closeNPCSearch({ clearQuery: true });
        else closeNPCSearch();
        withDraft((draft) => {
            const scene = getActiveScene(draft);
            if (!scene) return;
            const token = deepClone(nextToken);
            if (kind === 'guildless') {
                token.label = buildGuildlessTokenLabel(scene);
            }
            if (worldPoint) {
                positionTokenAtWorldPoint(token, scene, worldPoint);
            } else {
                const existingCount = Array.isArray(scene.tokens) ? scene.tokens.length : 0;
                token.x = existingCount * 2;
                token.y = 0;
            }
            scene.tokens.push(token);
            stageState.selection.tokenId = token.id;
            stageState.selection.evidenceNoteId = '';
            uiRuntime.overlays.quickSpawn = null;
        });
        if (quickSpawnState) {
            window.requestAnimationFrame(() => {
                const focusTarget = resolveQuickSpawnReturnFocus(quickSpawnState);
                if (focusTarget && typeof focusTarget.focus === 'function') focusTarget.focus({ preventScroll: true });
            });
        }
        return true;
    };

    const createEvidenceNoteAtWorldPoint = (worldPoint = null, options = {}) => {
        if (!isDM()) return false;
        const opts = options && typeof options === 'object' ? options : {};
        const safeWorldPoint = worldPoint && Number.isFinite(Number(worldPoint.x)) && Number.isFinite(Number(worldPoint.y))
            ? { x: toNumber(worldPoint.x, 0), y: toNumber(worldPoint.y, 0) }
            : getContextSpawnWorldPoint();
        if (!safeWorldPoint) return false;
        let createdNoteId = '';
        withDraft((draft) => {
            const scene = getActiveScene(draft);
            if (!scene) return;
            if (!Array.isArray(scene.evidenceNotes)) scene.evidenceNotes = [];
            const note = buildEvidenceNoteFromWorldPoints(scene, safeWorldPoint, safeWorldPoint, buildId('evidence'), {
                shape: normalizeEvidenceNoteShape(opts.shape, C.EVIDENCE_NOTE_SHAPE_PIN)
            });
            if (!note) return;
            scene.evidenceNotes.push(note);
            createdNoteId = note.id;
            stageState.selection.evidenceNoteId = note.id;
            stageState.selection.tokenId = '';
            stageState.selection.entryId = '';
            uiRuntime.overlays.quickSpawn = null;
        });
        if (!createdNoteId) return false;
        if (opts.openPopover !== false) {
            openEvidenceNoteInspectorPopover(createdNoteId, opts.clientX, opts.clientY);
            render();
        }
        return true;
    };

    const spawnAllPlayersAtWorldPoint = (worldPoint = null) => {
        const quickSpawnState = uiRuntime.overlays.quickSpawn;
        const players = getPlayers().filter(Boolean);
        if (!players.length) return false;
        closeNPCSearch();
        withDraft((draft) => {
            const scene = getActiveScene(draft);
            if (!scene) return;
            if (!Array.isArray(scene.tokens)) scene.tokens = [];
            const safeWorldPoint = worldPoint && typeof worldPoint === 'object'
                ? { x: toNumber(worldPoint.x, 0), y: toNumber(worldPoint.y, 0) }
                : null;
            const cellPx = Math.max(1, toNumber(scene && scene.grid && scene.grid.cellPx, C.DEFAULT_VTT_CELL_PX));
            const columns = Math.min(3, Math.max(1, Math.ceil(Math.sqrt(players.length))));
            const columnCenter = (columns - 1) / 2;
            let firstTokenId = '';

            players.forEach((player, idx) => {
                const token = buildTokenFromPlayer(player);
                if (!token) return;
                if (safeWorldPoint) {
                    const col = idx % columns;
                    const row = Math.floor(idx / columns);
                    positionTokenAtWorldPoint(token, scene, {
                        x: safeWorldPoint.x + (col - columnCenter) * cellPx * 2,
                        y: safeWorldPoint.y + row * cellPx * 2
                    });
                } else {
                    const existingCount = Array.isArray(scene.tokens) ? scene.tokens.length : 0;
                    token.x = existingCount * 2;
                    token.y = 0;
                }
                scene.tokens.push(token);
                if (!firstTokenId) firstTokenId = token.id;
            });

            stageState.selection.tokenId = firstTokenId;
            stageState.selection.entryId = '';
            stageState.selection.evidenceNoteId = '';
            uiRuntime.overlays.quickSpawn = null;
        });
        if (quickSpawnState) {
            window.requestAnimationFrame(() => {
                const focusTarget = resolveQuickSpawnReturnFocus(quickSpawnState);
                if (focusTarget && typeof focusTarget.focus === 'function') focusTarget.focus({ preventScroll: true });
            });
        }
        return true;
    };

    const syncInitiativeEntryFromToken = (entry, token) => ({
        ...entry,
        name: token.label,
        linkedTokenId: token.id,
        side: token.side,
        imageUrl: getTokenMetadataImageUrl(token),
        sourceType: token.sourceType || entry.sourceType || '',
        sourceId: token.sourceId || entry.sourceId || '',
        hpCurrent: token.hpCurrent,
        hpMax: token.hpMax,
        ac: token.ac,
        passivePerception: token.passivePerception,
        stealthRoll: getTokenStealthRoll(token),
        defences: normalizeDefences(token.defences),
        hidden: !!token.hidden,
        conditions: Array.isArray(token.conditions) ? token.conditions.slice(0, 24) : []
    });

    const buildInitiativeEntryFromToken = (token) => ({
        id: buildId('init'),
        name: token.label,
        linkedTokenId: token.id,
        side: token.side,
        imageUrl: getTokenMetadataImageUrl(token),
        sourceType: token.sourceType || '',
        sourceId: token.sourceId || '',
        total: 0,
        tie: 10,
        hpCurrent: token.hpCurrent,
        hpMax: token.hpMax,
        ac: token.ac,
        passivePerception: token.passivePerception,
        stealthRoll: getTokenStealthRoll(token),
        defences: normalizeDefences(token.defences),
        reactionUsed: false,
        concentrating: false,
        hidden: !!token.hidden,
        conditions: Array.isArray(token.conditions) ? token.conditions.slice(0, 24) : []
    });

    const findTokenAcrossScenes = (state, sourceType, sourceId) => {
        if (!state || !Array.isArray(state.scenes)) return null;
        for (const scene of state.scenes) {
            if (!scene || !Array.isArray(scene.tokens)) continue;
            const found = scene.tokens.find((token) =>
                String(token && token.sourceType || '') === String(sourceType || '')
                && String(token && token.sourceId || '') === String(sourceId || '')
            );
            if (found) return found;
        }
        return null;
    };

    const findTokenByIdAcrossScenes = (state, tokenId) => {
        if (!state || !Array.isArray(state.scenes)) return null;
        const targetId = String(tokenId || '').trim();
        if (!targetId) return null;
        for (const scene of state.scenes) {
            if (!scene || !Array.isArray(scene.tokens)) continue;
            const found = scene.tokens.find((token) => String(token && token.id || '') === targetId);
            if (found) return found;
        }
        return null;
    };

    const findSceneForTokenId = (state, tokenId) => {
        if (!state || !Array.isArray(state.scenes)) return null;
        const targetId = String(tokenId || '').trim();
        if (!targetId) return null;
        for (const scene of state.scenes) {
            if (!scene || !Array.isArray(scene.tokens)) continue;
            if (scene.tokens.some((token) => String(token && token.id || '').trim() === targetId)) {
                return scene;
            }
        }
        return null;
    };

    const hasAnyDefenceValues = (defences) => C.DEFENCE_KEYS.some((key) => hasValue(defences && defences[key]));

    const getAssignedTokenForEntry = (entry, state = sessionState.snapshot) => {
        if (!entry) return null;
        const linkedToken = findTokenByIdAcrossScenes(state, entry.linkedTokenId);
        if (linkedToken) return linkedToken;
        if (entry.sourceType && entry.sourceId) {
            return findTokenAcrossScenes(state, entry.sourceType, entry.sourceId);
        }
        return null;
    };

    const buildTokenAssignmentLabel = (token, scene, state = sessionState.snapshot) => {
        if (!token) return 'Unlinked';
        const cleanScene = scene || findSceneForTokenId(state, token.id);
        const sceneName = cleanScene && cleanScene.name ? cleanScene.name : 'Scene';
        const roleBits = [];
        const activeScene = getActiveScene(state);
        const sharedSceneId = getSharedSceneId(state);
        if (activeScene && cleanScene && cleanScene.id === activeScene.id) roleBits.push('current');
        if (cleanScene && cleanScene.id === sharedSceneId) roleBits.push('players');
        const meta = roleBits.length ? ` (${roleBits.join(', ')})` : '';
        return `${String(token.label || 'Token').trim() || 'Token'} - ${sceneName}${meta}`;
    };

    const getInitiativeTokenAssignmentOptions = (state = sessionState.snapshot) => {
        if (!state || !Array.isArray(state.scenes)) return [];
        const activeScene = getActiveScene(state);
        const sharedSceneId = getSharedSceneId(state);
        const options = [];
        state.scenes.forEach((scene, sceneIdx) => {
            if (!scene || !Array.isArray(scene.tokens)) return;
            scene.tokens.forEach((token, tokenIdx) => {
                if (!token || !token.id) return;
                const sceneName = String(scene.name || 'Scene').trim() || 'Scene';
                const tokenName = String(token.label || 'Token').trim() || 'Token';
                const tags = [];
                if (activeScene && scene.id === activeScene.id) tags.push('current');
                if (scene.id === sharedSceneId) tags.push('players');
                if (token.sourceType) tags.push(String(token.sourceType).trim());
                options.push({
                    tokenId: String(token.id),
                    label: `${tokenName} - ${sceneName}${tags.length ? ` (${tags.join(', ')})` : ''}`,
                    sortScene: scene.id === (activeScene && activeScene.id) ? -1 : sceneIdx,
                    sortToken: tokenIdx,
                    sortLabel: tokenName.toLowerCase()
                });
            });
        });
        return options.sort((left, right) =>
            (left.sortScene - right.sortScene)
            || left.sortLabel.localeCompare(right.sortLabel)
            || (left.sortToken - right.sortToken)
        );
    };

    const persistSheetIdentityForLinkedPlayer = (entry, token) => {
        if (!entry || !token) return false;
        if (String(entry.sourceType || '').trim() !== 'sheet') return false;
        const sheetKey = String(entry.sourceId || '').trim();
        if (!sheetKey) return false;
        const rosterPlayer = getRosterPlayerForRecord(token);
        const store = getStore();
        if (!rosterPlayer || !store || typeof store.getPlayers !== 'function' || typeof store.save !== 'function') return false;
        const players = Array.isArray(store.getPlayers()) ? store.getPlayers() : [];
        const target = players.find((player) => String(player && player.id || '').trim() === String(rosterPlayer.id || '').trim());
        if (!target) return false;
        if (String(target.sheetKey || '').trim() === sheetKey) return false;
        target.sheetKey = sheetKey;
        store.save({ scope: `campaign.players.${target.id}` });
        return true;
    };

    const persistRosterPlayerImageUrl = (token, rawValue) => {
        if (!token) return null;
        const rosterPlayer = getRosterPlayerForRecord(token);
        const store = getStore();
        if (!rosterPlayer || !store || typeof store.getPlayers !== 'function' || typeof store.save !== 'function') return null;

        if (typeof store.updatePlayer === 'function') {
            const updated = store.updatePlayer(String(rosterPlayer.id || '').trim(), { imageUrl: rawValue });
            if (updated && updated.id) {
                resources.playerImageUrlsAtLoad.set(String(updated.id || '').trim(), toSharedTokenImageUrl(updated.imageUrl));
            }
            return updated;
        }

        const players = Array.isArray(store.getPlayers()) ? store.getPlayers() : [];
        const target = players.find((player) => String(player && player.id || '').trim() === String(rosterPlayer.id || '').trim());
        if (!target) return null;
        target.imageUrl = toSharedTokenImageUrl(rawValue);
        store.save({ scope: `campaign.players.${target.id}` });
        resources.playerImageUrlsAtLoad.set(String(target.id || '').trim(), target.imageUrl || '');
        return { ...target };
    };

    const linkInitiativeEntryToToken = (entry, token) => {
        if (!entry || !token) return entry;
        const next = {
            ...entry,
            linkedTokenId: token.id,
            side: token.side || entry.side || 'neutral',
            imageUrl: getTokenMetadataImageUrl(token) || (String(token.sourceType || '').trim() === 'player' ? '' : entry.imageUrl || ''),
            sourceType: token.sourceType || entry.sourceType || '',
            sourceId: token.sourceId || entry.sourceId || '',
            hidden: !!token.hidden
        };
        const rosterPlayer = getRosterPlayerForRecord(token);
        const tokenStealthRoll = getTokenStealthRoll(token);
        const tokenDefences = normalizeDefences(token.defences);
        const entryStealthRoll = getEntryStealthRoll(next);

        if (rosterPlayer) {
            syncTokenRosterIdentity(token, rosterPlayer);
            syncEntryRosterIdentity(next, rosterPlayer);
        } else if (!hasValue(next.name)) {
            next.name = String(token.label || 'Combatant').trim() || 'Combatant';
        }

        if (!hasValue(next.hpCurrent) && hasValue(token.hpCurrent)) next.hpCurrent = token.hpCurrent;
        if (!hasValue(next.hpMax) && hasValue(token.hpMax)) next.hpMax = token.hpMax;
        if (!hasValue(next.ac) && hasValue(token.ac)) next.ac = token.ac;
        if (!hasValue(next.passivePerception) && hasValue(token.passivePerception)) next.passivePerception = token.passivePerception;
        if (entryStealthRoll === null && tokenStealthRoll !== null) next.stealthRoll = tokenStealthRoll;
        if (!hasAnyDefenceValues(next.defences) && hasAnyDefenceValues(tokenDefences)) next.defences = tokenDefences;
        if ((!Array.isArray(next.conditions) || !next.conditions.length) && Array.isArray(token.conditions) && token.conditions.length) {
            next.conditions = token.conditions.slice(0, 24);
        }

        if (!rosterPlayer && hasValue(next.name)) {
            token.label = String(next.name || token.label || 'Token').trim() || 'Token';
        }
        if (hasValue(next.hpCurrent)) token.hpCurrent = next.hpCurrent;
        if (hasValue(next.hpMax)) token.hpMax = next.hpMax;
        if (hasValue(next.ac)) token.ac = next.ac;
        if (hasValue(next.passivePerception)) token.passivePerception = next.passivePerception;
        if (getEntryStealthRoll(next) !== null) token.stealthRoll = getEntryStealthRoll(next);
        if (hasAnyDefenceValues(next.defences)) token.defences = normalizeDefences(next.defences);
        if (Array.isArray(next.conditions) && next.conditions.length) token.conditions = next.conditions.slice(0, 24);

        return next;
    };

    const clearPlayerRosterIdentityFromRecord = (record) => {
        if (!record || String(record.sourceType || '').trim() !== 'player') return false;
        let mutated = false;
        if (record.sourceType) {
            record.sourceType = '';
            mutated = true;
        }
        if (record.sourceId) {
            record.sourceId = '';
            mutated = true;
        }
        if (record.moveAccess && normalizeMoveAccess(record.moveAccess, 'dm') === 'player') {
            record.moveAccess = 'dm';
            mutated = true;
        }
        return mutated;
    };

    const setInitiativeEntryRosterOwner = (entryId, playerId) => {
        if (!canEditInitiative()) return false;
        const cleanEntryId = String(entryId || '').trim();
        const cleanPlayerId = String(playerId || '').trim();
        if (!cleanEntryId) return false;
        const player = cleanPlayerId ? findPlayerById(cleanPlayerId) : null;
        let changed = false;
        withDraft((draft) => {
            const entries = draft && draft.initiative && Array.isArray(draft.initiative.entries) ? draft.initiative.entries : [];
            const entry = entries.find((candidate) => String(candidate && candidate.id || '').trim() === cleanEntryId);
            if (!entry) return;
            const linkedToken = findTokenByIdAcrossScenes(draft, entry.linkedTokenId)
                || getAssignedTokenForEntry(entry, draft);
            if (player) {
                if (linkedToken) {
                    linkedToken.sourceType = 'player';
                    linkedToken.sourceId = String(player.id || '').trim();
                    syncTokenRosterIdentity(linkedToken, player);
                }
                if (syncEntryRosterIdentity(entry, player)) changed = true;
                changed = true;
            } else {
                if (clearPlayerRosterIdentityFromRecord(entry)) changed = true;
                if (linkedToken && clearPlayerRosterIdentityFromRecord(linkedToken)) changed = true;
            }
            stageState.selection.entryId = entry.id;
            if (linkedToken) stageState.selection.tokenId = linkedToken.id;
        });
        return changed;
    };

    const bustAllVTTRosterAssociations = () => {
        if (!canEditInitiative()) return false;
        const ok = confirm(
            'Bust all VTT roster associations?\n\n'
            + 'This clears player roster ownership from every VTT token and initiative entry in this case, and clears roster sheet links so players are prompted to select themselves again. Tokens and entries stay on the board, but player-linked names and ownership stop being enforced.'
        );
        if (!ok) return false;
        let changedCount = 0;
        let rosterLinkCount = 0;
        withDraft((draft) => {
            if (draft && Array.isArray(draft.scenes)) {
                draft.scenes.forEach((scene) => {
                    if (!scene || !Array.isArray(scene.tokens)) return;
                    scene.tokens.forEach((token) => {
                        if (clearPlayerRosterIdentityFromRecord(token)) changedCount += 1;
                    });
                });
            }
            const entries = draft && draft.initiative && Array.isArray(draft.initiative.entries) ? draft.initiative.entries : [];
            entries.forEach((entry) => {
                if (clearPlayerRosterIdentityFromRecord(entry)) changedCount += 1;
            });
        }, { reason: 'bust-vtt-roster-associations' });
        const store = getStore();
        const players = store && typeof store.getPlayers === 'function' ? store.getPlayers() : [];
        if (store && typeof store.updatePlayer === 'function' && Array.isArray(players)) {
            players.forEach((player) => {
                const playerId = String(player && player.id || '').trim();
                if (!playerId || !String(player && player.sheetKey || '').trim()) return;
                const updated = store.updatePlayer(playerId, { sheetKey: '' });
                if (updated) rosterLinkCount += 1;
            });
        }
        closeInitiativeDetail();
        closeTokenInspectorPopover();
        stageState.selection.entryId = '';
        stageState.selection.tokenId = '';
        normalizeSelections();
        render();
        alert(changedCount
            ? `Cleared ${changedCount} VTT roster association${changedCount === 1 ? '' : 's'} and ${rosterLinkCount} roster sheet link${rosterLinkCount === 1 ? '' : 's'}.`
            : `No VTT roster associations were found. Cleared ${rosterLinkCount} roster sheet link${rosterLinkCount === 1 ? '' : 's'}.`);
        return true;
    };


    const getSceneTokenForEntry = (scene, entry) => {
        if (!scene || !Array.isArray(scene.tokens) || !entry) return null;
        const linkedId = String(entry.linkedTokenId || '').trim();
        if (linkedId) {
            const linkedToken = scene.tokens.find((token) => token.id === linkedId);
            if (linkedToken) return linkedToken;
        }
        const sourceType = String(entry.sourceType || '').trim();
        const sourceId = String(entry.sourceId || '').trim();
        if (!sourceType || !sourceId) return null;
        return scene.tokens.find((token) =>
            String(token && token.sourceType || '') === sourceType
            && String(token && token.sourceId || '') === sourceId
        ) || null;
    };

    const isEntryHiddenForRole = (entry, state = sessionState.snapshot, role = sessionState.role) => {
        if (!entry) return true;
        if (role === 'dm') return false;
        if (entry.hidden) return true;
        const scene = getCombatScene(state);
        const linkedToken = getSceneTokenForEntry(scene, entry);
        if (role === 'player' && linkedToken && isLocalPlayerOwnToken(linkedToken)) return false;
        return !!(linkedToken && isTokenHiddenForRole(linkedToken, scene, role));
    };


    const getVisibleInitiativeEntriesForRole = (state = sessionState.snapshot, role = sessionState.role) => {
        const entries = state && state.initiative && Array.isArray(state.initiative.entries) ? state.initiative.entries : [];
        if (role === 'dm') return entries;
        return entries.filter((entry) => !isEntryHiddenForRole(entry, state, role));
    };

    const getNextVisibleInitiativeProjection = (entries, activeEntryId, state = sessionState.snapshot, role = sessionState.role) => {
        const canonicalEntries = Array.isArray(entries) ? entries : [];
        const activeId = String(activeEntryId || '').trim();
        const activeIndex = canonicalEntries.findIndex((entry) => String(entry && entry.id || '').trim() === activeId);
        if (!activeId || activeIndex < 0 || canonicalEntries.length < 2) return null;
        let skippedHidden = false;
        for (let offset = 1; offset < canonicalEntries.length; offset += 1) {
            const entry = canonicalEntries[(activeIndex + offset) % canonicalEntries.length];
            if (!entry || String(entry.id || '').trim() === activeId) continue;
            if (isEntryHiddenForRole(entry, state, role)) {
                skippedHidden = true;
                continue;
            }
            return { entry, skippedHidden };
        }
        return null;
    };

    const getVisibleSceneTokenForEntry = (entry, state = sessionState.snapshot, role = sessionState.role) => {
        if (!entry) return null;
        const scene = getCombatScene(state);
        const linkedToken = getSceneTokenForEntry(scene, entry);
        if (!linkedToken) return null;
        if (role !== 'dm' && isTokenHiddenForRole(linkedToken, scene, role) && !isLocalPlayerOwnToken(linkedToken)) return null;
        return linkedToken;
    };

    const syncTokenSelectionFromEntry = (entryId, state = sessionState.snapshot, role = sessionState.role) => {
        const entry = getEntryById(entryId, state);
        const token = getVisibleSceneTokenForEntry(entry, state, role);
        stageState.selection.tokenId = token ? token.id : '';
        if (token) stageState.selection.evidenceNoteId = '';
        return token;
    };

    const findEntryForToken = (tokenId, state = sessionState.snapshot) => {
        const token = getTokenById(tokenId, state);
        if (!token) return null;
        const entries = state && state.initiative && Array.isArray(state.initiative.entries) ? state.initiative.entries : [];
        return entries.find((entry) =>
            entry.linkedTokenId === token.id
            || (
                token.sourceType
                && token.sourceId
                && String(entry && entry.sourceType || '') === String(token.sourceType || '')
                && String(entry && entry.sourceId || '') === String(token.sourceId || '')
            )
        ) || null;
    };

    function sortInitiativeEntries(entries) {
        entries.sort((left, right) =>
            (right.total - left.total)
            || (right.tie - left.tie)
            || String(left.name || '').localeCompare(String(right.name || ''))
        );
    }

    let handleInitiativeTurnOccurrence = () => false;

    const readSharedVTTSnapshot = (options = {}) => {
        const opts = options && typeof options === 'object' ? options : {};
        const shouldSyncRosterPresentation = opts.syncRosterPresentation !== false;
        const useStoreOnly = !!opts.useStoreOnly;
        const store = getStore();
        if (!store) return null;
        const activeCaseId = getActiveCaseId();
        if (sessionState.stateCaseId && sessionState.stateCaseId !== activeCaseId) return null;
        const collabTransport = getVTTCollabTransport();
        if (!useStoreOnly && isVTTCollabReady() && collabTransport && typeof collabTransport.getSnapshot === 'function') {
            if (collabTransport.caseId !== activeCaseId) return null;
            try {
                const snapshot = deepClone(collabTransport.getSnapshot());
                if (shouldSyncRosterPresentation) syncRosterLinkedPlayerPresentation(snapshot);
                return snapshot;
            } catch (err) {
                console.warn('VTT collaboration snapshot read failed', err);
            }
        }
        if (!useStoreOnly && isVTTCollabInitializing() && sessionState.snapshot) {
            const snapshot = deepClone(sessionState.snapshot);
            if (shouldSyncRosterPresentation) syncRosterLinkedPlayerPresentation(snapshot);
            return snapshot;
        }
        if (sessionState.initialLoadPending || !sessionState.snapshot) return null;
        const snapshot = deepClone(store.getVTTState(getActiveCaseId()));
        if (shouldSyncRosterPresentation) syncRosterLinkedPlayerPresentation(snapshot);
        return snapshot;
    };

    const ensureRosterLinkedPlayerPresentationPersisted = (snapshot, options = {}) => {
        if (!snapshot) return { snapshot, mutated: false };
        const opts = options && typeof options === 'object' ? options : {};
        // Roster identity is authoritative, but only the DM may publish that
        // identity into the shared VTT. Player browsers can have stale local
        // roster caches; allowing each of them to persist its projection makes
        // linked names oscillate between old and current values.
        const shouldPersist = opts.persist !== false && isDM();
        const baseSnapshot = shouldPersist ? deepClone(snapshot) : null;
        const mutated = syncRosterLinkedPlayerPresentation(snapshot);
        if (!mutated) return { snapshot, mutated: false };
        if (!shouldPersist) return { snapshot, mutated: true };
        const saved = persistSharedVTTSnapshot(snapshot, {
            ...opts,
            baseSnapshot,
            reason: opts.reason || 'roster-player-presentation-sync'
        });
        return {
            snapshot: deepClone(saved || snapshot),
            mutated: true
        };
    };

    const persistSharedVTTSnapshot = (payload, options = {}) => {
        const store = getStore();
        if (!store) return null;
        const collabTransport = getVTTCollabTransport();
        if (isVTTCollabReady() && collabTransport && typeof collabTransport.syncSnapshot === 'function') {
            Promise.resolve(collabTransport.syncSnapshot(payload, options)).catch((err) => {
                console.warn('VTT collaboration snapshot sync failed', err);
            });
            return typeof collabTransport.getSnapshot === 'function'
                ? deepClone(collabTransport.getSnapshot())
                : deepClone(payload);
        }
        if (requiresLiveVTTRoom() && options.allowLocalFallback !== true) {
            canMutateLiveVTTState(options.reason || 'vtt-snapshot');
            return null;
        }
        return deepClone(store.updateVTTState(payload, getActiveCaseId()));
    };

    const withDraft = (mutator, options = {}) => {
        if (sessionState.pendingCaseId || (sessionState.stateCaseId && sessionState.stateCaseId !== getActiveCaseId())) return false;
        if (options.allowLocalFallback !== true && !canMutateLiveVTTState(options.reason || 'vtt-draft')) {
            return false;
        }
        const draft = readSharedVTTSnapshot();
        if (!draft) return false;

        const baseSnapshot = deepClone(draft);

        mutator(draft);

        compactSharedTemplatesInSnapshot(draft);
        coerceSnapshotFogToCellMasks(draft);

        const saved = persistSharedVTTSnapshot(draft, {
            ...options,
            baseSnapshot
        });

        sessionState.snapshot = deepClone(saved || draft);
        syncRosterLinkedPlayerPresentation(sessionState.snapshot);
        handleInitiativeTurnOccurrence(baseSnapshot, sessionState.snapshot);
        normalizeSelections();
        if (options.fitView) stageState.view.fitOnNextMapLoad = true;
        render();
        return true;
    };

    const pruneExpiredSharedTemplates = (now = Date.now()) => {
        if (!canUseSharedPlayerTools()) return false;
        const snapshot = readSharedVTTSnapshot();
        if (!snapshot || !snapshotNeedsSharedTemplateCompaction(snapshot, now)) return false;
        return withDraft(() => {}, { reason: 'prune-expired-shared-templates' });
    };

    const normalizeSelections = () => {
        const scene = getActiveScene();
        const tokens = getVisibleTokensForRole(scene);
        const localOwnToken = isPlayer() ? getLocalPlayerFocusContext().token : null;
        if (localOwnToken && !tokens.some((token) => token.id === localOwnToken.id)) tokens.push(localOwnToken);
        const visibleEvidenceNotes = getVisibleEvidenceNotesForRole(scene);
        const visibleClocks = getVisibleSceneClocksForRole(scene);
        const visibleEntries = getVisibleInitiativeEntriesForRole(sessionState.snapshot, sessionState.role);
        if (!visibleEntries.some((entry) => entry.id === stageState.selection.entryId)) {
            const activeEntryId = sessionState.snapshot && sessionState.snapshot.initiative ? String(sessionState.snapshot.initiative.activeEntryId || '').trim() : '';
            stageState.selection.entryId = visibleEntries.some((entry) => entry.id === activeEntryId)
                ? activeEntryId
                : (visibleEntries[0] ? visibleEntries[0].id : '');
        }
        if (!tokens.some((token) => token.id === stageState.selection.tokenId)) {
            stageState.selection.tokenId = '';
        }
        if (!visibleEvidenceNotes.some((note) => note.id === stageState.selection.evidenceNoteId)) {
            stageState.selection.evidenceNoteId = '';
        }
        if (!visibleClocks.some((clock) => clock.id === stageState.selection.clockId)) {
            stageState.selection.clockId = '';
        }
        if (!tokens.some((token) => token.id === stageState.preview.tokenId && getCanonicalTokenImageUrl(token))) {
            stageState.preview.tokenId = '';
        }
        if (!isDM()) {
            uiRuntime.overlays.tokenInspector = null;
        } else if (uiRuntime.overlays.tokenInspector) {
            const popoverTargetId = String(uiRuntime.overlays.tokenInspector.targetId || uiRuntime.overlays.tokenInspector.tokenId || '').trim();
            if (!popoverTargetId) {
                uiRuntime.overlays.tokenInspector = null;
            } else if (uiRuntime.overlays.tokenInspector.kind === 'note') {
                if (!visibleEvidenceNotes.some((note) => note.id === popoverTargetId)) uiRuntime.overlays.tokenInspector = null;
            } else if (!tokens.some((token) => token.id === popoverTargetId)) {
                uiRuntime.overlays.tokenInspector = null;
            }
        }
        stageState.selection.templateId = '';
        if (stageState.placement.template && (!scene || stageState.placement.template.sceneId !== scene.id)) {
            stageState.placement.template = null;
        }
        stageState.placement.templateRotate = null;
        if (stageState.placement.visionConeRotate && (!scene || stageState.placement.visionConeRotate.sceneId !== scene.id || !tokens.some((token) => token.id === stageState.placement.visionConeRotate.tokenId))) {
            stageState.placement.visionConeRotate = null;
        }
        if (stageState.placement.ruler && (!scene || stageState.placement.ruler.sceneId !== scene.id)) {
            stageState.placement.ruler = null;
        }
        if (stageState.placement.evidenceNote && (!scene || stageState.placement.evidenceNote.sceneId !== scene.id)) {
            stageState.placement.evidenceNote = null;
        }
        if (stageState.placement.annotation && (!scene || stageState.placement.annotation.sceneId !== scene.id)) {
            stageState.placement.annotation = null;
        }
        if (stageState.placement.evidenceNoteDrag && (!scene || stageState.placement.evidenceNoteDrag.sceneId !== scene.id || !visibleEvidenceNotes.some((note) => note.id === stageState.placement.evidenceNoteDrag.noteId))) {
            stageState.placement.evidenceNoteDrag = null;
        }
        if (dom.body) {
            dom.body.dataset.vttRole = sessionState.role;
            dom.body.dataset.sceneViewMode = isUsingLocalSceneView(sessionState.snapshot, sessionState.role) ? C.SCENE_VIEW_LOCAL : C.SCENE_VIEW_SHARED;
        }
    };

    const resolveQuickSpawnReturnFocus = (quickSpawnState) => {
        const source = quickSpawnState && typeof quickSpawnState === 'object' ? quickSpawnState : {};
        if (source.returnFocusEl instanceof HTMLElement && source.returnFocusEl.isConnected) return source.returnFocusEl;
        const matchingLauncher = Array.from(document.querySelectorAll('[data-action]')).find((element) => (
            element instanceof HTMLElement
            && String(element.dataset.action || '') === String(source.returnFocusAction || '')
            && String(element.dataset.spawnKind || '') === String(source.returnFocusSpawnKind || '')
            && String(element.dataset.id || '') === String(source.returnFocusId || '')
            && element.getClientRects().length > 0
        ));
        return matchingLauncher || dom.stageEl;
    };

    const closeQuickSpawnMenu = (options = {}) => {
        if (!uiRuntime.overlays.quickSpawn) return false;
        const quickSpawnState = uiRuntime.overlays.quickSpawn;
        uiRuntime.overlays.quickSpawn = null;
        renderQuickSpawnMenu();
        if (options.restoreFocus) {
            window.requestAnimationFrame(() => {
                const focusTarget = resolveQuickSpawnReturnFocus(quickSpawnState);
                if (focusTarget && typeof focusTarget.focus === 'function') focusTarget.focus({ preventScroll: true });
            });
        }
        return true;
    };

    const getContextSpawnWorldPoint = () => {
        if (uiRuntime.overlays.stageContextMenu && uiRuntime.overlays.stageContextMenu.worldPoint) return uiRuntime.overlays.stageContextMenu.worldPoint;
        if (uiRuntime.overlays.quickSpawn && uiRuntime.overlays.quickSpawn.worldPoint) return uiRuntime.overlays.quickSpawn.worldPoint;
        if (uiRuntime.npcSearch.state && uiRuntime.npcSearch.state.worldPoint) return uiRuntime.npcSearch.state.worldPoint;
        return null;
    };

    const getStageContextWorldPoint = () => {
        if (uiRuntime.overlays.stageContextMenu && uiRuntime.overlays.stageContextMenu.worldPoint) return uiRuntime.overlays.stageContextMenu.worldPoint;
        return null;
    };

    const closeViewMenu = () => {
        if (!uiRuntime.menus.viewOpen) return false;
        uiRuntime.menus.viewOpen = false;
        renderViewMenu();
        return true;
    };

    const closeNavMenu = () => false;

    const openNPCSearchAt = (clientX, clientY, worldPoint = null) => {
        if (!isDM()) return false;
        closeStageContextMenu();
        closeQuickSpawnMenu();
        closeTokenInspectorPopover();
        closeInitiativeDetail();
        uiRuntime.npcSearch.open = true;
        uiRuntime.npcSearch.state = {
            clientX: Math.round(toNumber(clientX, window.innerWidth / 2)),
            clientY: Math.round(toNumber(clientY, window.innerHeight / 2)),
            worldPoint: worldPoint && Number.isFinite(Number(worldPoint.x)) && Number.isFinite(Number(worldPoint.y))
                ? { x: toNumber(worldPoint.x, 0), y: toNumber(worldPoint.y, 0) }
                : null
        };
        renderNPCSearchPopover();
        if (dom.npcSearchInputEl) {
            window.requestAnimationFrame(() => {
                dom.npcSearchInputEl.focus();
                dom.npcSearchInputEl.select();
            });
        }
        ensureNPCSearchData().catch((err) => {
            console.warn('Failed preparing NPC search', err);
        });
        return true;
    };

    const closeTokenInspectorPopover = () => {
        if (!uiRuntime.overlays.tokenInspector && (!dom.tokenInspectorPopoverEl || dom.tokenInspectorPopoverEl.hidden)) return false;
        uiRuntime.overlays.tokenInspector = null;
        if (dom.tokenInspectorPopoverEl) dom.tokenInspectorPopoverEl.hidden = true;
        return true;
    };

    const openTokenInspectorPopover = (tokenId, clientX, clientY) => {
        const targetId = String(tokenId || '').trim();
        if (!targetId || !isDM()) return false;
        closeStageContextMenu();
        closeQuickSpawnMenu();
        closeNPCSearch();
        closeInitiativeDetail();
        uiRuntime.overlays.tokenInspector = {
            kind: 'token',
            targetId,
            tokenId: targetId,
            clientX: Math.round(toNumber(clientX, window.innerWidth / 2)),
            clientY: Math.round(toNumber(clientY, window.innerHeight / 2))
        };
        return true;
    };

    const openEvidenceNoteInspectorPopover = (noteId, clientX, clientY) => {
        const targetId = String(noteId || '').trim();
        if (!targetId || !isDM()) return false;
        closeStageContextMenu();
        closeQuickSpawnMenu();
        closeNPCSearch();
        closeInitiativeDetail();
        uiRuntime.overlays.tokenInspector = {
            kind: 'note',
            targetId,
            clientX: Math.round(toNumber(clientX, window.innerWidth / 2)),
            clientY: Math.round(toNumber(clientY, window.innerHeight / 2))
        };
        return true;
    };

    const openQuickSpawnMenu = (clientX, clientY, options = {}) => {
        if (!dom.stageEl || !isDM()) return false;
        closeStageContextMenu();
        closeNPCSearch();
        closeViewMenu();
        closeToolsMenu();
        closeTokenInspectorPopover();
        closeInitiativeDetail();
        const rect = dom.stageEl.getBoundingClientRect();
        const returnFocusEl = options.returnFocusEl instanceof HTMLElement ? options.returnFocusEl : dom.stageEl;
        uiRuntime.overlays.quickSpawn = {
            worldPoint: screenToWorld(clientX, clientY),
            clientX: Math.round(clientX),
            clientY: Math.round(clientY),
            stageX: Math.round(clientX - rect.left),
            stageY: Math.round(clientY - rect.top),
            returnFocusEl,
            returnFocusAction: String(returnFocusEl && returnFocusEl.dataset.action || ''),
            returnFocusSpawnKind: String(returnFocusEl && returnFocusEl.dataset.spawnKind || ''),
            returnFocusId: String(returnFocusEl && returnFocusEl.dataset.id || '')
        };
        renderQuickSpawnMenu();
        if (options.focus) {
            window.requestAnimationFrame(() => {
                const firstAction = dom.quickSpawnMenuEl && dom.quickSpawnMenuEl.querySelector('button:not(:disabled)');
                if (firstAction instanceof HTMLElement) firstAction.focus({ preventScroll: true });
            });
        }
        return true;
    };

    const clearSpawnDrag = () => {
        if (!stageState.pointer.spawnDrag) return false;
        stageState.pointer.spawnDrag = null;
        renderSpawnGhost();
        return true;
    };

    const beginSpawnDrag = (event, kind, id = '') => {
        if (!event || !isDM()) return false;
        const source = findSpawnSource(kind, id);
        if (!source && kind !== 'custom') return false;
        closeNPCSearch();
        closeViewMenu();
        closeToolsMenu();
        closeQuickSpawnMenu();
        closeTokenInspectorPopover();
        stageState.pointer.spawnDrag = {
            pointerId: event.pointerId,
            kind,
            id: String(id || '').trim(),
            label: getSpawnDescriptorLabel(kind, id),
            startClientX: event.clientX,
            startClientY: event.clientY,
            clientX: event.clientX,
            clientY: event.clientY,
            moved: false,
            overStage: false
        };
        stageState.preview.tokenId = '';
        renderSpawnGhost();
        return true;
    };

    const loadRolePreference = () => {
        const store = getStore();
        if (store && typeof store.getVTTLocalRole === 'function') {
            sessionState.role = normalizeLocalRole(store.getVTTLocalRole(getActiveCaseId()));
        } else {
            sessionState.role = 'player';
        }
        if (dom.body) dom.body.dataset.vttRole = sessionState.role;
    };

    const setRolePreference = (role) => {
        const stageCenter = captureVTTStageCenter();
        const previousRole = sessionState.role;
        sessionState.role = normalizeLocalRole(role);
        const store = getStore();
        if (store && typeof store.setVTTLocalRole === 'function') {
            sessionState.role = normalizeLocalRole(store.setVTTLocalRole(sessionState.role, getActiveCaseId()));
        }
        if (sessionState.role !== 'dm') {
            if (stageState.tool.current.mode === C.TOOL_MODE_FOG || stageState.tool.current.mode === C.TOOL_MODE_FOG_REMOVE || stageState.tool.current.mode === C.TOOL_MODE_NOTE) {
                stageState.tool.current.mode = C.TOOL_MODE_NAVIGATE;
            }
            closeNPCSearch();
            uiRuntime.overlays.quickSpawn = null;
            closeTokenInspectorPopover();
            clearSpawnDrag();
            closeInitiativeDetail();
        } else {
            uiRuntime.playerRoll.menuOpen = false;
            closeSheetActionPopover();
            closeNPCRollPopover();
        }
        if (sessionState.role !== 'player') {
            vttProximityController.reset();
            uiRuntime.playerRoll.menuOpen = false;
            closeRosterSelfModal();
            closeSheetActionPopover();
        }
        if (isSpectator() && stageState.tool.current.mode !== C.TOOL_MODE_RULER) {
            stageState.tool.current.mode = C.TOOL_MODE_NAVIGATE;
        }
        clearPendingTouchContext();
        closeViewMenu();
        closeToolsMenu();
        const allowedPanel = getAllowedVTTPanel(uiRuntime.preferences.activeVttPanel);
        if (!allowedPanel) {
            uiRuntime.preferences.activeVttPanel = '';
            activeVTTPanelOpener = null;
        }
        clearTemplatePlacementState();
        if (dom.body) dom.body.dataset.vttRole = sessionState.role;
        render();
        if (allowedPanel && (!activeVTTPanelOpener || activeVTTPanelOpener.getClientRects().length === 0)) {
            activeVTTPanelOpener = findVisibleVTTPanelLauncher(allowedPanel);
        }
        restoreVTTStageCenterAfterLayout(stageCenter);
        if (resources.sessionController && typeof resources.sessionController.handleRoleChanged === 'function') {
            resources.sessionController.handleRoleChanged(previousRole, sessionState.role);
        }
    };

    let containedVTTModalEl = null;
    let vttModalInertRecords = null;

    const getOpenVTTModal = () => {
        if (dom.caseBoardModalEl && !dom.caseBoardModalEl.hidden) return dom.caseBoardModalEl;
        if (dom.dmUnlockModalEl && !dom.dmUnlockModalEl.hidden) return dom.dmUnlockModalEl;
        if (dom.rosterSelfModalEl && !dom.rosterSelfModalEl.hidden) return dom.rosterSelfModalEl;
        return null;
    };

    const isVTTElementFocusable = (element) => !!(
        element
        && element.isConnected
        && typeof element.focus === 'function'
        && !element.matches(':disabled')
        && !element.closest('[hidden], [inert]')
        && element.getClientRects().length > 0
    );

    const focusVTTModalElement = (element) => {
        if (!isVTTElementFocusable(element)) return false;
        try {
            element.focus({ preventScroll: true });
        } catch (_err) {
            element.focus();
        }
        return true;
    };

    const focusVTTModalFallback = () => {
        const fallback = [
            ...(Array.isArray(dom.viewMenuToggleEls) ? dom.viewMenuToggleEls : []),
            dom.stageEl
        ].find(isVTTElementFocusable);
        return focusVTTModalElement(fallback);
    };

    const releaseVTTModalContainment = () => {
        if (vttModalInertRecords) {
            vttModalInertRecords.forEach(({ element, hadAttribute, value }) => {
                if (!element || !element.isConnected) return;
                if (hadAttribute) element.setAttribute('inert', value === null ? '' : value);
                else element.removeAttribute('inert');
            });
        }
        vttModalInertRecords = null;
        containedVTTModalEl = null;
        if (document.body) document.body.classList.remove('vtt-modal-open');
    };

    const syncVTTModalContainment = () => {
        const activeModal = getOpenVTTModal();
        if (activeModal === containedVTTModalEl) return;

        releaseVTTModalContainment();
        if (!activeModal || !document.body) return;

        vttModalInertRecords = Array.from(document.body.children)
            .filter((element) => element !== activeModal)
            .map((element) => ({
                element,
                hadAttribute: element.hasAttribute('inert'),
                value: element.getAttribute('inert')
            }));
        vttModalInertRecords.forEach(({ element }) => element.setAttribute('inert', ''));
        containedVTTModalEl = activeModal;
        document.body.classList.add('vtt-modal-open');
    };

    const getVTTModalFocusableElements = (modalEl) => {
        if (!modalEl) return [];
        return Array.from(modalEl.querySelectorAll([
            'a[href]',
            'button:not([disabled])',
            'input:not([disabled]):not([type="hidden"])',
            'select:not([disabled])',
            'textarea:not([disabled])',
            'iframe',
            '[tabindex]:not([tabindex="-1"])'
        ].join(','))).filter((element) => (
            isVTTElementFocusable(element)
        ));
    };

    const handleVTTModalFocusTrap = (event) => {
        if (event.defaultPrevented || event.key !== 'Tab') return;
        const activeModal = getOpenVTTModal();
        if (!activeModal) return;
        const focusableElements = getVTTModalFocusableElements(activeModal);
        if (!focusableElements.length) {
            event.preventDefault();
            focusVTTModalElement(activeModal);
            return;
        }
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];
        const activeElement = document.activeElement;
        if (!activeModal.contains(activeElement) || (event.shiftKey && activeElement === firstElement)) {
            event.preventDefault();
            focusVTTModalElement(event.shiftKey ? lastElement : firstElement);
        } else if (!event.shiftKey && activeElement === lastElement) {
            event.preventDefault();
            focusVTTModalElement(firstElement);
        }
    };

    const isDMUnlockModalOpen = () => !!(dom.dmUnlockModalEl && !dom.dmUnlockModalEl.hidden);

    const closeDMUnlockModal = ({ restoreFocus = true, refreshRosterSelf = true } = {}) => {
        if (!dom.dmUnlockModalEl) return false;
        if (dom.dmUnlockInputEl) dom.dmUnlockInputEl.value = '';
        if (dom.dmUnlockErrorEl) {
            dom.dmUnlockErrorEl.hidden = true;
            dom.dmUnlockErrorEl.textContent = 'That password was not accepted.';
        }
        if (dom.dmUnlockModalEl.hidden) return false;
        dom.dmUnlockModalEl.hidden = true;
        syncVTTModalContainment();
        const returnFocusEl = uiRuntime.modals.dmUnlock.returnFocusEl;
        uiRuntime.modals.dmUnlock.returnFocusEl = null;
        if (restoreFocus && !focusVTTModalElement(returnFocusEl)) focusVTTModalFallback();
        if (refreshRosterSelf && isPlayer()) {
            window.requestAnimationFrame(renderRosterSelfModal);
        }
        return true;
    };

    const openDMUnlockModal = () => {
        if (!dom.dmUnlockModalEl || !dom.dmUnlockInputEl) return false;
        closeNPCSearch();
        closeViewMenu();
        closeToolsMenu();
        closeQuickSpawnMenu();
        closeTokenInspectorPopover();
        closeInitiativeDetail();
        clearSpawnDrag();
        clearTemplatePlacementState();
        uiRuntime.modals.dmUnlock.returnFocusEl = document.activeElement instanceof HTMLElement ? document.activeElement : dom.roleToggleEl;
        dom.dmUnlockModalEl.hidden = false;
        syncVTTModalContainment();
        if (dom.dmUnlockErrorEl) {
            dom.dmUnlockErrorEl.hidden = true;
            dom.dmUnlockErrorEl.textContent = 'That password was not accepted.';
        }
        dom.dmUnlockInputEl.value = '';
        window.requestAnimationFrame(() => {
            focusVTTModalElement(dom.dmUnlockInputEl);
            dom.dmUnlockInputEl.select();
        });
        return true;
    };

    const submitDMUnlockModal = () => {
        if (!dom.dmUnlockInputEl) return false;
        if (String(dom.dmUnlockInputEl.value || '').trim() !== C.DM_UNLOCK_PHRASE) {
            if (dom.dmUnlockErrorEl) {
                dom.dmUnlockErrorEl.textContent = 'That password was not accepted.';
                dom.dmUnlockErrorEl.hidden = false;
            }
            dom.dmUnlockInputEl.focus();
            dom.dmUnlockInputEl.select();
            return false;
        }
        closeDMUnlockModal({ restoreFocus: false, refreshRosterSelf: false });
        setRolePreference('dm');
        return true;
    };

    const promptForDMMode = () => openDMUnlockModal();

    const buildVTTSessionController = (factory) => factory.create({
        defaultSnapshot: vttConfig.createDefaultVTTState(),
        liveStatusDropoutGraceMs: C.LIVE_STATUS_DROPOUT_GRACE_MS,
        state: {
            getRole: () => sessionState.role,
            getCaseTransitionId: () => sessionState.caseTransitionId,
            getStateCaseId: () => sessionState.stateCaseId,
            setStateCaseId: (caseId) => {
                sessionState.stateCaseId = String(caseId || '').trim();
            },
            getSnapshot: () => sessionState.snapshot,
            setSnapshot: (snapshot) => {
                sessionState.snapshot = snapshot;
            },
            isInitialLoadPending: () => sessionState.initialLoadPending,
            setInitialLoadPending: (pending) => {
                sessionState.initialLoadPending = !!pending;
            },
            readSharedSnapshot: (...args) => readSharedVTTSnapshot(...args),
            ensureRosterPresentation: (...args) => ensureRosterLinkedPlayerPresentationPersisted(...args),
            persistSnapshot: (...args) => persistSharedVTTSnapshot(...args),
            syncRosterPresentation: (...args) => syncRosterLinkedPlayerPresentation(...args),
            coerceFog: (...args) => coerceSnapshotFogToCellMasks(...args),
            clearPendingRemoteSnapshot: () => {
                sessionState.pendingRemoteSnapshot = null;
            },
            applyRemoteSnapshot: (...args) => applyVTTCollabSnapshot(...args),
            applyRemotePositionChanges: (...args) => applyVTTCollabPositionChanges(...args)
        },
        store: {
            getStore,
            getActiveCaseId,
            getRoomId: getVTTCollabRoomId,
            getCollabReady: () => window.RTF_VTT_COLLAB_READY
        },
        ui: {
            setSyncChip: ({ state = 'local', label = 'Local', detail = '', retryable = false } = {}) => {
                if (!dom.syncChipEl) return;
                const retryableValue = retryable ? 'true' : 'false';
                const accessibleDetail = detail || label;
                const role = retryable ? 'button' : 'status';
                const tabIndex = retryable ? 0 : -1;
                if (dom.syncChipEl.dataset.state !== state) dom.syncChipEl.dataset.state = state;
                if (dom.syncChipEl.dataset.retryable !== retryableValue) dom.syncChipEl.dataset.retryable = retryableValue;
                if (dom.syncChipEl.textContent !== label) dom.syncChipEl.textContent = label;
                if (dom.syncChipEl.title !== accessibleDetail) dom.syncChipEl.title = accessibleDetail;
                if (dom.syncChipEl.getAttribute('aria-label') !== accessibleDetail) dom.syncChipEl.setAttribute('aria-label', accessibleDetail);
                if (dom.syncChipEl.getAttribute('role') !== role) dom.syncChipEl.setAttribute('role', role);
                if (dom.syncChipEl.tabIndex !== tabIndex) dom.syncChipEl.tabIndex = tabIndex;
            },
            getSyncChipState: () => dom.syncChipEl ? String(dom.syncChipEl.dataset.state || '') : '',
            setActiveSceneLabel: (label) => {
                if (dom.activeSceneLabelEl) dom.activeSceneLabelEl.textContent = String(label || '');
            },
            normalizeSelections: (...args) => normalizeSelections(...args),
            render: (...args) => render(...args),
            fitViewToWorld: (...args) => fitViewToWorld(...args),
            processInitiativeQueue: (...args) => processInitiativeQueue(...args),
            closeAdminMenus: () => {
                closeViewMenu();
                closeToolsMenu();
            },
            confirm: (message) => window.confirm(message),
            alert: (message) => window.alert(message),
            bindSyncRetry: (handler) => {
                if (!dom.syncChipEl || dom.syncChipEl.dataset.bound === '1') return;
                dom.syncChipEl.dataset.bound = '1';
                dom.syncChipEl.addEventListener('click', () => {
                    if (dom.syncChipEl.dataset.retryable !== 'true') return;
                    handler();
                });
                dom.syncChipEl.addEventListener('keydown', (event) => {
                    if (dom.syncChipEl.dataset.retryable !== 'true') return;
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    handler();
                });
            }
        }
    });

    const ensureVTTSessionController = () => {
        if (resources.sessionController) return Promise.resolve(resources.sessionController);
        if (resources.sessionControllerPromise) return resources.sessionControllerPromise;
        resources.sessionControllerPromise = Promise.resolve(vttSessionModuleReady)
            .then((factory) => {
                if (!factory || typeof factory.create !== 'function') {
                    throw new Error('VTT session module failed to load.');
                }
                const controller = buildVTTSessionController(factory);
                resources.sessionController = controller;
                return controller;
            })
            .finally(() => {
                resources.sessionControllerPromise = null;
            });
        return resources.sessionControllerPromise;
    };

    const applyVTTCollabSnapshot = (payload, caseId = getActiveCaseId()) => {
        const targetCaseId = String(caseId || '').trim();
        if (!targetCaseId || targetCaseId !== getActiveCaseId() || (sessionState.pendingCaseId && sessionState.pendingCaseId !== targetCaseId)) return;
        const store = getStore();
        const previousSnapshot = sessionState.snapshot;
        const clean = store && typeof store.normalizeVTTStateSnapshot === 'function'
            ? store.normalizeVTTStateSnapshot(payload)
            : deepClone(payload);
        reconcileSnapshotWithRecentLocalDragDrops(clean);
        const changedSceneIds = getSnapshotChangedSceneIds(sessionState.snapshot, clean);
        if (sessionState.initialLoadPending) {
            sessionState.initialLoadPending = false;
        }
        if (stageState.pointer.drag) {
            syncRosterLinkedPlayerPresentation(clean);
            sessionState.pendingRemoteSnapshot = clean;
            return;
        }
        const synced = ensureRosterLinkedPlayerPresentationPersisted(clean, { reason: 'roster-player-presentation-sync' });
        queueRemoteTweensFromSnapshots(sessionState.snapshot, clean);
        sessionState.pendingRemoteSnapshot = null;
        sessionState.snapshot = deepClone(synced.snapshot);
        sessionState.stateCaseId = targetCaseId;
        handleInitiativeTurnOccurrence(previousSnapshot, sessionState.snapshot);
        maybeFollowRemoteActivityForDM(changedSceneIds, sessionState.snapshot);
        normalizeSelections();
        render();
    };

    const applyPendingRemoteVTTSnapshot = () => {
        if (stageState.pointer.drag || !sessionState.pendingRemoteSnapshot) return false;
        const collabTransport = getVTTCollabTransport();
        if (!collabTransport || collabTransport.caseId !== getActiveCaseId()) return false;
        const sessionSnapshot = isVTTCollabReady() && typeof collabTransport.getSnapshot === 'function'
            ? collabTransport.getSnapshot()
            : null;
        const previousSnapshot = sessionState.snapshot;
        const nextSnapshot = sessionSnapshot ? deepClone(sessionSnapshot) : sessionState.pendingRemoteSnapshot;
        reconcileSnapshotWithRecentLocalDragDrops(nextSnapshot);
        const changedSceneIds = getSnapshotChangedSceneIds(sessionState.snapshot, nextSnapshot);
        queueRemoteTweensFromSnapshots(sessionState.snapshot, nextSnapshot);
        const synced = ensureRosterLinkedPlayerPresentationPersisted(nextSnapshot, { reason: 'roster-player-presentation-sync' });
        sessionState.snapshot = deepClone(synced.snapshot);
        sessionState.stateCaseId = getActiveCaseId();
        sessionState.pendingRemoteSnapshot = null;
        handleInitiativeTurnOccurrence(previousSnapshot, sessionState.snapshot);
        maybeFollowRemoteActivityForDM(changedSceneIds, sessionState.snapshot);
        normalizeSelections();
        render();
        return true;
    };

    const applyVTTCollabPositionChanges = (changes = [], meta = {}, caseId = getActiveCaseId()) => {
        const targetCaseId = String(caseId || '').trim();
        if (!targetCaseId || targetCaseId !== getActiveCaseId() || (sessionState.pendingCaseId && sessionState.pendingCaseId !== targetCaseId)) return;
        if (stageState.pointer.drag) {
            if (meta && meta.snapshot) {
                const store = getStore();
                sessionState.pendingRemoteSnapshot = store && typeof store.normalizeVTTStateSnapshot === 'function'
                    ? store.normalizeVTTStateSnapshot(meta.snapshot)
                    : deepClone(meta.snapshot);
                syncRosterLinkedPlayerPresentation(sessionState.pendingRemoteSnapshot);
            }
            return;
        }
        if (meta && meta.ephemeral) {
            previewTokenPositions(changes, { settled: !!meta.settled });
            return;
        }
        if (meta && meta.snapshot) {
            const store = getStore();
            const previousSnapshot = sessionState.snapshot;
            const nextSnapshot = store && typeof store.normalizeVTTStateSnapshot === 'function'
                ? store.normalizeVTTStateSnapshot(meta.snapshot)
                : meta.snapshot;
            reconcileSnapshotWithRecentLocalDragDrops(nextSnapshot);
            if (sessionState.initialLoadPending) {
                sessionState.initialLoadPending = false;
            }
            const synced = ensureRosterLinkedPlayerPresentationPersisted(nextSnapshot, { reason: 'roster-player-presentation-sync' });
            sessionState.snapshot = deepClone(synced.snapshot);
            sessionState.stateCaseId = targetCaseId;
            handleInitiativeTurnOccurrence(previousSnapshot, sessionState.snapshot);
            const remoteSceneIds = new Set(
                (Array.isArray(changes) ? changes : [])
                    .map((change) => String(change && change.sceneId || '').trim())
                    .filter(Boolean)
            );
            if (!remoteSceneIds.size) remoteSceneIds.add(getSharedSceneId(sessionState.snapshot));
            const followedRemoteScene = maybeFollowRemoteActivityForDM(remoteSceneIds, sessionState.snapshot);
            normalizeSelections();
            if (followedRemoteScene) render();
            else renderStage();
            return;
        }
        if (!sessionState.snapshot) return;
        const sceneMap = new Map(
            Array.isArray(sessionState.snapshot.scenes)
                ? sessionState.snapshot.scenes.map((scene) => [scene.id, scene])
                : []
        );
        let mutated = false;
        const queuedTweens = [];
        (Array.isArray(changes) ? changes : []).forEach((change) => {
            const scene = sceneMap.get(String(change && change.sceneId || '').trim());
            if (!scene || !Array.isArray(scene.tokens)) return;
            const token = scene.tokens.find((entry) => entry && entry.id === String(change && change.tokenId || '').trim());
            if (!token) return;
            const fromX = normalizeTokenCoordinate(token.x, token.x);
            const fromY = normalizeTokenCoordinate(token.y, token.y);
            const nextX = normalizeTokenCoordinate(change.x, token.x);
            const nextY = normalizeTokenCoordinate(change.y, token.y);
            const recentDrop = getRecentLocalDragDrop(scene.id, token.id);
            if (recentDrop && (nextX !== recentDrop.x || nextY !== recentDrop.y)) {
                return;
            }
            if (token.x === nextX && token.y === nextY) return;
            token.x = nextX;
            token.y = nextY;
            mutated = true;
            queuedTweens.push({ sceneId: scene.id, tokenId: token.id, fromX, fromY, toX: nextX, toY: nextY });
        });
        if (!mutated) return;
        if (sessionState.initialLoadPending) {
            sessionState.initialLoadPending = false;
        }
        queuedTweens.forEach((tween) => {
            queueRemoteTokenTween(tween.sceneId, tween.tokenId, tween.fromX, tween.fromY, tween.toX, tween.toY);
        });
        const followedRemoteScene = maybeFollowRemoteActivityForDM(new Set(queuedTweens.map((tween) => tween.sceneId)), sessionState.snapshot);
        normalizeSelections();
        if (followedRemoteScene) render();
    };

    const getVTTCollabPendingStatus = () => (
        resources.sessionController && typeof resources.sessionController.getPendingStatus === 'function'
            ? resources.sessionController.getPendingStatus()
            : null
    );
    const setVTTCollabStatus = (status = {}) => (
        resources.sessionController && typeof resources.sessionController.setStatus === 'function'
            ? resources.sessionController.setStatus(status)
            : null
    );
    const updateStoreSyncChip = (status) => (
        resources.sessionController && typeof resources.sessionController.updateStoreStatus === 'function'
            ? resources.sessionController.updateStoreStatus(status)
            : null
    );
    const hasLiveVTTConfig = () => {
        if (resources.sessionController && typeof resources.sessionController.hasLiveConfig === 'function') {
            return resources.sessionController.hasLiveConfig();
        }
        const store = getStore();
        if (!store || typeof store.getSyncConfig !== 'function') return false;
        const config = store.getSyncConfig();
        return !!(config
            && config.enabled
            && config.supabaseUrl
            && config.anonKey
            && config.campaignId
            && String(config.collabRelayUrl || '').trim());
    };
    const loadInitialVTTSnapshot = (_store, requestedCaseId = getActiveCaseId()) => (
        ensureVTTSessionController().then((controller) => controller.loadInitialSnapshot(requestedCaseId))
    );
    const refreshVTTCollabRoomIfNeeded = (requestedCaseId = getActiveCaseId(), transitionId = sessionState.caseTransitionId) => (
        ensureVTTSessionController().then((controller) => controller.refreshRoomIfNeeded(requestedCaseId, transitionId))
    );
    const initVTTCollabWithRetry = (attempts = 3, delayMs = 400) => (
        ensureVTTSessionController().then((controller) => controller.initWithRetry(attempts, delayMs))
    );
    const recoverInitialVTTRoomIfNeeded = () => (
        ensureVTTSessionController().then((controller) => controller.recoverInitialRoomIfNeeded())
    );
    const handleVTTStoreSyncStatus = (status) => (
        resources.sessionController && typeof resources.sessionController.handleStoreStatus === 'function'
            ? resources.sessionController.handleStoreStatus(status)
            : updateStoreSyncChip(status)
    );
    const forceDMVTTAuthoritative = () => (
        ensureVTTSessionController().then((controller) => controller.forceAuthoritative())
    );
    const bustVTTLiveCache = () => (
        ensureVTTSessionController().then((controller) => controller.bustLiveCache())
    );
    const reportVTTAdminActionError = (err, fallback = 'VTT admin action failed.') => {
        if (resources.sessionController && typeof resources.sessionController.reportAdminActionError === 'function') {
            resources.sessionController.reportAdminActionError(err, fallback);
            return;
        }
        const message = err && err.message ? err.message : fallback;
        console.warn(fallback, err);
        window.alert(message);
    };
    const bindSyncChipActions = () => {
        if (resources.sessionController && typeof resources.sessionController.bindSyncActions === 'function') {
            resources.sessionController.bindSyncActions();
        }
    };

    const bindAccentControls = () => {
        if (dom.accentButtonEl && dom.accentButtonEl.dataset.bound !== '1') {
            dom.accentButtonEl.dataset.bound = '1';
            dom.accentButtonEl.addEventListener('click', () => {
                if (typeof window.triggerAccentPicker === 'function') window.triggerAccentPicker();
            });
        }
        if (dom.accentPickerEl && dom.accentPickerEl.dataset.bound !== '1') {
            dom.accentPickerEl.dataset.bound = '1';
            dom.accentPickerEl.addEventListener('change', (event) => {
                const value = event.target && 'value' in event.target ? event.target.value : '';
                if (typeof window.setAccentColor === 'function') window.setAccentColor(value);
            });
        }
    };

    const renderSpawnLists = () => {
        if (dom.playerSpawnListEl) {
            const players = getPlayers();
            dom.playerSpawnListEl.innerHTML = [
                `
                    <button class="vtt-token-spawn" type="button" data-action="open-quick-spawn" data-spawn-kind="custom">
                        <span class="vtt-token-spawn-name">Custom Token</span>
                        <span class="vtt-token-spawn-meta">Click for quick add · drag to place</span>
                    </button>
                `,
                ...players.map((player) => `
                    <button class="vtt-token-spawn" type="button" data-action="spawn-player" data-spawn-kind="player" data-id="${escapeHtml(String(player.id || ''))}">
                        <span class="vtt-token-spawn-name">${escapeHtml(player.name || 'Player')}</span>
                        <span class="vtt-token-spawn-meta">Click to add · drag to place · AC ${escapeHtml(String(player.ac ?? '-'))} · PP ${escapeHtml(String(player.pp ?? '-'))}</span>
                    </button>
                `),
                players.length ? '' : '<div class="vtt-empty">No players in the shared store yet.</div>'
            ].join('');
        }
    };

    const renderNPCSearchPopover = () => {
        if (!dom.npcSearchPopoverEl || !dom.npcSearchListEl) return;
        const isOpen = uiRuntime.npcSearch.open && isDM();
        if (dom.npcSearchToggleEl) dom.npcSearchToggleEl.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        dom.npcSearchPopoverEl.hidden = !isOpen;

        if (dom.npcSearchInputEl && document.activeElement !== dom.npcSearchInputEl) {
            dom.npcSearchInputEl.value = uiRuntime.npcSearch.query;
        }

        if (!isOpen) return;

        const query = uiRuntime.npcSearch.query.trim().toLowerCase();
        const npcs = getNPCs().filter((npc) => {
            if (!query) return true;
            const name = String(npc && npc.name || '').toLowerCase();
            const guild = String(npc && npc.guild || '').toLowerCase();
            return name.includes(query) || guild.includes(query);
        });
        const monsters = getMonsterDirectory().filter((monster) => {
            if (!query) return true;
            const haystack = [
                monster && monster.name,
                monster && monster.type,
                monster && monster.size,
                monster && monster.challengeRating
            ].map((entry) => String(entry || '').toLowerCase()).join(' ');
            return haystack.includes(query);
        }).slice(0, C.MONSTER_SEARCH_RESULT_LIMIT);
        const loadingMessage = resources.npcSearch.loading || resources.monsters.loading
            ? '<div class="vtt-empty">Refreshing NPC and SRD monster lists...</div>'
            : '';

        const npcMarkup = npcs.length
                ? `
                    <div class="vtt-menu-title">Campaign NPCs</div>
                    ${npcs.map((npc) => `
                    <button class="vtt-token-spawn" type="button" data-action="spawn-npc" data-id="${escapeHtml(String(npc.id || ''))}">
                        <span class="vtt-token-spawn-name">${escapeHtml(npc.name || 'NPC')}</span>
                        <span class="vtt-token-spawn-meta">${escapeHtml(uiRuntime.npcSearch.state && uiRuntime.npcSearch.state.worldPoint ? 'Spawn here' : 'Spawn token')}${npc.guild ? ` · ${escapeHtml(npc.guild)}` : ''}</span>
                    </button>
                `).join('')}
                `
                : '';
        const monsterMarkup = monsters.length
                ? `
                    <div class="vtt-menu-title">SRD Monsters</div>
                    ${monsters.map((monster) => `
                    <button class="vtt-token-spawn" type="button" data-action="spawn-monster" data-id="${escapeHtml(String(monster.id || ''))}">
                        <span class="vtt-token-spawn-name">${escapeHtml(monster.name || 'Monster')}</span>
                        <span class="vtt-token-spawn-meta">${escapeHtml(uiRuntime.npcSearch.state && uiRuntime.npcSearch.state.worldPoint ? 'Spawn here' : 'Spawn token')} · CR ${escapeHtml(monster.challengeRating || '?')}${monster.type ? ` · ${escapeHtml(monster.type)}` : ''}</span>
                    </button>
                `).join('')}
                `
                : '';
        const emptyMessage = !npcMarkup && !monsterMarkup && !loadingMessage
            ? `<div class="vtt-empty">${query ? 'No NPCs or SRD monsters match that search.' : 'No NPCs in the shared store yet. SRD monsters load from the local monsters folder.'}</div>`
            : '';
        dom.npcSearchListEl.innerHTML = `${loadingMessage}${npcMarkup}${monsterMarkup}${emptyMessage}`;
        positionNPCSearchPopover();
    };

    const renderQuickSpawnMenu = () => {
        if (!dom.quickSpawnMenuEl) return;
        if (!uiRuntime.overlays.quickSpawn || !isDM() || !dom.stageEl) {
            dom.quickSpawnMenuEl.hidden = true;
            dom.quickSpawnMenuEl.innerHTML = '';
            return;
        }

        const players = getPlayers();
        const playerCount = players.length;
        dom.quickSpawnMenuEl.hidden = false;
        dom.quickSpawnMenuEl.innerHTML = `
            <div class="vtt-quick-spawn-title">Quick Spawn</div>
            <div class="vtt-quick-spawn-list">
                <button class="vtt-token-spawn" type="button" data-action="quick-spawn-all-players"${playerCount ? '' : ' disabled'}>
                    <span class="vtt-token-spawn-name">Spawn All Players</span>
                    <span class="vtt-token-spawn-meta">${playerCount ? `Spawn ${playerCount} rostered player${playerCount === 1 ? '' : 's'} here` : 'No rostered players yet'}</span>
                </button>
                <button class="vtt-token-spawn" type="button" data-action="quick-spawn-custom">
                    <span class="vtt-token-spawn-name">Custom Token</span>
                    <span class="vtt-token-spawn-meta">Spawn here</span>
                </button>
                <button class="vtt-token-spawn" type="button" data-action="quick-spawn-evidence-note" data-shape="pin">
                    <span class="vtt-token-spawn-name">Pin</span>
                    <span class="vtt-token-spawn-meta">Create a point marker here and open it</span>
                </button>
                <button class="vtt-token-spawn" type="button" data-action="quick-spawn-evidence-note" data-shape="zone">
                    <span class="vtt-token-spawn-name">1x1 Zone</span>
                    <span class="vtt-token-spawn-meta">Create a small tagged area here and open it</span>
                </button>
                <button class="vtt-token-spawn" type="button" data-action="quick-spawn-open-npc-search">
                    <span class="vtt-token-spawn-name">NPC Search Here</span>
                    <span class="vtt-token-spawn-meta">Search the roster and spawn at this spot</span>
                </button>
                <button class="vtt-token-spawn" type="button" data-action="quick-spawn-guildless">
                    <span class="vtt-token-spawn-name">Spawn Guildless</span>
                    <span class="vtt-token-spawn-meta">Spawn here</span>
                </button>
            </div>
        `;

        const stageRect = dom.stageEl.getBoundingClientRect();
        const menuWidth = dom.quickSpawnMenuEl.offsetWidth || 280;
        const menuHeight = dom.quickSpawnMenuEl.offsetHeight || 0;
        const left = clamp(uiRuntime.overlays.quickSpawn.stageX, 12, Math.max(12, stageRect.width - menuWidth - 12));
        let maxTop = Math.max(12, stageRect.height - menuHeight - 12);
        if (window.matchMedia('(min-width: 861px)').matches) {
            const tableHud = document.getElementById('vtt-table-hud');
            const hudRect = tableHud ? tableHud.getBoundingClientRect() : null;
            if (hudRect && hudRect.height > 0) {
                maxTop = Math.min(maxTop, Math.max(12, hudRect.top - stageRect.top - menuHeight - 12));
            }
        }
        const top = clamp(uiRuntime.overlays.quickSpawn.stageY, 12, maxTop);
        dom.quickSpawnMenuEl.style.left = `${left}px`;
        dom.quickSpawnMenuEl.style.top = `${top}px`;
    };

    const renderStageContextMenu = () => {
        if (!dom.stageContextMenuEl) return;
        if (!uiRuntime.overlays.stageContextMenu || !dom.stageEl) {
            if (dom.body) delete dom.body.dataset.vttContextTarget;
            dom.stageContextMenuEl.hidden = true;
            dom.stageContextMenuEl.innerHTML = '';
            return;
        }
        const token = uiRuntime.overlays.stageContextMenu.tokenId ? getTokenById(uiRuntime.overlays.stageContextMenu.tokenId) : null;
        const note = uiRuntime.overlays.stageContextMenu.noteId ? getEvidenceNoteById(uiRuntime.overlays.stageContextMenu.noteId) : null;
        const tokenSourceType = String(token && token.sourceType || '').trim().toLowerCase();
        const canRollFromSheet = (isDM() && tokenSourceType === 'player')
            || (isPlayer() && canUseSharedPlayerTools());
        const canRollStatBlock = !!(token && isDM() && isNPCRollTarget(token));
        const canCustomRoll = isDM() || (isPlayer() && canUseSharedPlayerTools());
        const canBroadcastSharedMarkers = canBroadcastFromViewedScene();
        const sharedMarkerUnavailableMessage = isUsingLocalSceneView(sessionState.snapshot, sessionState.role)
            ? 'Shared pings and templates are unavailable while previewing a local scene. Return to the shared scene to send markers to players.'
            : 'This role cannot send shared pings or templates.';
        const canPing = canBroadcastSharedMarkers;
        const canPreview = canPreviewTokenPortrait(token);
        const canEditToken = !!(isDM() && token);
        const canEditNote = !!(isDM() && note);
        const activeScene = getActiveScene();
        const fogCount = activeScene && Array.isArray(activeScene.fog) ? activeScene.fog.length : 0;
        const contextSource = uiRuntime.overlays.stageContextMenu.source;
        const contextLabel = contextSource === 'touch'
            ? 'Touch actions'
            : (contextSource === 'keyboard' ? 'Keyboard actions' : 'Right-click actions');
        const openMapTools = uiRuntime.overlays.stageContextMenu.source === 'keyboard';
        dom.stageContextMenuEl.setAttribute('role', 'dialog');
        dom.stageContextMenuEl.setAttribute('aria-modal', 'false');
        dom.stageContextMenuEl.setAttribute('aria-label', contextLabel);
        if (dom.body) dom.body.dataset.vttContextTarget = note ? 'note' : (token ? 'token' : 'stage');
        dom.stageContextMenuEl.hidden = false;
        dom.stageContextMenuEl.innerHTML = note ? `
            <div class="vtt-stage-context-head">
                <strong>${escapeHtml(getEvidenceNoteDisplayTitle(note))}</strong>
                <span>${escapeHtml(`${getEvidenceNoteShapeLabel(note)} · ${buildEvidenceNoteAreaLabel(note, activeScene)} · ${note.hidden ? 'DM only' : 'Visible to players'}`)}</span>
            </div>
            <div class="vtt-stage-context-list">
                ${canEditNote ? '<button class="vtt-stage-context-item strong" type="button" data-action="context-note-inspector">Edit zone</button>' : ''}
                ${canPing ? '<button class="vtt-stage-context-item" type="button" data-action="context-ping">Ping here</button>' : ''}
                ${canEditNote ? `<button class="vtt-stage-context-item" type="button" data-action="context-note-toggle-hidden">${note.hidden ? 'Show to players' : 'Make DM only'}</button>` : ''}
                ${canEditNote ? '<button class="vtt-stage-context-item" type="button" data-action="context-note-duplicate">Duplicate zone</button>' : ''}
                ${canEditNote ? '<button class="vtt-stage-context-item danger" type="button" data-action="context-note-delete">Delete zone</button>' : ''}
            </div>
            ${canEditNote ? '<div class="vtt-stage-context-hint">Drag the highlighted zone to move it. Position and size can also be edited in the inspector.</div>' : ''}
        ` : `
            <div class="vtt-stage-context-head">
                <strong>${escapeHtml(token ? (token.label || 'Token') : (note ? getEvidenceNoteDisplayTitle(note) : 'Stage'))}</strong>
                <span>${escapeHtml(contextLabel)}</span>
            </div>
            <div class="vtt-stage-context-list">
                ${canPing ? '<button class="vtt-stage-context-item strong" type="button" data-action="context-ping">Ping here</button>' : ''}
                ${canRollFromSheet ? '<button class="vtt-stage-context-item" type="button" data-action="context-roll-from-sheet">Roll from character sheet</button>' : ''}
                ${canCustomRoll ? '<button class="vtt-stage-context-item" type="button" data-action="context-custom-roll">Custom roll (any dice)</button>' : ''}
                ${canRollStatBlock ? '<button class="vtt-stage-context-item" type="button" data-action="context-roll-stat-block">Roll stat block / NPC</button>' : ''}
                ${canEditToken ? `<button class="vtt-stage-context-item" type="button" data-action="context-token-inspector">Token inspector</button>` : ''}
                ${canEditNote ? `<button class="vtt-stage-context-item" type="button" data-action="context-note-inspector">Zone inspector</button>` : ''}
                ${canPreview ? `<button class="vtt-stage-context-item" type="button" data-action="context-preview-token">${token.id === stageState.preview.tokenId ? 'Hide portrait' : 'Preview portrait'}</button>` : ''}
                ${isDM() && !token ? '<button class="vtt-stage-context-item" type="button" data-action="context-quick-spawn">Quick spawn here</button><button class="vtt-stage-context-item" type="button" data-action="context-npc-search">NPC search here</button>' : ''}
            </div>
            <details class="vtt-stage-context-details"${openMapTools ? ' open' : ''}>
                <summary>Map tools</summary>
                <div class="vtt-stage-context-section">
                <div class="vtt-menu-title">Measure & Areas</div>
                <div class="vtt-stage-context-grid">
                    <button class="vtt-stage-context-item" type="button" data-action="context-set-tool" data-tool-mode="navigate">Navigate</button>
                    <button class="vtt-stage-context-item" type="button" data-action="context-set-tool" data-tool-mode="ruler">Ruler</button>
                    ${canBroadcastSharedMarkers ? '<button class="vtt-stage-context-item" type="button" data-action="context-set-tool" data-tool-mode="circle">Circle</button><button class="vtt-stage-context-item" type="button" data-action="context-set-tool" data-tool-mode="cone">Cone</button>' : ''}
                    ${isDM() ? '<button class="vtt-stage-context-item" type="button" data-action="context-set-tool" data-tool-mode="note">Pins/Zones</button>' : ''}
                </div>
                ${canBroadcastSharedMarkers ? `<label class="vtt-stage-context-size">
                    <span>Template size</span>
                    <input type="number" data-tool-size-field="sizeCells" min="1" max="99" step="1" value="${escapeHtml(String(stageState.tool.current.sizeCells))}" aria-label="Circle radius and cone length in squares">
                    <small>Circle radius / cone length, in squares</small>
                </label>` : `<div class="vtt-stage-context-hint">${escapeHtml(sharedMarkerUnavailableMessage)}</div>`}
                ${isDM() ? `
                    <button class="vtt-stage-context-item" type="button" data-action="toggle-stealth-mode">Sight Cones: ${getActiveScene() && getActiveScene().stealthMode ? 'On' : 'Off'}</button>
                ` : ''}
                </div>
            ${isDM() ? `
                <div class="vtt-stage-context-section">
                    <div class="vtt-menu-title">Fog</div>
                    <div class="vtt-stage-context-grid">
                        <button class="vtt-stage-context-item" type="button" data-action="context-set-tool" data-tool-mode="fog">Fog</button>
                        <button class="vtt-stage-context-item" type="button" data-action="context-set-tool" data-tool-mode="fog-remove">Unfog</button>
                        ${fogCount > 0 ? `<button class="vtt-stage-context-item" type="button" data-action="clear-scene-fog">Clear Fog (${fogCount})</button>` : ''}
                    </div>
                </div>
            ` : ''}
            </details>
        `;
        requestAnimationFrame(positionStageContextMenu);
    };

    const openStageContextMenu = (clientX, clientY, options = {}) => {
        if (!dom.stageEl) return false;
        closeQuickSpawnMenu();
        closeNPCSearch();
        closeTokenInspectorPopover();
        closeSheetActionPopover();
        closeNPCRollPopover();
        closeInitiativeDetail();
        uiRuntime.overlays.stageContextMenu = {
            clientX: Math.round(toNumber(clientX, window.innerWidth / 2)),
            clientY: Math.round(toNumber(clientY, window.innerHeight / 2)),
            worldPoint: options.worldPoint || screenToWorld(clientX, clientY),
            tokenId: String(options.tokenId || '').trim(),
            noteId: String(options.noteId || '').trim(),
            source: String(options.source || 'pointer').trim(),
            altKey: !!options.altKey,
            shiftKey: !!options.shiftKey
        };
        renderStageContextMenu();
        return true;
    };

    const renderSpawnGhost = () => {
        if (!dom.spawnGhostEl) return;
        if (!stageState.pointer.spawnDrag || !stageState.pointer.spawnDrag.moved || !isDM()) {
            dom.spawnGhostEl.hidden = true;
            dom.spawnGhostEl.innerHTML = '';
            if (dom.body) dom.body.dataset.spawnDragging = '0';
            return;
        }
        dom.spawnGhostEl.hidden = false;
        dom.spawnGhostEl.dataset.overStage = stageState.pointer.spawnDrag.overStage ? 'true' : 'false';
        dom.spawnGhostEl.style.left = `${Math.round(stageState.pointer.spawnDrag.clientX + 18)}px`;
        dom.spawnGhostEl.style.top = `${Math.round(stageState.pointer.spawnDrag.clientY + 18)}px`;
        dom.spawnGhostEl.innerHTML = `
            <div class="vtt-spawn-ghost-name">${escapeHtml(stageState.pointer.spawnDrag.label || 'Token')}</div>
            <div class="vtt-spawn-ghost-meta">${stageState.pointer.spawnDrag.overStage ? 'Release to spawn' : 'Drag onto the stage'}</div>
        `;
        if (dom.body) dom.body.dataset.spawnDragging = '1';
    };

    const describeScene = (scene) => {
        const tokenCount = scene && Array.isArray(scene.tokens) ? scene.tokens.length : 0;
        const evidenceNoteCount = scene && Array.isArray(scene.evidenceNotes) ? scene.evidenceNotes.length : 0;
        const clockCount = scene && Array.isArray(scene.clocks) ? scene.clocks.length : 0;
        return `${scene && scene.mapImageUrl ? 'Map linked' : 'No map'} - ${tokenCount} token${tokenCount === 1 ? '' : 's'} - ${evidenceNoteCount} zone${evidenceNoteCount === 1 ? '' : 's'} - ${clockCount} clock${clockCount === 1 ? '' : 's'}`;
    };

    const getSheetActionSearchResults = () => vttRolls.searchSheetActions(
        buildSheetActionCatalog(),
        uiRuntime.queries.sheetAction,
        { limit: C.QUICK_ACTION_SEARCH_RESULT_LIMIT }
    );

    const getPlayerRollSearchResults = () => {
        const catalog = buildSheetActionCatalog();
        return vttRolls.searchSheetActions(catalog, uiRuntime.queries.playerRoll, {
            limit: C.QUICK_ACTION_SEARCH_RESULT_LIMIT,
            preferredKeys: vttRolls.getFocusQuickRollKeys(catalog)
        });
    };

    const isRollActionGuarded = (key, sourceEl = null) => {
        const guardKey = String(key || '').trim();
        if (!guardKey) return false;
        const now = Date.now();
        const previousAt = Number(resources.rollActionGuard.get(guardKey) || 0);
        if (previousAt && now - previousAt < C.ROLL_ACTION_GUARD_MS) return true;
        resources.rollActionGuard.set(guardKey, now);
        window.setTimeout(() => {
            if (Number(resources.rollActionGuard.get(guardKey) || 0) === now) resources.rollActionGuard.delete(guardKey);
        }, C.ROLL_ACTION_GUARD_MS + 50);
        if (sourceEl instanceof HTMLButtonElement) {
            sourceEl.disabled = true;
            window.setTimeout(() => {
                sourceEl.disabled = false;
            }, C.ROLL_ACTION_GUARD_MS);
        }
        return false;
    };

    const renderSheetActionPopover = () => {
        if (!dom.sheetActionPopoverEl) return;
        if (!uiRuntime.overlays.sheetAction) {
            dom.sheetActionPopoverEl.hidden = true;
            dom.sheetActionPopoverEl.innerHTML = '';
            return;
        }
        const bundle = getActiveSheetBundle(uiRuntime.overlays.sheetAction && uiRuntime.overlays.sheetAction.sheetKey);
        const character = bundle && bundle.character ? bundle.character : null;
        const results = character ? getSheetActionSearchResults() : [];
        const isRequestMode = String(uiRuntime.overlays.sheetAction.mode || '').trim() === 'request';
        dom.sheetActionPopoverEl.hidden = false;
        dom.sheetActionPopoverEl.innerHTML = `
            <div class="vtt-popover-head">
                <div>
                    <strong>${isRequestMode ? 'Ask Roll' : 'Sheet Actions'}</strong>
                    <span>${escapeHtml(character && character.meta && character.meta.name ? character.meta.name : 'Open a sheet first')}</span>
                </div>
                <button class="vtt-inline-btn vtt-inline-btn-icon" type="button" data-action="close-sheet-actions" aria-label="Close sheet actions">X</button>
            </div>
            <label class="vtt-field vtt-field-tight">
                <span>Search</span>
                <input type="search" data-sheet-action-search value="${escapeHtml(uiRuntime.queries.sheetAction)}" placeholder="attack, save, spell, skill">
            </label>
            ${isRequestMode ? `
                <div class="vtt-chip-row">
                    <button class="vtt-chip-btn strong" type="button" data-action="set-sheet-action-mode" data-mode="request">Ask Here</button>
                    <button class="vtt-chip-btn" type="button" data-action="set-sheet-action-mode" data-mode="roll">Roll Now</button>
                </div>
                <div class="vtt-detail-note">Ask Here arms an ask-to-roll marker; pick a roll, then click the map location.</div>
            ` : ''}
            <div class="vtt-popover-results vtt-action-search-results">
                ${results.length ? results.map((item) => `
                    <button type="button" class="vtt-action-search-item" data-action="${isRequestMode ? 'ask-roll-from-sheet-action' : 'run-sheet-action'}" data-id="${escapeHtml(item.key)}">
                        <span class="vtt-action-search-kind">${escapeHtml(item.category)}</span>
                        <span class="vtt-action-search-label">${escapeHtml(item.label)}</span>
                        <span class="vtt-action-search-summary">${escapeHtml(item.summary || item.detail || (isRequestMode ? 'Ask to roll this' : 'Run from sheet'))}</span>
                    </button>
                `).join('') : `<div class="vtt-empty">${character ? 'No matching sheet actions.' : 'No local character sheet data found.'}</div>`}
            </div>
            ${uiRuntime.overlays.sheetAction.lastResult ? `
                <div class="vtt-sheet-action-result${uiRuntime.overlays.sheetAction.lastResult.ok ? '' : ' vtt-sheet-action-result-muted'}">
                    <strong>${escapeHtml(String(uiRuntime.overlays.sheetAction.lastResult.total))}</strong>
                    <span>${escapeHtml(`${uiRuntime.overlays.sheetAction.lastResult.label || 'Roll'} - ${uiRuntime.overlays.sheetAction.lastResult.formula || ''}`)}</span>
                </div>
            ` : ''}
        `;
        const input = dom.sheetActionPopoverEl.querySelector('[data-sheet-action-search]');
        if (input && document.activeElement !== input) {
            requestAnimationFrame(() => {
                const activeInput = dom.sheetActionPopoverEl.querySelector('[data-sheet-action-search]');
                if (activeInput && document.activeElement !== activeInput) activeInput.focus();
            });
        }
        requestAnimationFrame(positionSheetActionPopover);
    };

    const openSheetActionPopover = (token = null, clientX, clientY, options = {}) => {
        const opts = options && typeof options === 'object' ? options : {};
        const rosterPlayer = token ? getRosterPlayerForRecord(token) : null;
        uiRuntime.overlays.sheetAction = {
            tokenId: token && token.id ? token.id : '',
            sheetKey: String(rosterPlayer && rosterPlayer.sheetKey || '').trim(),
            mode: opts.mode === 'request' ? 'request' : 'roll',
            clientX: Math.round(toNumber(clientX, window.innerWidth / 2)),
            clientY: Math.round(toNumber(clientY, window.innerHeight / 2))
        };
        uiRuntime.queries.sheetAction = '';
        closeNPCRollPopover();
        renderSheetActionPopover();
        return true;
    };

    const runSheetActionByKey = (key) => {
        const item = buildSheetActionCatalog().find((entry) => entry && entry.key === key);
        if (!item || !item.action) return false;
        const guardContext = [
            'sheet-action',
            item.key,
            uiRuntime.overlays.sheetAction && uiRuntime.overlays.sheetAction.mode || '',
            uiRuntime.overlays.sheetAction && uiRuntime.overlays.sheetAction.tokenId || '',
            uiRuntime.overlays.sheetAction && uiRuntime.overlays.sheetAction.sheetKey || ''
        ].join(':');
        if (isRollActionGuarded(guardContext)) return false;
        const directResult = runSheetActionDirect(item);
        if (directResult && directResult.ok) {
            if (isInitiativeSheetAction(item)) {
                applySheetInitiativeRollToTracker(directResult);
            }
            uiRuntime.overlays.sheetAction = {
                ...(uiRuntime.overlays.sheetAction || {}),
                lastResult: directResult
            };
            uiRuntime.playerRoll.lastResult = directResult;
            renderSheetActionPopover();
            renderPlayerRollMenu();
            postSheetDiscordRoll(directResult.character, directResult.label, directResult.total, directResult.formula, directResult.type, directResult.detail).catch((err) => {
                console.warn('VTT sheet roll Discord post failed', err);
            });
            return true;
        }
        const message = directResult && directResult.reason === 'missing-character'
            ? 'No linked local character sheet data.'
            : 'That sheet action needs the Character Sheet.';
        uiRuntime.overlays.sheetAction = {
            ...(uiRuntime.overlays.sheetAction || {}),
            lastResult: {
                ok: false,
                label: item.label,
                total: 'VTT',
                formula: message
            }
        };
        uiRuntime.playerRoll.lastResult = uiRuntime.overlays.sheetAction.lastResult;
        renderSheetActionPopover();
        renderPlayerRollMenu();
        return false;
    };

    const askRollFromSheetActionByKey = (key) => {
        const item = buildSheetActionCatalog().find((entry) => entry && entry.key === key);
        if (!item) return false;
        if (isRollActionGuarded(`ask-roll:${item.key}`)) return false;
        const requestLabel = getAskRollRequestLabelForItem(item);
        const queued = queueRollRequest(requestLabel, { actionKey: item.key });
        if (queued) closeSheetActionPopover();
        return queued;
    };

    const getScenePingById = (pingId) => {
        const targetId = String(pingId || '').trim();
        if (!targetId) return null;
        const scene = getActiveScene();
        const pings = getRenderableScenePings(scene);
        return pings.find((ping) => String(ping && ping.id || '').trim() === targetId) || null;
    };

    const openAskRollSearchFromPing = (ping, request) => {
        if (!canLocalRollAskRollRequest(request)) return false;
        const point = worldToScreen({ x: ping && ping.x, y: ping && ping.y });
        openSheetActionPopover(null, point.x, point.y, { mode: 'roll' });
        uiRuntime.queries.sheetAction = String(request && request.label || '').trim();
        renderSheetActionPopover();
        return true;
    };

    const rollAskRollPingById = (pingId) => {
        if (!canUseSharedPlayerTools()) return false;
        const ping = getScenePingById(pingId);
        const request = getAskRollRequestFromPing(ping);
        if (!request) return false;
        if (!canLocalRollAskRollRequest(request)) return false;
        if (isRollActionGuarded(`ask-ping-roll:${pingId}:${request.actionKey || request.label}`)) return false;
        const actionKey = getRollRequestActionKey(request);
        if (!actionKey) return openAskRollSearchFromPing(ping, request);
        const context = getLocalPlayerFocusContext();
        const point = worldToScreen({ x: ping.x, y: ping.y });
        uiRuntime.overlays.sheetAction = {
            tokenId: context && context.token && context.token.id ? context.token.id : '',
            sheetKey: String(context && context.linkedPlayer && context.linkedPlayer.sheetKey || '').trim(),
            mode: 'roll',
            clientX: Math.round(point.x),
            clientY: Math.round(point.y)
        };
        const rolled = runSheetActionByKey(actionKey);
        if (rolled) {
            removeSharedPingById(ping.id);
            render();
        }
        return rolled;
    };

    const cancelAskRollPingById = (pingId) => {
        const ping = getScenePingById(pingId);
        const request = getAskRollRequestFromPing(ping);
        if (!request || !canLocalCancelAskRollRequest(request)) return false;
        const removed = removeSharedPingById(pingId);
        if (removed) render();
        return removed;
    };

    const findRosterPlayerBySheetKey = (sheetKey) => {
        const cleanSheetKey = String(sheetKey || '').trim();
        if (!cleanSheetKey) return null;
        const matches = getPlayers().filter((player) => String(player && player.sheetKey || '').trim() === cleanSheetKey);
        return matches.length === 1 ? matches[0] : null;
    };
    const getLocalSheetIdentity = () => {
        const bundle = getActiveSheetBundle();
        const character = bundle && bundle.character && typeof bundle.character === 'object' ? bundle.character : null;
        const meta = character && character.meta && typeof character.meta === 'object' ? character.meta : {};
        const sheetKey = String(meta.sheetKey || '').trim();
        const characterName = String(meta.name || meta.player || '').trim() || 'your character';
        return { bundle, character, sheetKey, characterName };
    };

    const getRosterSelfPromptContext = () => {
        if (!isPlayer()) return { shouldPrompt: false };
        const players = getPlayers().filter((player) => player && typeof player === 'object' && String(player.id || '').trim());
        if (!players.length) return { shouldPrompt: false };
        const identity = getLocalSheetIdentity();
        if (!identity.sheetKey) return { shouldPrompt: false };
        const linked = findRosterPlayerBySheetKey(identity.sheetKey);
        if (linked) return { shouldPrompt: false, players, identity, linked };
        return { shouldPrompt: true, players, identity };
    };

    const getLocalPlayerFocusContext = () => {
        const identity = getLocalSheetIdentity();
        const linkedPlayer = identity.sheetKey ? findRosterPlayerBySheetKey(identity.sheetKey) : null;
        const playerId = String(linkedPlayer && linkedPlayer.id || '').trim();
        const scene = getActiveScene();
        const token = playerId && scene && Array.isArray(scene.tokens)
            ? scene.tokens.find((entry) =>
                String(entry && entry.sourceType || '').trim() === 'player'
                && String(entry && entry.sourceId || '').trim() === playerId
                // Explicitly hidden tokens remain DM-only. A player's own non-hidden token
                // stays available when it enters fog so it can continue to be located and moved.
                && !entry.hidden
            ) || null
            : null;
        const entry = token ? findEntryForToken(token.id) : (playerId && sessionState.snapshot && sessionState.snapshot.initiative && Array.isArray(sessionState.snapshot.initiative.entries)
            ? sessionState.snapshot.initiative.entries.find((candidate) =>
                String(candidate && candidate.sourceType || '').trim() === 'player'
                && String(candidate && candidate.sourceId || '').trim() === playerId
            ) || null
            : null);
        const activeEntryId = String(sessionState.snapshot && sessionState.snapshot.initiative && sessionState.snapshot.initiative.activeEntryId || '').trim();
        return {
            identity,
            linkedPlayer,
            playerId,
            token,
            entry,
            isTurn: !!(entry && String(entry.id || '').trim() === activeEntryId)
        };
    };

    const getRosterSelfSuggestedPlayer = (players, identity) => {
        const cleanSheetKey = String(identity && identity.sheetKey || '').trim();
        const sheetMatches = players.filter((player) => String(player && player.sheetKey || '').trim() === cleanSheetKey);
        if (sheetMatches.length) return sheetMatches[0];

        const names = new Set([
            identity && identity.character && identity.character.meta ? identity.character.meta.name : '',
            identity && identity.character && identity.character.meta ? identity.character.meta.player : ''
        ].map((entry) => String(entry || '').trim().toLowerCase()).filter(Boolean));
        if (names.size) {
            const nameMatches = players.filter((player) => names.has(String(player && player.name || '').trim().toLowerCase()));
            if (nameMatches.length === 1) return nameMatches[0];
        }

        return players.find((player) => !String(player && player.sheetKey || '').trim()) || players[0] || null;
    };

    const closeRosterSelfModal = ({ restoreFocus = false } = {}) => {
        if (!dom.rosterSelfModalEl) return false;
        const wasOpen = !dom.rosterSelfModalEl.hidden;
        dom.rosterSelfModalEl.hidden = true;
        syncVTTModalContainment();
        uiRuntime.modals.rosterSelf.error = '';
        if (dom.rosterSelfErrorEl) {
            dom.rosterSelfErrorEl.hidden = true;
            dom.rosterSelfErrorEl.textContent = '';
        }
        const returnFocusEl = uiRuntime.modals.rosterSelf.returnFocusEl;
        uiRuntime.modals.rosterSelf.returnFocusEl = null;
        if (restoreFocus && !focusVTTModalElement(returnFocusEl)) focusVTTModalFallback();
        return wasOpen;
    };

    let caseBoardReturnFocusEl = null;

    const getVTTCaseBoardUrl = () => {
        const url = new URL('board.html', window.location.href);
        url.searchParams.set('embedded', 'vtt');
        url.searchParams.set('caseId', getActiveCaseId());
        return url.toString();
    };

    const syncVTTCaseBoardEmbed = () => {
        const caseId = getActiveCaseId();
        const url = getVTTCaseBoardUrl();
        [dom.caseBoardPopoutEl, dom.caseBoardHeaderPopoutEl].filter(Boolean).forEach((linkEl) => {
            linkEl.href = url;
        });
        if (dom.caseBoardCaseLabelEl) {
            dom.caseBoardCaseLabelEl.textContent = `Case: ${getActiveCaseName()} · Shared editable board`;
        }
        const isOpen = !!(dom.caseBoardModalEl && !dom.caseBoardModalEl.hidden);
        if (isOpen && dom.caseBoardFrameEl && (
            !dom.caseBoardFrameEl.getAttribute('src')
            || dom.caseBoardFrameEl.dataset.caseId !== caseId
        )) {
            dom.caseBoardFrameEl.dataset.caseId = caseId;
            dom.caseBoardFrameEl.src = url;
        }
        return url;
    };

    const closeVTTCaseBoard = ({ restoreFocus = true } = {}) => {
        if (!dom.caseBoardModalEl || dom.caseBoardModalEl.hidden) return false;
        dom.caseBoardModalEl.hidden = true;
        syncVTTModalContainment();
        const returnFocusEl = caseBoardReturnFocusEl;
        caseBoardReturnFocusEl = null;
        if (restoreFocus && !focusVTTModalElement(returnFocusEl)) focusVTTModalFallback();
        return true;
    };

    const openVTTCaseBoard = (opener = null) => {
        if (!dom.caseBoardModalEl) return false;
        closeViewMenu();
        closeToolsMenu();
        closeQuickSpawnMenu();
        closeStageContextMenu();
        closeTokenInspectorPopover();
        closeInitiativeDetail();
        const requestedOpener = opener instanceof HTMLElement
            ? opener
            : (document.activeElement instanceof HTMLElement ? document.activeElement : null);
        const headerBoardSummary = dom.headerBoardMenuEl && typeof dom.headerBoardMenuEl.querySelector === 'function'
            ? dom.headerBoardMenuEl.querySelector('summary')
            : null;
        if (dom.headerBoardMenuEl) dom.headerBoardMenuEl.open = false;
        caseBoardReturnFocusEl = requestedOpener && requestedOpener.closest('#vtt-header-board-menu')
            ? headerBoardSummary
            : requestedOpener;
        dom.caseBoardModalEl.hidden = false;
        syncVTTCaseBoardEmbed();
        syncVTTModalContainment();
        window.requestAnimationFrame(() => {
            focusVTTModalElement(dom.caseBoardModalEl);
        });
        return true;
    };

    const isRosterSelfModalOpen = () => !!(dom.rosterSelfModalEl && !dom.rosterSelfModalEl.hidden);

    const renderRosterSelfModal = () => {
        if (!dom.rosterSelfModalEl) return;
        const context = getRosterSelfPromptContext();
        if (!context.shouldPrompt) {
            closeRosterSelfModal();
            uiRuntime.modals.rosterSelf.selectedId = '';
            return;
        }

        const players = context.players || [];
        const identity = context.identity || getLocalSheetIdentity();
        const selectedStillValid = players.some((player) => String(player && player.id || '').trim() === uiRuntime.modals.rosterSelf.selectedId);
        if (!selectedStillValid) {
            const suggested = getRosterSelfSuggestedPlayer(players, identity);
            uiRuntime.modals.rosterSelf.selectedId = String(suggested && suggested.id || players[0] && players[0].id || '').trim();
        }

        const wasHidden = dom.rosterSelfModalEl.hidden;
        if (wasHidden) {
            closeNPCSearch();
            closeViewMenu();
            closeToolsMenu();
            closeQuickSpawnMenu();
            closeTokenInspectorPopover();
            closeInitiativeDetail();
            closeSheetActionPopover();
            closeNPCRollPopover();
            clearSpawnDrag();
            clearTemplatePlacementState();
            uiRuntime.modals.rosterSelf.returnFocusEl = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        }

        if (dom.rosterSelfDetailEl) {
            dom.rosterSelfDetailEl.textContent = `Link ${identity.characterName} to your player roster entry so the VTT can resolve your token and sheet rolls.`;
        }
        if (dom.rosterSelfListEl) {
            dom.rosterSelfListEl.innerHTML = players.map((player) => {
                const playerId = String(player && player.id || '').trim();
                const playerSheetKey = String(player && player.sheetKey || '').trim();
                const selected = playerId && playerId === uiRuntime.modals.rosterSelf.selectedId;
                const status = playerSheetKey === identity.sheetKey
                    ? 'Already linked to this sheet'
                    : (playerSheetKey ? 'Linked to another local sheet' : 'Available');
                const meta = [
                    player && player.hp ? `HP ${player.hp}` : '',
                    player && player.ac !== undefined ? `AC ${player.ac}` : '',
                    player && player.pp !== undefined ? `PP ${player.pp}` : ''
                ].filter(Boolean).join(' · ');
                return `
                    <button class="vtt-roster-self-option" type="button" data-action="select-roster-self"
                        data-id="${escapeHtml(playerId)}" aria-pressed="${selected ? 'true' : 'false'}">
                        <span class="vtt-roster-self-name">${escapeHtml(player && player.name || 'Unnamed Player')}</span>
                        ${meta ? `<span class="vtt-roster-self-meta">${escapeHtml(meta)}</span>` : ''}
                        <span class="vtt-roster-self-status">${escapeHtml(status)}</span>
                    </button>
                `;
            }).join('');
        }
        if (dom.rosterSelfErrorEl) {
            dom.rosterSelfErrorEl.hidden = !uiRuntime.modals.rosterSelf.error;
            dom.rosterSelfErrorEl.textContent = uiRuntime.modals.rosterSelf.error;
        }
        if (dom.rosterSelfConfirmEl) {
            dom.rosterSelfConfirmEl.disabled = !uiRuntime.modals.rosterSelf.selectedId;
        }
        dom.rosterSelfModalEl.hidden = false;
        syncVTTModalContainment();

        if (wasHidden) {
            window.requestAnimationFrame(() => {
                const selectedButton = dom.rosterSelfListEl ? dom.rosterSelfListEl.querySelector('[aria-pressed="true"]') : null;
                const focusTarget = selectedButton || dom.rosterSelfConfirmEl;
                focusVTTModalElement(focusTarget);
            });
        }
    };

    const selectRosterSelfPlayer = (playerId) => {
        const cleanPlayerId = String(playerId || '').trim();
        const players = getPlayers();
        if (!players.some((player) => String(player && player.id || '').trim() === cleanPlayerId)) return false;
        uiRuntime.modals.rosterSelf.selectedId = cleanPlayerId;
        uiRuntime.modals.rosterSelf.error = '';
        renderRosterSelfModal();
        return true;
    };

    const linkRosterSelfSelection = () => {
        const store = getStore();
        const identity = getLocalSheetIdentity();
        const playerId = String(uiRuntime.modals.rosterSelf.selectedId || '').trim();
        if (!identity.sheetKey) {
            uiRuntime.modals.rosterSelf.error = 'Open or create a local character sheet first, then return to the VTT.';
            renderRosterSelfModal();
            return false;
        }
        if (!store || typeof store.updatePlayer !== 'function') {
            uiRuntime.modals.rosterSelf.error = 'The roster store is not available yet.';
            renderRosterSelfModal();
            return false;
        }
        const players = getPlayers();
        const selected = players.find((player) => String(player && player.id || '').trim() === playerId);
        if (!selected) {
            uiRuntime.modals.rosterSelf.error = 'Choose a player roster entry.';
            renderRosterSelfModal();
            return false;
        }
        const selectedSheetKey = String(selected && selected.sheetKey || '').trim();
        if (selectedSheetKey && selectedSheetKey !== identity.sheetKey) {
            const selectedName = String(selected && selected.name || 'that roster entry').trim() || 'that roster entry';
            if (!window.confirm(`Replace the sheet already linked to ${selectedName}?`)) return false;
        }

        players.forEach((player) => {
            const otherId = String(player && player.id || '').trim();
            if (!otherId || otherId === playerId) return;
            if (String(player && player.sheetKey || '').trim() === identity.sheetKey) {
                store.updatePlayer(otherId, { sheetKey: '' });
            }
        });
        const updated = store.updatePlayer(playerId, { sheetKey: identity.sheetKey });
        if (!updated) {
            uiRuntime.modals.rosterSelf.error = 'Could not update that roster entry.';
            renderRosterSelfModal();
            return false;
        }

        uiRuntime.modals.rosterSelf.selectedId = '';
        closeRosterSelfModal({ restoreFocus: true });
        refreshPlayerImageCache();
        if (sessionState.snapshot && syncRosterLinkedPlayerPresentation(sessionState.snapshot)) {
            normalizeSelections();
        }
        render();
        return true;
    };
    const rollSheetD20 = (character, bonus, label, options = {}) => {
        const opts = options && typeof options === 'object' ? options : {};
        const allowAdvantage = opts.allowAdvantage !== false;
        const mode = allowAdvantage ? normalizeRollMode(opts.rollMode || uiRuntime.playerRoll.mode || (character && character.rollMode) || 'norm') : 'norm';
        let result = null;
        if (allowAdvantage && (mode === 'adv' || mode === 'dis')) {
            const first = randomIntInclusive(1, 20);
            const second = randomIntInclusive(1, 20);
            const total = mode === 'adv' ? Math.max(first, second) : Math.min(first, second);
            result = {
                total,
                formula: `[${first}, ${second}] (${mode.toUpperCase()})`,
                isCrit: total === 20,
                isFail: total === 1
            };
        } else {
            const roll = randomIntInclusive(1, 20);
            result = {
                total: roll,
                formula: `[${roll}]`,
                isCrit: roll === 20,
                isFail: roll === 1
            };
        }
        let extraTotal = 0;
        let extraText = '';
        const buffs = character && character.buffs && typeof character.buffs === 'object' ? character.buffs : {};
        const type = String(opts.type || 'check').trim();
        if (buffs.bless && (type === 'atk' || type === 'save')) {
            const bless = randomIntInclusive(1, 4);
            extraTotal += bless;
            extraText += ` +${bless}(Bless)`;
        }
        if (buffs.guidance && type === 'check') {
            const guidance = randomIntInclusive(1, 4);
            extraTotal += guidance;
            extraText += ` +${guidance}(Guidance)`;
        }
        if (buffs.global) {
            const parsedGlobal = gmParseComplexFormula(buffs.global);
            if (!parsedGlobal.ok) return { ok: false, reason: 'invalid-global-buff', error: parsedGlobal.error };
            if (parsedGlobal.text) {
                extraTotal += parsedGlobal.total;
                extraText += ` +${parsedGlobal.text}(Global)`;
            }
        }
        const cleanBonus = Math.round(toNumber(bonus, 0));
        const total = result.total + cleanBonus + extraTotal;
        const formula = `${result.formula}${cleanBonus ? ` ${cleanBonus >= 0 ? '+' : ''}${cleanBonus}` : ''}${extraText}`;
        return {
            ok: true,
            character,
            label,
            total,
            formula,
            type,
            detail: opts.detail || '',
            isCrit: result.isCrit,
            isFail: result.isFail
        };
    };
    const rollRawD20WithMode = (mode = uiRuntime.playerRoll.mode) => {
        const cleanMode = normalizeRollMode(mode);
        if (cleanMode === 'adv' || cleanMode === 'dis') {
            const first = randomIntInclusive(1, 20);
            const second = randomIntInclusive(1, 20);
            const total = cleanMode === 'adv' ? Math.max(first, second) : Math.min(first, second);
            return {
                total,
                formula: `[${first}, ${second}] (${cleanMode.toUpperCase()})`,
                isCrit: total === 20,
                isFail: total === 1
            };
        }
        const roll = randomIntInclusive(1, 20);
        return {
            total: roll,
            formula: `[${roll}]`,
            isCrit: roll === 20,
            isFail: roll === 1
        };
    };
    const rollSheetDie = (character, sides, bonus, label, options = {}) => {
        const opts = options && typeof options === 'object' ? options : {};
        if (Number(sides) === 20) return rollSheetD20(character, bonus, label, opts);
        const result = gmCoreRoll(1, Math.max(2, parseInt(sides, 10) || 20));
        const cleanBonus = Math.round(toNumber(bonus, 0));
        const total = result.total + cleanBonus;
        return {
            ok: true,
            character,
            label,
            total,
            formula: `${result.formula}${cleanBonus ? ` ${cleanBonus >= 0 ? '+' : ''}${cleanBonus}` : ''}`,
            type: opts.type || 'check',
            detail: opts.detail || ''
        };
    };
    const rollSheetFormula = (character, label, formulaSource, options = {}) => {
        const parsed = gmParseComplexFormula(formulaSource);
        if (!parsed.text) return { ok: false, reason: 'invalid' };
        const opts = options && typeof options === 'object' ? options : {};
        const ability = String(opts.ability || '').trim().toLowerCase();
        const abilityBonus = C.DEFENCE_KEYS.includes(ability) ? getSheetMod(character, ability) : 0;
        const total = parsed.total + abilityBonus;
        const formula = `${parsed.text}${abilityBonus ? ` ${abilityBonus >= 0 ? '+' : ''}${abilityBonus} (${ability.toUpperCase()})` : ''}`;
        return {
            ok: true,
            character,
            label,
            total,
            formula,
            type: opts.type || 'dmg',
            detail: opts.detail || ''
        };
    };
    const runSheetActionDirect = (item) => {
        const bundle = getActiveSheetBundle(uiRuntime.overlays.sheetAction && uiRuntime.overlays.sheetAction.sheetKey);
        const character = bundle && bundle.character ? bundle.character : null;
        if (!character || !item || !item.action) return { ok: false, reason: 'missing-character' };
        const action = item.action;
        if (action.kind === 'spell') return { ok: false, reason: 'unsupported' };
        const code = String(action.code || '').trim();
        let match = code.match(/^rollDie\(\s*(\d+)\s*,\s*([^,]+)\s*,\s*'([^']*)'\s*,\s*(true|false)\s*,\s*'([^']*)'/);
        if (match) {
            return rollSheetDie(character, parseInt(match[1], 10) || 20, parseInt(match[2], 10) || 0, match[3] || `d${match[1]}`, {
                allowAdvantage: match[4] === 'true',
                type: match[5] || 'check'
            });
        }
        if (code === 'rollInitiative()') {
            const dexScore = character && character.stats && character.stats.dex ? Number(character.stats.dex.val) : 10;
            const dexMod = getSheetMod(character, 'dex');
            const parsedInit = gmParseComplexFormula(character && character.meta ? character.meta.init : '');
            if (!parsedInit.ok) return { ok: false, reason: 'invalid-initiative', error: parsedInit.error };
            const result = rollSheetD20(character, dexMod + parsedInit.total, 'Initiative', { type: 'check' });
            result.formula = `${result.formula}${parsedInit.text ? ` + ${parsedInit.text}(Init)` : ''}`;
            result.total = Math.round(toNumber(result.total, 0));
            result.detail = `Tie ${Math.max(1, Math.min(30, Math.round(toNumber(dexScore, 10))))}`;
            return result;
        }
        match = code.match(/^rollCheck\(\s*'([a-z]{3})'\s*\)$/i);
        if (match) {
            const stat = match[1].toLowerCase();
            return rollSheetD20(character, getSheetMod(character, stat), `${stat.toUpperCase()} Check`, { type: 'check' });
        }
        match = code.match(/^rollSave\(\s*'([a-z]{3})'\s*\)$/i);
        if (match) {
            const stat = match[1].toLowerCase();
            const proficient = !!(character.stats && character.stats[stat] && character.stats[stat].save);
            return rollSheetD20(character, getSheetMod(character, stat) + (proficient ? getSheetPB(character) : 0), `${stat.toUpperCase()} Save`, { type: 'save' });
        }
        match = code.match(/^rollSkill\(\s*'([^']+)'\s*\)$/i);
        if (match) {
            const skillName = String(match[1] || '').trim().toLowerCase();
            const stat = character.skillOverrides && character.skillOverrides[skillName] ? character.skillOverrides[skillName] : sheetSkillsMap[skillName];
            const profLevel = character.skills && Number.isFinite(Number(character.skills[skillName])) ? Number(character.skills[skillName]) : 0;
            const bonus = getSheetMod(character, stat) + (profLevel * getSheetPB(character)) + getSheetSkillMiscBonus(character, skillName);
            return rollSheetD20(character, bonus, `${toTitleCaseWords(skillName)} (${String(stat || '').toUpperCase()})`, { type: 'check' });
        }
        match = code.match(/^rollAttack\(\s*(\d+)\s*\)$/);
        if (match) {
            const attack = Array.isArray(character.attacks) ? character.attacks[parseInt(match[1], 10)] : null;
            if (!attack) return { ok: false, reason: 'missing-attack' };
            const stat = C.DEFENCE_KEYS.includes(attack.atkStat) ? attack.atkStat : (C.DEFENCE_KEYS.includes(attack.stat) ? attack.stat : '');
            const bonus = (stat ? getSheetMod(character, stat) : 0) + getSheetPB(character) + (parseInt(attack.atkBonus, 10) || 0);
            return rollSheetD20(character, bonus, `${attack.name || 'Weapon'} Atk`, { type: 'atk', detail: attack.desc || '' });
        }
        match = code.match(/^rollDamage\(\s*(\d+)\s*\)$/);
        if (match) {
            const attack = Array.isArray(character.attacks) ? character.attacks[parseInt(match[1], 10)] : null;
            if (!attack) return { ok: false, reason: 'missing-attack' };
            const stat = C.DEFENCE_KEYS.includes(attack.dmgStat) ? attack.dmgStat : (C.DEFENCE_KEYS.includes(attack.stat) ? attack.stat : '');
            const formula = `${attack.dmg || ''} ${typeof attack.dmgBonus === 'string' ? attack.dmgBonus : ''}`.trim();
            return rollSheetFormula(character, `${attack.name || 'Weapon'} Dmg`, formula, { type: 'dmg', ability: stat, detail: attack.desc || '' });
        }
        match = code.match(/^rollResRecharge\(\s*(\d+)\s*\)$/);
        if (match) {
            const resource = Array.isArray(character.resources) ? character.resources[parseInt(match[1], 10)] : null;
            if (!resource) return { ok: false, reason: 'missing-resource' };
            return rollSheetFormula(character, `Recharge: ${resource.name || 'Resource'}`, resource.rFormula || '1d6', { type: 'check' });
        }
        return { ok: false, reason: 'unsupported' };
    };
    const isInitiativeSheetAction = vttRolls.isInitiativeSheetAction;
    const buildDeterministicInitiativeEntryId = (sourceType, sourceId) => {
        const type = String(sourceType || '').trim();
        const id = String(sourceId || '').trim();
        if (!type || !id) return '';
        return String(`init_${type}_${id}`).trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_').slice(0, 120);
    };
    const hasDefenceValues = (defences) => C.DEFENCE_KEYS.some((key) => hasValue(defences && defences[key]));
    const upsertRolledInitiativeEntry = (roll) => {
        const packet = roll && typeof roll === 'object' ? roll : null;
        if (!packet) return false;
        const total = Math.round(toNumber(packet.total, 0));
        const tie = clamp(Math.round(toNumber(packet.tie, 10)), 0, 99);
        const name = String(packet.name || 'Combatant').trim() || 'Combatant';
        const sourceType = String(packet.sourceType || '').trim();
        const sourceId = String(packet.sourceId || '').trim();
        const linkedTokenId = String(packet.linkedTokenId || packet.tokenId || '').trim();
        let applied = false;

        const saved = withDraft((draft) => {
            if (!draft.initiative || !Array.isArray(draft.initiative.entries)) {
                draft.initiative = {
                    entries: [],
                    round: 1,
                    activeEntryId: '',
                    encounterActive: false,
                    sceneId: '',
                    startedAt: 0
                };
            }
            const entries = draft.initiative.entries;
            let linkedToken = linkedTokenId ? findTokenByIdAcrossScenes(draft, linkedTokenId) : null;
            if (!linkedToken && sourceType && sourceId) linkedToken = findTokenAcrossScenes(draft, sourceType, sourceId);
            const hasSourceIdentity = !!(sourceType && sourceId);
            const existingIdx = entries.findIndex((entry) => {
                if (linkedToken && String(entry && entry.linkedTokenId || '').trim() === String(linkedToken.id || '').trim()) return true;
                if (hasSourceIdentity && String(entry && entry.sourceType || '').trim() === sourceType && String(entry && entry.sourceId || '').trim() === sourceId) return true;
                if (!hasSourceIdentity) return String(entry && entry.name || '').trim().toLowerCase() === name.toLowerCase();
                return false;
            });
            const previous = existingIdx >= 0 && entries[existingIdx] && typeof entries[existingIdx] === 'object'
                ? entries[existingIdx]
                : null;
            const seed = previous
                ? (linkedToken ? syncInitiativeEntryFromToken(previous, linkedToken) : { ...previous })
                : (linkedToken ? buildInitiativeEntryFromToken(linkedToken) : {
                    id: buildDeterministicInitiativeEntryId(sourceType, sourceId) || buildId('init'),
                    name,
                    linkedTokenId: linkedToken ? linkedToken.id : '',
                    side: packet.side || 'player',
                    imageUrl: '',
                    sourceType,
                    sourceId,
                    total: 0,
                    tie: 10,
                    hpCurrent: null,
                    hpMax: null,
                    ac: null,
                    passivePerception: null,
                    stealthRoll: null,
                    defences: normalizeDefences(null),
                    reactionUsed: false,
                    concentrating: false,
                    hidden: false,
                    conditions: []
                });
            const packetDefences = normalizeDefences(packet.defences);
            const nextEntry = {
                ...seed,
                id: previous && previous.id ? previous.id : (buildDeterministicInitiativeEntryId(sourceType || seed.sourceType, sourceId || seed.sourceId) || seed.id || buildId('init')),
                name,
                linkedTokenId: linkedToken ? String(linkedToken.id || '').trim() : String(seed.linkedTokenId || '').trim(),
                side: linkedToken ? linkedToken.side : (packet.side || seed.side || 'player'),
                imageUrl: linkedToken ? getTokenMetadataImageUrl(linkedToken) : (seed.imageUrl || ''),
                sourceType: sourceType || seed.sourceType || '',
                sourceId: sourceId || seed.sourceId || '',
                submissionId: String(packet.submissionId || packet.rollId || seed.submissionId || '').trim(),
                submittedAt: Math.max(0, Math.round(toNumber(packet.submittedAt || packet.ts, seed.submittedAt || 0))),
                total,
                tie,
                hpCurrent: packet.hpCurrent !== null && packet.hpCurrent !== undefined ? packet.hpCurrent : seed.hpCurrent,
                hpMax: packet.hpMax !== null && packet.hpMax !== undefined ? packet.hpMax : seed.hpMax,
                ac: packet.ac !== null && packet.ac !== undefined ? packet.ac : seed.ac,
                passivePerception: packet.passivePerception !== null && packet.passivePerception !== undefined ? packet.passivePerception : seed.passivePerception,
                stealthRoll: packet.stealthRoll !== null && packet.stealthRoll !== undefined ? packet.stealthRoll : (seed.stealthRoll ?? null),
                defences: hasDefenceValues(packetDefences) ? packetDefences : normalizeDefences(seed.defences),
                reactionUsed: !!seed.reactionUsed,
                concentrating: !!seed.concentrating,
                hidden: !!seed.hidden,
                conditions: Array.isArray(seed.conditions) ? seed.conditions.slice(0, 24) : []
            };
            const rosterPlayer = packet.rosterPlayer || getRosterPlayerForRecord(linkedToken) || getRosterPlayerForRecord(nextEntry);
            if (rosterPlayer) {
                if (linkedToken) syncTokenRosterIdentity(linkedToken, rosterPlayer);
                syncEntryRosterIdentity(nextEntry, rosterPlayer);
            }
            if (linkedToken && nextEntry.stealthRoll !== null && nextEntry.stealthRoll !== undefined) {
                linkedToken.stealthRoll = nextEntry.stealthRoll;
            }

            if (existingIdx >= 0) entries[existingIdx] = nextEntry;
            else entries.push(nextEntry);
            sortInitiativeEntries(entries);
            if (!draft.initiative.activeEntryId && entries[0]) draft.initiative.activeEntryId = entries[0].id;
            stageState.selection.entryId = nextEntry.id;
            stageState.selection.tokenId = linkedToken ? linkedToken.id : stageState.selection.tokenId;
            applied = true;
        }, { reason: 'vtt-initiative-roll' });

        return !!(saved && applied);
    };
    const applySheetInitiativeRollToTracker = (result) => {
        const character = result && result.character ? result.character : null;
        if (!character) return false;
        const sheetKey = String(character.meta && character.meta.sheetKey || '').trim();
        const tokenId = String(uiRuntime.overlays.sheetAction && uiRuntime.overlays.sheetAction.tokenId || '').trim();
        const token = tokenId ? findTokenByIdAcrossScenes(sessionState.snapshot, tokenId) : null;
        const rosterPlayer = getRosterPlayerForRecord(token) || findRosterPlayerBySheetKey(sheetKey);
        const tokenSourceType = String(token && token.sourceType || '').trim();
        const tokenSourceId = String(token && token.sourceId || '').trim();
        const sourceType = rosterPlayer ? 'player' : (tokenSourceType && tokenSourceId ? tokenSourceType : 'sheet');
        const sourceId = rosterPlayer
            ? String(rosterPlayer.id || '').trim()
            : (tokenSourceType && tokenSourceId ? tokenSourceId : sheetKey);
        const sheetName = String(character.meta && (character.meta.name || character.meta.player) || '').trim();
        const dexScore = clamp(Math.round(toNumber(character.stats && character.stats.dex ? character.stats.dex.val : 10, 10)), 0, 99);
        const hpCurrent = character.vitals && hasValue(character.vitals.curr) ? clamp(Math.round(toNumber(character.vitals.curr, 0)), 0, 999999) : null;
        const hpMax = character.vitals && hasValue(character.vitals.max) ? clamp(Math.round(toNumber(character.vitals.max, hpCurrent || 0)), 0, 999999) : hpCurrent;
        return upsertRolledInitiativeEntry({
            name: String(rosterPlayer && rosterPlayer.name || sheetName || token && token.label || 'Player').trim() || 'Player',
            sourceType,
            sourceId,
            linkedTokenId: tokenId,
            side: token && token.side ? token.side : 'player',
            total: result.total,
            tie: dexScore,
            hpCurrent,
            hpMax,
            ac: getSheetArmorClass(character),
            passivePerception: clamp(Math.round(10 + getSheetSkillBonus(character, 'perception')), 0, 99),
            stealthRoll: getSheetStealthRoll(character),
            defences: getSheetDefences(character),
            rosterPlayer
        });
    };
    const getTokenInitiativeTie = (token) => {
        const monster = getMonsterStatBlockForToken(token);
        const dex = monster && monster.abilities && Number.isFinite(Number(monster.abilities.dex))
            ? Number(monster.abilities.dex)
            : 10;
        return clamp(Math.round(dex), 0, 99);
    };
    const applyTokenInitiativeRollToTracker = (token, result) => {
        if (!token || !result) return false;
        const sourceType = String(token.sourceType || '').trim();
        const sourceId = String(token.sourceId || '').trim();
        return upsertRolledInitiativeEntry({
            name: String(token.label || 'Combatant').trim() || 'Combatant',
            sourceType,
            sourceId,
            linkedTokenId: String(token.id || '').trim(),
            side: token.side || 'neutral',
            total: result.total,
            tie: getTokenInitiativeTie(token),
            hpCurrent: hasValue(token.hpCurrent) ? clamp(Math.round(toNumber(token.hpCurrent, 0)), 0, 999999) : null,
            hpMax: hasValue(token.hpMax) ? clamp(Math.round(toNumber(token.hpMax, 0)), 0, 999999) : null,
            ac: hasValue(token.ac) ? clamp(Math.round(toNumber(token.ac, 0)), 0, 99) : null,
            passivePerception: hasValue(token.passivePerception) ? clamp(Math.round(toNumber(token.passivePerception, 10)), 0, 99) : null,
            stealthRoll: getTokenStealthRoll(token),
            defences: normalizeDefences(token.defences)
        });
    };
    const postSheetDiscordRoll = (character, label, total, formula, type = 'check', detail = '') => {
        if (!character || !character.meta || !character.meta.discordActive || !String(character.meta.webhook || '').trim()) return Promise.resolve(false);
        const color = type === 'atk' ? 0xe74c3c : (type === 'dmg' ? 0xf39c12 : 0x4ecdc4);
        const payload = {
            embeds: [{
                author: { name: character.meta.name || character.meta.player || 'Character' },
                title: label,
                description: `**${total}**\nDice: ${formula}${detail ? `\n${detail}` : ''}`,
                color
            }]
        };
        return fetch(String(character.meta.webhook || '').trim(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }).then((response) => {
            if (!response.ok) throw new Error(`Discord webhook failed (${response.status})`);
            return true;
        }).catch((error) => {
            reportVTTError('vtt-character-webhook', 'network', error);
            return false;
        });
    };

    const applyRollModeToD20Formula = (formula, mode = uiRuntime.playerRoll.mode) => (
        vttRolls.applyRollModeToD20Formula(formula, mode)
    );

    const gmCoreRoll = (count, sides, mods = {}) => {
        const result = Dice.coreRoll(count, sides, 'norm', mods);
        return { total: result.total, formula: result.formula };
    };

    const vttProximityController = vttProximityFactory.createController({
        canRoleMoveToken,
        collectFogCellSet,
        escapeHtml,
        getActiveCaseId,
        getActiveScene,
        getActiveSheetBundle,
        getEvidenceNoteCellBounds,
        getEvidenceNoteDisplayTitle,
        getLocalRollMode: () => uiRuntime.playerRoll.mode,
        getLocalView: () => stageState.view.local,
        getProximitySkillLabel,
        getRenderableTokenCells,
        getRollModeLabel,
        getRosterPlayerForRecord,
        getSceneById,
        getSceneCellPx,
        getSceneEvidenceNotes,
        getSheetMod,
        getSheetPB,
        getSheetSkillMiscBonus,
        getTokenById,
        getVisibleTokensForRole,
        isDragging: () => !!stageState.pointer.drag,
        isEvidenceNoteVisibleToRole,
        isInitialLoadPending: () => sessionState.initialLoadPending,
        isPlayer,
        normalizeClockCurrent,
        normalizeClockMax,
        normalizeProximityPromptResult,
        normalizeProximityPromptStateEntry,
        normalizeProximityPromptStates,
        normalizeProximityTrigger,
        normalizeProximityTriggers,
        normalizeProximityTriggerSkill,
        normalizeRollMode,
        postSheetDiscordRoll,
        proximitySettleMs: C.PROXIMITY_TRIGGER_SETTLE_MS,
        promptStackEl: dom.proximityPromptStackEl,
        readJSONStorage,
        rollRawD20WithMode,
        rollSheetD20,
        scaleForZoom,
        sheetSkillsMap,
        stageEl: dom.stageEl,
        toNumber,
        withDraft
    });
    const dismissActiveProximityPrompt = vttProximityController.dismissActiveProximityPrompt;
    const evaluateProximityTriggers = vttProximityController.evaluateProximityTriggers;
    const evaluateStartTurnNear = vttProximityController.evaluateStartTurnNear;
    const getActiveProximityPrompt = vttProximityController.getActivePrompt;
    const renderProximityPrompt = vttProximityController.renderProximityPrompt;
    const resolveActiveProximityRoll = vttProximityController.resolveActiveProximityRoll;

    handleInitiativeTurnOccurrence = (previousSnapshot, nextSnapshot) => {
        const previousInitiative = previousSnapshot && previousSnapshot.initiative ? previousSnapshot.initiative : {};
        const nextInitiative = nextSnapshot && nextSnapshot.initiative ? nextSnapshot.initiative : {};
        const previousEntryId = String(previousInitiative.activeEntryId || '').trim();
        const nextEntryId = String(nextInitiative.activeEntryId || '').trim();
        const previousRound = Math.max(1, Math.round(toNumber(previousInitiative.round, 1)));
        const nextRound = Math.max(1, Math.round(toNumber(nextInitiative.round, 1)));
        const encounterStarted = !previousInitiative.encounterActive && !!nextInitiative.encounterActive;
        const encounterSceneChanged = String(previousInitiative.sceneId || '').trim() !== String(nextInitiative.sceneId || '').trim();
        if (!encounterStarted && !encounterSceneChanged && previousEntryId === nextEntryId && previousRound === nextRound) return false;
        if (typeof evaluateStartTurnNear !== 'function') return false;
        if (!nextInitiative.encounterActive || !nextEntryId) {
            evaluateStartTurnNear({ tokenId: '' });
            renderProximityPrompt();
            return false;
        }

        const entries = Array.isArray(nextInitiative.entries) ? nextInitiative.entries : [];
        const entry = entries.find((candidate) => String(candidate && candidate.id || '').trim() === nextEntryId) || null;
        const sceneId = String(nextInitiative.sceneId || nextSnapshot && nextSnapshot.activeSceneId || '').trim();
        const scene = getSceneById(sceneId, nextSnapshot) || getCombatScene(nextSnapshot);
        const token = getSceneTokenForEntry(scene, entry);
        if (!scene || !token) {
            evaluateStartTurnNear({ sceneId: scene && scene.id || sceneId, tokenId: '' });
            renderProximityPrompt();
            return false;
        }

        evaluateStartTurnNear({
            sceneId: scene.id,
            tokenId: token.id,
            entryId: nextEntryId,
            round: nextRound,
            turnKey: `${nextRound}:${nextEntryId}`
        });
        renderProximityPrompt();
        return true;
    };

    const gmParseComplexFormula = (value = '') => {
        return Dice.parseComplexBonus(value);
    };

    const getGMDiscordSettings = () => {
        const gmData = readJSONStorage(C.GM_STORAGE_KEY, {});
        return {
            active: !!(gmData && gmData.discordActive),
            webhook: String(gmData && gmData.webhook || '').trim()
        };
    };

    const postGMDiscordRoll = (name, reason, total, formula, options = {}) => {
        const settings = getGMDiscordSettings();
        if (!settings.active || !settings.webhook) return Promise.resolve(false);
        const opts = options && typeof options === 'object' ? options : {};
        const color = Number.isFinite(Number(opts.color))
            ? Number(opts.color)
            : (String(opts.type || '').trim() === 'atk' ? 0xe74c3c : (String(opts.type || '').trim() === 'dmg' ? 0xf39c12 : 0x4ecdc4));
        const detail = String(opts.detail || '').trim();
        const payload = {
            embeds: [{
                author: { name },
                title: reason,
                description: `**${total}**\nDice: ${formula}${detail ? `\n${detail}` : ''}`,
                color
            }]
        };
        return fetch(settings.webhook, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }).then((response) => {
            if (!response.ok) throw new Error(`Discord webhook failed (${response.status})`);
            return true;
        }).catch((error) => {
            reportVTTError('vtt-gm-webhook', 'network', error);
            throw error;
        });
    };

    const getMonsterStatBlockForToken = (token) => vttRules.getMonsterStatBlockForToken(token, findMonsterById);
    const buildMonsterRollPresets = (token) => vttRules.buildMonsterRollPresets(token, findMonsterById);

    const renderNPCRollPopover = (result = null) => {
        if (!dom.npcRollPopoverEl) return;
        if (!uiRuntime.overlays.npcRoll) {
            dom.npcRollPopoverEl.hidden = true;
            dom.npcRollPopoverEl.innerHTML = '';
            return;
        }
        const token = getTokenById(uiRuntime.overlays.npcRoll.tokenId) || {};
        const tokenName = String(token.label || uiRuntime.overlays.npcRoll.tokenName || 'NPC').trim() || 'NPC';
        const isCustomRoll = String(uiRuntime.overlays.npcRoll.mode || '').trim().toLowerCase() === 'custom';
        const monster = isCustomRoll ? null : getMonsterStatBlockForToken(token);
        const isMonsterIdentity = !isCustomRoll && (String(token && token.sourceType || '').trim().toLowerCase() === 'monster' || !!(token && token.monster));
        if (isMonsterIdentity && !monster && !resources.monsters.loading && !resources.monsters.directory.length) {
            ensureMonsterDirectory().catch((err) => {
                console.warn('Failed loading monster rolls', err);
            });
        }
        const monsterPresets = buildMonsterRollPresets(token);
        const monsterRollQuery = String(uiRuntime.overlays.npcRoll.monsterRollQuery || '').trim();
        const visibleMonsterPresets = filterMonsterRollPresets(monsterPresets, monsterRollQuery);
        const editingPresetKey = String(uiRuntime.overlays.npcRoll.editingPresetKey || '').trim();
        const editingPreset = editingPresetKey
            ? monsterPresets.find((preset) => preset && preset.key === editingPresetKey)
            : null;
        const monsterSummary = monster
            ? [
                monster.size,
                monster.type,
                monster.challengeRating ? `CR ${monster.challengeRating}` : '',
                hasValue(monster.armorClass) ? `AC ${monster.armorClass}` : '',
                hasValue(monster.hitPoints) ? `HP ${monster.hitPoints}` : ''
            ].filter(Boolean).join(' · ')
            : '';
        dom.npcRollPopoverEl.hidden = false;
        dom.npcRollPopoverEl.innerHTML = `
            <div class="vtt-popover-head">
                <div>
                    <strong>${isCustomRoll ? 'Custom Roll (Any Dice)' : (monster ? 'Roll For Monster' : 'Roll For NPC')}</strong>
                    <span>${escapeHtml(isCustomRoll ? 'Any formula like 1d20 + 5, 2d6, or 2d20kh1' : (monsterSummary || tokenName))}</span>
                </div>
                <button class="vtt-inline-btn vtt-inline-btn-icon" type="button" data-action="close-npc-roll" aria-label="Close NPC roll">X</button>
            </div>
            ${isMonsterIdentity && !monsterPresets.length && (resources.monsters.loading || !resources.monsters.directory.length) ? '<div class="vtt-empty">Loading SRD monster rolls...</div>' : ''}
            ${monsterPresets.length ? `
                <div class="vtt-menu-title">Stat Block Rolls</div>
                <label class="vtt-field vtt-field-tight">
                    <span>Filter Rolls</span>
                    <input type="search" data-monster-roll-filter value="${escapeHtml(monsterRollQuery)}" placeholder="attack, save, damage, scimitar">
                </label>
                <div class="vtt-monster-roll-presets">
                    ${visibleMonsterPresets.length ? visibleMonsterPresets.map((preset) => `
                        <div class="vtt-monster-roll-preset-row${preset.key === editingPresetKey ? ' is-editing' : ''}">
                            <button class="vtt-chip-btn" type="button" data-action="set-npc-roll-preset" data-preset-key="${escapeHtml(preset.key)}" data-label="${escapeHtml(preset.label)}" data-formula="${escapeHtml(preset.formula)}" data-roll-type="${escapeHtml(preset.type || 'check')}" data-detail="${escapeHtml(preset.detail || '')}" title="${escapeHtml(`${preset.category}: ${preset.formula}`)}">${escapeHtml(preset.label)}${preset.hasOverride ? ' *' : ''}</button>
                            <button class="vtt-inline-btn vtt-inline-btn-icon" type="button" data-action="edit-monster-roll-preset" data-preset-key="${escapeHtml(preset.key)}" aria-label="Edit roll name">Edit</button>
                        </div>
                    `).join('') : '<div class="vtt-empty">No stat block rolls match that filter.</div>'}
                </div>
                ${editingPreset ? `
                    <div class="vtt-monster-roll-edit">
                        <div class="vtt-menu-title">Edit Roll</div>
                        <label class="vtt-field vtt-field-tight">
                            <span>Name</span>
                            <input type="text" data-monster-roll-edit-field="label" value="${escapeHtml(editingPreset.label)}" placeholder="${escapeHtml(editingPreset.baseLabel || editingPreset.label)}">
                        </label>
                        <label class="vtt-field vtt-field-tight">
                            <span>Formula</span>
                            <input type="text" data-monster-roll-edit-field="formula" value="${escapeHtml(editingPreset.formula)}" placeholder="${escapeHtml(editingPreset.baseFormula || editingPreset.formula)}">
                        </label>
                        <div class="vtt-chip-row">
                            <button class="vtt-chip-btn strong" type="button" data-action="save-monster-roll-override" data-preset-key="${escapeHtml(editingPreset.key)}">Save Override</button>
                            ${editingPreset.hasOverride ? `<button class="vtt-chip-btn" type="button" data-action="reset-monster-roll-override" data-preset-key="${escapeHtml(editingPreset.key)}">Reset</button>` : ''}
                            <button class="vtt-chip-btn" type="button" data-action="cancel-monster-roll-edit">Cancel</button>
                        </div>
                    </div>
                ` : ''}
            ` : ''}
            <div class="vtt-npc-roll-grid">
                <label class="vtt-field vtt-field-tight">
                    <span>Label</span>
                    <input type="text" data-npc-roll-field="label" value="${escapeHtml(uiRuntime.overlays.npcRoll.label || tokenName)}" ${monster ? 'readonly' : ''}>
                </label>
                <label class="vtt-field vtt-field-tight">
                    <span>Formula</span>
                    <input type="text" data-npc-roll-field="formula" value="${escapeHtml(uiRuntime.overlays.npcRoll.formula || '1d20')}" ${monster ? 'readonly' : ''}>
                </label>
            </div>
            ${monster ? '<div class="vtt-detail-note">Use Edit on a stat block roll to rename or change its formula for this token.</div>' : ''}
            <div class="vtt-chip-row">
                ${['1d20', '1d20 + 3', '2d20kh1', '2d20dl1', '1d4', '1d6', '1d8', '2d6', '1d10', '1d12'].map((formula) => `
                    <button class="vtt-chip-btn" type="button" data-action="set-npc-roll-formula" data-formula="${escapeHtml(formula)}">${escapeHtml(formula)}</button>
                `).join('')}
            </div>
            <div class="vtt-entry-actions">
                <button class="vtt-inline-btn strong" type="button" data-action="roll-npc-dice">Roll</button>
            </div>
            ${result ? `<div class="vtt-npc-roll-result"><strong>${escapeHtml(String(result.total))}</strong><span>${escapeHtml(result.text)}</span></div>` : ''}
        `;
        requestAnimationFrame(positionNPCRollPopover);
    };

    const openNPCRollPopover = (token, clientX, clientY) => {
        if (!token || !isDM()) return false;
        const isMonsterIdentity = String(token && token.sourceType || '').trim().toLowerCase() === 'monster' || !!(token && token.monster);
        if (isMonsterIdentity && !getMonsterStatBlockForToken(token) && !resources.monsters.loading && !resources.monsters.directory.length) {
            ensureMonsterDirectory().catch((err) => {
                console.warn('Failed loading monster roll directory', err);
            });
        }
        const monsterPresets = buildMonsterRollPresets(token);
        const defaultPreset = monsterPresets[0] || null;
        uiRuntime.overlays.npcRoll = {
            tokenId: token.id,
            tokenName: token.label || 'NPC',
            label: defaultPreset ? defaultPreset.label : (token.label || 'NPC'),
            formula: defaultPreset ? defaultPreset.formula : '1d20',
            type: defaultPreset ? (defaultPreset.type || 'check') : 'check',
            detail: defaultPreset ? (defaultPreset.detail || '') : '',
            presetKey: defaultPreset ? (defaultPreset.key || '') : '',
            editingPresetKey: '',
            monsterRollQuery: '',
            clientX: Math.round(toNumber(clientX, window.innerWidth / 2)),
            clientY: Math.round(toNumber(clientY, window.innerHeight / 2))
        };
        closeSheetActionPopover();
        renderNPCRollPopover();
        return true;
    };

    const openCustomRollPopover = (token = null, clientX, clientY) => {
        const tokenName = String(token && token.label || '').trim();
        uiRuntime.overlays.npcRoll = {
            mode: 'custom',
            tokenId: token && token.id ? token.id : '',
            tokenName: tokenName || 'VTT',
            label: tokenName ? `${tokenName} custom roll` : 'Custom roll',
            formula: '1d20',
            type: 'check',
            detail: '',
            presetKey: '',
            editingPresetKey: '',
            monsterRollQuery: '',
            clientX: Math.round(toNumber(clientX, window.innerWidth / 2)),
            clientY: Math.round(toNumber(clientY, window.innerHeight / 2))
        };
        closeSheetActionPopover();
        renderNPCRollPopover();
        return true;
    };

    const isNPCRollTarget = (token) => {
        if (!token) return false;
        if (getMonsterStatBlockForToken(token)) return true;
        if (String(token.sourceType || '').trim().toLowerCase() === 'monster') return true;
        if (String(token.sourceType || '').trim().toLowerCase() === 'npc') return true;
        const side = String(token.side || '').trim().toLowerCase();
        return side === 'enemy' || side === 'neutral';
    };

    const renderSceneList = () => {
        if (!dom.sceneListEl) return;
        const activeCaseId = getActiveCaseId();
        const isCurrentCaseSnapshot = !!(sessionState.snapshot && sessionState.stateCaseId === activeCaseId && !sessionState.pendingCaseId);
        const scenes = isCurrentCaseSnapshot && Array.isArray(sessionState.snapshot.scenes) ? sessionState.snapshot.scenes : [];
        const cases = getCaseSwitcherEntries();
        const activeCaseName = getActiveCaseName();
        const caseOptions = cases.length ? cases : [{ id: activeCaseId, name: activeCaseName }];
        const sharedSceneId = getSharedSceneId(sessionState.snapshot);
        const viewedSceneId = getViewedSceneId(sessionState.snapshot, sessionState.role);
        const sharedScene = getSceneById(sharedSceneId, sessionState.snapshot);
        const viewedScene = getSceneById(viewedSceneId, sessionState.snapshot) || scenes[0] || null;
        const isLocalView = isUsingLocalSceneView(sessionState.snapshot, sessionState.role);
        const routeNote = isLocalView
            ? `DM previewing ${viewedScene && viewedScene.name ? viewedScene.name : 'a scene'}. Players remain on ${sharedScene && sharedScene.name ? sharedScene.name : 'the shared scene'}.`
            : `Players are following ${sharedScene && sharedScene.name ? sharedScene.name : 'the shared scene'}. Use Show Everyone when the table should move.`;
        dom.sceneListEl.innerHTML = `
            <div class="vtt-scene-manager" data-active-case-id="${escapeHtml(activeCaseId)}">
                <div class="vtt-scene-select-grid vtt-case-select-grid">
                    <label class="vtt-field vtt-field-tight vtt-scene-select-field">
                        <span>Case</span>
                        <select data-case-picker="active"${caseOptions.length ? '' : ' disabled'}>
                            ${caseOptions.map((entry) => `
                                <option value="${escapeHtml(entry.id)}"${entry.id === activeCaseId ? ' selected' : ''}>${escapeHtml(entry.name || entry.id)}</option>
                            `).join('')}
                        </select>
                    </label>
                </div>
                ${scenes.length
                    ? `
                    <div class="vtt-scene-summary-card">
                        <div class="vtt-scene-summary-top">
                            <div class="vtt-scene-summary-copy">
                                <span class="vtt-scene-summary-eyebrow">${isLocalView ? 'DM Preview' : 'Shared Scene'}</span>
                                <strong class="vtt-scene-summary-title">${escapeHtml(viewedScene && viewedScene.name ? viewedScene.name : 'Scene')}</strong>
                                <span class="vtt-scene-summary-meta">${escapeHtml(describeScene(viewedScene))}</span>
                            </div>
                            <div class="vtt-scene-tag-row">
                                <span class="vtt-scene-tag">${isLocalView ? 'DM Only' : 'Shared'}</span>
                                <span class="vtt-scene-tag">${scenes.length} Scene${scenes.length === 1 ? '' : 's'}</span>
                            </div>
                        </div>
                        <div class="vtt-scene-summary-note">${escapeHtml(routeNote)}</div>
                        <div class="vtt-scene-action-row">
                            <button class="vtt-chip-btn" data-action="view-scene-local" data-id="${escapeHtml(viewedSceneId)}"${viewedScene && !isLocalView ? '' : ' disabled'}>${isLocalView ? 'Previewing' : 'DM Preview'}</button>
                            <button class="vtt-chip-btn strong" data-action="show-scene-everyone" data-id="${escapeHtml(viewedSceneId)}"${viewedScene ? '' : ' disabled'}>Show Everyone</button>
                        </div>
                    </div>
                    <details class="vtt-scene-manage-disclosure">
                        <summary>Manage scenes in this case</summary>
                        <div class="vtt-scene-manage-body">
                            <label class="vtt-field vtt-field-tight vtt-scene-select-field">
                                <span>DM Preview</span>
                                <select data-scene-picker="local">
                                    ${scenes.map((scene) => `
                                        <option value="${escapeHtml(scene.id)}"${scene.id === viewedSceneId ? ' selected' : ''}>${escapeHtml(scene.name || 'Scene')}</option>
                                    `).join('')}
                                </select>
                            </label>
                            <div class="vtt-scene-action-row">
                                <button class="vtt-chip-btn" data-action="create-scene">New</button>
                                <button class="vtt-chip-btn" data-action="clone-current-scene"${viewedScene ? '' : ' disabled'}>Clone</button>
                                <button class="vtt-chip-btn danger" data-action="delete-current-scene"${scenes.length <= 1 || !viewedScene ? ' disabled' : ''}>Delete</button>
                            </div>
                        </div>
                    </details>
                `
                    : '<div class="vtt-empty">No scenes in this case yet.</div>'}
            </div>
        `;
    };

    const getSceneMusicSummary = (scene) => {
        const music = normalizeSceneMusic(scene && scene.music);
        const tension = normalizeMusicTension(music.tension);
        const trackUrl = music.tracks[tension] || '';
        const videoId = getYouTubeVideoId(trackUrl).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32);
        const title = String(music.titles[tension] || '').trim() || 'Scene Track';
        return {
            music,
            tension,
            label: tension.charAt(0).toUpperCase() + tension.slice(1),
            title,
            trackUrl,
            videoId,
            embedUrl: getYouTubeEmbedUrl(trackUrl),
            autoplayEmbedUrl: getYouTubeEmbedUrl(trackUrl, { autoplay: true })
        };
    };

    const getYouTubeMusicFrame = () => (
        dom.youtubeAudioPlayerEl
            ? dom.youtubeAudioPlayerEl.querySelector('iframe[data-youtube-music-frame="1"]')
            : null
    );

    const sendYouTubeMusicCommand = (command, args = []) => {
        const frame = getYouTubeMusicFrame();
        if (!frame || !frame.contentWindow) return false;
        try {
            frame.contentWindow.postMessage(JSON.stringify({
                event: 'command',
                func: command,
                args: Array.isArray(args) ? args : []
            }), '*');
            return true;
        } catch (err) {
            return false;
        }
    };

    const setYouTubeMusicVolume = (volume) => {
        uiRuntime.music.volume = Math.max(0, Math.min(100, Math.round(Number(volume) || 0)));
        sendYouTubeMusicCommand('setVolume', [uiRuntime.music.volume]);
        const volumeEl = dom.youtubeAudioPlayerEl
            ? dom.youtubeAudioPlayerEl.querySelector('[data-youtube-volume]')
            : null;
        if (volumeEl instanceof HTMLInputElement && document.activeElement !== volumeEl) {
            volumeEl.value = String(uiRuntime.music.volume);
        }
    };

    const stopYouTubeMusicFrame = () => {
        sendYouTubeMusicCommand('stopVideo');
        if (!dom.youtubeAudioPlayerEl) return;
        dom.youtubeAudioPlayerEl.querySelectorAll('iframe[data-youtube-music-frame="1"]').forEach((frame) => {
            frame.src = 'about:blank';
            frame.remove();
        });
    };

    const renderYouTubeAudioControls = (status, playerKey) => `
        ${status === 'paused' ? `
            <button class="vtt-audio-play-btn" type="button"
                data-action="play-scene-music"
                data-music-key="${escapeHtml(playerKey)}">Play</button>
        ` : `
            <button class="vtt-audio-stop-btn" type="button" data-action="pause-scene-music">Pause</button>
        `}
        <button class="vtt-audio-stop-btn" type="button" data-action="stop-scene-music">Stop</button>
        <label class="vtt-audio-volume">
            <span>Vol</span>
            <input type="range" min="0" max="100" step="1"
                value="${escapeHtml(String(uiRuntime.music.volume))}"
                data-youtube-volume="1"
                aria-label="Scene music volume">
        </label>
    `;

    const renderYouTubeAudioPlayer = (scene) => {
        if (!dom.youtubeAudioPlayerEl) return;
        const summary = getSceneMusicSummary(scene);
        const playerKey = `${summary.tension}:${summary.videoId || 'empty'}`;
        const isCurrentTrack = !!summary.videoId && uiRuntime.music.commandState.key === playerKey;
        const status = isCurrentTrack ? uiRuntime.music.commandState.status : 'stopped';
        const isLoaded = status === 'playing' || status === 'paused';
        const renderKey = `${playerKey}:${status}:${summary.title}`;
        if (dom.youtubeAudioPlayerEl.dataset.musicKey === renderKey) return;
        const existingFrame = getYouTubeMusicFrame();
        const reusableFrame = isLoaded
            && existingFrame
            && existingFrame.dataset.musicKey === playerKey
            ? existingFrame
            : null;
        if (reusableFrame) {
            const shell = dom.youtubeAudioPlayerEl.querySelector('.vtt-audio-shell');
            const copyEl = shell ? shell.querySelector('.vtt-audio-copy') : null;
            const controlsEl = shell ? shell.querySelector('.vtt-audio-controls') : null;
            if (shell && copyEl && controlsEl) {
                shell.dataset.tension = summary.tension;
                copyEl.innerHTML = `
                    <span>${escapeHtml(summary.label)}</span>
                    <strong>${escapeHtml(summary.title)}</strong>
                    <small>${status === 'paused' ? 'Paused' : 'Playing'}</small>
                `;
                controlsEl.innerHTML = renderYouTubeAudioControls(status, playerKey);
                dom.youtubeAudioPlayerEl.dataset.musicKey = renderKey;
                setYouTubeMusicVolume(uiRuntime.music.volume);
                return;
            }
        }
        if (uiRuntime.music.commandState.key && uiRuntime.music.commandState.key !== playerKey) {
            stopYouTubeMusicFrame();
            uiRuntime.music.commandState = { key: '', status: 'stopped' };
        }
        dom.youtubeAudioPlayerEl.dataset.musicKey = renderKey;
        if (!summary.trackUrl || !summary.videoId) {
            stopYouTubeMusicFrame();
            dom.youtubeAudioPlayerEl.innerHTML = `
                <div class="vtt-audio-empty">
                    <span>${escapeHtml(summary.label)}</span>
                    <strong>No track assigned</strong>
                </div>
            `;
            return;
        }
        if (!isLoaded) {
            stopYouTubeMusicFrame();
            dom.youtubeAudioPlayerEl.innerHTML = `
                <div class="vtt-audio-shell" data-tension="${escapeHtml(summary.tension)}">
                    <div class="vtt-audio-copy">
                        <span>${escapeHtml(summary.label)}</span>
                        <strong>${escapeHtml(summary.title)}</strong>
                    </div>
                    <button class="vtt-audio-play-btn" type="button"
                        data-action="play-scene-music"
                        data-music-key="${escapeHtml(playerKey)}">Play</button>
                </div>
            `;
            return;
        }
        if (!reusableFrame) stopYouTubeMusicFrame();
        const iframeMarkup = reusableFrame ? '' : `
            <iframe
                data-youtube-music-frame="1"
                data-music-key="${escapeHtml(playerKey)}"
                tabindex="-1"
                title="${escapeHtml(summary.label)} scene music"
                src="${escapeHtml(summary.autoplayEmbedUrl)}"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                referrerpolicy="strict-origin-when-cross-origin"
                aria-hidden="true"></iframe>
        `;
        dom.youtubeAudioPlayerEl.innerHTML = `
            <div class="vtt-audio-shell" data-tension="${escapeHtml(summary.tension)}">
                <div class="vtt-audio-copy">
                    <span>${escapeHtml(summary.label)}</span>
                    <strong>${escapeHtml(summary.title)}</strong>
                    <small>${status === 'paused' ? 'Paused' : 'Playing'}</small>
                </div>
                <div class="vtt-audio-controls">
                    ${renderYouTubeAudioControls(status, playerKey)}
                </div>
                <div class="vtt-youtube-hidden-frame">
                    ${iframeMarkup}
                </div>
            </div>
        `;
        if (reusableFrame) {
            const frameHost = dom.youtubeAudioPlayerEl.querySelector('.vtt-youtube-hidden-frame');
            if (frameHost) frameHost.appendChild(reusableFrame);
        } else {
            window.setTimeout(() => setYouTubeMusicVolume(uiRuntime.music.volume), 250);
        }
    };

    const vttInspectorMarkupFactory = window.RTF_VTT_INSPECTOR_MARKUP;
    if (!vttInspectorMarkupFactory || typeof vttInspectorMarkupFactory.create !== 'function') {
        throw new Error('VTT inspector markup module failed to load.');
    }
    const vttInspectorMarkup = vttInspectorMarkupFactory.create({
        buildEvidenceNoteAreaLabel,
        buildMonsterAssignResultsMarkup,
        ensureMonsterDirectory,
        escapeHtml,
        getActiveScene,
        getDefaultEvidenceNoteTitle,
        getEvidenceNoteById,
        getEvidenceNoteCategoryLabel,
        getEvidenceNoteCellBounds,
        getEvidenceNoteCellPoint,
        getEvidenceNoteDisplayTitle,
        getEvidenceNoteShapeLabel,
        getMonsterDirectory,
        getMonsterStatBlockForToken,
        getProximitySkillLabel,
        getRosterPlayerForRecord,
        getSceneClocks,
        getSelectedEvidenceNoteId: () => stageState.selection.evidenceNoteId,
        getSelectedTokenId: () => stageState.selection.tokenId,
        getTokenById,
        getTokenStealthRoll,
        hasValue,
        normalizeEvidenceNoteCategory,
        normalizeEvidenceNoteShape,
        normalizeMoodEmoji,
        normalizeMoodLabel,
        normalizeMoveAccess,
        normalizeProximityTrigger,
        normalizeProximityTriggers,
        positionTokenInspectorPopover,
        serializeConditions,
        serializeHp,
        isDM,
        proximityTriggerSkillOptions: PROXIMITY_TRIGGER_SKILL_OPTIONS,
        monsterResources: resources.monsters,
        getInspectorState: () => uiRuntime.overlays.tokenInspector,
        dom: {
            selectionPillEl: dom.selectionPillEl,
            tokenInspectorEl: dom.tokenInspectorEl,
            tokenInspectorPopoverEl: dom.tokenInspectorPopoverEl
        },
        config: C
    });
    const {
        renderTokenInspector,
        renderTokenInspectorPopover
    } = vttInspectorMarkup;

    const renderClockList = () => {
        if (!dom.clockListEl) return;
        const scene = getCombatScene();
        const clocks = getVisibleSceneClocksForRole(scene, sessionState.role);
        const clockScopeEl = document.getElementById('vtt-clock-scope');
        if (clockScopeEl) clockScopeEl.textContent = scene && scene.name ? `Only in ${scene.name}` : 'Current scene only';
        if (!scene || !clocks.length) {
            dom.clockListEl.innerHTML = isDM()
                ? '<div class="vtt-empty">No clocks in this scene. Create one privately, finish its details, then publish it to players.</div>'
                : '<div class="vtt-empty">No scene clocks are visible.</div>';
            return;
        }

        dom.clockListEl.innerHTML = clocks.map((clock, clockIndex) => {
            const clockId = String(clock && clock.id || '');
            const max = normalizeClockMax(clock && clock.max, 4);
            const current = normalizeClockCurrent(clock && clock.current, max, 0);
            const title = normalizeClockTitle(clock && clock.title, 'Scene Clock');
            const color = normalizeHexColor(clock && clock.color, '#f0b357');
            const rgb = getHexColorRgbString(color, '#f0b357');
            const note = normalizeClockNote(clock && clock.note);
            const cadence = ['turn', 'round'].includes(String(clock && clock.cadence || '').trim().toLowerCase())
                ? String(clock.cadence).trim().toLowerCase()
                : 'manual';
            const hidden = !!(clock && clock.hidden);
            const selected = isDM() && String(uiRuntime.combat && uiRuntime.combat.clockEditorId || '').trim() === clockId;
            const descriptionId = note ? `vtt-clock-description-${clockIndex}` : '';
            return `
                <article class="vtt-clock${hidden ? ' is-hidden' : ''}${current >= max ? ' is-complete' : ''}${selected ? ' is-editing' : ''}"
                    data-clock-id="${escapeHtml(clockId)}"
                    ${note ? `tabindex="0" title="${escapeHtml(note)}" aria-describedby="${descriptionId}"` : ''}
                    style="--vtt-clock-color:${escapeHtml(color)};--vtt-clock-rgb:${escapeHtml(rgb)};">
                    <div class="vtt-clock-layout">
                        ${buildClockPieMarkup(clock)}
                        <div class="vtt-clock-main">
                            <div class="vtt-clock-title-row">
                                <strong class="vtt-clock-title">${escapeHtml(title)}</strong>
                                <div class="vtt-clock-badges">
                                    <span class="vtt-clock-cadence">${cadence === 'turn' ? 'Each turn' : (cadence === 'round' ? 'Each round' : 'Manual')}</span>
                                    ${isDM() ? `<span class="vtt-clock-visibility${hidden ? ' is-draft' : ''}">${hidden ? 'Private draft' : 'Published'}</span>` : ''}
                                </div>
                            </div>
                            ${note ? `<div class="vtt-clock-note" id="${descriptionId}">${escapeHtml(note)}</div>` : ''}
                        </div>
                    </div>
                    ${isDM() ? `
                        <div class="vtt-clock-controls" data-dm-only="1">
                            <button class="vtt-inline-btn vtt-inline-btn-icon" data-action="clock-step" data-id="${escapeHtml(clockId)}" data-delta="-1" aria-label="Reduce ${escapeHtml(title)}">-</button>
                            <button class="vtt-inline-btn vtt-inline-btn-icon" data-action="clock-step" data-id="${escapeHtml(clockId)}" data-delta="1" aria-label="Advance ${escapeHtml(title)}">+</button>
                            <button class="vtt-inline-btn" data-action="edit-clock" data-id="${escapeHtml(clockId)}" aria-expanded="${selected ? 'true' : 'false'}">${selected ? 'Done' : 'Edit'}</button>
                            <button class="vtt-inline-btn${hidden ? ' strong' : ''}" data-action="toggle-clock-hidden" data-id="${escapeHtml(clockId)}">${hidden ? 'Publish' : 'Unpublish'}</button>
                            <button class="vtt-inline-btn danger" data-action="delete-clock" data-id="${escapeHtml(clockId)}">Delete</button>
                        </div>
                        ${selected ? `<div class="vtt-clock-editor" data-clock-editor="${escapeHtml(clockId)}" data-dm-only="1">
                            <div class="vtt-subhead">Clock details</div>
                            <div class="vtt-clock-edit-grid">
                            <label class="vtt-field vtt-field-tight">
                                <span>Title</span>
                                <input class="vtt-inspector-input" type="text" data-clock-field="title" data-id="${escapeHtml(clockId)}" value="${escapeHtml(title)}">
                            </label>
                            <label class="vtt-field vtt-field-tight">
                                <span>Done</span>
                                <input class="vtt-inspector-input" type="number" min="0" max="${escapeHtml(String(max))}" data-clock-field="current" data-id="${escapeHtml(clockId)}" value="${escapeHtml(String(current))}">
                            </label>
                            <label class="vtt-field vtt-field-tight">
                                <span>Max</span>
                                <input class="vtt-inspector-input" type="number" min="1" max="20" data-clock-field="max" data-id="${escapeHtml(clockId)}" value="${escapeHtml(String(max))}">
                            </label>
                            <label class="vtt-field vtt-field-tight">
                                <span>Color</span>
                                <input class="vtt-inspector-input" type="color" data-clock-field="color" data-id="${escapeHtml(clockId)}" value="${escapeHtml(color)}">
                            </label>
                            <label class="vtt-field vtt-field-tight">
                                <span>Advance</span>
                                <select class="vtt-inspector-select" data-clock-field="cadence" data-id="${escapeHtml(clockId)}">
                                    <option value="manual"${cadence === 'manual' ? ' selected' : ''}>Manually</option>
                                    <option value="turn"${cadence === 'turn' ? ' selected' : ''}>Each turn</option>
                                    <option value="round"${cadence === 'round' ? ' selected' : ''}>Each round</option>
                                </select>
                            </label>
                            <label class="vtt-field vtt-field-tight vtt-clock-note-field">
                                <span>Description</span>
                                <input class="vtt-inspector-input" type="text" data-clock-field="note" data-id="${escapeHtml(clockId)}" value="${escapeHtml(note)}">
                            </label>
                            </div>
                            ${hidden ? '<div class="vtt-detail-note">Private draft — players cannot see this clock until you publish it.</div>' : '<div class="vtt-detail-note">Published — changes are visible to players in this scene.</div>'}
                        </div>` : ''}
                    ` : ''}
                </article>
            `;
        }).join('');
    };

    const renderInitiativeList = () => {
        if (!dom.initiativeListEl || !dom.roundPillEl) return;
        const initiative = sessionState.snapshot && sessionState.snapshot.initiative ? sessionState.snapshot.initiative : { entries: [], round: 1, activeEntryId: '' };
        const visibleEntries = getVisibleInitiativeEntriesForRole(sessionState.snapshot, sessionState.role);
        const roundNumber = initiative.round || 1;
        const isCombatDrawerOpen = getAllowedVTTPanel(uiRuntime.preferences.activeVttPanel) === 'combat';
        dom.roundPillEl.textContent = isCombatDrawerOpen ? `Round ${roundNumber}` : `R${roundNumber}`;
        dom.roundPillEl.setAttribute('aria-label', `Round ${roundNumber}`);
        const initiativeEntries = Array.isArray(initiative.entries) ? initiative.entries : [];
        const displayedActiveEntryId = initiative.encounterActive ? String(initiative.activeEntryId || '').trim() : '';
        const activeEntry = initiativeEntries.find((entry) => entry && entry.id === displayedActiveEntryId) || null;
        const visibleActiveEntry = visibleEntries.find((entry) => entry && entry.id === displayedActiveEntryId) || null;
        const activeEntryIsRedacted = !!(activeEntry && !visibleActiveEntry && !isDM());
        const nextVisibleProjection = getNextVisibleInitiativeProjection(
            initiativeEntries,
            displayedActiveEntryId,
            sessionState.snapshot,
            sessionState.role
        );
        const nextVisibleEntry = nextVisibleProjection ? nextVisibleProjection.entry : null;
        const nextLabelPrefix = nextVisibleProjection && nextVisibleProjection.skippedHidden ? 'Next visible' : 'Next';
        const currentTurnLabelEl = document.getElementById('vtt-current-turn-label');
        const nextTurnLabelEl = document.getElementById('vtt-next-turn-label');
        if (currentTurnLabelEl) {
            currentTurnLabelEl.textContent = !initiative.encounterActive
                ? (initiativeEntries.length ? 'Encounter ready' : 'No active turn')
                : visibleActiveEntry
                ? (visibleActiveEntry.name || 'Combatant')
                : (activeEntry ? 'Hidden combatant' : 'No active turn');
        }
        if (nextTurnLabelEl) {
            nextTurnLabelEl.textContent = !initiative.encounterActive
                ? (initiativeEntries.length ? 'Start when the table is ready' : 'Add combatants to begin')
                : nextVisibleEntry && nextVisibleEntry.id !== displayedActiveEntryId
                ? `${nextLabelPrefix} · ${nextVisibleEntry.name || 'Combatant'}`
                : (initiativeEntries.length ? 'No visible combatant next' : 'Add combatants to begin');
        }
        const encounterStatusEl = document.getElementById('vtt-encounter-status');
        if (encounterStatusEl) {
            const scenes = sessionState.snapshot && Array.isArray(sessionState.snapshot.scenes) ? sessionState.snapshot.scenes : [];
            const encounterScene = scenes.find((scene) => scene && scene.id === initiative.sceneId) || null;
            const viewedScene = getActiveScene();
            encounterStatusEl.textContent = initiative.encounterActive
                ? `Active · ${encounterScene && encounterScene.name ? encounterScene.name : 'Unknown scene'}`
                : `Not started${viewedScene && viewedScene.name ? ` · viewing ${viewedScene.name}` : ''}`;
        }
        document.querySelectorAll('[data-action="start-encounter"]').forEach((button) => {
            if (button instanceof HTMLButtonElement) button.disabled = !!initiative.encounterActive;
        });
        document.querySelectorAll('[data-action="end-encounter"]').forEach((button) => {
            if (button instanceof HTMLButtonElement) button.disabled = !initiative.encounterActive;
        });
        const activeCanonicalIndex = initiativeEntries.findIndex((entry) => entry && entry.id === displayedActiveEntryId);
        document.querySelectorAll('[data-action="prev-turn"]').forEach((button) => {
            if (button instanceof HTMLButtonElement) {
                button.disabled = !initiative.encounterActive || (roundNumber <= 1 && activeCanonicalIndex <= 0);
            }
        });
        document.querySelectorAll('[data-action="reset-initiative-round"]').forEach((button) => {
            if (button instanceof HTMLButtonElement) {
                button.disabled = !initiative.encounterActive || (roundNumber <= 1 && activeCanonicalIndex === 0);
            }
        });
        if (!Array.isArray(initiative.entries) || !initiative.entries.length) {
            dom.initiativeListEl.innerHTML = isDM()
                ? '<div class="vtt-empty">No combatants yet. Add a token from its inspector or roll initiative from a sheet.</div>'
                : '<div class="vtt-empty">Combat has not started.</div>';
            return;
        }
        if (!visibleEntries.length && !activeEntryIsRedacted) {
            dom.initiativeListEl.innerHTML = '<div class="vtt-empty">No visible combatants right now.</div>';
            return;
        }

        const visibleEntryIds = new Set(visibleEntries.map((entry) => String(entry && entry.id || '').trim()).filter(Boolean));
        const projectedEntries = isDM()
            ? initiativeEntries.map((entry) => ({ kind: 'entry', entry }))
            : initiativeEntries.reduce((projection, entry) => {
                const entryId = String(entry && entry.id || '').trim();
                if (entryId && entryId === displayedActiveEntryId && !visibleEntryIds.has(entryId)) {
                    projection.push({ kind: 'redacted-active' });
                } else if (visibleEntryIds.has(entryId)) {
                    projection.push({ kind: 'entry', entry });
                }
                return projection;
            }, []);
        const localContext = isPlayer() ? getLocalPlayerFocusContext() : null;
        dom.initiativeListEl.innerHTML = projectedEntries.map((projectedEntry) => {
            if (projectedEntry.kind === 'redacted-active') {
                return `
                    <div class="vtt-entry vtt-entry-redacted is-active-turn" role="status" aria-label="Hidden combatant. Current turn.">
                        <div class="vtt-entry-line">
                            <div class="vtt-entry-primary">
                                <div class="vtt-entry-name">Hidden combatant</div>
                                <div class="vtt-entry-meta vtt-entry-meta-inline">
                                    <span class="vtt-entry-tag strong">Now</span>
                                    <span class="vtt-entry-redacted-note">The DM is resolving this turn</span>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }
            const entry = projectedEntry.entry;
            const isHiddenToPlayers = isEntryHiddenForRole(entry, sessionState.snapshot, 'player');
            const isActive = entry.id === displayedActiveEntryId;
            const isNext = !isActive && !!(nextVisibleEntry && nextVisibleEntry.id === entry.id);
            const rosterPlayer = getRosterPlayerForRecord(entry);
            const isMine = !!(isPlayer() && localContext && localContext.playerId && rosterPlayer && String(rosterPlayer.id || '').trim() === localContext.playerId);
            const turnStatus = isActive ? ' Current turn.' : (isNext ? ' Next turn.' : '');
            const ownershipStatus = isMine ? ' Your combatant.' : '';
            const entryLabel = `${entry.name || 'Combatant'}, initiative ${entry.total ?? 0}.${turnStatus}${ownershipStatus} Select and center its linked token.`;
            return `
            <div class="vtt-entry${entry.id === stageState.selection.entryId ? ' is-selected' : ''}${isActive ? ' is-active-turn' : ''}${isHiddenToPlayers ? ' is-hidden' : ''}${isMine ? ' is-mine' : ''}" data-action="select-entry" data-id="${escapeHtml(entry.id)}" role="${isDM() ? 'group' : 'button'}" tabindex="0" aria-label="${escapeHtml(entryLabel)}">
                <div class="vtt-entry-line">
                    <div class="vtt-entry-primary">
                        <div class="vtt-entry-name">${escapeHtml(entry.name || 'Combatant')}</div>
                        <div class="vtt-entry-meta vtt-entry-meta-inline">
                            ${isActive ? '<span class="vtt-entry-tag strong">Now</span>' : ''}
                            ${isNext ? `<span class="vtt-entry-tag">${nextVisibleProjection && nextVisibleProjection.skippedHidden ? 'Next visible' : 'Next'}</span>` : ''}
                            ${isPlayer() && isMine ? '<span class="vtt-entry-tag">You</span>' : ''}
                            ${isDM() ? `<span class="vtt-entry-tag">Tie ${escapeHtml(String(entry.tie ?? 10))}</span>` : ''}
                            ${isHiddenToPlayers ? '<span class="vtt-entry-tag">Hidden</span>' : ''}
                            ${entry.reactionUsed ? '<span class="vtt-entry-tag">Reaction Used</span>' : ''}
                            ${entry.concentrating ? '<span class="vtt-entry-tag">Concentrating</span>' : ''}
                        </div>
                    </div>
                    <div class="vtt-entry-top-actions">
                        <div class="vtt-entry-score">${escapeHtml(String(entry.total ?? 0))}</div>
                        ${isDM() ? `
                            <button class="vtt-inline-btn vtt-inline-btn-icon" data-action="edit-entry" data-id="${escapeHtml(entry.id)}" aria-label="Edit initiative entry" title="Edit initiative entry">Edit</button>
                            <button class="vtt-inline-btn vtt-inline-btn-icon danger" data-action="remove-entry" data-id="${escapeHtml(entry.id)}" aria-label="Remove from initiative" title="Remove from initiative">X</button>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
        }).join('');
    };

    const renderPlayerFocusPanelMarkup = () => {
        const context = getLocalPlayerFocusContext();
        const linkedName = context.linkedPlayer && context.linkedPlayer.name
            ? context.linkedPlayer.name
            : (context.identity && context.identity.characterName ? context.identity.characterName : 'Unlinked');
        const statusText = context.linkedPlayer
            ? (context.token ? `${linkedName} ready${context.isTurn ? ' - your turn' : ''}` : `${linkedName} linked - no visible token`)
            : 'Choose a roster entry to enable sheet-aware actions';
        const tokenActionLabel = context.token ? 'Center My Token' : 'No token yet';
        const rollMode = normalizeRollMode(uiRuntime.playerRoll.mode);
        const rollSearchResults = getPlayerRollSearchResults();
        const isRollSearching = normalizeSearchText(uiRuntime.queries.playerRoll).length > 0;
        return `
            <div class="vtt-player-focus-status${context.isTurn ? ' is-turn' : ''}">
                <span class="vtt-player-focus-kicker">${escapeHtml(context.isTurn ? 'Your Turn' : 'Player Actions')}</span>
                <strong>${escapeHtml(statusText)}</strong>
            </div>
            <div class="vtt-player-focus-section">
                <span class="vtt-player-focus-minihead">Map</span>
            </div>
            <div class="vtt-player-focus-actions">
                <button class="vtt-chip-btn strong" type="button" data-action="focus-own-token"${context.token ? '' : ' disabled'}>${escapeHtml(tokenActionLabel)}</button>
                <button class="vtt-chip-btn" type="button" data-action="toggle-ruler-mode" aria-pressed="${stageState.tool.current.mode === C.TOOL_MODE_RULER ? 'true' : 'false'}">Measure</button>
                <button class="vtt-chip-btn" type="button" data-action="start-ask-roll-pick" aria-pressed="${stageState.tool.askRollPickMode ? 'true' : 'false'}">Ask To Roll</button>
            </div>
            <div class="vtt-player-focus-ping-picker" role="group" aria-label="Ping type">
                ${Object.values(C.PING_VARIANT_OPTIONS).filter((option) => option.pickable !== false).map((option) => `
                    <button class="vtt-ping-option is-${escapeHtml(option.variant)}" type="button"
                        data-action="set-ping-mode"
                        data-ping-variant="${escapeHtml(option.variant)}"
                        aria-pressed="${normalizePingVariant(stageState.tool.pingVariant) === option.variant && stageState.tool.current.mode === C.TOOL_MODE_PING ? 'true' : 'false'}">
                        <span class="vtt-ping-option-icon">${escapeHtml(option.icon)}</span>
                        <span>${escapeHtml(option.label)}</span>
                    </button>
                `).join('')}
            </div>
            ${stageState.tool.pendingAskRollRequest ? `<div class="vtt-player-focus-hint">Click the map to place an ask-to-roll marker for ${escapeHtml(stageState.tool.pendingAskRollRequest.label)}.</div>` : ''}
            ${uiRuntime.playerRoll.lastResult ? `
                <div class="vtt-player-focus-result${uiRuntime.playerRoll.lastResult.ok ? '' : ' is-muted'}">
                    <strong>${escapeHtml(String(uiRuntime.playerRoll.lastResult.total))}</strong>
                    <span>${escapeHtml(`${uiRuntime.playerRoll.lastResult.label || 'Roll'} - ${uiRuntime.playerRoll.lastResult.formula || ''}`)}</span>
                </div>
            ` : ''}
            <div class="vtt-player-focus-dice${stageState.tool.askRollPickMode ? ' is-ask-roll-picking' : ''}">
                <div class="vtt-player-focus-section is-dice-rolls">
                    <span class="vtt-player-focus-minihead">Dice Rolls</span>
                    ${stageState.tool.askRollPickMode ? '<button class="vtt-chip-btn" type="button" data-action="cancel-ask-roll-pick">Cancel</button>' : ''}
                </div>
                ${stageState.tool.askRollPickMode ? '<div class="vtt-player-focus-hint">Pick a roll here, then click the map to place the ask-to-roll marker.</div>' : ''}
                <div class="vtt-roll-mode-toggle" role="group" aria-label="Roll mode">
                    ${['adv', 'norm', 'dis'].map((mode) => `
                        <button class="vtt-chip-btn" type="button" data-action="set-roll-mode" data-roll-mode="${escapeHtml(mode)}" aria-pressed="${mode === rollMode ? 'true' : 'false'}">${escapeHtml(getRollModeLabel(mode))}</button>
                    `).join('')}
                </div>
                <label class="vtt-field vtt-field-tight vtt-player-roll-search">
                    <span>Search Rolls</span>
                    <input type="search" data-player-roll-search value="${escapeHtml(uiRuntime.queries.playerRoll)}" placeholder="attack, save, spell, skill">
                </label>
                <div class="vtt-player-focus-quick-rolls">
                    ${rollSearchResults.length ? rollSearchResults.map((item) => `
                        <button class="vtt-stage-context-item" type="button" data-action="quick-sheet-action" data-id="${escapeHtml(item.key)}">
                            <span class="vtt-action-search-kind">${escapeHtml(item.category)}</span>
                            <span class="vtt-action-search-label">${escapeHtml(item.label)}</span>
                            ${stageState.tool.askRollPickMode ? `<span class="vtt-action-search-summary">${escapeHtml(`Ask for ${item.label}`)}</span>` : ''}
                        </button>
                    `).join('') : `<div class="vtt-empty">${isRollSearching ? 'No matching sheet rolls.' : 'Open or link a Character Sheet to show quick rolls.'}</div>`}
                </div>
                <button class="vtt-stage-context-item" type="button" data-action="player-custom-roll">${escapeHtml(stageState.tool.askRollPickMode ? 'Ask For Custom Roll' : 'Any Dice')}</button>
                <button class="vtt-stage-context-item" type="button" data-action="player-roll-from-sheet">${escapeHtml(stageState.tool.askRollPickMode ? 'Ask From Sheet Rolls' : 'More Sheet Rolls')}</button>
            </div>
        `;
    };

    const getAskRollRequestLabelForItem = vttRolls.getAskRollRequestLabelForItem;
    const getRollRequestActionKey = (request = {}) => (
        vttRolls.getRollRequestActionKey(request, buildSheetActionCatalog())
    );
    const getAskRollRequestFromPing = vttRolls.getAskRollRequestFromPing;
    const isLocalAskRollOwner = (request = {}) => (
        isPlayer() && vttRolls.isAskRollOwner(request, getLocalPlayerFocusContext())
    );
    const canLocalRollAskRollRequest = (request = {}) => isLocalAskRollOwner(request);
    const canLocalCancelAskRollRequest = (request = {}) => isDM() || isLocalAskRollOwner(request);

    const queueRollRequest = (label, options = {}) => {
        if (!isPlayer() || !canUseSharedPlayerTools()) return false;
        const opts = options && typeof options === 'object' ? options : {};
        let rollLabel = String(label || '').trim();
        if (!rollLabel || ['custom', 'other'].includes(rollLabel.toLowerCase())) {
            rollLabel = String(window.prompt('What do you want to roll?', '') || '').trim();
        }
        rollLabel = rollLabel.replace(/\s+/g, ' ').slice(0, 48);
        if (!rollLabel) return false;
        if (isRollActionGuarded(`queue-roll:${opts.actionKey || rollLabel}`)) return false;
        const context = getLocalPlayerFocusContext();
        stageState.tool.pendingAskRollRequest = vttRolls.buildAskRollRequest(rollLabel, opts, context);
        stageState.tool.askRollPickMode = false;
        stageState.tool.pingVariant = 'question';
        setToolMode(C.TOOL_MODE_PING);
        closeSheetActionPopover();
        render();
        return true;
    };

    const renderPlayerRollMenu = () => {
        if (dom.body) dom.body.dataset.askRollPick = isPlayer() && stageState.tool.askRollPickMode ? '1' : '0';
        if (dom.playerRollMenuEl) {
            dom.playerRollMenuEl.hidden = !isPlayer() || !uiRuntime.playerRoll.menuOpen;
            const shouldRefocusSearch = isPlayer()
                && document.activeElement instanceof HTMLInputElement
                && document.activeElement.dataset.playerRollSearch !== undefined;
            if (isPlayer()) dom.playerRollMenuEl.innerHTML = renderPlayerFocusPanelMarkup();
            dom.playerRollMenuEl.querySelectorAll('[data-roll-mode]').forEach((button) => {
                if (!(button instanceof HTMLElement)) return;
                const mode = normalizeRollMode(button.dataset.rollMode);
                button.setAttribute('aria-pressed', mode === uiRuntime.playerRoll.mode ? 'true' : 'false');
            });
            if (shouldRefocusSearch) {
                requestAnimationFrame(() => {
                    const input = dom.playerRollMenuEl.querySelector('[data-player-roll-search]');
                    if (!(input instanceof HTMLInputElement)) return;
                    input.focus();
                    const end = input.value.length;
                    input.setSelectionRange(end, end);
                });
            }
        }
        if (dom.playerRollPanelEl) dom.playerRollPanelEl.hidden = !isPlayer();
    };

    const renderInitiativeDetail = () => {
        if (!dom.initiativeDetailPanelEl) return;
        const activePopoverId = uiRuntime.overlays.initiativeDetail && uiRuntime.overlays.initiativeDetail.entryId ? uiRuntime.overlays.initiativeDetail.entryId : '';
        const shouldFocusEditor = !!(uiRuntime.overlays.initiativeDetail && uiRuntime.overlays.initiativeDetail.focusRequested);
        const entry = getEntryById(activePopoverId);
        const assignedToken = getAssignedTokenForEntry(entry, sessionState.snapshot);
        const assignedTokenScene = assignedToken ? findSceneForTokenId(sessionState.snapshot, assignedToken.id) : null;
        const assignmentSummary = assignedToken
            ? buildTokenAssignmentLabel(assignedToken, assignedTokenScene, sessionState.snapshot)
            : (entry && entry.linkedTokenId ? `Missing token (${entry.linkedTokenId})` : 'Unlinked');
        const tokenAssignmentOptions = getInitiativeTokenAssignmentOptions(sessionState.snapshot);
        const rosterPlayer = getRosterPlayerForRecord(entry) || getRosterPlayerForRecord(findTokenByIdAcrossScenes(sessionState.snapshot, entry && entry.linkedTokenId));
        const isRosterManagedPlayer = !!rosterPlayer;
        const players = getPlayers();
        const rosterPlayerId = rosterPlayer ? String(rosterPlayer.id || '').trim() : '';
        if (!entry || !uiRuntime.overlays.initiativeDetail || !isDM()) {
            dom.initiativeDetailPanelEl.hidden = true;
            return;
        }
        dom.initiativeDetailPanelEl.innerHTML = `
            <div class="vtt-panel-head vtt-popover-head">
                <h2>Entry Details</h2>
                <div class="vtt-panel-head-actions">
                    <span class="vtt-panel-pill">${escapeHtml(entry.name || 'Combatant')}</span>
                    <button class="vtt-inline-btn vtt-inline-btn-icon" type="button" data-action="close-initiative-detail" aria-label="Close entry details">X</button>
                </div>
            </div>
            <div class="vtt-entry-detail-stack">
                <div class="vtt-entry-actions">
                    <button class="vtt-inline-btn" data-action="toggle-reaction" data-id="${escapeHtml(entry.id)}">${entry.reactionUsed ? 'Reset Reaction' : 'Use Reaction'}</button>
                    <button class="vtt-inline-btn" data-action="toggle-concentration" data-id="${escapeHtml(entry.id)}">${entry.concentrating ? 'Drop Concentration' : 'Concentrating'}</button>
                </div>
                <div class="vtt-entry-detail-grid">
                    <label class="vtt-field">
                        <span>Name</span>
                        <input class="vtt-entry-input" type="text" ${isRosterManagedPlayer ? 'readonly' : 'data-entry-field="name"'} value="${escapeHtml(entry.name || '')}">
                    </label>
                    <label class="vtt-field">
                        <span>Initiative</span>
                        <input class="vtt-entry-input" type="number" data-entry-field="total" value="${escapeHtml(String(entry.total ?? 0))}">
                    </label>
                    <label class="vtt-field">
                        <span>Tie</span>
                        <input class="vtt-entry-input" type="number" data-entry-field="tie" value="${escapeHtml(String(entry.tie ?? 10))}">
                    </label>
                    <label class="vtt-field">
                        <span>Passive Perception</span>
                        <input class="vtt-entry-input" type="number" data-entry-field="passivePerception" value="${entry.passivePerception ?? ''}">
                    </label>
                    <label class="vtt-field">
                        <span>Stealth Roll</span>
                        <input class="vtt-entry-input" type="number" data-entry-field="stealthRoll" value="${getEntryStealthRoll(entry) ?? ''}">
                    </label>
                    <label class="vtt-field">
                        <span>AC</span>
                        <input class="vtt-entry-input" type="number" data-entry-field="ac" value="${entry.ac ?? ''}">
                    </label>
                    <label class="vtt-field">
                        <span>Linked Token</span>
                        <input class="vtt-entry-input" type="text" value="${escapeHtml(assignmentSummary)}" readonly>
                    </label>
                    <label class="vtt-field">
                        <span>Assign To Token</span>
                        <select class="vtt-entry-input" data-entry-token-link="1">
                            <option value="">Choose token...</option>
                            ${tokenAssignmentOptions.map((option) => `
                                <option value="${escapeHtml(option.tokenId)}"${assignedToken && option.tokenId === assignedToken.id ? ' selected' : ''}>${escapeHtml(option.label)}</option>
                            `).join('')}
                        </select>
                    </label>
                    <label class="vtt-field">
                        <span>Roster Owner</span>
                        <select class="vtt-entry-input" data-entry-player-link="1">
                            <option value="">Not roster-managed</option>
                            ${players.map((player) => {
                                const playerId = String(player && player.id || '').trim();
                                if (!playerId) return '';
                                const label = String(player && player.name || playerId).trim() || playerId;
                                return `<option value="${escapeHtml(playerId)}"${playerId === rosterPlayerId ? ' selected' : ''}>${escapeHtml(label)}</option>`;
                            }).join('')}
                        </select>
                    </label>
                </div>
                <div class="vtt-entry-actions">
                    <button class="vtt-inline-btn" data-action="assign-entry-selected-token" data-id="${escapeHtml(entry.id)}"${stageState.selection.tokenId ? '' : ' disabled'}>${stageState.selection.tokenId ? 'Assign Selected Token' : 'Select A Token On The Map'}</button>
                    ${isRosterManagedPlayer ? `<button class="vtt-inline-btn" data-action="clear-entry-roster-owner" data-id="${escapeHtml(entry.id)}">Clear Roster Owner</button>` : ''}
                </div>
                <div>
                    <div class="vtt-subhead">Defences</div>
                    <div class="vtt-defence-grid">
                        ${C.DEFENCE_KEYS.map((key) => `
                            <label class="vtt-field">
                                <span>${key.toUpperCase()}</span>
                                <input class="vtt-entry-input" type="number" data-entry-defence="${key}" value="${entry.defences && entry.defences[key] !== null ? entry.defences[key] : ''}">
                            </label>
                        `).join('')}
                    </div>
                </div>
                ${isRosterManagedPlayer ? '<div class="vtt-detail-note">Player initiative names and portraits stay synced to the Hub roster.</div>' : ''}
                <div class="vtt-detail-note">Assigning a player or NPC token also stores its roster identity, so matching spawns in other scenes can resolve this entry automatically.</div>
                <div class="vtt-entry-actions">
                    <button class="vtt-inline-btn" data-action="move-entry-up" data-id="${escapeHtml(entry.id)}">Move Up</button>
                    <button class="vtt-inline-btn" data-action="move-entry-down" data-id="${escapeHtml(entry.id)}">Move Down</button>
                    <button class="vtt-inline-btn danger" data-action="remove-entry" data-id="${escapeHtml(entry.id)}">Remove</button>
                </div>
            </div>
        `;
        dom.initiativeDetailPanelEl.hidden = false;
        positionInitiativeDetail();
        if (shouldFocusEditor && uiRuntime.overlays.initiativeDetail) {
            uiRuntime.overlays.initiativeDetail.focusRequested = false;
            window.requestAnimationFrame(() => {
                if (!dom.initiativeDetailPanelEl || dom.initiativeDetailPanelEl.hidden) return;
                if (typeof dom.initiativeDetailPanelEl.scrollIntoView === 'function') {
                    dom.initiativeDetailPanelEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                }
                const focusTarget = dom.initiativeDetailPanelEl.querySelector('[data-entry-field="name"]')
                    || dom.initiativeDetailPanelEl.querySelector('[data-entry-field="total"]')
                    || dom.initiativeDetailPanelEl.querySelector('[data-action="close-initiative-detail"]');
                if (focusTarget && typeof focusTarget.focus === 'function') focusTarget.focus({ preventScroll: true });
            });
        }
    };

    const vttMarkupFactory = window.RTF_VTT_MARKUP;
    if (!vttMarkupFactory || typeof vttMarkupFactory.create !== 'function') {
        throw new Error('VTT markup module failed to load.');
    }
    const vttMarkup = vttMarkupFactory.create({
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
            pingVariantOptions: C.PING_VARIANT_OPTIONS
    });
    const buildClockPieMarkup = (clock) => vttMarkup.buildClockPieMarkup(clock);
    const vttStageViewFactory = window.RTF_VTT_STAGE_VIEW;
    if (!vttStageViewFactory || typeof vttStageViewFactory.create !== 'function') {
        throw new Error('VTT stage view module failed to load.');
    }
    resources.stageView = vttStageViewFactory.create({
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
        getFitViewOnNextMapLoad: () => stageState.view.fitOnNextMapLoad,
        getLocalPlayerFocusContext,
        getLocalRole: () => sessionState.role,
        getRenderableScenePings,
        getRenderableSceneTemplates,
        getSceneCellPx,
        getSceneMapScale,
        getStageState: () => ({
            initialVTTLoadPending: sessionState.initialLoadPending,
            vttState: sessionState.snapshot,
            localRole: sessionState.role,
            isDM: isDM(),
            selectedTokenId: stageState.selection.tokenId,
            selectedEntryId: stageState.selection.entryId,
            selectedEvidenceNoteId: stageState.selection.evidenceNoteId,
            previewTokenId: stageState.preview.tokenId,
            dragState: stageState.pointer.drag,
            activeProximityPrompt: getActiveProximityPrompt(),
            visionConeRotateState: stageState.placement.visionConeRotate,
            templatePlacementState: stageState.placement.template,
            rulerState: stageState.placement.ruler,
            fogPlacementState: stageState.placement.fog,
            evidenceNotePlacementState: stageState.placement.evidenceNote,
            annotationPlacementState: stageState.placement.annotation
        }),
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
        positionProximityPrompt: (...args) => vttProximityController.positionProximityPrompt(...args),
        positiveModulo,
        pruneExpiredSharedTemplates,
        renderProximityPrompt,
        setFitViewOnNextMapLoad: (value) => {
            stageState.view.fitOnNextMapLoad = !!value;
        },
        toNumber,
        localView: stageState.view.local,
        worldSize: stageState.view.world,
        remoteTokenTweens: resources.remoteTokenTweens,
        dom: {
            stageEl: dom.stageEl,
            stageEmptyEl: dom.stageEmptyEl,
            mapWorldEl: dom.mapWorldEl,
            worldEl: dom.worldEl,
            stageGridEl: dom.stageGridEl,
            mapImageEl: dom.mapImageEl,
            gridLayerEl: dom.gridLayerEl,
            fogLayerEl: dom.fogLayerEl,
            annotationLayerEl: dom.annotationLayerEl,
            noteLayerEl: dom.noteLayerEl,
            templateLayerEl: dom.templateLayerEl,
            tokenLayerEl: dom.tokenLayerEl,
            visionLayerEl: dom.visionLayerEl,
            proximityPromptStackEl: dom.proximityPromptStackEl,
            zoomResetEls: dom.zoomResetEls
        },
        geometry: vttGeometry,
        markup: vttMarkup,
        config: {
            defaultWorldSize: C.DEFAULT_WORLD_SIZE,
            defaultCellPx: C.DEFAULT_VTT_CELL_PX,
            tokenCoordPrecision: C.TOKEN_COORD_PRECISION,
            remoteTokenTweenMs: C.REMOTE_TOKEN_TWEEN_MS,
            localDragTweenSuppressMs: C.LOCAL_DRAG_TWEEN_SUPPRESS_MS,
            tokenHpFlashMs: C.TOKEN_HP_FLASH_MS,
            fogRevealShimmerMs: C.FOG_REVEAL_SHIMMER_MS,
            stealthStatusDetected: C.STEALTH_STATUS_DETECTED,
            stealthStatusUnseen: C.STEALTH_STATUS_UNSEEN
        }
    });
    const renderTableDocks = () => {
        const activePanel = getAllowedVTTPanel(uiRuntime.preferences.activeVttPanel);
        const isRulerActive = stageState.tool.current.mode === C.TOOL_MODE_RULER;
        const playerContext = isPlayer() ? getLocalPlayerFocusContext() : null;
        const playerCanDraw = !!(
            playerContext
            && String(playerContext.playerId || '').trim()
            && canBroadcastFromViewedScene()
        );
        const playerCanUndoDraw = !!(
            playerCanDraw
            && getActiveScene()
            && Array.isArray(getActiveScene().annotations)
            && getActiveScene().annotations.some((annotation) => (
                String(annotation && annotation.authorKind || '').trim() === 'player'
                && String(annotation && annotation.authorPlayerId || '').trim() === String(playerContext.playerId || '').trim()
            ))
        );
        if (dom.playerMeasureButtonEl) dom.playerMeasureButtonEl.setAttribute('aria-pressed', isRulerActive ? 'true' : 'false');
        if (dom.playerPingButtonEl) {
            dom.playerPingButtonEl.disabled = isSpectator();
            dom.playerPingButtonEl.setAttribute('aria-pressed', stageState.tool.current.mode === C.TOOL_MODE_PING ? 'true' : 'false');
        }
        if (dom.playerDrawButtonEl) {
            dom.playerDrawButtonEl.disabled = !playerCanDraw;
            dom.playerDrawButtonEl.setAttribute('aria-pressed', stageState.tool.current.mode === TOOL_MODE_DRAW ? 'true' : 'false');
            dom.playerDrawButtonEl.title = playerCanDraw
                ? 'Draw a shared mark on the map'
                : 'Link your roster entry before drawing shared marks.';
        }
        if (dom.playerUndoAnnotationButtonEl) {
            dom.playerUndoAnnotationButtonEl.disabled = !playerCanUndoDraw;
            dom.playerUndoAnnotationButtonEl.title = playerCanUndoDraw
                ? 'Remove your most recent shared mark'
                : (playerCanDraw
                    ? 'You have no shared marks to undo.'
                    : 'Link your roster entry before changing shared marks.');
        }
        if (dom.playerRollsButtonEl) dom.playerRollsButtonEl.setAttribute('aria-expanded', activePanel === 'player-rolls' ? 'true' : 'false');
        if (isPlayer() && dom.playerDockStatusEl) {
            const context = playerContext || getLocalPlayerFocusContext();
            const name = context.linkedPlayer && context.linkedPlayer.name
                ? context.linkedPlayer.name
                : (context.identity && context.identity.characterName ? context.identity.characterName : 'Unlinked');
            const heading = !context.linkedPlayer
                ? 'Character not linked'
                : (context.isTurn ? 'Your Turn' : name);
            const detail = !context.linkedPlayer
                ? 'Choose your roster entry to continue'
                : (context.token ? 'Ready at the table' : 'Waiting for a visible token');
            dom.playerDockStatusEl.innerHTML = `<strong>${escapeHtml(heading)}</strong><span>${escapeHtml(detail)}</span>`;
            if (dom.playerFindTokenEl) dom.playerFindTokenEl.disabled = !context.token;
        }
        if (dom.toolsMenuToggleEl) {
            dom.toolsMenuToggleEl.setAttribute('aria-expanded', uiRuntime.menus.toolsOpen ? 'true' : 'false');
            dom.toolsMenuToggleEl.setAttribute('aria-pressed', uiRuntime.menus.toolsOpen ? 'true' : 'false');
        }
    };

    const renderSceneControls = () => {
        const scene = getActiveScene();
        if (!scene) return;
        const sharedScene = getSceneById(getSharedSceneId(sessionState.snapshot), sessionState.snapshot) || scene;
        const isLocalScenePreview = isUsingLocalSceneView(sessionState.snapshot, sessionState.role);
        let toolMeta = isDM()
            ? 'Drag empty space to pan. Scroll or pinch to zoom. Drag tokens freely. Right-click empty space for quick spawn and NPC search.'
            : (isSpectator()
                ? 'Spectator mode: drag empty space to pan, scroll or pinch to zoom, and click visible pins or zones to read them.'
                : 'Drag empty space to pan and scroll or pinch to zoom. Drag only tokens you control. Click pins or zones to read them.');
        if (stageState.tool.current.mode === C.TOOL_MODE_PING) {
            toolMeta = stageState.tool.pendingAskRollRequest
                ? `Ask-to-roll active: click the map where you want to place ${stageState.tool.pendingAskRollRequest.label}.`
                : (isLocalScenePreview ? 'Ping is unavailable while previewing a local scene.' : `${getPingVariantOptions().label} ping active: click the map to signal players.`);
        } else if (stageState.tool.current.mode === C.TOOL_MODE_RULER) toolMeta = 'Ruler active: click and hold on the stage to measure squares and feet.';
        else if (stageState.tool.current.mode === C.TOOL_MODE_CIRCLE) toolMeta = `Circle tool active: click and hold to preview a ${stageState.tool.current.sizeCells}-square radius circle.`;
        else if (stageState.tool.current.mode === C.TOOL_MODE_CONE) toolMeta = `Cone tool active: click and hold to preview a ${stageState.tool.current.sizeCells}-square cone.`;
        else if (stageState.tool.current.mode === C.TOOL_MODE_NOTE) toolMeta = 'Pin / Zone tool active: click to place a point pin, or drag a rectangle to tag a zone.';
        else if (stageState.tool.current.mode === TOOL_MODE_DRAW) toolMeta = isDM()
            ? 'Draw tool active: drag on the map to leave a shared annotation. Use Undo my mark or Clear marks from the Draw menu.'
            : 'Mark tool active: drag on the map to leave a shared annotation. Undo mark removes your latest mark.';
        else if (stageState.tool.current.mode === C.TOOL_MODE_FOG) toolMeta = 'Fog tool active: tap or drag on the map to add hidden rectangles.';
        else if (stageState.tool.current.mode === C.TOOL_MODE_FOG_REMOVE) toolMeta = 'Unfog tool active: tap or drag on the map to remove fog rectangles.';
        const stealthMeta = scene.stealthMode ? 'Stealth mode is on: enemy and neutral sight cones are visible.' : 'Stealth mode is off.';
        let dockToolStatus = isSpectator() ? 'View' : 'Select';
        if (stageState.tool.current.mode === C.TOOL_MODE_PING) dockToolStatus = stageState.tool.pendingAskRollRequest ? 'Ask roll' : 'Ping';
        else if (stageState.tool.current.mode === C.TOOL_MODE_RULER) dockToolStatus = 'Measure';
        else if (stageState.tool.current.mode === C.TOOL_MODE_CIRCLE) dockToolStatus = `Circle ${stageState.tool.current.sizeCells}`;
        else if (stageState.tool.current.mode === C.TOOL_MODE_CONE) dockToolStatus = `Cone ${stageState.tool.current.sizeCells}`;
        else if (stageState.tool.current.mode === C.TOOL_MODE_NOTE) dockToolStatus = 'Pins';
        else if (stageState.tool.current.mode === TOOL_MODE_DRAW) dockToolStatus = isDM() ? 'Draw' : 'Mark';
        else if (stageState.tool.current.mode === C.TOOL_MODE_FOG) dockToolStatus = 'Fog';
        else if (stageState.tool.current.mode === C.TOOL_MODE_FOG_REMOVE) dockToolStatus = 'Unfog';
        applyUIPreferences();
        renderToolsMenu();
        renderModeChip();
        renderSceneList();
        if (dom.caseNameEl) dom.caseNameEl.textContent = getActiveCaseName();
        syncVTTCaseBoardEmbed();
        if (dom.roleToggleEl) dom.roleToggleEl.textContent = isDM() ? 'Leave DM' : 'DM Mode';
        if (dom.spectatorToggleEl) {
            dom.spectatorToggleEl.textContent = isSpectator() ? 'Leave Spectator' : 'Spectator';
            dom.spectatorToggleEl.setAttribute('aria-pressed', isSpectator() ? 'true' : 'false');
        }
        if (dom.activeSceneLabelEl) dom.activeSceneLabelEl.textContent = `Scene: ${sharedScene.name || 'Scene'}`;
        if (dom.scenePanelSceneLabelEl) dom.scenePanelSceneLabelEl.textContent = scene.name || 'Scene';
        if (dom.stageTitleEl) dom.stageTitleEl.textContent = isLocalScenePreview
            ? `Preview: ${scene.name || 'Scene'}`
            : (scene.name || 'Scene');
        if (dom.stageMetaEl) {
            const metaParts = [dockToolStatus, `${Math.round(stageState.view.local.zoom * 100)}%`];
            if (isLocalScenePreview) metaParts.unshift(`Players see ${sharedScene.name || 'Scene'}`);
            if (scene.stealthMode) metaParts.push('Sight cones');
            dom.stageMetaEl.textContent = metaParts.join(' / ');
        }
        if (dom.stageEl) {
            if (stageState.tool.current.mode === C.TOOL_MODE_NAVIGATE) {
                dom.stageEl.removeAttribute('title');
            } else {
                dom.stageEl.title = `${toolMeta} ${stealthMeta}`;
            }
        }
        renderTableDocks();
        renderYouTubeAudioPlayer(sharedScene);
        const sceneNameEl = document.getElementById('scene-name');
        const mapUrlEl = document.getElementById('scene-map-url');
        const musicTensionEl = document.getElementById('scene-music-tension');
        const musicPassiveEl = document.getElementById('scene-music-passive');
        const musicPassiveTitleEl = document.getElementById('scene-music-passive-title');
        const musicTenseEl = document.getElementById('scene-music-tense');
        const musicTenseTitleEl = document.getElementById('scene-music-tense-title');
        const musicActiveEl = document.getElementById('scene-music-active');
        const musicActiveTitleEl = document.getElementById('scene-music-active-title');
        const scaleEl = document.getElementById('scene-map-scale');
        const distanceEl = document.getElementById('scene-grid-distance');
        const offsetXEl = document.getElementById('scene-grid-offset-x');
        const offsetYEl = document.getElementById('scene-grid-offset-y');
        const music = normalizeSceneMusic(scene.music);
        if (sceneNameEl && document.activeElement !== sceneNameEl) sceneNameEl.value = scene.name || '';
        if (mapUrlEl && document.activeElement !== mapUrlEl) mapUrlEl.value = scene.mapImageUrl || '';
        if (musicTensionEl && document.activeElement !== musicTensionEl) musicTensionEl.value = music.tension;
        if (musicPassiveEl && document.activeElement !== musicPassiveEl) musicPassiveEl.value = music.tracks.passive || '';
        if (musicPassiveTitleEl && document.activeElement !== musicPassiveTitleEl) musicPassiveTitleEl.value = music.titles.passive || '';
        if (musicTenseEl && document.activeElement !== musicTenseEl) musicTenseEl.value = music.tracks.tense || '';
        if (musicTenseTitleEl && document.activeElement !== musicTenseTitleEl) musicTenseTitleEl.value = music.titles.tense || '';
        if (musicActiveEl && document.activeElement !== musicActiveEl) musicActiveEl.value = music.tracks.active || '';
        if (musicActiveTitleEl && document.activeElement !== musicActiveTitleEl) musicActiveTitleEl.value = music.titles.active || '';
        if (scaleEl && document.activeElement !== scaleEl) scaleEl.value = String(Math.round(getSceneMapScale(scene) * 100));
        if (distanceEl && document.activeElement !== distanceEl) distanceEl.value = String(scene.grid.cellDistance || 5);
        if (offsetXEl && document.activeElement !== offsetXEl) offsetXEl.value = String(scene.grid.offsetX || 0);
        if (offsetYEl && document.activeElement !== offsetYEl) offsetYEl.value = String(scene.grid.offsetY || 0);
    };

    const render = () => {
        if (sessionState.initialLoadPending) return;
        normalizeSelections();
        renderSceneControls();
        renderViewMenu();
        renderToolsMenu();
        renderSpawnLists();
        renderNPCSearchPopover();
        renderStage();
        renderQuickSpawnMenu();
        renderStageContextMenu();
        renderTokenInspector();
        renderTokenInspectorPopover();
        renderSheetActionPopover();
        renderNPCRollPopover();
        renderClockList();
        renderInitiativeList();
        renderPlayerRollMenu();
        renderInitiativeDetail();
        renderSpawnGhost();
        evaluateProximityTriggers();
        renderProximityPrompt();
        renderRosterSelfModal();
    };

    const updateSelectedEvidenceNote = (mutator) => {
        if (!stageState.selection.evidenceNoteId) return;
        withDraft((draft) => {
            const scene = getActiveScene(draft);
            if (!scene || !Array.isArray(scene.evidenceNotes)) return;
            const idx = scene.evidenceNotes.findIndex((note) => String(note && note.id || '').trim() === stageState.selection.evidenceNoteId);
            if (idx < 0) return;
            mutator(scene.evidenceNotes[idx], draft, scene);
        });
    };

    const updateSelectedToken = (mutator) => {
        if (!stageState.selection.tokenId) return;
        withDraft((draft) => {
            const scene = getActiveScene(draft);
            if (!scene || !Array.isArray(scene.tokens)) return;
            const idx = scene.tokens.findIndex((token) => token.id === stageState.selection.tokenId);
            if (idx < 0) return;
            mutator(scene.tokens[idx], draft);
            const rosterPlayer = getRosterPlayerForRecord(scene.tokens[idx]);
            if (rosterPlayer) syncTokenRosterIdentity(scene.tokens[idx], rosterPlayer);
            draft.initiative.entries = draft.initiative.entries.map((entry) => {
                const matchesLinkedToken = entry.linkedTokenId === stageState.selection.tokenId;
                const matchesSourceIdentity = !!(
                    scene.tokens[idx].sourceType
                    && scene.tokens[idx].sourceId
                    && entry.sourceType === scene.tokens[idx].sourceType
                    && entry.sourceId === scene.tokens[idx].sourceId
                );
                if (matchesLinkedToken || matchesSourceIdentity) return syncInitiativeEntryFromToken(entry, scene.tokens[idx]);
                return entry;
            });
        });
    };

    const findProximityTriggerOwner = (draft, ownerKind, ownerId) => {
        const scene = getActiveScene(draft);
        const targetId = String(ownerId || '').trim();
        if (!scene || !targetId) return null;
        if (ownerKind === 'token') {
            const tokens = Array.isArray(scene.tokens) ? scene.tokens : [];
            return tokens.find((token) => String(token && token.id || '').trim() === targetId) || null;
        }
        if (ownerKind === 'note') {
            const notes = Array.isArray(scene.evidenceNotes) ? scene.evidenceNotes : [];
            return notes.find((note) => String(note && note.id || '').trim() === targetId) || null;
        }
        return null;
    };

    const updateProximityTriggerOwner = (ownerKind, ownerId, mutator) => {
        if (!isDM() || typeof mutator !== 'function') return false;
        return withDraft((draft) => {
            const owner = findProximityTriggerOwner(draft, ownerKind, ownerId);
            if (!owner) return;
            owner.triggers = normalizeProximityTriggers(owner.triggers);
            mutator(owner);
            owner.triggers = normalizeProximityTriggers(owner.triggers);
        });
    };

    const addProximityTrigger = (ownerKind, ownerId, seed = 'perception') => updateProximityTriggerOwner(ownerKind, ownerId, (owner) => {
        owner.triggers = normalizeProximityTriggers(owner.triggers);
        if (owner.triggers.length >= 12) return;
        owner.triggers.push(buildSeededProximityTrigger(seed));
    });

    const deleteProximityTrigger = (ownerKind, ownerId, triggerId) => updateProximityTriggerOwner(ownerKind, ownerId, (owner) => {
        if (!canDeleteLiveVTTState('delete-proximity-trigger')) return;
        const targetId = String(triggerId || '').trim();
        owner.triggers = normalizeProximityTriggers(owner.triggers).filter((trigger) => trigger.id !== targetId);
    });

    const updateProximityTrigger = (ownerKind, ownerId, triggerId, mutator) => updateProximityTriggerOwner(ownerKind, ownerId, (owner) => {
        const targetId = String(triggerId || '').trim();
        owner.triggers = normalizeProximityTriggers(owner.triggers);
        const trigger = owner.triggers.find((entry) => entry.id === targetId);
        if (!trigger || typeof mutator !== 'function') return;
        mutator(trigger);
    });

    const handleProximityTriggerFieldChange = (target) => {
        if (!(target instanceof HTMLElement) || target.dataset.proximityTriggerField === undefined) return false;
        if (!isDM()) return true;
        const field = String(target.dataset.proximityTriggerField || '').trim();
        const ownerKind = String(target.dataset.ownerKind || '').trim();
        const ownerId = String(target.dataset.ownerId || '').trim();
        const triggerId = String(target.dataset.triggerId || '').trim();
        if (!field || !ownerKind || !ownerId || !triggerId) return true;
        updateProximityTrigger(ownerKind, ownerId, triggerId, (trigger) => {
            if (field === 'enabled' && target instanceof HTMLInputElement && target.type === 'checkbox') {
                trigger.enabled = target.checked;
                return;
            }
            if (field === 'dcVisible' && target instanceof HTMLInputElement && target.type === 'checkbox') {
                trigger.dcVisible = target.checked;
                return;
            }
            if (field === 'revealOnSuccess' && target instanceof HTMLInputElement && target.type === 'checkbox') {
                trigger.revealOnSuccess = target.checked;
                return;
            }
            if (field === 'kind' && target instanceof HTMLSelectElement) {
                trigger.kind = PROXIMITY_TRIGGER_KIND_OPTIONS.includes(target.value) ? target.value : 'skillRoll';
                return;
            }
            if (field === 'trigger' && target instanceof HTMLSelectElement) {
                trigger.trigger = PROXIMITY_TRIGGER_TYPE_OPTIONS.includes(target.value) ? target.value : 'enter';
                return;
            }
            if (field === 'skill' && target instanceof HTMLSelectElement) {
                trigger.skill = normalizeProximityTriggerSkill(target.value);
                return;
            }
            if (field === 'target' && target instanceof HTMLSelectElement) {
                trigger.target = PROXIMITY_TRIGGER_TARGET_OPTIONS.includes(target.value) ? target.value : 'playerTokens';
                return;
            }
            if (field === 'repeat' && target instanceof HTMLSelectElement) {
                trigger.repeat = PROXIMITY_TRIGGER_REPEAT_OPTIONS.includes(target.value) ? target.value : 'oncePerToken';
                return;
            }
            if (field === 'clockId' && target instanceof HTMLSelectElement) {
                trigger.clockId = String(target.value || '').trim().slice(0, 120);
                return;
            }
            if (field === 'radiusCells') {
                trigger.radiusCells = clamp(Math.round(toNumber(target.value, trigger.radiusCells || 0)), 0, 24);
                return;
            }
            if (field === 'dc') {
                const raw = String(target.value || '').trim();
                trigger.dc = raw === '' ? null : clamp(Math.round(toNumber(raw, trigger.dc || 10)), 1, 40);
                return;
            }
            if (field === 'clockSuccessDelta') {
                trigger.clockSuccessDelta = clamp(Math.round(toNumber(target.value, trigger.clockSuccessDelta || 0)), -20, 20);
                return;
            }
            if (field === 'clockFailDelta') {
                trigger.clockFailDelta = clamp(Math.round(toNumber(target.value, trigger.clockFailDelta || 0)), -20, 20);
                return;
            }
            if (field === 'title') {
                trigger.title = String(target.value || '').trim().slice(0, 160) || 'Something catches your attention';
                return;
            }
            if (field === 'body') {
                trigger.body = String(target.value || '').trim().slice(0, 800);
                return;
            }
            if (field === 'successText') {
                trigger.successText = String(target.value || '').trim().slice(0, 600);
                return;
            }
            if (field === 'failText') {
                trigger.failText = String(target.value || '').trim().slice(0, 600);
            }
        });
        return true;
    };

    const updateSelectedEntry = (mutator, options = {}) => {
        if (!canEditInitiative()) return;
        if (!stageState.selection.entryId) return;
        withDraft((draft) => {
            const entries = draft && draft.initiative && Array.isArray(draft.initiative.entries) ? draft.initiative.entries : [];
            const idx = entries.findIndex((entry) => entry.id === stageState.selection.entryId);
            if (idx < 0) return;
            mutator(entries[idx], draft);
            const linkedToken = findTokenByIdAcrossScenes(draft, entries[idx].linkedTokenId)
                || (
                    entries[idx].sourceType && entries[idx].sourceId
                        ? findTokenAcrossScenes(draft, entries[idx].sourceType, entries[idx].sourceId)
                        : null
                );
            if (linkedToken) {
                entries[idx].linkedTokenId = linkedToken.id;
                linkedToken.hpCurrent = entries[idx].hpCurrent;
                linkedToken.hpMax = entries[idx].hpMax;
                linkedToken.ac = entries[idx].ac;
                if (!getRosterPlayerForRecord(linkedToken)) {
                    linkedToken.label = entries[idx].name || linkedToken.label;
                } else {
                    syncTokenRosterIdentity(linkedToken, getRosterPlayerForRecord(linkedToken));
                    syncEntryRosterIdentity(entries[idx], getRosterPlayerForRecord(linkedToken));
                }
                linkedToken.passivePerception = entries[idx].passivePerception;
                linkedToken.stealthRoll = getEntryStealthRoll(entries[idx]);
                linkedToken.defences = normalizeDefences(entries[idx].defences);
            }
            if (options.sort === true) sortInitiativeEntries(entries);
        });
    };

    const deleteEvidenceNoteById = (noteId) => {
        if (!canDeleteLiveVTTState('delete-evidence-note')) return false;
        const targetId = String(noteId || '').trim();
        if (!targetId) return false;
        withDraft((draft) => {
            const scene = getActiveScene(draft);
            if (!scene || !Array.isArray(scene.evidenceNotes)) return;
            scene.evidenceNotes = scene.evidenceNotes.filter((note) => String(note && note.id || '').trim() !== targetId);
            if (stageState.selection.evidenceNoteId === targetId) stageState.selection.evidenceNoteId = '';
            if (uiRuntime.overlays.tokenInspector && uiRuntime.overlays.tokenInspector.kind === 'note' && uiRuntime.overlays.tokenInspector.targetId === targetId) {
                uiRuntime.overlays.tokenInspector = null;
            }
        });
        return true;
    };

    const duplicateEvidenceNoteById = (noteId) => {
        const targetId = String(noteId || '').trim();
        if (!targetId || !isDM()) return false;
        let duplicateId = '';
        withDraft((draft) => {
            const scene = getActiveScene(draft);
            if (!scene || !Array.isArray(scene.evidenceNotes)) return;
            const source = scene.evidenceNotes.find((note) => String(note && note.id || '').trim() === targetId);
            if (!source) return;
            const cellPx = getSceneCellPx(scene);
            const copy = deepClone(source);
            copy.id = buildId('evidence');
            copy.title = `${getEvidenceNoteDisplayTitle(source)} Copy`.slice(0, 120);
            copy.x = toNumber(source.x, 0) + cellPx;
            copy.y = toNumber(source.y, 0) + cellPx;
            scene.evidenceNotes.push(copy);
            duplicateId = copy.id;
            stageState.selection.evidenceNoteId = copy.id;
            stageState.selection.tokenId = '';
            stageState.selection.entryId = '';
        });
        return !!duplicateId;
    };

    const assignSelectedEntryToToken = (tokenId) => {
        if (!canEditInitiative()) return false;
        const targetTokenId = String(tokenId || '').trim();
        if (!stageState.selection.entryId || !targetTokenId) return false;
        let assigned = false;
        withDraft((draft) => {
            const entries = draft && draft.initiative && Array.isArray(draft.initiative.entries) ? draft.initiative.entries : [];
            const idx = entries.findIndex((entry) => String(entry && entry.id || '').trim() === String(stageState.selection.entryId || '').trim());
            if (idx < 0) return;
            const token = findTokenByIdAcrossScenes(draft, targetTokenId);
            if (!token) return;
            persistSheetIdentityForLinkedPlayer(entries[idx], token);
            entries[idx] = linkInitiativeEntryToToken(entries[idx], token);
            stageState.selection.tokenId = token.id;
            stageState.selection.evidenceNoteId = '';
            assigned = true;
        });
        return assigned;
    };

    const findReplacementTokenForIdentity = (state, removedToken) => {
        const sourceType = String(removedToken && removedToken.sourceType || '').trim();
        const sourceId = String(removedToken && removedToken.sourceId || '').trim();
        const removedTokenId = String(removedToken && removedToken.id || '').trim();
        if (!sourceType || !sourceId || !state || !Array.isArray(state.scenes)) return null;
        for (const scene of state.scenes) {
            if (!scene || !Array.isArray(scene.tokens)) continue;
            const replacement = scene.tokens.find((token) =>
                String(token && token.id || '').trim() !== removedTokenId
                && String(token && token.sourceType || '').trim() === sourceType
                && String(token && token.sourceId || '').trim() === sourceId
            );
            if (replacement) return replacement;
        }
        return null;
    };

    const removeInitiativeEntriesForToken = (draft, removedToken) => {
        if (!draft || !draft.initiative || !Array.isArray(draft.initiative.entries) || !removedToken) return;
        const replacementToken = findReplacementTokenForIdentity(draft, removedToken);
        const removedEntryIds = new Set();
        draft.initiative.entries = draft.initiative.entries.flatMap((entry) => {
            const matchesLinkedToken = String(entry && entry.linkedTokenId || '').trim() === String(removedToken.id || '').trim();
            const matchesSource = !!(
                removedToken.sourceType
                && removedToken.sourceId
                && String(entry && entry.sourceType || '').trim() === String(removedToken.sourceType || '').trim()
                && String(entry && entry.sourceId || '').trim() === String(removedToken.sourceId || '').trim()
            );
            if (!matchesLinkedToken && !matchesSource) return [entry];
            if (replacementToken) return [syncInitiativeEntryFromToken(entry, replacementToken)];
            removedEntryIds.add(String(entry && entry.id || '').trim());
            return [];
        });

        if (removedEntryIds.has(String(draft.initiative.activeEntryId || '').trim())) {
            draft.initiative.activeEntryId = draft.initiative.entries[0] ? draft.initiative.entries[0].id : '';
            const replacementEntry = draft.initiative.entries[0] || null;
            if (draft.initiative.encounterActive && replacementEntry) replacementEntry.reactionUsed = false;
        }
        if (!draft.initiative.entries.length && draft.initiative.encounterActive) {
            draft.initiative.encounterActive = false;
            draft.initiative.sceneId = '';
            draft.initiative.startedAt = 0;
            draft.initiative.round = 1;
        }
        if (removedEntryIds.has(String(stageState.selection.entryId || '').trim())) {
            stageState.selection.entryId = draft.initiative.activeEntryId || '';
        }
    };

    const ensureInitiativeState = (draft) => {
        if (!draft.initiative || typeof draft.initiative !== 'object') draft.initiative = {};
        if (!Array.isArray(draft.initiative.entries)) draft.initiative.entries = [];
        draft.initiative.round = Math.max(1, Math.round(toNumber(draft.initiative.round, 1)));
        draft.initiative.activeEntryId = String(draft.initiative.activeEntryId || '').trim();
        draft.initiative.encounterActive = !!draft.initiative.encounterActive;
        draft.initiative.sceneId = String(draft.initiative.sceneId || '').trim();
        draft.initiative.startedAt = Math.max(0, Math.round(toNumber(draft.initiative.startedAt, 0)));
        return draft.initiative;
    };

    const upsertInitiativeEntryForToken = (draft, token) => {
        if (!draft || !token) return null;
        const initiative = ensureInitiativeState(draft);
        const entries = initiative.entries;
        const existingIdx = entries.findIndex((entry) =>
            entry.linkedTokenId === token.id
            || (token.sourceType && token.sourceId && entry.sourceType === token.sourceType && entry.sourceId === token.sourceId)
        );
        if (existingIdx >= 0) {
            entries[existingIdx] = syncInitiativeEntryFromToken(entries[existingIdx], token);
            return entries[existingIdx];
        }
        const nextEntry = buildInitiativeEntryFromToken(token);
        entries.push(nextEntry);
        return nextEntry;
    };

    const getEncounterSetupScene = (state) => {
        const initiative = state && state.initiative ? state.initiative : {};
        const encounterSceneId = String(initiative.sceneId || '').trim();
        if (initiative.encounterActive && encounterSceneId) {
            const encounterScene = getSceneById(encounterSceneId, state);
            if (encounterScene) return encounterScene;
        }
        return getSceneById(getSharedSceneId(state), state) || getActiveScene(state);
    };

    const addVisibleTokensToInitiativeDraft = (draft, scene = getEncounterSetupScene(draft)) => {
        if (!scene || !Array.isArray(scene.tokens)) return [];
        const addedEntries = [];
        scene.tokens
            .filter((token) => !isTokenHiddenForRole(token, scene, 'player'))
            .forEach((token) => {
                const entry = upsertInitiativeEntryForToken(draft, token);
                if (entry) addedEntries.push(entry);
            });
        const initiative = ensureInitiativeState(draft);
        sortInitiativeEntries(initiative.entries);
        if (initiative.encounterActive && !initiative.activeEntryId && initiative.entries[0]) {
            initiative.activeEntryId = initiative.entries[0].id;
        }
        return addedEntries;
    };

    const focusInitiativeTurn = (entryId, state = sessionState.snapshot) => {
        const targetId = String(entryId || '').trim();
        if (!targetId) return false;
        const entry = getEntryById(targetId, state);
        const scene = getCombatScene(state);
        const token = getSceneTokenForEntry(scene, entry);
        stageState.selection.entryId = targetId;
        stageState.selection.evidenceNoteId = '';
        stageState.selection.tokenId = token ? token.id : '';
        if (token && scene && getActiveScene(state) && getActiveScene(state).id === scene.id) {
            focusViewOnToken(token, scene);
            renderStage();
        }
        window.requestAnimationFrame(() => {
            if (!dom.initiativeListEl) return;
            const selectorId = window.CSS && typeof window.CSS.escape === 'function'
                ? window.CSS.escape(targetId)
                : targetId.replace(/"/g, '\\"');
            const row = dom.initiativeListEl.querySelector(`.vtt-entry[data-id="${selectorId}"]`);
            if (row && typeof row.scrollIntoView === 'function') row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        });
        return true;
    };

    const addVisibleTokensToInitiative = () => {
        if (!canEditInitiative()) return false;
        let focusEntryId = '';
        const changed = withDraft((draft) => {
            const entries = addVisibleTokensToInitiativeDraft(draft);
            const initiative = ensureInitiativeState(draft);
            focusEntryId = String(entries[0] && entries[0].id || initiative.activeEntryId || '').trim();
        }, { reason: 'add-visible-tokens-to-initiative' });
        if (changed && focusEntryId) focusInitiativeTurn(focusEntryId);
        return changed;
    };

    const startEncounter = () => {
        if (!canEditInitiative()) return false;
        let activeEntryId = '';
        const changed = withDraft((draft) => {
            const initiative = ensureInitiativeState(draft);
            const scene = getEncounterSetupScene(draft);
            if (!scene) return;
            if (!initiative.entries.length) addVisibleTokensToInitiativeDraft(draft, scene);
            if (!initiative.entries.length) return;
            initiative.sceneId = scene.id;
            initiative.encounterActive = true;
            initiative.startedAt = Date.now();
            initiative.round = 1;
            if (!initiative.entries.some((entry) => entry.id === initiative.activeEntryId)) {
                initiative.activeEntryId = initiative.entries[0] ? initiative.entries[0].id : '';
            }
            const activeEntry = initiative.entries.find((entry) => entry.id === initiative.activeEntryId) || null;
            if (activeEntry) activeEntry.reactionUsed = false;
            activeEntryId = initiative.activeEntryId;
            stageState.selection.entryId = activeEntryId;
        }, { reason: 'start-encounter' });
        if (changed && activeEntryId) focusInitiativeTurn(activeEntryId);
        return changed;
    };

    const endEncounter = () => {
        if (!canEditInitiative()) return false;
        const initiative = sessionState.snapshot && sessionState.snapshot.initiative ? sessionState.snapshot.initiative : {};
        if (!initiative.encounterActive) return false;
        if (!window.confirm('End this encounter? The initiative order will be kept so it can be restarted or edited.')) return false;
        return withDraft((draft) => {
            const nextInitiative = ensureInitiativeState(draft);
            nextInitiative.encounterActive = false;
            nextInitiative.activeEntryId = '';
            nextInitiative.sceneId = '';
            nextInitiative.startedAt = 0;
            nextInitiative.round = 1;
            stageState.selection.entryId = '';
        }, { reason: 'end-encounter' });
    };

    const addTokenToInitiative = (tokenId) => {
        if (!canEditInitiative()) return;
        withDraft((draft) => {
            const scene = getActiveScene(draft);
            if (!scene || !Array.isArray(scene.tokens)) return;
            const token = scene.tokens.find((entry) => entry.id === tokenId);
            if (!token) return;
            const nextEntry = upsertInitiativeEntryForToken(draft, token);
            const entries = ensureInitiativeState(draft).entries;
            stageState.selection.entryId = nextEntry ? nextEntry.id : stageState.selection.entryId;
            sortInitiativeEntries(entries);
            if (draft.initiative.encounterActive && !draft.initiative.activeEntryId && entries[0]) {
                draft.initiative.activeEntryId = entries[0].id;
            }
        });
    };

    const snapTokenToGrid = (tokenId) => {
        const targetId = String(tokenId || '').trim();
        if (!targetId) return;
        const token = getTokenById(targetId);
        if (!token) return;
        const nextX = snapTokenCoordinate(token.x, token.x);
        const nextY = snapTokenCoordinate(token.y, token.y);
        if (token.x === nextX && token.y === nextY) return;

        withDraft((draft) => {
            const scene = getActiveScene(draft);
            if (!scene || !Array.isArray(scene.tokens)) return;
            const draftToken = scene.tokens.find((entry) => entry && entry.id === targetId);
            if (!draftToken) return;
            draftToken.x = nextX;
            draftToken.y = nextY;
        }, { reason: 'token-snap-grid' });
    };

    const moveSelectedTokenByCells = (deltaX, deltaY) => {
        if (!stageState.selection.tokenId) return false;
        const token = getTokenById(stageState.selection.tokenId);
        if (!token) return false;
        const nextX = Math.max(0, snapTokenCoordinate(token.x, token.x) + deltaX);
        const nextY = Math.max(0, snapTokenCoordinate(token.y, token.y) + deltaY);
        if (token.x === nextX && token.y === nextY) return false;

        return withDraft((draft) => {
            const scene = getActiveScene(draft);
            if (!scene || !Array.isArray(scene.tokens)) return;
            const draftToken = scene.tokens.find((entry) => entry && entry.id === stageState.selection.tokenId);
            if (!draftToken) return;
            draftToken.x = nextX;
            draftToken.y = nextY;
        }, { reason: 'token-keyboard-move' });
    };

    const syncDraggedState = (force = false) => {
        const store = getStore();
        if (!store || !sessionState.snapshot) return;
        const collabTransport = getVTTCollabTransport();
        const canSyncLivePosition = isVTTCollabReady()
            && collabTransport
            && (
                typeof collabTransport.syncSnapshot === 'function'
                || typeof collabTransport.previewTokenPositions === 'function'
                || typeof collabTransport.updateTokenPositions === 'function'
            );
        if (!canSyncLivePosition && requiresLiveVTTRoom()) {
            canMutateLiveVTTState(force ? 'token-drop' : 'token-drag');
            return;
        }
        if (!force && !canSyncLivePosition) return;
        const now = Date.now();
        if (!force && stageState.pointer.lastDragSyncAt && now - stageState.pointer.lastDragSyncAt < C.DRAG_SYNC_INTERVAL_MS) return;
        const localToken = stageState.pointer.drag ? getTokenById(stageState.pointer.drag.tokenId, sessionState.snapshot) : null;
        const scene = getActiveScene(sessionState.snapshot);

        if (!localToken || !scene) {
            sessionState.snapshot = readSharedVTTSnapshot() || deepClone(sessionState.snapshot);
            stageState.pointer.lastDragSyncAt = now;
            return;
        }

        if (canSyncLivePosition) {
            if (!force && typeof collabTransport.previewTokenPositions === 'function') {
                // Keep live pointer motion off the canonical snapshot/persistence path.
                Promise.resolve(collabTransport.previewTokenPositions([{
                    sceneId: scene.id,
                    tokenId: localToken.id,
                    x: localToken.x,
                    y: localToken.y
                }])).catch((err) => {
                    console.warn('VTT collaboration drag preview failed', err);
                });
                stageState.pointer.lastDragSyncAt = now;
                return;
            }
            if (typeof collabTransport.updateTokenPositions === 'function') {
                const positionChange = {
                    sceneId: scene.id,
                    tokenId: localToken.id,
                    x: localToken.x,
                    y: localToken.y
                };
                Promise.resolve(collabTransport.updateTokenPositions([
                    positionChange
                ], force ? { flushNow: true } : {})).catch((err) => {
                    console.warn('VTT collaboration drag sync failed', err);
                }).then(() => {
                    if (!force || typeof collabTransport.previewTokenPositions !== 'function') return null;
                    return collabTransport.previewTokenPositions([positionChange], { settled: true });
                }).catch((err) => {
                    console.warn('VTT collaboration drag settle failed', err);
                });
                stageState.pointer.lastDragSyncAt = now;
                return;
            }
            const sessionSnapshot = typeof collabTransport.getSnapshot === 'function'
                ? deepClone(collabTransport.getSnapshot())
                : readSharedVTTSnapshot();
            const nextSnapshot = sessionSnapshot ? deepClone(sessionSnapshot) : deepClone(sessionState.snapshot);
            const nextScene = nextSnapshot && Array.isArray(nextSnapshot.scenes)
                ? nextSnapshot.scenes.find((entry) => entry && entry.id === scene.id)
                : null;
            const nextToken = nextScene && Array.isArray(nextScene.tokens)
                ? nextScene.tokens.find((entry) => entry && entry.id === localToken.id)
                : null;
            if (nextToken && typeof collabTransport.syncSnapshot === 'function') {
                nextToken.x = localToken.x;
                nextToken.y = localToken.y;
                Promise.resolve(collabTransport.syncSnapshot(nextSnapshot, {
                    baseSnapshot: sessionSnapshot,
                    flushNow: !!force,
                    reason: force ? 'token-drop' : 'token-drag'
                })).catch((err) => {
                    console.warn('VTT collaboration drag sync failed', err);
                });
            }
            stageState.pointer.lastDragSyncAt = now;
            return;
        }

        const draft = deepClone(store.getVTTState(getActiveCaseId()));
        const draftScene = getActiveScene(draft);
        const idx = draftScene && Array.isArray(draftScene.tokens)
            ? draftScene.tokens.findIndex((token) => token.id === (stageState.pointer.drag && stageState.pointer.drag.tokenId))
            : -1;
        if (!draftScene || idx < 0) {
            sessionState.snapshot = deepClone(draft);
            syncRosterLinkedPlayerPresentation(sessionState.snapshot);
            stageState.pointer.lastDragSyncAt = now;
            return;
        }

        draftScene.tokens[idx] = {
            ...draftScene.tokens[idx],
            x: localToken.x,
            y: localToken.y
        };

        const saved = store.updateVTTState(draft, getActiveCaseId());
        sessionState.snapshot = deepClone(saved);
        sessionState.stateCaseId = getActiveCaseId();
        syncRosterLinkedPlayerPresentation(sessionState.snapshot);
        stageState.pointer.lastDragSyncAt = now;
    };

    const advanceSceneClocksForCadence = (draft, cadence) => {
        const targetCadence = String(cadence || '').trim().toLowerCase();
        if (!['turn', 'round'].includes(targetCadence)) return 0;
        const scene = getCombatScene(draft);
        if (!scene || !Array.isArray(scene.clocks)) return 0;
        let advanced = 0;
        scene.clocks.forEach((clock) => {
            const clockCadence = ['turn', 'round'].includes(String(clock && clock.cadence || '').trim().toLowerCase())
                ? String(clock.cadence).trim().toLowerCase()
                : 'manual';
            if (clockCadence !== targetCadence) return;
            const max = normalizeClockMax(clock && clock.max, 4);
            const current = normalizeClockCurrent(clock && clock.current, max, 0);
            if (current >= max) return;
            clock.current = current + 1;
            advanced += 1;
        });
        return advanced;
    };

    const advanceTurn = (direction) => {
        if (!canEditInitiative()) return false;
        const step = Math.sign(toNumber(direction, 0));
        if (!step) return false;
        const currentInitiative = sessionState.snapshot && sessionState.snapshot.initiative
            ? sessionState.snapshot.initiative
            : {};
        if (!currentInitiative.encounterActive) {
            return step > 0 ? startEncounter() : false;
        }
        const currentEntries = Array.isArray(currentInitiative.entries) ? currentInitiative.entries : [];
        const currentEntryIndex = currentEntries.findIndex((entry) => entry && entry.id === currentInitiative.activeEntryId);
        if (step < 0 && Math.max(1, Math.round(toNumber(currentInitiative.round, 1))) === 1 && currentEntryIndex <= 0) {
            return false;
        }

        let focusedEntryId = '';
        const changed = withDraft((draft) => {
            const initiative = ensureInitiativeState(draft);
            const entries = initiative.entries;
            if (!entries.length) {
                initiative.activeEntryId = '';
                initiative.round = 1;
                initiative.encounterActive = false;
                initiative.sceneId = '';
                initiative.startedAt = 0;
                return;
            }

            const currentIdx = entries.findIndex((entry) => entry.id === initiative.activeEntryId);
            const safeIdx = currentIdx >= 0 ? currentIdx : 0;
            if (step > 0) {
                const nextIdx = (safeIdx + 1) % entries.length;
                const wrappedRound = safeIdx === entries.length - 1;
                if (wrappedRound) initiative.round += 1;
                initiative.activeEntryId = entries[nextIdx].id;
                entries[nextIdx].reactionUsed = false;
                advanceSceneClocksForCadence(draft, 'turn');
                if (wrappedRound) advanceSceneClocksForCadence(draft, 'round');
            } else {
                if (initiative.round === 1 && safeIdx === 0) return;
                const prevIdx = (safeIdx - 1 + entries.length) % entries.length;
                if (safeIdx === 0) initiative.round = Math.max(1, initiative.round - 1);
                initiative.activeEntryId = entries[prevIdx].id;
            }
            focusedEntryId = initiative.activeEntryId;
            stageState.selection.entryId = focusedEntryId;
        }, { reason: step > 0 ? 'initiative-next-turn' : 'initiative-previous-turn' });
        if (changed && focusedEntryId) focusInitiativeTurn(focusedEntryId);
        return changed;
    };

    const resetInitiativeToRoundOne = () => {
        if (!canEditInitiative()) return false;
        const initiative = sessionState.snapshot && sessionState.snapshot.initiative ? sessionState.snapshot.initiative : {};
        if (!initiative.encounterActive) return false;
        const entries = Array.isArray(initiative.entries) ? initiative.entries : [];
        const firstEntryId = String(entries[0] && entries[0].id || '').trim();
        if (Math.max(1, Math.round(toNumber(initiative.round, 1))) === 1 && String(initiative.activeEntryId || '').trim() === firstEntryId) {
            return false;
        }
        if (!window.confirm('Reset initiative to round 1 and make the first combatant active? Clocks will not be rewound.')) return false;
        let focusedEntryId = '';
        const changed = withDraft((draft) => {
            const nextInitiative = ensureInitiativeState(draft);
            nextInitiative.round = 1;
            nextInitiative.activeEntryId = nextInitiative.entries.length ? nextInitiative.entries[0].id : '';
            const activeEntry = nextInitiative.entries[0] || null;
            if (activeEntry) activeEntry.reactionUsed = false;
            focusedEntryId = nextInitiative.activeEntryId;
            stageState.selection.entryId = focusedEntryId;
        }, { reason: 'initiative-reset-round' });
        if (changed && focusedEntryId) focusInitiativeTurn(focusedEntryId);
        return changed;
    };

    const reorderEntry = (entryId, delta) => {
        if (!canEditInitiative()) return;
        withDraft((draft) => {
            const entries = draft && draft.initiative && Array.isArray(draft.initiative.entries) ? draft.initiative.entries : [];
            const idx = entries.findIndex((entry) => entry.id === entryId);
            if (idx < 0) return;
            const nextIdx = clamp(idx + delta, 0, entries.length - 1);
            if (nextIdx === idx) return;
            const [row] = entries.splice(idx, 1);
            entries.splice(nextIdx, 0, row);
        });
    };

    const removeEntry = (entryId) => {
        if (!canEditInitiative()) return;
        if (!canDeleteLiveVTTState('remove-initiative-entry')) return;
        withDraft((draft) => {
            const entries = draft && draft.initiative && Array.isArray(draft.initiative.entries) ? draft.initiative.entries : [];
            const idx = entries.findIndex((entry) => entry.id === entryId);
            if (idx < 0) return;
            const removed = entries[idx];
            entries.splice(idx, 1);
            if (draft.initiative.activeEntryId === removed.id) {
                draft.initiative.activeEntryId = entries[idx] ? entries[idx].id : (entries[idx - 1] ? entries[idx - 1].id : '');
                const replacement = entries.find((entry) => entry.id === draft.initiative.activeEntryId) || null;
                if (draft.initiative.encounterActive && replacement) replacement.reactionUsed = false;
            }
            if (!entries.length && draft.initiative.encounterActive) {
                draft.initiative.encounterActive = false;
                draft.initiative.sceneId = '';
                draft.initiative.startedAt = 0;
                draft.initiative.round = 1;
            }
            if (stageState.selection.entryId === removed.id) stageState.selection.entryId = draft.initiative.activeEntryId || '';
            if (uiRuntime.overlays.initiativeDetail && uiRuntime.overlays.initiativeDetail.entryId === removed.id) uiRuntime.overlays.initiativeDetail = null;
        });
    };

    const getPlayerRollAnchorPoint = () => {
        const anchor = dom.playerRollPanelEl;
        if (anchor && typeof anchor.getBoundingClientRect === 'function') {
            const rect = anchor.getBoundingClientRect();
            return {
                x: Math.round(rect.left + rect.width / 2),
                y: Math.round(rect.bottom)
            };
        }
        return { x: Math.round(window.innerWidth / 2), y: Math.round(window.innerHeight / 2) };
    };

    const vttActionState = runtimeState.ports.actions;

    const vttRollsActionFactory = window.RTF_VTT_ACTIONS_ROLLS;
    if (!vttRollsActionFactory || typeof vttRollsActionFactory.create !== 'function') {
        throw new Error('VTT roll and modal actions module failed to load.');
    }
    const vttRollsActions = vttRollsActionFactory.create({
        state: vttActionState,
        activateTokenSelection,
        addProximityTrigger,
        applyRollModeToD20Formula,
        applyTokenInitiativeRollToTracker,
        askRollFromSheetActionByKey,
        buildMonsterAssignResultsMarkup,
        buildMonsterRollPresets,
        buildSheetActionCatalog,
        canDeleteLiveVTTState,
        canUseSharedPlayerTools,
        cancelAskRollPickMode,
        cancelAskRollPingById,
        closeActiveVTTPanel,
        closeDMUnlockModal,
        closeInitiativeDetail,
        closeNPCRollPopover,
        closeRosterSelfModal,
        closeSheetActionPopover,
        closeViewMenu,
        deleteProximityTrigger,
        dismissActiveProximityPrompt,
        findMonsterById,
        focusViewOnToken,
        getActiveProximityPrompt,
        getActiveScene,
        getAllowedVTTPanel,
        getAskRollRequestLabelForItem,
        getLocalPlayerFocusContext,
        getPlayerRollAnchorPoint,
        getSceneById,
        getSceneMusicSummary,
        getSharedSceneId,
        getTokenById,
        gmParseComplexFormula,
        isDM,
        isPlayer,
        isRollActionGuarded,
        isSpectator,
        linkRosterSelfSelection,
        normalizeRollMode,
        openCustomRollPopover,
        openSheetActionPopover,
        postGMDiscordRoll,
        promptForDMMode,
        queueRollRequest,
        render,
        renderInitiativeDetail,
        renderInitiativeList,
        renderNPCRollPopover,
        renderPlayerRollMenu,
        renderProximityPrompt,
        renderSheetActionPopover,
        renderStage,
        renderTokenInspector,
        renderYouTubeAudioPlayer,
        resolveActiveProximityRoll,
        rollAskRollPingById,
        runSheetActionByKey,
        selectRosterSelfPlayer,
        sendYouTubeMusicCommand,
        setActiveVTTPanel,
        setAskRollPickMode,
        setRolePreference,
        stopYouTubeMusicFrame,
        toggleUIPreference,
        updateMonsterRollOverrideForToken,
        withDraft,
        youtubeAudioPlayerEl: dom.youtubeAudioPlayerEl
    });

    const vttTableActionFactory = window.RTF_VTT_ACTIONS_TABLE;
    if (!vttTableActionFactory || typeof vttTableActionFactory.create !== 'function') {
        throw new Error('VTT table chrome and quick-edit actions module failed to load.');
    }
    const vttTableActions = vttTableActionFactory.create({
        state: vttActionState,
        EVIDENCE_NOTE_SHAPE_PIN: C.EVIDENCE_NOTE_SHAPE_PIN,
        TOOL_MODE_CIRCLE: C.TOOL_MODE_CIRCLE,
        TOOL_MODE_CONE: C.TOOL_MODE_CONE,
        TOOL_MODE_FOG: C.TOOL_MODE_FOG,
        TOOL_MODE_FOG_REMOVE: C.TOOL_MODE_FOG_REMOVE,
        TOOL_MODE_NAVIGATE: C.TOOL_MODE_NAVIGATE,
        TOOL_MODE_NOTE: C.TOOL_MODE_NOTE,
        TOOL_MODE_PING: C.TOOL_MODE_PING,
        TOOL_MODE_RULER: C.TOOL_MODE_RULER,
        applyMonsterStatBlockToToken,
        buildId,
        bustAllVTTRosterAssociations,
        bustVTTLiveCache,
        canBroadcastFromViewedScene,
        canDeleteLiveVTTState,
        canUseSharedPlayerTools,
        clearTokenPortraitPreview,
        closeNPCSearch,
        closeQuickSpawnMenu,
        closeStageContextMenu,
        closeTokenInspectorPopover,
        closeViewMenu,
        confirmClearSceneFog,
        createEvidenceNoteAtWorldPoint,
        deleteEvidenceNoteById,
        duplicateEvidenceNoteById,
        findMonsterForAssignmentQuery,
        fitViewToWorld,
        focusClockEditor,
        forceDMVTTAuthoritative,
        getActiveScene,
        getCombatScene,
        getCanonicalTokenImageUrl,
        getLocalPlayerFocusContext,
        getPingVariantOptions,
        getRosterPlayerForRecord,
        getStageContextWorldPoint,
        getTokenById,
        hasValue,
        isDM,
        isNPCRollTarget,
        isPlayer,
        isSpectator,
        normalizeClockCurrent,
        normalizeClockMax,
        normalizePingVariant,
        normalizeToolMode,
        npcSearchToggleEl: dom.npcSearchToggleEl,
        openCustomRollPopover,
        openEvidenceNoteInspectorPopover,
        openNPCRollPopover,
        openNPCSearchAt,
        openQuickSpawnMenu,
        openSheetActionPopover,
        openTokenInspectorPopover,
        queueSharedPing,
        render,
        renderNPCSearchPopover,
        renderStage,
        renderTokenInspector,
        renderTokenInspectorPopover,
        renderToolsMenu,
        renderViewMenu,
        reportVTTAdminActionError,
        triggerBlackMoonHowls,
        setActiveVTTPanel,
        setCombatView,
        setToolMode,
        setZoomAroundStageCenter,
        showTokenPortraitPreview,
        spawnAllPlayersAtWorldPoint,
        spawnTokenFromDescriptor,
        stageEl: dom.stageEl,
        toImageUrl,
        toNumber,
        toggleUIPreference,
        tokenImageRetryKeys: resources.tokenImageRetryKeys,
        updateSceneClock,
        updateSelectedEvidenceNote,
        updateSelectedToken,
        withDraft
    });

    const vttScenesActionFactory = window.RTF_VTT_ACTIONS_SCENES;
    if (!vttScenesActionFactory || typeof vttScenesActionFactory.create !== 'function') {
        throw new Error('VTT scene actions module failed to load.');
    }
    const vttScenesActions = vttScenesActionFactory.create({
        state: vttActionState,
        SCENE_VIEW_LOCAL: C.SCENE_VIEW_LOCAL,
        SCENE_VIEW_SHARED: C.SCENE_VIEW_SHARED,
        buildSceneRecord,
        canDeleteLiveVTTState,
        clampMapScale,
        confirmSceneDeletion,
        getActiveScene,
        getContextSpawnWorldPoint,
        getSharedSceneId,
        getViewedSceneId,
        isDM,
        normalizeSelections,
        openQuickSpawnMenu,
        removeInitiativeEntriesForToken,
        render,
        setSceneViewPreference,
        spawnTokenFromDescriptor,
        stageEl: dom.stageEl,
        toNumber,
        withDraft
    });

    const vttSelectionActionFactory = window.RTF_VTT_ACTIONS_SELECTION;
    if (!vttSelectionActionFactory || typeof vttSelectionActionFactory.create !== 'function') {
        throw new Error('VTT token and initiative actions module failed to load.');
    }
    const vttSelectionActions = vttSelectionActionFactory.create({
        state: vttActionState,
        activateEvidenceNoteSelection,
        activateTokenSelection,
        addVisibleTokensToInitiative,
        addTokenToInitiative,
        advanceTurn,
        assignSelectedEntryToToken,
        canDeleteLiveVTTState,
        cloneTokenById,
        endEncounter,
        focusViewOnToken,
        getActiveScene,
        isDM,
        openInitiativeDetail,
        removeEntry,
        removeInitiativeEntriesForToken,
        renderInitiativeDetail,
        renderInitiativeList,
        renderStage,
        renderTokenInspector,
        reorderEntry,
        resetInitiativeToRoundOne,
        setInitiativeEntryRosterOwner,
        showTokenPortraitPreview,
        startEncounter,
        syncTokenSelectionFromEntry,
        toNumber,
        updateSelectedEntry,
        updateSelectedToken,
        withDraft
    });

    const handleAction = (actionEl) => {
        const action = String(actionEl.dataset.action || '').trim();
        if (!action) return;
        const id = String(actionEl.dataset.id || '').trim();

        if (action === 'open-case-board') {
            openVTTCaseBoard(actionEl);
            return;
        }
        if (action === 'close-case-board') {
            closeVTTCaseBoard();
            return;
        }

        if (vttRollsActions.handles(action)) {
            vttRollsActions.handle(actionEl, action, id);
            return;
        }
        if (vttTableActions.handles(action)) {
            vttTableActions.handle(actionEl, action, id);
            return;
        }

        if (action === 'undo-annotation' || action === 'clear-annotations') {
            if (action === 'clear-annotations' && !isDM()) return;
            const localPlayerId = isPlayer()
                ? String(getLocalPlayerFocusContext().playerId || '').trim()
                : '';
            if (action === 'undo-annotation' && !isDM() && !localPlayerId) return;
            withDraft((draft) => {
                const scene = getActiveScene(draft);
                if (!scene || !Array.isArray(scene.annotations)) return;
                if (action === 'clear-annotations') {
                    scene.annotations = [];
                    return;
                }
                let annotationIndex = -1;
                for (let index = scene.annotations.length - 1; index >= 0; index -= 1) {
                    const annotation = scene.annotations[index];
                    const authorKind = String(annotation && annotation.authorKind || '').trim();
                    const authorPlayerId = String(annotation && annotation.authorPlayerId || '').trim();
                    const isLocalAuthor = isDM()
                        ? (authorKind === 'dm' || (!authorKind && !authorPlayerId))
                        : (authorKind === 'player' && authorPlayerId === localPlayerId);
                    if (isLocalAuthor) {
                        annotationIndex = index;
                        break;
                    }
                }
                if (annotationIndex !== -1) scene.annotations.splice(annotationIndex, 1);
            }, { reason: action });
            return;
        }

        if (!isDM() && action !== 'select-token' && action !== 'select-entry' && action !== 'select-evidence-note') return;

        if (vttScenesActions.handles(action)) {
            vttScenesActions.handle(actionEl, action, id);
            return;
        }
        if (vttSelectionActions.handles(action)) {
            vttSelectionActions.handle(actionEl, action, id);
        }
    };

    const vttFieldRouterFactory = window.RTF_VTT_FIELD_ROUTER;
    if (!vttFieldRouterFactory || typeof vttFieldRouterFactory.create !== 'function') {
        throw new Error('VTT field router module failed to load.');
    }
    const vttFieldRouterState = runtimeState.ports.fields;
    const vttFieldRouter = vttFieldRouterFactory.create({
        state: vttFieldRouterState,
        DEFENCE_KEYS: C.DEFENCE_KEYS,
        EVIDENCE_NOTE_SHAPE_PIN: C.EVIDENCE_NOTE_SHAPE_PIN,
        EVIDENCE_NOTE_SHAPE_ZONE: C.EVIDENCE_NOTE_SHAPE_ZONE,
        MOVE_ACCESS_OPTIONS: C.MOVE_ACCESS_OPTIONS,
        SCENE_VIEW_LOCAL: C.SCENE_VIEW_LOCAL,
        SCENE_VIEW_SHARED: C.SCENE_VIEW_SHARED,
        SIDE_OPTIONS: C.SIDE_OPTIONS,
        alert: (...args) => window.alert(...args),
        assignSelectedEntryToToken,
        buildEvidenceNoteFromCellBounds,
        buildMonsterAssignResultsMarkup,
        canEditInitiative,
        clamp,
        clampMapScale,
        findTokenByIdAcrossScenes,
        getActiveScene,
        getDefaultEvidenceNoteHighlightColor,
        getDefaultEvidenceNoteTitle,
        getEntryById,
        getEvidenceNoteCellBounds,
        getEvidenceNoteDisplayTitle,
        getRosterPlayerForRecord,
        getTokenById,
        handleProximityTriggerFieldChange,
        isDM,
        normalizeClockCurrent,
        normalizeClockMax,
        normalizeClockNote,
        normalizeClockTitle,
        normalizeDefences,
        normalizeEvidenceNoteBody,
        normalizeEvidenceNoteCategory,
        normalizeEvidenceNoteShape,
        normalizeEvidenceNoteTitle,
        normalizeGridCoordinate,
        normalizeHexColor,
        normalizeMoodEmoji,
        normalizeMoodLabel,
        normalizeMusicTension,
        normalizeOptionalMusicTension,
        normalizeSceneMusic,
        normalizeSelections,
        normalizeToolSizeCells,
        npcSearchInputEl: dom.npcSearchInputEl,
        parseConditions,
        persistRosterPlayerImageUrl,
        render,
        renderNPCRollPopover,
        renderNPCSearchPopover,
        renderPlayerRollMenu,
        renderSceneList,
        renderSheetActionPopover,
        setInitiativeEntryRosterOwner,
        setSceneViewPreference,
        setYouTubeMusicVolume,
        switchVTTCase,
        toNumber,
        updateSceneClock,
        updateSelectedEntry,
        updateSelectedEvidenceNote,
        updateSelectedToken,
        withDraft
    });
    const handleFieldChange = vttFieldRouter.handleFieldChange;
    const handleNPCSearchInput = vttFieldRouter.handleNPCSearchInput;
    const handleSceneMusicEditorChange = vttFieldRouter.handleSceneMusicEditorChange;
    const handleSceneMusicEditorInput = vttFieldRouter.handleSceneMusicEditorInput;
    const handleSceneMusicEditorKeyDown = vttFieldRouter.handleSceneMusicEditorKeyDown;

    const sanitizeQueueEntry = (raw) => {
        const source = raw && typeof raw === 'object' ? raw : null;
        if (!source) return null;
        const rollId = String(source.rollId || '').trim();
        const name = String(source.name || '').trim();
        if (!rollId || !name) return null;
        const defences = normalizeDefences(source.defences);
        const rawStealthRoll = source.stealthRoll !== undefined ? source.stealthRoll : source.stealthDc;
        return {
            rollId,
            submittedAt: Math.max(0, Math.round(toNumber(source.submittedAt || source.ts, Date.now()))),
            sourceType: String(source.source || source.sourceType || 'sheet').trim() || 'sheet',
            sourceId: String(source.sourceId || '').trim(),
            name,
            total: Math.round(toNumber(source.total, 0)),
            tie: clamp(Math.round(toNumber(source.tie, 10)), 0, 99),
            ac: source.ac === null || source.ac === undefined || source.ac === '' ? null : clamp(Math.round(toNumber(source.ac, 0)), 0, 99),
            hpCurrent: source.hp === null || source.hp === undefined || source.hp === '' ? null : clamp(Math.round(toNumber(source.hp, 0)), 0, 999999),
            hpMax: source.maxHp === null || source.maxHp === undefined || source.maxHp === '' ? null : clamp(Math.round(toNumber(source.maxHp, 0)), 0, 999999),
            passivePerception: source.passivePerception === null || source.passivePerception === undefined || source.passivePerception === '' ? null : clamp(Math.round(toNumber(source.passivePerception, 10)), 0, 99),
            stealthRoll: rawStealthRoll === null || rawStealthRoll === undefined || rawStealthRoll === '' ? null : clamp(Math.round(toNumber(rawStealthRoll, 0)), 0, 99),
            defences
        };
    };

    const processInitiativeQueue = () => {
        if (!canEditInitiative()) return;
        let parsed = [];
        try {
            const raw = localStorage.getItem(C.TRACKER_INITIATIVE_QUEUE_KEY);
            const queue = raw ? JSON.parse(raw) : [];
            if (Array.isArray(queue)) parsed = queue;
        } catch (err) {
            parsed = [];
        }
        if (!parsed.length) return;

        const processed = new Set(readProcessedRollIds());
        const pendingEntries = parsed.map(sanitizeQueueEntry).filter(Boolean).filter((entry) => !processed.has(entry.rollId));
        if (!pendingEntries.length) return;
        if (!canMutateLiveVTTState('initiative-queue')) return;

        const draft = readSharedVTTSnapshot();
        if (!draft) return;
        const baseSnapshot = deepClone(draft);
        let mutated = false;
        const newlyProcessed = [];

        pendingEntries.forEach((packet) => {
            const linkedToken = packet.sourceType && packet.sourceId
                ? findTokenAcrossScenes(draft, packet.sourceType, packet.sourceId)
                : null;
            const entries = draft.initiative.entries;
            const allowNameFallback = !(packet.sourceType && packet.sourceId);
            const idx = entries.findIndex((entry) =>
                (packet.sourceType && packet.sourceId && entry.sourceType === packet.sourceType && entry.sourceId === packet.sourceId)
                || (allowNameFallback && String(entry.name || '').toLowerCase() === packet.name.toLowerCase())
            );
            if (idx >= 0) {
                const base = linkedToken ? syncInitiativeEntryFromToken(entries[idx], linkedToken) : { ...entries[idx] };
                entries[idx] = {
                    ...base,
                    name: packet.name || base.name,
                    total: packet.total,
                    tie: packet.tie,
                    ac: packet.ac !== null ? packet.ac : base.ac,
                    hpCurrent: packet.hpCurrent !== null ? packet.hpCurrent : base.hpCurrent,
                    hpMax: packet.hpMax !== null ? packet.hpMax : base.hpMax,
                    passivePerception: packet.passivePerception !== null ? packet.passivePerception : base.passivePerception,
                    stealthRoll: packet.stealthRoll !== null ? packet.stealthRoll : (base.stealthRoll ?? null),
                    defences: normalizeDefences(packet.defences && Object.values(packet.defences).some((value) => value !== null) ? packet.defences : base.defences),
                    linkedTokenId: linkedToken ? linkedToken.id : base.linkedTokenId,
                    sourceType: packet.sourceType || base.sourceType,
                    sourceId: packet.sourceId || base.sourceId,
                    submissionId: packet.rollId,
                    submittedAt: packet.submittedAt
                };
                if (linkedToken && packet.stealthRoll !== null) linkedToken.stealthRoll = packet.stealthRoll;
                stageState.selection.entryId = entries[idx].id;
            } else {
                const deterministicEntryId = packet.sourceType && packet.sourceId
                    ? String(`init_${packet.sourceType}_${packet.sourceId}`).trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_').slice(0, 120)
                    : '';
                const seed = linkedToken ? buildInitiativeEntryFromToken(linkedToken) : {
                    id: deterministicEntryId || buildId('init'),
                    name: packet.name,
                    linkedTokenId: linkedToken ? linkedToken.id : '',
                    side: linkedToken ? linkedToken.side : 'player',
                    imageUrl: linkedToken ? getTokenMetadataImageUrl(linkedToken) : '',
                    sourceType: packet.sourceType,
                    sourceId: packet.sourceId,
                    submissionId: packet.rollId,
                    submittedAt: packet.submittedAt,
                    total: 0,
                    tie: 10,
                    hpCurrent: null,
                    hpMax: null,
                    ac: null,
                    passivePerception: null,
                    stealthRoll: null,
                    defences: normalizeDefences(null),
                    reactionUsed: false,
                    concentrating: false,
                    hidden: false,
                    conditions: []
                };
                const nextEntry = {
                    ...seed,
                    name: packet.name || seed.name,
                    submissionId: packet.rollId,
                    submittedAt: packet.submittedAt,
                    total: packet.total,
                    tie: packet.tie,
                    ac: packet.ac !== null ? packet.ac : seed.ac,
                    hpCurrent: packet.hpCurrent !== null ? packet.hpCurrent : seed.hpCurrent,
                    hpMax: packet.hpMax !== null ? packet.hpMax : seed.hpMax,
                    passivePerception: packet.passivePerception !== null ? packet.passivePerception : seed.passivePerception,
                    stealthRoll: packet.stealthRoll !== null ? packet.stealthRoll : (seed.stealthRoll ?? null),
                    defences: normalizeDefences(packet.defences)
                };
                if (linkedToken && packet.stealthRoll !== null) linkedToken.stealthRoll = packet.stealthRoll;
                entries.push(nextEntry);
                stageState.selection.entryId = nextEntry.id;
            }
            mutated = true;
            newlyProcessed.push(packet.rollId);
        });

        if (!mutated) return;
        sortInitiativeEntries(draft.initiative.entries);
        if (!draft.initiative.activeEntryId && draft.initiative.entries[0]) {
            draft.initiative.activeEntryId = draft.initiative.entries[0].id;
        }
        const saved = persistSharedVTTSnapshot(draft, {
            reason: 'initiative-queue',
            baseSnapshot
        });
        if (!saved) return;
        sessionState.snapshot = deepClone(saved);
        syncRosterLinkedPlayerPresentation(sessionState.snapshot);
        markProcessedRollIds(newlyProcessed);
        normalizeSelections();
        render();
    };

    const ingestSharedInitiativeSubmissions = async (store) => {
        const collabTransport = getVTTCollabTransport();
        if (!isDM() || !store || !isVTTCollabReady() || !collabTransport) return false;
        const activeCaseId = getActiveCaseId();
        if (sessionState.pendingCaseId || collabTransport.caseId !== activeCaseId || sessionState.stateCaseId !== activeCaseId) return false;
        if (typeof collabTransport.getSnapshot !== 'function' || typeof collabTransport.syncSnapshot !== 'function') return false;

        const storeSnapshot = typeof store.getVTTState === 'function' ? deepClone(store.getVTTState(activeCaseId)) : null;
        const baseSnapshot = deepClone(collabTransport.getSnapshot());
        const incomingEntries = storeSnapshot && storeSnapshot.initiative && Array.isArray(storeSnapshot.initiative.entries)
            ? storeSnapshot.initiative.entries
            : [];
        const nextEntries = baseSnapshot && baseSnapshot.initiative && Array.isArray(baseSnapshot.initiative.entries)
            ? baseSnapshot.initiative.entries
            : [];
        let mutated = false;

        incomingEntries.forEach((incoming) => {
            const submissionId = String(incoming && incoming.submissionId || '').trim();
            const submittedAt = Math.max(0, Math.round(toNumber(incoming && incoming.submittedAt, 0)));
            if (!submissionId || !submittedAt) return;
            const sourceType = String(incoming && incoming.sourceType || '').trim();
            const sourceId = String(incoming && incoming.sourceId || '').trim();
            const idx = nextEntries.findIndex((entry) =>
                String(entry && entry.id || '').trim() === String(incoming && incoming.id || '').trim()
                || !!(sourceType && sourceId
                    && String(entry && entry.sourceType || '').trim() === sourceType
                    && String(entry && entry.sourceId || '').trim() === sourceId)
            );
            const current = idx >= 0 ? nextEntries[idx] : null;
            const currentSubmissionId = String(current && current.submissionId || '').trim();
            const currentSubmittedAt = Math.max(0, Math.round(toNumber(current && current.submittedAt, 0)));
            if (currentSubmissionId === submissionId || currentSubmittedAt > submittedAt) return;

            const merged = {
                ...(current || incoming),
                id: String(current && current.id || incoming.id || buildId('init')).trim(),
                name: incoming.name || (current && current.name) || 'Combatant',
                linkedTokenId: String(current && current.linkedTokenId || incoming.linkedTokenId || '').trim(),
                side: incoming.side || (current && current.side) || 'player',
                imageUrl: incoming.imageUrl || (current && current.imageUrl) || '',
                sourceType: sourceType || (current && current.sourceType) || '',
                sourceId: sourceId || (current && current.sourceId) || '',
                submissionId,
                submittedAt,
                total: incoming.total,
                tie: incoming.tie,
                hpCurrent: incoming.hpCurrent,
                hpMax: incoming.hpMax,
                ac: incoming.ac,
                passivePerception: incoming.passivePerception,
                stealthRoll: incoming.stealthRoll,
                defences: normalizeDefences(incoming.defences),
                reactionUsed: !!(current && current.reactionUsed),
                concentrating: !!(current && current.concentrating),
                hidden: !!(current && current.hidden),
                conditions: Array.isArray(current && current.conditions) ? current.conditions.slice(0, 24) : []
            };
            if (idx >= 0) nextEntries[idx] = merged;
            else nextEntries.push(merged);

            const linkedToken = findTokenByIdAcrossScenes(baseSnapshot, merged.linkedTokenId)
                || (merged.sourceType && merged.sourceId ? findTokenAcrossScenes(baseSnapshot, merged.sourceType, merged.sourceId) : null);
            if (linkedToken) {
                merged.linkedTokenId = linkedToken.id;
                linkedToken.hpCurrent = merged.hpCurrent;
                linkedToken.hpMax = merged.hpMax;
                linkedToken.ac = merged.ac;
                linkedToken.passivePerception = merged.passivePerception;
                linkedToken.stealthRoll = merged.stealthRoll;
                linkedToken.defences = normalizeDefences(merged.defences);
            }
            mutated = true;
        });

        if (!mutated) return false;
        sortInitiativeEntries(nextEntries);
        if (!baseSnapshot.initiative.activeEntryId && nextEntries[0]) baseSnapshot.initiative.activeEntryId = nextEntries[0].id;
        await collabTransport.syncSnapshot(baseSnapshot, {
            baseSnapshot: collabTransport.getSnapshot(),
            flushNow: true,
            reason: 'shared-initiative-submission'
        });
        const currentTransport = getVTTCollabTransport();
        if (activeCaseId !== getActiveCaseId() || !currentTransport || currentTransport.caseId !== activeCaseId) return false;
        sessionState.snapshot = deepClone(currentTransport.getSnapshot());
        sessionState.stateCaseId = activeCaseId;
        normalizeSelections();
        render();
        return true;
    };

    const handleStoreUpdate = (event) => {
        const store = getStore();
        if (!store) return;
        const detail = event && event.detail && typeof event.detail === 'object' ? event.detail : {};
        const activeCaseId = getActiveCaseId();
        if (sessionState.pendingCaseId) return;
        loadRolePreference();
        refreshPlayerImageCache();
        const collabTransport = getVTTCollabTransport();
        if (collabTransport && (collabTransport.caseId !== activeCaseId || collabTransport.roomId !== getVTTCollabRoomId(activeCaseId))) {
            refreshVTTCollabRoomIfNeeded().catch((err) => {
                console.warn('VTT collaboration room refresh failed', err);
            });
            return;
        }
        if (sessionState.initialLoadPending) return;
        if (isVTTCollabReady()) {
            if (isDM()) {
                ingestSharedInitiativeSubmissions(store).catch((err) => {
                    console.warn('Failed ingesting shared initiative submission into live VTT', err);
                });
            }
            if (sessionState.snapshot && syncRosterLinkedPlayerPresentation(sessionState.snapshot)) {
                if (isDM() && collabTransport && typeof collabTransport.syncSnapshot === 'function') {
                    const rosterPinnedSnapshot = deepClone(sessionState.snapshot);
                    const baseSnapshot = typeof collabTransport.getSnapshot === 'function'
                        ? collabTransport.getSnapshot()
                        : null;
                    Promise.resolve(collabTransport.syncSnapshot(rosterPinnedSnapshot, {
                        baseSnapshot,
                        flushNow: true,
                        reason: 'roster-player-presentation-sync'
                    })).catch((err) => {
                        console.warn('Failed pinning roster identity into live VTT', err);
                    });
                }
                normalizeSelections();
                render();
            }
            return;
        }
        if (stageState.pointer.drag) {
            if (syncRosterLinkedPlayerPresentation(sessionState.snapshot)) {
                normalizeSelections();
                render();
            }
            return;
        }
        const nextSnapshot = ensureRosterLinkedPlayerPresentationPersisted(
            readSharedVTTSnapshot({ syncRosterPresentation: false }) || deepClone(store.getVTTState(activeCaseId)),
            { reason: 'roster-player-presentation-sync' }
        ).snapshot;
        queueRemoteTweensFromSnapshots(sessionState.snapshot, nextSnapshot);
        sessionState.snapshot = nextSnapshot;
        sessionState.stateCaseId = activeCaseId;
        normalizeSelections();
        render();
    };

    const handleStorageEvent = (event) => {
        if (!event) return;
        if (event.key === C.TRACKER_INITIATIVE_QUEUE_KEY) {
            processInitiativeQueue();
            return;
        }
        if (event.key === getUIPrefsStorageKey()) {
            loadUIPreferences({ preserveActivePanel: true });
            return;
        }
        if (event.key && event.key === getRolePrefsStorageKey()) {
            const stageCenter = captureVTTStageCenter();
            loadRolePreference();
            const allowedPanel = getAllowedVTTPanel(uiRuntime.preferences.activeVttPanel);
            if (!allowedPanel) {
                uiRuntime.preferences.activeVttPanel = '';
                activeVTTPanelOpener = null;
            }
            if (!isDM()) uiRuntime.menus.toolsOpen = false;
            if (!isPlayer()) uiRuntime.playerRoll.menuOpen = false;
            render();
            if (allowedPanel && (!activeVTTPanelOpener || activeVTTPanelOpener.getClientRects().length === 0)) {
                activeVTTPanelOpener = findVisibleVTTPanelLauncher(allowedPanel);
            }
            restoreVTTStageCenterAfterLayout(stageCenter);
            return;
        }
        if (event.key === C.SHEET_STORAGE_KEY) {
            render();
        }
    };

    const vttStageInputFactory = window.RTF_VTT_STAGE_INPUT;
    if (!vttStageInputFactory || typeof vttStageInputFactory.create !== 'function') {
        throw new Error('VTT stage input module failed to load.');
    }
    const vttStageInputRuntime = runtimeState.ports.stageInput;
    resources.stageInput = vttStageInputFactory.create({
        runtime: vttStageInputRuntime,
        api: {
            PING_VARIANT_OPTIONS: C.PING_VARIANT_OPTIONS,
            activateEvidenceNoteSelection,
            activateTokenSelection,
            addFogRevealBurst,
            applyFogMaskMutation,
            applyPendingRemoteVTTSnapshot,
            applyWorldTransform,
            beginSpawnDrag,
            buildAreaTemplate,
            buildEvidenceNoteFromWorldPoints,
            buildFogMaskFromWorldPoints,
            buildRemoteTokenTweenKey,
            canMutateLiveVTTState,
            canRoleMoveToken,
            canUseSharedPlayerTools,
            cancelAskRollPickMode,
            clampZoom,
            clearSpawnDrag,
            clearTemplatePlacementState,
            clearTokenPortraitPreview,
            closeActiveVTTPanel,
            closeDMUnlockModal,
            closeInitiativeDetail,
            closeNPCRollPopover,
            closeNPCSearch,
            closeNavMenu,
            closeQuickSpawnMenu,
            closeSheetActionPopover,
            closeStageContextMenu,
            closeTokenInspectorPopover,
            closeToolsMenu,
            closeViewMenu,
            evaluateProximityTriggers,
            getActiveScene,
            getEvidenceNoteById,
            getLocalPlayerFocusContext,
            getPingVariantOptions,
            getSceneCellPx,
            getTemplateAngleFromWorldPoint,
            getTemplateById,
            getTokenById,
            getTokenCenterInCells,
            isClientPointInsideStage,
            isDM,
            isDMUnlockModalOpen,
            isEvidenceNotePin,
            isRosterSelfModalOpen,
            markTokenVisualEffect,
            moveSelectedTokenByCells,
            normalizeAngleDeg,
            normalizeTokenCoordinate,
            openEvidenceNoteInspectorPopover,
            openInitiativeDetail,
            openStageContextMenu,
            openTokenInspectorPopover,
            queueSharedPing,
            queueSharedTransientTemplate,
            rememberRecentLocalDragDrop,
            remoteTokenTweens: resources.remoteTokenTweens,
            render,
            renderInitiativeDetail,
            renderInitiativeList,
            renderNPCRollPopover,
            renderProximityPrompt,
            renderSheetActionPopover,
            renderSpawnGhost,
            renderStage,
            renderStageContextMenu,
            renderTokenInspector,
            renderTokenInspectorPopover,
            renderToolsMenu,
            scaleForZoom,
            screenToWorld,
            setToolMode,
            setZoomAtPoint,
            showTokenPortraitPreview,
            snapTokenToGrid,
            snapWorldPointToTemplateAnchor,
            spawnTokenFromDescriptor,
            suppressLocalDragTween,
            syncDraggedState,
            toNumber,
            withDraft
        },
        dom: {
            body: dom.body,
            initiativeListEl: dom.initiativeListEl,
            noteLayerEl: dom.noteLayerEl,
            stageEl: dom.stageEl
        },
        config: {
            STAGE_TOOL_DOUBLE_PRESS_PX: C.STAGE_TOOL_DOUBLE_PRESS_PX,
            TEMPLATE_HOLD_PERSIST_MS: C.TEMPLATE_HOLD_PERSIST_MS,
            TEMPLATE_KIND_CIRCLE: C.TEMPLATE_KIND_CIRCLE,
            TEMPLATE_KIND_CONE: C.TEMPLATE_KIND_CONE,
            TOKEN_CLICK_MOVE_PX: C.TOKEN_CLICK_MOVE_PX,
            TOKEN_DOUBLE_CLICK_MS: C.TOKEN_DOUBLE_CLICK_MS,
            TOKEN_DROP_PULSE_MS: C.TOKEN_DROP_PULSE_MS,
            TOOL_MODE_CIRCLE: C.TOOL_MODE_CIRCLE,
            TOOL_MODE_CONE: C.TOOL_MODE_CONE,
            TOOL_MODE_FOG: C.TOOL_MODE_FOG,
            TOOL_MODE_FOG_REMOVE: C.TOOL_MODE_FOG_REMOVE,
            TOOL_MODE_NAVIGATE: C.TOOL_MODE_NAVIGATE,
            TOOL_MODE_NOTE: C.TOOL_MODE_NOTE,
            TOOL_MODE_PING: C.TOOL_MODE_PING,
            TOOL_MODE_RULER: C.TOOL_MODE_RULER,
            TOUCH_CONTEXT_HOLD_MS: C.TOUCH_CONTEXT_HOLD_MS,
            TOUCH_CONTEXT_MOVE_PX: C.TOUCH_CONTEXT_MOVE_PX
        }
    });
    const handleDocumentKeyDown = (...args) => requireStageInput().handleDocumentKeyDown(...args);
    const handleDocumentPointerDown = (...args) => requireStageInput().handleDocumentPointerDown(...args);
    const handleInitiativeContextMenu = (...args) => requireStageInput().handleInitiativeContextMenu(...args);
    const handlePointerMove = (...args) => requireStageInput().handlePointerMove(...args);
    const handlePointerUp = (...args) => requireStageInput().handlePointerUp(...args);
    const handleStageContextMenu = (...args) => requireStageInput().handleStageContextMenu(...args);
    const handleStageDoubleClick = (...args) => requireStageInput().handleStageDoubleClick(...args);
    const handleStageDragStart = (...args) => requireStageInput().handleStageDragStart(...args);
    const handleStagePointerDown = (...args) => requireStageInput().handleStagePointerDown(...args);
    const handleStageWheel = (...args) => requireStageInput().handleStageWheel(...args);

    const handleDocumentActionKeyDown = (event) => {
        if (event.defaultPrevented || (event.key !== 'Enter' && event.key !== ' ')) return;
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        if (target.matches('button, a[href], input, select, textarea, summary')) return;
        const actionEl = target.closest('[role="button"][data-action], .vtt-entry[data-action]');
        if (!(actionEl instanceof HTMLElement)) return;
        const action = String(actionEl.dataset.action || '').trim();
        const id = String(actionEl.dataset.id || '').trim();
        event.preventDefault();
        actionEl.click();
        if (id && (action === 'select-entry' || action === 'select-token' || action === 'select-evidence-note')) {
            window.requestAnimationFrame(() => {
                if (document.activeElement && document.activeElement !== document.body && document.contains(document.activeElement)) return;
                const escapedAction = window.CSS && typeof window.CSS.escape === 'function' ? window.CSS.escape(action) : action;
                const escapedId = window.CSS && typeof window.CSS.escape === 'function' ? window.CSS.escape(id) : id.replace(/"/g, '\\"');
                const nextTarget = document.querySelector(`[data-action="${escapedAction}"][data-id="${escapedId}"]`);
                if (nextTarget && typeof nextTarget.focus === 'function') nextTarget.focus();
            });
        }
    };

    const handleCaseBoardKeyDown = (event) => {
        if (event.defaultPrevented || event.key !== 'Escape') return;
        if (!dom.caseBoardModalEl || dom.caseBoardModalEl.hidden) return;
        if (closeVTTCaseBoard()) {
            event.preventDefault();
            event.stopPropagation();
        }
    };

    const bindEvents = () => {
        bindSyncChipActions();
        bindAccentControls();
        document.addEventListener('click', (event) => {
            const actionEl = event.target instanceof Element ? event.target.closest('[data-action]') : null;
            if (!actionEl) return;
            handleAction(actionEl);
        });
        document.addEventListener('pointerdown', handleDocumentPointerDown);
        document.addEventListener('keydown', handleVTTModalFocusTrap, true);
        document.addEventListener('keydown', handleCaseBoardKeyDown, true);
        document.addEventListener('keydown', handleDocumentActionKeyDown);
        document.addEventListener('keydown', handleDocumentKeyDown);
        document.addEventListener('input', handleFieldChange);
        document.addEventListener('change', handleFieldChange);
        if (dom.sceneMusicEditorEl) {
            dom.sceneMusicEditorEl.addEventListener('input', handleSceneMusicEditorInput, true);
            dom.sceneMusicEditorEl.addEventListener('change', handleSceneMusicEditorChange, true);
            dom.sceneMusicEditorEl.addEventListener('keydown', handleSceneMusicEditorKeyDown, true);
        }
        if (dom.dmUnlockFormEl) {
            dom.dmUnlockFormEl.addEventListener('submit', (event) => {
                event.preventDefault();
                submitDMUnlockModal();
            });
        }
        if (dom.npcSearchInputEl) dom.npcSearchInputEl.addEventListener('input', handleNPCSearchInput);
        if (dom.mapImageEl) dom.mapImageEl.draggable = false;
        if (dom.stageEl) dom.stageEl.addEventListener('pointerdown', handleStagePointerDown);
        if (dom.stageEl) dom.stageEl.addEventListener('wheel', handleStageWheel, { passive: false });
        if (dom.stageEl) dom.stageEl.addEventListener('dragstart', handleStageDragStart);
        if (dom.stageEl) dom.stageEl.addEventListener('contextmenu', handleStageContextMenu);
        if (dom.stageEl) dom.stageEl.addEventListener('dblclick', handleStageDoubleClick);
        if (dom.stageContextMenuEl) {
            dom.stageContextMenuEl.addEventListener('toggle', () => {
                window.requestAnimationFrame(positionStageContextMenu);
            }, true);
        }
        if (dom.initiativeListEl) dom.initiativeListEl.addEventListener('contextmenu', handleInitiativeContextMenu);
        document.addEventListener('pointermove', handlePointerMove);
        document.addEventListener('pointerup', handlePointerUp);
        document.addEventListener('pointercancel', handlePointerUp);
        window.addEventListener(C.STORE_UPDATED_EVENT, handleStoreUpdate);
        window.addEventListener('rtf-vtt-black-moon-howl', handleRemoteBlackMoonHowl);
        window.addEventListener('storage', handleStorageEvent);
        window.addEventListener('resize', () => {
            if (stageState.view.fitOnNextMapLoad) {
                fitViewToWorld();
                renderQuickSpawnMenu();
                positionStageContextMenu();
                positionNPCSearchPopover();
                positionTokenInspectorPopover();
                positionSheetActionPopover();
                positionNPCRollPopover();
                positionInitiativeDetail();
                return;
            }
            applyWorldTransform();
            renderQuickSpawnMenu();
            renderSpawnGhost();
            positionStageContextMenu();
            positionNPCSearchPopover();
            positionTokenInspectorPopover();
            positionSheetActionPopover();
            positionNPCRollPopover();
            positionInitiativeDetail();
        });
        window.addEventListener('scroll', positionNPCSearchPopover, { passive: true });
        window.addEventListener('scroll', positionTokenInspectorPopover, { passive: true });
        window.addEventListener('scroll', positionSheetActionPopover, { passive: true });
        window.addEventListener('scroll', positionNPCRollPopover, { passive: true });
        window.addEventListener('scroll', positionStageContextMenu, { passive: true });
        if (dom.sidebarEl) dom.sidebarEl.addEventListener('scroll', positionNPCSearchPopover, { passive: true });
    };

    const init = async () => {
        const store = getStore();
        if (!store) {
            sessionState.initialLoadPending = false;
            if (dom.syncChipEl) dom.syncChipEl.textContent = 'Unavailable';
            return;
        }

        try {
            await ensureVTTSessionController();
        } catch (err) {
            sessionState.initialLoadPending = false;
            if (dom.syncChipEl) dom.syncChipEl.textContent = 'Unavailable';
            reportVTTError('vtt-session-init', 'module', err);
            return;
        }

        bindEvents();
        loadRolePreference();
        loadUIPreferences();
        capturePlayerImagesAtLoad();
        const initialCaseId = getActiveCaseId();
        const initialTransitionId = sessionState.caseTransitionId;
        const initialSnapshot = await loadInitialVTTSnapshot(store, initialCaseId);
        if (initialCaseId !== getActiveCaseId() || initialTransitionId !== sessionState.caseTransitionId) return;
        if (!initialSnapshot) {
            sessionState.snapshot = null;
            sessionState.stateCaseId = initialCaseId;
            sessionState.initialLoadPending = true;
            normalizeSelections();
            if (typeof store.onSyncStatus === 'function') {
                resources.unsubscribeSyncStatus = store.onSyncStatus(handleVTTStoreSyncStatus);
            } else {
                updateStoreSyncChip({ connected: false });
            }
            window.setTimeout(() => {
                recoverInitialVTTRoomIfNeeded().catch((err) => {
                    console.warn('Initial VTT room timed recovery failed', err);
                });
            }, 500);
            return;
        }

        const fogMigrated = coerceSnapshotFogToCellMasks(initialSnapshot);

        let initialSynced = ensureRosterLinkedPlayerPresentationPersisted(initialSnapshot, {
            persist: isDM(),
            reason: fogMigrated ? 'fog-mask-migration' : 'roster-player-presentation-sync'
        }).snapshot;

        if (fogMigrated && isDM()) {
            const saved = persistSharedVTTSnapshot(initialSynced, {
                reason: 'fog-mask-migration',
                baseSnapshot: null
            });
            initialSynced = deepClone(saved || initialSynced);
        }

        sessionState.snapshot = initialSynced;
        sessionState.stateCaseId = initialCaseId;
        normalizeSelections();
        sessionState.initialLoadPending = false;
        render();
        initVTTCollabWithRetry().catch((err) => {
            console.warn('VTT collaboration init failed', err);
        }).finally(() => {
            processInitiativeQueue();
        });

        if (typeof store.onSyncStatus === 'function') {
            resources.unsubscribeSyncStatus = store.onSyncStatus(handleVTTStoreSyncStatus);
        } else {
            updateStoreSyncChip({ connected: false });
        }

        fitViewToWorld();
    };

    init();
})();
