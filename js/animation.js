export const Easing = {
    cubicOut: t => 1 - Math.pow(1 - t, 3),
    cubicInOut: t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
};

// Move a Vector3 (e.g. an object's position) to a target over time.
// Returns a handle whose stop() cancels the animation where it is.
export function animateVector(vector, target, { duration, delay = 0, easing = Easing.cubicOut, onComplete }) {
    let from = null;
    let startTime = null;
    let frame = null;
    
    const step = (now) => {
        if (startTime === null) startTime = now + delay;
        if (now >= startTime) {
            // Start from wherever the vector is once the delay is over
            if (!from) from = vector.clone();
            const t = Math.min(1, (now - startTime) / duration);
            vector.lerpVectors(from, target, easing(t));
            if (t === 1) {
                frame = null;
                if (onComplete) onComplete();
                return;
            }
        }
        frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    
    return {
        stop() {
            if (frame !== null) cancelAnimationFrame(frame);
            frame = null;
        }
    };
}
