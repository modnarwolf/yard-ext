export const $ = (selector) => document.querySelector(selector);
export const esc = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ],
  );
export function toast(message) {
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => ($('#toast').hidden = true), 6500);
}
export function task(fn) {
  return async (...args) => {
    try {
      await fn(...args);
    } catch (error) {
      if (error.name !== 'AbortError') toast(error.message || String(error));
    }
  };
}
export function button(selector, fn) {
  $(selector).addEventListener('click', task(fn));
}
export function modal(title, body, setup = () => {}) {
  const dialog = $('#dialog');
  if (dialog.open) dialog.close();
  $('#dialog-content').innerHTML =
    `<div class="dialog-heading"><h2>${esc(title)}</h2><button id="close-dialog" class="icon-button" aria-label="Close dialog">×</button></div>${body}`;
  $('#close-dialog').onclick = () => dialog.close();
  setup(dialog);
  dialog.showModal();
}
export async function confirm(title, body, yes = 'Accept') {
  return new Promise((resolve) => {
    modal(
      title,
      `<p>${esc(body)}</p><div class="dialog-actions"><button id="decline" class="quiet">Decline</button><button id="accept" class="primary">${esc(yes)}</button></div>`,
      (dialog) => {
        const done = (value) => {
          dialog.close();
          resolve(value);
        };
        $('#accept').onclick = () => done(true);
        $('#decline').onclick = () => done(false);
        dialog.addEventListener('close', () => resolve(false), { once: true });
      },
    );
  });
}
export function dot(status) {
  return `<span class="status ${status.toLowerCase()}"><i></i>${esc(status)}</span>`;
}
