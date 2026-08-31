// script.js
// The DOM layer. Canvas drawing, event wiring, and the one place the browser's
// storage is named. All hydration, validation, mutation and bounds-checking
// live in core/storage.js, which is pure and therefore testable under Node.

import {
    appendSegment,
    clearStoredSegments,
    createSegment,
    deleteSegmentAt,
    editSegmentAt,
    hydrateSegments,
    resolveSegmentIndex,
    saveSegments,
} from './core/storage.js';

import {
    COLORS,
    LABEL_INK,
    fitFontSize,
    maxLabelWidth,
    paletteFor,
    rotationAt,
    segmentArc,
    selectIndexAt,
    shouldFlipLabel,
    spinDelta,
} from './core/wheel.js';

const canvas = document.getElementById('myCanvas');
const ctx = canvas.getContext('2d');

// Logical drawing size. The backing store is this times the device pixel
// ratio; every coordinate below stays in these units.
const SIZE = 400;
const centerX = SIZE / 2;
const centerY = SIZE / 2;
const radius = 190;
const HUB_RADIUS = 52;   // labels must clear the Spin button in the middle

let segments = [];
let colorIndex = 0;
let currentRotation = 0; // Track the current rotation angle
let isSpinning = false;  // guards against overlapping spins

/**
 * Match the backing store to the display density. Without this the 400x400
 * canvas was stretched by CSS and every label rendered soft on any HiDPI
 * screen — which is most phones and most laptops.
 */
function sizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = SIZE * dpr;
    canvas.height = SIZE * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// ── Integration boundary ────────────────────────────────────────────────────
// The ONLY reference to the browser's storage in the whole app. Every function
// in core/storage.js receives it as an argument instead of reaching for the
// global, which is precisely what lets the test suite swap in a plain object
// and run with no DOM and no dependencies.
const storage = window.localStorage;

function clearCanvas() {
    ctx.clearRect(0, 0, SIZE, SIZE);
}

function drawCircle() {
    // The rim. Drawn once beneath the slices so an empty wheel still reads as
    // a wheel rather than a blank square.
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#2b3040';
    ctx.lineWidth = 3;
    ctx.stroke();
}

function drawSegments() {
    if (segments.length === 0) return;

    const arc = segmentArc(segments.length);
    const colors = paletteFor(segments.length, COLORS);
    // Offset by half a slice so segment 0 is CENTRED under the pointer rather
    // than starting at it. Without this the marker rests exactly on a seam and
    // it is genuinely unclear which of the two neighbours won.
    let startAngle = -Math.PI / 2 - arc / 2;

    segments.forEach((segment, i) => {
        const angleEnd = startAngle + arc;
        drawSegmentWithText(segment.text, startAngle, angleEnd, colors[i]);
        startAngle = angleEnd;
    });

    drawHubRing();
}

function drawSegmentWithText(text, angleStart, angleEnd, color) {
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, angleStart, angleEnd);
    ctx.lineTo(centerX, centerY);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();

    // Hairline separators in the rim colour. The old 2px black borders were
    // heavier than the fills they divided.
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();

    drawTextInSegment(text, angleStart, angleEnd);
}

/** A white ring behind the Spin button, so slice seams stop at the hub. */
function drawHubRing() {
    ctx.beginPath();
    ctx.arc(centerX, centerY, HUB_RADIUS, 0, 2 * Math.PI);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#2b3040';
    ctx.lineWidth = 2;
    ctx.stroke();
}

function drawTextInSegment(text, angleStart, angleEnd) {
    const arc = angleEnd - angleStart;
    const midAngle = angleStart + arc / 2;

    // Sit the label between the hub and the rim, then size it to the chord
    // available at that radius. Both numbers now come from real geometry, so
    // the shrink-to-fit below actually runs.
    const labelRadius = HUB_RADIUS + (radius - HUB_RADIUS) * 0.52;
    const available = Math.min(
        maxLabelWidth(labelRadius, arc),
        radius - HUB_RADIUS - 16,        // never run under the hub or off the rim
    );

    ctx.save();

    const fontSize = fitFontSize(
        (size) => { ctx.font = `600 ${size}px Arial, sans-serif`; return ctx.measureText(text).width; },
        available,
    );

    ctx.font = `600 ${fontSize}px Arial, sans-serif`;
    ctx.fillStyle = LABEL_INK;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.translate(
        centerX + labelRadius * Math.cos(midAngle),
        centerY + labelRadius * Math.sin(midAngle),
    );

    // Flip past vertical, otherwise every label on the left half renders
    // upside-down.
    ctx.rotate(shouldFlipLabel(midAngle) ? midAngle + Math.PI : midAngle);

    ctx.fillText(text, 0, 0);
    ctx.restore();
}

function addSegment() {
    const textInput = document.getElementById('segmentText');
    const segment = createSegment(textInput.value, colorIndex);

    if (segment === null) {
        alert('Please enter text for the segment.');
        return;
    }

    segments = appendSegment(segments, segment);
    colorIndex++;

    saveSegments(storage, segments); // Save Local storage

    clearCanvas();
    drawCircle();
    drawSegments();

    textInput.value = '';
}

