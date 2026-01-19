/**
 * Table - Represents a poker table with game state
 */

const Deck = require('./Deck');
const HandEvaluator = require('./HandEvaluator');
const SidePot = require('./SidePot');

const GAME_PHASES = {
    WAITING: 'waiting',
    READY_UP: 'ready_up',    // New: waiting for players to click ready
    COUNTDOWN: 'countdown',   // New: final 10-second countdown before start
    PRE_FLOP: 'preflop',
    FLOP: 'flop',
    TURN: 'turn',
    RIVER: 'river',
    SHOWDOWN: 'showdown'
};

const ACTIONS = {
    FOLD: 'fold',
    CHECK: 'check',
    CALL: 'call',
    BET: 'bet',
    RAISE: 'raise',
    ALL_IN: 'allin'
};

class Table {
    constructor(options) {
        this.id = options.id;
        this.name = options.name;
        this.maxPlayers = options.maxPlayers;
        this.smallBlind = options.smallBlind;
        this.bigBlind = options.bigBlind;
        this.isPrivate = options.isPrivate;
        
        // Buy-in amount (chips required to join)
        this.buyIn = options.buyIn || 20000000; // Default 20 million
        
        // Practice mode: players without enough chips get loaned the buy-in
        // but don't keep any winnings
        this.practiceMode = options.practiceMode || false;
        this.practiceModePlayers = new Set(); // Track player IDs who are playing for practice
        
        // New: Password protection
        this.password = options.password || null;
        this.hasPassword = !!options.password;
        
        // New: Creator/Host
        this.creatorId = options.creatorId || null;
        this.createdAt = Date.now();
        
        // New: House Rules
        this.houseRules = options.houseRules || null;
        
        // New: Spectators
        this.spectators = new Map();  // oderId -> { oderId, name, socketId }
        this.maxSpectators = options.maxSpectators || 20;
        this.allowSpectators = options.allowSpectators !== false;
        
        // New: Pending invites (friends invited before game starts)
        this.pendingInvites = new Set();  // Set of userIds

        // Seats: array of player objects or null
        this.seats = new Array(this.maxPlayers).fill(null);
        
        // Game state
        this.phase = GAME_PHASES.WAITING;
        this.deck = new Deck();
        this.communityCards = [];
        this.pot = 0;
        this.sidePots = [];
        this.currentBet = 0;
        this.minRaise = this.bigBlind;
        
        // Track if game has started (for spectator-only joins)
        this.gameStarted = false;
        this.handsPlayed = 0;
        
        // Item side pot (optional gambling)
        this.itemSidePot = new SidePot(this.id, this.creatorId);
        this.sidePotCollectionTime = options.sidePotCollectionTime || 60000; // 60 seconds default

        // Position tracking
        this.dealerIndex = -1;
        this.currentPlayerIndex = -1;
        this.lastRaiserIndex = -1;

        // Timing
        this.turnTimeout = null;
        this.turnStartTime = null;
        this.turnTimeLimit = options.turnTimeLimit || 20000; // 20 seconds per turn (default)
        
        // Blind increase timer (tournament-style)
        // 0 = disabled (blinds never increase)
        // otherwise = time in milliseconds between blind increases (default 20 minutes)
        this.blindIncreaseInterval = options.blindIncreaseInterval || 0; // 0 = disabled
        this.initialSmallBlind = this.smallBlind;
        this.initialBigBlind = this.bigBlind;
        this.blindLevel = 1; // Current blind level (1 = starting blinds)
        this.nextBlindIncreaseAt = null; // Timestamp when blinds will next increase
        this.blindIncreaseTimer = null; // Timer handle
        
        // Game start countdown timer
        this.startCountdown = null;
        this.startCountdownTime = null;
        this.countdownInterval = null;
        this.startDelaySeconds = options.startDelaySeconds || 10; // 10 seconds final countdown
        
        // Ready-up system
        this.readyUpActive = false;
        this.readyUpStartTime = null;
        this.readyUpTimeout = null;
        this.readyUpDuration = options.readyUpDuration || 60000; // 1 minute to ready up
        this.readyUpInterval = null;
        
        // Event callbacks (set by SocketHandler)
        this.onStateChange = null;  // Called when state changes, for broadcasting
        this.onAutoFold = null;     // Called when player auto-folds on timeout
        this.onCountdownUpdate = null; // Called when countdown changes
        this.onReadyPrompt = null;  // Called when ready prompt should show
        this.onPlayerNotReady = null; // Called when player doesn't ready in time
        this.onPlayerAction = null; // Called when any player (human or bot) takes an action
    }
    
    // ============ Game Start Countdown ============
    
    // Called when players leave - cancels any active countdown/ready-up if not enough players
    checkStartCountdown() {
        const activePlayers = this.getActivePlayerCount();
        
        if (this.gameStarted) {
            return;
        }
        
        // Only used to CANCEL countdowns when players leave
        // Game start is now triggered by table creator clicking START GAME
        if (activePlayers < 2) {
            // Cancel any active countdown or ready-up phase
            if (this.startCountdown) {
                console.log(`[Table ${this.name}] Countdown cancelled - only ${activePlayers} player(s)`);
                clearTimeout(this.startCountdown);
                if (this.countdownInterval) {
                    clearInterval(this.countdownInterval);
                    this.countdownInterval = null;
                }
                this.startCountdown = null;
                this.startCountdownTime = null;
                this.onCountdownUpdate?.();
            }
            
            // Also cancel ready-up phase if active
            if (this.phase === GAME_PHASES.READY_UP || this.phase === GAME_PHASES.COUNTDOWN) {
                console.log(`[Table ${this.name}] Ready-up cancelled - only ${activePlayers} player(s)`);
                this.clearReadyUpTimer();
                this.phase = GAME_PHASES.WAITING;
                this.readyPlayers.clear();
            }
            
            this.onStateChange?.();
        }
    }
    
