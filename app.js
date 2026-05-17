// Initialize Lucide icons
lucide.createIcons();

// State Management
let gamepadIndex = null;
let currentTab = 'dashboard';
let deadzones = {
    ls: 0.15,
    rs: 0.15
};
let turboMasterActive = false;

// Console Helper
function log(msg, type = 'info') {
    const logs = document.getElementById('console-logs');
    const entry = document.createElement('div');
    entry.style.color = type === 'info' ? '#94a3b8' : (type === 'warn' ? '#fbbf24' : '#22c55e');
    entry.innerText = `[${new Date().toLocaleTimeString()}] ${msg}`;
    logs.prepend(entry);
}

// DOM Elements
const connStatus = document.getElementById('conn-status');
const statusText = document.getElementById('status-text');
const lStickDot = document.getElementById('l-stick-dot');
const rStickDot = document.getElementById('r-stick-dot');

// Tab Switching
function showTab(tabId) {
    // Update Nav
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.innerText.toLowerCase().includes(tabId)) {
            item.classList.add('active');
        }
    });

    // Update Content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.style.display = 'none';
    });
    document.getElementById(`tab-${tabId}`).style.display = 'block';
    
    // Update Header
    document.getElementById('page-title').innerText = tabId.charAt(0).toUpperCase() + tabId.slice(1);
    currentTab = tabId;
}

// Modal Logic
function openAbout() {
    document.getElementById('about-modal').style.display = 'flex';
}

function closeAbout() {
    document.getElementById('about-modal').style.display = 'none';
}

// Gamepad API Implementation
window.addEventListener("gamepadconnected", (event) => {
    gamepadIndex = event.gamepad.index;
    connStatus.classList.add('connected');
    statusText.innerText = `Connected: ${event.gamepad.id}`;
    log(`Controller connected: ${event.gamepad.id}`, 'success');
    updateLoop();
});

window.addEventListener("gamepaddisconnected", (event) => {
    gamepadIndex = null;
    connStatus.classList.remove('connected');
    statusText.innerText = "Searching for controller...";
    log("Controller disconnected.", 'warn');
});

function toggleTurboActivation() {
    turboMasterActive = !turboMasterActive;
    const btnText = document.getElementById('turbo-master-text');
    btnText.innerText = turboMasterActive ? 'Deactivate Master Switch' : 'Activate Share-Toggle';
    log(`Master Turbo Switch: ${turboMasterActive ? 'ON' : 'OFF'}`);
}

function applyDeadzone(value, threshold) {
    // Simple radial/axial deadzone logic
    if (Math.abs(value) < threshold) return 0;
    
    // Scale remaining range
    const sign = value < 0 ? -1 : 1;
    return sign * (Math.abs(value) - threshold) / (1 - threshold);
}

function updateLoop() {
    if (gamepadIndex === null) return;

    const gamepad = navigator.getGamepads()[gamepadIndex];
    if (!gamepad) return;

    // AXES Mapping (LS: 0,1 | RS: 2,3)
    const rawLS = { x: gamepad.axes[0], y: gamepad.axes[1] };
    const rawRS = { x: gamepad.axes[2], y: gamepad.axes[3] };

    // Apply Drift Fix
    const fixedLS = {
        x: applyDeadzone(rawLS.x, deadzones.ls),
        y: applyDeadzone(rawLS.y, deadzones.ls)
    };
    const fixedRS = {
        x: applyDeadzone(rawRS.x, deadzones.rs),
        y: applyDeadzone(rawRS.y, deadzones.rs)
    };

    // Update Visuals
    updateStickUI('l-stick-dot', fixedLS);
    updateStickUI('r-stick-dot', fixedRS);

    if (currentTab === 'drift') {
        renderDriftGraph(rawRS, fixedRS); // Right stick is usually the problem
    }

    requestAnimationFrame(updateLoop);
}

function updateStickUI(id, coords) {
    const dot = document.getElementById(id);
    const range = 50; // pixels from center
    const x = coords.x * range;
    const y = coords.y * range;
    dot.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
    
    // Visual glow based on intensity
    const intensity = Math.sqrt(x*x + y*y) / range;
    dot.style.boxShadow = `0 0 ${10 + intensity * 20}px var(--primary)`;
}

function updateDeadzone(stick) {
    const val = document.getElementById(`${stick}-dead`).value;
    deadzones[stick] = val / 100;
    document.getElementById(`${stick}-dead-label`).innerText = `Value: ${val}%`;
    
    // Update overlays on UI
    const overlays = document.querySelectorAll('.deadzone-overlay');
    const overlay = stick === 'ls' ? overlays[0] : overlays[1];
    overlay.style.width = `${val}%`;
    overlay.style.height = `${val}%`;
}

// Canvas Data Visualization
const driftCanvas = document.getElementById('drift-canvas');
if (driftCanvas) {
    const ctx = driftCanvas.getContext('2d');
    function renderDriftGraph(raw, fixed) {
        ctx.clearRect(0, 0, driftCanvas.width, driftCanvas.height);
        
        // Draw Raw crosshair
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.5)';
        ctx.beginPath();
        const rx = (raw.x + 1) * (driftCanvas.width / 2);
        const ry = (raw.y + 1) * (driftCanvas.height / 2);
        ctx.arc(rx, ry, 5, 0, Math.PI * 2);
        ctx.stroke();

        // Draw Fixed crosshair
        ctx.strokeStyle = '#22c55e';
        ctx.beginPath();
        const fx = (fixed.x + 1) * (driftCanvas.width / 2);
        const fy = (fixed.y + 1) * (driftCanvas.height / 2);
        ctx.arc(fx, fy, 8, 0, Math.PI * 2);
        ctx.stroke();
    }
}

// Initial Call
showTab('dashboard');
