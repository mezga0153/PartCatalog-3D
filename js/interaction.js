import * as THREE from 'three';
import { partsStore } from './parts-store.js';
import { PopupManager } from './popup-manager.js';

export class InteractionManager {
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
        
        // Keep the popup in step with the list (units, names, quantities)
        partsStore.subscribe(change => {
            if (change === 'all') this.popupManager.refresh(uuid => partsStore.findPart(uuid));
        });
        
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
            
            // Highlight the part under the pointer (once per frame, not while dragging)
            if (event.buttons === 0) {
                this.pendingHover = event;
                if (!this.hoverFrame) {
                    this.hoverFrame = requestAnimationFrame(() => {
                        this.hoverFrame = null;
                        this.updateHover(this.pendingHover);
                    });
                }
            }
        });
        
        this.renderer.domElement.addEventListener('mouseleave', () => {
            partsStore.setSceneHover(null);
            this.renderer.domElement.style.cursor = '';
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
    
    // The part under the pointer, if any
    pickPart(event) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        this.raycaster.setFromCamera(this.mouse, this.camera);
        
        const intersects = this.raycaster.intersectObjects(this.getVisibleMeshes());
        return intersects.length > 0 ? this.meshManager.getPartForMesh(intersects[0].object) : null;
    }
    
    updateHover(event) {
        const part = this.pickPart(event);
        partsStore.setSceneHover(part ? part.object.uuid : null);
        this.renderer.domElement.style.cursor = part ? 'pointer' : '';
    }
    
    getVisibleMeshes() {
        return this.meshManager.getAllMeshes().filter(mesh => mesh.visible);
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
            const part = this.meshManager.getPartForMesh(clickedMesh);
            
            if (part) {
                // Use the unified selection method
                partsStore.select([part.object.uuid], { reveal: true });
                
                // Show popup with part information
                const meshData = partsStore.findPart(part.object.uuid);
                if (meshData) {
                    this.popupManager.showPopup(part, meshData);
                }
            }
        } else {
            // Clicked on empty space, deselect current mesh and hide popup
            if (partsStore.selectedUuids.size > 0) {
                partsStore.clearSelection();
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