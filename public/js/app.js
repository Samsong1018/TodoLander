/* ============================================
   TODOLANDER — Main Application Logic
   ============================================ */

// ── App State ──
let todos          = {};     // { [dateStr]: [{ text, done, color, id }] }
let recurring      = [];     // [{ id, text, frequency, startDate, color }]
let recurringState = {};     // { [dateStr]: { [id]: { done, dismissed } } }
let appSettings    = {};
let selectedDate   = todayStr();
let calYear        = new Date().getFullYear();
let calMonth       = new Date().getMonth();
let activeColorFilter = null;
let searchQuery       = '';
let selectedAddColor  = null;

// ══════════════════════════════════════════
// INIT
// ══════════════════════════════════════════

async function init() {
  appSettings = loadSettings();
  applySettings(appSettings);

  const data = await loadFromBackend();
  if (!data) return; // redirected to login

  todos          = data.todos;
  recurring      = data.recurring;
  recurringState = data.recurringState;

  // Populate user info in settings modal
  try {
    const user = JSON.parse(localStorage.getItem('todolander_user') || 'null');
    if (user) {
      const emailEl = document.getElementById('settingsUserEmail');
      const nameEl  = document.getElementById('settingsUserName');
      if (emailEl) emailEl.textContent = user.email || '—';
      if (nameEl)  nameEl.textContent  = user.name  || user.email || '—';
    }
  } catch {}

  renderAll();
  setupEventListeners();
  initNotifications().catch(() => {});
}

function save() {
  saveToBackend(todos, recurring, recurringState);
}

function renderAll() {
  renderCalendar();
  renderTasks();
  renderProgress();
}

// ══════════════════════════════════════════
// SETTINGS
// ══════════════════════════════════════════

function updateSetting(key, value) {
  appSettings[key] = value;
  saveSettings(appSettings);
  if (key === 'theme') applySettings(appSettings);
  if (key === 'compact') applySettings(appSettings);
}

function syncSettingsUI() {
  const map = {
    settingLightMode:       appSettings.theme === 'light',
    settingCompact:         !!appSettings.compact,
    settingWeekMonday:      !!appSettings.weekStartsMonday,
    settingShowCompleted:   appSettings.showCompleted !== false,
    settingCompletedBottom: !!appSettings.completedAtBottom,
  };
  for (const [id, val] of Object.entries(map)) {
    const el = document.getElementById(id);
    if (el) el.checked = val;
  }
}

function dismissOverdueAlert() {
  document.getElementById('overdueAlertBar')?.classList.add('hidden');
}

// ══════════════════════════════════════════
// RECURRING HELPERS
// ══════════════════════════════════════════

function doesRecurOn(task, dateStr) {
  const [ty, tm, td] = task.startDate.split('-').map(Number);
  const [dy, dm, dd] = dateStr.split('-').map(Number);
  const start = new Date(ty, tm - 1, td);
  const date  = new Date(dy, dm - 1, dd);
  if (date < start) return false;
  if (task.frequency === 'daily')   return true;
  if (task.frequency === 'weekly')  return start.getDay() === date.getDay();
  if (task.frequency === 'monthly') return td === dd;
  return false;
}

function getApplicableRecurring(dateStr) {
  return recurring.filter(t => {
    if (!doesRecurOn(t, dateStr)) return false;
    const ds = recurringState[dateStr] || {};
    return !ds[t.id]?.dismissed;
  });
}

function hasTasks(dateStr) {
  if ((todos[dateStr] || []).length > 0) return true;
  return recurring.some(t => {
    if (!doesRecurOn(t, dateStr)) return false;
    const ds = recurringState[dateStr] || {};
    return !ds[t.id]?.dismissed;
  });
}

function hasTasksOfColor(dateStr, color) {
  if ((todos[dateStr] || []).some(t => (t.color ?? null) === color)) return true;
  return recurring.some(t => {
    if ((t.color ?? null) !== color) return false;
    if (!doesRecurOn(t, dateStr)) return false;
    const ds = recurringState[dateStr] || {};
    return !ds[t.id]?.dismissed;
  });
}

