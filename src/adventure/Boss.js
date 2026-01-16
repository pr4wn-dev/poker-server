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
        this.areaId = data.areaId || 'area_tutorial';  // Which map area
        this.avatar = data.avatar || 'boss_default';
        this.description = data.description || '';
        this.difficulty = data.difficulty || DIFFICULTY.EASY;
        this.playStyle = data.playStyle || PLAY_STYLE.BALANCED;
        
        // Entry Requirements
        this.minLevel = data.minLevel || 1;           // Minimum player level (from XP)
        this.entryFee = data.entryFee || 0;           // Chips required to challenge
        
        // Stats
        this.chips = data.chips || 10000;
        this.skillLevel = data.skillLevel || 0.5;     // 0-1, affects AI decisions
        
        // Rewards
        this.xpReward = data.xpReward || 50;          // XP gained on victory
        this.coinReward = data.coinReward || 100;     // Adventure coins
        this.chipReward = data.chipReward || 0;       // Bonus chips (optional)
        
        // Drop table: { itemTemplateId, weight, minDefeats }
        // weight = percentage chance (0.1 = 0.1% = 1 in 1000)
        // minDefeats = must defeat this boss X times before item can drop
        this.dropTable = data.dropTable || [];
        this.guaranteedDrops = data.guaranteedDrops || [];  // First-time defeat only
        
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
     * Check if player can challenge this boss
     */
    canChallenge(playerLevel, playerChips) {
        if (playerLevel < this.minLevel) {
            return { 
                canChallenge: false, 
                reason: `Requires Level ${this.minLevel} (you are Level ${playerLevel})` 
            };
        }
        if (playerChips < this.entryFee) {
            return { 
                canChallenge: false, 
                reason: `Requires ${this.entryFee} chips to enter (you have ${playerChips})` 
            };
        }
        return { canChallenge: true };
    }
    
    /**
     * Roll for item drops based on defeat count
     * @param {number} defeatCount - How many times player has defeated this boss
     */
    rollDrops(defeatCount = 1) {
        const drops = [];
        
        for (const drop of this.dropTable) {
            // Check minimum defeats requirement
            if (drop.minDefeats && defeatCount < drop.minDefeats) {
                continue;  // Can't get this drop yet
            }
            
            // Roll for drop (weight is percentage, e.g., 0.1 = 0.1% = 1 in 1000)
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
            xp: this.xpReward,
            coins: this.coinReward,
            chips: this.chipReward,
            entryFee: this.entryFee,
            minLevel: this.minLevel,
            possibleDrops: this.dropTable.map(d => ({
                itemId: d.itemTemplateId,
                chance: d.weight,
                minDefeats: d.minDefeats || 0
            }))
        };
    }
    
    /**
     * Get boss by ID
     */
    static getById(bossId) {
        return Boss.ALL_BOSSES.find(b => b.id === bossId) || null;
    }
    
    /**
     * Get all bosses in an area
     */
    static getByArea(areaId) {
        return Boss.ALL_BOSSES.filter(b => b.areaId === areaId);
    }
}

