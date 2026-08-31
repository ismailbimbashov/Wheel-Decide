// src/core/storage.js
// ─────────────────────────────────────────────────────────────────────────────
// The DATA LAYER for Wheel Decider: hydration, validation, mutation and
// bounds-checking. Everything here is pure and environment-free.
//
// DEPENDENCY INJECTION IS THE WHOLE POINT OF THIS FILE.
// Not one function reads `window`, `document` or `localStorage`. Anything that
// needs persistence receives a `storage` argument — any object exposing
// getItem / setItem / removeItem. In the browser that is `window.localStorage`;
// in the test suite it is a plain object over a Map. That single choice is what
// makes this module runnable under `node --test` with no DOM, no jsdom and no
// dependencies at all.
//
// The drawing routines and the textContent write deliberately stay in
// main.js: they are DOM-bound by nature and are not this module's business.

/** Key the wheel is persisted under. */
export const STORAGE_KEY = 'wheelSegments';

/**
 * Maximum label length. Mirrors the `maxlength` on #segmentText, and is
 * enforced here as well because that attribute only constrains typing — it
 * says nothing about a value already sitting in storage.
 */
export const MAX_LABEL_LENGTH = 40;

/**
 * What the wheel falls back to when storage is absent, unreadable or invalid.
 * This is the app's existing first-run state: an empty wheel the user fills in.
 */
export const DEFAULT_SEGMENTS = [];

/** Segment fill colours, cycled by position. */
export const COLORS = [
    'lightgreen',
    'lightcoral',
    'lightblue',
    'lightgoldenrodyellow',
    'lightpink',
    'lightgray',
];

// ── Validation ───────────────────────────────────────────────────────────────

/**
 * Normalise ONE stored record into the shape the drawing code requires, or
 * return null when it cannot be salvaged.
 *
 * This is what makes `.text` access safe downstream: every value that survives
 * is proven to be an object carrying a non-empty string `text` and a string
 * `color`.
 *
 * @param {unknown} raw    an element straight out of the parsed array
 * @param {number}  index  its position, used to pick a replacement colour
 * @param {string[]} colors palette to draw the replacement from
 * @returns {{text: string, color: string}|null}
 */
export function sanitizeSegment(raw, index, colors = COLORS) {
    // Rejects null, undefined, numbers, strings, booleans and arrays — every
    // value whose `.text` access would throw or yield something unusable.
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
    if (typeof raw.text !== 'string') return null;

    const text = raw.text.trim().slice(0, MAX_LABEL_LENGTH);
    if (text === '') return null;

    // A missing or malformed colour is REPAIRED rather than rejected: the label
    // is the user's data and worth keeping, the colour is only presentation.
    const color = typeof raw.color === 'string' && raw.color.trim() !== ''
        ? raw.color
        : colors[index % colors.length];

    return { text, color };
}

// ── Bounds checking ──────────────────────────────────────────────────────────

/**
 * Is `index` addressable in an array of `length` items?
 *
 * THE OFF-BY-ONE THIS REPLACES: the original guard was `index < 1`, applied to
 * a value used directly as a zero-based subscript — so segment 0 could never be
 * edited or deleted, and with a single segment stored every input was rejected.
 * A zero-based array admits 0, so the lower bound is 0.
 *
 * @param {unknown} index
 * @param {number}  length
 * @returns {boolean}
 */
export function isValidIndex(index, length) {
    return Number.isInteger(index) && index >= 0 && index < length;
}

/**
 * Turn what the user typed into a usable array index.
 *
 * The UI counts from 1 because that is how a wheel reads to a person; arrays
 * count from 0. Converting in exactly ONE place is what keeps the bounds check
 * honest — the original did the check twice, in two functions, against a value
 * it then used as a raw subscript.
 *
 * @param {string|null} rawInput what the prompt returned
 * @param {number}      length   current segment count
 * @returns {number} a valid zero-based index, or -1 to abort
 */
export function resolveSegmentIndex(rawInput, length) {
    if (rawInput === null || typeof rawInput !== 'string') return -1;
    if (rawInput.trim() === '') return -1;

    const index = parseInt(rawInput, 10) - 1; // 1-based in, 0-based out
    return isValidIndex(index, length) ? index : -1;
}

// ── Mutation (pure: a new array out, the input untouched) ────────────────────

/**
 * Build a segment from user input, or null if the input is not usable.
 * @returns {{text: string, color: string}|null}
 */
export function createSegment(text, colorIndex, colors = COLORS) {
    if (typeof text !== 'string') return null;

    const label = text.trim().slice(0, MAX_LABEL_LENGTH);
    if (label === '') return null;

    return { text: label, color: colors[colorIndex % colors.length] };
}

