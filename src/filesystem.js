import { get, put } from './storage.js';
import { safeName } from './protocol.js';
export async function permission(handle, mode = 'readwrite', request = false) {
  if (!handle) return false;
  return (
    (await handle.queryPermission({ mode })) === 'granted' ||
    (request && (await handle.requestPermission({ mode })) === 'granted')
  );
}
export class Vault {
  async init() {
    this.handle = await get('settings', 'vault');
    return this;
  }
  async choose() {
    this.handle = await showDirectoryPicker({ mode: 'readwrite' });
    await put('settings', 'vault', this.handle);
  }
  async reconnect() {
    if (!(await permission(this.handle, 'readwrite', true)))
      throw new Error('Folder access was not granted.');
  }
  async list(handle = this.handle) {
    if (!(await permission(handle, 'read', false)))
      throw new Error('Reconnect your folder to browse it.');
    const entries = [];
    for await (const entry of handle.values()) {
      if (!entry.name.startsWith('.yard-')) entries.push(entry);
    }
    return entries.sort((a, b) =>
      a.kind === b.kind
        ? a.name.localeCompare(b.name)
        : a.kind === 'directory'
          ? -1
          : 1,
    );
  }
  async read(handle) {
    const file = await handle.getFile();
    return {
      text: await file.text(),
      modified: file.lastModified,
      size: file.size,
    };
  }
  async write(handle, text, expected) {
    if (!(await permission(handle, 'readwrite')))
      throw new Error('Reconnect your folder before saving.');
    if (expected) {
      const current = await handle.getFile();
      if (
        current.lastModified !== expected.modified ||
        current.size !== expected.size
      )
        throw new Error('CONFLICT');
    }
    const stream = await handle.createWritable();
    try {
      await stream.write(text);
      await stream.close();
    } catch (error) {
      await stream.abort().catch(() => {});
      throw error;
    }
    return this.read(handle);
  }
  async create(directory, name, text) {
    if (!safeName(name) || !/\.(txt|md)$/i.test(name))
      throw new Error('Use a valid .txt or .md filename.');
    try {
      await directory.getFileHandle(name);
      throw new Error('That file already exists. Choose a different name.');
    } catch (e) {
      if (e.name !== 'NotFoundError') throw e;
    }
    const handle = await directory.getFileHandle(name, { create: true });
    return { handle, snapshot: await this.write(handle, text) };
  }
}
export async function uniqueName(directory, name) {
  if (!safeName(name)) throw new Error('Invalid filename.');
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  for (let i = 0; i < 10000; i++) {
    const candidate = i ? `${base.slice(0, 200)} (${i})${ext}` : name;
    try {
      await directory.getFileHandle(candidate);
    } catch (e) {
      if (e.name === 'NotFoundError') return candidate;
      throw e;
    }
  }
  throw new Error('Could not find an unused filename.');
}
