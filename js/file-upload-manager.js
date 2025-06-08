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
            <button type="button" class="file-browse-btn" id="browseBtn">
                <i class="bi bi-folder2-open"></i> Browse Files
            </button>
            
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
        this.progressBar = document.getElementById('uploadProgress');
        this.progressFill = document.getElementById('progressFill');
        this.errorMessage = document.getElementById('errorMessage');
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
        document.addEventListener('dragover', (event) => {
            event.preventDefault();
        });
        
        document.addEventListener('drop', (event) => {
            event.preventDefault();
        });
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