    getStartCountdownRemaining() {
        if (!this.startCountdownTime || !this.startCountdown) return 0; // Return 0 instead of null for Unity
        const elapsed = Date.now() - this.startCountdownTime;
        const remaining = Math.max(0, (this.startDelaySeconds * 1000) - elapsed);
        return Math.ceil(remaining / 1000); // Return seconds, rounded up
    }
    
    // ============ Ready-Up System ============
    
    /**
     * Called when table creator clicks "Start Game"
     * Initiates the ready-up phase where all players must confirm
     */
    startReadyUp(creatorId) {
        if (this.phase !== GAME_PHASES.WAITING) {
            return { success: false, error: 'Game already in progress' };
        }
        
        if (this.creatorId !== creatorId) {
            return { success: false, error: 'Only the table creator can start the game' };
        }
        
        const playerCount = this.getActivePlayerCount();
        if (playerCount < 2) {
            return { success: false, error: 'Need at least 2 players to start' };
        }
        
        console.log(`[Table ${this.name}] Ready-up phase started by creator`);
        
        this.phase = GAME_PHASES.READY_UP;
        this.readyUpActive = true;
        this.readyUpStartTime = Date.now();
        
        // Mark all players as not ready initially (except bots - they're always ready)
        for (const seat of this.seats) {
            if (seat) {
                seat.isReady = seat.isBot ? true : false;
            }
        }
        
        // Start 1-minute ready-up timer
        this.readyUpTimeout = setTimeout(() => {
            this.handleReadyUpTimeout();
        }, this.readyUpDuration);
        
        // Broadcast updates every second
        this.readyUpInterval = setInterval(() => {
            this.onStateChange?.();
        }, 1000);
        
        // Notify all players to show ready prompt
        this.onReadyPrompt?.();
        this.onStateChange?.();
        
        // Check if all already ready (all bots case)
        this.checkAllReady();
        
        return { success: true };
    }
    
    /**
     * Called when a player clicks "Ready"
     */
    playerReady(playerId) {
        if (this.phase !== GAME_PHASES.READY_UP && this.phase !== GAME_PHASES.COUNTDOWN) {
            return { success: false, error: 'Not in ready-up phase' };
        }
        
        const seat = this.seats.find(s => s && s.playerId === playerId);
        if (!seat) {
            return { success: false, error: 'Player not found at table' };
        }
        
        if (seat.isReady) {
            return { success: false, error: 'Already ready' };
        }
        
        seat.isReady = true;
        console.log(`[Table ${this.name}] ${seat.name} is ready!`);
        
        this.onStateChange?.();
        this.checkAllReady();
        
        return { success: true };
    }
    
    /**
     * Check if all players are ready - if so, start final countdown
     */
    checkAllReady() {
        if (this.phase !== GAME_PHASES.READY_UP) return;
        
        const allReady = this.seats.every(s => !s || s.isReady);
        
        if (allReady) {
            console.log(`[Table ${this.name}] All players ready! Starting final countdown`);
            this.startFinalCountdown();
        }
    }
    
    /**
     * Called when 1-minute ready-up time expires
     * Starts the 10-second final countdown
     */
    handleReadyUpTimeout() {
        if (this.phase !== GAME_PHASES.READY_UP) return;
        
        console.log(`[Table ${this.name}] Ready-up time expired, starting final countdown`);
        this.startFinalCountdown();
    }
    
    /**
     * Start the 10-second final countdown
     * Players who haven't readied will become spectators when game starts
     */
    startFinalCountdown() {
        // Clear ready-up timers
        if (this.readyUpTimeout) {
            clearTimeout(this.readyUpTimeout);
            this.readyUpTimeout = null;
        }
        if (this.readyUpInterval) {
            clearInterval(this.readyUpInterval);
            this.readyUpInterval = null;
        }
        
        this.phase = GAME_PHASES.COUNTDOWN;
        this.startCountdownTime = Date.now();
        
        console.log(`[Table ${this.name}] Final ${this.startDelaySeconds}s countdown started`);
        
        // Broadcast countdown updates every second
        this.countdownInterval = setInterval(() => {
            const remaining = this.getStartCountdownRemaining();
            if (remaining > 0) {
                this.onStateChange?.();
            }
        }, 1000);
        
        // Start final countdown
        this.startCountdown = setTimeout(() => {
            if (this.countdownInterval) {
                clearInterval(this.countdownInterval);
                this.countdownInterval = null;
            }
            this.startCountdown = null;
            this.startCountdownTime = null;
            
            this.handleGameStart();
        }, this.startDelaySeconds * 1000);
        
        this.onStateChange?.();
    }
    
    /**
     * Handle game start - convert non-ready players to spectators
     */
    handleGameStart() {
        console.log(`[Table ${this.name}] Countdown complete, processing ready status...`);
        
        // Convert non-ready players to spectators
        for (let i = 0; i < this.seats.length; i++) {
            const seat = this.seats[i];
            if (seat && !seat.isReady && !seat.isBot) {
                console.log(`[Table ${this.name}] ${seat.name} was not ready - moving to spectators`);
                
                // Add to spectators
                this.spectators.set(seat.playerId, {
                    oderId: seat.playerId,
                    name: seat.name,
                    socketId: seat.socketId
                });
                
                // Notify the player they're now spectating
                this.onPlayerNotReady?.(seat.playerId, seat.name);
                
                // Remove from seat
                this.seats[i] = null;
            }
        }
        
        // Check if we still have enough players
        const readyPlayers = this.seats.filter(s => s && s.isReady);
        if (readyPlayers.length < 2) {
            console.log(`[Table ${this.name}] Not enough ready players, returning to waiting`);
            this.phase = GAME_PHASES.WAITING;
            this.readyUpActive = false;
            this.onStateChange?.();
            return;
        }
        
        // Start the game!
        console.log(`[Table ${this.name}] Starting game with ${readyPlayers.length} players!`);
        this.startNewHand();
        this.onStateChange?.();
    }
    
