/**
 * SocketHandler - Manages WebSocket connections and events
 * This is the communication layer between Unity clients and the game server
 */

const userRepo = require('../database/UserRepository');
const db = require('../database/Database');

class SocketHandler {
    constructor(io, gameManager) {
        this.io = io;
        this.gameManager = gameManager;
        
        // Track authenticated users: userId -> { userId, socketId, profile }
        this.authenticatedUsers = new Map();
        this.socketToUser = new Map();  // socketId -> userId
    }

    initialize() {
        this.io.on('connection', (socket) => {
            console.log(`[Socket] Client connected: ${socket.id}`);

            // ============ Authentication ============
            
            socket.on('register', async (data, callback) => {
                if (!db.isConnected) {
                    return callback({ success: false, error: 'Database offline' });
                }
                
                const { username, password, email } = data;
                const result = await userRepo.register(username, password, email);
                
                if (result.success) {
                    // Auto-login after registration
                    const loginResult = await userRepo.login(username, password);
                    if (loginResult.success) {
                        this.authenticateSocket(socket, loginResult.userId, loginResult.profile);
                    }
                    callback({ 
                        success: true, 
                        userId: result.userId,
                        profile: loginResult.profile 
                    });
                } else {
                    callback(result);
                }
            });

            socket.on('login', async (data, callback) => {
                if (!db.isConnected) {
                    return callback({ success: false, error: 'Database offline' });
                }
                
                const { username, password } = data;
                const result = await userRepo.login(username, password);
                
                if (result.success) {
                    this.authenticateSocket(socket, result.userId, result.profile);
                    callback({
                        success: true,
                        userId: result.userId,
                        profile: result.profile
                    });
                } else {
                    callback(result);
                }
            });

            socket.on('logout', (callback) => {
                this.deauthenticateSocket(socket);
                callback?.({ success: true });
            });

            socket.on('get_profile', async (callback) => {
                const user = this.getAuthenticatedUser(socket);
                if (!user) {
                    return callback({ success: false, error: 'Not authenticated' });
                }
                
                const profile = await userRepo.getFullProfile(user.userId);
                callback({ success: true, profile });
            });

            // ============ Lobby ============
            
            socket.on('get_tables', (callback) => {
                const tables = this.gameManager.getPublicTableList();
                callback({ success: true, tables });
            });

            socket.on('create_table', (data, callback) => {
                const user = this.getAuthenticatedUser(socket);
                if (!user) {
                    return callback({ success: false, error: 'Not authenticated' });
                }

                const table = this.gameManager.createTable({
                    ...data,
                    creatorId: user.userId
                });
                callback({ success: true, tableId: table.id });
                
                // Broadcast new table to lobby
                this.io.emit('table_created', table.getPublicInfo());
            });

            // ============ Table Actions ============
            
            socket.on('join_table', async (data, callback) => {
                const user = this.getAuthenticatedUser(socket);
                if (!user) {
                    return callback({ success: false, error: 'Not authenticated' });
                }

                const { tableId, seatIndex, password, asSpectator } = data;
                const table = this.gameManager.getTable(tableId);
                
                if (!table) {
                    return callback({ success: false, error: 'Table not found' });
                }
                
                // Check password
                if (table.hasPassword && !table.checkPassword(password)) {
                    return callback({ success: false, error: 'Incorrect password' });
                }
                
                // Get user's current chips from DB
                const dbUser = await userRepo.getById(user.userId);
                if (!dbUser) {
                    return callback({ success: false, error: 'User not found' });
                }
                
                let result;
                if (asSpectator || table.gameStarted) {
                    // Join as spectator
                    result = table.addSpectator(user.userId, user.profile.username, socket.id);
                    if (result.success) {
                        socket.join(`table:${tableId}`);
                        const state = table.getState(user.userId);
                        callback({ success: true, isSpectating: true, state });
                        
                        socket.to(`table:${tableId}`).emit('spectator_joined', {
                            userId: user.userId,
                            name: user.profile.username
                        });
                    } else {
                        callback(result);
                    }
                } else {
                    // Join as player
                    result = this.gameManager.joinTable(user.userId, tableId, seatIndex);
                    
                    if (result.success) {
                        // Update player chips in game manager from DB
                        this.gameManager.players.get(user.userId).chips = dbUser.chips;
                        
                        socket.join(`table:${tableId}`);
                        
                        socket.to(`table:${tableId}`).emit('player_joined', {
                            userId: user.userId,
                            name: user.profile.username,
                            seatIndex: result.seatIndex
                        });

                        const state = this.gameManager.getTableState(tableId, user.userId);
                        callback({ success: true, seatIndex: result.seatIndex, isSpectating: false, state });
                    } else {
                        callback(result);
                    }
                }
            });

            socket.on('leave_table', async (callback) => {
                const user = this.getAuthenticatedUser(socket);
                if (!user) {
                    return callback?.({ success: false, error: 'Not authenticated' });
                }

                const player = this.gameManager.players.get(user.userId);
                const tableId = player?.currentTableId;
                
                // Check if spectating
                const table = tableId ? this.gameManager.getTable(tableId) : null;
                if (table?.isSpectator(user.userId)) {
                    table.removeSpectator(user.userId);
                    socket.leave(`table:${tableId}`);
                    socket.to(`table:${tableId}`).emit('spectator_left', { userId: user.userId });
                    return callback?.({ success: true });
                }
                
                const result = this.gameManager.leaveTable(user.userId);
                
                if (result.success && tableId) {
                    // Save chips back to database
                    if (player) {
                        await userRepo.setChips(user.userId, player.chips);
                    }
                    
                    socket.leave(`table:${tableId}`);
                    socket.to(`table:${tableId}`).emit('player_left', {
                        userId: user.userId
                    });
                }

                callback?.(result);
            });

            // ============ Game Actions ============
            
            socket.on('action', async (data, callback) => {
                const user = this.getAuthenticatedUser(socket);
                if (!user) {
                    return callback({ success: false, error: 'Not authenticated' });
                }

                const { action, amount } = data;
                const result = this.gameManager.handlePlayerAction(user.userId, action, amount);
                
                if (result.success) {
                    const player = this.gameManager.players.get(user.userId);
                    const tableId = player?.currentTableId;
                    
                    // Broadcast action to all players at the table
                    this.io.to(`table:${tableId}`).emit('player_action', {
                        userId: user.userId,
                        action: result.action,
                        amount: result.amount
                    });

                    // Send updated state to all players
                    this.broadcastTableState(tableId);
                    
                    // Update stats
                    await userRepo.updateStats(user.userId, { handsPlayed: 1 });
                }

                callback(result);
            });

            // ============ Friends & Social ============
            
            socket.on('get_friends', async (callback) => {
                const user = this.getAuthenticatedUser(socket);
                if (!user) {
                    return callback({ success: false, error: 'Not authenticated' });
                }
                
                const friendIds = await userRepo.getFriendIds(user.userId);
                const friends = [];
                
                for (const friendId of friendIds) {
                    const profile = await userRepo.getPublicProfile(friendId);
                    if (profile) {
                        profile.isOnline = this.authenticatedUsers.has(friendId);
                        friends.push(profile);
                    }
                }
                
                callback({ success: true, friends });
            });

            socket.on('send_friend_request', async (data, callback) => {
                const user = this.getAuthenticatedUser(socket);
                if (!user) {
                    return callback({ success: false, error: 'Not authenticated' });
                }
                
                const result = await userRepo.sendFriendRequest(user.userId, data.toUserId);
                
                if (result.success) {
                    // Notify the recipient if online
                    const recipientAuth = this.authenticatedUsers.get(data.toUserId);
                    if (recipientAuth) {
                        this.io.to(recipientAuth.socketId).emit('friend_request_received', {
                            fromUserId: user.userId,
                            fromUsername: user.profile.username
                        });
                    }
                }
                
                callback(result);
            });

            socket.on('accept_friend_request', async (data, callback) => {
                const user = this.getAuthenticatedUser(socket);
                if (!user) {
                    return callback({ success: false, error: 'Not authenticated' });
                }
                
                const result = await userRepo.acceptFriendRequest(user.userId, data.fromUserId);
                
                if (result.success) {
                    // Notify the sender if online
                    const senderAuth = this.authenticatedUsers.get(data.fromUserId);
                    if (senderAuth) {
                        this.io.to(senderAuth.socketId).emit('friend_request_accepted', {
                            userId: user.userId,
                            username: user.profile.username
                        });
                    }
                }
                
                callback(result);
            });

            socket.on('decline_friend_request', async (data, callback) => {
                const user = this.getAuthenticatedUser(socket);
                if (!user) {
                    return callback({ success: false, error: 'Not authenticated' });
                }
                
                const result = await userRepo.declineFriendRequest(user.userId, data.fromUserId);
                callback(result);
            });

            socket.on('remove_friend', async (data, callback) => {
                const user = this.getAuthenticatedUser(socket);
                if (!user) {
                    return callback({ success: false, error: 'Not authenticated' });
                }
                
                const result = await userRepo.removeFriend(user.userId, data.friendId);
                callback(result);
            });

            socket.on('search_users', async (data, callback) => {
                const user = this.getAuthenticatedUser(socket);
                if (!user) {
                    return callback({ success: false, error: 'Not authenticated' });
                }
                
                const results = await userRepo.searchUsers(data.query, user.userId);
                callback({ success: true, users: results });
            });

            socket.on('invite_to_table', async (data, callback) => {
                const user = this.getAuthenticatedUser(socket);
                if (!user) {
                    return callback({ success: false, error: 'Not authenticated' });
                }
                
                const { toUserId, tableId } = data;
                const table = this.gameManager.getTable(tableId);
                
                if (!table) {
                    return callback({ success: false, error: 'Table not found' });
                }
                
                // Check if friends
                const friendIds = await userRepo.getFriendIds(user.userId);
                if (!friendIds.includes(toUserId)) {
                    return callback({ success: false, error: 'Not friends' });
                }
                
                // Mark as invited
                table.invitePlayer(toUserId);
                
                // Notify if online
                const recipientAuth = this.authenticatedUsers.get(toUserId);
                if (recipientAuth) {
                    this.io.to(recipientAuth.socketId).emit('table_invite_received', {
                        fromUserId: user.userId,
                        fromUsername: user.profile.username,
                        tableId: table.id,
                        tableName: table.name
                    });
                }
                
                callback({ success: true });
            });

            // ============ Chat ============
            
            socket.on('chat', (data) => {
                const user = this.getAuthenticatedUser(socket);
                if (!user) return;
                
                const player = this.gameManager.players.get(user.userId);
                if (!player?.currentTableId) return;

                this.io.to(`table:${player.currentTableId}`).emit('chat', {
                    playerId: user.userId,
                    name: user.profile.username,
                    message: data.message?.substring(0, 200)
                });
            });

            // ============ Disconnect ============
            
            socket.on('disconnect', async () => {
                console.log(`[Socket] Client disconnected: ${socket.id}`);
                const user = this.getAuthenticatedUser(socket);
                
                if (user) {
                    const player = this.gameManager.players.get(user.userId);
                    
                    if (player?.currentTableId) {
                        // Save chips before removing
                        await userRepo.setChips(user.userId, player.chips);
                        
                        socket.to(`table:${player.currentTableId}`).emit('player_disconnected', {
                            playerId: user.userId
                        });
                    }
                    
                    this.gameManager.removePlayer(user.userId, socket.id);
                    this.deauthenticateSocket(socket);
                    
                    // Notify friends that user went offline
                    this.notifyFriendsStatus(user.userId, false);
                }
            });
        });

        console.log('[SocketHandler] Initialized');
    }

