/**
 * User Model - Player account data
 */

const { v4: uuidv4 } = require('uuid');

class User {
    constructor(data = {}) {
        this.id = data.id || uuidv4();
        this.username = data.username || '';
        this.email = data.email || '';
        this.passwordHash = data.passwordHash || '';
        this.createdAt = data.createdAt || Date.now();
        
        // Currency & Stats
        this.chips = data.chips || 10000;           // Multiplayer chips
        this.adventureCoins = data.adventureCoins || 0;  // Adventure mode currency
        this.xp = data.xp || 0;                     // Experience points
        
        // Social
        this.friends = data.friends || [];           // Array of user IDs
        this.friendRequests = data.friendRequests || [];  // Pending requests
        this.blockedUsers = data.blockedUsers || [];
        
        // Adventure Progress
        this.adventureProgress = data.adventureProgress || {
            currentArea: 'area_tutorial',    // Current map area
            bossesDefeated: [],              // Array of boss IDs
            bossDefeatCounts: {},            // boss_id -> defeat count (for rare drops)
            totalWins: 0,
            totalLosses: 0
        };
        
        // Inventory
        this.inventory = data.inventory || [];  // Array of Item objects
        
        // Stats
        this.stats = data.stats || {
            handsPlayed: 0,
            handsWon: 0,
            biggestPot: 0,
            royalFlushes: 0,
            tournamentsWon: 0
        };
        
        // Status
        this.isOnline = false;
        this.currentTableId = null;
        this.lastSeen = Date.now();
    }
    
    // Get public profile (safe to send to other users)
    getPublicProfile() {
        return {
            id: this.id,
            username: this.username,
            chips: this.chips,
            isOnline: this.isOnline,
            stats: this.stats,
            adventureProgress: {
                currentLevel: this.adventureProgress.currentLevel,
                highestLevel: this.adventureProgress.highestLevel
            }
        };
    }
    
    // Get own profile (full data for the user themselves)
    getOwnProfile() {
        return {
            ...this.getPublicProfile(),
            email: this.email,
            adventureCoins: this.adventureCoins,
            friends: this.friends,
            friendRequests: this.friendRequests,
            inventory: this.inventory,
            adventureProgress: this.adventureProgress
        };
    }
    
    addFriend(userId) {
        if (!this.friends.includes(userId)) {
            this.friends.push(userId);
        }
    }
    
    removeFriend(userId) {
        this.friends = this.friends.filter(id => id !== userId);
    }
    
    addItem(item) {
        this.inventory.push(item);
    }
    
    removeItem(itemId) {
        const index = this.inventory.findIndex(i => i.id === itemId);
        if (index !== -1) {
            return this.inventory.splice(index, 1)[0];
        }
        return null;
    }
    
    hasItem(itemId) {
        return this.inventory.some(i => i.id === itemId);
    }
}

module.exports = User;