    /**
     * Get time remaining in ready-up phase (in seconds)
     */
    getReadyUpTimeRemaining() {
        if (!this.readyUpStartTime || this.phase !== GAME_PHASES.READY_UP) return 0;
        const elapsed = Date.now() - this.readyUpStartTime;
        const remaining = Math.max(0, this.readyUpDuration - elapsed);
        return Math.ceil(remaining / 1000);
    }
    
    /**
     * Get count of ready players
     */
    getReadyPlayerCount() {
        return this.seats.filter(s => s && s.isReady).length;
    }
    
    /**
     * Handle a player joining during ready-up phase
     */
    handleLateJoinerDuringReadyUp(seat) {
        if (this.phase === GAME_PHASES.READY_UP || this.phase === GAME_PHASES.COUNTDOWN) {
            // New joiners are not ready by default (unless bot)
            seat.isReady = seat.isBot ? true : false;
            console.log(`[Table ${this.name}] Late joiner ${seat.name} - needs to ready up`);
        }
    }
    
    // ============ Turn Timer ============
    
    startTurnTimer() {
        this.clearTurnTimer();
        
        if (this.currentPlayerIndex < 0) return;
        
        this.turnStartTime = Date.now();
        
        this.turnTimeout = setTimeout(() => {
            this.handleTurnTimeout();
        }, this.turnTimeLimit);
    }
    
    clearTurnTimer() {
        if (this.turnTimeout) {
            clearTimeout(this.turnTimeout);
            this.turnTimeout = null;
        }
        this.turnStartTime = null;
    }
    
    getTurnTimeRemaining() {
        if (!this.turnStartTime || this.currentPlayerIndex < 0) return 0; // Return 0 instead of null for Unity
        const elapsed = Date.now() - this.turnStartTime;
        const remaining = Math.max(0, this.turnTimeLimit - elapsed);
        return remaining / 1000; // Return seconds
    }
    
    handleTurnTimeout() {
        const player = this.seats[this.currentPlayerIndex];
        if (!player) return;
        
        console.log(`[Table ${this.name}] ${player.name} timed out - auto-folding`);
        
        // Auto-fold
        this.fold(this.currentPlayerIndex);
        
        // Notify via callback
        if (this.onAutoFold) {
            this.onAutoFold(player.playerId, this.currentPlayerIndex);
        }
        
        // Advance game
        this.advanceGame();
        
        // Notify state change
        if (this.onStateChange) {
            this.onStateChange();
        }
    }

    // ============ Blind Increase Timer ============
    
    startBlindTimer() {
        this.stopBlindTimer();
        
        if (this.blindIncreaseInterval <= 0) {
            return; // Blind increases disabled
        }
        
        this.nextBlindIncreaseAt = Date.now() + this.blindIncreaseInterval;
        
        this.blindIncreaseTimer = setTimeout(() => {
            this.increaseBlinds();
        }, this.blindIncreaseInterval);
        
        console.log(`[Table ${this.name}] Blind timer started - next increase in ${this.blindIncreaseInterval / 60000} minutes`);
    }
    
    stopBlindTimer() {
        if (this.blindIncreaseTimer) {
            clearTimeout(this.blindIncreaseTimer);
            this.blindIncreaseTimer = null;
        }
        this.nextBlindIncreaseAt = null;
    }
    
    getBlindTimeRemaining() {
        if (!this.nextBlindIncreaseAt || this.blindIncreaseInterval <= 0) {
            return -1; // Disabled or not running
        }
        const remaining = Math.max(0, this.nextBlindIncreaseAt - Date.now());
        return Math.ceil(remaining / 1000); // Return seconds
    }
    
    increaseBlinds() {
        // Double the blinds
        this.blindLevel++;
        this.smallBlind = this.smallBlind * 2;
        this.bigBlind = this.bigBlind * 2;
        this.minRaise = this.bigBlind;
        
        console.log(`[Table ${this.name}] BLINDS INCREASED to Level ${this.blindLevel}: ${this.smallBlind}/${this.bigBlind}`);
        
        // Notify via callback
        this.onBlindsIncrease?.({
            level: this.blindLevel,
            smallBlind: this.smallBlind,
            bigBlind: this.bigBlind
        });
        
        // Broadcast state change
        this.onStateChange?.();
        
        // Schedule next increase
        this.startBlindTimer();
    }

    // ============ Player Management ============

    addPlayer(playerId, name, chips, preferredSeat = null) {
        let seatIndex = preferredSeat;

        if (seatIndex !== null) {
            if (this.seats[seatIndex] !== null) {
                return { success: false, error: 'Seat taken' };
            }
        } else {
            seatIndex = this.seats.findIndex(seat => seat === null);
            if (seatIndex === -1) {
                return { success: false, error: 'Table full' };
            }
        }

        const seat = {
            playerId,
            name,
            chips,
            cards: [],
            currentBet: 0,
            totalBet: 0,
            isActive: true,
            isFolded: false,
            isAllIn: false,
            isConnected: true,
            isReady: false  // New: ready-up status
        };
        
        this.seats[seatIndex] = seat;

        console.log(`[Table ${this.name}] ${name} joined at seat ${seatIndex}`);

        // Handle late joiner during ready-up phase
        this.handleLateJoinerDuringReadyUp(seat);

        return { success: true, seatIndex };
    }

