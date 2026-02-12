/**
 * Item Model - Collectible items from Adventure mode
 */

const { v4: uuidv4 } = require('uuid');

// Item Rarities
const RARITY = {
    COMMON: 'common',
    UNCOMMON: 'uncommon',
    RARE: 'rare',
    EPIC: 'epic',
    LEGENDARY: 'legendary'
};

// Rarity colors for UI
const RARITY_COLORS = {
    [RARITY.COMMON]: '#9d9d9d',      // Gray
    [RARITY.UNCOMMON]: '#1eff00',    // Green
    [RARITY.RARE]: '#0070dd',        // Blue
    [RARITY.EPIC]: '#a335ee',        // Purple
    [RARITY.LEGENDARY]: '#ff8000'    // Orange
};

// Rarity drop weights (higher = more common)
const RARITY_WEIGHTS = {
    [RARITY.COMMON]: 50,
    [RARITY.UNCOMMON]: 30,
    [RARITY.RARE]: 15,
    [RARITY.EPIC]: 4,
    [RARITY.LEGENDARY]: 1
};

// Rarity multipliers for Power Score calculation
const RARITY_MULTIPLIERS = {
    [RARITY.COMMON]: 1,
    [RARITY.UNCOMMON]: 5,
    [RARITY.RARE]: 20,
    [RARITY.EPIC]: 100,
    [RARITY.LEGENDARY]: 500
};

// Item source (where it came from)
const ITEM_SOURCE = {
    BOSS_DROP: 'boss_drop',
    TOURNAMENT: 'tournament',
    REWARD: 'reward',
    CHALLENGE: 'challenge',
    STORE: 'store',           // Purchased with real money
    TRADE: 'trade',
    UNKNOWN: 'unknown'
};

// Item Types
const ITEM_TYPE = {
    CARD_BACK: 'card_back',          // Custom card back design
    TABLE_SKIN: 'table_skin',        // Custom table appearance
    AVATAR: 'avatar',                // Player avatar
    EMOTE: 'emote',                  // Chat emotes
    CHIP_STYLE: 'chip_style',        // Custom chip designs
    TROPHY: 'trophy',                // Boss defeat trophies
    CONSUMABLE: 'consumable',        // One-time use items
    SPECIAL: 'special',              // Unique items
    LOCATION_KEY: 'location_key',    // Unlocks special map areas
    VEHICLE: 'vehicle',              // Yacht, jet, etc.
    XP_BOOST: 'xp_boost'             // XP multiplier items
};

class Item {
    constructor(data = {}) {
        this.id = data.id || uuidv4();
        this.templateId = data.templateId || '';  // Reference to item template
        this.name = data.name || 'Unknown Item';
        this.description = data.description || '';
        this.type = data.type || ITEM_TYPE.SPECIAL;
        this.rarity = data.rarity || RARITY.COMMON;
        this.icon = data.icon || 'default_item';
        
        // For consumables
        this.uses = data.uses || 1;
        this.maxUses = data.maxUses || 1;
        
        // Value for gambling/trading (legacy - for backward compatibility)
        this.baseValue = data.baseValue || this.calculateBaseValue();
        
        // Item source (boss drop, store purchase, etc.)
        this.source = data.source || ITEM_SOURCE.UNKNOWN;
        
        // Drop rate (0.0 to 1.0, where 0.01 = 1%)
        // Calculated from rarity if not provided
        this.dropRate = data.dropRate || this.calculateDropRate();
        
        // Demand factor (1.0 = normal, 2.0 = high demand, 0.5 = low demand)
        // Default based on rarity and type, can be adjusted dynamically
        this.demand = data.demand || this.calculateDemand();
        
        // Power Score for Item Ante matching (replaces dollar values)
        // Formula: Rarity Multiplier × (1 / Drop Rate) × Demand
        this.powerScore = data.powerScore || this.calculatePowerScore();
        
        // When it was obtained
        this.obtainedAt = data.obtainedAt || Date.now();
        this.obtainedFrom = data.obtainedFrom || 'unknown';  // Boss name, event, etc.
        
        // Permissions
        this.isTradeable = data.isTradeable !== false;
        // CRITICAL: Store items cannot be gambled (legal compliance)
        this.isGambleable = this.source === ITEM_SOURCE.STORE ? false : (data.isGambleable !== false);
    }
    
