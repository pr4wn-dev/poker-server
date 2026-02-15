/**
 * CharacterSystem.js - Collectible character management
 * 
 * Characters are items (item_type = 'character') stored in inventory.
 * Everyone starts with the default "Shadow Hacker" (not stored as item — it's free).
 * Characters have rarity, unique sound sets, pixel art sprites, and personality.
 */

const { v4: uuidv4 } = require('uuid');

// ============ CHARACTER DEFINITIONS ============

const CHARACTER_RARITY = {
    COMMON: 'common',
    UNCOMMON: 'uncommon',
    RARE: 'rare',
    EPIC: 'epic',
    LEGENDARY: 'legendary',
    MYTHIC: 'mythic'
};

const RARITY_COLORS = {
    common: '#9d9d9d',
    uncommon: '#1eff00',
    rare: '#0070dd',
    epic: '#a335ee',
    legendary: '#ff8000',
    mythic: '#e6cc80'
};

const RARITY_DROP_WEIGHTS = {
    common: 40,
    uncommon: 30,
    rare: 15,
    epic: 10,
    legendary: 4,
    mythic: 1
};

/**
 * Master character roster.
 * Each character has:
 * - id: unique template_id for inventory system
 * - name: display name
 * - description: flavor text
 * - rarity: drop tier
 * - personality: affects sound selection
 * - sounds: keyed voice line sets (references to audio clip names)
 * - sprite_set: base name for sprite assets (client loads variants: _idle, _win, _lose, _seat)
 * - unlock_methods: how this character can be obtained
 */
