// tests/storage.test.js
// Zero-dependency suite: Node's built-in runner and assertion library only.
//
// Nothing here needs a DOM, jsdom or a browser. That is possible because
// core/storage.js takes its storage as an ARGUMENT — every test below injects a
// plain in-memory object where the browser would pass window.localStorage.

import test, { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
    STORAGE_KEY,
    MAX_LABEL_LENGTH,
    COLORS,
    sanitizeSegment,
    isValidIndex,
    resolveSegmentIndex,
    createSegment,
    appendSegment,
    editSegmentAt,
    deleteSegmentAt,
    saveSegments,
    clearStoredSegments,
    discardCorruptStorage,
    hydrateSegments,
} from '../src/core/storage.js';

// ── Test doubles ─────────────────────────────────────────────────────────────

/** An in-memory stand-in for window.localStorage, backed by a Map. */
function createMockStorage(initial = {}) {
    const map = new Map(Object.entries(initial));
    return {
        getItem: (key) => (map.has(key) ? map.get(key) : null),
        setItem: (key, value) => { map.set(key, String(value)); },
        removeItem: (key) => { map.delete(key); },
        // inspection helpers, not part of the Storage contract
        _map: map,
        _size: () => map.size,
    };
}

/** A storage whose named method throws — Safari private mode, quota exhausted. */
function createFailingStorage(failOn, error = new Error('storage unavailable')) {
    const base = createMockStorage();
    return { ...base, [failOn]: () => { throw error; } };
}

// core/storage.js reports recoveries through console.warn. Silence it so a pass
// reads cleanly, and restore it after every test so nothing leaks between them.
let warnings = [];
const realWarn = console.warn;
beforeEach(() => { warnings = []; console.warn = (...args) => warnings.push(args.join(' ')); });
afterEach(() => { console.warn = realWarn; });

const seg = (text, color = 'lightpink') => ({ text, color });

// ── TASK-02.1 · Hydration and data recovery ──────────────────────────────────

describe('hydrateSegments — recovers from any stored value', () => {
    it('returns the defaults when nothing has been stored yet', () => {
        const storage = createMockStorage();
        const { records, repaired } = hydrateSegments(storage);
        assert.deepEqual(records, []);
        assert.equal(repaired, false);
    });

    it('does not throw on truncated JSON, and clears the corrupt key', () => {
        const storage = createMockStorage({ [STORAGE_KEY]: '[{"text":"a",' });

        // Arrange/Act split matters here: the assertion is that no SyntaxError
        // escapes, which is the exact crash this guard exists to prevent.
        let result;
        assert.doesNotThrow(() => { result = hydrateSegments(storage); });

        assert.deepEqual(result.records, []);
        assert.equal(storage.getItem(STORAGE_KEY), null, 'corrupt key must be removed');
    });

    it('does not throw on valid JSON that is not an array', () => {
        // {"text":"x"} parses fine but has no .forEach — the TypeError case.
        const storage = createMockStorage({ [STORAGE_KEY]: '{"text":"x"}' });

        let result;
        assert.doesNotThrow(() => { result = hydrateSegments(storage); });

        assert.deepEqual(result.records, []);
        assert.equal(storage.getItem(STORAGE_KEY), null);
    });

    it('does not throw on an array containing null', () => {
        const storage = createMockStorage({ [STORAGE_KEY]: '[null]' });

        let result;
        assert.doesNotThrow(() => { result = hydrateSegments(storage); });

        assert.deepEqual(result.records, []);
    });

    it('keeps the good records and drops only the unusable ones', () => {
        const storage = createMockStorage({
            [STORAGE_KEY]: '[{"text":"Pizza"},null,{"foo":1},{"text":"Sushi"}]',
        });

        const { records, repaired } = hydrateSegments(storage);

        assert.deepEqual(records.map((r) => r.text), ['Pizza', 'Sushi']);
        assert.equal(repaired, true, 'dropping records must flag a repair');
    });

    it('falls back to the caller-supplied defaults, not a hardcoded empty list', () => {
        const storage = createMockStorage({ [STORAGE_KEY]: 'not json at all' });
        const defaults = [seg('Yes'), seg('No')];

        const { records } = hydrateSegments(storage, { defaults });

        assert.deepEqual(records.map((r) => r.text), ['Yes', 'No']);
        assert.notEqual(records, defaults, 'must return a copy, not the caller’s array');
    });

    it('survives a storage whose getItem throws', () => {
        const storage = createFailingStorage('getItem');

        let result;
        assert.doesNotThrow(() => { result = hydrateSegments(storage); });

        assert.deepEqual(result.records, []);
        assert.equal(warnings.length, 1);
    });

    it('reads intact data back unchanged', () => {
        const stored = JSON.stringify([seg('Pizza', 'lightpink')]);
        const storage = createMockStorage({ [STORAGE_KEY]: stored });

        const { records, repaired } = hydrateSegments(storage);

        assert.deepEqual(records, [seg('Pizza', 'lightpink')]);
        assert.equal(repaired, false, 'valid data must not be flagged as repaired');
    });
});

