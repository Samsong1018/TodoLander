/* ============================================
   TODOLANDER — Main Application Logic
   (Frontend prototype — dark/light mode functional,
    all other settings are UI-only placeholders)
   ============================================ */

// ── App State ──
let tasks        = {};
let appSettings  = {};
let selectedDate = todayStr();
let calYear      = new Date().getFullYear();
let calMonth     = new Date().getMonth();
let activeColorFilter = null;
let searchQuery       = '';
let selectedAddColor  = null;

// ══════════════════════════════════════════
// INIT
// ══════════════════════════════════════════

function init() {
  const user = getUser();
  if (!user) { window.location.href = 'login.html'; return; }

  // Load settings & apply theme (the only functional setting right now)
  appSettings = loadSettings();
  applySettings(appSettings);

  // Load tasks / mock data
  tasks = loadTasks();
  if (Object.keys(tasks).length === 0) {
    loadMockData();
  } else {
    renderAll();
  }

  // Populate account info in settings modal
  const emailEl = document.getElementById('settingsUserEmail');
  const nameEl  = document.getElementById('settingsUserName');
  if (emailEl) emailEl.textContent = user.email;
  if (nameEl)  nameEl.textContent  = user.name || user.email.split('@')[0];

  setupEventListeners();
}

function loadMockData() {
  fetch('data/mock-data.json')
    .then(r => r.json())
    .then(data => {
      tasks = mergeImportedTasks(tasks, importJSON(JSON.stringify(data)));
      saveTasks(tasks);
      renderAll();
    })
    .catch(() => renderAll());
}

function renderAll() {
  renderCalendar();
  renderTasks();
  renderProgress();
}

// ══════════════════════════════════════════
// SETTINGS — only theme is functional
// ══════════════════════════════════════════

function updateSetting(key, value) {
  appSettings[key] = value;
  saveSettings(appSettings);

  if (key === 'theme') {
    // This is the one setting that actually does something
    applySettings(appSettings);
  }
  // All other settings are UI-only placeholders for now
}

// Sync toggle states to match current appSettings when modal opens
function syncSettingsUI() {
  const checks = {
    settingLightMode:          appSettings.theme === 'light',
    settingCompact:            appSettings.compact,
    settingWeekMonday:         appSettings.weekStartsMonday,
    settingShowCompleted:      appSettings.showCompleted,
    settingCompletedBottom:    appSettings.completedAtBottom,
    settingMorningReminder:    appSettings.morningReminder,
    settingAfternoonReminder:  appSettings.afternoonReminder,
    settingOverdueAlert:       appSettings.overdueAlert,
  };
  for (const [id, checked] of Object.entries(checks)) {
    const el = document.getElementById(id);
    if (el) el.checked = checked;
  }
  const morningEl   = document.getElementById('settingReminderTime');
  const afternoonEl = document.getElementById('settingAfternoonTime');
  if (morningEl)   morningEl.value   = appSettings.reminderTime   || '08:00';
  if (afternoonEl) afternoonEl.value = appSettings.afternoonTime  || '20:00';

  toggleReminderTimeRow(appSettings.morningReminder);
  toggleAfternoonTimeRow(appSettings.afternoonReminder);
}

function toggleReminderTimeRow(show) {
  const row = document.getElementById('reminderTimeRow');
  if (row) row.style.display = show ? 'flex' : 'none';
}

function toggleAfternoonTimeRow(show) {
  const row = document.getElementById('afternoonTimeRow');
  if (row) row.style.display = show ? 'flex' : 'none';
}

// Dismiss overdue alert bar (purely visual)
function dismissOverdueAlert() {
  document.getElementById('overdueAlertBar')?.classList.add('hidden');
}

// ══════════════════════════════════════════
// CALENDAR
// ══════════════════════════════════════════

