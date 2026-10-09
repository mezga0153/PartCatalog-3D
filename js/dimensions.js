import * as THREE from 'three';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { formatLengthWithUnit, getUnit } from './units.js';

const lineMaterial = new THREE.LineBasicMaterial({ color: 0xffd166, depthTest: false, transparent: true });

// Length, width and thickness dimension lines with labels on the selected part
export class DimensionOverlay {
    constructor(scene, camera, container) {
        this.scene = scene;
        this.camera = camera;
        this.entry = null;
        this.group = null;
        
        this.labelRenderer = new CSS2DRenderer();
        this.labelRenderer.setSize(window.innerWidth, window.innerHeight);
        this.labelRenderer.domElement.className = 'dimension-labels';
        container.appendChild(this.labelRenderer.domElement);
    }
    
    setSize(width, height) {
        this.labelRenderer.setSize(width, height);
    }
    
    // Show dimensions for the first selected part
    sync(store) {
        const uuid = store.selectedUuids.values().next().value;
        const entry = uuid ? store.findPart(uuid) : null;
        const visibleEntry = entry && !entry.isHidden && entry.box ? entry : null;
        
        if (visibleEntry === this.entry && this.label === this.labelKey(visibleEntry)) return;
        this.clear();
        if (visibleEntry) this.build(visibleEntry);
    }
    
    labelKey(entry) {
        return entry ? `${entry.size.length}|${entry.size.width}|${entry.size.thickness}|${getUnit()}` : null;
    }
    
    clear() {
        if (this.group) {
            this.group.traverse(child => {
                if (child.isCSS2DObject) child.element.remove();
                if (child.geometry) child.geometry.dispose();
            });
            this.scene.remove(this.group);
        }
        this.group = null;
        this.entry = null;
        this.label = null;
    }
    
    build(entry) {
        const { min, max, axes } = entry.box;
        const [l, w, t] = axes;
        const extent = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
        const offset = extent * 0.08;
        
        // Point in the part's local space from per-axis values
        const point = (values) => {
            const p = [0, 0, 0];
            p[l] = values.l;
            p[w] = values.w;
            p[t] = values.t;
            return new THREE.Vector3(...p);
        };
        
        this.group = new THREE.Group();
        this.group.matrixAutoUpdate = false;
        this.group.renderOrder = 999;
        
        const segments = [];
        const addDimension = (from, to, corners, text) => {
            segments.push(from, to);
            corners.forEach(([corner, end]) => segments.push(corner, end));
            
            const div = document.createElement('div');
            div.className = 'dimension-label';
            div.textContent = text;
            const label = new CSS2DObject(div);
            label.position.copy(from).add(to).multiplyScalar(0.5);
            this.group.add(label);
        };
        
        // Length along the back top edge
        const lFrom = point({ l: min[l], w: min[w] - offset, t: max[t] });
        const lTo = point({ l: max[l], w: min[w] - offset, t: max[t] });
        addDimension(lFrom, lTo, [
            [point({ l: min[l], w: min[w], t: max[t] }), lFrom],
            [point({ l: max[l], w: min[w], t: max[t] }), lTo]
        ], formatLengthWithUnit(entry.size.length));
        
        // Width along the right top edge
        const wFrom = point({ l: max[l] + offset, w: min[w], t: max[t] });
        const wTo = point({ l: max[l] + offset, w: max[w], t: max[t] });
        addDimension(wFrom, wTo, [
            [point({ l: max[l], w: min[w], t: max[t] }), wFrom],
            [point({ l: max[l], w: max[w], t: max[t] }), wTo]
        ], formatLengthWithUnit(entry.size.width));
        
        // Thickness at the back right corner
        const tFrom = point({ l: max[l] + offset, w: min[w] - offset, t: min[t] });
        const tTo = point({ l: max[l] + offset, w: min[w] - offset, t: max[t] });
        addDimension(tFrom, tTo, [
            [point({ l: max[l], w: min[w], t: min[t] }), tFrom]
        ], formatLengthWithUnit(entry.size.thickness));
        
        const lines = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(segments), lineMaterial);
        lines.renderOrder = 999;
        this.group.add(lines);
        
        this.scene.add(this.group);
        this.entry = entry;
        this.label = this.labelKey(entry);
        this.update();
    }
    
    // Follow the part (e.g. while exploding) and draw the labels
    update() {
        if (this.group) {
            this.entry.threeObject.updateWorldMatrix(true, false);
            this.group.matrix.copy(this.entry.threeObject.matrixWorld);
            this.group.matrixWorldNeedsUpdate = true;
        }
        this.labelRenderer.render(this.scene, this.camera);
    }
}
