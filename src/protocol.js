export const VERSION = 1;
export const MAX_FILE = 10_000_000_000;
export const CHUNK = 256 * 1024;
export const id = () => crypto.randomUUID();
export const bytes = (n) =>
  n >= 1e9
    ? `${(n / 1e9).toFixed(2)} GB`
    : n >= 1e6
      ? `${(n / 1e6).toFixed(1)} MB`
      : n >= 1e3
        ? `${(n / 1e3).toFixed(1)} KB`
        : `${n} B`;
export function safeName(name) {
  return (
    typeof name === 'string' &&
    name.length > 0 &&
    name.length <= 240 &&
    !/[\\/\x00-\x1f]/.test(name) &&
    !['.', '..'].includes(name) &&
    !/[. ]$/.test(name) &&
    !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)
  );
}
export function validFile(file) {
  return (
    file &&
    safeName(file.name) &&
    Number.isSafeInteger(file.size) &&
    file.size >= 0 &&
    file.size <= MAX_FILE &&
    typeof file.id === 'string' &&
    file.id.length <= 100 &&
    Number.isFinite(file.modified)
  );
}
export function envelope(type, data = {}) {
  return { v: VERSION, type, ...data };
}
export function validMessage(m) {
  return (
    m && m.v === VERSION && typeof m.type === 'string' && m.type.length < 50
  );
}
export function validOffset(offset, size) {
  return Number.isSafeInteger(offset) && offset >= 0 && offset <= size;
}
export function binaryBytes(value) {
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value))
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  return null;
}
export function serverKey(config) {
  return JSON.stringify([
    config.host || '0.peerjs.com',
    Number(config.port || 443),
    config.path || '/',
    config.secure !== false,
  ]);
}
export function inviteEncode(value) {
  return btoa(JSON.stringify(value));
}
export function inviteDecode(value) {
  const result = JSON.parse(atob(value.trim()));
  if (
    result.v !== 1 ||
    typeof result.route !== 'string' ||
    !/^[\w-]{1,100}$/.test(result.route) ||
    typeof result.token !== 'string' ||
    result.token.length < 30 ||
    result.token.length > 100 ||
    !result.publicKey
  )
    throw new Error(
      'This invite is not valid. Ask your friend to copy a fresh invite.',
    );
  return result;
}
