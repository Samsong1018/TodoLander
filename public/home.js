// ── State ──────────────────────────────────────────────
const API_BASE = 'https://dailytodo-api.onrender.com';
const TOKEN_KEY = 'token';

let state = {
  year: new Date().getFullYear(),
  month: new Date().getMonth(),
  selectedDate: null,
  todos: {},
  recurring: [],
  recurringState: {},
};

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

async function loadFromBackend() {
  const token = getToken();
  if (!token) { window.location.href = './'; return; }

  const res = await fetch(`${API_BASE}/api/user`, {
    credentials: 'include',
    headers: { 'Authorization': `Bearer ${token}` },
  });

  if (res.status === 401) {
    localStorage.removeItem(TOKEN_KEY);
    window.location.href = './';
    return;
  }

  const calData = await res.json();
  state.todos          = calData?.todos          || {};
  state.recurring      = calData?.recurring      || [];
  state.recurringState = calData?.recurringState || {};
}

async function saveToBackend() {
  const token = getToken();
  if (!token) return;
  try {
    await fetch(`${API_BASE}/api/user`, {
      method: 'PUT',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        todos: state.todos,
        recurring: state.recurring,
        recurringState: state.recurringState,
      }),
    });
  } catch (err) {
    console.error('Failed to save:', err);
  }
}

function saveTodos() { saveToBackend(); }
function saveRecurring() { saveToBackend(); }

function dateKey(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function getTodos(key) {
  return state.todos[key] || [];
}

// ── Recurring helpers ───────────────────────────────────
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
  return state.recurring.filter(t => {
    if (!doesRecurOn(t, dateStr)) return false;
    const ds = state.recurringState[dateStr] || {};
    return !ds[t.id]?.dismissed;
  });
}

function hasTasks(dateStr) {
  if (getTodos(dateStr).length > 0) return true;
  return state.recurring.some(t => {
    if (!doesRecurOn(t, dateStr)) return false;
    const ds = state.recurringState[dateStr] || {};
    return !ds[t.id]?.dismissed;
  });
}

function hasPastIncomplete(dateStr) {
  const [dy, dm, dd] = dateStr.split('-').map(Number);
  const date = new Date(dy, dm - 1, dd);
  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);
  if (date >= todayMidnight) return false;

  const todos = getTodos(dateStr);
  if (todos.some(t => !t.done)) return true;

  return state.recurring.some(t => {
    if (!doesRecurOn(t, dateStr)) return false;
    const ds = state.recurringState[dateStr] || {};
    if (ds[t.id]?.dismissed) return false;
    return !ds[t.id]?.done;
  });
}

// ── Calendar ───────────────────────────────────────────
const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];

function renderCalendar() {
  const { year, month, selectedDate } = state;
  document.getElementById('monthLabel').textContent = `${MONTHS[month]} ${year}`;

  const grid = document.getElementById('calGrid');
  grid.innerHTML = '';

  const today = new Date();
  const weekStart = localStorage.getItem('weekStart') === 'mon' ? 1 : 0;
  const rawFirst = new Date(year, month, 1).getDay();
  const firstDay = (rawFirst - weekStart + 7) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const weekdayLabels = weekStart === 1
    ? ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
    : ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  document.querySelectorAll('.cal-weekdays span').forEach((el, i) => { el.textContent = weekdayLabels[i]; });

  for (let i = 0; i < firstDay; i++) {
    const el = document.createElement('div');
    el.className = 'cal-day empty';
    grid.appendChild(el);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const key = dateKey(year, month, d);
    const el = document.createElement('div');
    el.className = 'cal-day';

    const isToday    = today.getFullYear() === year && today.getMonth() === month && today.getDate() === d;
    const isSelected = selectedDate === key;
    const hasAny     = hasTasks(key);
    const isOverdue  = !isToday && hasPastIncomplete(key);

    if (isToday)    el.classList.add('today');
    if (isSelected) el.classList.add('selected');
    if (hasAny)     el.classList.add('has-todos');
    if (isOverdue)  el.classList.add('overdue');

    el.innerHTML = `<span>${d}</span>${hasAny ? '<div class="dot"></div>' : ''}`;
    el.addEventListener('click', () => selectDay(key));
    grid.appendChild(el);
  }
}

function selectDay(key) {
  state.selectedDate = key;
  renderCalendar();
  renderTodos();
}

document.getElementById('prevMonth').addEventListener('click', () => {
  if (state.month === 0) { state.month = 11; state.year--; }
  else state.month--;
  renderCalendar();
});

document.getElementById('nextMonth').addEventListener('click', () => {
  if (state.month === 11) { state.month = 0; state.year++; }
  else state.month++;
  renderCalendar();
});

