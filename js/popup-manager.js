class PopupManager {
    constructor(renderer, camera) {
        this.renderer = renderer;
        this.camera = camera;
        this.popup = null;
        this.line = null;
        this.targetMesh = null;
        this.targetPosition = new THREE.Vector3();
        
        this.createPopupElements();
    }
    
    createPopupElements() {
        // Create popup container
        this.popup = document.createElement('div');
        this.popup.className = 'mesh-popup';
        this.popup.style.display = 'none';
        
        // Position popup in top right corner below toolbar
        this.popup.style.position = 'fixed';
        this.popup.style.top = '65px'; // Below the toolbar
        this.popup.style.right = '10px';
        this.popup.style.transformOrigin = 'top right';
        
        document.body.appendChild(this.popup);
        
        // Create connection line
        this.line = document.createElement('div');
        this.line.className = 'mesh-popup-line';
        this.line.style.display = 'none';
        document.body.appendChild(this.line);
    }
    
    showPopup(mesh, meshData) {
        this.targetMesh = mesh;
        
        // Get mesh center position
        const box = new THREE.Box3().setFromObject(mesh);
        box.getCenter(this.targetPosition);
        
        // Create popup content
        this.popup.innerHTML = `
            <div class="mesh-popup-title">${meshData.name}</div>
            <div class="mesh-popup-info">
                <span class="mesh-popup-label">Dimensions:</span> 
                <span class="mesh-popup-value">${meshData.dimensions}</span>
            </div>
            <div class="mesh-popup-info">
                <span class="mesh-popup-label">Vertices:</span> 
                <span class="mesh-popup-value">${meshData.vertexCount.toLocaleString()}</span>
            </div>
            <div class="mesh-popup-info">
                <span class="mesh-popup-label">Material:</span> 
                <span class="mesh-popup-value">${meshData.materialName}</span>
            </div>
        `;
        
        this.popup.style.display = 'block';
        this.line.style.display = 'block';
        
        this.updatePosition();
    }
    
    hidePopup() {
        if (this.popup) {
            this.popup.style.display = 'none';
        }
        if (this.line) {
            this.line.style.display = 'none';
        }
        this.targetMesh = null;
    }
    
    updatePosition() {
        if (!this.targetMesh || !this.popup || this.popup.style.display === 'none') {
            return;
        }
        
        // Project 3D position to screen coordinates
        const vector = this.targetPosition.clone();
        vector.project(this.camera);
        
        // Convert to screen coordinates
        const rect = this.renderer.domElement.getBoundingClientRect();
        const meshX = (vector.x * 0.5 + 0.5) * rect.width + rect.left;
        const meshY = (-vector.y * 0.5 + 0.5) * rect.height + rect.top;
        
        // Check if mesh is behind camera
        if (vector.z > 1) {
            this.hidePopup();
            return;
        }
        
        // Get popup position (fixed in top right)
        const popupRect = this.popup.getBoundingClientRect();
        const popupX = popupRect.left;
        const popupY = popupRect.top + popupRect.height; // Bottom of popup
        
        // Update connection line from mesh center to popup bottom-left corner
        this.updateLine(meshX, meshY, popupX, popupY);
    }
    
    updateLine(meshX, meshY, popupX, popupY) {
        // Calculate line from mesh center to popup bottom-left corner
        const startX = meshX;
        const startY = meshY;
        const endX = popupX;
        const endY = popupY;
        
        const deltaX = endX - startX;
        const deltaY = endY - startY;
        const length = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        const angle = Math.atan2(deltaY, deltaX) * 180 / Math.PI;
        
        this.line.style.left = `${startX}px`;
        this.line.style.top = `${startY}px`;
        this.line.style.width = `${length}px`;
        this.line.style.transform = `rotate(${angle}deg)`;
    }
    
    isVisible() {
        return this.popup && this.popup.style.display !== 'none';
    }
}