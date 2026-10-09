import * as THREE from 'three';
import { escapeHtml } from './html.js';
import { formatLength } from './units.js';
import { groupIdenticalParts, cutListRows, summarize, bandedEdges, totalQuantity } from './cut-list.js';

// Render a small picture of a part on its own, using its own materials
function renderThumbnails(groups) {
    const width = 220;
    const height = 160;
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(width, height);
    renderer.setClearColor(0xffffff, 1);
    
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x888888, 2));
    const light = new THREE.DirectionalLight(0xffffff, 2);
    light.position.set(1, 2, 1.5);
    scene.add(light);
    const camera = new THREE.PerspectiveCamera(35, width / height, 0.001, 1000);
    
    const thumbnails = groups.map((group) => {
        const entry = group[0];
        const holder = new THREE.Group();
        const box = new THREE.Box3();
        
        entry.threeMeshes.forEach((mesh) => {
            const copy = new THREE.Mesh(mesh.geometry, mesh.userData.originalMaterial || mesh.material);
            copy.matrixAutoUpdate = false;
            copy.matrix.copy(mesh.matrixWorld);
            holder.add(copy);
            box.expandByObject(mesh);
        });
        scene.add(holder);
        
        const sphere = box.getBoundingSphere(new THREE.Sphere());
        const distance = Math.max(sphere.radius, 1e-3) / Math.sin(THREE.MathUtils.degToRad(camera.fov) / 2);
        camera.position.copy(sphere.center).add(new THREE.Vector3(1, 0.9, 1.3).normalize().multiplyScalar(distance));
        camera.near = distance / 100;
        camera.far = distance * 10;
        camera.updateProjectionMatrix();
        camera.lookAt(sphere.center);
        
        renderer.render(scene, camera);
        const dataUrl = renderer.domElement.toDataURL('image/png');
        scene.remove(holder);
        return dataUrl;
    });
    
    renderer.dispose();
    return thumbnails;
}

// Top view of the panel: banded edges drawn thick, grain as an arrow
function panelDiagram(entry) {
    const maxWidth = 90;
    const maxHeight = 60;
    const scale = Math.min(maxWidth / entry.size.length, maxHeight / entry.size.width);
    const w = Math.max(entry.size.length * scale, 8);
    const h = Math.max(entry.size.width * scale, 8);
    const x = (maxWidth - w) / 2 + 5;
    const y = (maxHeight - h) / 2 + 5;
    const banded = new Set(bandedEdges(entry).map(([name]) => name));
    const edge = (name, x1, y1, x2, y2) =>
        `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${banded.has(name) ? '#d97706' : '#999'}" stroke-width="${banded.has(name) ? 4 : 1}"/>`;
    
    let grain = '';
    if (entry.grain === 'L') {
        grain = `<line x1="${x + w * 0.25}" y1="${y + h / 2}" x2="${x + w * 0.75}" y2="${y + h / 2}" stroke="#555" marker-end="url(#arrow)" marker-start="url(#arrow)"/>`;
    } else if (entry.grain === 'W') {
        grain = `<line x1="${x + w / 2}" y1="${y + h * 0.25}" x2="${x + w / 2}" y2="${y + h * 0.75}" stroke="#555" marker-end="url(#arrow)" marker-start="url(#arrow)"/>`;
    }
    
    return `
        <svg width="${maxWidth + 10}" height="${maxHeight + 10}" viewBox="0 0 ${maxWidth + 10} ${maxHeight + 10}">
            <defs><marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#555"/></marker></defs>
            <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#f4efe6"/>
            ${edge('L1', x, y, x + w, y)}
            ${edge('L2', x, y + h, x + w, y + h)}
            ${edge('W1', x, y, x, y + h)}
            ${edge('W2', x + w, y, x + w, y + h)}
            ${grain}
        </svg>
    `;
}

