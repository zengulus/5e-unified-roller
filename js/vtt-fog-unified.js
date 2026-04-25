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
        const seed = variant === 0 ? 31 : 97;
        const baseFrequency = variant === 0 ? '0.0625 0.08203125' : '0.078125 0.0546875';
        const octaveCount = variant === 0 ? 5 : 4;
        const alphaTable = variant === 0
            ? '0 0.02 0.08 0.18 0.34 0.56 0.78'
            : '0 0.015 0.07 0.16 0.30 0.48 0.68';
        const white = variant === 0 ? '0.96 0.98 1' : '0.88 0.93 0.98';
        const soft = variant === 0 ? '0.58 0.66 0.74' : '0.50 0.58 0.68';
        const svg = `
            <svg xmlns='http://www.w3.org/2000/svg' width='256' height='256' viewBox='0 0 256 256'>
                <defs>
                    <filter id='fogNoise' x='0' y='0' width='256' height='256' filterUnits='userSpaceOnUse'>
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
                    <filter id='softNoise' x='0' y='0' width='256' height='256' filterUnits='userSpaceOnUse'>
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
                <rect width='256' height='256' fill='transparent'/>
                <rect width='256' height='256' filter='url(#softNoise)'/>
                <rect width='256' height='256' filter='url(#fogNoise)'/>
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
                opacity: 0.62;
                animation: vtt-fog-unified-slide-x 32s linear infinite;
            }

            .vtt-fog-unified-stream.is-cross {
                background-image: url("data:image/svg+xml,${fogTileCross}");
                opacity: 0.54;
                animation: vtt-fog-unified-slide-y 47s linear infinite;
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
