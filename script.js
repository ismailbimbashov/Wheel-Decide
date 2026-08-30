const canvas = document.getElementById('myCanvas');
const ctx = canvas.getContext('2d');

const centerX = canvas.width / 2;
const centerY = canvas.height / 2;
const radius = 150;

let segments = [];
let colorIndex = 0;
let currentRotation = 0; // Track the current rotation angle

const colors = ['lightgreen', 'lightcoral', 'lightblue', 'lightgoldenrodyellow', 'lightpink', 'lightgray'];

// ── Storage contract ────────────────────────────────────────────────────────
// localStorage is UNTRUSTED INPUT. It is writable by any script on this origin
// and directly by the user, and a browser crash mid-write can leave a truncated
// value behind. Everything read from it is validated before use.
const STORAGE_KEY = 'wheelSegments';
// Matches the maxlength on #segmentText. Enforced here too, because the HTML
// attribute only constrains typing — it does not constrain what is already in
// storage.
const MAX_LABEL_LENGTH = 40;
// What the wheel falls back to when storage is absent, unreadable or invalid.
// This is the app's existing first-run state: an empty wheel the user fills in.
const DEFAULT_SEGMENTS = [];

function clearCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function drawCircle() {
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
    ctx.fillStyle = 'lightblue';
    ctx.fill();
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 5;
    ctx.stroke();
}

function drawSegments() {
    if (segments.length === 0) return;

    const segmentAngle = (2 * Math.PI) / segments.length; // Calculate angle in radians for each segment
    let startAngle = -Math.PI / 2; // Start from the top (12 o'clock position)

    segments.forEach(segment => {
        const angleEnd = startAngle + segmentAngle;
        drawSegmentWithText(segment.text, startAngle, angleEnd, segment.color);
        startAngle = angleEnd;
    });
}

function drawSegmentWithText(text, angleStart, angleEnd, color) {
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, angleStart, angleEnd);
    ctx.lineTo(centerX, centerY);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 2;
    ctx.stroke();

    drawTextInSegment(text, angleStart, angleEnd);
}

function drawTextInSegment(text, angleStart, angleEnd) {
    const segmentRadius = radius - 20;
    const midAngle = (angleEnd - angleStart) / 2 + angleStart;

    ctx.save();
    ctx.font = '16px Arial';
    let textWidth = ctx.measureText(text).width;

    const segmentArc = angleEnd - angleStart;
    const maxTextWidth = segmentRadius * segmentArc * radius / (Math.PI / 2);

    let fontSize = 16;
    while (textWidth > maxTextWidth && fontSize > 8) {
        fontSize -= 1;
        ctx.font = `${fontSize}px Arial`;
        textWidth = ctx.measureText(text).width;
    }

    const textX = centerX + (segmentRadius / 2) * Math.cos(midAngle);
    const textY = centerY + (segmentRadius / 2) * Math.sin(midAngle);

    ctx.font = `${fontSize}px Arial`;
    ctx.fillStyle = 'black';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.translate(textX, textY);
    ctx.rotate(midAngle);
    ctx.fillText(text, 0, 0);
    ctx.restore();
}

function addSegment() {
    const textInput = document.getElementById('segmentText');
    // Bounded here as well as via the maxlength attribute: the attribute only
    // constrains typing, not a value set programmatically or pasted in.
    const text = textInput.value.trim().slice(0, MAX_LABEL_LENGTH);

    if (text === '') {
        alert('Please enter text for the segment.');
        return;
    }

    const segmentColor = colors[colorIndex % colors.length];
    colorIndex++;

    segments.push({ text, color: segmentColor });

    saveSegmentsToLocalStorage(); // Save Local storage

    clearCanvas();
    drawCircle();
    drawSegments();

    textInput.value = '';
}

/**
 * Ask which segment to act on, and return a VALID index into `segments`.
 *
 * The prompt is 1-based because that is how the wheel reads to a person; the
 * value returned is a 0-based array index. Converting in exactly one place is
 * what keeps the bounds check honest — the original did the check in two places
 * against a value it then used as a raw subscript.
 *
 * @param {string} action verb shown to the user ('edit' / 'delete')
 * @returns {number} a valid index, or -1 to abort
 */
