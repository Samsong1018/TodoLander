// ===== constants =====
const API_BASE = 'https://dailytodo-api.onrender.com';
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const WEEKDAYS_SUN = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const WEEKDAYS_MON = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

// ===== date helpers =====
function dstr(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2,'0'), dd = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${dd}`;
}
function parseDstr(s) { const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d); }
function prettyDate(d) { return `${WEEKDAYS_SUN[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`; }
function ordinal(n) { const s = ['th','st','nd','rd'], v = n % 100; return n + (s[(v-20)%10] || s[v] || s[0]); }

// ===== auth helpers =====
function getAuthHeaders() {
  try {
    const u = JSON.parse(localStorage.getItem('todolander-user') || localStorage.getItem('todolander_user') || 'null');
    return u && u.token ? { Authorization: 'Bearer ' + u.token } : {};
  } catch { return {}; }
}

// ===== HTML escaping =====
function esc(s) {
  if (s == null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// ===== data conversion =====
function backendToFrontend(calData) {
  if (!calData) return [];
  const { todos = {}, recurring = [], recurringState = {} } = calData;
  const tasks = [];
  for (const [date, dayTasks] of Object.entries(todos)) {
    for (const task of (dayTasks || [])) {
      const id = task.id != null ? String(task.id) : '';
      tasks.push({ id, title: typeof task.text === 'string' ? task.text : (typeof task.title === 'string' ? task.title : ''), date, color: task.color || null, done: !!task.done, notes: typeof task.notes === 'string' ? task.notes : '', repeat: 'none' });
    }
  }
  for (const task of recurring) {
    const id = task.id != null ? String(task.id) : '';
    const startDate = task.startDate || task.start_date;
    const doneDates = [], dismissedDates = [];
    for (const [date, dateState] of Object.entries(recurringState)) {
      if (dateState && dateState[id]) {
        if (dateState[id].done) doneDates.push(date);
        if (dateState[id].dismissed) dismissedDates.push(date);
      }
    }
    tasks.push({ id, title: typeof task.text === 'string' ? task.text : (typeof task.title === 'string' ? task.title : ''), date: startDate, color: task.color || null, done: doneDates.includes(startDate), notes: typeof task.notes === 'string' ? task.notes : '', repeat: task.frequency || 'daily', doneDates, dismissedDates });
  }
  return tasks;
}

function frontendToBackend(tasks) {
  const todos = {}, recurring = [], recurringState = {};
  for (const task of tasks) {
    if (!task.repeat || task.repeat === 'none') {
      if (!todos[task.date]) todos[task.date] = [];
      todos[task.date].push({ id: task.id, text: task.title, done: !!task.done, color: task.color, notes: task.notes || '' });
    } else {
      recurring.push({ id: task.id, text: task.title, frequency: task.repeat, startDate: task.date, color: task.color, notes: task.notes || '' });
      for (const date of (task.doneDates || [])) {
        if (!recurringState[date]) recurringState[date] = {};
        recurringState[date][task.id] = Object.assign({}, recurringState[date][task.id], { done: true });
      }
      for (const date of (task.dismissedDates || [])) {
        if (!recurringState[date]) recurringState[date] = {};
        recurringState[date][task.id] = Object.assign({}, recurringState[date][task.id], { dismissed: true });
      }
    }
  }
  return { todos, recurring, recurringState };
}

// ===== repeat helpers =====
function expandRepeats(tasks, rangeStart, rangeEnd) {
  const out = [];
  for (const t of tasks) {
    if (!t.repeat || t.repeat === 'none') { out.push(t); continue; }
    const base = parseDstr(t.date);
    if (base > rangeEnd) { out.push(t); continue; }
    out.push(t);
    const cursor = new Date(base);
    const originDay = base.getDate(); // for monthly: remember the intended day-of-month
    for (let i = 0; i < 400; i++) {
      if (t.repeat === 'daily') cursor.setDate(cursor.getDate() + 1);
      else if (t.repeat === 'weekly') cursor.setDate(cursor.getDate() + 7);
      else if (t.repeat === 'monthly') {
        // Advance to day 1 first to prevent overflow (e.g. Jan 31 + 1 month != Mar 2)
        cursor.setDate(1);
        cursor.setMonth(cursor.getMonth() + 1);
        const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
        cursor.setDate(Math.min(originDay, daysInMonth));
      }
      else break;
      if (cursor > rangeEnd) break;
      if (cursor >= rangeStart) {
        const occDate = dstr(cursor);
        if ((t.dismissedDates || []).includes(occDate)) continue;
        out.push({ ...t, id: t.id + '__occ__' + occDate, date: occDate, isOccurrence: true, originId: t.id, done: (t.doneDates || []).includes(occDate) });
      }
    }
  }
  return out;
}

// ===== ical =====
function buildIcal(tasks) {
  const escIcal = s => (s||'').replace(/\\/g,'\\\\').replace(/,/g,'\\,').replace(/;/g,'\\;').replace(/\n/g,'\\n');
  const stamp = new Date().toISOString().replace(/[-:]/g,'').replace(/\..*/,'') + 'Z';
  const nextDay = iso => { const d = new Date(iso+'T00:00:00'); d.setDate(d.getDate()+1); return d.toISOString().slice(0,10).replace(/-/g,''); };
  const lines = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//TodoLander//EN','CALSCALE:GREGORIAN','METHOD:PUBLISH'];
  for (const t of tasks) {
    const ds = t.date.replace(/-/g,''), de = nextDay(t.date);
    if (t.repeat && t.repeat !== 'none') {
      const rrule = t.repeat === 'daily' ? 'RRULE:FREQ=DAILY' : t.repeat === 'weekly' ? 'RRULE:FREQ=WEEKLY' : 'RRULE:FREQ=MONTHLY';
      lines.push('BEGIN:VEVENT',`UID:${t.id}@todolander-recur`,`DTSTAMP:${stamp}`,`DTSTART;VALUE=DATE:${ds}`,`DTEND;VALUE=DATE:${de}`,rrule,`SUMMARY:${escIcal(t.title)}`);
      if (t.notes) lines.push(`DESCRIPTION:${escIcal(t.notes)}`);
    } else {
      lines.push('BEGIN:VEVENT',`UID:${t.id}@todolander`,`DTSTAMP:${stamp}`,`DTSTART;VALUE=DATE:${ds}`,`DTEND;VALUE=DATE:${de}`,`SUMMARY:${escIcal(t.title)}`);
      if (t.notes) lines.push(`DESCRIPTION:${escIcal(t.notes)}`);
      if (t.done) lines.push('STATUS:COMPLETED');
    }
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

// ===== state =====
function defaultSettings() {
  const raw = localStorage.getItem('todolander-settings') || localStorage.getItem('todolander_settings');
  if (raw) try { return Object.assign({ weekStart:0, compact:false, autoRoll:false, confirmDelete:true, theme:'light', showCompleted:true, completedAtBottom:false }, JSON.parse(raw)); } catch {}
  return { weekStart:0, compact:false, autoRoll:false, confirmDelete:true, theme:'light', showCompleted:true, completedAtBottom:false };
}

const S = {
  user: null, loading: true, tasks: [],
  settings: defaultSettings(),
  viewDate: (() => { const s = localStorage.getItem('todolander-view'); return s ? new Date(s) : new Date(); })(),
  selectedDate: dstr(new Date()),
  view: 'month',
  query: '', filterColors: [], showSearchDrop: false,
  newColor: null, newRepeat: 'none',
  colorPopFor: null, editingId: null,
  userMenu: false, sidebarOpen: false,
  mobileMenuOpen: false,
};

let isLoaded = false, saveTimer = null, toastTimer = null, draggingId = null;
let _toastEl = null;

// ===== focus timer =====
const timer = { seconds: 25 * 60, running: false, done: false, _id: null };

function timerFmt() {
  const s = timer.seconds;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function buildTimerHTML() {
  if (!timer.running && !timer.done && timer.seconds === 25 * 60) {
    return `<button class="timer-btn" data-action="toggle-timer" title="Start 25-min focus timer">${iconSVG('timer', 14)}</button>`;
  }
  const cls = timer.done ? 'done' : timer.running ? 'running' : 'paused';
  const label = timer.done ? 'Done!' : timerFmt();
  const toggleTitle = timer.running ? 'Pause timer' : 'Resume timer';
  return `<div class="timer-pill ${cls}">
    <button class="timer-btn-time" data-action="${timer.done ? '' : 'toggle-timer'}" title="${timer.done ? '' : toggleTitle}">${label}</button>
    <button class="timer-btn-reset" data-action="reset-timer" title="Reset">×</button>
  </div>`;
}

function updateTimerDisplay() {
  const wrap = document.getElementById('timer-wrap');
  if (wrap) wrap.innerHTML = buildTimerHTML();
}

function timerTick() {
  timer.seconds--;
  if (timer.seconds <= 0) {
    timer.seconds = 0;
    timer.running = false;
    timer.done = true;
    clearInterval(timer._id);
    timer._id = null;
    showToast('Focus session complete!');
  }
  updateTimerDisplay();
}

function toggleTimer() {
  if (timer.done) return;
  if (timer.running) {
    timer.running = false;
    clearInterval(timer._id);
    timer._id = null;
  } else {
    timer.running = true;
    timer._id = setInterval(timerTick, 1000);
  }
  updateTimerDisplay();
}

function resetTimer() {
  clearInterval(timer._id);
  timer._id = null;
  timer.running = false;
  timer.done = false;
  timer.seconds = 25 * 60;
  updateTimerDisplay();
}

// ===== completion animation tracking =====
const recentlyCompleted = new Set();

// ===== toast =====
function showToast(msg) {
  clearTimeout(toastTimer);
  if (!_toastEl) { _toastEl = document.createElement('div'); _toastEl.className = 'toast'; document.body.appendChild(_toastEl); }
  _toastEl.textContent = msg;
  _toastEl.style.display = 'block';
  _toastEl.style.animation = 'none'; void _toastEl.offsetWidth; _toastEl.style.animation = '';
  toastTimer = setTimeout(() => { if (_toastEl) _toastEl.style.display = 'none'; }, 2400);
}

// ===== derived computations =====
function getToday() { const d = new Date(); d.setHours(0,0,0,0); return d; }

function getExpandedTasks() {
  const y = S.viewDate.getFullYear(), m = S.viewDate.getMonth();
  const first = new Date(y, m, 1), last = new Date(y, m+1, 0);
  const start = new Date(first); start.setDate(start.getDate() - 14);
  const end = new Date(last); end.setDate(end.getDate() + 14);
  return expandRepeats(S.tasks, start, end);
}

function getTasksByDate(expanded) {
  const map = {};
  for (const t of expanded) { if (!map[t.date]) map[t.date] = []; map[t.date].push(t); }
  return map;
}

function filterMatch(t) {
  const q = S.query.toLowerCase();
  if (q && !t.title.toLowerCase().includes(q) && !(t.notes||'').toLowerCase().includes(q)) return false;
  if (S.filterColors.length && !S.filterColors.includes(t.color)) return false;
  return true;
}

function getCalendarCells() {
  const y = S.viewDate.getFullYear(), m = S.viewDate.getMonth();
  const first = new Date(y, m, 1), daysInMonth = new Date(y, m+1, 0).getDate();
  const startDay = (first.getDay() - S.settings.weekStart + 7) % 7;
  const cells = [], prevDays = new Date(y, m, 0).getDate();
  for (let i = startDay - 1; i >= 0; i--) cells.push({ date: new Date(y, m-1, prevDays-i), out: true });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ date: new Date(y, m, d), out: false });
  while (cells.length % 7 !== 0 || cells.length < 42) {
    const last = cells[cells.length-1].date, d = new Date(last); d.setDate(last.getDate()+1);
    cells.push({ date: d, out: true });
  }
  return cells;
}

function getWeekCells() {
  const d = new Date(S.viewDate), dow = (d.getDay() - S.settings.weekStart + 7) % 7;
  d.setDate(d.getDate() - dow);
  return Array.from({ length: 7 }, (_, i) => { const day = new Date(d); day.setDate(d.getDate()+i); return day; });
}

// ===== save =====
function scheduleSave() {
  if (!isLoaded) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(doSave, 1500);
}

async function doSave() {
  try {
    const res = await fetch(`${API_BASE}/api/user`, {
      method: 'PUT', credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify(frontendToBackend(S.tasks)),
    });
    if (res.status === 401) { localStorage.removeItem('todolander-user'); localStorage.removeItem('todolander_user'); window.location.href = 'index.html'; return; }
    if (!res.ok) showToast('Save failed — changes may not be synced.');
  } catch {
    showToast('No connection — changes saved locally.');
  }
}

// ===== task actions =====
function addTask() {
  const inp = document.getElementById('new-task-input');
  const title = (inp ? inp.value : '').trim();
  if (!title) return;
  const base = { id: 't' + Date.now() + Math.random().toString(36).slice(2,6), title, date: S.selectedDate, color: S.newColor, done: false, notes: '', repeat: S.newRepeat };
  if (S.newRepeat !== 'none') { base.doneDates = []; base.dismissedDates = []; }
  S.tasks = [...S.tasks, base];
  S.newColor = null; S.newRepeat = 'none';
  showToast('Task added');
  scheduleSave();
  render();
  const newInp = document.getElementById('new-task-input');
  if (newInp) { newInp.value = ''; newInp.focus(); }
}

function toggleDone(originId, isOcc, occDate) {
  let willComplete = false;
  if (isOcc) {
    S.tasks = S.tasks.map(x => {
      if (x.id !== originId) return x;
      const dd = new Set(x.doneDates || []);
      if (dd.has(occDate)) { dd.delete(occDate); } else { dd.add(occDate); willComplete = true; }
      return { ...x, doneDates: Array.from(dd) };
    });
  } else {
    S.tasks = S.tasks.map(x => {
      if (x.id !== originId) return x;
      if (x.repeat && x.repeat !== 'none') {
        const dd = new Set(x.doneDates || []);
        if (x.done || dd.has(x.date)) { dd.delete(x.date); return { ...x, done: false, doneDates: Array.from(dd) }; }
        dd.add(x.date); willComplete = true; return { ...x, done: true, doneDates: Array.from(dd) };
      }
      willComplete = !x.done;
      return { ...x, done: !x.done };
    });
  }
  if (willComplete) recentlyCompleted.add(originId);
  scheduleSave(); render();
}

function dismissOccurrence(originId, date) {
  S.tasks = S.tasks.map(x => {
    if (x.id !== originId) return x;
    const dd = new Set(x.dismissedDates || []); dd.add(date);
    return { ...x, dismissedDates: Array.from(dd) };
  });
  showToast('Skipped for today'); scheduleSave(); render();
}

function updateTaskText(originId, text) {
  S.tasks = S.tasks.map(x => x.id === originId ? { ...x, title: text } : x);
  scheduleSave(); render();
}

function updateTaskColor(originId, color) {
  S.tasks = S.tasks.map(x => x.id === originId ? { ...x, color } : x);
  S.colorPopFor = null; scheduleSave(); render();
}

function updateTaskNotes(originId, notes) {
  S.tasks = S.tasks.map(x => x.id === originId ? { ...x, notes } : x);
  scheduleSave();
}

function deleteTask(originId) {
  if (S.settings.confirmDelete && !confirm('Delete this task?')) return;
  S.tasks = S.tasks.filter(x => x.id !== originId);
  showToast('Task deleted'); scheduleSave(); render();
}

function deleteAll() {
  const toDelete = S.filterColors.length > 0 ? S.tasks.filter(t => S.filterColors.includes(t.color)) : S.tasks;
  if (toDelete.length === 0) { showToast('Nothing to delete'); return; }
  const msg = S.filterColors.length > 0 ? `Delete ${toDelete.length} task${toDelete.length !== 1 ? 's' : ''} with the selected color${S.filterColors.length > 1 ? 's' : ''}? This cannot be undone.` : `Delete all ${toDelete.length} task${toDelete.length !== 1 ? 's' : ''}? This cannot be undone.`;
  if (S.settings.confirmDelete && !confirm(msg)) return;
  S.tasks = S.filterColors.length > 0 ? S.tasks.filter(t => !S.filterColors.includes(t.color)) : [];
  showToast('Tasks deleted.'); scheduleSave(); render();
}

function clearDone() {
  const expanded = getExpandedTasks();
  const selectedExpanded = (getTasksByDate(expanded)[S.selectedDate] || []);
  const doneOnDate = S.tasks.filter(t => t.date === S.selectedDate && t.done && (!t.repeat || t.repeat === 'none')).length;
  const doneRecurOnDate = S.tasks.filter(t => t.repeat && t.repeat !== 'none' && (t.doneDates || []).includes(S.selectedDate)).length;
  const doneCount = doneOnDate + doneRecurOnDate;
  if (doneCount === 0) { showToast('Nothing completed yet'); return; }
  if (S.settings.confirmDelete && !confirm(`Clear ${doneCount} completed task${doneCount !== 1 ? 's' : ''}?`)) return;
  S.tasks = S.tasks
    .filter(t => !(t.date === S.selectedDate && t.done && (!t.repeat || t.repeat === 'none')))
    .map(t => {
      if (!t.repeat || t.repeat === 'none') return t;
      if (!(t.doneDates || []).includes(S.selectedDate)) return t;
      return { ...t, doneDates: (t.doneDates||[]).filter(d => d !== S.selectedDate), dismissedDates: [...new Set([...(t.dismissedDates||[]), S.selectedDate])] };
    });
  showToast('Completed tasks cleared.'); scheduleSave(); render();
}

function reorderTasks(date, fromId, toId) {
  if (fromId === toId) return;
  S.tasks = (() => {
    const dt = S.tasks.filter(t => t.date === date && (!t.repeat || t.repeat === 'none'));
    const rest = S.tasks.filter(t => !(t.date === date && (!t.repeat || t.repeat === 'none')));
    const fi = dt.findIndex(t => t.id === fromId), ti = dt.findIndex(t => t.id === toId);
    if (fi < 0 || ti < 0) return S.tasks;
    const reordered = [...dt]; const [moved] = reordered.splice(fi, 1); reordered.splice(ti, 0, moved);
    return [...rest, ...reordered];
  })();
  scheduleSave(); render();
}

function exportJson() {
  const blob = new Blob([JSON.stringify(frontendToBackend(S.tasks), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'todolander-export.json'; a.click();
  URL.revokeObjectURL(url);
  showToast('Exported JSON');
}

function exportIcal() {
  const blob = new Blob([buildIcal(S.tasks)], { type: 'text/calendar' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'todolander.ics'; a.click();
  URL.revokeObjectURL(url);
  showToast('Exported .ics');
}

function importTasks(calData) {
  S.tasks = backendToFrontend(calData);
  isLoaded = true; showToast('Import complete'); scheduleSave(); render();
}

async function signOut() {
  try { await fetch(`${API_BASE}/api/logout`, { method: 'POST', credentials: 'include', headers: getAuthHeaders() }); } catch {}
  localStorage.removeItem('todolander-user'); localStorage.removeItem('todolander_user');
  window.location.href = 'index.html';
}

function goToday() {
  const d = new Date(); d.setHours(0,0,0,0);
  S.viewDate = d; S.selectedDate = dstr(d); render();
}
function shiftMonth(delta) { const d = new Date(S.viewDate); d.setDate(1); d.setMonth(d.getMonth()+delta); S.viewDate = d; render(); }
function shiftWeek(delta) { const d = new Date(S.viewDate); d.setDate(d.getDate()+delta*7); S.viewDate = d; render(); }

// ===== build HTML sections =====

function buildLoadingHTML() {
  return `<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:16px;color:var(--ink-3);font-family:var(--sans)">
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" style="animation:spin 1s linear infinite">
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
    </svg>
    <style>@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}</style>
    <span style="font-size:13px;letter-spacing:0.08em">Loading…</span>
  </div>`;
}

function buildTopbarHTML() {
  const firstName = ((S.user && S.user.name) || '').split(' ')[0] || 'friend';
  const q = S.query;
  const searchCount = q ? S.tasks.filter(filterMatch).length : null;
  const searchResults = (() => {
    if (!q || q.length < 2) return [];
    const ql = q.toLowerCase(), seen = new Set();
    return S.tasks.filter(t => { if (seen.has(t.id)) return false; seen.add(t.id); return t.title.toLowerCase().includes(ql) || (t.notes||'').toLowerCase().includes(ql); }).slice(0, 8);
  })();

  const searchDrop = S.showSearchDrop && searchResults.length > 0 ? `
    <div class="search-dropdown" id="search-drop">
      ${searchResults.map(t => `
        <div class="search-result" data-action="select-search-result" data-date="${esc(t.date)}">
          <span class="sr-dot" style="background:${tagVar(t.color)}"></span>
          <span class="sr-title">${esc(t.title)}</span>
          <span class="sr-date">${esc(prettyDate(parseDstr(t.date)))}</span>
        </div>`).join('')}
    </div>` : '';

  const mobileMenu = S.mobileMenuOpen ? `
    <div style="position:fixed;inset:0;z-index:54" data-action="close-mobile-menu"></div>
    <div class="mobile-menu">
      <button class="tb-btn" data-action="open-json" data-close="mobile">${iconSVG('json')} Raw JSON</button>
      <hr>
      <button class="tb-btn danger" data-action="delete-all" data-close="mobile">${iconSVG('trash',12)} Delete all</button>
    </div>` : '';

  const menuDivider = `<div style="border-top:1px solid var(--rule);margin:4px 0"></div>`;

  const userMenu = S.userMenu ? `
    <div style="position:fixed;inset:0;z-index:5" data-action="close-user-menu"></div>
    <div style="position:absolute;top:calc(100% + 6px);right:0;background:var(--paper);border:1px solid var(--rule);border-radius:8px;padding:6px;min-width:190px;z-index:10;box-shadow:0 10px 30px oklch(0 0 0 / 0.08)">
      <div style="padding:10px 12px;border-bottom:1px solid var(--rule);margin-bottom:4px">
        <div style="font-weight:500;font-size:13px">${esc(S.user && S.user.name)}</div>
        <div style="font-size:11px;color:var(--ink-3)">${esc(S.user && S.user.email)}</div>
      </div>
      <button class="tb-btn" style="width:100%;justify-content:flex-start" data-action="open-stats" data-close="user">${iconSVG('stats')} Stats</button>
      ${menuDivider}
      <button class="tb-btn" style="width:100%;justify-content:flex-start" data-action="open-import" data-close="user">${iconSVG('import')} Import</button>
      <button class="tb-btn" style="width:100%;justify-content:flex-start" data-action="export-json" data-close="user">${iconSVG('export',13)} Export JSON</button>
      <button class="tb-btn" style="width:100%;justify-content:flex-start" data-action="export-ical" data-close="user">${iconSVG('calendar',13)} Export iCal</button>
      ${menuDivider}
      <button class="tb-btn" style="width:100%;justify-content:flex-start" data-action="open-settings" data-close="user">${iconSVG('settings')} Settings</button>
      <button class="tb-btn" style="width:100%;justify-content:flex-start" data-action="open-notifs" data-close="user">${iconSVG('bell')} Notifications</button>
      <button class="tb-btn" style="width:100%;justify-content:flex-start" data-action="open-shortcuts" data-close="user">${iconSVG('keyboard')} Shortcuts</button>
      ${menuDivider}
      <button class="tb-btn danger" style="width:100%;justify-content:flex-start" data-action="sign-out">${iconSVG('signout')} Sign out</button>
    </div>` : '';

  return `
    <button class="hamburger" data-action="toggle-sidebar" aria-label="Toggle menu">${iconSVG(S.sidebarOpen ? 'close' : 'menu', 18)}</button>
    <div class="brand">${logoHTML(26, true, 22)}</div>
    <div class="search" style="position:relative">
      <span class="s-icon">${iconSVG('search',14)}</span>
      <input type="text" id="search-input" placeholder="Search tasks, notes…" autocomplete="off" value="${esc(S.query)}">
      ${q ? `<span class="s-count">${searchCount} match${searchCount === 1 ? '' : 'es'}</span>` : ''}
      ${searchDrop}
    </div>
    <div class="tool-group">
      <div class="mobile-more-btn">
        <button class="tb-btn" data-action="toggle-mobile-menu" title="More options">${iconSVG('more',16)}</button>
        ${mobileMenu}
      </div>
      <div style="position:relative">
        <button class="user-chip" data-action="toggle-user-menu">
          <span class="avatar">${esc(firstName.slice(0,1).toUpperCase())}</span>
          <span>${esc(firstName)}</span>
          <span class="caret">▾</span>
        </button>
        ${userMenu}
      </div>
    </div>`;
}

function buildSidebarHTML(tasksByDate) {
  const today = getToday(), todayStr = dstr(today);
  const selected = parseDstr(S.selectedDate);
  const firstName = ((S.user && S.user.name) || '').split(' ')[0] || 'friend';

  const selectedExpanded = getExpandedTasks();
  const selectedTasks = (() => {
    let list = (getTasksByDate(selectedExpanded)[S.selectedDate] || []).slice();
    if (!S.settings.showCompleted) list = list.filter(t => !t.done);
    if (S.settings.completedAtBottom) list.sort((a,b) => a.done === b.done ? 0 : a.done ? 1 : -1);
    return list;
  })();
  const totalToday = selectedTasks.length, doneToday = selectedTasks.filter(t => t.done).length;
  const pct = totalToday ? Math.round(100 * doneToday / totalToday) : 0;
  const todayTasks = tasksByDate[todayStr] || [];
  const todayRemaining = todayTasks.filter(t => !t.done).length;
  const hasCompletedForClearDone = S.tasks.filter(t => t.date === S.selectedDate && t.done && (!t.repeat || t.repeat === 'none')).length > 0 ||
    S.tasks.filter(t => t.repeat && t.repeat !== 'none' && (t.doneDates||[]).includes(S.selectedDate)).length > 0;

  const colorDots = TAG_COLORS.map(c =>
    `<div class="color-dot${S.newColor === c.id ? ' active' : ''}" style="background:${c.var}" data-action="set-new-color" data-color="${c.id}" title="${c.id}"></div>`
  ).join('');

  const filterDots = TAG_COLORS.map(c =>
    `<div class="color-dot${S.filterColors.includes(c.id) ? ' active' : ''}" style="background:${c.var}" data-action="toggle-filter-color" data-color="${c.id}" title="${c.id}"></div>`
  ).join('');

  const repeatBtns = ['none','daily','weekly','monthly'].map(r =>
    `<button class="${S.newRepeat === r ? 'active' : ''}" data-action="set-new-repeat" data-repeat="${r}">${r === 'none' ? 'once' : r}</button>`
  ).join('');

  return `
    <button class="sidebar-close" data-action="close-sidebar" aria-label="Close menu">${iconSVG('close',16)}</button>
    <div class="greeting">
      <div class="eyebrow">${esc(prettyDate(today))}</div>
      <h1>${getGreeting(esc(firstName))}</h1>
      <div class="today">${todayTasks.length ? `${todayRemaining} task${todayRemaining !== 1 ? 's' : ''} left today` : 'A clean slate today.'}</div>
    </div>

    <section class="sidebar-section">
      <h3>Add task <span style="font-weight:400;text-transform:none;letter-spacing:0.04em;color:var(--ink-3)">+ n</span></h3>
      <div class="add-task">
        <div class="date-chip">${iconSVG('calendar',11)} <span>for</span> <strong>${esc(prettyDate(selected))}</strong></div>
        <input type="text" id="new-task-input" placeholder="What needs doing?">
        <div class="color-row">
          <div class="color-dot none-dot${S.newColor === null ? ' active' : ''}" data-action="set-new-color" data-color="" title="No color">✕</div>
          ${colorDots}
        </div>
        <div class="repeat-row">${repeatBtns}</div>
        <button class="add-btn" id="add-task-btn" data-action="add-task">${iconSVG('plus',13)} Add task</button>
      </div>
    </section>

    <section class="sidebar-section">
      <h3>Filter by color</h3>
      <div class="filter-row">${filterDots}</div>
      <button class="clear-filter" data-action="clear-filter">${S.filterColors.length ? `Clear filter (${S.filterColors.length})` : 'No filter'}</button>
      ${S.filterColors.length > 0 ? `<div class="active-filter-line">Showing: ${S.filterColors.join(', ')}</div>` : ''}
    </section>

    <section class="sidebar-section">
      <h3>Progress — ${MONTHS_SHORT[selected.getMonth()]} ${selected.getDate()}</h3>
      <div class="progress-card">
        <div class="progress-head">
          <div class="n">${doneToday}<span style="color:var(--ink-3);font-size:18px">/${totalToday}</span></div>
          <div class="l">${pct}% done</div>
        </div>
        <div class="progress-bar"><div class="fill" style="width:${pct}%"></div></div>
        <div class="progress-meta"><span>${totalToday - doneToday} remaining</span><span>${totalToday === 0 ? 'empty day' : pct === 100 ? 'complete ✓' : 'keep going'}</span></div>
        <button class="clear-done" data-action="clear-done" ${hasCompletedForClearDone ? '' : 'disabled'}>Clear done</button>
      </div>
    </section>`;
}

function buildMainHTML() {
  const today = getToday(), todayStr = dstr(today);
  const weekdays = S.settings.weekStart === 1 ? WEEKDAYS_MON : WEEKDAYS_SUN;
  const selected = parseDstr(S.selectedDate);
  const weekCells = getWeekCells();

  const expanded = getExpandedTasks();
  const allTasksByDate = getTasksByDate(expanded);
  const overdueDates = new Set();
  for (const [date, dayTasks] of Object.entries(allTasksByDate)) {
    if (date >= todayStr) continue;
    if (dayTasks.some(t => !t.done)) overdueDates.add(date);
  }

  const selectedExpTasks = (() => {
    let list = (allTasksByDate[S.selectedDate] || []).slice();
    if (!S.settings.showCompleted) list = list.filter(t => !t.done);
    if (S.settings.completedAtBottom) list.sort((a,b) => a.done === b.done ? 0 : a.done ? 1 : -1);
    return list;
  })();

  // calendar head
  const viewTitle = S.view === 'week'
    ? `Week of <span class="yr">${MONTHS_SHORT[weekCells[0].getMonth()]} ${weekCells[0].getDate()}, ${weekCells[0].getFullYear()}</span>`
    : `${MONTHS[S.viewDate.getMonth()]}<span class="yr">${S.viewDate.getFullYear()}</span>`;

  const calHead = `
    <div class="cal-head">
      <div>
        <div class="label-caps" style="margin-bottom:6px">Calendar</div>
        <div class="title">${viewTitle}</div>
      </div>
      <div class="cal-controls">
        <button class="nav-btn" data-action="nav-prev" title="Previous">${iconSVG('chev-l')}</button>
        <button class="today-btn" data-action="go-today">${iconSVG('calendar',13)} Go to today</button>
        <button class="nav-btn" data-action="nav-next" title="Next">${iconSVG('chev-r')}</button>
        <div class="view-switch">
          <button class="${S.view === 'month' ? 'active' : ''}" data-action="set-view" data-view="month">Month</button>
          <button class="${S.view === 'week' ? 'active' : ''}" data-action="set-view" data-view="week">Week</button>
        </div>
        <button class="delete-all" data-action="delete-all">${iconSVG('trash',12)} Delete all</button>
      </div>
    </div>`;

  // calendar grid
  let calGrid = '';
  if (S.view === 'week') {
    const cols = weekCells.map(d => {
      const k = dstr(d), isToday = k === todayStr, isSel = k === S.selectedDate;
      const dayTasks = (allTasksByDate[k] || []).filter(filterMatch);
      const isOverdue = overdueDates.has(k);
      return `<div class="week-col${isToday ? ' today' : ''}${isSel ? ' selected' : ''}" data-action="select-date" data-date="${k}">
        <div class="week-num">${isToday ? `<span class="n-pill">${d.getDate()}</span>` : d.getDate()}${isOverdue ? `<span class="overdue-dot" title="Overdue tasks"></span>` : ''}</div>
        <div class="week-tasks">${dayTasks.map(t => `
          <div class="task-pill${t.done ? ' done' : ''}" style="border-left-color:${tagVar(t.color)};background:color-mix(in oklab, ${tagVar(t.color)} 8%, var(--paper-2))" data-action="select-date" data-date="${k}" title="${esc(t.title)}">
            <span class="p-title">${esc(t.title)}</span>
            ${t.repeat && t.repeat !== 'none' ? '<span class="repeat-glyph">↻</span>' : ''}
          </div>`).join('')}
        </div>
      </div>`;
    }).join('');
    calGrid = `<div class="week-view-wrap">
      <div class="cal-weekdays">${weekCells.map(d => `<div>${WEEKDAYS_SUN[d.getDay()]}</div>`).join('')}</div>
      <div class="week-grid">${cols}</div>
    </div>`;
  } else {
    const cells = getCalendarCells();
    const rowStyle = S.settings.compact ? 'style="grid-auto-rows:minmax(76px,1fr)"' : '';
    calGrid = `
      <div class="cal-weekdays">${weekdays.map(w => `<div>${w}</div>`).join('')}</div>
      <div class="cal-grid" ${rowStyle}>
        ${cells.map(c => {
          const k = dstr(c.date), isToday = k === todayStr, isSel = k === S.selectedDate;
          const dayTasks = allTasksByDate[k] || [];
          const isOverdue = overdueDates.has(k);
          const filtered = dayTasks.filter(filterMatch);
          const dotsToShow = filtered.slice(0, 7), extraDots = filtered.length - dotsToShow.length;
          return `<div class="cal-cell${c.out ? ' out' : ''}${isToday ? ' today' : ''}${isSel ? ' selected' : ''}" data-action="select-date" data-date="${k}">
            <div class="num">${isToday ? `<span class="n-pill">${c.date.getDate()}</span>` : c.date.getDate()}${isOverdue ? `<span class="overdue-dot" title="Overdue tasks"></span>` : ''}</div>
            ${dotsToShow.length > 0 || extraDots > 0 ? `<div class="day-dots">
              ${dotsToShow.map(t => `<span class="day-dot${t.done ? ' faded' : ''}" style="background:${tagVar(t.color)}" title="${esc(t.title)}"></span>`).join('')}
              ${extraDots > 0 ? `<span class="day-dot-more">+${extraDots}</span>` : ''}
            </div>` : ''}
          </div>`;
        }).join('')}
      </div>`;
  }

  // day panel
  const dayPanel = `
    <div class="day-panel">
      <div class="day-panel-head">
        <div class="ttl">${esc(prettyDate(selected))}<span class="sub">${ordinal(selected.getDate())} of ${MONTHS[selected.getMonth()]}</span></div>
        <div class="day-panel-right">
          <span class="label-caps">${selectedExpTasks.length} task${selectedExpTasks.length !== 1 ? 's' : ''}</span>
          <div id="timer-wrap">${buildTimerHTML()}</div>
        </div>
      </div>
      ${selectedExpTasks.length === 0
        ? `<div class="empty">"An empty square, beautifully kept."</div>`
        : `<div class="task-list" id="task-list">
          ${selectedExpTasks.map(t => buildTaskItemHTML(t)).join('')}
        </div>`}
    </div>`;

  return calHead + calGrid + dayPanel;
}

function buildTaskItemHTML(t) {
  const originId = t.isOccurrence ? t.originId : t.id;
  const isOcc = t.isOccurrence ? '1' : '0';
  const occDate = t.isOccurrence ? t.date : '';
  const isRecurring = t.repeat && t.repeat !== 'none';
  const passes = filterMatch(t);
  const colorPop = S.colorPopFor === t.id ? `
    <div style="position:fixed;inset:0;z-index:15" data-action="close-color-pop"></div>
    <div class="color-pop">
      <div class="color-dot none-dot${t.color === null ? ' active' : ''}" data-action="set-task-color" data-origin-id="${esc(originId)}" data-color="" title="No color">✕</div>
      ${TAG_COLORS.map(c => `<div class="color-dot${t.color === c.id ? ' active' : ''}" style="background:${c.var}" data-action="set-task-color" data-origin-id="${esc(originId)}" data-color="${c.id}"></div>`).join('')}
    </div>` : '';

  const textContent = S.editingId === t.id
    ? `<input class="task-text task-edit-input" id="task-edit-inp-${esc(t.id)}" value="${esc(t.title)}" data-origin-id="${esc(originId)}" data-prev-title="${esc(t.title)}" style="width:100%;background:var(--paper);outline:1px solid var(--ink);border-radius:3px;padding:2px 4px;font-size:14px">`
    : `<div class="task-text${t.done ? ' done' : ''}">${esc(t.title)}</div>`;

  return `<div class="task-item" data-task-id="${esc(t.id)}" data-origin-id="${esc(originId)}" data-is-occ="${isOcc}" data-occ-date="${esc(occDate)}"
    draggable="${!isRecurring}"
    style="border-left-color:${tagVar(t.color)};opacity:${passes ? 1 : 0.35};cursor:${isRecurring ? 'default' : 'grab'}">
    <div class="checkbox${t.done ? ' checked' : ''}" data-action="toggle-done" data-origin-id="${esc(originId)}" data-is-occ="${isOcc}" data-occ-date="${esc(occDate)}" title="${t.done ? 'Mark undone' : 'Mark done'}">
      ${t.done ? iconSVG('check', 12) : ''}
    </div>
    <div class="task-body">
      ${textContent}
      <div class="task-meta">
        <span class="dot-mini" style="background:${tagVar(t.color)}"></span>
        <span style="text-transform:capitalize">${t.color || ''}</span>
        ${isRecurring ? `<span>·</span><span>repeats ${t.repeat}</span>` : ''}
        ${t.notes ? `<span>·</span><span>has notes</span>` : ''}
      </div>
    </div>
    <div class="task-actions">
      <button class="icon-btn${t.notes ? ' has-note' : ''}" data-action="open-notes" data-task-id="${esc(t.id)}" title="Notes">${iconSVG('note',14)}</button>
      <div style="position:relative">
        <button class="icon-btn" data-action="toggle-color-pop" data-task-id="${esc(t.id)}" title="Change color">${iconSVG('palette',14)}</button>
        ${colorPop}
      </div>
      <button class="icon-btn" data-action="start-edit" data-task-id="${esc(t.id)}" title="Edit">${iconSVG('edit',14)}</button>
      ${isRecurring && t.isOccurrence ? `<button class="icon-btn" data-action="dismiss-occurrence" data-origin-id="${esc(originId)}" data-occ-date="${esc(occDate)}" title="Skip today">${iconSVG('skip',14)}</button>` : ''}
      <button class="icon-btn danger" data-action="delete-task" data-origin-id="${esc(originId)}" title="Delete">${iconSVG('trash',14)}</button>
    </div>
  </div>`;
}

// ===== main render =====
function render() {
  const root = document.getElementById('root');
  if (!root) return;

  if (S.loading || !S.user) { root.innerHTML = buildLoadingHTML(); return; }

  // persist sidebar class state
  const sidebarEl = document.getElementById('sidebar');
  const sidebarScrollTop = sidebarEl ? sidebarEl.scrollTop : 0;

  // save input values before re-render
  const newTaskVal = (document.getElementById('new-task-input') || {}).value;
  const searchVal = (document.getElementById('search-input') || {}).value;
  const activeId = document.activeElement && document.activeElement.id;

  const expanded = getExpandedTasks();
  const tasksByDate = getTasksByDate(expanded);

  const topbar = document.getElementById('topbar');
  const sidebar = document.getElementById('sidebar');
  const main = document.getElementById('main');

  if (topbar) topbar.innerHTML = buildTopbarHTML();
  if (sidebar) sidebar.innerHTML = buildSidebarHTML(tasksByDate);
  if (main) main.innerHTML = buildMainHTML();

  // restore sidebar scroll
  const newSidebar = document.getElementById('sidebar');
  if (newSidebar && sidebarScrollTop) newSidebar.scrollTop = sidebarScrollTop;

  // restore input values
  const newTaskInp = document.getElementById('new-task-input');
  if (newTaskInp && newTaskVal !== undefined) { newTaskInp.value = newTaskVal; }
  const searchInp = document.getElementById('search-input');
  if (searchInp && searchVal !== undefined) { searchInp.value = searchVal; }

  // restore focus
  if (activeId && activeId !== 'new-task-input' && activeId !== 'search-input') {
    const el = document.getElementById(activeId);
    if (el) el.focus();
  }

  // focus edit input if in edit mode
  if (S.editingId) {
    const editInp = document.getElementById('task-edit-inp-' + S.editingId);
    if (editInp) { editInp.focus(); editInp.select(); }
  }

  // update theme
  document.documentElement.setAttribute('data-theme', S.settings.theme === 'dark' ? 'dark' : 'light');
  localStorage.setItem('todolander-settings', JSON.stringify(S.settings));
  localStorage.setItem('todolander-view', S.viewDate.toISOString());

  // trigger completion animations for newly checked tasks
  if (recentlyCompleted.size > 0) {
    recentlyCompleted.forEach(id => {
      const cb = document.querySelector(`.checkbox.checked[data-origin-id="${CSS.escape(id)}"]`);
      if (!cb) return;
      cb.classList.add('pop-check');
      const item = cb.closest('.task-item');
      if (item) item.classList.add('task-complete-anim');
    });
    recentlyCompleted.clear();
  }
}

// ===== event handling =====
document.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const action = el.dataset.action;

  // close menus via data-close
  if (el.dataset.close === 'user') S.userMenu = false;
  if (el.dataset.close === 'mobile') S.mobileMenuOpen = false;

  switch (action) {
    case 'toggle-sidebar': S.sidebarOpen = !S.sidebarOpen; {
      const sb = document.getElementById('sidebar');
      if (sb) sb.classList.toggle('mobile-open', S.sidebarOpen);
      const tb = document.getElementById('topbar');
      if (tb) tb.innerHTML = buildTopbarHTML();
      return;
    }
    case 'close-sidebar': S.sidebarOpen = false; {
      const sb = document.getElementById('sidebar');
      if (sb) sb.classList.remove('mobile-open');
      const tb = document.getElementById('topbar');
      if (tb) tb.innerHTML = buildTopbarHTML();
      return;
    }
    case 'toggle-mobile-menu': S.mobileMenuOpen = !S.mobileMenuOpen; render(); return;
    case 'close-mobile-menu': S.mobileMenuOpen = false; render(); return;
    case 'toggle-user-menu': S.userMenu = !S.userMenu; render(); return;
    case 'close-user-menu': S.userMenu = false; render(); return;

    case 'select-date': {
      const date = el.dataset.date;
      S.selectedDate = date; S.viewDate = parseDstr(date);
      S.sidebarOpen = false;
      render(); return;
    }
    case 'select-search-result': {
      const date = el.dataset.date;
      S.selectedDate = date; S.viewDate = parseDstr(date);
      S.query = ''; S.showSearchDrop = false;
      const si = document.getElementById('search-input'); if (si) si.value = '';
      render(); return;
    }

    case 'go-today': goToday(); return;
    case 'nav-prev': S.view === 'week' ? shiftWeek(-1) : shiftMonth(-1); return;
    case 'nav-next': S.view === 'week' ? shiftWeek(1) : shiftMonth(1); return;
    case 'set-view': S.view = el.dataset.view; render(); return;
    case 'delete-all': deleteAll(); return;
    case 'clear-done': clearDone(); return;
    case 'clear-filter': S.filterColors = []; render(); return;

    case 'toggle-filter-color': {
      const c = el.dataset.color;
      S.filterColors = S.filterColors.includes(c) ? S.filterColors.filter(x => x !== c) : [...S.filterColors, c];
      render(); return;
    }
    case 'set-new-color': S.newColor = el.dataset.color || null; render(); return;
    case 'set-new-repeat': S.newRepeat = el.dataset.repeat; render(); return;
    case 'add-task': addTask(); return;

    case 'toggle-timer': toggleTimer(); return;
    case 'reset-timer': resetTimer(); return;

    case 'toggle-done': toggleDone(el.dataset.originId, el.dataset.isOcc === '1', el.dataset.occDate); return;
    case 'delete-task': deleteTask(el.dataset.originId); return;
    case 'dismiss-occurrence': dismissOccurrence(el.dataset.originId, el.dataset.occDate); return;

    case 'toggle-color-pop': {
      const tid = el.dataset.taskId;
      S.colorPopFor = S.colorPopFor === tid ? null : tid; render(); return;
    }
    case 'close-color-pop': S.colorPopFor = null; render(); return;
    case 'set-task-color': updateTaskColor(el.dataset.originId, el.dataset.color || null); return;

    case 'start-edit': {
      S.editingId = el.dataset.taskId; render(); return;
    }
    case 'open-notes': {
      const tid = el.dataset.taskId;
      const expanded = getExpandedTasks();
      const task = getTasksByDate(expanded)[S.selectedDate]
        ? getTasksByDate(expanded)[S.selectedDate].find(t => t.id === tid)
        : null;
      if (!task) return;
      openNotesDrawer(task, notes => { updateTaskNotes(task.isOccurrence ? task.originId : task.id, notes); render(); });
      return;
    }

    case 'open-stats': S.userMenu = false; openStatsModal(S.tasks); return;
    case 'open-json': S.userMenu = false; openJsonModal(frontendToBackend(S.tasks), showToast); return;
    case 'open-import': S.userMenu = false; openImportModal(importTasks, showToast); return;
    case 'open-settings': S.userMenu = false; openSettingsModal(S.settings, newSettings => { S.settings = newSettings; render(); }, S.user); return;
    case 'open-notifs': S.userMenu = false; openNotificationsModal(showToast); return;
    case 'open-shortcuts': S.userMenu = false; openShortcutsModal(); return;
    case 'export-json': S.mobileMenuOpen = false; S.userMenu = false; exportJson(); return;
    case 'export-ical': S.mobileMenuOpen = false; S.userMenu = false; exportIcal(); return;
    case 'sign-out': signOut(); return;

  }
});


// search input
document.addEventListener('input', e => {
  if (e.target.id === 'search-input') {
    S.query = e.target.value; S.showSearchDrop = true;
    // re-render just the search dropdown area
    const si = document.getElementById('search-input');
    const savedVal = si ? si.value : S.query;
    const tb = document.getElementById('topbar');
    if (tb) tb.innerHTML = buildTopbarHTML();
    const si2 = document.getElementById('search-input');
    if (si2) { si2.value = savedVal; si2.focus(); si2.setSelectionRange && si2.setSelectionRange(savedVal.length, savedVal.length); }
  }
  if (e.target.id === 'new-task-input') {
    const btn = document.getElementById('add-task-btn');
    if (btn) btn.disabled = !e.target.value.trim();
  }
});

document.addEventListener('focus', e => {
  if (e.target.id === 'search-input') { S.showSearchDrop = true; }
}, true);

document.addEventListener('blur', e => {
  if (e.target.id === 'search-input') {
    setTimeout(() => { S.showSearchDrop = false; const tb = document.getElementById('topbar'); if (tb) tb.innerHTML = buildTopbarHTML(); const si = document.getElementById('search-input'); if (si) si.value = S.query; }, 150);
  }
  // commit inline edit on blur
  if (e.target.classList && e.target.classList.contains('task-edit-input')) {
    const inp = e.target;
    const originId = inp.dataset.originId;
    const prev = inp.dataset.prevTitle;
    const txt = inp.value.trim();
    S.editingId = null;
    if (txt && txt !== prev) updateTaskText(originId, txt); else render();
  }
}, true);

// inline edit keyboard
document.addEventListener('keydown', e => {
  if (e.target.classList && e.target.classList.contains('task-edit-input')) {
    if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
    if (e.key === 'Escape') { e.target.value = e.target.dataset.prevTitle; S.editingId = null; render(); }
    return;
  }
  if (e.target.id === 'new-task-input') {
    if (e.key === 'Enter') addTask();
    if (e.key === 'Escape') { e.target.value = ''; }
    return;
  }
  // global shortcuts (skip when typing in any input)
  const tag = document.activeElement && document.activeElement.tagName;
  const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
  if (e.key === 'Escape') {
    if (S.sidebarOpen) { S.sidebarOpen = false; const sb = document.getElementById('sidebar'); if (sb) sb.classList.remove('mobile-open'); const tb = document.getElementById('topbar'); if (tb) tb.innerHTML = buildTopbarHTML(); return; }
    if (S.mobileMenuOpen || S.userMenu) { S.mobileMenuOpen = false; S.userMenu = false; render(); return; }
    if (S.colorPopFor) { S.colorPopFor = null; render(); return; }
    if (S.query) { S.query = ''; S.showSearchDrop = false; const si = document.getElementById('search-input'); if (si) si.value = ''; render(); return; }
    if (S.editingId) { S.editingId = null; render(); return; }
  }
  if (isTyping) return;
  if (e.key === 'n') { e.preventDefault(); const inp = document.getElementById('new-task-input'); if (inp) inp.focus(); }
  if (e.key === 't') { e.preventDefault(); goToday(); }
  if (e.key === 'ArrowLeft') { e.preventDefault(); S.view === 'week' ? shiftWeek(-1) : shiftMonth(-1); }
  if (e.key === 'ArrowRight') { e.preventDefault(); S.view === 'week' ? shiftWeek(1) : shiftMonth(1); }
  if (e.key === '?') { e.preventDefault(); openShortcutsModal(); }
});

// drag and drop for task reorder
document.addEventListener('dragstart', e => {
  const item = e.target.closest('.task-item');
  if (!item || item.getAttribute('draggable') === 'false') return;
  draggingId = item.dataset.originId;
  e.dataTransfer.effectAllowed = 'move';
});
document.addEventListener('dragover', e => {
  const item = e.target.closest('.task-item');
  if (item) e.preventDefault();
});
document.addEventListener('drop', e => {
  const item = e.target.closest('.task-item');
  if (!item || !draggingId) return;
  const toId = item.dataset.originId;
  if (draggingId !== toId) reorderTasks(S.selectedDate, draggingId, toId);
  draggingId = null;
});


// ===== init =====
async function initApp() {
  // init DOM skeleton
  const root = document.getElementById('root');
  root.innerHTML = buildLoadingHTML();

  // skeleton for post-load
  const skeleton = document.createElement('div');
  skeleton.className = 'app'; skeleton.setAttribute('data-screen-label', '02 Calendar app');
  skeleton.innerHTML = `
    <header class="topbar" id="topbar"></header>
    <div class="body">
      <aside class="sidebar" id="sidebar"></aside>
      <div class="sidebar-backdrop" id="sidebar-backdrop"></div>
      <main class="main" id="main"></main>
    </div>`;

  // click on sidebar backdrop closes it
  skeleton.querySelector('#sidebar-backdrop').addEventListener('click', () => {
    S.sidebarOpen = false;
    const sb = document.getElementById('sidebar'); if (sb) sb.classList.remove('mobile-open');
  });

  // OAuth redirect lands here with token in URL — store it so getAuthHeaders() works on mobile
  // where cross-site cookies are blocked (same pattern as email/password login).
  const _initParams = new URLSearchParams(window.location.search);
  const _oauthToken = _initParams.get('oauth_token');
  if (_oauthToken) {
    const _existing = (() => { try { return JSON.parse(localStorage.getItem('todolander-user') || 'null'); } catch { return null; } })();
    localStorage.setItem('todolander-user', JSON.stringify({ ...(_existing || {}), token: _oauthToken }));
    history.replaceState(null, '', window.location.pathname);
  }

  try {
    const res = await fetch(`${API_BASE}/api/user`, { credentials: 'include', headers: getAuthHeaders(), cache: 'no-store' });
    if (res.status === 401) { localStorage.removeItem('todolander-user'); localStorage.removeItem('todolander_user'); window.location.href = 'index.html'; return; }
    if (!res.ok) throw new Error('Server error');

    const calData = await res.json();
    let loaded = backendToFrontend(calData);

    // auto-roll
    let didRoll = false;
    const settingsNow = (() => { try { return JSON.parse(localStorage.getItem('todolander-settings') || localStorage.getItem('todolander_settings') || '{}'); } catch { return {}; } })();
    if (settingsNow.autoRoll) {
      const rollKey = 'todolander-last-roll', todayStr = dstr(new Date());
      if (localStorage.getItem(rollKey) !== todayStr) {
        const yest = new Date(); yest.setDate(yest.getDate() - 1);
        const yesterStr = dstr(yest);
        const toRoll = new Set(loaded.filter(t => (!t.repeat || t.repeat === 'none') && t.date === yesterStr && !t.done).map(t => t.id));
        if (toRoll.size > 0) {
          loaded = loaded.map(t => toRoll.has(t.id) ? { ...t, date: todayStr } : t);
          localStorage.setItem(rollKey, todayStr);
          setTimeout(() => showToast(`Rolled ${toRoll.size} unfinished task${toRoll.size > 1 ? 's' : ''} to today`), 600);
          didRoll = true;
        }
      }
    }

    S.tasks = loaded;
    const savedUser = localStorage.getItem('todolander-user') || localStorage.getItem('todolander_user');
    try { S.user = savedUser ? JSON.parse(savedUser) : { name: 'User', email: '' }; } catch { S.user = { name: 'User', email: '' }; }

    try {
      const meRes = await fetch(`${API_BASE}/api/me`, { credentials: 'include', headers: getAuthHeaders(), cache: 'no-store' });
      if (meRes.ok) {
        const me = await meRes.json();
        S.user = { ...S.user, name: me.name || S.user.name, email: me.email || S.user.email, hasGoogle: !!me.hasGoogle };
        localStorage.setItem('todolander-user', JSON.stringify(S.user));
      }
    } catch {}
    S.loading = false;
    isLoaded = true;

    root.innerHTML = '';
    root.appendChild(skeleton);
    render();
    if (didRoll) scheduleSave();

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('linked')) {
      history.replaceState(null, '', window.location.pathname);
      setTimeout(() => showToast('Google account connected!'), 300);
    } else if (urlParams.get('error') === 'google_taken') {
      history.replaceState(null, '', window.location.pathname);
      setTimeout(() => showToast('That Google account is already linked to another user.'), 300);
    }
  } catch (err) {
    const root = document.getElementById('root');
    if (root) root.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;gap:16px;font-family:var(--sans,sans-serif);color:var(--ink,#1a1a1a)">
        <div style="font-size:15px;font-weight:500">Couldn't load your data</div>
        <div style="font-size:13px;color:var(--ink-3,#888);max-width:300px;text-align:center">${err && err.message === 'Server error' ? 'Server error — please try again in a moment.' : 'Check your connection and try again.'}</div>
        <button onclick="location.reload()" style="padding:8px 20px;border-radius:6px;border:1px solid var(--rule,#e0e0e0);background:var(--paper,#fff);cursor:pointer;font-size:14px">Retry</button>
        <a href="index.html" style="font-size:12px;color:var(--ink-3,#888)">Sign out</a>
      </div>`;
  }
}

initApp();
