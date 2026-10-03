import { $, esc, task, button } from './dom.js';
import { get, put } from '../storage.js';

export async function initLayout() {
  const defaults = [
    'files',
    'storage',
    'clock',
    'notes',
    'friends',
    'focus',
    'transfers',
  ].map((id) => ({ id, visible: true }));
  const saved = await get('settings', 'desktop-layout');
  let layout = Array.isArray(saved)
    ? saved
        .filter(
          (item, index) =>
            defaults.some((x) => x.id === item?.id) &&
            saved.findIndex((x) => x?.id === item.id) === index,
        )
        .map((item) => ({ id: item.id, visible: item.visible !== false }))
    : structuredClone(defaults);
  for (const item of defaults)
    if (!layout.some((x) => x.id === item.id)) layout.push(item);
  let editing = false;
  let dragging = null;
  function applyLayout() {
    for (const item of layout) {
      const panel = $(`[data-panel="${item.id}"]`);
      panel.hidden = !item.visible;
      $('#bento').append(panel);
      $(`[data-jump="${item.id}"]`).setAttribute(
        'aria-pressed',
        String(item.visible),
      );
    }
    $('#layout-help').hidden = !editing;
    $('#layout-label').textContent = editing ? 'Done' : 'Layout';
    $('#hidden-panels').innerHTML = layout
      .filter((x) => !x.visible)
      .map(
        (x) =>
          `<button data-show="${x.id}" class="text-button">＋ Show ${esc(x.id)}</button>`,
      )
      .join('');
  }
  async function saveLayout() {
    await put('settings', 'desktop-layout', layout);
    applyLayout();
  }
  async function move(id, target) {
    const from = layout.findIndex((x) => x.id === id);
    const to =
      typeof target === 'number'
        ? target
        : layout.findIndex((x) => x.id === target);
    if (from < 0 || to < 0 || from === to) return;
    layout.splice(
      Math.max(0, Math.min(layout.length - 1, to)),
      0,
      layout.splice(from, 1)[0],
    );
    await saveLayout();
    $('#desktop-announcement').textContent =
      `${id} moved to position ${layout.findIndex((x) => x.id === id) + 1}.`;
  }
  document.querySelectorAll('[data-panel]').forEach((panel) => {
    const id = panel.dataset.panel;
    const handle = panel.querySelector('.drag-handle');
    handle.draggable = true;
    handle.ondragstart = (event) => {
      dragging = id;
      event.dataTransfer.setData('text/plain', id);
      event.dataTransfer.effectAllowed = 'move';
      panel.classList.add('dragging');
    };
    handle.ondragend = () => {
      dragging = null;
      document
        .querySelectorAll('.dragging, .drop-target')
        .forEach((node) => node.classList.remove('dragging', 'drop-target'));
    };
    panel.ondragover = (event) => {
      if (!dragging || dragging === id) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      panel.classList.add('drop-target');
    };
    panel.ondragleave = (event) => {
      if (!panel.contains(event.relatedTarget))
        panel.classList.remove('drop-target');
    };
    panel.ondrop = task(async (event) => {
      event.preventDefault();
      panel.classList.remove('drop-target');
      if (dragging) await move(dragging, id);
    });
    handle.onkeydown = task(async (event) => {
      if (
        !['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown'].includes(event.key)
      )
        return;
      event.preventDefault();
      await move(
        id,
        layout.findIndex((x) => x.id === id) +
          (['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1),
      );
      handle.focus();
    });
    panel.querySelector('.minimize').onclick = task(async () => {
      layout.find((x) => x.id === id).visible = false;
      await saveLayout();
      $(`[data-jump="${id}"]`).focus();
    });
  });
  async function show(id) {
    const item = layout.find((x) => x.id === id);
    if (!item) return;
    item.visible = true;
    await saveLayout();
    const panel = $(`[data-panel="${id}"]`);
    panel.scrollIntoView({
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
      block: 'center',
    });
    panel.querySelector('.drag-handle').focus({ preventScroll: true });
  }
  button('#layout-button', () => {
    editing = !editing;
    applyLayout();
  });
  button('#restore-layout', async () => {
    layout = structuredClone(defaults);
    await saveLayout();
  });
  $('#hidden-panels').onclick = task((event) =>
    show(event.target.dataset.show),
  );
  document.querySelectorAll('[data-jump]').forEach((b) => {
    b.onclick = task(() => show(b.dataset.jump));
  });
  applyLayout();
  return { applyLayout, show };
}