function askForSegmentIndex(action) {
    if (segments.length === 0) {
        alert('There are no segments yet. Add one first.');
        return -1;
    }

    const menu = segments.map((segment, i) => `${i + 1}. ${segment.text}`).join('\n');
    const answer = prompt(`Which segment do you want to ${action}?\n\n${menu}`);
    if (answer === null || answer.trim() === '') return -1;

    const index = parseInt(answer, 10) - 1; // 1-based in, 0-based out

    // THE OFF-BY-ONE. The original lower bound was `index < 1`, applied to a
    // value used directly as a zero-based subscript — so segment 0 could never
    // be edited or deleted, and with a single segment stored every input was
    // rejected. The array is zero-based, so the lower bound is 0.
    if (!Number.isInteger(index) || index < 0 || index >= segments.length) {
        alert(`Enter a number between 1 and ${segments.length}.`);
        return -1;
    }

    return index;
}

function editSegment() {
    const index = askForSegmentIndex('edit');
    if (index === -1) return;

    const newText = prompt('Enter new text for the segment:', segments[index].text);
    if (newText === null) return;

    const text = newText.trim().slice(0, MAX_LABEL_LENGTH);
    if (text === '') return;

    segments[index].text = text;

    saveSegmentsToLocalStorage();

    clearCanvas();
    drawCircle();
    drawSegments();
}

function deleteSegment() {
    const index = askForSegmentIndex('delete');
    if (index === -1) return;

    segments.splice(index, 1); // Remove the segment from the array

    saveSegmentsToLocalStorage();

    clearCanvas();
    drawCircle();
    drawSegments();
}

function spinWheel() {
    const randomDegree = Math.floor(Math.random() * 360) + 360 * 5; // Spin at least 5 times before stopping
    const spinDuration = 2000; // Spin duration in milliseconds
    const targetRotation = currentRotation + randomDegree;

    // Animate the spinning
    const startTime = performance.now();

    function animate(time) {
        const elapsed = time - startTime;
        const progress = Math.min(elapsed / spinDuration, 1); // Clamp to 1 at the end
        const rotation = currentRotation + progress * (targetRotation - currentRotation);

        // Update current rotation
        currentRotation = rotation % 360;
        
        // Apply rotation to the canvas
        canvas.style.transform = `rotate(${currentRotation}deg)`;

        if (progress < 1) {
            requestAnimationFrame(animate);
        } else {
            currentRotation = targetRotation % 360; // Keep the current rotation angle between 0 and 360
            displaySegmentAtArrow();
        }
    }

    requestAnimationFrame(animate);
}

function displaySegmentAtArrow() {
    if (segments.length === 0) return;

    const segmentAngle = 360 / segments.length; // Calculate angle size for each segment
    const normalizedRotation = (360 - (currentRotation % 360)) % 360; // Adjust the rotation to determine the pointed segment
    const selectedIndex = Math.floor(normalizedRotation / segmentAngle); // Determine selected segment index

    // Bounds-check before dereferencing. selectedIndex is derived from
    // currentRotation, so a non-finite rotation would yield NaN here and throw
    // on `.text`. Reject the lookup instead of announcing a crash.
    const selectedSegment = segments[selectedIndex];
    if (!selectedSegment) return;

    // textContent, never innerHTML — the label is user input and must never be
    // parsed as markup.
    document.getElementById('segmentNameDisplay').textContent = selectedSegment.text;
}

// ── Persistence ─────────────────────────────────────────────────────────────

function saveSegmentsToLocalStorage() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(segments));
    } catch (err) {
        // QuotaExceededError, or storage blocked outright (Safari private mode
        // throws on the very first write). The in-memory session continues; only
        // durability is lost, so this must not take the app down.
        console.warn('Could not save segments to storage.', err);
    }
}

