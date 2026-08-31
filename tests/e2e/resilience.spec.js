// tests/e2e/resilience.spec.js
// The hydration path, exercised through a real browser rather than a mock.
// A crash here previously bricked the app permanently: the throw happened at
// load, so it repeated on every reload with no way out from inside the UI.

import { test, expect } from './fixtures.js';

const HOSTILE_PAYLOADS = [
    ['truncated JSON',        '[{"text":"a",',                                       0],
    ['a valid non-array',     '{"text":"x"}',                                        0],
    ['an array with null',    '[null]',                                              0],
    ['an array of primitives','[1,2,3]',                                             0],
    ['records with no .text', '[{"foo":1}]',                                         0],
    ['good records + poison', '[{"text":"Pizza"},null,{"foo":1},{"text":"Sushi"}]',  2],
];

test.describe('Recovering from a damaged saved wheel', () => {
    for (const [name, stored, survivors] of HOSTILE_PAYLOADS) {
        test(`boots cleanly from ${name}`, async ({ wheel, page }) => {
            const errors = [];
            page.on('pageerror', (e) => errors.push(e.message));

            await wheel.gotoWithStoredValue(stored);

            await expect(wheel.heading).toBeVisible();
            await expect(wheel.wheel).toBeVisible();
            expect(errors, 'no uncaught exception may escape to the page').toEqual([]);
            expect(await wheel.storedLabels()).toHaveLength(survivors);
        });
    }

    test('stays usable after recovering — you can rebuild and spin', async ({ wheel }) => {
        await wheel.gotoWithStoredValue('[{"text":"a",');

        await wheel.addSegments(['Yes', 'No']);
        await wheel.spinButton.click();

        await expect(wheel.result).not.toHaveText('', { timeout: 15_000 });
        expect(['Yes', 'No']).toContain(await wheel.result.textContent());
    });
});
