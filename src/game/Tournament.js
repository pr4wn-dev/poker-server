/**
 * Tournament - Multiplayer tournament system with entry requirements
 */

const { v4: uuidv4 } = require('uuid');

const TOURNAMENT_STATUS = {
    REGISTERING: 'registering',    // Accepting players
    STARTING: 'starting',          // About to start
    IN_PROGRESS: 'in_progress',    // Games running
    FINAL_TABLE: 'final_table',    // Down to last table
    COMPLETED: 'completed',        // Winner determined
    CANCELLED: 'cancelled'         // Not enough players
};

const TOURNAMENT_TYPE = {
    SIT_N_GO: 'sit_n_go',          // Starts when full
    SCHEDULED: 'scheduled',        // Starts at set time
    FREEROLL: 'freeroll',          // Free entry
    SATELLITE: 'satellite'         // Winner gets entry to bigger tournament
};

class Tournament {
    constructor(options) {
        this.id = options.id || uuidv4();
        this.name = options.name || 'Tournament';
        this.areaId = options.areaId;
        this.type = options.type || TOURNAMENT_TYPE.SIT_N_GO;
        this.status = TOURNAMENT_STATUS.REGISTERING;
        
        // Structure
        this.minPlayers = options.minPlayers || 6;
        this.maxPlayers = options.maxPlayers || 9;
        this.startingChips = options.startingChips || 10000;
        this.blindLevels = options.blindLevels || Tournament.DEFAULT_BLIND_LEVELS;
        this.blindLevelMinutes = options.blindLevelMinutes || 10;
        this.currentBlindLevel = 0;
        
        // Entry Requirements
        this.entryFee = options.entryFee || 0;              // Chips to enter
        this.minLevel = options.minLevel || 1;              // Minimum XP level
        this.minChips = options.minChips || 0;              // Must have this many chips (not entry fee)
        this.requiredItems = options.requiredItems || [];    // Items needed to enter (templateIds)
        this.sidePotRequired = options.sidePotRequired || false;  // Must contribute to side pot
        this.sidePotMinRarity = options.sidePotMinRarity || null; // Minimum item rarity for side pot
        
        // Prize Pool
        this.prizePool = 0;
        this.xpPrizePool = options.xpPrizePool || 0;        // XP awarded to top players
        this.itemPrizes = options.itemPrizes || [];         // Guaranteed item prizes
        this.payoutStructure = options.payoutStructure || Tournament.DEFAULT_PAYOUTS;
        
        // Participants
        this.registeredPlayers = new Map();  // oderId -> { oderId, username, entryTime, seatAssignment }
        this.sidePotItems = new Map();       // oderId -> item
        this.eliminatedPlayers = [];         // Order of elimination (first out = last)
        
        // Timing
        this.scheduledStart = options.scheduledStart || null;
        this.startedAt = null;
        this.endedAt = null;
        this.registrationDeadline = options.registrationDeadline || null;
        
        // Tables (for multi-table tournaments)
        this.tables = new Map();  // tableId -> Table
        this.playerTableAssignments = new Map();  // oderId -> tableId
        
        this.createdAt = Date.now();
    }
    
    /**
     * Check if a player can enter this tournament
     */
    canEnter(userProfile, userInventory) {
        const reasons = [];
        
        // Check status
        if (this.status !== TOURNAMENT_STATUS.REGISTERING) {
            return { canEnter: false, reason: 'Tournament is not accepting registrations' };
        }
        
        // Check capacity
        if (this.registeredPlayers.size >= this.maxPlayers) {
            return { canEnter: false, reason: 'Tournament is full' };
        }
        
        // Check already registered
        if (this.registeredPlayers.has(userProfile.id)) {
            return { canEnter: false, reason: 'Already registered for this tournament' };
        }
        
        // Check XP level
        if (userProfile.level < this.minLevel) {
            reasons.push(`Level ${this.minLevel} required (you are Level ${userProfile.level})`);
        }
        
        // Check chips for entry fee
        if (userProfile.chips < this.entryFee) {
            reasons.push(`${this.entryFee} chips entry fee required (you have ${userProfile.chips})`);
        }
        
        // Check minimum chip balance
        if (userProfile.chips < this.minChips) {
            reasons.push(`${this.minChips} chips minimum balance required`);
        }
        
        // Check required items
        for (const requiredItemId of this.requiredItems) {
            const hasItem = userInventory.some(i => i.templateId === requiredItemId);
            if (!hasItem) {
                reasons.push(`Requires item: ${requiredItemId}`);
            }
        }
        
        // Check side pot requirement
        if (this.sidePotRequired) {
            const eligibleItems = this.getEligibleSidePotItems(userInventory);
            if (eligibleItems.length === 0) {
                const rarityText = this.sidePotMinRarity ? ` (${this.sidePotMinRarity}+ rarity)` : '';
                reasons.push(`Side pot entry required${rarityText} - no eligible items`);
            }
        }
        
        if (reasons.length > 0) {
            return { canEnter: false, reasons };
        }
        
        return { canEnter: true };
    }
    
