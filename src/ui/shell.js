import plants from '../../resources/Minimalist Line-Art Houseplants on a Shelf.png';
import { $ } from './dom.js';
export function mountShell() {
  $('#app').innerHTML = `
<aside class="rail"><a class="brand-mark" href="#" aria-label="Yard home">y<span>•</span></a><nav aria-label="Workspace"><button data-jump="files" title="Files">▤</button><button data-jump="friends" title="Friends">☷</button><button data-jump="notes" title="Notes">✎</button><button data-jump="transfers" title="Transfers">⇄</button></nav><button id="settings-button" title="Settings">⚙</button><span class="rail-word">YOUR SPACE</span></aside>
<main><header class="topbar"><div class="wordmark">yard<span class="wordmark-tag">a little closer</span></div><div class="top-actions"><span id="signal" class="status"><i></i>Starting</span><button id="layout-button" class="quiet">⊞ Edit space</button><button id="profile-button" class="avatar" aria-label="Edit profile">Y</button></div></header>
<div id="owner-banner" class="banner" hidden>This tab is your quiet workspace. Friends and transfers are active in another Yard tab. <button id="focus-owner">Open active tab</button></div>
<div class="page-heading"><div><p class="eyebrow" id="day-label">A LITTLE SPACE FOR WHAT MATTERS</p><h1 id="greeting">Make yourself at home.</h1><p class="subtitle">Your files. Your people. Your own little corner.</p></div><button id="invite-button" class="primary">＋ Invite a friend</button></div>
<div id="layout-help" class="banner" hidden>Make it yours. Move panels with the arrows or drag their headers. <button id="restore-layout">Restore default</button><div id="hidden-panels"></div></div>
<div class="bento" id="bento">
<section class="panel welcome" data-panel="welcome"><div class="panel-heading"><span class="eyebrow">ROOM TO GROW</span></div><div class="welcome-copy"><span class="pill">LOCAL BY NATURE</span><h2>Good things grow<br>when we connect.</h2><p>Drop a photo. Write something together.<br>Keep your favorite people a little closer.</p><button id="start-room" class="outline">Open your gate <span>↗</span></button></div><img class="plant-art" src="${plants}" alt="Warm line drawings of plants on a shelf"><div class="welcome-footer"><span><i class="small-dot"></i> A calmer kind of online</span><span>Built around you ↗</span></div></section>
<section class="panel clock" data-panel="clock"><div class="panel-heading"><span class="eyebrow">RIGHT HERE, RIGHT NOW</span><span>☀</span></div><div id="time" class="time"></div><p id="date" class="date"></p><div class="clock-line"></div><p class="clock-caption">Take a breath.<br>There’s no feed to catch up on.</p></section>
<section class="panel" data-panel="files"><div class="panel-heading"><h2><span class="panel-icon">▤</span>Your folder</h2><button id="folder-menu" class="icon-button" title="Choose a folder">＋</button></div><div class="folder-bar"><span id="folder-name">A home for your files</span><button id="reconnect-folder" class="text-button">Reconnect</button></div><div class="search"><span>⌕</span><input id="file-search" placeholder="Find a file…" aria-label="Search loaded filenames"></div><div class="crumb"><button id="folder-up" class="text-button" hidden>← Back</button><span id="folder-path">LOCAL & PRIVATE</span><button id="refresh-folder" class="text-button">Refresh</button></div><div id="file-list" class="file-list"></div><div class="panel-footer"><span>Only shared when you choose.</span><button id="new-note" class="text-button">＋ New note</button></div></section>
<section class="panel" data-panel="friends"><div class="panel-heading"><h2><span class="panel-icon">☷</span>Your people</h2><button id="join-button" class="text-button">Join with code</button></div><div id="friends-list" class="friends-list"></div><div id="room-info" class="room-info"></div><div id="chat-log" class="chat-log" role="log" aria-live="polite"></div><form id="chat-form" class="chat-compose"><input id="chat-input" maxlength="4000" placeholder="Say something kind…" aria-label="Chat message"><button class="primary" aria-label="Send message">↑</button></form><div class="panel-footer"><span id="room-label">Small circles, real connection.</span><button id="nudge" class="text-button">♧ Nudge</button></div></section>
<section class="panel notes" data-panel="notes"><div class="panel-heading"><h2><span class="panel-icon">✎</span>A place for thoughts</h2><div class="segmented"><button id="personal-tab" class="active">Personal</button><button id="shared-tab">Together</button></div></div><div class="note-meta"><span id="note-title">A little note to yourself</span><span id="note-state" aria-live="polite">Saved locally</span></div><textarea id="note-editor" spellcheck="true" maxlength="200000" placeholder="Start with a thought. A plan. A memory worth keeping…" aria-label="Note editor"></textarea><div class="panel-footer"><span id="note-hint">Yours to keep. Private by default.</span><div><button id="save-file" class="text-button" hidden>Save file</button><button id="export-note" class="text-button">Export note ↗</button></div></div></section>
<section class="panel" data-panel="transfers"><div class="panel-heading"><h2><span class="panel-icon">⇄</span>Pass something along</h2><button id="send-files" class="outline">＋ Send files</button></div><div id="transfer-list" class="transfer-list"></div><div class="panel-footer"><span>Up to 10 GB per file · direct to your friend</span><span class="subtle">Both Yards stay open</span></div></section>
</div><footer class="page-footer"><span>Keep your memories close. Grow your own garden.</span><span>Yard / 01</span></footer></main><div id="toast" role="status" hidden></div><dialog id="dialog"><div id="dialog-content"></div></dialog>`;
}
export function initShell(state) {
  function greeting() {
    const hour = new Date().getHours();
    $('#greeting').textContent =
      `${hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'}${state.settings.name ? `, ${state.settings.name}` : ''}.`;
    $('#profile-button').textContent = (state.settings.name ||
      'Y')[0].toUpperCase();
  }
  function clock() {
    const now = new Date();
    $('#time').textContent = now.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
    $('#date').textContent = now.toLocaleDateString([], {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });
    $('#day-label').textContent =
      `${now.toLocaleDateString([], { weekday: 'long' }).toUpperCase()} / A LITTLE SPACE FOR WHAT MATTERS`;
  }
  clock();
  setInterval(clock, 1000);
  greeting();

  return { greeting };
}