function hasPastIncomplete(dateStr) {
  const date = parseDate(dateStr);
  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);
  if (date >= todayMidnight) return false;
  if ((todos[dateStr] || []).some(t => !t.done)) return true;
  return recurring.some(t => {
    if (!doesRecurOn(t, dateStr)) return false;
    const ds = recurringState[dateStr] || {};
    if (ds[t.id]?.dismissed) return false;
    return !ds[t.id]?.done;
  });
}

// ══════════════════════════════════════════
// CALENDAR
// ══════════════════════════════════════════

function renderCalendar() {
  const grid = document.getElementById('calGrid');
  if (!grid) return;

  document.getElementById('calMonthLabel').textContent = `${MONTH_NAMES[calMonth]} ${calYear}`;

  const daysInMonth = getDaysInMonth(calYear, calMonth);
  const rawFirst    = getFirstDayOfMonth(calYear, calMonth);
  const weekMon     = appSettings.weekStartsMonday;
  const firstDay    = weekMon ? (rawFirst + 6) % 7 : rawFirst;
  const orderedAbbr = weekMon
    ? ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
    : ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  const prevMonthDays = getDaysInMonth(calYear, calMonth === 0 ? 11 : calMonth - 1);
  let html = '';
  orderedAbbr.forEach(d => { html += `<div class="cal-dow">${d}</div>`; });

  // Leading cells
  for (let i = 0; i < firstDay; i++) {
    const day  = prevMonthDays - firstDay + 1 + i;
    const prevM = calMonth === 0 ? 11 : calMonth - 1;
    const prevY = calMonth === 0 ? calYear - 1 : calYear;
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
  const filtered = activeColorFilter
    ? hasTasksOfColor(dateStr, activeColorFilter)
    : hasTasks(dateStr);
  const isOverdue  = hasPastIncomplete(dateStr);
  const isToday    = dateStr === todayStr();
  const isSelected = dateStr === selectedDate;

  const classes = ['cal-day',
    otherMonth  ? 'other-month' : '',
    isToday     ? 'today'       : '',
    isSelected  ? 'selected'    : '',
    isOverdue && !otherMonth ? 'overdue' : '',
  ].filter(Boolean).join(' ');

  const taskList = activeColorFilter
    ? (todos[dateStr] || []).filter(t => (t.color ?? null) === activeColorFilter)
    : (todos[dateStr] || []);
  const colors = [...new Set(taskList.slice(0, 6).map(t => t.color || 'var(--text-muted)'))].slice(0, 4);
  const dots   = colors.map(c => `<span class="cal-dot" style="background:${c}"></span>`).join('');
  const dotsHtml = filtered
    ? `<div class="cal-day-dots">${dots}</div>`
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

// ══════════════════════════════════════════
// TASKS
// ══════════════════════════════════════════

function updateDayHeader() {
  const weekday = document.getElementById('dayWeekday');
  const date    = document.getElementById('dayDate');
  if (weekday) weekday.textContent = formatDayName(selectedDate);
  if (date)    date.textContent    = formatDisplayDate(selectedDate);
}

function renderTasks() {
  const container = document.getElementById('tasksScroll');
  if (!container) return;
  updateDayHeader();

  const showCompleted = appSettings.showCompleted !== false;
  const doneToBottom  = !!appSettings.completedAtBottom;

  let dayTodos  = (todos[selectedDate] || []).slice();
  let dayRecur  = getApplicableRecurring(selectedDate);

  if (activeColorFilter !== null) {
    dayTodos = dayTodos.filter(t => (t.color ?? null) === activeColorFilter);
    dayRecur = dayRecur.filter(t => (t.color ?? null) === activeColorFilter);
  }

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    dayTodos = dayTodos.filter(t => t.text.toLowerCase().includes(q));
    dayRecur = dayRecur.filter(t => t.text.toLowerCase().includes(q));
  }

  if (doneToBottom) {
    dayTodos = [...dayTodos.filter(t => !t.done), ...dayTodos.filter(t => t.done)];
    dayRecur = [...dayRecur.filter(t => !(recurringState[selectedDate]?.[t.id]?.done)),
                ...dayRecur.filter(t =>  (recurringState[selectedDate]?.[t.id]?.done))];
  }

  const allTodos = todos[selectedDate] || [];
  const allRecur = getApplicableRecurring(selectedDate);
  const total = allTodos.length + allRecur.length;

  if (total === 0) {
    container.innerHTML = `
      <div class="tasks-empty">
        <div class="tasks-empty-icon">📋</div>
        <p>${searchQuery ? 'No matching tasks.' : 'No tasks for this day.'}</p>
        <p style="font-size:0.8rem;opacity:0.7">Add a task above!</p>
      </div>`;
    return;
  }

  let html = '';
  dayTodos.forEach(todo => {
    const origIdx = allTodos.findIndex(t => t.id === todo.id);
    if (showCompleted || !todo.done) {
      html += renderTodoItem(todo, origIdx);
    }
  });
  dayRecur.forEach(task => {
    const isDone = recurringState[selectedDate]?.[task.id]?.done;
    if (showCompleted || !isDone) {
      html += renderRecurItem(task, selectedDate);
    }
  });

  if (!html) {
    container.innerHTML = `<div class="tasks-empty"><div class="tasks-empty-icon">✅</div><p>All tasks complete.</p></div>`;
    return;
  }

  container.innerHTML = html;
}

function renderTodoItem(todo, idx) {
  const colorBar = `<div class="task-color-bar" style="background:${todo.color || 'transparent'}"></div>`;
  const checked  = todo.done ? 'checked' : '';
  return `
    <div class="task-item ${todo.done ? 'done' : ''}" data-id="${todo.id}" data-idx="${idx}">
      <label class="neu-checkbox" title="Mark as done">
        <input type="checkbox" ${checked} onchange="toggleTodo('${todo.id}')">
        <span class="neu-checkbox-box"></span>
      </label>
      ${colorBar}
      <span class="task-text" ondblclick="startEditTodo('${todo.id}', this)">${escapeHtml(todo.text)}</span>
      <div class="task-meta"></div>
      <div class="task-actions">
        <button class="task-action-btn" onclick="startEditTodo('${todo.id}')" title="Edit">✏️</button>
        <button class="task-action-btn delete" onclick="deleteTodo('${todo.id}')" title="Delete">🗑️</button>
      </div>
    </div>`;
}

function renderRecurItem(task, dateStr) {
  const isDone   = recurringState[dateStr]?.[task.id]?.done;
  const colorBar = `<div class="task-color-bar" style="background:${task.color || 'transparent'}"></div>`;
  const freqLabel = task.frequency === 'daily' ? 'Daily' : task.frequency === 'weekly' ? 'Weekly' : 'Monthly';
  return `
    <div class="task-item ${isDone ? 'done' : ''}" data-recur-id="${task.id}">
      <label class="neu-checkbox" title="Mark as done">
        <input type="checkbox" ${isDone ? 'checked' : ''} onchange="toggleRecurring('${task.id}', '${dateStr}')">
        <span class="neu-checkbox-box"></span>
      </label>
      ${colorBar}
      <span class="task-text">${escapeHtml(task.text)}</span>
      <span class="task-repeat-badge">${freqLabel}</span>
      <div class="task-meta"></div>
      <div class="task-actions">
        <button class="task-action-btn" onclick="showRecurDeleteOptions('${task.id}', '${dateStr}', this)" title="Delete">🗑️</button>
      </div>
    </div>`;
}

// ── Todo CRUD ──

function toggleTodo(id) {
  const list = todos[selectedDate];
  if (!list) return;
  const task = list.find(t => t.id == id);
  if (!task) return;
  task.done = !task.done;
  save();
  renderAll();
}

function deleteTodo(id) {
  if (!todos[selectedDate]) return;
  todos[selectedDate] = todos[selectedDate].filter(t => t.id != id);
  if (todos[selectedDate].length === 0) delete todos[selectedDate];
  save();
  renderAll();
  showToast('Task removed.', 'var(--c-red)');
}

function startEditTodo(id, textEl) {
  const list = todos[selectedDate];
  if (!list) return;
  const task = list.find(t => t.id == id);
  if (!task) return;

  if (!textEl) textEl = document.querySelector(`[data-id="${id}"] .task-text`);
  if (!textEl) return;

  const original = task.text;
  const input = document.createElement('input');
  input.className = 'task-text-input';
  input.value = original;
  textEl.replaceWith(input);
  input.focus(); input.select();

  const save_ = () => {
    const val = input.value.trim();
    if (val && val !== original) {
      task.text = val;
      save();
    }
    renderTasks();
  };
  input.addEventListener('blur', save_);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter')  input.blur();
    if (e.key === 'Escape') { input.value = original; input.blur(); }
  });
}

