import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { launch, EXAMPLES, demoWithNames } from './browser.mjs';

let app;
before(async () => { app = await launch(); });
after(() => app.close());

const PARTS = `window.meshStore.meshes.map(m => [m.name, m.size.length, m.size.width, m.size.thickness].map(v => typeof v === 'number' ? Math.round(v) : v).join(' '))`;

test('demo parts get real sizes, names, board material, banding and grain', async () => {
    await app.loadDemo();
    const parts = await app.ev(`window.meshStore.meshes.map(m => ({
        name: m.name,
        size: [m.size.length, m.size.width, m.size.thickness].map(Math.round).join(' x '),
        material: m.materialName,
        edges: Object.entries(m.edges).filter(([, v]) => v).map(([k, v]) => k + '=' + v).join(','),
        grain: m.grain
    }))`);
    assert.deepEqual(parts, [
        { name: 'k2 - leva', size: '600 x 500 x 18', material: 'default material', edges: 'W1=H3430 Egger', grain: null },
        { name: 'k2 - desna', size: '600 x 500 x 18', material: 'default material', edges: 'W1=H3430 Egger', grain: null },
        { name: 'k1 - dol', size: '600 x 450 x 18', material: 'H3430 Egger', edges: '', grain: 'W' },
        { name: 'k1 - gor', size: '600 x 450 x 18', material: 'H3430 Egger', edges: '', grain: 'W' },
        { name: 'k1 - hrbet', size: '500 x 486 x 3', material: 'default material', edges: '', grain: null }
    ]);
});

test('compressed copies of the demo give the same sizes', async () => {
    const expected = await app.ev(PARTS);
    for (const file of ['demo-draco.glb', 'demo-meshopt.glb']) {
        await app.loadFile(path.join(EXAMPLES, file));
        assert.deepEqual(await app.ev(PARTS), expected, file);
    }
});

test('edge banding is detected per edge', async () => {
    await app.loadFile(path.join(EXAMPLES, 'banded-panels.glb'));
    const edges = await app.ev(`window.meshStore.meshes.map(m => m.name + ': ' + Object.entries(m.edges).filter(([, v]) => v).map(([k]) => k).join(' '))`);
    assert.deepEqual(edges, [
        'Shelf - all edges: L1 L2 W1 W2',
        'Side - long edges: L1 L2',
        'Door - one short: W1',
        'Back - none: '
    ]);
    assert.ok(await app.ev(`window.meshStore.meshes.every(m => m.materialName === 'Oak decor')`));
});

test('assemblies come from the node hierarchy or shared name prefixes', async () => {
    await app.loadFile(path.join(EXAMPLES, 'two-cabinets.glb'));
    assert.deepEqual(await app.ev(`[...new Set(window.meshStore.meshes.map(m => m.assembly))]`), ['Cabinet A', 'Cabinet B']);
    
    await app.loadDemo();
    assert.deepEqual(await app.ev(`[...new Set(window.meshStore.meshes.map(m => m.assembly))]`), ['k2', 'k1']);
    
    // Unique prefixes are not assemblies
    await app.loadFile(path.join(EXAMPLES, 'banded-panels.glb'));
    assert.deepEqual(await app.ev(`[...new Set(window.meshStore.meshes.map(m => m.assembly))]`), [null]);
});

test('names from the model are shown as text, not HTML', async () => {
    await app.loadFile(demoWithNames('<img src=x onerror="window.__injected=1">', '<b onmouseover="window.__injected=2">mat</b>'));
    const names = await app.ev(`[...document.querySelectorAll('#partsPane .part-name')].map(e => e.textContent)`);
    assert.ok(names.some(name => name.includes('<img src=x')));
    assert.equal(await app.ev(`document.querySelectorAll('#partsPane img').length`), 0);
    assert.equal(await app.ev('window.__injected || 0'), 0);
});

test('no errors in the page', () => {
    assert.deepEqual(app.errors, []);
});
