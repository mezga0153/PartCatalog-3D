import { escapeHtml } from './html.js';
import { formatLength } from './units.js';
import { summarize } from './cut-list.js';

// Totals for ordering: board area and sheets per material, and banding length
export class SummaryPanel {
    constructor(store, container) {
        this.store = store;
        this.container = container;
        this.sheet = { length: 2800, width: 2070, waste: 10 };
        
        this.build();
        store.subscribe(() => this.render());
        this.render();
    }
    
    build() {
        this.container.innerHTML = `
            <div class="summary-settings">
                <label>Sheet <input type="number" class="form-control form-control-sm" data-key="length" min="1"> ×
                    <input type="number" class="form-control form-control-sm" data-key="width" min="1"> mm</label>
                <label>Waste <input type="number" class="form-control form-control-sm" data-key="waste" min="0" max="90"> %</label>
            </div>
            <div class="summary-body"></div>
        `;
        
        this.body = this.container.querySelector('.summary-body');
        this.container.querySelectorAll('.summary-settings input').forEach(input => {
            input.value = this.sheet[input.dataset.key];
            input.addEventListener('input', () => {
                const value = parseFloat(input.value);
                if (Number.isFinite(value) && value >= 0) {
                    this.sheet[input.dataset.key] = value;
                    this.render();
                }
            });
        });
    }
    
    render() {
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
                        <td class="num">${board.area.toFixed(2)} m²</td>
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
                        <td class="num">${band.length.toFixed(2)} m</td>
                        <td class="num">${band.toOrder.toFixed(1)} m</td>
                    </tr>`).join('')}
                </tbody>
            </table>`}
            <p class="summary-note">Sheet counts are estimated from area only; the real number depends on how the parts nest on the sheet.</p>
        `;
    }
}
