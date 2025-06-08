// Wait for Alpine.js to be ready before initializing
document.addEventListener('alpine:init', () => {
    console.log('Alpine.js is ready, initializing viewer...');
    initializeViewer();
});

function initializeViewer() {
    const scene = new THREE.Scene();
    // Set a gradient background that complements the environment lighting
    scene.background = new THREE.Color(0x202040); // Dark blue-gray background

    // Calculate canvas size - now full window width
    const canvasWidth = window.innerWidth;
    const canvasHeight = window.innerHeight;

    // Initialize core components
    const sceneManager = new SceneManager();
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(canvasWidth, canvasHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.physicallyCorrectLights = true;
    document.body.appendChild(renderer.domElement);

    // Setup environment map
    sceneManager.createEnvironmentMap(renderer);

    // Initialize camera and controls
    const cameraManager = new CameraManager(canvasWidth, canvasHeight, renderer);

    // Initialize mesh manager
    const meshManager = new MeshManager();

    // Initialize toolbar
    const toolbarManager = new ToolbarManager(cameraManager, meshManager);

    // Initialize interaction
    const interactionManager = new InteractionManager(renderer, cameraManager.camera, meshManager);

    // Initialize export manager
    window.exportManager = new ExportManager();

    // Function to process loaded model
    function processLoadedModel(gltf, filename) {
        // Clear any existing model
        sceneManager.scene.children = sceneManager.scene.children.filter(child => 
            child.type === 'DirectionalLight' || 
            child.type === 'AmbientLight' || 
            child.type === 'HemisphereLight' || 
            child.type === 'Mesh' || 
            child.type === 'GridHelper'
        );
        
        const model = gltf.scene;
        
        // Clear mesh manager
        meshManager.allMeshes = [];
        meshManager.boxes = [];
        meshManager.meshVertices.clear();
        meshManager.garbageVertexKeys.clear();
        
        // Clear UI store
        const meshStore = Alpine.store('meshStore');
        if (meshStore) {
            meshStore.meshes = [];
            meshStore.selectedMeshUuid = null;
            meshStore.hoveredMeshUuid = null;
            meshStore.boundingBoxes.clear();
        }
        
        // Process meshes
        meshManager.processModel(model);
        
        // Process each mesh for UI
        model.traverse((child) => {
            if (child.isMesh && child.geometry) {
                const filteredVertices = meshManager.getFilteredVertices(child);
                const originalVertexCount = child.geometry?.attributes?.position?.count;
                const boxInfo = meshManager.extractBoxFromGeometry(filteredVertices, child.name, originalVertexCount);
                
                if (boxInfo) {
                    const materialName = child.material ? (child.material.name || 'Unnamed Material') : 'No Material';
                    
                    if (meshStore) {
                        meshStore.addMesh({
                            mesh: child,
                            boxInfo: boxInfo,
                            materialName: materialName
                        });
                    }
                }
            }
        });
        
        sceneManager.scene.add(model);
        
        // Update title to show loaded file
        document.title = `GLB Box Viewer - ${filename}`;
        
        // Reset camera to fit model
        cameraManager.reset();
    }

    // Initialize file upload manager
    const fileUploadManager = new FileUploadManager(processLoadedModel);

    // Animation loop
    const animate = () => {
        requestAnimationFrame(animate);
        TWEEN.update();
        
        // Update popup position if visible
        interactionManager.updatePopup();
        
        renderer.render(sceneManager.scene, cameraManager.camera);
    };

    // Handle window resize
    const handleResize = () => {
        const newCanvasWidth = window.innerWidth;
        const newCanvasHeight = window.innerHeight;
        
        cameraManager.handleResize(newCanvasWidth, newCanvasHeight);
        renderer.setSize(newCanvasWidth, newCanvasHeight);
    };

    window.addEventListener('resize', handleResize);

    // Start animation
    animate();

    console.log('GLB Box Viewer initialized successfully!');
}
