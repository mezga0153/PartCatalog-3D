// Drives the app in headless Chrome over the DevTools protocol. Uses only Node
// built-ins and a local Chrome; set CHROME_PATH if Chrome isn't in the default place.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
export const EXAMPLES = path.join(ROOT, 'examples');
export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const CHROME_PATHS = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser'
].filter(Boolean);

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.glb': 'model/gltf-binary', '.png': 'image/png' };

// Static file server for the project on a free port
function startServer() {
    const server = http.createServer((req, res) => {
        const file = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
        if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
            res.writeHead(404).end();
            return;
        }
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
        fs.createReadStream(file).pipe(res);
    });
    return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

export async function launch({ width = 1400, height = 900, mobile = false } = {}) {
    const chromePath = CHROME_PATHS.find(p => fs.existsSync(p));
    if (!chromePath) throw new Error('Chrome not found; set CHROME_PATH');
    
    const server = await startServer();
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'partcatalog-test-'));
    const downloads = path.join(profile, 'downloads');
    const chrome = spawn(chromePath, [
        '--headless=new', '--remote-debugging-port=0', `--window-size=${width},${height}`,
        '--use-angle=swiftshader', '--enable-unsafe-swiftshader', `--user-data-dir=${profile}`, 'about:blank'
    ], { stdio: 'ignore' });
    
    // Chrome writes the port it picked to DevToolsActivePort
    let port;
    for (let i = 0; i < 100 && !port; i++) {
        try {
            port = fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0];
        } catch {
            await sleep(100);
        }
    }
    let target;
    for (let i = 0; i < 50 && !target; i++) {
        try {
            target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t => t.type === 'page');
        } catch {}
        if (!target) await sleep(100);
    }
    
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise(resolve => { ws.onopen = resolve; });
    
    let nextId = 0;
    const pending = new Map();
    const errors = [];
    ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.id && pending.has(message.id)) {
            pending.get(message.id)(message);
            pending.delete(message.id);
        } else if (message.method === 'Runtime.exceptionThrown') {
            const details = message.params.exceptionDetails;
            errors.push(details.exception?.description || details.text);
        } else if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
            errors.push(message.params.args.map(a => a.value ?? a.description).join(' '));
        }
    };
    
    const send = (method, params = {}) => new Promise(resolve => {
        const id = ++nextId;
        pending.set(id, resolve);
        ws.send(JSON.stringify({ id, method, params }));
    });
    
    // Evaluate an expression in the page and return its (JSON) value
    const ev = async (expression) => {
        const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
        if (response.result.exceptionDetails) {
            const details = response.result.exceptionDetails;
            throw new Error(`In page: ${details.exception?.description || details.text}\n${expression}`);
        }
        return response.result.result.value;
    };
    
    const waitFor = async (expression, timeout = 10000) => {
        const start = Date.now();
        while (Date.now() - start < timeout) {
            if (await ev(expression)) return;
            await sleep(50);
        }
        throw new Error(`Timed out waiting for: ${expression}`);
    };
    
    await send('Runtime.enable');
    await send('Page.enable');
    await send('DOM.enable');
    await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });
    if (mobile) await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: true });
    
    const url = `http://127.0.0.1:${server.address().port}/index.html`;
    // Mark the current document so we wait for the new one, not the old one
    const open = async () => {
        await ev('window.__previousPage = true');
        await send('Page.navigate', { url });
        await waitFor(`!window.__previousPage && !!window.fileUploadManager && !!document.querySelector('#toolbar .dropdown')`, 20000);
    };
    await open();
    
    const app = {
        send, ev, waitFor, errors, downloads,
        
        reload: open,
        
        // Loading sets the title to the file name, so clear it first to wait for this load
        async loadDemo() {
            await ev(`document.title = ''; window.fileUploadManager.loadDemo()`);
            await waitFor(`document.title.includes('demo.glb')`);
        },
        
        // Load a file through the dialog's file input
        async loadFile(file) {
            await ev(`document.title = ''`);
            const doc = await send('DOM.getDocument');
            const input = await send('DOM.querySelector', { nodeId: doc.result.root.nodeId, selector: '#fileInput' });
            await send('DOM.setFileInputFiles', { nodeId: input.result.nodeId, files: [file] });
            await waitFor(`document.title.includes(${JSON.stringify(path.basename(file))})`);
        },
        
        async click(x, y) {
            await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
            await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
        },
        
        async screenshot(file) {
            const shot = await send('Page.captureScreenshot');
            fs.writeFileSync(file, Buffer.from(shot.result.data, 'base64'));
        },
        
        async close() {
            ws.close();
            const exited = new Promise(resolve => chrome.once('exit', resolve));
            chrome.kill();
            await exited;
            server.closeAllConnections();
            server.close();
            fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
        }
    };
    return app;
}

// Text of the parts table rows (section headers start with "##")
export const ROWS = `[...document.querySelectorAll('#partsPane .parts-table tbody tr')].map(r =>
    r.classList.contains('section-row')
        ? '## ' + r.innerText.replace(/\\s+/g, ' ').trim()
        : [...r.querySelectorAll('td')].filter(td => !td.classList.contains('include') && !td.classList.contains('actions'))
            .map(td => td.innerText.replace(/\\s+/g, ' ').trim()).join(' | '))`;

// Set a <select> or text/number input and fire the event the app listens for
export function setValue(selector, value, event = 'change') {
    return `(() => { const el = document.querySelector(${JSON.stringify(selector)}); el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event(${JSON.stringify(event)})); })()`;
}

// Type into the open inline editor and press a key
export function typeInline(value, key = 'Enter') {
    return `(() => { const i = document.querySelector('.inline-edit'); i.value = ${JSON.stringify(value)}; i.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(key)} })); })()`;
}

// Index of the first table row containing some text
export function rowIndex(text) {
    return `[...document.querySelectorAll('#partsPane .parts-table tbody tr')].findIndex(r => r.innerText.includes(${JSON.stringify(text)}))`;
}

export function row(text) {
    return `document.querySelectorAll('#partsPane .parts-table tbody tr')[${rowIndex(text)}]`;
}

// A copy of demo.glb with some node/material names replaced
export function demoWithNames(nodeName, materialName) {
    const data = fs.readFileSync(path.join(ROOT, 'demo.glb'));
    const jsonLength = data.readUInt32LE(12);
    const gltf = JSON.parse(data.subarray(20, 20 + jsonLength).toString());
    gltf.nodes[1].name = nodeName;
    gltf.materials[0].name = materialName;
    
    let json = Buffer.from(JSON.stringify(gltf));
    json = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, 0x20)]);
    const rest = data.subarray(20 + jsonLength);
    const header = Buffer.alloc(20);
    header.writeUInt32LE(0x46546C67, 0);
    header.writeUInt32LE(2, 4);
    header.writeUInt32LE(20 + json.length + rest.length, 8);
    header.writeUInt32LE(json.length, 12);
    header.writeUInt32LE(0x4E4F534A, 16);
    
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'partcatalog-glb-')), 'renamed.glb');
    fs.writeFileSync(file, Buffer.concat([header, json, rest]));
    return file;
}
