// TodoLander — auth page (sign in / create account)
const { useState, useEffect, useMemo } = React;
const API_BASE = 'https://dailytodo-api.onrender.com';

function MiniCalendar() {
  const today = new Date();
  const y = today.getFullYear(),
    m = today.getMonth();
  const first = new Date(y, m, 1);
  const startDay = first.getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  while (cells.length < 35) cells.push(null);

  const months = [
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
  const tagDays = {
    3: "var(--tag-red)",
    7: "var(--tag-blue)",
    12: "var(--tag-green)",
    18: "var(--tag-orange)",
    22: "var(--tag-purple)",
    26: "var(--tag-pink)",
  };

  return (
    <div className="preview rise rise-d2">
      <div className="preview-head">
        <div className="m">{months[m]}</div>
        <div className="y">{y}</div>
      </div>
      <div className="mini-grid">
        {["S", "M", "T", "W", "T", "F", "S"].map((w, i) => (
          <div
            key={"h" + i}
            style={{
              fontSize: 9,
              letterSpacing: "0.1em",
              color: "oklch(0.6 0.01 60)",
              aspectRatio: "auto",
              padding: "0 0 6px 2px",
              background: "transparent",
            }}
          >
            {w}
          </div>
        ))}
        {cells.map((d, i) => (
          <div
            key={i}
            className={"d" + (d === today.getDate() ? " today" : "")}
          >
            {d}
            {d && tagDays[d] && (
              <span className="d-dot" style={{ background: tagDays[d] }} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function App() {
  const [mode, setMode] = useState("signup"); // 'signin' | 'signup'
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Redirect if already authenticated
  useEffect(() => {
    let headers = {};
    try {
      const u = JSON.parse(localStorage.getItem("todolander-user") || localStorage.getItem("todolander_user") || "null");
      if (u?.token) headers = { Authorization: `Bearer ${u.token}` };
    } catch {}
    fetch(`${API_BASE}/api/user`, { credentials: "include", headers })
      .then((res) => {
        if (res.ok) window.location.href = "app.html";
      })
      .catch(() => {});
  }, []);

  const pwStrength = useMemo(() => {
    if (!password) return 0;
    let s = 0;
    if (password.length >= 8) s++;
    if (/[A-Z]/.test(password)) s++;
    if (/[0-9]/.test(password)) s++;
    if (/[^A-Za-z0-9]/.test(password)) s++;
    return s;
  }, [password]);

  const strengthLabel = ["", "weak", "fair", "good", "strong"][pwStrength];

  const validate = () => {
    const e = {};
    if (mode === "signup" && !name.trim()) e.name = "Please enter your name";
    if (!email.trim()) e.email = "Email required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      e.email = "Please enter a valid email";
    if (!password) e.password = "Password required";
    else if (password.length < 8) e.password = "At least 8 characters";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async (ev) => {
    ev.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    setApiError("");

    const endpoint = mode === "signup" ? `${API_BASE}/api/signup` : `${API_BASE}/api/login`;
    const body =
      mode === "signup"
        ? { email: email.trim(), password, name: name.trim() }
        : { email: email.trim(), password };

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok) {
        setApiError(data.error || "Something went wrong. Please try again.");
        setSubmitting(false);
        return;
      }

      // Store display info + token (token used as Bearer fallback on mobile Safari)
      localStorage.setItem(
        "todolander-user",
        JSON.stringify({
          name: data.data.name,
          email: data.data.email,
          token: data.data.token,
        }),
      );
      window.location.href = "app.html";
    } catch (e) {
      setApiError("Network error. Please check your connection and try again.");
      setSubmitting(false);
    }
  };

  return (
    <div className="page">
      <aside className="hero" data-screen-label="01 Auth — hero">
        <div className="rise">
          <div className="brand">
            <svg
              width="28"
              height="28"
              viewBox="0 0 32 32"
              style={{ display: "block", flexShrink: 0 }}
            >
              <rect
                x="2.5"
                y="5.5"
                width="27"
                height="24"
                rx="4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              />
              <rect
                x="2.5"
                y="5.5"
                width="27"
                height="6"
                rx="4"
                fill="oklch(0.72 0.14 45)"
                stroke="oklch(0.72 0.14 45)"
                strokeWidth="0.5"
              />
              <line
                x1="10"
                y1="2.5"
                x2="10"
                y2="8"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <line
                x1="22"
                y1="2.5"
                x2="22"
                y2="8"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <line
                x1="4"
                y1="17"
                x2="28"
                y2="17"
                stroke="currentColor"
                strokeWidth="1"
                opacity="0.35"
              />
              <line
                x1="16"
                y1="12"
                x2="16"
                y2="29"
                stroke="currentColor"
                strokeWidth="1"
                opacity="0.35"
              />
              <path
                d="M7.5 21.5 L12 26 L24 14.5"
                fill="none"
                stroke="oklch(0.85 0.13 60)"
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span>
              Todo
              <span
                style={{ fontStyle: "italic", color: "oklch(0.85 0.13 60)" }}
              >
                Lander
              </span>
            </span>
          </div>
        </div>

        <div>
          <h1 className="rise rise-d1">
            A calendar
            <br />
            you'll actually <em>keep.</em>
          </h1>
          <p className="rise rise-d2">
            Plan by the day, tag by the color, track by the month. A calm,
            editorial todo calendar for people who think in weeks, not lists.
          </p>
          <MiniCalendar />
          <div className="stats rise rise-d3">
            <div className="stat">
              <div className="n">7</div>
              <div className="l">color tags</div>
            </div>
            <div className="stat">
              <div className="n">∞</div>
              <div className="l">tasks / day</div>
            </div>
            <div className="stat">
              <div className="n">3s</div>
              <div className="l">to add one</div>
            </div>
          </div>
        </div>

        <div className="footnote rise rise-d3">
          <span>— vol. I, 2026</span>
          <span>mmxxvi</span>
        </div>
      </aside>

      <section className="form-side" data-screen-label="01 Auth — form">
        <div className="form-wrap">
          <div className="tab-switch">
            <button
              className={mode === "signin" ? "active" : ""}
              onClick={() => {
                setMode("signin");
                setErrors({});
                setApiError("");
              }}
            >
              Sign in
            </button>
            <button
              className={mode === "signup" ? "active" : ""}
              onClick={() => {
                setMode("signup");
                setErrors({});
                setApiError("");
              }}
            >
              Create account
            </button>
          </div>

          <h2 className="form-title">
            {mode === "signup" ? "Begin your calendar." : "Welcome back."}
          </h2>
          <p className="form-sub">
            {mode === "signup"
              ? "Your tasks are saved to your account."
              : "Pick up where you left off."}
          </p>

          <form onSubmit={submit} noValidate>
            {mode === "signup" && (
              <div className={"field" + (errors.name ? " has-error" : "")}>
                <label>Full name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jane Appleseed"
                  autoComplete="name"
                />
                {errors.name && <div className="err">{errors.name}</div>}
              </div>
            )}

            <div className={"field" + (errors.email ? " has-error" : "")}>
              <label>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jane@example.com"
                autoComplete="email"
              />
              {errors.email && <div className="err">{errors.email}</div>}
            </div>

            <div className={"field" + (errors.password ? " has-error" : "")}>
              <label>Password</label>
              <div className="pw-wrap">
                <input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={
                    mode === "signup" ? "At least 8 characters" : "••••••••"
                  }
                  autoComplete={
                    mode === "signup" ? "new-password" : "current-password"
                  }
                  style={{ paddingRight: 60 }}
                />
                <button
                  type="button"
                  className="pw-toggle"
                  onClick={() => setShowPw((v) => !v)}
                >
                  {showPw ? "hide" : "show"}
                </button>
              </div>
              {mode === "signup" && password && (
                <>
                  <div className="pw-strength">
                    {[1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        className={
                          "bar" + (i <= pwStrength ? " on-" + pwStrength : "")
                        }
                      />
                    ))}
                  </div>
                  <div className="pw-hint">Strength: {strengthLabel}</div>
                </>
              )}
              {errors.password && <div className="err">{errors.password}</div>}
            </div>

            <button type="submit" className="submit" disabled={submitting}>
              {submitting
                ? "One moment…"
                : mode === "signup"
                  ? "Create account"
                  : "Sign in"}
              <span className="arrow">→</span>
            </button>

            {apiError && <div className="api-error">{apiError}</div>}
          </form>

        </div>
      </section>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
