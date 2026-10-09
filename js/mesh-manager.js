import * as THREE from 'three';
import { meshMaterialName, measurePart, analyzeEdges, analyzeGrain, assignAssemblies } from './part-analysis.js';

export class MeshManager {
    constructor() {
        this.allMeshes = [];
        this.parts = [];
        this.partByMesh = new Map();
        this.meshVertices = new Map();
    }
    
    processModel(model, associations) {
        this.collectMeshes(model);
        this.collectParts(associations);
        assignAssemblies(this.parts, model);
        this.compactGeometries();
        this.processVertices();
        this.enhanceMaterials(model);
        
        return this.parts;
    }
    
    collectMeshes(model) {
        this.allMeshes = [];
        model.traverse((child) => {
            if (child.isMesh && child.geometry) {
                this.allMeshes.push(child);
            }
        });
    }
    
    // A part is one glTF node. A glTF mesh with several primitives (one per
    // material) is loaded as a Group of meshes, which together form one part.
    collectParts(associations) {
        this.parts = [];
        this.partByMesh = new Map();
        const partByObject = new Map();
        
        this.allMeshes.forEach((mesh) => {
            const object = this.isPrimitiveOfGroup(mesh, associations) ? mesh.parent : mesh;
            
            let part = partByObject.get(object);
            if (!part) {
                part = { object, meshes: [] };
                partByObject.set(object, part);
                this.parts.push(part);
            }
            part.meshes.push(mesh);
            this.partByMesh.set(mesh, part);
        });
    }
    
    isPrimitiveOfGroup(mesh, associations) {
        const parent = mesh.parent;
        if (!parent || !parent.isGroup) return false;
        
        if (associations) {
            const meshRef = associations.get(mesh);
            const groupRef = associations.get(parent);
            return !!meshRef && !!groupRef && meshRef.primitives !== undefined &&
                groupRef.primitives === undefined && groupRef.meshes === meshRef.meshes;
        }
        
        // Without loader associations, fall back to GLTFLoader's auto-generated names
        return /^mesh_\d+(_\d+)?$/.test(mesh.name);
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
    
    // Unique vertices of all meshes in a part, in the part object's local space
    getPartVertices(part) {
        const seen = new Set();
        const unique = [];
        const point = new THREE.Vector3();
        
        part.meshes.forEach((mesh) => {
            const toPart = mesh === part.object ? null : mesh.matrix;
            
            this.getFilteredVertices(mesh).forEach((vertex) => {
                let { x, y, z, key } = vertex;
                if (toPart) {
                    point.set(x, y, z).applyMatrix4(toPart);
                    ({ x, y, z } = point);
                    key = `${+x.toFixed(6)},${+y.toFixed(6)},${+z.toFixed(6)}`;
                }
                if (!seen.has(key)) {
                    seen.add(key);
                    unique.push({ x, y, z, key });
                }
            });
        });
        
        return unique;
    }
    
    getPartVertexCount(part) {
        return part.meshes.reduce((count, mesh) => count + mesh.geometry.getAttribute('position').count, 0);
    }
    
    getPartMaterialName(part) {
        const names = [...new Set(part.meshes.map(mesh => meshMaterialName(mesh)))];
        return names.join(', ');
    }
    
    // Bounding box of a part's own meshes (excluding any child nodes)
    getPartBox(part) {
        const box = new THREE.Box3();
        part.meshes.forEach(mesh => box.expandByObject(mesh));
        return box;
    }
    
    // Display name for a part: the original (unsanitised) glTF node name if present
    getPartName(part) {
        if (part.splitFrom) return this.getPartName(part.splitFrom);
        
        return part.object.userData.name || part.object.name;
    }
    
    // Box info and material name for the parts list, or null if the part has no vertices
    describePart(part) {
        const vertices = this.getPartVertices(part);
        const vertexCount = this.getPartVertexCount(part);
        const worldScale = part.object.getWorldScale(new THREE.Vector3());
        const boxInfo = measurePart(vertices, this.getPartName(part), vertexCount, worldScale);
        
        if (!boxInfo) return null;
        
        const { boardMaterial, edges } = analyzeEdges(part, boxInfo);
        return {
            part,
            boxInfo,
            materialName: boardMaterial || this.getPartMaterialName(part),
            allMaterials: this.getPartMaterialName(part),
            edges,
            grain: analyzeGrain(part, boxInfo, boardMaterial)
        };
    }
    
    // Replace a multi-mesh part with one part per mesh
    splitPart(uuid) {
        const index = this.parts.findIndex(p => p.object.uuid === uuid);
        const part = this.parts[index];
        if (!part || part.meshes.length < 2) return [];
        
        const pieces = part.meshes.map(mesh => ({
            object: mesh,
            meshes: [mesh],
            splitFrom: part,
            assembly: part.assembly,
            assemblyFromName: part.assemblyFromName
        }));
        this.parts.splice(index, 1, ...pieces);
        pieces.forEach(piece => this.partByMesh.set(piece.object, piece));
        
        return pieces;
    }
    
    // Undo splitPart: uuid is the object of the original merged part
    mergePart(uuid) {
        const pieces = this.parts.filter(p => p.splitFrom && p.splitFrom.object.uuid === uuid);
        if (pieces.length === 0) return null;
        
        const part = pieces[0].splitFrom;
        const index = this.parts.indexOf(pieces[0]);
        this.parts = this.parts.filter(p => !pieces.includes(p));
        this.parts.splice(index, 0, part);
        part.meshes.forEach(mesh => this.partByMesh.set(mesh, part));
        
        return part;
    }
    
    getPartForMesh(mesh) {
        return this.partByMesh.get(mesh);
    }
    
    getParts() {
        return this.parts;
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
    
    getAllMeshes() {
        return this.allMeshes;
    }
}