// ── TASK-02.2 · Bounds checking, the off-by-one ──────────────────────────────

describe('isValidIndex — the guard that replaced the off-by-one', () => {
    it('accepts index 0', () => {
        // The regression test for the original `index < 1`, which made the
        // first segment permanently uneditable and undeletable.
        assert.equal(isValidIndex(0, 3), true);
    });

    it('accepts every index up to length - 1', () => {
        for (const length of [1, 3, 5]) {
            for (let i = 0; i < length; i++) {
                assert.equal(isValidIndex(i, length), true, `index ${i} of ${length}`);
            }
        }
    });

    it('rejects negative indices', () => {
        assert.equal(isValidIndex(-1, 3), false);
        assert.equal(isValidIndex(-99, 3), false);
    });

    it('rejects an index equal to or beyond length', () => {
        assert.equal(isValidIndex(3, 3), false);
        assert.equal(isValidIndex(4, 3), false);
    });

    it('rejects every index when the wheel is empty', () => {
        assert.equal(isValidIndex(0, 0), false);
    });

    it('rejects non-integers', () => {
        for (const bad of [NaN, 1.5, '1', null, undefined, {}]) {
            assert.equal(isValidIndex(bad, 3), false, `${String(bad)} must be rejected`);
        }
    });
});

describe('resolveSegmentIndex — 1-based input to a 0-based index', () => {
    it('maps what the user types onto the whole array, first entry included', () => {
        for (const length of [1, 3, 5]) {
            const got = [];
            for (let typed = 1; typed <= length; typed++) {
                got.push(resolveSegmentIndex(String(typed), length));
            }
            const expected = Array.from({ length }, (_, i) => i);
            assert.deepEqual(got, expected, `wheel of ${length}`);
        }
    });

    it('rejects 0, because the UI counts from 1', () => {
        assert.equal(resolveSegmentIndex('0', 3), -1);
    });

    it('rejects out-of-range, negative and malformed input', () => {
        for (const bad of ['4', '99', '-3', 'abc', '', '   ', null, undefined]) {
            assert.equal(resolveSegmentIndex(bad, 3), -1, `${String(bad)} must abort`);
        }
    });
});

// ── TASK-02.3 · Persistence ──────────────────────────────────────────────────

describe('saveSegments — writes through the injected storage', () => {
    it('serialises the segments to the agreed key', () => {
        const storage = createMockStorage();
        const segments = [seg('Pizza', 'lightpink'), seg('Sushi', 'lightblue')];

        const ok = saveSegments(storage, segments);

        assert.equal(ok, true);
        assert.deepEqual(JSON.parse(storage.getItem(STORAGE_KEY)), segments);
    });

    it('round-trips through hydrate without loss', () => {
        const storage = createMockStorage();
        const segments = [seg('Pizza', 'lightpink'), seg('Tacos', 'lightgray')];

        saveSegments(storage, segments);
        const { records } = hydrateSegments(storage);

        assert.deepEqual(records, segments);
    });

    it('reports failure instead of throwing when the quota is exhausted', () => {
        const quota = new Error('QuotaExceededError');
        const storage = createFailingStorage('setItem', quota);

        let ok;
        assert.doesNotThrow(() => { ok = saveSegments(storage, [seg('Pizza')]); });

        assert.equal(ok, false, 'a failed write must be reported, not swallowed silently');
        assert.equal(warnings.length, 1);
    });
});

describe('clearStoredSegments — the "new wheel" reset', () => {
    it('removes a stored wheel', () => {
        const storage = createMockStorage({ [STORAGE_KEY]: JSON.stringify([seg('Pizza')]) });

        assert.equal(clearStoredSegments(storage), true);
        assert.equal(storage.getItem(STORAGE_KEY), null);
    });

    it('leaves the next load booting from defaults', () => {
        const storage = createMockStorage({ [STORAGE_KEY]: JSON.stringify([seg('Pizza')]) });

        clearStoredSegments(storage);

        assert.deepEqual(hydrateSegments(storage).records, []);
    });

    it('is a no-op, not an error, when nothing is stored', () => {
        const storage = createMockStorage();
        assert.equal(clearStoredSegments(storage), true);
    });

    it('reports failure instead of throwing when storage is unavailable', () => {
        const storage = createFailingStorage('removeItem');

        let ok;
        assert.doesNotThrow(() => { ok = clearStoredSegments(storage); });

        assert.equal(ok, false);
        assert.equal(warnings.length, 1);
    });

    it('does not warn on the happy path — a reset is not a recovery', () => {
        // discardCorruptStorage() logs because it is repairing damage. A user
        // choosing "new wheel" has not done anything that warrants a warning.
        clearStoredSegments(createMockStorage());
        assert.equal(warnings.length, 0);
    });
});

