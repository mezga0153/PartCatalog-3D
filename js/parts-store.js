import { modelKey, loadEdits, saveEdits } from './storage.js';

function sameUuids(a, b) {
    return a.length === b.length && a.every((uuid, i) => uuid === b[i]);
}

// State of the parts list: the parts and what is selected, hovered, hidden or
// included. Views subscribe to changes; PartHighlighter shows the state in 3D.
//
// Listeners get the kind of change: 'all', 'selection' (only the selection
// changed) or 'hover' (only the hovered parts changed), so they can skip work.
export const partsStore = {
    parts: [],
    selectedUuids: new Set(),
    hoveredUuids: [], // Parts whose bounding boxes are shown
    sceneHoverUuid: null, // Part under the pointer in the 3D view
    revealUuid: null, // Part the table should scroll to after the next update
    isolate: false, // Show the selection in its own materials and fade the rest
    
    listeners: [],
    
    subscribe(listener) {
        this.listeners.push(listener);
    },
    
    notify(change = 'all') {
        this.listeners.forEach(listener => listener(change));
        if (change === 'all') this.scheduleSave();
    },
    
    // Forget the current model's parts and view state
    reset() {
        this.modelKey = null;
        this.parts = [];
        this.uuidIndex = null;
        this.selectedUuids = new Set();
        this.hoveredUuids = [];
        this.sceneHoverUuid = null;
        this.isolate = false;
        this.notify();
    },
    
    // Add parts described by MeshManager.describePart, with a single update
    addParts(descriptions) {
        descriptions.forEach(description => this.parts.push(this.createPart(description)));
        this.uuidIndex = null;
        this.notify();
    },
    
    createPart({ part, boxInfo, materialName, allMaterials, edges, grain }) {
        return {
            uuid: part.object.uuid,
            name: boxInfo.name,
            originalName: boxInfo.name,
            quantity: 1, // How many to cut of this part; can be edited
            notes: '',
            size: boxInfo.size_mm,
            // Part-local bounds and which local axes are length, width and thickness
            box: { min: boxInfo.min, max: boxInfo.max, axes: boxInfo.axes },
            vertexCount: boxInfo.vertexCount,
            materialName,
            allMaterials,
            edges,
            grain,
            assembly: part.assembly,
            assemblyFromName: part.assemblyFromName,
            isHidden: false,
            isIncluded: true,
            threeObject: part.object,
            threeMeshes: part.meshes,
            // Multi-material parts are merged from several meshes and can be split back
            mergedCount: part.meshes.length,
            splitFromUuid: part.splitFrom ? part.splitFrom.object.uuid : null
        };
    },
    
    // Lookup by uuid, rebuilt whenever the list of parts changes
    uuidIndex: null,
    
    findPart(uuid) {
        if (!this.uuidIndex || this.uuidIndexOf !== this.parts || this.uuidIndex.size !== this.parts.length) {
            this.uuidIndex = new Map(this.parts.map(p => [p.uuid, p]));
            this.uuidIndexOf = this.parts;
        }
        return this.uuidIndex.get(uuid);
    },
    
    // Collaborators for splitting and merging parts
    meshManager: null,
    beforePartsChange: null,
    
    connect({ meshManager, beforePartsChange }) {
        this.meshManager = meshManager;
        this.beforePartsChange = beforePartsChange;
    },
    
    // Split a merged part into one part per mesh, or merge split pieces back
    toggleSplit(uuid) {
        const entry = this.findPart(uuid);
        const meshManager = this.meshManager;
        if (!entry || !meshManager) return;
        
        // The part list is about to change, so drop transient view state
        if (this.beforePartsChange) this.beforePartsChange();
        this.hoveredUuids = [];
        this.selectedUuids = new Set();
        
        if (entry.splitFromUuid) {
            const siblings = this.parts.filter(p => p.splitFromUuid === entry.splitFromUuid);
            
            const description = meshManager.describePart(meshManager.mergePart(entry.splitFromUuid));
            const index = this.parts.indexOf(siblings[0]);
            this.parts = this.parts.filter(p => !siblings.includes(p));
            if (description) {
                // The merged part is hidden only if all its pieces were, and included if any was
                this.parts.splice(index, 0, {
                    ...this.createPart(description),
                    isHidden: siblings.every(p => p.isHidden),
                    isIncluded: siblings.some(p => p.isIncluded),
                    name: siblings[0].name,
                    quantity: siblings[0].quantity,
                    notes: [...new Set(siblings.map(p => p.notes).filter(Boolean))].join('; ')
                });
            }
        } else {
            // Pieces inherit the part's state
            const pieces = meshManager.splitPart(uuid)
                .map(piece => meshManager.describePart(piece))
                .filter(Boolean)
                .map(description => ({
                    ...this.createPart(description),
                    isHidden: entry.isHidden,
                    isIncluded: entry.isIncluded,
                    name: entry.name,
                    quantity: entry.quantity,
                    notes: entry.notes
                }));
            if (pieces.length === 0) return;
            
            this.parts.splice(this.parts.indexOf(entry), 1, ...pieces);
        }
        this.uuidIndex = null;
        this.notify();
    },
    
    // Remember edits (names, quantities, notes, exclusions) for this model
    modelKey: null,
    saveTimer: null,
    
    restoreEdits(filename) {
        this.modelKey = modelKey(filename, this.parts);
        loadEdits(this.modelKey, this.parts);
        this.notify();
    },
    
    scheduleSave() {
        if (!this.modelKey) return;
        clearTimeout(this.saveTimer);
        this.saveTimer = setTimeout(() => saveEdits(this.modelKey, this.parts), 300);
    },
    
    isSelected(uuid) {
        return this.selectedUuids.has(uuid);
    },
    
    // Select a set of parts; selecting the current selection again clears it.
    // With reveal, the parts list scrolls to the selected part.
    select(uuids, { reveal = false } = {}) {
        this.revealUuid = reveal ? uuids[0] : null;
        const isSameSelection = uuids.length === this.selectedUuids.size && uuids.every(uuid => this.selectedUuids.has(uuid));
        this.selectedUuids = isSameSelection ? new Set() : new Set(uuids.filter(uuid => this.findPart(uuid)));
        this.notify('selection');
    },
    
    clearSelection() {
        if (this.selectedUuids.size === 0) return;
        this.selectedUuids = new Set();
        this.notify('selection');
    },
    
    setIsolate(isolate) {
        this.isolate = isolate;
        this.notify();
    },
    
    // Show bounding boxes for parts (e.g. while hovering their row)
    setHover(uuids) {
        if (sameUuids(this.hoveredUuids, uuids)) return;
        this.hoveredUuids = uuids.slice();
        this.notify('hover');
    },
    
    // Stop showing bounding boxes; with uuids, only if those are the ones shown
    clearHover(uuids) {
        if (this.hoveredUuids.length === 0) return;
        if (uuids && !sameUuids(this.hoveredUuids, uuids)) return;
        this.hoveredUuids = [];
        this.notify('hover');
    },
    
    setSceneHover(uuid) {
        if (this.sceneHoverUuid === uuid) return;
        this.sceneHoverUuid = uuid;
        this.hoveredUuids = uuid ? [uuid] : [];
        this.notify('hover');
    },
    
    setHidden(uuids, isHidden) {
        uuids.forEach(uuid => {
            const part = this.findPart(uuid);
            if (part) part.isHidden = isHidden;
        });
        this.notify();
    },
    
    toggleHidden(uuid) {
        const part = this.findPart(uuid);
        if (part) this.setHidden([uuid], !part.isHidden);
    },
    
    // Include or exclude parts from the cut list
    setIncluded(uuids, isIncluded) {
        uuids.forEach(uuid => {
            const part = this.findPart(uuid);
            if (part) part.isIncluded = isIncluded;
        });
        this.notify();
    },
    
    toggleIncluded(uuid) {
        const part = this.findPart(uuid);
        if (part) this.setIncluded([uuid], !part.isIncluded);
    },
    
    rename(uuids, name) {
        uuids.forEach(uuid => {
            const part = this.findPart(uuid);
            if (part) part.name = name || part.originalName;
        });
        this.notify();
    },
    
    setQuantity(uuid, quantity) {
        const part = this.findPart(uuid);
        if (!part) return;
        
        part.quantity = Math.max(0, Math.round(quantity));
        this.notify();
    },
    
    setNotes(uuids, notes) {
        uuids.forEach(uuid => {
            const part = this.findPart(uuid);
            if (part) part.notes = notes;
        });
        this.notify();
    }
};