/**
 * Normalise ONE stored record into the shape the drawing code requires, or
 * return null when it cannot be salvaged.
 *
 * This is the function that makes `.text` access safe downstream: every value
 * that reaches drawSegments() has been proven to be an object with a non-empty
 * string `text` and a string `color`.
 *
 * @param {unknown} raw   an element straight out of the parsed array
 * @param {number}  index its position, used to pick a replacement colour
 * @returns {{text: string, color: string}|null}
 */
function sanitizeSegment(raw, index) {
    // Rejects null, undefined, numbers, strings, booleans and arrays — every
    // value whose `.text` access would throw or yield something unusable.
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
    if (typeof raw.text !== 'string') return null;

    const text = raw.text.trim().slice(0, MAX_LABEL_LENGTH);
    if (text === '') return null;

    // A missing or malformed colour is REPAIRED rather than rejected: the label
    // is the user's data and worth keeping, the colour is only presentation.
    const color = typeof raw.color === 'string' && raw.color.trim() !== ''
        ? raw.color
        : colors[index % colors.length];

    return { text, color };
}

/** Drop a value we could not trust, so the next load starts from a clean slate. */
function discardCorruptStorage(reason) {
    console.warn(`Discarding corrupt "${STORAGE_KEY}" (${reason}); falling back to defaults.`);
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch (err) {
        // removeItem itself throws when storage is disabled. Nothing further to
        // do — the caller still boots from DEFAULT_SEGMENTS.
        console.warn('Could not clear the corrupt storage key.', err);
    }
}

/**
 * Read and validate the persisted wheel. Never throws.
 *
 * Every stage that can fail is contained, and each failure falls back to
 * DEFAULT_SEGMENTS so the app always boots:
 *   · getItem throws        → storage disabled                 → defaults
 *   · absent / empty value  → nothing stored yet               → defaults
 *   · JSON.parse throws     → truncated or corrupt JSON        → clear + defaults
 *   · not an array          → would throw on .forEach          → clear + defaults
 *   · bad elements          → would throw on .text             → dropped individually
 *
 * @returns {{records: Array<{text:string,color:string}>, repaired: boolean}}
 */
function hydrateSegments() {
    let stored;
    try {
        stored = localStorage.getItem(STORAGE_KEY);
    } catch (err) {
        console.warn('Could not read from storage; starting with defaults.', err);
        return { records: [...DEFAULT_SEGMENTS], repaired: false };
    }

    if (!stored) return { records: [...DEFAULT_SEGMENTS], repaired: false };

    let parsed;
    try {
        parsed = JSON.parse(stored);
    } catch (err) {
        discardCorruptStorage('not valid JSON');
        return { records: [...DEFAULT_SEGMENTS], repaired: false };
    }

    // A valid JSON object such as {"text":"x"} parses fine but has no forEach.
    // Checking the type here is what stops that becoming a TypeError at draw time.
    if (!Array.isArray(parsed)) {
        discardCorruptStorage('stored value is not an array');
        return { records: [...DEFAULT_SEGMENTS], repaired: false };
    }

    const records = parsed
        .map(sanitizeSegment)
        .filter(segment => segment !== null);

    const dropped = parsed.length - records.length;
    if (dropped > 0) {
        console.warn(`Dropped ${dropped} unreadable segment record(s) while loading.`);
    }
    return { records, repaired: dropped > 0 };
}

function loadSegmentsFromLocalStorage() {
    const { records, repaired } = hydrateSegments();
    segments = records;
    colorIndex = segments.length;

    // Write the cleaned set back so the same bad records are not re-filtered on
    // every future load.
    if (repaired) saveSegmentsToLocalStorage();

    // Always render. The original only drew when a stored value existed, which
    // left the bootstrap path at the bottom of this file drawing the base circle
    // without its segments.
    clearCanvas();
    drawCircle();
    drawSegments();
}

// Event listeners
document.getElementById('addSegmentButton').addEventListener('click', addSegment);
document.getElementById('editSegmentButton').addEventListener('click', editSegment);
document.getElementById('deleteSegmentButton').addEventListener('click', deleteSegment);
document.getElementById('spinButton').addEventListener('click', spinWheel);


clearCanvas();
drawCircle();
loadSegmentsFromLocalStorage();
