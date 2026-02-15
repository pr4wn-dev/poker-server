/**
 * CombatManager.js — PvP Combat System
 * 
 * Replaces the old Robbery/Karma system with a narrative "Wild West showdown" PvP system.
 * Players mark opponents during poker games. After the game ends, marks become challenges.
 * Also supports outside-game challenges (friends, recent opponents, leaderboard).
 * 
 * Combat resolves automatically based on character stats + equipped items + crew backup + random roll.
 */

const database = require('../database/Database');
const gameLogger = require('../utils/GameLogger');
const { v4: uuidv4 } = require('uuid');

// Timing constants
const CHALLENGE_TIMEOUT_MS = 30 * 1000;         // 30 seconds to respond
const BRUISED_DURATION_MS = 60 * 60 * 1000;     // 1 hour after losing a fight
const COWARD_DURATION_MS = 60 * 60 * 1000;      // 1 hour coward tag after fleeing
const COOLDOWN_PER_TARGET_MS = 24 * 60 * 60 * 1000; // 1 challenge per target per 24h
const MINIMUM_CHIPS_TO_BE_CHALLENGED = 1000;

// Heat tiers
const NOTORIETY_TIERS = [
    { min: 0,  max: 5,   title: 'Civilian',     visual: 'none' },
    { min: 6,  max: 15,  title: 'Troublemaker', visual: 'small_skull' },
    { min: 16, max: 30,  title: 'Outlaw',       visual: 'skull_crossbones' },
    { min: 31, max: 50,  title: 'Gunslinger',   visual: 'flaming_skull' },
    { min: 51, max: 9999, title: 'Most Wanted', visual: 'animated_skull' }
];

class CombatManager {
    constructor(io, gameManager) {
        this.io = io;
        this.gameManager = gameManager;
        // Active marks per table: Map<tableId, Map<markerId, Set<targetId>>>
        this.tableMarks = new Map();
        // Active challenges awaiting response: Map<challengeId, challengeData>
        this.activeChallenges = new Map();
    }

    // ============ NOTORIETY ============

    /**
     * Get heat tier info for a given heat value
     */
    static getHeatTier(heat) {
        const n = Math.floor(heat || 0);
        for (const tier of NOTORIETY_TIERS) {
            if (n >= tier.min && n <= tier.max) {
                return { title: tier.title, visual: tier.visual, heat: n };
            }
        }
        return { title: 'Most Wanted', visual: 'animated_skull', heat: n };
    }

