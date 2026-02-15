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
        name: 'The Empty Streets',
        type: AREA_TYPE.STARTER,
        description: 'The rain-soaked streets where you wandered alone that terrible night. Where it all began.',
        icon: 'area_empty_streets',
        position: { x: 0, y: 0 },
        requirements: [],  // Always accessible
        bosses: ['boss_tutorial'],
        hasTournaments: false  // Tutorial only
    },
    {
        id: 'area_downtown',
        name: 'The Back Alley',
        type: AREA_TYPE.UNDERGROUND,
        description: 'Underground poker dens where criminals gather. Smoky rooms, dangerous men, and your first real wins.',
        icon: 'area_back_alley',
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
        name: 'Underground Poker Circuit',
        type: AREA_TYPE.UNDERGROUND,
        description: 'Illegal gambling rings beneath the city. You\'re making real money now. The stakes get higher. The players get meaner.',
        icon: 'area_underground_circuit',
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
        name: 'The Docks',
        type: AREA_TYPE.CITY,
        description: 'The waterfront where shipments come in — drugs, weapons, and dirty money. Crime bosses control the docks.',
        icon: 'area_docks',
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
        name: 'Mafia Headquarters',
        type: AREA_TYPE.VIP,
        description: 'The heart of organized crime. You\'re deep in the underworld now. The "family" treats you like one of their own.',
        icon: 'area_mafia_hq',
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
        name: 'The Wastelands',
        type: AREA_TYPE.UNDERGROUND,
        description: 'Abandoned industrial district where the worst criminals hide. Getting closer to the killer. The atmosphere darkens.',
        icon: 'area_wastelands',
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
        name: 'The Killer\'s Estate',
        type: AREA_TYPE.PENTHOUSE,
        description: 'A mansion on the outskirts of the city. Heavily guarded. Full of twisted secrets. You\'ve finally found him.',
        icon: 'area_estate',
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
        name: 'The Drawer Dungeon',
        type: AREA_TYPE.SECRET,
        description: 'The killer\'s basement. A massive vault filled with thousands of drawers. Each one contains a person he\'s kidnapped.',
        icon: 'area_dungeon',
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

