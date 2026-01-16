/**
 * Boss - Adventure mode poker bosses
 */

const Item = require('../models/Item');

const DIFFICULTY = {
    EASY: 'easy',
    MEDIUM: 'medium',
    HARD: 'hard',
    EXPERT: 'expert',
    LEGENDARY: 'legendary'
};

// Boss AI play styles
const PLAY_STYLE = {
    PASSIVE: 'passive',     // Calls a lot, rarely raises
    AGGRESSIVE: 'aggressive', // Bets and raises frequently
    TIGHT: 'tight',         // Plays few hands, strong cards only
    LOOSE: 'loose',         // Plays many hands
    TRICKY: 'tricky',       // Lots of bluffs and traps
    BALANCED: 'balanced'    // Mix of all styles
};

class Boss {
    constructor(data) {
        this.id = data.id;
        this.name = data.name;
        this.level = data.level;
        this.avatar = data.avatar || 'boss_default';
        this.description = data.description || '';
        this.difficulty = data.difficulty || DIFFICULTY.EASY;
        this.playStyle = data.playStyle || PLAY_STYLE.BALANCED;
        
        // Stats
        this.chips = data.chips || 10000;
        this.skillLevel = data.skillLevel || 0.5;  // 0-1, affects AI decisions
        
        // Rewards
        this.coinReward = data.coinReward || 100;
        this.dropTable = data.dropTable || [];  // { itemTemplateId, weight }
        this.guaranteedDrops = data.guaranteedDrops || [];  // First-time defeat
        
        // Personality
        this.taunts = data.taunts || ['...'];
        this.winQuotes = data.winQuotes || ['Better luck next time.'];
        this.loseQuotes = data.loseQuotes || ['You got lucky!'];
    }
    
    getRandomTaunt() {
        return this.taunts[Math.floor(Math.random() * this.taunts.length)];
    }
    
    getWinQuote() {
        return this.winQuotes[Math.floor(Math.random() * this.winQuotes.length)];
    }
    
    getLoseQuote() {
        return this.loseQuotes[Math.floor(Math.random() * this.loseQuotes.length)];
    }
    
    /**
     * Roll for item drops
     */
    rollDrops() {
        const drops = [];
        
        for (const drop of this.dropTable) {
            const roll = Math.random() * 100;
            if (roll <= drop.weight) {
                const template = Item.TEMPLATES[drop.itemTemplateId] || {
                    templateId: drop.itemTemplateId,
                    name: 'Unknown Item',
                    type: Item.TYPE.SPECIAL,
                    rarity: Item.RARITY.COMMON
                };
                
                const item = new Item({
                    ...template,
                    obtainedFrom: this.name
                });
                drops.push(item);
            }
        }
        
        return drops;
    }
    
    getRewardPreview() {
        return {
            coins: this.coinReward,
            possibleDrops: this.dropTable.map(d => ({
                itemId: d.itemTemplateId,
                chance: d.weight
            }))
        };
    }
    
    /**
     * Get boss for a specific level
     */
    static getForLevel(level) {
        return Boss.ALL_BOSSES.find(b => b.level === level) || null;
    }
}

// Maximum adventure level
Boss.MAX_LEVEL = 20;

