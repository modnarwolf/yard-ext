import Peer from 'peerjs';
import { all, get, put, remove } from './storage.js';
import { identity, fingerprint, sign, verify } from './identity.js';
import {
  envelope,
  validMessage,
  id,
  serverKey,
  inviteEncode,
  inviteDecode,
} from './protocol.js';
export class Network extends EventTarget {
  constructor() {
    super();
    this.links = new Map();
    this.status = new Map();
    this.pending = new Map();
    this.room = null;
    this.config = {};
    this.token = id() + id();
    this.signal = 'Offline';
  }
  emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }
  async init(name, config = {}) {
    this.me = await identity();
    this.name = name;
    this.config = config;
    this.key = serverKey(config);
    this.friends = await all('friends');
    this.me.fingerprint = await fingerprint(this.me.publicKey);
    return this;
  }
  start() {
    this.signal = 'Connecting';
    this.emit('change');
    this.peer = new Peer(this.me.route, {
      ...(this.config.host
        ? {
            host: this.config.host,
            port: this.config.port || 443,
            path: this.config.path || '/',
            secure: this.config.secure !== false,
          }
        : {}),
      ...(this.config.iceServers
        ? { config: { iceServers: this.config.iceServers } }
        : {}),
    });
    this.peer.on('open', () => {
      this.signal = 'Connected';
      this.emit('change');
      this.poll();
    });
    this.peer.on('connection', (conn) => this.attach(conn));
    this.peer.on('disconnected', () => {
      this.signal = 'Unknown';
      this.emit('change');
    });
    this.peer.on('error', (error) => {
      if (error.type === 'peer-unavailable') {
        // PeerJS includes the unavailable ID in the error message, not a structured field.
        for (const [route, link] of this.links)
          if (!link.authenticated && String(error.message).includes(route)) {
            this.close(route, 'Offline');
          }
      } else {
        this.signal = 'Unknown';
        this.emit(
          'error',
          error.type === 'unavailable-id'
            ? 'This Yard identity is already open elsewhere. Close that session before reconnecting.'
            : error.message,
        );
      }
      this.emit('change');
    });
    this.timer = setInterval(() => {
      if (this.peer?.disconnected && !this.peer.destroyed) {
        this.peer.reconnect();
      }
      this.poll();
    }, 15000);
    this.health = setInterval(() => {
      const now = Date.now();
      for (const [route, link] of this.links) {
        if (now - link.lastSeen > 45000) this.close(route, 'Unknown');
        else if (link.authenticated) this.send(route, 'ping');
      }
    }, 15000);
  }
  stop() {
    clearInterval(this.timer);
    clearInterval(this.health);
    this.peer?.destroy();
    this.signal = 'Offline';
  }
  invite() {
    return inviteEncode({
      v: 1,
      route: this.me.route,
      publicKey: this.me.publicKey,
      token: this.token,
      config: this.config,
    });
  }
  async join(code) {
    if (this.room) throw new Error('Leave the current hangout first.');
    const invitation = inviteDecode(code);
    if (serverKey(invitation.config || {}) !== this.key)
      throw new Error(
        'This invite uses another signaling server. Update Network settings to match your friend first.',
      );
    this.connect(invitation.route, {
      expected: invitation.publicKey,
      token: invitation.token,
      join: true,
    });
  }
  connect(route, options = {}) {
    if (route === this.me.route || this.links.has(route)) return;
    if (!this.peer || this.signal !== 'Connected')
      throw new Error('Connect to signaling first.');
    const friend = this.friends.find((f) => f.route === route);
    if (friend?.blocked)
      throw new Error('Unblock this friend before connecting.');
    if (friend && friend.server !== this.key)
      throw new Error(
        'This friend’s address belongs to another server. Exchange a fresh invite.',
      );
    this.attach(
      this.peer.connect(route, {
        reliable: true,
        serialization: 'binary',
        metadata: { v: 1, token: options.token },
      }),
      { expected: friend?.publicKey, ...options, outgoing: true },
    );
  }
  attach(conn, options = {}) {
    const existing = this.links.get(conn.peer);
    if (existing) {
      const preferOutgoing = this.me.route < conn.peer;
      if (
        existing.authenticated ||
        Boolean(existing.outgoing) === preferOutgoing ||
        Boolean(options.outgoing) !== preferOutgoing
      ) {
        conn.close();
        return;
      }
      this.links.delete(conn.peer);
      clearTimeout(existing.timeout);
      existing.conn.close();
    }
    const friend = this.friends.find((f) => f.route === conn.peer);
    if (friend?.blocked) {
      conn.close();
      return;
    }
    const participant = this.room?.members.find((m) => m.route === conn.peer);
    const link = {
      conn,
      nonce: id() + id(),
      lastSeen: Date.now(),
      expected: options.expected || friend?.publicKey || participant?.publicKey,
      ...options,
    };
    this.links.set(conn.peer, link);
    this.status.set(conn.peer, 'Connecting');
    this.emit('change');
    const hello = () =>
      this.raw(
        conn,
        envelope('hello', {
          route: this.me.route,
          name: this.name,
          publicKey: this.me.publicKey,
          nonce: link.nonce,
        }),
      );
    conn.on('open', hello);
    conn.on('data', (data) => {
      link.chain = (link.chain || Promise.resolve())
        .then(() => {
          if (this.links.get(conn.peer) === link)
            return this.receive(conn.peer, data);
        })
        .catch((error) => {
          this.emit('error', error.message);
          if (this.links.get(conn.peer) === link)
            this.close(conn.peer, 'Unknown');
        });
    });
    conn.on('close', () => {
      if (this.links.get(conn.peer) === link) this.close(conn.peer, 'Offline');
    });
    conn.on('error', () => {
      if (this.links.get(conn.peer) === link) this.close(conn.peer, 'Unknown');
    });
    link.timeout = setTimeout(() => {
      if (!link.authenticated) this.close(conn.peer, 'Unknown');
    }, 30000);
  }
  raw(conn, message) {
    if (conn.open) conn.send(message);
  }
  send(route, type, data = {}) {
    const link = this.links.get(route);
    if (link?.authenticated) this.raw(link.conn, envelope(type, data));
  }
  async receive(route, m) {
    if (!validMessage(m)) throw new Error('Unsupported Yard message.');
    const link = this.links.get(route);
    if (!link) return;
    link.lastSeen = Date.now();
    if (m.type === 'hello') {
      if (
        m.route !== route ||
        typeof m.name !== 'string' ||
        m.name.length > 80 ||
        typeof m.nonce !== 'string' ||
        m.nonce.length > 100
      )
        throw new Error('Invalid identity handshake.');
      const fp = await fingerprint(m.publicKey);
      const blocked = this.friends.find(
        (f) => f.fingerprint === fp && f.blocked,
      );
      if (blocked) throw new Error('Blocked identity.');
      if (link.expected && fp !== (await fingerprint(link.expected)))
        throw new Error(
          'Friend identity changed. Pair again explicitly before trusting this connection.',
        );
      if (!link.expected && link.conn.metadata?.token !== this.token)
        throw new Error('A fresh invite is required to pair.');
      link.remote = {
        route,
        name: m.name,
        publicKey: m.publicKey,
        fingerprint: fp,
      };
      this.raw(
        link.conn,
        envelope('proof', {
          signature: await sign(this.me.privateKey, m.nonce),
        }),
      );
      return;
    }
    if (m.type === 'proof') {
      if (
        !link.remote ||
        !(await verify(link.remote.publicKey, link.nonce, m.signature))
      )
        throw new Error('Could not verify this friend’s identity.');
      link.authenticated = true;
      clearTimeout(link.timeout);
      this.status.set(route, 'Connected');
      const saved = this.friends.find(
        (f) => f.fingerprint === link.remote.fingerprint,
      );
      if (saved) {
        saved.retryDelay = 15000;
        saved.retryAt = 0;
      }
      if (saved && saved.route !== route) {
        saved.route = route;
        saved.server = this.key;
        await put('friends', saved.fingerprint, saved);
      }
      this.emit('change');
      this.emit('connected', link.remote);
      if (link.join) this.send(route, 'join-request');
      return;
    }
    if (!link.authenticated) throw new Error('Authenticate before using Yard.');
    if (m.type === 'ping') {
      this.send(route, 'pong');
      return;
    }
    if (m.type === 'pong') return;
    if (m.type === 'friend-request') {
      link.friendRequested = true;
      this.emit('friend-request', link.remote);
      return;
    }
    if (m.type === 'friend-accept') {
      if (link.requestedFriend) await this.saveFriend(route);
      return;
    }
    if (m.type === 'join-request') {
      this.pending.set(route, link.remote);
      this.emit('join-request', link.remote);
      return;
    }
    if (m.type === 'room-invite') {
      this.emit('room-invite', link.remote);
      return;
    }
    if (m.type === 'room-state') {
      if (
        !this.room ||
        this.room.host !== route ||
        m.room?.id !== this.room.id ||
        !Array.isArray(m.room.members) ||
        m.room.members.length > 4
      )
        return;
      this.room = m.room;
      this.emit('room', this.room);
      return;
    }
    if (m.type === 'room-accepted') {
      if (
        !link.join ||
        !m.room ||
        m.room.host !== route ||
        !Array.isArray(m.room.members) ||
        m.room.members.length > 4
      )
        return;
      this.room = m.room;
      link.join = false;
      this.emit('room', this.room);
      return;
    }
    if (m.type === 'room-ended') {
      if (this.room?.host === route) {
        this.room = null;
        this.emit('room', null);
      }
      return;
    }
    if (m.type === 'leave') {
      if (this.room?.host === this.me.route) {
        this.room.members = this.room.members.filter((p) => p.route !== route);
        this.broadcastState();
      }
      return;
    }
    if (m.type === 'join-denied') {
      link.join = false;
      this.emit('error', m.reason || 'The hangout request was declined.');
      return;
    }
    this.emit('message', { route, message: m });
  }
  async saveFriend(route) {
    const link = this.links.get(route);
    if (!link?.authenticated) return;
    const friend = {
      ...link.remote,
      server: this.key,
      config: this.config,
      blocked: false,
    };
    const prior = this.friends.find(
      (f) => f.fingerprint === friend.fingerprint,
    );
    friend.nickname = prior?.nickname || '';
    await put('friends', friend.fingerprint, friend);
    this.friends = await all('friends');
    this.emit('change');
  }
  requestFriend(route) {
    this.links.get(route).requestedFriend = true;
    this.send(route, 'friend-request');
  }
  async acceptFriend(route) {
    if (!this.links.get(route)?.friendRequested) return;
    await this.saveFriend(route);
    this.send(route, 'friend-accept');
  }
  async editFriend(fp, changes) {
    const f = this.friends.find((f) => f.fingerprint === fp);
    Object.assign(f, changes);
    await put('friends', fp, f);
    if (f.blocked) this.close(f.route, 'Offline');
    this.emit('change');
  }
  async removeFriend(fp) {
    const f = this.friends.find((f) => f.fingerprint === fp);
    await remove('friends', fp);
    this.friends = await all('friends');
    if (f) this.close(f.route, 'Offline');
    this.emit('change');
  }
  async poll() {
    if (this.signal !== 'Connected') return;
    let slots = Math.max(
      0,
      2 - [...this.links.values()].filter((link) => !link.authenticated).length,
    );
    for (const f of this.friends) {
      if (!slots) break;
      if (f.blocked || f.server !== this.key || this.links.has(f.route))
        continue;
      if (Date.now() < (f.retryAt || 0)) continue;
      f.retryAt = Date.now() + Math.min(120000, (f.retryDelay || 15000) * 2);
      f.retryDelay = Math.min(120000, (f.retryDelay || 15000) * 2);
      this.connect(f.route);
      slots--;
    }
  }
  host() {
    if (this.room) throw new Error('Leave the current hangout first.');
    this.room = {
      id: id(),
      host: this.me.route,
      members: [
        {
          route: this.me.route,
          name: this.name,
          publicKey: this.me.publicKey,
          fingerprint: this.me.fingerprint,
        },
      ],
    };
    this.emit('room', this.room);
  }
  approve(route, accept) {
    this.pending.delete(route);
    if (!accept) {
      this.send(route, 'join-denied');
      return;
    }
    if (!this.room) this.host();
    if (this.room.host !== this.me.route || this.room.members.length >= 4) {
      this.send(route, 'join-denied', {
        reason: 'This hangout is full or you are not its host.',
      });
      return;
    }
    const remote = this.links.get(route)?.remote;
    if (!remote) return;
    if (!this.room.members.some((p) => p.route === route))
      this.room.members.push(remote);
    this.send(route, 'room-accepted', { room: this.room });
    this.broadcastState();
  }
  inviteFriend(route) {
    if (!this.room) this.host();
    this.send(route, 'room-invite');
  }
  acceptRoom(route) {
    if (this.room) throw new Error('Leave the current hangout first.');
    this.links.get(route).join = true;
    this.send(route, 'join-request');
  }
  broadcastState() {
    for (const p of this.room.members)
      if (p.route !== this.me.route)
        this.send(p.route, 'room-state', { room: this.room });
    this.emit('room', this.room);
  }
  roomSend(type, data) {
    if (!this.room) return;
    if (this.room.host === this.me.route) {
      for (const p of this.room.members)
        if (p.route !== this.me.route)
          this.send(p.route, type, { ...data, roomId: this.room.id });
    } else this.send(this.room.host, type, { ...data, roomId: this.room.id });
  }
  roomMessage(route, m) {
    return (
      this.room &&
      m.roomId === this.room.id &&
      (this.room.host === this.me.route
        ? this.room.members.some((p) => p.route === route)
        : route === this.room.host)
    );
  }
  leave() {
    if (this.room?.host === this.me.route) this.roomSend('room-ended', {});
    else if (this.room) this.send(this.room.host, 'leave');
    this.room = null;
    this.emit('room', null);
  }
  close(route, status) {
    const link = this.links.get(route);
    if (!link) return;
    this.links.delete(route);
    clearTimeout(link.timeout);
    link.conn.close();
    this.status.set(route, status);
    if (this.room?.host === route) {
      this.room = null;
      this.emit('room', null);
    } else if (
      this.room?.host === this.me.route &&
      this.room.members.some((p) => p.route === route)
    ) {
      this.room.members = this.room.members.filter((p) => p.route !== route);
      this.broadcastState();
    }
    this.emit('disconnected', route);
    this.emit('change');
  }
}
