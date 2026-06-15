let alarms = JSON.parse(localStorage.getItem('savedAlarms')) || [];
let audioCtx = null;
let alarmInterval = null;
let originalTitle = document.title;
let titleFlashInterval = null;

// Initialize display and state
updateClock();
setInterval(updateClock, 1000);
renderAlarms();
checkNotificationPermission();
setupEnterKeyDetection();

function updateClock() {
    const now = new Date();
    const timeString = now.toTimeString().split(' ');
    document.getElementById('liveClock').textContent = timeString[0];

    // Check match against the HH:MM format
    const currentHHMM = timeString[0].substring(0, 5);
    
    if (alarms.includes(currentHHMM)) {
        triggerAlarm(currentHHMM);
    }
}

function checkNotificationPermission() {
    if (!("Notification" in window)) return;
    
    // Auto-request permission on page load if not handled by a banner
    if (Notification.permission !== "granted" && Notification.permission !== "denied") {
        Notification.requestPermission();
    }
}

function setupEnterKeyDetection() {
    const timeInput = document.getElementById('alarmTime');
    if (timeInput) {
        timeInput.addEventListener('keydown', function(event) {
            if (event.key === 'Enter') {
                event.preventDefault();
                addAlarm();
            }
        });
    }
}

function renderAlarms() {
    // Sort list chronologically 
    alarms.sort();
    localStorage.setItem('savedAlarms', JSON.stringify(alarms));
    
    const listEl = document.getElementById('alarmList');
    listEl.innerHTML = '';
    
    alarms.forEach(time => {
        const li = document.createElement('li');
        li.className = 'alarm-item';
        li.innerHTML = `
            <span class="alarm-time">${time}</span>
            <button class="btn-delete" onclick="deleteAlarm('${time}')">Delete</button>
        `;
        listEl.appendChild(li);
    });
}

function addAlarm() {
    const input = document.getElementById('alarmTime');
    const newTime = input.value;
    if (!newTime) return;

    if (!alarms.includes(newTime)) {
        alarms.push(newTime);
        renderAlarms();
    }
    input.value = '';
}

function deleteAlarm(timeToRemove) {
    alarms = alarms.filter(time => time !== timeToRemove);
    renderAlarms();
}

// Web Audio API Synth Beeper (No external file dependencies)
function startBeeping() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    
    alarmInterval = setInterval(() => {
        if (!audioCtx) return;
        let osc = audioCtx.createOscillator();
        let gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, audioCtx.currentTime); // Pitch: A5 note
        gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.15); // Short, sharp beep
    }, 500);
}

function triggerAlarm(time) {
    // Prevent duplicate alert stacks if it's already open
    const overlay = document.getElementById('alarmOverlay');
    if (overlay.classList.contains('active') && document.getElementById('triggeredTime').textContent === time) return;

    document.getElementById('triggeredTime').textContent = time;
    overlay.classList.add('active');
    
    startBeeping();

    // Native Desktop Notification Integration
    if ("Notification" in window && Notification.permission === "granted") {
        new Notification(`🚨 Alarm Reminder`, {
            body: `Your scheduled alarm for ${time} is ringing right now!`,
            requireInteraction: true // Keeps notification on screen until dismissed
        });
    }

    // Flash tab header text 
    if(!titleFlashInterval) {
        let toggle = false;
        titleFlashInterval = setInterval(() => {
            document.title = toggle ? "⚠️ ALARM ACTIVE! ⚠️" : "⏰ " + time;
            toggle = !toggle;
        }, 500);
    }
}

function dismissAlarm() {
    document.getElementById('alarmOverlay').classList.remove('active');
    
    // Clean up intervals and alert audio
    clearInterval(alarmInterval);
    clearInterval(titleFlashInterval);
    titleFlashInterval = null;
    document.title = originalTitle;
    
    // Remove the triggered alarm automatically so it won't keep firing during this exact minute
    const activeTime = document.getElementById('triggeredTime').textContent;
    deleteAlarm(activeTime);
}