import { meshStore } from './ui-store.js';
import { cutListRows, summarize, totalQuantity } from './cut-list.js';
import { showToast } from './toast.js';
import { toUnit, unitLabel, areaInUnit, areaLabel, runInUnit, runLabel } from './units.js';
import { printCutList } from './print.js';

// Export the included parts as a cut list (Excel or CSV)
export class ExportManager {
    constructor(getSheetSettings) {
        this.getSheetSettings = getSheetSettings;
        this.createExportButton();
    }
    
    createExportButton() {
        const toolbar = document.getElementById('toolbar');
        
        this.dropdown = document.createElement('div');
        this.dropdown.className = 'dropdown';
        this.dropdown.innerHTML = `
            <button type="button" class="btn btn-sm toolbar-btn" data-bs-toggle="dropdown" aria-expanded="false">
                <i class="bi bi-download"></i>
            </button>
            <ul class="dropdown-menu dropdown-menu-end dropdown-menu-dark">
                <li><button type="button" class="dropdown-item" data-format="xlsx"><i class="bi bi-file-earmark-spreadsheet"></i> Excel (.xlsx)</button></li>
                <li><button type="button" class="dropdown-item" data-format="csv"><i class="bi bi-filetype-csv"></i> CSV</button></li>
                <li><button type="button" class="dropdown-item" data-format="print"><i class="bi bi-printer"></i> Print / PDF</button></li>
            </ul>
        `;
        this.exportBtn = this.dropdown.querySelector('[data-bs-toggle]');
        
        this.dropdown.querySelector('[data-format="xlsx"]').onclick = () => this.exportToXLSX();
        this.dropdown.querySelector('[data-format="csv"]').onclick = () => this.exportToCSV();
        this.dropdown.querySelector('[data-format="print"]').onclick = () => this.print();
        
        toolbar.appendChild(this.dropdown);
        this.updateButtonState();
    }
    
    getIncludedParts() {
        return meshStore.meshes.filter(mesh => mesh.isIncluded);
    }
    
    updateButtonState() {
        if (!this.exportBtn) return;
        
        const count = this.getIncludedParts().length;
        this.exportBtn.disabled = count === 0;
        this.exportBtn.title = count === 0
            ? 'No parts included in the cut list'
            : `Export cut list (${count} part${count === 1 ? '' : 's'})`;
    }
    
    getModelName() {
        return (document.title.split(' - ').slice(1).join(' - ') || 'model').replace(/\.glb$/i, '');
    }
    
    print() {
        const parts = this.getIncludedParts();
        if (parts.length === 0) return;
        
        try {
            printCutList(parts, this.getSheetSettings(), this.getModelName());
        } catch (error) {
            console.error('Print error:', error);
            alert('Failed to prepare the printable cut list.');
        }
    }
    
    getFilename(extension) {
        const model = this.getModelName();
        const timestamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
        return `Cut_List_${model.replace(/[^\w-]+/g, '_')}_${timestamp}.${extension}`;
    }
    
    exportToXLSX() {
        const parts = this.getIncludedParts();
        if (parts.length === 0) return;
        
        try {
            const workbook = XLSX.utils.book_new();
            
            const rows = cutListRows(parts);
            const cutList = XLSX.utils.json_to_sheet(rows);
            cutList['!cols'] = Object.keys(rows[0]).map(key => ({ wch: key === 'Part' || key === 'Notes' ? 30 : Math.max(10, key.length + 2) }));
            XLSX.utils.book_append_sheet(workbook, cutList, 'Cut List');
            
            const { boards, banding } = summarize(parts, this.getSheetSettings());
            const summary = XLSX.utils.json_to_sheet(boards.map(board => ({
                'Material': board.material,
                [`Thickness (${unitLabel()})`]: toUnit(board.thickness),
                'Parts': board.count,
                [`Area (${areaLabel()})`]: Math.round(areaInUnit(board.area) * 100) / 100,
                'Sheets (estimate)': board.sheets
            })));
            XLSX.utils.sheet_add_json(summary, banding.map(band => ({
                'Banding': band.material,
                'Edges': band.count,
                [`Length (${runLabel()})`]: Math.round(runInUnit(band.length) * 100) / 100,
                [`To order (${runLabel()})`]: Math.round(runInUnit(band.toOrder) * 10) / 10
            })), { origin: boards.length + 2 });
            summary['!cols'] = [{ wch: 25 }, { wch: 15 }, { wch: 10 }, { wch: 12 }, { wch: 16 }];
            XLSX.utils.book_append_sheet(workbook, summary, 'Summary');
            
            const filename = this.getFilename('xlsx');
            XLSX.writeFile(workbook, filename);
            this.showExportSuccess(totalQuantity(parts), filename);
        } catch (error) {
            console.error('Export error:', error);
            alert('Failed to export data. Please try again.');
        }
    }
    
    exportToCSV() {
        const parts = this.getIncludedParts();
        if (parts.length === 0) return;
        
        const rows = cutListRows(parts);
        const columns = Object.keys(rows[0]);
        const quote = value => {
            const text = String(value);
            return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
        };
        const csv = [columns, ...rows.map(row => columns.map(column => row[column]))]
            .map(values => values.map(quote).join(','))
            .join('\r\n');
        
        // BOM so Excel opens the file as UTF-8
        const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
        const filename = this.getFilename('csv');
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 1000);
        
        this.showExportSuccess(totalQuantity(parts), filename);
    }
    
    showExportSuccess(count, filename) {
        showToast('Export Successful!', `${count} piece${count === 1 ? '' : 's'} exported to ${filename}`);
    }
}