// ── Recurring CRUD ──

function toggleRecurring(id, dateStr) {
  if (!recurringState[dateStr]) recurringState[dateStr] = {};
  const cur = recurringState[dateStr][id] || {};
  recurringState[dateStr][id] = { ...cur, done: !cur.done };
  save();
  renderTasks();
  renderProgress();
}

function showRecurDeleteOptions(id, dateStr, btn) {
  const item = btn.closest('.task-item');
  const actionsDiv = item.querySelector('.task-actions');

  const confirm = document.createElement('div');
  confirm.className = 'recur-confirm-inline';
  confirm.innerHTML = `
    <span style="font-size:0.75rem;color:var(--text-muted);font-weight:700">Remove:</span>
    <button class="neu-btn" style="padding:4px 10px;font-size:0.72rem;border-radius:var(--r-sm)"
      onclick="dismissRecurring('${id}','${dateStr}')">Today only</button>
    <button class="neu-btn btn-danger" style="padding:4px 10px;font-size:0.72rem;border-radius:var(--r-sm)"
      onclick="deleteRecurring('${id}')">All</button>`;
  actionsDiv.replaceWith(confirm);
}

function dismissRecurring(id, dateStr) {
  if (!recurringState[dateStr]) recurringState[dateStr] = {};
  recurringState[dateStr][id] = { dismissed: true };
  save();
  renderAll();
}