const CHARACTERS = {
    // === DEFAULT (everyone has this, not in inventory) ===
    'the_kid': {
        id: 'the_kid',
        name: 'The Kid',
        description: 'A child who lost everything in one terrible night. Searching for their family in the criminal underworld.',
        rarity: 'common',
        is_default: true,
        personality: 'determined',
        sprite_set: 'char_the_kid',
        combatStats: { atk: 5, def: 5, spd: 5 }, // Total: 15 (Common)
        sounds: {
            win: ['kid_win_1', 'kid_win_2', 'kid_win_3'],
            lose: ['kid_lose_1', 'kid_lose_2'],
            fold: ['kid_fold_1'],
            all_in: ['kid_allin_1', 'kid_allin_2'],
            big_pot: ['kid_bigpot_1'],
            taunt: ['kid_taunt_1', 'kid_taunt_2'],
            idle: ['kid_idle_1']
        },
        unlock_methods: ['default']
    },

    // === UNCOMMON ===
    'street_kid': {
        id: 'street_kid',
        name: 'Street Kid',
        description: 'A tough teenager who survived the streets. Rescued from a trafficking ring. Quick and scrappy.',
        rarity: 'uncommon',
        is_default: false,
        personality: 'street_smart',
        sprite_set: 'char_street_kid',
        combatStats: { atk: 8, def: 5, spd: 5 }, // Total: 18 (Uncommon) — glass cannon
        sounds: {
            win: ['street_win_1', 'street_win_2', 'street_win_3'],
            lose: ['street_lose_1', 'street_lose_2'],
            fold: ['street_fold_1', 'street_fold_2'],
            all_in: ['street_allin_1'],
            big_pot: ['street_bigpot_1'],
            taunt: ['street_taunt_1', 'street_taunt_2', 'street_taunt_3'],
            idle: ['street_idle_1']
        },
        unlock_methods: ['drop', 'shop', 'item_ante']
    },

    'the_nurse': {
        id: 'the_nurse',
        name: 'The Nurse',
        description: 'A medical professional taken from a hospital. Calm under pressure, knows how to survive.',
        rarity: 'uncommon',
        is_default: false,
        personality: 'calm',
        sprite_set: 'char_the_nurse',
        combatStats: { atk: 5, def: 5, spd: 8 }, // Total: 18 (Uncommon) — fast and slippery
        sounds: {
            win: ['nurse_win_1', 'nurse_win_2'],
            lose: ['nurse_lose_1', 'nurse_lose_2'],
            fold: ['nurse_fold_1'],
            all_in: ['nurse_allin_1'],
            big_pot: ['nurse_bigpot_1'],
            taunt: ['nurse_taunt_1', 'nurse_taunt_2'],
            idle: ['nurse_idle_1', 'nurse_idle_2']
        },
        unlock_methods: ['drop', 'shop', 'item_ante']
    },

    // === RARE ===
    'the_mechanic': {
        id: 'the_mechanic',
        name: 'The Mechanic',
        description: 'A skilled engineer who was taken for their knowledge. Resourceful and clever under pressure.',
        rarity: 'rare',
        is_default: false,
        personality: 'resourceful',
        sprite_set: 'char_the_mechanic',
        combatStats: { atk: 8, def: 5, spd: 8 }, // Total: 21 (Rare) — balanced striker
        sounds: {
            win: ['mechanic_win_1', 'mechanic_win_2', 'mechanic_win_3'],
            lose: ['mechanic_lose_1', 'mechanic_lose_2'],
            fold: ['mechanic_fold_1'],
            all_in: ['mechanic_allin_1', 'mechanic_allin_2'],
            big_pot: ['mechanic_bigpot_1', 'mechanic_bigpot_2'],
            taunt: ['mechanic_taunt_1', 'mechanic_taunt_2'],
            idle: ['mechanic_idle_1', 'mechanic_idle_2']
        },
        unlock_methods: ['drop', 'item_ante']
    },

    'the_boxer': {
        id: 'the_boxer',
        name: 'The Boxer',
        description: 'A former prizefighter kidnapped for underground fights. Tough as nails, refuses to stay down.',
        rarity: 'rare',
        is_default: false,
        personality: 'tough',
        sprite_set: 'char_the_boxer',
        combatStats: { atk: 6, def: 9, spd: 6 }, // Total: 21 (Rare) — tanky fighter
        sounds: {
            win: ['boxer_win_1', 'boxer_win_2', 'boxer_win_3'],
            lose: ['boxer_lose_1', 'boxer_lose_2'],
            fold: ['boxer_fold_1'],
            all_in: ['boxer_allin_1'],
            big_pot: ['boxer_bigpot_1'],
            taunt: ['boxer_taunt_1', 'boxer_taunt_2'],
            idle: ['boxer_idle_1', 'boxer_idle_2']
        },
        unlock_methods: ['drop', 'item_ante', 'boss']
    },

    'the_teacher': {
        id: 'the_teacher',
        name: 'The Teacher',
        description: 'An educator taken from their classroom. Patient, strategic, always thinking three steps ahead.',
        rarity: 'rare',
        is_default: false,
        personality: 'strategic',
        sprite_set: 'char_the_teacher',
        combatStats: { atk: 7, def: 7, spd: 7 }, // Total: 21 (Rare) — balanced
        sounds: {
            win: ['teacher_win_1', 'teacher_win_2'],
            lose: ['teacher_lose_1', 'teacher_lose_2'],
            fold: ['teacher_fold_1'],
            all_in: ['teacher_allin_1', 'teacher_allin_2'],
            big_pot: ['teacher_bigpot_1'],
            taunt: ['teacher_taunt_1', 'teacher_taunt_2'],
            idle: ['teacher_idle_1', 'teacher_idle_2']
        },
        unlock_methods: ['drop', 'boss']
    },

    // === EPIC ===
    'the_detective': {
        id: 'the_detective',
        name: 'The Detective',
        description: 'A private investigator who got too close to the truth. Sharp, observant, and determined to escape.',
        rarity: 'epic',
        is_default: false,
        personality: 'observant',
        sprite_set: 'char_the_detective',
        combatStats: { atk: 10, def: 6, spd: 8 }, // Total: 24 (Epic) — high damage
        sounds: {
            win: ['detective_win_1', 'detective_win_2', 'detective_win_3'],
            lose: ['detective_lose_1', 'detective_lose_2'],
            fold: ['detective_fold_1', 'detective_fold_2'],
            all_in: ['detective_allin_1', 'detective_allin_2'],
            big_pot: ['detective_bigpot_1'],
            taunt: ['detective_taunt_1', 'detective_taunt_2'],
            idle: ['detective_idle_1', 'detective_idle_2']
        },
        unlock_methods: ['drop', 'boss', 'tournament']
    },

    'the_doctor': {
        id: 'the_doctor',
        name: 'The Doctor',
        description: 'A physician taken for their medical expertise. Calm, precise, and unshakeable under pressure.',
        rarity: 'epic',
        is_default: false,
        personality: 'precise',
        sprite_set: 'char_the_doctor',
        combatStats: { atk: 6, def: 10, spd: 8 }, // Total: 24 (Epic) — defensive tank
        sounds: {
            win: ['doctor_win_1', 'doctor_win_2', 'doctor_win_3'],
            lose: ['doctor_lose_1', 'doctor_lose_2'],
            fold: ['doctor_fold_1'],
            all_in: ['doctor_allin_1', 'doctor_allin_2'],
            big_pot: ['doctor_bigpot_1'],
            taunt: ['doctor_taunt_1', 'doctor_taunt_2'],
            idle: ['doctor_idle_1', 'doctor_idle_2']
        },
        unlock_methods: ['drop', 'tournament']
    },

    // === LEGENDARY ===
    'mother': {
        id: 'mother',
        name: 'Mother',
        description: 'Your mother. The one who was taken that terrible night. Finding her means everything.',
        rarity: 'legendary',
        is_default: false,
        personality: 'protective',
        sprite_set: 'char_mother',
        combatStats: { atk: 10, def: 9, spd: 8 }, // Total: 27 (Legendary) — powerful
        sounds: {
            win: ['mother_win_1', 'mother_win_2'],
            lose: ['mother_lose_1'],
            fold: ['mother_fold_1'],
            all_in: ['mother_allin_1', 'mother_allin_2'],
            big_pot: ['mother_bigpot_1'],
            taunt: ['mother_taunt_1', 'mother_taunt_2'],
            idle: ['mother_idle_1', 'mother_idle_2']
        },
        unlock_methods: ['boss']  // Only from drawer dungeon
    },

    'father': {
        id: 'father',
        name: 'Father',
        description: 'Your father. Strong, protective, taken from you. You won\'t stop until you find him.',
        rarity: 'legendary',
        is_default: false,
        personality: 'strong',
        sprite_set: 'char_father',
        combatStats: { atk: 11, def: 8, spd: 8 }, // Total: 27 (Legendary) — high attack
        sounds: {
            win: ['father_win_1', 'father_win_2'],
            lose: ['father_lose_1'],
            fold: ['father_fold_1'],
            all_in: ['father_allin_1', 'father_allin_2'],
            big_pot: ['father_bigpot_1'],
            taunt: ['father_taunt_1', 'father_taunt_2'],
            idle: ['father_idle_1', 'father_idle_2']
        },
        unlock_methods: ['boss']  // Only from drawer dungeon
    },

    // === MYTHIC ===
    'sibling': {
        id: 'sibling',
        name: 'Sibling',
        description: 'Your brother/sister. You heard them scream that night. Finding them is your deepest hope.',
        rarity: 'mythic',
        is_default: false,
        personality: 'brave',
        sprite_set: 'char_sibling',
        combatStats: { atk: 10, def: 10, spd: 10 }, // Total: 30 (Mythic) — perfect stats
        sounds: {
            win: ['sibling_win_1', 'sibling_win_2'],
            lose: ['sibling_lose_1'],
            fold: ['sibling_fold_1'],
            all_in: ['sibling_allin_1', 'sibling_allin_2'],
            big_pot: ['sibling_bigpot_1', 'sibling_bigpot_2'],
            taunt: ['sibling_taunt_1'],
            idle: ['sibling_idle_1', 'sibling_idle_2']
        },
        unlock_methods: ['boss']  // Rarest drop from drawer dungeon
    }
};

