import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Transfers, hashFile } from '../src/transfers.js';
import { CHUNK, envelope } from '../src/protocol.js';
class FileHandle {
  constructor(name, data = new Uint8Array()) {
    this.name = name;
    this.data = data;
    this.modified = 1;
    this.kind = 'file';
  }
  async queryPermission() {
    return 'granted';
  }
  async requestPermission() {
    return 'granted';
  }
  async getFile() {
    return new File([this.data], this.name, { lastModified: this.modified });
  }
  async createWritable() {
    const parts = [];
    return {
      write: async (data) => parts.push(new Uint8Array(data)),
      close: async () => {
        const n = parts.reduce((s, p) => s + p.length, 0),
          out = new Uint8Array(n);
        let offset = 0;
        for (const p of parts) {
          out.set(p, offset);
          offset += p.length;
        }
        this.data = out;
      },
      abort: async () => {},
    };
  }
}
class Directory {
  constructor(name = 'destination') {
    this.name = name;
    this.children = new Map();
    this.kind = 'directory';
  }
  async queryPermission() {
    return 'granted';
  }
  async requestPermission() {
    return 'granted';
  }
  async getFileHandle(name, options = {}) {
    if (!this.children.has(name)) {
      if (!options.create) throw new DOMException('Missing', 'NotFoundError');
      this.children.set(name, new FileHandle(name));
    }
    return this.children.get(name);
  }
  async getDirectoryHandle(name, options = {}) {
    if (!this.children.has(name)) {
      if (!options.create) throw new DOMException('Missing', 'NotFoundError');
      this.children.set(name, new Directory(name));
    }
    return this.children.get(name);
  }
  async removeEntry(name) {
    this.children.delete(name);
  }
}
class Net extends EventTarget {
  constructor(route) {
    super();
    this.route = route;
    this.links = new Map();
  }
  send(peer, type, data = {}) {
    this.sent.push({ peer, type, ...data });
    const wire = { ...data };
    if (wire.data instanceof Uint8Array)
      wire.data = wire.data.buffer.slice(
        wire.data.byteOffset,
        wire.data.byteOffset + wire.data.byteLength,
      );
    queueMicrotask(() =>
      this.other.dispatchEvent(
        new CustomEvent('message', {
          detail: { route: this.route, message: envelope(type, wire) },
        }),
      ),
    );
  }
}
function store() {
  const records = new Map();
  return {
    all: async () => [...records.values()].map((t) => ({ ...t })),
    put: async (_, key, value) => records.set(key, { ...value }),
  };
}
function pair() {
  const a = new Net('sender'),
    b = new Net('receiver');
  a.other = b;
  b.other = a;
  a.sent = [];
  b.sent = [];
  a.links.set('receiver', { authenticated: true });
  b.links.set('sender', { authenticated: true });
  return { a, b };
}
function waitFor(engine, predicate, timeout = 10000) {
  if (predicate()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      engine.removeEventListener('change', change);
      reject(
        new Error(
          'Transfer test timed out: ' +
            engine.items.map((t) => t.state + ':' + t.error).join(','),
        ),
      );
    }, timeout);
    function change() {
      if (predicate()) {
        clearTimeout(timer);
        engine.removeEventListener('change', change);
        resolve();
      }
    }
    engine.addEventListener('change', change);
  });
}
test('streamed multi-block transfer verifies bytes and bounds chunk size', async () => {
  const { a, b } = pair();
  const sender = await new Transfers(a, store()).init(),
    receiver = await new Transfers(b, store()).init();
  const data = Uint8Array.from(
      { length: 5 * 1024 * 1024 + 17 },
      (_, i) => i % 251,
    ),
    source = new FileHandle('photos.zip', data),
    destination = new Directory();
  await sender.offer('receiver', [source]);
  await waitFor(receiver, () => receiver.items.length === 1);
  await receiver.accept(receiver.items[0].batch, destination);
  await waitFor(sender, () => sender.items[0].state === 'Completed');
  assert.equal(receiver.items[0].state, 'Completed');
  assert.deepEqual(receiver.items[0].output.data, data);
  assert.ok(
    a.sent
      .filter((m) => m.type === 'file-chunk')
      .every((m) => m.data.length <= CHUNK),
  );
  assert.equal(b.sent.filter((m) => m.type === 'file-ack').length, 2);
  assert.equal(receiver.items[0].offset, data.length);
});
test('restart resumes only committed blocks and preserves final integrity', async () => {
  const { a, b } = pair(),
    ss = store(),
    rs = store();
  let sender = await new Transfers(a, ss).init(),
    receiver = await new Transfers(b, rs).init();
  const source = new FileHandle(
    'video.mp4',
    new Uint8Array(6 * 1024 * 1024).fill(71),
  );
  const descriptor = {
    id: 'resume-test',
    name: source.name,
    size: source.data.length,
    modified: 1,
    digest: await hashFile(await source.getFile()),
  };
  await receiver.receive(
    'sender',
    envelope('file-offer', { batch: 'batch', files: [descriptor] }),
  );
  const destination = new Directory();
  await receiver.accept('batch', destination);
  for (let offset = 0; offset < 4 * 1024 * 1024; offset += CHUNK)
    await receiver.receive(
      'sender',
      envelope('file-chunk', {
        id: descriptor.id,
        offset,
        data: source.data.slice(offset, offset + CHUNK),
      }),
    );
  await receiver.pause(descriptor.id, false);
  const freshB = new Net('receiver');
  freshB.links.set('sender', { authenticated: true });
  freshB.sent = [];
  freshB.other = a;
  a.other = freshB;
  receiver = await new Transfers(freshB, rs).init();
  sender.items = [
    {
      ...descriptor,
      batch: 'batch',
      peer: 'receiver',
      direction: 'send',
      source,
      offset: 0,
      state: 'Paused',
    },
  ];
  await sender.persist(sender.items[0]);
  await receiver.resume(descriptor.id);
  await waitFor(sender, () => sender.items[0].state === 'Completed');
  const first = a.sent.find((m) => m.type === 'file-chunk');
  assert.equal(first.offset, 4 * 1024 * 1024);
  assert.deepEqual(receiver.items[0].output.data, source.data);
});
test('tampered partial blocks cannot resume', async () => {
  const { a, b } = pair(),
    receiver = await new Transfers(b, store()).init(),
    destination = new Directory();
  const file = new FileHandle('photo.jpg', new Uint8Array(CHUNK).fill(3));
  const descriptor = {
    id: 'tamper',
    name: file.name,
    size: CHUNK,
    modified: 1,
    digest: await hashFile(await file.getFile()),
  };
  await receiver.receive(
    'sender',
    envelope('file-offer', { batch: 'batch', files: [descriptor] }),
  );
  await receiver.accept('batch', destination);
  await receiver.receive(
    'sender',
    envelope('file-chunk', { id: 'tamper', offset: 0, data: file.data }),
  );
  await receiver.pause('tamper', false);
  const partial = await receiver.items[0].partial.getFileHandle('0');
  partial.data[0] = 99;
  await assert.rejects(
    receiver.resume('tamper'),
    /partial file is missing or changed/,
  );
});
test('disk failures never acknowledge delivery', async () => {
  const { a, b } = pair(),
    receiver = await new Transfers(b, store()).init();
  const destination = new Directory();
  const descriptor = {
    id: 'disk-full',
    name: 'image.jpg',
    size: 1,
    modified: 1,
    digest: 'a'.repeat(64),
  };
  await receiver.receive(
    'sender',
    envelope('file-offer', { batch: 'batch', files: [descriptor] }),
  );
  await receiver.accept('batch', destination);
  receiver.items[0].partial.getFileHandle = async () => ({
    createWritable: async () => {
      throw new DOMException('Disk full', 'QuotaExceededError');
    },
  });
  await assert.rejects(
    receiver.receive(
      'sender',
      envelope('file-chunk', {
        id: 'disk-full',
        offset: 0,
        data: new Uint8Array([1]),
      }),
    ),
    /Disk full/,
  );
  assert.equal(
    b.sent.some((m) => m.type === 'file-ack' || m.type === 'file-complete'),
    false,
  );
});
test('multi-file batches advance sequentially and include empty files', async () => {
  const { a, b } = pair(),
    sender = await new Transfers(a, store()).init(),
    receiver = await new Transfers(b, store()).init();
  await sender.offer('receiver', [
    new FileHandle('empty.txt'),
    new FileHandle('second.jpg', new Uint8Array([1, 2, 3])),
  ]);
  await waitFor(receiver, () => receiver.items.length === 2);
  await receiver.accept(receiver.items[0].batch, new Directory());
  await waitFor(sender, () =>
    sender.items.every((t) => t.state === 'Completed'),
  );
  assert.equal(receiver.items[0].output.data.length, 0);
  assert.deepEqual(receiver.items[1].output.data, new Uint8Array([1, 2, 3]));
});
test('unexpected offsets and oversized chunks are rejected', async () => {
  const { a, b } = pair(),
    receiver = await new Transfers(b, store()).init();
  const file = new FileHandle('photo.jpg', new Uint8Array(CHUNK * 2));
  await receiver.receive(
    'sender',
    envelope('file-offer', {
      batch: 'batch',
      files: [
        {
          id: 'invalid',
          name: file.name,
          size: file.data.length,
          modified: 1,
          digest: await hashFile(await file.getFile()),
        },
      ],
    }),
  );
  await receiver.accept('batch', new Directory());
  await assert.rejects(
    receiver.receive(
      'sender',
      envelope('file-chunk', {
        id: 'invalid',
        offset: 1,
        data: new Uint8Array([1]),
      }),
    ),
    /Invalid transfer chunk/,
  );
  await assert.rejects(
    receiver.receive(
      'sender',
      envelope('file-chunk', {
        id: 'invalid',
        offset: 0,
        data: new Uint8Array(CHUNK + 1),
      }),
    ),
    /Invalid transfer chunk/,
  );
});
