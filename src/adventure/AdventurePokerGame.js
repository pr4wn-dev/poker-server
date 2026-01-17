/**
 * AdventurePokerGame - Heads-up poker game engine for adventure mode
 * Manages a single poker hand between player and boss
 */

const Deck = require('../game/Deck');
const HandEvaluator = require('../game/HandEvaluator');
const BossAI = require('./BossAI');

const PHASES = {
    WAITING: 'waiting',
    PREFLOP: 'preflop',
    FLOP: 'flop',
    TURN: 'turn',
    RIVER: 'river',
    SHOWDOWN: 'showdown'
};

const POSITIONS = {
    PLAYER: 0,
    BOSS: 1
};

class AdventurePokerGame {
    constructor(session, boss) {
        this.session = session;
        this.boss = boss;
        this.bossAI = new BossAI(boss);
        
        // Blinds (scaled to chip stacks)
        this.smallBlind = Math.max(50, Math.floor(Math.min(session.userChips, session.bossChips) / 100));
        this.bigBlind = this.smallBlind * 2;
        
        // Game state
        this.deck = new Deck();
        this.phase = PHASES.WAITING;
        this.pot = 0;
        this.currentBet = 0;
        this.minRaise = this.bigBlind;
        
        // Cards
        this.playerCards = [];
        this.bossCards = [];
        this.communityCards = [];
        
        // Betting state
        this.playerBet = 0;
        this.bossBet = 0;
        this.playerChips = session.userChips;
        this.bossChips = session.bossChips;
        this.playerFolded = false;
        this.bossFolded = false;
        this.playerAllIn = false;
        this.bossAllIn = false;
        
        // Turn tracking (heads-up: button is SB, acts first preflop, last postflop)
        this.dealerIsPlayer = Math.random() > 0.5;
        this.isPlayerTurn = false;
        this.lastAggressor = null;
        this.actionsThisRound = 0;
    }
    
    /**
     * Start a new hand
     */
    startHand() {
        // Reset
        this.deck.shuffle();
        this.phase = PHASES.PREFLOP;
        this.pot = 0;
        this.currentBet = 0;
        this.minRaise = this.bigBlind;
        
        this.playerCards = [];
        this.bossCards = [];
        this.communityCards = [];
        
        this.playerBet = 0;
        this.bossBet = 0;
        this.playerFolded = false;
        this.bossFolded = false;
        this.playerAllIn = false;
        this.bossAllIn = false;
        this.actionsThisRound = 0;
        this.lastAggressor = null;
        
        // Alternate dealer
        this.dealerIsPlayer = !this.dealerIsPlayer;
        
        // Post blinds (heads-up: dealer posts SB, other posts BB)
        if (this.dealerIsPlayer) {
            this.postBlind('player', this.smallBlind);
            this.postBlind('boss', this.bigBlind);
        } else {
            this.postBlind('boss', this.smallBlind);
            this.postBlind('player', this.bigBlind);
        }
        this.currentBet = this.bigBlind;
        
        // Deal hole cards
        this.playerCards = [this.deck.draw(), this.deck.draw()];
        this.bossCards = [this.deck.draw(), this.deck.draw()];
        
        // In heads-up, dealer (SB) acts first preflop
        this.isPlayerTurn = this.dealerIsPlayer;
        
        return this.getState();
    }
    
    postBlind(who, amount) {
        if (who === 'player') {
            const actualAmount = Math.min(amount, this.playerChips);
            this.playerChips -= actualAmount;
            this.playerBet = actualAmount;
            this.pot += actualAmount;
            if (this.playerChips === 0) this.playerAllIn = true;
        } else {
            const actualAmount = Math.min(amount, this.bossChips);
            this.bossChips -= actualAmount;
            this.bossBet = actualAmount;
            this.pot += actualAmount;
            if (this.bossChips === 0) this.bossAllIn = true;
        }
    }
    
    /**
     * Process player action
     */
    handlePlayerAction(action, amount = 0) {
        if (!this.isPlayerTurn || this.playerFolded || this.playerAllIn) {
            return { success: false, error: 'Not your turn' };
        }
        
        const result = this.processAction('player', action, amount);
        if (result.success) {
            this.actionsThisRound++;
            this.advanceGame();
        }
        
        return result;
    }
    
