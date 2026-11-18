/** Satır içi SVG ikon seti (emoji ya da ikon fontuna bağımlılık yok). */
const S = (body: string, fill = false): string =>
  `<svg viewBox="0 0 24 24" fill="${fill ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

const ICONS: Record<string, string> = {
  logo: `<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="1.5" y="1.5" width="29" height="29" rx="7" fill="#f6efdd" stroke="#14142b" stroke-width="3"/><ellipse cx="16" cy="17" rx="10" ry="6.5" fill="#9be3c4" stroke="#14142b" stroke-width="3"/><ellipse cx="16" cy="17" rx="4.6" ry="2.4" fill="#3d9a57" stroke="#14142b" stroke-width="1.6"/><circle cx="23.5" cy="10" r="3.6" fill="#2f6bff" stroke="#14142b" stroke-width="2.2"/></svg>`,
  play: S('<path d="M7 4.5v15l12-7.5z"/>', true),
  help: S('<path d="M9 9a3 3 0 1 1 4.5 2.6c-1 .6-1.5 1.2-1.5 2.4"/><path d="M12 18h.01"/>'),
  sound: S('<path d="M4 9.5v5h3.5L12 18V6L7.5 9.5z" fill="currentColor"/><path d="M15.5 9a4 4 0 0 1 0 6"/><path d="M18 6.5a7.5 7.5 0 0 1 0 11"/>'),
  mute: S('<path d="M4 9.5v5h3.5L12 18V6L7.5 9.5z" fill="currentColor"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>'),
  heart: S('<path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.6 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z"/>'),
  ticket: S('<path d="M3.5 8.5a2 2 0 0 0 0 7V18h17v-2.5a2 2 0 0 1 0-7V6h-17z"/><path d="M14 6v12" stroke-dasharray="2 3"/>'),
  pointer: S('<path d="M6 3.5l12 8.5-5.2 1.2 3 6-2.6 1.3-3-6L6 18z"/>', true),
  plus: S('<path d="M12 5v14M5 12h14"/>'),
  minus: S('<path d="M5 12h14"/>'),
  reset: S('<path d="M4.5 12a7.5 7.5 0 1 0 2.4-5.5"/><path d="M4 4.5v4.5h4.5"/>'),
  star: S('<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.7l5.9-.8z"/>', true),
  link: S('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
  back: S('<path d="M10 6l-6 6 6 6"/><path d="M4 12h11a5 5 0 0 1 5 5v1"/>'),
  left: S('<path d="M14.5 5l-7 7 7 7"/>'),
  right: S('<path d="M9.5 5l7 7-7 7"/>'),
  up: S('<path d="M5 14.5l7-7 7 7"/>'),
  down: S('<path d="M5 9.5l7 7 7-7"/>'),
  close: S('<path d="M6 6l12 12M18 6L6 18"/>'),
  clap: S('<path d="M8 13l-2.5-4a1.5 1.5 0 0 1 2.6-1.5L11 12"/><path d="M11 12L8.6 6.6a1.5 1.5 0 0 1 2.7-1.2L14.5 12l1-2.5a1.6 1.6 0 0 1 3 1L16 19a5 5 0 0 1-8 1.5L5 16"/><path d="M17 3v2M20.5 4.5L19 6"/>'),
  megaphone: S('<path d="M4 10v4h3l8 4.5V5.5L7 10z"/><path d="M18.5 9.5a3.5 3.5 0 0 1 0 5"/><path d="M7.5 14.5l1 4.5"/>'),
  wave: S('<path d="M2.5 15c2.5 0 2.5-6 5-6s2.5 6 5 6 2.5-6 5-6 2.500 6 4 6"/><path d="M2.5 20h19" stroke-dasharray="1 4"/>'),
};

export function icon(name: string): string {
  return ICONS[name] ?? '';
}

/** Belgedeki bütün [data-icon] yer tutucularını doldurur. */
export function hydrateIcons(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-icon]').forEach((el) => {
    el.innerHTML = icon(el.dataset.icon ?? '');
  });
}

export function setIcon(el: Element | null, name: string): void {
  const holder = el?.querySelector<HTMLElement>('[data-icon]');
  if (holder && holder.dataset.icon !== name) {
    holder.dataset.icon = name;
    holder.innerHTML = icon(name);
  }
}
