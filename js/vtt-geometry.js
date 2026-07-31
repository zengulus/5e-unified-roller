(function (root, factory) {
    const api = factory();

    if (typeof module === 'object' && module.exports) {
        module.exports = api;
        return;
    }

    root.RTF_VTT_GEOMETRY = api;
}(typeof globalThis !== 'undefined' ? globalThis : window, function () {
    'use strict';

    const REQUIRED_DEPENDENCIES = Object.freeze([
        'buildId',
        'clamp',
        'escapeHtml',
        'getHexColorRgbString',
        'getLocalRole',
        'getLocalToolSizeCells',
        'getSceneCellPx',
        'getTokenStealthRoll',
        'getVisionPassivePerception',
        'getVTTState',
        'getWorldSize',
        'getWorldSizeForScene',
        'normalizeAngleDeg',
        'normalizeGridCoordinate',
        'normalizeProximityPromptStates',
        'normalizeProximityTriggers',
        'normalizeTokenCoordinate',
        'normalizeToolSizeCells',
        'normalizeWorldCoordinate',
        'snapWorldPointToTemplateAnchor',
        'toNumber'
    ]);

    const DEFAULT_EVIDENCE_NOTE_CATEGORY_META = Object.freeze({
        evidence: { label: 'Evidence', shortLabel: 'E', color: '#39b66b', defaultTitle: 'Evidence Zone' },
        clue: { label: 'Clue', shortLabel: '?', color: '#58d4f7', defaultTitle: 'Clue Pin' },
        poi: { label: 'Point Of Interest', shortLabel: 'P', color: '#9b7cff', defaultTitle: 'Point Of Interest' },
        danger: { label: 'Danger', shortLabel: '!', color: '#d85b5b', defaultTitle: 'Danger Zone' },
        objective: { label: 'Objective', shortLabel: 'O', color: '#f0b357', defaultTitle: 'Objective Zone' },
        exit: { label: 'Exit', shortLabel: 'X', color: '#70d98b', defaultTitle: 'Exit' },
        sound: { label: 'Sound', shortLabel: '~', color: '#d6b4ff', defaultTitle: 'Sound Source' },
        cover: { label: 'Cover', shortLabel: 'C', color: '#7aa2f7', defaultTitle: 'Cover' },
        difficult: { label: 'Difficult Terrain', shortLabel: 'D', color: '#c9a45f', defaultTitle: 'Difficult Terrain' },
        obscured: { label: 'Obscured', shortLabel: 'V', color: '#8aa0aa', defaultTitle: 'Obscured Area' },
        hazard: { label: 'Hazard', shortLabel: 'H', color: '#f07178', defaultTitle: 'Hazard' },
        safe: { label: 'Safe Zone', shortLabel: '+', color: '#5fd38d', defaultTitle: 'Safe Zone' },
        info: { label: 'Info', shortLabel: 'i', color: '#4f8dff', defaultTitle: 'Info Zone' },
        other: { label: 'Other', shortLabel: '?', color: '#8f9aa8', defaultTitle: 'Zone' }
    });

    const validateDependencies = (deps) => {
        if (!deps || typeof deps !== 'object') {
            throw new TypeError('RTF_VTT_GEOMETRY.create requires a dependency object.');
        }

        const missing = REQUIRED_DEPENDENCIES.filter((name) => typeof deps[name] !== 'function');
        if (missing.length) {
            throw new TypeError(`RTF_VTT_GEOMETRY.create is missing function dependencies: ${missing.join(', ')}`);
        }
    };

    const create = (deps) => {
        validateDependencies(deps);

        const {
            buildId,
            clamp,
            escapeHtml,
            getHexColorRgbString,
            getLocalRole,
            getLocalToolSizeCells,
            getSceneCellPx,
            getTokenStealthRoll,
            getVisionPassivePerception,
            getVTTState,
            getWorldSize,
            getWorldSizeForScene,
            normalizeAngleDeg,
            normalizeGridCoordinate,
            normalizeProximityPromptStates,
            normalizeProximityTriggers,
            normalizeTokenCoordinate,
            normalizeToolSizeCells,
            normalizeWorldCoordinate,
            snapWorldPointToTemplateAnchor,
            toNumber
        } = deps;

        const config = deps.config && typeof deps.config === 'object' ? deps.config : {};
        const DEFAULT_WORLD_SIZE = config.defaultWorldSize && typeof config.defaultWorldSize === 'object'
            ? config.defaultWorldSize
            : { width: 2400, height: 1600 };
        const DEFAULT_TOOL_SIZE_CELLS = toNumber(config.defaultToolSizeCells, 4);
        const TEMPLATE_KIND_CIRCLE = String(config.templateKindCircle || 'circle');
        const TEMPLATE_KIND_CONE = String(config.templateKindCone || 'cone');
        const FOG_EDGE_OVERDRAW_PX = toNumber(config.fogEdgeOverdrawPx, 0);
        const FOG_EDGE_WIBBLE_PX = toNumber(config.fogEdgeWibblePx, 3);
        const FOG_EDGE_CORNER_RADIUS_PX = toNumber(config.fogEdgeCornerRadiusPx, 10);
        const DEFAULT_EVIDENCE_NOTE_CATEGORY = String(config.defaultEvidenceNoteCategory || 'evidence');
        const DEFAULT_EVIDENCE_NOTE_COLOR = String(config.defaultEvidenceNoteColor || '#39b66b');
        const EVIDENCE_NOTE_SHAPE_PIN = String(config.evidenceNoteShapePin || 'pin');
        const EVIDENCE_NOTE_SHAPE_ZONE = String(config.evidenceNoteShapeZone || 'zone');
        const EVIDENCE_NOTE_SHAPE_OPTIONS = Array.isArray(config.evidenceNoteShapeOptions)
            ? config.evidenceNoteShapeOptions
            : [EVIDENCE_NOTE_SHAPE_PIN, EVIDENCE_NOTE_SHAPE_ZONE];
        const EVIDENCE_NOTE_CATEGORY_META = config.evidenceNoteCategoryMeta
            && typeof config.evidenceNoteCategoryMeta === 'object'
            ? config.evidenceNoteCategoryMeta
            : DEFAULT_EVIDENCE_NOTE_CATEGORY_META;
        const STEALTH_STATUS_DETECTED = String(config.stealthStatusDetected || 'detected');
        const STEALTH_STATUS_UNSEEN = String(config.stealthStatusUnseen || 'unseen');

        const getTokenCenterInCells = (token) => ({
            x: normalizeTokenCoordinate(toNumber(token && token.x, 0) + Math.max(1, toNumber(token && token.w, 1)) / 2, 0.5),
            y: normalizeTokenCoordinate(toNumber(token && token.y, 0) + Math.max(1, toNumber(token && token.h, 1)) / 2, 0.5)
        });

        const getTokenFootprintPoints = (token) => {
            if (!token) return [];
            const width = Math.max(1, toNumber(token.w, 1));
            const height = Math.max(1, toNumber(token.h, 1));
            const x = toNumber(token.x, 0);
            const y = toNumber(token.y, 0);
            return [
                { x: x + width / 2, y: y + height / 2 },
                { x, y },
                { x: x + width / 2, y },
                { x: x + width, y },
                { x, y: y + height / 2 },
                { x: x + width, y: y + height / 2 },
                { x, y: y + height },
                { x: x + width / 2, y: y + height },
                { x: x + width, y: y + height }
            ];
        };

        const getTemplateWorldPoint = (scene, point) => {
            const cellPx = getSceneCellPx(scene);
            const offsetX = toNumber(scene && scene.grid && scene.grid.offsetX, 0);
            const offsetY = toNumber(scene && scene.grid && scene.grid.offsetY, 0);
            return {
                x: offsetX + toNumber(point && point.x, 0) * cellPx,
                y: offsetY + toNumber(point && point.y, 0) * cellPx
            };
        };

        const getPointAtAngle = (originX, originY, radius, angleDeg) => {
            const radians = normalizeAngleDeg(angleDeg) * Math.PI / 180;
            return {
                x: originX + Math.cos(radians) * radius,
                y: originY + Math.sin(radians) * radius
            };
        };

        const getAreaTemplateWorldGeometry = (template, scene) => {
            if (!template || !scene) return null;
            const sizePx = Math.max(1, normalizeToolSizeCells(template.sizeCells, DEFAULT_TOOL_SIZE_CELLS) * getSceneCellPx(scene));
            const anchor = getTemplateWorldPoint(scene, template);
            if (String(template.kind || TEMPLATE_KIND_CIRCLE) === TEMPLATE_KIND_CONE) {
                const halfWidth = sizePx / 2;
                return {
                    kind: TEMPLATE_KIND_CONE,
                    left: anchor.x,
                    top: anchor.y - halfWidth,
                    width: sizePx,
                    height: halfWidth * 2,
                    rotationDeg: normalizeAngleDeg(template.angleDeg)
                };
            }
            return {
                kind: TEMPLATE_KIND_CIRCLE,
                left: anchor.x - sizePx,
                top: anchor.y - sizePx,
                width: sizePx * 2,
                height: sizePx * 2,
                rotationDeg: 0
            };
        };


        const buildAreaTemplate = (kind, scene, worldPoint, options = {}) => {
            if (!scene || !worldPoint) return null;
            const anchor = snapWorldPointToTemplateAnchor(scene, worldPoint);
            return {
                id: buildId('template'),
                kind: kind === TEMPLATE_KIND_CONE ? TEMPLATE_KIND_CONE : TEMPLATE_KIND_CIRCLE,
                x: anchor.x,
                y: anchor.y,
                sizeCells: normalizeToolSizeCells(options.sizeCells, getLocalToolSizeCells()),
                angleDeg: normalizeAngleDeg(options.angleDeg)
            };
        };

        const getRenderableSceneTemplates = (scene, now = Date.now()) => {
            if (!scene || !Array.isArray(scene.templates)) return [];
            return scene.templates.filter((template) => toNumber(template && template.expiresAt, 0) > now);
        };

        const getRenderableScenePings = (scene, now = Date.now()) => {
            if (!scene || !Array.isArray(scene.pings)) return [];
            return scene.pings.filter((ping) => toNumber(ping && ping.expiresAt, 0) > now);
        };

        const getTemplateAngleFromWorldPoint = (scene, template, worldPoint) => {
            if (!scene || !template || !worldPoint) return 0;
            const origin = getTemplateWorldPoint(scene, template);
            return normalizeAngleDeg(Math.atan2(worldPoint.y - origin.y, worldPoint.x - origin.x) * 180 / Math.PI);
        };

        const snapWorldPointToFogCorner = (scene, worldPoint) => {
            if (!scene || !worldPoint) return { x: 0, y: 0 };
            const cellPx = getSceneCellPx(scene);
            const offsetX = toNumber(scene && scene.grid && scene.grid.offsetX, 0);
            const offsetY = toNumber(scene && scene.grid && scene.grid.offsetY, 0);
            return {
                x: Math.round((toNumber(worldPoint.x, offsetX) - offsetX) / cellPx) * cellPx + offsetX,
                y: Math.round((toNumber(worldPoint.y, offsetY) - offsetY) / cellPx) * cellPx + offsetY
            };
        };

        const getFogCellAtWorldPoint = (scene, worldPoint) => {
            const cellPx = getSceneCellPx(scene);
            const offsetX = toNumber(scene && scene.grid && scene.grid.offsetX, 0);
            const offsetY = toNumber(scene && scene.grid && scene.grid.offsetY, 0);
            return {
                col: Math.floor((toNumber(worldPoint && worldPoint.x, offsetX) - offsetX) / cellPx),
                row: Math.floor((toNumber(worldPoint && worldPoint.y, offsetY) - offsetY) / cellPx)
            };
        };

        const buildFogMaskFromWorldPoints = (scene, startWorldPoint, endWorldPoint, id = buildId('fog')) => {
            if (!scene || !startWorldPoint || !endWorldPoint) return null;
            const cellPx = getSceneCellPx(scene);
            const offsetX = toNumber(scene && scene.grid && scene.grid.offsetX, 0);
            const offsetY = toNumber(scene && scene.grid && scene.grid.offsetY, 0);
            const start = getFogCellAtWorldPoint(scene, startWorldPoint);
            const end = getFogCellAtWorldPoint(scene, endWorldPoint);
            const leftCol = Math.min(start.col, end.col);
            const topRow = Math.min(start.row, end.row);
            const widthCells = Math.max(1, Math.abs(end.col - start.col) + 1);
            const heightCells = Math.max(1, Math.abs(end.row - start.row) + 1);
            return {
                id: String(id || buildId('fog')).trim() || buildId('fog'),
                x: Math.round(offsetX + leftCol * cellPx),
                y: Math.round(offsetY + topRow * cellPx),
                w: Math.max(1, Math.round(widthCells * cellPx)),
                h: Math.max(1, Math.round(heightCells * cellPx))
            };
        };

        const buildFogCellKey = (col, row) => `${Math.round(toNumber(col, 0))},${Math.round(toNumber(row, 0))}`;
        const buildFogCellId = (col, row) => `fog_${Math.round(toNumber(col, 0))}_${Math.round(toNumber(row, 0))}`;

        const hashStringToUnit = (value = '') => {
            let hash = 2166136261;
            String(value || '').split('').forEach((char) => {
                hash ^= char.charCodeAt(0);
                hash = Math.imul(hash, 16777619);
            });
            return (hash >>> 0) / 4294967295;
        };

        const buildFogPointKey = (x, y) => `${Math.round(toNumber(x, 0))},${Math.round(toNumber(y, 0))}`;

        const getFogBoundaryDirectionIndex = (edge) => {
            const dx = Math.sign(toNumber(edge.ex, 0) - toNumber(edge.sx, 0));
            const dy = Math.sign(toNumber(edge.ey, 0) - toNumber(edge.sy, 0));
            if (dx > 0) return 0;
            if (dy > 0) return 1;
            if (dx < 0) return 2;
            return 3;
        };

        const pickNextFogBoundaryEdge = (candidates, previousEdge) => {
            const unused = candidates.filter((edge) => !edge.used);
            if (!unused.length) return null;
            if (!previousEdge) return unused[0];
            const previousDir = getFogBoundaryDirectionIndex(previousEdge);
            return unused
                .map((edge) => {
                    const nextDir = getFogBoundaryDirectionIndex(edge);
                    const turn = (nextDir - previousDir + 4) % 4;
                    const priority = turn === 1 ? 0 : turn === 0 ? 1 : turn === 3 ? 2 : 3;
                    return { edge, priority };
                })
                .sort((left, right) => left.priority - right.priority)[0].edge;
        };

        const parseFogCellKey = (key) => {
            const parts = String(key || '').split(',');
            return {
                col: Math.round(toNumber(parts[0], 0)),
                row: Math.round(toNumber(parts[1], 0))
            };
        };

        const buildFogBoundaryLoops = (cellSet) => {
            if (!(cellSet instanceof Set) || !cellSet.size) return [];
            const edges = [];
            cellSet.forEach((key) => {
                const cell = parseFogCellKey(key);
                const col = cell.col;
                const row = cell.row;
                if (!cellSet.has(buildFogCellKey(col, row - 1))) {
                    edges.push({ sx: col, sy: row, ex: col + 1, ey: row });
                }
                if (!cellSet.has(buildFogCellKey(col + 1, row))) {
                    edges.push({ sx: col + 1, sy: row, ex: col + 1, ey: row + 1 });
                }
                if (!cellSet.has(buildFogCellKey(col, row + 1))) {
                    edges.push({ sx: col + 1, sy: row + 1, ex: col, ey: row + 1 });
                }
                if (!cellSet.has(buildFogCellKey(col - 1, row))) {
                    edges.push({ sx: col, sy: row + 1, ex: col, ey: row });
                }
            });

            const outgoing = new Map();
            edges.forEach((edge) => {
                edge.used = false;
                const startKey = buildFogPointKey(edge.sx, edge.sy);
                if (!outgoing.has(startKey)) outgoing.set(startKey, []);
                outgoing.get(startKey).push(edge);
            });

            const loops = [];
            edges.forEach((firstEdge) => {
                if (firstEdge.used) return;
                const loop = [{ x: firstEdge.sx, y: firstEdge.sy }];
                let edge = firstEdge;
                let guard = 0;
                while (edge && !edge.used && guard < edges.length + 8) {
                    guard += 1;
                    edge.used = true;
                    loop.push({ x: edge.ex, y: edge.ey });
                    const nextKey = buildFogPointKey(edge.ex, edge.ey);
                    const candidates = outgoing.get(nextKey) || [];
                    edge = pickNextFogBoundaryEdge(candidates, edge);
                    if (edge && buildFogPointKey(edge.sx, edge.sy) === buildFogPointKey(loop[0].x, loop[0].y) && edge.used) {
                        break;
                    }
                }
                if (loop.length >= 4) {
                    const last = loop[loop.length - 1];
                    const first = loop[0];
                    if (buildFogPointKey(last.x, last.y) === buildFogPointKey(first.x, first.y)) loop.pop();
                    if (loop.length >= 3) loops.push(loop);
                }
            });
            return loops;
        };

        const getWibbledFogWorldPoint = (scene, point, phaseOffset = 0) => {
            const cellPx = getSceneCellPx(scene);
            const offsetX = toNumber(scene && scene.grid && scene.grid.offsetX, 0);
            const offsetY = toNumber(scene && scene.grid && scene.grid.offsetY, 0);
            const seed = `${point.x}:${point.y}`;
            const unitA = hashStringToUnit(`${seed}:x`);
            const unitB = hashStringToUnit(`${seed}:y`);
            const wobbleX = Math.sin(unitA * Math.PI * 2 + phaseOffset) * FOG_EDGE_WIBBLE_PX
                + Math.sin(unitB * Math.PI * 3.3 - phaseOffset * 0.7) * FOG_EDGE_WIBBLE_PX * 0.35;
            const wobbleY = Math.sin(unitB * Math.PI * 2 + phaseOffset * 0.91) * FOG_EDGE_WIBBLE_PX
                + Math.sin(unitA * Math.PI * 3.1 - phaseOffset * 0.53) * FOG_EDGE_WIBBLE_PX * 0.35;
            return {
                x: offsetX + toNumber(point.x, 0) * cellPx + wobbleX,
                y: offsetY + toNumber(point.y, 0) * cellPx + wobbleY
            };
        };

        const getDistanceBetweenPoints = (a, b) => {
            const dx = toNumber(b && b.x, 0) - toNumber(a && a.x, 0);
            const dy = toNumber(b && b.y, 0) - toNumber(a && a.y, 0);
            return Math.sqrt(dx * dx + dy * dy);
        };

        const getPointToward = (from, to, distance) => {
            const total = getDistanceBetweenPoints(from, to);
            if (!Number.isFinite(total) || total <= 0.001) return { x: from.x, y: from.y };
            const ratio = clamp(distance / total, 0, 1);
            return {
                x: from.x + (to.x - from.x) * ratio,
                y: from.y + (to.y - from.y) * ratio
            };
        };

        const buildRoundedFogLoopPath = (scene, loop, phaseOffset = 0) => {
            if (!scene || !Array.isArray(loop) || loop.length < 3) return '';
            const points = loop.map((point) => getWibbledFogWorldPoint(scene, point, phaseOffset));
            const cellPx = getSceneCellPx(scene);
            const baseRadius = Math.min(FOG_EDGE_CORNER_RADIUS_PX, Math.max(1, cellPx * 0.45));
            const corners = points.map((point, idx) => {
                const previous = points[(idx - 1 + points.length) % points.length];
                const next = points[(idx + 1) % points.length];
                const previousDistance = getDistanceBetweenPoints(point, previous);
                const nextDistance = getDistanceBetweenPoints(point, next);
                const radius = Math.min(baseRadius, previousDistance / 2, nextDistance / 2);
                return {
                    point,
                    entry: getPointToward(point, previous, radius),
                    exit: getPointToward(point, next, radius)
                };
            });
            const commands = [`M ${corners[0].exit.x.toFixed(2)} ${corners[0].exit.y.toFixed(2)}`];
            for (let idx = 1; idx < corners.length; idx += 1) {
                const corner = corners[idx];
                commands.push(`L ${corner.entry.x.toFixed(2)} ${corner.entry.y.toFixed(2)}`);
                commands.push(`Q ${corner.point.x.toFixed(2)} ${corner.point.y.toFixed(2)} ${corner.exit.x.toFixed(2)} ${corner.exit.y.toFixed(2)}`);
            }
            commands.push(`L ${corners[0].entry.x.toFixed(2)} ${corners[0].entry.y.toFixed(2)}`);
            commands.push(`Q ${corners[0].point.x.toFixed(2)} ${corners[0].point.y.toFixed(2)} ${corners[0].exit.x.toFixed(2)} ${corners[0].exit.y.toFixed(2)}`);
            commands.push('Z');
            return commands.join(' ');
        };

        const buildFogBoundaryPath = (scene, cellSet, phaseOffset = 0) => {
            if (!scene || !(cellSet instanceof Set) || !cellSet.size) return '';
            return buildFogBoundaryLoops(cellSet)
                .map((loop) => buildRoundedFogLoopPath(scene, loop, phaseOffset))
                .filter(Boolean)
                .join(' ');
        };

        const buildFogTextureMaskUrl = (path, width, height) => {
            const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none"><path d="${path}" fill="white" fill-rule="evenodd"/></svg>`;
            return `data:image/svg+xml,${encodeURIComponent(svg)}`;
        };

        const buildFogEdgeMarkup = (scene, cellSet) => {
            if (!scene || !(cellSet instanceof Set) || !cellSet.size) return '';
            const worldSize = getWorldSize();
            const width = Math.max(1, worldSize.width || DEFAULT_WORLD_SIZE.width);
            const height = Math.max(1, worldSize.height || DEFAULT_WORLD_SIZE.height);
            const pathA = buildFogBoundaryPath(scene, cellSet, 0);
            if (!pathA) return '';
            const textureMaskUrl = buildFogTextureMaskUrl(pathA, width, height);
            return `
            <div class="vtt-fog-texture-clip"
                data-world-left="0"
                data-world-top="0"
                data-world-width="${escapeHtml(String(width))}"
                data-world-height="${escapeHtml(String(height))}"
                style="--vtt-fog-mask-image:url(${escapeHtml(textureMaskUrl)});">
                <div class="vtt-fog-texture-plane vtt-fog-texture-plane-a"></div>
                <div class="vtt-fog-texture-plane vtt-fog-texture-plane-b"></div>
            </div>
            <svg class="vtt-fog-edge-svg"
                data-world-left="0"
                data-world-top="0"
                data-world-width="${escapeHtml(String(width))}"
                data-world-height="${escapeHtml(String(height))}"
                viewBox="0 0 ${escapeHtml(String(width))} ${escapeHtml(String(height))}"
                preserveAspectRatio="none"
                aria-hidden="true">
                <path class="vtt-fog-edge-path" d="${escapeHtml(pathA)}" fill-rule="evenodd"></path>
            </svg>
        `;
        };

        const getFogEntryCellBounds = (scene, fogEntry) => {
            if (!scene || !fogEntry) return null;
            if (fogEntry.col !== undefined || fogEntry.row !== undefined) {
                const left = Math.round(toNumber(fogEntry.col, 0));
                const top = Math.round(toNumber(fogEntry.row, 0));
                const widthCells = Math.max(1, Math.round(toNumber(fogEntry.cols, 1)));
                const heightCells = Math.max(1, Math.round(toNumber(fogEntry.rows, 1)));
                return { left, top, right: left + widthCells, bottom: top + heightCells };
            }
            const cellPx = getSceneCellPx(scene);
            const offsetX = toNumber(scene && scene.grid && scene.grid.offsetX, 0);
            const offsetY = toNumber(scene && scene.grid && scene.grid.offsetY, 0);
            const left = Math.round((toNumber(fogEntry.x, offsetX) - offsetX) / cellPx);
            const top = Math.round((toNumber(fogEntry.y, offsetY) - offsetY) / cellPx);
            const widthCells = Math.max(1, Math.round(Math.max(1, toNumber(fogEntry.w, cellPx)) / cellPx));
            const heightCells = Math.max(1, Math.round(Math.max(1, toNumber(fogEntry.h, cellPx)) / cellPx));
            return { left, top, right: left + widthCells, bottom: top + heightCells };
        };

        const mutateFogCellSetForMask = (cellSet, scene, mask, add = true) => {
            if (!(cellSet instanceof Set) || !scene || !mask) return cellSet;
            const bounds = getFogEntryCellBounds(scene, mask);
            if (!bounds) return cellSet;
            for (let row = bounds.top; row < bounds.bottom; row += 1) {
                for (let col = bounds.left; col < bounds.right; col += 1) {
                    const key = buildFogCellKey(col, row);
                    if (add) cellSet.add(key);
                    else cellSet.delete(key);
                }
            }
            return cellSet;
        };

        const collectFogCellSet = (scene, masks = []) => {
            const cellSet = new Set();
            if (!scene || !Array.isArray(masks)) return cellSet;
            masks.forEach((mask) => mutateFogCellSetForMask(cellSet, scene, mask, true));
            return cellSet;
        };

        const buildFogCellsFromCellSet = (scene, cellSet) => {
            if (!scene || !(cellSet instanceof Set) || !cellSet.size) return [];
            return Array.from(cellSet)
                .map((key) => parseFogCellKey(key))
                .sort((left, right) => left.row - right.row || left.col - right.col)
                .map((cell) => ({ id: buildFogCellId(cell.col, cell.row), col: cell.col, row: cell.row }));
        };

        const areFogEntriesEquivalent = (left = [], right = []) => {
            if (!Array.isArray(left) || !Array.isArray(right)) return false;
            if (left.length !== right.length) return false;
            for (let idx = 0; idx < left.length; idx += 1) {
                const a = left[idx] || {};
                const b = right[idx] || {};
                if (
                    String(a.id || '') !== String(b.id || '')
                    || Math.round(toNumber(a.col, 0)) !== Math.round(toNumber(b.col, 0))
                    || Math.round(toNumber(a.row, 0)) !== Math.round(toNumber(b.row, 0))
                    || Math.round(toNumber(a.cols, 1)) !== Math.round(toNumber(b.cols, 1))
                    || Math.round(toNumber(a.rows, 1)) !== Math.round(toNumber(b.rows, 1))
                ) return false;
            }
            return true;
        };


        const applyFogMaskMutation = (scene, mask, mode = 'add') => {
            if (!scene || !mask) return Array.isArray(scene && scene.fog) ? scene.fog.slice() : [];
            const cellSet = collectFogCellSet(scene, Array.isArray(scene.fog) ? scene.fog : []);
            mutateFogCellSetForMask(cellSet, scene, mask, mode !== 'remove');
            return buildFogCellsFromCellSet(scene, cellSet);
        };


        const getFogEntryWorldRect = (scene, fogEntry) => {
            if (!scene || !fogEntry) return null;
            const bounds = getFogEntryCellBounds(scene, fogEntry);
            if (!bounds) return null;
            const cellPx = getSceneCellPx(scene);
            const offsetX = toNumber(scene && scene.grid && scene.grid.offsetX, 0);
            const offsetY = toNumber(scene && scene.grid && scene.grid.offsetY, 0);
            return {
                x: Math.round(offsetX + bounds.left * cellPx),
                y: Math.round(offsetY + bounds.top * cellPx),
                w: Math.max(1, Math.round((bounds.right - bounds.left) * cellPx)),
                h: Math.max(1, Math.round((bounds.bottom - bounds.top) * cellPx))
            };
        };

        const buildFogMaskMarkup = (scene, mask, className = '') => {
            const rect = getFogEntryWorldRect(scene, mask);
            if (!rect) return '';
            const isPreview = String(className || '').includes('preview');
            const overdraw = isPreview ? 0 : FOG_EDGE_OVERDRAW_PX;
            return `
            <div class="vtt-fog-mask${className ? ` ${className}` : ''}"
                data-world-left="${escapeHtml(String(rect.x - overdraw))}"
                data-world-top="${escapeHtml(String(rect.y - overdraw))}"
                data-world-width="${escapeHtml(String(rect.w + overdraw * 2))}"
                data-world-height="${escapeHtml(String(rect.h + overdraw * 2))}"></div>
        `;
        };

        const getEvidenceNoteCategoryConfig = (category) => {
            const key = String(category || '').trim().toLowerCase();
            return EVIDENCE_NOTE_CATEGORY_META[key] || EVIDENCE_NOTE_CATEGORY_META[DEFAULT_EVIDENCE_NOTE_CATEGORY];
        };

        const normalizeEvidenceNoteCategory = (value, fallback = DEFAULT_EVIDENCE_NOTE_CATEGORY) => {
            const key = String(value || '').trim().toLowerCase();
            return EVIDENCE_NOTE_CATEGORY_META[key] ? key : fallback;
        };

        const normalizeEvidenceNoteShape = (value, fallback = EVIDENCE_NOTE_SHAPE_ZONE) => {
            const clean = String(value || '').trim().toLowerCase();
            return EVIDENCE_NOTE_SHAPE_OPTIONS.includes(clean) ? clean : fallback;
        };

        const isEvidenceNotePin = (note) => normalizeEvidenceNoteShape(note && note.shape) === EVIDENCE_NOTE_SHAPE_PIN;
        const getEvidenceNoteShapeLabel = (note) => isEvidenceNotePin(note) ? 'Pin' : 'Zone';
        const getEvidenceNoteCategoryLabel = (category) => getEvidenceNoteCategoryConfig(category).label;
        const getEvidenceNoteCategoryShortLabel = (category) => getEvidenceNoteCategoryConfig(category).shortLabel;
        const getDefaultEvidenceNoteTitle = (category = DEFAULT_EVIDENCE_NOTE_CATEGORY) => getEvidenceNoteCategoryConfig(category).defaultTitle || 'Zone';
        const getDefaultEvidenceNoteHighlightColor = (category = DEFAULT_EVIDENCE_NOTE_CATEGORY) => getEvidenceNoteCategoryConfig(category).color || DEFAULT_EVIDENCE_NOTE_COLOR;

        const normalizeEvidenceNoteTitle = (value, fallback = getDefaultEvidenceNoteTitle()) => {
            const clean = String(value || '').trim().slice(0, 160);
            return clean || fallback;
        };

        const normalizeEvidenceNoteBody = (value) => String(value || '').trim().slice(0, 6000);

        const getEvidenceNoteHighlightColor = (note) => {
            const category = normalizeEvidenceNoteCategory(note && note.category);
            return getDefaultEvidenceNoteHighlightColor(category);
        };

        const getEvidenceNoteHighlightRgb = (note) => getHexColorRgbString(getEvidenceNoteHighlightColor(note), DEFAULT_EVIDENCE_NOTE_COLOR);

        const getEvidenceNoteDisplayTitle = (note) => {
            const category = normalizeEvidenceNoteCategory(note && note.category);
            return normalizeEvidenceNoteTitle(note && note.title, getDefaultEvidenceNoteTitle(category));
        };

        const getSceneEvidenceNotes = (scene) => Array.isArray(scene && scene.evidenceNotes) ? scene.evidenceNotes : [];

        const buildEvidenceNoteFromCellBounds = (scene, bounds, source = {}) => {
            if (!scene || !bounds) return null;
            const cellPx = getSceneCellPx(scene);
            const offsetX = toNumber(scene && scene.grid && scene.grid.offsetX, 0);
            const offsetY = toNumber(scene && scene.grid && scene.grid.offsetY, 0);
            const category = normalizeEvidenceNoteCategory(source.category);
            const shape = normalizeEvidenceNoteShape(source.shape, EVIDENCE_NOTE_SHAPE_ZONE);
            const defaultTitle = getDefaultEvidenceNoteTitle(category);
            const isPin = shape === EVIDENCE_NOTE_SHAPE_PIN;
            const left = isPin ? normalizeGridCoordinate(bounds.left, 0) : Math.round(toNumber(bounds.left, 0));
            const top = isPin ? normalizeGridCoordinate(bounds.top, 0) : Math.round(toNumber(bounds.top, 0));
            const widthCells = shape === EVIDENCE_NOTE_SHAPE_PIN ? 1 : Math.max(1, Math.round(toNumber(bounds.widthCells, 1)));
            const heightCells = shape === EVIDENCE_NOTE_SHAPE_PIN ? 1 : Math.max(1, Math.round(toNumber(bounds.heightCells, 1)));
            return {
                id: String(source.id || buildId('evidence')).trim() || buildId('evidence'),
                shape,
                category,
                title: normalizeEvidenceNoteTitle(source.title, defaultTitle),
                body: normalizeEvidenceNoteBody(source.body),
                hidden: source.hidden !== undefined ? !!source.hidden : !(source.visibleToPlayers !== undefined ? !!source.visibleToPlayers : true),
                highlightColor: getDefaultEvidenceNoteHighlightColor(category),
                triggers: normalizeProximityTriggers(source.triggers),
                proximityPromptStates: normalizeProximityPromptStates(source.proximityPromptStates),
                x: normalizeWorldCoordinate(offsetX + left * cellPx),
                y: normalizeWorldCoordinate(offsetY + top * cellPx),
                w: Math.max(1, Math.round(widthCells * cellPx)),
                h: Math.max(1, Math.round(heightCells * cellPx))
            };
        };

        const buildEvidenceNoteFromWorldPoints = (scene, startWorldPoint, endWorldPoint, id = buildId('evidence'), source = {}) => {
            if (!scene || !startWorldPoint || !endWorldPoint) return null;
            const cellPx = getSceneCellPx(scene);
            const offsetX = toNumber(scene && scene.grid && scene.grid.offsetX, 0);
            const offsetY = toNumber(scene && scene.grid && scene.grid.offsetY, 0);
            const startCell = getFogCellAtWorldPoint(scene, startWorldPoint);
            const endCell = getFogCellAtWorldPoint(scene, endWorldPoint);
            const startCol = startCell.col;
            const startRow = startCell.row;
            const endCol = endCell.col;
            const endRow = endCell.row;
            const hasDraggedArea = Math.abs(endCol - startCol) > 0 || Math.abs(endRow - startRow) > 0;
            const shape = hasDraggedArea
                ? EVIDENCE_NOTE_SHAPE_ZONE
                : normalizeEvidenceNoteShape(source.shape, EVIDENCE_NOTE_SHAPE_PIN);
            if (shape === EVIDENCE_NOTE_SHAPE_PIN) {
                return buildEvidenceNoteFromCellBounds(scene, {
                    left: (toNumber(endWorldPoint.x, offsetX) - offsetX) / cellPx,
                    top: (toNumber(endWorldPoint.y, offsetY) - offsetY) / cellPx,
                    widthCells: 1,
                    heightCells: 1
                }, { ...source, shape, id });
            }
            const start = snapWorldPointToFogCorner(scene, startWorldPoint);
            const end = snapWorldPointToFogCorner(scene, endWorldPoint);
            const snappedStartCol = Math.round((start.x - offsetX) / cellPx);
            const snappedStartRow = Math.round((start.y - offsetY) / cellPx);
            const snappedEndCol = Math.round((end.x - offsetX) / cellPx);
            const snappedEndRow = Math.round((end.y - offsetY) / cellPx);
            return buildEvidenceNoteFromCellBounds(scene, {
                left: Math.min(snappedStartCol, snappedEndCol),
                top: Math.min(snappedStartRow, snappedEndRow),
                widthCells: Math.max(1, Math.abs(snappedEndCol - snappedStartCol)),
                heightCells: Math.max(1, Math.abs(snappedEndRow - snappedStartRow))
            }, { ...source, shape, id });
        };

        const getEvidenceNoteCellBounds = (scene, note) => {
            if (!scene || !note) return null;
            const cellPx = getSceneCellPx(scene);
            const offsetX = toNumber(scene && scene.grid && scene.grid.offsetX, 0);
            const offsetY = toNumber(scene && scene.grid && scene.grid.offsetY, 0);
            const rawLeft = (toNumber(note.x, offsetX) - offsetX) / cellPx;
            const rawTop = (toNumber(note.y, offsetY) - offsetY) / cellPx;
            const left = isEvidenceNotePin(note) ? Math.floor(rawLeft) : Math.round(rawLeft);
            const top = isEvidenceNotePin(note) ? Math.floor(rawTop) : Math.round(rawTop);
            const widthCells = Math.max(1, Math.round(Math.max(1, toNumber(note.w, cellPx)) / cellPx));
            const heightCells = Math.max(1, Math.round(Math.max(1, toNumber(note.h, cellPx)) / cellPx));
            return { left, top, widthCells, heightCells, right: left + widthCells, bottom: top + heightCells };
        };

        const getEvidenceNoteCellPoint = (scene, note) => {
            if (!scene || !note) return null;
            const cellPx = getSceneCellPx(scene);
            const offsetX = toNumber(scene && scene.grid && scene.grid.offsetX, 0);
            const offsetY = toNumber(scene && scene.grid && scene.grid.offsetY, 0);
            return {
                x: normalizeGridCoordinate((toNumber(note.x, offsetX) - offsetX) / cellPx),
                y: normalizeGridCoordinate((toNumber(note.y, offsetY) - offsetY) / cellPx)
            };
        };

        const isEvidenceNoteCoveredByFog = (scene, note, fogCellSet = null) => {
            if (!scene || !note) return false;
            const cellSet = fogCellSet instanceof Set ? fogCellSet : collectFogCellSet(scene, Array.isArray(scene.fog) ? scene.fog : []);
            if (!cellSet.size) return false;
            const bounds = getEvidenceNoteCellBounds(scene, note);
            if (!bounds) return false;
            for (let row = bounds.top; row < bounds.bottom; row += 1) {
                for (let col = bounds.left; col < bounds.right; col += 1) {
                    if (!cellSet.has(buildFogCellKey(col, row))) return false;
                }
            }
            return true;
        };

        const isEvidenceNoteVisibleToRole = (note, scene, role = getLocalRole(), fogCellSet = null) => {
            if (!note) return false;
            if (role === 'dm') return true;
            if (note.hidden) return false;
            return !isEvidenceNoteCoveredByFog(scene, note, fogCellSet);
        };

        const getVisibleEvidenceNotesForRole = (scene, role = getLocalRole(), fogCellSet = null) => {
            const notes = getSceneEvidenceNotes(scene);
            if (role === 'dm') return notes;
            const resolvedFogCellSet = fogCellSet instanceof Set
                ? fogCellSet
                : collectFogCellSet(scene, Array.isArray(scene && scene.fog) ? scene.fog : []);
            return notes.filter((note) => isEvidenceNoteVisibleToRole(note, scene, role, resolvedFogCellSet));
        };


        const buildEvidenceNoteAreaLabel = (note, scene) => {
            const bounds = getEvidenceNoteCellBounds(scene, note);
            if (isEvidenceNotePin(note)) {
                const point = getEvidenceNoteCellPoint(scene, note);
                if (!point) return 'Pin';
                return `Pin ${point.x}, ${point.y}`;
            }
            if (!bounds) return '1 x 1 sq';
            return `${bounds.widthCells} x ${bounds.heightCells} sq`;
        };


        const isTokenUnderFog = (scene, token, fogCellSet = null) => {
            if (!scene || !token) return false;
            const cellSet = fogCellSet instanceof Set
                ? fogCellSet
                : collectFogCellSet(scene, Array.isArray(scene.fog) ? scene.fog : []);
            if (!cellSet.size) return false;
            const left = Math.floor(toNumber(token.x, 0));
            const top = Math.floor(toNumber(token.y, 0));
            const right = Math.ceil(toNumber(token.x, 0) + Math.max(1, toNumber(token.w, 1)));
            const bottom = Math.ceil(toNumber(token.y, 0) + Math.max(1, toNumber(token.h, 1)));
            for (let row = top; row < bottom; row += 1) {
                for (let col = left; col < right; col += 1) {
                    if (cellSet.has(buildFogCellKey(col, row))) return true;
                }
            }
            return false;
        };

        const isTokenHiddenForRole = (token, scene, role = getLocalRole(), fogCellSet = null) => {
            if (role === 'dm') return false;
            return !!(token && (token.hidden || isTokenUnderFog(scene, token, fogCellSet)));
        };

        const getVisibleTokensForRole = (scene, role = getLocalRole(), fogCellSet = null) => {
            if (!scene || !Array.isArray(scene.tokens)) return [];
            if (role === 'dm') return scene.tokens;
            const resolvedFogCellSet = fogCellSet instanceof Set
                ? fogCellSet
                : collectFogCellSet(scene, Array.isArray(scene.fog) ? scene.fog : []);
            return scene.tokens.filter((token) => !isTokenHiddenForRole(token, scene, role, resolvedFogCellSet));
        };

        const getVisionConeRangeCells = (token) => {
            const baseRange = Math.max(0, Math.round(toNumber(token && token.vision && token.vision.baseRangeCells, 6)));
            const passivePerception = getVisionPassivePerception(token);
            return Math.max(0, baseRange + Math.max(0, Math.floor((passivePerception - 10) / 2)));
        };

        const getVisionConeArcDeg = (token) => clamp(toNumber(token && token.vision && token.vision.arcDeg, 90), 1, 360);
        const getTokenVisionFacingDeg = (token) => normalizeAngleDeg(token && token.vision && token.vision.facingDeg);

        const getVisionConeGeometry = (token, scene, sceneSize) => {
            if (!token || !scene || !token.vision || !token.vision.enabled) return null;
            const side = String(token.side || '').trim().toLowerCase();
            if (side !== 'enemy' && side !== 'neutral') return null;
            const rangeCells = getVisionConeRangeCells(token);
            if (!rangeCells) return null;
            const resolvedSceneSize = sceneSize === undefined ? getWorldSizeForScene(scene) : sceneSize;
            const origin = getTemplateWorldPoint(scene, getTokenCenterInCells(token));
            const radiusPx = rangeCells * getSceneCellPx(scene);
            return {
                left: 0,
                top: 0,
                width: Math.max(1, Math.round(toNumber(resolvedSceneSize && resolvedSceneSize.width, DEFAULT_WORLD_SIZE.width))),
                height: Math.max(1, Math.round(toNumber(resolvedSceneSize && resolvedSceneSize.height, DEFAULT_WORLD_SIZE.height))),
                centerX: origin.x,
                centerY: origin.y,
                radiusPx,
                facingDeg: getTokenVisionFacingDeg(token),
                arcDeg: getVisionConeArcDeg(token)
            };
        };

        const isCellPointInsideVisionCone = (point, token) => {
            if (!point || !token || !token.vision || !token.vision.enabled) return false;
            const origin = getTokenCenterInCells(token);
            const dx = toNumber(point.x, 0) - origin.x;
            const dy = toNumber(point.y, 0) - origin.y;
            const distance = Math.hypot(dx, dy);
            const rangeCells = getVisionConeRangeCells(token);
            if (distance > rangeCells || !rangeCells) return false;
            const angle = normalizeAngleDeg(Math.atan2(dy, dx) * 180 / Math.PI);
            const facing = normalizeAngleDeg(token.vision.facingDeg);
            const delta = Math.abs((((angle - facing) + 540) % 360) - 180);
            return delta <= getVisionConeArcDeg(token) / 2;
        };

        const getStealthVisionTargetSummary = (token, scene, state, options = {}) => {
            const summary = { detectedIds: [], unseenIds: [] };
            const resolvedState = state === undefined ? getVTTState() : state;
            if (!token || !scene || !resolvedState || !Array.isArray(scene.tokens)) return summary;
            const visibility = options && typeof options === 'object' ? options : {};
            const role = String(visibility.role || getLocalRole() || 'player').trim().toLowerCase();
            const fogCellSet = visibility.fogCellSet instanceof Set
                ? visibility.fogCellSet
                : collectFogCellSet(scene, Array.isArray(scene.fog) ? scene.fog : []);
            const visibleTokenIds = visibility.visibleTokenIds instanceof Set
                ? visibility.visibleTokenIds
                : new Set(Array.isArray(visibility.visibleTokenIds) ? visibility.visibleTokenIds.map((id) => String(id || '').trim()) : []);
            const enemyPassivePerception = getVisionPassivePerception(token);
            scene.tokens.forEach((candidate) => {
                if (!candidate || candidate.id === token.id) return;
                const side = String(candidate.side || '').trim().toLowerCase();
                if (side !== 'player' && side !== 'ally') return;
                const candidateId = String(candidate.id || '').trim();
                // Player-facing cone status must only reflect tokens that this client can see.
                // The local player's non-hidden token may intentionally remain above fog, so the
                // stage passes that token ID explicitly rather than treating fog as globally visible.
                if (
                    role !== 'dm'
                    && (
                        candidate.hidden
                        || (isTokenUnderFog(scene, candidate, fogCellSet) && !visibleTokenIds.has(candidateId))
                    )
                ) return;
                const intersectsCone = getTokenFootprintPoints(candidate).some((point) => isCellPointInsideVisionCone(point, token));
                if (!intersectsCone) return;
                const stealthRoll = getTokenStealthRoll(candidate);
                if (stealthRoll !== null && stealthRoll > enemyPassivePerception) {
                    summary.unseenIds.push(candidateId);
                    return;
                }
                summary.detectedIds.push(candidateId);
            });
            return summary;
        };

        const buildStealthStatusMap = (scene, state, fogCellSet = null, options = {}) => {
            const statuses = new Map();
            const resolvedState = state === undefined ? getVTTState() : state;
            if (!scene || !scene.stealthMode || !Array.isArray(scene.tokens)) return statuses;
            const resolvedFogCellSet = fogCellSet instanceof Set
                ? fogCellSet
                : collectFogCellSet(scene, Array.isArray(scene.fog) ? scene.fog : []);
            scene.tokens.forEach((token) => {
                const side = String(token && token.side || '').trim().toLowerCase();
                if (side !== 'enemy' && side !== 'neutral') return;
                if (isTokenHiddenForRole(token, scene, 'player', resolvedFogCellSet)) return;
                const summary = getStealthVisionTargetSummary(token, scene, resolvedState, {
                    ...options,
                    fogCellSet: resolvedFogCellSet
                });
                summary.unseenIds.forEach((tokenId) => {
                    if (!statuses.has(tokenId)) statuses.set(tokenId, STEALTH_STATUS_UNSEEN);
                });
                summary.detectedIds.forEach((tokenId) => statuses.set(tokenId, STEALTH_STATUS_DETECTED));
            });
            return statuses;
        };

        return Object.freeze({
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
        });
    };

    return Object.freeze({
        REQUIRED_DEPENDENCIES,
        create
    });
}));
