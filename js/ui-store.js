import * as THREE from 'three';
import { escapeHtml } from './html.js';

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
            dimensions: `${meshData.boxInfo.dimensions_mm.x} × ${meshData.boxInfo.dimensions_mm.y} × ${meshData.boxInfo.dimensions_mm.z} mm`,
            vertexCount: meshData.boxInfo.vertexCount,
            materialName: meshData.materialName,
            isHidden: false,
            isKept: false,
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
            
            // The merged part is hidden/kept only if all its pieces were
            const isHidden = siblings.every(m => m.isHidden);
            const isKept = siblings.every(m => m.isKept);
            siblings.forEach(m => {
                if (m.isHidden !== isHidden) this.toggleVisibility(m.uuid);
                if (m.isKept !== isKept) this.toggleKeep(m.uuid);
            });
            
            const partData = meshManager.describePart(meshManager.mergePart(entry.splitFromUuid));
            const index = this.meshes.indexOf(siblings[0]);
            this.meshes = this.meshes.filter(m => !siblings.includes(m));
            if (partData) {
                this.meshes.splice(index, 0, { ...this.createEntry(partData), isHidden, isKept });
            }
        } else {
            // Pieces inherit hidden/kept state; their meshes already look that way
            const pieces = meshManager.splitPart(uuid)
                .map(piece => meshManager.describePart(piece))
                .filter(Boolean)
                .map(partData => ({ ...this.createEntry(partData), isHidden: entry.isHidden, isKept: entry.isKept }));
            if (pieces.length === 0) return;
            
            this.meshes.splice(this.meshes.indexOf(entry), 1, ...pieces);
        }
        
        this.updateUI();
        if (window.exportManager) {
            window.exportManager.updateButtonState();
        }
    },
    
    updateUI() {
        const meshList = document.getElementById('meshList');
        const meshCount = document.getElementById('meshCount');
        
        if (meshCount) {
            meshCount.textContent = `${this.meshes.length} parts`;
            meshCount.className = 'badge bg-primary';
        }
        
        if (meshList) {
            meshList.innerHTML = '';
            this.meshes.forEach(mesh => {
                const meshCard = this.createMeshCard(mesh);
                meshList.appendChild(meshCard);
            });
        }
    },
    
    createMeshCard(mesh) {
        const meshCard = document.createElement('div');
        meshCard.className = 'card mesh-item';
        meshCard.style.cursor = 'pointer';
        
        // Check if this mesh is selected using the global selectedMeshUuid
        if (this.selectedMeshUuid === mesh.uuid) {
            meshCard.style.backgroundColor = 'rgba(220, 53, 69, 0.1)';
            meshCard.style.borderColor = '#dc3545';
            meshCard.style.borderWidth = '2px';
        }
        
        const cardBody = document.createElement('div');
        cardBody.className = 'card-body p-2';
        
        const meshBtn = document.createElement('button');
        meshBtn.className = 'btn btn-outline-primary btn-sm w-100 text-start mesh-info mb-2';
        meshBtn.innerHTML = `
            <div class="fw-bold">${escapeHtml(mesh.name)} • ${mesh.dimensions} • <span class="material-name">${escapeHtml(mesh.materialName)}</span></div>
        `;
        
        // Explain merged/split parts
        let partNote = null;
        if (mesh.mergedCount > 1 || mesh.splitFromUuid) {
            partNote = document.createElement('div');
            partNote.className = 'part-note';
            partNote.innerHTML = mesh.splitFromUuid
                ? `<i class="bi bi-scissors"></i> Split from ${escapeHtml(mesh.name)} (one mesh per material)`
                : `<i class="bi bi-layers"></i> Merged from ${mesh.mergedCount} meshes (one per material)`;
        }
        
        const buttonGroup = document.createElement('div');
        buttonGroup.className = 'btn-group w-100';
        buttonGroup.setAttribute('role', 'group');
        
        const hideBtn = document.createElement('button');
        hideBtn.className = mesh.isHidden ? 'btn btn-danger btn-sm' : 'btn btn-outline-danger btn-sm';
        hideBtn.innerHTML = mesh.isHidden ? '<i class="bi bi-eye"></i> Show' : '<i class="bi bi-eye-slash"></i> Hide';
        hideBtn.onclick = (e) => {
            e.stopPropagation();
            this.toggleVisibility(mesh.uuid);
        };
        
        const keepBtn = document.createElement('button');
        keepBtn.className = mesh.isKept ? 'btn btn-success btn-sm' : 'btn btn-outline-success btn-sm';
        keepBtn.innerHTML = mesh.isKept ? '<i class="bi bi-check-circle-fill"></i> Kept' : '<i class="bi bi-check-circle"></i> Keep';
        keepBtn.onclick = (e) => {
            e.stopPropagation();
            this.toggleKeep(mesh.uuid);
        };
        
        // Card click selects the mesh
        meshCard.onclick = () => {
            this.selectMesh(mesh.uuid);
        };
        
        // Add hover events for bounding box display
        meshCard.onmouseenter = () => {
            this.showBoundingBox(mesh.uuid);
        };
        
        meshCard.onmouseleave = () => {
            this.hideBoundingBox(mesh.uuid);
        };
        
        buttonGroup.appendChild(hideBtn);
        buttonGroup.appendChild(keepBtn);
        
        if (partNote) {
            const splitBtn = document.createElement('button');
            splitBtn.className = 'btn btn-outline-info btn-sm';
            splitBtn.innerHTML = mesh.splitFromUuid ? '<i class="bi bi-union"></i> Merge' : '<i class="bi bi-scissors"></i> Split';
            splitBtn.title = mesh.splitFromUuid ? 'Merge back into one part' : 'List each material as a separate part';
            splitBtn.onclick = (e) => {
                e.stopPropagation();
                this.toggleSplit(mesh.uuid);
            };
            buttonGroup.appendChild(splitBtn);
        }
        
        cardBody.appendChild(meshBtn);
        if (partNote) cardBody.appendChild(partNote);
        cardBody.appendChild(buttonGroup);
        meshCard.appendChild(cardBody);
        
        return meshCard;
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
        
        // Apply red material
        mesh.threeMeshes.forEach(threeMesh => {
            if (!threeMesh.userData.originalMaterial) {
                threeMesh.userData.originalMaterial = threeMesh.material.clone();
            }
            threeMesh.material = new THREE.MeshStandardMaterial({ 
                color: 0xff0000,
                metalness: threeMesh.userData.originalMaterial.metalness || 0.1,
                roughness: threeMesh.userData.originalMaterial.roughness || 0.7
            });
        });
        
        this.updateUI();
    },
    
    deselectCurrentMesh() {
        if (!this.selectedMeshUuid) return;
        
        const mesh = this.findMeshByUuid(this.selectedMeshUuid);
        if (mesh) {
            // Restore original material
            mesh.threeMeshes.forEach(threeMesh => {
                if (threeMesh.userData.originalMaterial) {
                    threeMesh.material = threeMesh.userData.originalMaterial;
                }
            });
        }
        
        this.selectedMeshUuid = null;
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
    
    toggleKeep(uuid) {
        const mesh = this.findMeshByUuid(uuid);
        if (!mesh) return;
        
        mesh.isKept = !mesh.isKept;
        
        mesh.threeMeshes.forEach(threeMesh => {
            if (!threeMesh.userData.originalOpacity) {
                threeMesh.userData.originalOpacity = threeMesh.material.opacity || 1;
                threeMesh.userData.originalColor = threeMesh.material.color ? threeMesh.material.color.clone() : new THREE.Color(0xffffff);
                threeMesh.userData.originalEmissive = threeMesh.material.emissive ? threeMesh.material.emissive.clone() : new THREE.Color(0x000000);
            }
            
            if (mesh.isKept) {
                threeMesh.material.color.set(0x00ff00);
                threeMesh.material.transparent = true;
                threeMesh.material.opacity = 0.1;
                threeMesh.material.emissive.set(0x004400);
            } else {
                threeMesh.material.color.copy(threeMesh.userData.originalColor);
                threeMesh.material.emissive.copy(threeMesh.userData.originalEmissive);
                threeMesh.material.opacity = threeMesh.userData.originalOpacity;
                if (threeMesh.material.opacity === 1) {
                    threeMesh.material.transparent = false;
                }
            }
            threeMesh.material.needsUpdate = true;
        });
        this.updateUI();
        
        // Notify export manager to update button state
        if (window.exportManager) {
            window.exportManager.updateButtonState();
        }
    }
};
