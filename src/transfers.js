import { createSHA256 } from 'hash-wasm';
import { all, put, remove } from './storage.js';
import {
  id,
  MAX_FILE,
  CHUNK,
  validFile,
  validOffset,
  binaryBytes,
} from './protocol.js';
import { permission, uniqueName } from './filesystem.js';
const BLOCK = 4 * 1024 * 1024;
export async function hashFile(file, onProgress = () => {}) {
  const hash = await createSHA256();
  hash.init();
  for (let offset = 0; offset < file.size; offset += BLOCK) {
    hash.update(
      new Uint8Array(await file.slice(offset, offset + BLOCK).arrayBuffer()),
    );
    onProgress(Math.min(file.size, offset + BLOCK));
  }
  return hash.digest();
}
export class Transfers extends EventTarget {
  constructor(network, storage = { all, put }) {
    super();
    this.storage = storage;
    this.net = network;
    this.items = [];
    this.runtime = new Map();
    this.work = new Map();
    network.addEventListener('message', (e) => {
      const { route, message } = e.detail;
      if (!message.type.startsWith('file-')) return;
      // Serialize disk writes per transfer, not across unrelated peers.
      const key = message.id || route;
      const prior = this.work.get(key) || Promise.resolve();
      const next = prior
        .then(() => this.receive(route, message))
        .catch(async (error) => {
          const item = this.items.find((t) => t.id === message.id);
          if (item) {
            await this.fail(item, error.message);
            this.net.send(route, 'file-pause', { id: item.id });
          } else this.emit('error', error.message);
        });
      this.work.set(key, next);
      next.finally(() => {
        if (this.work.get(key) === next) this.work.delete(key);
      });
    });
    network.addEventListener('disconnected', (e) => {
      for (const t of this.items)
        if (
          t.peer === e.detail &&
          ['Sending', 'Receiving', 'Finalizing'].includes(t.state)
        )
          this.pause(t.id).catch((err) => this.emit('error', err.message));
    });
  }
  emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }
  change() {
    this.emit('change');
  }
  async init() {
    this.items = await this.storage.all('transfers');
    for (const t of this.items)
      if (!['Completed', 'Canceled'].includes(t.state)) {
        t.state = 'Paused';
        await this.persist(t);
      }
    return this;
  }
  persist(t) {
    const { speed, started, ...stored } = t;
    return this.storage.put('transfers', t.id, stored);
  }
  async offer(peer, handles) {
    if (!handles.length || handles.length > 1000)
      throw new Error('Select between 1 and 1,000 files per batch.');
    if (!this.net.links.get(peer)?.authenticated)
      throw new Error('Connect to your friend first.');
    const batch = id(),
      files = [];
    for (const handle of handles) {
      const file = await handle.getFile();
      if (file.size > MAX_FILE) throw new Error(`${file.name} exceeds 10 GB.`);
      const t = {
        id: id(),
        batch,
        peer,
        direction: 'send',
        name: file.name,
        size: file.size,
        modified: file.lastModified,
        source: handle,
        offset: 0,
        state: 'Preparing',
      };
      if (!validFile(t)) throw new Error('Invalid file name or size.');
      this.items.push(t);
      this.change();
      try {
        t.digest = await hashFile(file, (progress) => {
          if (t.state === 'Canceled')
            throw new Error('Transfer preparation canceled.');
          t.prepared = progress;
          this.change();
        });
      } catch (error) {
        if (t.state !== 'Canceled') await this.fail(t, error.message);
        throw error;
      }
      if (t.state === 'Canceled') continue;
      t.state = 'Awaiting acceptance';
      await this.persist(t);
      files.push(this.descriptor(t));
    }
    if (files.length) this.net.send(peer, 'file-offer', { batch, files });
    this.change();
  }
  descriptor(t) {
    return {
      id: t.id,
      name: t.name,
      size: t.size,
      modified: t.modified,
      digest: t.digest,
    };
  }
  async receive(peer, m) {
    if (m.type === 'file-offer') {
      if (
        !Array.isArray(m.files) ||
        !m.files.length ||
        m.files.length > 1000 ||
        typeof m.batch !== 'string'
      )
        throw new Error(
          'Invalid transfer batch. Send at most 1,000 files per selection.',
        );
      if (
        !m.files.every((f) => validFile(f) && /^[a-f0-9]{64}$/.test(f.digest))
      )
        throw new Error('Invalid file offer.');
      for (const f of m.files) {
        const existing = this.items.find((t) => t.id === f.id);
        if (existing) {
          if (existing.peer !== peer || existing.digest !== f.digest)
            throw new Error('Transfer identity mismatch.');
          if (existing.state === 'Completed')
            this.net.send(peer, 'file-complete', {
              id: existing.id,
              digest: existing.digest,
            });
          continue;
        }
        const t = {
          ...f,
          batch: m.batch,
          peer,
          direction: 'receive',
          offset: 0,
          state: 'Offered',
        };
        this.items.push(t);
        await this.persist(t);
      }
      this.change();
      this.emit('offer', { peer, batch: m.batch });
      return;
    }
    const t = this.items.find((t) => t.id === m.id && t.peer === peer);
    if (!t) return;
    if (m.type === 'file-ready' && t.direction === 'send') {
      if (
        !validOffset(m.offset, t.size) ||
        (m.offset % BLOCK !== 0 && m.offset !== t.size)
      )
        throw new Error('Invalid resume offset.');
      if (
        ![
          'Awaiting acceptance',
          'Paused',
          'Failed',
          'Queued',
          'Sending',
        ].includes(t.state)
      )
        return;
      const busy = this.items.some(
        (x) =>
          x !== t &&
          x.peer === peer &&
          x.direction === 'send' &&
          ['Sending', 'Verifying source'].includes(x.state),
      );
      if (busy) {
        t.state = 'Queued';
        t.offset = m.offset;
        await this.persist(t);
        this.change();
        return;
      }
      await this.start(t, m.offset);
      return;
    }
    if (m.type === 'file-chunk' && t.direction === 'receive') {
      if (t.state !== 'Receiving') return;
      const rt = this.runtime.get(t.id);
      const data = binaryBytes(m.data);
      if (
        !rt ||
        !data ||
        data.length > CHUNK ||
        !data.length ||
        m.offset !== rt.next ||
        m.offset + data.length > t.size
      )
        throw new Error('Invalid transfer chunk.');
      rt.parts.push(data);
      rt.next += data.length;
      rt.buffered += data.length;
      if (rt.buffered > BLOCK)
        throw new Error('Transfer buffer limit exceeded.');
      if (rt.buffered === BLOCK || rt.next === t.size) {
        const block = await t.partial.getFileHandle(String(t.offset), {
          create: true,
        });
        const writable = await block.createWritable();
        try {
          for (const part of rt.parts) await writable.write(part);
          await writable.close();
        } catch (e) {
          await writable.abort().catch(() => {});
          throw e;
        }
        const blockHash = await createSHA256();
        blockHash.init();
        for (const part of rt.parts) blockHash.update(part);
        t.blocks ||= {};
        t.blocks[t.offset] = blockHash.digest();
        t.offset = rt.next;
        rt.parts = [];
        rt.buffered = 0;
        t.speed =
          (t.offset - rt.initial) /
          Math.max(1, (Date.now() - t.started) / 1000);
        await this.persist(t);
        this.net.send(peer, 'file-ack', { id: t.id, offset: t.offset });
        this.change();
      }
      return;
    }
    if (
      m.type === 'file-ack' &&
      t.direction === 'send' &&
      t.state === 'Sending'
    ) {
      const rt = this.runtime.get(t.id);
      if (!rt || m.offset !== rt.sentEnd || !validOffset(m.offset, t.size))
        throw new Error('Invalid acknowledgment.');
      clearTimeout(rt.ackTimer);
      t.offset = m.offset;
      t.speed =
        (t.offset - rt.initial) / Math.max(1, (Date.now() - t.started) / 1000);
      await this.persist(t);
      this.change();
      await this.pump(t);
      return;
    }
    if (
      m.type === 'file-finish' &&
      t.direction === 'receive' &&
      t.state === 'Receiving'
    ) {
      if (t.offset !== t.size) throw new Error('Transfer is incomplete.');
      await this.finalize(t);
      return;
    }
    if (
      m.type === 'file-complete' &&
      t.direction === 'send' &&
      ['Sending', 'Awaiting acceptance', 'Paused'].includes(t.state)
    ) {
      if (m.digest !== t.digest)
        throw new Error('Transfer verification failed.');
      t.offset = t.size;
      t.state = 'Completed';
      this.runtime.delete(t.id);
      await this.persist(t);
      this.change();
      await this.next(peer);
      return;
    }
    if (m.type === 'file-pause') {
      await this.pause(t.id, false);
      return;
    }
    if (m.type === 'file-cancel') {
      await this.cancel(t.id, false, false);
      return;
    }
  }
  async accept(batch, destination) {
    if (!(await permission(destination, 'readwrite', true)))
      throw new Error('Choose a writable destination folder.');
    const dir = await destination.getDirectoryHandle('Yard Received', {
      create: true,
    });
    for (const t of this.items.filter(
      (t) =>
        t.batch === batch && t.direction === 'receive' && t.state === 'Offered',
    )) {
      t.destination = dir;
      t.partial = await dir.getDirectoryHandle(`.yard-${t.id}`, {
        create: true,
      });
      t.state = 'Queued';
      await this.persist(t);
    }
    await this.nextReceive(this.items.find((t) => t.batch === batch)?.peer);
    this.change();
  }
  async nextReceive(peer) {
    if (
      this.items.some(
        (t) =>
          t.peer === peer &&
          t.direction === 'receive' &&
          ['Receiving', 'Finalizing'].includes(t.state),
      )
    )
      return;
    const next = this.items.find(
      (t) =>
        t.peer === peer && t.direction === 'receive' && t.state === 'Queued',
    );
    if (next) await this.resume(next.id);
  }
  async resume(transferId) {
    await this.work.get(transferId);
    const t = this.items.find((t) => t.id === transferId);
    if (!t || ['Completed', 'Canceled'].includes(t.state)) return;
    if (!this.net.links.get(t.peer)?.authenticated)
      throw new Error('Reconnect to this friend before resuming.');
    if (t.direction === 'send') {
      if (!(await permission(t.source, 'read', true)))
        throw new Error('Restore access or reselect the source file.');
      t.state = 'Awaiting acceptance';
      await this.persist(t);
      this.net.send(t.peer, 'file-offer', {
        batch: t.batch,
        files: [this.descriptor(t)],
      });
      this.change();
      // The receiver explicitly resumes and supplies its committed offset.
      return;
    }
    if (!t.destination || !(await permission(t.destination, 'readwrite', true)))
      throw new Error('Restore destination folder access before resuming.');
    if (
      this.items.some(
        (x) =>
          x !== t &&
          x.peer === t.peer &&
          x.direction === 'receive' &&
          ['Receiving', 'Finalizing'].includes(x.state),
      )
    ) {
      t.state = 'Queued';
      await this.persist(t);
      this.change();
      return;
    }
    const count = Math.ceil(t.offset / BLOCK);
    for (let i = 0; i < count; i++) {
      const f = await (
        await t.partial.getFileHandle(String(i * BLOCK))
      ).getFile();
      if (
        f.size !== Math.min(BLOCK, t.offset - i * BLOCK) ||
        (await hashFile(f)) !== t.blocks?.[i * BLOCK]
      )
        throw new Error(
          'A partial file is missing or changed. Cancel and restart this transfer.',
        );
    }
    t.error = '';
    t.state = 'Receiving';
    t.started = Date.now();
    this.runtime.set(t.id, {
      parts: [],
      buffered: 0,
      next: t.offset,
      initial: t.offset,
    });
    await this.persist(t);
    this.net.send(t.peer, 'file-ready', { id: t.id, offset: t.offset });
    this.change();
  }
  async start(t, offset) {
    if (!(await permission(t.source, 'read'))) {
      await this.fail(t, 'Restore access to the source file and resume.');
      return;
    }
    const file = await t.source.getFile();
    t.state = 'Verifying source';
    this.change();
    if (
      file.size !== t.size ||
      file.lastModified !== t.modified ||
      (await hashFile(file)) !== t.digest
    ) {
      await this.fail(t, 'Source file changed. Start a new transfer.');
      this.net.send(t.peer, 'file-pause', { id: t.id });
      return;
    }
    if (t.state !== 'Verifying source') return;
    t.offset = offset;
    t.state = 'Sending';
    t.started = Date.now();
    this.runtime.set(t.id, { file, initial: offset });
    await this.persist(t);
    this.change();
    await this.pump(t);
  }
  async pump(t) {
    const rt = this.runtime.get(t.id);
    if (!rt || t.state !== 'Sending') return;
    if (t.offset === t.size) {
      this.net.send(t.peer, 'file-finish', { id: t.id });
      return;
    }
    const end = Math.min(t.size, t.offset + BLOCK);
    rt.sentEnd = end;
    for (let offset = t.offset; offset < end; offset += CHUNK) {
      if (t.state !== 'Sending') return;
      const data = new Uint8Array(
        await rt.file
          .slice(offset, Math.min(end, offset + CHUNK))
          .arrayBuffer(),
      );
      this.net.send(t.peer, 'file-chunk', { id: t.id, offset, data });
    }
    rt.ackTimer = setTimeout(
      () => this.pause(t.id).catch((e) => this.emit('error', e.message)),
      60000,
    );
  }
  async finalize(t) {
    t.state = 'Finalizing';
    this.change();
    const digest = await createSHA256();
    digest.init();
    const filename = await uniqueName(t.destination, t.name);
    const output = await t.destination.getFileHandle(filename, {
      create: true,
    });
    const writer = await output.createWritable();
    try {
      for (let offset = 0; offset < t.size; offset += BLOCK) {
        if (t.state !== 'Finalizing')
          throw new Error('Transfer paused before finalization.');
        const f = await (
          await t.partial.getFileHandle(String(offset))
        ).getFile();
        const data = new Uint8Array(await f.arrayBuffer());
        if (data.length !== Math.min(BLOCK, t.size - offset))
          throw new Error('Partial file size mismatch.');
        digest.update(data);
        await writer.write(data);
      }
      const result = digest.digest();
      if (result !== t.digest)
        throw new Error(
          'File integrity check failed. Cancel and restart this transfer.',
        );
      await writer.close();
      t.output = output;
      t.savedName = filename;
      t.state = 'Completed';
      await this.persist(t);
      this.net.send(t.peer, 'file-complete', { id: t.id, digest: result });
      await t.destination
        .removeEntry(`.yard-${t.id}`, { recursive: true })
        .catch(() => {});
      this.runtime.delete(t.id);
      this.change();
      await this.nextReceive(t.peer);
    } catch (e) {
      await writer.abort().catch(() => {});
      await t.destination.removeEntry(filename).catch(() => {});
      throw e;
    }
  }
  async pause(transferId, notify = true) {
    const t = this.items.find((t) => t.id === transferId);
    if (!t || ['Completed', 'Canceled'].includes(t.state)) return;
    t.state = 'Paused';
    clearTimeout(this.runtime.get(t.id)?.ackTimer);
    this.runtime.delete(t.id);
    await this.persist(t);
    if (notify) this.net.send(t.peer, 'file-pause', { id: t.id });
    this.change();
  }
  async cancel(transferId, deletePartial = false, notify = true) {
    const t = this.items.find((t) => t.id === transferId);
    if (!t) return;
    await this.pause(t.id, false);
    t.state = 'Canceled';
    if (deletePartial && t.destination)
      await t.destination.removeEntry(`.yard-${t.id}`, { recursive: true });
    await this.persist(t);
    if (notify) this.net.send(t.peer, 'file-cancel', { id: t.id });
    this.change();
  }
  async fail(t, message) {
    t.state = 'Failed';
    t.error = message;
    clearTimeout(this.runtime.get(t.id)?.ackTimer);
    this.runtime.delete(t.id);
    await this.persist(t);
    this.change();
  }
  async next(peer) {
    const t = this.items.find(
      (t) => t.peer === peer && t.direction === 'send' && t.state === 'Queued',
    );
    if (t) await this.start(t, t.offset);
  }
  async reselect(transferId, handle) {
    const t = this.items.find((t) => t.id === transferId);
    const file = await handle.getFile();
    if (file.size !== t.size || (await hashFile(file)) !== t.digest)
      throw new Error('Choose the original matching file.');
    t.source = handle;
    t.modified = file.lastModified;
    await this.persist(t);
  }
}
