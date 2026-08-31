// tests/e2e/fixtures.js
// Extends Playwright's `test` with a ready-to-use WheelPage, and guarantees a
// clean slate. The app persists to localStorage, so without an explicit wipe
// each test would inherit whatever the previous one left behind.

import { test as base } from '@playwright/test';
import { WheelPage } from './pages/WheelPage.js';

export const test = base.extend({
    wheel: async ({ page }, use) => {
        const wheel = new WheelPage(page);
        await wheel.goto();
        await page.evaluate(() => localStorage.clear());
        await page.reload();
        await wheel.heading.waitFor();
        await use(wheel);
    },
});

export { expect } from '@playwright/test';
