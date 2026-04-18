// TodoLander — main app (connected to backend API)
var { useState, useEffect, useMemo, useRef } = React;
var API_BASE = 'https://dailytodo-api.onrender.com';

// ===== date helpers =====
const dstr = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
};
const parseDstr = (s) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const WEEKDAYS_SUN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAYS_MON = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const prettyDate = (d) =>
  `${WEEKDAYS_SUN[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
const ordinal = (n) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

// ===== auth helpers =====
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

// ===== data conversion: backend ↔ frontend =====
// Backend: { todos: { 'YYYY-MM-DD': [{id,text,done,color,notes}] }, recurring: [{id,text,frequency,startDate}], recurringState: { 'YYYY-MM-DD': { taskId: {done,dismissed} } } }
// Frontend: flat tasks array { id, title, date, color, done, notes, repeat, doneDates?, dismissedDates? }

function backendToFrontend(calData) {
  if (!calData) return [];
  const { todos = {}, recurring = [], recurringState = {} } = calData;
  const tasks = [];

  for (const [date, dayTasks] of Object.entries(todos)) {
    for (const task of dayTasks || []) {
      tasks.push({
        id: task.id,
        title: task.text || task.title || "", // backend uses 'text'; guard for old data with 'title'
        date,
        color: task.color || null,
        done: !!task.done,
        notes: task.notes || "",
        repeat: "none",
      });
    }
  }

  for (const task of recurring) {
    const startDate = task.startDate || task.start_date;
    const doneDates = [];
    const dismissedDates = [];
    for (const [date, dateState] of Object.entries(recurringState)) {
      if (dateState && dateState[task.id]) {
        if (dateState[task.id].done) doneDates.push(date);
        if (dateState[task.id].dismissed) dismissedDates.push(date);
      }
    }
    tasks.push({
      id: task.id,
      title: task.text || task.title || "",
      date: startDate,
      color: task.color || null,
      done: doneDates.includes(startDate),
      notes: task.notes || "",
      repeat: task.frequency || "daily",
      doneDates,
      dismissedDates,
    });
  }

  return tasks;
}

function frontendToBackend(tasks) {
  const todos = {};
  const recurring = [];
  const recurringState = {};

  for (const task of tasks) {
    if (!task.repeat || task.repeat === "none") {
      if (!todos[task.date]) todos[task.date] = [];
      todos[task.date].push({
        id: task.id,
        text: task.title,
        done: !!task.done,
        color: task.color,
        notes: task.notes || "",
      });
    } else {
      recurring.push({
        id: task.id,
        text: task.title,
        frequency: task.repeat,
        startDate: task.date,
        color: task.color,
        notes: task.notes || "",
      });
      for (const date of task.doneDates || []) {
        if (!recurringState[date]) recurringState[date] = {};
        recurringState[date][task.id] = {
          ...recurringState[date][task.id],
          done: true,
        };
      }
      for (const date of task.dismissedDates || []) {
        if (!recurringState[date]) recurringState[date] = {};
        recurringState[date][task.id] = {
          ...recurringState[date][task.id],
          dismissed: true,
        };
      }
    }
  }
  return { todos, recurring, recurringState };
}

// ===== repeat helpers =====
const expandRepeats = (tasks, rangeStart, rangeEnd) => {
  const out = [];
  for (const t of tasks) {
    if (!t.repeat || t.repeat === "none") {
      out.push(t);
      continue;
    }
    const base = parseDstr(t.date);
    if (base > rangeEnd) {
      out.push(t);
      continue;
    }
    out.push(t);
    const cursor = new Date(base);
    for (let i = 0; i < 400; i++) {
      if (t.repeat === "daily") cursor.setDate(cursor.getDate() + 1);
      else if (t.repeat === "weekly") cursor.setDate(cursor.getDate() + 7);
      else if (t.repeat === "monthly") cursor.setMonth(cursor.getMonth() + 1);
      else break;
      if (cursor > rangeEnd) break;
      if (cursor >= rangeStart) {
        const occDate = dstr(cursor);
        if ((t.dismissedDates || []).includes(occDate)) continue;
        out.push({
          ...t,
          id: t.id + "__occ__" + occDate,
          date: occDate,
          isOccurrence: true,
          originId: t.id,
          done: (t.doneDates || []).includes(occDate),
        });
      }
    }
  }
  return out;
};

// ===== iCal export =====
function buildIcal(tasks) {
  const esc = (s) =>
    (s || "")
      .replace(/\\/g, "\\\\")
      .replace(/,/g, "\\,")
      .replace(/;/g, "\\;")
      .replace(/\n/g, "\\n");
  const stamp =
    new Date().toISOString().replace(/[-:]/g, "").replace(/\..*/, "") + "Z";
  const nextDay = (iso) => {
    const d = new Date(iso + "T00:00:00");
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10).replace(/-/g, "");
  };
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//TodoLander//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  for (const t of tasks) {
    const ds = t.date.replace(/-/g, "");
    const de = nextDay(t.date);
    if (t.repeat && t.repeat !== "none") {
      const rrule =
        t.repeat === "daily"
          ? "RRULE:FREQ=DAILY"
          : t.repeat === "weekly"
            ? "RRULE:FREQ=WEEKLY"
            : "RRULE:FREQ=MONTHLY";
      lines.push(
        "BEGIN:VEVENT",
        `UID:${t.id}@todolander-recur`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${ds}`,
        `DTEND;VALUE=DATE:${de}`,
        rrule,
        `SUMMARY:${esc(t.title)}`,
      );
    } else {
      lines.push(
        "BEGIN:VEVENT",
        `UID:${t.id}@todolander`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${ds}`,
        `DTEND;VALUE=DATE:${de}`,
        `SUMMARY:${esc(t.title)}`,
      );
      if (t.notes) lines.push(`DESCRIPTION:${esc(t.notes)}`);
      if (t.done) lines.push("STATUS:COMPLETED");
    }
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

// ===== push helpers =====
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

// ========================================================================
// APP
// ========================================================================
function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState([]);
  const [settings, setSettings] = useState(() => {
    const raw =
      localStorage.getItem("todolander-settings") ||
      localStorage.getItem("todolander_settings");
    if (raw) {
      try {
        return {
          weekStart: 0,
          compact: false,
          autoRoll: false,
          confirmDelete: true,
          theme: "light",
          showCompleted: true,
          completedAtBottom: false,
          ...JSON.parse(raw),
        };
      } catch {}
    }
    return {
      weekStart: 0,
      compact: false,
      autoRoll: false,
      confirmDelete: true,
      theme: "light",
      showCompleted: true,
      completedAtBottom: false,
    };
  });

  const loadedTasksRef = useRef(null);
  const saveTimerRef = useRef(null);
  const addInputRef = useRef(null);
  const dragRef = useRef({ dragging: null });
  const toastTimerRef = useRef(null);

  // ---- load: authenticate + fetch data ----
  useEffect(() => {
    async function init() {
      try {
        const res = await fetch(`${API_BASE}/api/user`, {
          credentials: "include",
          headers: getAuthHeaders(),
        });
        if (res.status === 401) {
          window.location.href = "index.html";
          return;
        }
        if (!res.ok) throw new Error("Server error");

        const calData = await res.json();
        let loaded = backendToFrontend(calData);

        // auto-roll: move yesterday's incomplete one-time tasks to today (once per day)
        const settingsNow = JSON.parse(
          localStorage.getItem("todolander-settings") ||
            localStorage.getItem("todolander_settings") ||
            "{}",
        );
        let didRoll = false;
        if (settingsNow.autoRoll) {
          const rollKey = "todolander-last-roll";
          const todayStr = dstr(new Date());
          if (localStorage.getItem(rollKey) !== todayStr) {
            const yest = new Date();
            yest.setDate(yest.getDate() - 1);
            const yesterStr = dstr(yest);
            const toRoll = new Set(
              loaded
                .filter(
                  (t) =>
                    (!t.repeat || t.repeat === "none") &&
                    t.date === yesterStr &&
                    !t.done,
                )
                .map((t) => t.id),
            );
            if (toRoll.size > 0) {
              loaded = loaded.map((t) =>
                toRoll.has(t.id) ? { ...t, date: todayStr } : t,
              );
              localStorage.setItem(rollKey, todayStr);
              setTimeout(
                () =>
                  showToast(
                    `Rolled ${toRoll.size} unfinished task${toRoll.size > 1 ? "s" : ""} to today`,
                  ),
                600,
              );
              didRoll = true;
            }
          }
        }

        // Use sentinel ref when tasks were rolled so the save effect triggers
        loadedTasksRef.current = didRoll ? [] : loaded;
        setTasks(loaded);

        const savedUser =
          localStorage.getItem("todolander-user") ||
          localStorage.getItem("todolander_user");
        if (savedUser) {
          try {
            setUser(JSON.parse(savedUser));
          } catch {
            setUser({ name: "User", email: "" });
          }
        } else setUser({ name: "User", email: "" });
      } catch {
        window.location.href = "index.html";
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  // ---- save to API (debounced) ----
  useEffect(() => {
    if (tasks === loadedTasksRef.current) return;
    if (loadedTasksRef.current === null) return;
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/user`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", ...getAuthHeaders() },
          credentials: "include",
          body: JSON.stringify(frontendToBackend(tasks)),
        });
        if (res.status === 401) window.location.href = "index.html";
      } catch {}
    }, 1500);
  }, [tasks]);

  useEffect(() => {
    localStorage.setItem("todolander-settings", JSON.stringify(settings));
  }, [settings]);
  useEffect(() => {
    document.documentElement.setAttribute(
      "data-theme",
      settings.theme === "dark" ? "dark" : "light",
    );
  }, [settings.theme]);

  // ---- view state ----
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const [viewDate, setViewDate] = useState(() => {
    const s = localStorage.getItem("todolander-view");
    return s ? new Date(s) : new Date();
  });
  useEffect(() => {
    localStorage.setItem("todolander-view", viewDate.toISOString());
  }, [viewDate]);

  const [selectedDate, setSelectedDate] = useState(() => dstr(new Date()));
  const [view, setView] = useState("month");

  const [query, setQuery] = useState("");
  const [filterColors, setFilterColors] = useState([]);
  const [showSearchDrop, setShowSearchDrop] = useState(false);

  const [newTitle, setNewTitle] = useState("");
  const [newColor, setNewColor] = useState(null);
  const [newRepeat, setNewRepeat] = useState("none");

  const [notesTaskId, setNotesTaskId] = useState(null);
  const [showStats, setShowStats] = useState(false);
  const [showJson, setShowJson] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showNotifs, setShowNotifs] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [toast, setToast] = useState("");
  const [colorPopFor, setColorPopFor] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [userMenu, setUserMenu] = useState(false);
  const [tweaksOpen, setTweaksOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);

  const showToast = (msg) => {
    clearTimeout(toastTimerRef.current);
    setToast(msg);
    toastTimerRef.current = setTimeout(() => setToast(""), 2400);
  };

  // ---- keyboard shortcuts ----
  useEffect(() => {
    const onKey = (e) => {
      const tag = document.activeElement?.tagName;
      const isEditing =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        document.activeElement?.contentEditable === "true";
      if (e.key === "Escape") {
        if (sidebarOpen) {
          setSidebarOpen(false);
          return;
        }
        if (mobileMenuOpen) {
          setMobileMenuOpen(false);
          return;
        }
        if (exportMenuOpen) {
          setExportMenuOpen(false);
          return;
        }
        if (notesTaskId) {
          setNotesTaskId(null);
          return;
        }
        if (showShortcuts) {
          setShowShortcuts(false);
          return;
        }
        if (showSettings || showStats || showJson || showImport || showNotifs) {
          setShowSettings(false);
          setShowStats(false);
          setShowJson(false);
          setShowImport(false);
          setShowNotifs(false);
          return;
        }
        if (colorPopFor) {
          setColorPopFor(null);
          return;
        }
        if (userMenu) {
          setUserMenu(false);
          return;
        }
        if (query) {
          setQuery("");
          return;
        }
        if (editingId) {
          setEditingId(null);
          return;
        }
      }
      if (isEditing) return;
      if (e.key === "n") {
        e.preventDefault();
        addInputRef.current?.focus();
      }
      if (e.key === "t") {
        e.preventDefault();
        goToday();
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        view === "week" ? shiftWeek(-1) : shiftMonth(-1);
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        view === "week" ? shiftWeek(1) : shiftMonth(1);
      }
      if (e.key === "?") {
        e.preventDefault();
        setShowShortcuts((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    notesTaskId,
    showSettings,
    showStats,
    showJson,
    showImport,
    showNotifs,
    showShortcuts,
    colorPopFor,
    userMenu,
    query,
    editingId,
    view,
    sidebarOpen,
    mobileMenuOpen,
    exportMenuOpen,
  ]);

  // ---- derived ----
  const expandedTasks = useMemo(() => {
    const first = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
    const last = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0);
    const start = new Date(first);
    start.setDate(start.getDate() - 14);
    const end = new Date(last);
    end.setDate(end.getDate() + 14);
    return expandRepeats(tasks, start, end);
  }, [tasks, viewDate]);

  const filterMatch = (t) => {
    if (
      query &&
      !t.title.toLowerCase().includes(query.toLowerCase()) &&
      !(t.notes || "").toLowerCase().includes(query.toLowerCase())
    )
      return false;
    if (filterColors.length && !filterColors.includes(t.color)) return false;
    return true;
  };

  const tasksByDate = useMemo(() => {
    const map = {};
    for (const t of expandedTasks) (map[t.date] = map[t.date] || []).push(t);
    return map;
  }, [expandedTasks]);

  const searchResults = useMemo(() => {
    if (!query || query.length < 2) return [];
    const q = query.toLowerCase();
    const seen = new Set();
    return tasks
      .filter((t) => {
        if (seen.has(t.id)) return false;
        seen.add(t.id);
        return (
          t.title.toLowerCase().includes(q) ||
          (t.notes || "").toLowerCase().includes(q)
        );
      })
      .slice(0, 8);
  }, [tasks, query]);

  const overdueDates = useMemo(() => {
    const todayStr = dstr(today);
    const s = new Set();
    for (const [date, dayTasks] of Object.entries(tasksByDate)) {
      if (date >= todayStr) continue;
      if (dayTasks.some((t) => !t.done)) s.add(date);
    }
    return s;
  }, [tasksByDate, today]);

  // ---- calendar grids ----
  const calendarCells = useMemo(() => {
    const y = viewDate.getFullYear(),
      m = viewDate.getMonth();
    const first = new Date(y, m, 1);
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const startDay = (first.getDay() - settings.weekStart + 7) % 7;
    const cells = [];
    const prevDays = new Date(y, m, 0).getDate();
    for (let i = startDay - 1; i >= 0; i--)
      cells.push({ date: new Date(y, m - 1, prevDays - i), out: true });
    for (let d = 1; d <= daysInMonth; d++)
      cells.push({ date: new Date(y, m, d), out: false });
    while (cells.length % 7 !== 0 || cells.length < 42) {
      const last = cells[cells.length - 1].date;
      const d = new Date(last);
      d.setDate(last.getDate() + 1);
      cells.push({ date: d, out: true });
    }
    return cells;
  }, [viewDate, settings.weekStart]);

  const weekCells = useMemo(() => {
    const d = new Date(viewDate);
    const dow = (d.getDay() - settings.weekStart + 7) % 7;
    d.setDate(d.getDate() - dow);
    return Array.from({ length: 7 }, (_, i) => {
      const day = new Date(d);
      day.setDate(d.getDate() + i);
      return day;
    });
  }, [viewDate, settings.weekStart]);

  // ---- task actions ----
  const addTask = () => {
    if (!newTitle.trim()) return;
    const base = {
      id: "t" + Date.now() + Math.random().toString(36).slice(2, 6),
      title: newTitle.trim(),
      date: selectedDate,
      color: newColor,
      done: false,
      notes: "",
      repeat: newRepeat,
    };
    if (newRepeat !== "none") {
      base.doneDates = [];
      base.dismissedDates = [];
    }
    setTasks((prev) => [...prev, base]);
    setNewTitle("");
    setNewColor(null);
    setNewRepeat("none");
    showToast("Task added");
  };

  const toggleDone = (t) => {
    if (t.isOccurrence) {
      setTasks((prev) =>
        prev.map((x) => {
          if (x.id !== t.originId) return x;
          const dd = new Set(x.doneDates || []);
          dd.has(t.date) ? dd.delete(t.date) : dd.add(t.date);
          return { ...x, doneDates: Array.from(dd) };
        }),
      );
    } else if (t.repeat && t.repeat !== "none") {
      setTasks((prev) =>
        prev.map((x) => {
          if (x.id !== t.id) return x;
          const dd = new Set(x.doneDates || []);
          if (x.done || dd.has(x.date)) {
            dd.delete(x.date);
            return { ...x, done: false, doneDates: Array.from(dd) };
          }
          dd.add(x.date);
          return { ...x, done: true, doneDates: Array.from(dd) };
        }),
      );
    } else {
      setTasks((prev) =>
        prev.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)),
      );
    }
  };

  const dismissOccurrence = (t) => {
    const id = t.isOccurrence ? t.originId : t.id;
    const date = t.date;
    setTasks((prev) =>
      prev.map((x) => {
        if (x.id !== id) return x;
        const dd = new Set(x.dismissedDates || []);
        dd.add(date);
        return { ...x, dismissedDates: Array.from(dd) };
      }),
    );
    showToast("Skipped for today");
  };

  const updateTaskText = (t, text) => {
    const id = t.isOccurrence ? t.originId : t.id;
    setTasks((prev) =>
      prev.map((x) => (x.id === id ? { ...x, title: text } : x)),
    );
  };
  const updateTaskColor = (t, color) => {
    const id = t.isOccurrence ? t.originId : t.id;
    setTasks((prev) => prev.map((x) => (x.id === id ? { ...x, color } : x)));
    setColorPopFor(null);
  };
  const updateTaskNotes = (t, notes) => {
    const id = t.isOccurrence ? t.originId : t.id;
    setTasks((prev) => prev.map((x) => (x.id === id ? { ...x, notes } : x)));
  };

  const deleteTask = (t) => {
    if (settings.confirmDelete && !confirm("Delete this task?")) return;
    const id = t.isOccurrence ? t.originId : t.id;
    setTasks((prev) => prev.filter((x) => x.id !== id));
    showToast("Task deleted");
  };

  const deleteAll = () => {
    const toDelete =
      filterColors.length > 0
        ? tasks.filter((t) => filterColors.includes(t.color))
        : tasks;
    if (toDelete.length === 0) {
      showToast("Nothing to delete");
      return;
    }
    const msg =
      filterColors.length > 0
        ? `Delete ${toDelete.length} task${toDelete.length !== 1 ? "s" : ""} with the selected color${filterColors.length > 1 ? "s" : ""}? This cannot be undone.`
        : `Delete all ${toDelete.length} task${toDelete.length !== 1 ? "s" : ""}? This cannot be undone.`;
    if (settings.confirmDelete && !confirm(msg)) return;
    if (filterColors.length > 0) {
      setTasks((prev) => prev.filter((t) => !filterColors.includes(t.color)));
    } else {
      setTasks([]);
    }
    showToast("Tasks deleted.");
  };

  const clearDone = () => {
    const doneOnDate = tasks.filter(
      (t) =>
        t.date === selectedDate && t.done && (!t.repeat || t.repeat === "none"),
    ).length;
    const doneRecurOnDate = tasks.filter(
      (t) =>
        t.repeat &&
        t.repeat !== "none" &&
        (t.doneDates || []).includes(selectedDate),
    ).length;
    const doneCount = doneOnDate + doneRecurOnDate;
    if (doneCount === 0) {
      showToast("Nothing completed yet");
      return;
    }
    if (
      settings.confirmDelete &&
      !confirm(
        `Clear ${doneCount} completed task${doneCount !== 1 ? "s" : ""}?`,
      )
    )
      return;
    setTasks((prev) =>
      prev
        .filter(
          (t) =>
            !(
              t.date === selectedDate &&
              t.done &&
              (!t.repeat || t.repeat === "none")
            ),
        )
        .map((t) => {
          if (!t.repeat || t.repeat === "none") return t;
          if (!(t.doneDates || []).includes(selectedDate)) return t;
          return {
            ...t,
            doneDates: (t.doneDates || []).filter((d) => d !== selectedDate),
            dismissedDates: [
              ...new Set([...(t.dismissedDates || []), selectedDate]),
            ],
          };
        }),
    );
    showToast("Completed tasks cleared.");
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(frontendToBackend(tasks), null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "todolander-export.json";
    a.click();
    showToast("Exported JSON");
  };

  const exportIcal = () => {
    const blob = new Blob([buildIcal(tasks)], { type: "text/calendar" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "todolander.ics";
    a.click();
    showToast("Exported .ics");
  };

  const importTasks = (calData) => {
    const loaded = backendToFrontend(calData);
    loadedTasksRef.current = []; // sentinel: differs from loaded, triggers save
    setTasks(loaded);
    showToast("Import complete");
  };

  const signOut = async () => {
    try {
      await fetch(`${API_BASE}/api/logout`, {
        method: "POST",
        credentials: "include",
        headers: getAuthHeaders(),
      });
    } catch {}
    localStorage.removeItem("todolander-user");
    localStorage.removeItem("todolander_user");
    window.location.href = "index.html";
  };

  const goToday = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    setViewDate(d);
    setSelectedDate(dstr(d));
  };
  const shiftMonth = (delta) => {
    const d = new Date(viewDate);
    d.setDate(1);
    d.setMonth(d.getMonth() + delta);
    setViewDate(d);
  };
  const shiftWeek = (delta) => {
    const d = new Date(viewDate);
    d.setDate(d.getDate() + delta * 7);
    setViewDate(d);
  };

  // ---- drag-to-reorder (one-time tasks only) ----
  const reorderTasks = (date, fromId, toId) => {
    if (fromId === toId) return;
    setTasks((prev) => {
      const dt = prev.filter(
        (t) => t.date === date && (!t.repeat || t.repeat === "none"),
      );
      const rest = prev.filter(
        (t) => !(t.date === date && (!t.repeat || t.repeat === "none")),
      );
      const fi = dt.findIndex((t) => t.id === fromId),
        ti = dt.findIndex((t) => t.id === toId);
      if (fi < 0 || ti < 0) return prev;
      const reordered = [...dt];
      const [moved] = reordered.splice(fi, 1);
      reordered.splice(ti, 0, moved);
      return [...rest, ...reordered];
    });
  };

  // ---- tweaks protocol ----
  useEffect(() => {
    const onMsg = (e) => {
      const d = e.data || {};
      if (d.type === "__activate_edit_mode") setTweaksOpen(true);
      if (d.type === "__deactivate_edit_mode") setTweaksOpen(false);
    };
    window.addEventListener("message", onMsg);
    try {
      window.parent.postMessage({ type: "__edit_mode_available" }, "*");
    } catch {}
    return () => window.removeEventListener("message", onMsg);
  }, []);

  if (loading || !user) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16, color: "var(--ink-3)", fontFamily: "var(--sans)" }}>
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" style={{ animation: "spin 1s linear infinite" }}>
        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
      </svg>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      <span style={{ fontSize: 13, letterSpacing: "0.08em" }}>Loading…</span>
    </div>
  );

  const selected = parseDstr(selectedDate);
  const weekdays = settings.weekStart === 1 ? WEEKDAYS_MON : WEEKDAYS_SUN;
  const selectedTasks = (() => {
    let list = (tasksByDate[selectedDate] || []).slice();
    if (!settings.showCompleted) list = list.filter((t) => !t.done);
    if (settings.completedAtBottom)
      list.sort((a, b) => (a.done === b.done ? 0 : a.done ? 1 : -1));
    return list;
  })();
  const totalToday = selectedTasks.length;
  const doneToday = selectedTasks.filter((t) => t.done).length;
  const pct = totalToday ? Math.round((100 * doneToday) / totalToday) : 0;
  const firstName = (user.name || "").split(" ")[0] || "friend";
  const notesTask = notesTaskId
    ? expandedTasks.find((t) => t.id === notesTaskId)
    : null;
  const searchCount = query ? tasks.filter(filterMatch).length : null;

  return (
    <div className="app" data-screen-label="02 Calendar app">
      {/* =============== TOP BAR =============== */}
      <header className="topbar">
        <button
          className="hamburger"
          onClick={() => setSidebarOpen((v) => !v)}
          aria-label="Toggle menu"
        >
          <Icon name={sidebarOpen ? "close" : "menu"} size={18} />
        </button>
        <div className="brand">
          <TodoLanderLogo size={26} showWordmark={true} wordmarkSize={22} />
        </div>

        <div className="search" style={{ position: "relative" }}>
          <span className="s-icon">
            <Icon name="search" size={14} />
          </span>
          <input
            type="text"
            placeholder="Search tasks, notes…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setShowSearchDrop(true);
            }}
            onFocus={() => setShowSearchDrop(true)}
            onBlur={() => setTimeout(() => setShowSearchDrop(false), 150)}
          />
          {query && (
            <span className="s-count">
              {searchCount} match{searchCount === 1 ? "" : "es"}
            </span>
          )}
          {showSearchDrop && searchResults.length > 0 && (
            <div className="search-dropdown">
              {searchResults.map((t) => (
                <div
                  key={t.id}
                  className="search-result"
                  onMouseDown={() => {
                    setSelectedDate(t.date);
                    setViewDate(parseDstr(t.date));
                    setQuery("");
                    setShowSearchDrop(false);
                  }}
                >
                  <span
                    className="sr-dot"
                    style={{ background: tagVar(t.color) }}
                  />
                  <span className="sr-title">{t.title}</span>
                  <span className="sr-date">
                    {prettyDate(parseDstr(t.date))}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="tool-group">
          <button className="tb-btn" onClick={() => setShowImport(true)}>
            <Icon name="import" /> Import
          </button>
          <div style={{ position: "relative" }}>
            <button className="tb-btn" onClick={() => setExportMenuOpen((v) => !v)}>
              <Icon name="export" /> Export
            </button>
            {exportMenuOpen && (
              <>
                <div
                  style={{ position: "fixed", inset: 0, zIndex: 54 }}
                  onClick={() => setExportMenuOpen(false)}
                />
                <div className="mobile-menu" style={{ right: 0, left: "auto", minWidth: 160 }}>
                  <button
                    className="tb-btn"
                    onClick={() => { setExportMenuOpen(false); exportJson(); }}
                  >
                    <Icon name="export" size={13} /> Export JSON
                  </button>
                  <button
                    className="tb-btn"
                    onClick={() => { setExportMenuOpen(false); exportIcal(); }}
                  >
                    <Icon name="calendar" size={13} /> Export iCal
                  </button>
                </div>
              </>
            )}
          </div>
          <button className="tb-btn" onClick={() => setShowStats(true)}>
            <Icon name="stats" /> Stats
          </button>
          <button className="tb-btn" onClick={() => setShowJson(true)}>
            <Icon name="json" /> Raw
          </button>
          <button className="tb-btn" onClick={() => setShowSettings(true)}>
            <Icon name="settings" /> Settings
          </button>
          <div className="mobile-more-btn">
            <button
              className="tb-btn"
              onClick={() => setMobileMenuOpen((v) => !v)}
              title="More options"
            >
              <Icon name="more" size={16} />
            </button>
            {mobileMenuOpen && (
              <>
                <div
                  style={{ position: "fixed", inset: 0, zIndex: 54 }}
                  onClick={() => setMobileMenuOpen(false)}
                />
                <div className="mobile-menu">
                  <button
                    className="tb-btn"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      setShowImport(true);
                    }}
                  >
                    <Icon name="import" /> Import
                  </button>
                  <button
                    className="tb-btn"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      exportJson();
                    }}
                  >
                    <Icon name="export" /> Export JSON
                  </button>
                  <button
                    className="tb-btn"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      exportIcal();
                    }}
                  >
                    <Icon name="calendar" size={13} /> Export iCal
                  </button>
                  <hr />
                  <button
                    className="tb-btn"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      setShowStats(true);
                    }}
                  >
                    <Icon name="stats" /> Stats
                  </button>
                  <button
                    className="tb-btn"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      setShowJson(true);
                    }}
                  >
                    <Icon name="json" /> Raw JSON
                  </button>
                  <button
                    className="tb-btn"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      setShowSettings(true);
                    }}
                  >
                    <Icon name="settings" /> Settings
                  </button>
                  <hr />
                  <button
                    className="tb-btn danger"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      deleteAll();
                    }}
                  >
                    <Icon name="trash" size={12} /> Delete all
                  </button>
                </div>
              </>
            )}
          </div>
          <div className="tb-divider" />
          <div style={{ position: "relative" }}>
            <button
              className="user-chip"
              onClick={() => setUserMenu((v) => !v)}
            >
              <span className="avatar">
                {firstName.slice(0, 1).toUpperCase()}
              </span>
              <span>{firstName}</span>
              <span className="caret">▾</span>
            </button>
            {userMenu && (
              <>
                <div
                  style={{ position: "fixed", inset: 0, zIndex: 5 }}
                  onClick={() => setUserMenu(false)}
                />
                <div
                  style={{
                    position: "absolute",
                    top: "calc(100% + 6px)",
                    right: 0,
                    background: "var(--paper)",
                    border: "1px solid var(--rule)",
                    borderRadius: 8,
                    padding: 6,
                    minWidth: 180,
                    zIndex: 10,
                    boxShadow: "0 10px 30px oklch(0 0 0 / 0.08)",
                  }}
                >
                  <div
                    style={{
                      padding: "10px 12px",
                      borderBottom: "1px solid var(--rule)",
                      marginBottom: 4,
                    }}
                  >
                    <div style={{ fontWeight: 500, fontSize: 13 }}>
                      {user.name}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--ink-3)" }}>
                      {user.email}
                    </div>
                  </div>
                  <button
                    className="tb-btn"
                    style={{ width: "100%", justifyContent: "flex-start" }}
                    onClick={() => {
                      setUserMenu(false);
                      setShowSettings(true);
                    }}
                  >
                    <Icon name="settings" /> Settings
                  </button>
                  <button
                    className="tb-btn"
                    style={{ width: "100%", justifyContent: "flex-start" }}
                    onClick={() => {
                      setUserMenu(false);
                      setShowNotifs(true);
                    }}
                  >
                    <Icon name="bell" /> Notifications
                  </button>
                  <button
                    className="tb-btn"
                    style={{ width: "100%", justifyContent: "flex-start" }}
                    onClick={() => {
                      setUserMenu(false);
                      setShowShortcuts(true);
                    }}
                  >
                    <Icon name="keyboard" /> Shortcuts
                  </button>
                  <button
                    className="tb-btn danger"
                    style={{ width: "100%", justifyContent: "flex-start" }}
                    onClick={signOut}
                  >
                    <Icon name="signout" /> Sign out
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* =============== BODY =============== */}
      <div className="body">
        {sidebarOpen && (
          <div
            className="sidebar-backdrop"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        {/* ---------- SIDEBAR ---------- */}
        <aside className={`sidebar${sidebarOpen ? " mobile-open" : ""}`}>
          <button
            className="sidebar-close"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close menu"
          >
            <Icon name="close" size={16} />
          </button>
          <div className="greeting">
            <div className="eyebrow">{prettyDate(today)}</div>
            <h1>
              Welcome, <em>{firstName}.</em>
            </h1>
            <div className="today">
              {tasksByDate[dstr(today)]
                ? `${(tasksByDate[dstr(today)] || []).filter((t) => !t.done).length} tasks left today`
                : "A clean slate today."}
            </div>
          </div>

          <section className="sidebar-section">
            <h3>
              Add task{" "}
              <span
                style={{
                  fontWeight: 400,
                  textTransform: "none",
                  letterSpacing: "0.04em",
                  color: "var(--ink-3)",
                }}
              >
                + n
              </span>
            </h3>
            <div className="add-task">
              <div className="date-chip">
                <Icon name="calendar" size={11} />
                <span>for</span>
                <strong>{prettyDate(selected)}</strong>
              </div>
              <input
                ref={addInputRef}
                type="text"
                placeholder="What needs doing?"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addTask();
                  if (e.key === "Escape") setNewTitle("");
                }}
              />
              <div className="color-row">
                <div
                  className={
                    "color-dot none-dot" + (newColor === null ? " active" : "")
                  }
                  onClick={() => setNewColor(null)}
                  title="No color"
                >
                  ✕
                </div>
                {TAG_COLORS.map((c) => (
                  <div
                    key={c.id}
                    className={
                      "color-dot" + (newColor === c.id ? " active" : "")
                    }
                    style={{ background: c.var }}
                    onClick={() => setNewColor(c.id)}
                    title={c.id}
                  />
                ))}
              </div>
              <div className="repeat-row">
                {["none", "daily", "weekly", "monthly"].map((r) => (
                  <button
                    key={r}
                    className={newRepeat === r ? "active" : ""}
                    onClick={() => setNewRepeat(r)}
                  >
                    {r === "none" ? "once" : r}
                  </button>
                ))}
              </div>
              <button
                className="add-btn"
                onClick={addTask}
                disabled={!newTitle.trim()}
              >
                <Icon name="plus" size={13} /> Add task
              </button>
            </div>
          </section>

          <section className="sidebar-section">
            <h3>Filter by color</h3>
            <div className="filter-row">
              {TAG_COLORS.map((c) => (
                <div
                  key={c.id}
                  className={
                    "color-dot" + (filterColors.includes(c.id) ? " active" : "")
                  }
                  style={{ background: c.var }}
                  onClick={() =>
                    setFilterColors((prev) =>
                      prev.includes(c.id)
                        ? prev.filter((x) => x !== c.id)
                        : [...prev, c.id],
                    )
                  }
                  title={c.id}
                />
              ))}
            </div>
            <button
              className="clear-filter"
              onClick={() => setFilterColors([])}
            >
              {filterColors.length
                ? `Clear filter (${filterColors.length})`
                : "No filter"}
            </button>
            {filterColors.length > 0 && (
              <div className="active-filter-line">
                Showing: {filterColors.join(", ")}
              </div>
            )}
          </section>

          <section className="sidebar-section">
            <h3>
              Progress — {MONTHS_SHORT[selected.getMonth()]}{" "}
              {selected.getDate()}
            </h3>
            <div className="progress-card">
              <div className="progress-head">
                <div className="n">
                  {doneToday}
                  <span style={{ color: "var(--ink-3)", fontSize: 18 }}>
                    /{totalToday || 0}
                  </span>
                </div>
                <div className="l">{pct}% done</div>
              </div>
              <div className="progress-bar">
                <div className="fill" style={{ width: `${pct}%` }} />
              </div>
              <div className="progress-meta">
                <span>{totalToday - doneToday} remaining</span>
                <span>
                  {totalToday === 0
                    ? "empty day"
                    : pct === 100
                      ? "complete ✓"
                      : "keep going"}
                </span>
              </div>
              <button
                className="clear-done"
                onClick={clearDone}
                disabled={
                  tasks.filter(
                    (t) => t.done && (!t.repeat || t.repeat === "none"),
                  ).length === 0
                }
              >
                Clear done
              </button>
            </div>
          </section>
        </aside>

        {/* ---------- MAIN ---------- */}
        <main className="main">
          <div className="cal-head">
            <div>
              <div className="label-caps" style={{ marginBottom: 6 }}>
                Calendar
              </div>
              <div className="title">
                {view === "week" ? (
                  <>
                    Week of{" "}
                    <span className="yr">
                      {MONTHS_SHORT[weekCells[0].getMonth()]}{" "}
                      {weekCells[0].getDate()}, {weekCells[0].getFullYear()}
                    </span>
                  </>
                ) : (
                  <>
                    {MONTHS[viewDate.getMonth()]}
                    <span className="yr">{viewDate.getFullYear()}</span>
                  </>
                )}
              </div>
            </div>
            <div className="cal-controls">
              <button
                className="nav-btn"
                onClick={() =>
                  view === "week" ? shiftWeek(-1) : shiftMonth(-1)
                }
                title="Previous"
              >
                <Icon name="chev-l" />
              </button>
              <button className="today-btn" onClick={goToday}>
                <Icon name="calendar" size={13} /> Go to today
              </button>
              <button
                className="nav-btn"
                onClick={() => (view === "week" ? shiftWeek(1) : shiftMonth(1))}
                title="Next"
              >
                <Icon name="chev-r" />
              </button>
              <div className="view-switch">
                <button
                  className={view === "month" ? "active" : ""}
                  onClick={() => setView("month")}
                >
                  Month
                </button>
                <button
                  className={view === "week" ? "active" : ""}
                  onClick={() => setView("week")}
                >
                  Week
                </button>
              </div>
              <button className="delete-all" onClick={deleteAll}>
                <Icon name="trash" size={12} /> Delete all
              </button>
            </div>
          </div>

          {view === "week" ? (
            // ---- WEEK VIEW ----
            <div className="week-view-wrap">
              <div className="cal-weekdays">
                {weekCells.map((d, i) => (
                  <div key={i}>{WEEKDAYS_SUN[d.getDay()]}</div>
                ))}
              </div>
              <div className="week-grid">
                {weekCells.map((d, i) => {
                  const k = dstr(d);
                  const isToday = k === dstr(today);
                  const isSelected = k === selectedDate;
                  const dayTasks = tasksByDate[k] || [];
                  const isOverdue = overdueDates.has(k);
                  return (
                    <div
                      key={i}
                      className={
                        "week-col" +
                        (isToday ? " today" : "") +
                        (isSelected ? " selected" : "")
                      }
                      onClick={() => setSelectedDate(k)}
                    >
                      <div className="week-num">
                        {isToday ? (
                          <span className="n-pill">{d.getDate()}</span>
                        ) : (
                          d.getDate()
                        )}
                        {isOverdue && (
                          <span className="overdue-dot" title="Overdue tasks" />
                        )}
                      </div>
                      <div className="week-tasks">
                        {dayTasks.filter(filterMatch).map((t) => (
                          <div
                            key={t.id}
                            className={"task-pill" + (t.done ? " done" : "")}
                            style={{
                              borderLeftColor: tagVar(t.color),
                              background: `color-mix(in oklab, ${tagVar(t.color)} 8%, var(--paper-2))`,
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedDate(k);
                            }}
                            title={t.title}
                          >
                            <span className="p-title">{t.title}</span>
                            {t.repeat && t.repeat !== "none" && (
                              <span className="repeat-glyph">↻</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            // ---- MONTH VIEW ----
            <>
              <div className="cal-weekdays">
                {weekdays.map((w) => (
                  <div key={w}>{w}</div>
                ))}
              </div>
              <div
                className="cal-grid"
                style={
                  settings.compact
                    ? { gridAutoRows: "minmax(76px, 1fr)" }
                    : null
                }
              >
                {calendarCells.map((c, i) => {
                  const k = dstr(c.date);
                  const isToday = k === dstr(today);
                  const isSelected = k === selectedDate;
                  const dayTasks = tasksByDate[k] || [];
                  const isOverdue = overdueDates.has(k);
                  const filtered = dayTasks.filter(filterMatch);
                  const dotsToShow = filtered.slice(0, 7);
                  const extraDots = filtered.length - dotsToShow.length;
                  return (
                    <div
                      key={i}
                      className={
                        "cal-cell" +
                        (c.out ? " out" : "") +
                        (isToday ? " today" : "") +
                        (isSelected ? " selected" : "")
                      }
                      onClick={() => setSelectedDate(k)}
                    >
                      <div className="num">
                        {isToday ? (
                          <span className="n-pill">{c.date.getDate()}</span>
                        ) : (
                          c.date.getDate()
                        )}
                        {isOverdue && (
                          <span className="overdue-dot" title="Overdue tasks" />
                        )}
                      </div>
                      {(dotsToShow.length > 0 || extraDots > 0) && (
                        <div className="day-dots">
                          {dotsToShow.map((t, idx) => (
                            <span
                              key={idx}
                              className={"day-dot" + (t.done ? " faded" : "")}
                              style={{ background: tagVar(t.color) }}
                              title={t.title}
                            />
                          ))}
                          {extraDots > 0 && (
                            <span className="day-dot-more">+{extraDots}</span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Day detail panel */}
          <div className="day-panel">
            <div className="day-panel-head">
              <div className="ttl">
                {prettyDate(selected)}
                <span className="sub">
                  {ordinal(selected.getDate())} of {MONTHS[selected.getMonth()]}
                </span>
              </div>
              <span className="label-caps">
                {selectedTasks.length} task
                {selectedTasks.length !== 1 ? "s" : ""}
              </span>
            </div>

            {selectedTasks.length === 0 ? (
              <div className="empty">"An empty square, beautifully kept."</div>
            ) : (
              <div className="task-list">
                {selectedTasks.map((t) => {
                  const passes = filterMatch(t);
                  const isRecurring = t.repeat && t.repeat !== "none";
                  return (
                    <div
                      key={t.id}
                      className="task-item"
                      draggable={!isRecurring}
                      onDragStart={() => {
                        dragRef.current.dragging = t.isOccurrence
                          ? t.originId
                          : t.id;
                      }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => {
                        const toId = t.isOccurrence ? t.originId : t.id;
                        if (dragRef.current.dragging)
                          reorderTasks(
                            selectedDate,
                            dragRef.current.dragging,
                            toId,
                          );
                        dragRef.current.dragging = null;
                      }}
                      style={{
                        borderLeftColor: tagVar(t.color),
                        opacity: passes ? 1 : 0.35,
                        cursor: isRecurring ? "default" : "grab",
                      }}
                    >
                      <div
                        className={"checkbox" + (t.done ? " checked" : "")}
                        onClick={() => toggleDone(t)}
                        title={t.done ? "Mark undone" : "Mark done"}
                      >
                        {t.done && <Icon name="check" size={12} />}
                      </div>
                      <div className="task-body">
                        <div
                          className={"task-text" + (t.done ? " done" : "")}
                          contentEditable={editingId === t.id}
                          suppressContentEditableWarning
                          onBlur={(e) => {
                            if (editingId === t.id) {
                              const txt = e.currentTarget.textContent.trim();
                              if (txt && txt !== t.title)
                                updateTaskText(t, txt);
                              else e.currentTarget.textContent = t.title;
                              setEditingId(null);
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              e.currentTarget.blur();
                            }
                            if (e.key === "Escape") {
                              e.currentTarget.textContent = t.title;
                              setEditingId(null);
                              e.currentTarget.blur();
                            }
                          }}
                        >
                          {t.title}
                        </div>
                        <div className="task-meta">
                          <span
                            className="dot-mini"
                            style={{ background: tagVar(t.color) }}
                          />
                          <span style={{ textTransform: "capitalize" }}>
                            {t.color}
                          </span>
                          {isRecurring && (
                            <>
                              <span>·</span>
                              <span>repeats {t.repeat}</span>
                            </>
                          )}
                          {t.notes && (
                            <>
                              <span>·</span>
                              <span>has notes</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="task-actions">
                        <button
                          className={"icon-btn" + (t.notes ? " has-note" : "")}
                          onClick={() => setNotesTaskId(t.id)}
                          title="Notes"
                        >
                          <Icon name="note" size={14} />
                        </button>
                        <div style={{ position: "relative" }}>
                          <button
                            className="icon-btn"
                            onClick={() =>
                              setColorPopFor(colorPopFor === t.id ? null : t.id)
                            }
                            title="Change color"
                          >
                            <Icon name="palette" size={14} />
                          </button>
                          {colorPopFor === t.id && (
                            <>
                              <div
                                style={{
                                  position: "fixed",
                                  inset: 0,
                                  zIndex: 15,
                                }}
                                onClick={() => setColorPopFor(null)}
                              />
                              <div className="color-pop">
                                <div
                                  className={
                                    "color-dot none-dot" +
                                    (t.color === null ? " active" : "")
                                  }
                                  onClick={() => updateTaskColor(t, null)}
                                  title="No color"
                                >
                                  ✕
                                </div>
                                {TAG_COLORS.map((c) => (
                                  <div
                                    key={c.id}
                                    className={
                                      "color-dot" +
                                      (t.color === c.id ? " active" : "")
                                    }
                                    style={{ background: c.var }}
                                    onClick={() => updateTaskColor(t, c.id)}
                                  />
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                        <button
                          className="icon-btn"
                          onClick={() => setEditingId(t.id)}
                          title="Edit"
                        >
                          <Icon name="edit" size={14} />
                        </button>
                        {isRecurring && (
                          <button
                            className="icon-btn"
                            onClick={() => dismissOccurrence(t)}
                            title="Skip today"
                          >
                            <Icon name="skip" size={14} />
                          </button>
                        )}
                        <button
                          className="icon-btn danger"
                          onClick={() => deleteTask(t)}
                          title="Delete"
                        >
                          <Icon name="trash" size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </main>
      </div>

      {/* =============== MODALS & DRAWERS =============== */}
      {notesTask && (
        <NotesDrawer
          task={notesTask}
          onSave={(n) => updateTaskNotes(notesTask, n)}
          onClose={() => setNotesTaskId(null)}
        />
      )}
      {showStats && (
        <StatsModal tasks={tasks} onClose={() => setShowStats(false)} />
      )}
      {showJson && (
        <JsonModal
          calData={frontendToBackend(tasks)}
          user={user}
          onClose={() => setShowJson(false)}
          onToast={showToast}
        />
      )}
      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          onImport={importTasks}
          onToast={showToast}
        />
      )}
      {showSettings && (
        <SettingsModal
          settings={settings}
          onChange={setSettings}
          onClose={() => setShowSettings(false)}
          user={user}
        />
      )}
      {showNotifs && (
        <NotificationsModal
          onClose={() => setShowNotifs(false)}
          onToast={showToast}
        />
      )}
      {showShortcuts && (
        <ShortcutsModal onClose={() => setShowShortcuts(false)} />
      )}
      <Toast msg={toast} />

      {tweaksOpen && (
        <div className="tweaks">
          <h4>Tweaks</h4>
          <div className="tw-row">
            <label>Week starts on</label>
            <select
              value={settings.weekStart}
              onChange={(e) =>
                setSettings((s) => ({
                  ...s,
                  weekStart: Number(e.target.value),
                }))
              }
            >
              <option value={0}>Sunday</option>
              <option value={1}>Monday</option>
            </select>
          </div>
          <div className="tw-row">
            <label>Theme</label>
            <select
              value={settings.theme || "light"}
              onChange={(e) =>
                setSettings((s) => ({ ...s, theme: e.target.value }))
              }
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </div>
          <div className="tw-row">
            <label>Density</label>
            <select
              value={settings.compact ? "compact" : "comfortable"}
              onChange={(e) =>
                setSettings((s) => ({
                  ...s,
                  compact: e.target.value === "compact",
                }))
              }
            >
              <option value="comfortable">Comfortable</option>
              <option value="compact">Compact</option>
            </select>
          </div>
          <div className="tw-row">
            <label>Confirm deletes</label>
            <select
              value={settings.confirmDelete ? "on" : "off"}
              onChange={(e) =>
                setSettings((s) => ({
                  ...s,
                  confirmDelete: e.target.value === "on",
                }))
              }
            >
              <option value="on">On</option>
              <option value="off">Off</option>
            </select>
          </div>
        </div>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