function renderCalendar() {
  const grid = document.getElementById('calGrid');
  if (!grid) return;

  document.getElementById('calMonthLabel').textContent =
    `${MONTH_NAMES[calMonth]} ${calYear}`;

  const daysInMonth = getDaysInMonth(calYear, calMonth);
  const rawFirst    = getFirstDayOfMonth(calYear, calMonth); // 0=Sun
  // Respect weekStartsMonday setting for display (UI-only for now)
  const weekMon     = appSettings.weekStartsMonday;
  const firstDay    = weekMon ? (rawFirst + 6) % 7 : rawFirst;
  const orderedAbbr = weekMon
    ? ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
    : ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  const prevDays = getDaysInMonth(calYear, calMonth === 0 ? 11 : calMonth - 1);
  let html = '';

  orderedAbbr.forEach(d => { html += `<div class="cal-dow">${d}</div>`; });

  // Leading prev-month cells
  for (let i = 0; i < firstDay; i++) {
    const day     = prevDays - firstDay + 1 + i;
    const prevM   = calMonth === 0 ? 11 : calMonth - 1;
    const prevY   = calMonth === 0 ? calYear - 1 : calYear;
    html += renderCalDay(formatDate(new Date(prevY, prevM, day)), day, true);
  }

  // Current month
  for (let d = 1; d <= daysInMonth; d++) {
    html += renderCalDay(formatDate(new Date(calYear, calMonth, d)), d, false);
  }

  // Trailing cells
  const totalCells = firstDay + daysInMonth;
  const trailing   = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
  for (let i = 1; i <= trailing; i++) {
    const nextM = calMonth === 11 ? 0 : calMonth + 1;
    const nextY = calMonth === 11 ? calYear + 1 : calYear;
    html += renderCalDay(formatDate(new Date(nextY, nextM, i)), i, true);
  }

  grid.innerHTML = html;
}

function renderCalDay(dateStr, dayNum, otherMonth) {
  const taskList = tasks[dateStr] || [];
  const filtered = activeColorFilter
    ? taskList.filter(t => t.color === activeColorFilter)
    : taskList;

  const isToday    = dateStr === todayStr();
  const isSelected = dateStr === selectedDate;
  const classes    = ['cal-day',
    otherMonth  ? 'other-month' : '',
    isToday     ? 'today'       : '',
    isSelected  ? 'selected'    : '',
  ].filter(Boolean).join(' ');

  const colors   = [...new Set(filtered.slice(0,6).map(t => t.color || 'var(--text-muted)'))].slice(0,4);
  const dots     = colors.map(c => `<span class="cal-dot" style="background:${c}"></span>`).join('');
  const dotsHtml = filtered.length > 0
    ? `<div class="cal-day-dots">${dots}${filtered.length > 4 ? `<span class="cal-dot" style="background:var(--text-muted)"></span>` : ''}</div>`
    : '<div class="cal-day-dots"></div>';

  return `<div class="${classes}" onclick="selectDay('${dateStr}')">
    <div class="cal-day-num">${dayNum}</div>
    ${dotsHtml}
  </div>`;
}

function selectDay(dateStr) {
  selectedDate = dateStr;
  renderCalendar();
  renderTasks();
  renderProgress();
  updateDayHeader();
}

function goToToday() {
  const now = new Date();
  calYear = now.getFullYear(); calMonth = now.getMonth();
  selectedDate = todayStr();
  renderAll();
}

function prevMonth() {
  if (calMonth === 0) { calMonth = 11; calYear--; } else calMonth--;
  renderCalendar();
}

function nextMonth() {
  if (calMonth === 11) { calMonth = 0; calYear++; } else calMonth++;
  renderCalendar();
}

// ── Day Header ──

function updateDayHeader() {
  const weekday = document.getElementById('dayWeekday');
  const date    = document.getElementById('dayDate');
  if (weekday) weekday.textContent = formatDayName(selectedDate);
  if (date)    date.textContent    = formatDisplayDate(selectedDate);
}

// ══════════════════════════════════════════
// TASKS
// ══════════════════════════════════════════