/**
 * Ask which segment to act on. The menu is 1-based because that is how the
 * wheel reads to a person; resolveSegmentIndex() does the single conversion to
 * a 0-based index and owns the bounds check.
 *
 * @returns {number} a valid index into `segments`, or -1 to abort
 */
function askForSegmentIndex(action) {
    if (segments.length === 0) {
        alert('There are no segments yet. Add one first.');
        return -1;
    }

    const menu = segments.map((segment, i) => `${i + 1}. ${segment.text}`).join('\n');
    const answer = prompt(`Which segment do you want to ${action}?\n\n${menu}`);

    const index = resolveSegmentIndex(answer, segments.length);

    // Cancelling (null) and submitting nothing are silent; a genuine bad value
    // gets told what the valid range is.
    if (index === -1 && answer !== null && answer.trim() !== '') {
        alert(`Enter a number between 1 and ${segments.length}.`);
    }

    return index;
}

function editSegment() {
    const index = askForSegmentIndex('edit');
    if (index === -1) return;

    const newText = prompt('Enter new text for the segment:', segments[index].text);
    if (newText === null) return;

    const updated = editSegmentAt(segments, index, newText);
    if (updated === segments) return; // rejected: blank label, nothing changed
    segments = updated;

    saveSegments(storage, segments);

    clearCanvas();
    drawCircle();
    drawSegments();
}

function deleteSegment() {
    const index = askForSegmentIndex('delete');
    if (index === -1) return;

    segments = deleteSegmentAt(segments, index);

    saveSegments(storage, segments);

    clearCanvas();
    drawCircle();
    drawSegments();
}

/**
 * Wipe the wheel and start over.
 *
 * Guarded by a confirm() because it is irreversible and destroys every segment
 * at once — a heavier action than deleting one, which is why it also asks
 * rather than just doing it.
 */
function startNewWheel() {
    if (isSpinning) return;

    if (segments.length === 0) {
        document.getElementById('segmentNameDisplay').textContent = 'The wheel is already empty.';
        return;
    }

    const count = segments.length;
    const confirmed = confirm(
        `Start a new wheel?\n\nThis removes all ${count} segment${count === 1 ? '' : 's'} and cannot be undone.`,
    );
    if (!confirmed) return;

    segments = [];
    colorIndex = 0;
    currentRotation = 0;
    canvas.style.transform = 'rotate(0deg)';

    clearStoredSegments(storage);

    document.getElementById('segmentNameDisplay').textContent = '';
    document.getElementById('segmentText').focus();

    clearCanvas();
    drawCircle();
    drawSegments();
}

function spinWheel() {
    // RE-ENTRANCY GUARD. Without it every click started another animation loop,
    // and each live loop wrote the same shared `currentRotation`.
    if (isSpinning || segments.length === 0) return;
    isSpinning = true;

    document.getElementById('segmentNameDisplay').textContent = '';
    canvas.classList.add('is-spinning');

    // FROZEN BASE. Captured once, never reassigned, so the tween cannot move
    // underneath itself the way the previous implementation did.
    const startRotation = currentRotation;
    const delta = spinDelta(Math.random);
    const spinDuration = 3200; // Spin duration in milliseconds
    const startTime = performance.now();

    function animate(time) {
        const progress = Math.min((time - startTime) / spinDuration, 1);

        currentRotation = rotationAt(startRotation, delta, progress);
        canvas.style.transform = `rotate(${currentRotation}deg)`;

        if (progress < 1) {
            requestAnimationFrame(animate);
        } else {
            currentRotation %= 360; // Keep the current rotation angle between 0 and 360
            isSpinning = false;
            canvas.classList.remove('is-spinning');
            displaySegmentAtArrow();
        }
    }

    requestAnimationFrame(animate);
}

function displaySegmentAtArrow() {
    // Selection maths lives in core/wheel.js and is unit-tested; this function
    // is only responsible for putting the answer on screen.
    const selectedIndex = selectIndexAt(currentRotation, segments.length);
    if (selectedIndex === -1) return;

    const selectedSegment = segments[selectedIndex];
    if (!selectedSegment) return;

    // textContent, never innerHTML — the label is user input and must never be
    // parsed as markup.
    document.getElementById('segmentNameDisplay').textContent = selectedSegment.text;
}

// ── Persistence (delegated to core/storage.js, storage injected) ─────────────

function loadSegmentsFromLocalStorage() {
    const { records, repaired } = hydrateSegments(storage);
    segments = records;
    colorIndex = segments.length;

    // Write the cleaned set back so the same bad records are not re-filtered on
    // every future load.
    if (repaired) saveSegments(storage, segments);

    clearCanvas();
    drawCircle();
    drawSegments();
}

// Event listeners
document.getElementById('addSegmentButton').addEventListener('click', addSegment);
document.getElementById('editSegmentButton').addEventListener('click', editSegment);
document.getElementById('deleteSegmentButton').addEventListener('click', deleteSegment);
document.getElementById('spinButton').addEventListener('click', spinWheel);
document.getElementById('newWheelButton').addEventListener('click', startNewWheel);


sizeCanvas();
clearCanvas();
drawCircle();
loadSegmentsFromLocalStorage();

// Re-rasterise if the window moves to a display with a different pixel ratio.
window.addEventListener('resize', () => {
    sizeCanvas();
    clearCanvas();
    drawCircle();
    drawSegments();
});
