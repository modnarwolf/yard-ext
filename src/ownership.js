export async function ownSession(onOwner) {
  const channel = new BroadcastChannel('yard-owner');
  channel.onmessage = (event) => {
    if (event.data === 'focus' && window.__yardOwner) {
      window.focus();
      document.title = '● Your friends are here · Yard';
    }
  };
  let release,
    closed = false;
  const abort = new AbortController();
  const hold = async () => {
    if (closed) return;
    window.__yardOwner = true;
    if (globalThis.chrome?.tabs)
      chrome.tabs.getCurrent((tab) => {
        if (tab) chrome.storage.session.set({ yardOwnerTabId: tab.id });
      });
    await onOwner(true);
    await new Promise((resolve) => {
      release = resolve;
    });
  };
  navigator.locks.request(
    'yard-network-owner',
    { ifAvailable: true },
    async (lock) => {
      if (lock) return hold();
      onOwner(false);
      navigator.locks
        .request('yard-network-owner', { signal: abort.signal }, hold)
        .catch(() => {});
    },
  );
  window.addEventListener(
    'pagehide',
    () => {
      closed = true;
      abort.abort();
      release?.();
      channel.close();
    },
    { once: true },
  );
  return () => {
    channel.postMessage('focus');
    if (globalThis.chrome?.tabs)
      chrome.storage.session.get('yardOwnerTabId', (saved) => {
        if (saved.yardOwnerTabId)
          chrome.tabs.update(saved.yardOwnerTabId, { active: true }, (tab) => {
            if (tab) chrome.windows.update(tab.windowId, { focused: true });
          });
      });
  };
}
