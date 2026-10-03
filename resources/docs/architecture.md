# Module map

Yard uses native ES modules. `src/main.js` only loads CSS and starts the app; `src/app.js` constructs services and wires their events to UI modules. No application service is attached to `window`.

| Module              | Responsibility                                                                         |
| ------------------- | -------------------------------------------------------------------------------------- |
| `storage.js`        | Committed IndexedDB reads/writes; settings, notes, friends, transfers                  |
| `identity.js`       | Persistent signing keys, fingerprints, challenge signatures                            |
| `protocol.js`       | Wire version, binary normalization, transfer bounds, invite encoding                   |
| `network.js`        | PeerJS lifecycle, authenticated links, saved friends, room membership                  |
| `ownership.js`      | One network owner per extension origin; tab takeover and focus                         |
| `collaboration.js`  | Yjs documents, room isolation, update exchange, local persistence                      |
| `filesystem.js`     | Directory permissions, browsing, note conflicts, unique filenames                      |
| `transfers.js`      | File offers, queues, bounded chunks, disk checkpoints, resume, integrity               |
| `ui/dom.js`         | Escaping, dialogs, accessible status labels, guarded handlers, toasts                  |
| `ui/shell.js`       | Initial page markup, greeting, clock                                                   |
| `ui/layout.js`      | Draggable window ordering, keyboard movement, minimize/dock restore, persisted layouts |
| `ui/widgets.js`     | Appearance preferences, browser storage estimate, persistent focus timer               |
| `ui/icons.js`       | Locally bundled Lucide SVG paths and icon markup                                       |
| `ui/files-notes.js` | Folder browsing, previews, personal/file/shared editor controls                        |
| `ui/friends.js`     | Friend management, invitations, chat presentation, nudges                              |
| `ui/transfers.js`   | Recipient selection, batch review, progress and recovery controls                      |
| `ui/settings.js`    | Profile, palette, sounds, signaling and ICE configuration                              |

UI modules receive a service context and explicit peer UI interfaces; they do not import each other in cycles. Modules return small interfaces such as `renderFriends`, `openFile`, or `updateShared`. Changes to those interfaces belong at the composition root in `app.js`.

Services communicate using `EventTarget` events. `Network` emits authenticated connection, room, and message events; collaboration and transfers subscribe to those events. Services do not render HTML. Transfer storage is injectable so tests can restart engines against a retained repository without allocating a browser or a cloud backend.

Maintain these boundaries when adding features: put message validation and routing in services, disk operations in the filesystem/transfer layer, and presentation in the relevant UI module. Keep dependencies local in the production bundle. Run tests and the build after service changes; recheck the browser after UI wiring changes.
