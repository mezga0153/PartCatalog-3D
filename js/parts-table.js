import { escapeHtml } from './html.js';
import { formatLength } from './units.js';

const COLUMNS = [
    { key: 'name', label: 'Part', sortValue: m => m.name },
    { key: 'length', label: 'L', numeric: true, sortValue: m => m.size.length },
    { key: 'width', label: 'W', numeric: true, sortValue: m => m.size.width },
    { key: 'thickness', label: 'T', numeric: true, sortValue: m => m.size.thickness },
    { key: 'material', label: 'Material', sortValue: m => m.materialName }
];

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

// Compact, sortable and searchable table of the parts in the store
export class PartsTable {
    constructor(store, container) {
        this.store = store;
        this.container = container;
        this.sortKey = null;
        this.sortDir = 1;
        this.search = '';
        
        this.build();
        store.onChange = () => this.render();
        this.render();
    }
    
    build() {
        this.container.innerHTML = `
            <div class="parts-header">
                <h5>Parts <span class="parts-count badge"></span></h5>
                <input type="search" class="form-control form-control-sm parts-search" placeholder="Search name or material">
            </div>
            <div class="parts-scroll">
                <table class="parts-table">
                    <thead><tr></tr></thead>
                    <tbody></tbody>
                </table>
                <div class="parts-empty"></div>
            </div>
        `;
        
        this.countEl = this.container.querySelector('.parts-count');
        this.tbody = this.container.querySelector('tbody');
        this.emptyEl = this.container.querySelector('.parts-empty');
        
        const headRow = this.container.querySelector('thead tr');
        COLUMNS.forEach(column => {
            const th = document.createElement('th');
            th.dataset.key = column.key;
            th.className = column.numeric ? 'num sortable' : 'sortable';
            th.title = `Sort by ${column.key}`;
            th.onclick = () => this.sortBy(column.key);
            headRow.appendChild(th);
        });
        headRow.appendChild(document.createElement('th'));
        
        this.container.querySelector('.parts-search').addEventListener('input', (event) => {
            this.search = event.target.value.trim().toLowerCase();
            this.render();
        });
    }
    
    sortBy(key) {
        if (this.sortKey === key) {
            // Ascending -> descending -> original order
            if (this.sortDir === 1) {
                this.sortDir = -1;
            } else {
                this.sortKey = null;
                this.sortDir = 1;
            }
        } else {
            this.sortKey = key;
            this.sortDir = 1;
        }
        this.render();
    }
    
    getRows() {
        let rows = this.store.meshes.slice();
        
        if (this.search) {
            rows = rows.filter(m => `${m.name} ${m.materialName}`.toLowerCase().includes(this.search));
        }
        
        const column = COLUMNS.find(c => c.key === this.sortKey);
        if (column) {
            rows.sort((a, b) => {
                const va = column.sortValue(a);
                const vb = column.sortValue(b);
                const order = column.numeric ? va - vb : collator.compare(va, vb);
                return order * this.sortDir;
            });
        }
        
        return rows;
    }
    
    render() {
        const rows = this.getRows();
        const total = this.store.meshes.length;
        
        this.countEl.textContent = rows.length === total ? `${total}` : `${rows.length} / ${total}`;
        
        this.container.querySelectorAll('thead th[data-key]').forEach(th => {
            const column = COLUMNS.find(c => c.key === th.dataset.key);
            const arrow = this.sortKey === column.key ? (this.sortDir === 1 ? ' ▲' : ' ▼') : '';
            th.textContent = column.label + arrow;
        });
        
        this.tbody.innerHTML = '';
        rows.forEach(entry => this.tbody.appendChild(this.createRow(entry)));
        
        this.emptyEl.textContent = total === 0 ? 'Load a model to see its parts.' : (rows.length === 0 ? 'No parts match your search.' : '');
    }
    
    createRow(entry) {
        const row = document.createElement('tr');
        row.dataset.uuid = entry.uuid;
        row.className = [
            this.store.selectedMeshUuid === entry.uuid ? 'selected' : '',
            entry.isHidden ? 'is-hidden' : '',
            entry.isKept ? 'is-kept' : ''
        ].join(' ');
        
        let note = '';
        if (entry.splitFromUuid) {
            note = `<div class="part-note" title="One mesh per material; use merge to join them again"><i class="bi bi-scissors"></i> Split piece of ${escapeHtml(entry.name)}</div>`;
        } else if (entry.mergedCount > 1) {
            note = `<div class="part-note" title="This part was made of ${entry.mergedCount} meshes, one per material; they are listed as one part"><i class="bi bi-layers"></i> Merged: ${entry.mergedCount} materials</div>`;
        }
        
        row.innerHTML = `
            <td class="name"><div>${escapeHtml(entry.name)}</div>${note}</td>
            <td class="num">${formatLength(entry.size.length)}</td>
            <td class="num">${formatLength(entry.size.width)}</td>
            <td class="num">${formatLength(entry.size.thickness)}</td>
            <td class="material">${escapeHtml(entry.materialName)}</td>
            <td class="actions"></td>
        `;
        
        const actions = row.querySelector('.actions');
        actions.appendChild(this.createAction(
            entry.isHidden ? 'bi-eye-slash' : 'bi-eye',
            entry.isHidden ? 'Show part' : 'Hide part',
            () => this.store.toggleVisibility(entry.uuid),
            entry.isHidden ? 'muted' : ''
        ));
        actions.appendChild(this.createAction(
            entry.isKept ? 'bi-check-circle-fill' : 'bi-check-circle',
            entry.isKept ? 'Kept (click to unmark)' : 'Keep for export',
            () => this.store.toggleKeep(entry.uuid),
            entry.isKept ? 'active' : ''
        ));
        if (entry.mergedCount > 1 || entry.splitFromUuid) {
            actions.appendChild(this.createAction(
                entry.splitFromUuid ? 'bi-union' : 'bi-scissors',
                entry.splitFromUuid ? 'Merge back into one part' : 'List each material as a separate part',
                () => this.store.toggleSplit(entry.uuid)
            ));
        }
        
        row.onclick = () => this.store.selectMesh(entry.uuid);
        row.onmouseenter = () => this.store.showBoundingBox(entry.uuid);
        row.onmouseleave = () => this.store.hideBoundingBox(entry.uuid);
        
        return row;
    }
    
    createAction(icon, title, onClick, state = '') {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `part-action ${state}`;
        button.title = title;
        button.setAttribute('aria-label', title);
        button.innerHTML = `<i class="bi ${icon}"></i>`;
        button.onclick = (event) => {
            event.stopPropagation();
            onClick();
        };
        return button;
    }
}
