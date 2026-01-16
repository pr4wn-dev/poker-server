/**
 * GameManager - Manages all poker tables and players
 */

const Table = require('./Table');
const { v4: uuidv4 } = require('uuid');

class GameManager {
    constructor() {
        this.tables = new Map();      // tableId -> Table
        this.players = new Map();     // playerId -> { socketId, name, currentTableId }
        this.socketToPlayer = new Map(); // socketId -> playerId
    }

    // ============ Player Management ============

    registerPlayer(socketId, playerName) {
        const playerId = uuidv4();
        this.players.set(playerId, {
            socketId,
            name: playerName,
            currentTableId: null,
            chips: parseInt(process.env.DEFAULT_STARTING_CHIPS) || 10000
        });
        this.socketToPlayer.set(socketId, playerId);
        
        console.log(`[GameManager] Player registered: ${playerName} (${playerId})`);
        return playerId;
    }

    getPlayerBySocketId(socketId) {
        const playerId = this.socketToPlayer.get(socketId);
        if (!playerId) return null;
        return { playerId, ...this.players.get(playerId) };
    }

    removePlayer(socketId) {
        const playerId = this.socketToPlayer.get(socketId);
        if (!playerId) return;

        const player = this.players.get(playerId);
        if (player?.currentTableId) {
            this.leaveTable(playerId);
        }

        this.players.delete(playerId);
        this.socketToPlayer.delete(socketId);
        console.log(`[GameManager] Player removed: ${playerId}`);
    }

    // ============ Table Management ============

    createTable(options = {}) {
        const tableId = uuidv4();
        const table = new Table({
            id: tableId,
            name: options.name || `Table ${this.tables.size + 1}`,
            maxPlayers: options.maxPlayers || parseInt(process.env.MAX_PLAYERS) || 9,
            smallBlind: options.smallBlind || parseInt(process.env.DEFAULT_SMALL_BLIND) || 50,
            bigBlind: options.bigBlind || parseInt(process.env.DEFAULT_BIG_BLIND) || 100,
            isPrivate: options.isPrivate || false
        });

        this.tables.set(tableId, table);
        console.log(`[GameManager] Table created: ${table.name} (${tableId})`);
        return table;
    }

    getTable(tableId) {
        return this.tables.get(tableId);
    }

    joinTable(playerId, tableId, seatIndex = null) {
        const player = this.players.get(playerId);
        const table = this.tables.get(tableId);

        if (!player || !table) {
            return { success: false, error: 'Invalid player or table' };
        }

        if (player.currentTableId) {
            return { success: false, error: 'Already at a table' };
        }

        const result = table.addPlayer(playerId, player.name, player.chips, seatIndex);
        if (result.success) {
            player.currentTableId = tableId;
        }
        return result;
    }

    leaveTable(playerId) {
        const player = this.players.get(playerId);
        if (!player?.currentTableId) return { success: false, error: 'Not at a table' };

        const table = this.tables.get(player.currentTableId);
        if (table) {
            const chips = table.removePlayer(playerId);
            if (chips !== null) {
                player.chips = chips; // Return chips to player
            }
        }

        player.currentTableId = null;
        return { success: true };
    }

    // ============ Game Actions ============

    handlePlayerAction(playerId, action, amount = 0) {
        const player = this.players.get(playerId);
        if (!player?.currentTableId) {
            return { success: false, error: 'Not at a table' };
        }

        const table = this.tables.get(player.currentTableId);
        if (!table) {
            return { success: false, error: 'Table not found' };
        }

        return table.handleAction(playerId, action, amount);
    }

    // ============ Query Methods ============

    getActiveTableCount() {
        return this.tables.size;
    }

    getOnlinePlayerCount() {
        return this.players.size;
    }

    getPublicTableList() {
        const publicTables = [];
        for (const [id, table] of this.tables) {
            if (!table.isPrivate) {
                publicTables.push(table.getPublicInfo());
            }
        }
        return publicTables;
    }

    getTableState(tableId, forPlayerId = null) {
        const table = this.tables.get(tableId);
        if (!table) return null;
        return table.getState(forPlayerId);
    }
}

module.exports = GameManager;

