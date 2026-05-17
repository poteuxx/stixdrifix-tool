// State Management
let gamepadIndex = null;
let currentTab = 'dashboard';
let deadzones = { ls: 0.15, rs: 0.15 };
let turboMasterActive = false;
let isRecording = false;
let recordedSequence = [];
let recordStartTime = 0;
let realModeActive = false;
let socket = null;

// Real Mode Logic
function toggleRealMode() {
    realModeActive = !realModeActive;
    const btn = document.getElementById('real-mode-btn');
    
    if (realModeActive) {
        log("Attempting to connect to Stixdrifix Bridge (localhost:3000)...", 'warn');
        socket = new WebSocket('ws://localhost:3000');
        
        socket.onopen = () => {
            log("REAL MODE ACTIVE: System controller successfully hooked.", 'success');
            btn.style.borderColor = "#22c55e";
            btn.style.color = "#22c55e";
            btn.innerHTML = '<i data-lucide="radio"></i> Real Mode: ACTIVE';
            lucide.createIcons();
        };
        
        socket.onerror = () => {
            log("Bridge Connection Failed. Ensure 'node server.js' is running.", 'error');
            realModeActive = false;
            btn.style.borderColor = "#ef4444";
            btn.style.color = "#ef4444";
            btn.innerHTML = '<i data-lucide="radio"></i> Enable Real Mode';
            lucide.createIcons();
        };
    } else {
        if (socket) socket.close();
        log("Real Mode deactivated.");
        btn.style.borderColor = "#ef4444";
        btn.style.color = "#ef4444";
        btn.innerHTML = '<i data-lucide="radio"></i> Enable Real Mode';
        lucide.createIcons();
    }
}

let macros = [
    { id: 0, name: "Fast Loot Sequence", duration: 2.4, data: [] }
];

let turboButtons = [
    { id: 0, name: "Button A", freq: 15, active: false, mode: 'Turbo' },
    { id: 1, name: "Button B", freq: 10, active: false, mode: 'Turbo' },
    { id: 7, name: "Right Trigger", freq: 20, active: false, mode: 'Hold' }
];

let mappings = [];

// Console Helper
function log(msg, type = 'info') {
    const logs = document.getElementById('console-logs');
    if (!logs) return;
    const entry = document.createElement('div');
    entry.style.color = type === 'info' ? '#94a3b8' : (type === 'warn' ? '#fbbf24' : '#22c55e');
    entry.innerText = `[${new Date().toLocaleTimeString()}] ${msg}`;
    logs.prepend(entry);
}

// Persistence Logic
function saveState() {
    const state = { deadzones, turboButtons, mappings };
    localStorage.setItem('stixdrifix_state', JSON.stringify(state));
    log("Configuration saved to local cache.");
}

function loadState() {
    const saved = localStorage.getItem('stixdrifix_state');
    if (saved) {
        const state = JSON.parse(saved);
        deadzones = state.deadzones;
        turboButtons = state.turboButtons;
        mappings = state.mappings;
        log("Restored previous session configuration.", 'success');
    }
}

// Hardware Export
function exportGPCScript() {
    log("Generating GPC Hardware Script...", 'info');
    let gpc = `/*\n * Stixdrifix-tool Generated Script\n * Created by André & Antigravity\n * Branding: SolutionsTechnologies\n */\n\n`;
    gpc += `define LS_DEADZONE = ${Math.round(deadzones.ls * 100)};\n`;
    gpc += `define RS_DEADZONE = ${Math.round(deadzones.rs * 100)};\n\n`;
    gpc += `main {\n`;
    gpc += `    if(abs(get_val(STICK_2_X)) < LS_DEADZONE) set_val(STICK_2_X, 0.0);\n`;
    gpc += `    if(abs(get_val(STICK_2_Y)) < LS_DEADZONE) set_val(STICK_2_Y, 0.0);\n`;
    gpc += `    if(abs(get_val(STICK_1_X)) < RS_DEADZONE) set_val(STICK_1_X, 0.0);\n`;
    gpc += `    if(abs(get_val(STICK_1_Y)) < RS_DEADZONE) set_val(STICK_1_Y, 0.0);\n\n`;
    
    turboButtons.forEach(b => {
        if (b.active) gpc += `    if(get_val(BUTTON_${b.id})) combo_run(Turbo_${b.id});\n`;
    });
    
    mappings.forEach(m => {
        if (!m.target.startsWith('key_')) {
            const targetId = m.target.split('_')[1];
            gpc += `    set_val(BUTTON_${targetId}, get_val(BUTTON_${m.source}));\n`;
        }
    });
    gpc += `}\n\n`;

    turboButtons.forEach(b => {
        if (b.active) {
            const waitTime = Math.round(500 / b.freq);
            gpc += `combo Turbo_${b.id} {\n    set_val(BUTTON_${b.id}, 100.0);\n    wait(${waitTime});\n    set_val(BUTTON_${b.id}, 0.0);\n    wait(${waitTime});\n}\n\n`;
        }
    });

    const blob = new Blob([gpc], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'stixdrifix_v1.gpc'; a.click();
    log("GPC Script exported successfully!", 'success');
}

// Tab Switching
function showTab(tabId) {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.innerText.toLowerCase().includes(tabId)) item.classList.add('active');
    });
    document.querySelectorAll('.tab-content').forEach(content => content.style.display = 'none');
    document.getElementById(`tab-${tabId}`).style.display = 'block';
    document.getElementById('page-title').innerText = tabId.charAt(0).toUpperCase() + tabId.slice(1);
    currentTab = tabId;
    
    if (tabId === 'macros') renderMacros();
    if (tabId === 'turbo') renderTurboGrid();
    if (tabId === 'remapper') renderMappings();
}

