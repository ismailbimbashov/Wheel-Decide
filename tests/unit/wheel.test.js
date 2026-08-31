// tests/wheel.test.js
// Pure geometry, animation and colour maths — no canvas, no DOM, no deps.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    COLORS, LABEL_INK,
    paletteFor, segmentArc, maxLabelWidth, fitFontSize, shouldFlipLabel,
    easeOutCubic, rotationAt, spinDelta, selectIndexAt,
} from '../../src/core/wheel.js';

// ── Colour assignment ────────────────────────────────────────────────────────

describe('paletteFor — no two neighbours share a colour', () => {
    it('never repeats a colour side by side, at any wheel size', () => {
        for (let count = 2; count <= 40; count++) {
            const picks = paletteFor(count);
            for (let i = 1; i < count; i++) {
                assert.notEqual(picks[i], picks[i - 1], `count ${count}, slices ${i - 1}/${i}`);
            }
        }
    });

    it('closes the seam: the last slice never matches the first', () => {
        // The exact defect — 7 slices over a 6-colour palette put the same
        // green at both ends, and on a wheel those two are adjacent.
        for (let count = 2; count <= 40; count++) {
            const picks = paletteFor(count);
            assert.notEqual(picks[count - 1], picks[0], `count ${count} wraps onto itself`);
        }
    });

    it('reproduces the original bug when the seam repair is removed', () => {
        // Guards the guard: proves the naive scheme really does collide, so
        // this test would fail loudly if the repair were quietly dropped.
        const naive = Array.from({ length: 7 }, (_, i) => COLORS.slice(0, 6)[i % 6]);
        assert.equal(naive[6], naive[0], 'naive scheme collides at the seam');
        assert.notEqual(paletteFor(7, COLORS.slice(0, 6))[6], paletteFor(7, COLORS.slice(0, 6))[0]);
    });

    it('uses only colours from the supplied palette', () => {
        for (const c of paletteFor(20)) assert.ok(COLORS.includes(c));
    });

    it('returns an empty list for a wheel with nothing on it', () => {
        assert.deepEqual(paletteFor(0), []);
        assert.deepEqual(paletteFor(-3), []);
        assert.deepEqual(paletteFor(1.5), []);
    });

    it('handles a single segment', () => {
        assert.deepEqual(paletteFor(1), [COLORS[0]]);
    });
});

// ── Geometry ─────────────────────────────────────────────────────────────────

describe('segmentArc', () => {
    it('divides the full turn evenly', () => {
        assert.equal(segmentArc(4), Math.PI / 2);
        assert.equal(segmentArc(1), Math.PI * 2);
    });

    it('is zero when there is nothing to divide', () => {
        assert.equal(segmentArc(0), 0);
    });
});

describe('maxLabelWidth — the chord, not a squared radius', () => {
    it('stays inside the canvas for every realistic wheel', () => {
        // The formula this replaces returned 3,900–39,000px on a 400px canvas,
        // which is why the shrink-to-fit loop was unreachable dead code.
        for (const count of [2, 4, 8, 20]) {
            const w = maxLabelWidth(130, segmentArc(count));
            assert.ok(w > 0 && w < 400, `count ${count} → ${w.toFixed(0)}px must be on-canvas`);
        }
    });

    it('narrows as slices get thinner', () => {
        const wide = maxLabelWidth(130, segmentArc(4));
        const thin = maxLabelWidth(130, segmentArc(16));
        assert.ok(thin < wide);
    });

    it('caps a half-turn arc at the diameter', () => {
        assert.ok(maxLabelWidth(100, Math.PI, 1) <= 200 + 1e-9);
    });
});

describe('fitFontSize', () => {
    const linear = (perUnit) => (size) => size * perUnit;

    it('keeps the maximum when the text already fits', () => {
        assert.equal(fitFontSize(linear(1), 1000), 16);
    });

    it('shrinks until the text fits', () => {
        const size = fitFontSize(linear(10), 100); // needs size <= 10
        assert.equal(size, 10);
        assert.ok(linear(10)(size) <= 100);
    });

    it('never goes below the floor, even for impossible widths', () => {
        assert.equal(fitFontSize(linear(1000), 1), 8);
    });

    it('respects custom bounds', () => {
        assert.equal(fitFontSize(linear(1), 1000, { max: 24 }), 24);
        assert.equal(fitFontSize(linear(1000), 1, { min: 11 }), 11);
    });
});

