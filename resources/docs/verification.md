# Verification — October 2, 2026

- Desktop UI port from `yard_iso`: local headless Edge verified onboarding, no top navbar/hero, native dragging, keyboard window reordering, minimize/dock restore, saved window order and visibility, note persistence, theme/background/cursor persistence, focus timer start/pause/reset and running-state restoration after reload, and layout reset. No page errors; no horizontal overflow at 1440, 1024, 768, and 390 pixels. Desktop and mobile screenshots inspected. Browser quota is explicitly distinguished from connected-drive capacity.

- Production Vite build passes; output includes the Manifest V3 extension, background worker, bundled modules, desktop styling, and local Lucide icons.
- 17 automated tests pass, including authentication/key substitution, mutual friend saving/reconnect, four-person capacity, guest messages, Yjs convergence, room note isolation, file bounds, conflict protection, block streaming, restart/resume, corruption detection, disk errors, multi-file queueing, and invalid chunks.
- In-app Chromium browser: onboarding, personal-note persistence, bento hide/resize/reset controls, layout persistence after reload, default PeerJS Cloud signaling, first invite/host approval, mutual friend saving, automatic reconnect after reload without another code, saved-friend hangout invitations, live guest chat, and real binary Yjs note exchange verified. Two separate local origins provided independent test identities.
- Modular UI refactor rebuilt successfully and loaded without browser console errors.
- A real **10,000,000,000-byte synthetic disk fixture** passed the production transfer engine over a local test transport. The test interrupted/recreated both engines after 8,388,608 committed bytes, resumed, wrote the complete output, and independently verified its checksum. Peak sampled process RSS: **160 MB**. Temporary fixture files were cleaned up.
- SHA-256: `d8b8ab9c8eba2e00f5a5a9be0b9abd23cc63ecafc92e9ac5fe4eb4b978b4bb87`.

Remaining manual release validation: installed-extension behavior in Chrome and Edge, native directory-picker permissions across browser restarts, a real 10 GB WebRTC transfer between two browser profiles on different networks, four-browser guest-to-guest transfers, and full keyboard/contrast/narrow-screen audits. The desktop port has been rendered at narrow widths in headless Edge; installed-extension and full accessibility audits remain release checks.

The 10 GB test validates real disk I/O, resume, integrity, and bounded memory in the production transfer engine. It does **not** establish 10 GB browser/WebRTC throughput or reliability on every network.