// Modal Logic
function openAbout() { document.getElementById('about-modal').style.display = 'flex'; }
function closeAbout() { document.getElementById('about-modal').style.display = 'none'; }

// Gamepad API
window.addEventListener("gamepadconnected", (e) => {
    gamepadIndex = e.gamepad.index;
    document.getElementById('conn-status').classList.add('connected');
    document.getElementById('status-text').innerText = `Connected: ${e.gamepad.id}`;
    log(`Controller connected: ${e.gamepad.id}`, 'success');
    updateLoop();
});

window.addEventListener("gamepaddisconnected", () => {
    gamepadIndex = null;
    document.getElementById('conn-status').classList.remove('connected');
    document.getElementById('status-text').innerText = "Searching for controller...";
    log("Controller disconnected.", 'warn');
});

// Macro Logic
function startMacroRecording() {
    isRecording = !isRecording;
    const btn = document.getElementById('macro-rec-btn');
    if (isRecording) {
        recordedSequence = []; recordStartTime = Date.now();
        btn.innerText = "Stop Recording"; btn.style.background = "#ef4444";
        log("Recording started...", 'warn');
    } else {
        btn.innerText = "Start Recording"; btn.style.background = "";
        macros.push({ id: macros.length, name: `Record #${macros.length+1}`, duration: ((Date.now()-recordStartTime)/1000).toFixed(1), data: [...recordedSequence] });
        saveState(); renderMacros();
    }
}

function renderMacros() {
    const tbody = document.getElementById('macro-tbody');
    tbody.innerHTML = macros.map(m => `<tr><td>${m.name}</td><td>${m.duration}s</td><td><button class="btn btn-ghost">Play</button></td></tr>`).join('');
}

// Turbo Logic
function toggleTurboActivation() {
    turboMasterActive = !turboMasterActive;
    document.getElementById('turbo-master-text').innerText = turboMasterActive ? 'Deactivate Master' : 'Activate Share-Toggle';
    log(`Master Turbo Switch: ${turboMasterActive ? 'ON' : 'OFF'}`);
}

function renderTurboGrid() {
    const grid = document.getElementById('turbo-grid');
    grid.innerHTML = turboButtons.map(b => `
        <div class="card" style="background: var(--glass);">
            <h3>${b.name}</h3>
            <div style="display: flex; justify-content: space-between; margin: 10px 0;">
                <select onchange="updateTurboMode(${b.id}, this.value)" class="btn-ghost"><option ${b.mode==='Turbo'?'selected':''}>Turbo</option><option ${b.mode==='Hold'?'selected':''}>Hold</option></select>
                <span>${b.freq} Hz</span>
            </div>
            <input type="range" min="1" max="30" value="${b.freq}" oninput="updateTurboFreq(${b.id}, this.value)">
            <button class="btn ${b.active?'':'btn-ghost'}" style="margin-top:1rem; width:100%;" onclick="toggleTurboButton(${b.id})">${b.active?'ACTIVE':'INACTIVE'}</button>
        </div>`).join('');
}