    /**
     * Modify a player's heat and log it
     */
    async modifyHeat(userId, delta, reason, details = null) {
        const row = await database.queryOne('SELECT heat FROM users WHERE id = ?', [userId]);
        const current = row?.heat || 0;
        const newVal = Math.max(0, current + delta); // Never goes below 0

        if (newVal !== current) {
            await database.query('UPDATE users SET heat = ? WHERE id = ?', [newVal, userId]);
            await database.query(
                `INSERT INTO heat_history (user_id, heat_before, heat_after, change_amount, reason, details)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [userId, current, newVal, delta, reason, details]
            );
        }

        return { before: current, after: newVal, tier: CombatManager.getHeatTier(newVal) };
    }

    /**
     * Get heat combat bonus (+1 per 10 heat, max +5)
     */
    static getHeatBonus(heat) {
        return Math.min(5, Math.floor((heat || 0) / 10));
    }

    // ============ MARKS (During Poker Game) ============

    /**
     * Player marks a target during a poker game (silent)
     */
    markPlayer(tableId, markerId, targetId) {
        if (markerId === targetId) {
            return { success: false, error: "You can't mark yourself" };
        }

        if (!this.tableMarks.has(tableId)) {
            this.tableMarks.set(tableId, new Map());
        }
        const tableMap = this.tableMarks.get(tableId);

        if (!tableMap.has(markerId)) {
            tableMap.set(markerId, new Set());
        }
        tableMap.get(markerId).add(targetId);

        gameLogger.gameEvent('COMBAT', '[MARK] Player marked', { tableId, markerId, targetId });
        return { success: true, targetId };
    }

    /**
     * Player unmarks a target during a poker game
     */
    unmarkPlayer(tableId, markerId, targetId) {
        const tableMap = this.tableMarks.get(tableId);
        if (tableMap?.has(markerId)) {
            tableMap.get(markerId).delete(targetId);
        }
        return { success: true };
    }

    /**
     * Get all marks for a table (called when game ends)
     * Returns { mutualPairs: [[a,b], ...], oneWayMarks: [{markerId, targetId}, ...] }
     */
    getMarksForTable(tableId) {
        const tableMap = this.tableMarks.get(tableId);
        if (!tableMap || tableMap.size === 0) {
            return { mutualPairs: [], oneWayMarks: [] };
        }

        const mutualPairs = [];
        const processedMutuals = new Set();
        const oneWayMarks = [];

        for (const [markerId, targets] of tableMap) {
            for (const targetId of targets) {
                const pairKey = [markerId, targetId].sort().join('_');
                
                // Check if target also marked the marker (mutual)
                if (tableMap.has(targetId) && tableMap.get(targetId).has(markerId)) {
                    if (!processedMutuals.has(pairKey)) {
                        mutualPairs.push([markerId, targetId]);
                        processedMutuals.add(pairKey);
                    }
                } else {
                    oneWayMarks.push({ markerId, targetId });
                }
            }
        }

        // Clear marks for this table
        this.tableMarks.delete(tableId);

        return { mutualPairs, oneWayMarks };
    }

    /**
     * Clear all marks for a player who leaves a table (marks cancelled)
     */
    clearPlayerMarks(tableId, playerId) {
        const tableMap = this.tableMarks.get(tableId);
        if (tableMap) {
            tableMap.delete(playerId);
            // Also remove this player as a target from others' marks
            for (const [, targets] of tableMap) {
                targets.delete(playerId);
            }
        }
    }

    // ============ CHALLENGES ============

    /**
     * Create a challenge (from mark delivery or outside-game)
     * Returns the challenge object to send to the target
     */
    async createChallenge(challengerId, targetId, source = 'in_game', tableId = null, isMutual = false) {
        // Validate
        if (challengerId === targetId) {
            return { success: false, error: "Can't challenge yourself" };
        }

        // Check target has minimum chips
        const targetUser = await database.queryOne('SELECT chips, bruised_until FROM users WHERE id = ?', [targetId]);
        if (!targetUser) return { success: false, error: 'Target not found' };
        if (targetUser.chips < MINIMUM_CHIPS_TO_BE_CHALLENGED) {
            return { success: false, error: 'Target has too few chips (poverty protection)' };
        }

        // Check bruised protection
        if (targetUser.bruised_until && new Date(targetUser.bruised_until) > new Date()) {
            return { success: false, error: 'Target is bruised and protected' };
        }

        // Check cooldown (1 per target per 24h)
        const recentChallenge = await database.queryOne(
            `SELECT id FROM combat_log 
             WHERE challenger_id = ? AND target_id = ? AND created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)`,
            [challengerId, targetId]
        );
        if (recentChallenge && !isMutual) {
            return { success: false, error: 'Already challenged this player in the last 24 hours' };
        }

        // Check crew immunity
        const sameCrewCheck = await database.queryOne(
            `SELECT cm1.crew_id FROM crew_members cm1
             JOIN crew_members cm2 ON cm1.crew_id = cm2.crew_id
             WHERE cm1.player_id = ? AND cm2.player_id = ?`,
            [challengerId, targetId]
        );
        if (sameCrewCheck) {
            return { success: false, error: "Can't challenge your own crewmate" };
        }

        // Auto-match combat items
        const itemMatch = await this._matchCombatItems(challengerId, targetId);

        // Calculate chip stake
        const challengerUser = await database.queryOne('SELECT chips FROM users WHERE id = ?', [challengerId]);

        const challengeId = uuidv4();
        const challenge = {
            challengeId,
            challengerId,
            targetId,
            source,
            tableId,
            isMutual,
            challengerItem: itemMatch.challengerItem,
            targetItem: itemMatch.targetItem,
            chipStake: Math.floor(targetUser.chips / 2),
            challengerChipStake: Math.floor((challengerUser?.chips || 0) / 2),
            createdAt: Date.now(),
            timeoutMs: CHALLENGE_TIMEOUT_MS,
            status: 'pending'
        };

        this.activeChallenges.set(challengeId, challenge);

        // Set timeout for auto-flee (or auto-lose if disconnected — handled in respondToChallenge)
        challenge.timeoutHandle = setTimeout(() => {
            this._handleChallengeTimeout(challengeId);
        }, CHALLENGE_TIMEOUT_MS);

        gameLogger.gameEvent('COMBAT', '[CHALLENGE_CREATED]', {
            challengeId, challengerId, targetId, source, isMutual,
            challengerItem: itemMatch.challengerItem?.templateId || 'none',
            targetItem: itemMatch.targetItem?.templateId || 'none'
        });

        return { success: true, challenge };
    }

    /**
     * Respond to a challenge: 'fight' or 'flee'
     */
    async respondToChallenge(challengeId, action) {
        const challenge = this.activeChallenges.get(challengeId);
        if (!challenge || challenge.status !== 'pending') {
            return { success: false, error: 'Challenge not found or already resolved' };
        }

        // Clear timeout
        if (challenge.timeoutHandle) clearTimeout(challenge.timeoutHandle);
        challenge.status = 'resolving';

        if (action === 'fight' || challenge.isMutual) {
            return await this._resolveCombat(challenge, 'fight');
        } else if (action === 'flee') {
            return await this._resolveFlee(challenge);
        } else {
            return { success: false, error: 'Invalid action. Must be fight or flee.' };
        }
    }

    /**
     * Handle disconnect during challenge (auto-LOSE)
     */
    async handleDisconnectDuringChallenge(playerId) {
        for (const [challengeId, challenge] of this.activeChallenges) {
            if (challenge.targetId === playerId && challenge.status === 'pending') {
                if (challenge.timeoutHandle) clearTimeout(challenge.timeoutHandle);
                challenge.status = 'resolving';
                const result = await this._resolveCombat(challenge, 'disconnect');
                // Notify challenger of win
                return { challengeId, result };
            }
        }
        return null;
    }

    // ============ COMBAT RESOLUTION (PRIVATE) ============

    /**
     * Resolve actual combat
     */
    async _resolveCombat(challenge, targetAction) {
        const { challengerId, targetId, challengerItem, targetItem, isMutual, source, tableId } = challenge;

        // Get character combat stats
        const CharacterSystem = require('./CharacterSystem');
        const charSystem = new CharacterSystem(database);
        
        const challengerChar = await charSystem.getActiveCharacter(challengerId);
        const targetChar = await charSystem.getActiveCharacter(targetId);
        
        const challengerStats = charSystem.getCombatStats(challengerChar.id);
        const targetStats = charSystem.getCombatStats(targetChar.id);

        // Get equipped combat item bonuses
        const challengerEquipped = await this._getEquippedCombatBonuses(challengerId);
        const targetEquipped = await this._getEquippedCombatBonuses(targetId);

        // Get crew backup
        const challengerCrewBonus = await this._getCrewBackupBonus(challengerId);
        const targetCrewBonus = await this._getCrewBackupBonus(targetId);

        // Get heat bonus
        const challengerHeat = await this._getHeat(challengerId);
        const targetHeat = await this._getHeat(targetId);
        const challengerHeatBonus = CombatManager.getHeatBonus(challengerHeat);
        const targetHeatBonus = CombatManager.getHeatBonus(targetHeat);

        // Calculate combat scores
        const challengerBase = (challengerStats.atk + challengerStats.def + challengerStats.spd)
            + (challengerEquipped.atk + challengerEquipped.def + challengerEquipped.spd)
            + challengerCrewBonus
            + challengerHeatBonus;

        const targetBase = (targetStats.atk + targetStats.def + targetStats.spd)
            + (targetEquipped.atk + targetEquipped.def + targetEquipped.spd)
            + targetCrewBonus
            + targetHeatBonus;

        // Random roll ±20%
        const challengerRoll = challengerBase * (0.80 + Math.random() * 0.40);
        const targetRoll = targetBase * (0.80 + Math.random() * 0.40);

        const challengerWins = challengerRoll >= targetRoll;
        const winnerId = challengerWins ? challengerId : targetId;
        const loserId = challengerWins ? targetId : challengerId;

        // Transfer chips (half of loser's chips)
        const loserUser = await database.queryOne('SELECT chips FROM users WHERE id = ?', [loserId]);
        const chipsTransferred = Math.floor((loserUser?.chips || 0) / 2);
        
        if (chipsTransferred > 0) {
            await database.query('UPDATE users SET chips = chips - ? WHERE id = ?', [chipsTransferred, loserId]);
            await database.query('UPDATE users SET chips = chips + ? WHERE id = ?', [chipsTransferred, winnerId]);
        }

        // Transfer wagered items
        const winnerItemId = challengerWins ? targetItem?.id : challengerItem?.id;
        const loserItemId = challengerWins ? challengerItem?.id : targetItem?.id;
        
        if (winnerItemId) {
            // Winner gets loser's wagered item
            await database.query('UPDATE inventory SET user_id = ? WHERE id = ?', [winnerId, winnerItemId]);
        }
        // Winner keeps their own wagered item (it's already theirs)

        // Update combat stats
        await database.query(
            'UPDATE users SET combat_wins = combat_wins + 1, last_combat_at = NOW() WHERE id = ?',
            [winnerId]
        );
        await database.query(
            `UPDATE users SET combat_losses = combat_losses + 1, last_combat_at = NOW(), 
             bruised_until = DATE_ADD(NOW(), INTERVAL 1 HOUR) WHERE id = ?`,
            [loserId]
        );

        // Update heat
        const winnerHeat = await this.modifyHeat(winnerId, 1, 'combat_win', `Won fight vs ${loserId}`);
        const loserHeat = await this.modifyHeat(loserId, 0.5, 'combat_loss', `Lost fight vs ${winnerId}`);

        // Log combat
        await database.query(
            `INSERT INTO combat_log 
             (challenger_id, target_id, winner_id, challenger_item_id, target_item_id,
              chips_transferred, challenger_combat_score, target_combat_score,
              target_action, is_mutual, source, table_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                challengerId, targetId, winnerId,
                challengerItem?.id || null, targetItem?.id || null,
                chipsTransferred, challengerRoll, targetRoll,
                targetAction, isMutual ? 1 : 0, source, tableId
            ]
        );

        // Clean up
        this.activeChallenges.delete(challenge.challengeId);

        const result = {
            success: true,
            challengeId: challenge.challengeId,
            winnerId,
            loserId,
            challengerScore: Math.round(challengerRoll * 10) / 10,
            targetScore: Math.round(targetRoll * 10) / 10,
            chipsTransferred,
            itemWon: winnerItemId ? (challengerWins ? targetItem : challengerItem) : null,
            itemLost: winnerItemId ? (challengerWins ? challengerItem : targetItem) : null,
            isMutual,
            targetAction,
            winnerHeat: winnerHeat.tier,
            loserHeat: loserHeat.tier
        };

        gameLogger.gameEvent('COMBAT', '[COMBAT_RESOLVED]', {
            challengeId: challenge.challengeId, winnerId, loserId,
            scores: `${Math.round(challengerRoll)}-${Math.round(targetRoll)}`,
            chips: chipsTransferred
        });

        return result;
    }

