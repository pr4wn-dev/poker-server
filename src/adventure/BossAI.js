/**
 * BossAI - Poker AI for adventure mode bosses
 * Makes decisions based on boss play style and skill level
 */

const HandEvaluator = require('../game/HandEvaluator');

// Play style constants
const PLAY_STYLE = {
    PASSIVE: 'passive',
    AGGRESSIVE: 'aggressive',
    TIGHT: 'tight',
    LOOSE: 'loose',
    TRICKY: 'tricky',
    BALANCED: 'balanced'
};

class BossAI {
    /**
     * Create a BossAI decision maker
     * @param {Object} boss - The boss configuration
     */
    constructor(boss) {
        this.boss = boss;
        this.playStyle = boss.playStyle || PLAY_STYLE.BALANCED;
        this.skillLevel = boss.skillLevel || 0.5; // 0-1, higher = better
        this.aggressiveness = this.calculateAggressiveness();
        this.tightness = this.calculateTightness();
        this.bluffFrequency = this.calculateBluffFrequency();
    }
    
    /**
     * Calculate base aggressiveness from play style
     */
    calculateAggressiveness() {
        const base = {
            [PLAY_STYLE.PASSIVE]: 0.2,
            [PLAY_STYLE.AGGRESSIVE]: 0.8,
            [PLAY_STYLE.TIGHT]: 0.4,
            [PLAY_STYLE.LOOSE]: 0.5,
            [PLAY_STYLE.TRICKY]: 0.6,
            [PLAY_STYLE.BALANCED]: 0.5
        };
        return base[this.playStyle] || 0.5;
    }
    
    /**
     * Calculate tightness (how selective with starting hands)
     */
    calculateTightness() {
        const base = {
            [PLAY_STYLE.PASSIVE]: 0.5,
            [PLAY_STYLE.AGGRESSIVE]: 0.4,
            [PLAY_STYLE.TIGHT]: 0.8,
            [PLAY_STYLE.LOOSE]: 0.2,
            [PLAY_STYLE.TRICKY]: 0.5,
            [PLAY_STYLE.BALANCED]: 0.5
        };
        return base[this.playStyle] || 0.5;
    }
    
    /**
     * Calculate bluff frequency
     */
    calculateBluffFrequency() {
        const base = {
            [PLAY_STYLE.PASSIVE]: 0.05,
            [PLAY_STYLE.AGGRESSIVE]: 0.2,
            [PLAY_STYLE.TIGHT]: 0.05,
            [PLAY_STYLE.LOOSE]: 0.15,
            [PLAY_STYLE.TRICKY]: 0.35,
            [PLAY_STYLE.BALANCED]: 0.15
        };
        return base[this.playStyle] || 0.15;
    }
    
    /**
     * Make a decision for the current game state
     * @param {Object} gameState - Current game state
     * @returns {Object} { action: string, amount?: number }
     */
    makeDecision(gameState) {
        const {
            holeCards,       // Boss's hole cards [{ rank, suit }]
            communityCards,  // Community cards on table
            phase,           // 'preflop', 'flop', 'turn', 'river'
            pot,             // Total pot size
            currentBet,      // Current bet to match
            bossCurrentBet,  // Boss's current bet this round
            bossChips,       // Boss's remaining chips
            playerChips,     // Player's remaining chips
            minRaise,        // Minimum raise amount
            bigBlind         // Big blind amount
        } = gameState;
        
        const toCall = currentBet - bossCurrentBet;
        const canCheck = toCall === 0;
        
        // Calculate hand strength
        const allCards = [...(holeCards || []), ...(communityCards || [])];
        const handStrength = this.evaluateHandStrength(holeCards, communityCards, phase);
        
        // Add some randomness based on skill level (lower skill = more random)
        const randomFactor = (1 - this.skillLevel) * (Math.random() - 0.5) * 0.3;
        const adjustedStrength = Math.max(0, Math.min(1, handStrength + randomFactor));
        
        // Calculate pot odds
        const potOdds = toCall > 0 ? toCall / (pot + toCall) : 0;
        
        // Decision making
        return this.decideAction({
            handStrength: adjustedStrength,
            potOdds,
            toCall,
            canCheck,
            pot,
            bossChips,
            playerChips,
            minRaise,
            bigBlind,
            phase,
            currentBet
        });
    }
    
