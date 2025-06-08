class FileUploadManager {
    constructor(onFileLoaded) {
        this.onFileLoaded = onFileLoaded;
        this.overlay = null;
        this.dialog = null;
        this.dropZone = null;
        this.fileInput = null;
        this.progressBar = null;
        this.errorMessage = null;
        this.demoBtn = null;
        
        this.createUploadDialog();
        this.setupEventListeners();
    }
    
    createUploadDialog() {
        // Create overlay
        this.overlay = document.createElement('div');
        this.overlay.className = 'file-upload-overlay';
        
        // Create dialog
        this.dialog = document.createElement('div');
        this.dialog.className = 'file-upload-dialog';
        
        this.dialog.innerHTML = `
            <button type="button" class="file-upload-close" id="closeBtn">
                <i class="bi bi-x"></i>
            </button>
            <div class="file-upload-brand">PartCatalog 3D</div>
            <div class="file-upload-title">Load 3D Model</div>
            <div class="file-upload-subtitle">Select a GLB file to view and analyze</div>
            
            <div class="file-drop-zone" id="dropZone">
                <div class="file-drop-icon">
                    <i class="bi bi-cloud-upload"></i>
                </div>
                <div class="file-drop-text">Drop your GLB file here</div>
                <div class="file-drop-subtext">or click to browse</div>
            </div>
            
            <input type="file" id="fileInput" class="file-input" accept=".glb">
            
            <div class="file-upload-buttons">
                <button type="button" class="file-browse-btn" id="browseBtn">
                    <i class="bi bi-folder2-open"></i> Browse Files
                </button>
                <button type="button" class="file-demo-btn" id="demoBtn">
                    <i class="bi bi-play-circle"></i> View Demo
                </button>
            </div>
            
            <div class="file-upload-progress" id="uploadProgress">
                <div class="progress-bar">
                    <div class="progress-fill" id="progressFill"></div>
                </div>
            </div>
            
            <div class="error-message" id="errorMessage"></div>
        `;
        
        this.overlay.appendChild(this.dialog);
        document.body.appendChild(this.overlay);
        
        // Get references to elements
        this.dropZone = document.getElementById('dropZone');
        this.fileInput = document.getElementById('fileInput');
        this.browseBtn = document.getElementById('browseBtn');
        this.demoBtn = document.getElementById('demoBtn');
        this.closeBtn = document.getElementById('closeBtn');
        this.progressBar = document.getElementById('uploadProgress');
        this.progressFill = document.getElementById('progressFill');
        this.errorMessage = document.getElementById('errorMessage');
        
        // Show the dialog on startup instead of hiding it
        this.show();
    }
    
    setupEventListeners() {
        // Close button
        this.closeBtn.addEventListener('click', () => {
            this.close();
        });
        
        // Browse button
        this.browseBtn.addEventListener('click', () => {
            this.fileInput.click();
        });
        
        // Demo button
        this.demoBtn.addEventListener('click', () => {
            this.loadDemo();
        });
        
        // Drop zone click
        this.dropZone.addEventListener('click', () => {
            this.fileInput.click();
        });
        
        // File input change
        this.fileInput.addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (file) {
                this.handleFile(file);
            }
        });
        
        // Drag and drop events
        this.dropZone.addEventListener('dragover', (event) => {
            event.preventDefault();
            this.dropZone.classList.add('drag-over');
        });
        
        this.dropZone.addEventListener('dragleave', (event) => {
            event.preventDefault();
            this.dropZone.classList.remove('drag-over');
        });
        
        this.dropZone.addEventListener('drop', (event) => {
            event.preventDefault();
            this.dropZone.classList.remove('drag-over');
            
            const files = event.dataTransfer.files;
            if (files.length > 0) {
                this.handleFile(files[0]);
            }
        });
        
        // Prevent default drag behaviors on document
        document.addEventListener('dragover', (e) => e.preventDefault());
        document.addEventListener('drop', (e) => e.preventDefault());
    }
    
    loadDemo() {
        const loader = new THREE.GLTFLoader();
        const demoUrl = './demo.glb'; // Load from project root
        
        this.showProgress();
        this.hideError();
        
        loader.load(
            demoUrl,
            (gltf) => {
                this.hideProgress();
                this.onFileLoaded(gltf, 'demo.glb');
                this.close();
            },
            (progress) => {
                if (progress.lengthComputable) {
                    const percentage = (progress.loaded / progress.total) * 100;
                    this.updateProgress(percentage);
                }
            },
            (error) => {
                this.hideProgress();
                this.showError('Failed to load demo model. Please check that demo.glb exists in the project root.');
                console.error('Demo load error:', error);
            }
        );
    }
    
    handleFile(file) {
        // Validate file type
        if (!file.name.toLowerCase().endsWith('.glb')) {
            this.showError('Please select a valid GLB file.');
            return;
        }
        
        // Validate file size (max 100MB)
        const maxSize = 100 * 1024 * 1024; // 100MB
        if (file.size > maxSize) {
            this.showError('File is too large. Maximum size is 100MB.');
            return;
        }
        
        this.loadFile(file);
    }
    
    loadFile(file) {
        this.showProgress();
        this.hideError();
        
        const reader = new FileReader();
        
        reader.onload = (event) => {
            try {
                const arrayBuffer = event.target.result;
                const loader = new THREE.GLTFLoader();
                
                loader.parse(arrayBuffer, '', (gltf) => {
                    this.hideProgress();
                    this.onFileLoaded(gltf, file.name);
                    this.close();
                }, (error) => {
                    this.hideProgress();
                    this.showError('Failed to parse GLB file. Please check the file format.');
                    console.error('GLB parse error:', error);
                });
            } catch (error) {
                this.hideProgress();
                this.showError('Failed to read the file. Please try again.');
                console.error('File read error:', error);
            }
        };
        
        reader.onerror = () => {
            this.hideProgress();
            this.showError('Failed to read the file. Please try again.');
        };
        
        reader.readAsArrayBuffer(file);
    }
    
    showProgress() {
        this.progressBar.style.display = 'block';
        this.updateProgress(0);
    }
    
    hideProgress() {
        this.progressBar.style.display = 'none';
    }
    
    updateProgress(percentage) {
        this.progressFill.style.width = `${percentage}%`;
    }
    
    showError(message) {
        this.errorMessage.textContent = message;
        this.errorMessage.style.display = 'block';
    }
    
    hideError() {
        this.errorMessage.style.display = 'none';
    }
    
    close() {
        this.hide();
    }
    
    show() {
        this.overlay.style.display = 'flex';
    }
    
    hide() {
        this.overlay.style.display = 'none';
    }
}