    /**
     * Resolve fleeing from a challenge
     */
    async _resolveFlee(challenge) {
        const { challengeId, challengerId, targetId, source, tableId } = challenge;

        // Fleeing player loses 10% of chips
        const targetUser = await database.queryOne('SELECT chips FROM users WHERE id = ?', [targetId]);
        const chipsPenalty = Math.floor((targetUser?.chips || 0) * 0.10);

        if (chipsPenalty > 0) {
            await database.query('UPDATE users SET chips = chips - ? WHERE id = ?', [chipsPenalty, targetId]);
            await database.query('UPDATE users SET chips = chips + ? WHERE id = ?', [chipsPenalty, challengerId]);
        }

        // Set coward tag
        await database.query(
            'UPDATE users SET coward_until = DATE_ADD(NOW(), INTERVAL 1 HOUR) WHERE id = ?',
            [targetId]
        );

        // Log it
        await database.query(
            `INSERT INTO combat_log 
             (challenger_id, target_id, winner_id, chips_transferred, 
              challenger_combat_score, target_combat_score, target_action, is_mutual, source, table_id)
             VALUES (?, ?, NULL, ?, 0, 0, 'flee', ?, ?, ?)`,
            [challengerId, targetId, chipsPenalty, challenge.isMutual ? 1 : 0, source, tableId]
        );

        // No heat for fleeing (0 gain)

        // Clean up
        this.activeChallenges.delete(challengeId);

        gameLogger.gameEvent('COMBAT', '[COMBAT_FLED]', { challengeId, targetId, chipsPenalty });

        return {
            success: true,
            challengeId,
            fled: true,
            fleeingPlayer: targetId,
            chipsPenalty,
            challengerGain: chipsPenalty
        };
    }

