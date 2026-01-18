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
        this.turnTimeLimit = options.turnTimeLimit || 10000; // 10 seconds per turn
        
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
        
        this.seats[seatIndex] = null;
        console.log(`[Table ${this.name}] ${player.name} left`);

        // Handle mid-game removal
        if (this.phase !== GAME_PHASES.WAITING && this.currentPlayerIndex === seatIndex) {
            this.handleAction(playerId, ACTIONS.FOLD);
        }

        // Check if countdown should be cancelled (not enough players)
        this.checkStartCountdown();

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

        if (raiseAmount < this.minRaise && amount !== player.chips) {
            return { success: false, error: `Minimum raise is ${this.minRaise}` };
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

        // Find next player
        const nextPlayer = this.getNextActivePlayer(this.currentPlayerIndex);
        
        // Check if betting round is complete
        if (nextPlayer === this.lastRaiserIndex || nextPlayer === -1) {
            this.advancePhase();
        } else {
            this.currentPlayerIndex = nextPlayer;
            const nextPlayerSeat = this.seats[this.currentPlayerIndex];
            console.log(`[Table ${this.name}] Turn: ${nextPlayerSeat?.name} (seat ${this.currentPlayerIndex}, isBot: ${nextPlayerSeat?.isBot})`);
            this.startTurnTimer();
            
            // CRITICAL: Broadcast state so client knows it's their turn! (Issue #58)
            this.onStateChange?.();
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
        
        this.lastRaiserIndex = this.currentPlayerIndex;
        this.startTurnTimer();
        
        // Broadcast state for new phase
        this.onStateChange?.();
    }

    showdown() {
        this.clearTurnTimer();
        this.phase = GAME_PHASES.SHOWDOWN;
        
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
        if (potAwards && potAwards.length > 0 && this.onHandComplete) {
            // Emit for the main pot winner (first award)
            const mainWinner = potAwards[0];
            this.onHandComplete({
                winnerId: mainWinner.playerId,
                winnerName: mainWinner.name,
                handName: mainWinner.handName,
                potAmount: potAwards.reduce((sum, a) => sum + a.amount, 0), // Total pot
                potAwards: potAwards // All individual awards
            });
        }

        setTimeout(() => this.startNewHand(), 5000);
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
        
        // Notify about the winner (for hand_result event)
        if (this.onHandComplete) {
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
        }
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
            startCountdownRemaining: this.getStartCountdownRemaining(),
            readyUpTimeRemaining: this.getReadyUpTimeRemaining(),
            readyPlayerCount: this.getReadyPlayerCount(),
            totalPlayerCount: this.getActivePlayerCount(),
            handsPlayed: this.handsPlayed,
            spectatorCount: this.getSpectatorCount(),
            lastPotAwards: this.phase === GAME_PHASES.SHOWDOWN ? this.lastPotAwards : null,
            isSpectating: isSpectating,
            creatorId: this.creatorId,
            houseRules: this.houseRules?.toJSON?.() || null,
            sidePot: this.getSidePotState(forPlayerId),
            seats: this.seats.map((seat, index) => {
                if (!seat) return null;
                
                // Spectators never see hole cards (except showdown)
                // Players only see their own cards (except showdown)
                const canSeeCards = !isSpectating && 
                    (seat.playerId === forPlayerId || this.phase === GAME_PHASES.SHOWDOWN);
                
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
                    cards: canSeeCards ? seat.cards : seat.cards.map(() => null)
                };
            })
        };
    }
}

Table.PHASES = GAME_PHASES;
Table.ACTIONS = ACTIONS;

module.exports = Table;

