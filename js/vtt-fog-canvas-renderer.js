(function () {
    const FOG_LAYER_ID = 'vtt-fog-layer';
    const SOURCE_SELECTOR = ':scope > .vtt-fog-mask:not(.vtt-fog-unified-mask)';
    const TILE_SCREEN_PX = 160;
    const TARGET_FPS = 10;
    const MAX_DPR = 1.5;
    const MAX_PIXELS = 5000000;

    const toPx = (value, fallback = 0) => {
        const parsed = Number.parseFloat(String(value || '').replace('px', ''));
        return Number.isFinite(parsed) ? parsed : fallback;
    };

    const readRect = (el) => {
        const left = Number.parseFloat(el.dataset.worldLeft || '') || toPx(el.style.left, el.offsetLeft);
        const top = Number.parseFloat(el.dataset.worldTop || '') || toPx(el.style.top, el.offsetTop);
        const width = Math.max(1, Number.parseFloat(el.dataset.worldWidth || '') || toPx(el.style.width, el.offsetWidth));
        const height = Math.max(1, Number.parseFloat(el.dataset.worldHeight || '') || toPx(el.style.height, el.offsetHeight));
        return { left, top, width, height, right: left + width, bottom: top + height };
    };

    const makeTile = (variant, dpr) => {
        const size = Math.max(80, Math.round(TILE_SCREEN_PX * dpr));
        const tile = document.createElement('canvas');
        tile.width = size;
        tile.height = size;
        const ctx = tile.getContext('2d', { alpha: true });
        const tint = variant ? [170, 187, 205, 0.13] : [225, 234, 242, 0.16];
        const count = variant ? 70 : 90;
        for (let i = 0; i < count; i += 1) {
            const x = (((Math.sin(i * 12.989 + variant * 78.23) * 43758.5453) % 1) + 1) % 1 * size;
            const y = (((Math.sin(i * 78.233 + variant * 19.17) * 23454.1231) % 1) + 1) % 1 * size;
            const r = (8 + (i % 11) * 2.2) * dpr;
            const g = ctx.createRadialGradient(x, y, 0, x, y, r);
            g.addColorStop(0, `rgba(${tint[0]}, ${tint[1]}, ${tint[2]}, ${tint[3]})`);
            g.addColorStop(1, `rgba(${tint[0]}, ${tint[1]}, ${tint[2]}, 0)`);
            ctx.fillStyle = g;
            for (let oy = -size; oy <= size; oy += size) {
                for (let ox = -size; ox <= size; ox += size) {
                    ctx.beginPath();
                    ctx.arc(x + ox, y + oy, r, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }
        return tile;
    };

    const scaleFor = (canvas, w, h) => {
        const box = canvas.getBoundingClientRect();
        return Math.max(box.width / Math.max(1, w), box.height / Math.max(1, h), 0.01);
    };

    const fitCanvas = (canvas, w, h, scale) => {
        const rawDpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
        const wanted = w * h * scale * scale * rawDpr * rawDpr;
        const ratio = wanted > MAX_PIXELS ? Math.sqrt(MAX_PIXELS / wanted) : 1;
        const dpr = Math.max(0.75, rawDpr * ratio);
        const backingScale = Math.max(0.5, scale * dpr);
        const bw = Math.max(1, Math.round(w * backingScale));
        const bh = Math.max(1, Math.round(h * backingScale));
        if (canvas.width !== bw || canvas.height !== bh) {
            canvas.width = bw;
            canvas.height = bh;
        }
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
        return { backingScale, dpr };
    };

    const drawTile = (ctx, tile, w, h, scale, ox, oy, alpha) => {
        const tileWorld = TILE_SCREEN_PX / Math.max(0.01, scale);
        const startX = -tileWorld + ((ox / Math.max(0.01, scale)) % tileWorld);
        const startY = -tileWorld + ((oy / Math.max(0.01, scale)) % tileWorld);
        ctx.globalAlpha = alpha;
        for (let y = startY; y < h + tileWorld; y += tileWorld) {
            for (let x = startX; x < w + tileWorld; x += tileWorld) {
                ctx.drawImage(tile, x, y, tileWorld, tileWorld);
            }
        }
        ctx.globalAlpha = 1;
    };

    const stopExistingRenderer = (fogLayer) => {
        if (typeof fogLayer._vttCanvasFogStop === 'function') fogLayer._vttCanvasFogStop();
        fogLayer._vttCanvasFogStop = null;
    };

    const compose = () => {
        const fogLayer = document.getElementById(FOG_LAYER_ID);
        if (!fogLayer) return;
        const masks = Array.from(fogLayer.querySelectorAll(SOURCE_SELECTOR))
            .filter((el) => !el.classList.contains('is-preview') && !el.classList.contains('is-remove-preview'));
        if (!masks.length) return;

        const previewMasks = Array.from(fogLayer.querySelectorAll(SOURCE_SELECTOR))
            .filter((el) => el.classList.contains('is-preview') || el.classList.contains('is-remove-preview'))
            .map((el) => el.cloneNode(true));
        const sourceRects = masks.map(readRect);
        const minLeft = Math.min(...sourceRects.map((r) => r.left));
        const minTop = Math.min(...sourceRects.map((r) => r.top));
        const maxRight = Math.max(...sourceRects.map((r) => r.right));
        const maxBottom = Math.max(...sourceRects.map((r) => r.bottom));
        const w = Math.max(1, maxRight - minLeft);
        const h = Math.max(1, maxBottom - minTop);
        const rects = sourceRects.map((r) => ({ x: r.left - minLeft, y: r.top - minTop, width: r.width, height: r.height }));

        const wrapper = document.createElement('div');
        wrapper.className = 'vtt-fog-mask vtt-fog-unified-mask';
        Object.assign(wrapper.style, { left: `${minLeft}px`, top: `${minTop}px`, width: `${w}px`, height: `${h}px`, overflow: 'hidden', background: 'transparent' });
        const canvas = document.createElement('canvas');
        canvas.className = 'vtt-fog-canvas';
        Object.assign(canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none' });
        wrapper.appendChild(canvas);

        stopExistingRenderer(fogLayer);
        fogLayer.replaceChildren(wrapper, ...previewMasks);

        const ctx = canvas.getContext('2d', { alpha: true });
        const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        let stopped = false;
        let last = 0;
        let tileDpr = 0;
        let tileA = null;
        let tileB = null;

        const render = (now) => {
            if (stopped || !canvas.isConnected) return;
            if (!last || now - last >= 1000 / TARGET_FPS || reduced) {
                last = now;
                const scale = scaleFor(canvas, w, h);
                const fit = fitCanvas(canvas, w, h, scale);
                if (!tileA || Math.abs(tileDpr - fit.dpr) > 0.05) {
                    tileA = makeTile(0, fit.dpr);
                    tileB = makeTile(1, fit.dpr);
                    tileDpr = fit.dpr;
                }
                ctx.setTransform(1, 0, 0, 1, 0, 0);
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.setTransform(fit.backingScale, 0, 0, fit.backingScale, 0, 0);
                ctx.save();
                ctx.beginPath();
                rects.forEach((r) => ctx.rect(r.x, r.y, r.width, r.height));
                ctx.clip();
                ctx.fillStyle = 'rgba(11, 14, 19, 0.68)';
                ctx.fillRect(0, 0, w, h);
                const t = reduced ? 0 : now / 1000;
                drawTile(ctx, tileA, w, h, scale, (t * 6) % TILE_SCREEN_PX, 0, 0.74);
                drawTile(ctx, tileB, w, h, scale, 0, (t * 4) % TILE_SCREEN_PX, 0.58);
                ctx.fillStyle = 'rgba(190, 198, 205, 0.06)';
                ctx.fillRect(0, 0, w, h);
                ctx.restore();
            }
            if (!reduced) requestAnimationFrame(render);
        };

        requestAnimationFrame(render);
        fogLayer._vttCanvasFogStop = () => { stopped = true; };
    };

    const install = () => {
        const fogLayer = document.getElementById(FOG_LAYER_ID);
        if (!fogLayer) return;
        let scheduled = false;
        const schedule = () => {
            if (scheduled) return;
            scheduled = true;
            queueMicrotask(() => {
                scheduled = false;
                compose();
            });
        };
        new MutationObserver(schedule).observe(fogLayer, { childList: true });
        schedule();
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
    else install();
}());
