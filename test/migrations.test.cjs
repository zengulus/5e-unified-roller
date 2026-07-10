const test = require('node:test');
const assert = require('node:assert/strict');
const Migrations = require('../js/data-migrations.js');

test('legacy V2 character becomes a multi-character bundle without mutation', () => {
    const legacy = { meta: { name: 'Niv' }, vitals: { curr: 7 } };
    const bundle = Migrations.migrateLegacyCharacterV2(legacy);
    assert.equal(bundle.activeId, 'char_imported');
    assert.strictEqual(bundle.characters.char_imported, legacy);
    assert.deepEqual(legacy, { meta: { name: 'Niv' }, vitals: { curr: 7 } });
});

test('legacy parser rejects malformed and non-object payloads', () => {
    assert.throws(() => Migrations.parseLegacyCharacterV2('{'));
    assert.throws(() => Migrations.parseLegacyCharacterV2('[]'), /must be an object/);
    assert.equal(Migrations.parseLegacyCharacterV2(''), null);
});
