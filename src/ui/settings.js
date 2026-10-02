import { $, esc, toast, task, button, modal, confirm, dot } from './dom.js';
import { put } from '../storage.js';
import { serverKey } from '../protocol.js';
export function initSettings(state, shell) {
  const greeting = shell.greeting;
  async function prefs() {
    await put('settings', 'preferences', state.settings);
  }
  function settingsDialog(onboard = false) {
    modal(
      onboard ? 'Welcome to your Yard' : 'Make yourself at home',
      `<p>${onboard ? 'A quiet place for your files and your favorite people. Start with a name; your folder and friends can come next.' : 'Your space, your pace.'}</p><label>Your name<input id="profile-name" maxlength="80" placeholder="What should friends call you?" value="${esc(state.settings.name)}"></label><div class="setting-row"><label>Palette<select id="theme"><option value="light">Warm cream</option><option value="dark">Evening slate</option></select></label><label class="check"><input id="sounds" type="checkbox" ${state.settings.sounds ? 'checked' : ''}>Play nudge sounds</label></div><details><summary>Advanced network settings</summary><p>Leave host empty to use PeerJS Cloud. Your own server needs TLS. TURN is configured separately below.</p><label>Signaling host<input id="host" value="${esc(state.settings.network?.host || '')}" placeholder="Default PeerJS Cloud"></label><div class="setting-row"><label>Port<input id="port" type="number" min="1" max="65535" value="${state.settings.network?.port || 443}"></label><label>Path<input id="server-path" value="${esc(state.settings.network?.path || '/')}"></label></div><label>ICE servers (JSON array)<textarea id="ice" rows="3" placeholder='[{"urls":"stun:stun.l.google.com:19302"}]'>${esc(state.settings.network?.iceServers ? JSON.stringify(state.settings.network.iceServers) : '')}</textarea></label><p>Changing servers requires reopening the active Yard tab. Friends keep their identity, but need fresh addresses on the new server.</p></details><div class="dialog-actions"><button id="save-settings" class="primary">${onboard ? 'Enter your Yard' : 'Save preferences'}</button></div>`,
      () => {
        $('#theme').value = state.settings.theme;
        $('#save-settings').onclick = task(async () => {
          const name = $('#profile-name').value.trim();
          if (!name)
            throw new Error('Add a name so your friends recognize you.');
          const ice = $('#ice').value.trim();
          const iceServers = ice ? JSON.parse(ice) : undefined;
          if (iceServers && !Array.isArray(iceServers))
            throw new Error('ICE servers must be a JSON array.');
          const host = $('#host').value.trim();
          if (host && !/^[a-z0-9.-]+$/i.test(host))
            throw new Error('Enter a hostname without https:// or a path.');
          const port = Number($('#port').value);
          if (!Number.isInteger(port) || port < 1 || port > 65535)
            throw new Error('Enter a valid port.');
          const config = {
            host,
            port,
            path: $('#server-path').value || '/',
            secure: true,
            ...(iceServers ? { iceServers } : {}),
          };
          const changed =
            state.network &&
            (serverKey(config) !== state.network.key ||
              JSON.stringify(config.iceServers) !==
                JSON.stringify(state.network.config.iceServers));
          state.settings = {
            ...state.settings,
            name,
            theme: $('#theme').value,
            sounds: $('#sounds').checked,
            network: config,
          };
          await prefs();
          document.documentElement.dataset.theme = state.settings.theme;
          greeting();
          if (state.network) state.network.name = name;
          $('#dialog').close();
          if (changed)
            toast(
              'Preferences saved. Reopen the active Yard tab to switch signaling servers.',
            );
          if (onboard)
            toast(
              'Welcome home. Connect a folder, or invite someone you know.',
            );
        });
      },
    );
  }
  button('#settings-button', () => settingsDialog());
  button('#profile-button', () => settingsDialog());
  return { settingsDialog };
}
