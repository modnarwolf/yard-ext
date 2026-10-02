# Yard

A local-first Chromium new-tab workspace for your files and your friends. Cream, slate, green, plant illustrations, editable bento panels, saved friends, four-person hangouts, chat, collaborative text notes, and direct disk-backed file transfers.

See [the module map](resources/docs/architecture.md) for code organization and [verification results](resources/docs/verification.md) for completed checks and remaining release tests.

## Run and install

Requires Node.js 20.19+ or 22.12+ and pnpm 11. The workspace explicitly allows only esbuild's dependency build script.

```sh
pnpm install
pnpm dev
pnpm test
pnpm build
```

If your pnpm version asks to approve esbuild, approve that package's build script and rerun the build. The production extension is the **dist** folder; it contains the manifest, background worker, page, and all bundled libraries. No remotely hosted JavaScript is needed.

In Chrome, open `chrome://extensions`; in Edge, open `edge://extensions`. Enable Developer mode, select **Load unpacked**, and choose `dist`. Open a new tab. The extension toolbar button also opens Yard. Rebuild and reload the extension after changing source files. Keep the same installation/path to preserve local identity and friends.

The development preview is at http://127.0.0.1:5173/. `localhost:5173` has separate origin storage and is useful as a second test identity. The preview and extension do not share identities or folder permissions.

## First connection

1. Set a display name. Connect a folder if you want to browse and edit local notes.
2. Copy an invite and privately send it to your friend. They select **Join with code**.
3. Approve the request at your gate. The hangout supports four people, including the host.
4. Open the friend's menu and select **Add friend**. They accept. Each browser saves the other identity and address.
5. Reopening Yard attempts authenticated reconnection without another code. Use **Invite** to start another hangout.

Green **Connected** means the authenticated friend connection is working. Amber **Connecting** means a handshake is in progress. Gray **Offline** means the connection closed or the server confirmed the peer unavailable. Gray **Unknown** means availability could not be checked. Signaling status is shown separately at the top. Blocking and removing friends are available in their menu.

Friends are reachable while their Yard is open. Clearing extension storage loses the identity; identity backup and multi-device accounts are not part of this MVP. If an identity changes, remove the old friend and pair explicitly using a fresh invite. A session-owning tab holds a Web Lock; other Yard tabs remain local workspaces and can open the active tab. When the active tab closes, another open Yard tab can take over.

## Local files and notes

Choose one folder with the browser's directory picker. Yard remembers the handle, but the browser can require permission again; use **Reconnect**. Browse subfolders, refresh to see external changes, and search filenames in the loaded folder. Images, videos, `.txt`, and `.md` files have previews. New notes use `.txt` or `.md`; saving an externally changed note prompts for reload or a separate copy.

Personal notes are saved to IndexedDB as you type. Each hangout gets a fresh Yjs note; its state and the most recent local copy are retained after it ends. Starting another hangout does not publish the previous hangout’s note. Export saves a new file in the current folder, or downloads a text copy without folder access. Export important notes before starting another hangout; a history browser is deferred. Folder contents are never automatically published or synchronized.

## Large transfers

- Select a connected recipient, then one or more files. Maximum **10,000,000,000 bytes per file**. A selection supports up to 1,000 files; additional batches can be queued without a fixed total-byte cap.
- The recipient reviews names and total size and chooses a writable destination. Files go into `Yard Received`.
- Data goes directly between sender and recipient, including guests. TURN, when configured and required, relays encrypted WebRTC traffic.
- One file per recipient transfers at a time. The sender hashes sources before offering and rechecks them before sending/resuming; this preparation can take time for large videos.
- The sender sends at most 4 MiB per acknowledgment window, using 256 KiB messages. The receiver commits blocks to a hidden `.yard-<id>` staging folder, stores checksums and offsets, then acknowledges.
- Finalization streams staging blocks into the output file and verifies the complete SHA-256. Existing output files get a unique name. Finalization can temporarily require about **twice the file size in destination disk space**.
- Pause or a closed browser retains committed blocks. Reconnect both friends, restore file permissions, and click **Resume** at the receiver. If sender access was lost, use **Reselect**, choose the original file, then **Resume**. Source and partial-file changes are detected before continuing.
- Completion appears only after receiver verification and notification. Cancellation can delete partial blocks; keeping canceled partials leaves them on disk for manual recovery/cleanup, not automatic resume.
- Photos and videos can be opened after completion. Videos never autoplay.

## Default cloud and your future Yard machine

No DigitalOcean setup is required. Empty signaling host uses PeerJS Cloud and the client's default STUN settings. Some restrictive networks require a TURN relay; signaling alone does not solve this.

To migrate, run a PeerJS-compatible PeerServer on your Yard machine behind a TLS reverse proxy. Configure its hostname, port, and path under **Settings → Advanced network settings** in both clients, then reopen the active Yard tab. Production settings use TLS. Keep peer discovery disabled on the server. Yard does not require a public peer directory.

Optional ICE JSON:

```json
[
  { "urls": "stun:stun.l.google.com:19302" },
  {
    "urls": "turn:YOUR-HOST:3478",
    "username": "YOUR-USER",
    "credential": "YOUR-CREDENTIAL"
  }
]
```

ICE settings are local; TURN credentials are not a secure client-side secret. Use scoped/short-lived credentials when deploying broadly. On a server change, identities and saved friends remain, but old addresses are unresolved until friends exchange fresh invites on the new server. Existing invite codes can contain network configuration; share them only with intended friends.

## Verification

`pnpm test` covers identity signatures, changed-key rejection, pairing and mutual friend saving, authenticated reconnect, room capacity, Yjs convergence, guest messages, filename/size validation, note conflicts, duplicate names, bounded chunks, restart/resume, corrupt partials, and failed disk writes.

For the opt-in synthetic disk test:

```sh
node scripts/large-transfer-check.js
```

It exercises the production transfer engine with a local test transport and a real 10 GB disk fixture, forces a restart after committed blocks, checks output size/checksum, measures peak process RSS, and cleans up only its own temporary directory. Allow approximately 30 GB of temporary space. This does not substitute for a 10 GB browser/WebRTC test.

Manual release checks: install in both Chrome and Edge; test folder permission renewal and tab ownership; connect two independent profiles across different networks; test four participants and direct guest transfers; send a real 10 GB video; close/reopen both browsers mid-transfer; test destination disk-full/permission errors; verify completed bytes and media previews. Also check keyboard-only use, reduced motion, dark palette, and narrow layouts.

No accounts, public discovery, voice/video, offline delivery, automatic folder replication, or popup edition are included.

