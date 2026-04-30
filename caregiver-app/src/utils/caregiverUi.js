const icons = {
  home:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"/></svg>',
  tasks:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6h11M8 12h11M8 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.8"/></svg>',
  history:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 2.6-6.4L3 8m9-3v7l4 2" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"/></svg>',
  alarmClock:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4 4.5 6.5M17 4l2.5 2.5M6 13a6 6 0 1 0 12 0 6 6 0 0 0-12 0Zm6-3v3.5l2.3 1.4M8.5 19l-1.3 2M15.5 19l1.3 2" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"/></svg>',
  profile:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm-7 8a7 7 0 0 1 14 0" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"/></svg>',
  back:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 6-6 6 6 6" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"/></svg>',
  close:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.8"/></svg>',
  moreVertical:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6.5h.01M12 12h.01M12 17.5h.01" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="3"/></svg>',
  note:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h10a2 2 0 0 1 2 2v12l-4-2-4 2-4-2-4 2V6a2 2 0 0 1 2-2Z" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"/></svg>',
  phone:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 5.5c0 7.2 6.8 14 14 14h1.2a1.3 1.3 0 0 0 1.3-1.3v-2.9a1.3 1.3 0 0 0-1-.9l-3.2-.7a1.3 1.3 0 0 0-1.2.4l-1.4 1.4a12 12 0 0 1-5.6-5.6l1.4-1.4a1.3 1.3 0 0 0 .4-1.2l-.7-3.2a1.3 1.3 0 0 0-.9-1H5.8A1.3 1.3 0 0 0 4.5 5.5Z" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"/></svg>',
  fingerprint:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 10a3 3 0 0 1 6 0m-8.5 1.5c0-3 2.2-5.5 5.5-5.5s5.5 2.5 5.5 5.5v2.2M8 15.5c0 3.1-1 5.2-2.2 6.5m10.2-6.5c0 2.5.7 4.7 1.9 6.5M12 13.2V22m-2.7-5.7a9 9 0 0 1-.6-3.2m6 0a10 10 0 0 0 .7 3.6" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"/></svg>',
  mapPin:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-6-5.2-6-10a6 6 0 1 1 12 0c0 4.8-6 10-6 10Zm0-7.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"/></svg>',
  warning:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 9v4m0 4h.01M4.9 19h14.2a1 1 0 0 0 .9-1.5L13 5.5a1.1 1.1 0 0 0-1.9 0L4 17.5a1 1 0 0 0 .9 1.5Z" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"/></svg>',
  userMinus:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm-9 12a7 7 0 0 1 10 0M17 14h5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"/></svg>',
  caretRight:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m10 6 6 6-6 6" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"/></svg>',
  sun:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v2.2M12 17.8V20M4 12h2.2M17.8 12H20M6.3 6.3l1.6 1.6M16.1 16.1l1.6 1.6M17.7 6.3l-1.6 1.6M7.9 16.1l-1.6 1.6M12 8a4 4 0 1 1-4 4 4 4 0 0 1 4-4Z" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.8"/></svg>',
  bowl:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 11a7 7 0 0 0 14 0Zm2 6h10M8 5h8" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"/></svg>',
  meal:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3v8M9 3v8M7.5 11V21m8-18v7a3 3 0 0 0 3 3v8m0-18V3" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"/></svg>',
  moon:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15.5 3.5a8.8 8.8 0 1 0 5 15.9A9.5 9.5 0 1 1 15.5 3.5Z" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"/></svg>',
  search:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m21 21-4.3-4.3M10.8 18a7.2 7.2 0 1 0 0-14.4 7.2 7.2 0 0 0 0 14.4Z" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.8"/></svg>',
  pulse:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h4l2-4 4 8 2-4h6" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"/></svg>',
  message:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4H17a3 3 0 0 1 3 3v6.5a3 3 0 0 1-3 3H10l-4.5 3v-3H6.5A2.5 2.5 0 0 1 4 14.5z" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"/></svg>',
  package:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 8 4.5v9L12 21 4 16.5v-9ZM12 12l8-4.5M12 12 4 7.5M12 12v9" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"/></svg>',
  chart:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19h16M7 16V9m5 7V5m5 11v-4" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"/></svg>',
  users:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 11a3 3 0 1 0-3-3 3 3 0 0 0 3 3Zm8 0a3 3 0 1 0-3-3 3 3 0 0 0 3 3ZM3.5 19a5.5 5.5 0 0 1 11 0m2-1.5a4.5 4.5 0 0 1 4 2.2" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"/></svg>',
  gear:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 1 2.2 2.5.6 1.7-1.6 2 2-1.6 1.7.6 2.5L21 12l-2.2 1 .6 2.5 1.6 1.7-2 2-1.7-1.6-2.5.6L12 21l-1-2.2-2.5-.6-1.7 1.6-2-2 1.6-1.7L5.8 13 3 12l2.2-1-.6-2.5L3 6.8l2-2 1.7 1.6 2.5-.6ZM12 9a3 3 0 1 0 3 3 3 3 0 0 0-3-3Z" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6"/></svg>',
  drop:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3s5 5.7 5 9.4A5 5 0 0 1 7 12.4C7 8.7 12 3 12 3Z" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"/></svg>',
  heart:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"/></svg>',
  calendar:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3v3m10-3v3M4 9h16M5.5 5.5h13A1.5 1.5 0 0 1 20 7v11.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5V7A1.5 1.5 0 0 1 5.5 5.5Z" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"/></svg>',
  arrowRight:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"/></svg>',
  checkCircle:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a9 9 0 1 1-9-9 9 9 0 0 1 9 9Zm-12 0 2 2 4-4" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"/></svg>',
};

export function renderIcon(name, className = "") {
  return `<span class="ui-icon ${className}">${icons[name] || ""}</span>`;
}

export function renderAvatar(label, className = "") {
  const safeLabel = label ? String(label).trim().charAt(0) : "护";
  return `<span class="avatar ${className}">${safeLabel}</span>`;
}
