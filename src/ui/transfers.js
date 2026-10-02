import { $, esc, toast, task, button, modal, confirm, dot } from './dom.js';
import { bytes } from '../protocol.js';
export function initTransferUI(state, notes, friends) {
  const openFile = notes.openFile,
    ensureOwner = friends.ensureOwner;
  function renderTransfers() {
    if (!state.transfers) return;
    const items = state.transfers.items.slice().reverse();
    const batches = new Map();
    for (const t of items) {
      const key = t.batch + ':' + t.direction;
      const batch = batches.get(key) || {
        count: 0,
        total: 0,
        done: 0,
        completed: 0,
        direction: t.direction,
      };
      batch.count++;
      batch.total += t.size;
      batch.done += t.offset || 0;
      if (t.state === 'Completed') batch.completed++;
      batches.set(key, batch);
    }
    const summary = [...batches.values()]
      .map(
        (b) =>
          `<div class="batch-summary"><span>${b.direction === 'send' ? 'Sending' : 'Receiving'} · ${b.completed}/${b.count} files complete</span><span>${esc(bytes(b.done))} / ${esc(bytes(b.total))}</span></div>`,
      )
      .join('');
    $('#transfer-list').innerHTML =
      items
        .map((t) => {
          const progress = t.state === 'Preparing' ? t.prepared || 0 : t.offset;
          const pct = t.size
            ? Math.min(100, (progress / t.size) * 100)
            : t.state === 'Completed'
              ? 100
              : 0;
          return `<div class="transfer-row"><span class="file-icon">${t.direction === 'send' ? '↗' : '↙'}</span><div class="transfer-main"><div class="transfer-title"><strong>${esc(t.name)}</strong><span>${esc(t.state)}</span></div><div class="progress"><span style="width:${pct}%"></span></div><div class="transfer-detail">${esc(bytes(progress || 0))} / ${esc(bytes(t.size))}${t.speed ? ` · ${esc(bytes(t.speed))}/s · ${Math.ceil((t.size - t.offset) / t.speed)}s remaining` : ''}${t.error ? ` · ${esc(t.error)}` : ''}</div></div><div class="transfer-actions">${t.state === 'Offered' ? `<button data-transfer="accept" data-id="${t.id}" class="primary">Review</button>` : ['Paused', 'Failed', 'Awaiting acceptance'].includes(t.state) ? `<button data-transfer="resume" data-id="${t.id}" class="text-button">Resume</button>${t.direction === 'send' ? `<button data-transfer="reselect" data-id="${t.id}" class="text-button">Reselect</button>` : ''}` : ['Sending', 'Receiving'].includes(t.state) ? `<button data-transfer="pause" data-id="${t.id}" class="text-button">Pause</button>` : ''}${!['Completed', 'Canceled'].includes(t.state) ? `<button data-transfer="cancel" data-id="${t.id}" class="icon-button" aria-label="Cancel ${esc(t.name)}">×</button>` : t.output ? `<button data-transfer="preview" data-id="${t.id}" class="text-button">Open</button>` : ''}</div></div>`;
        })
        .join('') ||
      '<div class="transfer-empty"><div class="transfer-orbit">↗</div><div><h3>A photo, a memory, a whole afternoon.</h3><p>Send photos and videos directly to a friend.<br>Private by default. No cloud storage in between.</p></div></div>';
    if (items.length)
      $('#transfer-list').insertAdjacentHTML('afterbegin', summary);
  }
  async function chooseRecipient() {
    const peers = [...state.network.links.values()]
      .filter((l) => l.authenticated)
      .map((l) => l.remote);
    if (!peers.length)
      throw new Error('Connect with a friend before sending files.');
    return new Promise((resolve) => {
      modal(
        'Who’s this for?',
        `<p>Choose a connected friend. They’ll review the files before accepting.</p><div class="recipient-list">${peers.map((p) => `<button data-recipient="${esc(p.route)}" class="outline">${esc(p.name)} ${dot('Connected')}</button>`).join('')}</div>`,
        (dialog) => {
          dialog.querySelectorAll('[data-recipient]').forEach(
            (b) =>
              (b.onclick = () => {
                dialog.close();
                resolve(b.dataset.recipient);
              }),
          );
          dialog.addEventListener('close', () => resolve(null), { once: true });
        },
      );
    });
  }
  button('#send-files', async () => {
    ensureOwner();
    const peer = await chooseRecipient();
    if (!peer) return;
    const handles = await showOpenFilePicker({ multiple: true });
    if (handles.length > 1000)
      throw new Error(
        'Select at most 1,000 files per batch. You can queue more batches.',
      );
    await state.transfers.offer(peer, handles);
    toast('Files checked. Waiting for your friend to accept.');
  });
  $('#transfer-list').onclick = task(async (e) => {
    const b = e.target.closest('[data-transfer]');
    if (!b) return;
    const t = state.transfers.items.find((t) => t.id === b.dataset.id);
    const action = b.dataset.transfer;
    if (action === 'accept') {
      reviewBatch(t.batch);
      return;
    }
    if (action === 'resume') {
      await state.transfers.resume(t.id);
      toast(
        t.direction === 'send'
          ? 'Offer sent again. Your friend should click Resume too.'
          : 'Resuming from the last committed block.',
      );
    }
    if (action === 'pause') await state.transfers.pause(t.id);
    if (action === 'reselect') {
      const [handle] = await showOpenFilePicker();
      await state.transfers.reselect(t.id, handle);
      toast('Source restored. Click Resume.');
    }
    if (action === 'preview') await openFile(t.output);
    if (action === 'cancel') {
      const deletePartial =
        t.direction === 'receive' &&
        (await confirm(
          'Cancel this transfer?',
          'Delete its partial blocks from your destination? Decline keeps them on disk.',
          'Delete partial blocks',
        ));
      await state.transfers.cancel(t.id, deletePartial);
    }
  });
  function reviewBatch(batch) {
    const files = state.transfers.items.filter(
      (t) => t.batch === batch && t.state === 'Offered',
    );
    if (!files.length) return;
    modal(
      'A little something for you',
      `<p>${files.length} files · ${esc(bytes(files.reduce((sum, t) => sum + t.size, 0)))} total</p><div class="offer-files">${files.map((t) => `<div><span>${esc(t.name)}</span><span>${esc(bytes(t.size))}</span></div>`).join('')}</div><p>Files stream to disk. Finishing a file can temporarily need twice its size in free disk space. Keep both Yards open; interrupted transfers can resume later.</p><div class="dialog-actions"><button id="reject-batch" class="quiet">Decline</button><button id="accept-batch" class="primary">Choose destination & accept</button></div>`,
      () => {
        button('#reject-batch', async () => {
          for (const t of files) await state.transfers.cancel(t.id);
          $('#dialog').close();
        });
        button('#accept-batch', async () => {
          const directory = await showDirectoryPicker({ mode: 'readwrite' });
          await state.transfers.accept(batch, directory);
          $('#dialog').close();
        });
      },
    );
  }
  return { renderTransfers };
}