document.getElementById('todayBtn').addEventListener('click', () => {
  const now = new Date();
  state.year  = now.getFullYear();
  state.month = now.getMonth();
  const key = dateKey(state.year, state.month, now.getDate());
  state.selectedDate = key;
  renderCalendar();
  renderTodos();
});

// ── Todo Panel ─────────────────────────────────────────
function renderTodos() {
  const { selectedDate } = state;
  const noDayMsg  = document.getElementById('noDayMsg');
  const dayContent = document.getElementById('dayContent');

  if (!selectedDate) {
    noDayMsg.classList.remove('hidden');
    dayContent.classList.remove('visible');
    return;
  }

  noDayMsg.classList.add('hidden');
  dayContent.classList.add('visible');

  const [y, m, d] = selectedDate.split('-').map(Number);
  const dateObj = new Date(y, m - 1, d);
  document.getElementById('panelTitle').textContent = dateObj.toLocaleDateString('en-US', { weekday: 'long' });
  document.getElementById('panelDate').textContent  = dateObj.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  const todos      = getTodos(selectedDate);
  const applicable = getApplicableRecurring(selectedDate);
  const list       = document.getElementById('todoList');
  list.innerHTML   = '';

  const showCompleted = localStorage.getItem('showCompleted') !== 'false';
  if (todos.length === 0 && applicable.length === 0) {
    list.innerHTML = '<div class="empty-list">No tasks yet. Add one above.</div>';
  } else {
    todos.forEach((todo, idx) => {
      if (showCompleted || !todo.done) list.appendChild(makeTodoEl(todo, idx));
    });
    applicable.forEach(task => {
      const isDone = (state.recurringState[selectedDate] || {})[task.id]?.done;
      if (showCompleted || !isDone) list.appendChild(makeRecurringEl(task, selectedDate));
    });
    if (list.children.length === 0) {
      list.innerHTML = '<div class="empty-list">All tasks complete.</div>';
    }
  }

  const recurDone = applicable.filter(t => (state.recurringState[selectedDate] || {})[t.id]?.done).length;
  const done  = todos.filter(t => t.done).length + recurDone;
  const total = todos.length + applicable.length;
  const statsBar       = document.getElementById('statsBar');
  const progressBarWrap = document.getElementById('progressBarWrap');

  if (total > 0) {
    statsBar.style.display       = 'flex';
    progressBarWrap.style.display = 'block';
    document.getElementById('statsText').textContent    = `${done} of ${total} complete`;
    const pct = Math.round((done / total) * 100);
    document.getElementById('statsPercent').textContent = `${pct}%`;
    document.getElementById('progressFill').style.width = `${pct}%`;
  } else {
    statsBar.style.display        = 'none';
    progressBarWrap.style.display = 'none';
  }
}

// ── Todo element ───────────────────────────────────────
const TODO_COLORS = [
  { value: null,      label: 'None' },
  { value: '#ef4444', label: 'Red' },
  { value: '#f97316', label: 'Orange' },
  { value: '#eab308', label: 'Yellow' },
  { value: '#22c55e', label: 'Green' },
  { value: '#3b82f6', label: 'Blue' },
  { value: '#6c63ff', label: 'Purple' },
  { value: '#ec4899', label: 'Pink' },
];

