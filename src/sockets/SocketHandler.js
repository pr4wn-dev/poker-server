/**
 * SocketHandler - Manages WebSocket connections and events
 * This is the communication layer between Unity clients and the game server
 */

const userRepo = require('../database/UserRepository');
const db = require('../database/Database');
const AdventureManager = require('../adventure/AdventureManager');
const TournamentManager = require('../game/TournamentManager');
const SimulationManager = require('../testing/SimulationManager');

class SocketHandler {
    constructor(io, gameManager) {
        this.io = io;
        this.gameManager = gameManager;
        this.adventureManager = new AdventureManager(userRepo);
        this.tournamentManager = new TournamentManager(userRepo);
        this.simulationManager = new SimulationManager(gameManager);
        
        // Track authenticated users: userId -> { userId, socketId, profile }
        this.authenticatedUsers = new Map();
        this.socketToUser = new Map();  // socketId -> userId
        this.reconnectTimeouts = new Map();  // userId -> timeout handle
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
                try {
                    console.log(`[Socket] Login attempt: ${data?.username || 'unknown'}`);
                    
                    if (!db.isConnected) {
                        const error = { success: false, error: 'Database offline' };
                        console.error('[Socket] Login failed: Database offline');
                        if (callback) callback(error);
                        socket.emit('login_response', error);
                        return;
                    }
                    
                    const { username, password } = data || {};
                    
                    if (!username || !password) {
                        const error = { success: false, error: 'Username and password required' };
                        console.error('[Socket] Login failed: Missing credentials');
                        if (callback) callback(error);
                        socket.emit('login_response', error);
                        return;
                    }
                    
                    const result = await userRepo.login(username, password);
                    console.log(`[Socket] Login result for ${username}: ${result.success ? 'SUCCESS' : result.error}`);
                    
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
                } catch (error) {
                    console.error('[Socket] Login error:', error.message);
                    console.error(error.stack);
                    const errorResponse = { success: false, error: 'Login failed: ' + error.message };
                    if (callback) callback(errorResponse);
                    socket.emit('login_response', errorResponse);
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
            
            socket.on('get_tables', (data, callback) => {
                const tables = this.gameManager.getPublicTableList();
                console.log(`[SocketHandler] get_tables - returning ${tables.length} tables`);
                const response = { success: true, tables };
                if (callback) callback(response);
                socket.emit('get_tables_response', response);
            });

            socket.on('create_table', async (data, callback) => {
                try {
                    console.log('[SocketHandler] create_table received:', JSON.stringify(data));
                    const user = this.getAuthenticatedUser(socket);
                    if (!user) {
                        console.log('[SocketHandler] create_table FAILED - not authenticated');
                        const error = { success: false, error: 'Not authenticated' };
                        if (callback) callback(error);
                        socket.emit('create_table_response', error);
                        return;
                    }

                    // Get user's chips from DB
                    const dbUser = await userRepo.getById(user.userId);
                    if (!dbUser) {
                        const error = { success: false, error: 'User not found' };
                        if (callback) callback(error);
                        socket.emit('create_table_response', error);
                        return;
                    }
                    
                    // Update player's chips in game manager
                    const player = this.gameManager.players.get(user.userId);
                    if (player) {
                        player.chips = dbUser.chips;
                    }

                    console.log('[SocketHandler] create_table - user authenticated:', user.username);
                    const table = this.gameManager.createTable({
                        ...data,
                        creatorId: user.userId
                    });
                    
                    // Set up table callbacks for state broadcasting
                    try {
                        this.setupTableCallbacks(table);
                    } catch (err) {
                        console.error('[SocketHandler] setupTableCallbacks ERROR:', err);
                    }
                    
                    // Auto-join the creator to seat 0
                    const joinResult = this.gameManager.joinTable(user.userId, table.id, 0);
                    if (joinResult.success) {
                        socket.join(`table:${table.id}`);
                    }
                    
                    let state, publicInfo;
                    try {
                        state = table.getState(user.userId);
                    } catch (err) {
                        console.error('[SocketHandler] getState ERROR:', err);
                        state = { id: table.id, name: table.name, phase: 'waiting' };
                    }
                    
                    try {
                        publicInfo = table.getPublicInfo();
                    } catch (err) {
                        console.error('[SocketHandler] getPublicInfo ERROR:', err);
                        publicInfo = { id: table.id, name: table.name, maxPlayers: table.maxPlayers };
                    }
                    
                    const response = { 
                        success: true, 
                        tableId: table.id, 
                        table: publicInfo,
                        seatIndex: joinResult.success ? joinResult.seatIndex : -1,
                        state 
                    };
                    console.log(`[SocketHandler] create_table SUCCESS - seatIndex: ${response.seatIndex}`);
                    
                    if (callback) {
                        try {
                            callback(response);
                        } catch (err) {
                            console.error('[SocketHandler] Callback error:', err);
                        }
                    }
                    try {
                        socket.emit('create_table_response', response);
                        console.log('[SocketHandler] Response emitted');
                    } catch (err) {
                        console.error('[SocketHandler] Emit error:', err);
                    }
                    
                    // Broadcast new table to lobby
                    setImmediate(() => {
                        try {
                            this.io.emit('table_created', publicInfo);
                        } catch (err) {
                            console.error('[SocketHandler] Broadcast error:', err);
                        }
                    });
                } catch (error) {
                    console.error('[SocketHandler] create_table FATAL ERROR:', error);
                    const errorResponse = { success: false, error: `Server error: ${error.message}` };
                    if (callback) {
                        try {
                            callback(errorResponse);
                        } catch (err) {
                            console.error('[SocketHandler] Error callback failed:', err);
                        }
                    }
                    try {
                        socket.emit('create_table_response', errorResponse);
                    } catch (err) {
                        console.error('[SocketHandler] Error emit failed:', err);
                    }
                }
            });

            // ============ Simulation Mode ============
            
            socket.on('start_simulation', async (data, callback) => {
                try {
                    console.log('[SocketHandler] ========== start_simulation EVENT RECEIVED ==========');
                    console.log('[SocketHandler] Data:', JSON.stringify(data));
                    const user = this.getAuthenticatedUser(socket);
                    if (!user) {
                        const error = { success: false, error: 'Not authenticated' };
                        if (callback) callback(error);
                        socket.emit('start_simulation_response', error);
                        return;
                    }
                    
                    const {
                        tableName = 'Simulation Game',
                        maxPlayers = 6,
                        smallBlind = 25,
                        bigBlind = 50,
                        buyIn = 20000000,
                        turnTimeLimit = 5000,
                        blindIncreaseInterval = 0,
                        socketBotRatio = 0.5
                    } = data;
                    
                    console.log('[SocketHandler] Calling simulationManager.startSimulation...');
                    const result = await this.simulationManager.startSimulation({
                        creatorId: user.userId,
                        tableName,
                        maxPlayers: Math.min(Math.max(maxPlayers, 3), 9),
                        smallBlind,
                        bigBlind,
                        buyIn,
                        turnTimeLimit,
                        blindIncreaseInterval,
                        socketBotRatio: Math.min(Math.max(socketBotRatio, 0), 1)
                    });
                    
                    console.log('[SocketHandler] start_simulation result:', JSON.stringify(result));
                    
                    if (result.success) {
                        // CRITICAL: Verify table exists before proceeding
                        const simTable = this.gameManager.getTable(result.tableId);
                        if (!simTable) {
                            console.error(`[SocketHandler] ERROR: Table ${result.tableId} not found in GameManager!`);
                            const errorResponse = { success: false, error: `Table ${result.tableId} was not created` };
                            if (callback) callback(errorResponse);
                            socket.emit('start_simulation_response', errorResponse);
                            return;
                        }
                        
                        console.log(`[SocketHandler] Table ${result.tableId} found: ${simTable.name}`);
                        
                        // CRITICAL: Set up table callbacks for state broadcasting
                        console.log(`[SocketHandler] Setting up callbacks for simulation table ${result.tableId}`);
                        try {
                            this.setupTableCallbacks(simTable);
                            console.log(`[SocketHandler] Callbacks set up successfully`);
                        } catch (err) {
                            console.error(`[SocketHandler] Error setting up callbacks:`, err);
                        }
                        
                        // Join creator as spectator
                        try {
                            simTable.addSpectator(user.userId, user.profile?.username || 'Creator', socket.id);
                            socket.join(`table:${result.tableId}`);
                            socket.join(`spectator:${result.tableId}`);
                            console.log(`[SocketHandler] Added ${user.userId} as spectator`);
                        } catch (err) {
                            console.error(`[SocketHandler] Error adding spectator:`, err);
                        }
                        
                        // Get table state
                        let state, publicInfo;
                        try {
                            state = simTable.getState(user.userId);
                            publicInfo = simTable.getPublicInfo();
                        } catch (err) {
                            console.error(`[SocketHandler] Error getting state:`, err);
                            state = { id: simTable.id, name: simTable.name, phase: 'waiting' };
                            publicInfo = { id: simTable.id, name: simTable.name, maxPlayers: simTable.maxPlayers };
                        }
                        
                        const response = {
                            success: true,
                            tableId: result.tableId,
                            table: publicInfo,
                            state
                        };
                        
                        console.log('[SocketHandler] Sending start_simulation response...');
                        if (callback) {
                            try {
                                callback(response);
                                console.log('[SocketHandler] Callback executed');
                            } catch (err) {
                                console.error('[SocketHandler] Callback error:', err);
                            }
                        }
                        try {
                            socket.emit('start_simulation_response', response);
                            console.log('[SocketHandler] Response emitted');
                        } catch (err) {
                            console.error('[SocketHandler] Emit error:', err);
                        }
                    } else {
                        console.error('[SocketHandler] start_simulation failed:', result.error);
                        if (callback) callback(result);
                        socket.emit('start_simulation_response', result);
                    }
                } catch (error) {
                    console.error('[SocketHandler] start_simulation FATAL ERROR:', error);
                    const errorResponse = { success: false, error: `Server error: ${error.message}` };
                    if (callback) {
                        try {
                            callback(errorResponse);
                        } catch (err) {
                            console.error('[SocketHandler] Error callback failed:', err);
                        }
                    }
                    try {
                        socket.emit('start_simulation_response', errorResponse);
                    } catch (err) {
                        console.error('[SocketHandler] Error emit failed:', err);
                    }
                }
            });
            
            socket.on('stop_simulation', (data, callback) => {
                console.log('[SocketHandler] stop_simulation received:', JSON.stringify(data));
                const user = this.getAuthenticatedUser(socket);
                if (!user) {
                    const error = { success: false, error: 'Not authenticated' };
                    if (callback) callback(error);
                    return;
                }
                
                const { tableId } = data;
                const result = this.simulationManager.stopSimulation(tableId);
                
                console.log('[SocketHandler] stop_simulation result:', result);
                if (callback) callback(result);
                
                if (result.success) {
                    this.io.emit('simulation_stopped', { tableId });
                }
            });
            
            socket.on('get_simulation_status', (data, callback) => {
                const { tableId } = data;
                const status = this.simulationManager.getSimulationStatus(tableId);
                if (callback) callback(status || { error: 'Simulation not found' });
            });
            
            socket.on('get_active_simulations', (data, callback) => {
                const simulations = this.simulationManager.getActiveSimulations();
                if (callback) callback({ simulations });
            });
            
            socket.on('set_simulation_speed', (data, callback) => {
                console.log('[SocketHandler] set_simulation_speed received:', JSON.stringify(data));
                const { fastMode } = data;
                this.simulationManager.setFastMode(fastMode === true);
                if (callback) callback({ 
                    success: true, 
                    fastMode: this.simulationManager.fastMode,
                    message: fastMode ? 'Fast mode enabled (10x speed)' : 'Normal speed enabled'
                });
            });
            
            socket.on('get_simulation_report', (data, callback) => {
                const { tableId } = data;
                const report = this.simulationManager.getSimulationReport(tableId);
                if (callback) callback(report);
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
                        
                        // Track spectator's table so they can leave properly
                        let player = this.gameManager.players.get(user.userId);
                        if (player) {
                            player.currentTableId = tableId;
                            player.isSpectating = true;
                        }
                        
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
                        
                        // Broadcast updated table state to all players so they see the new player
                        this.broadcastTableState(tableId);
                    } else {
                        if (callback) callback(result);
                        socket.emit('join_table_response', result);
                    }
                }
            });

