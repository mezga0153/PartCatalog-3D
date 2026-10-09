# PartCatalog 3D 📦🔧

🌐 **[Live Demo](https://mezga0153.github.io/PartCatalog-3D/)** - Try it now!

A Three.js-powered 3D model analyzer that transforms your GLB files into a comprehensive parts catalog. Perfect for makers, engineers, and builders who need to understand what components are required to build the actual object their 3D model represents! 🎯

## What Does This Thing Do? 🤔

Ever looked at a 3D model and wondered "What parts do I actually need to build this?" Wonder no more! PartCatalog 3D:

- 🔍 **Dissects your GLB models** into individual components with precise specifications
- 📏 **Calculates exact dimensions** for each part (because every millimeter counts!)
- 📊 **Counts vertex data** to understand model complexity
- 🎨 **Identifies materials** for each component
- 💥 **Explodes/implodes models** for better visualization of assembly
- 🖱️ **Interactive part selection** with detailed popup specifications
- 👁️ **Hide/show components** to focus on specific parts
- ✅ **Mark parts to keep** for your build list
- 📊 **Export to Excel** - Generate a complete parts list with dimensions
- 📁 **Drag & drop file loading** - No more manual file editing!
- 🎯 **Smart bounding boxes** - Visual feedback for part identification
- 🎪 **Smooth animations** - Professional TWEEN.js powered transitions

## Perfect For 🎯

- **Makers & DIY Enthusiasts** - Planning your next build project
- **Engineers** - Analyzing component specifications
- **3D Printing** - Understanding part dimensions and complexity
- **Manufacturing** - Creating bills of materials from 3D models
- **Education** - Teaching 3D modeling and engineering concepts
- **Prototyping** - Breaking down complex assemblies

## Project Structure 🏗️

```
📁 sketchup_export/
├── 📄 index.html           # Main HTML file with styles
├── 📄 viewer.js            # Main application orchestrator
├── 📄 parse.js             # Command-line GLB parser (Node.js)
├── 📄 package.json         # Dependencies for parse.js
├── 📁 js/
│   ├── 🎥 scene.js         # Scene setup, lighting, environment
│   ├── 📹 camera.js        # Camera controls and management
│   ├── 🔧 mesh-manager.js  # Mesh processing and part analysis
│   ├── 🖱️ interaction.js   # Mouse/click event handling
│   ├── 🛠️ toolbar.js       # Explode/reset button functionality
│   ├── 💾 ui-store.js      # UI state for the parts list
│   ├── 🎪 popup-manager.js # 3D-anchored popup system
│   ├── 📁 file-upload-manager.js # Drag & drop file handling
│   └── 📊 export-manager.js # Excel export functionality
├── 📁 css/
│   ├── 🎨 popup.css        # Popup styling
│   └── 📁 file-upload.css  # File upload dialog styling
└── 📄 README.md            # You are here! 👋
```

## Features in Detail 🚀

### 📦 **Part Analysis**
- Automatically detects individual components in your 3D model
- Calculates precise dimensions in millimeters
- Counts vertices to understand model complexity
- Identifies materials and surface properties

### 🎮 **Interactive Visualization**
- Click any part to see detailed specifications
- Explode view to see how parts fit together
- Hide/show individual components
- Smooth camera controls with orbit, pan, and zoom

### 📋 **Parts Management**
- Mark components you want to keep for your build
- Visual indicators for selected and kept parts
- Real-time parts counter in the sidebar

### 📊 **Export Capabilities**
- Generate Excel spreadsheets with complete parts lists
- Include dimensions, vertex counts, and material information
- Perfect for ordering materials or planning manufacturing

### 💡 **Smart UI**
- Drag and drop GLB files directly into the viewer
- Responsive design that works on desktop and mobile
- Professional-grade visual feedback and animations

## Getting Started 🚀

1. **Clone the repository**
   ```bash
   git clone [your-repo-url]
   cd sketchup_export
   ```

2. **Open in a web server**
   ```bash
   # Using Python
   python -m http.server 8000
   
   # Using Node.js
   npx serve .
   
   # Or use any local web server
   ```

3. **Load your GLB file**
   - Drag and drop a GLB file into the viewer
   - Or click the upload area to browse for files

4. **Analyze your parts**
   - Click components to see specifications
   - Use the explode button to see assembly
   - Mark parts you want to keep
   - Export your parts list to Excel

## Supported Formats 📁

- **GLB** - Primary format (Binary glTF)
- **GLTF** - Text-based glTF (with separate assets)

Perfect for models exported from:
- SketchUp
- Blender
- Fusion 360
- SolidWorks
- Rhino
- And more!

## Technology Stack ⚡

- **Three.js** - 3D rendering and model loading
- **Bootstrap** - UI components and styling
- **TWEEN.js** - Smooth animations
- **SheetJS** - Excel export functionality
- **Modern JavaScript** - ES6+ features throughout

## Browser Support 🌐

Works in all modern browsers that support WebGL

## License 📄

MIT License - Feel free to use this in your own projects!