    /**
     * Get items eligible for side pot from inventory
     */
    getEligibleSidePotItems(inventory) {
        const rarityOrder = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
        const minRarityIndex = this.sidePotMinRarity 
            ? rarityOrder.indexOf(this.sidePotMinRarity.toLowerCase())
            : 0;
        
        return inventory.filter(item => {
            if (!item.isGambleable) return false;
            const itemRarityIndex = rarityOrder.indexOf(item.rarity?.toLowerCase() || 'common');
            return itemRarityIndex >= minRarityIndex;
        });
    }
    
    /**
     * Register a player for the tournament
     */
    register(userId, username, sidePotItem = null) {
        if (this.registeredPlayers.has(userId)) {
            return { success: false, error: 'Already registered' };
        }
        
        if (this.registeredPlayers.size >= this.maxPlayers) {
            return { success: false, error: 'Tournament is full' };
        }
        
        // Validate side pot item if required
        if (this.sidePotRequired && !sidePotItem) {
            return { success: false, error: 'Side pot item required for entry' };
        }
        
        this.registeredPlayers.set(userId, {
            oderId: oderId,
            username,
            entryTime: Date.now(),
            seatAssignment: null,
            isEliminated: false
        });
        
        if (sidePotItem) {
            this.sidePotItems.set(userId, sidePotItem);
        }
        
        this.prizePool += this.entryFee;
        
        console.log(`[Tournament] ${username} registered for ${this.name} (${this.registeredPlayers.size}/${this.maxPlayers})`);
        
        // Auto-start sit-n-go when full
        if (this.type === TOURNAMENT_TYPE.SIT_N_GO && 
            this.registeredPlayers.size >= this.maxPlayers) {
            this.start();
        }
        
        return { 
            success: true, 
            position: this.registeredPlayers.size,
            totalRegistered: this.registeredPlayers.size
        };
    }
    
    /**
     * Unregister a player (before tournament starts)
     */
    unregister(userId) {
        if (this.status !== TOURNAMENT_STATUS.REGISTERING) {
            return { success: false, error: 'Cannot unregister after tournament starts' };
        }
        
        if (!this.registeredPlayers.has(userId)) {
            return { success: false, error: 'Not registered' };
        }
        
        this.registeredPlayers.delete(userId);
        
        // Return side pot item
        const sidePotItem = this.sidePotItems.get(userId);
        this.sidePotItems.delete(userId);
        
        // Refund entry fee
        this.prizePool -= this.entryFee;
        
        return { 
            success: true, 
            refundChips: this.entryFee,
            returnedItem: sidePotItem
        };
    }
    
    /**
     * Start the tournament
     */
    start() {
        if (this.registeredPlayers.size < this.minPlayers) {
            return { success: false, error: 'Not enough players' };
        }
        
        this.status = TOURNAMENT_STATUS.IN_PROGRESS;
        this.startedAt = Date.now();
        
        // Assign seats
        this.assignSeats();
        
        console.log(`[Tournament] ${this.name} started with ${this.registeredPlayers.size} players!`);
        
        return { success: true };
    }
    
    /**
     * Assign players to tables/seats
     */
    assignSeats() {
        const players = Array.from(this.registeredPlayers.keys());
        
        // Shuffle for random seating
        for (let i = players.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [players[i], players[j]] = [players[j], players[i]];
        }
        
        // For single table, just assign seats
        players.forEach((userId, index) => {
            const player = this.registeredPlayers.get(userId);
            player.seatAssignment = index;
        });
    }
    
    /**
     * Eliminate a player
     */
    eliminatePlayer(userId) {
        const player = this.registeredPlayers.get(userId);
        if (!player) return { success: false, error: 'Player not found' };
        
        player.isEliminated = true;
        this.eliminatedPlayers.unshift(userId);  // Add to front (last out = first in array)
        
        const remaining = this.getRemainingPlayers();
        
        console.log(`[Tournament] ${player.username} eliminated from ${this.name} (${remaining.length} remaining)`);
        
        // Check if tournament is over
        if (remaining.length === 1) {
            this.complete(remaining[0]);
        }
        
        return { 
            success: true, 
            position: this.eliminatedPlayers.length + 1,
            remaining: remaining.length
        };
    }
    
