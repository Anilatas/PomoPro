// --- 1. VARIABLES AND STORAGE ---
let timeLeft = 25 * 60;
let isRunning = false;
let timerWorker = new Worker('worker.js');
let currentMode = 'work';

let profiles = JSON.parse(localStorage.getItem('pomo_profiles')) || { varsayilan: { work: 25, short: 5, long: 15, pinned: false } };
let history = JSON.parse(localStorage.getItem('pomo_history')) || [];
let profileNotes = JSON.parse(localStorage.getItem('pomo_profile_notes')) || {};
let todoList = JSON.parse(localStorage.getItem('pomo_todo_list')) || [];
let activeProfile = 'varsayilan';

Object.values(profiles).forEach(profile => {
    profile.work = profile.work || 25;
    profile.short = profile.short || 5;
    profile.long = profile.long || 15;
    profile.pinned = profile.pinned || false;
});

const alarmAudio = new Audio('zil.mp3');
let audioUnlocked = false;
let overtime = false;
let alarmTimeout = null;
alarmAudio.volume = 0.8;
alarmAudio.preload = 'auto';

function unlockAlarmAudio() {
    if (audioUnlocked) return;
    audioUnlocked = true;
    alarmAudio.muted = true;
    alarmAudio.play().then(() => {
        alarmAudio.pause();
        alarmAudio.currentTime = 0;
        alarmAudio.muted = false;
    }).catch(() => {
        alarmAudio.muted = false;
    });
}

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').then(() => console.log('PWA Kaydi Basarili'));
}

window.toggleTodo = function() {
    const panel = document.getElementById('todoPanel');
    if (panel) panel.classList.toggle('hidden');
};

function saveTodo() {
    localStorage.setItem('pomo_todo_list', JSON.stringify(todoList));
}

function renderTodo() {
    const list = document.getElementById('todoList');
    if (!list) return;
    list.innerHTML = '';
    todoList.forEach(item => {
        const div = document.createElement('div');
        div.className = 'todo-item';

        const left = document.createElement('div');
        left.className = 'todo-item-left';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = item.done;
        checkbox.addEventListener('change', () => {
            item.done = checkbox.checked;
            saveTodo();
            renderTodo();
        });

        const text = document.createElement('span');
        text.className = 'todo-text';
        text.textContent = item.text;
        if (item.done) text.style.textDecoration = 'line-through';

        left.appendChild(checkbox);
        left.appendChild(text);

        const remove = document.createElement('button');
        remove.className = 'todo-remove';
        remove.textContent = 'Sil';
        remove.addEventListener('click', () => {
            todoList = todoList.filter(i => i.id !== item.id);
            saveTodo();
            renderTodo();
        });

        div.appendChild(left);
        div.appendChild(remove);
        list.appendChild(div);
    });
}

function addTodo() {
    const input = document.getElementById('todoInput');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    todoList.push({ id: Date.now(), text, done: false });
    input.value = '';
    saveTodo();
    renderTodo();
}

function clearTodo() {
    if (confirm('Tum yapilacaklar silinsin mi?')) {
        todoList = [];
        saveTodo();
        renderTodo();
    }
}

function notifySessionComplete() {
    playAlarm();
    setTimeout(() => alert('Oturum Tamamlandi!'), 20);
}

window.updateAudioVolumes = function() {
    const alarmVol = document.getElementById('alarmVol');
    if (alarmVol) alarmAudio.volume = parseFloat(alarmVol.value);
};

function playAlarm() {
    if (!alarmAudio) return;
    alarmAudio.currentTime = 0;
    const p = alarmAudio.play();
    // Ensure previous timeout cleared
    if (alarmTimeout) clearTimeout(alarmTimeout);
    if (p && typeof p.then === 'function') {
        p.then(() => {
            alarmTimeout = setTimeout(() => {
                try { alarmAudio.pause(); alarmAudio.currentTime = 0; } catch (e) {}
            }, 5000);
        }).catch(() => {});
    } else {
        alarmTimeout = setTimeout(() => {
            try { alarmAudio.pause(); alarmAudio.currentTime = 0; } catch (e) {}
        }, 5000);
    }
}

