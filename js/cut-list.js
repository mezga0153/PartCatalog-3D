import { formatLength } from './units.js';

// Parts that would be cut identically share a signature
export function partSignature(entry) {
    const { length, width, thickness } = entry.size;
    return [formatLength(length), formatLength(width), formatLength(thickness), entry.materialName].join('|');
}

// Group entries with the same signature, in order of first appearance
export function groupIdenticalParts(entries) {
    const groups = new Map();
    entries.forEach(entry => {
        const key = partSignature(entry);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(entry);
    });
    return [...groups.values()];
}
