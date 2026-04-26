// TodoLander — auth page (sign in / create account)
const API_BASE = 'https://dailytodo-api.onrender.com';

const S = {
  mode: 'signup',
  name: '',
  email: '',
  password: '',
  showPw: false,
  errors: {},
  apiError: '',
  submitting: false,
};

function esc(s) {
  return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function pwStrength(pw) {
  if (!pw) return 0;
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[A-Z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return s;
}

function miniCalendarHTML() {
  const today = new Date();
  const y = today.getFullYear(), m = today.getMonth();
  const first = new Date(y, m, 1);
  const startDay = first.getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  while (cells.length < 35) cells.push(null);

  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const tagDays = { 3:'var(--tag-red)', 7:'var(--tag-blue)', 12:'var(--tag-green)', 18:'var(--tag-orange)', 22:'var(--tag-purple)', 26:'var(--tag-pink)' };
  const todayDate = today.getDate();

  const headers = ['S','M','T','W','T','F','S'].map(w =>
    `<div style="font-size:9px;letter-spacing:0.1em;color:oklch(0.6 0.01 60);aspect-ratio:auto;padding:0 0 6px 2px;background:transparent">${w}</div>`
  ).join('');

  const cellsHTML = cells.map(d => {
    if (!d) return `<div class="d"></div>`;
    const dot = tagDays[d] ? `<span class="d-dot" style="background:${tagDays[d]}"></span>` : '';
    return `<div class="d${d === todayDate ? ' today' : ''}">${d}${dot}</div>`;
  }).join('');

  return `<div class="preview rise rise-d2">
    <div class="preview-head">
      <div class="m">${months[m]}</div>
      <div class="y">${y}</div>
    </div>
    <div class="mini-grid">${headers}${cellsHTML}</div>
  </div>`;
}

function render() {
  // capture current input values before wiping DOM
  const nameEl = document.getElementById('inp-name');
  const emailEl = document.getElementById('inp-email');
  const pwEl = document.getElementById('inp-password');
  if (nameEl) S.name = nameEl.value;
  if (emailEl) S.email = emailEl.value;
  if (pwEl) S.password = pwEl.value;

  const strength = pwStrength(S.password);
  const strengthLabel = ['','weak','fair','good','strong'][strength];

  const nameField = S.mode === 'signup' ? `
    <div class="field${S.errors.name ? ' has-error' : ''}">
      <label>Full name</label>
      <input id="inp-name" type="text" value="${esc(S.name)}" placeholder="Jane Appleseed" autocomplete="name">
      ${S.errors.name ? `<div class="err">${esc(S.errors.name)}</div>` : ''}
    </div>` : '';

  const strengthWidget = S.mode === 'signup' && S.password ? `
    <div class="pw-strength">
      ${[1,2,3,4].map(i => `<div class="bar${i <= strength ? ' on-'+strength : ''}"></div>`).join('')}
    </div>
    <div class="pw-hint">Strength: ${strengthLabel}</div>` : '';

  const submitLabel = S.submitting ? 'One moment…' : (S.mode === 'signup' ? 'Create account' : 'Sign in');

  document.getElementById('root').innerHTML = `
    <div class="page">
      <aside class="hero" data-screen-label="01 Auth — hero">
        <div class="rise">
          <div class="brand">
            <svg width="28" height="28" viewBox="0 0 32 32" style="display:block;flex-shrink:0">
              <rect x="2.5" y="5.5" width="27" height="24" rx="4" fill="none" stroke="currentColor" stroke-width="2"/>
              <rect x="2.5" y="5.5" width="27" height="6" rx="4" fill="oklch(0.72 0.14 45)" stroke="oklch(0.72 0.14 45)" stroke-width="0.5"/>
              <line x1="10" y1="2.5" x2="10" y2="8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              <line x1="22" y1="2.5" x2="22" y2="8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              <line x1="4" y1="17" x2="28" y2="17" stroke="currentColor" stroke-width="1" opacity="0.35"/>
              <line x1="16" y1="12" x2="16" y2="29" stroke="currentColor" stroke-width="1" opacity="0.35"/>
              <path d="M7.5 21.5 L12 26 L24 14.5" fill="none" stroke="oklch(0.85 0.13 60)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span>Todo<span style="font-style:italic;color:oklch(0.85 0.13 60)">Lander</span></span>
          </div>
        </div>
        <div>
          <h1 class="rise rise-d1">A calendar<br>you'll actually <em>keep.</em></h1>
          <p class="rise rise-d2">Plan by the day, tag by the color, track by the month. A calm, editorial todo calendar for people who think in weeks, not lists.</p>
          ${miniCalendarHTML()}
          <div class="stats rise rise-d3">
            <div class="stat"><div class="n">7</div><div class="l">color tags</div></div>
            <div class="stat"><div class="n">&infin;</div><div class="l">tasks / day</div></div>
            <div class="stat"><div class="n">3s</div><div class="l">to add one</div></div>
          </div>
        </div>
        <div class="footnote rise rise-d3">
          <span>— vol. I, 2026</span>
          <span>mmxxvi</span>
        </div>
      </aside>
      <section class="form-side" data-screen-label="01 Auth — form">
        <div class="form-wrap">
          <div class="tab-switch">
            <button data-action="set-mode" data-mode="signin" class="${S.mode === 'signin' ? 'active' : ''}">Sign in</button>
            <button data-action="set-mode" data-mode="signup" class="${S.mode === 'signup' ? 'active' : ''}">Create account</button>
          </div>
          <h2 class="form-title">${S.mode === 'signup' ? 'Begin your calendar.' : 'Welcome back.'}</h2>
          <p class="form-sub">${S.mode === 'signup' ? 'Your tasks are saved to your account.' : 'Pick up where you left off.'}</p>
          <form id="auth-form" novalidate>
            ${nameField}
            <div class="field${S.errors.email ? ' has-error' : ''}">
              <label>Email</label>
              <input id="inp-email" type="email" value="${esc(S.email)}" placeholder="jane@example.com" autocomplete="email">
              ${S.errors.email ? `<div class="err">${esc(S.errors.email)}</div>` : ''}
            </div>
            <div class="field${S.errors.password ? ' has-error' : ''}">
              <label>Password</label>
              <div class="pw-wrap">
                <input id="inp-password" type="${S.showPw ? 'text' : 'password'}" value="${esc(S.password)}"
                  placeholder="${S.mode === 'signup' ? 'At least 8 characters' : '••••••••'}"
                  autocomplete="${S.mode === 'signup' ? 'new-password' : 'current-password'}"
                  style="padding-right:60px">
                <button type="button" data-action="toggle-pw" class="pw-toggle">${S.showPw ? 'hide' : 'show'}</button>
              </div>
              ${strengthWidget}
              ${S.errors.password ? `<div class="err">${esc(S.errors.password)}</div>` : ''}
            </div>
            <button type="submit" class="submit"${S.submitting ? ' disabled' : ''}>
              ${esc(submitLabel)}<span class="arrow">&#x2192;</span>
            </button>
            ${S.apiError ? `<div class="api-error">${esc(S.apiError)}</div>` : ''}
          </form>
          <div class="divider">or</div>
          <div class="sso">
            <button type="button" data-action="google-oauth">
              <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908C18.618 14.075 17.64 11.767 17.64 9.2z"/>
                <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/>
                <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
                <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z"/>
              </svg>
              Continue with Google
            </button>
          </div>
        </div>
      </section>
    </div>`;
}

function validate() {
  const e = {};
  if (S.mode === 'signup' && !S.name.trim()) e.name = 'Please enter your name';
  if (!S.email.trim()) e.email = 'Email required';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(S.email)) e.email = 'Please enter a valid email';
  if (!S.password) e.password = 'Password required';
  else if (S.password.length < 8) e.password = 'At least 8 characters';
  S.errors = e;
  return Object.keys(e).length === 0;
}

async function submit() {
  if (!validate()) { render(); return; }
  S.submitting = true;
  S.apiError = '';
  render();

  const endpoint = S.mode === 'signup' ? `${API_BASE}/api/signup` : `${API_BASE}/api/login`;
  const body = S.mode === 'signup'
    ? { email: S.email.trim(), password: S.password, name: S.name.trim() }
    : { email: S.email.trim(), password: S.password };

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    });
    const data = await res.json();

    if (!res.ok) {
      S.apiError = data.error || 'Something went wrong. Please try again.';
      S.submitting = false;
      render();
      return;
    }

    localStorage.setItem('todolander-user', JSON.stringify({
      name: data.data.name,
      email: data.data.email,
      token: data.data.token,
    }));
    window.location.href = 'app.html';
  } catch {
    S.apiError = 'Network error. Please check your connection and try again.';
    S.submitting = false;
    render();
  }
}

