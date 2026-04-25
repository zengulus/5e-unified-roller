(function () {
    const FOG_LAYER_ID = 'vtt-fog-layer';
    const SOURCE_SELECTOR = ':scope > .vtt-fog-mask:not(.vtt-fog-unified-mask)';
    const STYLE_ID = 'vtt-fog-unified-style';
    const XHTML_NS = 'http://www.w3.org/1999/xhtml';

    const toPx = (value, fallback = 0) => {
        const parsed = Number.parseFloat(String(value || '').replace('px', ''));
        return Number.isFinite(parsed) ? parsed : fallback;
    };

    const getRectForMask = (maskEl) => {
        const worldLeft = Number.parseFloat(maskEl.dataset.worldLeft || '');
        const worldTop = Number.parseFloat(maskEl.dataset.worldTop || '');
        const worldWidth = Number.parseFloat(maskEl.dataset.worldWidth || '');
        const worldHeight = Number.parseFloat(maskEl.dataset.worldHeight || '');
        const left = Number.isFinite(worldLeft) ? worldLeft : toPx(maskEl.style.left, maskEl.offsetLeft);
        const top = Number.isFinite(worldTop) ? worldTop : toPx(maskEl.style.top, maskEl.offsetTop);
        const width = Math.max(1, Number.isFinite(worldWidth) ? worldWidth : toPx(maskEl.style.width, maskEl.offsetWidth));
        const height = Math.max(1, Number.isFinite(worldHeight) ? worldHeight : toPx(maskEl.style.height, maskEl.offsetHeight));
        return { left, top, width, height, right: left + width, bottom: top + height };
    };

    const buildFogTile = (variant = 0) => {
        const fills = variant === 0
            ? {
                bright: 'rgba(246, 249, 252, 0.26)',
                mid: 'rgba(220, 228, 236, 0.18)',
                dim: 'rgba(154, 166, 178, 0.12)',
                speck: 'rgba(235, 241, 246, 0.22)'
            }
            : {
                bright: 'rgba(240, 245, 249, 0.22)',
                mid: 'rgba(208, 217, 226, 0.16)',
                dim: 'rgba(138, 150, 163, 0.11)',
                speck: 'rgba(226, 233, 240, 0.19)'
            };
        const offset = variant === 0 ? 0 : 31;
        const wrap = (value) => ((value % 256) + 256) % 256;
        const ellipsePoints = [
            [0, 30, 28, 10], [48, 32, 34, 12], [102, 24, 22, 9], [166, 38, 36, 13], [226, 28, 30, 11], [256, 30, 28, 10],
            [22, 76, 20, 8], [78, 88, 42, 14], [142, 78, 30, 11], [206, 92, 36, 12], [252, 78, 18, 8],
            [4, 132, 28, 10], [58, 146, 38, 13], [118, 134, 28, 10], [178, 150, 42, 15], [236, 138, 26, 10],
            [30, 202, 32, 12], [92, 222, 44, 15], [156, 206, 34, 12], [216, 226, 30, 11],
            [0, 246, 34, 12], [68, 252, 28, 10], [142, 242, 40, 14], [224, 252, 34, 12], [256, 246, 34, 12]
        ];
        const smallPoints = [
            [18, 54, 10, 5], [48, 60, 14, 6], [90, 54, 9, 4], [124, 64, 13, 5], [158, 54, 16, 7], [202, 66, 14, 6], [238, 56, 10, 5],
            [16, 116, 12, 5], [54, 124, 16, 7], [92, 112, 10, 4], [128, 120, 14, 6], [170, 126, 18, 7], [218, 116, 12, 5], [252, 122, 10, 4],
            [28, 174, 12, 5], [70, 188, 18, 7], [112, 178, 12, 5], [148, 192, 15, 6], [198, 184, 18, 7], [232, 194, 12, 5],
            [18, 232, 10, 4], [56, 214, 16, 6], [118, 234, 12, 5], [176, 222, 18, 7], [238, 232, 12, 5]
        ];
        const specks = Array.from({ length: 76 }, (_, idx) => {
            const x = wrap((idx * 47 + 19 + offset * 3));
            const y = wrap((idx * 83 + 37 + offset * 5));
            const r = 1 + ((idx * 7) % 4);
            return `<circle cx='${x}' cy='${y}' r='${r}'/>`;
        }).join('');
        const ellipses = ellipsePoints.map(([x, y, rx, ry]) =>
            `<ellipse cx='${wrap(x + offset)}' cy='${wrap(y + Math.round(offset / 2))}' rx='${rx}' ry='${ry}'/>`
        ).join('');
        const smallEllipses = smallPoints.map(([x, y, rx, ry]) =>
            `<ellipse cx='${wrap(x + Math.round(offset / 2))}' cy='${wrap(y + offset)}' rx='${rx}' ry='${ry}'/>`
        ).join('');
        const svg = `
            <svg xmlns='http://www.w3.org/2000/svg' width='256' height='256' viewBox='0 0 256 256'>
                <rect width='256' height='256' fill='transparent'/>
                <g fill='${fills.bright}'>${ellipses}</g>
                <g fill='${fills.mid}'>${smallEllipses}</g>
                <g fill='${fills.dim}' opacity='0.9'>
                    <circle cx='26' cy='34' r='5'/><circle cx='84' cy='18' r='4'/><circle cx='146' cy='34' r='5'/><circle cx='204' cy='24' r='4'/><circle cx='236' cy='42' r='5'/>
                    <circle cx='24' cy='98' r='5'/><circle cx='70' cy='78' r='4'/><circle cx='126' cy='100' r='5'/><circle cx='182' cy='86' r='4'/><circle cx='234' cy='104' r='5'/>
                    <circle cx='34' cy='168' r='4'/><circle cx='96' cy='158' r='5'/><circle cx='154' cy='170' r='4'/><circle cx='214' cy='160' r='5'/>
                    <circle cx='22' cy='230' r='4'/><circle cx='84' cy='210' r='5'/><circle cx='146' cy='232' r='4'/><circle cx='210' cy='220' r='5'/>
                </g>
                <g fill='${fills.speck}' opacity='0.72'>${specks}</g>
            </svg>
        `.replace(/\s+/g, ' ');
        return encodeURIComponent(svg);
    };

    const installStyle = () => {
        if (document.getElementById(STYLE_ID)) return;
        const fogTilePrimary = buildFogTile(0);
        const fogTileCross = buildFogTile(1);
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            #vtt-fog-layer > .vtt-fog-mask:not(.vtt-fog-unified-mask):not(.is-preview):not(.is-remove-preview) {
                opacity: 0 !important;
            }

            .vtt-fog-unified-mask {
                background: transparent !important;
                box-shadow: none !important;
                filter: none !important;
                opacity: 1 !important;
                overflow: visible !important;
            }

            .vtt-fog-unified-mask::before,
            .vtt-fog-unified-mask::after {
                content: none !important;
            }

            .vtt-fog-unified-svg {
                position: absolute;
                inset: 0;
                width: 100%;
                height: 100%;
                overflow: visible;
                pointer-events: none;
            }

            .vtt-fog-unified-fill {
                position: absolute;
                inset: 0;
                width: 100%;
                height: 100%;
                background:
                    radial-gradient(circle at 22% 28%, rgba(202, 210, 217, 0.16) 0 8%, transparent 31%),
                    linear-gradient(135deg, rgba(31, 36, 43, 0.62), rgba(7, 9, 13, 0.88));
                box-shadow: inset 0 0 1.4rem rgba(225, 231, 234, 0.08);
                overflow: hidden;
                opacity: 0.96;
                contain: paint;
            }

            .vtt-fog-unified-stream {
                position: absolute;
                left: -256px;
                top: -256px;
                width: calc(100% + 512px);
                height: calc(100% + 512px);
                pointer-events: none;
                background-repeat: repeat;
                background-size: 256px 256px;
                mix-blend-mode: screen;
                will-change: transform;
                transform: translate3d(0, 0, 0);
                backface-visibility: hidden;
            }

            .vtt-fog-unified-stream.is-primary {
                background-image: url("data:image/svg+xml,${fogTilePrimary}");
                opacity: 0.56;
                filter: blur(10px) contrast(1.08);
                animation: vtt-fog-unified-slide-x 28s linear infinite;
            }

            .vtt-fog-unified-stream.is-cross {
                background-image: url("data:image/svg+xml,${fogTileCross}");
                opacity: 0.5;
                filter: blur(12px) contrast(1.04);
                animation: vtt-fog-unified-slide-y 41s linear infinite;
            }

            @keyframes vtt-fog-unified-slide-x {
                from { transform: translate3d(-256px, 0, 0); }
                to { transform: translate3d(0, 0, 0); }
            }

            @keyframes vtt-fog-unified-slide-y {
                from { transform: translate3d(0, -256px, 0); }
                to { transform: translate3d(0, 0, 0); }
            }
        `;
        document.head.appendChild(style);
    };

    const clonePreviewMasks = (maskEls) => maskEls
        .filter((maskEl) => maskEl.classList.contains('is-preview') || maskEl.classList.contains('is-remove-preview'))
        .map((maskEl) => maskEl.cloneNode(true));

    const createClipRect = (documentRef, rect, minLeft, minTop) => {
        const clipRect = documentRef.createElementNS('http://www.w3.org/2000/svg', 'rect');
        clipRect.setAttribute('x', String(Math.round(rect.left - minLeft)));
        clipRect.setAttribute('y', String(Math.round(rect.top - minTop)));
        clipRect.setAttribute('width', String(Math.max(1, Math.round(rect.width))));
        clipRect.setAttribute('height', String(Math.max(1, Math.round(rect.height))));
        return clipRect;
    };

    const buildUnifiedFog = (sourceMasks) => {
        const normalMasks = sourceMasks.filter((maskEl) =>
            !maskEl.classList.contains('is-preview') && !maskEl.classList.contains('is-remove-preview')
        );
        if (!normalMasks.length) return null;

        const rects = normalMasks.map(getRectForMask);
        const minLeft = Math.min(...rects.map((rect) => rect.left));
        const minTop = Math.min(...rects.map((rect) => rect.top));
        const maxRight = Math.max(...rects.map((rect) => rect.right));
        const maxBottom = Math.max(...rects.map((rect) => rect.bottom));
        const width = Math.max(1, maxRight - minLeft);
        const height = Math.max(1, maxBottom - minTop);
        const roundedWidth = Math.max(1, Math.round(width));
        const roundedHeight = Math.max(1, Math.round(height));
        const clipId = `vtt-fog-clip-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

        const wrapper = document.createElement('div');
        wrapper.className = 'vtt-fog-mask vtt-fog-unified-mask';
        wrapper.setAttribute('aria-hidden', 'true');
        wrapper.dataset.worldLeft = String(minLeft);
        wrapper.dataset.worldTop = String(minTop);
        wrapper.dataset.worldWidth = String(width);
        wrapper.dataset.worldHeight = String(height);
        wrapper.style.left = `${minLeft}px`;
        wrapper.style.top = `${minTop}px`;
        wrapper.style.width = `${width}px`;
        wrapper.style.height = `${height}px`;
        wrapper.style.setProperty('--vtt-fog-texture-x', `${-minLeft}px`);
        wrapper.style.setProperty('--vtt-fog-texture-y', `${-minTop}px`);

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.classList.add('vtt-fog-unified-svg');
        svg.setAttribute('viewBox', `0 0 ${roundedWidth} ${roundedHeight}`);
        svg.setAttribute('preserveAspectRatio', 'none');
        svg.setAttribute('aria-hidden', 'true');

        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        const clipPath = document.createElementNS('http://www.w3.org/2000/svg', 'clipPath');
        clipPath.setAttribute('id', clipId);
        clipPath.setAttribute('clipPathUnits', 'userSpaceOnUse');
        rects.forEach((rect) => clipPath.appendChild(createClipRect(document, rect, minLeft, minTop)));
        defs.appendChild(clipPath);
        svg.appendChild(defs);

        const foreignObject = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
        foreignObject.setAttribute('x', '0');
        foreignObject.setAttribute('y', '0');
        foreignObject.setAttribute('width', String(roundedWidth));
        foreignObject.setAttribute('height', String(roundedHeight));
        foreignObject.setAttribute('clip-path', `url(#${clipId})`);

        const fill = document.createElementNS(XHTML_NS, 'div');
        fill.setAttribute('class', 'vtt-fog-unified-fill');
        const primaryStream = document.createElementNS(XHTML_NS, 'div');
        primaryStream.setAttribute('class', 'vtt-fog-unified-stream is-primary');
        const crossStream = document.createElementNS(XHTML_NS, 'div');
        crossStream.setAttribute('class', 'vtt-fog-unified-stream is-cross');
        fill.appendChild(primaryStream);
        fill.appendChild(crossStream);
        foreignObject.appendChild(fill);
        svg.appendChild(foreignObject);
        wrapper.appendChild(svg);

        return wrapper;
    };

    const installUnifiedFogCompositor = () => {
        const fogLayer = document.getElementById(FOG_LAYER_ID);
        if (!fogLayer) return false;
        installStyle();

        let scheduled = false;
        let applying = false;

        const compose = () => {
            scheduled = false;
            if (applying) return;
            const sourceMasks = Array.from(fogLayer.querySelectorAll(SOURCE_SELECTOR));
            if (!sourceMasks.length) return;

            const unified = buildUnifiedFog(sourceMasks);
            const previews = clonePreviewMasks(sourceMasks);
            if (!unified && !previews.length) return;

            applying = true;
            fogLayer.replaceChildren(...[unified, ...previews].filter(Boolean));
            applying = false;
        };

        const schedule = () => {
            if (applying || scheduled) return;
            scheduled = true;
            if (typeof queueMicrotask === 'function') {
                queueMicrotask(compose);
            } else {
                Promise.resolve().then(compose);
            }
        };

        const observer = new MutationObserver(schedule);
        observer.observe(fogLayer, { childList: true });
        compose();
        return true;
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', installUnifiedFogCompositor, { once: true });
    } else {
        installUnifiedFogCompositor();
    }
}());
