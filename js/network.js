// Serverless WebRTC P2P Multiplayer Room Manager (via PeerJS)
// Supports Room Password Lock, One-Click Invite Link, Ready Check, and Host Match Start with Random Hunter

const PEER_PREFIX = 'tw-chameleon-hide3d-';

export class RoomNetwork {
  constructor(callbacks = {}) {
    this.callbacks = callbacks;
    // Callbacks:
    // onStatus(text, stateType)
    // onAuthFailed(message)
    // onRosterUpdate(playersArray, roomConfig, isHost, myId)
    // onMatchStart(matchConfig)
    // onRemoteState(playerId, state)
    // onRemoteAction(playerId, action, payload)

    this.peer = null;
    this.isHost = false;
    this.roomId = 'TW101';
    this.password = '';
    this.myId = 'p_' + Math.random().toString(36).substring(2, 9);
    this.myName = '變色龍玩家';
    this.myReady = false;

    this.roomConfig = {
      mapId: 'taipei101',
      fillBots: true,
      hasPassword: false
    };

    // Host state
    this.guestConns = new Map(); // peerId -> DataConnection
    this.roomPlayers = new Map(); // peerId -> { id, name, isHost, ready }

    // Guest state
    this.hostConn = null;
  }

  cleanup() {
    if (this.hostConn) {
      try { this.hostConn.close(); } catch (e) {}
      this.hostConn = null;
    }
    this.guestConns.forEach((c) => {
      try { c.close(); } catch (e) {}
    });
    this.guestConns.clear();
    this.roomPlayers.clear();

    if (this.peer) {
      try { this.peer.destroy(); } catch (e) {}
      this.peer = null;
    }
  }

  joinOrCreateRoom({ roomId, password = '', playerName = '變色龍玩家', mapId = 'taipei101', fillBots = true }) {
    this.cleanup();
    this.roomId = (roomId || 'TW101').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'TW101';
    this.password = (password || '').trim();
    this.myName = (playerName || '變色龍玩家').trim().slice(0, 12) || '變色龍玩家';
    this.myReady = false;
    this.roomConfig.mapId = mapId || 'taipei101';
    this.roomConfig.fillBots = fillBots !== undefined ? fillBots : true;
    this.roomConfig.hasPassword = Boolean(this.password);

    if (!window.Peer) {
      this.isHost = true;
      this.setupLocalHostRoster();
      this.emitStatus('🟡 單機派對模式 (PeerJS 未載入)', 'offline');
      return;
    }

    this.emitStatus(`🔄 正在連線房間 ${this.roomId}...`, 'connecting');
    const hostPeerId = `${PEER_PREFIX}${this.roomId.toLowerCase()}`;

    const peer = new window.Peer(hostPeerId, { debug: 0 });
    this.peer = peer;

    peer.on('open', (id) => {
      // Successfully claimed the Room Host ID!
      this.isHost = true;
      this.myId = id;
      this.myReady = true; // Host is ready by default
      this.setupLocalHostRoster();
      const lockIcon = this.password ? '🔒' : '🔓';
      this.emitStatus(`🟢 ${lockIcon} 房號 ${this.roomId} (你是房主・1人)`, 'online');
    });

    peer.on('connection', (conn) => {
      if (!this.isHost) return;

      conn.on('data', (msg) => {
        this.handleHostMessage(conn, msg);
      });

      conn.on('close', () => {
        const hadPlayer = this.roomPlayers.has(conn.peer);
        this.guestConns.delete(conn.peer);
        this.roomPlayers.delete(conn.peer);
        if (hadPlayer) {
          this.updateHostStatusText();
          this.broadcastRosterFromHost();
        }
      });
    });

    peer.on('error', (err) => {
      if (err.type === 'unavailable-id') {
        // Room already exists -> Connect as Guest!
        this.connectAsGuest(hostPeerId);
      } else {
        this.isHost = true;
        this.setupLocalHostRoster();
        this.emitStatus(`🟡 離線模式 (房號 ${this.roomId})`, 'offline');
      }
    });
  }

  setupLocalHostRoster() {
    this.roomPlayers.clear();
    this.roomPlayers.set(this.myId, {
      id: this.myId,
      name: this.myName,
      isHost: true,
      ready: true
    });
    this.emitRosterUpdate();
  }

