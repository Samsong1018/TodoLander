/* ============================================
   TODOLANDER — State & Backend API
   ============================================ */

const API_BASE   = 'https://dailytodo-api.onrender.com';
const SETTINGS_KEY = 'todolander_settings';

// ── Auth ──

async function signOut() {
  await fetch(`${API_BASE}/api/logout`, {
    method: 'POST',
    credentials: 'include',
  }).catch(() => {});
  localStorage.removeItem('todolander_user');
  window.location.href = 'login.html';
}

// ── Backend load / save ──

async function loadFromBackend() {
  let res;
  try {
    res = await fetch(`${API_BASE}/api/user`, {
      credentials: 'include',
    });
  } catch (err) {
    console.error('Network error loading data:', err);
    throw new Error('Network error. Please check your connection and try again.');
  }

  if (res.status === 401) {
    localStorage.removeItem('todolander_user');
    window.location.href = 'login.html';
    return null;
  }

  if (!res.ok) {
    throw new Error(`Server error (${res.status}). Please try again later.`);
  }

  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error('Unexpected server response. Please try again later.');
  }

  return {
    todos:          data.todos          || {},
    recurring:      data.recurring      || [],
    recurringState: data.recurringState || {},
  };
}

async function saveToBackend(todos, recurring, recurringState) {
  try {
    await fetch(`${API_BASE}/api/user`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ todos, recurring, recurringState }),
    });
  } catch (err) {
    console.error('Failed to save:', err);
  }
}

// ── Settings (localStorage) ──

const DEFAULT_SETTINGS = {
  theme:             'dark',
  compact:           false,
  weekStartsMonday:  false,
  showCompleted:     true,
  completedAtBottom: false,
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

function applySettings(settings) {
  document.documentElement.setAttribute('data-theme', settings.theme);
  document.body.classList.toggle('compact', !!settings.compact);
}

// ── Push notifications ──

let notifPrefs = {
  morning_digest: { enabled: false, time: '08:00' },
  overdue_alert:  { enabled: false, time: '18:00' },
};
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
  await fetch(`${API_BASE}/api/push/subscribe`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      subscription: sub.toJSON(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }),
  });
}

async function removeSubscriptionFromServer(endpoint) {
  await fetch(`${API_BASE}/api/push/subscribe`, {
    method: 'DELETE',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint }),
  });
}

async function saveNotifPrefs() {
  await fetch(`${API_BASE}/api/push/prefs`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(notifPrefs),
  });
}

async function loadNotifPrefs() {
  const res = await fetch(`${API_BASE}/api/push/prefs`, {
    credentials: 'include',
  });
  if (res.ok) {
    const saved = await res.json();
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
