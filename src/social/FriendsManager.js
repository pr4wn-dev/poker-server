/**
 * FriendsManager - Handles friend lists, requests, and invites
 */

class FriendsManager {
    constructor(userStore) {
        this.userStore = userStore;  // Reference to user data store
        this.pendingInvites = new Map();  // oderId -> [{ fromUserId, tableId, sentAt }]
    }
    
    /**
     * Send friend request
     */
    sendFriendRequest(fromUserId, toUserId) {
        const fromUser = this.userStore.get(fromUserId);
        const toUser = this.userStore.get(toUserId);
        
        if (!fromUser || !toUser) {
            return { success: false, error: 'User not found' };
        }
        
        if (fromUser.friends.includes(toUserId)) {
            return { success: false, error: 'Already friends' };
        }
        
        if (toUser.blockedUsers.includes(fromUserId)) {
            return { success: false, error: 'User has blocked you' };
        }
        
        if (toUser.friendRequests.some(r => r.fromUserId === fromUserId)) {
            return { success: false, error: 'Request already sent' };
        }
        
        toUser.friendRequests.push({
            fromUserId,
            fromUsername: fromUser.username,
            sentAt: Date.now()
        });
        
        return { success: true };
    }
    
    /**
     * Accept friend request
     */
    acceptFriendRequest(userId, fromUserId) {
        const user = this.userStore.get(userId);
        const fromUser = this.userStore.get(fromUserId);
        
        if (!user || !fromUser) {
            return { success: false, error: 'User not found' };
        }
        
        const requestIndex = user.friendRequests.findIndex(r => r.fromUserId === fromUserId);
        if (requestIndex === -1) {
            return { success: false, error: 'No request from this user' };
        }
        
        // Remove request
        user.friendRequests.splice(requestIndex, 1);
        
        // Add each other as friends
        user.addFriend(fromUserId);
        fromUser.addFriend(userId);
        
        return { success: true };
    }
    
    /**
     * Decline friend request
     */
    declineFriendRequest(userId, fromUserId) {
        const user = this.userStore.get(userId);
        if (!user) {
            return { success: false, error: 'User not found' };
        }
        
        const requestIndex = user.friendRequests.findIndex(r => r.fromUserId === fromUserId);
        if (requestIndex === -1) {
            return { success: false, error: 'No request from this user' };
        }
        
        user.friendRequests.splice(requestIndex, 1);
        return { success: true };
    }
    
    /**
     * Remove friend
     */
    removeFriend(userId, friendId) {
        const user = this.userStore.get(userId);
        const friend = this.userStore.get(friendId);
        
        if (!user || !friend) {
            return { success: false, error: 'User not found' };
        }
        
        user.removeFriend(friendId);
        friend.removeFriend(userId);
        
        return { success: true };
    }
    
    /**
     * Block user
     */
    blockUser(userId, targetId) {
        const user = this.userStore.get(userId);
        if (!user) {
            return { success: false, error: 'User not found' };
        }
        
        // Remove from friends if they are
        this.removeFriend(userId, targetId);
        
        if (!user.blockedUsers.includes(targetId)) {
            user.blockedUsers.push(targetId);
        }
        
        return { success: true };
    }
    
    /**
     * Unblock user
     */
    unblockUser(userId, targetId) {
        const user = this.userStore.get(userId);
        if (!user) {
            return { success: false, error: 'User not found' };
        }
        
        user.blockedUsers = user.blockedUsers.filter(id => id !== targetId);
        return { success: true };
    }
    
    /**
     * Get friends list with online status
     */
    getFriendsList(userId) {
        const user = this.userStore.get(userId);
        if (!user) return [];
        
        return user.friends.map(friendId => {
            const friend = this.userStore.get(friendId);
            if (!friend) return null;
            return friend.getPublicProfile();
        }).filter(f => f !== null);
    }
    
    /**
     * Send table invite to friend
     */
    sendTableInvite(fromUserId, toUserId, tableId, tableName) {
        const fromUser = this.userStore.get(fromUserId);
        const toUser = this.userStore.get(toUserId);
        
        if (!fromUser || !toUser) {
            return { success: false, error: 'User not found' };
        }
        
        if (!fromUser.friends.includes(toUserId)) {
            return { success: false, error: 'Not friends' };
        }
        
        if (!toUser.isOnline) {
            return { success: false, error: 'User is offline' };
        }
        
        // Store invite
        if (!this.pendingInvites.has(toUserId)) {
            this.pendingInvites.set(toUserId, []);
        }
        
        const invites = this.pendingInvites.get(toUserId);
        
        // Remove old invite from same user/table
        const existingIndex = invites.findIndex(
            i => i.fromUserId === fromUserId && i.tableId === tableId
        );
        if (existingIndex !== -1) {
            invites.splice(existingIndex, 1);
        }
        
        invites.push({
            fromUserId,
            fromUsername: fromUser.username,
            tableId,
            tableName,
            sentAt: Date.now()
        });
        
        return { success: true };
    }
    
    /**
     * Get pending table invites
     */
    getTableInvites(userId) {
        return this.pendingInvites.get(userId) || [];
    }
    
    /**
     * Clear table invite
     */
    clearTableInvite(userId, tableId) {
        const invites = this.pendingInvites.get(userId);
        if (invites) {
            const index = invites.findIndex(i => i.tableId === tableId);
            if (index !== -1) {
                invites.splice(index, 1);
            }
        }
    }
    
    /**
     * Search for users (for adding friends)
     */
    searchUsers(query, excludeUserId = null) {
        const results = [];
        const lowerQuery = query.toLowerCase();
        
        for (const [id, user] of this.userStore.entries()) {
            if (id === excludeUserId) continue;
            if (user.username.toLowerCase().includes(lowerQuery)) {
                results.push(user.getPublicProfile());
            }
            if (results.length >= 20) break;  // Limit results
        }
        
        return results;
    }
}

module.exports = FriendsManager;

