# PartCatalog 3D 📦🔧

🌐 **[Live Demo](https://mezga0153.github.io/PartCatalog-3D/)** - Try it now!

A Three.js-powered 3D model analyzer that transforms your GLB files into a comprehensive parts catalog. Perfect for makers, engineers, and builders who need to understand what components are required to build the actual object their 3D model represents! 🎯

## What Does This Thing Do? 🤔

Ever looked at a 3D model and wondered "What parts do I actually need to build this?" Wonder no more! PartCatalog 3D turns a model of panel furniture into a **cut list** you can send to a board-cutting service:

- 🔍 **Dissects your GLB models** into individual parts, one per object (multi-material parts stay together, and can be split if you want)
- 📏 **Measures every part** as length × width × thickness, in mm, cm or inches
- 🔢 **Combines identical parts** into one line with a quantity
- 🎞️ **Detects edge banding** (L1/L2/W1/W2) and **grain direction** from the model's materials and textures
- 🗂️ **Groups parts** by material or by assembly (e.g. per cabinet)
- 🧮 **Totals for ordering** - board area, estimated sheets and banding length per material
- 📊 **Exports** to Excel, CSV or a printable PDF with a picture of each part
- ✏️ **Edit inline** - rename parts, change quantities and add notes; edits are remembered per model
- 💥 **Explode, isolate and measure** - explode the assembly, fade everything but the selection, see dimension lines on the selected part
- 📁 **Drag & drop** a GLB anywhere on the page, also on phones

## Perfect For 🎯

- **Makers & DIY Enthusiasts** - Planning your next build project
- **Engineers** - Analyzing component specifications
- **3D Printing** - Understanding part dimensions and complexity
- **Manufacturing** - Creating bills of materials from 3D models
- **Education** - Teaching 3D modeling and engineering concepts
- **Prototyping** - Breaking down complex assemblies

## Project Structure 🏗️

```
📁 PartCatalog-3D/
├── 📄 index.html                # Page layout, import map and CDN scripts
├── 📄 viewer.js                 # Main application orchestrator
├── 📄 demo.glb                  # Demo model (a small SketchUp cabinet)
├── 📁 js/
│   ├── 🎥 scene.js              # Scene setup, lighting, environment
│   ├── 📹 camera.js             # Camera controls and framing
│   ├── 📦 loader.js             # GLTF loader with Draco/meshopt support
│   ├── 🔧 mesh-manager.js       # Part detection, sizes, edge banding and grain analysis
│   ├── 🪵 grain.js              # Grain direction from texture images
│   ├── 💾 ui-store.js           # Parts list state, selection and 3D appearance
│   ├── 📋 parts-table.js        # Sortable, groupable parts table with inline editing
│   ├── 🧮 summary-panel.js      # Board, sheet and banding totals
│   ├── ✂️ cut-list.js           # Identical-part grouping, cut-list rows and totals
│   ├── 📏 units.js              # mm / cm / inch formatting
│   ├── 📐 dimensions.js         # Dimension lines on the selected part
│   ├── 🖱️ interaction.js        # Hover and click picking in 3D
│   ├── 🛠️ toolbar.js            # Open, reset, explode and isolate buttons
│   ├── 🎪 popup-manager.js      # 3D-anchored popup system
│   ├── 📁 file-upload-manager.js # File dialog and drag & drop
│   ├── 📊 export-manager.js     # Excel and CSV export
│   ├── 🖨️ print.js              # Printable cut list (save as PDF)
│   ├── 💽 storage.js            # Remembered edits and settings (browser storage)
│   ├── 🗂️ sidebar.js            # Sidebar tabs and mobile bottom sheet
│   └── 🛡️ html.js               # HTML escaping helper
├── 📁 css/
│   ├── 📋 parts-panel.css       # Sidebar, table and summary styling
│   ├── 🎨 popup.css             # Popup styling
│   └── 📁 file-upload.css       # File upload dialog styling
└── 📄 README.md                 # You are here! 👋
```

## Features in Detail 🚀

### 📦 **Part Analysis**
- One part per object in the model; parts made of several materials are merged into one, with a note and a **Split** button to list each material separately
- Sizes are measured in each part's own orientation, ordered length × width × thickness, and include any scaling on the model's nodes
- Works with exporters that share one vertex buffer between all parts (like SketchUp's), which used to make every part look as big as the whole model
- The **board material** is the one on the two large faces; an edge face in a different material counts as **edge banding**
- **Grain direction** is read from the board texture and its mapping on the part

### 📋 **Cut List**
- Compact table: sort by any column, search by name, material or assembly
- Identical parts (same size, material, banding and grain) are combined with a quantity
- Group by material or by assembly - taken from the model's hierarchy, or from a shared name prefix like `k1` in `k1 - dol`
- Tick which parts go in the cut list; excluded parts are ghosted in 3D
- Double-click a name or quantity to edit it, and add notes - all remembered for the next time you open the same model

### 🧮 **Summary**
- Board area and part count per material and thickness
- Estimated full sheets for a configurable sheet size and waste percentage
- Banded edges and banding length per material

### 📊 **Export**
- **Excel** with a cut-list sheet (quantity, L/W/T, material, banding per edge, grain, assembly, notes) and a summary sheet
- **CSV** (UTF-8) for importing into cutting-service tools
- **Print / PDF** with a picture of each part and a diagram of its banded edges and grain

### 🎮 **Interactive Visualization**
- Hover or click a part in 3D to highlight it in the list; hover a row to see the part's bounding box
- Dimension lines on the selected part
- Isolate the selection to fade everything else
- Explode view to see how parts fit together
- Orbit, pan and zoom; the camera frames each model when it loads

### 💡 **Smart UI**
- Drag and drop a GLB anywhere on the page
- mm, cm or inches (as 1/16" fractions)
- On phones the sidebar becomes a bottom sheet you can fold away

## Getting Started 🚀

1. **Clone the repository**
   ```bash
   git clone [your-repo-url]
   cd PartCatalog-3D
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
   - Drag and drop a GLB file anywhere on the page
   - Or click the upload area to browse for files, or try the demo

4. **Build your cut list**
   - Check sizes, banding and grain in the parts table
   - Untick parts you don't need, adjust names, quantities and notes
   - Check the totals in the Summary tab
   - Export to Excel or CSV, or print it

## Supported Formats 📁

- **GLB** (binary glTF), including Draco- and meshopt-compressed files

Perfect for models exported from:
- SketchUp
- Blender
- Fusion 360
- SolidWorks
- Rhino
- And more!

## Technology Stack ⚡

- **Three.js** (r170, ES modules) - 3D rendering and model loading
- **Bootstrap** - UI components and styling
- **TWEEN.js** - Smooth animations
- **SheetJS** - Excel export functionality
- **Modern JavaScript** - ES modules, no build step

## Browser Support 🌐

Works in all modern browsers that support WebGL and import maps

## License 📄

MIT License - Feel free to use this in your own projects!
