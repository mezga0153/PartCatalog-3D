import * as THREE from 'three';
import { formatSize } from './units.js';
import { modelKey, loadEdits, saveEdits } from './storage.js';

// Shared materials for highlighted and excluded parts
const selectedMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000, metalness: 0.1, roughness: 0.7 });
const fadedMaterial = new THREE.MeshStandardMaterial({
    color: 0x888888,
    metalness: 0,
    roughness: 1,
    transparent: true,
    opacity: 0.06,
    depthWrite: false
});
const excludedMaterial = new THREE.MeshStandardMaterial({
    color: 0x888888,
    metalness: 0,
    roughness: 1,
    transparent: true,
    opacity: 0.15,
    depthWrite: false
});

function sameUuids(a, b) {
    return a.length === b.length && a.every((uuid, i) => uuid === b[i]);
}

// UI state for the parts list (plain object; keep three.js objects out of reactive proxies)
export const meshStore = {
    meshes: [],
    selectedUuids: new Set(), // Currently selected parts
    hoveredUuids: [], // Parts whose bounding boxes are shown
    boundingBoxes: [], // Bounding box wireframes in the scene
    
    addMesh(meshData) {
        this.meshes.push(this.createEntry(meshData));
        
        this.updateUI();
    },
    
    createEntry(meshData) {
        const part = meshData.part;
        
        return {
            uuid: part.object.uuid,
            name: meshData.boxInfo.name,
            originalName: meshData.boxInfo.name,
            quantity: 1, // How many to cut of this part; can be edited
            notes: '',
            size: meshData.boxInfo.size_mm,
            dimensions: formatSize(meshData.boxInfo.size_mm),
            vertexCount: meshData.boxInfo.vertexCount,
            materialName: meshData.materialName,
            allMaterials: meshData.allMaterials,
            edges: meshData.edges,
            grain: meshData.grain,
            assembly: part.assembly,
            assemblyFromName: part.assemblyFromName,
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
        this.deselectCurrentMesh();
        
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
                const notes = [...new Set(siblings.map(m => m.notes).filter(Boolean))].join('; ');
                this.meshes.splice(index, 0, {
                    ...this.createEntry(partData),
                    isHidden,
                    isIncluded,
                    name: siblings[0].name,
                    quantity: siblings[0].quantity,
                    notes
                });
            }
        } else {
            // Pieces inherit hidden/included state; their meshes already look that way
            const pieces = meshManager.splitPart(uuid)
                .map(piece => meshManager.describePart(piece))
                .filter(Boolean)
                .map(partData => ({
                    ...this.createEntry(partData),
                    isHidden: entry.isHidden,
                    isIncluded: entry.isIncluded,
                    name: entry.name,
                    quantity: entry.quantity,
                    notes: entry.notes
                }));
            if (pieces.length === 0) return;
            
            this.meshes.splice(this.meshes.indexOf(entry), 1, ...pieces);
        }
        
        this.updateUI();
        if (window.exportManager) {
            window.exportManager.updateButtonState();
        }
    },
    
    // Views re-render when state changes
    listeners: [],
    
    subscribe(listener) {
        this.listeners.push(listener);
    },
    
    updateUI() {
        this.listeners.forEach(listener => listener());
        this.scheduleSave();
    },
    
    // Remember edits (names, quantities, notes, exclusions) for this model
    modelKey: null,
    saveTimer: null,
    
    restoreEdits(filename) {
        this.modelKey = modelKey(filename, this.meshes);
        loadEdits(this.modelKey, this.meshes);
        this.meshes.forEach(mesh => this.refreshAppearance(mesh));
        this.updateUI();
    },
    
    scheduleSave() {
        if (!this.modelKey) return;
        clearTimeout(this.saveTimer);
        this.saveTimer = setTimeout(() => saveEdits(this.modelKey, this.meshes), 300);
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
        this.showBoundingBoxes([uuid]);
    },
    
    hideBoundingBox(uuid) {
        this.hideBoundingBoxes([uuid]);
    },
    
    hideCurrentBoundingBox() {
        this.hideBoundingBoxes();
    },
    
    showBoundingBoxes(uuids) {
        if (sameUuids(this.hoveredUuids, uuids)) return; // Already showing
        
        // Hide any existing bounding boxes
        this.hideBoundingBoxes();
        this.hoveredUuids = uuids.slice();
        
        uuids.forEach(uuid => {
            const mesh = this.findMeshByUuid(uuid);
            if (!mesh || mesh.isHidden) return;
            
            // Add to scene (get scene from the mesh's parent)
            let scene = mesh.threeObject.parent;
            while (scene && !scene.isScene) {
                scene = scene.parent;
            }
            if (scene) {
                const boundingBox = this.createBoundingBox(mesh);
                scene.add(boundingBox);
                this.boundingBoxes.push(boundingBox);
            }
        });
    },
    
    // Hide the shown bounding boxes; with uuids, only if those are the ones shown
    hideBoundingBoxes(uuids) {
        if (uuids && !sameUuids(this.hoveredUuids, uuids)) return;
        
        this.boundingBoxes.forEach(boundingBox => {
            if (boundingBox.parent) boundingBox.parent.remove(boundingBox);
        });
        this.boundingBoxes = [];
        this.hoveredUuids = [];
    },
    
    isSelected(uuid) {
        return this.selectedUuids.has(uuid);
    },
    
    // Select one part
    selectMesh(uuid) {
        this.select([uuid]);
    },
    
    // Part hovered in the 3D view, shown in the table and with a bounding box
    sceneHoverUuid: null,
    hoverListeners: [],
    
    setSceneHover(uuid) {
        if (this.sceneHoverUuid === uuid) return;
        this.sceneHoverUuid = uuid;
        
        if (uuid) {
            this.showBoundingBoxes([uuid]);
        } else {
            this.hideBoundingBoxes();
        }
        this.hoverListeners.forEach(listener => listener(uuid));
    },
    
    // Uuid of a part the table should scroll to after the next render
    revealUuid: null,
    
    // Select a set of parts; selecting the current selection again clears it.
    // With reveal, the parts list scrolls to the selected part.
    select(uuids, { reveal = false } = {}) {
        this.revealUuid = reveal ? uuids[0] : null;
        const isSameSelection = uuids.length === this.selectedUuids.size && uuids.every(uuid => this.selectedUuids.has(uuid));
        const previous = [...this.selectedUuids];
        
        this.selectedUuids = isSameSelection ? new Set() : new Set(uuids.filter(uuid => this.findMeshByUuid(uuid)));
        
        // While isolating, every part's look depends on the selection
        const affected = this.isolate ? this.meshes.map(m => m.uuid) : new Set([...previous, ...uuids]);
        affected.forEach(uuid => {
            const mesh = this.findMeshByUuid(uuid);
            if (mesh) this.refreshAppearance(mesh);
        });
        
        this.updateUI();
    },
    
    // Isolate: show the selected parts in their own materials and fade the rest
    isolate: false,
    
    setIsolate(isolate) {
        this.isolate = isolate;
        this.meshes.forEach(mesh => this.refreshAppearance(mesh));
        this.updateUI();
    },
    
    deselectCurrentMesh() {
        if (this.selectedUuids.size === 0) return;
        
        const previous = [...this.selectedUuids];
        this.selectedUuids = new Set();
        (this.isolate ? this.meshes.map(m => m.uuid) : previous).forEach(uuid => {
            const mesh = this.findMeshByUuid(uuid);
            if (mesh) this.refreshAppearance(mesh);
        });
        
        this.updateUI();
    },
    
    toggleVisibility(uuid) {
        const mesh = this.findMeshByUuid(uuid);
        if (mesh) this.setHidden([uuid], !mesh.isHidden);
    },
    
    setHidden(uuids, isHidden) {
        uuids.forEach(uuid => {
            const mesh = this.findMeshByUuid(uuid);
            if (!mesh) return;
            
            mesh.isHidden = isHidden;
            mesh.threeMeshes.forEach(threeMesh => {
                threeMesh.visible = !isHidden;
            });
        });
        
        // Hide bounding boxes of parts that were just hidden
        if (isHidden && this.hoveredUuids.some(uuid => uuids.includes(uuid))) {
            this.hideBoundingBoxes();
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
    
    rename(uuids, name) {
        uuids.forEach(uuid => {
            const mesh = this.findMeshByUuid(uuid);
            if (mesh) mesh.name = name || mesh.originalName;
        });
        this.updateUI();
    },
    
    setQuantity(uuid, quantity) {
        const mesh = this.findMeshByUuid(uuid);
        if (!mesh) return;
        
        mesh.quantity = Math.max(0, Math.round(quantity));
        this.updateUI();
    },
    
    setNotes(uuids, notes) {
        uuids.forEach(uuid => {
            const mesh = this.findMeshByUuid(uuid);
            if (mesh) mesh.notes = notes;
        });
        this.updateUI();
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
            
            const isSelected = this.selectedUuids.has(mesh.uuid);
            
            if (this.isolate && this.selectedUuids.size > 0) {
                threeMesh.material = isSelected ? threeMesh.userData.originalMaterial : fadedMaterial;
            } else if (isSelected) {
                threeMesh.material = selectedMaterial;
            } else if (!mesh.isIncluded) {
                threeMesh.material = excludedMaterial;
            } else {
                threeMesh.material = threeMesh.userData.originalMaterial;
            }
        });
    }
};
