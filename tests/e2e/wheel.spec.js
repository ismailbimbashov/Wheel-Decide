// tests/e2e/wheel.spec.js — the core business flow: build a wheel and spin it.
import { test, expect } from './fixtures.js';

test.describe('Building and spinning a wheel', () => {
    test('shows an empty wheel with no result on first visit', async ({ wheel }) => {
        await expect(wheel.heading).toBeVisible();
        await expect(wheel.wheel).toBeVisible();
        await expect(wheel.result).toHaveText('');
        expect(await wheel.storedLabels()).toEqual([]);
    });

    test('adds a segment and persists it', async ({ wheel }) => {
        await wheel.addSegment('Pizza');

        expect(await wheel.storedLabels()).toEqual(['Pizza']);
        await expect(wheel.segmentInput).toHaveValue('', { timeout: 5000 });
    });

    test('spinning announces one of the segments on the wheel', async ({ wheel }) => {
        const labels = ['Pizza', 'Sushi', 'Tacos', 'Ramen'];
        await wheel.addSegments(labels);

        await wheel.spinButton.click();

        // Anchor on the outcome, never on a fixed sleep: the result region is
        // empty during the spin and filled exactly once it settles.
        await expect(wheel.result).not.toHaveText('', { timeout: 15_000 });
        expect(labels).toContain(await wheel.result.textContent());
    });

    test('refuses to add an empty segment', async ({ wheel }) => {
        const messages = await wheel.withDialogs([true], async () => {
            await wheel.segmentInput.fill('   ');
            await wheel.addButton.click();
        });

        expect(messages.join(' ')).toContain('enter text');
        expect(await wheel.storedLabels()).toEqual([]);
    });

    test('keeps the wheel across a page reload', async ({ wheel, page }) => {
        await wheel.addSegments(['Yes', 'No']);

        await page.reload();
        await wheel.heading.waitFor();

        expect(await wheel.storedLabels()).toEqual(['Yes', 'No']);
    });
});
