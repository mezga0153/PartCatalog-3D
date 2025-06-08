class InteractionManager {
    constructor(renderer, camera, meshManager) {
        this.renderer = renderer;
        this.camera = camera;
        this.meshManager = meshManager;
        
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.isDragging = false;
        this.dragStart = { x: 0, y: 0 };
        
        // Initialize popup manager
        this.popupManager = new PopupManager(renderer, camera);
        
        this.setupEventListeners();
    }
    
    setupEventListeners() {
        this.renderer.domElement.addEventListener('mousedown', (event) => {
            this.isDragging = false;
            this.dragStart.x = event.clientX;
            this.dragStart.y = event.clientY;
        });
        
        this.renderer.domElement.addEventListener('mousemove', (event) => {
            const dragDistance = Math.sqrt(
                Math.pow(event.clientX - this.dragStart.x, 2) + 
                Math.pow(event.clientY - this.dragStart.y, 2)
            );
            if (dragDistance > 5) {
                this.isDragging = true;
            }
        });
        
        this.renderer.domElement.addEventListener('click', (event) => {
            this.onMeshClick(event);
        });
        
        // Close popup when clicking elsewhere
        document.addEventListener('click', (event) => {
            if (!this.renderer.domElement.contains(event.target)) {
                this.popupManager.hidePopup();
            }
        });
        
        // Close popup on escape key
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                this.popupManager.hidePopup();
            }
        });
    }
    
    getVisibleMeshes() {
        const meshStore = Alpine.store('meshStore');
        if (!meshStore) return this.meshManager.getAllMeshes();
        
        // Filter out hidden meshes by matching UUID
        const visibleMeshes = this.meshManager.getAllMeshes().filter(mesh => {
            const uiMesh = meshStore.findMeshByUuid(mesh.uuid);
            return !uiMesh || !uiMesh.isHidden;
        });
        
        return visibleMeshes;
    }
    
    onMeshClick(event) {
        console.log('Mesh click detected', this.isDragging);
        if (this.isDragging) return;
        
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        
        this.raycaster.setFromCamera(this.mouse, this.camera);
        
        // Only intersect with visible meshes
        const visibleMeshes = this.getVisibleMeshes();
        const intersects = this.raycaster.intersectObjects(visibleMeshes);
        
        console.log('Visible meshes:', visibleMeshes.length);
        console.log('Intersects found:', intersects.length);

        if (intersects.length > 0) {
            const clickedMesh = intersects[0].object;
            console.log('Clicked mesh:', clickedMesh);
            const meshStore = Alpine.store('meshStore');
            
            if (meshStore) {
                // Use the unified selection method
                meshStore.selectMesh(clickedMesh.uuid);
                
                // Show popup with mesh information
                const meshData = meshStore.findMeshByUuid(clickedMesh.uuid);
                if (meshData) {
                    this.popupManager.showPopup(clickedMesh, meshData);
                }
            }
        } else {
            // Clicked on empty space, deselect current mesh and hide popup
            const meshStore = Alpine.store('meshStore');
            if (meshStore && meshStore.selectedMeshUuid) {
                meshStore.deselectCurrentMesh();
            }
            this.popupManager.hidePopup();
        }
    }
    
    // Method to update popup position during camera movement
    updatePopup() {
        if (this.popupManager.isVisible()) {
            this.popupManager.updatePosition();
        }
    }
}