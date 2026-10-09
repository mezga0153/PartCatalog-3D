class MeshManager {
    constructor() {
        this.allMeshes = [];
        this.boxes = [];
        this.meshVertices = new Map();
    }
    
    processModel(model) {
        this.collectMeshes(model);
        this.compactGeometries();
        this.processVertices();
        this.enhanceMaterials(model);
        
        return this.allMeshes;
    }
    
    collectMeshes(model) {
        this.allMeshes = [];
        model.traverse((child) => {
            if (child.isMesh && child.geometry) {
                this.allMeshes.push(child);
            }
        });
    }
    
    // Some exporters (e.g. the SketchUp glTF exporter) share one vertex buffer
    // between many meshes and select each mesh's triangles via its index buffer.
    // Three.js then gives every mesh the whole shared position attribute, so its
    // bounding box, dimensions and explode direction include vertices that belong
    // to other parts. Rebuild each indexed geometry with only the vertices it uses.
    compactGeometries() {
        this.allMeshes.forEach((mesh) => {
            mesh.geometry = this.compactGeometry(mesh.geometry);
        });
    }
    
    compactGeometry(geometry) {
        const index = geometry.getIndex();
        const position = geometry.getAttribute('position');
        if (!index || !position) return geometry;
        if (Object.keys(geometry.morphAttributes).length > 0) return geometry;
        
        // Map old vertex index -> new vertex index, in order of first use
        const remap = new Map();
        const oldIndices = [];
        for (let i = 0; i < index.count; i++) {
            const oldIndex = index.getX(i);
            if (!remap.has(oldIndex)) {
                remap.set(oldIndex, remap.size);
                oldIndices.push(oldIndex);
            }
        }
        
        if (oldIndices.length === position.count) return geometry;
        
        const compacted = new THREE.BufferGeometry();
        compacted.name = geometry.name;
        compacted.userData = geometry.userData;
        
        Object.keys(geometry.attributes).forEach((name) => {
            compacted.setAttribute(name, this.compactAttribute(geometry.getAttribute(name), oldIndices));
        });
        
        const newIndex = oldIndices.length > 65535 ? new Uint32Array(index.count) : new Uint16Array(index.count);
        for (let i = 0; i < index.count; i++) {
            newIndex[i] = remap.get(index.getX(i));
        }
        compacted.setIndex(new THREE.BufferAttribute(newIndex, 1));
        
        geometry.groups.forEach((group) => {
            compacted.addGroup(group.start, group.count, group.materialIndex);
        });
        
        compacted.computeBoundingBox();
        compacted.computeBoundingSphere();
        
        return compacted;
    }
    
    compactAttribute(attribute, oldIndices) {
        const itemSize = attribute.itemSize;
        const array = new attribute.array.constructor(oldIndices.length * itemSize);
        
        // Copy raw (possibly normalized or interleaved) values without conversion
        const source = attribute.isInterleavedBufferAttribute ? attribute.data.array : attribute.array;
        const stride = attribute.isInterleavedBufferAttribute ? attribute.data.stride : itemSize;
        const offset = attribute.isInterleavedBufferAttribute ? attribute.offset : 0;
        
        oldIndices.forEach((oldIndex, newIndex) => {
            for (let k = 0; k < itemSize; k++) {
                array[newIndex * itemSize + k] = source[oldIndex * stride + offset + k];
            }
        });
        
        return new THREE.BufferAttribute(array, itemSize, attribute.normalized);
    }
    
    processVertices() {
        this.allMeshes.forEach((mesh) => {
            this.meshVertices.set(mesh, this.getUniqueVertices(mesh.geometry));
        });
    }
    
    getUniqueVertices(geometry, precision = 6) {
        const pos = geometry.getAttribute('position');
        const seen = new Set();
        const unique = [];
        
        for (let i = 0; i < pos.count; i++) {
            const x = +pos.getX(i).toFixed(precision);
            const y = +pos.getY(i).toFixed(precision);
            const z = +pos.getZ(i).toFixed(precision);
            
            const key = `${x},${y},${z}`;
            if (!seen.has(key)) {
                seen.add(key);
                unique.push({ x, y, z, key });
            }
        }
        
        return unique;
    }
    
    getFilteredVertices(mesh) {
        return this.meshVertices.get(mesh) || [];
    }
    
    // Display name for a mesh. Multi-primitive glTF meshes become a Group (named
    // after the node) holding auto-named children like "mesh_0_1", so prefer the
    // original glTF node name of the mesh itself or of that group.
    getPartName(mesh) {
        if (mesh.userData.name) return mesh.userData.name;
        
        const parent = mesh.parent;
        if (parent && parent.isGroup && parent.userData.name && /^mesh_\d+(_\d+)?$/.test(mesh.name)) {
            return parent.userData.name;
        }
        
        return mesh.name;
    }
    
    enhanceMaterials(model) {
        model.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                
                if (child.material) {
                    // Clone the material to prevent shared material issues
                    child.material = child.material.clone();
                    child.material.needsUpdate = true;
                    
                    if (child.material.isMeshStandardMaterial || child.material.isMeshPhysicalMaterial) {
                        if (child.material.metalness === undefined) child.material.metalness = 0.1;
                        if (child.material.roughness === undefined) child.material.roughness = 0.7;
                        child.material.envMapIntensity = 0.8;
                    } else if (child.material.isMeshLambertMaterial || child.material.isMeshPhongMaterial) {
                        const color = child.material.color ? child.material.color.clone() : new THREE.Color(0xffffff);
                        const map = child.material.map;
                        
                        child.material = new THREE.MeshStandardMaterial({
                            color: color,
                            map: map,
                            metalness: 0.1,
                            roughness: 0.7,
                            envMapIntensity: 0.8
                        });
                    }
                }
            }
        });
    }
    
    extractBoxFromGeometry(filteredVertices, meshName, originalVertexCount, worldScale) {
        if (!filteredVertices || filteredVertices.length === 0) return null;
        
        let min = [Infinity, Infinity, Infinity];
        let max = [-Infinity, -Infinity, -Infinity];
        
        for (const vertex of filteredVertices) {
            min[0] = Math.min(min[0], vertex.x);
            min[1] = Math.min(min[1], vertex.y);
            min[2] = Math.min(min[2], vertex.z);
            
            max[0] = Math.max(max[0], vertex.x);
            max[1] = Math.max(max[1], vertex.y);
            max[2] = Math.max(max[2], vertex.z);
        }
        
        // Measure in the part's own orientation, but include node scaling
        // (e.g. a unit-conversion scale on a parent node)
        const scale = worldScale ? [Math.abs(worldScale.x), Math.abs(worldScale.y), Math.abs(worldScale.z)] : [1, 1, 1];
        const dims = [
            (max[0] - min[0]) * scale[0],
            (max[1] - min[1]) * scale[1],
            (max[2] - min[2]) * scale[2]
        ];
        
        const scaleFactor = 1000.0;
        
        return {
            name: meshName || 'Unnamed',
            dimensions_units: {
                x: dims[0].toFixed(3),
                y: dims[1].toFixed(3),
                z: dims[2].toFixed(3)
            },
            dimensions_mm: {
                x: (dims[0] * scaleFactor).toFixed(2),
                y: (dims[1] * scaleFactor).toFixed(2),
                z: (dims[2] * scaleFactor).toFixed(2)
            },
            vertexCount: originalVertexCount || filteredVertices.length,
            filteredVertexCount: filteredVertices.length,
            min,
            max
        };
    }
    
    getAllMeshes() {
        return this.allMeshes;
    }
}