    removePlayer(playerId) {
        const seatIndex = this.seats.findIndex(s => s?.playerId === playerId);
        if (seatIndex === -1) return null;

        const player = this.seats[seatIndex];
        const chips = player.chips;
        const wasCurrentPlayer = this.currentPlayerIndex === seatIndex;
        const wasInGame = this.phase !== GAME_PHASES.WAITING && 
                          this.phase !== GAME_PHASES.READY_UP && 
                          this.phase !== GAME_PHASES.COUNTDOWN;
        
        console.log(`[Table ${this.name}] ${player.name} left`);

        // Handle mid-game removal - fold BEFORE removing from seat
        if (wasInGame && wasCurrentPlayer) {
            // Clear turn timer first
            this.clearTurnTimer();
            
            // Mark as folded and remove
            player.isFolded = true;
            player.isActive = false;
            this.seats[seatIndex] = null;
            
            // Advance the game manually since the player is gone
            console.log(`[Table ${this.name}] Player left during their turn - advancing game`);
            this.advanceGame();
        } else {
            // Not their turn - just remove
            this.seats[seatIndex] = null;
        }

        // Check if countdown should be cancelled (not enough players)
        this.checkStartCountdown();
        
        // Broadcast state change
        this.onStateChange?.();

        return chips;
    }

    getActivePlayerCount() {
        return this.seats.filter(s => s !== null && s.isActive && !s.isFolded).length;
    }

    getSeatedPlayerCount() {
        return this.seats.filter(s => s !== null).length;
    }

    // ============ Game Flow ============

    startNewHand() {
        if (this.getSeatedPlayerCount() < 2) {
            this.phase = GAME_PHASES.WAITING;
            return;
        }
        
        // Check if only one player has chips (game over!)
        const playersWithChips = this.seats.filter(s => s && s.chips > 0);
        if (playersWithChips.length === 1) {
            const winner = playersWithChips[0];
            console.log(`[Table ${this.name}] GAME OVER - ${winner.name} wins with ${winner.chips} chips!`);
            this.phase = GAME_PHASES.WAITING;
            this.gameStarted = false;
            
            // Notify about game winner
            if (this.onGameOver) {
                this.onGameOver(winner);
            }
            this.onStateChange?.();
            return;
        }
        
        // Remove players with no chips
        for (let i = 0; i < this.seats.length; i++) {
            const seat = this.seats[i];
            if (seat && seat.chips <= 0 && !seat.isBot) {
                console.log(`[Table ${this.name}] ${seat.name} is out of chips`);
                // Don't remove human players - let them rebuy or leave
            } else if (seat && seat.chips <= 0 && seat.isBot) {
                console.log(`[Table ${this.name}] Bot ${seat.name} eliminated`);
                this.seats[i] = null;
            }
        }

        console.log(`[Table ${this.name}] Starting new hand`);
        
        // Lock side pot if it was collecting (first hand only)
        if (!this.gameStarted) {
            this.gameStarted = true;
            this.lockSidePot();
            // Start blind increase timer if enabled
            this.startBlindTimer();
        }

        // Reset state
        this.deck.shuffle();
        this.communityCards = [];
        this.pot = 0;
        this.sidePots = [];
        this.currentBet = 0;
        this.minRaise = this.bigBlind;

        // Reset players
        for (const seat of this.seats) {
            if (seat) {
                seat.cards = [];
                seat.currentBet = 0;
                seat.totalBet = 0;
                seat.isActive = seat.chips > 0;
                seat.isFolded = false;
                seat.isAllIn = false;
            }
        }

        // Move dealer button
        this.dealerIndex = this.getNextActivePlayer(this.dealerIndex);
        
        // Post blinds
        const sbIndex = this.getNextActivePlayer(this.dealerIndex);
        const bbIndex = this.getNextActivePlayer(sbIndex);
        
        this.postBlind(sbIndex, this.smallBlind);
        this.postBlind(bbIndex, this.bigBlind);
        this.currentBet = this.bigBlind;

        // Deal hole cards
        for (const seat of this.seats) {
            if (seat?.isActive) {
                seat.cards = [this.deck.draw(), this.deck.draw()];
            }
        }

        // Set first player (after big blind)
        this.currentPlayerIndex = this.getNextActivePlayer(bbIndex);
        this.lastRaiserIndex = bbIndex;
        this.phase = GAME_PHASES.PRE_FLOP;
        this.handsPlayed++;
        
        // Debug: Log who's turn it is
        const firstPlayer = this.seats[this.currentPlayerIndex];
        console.log(`[Table ${this.name}] Hand started - First to act: ${firstPlayer?.name} (seat ${this.currentPlayerIndex}, isBot: ${firstPlayer?.isBot})`);
        
        // Start turn timer
        this.startTurnTimer();
        
        // Broadcast state for new hand
        this.onStateChange?.();

        return this.getState();
    }

    postBlind(seatIndex, amount) {
        const player = this.seats[seatIndex];
        if (!player) return;

        const blindAmount = Math.min(amount, player.chips);
        player.chips -= blindAmount;
        player.currentBet = blindAmount;
        player.totalBet = blindAmount;
        this.pot += blindAmount;

        if (player.chips === 0) {
            player.isAllIn = true;
        }
    }

