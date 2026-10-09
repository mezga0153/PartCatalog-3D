import * as THREE from 'three';
import { partsStore } from './parts-store.js';
import { animateVector, Easing } from './animation.js';

// Start parts one after another, but spread the starts over at most a second so
// large models don't take ages (1,020 parts at 50 ms each would be 51 s)
const MAX_STAGGER = 1000;

function staggerDelay(index, count, step) {
    return index * Math.min(step, MAX_STAGGER / Math.max(1, count - 1));
}

export class ToolbarManager {
    constructor(cameraManager, meshManager, { onOpenFile }) {
        this.cameraManager = cameraManager;
        this.meshManager = meshManager;
        this.onOpenFile = onOpenFile;
        this.isExploded = false;
        this.isAnimating = false;
        this.originalPositions = new Map();
        this.activeTweens = [];
        
        this.createToolbar();
    }
    
    createToolbar() {
        this.toolbar = document.createElement('div');
        this.toolbar.id = 'toolbar';
        
        this.openFileBtn = this.createButton('bi-folder2-open', 'Open GLB File', () => this.onOpenFile());
        this.resetCameraBtn = this.createButton('bi-house', 'Reset Camera', () => this.cameraManager.reset());
        this.explodeBtn = this.createButton('bi-arrows-expand', 'Explode Model', () => this.toggleExplode());
        this.isolateBtn = this.createButton('bi-bullseye', 'Isolate selection (fade other parts)', () => this.toggleIsolate());
        
        // Keep the isolate button state in sync, e.g. after loading another model
        partsStore.subscribe(() => this.isolateBtn.classList.toggle('active', partsStore.isolate));
        
        document.body.appendChild(this.toolbar);
    }
    
    createButton(icon, title, onClick) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn btn-sm toolbar-btn';
        button.innerHTML = `<i class="bi ${icon}"></i>`;
        button.title = title;
        button.onclick = onClick;
        this.toolbar.appendChild(button);
        return button;
    }
    
    toggleIsolate() {
        partsStore.setIsolate(!partsStore.isolate);
        
        // Zoom to the isolated parts
        if (partsStore.isolate && partsStore.selectedUuids.size > 0) {
            const box = new THREE.Box3();
            partsStore.selectedUuids.forEach(uuid => {
                const entry = partsStore.findPart(uuid);
                if (entry) entry.threeMeshes.forEach(mesh => box.expandByObject(mesh));
            });
            this.cameraManager.frameBox(box);
        }
    }
    
    toggleExplode() {
        if (this.isAnimating) return;
        
        this.isExploded = !this.isExploded;
        this.isAnimating = true;
        
        this.activeTweens.forEach(tween => tween.stop());
        this.activeTweens.length = 0;
        
        this.explodeBtn.disabled = true;
        
        if (this.isExploded) {
            this.explodeMeshes();
        } else {
            this.implodeMeshes();
        }
    }
    
    explodeMeshes() {
        const parts = this.meshManager.getParts();
        const allMeshes = parts.map(part => part.object);
        const meshesCenter = this.calculateMeshesCenter(allMeshes);
        const explodeDistance = this.calculateExplodeDistance(allMeshes);
        
        let completedTweens = 0;
        const totalTweens = allMeshes.length;
        
        allMeshes.forEach((mesh, index) => {
            if (!this.originalPositions.has(mesh)) {
                this.originalPositions.set(mesh, mesh.position.clone());
            }
            
            const meshCenter = new THREE.Vector3();
            const box = this.meshManager.getPartBox(parts[index]);
            box.getCenter(meshCenter);
            
            const direction = meshCenter.clone().sub(meshesCenter);
            
            if (direction.length() < 0.001) {
                direction.set(
                    (Math.random() - 0.5) * 2,
                    (Math.random() - 0.5) * 2,
                    (Math.random() - 0.5) * 2
                );
            }
            
            direction.normalize();
            direction.multiplyScalar(explodeDistance);
            
            const targetPos = this.originalPositions.get(mesh).clone().add(direction);
            
            const tween = animateVector(mesh.position, targetPos, {
                duration: 800,
                delay: staggerDelay(index, totalTweens, 50),
                easing: Easing.cubicOut,
                onComplete: () => {
                    completedTweens++;
                    if (completedTweens === totalTweens) {
                        this.onExplodeComplete();
                    }
                }
            });
            
            this.activeTweens.push(tween);
        });
    }
    
    implodeMeshes() {
        const allMeshes = this.meshManager.getParts().map(part => part.object);
        let completedTweens = 0;
        const totalTweens = allMeshes.length;
        
        allMeshes.forEach((mesh, index) => {
            if (this.originalPositions.has(mesh)) {
                const originalPos = this.originalPositions.get(mesh);
                
                const tween = animateVector(mesh.position, originalPos.clone(), {
                    duration: 600,
                    delay: staggerDelay(index, totalTweens, 30),
                    easing: Easing.cubicInOut,
                    onComplete: () => {
                        completedTweens++;
                        if (completedTweens === totalTweens) {
                            this.onImplodeComplete();
                        }
                    }
                });
                
                this.activeTweens.push(tween);
            }
        });
    }
    
    // Scale the explosion to the model so it works for both metre and millimetre models
    calculateExplodeDistance(meshes) {
        const box = new THREE.Box3();
        meshes.forEach(mesh => box.expandByObject(mesh));
        if (box.isEmpty()) return 1;
        
        return box.getBoundingSphere(new THREE.Sphere()).radius * 0.5;
    }
    
    // Snap exploded parts back without animating (e.g. before the part list changes)
    collapse() {
        this.activeTweens.forEach(tween => tween.stop());
        this.originalPositions.forEach((position, object) => object.position.copy(position));
        this.resetExplodeState();
    }
    
    // Forget positions/state from a previously loaded model
    resetExplodeState() {
        this.activeTweens.forEach(tween => tween.stop());
        this.activeTweens.length = 0;
        this.originalPositions.clear();
        this.isExploded = false;
        this.onImplodeComplete();
    }
    
    calculateMeshesCenter(meshes) {
        const center = new THREE.Vector3();
        let meshCount = 0;
        
        meshes.forEach(mesh => {
            const meshCenter = new THREE.Vector3();
            const box = new THREE.Box3().setFromObject(mesh);
            box.getCenter(meshCenter);
            center.add(meshCenter);
            meshCount++;
        });
        
        if (meshCount > 0) {
            center.divideScalar(meshCount);
        }
        
        return center;
    }
    
    onExplodeComplete() {
        this.explodeBtn.innerHTML = '<i class="bi bi-arrows-collapse"></i>';
        this.explodeBtn.title = 'Implode Model';
        this.explodeBtn.classList.add('active');
        this.explodeBtn.disabled = false;
        this.isAnimating = false;
    }
    
    onImplodeComplete() {
        this.explodeBtn.innerHTML = '<i class="bi bi-arrows-expand"></i>';
        this.explodeBtn.title = 'Explode Model';
        this.explodeBtn.classList.remove('active');
        this.explodeBtn.disabled = false;
        this.isAnimating = false;
    }
}