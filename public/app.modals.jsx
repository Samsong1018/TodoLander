// Modals, drawer, toast — shared UI for the app
var { useState, useEffect, useMemo, useRef } = React;
var API_BASE = 'https://dailytodo-api.onrender.com';

function Toast({ msg }) {
  if (!msg) return null;
  return <div className="toast">{msg}</div>;
}

function Modal({ title, onClose, children, maxWidth }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        style={maxWidth ? { maxWidth } : null}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="close-x" onClick={onClose}>
            <Icon name="close" size={16} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

function StatsModal({ tasks, onClose }) {
  const total = tasks.length;

  // Count done: one-time tasks with done=true, recurring with any completions
  const done = tasks.filter((t) => {
    if (!t.repeat || t.repeat === "none") return t.done;
    return (t.doneDates || []).length > 0;
  }).length;

  // Overdue: one-time tasks from before today still undone
  const todayStr = new Date().toISOString().slice(0, 10);
  const overdue = useMemo(
    () => tasks.filter((t) => (!t.repeat || t.repeat === "none") && t.date < todayStr && !t.done).length,
    [tasks, todayStr],
  );

  // Streak: consecutive days ending today with at least 1 completed task
  // Properly checks doneDates for recurring tasks
  const streak = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let count = 0;
    for (let i = 0; i <= 365; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const k = d.toISOString().slice(0, 10);
      const completedOnDay = tasks.some((t) => {
        if (!t.repeat || t.repeat === "none") return t.date === k && t.done;
        return (t.doneDates || []).includes(k);
      });
      if (!completedOnDay) break;
      count++;
    }
    return count;
  }, [tasks]);

  // By-color breakdown — done check respects recurring tasks
  const byColor = TAG_COLORS.map((c) => ({
    id: c.id,
    var: c.var,
    count: tasks.filter((t) => t.color === c.id).length,
    done: tasks.filter((t) => {
      if (t.color !== c.id) return false;
      if (!t.repeat || t.repeat === "none") return t.done;
      return (t.doneDates || []).length > 0;
    }).length,
  }));
  const max = Math.max(1, ...byColor.map((x) => x.count));

  // 35-day activity heatmap — counts completed occurrences including recurring
  const streakDays = [];
  const todayD = new Date();
  todayD.setHours(0, 0, 0, 0);
  for (let i = 34; i >= 0; i--) {
    const d = new Date(todayD);
    d.setDate(todayD.getDate() - i);
    const k = d.toISOString().slice(0, 10);
    const count = tasks.filter((t) => {
      if (!t.repeat || t.repeat === "none") return t.date === k && t.done;
      return (t.doneDates || []).includes(k);
    }).length;
    const lvl = count === 0 ? 0 : count <= 1 ? 1 : count <= 3 ? 2 : 3;
    streakDays.push({ k, lvl });
  }

  return (
    <Modal title="Stats" onClose={onClose}>
      <div className="stats-grid">
        <div className="card">
          <div className="n">{total}</div>
          <div className="l">Total tasks</div>
        </div>
        <div className="card">
          <div className="n">{done}</div>
          <div className="l">Completed</div>
        </div>
        <div className="card" style={overdue > 0 ? { borderColor: "var(--tag-red)" } : null}>
          <div className="n" style={overdue > 0 ? { color: "var(--tag-red)" } : null}>{overdue}</div>
          <div className="l">Overdue</div>
        </div>
        <div className="card">
          <div className="n">{streak}</div>
          <div className="l">Day streak</div>
        </div>
      </div>

      <div className="stats-bar-group">
        <h4>By color</h4>
        <div className="stats-bar">
          {byColor.map((c) => (
            <div className="stats-bar-row" key={c.id}>
              <span className="lab">
                <span className="swatch" style={{ background: c.var }} /> {c.id}
              </span>
              <div className="track">
                <div
                  className="tf"
                  style={{
                    width: `${(c.count / max) * 100}%`,
                    background: c.var,
                  }}
                />
              </div>
              <span className="val">
                {c.done}/{c.count}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="stats-bar-group" style={{ marginTop: 20 }}>
        <h4>Last 35 days</h4>
        <div className="streak">
          {streakDays.map((s) => (
            <div
              key={s.k}
              className={"s lvl-" + s.lvl}
              title={`${s.k}: ${s.lvl === 0 ? "no tasks" : s.lvl === 1 ? "1 task" : s.lvl === 2 ? "2–3 tasks" : "4+ tasks"}`}
            />
          ))}
        </div>
      </div>
    </Modal>
  );
}

function JsonModal({ calData, user, onClose, onToast }) {
  const json = JSON.stringify(calData, null, 2);
  const highlighted = useMemo(() => {
    return json
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(
        /("(\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*")(\s*:)?|\b(true|false|null)\b|-?\d+(\.\d+)?([eE][+-]?\d+)?/g,
        (match) => {
          if (/^"/.test(match)) {
            if (/:$/.test(match)) return '<span class="k">' + match + "</span>";
            return '<span class="s">' + match + "</span>";
          }
          if (/true|false|null/.test(match))
            return '<span class="b">' + match + "</span>";
          return '<span class="n">' + match + "</span>";
        },
      );
  }, [json]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(json);
      onToast("Copied to clipboard");
    } catch {
      onToast("Copy failed");
    }
  };
  const download = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(
      new Blob([json], { type: "application/json" }),
    );
    a.download = "todolander.json";
    a.click();
    onToast("Downloaded JSON");
  };

  return (
    <Modal title="Raw JSON" onClose={onClose}>
      <p style={{ color: "var(--ink-3)", fontSize: 12, margin: "0 0 12px" }}>
        Backend format — paste into Import to restore. User-identifying data not
        included.
      </p>
      <div
        className="json-view"
        dangerouslySetInnerHTML={{ __html: highlighted }}
      />
      <div className="modal-actions">
        <button className="btn-primary" onClick={copy}>
          <Icon name="copy" size={12} /> Copy
        </button>
        <button className="btn-secondary" onClick={download}>
          <Icon name="export" size={12} /> Download
        </button>
      </div>
    </Modal>
  );
}

