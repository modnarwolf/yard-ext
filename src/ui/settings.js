import { $, esc, toast, task, button, modal, confirm, dot } from './dom.js';
import { put } from '../storage.js';
import { serverKey } from '../protocol.js';
import { applyAppearance, themes } from './widgets.js';
export function initSettings(state, shell) {
  const greeting = shell.greeting;
  async function prefs() {
    await put('settings', 'preferences', state.settings);
  }
  function appearanceFields() {
    return `<h3>Appearance</h3><div class="theme-options">${Object.entries(
      themes,
    )
      .map(
        ([theme]) =>
          `<button data-theme="${theme}" aria-pressed="false"><span class="theme-preview preview-${theme}"><span></span></span><strong>${{ classic: 'Windows 98', xp: 'Windows XP', msn: 'MSN', skype: 'Skype' }[theme]}</strong></button>`,
      )
      .join(
        '',
      )}</div><div class="settings-fields"><label>Background<select id="background-style"><option value="solid">Plain color</option><option value="gradient">Soft gradient</option><option value="grid">Subtle grid</option></select></label><label>Color<input id="background-color" type="color"></label></div><label>Mouse cursor<select id="cursor-style"><option value="system">System default</option><option value="pixel">Classic pixel arrow</option><option value="white">White arrow</option><option value="crosshair">Crosshair</option></select></label><div class="cursor-preview">Move your cursor here to try it out.</div>`;
  }
  function settingsDialog(onboard = false) {
    modal(
      onboard ? 'Welcome to your Yard' : 'Make yourself at home',
      `<p>${onboard ? 'A quiet place for your files and your favorite people. Start with a name; your folder and friends can come next.' : 'Your space, your pace.'}</p><label>Your name<input id="profile-name" maxlength="80" placeholder="What should friends call you?" value="${esc(state.settings.name)}"></label>${appearanceFields()}<div class="setting-row"><label class="check"><input id="sounds" type="checkbox" ${state.settings.sounds ? 'checked' : ''}>Play nudge sounds</label></div><details><summary>Advanced network settings</summary><p>Leave host empty to use PeerJS Cloud. Your own server needs TLS. TURN is configured separately below.</p><label>Signaling host<input id="host" value="${esc(state.settings.network?.host || '')}" placeholder="Default PeerJS Cloud"></label><div class="setting-row"><label>Port<input id="port" type="number" min="1" max="65535" value="${state.settings.network?.port || 443}"></label><label>Path<input id="server-path" value="${esc(state.settings.network?.path || '/')}"></label></div><label>ICE servers (JSON array)<textarea id="ice" rows="3" placeholder='[{"urls":"stun:stun.l.google.com:19302"}]'>${esc(state.settings.network?.iceServers ? JSON.stringify(state.settings.network.iceServers) : '')}</textarea></label><p>Changing servers requires reopening the active Yard tab. Friends keep their identity, but need fresh addresses on the new server.</p></details><div class="dialog-actions"><button id="save-settings" class="primary">${onboard ? 'Enter your Yard' : 'Save preferences'}</button></div>`,
      () => {
        const appearance = state.settings.appearance || {
          theme: 'classic',
          color: themes.classic,
          background: 'solid',
          cursor: 'system',
        };
        $('#background-style').value = appearance.background;
        $('#background-color').value = appearance.color;
        $('#cursor-style').value = appearance.cursor;
        async function updateAppearance(patch) {
          state.settings.appearance = {
            ...appearance,
            ...state.settings.appearance,
            ...patch,
          };
          applyAppearance(state.settings);
          document
            .querySelectorAll('button[data-theme]')
            .forEach((b) =>
              b.setAttribute(
                'aria-pressed',
                String(b.dataset.theme === state.settings.appearance.theme),
              ),
            );
          await prefs();
        }
        document.querySelectorAll('button[data-theme]').forEach((b) => {
          b.setAttribute(
            'aria-pressed',
            String(b.dataset.theme === appearance.theme),
          );
          b.onclick = task(async () => {
            $('#background-color').value = themes[b.dataset.theme];
            await updateAppearance({
              theme: b.dataset.theme,
              color: themes[b.dataset.theme],
            });
          });
        });
        $('#background-style').onchange = task((e) =>
          updateAppearance({ background: e.target.value }),
        );
        $('#background-color').oninput = task((e) =>
          updateAppearance({ color: e.target.value }),
        );
        $('#cursor-style').onchange = task((e) =>
          updateAppearance({ cursor: e.target.value }),
        );
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
            sounds: $('#sounds').checked,
            network: config,
          };
          await prefs();
          applyAppearance(state.settings);
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
