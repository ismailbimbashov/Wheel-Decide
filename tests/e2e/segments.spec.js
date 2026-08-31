// tests/e2e/segments.spec.js — editing, deleting, and resetting the wheel.
import { test, expect } from './fixtures.js';

test.describe('Managing segments', () => {
    test.beforeEach(async ({ wheel }) => {
        await wheel.addSegments(['Pizza', 'Sushi', 'Tacos']);
    });

    test('edits the FIRST segment', async ({ wheel }) => {
        // Regression guard: an off-by-one bounds check once made segment 1
        // permanently unreachable for both edit and delete.
        await wheel.editSegment(1, 'PIZZA!');

        expect(await wheel.storedLabels()).toEqual(['PIZZA!', 'Sushi', 'Tacos']);
    });

    test('edits a middle segment without disturbing its neighbours', async ({ wheel }) => {
        await wheel.editSegment(2, 'Ramen');

        expect(await wheel.storedLabels()).toEqual(['Pizza', 'Ramen', 'Tacos']);
    });

    test('deletes the FIRST segment', async ({ wheel }) => {
        await wheel.deleteSegment(1);

        expect(await wheel.storedLabels()).toEqual(['Sushi', 'Tacos']);
    });

    test('rejects an out-of-range ordinal and changes nothing', async ({ wheel }) => {
        const messages = await wheel.withDialogs(['99', true], () => wheel.deleteButton.click());

        expect(messages.join(' ')).toContain('between 1 and 3');
        expect(await wheel.storedLabels()).toEqual(['Pizza', 'Sushi', 'Tacos']);
    });

    test('cancelling a prompt leaves the wheel untouched', async ({ wheel }) => {
        await wheel.withDialogs([false], () => wheel.deleteButton.click());

        expect(await wheel.storedLabels()).toEqual(['Pizza', 'Sushi', 'Tacos']);
    });
});

test.describe('Starting a new wheel', () => {
    test('clears every segment once confirmed, and the reset survives a reload', async ({ wheel, page }) => {
        await wheel.addSegments(['Pizza', 'Sushi']);

        await wheel.startNewWheel({ confirm: true });
        expect(await wheel.storedRaw()).toBeNull();

        await page.reload();
        await wheel.heading.waitFor();
        expect(await wheel.storedLabels()).toEqual([]);
    });

    test('keeps the wheel when the confirmation is dismissed', async ({ wheel }) => {
        await wheel.addSegments(['Pizza', 'Sushi']);

        await wheel.startNewWheel({ confirm: false });

        expect(await wheel.storedLabels()).toEqual(['Pizza', 'Sushi']);
    });

    test('reports an already-empty wheel without opening a dialog', async ({ wheel }) => {
        const messages = await wheel.withDialogs([], () => wheel.newWheelButton.click());

        expect(messages).toHaveLength(0);
        await expect(wheel.result).toContainText('already empty');
    });
});
