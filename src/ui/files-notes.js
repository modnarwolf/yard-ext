import { $, esc, toast, task, button, modal, confirm, dot } from './dom.js';
import { get, put } from '../storage.js';
import { permission } from '../filesystem.js';
import { bytes } from '../protocol.js';
import { icon } from './icons.js';
export async function initFilesNotes(state) {
  const vault = state.vault;
  let entries = [],
    path = [],
    currentFile = null,
    snapshot = null,
    mode = 'personal',
    localText = (await get('notes', 'personal')) || '';
  async function renderFiles() {
    $('#folder-name').textContent =
      vault.handle?.name || 'A home for your files';
    $('#reconnect-folder').hidden = !vault.handle;
    $('#folder-path').textContent =
      path.map((x) => x.name).join(' / ') || 'LOCAL & PRIVATE';
    $('#folder-up').hidden = !path.length;
    if (!vault.handle || !(await permission(vault.handle, 'read'))) {
      entries = [];
      $('#file-list').innerHTML =
        `<div class="empty"><span class="empty-icon">${icon('folder')}</span><h3>${vault.handle ? 'Reconnect your folder' : 'No folder connected'}</h3><p>${vault.handle ? 'Reconnect to browse your files.' : 'Choose a folder on your computer.'}</p><button id="connect-empty" class="outline">${vault.handle ? 'Reconnect folder' : 'Choose a folder'}</button></div>`;
      $('#connect-empty').onclick = task(async () => {
        if (vault.handle) await vault.reconnect();
        else await vault.choose();
        path = [];
        await renderFiles();
      });
      return;
    }
    entries = await vault.list(path.at(-1) || vault.handle);
    filterFiles();
  }
  function filterFiles() {
    const query = $('#file-search').value.toLowerCase();
    $('#file-list').innerHTML =
      entries
        .map((entry, index) => ({ entry, index }))
        .filter(({ entry }) => entry.name.toLowerCase().includes(query))
        .map(
          ({ entry, index }) =>
            `<button class="file-row" data-file="${index}"><span class="file-icon ${entry.kind === 'directory' ? 'folder' : ''}">${icon(entry.kind === 'directory' ? 'folder' : /\.(png|jpg|jpeg|webp|gif)$/i.test(entry.name) ? 'image' : /\.(mp4|webm|mov)$/i.test(entry.name) ? 'play' : 'sticky-note')}</span><span>${esc(entry.name)}<small>${entry.kind === 'directory' ? 'Folder' : 'Local file'}</small></span><span class="file-arrow">↗</span></button>`,
        )
        .join('') ||
      '<div class="empty compact"><p>No files here yet.</p></div>';
  }
  $('#file-search').oninput = filterFiles;
  $('#file-list').addEventListener(
    'click',
    task(async (e) => {
      const row = e.target.closest('[data-file]');
      if (!row) return;
      const entry = entries[Number(row.dataset.file)];
      if (entry.kind === 'directory') {
        path.push(entry);
        await renderFiles();
      } else await openFile(entry);
    }),
  );
  button('#folder-menu', async () => {
    await vault.choose();
    path = [];
    await renderFiles();
  });
  button('#reconnect-folder', async () => {
    await vault.reconnect();
    await renderFiles();
  });
  button('#folder-up', async () => {
    path.pop();
    await renderFiles();
  });
  button('#refresh-folder', renderFiles);
  async function openFile(handle) {
    const file = await handle.getFile();
    if (/\.(txt|md)$/i.test(file.name)) {
      if (file.size > 2e6)
        throw new Error('This text file is too large for the note editor.');
      currentFile = handle;
      snapshot = await vault.read(handle);
      mode = 'file';
      $('#note-editor').value = snapshot.text;
      renderNote();
      $('[data-jump="notes"]').click();
      return;
    }
    if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
      const url = URL.createObjectURL(file);
      modal(
        file.name,
        `${file.type.startsWith('image/') ? `<img class="preview-media" src="${url}" alt="${esc(file.name)}">` : `<video class="preview-media" src="${url}" controls preload="metadata"></video>`}<p>${esc(bytes(file.size))} · Local preview</p>`,
        (dialog) =>
          dialog.addEventListener('close', () => URL.revokeObjectURL(url), {
            once: true,
          }),
      );
      return;
    }
    modal(
      file.name,
      `<p>${esc(bytes(file.size))} · This file is available to send to a friend. Preview is supported for text, images, and videos.</p>`,
    );
  }
  function renderNote() {
    $('#personal-tab').classList.toggle(
      'active',
      mode === 'personal' || mode === 'file',
    );
    $('#shared-tab').classList.toggle('active', mode === 'shared');
    $('#note-title').textContent =
      mode === 'file'
        ? currentFile.name
        : mode === 'shared'
          ? 'A note to grow together'
          : 'A little note to yourself';
    $('#note-hint').textContent =
      mode === 'shared'
        ? state.network?.room
          ? 'Everyone in this hangout can write here.'
          : 'Local copy · Join a hangout to write together.'
        : 'Yours to keep. Private by default.';
    $('#save-file').hidden = mode !== 'file';
    $('#note-state').textContent =
      mode === 'file' ? 'Loaded from folder' : 'Saved locally';
  }
  button('#personal-tab', () => {
    mode = 'personal';
    currentFile = null;
    $('#note-editor').value = localText;
    renderNote();
  });
  button('#shared-tab', () => {
    mode = 'shared';
    $('#note-editor').value = state.collab?.text.toString() || '';
    renderNote();
  });
  $('#note-editor').value = localText;
  renderNote();
  let noteSave = Promise.resolve();
  $('#note-editor').oninput = () => {
    if (mode === 'file') {
      $('#note-state').textContent = 'Unsaved changes';
      return;
    }
    if (mode === 'shared') {
      try {
        state.collab.edit($('#note-editor').value);
        $('#note-state').textContent = 'Saved locally';
      } catch (e) {
        toast(e.message);
      }
      return;
    }
    localText = $('#note-editor').value;
    $('#note-state').textContent = 'Saving…';
    const value = localText;
    noteSave = noteSave
      .then(() => put('notes', 'personal', value))
      .then(() => {
        if (localText === value && mode === 'personal')
          $('#note-state').textContent = 'Saved locally';
      })
      .catch((error) => {
        $('#note-state').textContent = 'Save failed';
        toast(error.message);
      });
  };
  button('#save-file', async () => {
    try {
      snapshot = await vault.write(
        currentFile,
        $('#note-editor').value,
        snapshot,
      );
      $('#note-state').textContent = 'Saved to folder';
    } catch (e) {
      if (e.message !== 'CONFLICT') throw e;
      modal(
        'This file changed outside Yard',
        `<p>Keep both versions by saving a separate copy, or reload the version on disk.</p><div class="dialog-actions"><button id="reload-note" class="quiet">Reload disk version</button><button id="copy-note" class="primary">Save separate copy</button></div>`,
        () => {
          $('#reload-note').onclick = task(async () => {
            $('#dialog').close();
            await openFile(currentFile);
          });
          $('#copy-note').onclick = () => {
            $('#dialog').close();
            createNote($('#note-editor').value);
          };
        },
      );
    }
  });
  function createNote(text = '') {
    if (!vault.handle) {
      toast('Connect a writable folder first.');
      return;
    }
    modal(
      'Plant a new note',
      `<label>Filename<input id="filename" value="Untitled.md" maxlength="200"></label><div class="dialog-actions"><button id="create-note" class="primary">Create note</button></div>`,
      () => {
        $('#create-note').onclick = task(async () => {
          const result = await vault.create(
            path.at(-1) || vault.handle,
            $('#filename').value,
            text,
          );
          $('#dialog').close();
          await renderFiles();
          await openFile(result.handle);
        });
      },
    );
  }
  button('#new-note', () => createNote());
  button('#export-note', async () => {
    const text = $('#note-editor').value;
    if (vault.handle && (await permission(vault.handle, 'readwrite')))
      createNote(text);
    else {
      const blob = new Blob([text], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = mode === 'shared' ? 'Yard together.md' : 'Yard note.md';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  });
  function updateShared() {
    if (mode !== 'shared') return;
    const editor = $('#note-editor');
    const start = editor.selectionStart,
      end = editor.selectionEnd;
    editor.value = state.collab.text.toString();
    editor.setSelectionRange(
      Math.min(start, editor.value.length),
      Math.min(end, editor.value.length),
    );
  }
  await renderFiles();
  return { renderFiles, renderNote, openFile, updateShared };
}
