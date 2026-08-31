// tests/e2e/accessibility.spec.js
// Guards the affordances that make the app usable without a mouse or a screen.
import { test, expect } from './fixtures.js';

test.describe('Accessibility affordances', () => {
    test('exposes a single H1, a named canvas and a labelled input', async ({ wheel, page }) => {
        await expect(wheel.heading).toBeVisible();
        await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
        await expect(wheel.wheel).toHaveAttribute('aria-label', /prize wheel/i);
        await expect(wheel.segmentInput).toBeVisible();
    });

    test('announces the spin result through a live region', async ({ wheel }) => {
        await expect(wheel.result).toHaveAttribute('aria-live', 'polite');

        await wheel.addSegments(['Yes', 'No']);
        await wheel.spinButton.click();

        await expect(wheel.result).not.toHaveText('', { timeout: 15_000 });
    });

    test('reaches every control by keyboard alone', async ({ wheel, page }) => {
        await wheel.addSegments(['Pizza']);

        const reachable = new Set();
        for (let i = 0; i < 12; i++) {
            await page.keyboard.press('Tab');
            const id = await page.evaluate(() => document.activeElement?.id || '');
            if (id) reachable.add(id);
        }

        for (const id of ['spinButton', 'segmentText', 'addSegmentButton', 'editSegmentButton', 'deleteSegmentButton', 'newWheelButton']) {
            expect(reachable, `${id} must be keyboard reachable`).toContain(id);
        }
    });

    test('gives the focused control a visible outline', async ({ wheel }) => {
        await wheel.spinButton.focus();

        const outline = await wheel.spinButton.evaluate((el) => getComputedStyle(el).outlineStyle);
        expect(outline).not.toBe('none');
    });
});
