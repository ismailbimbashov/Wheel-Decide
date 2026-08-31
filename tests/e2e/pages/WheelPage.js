// tests/e2e/pages/WheelPage.js
// Page Object for the whole app — it is a single screen.
//
// Every locator is resolved by ACCESSIBLE NAME (getByRole / getByLabel), never
// by CSS position or DOM structure. That keeps the suite stable across markup
// changes and means a broken locator is also an accessibility regression.

export class WheelPage {
    /** @param {import('@playwright/test').Page} page */
    constructor(page) {
        this.page = page;

        this.heading = page.getByRole('heading', { name: 'Wheel Decider', level: 1 });
        this.wheel = page.getByRole('img', { name: /prize wheel/i });
        this.spinButton = page.getByRole('button', { name: 'Spin' });
        this.segmentInput = page.getByLabel('Segment text');
        this.addButton = page.getByRole('button', { name: 'Add Segment' });
        this.editButton = page.getByRole('button', { name: 'Edit Segment' });
        this.deleteButton = page.getByRole('button', { name: 'Delete Segment' });
        this.newWheelButton = page.getByRole('button', { name: 'New Wheel' });
        this.result = page.getByRole('status');
    }

    async goto() {
        await this.page.goto('/');
        await this.heading.waitFor();
    }

    /** Seed storage before the app boots — used to test the hydration paths. */
    async gotoWithStoredValue(raw) {
        await this.page.goto('/');
        await this.page.evaluate(
            (v) => (v === null ? localStorage.removeItem('wheelSegments') : localStorage.setItem('wheelSegments', v)),
            raw,
        );
        await this.page.reload();
        await this.heading.waitFor();
    }

    async addSegment(text) {
        await this.segmentInput.fill(text);
        await this.addButton.click();
    }

    async addSegments(labels) {
        for (const label of labels) await this.addSegment(label);
    }

    /**
     * Answer the next dialog(s) in order, then run `action`.
     * The app uses native prompt/confirm, so a handler must be armed first.
     */
    async withDialogs(answers, action) {
        const queue = [...answers];
        const seen = [];
        const handler = async (dialog) => {
            seen.push(dialog.message());
            const next = queue.shift();
            if (next === false || next === undefined) await dialog.dismiss();
            else await dialog.accept(next === true ? '' : next);
        };
        this.page.on('dialog', handler);
        try {
            await action();
        } finally {
            this.page.off('dialog', handler);
        }
        return seen;
    }

    editSegment(ordinal, newText) {
        return this.withDialogs([String(ordinal), newText], () => this.editButton.click());
    }

    deleteSegment(ordinal) {
        return this.withDialogs([String(ordinal)], () => this.deleteButton.click());
    }

    startNewWheel({ confirm = true } = {}) {
        return this.withDialogs([confirm ? true : false], () => this.newWheelButton.click());
    }

    /** Labels as persisted — the app's own source of truth. */
    storedLabels() {
        return this.page.evaluate(() =>
            JSON.parse(localStorage.getItem('wheelSegments') || '[]').map((s) => s.text),
        );
    }

    storedRaw() {
        return this.page.evaluate(() => localStorage.getItem('wheelSegments'));
    }
}