function makeTodoEl(todo, idx) {
  const item = document.createElement('div');
  item.className = `todo-item${todo.done ? ' done' : ''}`;

  // Drag to reorder
  item.setAttribute('draggable', true);
  item.addEventListener('dragstart', e => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(idx));
    setTimeout(() => item.classList.add('dragging'), 0);
  });
  item.addEventListener('dragend', () => {
    item.classList.remove('dragging');
    document.querySelectorAll('.todo-item.drag-over').forEach(el => el.classList.remove('drag-over'));
  });
  item.addEventListener('dragover', e => {
    e.preventDefault();
    document.querySelectorAll('.todo-item.drag-over').forEach(el => el.classList.remove('drag-over'));
    item.classList.add('drag-over');
  });
  item.addEventListener('dragleave', e => {
    if (!item.contains(e.relatedTarget)) item.classList.remove('drag-over');
  });
  item.addEventListener('drop', e => {
    e.preventDefault();
    item.classList.remove('drag-over');
    const fromIdx = parseInt(e.dataTransfer.getData('text/plain'), 10);
    if (isNaN(fromIdx) || fromIdx === idx) return;
    const key = state.selectedDate;
    const todos = state.todos[key];
    if (!todos) return;
    const [moved] = todos.splice(fromIdx, 1);
    todos.splice(fromIdx < idx ? idx - 1 : idx, 0, moved);
    saveTodos();
    renderTodos();
  });

  const colorBar = document.createElement('div');
  colorBar.className = 'todo-color-bar';
  colorBar.style.background = todo.color || 'transparent';

  const dragHandle = document.createElement('div');
  dragHandle.className = 'drag-handle';
  dragHandle.innerHTML = `<svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor"><circle cx="3" cy="2" r="1.5"/><circle cx="7" cy="2" r="1.5"/><circle cx="3" cy="7" r="1.5"/><circle cx="7" cy="7" r="1.5"/><circle cx="3" cy="12" r="1.5"/><circle cx="7" cy="12" r="1.5"/></svg>`;

  const checkbox = document.createElement('div');
  checkbox.className = 'todo-checkbox';
  checkbox.title = todo.done ? 'Mark undone' : 'Mark done';
  checkbox.addEventListener('click', () => toggleTodo(idx));

  const textEl = document.createElement('span');
  textEl.className = 'todo-text';
  textEl.textContent = todo.text;

  const actions = document.createElement('div');
  actions.className = 'todo-actions';

  const colorBtn = document.createElement('button');
  colorBtn.className = 'icon-btn color';
  colorBtn.title = 'Set color';
  colorBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="10.5" r="2.5"/><circle cx="8.5" cy="7.5" r="2.5"/><circle cx="6.5" cy="12.5" r="2.5"/><path d="M12 22c4.97 0 9-3.13 9-7s-4.03-7-9-7-9 3.13-9 7c0 1.5.65 2.91 1.76 4.03A2 2 0 0 1 5 21c0 .55.45 1 1 1h6z"/></svg>`;
  colorBtn.addEventListener('click', () => toggleColorPicker(idx, item, actions, colorBar));

  const editBtn = document.createElement('button');
  editBtn.className = 'icon-btn edit';
  editBtn.title = 'Edit';
  editBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
  editBtn.addEventListener('click', () => startEdit(idx, item, textEl));

  const delBtn = document.createElement('button');
  delBtn.className = 'icon-btn delete';
  delBtn.title = 'Delete';
  delBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>`;
  delBtn.addEventListener('click', () => showTodoDeleteConfirm(idx, item, actions));

  actions.appendChild(colorBtn);
  actions.appendChild(editBtn);
  actions.appendChild(delBtn);

  item.appendChild(colorBar);
  item.appendChild(dragHandle);
  item.appendChild(checkbox);
  item.appendChild(textEl);
  item.appendChild(actions);
  return item;
}

function toggleColorPicker(idx, item, actions, colorBar) {
  const existing = item.querySelector('.color-picker');
  if (existing) { existing.remove(); return; }

  const picker = document.createElement('div');
  picker.className = 'color-picker';

  const key = state.selectedDate;
  const currentColor = state.todos[key][idx].color || null;

  TODO_COLORS.forEach(({ value, label }) => {
    const swatch = document.createElement('div');
    swatch.className = `color-swatch${value === null ? ' none' : ''}${value === currentColor ? ' selected' : ''}`;
    swatch.title = label;
    if (value) swatch.style.background = value;
    swatch.addEventListener('click', () => {
      state.todos[key][idx].color = value;
      saveTodos();
      colorBar.style.background = value || 'transparent';
      picker.remove();
    });
    picker.appendChild(swatch);
  });

  item.insertBefore(picker, actions);
}

function startEdit(idx, item, textEl) {
  const todos = getTodos(state.selectedDate);
  const input = document.createElement('input');
  input.className = 'todo-edit-input';
  input.value = todos[idx].text;
  input.maxLength = 500;

  item.replaceChild(input, textEl);
  input.focus();
  input.select();

  const save = () => {
    const val = input.value.trim();
    if (val) {
      todos[idx].text = val;
      state.todos[state.selectedDate] = todos;
      saveTodos();
    }
    renderTodos();
  };

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') save();
    if (e.key === 'Escape') renderTodos();
  });
  input.addEventListener('blur', save);
}

function showTodoDeleteConfirm(idx, item, actions) {
  const confirmDiv = document.createElement('div');
  confirmDiv.className = 'recur-confirm';

  const label = document.createElement('span');
  label.textContent = 'Delete task?';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn-recur-day';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => {
    item.replaceChild(actions, confirmDiv);
    item.style.borderColor = '';
  });

  const delConfirmBtn = document.createElement('button');
  delConfirmBtn.className = 'btn-recur-all';
  delConfirmBtn.textContent = 'Delete';
  delConfirmBtn.addEventListener('click', () => deleteTodo(idx));

  confirmDiv.appendChild(label);
  confirmDiv.appendChild(cancelBtn);
  confirmDiv.appendChild(delConfirmBtn);

  item.replaceChild(confirmDiv, actions);
  item.style.borderColor = 'var(--danger)';
}

