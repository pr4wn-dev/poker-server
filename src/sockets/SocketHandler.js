/**
 * SocketHandler - Manages WebSocket connections and events
 * This is the communication layer between Unity clients and the game server
 */

const userRepo = require('../database/UserRepository');
const db = require('../database/Database');
const AdventureManager = require('../adventure/AdventureManager');
const TournamentManager = require('../game/TournamentManager');

class SocketHandler {
    constructor(io, gameManager) {
        this.io = io;
        this.gameManager = gameManager;
        this.adventureManager = new AdventureManager(userRepo);
        this.tournamentManager = new TournamentManager(userRepo);
        
        // Track authenticated users: userId -> { userId, socketId, profile }
        this.authenticatedUsers = new Map();
        this.socketToUser = new Map();  // socketId -> userId
    }

    initialize() {
        this.io.on('connection', (socket) => {
            console.log(`[Socket] Client connected: ${socket.id}`);

            // ============ Authentication ============
            
            socket.on('register', async (data, callback) => {
                console.log('[Register] Received:', data);
                if (!db.isConnected) {
                    const error = { success: false, error: 'Database offline' };
                    if (callback) callback(error);
                    socket.emit('register_response', error);
                    return;
                }
                
                const { username, password, email } = data;
                const result = await userRepo.register(username, password, email);
                console.log('[Register] DB result:', result);
                
                let response;
                if (result.success) {
                    // Auto-login after registration
                    const loginResult = await userRepo.login(username, password);
                    console.log('[Register] Login result:', loginResult);
                    if (loginResult.success) {
                        this.authenticateSocket(socket, loginResult.userId, loginResult.profile);
                    }
                    response = { 
                        success: true, 
                        userId: result.userId,
                        profile: loginResult.profile 
                    };
                } else {
                    response = result;
                }
                
                console.log('[Register] Sending response:', JSON.stringify(response));
                if (callback) callback(response);
                socket.emit('register_response', response);
            });

            socket.on('login', async (data, callback) => {
                if (!db.isConnected) {
                    const error = { success: false, error: 'Database offline' };
                    if (callback) callback(error);
                    socket.emit('login_response', error);
                    return;
                }
                
                const { username, password } = data;
                const result = await userRepo.login(username, password);
                
                let response;
                if (result.success) {
                    this.authenticateSocket(socket, result.userId, result.profile);
                    response = {
                        success: true,
                        userId: result.userId,
                        profile: result.profile
                    };
                } else {
                    response = result;
                }
                if (callback) callback(response);
                socket.emit('login_response', response);
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
            
            socket.on('get_tables', (data, callback) => {
                const tables = this.gameManager.getPublicTableList();
                const response = { success: true, tables };
                if (callback) callback(response);
                socket.emit('get_tables_response', response);
            });

            socket.on('create_table', (data, callback) => {
                console.log('[SocketHandler] create_table received:', JSON.stringify(data));
                const user = this.getAuthenticatedUser(socket);
                if (!user) {
                    console.log('[SocketHandler] create_table FAILED - not authenticated');
                    const error = { success: false, error: 'Not authenticated' };
                    if (callback) callback(error);
                    socket.emit('create_table_response', error);
                    return;
                }

                console.log('[SocketHandler] create_table - user authenticated:', user.username);
                const table = this.gameManager.createTable({
                    ...data,
                    creatorId: user.userId
                });
                const response = { success: true, tableId: table.id, table: table.getPublicInfo() };
                console.log('[SocketHandler] create_table SUCCESS, emitting response:', JSON.stringify(response));
                if (callback) callback(response);
                socket.emit('create_table_response', response);
                
                // Broadcast new table to lobby
                this.io.emit('table_created', table.getPublicInfo());
            });

            // ============ Table Actions ============
            
            socket.on('join_table', async (data, callback) => {
                const user = this.getAuthenticatedUser(socket);
                if (!user) {
                    const error = { success: false, error: 'Not authenticated' };
                    if (callback) callback(error);
                    socket.emit('join_table_response', error);
                    return;
                }

                const { tableId, seatIndex, password, asSpectator } = data;
                const table = this.gameManager.getTable(tableId);
                
                if (!table) {
                    const error = { success: false, error: 'Table not found' };
                    if (callback) callback(error);
                    socket.emit('join_table_response', error);
                    return;
                }
                
                // Check password
                if (table.hasPassword && !table.checkPassword(password)) {
                    const error = { success: false, error: 'Incorrect password' };
                    if (callback) callback(error);
                    socket.emit('join_table_response', error);
                    return;
                }
                
                // Get user's current chips from DB
                const dbUser = await userRepo.getById(user.userId);
                if (!dbUser) {
                    const error = { success: false, error: 'User not found' };
                    if (callback) callback(error);
                    socket.emit('join_table_response', error);
                    return;
                }
                
                let result;
                if (asSpectator || table.gameStarted) {
                    // Join as spectator
                    result = table.addSpectator(user.userId, user.profile.username, socket.id);
                    if (result.success) {
                        socket.join(`table:${tableId}`);
                        const state = table.getState(user.userId);
                        const response = { success: true, isSpectating: true, state };
                        if (callback) callback(response);
                        socket.emit('join_table_response', response);
                        
                        socket.to(`table:${tableId}`).emit('spectator_joined', {
                            userId: user.userId,
                            name: user.profile.username
                        });
                    } else {
                        if (callback) callback(result);
                        socket.emit('join_table_response', result);
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
                        const response = { success: true, seatIndex: result.seatIndex, isSpectating: false, state };
                        if (callback) callback(response);
                        socket.emit('join_table_response', response);
                    } else {
                        if (callback) callback(result);
                        socket.emit('join_table_response', result);
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

            // ============ Side Pot (Item Gambling) ============

            socket.on('start_side_pot', async (data, callback) => {
                const user = this.getAuthenticatedUser(socket);
                if (!user) {
                    return callback({ success: false, error: 'Not authenticated' });
                }

                const player = this.gameManager.players.get(user.userId);
                if (!player?.currentTableId) {
                    return callback({ success: false, error: 'Not at a table' });
                }

                const table = this.gameManager.getTable(player.currentTableId);
                if (!table) {
                    return callback({ success: false, error: 'Table not found' });
                }

                // Get item from user's inventory
                const profile = await userRepo.getFullProfile(user.userId);
                const item = profile.inventory.find(i => i.id === data.itemId);
                
                if (!item) {
                    return callback({ success: false, error: 'Item not found in inventory' });
                }

                const result = table.startSidePot(user.userId, item);
                
                if (result.success) {
                    // Broadcast side pot started to all players
                    this.io.to(`table:${player.currentTableId}`).emit('side_pot_started', {
                        creatorId: user.userId,
                        creatorItem: result.sidePot.creatorItem,
                        collectionEndTime: result.sidePot.collectionEndTime
                    });
                }

                callback(result);
            });

            socket.on('submit_to_side_pot', async (data, callback) => {
                const user = this.getAuthenticatedUser(socket);
                if (!user) {
                    return callback({ success: false, error: 'Not authenticated' });
                }

                const player = this.gameManager.players.get(user.userId);
                if (!player?.currentTableId) {
                    return callback({ success: false, error: 'Not at a table' });
                }

                const table = this.gameManager.getTable(player.currentTableId);
                if (!table) {
                    return callback({ success: false, error: 'Table not found' });
                }

                // Get item from user's inventory
                const profile = await userRepo.getFullProfile(user.userId);
                const item = profile.inventory.find(i => i.id === data.itemId);
                
                if (!item) {
                    return callback({ success: false, error: 'Item not found in inventory' });
                }

                const result = table.submitToSidePot(user.userId, item);
                
                if (result.success) {
                    // Notify table creator of new submission
                    const creatorAuth = this.authenticatedUsers.get(table.creatorId);
                    if (creatorAuth) {
                        this.io.to(creatorAuth.socketId).emit('side_pot_submission', {
                            userId: user.userId,
                            username: user.profile.username,
                            item: {
                                id: item.id,
                                name: item.name,
                                rarity: item.rarity,
                                type: item.type,
                                icon: item.icon,
                                baseValue: item.baseValue
                            }
                        });
                    }
                }

                callback(result);
            });

            socket.on('opt_out_side_pot', (callback) => {
                const user = this.getAuthenticatedUser(socket);
                if (!user) {
                    return callback({ success: false, error: 'Not authenticated' });
                }

                const player = this.gameManager.players.get(user.userId);
                const table = player?.currentTableId 
                    ? this.gameManager.getTable(player.currentTableId) 
                    : null;

                if (!table) {
                    return callback({ success: false, error: 'Not at a table' });
                }

                const result = table.optOutOfSidePot(user.userId);
                callback(result);
            });

            socket.on('approve_side_pot_item', (data, callback) => {
                const user = this.getAuthenticatedUser(socket);
                if (!user) {
                    return callback({ success: false, error: 'Not authenticated' });
                }

                const player = this.gameManager.players.get(user.userId);
                const table = player?.currentTableId 
                    ? this.gameManager.getTable(player.currentTableId) 
                    : null;

                if (!table) {
                    return callback({ success: false, error: 'Not at a table' });
                }

                const result = table.approveSidePotItem(user.userId, data.userId);
                
                if (result.success) {
                    // Notify all players of approval
                    this.io.to(`table:${player.currentTableId}`).emit('side_pot_item_approved', {
                        userId: data.userId,
                        approvedCount: result.approvedItems
                    });
                    
                    // Notify the approved player
                    const approvedAuth = this.authenticatedUsers.get(data.userId);
                    if (approvedAuth) {
                        this.io.to(approvedAuth.socketId).emit('your_side_pot_approved');
                    }
                }

                callback(result);
            });

            socket.on('decline_side_pot_item', (data, callback) => {
                const user = this.getAuthenticatedUser(socket);
                if (!user) {
                    return callback({ success: false, error: 'Not authenticated' });
                }

                const player = this.gameManager.players.get(user.userId);
                const table = player?.currentTableId 
                    ? this.gameManager.getTable(player.currentTableId) 
                    : null;

                if (!table) {
                    return callback({ success: false, error: 'Not at a table' });
                }

                const result = table.declineSidePotItem(user.userId, data.userId);
                
                if (result.success) {
                    // Notify the declined player
                    const declinedAuth = this.authenticatedUsers.get(data.userId);
                    if (declinedAuth) {
                        this.io.to(declinedAuth.socketId).emit('your_side_pot_declined');
                    }
                }

                callback(result);
            });

            // ============ Adventure Mode ============
            
            socket.on('get_world_map', async (data, callback) => {
                const user = this.getAuthenticatedUser(socket);
                const response = !user 
                    ? { success: false, error: 'Not authenticated' }
                    : { success: true, mapState: await this.adventureManager.getMapState(user.userId) };
                
                if (callback) callback(response);
                socket.emit('get_world_map_response', response);
            });
            
            socket.on('get_area_bosses', async (data, callback) => {
                const user = this.getAuthenticatedUser(socket);
                const { areaId } = data || {};
                const response = !user 
                    ? { success: false, error: 'Not authenticated' }
                    : { success: true, areaId, bosses: await this.adventureManager.getBossesInArea(user.userId, areaId) };
                
                if (callback) callback(response);
                socket.emit('get_area_bosses_response', response);
            });
            
            socket.on('start_adventure', async (data, callback) => {
                const user = this.getAuthenticatedUser(socket);
                const { bossId } = data || {};
                const response = !user 
                    ? { success: false, error: 'Not authenticated' }
                    : await this.adventureManager.startSession(user.userId, bossId);
                
                if (callback) callback(response);
                socket.emit('start_adventure_response', response);
            });
            
            socket.on('get_active_session', async (callback) => {
                const user = this.getAuthenticatedUser(socket);
                if (!user) return callback({ success: false, error: 'Not authenticated' });
                
                const session = this.adventureManager.getActiveSession(user.userId);
                callback({ 
                    success: true, 
                    hasActiveSession: !!session,
                    session 
                });
            });
            
            socket.on('adventure_action', async (data, callback) => {
                const user = this.getAuthenticatedUser(socket);
                if (!user) return callback({ success: false, error: 'Not authenticated' });
                
                const session = this.adventureManager.getActiveSession(user.userId);
                if (!session) {
                    return callback({ success: false, error: 'No active adventure session' });
                }
                
                // Process hand result (this would come from game logic)
                const result = this.adventureManager.processHandResult(user.userId, data.handResult);
                
                if (result.status === 'victory') {
                    // Send victory result with rewards
                    const victoryResult = await this.adventureManager.handleVictory(user.userId);
                    socket.emit('adventure_result', victoryResult);
                    
                    // Check for rare drops
                    if (victoryResult.rewards?.items?.some(i => 
                        ['legendary', 'epic'].includes(i.rarity?.toLowerCase())
                    )) {
                        socket.emit('rare_drop_obtained', {
                            items: victoryResult.rewards.items.filter(i => 
                                ['legendary', 'epic'].includes(i.rarity?.toLowerCase())
                            )
                        });
                    }
                } else if (result.status === 'defeat') {
                    socket.emit('adventure_result', result);
                }
                
                callback({ success: true, result });
            });
            
            socket.on('forfeit_adventure', async (callback) => {
                const user = this.getAuthenticatedUser(socket);
                if (!user) return callback({ success: false, error: 'Not authenticated' });
                
                const result = await this.adventureManager.forfeit(user.userId);
                callback(result);
            });
            
            socket.on('use_xp_item', async (data, callback) => {
                const user = this.getAuthenticatedUser(socket);
                if (!user) return callback({ success: false, error: 'Not authenticated' });
                
                const { itemId } = data;
                const inventory = await userRepo.getInventory(user.userId);
                const item = inventory.find(i => i.id === itemId);
                
                if (!item) {
                    return callback({ success: false, error: 'Item not found' });
                }
                
                if (item.type !== 'xp_boost') {
                    return callback({ success: false, error: 'Item is not an XP boost' });
                }
                
                // Get XP amount from item template
                const Item = require('../models/Item');
                const template = Object.values(Item.TEMPLATES).find(t => t.templateId === item.templateId);
                const xpAmount = template?.xpAmount || 100;
                
                // Remove item from inventory
                await userRepo.removeItem(user.userId, itemId);
                
                // Add XP
                const newXP = await userRepo.addXP(user.userId, xpAmount);
                const xpInfo = await userRepo.getXPInfo(user.userId);
                
                socket.emit('xp_gained', {
                    amount: xpAmount,
                    totalXP: newXP,
                    level: xpInfo?.level || 1,
                    xpProgress: xpInfo?.xpProgress || 0
                });
                
                callback({ 
                    success: true, 
                    xpGained: xpAmount,
                    newXP,
                    level: xpInfo?.level || 1
                });
            });

            // ============ Tournaments ============
            
            socket.on('get_area_tournaments', async (data, callback) => {
                const user = this.getAuthenticatedUser(socket);
                if (!user) return callback({ success: false, error: 'Not authenticated' });
                
                const { areaId } = data;
                const tournaments = this.tournamentManager.getTournamentsByArea(areaId);
                
                // Get user info to check eligibility
                const profile = await userRepo.getProfile(user.userId);
                const xpInfo = await userRepo.getXPInfo(user.userId);
                const inventory = await userRepo.getInventory(user.userId);
                
                const userProfile = {
                    id: user.userId,
                    chips: profile?.chips || 0,
                    level: xpInfo?.level || 1
                };
                
                const tournamentsWithEligibility = tournaments.map(t => ({
                    ...t.getPublicInfo(),
                    canEnter: t.canEnter(userProfile, inventory)
                }));
                
                callback({ success: true, areaId, tournaments: tournamentsWithEligibility });
            });
            
            socket.on('get_all_tournaments', async (callback) => {
                const user = this.getAuthenticatedUser(socket);
                if (!user) return callback({ success: false, error: 'Not authenticated' });
                
                const tournaments = this.tournamentManager.getActiveTournaments();
                callback({ 
                    success: true, 
                    tournaments: tournaments.map(t => t.getPublicInfo())
                });
            });
            
            socket.on('register_tournament', async (data, callback) => {
                const user = this.getAuthenticatedUser(socket);
                if (!user) return callback({ success: false, error: 'Not authenticated' });
                
                const { tournamentId, sidePotItemId } = data;
                const result = await this.tournamentManager.registerPlayer(
                    user.userId, 
                    tournamentId, 
                    sidePotItemId
                );
                
                if (result.success) {
                    // Notify all users in tournament lobby
                    const tournament = this.tournamentManager.getTournament(tournamentId);
                    this.io.to(`tournament:${tournamentId}`).emit('tournament_player_joined', {
                        oderId: user.userId,
                        username: user.profile.username,
                        totalRegistered: result.totalRegistered
                    });
                    
                    // Join tournament room
                    socket.join(`tournament:${tournamentId}`);
                }
                
                callback(result);
            });
            
            socket.on('unregister_tournament', async (callback) => {
                const user = this.getAuthenticatedUser(socket);
                if (!user) return callback({ success: false, error: 'Not authenticated' });
                
                const tournament = this.tournamentManager.getPlayerTournament(user.userId);
                if (!tournament) {
                    return callback({ success: false, error: 'Not in a tournament' });
                }
                
                const result = await this.tournamentManager.unregisterPlayer(user.userId);
                
                if (result.success) {
                    socket.leave(`tournament:${tournament.id}`);
                    this.io.to(`tournament:${tournament.id}`).emit('tournament_player_left', {
                        oderId: user.userId
                    });
                }
                
                callback(result);
            });
            
            socket.on('get_tournament_state', async (data, callback) => {
                const user = this.getAuthenticatedUser(socket);
                if (!user) return callback({ success: false, error: 'Not authenticated' });
                
                const { tournamentId } = data;
                const tournament = this.tournamentManager.getTournament(tournamentId);
                
                if (!tournament) {
                    return callback({ success: false, error: 'Tournament not found' });
                }
                
                callback({ success: true, tournament: tournament.getState() });
            });
            
            socket.on('get_my_tournament', async (callback) => {
                const user = this.getAuthenticatedUser(socket);
                if (!user) return callback({ success: false, error: 'Not authenticated' });
                
                const tournament = this.tournamentManager.getPlayerTournament(user.userId);
                
                if (!tournament) {
                    return callback({ success: true, inTournament: false });
                }
                
                callback({ 
                    success: true, 
                    inTournament: true,
                    tournament: tournament.getState()
                });
            });
            
            socket.on('get_eligible_side_pot_items', async (data, callback) => {
                const user = this.getAuthenticatedUser(socket);
                if (!user) return callback({ success: false, error: 'Not authenticated' });
                
                const { tournamentId } = data;
                const tournament = this.tournamentManager.getTournament(tournamentId);
                
                if (!tournament) {
                    return callback({ success: false, error: 'Tournament not found' });
                }
                
                const inventory = await userRepo.getInventory(user.userId);
                const eligibleItems = tournament.getEligibleSidePotItems(inventory);
                
                callback({ success: true, items: eligibleItems });
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
