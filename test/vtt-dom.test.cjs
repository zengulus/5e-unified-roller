'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const vttDom = require('../js/vtt-dom.js');

const readWorkspaceFile = (relativePath) => fs.readFileSync(
    path.join(__dirname, '..', relativePath),
    'utf8'
);

const createDocumentHarness = () => {
    const calls = {
        ids: [],
        selectors: [],
        lists: []
    };
    const body = { kind: 'body' };
    const idNodes = new Map(Object.values(vttDom.ID_REFS).map((id) => [
        id,
        { kind: 'id', value: id }
    ]));
    const selectorNodes = new Map(Object.values(vttDom.SELECTOR_REFS).map((selector) => [
        selector,
        { kind: 'selector', value: selector }
    ]));
    const listNodes = new Map(Object.values(vttDom.LIST_SELECTOR_REFS).map((selector) => [
        selector,
        new Set([
            { kind: 'list', value: `${selector}:first` },
            { kind: 'list', value: `${selector}:second` }
        ])
    ]));
    const documentRef = {
        body,
        getElementById(id) {
            calls.ids.push(id);
            return idNodes.get(id);
        },
        querySelector(selector) {
            calls.selectors.push(selector);
            return selectorNodes.get(selector);
        },
        querySelectorAll(selector) {
            calls.lists.push(selector);
            return listNodes.get(selector);
        }
    };

    return { body, calls, documentRef, idNodes, listNodes, selectorNodes };
};

test('VTT DOM registry queries and returns every declared reference under its contract key', () => {
    const harness = createDocumentHarness();
    const refs = vttDom.create(harness.documentRef);

    assert.strictEqual(refs.body, harness.body);
    assert.deepEqual(harness.calls.ids, Object.values(vttDom.ID_REFS));
    assert.deepEqual(harness.calls.selectors, Object.values(vttDom.SELECTOR_REFS));
    assert.deepEqual(harness.calls.lists, Object.values(vttDom.LIST_SELECTOR_REFS));

    Object.entries(vttDom.ID_REFS).forEach(([key, id]) => {
        assert.strictEqual(refs[key], harness.idNodes.get(id), `${key} should resolve #${id}`);
    });
    Object.entries(vttDom.SELECTOR_REFS).forEach(([key, selector]) => {
        assert.strictEqual(
            refs[key],
            harness.selectorNodes.get(selector),
            `${key} should resolve ${selector}`
        );
    });
    Object.entries(vttDom.LIST_SELECTOR_REFS).forEach(([key, selector]) => {
        assert.equal(Array.isArray(refs[key]), true, `${key} should be materialized as an array`);
        assert.deepEqual(refs[key], Array.from(harness.listNodes.get(selector)));
        assert.notStrictEqual(refs[key], harness.listNodes.get(selector));
    });

    assert.deepEqual(
        Object.keys(refs),
        [
            'body',
            ...Object.keys(vttDom.ID_REFS),
            ...Object.keys(vttDom.SELECTOR_REFS),
            ...Object.keys(vttDom.LIST_SELECTOR_REFS)
        ],
        'the result should not omit or add registry keys'
    );
});

test('VTT DOM registry exposes frozen maps and returns a frozen reference object', () => {
    const refs = vttDom.create(createDocumentHarness().documentRef);

    assert.equal(Object.isFrozen(vttDom), true);
    assert.equal(Object.isFrozen(vttDom.ID_REFS), true);
    assert.equal(Object.isFrozen(vttDom.SELECTOR_REFS), true);
    assert.equal(Object.isFrozen(vttDom.LIST_SELECTOR_REFS), true);
    assert.equal(Object.isFrozen(refs), true);

    assert.throws(() => {
        vttDom.ID_REFS.stageEl = 'replacement-stage';
    }, TypeError);
    assert.throws(() => {
        refs.stageEl = null;
    }, TypeError);
});

test('VTT DOM registry rejects invalid document-like inputs', () => {
    [
        undefined,
        null,
        {},
        { getElementById() { } },
        { querySelector() { } },
        { getElementById: true, querySelector() { } },
        { getElementById() { }, querySelector: true }
    ].forEach((documentRef) => {
        assert.throws(
            () => vttDom.create(documentRef),
            /requires a document-like object/
        );
    });

    assert.throws(
        () => vttDom.create({
            getElementById() { return null; },
            querySelector() { return null; }
        }),
        TypeError,
        'querySelectorAll is also required to materialize list references'
    );
});

test('every registered ID exists in vtt.html and the DOM registry loads before vtt.js', () => {
    const html = readWorkspaceFile('vtt.html');
    const htmlIds = new Set(
        [...html.matchAll(/\bid\s*=\s*(["'])(.*?)\1/gi)].map((match) => match[2])
    );

    Object.entries(vttDom.ID_REFS).forEach(([key, id]) => {
        assert.equal(htmlIds.has(id), true, `${key} references missing vtt.html ID #${id}`);
    });

    const scriptSources = [...html.matchAll(/<script\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1[^>]*>/gi)]
        .map((match) => match[2]);
    const domScriptIndex = scriptSources.findIndex((src) => /^js\/vtt-dom\.js(?:\?|$)/.test(src));
    const controllerScriptIndex = scriptSources.findIndex((src) => /^js\/vtt\.js(?:\?|$)/.test(src));

    assert.notEqual(domScriptIndex, -1, 'vtt.html should load js/vtt-dom.js');
    assert.notEqual(controllerScriptIndex, -1, 'vtt.html should load js/vtt.js');
    assert.ok(domScriptIndex < controllerScriptIndex, 'vtt-dom.js should load before vtt.js');
});