    getNextActivePlayer(fromIndex) {
        let index = fromIndex;
        for (let i = 0; i < this.maxPlayers; i++) {
            index = (index + 1) % this.maxPlayers;
            const seat = this.seats[index];
            if (seat && seat.isActive && !seat.isFolded && !seat.isAllIn) {
                return index;
            }
        }
        return -1;
    }

    // ============ Actions ============

    handleAction(playerId, action, amount = 0) {
        const seatIndex = this.seats.findIndex(s => s?.playerId === playerId);
        if (seatIndex === -1 || seatIndex !== this.currentPlayerIndex) {
            return { success: false, error: 'Not your turn' };
        }

        const player = this.seats[seatIndex];
        const toCall = this.currentBet - player.currentBet;

        let result = { success: false, error: 'Invalid action' };

        switch (action) {
            case ACTIONS.FOLD:
                result = this.fold(seatIndex);
                break;
            case ACTIONS.CHECK:
                result = toCall === 0 ? this.check(seatIndex) : { success: false, error: 'Cannot check' };
                break;
            case ACTIONS.CALL:
                result = this.call(seatIndex);
                break;
            case ACTIONS.BET:
                result = this.currentBet === 0 ? this.bet(seatIndex, amount) : { success: false, error: 'Use raise' };
                break;
            case ACTIONS.RAISE:
                result = this.raise(seatIndex, amount);
                break;
            case ACTIONS.ALL_IN:
                result = this.allIn(seatIndex);
                break;
        }

        if (result.success) {
            this.clearTurnTimer();
            
            // Notify about the action (for all players including bots)
            this.onPlayerAction?.(playerId, result.action, result.amount || 0);
            
            this.advanceGame();
        }

        return result;
    }

    fold(seatIndex) {
        this.seats[seatIndex].isFolded = true;
        return { success: true, action: 'fold' };
    }

    check(seatIndex) {
        return { success: true, action: 'check' };
    }

    call(seatIndex) {
        const player = this.seats[seatIndex];
        const toCall = Math.min(this.currentBet - player.currentBet, player.chips);
        
        player.chips -= toCall;
        player.currentBet += toCall;
        player.totalBet += toCall;
        this.pot += toCall;

        if (player.chips === 0) {
            player.isAllIn = true;
        }

        return { success: true, action: 'call', amount: toCall };
    }

    bet(seatIndex, amount) {
        const player = this.seats[seatIndex];
        
        if (amount < this.bigBlind || amount > player.chips) {
            return { success: false, error: 'Invalid bet amount' };
        }

        player.chips -= amount;
        player.currentBet = amount;
        player.totalBet += amount;
        this.pot += amount;
        this.currentBet = amount;
        this.minRaise = amount;
        this.lastRaiserIndex = seatIndex;

        if (player.chips === 0) {
            player.isAllIn = true;
        }

        return { success: true, action: 'bet', amount };
    }

    raise(seatIndex, amount) {
        const player = this.seats[seatIndex];
        const toCall = this.currentBet - player.currentBet;
        const raiseAmount = amount - toCall;

        // FIX: Validate that raise amount is actually a raise (more than minRaise) or all-in
        // If amount equals toCall, treat as call, not raise
        if (raiseAmount <= 0) {
            // Amount is just the call amount - treat as call instead
            return this.call(seatIndex);
        }

        if (raiseAmount < this.minRaise && amount !== player.chips) {
            return { success: false, error: `Minimum raise is ${this.minRaise}. You need to bet at least ${toCall + this.minRaise} total.` };
        }

        player.chips -= amount;
        player.currentBet += amount;
        player.totalBet += amount;
        this.pot += amount;
        this.currentBet = player.currentBet;
        this.minRaise = raiseAmount;
        this.lastRaiserIndex = seatIndex;

        if (player.chips === 0) {
            player.isAllIn = true;
        }

        return { success: true, action: 'raise', amount };
    }

    allIn(seatIndex) {
        const player = this.seats[seatIndex];
        const amount = player.chips;

        player.currentBet += amount;
        player.totalBet += amount;
        this.pot += amount;
        player.chips = 0;
        player.isAllIn = true;

        if (player.currentBet > this.currentBet) {
            this.minRaise = player.currentBet - this.currentBet;
            this.currentBet = player.currentBet;
            this.lastRaiserIndex = seatIndex;
        }

        return { success: true, action: 'allin', amount };
    }

    // ============ Game Advancement ============

