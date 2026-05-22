import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const host = '127.0.0.1';

const pages = [
    'tools.html',
    'hub.html',
    'campaign-board.html',
    'board.html',
    'vtt.html',
    'gm.html',
    'index.html',
    'player-dashboard.html',
    'roster.html',
    'locations.html',
    'requisitions.html',
    'campaign-timeline.html',
    'timeline.html',
    'ledger.html',
    'encounters.html',
    'hq.html',
    'clue.html',
    'clocks.html',
    'prep-procedure.html',
    'dm-screen.html',
    'leads.html'
];

const contentTypes = {
    '.css': 'text/css; charset=utf-8',
    '.gif': 'image/gif',
    '.html': 'text/html; charset=utf-8',
    '.ico': 'image/x-icon',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.svg': 'image/svg+xml; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
    '.webp': 'image/webp'
};

function isAllowedMissingResponse(pageName, response) {
    if (pageName !== 'tools.html') return false;
    if (response.status !== 404) return false;
    try {
        const url = new URL(response.url);
        return url.pathname === '/connect.json';
    } catch (err) {
        return false;
    }
}

function isAllowedConsoleMessage(pageName, entry, allowedResponses) {
    if (pageName !== 'tools.html') return false;
    if (entry.type !== 'error') return false;
    if (!entry.text.includes('Failed to load resource')) return false;
    return allowedResponses.some((response) => {
        try {
            return new URL(response.url).pathname === '/connect.json';
        } catch (err) {
            return false;
        }
    });
}

function createStaticServer() {
    return createServer(async (req, res) => {
        try {
            const requestUrl = new URL(req.url || '/', `http://${host}`);
            const pathname = decodeURIComponent(requestUrl.pathname === '/' ? '/tools.html' : requestUrl.pathname);
            const filePath = path.resolve(rootDir, `.${pathname}`);

            if (filePath !== rootDir && !filePath.startsWith(`${rootDir}${path.sep}`)) {
                res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
                res.end('Forbidden');
                return;
            }

            const data = await readFile(filePath);
            const ext = path.extname(filePath).toLowerCase();
            res.writeHead(200, {
                'cache-control': 'no-store',
                'content-type': contentTypes[ext] || 'application/octet-stream'
            });
            res.end(data);
        } catch (err) {
            res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
            res.end('Not found');
        }
    });
}

async function listen(server) {
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, host, resolve);
    });
    const address = server.address();
    if (!address || typeof address !== 'object') {
        throw new Error('Smoke server did not expose a TCP address.');
    }
    return address.port;
}

async function closeServer(server) {
    await new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
    });
}

function formatIssue(issue) {
    if (issue.kind === 'response') return `${issue.status} ${issue.url}`;
    if (issue.kind === 'console') return `console.${issue.type}: ${issue.text}`;
    if (issue.kind === 'pageerror') return `pageerror: ${issue.text}`;
    if (issue.kind === 'requestfailed') return `request failed: ${issue.url} (${issue.failure || 'unknown failure'})`;
    if (issue.kind === 'root') return issue.text;
    return JSON.stringify(issue);
}

async function smokePage(browser, baseUrl, pageName) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const responses = [];
    const allowedResponses = [];
    const consoleEntries = [];
    const pageErrors = [];
    const requestFailures = [];

    page.on('response', (response) => {
        const status = response.status();
        if (status < 400) return;
        const entry = { kind: 'response', status, url: response.url() };
        if (isAllowedMissingResponse(pageName, entry)) {
            allowedResponses.push(entry);
            return;
        }
        responses.push(entry);
    });

    page.on('console', (message) => {
        const type = message.type();
        if (type !== 'error' && type !== 'warning') return;
        consoleEntries.push({ kind: 'console', type, text: message.text() });
    });

    page.on('pageerror', (err) => {
        pageErrors.push({ kind: 'pageerror', text: err && err.message ? err.message : String(err) });
    });

    page.on('requestfailed', (request) => {
        requestFailures.push({
            kind: 'requestfailed',
            url: request.url(),
            failure: request.failure() && request.failure().errorText
        });
    });

    let title = '';
    let rootState = null;
    try {
        await page.goto(`${baseUrl}/${pageName}`, { waitUntil: 'domcontentloaded', timeout: 10000 });
        await page.waitForTimeout(750);
        title = await page.title();
        rootState = await page.evaluate(() => ({
            hasBody: !!document.body,
            bodyChildren: document.body ? document.body.children.length : 0,
            hasVisibleText: !!(document.body && document.body.innerText && document.body.innerText.trim()),
            readyState: document.readyState
        }));
    } catch (err) {
        pageErrors.push({ kind: 'pageerror', text: err && err.message ? err.message : String(err) });
    } finally {
        await page.close();
    }

    const filteredConsole = consoleEntries.filter((entry) => !isAllowedConsoleMessage(pageName, entry, allowedResponses));
    const issues = [
        ...responses,
        ...requestFailures,
        ...pageErrors,
        ...filteredConsole
    ];

    if (!rootState || !rootState.hasBody || rootState.bodyChildren < 1 || !rootState.hasVisibleText) {
        issues.push({
            kind: 'root',
            text: `missing usable document body (${JSON.stringify(rootState)})`
        });
    }

    return {
        page: pageName,
        title,
        ok: issues.length === 0,
        issues,
        allowedResponses
    };
}

async function main() {
    const server = createStaticServer();
    const port = await listen(server);
    const baseUrl = `http://${host}:${port}`;
    let browser = null;
    const results = [];

    try {
        browser = await chromium.launch({ headless: true, chromiumSandbox: false });
        for (const pageName of pages) {
            const result = await smokePage(browser, baseUrl, pageName);
            results.push(result);
            const status = result.ok ? 'ok' : 'FAIL';
            const title = result.title ? ` - ${result.title}` : '';
            console.log(`${status.padEnd(4)} ${pageName}${title}`);
        }
    } finally {
        if (browser) await browser.close();
        await closeServer(server);
    }

    const failures = results.filter((result) => !result.ok);
    if (failures.length) {
        console.error('\nStatic smoke failures:');
        failures.forEach((result) => {
            console.error(`\n${result.page}:`);
            result.issues.forEach((issue) => {
                console.error(`  - ${formatIssue(issue)}`);
            });
        });
        process.exitCode = 1;
        return;
    }

    const optionalMisses = results.reduce((count, result) => count + result.allowedResponses.length, 0);
    const optionalText = optionalMisses ? ` (${optionalMisses} optional missing asset allowed)` : '';
    console.log(`\nStatic smoke passed: ${results.length} pages${optionalText}.`);
}

main().catch((err) => {
    console.error(err && err.stack ? err.stack : err);
    process.exitCode = 1;
});
