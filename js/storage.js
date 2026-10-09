import { formatSize } from './units.js';

// Browser storage for per-viewer conveniences; everything still works without it
const PREFIX = 'partcatalog:';

export function readSetting(key, fallback) {
    try {
        const value = localStorage.getItem(PREFIX + key);
        return value ? { ...fallback, ...JSON.parse(value) } : fallback;
    } catch {
        return fallback;
    }
}

export function writeSetting(key, value) {
    try {
        localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch {
        // Storage may be full or blocked; edits just won't be remembered
    }
}

function hash(text) {
    let h = 5381;
    for (let i = 0; i < text.length; i++) {
        h = ((h << 5) + h + text.charCodeAt(i)) | 0;
    }
    return (h >>> 0).toString(36);
}

// Identify a model by its file name and the parts it contains
export function modelKey(filename, entries) {
    const fingerprint = entries.map(m => `${m.originalName}|${formatSize(m.size)}`).sort().join(';');
    return `model:${filename}:${hash(fingerprint)}`;
}

// Stable keys for parts: name, size and material, numbered when repeated
function partKeys(entries) {
    const seen = new Map();
    return entries.map(m => {
        const base = `${m.originalName}|${formatSize(m.size)}|${m.materialName}`;
        const n = (seen.get(base) || 0) + 1;
        seen.set(base, n);
        return `${base}#${n}`;
    });
}

export function loadEdits(key, entries) {
    let saved;
    try {
        saved = JSON.parse(localStorage.getItem(PREFIX + key) || '{}');
    } catch {
        return;
    }
    
    partKeys(entries).forEach((partKey, i) => {
        const edit = saved[partKey];
        if (!edit) return;
        const entry = entries[i];
        if (edit.name) entry.name = edit.name;
        if (edit.quantity !== undefined) entry.quantity = edit.quantity;
        if (edit.notes) entry.notes = edit.notes;
        if (edit.excluded) entry.isIncluded = false;
    });
}

export function saveEdits(key, entries) {
    const edits = {};
    partKeys(entries).forEach((partKey, i) => {
        const entry = entries[i];
        const edit = {};
        if (entry.name !== entry.originalName) edit.name = entry.name;
        if (entry.quantity !== 1) edit.quantity = entry.quantity;
        if (entry.notes) edit.notes = entry.notes;
        if (!entry.isIncluded) edit.excluded = true;
        if (Object.keys(edit).length) edits[partKey] = edit;
    });
    
    try {
        if (Object.keys(edits).length) {
            localStorage.setItem(PREFIX + key, JSON.stringify(edits));
        } else {
            localStorage.removeItem(PREFIX + key);
        }
    } catch {
        // Storage may be full or blocked; edits just won't be remembered
    }
}