    advanceGame() {
        // Check for winner (all but one folded)
        const activePlayers = this.seats.filter(s => s && !s.isFolded);
        if (activePlayers.length === 1) {
            this.clearTurnTimer();
            this.awardPot(activePlayers[0]);
            setTimeout(() => this.startNewHand(), 3000);
            return;
        }

        // Find next player who can act (not folded, not all-in)
        const nextPlayer = this.getNextActivePlayer(this.currentPlayerIndex);
        
        // Check if betting round is complete
        // CRITICAL: Check if all active players (who can act) have matched the current bet
        // A player has matched if: folded (can ignore), all-in (already committed), or currentBet === this.currentBet
        const allBetsEqualized = this.seats.every(seat => {
            if (!seat || seat.isFolded) return true;  // Folded players don't need to match
            if (seat.isAllIn) return true;  // All-in players are already committed
            // Active players must have matched the current bet
            return seat.currentBet === this.currentBet;
        });
        
        // CRITICAL FIX: A betting round is complete when:
        // 1. No one can act (all folded or all-in) - nextPlayer === -1
        // 2. All bets are equalized AND we've completed a full round:
        //    - If the next player is the last raiser, we've completed a full round (everyone has acted)
        //    - OR if the current player IS the last raiser and all bets are equalized, everyone has acted
        // This handles the case where everyone checks (no raises) - when we loop back to the first player
        // who acted, we know everyone has had a chance to act
        
        // If all bets are equalized, check if we've completed a full round
        const bettingRoundComplete = allBetsEqualized && (
            nextPlayer === -1 ||  // No one can act
            nextPlayer === this.lastRaiserIndex ||  // Next player is last raiser (completed full round)
            (this.currentPlayerIndex === this.lastRaiserIndex && allBetsEqualized)  // Current player is last raiser and all equal (completed round)
        );
        
        if (bettingRoundComplete) {
            console.log(`[Table ${this.name}] Betting round complete - advancing phase. Last raiser: ${this.lastRaiserIndex}, Current player: ${this.currentPlayerIndex}, Next player: ${nextPlayer}, All equalized: ${allBetsEqualized}`);
            this.advancePhase();
            return;
        }
        
        // If bets aren't equalized, we must continue the betting round
        // Give the next player a turn
        if (nextPlayer !== -1) {
            this.currentPlayerIndex = nextPlayer;
            const nextPlayerSeat = this.seats[this.currentPlayerIndex];
            console.log(`[Table ${this.name}] Turn: ${nextPlayerSeat?.name} (seat ${this.currentPlayerIndex}, isBot: ${nextPlayerSeat?.isBot}, currentBet: ${nextPlayerSeat?.currentBet}/${this.currentBet}, lastRaiser: ${this.lastRaiserIndex})`);
            this.startTurnTimer();
            
            // CRITICAL: Broadcast state so client knows it's their turn! (Issue #58)
            this.onStateChange?.();
        } else {
            // This shouldn't happen if betting is active, but handle it
            console.warn(`[Table ${this.name}] WARNING: nextPlayer is -1 but bets not equalized. All equalized: ${allBetsEqualized}. Forcing phase advance.`);
            this.advancePhase();
        }
    }

    advancePhase() {
        // Reset betting for new round
        for (const seat of this.seats) {
            if (seat) seat.currentBet = 0;
        }
        this.currentBet = 0;
        this.minRaise = this.bigBlind;

        switch (this.phase) {
            case GAME_PHASES.PRE_FLOP:
                this.communityCards = [this.deck.draw(), this.deck.draw(), this.deck.draw()];
                this.phase = GAME_PHASES.FLOP;
                break;
            case GAME_PHASES.FLOP:
                this.communityCards.push(this.deck.draw());
                this.phase = GAME_PHASES.TURN;
                break;
            case GAME_PHASES.TURN:
                this.communityCards.push(this.deck.draw());
                this.phase = GAME_PHASES.RIVER;
                break;
            case GAME_PHASES.RIVER:
                this.showdown();
                return;
        }

        // Set first player after dealer
        this.currentPlayerIndex = this.getNextActivePlayer(this.dealerIndex);
        
        // If no one can act (all folded or all-in), advance to next phase immediately
        if (this.currentPlayerIndex === -1) {
            console.log(`[Table ${this.name}] No active players - running out board`);
            this.onStateChange?.();
            // Short delay before next phase for visual effect
            setTimeout(() => this.advancePhase(), 1000);
            return;
        }
        
        // CRITICAL FIX: Reset lastRaiserIndex to track first player to act this round
        // This is used to detect when we've completed a full betting round
        // If no one raises, we'll still advance phase when we get back to this player
        this.lastRaiserIndex = this.currentPlayerIndex;
        console.log(`[Table ${this.name}] New betting round (${this.phase}) - First to act: ${this.seats[this.currentPlayerIndex]?.name} (seat ${this.currentPlayerIndex})`);
        this.startTurnTimer();
        
        // Broadcast state for new phase
        this.onStateChange?.();
    }

    showdown() {
        this.clearTurnTimer();
        this.phase = GAME_PHASES.SHOWDOWN;
        
        // CRITICAL: Broadcast state immediately so clients see cards before showing winner
        this.onStateChange?.();
        
        const activePlayers = this.seats
            .map((seat, index) => seat && !seat.isFolded ? { ...seat, seatIndex: index } : null)
            .filter(p => p !== null);

        // Evaluate hands
        for (const player of activePlayers) {
            player.handResult = HandEvaluator.evaluate([...player.cards, ...this.communityCards]);
        }

        // Calculate and award side pots
        const potAwards = this.calculateAndAwardSidePots(activePlayers);
        
        // Award item side pot if active
        let sidePotResult = null;
        if (this.itemSidePot.status === SidePot.STATUS.LOCKED) {
            // Find overall winner (player with most chips gained? or best hand among all?)
            // Use the best hand among participants
            const participants = activePlayers.filter(p => 
                this.itemSidePot.isParticipating(p.playerId)
            );
            if (participants.length > 0) {
                participants.sort((a, b) => HandEvaluator.compare(b.handResult, a.handResult));
                const itemWinner = participants[0];
                sidePotResult = this.itemSidePot.award(itemWinner.playerId);
                if (sidePotResult?.success) {
                    console.log(`[Table ${this.name}] ${itemWinner.name} wins ${sidePotResult.items.length} items from side pot!`);
                }
            }
        }

        // Notify about each pot winner (for hand_result event)
        // CRITICAL: Emit hand_result AFTER state has been broadcast so cards are visible
        if (potAwards && potAwards.length > 0 && this.onHandComplete) {
            // Small delay to ensure state is received before hand_result
            setTimeout(() => {
                // Emit for the main pot winner (first award)
                const mainWinner = potAwards[0];
                this.onHandComplete({
                    winnerId: mainWinner.playerId,
                    winnerName: mainWinner.name,
                    handName: mainWinner.handName,
                    potAmount: potAwards.reduce((sum, a) => sum + a.amount, 0), // Total pot
                    potAwards: potAwards // All individual awards
                });
            }, 100); // Small delay to ensure state broadcast happens first
        }

        // Start new hand after showing results
        setTimeout(() => {
            // Broadcast state one more time before starting new hand (in case chips updated)
            this.onStateChange?.();
            setTimeout(() => this.startNewHand(), 500);
        }, 4000); // 4 seconds to show winner, then 0.5s transition
    }

