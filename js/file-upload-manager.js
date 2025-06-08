class FileUploadManager {
    constructor(onFileLoaded) {
        this.onFileLoaded = onFileLoaded;
        this.overlay = null;
        this.dialog = null;
        this.dropZone = null;
        this.fileInput = null;
        this.progressBar = null;
        this.errorMessage = null;
        
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
            <div class="file-upload-content">
                <h3 class="file-upload-title">Welcome to PartCatalog 3D</h3>
                <p class="file-upload-subtitle">Analyze 3D models and generate parts catalogs</p>
                
                <div class="demo-options">
                    <button class="btn btn-primary demo-btn" id="loadDemoBtn">
                        <i class="bi bi-play-circle"></i>
                        Try the Demo
                    </button>
                    <p class="demo-text">Load a sample model to see PartCatalog 3D in action</p>
                </div>
                
                <div class="divider">
                    <span>or</span>
                </div>
                
                <div class="file-drop-zone" id="dropZone">
                    <div class="file-drop-icon">
                        <i class="bi bi-cloud-upload"></i>
                    </div>
                    <div class="file-drop-text">Drop your GLB file here</div>
                    <div class="file-drop-subtext">or click to browse</div>
                    <input type="file" class="file-input" id="fileInput" accept=".glb,.gltf">
                </div>
                
                <button class="file-browse-btn" onclick="document.getElementById('fileInput').click()">
                    Choose File
                </button>
                
                <div class="file-upload-progress" id="progressContainer" style="display: none;">
                    <div class="progress-bar">
                        <div class="progress-fill" id="progressFill"></div>
                    </div>
                </div>
                
                <div class="error-message" id="errorMessage" style="display: none;"></div>
            </div>
        `;
        
        this.overlay.appendChild(this.dialog);
        document.body.appendChild(this.overlay);
        
        // Get references
        this.dropZone = document.getElementById('dropZone');
        this.fileInput = document.getElementById('fileInput');
        this.progressBar = document.getElementById('progressContainer');
        this.errorMessage = document.getElementById('errorMessage');
        
        // Add demo button handler
        const demoBtn = document.getElementById('loadDemoBtn');
        demoBtn.addEventListener('click', () => this.loadDemo());
    }
    
    setupEventListeners() {
        // Browse button
        this.browseBtn.addEventListener('click', () => {
            this.fileInput.click();
        });
        
        // Drop zone click
        this.dropZone.addEventListener('click', () => {
            this.fileInput.click();
        });
        
        // File input change
        this.fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.handleFile(e.target.files[0]);
            }
        });
        
        // Drop zone events
        this.dropZone.addEventListener('click', () => {
            this.fileInput.click();
        });
        
        this.dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.dropZone.classList.add('drag-over');
        });
        
        this.dropZone.addEventListener('dragleave', () => {
            this.dropZone.classList.remove('drag-over');
        });
        
        this.dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            this.dropZone.classList.remove('drag-over');
            
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                this.handleFile(files[0]);
            }
        });
    }
    
    async loadDemo() {
        try {
            this.showProgress();
            
            // Load the demo GLB file
            const response = await fetch('demo.glb');
            if (!response.ok) {
                throw new Error('Demo file not found');
            }
            
            const arrayBuffer = await response.arrayBuffer();
            const blob = new Blob([arrayBuffer], { type: 'model/gltf-binary' });
            
            // Create a fake file object for consistency
            const demoFile = new File([blob], 'demo.glb', { type: 'model/gltf-binary' });
            
            this.updateProgress(50);
            await this.loadFile(demoFile);
            this.updateProgress(100);
            
            setTimeout(() => {
                this.hide();
            }, 500);
            
        } catch (error) {
            console.error('Error loading demo:', error);
            this.showError('Failed to load demo file. Please try uploading your own GLB file.');
        }
    }
    
    handleFile(file) {
        this.hideError();
        
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
        
        this.showProgress();
        this.loadFile(file);
    }
    
    loadFile(file) {
        const reader = new FileReader();
        
        reader.onprogress = (event) => {
            if (event.lengthComputable) {
                const progress = (event.loaded / event.total) * 100;
                this.updateProgress(progress);
            }
        };
        
        reader.onload = (event) => {
            try {
                const arrayBuffer = event.target.result;
                const blob = new Blob([arrayBuffer]);
                const url = URL.createObjectURL(blob);
                
                // Load the model
                const loader = new THREE.GLTFLoader();
                loader.load(
                    url,
                    (gltf) => {
                        URL.revokeObjectURL(url);
                        this.onFileLoaded(gltf, file.name);
                        this.close();
                    },
                    (progress) => {
                        // Loading progress
                        const percentage = (progress.loaded / progress.total) * 100;
                        this.updateProgress(percentage);
                    },
                    (error) => {
                        URL.revokeObjectURL(url);
                        console.error('Error loading GLB file:', error);
                        this.showError('Failed to load GLB file. Please check the file format.');
                        this.hideProgress();
                    }
                );
            } catch (error) {
                console.error('Error reading file:', error);
                this.showError('Failed to read the file. Please try again.');
                this.hideProgress();
            }
        };
        
        reader.onerror = () => {
            this.showError('Failed to read the file. Please try again.');
            this.hideProgress();
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
        this.progressFill.style.width = `${Math.min(100, Math.max(0, percentage))}%`;
    }
    
    showError(message) {
        this.errorMessage.textContent = message;
        this.errorMessage.style.display = 'block';
    }
    
    hideError() {
        this.errorMessage.style.display = 'none';
    }
    
    close() {
        if (this.overlay && this.overlay.parentNode) {
            this.overlay.parentNode.removeChild(this.overlay);
        }
    }
    
    show() {
        if (this.overlay) {
            this.overlay.style.display = 'flex';
        }
    }
    
    hide() {
        if (this.overlay) {
            this.overlay.style.display = 'none';
        }
    }
}