import * as THREE from 'three';
import { meshStore } from './js/ui-store.js';
import { PartsTable } from './js/parts-table.js';
import { SummaryPanel } from './js/summary-panel.js';
import { setupSidebarTabs } from './js/sidebar.js';
import { DimensionOverlay } from './js/dimensions.js';
import { SceneManager } from './js/scene.js';
import { CameraManager } from './js/camera.js';
import { MeshManager } from './js/mesh-manager.js';
import { ToolbarManager } from './js/toolbar.js';
import { InteractionManager } from './js/interaction.js';
import { FileUploadManager } from './js/file-upload-manager.js';
import { ExportManager } from './js/export-manager.js';

initializeViewer();

function initializeViewer() {

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
    document.body.appendChild(renderer.domElement);

    // Setup environment map
    sceneManager.createEnvironmentMap(renderer);

    // Initialize camera and controls
    const cameraManager = new CameraManager(canvasWidth, canvasHeight, renderer);

    // Parts list and totals in the sidebar
    const sidebar = document.getElementById('sidebar');
    setupSidebarTabs(sidebar);
    new PartsTable(meshStore, document.getElementById('partsPane'), sidebar.querySelector('.parts-count'));
    const summaryPanel = new SummaryPanel(meshStore, document.getElementById('summaryPane'));
    
    // Initialize mesh manager
    const meshManager = new MeshManager();

    // Initialize toolbar
    const toolbarManager = new ToolbarManager(cameraManager, meshManager);
    
    // Used by the UI store to split/merge parts
    window.meshManager = meshManager;
    window.toolbarManager = toolbarManager;
    window.meshStore = meshStore; // handy for debugging in the console

    // Initialize interaction
    const interactionManager = new InteractionManager(renderer, cameraManager.camera, meshManager);

    // Dimension lines on the selected part
    const dimensionOverlay = new DimensionOverlay(sceneManager.scene, cameraManager.camera, document.body);
    meshStore.subscribe(() => dimensionOverlay.sync(meshStore));
    
    // Initialize export manager
    window.exportManager = new ExportManager(() => summaryPanel.sheet);

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
        meshManager.parts = [];
        meshManager.meshVertices.clear();
        
        // Clear UI store
        meshStore.reset();
        
        // Process meshes
        meshManager.processModel(model, gltf.parser && gltf.parser.associations);
        model.updateMatrixWorld(true);
        
        // Process each part for UI
        meshStore.addMeshes(meshManager.getParts().map(part => meshManager.describePart(part)).filter(Boolean));
        
        meshStore.restoreEdits(filename);
        
        sceneManager.scene.add(model);
        toolbarManager.resetExplodeState();
        window.exportManager.updateButtonState();
        
        // Update title to show loaded file
        document.title = `GLB Box Viewer - ${filename}`;
        
        // Reset camera to fit model
        cameraManager.fitToObject(model);
    }

    // Make processLoadedModel available globally for the toolbar
    window.processLoadedModel = processLoadedModel;

    // Initialize file upload manager
    const fileUploadManager = new FileUploadManager(processLoadedModel);

    // Make file upload manager available globally for the toolbar
    window.fileUploadManager = fileUploadManager;

    // The upload dialog opens on startup; its "View Demo" button loads demo.glb

    // Animation loop
    const animate = () => {
        requestAnimationFrame(animate);
        
        // Update popup position if visible
        interactionManager.updatePopup();
        
        renderer.render(sceneManager.scene, cameraManager.camera);
        dimensionOverlay.update();
    };

    // Handle window resize
    const handleResize = () => {
        const newCanvasWidth = window.innerWidth;
        const newCanvasHeight = window.innerHeight;
        
        cameraManager.handleResize(newCanvasWidth, newCanvasHeight);
        renderer.setSize(newCanvasWidth, newCanvasHeight);
        dimensionOverlay.setSize(newCanvasWidth, newCanvasHeight);
    };

    window.addEventListener('resize', handleResize);

    // Start animation
    animate();

    console.log('GLB Box Viewer initialized successfully!');
}
