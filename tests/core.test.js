import { test } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {
  safeName,
  validFile,
  MAX_FILE,
  validOffset,
  inviteEncode,
  inviteDecode,
  serverKey,
} from '../src/protocol.js';
import { identity, fingerprint, sign, verify } from '../src/identity.js';
import { Vault, uniqueName } from '../src/filesystem.js';
import { put, get } from '../src/storage.js';
test('10 GB boundary and unsafe incoming filenames', () => {
  const f = { id: 'test', name: 'video.mp4', size: MAX_FILE, modified: 1 };
  assert.equal(validFile(f), true);
  assert.equal(validFile({ ...f, size: MAX_FILE + 1 }), false);
  for (const name of [
    '../photo.jpg',
    'a/b',
    'a\\b',
    'CON.txt',
    'file.',
    'file\u0000',
  ])
    assert.equal(safeName(name), false);
  assert.equal(validOffset(-1, 100), false);
  assert.equal(validOffset(101, 100), false);
  assert.equal(validOffset(100, 100), true);
});
test('invites preserve identity and server configuration', () => {
  const invite = {
    v: 1,
    route: 'yard-one',
    token: 'a'.repeat(64),
    publicKey: { x: 'x' },
    config: { host: 'yard.example', port: 443 },
  };
  assert.deepEqual(inviteDecode(inviteEncode(invite)), invite);
  assert.throws(() => inviteDecode('invalid'));
  assert.notEqual(serverKey({ host: 'yard.example' }), serverKey({}));
});
test('identity persists and challenge signatures resist key substitution', async () => {
  const me = await identity(),
    same = await identity();
  assert.equal(me.route, same.route);
  const proof = await sign(me.privateKey, 'fresh challenge');
  assert.equal(await verify(me.publicKey, 'fresh challenge', proof), true);
  assert.equal(await verify(me.publicKey, 'different challenge', proof), false);
  const stranger = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );
  const key = await crypto.subtle.exportKey('jwk', stranger.publicKey);
  assert.equal(await verify(key, 'fresh challenge', proof), false);
  assert.notEqual(await fingerprint(key), await fingerprint(me.publicKey));
});
test('storage resolves only committed writes', async () => {
  await put('notes', 'test', 'saved');
  assert.equal(await get('notes', 'test'), 'saved');
});
test('external note changes prevent overwrite', async () => {
  let wrote = false;
  const handle = {
    queryPermission: async () => 'granted',
    getFile: async () => ({ lastModified: 2, size: 4 }),
    createWritable: async () => {
      wrote = true;
    },
  };
  const vault = new Vault();
  await assert.rejects(
    vault.write(handle, 'new', { modified: 1, size: 4 }),
    /CONFLICT/,
  );
  assert.equal(wrote, false);
});
test('duplicate received files get unique names', async () => {
  const directory = {
    getFileHandle: async (name) => {
      if (['photo.jpg', 'photo (1).jpg'].includes(name)) return {};
      throw new DOMException('missing', 'NotFoundError');
    },
  };
  assert.equal(await uniqueName(directory, 'photo.jpg'), 'photo (2).jpg');
});
