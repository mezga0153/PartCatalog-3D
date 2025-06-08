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
    
    reset() {
        this.camera.position.set(2, 2, 2);
        this.camera.lookAt(0, 0, 0);
        this.controls.target.set(0, 0, 0);
        this.controls.update();
    }
    
    handleResize(canvasWidth, canvasHeight) {
        this.camera.aspect = canvasWidth / canvasHeight;
        this.camera.updateProjectionMatrix();
    }
}