import { meshStore } from './ui-store.js';

export class ExportManager {
    constructor() {
        // Delay button creation to ensure toolbar exists
        setTimeout(() => {
            this.createExportButton();
        }, 100);
    }
    
    createExportButton() {
        // Find the toolbar (it might not exist immediately)
        const toolbar = document.querySelector('[style*="position: absolute"][style*="top: 10px"][style*="right: 10px"]');
        if (!toolbar) {
            console.warn('Toolbar not found, retrying in 100ms...');
            setTimeout(() => this.createExportButton(), 100);
            return;
        }
        
        // Create export button
        this.exportBtn = document.createElement('button');
        this.exportBtn.className = 'btn btn-sm btn-outline-light';
        this.exportBtn.innerHTML = '<i class="bi bi-download"></i>';
        this.exportBtn.title = 'Export included parts to Excel';
        this.exportBtn.style.cssText = `
            border: 1px solid rgba(255, 255, 255, 0.3);
            color: white;
            background: rgba(255, 255, 255, 0.1);
            min-width: 32px;
            height: 32px;
            display: flex;
            align-items: center;
            justify-content: center;
        `;
        
        this.exportBtn.onclick = () => this.exportToXLSX();
        
        this.exportBtn.addEventListener('mouseenter', () => {
            this.exportBtn.style.background = 'rgba(255, 255, 255, 0.2)';
        });
        
        this.exportBtn.addEventListener('mouseleave', () => {
            this.exportBtn.style.background = 'rgba(255, 255, 255, 0.1)';
        });
        
        // Add to toolbar
        toolbar.appendChild(this.exportBtn);
        
        // Update button state based on included parts
        this.updateButtonState();
        
        console.log('Export button created successfully');
    }
    
    updateButtonState() {
        if (!this.exportBtn) return;
        
        if (!meshStore) return;
        
        const includedParts = meshStore.meshes.filter(mesh => mesh.isIncluded);
        
        if (includedParts.length === 0) {
            this.exportBtn.disabled = true;
            this.exportBtn.style.opacity = '0.5';
            this.exportBtn.title = 'No parts included in the cut list';
        } else {
            this.exportBtn.disabled = false;
            this.exportBtn.style.opacity = '1';
            this.exportBtn.title = `Export ${includedParts.length} included part${includedParts.length === 1 ? '' : 's'} to Excel`;
        }
    }
    
    exportToXLSX() {
        if (!meshStore) {
            console.error('Mesh store not available');
            return;
        }
        
        const includedParts = meshStore.meshes.filter(mesh => mesh.isIncluded);
        
        if (includedParts.length === 0) {
            alert('No parts are included in the cut list. Tick some parts before exporting.');
            return;
        }
        
        try {
            // Prepare data for Excel
            const data = this.prepareExportData(includedParts);
            
            // Create workbook
            const workbook = XLSX.utils.book_new();
            
            // Create worksheet
            const worksheet = XLSX.utils.json_to_sheet(data);
            
            // Set column widths
            const columnWidths = [
                { wch: 25 }, // Component Name
                { wch: 20 }, // Length (mm)
                { wch: 20 }, // Width (mm)
                { wch: 20 }, // Thickness (mm)
                { wch: 30 }, // Full Dimensions
                { wch: 15 }, // Vertex Count
                { wch: 25 }, // Material Name
                { wch: 30 }  // Notes
            ];
            worksheet['!cols'] = columnWidths;
            
            // Add worksheet to workbook
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Cut List');
            
            // Generate filename with timestamp
            const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
            const filename = `Cut_List_${timestamp}.xlsx`;
            
            // Save file
            XLSX.writeFile(workbook, filename);
            
            // Show success message
            this.showExportSuccess(includedParts.length, filename);
            
        } catch (error) {
            console.error('Export error:', error);
            alert('Failed to export data. Please try again.');
        }
    }
    
    prepareExportData(includedParts) {
        return includedParts.map((mesh, index) => {
            const round = value => Math.round(value * 10) / 10;
            
            return {
                'Component Name': mesh.name,
                'Length (mm)': round(mesh.size.length),
                'Width (mm)': round(mesh.size.width),
                'Thickness (mm)': round(mesh.size.thickness),
                'Full Dimensions': mesh.dimensions,
                'Vertex Count': mesh.vertexCount,
                'Material Name': mesh.materialName,
                                'Notes': '', // Empty field for user notes
                'Export Order': index + 1
            };
        });
    }
    
    showExportSuccess(count, filename) {
        // Create a temporary success message
        const successMsg = document.createElement('div');
        successMsg.style.cssText = `
            position: fixed;
            top: 70px;
            right: 20px;
            background: rgba(25, 135, 84, 0.9);
            color: white;
            padding: 12px 16px;
            border-radius: 6px;
            font-family: sans-serif;
            font-size: 14px;
            z-index: 2000;
            backdrop-filter: blur(5px);
            border: 1px solid rgba(25, 135, 84, 0.5);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            transition: opacity 0.3s ease;
        `;
        
        successMsg.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px;">
                <i class="bi bi-check-circle-fill"></i>
                <div>
                    <div style="font-weight: bold;">Export Successful!</div>
                    <div style="font-size: 12px; opacity: 0.9;">
                        ${count} part${count === 1 ? "" : "s"} exported to ${filename}
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(successMsg);
        
        // Auto-remove after 4 seconds
        setTimeout(() => {
            successMsg.style.opacity = '0';
            setTimeout(() => {
                if (successMsg.parentNode) {
                    successMsg.parentNode.removeChild(successMsg);
                }
            }, 300);
        }, 4000);
    }
}