/* ============================================
   TODOLANDER — Utility Functions
   ============================================ */

const VALID_COLORS = ['#ef4444','#f97316','#eab308','#22c55e','#3b82f6','#6c63ff','#ec4899'];

const COLOR_NAMES = {
  '#ef4444': 'Red',
  '#f97316': 'Orange',
  '#eab308': 'Yellow',
  '#22c55e': 'Green',
  '#3b82f6': 'Blue',
  '#6c63ff': 'Purple',
  '#ec4899': 'Pink',
};

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
];

const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

// ── Date helpers ──

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function todayStr() {
  return formatDate(new Date());
}

function formatDisplayDate(dateStr) {
  const d = parseDate(dateStr);
  return `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function formatDayName(dateStr) {
  const d = parseDate(dateStr);
  return DAY_NAMES[d.getDay()];
}

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year, month) {
  return new Date(year, month, 1).getDay();
}

// ── Color helpers ──

function isValidColor(color) {
  return VALID_COLORS.includes(color);
}

// ── Import helpers ──

function importJSONData(str) {
  let raw;
  try { raw = JSON.parse(str); } catch { throw new Error('Invalid JSON format.'); }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('JSON must be an object with date keys.');
  }
  const result = {};
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  for (const [key, val] of Object.entries(raw)) {
    if (!dateRe.test(key) || !Array.isArray(val)) continue;
    result[key] = val.map(item => {
      const text  = typeof item === 'string' ? item.trim()
                  : typeof item?.text === 'string' ? item.text.trim() : '';
      const color = (typeof item === 'object' && item !== null && isValidColor(item.color)) ? item.color : null;
      const done  = (typeof item === 'object' && item !== null) ? !!item.done : false;
      return text ? { text, color, done, id: Date.now() + Math.floor(Math.random() * 1000) } : null;
    }).filter(Boolean);
  }
  return result;
}

// ── Export helpers ──

function buildExportJSON(todos) {
  const out = {};
  for (const [date, list] of Object.entries(todos)) {
    if (list.length > 0) out[date] = list.map(t => ({ text: t.text, done: t.done, color: t.color || undefined }));
  }
  return JSON.stringify(out, null, 2);
}

function nextDayCompact(isoDate) {
  const d = new Date(isoDate + 'T00:00:00');
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

function buildExportICal(todos, recurring) {
  const esc = s => s.replace(/\\/g,'\\\\').replace(/,/g,'\\,').replace(/;/g,'\\;').replace(/\n/g,'\\n');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//TodoLander//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];

  for (const [dateStr, list] of Object.entries(todos)) {
    const d = dateStr.replace(/-/g, '');
    const dEnd = nextDayCompact(dateStr);
    for (const todo of list) {
      lines.push('BEGIN:VEVENT');
      lines.push(`UID:${todo.id || Date.now()}@todolander`);
      lines.push(`DTSTART;VALUE=DATE:${d}`);
      lines.push(`DTEND;VALUE=DATE:${dEnd}`);
      lines.push(`SUMMARY:${esc(todo.text)}`);
      if (todo.done) lines.push('STATUS:COMPLETED');
      lines.push('END:VEVENT');
    }
  }

  for (const task of (recurring || [])) {
    const d = task.startDate.replace(/-/g, '');
    const dEnd = nextDayCompact(task.startDate);
    const rrule = task.frequency === 'daily'  ? 'RRULE:FREQ=DAILY'
                : task.frequency === 'weekly' ? 'RRULE:FREQ=WEEKLY'
                : 'RRULE:FREQ=MONTHLY';
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${task.id}@todolander-recur`);
    lines.push(`DTSTART;VALUE=DATE:${d}`);
    lines.push(`DTEND;VALUE=DATE:${dEnd}`);
    lines.push(rrule);
    lines.push(`SUMMARY:${esc(task.text)}`);
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

// ── Download helper ──

function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function triggerFileUpload(accept, callback) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => callback(ev.target.result, file.name);
    reader.readAsText(file);
  };
  input.click();
}

function escapeHtml(str) {
  return str
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

// ── JSON spec for Info Modal ──
const JSON_SPEC = `{
  "YYYY-MM-DD": [
    "Simple task string",
    {
      "text": "Task with options",
      "done": false,
      "color": "#22c55e"
    }
  ],
  "2026-04-10": [
    "Team standup at 9am",
    { "text": "Doctor appointment", "color": "#ef4444" },
    { "text": "Buy groceries", "color": "#22c55e" }
  ]
}

Supported colors:
  #ef4444  Red    #f97316  Orange  #eab308  Yellow
  #22c55e  Green  #3b82f6  Blue    #6c63ff  Purple  #ec4899  Pink

Repeat options: None / Daily / Weekly / Monthly`;
