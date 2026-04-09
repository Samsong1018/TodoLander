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
const DAY_ABBR  = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

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

function addDays(dateStr, n) {
  const d = parseDate(dateStr);
  d.setDate(d.getDate() + n);
  return formatDate(d);
}

function addWeeks(dateStr, n) { return addDays(dateStr, n * 7); }

function addMonths(dateStr, n) {
  const d = parseDate(dateStr);
  d.setMonth(d.getMonth() + n);
  return formatDate(d);
}

// ── Color helpers ──

function isValidColor(color) {
  return VALID_COLORS.includes(color);
}

// ── Task normalization ──

function normalizeTask(raw) {
  if (typeof raw === 'string') {
    return { text: raw, done: false, color: null, repeat: 'none' };
  }
  return {
    text: raw.text || '',
    done: !!raw.done,
    color: isValidColor(raw.color) ? raw.color : null,
    repeat: ['none','daily','weekly','monthly'].includes(raw.repeat) ? raw.repeat : 'none',
  };
}

// Generate repeating task dates from a start date
function getRepeatDates(startDateStr, repeat) {
  const dates = [];
  if (repeat === 'daily') {
    for (let i = 1; i <= 30; i++) dates.push(addDays(startDateStr, i));
  } else if (repeat === 'weekly') {
    for (let i = 1; i <= 12; i++) dates.push(addWeeks(startDateStr, i));
  } else if (repeat === 'monthly') {
    for (let i = 1; i <= 12; i++) dates.push(addMonths(startDateStr, i));
  }
  return dates;
}

// ── Import / Export ──

function importJSON(str) {
  let raw;
  try { raw = JSON.parse(str); } catch { throw new Error('Invalid JSON format.'); }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('JSON must be an object with date keys.');
  }

  const result = {};
  for (const [key, val] of Object.entries(raw)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) continue;
    if (!Array.isArray(val)) continue;
    result[key] = val.map(normalizeTask).filter(t => t.text.trim());
  }
  return result;
}

function exportJSON(tasks) {
  const out = {};
  for (const [date, list] of Object.entries(tasks)) {
    if (list.length > 0) out[date] = list;
  }
  return JSON.stringify(out, null, 2);
}

function exportICal(tasks) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//TodoLander//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];

  for (const [dateStr, list] of Object.entries(tasks)) {
    for (const task of list) {
      const d = parseDate(dateStr);
      const dtStamp = formatDate(new Date()).replace(/-/g,'') + 'T000000Z';
      const dtStart = dateStr.replace(/-/g,'');
      const uid = `${dtStart}-${Math.random().toString(36).slice(2)}@todolander`;
      lines.push(
        'BEGIN:VEVENT',
        `UID:${uid}`,
        `DTSTAMP:${dtStamp}`,
        `DTSTART;VALUE=DATE:${dtStart}`,
        `SUMMARY:${escapeICal(task.text)}`,
        task.done ? 'STATUS:COMPLETED' : 'STATUS:NEEDS-ACTION',
        'END:VEVENT'
      );
    }
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

function escapeICal(str) {
  return str.replace(/[\\,;]/g, c => '\\' + c).replace(/\n/g, '\\n');
}

// ── Download helpers ──

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

// ── JSON spec string for Info Modal ──
const JSON_SPEC = `{
  "YYYY-MM-DD": [
    "Simple task string",
    {
      "text": "Task with options",
      "done": false,
      "color": "#22c55e",
      "repeat": "none"
    }
  ],
  "2026-04-10": [
    "Team standup at 9am",
    { "text": "Doctor appointment", "color": "#ef4444" },
    { "text": "Weekly review", "repeat": "weekly" }
  ]
}

Supported colors:
  #ef4444  Red
  #f97316  Orange
  #eab308  Yellow
  #22c55e  Green
  #3b82f6  Blue
  #6c63ff  Purple
  #ec4899  Pink

Repeat values: "none" | "daily" | "weekly" | "monthly"`;
