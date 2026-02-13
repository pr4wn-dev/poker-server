/**
 * UserRepository - Database operations for users
 */

const db = require('./Database');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');

const SALT_ROUNDS = 10;

class UserRepository {
    
    /**
     * Register a new user
     */
    async register(username, password, email = null) {
        // Validate input
        if (!username || username.length < 3 || username.length > 20) {
            return { success: false, error: 'Username must be 3-20 characters' };
        }
        
        if (!password || password.length < 6) {
            return { success: false, error: 'Password must be at least 6 characters' };
        }
        
        // Check if username exists
        const existing = await db.queryOne(
            'SELECT id FROM users WHERE username = ?',
            [username]
        );
        
        if (existing) {
            return { success: false, error: 'Username already taken' };
        }
        
        // Check email if provided
        if (email) {
            const emailExists = await db.queryOne(
                'SELECT id FROM users WHERE email = ?',
                [email]
            );
            if (emailExists) {
                return { success: false, error: 'Email already registered' };
            }
        }
        
        // Hash password and create user
        const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
        const userId = uuidv4();
        const startingChips = 20000000; // 20 million chips for all new users
        const gameLogger = require('../utils/GameLogger');
        gameLogger.gameEvent('USER_REPO', '[REGISTER] Creating user', { username, startingChips });
        
        // Convert empty email to null to avoid duplicate key issues
        const emailValue = email && email.trim() !== '' ? email : null;
        
        await db.query(
            `INSERT INTO users (id, username, email, password_hash, chips) 
             VALUES (?, ?, ?, ?, ?)`,
            [userId, username, emailValue, passwordHash, startingChips]
        );
        
        // Create associated records
        await db.query(
            'INSERT INTO user_stats (user_id) VALUES (?)',
            [userId]
        );
        
        await db.query(
            'INSERT INTO adventure_progress (user_id) VALUES (?)',
            [userId]
        );
        
        gameLogger.gameEvent('USER_REPO', '[REGISTER] New user registered', { username, userId });
        
        return { 
            success: true, 
            userId,
            message: 'Registration successful'
        };
    }
    
    /**
     * Login user
     */
    async login(username, password) {
        try {
            const gameLogger = require('../utils/GameLogger');
            gameLogger.gameEvent('USER_REPO', '[LOGIN] Login attempt', { username });
            
            const user = await db.queryOne(
                'SELECT * FROM users WHERE username = ?',
                [username]
            );
            
            if (!user) {
                gameLogger.gameEvent('USER_REPO', '[LOGIN] Failed - user not found', { username });
                return { success: false, error: 'Invalid username or password' };
            }
            
            if (user.is_banned) {
                gameLogger.gameEvent('USER_REPO', '[LOGIN] Failed - account banned', { username });
                return { success: false, error: 'Account is banned' };
            }
            
            gameLogger.gameEvent('USER_REPO', '[LOGIN] Comparing password', { username });
            const passwordMatch = await bcrypt.compare(password, user.password_hash);
            
            if (!passwordMatch) {
                gameLogger.gameEvent('USER_REPO', '[LOGIN] Failed - invalid password', { username });
                return { success: false, error: 'Invalid username or password' };
            }
            
            // Update last login
            gameLogger.gameEvent('USER_REPO', '[LOGIN] Updating last login', { username });
            await db.query(
                'UPDATE users SET last_login = NOW() WHERE id = ?',
                [user.id]
            );
            
            // Get full profile
            gameLogger.gameEvent('USER_REPO', '[LOGIN] Getting profile', { username });
            const profile = await this.getFullProfile(user.id);
            
            gameLogger.gameEvent('USER_REPO', '[LOGIN] Success', { username, userId: user.id });
            
            return { 
                success: true, 
                userId: user.id,
                profile 
            };
        } catch (error) {
            const gameLogger = require('../utils/GameLogger');
            gameLogger.error('USER_REPO', '[LOGIN] Error', { username, error: error.message, stack: error.stack });
            return { success: false, error: 'Login failed: ' + error.message };
        }
    }
    
