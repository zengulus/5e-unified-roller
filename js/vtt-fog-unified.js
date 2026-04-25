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
                    radial-gradient(circle at 22% 28%, rgba(190, 198, 205, 0.16) 0 8%, transparent 31%),
                    linear-gradient(135deg, rgba(31, 36, 43, 0.58), rgba(7, 9, 13, 0.84));
                box-shadow: inset 0 0 1.4rem rgba(225, 231, 234, 0.08);
                overflow: hidden;
                opacity: 0.94;
                contain: paint;
            }

            .vtt-fog-unified-stream {
                position: absolute;
                left: -320px;
                top: -320px;
                width: calc(100% + 640px);
                height: calc(100% + 640px);
                pointer-events: none;
                background:
                    radial-gradient(circle at 46px 62px, rgba(224, 229, 232, 0.32) 0 18px, transparent 58px),
                    radial-gradient(circle at 180px 86px, rgba(149, 158, 166, 0.34) 0 26px, transparent 74px),
                    radial-gradient(circle at 124px 178px, rgba(236, 239, 240, 0.22) 0 22px, transparent 68px),
                    radial-gradient(circle at 24px 22px, rgba(255, 255, 255, 0.16) 0 7px, transparent 20px);
                background-repeat: repeat;
                background-size: 260px 220px, 300px 250px, 220px 280px, 104px 92px;
                mix-blend-mode: screen;
                opacity: 0.5;
                will-change: transform;
                transform: translate3d(0, 0, 0);
                backface-visibility: hidden;
            }

            .vtt-fog-unified-stream.is-primary {
                animation: vtt-fog-unified-slide-x 54s linear infinite;
            }

            .vtt-fog-unified-stream.is-cross {
                animation: vtt-fog-unified-slide-y 83s linear infinite;
                background-position: 41px 17px, 113px 71px, 67px 149px, 29px 43px;
                transform-origin: center center;
            }

            @keyframes vtt-fog-unified-slide-x {
                from { transform: translate3d(-260px, 0, 0); }
                to { transform: translate3d(0, 0, 0); }
            }

            @keyframes vtt-fog-unified-slide-y {
                from { transform: rotate(90deg) scale(1.08) translate3d(0, -220px, 0); }
                to { transform: rotate(90deg) scale(1.08) translate3d(0, 0, 0); }
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
