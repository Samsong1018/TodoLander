// TodoLander logo — a calendar cell with a checkmark sweeping through date 15,
// the check's stem doubling as a calendar rule. Adapts to theme via currentColor + accent.
const TodoLanderLogo = ({
  size = 22,
  showWordmark = false,
  wordmarkSize = 22,
}) => {
  const s = size;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
      <svg
        width={s}
        height={s}
        viewBox="0 0 32 32"
        style={{ display: "block", flexShrink: 0 }}
        aria-label="TodoLander logo"
      >
        {/* body */}
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
        {/* top binder — accent */}
        <rect
          x="2.5"
          y="5.5"
          width="27"
          height="6"
          rx="4"
          fill="var(--accent)"
          stroke="var(--accent)"
          strokeWidth="0.5"
        />
        {/* binder rings */}
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
        {/* grid rule (horizontal) */}
        <line
          x1="4"
          y1="17"
          x2="28"
          y2="17"
          stroke="currentColor"
          strokeWidth="1"
          opacity="0.35"
        />
        {/* grid rule (vertical) */}
        <line
          x1="16"
          y1="12"
          x2="16"
          y2="29"
          stroke="currentColor"
          strokeWidth="1"
          opacity="0.35"
        />
        {/* the checkmark — sweeps through a date cell */}
        <path
          d="M7.5 21.5 L12 26 L24 14.5"
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {showWordmark && (
        <span
          className="logo-wordmark"
          style={{
            fontFamily: "var(--serif)",
            fontSize: wordmarkSize,
            letterSpacing: "-0.01em",
            lineHeight: 1,
            whiteSpace: "nowrap",
          }}
        >
          <span>Todo</span>
          <span style={{ fontStyle: "italic", color: "var(--accent)" }}>
            Lander
          </span>
        </span>
      )}
    </span>
  );
};

window.TodoLanderLogo = TodoLanderLogo;