function renderTasks() {
  const container = document.getElementById('tasksScroll');
  if (!container) return;

  updateDayHeader();

  let list = getTasks(tasks, selectedDate);

  // UI-only setting previews (read from appSettings for visual consistency)
  if (!appSettings.showCompleted) {
    list = list.filter(t => !t.done);
  }
  if (appSettings.showCompleted && appSettings.completedAtBottom) {
    list = [...list.filter(t => !t.done), ...list.filter(t => t.done)];
  }
  if (activeColorFilter) list = list.filter(t => t.color === activeColorFilter);
  if (searchQuery)       list = list.filter(t => t.text.toLowerCase().includes(searchQuery.toLowerCase()));

  if (list.length === 0) {
    container.innerHTML = `
      <div class="tasks-empty">
        <div class="tasks-empty-icon">📋</div>
        <p>${searchQuery ? 'No matching tasks.' : 'No tasks for this day.'}</p>
        <p style="font-size:0.8rem;opacity:0.7">Add a task below!</p>
      </div>`;
    return;
  }

  const allList = getTasks(tasks, selectedDate);
  container.innerHTML = list.map(task => {
    const origIndex = allList.findIndex(t => t.text === task.text && t.color === task.color);
    return renderTaskItem(task, origIndex);
  }).join('');
}

function renderTaskItem(task, index) {
  const colorBar    = task.color
    ? `<div class="task-color-bar" style="background:${task.color}"></div>`
    : `<div class="task-color-bar" style="background:transparent"></div>`;
  const repeatBadge = (task.repeat && task.repeat !== 'none')
    ? `<span class="task-repeat-badge">${task.repeat}</span>`
    : '';
  return `
    <div class="task-item ${task.done ? 'done' : ''}" data-index="${index}">
      <label class="neu-checkbox" title="Mark as done">
        <input type="checkbox" ${task.done ? 'checked' : ''} onchange="toggleTask(${index})">
        <span class="neu-checkbox-box"></span>
      </label>
      ${colorBar}
      <span class="task-text" ondblclick="startEditTask(${index}, this)">${escapeHtml(task.text)}</span>
      ${repeatBadge}
      <div class="task-meta"></div>
      <div class="task-actions">
        <button class="task-action-btn" onclick="startEditTask(${index})" title="Edit">✏️</button>
        <button class="task-action-btn delete" onclick="removeTask(${index})" title="Delete">🗑️</button>
      </div>
    </div>`;
}

function escapeHtml(str) {
  return str
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

function toggleTask(index) {
  const list = getTasks(tasks, selectedDate);
  if (!list[index]) return;
  tasks = updateTask(tasks, selectedDate, index, { done: !list[index].done });
  saveTasks(tasks);
  renderAll();
}

function removeTask(index) {
  tasks = deleteTask(tasks, selectedDate, index);
  saveTasks(tasks);
  renderAll();
  showToast('Task removed.', 'var(--c-red)');
}

function startEditTask(index, textEl) {
  const list = getTasks(tasks, selectedDate);
  const task = list[index];
  if (!task) return;

  if (!textEl) textEl = document.querySelector(`.task-item[data-index="${index}"] .task-text`);
  if (!textEl) return;

  const original = task.text;
  const input    = document.createElement('input');
  input.className = 'task-text-input';
  input.value = original;
  textEl.replaceWith(input);
  input.focus(); input.select();

  const save = () => {
    const newText = input.value.trim();
    if (newText && newText !== original) {
      tasks = updateTask(tasks, selectedDate, index, { text: newText });
      saveTasks(tasks);
    }
    renderTasks();
  };
  input.addEventListener('blur', save);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter')  input.blur();
    if (e.key === 'Escape') { input.value = original; input.blur(); }
  });
}

// ── Add Task ──