    /**
     * Get user by ID
     */
    async getById(userId) {
        return await db.queryOne(
            'SELECT id, username, chips, adventure_coins, created_at, last_login FROM users WHERE id = ?',
            [userId]
        );
    }
    
    /**
     * Get user by ID with daily reward and achievement data
     */
    async findByUserId(userId) {
        const user = await db.queryOne(
            'SELECT id, username, chips, adventure_coins, daily_streak, last_daily_reward, created_at, last_login FROM users WHERE id = ?',
            [userId]
        );
        if (!user) return null;
        
        // Map to camelCase for callers
        user.lastDailyReward = user.last_daily_reward;
        user.dailyStreak = user.daily_streak || 0;
        
        // Get unlocked achievement IDs
        try {
            const achievements = await db.query(
                'SELECT achievement_id FROM user_achievements WHERE user_id = ?',
                [userId]
            );
            user.achievements = achievements.map(a => a.achievement_id);
        } catch (e) {
            // Table may not exist yet
            user.achievements = [];
        }
        
        return user;
    }
    
    /**
     * Get full user profile with stats and progress
     */
    async getFullProfile(userId) {
        const user = await db.queryOne(
            'SELECT id, username, email, chips, adventure_coins, karma, created_at, last_login FROM users WHERE id = ?',
            [userId]
        );
        
        if (!user) return null;
        
        const stats = await db.queryOne(
            'SELECT * FROM user_stats WHERE user_id = ?',
            [userId]
        );
        
        const adventureProgress = await db.queryOne(
            'SELECT * FROM adventure_progress WHERE user_id = ?',
            [userId]
        );
        
        const bossesDefeated = await db.query(
            'SELECT boss_id FROM bosses_defeated WHERE user_id = ?',
            [userId]
        );
        
        const inventory = await this.getInventory(userId);
        const friends = await this.getFriendIds(userId);
        const friendRequests = await this.getFriendRequests(userId);
        
        const karma = user.karma ?? 100;
        
        return {
            id: user.id,
            username: user.username,
            email: user.email,
            chips: user.chips,
            adventureCoins: user.adventure_coins,
            karma: karma,
            heartColor: UserRepository.getHeartColor(karma),
            heartTier: UserRepository.getHeartTier(karma),
            createdAt: user.created_at,
            lastLogin: user.last_login,
            stats: stats ? {
                handsPlayed: stats.hands_played,
                handsWon: stats.hands_won,
                biggestPot: stats.biggest_pot,
                royalFlushes: stats.royal_flushes,
                tournamentsWon: stats.tournaments_won
            } : {},
            adventureProgress: adventureProgress ? {
                currentLevel: adventureProgress.current_level,
                highestLevel: adventureProgress.highest_level,
                bossesDefeated: bossesDefeated.map(b => b.boss_id),
                totalWins: adventureProgress.total_wins,
                totalLosses: adventureProgress.total_losses
            } : {},
            inventory,
            friends,
            friendRequests
        };
    }
    
    /**
     * Get public profile (for other users to see)
     */
    async getPublicProfile(userId) {
        const user = await db.queryOne(
            'SELECT id, username, chips, karma, created_at FROM users WHERE id = ?',
            [userId]
        );
        
        if (!user) return null;
        
        const stats = await db.queryOne(
            'SELECT hands_played, hands_won, biggest_pot FROM user_stats WHERE user_id = ?',
            [userId]
        );
        
        const progress = await db.queryOne(
            'SELECT highest_level FROM adventure_progress WHERE user_id = ?',
            [userId]
        );
        
        const karma = user.karma ?? 100;
        
        return {
            id: user.id,
            username: user.username,
            chips: user.chips,
            karma: karma,
            heartColor: UserRepository.getHeartColor(karma),
            heartTier: UserRepository.getHeartTier(karma),
            stats: stats || {},
            highestLevel: progress?.highest_level || 1
        };
    }
    
    /**
     * Update user chips
     */
    async updateChips(userId, amount) {
        await db.query(
            'UPDATE users SET chips = chips + ? WHERE id = ?',
            [amount, userId]
        );
    }
    
