let dbPromise;
export function database() {
  return (dbPromise ||= new Promise((resolve, reject) => {
    const request = indexedDB.open('yard', 1);
    request.onupgradeneeded = () => {
      for (const name of ['settings', 'friends', 'transfers', 'notes'])
        request.result.createObjectStore(name);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }));
}
async function run(store, mode, operation) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(store, mode);
    const request = operation(transaction.objectStore(store));
    transaction.oncomplete = () => resolve(request.result);
    transaction.onabort = transaction.onerror = () =>
      reject(transaction.error || request.error);
  });
}
export const get = (store, key) => run(store, 'readonly', (s) => s.get(key));
export const put = (store, key, value) =>
  run(store, 'readwrite', (s) => s.put(value, key));
export const remove = (store, key) =>
  run(store, 'readwrite', (s) => s.delete(key));
export const all = (store) => run(store, 'readonly', (s) => s.getAll());
