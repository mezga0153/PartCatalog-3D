import * as THREE from 'three';

// Shared materials for highlighted, faded and excluded parts
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
const boxMaterial = new THREE.LineBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.8 });

// Shows the parts store's state in the 3D view: materials for selected,
// excluded and isolated parts, hidden parts, and bounding boxes for hovered parts
export class PartHighlighter {
    constructor(store, scene) {
        this.store = store;
        this.scene = scene;
        this.boxes = [];
        this.boxUuids = [];
        
        store.subscribe(change => this.sync(change));
    }
    
    sync(change) {
        if (change !== 'hover') {
            this.store.parts.forEach(part => this.applyAppearance(part));
        }
        this.syncBoxes();
    }
    
    // Pick the material for a part from its state: isolated, selected, excluded or its own
    applyAppearance(part) {
        const store = this.store;
        const isSelected = store.isSelected(part.uuid);
        
        part.threeMeshes.forEach(mesh => {
            if (!mesh.userData.originalMaterial) {
                mesh.userData.originalMaterial = mesh.material;
            }
            mesh.visible = !part.isHidden;
            
            if (store.isolate && store.selectedUuids.size > 0) {
                mesh.material = isSelected ? mesh.userData.originalMaterial : fadedMaterial;
            } else if (isSelected) {
                mesh.material = selectedMaterial;
            } else if (!part.isIncluded) {
                mesh.material = excludedMaterial;
            } else {
                mesh.material = mesh.userData.originalMaterial;
            }
        });
    }
    
    // Bounding boxes for the hovered parts that are visible
    syncBoxes() {
        const uuids = this.store.hoveredUuids.filter(uuid => {
            const part = this.store.findPart(uuid);
            return part && !part.isHidden;
        });
        if (uuids.length === this.boxUuids.length && uuids.every((uuid, i) => uuid === this.boxUuids[i])) return;
        
        this.boxes.forEach(box => {
            this.scene.remove(box);
            box.geometry.dispose();
        });
        this.boxes = uuids.map(uuid => this.createBox(this.store.findPart(uuid)));
        this.boxes.forEach(box => this.scene.add(box));
        this.boxUuids = uuids;
    }
    
    createBox(part) {
        const box = new THREE.Box3();
        part.threeMeshes.forEach(mesh => box.expandByObject(mesh));
        
        const size = box.getSize(new THREE.Vector3());
        const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(size.x, size.y, size.z));
        const wireframe = new THREE.LineSegments(edges, boxMaterial);
        box.getCenter(wireframe.position);
        return wireframe;
    }
}
