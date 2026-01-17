/**
 * HouseRules - Configurable poker rules for table creation
 */

// Preset rule configurations
const PRESETS = {
    STANDARD: 'standard',
    NO_LIMIT: 'no_limit',
    POT_LIMIT: 'pot_limit',
    FIXED_LIMIT: 'fixed_limit',
    SHORT_DECK: 'short_deck',
    WILD_CARD: 'wild_card',
    STRADDLE: 'straddle',
    BOMB_POT: 'bomb_pot'
};

class HouseRules {
    constructor(data = {}) {
        // Betting Structure
        this.bettingType = data.bettingType || 'no_limit';  // no_limit, pot_limit, fixed_limit
        this.smallBlind = data.smallBlind || 50;
        this.bigBlind = data.bigBlind || 100;
        this.ante = data.ante || 0;                         // Optional ante per hand
        this.allowStraddle = data.allowStraddle || false;   // UTG can double BB
        
        // Betting Limits (for limit games)
        this.minBet = data.minBet || this.bigBlind;
        this.maxBet = data.maxBet || null;                  // null = no limit
        this.maxRaises = data.maxRaises || null;            // null = unlimited
        
        // Buy-in
        this.minBuyIn = data.minBuyIn || this.bigBlind * 20;   // 20 BB minimum
        this.maxBuyIn = data.maxBuyIn || this.bigBlind * 200;  // 200 BB maximum
        this.allowRebuy = data.allowRebuy !== false;           // Can rebuy when busted
        this.allowTopUp = data.allowTopUp !== false;           // Can add chips mid-game
        
        // Timing
        this.turnTimeSeconds = data.turnTimeSeconds || 30;
        this.extraTimeBank = data.extraTimeBank || 60;         // Extra time pool
        this.autoFoldOnTimeout = data.autoFoldOnTimeout !== false;
        
        // Special Rules
        this.runItTwice = data.runItTwice || false;            // Run board twice on all-in
        this.showWinningHand = data.showWinningHand !== false; // Must show winning hand
        this.showFoldedHand = data.showFoldedHand || false;    // Can show when folding
        this.allowRabbitHunt = data.allowRabbitHunt || false;  // See what would have come
        
        // Deck Variants
        this.deckType = data.deckType || 'standard';           // standard, short_deck (6+)
        this.wildCards = data.wildCards || [];                 // e.g., ['2'] for deuces wild
        
        // Bomb Pot (everyone antes, no preflop betting)
        this.bombPotFrequency = data.bombPotFrequency || 0;    // Every N hands (0 = off)
        this.bombPotMultiplier = data.bombPotMultiplier || 2;  // Ante multiplier for bomb pot
        
        // Game Variant
        this.gameType = data.gameType || 'holdem';             // holdem, omaha, omaha_hilo
        this.holeCardCount = data.holeCardCount || 2;          // 2 for holdem, 4 for omaha
        
        // Table Settings
        this.maxPlayers = data.maxPlayers || 9;
        this.minPlayersToStart = data.minPlayersToStart || 2;
        this.allowSpectators = data.allowSpectators !== false;
        this.maxSpectators = data.maxSpectators || 20;
    }
    
    // Create from preset
    static fromPreset(preset, overrides = {}) {
        let base = {};
        
        switch (preset) {
            case PRESETS.STANDARD:
                base = {
                    bettingType: 'no_limit',
                    smallBlind: 50,
                    bigBlind: 100
                };
                break;
                
            case PRESETS.NO_LIMIT:
                base = {
                    bettingType: 'no_limit',
                    maxBet: null
                };
                break;
                
            case PRESETS.POT_LIMIT:
                base = {
                    bettingType: 'pot_limit'
                };
                break;
                
            case PRESETS.FIXED_LIMIT:
                base = {
                    bettingType: 'fixed_limit',
                    maxRaises: 4
                };
                break;
                
            case PRESETS.SHORT_DECK:
                base = {
                    deckType: 'short_deck',  // Removes 2-5
                    bettingType: 'no_limit'
                };
                break;
                
            case PRESETS.STRADDLE:
                base = {
                    bettingType: 'no_limit',
                    allowStraddle: true
                };
                break;
                
            case PRESETS.BOMB_POT:
                base = {
                    bettingType: 'no_limit',
                    bombPotFrequency: 10,  // Every 10 hands
                    bombPotMultiplier: 3
                };
                break;
                
            default:
                base = {};
        }
        
        return new HouseRules({ ...base, ...overrides });
    }
    
    // Get available presets for UI
    static getPresetList() {
        return [
            { id: PRESETS.STANDARD, name: 'Standard', description: 'Classic No-Limit Hold\'em' },
            { id: PRESETS.NO_LIMIT, name: 'No Limit', description: 'No betting limits' },
            { id: PRESETS.POT_LIMIT, name: 'Pot Limit', description: 'Max bet is pot size' },
            { id: PRESETS.FIXED_LIMIT, name: 'Fixed Limit', description: 'Set bet amounts per round' },
            { id: PRESETS.SHORT_DECK, name: 'Short Deck', description: '36 cards (6+), changed rankings' },
            { id: PRESETS.STRADDLE, name: 'Straddle', description: 'Allows UTG straddle betting' },
            { id: PRESETS.BOMB_POT, name: 'Bomb Pot', description: 'Periodic everyone-antes rounds' }
        ];
    }
    
    toJSON() {
        return {
            bettingType: this.bettingType,
            smallBlind: this.smallBlind,
            bigBlind: this.bigBlind,
            ante: this.ante,
            allowStraddle: this.allowStraddle,
            minBet: this.minBet,
            maxBet: this.maxBet,
            maxRaises: this.maxRaises,
            minBuyIn: this.minBuyIn,
            maxBuyIn: this.maxBuyIn,
            allowRebuy: this.allowRebuy,
            turnTimeSeconds: this.turnTimeSeconds,
            runItTwice: this.runItTwice,
            deckType: this.deckType,
            wildCards: this.wildCards,
            bombPotFrequency: this.bombPotFrequency,
            gameType: this.gameType,
            maxPlayers: this.maxPlayers,
            allowSpectators: this.allowSpectators
        };
    }
}

HouseRules.PRESETS = PRESETS;

module.exports = HouseRules;