    /**
     * Set user chips to specific amount
     */
    async setChips(userId, chips) {
        await db.query(
            'UPDATE users SET chips = ? WHERE id = ?',
            [chips, userId]
        );
    }
    
    /**
     * Update adventure coins
     */
    async updateAdventureCoins(userId, amount) {
        await db.query(
            'UPDATE users SET adventure_coins = adventure_coins + ? WHERE id = ?',
            [amount, userId]
        );
    }
    
    // ============ Karma / Heart System ============
    // Karma scale: 100 = Pure White (never committed crime), 0 = Pitch Black (hardened criminal)
    // Players at 100 karma cannot be targeted for robbery at all
    // Players below 100 are visible to criminals; lower karma = easier to find
    
    /**
     * Get a player's current karma value
     */
    async getKarma(userId) {
        const row = await db.queryOne('SELECT karma FROM users WHERE id = ?', [userId]);
        return row?.karma ?? 100;
    }
    
    /**
     * Modify karma by a delta amount with logging
     * @param {string} userId 
     * @param {number} delta - Negative = lose karma (commit crime), Positive = gain karma (decay back)
     * @param {string} reason - Short reason code (e.g., 'robbery_attempt', 'robbery_success', 'daily_decay')
     * @param {string} [details] - Optional longer description
     * @returns {Object} { karmaBefore, karmaAfter, heartColor }
     */
    async modifyKarma(userId, delta, reason, details = null) {
        const gameLogger = require('../utils/GameLogger');
        
        const current = await this.getKarma(userId);
        const newKarma = Math.max(0, Math.min(100, current + delta));
        
        if (newKarma !== current) {
            await db.query('UPDATE users SET karma = ? WHERE id = ?', [newKarma, userId]);
            
            await db.query(`
                INSERT INTO karma_history (user_id, karma_before, karma_after, change_amount, reason, details)
                VALUES (?, ?, ?, ?, ?, ?)
            `, [userId, current, newKarma, delta, reason, details]);
            
            gameLogger.gameEvent('KARMA', `[KARMA_CHANGE] ${reason}`, {
                userId, before: current, after: newKarma, delta, reason
            });
        }
        
        return {
            karmaBefore: current,
            karmaAfter: newKarma,
            heartColor: UserRepository.getHeartColor(newKarma)
        };
    }
    
    /**
     * Get heart color name from karma value
     * @param {number} karma - 0-100
     * @returns {string} Color name for the heart
     */
    static getHeartColor(karma) {
        if (karma >= 95) return 'white';       // Pure — never committed crime (or nearly)
        if (karma >= 80) return 'light_gray';  // Dabbled — a petty crime or two
        if (karma >= 60) return 'gray';        // Criminal — regular offender
        if (karma >= 40) return 'dark_gray';   // Hardened — serious criminal
        if (karma >= 20) return 'charcoal';    // Menace — feared by many
        return 'black';                         // Pitch black — the worst of the worst
    }
    
    /**
     * Get heart tier info (name + description) for display
     */
    static getHeartTier(karma) {
        if (karma >= 95) return { color: 'white', name: 'Pure Heart', desc: 'Clean conscience. Protected from crime.' };
        if (karma >= 80) return { color: 'light_gray', name: 'Fading Innocence', desc: 'You\'ve dipped your toes in the dark side.' };
        if (karma >= 60) return { color: 'gray', name: 'Gray Heart', desc: 'A known criminal. Others can sense it.' };
        if (karma >= 40) return { color: 'dark_gray', name: 'Dark Heart', desc: 'Hardened criminal. Easy to find.' };
        if (karma >= 20) return { color: 'charcoal', name: 'Shadow Heart', desc: 'A menace. Everyone knows your name.' };
        return { color: 'black', name: 'Black Heart', desc: 'Pure evil. A target for everyone.' };
    }
    
