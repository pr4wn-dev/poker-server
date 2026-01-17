/**
 * BotPlayer.js - AI bot player for poker tables
 * 
 * Each bot has a personality that affects their play style:
 * - Tex: Aggressive - bets big, bluffs often
 * - Lazy Larry: Passive - mostly checks/calls
 * - Pickles: Unpredictable - random decisions
 */

class BotPlayer {
    constructor(name, personality = 'balanced') {
        this.id = `bot_${name.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`;
        this.name = name;
        this.personality = personality;
        this.isBot = true;
        this.chips = 0;
        this.currentBet = 0;
        this.cards = [];
        this.folded = false;
        this.allIn = false;
        this.sittingOut = false;
        
        // Personality traits (0-1 scale)
        this.traits = this.getPersonalityTraits(personality);
    }
    
    getPersonalityTraits(personality) {
        const personalities = {
            aggressive: {
                aggression: 0.85,      // How often to bet/raise vs check/call
                bluffFrequency: 0.4,   // How often to bluff with weak hands
                tightness: 0.3,        // How selective with starting hands (lower = plays more hands)
                callThreshold: 0.25,   // Minimum hand strength to call
                raiseThreshold: 0.5,   // Minimum hand strength to raise
                allInThreshold: 0.75,  // Minimum hand strength to go all-in
                name: 'Tex'
            },
            passive: {
                aggression: 0.2,
                bluffFrequency: 0.05,
                tightness: 0.6,
                callThreshold: 0.3,
                raiseThreshold: 0.7,
                allInThreshold: 0.9,
                name: 'Lazy Larry'
            },
            unpredictable: {
                aggression: 0.5,
                bluffFrequency: 0.3,
                tightness: 0.4,
                callThreshold: 0.2,
                raiseThreshold: 0.4,
                allInThreshold: 0.6,
                name: 'Pickles'
            },
            balanced: {
                aggression: 0.5,
                bluffFrequency: 0.15,
                tightness: 0.5,
                callThreshold: 0.35,
                raiseThreshold: 0.6,
                allInThreshold: 0.8,
                name: 'Bot'
            }
        };
        
        return personalities[personality] || personalities.balanced;
    }
    
    /**
     * Decide what action to take
     * @param {Object} gameState - Current game state
     * @returns {Object} { action: string, amount?: number }
     */
    decide(gameState) {
        const { 
            currentBet,      // Current bet to call
            pot,             // Total pot size
            minRaise,        // Minimum raise amount
            maxBet,          // Maximum bet (usually player's chips)
            phase,           // preflop, flop, turn, river
            communityCards
        } = gameState;
        
        const toCall = currentBet - this.currentBet;
        const handStrength = this.evaluateHandStrength(this.cards, communityCards, phase);
        
        // Unpredictable bot adds randomness
        let effectiveStrength = handStrength;
        if (this.personality === 'unpredictable') {
            effectiveStrength += (Math.random() - 0.5) * 0.4; // +/- 20%
            effectiveStrength = Math.max(0, Math.min(1, effectiveStrength));
        }
        
        // Decision logic
        const shouldBluff = Math.random() < this.traits.bluffFrequency;
        
        // If we need to call
        if (toCall > 0) {
            // Fold weak hands
            if (effectiveStrength < this.traits.callThreshold && !shouldBluff) {
                return { action: 'fold' };
            }
            
            // Strong hand - raise
            if (effectiveStrength >= this.traits.raiseThreshold || shouldBluff) {
                if (Math.random() < this.traits.aggression) {
                    // All-in with very strong hands
                    if (effectiveStrength >= this.traits.allInThreshold && this.chips <= pot * 0.5) {
                        return { action: 'allin' };
                    }
                    
                    // Raise
                    const raiseAmount = this.calculateRaiseAmount(toCall, minRaise, maxBet, pot, effectiveStrength);
                    if (raiseAmount > toCall) {
                        return { action: 'raise', amount: raiseAmount };
                    }
                }
            }
            
            // Call
            if (toCall <= this.chips) {
                return { action: 'call' };
            } else {
                // Can't afford to call - all-in or fold
                if (effectiveStrength >= this.traits.callThreshold) {
                    return { action: 'allin' };
                }
                return { action: 'fold' };
            }
        } else {
            // No bet to call - can check or bet
            if (effectiveStrength >= this.traits.raiseThreshold || shouldBluff) {
                if (Math.random() < this.traits.aggression) {
                    // Bet
                    const betAmount = this.calculateBetAmount(minRaise, maxBet, pot, effectiveStrength);
                    if (betAmount > 0) {
                        return { action: 'bet', amount: betAmount };
                    }
                }
            }
            
            // Check
            return { action: 'check' };
        }
    }
    
    /**
     * Evaluate hand strength (0-1 scale)
     * Simplified evaluation - can be enhanced later
     */
    evaluateHandStrength(holeCards, communityCards, phase) {
        if (!holeCards || holeCards.length < 2) return 0.5;
        
        // Pre-flop: evaluate starting hand
        if (phase === 'preflop' || !communityCards || communityCards.length === 0) {
            return this.evaluateStartingHand(holeCards);
        }
        
        // Post-flop: simple evaluation based on pairs, high cards, etc.
        return this.evaluatePostFlop(holeCards, communityCards);
    }
    
