import { escapeHtml } from './html.js';
import { formatLength, formatLengthWithUnit, formatArea, getUnit, setUnit, unitLabel } from './units.js';
import { groupIdenticalParts, bandedEdges, totalQuantity, GRAIN_LABELS } from './cut-list.js';
import { readSetting, writeSetting } from './storage.js';

// Each table row is a group of one or more identical parts
const COLUMNS = [
    { key: 'name', label: 'Part', sortValue: row => rowName(row) },
    { key: 'qty', label: 'Qty', numeric: true, sortValue: row => totalQuantity(row.entries) },
    { key: 'length', label: 'L', numeric: true, sortValue: row => row.entries[0].size.length },
    { key: 'width', label: 'W', numeric: true, sortValue: row => row.entries[0].size.width },
    { key: 'thickness', label: 'T', numeric: true, sortValue: row => row.entries[0].size.thickness },
    { key: 'material', label: 'Material', sortValue: row => row.entries[0].materialName },
    { key: 'edges', label: 'Edges', sortValue: row => bandedEdges(row.entries[0]).length },
    { key: 'grain', label: 'Grain', sortValue: row => row.entries[0].grain || '' }
];

// "a, b, c +2 more" for combined rows
function rowName(row) {
    const names = [...new Set(row.entries.map(m => m.name))];
    return names.length > 3 ? `${names.slice(0, 3).join(', ')} +${names.length - 3} more` : names.join(', ');
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

const UNGROUPED = 'Ungrouped';

// Ways to split the table into sections
const GROUPINGS = {
    none: null,
    material: { label: 'Material', key: m => m.materialName },
    assembly: { label: 'Assembly', key: m => m.assembly || UNGROUPED }
};

// Board area of parts in m²
function areaOf(entries) {
    return entries.reduce((sum, m) => sum + m.quantity * m.size.length * m.size.width, 0) / 1e6;
}

// Compact, sortable and searchable table of the parts in the store
export class PartsTable {
    constructor(store, container, countEl) {
        this.store = store;
        this.container = container;
        this.countEl = countEl;
        this.search = '';
        this.collapsedSections = new Set();
        
        const settings = readSetting('table', { sortKey: null, sortDir: 1, combineIdentical: true, groupBy: 'none', unit: 'mm' });
        setUnit(settings.unit);
        this.sortKey = settings.sortKey;
        this.sortDir = settings.sortDir;
        this.combineIdentical = settings.combineIdentical;
        this.groupBy = GROUPINGS[settings.groupBy] !== undefined ? settings.groupBy : 'none';
        
        this.build();
        store.subscribe(change => {
            if (change === 'selection') {
                this.renderSelection();
            } else if (change === 'hover') {
                this.highlightHovered(store.sceneHoverUuid);
            } else {
                this.render();
            }
        });
        this.render();
    }
    
    build() {
        this.container.innerHTML = `
            <div class="parts-header">
                <input type="search" class="form-control form-control-sm parts-search" placeholder="Search name or material">
                <div class="parts-options">
                    <label class="parts-option"><input type="checkbox" class="form-check-input combine-identical" checked> Combine identical parts</label>
                    <label class="parts-option">Units
                        <select class="form-select form-select-sm units">
                            <option value="mm">mm</option>
                            <option value="cm">cm</option>
                            <option value="in">in</option>
                        </select>
                    </label>
                    <label class="parts-option">Group by
                        <select class="form-select form-select-sm group-by">
                            <option value="none">None</option>
                            <option value="material">Material</option>
                            <option value="assembly">Assembly</option>
                        </select>
                    </label>
                </div>
            </div>
            <div class="parts-scroll">
                <table class="parts-table">
                    <thead><tr></tr></thead>
                    <tbody></tbody>
                </table>
                <div class="parts-empty"></div>
            </div>
        `;
        
        this.tbody = this.container.querySelector('tbody');
        this.emptyEl = this.container.querySelector('.parts-empty');
        
        const headRow = this.container.querySelector('thead tr');
        
        // Include all / none for the rows currently shown
        const includeTh = document.createElement('th');
        includeTh.className = 'include';
        includeTh.innerHTML = '<input type="checkbox" class="form-check-input" title="Include all / none">';
        this.includeAll = includeTh.querySelector('input');
        this.includeAll.onchange = () => {
            const uuids = this.getSections().flatMap(section => section.entries.map(m => m.uuid));
            this.store.setIncluded(uuids, this.includeAll.checked);
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
        
        this.container.querySelector('.group-by').value = this.groupBy;
        this.container.querySelector('.units').value = getUnit();
        
        // Every view shows lengths, so re-render them all
        this.container.querySelector('.units').addEventListener('change', (event) => {
            setUnit(event.target.value);
            this.store.notify();
        });
        this.container.querySelector('.combine-identical').checked = this.combineIdentical;
        
        this.container.querySelector('.group-by').addEventListener('change', (event) => {
            this.groupBy = event.target.value;
            this.render();
        });
        
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
    
    // Sections of rows; a single unnamed section when not grouping
    getSections() {
        let entries = this.store.parts.slice();
        
        if (this.search) {
            entries = entries.filter(m => `${m.name} ${m.allMaterials} ${m.assembly || ''}`.toLowerCase().includes(this.search));
        }
        
        const grouping = GROUPINGS[this.groupBy];
        if (!grouping) {
            return [{ key: null, entries, rows: this.getRows(entries) }];
        }
        
        const byKey = new Map();
        entries.forEach(entry => {
            const key = grouping.key(entry);
            if (!byKey.has(key)) byKey.set(key, []);
            byKey.get(key).push(entry);
        });
        
        return [...byKey.keys()]
            .sort((a, b) => (a === UNGROUPED) - (b === UNGROUPED) || collator.compare(a, b))
            .map(key => ({ key, entries: byKey.get(key), rows: this.getRows(byKey.get(key)) }));
    }
    
    getRows(entries) {
        const rows = (this.combineIdentical ? groupIdenticalParts(entries) : entries.map(m => [m]))
            .map(group => ({ entries: group }));
        
        const column = COLUMNS.find(c => c.key === this.sortKey);
        if (column) {
            rows.sort((a, b) => {
                const va = column.sortValue(a);
                const vb = column.sortValue(b);
                const order = typeof va === 'number' ? va - vb : collator.compare(va, vb);
                return order * this.sortDir;
            });
        }
        
        return rows;
    }
    
    saveSettings() {
        writeSetting('table', {
            sortKey: this.sortKey,
            sortDir: this.sortDir,
            combineIdentical: this.combineIdentical,
            groupBy: this.groupBy,
            unit: getUnit()
        });
    }
    
    // Mark the row of a part hovered in the 3D view
    highlightHovered(uuid) {
        this.tbody.querySelectorAll('tr.hovered').forEach(tr => tr.classList.remove('hovered'));
        if (!uuid) return;
        
        const row = [...this.tbody.querySelectorAll('tr[data-uuids]')].find(tr => tr.dataset.uuids.split(',').includes(uuid));
        if (row) row.classList.add('hovered');
    }
    
    // Update only the selected rows; re-render if a selected part's section is collapsed
    renderSelection() {
        const revealEntry = this.store.revealUuid && this.store.findPart(this.store.revealUuid);
        const grouping = GROUPINGS[this.groupBy];
        if (revealEntry && grouping && this.collapsedSections.has(`${this.groupBy}:${grouping.key(revealEntry)}`)) {
            this.render();
            return;
        }
        
        this.tbody.querySelectorAll('tr[data-uuids]').forEach(tr => {
            tr.classList.toggle('selected', tr.dataset.uuids.split(',').some(uuid => this.store.isSelected(uuid)));
        });
        this.revealSelected();
    }
    
    revealSelected() {
        const revealUuid = this.store.revealUuid;
        if (!revealUuid) return;
        
        this.store.revealUuid = null;
        const row = [...this.tbody.querySelectorAll('tr[data-uuids]')].find(tr => tr.dataset.uuids.split(',').includes(revealUuid));
        if (row) row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    
    render() {
        this.saveSettings();
        
        // Open the section holding a part selected in the 3D view
        const revealUuid = this.store.revealUuid;
        const grouping = GROUPINGS[this.groupBy];
        const revealEntry = revealUuid && this.store.findPart(revealUuid);
        if (revealEntry && grouping) {
            this.collapsedSections.delete(`${this.groupBy}:${grouping.key(revealEntry)}`);
        }
        
        const sections = this.getSections();
        const shownEntries = sections.flatMap(section => section.entries);
        const total = this.store.parts.length;
        
        this.countEl.textContent = shownEntries.length === total ? `${total}` : `${shownEntries.length} / ${total}`;
        this.container.querySelector('.parts-table').classList.toggle('combined', this.combineIdentical);
        
        this.container.querySelectorAll('thead th[data-key]').forEach(th => {
            const column = COLUMNS.find(c => c.key === th.dataset.key);
            const arrow = this.sortKey === column.key ? (this.sortDir === 1 ? ' ▲' : ' ▼') : '';
            th.textContent = column.label + arrow;
            if (['length', 'width', 'thickness'].includes(column.key)) th.title = `Sort by ${column.key} (${unitLabel()})`;
        });
        
        const includedCount = shownEntries.filter(m => m.isIncluded).length;
        this.includeAll.checked = shownEntries.length > 0 && includedCount === shownEntries.length;
        this.includeAll.indeterminate = includedCount > 0 && includedCount < shownEntries.length;
        this.includeAll.disabled = shownEntries.length === 0;
        
        const fragment = document.createDocumentFragment();
        sections.forEach(section => {
            const sectionId = `${this.groupBy}:${section.key}`;
            const isCollapsed = this.collapsedSections.has(sectionId);
            
            if (section.key !== null) {
                fragment.appendChild(this.createSectionRow(section, sectionId, isCollapsed));
            }
            if (!isCollapsed) {
                section.rows.forEach(row => fragment.appendChild(this.createRow(row)));
            }
        });
        this.tbody.replaceChildren(fragment);
        
        this.emptyEl.textContent = total === 0 ? 'Load a model to see its parts.' : (shownEntries.length === 0 ? 'No parts match your search.' : '');
        
        this.highlightHovered(this.store.sceneHoverUuid);
        this.revealSelected();
    }
    
    createSectionRow(section, sectionId, isCollapsed) {
        const included = section.entries.filter(m => m.isIncluded);
        const fromName = this.groupBy === 'assembly' && section.entries.some(m => m.assemblyFromName);
        
        const tr = document.createElement('tr');
        tr.className = 'section-row';
        tr.innerHTML = `
            <td colspan="${COLUMNS.length + 2}">
                <i class="bi ${isCollapsed ? 'bi-chevron-right' : 'bi-chevron-down'}"></i>
                <span class="section-name" ${fromName ? 'title="Grouped by name prefix"' : ''}>${escapeHtml(section.key)}</span>
                <span class="section-totals">${totalQuantity(section.entries)} part${totalQuantity(section.entries) === 1 ? '' : 's'} · ${formatArea(areaOf(included))}</span>
            </td>
        `;
        tr.onclick = () => {
            if (isCollapsed) {
                this.collapsedSections.delete(sectionId);
            } else {
                this.collapsedSections.add(sectionId);
            }
            this.render();
        };
        
        return tr;
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
        tr.dataset.uuids = uuids.join(',');
        tr.className = [
            uuids.some(uuid => this.store.isSelected(uuid)) ? 'selected' : '',
            isHidden ? 'is-hidden' : '',
            includedCount === 0 ? 'is-excluded' : ''
        ].join(' ');
        
        let note = '';
        const notes = [...new Set(entries.map(m => m.notes).filter(Boolean))];
        if (notes.length) {
            note += `<div class="part-user-note"><i class="bi bi-sticky"></i> ${escapeHtml(notes.join('; '))}</div>`;
        }
        if (!isCombined && entry.splitFromUuid) {
            note += `<div class="part-note" title="One mesh per material; use merge to join them again"><i class="bi bi-scissors"></i> Split piece of ${escapeHtml(entry.name)}</div>`;
        } else if (!isCombined && entry.mergedCount > 1) {
            note += `<div class="part-note" title="This part was made of ${entry.mergedCount} meshes, one per material; they are listed as one part"><i class="bi bi-layers"></i> Merged: ${entry.mergedCount} materials</div>`;
        }
        
        tr.innerHTML = `
            <td class="include"><input type="checkbox" class="form-check-input" title="Include in cut list"></td>
            <td class="name"><div class="part-name" title="${escapeHtml(entries.map(m => m.name).join('\n'))}&#10;Double-click to rename">${escapeHtml(rowName(row))}</div>${note}</td>
            <td class="num qty" title="${isCombined ? 'Turn off Combine identical parts to change quantities per part' : 'Double-click to change the quantity'}">${totalQuantity(entries)}</td>
            <td class="num">${formatLength(entry.size.length)}</td>
            <td class="num">${formatLength(entry.size.width)}</td>
            <td class="num">${formatLength(entry.size.thickness)}</td>
            <td class="material">${escapeHtml(entry.materialName)}</td>
            <td class="edges">${this.formatEdges(entry)}</td>
            <td class="grain" title="${entry.grain ? `Grain ${GRAIN_LABELS[entry.grain].toLowerCase()} (from the texture)` : 'No grain direction detected'}">${entry.grain ? `<i class="bi ${entry.grain === 'L' ? 'bi-arrow-left-right' : 'bi-arrow-down-up'}"></i> ${entry.grain}` : '–'}</td>
            <td class="actions"></td>
        `;
        
        const checkbox = tr.querySelector('.include input');
        checkbox.checked = includedCount === entries.length;
        checkbox.indeterminate = includedCount > 0 && includedCount < entries.length;
        checkbox.onclick = (event) => event.stopPropagation();
        checkbox.onchange = () => this.store.setIncluded(uuids, checkbox.checked);
        
        const nameEl = tr.querySelector('.part-name');
        nameEl.ondblclick = (event) => {
            event.stopPropagation();
            this.editInline(nameEl, isCombined && new Set(entries.map(m => m.name)).size > 1 ? '' : entry.name, 'Name (empty to reset)',
                value => this.store.rename(uuids, value.trim()));
        };
        
        if (!isCombined) {
            const qtyEl = tr.querySelector('.qty');
            qtyEl.ondblclick = (event) => {
                event.stopPropagation();
                this.editInline(qtyEl, String(entry.quantity), 'Quantity', value => {
                    const quantity = parseInt(value, 10);
                    if (Number.isFinite(quantity) && quantity >= 0) this.store.setQuantity(entry.uuid, quantity);
                }, 'number');
            };
        }
        
        const actions = tr.querySelector('.actions');
        actions.appendChild(this.createAction(
            isHidden ? 'bi-eye-slash' : 'bi-eye',
            isHidden ? 'Show' : 'Hide',
            () => this.store.setHidden(uuids, !isHidden),
            isHidden ? 'muted' : ''
        ));
        actions.appendChild(this.createAction(
            notes.length ? 'bi-sticky-fill' : 'bi-sticky',
            notes.length ? 'Edit note' : 'Add note',
            () => this.editInline(tr.querySelector('td.name'), notes.join('; '), 'Note for the cut list',
                value => this.store.setNotes(uuids, value.trim())),
            notes.length ? 'active' : ''
        ));
        if (!isCombined && (entry.mergedCount > 1 || entry.splitFromUuid)) {
            actions.appendChild(this.createAction(
                entry.splitFromUuid ? 'bi-union' : 'bi-scissors',
                entry.splitFromUuid ? 'Merge back into one part' : 'List each material as a separate part',
                () => this.store.toggleSplit(entry.uuid)
            ));
        }
        
        tr.onclick = () => this.store.select(uuids);
        tr.onmouseenter = () => this.store.setHover(uuids);
        tr.onmouseleave = () => this.store.clearHover(uuids);
        
        return tr;
    }
    
    // Replace an element's content with an input; Enter or leaving it commits, Escape cancels
    editInline(element, value, placeholder, onCommit, type = 'text') {
        const input = document.createElement('input');
        input.type = type;
        input.className = 'form-control form-control-sm inline-edit';
        input.value = value;
        input.placeholder = placeholder;
        if (type === 'number') input.min = '0';
        
        let done = false;
        const finish = (commit) => {
            if (done) return;
            done = true;
            if (commit) {
                onCommit(input.value);
            } else {
                this.render();
            }
        };
        
        input.onclick = (event) => event.stopPropagation();
        input.ondblclick = (event) => event.stopPropagation();
        input.onkeydown = (event) => {
            if (event.key === 'Enter') finish(true);
            if (event.key === 'Escape') finish(false);
            event.stopPropagation();
        };
        input.onblur = () => finish(true);
        
        element.innerHTML = '';
        element.appendChild(input);
        input.focus();
        input.select();
    }
    
    // Banded edges as small labels, with materials and lengths in the tooltip
    formatEdges(entry) {
        const edges = bandedEdges(entry);
        if (edges.length === 0) return '<span class="no-edges" title="No edge banding detected">–</span>';
        
        const title = edges.map(([name, material, length]) => `${name}: ${material}, ${formatLengthWithUnit(length)}`).join('\n');
        return `<span title="${escapeHtml(title)}">${edges.map(([name]) => `<span class="edge-tag">${name}</span>`).join('')}</span>`;
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