class CharacterSystem {
    constructor(db) {
        this.db = db;
    }

    // ============ QUERIES ============

    /**
     * Get the character definition by template_id
     */
    getCharacterDef(characterId) {
        return CHARACTERS[characterId] || CHARACTERS['the_kid'];
    }

    /**
     * Get all character definitions (for client catalog)
     */
    getAllCharacters() {
        return Object.values(CHARACTERS).map(c => ({
            id: c.id,
            name: c.name,
            description: c.description,
            rarity: c.rarity,
            is_default: c.is_default,
            personality: c.personality,
            sprite_set: c.sprite_set,
            sounds: c.sounds,
            rarity_color: RARITY_COLORS[c.rarity],
            unlock_methods: c.unlock_methods
        }));
    }

    /**
     * Get player's active character (from users table)
     */
    async getActiveCharacter(playerId) {
        const rows = await this.db.query(
            'SELECT active_character FROM users WHERE id = ?', [playerId]
        );
        const activeId = rows?.[0]?.active_character || 'shadow_hacker';
        return this.getCharacterDef(activeId);
    }

    /**
     * Get all characters owned by a player (from inventory)
     */
    async getOwnedCharacters(playerId) {
        const rows = await this.db.query(
            `SELECT template_id, name, rarity, obtained_at, obtained_from 
             FROM inventory 
             WHERE user_id = ? AND item_type = 'character'
             ORDER BY obtained_at DESC`,
            [playerId]
        );
        
        // Always include default
        const owned = [{ 
            template_id: 'shadow_hacker',
            name: 'Shadow Hacker',
            rarity: 'common',
            obtained_at: null,
            obtained_from: 'default',
            is_default: true
        }];
        
        if (rows && rows.length > 0) {
            for (const row of rows) {
                const def = CHARACTERS[row.template_id];
                owned.push({
                    ...row,
                    is_default: false,
                    sprite_set: def?.sprite_set || row.template_id,
                    personality: def?.personality || 'unknown',
                    sounds: def?.sounds || {}
                });
            }
        }
        
        return owned;
    }