function deleteRecurring(id) {
  recurring = recurring.filter(t => t.id !== id);
  for (const date of Object.keys(recurringState)) {
    if (recurringState[date][id]) delete recurringState[date][id];
  }
  save();
  renderAll();
}

// ── Add Task ──

function addNewTask() {
  const input    = document.getElementById('addTaskInput');
  const repeatEl = document.getElementById('addRepeat');
  if (!input) return;

  const text      = input.value.trim();
  const frequency = repeatEl ? repeatEl.value : 'none';

  if (!text) {
    input.focus();
    input.classList.add('shake');
    setTimeout(() => input.classList.remove('shake'), 400);
    return;
  }

  if (frequency && frequency !== 'none') {
    // Real recurring task
    recurring.push({
      id: String(Date.now()),
      text,
      frequency,
      startDate: selectedDate,
      color: selectedAddColor || null,
    });
  } else {
    // One-off todo
    if (!todos[selectedDate]) todos[selectedDate] = [];
    const existing = todos[selectedDate];
    if (existing.some(t => t.text.toLowerCase() === text.toLowerCase())) {
      showToast('Task already exists.', 'var(--c-yellow)');
      return;
    }
    existing.push({ text, done: false, color: selectedAddColor || null, id: Date.now() });
  }

  save();

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
  const allTodos = todos[selectedDate] || [];
  const allRecur = getApplicableRecurring(selectedDate);
  const total = allTodos.length + allRecur.length;
  const doneTodos = allTodos.filter(t => t.done).length;
  const doneRecur = allRecur.filter(t => recurringState[selectedDate]?.[t.id]?.done).length;
  const done = doneTodos + doneRecur;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);

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
      bar.innerHTML = `<span style="width:10px;height:10px;border-radius:50%;background:${activeColorFilter};display:inline-block"></span> Filtering by ${COLOR_NAMES[activeColorFilter] || activeColorFilter} · <a href="#" onclick="clearColorFilter(event)" style="color:inherit;text-decoration:underline">Clear</a>`;
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
  if (todos[selectedDate]) {
    todos[selectedDate] = todos[selectedDate].filter(t => !t.done);
    if (todos[selectedDate].length === 0) delete todos[selectedDate];
  }
  // Dismiss done recurring tasks for this day
  const ds = recurringState[selectedDate] || {};
  for (const id of Object.keys(ds)) {
    if (ds[id]?.done) ds[id] = { dismissed: true };
  }
  if (Object.keys(ds).length > 0) recurringState[selectedDate] = ds;
  save();
  renderAll();
  showToast('Completed tasks cleared.', 'var(--accent)');
}

