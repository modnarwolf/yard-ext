import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import 'fake-indexeddb/auto';
import { Network } from '../src/network.js';
import { fingerprint } from '../src/identity.js';
import { serverKey } from '../src/protocol.js';
import { Collaboration } from '../src/collaboration.js';
async function client(name) {
  const n = new Network();
  const keys = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign', 'verify'],
  );
  n.me = {
    route: `yard-${name}`,
    privateKey: keys.privateKey,
    publicKey: await crypto.subtle.exportKey('jwk', keys.publicKey),
  };
  n.me.fingerprint = await fingerprint(n.me.publicKey);
  n.name = name;
  n.friends = [];
  n.key = serverKey({});
  return n;
}
class Connection extends EventEmitter {
  constructor(peer, metadata) {
    super();
    this.peer = peer;
    this.metadata = metadata;
    this.open = false;
  }
  send(message) {
    const wire = { ...message };
    for (const key of ['update', 'vector'])
      if (wire[key] instanceof Uint8Array)
        wire[key] = wire[key].buffer.slice(
          wire[key].byteOffset,
          wire[key].byteOffset + wire[key].byteLength,
        );
    queueMicrotask(() => {
      if (this.other.open) this.other.emit('data', wire);
    });
  }
  close() {
    if (!this.open) return;
    this.open = false;
    this.emit('close');
    if (this.other.open) {
      this.other.open = false;
      this.other.emit('close');
    }
  }
}
function link(a, b, options = {}) {
  const ac = new Connection(b.me.route),
    bc = new Connection(a.me.route, { token: options.token });
  ac.other = bc;
  bc.other = ac;
  a.attach(ac, { expected: b.me.publicKey, join: options.join });
  b.attach(bc);
  ac.open = bc.open = true;
  ac.emit('open');
  bc.emit('open');
  return [ac, bc];
}
function until(target, type, predicate = () => true) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      target.removeEventListener(type, handler);
      reject(new Error(`Timed out waiting for ${type}`));
    }, 3000);
    function handler(e) {
      if (predicate(e.detail)) {
        clearTimeout(timeout);
        target.removeEventListener(type, handler);
        resolve(e.detail);
      }
    }
    target.addEventListener(type, handler);
  });
}
test('first invite authenticates, host approves, friends save mutually and reconnect', async () => {
  const a = await client('Alex'),
    b = await client('Sam');
  const request = until(a, 'join-request');
  link(b, a, { token: a.token, join: true });
  await request;
  assert.equal(a.room, null);
  const room = until(b, 'room');
  a.approve(b.me.route, true);
  await room;
  assert.equal(b.room.members.length, 2);
  const fr = until(b, 'friend-request');
  a.requestFriend(b.me.route);
  await fr;
  const changed = until(a, 'change', () =>
    a.friends.some((f) => f.fingerprint === b.me.fingerprint),
  );
  await b.acceptFriend(a.me.route);
  await changed;
  assert.ok(a.friends.some((f) => f.fingerprint === b.me.fingerprint));
  assert.ok(b.friends.some((f) => f.fingerprint === a.me.fingerprint));
  a.close(b.me.route, 'Offline');
  const connected = until(a, 'connected');
  link(a, b);
  await connected;
  assert.equal(a.status.get(b.me.route), 'Connected');
  a.close(b.me.route, 'Offline');
});
test('saved identity substitution is rejected before connection is trusted', async () => {
  const a = await client('Trusted'),
    b = await client('Original'),
    imposter = await client('Imposter');
  imposter.me.route = b.me.route;
  a.friends = [
    {
      route: b.me.route,
      publicKey: b.me.publicKey,
      fingerprint: b.me.fingerprint,
    },
  ];
  const ac = new Connection(b.me.route),
    bc = new Connection(a.me.route);
  ac.other = bc;
  bc.other = ac;
  const error = until(a, 'error');
  a.attach(ac);
  imposter.attach(bc, { expected: a.me.publicKey });
  ac.open = bc.open = true;
  ac.emit('open');
  bc.emit('open');
  assert.match(await error, /identity changed/);
  assert.notEqual(a.status.get(b.me.route), 'Connected');
  a.close(b.me.route, 'Unknown');
  imposter.close(a.me.route, 'Unknown');
});
test('host membership is capped and closing host ends guest hangout', async () => {
  const host = await client('host');
  host.host();
  for (let i = 0; i < 3; i++) {
    const guest = await client(`guest${i}`);
    const request = until(host, 'join-request');
    link(guest, host, { token: host.token, join: true });
    await request;
    const room = until(guest, 'room');
    host.approve(guest.me.route, true);
    await room;
  }
  assert.equal(host.room.members.length, 4);
  const extra = await client('extra'),
    request = until(host, 'join-request');
  link(extra, host, { token: host.token, join: true });
  await request;
  const denied = until(extra, 'error');
  host.approve(extra.me.route, true);
  assert.match(await denied, /full/);
  for (const route of [...host.links.keys()]) host.close(route, 'Offline');
  extra.stop();
});
test('Yjs converges concurrent typing across authenticated peers', async () => {
  const a = await client('writer1'),
    b = await client('writer2');
  const request = until(a, 'join-request');
  link(b, a, { token: a.token, join: true });
  await request;
  const ca = new Collaboration(a),
    cb = new Collaboration(b);
  await Promise.all([ca.ready, cb.ready]);
  const room = until(b, 'room');
  a.approve(b.me.route, true);
  await room;
  ca.edit('Hello');
  cb.edit('Garden');
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(ca.text.toString(), cb.text.toString());
  assert.match(ca.text.toString(), /Hello/);
  assert.match(ca.text.toString(), /Garden/);
  const message = until(a, 'message', (m) => m.message.type === 'chat');
  b.roomSend('chat', { text: 'guest says hello' });
  assert.equal((await message).message.text, 'guest says hello');
  a.close(b.me.route, 'Offline');
});
test('a new hangout does not publish the previous hangout note', async () => {
  const host = await client('privacy');
  const note = new Collaboration(host);
  await note.ready;
  host.host();
  note.edit('private previous-room memory');
  host.leave();
  host.host();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(note.text.toString(), '');
  host.leave();
});
