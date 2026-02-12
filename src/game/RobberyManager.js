/**
 * RobberyManager - PvP robbery/encounter system
 * 
 * Players can attempt to steal items from other players using crime tools.
 * Success depends on tool quality, attacker level, defender equipment, and crew bonuses.
 * Cooldowns prevent spamming. Victims can recover stolen items within 24 hours.
 */

const database = require('../database/Database');
const gameLogger = require('../utils/GameLogger');

// Robbery cooldowns (milliseconds)
const ROBBERY_COOLDOWN = 4 * 60 * 60 * 1000;  // 4 hours between robbery attempts
const VICTIM_COOLDOWN = 8 * 60 * 60 * 1000;    // 8 hours before can be robbed again
const RECOVERY_WINDOW = 24 * 60 * 60 * 1000;   // 24 hours to recover stolen items

// Tool definitions with base success rates
const TOOLS = {
    'lockpick': {
        name: 'Lockpick',
        baseSuccess: 0.40,
        target: 'same_table',     // Can only rob players at same table
        description: 'Pick the lock on a player\'s stash'
    },
    'rfid_cloner': {
        name: 'RFID Cloner',
        baseSuccess: 0.30,
        target: 'same_area',      // Can rob players in same adventure area
        description: 'Clone their access card to steal remotely'
    },
    'hotwire_kit': {
        name: 'Hotwire Kit',
        baseSuccess: 0.50,
        target: 'vehicles_only',  // Can only steal vehicle items
        description: 'Hotwire and steal vehicles'
    },
    'burner_phone': {
        name: 'Burner Phone',
        modifier: 'crew_bonus',   // +15% success when crew member present
        crewBonus: 0.15,
        description: 'Call in crew backup for a robbery'
    },
    'fake_id': {
        name: 'Fake ID',
        modifier: 'anonymous',    // Victim doesn't see who robbed them
        description: 'Hide your identity during a robbery'
    },
    'getaway_car': {
        name: 'Getaway Car',
        modifier: 'escape',       // +20% escape if caught
        escapeBonus: 0.20,
        description: 'Better odds of escaping if caught'
    }
};

// Defense items and their effects
const DEFENSE_ITEMS = {
    'kevlar_vest': { successReduction: 0.15, passive: true, description: 'Reduces robbery success by 15%' },
    'alarm_system': { successReduction: 0.10, passive: true, alert: true, description: 'Alerts you and reduces success by 10%' },
    'bodyguard': { autoBlock: true, consumable: true, usesPerDay: 1, description: 'Blocks one robbery per day' },
    'safe': { protectSlots: 3, passive: true, description: 'Protects your 3 most valuable items' }
};

