/**
 * Network - Manages PeerJS-based multiplayer connections.
 *
 * The host creates a Peer with a known ID derived from the 5-digit room code.
 * Clients connect to that peer ID. All game messages pass through this layer.
 */
class Network {
    constructor() {
        this.peer = null;
        this.connections = new Map(); // playerId -> { connection, playerName, playerId }
        this.isHost = false;
        this.roomCode = '';
        this.playerId = '';
        this.playerName = '';
        this.hostConnection = null;

        // Callbacks
        this.onPlayerJoined = null;
        this.onPlayerLeft = null;
        this.onMessage = null;
        this.onConnected = null;
        this.onDisconnected = null;
        this.onError = null;
    }

    _generateRoomCode() {
        return String(Math.floor(10000 + Math.random() * 90000));
    }

    _generatePlayerId() {
        return 'p_' + Math.random().toString(36).substring(2, 9);
    }

    _peerIdFromCode(code) {
        return 'arballoonpop-' + code;
    }

    /**
     * Host a new game. Resolves with the 5-digit room code.
     */
    async hostGame(playerName) {
        this.isHost = true;
        this.playerName = playerName;
        this.playerId = 'host';
        this.roomCode = this._generateRoomCode();

        const peerId = this._peerIdFromCode(this.roomCode);

        return new Promise((resolve, reject) => {
            this.peer = new Peer(peerId, { debug: 0 });

            this.peer.on('open', () => {
                this.peer.on('connection', (conn) => this._handleIncoming(conn));
                resolve(this.roomCode);
            });

            this.peer.on('error', (err) => {
                if (err.type === 'unavailable-id') {
                    // Room code collision — regenerate
                    this.peer.destroy();
                    this.roomCode = this._generateRoomCode();
                    this.hostGame(playerName).then(resolve).catch(reject);
                } else {
                    if (this.onError) this.onError(err.message || String(err));
                    reject(err);
                }
            });
        });
    }

    /**
     * Join an existing game by room code. Resolves when connected.
     */
    async joinGame(roomCode, playerName) {
        this.isHost = false;
        this.playerName = playerName;
        this.playerId = this._generatePlayerId();
        this.roomCode = roomCode;

        const hostPeerId = this._peerIdFromCode(roomCode);

        return new Promise((resolve, reject) => {
            this.peer = new Peer(this.playerId, { debug: 0 });

            let resolved = false;

            this.peer.on('open', () => {
                const conn = this.peer.connect(hostPeerId, {
                    reliable: true,
                    metadata: {
                        playerName: this.playerName,
                        playerId: this.playerId
                    }
                });

                conn.on('open', () => {
                    this.hostConnection = conn;

                    conn.on('data', (data) => {
                        if (this.onMessage) this.onMessage(data);
                    });

                    conn.on('close', () => {
                        if (this.onDisconnected) this.onDisconnected();
                    });

                    // Announce ourselves to the host
                    conn.send({
                        type: 'player-join',
                        playerId: this.playerId,
                        playerName: this.playerName
                    });

                    resolved = true;
                    if (this.onConnected) this.onConnected();
                    resolve();
                });

                conn.on('error', (err) => {
                    if (!resolved) reject(err);
                });
            });

            this.peer.on('error', (err) => {
                if (this.onError) this.onError(err.message || String(err));
                if (!resolved) reject(err);
            });

            // Timeout after 12 seconds
            setTimeout(() => {
                if (!resolved) {
                    reject(new Error('Connection timed out. Check the room code and try again.'));
                }
            }, 12000);
        });
    }

    _handleIncoming(conn) {
        conn.on('open', () => {
            conn.on('data', (data) => {
                if (data.type === 'player-join') {
                    this.connections.set(data.playerId, {
                        connection: conn,
                        playerName: data.playerName,
                        playerId: data.playerId
                    });
                    if (this.onPlayerJoined) {
                        this.onPlayerJoined(data.playerId, data.playerName);
                    }
                } else {
                    if (this.onMessage) this.onMessage(data, conn);
                }
            });

            conn.on('close', () => {
                for (const [id, info] of this.connections) {
                    if (info.connection === conn) {
                        this.connections.delete(id);
                        if (this.onPlayerLeft) this.onPlayerLeft(id);
                        break;
                    }
                }
            });
        });
    }

    /** Client sends data to the host */
    sendToHost(data) {
        if (this.hostConnection && this.hostConnection.open) {
            this.hostConnection.send(data);
        }
    }

    /** Host broadcasts data to all connected clients */
    broadcast(data) {
        for (const [, info] of this.connections) {
            if (info.connection.open) {
                info.connection.send(data);
            }
        }
    }

    /** Host sends data to one specific client */
    sendTo(playerId, data) {
        const info = this.connections.get(playerId);
        if (info && info.connection.open) {
            info.connection.send(data);
        }
    }

    getPlayerCount() {
        return this.connections.size + (this.isHost ? 1 : 0);
    }

    destroy() {
        if (this.peer) {
            this.peer.destroy();
            this.peer = null;
        }
        this.connections.clear();
        this.hostConnection = null;
    }
}
