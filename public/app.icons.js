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
  return `<svg width="${size}" height="${size}" aria-hidden="true" focusable="false"><use href="icons.svg#${name}"></use></svg>`;
}