class RobberyManager {
    /**
     * Attempt a robbery
     * 
     * @param {string} robberId - Player attempting the robbery
     * @param {string} victimId - Target player
     * @param {string} toolTemplateId - Tool item being used
     * @param {string} targetItemId - Specific item to steal (or null for random)
     * @returns {Object} { success, stolen, caught, itemName, message }
     */
    static async attemptRobbery(robberId, victimId, toolTemplateId, targetItemId) {
        if (robberId === victimId) {
            return { success: false, error: 'You can\'t rob yourself' };
        }

        // Check cooldowns
        const robberCooldown = await RobberyManager.checkRobberCooldown(robberId);
        if (!robberCooldown.canRob) {
            return { success: false, error: `You must wait ${robberCooldown.timeLeft} before robbing again` };
        }

        const victimCooldown = await RobberyManager.checkVictimCooldown(victimId);
        if (!victimCooldown.canBeRobbed) {
            return { success: false, error: 'This player was robbed recently and is protected' };
        }

        // Verify robber has the tool
        const tool = await database.queryOne(
            'SELECT * FROM inventory WHERE user_id = ? AND template_id = ? AND uses_remaining > 0',
            [robberId, toolTemplateId]
        );
        if (!tool) {
            return { success: false, error: 'You don\'t have that tool' };
        }

        const toolDef = TOOLS[toolTemplateId];
        if (!toolDef) {
            return { success: false, error: 'Invalid tool' };
        }

        // Get victim's stealable items
        const victimItems = await database.query(
            'SELECT * FROM inventory WHERE user_id = ? AND is_gambleable = TRUE',
            [victimId]
        );

        if (victimItems.length === 0) {
            return { success: false, error: 'Target has no stealable items' };
        }

        // Check victim's defense items
        const victimDefenses = await RobberyManager.getVictimDefenses(victimId);

        // Check for bodyguard (auto-block)
        if (victimDefenses.hasBodyguard) {
            // Consume bodyguard use
            await RobberyManager.consumeBodyguard(victimId);
            // Consume the robber's tool
            await RobberyManager.consumeTool(robberId, tool.id);
            
            await RobberyManager.logRobbery(robberId, victimId, null, null, toolTemplateId, false, 0);
            
            return {
                success: false,
                blocked: true,
                message: 'Their bodyguard intercepted you! Tool consumed.'
            };
        }

        // Calculate success rate
        let successRate = toolDef.baseSuccess || 0.35;

        // Apply defense reductions
        successRate -= victimDefenses.totalReduction;

        // Apply event multipliers
        try {
            const eventManager = require('../events/EventManager');
            successRate += eventManager.getMultiplier('robbery_success_bonus') - 1;
        } catch (e) {}

        // Apply crew bonus if applicable
        // (simplified — would check if crew member is at same table)

        // Clamp
        successRate = Math.max(0.05, Math.min(0.90, successRate));

        // Roll the dice
        const roll = Math.random();
        const robberySucceeded = roll < successRate;

        // Select item to steal
        let targetItem = null;
        if (robberySucceeded) {
            // Filter out protected items (safe protects top 3 most valuable)
            let stealable = [...victimItems];
            if (victimDefenses.protectedItemIds.size > 0) {
                stealable = stealable.filter(item => !victimDefenses.protectedItemIds.has(item.id));
            }

            if (targetItemId) {
                targetItem = stealable.find(i => i.id === targetItemId);
            }
            if (!targetItem && stealable.length > 0) {
                // Random selection, weighted toward higher value items
                targetItem = stealable[Math.floor(Math.random() * stealable.length)];
            }
        }

        // Consume the robber's tool (consumed on use regardless of outcome)
        await RobberyManager.consumeTool(robberId, tool.id);

        if (robberySucceeded && targetItem) {
            // Transfer item
            await database.query(
                'UPDATE inventory SET user_id = ? WHERE id = ?',
                [robberId, targetItem.id]
            );

            // Log it
            await RobberyManager.logRobbery(robberId, victimId, targetItem.id, targetItem.name, toolTemplateId, true, 0);

            // Set cooldowns
            await RobberyManager.setRobberCooldown(robberId);
            await RobberyManager.setVictimCooldown(victimId);

            gameLogger.gameEvent('ROBBERY', 'Robbery succeeded', {
                robberId, victimId, itemId: targetItem.id, itemName: targetItem.name, tool: toolTemplateId
            });

            return {
                success: true,
                stolen: true,
                itemId: targetItem.id,
                itemName: targetItem.name,
                itemRarity: targetItem.rarity,
                message: `You stole ${targetItem.name}!`
            };
        } else {
            // Failed — robber pays chip penalty
            const penalty = Math.floor(Math.random() * 50000) + 10000; // 10k-60k chip penalty
            await database.query(
                'UPDATE users SET chips = GREATEST(0, chips - ?) WHERE id = ?',
                [penalty, robberId]
            );

            await RobberyManager.logRobbery(robberId, victimId, null, null, toolTemplateId, false, penalty);
            await RobberyManager.setRobberCooldown(robberId);

            gameLogger.gameEvent('ROBBERY', 'Robbery failed', {
                robberId, victimId, tool: toolTemplateId, penalty
            });

            return {
                success: true, // API call succeeded
                stolen: false,
                caught: true,
                penalty,
                message: `Caught! You lost ${penalty.toLocaleString()} chips.`
            };
        }
    }