// All bosses in the game - organized by area
Boss.ALL_BOSSES = [
    // ============ POKER ACADEMY (Starter Area) ============
    new Boss({
        id: 'boss_tutorial',
        name: 'Dealer Dan',
        areaId: 'area_tutorial',
        avatar: 'boss_dan',
        description: 'A friendly dealer who will teach you the ropes.',
        difficulty: DIFFICULTY.EASY,
        playStyle: PLAY_STYLE.PASSIVE,
        minLevel: 1,
        entryFee: 0,
        chips: 5000,
        skillLevel: 0.2,
        xpReward: 50,
        coinReward: 100,
        chipReward: 500,
        dropTable: [
            { itemTemplateId: 'CARD_BACK_FLAME', weight: 20 },
            { itemTemplateId: 'XP_BOOST_SMALL', weight: 30 }
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
    
    // ============ DOWNTOWN CASINO ============
    new Boss({
        id: 'boss_slick',
        name: 'Slick Sally',
        areaId: 'area_downtown',
        avatar: 'boss_sally',
        description: 'A smooth-talking hustler from the underground clubs.',
        difficulty: DIFFICULTY.EASY,
        playStyle: PLAY_STYLE.TRICKY,
        minLevel: 2,
        entryFee: 500,
        chips: 7500,
        skillLevel: 0.35,
        xpReward: 100,
        coinReward: 200,
        chipReward: 1000,
        dropTable: [
            { itemTemplateId: 'CARD_BACK_FLAME', weight: 15 },
            { itemTemplateId: 'AVATAR_WOLF', weight: 8 },
            { itemTemplateId: 'XP_BOOST_SMALL', weight: 20 },
            { itemTemplateId: 'XP_BOOST_MEDIUM', weight: 5 }
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
        areaId: 'area_downtown',
        avatar: 'boss_mike',
        description: 'A retired boxer who hits the felt as hard as the ring.',
        difficulty: DIFFICULTY.MEDIUM,
        playStyle: PLAY_STYLE.AGGRESSIVE,
        minLevel: 3,
        entryFee: 1000,
        chips: 10000,
        skillLevel: 0.45,
        xpReward: 200,
        coinReward: 350,
        chipReward: 2000,
        dropTable: [
            { itemTemplateId: 'CARD_BACK_FLAME', weight: 10 },
            { itemTemplateId: 'AVATAR_SHARK', weight: 5 },
            { itemTemplateId: 'XP_BOOST_MEDIUM', weight: 10 },
            // Ultra rare yacht invite - need to beat him 500+ times
            { itemTemplateId: 'YACHT_INVITATION', weight: 0.1, minDefeats: 500 }
        ],
        taunts: [
            "I'm gonna knock you out!",
            "Float like a butterfly, bet like a boss.",
            "You're going down!"
        ],
        winQuotes: ["TKO! Better hit the gym."],
        loseQuotes: ["Lucky punch, kid."]
    }),
    
    // ============ THE HIGHRISE ============
    new Boss({
        id: 'boss_countess',
        name: 'The Countess',
        areaId: 'area_highrise',
        avatar: 'boss_countess',
        description: 'An aristocratic player with centuries of experience.',
        difficulty: DIFFICULTY.MEDIUM,
        playStyle: PLAY_STYLE.TIGHT,
        minLevel: 5,
        entryFee: 2500,
        chips: 12000,
        skillLevel: 0.55,
        xpReward: 350,
        coinReward: 500,
        chipReward: 3500,
        dropTable: [
            { itemTemplateId: 'AVATAR_SHARK', weight: 10 },
            { itemTemplateId: 'CARD_BACK_DIAMOND', weight: 3 },
            { itemTemplateId: 'TABLE_SKIN_VELVET', weight: 5 },
            { itemTemplateId: 'XP_BOOST_MEDIUM', weight: 12 },
            { itemTemplateId: 'YACHT_INVITATION', weight: 0.15, minDefeats: 300 }
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
        areaId: 'area_highrise',
        avatar: 'boss_cipher',
        description: 'A mysterious masked player. No one knows their true identity.',
        difficulty: DIFFICULTY.HARD,
        playStyle: PLAY_STYLE.BALANCED,
        minLevel: 7,
        entryFee: 5000,
        chips: 15000,
        skillLevel: 0.65,
        xpReward: 500,
        coinReward: 750,
        chipReward: 5000,
        dropTable: [
            { itemTemplateId: 'CARD_BACK_GOLDEN', weight: 3 },
            { itemTemplateId: 'AVATAR_SHARK', weight: 10 },
            { itemTemplateId: 'XP_BOOST_LARGE', weight: 5 },
            { itemTemplateId: 'UNDERGROUND_PASS', weight: 2 },
            { itemTemplateId: 'YACHT_INVITATION', weight: 0.2, minDefeats: 200 }
        ],
        taunts: [
            "...",
            "Your tells betray you.",
            "I see through your strategy."
        ],
        winQuotes: ["Predictable."],
        loseQuotes: ["Interesting..."]
    }),
    
    // ============ THE UNDERGROUND ============
    new Boss({
        id: 'boss_shadow',
        name: 'Shadow',
        areaId: 'area_underground',
        avatar: 'boss_shadow',
        description: 'A legendary underground player who never shows their face.',
        difficulty: DIFFICULTY.HARD,
        playStyle: PLAY_STYLE.TRICKY,
        minLevel: 8,
        entryFee: 10000,
        chips: 25000,
        skillLevel: 0.72,
        xpReward: 800,
        coinReward: 1200,
        chipReward: 8000,
        dropTable: [
            { itemTemplateId: 'CARD_BACK_DIAMOND', weight: 8 },
            { itemTemplateId: 'AVATAR_DRAGON', weight: 2 },
            { itemTemplateId: 'XP_BOOST_LARGE', weight: 8 },
            { itemTemplateId: 'CHIP_STYLE_CASINO', weight: 5 },
            { itemTemplateId: 'YACHT_INVITATION', weight: 0.3, minDefeats: 150 }
        ],
        guaranteedDrops: ['TROPHY_UNDERGROUND'],
        taunts: [
            "You shouldn't be here.",
            "The shadows play tricks.",
            "Can you see in the dark?"
        ],
        winQuotes: ["Disappear."],
        loseQuotes: ["You'll pay for this... in time."]
    }),
    
    new Boss({
        id: 'boss_viper',
        name: 'Viper',
        areaId: 'area_underground',
        avatar: 'boss_viper',
        description: 'Cold-blooded and calculating. Strike fast or be struck.',
        difficulty: DIFFICULTY.EXPERT,
        playStyle: PLAY_STYLE.AGGRESSIVE,
        minLevel: 10,
        entryFee: 20000,
        chips: 40000,
        skillLevel: 0.78,
        xpReward: 1200,
        coinReward: 2000,
        chipReward: 15000,
        dropTable: [
            { itemTemplateId: 'CARD_BACK_GOLDEN', weight: 8 },
            { itemTemplateId: 'AVATAR_DRAGON', weight: 4 },
            { itemTemplateId: 'XP_BOOST_LARGE', weight: 10 },
            { itemTemplateId: 'XP_BOOST_MEGA', weight: 2 },
            { itemTemplateId: 'ISLAND_KEY', weight: 0.08, minDefeats: 800 }
        ],
        taunts: [
            "Ssssay goodbye to your chips.",
            "I strike without warning.",
            "Your fear is delicious."
        ],
        winQuotes: ["Another victim."],
        loseQuotes: ["You got lucky... this time."]
    }),
    
    // ============ THE GOLDEN YACHT (Special Area) ============
    new Boss({
        id: 'boss_captain',
        name: 'Captain Goldhand',
        areaId: 'area_yacht',
        avatar: 'boss_captain',
        description: 'The legendary captain who won his yacht in a poker game.',
        difficulty: DIFFICULTY.HARD,
        playStyle: PLAY_STYLE.LOOSE,
        minLevel: 10,
        entryFee: 25000,
        chips: 50000,
        skillLevel: 0.75,
        xpReward: 1500,
        coinReward: 3000,
        chipReward: 20000,
        dropTable: [
            { itemTemplateId: 'VEHICLE_YACHT_SMALL', weight: 2 },
            { itemTemplateId: 'CARD_BACK_HOLOGRAM', weight: 3 },
            { itemTemplateId: 'XP_BOOST_MEGA', weight: 5 },
            { itemTemplateId: 'ISLAND_KEY', weight: 0.1, minDefeats: 500 }
        ],
        taunts: [
            "Welcome aboard!",
            "I've sailed the seven seas of poker.",
            "Ready to walk the plank?"
        ],
        winQuotes: ["Man overboard!"],
        loseQuotes: ["You've earned your sea legs."]
    }),
    
    new Boss({
        id: 'boss_heiress',
        name: 'The Heiress',
        areaId: 'area_yacht',
        avatar: 'boss_heiress',
        description: 'Born into billions, plays for the thrill. Ruthlessly skilled.',
        difficulty: DIFFICULTY.EXPERT,
        playStyle: PLAY_STYLE.BALANCED,
        minLevel: 12,
        entryFee: 50000,
        chips: 80000,
        skillLevel: 0.82,
        xpReward: 2500,
        coinReward: 5000,
        chipReward: 40000,
        dropTable: [
            { itemTemplateId: 'VEHICLE_YACHT_GOLD', weight: 0.5 },
            { itemTemplateId: 'TABLE_SKIN_GOLD', weight: 2 },
            { itemTemplateId: 'CHIP_STYLE_PLATINUM', weight: 3 },
            { itemTemplateId: 'XP_BOOST_MEGA', weight: 8 },
            { itemTemplateId: 'ISLAND_KEY', weight: 0.15, minDefeats: 300 }
        ],
        taunts: [
            "Daddy bought me this table.",
            "Do you know who I am?",
            "This is pocket change to me."
        ],
        winQuotes: ["Buy yourself something nice."],
        loseQuotes: ["I'll buy a new yacht anyway."]
    }),
    
    // ============ PRIVATE ISLAND (Ultra Late Game) ============
    new Boss({
        id: 'boss_mogul',
        name: 'The Mogul',
        areaId: 'area_island',
        avatar: 'boss_mogul',
        description: 'Tech billionaire who built an empire and now seeks new challenges.',
        difficulty: DIFFICULTY.EXPERT,
        playStyle: PLAY_STYLE.TIGHT,
        minLevel: 15,
        entryFee: 100000,
        chips: 150000,
        skillLevel: 0.88,
        xpReward: 5000,
        coinReward: 10000,
        chipReward: 80000,
        dropTable: [
            { itemTemplateId: 'VEHICLE_JET', weight: 1 },
            { itemTemplateId: 'CARD_BACK_HOLOGRAM', weight: 10 },
            { itemTemplateId: 'CHIP_STYLE_PLATINUM', weight: 5 },
            { itemTemplateId: 'XP_BOOST_MEGA', weight: 12 },
            { itemTemplateId: 'MYSTERY_TOKEN', weight: 0.03, minDefeats: 1000 }
        ],
        taunts: [
            "Time is money, and you're wasting mine.",
            "I calculated your odds... not good.",
            "Innovation beats tradition."
        ],
        winQuotes: ["Efficiency."],
        loseQuotes: ["I'll optimize my strategy."]
    }),
    
    new Boss({
        id: 'boss_oracle',
        name: 'The Oracle',
        areaId: 'area_island',
        avatar: 'boss_oracle',
        description: 'Said to predict every hand. Defeating them opens the path to The House.',
        difficulty: DIFFICULTY.LEGENDARY,
        playStyle: PLAY_STYLE.BALANCED,
        minLevel: 18,
        entryFee: 200000,
        chips: 250000,
        skillLevel: 0.92,
        xpReward: 10000,
        coinReward: 25000,
        chipReward: 150000,
        dropTable: [
            { itemTemplateId: 'AVATAR_DRAGON', weight: 15 },
            { itemTemplateId: 'VEHICLE_JET', weight: 2 },
            { itemTemplateId: 'TABLE_SKIN_GOLD', weight: 8 },
            { itemTemplateId: 'MYSTERY_TOKEN', weight: 0.05, minDefeats: 500 }
        ],
        taunts: [
            "I foresaw your arrival.",
            "The cards have already spoken.",
            "Destiny cannot be bluffed."
        ],
        winQuotes: ["As predicted."],
        loseQuotes: ["The future... has changed."]
    }),
    
    // ============ THE PENTHOUSE (Final Area) ============
    new Boss({
        id: 'boss_final',
        name: 'The House',
        areaId: 'area_penthouse',
        avatar: 'boss_house',
        description: 'The ultimate challenge. The House always wins... or does it?',
        difficulty: DIFFICULTY.LEGENDARY,
        playStyle: PLAY_STYLE.BALANCED,
        minLevel: 20,
        entryFee: 500000,
        chips: 1000000,
        skillLevel: 0.98,
        xpReward: 50000,
        coinReward: 100000,
        chipReward: 500000,
        dropTable: [
            { itemTemplateId: 'CARD_BACK_HOLOGRAM', weight: 30 },
            { itemTemplateId: 'CHIP_STYLE_PLATINUM', weight: 20 },
            { itemTemplateId: 'AVATAR_LEGEND', weight: 10 },
            { itemTemplateId: 'VEHICLE_JET', weight: 8 },
            { itemTemplateId: 'MYSTERY_TOKEN', weight: 0.1, minDefeats: 100 }
        ],
        guaranteedDrops: ['TROPHY_FINAL', 'AVATAR_LEGEND'],
        taunts: [
            "Welcome to my domain.",
            "The odds are always in my favor.",
            "No one beats The House."
        ],
        winQuotes: ["The House always wins."],
        loseQuotes: ["Impossible... You've done what no one has done before."]
    }),
    
    // ============ SECRET LOUNGE (Hidden Area) ============
    new Boss({
        id: 'boss_mystery',
        name: '???',
        areaId: 'area_secret_lounge',
        avatar: 'boss_mystery',
        description: '???',
        difficulty: DIFFICULTY.LEGENDARY,
        playStyle: PLAY_STYLE.TRICKY,
        minLevel: 22,
        entryFee: 1000000,
        chips: 2000000,
        skillLevel: 0.99,
        xpReward: 100000,
        coinReward: 500000,
        chipReward: 1000000,
        dropTable: [
            { itemTemplateId: 'AVATAR_LEGEND', weight: 25 },
            { itemTemplateId: 'VEHICLE_YACHT_GOLD', weight: 10 },
            { itemTemplateId: 'VEHICLE_JET', weight: 15 }
            // No mystery token drop - this IS the mystery area
        ],
        taunts: [
            "...",
            "You found me.",
            "Few have made it here."
        ],
        winQuotes: ["..."],
        loseQuotes: ["Until next time."]
    })
];

Boss.DIFFICULTY = DIFFICULTY;
Boss.PLAY_STYLE = PLAY_STYLE;

module.exports = Boss;

