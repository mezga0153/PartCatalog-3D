import * as THREE from 'three';
import { textureGrainAxis } from './grain.js';

// Measuring and classifying parts: size, board material, edge banding, grain
// direction and assembly. Parts are { object, meshes } as made by MeshManager.

// The mesh's own material name, even while the UI shows a highlight material
export function meshMaterialName(mesh) {
    const material = mesh.userData.originalMaterial || mesh.material;
    return material ? (material.name || 'Unnamed Material') : 'No Material';
}

// Size of a part from its vertices (in its own local space), in mm and ordered
// length, width, thickness; min/max are the local bounds and axes says which
// local axis is the length, width and thickness.
export function measurePart(filteredVertices, meshName, originalVertexCount, worldScale) {
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
    
    // Cut-list orientation: local axes ordered longest first (length, width, thickness)
    const axes = [0, 1, 2].sort((a, b) => dims[b] - dims[a]);
    
    return {
        name: meshName || 'Unnamed',
        size_mm: {
            length: dims[axes[0]] * scaleFactor,
            width: dims[axes[1]] * scaleFactor,
            thickness: dims[axes[2]] * scaleFactor
        },
        axes,
        vertexCount: originalVertexCount || filteredVertices.length,
        min,
        max
    };
}

// Find the board material and edge banding of a panel. Every triangle lying on
// one of the six faces of the part's box counts towards that face's material.
// The board material is what covers the two large faces; an edge whose
// material differs from it is banded. Banded edges are numbered canonically
// (L1 before L2, W1 before W2) since a panel's orientation is arbitrary.
export function analyzeEdges(part, boxInfo) {
    const { min, max, axes } = boxInfo;
    const extent = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
    const tolerance = extent * 1e-4 + 1e-9;
    const faceAreas = new Map(); // "axis:side" -> Map(material -> area)
    
    const corners = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    const ab = new THREE.Vector3();
    const ac = new THREE.Vector3();
    
    part.meshes.forEach((mesh) => {
        const material = meshMaterialName(mesh);
        const position = mesh.geometry.getAttribute('position');
        const index = mesh.geometry.getIndex();
        const triangleCount = (index ? index.count : position.count) / 3;
        const toPart = mesh === part.object ? null : mesh.matrix;
        
        for (let t = 0; t < triangleCount; t++) {
            corners.forEach((corner, k) => {
                const i = index ? index.getX(t * 3 + k) : t * 3 + k;
                corner.fromBufferAttribute(position, i);
                if (toPart) corner.applyMatrix4(toPart);
            });
            
            const area = ab.subVectors(corners[1], corners[0]).cross(ac.subVectors(corners[2], corners[0])).length() / 2;
            if (area === 0) continue;
            
            for (let axis = 0; axis < 3; axis++) {
                [min[axis], max[axis]].forEach((plane, side) => {
                    if (corners.every(corner => Math.abs(corner.getComponent(axis) - plane) < tolerance)) {
                        const key = `${axis}:${side}`;
                        if (!faceAreas.has(key)) faceAreas.set(key, new Map());
                        const areas = faceAreas.get(key);
                        areas.set(material, (areas.get(material) || 0) + area);
                    }
                });
            }
        }
    });
    
    const dominant = (...keys) => {
        const totals = new Map();
        keys.forEach(key => (faceAreas.get(key) || new Map()).forEach((area, material) => {
            totals.set(material, (totals.get(material) || 0) + area);
        }));
        let best = null;
        totals.forEach((area, material) => {
            if (!best || area > totals.get(best)) best = material;
        });
        return best;
    };
    
    const [lengthAxis, widthAxis, thicknessAxis] = axes;
    const boardMaterial = dominant(`${thicknessAxis}:0`, `${thicknessAxis}:1`);
    
    // Faces across the width axis run along the length, and vice versa
    const banding = (faceAxis) => [0, 1]
        .map(side => dominant(`${faceAxis}:${side}`))
        .filter(material => material && material !== boardMaterial);
    const lengthEdges = banding(widthAxis);
    const widthEdges = banding(lengthAxis);
    
    return {
        boardMaterial,
        edges: {
            L1: lengthEdges[0] || null,
            L2: lengthEdges[1] || null,
            W1: widthEdges[0] || null,
            W2: widthEdges[1] || null
        }
    };
}

