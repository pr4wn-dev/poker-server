/**
 * BotManager.js - Manages bot players at poker tables
 * 
 * Handles:
 * - Adding/removing bots from tables
 * - Making bots take their turns automatically
 * - Bot turn timing (simulated "thinking")
 */

const { BotPlayer, BOT_PROFILES, createBot } = require('./BotPlayer');

class BotManager {
    constructor(gameManager) {
        this.gameManager = gameManager;
        this.activeBots = new Map(); // tableId -> Map of seatIndex -> BotPlayer
        this.botTurnTimers = new Map(); // `${tableId}_${seatIndex}` -> timeout
    }
    
    /**
     * Add a bot to a table
     * @param {string} tableId 
     * @param {string} botProfile - 'tex', 'lazy_larry', or 'pickles'
     * @param {number} buyIn - Starting chips for the bot
     * @returns {Object} { success, seatIndex, bot, error }
     */
    addBot(tableId, botProfile, buyIn = 1000) {
        const table = this.gameManager.tables.get(tableId);
        if (!table) {
            return { success: false, error: 'Table not found' };
        }
        
        // Find empty seat
        const emptySeat = table.seats.findIndex(s => s === null);
        if (emptySeat === -1) {
            return { success: false, error: 'Table is full' };
        }
        
        // Check if this bot profile is already at the table
        const tableBots = this.activeBots.get(tableId) || new Map();
        for (const [, bot] of tableBots) {
            if (bot.personality === BOT_PROFILES[botProfile]?.personality && 
                bot.name === BOT_PROFILES[botProfile]?.name) {
                return { success: false, error: `${BOT_PROFILES[botProfile]?.name} is already at this table` };
            }
        }
        
        // Create bot
        const bot = createBot(botProfile);
        bot.chips = buyIn;
        bot.seatIndex = emptySeat;
        bot.tableId = tableId;
        
        // Add to table (match Table.js seat structure)
        table.seats[emptySeat] = {
            playerId: bot.id,
            name: bot.name,
            chips: bot.chips,
            cards: [],
            currentBet: 0,
            totalBet: 0,
            isActive: true,
            isFolded: false,
            isAllIn: false,
            isConnected: true,
            isBot: true,
            isSittingOut: false
        };
        
        // Track bot
        if (!this.activeBots.has(tableId)) {
            this.activeBots.set(tableId, new Map());
        }
        this.activeBots.get(tableId).set(emptySeat, bot);
        
        console.log(`[BotManager] ${bot.name} joined table ${table.name} at seat ${emptySeat}`);
        
        return { success: true, seatIndex: emptySeat, bot };
    }
    
    /**
     * Remove a bot from a table
     */
    removeBot(tableId, seatIndex) {
        const table = this.gameManager.tables.get(tableId);
        if (!table) {
            return { success: false, error: 'Table not found' };
        }
        
        const tableBots = this.activeBots.get(tableId);
        if (!tableBots || !tableBots.has(seatIndex)) {
            return { success: false, error: 'No bot at that seat' };
        }
        
        const bot = tableBots.get(seatIndex);
        
        // Clear any pending turn timer
        this.clearBotTimer(tableId, seatIndex);
        
        // Remove from table
        table.seats[seatIndex] = null;
        tableBots.delete(seatIndex);
        
        console.log(`[BotManager] ${bot.name} left table ${table.name}`);
        
        return { success: true, botName: bot.name };
    }
    
    /**
     * Remove all bots from a table
     */
    removeAllBots(tableId) {
        const tableBots = this.activeBots.get(tableId);
        if (!tableBots) return;
        
        for (const [seatIndex] of tableBots) {
            this.removeBot(tableId, seatIndex);
        }
    }
    
