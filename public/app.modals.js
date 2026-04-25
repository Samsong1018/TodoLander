// helpers (esc, getAuthHeaders, API_BASE defined in app.main.js)

function urlBase64ToUint8Array(base64) {
  const p = '='.repeat((4 - (base64.length % 4)) % 4);
  const b = (base64 + p).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from([...atob(b)].map(c => c.charCodeAt(0)));
}

async function getPushSubscription() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
  const reg = await navigator.serviceWorker.ready.catch(() => null);
  return reg ? reg.pushManager.getSubscription() : null;
}

// ===== modal shell =====
function openModalShell(title, bodyHTML, maxWidth, onAfterInsert) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  const mw = maxWidth ? `max-width:${maxWidth}px` : '';
  backdrop.innerHTML = `
    <div class="modal" style="${mw}" id="modal-inner">
      <div class="modal-head">
        <h2>${esc(title)}</h2>
        <button class="close-x" id="modal-close-btn">${iconSVG('close', 16)}</button>
      </div>
      <div class="modal-body" id="modal-body-inner">${bodyHTML}</div>
    </div>`;
  backdrop.addEventListener('click', e => { if (e.target === backdrop) backdrop.remove(); });
  backdrop.querySelector('#modal-close-btn').addEventListener('click', () => backdrop.remove());
  document.body.appendChild(backdrop);
  if (onAfterInsert) onAfterInsert(backdrop);
  return backdrop;
}

// ===== notes drawer =====
function openNotesDrawer(task, onSave) {
  const backdrop = document.createElement('div');
  backdrop.className = 'drawer-backdrop';
  const drawer = document.createElement('div');
  drawer.className = 'drawer';
  drawer.innerHTML = `
    <div class="drawer-head">
      <div>
        <div class="ttl">${esc(task.title)}</div>
        <div class="sub">Notes</div>
      </div>
      <button class="close-x" id="drawer-close-btn">${iconSVG('close', 16)}</button>
    </div>
    <div class="drawer-body">
      <textarea id="drawer-ta" placeholder="Jot a plan, a reminder, a sub-list, a link…">${esc(task.notes || '')}</textarea>
      <div style="display:flex;gap:8px">
        <button class="btn-primary" id="drawer-save-btn">Save &amp; close</button>
        <button class="btn-ghost" id="drawer-clear-btn">Clear</button>
      </div>
    </div>`;

  function save() {
    const val = drawer.querySelector('#drawer-ta').value;
    onSave(val);
    backdrop.remove();
    drawer.remove();
  }
  backdrop.addEventListener('click', save);
  drawer.querySelector('#drawer-close-btn').addEventListener('click', save);
  drawer.querySelector('#drawer-save-btn').addEventListener('click', save);
  drawer.querySelector('#drawer-clear-btn').addEventListener('click', () => {
    drawer.querySelector('#drawer-ta').value = '';
  });
  document.body.appendChild(backdrop);
  document.body.appendChild(drawer);
  drawer.querySelector('#drawer-ta').focus();
}

