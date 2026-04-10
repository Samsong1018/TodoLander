/* ============================================
   TODOLANDER — Login / Register page logic
   ============================================ */

const API_BASE = 'https://dailytodo-api.onrender.com';

function switchTab(tab) {
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.auth-panel').forEach(p => p.classList.remove('active'));
  document.getElementById(tab === 'login' ? 'tabLogin' : 'tabRegister').classList.add('active');
  document.getElementById(tab === 'login' ? 'panelLogin' : 'panelRegister').classList.add('active');
}

function setError(wrapperId, errorId, show) {
  const wrapper = document.getElementById(wrapperId);
  const err = document.getElementById(errorId);
  if (show) { wrapper.classList.add('error'); err.style.display = 'block'; }
  else       { wrapper.classList.remove('error'); err.style.display = 'none'; }
  return !show;
}

function setApiError(id, msg) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.style.display = msg ? 'block' : 'none';
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function handleLogin(e) {
  e.preventDefault();
  const email    = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;

  let valid = true;
  valid = setError('loginEmailWrapper', 'loginEmailError', !email || !isValidEmail(email)) && valid;
  valid = setError('loginPasswordWrapper', 'loginPasswordError', !password) && valid;
  if (!valid) { shake(); return; }

  const btn = document.getElementById('loginSubmit');
  btn.disabled = true;
  btn.textContent = 'Signing in\u2026';
  setApiError('loginApiError', '');

  try {
    const res = await fetch(`${API_BASE}/api/login`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (res.ok) {
      localStorage.setItem('todolander_user', JSON.stringify({ email, name: data.data.name || email.split('@')[0], token: data.data.token }));
      window.location.href = 'dashboard.html';
    } else {
      setApiError('loginApiError', data.error || 'Sign in failed.');
      shake();
    }
  } catch {
    setApiError('loginApiError', 'Network error. Please try again.');
    shake();
  } finally {
    btn.disabled = false;
    btn.textContent = 'Sign In \u2192';
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const name     = document.getElementById('regName').value.trim();
  const email    = document.getElementById('regEmail').value.trim();
  const password = document.getElementById('regPassword').value;

  let valid = true;
  valid = setError('regNameWrapper', 'regNameError', !name) && valid;
  valid = setError('regEmailWrapper', 'regEmailError', !email || !isValidEmail(email)) && valid;
  valid = setError('regPasswordWrapper', 'regPasswordError', password.length < 8) && valid;
  if (!valid) { shake(); return; }

  const btn = document.getElementById('regSubmit');
  btn.disabled = true;
  btn.textContent = 'Creating\u2026';
  setApiError('regApiError', '');

  try {
    const res = await fetch(`${API_BASE}/api/signup`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name }),
    });
    const data = await res.json();
    if (res.ok) {
      localStorage.setItem('todolander_user', JSON.stringify({ email, name: data.data.name || name, token: data.data.token }));
      window.location.href = 'dashboard.html';
    } else {
      setApiError('regApiError', data.error || 'Sign up failed.');
      shake();
    }
  } catch {
    setApiError('regApiError', 'Network error. Please try again.');
    shake();
  } finally {
    btn.disabled = false;
    btn.textContent = 'Create Account \u2192';
  }
}

function shake() {
  const card = document.getElementById('authCard');
  card.classList.add('shake');
  setTimeout(() => card.classList.remove('shake'), 400);
}

// Wire up tab buttons, form submissions, and input error clearing.
// This file is loaded with defer so the DOM is already ready.
document.getElementById('tabLogin').addEventListener('click', () => switchTab('login'));
document.getElementById('tabRegister').addEventListener('click', () => switchTab('register'));
document.getElementById('loginForm').addEventListener('submit', handleLogin);
document.getElementById('registerForm').addEventListener('submit', handleRegister);

document.querySelectorAll('.neu-input').forEach(input => {
  input.addEventListener('input', () => {
    const wrapper = input.closest('.form-input-wrapper');
    if (wrapper) wrapper.classList.remove('error');
  });
});
