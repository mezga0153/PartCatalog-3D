class ToolbarManager {
    constructor(cameraManager, meshManager) {
        this.cameraManager = cameraManager;
        this.meshManager = meshManager;
        this.isExploded = false;
        this.isAnimating = false;
        this.originalPositions = new Map();
        this.activeTweens = [];
        
        this.createToolbar();
    }
    
    createToolbar() {
        this.toolbar = document.createElement('div');
        this.toolbar.style.cssText = `
            position: absolute;
            top: 10px;
            right: 10px;
            z-index: 1000;
            display: flex;
            gap: 5px;
            background: rgba(0, 0, 0, 0.7);
            padding: 8px;
            border-radius: 6px;
            backdrop-filter: blur(5px);
        `;
        
        this.createResetButton();
        this.createExplodeButton();
        
        this.toolbar.appendChild(this.resetCameraBtn);
        this.toolbar.appendChild(this.explodeBtn);
        document.body.appendChild(this.toolbar);
    }
    
    createResetButton() {
        this.resetCameraBtn = document.createElement('button');
        this.resetCameraBtn.className = 'btn btn-sm btn-outline-light';
        this.resetCameraBtn.innerHTML = '<i class="bi bi-house"></i>';
        this.resetCameraBtn.title = 'Reset Camera';
        this.resetCameraBtn.style.cssText = `
            border: 1px solid rgba(255, 255, 255, 0.3);
            color: white;
            background: rgba(255, 255, 255, 0.1);
            min-width: 32px;
            height: 32px;
            display: flex;
            align-items: center;
            justify-content: center;
        `;
        
        this.resetCameraBtn.onclick = () => this.cameraManager.reset();
        
        this.resetCameraBtn.addEventListener('mouseenter', () => {
            this.resetCameraBtn.style.background = 'rgba(255, 255, 255, 0.2)';
        });
        
        this.resetCameraBtn.addEventListener('mouseleave', () => {
            this.resetCameraBtn.style.background = 'rgba(255, 255, 255, 0.1)';
        });
    }
    
    createExplodeButton() {
        this.explodeBtn = document.createElement('button');
        this.explodeBtn.className = 'btn btn-sm btn-outline-light';
        this.explodeBtn.innerHTML = '<i class="bi bi-arrows-expand"></i>';
        this.explodeBtn.title = 'Explode/Implode Model';
        this.explodeBtn.style.cssText = `
            border: 1px solid rgba(255, 255, 255, 0.3);
            color: white;
            background: rgba(255, 255, 255, 0.1);
            min-width: 32px;
            height: 32px;
            display: flex;
            align-items: center;
            justify-content: center;
        `;
        
        this.explodeBtn.onclick = () => this.toggleExplode();
        
        this.explodeBtn.addEventListener('mouseenter', () => {
            if (!this.isExploded) {
                this.explodeBtn.style.background = 'rgba(255, 255, 255, 0.2)';
            }
        });
        
        this.explodeBtn.addEventListener('mouseleave', () => {
            if (!this.isExploded) {
                this.explodeBtn.style.background = 'rgba(255, 255, 255, 0.1)';
            }
        });
    }
    
    toggleExplode() {
        if (this.isAnimating) return;
        
        this.isExploded = !this.isExploded;
        this.isAnimating = true;
        
        this.activeTweens.forEach(tween => tween.stop());
        this.activeTweens.length = 0;
        
        this.explodeBtn.disabled = true;
        this.explodeBtn.style.opacity = '0.7';
        
        if (this.isExploded) {
            this.explodeMeshes();
        } else {
            this.implodeMeshes();
        }
    }
    
    explodeMeshes() {
        const allMeshes = this.meshManager.getAllMeshes();
        const meshesCenter = this.calculateMeshesCenter(allMeshes);
        
        let completedTweens = 0;
        const totalTweens = allMeshes.length;
        
        allMeshes.forEach((mesh, index) => {
            if (!this.originalPositions.has(mesh)) {
                this.originalPositions.set(mesh, mesh.position.clone());
            }
            
            const meshCenter = new THREE.Vector3();
            const box = new THREE.Box3().setFromObject(mesh);
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
            direction.multiplyScalar(5.0);
            
            const targetPos = this.originalPositions.get(mesh).clone().add(direction);
            
            const tween = new TWEEN.Tween(mesh.position)
                .to({ x: targetPos.x, y: targetPos.y, z: targetPos.z }, 800)
                .easing(TWEEN.Easing.Cubic.Out)
                .delay(index * 50)
                .onComplete(() => {
                    completedTweens++;
                    if (completedTweens === totalTweens) {
                        this.onExplodeComplete();
                    }
                })
                .start();
            
            this.activeTweens.push(tween);
        });
    }
    
    implodeMeshes() {
        const allMeshes = this.meshManager.getAllMeshes();
        let completedTweens = 0;
        const totalTweens = allMeshes.length;
        
        allMeshes.forEach((mesh, index) => {
            if (this.originalPositions.has(mesh)) {
                const originalPos = this.originalPositions.get(mesh);
                
                const tween = new TWEEN.Tween(mesh.position)
                    .to({ x: originalPos.x, y: originalPos.y, z: originalPos.z }, 600)
                    .easing(TWEEN.Easing.Cubic.InOut)
                    .delay(index * 30)
                    .onComplete(() => {
                        completedTweens++;
                        if (completedTweens === totalTweens) {
                            this.onImplodeComplete();
                        }
                    })
                    .start();
                
                this.activeTweens.push(tween);
            }
        });
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
        this.explodeBtn.style.background = 'rgba(255, 255, 255, 0.2)';
        this.explodeBtn.disabled = false;
        this.explodeBtn.style.opacity = '1';
        this.isAnimating = false;
    }
    
    onImplodeComplete() {
        this.explodeBtn.innerHTML = '<i class="bi bi-arrows-expand"></i>';
        this.explodeBtn.title = 'Explode Model';
        this.explodeBtn.style.background = 'rgba(255, 255, 255, 0.1)';
        this.explodeBtn.disabled = false;
        this.explodeBtn.style.opacity = '1';
        this.isAnimating = false;
    }
}