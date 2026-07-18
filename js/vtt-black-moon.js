(function (root, factory) {
    'use strict';

    const api = factory();

    if (typeof module === 'object' && module.exports) {
        module.exports = api;
        return;
    }
    if (root && typeof root === 'object') {
        root.RTF_VTT_BLACK_MOON = api;
    }
}(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';

    const PHRASES = Object.freeze([
        'NOBODY DIED',
        'NOBODY WAS BUTCHERED',
        'THERE IS NO SPINE',
        'THERE IS NO EYE',
        'THERE IS NO HEART',
        'THERE IS NO FLESH'
    ]);
    const QUESTION = 'DOES THE BLACK MOON HOWL?';
    const ANSWER = 'YES';
    const SOURCE_HIDDEN_CLASS = 'vtt-black-moon-source-hidden';
    const CANCELLED = Symbol('black-moon-cancelled');
    const DEFAULT_TIMINGS = Object.freeze({
        replacementMs: 1800,
        holdMs: 2000,
        questionTypeMs: 1250,
        questionPauseMs: 650,
        answerTypeMs: 240,
        answerHoldMs: 550
    });
    const BLOCKED_EVENTS = Object.freeze([
        'pointerdown',
        'pointerup',
        'click',
        'dblclick',
        'contextmenu',
        'wheel',
        'touchstart',
        'touchmove',
        'keydown',
        'keyup',
        'input',
        'change',
        'submit'
    ]);

    const toNonNegativeMs = (value, fallback) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : fallback;
    };

    const normalizeTimings = (value = {}) => {
        const source = value && typeof value === 'object' ? value : {};
        return Object.freeze(Object.fromEntries(Object.entries(DEFAULT_TIMINGS).map(([key, fallback]) => [
            key,
            toNonNegativeMs(source[key], fallback)
        ])));
    };

    const isRectVisible = (rect, view) => !!(
        rect
        && rect.width > 0
        && rect.height > 0
        && rect.right > 0
        && rect.bottom > 0
        && rect.left < view.innerWidth
        && rect.top < view.innerHeight
    );

    const isElementVisible = (element, view) => {
        if (!(element instanceof view.Element)) return false;
        if (element.closest('[data-black-moon-overlay], script, style, noscript, template')) return false;
        const style = view.getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) <= 0) return false;
        return isRectVisible(element.getBoundingClientRect(), view);
    };

    const buildTargetText = (original, phrase) => {
        const minimumLength = Math.max(String(original || '').length, String(phrase || '').length);
        let target = String(phrase || '');
        while (target.length < minimumLength && target.length < 160) target += ` ${phrase}`;
        return target.slice(0, 160);
    };

    const blendText = (original, target, replacedCount) => {
        const source = String(original || '');
        const replacement = String(target || '');
        const length = Math.max(source.length, replacement.length);
        let output = '';
        for (let index = 0; index < length; index += 1) {
            if (index < replacedCount) {
                output += replacement[index] || '';
            } else {
                output += source[index] || '';
            }
        }
        return output;
    };

    const collectVisibleText = (doc, view, overlay) => {
        const entries = [];
        const sources = new Set();
        const body = doc.body;
        if (!body) return { entries, sources };
        const walker = doc.createTreeWalker(body, view.NodeFilter.SHOW_TEXT);
        let textNode = walker.nextNode();
        while (textNode && entries.length < 600) {
            const parent = textNode.parentElement;
            const original = String(textNode.nodeValue || '').replace(/\s+/g, ' ').trim();
            if (original && parent && parent !== overlay && isElementVisible(parent, view)) {
                const range = doc.createRange();
                range.selectNodeContents(textNode);
                const rect = range.getBoundingClientRect();
                range.detach();
                if (isRectVisible(rect, view)) {
                    const style = view.getComputedStyle(parent);
                    const phrase = PHRASES[entries.length % PHRASES.length];
                    entries.push({
                        source: parent,
                        original,
                        target: buildTargetText(original, phrase),
                        rect,
                        style
                    });
                    sources.add(parent);
                }
            }
            textNode = walker.nextNode();
        }

        body.querySelectorAll('input, textarea, select').forEach((control) => {
            if (entries.length >= 600 || !isElementVisible(control, view)) return;
            const original = String(
                control instanceof view.HTMLSelectElement
                    ? (control.selectedOptions[0] && control.selectedOptions[0].textContent || '')
                    : (control.value || control.placeholder || '')
            ).replace(/\s+/g, ' ').trim();
            if (!original) return;
            const rect = control.getBoundingClientRect();
            const style = view.getComputedStyle(control);
            const phrase = PHRASES[entries.length % PHRASES.length];
            entries.push({
                source: control,
                original,
                target: buildTargetText(original, phrase),
                rect,
                style
            });
            sources.add(control);
        });
        return { entries, sources };
    };

    const buildOverlayEntry = (doc, entry) => {
        const element = doc.createElement('span');
        element.className = 'vtt-black-moon-replacement';
        element.textContent = entry.original;
        element.style.left = `${Math.max(0, entry.rect.left)}px`;
        element.style.top = `${Math.max(0, entry.rect.top)}px`;
        element.style.width = `${Math.max(1, entry.rect.width)}px`;
        element.style.minHeight = `${Math.max(1, entry.rect.height)}px`;
        element.style.color = entry.style.color;
        element.style.fontFamily = entry.style.fontFamily;
        element.style.fontSize = entry.style.fontSize;
        element.style.fontStyle = entry.style.fontStyle;
        element.style.fontWeight = entry.style.fontWeight;
        element.style.letterSpacing = entry.style.letterSpacing;
        element.style.lineHeight = entry.style.lineHeight;
        element.style.textAlign = entry.style.textAlign;
        element.style.textTransform = entry.style.textTransform;
        return element;
    };

    class BlackMoonHowlController {
        constructor(options = {}) {
            const source = options && typeof options === 'object' ? options : {};
            this.document = source.document || (typeof document !== 'undefined' ? document : null);
            this.window = source.window || (this.document && this.document.defaultView) || (typeof window !== 'undefined' ? window : null);
            if (!this.document || !this.window) throw new TypeError('Black Moon Howl requires a browser document and window.');
            this.timings = normalizeTimings(source.timings);
            this.activeRun = null;
            this.seenEffectIds = new Set();
            this.seenEffectOrder = [];
        }

        isActive() {
            return !!this.activeRun;
        }

        rememberEffectId(effectId) {
            const id = String(effectId || '').trim();
            if (!id || this.seenEffectIds.has(id)) return;
            this.seenEffectIds.add(id);
            this.seenEffectOrder.push(id);
            while (this.seenEffectOrder.length > 40) {
                this.seenEffectIds.delete(this.seenEffectOrder.shift());
            }
        }

        createRun(effectId) {
            return {
                effectId,
                cancelled: false,
                cleaned: false,
                cancelCallbacks: new Set(),
                overlay: null,
                sourceElements: new Set(),
                inertRecords: [],
                previousFocus: this.document.activeElement instanceof this.window.HTMLElement
                    ? this.document.activeElement
                    : null,
                bodyActiveValue: this.document.body ? this.document.body.getAttribute('data-black-moon-active') : null,
                bodyAriaBusyValue: this.document.body ? this.document.body.getAttribute('aria-busy') : null,
                blocker: null
            };
        }

        throwIfCancelled(run) {
            if (run.cancelled) throw CANCELLED;
        }

        wait(ms, run) {
            this.throwIfCancelled(run);
            if (ms <= 0) return Promise.resolve();
            return new Promise((resolve, reject) => {
                const timer = this.window.setTimeout(() => {
                    run.cancelCallbacks.delete(cancel);
                    resolve();
                }, ms);
                const cancel = () => {
                    this.window.clearTimeout(timer);
                    run.cancelCallbacks.delete(cancel);
                    reject(CANCELLED);
                };
                run.cancelCallbacks.add(cancel);
            });
        }

        animate(run, durationMs, update) {
            this.throwIfCancelled(run);
            if (durationMs <= 0) {
                update(1);
                return Promise.resolve();
            }
            return new Promise((resolve, reject) => {
                const startedAt = this.window.performance.now();
                let frameId = 0;
                const cancel = () => {
                    if (frameId) this.window.cancelAnimationFrame(frameId);
                    run.cancelCallbacks.delete(cancel);
                    reject(CANCELLED);
                };
                const frame = (now) => {
                    if (run.cancelled) {
                        cancel();
                        return;
                    }
                    const progress = Math.min(1, Math.max(0, (now - startedAt) / durationMs));
                    update(progress);
                    if (progress >= 1) {
                        run.cancelCallbacks.delete(cancel);
                        resolve();
                        return;
                    }
                    frameId = this.window.requestAnimationFrame(frame);
                };
                run.cancelCallbacks.add(cancel);
                frameId = this.window.requestAnimationFrame(frame);
            });
        }

        setup(run) {
            const doc = this.document;
            const view = this.window;
            const body = doc.body;
            if (!body) throw new Error('Black Moon Howl could not find the document body.');

            const overlay = doc.createElement('section');
            overlay.className = 'vtt-black-moon-overlay';
            overlay.dataset.blackMoonOverlay = '1';
            overlay.dataset.phase = 'replacement';
            overlay.setAttribute('aria-label', 'Black Moon Howl presentation');
            overlay.innerHTML = `
                <div class="vtt-black-moon-replacements" aria-hidden="true"></div>
                <div class="vtt-black-moon-centre" aria-hidden="true" hidden>
                    <div class="vtt-black-moon-question"></div>
                    <div class="vtt-black-moon-answer"></div>
                </div>
            `;
            run.overlay = overlay;

            const collected = collectVisibleText(doc, view, overlay);
            const replacements = overlay.querySelector('.vtt-black-moon-replacements');
            const fragment = doc.createDocumentFragment();
            collected.entries.forEach((entry) => {
                const element = buildOverlayEntry(doc, entry);
                entry.element = element;
                entry.lastCount = -1;
                fragment.appendChild(element);
            });
            replacements.appendChild(fragment);
            run.entries = collected.entries;
            run.sourceElements = collected.sources;

            body.appendChild(overlay);
            run.sourceElements.forEach((element) => element.classList.add(SOURCE_HIDDEN_CLASS));
            Array.from(body.children).forEach((element) => {
                if (element === overlay) return;
                run.inertRecords.push({
                    element,
                    hadAttribute: element.hasAttribute('inert'),
                    value: element.getAttribute('inert')
                });
                element.setAttribute('inert', '');
            });
            body.dataset.blackMoonActive = 'true';
            body.setAttribute('aria-busy', 'true');
            if (run.previousFocus && typeof run.previousFocus.blur === 'function') run.previousFocus.blur();

            run.blocker = (event) => {
                if (!this.activeRun || this.activeRun !== run) return;
                if (event.cancelable) event.preventDefault();
                event.stopImmediatePropagation();
            };
            BLOCKED_EVENTS.forEach((eventName) => {
                view.addEventListener(eventName, run.blocker, { capture: true, passive: false });
            });
        }

        cleanup(run) {
            if (!run || run.cleaned) return;
            run.cleaned = true;
            run.cancelCallbacks.forEach((cancel) => {
                try { cancel(); } catch (err) { }
            });
            run.cancelCallbacks.clear();
            if (run.blocker) {
                BLOCKED_EVENTS.forEach((eventName) => {
                    this.window.removeEventListener(eventName, run.blocker, { capture: true });
                });
            }
            run.sourceElements.forEach((element) => {
                if (element && element.classList) element.classList.remove(SOURCE_HIDDEN_CLASS);
            });
            run.inertRecords.forEach(({ element, hadAttribute, value }) => {
                if (!element) return;
                if (hadAttribute) element.setAttribute('inert', value === null ? '' : value);
                else element.removeAttribute('inert');
            });
            if (run.overlay && run.overlay.isConnected) run.overlay.remove();
            const body = this.document.body;
            if (body) {
                if (run.bodyActiveValue === null) body.removeAttribute('data-black-moon-active');
                else body.setAttribute('data-black-moon-active', run.bodyActiveValue);
                if (run.bodyAriaBusyValue === null) body.removeAttribute('aria-busy');
                else body.setAttribute('aria-busy', run.bodyAriaBusyValue);
            }
            if (run.previousFocus && run.previousFocus.isConnected && typeof run.previousFocus.focus === 'function') {
                try { run.previousFocus.focus({ preventScroll: true }); } catch (err) { }
            }
            if (this.activeRun === run) this.activeRun = null;
        }

        async typeText(element, text, durationMs, run) {
            element.textContent = '';
            await this.animate(run, durationMs, (progress) => {
                const count = Math.min(text.length, Math.ceil(text.length * progress));
                if (element.textContent.length !== count) element.textContent = text.slice(0, count);
            });
        }

        async trigger(options = {}) {
            const source = options && typeof options === 'object' ? options : {};
            const effectId = String(source.effectId || `black_moon_${Date.now().toString(36)}`).trim().slice(0, 120);
            if (this.activeRun) return { ok: false, reason: 'active', effectId: this.activeRun.effectId };
            if (this.seenEffectIds.has(effectId)) return { ok: false, reason: 'duplicate', effectId };
            this.rememberEffectId(effectId);
            const run = this.createRun(effectId);
            this.activeRun = run;

            try {
                const startsAt = toNonNegativeMs(source.startsAt, 0);
                if (startsAt > Date.now()) await this.wait(startsAt - Date.now(), run);
                this.throwIfCancelled(run);
                this.setup(run);

                await this.animate(run, this.timings.replacementMs, (progress) => {
                    run.entries.forEach((entry) => {
                        const length = Math.max(entry.original.length, entry.target.length);
                        const count = Math.min(length, Math.ceil(length * progress));
                        if (count === entry.lastCount) return;
                        entry.lastCount = count;
                        entry.element.textContent = blendText(entry.original, entry.target, count);
                    });
                });
                await this.wait(this.timings.holdMs, run);

                run.overlay.dataset.phase = 'black';
                const replacementLayer = run.overlay.querySelector('.vtt-black-moon-replacements');
                if (replacementLayer) replacementLayer.replaceChildren();
                const centre = run.overlay.querySelector('.vtt-black-moon-centre');
                const question = run.overlay.querySelector('.vtt-black-moon-question');
                const answer = run.overlay.querySelector('.vtt-black-moon-answer');
                centre.hidden = false;
                await this.typeText(question, QUESTION, this.timings.questionTypeMs, run);
                await this.wait(this.timings.questionPauseMs, run);
                await this.typeText(answer, ANSWER, this.timings.answerTypeMs, run);
                await this.wait(this.timings.answerHoldMs, run);
                return { ok: true, reason: 'complete', effectId };
            } catch (err) {
                if (err === CANCELLED || run.cancelled) return { ok: false, reason: 'cancelled', effectId };
                console.error('Black Moon Howl presentation failed', err);
                return {
                    ok: false,
                    reason: 'error',
                    effectId,
                    error: err && err.message ? err.message : String(err || 'Unknown error')
                };
            } finally {
                this.cleanup(run);
            }
        }

        cancel() {
            const run = this.activeRun;
            if (!run) return false;
            run.cancelled = true;
            this.cleanup(run);
            return true;
        }
    }

    return Object.freeze({
        ANSWER,
        DEFAULT_TIMINGS,
        PHRASES,
        QUESTION,
        create: (options = {}) => new BlackMoonHowlController(options)
    });
}));