// All bosses in the game
Boss.ALL_BOSSES = [
    new Boss({
        id: 'boss_tutorial',
        name: 'Dealer Dan',
        level: 1,
        avatar: 'boss_dan',
        description: 'A friendly dealer who will teach you the ropes.',
        difficulty: DIFFICULTY.EASY,
        playStyle: PLAY_STYLE.PASSIVE,
        chips: 5000,
        skillLevel: 0.2,
        coinReward: 100,
        dropTable: [
            { itemTemplateId: 'CARD_BACK_FLAME', weight: 20 }
        ],
        guaranteedDrops: ['TROPHY_FIRST_BOSS'],
        taunts: [
            "Let's see what you've got!",
            "Take your time, rookie.",
            "Not bad for a beginner!"
        ],
        winQuotes: ["Good effort! Try again?"],
        loseQuotes: ["Beginner's luck, eh?"]
    }),
    
    new Boss({
        id: 'boss_slick',
        name: 'Slick Sally',
        level: 2,
        avatar: 'boss_sally',
        description: 'A smooth-talking hustler from the underground clubs.',
        difficulty: DIFFICULTY.EASY,
        playStyle: PLAY_STYLE.TRICKY,
        chips: 7500,
        skillLevel: 0.35,
        coinReward: 200,
        dropTable: [
            { itemTemplateId: 'CARD_BACK_FLAME', weight: 15 },
            { itemTemplateId: 'AVATAR_SHARK', weight: 5 }
        ],
        taunts: [
            "You look like easy money.",
            "Care to make this interesting?",
            "I've eaten fish bigger than you."
        ],
        winQuotes: ["Thanks for the chips, sweetie."],
        loseQuotes: ["Hmph. We'll meet again."]
    }),
    
    new Boss({
        id: 'boss_iron',
        name: 'Iron Mike',
        level: 3,
        avatar: 'boss_mike',
        description: 'A retired boxer who hits the felt as hard as the ring.',
        difficulty: DIFFICULTY.MEDIUM,
        playStyle: PLAY_STYLE.AGGRESSIVE,
        chips: 10000,
        skillLevel: 0.45,
        coinReward: 350,
        dropTable: [
            { itemTemplateId: 'CARD_BACK_FLAME', weight: 10 },
            { itemTemplateId: 'AVATAR_SHARK', weight: 8 }
        ],
        taunts: [
            "I'm gonna knock you out!",
            "Float like a butterfly, bet like a boss.",
            "You're going down!"
        ],
        winQuotes: ["TKO! Better hit the gym."],
        loseQuotes: ["Lucky punch, kid."]
    }),
    
    new Boss({
        id: 'boss_countess',
        name: 'The Countess',
        level: 4,
        avatar: 'boss_countess',
        description: 'An aristocratic player with centuries of experience.',
        difficulty: DIFFICULTY.MEDIUM,
        playStyle: PLAY_STYLE.TIGHT,
        chips: 12000,
        skillLevel: 0.55,
        coinReward: 500,
        dropTable: [
            { itemTemplateId: 'AVATAR_SHARK', weight: 10 },
            { itemTemplateId: 'CARD_BACK_GOLDEN', weight: 2 }
        ],
        taunts: [
            "How quaint.",
            "You dare challenge me?",
            "I've been playing since before your grandfather was born."
        ],
        winQuotes: ["Peasants should know their place."],
        loseQuotes: ["Most... unexpected."]
    }),
    
    new Boss({
        id: 'boss_cipher',
        name: 'The Cipher',
        level: 5,
        avatar: 'boss_cipher',
        description: 'A mysterious masked player. No one knows their true identity.',
        difficulty: DIFFICULTY.HARD,
        playStyle: PLAY_STYLE.BALANCED,
        chips: 15000,
        skillLevel: 0.65,
        coinReward: 750,
        dropTable: [
            { itemTemplateId: 'CARD_BACK_GOLDEN', weight: 5 },
            { itemTemplateId: 'AVATAR_SHARK', weight: 15 }
        ],
        taunts: [
            "...",
            "Your tells betray you.",
            "I see through your strategy."
        ],
        winQuotes: ["Predictable."],
        loseQuotes: ["Interesting..."]
    }),
    
    // Add more bosses for levels 6-20...
    new Boss({
        id: 'boss_final',
        name: 'The House',
        level: 20,
        avatar: 'boss_house',
        description: 'The ultimate challenge. The House always wins... or does it?',
        difficulty: DIFFICULTY.LEGENDARY,
        playStyle: PLAY_STYLE.BALANCED,
        chips: 100000,
        skillLevel: 0.95,
        coinReward: 10000,
        dropTable: [
            { itemTemplateId: 'CARD_BACK_GOLDEN', weight: 50 }
        ],
        taunts: [
            "Welcome to my domain.",
            "The odds are always in my favor.",
            "No one beats The House."
        ],
        winQuotes: ["The House always wins."],
        loseQuotes: ["Impossible... You've done what no one has done before."]
    })
];

Boss.DIFFICULTY = DIFFICULTY;
Boss.PLAY_STYLE = PLAY_STYLE;

module.exports = Boss;

