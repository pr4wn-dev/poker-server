/**
 * SocketHandler - Manages WebSocket connections and events
 * This is the communication layer between Unity clients and the game server
 */

class SocketHandler {
    constructor(io, gameManager) {
        this.io = io;
        this.gameManager = gameManager;
    }

    initialize() {
        this.io.on('connection', (socket) => {
            console.log(`[Socket] Client connected: ${socket.id}`);

            // ============ Authentication / Registration ============
            socket.on('register', (data, callback) => {
                const { playerName } = data;
                if (!playerName || playerName.length < 2) {
                    return callback({ success: false, error: 'Invalid name' });
                }

                const playerId = this.gameManager.registerPlayer(socket.id, playerName);
                callback({ success: true, playerId });
            });

            // ============ Lobby ============
            socket.on('get_tables', (callback) => {
                const tables = this.gameManager.getPublicTableList();
                callback({ success: true, tables });
            });

            socket.on('create_table', (data, callback) => {
                const player = this.gameManager.getPlayerBySocketId(socket.id);
                if (!player) {
                    return callback({ success: false, error: 'Not registered' });
                }

                const table = this.gameManager.createTable(data);
                callback({ success: true, tableId: table.id });
                
                // Broadcast new table to lobby
                this.io.emit('table_created', table.getPublicInfo());
            });

            // ============ Table Actions ============
            socket.on('join_table', (data, callback) => {
                const { tableId, seatIndex } = data;
                const player = this.gameManager.getPlayerBySocketId(socket.id);
                if (!player) {
                    return callback({ success: false, error: 'Not registered' });
                }

                const result = this.gameManager.joinTable(player.playerId, tableId, seatIndex);
                if (result.success) {
                    socket.join(`table:${tableId}`);
                    
                    // Notify other players at the table
                    socket.to(`table:${tableId}`).emit('player_joined', {
                        playerId: player.playerId,
                        name: player.name,
                        seatIndex: result.seatIndex
                    });

                    // Send current table state to the joining player
                    const state = this.gameManager.getTableState(tableId, player.playerId);
                    callback({ success: true, seatIndex: result.seatIndex, state });
                } else {
                    callback(result);
                }
            });

            socket.on('leave_table', (callback) => {
                const player = this.gameManager.getPlayerBySocketId(socket.id);
                if (!player) {
                    return callback({ success: false, error: 'Not registered' });
                }

                const tableId = player.currentTableId;
                const result = this.gameManager.leaveTable(player.playerId);
                
                if (result.success && tableId) {
                    socket.leave(`table:${tableId}`);
                    socket.to(`table:${tableId}`).emit('player_left', {
                        playerId: player.playerId
                    });
                }

                callback(result);
            });

            // ============ Game Actions ============
            socket.on('action', (data, callback) => {
                const { action, amount } = data;
                const player = this.gameManager.getPlayerBySocketId(socket.id);
                if (!player) {
                    return callback({ success: false, error: 'Not registered' });
                }

                const result = this.gameManager.handlePlayerAction(player.playerId, action, amount);
                
                if (result.success) {
                    // Broadcast action to all players at the table
                    const tableId = player.currentTableId;
                    this.io.to(`table:${tableId}`).emit('player_action', {
                        playerId: player.playerId,
                        action: result.action,
                        amount: result.amount
                    });

                    // Send updated state to all players
                    this.broadcastTableState(tableId);
                }

                callback(result);
            });

            // ============ Chat ============
            socket.on('chat', (data) => {
                const player = this.gameManager.getPlayerBySocketId(socket.id);
                if (!player?.currentTableId) return;

                this.io.to(`table:${player.currentTableId}`).emit('chat', {
                    playerId: player.playerId,
                    name: player.name,
                    message: data.message?.substring(0, 200) // Limit message length
                });
            });

            // ============ Disconnect ============
            socket.on('disconnect', () => {
                console.log(`[Socket] Client disconnected: ${socket.id}`);
                const player = this.gameManager.getPlayerBySocketId(socket.id);
                
                if (player?.currentTableId) {
                    socket.to(`table:${player.currentTableId}`).emit('player_disconnected', {
                        playerId: player.playerId
                    });
                }
                
                this.gameManager.removePlayer(socket.id);
            });
        });

        console.log('[SocketHandler] Initialized');
    }

    broadcastTableState(tableId) {
        const table = this.gameManager.getTable(tableId);
        if (!table) return;

        // Send personalized state to each player (hiding opponent cards)
        const sockets = this.io.sockets.adapter.rooms.get(`table:${tableId}`);
        if (!sockets) return;

        for (const socketId of sockets) {
            const player = this.gameManager.getPlayerBySocketId(socketId);
            const state = table.getState(player?.playerId);
            this.io.to(socketId).emit('table_state', state);
        }
    }
}

module.exports = SocketHandler;

