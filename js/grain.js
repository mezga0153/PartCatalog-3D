const cache = new WeakMap();

// Which texture axis the wood grain runs along: 'u' (image horizontal), 'v'
// (image vertical) or null when the image has no clear direction. Grain lines
// make brightness change much more across the grain than along it.
export function textureGrainAxis(texture) {
    if (!texture || !texture.image) return null;
    if (cache.has(texture)) return cache.get(texture);
    
    let axis = null;
    try {
        const size = 128;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        context.drawImage(texture.image, 0, 0, size, size);
        const { data } = context.getImageData(0, 0, size, size);
        
        const luminance = (x, y) => {
            const i = (y * size + x) * 4;
            return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        };
        
        let acrossX = 0;
        let acrossY = 0;
        for (let y = 1; y < size - 1; y++) {
            for (let x = 1; x < size - 1; x++) {
                const gx = luminance(x + 1, y) - luminance(x - 1, y);
                const gy = luminance(x, y + 1) - luminance(x, y - 1);
                acrossX += gx * gx;
                acrossY += gy * gy;
            }
        }
        
        // Brightness varying along x means vertical grain lines, i.e. along v
        const ratio = 1.5;
        if (acrossX > acrossY * ratio) axis = 'v';
        else if (acrossY > acrossX * ratio) axis = 'u';
    } catch (error) {
        console.warn('Could not analyse texture for grain direction', error);
    }
    
    cache.set(texture, axis);
    return axis;
}
