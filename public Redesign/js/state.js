/* ============================================
   TODOLANDER — State Management
   ============================================ */

const STATE_KEY    = 'todolander_tasks';
const SETTINGS_KEY = 'todolander_settings';

// ── Settings ──

const DEFAULT_SETTINGS = {
  theme:              'dark',
  compact:            false,
  weekStartsMonday:   false,
  showCompleted:      true,
  completedAtBottom:  false,
  morningReminder:    false,
  reminderTime:       '08:00',
  afternoonReminder:  false,
  afternoonTime:      '20:00',
  overdueAlert:       true,
};

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function updateSettingValue(key, value) {
  const settings = loadSettings();
  settings[key] = value;
  saveSettings(settings);
  return settings;
}

// Apply theme and body classes based on current settings
function applySettings(settings) {
  document.documentElement.setAttribute('data-theme', settings.theme);
  document.body.classList.toggle('compact', !!settings.compact);
}


// ── Load / Save ──

function loadTasks() {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveTasks(tasks) {
  localStorage.setItem(STATE_KEY, JSON.stringify(tasks));
}

// ── Task CRUD ──

function getTasks(tasks, dateStr) {
  return (tasks[dateStr] || []).map(normalizeTask);
}

function addTask(tasks, dateStr, taskObj) {
  const list = getTasks(tasks, dateStr);
  const normalized = normalizeTask(taskObj);
  // Duplicate prevention (same text, same day)
  if (list.some(t => t.text.trim().toLowerCase() === normalized.text.trim().toLowerCase())) {
    return tasks; // no change
  }
  const updated = { ...tasks, [dateStr]: [...list, normalized] };
  return updated;
}

function addTaskWithRepeat(tasks, dateStr, taskObj) {
  const normalized = normalizeTask(taskObj);
  let updated = addTask(tasks, dateStr, normalized);

  if (normalized.repeat && normalized.repeat !== 'none') {
    const repeatDates = getRepeatDates(dateStr, normalized.repeat);
    // Create task without repeat for the repeated instances
    const repeatedTask = { ...normalized, repeat: 'none' };
    for (const d of repeatDates) {
      updated = addTask(updated, d, repeatedTask);
    }
  }

  return updated;
}

function updateTask(tasks, dateStr, index, changes) {
  const list = getTasks(tasks, dateStr);
  if (index < 0 || index >= list.length) return tasks;
  const updated = list.map((t, i) => i === index ? { ...t, ...changes } : t);
  return { ...tasks, [dateStr]: updated };
}

function deleteTask(tasks, dateStr, index) {
  const list = getTasks(tasks, dateStr);
  const updated = list.filter((_, i) => i !== index);
  const newTasks = { ...tasks };
  if (updated.length === 0) {
    delete newTasks[dateStr];
  } else {
    newTasks[dateStr] = updated;
  }
  return newTasks;
}

function clearDoneTasks(tasks, dateStr) {
  const list = getTasks(tasks, dateStr);
  const remaining = list.filter(t => !t.done);
  const newTasks = { ...tasks };
  if (remaining.length === 0) {
    delete newTasks[dateStr];
  } else {
    newTasks[dateStr] = remaining;
  }
  return newTasks;
}

function deleteAllTasks() {
  const tasks = {};
  saveTasks(tasks);
  return tasks;
}

// ── Merge imported tasks ──

function mergeImportedTasks(existingTasks, importedTasks) {
  let merged = { ...existingTasks };
  for (const [dateStr, list] of Object.entries(importedTasks)) {
    for (const task of list) {
      merged = addTask(merged, dateStr, task);
    }
  }
  return merged;
}

// ── Progress computation ──

function getProgress(tasks, dateStr) {
  const list = getTasks(tasks, dateStr);
  if (list.length === 0) return { done: 0, total: 0, pct: 0 };
  const done = list.filter(t => t.done).length;
  return { done, total: list.length, pct: Math.round((done / list.length) * 100) };
}

// ── Auth helpers ──

function getUser() {
  try {
    return JSON.parse(localStorage.getItem('todolander_auth'));
  } catch {
    return null;
  }
}

function signOut() {
  localStorage.removeItem('todolander_auth');
  window.location.href = 'login.html';
}
