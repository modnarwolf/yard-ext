import { $, button, toast } from './dom.js';
import { get, put } from '../storage.js';
import { bytes } from '../protocol.js';
import { icon } from './icons.js';

export const themes = {
  classic: '#008080',
  xp: '#3a6ea5',
  msn: '#7276a6',
  skype: '#00aff0',
};
export function applyAppearance(settings) {
  const appearance = settings.appearance || {};
  const theme = Object.hasOwn(themes, appearance.theme)
    ? appearance.theme
    : 'classic';
  const color = /^#[0-9a-f]{6}$/i.test(appearance.color)
    ? appearance.color
    : themes[theme];
  document.body.dataset.theme = theme;
  document.documentElement.dataset.theme = theme;
  document.body.dataset.background = appearance.background || 'solid';
  document.body.dataset.cursor = appearance.cursor || 'system';
  document.documentElement.style.setProperty('--desktop-color', color);
  const rgb = color
    .slice(1)
    .match(/../g)
    .map((value) => parseInt(value, 16));
  document.body.dataset.backgroundTone =
    rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114 > 160 ? 'light' : 'dark';
}

export async function initDesktopWidgets(state) {
  async function storage() {
    $('#storage-folder').textContent =
      state.vault.handle?.name || 'No folder selected';
    try {
      const estimate = await navigator.storage?.estimate();
      if (!estimate?.quota) throw new Error('Storage estimate unavailable');
      const used = estimate.usage || 0;
      $('#storage-free').textContent = bytes(
        Math.max(0, estimate.quota - used),
      );
      $('#storage-used').textContent = bytes(used);
      $('#storage-total').textContent = bytes(estimate.quota);
      const percent = Math.min(100, (used / estimate.quota) * 100);
      $('#storage-ring').style.setProperty('--used', `${percent * 3.6}deg`);
      $('#storage-ring').setAttribute(
        'aria-label',
        `${percent.toFixed(1)}% of browser quota used`,
      );
    } catch {
      $('#storage-free').textContent = '—';
      $('#storage-ring').setAttribute(
        'aria-label',
        'Browser storage estimate unavailable',
      );
    }
  }
  button('#refresh-storage', storage);
  await storage();
  setInterval(storage, 30000);

  const saved = await get('settings', 'focus-timer');
  let timer =
    saved &&
    [5, 15, 25].includes(saved.minutes) &&
    Number.isFinite(saved.remaining) &&
    saved.remaining >= 0 &&
    saved.remaining <= saved.minutes * 60 &&
    (saved.end === null || Number.isFinite(saved.end))
      ? saved
      : { minutes: 25, remaining: 1500, end: null };
  const save = () => put('settings', 'focus-timer', timer);
  function render() {
    if (timer.end !== null) {
      timer.remaining = Math.max(0, Math.ceil((timer.end - Date.now()) / 1000));
      if (!timer.remaining) {
        timer.end = null;
        $('#timer-message').textContent =
          timer.minutes === 25
            ? 'Nicely done. Time for a little break!'
            : 'Break is over. Ready when you are.';
        save().catch((error) => toast(error.message));
      }
    }
    $('#timer-time').textContent =
      `${String(Math.floor(timer.remaining / 60)).padStart(2, '0')}:${String(timer.remaining % 60).padStart(2, '0')}`;
    const label =
      timer.end !== null
        ? 'Pause'
        : !timer.remaining
          ? 'Again'
          : timer.remaining < timer.minutes * 60
            ? 'Resume'
            : 'Start';
    $('#timer-toggle').innerHTML =
      `${icon(label === 'Pause' ? 'pause' : 'play')} ${label}`;
    $('#timer-label').textContent =
      timer.minutes === 25 ? 'ONE THING AT A TIME' : 'TAKE A BREATH';
    document.querySelectorAll('[data-minutes]').forEach((b) => {
      const active = Number(b.dataset.minutes) === timer.minutes;
      b.classList.toggle('active', active);
      b.setAttribute('aria-pressed', String(active));
    });
  }
  button('#timer-toggle', async () => {
    render();
    if (timer.end !== null) timer.end = null;
    else {
      if (!timer.remaining) timer.remaining = timer.minutes * 60;
      timer.end = Date.now() + timer.remaining * 1000;
    }
    $('#timer-message').textContent =
      timer.end !== null
        ? 'You’ve got this. Settle into your own pace.'
        : 'Paused. Pick up whenever you’re ready.';
    await save();
    render();
  });
  async function reset(minutes = timer.minutes) {
    timer = { minutes, remaining: minutes * 60, end: null };
    $('#timer-message').textContent =
      minutes === 25
        ? '25 minutes. One thing at a time.'
        : 'Stretch, sip something, look out the window.';
    await save();
    render();
  }
  button('#timer-reset', () => reset());
  document
    .querySelectorAll('[data-minutes]')
    .forEach((b) =>
      button(`[data-minutes="${b.dataset.minutes}"]`, () =>
        reset(Number(b.dataset.minutes)),
      ),
    );
  render();
  setInterval(render, 1000);
}
