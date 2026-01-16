/**
 * Table - Represents a poker table with game state
 */

const Deck = require('./Deck');
const HandEvaluator = require('./HandEvaluator');

const GAME_PHASES = {
    WAITING: 'waiting',
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
        
        // New: Password protection
        this.password = options.password || null;
        this.hasPassword = !!options.password;
        
        // New: Creator/Host
        this.creatorId = options.creatorId || null;
        this.createdAt = Date.now();
        
        // New: House Rules
        this.houseRules = options.houseRules || null;
        
        // New: Spectators
        this.spectators = new Map();  // oderId -> { oderId, name, oderId }
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

        // Position tracking
        this.dealerIndex = -1;
        this.currentPlayerIndex = -1;
        this.lastRaiserIndex = -1;

        // Timing
        this.turnTimeout = null;
        this.turnTimeLimit = 30000; // 30 seconds per turn
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

        this.seats[seatIndex] = {
            playerId,
            name,
            chips,
            cards: [],
            currentBet: 0,
            totalBet: 0,
            isActive: true,
            isFolded: false,
            isAllIn: false,
            isConnected: true
        };

        console.log(`[Table ${this.name}] ${name} joined at seat ${seatIndex}`);

        // Auto-start game if enough players
        if (this.phase === GAME_PHASES.WAITING && this.getActivePlayerCount() >= 2) {
            setTimeout(() => this.startNewHand(), 3000);
        }

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

        console.log(`[Table ${this.name}] Starting new hand`);

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
        this.lastRaiserIndex = this.currentPlayerIndex;
    }

    showdown() {
        this.phase = GAME_PHASES.SHOWDOWN;
        
        const activePlayers = this.seats
            .map((seat, index) => seat && !seat.isFolded ? { ...seat, seatIndex: index } : null)
            .filter(p => p !== null);

        // Evaluate hands
        for (const player of activePlayers) {
            player.handResult = HandEvaluator.evaluate([...player.cards, ...this.communityCards]);
        }

        // Sort by hand strength (descending)
        activePlayers.sort((a, b) => HandEvaluator.compare(b.handResult, a.handResult));

        // Award pot (simplified - doesn't handle split pots/side pots fully)
        const winner = activePlayers[0];
        this.awardPot(winner);

        console.log(`[Table ${this.name}] ${winner.name} wins with ${winner.handResult.name}`);

        setTimeout(() => this.startNewHand(), 5000);
    }

    awardPot(winner) {
        const seat = this.seats.find(s => s?.playerId === winner.playerId);
        if (seat) {
            seat.chips += this.pot;
        }
        this.pot = 0;
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
            isPrivate: this.isPrivate,
            hasPassword: this.hasPassword,
            gameStarted: this.gameStarted,
            allowSpectators: this.allowSpectators,
            houseRulesPreset: this.houseRules?.bettingType || 'standard',
            createdAt: this.createdAt
        };
    }

    getState(forPlayerId = null) {
        const isSpectating = this.isSpectator(forPlayerId);
        
        return {
            id: this.id,
            name: this.name,
            phase: this.phase,
            pot: this.pot,
            communityCards: this.communityCards,
            currentBet: this.currentBet,
            dealerIndex: this.dealerIndex,
            currentPlayerIndex: this.currentPlayerIndex,
            handsPlayed: this.handsPlayed,
            spectatorCount: this.getSpectatorCount(),
            isSpectating: isSpectating,
            houseRules: this.houseRules?.toJSON?.() || null,
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
                    cards: canSeeCards ? seat.cards : seat.cards.map(() => null)
                };
            })
        };
    }
}

Table.PHASES = GAME_PHASES;
Table.ACTIONS = ACTIONS;

module.exports = Table;

