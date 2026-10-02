import { get, put } from './storage.js';
import { id } from './protocol.js';
const encode = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const decode = (value) => Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
export async function identity() {
  let saved = await get('settings', 'identity');
  if (!saved) {
    const keys = await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign', 'verify'],
    );
    saved = {
      privateKey: keys.privateKey,
      publicKey: await crypto.subtle.exportKey('jwk', keys.publicKey),
      route: `yard-${id()}`,
    };
    await put('settings', 'identity', saved);
  }
  return saved;
}
export async function fingerprint(key) {
  const canonical = JSON.stringify({
    crv: key.crv,
    kty: key.kty,
    x: key.x,
    y: key.y,
  });
  return encode(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical)),
  );
}
export async function sign(key, challenge) {
  return encode(
    await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      new TextEncoder().encode(challenge),
    ),
  );
}
export async function verify(key, challenge, signature) {
  try {
    const imported = await crypto.subtle.importKey(
      'jwk',
      key,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
    return await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      imported,
      decode(signature),
      new TextEncoder().encode(challenge),
    );
  } catch {
    return false;
  }
}