    calculateBaseValue() {
        const rarityValues = {
            [RARITY.COMMON]: 100,
            [RARITY.UNCOMMON]: 500,
            [RARITY.RARE]: 2000,
            [RARITY.EPIC]: 10000,
            [RARITY.LEGENDARY]: 50000
        };
        return rarityValues[this.rarity] || 100;
    }
    
    calculateDropRate() {
        // Convert rarity weights to drop rates (0.0 to 1.0)
        // Total weight = 100 (50+30+15+4+1)
        const dropRates = {
            [RARITY.COMMON]: 0.50,      // 50%
            [RARITY.UNCOMMON]: 0.30,    // 30%
            [RARITY.RARE]: 0.15,        // 15%
            [RARITY.EPIC]: 0.04,        // 4%
            [RARITY.LEGENDARY]: 0.01    // 1%
        };
        return dropRates[this.rarity] || 0.50;
    }
    
    calculateDemand() {
        // Demand based on item type and rarity
        // Higher for useful/cosmetic items, lower for trophies
        const typeMultipliers = {
            [ITEM_TYPE.AVATAR]: 1.5,         // High demand - everyone wants avatars
            [ITEM_TYPE.CARD_BACK]: 1.3,      // High demand - visible to everyone
            [ITEM_TYPE.TABLE_SKIN]: 1.2,
            [ITEM_TYPE.CHIP_STYLE]: 1.2,
            [ITEM_TYPE.VEHICLE]: 2.0,        // Very high demand - status symbols
            [ITEM_TYPE.LOCATION_KEY]: 3.0,   // Extremely high demand - utility
            [ITEM_TYPE.XP_BOOST]: 1.0,       // Normal - consumable
            [ITEM_TYPE.TROPHY]: 0.8,         // Lower - prestige only
            [ITEM_TYPE.EMOTE]: 1.0,
            [ITEM_TYPE.CONSUMABLE]: 1.0,
            [ITEM_TYPE.SPECIAL]: 1.0
        };
        
        // Legendary items get a demand boost
        const rarityBoost = this.rarity === RARITY.LEGENDARY ? 1.5 : 1.0;
        
        const baseDemand = typeMultipliers[this.type] || 1.0;
        return baseDemand * rarityBoost;
    }
    
    calculatePowerScore() {
        // Power Score = Rarity Multiplier × (1 / Drop Rate) × Demand
        // This creates a prestige-based value system
        const rarityMult = RARITY_MULTIPLIERS[this.rarity] || 1;
        const scarcity = 1 / this.dropRate; // Lower drop rate = higher scarcity
        const demand = this.demand || 1.0;
        
        // Formula with balance adjustment (divide by 10 to keep numbers reasonable)
        const power = Math.floor((rarityMult * scarcity * demand) / 10);
        
        return power;
    }
    
    getColor() {
        return RARITY_COLORS[this.rarity] || RARITY_COLORS[RARITY.COMMON];
    }
    
    use() {
        if (this.type !== ITEM_TYPE.CONSUMABLE) return false;
        if (this.uses <= 0) return false;
        this.uses--;
        return true;
    }
    
    isUsedUp() {
        return this.type === ITEM_TYPE.CONSUMABLE && this.uses <= 0;
    }
    
    toJSON() {
        return {
            id: this.id,
            templateId: this.templateId,
            name: this.name,
            description: this.description,
            type: this.type,
            rarity: this.rarity,
            icon: this.icon,
            uses: this.uses,
            maxUses: this.maxUses,
            baseValue: this.baseValue,         // Legacy - kept for backward compatibility
            powerScore: this.powerScore,       // NEW: Power Score for Item Ante
            source: this.source,               // NEW: Where item came from
            dropRate: this.dropRate,           // NEW: Drop rate (for display/info)
            demand: this.demand,               // NEW: Demand factor
            obtainedAt: this.obtainedAt,
            obtainedFrom: this.obtainedFrom,
            isTradeable: this.isTradeable,
            isGambleable: this.isGambleable,   // Store items will be false
            color: this.getColor()
        };
    }
}