    /**
     * Attempt to recover a stolen item (victim pays chips)
     */
    static async recoverItem(victimId, robberyLogId) {
        const robbery = await database.queryOne(
            'SELECT * FROM robbery_log WHERE id = ? AND victim_id = ? AND success = TRUE AND recovered = FALSE',
            [robberyLogId, victimId]
        );
        if (!robbery) return { success: false, error: 'No recoverable robbery found' };

        // Check if within recovery window
        const elapsed = Date.now() - new Date(robbery.created_at).getTime();
        if (elapsed > RECOVERY_WINDOW) {
            return { success: false, error: 'Recovery window has expired (24 hours)' };
        }

        // Recovery costs chips
        const recoveryCost = 25000;
        const user = await database.queryOne('SELECT chips FROM users WHERE id = ?', [victimId]);
        if (!user || user.chips < recoveryCost) {
            return { success: false, error: `Need ${recoveryCost.toLocaleString()} chips to recover item` };
        }

        // Pay the cost
        await database.query('UPDATE users SET chips = chips - ? WHERE id = ?', [recoveryCost, victimId]);

        // Transfer item back
        if (robbery.item_id) {
            await database.query(
                'UPDATE inventory SET user_id = ? WHERE id = ?',
                [victimId, robbery.item_id]
            );
        }

        // Mark as recovered
        await database.query(
            'UPDATE robbery_log SET recovered = TRUE, recovered_at = CURRENT_TIMESTAMP WHERE id = ?',
            [robberyLogId]
        );

        gameLogger.gameEvent('ROBBERY', 'Item recovered', { victimId, robberyLogId, itemId: robbery.item_id });

        return { success: true, itemName: robbery.item_name, cost: recoveryCost };
    }

    // === Helper methods ===

    static async checkRobberCooldown(robberId) {
        const lastRobbery = await database.queryOne(
            'SELECT created_at FROM robbery_log WHERE robber_id = ? ORDER BY created_at DESC LIMIT 1',
            [robberId]
        );
        if (!lastRobbery) return { canRob: true };

        const elapsed = Date.now() - new Date(lastRobbery.created_at).getTime();
        // Check for event multiplier on cooldown
        let cooldown = ROBBERY_COOLDOWN;
        try {
            const eventManager = require('../events/EventManager');
            cooldown *= eventManager.getMultiplier('robbery_cooldown_mult');
        } catch (e) {}

        if (elapsed < cooldown) {
            const remaining = cooldown - elapsed;
            const hours = Math.floor(remaining / 3600000);
            const minutes = Math.floor((remaining % 3600000) / 60000);
            return { canRob: false, timeLeft: `${hours}h ${minutes}m` };
        }
        return { canRob: true };
    }

    static async checkVictimCooldown(victimId) {
        const lastRobbed = await database.queryOne(
            'SELECT created_at FROM robbery_log WHERE victim_id = ? AND success = TRUE ORDER BY created_at DESC LIMIT 1',
            [victimId]
        );
        if (!lastRobbed) return { canBeRobbed: true };

        const elapsed = Date.now() - new Date(lastRobbed.created_at).getTime();
        if (elapsed < VICTIM_COOLDOWN) return { canBeRobbed: false };
        return { canBeRobbed: true };
    }