function toggleNotes() {
    document.getElementById('statsPanel').classList.add('hidden');
    document.getElementById('notesPanel').classList.toggle('hidden');
}

function toggleStats() {
    document.getElementById('notesPanel').classList.add('hidden');
    const panel = document.getElementById('statsPanel');
    const btn = document.getElementById('toggleStatsBtn');
    if (!panel || !btn) return;

    const opening = panel.classList.contains('hidden');
    if (!opening) {
        panel.classList.add('hidden');
        return;
    }

    // Prepare panel for absolute positioning and render content
    panel.classList.remove('hidden');
    panel.style.position = 'absolute';
    panel.style.zIndex = '2000';
    panel.style.left = '';
    panel.style.top = '';

    renderStats();

    // Position under the button (slight gap) and keep within viewport
    requestAnimationFrame(() => {
        const rect = btn.getBoundingClientRect();
        const panelRect = panel.getBoundingClientRect();
        let left = rect.left + window.scrollX;
        const gap = 6;

        if (left + panelRect.width > window.innerWidth - 8) {
            left = window.innerWidth - panelRect.width - 8 + window.scrollX;
        }
        if (left < 8) left = 8 + window.scrollX;

        panel.style.left = `${left}px`;
        panel.style.top = `${rect.bottom + gap + window.scrollY}px`;
    });
}

function renderStats() {
    const list = document.getElementById('statsList');
    const summary = document.getElementById('statsSummary');
    if (!list || !summary) return;
    list.innerHTML = history.length === 0 ? '<div style="color:#64748b; font-size:0.8rem;">Henuz kayit yok.</div>' : '';
    history.slice().reverse().slice(0, 10).forEach(item => {
        const div = document.createElement('div');
        div.className = 'stat-item';
        div.innerHTML = `<span class="stat-date">${item.date}</span> <span class="stat-mode">${item.profile}</span>: ${item.duration} dk`;
        list.appendChild(div);
    });

    const totals = history.reduce((acc, item) => {
        const duration = parseInt(item.duration, 10) || 0;
        acc[item.profile] = (acc[item.profile] || 0) + duration;
        acc.total += duration;
        return acc;
    }, { total: 0 });

    if (history.length === 0) {
        summary.innerHTML = '<div style="color:#64748b; font-size:0.8rem;">Toplam kayit yok.</div>';
    } else {
        const rows = Object.keys(totals)
            .filter(key => key !== 'total')
            .sort((a, b) => totals[b] - totals[a])
            .map(key => `<div class="summary-row"><strong>${key}:</strong> ${totals[key]} dk</div>`)
            .join('');
        summary.innerHTML = `<div class="summary-title">Mod Bazlı Toplam Odak Süreleri</div>${rows}<div class="summary-total"><strong>Genel Toplam:</strong> ${totals.total} dk</div>`;
    }
}

function clearStats() {
    if (confirm('Tum gecmis silinsin mi?')) {
        history = [];
        localStorage.setItem('pomo_history', JSON.stringify(history));
        renderStats();
    }
}

function loadProfile() {
    const active = activeProfile;
    const s = profiles[active] || profiles.varsayilan;
    document.getElementById('workTime').value = s.work;
    document.getElementById('shortBreak').value = s.short;
    document.getElementById('longBreak').value = s.long;
    const textarea = document.getElementById('workarea') || document.getElementById('workNotes');
    if (textarea) {
        textarea.value = profileNotes[active] || '';
    }
    updatePinButton();
    if (!isRunning && !overtime) {
        setTimer(currentMode);
    }
}