function addNewTask() {
  const input    = document.getElementById('addTaskInput');
  const repeatEl = document.getElementById('addRepeat');
  if (!input) return;

  const text = input.value.trim();
  if (!text) {
    input.focus();
    input.classList.add('shake');
    setTimeout(() => input.classList.remove('shake'), 400);
    return;
  }

  tasks = addTaskWithRepeat(tasks, selectedDate, {
    text, done: false, color: selectedAddColor,
    repeat: repeatEl ? repeatEl.value : 'none',
  });
  saveTasks(tasks);

  input.value = '';
  if (repeatEl) repeatEl.value = 'none';
  selectedAddColor = null;
  document.querySelectorAll('.add-color-swatch').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.add-color-none').forEach(s => s.classList.add('active'));

  renderAll();
  showToast('Task added!', 'var(--c-green)');
}

function selectAddColor(color, el) {
  selectedAddColor = color;
  document.querySelectorAll('.add-color-swatch, .add-color-none').forEach(s => s.classList.remove('active'));
  el.classList.add('active');
}

function clearAddColor(el) {
  selectedAddColor = null;
  document.querySelectorAll('.add-color-swatch, .add-color-none').forEach(s => s.classList.remove('active'));
  el.classList.add('active');
}

// ── Progress ──

function renderProgress() {
  const allList = getTasks(tasks, selectedDate);
  const total   = allList.length;
  const done    = allList.filter(t => t.done).length;
  const pct     = total === 0 ? 0 : Math.round((done / total) * 100);

  const fill  = document.getElementById('progressFill');
  const label = document.getElementById('progressLabel');
  if (fill)  fill.style.width = `${pct}%`;
  if (label) label.textContent = total === 0 ? 'No tasks' : `${done}/${total} tasks (${pct}%)`;
}

// ── Color Filter ──

function setColorFilter(color, el) {
  if (activeColorFilter === color) {
    activeColorFilter = null;
    el.classList.remove('active');
  } else {
    activeColorFilter = color;
    document.querySelectorAll('.filter-swatch').forEach(s => s.classList.remove('active'));
    el.classList.add('active');
  }
  const bar = document.getElementById('filterActiveBar');
  if (bar) {
    if (activeColorFilter) {
      bar.classList.add('visible');
      bar.innerHTML = `<span style="width:10px;height:10px;border-radius:50%;background:${activeColorFilter};display:inline-block;"></span> Filtering by ${COLOR_NAMES[activeColorFilter]} · <a href="#" onclick="clearColorFilter(event)" style="color:inherit;text-decoration:underline;">Clear</a>`;
    } else {
      bar.classList.remove('visible');
    }
  }
  renderAll();
}

function clearColorFilter(e) {
  if (e) e.preventDefault();
  activeColorFilter = null;
  document.querySelectorAll('.filter-swatch').forEach(s => s.classList.remove('active'));
  document.getElementById('filterActiveBar')?.classList.remove('visible');
  renderAll();
}

// ── Clear Done ──

function clearDone() {
  tasks = clearDoneTasks(tasks, selectedDate);
  saveTasks(tasks);
  renderAll();
  showToast('Completed tasks cleared.', 'var(--accent)');
}

// ── Delete All ──

function confirmDeleteAll() { openModal('confirmModal'); }

function executeDeleteAll() {
  tasks = deleteAllTasks();
  renderAll();
  closeModal('confirmModal');
  showToast('All tasks deleted.', 'var(--c-red)');
}

// ── Import ──

function importTasks() {
  triggerFileUpload('.json', (content, filename) => {
    try {
      const imported = importJSON(content);
      const count    = Object.values(imported).reduce((s, arr) => s + arr.length, 0);
      tasks = mergeImportedTasks(tasks, imported);
      saveTasks(tasks);
      renderAll();
      showToast(`Imported ${count} tasks from ${filename}`, 'var(--c-green)');
    } catch (err) {
      showToast(`Import failed: ${err.message}`, 'var(--c-red)');
    }
  });
}

// ── Export ──