            socket.on('leave_table', async (callback) => {
                const respond = (response) => {
                    if (callback) callback(response);
                    socket.emit('leave_table_response', response);
                };
                
                const user = this.getAuthenticatedUser(socket);
                if (!user) {
                    return respond({ success: false, error: 'Not authenticated' });
                }

                const player = this.gameManager.players.get(user.userId);
                const tableId = player?.currentTableId;
                
                // Check if spectating
                const table = tableId ? this.gameManager.getTable(tableId) : null;
                if (table?.isSpectator(user.userId)) {
                    table.removeSpectator(user.userId);
                    socket.leave(`table:${tableId}`);
                    socket.to(`table:${tableId}`).emit('spectator_left', { userId: user.userId });
                    
                    // Clear spectator's table tracking
                    if (player) {
                        player.currentTableId = null;
                        player.isSpectating = false;
                    }
                    
                    console.log(`[SocketHandler] Spectator ${user.profile?.username} left table ${tableId}`);
                    return respond({ success: true });
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

                respond(result);
            });

            // ============ Game Actions ============
            
            socket.on('action', async (data, callback) => {
                const respond = (response) => {
                    if (callback) callback(response);
                    socket.emit('action_response', response);
                };
                
                const user = this.getAuthenticatedUser(socket);
                if (!user) {
                    return respond({ success: false, error: 'Not authenticated' });
                }

                const { action, amount } = data;
                const result = this.gameManager.handlePlayerAction(user.userId, action, amount);
                
                if (result.success) {
                    // Note: player_action is now emitted by Table.onPlayerAction callback
                    // State broadcast and bot turn check happen via Table.onStateChange callback
                    
                    // Update stats
                    await userRepo.updateStats(user.userId, { handsPlayed: 1 });
                }

                respond(result);
            });

            // ============ Rebuy / Add Chips ============
            
            socket.on('rebuy', async (data, callback) => {
                const respond = (response) => {
                    if (callback) callback(response);
                    socket.emit('rebuy_response', response);
                };
                
                const user = this.getAuthenticatedUser(socket);
                if (!user) {
                    return respond({ success: false, error: 'Not authenticated' });
                }
                
                const { amount } = data;
                const player = this.gameManager.players.get(user.userId);
                
                if (!player?.currentTableId) {
                    return respond({ success: false, error: 'Not at a table' });
                }
                
                const table = this.gameManager.getTable(player.currentTableId);
                if (!table) {
                    return respond({ success: false, error: 'Table not found' });
                }
                
                // Check if game is in progress (can only rebuy between hands)
                if (table.phase !== 'waiting' && table.phase !== 'showdown') {
                    return respond({ success: false, error: 'Cannot rebuy during a hand' });
                }
                
                // Check house rules for rebuy
                if (table.houseRules && !table.houseRules.allowRebuy) {
                    return respond({ success: false, error: 'Rebuys not allowed at this table' });
                }
                
                // Check player has enough chips in their account
                const profile = await userRepo.findByUserId(user.userId);
                if (!profile || profile.chips < amount) {
                    return respond({ success: false, error: 'Insufficient chips' });
                }
                
                // Check min/max buy-in
                const minBuyIn = table.houseRules?.minBuyIn || table.bigBlind * 20;
                const maxBuyIn = table.houseRules?.maxBuyIn || table.bigBlind * 200;
                
                const seat = table.seats.find(s => s?.playerId === user.userId);
                if (!seat) {
                    return respond({ success: false, error: 'Seat not found' });
                }
                
                const newTotal = seat.chips + amount;
                if (newTotal > maxBuyIn) {
                    return respond({ success: false, error: `Maximum buy-in is ${maxBuyIn}` });
                }
                
                // Deduct from account and add to table stack
                await userRepo.updateChips(user.userId, -amount);
                seat.chips += amount;
                player.chips = seat.chips;
                
                console.log(`[SocketHandler] ${user.username} rebought ${amount} chips at table ${table.name}`);
                
                // Broadcast updated state
                this.broadcastTableState(player.currentTableId);
                
                respond({ 
                    success: true, 
                    newTableStack: seat.chips,
                    accountBalance: profile.chips - amount
                });
            });
            
            socket.on('add_chips', async (data, callback) => {
                // Alias for rebuy - same functionality
                socket.emit('rebuy', data, callback);
            });

            // ============ Ready-Up System ============
            
            // Start the game (table creator only) - initiates ready-up phase
            socket.on('start_game', (data, callback) => {
                const respond = (response) => {
                    console.log(`[SocketHandler] START_GAME RESPONSE | success=${response.success}, error=${response.error || 'none'}`);
                    if (callback) callback(response);
                    socket.emit('start_game_response', response);
                };
                
                const user = this.getAuthenticatedUser(socket);
                if (!user) {
                    console.log('[SocketHandler] START_GAME FAILED | Not authenticated');
                    return respond({ success: false, error: 'Not authenticated' });
                }
                
                const { tableId } = data;
                console.log(`[SocketHandler] START_GAME REQUEST | userId=${user.userId}, tableId=${tableId}`);
                
                const table = this.gameManager.getTable(tableId);
                
                if (!table) {
                    console.log(`[SocketHandler] START_GAME FAILED | Table not found: ${tableId}`);
                    return respond({ success: false, error: 'Table not found' });
                }
                
                console.log(`[SocketHandler] START_GAME TABLE INFO | phase=${table.phase}, creatorId=${table.creatorId}, isSimulation=${table.isSimulation}, players=${table.getSeatedPlayerCount()}`);
                
                const result = table.startReadyUp(user.userId);
                
                if (result.success) {
                    console.log(`[SocketHandler] START_GAME SUCCESS | Ready-up phase started at table ${table.name}`);
                    
                    // Broadcast ready prompt to all players
                    this.io.to(`table:${tableId}`).emit('ready_prompt', {
                        tableId: tableId,
                        timeLimit: table.readyUpDuration / 1000 // in seconds
                    });
                    
                    // Broadcast updated state
                    this.broadcastTableState(tableId);
                } else {
                    console.log(`[SocketHandler] START_GAME FAILED | ${result.error}`);
                }
                
                respond(result);
            });
            
            // Player clicks "Ready"
            socket.on('player_ready', (data, callback) => {
                const respond = (response) => {
                    if (callback) callback(response);
                    socket.emit('player_ready_response', response);
                };
                
                const user = this.getAuthenticatedUser(socket);
                if (!user) {
                    return respond({ success: false, error: 'Not authenticated' });
                }
                
                const { tableId } = data;
                const table = this.gameManager.getTable(tableId);
                
                if (!table) {
                    return respond({ success: false, error: 'Table not found' });
                }
                
                const result = table.playerReady(user.userId);
                
                if (result.success) {
                    console.log(`[SocketHandler] ${user.username} is ready at table ${table.name}`);
                    
                    // Broadcast player ready event
                    this.io.to(`table:${tableId}`).emit('player_readied', {
                        playerId: user.userId,
                        playerName: user.username
                    });
                    
                    // Broadcast updated state
                    this.broadcastTableState(tableId);
                }
                
                respond(result);
            });

            // ============ Bot Management ============
            
            // Invite a bot to the table (table creator only, requires player approval)
            socket.on('invite_bot', (data, callback) => {
                const respond = (response) => {
                    if (callback) callback(response);
                    socket.emit('invite_bot_response', response);
                };
                
                const user = this.getAuthenticatedUser(socket);
                if (!user) {
                    return respond({ success: false, error: 'Not authenticated' });
                }
                
                const { tableId, botProfile } = data;
                
                // Validate bot profile
                const validBots = this.gameManager.getAvailableBots();
                if (!validBots.includes(botProfile)) {
                    return respond({ success: false, error: `Invalid bot. Available: ${validBots.join(', ')}` });
                }
                
                // Get table's buy-in amount for the bot
                const table = this.gameManager.getTable(tableId);
                const botBuyIn = table?.buyIn || 20000000;
                
                // Invite bot to table with same buy-in as players
                const result = this.gameManager.inviteBot(tableId, botProfile, user.userId, botBuyIn);
                
                if (result.success) {
                    if (result.pendingApproval) {
                        // Notify players that approval is needed
                        console.log(`[SocketHandler] Bot ${result.bot.name} pending approval at table`);
                        
                        this.io.to(`table:${tableId}`).emit('bot_invite_pending', {
                            seatIndex: result.seatIndex,
                            botName: result.bot.name,
                            botPersonality: result.bot.personality,
                            invitedBy: user.username,
                            approvalsNeeded: result.approvalsNeeded
                        });
                    } else {
                        // Auto-approved (only creator at table)
                        console.log(`[SocketHandler] Bot ${result.bot.name} auto-approved and joined table`);
                        
                        this.broadcastTableState(tableId);
                        
                        this.io.to(`table:${tableId}`).emit('bot_joined', {
                            seatIndex: result.seatIndex,
                            botName: result.bot.name,
                            chips: result.bot.chips
                        });
                    }
                }
                
                respond({
                    success: result.success,
                    seatIndex: result.seatIndex,
                    botName: result.bot?.name,
                    pendingApproval: result.pendingApproval,
                    error: result.error
                });
            });
            
            // Approve a pending bot
            socket.on('approve_bot', (data, callback) => {
                const respond = (response) => {
                    if (callback) callback(response);
                    socket.emit('approve_bot_response', response);
                };
                
                const user = this.getAuthenticatedUser(socket);
                if (!user) {
                    return respond({ success: false, error: 'Not authenticated' });
                }
                
                const { tableId, seatIndex } = data;
                const result = this.gameManager.approveBot(tableId, seatIndex, user.userId);
                
                if (result.success) {
                    if (result.bot) {
                        // All approved - bot is now active
                        console.log(`[SocketHandler] Bot ${result.bot.name} fully approved and joined table`);
                        
                        this.broadcastTableState(tableId);
                        
                        this.io.to(`table:${tableId}`).emit('bot_joined', {
                            seatIndex: result.seatIndex,
                            botName: result.bot.name,
                            chips: result.bot.chips
                        });
                    } else {
                        // Still waiting for more approvals
                        this.io.to(`table:${tableId}`).emit('bot_approval_update', {
                            seatIndex,
                            approvedBy: user.username,
                            approvalsReceived: result.approvalsReceived,
                            approvalsNeeded: result.approvalsNeeded
                        });
                    }
                }
                
                respond(result);
            });
            
            // Reject a pending bot
            socket.on('reject_bot', (data, callback) => {
                const respond = (response) => {
                    if (callback) callback(response);
                    socket.emit('reject_bot_response', response);
                };
                
                const user = this.getAuthenticatedUser(socket);
                if (!user) {
                    return respond({ success: false, error: 'Not authenticated' });
                }
                
                const { tableId, seatIndex } = data;
                const result = this.gameManager.rejectBot(tableId, seatIndex, user.userId);
                
                if (result.success) {
                    console.log(`[SocketHandler] Bot ${result.botName} rejected by ${user.username}`);
                    
                    this.io.to(`table:${tableId}`).emit('bot_rejected', {
                        seatIndex,
                        botName: result.botName,
                        rejectedBy: user.username
                    });
                }
                
                respond(result);
            });
            
            // Remove an active bot (table creator only)
            socket.on('remove_bot', (data, callback) => {
                const respond = (response) => {
                    if (callback) callback(response);
                    socket.emit('remove_bot_response', response);
                };
                
                const user = this.getAuthenticatedUser(socket);
                if (!user) {
                    return respond({ success: false, error: 'Not authenticated' });
                }
                
                const { tableId, seatIndex } = data;
                
                // Check if user is table creator
                const table = this.gameManager.getTable(tableId);
                if (table && table.creatorId !== user.userId) {
                    return respond({ success: false, error: 'Only the table creator can remove bots' });
                }
                
                const result = this.gameManager.removeBot(tableId, seatIndex);
                
                if (result.success) {
                    console.log(`[SocketHandler] Bot ${result.botName} removed from table by ${user.username}`);
                    
                    this.broadcastTableState(tableId);
                    
                    this.io.to(`table:${tableId}`).emit('bot_left', {
                        seatIndex,
                        botName: result.botName
                    });
                }
                
                respond(result);
            });
            
            // Get pending bots awaiting approval
            socket.on('get_pending_bots', (data, callback) => {
                const respond = (response) => {
                    if (callback) callback(response);
                    socket.emit('get_pending_bots_response', response);
                };
                
                const { tableId } = data;
                const pendingBots = this.gameManager.getPendingBots(tableId);
                
                respond({
                    success: true,
                    pendingBots
                });
            });
            
            socket.on('get_available_bots', (callback) => {
                const respond = (response) => {
                    if (callback) callback(response);
                    socket.emit('get_available_bots_response', response);
                };
                
                respond({
                    success: true,
                    bots: [
                        { id: 'tex', name: 'Tex', personality: 'Aggressive', description: 'Bets big, bluffs often' },
                        { id: 'lazy_larry', name: 'Lazy Larry', personality: 'Passive', description: 'Mostly checks and calls' },
                        { id: 'pickles', name: 'Pickles', personality: 'Unpredictable', description: 'Random plays, hard to read' }
                    ]
                });
            });

            // ============ Sit Out / Back ============
            
            socket.on('sit_out', async (callback) => {
                const respond = (response) => {
                    if (callback) callback(response);
                    socket.emit('sit_out_response', response);
                };
                
                const user = this.getAuthenticatedUser(socket);
                if (!user) {
                    return respond({ success: false, error: 'Not authenticated' });
                }
                
                const player = this.gameManager.players.get(user.userId);
                if (!player?.currentTableId) {
                    return respond({ success: false, error: 'Not at a table' });
                }
                
                const table = this.gameManager.getTable(player.currentTableId);
                if (!table) {
                    return respond({ success: false, error: 'Table not found' });
                }
                
                const seat = table.seats.find(s => s?.playerId === user.userId);
                if (!seat) {
                    return respond({ success: false, error: 'Seat not found' });
                }
                
                seat.isSittingOut = true;
                seat.sitOutTime = Date.now();
                
                console.log(`[SocketHandler] ${user.username} is sitting out at table ${table.name}`);
                
                // Notify other players
                socket.to(`table:${table.id}`).emit('player_sitting_out', {
                    playerId: user.userId,
                    username: user.username
                });
                
                this.broadcastTableState(table.id);
                
                respond({ success: true });
            });
            
            socket.on('sit_back', async (callback) => {
                const respond = (response) => {
                    if (callback) callback(response);
                    socket.emit('sit_back_response', response);
                };
                
                const user = this.getAuthenticatedUser(socket);
                if (!user) {
                    return respond({ success: false, error: 'Not authenticated' });
                }
                
                const player = this.gameManager.players.get(user.userId);
                if (!player?.currentTableId) {
                    return respond({ success: false, error: 'Not at a table' });
                }
                
                const table = this.gameManager.getTable(player.currentTableId);
                if (!table) {
                    return respond({ success: false, error: 'Table not found' });
                }
                
                const seat = table.seats.find(s => s?.playerId === user.userId);
                if (!seat) {
                    return respond({ success: false, error: 'Seat not found' });
                }
                
                if (!seat.isSittingOut) {
                    return respond({ success: false, error: 'Not sitting out' });
                }
                
                seat.isSittingOut = false;
                seat.sitOutTime = null;
                
                console.log(`[SocketHandler] ${user.username} is back at table ${table.name}`);
                
                // Notify other players
                socket.to(`table:${table.id}`).emit('player_sitting_back', {
                    playerId: user.userId,
                    username: user.username
                });
                
                this.broadcastTableState(table.id);
                
                // Check if we can start a hand now
                if (table.phase === 'waiting') {
                    const activePlayers = table.seats.filter(s => s && !s.isSittingOut && s.chips > 0);
                    if (activePlayers.length >= 2) {
                        table.startNewHand();
                        this.broadcastTableState(table.id);
                    }
                }
                
                respond({ success: true });
            });
            
            socket.on('get_sit_out_status', async (callback) => {
                const respond = (response) => {
                    if (callback) callback(response);
                    socket.emit('get_sit_out_status_response', response);
                };
                
                const user = this.getAuthenticatedUser(socket);
                if (!user) {
                    return respond({ success: false, error: 'Not authenticated' });
                }
                
                const player = this.gameManager.players.get(user.userId);
                if (!player?.currentTableId) {
                    return respond({ success: true, isSittingOut: false });
                }
                
                const table = this.gameManager.getTable(player.currentTableId);
                const seat = table?.seats?.find(s => s?.playerId === user.userId);
                
                respond({
                    success: true,
                    isSittingOut: seat?.isSittingOut || false,
                    sitOutTime: seat?.sitOutTime
                });
            });

            // ============ Friends & Social ============
            
            socket.on('get_friends', async (callback) => {
                const respond = (response) => {
                    if (callback) callback(response);
                    socket.emit('get_friends_response', response);
                };
                
                const user = this.getAuthenticatedUser(socket);
                if (!user) {
                    return respond({ success: false, error: 'Not authenticated' });
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
                
                respond({ success: true, friends });
            });

            socket.on('send_friend_request', async (data, callback) => {
                const respond = (response) => {
                    if (callback) callback(response);
                    socket.emit('send_friend_request_response', response);
                };
                
                const user = this.getAuthenticatedUser(socket);
                if (!user) {
                    return respond({ success: false, error: 'Not authenticated' });
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
                
                respond(result);
            });

            socket.on('accept_friend_request', async (data, callback) => {
                const respond = (response) => {
                    if (callback) callback(response);
                    socket.emit('accept_friend_request_response', response);
                };
                
                const user = this.getAuthenticatedUser(socket);
                if (!user) {
                    return respond({ success: false, error: 'Not authenticated' });
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
                
                respond(result);
            });

            socket.on('decline_friend_request', async (data, callback) => {
                const respond = (response) => {
                    if (callback) callback(response);
                    socket.emit('decline_friend_request_response', response);
                };
                
                const user = this.getAuthenticatedUser(socket);
                if (!user) {
                    return respond({ success: false, error: 'Not authenticated' });
                }
                
                const result = await userRepo.declineFriendRequest(user.userId, data.fromUserId);
                respond(result);
            });

            socket.on('remove_friend', async (data, callback) => {
                const respond = (response) => {
                    if (callback) callback(response);
                    socket.emit('remove_friend_response', response);
                };
                
                const user = this.getAuthenticatedUser(socket);
                if (!user) {
                    return respond({ success: false, error: 'Not authenticated' });
                }
                
                const result = await userRepo.removeFriend(user.userId, data.friendId);
                respond(result);
            });
            
            socket.on('get_friend_requests', async (callback) => {
                const respond = (response) => {
                    if (callback) callback(response);
                    socket.emit('get_friend_requests_response', response);
                };
                
                const user = this.getAuthenticatedUser(socket);
                if (!user) {
                    return respond({ success: false, error: 'Not authenticated' });
                }
                
                try {
                    const requests = await userRepo.getPendingFriendRequests(user.userId);
                    respond({ success: true, requests });
                } catch (error) {
                    console.error('[Friends] Error getting requests:', error);
                    respond({ success: false, error: 'Failed to load friend requests' });
                }
            });

            socket.on('search_users', async (data, callback) => {
                const respond = (response) => {
                    if (callback) callback(response);
                    socket.emit('search_users_response', response);
                };
                
                const user = this.getAuthenticatedUser(socket);
                if (!user) {
                    return respond({ success: false, error: 'Not authenticated' });
                }
                
                const results = await userRepo.searchUsers(data.query, user.userId);
                respond({ success: true, users: results });
            });

            socket.on('invite_to_table', async (data, callback) => {
                const respond = (response) => {
                    if (callback) callback(response);
                    socket.emit('invite_to_table_response', response);
                };
                
                const user = this.getAuthenticatedUser(socket);
                if (!user) {
                    return respond({ success: false, error: 'Not authenticated' });
                }
                
                const { toUserId, tableId } = data;
                const table = this.gameManager.getTable(tableId);
                
                if (!table) {
                    return respond({ success: false, error: 'Table not found' });
                }
                
                // Check if friends
                const friendIds = await userRepo.getFriendIds(user.userId);
                if (!friendIds.includes(toUserId)) {
                    return respond({ success: false, error: 'Not friends' });
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
                
                respond({ success: true });
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
                
                const { action, amount } = data;
                
                // Process player's poker action
                const result = await this.adventureManager.handlePlayerAction(user.userId, action, amount);
                
                if (!result.success) {
                    return callback(result);
                }
                
                // Check for game end
                if (result.status === 'victory') {
                    socket.emit('adventure_result', result);
                    
                    // Check for rare drops
                    if (result.rewards?.items?.some(i => 
                        ['legendary', 'epic'].includes(i.rarity?.toLowerCase())
                    )) {
                        socket.emit('rare_drop_obtained', {
                            items: result.rewards.items.filter(i => 
                                ['legendary', 'epic'].includes(i.rarity?.toLowerCase())
                            )
                        });
                    }
                } else if (result.status === 'defeat') {
                    socket.emit('adventure_result', result);
                }
                
                // Send response
                const response = { success: true, ...result };
                if (callback) callback(response);
                socket.emit('adventure_action_response', response);
            });
            
            socket.on('adventure_next_hand', async (data, callback) => {
                const user = this.getAuthenticatedUser(socket);
                if (!user) return callback({ success: false, error: 'Not authenticated' });
                
                const handState = this.adventureManager.startNewHand(user.userId);
                if (!handState) {
                    return callback({ success: false, error: 'No active session' });
                }
                
                const response = { success: true, hand: handState };
                if (callback) callback(response);
                socket.emit('adventure_next_hand_response', response);
            });
            
            socket.on('forfeit_adventure', async (callback) => {
                const respond = (response) => {
                    if (callback) callback(response);
                    socket.emit('forfeit_adventure_response', response);
                };
                
                const user = this.getAuthenticatedUser(socket);
                if (!user) return respond({ success: false, error: 'Not authenticated' });
                
                const result = await this.adventureManager.forfeit(user.userId);
                respond(result);
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

            // ============ Leaderboards ============
            
            socket.on('get_leaderboard', async (data, callback) => {
                const respond = (response) => {
                    if (callback) callback(response);
                    socket.emit('get_leaderboard_response', response);
                };
                
                const { category } = data || { category: 'chips' };
                
                try {
                    let entries = [];
                    
                    switch (category) {
                        case 'chips':
                            entries = await userRepo.getTopByChips(20);
                            break;
                        case 'wins':
                            entries = await userRepo.getTopByWins(20);
                            break;
                        case 'level':
                            entries = await userRepo.getTopByLevel(20);
                            break;
                        case 'biggest_pot':
                            entries = await userRepo.getTopByBiggestPot(20);
                            break;
                        default:
                            entries = await userRepo.getTopByChips(20);
                    }
                    
                    respond({
                        success: true,
                        category,
                        entries: entries.map((e, i) => ({
                            rank: i + 1,
                            oderId: e.id,
                            username: e.username,
                            level: e.level || 1,
                            value: e.value || e.chips || 0
                        }))
                    });
                } catch (error) {
                    console.error('[Leaderboard] Error:', error);
                    respond({ success: false, error: 'Failed to load leaderboard' });
                }
            });

            // ============ Daily Rewards ============
            
            socket.on('get_daily_reward_status', async (callback) => {
                const respond = (response) => {
                    if (callback) callback(response);
                    socket.emit('get_daily_reward_status_response', response);
                };
                
                const user = this.getAuthenticatedUser(socket);
                if (!user) {
                    return respond({ success: false, error: 'Not authenticated' });
                }
                
                try {
                    const profile = await userRepo.findByUserId(user.userId);
                    const lastClaim = profile.lastDailyReward ? new Date(profile.lastDailyReward) : null;
                    const now = new Date();
                    
                    let canClaim = true;
                    let nextClaimTime = null;
                    
                    if (lastClaim) {
                        const hoursSinceClaim = (now - lastClaim) / (1000 * 60 * 60);
                        canClaim = hoursSinceClaim >= 24;
                        
                        if (!canClaim) {
                            const nextClaim = new Date(lastClaim.getTime() + 24 * 60 * 60 * 1000);
                            nextClaimTime = nextClaim.toISOString();
                        }
                    }
                    
                    // Check if streak is broken (more than 48 hours)
                    let currentDay = profile.dailyStreak || 1;
                    if (lastClaim) {
                        const hoursSinceClaim = (now - lastClaim) / (1000 * 60 * 60);
                        if (hoursSinceClaim >= 48) {
                            currentDay = 1;  // Reset streak
                        }
                    }
                    
                    const rewards = [
                        { day: 1, chips: 5000, xp: 50 },
                        { day: 2, chips: 7500, xp: 75 },
                        { day: 3, chips: 10000, xp: 100, bonus: 'Mystery Box' },
                        { day: 4, chips: 15000, xp: 125 },
                        { day: 5, chips: 20000, xp: 150, gems: 5 },
                        { day: 6, chips: 30000, xp: 200 },
                        { day: 7, chips: 50000, xp: 300, gems: 20, bonus: 'Epic Item' }
                    ];
                    
                    respond({
                        success: true,
                        currentDay: Math.min(currentDay, 7),
                        canClaim,
                        nextClaimTime,
                        reward: rewards[Math.min(currentDay - 1, 6)]
                    });
                } catch (error) {
                    console.error('[DailyReward] Error:', error);
                    respond({ success: false, error: 'Failed to get daily reward status' });
                }
            });
            
            socket.on('claim_daily_reward', async (callback) => {
                const respond = (response) => {
                    if (callback) callback(response);
                    socket.emit('claim_daily_reward_response', response);
                };
                
                const user = this.getAuthenticatedUser(socket);
                if (!user) {
                    return respond({ success: false, error: 'Not authenticated' });
                }
                
                try {
                    const profile = await userRepo.findByUserId(user.userId);
                    const lastClaim = profile.lastDailyReward ? new Date(profile.lastDailyReward) : null;
                    const now = new Date();
                    
                    if (lastClaim) {
                        const hoursSinceClaim = (now - lastClaim) / (1000 * 60 * 60);
                        if (hoursSinceClaim < 24) {
                            return respond({ success: false, error: 'Already claimed today' });
                        }
                    }
                    
                    // Calculate streak
                    let newStreak = 1;
                    if (lastClaim) {
                        const hoursSinceClaim = (now - lastClaim) / (1000 * 60 * 60);
                        if (hoursSinceClaim < 48) {
                            newStreak = Math.min((profile.dailyStreak || 0) + 1, 7);
                        }
                    }
                    
                    const rewards = [
                        { day: 1, chips: 5000, xp: 50, gems: 0 },
                        { day: 2, chips: 7500, xp: 75, gems: 0 },
                        { day: 3, chips: 10000, xp: 100, gems: 0, bonus: 'Mystery Box' },
                        { day: 4, chips: 15000, xp: 125, gems: 0 },
                        { day: 5, chips: 20000, xp: 150, gems: 5 },
                        { day: 6, chips: 30000, xp: 200, gems: 0 },
                        { day: 7, chips: 50000, xp: 300, gems: 20, bonus: 'Epic Item' }
                    ];
                    
                    const reward = rewards[newStreak - 1];
                    
                    // Award rewards
                    await userRepo.updateChips(user.userId, reward.chips);
                    await userRepo.addXP(user.userId, reward.xp);
                    if (reward.gems > 0) {
                        await userRepo.addGems(user.userId, reward.gems);
                    }
                    
                    // Update streak and last claim
                    await userRepo.updateDailyStreak(user.userId, newStreak, now.toISOString());
                    
                    console.log(`[DailyReward] ${user.username} claimed day ${newStreak}: +${reward.chips} chips, +${reward.xp} XP`);
                    
                    respond({
                        success: true,
                        chipsAwarded: reward.chips,
                        xpAwarded: reward.xp,
                        gemsAwarded: reward.gems || 0,
                        bonusItem: reward.bonus || null,
                        newStreak
                    });
                } catch (error) {
                    console.error('[DailyReward] Error claiming:', error);
                    respond({ success: false, error: 'Failed to claim reward' });
                }
            });

            // ============ Achievements ============
            
            socket.on('get_achievements', async (callback) => {
                const respond = (response) => {
                    if (callback) callback(response);
                    socket.emit('get_achievements_response', response);
                };
                
                const user = this.getAuthenticatedUser(socket);
                if (!user) {
                    return respond({ success: false, error: 'Not authenticated' });
                }
                
                try {
                    const profile = await userRepo.findByUserId(user.userId);
                    const unlockedIds = profile.achievements || [];
                    
                    const allAchievements = [
                        { id: 'first_win', name: 'First Victory', description: 'Win your first hand', icon: '🏆', category: 'Beginner', xpReward: 100 },
                        { id: 'play_10', name: 'Getting Started', description: 'Play 10 hands', icon: '🃏', category: 'Beginner', xpReward: 50 },
                        { id: 'win_50', name: 'Winning Streak', description: 'Win 50 hands', icon: '🔥', category: 'Skill', xpReward: 250 },
                        { id: 'royal_flush', name: 'Royal Flush', description: 'Get a royal flush', icon: '👑', category: 'Skill', xpReward: 1000 },
                        { id: 'chips_10k', name: 'Stacking Up', description: 'Accumulate 10,000 chips', icon: '💰', category: 'Wealth', xpReward: 100 },
                        { id: 'chips_100k', name: 'High Roller', description: 'Accumulate 100,000 chips', icon: '💎', category: 'Wealth', xpReward: 500 },
                        { id: 'chips_1m', name: 'Millionaire', description: 'Accumulate 1,000,000 chips', icon: '🏦', category: 'Wealth', xpReward: 2000 },
                        { id: 'first_boss', name: 'Boss Slayer', description: 'Defeat your first boss', icon: '👹', category: 'Adventure', xpReward: 200 },
                        { id: 'tournament_win', name: 'Tournament Champion', description: 'Win a tournament', icon: '🏆', category: 'Tournaments', xpReward: 1000 },
                    ];
                    
                    respond({
                        success: true,
                        unlockedIds,
                        allAchievements: allAchievements.map(a => ({
                            ...a,
                            isUnlocked: unlockedIds.includes(a.id)
                        }))
                    });
                } catch (error) {
                    console.error('[Achievements] Error:', error);
                    respond({ success: false, error: 'Failed to load achievements' });
                }
            });
            
            socket.on('unlock_achievement', async (data, callback) => {
                const respond = (response) => {
                    if (callback) callback(response);
                    socket.emit('unlock_achievement_response', response);
                };
                
                const user = this.getAuthenticatedUser(socket);
                if (!user) {
                    return respond({ success: false, error: 'Not authenticated' });
                }
                
                const { achievementId } = data;
                if (!achievementId) {
                    return respond({ success: false, error: 'Achievement ID required' });
                }
                
                try {
                    const result = await userRepo.unlockAchievement(user.userId, achievementId);
                    
                    if (result.alreadyUnlocked) {
                        return respond({ success: false, error: 'Already unlocked' });
                    }
                    
                    // Award XP
                    if (result.xpReward) {
                        await userRepo.addXP(user.userId, result.xpReward);
                    }
                    
                    console.log(`[Achievement] ${user.username} unlocked: ${achievementId}`);
                    
                    respond({
                        success: true,
                        achievementId,
                        xpAwarded: result.xpReward || 0
                    });
                } catch (error) {
                    console.error('[Achievement] Error:', error);
                    respond({ success: false, error: 'Failed to unlock achievement' });
                }
            });

            // ============ Disconnect ============
            
            socket.on('disconnect', async () => {
                console.log(`[Socket] Client disconnected: ${socket.id}`);
                const user = this.getAuthenticatedUser(socket);
                
                if (user) {
                    const player = this.gameManager.players.get(user.userId);
                    
                    if (player?.currentTableId) {
                        const table = this.gameManager.getTable(player.currentTableId);
                        
                        // Mark player as disconnected but don't remove yet
                        // Allow reconnection within timeout period
                        const seat = table?.seats?.find(s => s?.playerId === user.userId);
                        if (seat) {
                            seat.isConnected = false;
                            seat.disconnectedAt = Date.now();
                        }
                        
                        socket.to(`table:${player.currentTableId}`).emit('player_disconnected', {
                            playerId: user.userId,
                            canReconnect: true,
                            timeoutSeconds: 60
                        });
                        
                        // Set timeout to remove player if they don't reconnect
                        this.setReconnectTimeout(user.userId, player.currentTableId, 60000);
                    } else {
                        // Not at a table, just remove
                        this.gameManager.removePlayer(user.userId, socket.id);
                    }
                    
                    this.deauthenticateSocket(socket);
                    
                    // Notify friends that user went offline
                    this.notifyFriendsStatus(user.userId, false);
                }
            });
            
            // ============ Reconnection ============
            
            socket.on('reconnect_to_table', async (data, callback) => {
                const respond = (response) => {
                    if (callback) callback(response);
                    socket.emit('reconnect_to_table_response', response);
                };
                
                const user = this.getAuthenticatedUser(socket);
                if (!user) {
                    return respond({ success: false, error: 'Not authenticated' });
                }
                
                const { tableId } = data || {};
                
                // Check if player has a pending reconnection
                const player = this.gameManager.players.get(user.userId);
                if (!player) {
                    return respond({ success: false, error: 'No active session found' });
                }
                
                const table = this.gameManager.getTable(player.currentTableId || tableId);
                if (!table) {
                    return respond({ success: false, error: 'Table not found' });
                }
                
                const seat = table.seats.find(s => s?.playerId === user.userId);
                if (!seat) {
                    return respond({ success: false, error: 'Seat not found' });
                }
                
                // Clear reconnect timeout
                this.clearReconnectTimeout(user.userId);
                
                // Mark as connected
                seat.isConnected = true;
                seat.disconnectedAt = null;
                
                // Update player's socket
                player.socketId = socket.id;
                
                // Rejoin room
                socket.join(`table:${table.id}`);
                
                console.log(`[Socket] ${user.username} reconnected to table ${table.name}`);
                
                // Notify other players
                socket.to(`table:${table.id}`).emit('player_reconnected', {
                    playerId: user.userId,
                    username: user.username
                });
                
                // Send current table state
                const state = table.getState(user.userId);
                
                respond({
                    success: true,
                    tableId: table.id,
                    tableName: table.name,
                    state
                });
            });
            
            socket.on('check_active_session', async (callback) => {
                const respond = (response) => {
                    if (callback) callback(response);
                    socket.emit('check_active_session_response', response);
                };
                
                const user = this.getAuthenticatedUser(socket);
                if (!user) {
                    return respond({ success: false, error: 'Not authenticated' });
                }
                
                const player = this.gameManager.players.get(user.userId);
                if (!player?.currentTableId) {
                    return respond({ success: true, hasActiveSession: false });
                }
                
                const table = this.gameManager.getTable(player.currentTableId);
                if (!table) {
                    return respond({ success: true, hasActiveSession: false });
                }
                
                respond({
                    success: true,
                    hasActiveSession: true,
                    tableId: table.id,
                    tableName: table.name,
                    phase: table.phase
                });
            });
        });

        console.log('[SocketHandler] Initialized');
    }

    // ============ Reconnection Helpers ============
    
    setReconnectTimeout(userId, tableId, timeoutMs) {
        // Clear any existing timeout
        this.clearReconnectTimeout(userId);
        
        const timeout = setTimeout(async () => {
            console.log(`[Socket] Reconnect timeout expired for user ${userId}`);
            
            const player = this.gameManager.players.get(userId);
            if (player?.currentTableId === tableId) {
                const table = this.gameManager.getTable(tableId);
                const seat = table?.seats?.find(s => s?.playerId === userId);
                
                // Only remove if still disconnected
                if (seat && !seat.isConnected) {
                    // Save chips before removing
                    await userRepo.setChips(userId, player.chips);
                    
                    // Remove from table (this also calls checkAndCloseEmptyTable)
                    this.gameManager.leaveTable(userId);
                    
                    // Notify remaining players
                    this.io.to(`table:${tableId}`).emit('player_left', {
                        userId: userId,
                        reason: 'disconnect_timeout'
                    });
                    
                    // Double-check table cleanup in case all players disconnected
                    this.gameManager.checkAndCloseEmptyTable(tableId);
                    
                    // Broadcast updated state (if table still exists)
                    if (this.gameManager.getTable(tableId)) {
                        this.broadcastTableState(tableId);
                    }
                }
            }
            
            this.reconnectTimeouts.delete(userId);
        }, timeoutMs);
        
        this.reconnectTimeouts.set(userId, timeout);
    }
    
    clearReconnectTimeout(userId) {
        const timeout = this.reconnectTimeouts.get(userId);
        if (timeout) {
            clearTimeout(timeout);
            this.reconnectTimeouts.delete(userId);
        }
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

    // ============ Table Callbacks ============
    
        setupTableCallbacks(table) {
            const gameLogger = require('../utils/GameLogger');
        // Called when table state changes (for auto-broadcasting)
        table.onStateChange = () => {
            this.broadcastTableState(table.id);
            
            // Check if next player is a bot
            this.gameManager.checkBotTurn(table.id);
        };
        
        // Called when countdown starts/stops/updates
        table.onCountdownUpdate = () => {
            const countdown = table.getStartCountdownRemaining();
            console.log(`[SocketHandler] Countdown update for table ${table.name}: ${countdown}s`);
            
            this.io.to(`table:${table.id}`).emit('countdown_update', {
                tableId: table.id,
                secondsRemaining: countdown
            });
            
            // Also broadcast full state so UI updates
            this.broadcastTableState(table.id);
        };
        
        // Called when game ends (one player has all the chips)
        // CRITICAL: Preserve any existing onGameOver callback (e.g., from SimulationManager)
        // The existing callback should run AFTER SocketHandler notifies clients
        const originalOnGameOver = table.onGameOver;
        console.log(`[SocketHandler] Setting up onGameOver callback for table ${table.name} (${table.id}). Original callback: ${originalOnGameOver ? 'EXISTS' : 'NONE'}`);
        gameLogger.gameEvent(table.name, '[SocketHandler] Setting up onGameOver callback', {
            tableId: table.id,
            hasOriginalCallback: !!originalOnGameOver
        });
        table.onGameOver = (winner) => {
            console.log(`[SocketHandler] Game over at table ${table.name} - Winner: ${winner.name}`);
            gameLogger.gameEvent(table.name, '[SocketHandler] Game over callback invoked', {
                winner: winner.name,
                winnerId: winner.playerId
            });
            
            // CRITICAL: Only send game_over to actual players, NOT spectators
            // Spectators should not be prompted to leave - they're just watching
            // Send to each player individually to avoid sending to spectators
            let playersNotified = 0;
            const spectatorUserIds = new Set(Array.from(table.spectators.keys())); // Get all spectator user IDs
            
            for (const seat of table.seats) {
                if (seat && !seat.isBot && seat.socketId) {
                    // This is a real player (not a bot, not a spectator)
                    // CRITICAL: Check if this user is actually a spectator before sending
                    const userId = this.socketToUser.get(seat.socketId);
                    if (userId && spectatorUserIds.has(userId)) {
                        console.log(`[SocketHandler] Skipping game_over for ${seat.name} - they are a spectator`);
                        continue;
                    }
                    
                    // Double-check: make sure this user is not in the spectators map
                    if (userId && table.isSpectator(userId)) {
                        console.log(`[SocketHandler] Skipping game_over for ${seat.name} - confirmed spectator via isSpectator check`);
                        continue;
                    }
                    
                    this.io.to(seat.socketId).emit('game_over', {
                        tableId: table.id,
                        winnerId: winner.playerId,
                        winnerName: winner.name,
                        winnerChips: winner.chips,
                        isBot: winner.isBot || false,
                        isInformational: false  // Explicitly mark as non-informational for players
                    });
                    playersNotified++;
                }
            }
            
            // Send informational version to spectators (no leave prompt)
            // CRITICAL: Send ONLY to spectator room, NOT to table room, to avoid duplicates
            // Spectators are in both rooms, so we must be explicit
            const spectatorRoom = `spectator:${table.id}`;
            const spectatorSockets = this.io.sockets.adapter.rooms.get(spectatorRoom);
            const spectatorCount = spectatorSockets ? spectatorSockets.size : 0;
            
            console.log(`[SocketHandler] Sending game_over to ${playersNotified} players and ${spectatorCount} spectators (informational only)`);
            
            // CRITICAL: Send to spectator room only, and mark as informational
            // This ensures spectators don't get the regular game_over event from table room
            if (spectatorCount > 0) {
                this.io.to(spectatorRoom).emit('game_over', {
                    tableId: table.id,
                    winnerId: winner.playerId,
                    winnerName: winner.name,
                    winnerChips: winner.chips,
                    isBot: winner.isBot || false,
                    isInformational: true  // Spectators get informational only - no leave prompt
                });
            }
            
            // Call original callback AFTER notifying clients (e.g., SimulationManager auto-restart)
            // This ensures clients are notified before the game restarts
            if (originalOnGameOver) {
                originalOnGameOver(winner);
            }
        };
        
        // Called when ANY player (human or bot) takes an action
        table.onPlayerAction = (playerId, action, amount) => {
            console.log(`[SocketHandler] Player action: ${playerId} ${action} ${amount}`);
            
            this.io.to(`table:${table.id}`).emit('player_action', {
                playerId: playerId,
                action: action,
                amount: amount || 0
            });
        };
        
        // Called when a hand is complete (showdown or all folded)
        table.onHandComplete = (result) => {
            console.log(`[SocketHandler] Hand complete: ${result.winnerName} wins ${result.potAmount} with ${result.handName}`);
            
            this.io.to(`table:${table.id}`).emit('hand_result', {
                tableId: table.id,
                winnerId: result.winnerId,
                winnerName: result.winnerName,
                handName: result.handName,
                potAmount: result.potAmount,
                potAwards: result.potAwards || []
            });
        };
        
        // Called when a player auto-folds due to timeout
        table.onAutoFold = (playerId, seatIndex) => {
            console.log(`[SocketHandler] Auto-fold: ${playerId} at seat ${seatIndex}`);
            
            // Broadcast the fold action to all players at the table
            this.io.to(`table:${table.id}`).emit('player_action', {
                playerId: playerId,
                action: 'fold',
                amount: 0,
                isTimeout: true
            });
            
            // State will be broadcast by onStateChange (which also checks for bot turns)
        };
        
        // Called when ready-up phase starts
        table.onReadyPrompt = () => {
            console.log(`[SocketHandler] Ready-up phase started at table ${table.name}`);
            
            this.io.to(`table:${table.id}`).emit('ready_prompt', {
                tableId: table.id,
                timeLimit: table.readyUpDuration / 1000 // in seconds
            });
        };
        
        // Called when a player didn't ready in time and becomes spectator
        table.onPlayerNotReady = (playerId, playerName) => {
            console.log(`[SocketHandler] ${playerName} not ready - moved to spectators at table ${table.name}`);
            
            // Find the player's socket and notify them
            const playerAuth = this.authenticatedUsers.get(playerId);
            if (playerAuth) {
                this.io.to(playerAuth.socketId).emit('moved_to_spectator', {
                    tableId: table.id,
                    reason: 'Did not ready up in time'
                });
            }
            
            // Broadcast to all that player is now spectating
            this.io.to(`table:${table.id}`).emit('player_not_ready', {
                playerId: playerId,
                playerName: playerName
            });
        };
        
        // Called when a player runs out of chips (eliminated)
        table.onPlayerEliminated = (data) => {
            console.log(`[SocketHandler] ${data.playerName} eliminated at table ${table.name}`);
            
            // Broadcast to all players that someone was eliminated
            // CRITICAL: Only send to actual players, not spectators
            // Spectators should never receive elimination prompts
            this.io.to(`table:${table.id}`).emit('player_eliminated', {
                tableId: table.id,
                playerId: data.playerId,
                playerName: data.playerName,
                seatIndex: data.seatIndex,
                isBot: data.isBot || false,
                // Add flag to indicate this is informational only (not a prompt to leave)
                isInformational: false
            });
            
            // Also send to spectators but with informational flag (they're just watching)
            // This way they see the elimination notification but don't get prompted to leave
            this.io.to(`spectator:${table.id}`).emit('player_eliminated', {
                tableId: table.id,
                playerId: data.playerId,
                playerName: data.playerName,
                seatIndex: data.seatIndex,
                isBot: data.isBot || false,
                isInformational: true  // Spectators get informational only - no leave prompt
            });
        };
    }

    // ============ Broadcasting ============
    
    broadcastTableState(tableId) {
        const table = this.gameManager.getTable(tableId);
        if (!table) return;

        // Broadcast to players in seats
        const sockets = this.io.sockets.adapter.rooms.get(`table:${tableId}`);
        if (sockets) {
            for (const socketId of sockets) {
                const userId = this.socketToUser.get(socketId);
                const state = table.getState(userId);
                this.io.to(socketId).emit('table_state', state);
            }
        }
        
        // CRITICAL: Also broadcast to spectators (they're in a separate room)
        // In simulation mode, spectators need to see all cards
        const spectatorSockets = this.io.sockets.adapter.rooms.get(`spectator:${tableId}`);
        if (spectatorSockets) {
            for (const socketId of spectatorSockets) {
                const userId = this.socketToUser.get(socketId);
                // Pass userId so isSpectator check works correctly
                const state = table.getState(userId);
                this.io.to(socketId).emit('table_state', state);
            }
        }
    }
}

module.exports = SocketHandler;
