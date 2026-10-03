// Lucide 0.468.0 — ISC license; see lucide-LICENSE.txt.
const LUCIDE_ICONS = {
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  folder:
    '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />',
  'hard-drive':
    '<line x1="22" x2="2" y1="12" y2="12" />\n  <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />\n  <line x1="6" x2="6.01" y1="16" y2="16" />\n  <line x1="10" x2="10.01" y1="16" y2="16" />',
  users:
    '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />\n  <circle cx="9" cy="7" r="4" />\n  <path d="M22 21v-2a4 4 0 0 0-3-3.87" />\n  <path d="M16 3.13a4 4 0 0 1 0 7.75" />',
  'clock-3':
    '<circle cx="12" cy="12" r="10" />\n  <polyline points="12 6 12 12 16.5 12" />',
  'sticky-note':
    '<path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8Z" />\n  <path d="M15 3v4a2 2 0 0 0 2 2h4" />',
  timer:
    '<line x1="10" x2="14" y1="2" y2="2" />\n  <line x1="12" x2="15" y1="14" y2="11" />\n  <circle cx="12" cy="14" r="8" />',
  'settings-2':
    '<path d="M20 7h-9" />\n  <path d="M14 17H5" />\n  <circle cx="17" cy="17" r="3" />\n  <circle cx="7" cy="7" r="3" />',
  minus: '<path d="M5 12h14" />',
  'grip-vertical':
    '<circle cx="9" cy="12" r="1" />\n  <circle cx="9" cy="5" r="1" />\n  <circle cx="9" cy="19" r="1" />\n  <circle cx="15" cy="12" r="1" />\n  <circle cx="15" cy="5" r="1" />\n  <circle cx="15" cy="19" r="1" />',
  upload:
    '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />\n  <polyline points="17 8 12 3 7 8" />\n  <line x1="12" x2="12" y1="3" y2="15" />',
  'refresh-cw':
    '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />\n  <path d="M21 3v5h-5" />\n  <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />\n  <path d="M8 16H3v5" />',
  'arrow-left': '<path d="m12 19-7-7 7-7" />\n  <path d="M19 12H5" />',
  house:
    '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" />\n  <path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />',
  'share-2':
    '<circle cx="18" cy="5" r="3" />\n  <circle cx="6" cy="12" r="3" />\n  <circle cx="18" cy="19" r="3" />\n  <line x1="8.59" x2="15.42" y1="13.51" y2="17.49" />\n  <line x1="15.41" x2="8.59" y1="6.51" y2="10.49" />',
  ellipsis:
    '<circle cx="12" cy="12" r="1" />\n  <circle cx="19" cy="12" r="1" />\n  <circle cx="5" cy="12" r="1" />',
  play: '<polygon points="6 3 20 12 6 21 6 3" />',
  pause:
    '<rect x="14" y="4" width="4" height="16" rx="1" />\n  <rect x="6" y="4" width="4" height="16" rx="1" />',
  'rotate-ccw':
    '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />\n  <path d="M3 3v5h5" />',
  check: '<path d="M20 6 9 17l-5-5" />',
  x: '<path d="M18 6 6 18" />\n  <path d="m6 6 12 12" />',
  monitor:
    '<rect width="20" height="14" x="2" y="3" rx="2" />\n  <line x1="8" x2="16" y1="21" y2="21" />\n  <line x1="12" x2="12" y1="17" y2="21" />',
  image:
    '<rect width="18" height="18" x="3" y="3" rx="2" ry="2" />\n  <circle cx="9" cy="9" r="2" />\n  <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />',
  'mouse-pointer-2':
    '<path d="M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z" />',
  'user-round':
    '<circle cx="12" cy="8" r="5" />\n  <path d="M20 21a8 8 0 0 0-16 0" />',
  pencil:
    '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />\n  <path d="m15 5 4 4" />',
  'circle-help':
    '<circle cx="12" cy="12" r="10" />\n  <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />\n  <path d="M12 17h.01" />',
  'circle-check':
    '<circle cx="12" cy="12" r="10" />\n  <path d="m9 12 2 2 4-4" />',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />',
  'circle-minus': '<circle cx="12" cy="12" r="10" />\n  <path d="M8 12h8" />',
  'message-circle': '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />',
  palette:
    '<circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />\n  <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />\n  <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />\n  <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />\n  <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />',
  'layout-grid':
    '<rect width="7" height="7" x="3" y="3" rx="1" />\n  <rect width="7" height="7" x="14" y="3" rx="1" />\n  <rect width="7" height="7" x="14" y="14" rx="1" />\n  <rect width="7" height="7" x="3" y="14" rx="1" />',
};

export function icon(name) {
  return `<svg class="lucide" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${LUCIDE_ICONS[name] || LUCIDE_ICONS['circle-help']}</svg>`;
}
