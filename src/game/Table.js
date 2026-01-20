/**
 * Table - Represents a poker table with game state
 */

const Deck = require('./Deck');
const HandEvaluator = require('./HandEvaluator');
const SidePot = require('./SidePot');
const gameLogger = require('../utils/GameLogger');

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
        this.isSimulation = options.isSimulation || false;
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
        this.hasPassedLastRaiser = false;  // Track if we've passed the last raiser this betting round
        
        // Loop detection - prevent infinite loops
        this.turnsThisPhase = 0;  // Count turns in current phase
        this.playerTurnCounts = {};  // Track how many times each player has acted this phase
        this.lastActingPlayer = null;  // Track last player to detect consecutive same-player turns
        this.consecutiveSamePlayerTurns = 0;  // Detect if same player keeps getting turn without others acting
        this.MAX_TURNS_PER_PHASE = 30;  // Safety valve - force advance if exceeded (raised for heads-up with lots of raising)
        this.MAX_CONSECUTIVE_SAME_PLAYER = 3;  // ONLY warn if same player acts 3x IN A ROW without anyone else acting

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
        this.onPlayerEliminated = null; // Called when a player runs out of chips
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
     * Called when ready-up timer expires
     * Forces game to start - players who aren't ready become spectators
     */
    handleReadyUpTimeout() {
        if (this.phase !== GAME_PHASES.READY_UP) return;
        
        console.log(`[Table ${this.name}] Ready-up timeout! Forcing game start.`);
        
        // Get not-ready players
        const notReadyPlayers = this.seats.filter(s => s && !s.isReady);
        
        if (notReadyPlayers.length > 0) {
            console.log(`[Table ${this.name}] Moving ${notReadyPlayers.length} not-ready players to spectators: ${notReadyPlayers.map(s => s.name).join(', ')}`);
            
            // Move not-ready players to spectators
            for (const seat of notReadyPlayers) {
                const seatIndex = this.seats.indexOf(seat);
                if (seatIndex >= 0) {
                    // Add to spectators
                    this.addSpectator(seat.playerId, seat.name, seat.socketId);
                    // Remove from seat
                    this.seats[seatIndex] = null;
                    // Notify about removal
                    this.onPlayerNotReady?.(seat.playerId, seat.name);
                }
            }
        }
        
        // Check if we still have enough players
        const remainingPlayers = this.seats.filter(s => s !== null).length;
        if (remainingPlayers >= 2) {
            // Start final countdown with remaining ready players
            this.startFinalCountdown();
        } else {
            console.log(`[Table ${this.name}] Not enough ready players (${remainingPlayers}). Cancelling game.`);
            this.phase = GAME_PHASES.WAITING;
            this.readyUpActive = false;
            this.onStateChange?.();
        }
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
        
        // Log each seat's ready status for ALL tables
        const seatStatuses = this.seats.map((s, i) => s ? {
            seat: i,
            name: s.name,
            isBot: s.isBot,
            isReady: s.isReady,
            playerId: s.playerId
        } : null).filter(Boolean);
        
        gameLogger.readyUp(this.name, 'Checking ready status', {
            isSimulation: this.isSimulation,
            seats: seatStatuses,
            phase: this.phase
        });
        
        const allReady = this.seats.every(s => !s || s.isReady);
        
        if (allReady) {
            gameLogger.readyUp(this.name, 'All players ready! Starting final countdown', {
                isSimulation: this.isSimulation,
                playerCount: seatStatuses.length
            });
            this.startFinalCountdown();
        } else {
            const notReady = this.seats.filter(s => s && !s.isReady).map(s => ({
                name: s.name,
                isBot: s.isBot,
                playerId: s.playerId
            }));
            gameLogger.readyUp(this.name, 'Not all ready yet', {
                isSimulation: this.isSimulation,
                waitingFor: notReady
            });
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
        // CRITICAL: Clear any pending turn timers first
        this.clearTurnTimer();
        
        if (this.getSeatedPlayerCount() < 2) {
            this.phase = GAME_PHASES.WAITING;
            this.onStateChange?.();
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
        // CRITICAL: Only eliminate players who have 0 chips AND no money in the pot
        // Players who are all-in have 0 chips but still have currentBet/totalBet in the pot
        // We only check for elimination at the START of a new hand (after previous hand's pots are awarded)
        for (let i = 0; i < this.seats.length; i++) {
            const seat = this.seats[i];
            if (seat && seat.chips <= 0) {
                // Check if player has any money still in the current pot (shouldn't happen at start of new hand, but safety check)
                const hasMoneyInPot = (seat.currentBet > 0) || (seat.totalBet > 0);
                
                // Only eliminate if they truly have 0 chips AND no money in pot
                // At the start of a new hand, currentBet and totalBet should be 0, so this is safe
                if (!hasMoneyInPot) {
                    // Mark as inactive but don't remove - let them spectate
                    const wasAlreadyEliminated = seat.isActive === false;
                    seat.isActive = false;
                    
                    // Notify about elimination (only if they weren't already eliminated)
                    if (!wasAlreadyEliminated && this.onPlayerEliminated) {
                        this.onPlayerEliminated({
                            playerId: seat.playerId,
                            playerName: seat.name,
                            seatIndex: i,
                            isBot: seat.isBot || false
                        });
                    }
                    
                    if (seat.isBot) {
                        console.log(`[Table ${this.name}] Bot ${seat.name} eliminated`);
                        this.seats[i] = null;  // Remove bots completely
                    } else {
                        console.log(`[Table ${this.name}] ${seat.name} is out of chips - can spectate or leave`);
                        // Don't remove human players - let them spectate or leave
                    }
                } else {
                    // Player has 0 chips but money in pot - they're all-in, don't eliminate yet
                    console.log(`[Table ${this.name}] ${seat.name} has 0 chips but ${seat.currentBet || seat.totalBet} in pot - not eliminating (all-in)`);
                }
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
        
        // CRITICAL: Reset betting round tracking flags
        this.hasPassedLastRaiser = false;
        this.lastRaiserIndex = -1;
        this.currentPlayerIndex = -1;
        
        // Reset loop detection counters
        this.turnsThisPhase = 0;
        this.playerTurnCounts = {};
        this.lastActingPlayer = null;
        this.consecutiveSamePlayerTurns = 0;

        // Reset players
        // CRITICAL: Only reset isActive if player HAS chips
        // If player is already eliminated (isActive = false), don't re-activate them even if they get chips from pots
        for (const seat of this.seats) {
            if (seat) {
                seat.cards = [];  // Clear cards first
                seat.currentBet = 0;
                seat.totalBet = 0;
                // CRITICAL FIX: Only set isActive to true if they have chips AND weren't already eliminated
                // Once eliminated (isActive = false), they stay eliminated even if they win chips
                // This prevents eliminated players from re-entering the game
                if (seat.chips > 0 && seat.isActive !== false) {
                    seat.isActive = true;
                } else if (seat.chips <= 0) {
                    seat.isActive = false; // Ensure 0 chips = inactive
                }
                // If seat.isActive is already false (eliminated), keep it false
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
        
        // CRITICAL: Ensure hasPassedLastRaiser is reset for new hand
        this.hasPassedLastRaiser = false;
        
        // Get all active players for logging
        const activePlayersInfo = this.seats.map((seat, idx) => ({
            seatIndex: idx,
            name: seat?.name,
            chips: seat?.chips,
            currentBet: seat?.currentBet,
            isBot: seat?.isBot
        })).filter(info => info.name);
        
        // Debug: Log who's turn it is
        const firstPlayer = this.seats[this.currentPlayerIndex];
        
        gameLogger.gameEvent(this.name, 'NEW HAND STARTED', {
            handNumber: this.handsPlayed,
            dealerIndex: this.dealerIndex,
            sbIndex,
            bbIndex,
            firstToAct: firstPlayer?.name,
            firstToActSeat: this.currentPlayerIndex,
            lastRaiserIndex: this.lastRaiserIndex,
            pot: this.pot,
            currentBet: this.currentBet,
            activePlayers: activePlayersInfo,
            phase: this.phase
        });
        
        console.log(`[Table ${this.name}] Hand started - First to act: ${firstPlayer?.name} (seat ${this.currentPlayerIndex}, isBot: ${firstPlayer?.isBot})`);
        
        // CRITICAL: Broadcast state BEFORE starting timer to ensure clients see new cards
        // This prevents cards from appearing to "change" after being dealt
        this.onStateChange?.();
        
        // Small delay before starting timer to ensure state is received
        setTimeout(() => {
            // Only start timer if we're still in the same hand/phase
            if (this.phase === GAME_PHASES.PRE_FLOP && this.currentPlayerIndex >= 0) {
                this.startTurnTimer();
            }
        }, 100);

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
        // CRITICAL: No betting allowed during showdown - just evaluate hands
        if (this.phase === GAME_PHASES.SHOWDOWN) {
            gameLogger.bettingAction(this.name, playerId || 'unknown', `Action rejected: No betting during showdown`);
            return { success: false, error: 'No betting during showdown' };
        }
        
        // CRITICAL: No betting allowed during waiting/ready_up/countdown phases
        if (this.phase === GAME_PHASES.WAITING || this.phase === GAME_PHASES.READY_UP || this.phase === GAME_PHASES.COUNTDOWN) {
            gameLogger.bettingAction(this.name, playerId || 'unknown', `Action rejected: Game not in progress (phase: ${this.phase})`);
            return { success: false, error: 'Game not in progress' };
        }
        
        const seatIndex = this.seats.findIndex(s => s?.playerId === playerId);
        if (seatIndex === -1 || seatIndex !== this.currentPlayerIndex) {
            gameLogger.bettingAction(this.name, playerId || 'unknown', `Action rejected: Not your turn (seat ${seatIndex}, current ${this.currentPlayerIndex})`);
            return { success: false, error: 'Not your turn' };
        }

        const player = this.seats[seatIndex];
        const toCall = this.currentBet - player.currentBet;
        
        gameLogger.bettingAction(this.name, player.name || playerId, `Attempting ${action}`, {
            seatIndex,
            amount,
            toCall,
            currentBet: this.currentBet,
            playerBet: player.currentBet,
            playerChips: player.chips,
            phase: this.phase,
            isAllIn: player.isAllIn
        });

        let result = { success: false, error: 'Invalid action' };

        switch (action) {
            case ACTIONS.FOLD:
                result = this.fold(seatIndex);
                break;
            case ACTIONS.CHECK:
                if (toCall > 0) {
                    result = { success: false, error: `Cannot check - need to call ${toCall}` };
                } else {
                    result = this.check(seatIndex);
                }
                break;
            case ACTIONS.CALL:
                if (toCall === 0) {
                    // Can't call if there's nothing to call - treat as check
                    result = this.check(seatIndex);
                } else if (toCall > player.chips) {
                    // Can't call more than you have - treat as all-in
                    result = this.allIn(seatIndex);
                } else {
                    result = this.call(seatIndex);
                }
                break;
            case ACTIONS.BET:
                if (this.currentBet > 0) {
                    result = { success: false, error: `Cannot bet - current bet is ${this.currentBet}. Use raise or call.` };
                } else if (amount < this.bigBlind) {
                    result = { success: false, error: `Minimum bet is ${this.bigBlind}` };
                } else if (amount > player.chips) {
                    result = { success: false, error: `You don't have enough chips. You have ${player.chips}.` };
                } else {
                    result = this.bet(seatIndex, amount);
                }
                break;
            case ACTIONS.RAISE:
                result = this.raise(seatIndex, amount);
                break;
            case ACTIONS.ALL_IN:
                result = this.allIn(seatIndex);
                break;
            default:
                result = { success: false, error: `Unknown action: ${action}` };
                break;
        }

        if (result.success) {
            gameLogger.bettingAction(this.name, player.name || playerId, `${result.action} SUCCESS`, {
                action: result.action,
                amount: result.amount,
                newChips: player.chips,
                newBet: player.currentBet,
                pot: this.pot,
                currentBet: this.currentBet,
                minRaise: this.minRaise,
                lastRaiserIndex: this.lastRaiserIndex
            });
            
            this.clearTurnTimer();
            
            // Notify about the action (for all players including bots)
            this.onPlayerAction?.(playerId, result.action, result.amount || 0);
            
            this.advanceGame();
        } else {
            gameLogger.bettingAction(this.name, player.name || playerId, `${action} FAILED`, {
                error: result.error,
                reason: result.error
            });
        }

        return result;
    }

    fold(seatIndex) {
        const player = this.seats[seatIndex];
        player.isFolded = true;
        gameLogger.bettingAction(this.name, player.name || `Seat ${seatIndex}`, 'FOLD', {
            seatIndex,
            phase: this.phase,
            pot: this.pot
        });
        return { success: true, action: 'fold' };
    }

    check(seatIndex) {
        const player = this.seats[seatIndex];
        gameLogger.bettingAction(this.name, player.name || `Seat ${seatIndex}`, 'CHECK', {
            seatIndex,
            phase: this.phase,
            currentBet: this.currentBet,
            playerBet: player.currentBet
        });
        return { success: true, action: 'check' };
    }

    call(seatIndex) {
        const player = this.seats[seatIndex];
        const toCall = Math.min(this.currentBet - player.currentBet, player.chips);
        
        const beforeChips = player.chips;
        player.chips -= toCall;
        player.currentBet += toCall;
        player.totalBet += toCall;
        this.pot += toCall;

        if (player.chips === 0) {
            player.isAllIn = true;
        }

        gameLogger.bettingAction(this.name, player.name || `Seat ${seatIndex}`, 'CALL', {
            seatIndex,
            amount: toCall,
            chipsBefore: beforeChips,
            chipsAfter: player.chips,
            currentBet: this.currentBet,
            playerBet: player.currentBet,
            pot: this.pot,
            isAllIn: player.isAllIn,
            phase: this.phase
        });

        return { success: true, action: 'call', amount: toCall };
    }

    bet(seatIndex, amount) {
        const player = this.seats[seatIndex];
        
        if (amount < this.bigBlind || amount > player.chips) {
            gameLogger.bettingAction(this.name, player.name || `Seat ${seatIndex}`, 'BET REJECTED', {
                amount,
                bigBlind: this.bigBlind,
                playerChips: player.chips
            });
            return { success: false, error: 'Invalid bet amount' };
        }

        const beforeChips = player.chips;
        player.chips -= amount;
        player.currentBet = amount;
        player.totalBet += amount;
        this.pot += amount;
        const oldCurrentBet = this.currentBet;
        this.currentBet = amount;
        this.minRaise = amount;
        const oldLastRaiser = this.lastRaiserIndex;
        this.lastRaiserIndex = seatIndex;

        if (player.chips === 0) {
            player.isAllIn = true;
        }

        gameLogger.bettingAction(this.name, player.name || `Seat ${seatIndex}`, 'BET', {
            seatIndex,
            amount,
            chipsBefore: beforeChips,
            chipsAfter: player.chips,
            oldCurrentBet,
            newCurrentBet: this.currentBet,
            pot: this.pot,
            minRaise: this.minRaise,
            oldLastRaiser,
            newLastRaiser: this.lastRaiserIndex,
            isAllIn: player.isAllIn,
            phase: this.phase
        });

        return { success: true, action: 'bet', amount };
    }

    raise(seatIndex, amount) {
        const player = this.seats[seatIndex];
        const toCall = this.currentBet - player.currentBet;
        const totalNeeded = toCall + (this.minRaise || this.bigBlind);
        const raiseAmount = amount - toCall;
        
        gameLogger.debug(this.name, `RAISE VALIDATION`, {
            seatIndex,
            playerName: player.name,
            amount,
            toCall,
            totalNeeded,
            raiseAmount,
            minRaise: this.minRaise,
            playerChips: player.chips,
            currentBet: this.currentBet,
            playerBet: player.currentBet
        });
        
        // CRITICAL: Validate amount is not more than player has
        if (amount > player.chips) {
            return { success: false, error: `You don't have enough chips. You have ${player.chips}.` };
        }
        
        // If player is raising all their chips, it's an all-in, not a raise
        if (amount === player.chips && amount < totalNeeded) {
            // Player doesn't have enough for a proper raise - treat as all-in
            gameLogger.debug(this.name, `RAISE converted to ALL-IN (insufficient chips for proper raise)`);
            return this.allIn(seatIndex);
        }

        // FIX: Validate that raise amount is actually a raise (more than minRaise) or all-in
        // If amount equals toCall, treat as call, not raise
        if (raiseAmount <= 0) {
            // Amount is just the call amount - treat as call instead
            gameLogger.debug(this.name, `RAISE converted to CALL (raiseAmount <= 0)`);
            return this.call(seatIndex);
        }

        // CRITICAL: Validate minimum raise (unless it's an all-in)
        if (raiseAmount < this.minRaise && amount !== player.chips) {
            return { success: false, error: `Minimum raise is ${this.minRaise}. You need to bet at least ${totalNeeded} total (${toCall} to call + ${this.minRaise} to raise).` };
        }

        // CRITICAL: Don't allow raising more than player has (should already be caught above, but double-check)
        if (amount > player.chips) {
            return { success: false, error: `You don't have enough chips. You have ${player.chips}.` };
        }

        const beforeChips = player.chips;
        const oldCurrentBet = this.currentBet;
        const oldMinRaise = this.minRaise;
        const oldLastRaiser = this.lastRaiserIndex;
        
        player.chips -= amount;
        player.currentBet += amount;
        player.totalBet += amount;
        this.pot += amount;
        this.currentBet = player.currentBet;
        this.minRaise = Math.max(raiseAmount, this.minRaise);  // Keep the larger raise amount
        this.lastRaiserIndex = seatIndex;

        if (player.chips === 0) {
            player.isAllIn = true;
        }

        gameLogger.bettingAction(this.name, player.name || `Seat ${seatIndex}`, 'RAISE', {
            seatIndex,
            amount,
            raiseAmount,
            toCall,
            chipsBefore: beforeChips,
            chipsAfter: player.chips,
            oldCurrentBet,
            newCurrentBet: this.currentBet,
            oldMinRaise,
            newMinRaise: this.minRaise,
            pot: this.pot,
            oldLastRaiser,
            newLastRaiser: this.lastRaiserIndex,
            isAllIn: player.isAllIn,
            phase: this.phase
        });

        return { success: true, action: 'raise', amount };
    }

    allIn(seatIndex) {
        const player = this.seats[seatIndex];
        const amount = player.chips;
        const oldCurrentBet = this.currentBet;
        const oldMinRaise = this.minRaise;
        const oldLastRaiser = this.lastRaiserIndex;

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

        gameLogger.bettingAction(this.name, player.name || `Seat ${seatIndex}`, 'ALL-IN', {
            seatIndex,
            amount,
            oldCurrentBet,
            newCurrentBet: this.currentBet,
            oldMinRaise,
            newMinRaise: this.minRaise,
            oldLastRaiser,
            newLastRaiser: this.lastRaiserIndex,
            pot: this.pot,
            phase: this.phase
        });

        return { success: true, action: 'allin', amount };
    }

    // ============ Game Advancement ============

    advanceGame() {
        gameLogger.gameEvent(this.name, 'advanceGame() called', {
            phase: this.phase,
            currentPlayerIndex: this.currentPlayerIndex,
            lastRaiserIndex: this.lastRaiserIndex,
            hasPassedLastRaiser: this.hasPassedLastRaiser,
            currentBet: this.currentBet,
            pot: this.pot
        });
        
        // Check for winner (all but one folded)
        const activePlayers = this.seats.filter(s => s && !s.isFolded);
        if (activePlayers.length === 1) {
            gameLogger.gameEvent(this.name, 'Winner by fold - all others folded', {
                winner: activePlayers[0].name,
                seatIndex: this.seats.indexOf(activePlayers[0])
            });
            this.clearTurnTimer();
            this.awardPot(activePlayers[0]);
            setTimeout(() => this.startNewHand(), 3000);
            return;
        }

        // Find next player who can act (not folded, not all-in)
        const nextPlayer = this.getNextActivePlayer(this.currentPlayerIndex);
        
        gameLogger.debug(this.name, 'Next player calculation', {
            currentPlayerIndex: this.currentPlayerIndex,
            nextPlayer,
            lastRaiserIndex: this.lastRaiserIndex,
            hasPassedLastRaiser: this.hasPassedLastRaiser
        });
        
        // Track if we've passed the last raiser this betting round
        // This ensures we don't advance phase too early (before everyone has acted)
        // CRITICAL: We've passed the last raiser if:
        // 1. Current index is greater than last raiser (normal progression, no wrap)
        // 2. OR we've wrapped around (current < lastRaiser and nextPlayer wraps back)
        // 3. OR we're about to return to last raiser (nextPlayer === lastRaiser)
        if (this.currentPlayerIndex !== -1 && !this.hasPassedLastRaiser && this.lastRaiserIndex !== -1) {
            const currentIndex = this.currentPlayerIndex;
            const lastRaiser = this.lastRaiserIndex;
            
            // Check if we've passed the last raiser
            let passed = false;
            
            if (currentIndex > lastRaiser) {
                // Normal progression: current player is after last raiser
                passed = true;
            } else if (currentIndex < lastRaiser) {
                // We're before the last raiser - check if we've wrapped around
                if (nextPlayer === -1) {
                    // No one left to act - we've effectively passed everyone
                    passed = true;
                } else if (nextPlayer === lastRaiser) {
                    // We're about to return to last raiser - we've completed a round
                    passed = true;
                } else if (nextPlayer > currentIndex && nextPlayer <= lastRaiser) {
                    // Still progressing normally toward last raiser
                    passed = false;
                } else if (nextPlayer <= currentIndex || nextPlayer > lastRaiser) {
                    // We've wrapped around (nextPlayer is before current OR after lastRaiser means we wrapped)
                    passed = true;
                }
            } else if (currentIndex === lastRaiser && nextPlayer !== -1 && nextPlayer !== lastRaiser) {
                // We're at the last raiser and moving to someone else - we've passed
                passed = true;
            }
            
            if (passed) {
                this.hasPassedLastRaiser = true;
                gameLogger.bettingRoundCheck(this.name, 'PASSED_LAST_RAISER', 'TRUE', {
                    currentIndex,
                    lastRaiser,
                    nextPlayer,
                    phase: this.phase
                });
                console.log(`[Table ${this.name}] Passed last raiser (${lastRaiser}) - current: ${currentIndex}, next: ${nextPlayer}`);
            }
        }
        
        // Check if betting round is complete
        // CRITICAL: Check if all active players (who can act) have matched the current bet
        // A player has matched if: folded (can ignore), all-in (already committed), or currentBet === this.currentBet
        const seatBetStatus = this.seats.map((seat, idx) => ({
            seatIndex: idx,
            name: seat?.name,
            isFolded: seat?.isFolded,
            isAllIn: seat?.isAllIn,
            currentBet: seat?.currentBet,
            requiredBet: this.currentBet,
            // CRITICAL FIX: Players with 0 chips are "busted" - they can never match any bet
            matched: !seat || seat.isFolded || seat.isAllIn || seat.chips <= 0 || seat.currentBet === this.currentBet
        }));
        
        const allBetsEqualized = this.seats.every(seat => {
            if (!seat || seat.isFolded) return true;  // Folded players don't need to match
            if (seat.isAllIn) return true;  // All-in players are already committed
            if (seat.chips <= 0) return true;  // CRITICAL FIX: Busted players (0 chips) can't call - treat as matched
            // Active players must have matched the current bet
            return seat.currentBet === this.currentBet;
        });
        
        gameLogger.bettingRoundCheck(this.name, 'ALL_BETS_EQUALIZED', allBetsEqualized ? 'TRUE' : 'FALSE', {
            currentBet: this.currentBet,
            seatStatus: seatBetStatus
        });
        
        // CRITICAL FIX: Handle case where everyone checks (no raises)
        // After blinds, lastRaiserIndex is set to bbIndex. If no one raises, it stays that way.
        // If currentBet is still at bigBlind and lastRaiserIndex is bbIndex (or equal to dealer), no one raised.
        // Also check if we're past the dealer position - that means we've gone around once.
        const bbIndex = this.getNextActivePlayer(this.getNextActivePlayer(this.dealerIndex));
        const noRaisesHappened = this.currentBet <= this.bigBlind && 
                                 (this.lastRaiserIndex === bbIndex || this.lastRaiserIndex === this.dealerIndex);
        
        gameLogger.bettingRoundCheck(this.name, 'NO_RAISES_HAPPENED', noRaisesHappened ? 'TRUE' : 'FALSE', {
            currentBet: this.currentBet,
            bigBlind: this.bigBlind,
            lastRaiserIndex: this.lastRaiserIndex,
            bbIndex,
            dealerIndex: this.dealerIndex
        });
        
        // A betting round is complete when:
        // 1. No one can act (all folded or all-in) - nextPlayer === -1
        // 2. All bets are equalized AND:
        //    a. No raises happened (everyone checked) AND we've completed a full round (passed dealer/bb)
        //    b. OR someone raised AND we've passed the last raiser AND we're about to return to them
        let bettingRoundComplete = false;
        
        if (allBetsEqualized) {
            if (nextPlayer === -1) {
                // No one can act - round is complete
                bettingRoundComplete = true;
                gameLogger.bettingRoundCheck(this.name, 'BETTING_ROUND_COMPLETE', 'TRUE', {
                    reason: 'nextPlayer === -1 (all all-in or folded)',
                    allBetsEqualized,
                    nextPlayer
                });
            } else if (noRaisesHappened) {
                // No raises happened - everyone checked/called
                // CRITICAL FIX: When everyone checks, we need to ensure we've completed a FULL round
                // The round completes when we're about to return to the first player to act (dealer post-flop, BB pre-flop)
                // AND we've passed that player at least once
                if (this.phase === GAME_PHASES.PRE_FLOP) {
                    // Pre-flop: round completes when we're about to return to BB AND we've passed them
                    // We've passed BB if current > bbIndex OR we've wrapped around
                    const hasPassedBB = this.currentPlayerIndex > bbIndex || 
                                       (this.currentPlayerIndex < bbIndex && (nextPlayer === -1 || nextPlayer > bbIndex || nextPlayer <= this.currentPlayerIndex));
                    bettingRoundComplete = hasPassedBB && nextPlayer === bbIndex;
                    
                    // Fallback: if we're at BB and next player is different, we've completed the round
                    if (!bettingRoundComplete && this.currentPlayerIndex === bbIndex && nextPlayer !== bbIndex && nextPlayer !== -1) {
                        bettingRoundComplete = true;
                    }
                } else {
                    // Post-flop: round completes when we're about to return to dealer/first to act
                    // AND we've passed them at least once
                    const firstToAct = this.getNextActivePlayer(this.dealerIndex);
                    const hasPassedFirst = this.currentPlayerIndex > firstToAct || 
                                          (this.currentPlayerIndex < firstToAct && (nextPlayer === -1 || nextPlayer > firstToAct || nextPlayer <= this.currentPlayerIndex));
                    bettingRoundComplete = hasPassedFirst && nextPlayer === firstToAct;
                    
                    // Fallback: if we're at first to act and next player is different, we've completed the round
                    if (!bettingRoundComplete && this.currentPlayerIndex === firstToAct && nextPlayer !== firstToAct && nextPlayer !== -1) {
                        bettingRoundComplete = true;
                    }
                }
                gameLogger.bettingRoundCheck(this.name, 'BETTING_ROUND_COMPLETE (no raises)', bettingRoundComplete ? 'TRUE' : 'FALSE', {
                    phase: this.phase,
                    currentPlayerIndex: this.currentPlayerIndex,
                    nextPlayer,
                    bbIndex,
                    dealerIndex: this.dealerIndex,
                    lastRaiserIndex: this.lastRaiserIndex,
                    hasPassedLastRaiser: this.hasPassedLastRaiser
                });
                console.log(`[Table ${this.name}] No raises - checking if round complete. Current: ${this.currentPlayerIndex}, Next: ${nextPlayer}, BB: ${bbIndex}, Dealer: ${this.dealerIndex}, LastRaiser: ${this.lastRaiserIndex}, Complete: ${bettingRoundComplete}`);
            } else {
                // Someone raised - must have passed last raiser AND be about to return to them
                // CRITICAL FIX: Pre-flop is special - big blind ALWAYS gets LAST action
                // In standard poker, pre-flop: UTG acts first, BB acts LAST
                // If someone raises, they become the last raiser, but BB still needs their turn
                // Round completes when: we've passed BB AND passed the last raiser (if different) AND are about to return to last raiser
                if (this.phase === GAME_PHASES.PRE_FLOP) {
                    // Pre-flop: Round completes when we've passed last raiser AND about to return to them
                    // The hasPassedLastRaiser flag already tracks if we've completed a full round
                    bettingRoundComplete = this.hasPassedLastRaiser && nextPlayer === this.lastRaiserIndex;
                    
                    // Special case: If BB is the last raiser (no one raised after them), 
                    // round completes when we're about to return to BB after everyone acted
                    if (!bettingRoundComplete && this.lastRaiserIndex === bbIndex) {
                        // Check if we've passed BB (everyone has acted)
                        const hasPassedBB = this.currentPlayerIndex > bbIndex || 
                                          (this.currentPlayerIndex < bbIndex && nextPlayer > bbIndex) ||
                                          (this.currentPlayerIndex === bbIndex && nextPlayer !== bbIndex);
                        bettingRoundComplete = hasPassedBB && nextPlayer === bbIndex;
                        gameLogger.debug(this.name, 'PRE_FLOP BB check', {
                            hasPassedBB,
                            currentPlayerIndex: this.currentPlayerIndex,
                            nextPlayer,
                            bbIndex,
                            lastRaiserIndex: this.lastRaiserIndex,
                            bettingRoundComplete
                        });
                    }
                    
                    gameLogger.bettingRoundCheck(this.name, 'BETTING_ROUND_COMPLETE (pre-flop with raises)', bettingRoundComplete ? 'TRUE' : 'FALSE', {
                        hasPassedLastRaiser: this.hasPassedLastRaiser,
                        nextPlayer,
                        lastRaiserIndex: this.lastRaiserIndex,
                        bbIndex,
                        currentPlayerIndex: this.currentPlayerIndex
                    });
                    console.log(`[Table ${this.name}] Pre-flop with raises - hasPassedLastRaiser=${this.hasPassedLastRaiser}, nextPlayer=${nextPlayer}, lastRaiser=${this.lastRaiserIndex}, BB=${bbIndex}, complete=${bettingRoundComplete}`);
                } else {
                    // Post-flop: normal betting round rules
                    bettingRoundComplete = this.hasPassedLastRaiser && nextPlayer === this.lastRaiserIndex;
                    gameLogger.bettingRoundCheck(this.name, 'BETTING_ROUND_COMPLETE (post-flop)', bettingRoundComplete ? 'TRUE' : 'FALSE', {
                        hasPassedLastRaiser: this.hasPassedLastRaiser,
                        nextPlayer,
                        lastRaiserIndex: this.lastRaiserIndex,
                        phase: this.phase
                    });
                }
            }
        }
        
        // ============ CRITICAL: GUARANTEED EXIT POINTS ============
        // These checks MUST happen in order to prevent ANY loop scenarios
        // Each path has a GUARANTEED return statement
        
        // EXIT POINT 0: LOOP PREVENTION - Only one player can act
        // If nextPlayer === currentPlayerIndex, it means we've wrapped around and only ONE player can act
        // This happens when everyone else is folded, all-in, or busted (0 chips)
        // In this case, the remaining player wins by default - advance phase immediately
        if (nextPlayer === this.currentPlayerIndex && this.currentPlayerIndex !== -1) {
            gameLogger.gameEvent(this.name, 'EXIT POINT 0: LOOP PREVENTION - Only one player can act', {
                currentPlayerIndex: this.currentPlayerIndex,
                nextPlayer,
                playerName: this.seats[this.currentPlayerIndex]?.name,
                allBetsEqualized,
                phase: this.phase
            });
            console.log(`[Table ${this.name}] LOOP PREVENTION: Only one player (${this.seats[this.currentPlayerIndex]?.name}) can act - advancing phase`);
            this.hasPassedLastRaiser = false;
            this.advancePhase();
            return;  // GUARANTEED EXIT - prevents infinite loop
        }
        
        // EXIT POINT 1: No one can act (all all-in or folded)
        // MUST check this FIRST before any complex logic
        if (nextPlayer === -1) {
            // No one can act - all players are all-in or folded
            // If no one can act, betting round MUST be complete regardless of bets
            gameLogger.gameEvent(this.name, 'EXIT POINT 1: No one can act - advancing phase', {
                nextPlayer,
                allBetsEqualized,
                activePlayers: activePlayers.length
            });
            console.log(`[Table ${this.name}] No active players (all all-in or folded) - advancing phase. All bets equalized: ${allBetsEqualized}`);
            this.hasPassedLastRaiser = false;
            this.advancePhase();
            return;  // GUARANTEED EXIT - prevents loop
        }
        
        // EXIT POINT 2: Betting round complete
        // If betting round is complete, we MUST advance phase
        if (bettingRoundComplete) {
            gameLogger.gameEvent(this.name, 'EXIT POINT 2: Betting round complete - advancing phase', {
                lastRaiserIndex: this.lastRaiserIndex,
                currentPlayerIndex: this.currentPlayerIndex,
                nextPlayer,
                hasPassedLastRaiser: this.hasPassedLastRaiser,
                allBetsEqualized,
                phase: this.phase
            });
            console.log(`[Table ${this.name}] Betting round complete - advancing phase. Last raiser: ${this.lastRaiserIndex}, Current: ${this.currentPlayerIndex}, Next: ${nextPlayer}, HasPassed: ${this.hasPassedLastRaiser}, All equalized: ${allBetsEqualized}`);
            this.hasPassedLastRaiser = false;  // Reset for next betting round
            this.advancePhase();
            return;  // GUARANTEED EXIT - prevents loop
        }
        
        // EXIT POINT 3: Continue to next player (DEFAULT case)
        // If we reach here:
        // 1. nextPlayer !== -1 (checked in EXIT POINT 1)
        // 2. bettingRoundComplete === false (didn't return in EXIT POINT 2)
        // 3. Therefore we MUST continue to next player
        // This is the ONLY remaining path - guaranteed to execute
        
        if (allBetsEqualized && !bettingRoundComplete) {
            // All bets equalized but round not complete - give next player their turn
            gameLogger.gameEvent(this.name, 'EXIT POINT 3: Continuing - bets equalized but round not complete', {
                currentPlayerIndex: this.currentPlayerIndex,
                nextPlayer,
                lastRaiserIndex: this.lastRaiserIndex,
                allBetsEqualized
            });
            console.log(`[Table ${this.name}] All bets equalized but round not complete - continuing to next player. Current: ${this.currentPlayerIndex}, Next: ${nextPlayer}, LastRaiser: ${this.lastRaiserIndex}`);
        } else {
            // Bets not equalized - continue betting round
            gameLogger.gameEvent(this.name, 'EXIT POINT 3: Continuing - bets not equalized', {
                currentPlayerIndex: this.currentPlayerIndex,
                nextPlayer,
                allBetsEqualized
            });
            console.log(`[Table ${this.name}] Bets not equalized - continuing betting round. Current: ${this.currentPlayerIndex}, Next: ${nextPlayer}`);
        }
        
        // GUARANTEED: nextPlayer is valid (checked in EXIT POINT 1)
        const oldCurrentPlayer = this.currentPlayerIndex >= 0 ? this.seats[this.currentPlayerIndex]?.name : null;
        this.currentPlayerIndex = nextPlayer;
        const nextPlayerSeat = this.seats[this.currentPlayerIndex];
        
        // ============ LOOP DETECTION ============
        this.turnsThisPhase++;
        const playerId = nextPlayerSeat?.playerId || `seat_${nextPlayer}`;
        this.playerTurnCounts[playerId] = (this.playerTurnCounts[playerId] || 0) + 1;
        
        // Track CONSECUTIVE same-player turns (not total per phase)
        // A player acting multiple times is normal if there are raises in between
        // But the SAME player getting the turn multiple times IN A ROW is suspicious
        if (this.lastActingPlayer === playerId) {
            this.consecutiveSamePlayerTurns++;
        } else {
            this.consecutiveSamePlayerTurns = 1;
            this.lastActingPlayer = playerId;
        }
        
        // Only warn if same player acts consecutively without anyone else acting
        if (this.consecutiveSamePlayerTurns >= this.MAX_CONSECUTIVE_SAME_PLAYER) {
            gameLogger.gameEvent(this.name, `WARNING: POSSIBLE LOOP - Same player acting ${this.consecutiveSamePlayerTurns} times CONSECUTIVELY`, {
                player: nextPlayerSeat?.name,
                playerId,
                consecutiveTurns: this.consecutiveSamePlayerTurns,
                turnsThisPhase: this.turnsThisPhase,
                phase: this.phase
            });
            console.warn(`[Table ${this.name}] WARNING: ${nextPlayerSeat?.name} has acted ${this.consecutiveSamePlayerTurns} times IN A ROW - possible loop!`);
        }
        
        // Safety valve - force advance if too many turns
        if (this.turnsThisPhase >= this.MAX_TURNS_PER_PHASE) {
            gameLogger.gameEvent(this.name, `CRITICAL: LOOP DETECTED - Force advancing phase after ${this.turnsThisPhase} turns`, {
                phase: this.phase,
                turnsThisPhase: this.turnsThisPhase,
                playerTurnCounts: this.playerTurnCounts
            });
            console.error(`[Table ${this.name}] CRITICAL: Force advancing phase after ${this.turnsThisPhase} turns - loop detected!`);
            this.hasPassedLastRaiser = false;
            this.advancePhase();
            return;
        }
        
        // Check for stuck scenario: only one player has chips, others all-in
        const playersWithChips = this.seats.filter(s => s && !s.isFolded && !s.isAllIn && s.chips > 0);
        const allInPlayers = this.seats.filter(s => s && !s.isFolded && s.isAllIn);
        if (playersWithChips.length === 1 && allInPlayers.length > 0) {
            gameLogger.gameEvent(this.name, `WARNING: Only one player with chips, ${allInPlayers.length} all-in - checking if round should auto-complete`, {
                playerWithChips: playersWithChips[0]?.name,
                allInCount: allInPlayers.length,
                phase: this.phase
            });
            console.warn(`[Table ${this.name}] WARNING: Only ${playersWithChips[0]?.name} has chips, ${allInPlayers.length} players all-in`);
            
            // If bets are equalized, force advance
            const allBetsMatch = this.seats.every(s => !s || s.isFolded || s.isAllIn || s.currentBet === this.currentBet);
            if (allBetsMatch) {
                gameLogger.gameEvent(this.name, `Auto-advancing: All bets equalized, only one player can act`, {
                    phase: this.phase,
                    currentBet: this.currentBet
                });
                console.log(`[Table ${this.name}] Auto-advancing - all bets equalized, only one player can act`);
                this.hasPassedLastRaiser = false;
                this.advancePhase();
                return;
            }
        }
        // ============ END LOOP DETECTION ============
        
        gameLogger.turnChange(this.name, oldCurrentPlayer || `Seat ${this.currentPlayerIndex}`, nextPlayerSeat?.name || `Seat ${nextPlayer}`, {
            fromSeat: this.currentPlayerIndex !== nextPlayer ? this.currentPlayerIndex : null,
            toSeat: nextPlayer,
            phase: this.phase,
            currentBet: this.currentBet,
            playerBet: nextPlayerSeat?.currentBet,
            lastRaiserIndex: this.lastRaiserIndex,
            hasPassedLastRaiser: this.hasPassedLastRaiser,
            turnsThisPhase: this.turnsThisPhase,
            playerTurnCount: this.playerTurnCounts[playerId]
        });
        
        console.log(`[Table ${this.name}] Turn: ${nextPlayerSeat?.name} (seat ${this.currentPlayerIndex}, isBot: ${nextPlayerSeat?.isBot}, currentBet: ${nextPlayerSeat?.currentBet}/${this.currentBet}, lastRaiser: ${this.lastRaiserIndex}, hasPassed: ${this.hasPassedLastRaiser}, turnsThisPhase: ${this.turnsThisPhase})`);
        this.startTurnTimer();
        this.onStateChange?.();
        // GUARANTEED EXIT - function always returns here if we reach this point
    }

    advancePhase() {
        const oldPhase = this.phase;
        
        gameLogger.phaseChange(this.name, oldPhase, 'ADVANCING', {
            currentBet: this.currentBet,
            pot: this.pot,
            currentPlayerIndex: this.currentPlayerIndex,
            turnsThisPhase: this.turnsThisPhase
        });
        
        // Reset loop detection counters for new phase
        this.turnsThisPhase = 0;
        this.playerTurnCounts = {};
        this.lastActingPlayer = null;
        this.consecutiveSamePlayerTurns = 0;
        
        // Reset betting for new round
        for (const seat of this.seats) {
            if (seat) seat.currentBet = 0;
        }
        const oldCurrentBet = this.currentBet;
        this.currentBet = 0;
        this.minRaise = this.bigBlind;

        switch (this.phase) {
            case GAME_PHASES.PRE_FLOP:
                this.communityCards = [this.deck.draw(), this.deck.draw(), this.deck.draw()];
                this.phase = GAME_PHASES.FLOP;
                gameLogger.phaseChange(this.name, 'PRE_FLOP', 'FLOP', {
                    communityCards: this.communityCards.map(c => `${c.rank}${c.suit}`)
                });
                break;
            case GAME_PHASES.FLOP:
                this.communityCards.push(this.deck.draw());
                this.phase = GAME_PHASES.TURN;
                gameLogger.phaseChange(this.name, 'FLOP', 'TURN', {
                    turnCard: `${this.communityCards[this.communityCards.length - 1].rank}${this.communityCards[this.communityCards.length - 1].suit}`
                });
                break;
            case GAME_PHASES.TURN:
                this.communityCards.push(this.deck.draw());
                this.phase = GAME_PHASES.RIVER;
                gameLogger.phaseChange(this.name, 'TURN', 'RIVER', {
                    riverCard: `${this.communityCards[this.communityCards.length - 1].rank}${this.communityCards[this.communityCards.length - 1].suit}`
                });
                break;
            case GAME_PHASES.RIVER:
                this.showdown();
                return;
        }

        // Set first player after dealer
        this.currentPlayerIndex = this.getNextActivePlayer(this.dealerIndex);
        
        // If no one can act (all folded or all-in), advance to next phase immediately
        if (this.currentPlayerIndex === -1) {
            gameLogger.gameEvent(this.name, 'No active players - auto-advancing to next phase', {
                phase: this.phase,
                dealerIndex: this.dealerIndex
            });
            console.log(`[Table ${this.name}] No active players - running out board`);
            this.onStateChange?.();
            // Short delay before next phase for visual effect
            setTimeout(() => this.advancePhase(), 1000);
            return;
        }
        
        // CRITICAL FIX: Reset lastRaiserIndex to track first player to act this round
        // This is used to detect when we've completed a full betting round
        // If no one raises, we'll still advance phase when we get back to this player
        const oldLastRaiser = this.lastRaiserIndex;
        this.lastRaiserIndex = this.currentPlayerIndex;
        this.hasPassedLastRaiser = false;  // Reset flag for new betting round
        
        gameLogger.phaseChange(this.name, oldPhase, this.phase, {
            firstToAct: this.seats[this.currentPlayerIndex]?.name,
            seatIndex: this.currentPlayerIndex,
            dealerIndex: this.dealerIndex,
            oldLastRaiser,
            newLastRaiser: this.lastRaiserIndex,
            oldCurrentBet,
            newCurrentBet: this.currentBet,
            pot: this.pot
        });
        
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
        // CRITICAL: Filter out null/undefined cards before evaluation
        for (const player of activePlayers) {
            // Filter out any null/undefined cards (shouldn't happen, but safety check)
            const playerCards = (player.cards || []).filter(c => c && c.rank && c.suit);
            const communityCards = (this.communityCards || []).filter(c => c && c.rank && c.suit);
            
            if (playerCards.length < 2 || communityCards.length < 3) {
                console.error(`[Table ${this.name}] Invalid cards for ${player.name}: player=${playerCards.length}, community=${communityCards.length}`);
                player.handResult = { rank: 0, name: 'Invalid', values: [] };
                continue;
            }
            
            // CRITICAL: Deduplicate cards by rank+suit to prevent duplicate card evaluation bugs
            const allCards = [...playerCards, ...communityCards];
            const seen = new Set();
            const uniqueCards = allCards.filter(card => {
                const key = `${card.rank}-${card.suit}`;
                if (seen.has(key)) {
                    console.warn(`[Table ${this.name}] DUPLICATE CARD DETECTED for ${player.name}: ${card.rank}${card.suit}`);
                    return false;
                }
                seen.add(key);
                return true;
            });
            
            if (uniqueCards.length !== allCards.length) {
                console.error(`[Table ${this.name}] CARD DUPLICATES DETECTED for ${player.name}: had ${allCards.length}, now ${uniqueCards.length}`);
            }
            
            console.log(`[Table ${this.name}] Evaluating hand for ${player.name}: ${uniqueCards.map(c => `${c.rank}${c.suit}`).join(' ')}`);
            
            player.handResult = HandEvaluator.evaluate(uniqueCards);
            console.log(`[Table ${this.name}] ${player.name} has: ${player.handResult.name} (rank ${player.handResult.rank})`);
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
        // CRITICAL: Eliminated players don't get chips back - they're out!
        for (const award of potAwards) {
            const seat = this.seats.find(s => s?.playerId === award.playerId);
            if (seat && seat.isActive !== false) {
                // Only award chips to active (non-eliminated) players
                seat.chips += award.amount;
                console.log(`[Table ${this.name}] ${award.name} wins ${award.amount} from ${award.potType} pot with ${award.handName}`);
            } else if (seat && seat.isActive === false) {
                // Player is eliminated - don't give them chips, pot goes to remaining players or is lost
                console.log(`[Table ${this.name}] ${award.name} is eliminated - ${award.amount} chips from pot are forfeited`);
                // Note: In a real game, this shouldn't happen, but handle it gracefully
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
        // CRITICAL: Eliminated players don't get chips back - they're out!
        const seat = this.seats.find(s => s?.playerId === winner.playerId);
        const potAmount = this.pot;
        
        if (seat && seat.isActive !== false) {
            // Only award chips to active (non-eliminated) players
            seat.chips += potAmount;
        } else if (seat && seat.isActive === false) {
            // Player is eliminated - don't give them chips
            console.log(`[Table ${this.name}] ${seat.name} is eliminated - pot forfeited`);
            // In a real game, this shouldn't happen (eliminated players shouldn't win)
            // But handle it gracefully - pot is lost
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
        gameLogger.spectator(this.name, 'addSpectator called', {
            userId, name, socketId, 
            allowSpectators: this.allowSpectators,
            currentSpectators: this.spectators.size,
            maxSpectators: this.maxSpectators,
            isSimulation: this.isSimulation
        });
        
        if (!this.allowSpectators) {
            gameLogger.spectator(this.name, 'addSpectator REJECTED: spectators not allowed', { userId, name });
            return { success: false, error: 'Spectators not allowed' };
        }
        if (this.spectators.size >= this.maxSpectators) {
            gameLogger.spectator(this.name, 'addSpectator REJECTED: limit reached', { userId, name });
            return { success: false, error: 'Spectator limit reached' };
        }
        
        this.spectators.set(userId, { oderId: userId, playerName: name, socketId });
        gameLogger.spectator(this.name, 'Spectator added successfully', {
            userId, name,
            totalSpectators: this.spectators.size,
            allSpectatorIds: Array.from(this.spectators.keys())
        });
        return { success: true };
    }

    removeSpectator(userId) {
        this.spectators.delete(userId);
    }

    getSpectatorCount() {
        return this.spectators.size;
    }

    isSpectator(userId) {
        const result = this.spectators.has(userId);
        // Log for ALL tables so we can compare normal vs simulation
        gameLogger.spectator(this.name, `isSpectator check`, {
            userId,
            result,
            isSimulation: this.isSimulation,
            spectatorIds: Array.from(this.spectators.keys())
        });
        return result;
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
        
        // Log state request for ALL tables
        gameLogger.stateBroadcast(this.name, 'getState called', {
            forPlayerId,
            isSpectating,
            isSimulation: this.isSimulation,
            phase: this.phase,
            spectatorIds: Array.from(this.spectators.keys()),
            currentPlayerId: currentPlayer?.playerId || null
        });
        
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
            isSimulation: this.isSimulation,
            practiceMode: this.practiceMode,
            houseRules: this.houseRules?.toJSON?.() || null,
            sidePot: this.getSidePotState(forPlayerId),
            seats: this.seats.map((seat, index) => {
                if (!seat) return null;
                
                // Spectators never see hole cards (except showdown) - UNLESS simulation mode
                // Players only see their own cards (except showdown)
                // During showdown, only show cards of players who are still in (not folded)
                // SIMULATION MODE: Spectators (including creator) can see ALL cards for debugging
                const canSeeCards = (this.isSimulation && isSpectating) || 
                    (!isSpectating && (
                        seat.playerId === forPlayerId || 
                        (this.phase === GAME_PHASES.SHOWDOWN && !seat.isFolded)
                    ));
                
                // FIX: Ensure cards are preserved - don't lose them if array is null/undefined
                let cards = [];
                if (seat.cards && Array.isArray(seat.cards)) {
                    cards = canSeeCards ? seat.cards : seat.cards.map(() => ({ rank: null, suit: null }));
                }
                
                // DEBUG: Log card visibility for ALL tables (not just simulation)
                if (seat.cards?.length > 0) {
                    gameLogger.cardVisibility(this.name, `${seat.name} cards for viewer ${forPlayerId}`, {
                        isSimulation: this.isSimulation,
                        isSpectating,
                        canSeeCards,
                        viewerId: forPlayerId,
                        playerId: seat.playerId,
                        phase: this.phase,
                        cardsVisible: canSeeCards ? seat.cards : 'HIDDEN'
                    });
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