    /**
     * Get robbery visibility multiplier based on victim karma
     * Lower karma = higher multiplier = easier to find/target
     * @param {number} karma - Victim's karma (0-100)
     * @returns {number} 0.0 (invisible at 100 karma) to 2.0 (fully exposed at 0 karma)
     */
    static getRobberyVisibility(karma) {
        if (karma >= 95) return 0.0;  // Pure hearts are INVISIBLE to criminals
        // Linear scale: 94 karma = 0.06, 50 karma = 1.0, 0 karma = 2.0
        return Math.min(2.0, (100 - karma) / 50);
    }
    
    /**
     * Get karma history for a player
     */
    async getKarmaHistory(userId, limit = 20) {
        return await db.query(
            'SELECT * FROM karma_history WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
            [userId, limit]
        );
    }
    
    /**
     * Apply daily karma decay (slowly regenerates toward neutral)
     * Called by server cron - moves karma 1 point toward 100 each day
     */
    async applyKarmaDecay(userId) {
        const current = await this.getKarma(userId);
        if (current >= 100) return; // Already pure
        
        // Decay rate: +1 karma per day (slow redemption)
        await this.modifyKarma(userId, 1, 'daily_decay', 'Natural karma recovery (+1/day)');
    }
    
    /**
     * Bulk apply daily karma decay for all players with karma < 100
     */
    async applyBulkKarmaDecay() {
        const gameLogger = require('../utils/GameLogger');
        const users = await db.query('SELECT id FROM users WHERE karma < 100');
        let count = 0;
        for (const user of users) {
            await this.modifyKarma(user.id, 1, 'daily_decay', 'Natural karma recovery (+1/day)');
            count++;
        }
        if (count > 0) {
            gameLogger.gameEvent('KARMA', '[BULK_DECAY] Applied', { usersAffected: count });
        }
        return count;
    }

    // ============ XP System ============
    
    /**
     * Add XP to user
     */
    async addXP(userId, amount) {
        await db.query(
            'UPDATE users SET xp = xp + ? WHERE id = ?',
            [amount, userId]
        );
        
        // Return new XP total
        const user = await db.queryOne('SELECT xp FROM users WHERE id = ?', [userId]);
        return user?.xp || 0;
    }
    
    /**
     * Get user's XP and calculated level
     */
    async getXPInfo(userId) {
        const user = await db.queryOne('SELECT xp FROM users WHERE id = ?', [userId]);
        if (!user) return null;
        
        const WorldMap = require('../adventure/WorldMap');
        const xp = user.xp || 0;
        const level = WorldMap.getLevelFromXP(xp);
        const xpForNextLevel = WorldMap.getXPForNextLevel(level);
        const xpProgress = WorldMap.getXPProgress(xp);
        
        return {
            xp,
            level,
            xpForNextLevel,
            xpProgress
        };
    }
    
    // ============ Boss Defeat Tracking ============
    
    /**
     * Record a boss defeat and return the new count
     */
    async recordBossDefeat(userId, bossId) {
        // Upsert boss defeat count
        await db.query(
            `INSERT INTO boss_defeat_counts (user_id, boss_id, defeat_count, last_defeated)
             VALUES (?, ?, 1, NOW())
             ON DUPLICATE KEY UPDATE 
             defeat_count = defeat_count + 1,
             last_defeated = NOW()`,
            [userId, bossId]
        );
        
        // Also record first-time defeat
        await db.query(
            'INSERT IGNORE INTO bosses_defeated (user_id, boss_id) VALUES (?, ?)',
            [userId, bossId]
        );
        
        // Return updated count
        const result = await db.queryOne(
            'SELECT defeat_count FROM boss_defeat_counts WHERE user_id = ? AND boss_id = ?',
            [userId, bossId]
        );
        
        return result?.defeat_count || 1;
    }
    
    /**
     * Get boss defeat count for a user
     */
    async getBossDefeatCount(userId, bossId) {
        const result = await db.queryOne(
            'SELECT defeat_count FROM boss_defeat_counts WHERE user_id = ? AND boss_id = ?',
            [userId, bossId]
        );
        return result?.defeat_count || 0;
    }
    