  connectAsGuest(hostPeerId) {
    if (this.peer) {
      try { this.peer.destroy(); } catch (e) {}
    }
    this.isHost = false;
    this.myReady = false;
    const guestPeer = new window.Peer({ debug: 0 });
    this.peer = guestPeer;

    guestPeer.on('open', (myGuestId) => {
      this.myId = myGuestId;
      const conn = guestPeer.connect(hostPeerId, { reliable: true });
      this.hostConn = conn;

      conn.on('open', () => {
        conn.send({
          type: 'hello',
          id: this.myId,
          name: this.myName,
          password: this.password,
          ready: this.myReady
        });
      });

      conn.on('data', (msg) => {
        this.handleGuestMessage(msg);
      });

      conn.on('close', () => {
        this.emitStatus(`🟡 與房主連線中斷`, 'offline');
      });
    });

    guestPeer.on('error', () => {
      this.isHost = true;
      this.setupLocalHostRoster();
      this.emitStatus(`🟡 單機模式 (${this.roomId})`, 'offline');
    });
  }

  handleHostMessage(conn, msg) {
    if (!msg || typeof msg !== 'object') return;

    if (msg.type === 'hello') {
      // Verify Room Password if locked by Host
      if (this.password && (msg.password || '').trim() !== this.password) {
        conn.send({
          type: 'auth_failed',
          message: `🔒 房號 ${this.roomId} 需要密碼，或您輸入的密碼不正確！`
        });
        setTimeout(() => {
          try { conn.close(); } catch (e) {}
        }, 300);
        return;
      }

      this.guestConns.set(conn.peer, conn);
      this.roomPlayers.set(conn.peer, {
        id: conn.peer,
        name: (msg.name || '連線玩家').slice(0, 12),
        isHost: false,
        ready: Boolean(msg.ready)
      });

      this.updateHostStatusText();
      this.broadcastRosterFromHost();
    } else if (msg.type === 'update_profile') {
      const p = this.roomPlayers.get(conn.peer);
      if (p) {
        if (msg.name !== undefined) p.name = (msg.name || '連線玩家').slice(0, 12);
        if (msg.ready !== undefined) p.ready = Boolean(msg.ready);
        this.broadcastRosterFromHost();
      }
    } else if (msg.type === 'state') {
      if (this.callbacks.onRemoteState) {
        this.callbacks.onRemoteState(conn.peer, msg.state);
      }
      this.broadcastFromHost({
        type: 'remote_state',
        playerId: conn.peer,
        state: msg.state
      }, conn.peer);
    } else if (msg.type === 'action') {
      if (this.callbacks.onRemoteAction) {
        this.callbacks.onRemoteAction(conn.peer, msg.action, msg.payload);
      }
      this.broadcastFromHost({
        type: 'remote_action',
        playerId: conn.peer,
        action: msg.action,
        payload: msg.payload
      }, conn.peer);
    }
  }

  handleGuestMessage(msg) {
    if (!msg || typeof msg !== 'object') return;

    if (msg.type === 'auth_failed') {
      this.emitStatus(msg.message || '🔒 房間密碼錯誤', 'error');
      if (this.callbacks.onAuthFailed) {
        this.callbacks.onAuthFailed(msg.message || '🔒 房間密碼錯誤');
      }
    } else if (msg.type === 'roster_update') {
      this.roomPlayers.clear();
      (msg.players || []).forEach((p) => {
        this.roomPlayers.set(p.id, p);
      });
      if (msg.roomConfig) {
        this.roomConfig = { ...this.roomConfig, ...msg.roomConfig };
      }
      const lockIcon = this.roomConfig.hasPassword ? '🔒' : '🔓';
      this.emitStatus(`🟢 ${lockIcon} 房號 ${this.roomId} (已連線・${this.roomPlayers.size}人)`, 'online');
      this.emitRosterUpdate();
    } else if (msg.type === 'match_start') {
      if (this.callbacks.onMatchStart) {
        this.callbacks.onMatchStart(msg.payload);
      }
    } else if (msg.type === 'remote_state') {
      if (this.callbacks.onRemoteState) {
        this.callbacks.onRemoteState(msg.playerId, msg.state);
      }
    } else if (msg.type === 'remote_action') {
      if (this.callbacks.onRemoteAction) {
        this.callbacks.onRemoteAction(msg.playerId, msg.action, msg.payload);
      }
    }
  }

