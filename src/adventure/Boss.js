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
    // ============ THE EMPTY STREETS (Starter Area) ============
    new Boss({
        id: 'boss_tutorial',
        name: 'The Stranger',
        areaId: 'area_tutorial',
        avatar: 'boss_stranger',
        description: 'The mysterious mafioso who taught you poker. A practice match to see if you remember his lessons.',
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
            "Remember what I taught you.",
            "Don't disappoint me, kid.",
            "You're learning. Good."
        ],
        winQuotes: ["You still have much to learn."],
        loseQuotes: ["Not bad, kid. Not bad at all."]
    }),
    
    // ============ THE BACK ALLEY ============
    new Boss({
        id: 'boss_slick',
        name: 'Scarface Eddie',
        areaId: 'area_downtown',
        avatar: 'boss_eddie',
        description: 'A small-time thug with a bad temper and worse luck. Runs a poker game in the back alley.',
        difficulty: DIFFICULTY.EASY,
        playStyle: PLAY_STYLE.AGGRESSIVE,
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
            "You got a death wish, kid?",
            "I'm gonna take everything you got.",
            "You're in over your head."
        ],
        winQuotes: ["Get outta my sight."],
        loseQuotes: ["This ain't over!"]
    }),
    
    new Boss({
        id: 'boss_iron',
        name: 'Louie the Lip',
        areaId: 'area_downtown',
        avatar: 'boss_louie',
        description: 'A fast-talking hustler who thinks he\'s smarter than everyone. Never shuts up.',
        difficulty: DIFFICULTY.MEDIUM,
        playStyle: PLAY_STYLE.TRICKY,
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
            "You know what your problem is? You talk too much. Wait, that's my thing.",
            "I could beat you with my eyes closed. Actually, let me try that.",
            "Kid, you're about as scary as a wet kitten."
        ],
        winQuotes: ["Told ya. Louie always wins."],
        loseQuotes: ["Alright, alright, you got lucky. This time."]
    }),
    
    // ============ UNDERGROUND POKER CIRCUIT ============
    new Boss({
        id: 'boss_countess',
        name: 'The Dealer',
        areaId: 'area_highrise',
        avatar: 'boss_dealer',
        description: 'Runs the underground poker circuit. Knows everyone\'s secrets. Never shows emotion.',
        difficulty: DIFFICULTY.MEDIUM,
        playStyle: PLAY_STYLE.BALANCED,
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
            "I've seen every trick in the book.",
            "You can't bluff me, kid.",
            "I know what you're holding."
        ],
        winQuotes: ["House always wins."],
        loseQuotes: ["Interesting. Very interesting."]
    }),
    
    new Boss({
        id: 'boss_cipher',
        name: 'Rosie "The Viper"',
        areaId: 'area_highrise',
        avatar: 'boss_rosie',
        description: 'Cold and ruthless. Never shows emotion. Strikes without warning.',
        difficulty: DIFFICULTY.HARD,
        playStyle: PLAY_STYLE.AGGRESSIVE,
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
        },
        taunts: [
            "Sssay goodbye to your chips.",
            "I strike without warning.",
            "Your fear is delicious."
        ],
        winQuotes: ["Another victim."],
        loseQuotes: ["You got lucky... this time."]
    }),
    
    // ============ THE DOCKS ============
    new Boss({
        id: 'boss_shadow',
        name: 'Captain Dimitri',
        areaId: 'area_underground',
        avatar: 'boss_dimitri',
        description: 'Controls smuggling operations at the docks. Ex-military. Ruthlessly efficient.',
        difficulty: DIFFICULTY.HARD,
        playStyle: PLAY_STYLE.TIGHT,
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
            "I've killed men for less.",
            "You're out of your depth.",
            "This is my territory."
        ],
        winQuotes: ["Throw him in the water."],
        loseQuotes: ["You have... potential."]
    }),
    
    new Boss({
        id: 'boss_viper',
        name: 'The Butcher',
        areaId: 'area_underground',
        avatar: 'boss_butcher',
        description: 'An enforcer for the dockside gangs. Massive, brutal, and surprisingly good at poker.',
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
            "I'm gonna break you.",
            "You're meat.",
            "This is gonna hurt."
        ],
        winQuotes: ["Clean up this mess."],
        loseQuotes: ["I'll remember your face."]
    }),
    
    // ============ MAFIA HEADQUARTERS ============
    new Boss({
        id: 'boss_captain',
        name: 'The Consigliere',
        areaId: 'area_yacht',
        avatar: 'boss_consigliere',
        description: 'The Don\'s advisor. Brilliant strategist. Knows every angle.',
        difficulty: DIFFICULTY.HARD,
        playStyle: PLAY_STYLE.BALANCED,
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
            "I've already calculated your next three moves.",
            "You're playing checkers. I'm playing chess.",
            "Predictable."
        ],
        winQuotes: ["As expected."],
        loseQuotes: ["Hmm. I'll need to recalculate."]
    }),
    
    new Boss({
        id: 'boss_heiress',
        name: 'Don Vittorio',
        areaId: 'area_yacht',
        avatar: 'boss_don',
        description: 'The mafia boss himself. Your biggest ally in the underworld. But even allies play to win.',
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
            "I'm gonna make you an offer you can't refuse.",
            "You've come far, kid. But not far enough.",
            "Respect is earned at this table."
        ],
        winQuotes: ["You're dismissed."],
        loseQuotes: ["You've earned my respect."]
    }),
    
    // ============ THE WASTELANDS ============
    new Boss({
        id: 'boss_mogul',
        name: 'Mad Dog Marcus',
        areaId: 'area_island',
        avatar: 'boss_marcus',
        description: 'A psychotic killer who enjoys the pain. Unhinged, unpredictable, and dangerous.',
        difficulty: DIFFICULTY.EXPERT,
        playStyle: PLAY_STYLE.AGGRESSIVE,
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
            "I'm gonna enjoy this.",
            "Scream for me.",
            "Pain is beautiful."
        ],
        winQuotes: ["*laughs maniacally*"],
        loseQuotes: ["I'll see you in your nightmares."]
    }),
    
    new Boss({
        id: 'boss_oracle',
        name: 'The Chemist',
        areaId: 'area_island',
        avatar: 'boss_chemist',
        description: 'Deals in poisons and pharmaceuticals. Calm, methodical, and utterly without mercy.',
        difficulty: DIFFICULTY.LEGENDARY,
        playStyle: PLAY_STYLE.TIGHT,
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
            "Chemistry is precise. So am I.",
            "One wrong move and it's over.",
            "I've perfected the formula."
        ],
        winQuotes: ["Predictable reaction."],
        loseQuotes: ["An unexpected variable."]
    }),
    
    // ============ THE KILLER'S ESTATE (Final Area) ============
    new Boss({
        id: 'boss_final',
        name: 'THE KILLER',
        areaId: 'area_penthouse',
        avatar: 'boss_killer',
        description: 'The one who took your family. A brilliant, twisted mind who sees people as objects to collect. This ends here.',
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
            "Another piece for my collection.",
            "They all screamed. Every single one.",
            "Your family is... safe. In a manner of speaking."
        ],
        winQuotes: ["You'll join them soon enough."],
        loseQuotes: ["No... my collection... You've ruined everything!"]
    }),
    
    // ============ THE DRAWER DUNGEON (Hidden Area) ============
    new Boss({
        id: 'boss_mystery',
        name: 'The Collector',
        areaId: 'area_secret_lounge',
        avatar: 'boss_collector',
        description: 'The killer\'s right hand. Obsessed with "collecting" people. Guards the drawer dungeon.',
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
            "Such a fine specimen.",
            "You'll look perfect in drawer 1,847.",
            "I've been waiting for you."
        ],
        winQuotes: ["No... not my collection..."],
        loseQuotes: ["Take them. Take them all. I don't care anymore."]
    })
];

Boss.DIFFICULTY = DIFFICULTY;
Boss.PLAY_STYLE = PLAY_STYLE;

module.exports = Boss;

