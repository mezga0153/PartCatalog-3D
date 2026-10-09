class CameraManager {
    constructor(canvasWidth, canvasHeight, renderer) {
        this.camera = new THREE.PerspectiveCamera(75, canvasWidth / canvasHeight, 0.1, 1000);
        this.camera.position.set(2, 2, 2);
        
        this.setupControls(renderer);
    }
    
    setupControls(renderer) {
        this.controls = new THREE.OrbitControls(this.camera, renderer.domElement);
        
        // Mouse button configuration
        this.controls.mouseButtons = {
            LEFT: THREE.MOUSE.PAN,
            MIDDLE: THREE.MOUSE.ROTATE,
            RIGHT: THREE.MOUSE.DOLLY
        };
        
        // Touch controls
        this.controls.touches = {
            ONE: THREE.TOUCH.PAN,
            TWO: THREE.TOUCH.DOLLY_ROTATE
        };
    }
    
    // Frame the given object and remember the view for reset()
    fitToObject(object) {
        const box = new THREE.Box3().setFromObject(object);
        if (box.isEmpty()) {
            this.homeView = null;
            this.reset();
            return;
        }
        
        const sphere = box.getBoundingSphere(new THREE.Sphere());
        const radius = Math.max(sphere.radius, 1e-3);
        const distance = radius / Math.sin(THREE.MathUtils.degToRad(this.camera.fov) / 2) * 1.4;
        
        this.camera.near = distance / 100;
        this.camera.far = distance * 100;
        this.camera.updateProjectionMatrix();
        
        this.homeView = {
            target: sphere.center.clone(),
            position: sphere.center.clone().add(new THREE.Vector3(1, 1, 1).normalize().multiplyScalar(distance))
        };
        this.reset();
    }
    
    reset() {
        const target = this.homeView ? this.homeView.target : new THREE.Vector3(0, 0, 0);
        const position = this.homeView ? this.homeView.position : new THREE.Vector3(2, 2, 2);
        
        this.camera.position.copy(position);
        this.camera.lookAt(target);
        this.controls.target.copy(target);
        this.controls.update();
    }
    
    handleResize(canvasWidth, canvasHeight) {
        this.camera.aspect = canvasWidth / canvasHeight;
        this.camera.updateProjectionMatrix();
    }
}