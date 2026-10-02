import { get } from './storage.js';
import { Vault } from './filesystem.js';
import { Network } from './network.js';
import { Collaboration } from './collaboration.js';
import { Transfers } from './transfers.js';
import { ownSession } from './ownership.js';
import { $, toast, task, button, confirm } from './ui/dom.js';
import { mountShell, initShell } from './ui/shell.js';
import { initLayout } from './ui/layout.js';
import { initFilesNotes } from './ui/files-notes.js';
import { initSettings } from './ui/settings.js';
import { initFriends } from './ui/friends.js';
import { initTransferUI } from './ui/transfers.js';
export async function startApp() {
  const state = {
    settings: (await get('settings', 'preferences')) || {
      name: '',
      theme: 'light',
      sounds: false,
    },
    vault: await new Vault().init(),
    owner: false,
  };
  document.documentElement.dataset.theme = state.settings.theme;
  mountShell();
  const shell = initShell(state);
  await initLayout();
  const notes = await initFilesNotes(state);
  const { settingsDialog } = initSettings(state, shell);
  const friends = initFriends(state, notes);
  const { renderFriends, chat, nudge } = friends;
  const { renderTransfers } = initTransferUI(state, notes, friends);
  const focusOwner = await ownSession(async (isOwner) => {
    state.owner = isOwner;
    $('#owner-banner').hidden = isOwner;
    if (!isOwner) {
      renderFriends();
      return;
    }
    try {
      state.network = await new Network().init(
        state.settings.name || 'Yard friend',
        state.settings.network || {},
      );
      state.collab = new Collaboration(state.network);
      await state.collab.ready;
      state.transfers = await new Transfers(state.network).init();
      state.network.addEventListener('change', renderFriends);
      state.network.addEventListener('error', (e) => toast(e.detail));
      state.network.addEventListener(
        'join-request',
        task(async (e) => {
          const accept = await confirm(
            'Someone is at your gate',
            `${e.detail.name} would like to join your hangout.`,
            'Let them in',
          );
          state.network.approve(e.detail.route, accept);
        }),
      );
      state.network.addEventListener(
        'friend-request',
        task(async (e) => {
          if (
            await confirm(
              'Keep in touch?',
              `${e.detail.name} wants to save you as a friend. You can reconnect without another code.`,
              'Add friend',
            )
          )
            await state.network.acceptFriend(e.detail.route);
        }),
      );
      state.network.addEventListener(
        'room-invite',
        task(async (e) => {
          if (
            await confirm(
              'Come hang out',
              `${e.detail.name} invited you to their hangout.`,
              'Join hangout',
            )
          )
            state.network.acceptRoom(e.detail.route);
        }),
      );
      state.network.addEventListener('room', (e) => {
        if (e.detail) {
          chat(
            'Yard',
            `Hangout ready · ${e.detail.members.length} people. The host’s Yard must stay open.`,
          );
          for (const member of e.detail.members)
            if (
              member.route !== state.network.me.route &&
              state.network.me.route < member.route &&
              !state.network.links.has(member.route)
            ) {
              try {
                state.network.connect(member.route, {
                  expected: member.publicKey,
                });
              } catch (error) {
                toast(error.message);
              }
            }
        } else chat('Yard', 'Hangout ended. Your local note copy is safe.');
        renderFriends();
      });
      state.network.addEventListener('message', (e) => {
        const { route, message: m } = e.detail;
        if (!state.network.roomMessage(route, m)) return;
        if (
          m.type === 'chat' &&
          typeof m.text === 'string' &&
          m.text.length <= 4000
        ) {
          const name =
            state.network.room.host === state.network.me.route
              ? state.network.links.get(route)?.remote.name
              : m.name;
          chat(name || 'Friend', m.text);
          if (state.network.room.host === state.network.me.route)
            for (const p of state.network.room.members)
              if (p.route !== route && p.route !== state.network.me.route)
                state.network.send(p.route, 'chat', {
                  roomId: state.network.room.id,
                  text: m.text,
                  name,
                });
        }
        if (m.type === 'nudge') {
          const link = state.network.links.get(route);
          if (Date.now() - (link.lastNudge || 0) < 10000) return;
          link.lastNudge = Date.now();
          nudge();
          if (state.network.room.host === state.network.me.route)
            for (const p of state.network.room.members)
              if (p.route !== route && p.route !== state.network.me.route)
                state.network.send(p.route, 'nudge', {
                  roomId: state.network.room.id,
                });
        }
      });
      state.collab.addEventListener('change', notes.updateShared);
      state.collab.addEventListener('error', (e) => toast(e.detail));
      state.transfers.addEventListener('change', renderTransfers);
      state.transfers.addEventListener('error', (e) => toast(e.detail));
      state.transfers.addEventListener('offer', () =>
        toast(
          'A friend offered you files. Review them in Pass something along.',
        ),
      );
      state.network.start();
      renderFriends();
      renderTransfers();
      window.addEventListener('pagehide', () => state.network.stop(), {
        once: true,
      });
    } catch (error) {
      toast(error.message);
    }
  });
  button('#focus-owner', focusOwner);
  if (!state.settings.name) settingsDialog(true);

  return state;
}
