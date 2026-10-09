// Format a length given in millimetres; cut lists don't need more than 0.1 mm
export function formatLength(mm) {
    return String(Math.round(mm * 10) / 10);
}

// "600 × 450 × 18 mm" from a { length, width, thickness } size in mm
export function formatSize(size) {
    return `${formatLength(size.length)} × ${formatLength(size.width)} × ${formatLength(size.thickness)} mm`;
}