    /**
     * Get boss AI action
     */
    getBossAction() {
        if (this.isPlayerTurn || this.bossFolded || this.bossAllIn) {
            return null;
        }
        
        const gameState = {
            holeCards: this.bossCards,
            communityCards: this.communityCards,
            phase: this.phase,
            pot: this.pot,
            currentBet: this.currentBet,
            bossCurrentBet: this.bossBet,
            bossChips: this.bossChips,
            playerChips: this.playerChips,
            minRaise: this.minRaise,
            bigBlind: this.bigBlind
        };
        
        const decision = this.bossAI.makeDecision(gameState);
        const result = this.processAction('boss', decision.action, decision.amount || 0);
        
        if (result.success) {
            this.actionsThisRound++;
            result.action = decision.action;
            result.amount = decision.amount || 0;
            result.taunt = this.bossAI.getTaunt(decision.action);
        }
        
        return result;
    }
    
    /**
     * Process an action for player or boss
     */
    processAction(who, action, amount = 0) {
        const isPlayer = who === 'player';
        const chips = isPlayer ? this.playerChips : this.bossChips;
        const currentBet = isPlayer ? this.playerBet : this.bossBet;
        const toCall = this.currentBet - currentBet;
        
        let result = { success: false, error: 'Invalid action' };
        
        switch (action.toLowerCase()) {
            case 'fold':
                if (isPlayer) this.playerFolded = true;
                else this.bossFolded = true;
                result = { success: true, action: 'fold' };
                break;
                
            case 'check':
                if (toCall > 0) {
                    result = { success: false, error: 'Cannot check - must call or fold' };
                } else {
                    result = { success: true, action: 'check' };
                }
                break;
                
            case 'call':
                const callAmount = Math.min(toCall, chips);
                this.placeBet(who, callAmount);
                result = { success: true, action: 'call', amount: callAmount };
                break;
                
            case 'bet':
                if (this.currentBet > 0) {
                    result = { success: false, error: 'Use raise instead' };
                } else if (amount < this.bigBlind) {
                    result = { success: false, error: `Minimum bet is ${this.bigBlind}` };
                } else {
                    const betAmount = Math.min(amount, chips);
                    this.placeBet(who, betAmount);
                    this.currentBet = isPlayer ? this.playerBet : this.bossBet;
                    this.minRaise = betAmount;
                    this.lastAggressor = who;
                    result = { success: true, action: 'bet', amount: betAmount };
                }
                break;
                
            case 'raise':
                const raiseTotal = amount;
                const raiseAmount = raiseTotal - toCall;
                if (raiseAmount < this.minRaise && raiseTotal < chips) {
                    result = { success: false, error: `Minimum raise is ${this.minRaise}` };
                } else {
                    const actualRaise = Math.min(raiseTotal, chips);
                    this.placeBet(who, actualRaise);
                    this.currentBet = isPlayer ? this.playerBet : this.bossBet;
                    this.minRaise = Math.max(raiseAmount, this.minRaise);
                    this.lastAggressor = who;
                    result = { success: true, action: 'raise', amount: actualRaise };
                }
                break;
                
            case 'allin':
                const allInAmount = chips;
                this.placeBet(who, allInAmount);
                if ((isPlayer ? this.playerBet : this.bossBet) > this.currentBet) {
                    this.currentBet = isPlayer ? this.playerBet : this.bossBet;
                    this.lastAggressor = who;
                }
                result = { success: true, action: 'allin', amount: allInAmount };
                break;
        }
        
        return result;
    }
    
    placeBet(who, amount) {
        if (who === 'player') {
            this.playerChips -= amount;
            this.playerBet += amount;
            this.pot += amount;
            if (this.playerChips === 0) this.playerAllIn = true;
        } else {
            this.bossChips -= amount;
            this.bossBet += amount;
            this.pot += amount;
            if (this.bossChips === 0) this.bossAllIn = true;
        }
    }
    
    /**
     * Advance the game after an action
     */
    advanceGame() {
        // Check for fold
        if (this.playerFolded || this.bossFolded) {
            this.awardPot(this.playerFolded ? 'boss' : 'player');
            return;
        }
        
        // Check if betting round is complete
        const betsEqualized = this.playerBet === this.bossBet;
        const bothActed = this.actionsThisRound >= 2;
        const bothAllIn = this.playerAllIn && this.bossAllIn;
        const oneAllInOtherCalled = (this.playerAllIn || this.bossAllIn) && betsEqualized;
        
        if ((betsEqualized && bothActed) || bothAllIn || oneAllInOtherCalled) {
            this.advancePhase();
        } else {
            // Switch turns
            this.isPlayerTurn = !this.isPlayerTurn;
        }
    }
    
