/**
 * GameManager - Manages all poker tables and players
 */

const Table = require('./Table');
const BotManager = require('./BotManager');
const { v4: uuidv4 } = require('uuid');

class GameManager {
    constructor() {
        this.tables = new Map();      // tableId -> Table
        this.players = new Map();     // playerId -> { socketId, name, currentTableId }
        this.socketToPlayer = new Map(); // socketId -> playerId
        this.botManager = new BotManager(this);
    }

    // ============ Player Management ============

    /**
     * Register a player (with existing userId from database or generate new)
     */
    registerPlayer(socketId, playerName, userId = null) {
        const playerId = userId || uuidv4();
        
        // Check if player already exists (reconnecting)
        if (this.players.has(playerId)) {
            const existing = this.players.get(playerId);
            existing.socketId = socketId;
            existing.name = playerName;
            this.socketToPlayer.set(socketId, playerId);
            console.log(`[GameManager] Player reconnected: ${playerName} (${playerId})`);
            return playerId;
        }
        
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

    /**
     * Remove player (can pass userId directly or socketId)
     */
    removePlayer(userIdOrSocketId, socketId = null) {
        let playerId;
        
        if (socketId) {
            // Called with (userId, socketId)
            playerId = userIdOrSocketId;
            this.socketToPlayer.delete(socketId);
        } else {
            // Called with just socketId
            playerId = this.socketToPlayer.get(userIdOrSocketId);
            this.socketToPlayer.delete(userIdOrSocketId);
        }
        
        if (!playerId) return;

        const player = this.players.get(playerId);
        if (player?.currentTableId) {
            this.leaveTable(playerId);
        }

        this.players.delete(playerId);
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
            buyIn: options.buyIn || 20000000, // Default 20 million
            practiceMode: options.practiceMode || false, // Allow broke players to practice
            isPrivate: options.isPrivate || false,
            creatorId: options.creatorId || null
        });

        this.tables.set(tableId, table);
        console.log(`[GameManager] Table created: ${table.name} (${tableId}) by ${options.creatorId}, practiceMode: ${table.practiceMode}`);
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

        // Check if player has enough chips for the buy-in
        const buyIn = table.buyIn || 20000000;
        let isPracticePlayer = false;
        
        if (player.chips < buyIn) {
            // If practice mode is enabled, loan them the chips
            if (table.practiceMode) {
                console.log(`[GameManager] Player ${player.name} joining in PRACTICE MODE (has ${player.chips}, needs ${buyIn})`);
                isPracticePlayer = true;
                table.practiceModePlayers.add(playerId);
            } else {
                return { success: false, error: `Not enough chips. Buy-in is ${buyIn.toLocaleString()}` };
            }
        }

        // Check if player is at another table
        if (player.currentTableId && player.currentTableId !== tableId) {
            const oldTable = this.tables.get(player.currentTableId);
            if (oldTable) {
                const stillAtTable = oldTable.seats.some(s => s?.playerId === playerId);
                if (stillAtTable) {
                    // Auto-leave old table when joining a new one (Issue #50)
                    console.log(`[GameManager] Auto-leaving old table ${player.currentTableId} to join ${tableId}`);
                    const chips = oldTable.removePlayer(playerId);
                    if (chips !== null) {
                        player.chips += chips; // ADD chips back to account (was = which replaced!)
                    }
                }
            }
            player.currentTableId = null;
        }

        // For practice players: don't deduct from account, just give them table chips
        // For regular players: deduct buy-in from their account
        if (!isPracticePlayer) {
            player.chips -= buyIn;
        }
        
        const result = table.addPlayer(playerId, player.name, buyIn, seatIndex);
        if (result.success) {
            player.currentTableId = tableId;
            if (isPracticePlayer) {
                result.isPracticeMode = true;
                result.practiceMessage = "You're playing in PRACTICE mode. Winnings won't be saved.";
            }
        } else {
            // Refund if join failed (only for non-practice players)
            if (!isPracticePlayer) {
                player.chips += buyIn;
            }
            table.practiceModePlayers.delete(playerId);
        }
        return result;
    }

    leaveTable(playerId) {
        const player = this.players.get(playerId);
        if (!player?.currentTableId) return { success: false, error: 'Not at a table' };

        const table = this.tables.get(player.currentTableId);
        if (table) {
            const chips = table.removePlayer(playerId);
            
            // Check if this was a practice player
            const wasPracticePlayer = table.practiceModePlayers.has(playerId);
            table.practiceModePlayers.delete(playerId);
            
            if (chips !== null && !wasPracticePlayer) {
                // Only add chips back for NON-practice players
                player.chips += chips;
                console.log(`[GameManager] Player ${player.name} left table with ${chips} chips (added to account)`);
            } else if (wasPracticePlayer) {
                console.log(`[GameManager] Practice player ${player.name} left table - chips NOT added to account`);
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
    
    /**
     * Handle action for bots or players (used by BotManager)
     */
    handleAction(tableId, oderId, action, amount = 0) {
        const table = this.tables.get(tableId);
        if (!table) {
            return { success: false, error: 'Table not found' };
        }
        
        return table.handleAction(oderId, action, amount);
    }
    
    // ============ Bot Management ============
    
    inviteBot(tableId, botProfile, inviterId, buyIn = 20000000) { // 20 million default
        return this.botManager.inviteBot(tableId, botProfile, inviterId, buyIn);
    }
    
    approveBot(tableId, seatIndex, oderId) {
        return this.botManager.approveBot(tableId, seatIndex, oderId);
    }
    
    rejectBot(tableId, seatIndex, oderId) {
        return this.botManager.rejectBot(tableId, seatIndex, oderId);
    }
    
    removeBot(tableId, seatIndex) {
        return this.botManager.removeBot(tableId, seatIndex);
    }
    
    getPendingBots(tableId) {
        return this.botManager.getPendingBots(tableId);
    }
    
    /**
     * Called after each action to check if next player is a bot
     */
    checkBotTurn(tableId) {
        this.botManager.checkBotTurn(tableId);
    }
    
    /**
     * Get available bot profiles
     */
    getAvailableBots() {
        return ['tex', 'lazy_larry', 'pickles'];
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