describe('discardCorruptStorage', () => {
    it('removes the key', () => {
        const storage = createMockStorage({ [STORAGE_KEY]: 'garbage' });
        discardCorruptStorage(storage, 'test');
        assert.equal(storage._size(), 0);
    });

    it('does not throw when removeItem itself fails', () => {
        const storage = createFailingStorage('removeItem');
        assert.doesNotThrow(() => discardCorruptStorage(storage, 'test'));
        assert.equal(warnings.length, 2, 'warns about the discard and about the failure');
    });
});

// ── Validation of a single record ────────────────────────────────────────────

describe('sanitizeSegment', () => {
    it('rejects every value whose .text access would throw or be unusable', () => {
        for (const bad of [null, undefined, 1, 'text', true, ['text'], {}, { text: 123 }, { text: '   ' }]) {
            assert.equal(sanitizeSegment(bad, 0), null, `${JSON.stringify(bad)} must be rejected`);
        }
    });

    it('trims the label and bounds it to MAX_LABEL_LENGTH', () => {
        const long = 'x'.repeat(MAX_LABEL_LENGTH + 20);
        const result = sanitizeSegment({ text: `  ${long}  ` }, 0);
        assert.equal(result.text.length, MAX_LABEL_LENGTH);
    });

    it('repairs a missing colour from the palette rather than rejecting the record', () => {
        const result = sanitizeSegment({ text: 'Pizza' }, 1);
        assert.equal(result.text, 'Pizza');
        assert.equal(result.color, COLORS[1]);
    });

    it('keeps a colour that is already valid', () => {
        assert.equal(sanitizeSegment({ text: 'Pizza', color: 'rebeccapurple' }, 0).color, 'rebeccapurple');
    });
});

// ── Mutation stays pure ──────────────────────────────────────────────────────

describe('segment mutation returns new arrays and never mutates its input', () => {
    it('appends without touching the original', () => {
        const original = [seg('Pizza')];
        const next = appendSegment(original, createSegment('Sushi', 1));

        assert.equal(next.length, 2);
        assert.equal(original.length, 1, 'input array must be untouched');
    });

    it('ignores an unusable new segment', () => {
        const original = [seg('Pizza')];
        assert.equal(appendSegment(original, createSegment('   ', 0)), original);
    });

    it('edits the addressed record, first entry included', () => {
        const original = [seg('Pizza'), seg('Sushi')];
        const next = editSegmentAt(original, 0, 'PIZZA!');

        assert.deepEqual(next.map((s) => s.text), ['PIZZA!', 'Sushi']);
        assert.equal(original[0].text, 'Pizza', 'input array must be untouched');
    });

    it('deletes the addressed record, first entry included', () => {
        const original = [seg('Pizza'), seg('Sushi'), seg('Tacos')];
        const next = deleteSegmentAt(original, 0);

        assert.deepEqual(next.map((s) => s.text), ['Sushi', 'Tacos']);
        assert.equal(original.length, 3, 'input array must be untouched');
    });

    it('rejects out-of-range edits and deletes by changing nothing', () => {
        const original = [seg('Pizza')];
        assert.equal(editSegmentAt(original, 5, 'x'), original);
        assert.equal(editSegmentAt(original, -1, 'x'), original);
        assert.equal(deleteSegmentAt(original, 5), original);
        assert.equal(deleteSegmentAt(original, -1), original);
    });

    it('rejects an empty replacement label', () => {
        const original = [seg('Pizza')];
        assert.equal(editSegmentAt(original, 0, '   '), original);
    });
});

describe('createSegment', () => {
    it('cycles colours by position', () => {
        assert.equal(createSegment('a', 0).color, COLORS[0]);
        assert.equal(createSegment('a', COLORS.length).color, COLORS[0], 'wraps around');
    });

    it('rejects blank and non-string input', () => {
        for (const bad of ['', '   ', null, undefined, 42]) {
            assert.equal(createSegment(bad, 0), null);
        }
    });
});

// The exact payload table from the manual verification of the hydration fix,
// promoted from a throwaway harness into a committed regression test.
test('every known-hostile stored payload hydrates without throwing', () => {
    const PAYLOADS = [
        ['truncated JSON',        '[{"text":"a",',   0],
        ['non-array object',      '{"text":"x"}',    0],
        ['array containing null', '[null]',          0],
        ['array of primitives',   '[1,2,3]',         0],
        ['objects missing .text', '[{"foo":1}]',     0],
        ['nested array element',  '[["text"]]',      0],
        ['whitespace-only label', '[{"text":"   "}]', 0],
        ['mixed good + poison',   '[{"text":"Pizza"},null,{"foo":1},{"text":"Sushi"}]', 2],
        ['valid record',          '[{"text":"Pizza","color":"lightpink"}]', 1],
    ];

    for (const [name, stored, expected] of PAYLOADS) {
        const storage = createMockStorage({ [STORAGE_KEY]: stored });
        let result;
        assert.doesNotThrow(() => { result = hydrateSegments(storage); }, `${name} must not throw`);
        assert.equal(result.records.length, expected, `${name} → ${expected} record(s)`);
    }
});
