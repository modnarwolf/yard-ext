import * as Y from 'yjs';
import { get, put } from './storage.js';
import { binaryBytes } from './protocol.js';
export class Collaboration extends EventTarget {
  constructor(network) {
    super();
    this.network = network;
    this.doc = new Y.Doc();
    this.text = this.doc.getText('note');
    this.ready = this.init();
  }
  async init() {
    const stored = await get('notes', 'shared');
    if (stored) Y.applyUpdate(this.doc, stored, 'restore');
    this.bind();
    this.network.addEventListener('room', (event) => {
      if (!event.detail) return;
      if (event.detail.id !== this.roomId) {
        this.roomId = event.detail.id;
        this.doc.destroy();
        this.doc = new Y.Doc();
        this.text = this.doc.getText('note');
        this.bind();
        this.dispatchEvent(new Event('change'));
        const doc = this.doc,
          roomId = this.roomId;
        get('notes', `room:${roomId}`)
          .then((stored) => {
            if (this.doc !== doc) return;
            if (stored) Y.applyUpdate(doc, stored, 'restore');
            this.network.roomSend('note-sync', {
              vector: Y.encodeStateVector(doc),
            });
          })
          .catch((e) =>
            this.dispatchEvent(new CustomEvent('error', { detail: e.message })),
          );
      } else
        this.network.roomSend('note-sync', {
          vector: Y.encodeStateVector(this.doc),
        });
    });
    this.network.addEventListener('message', (event) => {
      const { route, message: m } = event.detail;
      if (!this.network.roomMessage(route, m)) return;
      try {
        const vector = binaryBytes(m.vector),
          update = binaryBytes(m.update);
        if (m.type === 'note-sync' && vector && vector.length < 1e6)
          this.network.send(route, 'note-update', {
            roomId: this.network.room.id,
            update: Y.encodeStateAsUpdate(this.doc, vector),
          });
        if (m.type === 'note-update' && update && update.length < 2e6) {
          Y.applyUpdate(this.doc, update, 'remote');
          if (this.network.room.host === this.network.me.route)
            for (const p of this.network.room.members)
              if (p.route !== route && p.route !== this.network.me.route)
                this.network.send(p.route, 'note-update', {
                  roomId: this.network.room.id,
                  update: m.update,
                });
        }
      } catch (error) {
        this.dispatchEvent(
          new CustomEvent('error', {
            detail: 'A malformed shared-note update was rejected.',
          }),
        );
        this.network.close(route, 'Unknown');
      }
    });
  }
  bind() {
    const doc = this.doc,
      roomId = this.roomId;
    doc.on('update', (update, origin) => {
      const state = Y.encodeStateAsUpdate(doc);
      this.persistence = (this.persistence || Promise.resolve())
        .then(async () => {
          if (roomId) await put('notes', `room:${roomId}`, state);
          await put('notes', 'shared', state);
        })
        .catch((e) =>
          this.dispatchEvent(new CustomEvent('error', { detail: e.message })),
        );
      if (origin !== 'remote' && origin !== 'restore')
        this.network.roomSend('note-update', { update });
      this.dispatchEvent(new Event('change'));
    });
  }
  edit(value) {
    if (value.length > 200000)
      throw new Error('Shared notes are limited to 200,000 characters.');
    const old = this.text.toString();
    let start = 0,
      end = 0;
    while (
      start < old.length &&
      start < value.length &&
      old[start] === value[start]
    )
      start++;
    while (
      end < old.length - start &&
      end < value.length - start &&
      old[old.length - 1 - end] === value[value.length - 1 - end]
    )
      end++;
    this.doc.transact(() => {
      this.text.delete(start, old.length - start - end);
      this.text.insert(start, value.slice(start, value.length - end));
    });
  }
}
