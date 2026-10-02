import { $, esc, toast, task, button, modal, confirm, dot } from './dom.js';
import { get, put } from '../storage.js';
export async function initLayout() {
  const defaults = [
    { id: 'welcome', size: 'wide', visible: true },
    { id: 'clock', size: 'small', visible: true },
    { id: 'files', size: 'medium', visible: true },
    { id: 'friends', size: 'medium', visible: true },
    { id: 'notes', size: 'medium', visible: true },
    { id: 'transfers', size: 'medium', visible: true },
  ];
  let layout = (await get('settings', 'layout')) || structuredClone(defaults);
  let editing = false;
  function applyLayout() {
    const bento = $('#bento');
    bento.classList.toggle('editing', editing);
    for (const item of layout) {
      const panel = $(`[data-panel="${item.id}"]`);
      if (!panel) continue;
      panel.dataset.size = item.size;
      panel.hidden = !item.visible;
      bento.append(panel);
      panel.querySelector('.layout-controls')?.remove();
      if (editing) {
        const controls = document.createElement('div');
        controls.className = 'layout-controls';
        controls.innerHTML = `<span>${esc(item.id)}</span><button data-layout="left" aria-label="Move ${item.id} earlier">←</button><button data-layout="right" aria-label="Move ${item.id} later">→</button><select aria-label="${item.id} panel size"><option value="small">Small</option><option value="medium">Medium</option><option value="wide">Wide</option></select><button data-layout="hide" aria-label="Hide ${item.id}">×</button>`;
        controls.querySelector('select').value = item.size;
        controls.draggable = true;
        controls.ondragstart = (e) =>
          e.dataTransfer.setData('text/plain', item.id);
        panel.prepend(controls);
        panel.ondragover = (e) => e.preventDefault();
        panel.ondrop = task(async (e) => {
          e.preventDefault();
          const from = layout.findIndex(
            (x) => x.id === e.dataTransfer.getData('text/plain'),
          );
          const to = layout.indexOf(item);
          if (from >= 0) {
            layout.splice(to, 0, layout.splice(from, 1)[0]);
            await saveLayout();
          }
        });
        controls.onclick = task(async (e) => {
          const action = e.target.dataset.layout;
          if (!action) return;
          const index = layout.indexOf(item);
          if (action === 'hide') item.visible = false;
          else {
            const dest = Math.max(
              0,
              Math.min(layout.length - 1, index + (action === 'left' ? -1 : 1)),
            );
            layout.splice(dest, 0, layout.splice(index, 1)[0]);
          }
          await saveLayout();
        });
        controls.querySelector('select').onchange = task(async (e) => {
          item.size = e.target.value;
          await saveLayout();
        });
      } else {
        panel.ondrop = null;
        panel.ondragover = null;
      }
    }
    $('#layout-help').hidden = !editing;
    $('#layout-button').textContent = editing
      ? '✓ Done editing'
      : '⊞ Edit space';
    $('#hidden-panels').innerHTML = layout
      .filter((x) => !x.visible)
      .map(
        (x) =>
          `<button data-show="${x.id}" class="text-button">＋ Show ${esc(x.id)}</button>`,
      )
      .join('');
  }
  async function saveLayout() {
    await put('settings', 'layout', layout);
    applyLayout();
  }
  button('#layout-button', () => {
    editing = !editing;
    applyLayout();
  });
  button('#restore-layout', async () => {
    layout = structuredClone(defaults);
    await saveLayout();
  });
  $('#hidden-panels').onclick = task(async (e) => {
    const item = layout.find((x) => x.id === e.target.dataset.show);
    if (item) {
      item.visible = true;
      await saveLayout();
    }
  });
  document.querySelectorAll('[data-jump]').forEach(
    (b) =>
      (b.onclick = () => {
        const panel = $(`[data-panel="${b.dataset.jump}"]`);
        panel.hidden = false;
        panel.scrollIntoView({
          behavior: matchMedia('(prefers-reduced-motion: reduce)').matches
            ? 'instant'
            : 'smooth',
          block: 'center',
        });
      }),
  );
  applyLayout();

  return { applyLayout };
}
