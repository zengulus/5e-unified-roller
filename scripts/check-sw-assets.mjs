import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const swSource = await readFile(path.join(root, 'sw.js'), 'utf8');
const sandbox = {
    URL,
    fetch: async () => {},
    caches: {},
    self: { addEventListener() {}, skipWaiting() {}, clients: { claim() {} }, location: { origin: 'http://local' } }
};
vm.runInNewContext(`${swSource}\nglobalThis.__shellAssets = SHELL_ASSETS;`, sandbox, { filename: 'sw.js' });
const assets = Array.from(sandbox.__shellAssets || []);
assert.ok(assets.length > 0, 'SHELL_ASSETS must not be empty');
assert.equal(new Set(assets).size, assets.length, 'SHELL_ASSETS contains duplicates');

for (const asset of assets) {
    if (asset === './') continue;
    await access(path.join(root, asset.replace(/^\.\//, '')));
}

const htmlFiles = (await readdir(root)).filter((name) => name.endsWith('.html'));
const required = new Set(['./manifest.json', './icon.svg']);
for (const htmlFile of htmlFiles) {
    required.add(`./${htmlFile}`);
    const html = await readFile(path.join(root, htmlFile), 'utf8');
    for (const match of html.matchAll(/(?:src|href)=["']((?:css|js)\/[^"'?#]+|manifest\.json|icon\.svg)/g)) {
        required.add(`./${match[1]}`);
    }
    for (const match of html.matchAll(/import\(["'](\.\/js\/[^"'?#]+)/g)) {
        required.add(match[1]);
    }
}

const missing = [...required].filter((asset) => !assets.includes(asset)).sort();
assert.deepEqual(missing, [], `SHELL_ASSETS is missing:\n${missing.join('\n')}`);

const moduleQueue = assets.filter((asset) => /\.(?:js|mjs)$/.test(asset));
const checkedModules = new Set();
while (moduleQueue.length) {
    const asset = moduleQueue.shift();
    if (checkedModules.has(asset)) continue;
    checkedModules.add(asset);
    const source = await readFile(path.join(root, asset.replace(/^\.\//, '')), 'utf8');
    for (const match of source.matchAll(/^\s*import\s+(?:[^'";]+?\s+from\s+)?["']([^"']+)["']/gm)) {
        if (!match[1].startsWith('.')) continue;
        const imported = `./${path.posix.normalize(path.posix.join(path.posix.dirname(asset.replace(/^\.\//, '')), match[1].split('?')[0]))}`;
        assert.ok(assets.includes(imported), `${asset} imports uncached module ${imported}`);
        moduleQueue.push(imported);
    }
}

console.log(`ok   service worker assets (${assets.length} cached, ${required.size} directly required, ${checkedModules.size} modules checked)`);