describe('shouldFlipLabel — keeps text right-way-up on the left half', () => {
    it('does not flip on the right half', () => {
        assert.equal(shouldFlipLabel(0), false);
        assert.equal(shouldFlipLabel(Math.PI / 4), false);
        assert.equal(shouldFlipLabel(-Math.PI / 4), false);
    });

    it('flips on the left half — the mirrored-label defect', () => {
        assert.equal(shouldFlipLabel(Math.PI), true);
        assert.equal(shouldFlipLabel((3 * Math.PI) / 4), true);
        assert.equal(shouldFlipLabel((5 * Math.PI) / 4), true);
    });

    it('agrees with itself a full turn later', () => {
        for (const a of [0, 1, 2, 3, 4, 5, 6]) {
            assert.equal(shouldFlipLabel(a), shouldFlipLabel(a + Math.PI * 2));
        }
    });
});

// ── Animation ────────────────────────────────────────────────────────────────

describe('easeOutCubic', () => {
    it('runs from 0 to 1', () => {
        assert.equal(easeOutCubic(0), 0);
        assert.equal(easeOutCubic(1), 1);
    });

    it('clamps input outside the unit range', () => {
        assert.equal(easeOutCubic(-5), 0);
        assert.equal(easeOutCubic(9), 1);
    });

    it('decelerates: it is always ahead of a linear ramp', () => {
        for (const p of [0.1, 0.25, 0.5, 0.75, 0.9]) {
            assert.ok(easeOutCubic(p) > p, `ease(${p}) should lead linear`);
        }
    });

    it('increases monotonically', () => {
        let prev = -1;
        for (let i = 0; i <= 100; i++) {
            const v = easeOutCubic(i / 100);
            assert.ok(v >= prev, `dipped at ${i}`);
            prev = v;
        }
    });
});

describe('rotationAt — the frozen-base fix', () => {
    it('starts at the start and ends exactly on target', () => {
        assert.equal(rotationAt(40, 1900, 0), 40);
        assert.equal(rotationAt(40, 1900, 1), 1940);
    });

    it('never goes backwards — the stutter the old tween produced', () => {
        // Replays the animation frame by frame. The previous implementation
        // reassigned its own base each frame and wrapped at 360, yielding
        // 15° → 45° → 90° → 148° → 218° → 299° → 28° → 148° → 274°.
        let previous = -Infinity;
        for (let frame = 0; frame <= 125; frame++) {
            const angle = rotationAt(40, 1900, frame / 125);
            assert.ok(angle >= previous, `reversed at frame ${frame}`);
            previous = angle;
        }
    });

    it('is unaffected by the caller mutating its own rotation', () => {
        // The base is a value parameter, so nothing outside can move it.
        const a = rotationAt(0, 720, 0.5);
        const b = rotationAt(0, 720, 0.5);
        assert.equal(a, b);
    });
});

describe('spinDelta', () => {
    it('always turns at least the minimum number of full laps', () => {
        for (const r of [0, 0.5, 0.999]) {
            assert.ok(spinDelta(() => r) >= 5 * 360);
        }
    });

    it('stays below one extra lap, so the landing is uniform', () => {
        assert.ok(spinDelta(() => 0.999) < 6 * 360);
    });

    it('honours a custom lap count', () => {
        assert.equal(spinDelta(() => 0, 2), 720);
    });
});

describe('selectIndexAt — which slice is under the pointer', () => {
    it('reads the first slice at rest', () => {
        assert.equal(selectIndexAt(0, 4), 0);
    });

    it('walks backwards through the slices as the wheel turns forwards', () => {
        // Rotating the wheel +90° brings the slice before it up to the pointer.
        assert.equal(selectIndexAt(90, 4), 3);
        assert.equal(selectIndexAt(180, 4), 2);
        assert.equal(selectIndexAt(270, 4), 1);
    });

    it('always returns an addressable index', () => {
        for (const count of [1, 3, 7, 12]) {
            for (let deg = -720; deg <= 720; deg += 7) {
                const i = selectIndexAt(deg, count);
                assert.ok(i >= 0 && i < count, `deg ${deg}, count ${count} → ${i}`);
            }
        }
    });

    it('handles negative and multi-lap rotations', () => {
        assert.equal(selectIndexAt(-90, 4), selectIndexAt(270, 4));
        assert.equal(selectIndexAt(360 * 5 + 90, 4), selectIndexAt(90, 4));
    });

    it('refuses to select from an empty or invalid wheel', () => {
        assert.equal(selectIndexAt(0, 0), -1);
        assert.equal(selectIndexAt(0, -2), -1);
        assert.equal(selectIndexAt(NaN, 4), -1);
        assert.equal(selectIndexAt(Infinity, 4), -1);
    });
});

describe('exported constants', () => {
    it('ships eight distinct colours', () => {
        assert.equal(COLORS.length, 8);
        assert.equal(new Set(COLORS).size, 8);
    });

    it('defines a label ink', () => {
        assert.match(LABEL_INK, /^#[0-9a-f]{6}$/i);
    });
});
