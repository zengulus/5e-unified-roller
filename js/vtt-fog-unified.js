(function () {
    const FOG_LAYER_ID = 'vtt-fog-layer';
    const SOURCE_SELECTOR = ':scope > .vtt-fog-mask:not(.vtt-fog-unified-mask)';
    const STYLE_ID = 'vtt-fog-unified-style';
    const SVG_NS = 'http://www.w3.org/2000/svg';
    const FOG_TILE_PX = 256;

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
        const seed = variant === 0 ? 31 : 97;
        const baseFrequency = variant === 0 ? '0.0625 0.08203125' : '0.078125 0.0546875';
        const octaveCount = variant === 0 ? 5 : 4;
        const alphaTable = variant === 0
            ? '0 0.02 0.08 0.18 0.34 0.56 0.78'
            : '0 0.015 0.07 0.16 0.30 0.48 0.68';
        const white = variant === 0 ? '0.96 0.98 1' : '0.88 0.93 0.98';
        const soft = variant === 0 ? '0.58 0.66 0.74' : '0.50 0.58 0.68';
        const svg = `
            <svg xmlns='http://www.w3.org/2000/svg' width='${FOG_TILE_PX}' height='${FOG_TILE_PX}' viewBox='0 0 ${FOG_TILE_PX} ${FOG_TILE_PX}'>
                <defs>
                    <filter id='fogNoise' x='0' y='0' width='${FOG_TILE_PX}' height='${FOG_TILE_PX}' filterUnits='userSpaceOnUse'>
                        <feTurbulence type='fractalNoise' baseFrequency='${baseFrequency}' numOctaves='${octaveCount}' seed='${seed}' stitchTiles='stitch' result='noise'/>
                        <feColorMatrix in='noise' type='matrix' values='
                            0 0 0 0 ${white.split(' ')[0]}
                            0 0 0 0 ${white.split(' ')[1]}
                            0 0 0 0 ${white.split(' ')[2]}
                            0.34 0.34 0.34 0 -0.18' result='alphaNoise'/>
                        <feComponentTransfer in='alphaNoise' result='fogNoise'>
                            <feFuncA type='table' tableValues='${alphaTable}'/>
                        </feComponentTransfer>
                    </filter>
                    <filter id='softNoise' x='0' y='0' width='${FOG_TILE_PX}' height='${FOG_TILE_PX}' filterUnits='userSpaceOnUse'>
                        <feTurbulence type='fractalNoise' baseFrequency='0.0234375 0.03125' numOctaves='3' seed='${seed + 13}' stitchTiles='stitch' result='noise'/>
                        <feColorMatrix in='noise' type='matrix' values='
                            0 0 0 0 ${soft.split(' ')[0]}
                            0 0 0 0 ${soft.split(' ')[1]}
                            0 0 0 0 ${soft.split(' ')[2]}
                            0.34 0.34 0.34 0 -0.04' result='alphaNoise'/>
                        <feComponentTransfer in='alphaNoise' result='softFogNoise'>
                            <feFuncA type='table' tableValues='0 0.04 0.10 0.18 0.26 0.34'/>
                        </feComponentTransfer>
                    </filter>
                </defs>
                <rect width='${FOG_TILE_PX}' height='${FOG_TILE_PX}' fill='transparent'/>
                <rect width='${FOG_TILE_PX}' height='${FOG_TILE_PX}' filter='url(#softNoise)'/>
                <rect width='${FOG_TILE_PX}' height='${FOG_TILE_PX}' filter='url(#fogNoise)'/>
            </svg>
        `.replace(/\s+/g, ' ');
        return `data:image/svg+xml,${encodeURIComponent(svg)}`;
    };

    const installStyle = () => {
        if (document.getElementById(STYLE_ID)) return;
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
                overflow: hidden !important;
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
                overflow: hidden;
                pointer-events: none;
            }

            .vtt-fog-unified-cell-base {
                fill: rgba(11, 14, 19, 0.68);
            }

            .vtt-fog-unified-cell-vignette {
                fill: rgba(190, 198, 205, 0.09);
                mix-blend-mode: screen;
            }

            .vtt-fog-unified-cell-noise-primary {
                fill: url(#vtt-fog-pattern-primary);
                opacity: 0.66;
                mix-blend-mode: screen;
            }

            .vtt-fog-unified-cell-noise-cross {
                fill: url(#vtt-fog-pattern-cross);
                opacity: 0.56;
                mix-blend-mode: screen;
            }

            @media (prefers-reduced-motion: reduce) {
                .vtt-fog-pattern-motion {
                    display: none;
                }
            }
        `;
        document.head.appendChild(style);
    };

    const clonePreviewMasks = (maskEls) => maskEls
        .filter((maskEl) => maskEl.classList.contains('is-preview') || maskEl.classList.contains('is-remove-preview'))
        .map((maskEl) => maskEl.cloneNode(true));

    const createCellRect = (documentRef, rect, minLeft, minTop, className) => {
        const cellRect = documentRef.createElementNS(SVG_NS, 'rect');
        cellRect.setAttribute('class', className);
        cellRect.setAttribute('x', String(Math.round(rect.left - minLeft)));
        cellRect.setAttribute('y', String(Math.round(rect.top - minTop)));
        cellRect.setAttribute('width', String(Math.max(1, Math.round(rect.width))));
        cellRect.setAttribute('height', String(Math.max(1, Math.round(rect.height))));
        return cellRect;
    };

    const createFogPattern = (documentRef, id, href, animateAxis, durationSeconds) => {
        const pattern = documentRef.createElementNS(SVG_NS, 'pattern');
        pattern.setAttribute('id', id);
        pattern.setAttribute('patternUnits', 'userSpaceOnUse');
        pattern.setAttribute('x', '0');
        pattern.setAttribute('y', '0');
        pattern.setAttribute('width', String(FOG_TILE_PX));
        pattern.setAttribute('height', String(FOG_TILE_PX));

        const animate = documentRef.createElementNS(SVG_NS, 'animateTransform');
        animate.setAttribute('class', 'vtt-fog-pattern-motion');
        animate.setAttribute('attributeName', 'patternTransform');
        animate.setAttribute('type', 'translate');
        animate.setAttribute('from', animateAxis === 'x' ? `-${FOG_TILE_PX} 0` : `0 -${FOG_TILE_PX}`);
        animate.setAttribute('to', '0 0');
        animate.setAttribute('dur', `${durationSeconds}s`);
        animate.setAttribute('repeatCount', 'indefinite');
        pattern.appendChild(animate);

        const image = documentRef.createElementNS(SVG_NS, 'image');
        image.setAttribute('x', '0');
        image.setAttribute('y', '0');
        image.setAttribute('width', String(FOG_TILE_PX));
        image.setAttribute('height', String(FOG_TILE_PX));
        image.setAttribute('preserveAspectRatio', 'none');
        image.setAttribute('href', href);
        pattern.appendChild(image);

        return pattern;
    };

    const appendCellRects = (documentRef, parent, rects, minLeft, minTop, className) => {
        rects.forEach((rect) => parent.appendChild(createCellRect(documentRef, rect, minLeft, minTop, className)));
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
        const fogTilePrimary = buildFogTile(0);
        const fogTileCross = buildFogTile(1);

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

        const svg = document.createElementNS(SVG_NS, 'svg');
        svg.classList.add('vtt-fog-unified-svg');
        svg.setAttribute('viewBox', `0 0 ${roundedWidth} ${roundedHeight}`);
        svg.setAttribute('preserveAspectRatio', 'none');
        svg.setAttribute('aria-hidden', 'true');

        const defs = document.createElementNS(SVG_NS, 'defs');
        defs.appendChild(createFogPattern(document, 'vtt-fog-pattern-primary', fogTilePrimary, 'x', 32));
        defs.appendChild(createFogPattern(document, 'vtt-fog-pattern-cross', fogTileCross, 'y', 47));
        svg.appendChild(defs);

        const baseGroup = document.createElementNS(SVG_NS, 'g');
        appendCellRects(document, baseGroup, rects, minLeft, minTop, 'vtt-fog-unified-cell-base');
        svg.appendChild(baseGroup);

        const primaryGroup = document.createElementNS(SVG_NS, 'g');
        appendCellRects(document, primaryGroup, rects, minLeft, minTop, 'vtt-fog-unified-cell-noise-primary');
        svg.appendChild(primaryGroup);

        const crossGroup = document.createElementNS(SVG_NS, 'g');
        appendCellRects(document, crossGroup, rects, minLeft, minTop, 'vtt-fog-unified-cell-noise-cross');
        svg.appendChild(crossGroup);

        const vignetteGroup = document.createElementNS(SVG_NS, 'g');
        appendCellRects(document, vignetteGroup, rects, minLeft, minTop, 'vtt-fog-unified-cell-vignette');
        svg.appendChild(vignetteGroup);

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
