(function () {
    const FOG_LAYER_ID = 'vtt-fog-layer';
    const SOURCE_SELECTOR = ':scope > .vtt-fog-mask:not(.vtt-fog-unified-mask)';
    const UNIFIED_SELECTOR = ':scope > .vtt-fog-unified-mask';

    const toPx = (value, fallback = 0) => {
        const parsed = Number.parseFloat(String(value || '').replace('px', ''));
        return Number.isFinite(parsed) ? parsed : fallback;
    };

    const getRectForMask = (maskEl) => {
        const left = toPx(maskEl.style.left, maskEl.offsetLeft);
        const top = toPx(maskEl.style.top, maskEl.offsetTop);
        const width = Math.max(1, toPx(maskEl.style.width, maskEl.offsetWidth));
        const height = Math.max(1, toPx(maskEl.style.height, maskEl.offsetHeight));
        return { left, top, width, height, right: left + width, bottom: top + height };
    };

    const encodeMaskSvg = (rects, width, height, minLeft, minTop) => {
        const safeWidth = Math.max(1, Math.ceil(width));
        const safeHeight = Math.max(1, Math.ceil(height));
        const rectMarkup = rects.map((rect) => {
            const x = Math.round(rect.left - minLeft);
            const y = Math.round(rect.top - minTop);
            const w = Math.max(1, Math.round(rect.width));
            const h = Math.max(1, Math.round(rect.height));
            return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="white"/>`;
        }).join('');
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${safeWidth}" height="${safeHeight}" viewBox="0 0 ${safeWidth} ${safeHeight}"><rect width="100%" height="100%" fill="black"/>${rectMarkup}</svg>`;
        return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
    };

    const copyPreviewMasks = (maskEls) => maskEls
        .filter((maskEl) => maskEl.classList.contains('is-preview') || maskEl.classList.contains('is-remove-preview'))
        .map((maskEl) => maskEl.cloneNode(true));

    const buildUnifiedMask = (sourceMasks) => {
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
        const maskUrl = encodeMaskSvg(rects, width, height, minLeft, minTop);

        const unified = document.createElement('div');
        unified.className = 'vtt-fog-mask vtt-fog-unified-mask';
        unified.setAttribute('aria-hidden', 'true');
        unified.dataset.worldLeft = String(minLeft);
        unified.dataset.worldTop = String(minTop);
        unified.dataset.worldWidth = String(width);
        unified.dataset.worldHeight = String(height);
        unified.style.left = `${minLeft}px`;
        unified.style.top = `${minTop}px`;
        unified.style.width = `${width}px`;
        unified.style.height = `${height}px`;
        unified.style.webkitMaskImage = maskUrl;
        unified.style.maskImage = maskUrl;
        unified.style.webkitMaskRepeat = 'no-repeat';
        unified.style.maskRepeat = 'no-repeat';
        unified.style.webkitMaskSize = '100% 100%';
        unified.style.maskSize = '100% 100%';
        unified.style.setProperty('--vtt-fog-texture-x', `${-minLeft}px`);
        unified.style.setProperty('--vtt-fog-texture-y', `${-minTop}px`);
        return unified;
    };

    const installUnifiedFogCompositor = () => {
        const fogLayer = document.getElementById(FOG_LAYER_ID);
        if (!fogLayer) return false;

        let scheduled = false;
        let applying = false;

        const compose = () => {
            scheduled = false;
            if (applying) return;
            const sourceMasks = Array.from(fogLayer.querySelectorAll(SOURCE_SELECTOR));
            if (!sourceMasks.length) return;

            const unified = buildUnifiedMask(sourceMasks);
            const previews = copyPreviewMasks(sourceMasks);
            if (!unified && !previews.length) return;

            applying = true;
            fogLayer.replaceChildren(...[unified, ...previews].filter(Boolean));
            applying = false;
        };

        const schedule = () => {
            if (applying || scheduled) return;
            scheduled = true;
            requestAnimationFrame(compose);
        };

        const observer = new MutationObserver(schedule);
        observer.observe(fogLayer, { childList: true });
        schedule();
        return true;
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', installUnifiedFogCompositor, { once: true });
    } else {
        installUnifiedFogCompositor();
    }
}());
