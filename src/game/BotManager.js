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
        // CRITICAL: Check both activeBots map AND actual seats, because in simulation restarts,
        // bots remain in seats but activeBots might not be cleared
        const botProfileName = BOT_PROFILES[botProfile]?.name;
        if (!botProfileName) {
            return { success: false, error: `Invalid bot profile: ${botProfile}` };
        }
        
        // Check actual seats first (most reliable)
        // CRITICAL: Use case-insensitive comparison to handle any name variations
        // CRITICAL FIX: Only check ACTIVE seats - inactive/eliminated bots don't count
        const botProfileNameLower = botProfileName.toLowerCase();
        for (const seat of table.seats) {
            if (seat && seat.isBot && seat.isActive !== false) {
                const seatNameLower = (seat.name || '').toLowerCase();
                // Check exact match or if names contain each other (handles variations)
                if (seatNameLower === botProfileNameLower || 
                    seatNameLower.includes(botProfileNameLower) || 
                    botProfileNameLower.includes(seatNameLower)) {
                    return { success: false, error: `${botProfileName} is already at this table` };
                }
            }
        }
        
        // Also check activeBots map
        const tableBots = this.activeBots.get(tableId) || new Map();
        for (const [, bot] of tableBots) {
            if (bot.name === botProfileName) {
                return { success: false, error: `${botProfileName} is already at this table` };
            }
        }
        
        // Check pending bots
        const tablePending = this.pendingBots.get(tableId) || new Map();
        for (const [, pending] of tablePending) {
            if (pending.bot.name === botProfileName) {
                return { success: false, error: `${botProfileName} is already pending approval` };
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
        
        // CRITICAL: In practice mode, bots should automatically submit items for item ante
        // Check if item ante is enabled and bot needs to submit
        if (table.practiceMode && table.itemAnteEnabled && !table.gameStarted && table.itemAnte) {
            // Small delay to ensure table state is updated
            setTimeout(() => {
                this._handleBotItemAnte(tableId, seatIndex, bot);
            }, 1000);
        }
        
        return { success: true, seatIndex, bot, pendingApproval: false };
    }
    
    /**
     * Handle item ante submission for a bot (practice mode only)
     */
    async _handleBotItemAnte(tableId, seatIndex, bot) {
        const table = this.gameManager.tables.get(tableId);
        if (!table || !table.itemAnteEnabled || table.gameStarted || !table.itemAnte) {
            return;
        }
        
        // Check if bot needs to submit
        const needsFirstItem = table.itemAnte.needsFirstItem();
        const hasSubmitted = table.itemAnte.hasSubmitted(bot.id);
        
        if (!needsFirstItem && hasSubmitted) {
            return; // Bot already submitted
        }
        
        // Get test items for the bot (bots don't have real inventories)
        const Item = require('./Item');
        const testItems = [
            new Item({ ...Item.TEMPLATES.XP_BOOST_SMALL, obtainedFrom: 'Bot Test Items' }),
            new Item({ ...Item.TEMPLATES.CARD_BACK_FLAME, obtainedFrom: 'Bot Test Items' }),
            new Item({ ...Item.TEMPLATES.AVATAR_WOLF, obtainedFrom: 'Bot Test Items' }),
            new Item({ ...Item.TEMPLATES.TROPHY_FIRST_BOSS, obtainedFrom: 'Bot Test Items' })
        ];
        
        let selectedItem = null;
        
        if (needsFirstItem) {
            // First item - pick a common/uncommon item
            selectedItem = testItems.find(item => 
                item.rarity === 'common' || item.rarity === 'uncommon'
            ) || testItems[0];
            
            console.log(`[BotManager] ${bot.name} starting item ante with: ${selectedItem.name}`);
            const result = table.startItemAnte(bot.id, selectedItem);
            if (result.success) {
                console.log(`[BotManager] ${bot.name} started item ante successfully`);
            } else {
                console.error(`[BotManager] ${bot.name} failed to start item ante: ${result.error}`);
            }
        } else {
            // Subsequent item - must meet minimum value
            const minValue = table.itemAnte.minimumValue || 0;
            selectedItem = testItems.find(item => (item.baseValue || 0) >= minValue);
            
            if (!selectedItem) {
                // Use highest value item if none meet minimum
                selectedItem = testItems.reduce((max, item) => 
                    (item.baseValue || 0) > (max.baseValue || 0) ? item : max
                );
            }
            
            console.log(`[BotManager] ${bot.name} submitting item to ante: ${selectedItem.name} (value: ${selectedItem.baseValue})`);
            const result = table.submitToItemAnte(bot.id, selectedItem);
            if (result.success) {
                console.log(`[BotManager] ${bot.name} submitted item successfully`);
            } else {
                console.error(`[BotManager] ${bot.name} failed to submit item: ${result.error}`);
            }
        }
    }
    
    /**
     * Check all bots at a table and make them submit items for item ante (practice mode only)
     */
    checkBotsItemAnte(tableId) {
        const table = this.gameManager.tables.get(tableId);
        if (!table || !table.practiceMode || !table.itemAnteEnabled || table.gameStarted || !table.itemAnte) {
            return;
        }
        
        const tableBots = this.activeBots.get(tableId);
        if (!tableBots) return;
        
        for (const [seatIndex, bot] of tableBots) {
            const needsFirstItem = table.itemAnte.needsFirstItem();
            const hasSubmitted = table.itemAnte.hasSubmitted(bot.id);
            
            // Only handle if bot needs to submit and hasn't already
            if ((needsFirstItem || !hasSubmitted) && !bot.itemAnteHandled) {
                bot.itemAnteHandled = true; // Prevent duplicate handling
                this._handleBotItemAnte(tableId, seatIndex, bot);
            }
        }
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
     * Clear all pending bots for a table (used when resetting/restarting)
     */
    clearPendingBots(tableId) {
        const tablePending = this.pendingBots.get(tableId);
        if (tablePending) {
            tablePending.clear();
            console.log(`[BotManager] Cleared all pending bots for table ${tableId}`);
        }
    }
    
    /**
     * Check if current player is a bot and trigger their turn
     */
    checkBotTurn(tableId) {
        const table = this.gameManager.tables.get(tableId);
        
        // CRITICAL FIX #5: Validate game state before allowing bot actions
        if (!table) {
            console.error(`[BotManager] ⚠️ FIX #5: checkBotTurn called but table not found: ${tableId}`);
            return;
        }
        
        if (!table.gameStarted) {
            console.log(`[BotManager] [FIX #5] checkBotTurn: Game not started for table ${tableId}`);
            return;
        }
        
        // CRITICAL FIX #5: Don't trigger bot turns during non-betting phases
        const validPhases = ['preflop', 'flop', 'turn', 'river'];
        if (!validPhases.includes(table.phase)) {
            // Showdown, waiting, ready_up, countdown - bots don't act
            console.log(`[BotManager] [FIX #5] checkBotTurn: Invalid phase ${table.phase} for bot action`);
            return;
        }
        
        // CRITICAL FIX #4: Validate currentPlayerIndex is valid
        if (table.currentPlayerIndex === -1 || table.currentPlayerIndex === null || table.currentPlayerIndex === undefined) {
            console.log(`[BotManager] [FIX #4] checkBotTurn: No current player (currentPlayerIndex: ${table.currentPlayerIndex})`);
            return;
        }
        
        const currentSeat = table.seats[table.currentPlayerIndex];
        if (!currentSeat) {
            console.log(`[BotManager] [FIX #4] checkBotTurn: No seat at currentPlayerIndex ${table.currentPlayerIndex}`);
            return;
        }
        
        if (!currentSeat.isBot) {
            // Not a bot's turn - this is normal, just return
            return;
        }
        
        let tableBots = this.activeBots.get(tableId);
        if (!tableBots) {
            // CRITICAL FIX: If activeBots map doesn't exist, create it
            // This can happen after game restarts when activeBots was cleared
            tableBots = new Map();
            this.activeBots.set(tableId, tableBots);
            console.log(`[BotManager] Created new activeBots map for table ${tableId}`);
        }
        
        let bot = tableBots.get(table.currentPlayerIndex);
        if (!bot) {
            // CRITICAL FIX: Bot not in activeBots map - try to re-sync from seat
            // This can happen after game restarts when activeBots was cleared but bots are still in seats
            console.log(`[BotManager] Bot not found in activeBots for seat ${table.currentPlayerIndex} - attempting to re-sync`);
            
            // Try to find or recreate the bot from the seat
            const { createBot, BOT_PROFILES } = require('./BotPlayer');
            const botName = currentSeat.name;
            
            // Map bot names to profile keys (use BOT_PROFILES to find correct profile)
            let profileKey = null;
            for (const [key, profile] of Object.entries(BOT_PROFILES)) {
                if (profile.name === botName) {
                    profileKey = key;
                    break;
                }
            }
            
            if (!profileKey) {
                console.error(`[BotManager] Cannot re-sync bot ${botName} - unknown bot name`);
                return;
            }
            
            bot = createBot(profileKey);
            bot.chips = currentSeat.chips;
            bot.currentBet = currentSeat.currentBet;
            bot.cards = currentSeat.cards || [];
            bot.folded = currentSeat.isFolded;
            bot.allIn = currentSeat.isAllIn;
            
            // Add to activeBots map
            tableBots.set(table.currentPlayerIndex, bot);
            console.log(`[BotManager] Re-synced bot ${botName} at seat ${table.currentPlayerIndex} from seat data`);
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
                communityCards: table.communityCards,
                isSimulation: table.isSimulation || false  // Pass simulation flag to bot AI
            };
            
            console.log(`[BotManager] ${bot.name} deciding... phase=${table.phase}, currentBet=${table.currentBet}, botBet=${seat.currentBet}, pot=${table.pot}, isSimulation=${gameState.isSimulation}`);
            
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