// Grain direction of a textured board: 'L' (along the length), 'W' or null.
// Work out which way the texture's grain runs on the large faces, using the
// UV mapping to turn the texture axis into a direction on the panel.
export function analyzeGrain(part, boxInfo, boardMaterial) {
    const { min, max, axes } = boxInfo;
    const [lengthAxis, widthAxis, thicknessAxis] = axes;
    const extent = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
    const tolerance = extent * 1e-4 + 1e-9;
    
    let alongLength = 0;
    let alongWidth = 0;
    let grainAxis = null;
    
    const p = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    const uv = [new THREE.Vector2(), new THREE.Vector2(), new THREE.Vector2()];
    const dp1 = new THREE.Vector3();
    const dp2 = new THREE.Vector3();
    const direction = new THREE.Vector3();
    
    part.meshes.forEach((mesh) => {
        const material = mesh.userData.originalMaterial || mesh.material;
        const uvs = mesh.geometry.getAttribute('uv');
        if (!material || !material.map || !uvs || meshMaterialName(mesh) !== boardMaterial) return;
        
        const axis = textureGrainAxis(material.map);
        if (!axis) return;
        grainAxis = axis;
        
        const position = mesh.geometry.getAttribute('position');
        const index = mesh.geometry.getIndex();
        const triangleCount = (index ? index.count : position.count) / 3;
        const toPart = mesh === part.object ? null : mesh.matrix;
        
        for (let t = 0; t < triangleCount; t++) {
            for (let k = 0; k < 3; k++) {
                const i = index ? index.getX(t * 3 + k) : t * 3 + k;
                p[k].fromBufferAttribute(position, i);
                if (toPart) p[k].applyMatrix4(toPart);
                uv[k].fromBufferAttribute(uvs, i);
            }
            
            // Only the large faces show the grain
            const onLargeFace = [min[thicknessAxis], max[thicknessAxis]].some(plane =>
                p.every(corner => Math.abs(corner.getComponent(thicknessAxis) - plane) < tolerance));
            if (!onLargeFace) continue;
            
            // Direction in which the grain texture axis increases on this triangle
            dp1.subVectors(p[1], p[0]);
            dp2.subVectors(p[2], p[0]);
            const du1 = uv[1].x - uv[0].x, dv1 = uv[1].y - uv[0].y;
            const du2 = uv[2].x - uv[0].x, dv2 = uv[2].y - uv[0].y;
            const det = du1 * dv2 - du2 * dv1;
            if (Math.abs(det) < 1e-12) continue;
            
            if (axis === 'u') {
                direction.copy(dp1).multiplyScalar(dv2).addScaledVector(dp2, -dv1);
            } else {
                direction.copy(dp2).multiplyScalar(du1).addScaledVector(dp1, -du2);
            }
            if (direction.lengthSq() === 0) continue;
            direction.normalize();
            
            const area = dp1.clone().cross(dp2).length() / 2;
            alongLength += Math.abs(direction.getComponent(lengthAxis)) * area;
            alongWidth += Math.abs(direction.getComponent(widthAxis)) * area;
        }
    });
    
    if (!grainAxis || alongLength === alongWidth) return null;
    return alongLength > alongWidth ? 'L' : 'W';
}

// The assembly of a part (e.g. a cabinet) is its top-most named ancestor that
// doesn't contain every part. Without such a hierarchy, fall back to a name
// prefix like "k1" in "k1 - dol".
export function assignAssemblies(parts, model) {
    const partsUnder = new Map();
    const ancestorsOf = new Map();
    
    parts.forEach((part) => {
        const ancestors = [];
        for (let node = part.object.parent; node && node !== model.parent; node = node.parent) {
            ancestors.unshift(node);
            partsUnder.set(node, (partsUnder.get(node) || 0) + 1);
        }
        ancestorsOf.set(part, ancestors);
    });
    
    const prefixOf = (part) => {
        const match = (part.object.userData.name || part.object.name).match(/^(.+?)\s+[-–:]\s+/);
        return match ? match[1] : null;
    };
    
    // A name prefix only looks like an assembly if several parts share it
    const prefixCounts = new Map();
    parts.forEach((part) => {
        const prefix = prefixOf(part);
        if (prefix) prefixCounts.set(prefix, (prefixCounts.get(prefix) || 0) + 1);
    });
    
    parts.forEach((part) => {
        const assemblyNode = ancestorsOf.get(part).find(node =>
            (node.userData.name || node.name) && partsUnder.get(node) < parts.length);
        
        if (assemblyNode) {
            part.assembly = assemblyNode.userData.name || assemblyNode.name;
            part.assemblyFromName = false;
        } else {
            const prefix = prefixOf(part);
            part.assembly = prefix && prefixCounts.get(prefix) > 1 ? prefix : null;
            part.assemblyFromName = !!part.assembly;
        }
    });
}
