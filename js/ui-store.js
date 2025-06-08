document.addEventListener('alpine:init', () => {
    Alpine.store('meshStore', {
        meshes: [],
        selectedMeshUuid: null, // Track currently selected mesh
        hoveredMeshUuid: null, // Track currently hovered mesh
        boundingBoxes: new Map(), // Store bounding box wireframes
        
        addMesh(meshData) {
            this.meshes.push({
                uuid: meshData.mesh.uuid,
                name: meshData.boxInfo.name,
                dimensions: `${meshData.boxInfo.dimensions_mm.x} × ${meshData.boxInfo.dimensions_mm.y} × ${meshData.boxInfo.dimensions_mm.z} mm`,
                vertexCount: meshData.boxInfo.vertexCount,
                materialName: meshData.materialName,
                isHidden: false,
                isKept: false,
                threeMesh: meshData.mesh
            });
            
            this.updateUI();
        },
        
        updateUI() {
            const meshList = document.getElementById('meshList');
            const meshCount = document.getElementById('meshCount');
            
            if (meshCount) {
                meshCount.textContent = `${this.meshes.length} meshes`;
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
                <div class="fw-bold">${mesh.name} • ${mesh.dimensions} • <span class="material-name">${mesh.materialName}</span></div>
            `;
            
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
            cardBody.appendChild(meshBtn);
            cardBody.appendChild(buttonGroup);
            meshCard.appendChild(cardBody);
            
            return meshCard;
        },
        
        findMeshByUuid(uuid) {
            return this.meshes.find(m => m.uuid === uuid);
        },
        
        findMeshByThreeObject(threeObject) {
            return this.meshes.find(m => m.threeMesh === threeObject);
        },
        
        createBoundingBox(mesh) {
            // Calculate bounding box
            const box = new THREE.Box3().setFromObject(mesh.threeMesh);
            
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
            let scene = mesh.threeMesh.parent;
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
            if (!mesh.threeMesh.userData.originalMaterial) {
                mesh.threeMesh.userData.originalMaterial = mesh.threeMesh.material.clone();
            }
            mesh.threeMesh.material = new THREE.MeshStandardMaterial({ 
                color: 0xff0000,
                metalness: mesh.threeMesh.userData.originalMaterial.metalness || 0.1,
                roughness: mesh.threeMesh.userData.originalMaterial.roughness || 0.7
            });
            
            this.updateUI();
        },
        
        deselectCurrentMesh() {
            if (!this.selectedMeshUuid) return;
            
            const mesh = this.findMeshByUuid(this.selectedMeshUuid);
            if (mesh) {
                // Restore original material
                if (mesh.threeMesh.userData.originalMaterial) {
                    mesh.threeMesh.material = mesh.threeMesh.userData.originalMaterial;
                }
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
            
            if (mesh.isHidden) {
                mesh.threeMesh.material.transparent = true;
                mesh.threeMesh.material.opacity = 0;
                // Hide bounding box if this mesh is currently hovered
                if (this.hoveredMeshUuid === uuid) {
                    this.hideCurrentBoundingBox();
                }
            } else {
                mesh.threeMesh.material.opacity = mesh.threeMesh.userData.originalOpacity || 1;
                if (mesh.threeMesh.material.opacity === 1) {
                    mesh.threeMesh.material.transparent = false;
                }
            }
            mesh.threeMesh.material.needsUpdate = true;
            this.updateUI();
        },
        
        toggleKeep(uuid) {
            const mesh = this.findMeshByUuid(uuid);
            if (!mesh) return;
            
            if (!mesh.threeMesh.userData.originalOpacity) {
                mesh.threeMesh.userData.originalOpacity = mesh.threeMesh.material.opacity || 1;
                mesh.threeMesh.userData.originalColor = mesh.threeMesh.material.color ? mesh.threeMesh.material.color.clone() : new THREE.Color(0xffffff);
                mesh.threeMesh.userData.originalEmissive = mesh.threeMesh.material.emissive ? mesh.threeMesh.material.emissive.clone() : new THREE.Color(0x000000);
            }
            
            mesh.isKept = !mesh.isKept;
            
            if (mesh.isKept) {
                mesh.threeMesh.material.color.set(0x00ff00);
                mesh.threeMesh.material.transparent = true;
                mesh.threeMesh.material.opacity = 0.1;
                mesh.threeMesh.material.emissive.set(0x004400);
            } else {
                mesh.threeMesh.material.color.copy(mesh.threeMesh.userData.originalColor);
                mesh.threeMesh.material.emissive.copy(mesh.threeMesh.userData.originalEmissive);
                mesh.threeMesh.material.opacity = mesh.threeMesh.userData.originalOpacity;
                if (mesh.threeMesh.material.opacity === 1) {
                    mesh.threeMesh.material.transparent = false;
                }
            }
            mesh.threeMesh.material.needsUpdate = true;
            this.updateUI();
            
            // Notify export manager to update button state
            if (window.exportManager) {
                window.exportManager.updateButtonState();
            }
        }
    });
});