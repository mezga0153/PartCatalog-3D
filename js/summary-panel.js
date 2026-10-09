import { escapeHtml } from './html.js';
import { formatLength, formatArea, toUnit, fromUnit, unitLabel, runInUnit, runLabel } from './units.js';
import { summarize } from './cut-list.js';
import { readSetting, writeSetting } from './storage.js';

// Totals for ordering: board area and sheets per material, and banding length
export class SummaryPanel {
    constructor(store, container) {
        this.store = store;
        this.container = container;
        this.sheet = readSetting('sheet', { length: 2800, width: 2070, waste: 10 });
        
        this.build();
        store.subscribe(change => {
            if (change !== 'selection') this.render();
        });
        this.render();
    }
    
    build() {
        this.container.innerHTML = `
            <div class="summary-settings">
                <label>Sheet <input type="number" class="form-control form-control-sm" data-key="length" min="1"> ×
                    <input type="number" class="form-control form-control-sm" data-key="width" min="1"> <span class="sheet-unit"></span></label>
                <label>Waste <input type="number" class="form-control form-control-sm" data-key="waste" min="0" max="90"> %</label>
            </div>
            <div class="summary-body"></div>
        `;
        
        this.body = this.container.querySelector('.summary-body');
        this.container.querySelectorAll('.summary-settings input').forEach(input => {
            input.addEventListener('input', () => {
                const value = parseFloat(input.value);
                if (Number.isFinite(value) && value >= 0) {
                    // Sheet sizes are kept in mm and shown in the current unit
                    this.sheet[input.dataset.key] = input.dataset.key === 'waste' ? value : fromUnit(value);
                    writeSetting('sheet', this.sheet);
                    this.render();
                }
            });
        });
    }
    
    // Show the sheet settings in the current unit (leaving a field being typed in alone)
    renderSettings() {
        this.container.querySelector('.sheet-unit').textContent = unitLabel();
        this.container.querySelectorAll('.summary-settings input').forEach(input => {
            if (input === document.activeElement) return;
            const key = input.dataset.key;
            input.value = key === 'waste' ? this.sheet.waste : toUnit(this.sheet[key]);
        });
    }
    
    render() {
        this.renderSettings();
        const included = this.store.meshes.filter(m => m.isIncluded);
        if (included.length === 0) {
            this.body.innerHTML = `<div class="parts-empty">${this.store.meshes.length ? 'No parts are included in the cut list.' : 'Load a model to see totals.'}</div>`;
            return;
        }
        
        const { boards, banding } = summarize(included, this.sheet);
        
        this.body.innerHTML = `
            <h6>Boards</h6>
            <table class="parts-table summary-table">
                <thead><tr><th>Material</th><th class="num">T</th><th class="num">Parts</th><th class="num">Area</th><th class="num" title="Full sheets needed by area, including waste">Sheets</th></tr></thead>
                <tbody>${boards.map(board => `
                    <tr>
                        <td class="material">${escapeHtml(board.material)}</td>
                        <td class="num">${formatLength(board.thickness)}</td>
                        <td class="num">${board.count}</td>
                        <td class="num">${formatArea(board.area)}</td>
                        <td class="num">${board.sheets}</td>
                    </tr>`).join('')}
                </tbody>
            </table>
            <h6>Edge banding</h6>
            ${banding.length === 0 ? '<div class="parts-empty">No edge banding detected.</div>' : `
            <table class="parts-table summary-table">
                <thead><tr><th>Material</th><th class="num">Edges</th><th class="num" title="Total banded edge length">Length</th><th class="num" title="Length including waste">To order</th></tr></thead>
                <tbody>${banding.map(band => `
                    <tr>
                        <td class="material">${escapeHtml(band.material)}</td>
                        <td class="num">${band.count}</td>
                        <td class="num">${runInUnit(band.length).toFixed(2)} ${runLabel()}</td>
                        <td class="num">${runInUnit(band.toOrder).toFixed(1)} ${runLabel()}</td>
                    </tr>`).join('')}
                </tbody>
            </table>`}
            <p class="summary-note">Sheet counts are estimated from area only; the real number depends on how the parts nest on the sheet.</p>
        `;
    }
}