    evaluateStartingHand(cards) {
        const ranks = cards.map(c => this.getRankValue(c.rank));
        const suited = cards[0].suit === cards[1].suit;
        const highCard = Math.max(...ranks);
        const lowCard = Math.min(...ranks);
        const gap = highCard - lowCard;
        const isPair = ranks[0] === ranks[1];
        
        let strength = 0;
        
        // Pairs
        if (isPair) {
            strength = 0.5 + (highCard / 14) * 0.5; // AA = 1.0, 22 = 0.57
        } else {
            // High cards
            strength = (highCard + lowCard) / 28 * 0.6;
            
            // Suited bonus
            if (suited) strength += 0.1;
            
            // Connected bonus
            if (gap <= 2) strength += 0.05;
            if (gap === 1) strength += 0.05;
        }
        
        // Premium hands boost
        if (highCard >= 12 && lowCard >= 10) strength += 0.15; // Broadway
        
        return Math.min(1, Math.max(0, strength));
    }
    
    evaluatePostFlop(holeCards, communityCards) {
        const allCards = [...holeCards, ...communityCards];
        const ranks = allCards.map(c => this.getRankValue(c.rank));
        const suits = allCards.map(c => c.suit);
        
        let strength = 0.3; // Base strength
        
        // Count pairs, trips, etc.
        const rankCounts = {};
        ranks.forEach(r => rankCounts[r] = (rankCounts[r] || 0) + 1);
        const counts = Object.values(rankCounts).sort((a, b) => b - a);
        
        // Four of a kind
        if (counts[0] >= 4) strength = 0.95;
        // Full house
        else if (counts[0] >= 3 && counts[1] >= 2) strength = 0.9;
        // Three of a kind
        else if (counts[0] >= 3) strength = 0.75;
        // Two pair
        else if (counts[0] >= 2 && counts[1] >= 2) strength = 0.65;
        // One pair
        else if (counts[0] >= 2) strength = 0.5;
        
        // Flush check (simplified)
        const suitCounts = {};
        suits.forEach(s => suitCounts[s] = (suitCounts[s] || 0) + 1);
        const maxSuitCount = Math.max(...Object.values(suitCounts));
        if (maxSuitCount >= 5) strength = Math.max(strength, 0.85);
        else if (maxSuitCount === 4) strength += 0.1; // Flush draw
        
        // Straight check (simplified)
        const uniqueRanks = [...new Set(ranks)].sort((a, b) => a - b);
        let consecutive = 1;
        let maxConsecutive = 1;
        for (let i = 1; i < uniqueRanks.length; i++) {
            if (uniqueRanks[i] === uniqueRanks[i-1] + 1) {
                consecutive++;
                maxConsecutive = Math.max(maxConsecutive, consecutive);
            } else {
                consecutive = 1;
            }
        }
        if (maxConsecutive >= 5) strength = Math.max(strength, 0.8);
        else if (maxConsecutive === 4) strength += 0.08; // Straight draw
        
        // High card bonus
        const holeRanks = holeCards.map(c => this.getRankValue(c.rank));
        if (Math.max(...holeRanks) >= 12) strength += 0.05;
        
        return Math.min(1, strength);
    }
    
    getRankValue(rank) {
        const values = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, 
                        '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };
        return values[rank] || 0;
    }
    
    calculateRaiseAmount(toCall, minRaise, maxBet, pot, strength) {
        // Raise sizing based on strength and personality
        let multiplier = 2 + (strength * 2); // 2x to 4x pot-sized raises
        
        if (this.personality === 'aggressive') {
            multiplier *= 1.5;
        } else if (this.personality === 'passive') {
            multiplier *= 0.6;
        } else if (this.personality === 'unpredictable') {
            multiplier *= 0.5 + Math.random();
        }
        
        let raiseAmount = Math.floor(toCall + (pot * 0.3 * multiplier));
        raiseAmount = Math.max(raiseAmount, toCall + minRaise);
        raiseAmount = Math.min(raiseAmount, maxBet);
        
        return raiseAmount;
    }
    
    calculateBetAmount(minBet, maxBet, pot, strength) {
        let betSize = pot * (0.3 + strength * 0.5);
        
        if (this.personality === 'aggressive') {
            betSize *= 1.3;
        } else if (this.personality === 'passive') {
            betSize *= 0.5;
        } else if (this.personality === 'unpredictable') {
            betSize *= 0.3 + Math.random() * 1.4;
        }
        
        betSize = Math.max(betSize, minBet);
        betSize = Math.min(betSize, maxBet);
        
        return Math.floor(betSize);
    }
    
    /**
     * Reset for new hand
     */
    resetForHand() {
        this.cards = [];
        this.currentBet = 0;
        this.folded = false;
        this.allIn = false;
    }
}

// Pre-defined bot profiles
const BOT_PROFILES = {
    tex: {
        name: 'Tex',
        personality: 'aggressive',
        avatar: 'cowboy'
    },
    lazy_larry: {
        name: 'Lazy Larry',
        personality: 'passive',
        avatar: 'sleepy'
    },
    pickles: {
        name: 'Pickles',
        personality: 'unpredictable',
        avatar: 'clown'
    }
};

function createBot(profileName) {
    const profile = BOT_PROFILES[profileName];
    if (!profile) {
        throw new Error(`Unknown bot profile: ${profileName}`);
    }
    return new BotPlayer(profile.name, profile.personality);
}

module.exports = { BotPlayer, BOT_PROFILES, createBot };

