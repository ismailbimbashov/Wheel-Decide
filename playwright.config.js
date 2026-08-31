// playwright.config.js
import { defineConfig, devices } from '@playwright/test';

const PORT = 8000;
const BASE_URL = `http://localhost:${PORT}`;
const isCI = !!process.env.CI;

export default defineConfig({
    testDir: './tests/e2e',
    // Unit tests live in tests/unit and are run by `node --test`. Scoping the
    // testDir keeps the two runners from ever discovering each other's files.
    testMatch: '**/*.spec.js',

    fullyParallel: true,
    // A stray test.only must fail the pipeline rather than silently shrinking it.
    forbidOnly: isCI,
    // One retry in CI absorbs genuine infrastructure blips; zero locally so a
    // flaky test is visible to whoever just wrote it.
    retries: isCI ? 1 : 0,
    workers: isCI ? 2 : undefined,

    reporter: isCI
        ? [['html', { open: 'never' }], ['list'], ['github']]
        : [['html', { open: 'never' }], ['list']],

    timeout: 30_000,
    expect: { timeout: 5_000 },

    use: {
        baseURL: BASE_URL,
        actionTimeout: 10_000,
        navigationTimeout: 15_000,
        // Diagnostics only on a retry, so a green run stays cheap but a failure
        // arrives with a full trace attached.
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
    },

    projects: [
        { name: 'Desktop Chrome', use: { ...devices['Desktop Chrome'] } },
        // The wheel is responsive and the layout previously clipped on small
        // screens, so a phone viewport is a first-class target, not an extra.
        { name: 'Mobile Chrome', use: { ...devices['Pixel 5'] } },
    ],

    // Starts the static server automatically; no manual step before `npm run test:e2e`.
    webServer: {
        command: 'npm start',
        url: BASE_URL,
        reuseExistingServer: !isCI,
        timeout: 30_000,
    },
});