function updateTurboFreq(id, val) { const b = turboButtons.find(x => x.id === id); if(b) b.freq = val; renderTurboGrid(); saveState(); }
function updateTurboMode(id, mode) { const b = turboButtons.find(x => x.id === id); if(b) b.mode = mode; saveState(); }
function toggleTurboButton(id) { const b = turboButtons.find(x => x.id === id); if(b) b.active = !b.active; renderTurboGrid(); saveState(); }

// Remapper
function addNewMapping() {
    const s = document.getElementById('remap-source'), t = document.getElementById('remap-target');
    mappings.push({ source: s.value, target: t.value, sourceName: s.options[s.selectedIndex].text, targetName: t.options[t.selectedIndex].text });
    renderMappings(); saveState();
}

function renderMappings() {
    const list = document.getElementById('mappings-list');
    list.innerHTML = mappings.map((m, idx) => `<div style="background:var(--glass); padding:10px; border-radius:8px; display:flex; justify-content:space-between;"><span>${m.sourceName} → ${m.targetName}</span><button onclick="removeMapping(${idx})">&times;</button></div>`).join('');
}

function removeMapping(idx) { mappings.splice(idx, 1); renderMappings(); saveState(); }

// Processing Loop
function updateLoop() {
    if (gamepadIndex === null) return;
    const gamepad = navigator.getGamepads()[gamepadIndex];
    if (!gamepad) return;

    if (isRecording) recordedSequence.push({ t: Date.now()-recordStartTime, axes: [...gamepad.axes], buttons: gamepad.buttons.map(b => b.pressed) });

    const rawRS = { x: gamepad.axes[2], y: gamepad.axes[3] };
    const fixedRS = { x: applyDeadzone(rawRS.x, deadzones.rs), y: applyDeadzone(rawRS.y, deadzones.rs) };

    updateStickUI('l-stick-dot', { x: applyDeadzone(gamepad.axes[0], deadzones.ls), y: applyDeadzone(gamepad.axes[1], deadzones.ls) });
    updateStickUI('r-stick-dot', fixedRS);

    if (currentTab === 'drift') renderDriftGraph(rawRS, fixedRS);

    // Stream to Real Mode Bridge
    if (realModeActive && socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
            ls: { x: applyDeadzone(gamepad.axes[0], deadzones.ls), y: applyDeadzone(gamepad.axes[1], deadzones.ls) },
            rs: fixedRS,
            buttons: gamepad.buttons.map(b => b.pressed)
        }));
    }

    requestAnimationFrame(updateLoop);
}

function applyDeadzone(v, t) { if (Math.abs(v) < t) return 0; return (v < 0 ? -1 : 1) * (Math.abs(v) - t) / (1 - t); }

function updateStickUI(id, c) {
    const dot = document.getElementById(id);
    if (!dot) return;
    dot.style.transform = `translate(calc(-50% + ${c.x * 50}px), calc(-50% + ${c.y * 50}px))`;
}

function updateDeadzone(s) {
    const v = document.getElementById(`${s}-dead`).value;
    deadzones[s] = v / 100;
    document.getElementById(`${s}-dead-label`).innerText = `Value: ${v}%`;
    const overlays = document.querySelectorAll('.deadzone-overlay');
    const overlay = s === 'ls' ? overlays[0] : overlays[1];
    overlay.style.width = `${v}%`; overlay.style.height = `${v}%`;
    saveState();
}

const driftCanvas = document.getElementById('drift-canvas');
let driftCtx = driftCanvas ? driftCanvas.getContext('2d') : null;
function renderDriftGraph(raw, fixed) {
    if (!driftCtx) return;
    driftCtx.clearRect(0, 0, driftCanvas.width, driftCanvas.height);
    driftCtx.strokeStyle = 'rgba(239, 68, 68, 0.4)'; driftCtx.beginPath();
    driftCtx.arc((raw.x + 1) * (driftCanvas.width / 2), (raw.y + 1) * (driftCanvas.height / 2), 5, 0, Math.PI * 2); driftCtx.stroke();
    driftCtx.strokeStyle = '#22c55e'; driftCtx.beginPath();
    driftCtx.arc((fixed.x + 1) * (driftCanvas.width / 2), (fixed.y + 1) * (driftCanvas.height / 2), 8, 0, Math.PI * 2); driftCtx.stroke();
}

// Initialize Lucide icons
lucide.createIcons();

// Init App
loadState();
showTab('dashboard');
