import { $, esc, toast, task, button, modal, confirm, dot } from './dom.js';
import { icon } from './icons.js';
export function initFriends(state, notes) {
  const renderNote = notes.renderNote;
  let nudgeAt = 0;
  function ensureOwner() {
    if (!state.owner)
      throw new Error('Open the active Yard tab to connect with friends.');
    if (!state.network) throw new Error('Yard is still starting.');
  }
  function inviteDialog() {
    ensureOwner();
    modal(
      'Open your gate',
      `<p>Send this invite privately to someone you know. You’ll approve them before they join your hangout.</p><textarea id="invite-code" rows="4" readonly aria-label="Your invite code">${esc(state.network.invite())}</textarea><div class="dialog-actions"><button id="copy-invite" class="primary">Copy invite</button></div><p class="subtle">Invites work while this Yard is open. Up to four people per hangout.</p>`,
      () =>
        button('#copy-invite', async () => {
          await navigator.clipboard.writeText($('#invite-code').value);
          toast('Invite copied. Send it to your friend.');
        }),
    );
  }
  button('#invite-button', inviteDialog);
  button('#start-room', () => {
    ensureOwner();
    if (!state.network.room) state.network.host();
    inviteDialog();
  });
  button('#join-button', () => {
    ensureOwner();
    modal(
      'Visit a friend’s Yard',
      `<p>Paste the invite they shared with you.</p><label>Invite code<textarea id="join-code" rows="4"></textarea></label><div class="dialog-actions"><button id="join-now" class="primary">Knock on their gate</button></div>`,
      () =>
        button('#join-now', async () => {
          await state.network.join($('#join-code').value);
          $('#dialog').close();
          toast('Connecting. Your friend will approve your visit.');
        }),
    );
  });
  function renderFriends() {
    $('#signal').outerHTML =
      `<span id="signal">${dot(state.owner ? state.network?.signal || 'Connecting' : 'Other tab active')}</span>`;
    if (!state.network) {
      $('#friends-list').innerHTML =
        '<div class="empty compact"><p>Friends are active in your other Yard tab.</p></div>';
      return;
    }
    const saved = state.network.friends;
    const visitors = [...state.network.links.values()]
      .filter(
        (l) =>
          l.authenticated &&
          !saved.some((f) => f.fingerprint === l.remote.fingerprint),
      )
      .map((l) => l.remote);
    $('#friends-list').innerHTML =
      [...saved, ...visitors]
        .map((f) => {
          const status = f.blocked
            ? 'Blocked'
            : f.server && f.server !== state.network.key
              ? 'Unknown'
              : state.network.status.get(f.route) || 'Unknown';
          return `<div class="friend-row"><span class="person-avatar">${esc((f.nickname || f.name || '?')[0].toUpperCase())}</span><div class="friend-name"><strong>${esc(f.nickname || f.name)}</strong>${dot(status)}</div><div class="friend-actions">${status === 'Connected' ? `<button class="text-button" data-friend="invite" data-route="${esc(f.route)}">Invite</button>` : !f.blocked ? `<button class="text-button" data-friend="connect" data-route="${esc(f.route)}">Connect</button>` : ''}<button class="icon-button" data-friend="manage" data-route="${esc(f.route)}" aria-label="Manage ${esc(f.name)}">···</button></div></div>`;
        })
        .join('') ||
      `<div class="empty compact"><span class="empty-icon">${icon('users')}</span><h3>No friends yet</h3><p>Invite a friend or join with their code.</p></div>`;
    const room = state.network.room;
    $('#room-info').innerHTML = room
      ? `<div class="room-heading"><span><i class="small-dot"></i> ${room.members.length}/4 in your hangout</span><button id="leave-room" class="text-button">Leave</button></div><div class="participants">${room.members.map((p) => `<span>${esc(p.name)}${p.route === room.host ? ' · host' : ''}</span>`).join('')}</div>`
      : '';
    if (room) button('#leave-room', () => state.network.leave());
    $('#room-label').textContent = room
      ? 'Here together. No endless feed.'
      : 'Small circles, real connection.';
    $('#chat-input').disabled = !room;
    $('#nudge').disabled = !room;
    renderNote();
  }
  $('#friends-list').onclick = task(async (e) => {
    const b = e.target.closest('[data-friend]');
    if (!b) return;
    ensureOwner();
    const route = b.dataset.route;
    const f = state.network.friends.find((f) => f.route === route);
    if (b.dataset.friend === 'connect') {
      state.network.connect(route);
      return;
    }
    if (b.dataset.friend === 'invite') {
      state.network.inviteFriend(route);
      toast('Hangout invitation sent.');
      return;
    }
    if (!f) {
      modal(
        'Save this connection',
        `<p>Add this person as a friend to reconnect next time without sharing codes.</p><div class="dialog-actions"><button id="add-friend" class="primary">Add friend</button></div>`,
        () =>
          button('#add-friend', () => {
            state.network.requestFriend(route);
            $('#dialog').close();
            toast('Friend request sent.');
          }),
      );
      return;
    }
    modal(
      f.nickname || f.name,
      `<label>Nickname<input id="nickname" maxlength="80" value="${esc(f.nickname)}"></label><p>Identity: ${esc(f.fingerprint.slice(0, 20))}…</p><div class="dialog-actions"><button id="remove-friend" class="text-button danger">Remove</button><button id="block-friend" class="quiet">${f.blocked ? 'Unblock' : 'Block'}</button><button id="rename-friend" class="primary">Save nickname</button></div>`,
      () => {
        button('#rename-friend', async () => {
          await state.network.editFriend(f.fingerprint, {
            nickname: $('#nickname').value.trim(),
          });
          $('#dialog').close();
        });
        button('#block-friend', async () => {
          await state.network.editFriend(f.fingerprint, {
            blocked: !f.blocked,
          });
          $('#dialog').close();
        });
        button('#remove-friend', async () => {
          await state.network.removeFriend(f.fingerprint);
          $('#dialog').close();
        });
      },
    );
  });
  function chat(name, text) {
    const line = document.createElement('div');
    line.className = 'chat-line';
    const label = document.createElement('strong');
    label.textContent = name;
    const content = document.createElement('p');
    content.textContent = text;
    line.append(label, content);
    $('#chat-log').append(line);
    while ($('#chat-log').children.length > 100)
      $('#chat-log').firstChild.remove();
    $('#chat-log').scrollTop = $('#chat-log').scrollHeight;
  }
  $('#chat-form').onsubmit = task(async (e) => {
    e.preventDefault();
    ensureOwner();
    if (!state.network.room) return;
    const text = $('#chat-input').value.trim();
    if (!text) return;
    state.network.roomSend('chat', { text, name: state.settings.name });
    chat(state.settings.name, text);
    $('#chat-input').value = '';
  });
  function nudge() {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches)
      toast('A friend sent a nudge ♧');
    else {
      $('[data-panel="friends"]').classList.remove('shake');
      requestAnimationFrame(() =>
        $('[data-panel="friends"]').classList.add('shake'),
      );
      toast('A friend sent a nudge ♧');
    }
    if (state.settings.sounds) {
      const context = new AudioContext();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.frequency.value = 660;
      gain.gain.setValueAtTime(0.05, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.3);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.3);
      oscillator.onended = () => context.close();
    }
  }
  button('#nudge', () => {
    ensureOwner();
    if (Date.now() - nudgeAt < 10000)
      throw new Error(
        'Give your friend a moment. Nudges have a 10-second cooldown.',
      );
    nudgeAt = Date.now();
    state.network.roomSend('nudge', {});
    toast('A little hello, sent.');
  });
  return { ensureOwner, renderFriends, chat, nudge };
}
