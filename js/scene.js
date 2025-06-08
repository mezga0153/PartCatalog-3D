class SceneManager {
    constructor() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x202040);
        
        this.setupLighting();
        this.setupEnvironment();
    }
    
    setupLighting() {
        // Ambient light
        const ambientLight = new THREE.AmbientLight(0x404040, 0.2);
        this.scene.add(ambientLight);
        
        // Main directional light
        const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
        directionalLight.position.set(10, 20, 10);
        directionalLight.castShadow = true;
        directionalLight.shadow.mapSize.width = 2048;
        directionalLight.shadow.mapSize.height = 2048;
        directionalLight.shadow.camera.near = 0.1;
        directionalLight.shadow.camera.far = 50;
        directionalLight.shadow.camera.left = -20;
        directionalLight.shadow.camera.right = 20;
        directionalLight.shadow.camera.top = 20;
        directionalLight.shadow.camera.bottom = -20;
        this.scene.add(directionalLight);
        
        // Hemisphere light
        const hemisphereLight = new THREE.HemisphereLight(0x87CEEB, 0x362d1a, 0.4);
        hemisphereLight.position.set(0, 20, 0);
        this.scene.add(hemisphereLight);
        
        // Fill light
        const fillLight = new THREE.DirectionalLight(0x8bb7f0, 0.3);
        fillLight.position.set(-5, 10, -5);
        this.scene.add(fillLight);
    }
    
    setupEnvironment() {
        // Ground plane
        const groundGeometry = new THREE.PlaneGeometry(50, 50);
        const groundMaterial = new THREE.MeshLambertMaterial({ 
            color: 0x333333,
            transparent: true,
            opacity: 0.8
        });
        const groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
        groundMesh.rotation.x = -Math.PI / 2;
        groundMesh.position.y = -2;
        groundMesh.receiveShadow = false;
        this.scene.add(groundMesh);
        
        // Grid helper
        const gridHelper = new THREE.GridHelper(50, 50, 0x666666, 0x444444);
        gridHelper.position.y = -1.99;
        this.scene.add(gridHelper);
        
        // Fog
        this.scene.fog = new THREE.Fog(0x000000, 20, 100);
    }
    
    createEnvironmentMap(renderer) {
        const pmremGenerator = new THREE.PMREMGenerator(renderer);
        pmremGenerator.compileEquirectangularShader();
        
        const size = 512;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext('2d');
        
        if (!context) {
            console.warn('Could not get 2D context for environment map');
            return;
        }
        
        // Create gradient sky
        const gradient = context.createLinearGradient(0, 0, 0, size);
        gradient.addColorStop(0, '#87CEEB');
        gradient.addColorStop(0.7, '#98D8E8');
        gradient.addColorStop(1, '#F0F8FF');
        
        context.fillStyle = gradient;
        context.fillRect(0, 0, size, size);
        
        // Add clouds
        context.fillStyle = 'rgba(255, 255, 255, 0.6)';
        for (let i = 0; i < 20; i++) {
            const x = Math.random() * size;
            const y = Math.random() * size * 0.6;
            const radius = Math.random() * 50 + 20;
            context.beginPath();
            context.arc(x, y, radius, 0, Math.PI * 2);
            context.fill();
        }
        
        const texture = new THREE.CanvasTexture(canvas);
        texture.mapping = THREE.EquirectangularReflectionMapping;
        
        const envMapRenderTarget = pmremGenerator.fromEquirectangular(texture);
        this.scene.environment = envMapRenderTarget.texture;
        texture.dispose();
    }
}