const IMPORT_EXAMPLE = JSON.stringify(
  {
    todos: {
      "2026-04-18": [
        { id: "t1abc", text: "Buy groceries", done: false, color: "green", notes: "" },
        { id: "t2xyz", text: "Call dentist", done: true, color: "red", notes: "Ask about May 3rd" },
      ],
    },
    recurring: [
      { id: "r1abc", text: "Morning workout", frequency: "daily", startDate: "2026-04-01", color: "blue", notes: "" },
    ],
    recurringState: {
      "2026-04-18": { r1abc: { done: true, dismissed: false } },
    },
  },
  null,
  2,
);

function ImportModal({ onClose, onImport, onToast }) {
  const [txt, setTxt] = useState("");
  const [err, setErr] = useState("");
  const fileRef = useRef();

  // Normalize any supported format into backend calData: { todos, recurring, recurringState }
  const parse = (raw) => {
    try {
      const data = JSON.parse(raw);

      // Format A: backend format { todos, recurring, recurringState }
      if (
        data &&
        typeof data === "object" &&
        "todos" in data &&
        !Array.isArray(data)
      ) {
        onImport(data);
        onClose();
        return;
      }

      // Format B: old date-keyed export { "YYYY-MM-DD": [{text,done,color}] }
      const datePattern = /^\d{4}-\d{2}-\d{2}$/;
      if (
        data &&
        typeof data === "object" &&
        !Array.isArray(data) &&
        Object.keys(data).length > 0 &&
        Object.keys(data).every((k) => datePattern.test(k))
      ) {
        onImport({ todos: data, recurring: [], recurringState: {} });
        onClose();
        return;
      }

      // Format C: { tasks: [...] } or raw array
      const tasks = Array.isArray(data)
        ? data
        : Array.isArray(data?.tasks)
          ? data.tasks
          : null;
      if (tasks) {
        const todos = {};
        for (const t of tasks) {
          if (!t.date) continue;
          if (!todos[t.date]) todos[t.date] = [];
          todos[t.date].push({
            id: t.id || "t" + Date.now() + Math.random().toString(36).slice(2),
            text: t.title || t.text || "",
            done: !!t.done,
            color: t.color || "blue",
            notes: t.notes || "",
          });
        }
        onImport({ todos, recurring: [], recurringState: {} });
        onClose();
        return;
      }

      throw new Error(
        "Unrecognized format. Export from TodoLander (JSON or iCal) and try again.",
      );
    } catch (e) {
      setErr(e.message);
    }
  };

  const onFile = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => parse(r.result);
    r.readAsText(f);
  };

  return (
    <Modal title="Import" onClose={onClose}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <p style={{ color: "var(--ink-3)", fontSize: 12, margin: 0 }}>
          Paste JSON exported from TodoLander, or upload a .json file.
        </p>
        <button
          className="btn-ghost"
          style={{ fontSize: 11, whiteSpace: "nowrap", flexShrink: 0 }}
          onClick={() => { setTxt(IMPORT_EXAMPLE); setErr(""); }}
        >
          ↙ Paste example
        </button>
      </div>
      <textarea
        value={txt}
        onChange={(e) => {
          setTxt(e.target.value);
          setErr("");
        }}
        placeholder='{"todos": {"2026-04-18": [...]}, "recurring": [], "recurringState": {}}'
        style={{
          width: "100%",
          minHeight: 180,
          padding: 12,
          borderRadius: 8,
          border: "1px solid var(--rule)",
          fontFamily: "var(--mono)",
          fontSize: 11,
          background: "var(--paper-2)",
          resize: "vertical",
        }}
      />
      {err && (
        <div style={{ color: "var(--tag-red)", fontSize: 12, marginTop: 8 }}>
          {err}
        </div>
      )}
      <div className="modal-actions">
        <button
          className="btn-primary"
          disabled={!txt.trim()}
          onClick={() => parse(txt)}
        >
          <Icon name="import" size={12} /> Import
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          onChange={onFile}
          style={{ display: "none" }}
        />
        <button
          className="btn-secondary"
          onClick={() => fileRef.current.click()}
        >
          Choose file…
        </button>
        <button className="btn-ghost" onClick={onClose}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}

