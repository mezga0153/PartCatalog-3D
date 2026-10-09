import * as THREE from 'three';
import { formatSize } from './units.js';

// Shared materials for highlighted and excluded parts
const selectedMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000, metalness: 0.1, roughness: 0.7 });
const excludedMaterial = new THREE.MeshStandardMaterial({
    color: 0x888888,
    metalness: 0,
    roughness: 1,
    transparent: true,
    opacity: 0.15,
    depthWrite: false
});

// UI state for the parts list (plain object; keep three.js objects out of reactive proxies)
export const meshStore = {
    meshes: [],
    selectedMeshUuid: null, // Track currently selected mesh
    hoveredMeshUuid: null, // Track currently hovered mesh
    boundingBoxes: new Map(), // Store bounding box wireframes
    
    addMesh(meshData) {
        this.meshes.push(this.createEntry(meshData));
        
        this.updateUI();
    },
    
    createEntry(meshData) {
        const part = meshData.part;
        
        return {
            uuid: part.object.uuid,
            name: meshData.boxInfo.name,
            size: meshData.boxInfo.size_mm,
            dimensions: formatSize(meshData.boxInfo.size_mm),
            vertexCount: meshData.boxInfo.vertexCount,
            materialName: meshData.materialName,
            isHidden: false,
            isIncluded: true,
            threeObject: part.object,
            threeMeshes: part.meshes,
            // Multi-material parts are merged from several meshes and can be split back
            mergedCount: part.meshes.length,
            splitFromUuid: part.splitFrom ? part.splitFrom.object.uuid : null
        };
    },
    
    // Split a merged part into one entry per mesh, or merge split entries back
    toggleSplit(uuid) {
        const entry = this.findMeshByUuid(uuid);
        const meshManager = window.meshManager;
        if (!entry || !meshManager) return;
        
        // The part list is about to change, so drop transient view state
        if (window.toolbarManager) window.toolbarManager.collapse();
        this.hideCurrentBoundingBox();
        if (this.selectedMeshUuid) this.deselectCurrentMesh();
        
        if (entry.splitFromUuid) {
            const siblings = this.meshes.filter(m => m.splitFromUuid === entry.splitFromUuid);
            
            // The merged part is hidden only if all its pieces were, and included if any was
            const isHidden = siblings.every(m => m.isHidden);
            const isIncluded = siblings.some(m => m.isIncluded);
            siblings.forEach(m => {
                if (m.isHidden !== isHidden) this.toggleVisibility(m.uuid);
                if (m.isIncluded !== isIncluded) this.setIncluded([m.uuid], isIncluded);
            });
            
            const partData = meshManager.describePart(meshManager.mergePart(entry.splitFromUuid));
            const index = this.meshes.indexOf(siblings[0]);
            this.meshes = this.meshes.filter(m => !siblings.includes(m));
            if (partData) {
                this.meshes.splice(index, 0, { ...this.createEntry(partData), isHidden, isIncluded });
            }
        } else {
            // Pieces inherit hidden/included state; their meshes already look that way
            const pieces = meshManager.splitPart(uuid)
                .map(piece => meshManager.describePart(piece))
                .filter(Boolean)
                .map(partData => ({ ...this.createEntry(partData), isHidden: entry.isHidden, isIncluded: entry.isIncluded }));
            if (pieces.length === 0) return;
            
            this.meshes.splice(this.meshes.indexOf(entry), 1, ...pieces);
        }
        
        this.updateUI();
        if (window.exportManager) {
            window.exportManager.updateButtonState();
        }
    },
    
    // Set by the parts table to re-render when state changes
    onChange: null,
    
    updateUI() {
        if (this.onChange) this.onChange();
    },
    
    findMeshByUuid(uuid) {
        return this.meshes.find(m => m.uuid === uuid);
    },
    
    findMeshByThreeObject(threeObject) {
        return this.meshes.find(m => m.threeObject === threeObject || m.threeMeshes.includes(threeObject));
    },
    
    createBoundingBox(mesh) {
        // Calculate bounding box
        const box = new THREE.Box3();
        mesh.threeMeshes.forEach(threeMesh => box.expandByObject(threeMesh));
        
        // Create wireframe box geometry
        const size = new THREE.Vector3();
        box.getSize(size);
        const center = new THREE.Vector3();
        box.getCenter(center);
        
        const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
        const edges = new THREE.EdgesGeometry(geometry);
        const material = new THREE.LineBasicMaterial({ 
            color: 0x00ff00, 
            linewidth: 2,
            transparent: true,
            opacity: 0.8
        });
        
        const wireframe = new THREE.LineSegments(edges, material);
        wireframe.position.copy(center);
        
        return wireframe;
    },
    
    showBoundingBox(uuid) {
        if (this.hoveredMeshUuid === uuid) return; // Already showing
        
        // Hide any existing bounding box
        this.hideCurrentBoundingBox();
        
        const mesh = this.findMeshByUuid(uuid);
        if (!mesh || mesh.isHidden) return;
        
        this.hoveredMeshUuid = uuid;
        
        // Create and add bounding box
        const boundingBox = this.createBoundingBox(mesh);
        this.boundingBoxes.set(uuid, boundingBox);
        
        // Add to scene (get scene from the mesh's parent)
        let scene = mesh.threeObject.parent;
        while (scene && !scene.isScene) {
            scene = scene.parent;
        }
        if (scene) {
            scene.add(boundingBox);
        }
    },
    
    hideBoundingBox(uuid) {
        if (this.hoveredMeshUuid !== uuid) return; // Not currently hovered
        
        this.hideCurrentBoundingBox();
    },
    
    hideCurrentBoundingBox() {
        if (!this.hoveredMeshUuid) return;
        
        const boundingBox = this.boundingBoxes.get(this.hoveredMeshUuid);
        if (boundingBox && boundingBox.parent) {
            boundingBox.parent.remove(boundingBox);
        }
        
        this.boundingBoxes.delete(this.hoveredMeshUuid);
        this.hoveredMeshUuid = null;
    },
    
    // Unified selection method
    selectMesh(uuid) {
        console.log('Selecting mesh:', uuid);
        
        // If this mesh is already selected, deselect it
        if (this.selectedMeshUuid === uuid) {
            this.deselectCurrentMesh();
            return;
        }
        
        // Deselect previously selected mesh
        if (this.selectedMeshUuid) {
            this.deselectCurrentMesh();
        }
        
        // Select new mesh
        const mesh = this.findMeshByUuid(uuid);
        if (!mesh) return;
        
        this.selectedMeshUuid = uuid;
        this.refreshAppearance(mesh);
        
        this.updateUI();
    },
    
    deselectCurrentMesh() {
        if (!this.selectedMeshUuid) return;
        
        const mesh = this.findMeshByUuid(this.selectedMeshUuid);
        this.selectedMeshUuid = null;
        if (mesh) this.refreshAppearance(mesh);

        this.updateUI();
    },
    
    // Keep for compatibility but redirect to unified method
    toggleMeshSelection(uuid) {
        this.selectMesh(uuid);
    },
    
    toggleVisibility(uuid) {
        const mesh = this.findMeshByUuid(uuid);
        if (!mesh) return;
        
        mesh.isHidden = !mesh.isHidden;
        mesh.threeMeshes.forEach(threeMesh => {
            threeMesh.visible = !mesh.isHidden;
        });
        
        // Hide bounding box if this mesh is currently hovered
        if (mesh.isHidden && this.hoveredMeshUuid === uuid) {
            this.hideCurrentBoundingBox();
        }
        this.updateUI();
    },
    
    // Include or exclude parts from the cut list; excluded parts are ghosted in 3D
    setIncluded(uuids, isIncluded) {
        uuids.forEach(uuid => {
            const mesh = this.findMeshByUuid(uuid);
            if (!mesh) return;
            
            mesh.isIncluded = isIncluded;
            this.refreshAppearance(mesh);
        });
        this.updateUI();
        
        // Notify export manager to update button state
        if (window.exportManager) {
            window.exportManager.updateButtonState();
        }
    },
    
    toggleIncluded(uuid) {
        const mesh = this.findMeshByUuid(uuid);
        if (mesh) this.setIncluded([uuid], !mesh.isIncluded);
    },
    
    // Pick the material for a part from its state: selected, excluded or its own
    refreshAppearance(mesh) {
        mesh.threeMeshes.forEach(threeMesh => {
            if (!threeMesh.userData.originalMaterial) {
                threeMesh.userData.originalMaterial = threeMesh.material;
            }
            
            if (this.selectedMeshUuid === mesh.uuid) {
                threeMesh.material = selectedMaterial;
            } else if (!mesh.isIncluded) {
                threeMesh.material = excludedMaterial;
            } else {
                threeMesh.material = threeMesh.userData.originalMaterial;
            }
        });
    }
};
