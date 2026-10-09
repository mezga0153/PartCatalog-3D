import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { launch, EXAMPLES, ROWS, setValue, typeInline, row, rowIndex } from './browser.mjs';

let app;
before(async () => { app = await launch(); });
after(() => app.close());

const setCombine = on => `(() => { const c = document.querySelector('.combine-identical'); if (c.checked !== ${on}) c.click(); })()`;

test('identical parts are combined with a quantity', async () => {
    await app.loadDemo();
    assert.deepEqual(await app.ev(ROWS), [
        'k2 - leva, k2 - desna | 2 | 600 | 500 | 18 | default material | W1 | –',
        'k1 - dol, k1 - gor | 2 | 600 | 450 | 18 | H3430 Egger | – | W',
        'k1 - hrbet | 1 | 500 | 486 | 3 | default material | – | –'
    ]);
    assert.equal(await app.ev(`document.querySelector('.parts-count').textContent`), '5');
});

test('sorting, searching and the empty message', async () => {
    await app.ev(setCombine(false));
    await app.ev(`document.querySelector('th[data-key="width"]').click()`);
    assert.deepEqual((await app.ev(ROWS)).map(r => r.split(' | ')[0]), ['k1 - dol', 'k1 - gor', 'k1 - hrbet', 'k2 - leva Merged: 2 materials', 'k2 - desna Merged: 2 materials']);
    await app.ev(`document.querySelector('th[data-key="width"]').click()`);
    await app.ev(`document.querySelector('th[data-key="width"]').click()`);
    
    await app.ev(setValue('.parts-search', 'egger', 'input'));
    assert.equal((await app.ev(ROWS)).length, 4);
    assert.equal(await app.ev(`document.querySelector('.parts-count').textContent`), '4 / 5');
    await app.ev(setValue('.parts-search', 'zzz', 'input'));
    assert.equal(await app.ev(`document.querySelector('.parts-empty').textContent`), 'No parts match your search.');
    await app.ev(setValue('.parts-search', '', 'input'));
});

test('grouping by material and assembly, with collapsible sections', async () => {
    await app.ev(setCombine(true));
    await app.ev(setValue('.group-by', 'material'));
    assert.deepEqual((await app.ev(ROWS)).filter(r => r.startsWith('##')), [
        '## default material 3 parts · 0.84 m²',
        '## H3430 Egger 2 parts · 0.54 m²'
    ]);
    
    await app.loadFile(path.join(EXAMPLES, 'two-cabinets.glb'));
    await app.ev(setValue('.group-by', 'assembly'));
    const rows = await app.ev(ROWS);
    assert.deepEqual(rows.filter(r => r.startsWith('##')), ['## Cabinet A 5 parts · 1.38 m²', '## Cabinet B 5 parts · 1.38 m²']);
    
    await app.ev(`document.querySelector('.section-row').click()`);
    assert.equal((await app.ev(ROWS)).length, rows.length - 3);
    await app.ev(`document.querySelector('.section-row').click()`);
    await app.ev(setValue('.group-by', 'none'));
});

test('excluded parts are ghosted and left out of the export count', async () => {
    await app.loadDemo();
    await app.ev(`${row('k1 - hrbet')}.querySelector('.include input').click()`);
    assert.equal(await app.ev(`window.meshStore.meshes.find(m => m.name === 'k1 - hrbet').threeMeshes[0].material.opacity`), 0.15);
    assert.deepEqual(await app.ev(`(() => { const h = document.querySelector('th.include input'); return [h.checked, h.indeterminate]; })()`), [false, true]);
    assert.equal(await app.ev(`document.querySelector('#toolbar .dropdown [data-bs-toggle]').title`), 'Export cut list (4 parts)');
    
    await app.ev(`document.querySelector('th.include input').click()`);
    assert.equal(await app.ev(`window.meshStore.meshes.every(m => m.isIncluded)`), true);
});

test('splitting and merging keeps hidden, included, name and quantity state', async () => {
    await app.ev(setCombine(false));
    const leva = `window.meshStore.meshes.find(m => m.name === 'k2 - leva')`;
    await app.ev(`window.meshStore.setIncluded([${leva}.uuid], false); window.meshStore.setQuantity(${leva}.uuid, 3)`);
    await app.ev(`${row('k2 - leva')}.querySelector('[title="List each material as a separate part"]').click()`);
    
    const pieces = await app.ev(`window.meshStore.meshes.filter(m => m.name === 'k2 - leva').map(m => [m.materialName, m.isIncluded, m.quantity].join(' '))`);
    assert.deepEqual(pieces, ['default material false 3', 'H3430 Egger false 3']);
    assert.match(await app.ev(`${row('k2 - leva')}.innerText`), /Split piece of k2 - leva/);
    
    await app.ev(`${row('k2 - leva')}.querySelector('[title="Merge back into one part"]').click()`);
    assert.deepEqual(await app.ev(`window.meshStore.meshes.filter(m => m.name === 'k2 - leva').map(m => [m.mergedCount, m.isIncluded, m.quantity].join(' '))`), ['2 false 3']);
    await app.ev(`window.meshStore.setIncluded([${leva}.uuid], true); window.meshStore.setQuantity(${leva}.uuid, 1)`);
});

test('inline editing of names, quantities and notes', async () => {
    await app.ev(`${row('k1 - hrbet')}.querySelector('.part-name').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`);
    await app.ev(typeInline('Back panel'));
    await app.ev(`${row('Back panel')}.querySelector('.qty').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`);
    await app.ev(typeInline('4'));
    await app.ev(`${row('k1 - gor')}.querySelector('[title="Add note"]').click()`);
    await app.ev(typeInline('Drill shelf pins'));
    
    // Escape cancels
    await app.ev(`${row('k1 - dol')}.querySelector('.part-name').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`);
    await app.ev(typeInline('Nope', 'Escape'));
    
    const rows = await app.ev(ROWS);
    assert.ok(rows.includes('Back panel | 4 | 500 | 486 | 3 | default material | – | –'));
    assert.ok(rows.some(r => r.startsWith('k1 - gor Drill shelf pins')));
    assert.ok(rows.some(r => r.startsWith('k1 - dol |')));
});

test('edits and settings are remembered for the same model', async () => {
    const before = await app.ev(ROWS);
    await new Promise(resolve => setTimeout(resolve, 500)); // saves are debounced
    await app.reload();
    await app.loadDemo();
    assert.deepEqual(await app.ev(ROWS), before);
    assert.equal(await app.ev(`document.querySelector('.combine-identical').checked`), false);
    
    // Another model starts clean
    await app.loadFile(path.join(EXAMPLES, 'banded-panels.glb'));
    assert.equal(await app.ev(`window.meshStore.meshes.filter(m => m.quantity !== 1 || m.notes).length`), 0);
    await app.ev('localStorage.clear()');
});

test('no errors in the page', () => {
    assert.deepEqual(app.errors, []);
});
