// Serverless WebRTC P2P Multiplayer Room Manager (via PeerJS)
// For NS-Shaft 3D Party (小朋友下樓梯 3D：深淵大亂鬥)

const PEER_PREFIX = 'ns-shaft-party3d-';

export class RoomNetwork {
  constructor(callbacks = {}) {
    this.callbacks = callbacks;
    this.peer = null;
    this.isHost = true; // Default to Host immediately so solo play never waits for PeerJS
    this.roomId = 'B100';
    this.password = '';
    this.myId = 'p_' + Math.random().toString(36).substring(2, 9);
    this.myName = '下樓梯小霸王';
    this.myReady = true;
    this.myAppearance = {
      gender: 'male',
      hair: 'spiky',
      hairColor: '#1e293b',
      top: 'classic_tee',
      bottom: 'jeans',
      suit: 'none'
    };

    this.roomConfig = {
      fillBots: true,
      hasPassword: false
    };

    this.guestConns = new Map();
    this.roomPlayers = new Map();
    this.hostConn = null;
    this.guestTimeout = null;
  }

  cleanup() {
    if (this.guestTimeout) {
      clearTimeout(this.guestTimeout);
      this.guestTimeout = null;
    }
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

  joinOrCreateRoom({ roomId, password = '', playerName = '下樓梯小霸王', appearance = null, fillBots = true }) {
    this.cleanup();
    this.roomId = (roomId || 'B100').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'B100';
    this.password = (password || '').trim();
    this.myName = (playerName || '下樓梯小霸王').trim().slice(0, 12) || '下樓梯小霸王';
    if (appearance) {
      this.myAppearance = { ...this.myAppearance, ...appearance };
    }
    this.isHost = true;
    this.myReady = true;
    this.roomConfig.fillBots = fillBots !== undefined ? fillBots : true;
    this.roomConfig.hasPassword = Boolean(this.password);

    // Immediately populate local roster so Solo/Host buttons work at 0ms!
    this.setupLocalHostRoster();

    if (!window.Peer) {
      this.emitStatus('🟢 單人/派對就緒', 'online');
      return;
    }

    this.emitStatus(`🟢 房號 ${this.roomId} 就緒`, 'online');
    const hostPeerId = `${PEER_PREFIX}${this.roomId.toLowerCase()}`;

    let peer;
    try {
      peer = new window.Peer(hostPeerId, { debug: 0 });
    } catch (e) {
      this.emitStatus(`🟢 單機模式 (${this.roomId})`, 'online');
      return;
    }
    this.peer = peer;

    peer.on('open', (id) => {
      this.isHost = true;
      this.myId = id;
      this.myReady = true;
      this.setupLocalHostRoster();
      const lockIcon = this.password ? '🔒' : '🔓';
      this.emitStatus(`🟢 ${lockIcon} 房號 ${this.roomId} (房主・1人)`, 'online');
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
      if (err && err.type === 'unavailable-id') {
        this.connectAsGuest(hostPeerId);
      } else {
        this.isHost = true;
        this.setupLocalHostRoster();
        this.emitStatus(`🟢 單人/派對就緒 (${this.roomId})`, 'online');
      }
    });
  }

  setupLocalHostRoster() {
    this.roomPlayers.clear();
    this.roomPlayers.set(this.myId, {
      id: this.myId,
      name: this.myName,
      appearance: { ...this.myAppearance },
      isHost: true,
      ready: true
    });
    this.emitRosterUpdate();
  }

  connectAsGuest(hostPeerId) {
    if (this.peer) {
      try { this.peer.destroy(); } catch (e) {}
    }

    let guestPeer;
    try {
      guestPeer = new window.Peer({ debug: 0 });
    } catch (e) {
      this.isHost = true;
      this.setupLocalHostRoster();
      return;
    }
    this.peer = guestPeer;

    // Fallback timeout: if host doesn't answer within 3s (stale room ID), stay Host so solo works!
    this.guestTimeout = setTimeout(() => {
      if (!this.hostConn || !this.hostConn.open) {
        this.isHost = true;
        this.setupLocalHostRoster();
        this.emitStatus(`🟢 單人/房主就緒 (${this.roomId})`, 'online');
      }
    }, 3000);

    guestPeer.on('open', (myGuestId) => {
      this.myId = myGuestId;
      const conn = guestPeer.connect(hostPeerId, { reliable: true });
      this.hostConn = conn;

      conn.on('open', () => {
        if (this.guestTimeout) {
          clearTimeout(this.guestTimeout);
          this.guestTimeout = null;
        }
        this.isHost = false;
        this.myReady = true;
        conn.send({
          type: 'hello',
          id: this.myId,
          name: this.myName,
          appearance: this.myAppearance,
          password: this.password,
          ready: this.myReady
        });
      });

      conn.on('data', (msg) => {
        this.handleGuestMessage(msg);
      });

      conn.on('close', () => {
        this.isHost = true;
        this.setupLocalHostRoster();
        this.emitStatus('🟢 已切回單人房主模式', 'online');
      });
    });

    guestPeer.on('error', () => {
      if (this.guestTimeout) {
        clearTimeout(this.guestTimeout);
        this.guestTimeout = null;
      }
      this.isHost = true;
      this.setupLocalHostRoster();
      this.emitStatus(`🟢 單人模式 (${this.roomId})`, 'online');
    });
  }

  handleHostMessage(conn, msg) {
    if (!msg || typeof msg !== 'object') return;

    if (msg.type === 'hello') {
      if (this.password && (msg.password || '').trim() !== this.password) {
        conn.send({
          type: 'auth_failed',
          message: `🔒 房號 ${this.roomId} 密碼不正確！`
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
        appearance: msg.appearance || { ...this.myAppearance },
        isHost: false,
        ready: Boolean(msg.ready)
      });

      this.updateHostStatusText();
      this.broadcastRosterFromHost();
    } else if (msg.type === 'update_profile') {
      const p = this.roomPlayers.get(conn.peer);
      if (p) {
        if (msg.name !== undefined) p.name = (msg.name || '連線玩家').slice(0, 12);
        if (msg.appearance !== undefined) p.appearance = { ...p.appearance, ...msg.appearance };
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
      this.emitStatus(`🟢 ${lockIcon} 房號 ${this.roomId} (${this.roomPlayers.size}人連線)`, 'online');
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

  updateMyProfile({ name, appearance, ready, password, fillBots }) {
    if (name !== undefined) {
      this.myName = name.trim().slice(0, 12) || '下樓梯小霸王';
    }
    if (appearance !== undefined) {
      this.myAppearance = { ...this.myAppearance, ...appearance };
    }
    if (ready !== undefined) {
      this.myReady = Boolean(ready);
    }

    if (this.isHost) {
      if (password !== undefined) {
        this.password = password.trim();
        this.roomConfig.hasPassword = Boolean(this.password);
      }
      if (fillBots !== undefined) {
        this.roomConfig.fillBots = Boolean(fillBots);
      }
      const me = this.roomPlayers.get(this.myId);
      if (me) {
        me.name = this.myName;
        me.appearance = { ...this.myAppearance };
        me.ready = true;
      } else {
        this.setupLocalHostRoster();
      }
      this.updateHostStatusText();
      this.broadcastRosterFromHost();
    } else if (this.hostConn && this.hostConn.open) {
      this.hostConn.send({
        type: 'update_profile',
        name: this.myName,
        appearance: this.myAppearance,
        ready: this.myReady
      });
    }
  }

  updateHostStatusText() {
    if (!this.isHost) return;
    const lockIcon = this.password ? '🔒' : '🔓';
    const count = this.roomPlayers.size;
    this.emitStatus(`🟢 ${lockIcon} 房號 ${this.roomId} (房主・${count}人)`, 'online');
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

  hostStartMatch(fullParticipantsList) {
    const seed = Math.floor(Math.random() * 900000) + 100000;
    const payload = {
      seed,
      participants: fullParticipantsList
    };

    if (this.isHost) {
      this.broadcastFromHost({
        type: 'match_start',
        payload
      });
    }

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
