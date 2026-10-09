import * as THREE from 'three';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { formatLengthWithUnit, getUnit } from './units.js';

const lineMaterial = new THREE.LineBasicMaterial({ color: 0xffd166, depthTest: false, transparent: true });
const arrowMaterial = new THREE.MeshBasicMaterial({ color: 0xffd166, depthTest: false, transparent: true });

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
        this.sides = null;
    }
    
    // Which side of the part faces the camera along each local axis: the dimensions
    // go on the edges nearest the viewer so they aren't hidden behind the part
    facingSides(entry) {
        const { min, max } = entry.box;
        entry.threeObject.updateWorldMatrix(true, false);
        const camera = this.camera.position.clone().applyMatrix4(entry.threeObject.matrixWorld.clone().invert());
        return [0, 1, 2].map(axis => (camera.getComponent(axis) >= (min[axis] + max[axis]) / 2 ? 1 : -1));
    }
    
    build(entry) {
        const { min, max, axes } = entry.box;
        const [l, w, t] = axes;
        this.sides = this.facingSides(entry);
        
        // Bounds on the near (+1) or far (-1) side of an axis, relative to the camera
        const near = (axis) => (this.sides[axis] > 0 ? max[axis] : min[axis]);
        const far = (axis) => (this.sides[axis] > 0 ? min[axis] : max[axis]);
        const extent = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
        const offset = extent * 0.08; // Distance of the dimension lines from the part
        const arrow = extent * 0.025; // Arrowhead length
        
        // Point in the part's local space from per-axis values
        const point = (values) => {
            const p = [0, 0, 0];
            p[l] = values.l;
            p[w] = values.w;
            p[t] = values.t;
            return new THREE.Vector3(...p);
        };
        const axisDirection = (axis, sign) => {
            const d = new THREE.Vector3();
            d.setComponent(axis, sign);
            return d;
        };
        
        this.group = new THREE.Group();
        this.group.matrixAutoUpdate = false;
        this.group.renderOrder = 999;
        
        const segments = [];
        
        // Arrowhead with its tip at a point, pointing along a direction
        const addArrow = (tip, direction) => {
            const cone = new THREE.Mesh(new THREE.ConeGeometry(arrow * 0.35, arrow, 12), arrowMaterial);
            cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
            cone.position.copy(tip).addScaledVector(direction, -arrow / 2);
            cone.renderOrder = 999;
            this.group.add(cone);
        };
        
        // A dimension line between two points on the part, drawn `out` away from it,
        // with extension lines from the part, arrows at both ends and a label
        const addDimension = ({ start, end, out, axisName, text, labelDistance = 0 }) => {
            const from = start.clone().addScaledVector(out, offset);
            const to = end.clone().addScaledVector(out, offset);
            const along = to.clone().sub(from);
            const length = along.length();
            along.normalize();
            
            // Extension lines: a small gap from the part, slightly past the dimension line
            [[start, from], [end, to]].forEach(([anchor, onLine]) => {
                segments.push(anchor.clone().addScaledVector(out, offset * 0.15), onLine.clone().addScaledVector(out, arrow * 0.8));
            });
            
            segments.push(from, to);
            if (length >= arrow * 2.5) {
                // Arrows inside, pointing out to the extension lines
                addArrow(from, along.clone().negate());
                addArrow(to, along);
            } else {
                // Too short (e.g. thickness): arrows outside, pointing in
                segments.push(from.clone().addScaledVector(along, -arrow * 2.5), from);
                segments.push(to, to.clone().addScaledVector(along, arrow * 2.5));
                addArrow(from, along);
                addArrow(to, along.clone().negate());
            }
            
            const div = document.createElement('div');
            div.className = 'dimension-label';
            const axisEl = document.createElement('span');
            axisEl.className = 'dimension-axis';
            axisEl.textContent = axisName;
            div.append(axisEl, ` ${text}`);
            
            const label = new CSS2DObject(div);
            label.position.copy(from).add(to).multiplyScalar(0.5).addScaledVector(out, labelDistance);
            this.group.add(label);
        };
        
        // Length along the near top edge, drawn outwards towards the viewer
        addDimension({
            start: point({ l: min[l], w: near(w), t: near(t) }),
            end: point({ l: max[l], w: near(w), t: near(t) }),
            out: axisDirection(w, this.sides[w]),
            axisName: 'L',
            text: formatLengthWithUnit(entry.size.length)
        });
        
        // Width along the near side edge
        addDimension({
            start: point({ l: near(l), w: min[w], t: near(t) }),
            end: point({ l: near(l), w: max[w], t: near(t) }),
            out: axisDirection(l, this.sides[l]),
            axisName: 'W',
            text: formatLengthWithUnit(entry.size.width)
        });
        
        // Thickness at the far end of the near long edge, label beside the short line
        addDimension({
            start: point({ l: far(l), w: near(w), t: min[t] }),
            end: point({ l: far(l), w: near(w), t: max[t] }),
            out: axisDirection(l, -this.sides[l]),
            axisName: 'T',
            text: formatLengthWithUnit(entry.size.thickness),
            labelDistance: offset * 1.2
        });
        
        const lines = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(segments), lineMaterial);
        lines.renderOrder = 999;
        this.group.add(lines);
        
        this.scene.add(this.group);
        this.entry = entry;
        this.label = this.labelKey(entry);
        this.update();
    }
    
    // Follow the part (e.g. while exploding) and the camera, and draw the labels
    update() {
        if (this.group) {
            const sides = this.facingSides(this.entry);
            if (sides.some((side, axis) => side !== this.sides[axis])) {
                const entry = this.entry;
                this.clear();
                this.build(entry);
                return;
            }

            this.entry.threeObject.updateWorldMatrix(true, false);
            this.group.matrix.copy(this.entry.threeObject.matrixWorld);
            this.group.matrixWorldNeedsUpdate = true;
        }
        this.labelRenderer.render(this.scene, this.camera);
    }
}
