let alarms = JSON.parse(localStorage.getItem('savedShiftAlarms')) || [];
let audioCtx = null;
let alarmInterval = null;
let originalTitle = document.title;
let titleFlashInterval = null;
let lastCheckedMinute = "";
let worker = null;

// Initialize state engines
initBackgroundWorker();
renderAlarms();
checkNotificationPermission();
setupEnterKeyDetection();

function initBackgroundWorker() {
    // This creates a dedicated background thread without requiring a separate physical file
    const workerCode = `
        setInterval(() => {
            const now = new Date();
            const timeString = now.toTimeString().split(' ')[0];
            const currentHHMM = timeString.substring(0, 5);
            self.postMessage({ timeString, currentHHMM });
        }, 1000);
    `;
    
    const blob = new Blob([workerCode], { type: "application/javascript" });
    worker = new Worker(URL.createObjectURL(blob));
    
    // The background thread constantly updates our clock and checks alarms instantly
    worker.onmessage = function(e) {
        const { timeString, currentHHMM } = e.data;
        document.getElementById('liveClock').textContent = timeString;

        if (currentHHMM !== lastCheckedMinute) {
            lastCheckedMinute = currentHHMM;
            const activeAlarm = alarms.find(a => a.time === currentHHMM);
            if (activeAlarm) {
                triggerAlarm(activeAlarm);
            }
        }
    };
}

function checkNotificationPermission() {
    if (!("Notification" in window)) return;
    if (Notification.permission !== "granted" && Notification.permission !== "denied") {
        Notification.requestPermission();
    }
}

function setupEnterKeyDetection() {
    const inputs = ['alarmTime', 'alarmDesc'];
    inputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { addManualAlarm(); }
            });
        }
    });
}

function subtractFiveMinutes(timeStr) {
    let [hours, minutes] = timeStr.split(':').map(Number);
    minutes -= 5;
    if (minutes < 0) {
        minutes += 60;
        hours -= 1;
        if (hours < 0) hours = 23;
    }
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function importExcelData() {
    const rawText = document.getElementById('excelInput').value;
    if (!rawText.trim()) return;

    const lines = rawText.split('\n');
    
    lines.forEach((line, index) => {
        if (!line.trim()) return;
        
        const columns = line.split(/\t| {2,}/).map(c => c.trim()).filter(Boolean);
        if (columns.length < 3) return;

        const startTime = columns[0];
        const endTime = columns[1];
        const taskName = columns[2];

        const timeRegex = /^([0-9]|0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$/;
        if (!timeRegex.test(startTime) || !timeRegex.test(endTime)) return;

        if (!taskName.toLowerCase().includes('chat') || taskName.toLowerCase().includes('chatter')) {
            return; 
        }

        const triggerStart = subtractFiveMinutes(startTime);
        const triggerEnd = subtractFiveMinutes(endTime);

        const startLabel = `Upcoming: Start of ${taskName}`;
        const isLastShiftLine = (index === lines.length - 1 || index === lines.filter(Boolean).length - 1);
        const endLabel = isLastShiftLine ? "Upcoming: End of Shift" : `Upcoming: End of ${taskName}`;

        if (!alarms.some(a => a.time === triggerStart)) alarms.push({ time: triggerStart, desc: startLabel });
        if (!alarms.some(a => a.time === triggerEnd)) alarms.push({ time: triggerEnd, desc: endLabel });
    });

    renderAlarms();
    document.getElementById('excelInput').value = '';
}

function addManualAlarm() {
    const timeInput = document.getElementById('alarmTime');
    const descInput = document.getElementById('alarmDesc');
    const timeVal = timeInput.value;
    const descVal = descInput.value.trim() || "Manual Alarm";

    if (!timeVal) return;

    if (!alarms.some(a => a.time === timeVal)) {
        alarms.push({ time: timeVal, desc: descVal });
        renderAlarms();
    }
    timeInput.value = '';
    descInput.value = '';
}

function renderAlarms() {
    alarms.sort((a, b) => a.time.localeCompare(b.time));
    localStorage.setItem('savedShiftAlarms', JSON.stringify(alarms));
    
    const listEl = document.getElementById('alarmList');
    listEl.innerHTML = '';
    
    alarms.forEach(alarm => {
        const li = document.createElement('li');
        li.className = 'alarm-item';
        li.innerHTML = `
            <div class="alarm-info">
                <span class="alarm-time">${alarm.time}</span>
                <span class="alarm-label">${alarm.desc}</span>
            </div>
            <button class="btn-delete" onclick="deleteAlarm('${alarm.time}')">Delete</button>
        `;
        listEl.appendChild(li);
    });
}

function deleteAlarm(timeToRemove) {
    alarms = alarms.filter(a => a.time !== timeToRemove);
    renderAlarms();
}

function startBeeping() {
    if (!audioCtx || audioCtx.state === 'suspended') {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') { audioCtx.resume(); }
    if (alarmInterval) clearInterval(alarmInterval);
    
    playSingleBeep();
    alarmInterval = setInterval(playSingleBeep, 500);
}

function playSingleBeep() {
    if (!audioCtx) return;
    try {
        let osc = audioCtx.createOscillator();
        let gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.15);
    } catch(e) {}
}

function triggerAlarm(alarm) {
    const overlay = document.getElementById('alarmOverlay');
    if (overlay.classList.contains('active') && document.getElementById('triggeredTime').textContent === alarm.time) return;

    document.getElementById('triggeredTime').textContent = alarm.time;
    document.getElementById('triggeredDesc').textContent = alarm.desc;
    overlay.classList.add('active');
    
    // Web Audio APIs can still be slightly delayed until you visually refocus the window,
    // but the system notification below will fire EXACTLY on the dot.
    startBeeping();

    if ("Notification" in window && Notification.permission === "granted") {
        new Notification(`🚨 ${alarm.time} - Shift Reminder`, {
            body: alarm.desc,
            requireInteraction: true // Keeps notification sticky on Windows until clicked
        });
    }

    if (!titleFlashInterval) {
        let toggle = false;
        titleFlashInterval = setInterval(() => {
            document.title = toggle ? "⚠️ SHIFT ALERT! ⚠️" : "⏰ " + alarm.time;
            toggle = !toggle;
        }, 500);
    }
}

function dismissAlarm() {
    document.getElementById('alarmOverlay').classList.remove('active');
    clearInterval(alarmInterval);
    clearInterval(titleFlashInterval);
    titleFlashInterval = null;
    document.title = originalTitle;
    
    const activeTime = document.getElementById('triggeredTime').textContent;
    deleteAlarm(activeTime);
}