function toggleTodo(idx) {
  const key = state.selectedDate;
  state.todos[key][idx].done = !state.todos[key][idx].done;
  saveTodos();
  renderTodos();
}

function deleteTodo(idx) {
  const key = state.selectedDate;
  state.todos[key].splice(idx, 1);
  if (state.todos[key].length === 0) delete state.todos[key];
  saveTodos();
  renderCalendar();
  renderTodos();
}

function addTodo(text, frequency) {
  const key = state.selectedDate;
  if (!key) return;
  if (frequency && frequency !== 'none') {
    state.recurring.push({ id: String(Date.now()), text, frequency, startDate: key });
    saveRecurring();
  } else {
    if (!state.todos[key]) state.todos[key] = [];
    state.todos[key].push({ text, done: false, id: Date.now() });
    saveTodos();
  }
  renderCalendar();
  renderTodos();
}

// ── Recurring task element ──────────────────────────────
function makeRecurringEl(task, dateStr) {
  const ds     = state.recurringState[dateStr] || {};
  const isDone = ds[task.id]?.done || false;

  const item = document.createElement('div');
  item.className = `todo-item${isDone ? ' done' : ''}`;

  const colorBar = document.createElement('div');
  colorBar.className = 'todo-color-bar';
  colorBar.style.background = task.color || 'transparent';

  const checkbox = document.createElement('div');
  checkbox.className = 'todo-checkbox';
  checkbox.addEventListener('click', () => toggleRecurring(task.id, dateStr));

  const badge = document.createElement('span');
  badge.className = 'recur-badge';
  badge.textContent = task.frequency === 'daily' ? 'Daily'
                    : task.frequency === 'weekly' ? 'Weekly' : 'Monthly';

  const textEl = document.createElement('span');
  textEl.className = 'todo-text';
  textEl.textContent = task.text;

  const actions = document.createElement('div');
  actions.className = 'todo-actions';

  const colorBtn = document.createElement('button');
  colorBtn.className = 'icon-btn color';
  colorBtn.title = 'Set color';
  colorBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="10.5" r="2.5"/><circle cx="8.5" cy="7.5" r="2.5"/><circle cx="6.5" cy="12.5" r="2.5"/><path d="M12 22c4.97 0 9-3.13 9-7s-4.03-7-9-7-9 3.13-9 7c0 1.5.65 2.91 1.76 4.03A2 2 0 0 1 5 21c0 .55.45 1 1 1h6z"/></svg>`;
  colorBtn.addEventListener('click', () => toggleRecurringColorPicker(task, item, actions, colorBar));

  const editBtn = document.createElement('button');
  editBtn.className = 'icon-btn edit';
  editBtn.title = 'Edit';
  editBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
  editBtn.addEventListener('click', () => startEditRecurring(task.id, item, textEl));

  const delBtn = document.createElement('button');
  delBtn.className = 'icon-btn delete';
  delBtn.title = 'Delete';
  delBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>`;
  delBtn.addEventListener('click', () => showRecurDeleteConfirm(task.id, dateStr, item, actions));

  actions.appendChild(colorBtn);
  actions.appendChild(editBtn);
  actions.appendChild(delBtn);

  item.appendChild(colorBar);
  item.appendChild(checkbox);
  item.appendChild(badge);
  item.appendChild(textEl);
  item.appendChild(actions);
  return item;
}

function toggleRecurringColorPicker(task, item, actions, colorBar) {
  const existing = item.querySelector('.color-picker');
  if (existing) { existing.remove(); return; }

  const picker = document.createElement('div');
  picker.className = 'color-picker';
  const currentColor = task.color || null;

  TODO_COLORS.forEach(({ value, label }) => {
    const swatch = document.createElement('div');
    swatch.className = `color-swatch${value === null ? ' none' : ''}${value === currentColor ? ' selected' : ''}`;
    swatch.title = label;
    if (value) swatch.style.background = value;
    swatch.addEventListener('click', () => {
      task.color = value;
      saveRecurring();
      colorBar.style.background = value || 'transparent';
      picker.remove();
    });
    picker.appendChild(swatch);
  });

  item.insertBefore(picker, actions);
}