    /**
     * Get remaining active players
     */
    getRemainingPlayers() {
        return Array.from(this.registeredPlayers.entries())
            .filter(([_, player]) => !player.isEliminated)
            .map(([userId, _]) => userId);
    }
    
    /**
     * Complete the tournament
     */
    complete(winnerId) {
        this.status = TOURNAMENT_STATUS.COMPLETED;
        this.endedAt = Date.now();
        
        // Calculate payouts
        const payouts = this.calculatePayouts();
        
        console.log(`[Tournament] ${this.name} completed! Winner: ${this.registeredPlayers.get(winnerId)?.username}`);
        
        return {
            status: 'completed',
            winner: winnerId,
            payouts
        };
    }
    
    /**
     * Calculate prize payouts based on finishing positions
     */
    calculatePayouts() {
        const payouts = [];
        const finishOrder = [
            ...this.getRemainingPlayers(),  // Winner (should be 1)
            ...this.eliminatedPlayers       // Eliminated in reverse order
        ];
        
        for (let i = 0; i < finishOrder.length; i++) {
            const userId = finishOrder[i];
            const position = i + 1;
            const payoutPercent = this.payoutStructure[position] || 0;
            const chips = Math.floor(this.prizePool * payoutPercent / 100);
            const xp = Math.floor(this.xpPrizePool * payoutPercent / 100);
            
            payouts.push({
                userId: userId,
                position,
                chips,
                xp,
                itemPrize: this.itemPrizes[i] || null
            });
        }
        
        // Side pot winner gets all items
        if (this.sidePotItems.size > 0 && finishOrder.length > 0) {
            payouts[0].sidePotItems = Array.from(this.sidePotItems.values());
        }
        
        return payouts;
    }
    
    /**
     * Get public tournament info
     */
    getPublicInfo() {
        return {
            id: this.id,
            name: this.name,
            areaId: this.areaId,
            type: this.type,
            status: this.status,
            registeredCount: this.registeredPlayers.size,
            minPlayers: this.minPlayers,
            maxPlayers: this.maxPlayers,
            startingChips: this.startingChips,
            entryFee: this.entryFee,
            minLevel: this.minLevel,
            minChips: this.minChips,
            requiredItems: this.requiredItems,
            sidePotRequired: this.sidePotRequired,
            sidePotMinRarity: this.sidePotMinRarity,
            prizePool: this.prizePool,
            xpPrizePool: this.xpPrizePool,
            scheduledStart: this.scheduledStart,
            currentBlindLevel: this.currentBlindLevel,
            blinds: this.blindLevels[this.currentBlindLevel]
        };
    }
    
    /**
     * Get detailed state for participants
     */
    getState() {
        return {
            ...this.getPublicInfo(),
            players: Array.from(this.registeredPlayers.entries()).map(([id, p]) => ({
                oderId: id,
                username: p.username,
                isEliminated: p.isEliminated,
                seatAssignment: p.seatAssignment
            })),
            sidePotItems: this.sidePotRequired 
                ? Array.from(this.sidePotItems.entries()).map(([id, item]) => ({
                    oderId: id,
                    item: item
                }))
                : null,
            eliminatedCount: this.eliminatedPlayers.length,
            payoutStructure: this.payoutStructure
        };
    }
}

// Default blind structure
Tournament.DEFAULT_BLIND_LEVELS = [
    { small: 25, big: 50, ante: 0 },
    { small: 50, big: 100, ante: 0 },
    { small: 75, big: 150, ante: 0 },
    { small: 100, big: 200, ante: 25 },
    { small: 150, big: 300, ante: 25 },
    { small: 200, big: 400, ante: 50 },
    { small: 300, big: 600, ante: 75 },
    { small: 400, big: 800, ante: 100 },
    { small: 500, big: 1000, ante: 100 },
    { small: 750, big: 1500, ante: 150 },
    { small: 1000, big: 2000, ante: 200 },
    { small: 1500, big: 3000, ante: 300 },
    { small: 2000, big: 4000, ante: 400 },
    { small: 3000, big: 6000, ante: 500 },
    { small: 5000, big: 10000, ante: 1000 }
];

// Default payout structure (percentage of prize pool)
Tournament.DEFAULT_PAYOUTS = {
    1: 50,   // 1st place: 50%
    2: 30,   // 2nd place: 30%
    3: 20    // 3rd place: 20%
};

Tournament.STATUS = TOURNAMENT_STATUS;
Tournament.TYPE = TOURNAMENT_TYPE;

module.exports = Tournament;