// ── Delete All ──

function confirmDeleteAll() { openModal('confirmModal'); }

function executeDeleteAll() {
  if (activeColorFilter !== null) {
    // Delete only tasks matching the active color filter
    for (const key of Object.keys(todos)) {
      todos[key] = todos[key].filter(t => (t.color ?? null) !== activeColorFilter);
      if (todos[key].length === 0) delete todos[key];
    }
  } else {
    todos = {};
  }
  save();
  renderAll();
  closeModal('confirmModal');
  showToast('Tasks deleted.', 'var(--c-red)');
}

// ── Import ──

function importTasks() {
  triggerFileUpload('.json', (content, filename) => {
    try {
      const raw = JSON.parse(content);
      const imported = importJSONData(content);
      let count = 0;
      for (const [dateStr, list] of Object.entries(imported)) {
        if (!todos[dateStr]) todos[dateStr] = [];
        const existing = new Set(todos[dateStr].map(t => t.text.toLowerCase()));
        for (const task of list) {
          if (!existing.has(task.text.toLowerCase())) {
            todos[dateStr].push(task);
            existing.add(task.text.toLowerCase());
            count++;
          }
        }
      }
      save();
      renderAll();
      showToast(`Imported ${count} task${count !== 1 ? 's' : ''} from ${filename}`, 'var(--c-green)');
    } catch (err) {
      showToast(`Import failed: ${err.message}`, 'var(--c-red)');
    }
  });
}

// ── Export ──

