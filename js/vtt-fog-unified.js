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

            .vtt-fog-unified-base {
                fill: rgba(11, 14, 19, 0.68);
            }

            .vtt-fog-unified-vignette {
                fill: rgba(190, 198, 205, 0.09);
                mix-blend-mode: screen;
            }

            .vtt-fog-unified-noise-layer {
                pointer-events: none;
                mix-blend-mode: screen;
                will-change: transform;
                transform-box: fill-box;
                transform-origin: center center;
                backface-visibility: hidden;
            }

            .vtt-fog-unified-noise-layer.is-primary {
                opacity: 0.66;
                animation: vtt-fog-unified-slide-x 32s linear infinite;
            }

            .vtt-fog-unified-noise-layer.is-cross {
                opacity: 0.56;
                animation: vtt-fog-unified-slide-y 47s linear infinite;
            }

            @keyframes vtt-fog-unified-slide-x {
                from { transform: translateX(-${FOG_TILE_PX}px); }
                to { transform: translateX(0); }
            }

            @keyframes vtt-fog-unified-slide-y {
                from { transform: translateY(-${FOG_TILE_PX}px); }
                to { transform: translateY(0); }
            }
        `;
        document.head.appendChild(style);
    };

    const clonePreviewMasks = (maskEls) => maskEls
        .filter((maskEl) => maskEl.classList.contains('is-preview') || maskEl.classList.contains('is-remove-preview'))
        .map((maskEl) => maskEl.cloneNode(true));

    const createClipRect = (documentRef, rect, minLeft, minTop) => {
        const clipRect = documentRef.createElementNS(SVG_NS, 'rect');
        clipRect.setAttribute('x', String(Math.round(rect.left - minLeft)));
        clipRect.setAttribute('y', String(Math.round(rect.top - minTop)));
        clipRect.setAttribute('width', String(Math.max(1, Math.round(rect.width))));
        clipRect.setAttribute('height', String(Math.max(1, Math.round(rect.height))));
        return clipRect;
    };

    const createTiledNoiseLayer = (documentRef, className, href, clipId, roundedWidth, roundedHeight) => {
        const layer = documentRef.createElementNS(SVG_NS, 'g');
        layer.setAttribute('class', `vtt-fog-unified-noise-layer ${className}`);
        layer.setAttribute('clip-path', `url(#${clipId})`);
        for (let y = -FOG_TILE_PX; y <= roundedHeight + FOG_TILE_PX; y += FOG_TILE_PX) {
            for (let x = -FOG_TILE_PX; x <= roundedWidth + FOG_TILE_PX; x += FOG_TILE_PX) {
                const image = documentRef.createElementNS(SVG_NS, 'image');
                image.setAttribute('x', String(x));
                image.setAttribute('y', String(y));
                image.setAttribute('width', String(FOG_TILE_PX));
                image.setAttribute('height', String(FOG_TILE_PX));
                image.setAttribute('preserveAspectRatio', 'none');
                image.setAttribute('href', href);
                layer.appendChild(image);
            }
        }
        return layer;
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
        const clipPath = document.createElementNS(SVG_NS, 'clipPath');
        clipPath.setAttribute('id', clipId);
        clipPath.setAttribute('clipPathUnits', 'userSpaceOnUse');
        rects.forEach((rect) => clipPath.appendChild(createClipRect(document, rect, minLeft, minTop)));
        defs.appendChild(clipPath);
        svg.appendChild(defs);

        const baseRect = document.createElementNS(SVG_NS, 'rect');
        baseRect.setAttribute('class', 'vtt-fog-unified-base');
        baseRect.setAttribute('x', '0');
        baseRect.setAttribute('y', '0');
        baseRect.setAttribute('width', String(roundedWidth));
        baseRect.setAttribute('height', String(roundedHeight));
        baseRect.setAttribute('clip-path', `url(#${clipId})`);
        svg.appendChild(baseRect);

        const primaryLayer = createTiledNoiseLayer(document, 'is-primary', fogTilePrimary, clipId, roundedWidth, roundedHeight);
        const crossLayer = createTiledNoiseLayer(document, 'is-cross', fogTileCross, clipId, roundedWidth, roundedHeight);
        svg.appendChild(primaryLayer);
        svg.appendChild(crossLayer);

        const vignetteRect = document.createElementNS(SVG_NS, 'rect');
        vignetteRect.setAttribute('class', 'vtt-fog-unified-vignette');
        vignetteRect.setAttribute('x', '0');
        vignetteRect.setAttribute('y', '0');
        vignetteRect.setAttribute('width', String(roundedWidth));
        vignetteRect.setAttribute('height', String(roundedHeight));
        vignetteRect.setAttribute('clip-path', `url(#${clipId})`);
        svg.appendChild(vignetteRect);

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