    /**
     * Handle challenge timeout (auto-flee)
     */
    async _handleChallengeTimeout(challengeId) {
        const challenge = this.activeChallenges.get(challengeId);
        if (!challenge || challenge.status !== 'pending') return;

        challenge.status = 'resolving';
        const result = await this._resolveFlee(challenge);

        // Notify both players
        this._emitToPlayer(challenge.targetId, 'challenge_expired', {
            challengeId, reason: 'timeout', ...result
        });
        this._emitToPlayer(challenge.challengerId, 'combat_fled', result);
    }

    // ============ ITEM MATCHING (PRIVATE) ============

    /**
     * Auto-match combat items between two players
     * Returns { challengerItem, targetItem }
     */
    async _matchCombatItems(challengerId, targetId) {
        // Get challenger's combat items
        const challengerItems = await database.query(
            `SELECT id, template_id, name, rarity, item_type, power_score, combat_atk, combat_def, combat_spd
             FROM inventory 
             WHERE user_id = ? AND item_type IN ('weapon', 'armor', 'gear') AND is_gambleable = TRUE
             ORDER BY power_score DESC`,
            [challengerId]
        );

        if (challengerItems.length === 0) {
            // Chips-only fight
            return { challengerItem: null, targetItem: null };
        }

        // Pick a random combat item from challenger
        const challengerItem = challengerItems[Math.floor(Math.random() * challengerItems.length)];
        const challengerPS = challengerItem.power_score || 0;

        // Get target's combat items
        const targetItems = await database.query(
            `SELECT id, template_id, name, rarity, item_type, power_score, combat_atk, combat_def, combat_spd
             FROM inventory 
             WHERE user_id = ? AND item_type IN ('weapon', 'armor', 'gear') AND is_gambleable = TRUE
             ORDER BY ABS(power_score - ?) ASC`,
            [targetId, challengerPS]
        );

        if (targetItems.length === 0) {
            // Chips-only fight (target has no combat items)
            return { challengerItem: null, targetItem: null };
        }

        // Find closest Power Score match within ±30%
        const targetItem = targetItems[0]; // Already sorted by closest match
        const targetPS = targetItem.power_score || 0;

        // If power score gap > 5x, downgrade to chips-only
        if (challengerPS > 0 && targetPS > 0) {
            const ratio = Math.max(challengerPS, targetPS) / Math.max(1, Math.min(challengerPS, targetPS));
            if (ratio > 5) {
                return { challengerItem: null, targetItem: null };
            }
        }

        return {
            challengerItem: {
                id: challengerItem.id,
                templateId: challengerItem.template_id,
                name: challengerItem.name,
                rarity: challengerItem.rarity,
                type: challengerItem.item_type,
                powerScore: challengerPS
            },
            targetItem: {
                id: targetItem.id,
                templateId: targetItem.template_id,
                name: targetItem.name,
                rarity: targetItem.rarity,
                type: targetItem.item_type,
                powerScore: targetPS
            }
        };
    }