function showRecurDeleteConfirm(id, dateStr, item, actions) {
  const confirmDiv = document.createElement('div');
  confirmDiv.className = 'recur-confirm';

  const label = document.createElement('span');
  label.textContent = 'Remove:';

  const dayBtn = document.createElement('button');
  dayBtn.className = 'btn-recur-day';
  dayBtn.textContent = 'Today only';
  dayBtn.addEventListener('click', () => dismissRecurring(id, dateStr));

  const allBtn = document.createElement('button');
  allBtn.className = 'btn-recur-all';
  allBtn.textContent = 'All occurrences';
  allBtn.addEventListener('click', () => deleteRecurring(id));

  confirmDiv.appendChild(label);
  confirmDiv.appendChild(dayBtn);
  confirmDiv.appendChild(allBtn);

  item.replaceChild(confirmDiv, actions);
  item.style.borderColor = 'var(--danger)';
}

function toggleRecurring(id, dateStr) {
  if (!state.recurringState[dateStr]) state.recurringState[dateStr] = {};
  const cur = state.recurringState[dateStr][id] || {};
  state.recurringState[dateStr][id] = { ...cur, done: !cur.done };
  saveRecurring();
  renderTodos();
}

function dismissRecurring(id, dateStr) {
  if (!state.recurringState[dateStr]) state.recurringState[dateStr] = {};
  state.recurringState[dateStr][id] = { dismissed: true };
  saveRecurring();
  renderCalendar();
  renderTodos();
}

function deleteRecurring(id) {
  state.recurring = state.recurring.filter(t => t.id !== id);
  for (const date of Object.keys(state.recurringState)) {
    delete state.recurringState[date][id];
  }
  saveRecurring();
  renderCalendar();
  renderTodos();
}

function startEditRecurring(id, item, textEl) {
  const task = state.recurring.find(t => t.id === id);
  if (!task) return;
  const input = document.createElement('input');
  input.className = 'todo-edit-input';
  input.value = task.text;
  input.maxLength = 500;
  item.replaceChild(input, textEl);
  input.focus();
  input.select();
  const save = () => {
    const val = input.value.trim();
    if (val) { task.text = val; saveRecurring(); }
    renderTodos();
  };
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') save();
    if (e.key === 'Escape') renderTodos();
  });
  input.addEventListener('blur', save);
}

// ── Add task events ────────────────────────────────────
document.getElementById('addTaskBtn').addEventListener('click', () => {
  const input = document.getElementById('newTaskInput');
  const freq  = document.getElementById('repeatSelect').value;
  const val   = input.value.trim();
  if (val) { addTodo(val, freq); input.value = ''; document.getElementById('repeatSelect').value = 'none'; }
});

document.getElementById('newTaskInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    const val  = e.target.value.trim();
    const freq = document.getElementById('repeatSelect').value;
    if (val) { addTodo(val, freq); e.target.value = ''; document.getElementById('repeatSelect').value = 'none'; }
  }
});

document.getElementById('clearDoneBtn').addEventListener('click', () => {
  const key = state.selectedDate;
  if (!key) return;
  state.todos[key] = (state.todos[key] || []).filter(t => !t.done);
  if (state.todos[key].length === 0) delete state.todos[key];
  saveTodos();
  const ds = state.recurringState[key] || {};
  for (const id of Object.keys(ds)) {
    if (ds[id]?.done) ds[id] = { dismissed: true };
  }
  state.recurringState[key] = ds;
  saveRecurring();
  renderCalendar();
  renderTodos();
});

