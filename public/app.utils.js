const TAG_COLORS = [
  { id: 'red',    var: 'var(--tag-red)' },
  { id: 'orange', var: 'var(--tag-orange)' },
  { id: 'yellow', var: 'var(--tag-yellow)' },
  { id: 'green',  var: 'var(--tag-green)' },
  { id: 'blue',   var: 'var(--tag-blue)' },
  { id: 'purple', var: 'var(--tag-purple)' },
  { id: 'pink',   var: 'var(--tag-pink)' },
];

function tagVar(id) {
  const t = TAG_COLORS.find(c => c.id === id);
  return t ? t.var : 'var(--rule-2)';
}

function iconSVG(name, size) {
  size = size || 14;
  return `<svg width="${size}" height="${size}" aria-hidden="true" focusable="false"><use href="assets/icons.svg#${name}"></use></svg>`;
}

function getGreeting(name) {
  const h = new Date().getHours();
  const pools = {
    night:   ['Burning the midnight oil,', 'Still up,', 'Night owl mode,', 'The quiet hours suit you,', 'Late again,'],
    morning: ['Good morning,', 'Rise and shine,', 'Morning,', 'Top of the morning,', 'A fresh start,'],
    noon:    ['Good afternoon,', 'Hey there,', 'Midday check-in,', 'Hope lunch was good,', 'Afternoon,'],
    evening: ['Good evening,', 'Winding down,', 'Evening,', 'How was your day,', 'Almost there,'],
  };
  const bucket = h < 5 ? 'night' : h < 12 ? 'morning' : h < 17 ? 'noon' : 'evening';
  const list = pools[bucket];
  const phrase = list[Math.floor(Math.random() * list.length)];
  return `${phrase} <em>${name}.</em>`;
}

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
