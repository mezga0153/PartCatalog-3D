// Display units for lengths. Sizes are always stored in millimetres.
const UNITS = {
    mm: { factor: 1, label: 'mm' },
    cm: { factor: 10, label: 'cm' },
    in: { factor: 25.4, label: 'in' }
};

let currentUnit = 'mm';

export function getUnit() {
    return currentUnit;
}

export function setUnit(unit) {
    if (UNITS[unit]) currentUnit = unit;
}

export function unitLabel() {
    return UNITS[currentUnit].label;
}

export function isImperial() {
    return currentUnit === 'in';
}

// Millimetres rounded to 0.1 mm; cut lists don't need more
export function roundMm(mm) {
    return Math.round(mm * 10) / 10;
}

// Unit-independent key for a size, e.g. for matching identical parts
export function sizeKey(size) {
    return `${roundMm(size.length)} × ${roundMm(size.width)} × ${roundMm(size.thickness)} mm`;
}

// A length in the current unit as a number (for spreadsheets)
export function toUnit(mm) {
    const value = mm / UNITS[currentUnit].factor;
    const precision = currentUnit === 'mm' ? 10 : (currentUnit === 'cm' ? 100 : 1000);
    return Math.round(value * precision) / precision;
}

export function fromUnit(value) {
    return value * UNITS[currentUnit].factor;
}

// Inches as a whole number and a fraction to the nearest 1/16, e.g. "23 5/8"
function formatInches(mm) {
    const sixteenths = Math.round(mm / 25.4 * 16);
    const whole = Math.floor(sixteenths / 16);
    let numerator = sixteenths % 16;
    let denominator = 16;
    while (numerator > 0 && numerator % 2 === 0) {
        numerator /= 2;
        denominator /= 2;
    }
    if (numerator === 0) return String(whole);
    return whole > 0 ? `${whole} ${numerator}/${denominator}` : `${numerator}/${denominator}`;
}

// Format a length given in millimetres in the current unit, without the unit
export function formatLength(mm) {
    if (currentUnit === 'in') return formatInches(mm);
    return String(toUnit(mm));
}

export function formatLengthWithUnit(mm) {
    return `${formatLength(mm)} ${unitLabel()}`;
}

// "600 × 450 × 18 mm" from a { length, width, thickness } size in mm
export function formatSize(size) {
    return `${formatLength(size.length)} × ${formatLength(size.width)} × ${formatLength(size.thickness)} ${unitLabel()}`;
}

// Areas in m² (ft² for inches), lengths of edge banding in m (ft for inches)
export function areaInUnit(m2) {
    return isImperial() ? m2 * 10.7639 : m2;
}

export function formatArea(m2) {
    return `${areaInUnit(m2).toFixed(2)} ${isImperial() ? 'ft²' : 'm²'}`;
}

export function runInUnit(m) {
    return isImperial() ? m * 3.28084 : m;
}

export function runLabel() {
    return isImperial() ? 'ft' : 'm';
}

export function areaLabel() {
    return isImperial() ? 'ft²' : 'm²';
}