// ===== stats modal =====
function openStatsModal(tasks) {
  const total = tasks.length;
  const todayStr = new Date().toISOString().slice(0, 10);
  const done = tasks.filter(t => (!t.repeat || t.repeat === 'none') ? t.done : (t.doneDates || []).length > 0).length;
  const overdue = tasks.filter(t => (!t.repeat || t.repeat === 'none') && t.date < todayStr && !t.done).length;

  let streak = 0;
  const td = new Date(); td.setHours(0, 0, 0, 0);
  for (let i = 0; i <= 365; i++) {
    const d = new Date(td); d.setDate(td.getDate() - i);
    const k = d.toISOString().slice(0, 10);
    const any = tasks.some(t => (!t.repeat || t.repeat === 'none') ? (t.date === k && t.done) : (t.doneDates || []).includes(k));
    if (!any) break;
    streak++;
  }

  const byColor = TAG_COLORS.map(c => ({
    id: c.id, var: c.var,
    count: tasks.filter(t => t.color === c.id).length,
    done: tasks.filter(t => t.color === c.id && ((!t.repeat || t.repeat === 'none') ? t.done : (t.doneDates || []).length > 0)).length,
  }));
  const max = Math.max(1, ...byColor.map(x => x.count));

  const streakDays = [];
  for (let i = 34; i >= 0; i--) {
    const d = new Date(td); d.setDate(td.getDate() - i);
    const k = d.toISOString().slice(0, 10);
    const cnt = tasks.filter(t => (!t.repeat || t.repeat === 'none') ? (t.date === k && t.done) : (t.doneDates || []).includes(k)).length;
    const lvl = cnt === 0 ? 0 : cnt <= 1 ? 1 : cnt <= 3 ? 2 : 3;
    streakDays.push({ k, lvl });
  }

  const overdueStyle = overdue > 0 ? `style="border-color:var(--tag-red)"` : '';
  const overdueNStyle = overdue > 0 ? `style="color:var(--tag-red)"` : '';

  const bodyHTML = `
    <div class="stats-grid">
      <div class="card"><div class="n">${total}</div><div class="l">Total tasks</div></div>
      <div class="card"><div class="n">${done}</div><div class="l">Completed</div></div>
      <div class="card" ${overdueStyle}><div class="n" ${overdueNStyle}>${overdue}</div><div class="l">Overdue</div></div>
      <div class="card"><div class="n">${streak}</div><div class="l">Day streak</div></div>
    </div>
    <div class="stats-bar-group">
      <h4>By color</h4>
      <div class="stats-bar">
        ${byColor.map(c => `
          <div class="stats-bar-row">
            <span class="lab"><span class="swatch" style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${c.var}"></span> ${esc(c.id)}</span>
            <div class="track"><div class="tf" style="width:${(c.count / max) * 100}%;background:${c.var}"></div></div>
            <span class="val">${c.done}/${c.count}</span>
          </div>`).join('')}
      </div>
    </div>
    <div class="stats-bar-group" style="margin-top:20px">
      <h4>Last 35 days</h4>
      <div class="streak">
        ${streakDays.map(s => `<div class="s lvl-${s.lvl}" title="${esc(s.k)}"></div>`).join('')}
      </div>
    </div>`;

  openModalShell('Stats', bodyHTML);
}

// ===== json modal =====
function openJsonModal(calData, onToast) {
  const json = JSON.stringify(calData, null, 2);
  const highlighted = json
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/("(\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*")(\s*:)?|\b(true|false|null)\b|-?\d+(\.\d+)?([eE][+-]?\d+)?/g, match => {
      if (/^"/.test(match)) return /:$/.test(match) ? `<span class="k">${match}</span>` : `<span class="s">${match}</span>`;
      if (/true|false|null/.test(match)) return `<span class="b">${match}</span>`;
      return `<span class="n">${match}</span>`;
    });

  const bodyHTML = `
    <p style="color:var(--ink-3);font-size:12px;margin:0 0 12px">Backend format — paste into Import to restore.</p>
    <div class="json-view">${highlighted}</div>
    <div class="modal-actions">
      <button class="btn-primary" id="json-copy-btn">${iconSVG('copy', 12)} Copy</button>
      <button class="btn-secondary" id="json-dl-btn">${iconSVG('export', 12)} Download</button>
    </div>`;

  openModalShell('Raw JSON', bodyHTML, null, bd => {
    bd.querySelector('#json-copy-btn').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(json); onToast('Copied to clipboard'); } catch { onToast('Copy failed'); }
    });
    bd.querySelector('#json-dl-btn').addEventListener('click', () => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      a.download = 'todolander.json'; a.click();
      onToast('Downloaded JSON');
    });
  });
}

// ===== import modal =====
const IMPORT_EXAMPLE = JSON.stringify({
  todos: { '2026-04-18': [{ id: 't1abc', text: 'Buy groceries', done: false, color: 'green', notes: '' }] },
  recurring: [{ id: 'r1abc', text: 'Morning workout', frequency: 'daily', startDate: '2026-04-01', color: 'blue', notes: '' }],
  recurringState: { '2026-04-18': { r1abc: { done: true, dismissed: false } } },
}, null, 2);