function SettingsModal({ settings, onChange, onClose, user }) {
  return (
    <Modal title="Settings" onClose={onClose}>
      <div className="setting-row">
        <div>
          <div className="lab">Appearance</div>
          <div className="sub">
            Light keeps it paper-calm. Dark is for late-night planning.
          </div>
        </div>
        <div
          style={{
            display: "inline-flex",
            border: "1px solid var(--rule)",
            borderRadius: 6,
            overflow: "hidden",
          }}
        >
          <button
            onClick={() => onChange({ ...settings, theme: "light" })}
            style={{
              padding: "8px 14px",
              fontSize: 12,
              fontWeight: 500,
              background:
                settings.theme !== "dark" ? "var(--ink)" : "var(--paper)",
              color:
                settings.theme !== "dark" ? "var(--paper)" : "var(--ink-2)",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            ☀ Light
          </button>
          <button
            onClick={() => onChange({ ...settings, theme: "dark" })}
            style={{
              padding: "8px 14px",
              fontSize: 12,
              fontWeight: 500,
              background:
                settings.theme === "dark" ? "var(--ink)" : "var(--paper)",
              color:
                settings.theme === "dark" ? "var(--paper)" : "var(--ink-2)",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            ☾ Dark
          </button>
        </div>
      </div>
      <div className="setting-row">
        <div>
          <div className="lab">Week starts on</div>
          <div className="sub">Which day sits in the leftmost column</div>
        </div>
        <select
          value={settings.weekStart}
          onChange={(e) =>
            onChange({ ...settings, weekStart: Number(e.target.value) })
          }
          style={{
            padding: "8px 10px",
            border: "1px solid var(--rule)",
            borderRadius: 6,
            background: "var(--paper)",
            fontSize: 13,
          }}
        >
          <option value={0}>Sunday</option>
          <option value={1}>Monday</option>
        </select>
      </div>
      <div className="setting-row">
        <div>
          <div className="lab">Compact cells</div>
          <div className="sub">
            Tighter month grid, shows more dates above the fold
          </div>
        </div>
        <div
          className={"toggle " + (settings.compact ? "on" : "")}
          onClick={() => onChange({ ...settings, compact: !settings.compact })}
        />
      </div>
      <div className="setting-row">
        <div>
          <div className="lab">Auto-roll unfinished tasks</div>
          <div className="sub">
            Move yesterday's incomplete tasks to today on next load
          </div>
        </div>
        <div
          className={"toggle " + (settings.autoRoll ? "on" : "")}
          onClick={() =>
            onChange({ ...settings, autoRoll: !settings.autoRoll })
          }
        />
      </div>
      <div className="setting-row">
        <div>
          <div className="lab">Show completed tasks</div>
          <div className="sub">Display checked-off tasks in the day list</div>
        </div>
        <div
          className={"toggle " + (settings.showCompleted !== false ? "on" : "")}
          onClick={() =>
            onChange({
              ...settings,
              showCompleted: settings.showCompleted === false,
            })
          }
        />
      </div>
      <div className="setting-row">
        <div>
          <div className="lab">Move completed to bottom</div>
          <div className="sub">Completed tasks sink to the end of the list</div>
        </div>
        <div
          className={"toggle " + (settings.completedAtBottom ? "on" : "")}
          onClick={() =>
            onChange({
              ...settings,
              completedAtBottom: !settings.completedAtBottom,
            })
          }
        />
      </div>
      <div className="setting-row">
        <div>
          <div className="lab">Confirm destructive actions</div>
          <div className="sub">
            Ask before deleting all tasks or clearing done
          </div>
        </div>
        <div
          className={"toggle " + (settings.confirmDelete ? "on" : "")}
          onClick={() =>
            onChange({ ...settings, confirmDelete: !settings.confirmDelete })
          }
        />
      </div>
      <div className="setting-row">
        <div>
          <div className="lab">Signed in as</div>
          <div className="sub">{user?.email || "—"}</div>
        </div>
        <div style={{ fontFamily: "var(--serif)", fontSize: 18 }}>
          {user?.name || "—"}
        </div>
      </div>
    </Modal>
  );
}

function NotificationsModal({ onClose, onToast }) {
  const supported = "serviceWorker" in navigator && "PushManager" in window;
  const [subStatus, setSubStatus] = useState("checking"); // 'checking' | 'unsupported' | 'denied' | 'subscribed' | 'unsubscribed'
  const [prefs, setPrefs] = useState({
    morning_digest: { enabled: false, time: "08:00" },
    overdue_alert: { enabled: false, time: "18:00" },
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!supported) {
      setSubStatus("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setSubStatus("denied");
      return;
    }
    getPushSubscription()
      .then((sub) => setSubStatus(sub ? "subscribed" : "unsubscribed"))
      .catch(() => setSubStatus("unsubscribed"));

    // Load prefs from API
    fetch(`${API_BASE}/api/push/prefs`, {
      credentials: "include",
      headers: getAuthHeaders(),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data)
          setPrefs((p) => ({
            morning_digest: {
              ...p.morning_digest,
              ...(data.morning_digest || {}),
            },
            overdue_alert: {
              ...p.overdue_alert,
              ...(data.overdue_alert || {}),
            },
          }));
      })
      .catch(() => {});
  }, []);

  const enablePush = async () => {
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setSubStatus("denied");
        onToast("Notifications blocked");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const keyRes = await fetch(`${API_BASE}/api/push/vapid-key`);
      const { publicKey } = await keyRes.json();
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      await fetch(`${API_BASE}/api/push/subscribe`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({
          subscription: sub.toJSON(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      setSubStatus("subscribed");
      onToast("Notifications enabled");
    } catch (e) {
      onToast("Could not enable notifications");
    }
  };

  const disablePush = async () => {
    try {
      const sub = await getPushSubscription();
      if (sub) {
        await fetch(`${API_BASE}/api/push/subscribe`, {
          method: "DELETE",
          credentials: "include",
          headers: { "Content-Type": "application/json", ...getAuthHeaders() },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setSubStatus("unsubscribed");
      onToast("Notifications disabled");
    } catch {
      onToast("Could not disable notifications");
    }
  };

  const savePrefs = async () => {
    setSaving(true);
    try {
      await fetch(`${API_BASE}/api/push/prefs`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify(prefs),
      });
      onToast("Preferences saved");
    } catch {
      onToast("Could not save preferences");
    }
    setSaving(false);
  };

  const setP = (type, field, value) =>
    setPrefs((p) => ({ ...p, [type]: { ...p[type], [field]: value } }));

  return (
    <Modal title="Notifications" onClose={onClose} maxWidth={480}>
      {subStatus === "unsupported" && (
        <div style={{ color: "var(--ink-3)", fontSize: 13, padding: "12px 0" }}>
          Push notifications are not supported in this browser.
        </div>
      )}
      {subStatus === "denied" && (
        <div
          style={{ color: "var(--tag-red)", fontSize: 13, padding: "12px 0" }}
        >
          Notifications are blocked. Enable them in your browser settings, then
          reload.
        </div>
      )}
      {subStatus === "checking" && (
        <div style={{ color: "var(--ink-3)", fontSize: 13, padding: "12px 0" }}>
          Checking…
        </div>
      )}
      {(subStatus === "subscribed" || subStatus === "unsubscribed") && (
        <>
          <div className="setting-row" style={{ marginBottom: 20 }}>
            <div>
              <div className="lab">Push notifications</div>
              <div className="sub">
                {subStatus === "subscribed"
                  ? "Active on this device"
                  : "Not active on this device"}
              </div>
            </div>
            {subStatus === "subscribed" ? (
              <button className="btn-secondary" onClick={disablePush}>
                Disable
              </button>
            ) : (
              <button className="btn-primary" onClick={enablePush}>
                Enable
              </button>
            )}
          </div>

          {subStatus === "subscribed" && (
            <>
              <div
                style={{
                  borderTop: "1px solid var(--rule)",
                  paddingTop: 16,
                  marginBottom: 16,
                }}
              >
                <h4
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "var(--ink-3)",
                    margin: "0 0 14px",
                  }}
                >
                  Schedule
                </h4>

                <div className="setting-row" style={{ marginBottom: 12 }}>
                  <div>
                    <div className="lab">Morning digest</div>
                    <div className="sub">Daily task count for today</div>
                  </div>
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 8 }}
                  >
                    <input
                      type="time"
                      value={prefs.morning_digest.time}
                      onChange={(e) =>
                        setP("morning_digest", "time", e.target.value)
                      }
                      style={{
                        padding: "6px 8px",
                        border: "1px solid var(--rule)",
                        borderRadius: 6,
                        background: "var(--paper)",
                        fontSize: 12,
                        color: "var(--ink)",
                      }}
                    />
                    <div
                      className={
                        "toggle " + (prefs.morning_digest.enabled ? "on" : "")
                      }
                      onClick={() =>
                        setP(
                          "morning_digest",
                          "enabled",
                          !prefs.morning_digest.enabled,
                        )
                      }
                    />
                  </div>
                </div>

                <div className="setting-row">
                  <div>
                    <div className="lab">Overdue alert</div>
                    <div className="sub">
                      Reminder if you have overdue tasks
                    </div>
                  </div>
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 8 }}
                  >
                    <input
                      type="time"
                      value={prefs.overdue_alert.time}
                      onChange={(e) =>
                        setP("overdue_alert", "time", e.target.value)
                      }
                      style={{
                        padding: "6px 8px",
                        border: "1px solid var(--rule)",
                        borderRadius: 6,
                        background: "var(--paper)",
                        fontSize: 12,
                        color: "var(--ink)",
                      }}
                    />
                    <div
                      className={
                        "toggle " + (prefs.overdue_alert.enabled ? "on" : "")
                      }
                      onClick={() =>
                        setP(
                          "overdue_alert",
                          "enabled",
                          !prefs.overdue_alert.enabled,
                        )
                      }
                    />
                  </div>
                </div>
              </div>
              <div className="modal-actions">
                <button
                  className="btn-primary"
                  onClick={savePrefs}
                  disabled={saving}
                >
                  {saving ? "Saving…" : "Save preferences"}
                </button>
              </div>
            </>
          )}
        </>
      )}
    </Modal>
  );
}

function ShortcutsModal({ onClose }) {
  const shortcuts = [
    ["n", "Focus the add task input"],
    ["t", "Jump to today"],
    ["← / →", "Previous / next month or week"],
    ["?", "Toggle this shortcuts panel"],
    ["Enter", "Submit task name or confirm edit"],
    ["Escape", "Close modal, dismiss search, cancel edit"],
    ["Drag", "Reorder one-time tasks within a day"],
  ];
  return (
    <Modal title="Keyboard shortcuts" onClose={onClose} maxWidth={440}>
      <table
        style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}
      >
        <tbody>
          {shortcuts.map(([key, desc]) => (
            <tr key={key} style={{ borderBottom: "1px solid var(--rule)" }}>
              <td style={{ padding: "10px 12px 10px 0", whiteSpace: "nowrap" }}>
                <kbd
                  style={{
                    display: "inline-block",
                    padding: "2px 7px",
                    background: "var(--paper-2)",
                    border: "1px solid var(--rule)",
                    borderRadius: 4,
                    fontFamily: "var(--mono)",
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: "0.03em",
                  }}
                >
                  {key}
                </kbd>
              </td>
              <td style={{ padding: "10px 0", color: "var(--ink-2)" }}>
                {desc}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}

function NotesDrawer({ task, onSave, onClose }) {
  const [notes, setNotes] = useState(task?.notes || "");
  useEffect(() => {
    setNotes(task?.notes || "");
  }, [task?.id]);

  const save = () => {
    onSave(notes);
    onClose();
  };

  if (!task) return null;
  return (
    <>
      <div className="drawer-backdrop" onClick={save} />
      <div className="drawer">
        <div className="drawer-head">
          <div>
            <div className="ttl">{task.title}</div>
            <div className="sub">Notes</div>
          </div>
          <button className="close-x" onClick={save}>
            <Icon name="close" size={16} />
          </button>
        </div>
        <div className="drawer-body">
          <textarea
            autoFocus
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Jot a plan, a reminder, a sub-list, a link…"
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn-primary" onClick={save}>
              Save & close
            </button>
            <button className="btn-ghost" onClick={() => setNotes("")}>
              Clear
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// getAuthHeaders must be available in this file too (NotificationsModal calls it)
function getAuthHeaders() {
  try {
    const u = JSON.parse(
      localStorage.getItem("todolander-user") ||
        localStorage.getItem("todolander_user") ||
        "null",
    );
    return u?.token ? { Authorization: `Bearer ${u.token}` } : {};
  } catch {
    return {};
  }
}
function urlBase64ToUint8Array(base64) {
  const p = "=".repeat((4 - (base64.length % 4)) % 4);
  const b = (base64 + p).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from([...atob(b)].map((c) => c.charCodeAt(0)));
}
async function getPushSubscription() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window))
    return null;
  const reg = await navigator.serviceWorker.ready.catch(() => null);
  return reg ? reg.pushManager.getSubscription() : null;
}

Object.assign(window, {
  Toast,
  Modal,
  StatsModal,
  JsonModal,
  ImportModal,
  SettingsModal,
  NotificationsModal,
  ShortcutsModal,
  NotesDrawer,
});
