// src/core/wheel.js
// ─────────────────────────────────────────────────────────────────────────────
// Pure wheel geometry, animation and colour maths.
//
// Like core/storage.js, nothing here touches the DOM, a canvas or a global.
// Anything that needs to measure text receives a MEASURE FUNCTION as an
// argument, so the fitting logic is testable under Node without a 2D context.
// main.js is left holding only the drawing calls themselves.

/** Segment fill colours. Eight, so a wheel has to get large before one repeats. */
export const COLORS = [
    '#f6a8a3', // coral
    '#f7c489', // peach
    '#f2e39a', // butter
    '#bcdfa2', // green
    '#9ad6c8', // teal
    '#a9c9ee', // blue
    '#c4b6e7', // lavender
    '#efb2d4', // pink
];

/** Ink used for labels — dark enough to clear 4.5:1 on every colour above. */
export const LABEL_INK = '#22252b';

// ── Colour assignment ────────────────────────────────────────────────────────

/**
 * Choose a colour for every segment, guaranteeing NO TWO NEIGHBOURS MATCH —
 * including the wrap-around pair, where the last segment touches the first.
 *
 * The plain `i % palette.length` this replaces breaks exactly there: seven
 * segments over a six-colour palette gave slice 0 and slice 6 the same green,
 * and because they are adjacent on a wheel they read as one double-width wedge.
 *
 * @param {number} count
 * @param {string[]} palette
 * @returns {string[]} one colour per segment
 */
export function paletteFor(count, palette = COLORS) {
    if (!Number.isInteger(count) || count <= 0) return [];

    const size = palette.length;
    const picks = [];
    for (let i = 0; i < count; i++) picks.push(i % size);

    // Repair the seam. Only the closing pair can collide, and only when the
    // count is one past a whole number of laps around the palette.
    if (count > 1 && picks[count - 1] === picks[0]) {
        for (let shift = 1; shift < size; shift++) {
            const candidate = (picks[count - 1] + shift) % size;
            if (candidate !== picks[0] && candidate !== picks[count - 2]) {
                picks[count - 1] = candidate;
                break;
            }
        }
    }

    return picks.map((i) => palette[i]);
}

// ── Geometry ─────────────────────────────────────────────────────────────────

/** Angular width of one slice, in radians. */
export function segmentArc(count) {
    return count > 0 ? (Math.PI * 2) / count : 0;
}

/**
 * Widest a label may be at `radius` before it overflows its slice.
 *
 * This is the chord of the slice at that radius. The formula it replaces
 * (`segmentRadius * arc * radius / (Math.PI / 2)`) multiplied two radii
 * together and produced pixels-squared — values of 3,900 to 39,000 on a 400px
 * canvas — so the shrink-to-fit loop below it could never once execute.
 */
export function maxLabelWidth(radius, arc, padding = 0.86) {
    return 2 * radius * Math.sin(Math.min(arc, Math.PI) / 2) * padding;
}

/**
 * Largest font size at or below `max` whose rendered text fits `maxWidth`.
 * @param {(size: number) => number} measureAt returns text width at a font size
 */
export function fitFontSize(measureAt, maxWidth, { max = 16, min = 8 } = {}) {
    let size = max;
    while (size > min && measureAt(size) > maxWidth) size -= 1;
    return size;
}

/**
 * Should a label at this angle be rotated 180° to stay right-way-up?
 *
 * A label rotated to follow its own radius reads correctly on the right of the
 * wheel and upside-down on the left — which is why "Bibimbap", "Pho" and
 * "Curry" were previously mirrored. Flipping past vertical fixes it.
 */
export function shouldFlipLabel(midAngle) {
    return Math.cos(midAngle) < 0;
}

// ── Animation ────────────────────────────────────────────────────────────────

/** Ease-out cubic: fast off the mark, gently settling. */
export function easeOutCubic(progress) {
    const p = Math.min(Math.max(progress, 0), 1);
    return 1 - Math.pow(1 - p, 3);
}

/**
 * Angle at a point in the spin.
 *
 * `startDeg` is FROZEN by the caller for the whole animation. The bug this
 * replaces read the live rotation as its own interpolation base while also
 * reassigning it every frame, so the base moved under the tween and wrapped at
 * 360 — producing a visibly stuttering, briefly reversing wheel.
 */
export function rotationAt(startDeg, deltaDeg, progress) {
    return startDeg + easeOutCubic(progress) * deltaDeg;
}

/** How far to spin: at least `minTurns` full turns, plus a random landing. */
export function spinDelta(random, minTurns = 5) {
    return minTurns * 360 + random() * 360;
}

/**
 * Which segment sits under the pointer at 12 o'clock for a given rotation.
 * @returns {number} index, or -1 when there is nothing to select
 */
export function selectIndexAt(rotationDeg, count) {
    if (!Number.isFinite(rotationDeg)) return -1;
    if (!Number.isInteger(count) || count <= 0) return -1;

    const slice = 360 / count;
    const normalized = (((360 - (rotationDeg % 360)) % 360) + 360) % 360;
    return Math.min(Math.floor(normalized / slice), count - 1);
}