  updateMyProfile({ name, ready, password, mapId, fillBots }) {
    if (name !== undefined) {
      this.myName = name.trim().slice(0, 12) || '變色龍玩家';
    }
    if (ready !== undefined) {
      this.myReady = Boolean(ready);
    }

    if (this.isHost) {
      if (password !== undefined) {
        this.password = password.trim();
        this.roomConfig.hasPassword = Boolean(this.password);
      }
      if (mapId !== undefined) {
        this.roomConfig.mapId = mapId;
      }
      if (fillBots !== undefined) {
        this.roomConfig.fillBots = Boolean(fillBots);
      }
      const me = this.roomPlayers.get(this.myId);
      if (me) {
        me.name = this.myName;
        me.ready = true;
      }
      this.updateHostStatusText();
      this.broadcastRosterFromHost();
    } else if (this.hostConn && this.hostConn.open) {
      this.hostConn.send({
        type: 'update_profile',
        name: this.myName,
        ready: this.myReady
      });
    }
  }

  updateHostStatusText() {
    if (!this.isHost) return;
    const lockIcon = this.password ? '🔒' : '🔓';
    const count = this.roomPlayers.size;
    this.emitStatus(`🟢 ${lockIcon} 房號 ${this.roomId} (房主・${count}人連線)`, 'online');
  }

  broadcastRosterFromHost() {
    if (!this.isHost) return;
    const playersArray = Array.from(this.roomPlayers.values());
    this.broadcastFromHost({
      type: 'roster_update',
      players: playersArray,
      roomConfig: this.roomConfig
    });
    this.emitRosterUpdate();
  }

  emitRosterUpdate() {
    if (this.callbacks.onRosterUpdate) {
      this.callbacks.onRosterUpdate(
        Array.from(this.roomPlayers.values()),
        this.roomConfig,
        this.isHost,
        this.myId
      );
    }
  }

  // Host triggers Match Start and randomly picks Hunter(s)
  hostStartMatch(fullParticipantsList) {
    if (!this.isHost) return null;
    const seed = Math.floor(Math.random() * 900000) + 100000;

    // Randomly pick 1 Hunter (or 2 if >= 7 total participants)
    const shuffled = [...fullParticipantsList].sort(() => Math.random() - 0.5);
    const hunterCount = fullParticipantsList.length >= 7 ? 2 : 1;
    const initialHunterIds = shuffled.slice(0, hunterCount).map((p) => p.id);

    const payload = {
      seed,
      mapId: this.roomConfig.mapId,
      initialHunterIds,
      participants: fullParticipantsList
    };

    this.broadcastFromHost({
      type: 'match_start',
      payload
    });

    if (this.callbacks.onMatchStart) {
      this.callbacks.onMatchStart(payload);
    }
    return payload;
  }

  sendState(stateObj) {
    if (this.isHost) {
      this.broadcastFromHost({
        type: 'remote_state',
        playerId: this.myId,
        state: stateObj
      });
    } else if (this.hostConn && this.hostConn.open) {
      this.hostConn.send({
        type: 'state',
        state: stateObj
      });
    }
  }

  sendAction(action, payload = {}) {
    if (this.isHost) {
      this.broadcastFromHost({
        type: 'remote_action',
        playerId: this.myId,
        action,
        payload
      });
    } else if (this.hostConn && this.hostConn.open) {
      this.hostConn.send({
        type: 'action',
        action,
        payload
      });
    }
  }

  broadcastFromHost(data, excludePeerId = null) {
    for (const [peerId, conn] of this.guestConns.entries()) {
      if (peerId !== excludePeerId && conn.open) {
        try { conn.send(data); } catch (e) {}
      }
    }
  }

  emitStatus(text, stateType = 'info') {
    if (this.callbacks.onStatus) {
      this.callbacks.onStatus(text, stateType);
    }
  }
}