document.addEventListener('click', function(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;

  if (action === 'set-mode') {
    const nameEl = document.getElementById('inp-name');
    const emailEl = document.getElementById('inp-email');
    const pwEl = document.getElementById('inp-password');
    if (nameEl) S.name = nameEl.value;
    if (emailEl) S.email = emailEl.value;
    if (pwEl) S.password = pwEl.value;
    S.mode = btn.dataset.mode;
    S.errors = {};
    S.apiError = '';
    render();
  }

  if (action === 'google-oauth') {
    window.location.href = `${API_BASE}/auth/google`;
    return;
  }

  if (action === 'toggle-pw') {
    const pwEl = document.getElementById('inp-password');
    if (pwEl) S.password = pwEl.value;
    S.showPw = !S.showPw;
    render();
    const newPw = document.getElementById('inp-password');
    if (newPw) { newPw.focus(); newPw.setSelectionRange(newPw.value.length, newPw.value.length); }
  }
});

document.addEventListener('input', function(e) {
  if (e.target.id !== 'inp-password' || S.mode !== 'signup') return;
  S.password = e.target.value;
  const strength = pwStrength(S.password);
  const strengthLabel = ['','weak','fair','good','strong'][strength];
  const bars = document.querySelectorAll('.pw-strength .bar');
  if (bars.length) {
    bars.forEach((bar, i) => { bar.className = 'bar' + (i + 1 <= strength ? ' on-' + strength : ''); });
    const hint = document.querySelector('.pw-hint');
    if (hint) hint.textContent = 'Strength: ' + strengthLabel;
  } else if (S.password) {
    render();
    const pwEl = document.getElementById('inp-password');
    if (pwEl) { pwEl.focus(); pwEl.setSelectionRange(pwEl.value.length, pwEl.value.length); }
  }
});

