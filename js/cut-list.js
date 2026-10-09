import { formatLength } from './units.js';

export const EDGE_NAMES = ['L1', 'L2', 'W1', 'W2'];

// Banded edges as [name, material, length in mm]
export function bandedEdges(entry) {
    return EDGE_NAMES
        .filter(name => entry.edges && entry.edges[name])
        .map(name => [name, entry.edges[name], name[0] === 'L' ? entry.size.length : entry.size.width]);
}

// Parts that would be cut and banded identically share a signature
export function partSignature(entry) {
    const { length, width, thickness } = entry.size;
    const edges = bandedEdges(entry).map(([name, material]) => `${name}=${material}`).join(',');
    return [formatLength(length), formatLength(width), formatLength(thickness), entry.materialName, edges].join('|');
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
