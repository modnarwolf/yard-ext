// Opt-in real disk test. Uses the production transfer engine with a local transport.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { Transfers, hashFile } from '../src/transfers.js';
import { envelope, MAX_FILE } from '../src/protocol.js';
const size = Number(process.env.YARD_TEST_BYTES || MAX_FILE);
if (!Number.isSafeInteger(size) || size < 8 * 1024 * 1024 || size > MAX_FILE)
  throw new Error('Invalid test size');
const tempRoot = path.resolve('tmp');
await fs.mkdir(tempRoot, { recursive: true });
const root = await fs.mkdtemp(path.join(tempRoot, 'yard-large-'));
class Handle {
  constructor(filename) {
    this.path = filename;
    this.name = path.basename(filename);
  }
  async queryPermission() {
    return 'granted';
  }
  async requestPermission() {
    return 'granted';
  }
  async getFile() {
    const stat = await fs.stat(this.path),
      filename = this.path;
    return {
      name: this.name,
      size: stat.size,
      lastModified: stat.mtimeMs,
      slice(start, end) {
        return {
          async arrayBuffer() {
            const handle = await fs.open(filename, 'r');
            try {
              const buffer = new Uint8Array(end - start);
              const { bytesRead } = await handle.read(
                buffer,
                0,
                buffer.length,
                start,
              );
              return buffer.buffer.slice(0, bytesRead);
            } finally {
              await handle.close();
            }
          },
        };
      },
      async arrayBuffer() {
        const data = await fs.readFile(filename);
        return data.buffer.slice(
          data.byteOffset,
          data.byteOffset + data.length,
        );
      },
    };
  }
  async createWritable() {
    const handle = await fs.open(this.path, 'w');
    return {
      write: async (data) => {
        let offset = 0;
        while (offset < data.length) {
          const result = await handle.write(data, offset, data.length - offset);
          offset += result.bytesWritten;
        }
      },
      close: async () => {
        await handle.sync();
        await handle.close();
      },
      abort: async () => handle.close().catch(() => {}),
    };
  }
}
class Directory extends Handle {
  async getFileHandle(name, { create = false } = {}) {
    const filename = path.join(this.path, name);
    try {
      await fs.access(filename);
    } catch {
      if (!create) throw new DOMException('Missing', 'NotFoundError');
      const handle = await fs.open(filename, 'wx');
      await handle.close();
    }
    return new Handle(filename);
  }
  async getDirectoryHandle(name, { create = false } = {}) {
    const filename = path.join(this.path, name);
    if (create) await fs.mkdir(filename, { recursive: true });
    return new Directory(filename);
  }
  async removeEntry(name, { recursive = false } = {}) {
    const target = path.resolve(this.path, name);
    if (!target.startsWith(root + path.sep))
      throw new Error('Test cleanup escaped fixture');
    await fs.rm(target, { recursive, force: true });
  }
}
class Net extends EventTarget {
  constructor(route) {
    super();
    this.route = route;
    this.links = new Map();
    this.enabled = true;
  }
  send(peer, type, data) {
    if (!this.enabled) return;
    queueMicrotask(() => {
      if (this.other.enabled)
        this.other.dispatchEvent(
          new CustomEvent('message', {
            detail: { route: this.route, message: envelope(type, data) },
          }),
        );
    });
  }
}
const storage = () => {
  const values = new Map();
  return {
    all: async () => [...values.values()].map((x) => ({ ...x })),
    put: async (_, key, value) => values.set(key, { ...value }),
  };
};
function pair() {
  const a = new Net('sender'),
    b = new Net('receiver');
  a.other = b;
  b.other = a;
  a.links.set('receiver', { authenticated: true });
  b.links.set('sender', { authenticated: true });
  return { a, b };
}
function wait(engine, predicate) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Large transfer test timeout')),
      30 * 60 * 1000,
    );
    const listener = () => {
      const error = engine.items.find((t) => t.error);
      if (error) {
        clearTimeout(timer);
        engine.removeEventListener('change', listener);
        reject(new Error(error.error));
      } else if (predicate()) {
        clearTimeout(timer);
        engine.removeEventListener('change', listener);
        resolve();
      }
    };
    engine.addEventListener('change', listener);
    listener();
  });
}
let peak = 0;
const sampler = setInterval(
  () => (peak = Math.max(peak, process.memoryUsage().rss)),
  250,
);
try {
  const sourcePath = path.join(root, 'source-video.bin');
  const fh = await fs.open(sourcePath, 'w');
  await fh.truncate(size);
  await fh.write(
    new TextEncoder().encode('YARD 10 GB transfer test'),
    0,
    23,
    0,
  );
  await fh.close();
  let { a, b } = pair();
  const ss = storage(),
    rs = storage();
  let sender = await new Transfers(a, ss).init(),
    receiver = await new Transfers(b, rs).init();
  console.log(`Preparing ${(size / 1e9).toFixed(2)} GB synthetic disk fixture`);
  await sender.offer('receiver', [new Handle(sourcePath)]);
  await wait(receiver, () => receiver.items.length === 1);
  await fs.mkdir(path.join(root, 'destination'));
  let interrupted = false;
  receiver.addEventListener('change', () => {
    if (!interrupted && receiver.items[0]?.offset >= 8 * 1024 * 1024) {
      interrupted = true;
      a.enabled = b.enabled = false;
    }
  });
  await receiver.accept(
    receiver.items[0].batch,
    new Directory(path.join(root, 'destination')),
  );
  await wait(receiver, () => interrupted);
  await receiver.pause(receiver.items[0].id, false);
  await sender.pause(sender.items[0].id, false);
  console.log(
    `Simulated browser restart at ${receiver.items[0].offset} committed bytes`,
  );
  ({ a, b } = pair());
  sender = await new Transfers(a, ss).init();
  receiver = await new Transfers(b, rs).init();
  let last = 0;
  receiver.addEventListener('change', () => {
    const offset = receiver.items[0]?.offset || 0;
    if (offset - last >= 1e9) {
      last = offset;
      console.log(`Committed ${(offset / 1e9).toFixed(2)} GB`);
    }
  });
  await receiver.resume(receiver.items[0].id);
  await wait(sender, () => sender.items[0].state === 'Completed');
  assert.equal(receiver.items[0].offset, size);
  const output = await receiver.items[0].output.getFile();
  assert.equal(output.size, size);
  const digest = await hashFile(output);
  assert.equal(digest, sender.items[0].digest);
  console.log(
    JSON.stringify({
      bytes: size,
      restarted: true,
      sha256: digest,
      peakRssMB: Math.round(peak / 1e6),
      result: 'PASS',
    }),
  );
} finally {
  clearInterval(sampler);
  if (
    !root.startsWith(tempRoot + path.sep) ||
    !path.basename(root).startsWith('yard-large-')
  )
    throw new Error('Unsafe cleanup target');
  await fs.rm(root, { recursive: true, force: true });
}