// ── Toast ──────────────────────────────────────────────
let toastTimer = null;
function showToast(msg, type = 'success') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast ${type} show`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.classList.remove('show'); }, 3000);
}

// ── Import JSON ────────────────────────────────────────
function importJSON(data) {
  if (typeof data !== 'object' || Array.isArray(data) || data === null) {
    showToast('Invalid format: expected a JSON object.', 'error');
    return;
  }

  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  let imported = 0;
  let skipped  = 0;

  for (const [key, items] of Object.entries(data)) {
    if (!dateRe.test(key)) { skipped++; continue; }
    if (!Array.isArray(items)) { skipped++; continue; }

    const existing      = state.todos[key] || [];
    const existingTexts = new Set(existing.map(t => t.text.toLowerCase()));

    for (const item of items) {
      const text = typeof item === 'string' ? item.trim()
                 : typeof item?.text === 'string' ? item.text.trim()
                 : null;
      if (!text) continue;
      if (existingTexts.has(text.toLowerCase())) continue;
      existing.push({ text, done: false, id: Date.now() + Math.random() });
      existingTexts.add(text.toLowerCase());
      imported++;
    }

    if (existing.length > 0) state.todos[key] = existing;
  }

  if (imported === 0 && skipped === 0) {
    showToast('No tasks found in file.', 'error');
    return;
  }

  saveTodos();
  renderCalendar();
  renderTodos();

  const msg = imported > 0
    ? `Imported ${imported} task${imported !== 1 ? 's' : ''}${skipped ? ` (${skipped} invalid entries skipped)` : ''}.`
    : `Nothing imported — ${skipped} invalid entries skipped.`;
  showToast(msg, imported > 0 ? 'success' : 'error');
}

document.getElementById('logoutBtn').addEventListener('click', async () => {
  const token = getToken();
  if (token) {
    await fetch(`${API_BASE}/api/logout`, {
      method: 'POST',
      credentials: 'include',
      headers: token ? { 'Authorization': `Bearer ${token}` } : {},
    }).catch(() => {});
  }
  localStorage.removeItem(TOKEN_KEY);
  window.location.href = './';
});

document.getElementById('importBtn').addEventListener('click', () => {
  document.getElementById('importFileInput').value = '';
  document.getElementById('importFileInput').click();
});

document.getElementById('importInfoBtn').addEventListener('click', () => {
  document.getElementById('importInfoOverlay').classList.add('open');
});
document.getElementById('importInfoClose').addEventListener('click', () => {
  document.getElementById('importInfoOverlay').classList.remove('open');
});
document.getElementById('importInfoOverlay').addEventListener('click', e => {
  if (e.target === document.getElementById('importInfoOverlay')) {
    document.getElementById('importInfoOverlay').classList.remove('open');
  }
});

document.getElementById('importFileInput').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const data = JSON.parse(ev.target.result);
      importJSON(data);
    } catch {
      showToast('Could not parse file — make sure it is valid JSON.', 'error');
    }
  };
  reader.readAsText(file);
});

// ── Search ─────────────────────────────────────────────
function renderSearchResults(query) {
  const q = query.trim();
  const container = document.getElementById('searchResults');
  container.innerHTML = '';
  if (!q) { container.classList.remove('open'); return; }

  const results = [];
  for (const [dateStr, todos] of Object.entries(state.todos)) {
    for (const todo of todos) {
      if (todo.text.toLowerCase().includes(q.toLowerCase())) {
        results.push({ dateStr, text: todo.text, done: todo.done, type: 'todo' });
      }
    }
  }
  for (const task of state.recurring) {
    if (task.text.toLowerCase().includes(q.toLowerCase())) {
      results.push({ dateStr: task.startDate, text: task.text, type: 'recurring', frequency: task.frequency });
    }
  }
  results.sort((a, b) => a.dateStr.localeCompare(b.dateStr));

  if (results.length === 0) {
    container.innerHTML = '<div class="search-no-results">No tasks found</div>';
  } else {
    results.forEach(r => {
      const item = document.createElement('div');
      item.className = 'search-result-item';

      const dateEl = document.createElement('div');
      dateEl.className = 'search-result-date';
      const [y, m, d] = r.dateStr.split('-').map(Number);
      dateEl.textContent = new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

      const textEl = document.createElement('div');
      textEl.className = 'search-result-text';
      const qi = r.text.toLowerCase().indexOf(q.toLowerCase());
      if (qi !== -1) {
        textEl.appendChild(document.createTextNode(r.text.slice(0, qi)));
        const mark = document.createElement('mark');
        mark.textContent = r.text.slice(qi, qi + q.length);
        textEl.appendChild(mark);
        textEl.appendChild(document.createTextNode(r.text.slice(qi + q.length)));
      } else {
        textEl.textContent = r.text;
      }

      item.appendChild(dateEl);
      item.appendChild(textEl);
      if (r.type === 'recurring') {
        const badge = document.createElement('div');
        badge.className = 'search-result-badge';
        badge.textContent = `Repeats ${r.frequency}`;
        item.appendChild(badge);
      }
      item.addEventListener('click', () => {
        state.year = y;
        state.month = m - 1;
        state.selectedDate = r.dateStr;
        renderCalendar();
        renderTodos();
        document.getElementById('searchInput').value = '';
        container.classList.remove('open');
      });
      container.appendChild(item);
    });
  }
  container.classList.add('open');
}

document.getElementById('searchInput').addEventListener('input', e => renderSearchResults(e.target.value));
document.getElementById('searchInput').addEventListener('focus', e => { if (e.target.value.trim()) renderSearchResults(e.target.value); });
document.getElementById('searchInput').addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    e.target.value = '';
    document.getElementById('searchResults').classList.remove('open');
    e.target.blur();
  }
});
document.addEventListener('click', e => {
  if (!document.querySelector('.search-wrap').contains(e.target)) {
    document.getElementById('searchResults').classList.remove('open');
  }
});

// ── Export ─────────────────────────────────────────────
function exportJSON() {
  const data = {};
  for (const [date, todos] of Object.entries(state.todos)) {
    if (todos.length > 0) data[date] = todos.map(t => ({ text: t.text, done: t.done }));
  }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `todolander-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Exported as JSON.');
}

