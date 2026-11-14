// Serverless WebRTC P2P Multiplayer Room Manager (via PeerJS)
// Works 100% on GitHub Pages across 4G/5G/Wi-Fi with zero backend server required!

const PEER_PREFIX = 'skyrush-party-3d-room-';

export class RoomNetwork {
  constructor(callbacks = {}) {
    this.callbacks = callbacks; // { onStatus, onWelcome, onPlayerJoined, onPlayerLeft, onRemoteState, onRemoteAction, onNewRace }
    this.peer = null;
    this.isHost = false;
    this.roomId = 'PARTY1';
    this.myId = 'p_' + Math.random().toString(36).substring(2, 9);
    this.roomSeed = Math.floor(Math.random() * 900000) + 100000;

    // Host state
    this.guestConns = new Map(); // peerId -> DataConnection
    this.roomPlayers = new Map(); // peerId -> playerInfo

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

  joinRoom(roomId, myProfile) {
    this.cleanup();
    this.roomId = (roomId || 'PARTY1').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'PARTY1';
    this.myProfile = myProfile;

    if (!window.Peer) {
      this.emitStatus('🟡 單機派對模式 (PeerJS 未載入)');
      return;
    }

    this.emitStatus(`🔄 正在連線房號 ${this.roomId}...`);
    const hostPeerId = `${PEER_PREFIX}${this.roomId.toLowerCase()}`;

    // Step 1: Try claiming the deterministic Host ID for this room
    const peer = new window.Peer(hostPeerId, {
      debug: 0
    });
    this.peer = peer;

    peer.on('open', (id) => {
      // Successfully became the Room Host!
      this.isHost = true;
      this.myId = id;
      this.roomPlayers.set(this.myId, {
        id: this.myId,
        name: this.myProfile.name,
        appearance: this.myProfile.appearance
      });

      this.emitStatus(`🟢 房號 ${this.roomId} (房主・1人連線)`);
      if (this.callbacks.onWelcome) {
        this.callbacks.onWelcome({
          playerId: this.myId,
          roomId: this.roomId,
          seed: this.roomSeed,
          isHost: true,
          playerCount: 1
        });
      }
    });

    // Host receives incoming Guest connections
    peer.on('connection', (conn) => {
      if (!this.isHost) return;

      conn.on('open', () => {
        this.guestConns.set(conn.peer, conn);
      });

      conn.on('data', (msg) => {
        this.handleHostMessage(conn, msg);
      });

      conn.on('close', () => {
        this.guestConns.delete(conn.peer);
        this.roomPlayers.delete(conn.peer);
        const count = this.guestConns.size + 1;
        this.emitStatus(`🟢 房號 ${this.roomId} (房主・${count}人連線)`);
        if (this.callbacks.onPlayerLeft) {
          this.callbacks.onPlayerLeft(conn.peer, count);
        }
        this.broadcastFromHost({
          type: 'player_left',
          playerId: conn.peer,
          playerCount: count
        });
      });
    });

    peer.on('error', (err) => {
      if (err.type === 'unavailable-id') {
        // Host already exists for this room -> Connect as Guest!
        this.connectAsGuest(hostPeerId);
      } else {
        this.emitStatus(`🟡 離線派對模式 (${this.roomId})`);
      }
    });
  }

  connectAsGuest(hostPeerId) {
    if (this.peer) {
      try { this.peer.destroy(); } catch (e) {}
    }
    this.isHost = false;
    const guestPeer = new window.Peer({ debug: 0 });
    this.peer = guestPeer;

    guestPeer.on('open', (myGuestId) => {
      this.myId = myGuestId;
      const conn = guestPeer.connect(hostPeerId, { reliable: false });
      this.hostConn = conn;

      conn.on('open', () => {
        conn.send({
          type: 'hello',
          id: this.myId,
          name: this.myProfile.name,
          appearance: this.myProfile.appearance
        });
      });

      conn.on('data', (msg) => {
        this.handleGuestMessage(msg);
      });

      conn.on('close', () => {
        this.emitStatus(`🟡 房主已離開，重新建立房間...`);
        setTimeout(() => this.joinRoom(this.roomId, this.myProfile), 800);
      });
    });

    guestPeer.on('error', () => {
      this.emitStatus(`🟡 單機派對模式 (${this.roomId})`);
    });
  }

  handleHostMessage(conn, msg) {
    if (!msg || typeof msg !== 'object') return;

    if (msg.type === 'hello') {
      const playerInfo = {
        id: conn.peer,
        name: msg.name || '連線玩家',
        appearance: msg.appearance || {}
      };
      this.roomPlayers.set(conn.peer, playerInfo);
      const count = this.guestConns.size + 1;

      this.emitStatus(`🟢 房號 ${this.roomId} (房主・${count}人連線)`);

      // Reply welcome to the new guest
      conn.send({
        type: 'welcome',
        playerId: conn.peer,
        roomId: this.roomId,
        seed: this.roomSeed,
        playerCount: count
      });

      // Notify local host UI
      if (this.callbacks.onPlayerJoined) {
        this.callbacks.onPlayerJoined(playerInfo, count);
      }

      // Broadcast join to all other guests
      this.broadcastFromHost({
        type: 'player_joined',
        player: playerInfo,
        playerCount: count
      }, conn.peer);
    } else if (msg.type === 'state') {
      if (this.callbacks.onRemoteState) {
        this.callbacks.onRemoteState(conn.peer, msg.state);
      }
      // Relay state to other guests
      this.broadcastFromHost({
        type: 'remote_state',
        playerId: conn.peer,
        state: msg.state
      }, conn.peer);
    } else if (msg.type === 'action') {
      if (msg.action === 'new_race') {
        this.roomSeed = Math.floor(Math.random() * 900000) + 100000;
        if (this.callbacks.onNewRace) {
          this.callbacks.onNewRace(this.roomSeed);
        }
        this.broadcastFromHost({
          type: 'new_race',
          seed: this.roomSeed
        });
      } else {
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
  }

  handleGuestMessage(msg) {
    if (!msg || typeof msg !== 'object') return;

    if (msg.type === 'welcome') {
      this.roomSeed = msg.seed;
      this.emitStatus(`🟢 房號 ${this.roomId} (${msg.playerCount}人連線)`);
      if (this.callbacks.onWelcome) {
        this.callbacks.onWelcome({
          playerId: this.myId,
          roomId: this.roomId,
          seed: msg.seed,
          isHost: false,
          playerCount: msg.playerCount
        });
      }
    } else if (msg.type === 'player_joined') {
      this.emitStatus(`🟢 房號 ${this.roomId} (${msg.playerCount}人連線)`);
      if (this.callbacks.onPlayerJoined) {
        this.callbacks.onPlayerJoined(msg.player, msg.playerCount);
      }
    } else if (msg.type === 'player_left') {
      this.emitStatus(`🟢 房號 ${this.roomId} (${msg.playerCount}人連線)`);
      if (this.callbacks.onPlayerLeft) {
        this.callbacks.onPlayerLeft(msg.playerId, msg.playerCount);
      }
    } else if (msg.type === 'remote_state') {
      if (this.callbacks.onRemoteState) {
        this.callbacks.onRemoteState(msg.playerId, msg.state);
      }
    } else if (msg.type === 'remote_action') {
      if (this.callbacks.onRemoteAction) {
        this.callbacks.onRemoteAction(msg.playerId, msg.action, msg.payload);
      }
    } else if (msg.type === 'new_race') {
      this.roomSeed = msg.seed;
      if (this.callbacks.onNewRace) {
        this.callbacks.onNewRace(msg.seed);
      }
    }
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
      if (action === 'new_race') {
        this.roomSeed = Math.floor(Math.random() * 900000) + 100000;
        this.broadcastFromHost({
          type: 'new_race',
          seed: this.roomSeed
        });
        return this.roomSeed;
      }
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
    return this.roomSeed;
  }

  broadcastFromHost(data, excludePeerId = null) {
    for (const [peerId, conn] of this.guestConns.entries()) {
      if (peerId !== excludePeerId && conn.open) {
        conn.send(data);
      }
    }
  }

  emitStatus(text) {
    if (this.callbacks.onStatus) {
      this.callbacks.onStatus(text);
    }
  }
}