document.addEventListener('submit', function(e) {
  if (e.target.id !== 'auth-form') return;
  e.preventDefault();
  const nameEl = document.getElementById('inp-name');
  const emailEl = document.getElementById('inp-email');
  const pwEl = document.getElementById('inp-password');
  if (nameEl) S.name = nameEl.value;
  if (emailEl) S.email = emailEl.value;
  if (pwEl) S.password = pwEl.value;
  submit();
});

(async function init() {
  const urlParams = new URLSearchParams(window.location.search);
  const oauthError = urlParams.get('error');
  if (oauthError) {
    S.apiError = oauthError === 'oauth_denied'
      ? 'Sign in was cancelled.'
      : 'Google sign in failed. Please try again.';
    // Clean the error param from the URL without triggering a reload
    history.replaceState(null, '', window.location.pathname);
  }

  let headers = {};
  try {
    const u = JSON.parse(localStorage.getItem('todolander-user') || localStorage.getItem('todolander_user') || 'null');
    if (u && u.token) headers = { Authorization: 'Bearer ' + u.token };
  } catch {}
  try {
    const res = await fetch(`${API_BASE}/api/user`, { credentials: 'include', headers, cache: 'no-store' });
    if (res.ok) { window.location.href = 'app.html'; return; }
  } catch {}
  render();
})();
