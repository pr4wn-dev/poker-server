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
        this.pendingBots = new Map(); // tableId -> Map of seatIndex -> { bot, approvals: Set, rejectedBy: null }
        this.botTurnTimers = new Map(); // `${tableId}_${seatIndex}` -> timeout
    }
    
    /**
     * Invite a bot to a table (requires approval from all players)
     * @param {string} tableId 
     * @param {string} botProfile - 'tex', 'lazy_larry', or 'pickles'
     * @param {string} inviterId - User ID of the table creator
     * @param {number} buyIn - Starting chips for the bot
     * @returns {Object} { success, seatIndex, bot, pendingApproval, error }
     */
    inviteBot(tableId, botProfile, inviterId, buyIn = 20000000) { // 20 million default
        const table = this.gameManager.tables.get(tableId);
        if (!table) {
            return { success: false, error: 'Table not found' };
        }
        
        // CRITICAL: If buyIn was passed as 0 or undefined, use table's buyIn setting
        // This ensures bots get correct chips for the table they're joining
        const actualBuyIn = buyIn > 0 ? buyIn : (table.buyIn || 20000000);
        console.log(`[BotManager] inviteBot called: profile=${botProfile}, requestedBuyIn=${buyIn}, tableBuyIn=${table.buyIn}, actualBuyIn=${actualBuyIn}`);
        
        // Only table creator can invite bots
        if (table.creatorId !== inviterId) {
            return { success: false, error: 'Only the table creator can invite bots' };
        }
        
        // Can't add bots after game started
        if (table.gameStarted) {
            return { success: false, error: 'Cannot add bots after game has started' };
        }
        
        // Find empty seat
        const emptySeat = table.seats.findIndex(s => s === null);
        if (emptySeat === -1) {
            return { success: false, error: 'Table is full' };
        }
        
        // Check if this bot profile is already at the table (active or pending)
        const tableBots = this.activeBots.get(tableId) || new Map();
        const tablePending = this.pendingBots.get(tableId) || new Map();
        
        for (const [, bot] of tableBots) {
            if (bot.name === BOT_PROFILES[botProfile]?.name) {
                return { success: false, error: `${BOT_PROFILES[botProfile]?.name} is already at this table` };
            }
        }
        for (const [, pending] of tablePending) {
            if (pending.bot.name === BOT_PROFILES[botProfile]?.name) {
                return { success: false, error: `${BOT_PROFILES[botProfile]?.name} is already pending approval` };
            }
        }
        
        // Create bot
        const bot = createBot(botProfile);
        bot.chips = actualBuyIn;  // Use actualBuyIn, not the parameter
        bot.seatIndex = emptySeat;
        bot.tableId = tableId;
        console.log(`[BotManager] Bot ${bot.name} created with ${actualBuyIn} chips at seat ${emptySeat}`);
        
        // Get list of human players who need to approve
        const humanPlayers = table.seats
            .filter(s => s !== null && !s.isBot)
            .map(s => s.playerId);
        
        // If only the creator is at the table, auto-approve
        if (humanPlayers.length <= 1) {
            return this.confirmBot(tableId, emptySeat, bot);
        }
        
        // Create pending bot entry
        if (!this.pendingBots.has(tableId)) {
            this.pendingBots.set(tableId, new Map());
        }
        
        const pendingEntry = {
            bot,
            buyIn,
            inviterId,
            approvals: new Set([inviterId]), // Creator auto-approves
            requiredApprovals: new Set(humanPlayers),
            rejectedBy: null,
            createdAt: Date.now()
        };
        
        this.pendingBots.get(tableId).set(emptySeat, pendingEntry);
        
        console.log(`[BotManager] ${bot.name} invited to table ${table.name} - awaiting ${humanPlayers.length - 1} approvals`);
        
        return { 
            success: true, 
            seatIndex: emptySeat, 
            bot,
            pendingApproval: true,
            approvalsNeeded: humanPlayers.filter(id => id !== inviterId)
        };
    }
    
    /**
     * Approve a pending bot (called by each player)
     */
    approveBot(tableId, seatIndex, oderId) {
        const tablePending = this.pendingBots.get(tableId);
        if (!tablePending || !tablePending.has(seatIndex)) {
            return { success: false, error: 'No pending bot at that seat' };
        }
        
        const pending = tablePending.get(seatIndex);
        
        // Check player is required to approve
        if (!pending.requiredApprovals.has(oderId)) {
            return { success: false, error: 'You are not required to approve this bot' };
        }
        
        // Add approval
        pending.approvals.add(oderId);
        
        console.log(`[BotManager] ${pending.bot.name} approved by ${oderId} (${pending.approvals.size}/${pending.requiredApprovals.size})`);
        
        // Check if all approvals received
        if (pending.approvals.size >= pending.requiredApprovals.size) {
            // All approved - add the bot
            tablePending.delete(seatIndex);
            return this.confirmBot(tableId, seatIndex, pending.bot);
        }
        
        return { 
            success: true, 
            approved: true,
            allApproved: false,
            approvalsReceived: pending.approvals.size,
            approvalsNeeded: pending.requiredApprovals.size
        };
    }
    
    /**
     * Reject a pending bot (any player can reject)
     */
    rejectBot(tableId, seatIndex, oderId) {
        const tablePending = this.pendingBots.get(tableId);
        if (!tablePending || !tablePending.has(seatIndex)) {
            return { success: false, error: 'No pending bot at that seat' };
        }
        
        const pending = tablePending.get(seatIndex);
        pending.rejectedBy = oderId;
        
        const botName = pending.bot.name;
        tablePending.delete(seatIndex);
        
        console.log(`[BotManager] ${botName} rejected by ${oderId}`);
        
        return { 
            success: true, 
            rejected: true,
            botName,
            rejectedBy: oderId
        };
    }
    
    /**
     * Actually add the bot to the table (after approval or auto-approval)
     */
    confirmBot(tableId, seatIndex, bot) {
        const table = this.gameManager.tables.get(tableId);
        if (!table) {
            return { success: false, error: 'Table not found' };
        }
        
        // Add to table (match Table.js seat structure)
        table.seats[seatIndex] = {
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
        this.activeBots.get(tableId).set(seatIndex, bot);
        
        console.log(`[BotManager] ${bot.name} confirmed and joined table ${table.name} at seat ${seatIndex}`);
        
        // Broadcast state update so UI shows the new bot
        table.onStateChange?.();
        
        return { success: true, seatIndex, bot, pendingApproval: false };
    }
    
    /**
     * Get pending bots for a table
     */
    getPendingBots(tableId) {
        const tablePending = this.pendingBots.get(tableId);
        if (!tablePending) return [];
        
        return Array.from(tablePending.entries()).map(([seatIndex, pending]) => ({
            seatIndex,
            botName: pending.bot.name,
            botPersonality: pending.bot.personality,
            inviterId: pending.inviterId,
            approvalsReceived: pending.approvals.size,
            approvalsNeeded: pending.requiredApprovals.size,
            waitingFor: Array.from(pending.requiredApprovals).filter(id => !pending.approvals.has(id))
        }));
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
        if (!table || !table.gameStarted) {
            return;
        }
        
        // CRITICAL: Don't trigger bot turns during non-betting phases
        const validPhases = ['preflop', 'flop', 'turn', 'river'];
        if (!validPhases.includes(table.phase)) {
            // Showdown, waiting, ready_up, countdown - bots don't act
            return;
        }
        
        const currentSeat = table.seats[table.currentPlayerIndex];
        if (!currentSeat) {
            return;
        }
        
        if (!currentSeat.isBot) {
            return;
        }
        
        const tableBots = this.activeBots.get(tableId);
        if (!tableBots) {
            console.log(`[BotManager] ERROR: No activeBots map for table ${tableId}`);
            return;
        }
        
        const bot = tableBots.get(table.currentPlayerIndex);
        if (!bot) {
            console.log(`[BotManager] ERROR: Bot not found in activeBots for seat ${table.currentPlayerIndex}. Active seats: ${Array.from(tableBots.keys()).join(', ')}`);
            return;
        }
        
        // Don't double-trigger - include phase and hand count to ensure unique key per turn
        const timerKey = `${tableId}_${table.currentPlayerIndex}_${table.phase}_${table.handsPlayed}`;
        if (this.botTurnTimers.has(timerKey)) {
            // Already processing this turn, skip duplicate
            return;
        }
        
        console.log(`[BotManager] Bot turn: ${currentSeat.name} at seat ${table.currentPlayerIndex}, phase: ${table.phase}`);
        
        // Simulate thinking time (1-3 seconds based on personality)
        let thinkTime = 1500;
        if (bot.personality === 'passive') thinkTime = 2500; // Larry thinks slowly
        if (bot.personality === 'aggressive') thinkTime = 1000; // Tex is quick
        if (bot.personality === 'unpredictable') thinkTime = 500 + Math.random() * 2500; // Pickles varies
        
        console.log(`[BotManager] ${bot.name} is thinking... (${Math.round(thinkTime)}ms)`);
        
        const seatIndex = table.currentPlayerIndex;
        const timer = setTimeout(() => {
            this.executeBotTurn(tableId, seatIndex);
            this.botTurnTimers.delete(timerKey);
        }, thinkTime);
        
        this.botTurnTimers.set(timerKey, timer);
    }
    
    /**
     * Execute a bot's turn
     */
    executeBotTurn(tableId, seatIndex) {
        try {
            const table = this.gameManager.tables.get(tableId);
            if (!table) {
                console.log(`[BotManager] executeBotTurn: Table ${tableId} not found`);
                return;
            }
            
            if (table.currentPlayerIndex !== seatIndex) {
                console.log(`[BotManager] executeBotTurn: No longer ${seatIndex}'s turn (now ${table.currentPlayerIndex})`);
                return;
            }
            
            const tableBots = this.activeBots.get(tableId);
            if (!tableBots) {
                console.log(`[BotManager] executeBotTurn: No activeBots for table`);
                return;
            }
            
            const bot = tableBots.get(seatIndex);
            if (!bot) {
                console.log(`[BotManager] executeBotTurn: Bot not found at seat ${seatIndex}`);
                return;
            }
            
            const seat = table.seats[seatIndex];
            if (!seat) {
                console.log(`[BotManager] executeBotTurn: Seat ${seatIndex} is empty`);
                return;
            }
            
            if (seat.isFolded) {
                console.log(`[BotManager] executeBotTurn: ${bot.name} already folded`);
                return;
            }
            
            if (seat.isAllIn) {
                console.log(`[BotManager] executeBotTurn: ${bot.name} already all-in`);
                return;
            }
            
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
            
            console.log(`[BotManager] ${bot.name} deciding... phase=${table.phase}, currentBet=${table.currentBet}, botBet=${seat.currentBet}, pot=${table.pot}`);
            
            // Make decision
            const decision = bot.decide(gameState);
            console.log(`[BotManager] ${bot.name} decides: ${decision.action}${decision.amount ? ` $${decision.amount}` : ''}`);
            
            // Execute action through game manager
            const result = this.gameManager.handleAction(tableId, bot.id, decision.action, decision.amount);
            
            if (!result.success) {
                console.error(`[BotManager] ${bot.name} action failed: ${result.error}`);
                // Fallback to check or fold if action failed
                const fallbackResult = this.gameManager.handleAction(tableId, bot.id, table.currentBet > 0 ? 'fold' : 'check');
                console.log(`[BotManager] ${bot.name} fallback action: ${fallbackResult.success ? 'success' : fallbackResult.error}`);
            }
        } catch (error) {
            console.error(`[BotManager] executeBotTurn ERROR:`, error);
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

