/**
 * InventoryRepository - Direct inventory queries for item ante and trading
 */
const db = require('../database/Database');

const inventoryRepo = {
    /**
     * Get a single inventory item by its ID
     */
    async getById(itemId) {
        return await db.queryOne(
            'SELECT * FROM inventory WHERE id = ?',
            [itemId]
        );
    },

    /**
     * Get all items for a user
     */
    async getByUserId(userId) {
        return await db.query(
            'SELECT * FROM inventory WHERE user_id = ? ORDER BY obtained_at DESC',
            [userId]
        );
    },

    /**
     * Get equipped items for a user
     */
    async getEquipped(userId) {
        return await db.query(
            'SELECT * FROM inventory WHERE user_id = ? AND is_equipped = TRUE',
            [userId]
        );
    },

    /**
     * Get gambleable items for a user (for item ante)
     */
    async getGambleable(userId) {
        return await db.query(
            'SELECT * FROM inventory WHERE user_id = ? AND is_gambleable = TRUE ORDER BY power_score DESC',
            [userId]
        );
    },

    /**
     * Transfer an item from one user to another
     */
    async transferItem(itemId, fromUserId, toUserId) {
        const item = await this.getById(itemId);
        if (!item || item.user_id !== fromUserId) {
            return { success: false, error: 'Item not found or not owned' };
        }
        if (!item.is_tradeable) {
            return { success: false, error: 'Item is not tradeable' };
        }
        
        await db.query(
            'UPDATE inventory SET user_id = ?, is_equipped = FALSE WHERE id = ?',
            [toUserId, itemId]
        );
        
        return { success: true };
    }
};

module.exports = inventoryRepo;