// Open the browser's print dialog with a cut list (save as PDF from there)
export function printCutList(allEntries, sheet, modelName) {
    const entries = allEntries.filter(entry => (entry.quantity ?? 1) > 0);
    const groups = groupIdenticalParts(entries);
    const pieces = totalQuantity(entries);
    const rows = cutListRows(entries);
    const thumbnails = renderThumbnails(groups);
    const { boards, banding } = summarize(entries, sheet);
    const date = new Date().toLocaleDateString();
    
    const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Cut list – ${escapeHtml(modelName)}</title>
<style>
    @page { size: A4 landscape; margin: 12mm; }
    body { font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; font-size: 10pt; color: #222; }
    h1 { font-size: 16pt; margin: 0 0 2px; }
    h2 { font-size: 12pt; margin: 18px 0 6px; }
    .meta { color: #666; margin-bottom: 12px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border-bottom: 1px solid #ddd; padding: 4px 6px; text-align: left; vertical-align: middle; }
    th { background: #f2f2f2; font-size: 9pt; }
    tr { page-break-inside: avoid; }
    .num { text-align: right; white-space: nowrap; }
    .qty { font-weight: bold; font-size: 12pt; }
    img { width: 110px; height: 80px; object-fit: contain; display: block; }
    .edges { font-size: 8.5pt; }
    .legend { color: #666; font-size: 8.5pt; margin-top: 6px; }
</style></head><body>
    <h1>Cut list – ${escapeHtml(modelName)}</h1>
    <div class="meta">${date} · ${pieces} piece${pieces === 1 ? '' : 's'} in ${rows.length} line${rows.length === 1 ? '' : 's'}</div>
    <table>
        <thead><tr><th>No.</th><th>Picture</th><th>Part</th><th class="num">Qty</th><th class="num">L</th><th class="num">W</th><th class="num">T</th><th>Material</th><th>Edges &amp; grain</th><th>Banding</th><th>Notes</th></tr></thead>
        <tbody>${rows.map((row, i) => `
            <tr>
                <td>${row['No.']}</td>
                <td><img src="${thumbnails[i]}" alt=""></td>
                <td>${escapeHtml(row['Part'])}${row['Assembly'] ? `<br><small>${escapeHtml(row['Assembly'])}</small>` : ''}</td>
                <td class="num qty">${row['Qty']}</td>
                <td class="num">${row['Length (mm)']}</td>
                <td class="num">${row['Width (mm)']}</td>
                <td class="num">${row['Thickness (mm)']}</td>
                <td>${escapeHtml(row['Material'])}</td>
                <td>${panelDiagram(groups[i][0])}</td>
                <td class="edges">${bandedEdges(groups[i][0]).map(([name, material]) => `${name}: ${escapeHtml(material)}`).join('<br>') || '–'}</td>
                <td>${escapeHtml(row['Notes'])}</td>
            </tr>`).join('')}
        </tbody>
    </table>
    <div class="legend">Sizes in mm. Diagram: top view with L horizontal; thick orange edges are banded (L1 top, L2 bottom, W1 left, W2 right); arrow shows grain direction.</div>
    
    <h2>Boards</h2>
    <table>
        <thead><tr><th>Material</th><th class="num">Thickness</th><th class="num">Parts</th><th class="num">Area</th><th class="num">Sheets (${formatLength(sheet.length)} × ${formatLength(sheet.width)}, +${sheet.waste}%)</th></tr></thead>
        <tbody>${boards.map(board => `<tr><td>${escapeHtml(board.material)}</td><td class="num">${formatLength(board.thickness)} mm</td><td class="num">${board.count}</td><td class="num">${board.area.toFixed(2)} m²</td><td class="num">${board.sheets}</td></tr>`).join('')}</tbody>
    </table>
    ${banding.length ? `
    <h2>Edge banding</h2>
    <table>
        <thead><tr><th>Material</th><th class="num">Edges</th><th class="num">Length</th><th class="num">To order (+${sheet.waste}%)</th></tr></thead>
        <tbody>${banding.map(band => `<tr><td>${escapeHtml(band.material)}</td><td class="num">${band.count}</td><td class="num">${band.length.toFixed(2)} m</td><td class="num">${band.toOrder.toFixed(1)} m</td></tr>`).join('')}</tbody>
    </table>` : ''}
</body></html>`;
    
    // Print from a hidden frame so popup blockers don't interfere
    const frame = document.createElement('iframe');
    frame.style.cssText = 'position: fixed; right: 0; bottom: 0; width: 0; height: 0; border: 0;';
    document.body.appendChild(frame);
    frame.contentDocument.open();
    frame.contentDocument.write(html);
    frame.contentDocument.close();
    
    frame.contentWindow.addEventListener('afterprint', () => frame.remove());
    setTimeout(() => {
        frame.contentWindow.focus();
        frame.contentWindow.print();
    }, 300);
    
    return frame;
}
