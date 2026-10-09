import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export class CameraManager {
    constructor(canvasWidth, canvasHeight, renderer) {
        this.camera = new THREE.PerspectiveCamera(75, canvasWidth / canvasHeight, 0.1, 1000);
        this.camera.position.set(2, 2, 2);
        
        this.setupControls(renderer);
    }
    
    setupControls(renderer) {
        this.controls = new OrbitControls(this.camera, renderer.domElement);
        
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
    
    // Half of the narrower field of view, so framing also works on portrait screens
    getHalfFov() {
        const vertical = THREE.MathUtils.degToRad(this.camera.fov) / 2;
        const horizontal = Math.atan(Math.tan(vertical) * this.camera.aspect);
        return Math.min(vertical, horizontal);
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
        const distance = radius / Math.sin(this.getHalfFov()) * 1.4;
        
        this.camera.near = distance / 100;
        this.camera.far = distance * 100;
        this.camera.updateProjectionMatrix();
        
        this.homeView = {
            target: sphere.center.clone(),
            position: sphere.center.clone().add(new THREE.Vector3(1, 1, 1).normalize().multiplyScalar(distance))
        };
        this.reset();
    }
    
    // Look at a box from the current direction, close enough to fill the view
    frameBox(box) {
        if (box.isEmpty()) return;
        
        const sphere = box.getBoundingSphere(new THREE.Sphere());
        const distance = Math.max(sphere.radius, 1e-3) / Math.sin(this.getHalfFov()) * 1.3;
        const direction = this.camera.position.clone().sub(this.controls.target).normalize();
        
        this.camera.near = Math.min(this.camera.near, distance / 100);
        this.camera.updateProjectionMatrix();
        this.controls.target.copy(sphere.center);
        this.camera.position.copy(sphere.center).addScaledVector(direction, distance);
        this.controls.update();
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