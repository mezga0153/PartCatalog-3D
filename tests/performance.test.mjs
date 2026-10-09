import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { launch, EXAMPLES } from './browser.mjs';

let app;
before(async () => { app = await launch(); });
after(() => app.close());

// Generous limits: these catch accidental O(n²) work, not small regressions
test('a 1,020-part model loads and selects quickly', async () => {
    await app.ev(`localStorage.setItem('partcatalog:table', JSON.stringify({ combineIdentical: false }))`);
    await app.reload();
    
    const start = Date.now();
    await app.loadFile(path.join(EXAMPLES, '170-cabinets.glb'));
    const loadTime = Date.now() - start;
    assert.equal(await app.ev(`window.meshStore.meshes.length`), 1020);
    assert.ok(loadTime < 5000, `load took ${loadTime} ms`);
    
    const selectTime = await app.ev(`(() => { const t = performance.now(); document.querySelectorAll('#partsPane .parts-table tbody tr')[500].click(); return performance.now() - t; })()`);
    assert.ok(selectTime < 100, `selection took ${selectTime} ms`);
    assert.deepEqual(app.errors, []);
});