    advancePhase() {
        // Reset for new betting round
        this.playerBet = 0;
        this.bossBet = 0;
        this.currentBet = 0;
        this.minRaise = this.bigBlind;
        this.actionsThisRound = 0;
        
        // Both all-in? Run out the board
        const bothAllIn = this.playerAllIn && this.bossAllIn;
        
        switch (this.phase) {
            case PHASES.PREFLOP:
                this.communityCards = [this.deck.draw(), this.deck.draw(), this.deck.draw()];
                this.phase = PHASES.FLOP;
                break;
            case PHASES.FLOP:
                this.communityCards.push(this.deck.draw());
                this.phase = PHASES.TURN;
                break;
            case PHASES.TURN:
                this.communityCards.push(this.deck.draw());
                this.phase = PHASES.RIVER;
                break;
            case PHASES.RIVER:
                this.showdown();
                return;
        }
        
        // If both all-in, immediately advance to next phase
        if (bothAllIn) {
            this.advancePhase();
            return;
        }
        
        // Post-flop: non-dealer acts first (opposite of preflop)
        this.isPlayerTurn = !this.dealerIsPlayer;
    }
    
    showdown() {
        this.phase = PHASES.SHOWDOWN;
        
        // Evaluate hands
        const playerHand = HandEvaluator.evaluate([...this.playerCards, ...this.communityCards]);
        const bossHand = HandEvaluator.evaluate([...this.bossCards, ...this.communityCards]);
        
        const comparison = HandEvaluator.compare(playerHand, bossHand);
        
        if (comparison > 0) {
            this.awardPot('player');
        } else if (comparison < 0) {
            this.awardPot('boss');
        } else {
            // Split pot
            const half = Math.floor(this.pot / 2);
            this.playerChips += half;
            this.bossChips += this.pot - half;
            this.winner = 'tie';
            this.pot = 0;
        }
        
        this.playerHandResult = playerHand;
        this.bossHandResult = bossHand;
    }
    
    awardPot(winner) {
        if (winner === 'player') {
            this.playerChips += this.pot;
        } else {
            this.bossChips += this.pot;
        }
        this.winner = winner;
        this.pot = 0;
    }
    
    /**
     * Check if hand is complete
     */
    isHandComplete() {
        return this.phase === PHASES.SHOWDOWN || this.playerFolded || this.bossFolded;
    }
    
    /**
     * Check if game is over (someone busted)
     */
    isGameOver() {
        return this.playerChips <= 0 || this.bossChips <= 0;
    }
    
    /**
     * Get current game state for client
     */
    getState() {
        return {
            phase: this.phase,
            pot: this.pot,
            currentBet: this.currentBet,
            minRaise: this.minRaise,
            communityCards: this.communityCards,
            
            // Player state
            playerCards: this.playerCards,
            playerChips: this.playerChips,
            playerBet: this.playerBet,
            playerFolded: this.playerFolded,
            playerAllIn: this.playerAllIn,
            
            // Boss state (cards hidden until showdown)
            bossChips: this.bossChips,
            bossBet: this.bossBet,
            bossFolded: this.bossFolded,
            bossAllIn: this.bossAllIn,
            bossCards: this.phase === PHASES.SHOWDOWN ? this.bossCards : null,
            
            // Turn info
            isPlayerTurn: this.isPlayerTurn,
            isHandComplete: this.isHandComplete(),
            
            // Results (if complete)
            winner: this.winner,
            playerHandResult: this.playerHandResult,
            bossHandResult: this.bossHandResult,
            
            // Valid actions for player
            validActions: this.isPlayerTurn ? this.getValidActions() : []
        };
    }
    
    getValidActions() {
        if (!this.isPlayerTurn || this.playerFolded || this.playerAllIn) {
            return [];
        }
        
        const toCall = this.currentBet - this.playerBet;
        const actions = ['fold'];
        
        if (toCall === 0) {
            actions.push('check');
            if (this.playerChips > 0) {
                actions.push('bet');
            }
        } else {
            actions.push('call');
            if (this.playerChips > toCall) {
                actions.push('raise');
            }
        }
        
        if (this.playerChips > 0) {
            actions.push('allin');
        }
        
        return actions;
    }
}

module.exports = AdventurePokerGame;

