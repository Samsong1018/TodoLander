function logoHTML(size, showWordmark, wordmarkSize) {
  size = size || 22;
  wordmarkSize = wordmarkSize || 22;
  const s = size;
  const svg = `<svg width="${s}" height="${s}" viewBox="0 0 32 32" style="display:block;flex-shrink:0" aria-label="TodoLander logo">
    <rect x="2.5" y="5.5" width="27" height="24" rx="4" fill="none" stroke="currentColor" stroke-width="2"/>
    <rect x="2.5" y="5.5" width="27" height="6" rx="4" fill="var(--accent)" stroke="var(--accent)" stroke-width="0.5"/>
    <line x1="10" y1="2.5" x2="10" y2="8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    <line x1="22" y1="2.5" x2="22" y2="8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    <line x1="4" y1="17" x2="28" y2="17" stroke="currentColor" stroke-width="1" opacity="0.35"/>
    <line x1="16" y1="12" x2="16" y2="29" stroke="currentColor" stroke-width="1" opacity="0.35"/>
    <path d="M7.5 21.5 L12 26 L24 14.5" fill="none" stroke="var(--accent)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
  if (!showWordmark) return `<span style="display:inline-flex;align-items:center;gap:10px">${svg}</span>`;
  return `<span style="display:inline-flex;align-items:center;gap:10px">${svg}<span class="logo-wordmark" style="font-family:var(--serif);font-size:${wordmarkSize}px;letter-spacing:-0.01em;line-height:1;white-space:nowrap"><span>Todo</span><span style="font-style:italic;color:var(--accent)">Lander</span></span></span>`;
}