function exportTasks(format) {
  closeModal('exportModal');
  if (format === 'json') {
    downloadFile(exportJSON(tasks), 'todolander-tasks.json', 'application/json');
    showToast('Exported as JSON.', 'var(--c-blue)');
  } else if (format === 'ical') {
    downloadFile(exportICal(tasks), 'todolander-tasks.ics', 'text/calendar');
    showToast('Exported as iCal.', 'var(--c-blue)');
  }
}

function openExportModal() { openModal('exportModal'); }

// ── Search ──

function handleSearch(val) {
  searchQuery = val.trim();
  const results = document.getElementById('searchResults');
  document.querySelector('.header-search')?.classList.toggle('has-value', searchQuery.length > 0);

  if (!searchQuery) {
    results?.classList.remove('open');
    renderTasks();
    return;
  }

  const matches = [];
  for (const [dateStr, list] of Object.entries(tasks)) {
    for (const task of list) {
      if (task.text.toLowerCase().includes(searchQuery.toLowerCase())) {
        matches.push({ dateStr, task });
        if (matches.length >= 20) break;
      }
    }
    if (matches.length >= 20) break;
  }

  if (results) {
    results.innerHTML = matches.length > 0
      ? matches.map(({ dateStr, task }) => `
          <div class="search-result-item" onclick="jumpToDate('${dateStr}')">
            <span class="search-result-dot" style="background:${task.color || 'var(--text-muted)'}"></span>
            <div>
              <div class="search-result-text">${highlightMatch(escapeHtml(task.text), searchQuery)}</div>
              <div class="search-result-date">${formatDisplayDate(dateStr)}</div>
            </div>
          </div>`).join('')
      : '<div class="search-result-item"><div class="search-result-text" style="color:var(--text-muted)">No results found.</div></div>';
    results.classList.add('open');
  }
  renderTasks();
}

function highlightMatch(text, query) {
  const re = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})`, 'gi');
  return text.replace(re, '<mark style="background:rgba(123,116,255,0.2);color:var(--accent);border-radius:2px;padding:0 2px">$1</mark>');
}

function clearSearch() {
  const input = document.getElementById('searchInput');
  if (input) input.value = '';
  handleSearch('');
}

function jumpToDate(dateStr) {
  const d = parseDate(dateStr);
  calYear = d.getFullYear(); calMonth = d.getMonth();
  selectedDate = dateStr;
  document.getElementById('searchResults')?.classList.remove('open');
  const input = document.getElementById('searchInput');
  if (input) input.value = '';
  searchQuery = '';
  renderAll();
}

// ══════════════════════════════════════════
// MODALS
// ══════════════════════════════════════════

function openModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  if (id === 'settingsModal') syncSettingsUI();
  modal.classList.add('open');
}

function closeModal(id) {
  document.getElementById(id)?.classList.remove('open');
}

document.addEventListener('click', e => {
  if (e.target.classList.contains('neu-modal-overlay')) {
    e.target.classList.remove('open');
  }
});

// ══════════════════════════════════════════
// TOAST
// ══════════════════════════════════════════

function showToast(message, color = 'var(--accent)') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `<span class="toast-dot" style="background:${color}"></span>${escapeHtml(message)}`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('removing');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
  }, 3000);
}

// ══════════════════════════════════════════
// EVENT LISTENERS
// ══════════════════════════════════════════

function setupEventListeners() {
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', e => handleSearch(e.target.value));
    searchInput.addEventListener('focus', e => { if (e.target.value) handleSearch(e.target.value); });
    document.addEventListener('click', e => {
      const results = document.getElementById('searchResults');
      if (results && !results.contains(e.target) && e.target !== searchInput) {
        results.classList.remove('open');
      }
    });
  }

  document.getElementById('addTaskInput')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') addNewTask();
  });

  const specEl = document.getElementById('jsonSpec');
  if (specEl) specEl.textContent = JSON_SPEC;
}

// ── Start ──
document.addEventListener('DOMContentLoaded', init);
