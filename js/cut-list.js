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
    return [formatLength(length), formatLength(width), formatLength(thickness), entry.materialName, edges, entry.grain || ''].join('|');
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

export const GRAIN_LABELS = {
    L: 'Along length',
    W: 'Along width'
};

// Totals for ordering. Board area and sheets per material and thickness; banding
// length per material. Waste is a percentage added before rounding up sheets.
export function summarize(entries, sheet) {
    const boards = new Map();
    const banding = new Map();
    
    entries.forEach(entry => {
        const thickness = Math.round(entry.size.thickness * 10) / 10;
        const key = `${entry.materialName}|${thickness}`;
        if (!boards.has(key)) boards.set(key, { material: entry.materialName, thickness, count: 0, area: 0 });
        const board = boards.get(key);
        board.count++;
        board.area += entry.size.length * entry.size.width / 1e6;
        
        bandedEdges(entry).forEach(([, material, length]) => {
            if (!banding.has(material)) banding.set(material, { material, count: 0, length: 0 });
            const band = banding.get(material);
            band.count++;
            band.length += length / 1000;
        });
    });
    
    const sheetArea = sheet.length * sheet.width / 1e6;
    const withWaste = value => value * (1 + sheet.waste / 100);
    
    return {
        boards: [...boards.values()]
            .sort((a, b) => a.material.localeCompare(b.material) || a.thickness - b.thickness)
            .map(board => ({ ...board, sheets: sheetArea > 0 ? Math.ceil(withWaste(board.area) / sheetArea) : 0 })),
        banding: [...banding.values()]
            .sort((a, b) => a.material.localeCompare(b.material))
            .map(band => ({ ...band, toOrder: withWaste(band.length) }))
    };
}

// One row per group of identical parts, in the column layout cutting services
// commonly import: dimensions in mm, quantity, board, banding per edge, grain.
export function cutListRows(entries) {
    const round = value => Math.round(value * 10) / 10;
    
    return groupIdenticalParts(entries).map((group, index) => {
        const entry = group[0];
        const notes = [...new Set(group.map(m => m.notes).filter(Boolean))];
        
        return {
            'No.': index + 1,
            'Part': [...new Set(group.map(m => m.name))].join(', '),
            'Qty': group.length,
            'Length (mm)': round(entry.size.length),
            'Width (mm)': round(entry.size.width),
            'Thickness (mm)': round(entry.size.thickness),
            'Material': entry.materialName,
            'Edge L1': entry.edges?.L1 || '',
            'Edge L2': entry.edges?.L2 || '',
            'Edge W1': entry.edges?.W1 || '',
            'Edge W2': entry.edges?.W2 || '',
            'Grain': entry.grain ? GRAIN_LABELS[entry.grain] : '',
            'Assembly': [...new Set(group.map(m => m.assembly).filter(Boolean))].join(', '),
            'Notes': notes.join('; ')
        };
    });
}