    /**
     * Evaluate hand strength (0-1)
     */
    evaluateHandStrength(holeCards, communityCards, phase) {
        if (!holeCards || holeCards.length < 2) return 0.5;
        
        // Pre-flop: evaluate starting hand
        if (phase === 'preflop' || !communityCards || communityCards.length === 0) {
            return this.evaluatePreflopStrength(holeCards);
        }
        
        // Post-flop: evaluate made hand + potential
        return this.evaluatePostflopStrength(holeCards, communityCards);
    }
    
    /**
     * Evaluate preflop hand strength
     */
    evaluatePreflopStrength(holeCards) {
        const [card1, card2] = holeCards;
        const rank1 = this.rankValue(card1.rank);
        const rank2 = this.rankValue(card2.rank);
        const suited = card1.suit === card2.suit;
        const paired = rank1 === rank2;
        const connected = Math.abs(rank1 - rank2) === 1;
        const gapped = Math.abs(rank1 - rank2) <= 3;
        
        let strength = 0;
        
        // Pairs
        if (paired) {
            strength = 0.5 + (rank1 / 14) * 0.5; // AA = 1.0, 22 = 0.57
        } else {
            // High cards
            const highCard = Math.max(rank1, rank2);
            const lowCard = Math.min(rank1, rank2);
            strength = (highCard / 14) * 0.4 + (lowCard / 14) * 0.2;
            
            // Suited bonus
            if (suited) strength += 0.08;
            
            // Connectedness bonus
            if (connected) strength += 0.06;
            else if (gapped) strength += 0.03;
            
            // Broadway bonus (both 10+)
            if (lowCard >= 10) strength += 0.1;
        }
        
        return Math.min(1, Math.max(0, strength));
    }
    
    /**
     * Evaluate postflop hand strength
     */
    evaluatePostflopStrength(holeCards, communityCards) {
        try {
            const allCards = [...holeCards, ...communityCards];
            const hand = HandEvaluator.evaluate(allCards);
            
            // Map hand rank to strength (0-1)
            const rankStrength = {
                'royal-flush': 1.0,
                'straight-flush': 0.98,
                'four-of-a-kind': 0.95,
                'full-house': 0.88,
                'flush': 0.8,
                'straight': 0.7,
                'three-of-a-kind': 0.6,
                'two-pair': 0.5,
                'pair': 0.35,
                'high-card': 0.2
            };
            
            let baseStrength = rankStrength[hand.rank] || 0.2;
            
            // Adjust based on kickers/card values
            if (hand.cards && hand.cards.length > 0) {
                const avgCardValue = hand.cards.reduce((sum, c) => 
                    sum + this.rankValue(c.rank), 0) / hand.cards.length;
                baseStrength += (avgCardValue / 14) * 0.1;
            }
            
            return Math.min(1, baseStrength);
        } catch (e) {
            // Fallback if evaluation fails
            return 0.3;
        }
    }
    
    /**
     * Decide action based on calculated factors
     */
    decideAction(factors) {
        const {
            handStrength,
            potOdds,
            toCall,
            canCheck,
            pot,
            bossChips,
            playerChips,
            minRaise,
            bigBlind,
            phase,
            currentBet
        } = factors;
        
        // Strong hand (top 25%)
        if (handStrength > 0.75) {
            return this.playStrongHand(factors);
        }
        
        // Medium hand (25-50%)
        if (handStrength > 0.4) {
            return this.playMediumHand(factors);
        }
        
        // Weak hand
        return this.playWeakHand(factors);
    }
    
    /**
     * Play a strong hand
     */
    playStrongHand(factors) {
        const { toCall, pot, bossChips, minRaise, bigBlind, canCheck, currentBet } = factors;
        
        const random = Math.random();
        
        // Tricky style might slow-play
        if (this.playStyle === PLAY_STYLE.TRICKY && random < 0.3) {
            if (canCheck) return { action: 'check' };
            if (toCall < pot * 0.3) return { action: 'call' };
        }
        
        // Usually bet/raise with strong hands
        if (random < this.aggressiveness + 0.3) {
            const raiseAmount = this.calculateRaiseAmount(factors, 'strong');
            
            if (raiseAmount >= bossChips) {
                return { action: 'allin' };
            }
            
            if (currentBet > 0) {
                return { action: 'raise', amount: raiseAmount };
            } else {
                return { action: 'bet', amount: raiseAmount };
            }
        }
        
        // Sometimes just call to trap
        if (toCall > 0) {
            return { action: 'call' };
        }
        
        return { action: 'check' };
    }
    
