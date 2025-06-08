class MeshManager {
    constructor() {
        this.allMeshes = [];
        this.boxes = [];
        this.meshVertices = new Map();
        this.garbageVertexKeys = new Set();
    }
    
    processModel(model) {
        this.collectMeshes(model);
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
    
    processVertices() {
        const allVertexKeys = new Map();
        
        this.allMeshes.forEach((mesh) => {
            const vertices = this.getUniqueVertices(mesh.geometry);
            this.meshVertices.set(mesh, vertices);
            
            vertices.forEach(vertex => {
                const count = allVertexKeys.get(vertex.key) || 0;
                allVertexKeys.set(vertex.key, count + 1);
            });
        });
        
        // Find garbage vertices that appear in ALL meshes
        const totalMeshCount = this.allMeshes.length;
        this.garbageVertexKeys = new Set();
        allVertexKeys.forEach((count, key) => {
            if (count === totalMeshCount) {
                this.garbageVertexKeys.add(key);
            }
        });
        
        console.log(`Found ${this.garbageVertexKeys.size} garbage vertices in ${totalMeshCount} meshes`);
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
        const allVertices = this.meshVertices.get(mesh);
        return allVertices ? allVertices.filter(vertex => !this.garbageVertexKeys.has(vertex.key)) : [];
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
    
    extractBoxFromGeometry(filteredVertices, meshName, originalVertexCount) {
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
        
        const dims = [
            max[0] - min[0],
            max[1] - min[1],
            max[2] - min[2]
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