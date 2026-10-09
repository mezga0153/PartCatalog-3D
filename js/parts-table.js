import { escapeHtml } from './html.js';
import { formatLength } from './units.js';
import { groupIdenticalParts } from './cut-list.js';

// Each table row is a group of one or more identical parts
const COLUMNS = [
    { key: 'name', label: 'Part', sortValue: row => rowName(row) },
    { key: 'qty', label: 'Qty', numeric: true, combinedOnly: true, sortValue: row => row.entries.length },
    { key: 'length', label: 'L', numeric: true, sortValue: row => row.entries[0].size.length },
    { key: 'width', label: 'W', numeric: true, sortValue: row => row.entries[0].size.width },
    { key: 'thickness', label: 'T', numeric: true, sortValue: row => row.entries[0].size.thickness },
    { key: 'material', label: 'Material', sortValue: row => row.entries[0].materialName }
];

// "a, b, c +2 more" for combined rows
function rowName(row) {
    const names = [...new Set(row.entries.map(m => m.name))];
    return names.length > 3 ? `${names.slice(0, 3).join(', ')} +${names.length - 3} more` : names.join(', ');
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

// Compact, sortable and searchable table of the parts in the store
export class PartsTable {
    constructor(store, container) {
        this.store = store;
        this.container = container;
        this.sortKey = null;
        this.sortDir = 1;
        this.search = '';
        this.combineIdentical = true;
        
        this.build();
        store.onChange = () => this.render();
        this.render();
    }
    
    build() {
        this.container.innerHTML = `
            <div class="parts-header">
                <h5>Parts <span class="parts-count badge"></span></h5>
                <input type="search" class="form-control form-control-sm parts-search" placeholder="Search name or material">
                <label class="parts-option"><input type="checkbox" class="form-check-input combine-identical" checked> Combine identical parts</label>
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
        
        // Include all / none for the rows currently shown
        const includeTh = document.createElement('th');
        includeTh.className = 'include';
        includeTh.innerHTML = '<input type="checkbox" class="form-check-input" title="Include all / none">';
        this.includeAll = includeTh.querySelector('input');
        this.includeAll.onchange = () => {
            this.store.setIncluded(this.getRows().flatMap(row => row.entries.map(m => m.uuid)), this.includeAll.checked);
        };
        headRow.appendChild(includeTh);
        COLUMNS.forEach(column => {
            const th = document.createElement('th');
            th.dataset.key = column.key;
            th.className = column.numeric ? 'num sortable' : 'sortable';
            th.title = `Sort by ${column.key}`;
            th.onclick = () => this.sortBy(column.key);
            headRow.appendChild(th);
        });
        headRow.appendChild(document.createElement('th'));
        
        this.container.querySelector('.combine-identical').addEventListener('change', (event) => {
            this.combineIdentical = event.target.checked;
            this.render();
        });
        
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
        let entries = this.store.meshes.slice();
        
        if (this.search) {
            entries = entries.filter(m => `${m.name} ${m.materialName}`.toLowerCase().includes(this.search));
        }
        
        const rows = (this.combineIdentical ? groupIdenticalParts(entries) : entries.map(m => [m]))
            .map(group => ({ entries: group }));
        
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
        const shownEntries = rows.flatMap(row => row.entries);
        const total = this.store.meshes.length;
        
        this.countEl.textContent = shownEntries.length === total ? `${total}` : `${shownEntries.length} / ${total}`;
        this.container.querySelector('.parts-table').classList.toggle('combined', this.combineIdentical);
        
        this.container.querySelectorAll('thead th[data-key]').forEach(th => {
            const column = COLUMNS.find(c => c.key === th.dataset.key);
            const arrow = this.sortKey === column.key ? (this.sortDir === 1 ? ' ▲' : ' ▼') : '';
            th.textContent = column.label + arrow;
            th.hidden = column.combinedOnly && !this.combineIdentical;
        });
        
        const includedCount = shownEntries.filter(m => m.isIncluded).length;
        this.includeAll.checked = shownEntries.length > 0 && includedCount === shownEntries.length;
        this.includeAll.indeterminate = includedCount > 0 && includedCount < shownEntries.length;
        this.includeAll.disabled = shownEntries.length === 0;
        
        this.tbody.innerHTML = '';
        rows.forEach(row => this.tbody.appendChild(this.createRow(row)));
        
        this.emptyEl.textContent = total === 0 ? 'Load a model to see its parts.' : (rows.length === 0 ? 'No parts match your search.' : '');
    }
    
    createRow(row) {
        const entries = row.entries;
        const entry = entries[0];
        const uuids = entries.map(m => m.uuid);
        const isCombined = entries.length > 1;
        const includedCount = entries.filter(m => m.isIncluded).length;
        const isHidden = entries.every(m => m.isHidden);
        
        const tr = document.createElement('tr');
        tr.dataset.uuid = entry.uuid;
        tr.className = [
            uuids.every(uuid => this.store.isSelected(uuid)) ? 'selected' : '',
            isHidden ? 'is-hidden' : '',
            includedCount === 0 ? 'is-excluded' : ''
        ].join(' ');
        
        let note = '';
        if (!isCombined && entry.splitFromUuid) {
            note = `<div class="part-note" title="One mesh per material; use merge to join them again"><i class="bi bi-scissors"></i> Split piece of ${escapeHtml(entry.name)}</div>`;
        } else if (!isCombined && entry.mergedCount > 1) {
            note = `<div class="part-note" title="This part was made of ${entry.mergedCount} meshes, one per material; they are listed as one part"><i class="bi bi-layers"></i> Merged: ${entry.mergedCount} materials</div>`;
        }
        
        tr.innerHTML = `
            <td class="include"><input type="checkbox" class="form-check-input" title="Include in cut list"></td>
            <td class="name"><div title="${escapeHtml(entries.map(m => m.name).join('\n'))}">${escapeHtml(rowName(row))}</div>${note}</td>
            <td class="num qty" ${this.combineIdentical ? '' : 'hidden'}>${entries.length}</td>
            <td class="num">${formatLength(entry.size.length)}</td>
            <td class="num">${formatLength(entry.size.width)}</td>
            <td class="num">${formatLength(entry.size.thickness)}</td>
            <td class="material">${escapeHtml(entry.materialName)}</td>
            <td class="actions"></td>
        `;
        
        const checkbox = tr.querySelector('.include input');
        checkbox.checked = includedCount === entries.length;
        checkbox.indeterminate = includedCount > 0 && includedCount < entries.length;
        checkbox.onclick = (event) => event.stopPropagation();
        checkbox.onchange = () => this.store.setIncluded(uuids, checkbox.checked);
        
        const actions = tr.querySelector('.actions');
        actions.appendChild(this.createAction(
            isHidden ? 'bi-eye-slash' : 'bi-eye',
            isHidden ? 'Show' : 'Hide',
            () => this.store.setHidden(uuids, !isHidden),
            isHidden ? 'muted' : ''
        ));
        if (!isCombined && (entry.mergedCount > 1 || entry.splitFromUuid)) {
            actions.appendChild(this.createAction(
                entry.splitFromUuid ? 'bi-union' : 'bi-scissors',
                entry.splitFromUuid ? 'Merge back into one part' : 'List each material as a separate part',
                () => this.store.toggleSplit(entry.uuid)
            ));
        }
        
        tr.onclick = () => this.store.select(uuids);
        tr.onmouseenter = () => this.store.showBoundingBoxes(uuids);
        tr.onmouseleave = () => this.store.hideBoundingBoxes(uuids);
        
        return tr;
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