    /**
     * Play a medium hand
     */
    playMediumHand(factors) {
        const { handStrength, potOdds, toCall, pot, bossChips, canCheck, minRaise, currentBet } = factors;
        
        const random = Math.random();
        
        // Can check - sometimes bet for value/protection
        if (canCheck) {
            if (random < this.aggressiveness * 0.5) {
                const betAmount = this.calculateRaiseAmount(factors, 'medium');
                return { action: 'bet', amount: betAmount };
            }
            return { action: 'check' };
        }
        
        // Facing a bet
        // Good pot odds or good hand - call
        if (handStrength > potOdds + 0.1 || random < 0.3) {
            if (toCall >= bossChips) {
                // All-in decision
                if (handStrength > 0.6) {
                    return { action: 'allin' };
                }
                return { action: 'fold' };
            }
            
            // Sometimes raise
            if (random < this.aggressiveness * 0.3 && handStrength > 0.5) {
                const raiseAmount = this.calculateRaiseAmount(factors, 'medium');
                return { action: 'raise', amount: raiseAmount };
            }
            
            return { action: 'call' };
        }
        
        // Bad odds - fold
        return { action: 'fold' };
    }
    
    /**
     * Play a weak hand
     */
    playWeakHand(factors) {
        const { toCall, pot, bossChips, canCheck, bigBlind, currentBet, minRaise } = factors;
        
        const random = Math.random();
        
        // Can check - usually check, sometimes bluff
        if (canCheck) {
            if (random < this.bluffFrequency) {
                const betAmount = this.calculateRaiseAmount(factors, 'bluff');
                return { action: 'bet', amount: betAmount };
            }
            return { action: 'check' };
        }
        
        // Facing a bet
        // Small bet and loose player - sometimes call
        if (toCall <= bigBlind * 2 && this.tightness < 0.4 && random < 0.3) {
            return { action: 'call' };
        }
        
        // Bluff raise
        if (random < this.bluffFrequency * 0.5 && toCall < pot * 0.3) {
            const raiseAmount = this.calculateRaiseAmount(factors, 'bluff');
            if (raiseAmount < bossChips * 0.3) {
                return { action: 'raise', amount: raiseAmount };
            }
        }
        
        // Usually fold weak hands to aggression
        return { action: 'fold' };
    }
    
    /**
     * Calculate raise amount based on hand type
     */
    calculateRaiseAmount(factors, handType) {
        const { pot, bossChips, minRaise, bigBlind, currentBet } = factors;
        
        let multiplier;
        
        switch (handType) {
            case 'strong':
                // Value bet - 60-100% of pot
                multiplier = 0.6 + Math.random() * 0.4;
                break;
            case 'medium':
                // Smaller bet - 40-60% of pot
                multiplier = 0.4 + Math.random() * 0.2;
                break;
            case 'bluff':
                // Bluff - 50-75% of pot (credible sizing)
                multiplier = 0.5 + Math.random() * 0.25;
                break;
            default:
                multiplier = 0.5;
        }
        
        let amount = Math.floor(pot * multiplier);
        
        // Ensure minimum raise
        amount = Math.max(amount, minRaise || bigBlind * 2);
        
        // Cap at stack
        amount = Math.min(amount, bossChips);
        
        // Round to nice numbers
        if (amount > 100) {
            amount = Math.round(amount / 25) * 25;
        }
        
        return amount;
    }
    
    /**
     * Get random taunt from boss
     */
    getTaunt(situation = 'general') {
        const taunts = this.boss.taunts || ['...'];
        return taunts[Math.floor(Math.random() * taunts.length)];
    }
    
    /**
     * Get win quote
     */
    getWinQuote() {
        const quotes = this.boss.winQuotes || ['I win!'];
        return quotes[Math.floor(Math.random() * quotes.length)];
    }
    
    /**
     * Get lose quote
     */
    getLoseQuote() {
        const quotes = this.boss.loseQuotes || ['You got lucky!'];
        return quotes[Math.floor(Math.random() * quotes.length)];
    }
    
    /**
     * Convert card rank to numeric value
     */
    rankValue(rank) {
        const values = {
            '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
            '9': 9, '10': 10, 'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14
        };
        return values[rank?.toUpperCase()] || 0;
    }
}

module.exports = BossAI;
module.exports.PLAY_STYLE = PLAY_STYLE;