    /**
     * Get all boss defeat counts for a user
     */
    async getAllBossDefeatCounts(userId) {
        const results = await db.query(
            'SELECT boss_id, defeat_count FROM boss_defeat_counts WHERE user_id = ?',
            [userId]
        );
        
        const counts = {};
        for (const row of results) {
            counts[row.boss_id] = row.defeat_count;
        }
        return counts;
    }
    
    /**
     * Check if this is first-time boss defeat
     */
    async isFirstDefeat(userId, bossId) {
        const existing = await db.queryOne(
            'SELECT 1 FROM bosses_defeated WHERE user_id = ? AND boss_id = ?',
            [userId, bossId]
        );
        return !existing;
    }
    
    /**
     * Update user stats
     */
    async updateStats(userId, stats) {
        const updates = [];
        const params = [];
        
        if (stats.handsPlayed !== undefined) {
            updates.push('hands_played = hands_played + ?');
            params.push(stats.handsPlayed);
        }
        if (stats.handsWon !== undefined) {
            updates.push('hands_won = hands_won + ?');
            params.push(stats.handsWon);
        }
        if (stats.biggestPot !== undefined) {
            updates.push('biggest_pot = GREATEST(biggest_pot, ?)');
            params.push(stats.biggestPot);
        }
        
        if (updates.length > 0) {
            params.push(userId);
            await db.query(
                `UPDATE user_stats SET ${updates.join(', ')} WHERE user_id = ?`,
                params
            );
        }
    }
    
    /**
     * Update adventure progress
     */
    async updateAdventureProgress(userId, progress) {
        if (progress.won) {
            await db.query(
                `UPDATE adventure_progress SET total_wins = total_wins + 1 WHERE user_id = ?`,
                [userId]
            );
        } else if (progress.lost) {
            await db.query(
                'UPDATE adventure_progress SET total_losses = total_losses + 1 WHERE user_id = ?',
                [userId]
            );
        }
    }
    
    /**
     * Get list of defeated boss IDs
     */
    async getBossesDefeated(userId) {
        const results = await db.query(
            'SELECT boss_id FROM bosses_defeated WHERE user_id = ?',
            [userId]
        );
        return results.map(r => r.boss_id);
    }
    
    // ============ Inventory ============
    
    async getInventory(userId) {
        const items = await db.query(
            'SELECT * FROM inventory WHERE user_id = ? ORDER BY obtained_at DESC',
            [userId]
        );
        
        return items.map(item => ({
            id: item.id,
            templateId: item.template_id,
            name: item.name,
            description: item.description,
            type: item.item_type,
            rarity: item.rarity,
            icon: item.icon,
            uses: item.uses_remaining,
            maxUses: item.max_uses,
            baseValue: item.base_value,
            obtainedAt: item.obtained_at,
            obtainedFrom: item.obtained_from,
            isTradeable: item.is_tradeable,
            isGambleable: item.is_gambleable,
            isEquipped: item.is_equipped
        }));
    }
    