function saveProfileSettings() {
    const active = activeProfile;
    // Clamp manual inputs to non-negative values
    let w = parseInt(document.getElementById('workTime').value, 10);
    let s = parseInt(document.getElementById('shortBreak').value, 10);
    let l = parseInt(document.getElementById('longBreak').value, 10);
    if (isNaN(w)) w = 25; else w = Math.max(0, w);
    if (isNaN(s)) s = 5; else s = Math.max(0, s);
    if (isNaN(l)) l = 15; else l = Math.max(0, l);

    profiles[active] = {
        work: w,
        short: s,
        long: l,
        pinned: profiles[active]?.pinned || false
    };
    localStorage.setItem('pomo_profiles', JSON.stringify(profiles));
    renderProfileList();
    if (!isRunning && !overtime) {
        setTimer(currentMode);
    }
}

function createNewProfile() {
    let name = prompt('Yeni mod adi (Orn: Kimya):')?.trim();
    if (!name) return;
    if (profiles[name]) {
        alert('Bu mod zaten mevcut.');
        return;
    }
    profiles[name] = { work: 25, short: 5, long: 15, pinned: false };
    localStorage.setItem('pomo_profiles', JSON.stringify(profiles));
    activeProfile = name;
    renderProfileList();
    selectProfile(name);
}

function deleteProfile(name) {
    if (!profiles[name]) return;
    if (!confirm(`"${name}" modunu silmek istiyor musunuz?`)) return;

    delete profiles[name];
    const keys = Object.keys(profiles);
    if (keys.length === 0) {
        profiles.varsayilan = { work: 25, short: 5, long: 15, pinned: false };
        activeProfile = 'varsayilan';
    } else if (activeProfile === name) {
        activeProfile = keys[0];
    }
    localStorage.setItem('pomo_profiles', JSON.stringify(profiles));
    renderProfileList();
    loadProfile();
}

function togglePinProfile(name) {
    if (!profiles[name]) return;
    profiles[name].pinned = !profiles[name].pinned;
    localStorage.setItem('pomo_profiles', JSON.stringify(profiles));
    renderProfileList();
}

function updatePinButton() {
    const pinButton = document.getElementById('togglePinBtn');
    if (!pinButton) return;
    pinButton.textContent = profiles[activeProfile]?.pinned ? '★' : '☆';
}

function renderProfileList() {
    const select = document.getElementById('activeProfile');
    if (!select) return;

    if (!profiles[activeProfile]) {
        const keys = Object.keys(profiles);
        activeProfile = keys[0] || 'varsayilan';
    }

    select.innerHTML = '';
    Object.keys(profiles)
        .sort((a, b) => {
            const pa = profiles[a].pinned ? 0 : 1;
            const pb = profiles[b].pinned ? 0 : 1;
            if (pa !== pb) return pa - pb;
            return a.localeCompare(b, 'tr', { sensitivity: 'base' });
        })
        .forEach(name => {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = profiles[name].pinned ? `${name} ★` : name;
            select.appendChild(opt);
        });

    select.value = activeProfile;
    updatePinButton();
}

function selectProfile(name) {
    if (!profiles[name]) return;
    activeProfile = name;
    renderProfileList();
    loadProfile();
}

function selectProfile(name) {
    if (!profiles[name]) return;
    activeProfile = name;
    renderProfileList();
    loadProfile();
}

window.setTimer = function(mode) {
    if (currentMode !== mode || overtime) {
        timerWorker.postMessage({ action: 'stop' });
        isRunning = false;
        overtime = false;
        document.getElementById('start').textContent = 'Baslat';
    }
    currentMode = mode;
    const id = mode === 'work' ? 'workTime' : mode === 'short' ? 'shortBreak' : 'longBreak';
    // Prefer stored profile value to avoid DOM race when switching profiles/modes
    let minutes;
    const prof = profiles[activeProfile];
    if (prof && typeof prof[mode] === 'number') {
        minutes = prof[mode];
    } else {
        minutes = parseInt(document.getElementById(id).value, 10);
        if (isNaN(minutes) || minutes < 0) minutes = 0;
    }
    timeLeft = Math.max(0, minutes) * 60;
    updateDisplay();
};