function openImportModal(onImport, onToast) {
  const bodyHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <p style="color:var(--ink-3);font-size:12px;margin:0">Paste JSON exported from TodoLander, or upload a .json file.</p>
      <button class="btn-ghost" id="import-example-btn" style="font-size:11px;white-space:nowrap;flex-shrink:0">↙ Paste example</button>
    </div>
    <textarea id="import-ta" placeholder='{"todos": {"2026-04-18": [...]}, "recurring": [], "recurringState": {}}' style="width:100%;min-height:180px;padding:12px;border-radius:8px;border:1px solid var(--rule);font-family:var(--mono);font-size:11px;background:var(--paper-2);resize:vertical"></textarea>
    <div id="import-err" style="color:var(--tag-red);font-size:12px;margin-top:8px;display:none"></div>
    <div class="modal-actions">
      <button class="btn-primary" id="import-go-btn" disabled>${iconSVG('import', 12)} Import</button>
      <input type="file" accept="application/json,.json" id="import-file-inp" style="display:none">
      <button class="btn-secondary" id="import-file-btn">Choose file…</button>
      <button class="btn-ghost" id="import-cancel-btn">Cancel</button>
    </div>`;

  openModalShell('Import', bodyHTML, null, bd => {
    const ta = bd.querySelector('#import-ta');
    const errEl = bd.querySelector('#import-err');
    const goBtn = bd.querySelector('#import-go-btn');

    function showErr(msg) { errEl.textContent = msg; errEl.style.display = 'block'; }
    function hideErr() { errEl.style.display = 'none'; }

    ta.addEventListener('input', () => { goBtn.disabled = !ta.value.trim(); hideErr(); });

    function parse(raw) {
      try {
        const data = JSON.parse(raw);
        if (data && typeof data === 'object' && 'todos' in data && !Array.isArray(data)) {
          onImport(data); bd.remove(); return;
        }
        const datePattern = /^\d{4}-\d{2}-\d{2}$/;
        if (data && typeof data === 'object' && !Array.isArray(data) && Object.keys(data).length > 0 && Object.keys(data).every(k => datePattern.test(k))) {
          onImport({ todos: data, recurring: [], recurringState: {} }); bd.remove(); return;
        }
        const tasks = Array.isArray(data) ? data : Array.isArray(data && data.tasks) ? data.tasks : null;
        if (tasks) {
          const todos = {};
          for (const t of tasks) {
            if (!t.date) continue;
            if (!todos[t.date]) todos[t.date] = [];
            todos[t.date].push({ id: t.id || 't' + Date.now() + Math.random().toString(36).slice(2), text: t.title || t.text || '', done: !!t.done, color: t.color || 'blue', notes: t.notes || '' });
          }
          onImport({ todos, recurring: [], recurringState: {} }); bd.remove(); return;
        }
        throw new Error('Unrecognized format. Export from TodoLander (JSON or iCal) and try again.');
      } catch (e) { showErr(e.message); }
    }

    bd.querySelector('#import-example-btn').addEventListener('click', () => { ta.value = IMPORT_EXAMPLE; goBtn.disabled = false; hideErr(); });
    goBtn.addEventListener('click', () => parse(ta.value));
    bd.querySelector('#import-file-btn').addEventListener('click', () => bd.querySelector('#import-file-inp').click());
    bd.querySelector('#import-file-inp').addEventListener('change', e => {
      const f = e.target.files[0]; if (!f) return;
      const r = new FileReader(); r.onload = () => parse(r.result); r.readAsText(f);
    });
    bd.querySelector('#import-cancel-btn').addEventListener('click', () => bd.remove());
  });
}

// ===== settings modal =====
function openSettingsModal(settings, onChange, user) {
  function buildBody(s) {
    const themeActive = (which) => s.theme === which || (which === 'light' && s.theme !== 'dark') ? `background:var(--ink);color:var(--paper)` : `background:var(--paper);color:var(--ink-2)`;
    return `
      <div class="setting-row">
        <div><div class="lab">Appearance</div><div class="sub">Light keeps it paper-calm. Dark is for late-night planning.</div></div>
        <div style="display:inline-flex;border:1px solid var(--rule);border-radius:6px;overflow:hidden">
          <button id="theme-light-btn" style="padding:8px 14px;font-size:12px;font-weight:500;display:inline-flex;align-items:center;gap:6px;${themeActive('light')}">☀ Light</button>
          <button id="theme-dark-btn" style="padding:8px 14px;font-size:12px;font-weight:500;display:inline-flex;align-items:center;gap:6px;${themeActive('dark')}">☾ Dark</button>
        </div>
      </div>
      <div class="setting-row">
        <div><div class="lab">Week starts on</div><div class="sub">Which day sits in the leftmost column</div></div>
        <select id="weekstart-sel" style="padding:8px 10px;border:1px solid var(--rule);border-radius:6px;background:var(--paper);font-size:13px">
          <option value="0" ${s.weekStart === 0 ? 'selected' : ''}>Sunday</option>
          <option value="1" ${s.weekStart === 1 ? 'selected' : ''}>Monday</option>
        </select>
      </div>
      <div class="setting-row">
        <div><div class="lab">Compact cells</div><div class="sub">Tighter month grid, shows more dates above the fold</div></div>
        <div class="toggle ${s.compact ? 'on' : ''}" id="toggle-compact"></div>
      </div>
      <div class="setting-row">
        <div><div class="lab">Auto-roll unfinished tasks</div><div class="sub">Move yesterday's incomplete tasks to today on next load</div></div>
        <div class="toggle ${s.autoRoll ? 'on' : ''}" id="toggle-autoroll"></div>
      </div>
      <div class="setting-row">
        <div><div class="lab">Show completed tasks</div><div class="sub">Display checked-off tasks in the day list</div></div>
        <div class="toggle ${s.showCompleted !== false ? 'on' : ''}" id="toggle-showcompleted"></div>
      </div>
      <div class="setting-row">
        <div><div class="lab">Move completed to bottom</div><div class="sub">Completed tasks sink to the end of the list</div></div>
        <div class="toggle ${s.completedAtBottom ? 'on' : ''}" id="toggle-completedbottom"></div>
      </div>
      <div class="setting-row">
        <div><div class="lab">Confirm destructive actions</div><div class="sub">Ask before deleting all tasks or clearing done</div></div>
        <div class="toggle ${s.confirmDelete ? 'on' : ''}" id="toggle-confirmdelete"></div>
      </div>
      <div class="setting-row">
        <div><div class="lab">Signed in as</div><div class="sub">${esc(user && user.email || '—')}</div></div>
        <div style="font-family:var(--serif);font-size:18px">${esc(user && user.name || '—')}</div>
      </div>
      <div class="setting-row">
        <div><div class="lab">Google account</div><div class="sub">${user && user.hasGoogle ? 'Linked — you can sign in with Google' : 'Link for one-click sign in'}</div></div>
        ${user && user.hasGoogle
          ? `<div style="display:flex;align-items:center;gap:5px;font-size:12px;color:var(--tag-green);font-weight:500">
               <svg width="13" height="13" viewBox="0 0 13 13"><polyline points="2,7 5,10 11,3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
               Connected
             </div>`
          : `<button id="connect-google-btn" class="btn-secondary">
               <svg width="14" height="14" viewBox="0 0 18 18" aria-hidden="true">
                 <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908C18.618 14.075 17.64 11.767 17.64 9.2z"/>
                 <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/>
                 <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
                 <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z"/>
               </svg>
               Connect Google
             </button>`}
      </div>`;
  }

  let cur = Object.assign({}, settings);

  openModalShell('Settings', buildBody(cur), null, bd => {
    function rebind() {
      const body = bd.querySelector('#modal-body-inner');
      body.innerHTML = buildBody(cur);
      bind();
    }
    function update(patch) { cur = Object.assign({}, cur, patch); onChange(cur); rebind(); }

    function bind() {
      bd.querySelector('#theme-light-btn').addEventListener('click', () => update({ theme: 'light' }));
      bd.querySelector('#theme-dark-btn').addEventListener('click', () => update({ theme: 'dark' }));
      bd.querySelector('#weekstart-sel').addEventListener('change', e => update({ weekStart: Number(e.target.value) }));
      bd.querySelector('#toggle-compact').addEventListener('click', () => update({ compact: !cur.compact }));
      bd.querySelector('#toggle-autoroll').addEventListener('click', () => update({ autoRoll: !cur.autoRoll }));
      bd.querySelector('#toggle-showcompleted').addEventListener('click', () => update({ showCompleted: cur.showCompleted === false }));
      bd.querySelector('#toggle-completedbottom').addEventListener('click', () => update({ completedAtBottom: !cur.completedAtBottom }));
      bd.querySelector('#toggle-confirmdelete').addEventListener('click', () => update({ confirmDelete: !cur.confirmDelete }));
      const connectGoogleBtn = bd.querySelector('#connect-google-btn');
      if (connectGoogleBtn) connectGoogleBtn.addEventListener('click', () => { window.location.href = `${API_BASE}/auth/google/link`; });
    }
    bind();
  });
}

// ===== notifications modal =====
function openNotificationsModal(onToast) {
  const supported = 'serviceWorker' in navigator && 'PushManager' in window;

  function buildBody(subStatus, prefs) {
    if (subStatus === 'unsupported') return `<div style="color:var(--ink-3);font-size:13px;padding:12px 0">Push notifications are not supported in this browser.</div>`;
    if (subStatus === 'denied') return `<div style="color:var(--tag-red);font-size:13px;padding:12px 0">Notifications are blocked. Enable them in your browser settings, then reload.</div>`;
    if (subStatus === 'checking') return `<div style="color:var(--ink-3);font-size:13px;padding:12px 0">Checking…</div>`;

    const isSubscribed = subStatus === 'subscribed';
    return `
      <div class="setting-row" style="margin-bottom:20px">
        <div><div class="lab">Push notifications</div><div class="sub">${isSubscribed ? 'Active on this device' : 'Not active on this device'}</div></div>
        ${isSubscribed
          ? `<button class="btn-secondary" id="notif-toggle-btn">Disable</button>`
          : `<button class="btn-primary" id="notif-toggle-btn">Enable</button>`}
      </div>
      ${isSubscribed ? `
        <div style="border-top:1px solid var(--rule);padding-top:16px;margin-bottom:16px">
          <h4 style="font-size:12px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:var(--ink-3);margin:0 0 14px">Schedule</h4>
          <div class="setting-row" style="margin-bottom:12px">
            <div><div class="lab">Morning digest</div><div class="sub">Daily task count for today</div></div>
            <div style="display:flex;align-items:center;gap:8px">
              <input type="time" id="md-time" value="${esc(prefs.morning_digest.time)}" style="padding:6px 8px;border:1px solid var(--rule);border-radius:6px;background:var(--paper);font-size:12px;color:var(--ink)">
              <div class="toggle ${prefs.morning_digest.enabled ? 'on' : ''}" id="toggle-md"></div>
            </div>
          </div>
          <div class="setting-row">
            <div><div class="lab">Overdue alert</div><div class="sub">Reminder if you have overdue tasks</div></div>
            <div style="display:flex;align-items:center;gap:8px">
              <input type="time" id="oa-time" value="${esc(prefs.overdue_alert.time)}" style="padding:6px 8px;border:1px solid var(--rule);border-radius:6px;background:var(--paper);font-size:12px;color:var(--ink)">
              <div class="toggle ${prefs.overdue_alert.enabled ? 'on' : ''}" id="toggle-oa"></div>
            </div>
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn-primary" id="notif-save-btn">Save preferences</button>
        </div>` : ''}`;
  }

  let subStatus = supported ? 'checking' : 'unsupported';
  let prefs = { morning_digest: { enabled: false, time: '08:00' }, overdue_alert: { enabled: false, time: '18:00' } };

  const bd = openModalShell('Notifications', buildBody(subStatus, prefs), 480);

  function rebind() {
    bd.querySelector('#modal-body-inner').innerHTML = buildBody(subStatus, prefs);
    bind();
  }

  function bind() {
    const toggleBtn = bd.querySelector('#notif-toggle-btn');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', async () => {
        if (subStatus === 'subscribed') await disablePush(); else await enablePush();
      });
    }
    const mdToggle = bd.querySelector('#toggle-md');
    if (mdToggle) mdToggle.addEventListener('click', () => { prefs.morning_digest.enabled = !prefs.morning_digest.enabled; rebind(); });
    const oaToggle = bd.querySelector('#toggle-oa');
    if (oaToggle) oaToggle.addEventListener('click', () => { prefs.overdue_alert.enabled = !prefs.overdue_alert.enabled; rebind(); });
    const saveBtn = bd.querySelector('#notif-save-btn');
    if (saveBtn) saveBtn.addEventListener('click', savePrefs);
  }

  async function enablePush() {
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') { subStatus = 'denied'; onToast('Notifications blocked'); rebind(); return; }
      const reg = await navigator.serviceWorker.ready;
      const keyRes = await fetch(`${API_BASE}/api/push/vapid-key`);
      const { publicKey } = await keyRes.json();
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
      await fetch(`${API_BASE}/api/push/subscribe`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ subscription: sub.toJSON(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
      });
      subStatus = 'subscribed'; onToast('Notifications enabled'); rebind();
    } catch { onToast('Could not enable notifications'); }
  }

  async function disablePush() {
    try {
      const sub = await getPushSubscription();
      if (sub) {
        await fetch(`${API_BASE}/api/push/subscribe`, {
          method: 'DELETE', credentials: 'include',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      subStatus = 'unsubscribed'; onToast('Notifications disabled'); rebind();
    } catch { onToast('Could not disable notifications'); }
  }

  async function savePrefs() {
    const mdTime = bd.querySelector('#md-time'); if (mdTime) prefs.morning_digest.time = mdTime.value;
    const oaTime = bd.querySelector('#oa-time'); if (oaTime) prefs.overdue_alert.time = oaTime.value;
    const saveBtn = bd.querySelector('#notif-save-btn');
    if (saveBtn) saveBtn.textContent = 'Saving…';
    try {
      await fetch(`${API_BASE}/api/push/prefs`, {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(prefs),
      });
      onToast('Preferences saved');
    } catch { onToast('Could not save preferences'); }
    if (saveBtn) saveBtn.textContent = 'Save preferences';
  }

  if (supported && Notification.permission === 'denied') {
    subStatus = 'denied'; rebind();
  } else if (supported) {
    getPushSubscription()
      .then(sub => { subStatus = sub ? 'subscribed' : 'unsubscribed'; rebind(); })
      .catch(() => { subStatus = 'unsubscribed'; rebind(); });
    fetch(`${API_BASE}/api/push/prefs`, { credentials: 'include', headers: getAuthHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          prefs = { morning_digest: Object.assign({ enabled: false, time: '08:00' }, data.morning_digest), overdue_alert: Object.assign({ enabled: false, time: '18:00' }, data.overdue_alert) };
          rebind();
        }
      }).catch(() => {});
  }

  bind();
}

// ===== shortcuts modal =====
function openShortcutsModal() {
  const rows = [
    ['n', 'Focus the add task input'],
    ['t', 'Jump to today'],
    ['← / →', 'Previous / next month or week'],
    ['?', 'Toggle this shortcuts panel'],
    ['Enter', 'Submit task name or confirm edit'],
    ['Escape', 'Close modal, dismiss search, cancel edit'],
    ['Drag', 'Reorder one-time tasks within a day'],
  ];
  const bodyHTML = `<table style="width:100%;border-collapse:collapse;font-size:13px"><tbody>
    ${rows.map(([key, desc]) => `
      <tr style="border-bottom:1px solid var(--rule)">
        <td style="padding:10px 12px 10px 0;white-space:nowrap">
          <kbd style="display:inline-block;padding:2px 7px;background:var(--paper-2);border:1px solid var(--rule);border-radius:4px;font-family:var(--mono);font-size:11px;font-weight:600;letter-spacing:0.03em">${esc(key)}</kbd>
        </td>
        <td style="padding:10px 0;color:var(--ink-2)">${esc(desc)}</td>
      </tr>`).join('')}
  </tbody></table>`;
  openModalShell('Keyboard shortcuts', bodyHTML, 440);
}