    /**
     * Check if current player is a bot and trigger their turn
     */
    checkBotTurn(tableId) {
        const table = this.gameManager.tables.get(tableId);
        if (!table || !table.gameStarted) return;
        
        const currentSeat = table.seats[table.currentPlayerIndex];
        if (!currentSeat || !currentSeat.isBot) return;
        
        const tableBots = this.activeBots.get(tableId);
        if (!tableBots) return;
        
        const bot = tableBots.get(table.currentPlayerIndex);
        if (!bot) return;
        
        // Don't double-trigger
        const timerKey = `${tableId}_${table.currentPlayerIndex}`;
        if (this.botTurnTimers.has(timerKey)) return;
        
        // Simulate thinking time (1-3 seconds based on personality)
        let thinkTime = 1500;
        if (bot.personality === 'passive') thinkTime = 2500; // Larry thinks slowly
        if (bot.personality === 'aggressive') thinkTime = 1000; // Tex is quick
        if (bot.personality === 'unpredictable') thinkTime = 500 + Math.random() * 2500; // Pickles varies
        
        console.log(`[BotManager] ${bot.name} is thinking... (${Math.round(thinkTime)}ms)`);
        
        const timer = setTimeout(() => {
            this.executeBotTurn(tableId, table.currentPlayerIndex);
            this.botTurnTimers.delete(timerKey);
        }, thinkTime);
        
        this.botTurnTimers.set(timerKey, timer);
    }
    
    /**
     * Execute a bot's turn
     */
    executeBotTurn(tableId, seatIndex) {
        const table = this.gameManager.tables.get(tableId);
        if (!table || table.currentPlayerIndex !== seatIndex) {
            console.log(`[BotManager] Skipping bot turn - no longer their turn`);
            return;
        }
        
        const tableBots = this.activeBots.get(tableId);
        if (!tableBots) return;
        
        const bot = tableBots.get(seatIndex);
        if (!bot) return;
        
        const seat = table.seats[seatIndex];
        if (!seat || seat.isFolded || seat.isAllIn) return;
        
        // Sync bot state with seat
        bot.chips = seat.chips;
        bot.currentBet = seat.currentBet;
        bot.cards = seat.cards;
        bot.folded = seat.isFolded;
        bot.allIn = seat.isAllIn;
        
        // Get game state for decision
        const gameState = {
            currentBet: table.currentBet,
            pot: table.pot,
            minRaise: table.bigBlind,
            maxBet: seat.chips,
            phase: table.phase,
            communityCards: table.communityCards
        };
        
        // Make decision
        const decision = bot.decide(gameState);
        console.log(`[BotManager] ${bot.name} decides: ${decision.action}${decision.amount ? ` $${decision.amount}` : ''}`);
        
        // Execute action through game manager
        const result = this.gameManager.handleAction(tableId, bot.id, decision.action, decision.amount);
        
        if (!result.success) {
            console.error(`[BotManager] ${bot.name} action failed: ${result.error}`);
            // Fallback to fold if action failed
            this.gameManager.handleAction(tableId, bot.id, 'fold');
        }
    }
    
    /**
     * Update bot cards when dealt
     */
    updateBotCards(tableId, seatIndex, cards) {
        const tableBots = this.activeBots.get(tableId);
        if (!tableBots) return;
        
        const bot = tableBots.get(seatIndex);
        if (bot) {
            bot.cards = cards;
        }
    }
    
    /**
     * Reset bots for new hand
     */
    resetBotsForHand(tableId) {
        const tableBots = this.activeBots.get(tableId);
        if (!tableBots) return;
        
        for (const [, bot] of tableBots) {
            bot.resetForHand();
        }
    }
    
    /**
     * Clear bot turn timer
     */
    clearBotTimer(tableId, seatIndex) {
        const timerKey = `${tableId}_${seatIndex}`;
        const timer = this.botTurnTimers.get(timerKey);
        if (timer) {
            clearTimeout(timer);
            this.botTurnTimers.delete(timerKey);
        }
    }
    
    /**
     * Get bots at a table
     */
    getTableBots(tableId) {
        const tableBots = this.activeBots.get(tableId);
        if (!tableBots) return [];
        
        return Array.from(tableBots.entries()).map(([seatIndex, bot]) => ({
            seatIndex,
            id: bot.id,
            name: bot.name,
            personality: bot.personality,
            chips: bot.chips
        }));
    }
    
    /**
     * Check if a player ID belongs to a bot
     */
    isBot(playerId) {
        return playerId && playerId.startsWith('bot_');
    }
}

module.exports = BotManager;

