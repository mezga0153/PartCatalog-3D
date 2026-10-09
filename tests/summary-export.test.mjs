import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { launch, EXAMPLES, setValue } from './browser.mjs';

let app;
before(async () => {
    app = await launch();
    await app.loadFile(path.join(EXAMPLES, 'banded-panels.glb'));
});
after(() => app.close());

test('summary totals boards, sheets and banding', async () => {
    await app.ev(`document.querySelector('[data-pane="summaryPane"]').click()`);
    const tables = await app.ev(`[...document.querySelectorAll('#summaryPane tbody')].map(t => [...t.rows].map(r => r.innerText.replace(/\\s+/g, ' ').trim()))`);
    assert.deepEqual(tables, [
        ['Oak decor 3 1 0.32 m² 1', 'Oak decor 18 3 0.96 m² 1'],
        ['ABS 2mm white 7 4.40 m 4.8 m']
    ]);
    await app.ev(setValue('.summary-settings [data-key="waste"]', '0', 'input'));
    assert.match(await app.ev(`document.querySelector('#summaryPane').innerText`), /4\.4 m/);
    await app.ev(setValue('.summary-settings [data-key="waste"]', '10', 'input'));
    await app.ev(`document.querySelector('[data-pane="partsPane"]').click()`);
});

test('Excel export has a cut list and a summary sheet', async () => {
    await app.ev(`XLSX.writeFile = (wb, name) => { window.__workbook = { name, sheets: wb.SheetNames.map(n => [n, XLSX.utils.sheet_to_csv(wb.Sheets[n])]) }; }`);
    await app.ev(`document.querySelector('[data-format="xlsx"]').click()`);
    const workbook = await app.ev('window.__workbook');
    assert.match(workbook.name, /^Cut_List_banded-panels_.*\.xlsx$/);
    assert.equal(workbook.sheets[0][1].split('\n')[0], 'No.,Part,Qty,Length (mm),Width (mm),Thickness (mm),Material,Edge L1,Edge L2,Edge W1,Edge W2,Grain,Assembly,Notes');
    assert.equal(workbook.sheets[0][1].split('\n')[1], '1,Shelf - all edges,1,800,400,18,Oak decor,ABS 2mm white,ABS 2mm white,ABS 2mm white,ABS 2mm white,,,');
    assert.equal(workbook.sheets[1][0], 'Summary');
});

test('CSV export downloads a UTF-8 file', async () => {
    await app.ev(`document.querySelector('[data-format="csv"]').click()`);
    let files = [];
    for (let i = 0; i < 50 && files.length === 0; i++) {
        files = fs.existsSync(app.downloads) ? fs.readdirSync(app.downloads).filter(f => f.endsWith('.csv')) : [];
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    const csv = fs.readFileSync(path.join(app.downloads, files[0]), 'utf8');
    assert.ok(csv.startsWith('﻿No.,Part,Qty'));
    assert.equal(csv.split('\r\n').length, 5);
});

test('print view lists every line with a picture and diagram', async () => {
    await app.ev(`(() => {
        const append = document.body.appendChild.bind(document.body);
        document.body.appendChild = (el) => { const r = append(el); if (el.tagName === 'IFRAME') { window.__frame = el; el.contentWindow.print = () => { window.__printed = true; }; } return r; };
    })()`);
    await app.ev(`document.querySelector('[data-format="print"]').click()`);
    await app.waitFor('window.__printed === true');
    const page = await app.ev(`(() => { const d = window.__frame.contentDocument; return { text: d.body.innerText, images: d.images.length, diagrams: d.querySelectorAll('svg').length }; })()`);
    assert.match(page.text, /Cut list – banded-panels/);
    assert.match(page.text, /4 pieces in 4 lines/);
    assert.equal(page.images, 4);
    assert.equal(page.diagrams, 4);
});

test('no errors in the page', () => {
    assert.deepEqual(app.errors, []);
});
