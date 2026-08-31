// tests/e2e/layout.spec.js
// The layout once used a fixed height with centred content, which pushed the
// controls off the top of a short viewport where they could not be scrolled
// back. These tests pin that down.

import { test, expect } from './fixtures.js';

test.describe('Responsive layout', () => {
    test('never scrolls sideways', async ({ wheel, page }) => {
        await wheel.addSegments(['Pizza', 'Sushi', 'Tacos', 'Ramen', 'Curry']);

        const { scrollWidth, clientWidth } = await page.evaluate(() => ({
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
        }));

        expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
    });

    test('keeps the heading and every control on screen', async ({ wheel, page }) => {
        await wheel.addSegments(['Pizza', 'Sushi', 'Tacos']);

        const headingTop = await wheel.heading.evaluate((el) => el.getBoundingClientRect().top);
        expect(headingTop, 'heading must not be clipped above the viewport').toBeGreaterThanOrEqual(0);

        for (const control of [wheel.addButton, wheel.editButton, wheel.deleteButton, wheel.newWheelButton]) {
            await expect(control).toBeInViewport();
        }
        void page;
    });

    test('renders the canvas at the device pixel ratio', async ({ wheel }) => {
        const { backing, css, dpr } = await wheel.wheel.evaluate((el) => ({
            backing: el.width,
            css: Math.round(el.getBoundingClientRect().width),
            dpr: window.devicePixelRatio,
        }));

        expect(backing).toBe(400 * dpr);
        expect(css).toBeGreaterThan(0);
    });
});