    /**
     * Calculate side pots based on all-in amounts and award them
     * Side pots occur when players are all-in for different amounts
     */
    calculateAndAwardSidePots(activePlayers) {
        // Get all players (including folded) with their total bets
        const allContributors = this.seats
            .filter(seat => seat !== null)
            .map(seat => ({
                playerId: seat.playerId,
                name: seat.name,
                totalBet: seat.totalBet,
                isFolded: seat.isFolded,
                isAllIn: seat.isAllIn,
                seatIndex: this.seats.indexOf(seat),
                handResult: activePlayers.find(p => p.playerId === seat.playerId)?.handResult || null
            }))
            .filter(p => p.totalBet > 0);

        // Sort by total bet to create side pots
        const sortedByBet = [...allContributors].sort((a, b) => a.totalBet - b.totalBet);
        
        let previousBetLevel = 0;
        const potAwards = [];
        
        for (const player of sortedByBet) {
            if (player.totalBet > previousBetLevel) {
                // Calculate pot at this level
                const betDiff = player.totalBet - previousBetLevel;
                const eligiblePlayers = allContributors.filter(p => p.totalBet >= player.totalBet);
                const potAmount = eligiblePlayers.length * betDiff;
                
                // Find best eligible hand that isn't folded
                const eligibleHands = eligiblePlayers
                    .filter(p => !p.isFolded && p.handResult)
                    .sort((a, b) => HandEvaluator.compare(b.handResult, a.handResult));
                
                if (eligibleHands.length > 0 && potAmount > 0) {
                    // Check for split pot (ties)
                    const winners = [eligibleHands[0]];
                    for (let i = 1; i < eligibleHands.length; i++) {
                        if (HandEvaluator.compare(eligibleHands[0].handResult, eligibleHands[i].handResult) === 0) {
                            winners.push(eligibleHands[i]);
                        } else {
                            break;
                        }
                    }
                    
                    // Split among winners
                    const winAmount = Math.floor(potAmount / winners.length);
                    const remainder = potAmount % winners.length;
                    
                    for (let i = 0; i < winners.length; i++) {
                        const award = winAmount + (i === 0 ? remainder : 0);
                        potAwards.push({
                            playerId: winners[i].playerId,
                            name: winners[i].name,
                            amount: award,
                            handName: winners[i].handResult.name,
                            potType: previousBetLevel === 0 ? 'main' : 'side'
                        });
                    }
                }
                
                previousBetLevel = player.totalBet;
            }
        }
        
        // Award the pots
        for (const award of potAwards) {
            const seat = this.seats.find(s => s?.playerId === award.playerId);
            if (seat) {
                seat.chips += award.amount;
                console.log(`[Table ${this.name}] ${award.name} wins ${award.amount} from ${award.potType} pot with ${award.handName}`);
            }
        }
        
        // Clear pot
        this.pot = 0;
        
        // Store awards for client display
        this.lastPotAwards = potAwards;
        
        return potAwards;
    }

    awardPot(winner) {
        // Simple case - everyone folded, winner takes pot
        const seat = this.seats.find(s => s?.playerId === winner.playerId);
        const potAmount = this.pot;
        
        if (seat) {
            seat.chips += potAmount;
        }
        this.pot = 0;
        
        // CRITICAL: Broadcast state immediately so clients see updated chips
        this.onStateChange?.();
        
        // Notify about the winner (for hand_result event)
        // Small delay to ensure state is received before hand_result
        if (this.onHandComplete) {
            setTimeout(() => {
                this.onHandComplete({
                    winnerId: winner.playerId,
                    winnerName: winner.name,
                    handName: "Everyone Folded",
                    potAmount: potAmount,
                    potAwards: [{
                        playerId: winner.playerId,
                        name: winner.name,
                        amount: potAmount,
                        handName: "Everyone Folded",
                        potType: 'main'
                    }]
                });
            }, 100); // Small delay to ensure state broadcast happens first
        }
        
        // Start new hand after showing results
        setTimeout(() => {
            // Broadcast state one more time before starting new hand
            this.onStateChange?.();
            setTimeout(() => this.startNewHand(), 500);
        }, 3000); // 3 seconds to show winner, then 0.5s transition
    }

    // ============ Spectators ============

    addSpectator(userId, name, socketId) {
        if (!this.allowSpectators) {
            return { success: false, error: 'Spectators not allowed' };
        }
        if (this.spectators.size >= this.maxSpectators) {
            return { success: false, error: 'Spectator limit reached' };
        }
        
        this.spectators.set(userId, { oderId: userId, playerName: name, socketId });
        console.log(`[Table ${this.name}] ${name} is now spectating`);
        return { success: true };
    }

    removeSpectator(userId) {
        this.spectators.delete(userId);
    }

    getSpectatorCount() {
        return this.spectators.size;
    }

    isSpectator(userId) {
        return this.spectators.has(userId);
    }

    // ============ Password ============

    checkPassword(password) {
        if (!this.hasPassword) return true;
        return this.password === password;
    }

    // ============ Invites ============

    invitePlayer(userId) {
        this.pendingInvites.add(userId);
    }

