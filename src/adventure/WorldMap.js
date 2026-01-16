/**
 * WorldMap - Adventure mode world with areas, levels, and special locations
 */

const AREA_TYPE = {
    STARTER: 'starter',
    CITY: 'city',
    CASINO: 'casino',
    UNDERGROUND: 'underground',
    VIP: 'vip',
    YACHT: 'yacht',
    ISLAND: 'island',
    PENTHOUSE: 'penthouse',
    SECRET: 'secret'
};

const UNLOCK_TYPE = {
    XP_LEVEL: 'xp_level',          // Requires player level
    BOSS_DEFEAT: 'boss_defeat',     // Requires defeating a boss
    ITEM: 'item',                   // Requires owning a special item
    CHIPS: 'chips',                 // Requires minimum chips
    ACHIEVEMENT: 'achievement'      // Requires achievement
};

class WorldMap {
    constructor() {
        this.areas = WorldMap.ALL_AREAS;
    }
    
    /**
     * Get areas available to a player based on their progress
     */
    getAvailableAreas(userProgress) {
        return this.areas.filter(area => this.canAccessArea(area, userProgress));
    }
    
    /**
     * Check if player can access an area
     */
    canAccessArea(area, userProgress) {
        for (const req of area.requirements) {
            switch (req.type) {
                case UNLOCK_TYPE.XP_LEVEL:
                    if (userProgress.level < req.value) return false;
                    break;
                case UNLOCK_TYPE.BOSS_DEFEAT:
                    if (!userProgress.bossesDefeated.includes(req.value)) return false;
                    break;
                case UNLOCK_TYPE.ITEM:
                    if (!userProgress.inventory.some(i => i.templateId === req.value)) return false;
                    break;
                case UNLOCK_TYPE.CHIPS:
                    if (userProgress.chips < req.value) return false;
                    break;
            }
        }
        return true;
    }
    
    /**
     * Get area by ID
     */
    getArea(areaId) {
        return this.areas.find(a => a.id === areaId);
    }
    
    /**
     * Get bosses in an area
     */
    getBossesInArea(areaId) {
        const area = this.getArea(areaId);
        if (!area) return [];
        return area.bosses || [];
    }
    
    /**
     * Get full map state for a player
     */
    getMapState(userProgress) {
        return this.areas.map(area => ({
            id: area.id,
            name: area.name,
            type: area.type,
            description: area.description,
            icon: area.icon,
            position: area.position,
            isUnlocked: this.canAccessArea(area, userProgress),
            requirements: area.requirements,
            bossCount: area.bosses?.length || 0,
            completedBosses: area.bosses?.filter(b => 
                userProgress.bossesDefeated.includes(b)
            ).length || 0
        }));
    }
}

// XP required for each level (exponential curve)
WorldMap.XP_PER_LEVEL = [
    0,      // Level 1 (starting)
    100,    // Level 2
    250,    // Level 3
    500,    // Level 4
    1000,   // Level 5
    2000,   // Level 6
    3500,   // Level 7
    5500,   // Level 8
    8000,   // Level 9
    12000,  // Level 10
    17000,  // Level 11
    23000,  // Level 12
    30000,  // Level 13
    40000,  // Level 14
    52000,  // Level 15
    67000,  // Level 16
    85000,  // Level 17
    107000, // Level 18
    135000, // Level 19
    170000, // Level 20
    215000, // Level 21
    270000, // Level 22
    340000, // Level 23
    430000, // Level 24
    550000, // Level 25 (max?)
];

WorldMap.MAX_LEVEL = 25;

/**
 * Calculate level from XP
 */
WorldMap.getLevelFromXP = function(xp) {
    for (let i = WorldMap.XP_PER_LEVEL.length - 1; i >= 0; i--) {
        if (xp >= WorldMap.XP_PER_LEVEL[i]) {
            return i + 1;
        }
    }
    return 1;
};

/**
 * Get XP needed for next level
 */
WorldMap.getXPForNextLevel = function(currentLevel) {
    if (currentLevel >= WorldMap.MAX_LEVEL) return null;
    return WorldMap.XP_PER_LEVEL[currentLevel];
};

/**
 * Get XP progress percentage to next level
 */
WorldMap.getXPProgress = function(xp) {
    const level = WorldMap.getLevelFromXP(xp);
    if (level >= WorldMap.MAX_LEVEL) return 100;
    
    const currentLevelXP = WorldMap.XP_PER_LEVEL[level - 1];
    const nextLevelXP = WorldMap.XP_PER_LEVEL[level];
    const progressXP = xp - currentLevelXP;
    const neededXP = nextLevelXP - currentLevelXP;
    
    return Math.floor((progressXP / neededXP) * 100);
};