function exportICal() {
  const esc = s => s.replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\n/g, '\\n');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//TodoLander//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];

  for (const [date, todos] of Object.entries(state.todos)) {
    const d = date.replace(/-/g, '');
    for (const todo of todos) {
      lines.push('BEGIN:VEVENT');
      lines.push(`UID:${todo.id || Date.now()}@todolander`);
      lines.push(`DTSTART;VALUE=DATE:${d}`);
      lines.push(`DTEND;VALUE=DATE:${d}`);
      lines.push(`SUMMARY:${esc(todo.text)}`);
      if (todo.done) lines.push('STATUS:COMPLETED');
      lines.push('END:VEVENT');
    }
  }
  for (const task of state.recurring) {
    const d = task.startDate.replace(/-/g, '');
    const rrule = task.frequency === 'daily'   ? 'RRULE:FREQ=DAILY'
                : task.frequency === 'weekly'  ? 'RRULE:FREQ=WEEKLY'
                : 'RRULE:FREQ=MONTHLY';
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${task.id}@todolander-recur`);
    lines.push(`DTSTART;VALUE=DATE:${d}`);
    lines.push(`DTEND;VALUE=DATE:${d}`);
    lines.push(rrule);
    lines.push(`SUMMARY:${esc(task.text)}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');

  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `todolander-${new Date().toISOString().slice(0, 10)}.ics`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Exported as iCal.');
}

document.getElementById('exportBtn').addEventListener('click', e => {
  e.stopPropagation();
  document.getElementById('exportDropdown').classList.toggle('open');
});
document.getElementById('exportJsonBtn').addEventListener('click', () => {
  document.getElementById('exportDropdown').classList.remove('open');
  exportJSON();
});
document.getElementById('exportIcalBtn').addEventListener('click', () => {
  document.getElementById('exportDropdown').classList.remove('open');
  exportICal();
});
document.addEventListener('click', e => {
  if (!document.querySelector('.export-wrap').contains(e.target)) {
    document.getElementById('exportDropdown').classList.remove('open');
  }
});

// ── Theme ──────────────────────────────────────────────
function applyTheme(light) {
  document.body.classList.toggle('light', light);
  document.getElementById('themeToggle').checked = light;
  localStorage.setItem('theme', light ? 'light' : 'dark');
}

applyTheme(localStorage.getItem('theme') === 'light');

document.getElementById('themeToggle').addEventListener('change', e => {
  applyTheme(e.target.checked);
});

// ── Week start ──────────────────────────────────────────
document.getElementById('weekStartToggle').checked = localStorage.getItem('weekStart') === 'mon';
document.getElementById('weekStartToggle').addEventListener('change', e => {
  localStorage.setItem('weekStart', e.target.checked ? 'mon' : 'sun');
  renderCalendar();
});

// ── Show completed ──────────────────────────────────────
document.getElementById('showCompletedToggle').checked = localStorage.getItem('showCompleted') !== 'false';
document.getElementById('showCompletedToggle').addEventListener('change', e => {
  localStorage.setItem('showCompleted', e.target.checked ? 'true' : 'false');
  renderTodos();
});

// ── Compact view ────────────────────────────────────────
function applyCompact(compact) {
  document.body.classList.toggle('compact', compact);
  document.getElementById('compactToggle').checked = compact;
  localStorage.setItem('compactView', compact ? 'true' : 'false');
}
applyCompact(localStorage.getItem('compactView') === 'true');
document.getElementById('compactToggle').addEventListener('change', e => {
  applyCompact(e.target.checked);
});

// ── Settings panel ─────────────────────────────────────
function openSettings() {
  document.getElementById('settingsPanel').classList.add('open');
  document.getElementById('settingsOverlay').classList.add('open');
}
function closeSettings() {
  document.getElementById('settingsPanel').classList.remove('open');
  document.getElementById('settingsOverlay').classList.remove('open');
}

document.getElementById('settingsBtn').addEventListener('click', openSettings);
document.getElementById('settingsClose').addEventListener('click', closeSettings);
document.getElementById('settingsOverlay').addEventListener('click', closeSettings);

// ── Push notifications ──────────────────────────────────
let notifPrefs = { morning_digest: { enabled: false, time: '08:00' }, overdue_alert: { enabled: false, time: '18:00' } };
let pushSubscription = null;

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

async function getVapidKey() {
  const res = await fetch(`${API_BASE}/api/push/vapid-key`);
  const { publicKey } = await res.json();
  return publicKey;
}

async function subscribeToPush() {
  const reg = await navigator.serviceWorker.ready;
  const vapidKey = await getVapidKey();
  return reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidKey),
  });
}

