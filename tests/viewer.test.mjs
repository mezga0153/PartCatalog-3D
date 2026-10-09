import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { launch, EXAMPLES, setValue, row, sleep } from './browser.mjs';

const apps = [];
after(() => Promise.all(apps.map(app => app.close())));

const POPUP = `document.querySelector('.mesh-popup').style.display === 'none' ? null : document.querySelector('.mesh-popup').innerText.replace(/\\n/g, ' | ')`;

test('clicking a part selects it, shows the popup and dimension lines', async () => {
    const app = await launch();
    apps.push(app);
    await app.loadDemo();
    await app.click(700, 450);
    await app.waitFor(`window.partCatalog.store.selectedUuids.size === 1`);
    
    assert.match(await app.ev(POPUP), /^k2 - leva \| Dimensions: 600 × 500 × 18 mm .*Edge banding: W1 H3430 Egger \(500 mm\)/);
    assert.deepEqual(await app.ev(`[...document.querySelectorAll('.dimension-label')].map(l => l.textContent)`), ['L 600 mm', 'W 500 mm', 'T 18 mm']);
    assert.ok(await app.ev(`document.querySelector('#partsPane tr.selected') !== null`));
    
    // Units follow everywhere, including the open popup
    await app.ev(setValue('.units', 'in'));
    assert.match(await app.ev(POPUP), /Dimensions: 23 5\/8 × 19 11\/16 × 11\/16 in/);
    assert.deepEqual(await app.ev(`[...document.querySelectorAll('.dimension-label')].map(l => l.textContent)`), ['L 23 5/8 in', 'W 19 11/16 in', 'T 11/16 in']);
    await app.ev(setValue('.units', 'mm'));
    
    // Clicking empty space deselects
    await app.click(1300, 800);
    await app.waitFor(`window.partCatalog.store.selectedUuids.size === 0`);
    assert.equal(await app.ev(`document.querySelectorAll('.dimension-label').length`), 0);
    assert.deepEqual(app.errors, []);
});

test('hovering in 3D highlights the row; clicking reveals it in a collapsed section', async () => {
    const app = await launch({ width: 1400, height: 500 });
    apps.push(app);
    await app.loadFile(path.join(EXAMPLES, 'two-cabinets.glb'));
    await app.ev(`document.querySelector('.combine-identical').click()`);
    await app.ev(setValue('.group-by', 'assembly'));
    await app.ev(`[...document.querySelectorAll('.section-row')].find(r => r.innerText.includes('Cabinet B')).click()`);
    
    // Screen position of a part's centre
    const [x, y] = await app.ev(`(() => {
        const entry = window.partCatalog.store.parts.find(m => m.name === 'B-k1 - gor');
        const box = new entry.threeMeshes[0].geometry.boundingBox.constructor();
        entry.threeMeshes.forEach(mesh => box.expandByObject(mesh));
        const c = box.getCenter(entry.threeMeshes[0].position.clone()).project(window.partCatalog.cameraManager.camera);
        return [Math.round((c.x + 1) / 2 * innerWidth), Math.round((1 - c.y) / 2 * innerHeight)];
    })()`);
    await app.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await app.waitFor(`window.partCatalog.store.findPart(window.partCatalog.store.sceneHoverUuid)?.name === 'B-k1 - gor'`);
    assert.equal(await app.ev(`window.partCatalog.highlighter.boxes.length`), 1);
    
    await app.click(x, y);
    await app.waitFor(`document.querySelector('#partsPane tr.selected') !== null`);
    assert.match(await app.ev(`document.querySelector('#partsPane tr.selected').innerText`), /B-k1 - gor/);
    assert.deepEqual(app.errors, []);
});

test('isolate fades everything but the selection', async () => {
    const app = apps[1];
    await app.ev(`window.partCatalog.toolbar.isolateBtn.click()`);
    const opacities = await app.ev(`window.partCatalog.store.parts.map(m => m.name + ' ' + m.threeMeshes[0].material.opacity)`);
    assert.ok(opacities.includes('B-k1 - gor 1'));
    assert.equal(opacities.filter(o => o.endsWith(' 0.06')).length, 9);
    await app.ev(`window.partCatalog.toolbar.isolateBtn.click()`);
    assert.equal(await app.ev(`window.partCatalog.store.parts.filter(m => m.threeMeshes[0].material.opacity === 0.06).length`), 0);
});

test('explode moves parts apart and the button recovers after loading another model', async () => {
    const app = apps[0];
    await app.ev(`document.querySelector('[title="Explode Model"]').click()`);
    await app.waitFor(`window.partCatalog.toolbar.isExploded && !window.partCatalog.toolbar.isAnimating`);
    assert.ok(await app.ev(`window.partCatalog.store.parts.some(m => m.threeObject.position.length() > 0.1)`));
    
    await app.loadDemo();
    assert.equal(await app.ev(`document.querySelector('[title="Explode Model"]').disabled`), false);
});

test('a GLB dropped anywhere on the page is loaded', async () => {
    const app = apps[0];
    const bytes = (await import('node:fs')).readFileSync(path.join(EXAMPLES, 'banded-panels.glb')).toString('base64');
    await app.ev(`window.partCatalog.fileUpload.close(); window.__glb = Uint8Array.from(atob('${bytes}'), c => c.charCodeAt(0))`);
    const drop = type => app.ev(`(() => { const dt = new DataTransfer(); dt.items.add(new File([window.__glb], 'dropped.glb')); document.querySelector('canvas').dispatchEvent(new DragEvent('${type}', { bubbles: true, cancelable: true, dataTransfer: dt })); })()`);
    await drop('dragenter');
    assert.ok(await app.ev(`document.body.classList.contains('file-drag-active')`));
    await drop('drop');
    await app.waitFor(`document.title.includes('dropped.glb')`);
    assert.equal(await app.ev(`window.partCatalog.store.parts.length`), 4);
    assert.equal(await app.ev(`document.body.classList.contains('file-drag-active')`), false);
    assert.deepEqual(app.errors, []);
});

test('on a phone the sidebar is a foldable bottom sheet without sideways scrolling', async () => {
    const app = await launch({ width: 390, height: 844, mobile: true });
    apps.push(app);
    await app.loadDemo();
    assert.equal(await app.ev('document.documentElement.scrollWidth'), 390);
    await app.ev(`document.querySelector('.sidebar-collapse').click()`);
    assert.ok(await app.ev(`document.getElementById('sidebar').offsetHeight < 80`));
    await app.ev(`document.querySelector('[data-pane="summaryPane"]').click()`);
    assert.equal(await app.ev(`document.getElementById('sidebar').classList.contains('collapsed')`), false);
    assert.deepEqual(app.errors, []);
});
