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
        const startingChips = parseInt(process.env.DEFAULT_STARTING_CHIPS) || 10000;
        
        await db.query(
            `INSERT INTO users (id, username, email, password_hash, chips) 
             VALUES (?, ?, ?, ?, ?)`,
            [userId, username, email, passwordHash, startingChips]
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
        
        console.log(`[UserRepo] New user registered: ${username} (${userId})`);
        
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
        const user = await db.queryOne(
            'SELECT * FROM users WHERE username = ?',
            [username]
        );
        
        if (!user) {
            return { success: false, error: 'Invalid username or password' };
        }
        
        if (user.is_banned) {
            return { success: false, error: 'Account is banned' };
        }
        
        const passwordMatch = await bcrypt.compare(password, user.password_hash);
        if (!passwordMatch) {
            return { success: false, error: 'Invalid username or password' };
        }
        
        // Update last login
        await db.query(
            'UPDATE users SET last_login = NOW() WHERE id = ?',
            [user.id]
        );
        
        // Get full profile
        const profile = await this.getFullProfile(user.id);
        
        console.log(`[UserRepo] User logged in: ${username}`);
        
        return { 
            success: true, 
            userId: user.id,
            profile 
        };
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
     * Get full user profile with stats and progress
     */
    async getFullProfile(userId) {
        const user = await db.queryOne(
            'SELECT id, username, email, chips, adventure_coins, created_at, last_login FROM users WHERE id = ?',
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
        
        return {
            id: user.id,
            username: user.username,
            email: user.email,
            chips: user.chips,
            adventureCoins: user.adventure_coins,
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
            'SELECT id, username, chips, created_at FROM users WHERE id = ?',
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
        
        return {
            id: user.id,
            username: user.username,
            chips: user.chips,
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
        if (progress.levelComplete) {
            await db.query(
                `UPDATE adventure_progress 
                 SET current_level = GREATEST(current_level, ?),
                     highest_level = GREATEST(highest_level, ?),
                     total_wins = total_wins + 1
                 WHERE user_id = ?`,
                [progress.level + 1, progress.level, userId]
            );
            
            // Record boss defeat
            if (progress.bossId) {
                await db.query(
                    `INSERT IGNORE INTO bosses_defeated (user_id, boss_id) VALUES (?, ?)`,
                    [userId, progress.bossId]
                );
            }
        } else if (progress.lost) {
            await db.query(
                'UPDATE adventure_progress SET total_losses = total_losses + 1 WHERE user_id = ?',
                [userId]
            );
        }
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
}

module.exports = new UserRepository();

