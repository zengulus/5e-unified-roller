(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.RTF_DATA_MIGRATIONS = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    function migrateLegacyCharacterV2(value, id = 'char_imported') {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            throw new TypeError('Legacy character payload must be an object.');
        }
        const safeId = String(id || 'char_imported').replace(/[^A-Za-z0-9_-]/g, '') || 'char_imported';
        return { activeId: safeId, characters: { [safeId]: value } };
    }

    function parseLegacyCharacterV2(raw, id) {
        if (typeof raw !== 'string' || !raw.trim()) return null;
        return migrateLegacyCharacterV2(JSON.parse(raw), id);
    }

    return Object.freeze({ migrateLegacyCharacterV2, parseLegacyCharacterV2 });
}));