function updateDisplay() {
    const absTime = Math.abs(timeLeft);
    const m = Math.floor(absTime / 60);
    const s = absTime % 60;
    const sign = timeLeft < 0 ? '-' : '';
    const timeString = `${sign}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    document.getElementById('timer').textContent = timeString;
    document.title = `${timeString} - Pomodoro`;
}

function syncCurrentModeInput() {
    const inputId = currentMode === 'work' ? 'workTime' : currentMode === 'short' ? 'shortBreak' : 'longBreak';
    const inputField = document.getElementById(inputId);
    if (inputField) {
        // Keep input in sync with either current timeLeft or stored profile value
        const prof = profiles[activeProfile];
        if (prof && typeof prof[currentMode] === 'number') {
            inputField.value = prof[currentMode];
        } else {
            inputField.value = Math.max(0, Math.ceil(timeLeft / 60));
        }
    }
}

function addExtra(mins) {
    timeLeft += mins * 60;
    syncCurrentModeInput();
    if (isRunning) {
        timerWorker.postMessage({ action: 'addTime', amount: mins * 60 });
    }
    updateDisplay();
}

window.addExtra = addExtra;
window.addExtraTime = addExtra;

document.getElementById('start').onclick = () => {
    if (!isRunning) {
        unlockAlarmAudio();
        timerWorker.postMessage({ action: 'start', time: timeLeft });
        isRunning = true;
        document.getElementById('start').textContent = 'Durdur';
    } else {
        timerWorker.postMessage({ action: 'stop' });
        isRunning = false;
        document.getElementById('start').textContent = 'Baslat';
    }
};

document.getElementById('reset').onclick = () => {
    timerWorker.postMessage({ action: 'stop' });
    isRunning = false;
    overtime = false;
    document.getElementById('start').textContent = 'Baslat';
    setTimer(currentMode);
};

timerWorker.onmessage = (e) => {
    if (e.data.action === 'tick') {
        timeLeft = e.data.timeLeft;
        updateDisplay();
    }
    if (e.data.action === 'expired') {
        if (!overtime) {
            overtime = true;
            // Kaydı tüm modlar için ekle (work, short, long)
            const now = new Date();
            const id = currentMode === 'work' ? 'workTime' : currentMode === 'short' ? 'shortBreak' : 'longBreak';
            const duration = document.getElementById(id) ? document.getElementById(id).value : '';
            history.push({
                date: `${now.getDate()}/${now.getMonth() + 1} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
                profile: activeProfile,
                mode: currentMode,
                duration: duration
            });
            localStorage.setItem('pomo_history', JSON.stringify(history));
            notifySessionComplete();
            renderStats();
        }
    }
};

window.addEventListener('DOMContentLoaded', () => {
    renderProfileList();
    loadProfile();
    renderStats();
    updateAudioVolumes();
    renderTodo();

    const alarmVol = document.getElementById('alarmVol');
    if (alarmVol) alarmVol.oninput = updateAudioVolumes;

    const workTime = document.getElementById('workTime');
    const shortBreak = document.getElementById('shortBreak');
    const longBreak = document.getElementById('longBreak');
    [workTime, shortBreak, longBreak].forEach(input => {
        if (input) input.oninput = saveProfileSettings;
    });

    const todoInput = document.getElementById('todoInput');
    if (todoInput) {
        todoInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                addTodo();
            }
        });
    }
});

const noteArea = document.getElementById('workarea') || document.getElementById('workNotes');
if (noteArea) {
    noteArea.oninput = (e) => {
        profileNotes[activeProfile] = e.target.value;
        localStorage.setItem('pomo_profile_notes', JSON.stringify(profileNotes));
    };
}