function exportTasks(format) {
  closeModal('exportModal');
  const stamp = new Date().toISOString().slice(0, 10);
  if (format === 'json') {
    downloadFile(buildExportJSON(todos), `todolander-${stamp}.json`, 'application/json');
    showToast('Exported as JSON.', 'var(--c-blue)');
  } else if (format === 'ical') {
    downloadFile(buildExportICal(todos, recurring), `todolander-${stamp}.ics`, 'text/calendar');
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

  const q = searchQuery.toLowerCase();
  const matches = [];

  for (const [dateStr, list] of Object.entries(todos)) {
    for (const task of list) {
      if (task.text.toLowerCase().includes(q)) {
        matches.push({ dateStr, text: task.text, color: task.color });
        if (matches.length >= 20) break;
      }
    }
    if (matches.length >= 20) break;
  }

  // Also search recurring
  for (const task of recurring) {
    if (task.text.toLowerCase().includes(q) && matches.length < 20) {
      matches.push({ dateStr: task.startDate, text: task.text, color: task.color, isRecurring: true, frequency: task.frequency });
    }
  }

  if (results) {
    results.innerHTML = matches.length > 0
      ? matches.map(({ dateStr, text, color, isRecurring, frequency }) => {
          const badge = isRecurring ? `<span style="font-size:0.68rem;color:var(--accent);margin-left:4px">↻ ${frequency}</span>` : '';
          return `<div class="search-result-item" onclick="jumpToDate('${dateStr}')">
            <span class="search-result-dot" style="background:${color || 'var(--text-muted)'}"></span>
            <div>
              <div class="search-result-text">${highlightMatch(escapeHtml(text), searchQuery)}${badge}</div>
              <div class="search-result-date">${formatDisplayDate(dateStr)}</div>
            </div>
          </div>`;
        }).join('')
      : '<div class="search-result-item"><div class="search-result-text" style="color:var(--text-muted)">No results found.</div></div>';
    results.classList.add('open');
  }
  renderTasks();
}

function highlightMatch(text, query) {
  const re = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})`, 'gi');
  return text.replace(re, '<mark style="background:rgba(45,212,191,0.2);color:var(--accent);border-radius:2px;padding:0 2px">$1</mark>');
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
// PUSH NOTIFICATIONS
// ══════════════════════════════════════════

async function handleNotifToggle(type, enabled) {
  if (enabled) {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      showToast('Notification permission denied.', 'var(--c-red)');
      const toggleId = type === 'morning_digest' ? 'morningDigestToggle' : 'overdueAlertToggle';
      const el = document.getElementById(toggleId);
      if (el) el.checked = false;
      return;
    }
    try {
      await ensureSubscribed();
    } catch {
      showToast('Could not set up push notifications.', 'var(--c-red)');
      const toggleId = type === 'morning_digest' ? 'morningDigestToggle' : 'overdueAlertToggle';
      const el = document.getElementById(toggleId);
      if (el) el.checked = false;
      return;
    }
  }

  notifPrefs[type] = { ...notifPrefs[type], enabled };

  try {
    const anyEnabled = Object.values(notifPrefs).some(p => p?.enabled);
    if (!anyEnabled && pushSubscription) {
      await removeSubscriptionFromServer(pushSubscription.endpoint);
      await pushSubscription.unsubscribe();
      pushSubscription = null;
    }
    await saveNotifPrefs();
  } catch {
    showToast('Could not save notification settings.', 'var(--c-red)');
    return;
  }

  updateNotifUI();
}

async function saveNotifTime(type, time) {
  notifPrefs[type] = { ...notifPrefs[type], time };
  await saveNotifPrefs().catch(() => {});
}

function updateNotifUI() {
  const morningEnabled = notifPrefs.morning_digest?.enabled || false;
  const overdueEnabled = notifPrefs.overdue_alert?.enabled  || false;
  const morningToggle = document.getElementById('morningDigestToggle');
  const overdueToggle = document.getElementById('overdueAlertToggle');
  if (morningToggle) morningToggle.checked = morningEnabled;
  if (overdueToggle) overdueToggle.checked = overdueEnabled;
  const morningRow = document.getElementById('morningTimeRow');
  const overdueRow = document.getElementById('overdueTimeRow');
  if (morningRow) morningRow.style.display = morningEnabled ? 'flex' : 'none';
  if (overdueRow) overdueRow.style.display = overdueEnabled ? 'flex' : 'none';
  const morningTime = document.getElementById('morningTimeInput');
  const overdueTime = document.getElementById('overdueTimeInput');
  if (morningTime) morningTime.value = notifPrefs.morning_digest?.time || '08:00';
  if (overdueTime) overdueTime.value = notifPrefs.overdue_alert?.time  || '18:00';
}

async function initNotifications() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  try {
    await navigator.serviceWorker.register('/sw.js');
  } catch {
    return;
  }
  document.getElementById('notifSection')?.style && (document.getElementById('notifSection').style.display = 'block');
  try {
    await loadNotifPrefs();
  } catch {}
  updateNotifUI();
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