async function sendSubscriptionToServer(sub) {
  const token = getToken();
  await fetch(`${API_BASE}/api/push/subscribe`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({
      subscription: sub.toJSON(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }),
  });
}

async function removeSubscriptionFromServer(endpoint) {
  const token = getToken();
  await fetch(`${API_BASE}/api/push/subscribe`, {
    method: 'DELETE',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ endpoint }),
  });
}

async function saveNotifPrefs() {
  const token = getToken();
  await fetch(`${API_BASE}/api/push/prefs`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify(notifPrefs),
  });
}

async function loadNotifPrefs() {
  const token = getToken();
  const res = await fetch(`${API_BASE}/api/push/prefs`, {
    credentials: 'include',
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (res.ok) {
    const saved = await res.json();
    // Deep merge so default times are preserved when a key is missing from saved prefs
    notifPrefs = {
      morning_digest: { ...notifPrefs.morning_digest, ...saved.morning_digest },
      overdue_alert:  { ...notifPrefs.overdue_alert,  ...saved.overdue_alert  },
    };
  }
}

async function ensureSubscribed() {
  if (pushSubscription) return pushSubscription;
  const reg = await navigator.serviceWorker.ready;
  pushSubscription = await reg.pushManager.getSubscription();
  if (!pushSubscription) pushSubscription = await subscribeToPush();
  await sendSubscriptionToServer(pushSubscription);
  return pushSubscription;
}

async function handleNotifToggle(type, enabled) {
  if (enabled) {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      showToast('Notification permission denied.', 'error');
      // revert toggle
      document.getElementById(type === 'morning_digest' ? 'morningDigestToggle' : 'overdueAlertToggle').checked = false;
      return;
    }
    try {
      await ensureSubscribed();
    } catch {
      showToast('Could not set up push notifications.', 'error');
      document.getElementById(type === 'morning_digest' ? 'morningDigestToggle' : 'overdueAlertToggle').checked = false;
      return;
    }
  }

  notifPrefs[type] = { ...notifPrefs[type], enabled };

  try {
    // If both types are disabled, remove the subscription entirely
    const anyEnabled = Object.values(notifPrefs).some(p => p?.enabled);
    if (!anyEnabled && pushSubscription) {
      await removeSubscriptionFromServer(pushSubscription.endpoint);
      await pushSubscription.unsubscribe();
      pushSubscription = null;
    }
    await saveNotifPrefs();
  } catch (err) {
    console.error('Failed to update notification settings:', err);
    showToast('Could not save notification settings.', 'error');
  }

  updateNotifUI();
}

function updateNotifUI() {
  const morningEnabled = notifPrefs.morning_digest?.enabled || false;
  const overdueEnabled = notifPrefs.overdue_alert?.enabled || false;
  document.getElementById('morningDigestToggle').checked = morningEnabled;
  document.getElementById('overdueAlertToggle').checked = overdueEnabled;
  document.getElementById('morningTimeRow').style.display = morningEnabled ? 'flex' : 'none';
  document.getElementById('overdueTimeRow').style.display = overdueEnabled ? 'flex' : 'none';
  document.getElementById('morningTimeInput').value = notifPrefs.morning_digest?.time || '08:00';
  document.getElementById('overdueTimeInput').value = notifPrefs.overdue_alert?.time || '18:00';
}

async function initNotifications() {
  // Hide the entire section on browsers that don't support push (e.g. older Safari)
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

  // SW registration must succeed — can't use push without it
  try {
    await navigator.serviceWorker.register('/sw.js');
  } catch (err) {
    console.error('Service worker registration failed:', err);
    return;
  }

  // Show the section now that we know push is supported
  document.getElementById('notifSection').style.display = 'block';

  // Load saved prefs — best-effort, use defaults on any failure
  try {
    await loadNotifPrefs();
  } catch {
    // defaults already set in notifPrefs
  }
  updateNotifUI();

  document.getElementById('morningDigestToggle').addEventListener('change', e => handleNotifToggle('morning_digest', e.target.checked));
  document.getElementById('overdueAlertToggle').addEventListener('change', e => handleNotifToggle('overdue_alert', e.target.checked));

  document.getElementById('morningTimeInput').addEventListener('change', async e => {
    notifPrefs.morning_digest = { ...notifPrefs.morning_digest, time: e.target.value };
    await saveNotifPrefs();
  });
  document.getElementById('overdueTimeInput').addEventListener('change', async e => {
    notifPrefs.overdue_alert = { ...notifPrefs.overdue_alert, time: e.target.value };
    await saveNotifPrefs();
  });
}

// ── Init ───────────────────────────────────────────────
async function init() {
  await loadFromBackend();
  renderCalendar();
  renderTodos();
  initNotifications().catch(console.error);
}

init();