    // ============ Authentication Helpers ============
    
    authenticateSocket(socket, userId, profile) {
        this.authenticatedUsers.set(userId, {
            userId: userId,
            socketId: socket.id,
            profile
        });
        this.socketToUser.set(socket.id, userId);
        
        // Register in game manager
        this.gameManager.registerPlayer(socket.id, profile.username, userId);
        
        // Notify friends that user came online
        this.notifyFriendsStatus(userId, true);
        
        console.log(`[Socket] User authenticated: ${profile.username}`);
    }
    
    deauthenticateSocket(socket) {
        const userId = this.socketToUser.get(socket.id);
        if (userId) {
            this.authenticatedUsers.delete(userId);
            this.socketToUser.delete(socket.id);
        }
    }
    
    getAuthenticatedUser(socket) {
        const userId = this.socketToUser.get(socket.id);
        return userId ? this.authenticatedUsers.get(userId) : null;
    }
    
    async notifyFriendsStatus(userId, isOnline) {
        const friendIds = await userRepo.getFriendIds(userId);
        const event = isOnline ? 'friend_online' : 'friend_offline';
        
        for (const friendId of friendIds) {
            const friendAuth = this.authenticatedUsers.get(friendId);
            if (friendAuth) {
                this.io.to(friendAuth.socketId).emit(event, { userId: userId });
            }
        }
    }

    // ============ Broadcasting ============
    
    broadcastTableState(tableId) {
        const table = this.gameManager.getTable(tableId);
        if (!table) return;

        const sockets = this.io.sockets.adapter.rooms.get(`table:${tableId}`);
        if (!sockets) return;

        for (const socketId of sockets) {
            const userId = this.socketToUser.get(socketId);
            const state = table.getState(userId);
            this.io.to(socketId).emit('table_state', state);
        }
    }
}

module.exports = SocketHandler;