    /**
     * Get total equipped combat bonuses for a player
     */
    async _getEquippedCombatBonuses(userId) {
        const equipped = await database.query(
            `SELECT combat_atk, combat_def, combat_spd 
             FROM inventory 
             WHERE user_id = ? AND is_equipped = TRUE AND item_type IN ('weapon', 'armor', 'gear')`,
            [userId]
        );

        let atk = 0, def = 0, spd = 0;
        for (const item of equipped) {
            atk += item.combat_atk || 0;
            def += item.combat_def || 0;
            spd += item.combat_spd || 0;
        }
        return { atk, def, spd };
    }

    /**
     * Get crew backup bonus (+2 per online crew member, max +10)
     */
    async _getCrewBackupBonus(userId) {
        try {
            // Get player's crew
            const crewMember = await database.queryOne(
                'SELECT crew_id FROM crew_members WHERE player_id = ?',
                [userId]
            );
            if (!crewMember) return 0;

            // Count online crew members (we check if they have an authenticated socket)
            const crewMembers = await database.query(
                'SELECT player_id FROM crew_members WHERE crew_id = ? AND player_id != ?',
                [crewMember.crew_id, userId]
            );

            let onlineCount = 0;
            if (this.gameManager && this.gameManager.players) {
                for (const member of crewMembers) {
                    if (this.gameManager.players.has(member.player_id)) {
                        onlineCount++;
                    }
                }
            }

            return Math.min(10, onlineCount * 2);
        } catch (e) {
            return 0;
        }
    }

