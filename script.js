const canvas = document.getElementById('myCanvas');
const ctx = canvas.getContext('2d');

const centerX = canvas.width / 2;
const centerY = canvas.height / 2;
const radius = 150;

let segments = [];
let colorIndex = 0;
let currentRotation = 0; // Track the current rotation angle

const colors = ['lightgreen', 'lightcoral', 'lightblue', 'lightgoldenrodyellow', 'lightpink', 'lightgray'];

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
    const text = textInput.value.trim();

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

function editSegment() {
    const segmentIndex = prompt('Edit');

    if (segmentIndex === null || segmentIndex === '') return;

    const index = parseInt(segmentIndex, 10);

    if (isNaN(index) || index < 1 || index >= segments.length) {
        alert('Invalid segment index.');
        return;
    }

    const newText = prompt('Enter new text for the segment:', segments[index].text);
    if (newText === null || newText.trim() === '') return;

    segments[index].text = newText.trim();

    saveSegmentsToLocalStorage(); 

    clearCanvas();
    drawCircle();
    drawSegments();
}

function deleteSegment() {
    const segmentIndex = prompt('Delete');

    if (segmentIndex === null || segmentIndex === '') return;

    const index = parseInt(segmentIndex, 10);

    if (isNaN(index) || index < 1 || index >= segments.length) {
        alert('Invalid segment index.');
        return;
    }

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

    const selectedSegment = segments[selectedIndex];
    document.getElementById('segmentNameDisplay').textContent = `${selectedSegment.text}`; // Display the selected segment name
}

function saveSegmentsToLocalStorage() {
    localStorage.setItem('wheelSegments', JSON.stringify(segments));
}

function loadSegmentsFromLocalStorage() {
    const storedSegments = localStorage.getItem('wheelSegments');
    if (storedSegments) {
        segments = JSON.parse(storedSegments);
        colorIndex = segments.length; 
        clearCanvas();
        drawCircle();
        drawSegments();
    }
}

// Event listeners
document.getElementById('addSegmentButton').addEventListener('click', addSegment);
document.getElementById('editSegmentButton').addEventListener('click', editSegment);
document.getElementById('deleteSegmentButton').addEventListener('click', deleteSegment);
document.getElementById('spinButton').addEventListener('click', spinWheel);


clearCanvas();
drawCircle();
loadSegmentsFromLocalStorage();