    /**
     * Set active character (player must own it or it must be the default)
     */
    async setActiveCharacter(playerId, characterId) {
        // Default is always allowed
        if (characterId === 'shadow_hacker') {
            await this.db.query(
                'UPDATE users SET active_character = ? WHERE id = ?',
                ['shadow_hacker', playerId]
            );
            return { success: true, activeCharacter: 'shadow_hacker' };
        }

        // Check ownership
        const owned = await this.db.query(
            `SELECT id FROM inventory 
             WHERE user_id = ? AND template_id = ? AND item_type = 'character'
             LIMIT 1`,
            [playerId, characterId]
        );
        
        if (!owned || owned.length === 0) {
            return { success: false, error: 'You don\'t own that character' };
        }

        await this.db.query(
            'UPDATE users SET active_character = ? WHERE id = ?',
            [characterId, playerId]
        );
        
        return { success: true, activeCharacter: characterId };
    }

    /**
     * Grant a character to a player (from boss drops, tournament rewards, etc.)
     */
    async grantCharacter(playerId, characterId, source = 'drop') {
        const def = CHARACTERS[characterId];
        if (!def || def.is_default) {
            return { success: false, error: 'Invalid character' };
        }

        // Check if already owned
        const existing = await this.db.query(
            `SELECT id FROM inventory 
             WHERE user_id = ? AND template_id = ? AND item_type = 'character'`,
            [playerId, characterId]
        );
        
        if (existing && existing.length > 0) {
            // Already owned — give chip compensation instead
            const compensation = this._rarityChipValue(def.rarity);
            await this.db.query(
                'UPDATE users SET chips = chips + ? WHERE id = ?',
                [compensation, playerId]
            );
            return { 
                success: true, 
                duplicate: true, 
                compensation,
                message: `Already owned! Received ${compensation.toLocaleString()} chips instead.`
            };
        }

        // Add to inventory
        const itemId = uuidv4();
        await this.db.query(
            `INSERT INTO inventory (id, user_id, template_id, name, description, item_type, rarity, 
             icon, uses_remaining, max_uses, base_value, obtained_from, is_tradeable, is_gambleable)
             VALUES (?, ?, ?, ?, ?, 'character', ?, ?, -1, -1, ?, ?, FALSE, FALSE)`,
            [
                itemId, playerId, characterId, def.name, def.description,
                def.rarity, def.sprite_set, this._rarityChipValue(def.rarity),
                source
            ]
        );

        return { 
            success: true, 
            character: {
                id: characterId,
                name: def.name,
                rarity: def.rarity,
                rarity_color: RARITY_COLORS[def.rarity],
                sprite_set: def.sprite_set,
                personality: def.personality
            }
        };
    }

    /**
     * Roll for a random character drop based on rarity weights.
     * Returns null if no drop (most of the time).
     * dropChance: 0-1 chance that ANY character drops at all.
     */
    rollCharacterDrop(dropChance = 0.05) {
        // First check if we get a drop at all
        if (Math.random() > dropChance) return null;

        // Roll rarity
        const droppableChars = Object.values(CHARACTERS).filter(c => !c.is_default);
        const totalWeight = Object.values(RARITY_DROP_WEIGHTS).reduce((a, b) => a + b, 0);
        let roll = Math.random() * totalWeight;
        let selectedRarity = 'common';
        
        for (const [rarity, weight] of Object.entries(RARITY_DROP_WEIGHTS)) {
            roll -= weight;
            if (roll <= 0) {
                selectedRarity = rarity;
                break;
            }
        }

        // Pick random character of that rarity
        const candidates = droppableChars.filter(c => c.rarity === selectedRarity);
        if (candidates.length === 0) {
            // Fallback to any droppable
            return droppableChars[Math.floor(Math.random() * droppableChars.length)]?.id || null;
        }
        
        return candidates[Math.floor(Math.random() * candidates.length)].id;
    }

    /**
     * Get combat stats for a character
     * @returns {{ atk: number, def: number, spd: number }}
     */
    getCombatStats(characterId) {
        const def = CHARACTERS[characterId] || CHARACTERS['shadow_hacker'];
        return def.combatStats || { atk: 5, def: 5, spd: 5 };
    }

    /**
     * Get the sound key for a character event
     */
    getCharacterSound(characterId, eventType) {
        const def = CHARACTERS[characterId] || CHARACTERS['shadow_hacker'];
        const sounds = def.sounds?.[eventType];
        if (!sounds || sounds.length === 0) return null;
        return sounds[Math.floor(Math.random() * sounds.length)];
    }

    // ============ HELPERS ============

    _rarityChipValue(rarity) {
        const values = {
            common: 5000,
            uncommon: 25000,
            rare: 100000,
            epic: 500000,
            legendary: 2000000,
            mythic: 10000000
        };
        return values[rarity] || 10000;
    }
}

// Export both the class and the definitions
module.exports = CharacterSystem;
module.exports.CHARACTERS = CHARACTERS;
module.exports.CHARACTER_RARITY = CHARACTER_RARITY;
module.exports.RARITY_COLORS = RARITY_COLORS;
