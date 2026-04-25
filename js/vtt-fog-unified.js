(function () {
    const STYLE_ID = 'vtt-static-fog-style';

    const installStaticFogStyle = () => {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            #vtt-fog-layer > .vtt-fog-mask:not(.is-preview):not(.is-remove-preview) {
                background: rgba(128, 128, 128, 0.75) !important;
                opacity: 1 !important;
                box-shadow: none !important;
                filter: none !important;
                overflow: hidden !important;
            }

            #vtt-fog-layer > .vtt-fog-mask:not(.is-preview):not(.is-remove-preview)::before,
            #vtt-fog-layer > .vtt-fog-mask:not(.is-preview):not(.is-remove-preview)::after {
                content: none !important;
                display: none !important;
                animation: none !important;
            }
        `;
        document.head.appendChild(style);
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', installStaticFogStyle, { once: true });
    } else {
        installStaticFogStyle();
    }
}());