    async addItem(userId, item) {
        await db.query(
            `INSERT INTO inventory 
             (id, user_id, template_id, name, description, item_type, rarity, icon, 
              uses_remaining, max_uses, base_value, obtained_from, is_tradeable, is_gambleable)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                item.id, userId, item.templateId, item.name, item.description,
                item.type, item.rarity, item.icon, item.uses, item.maxUses,
                item.baseValue, item.obtainedFrom, item.isTradeable, item.isGambleable
            ]
        );
    }
    
    async removeItem(userId, itemId) {
        await db.query(
            'DELETE FROM inventory WHERE id = ? AND user_id = ?',
            [itemId, userId]
        );
    }
    
    async equipItem(userId, itemId) {
        // Unequip all items of same type first
        const item = await db.queryOne(
            'SELECT item_type FROM inventory WHERE id = ? AND user_id = ?',
            [itemId, userId]
        );
        
        if (item) {
            await db.query(
                'UPDATE inventory SET is_equipped = FALSE WHERE user_id = ? AND item_type = ?',
                [userId, item.item_type]
            );
            
            await db.query(
                'UPDATE inventory SET is_equipped = TRUE WHERE id = ?',
                [itemId]
            );
        }
    }
    
    // ============ Friends ============
    
    async getFriendIds(userId) {
        const friends = await db.query(
            'SELECT friend_id FROM friends WHERE user_id = ?',
            [userId]
        );
        return friends.map(f => f.friend_id);
    }
    
    async getFriendRequests(userId) {
        const requests = await db.query(
            `SELECT fr.from_user_id, u.username, fr.sent_at 
             FROM friend_requests fr 
             JOIN users u ON u.id = fr.from_user_id 
             WHERE fr.to_user_id = ?`,
            [userId]
        );
        return requests.map(r => ({
            fromUserId: r.from_user_id,
            fromUsername: r.username,
            sentAt: r.sent_at
        }));
    }
    
    async sendFriendRequest(fromUserId, toUserId) {
        // Check if already friends
        const existing = await db.queryOne(
            'SELECT id FROM friends WHERE user_id = ? AND friend_id = ?',
            [fromUserId, toUserId]
        );
        
        if (existing) {
            return { success: false, error: 'Already friends' };
        }
        
        // Check if blocked
        const blocked = await db.queryOne(
            'SELECT id FROM blocked_users WHERE user_id = ? AND blocked_id = ?',
            [toUserId, fromUserId]
        );
        
        if (blocked) {
            return { success: false, error: 'Cannot send request' };
        }
        
        try {
            await db.query(
                'INSERT INTO friend_requests (from_user_id, to_user_id) VALUES (?, ?)',
                [fromUserId, toUserId]
            );
            return { success: true };
        } catch (e) {
            if (e.code === 'ER_DUP_ENTRY') {
                return { success: false, error: 'Request already sent' };
            }
            throw e;
        }
    }
    
    async getPendingFriendRequests(userId) {
        const requests = await db.query(
            `SELECT fr.from_user_id, fr.sent_at, u.username 
             FROM friend_requests fr
             JOIN users u ON fr.from_user_id = u.id
             WHERE fr.to_user_id = ?
             ORDER BY fr.sent_at DESC`,
            [userId]
        );
        
        return requests.map(r => ({
            fromUserId: r.from_user_id,
            fromUsername: r.username,
            sentAt: r.sent_at
        }));
    }
    
    async acceptFriendRequest(userId, fromUserId) {
        // Remove the request
        const result = await db.query(
            'DELETE FROM friend_requests WHERE from_user_id = ? AND to_user_id = ?',
            [fromUserId, userId]
        );
        
        if (result.affectedRows === 0) {
            return { success: false, error: 'No request found' };
        }
        
        // Add both directions of friendship
        await db.query(
            'INSERT IGNORE INTO friends (user_id, friend_id) VALUES (?, ?), (?, ?)',
            [userId, fromUserId, fromUserId, userId]
        );
        
        return { success: true };
    }
    
    async declineFriendRequest(userId, fromUserId) {
        await db.query(
            'DELETE FROM friend_requests WHERE from_user_id = ? AND to_user_id = ?',
            [fromUserId, userId]
        );
        return { success: true };
    }
    
    async removeFriend(userId, friendId) {
        await db.query(
            'DELETE FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)',
            [userId, friendId, friendId, userId]
        );
        return { success: true };
    }
    
    async blockUser(userId, targetId) {
        await this.removeFriend(userId, targetId);
        await db.query(
            'INSERT IGNORE INTO blocked_users (user_id, blocked_id) VALUES (?, ?)',
            [userId, targetId]
        );
        return { success: true };
    }
    
    async unblockUser(userId, targetId) {
        await db.query(
            'DELETE FROM blocked_users WHERE user_id = ? AND blocked_id = ?',
            [userId, targetId]
        );
        return { success: true };
    }
    
    async searchUsers(query, excludeUserId = null) {
        const results = await db.query(
            `SELECT id, username, chips FROM users 
             WHERE username LIKE ? AND id != ? AND is_banned = FALSE 
             LIMIT 20`,
            [`%${query}%`, excludeUserId || '']
        );
        
        return results.map(u => ({
            id: u.id,
            username: u.username,
            chips: u.chips
        }));
    }
    
    // ============ Leaderboards ============
    
    async getTopByChips(limit = 20) {
        const results = await db.query(
            `SELECT id, username, chips as value, 
                    COALESCE((SELECT level FROM user_stats WHERE user_id = users.id), 1) as level
             FROM users 
             WHERE is_banned = FALSE 
             ORDER BY chips DESC 
             LIMIT ?`,
            [limit]
        );
        return results;
    }
    
    async getTopByWins(limit = 20) {
        const results = await db.query(
            `SELECT u.id, u.username, us.hands_won as value, us.level
             FROM users u
             JOIN user_stats us ON u.id = us.user_id
             WHERE u.is_banned = FALSE
             ORDER BY us.hands_won DESC
             LIMIT ?`,
            [limit]
        );
        return results;
    }
    
    async getTopByLevel(limit = 20) {
        const results = await db.query(
            `SELECT u.id, u.username, us.level as value, us.level
             FROM users u
             JOIN user_stats us ON u.id = us.user_id
             WHERE u.is_banned = FALSE
             ORDER BY us.level DESC, us.xp DESC
             LIMIT ?`,
            [limit]
        );
        return results;
    }
    
    async getTopByBiggestPot(limit = 20) {
        const results = await db.query(
            `SELECT u.id, u.username, us.biggest_pot as value, us.level
             FROM users u
             JOIN user_stats us ON u.id = us.user_id
             WHERE u.is_banned = FALSE
             ORDER BY us.biggest_pot DESC
             LIMIT ?`,
            [limit]
        );
        return results;
    }
    
    // ============ Daily Rewards ============
    
    async addGems(userId, amount) {
        await db.query(
            'UPDATE users SET gems = gems + ? WHERE id = ?',
            [amount, userId]
        );
    }
    
    async addXP(userId, amount) {
        // Add XP and check for level up
        const stats = await db.queryOne(
            'SELECT xp, level FROM user_stats WHERE user_id = ?',
            [userId]
        );
        
        if (!stats) {
            await db.query(
                'INSERT INTO user_stats (user_id, xp, level) VALUES (?, ?, 1)',
                [userId, amount]
            );
            return { newXP: amount, level: 1, leveledUp: false };
        }
        
        const newXP = stats.xp + amount;
        const xpPerLevel = 1000;  // XP needed per level
        const newLevel = Math.floor(newXP / xpPerLevel) + 1;
        const leveledUp = newLevel > stats.level;
        
        await db.query(
            'UPDATE user_stats SET xp = ?, level = ? WHERE user_id = ?',
            [newXP, newLevel, userId]
        );
        
        return { newXP, level: newLevel, leveledUp };
    }
    
    async updateDailyStreak(userId, streak, claimTime) {
        await db.query(
            'UPDATE users SET daily_streak = ?, last_daily_reward = ? WHERE id = ?',
            [streak, claimTime, userId]
        );
    }
    
    // ============ Achievements ============
    
    async unlockAchievement(userId, achievementId) {
        // Check if already unlocked
        const existing = await db.queryOne(
            'SELECT 1 FROM user_achievements WHERE user_id = ? AND achievement_id = ?',
            [userId, achievementId]
        );
        
        if (existing) {
            return { alreadyUnlocked: true };
        }
        
        // Get achievement XP reward
        const xpRewards = {
            'first_win': 100,
            'play_10': 50,
            'win_50': 250,
            'royal_flush': 1000,
            'chips_10k': 100,
            'chips_100k': 500,
            'chips_1m': 2000,
            'first_boss': 200,
            'tournament_win': 1000
        };
        
        const xpReward = xpRewards[achievementId] || 50;
        
        await db.query(
            'INSERT INTO user_achievements (user_id, achievement_id, unlocked_at) VALUES (?, ?, NOW())',
            [userId, achievementId]
        );
        
        return { alreadyUnlocked: false, xpReward };
    }
    
    async getUnlockedAchievements(userId) {
        const results = await db.query(
            'SELECT achievement_id, unlocked_at FROM user_achievements WHERE user_id = ?',
            [userId]
        );
        return results.map(r => r.achievement_id);
    }

    /**
     * Reset all progress for a user (chips, xp, stats, inventory, adventure, achievements, etc.)
     * Keeps: account credentials, friends, blocked users
     */
    async resetProgress(userId) {
        const gameLogger = require('../utils/GameLogger');
        gameLogger.gameEvent('USER', '[RESET_PROGRESS] STARTING', { userId });

        // Reset user core fields (including karma back to pure white)
        await db.query(
            "UPDATE users SET chips = 20000000, adventure_coins = 0, xp = 0, karma = 100, active_character = 'shadow_hacker' WHERE id = ?",
            [userId]
        );
        
        // Clear karma history
        await db.query('DELETE FROM karma_history WHERE user_id = ?', [userId]);

        // Reset user_stats
        await db.query(
            `UPDATE user_stats SET hands_played = 0, hands_won = 0, biggest_pot = 0, 
             royal_flushes = 0, tournaments_won = 0, total_winnings = 0, total_losses = 0 
             WHERE user_id = ?`,
            [userId]
        );

        // Reset player_stats (detailed stats)
        await db.query('DELETE FROM player_stats WHERE player_id = ?', [userId]);

        // Reset hand type stats
        await db.query('DELETE FROM player_hand_type_stats WHERE player_id = ?', [userId]);

        // Reset pocket stats
        await db.query('DELETE FROM player_pocket_stats WHERE player_id = ?', [userId]);

        // Reset player sessions
        await db.query('DELETE FROM player_sessions WHERE player_id = ?', [userId]);

        // Reset fire events
        await db.query('DELETE FROM fire_events WHERE player_id = ?', [userId]);

        // Reset player titles
        await db.query('DELETE FROM player_titles WHERE player_id = ?', [userId]);

        // Reset achievements
        await db.query('DELETE FROM achievements WHERE player_id = ?', [userId]);
        try {
            await db.query('DELETE FROM user_achievements WHERE user_id = ?', [userId]);
        } catch (e) { /* table may not exist */ }

        // Clear inventory
        await db.query('DELETE FROM inventory WHERE user_id = ?', [userId]);

        // Reset adventure progress
        await db.query(
            "UPDATE adventure_progress SET current_area = 'area_tutorial', total_wins = 0, total_losses = 0 WHERE user_id = ?",
            [userId]
        );

        // Reset boss defeat counts
        await db.query('DELETE FROM boss_defeat_counts WHERE user_id = ?', [userId]);

        // Reset bosses defeated
        await db.query('DELETE FROM bosses_defeated WHERE user_id = ?', [userId]);

        // Reset daily rewards
        await db.query('DELETE FROM daily_rewards WHERE player_id = ?', [userId]);

        // Reset spectator bets
        await db.query('DELETE FROM spectator_bets WHERE spectator_id = ?', [userId]);

        // Reset saved hands
        await db.query('DELETE FROM saved_hands WHERE player_id = ?', [userId]);

        // Remove from any crew
        try {
            // If user is a crew leader, delete the whole crew
            const leaderCrews = await db.query(
                'SELECT id FROM crews WHERE created_by = ?', [userId]
            );
            for (const crew of leaderCrews) {
                await db.query('DELETE FROM crew_stats WHERE crew_id = ?', [crew.id]);
                await db.query('DELETE FROM crew_members WHERE crew_id = ?', [crew.id]);
                await db.query('DELETE FROM crews WHERE id = ?', [crew.id]);
            }
            // Remove membership from other crews
            await db.query('DELETE FROM crew_members WHERE player_id = ?', [userId]);
        } catch (e) { /* crew tables may not exist */ }

        // Clear hand history (player's entries only)
        await db.query('DELETE FROM hand_history WHERE player_id = ?', [userId]);

        // Clear robbery log
        try {
            await db.query('DELETE FROM robbery_log WHERE robber_id = ? OR victim_id = ?', [userId, userId]);
        } catch (e) { /* table may not exist */ }

        gameLogger.gameEvent('USER', '[RESET_PROGRESS] COMPLETE', { userId });

        return { success: true };
    }
}

module.exports = new UserRepository();