    static async getVictimDefenses(victimId) {
        const defenseItems = await database.query(
            'SELECT * FROM inventory WHERE user_id = ? AND is_equipped = TRUE AND template_id IN (?)',
            [victimId, Object.keys(DEFENSE_ITEMS)]
        ).catch(() => []);

        let totalReduction = 0;
        let hasBodyguard = false;
        const protectedItemIds = new Set();

        for (const item of defenseItems) {
            const def = DEFENSE_ITEMS[item.template_id];
            if (!def) continue;
            if (def.successReduction) totalReduction += def.successReduction;
            if (def.autoBlock) hasBodyguard = true;
        }

        // Check for safe — protects top 3 most valuable
        const hasSafe = defenseItems.some(i => DEFENSE_ITEMS[i.template_id]?.protectSlots);
        if (hasSafe) {
            const allItems = await database.query(
                'SELECT id FROM inventory WHERE user_id = ? AND is_gambleable = TRUE ORDER BY base_value DESC LIMIT 3',
                [victimId]
            );
            allItems.forEach(i => protectedItemIds.add(i.id));
        }

        return { totalReduction, hasBodyguard, protectedItemIds };
    }

    static async consumeTool(robberId, toolItemId) {
        await database.query(
            'UPDATE inventory SET uses_remaining = uses_remaining - 1 WHERE id = ? AND user_id = ?',
            [toolItemId, robberId]
        );
        // Remove if no uses left
        await database.query(
            'DELETE FROM inventory WHERE id = ? AND uses_remaining <= 0',
            [toolItemId]
        );
    }

    static async consumeBodyguard(victimId) {
        // Find and consume one bodyguard use
        const bodyguard = await database.queryOne(
            'SELECT id FROM inventory WHERE user_id = ? AND template_id = ? AND uses_remaining > 0',
            [victimId, 'bodyguard']
        );
        if (bodyguard) {
            await database.query(
                'UPDATE inventory SET uses_remaining = uses_remaining - 1 WHERE id = ?',
                [bodyguard.id]
            );
            await database.query(
                'DELETE FROM inventory WHERE id = ? AND uses_remaining <= 0',
                [bodyguard.id]
            );
        }
    }

    static async setRobberCooldown(robberId) {
        // Cooldown is tracked via robbery_log timestamps — no separate storage needed
    }

    static async setVictimCooldown(victimId) {
        // Cooldown is tracked via robbery_log timestamps — no separate storage needed
    }

    static async logRobbery(robberId, victimId, itemId, itemName, toolUsed, success, chipPenalty) {
        await database.query(`
            INSERT INTO robbery_log (robber_id, victim_id, item_id, item_name, tool_used, success, chip_penalty)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [robberId, victimId, itemId, itemName, toolUsed, success ? 1 : 0, chipPenalty]);
    }

    /**
     * Get robbery history for a player (as robber or victim)
     */
    static async getRobberyHistory(playerId, limit = 20) {
        return await database.query(`
            SELECT rl.*, 
                   ru.username as robber_name,
                   vu.username as victim_name
            FROM robbery_log rl
            LEFT JOIN users ru ON rl.robber_id = ru.id
            LEFT JOIN users vu ON rl.victim_id = vu.id
            WHERE rl.robber_id = ? OR rl.victim_id = ?
            ORDER BY rl.created_at DESC LIMIT ?
        `, [playerId, playerId, limit]);
    }

    /**
     * Get recoverable robberies for a victim
     */
    static async getRecoverableRobberies(victimId) {
        const cutoff = new Date(Date.now() - RECOVERY_WINDOW).toISOString().slice(0, 19).replace('T', ' ');
        return await database.query(`
            SELECT rl.*, ru.username as robber_name
            FROM robbery_log rl
            LEFT JOIN users ru ON rl.robber_id = ru.id
            WHERE rl.victim_id = ? AND rl.success = TRUE AND rl.recovered = FALSE AND rl.created_at >= ?
            ORDER BY rl.created_at DESC
        `, [victimId, cutoff]);
    }
}

RobberyManager.TOOLS = TOOLS;
RobberyManager.DEFENSE_ITEMS = DEFENSE_ITEMS;

module.exports = RobberyManager;
