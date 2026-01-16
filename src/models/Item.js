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

// Item Types
const ITEM_TYPE = {
    CARD_BACK: 'card_back',          // Custom card back design
    TABLE_SKIN: 'table_skin',        // Custom table appearance
    AVATAR: 'avatar',                // Player avatar
    EMOTE: 'emote',                  // Chat emotes
    CHIP_STYLE: 'chip_style',        // Custom chip designs
    TROPHY: 'trophy',                // Boss defeat trophies
    CONSUMABLE: 'consumable',        // One-time use items
    SPECIAL: 'special'               // Unique items
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
        
        // Value for gambling/trading
        this.baseValue = data.baseValue || this.calculateBaseValue();
        
        // When it was obtained
        this.obtainedAt = data.obtainedAt || Date.now();
        this.obtainedFrom = data.obtainedFrom || 'unknown';  // Boss name, event, etc.
        
        // Tradeable?
        this.isTradeable = data.isTradeable !== false;
        this.isGambleable = data.isGambleable !== false;
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
            baseValue: this.baseValue,
            obtainedAt: this.obtainedAt,
            obtainedFrom: this.obtainedFrom,
            isTradeable: this.isTradeable,
            isGambleable: this.isGambleable,
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
    
    // Trophies (boss specific)
    TROPHY_FIRST_BOSS: {
        templateId: 'trophy_first_boss',
        name: 'Beginner\'s Trophy',
        description: 'Defeated the Tutorial Boss',
        type: ITEM_TYPE.TROPHY,
        rarity: RARITY.COMMON,
        icon: 'trophy_bronze',
        isTradeable: false
    }
};

Item.RARITY = RARITY;
Item.RARITY_COLORS = RARITY_COLORS;
Item.RARITY_WEIGHTS = RARITY_WEIGHTS;
Item.TYPE = ITEM_TYPE;

module.exports = Item;

