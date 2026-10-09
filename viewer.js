import * as THREE from 'three';
import { meshStore } from './js/ui-store.js';
import { PartsTable } from './js/parts-table.js';
import { SummaryPanel } from './js/summary-panel.js';
import { setupSidebarTabs } from './js/sidebar.js';
import { SceneManager } from './js/scene.js';
import { CameraManager } from './js/camera.js';
import { MeshManager } from './js/mesh-manager.js';
import { ToolbarManager } from './js/toolbar.js';
import { InteractionManager } from './js/interaction.js';
import { FileUploadManager } from './js/file-upload-manager.js';
import { ExportManager } from './js/export-manager.js';
import { createGLTFLoader } from './js/loader.js';

initializeViewer();

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
        meshManager.boxes = [];
        meshManager.meshVertices.clear();
        
        // Clear UI store
        if (meshStore) {
            meshStore.modelKey = null;
            meshStore.meshes = [];
            meshStore.selectedUuids.clear();
            meshStore.isolate = false;
            meshStore.hideBoundingBoxes();
            meshStore.updateUI();
        }
        
        // Process meshes
        meshManager.processModel(model, gltf.parser && gltf.parser.associations);
        model.updateMatrixWorld(true);
        
        // Process each part for UI
        meshManager.getParts().forEach((part) => {
            const partData = meshManager.describePart(part);
            
            if (partData && meshStore) {
                meshStore.addMesh(partData);
            }
        });
        
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

    // Function to load demo model
    function loadDemoModel() {
        const loader = createGLTFLoader();
        const demoUrl = './demo.glb'; // Load from project root
        
        console.log('Loading demo model...');
        
        loader.load(
            demoUrl,
            (gltf) => {
                console.log('Demo model loaded successfully');
                processLoadedModel(gltf, 'demo.glb');
            },
            (progress) => {
                console.log('Demo loading progress:', progress);
            },
            (error) => {
                console.warn('Failed to load demo model:', error);
                console.log('Demo model not available, showing file upload dialog');
                // Show upload dialog if demo fails to load
                if (window.fileUploadManager) {
                    window.fileUploadManager.show();
                }
            }
        );
    }

    // Initialize file upload manager
    const fileUploadManager = new FileUploadManager(processLoadedModel);

    // Make file upload manager available globally for the toolbar
    window.fileUploadManager = fileUploadManager;

    // Show upload dialog on startup instead of auto-loading demo
    // Users can click "View Demo" if they want to see the demo model

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