    isInvited(userId) {
        return this.pendingInvites.has(userId);
    }

    clearInvite(userId) {
        this.pendingInvites.delete(userId);
    }

    // ============ Item Side Pot ============

    /**
     * Creator starts the item side pot with their item
     */
    startSidePot(creatorId, item) {
        if (creatorId !== this.creatorId) {
            return { success: false, error: 'Only table creator can start side pot' };
        }
        if (this.gameStarted) {
            return { success: false, error: 'Game already started' };
        }
        return this.itemSidePot.start(item, this.sidePotCollectionTime);
    }

    /**
     * Player submits item to side pot for approval
     */
    submitToSidePot(userId, item) {
        return this.itemSidePot.submitItem(userId, item);
    }

    /**
     * Player opts out of side pot
     */
    optOutOfSidePot(userId) {
        return this.itemSidePot.optOut(userId);
    }

    /**
     * Creator approves a player's item
     */
    approveSidePotItem(creatorId, userId) {
        return this.itemSidePot.approveItem(creatorId, userId);
    }

    /**
     * Creator declines a player's item
     */
    declineSidePotItem(creatorId, userId) {
        return this.itemSidePot.declineItem(creatorId, userId);
    }

    /**
     * Get side pot state for a user
     */
    getSidePotState(forUserId = null) {
        return this.itemSidePot.getState(forUserId);
    }

    /**
     * Lock side pot when game starts
     */
    lockSidePot() {
        if (this.itemSidePot.status === SidePot.STATUS.COLLECTING) {
            return this.itemSidePot.lock();
        }
        return { success: true };
    }

    /**
     * Cancel side pot (return items)
     */
    cancelSidePot() {
        return this.itemSidePot.cancel();
    }

    // ============ State ============

    getPublicInfo() {
        return {
            id: this.id,
            name: this.name,
            playerCount: this.getSeatedPlayerCount(),
            maxPlayers: this.maxPlayers,
            spectatorCount: this.getSpectatorCount(),
            smallBlind: this.smallBlind,
            bigBlind: this.bigBlind,
            buyIn: this.buyIn,
            practiceMode: this.practiceMode,
            isPrivate: this.isPrivate,
            hasPassword: this.hasPassword,
            gameStarted: this.gameStarted,
            allowSpectators: this.allowSpectators,
            houseRulesPreset: this.houseRules?.bettingType || 'standard',
            hasSidePot: this.itemSidePot.status !== SidePot.STATUS.INACTIVE,
            sidePotItemCount: this.itemSidePot.approvedItems.length,
            createdAt: this.createdAt
        };
    }

    getState(forPlayerId = null) {
        const isSpectating = this.isSpectator(forPlayerId);
        const currentPlayer = this.currentPlayerIndex >= 0 ? this.seats[this.currentPlayerIndex] : null;
        
        return {
            id: this.id,
            name: this.name,
            phase: this.phase,
            pot: this.pot,
            communityCards: this.communityCards,
            currentBet: this.currentBet,
            minBet: this.bigBlind,
            minRaise: this.minRaise,
            smallBlind: this.smallBlind,
            bigBlind: this.bigBlind,
            dealerIndex: this.dealerIndex,
            currentPlayerIndex: this.currentPlayerIndex,
            currentPlayerId: currentPlayer?.playerId || null,
            turnTimeRemaining: this.getTurnTimeRemaining(),
            blindTimeRemaining: this.getBlindTimeRemaining(),
            blindLevel: this.blindLevel,
            blindIncreaseEnabled: this.blindIncreaseInterval > 0,
            startCountdownRemaining: this.getStartCountdownRemaining(),
            readyUpTimeRemaining: this.getReadyUpTimeRemaining(),
            readyPlayerCount: this.getReadyPlayerCount(),
            totalPlayerCount: this.getActivePlayerCount(),
            handsPlayed: this.handsPlayed,
            spectatorCount: this.getSpectatorCount(),
            lastPotAwards: this.phase === GAME_PHASES.SHOWDOWN ? this.lastPotAwards : null,
            isSpectating: isSpectating,
            creatorId: this.creatorId,
            practiceMode: this.practiceMode,
            houseRules: this.houseRules?.toJSON?.() || null,
            sidePot: this.getSidePotState(forPlayerId),
            seats: this.seats.map((seat, index) => {
                if (!seat) return null;
                
                // Spectators never see hole cards (except showdown)
                // Players only see their own cards (except showdown)
                // During showdown, only show cards of players who are still in (not folded)
                const canSeeCards = !isSpectating && (
                    seat.playerId === forPlayerId || 
                    (this.phase === GAME_PHASES.SHOWDOWN && !seat.isFolded)
                );
                
                // FIX: Ensure cards are preserved - don't lose them if array is null/undefined
                let cards = [];
                if (seat.cards && Array.isArray(seat.cards)) {
                    cards = canSeeCards ? seat.cards : seat.cards.map(() => ({ rank: null, suit: null }));
                }
                
                return {
                    index,
                    playerId: seat.playerId,
                    name: seat.name,
                    chips: seat.chips,
                    currentBet: seat.currentBet,
                    isFolded: seat.isFolded,
                    isAllIn: seat.isAllIn,
                    isConnected: seat.isConnected,
                    isBot: seat.isBot || false,
                    isSittingOut: seat.isSittingOut || false,
                    isReady: seat.isReady || false,
                    inSidePot: this.itemSidePot.isParticipating(seat.playerId),
                    cards: cards
                };
            })
        };
    }
}

Table.PHASES = GAME_PHASES;
Table.ACTIONS = ACTIONS;

module.exports = Table;

