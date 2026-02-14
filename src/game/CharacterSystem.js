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
    'shadow_hacker': {
        id: 'shadow_hacker',
        name: 'Shadow Hacker',
        description: 'A hooded figure shrouded in darkness. Face hidden, identity unknown. The default operative.',
        rarity: 'common',
        is_default: true,
        personality: 'mysterious',
        sprite_set: 'char_shadow_hacker',
        combatStats: { atk: 5, def: 5, spd: 5 }, // Total: 15 (Common)
        sounds: {
            win: ['shadow_win_1', 'shadow_win_2', 'shadow_win_3'],
            lose: ['shadow_lose_1', 'shadow_lose_2'],
            fold: ['shadow_fold_1'],
            all_in: ['shadow_allin_1', 'shadow_allin_2'],
            big_pot: ['shadow_bigpot_1'],
            taunt: ['shadow_taunt_1', 'shadow_taunt_2'],
            idle: ['shadow_idle_1']
        },
        unlock_methods: ['default']
    },

    // === UNCOMMON ===
    'big_tex': {
        id: 'big_tex',
        name: 'Big Tex',
        description: 'A Texan with a manly mustache and a bad attitude. Don\'t mess with his chips, partner.',
        rarity: 'uncommon',
        is_default: false,
        personality: 'aggressive',
        sprite_set: 'char_big_tex',
        combatStats: { atk: 8, def: 5, spd: 5 }, // Total: 18 (Uncommon) — glass cannon cowboy
        sounds: {
            win: ['tex_win_1', 'tex_win_2', 'tex_win_3'],
            lose: ['tex_lose_1', 'tex_lose_2'],
            fold: ['tex_fold_1', 'tex_fold_2'],
            all_in: ['tex_allin_1'],
            big_pot: ['tex_bigpot_1'],
            taunt: ['tex_taunt_1', 'tex_taunt_2', 'tex_taunt_3'],
            idle: ['tex_idle_1']
        },
        unlock_methods: ['drop', 'shop', 'item_ante']
    },

    'whiskers': {
        id: 'whiskers',
        name: 'Whiskers',
        description: 'A smug cat in a poker visor. Meows when winning, hisses when losing. Surprisingly good at bluffs.',
        rarity: 'uncommon',
        is_default: false,
        personality: 'smug',
        sprite_set: 'char_whiskers',
        combatStats: { atk: 5, def: 5, spd: 8 }, // Total: 18 (Uncommon) — fast and slippery
        sounds: {
            win: ['whiskers_win_1', 'whiskers_win_2'],
            lose: ['whiskers_lose_1', 'whiskers_lose_2'],
            fold: ['whiskers_fold_1'],
            all_in: ['whiskers_allin_1'],
            big_pot: ['whiskers_bigpot_1'],
            taunt: ['whiskers_taunt_1', 'whiskers_taunt_2'],
            idle: ['whiskers_idle_1', 'whiskers_idle_2']
        },
        unlock_methods: ['drop', 'shop', 'item_ante']
    },

    // === RARE ===
    'lil_stinky': {
        id: 'lil_stinky',
        name: 'Lil\' Stinky',
        description: 'A ghetto baby in a diaper. Cries when losing, farts when winning. Surprisingly ruthless.',
        rarity: 'rare',
        is_default: false,
        personality: 'chaotic',
        sprite_set: 'char_lil_stinky',
        combatStats: { atk: 8, def: 5, spd: 8 }, // Total: 21 (Rare) — chaotic striker
        sounds: {
            win: ['stinky_win_1', 'stinky_win_2', 'stinky_fart_1'],
            lose: ['stinky_cry_1', 'stinky_cry_2', 'stinky_wah_1'],
            fold: ['stinky_fold_1'],
            all_in: ['stinky_allin_1', 'stinky_giggle_1'],
            big_pot: ['stinky_bigpot_1', 'stinky_fart_2'],
            taunt: ['stinky_taunt_1', 'stinky_raspberry_1'],
            idle: ['stinky_idle_1', 'stinky_gurgle_1']
        },
        unlock_methods: ['drop', 'item_ante']
    },

    'bones': {
        id: 'bones',
        name: 'Bones',
        description: 'A skeleton in a tailored suit. Rattles when moving, tells death puns. Already dead inside from bad beats.',
        rarity: 'rare',
        is_default: false,
        personality: 'dark_humor',
        sprite_set: 'char_bones',
        combatStats: { atk: 6, def: 9, spd: 6 }, // Total: 21 (Rare) — tanky skeleton
        sounds: {
            win: ['bones_win_1', 'bones_rattle_1', 'bones_win_2'],
            lose: ['bones_lose_1', 'bones_crack_1'],
            fold: ['bones_fold_1'],
            all_in: ['bones_allin_1'],
            big_pot: ['bones_bigpot_1'],
            taunt: ['bones_taunt_1', 'bones_taunt_2'],
            idle: ['bones_idle_1', 'bones_rattle_2']
        },
        unlock_methods: ['drop', 'item_ante', 'boss']
    },

    'deadbeat': {
        id: 'deadbeat',
        name: 'Deadbeat',
        description: 'A zombie who just wants chips... and braaains. Groans at everything. Surprisingly strategic undead.',
        rarity: 'rare',
        is_default: false,
        personality: 'slow',
        sprite_set: 'char_deadbeat',
        combatStats: { atk: 7, def: 7, spd: 7 }, // Total: 21 (Rare) — balanced undead
        sounds: {
            win: ['deadbeat_win_1', 'deadbeat_groan_1'],
            lose: ['deadbeat_lose_1', 'deadbeat_moan_1'],
            fold: ['deadbeat_fold_1'],
            all_in: ['deadbeat_allin_1', 'deadbeat_roar_1'],
            big_pot: ['deadbeat_bigpot_1'],
            taunt: ['deadbeat_taunt_1', 'deadbeat_brains_1'],
            idle: ['deadbeat_idle_1', 'deadbeat_shuffle_1']
        },
        unlock_methods: ['drop', 'boss']
    },

    // === EPIC ===
    'glitch': {
        id: 'glitch',
        name: 'Glitch',
        description: 'A broken android with corrupted memory. Speaks in error messages and static. Occasionally displays the wrong emotion.',
        rarity: 'epic',
        is_default: false,
        personality: 'glitchy',
        sprite_set: 'char_glitch',
        combatStats: { atk: 10, def: 6, spd: 8 }, // Total: 24 (Epic) — high damage android
        sounds: {
            win: ['glitch_win_1', 'glitch_beep_1', 'glitch_error_success_1'],
            lose: ['glitch_lose_1', 'glitch_static_1'],
            fold: ['glitch_fold_1', 'glitch_shutdown_1'],
            all_in: ['glitch_allin_1', 'glitch_overclock_1'],
            big_pot: ['glitch_bigpot_1'],
            taunt: ['glitch_taunt_1', 'glitch_virus_1'],
            idle: ['glitch_idle_1', 'glitch_hum_1']
        },
        unlock_methods: ['drop', 'boss', 'tournament']
    },

    'nana': {
        id: 'nana',
        name: 'Nana',
        description: 'Somebody\'s grandma who wandered into the wrong game. Knits between hands. Passive aggressive trash talk.',
        rarity: 'epic',
        is_default: false,
        personality: 'passive_aggressive',
        sprite_set: 'char_nana',
        combatStats: { atk: 6, def: 10, spd: 8 }, // Total: 24 (Epic) — tanky grandma
        sounds: {
            win: ['nana_win_1', 'nana_win_2', 'nana_chuckle_1'],
            lose: ['nana_lose_1', 'nana_sigh_1'],
            fold: ['nana_fold_1', 'nana_knit_1'],
            all_in: ['nana_allin_1'],
            big_pot: ['nana_bigpot_1'],
            taunt: ['nana_taunt_1', 'nana_taunt_2', 'nana_cookies_1'],
            idle: ['nana_idle_1', 'nana_snore_1']
        },
        unlock_methods: ['drop', 'tournament']
    },

    // === LEGENDARY ===
    'the_don': {
        id: 'the_don',
        name: 'The Don',
        description: 'A mafia boss with a cigar and an offer you can\'t refuse. Deep intimidating voice. Runs the table.',
        rarity: 'legendary',
        is_default: false,
        personality: 'intimidating',
        sprite_set: 'char_the_don',
        combatStats: { atk: 10, def: 9, spd: 8 }, // Total: 27 (Legendary) — devastating boss
        sounds: {
            win: ['don_win_1', 'don_win_2'],
            lose: ['don_lose_1'],
            fold: ['don_fold_1'],
            all_in: ['don_allin_1', 'don_offer_1'],
            big_pot: ['don_bigpot_1'],
            taunt: ['don_taunt_1', 'don_taunt_2', 'don_threat_1'],
            idle: ['don_idle_1', 'don_cigar_1']
        },
        unlock_methods: ['boss', 'tournament']
    },

    // === MYTHIC ===
    'pixel_god': {
        id: 'pixel_god',
        name: 'Pixel God',
        description: 'A glowing 8-bit deity. Speaks in chiptune. Bends probability. Only the luckiest will ever see this one.',
        rarity: 'mythic',
        is_default: false,
        personality: 'divine',
        sprite_set: 'char_pixel_god',
        combatStats: { atk: 10, def: 10, spd: 10 }, // Total: 30 (Mythic) — perfect stats
        sounds: {
            win: ['pixelgod_win_1', 'pixelgod_fanfare_1'],
            lose: ['pixelgod_lose_1'],
            fold: ['pixelgod_fold_1'],
            all_in: ['pixelgod_allin_1', 'pixelgod_thunder_1'],
            big_pot: ['pixelgod_bigpot_1', 'pixelgod_choir_1'],
            taunt: ['pixelgod_taunt_1'],
            idle: ['pixelgod_idle_1', 'pixelgod_hum_1']
        },
        unlock_methods: ['boss']
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
        return CHARACTERS[characterId] || CHARACTERS['shadow_hacker'];
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