// Static item templates for drops
Item.TEMPLATES = {
    // Card Backs
    CARD_BACK_FLAME: {
        templateId: 'card_back_flame',
        name: 'Flame Card Back',
        description: 'Cards with fiery edges',
        type: ITEM_TYPE.CARD_BACK,
        rarity: RARITY.UNCOMMON,
        icon: 'card_back_flame'
    },
    CARD_BACK_GOLDEN: {
        templateId: 'card_back_golden',
        name: 'Golden Card Back',
        description: 'Pure gold card backs',
        type: ITEM_TYPE.CARD_BACK,
        rarity: RARITY.LEGENDARY,
        icon: 'card_back_golden'
    },
    
    // Avatars
    AVATAR_SHARK: {
        templateId: 'avatar_shark',
        name: 'Card Shark',
        description: 'A cunning shark avatar',
        type: ITEM_TYPE.AVATAR,
        rarity: RARITY.RARE,
        icon: 'avatar_shark'
    },
    
    // Trophies (boss specific) - ALL TRADEABLE now!
    TROPHY_FIRST_BOSS: {
        templateId: 'trophy_first_boss',
        name: 'Beginner\'s Trophy',
        description: 'Defeated the Tutorial Boss',
        type: ITEM_TYPE.TROPHY,
        rarity: RARITY.COMMON,
        icon: 'trophy_bronze'
    },
    TROPHY_UNDERGROUND: {
        templateId: 'trophy_underground',
        name: 'Underground Champion',
        description: 'Conquered the Underground',
        type: ITEM_TYPE.TROPHY,
        rarity: RARITY.RARE,
        icon: 'trophy_silver'
    },
    TROPHY_FINAL: {
        templateId: 'trophy_final',
        name: 'The House Trophy',
        description: 'Defeated The House - the ultimate achievement',
        type: ITEM_TYPE.TROPHY,
        rarity: RARITY.LEGENDARY,
        icon: 'trophy_gold'
    },
    
    // ============ LOCATION KEYS (Ultra Rare) ============
    YACHT_INVITATION: {
        templateId: 'YACHT_INVITATION',
        name: 'Golden Yacht Invitation',
        description: 'An exclusive invitation to the Golden Yacht. Extremely rare.',
        type: ITEM_TYPE.LOCATION_KEY,
        rarity: RARITY.LEGENDARY,
        icon: 'key_yacht',
        // Drop rate: 0.1% (1 in 1000 boss defeats)
    },
    ISLAND_KEY: {
        templateId: 'ISLAND_KEY',
        name: 'Private Island Key',
        description: 'A mysterious key to a secret island. Only legends possess this.',
        type: ITEM_TYPE.LOCATION_KEY,
        rarity: RARITY.LEGENDARY,
        icon: 'key_island',
        // Drop rate: 0.05% (1 in 2000)
    },
    MYSTERY_TOKEN: {
        templateId: 'MYSTERY_TOKEN',
        name: '??? Token',
        description: 'What is this? Where does it lead?',
        type: ITEM_TYPE.LOCATION_KEY,
        rarity: RARITY.LEGENDARY,
        icon: 'key_mystery',
        // Drop rate: 0.01% (1 in 10000)
    },
    UNDERGROUND_PASS: {
        templateId: 'UNDERGROUND_PASS',
        name: 'Underground Pass',
        description: 'Grants access to the Underground poker scene.',
        type: ITEM_TYPE.LOCATION_KEY,
        rarity: RARITY.EPIC,
        icon: 'key_underground',
        // Can be bought or dropped
    },
    
    // ============ VEHICLES (Rare Cosmetics + Status) ============
    VEHICLE_YACHT_SMALL: {
        templateId: 'VEHICLE_YACHT_SMALL',
        name: 'Speedboat',
        description: 'A sleek speedboat. Shows you\'re making moves.',
        type: ITEM_TYPE.VEHICLE,
        rarity: RARITY.RARE,
        icon: 'vehicle_speedboat'
    },
    VEHICLE_YACHT_GOLD: {
        templateId: 'VEHICLE_YACHT_GOLD',
        name: 'Golden Mega Yacht',
        description: 'The most luxurious yacht in existence.',
        type: ITEM_TYPE.VEHICLE,
        rarity: RARITY.LEGENDARY,
        icon: 'vehicle_yacht_gold'
    },
    VEHICLE_JET: {
        templateId: 'VEHICLE_JET',
        name: 'Private Jet',
        description: 'Travel in style. Extremely rare drop.',
        type: ITEM_TYPE.VEHICLE,
        rarity: RARITY.LEGENDARY,
        icon: 'vehicle_jet'
    },
    
    // ============ XP BOOST ITEMS ============
    XP_BOOST_SMALL: {
        templateId: 'XP_BOOST_SMALL',
        name: 'XP Chip (Small)',
        description: 'Grants 100 bonus XP',
        type: ITEM_TYPE.XP_BOOST,
        rarity: RARITY.COMMON,
        icon: 'xp_chip_small',
        xpAmount: 100
    },
    XP_BOOST_MEDIUM: {
        templateId: 'XP_BOOST_MEDIUM',
        name: 'XP Chip (Medium)',
        description: 'Grants 500 bonus XP',
        type: ITEM_TYPE.XP_BOOST,
        rarity: RARITY.UNCOMMON,
        icon: 'xp_chip_medium',
        xpAmount: 500
    },
    XP_BOOST_LARGE: {
        templateId: 'XP_BOOST_LARGE',
        name: 'XP Chip (Large)',
        description: 'Grants 2000 bonus XP',
        type: ITEM_TYPE.XP_BOOST,
        rarity: RARITY.RARE,
        icon: 'xp_chip_large',
        xpAmount: 2000
    },
    XP_BOOST_MEGA: {
        templateId: 'XP_BOOST_MEGA',
        name: 'XP Jackpot',
        description: 'Grants 10000 bonus XP!',
        type: ITEM_TYPE.XP_BOOST,
        rarity: RARITY.EPIC,
        icon: 'xp_jackpot',
        xpAmount: 10000
    },
    
    // ============ MORE COSMETICS ============
    CARD_BACK_DIAMOND: {
        templateId: 'CARD_BACK_DIAMOND',
        name: 'Diamond Card Back',
        description: 'Encrusted with diamonds',
        type: ITEM_TYPE.CARD_BACK,
        rarity: RARITY.EPIC,
        icon: 'card_back_diamond'
    },
    CARD_BACK_HOLOGRAM: {
        templateId: 'CARD_BACK_HOLOGRAM',
        name: 'Holographic Card Back',
        description: 'Shifts colors as you move',
        type: ITEM_TYPE.CARD_BACK,
        rarity: RARITY.LEGENDARY,
        icon: 'card_back_holo'
    },
    TABLE_SKIN_VELVET: {
        templateId: 'TABLE_SKIN_VELVET',
        name: 'Velvet Table',
        description: 'Rich purple velvet felt',
        type: ITEM_TYPE.TABLE_SKIN,
        rarity: RARITY.UNCOMMON,
        icon: 'table_velvet'
    },
    TABLE_SKIN_GOLD: {
        templateId: 'TABLE_SKIN_GOLD',
        name: 'Golden Table',
        description: 'Pure gold trim with black felt',
        type: ITEM_TYPE.TABLE_SKIN,
        rarity: RARITY.LEGENDARY,
        icon: 'table_gold'
    },
    CHIP_STYLE_CASINO: {
        templateId: 'CHIP_STYLE_CASINO',
        name: 'Casino Royale Chips',
        description: 'Classic casino style chips',
        type: ITEM_TYPE.CHIP_STYLE,
        rarity: RARITY.RARE,
        icon: 'chips_casino'
    },
    CHIP_STYLE_PLATINUM: {
        templateId: 'CHIP_STYLE_PLATINUM',
        name: 'Platinum Chips',
        description: 'Solid platinum chips for high rollers',
        type: ITEM_TYPE.CHIP_STYLE,
        rarity: RARITY.LEGENDARY,
        icon: 'chips_platinum'
    },
    AVATAR_WOLF: {
        templateId: 'AVATAR_WOLF',
        name: 'Lone Wolf',
        description: 'A fierce wolf avatar',
        type: ITEM_TYPE.AVATAR,
        rarity: RARITY.UNCOMMON,
        icon: 'avatar_wolf'
    },
    AVATAR_DRAGON: {
        templateId: 'AVATAR_DRAGON',
        name: 'Dragon',
        description: 'A mythical dragon avatar',
        type: ITEM_TYPE.AVATAR,
        rarity: RARITY.EPIC,
        icon: 'avatar_dragon'
    },
    AVATAR_LEGEND: {
        templateId: 'AVATAR_LEGEND',
        name: 'The Legend',
        description: 'Only for those who beat The House',
        type: ITEM_TYPE.AVATAR,
        rarity: RARITY.LEGENDARY,
        icon: 'avatar_legend'
    }
};

Item.RARITY = RARITY;
Item.RARITY_COLORS = RARITY_COLORS;
Item.RARITY_WEIGHTS = RARITY_WEIGHTS;
Item.RARITY_MULTIPLIERS = RARITY_MULTIPLIERS;
Item.TYPE = ITEM_TYPE;
Item.SOURCE = ITEM_SOURCE;

module.exports = Item;