    /**
     * Get player's heat value
     */
    async _getHeat(userId) {
        const row = await database.queryOne('SELECT heat FROM users WHERE id = ?', [userId]);
        return row?.heat || 0;
    }

    // ============ RECENT OPPONENTS ============

    /**
     * Record that players were at the same table (called when game ends)
     */
    async recordRecentOpponents(tableId, playerIds) {
        if (!playerIds || playerIds.length < 2) return;

        for (let i = 0; i < playerIds.length; i++) {
            for (let j = i + 1; j < playerIds.length; j++) {
                try {
                    await database.query(
                        `INSERT INTO recent_opponents (user_id, opponent_id, table_id)
                         VALUES (?, ?, ?), (?, ?, ?)`,
                        [playerIds[i], playerIds[j], tableId, playerIds[j], playerIds[i], tableId]
                    );
                } catch (e) {
                    // Duplicate entry, ignore
                }
            }
        }
    }

    /**
     * Get recent opponents (last 24 hours)
     */
    async getRecentOpponents(userId) {
        const opponents = await database.query(
            `SELECT DISTINCT ro.opponent_id, u.username, u.heat, ro.played_at
             FROM recent_opponents ro
             JOIN users u ON u.id = ro.opponent_id
             WHERE ro.user_id = ? AND ro.played_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)
             ORDER BY ro.played_at DESC
             LIMIT 50`,
            [userId]
        );
        return opponents.map(o => ({
            userId: o.opponent_id,
            username: o.username,
            heat: o.heat || 0,
            heatTier: CombatManager.getHeatTier(o.heat),
            lastPlayedAt: o.played_at
        }));
    }

    /**
     * Prune recent opponents older than 24 hours (called by cron)
     */
    async pruneOldOpponents() {
        const result = await database.query(
            'DELETE FROM recent_opponents WHERE played_at < DATE_SUB(NOW(), INTERVAL 24 HOUR)'
        );
        if (result.affectedRows > 0) {
            gameLogger.gameEvent('COMBAT', '[PRUNE] Removed old recent_opponents', { count: result.affectedRows });
        }
        return result.affectedRows;
    }

    // ============ COMBAT STATS & HISTORY ============

    /**
     * Get a player's combat stats
     */
    async getCombatStats(userId) {
        const user = await database.queryOne(
            'SELECT heat, combat_wins, combat_losses, bruised_until, coward_until FROM users WHERE id = ?',
            [userId]
        );
        if (!user) return null;

        return {
            heat: user.heat || 0,
            heatTier: CombatManager.getHeatTier(user.heat),
            combatWins: user.combat_wins || 0,
            combatLosses: user.combat_losses || 0,
            winRate: user.combat_wins > 0 
                ? Math.round((user.combat_wins / (user.combat_wins + user.combat_losses)) * 100) 
                : 0,
            isBruised: user.bruised_until && new Date(user.bruised_until) > new Date(),
            bruisedUntil: user.bruised_until,
            isCoward: user.coward_until && new Date(user.coward_until) > new Date(),
            cowardUntil: user.coward_until
        };
    }

    /**
     * Get combat history
     */
    async getCombatHistory(userId, limit = 20) {
        const history = await database.query(
            `SELECT cl.*, 
                    cu.username as challenger_name,
                    tu.username as target_name,
                    wu.username as winner_name
             FROM combat_log cl
             LEFT JOIN users cu ON cl.challenger_id = cu.id
             LEFT JOIN users tu ON cl.target_id = tu.id
             LEFT JOIN users wu ON cl.winner_id = wu.id
             WHERE cl.challenger_id = ? OR cl.target_id = ?
             ORDER BY cl.created_at DESC
             LIMIT ?`,
            [userId, userId, limit]
        );
        return history;
    }

    // ============ HELPERS ============

    /**
     * Emit an event to a specific player via their socket
     */
    _emitToPlayer(userId, event, data) {
        if (this.io) {
            // The gameManager tracks player socket associations
            const playerInfo = this.gameManager?.players?.get(userId);
            if (playerInfo?.socketId) {
                this.io.to(playerInfo.socketId).emit(event, data);
            }
        }
    }
}

module.exports = CombatManager;