/**
 * Append a segment. Returns a NEW array; `segments` is never mutated, so a
 * rejected input cannot leave the caller's state half-changed.
 * @returns {Array<{text:string,color:string}>} unchanged if `segment` is null
 */
export function appendSegment(segments, segment) {
    if (segment === null) return segments;
    return [...segments, segment];
}

/**
 * Replace the label at `index`. Out-of-range indices and unusable text are
 * rejected by returning the original array.
 */
export function editSegmentAt(segments, index, text) {
    if (!isValidIndex(index, segments.length)) return segments;
    if (typeof text !== 'string') return segments;

    const label = text.trim().slice(0, MAX_LABEL_LENGTH);
    if (label === '') return segments;

    return segments.map((segment, i) => (i === index ? { ...segment, text: label } : segment));
}

/** Remove the segment at `index`. An out-of-range index changes nothing. */
export function deleteSegmentAt(segments, index) {
    if (!isValidIndex(index, segments.length)) return segments;
    return segments.filter((_, i) => i !== index);
}

// ── Persistence (storage injected, never global) ─────────────────────────────

/**
 * Drop a value we could not trust, so the next load starts from a clean slate.
 * @param {{removeItem: Function}} storage
 */
export function discardCorruptStorage(storage, reason) {
    console.warn(`Discarding corrupt "${STORAGE_KEY}" (${reason}); falling back to defaults.`);
    try {
        storage.removeItem(STORAGE_KEY);
    } catch (err) {
        // removeItem itself throws when storage is disabled. Nothing further to
        // do — the caller still boots from its defaults.
        console.warn('Could not clear the corrupt storage key.', err);
    }
}

/**
 * Forget the stored wheel entirely — the "start a new wheel" reset.
 *
 * Distinct from discardCorruptStorage(): that one is a recovery path for data
 * we could not read, this one is a deliberate user action on data that was
 * perfectly valid. Both end at removeItem, but conflating them would make the
 * warning log lie about what happened.
 *
 * @param {{removeItem: Function}} storage
 * @returns {boolean} true if the key was cleared
 */
export function clearStoredSegments(storage) {
    try {
        storage.removeItem(STORAGE_KEY);
        return true;
    } catch (err) {
        // Storage disabled. The caller still resets its in-memory wheel, so the
        // reset appears to work and simply does not survive a reload.
        console.warn('Could not clear stored segments.', err);
        return false;
    }
}

/**
 * Persist the wheel. Never throws.
 * @param {{setItem: Function}} storage
 * @returns {boolean} true if the write landed
 */
export function saveSegments(storage, segments) {
    try {
        storage.setItem(STORAGE_KEY, JSON.stringify(segments));
        return true;
    } catch (err) {
        // QuotaExceededError, or storage blocked outright (Safari private mode
        // throws on the very first write). Only durability is lost — the
        // in-memory session continues, so this must not take the app down.
        console.warn('Could not save segments to storage.', err);
        return false;
    }
}

/**
 * Read and validate the persisted wheel. NEVER THROWS.
 *
 * Every stage that can fail is contained, and each failure falls back to
 * `defaults` so the app always boots:
 *   · getItem throws        → storage disabled            → defaults
 *   · absent / empty value  → nothing stored yet          → defaults
 *   · JSON.parse throws     → truncated or corrupt JSON   → clear + defaults
 *   · not an array          → would throw on .forEach     → clear + defaults
 *   · bad elements          → would throw on .text        → dropped individually
 *
 * @param {{getItem: Function, removeItem: Function}} storage injected, not global
 * @param {{defaults?: Array, colors?: string[]}} [options]
 * @returns {{records: Array<{text:string,color:string}>, repaired: boolean}}
 */
export function hydrateSegments(storage, { defaults = DEFAULT_SEGMENTS, colors = COLORS } = {}) {
    const fallback = () => ({ records: [...defaults], repaired: false });

    let stored;
    try {
        stored = storage.getItem(STORAGE_KEY);
    } catch (err) {
        console.warn('Could not read from storage; starting with defaults.', err);
        return fallback();
    }

    if (!stored) return fallback();

    let parsed;
    try {
        parsed = JSON.parse(stored);
    } catch {
        discardCorruptStorage(storage, 'not valid JSON');
        return fallback();
    }

    // A valid JSON object such as {"text":"x"} parses fine but has no forEach.
    // Checking the type here is what stops that becoming a TypeError at draw time.
    if (!Array.isArray(parsed)) {
        discardCorruptStorage(storage, 'stored value is not an array');
        return fallback();
    }

    const records = parsed
        .map((raw, i) => sanitizeSegment(raw, i, colors))
        .filter((segment) => segment !== null);

    const dropped = parsed.length - records.length;
    if (dropped > 0) {
        console.warn(`Dropped ${dropped} unreadable segment record(s) while loading.`);
    }
    return { records, repaired: dropped > 0 };
}