// All areas in the world
WorldMap.ALL_AREAS = [
    {
        id: 'area_tutorial',
        name: 'Poker Academy',
        type: AREA_TYPE.STARTER,
        description: 'Learn the ropes at this beginner-friendly poker school.',
        icon: 'area_academy',
        position: { x: 0, y: 0 },
        requirements: [],  // Always accessible
        bosses: ['boss_tutorial'],
        hasTournaments: false  // Tutorial only
    },
    {
        id: 'area_downtown',
        name: 'Downtown Casino',
        type: AREA_TYPE.CASINO,
        description: 'The local casino where hustlers sharpen their skills. Hosts daily tournaments!',
        icon: 'area_downtown',
        position: { x: 1, y: 0 },
        requirements: [
            { type: UNLOCK_TYPE.XP_LEVEL, value: 2 }
        ],
        bosses: ['boss_slick', 'boss_iron'],
        hasTournaments: true,
        tournamentTier: 1
    },
    {
        id: 'area_highrise',
        name: 'The Highrise',
        type: AREA_TYPE.CITY,
        description: 'Elite players gather here. High stakes tournaments with item side pots.',
        icon: 'area_highrise',
        position: { x: 2, y: 0 },
        requirements: [
            { type: UNLOCK_TYPE.XP_LEVEL, value: 5 },
            { type: UNLOCK_TYPE.BOSS_DEFEAT, value: 'boss_iron' }
        ],
        bosses: ['boss_countess', 'boss_cipher'],
        hasTournaments: true,
        tournamentTier: 2
    },
    {
        id: 'area_underground',
        name: 'The Underground',
        type: AREA_TYPE.UNDERGROUND,
        description: 'Illegal high-stakes tournaments. Rare item side pots required!',
        icon: 'area_underground',
        position: { x: 1, y: 1 },
        requirements: [
            { type: UNLOCK_TYPE.XP_LEVEL, value: 8 },
            { type: UNLOCK_TYPE.CHIPS, value: 50000 }
        ],
        bosses: ['boss_shadow', 'boss_viper'],
        hasTournaments: true,
        tournamentTier: 3
    },
    {
        id: 'area_yacht',
        name: 'The Golden Yacht',
        type: AREA_TYPE.YACHT,
        description: 'Exclusive yacht tournaments. Epic item side pots only!',
        icon: 'area_yacht',
        position: { x: 3, y: 1 },
        requirements: [
            { type: UNLOCK_TYPE.ITEM, value: 'YACHT_INVITATION' }
        ],
        bosses: ['boss_captain', 'boss_heiress'],
        hasTournaments: true,
        tournamentTier: 4
    },
    {
        id: 'area_island',
        name: 'Private Island',
        type: AREA_TYPE.ISLAND,
        description: 'Legendary tournaments for the ultra-elite. Legendary items required!',
        icon: 'area_island',
        position: { x: 4, y: 2 },
        requirements: [
            { type: UNLOCK_TYPE.ITEM, value: 'ISLAND_KEY' },
            { type: UNLOCK_TYPE.XP_LEVEL, value: 15 }
        ],
        bosses: ['boss_mogul', 'boss_oracle'],
        hasTournaments: true,
        tournamentTier: 5
    },
    {
        id: 'area_penthouse',
        name: 'The Penthouse',
        type: AREA_TYPE.PENTHOUSE,
        description: 'The ultimate tournament. Only the best reach The Grand Finale.',
        icon: 'area_penthouse',
        position: { x: 5, y: 0 },
        requirements: [
            { type: UNLOCK_TYPE.XP_LEVEL, value: 20 },
            { type: UNLOCK_TYPE.BOSS_DEFEAT, value: 'boss_oracle' }
        ],
        bosses: ['boss_final'],
        hasTournaments: true,
        tournamentTier: 6
    },
    {
        id: 'area_secret_lounge',
        name: '??? Lounge',
        type: AREA_TYPE.SECRET,
        description: 'A mysterious location. How did you even find this?',
        icon: 'area_secret',
        position: { x: -1, y: -1 },
        requirements: [
            { type: UNLOCK_TYPE.ITEM, value: 'MYSTERY_TOKEN' }
        ],
        bosses: ['boss_mystery'],
        hasTournaments: true,
        tournamentTier: 7
    }
];

WorldMap.AREA_TYPE = AREA_TYPE;
WorldMap.UNLOCK_TYPE = UNLOCK_TYPE;

module.exports = WorldMap;

