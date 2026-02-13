/**
 * SocketHandler - Manages WebSocket connections and events
 * This is the communication layer between Unity clients and the game server
 */

const userRepo = require('../database/UserRepository');
const db = require('../database/Database');
const AdventureManager = require('../adventure/AdventureManager');
const TournamentManager = require('../game/TournamentManager');
const SimulationManager = require('../testing/SimulationManager');
const gameLogger = require('../utils/GameLogger');
// UnityLogHandler was in monitoring/ (removed). Stub it to prevent crashes.
const UnityLogHandler = class { constructor() {} handleUnityLog() {} };

class SocketHandler {
    constructor(io, gameManager) {
        this.io = io;
        this.gameManager = gameManager;
        this.adventureManager = new AdventureManager(userRepo);
        this.tournamentManager = new TournamentManager(userRepo);
        this.simulationManager = new SimulationManager(gameManager);
        // Pass io to SimulationManager so it can notify spectators
        this.simulationManager.setIO(io);
        
        // Initialize Unity log handler for centralized logging
        this.unityLogHandler = new UnityLogHandler(this);
        
        // Track authenticated users: userId -> { userId, socketId, profile }
        this.authenticatedUsers = new Map();
        this.socketToUser = new Map();  // socketId -> userId
        this.reconnectTimeouts = new Map();  // userId -> timeout handle
    }

    initialize() {
        this.io.on('connection', (socket) => {
            console.log(`[SocketHandler] New socket connection: ${socket.id}`);
            
            // ============ Authentication ============
            
            socket.on('register', async (data, callback) => {
                if (!db.isConnected) {
                    const error = { success: false, error: 'Database offline' };
                    gameLogger.error('SYSTEM', '[AUTH] REGISTER_FAILED', { error: 'Database offline', username: data?.username });
                    if (callback) callback(error);
                    socket.emit('register_response', error);
                    return;
                }
                
                const { username, password, email } = data;
                const result = await userRepo.register(username, password, email);
                
                let response;
                if (result.success) {
                    // Auto-login after registration
                    const loginResult = await userRepo.login(username, password);
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
                
                if (callback) callback(response);
                socket.emit('register_response', response);
            });

            socket.on('login', async (data, callback) => {
                try {
                    const username = data?.username || 'unknown';
                    
                    if (!db.isConnected) {
                        const error = { success: false, error: 'Database offline' };
                        gameLogger.error('SYSTEM', '[AUTH] LOGIN_FAILED', { error: 'Database offline', username });
                        if (callback) callback(error);
                        socket.emit('login_response', error);
                        return;
                    }
                    
                    const { password } = data || {};
                    
                    if (!username || !password) {
                        const error = { success: false, error: 'Username and password required' };
                        gameLogger.error('SYSTEM', '[AUTH] LOGIN_FAILED', { error: 'Missing credentials', username });
                        if (callback) callback(error);
                        socket.emit('login_response', error);
                        return;
                    }
                    
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
                } catch (error) {
                    gameLogger.error('SYSTEM', '[AUTH] LOGIN_EXCEPTION', { error: error.message, stack: error.stack, username: data?.username });
                    const errorResponse = { success: false, error: 'Login failed: ' + error.message };
                    if (callback) callback(errorResponse);
                    socket.emit('login_response', errorResponse);
                }
            });

            socket.on('logout', (callback) => {
                this.deauthenticateSocket(socket);
                callback?.({ success: true });
            });

            socket.on('reset_progress', async (data, callback) => {
                const user = this.getAuthenticatedUser(socket);
                if (!user) {
                    return callback?.({ success: false, error: 'Not authenticated' });
                }

                try {
                    await userRepo.resetProgress(user.userId);
                    // Refresh the user's profile after reset
                    const profile = await userRepo.getFullProfile(user.userId);
                    callback?.({ success: true, profile });
                    gameLogger.gameEvent('USER', '[RESET_PROGRESS] SUCCESS', { userId: user.userId, username: user.username });
                } catch (error) {
                    gameLogger.error('USER', '[RESET_PROGRESS] FAILED', { userId: user.userId, error: error.message });
                    callback?.({ success: false, error: 'Failed to reset progress' });
                }
            });

            socket.on('get_profile', async (callback) => {
                const user = this.getAuthenticatedUser(socket);
                if (!user) {
                    return callback({ success: false, error: 'Not authenticated' });
                }
                
                const profile = await userRepo.getFullProfile(user.userId);
                callback({ success: true, profile });
            });
            
            // ============ Inventory ============
            
            socket.on('get_inventory', async (data, callback) => {
                const user = this.getAuthenticatedUser(socket);
                if (!user) {
                    gameLogger.error('SYSTEM', '[INVENTORY] GET_INVENTORY_FAILED', { error: 'Not authenticated', socketId: socket.id });
                    if (callback && typeof callback === 'function') {
                        callback({ success: false, error: 'Not authenticated' });
                    }
                    socket.emit('get_inventory_response', { success: false, error: 'Not authenticated' });
                    return;
                }
                
                try {
                    const inventory = await userRepo.getInventory(user.userId);
                    
                    // Warn if items missing icons (sprite loading will fail)
                    const itemsWithoutIcons = (inventory || []).filter(item => !item.icon || item.icon === 'default_item');
                    if (itemsWithoutIcons.length > 0) {
                        gameLogger.warn('SYSTEM', `[INVENTORY] MISSING_ICONS_WARNING`, {
                            userId: user.userId,
                            count: itemsWithoutIcons.length,
                            items: itemsWithoutIcons.map(item => ({
                                name: item.name,
                                templateId: item.templateId,
                                icon: item.icon || 'MISSING'
                            }))
                        });
                    }
                    
                    const response = { success: true, inventory };
                    if (callback && typeof callback === 'function') {
                        callback(response);
                    }
                    socket.emit('get_inventory_response', response);
                } catch (error) {
                    gameLogger.error('SYSTEM', `[INVENTORY] GET_INVENTORY_ERROR`, {
                        userId: user.userId,
                        username: user.profile?.username,
                        error: error.message,
                        errorType: error.constructor.name,
                        stackTrace: error.stack
                    });
                    const errorResponse = { success: false, error: error.message };
                    if (callback && typeof callback === 'function') {
                        callback(errorResponse);
                    }
                    socket.emit('get_inventory_response', errorResponse);
                }
            });
            
            // Test endpoint: Add test items to inventory (for development/testing)
            socket.on('get_test_items', async (data, callback) => {
                const user = this.getAuthenticatedUser(socket);
                if (!user) {
                    gameLogger.error('SYSTEM', '[INVENTORY] GET_TEST_ITEMS_FAILED', { error: 'Not authenticated', socketId: socket.id });
                    const errorResponse = { success: false, error: 'Not authenticated' };
                    if (callback && typeof callback === 'function') {
                        callback(errorResponse);
                    }
                    socket.emit('get_test_items_response', errorResponse);
                    return;
                }
                
                // ROOT TRACING: Track test items request start
                gameLogger.gameEvent('SYSTEM', `[INVENTORY] GET_TEST_ITEMS_START`, {
                    userId: user.userId,
                    username: user.profile?.username,
                    socketId: socket.id,
                    stackTrace: new Error().stack?.split('\n').slice(2, 8).join(' | ') || 'NO_STACK'
                });
                
                try {
                    const Item = require('../models/Item');
                    
                    // Create a variety of test items across all rarities
                    const testItems = [
                    // Common items
                    new Item({ ...Item.TEMPLATES.XP_BOOST_SMALL, obtainedFrom: 'Test Items' }),
                    new Item({ ...Item.TEMPLATES.TROPHY_FIRST_BOSS, obtainedFrom: 'Test Items' }),
                    
                    // Uncommon items
                    new Item({ ...Item.TEMPLATES.CARD_BACK_FLAME, obtainedFrom: 'Test Items' }),
                    new Item({ ...Item.TEMPLATES.TABLE_SKIN_VELVET, obtainedFrom: 'Test Items' }),
                    new Item({ ...Item.TEMPLATES.AVATAR_WOLF, obtainedFrom: 'Test Items' }),
                    new Item({ ...Item.TEMPLATES.XP_BOOST_MEDIUM, obtainedFrom: 'Test Items' }),
                    
                    // Rare items
                    new Item({ ...Item.TEMPLATES.AVATAR_SHARK, obtainedFrom: 'Test Items' }),
                    new Item({ ...Item.TEMPLATES.TROPHY_UNDERGROUND, obtainedFrom: 'Test Items' }),
                    new Item({ ...Item.TEMPLATES.CHIP_STYLE_CASINO, obtainedFrom: 'Test Items' }),
                    new Item({ ...Item.TEMPLATES.VEHICLE_YACHT_SMALL, obtainedFrom: 'Test Items' }),
                    new Item({ ...Item.TEMPLATES.XP_BOOST_LARGE, obtainedFrom: 'Test Items' }),
                    
                    // Epic items
                    new Item({ ...Item.TEMPLATES.CARD_BACK_DIAMOND, obtainedFrom: 'Test Items' }),
                    new Item({ ...Item.TEMPLATES.AVATAR_DRAGON, obtainedFrom: 'Test Items' }),
                    new Item({ ...Item.TEMPLATES.UNDERGROUND_PASS, obtainedFrom: 'Test Items' }),
                    new Item({ ...Item.TEMPLATES.XP_BOOST_MEGA, obtainedFrom: 'Test Items' }),
                    
                    // Legendary items
                    new Item({ ...Item.TEMPLATES.CARD_BACK_GOLDEN, obtainedFrom: 'Test Items' }),
                    new Item({ ...Item.TEMPLATES.CARD_BACK_HOLOGRAM, obtainedFrom: 'Test Items' }),
                    new Item({ ...Item.TEMPLATES.TABLE_SKIN_GOLD, obtainedFrom: 'Test Items' }),
                    new Item({ ...Item.TEMPLATES.CHIP_STYLE_PLATINUM, obtainedFrom: 'Test Items' }),
                    new Item({ ...Item.TEMPLATES.AVATAR_LEGEND, obtainedFrom: 'Test Items' }),
                    new Item({ ...Item.TEMPLATES.TROPHY_FINAL, obtainedFrom: 'Test Items' }),
                    new Item({ ...Item.TEMPLATES.YACHT_INVITATION, obtainedFrom: 'Test Items' }),
                    new Item({ ...Item.TEMPLATES.VEHICLE_YACHT_GOLD, obtainedFrom: 'Test Items' }),
                    new Item({ ...Item.TEMPLATES.VEHICLE_JET, obtainedFrom: 'Test Items' })
                ];
                
                    // Add all test items to inventory
                    for (const item of testItems) {
                        await userRepo.addItem(user.userId, item);
                    }
                    
                    // Get updated inventory
                    const inventory = await userRepo.getInventory(user.userId);
                    
                    // ROOT TRACING: Log test items completion with icon check
                    const itemsWithoutIcons = (inventory || []).filter(item => !item.icon || item.icon === 'default_item');
                    const itemsWithIcons = (inventory || []).filter(item => item.icon && item.icon !== 'default_item');
                    
                    gameLogger.gameEvent('SYSTEM', `[INVENTORY] GET_TEST_ITEMS_SUCCESS`, {
                        userId: user.userId,
                        username: user.profile?.username,
                        added: testItems.length,
                        total: inventory?.length || 0,
                        itemsWithIcons: itemsWithIcons.length,
                        itemsWithoutIcons: itemsWithoutIcons.length,
                        testItemIcons: testItems.map(item => ({
                            name: item.name,
                            icon: item.icon || 'MISSING',
                            templateId: item.templateId
                        }))
                    });
                    
                    // ROOT TRACING: Warn if test items missing icons
                    if (itemsWithoutIcons.length > 0) {
                        gameLogger.gameEvent('SYSTEM', `[INVENTORY] TEST_ITEMS_MISSING_ICONS`, {
                            userId: user.userId,
                            count: itemsWithoutIcons.length,
                            items: itemsWithoutIcons.map(item => ({
                                name: item.name,
                                templateId: item.templateId,
                                icon: item.icon || 'MISSING'
                            }))
                        });
                    }
                    
                    const response = { 
                        success: true, 
                        message: `Added ${testItems.length} test items to inventory`,
                        inventory 
                    };
                    
                    if (callback && typeof callback === 'function') {
                        callback(response);
                    }
                    socket.emit('get_test_items_response', response);
                } catch (error) {
                    // console.error(`[SocketHandler] [INVENTORY] GET_TEST_ITEMS_ERROR | userId: ${user.userId} | error: ${error.message}`, error);
                    gameLogger.gameEvent('SYSTEM', `[INVENTORY] GET_TEST_ITEMS_ERROR`, {
                        userId: user.userId,
                        username: user.profile?.username,
                        error: error.message,
                        stackTrace: error.stack
                    });
                    callback({ success: false, error: error.message });
                }
            });

            // ============ Item Ante View ============
            
            // View item ante (for players and spectators to see what's in the ante)
            socket.on('get_item_ante', (data, callback) => {
                const user = this.getAuthenticatedUser(socket);
                if (!user) {
                    if (callback && typeof callback === 'function') {
                        callback({ success: false, error: 'Not authenticated' });
                    }
                    return;
                }
                
                const player = this.gameManager.players.get(user.userId);
                if (!player?.currentTableId) {
                    if (callback && typeof callback === 'function') {
                        callback({ success: false, error: 'Not at a table' });
                    }
                    return;
                }
                
                const table = this.gameManager.getTable(player.currentTableId);
                if (!table) {
                    if (callback && typeof callback === 'function') {
                        callback({ success: false, error: 'Table not found' });
                    }
                    return;
                }
                
                // ROOT TRACING: Track item ante view request
                table._traceUniversal('ITEM_ANTE_VIEW', {
                    userId: user.userId,
                    username: user.profile?.username,
                    isSpectator: table.isSpectator(user.userId),
                    itemAnteEnabled: table.itemAnteEnabled,
                    itemAnteStatus: table.itemAnte?.status
                });
                
                const itemAnteState = table.getItemAnteState(user.userId);
                
                // ROOT TRACING: Log view result
                gameLogger.gameEvent(table.name, `[ITEM_ANTE] VIEW`, {
                    userId: user.userId,
                    username: user.profile?.username,
                    isSpectator: table.isSpectator(user.userId),
                    status: itemAnteState?.status || 'inactive',
                    approvedCount: itemAnteState?.approvedCount || 0,
                    totalValue: itemAnteState?.totalValue || 0
                });
                
                table._traceUniversalAfter('ITEM_ANTE_VIEW', {
                    success: !!itemAnteState,
                    status: itemAnteState?.status,
                    approvedCount: itemAnteState?.approvedCount || 0
                });
                
                if (callback && typeof callback === 'function') {
                    callback({ success: true, itemAnte: itemAnteState });
                }
                socket.emit('get_item_ante_response', { success: true, itemAnte: itemAnteState });
            });
            
            // Unity state reporting - Cerberus receives Unity UI/audio state
            socket.on('report_unity_state', (data) => {
                const user = this.getAuthenticatedUser(socket);
                const userId = user?.userId || 'unknown';
                
                // Get Cerberus UnityStateReporter if available
                // Cerberus is initialized by cerberus.ps1, so it may not always be available
                try {
                    const CerberusIntegration = require('../../monitoring/integration/CerberusIntegration');
                    // Check if there's a global instance or create one
                    // For now, we'll access it through a singleton pattern
                    // If cerberus.ps1 is running, it will have initialized Cerberus
                    const path = require('path');
                    const projectRoot = path.join(__dirname, '../..');
                    const cerberusIntegration = new CerberusIntegration(projectRoot, { startSyncLoop: false });
                    const unityStateReporter = cerberusIntegration.aiCore.getUnityStateReporter();
                    if (unityStateReporter) {
                        unityStateReporter.handleUnityStateReport(userId, data);
                    }
                } catch (error) {
                    // Cerberus not available - this is fine, just log to gameLogger
                    gameLogger.info('CERBERUS', '[UNITY_STATE] CERBERUS_NOT_AVAILABLE', {
                        userId,
                        message: 'Cerberus not initialized - Unity state reporting skipped'
                    });
                }
            });
            
            // Report icon loading issues from Unity client
            // Unity log capture - captures ALL Unity console logs
            socket.on('report_unity_log', (data) => {
                const user = this.getAuthenticatedUser(socket);
                const userId = user?.userId || 'unknown';
                const username = user?.profile?.username || 'unknown';
                
                // Use UnityLogHandler if available, otherwise log directly
                if (this.unityLogHandler) {
                    this.unityLogHandler.handleUnityLog(userId, username, data);
                } else {
                    // Fallback: log directly to gameLogger
                    const level = data.level || 'Log';
                    const logLevel = (level === 'Error' || level === 'Exception') ? 'ERROR' : 
                                    (level === 'Warning') ? 'WARNING' : 'GAME';
                    
                    gameLogger.writeLog(logLevel, 'UNITY_CLIENT', data.message || '', {
                        userId,
                        username,
                        level: data.level,
                        stackTrace: data.stackTrace,
                        context: data.context,
                        source: 'unity_console'
                    });
                    
                    // If error, also log as error for issue detection
                    if (level === 'Error' || level === 'Exception') {
                        gameLogger.error('UNITY_CLIENT', '[UNITY_ERROR]', {
                            userId,
                            username,
                            message: data.message,
                            stackTrace: data.stackTrace,
                            context: data.context
                        });
                    }
                }
            });
            
            socket.on('report_icon_issue', (data) => {
                const user = this.getAuthenticatedUser(socket);
                const userId = user?.userId || 'unknown';
                const username = user?.profile?.username || 'unknown';
                
                // ROOT TRACING: Log icon loading issues for monitoring
                gameLogger.gameEvent('UNITY_CLIENT', `[ICON_LOADING] ISSUE_REPORTED`, {
                    userId,
                    username,
                    operation: data.operation || 'unknown',
                    itemName: data.itemName || null,
                    iconName: data.iconName || null,
                    attemptedPath1: data.attemptedPath1 || null,
                    attemptedPath2: data.attemptedPath2 || null,
                    error: data.error || null,
                    totalItems: data.totalItems || null,
                    itemsWithIcons: data.itemsWithIcons || null,
                    itemsWithoutIcons: data.itemsWithoutIcons || null,
                    missingIconItems: data.missingIconItems || null,
                    rarity: data.rarity || null,
                    value: data.value || null,
                    fullData: data
                });
            });
            
            // ============ Lobby ============
            
            socket.on('get_tables', (data, callback) => {
                const tables = this.gameManager.getPublicTableList();
                const response = { success: true, tables };
                if (callback) callback(response);
                socket.emit('get_tables_response', response);
            });

            socket.on('create_table', async (data, callback) => {
                try {
                    const user = this.getAuthenticatedUser(socket);
                    if (!user) {
                        gameLogger.error('SYSTEM', '[TABLE] CREATE_FAILED', { error: 'Not authenticated' });
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

                    // Fetch minimum ante item if provided
                    let minimumAnteItem = null;
                    if (data.minimumAnteItemId && data.itemAnteEnabled) {
                        try {
                            const inventoryRepo = require('../repositories/InventoryRepository');
                            const itemData = await inventoryRepo.getById(data.minimumAnteItemId);
                            if (itemData && itemData.user_id === user.userId && itemData.is_gambleable) {
                                const Item = require('../models/Item');
                                minimumAnteItem = new Item({
                                    id: itemData.id,
                                    templateId: itemData.template_id,
                                    name: itemData.name,
                                    description: itemData.description,
                                    type: itemData.item_type,
                                    rarity: itemData.rarity,
                                    icon: itemData.icon,
                                    uses: itemData.uses_remaining,
                                    maxUses: itemData.max_uses,
                                    baseValue: itemData.base_value,
                                    powerScore: itemData.power_score,
                                    source: itemData.source,
                                    dropRate: itemData.drop_rate,
                                    demand: itemData.demand,
                                    obtainedAt: itemData.obtained_at,
                                    obtainedFrom: itemData.obtained_from,
                                    isTradeable: itemData.is_tradeable,
                                    isGambleable: itemData.is_gambleable
                                });
                                gameLogger.info(user.userId, '[TABLE] MINIMUM_ANTE_ITEM_SELECTED', {
                                    itemId: minimumAnteItem.id,
                                    itemName: minimumAnteItem.name,
                                    powerScore: minimumAnteItem.powerScore
                                });
                            } else {
                                gameLogger.warn(user.userId, '[TABLE] INVALID_MINIMUM_ANTE_ITEM', {
                                    itemId: data.minimumAnteItemId,
                                    reason: !itemData ? 'not found' : itemData.user_id !== user.userId ? 'not owned' : 'not gambleable'
                                });
                            }
                        } catch (err) {
                            gameLogger.error(user.userId, '[TABLE] FETCH_MINIMUM_ANTE_ITEM_ERROR', { error: err.message });
                        }
                    }

                    const table = this.gameManager.createTable({
                        ...data,
                        creatorId: user.userId,
                        minimumAnteItem: minimumAnteItem // Pass the full Item object
                    });
                    
                    // Set up table callbacks for state broadcasting
                    try {
                        this.setupTableCallbacks(table);
                    } catch (err) {
                        gameLogger.error('SYSTEM', '[TABLE] SETUP_CALLBACKS_ERROR', { error: err.message, stack: err.stack });
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
                        gameLogger.error('SYSTEM', '[TABLE] GET_STATE_ERROR', { error: err.message, stack: err.stack });
                        state = { id: table.id, name: table.name, phase: 'waiting' };
                    }
                    
                    try {
                        publicInfo = table.getPublicInfo();
                    } catch (err) {
                        gameLogger.error('SYSTEM', '[TABLE] GET_PUBLIC_INFO_ERROR', { error: err.message, stack: err.stack });
                        publicInfo = { id: table.id, name: table.name, maxPlayers: table.maxPlayers };
                    }
                    
                    const response = { 
                        success: true, 
                        tableId: table.id, 
                        table: publicInfo,
                        seatIndex: joinResult.success ? joinResult.seatIndex : -1,
                        state 
                    };
                    
                    if (callback) {
                        try {
                            callback(response);
                        } catch (err) {
                            gameLogger.error('SYSTEM', '[TABLE] CALLBACK_ERROR', { error: err.message, stack: err.stack });
                        }
                    }
                    try {
                        socket.emit('create_table_response', response);
                    } catch (err) {
                        gameLogger.error('SYSTEM', '[TABLE] EMIT_ERROR', { error: err.message, stack: err.stack });
                    }
                    
                    // Broadcast new table to lobby
                    setImmediate(() => {
                        try {
                            this.io.emit('table_created', publicInfo);
                        } catch (err) {
                            gameLogger.error('SYSTEM', '[TABLE] BROADCAST_ERROR', { error: err.message, stack: err.stack });
                        }
                    });
                } catch (error) {
                    gameLogger.error('SYSTEM', '[TABLE] CREATE_EXCEPTION', { error: error.message, stack: error.stack });
                    const errorResponse = { success: false, error: `Server error: ${error.message}` };
                    if (callback) {
                        try {
                            callback(errorResponse);
                        } catch (err) {
                            gameLogger.error('SYSTEM', '[TABLE] ERROR_CALLBACK_FAILED', { error: err.message, stack: err.stack });
                        }
                    }
                    try {
                        socket.emit('create_table_response', errorResponse);
                    } catch (err) {
                        gameLogger.error('SYSTEM', '[TABLE] ERROR_EMIT_FAILED', { error: err.message, stack: err.stack });
                    }
                }
            });

            // ============ Simulation Mode ============
            
            socket.on('start_simulation', async (data, callback) => {
                try {
                    const user = this.getAuthenticatedUser(socket);
                    
                    if (!user) {
                        const error = { success: false, error: 'Not authenticated' };
                        gameLogger.error('SYSTEM', '[SIMULATION] START_FAILED', { error: 'Not authenticated' });
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
                        socketBotRatio = 0.5,
                        itemAnteEnabled = false,
                        itemAnteCollectionTime = 60000
                    } = data;
                    
                    const result = await this.simulationManager.startSimulation({
                        creatorId: user.userId,
                        tableName,
                        maxPlayers: Math.min(Math.max(maxPlayers, 3), 9),
                        smallBlind,
                        bigBlind,
                        buyIn,
                        turnTimeLimit,
                        blindIncreaseInterval,
                        socketBotRatio: Math.min(Math.max(socketBotRatio, 0), 1),
                        itemAnteEnabled: !!itemAnteEnabled,
                        itemAnteCollectionTime: itemAnteCollectionTime || 60000
                    });
                    
                    if (result.success) {
                        const simTable = this.gameManager.getTable(result.tableId);
                        if (!simTable) {
                            gameLogger.error('SYSTEM', '[SIMULATION] START_FAILED', { error: `Table ${result.tableId} not found in GameManager`, userId: user.userId });
                            const errorResponse = { success: false, error: `Table ${result.tableId} was not created` };
                            if (callback) callback(errorResponse);
                            socket.emit('start_simulation_response', errorResponse);
                            return;
                        }
                        
                        try {
                            this.setupTableCallbacks(simTable);
                        } catch (err) {
                            gameLogger.error('SYSTEM', '[SIMULATION] CALLBACKS_SETUP_ERROR', { tableId: result.tableId, error: err.message, stack: err.stack });
                        }
                        
                        try {
                            simTable.addSpectator(user.userId, user.profile?.username || 'Creator', socket.id);
                            socket.join(`table:${result.tableId}`);
                            socket.join(`spectator:${result.tableId}`);
                        } catch (err) {
                            gameLogger.error('SYSTEM', '[SIMULATION] ADD_SPECTATOR_ERROR', { tableId: result.tableId, userId: user.userId, error: err.message });
                        }
                        
                        let state, publicInfo;
                        try {
                            state = simTable.getState(user.userId);
                            publicInfo = simTable.getPublicInfo();
                        } catch (err) {
                            gameLogger.error('SYSTEM', '[SIMULATION] GET_STATE_ERROR', { tableId: result.tableId, error: err.message });
                            state = { id: simTable.id, name: simTable.name, phase: 'waiting' };
                            publicInfo = { id: simTable.id, name: simTable.name, maxPlayers: simTable.maxPlayers };
                        }
                        
                        const response = {
                            success: true,
                            tableId: result.tableId,
                            table: publicInfo,
                            state,
                            regularBots: result.regularBots || 0,
                            socketBots: result.socketBots || 0,
                            status: result.status || 'spawning',
                            settings: result.settings || {}
                        };
                        
                        if (callback) {
                            try {
                                callback(response);
                            } catch (err) {
                                gameLogger.error('SYSTEM', '[SIMULATION] CALLBACK_ERROR', { tableId: result.tableId, error: err.message });
                            }
                        }
                        try {
                            socket.emit('start_simulation_response', response);
                        } catch (err) {
                            gameLogger.error('SYSTEM', '[SIMULATION] EMIT_ERROR', { tableId: result.tableId, error: err.message });
                        }
                    } else {
                        gameLogger.error('SYSTEM', '[SIMULATION] START_FAILED', { userId: user.userId, error: result.error });
                        if (callback) callback(result);
                        socket.emit('start_simulation_response', result);
                    }
                } catch (error) {
                    gameLogger.error('SYSTEM', '[SIMULATION] START_EXCEPTION', { error: error.message, stack: error.stack });
                    const errorResponse = { success: false, error: `Server error: ${error.message}` };
                    if (callback) {
                        try {
                            callback(errorResponse);
                        } catch (err) {
                            gameLogger.error('SYSTEM', '[SIMULATION] CALLBACK_ERROR', { error: err.message });
                        }
                    }
                    try {
                        socket.emit('start_simulation_response', errorResponse);
                    } catch (err) {
                        gameLogger.error('SYSTEM', '[SIMULATION] EMIT_ERROR', { error: err.message });
                    }
                }
            });
            
            socket.on('pause_simulation', (data, callback) => {
                const user = this.getAuthenticatedUser(socket);
                if (!user) {
                    const error = { success: false, error: 'Not authenticated' };
                    if (callback) callback(error);
                    socket.emit('pause_simulation_response', error);
                    return;
                }
                
                const { tableId, reason = 'manual_pause' } = data || {};
                if (!tableId) {
                    const error = { success: false, error: 'tableId required' };
                    if (callback) callback(error);
                    socket.emit('pause_simulation_response', error);
                    return;
                }
                
                const result = this.simulationManager.pauseSimulation(tableId, reason);
                if (callback) callback(result);
                socket.emit('pause_simulation_response', result);
            });
            
            socket.on('resume_simulation', (data, callback) => {
                const user = this.getAuthenticatedUser(socket);
                if (!user) {
                    const error = { success: false, error: 'Not authenticated' };
                    if (callback) callback(error);
                    socket.emit('resume_simulation_response', error);
                    return;
                }
                
                const { tableId } = data || {};
                if (!tableId) {
                    const error = { success: false, error: 'tableId required' };
                    if (callback) callback(error);
                    socket.emit('resume_simulation_response', error);
                    return;
                }
                
                const result = this.simulationManager.resumeSimulation(tableId);
                if (callback) callback(result);
                socket.emit('resume_simulation_response', result);
            });
            
            socket.on('stop_simulation', (data, callback) => {
                const user = this.getAuthenticatedUser(socket);
                if (!user) {
                    const error = { success: false, error: 'Not authenticated' };
                    if (callback) callback(error);
                    return;
                }
                
                const { tableId } = data;
                const result = this.simulationManager.stopSimulation(tableId);
                
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
                        
                        // Load crew tag, active title, active character, and karma for display at table
                        try {
                            const CrewManager = require('../social/CrewManager');
                            const TitleEngine = require('../stats/TitleEngine');
                            const CharacterSystem = require('../game/CharacterSystem');
                            const UserRepository = require('../database/UserRepository');
                            const charSystem = new CharacterSystem(require('../database/Database'));
                            const userRepo = new UserRepository();
                            const seat = table.seats[result.seatIndex];
                            if (seat) {
                                const [crewTag, activeTitle, activeChar, karma] = await Promise.all([
                                    CrewManager.getPlayerCrewTag(user.userId).catch(() => null),
                                    TitleEngine.getActiveTitle(user.userId).catch(() => null),
                                    charSystem.getActiveCharacter(user.userId).catch(() => ({ id: 'shadow_hacker', sprite_set: 'char_shadow_hacker' })),
                                    userRepo.getKarma(user.userId).catch(() => 100)
                                ]);
                                seat.crewTag = crewTag;
                                seat.activeTitle = activeTitle?.title_name || null;
                                seat.activeCharacter = activeChar?.id || 'shadow_hacker';
                                seat.characterSpriteSet = activeChar?.sprite_set || 'char_shadow_hacker';
                                seat.karma = karma;
                                seat.heartColor = UserRepository.getHeartColor(karma);
                            }
                        } catch (e) {
                            // Non-critical — don't block join
                        }
                        
                        socket.join(`table:${tableId}`);
                        
                        socket.to(`table:${tableId}`).emit('player_joined', {
                            userId: user.userId,
                            name: user.profile.username,
                            seatIndex: result.seatIndex
                        });

                        // Start a player session
                        try {
                            const { v4: uuidv4 } = require('uuid');
                            const database = require('../database/Database');
                            if (database.isConnected) {
                                const sessionId = uuidv4();
                                await database.query(`
                                    INSERT INTO player_sessions (session_id, player_id, table_id, chips_start)
                                    VALUES (?, ?, ?, ?)
                                `, [sessionId, user.userId, tableId, dbUser.chips]);
                                // Store session ID on the player object for later use
                                const playerObj = this.gameManager.players.get(user.userId);
                                if (playerObj) playerObj.currentSessionId = sessionId;
                            }
                        } catch (sessionErr) {
                            // Non-critical — don't block join
                        }

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
                    gameLogger.error('SYSTEM', '[TABLE] LEAVE_FAILED', { error: 'Not authenticated' });
                    return respond({ success: false, error: 'Not authenticated' });
                }
                
                const player = this.gameManager.players.get(user.userId);
                let tableId = player?.currentTableId;
                let table = tableId ? this.gameManager.getTable(tableId) : null;
                
                // CRITICAL FIX: If currentTableId is not set, search all tables to find if user is a spectator
                // This handles cases where the creator or spectator's currentTableId wasn't set properly
                if (!tableId || !table) {
                    // Search all tables to find if user is a spectator
                    for (const [tid, t] of this.gameManager.tables) {
                        if (t.isSpectator(user.userId)) {
                            tableId = tid;
                            table = t;
                            break;
                        }
                        // Also check if user is the creator (even if not in a seat or as spectator)
                        if (t.creatorId === user.userId && !tableId) {
                            tableId = tid;
                            table = t;
                            break;
                        }
                    }
                }
                
                // Check if spectating (either found via currentTableId or by searching)
                if (table && table.isSpectator(user.userId)) {
                    table.removeSpectator(user.userId);
                    socket.leave(`table:${tableId}`);
                    socket.leave(`spectator:${tableId}`);
                    socket.to(`table:${tableId}`).emit('spectator_left', { userId: user.userId });
                    
                    // Clear spectator's table tracking
                    if (player) {
                        player.currentTableId = null;
                        player.isSpectating = false;
                    }
                    
                    return respond({ success: true });
                }
                
                // Check if user is in a seat (regular player)
                if (tableId && table) {
                    // Capture chips before leaving for session tracking
                    const chipsAtLeave = player?.chips || 0;

                    const result = this.gameManager.leaveTable(user.userId);
                    
                    if (result.success) {
                        // Save chips back to database
                        if (player) {
                            await userRepo.setChips(user.userId, player.chips);
                        }
                        
                        // End player session
                        try {
                            const database = require('../database/Database');
                            if (database.isConnected && player?.currentSessionId) {
                                await database.query(`
                                    UPDATE player_sessions 
                                    SET end_time = CURRENT_TIMESTAMP,
                                        chips_end = ?,
                                        profit_loss = ? - chips_start
                                    WHERE session_id = ? AND player_id = ?
                                `, [chipsAtLeave, chipsAtLeave, player.currentSessionId, user.userId]);

                                // Also update player_stats sessions_played count
                                await database.query(`
                                    UPDATE player_stats SET sessions_played = sessions_played + 1,
                                        total_play_time_seconds = total_play_time_seconds + 
                                            TIMESTAMPDIFF(SECOND, 
                                                (SELECT start_time FROM player_sessions WHERE session_id = ?),
                                                CURRENT_TIMESTAMP
                                            )
                                    WHERE player_id = ?
                                `, [player.currentSessionId, user.userId]).catch(() => {});

                                player.currentSessionId = null;
                            }
                        } catch (sessionErr) {
                            // Non-critical
                        }
                        
                        socket.leave(`table:${tableId}`);
                        socket.leave(`spectator:${tableId}`);
                        socket.to(`table:${tableId}`).emit('player_left', {
                            userId: user.userId
                        });
                    } else {
                        gameLogger.error('SYSTEM', '[TABLE] LEAVE_FAILED', { userId: user.userId, tableId, error: result.error });
                    }
                    
                    return respond(result);
                }
                
                // If we get here, user is not at any table
                gameLogger.error('SYSTEM', '[TABLE] LEAVE_FAILED', { userId: user.userId, error: 'User is not at any table' });
                return respond({ success: false, error: 'Not at a table' });
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
                console.log(`[SocketHandler] start_game received: socketId=${socket.id}, tableId=${data?.tableId}, hasCallback=${!!callback}`);
                const respond = (response) => {
                    console.log(`[SocketHandler] start_game respond: Emitting start_game_response to socket ${socket.id}`);
                    // Always emit response event (Unity listens for this)
                    socket.emit('start_game_response', response);
                    // Also call callback if provided
                    if (callback && typeof callback === 'function') {
                        callback(response);
                    }
                };
                
                const user = this.getAuthenticatedUser(socket);
                if (!user) {
                    gameLogger.error('SYSTEM', '[TABLE] START_GAME_FAILED', { error: 'Not authenticated' });
                    return respond({ success: false, error: 'Not authenticated' });
                }
                
                const { tableId } = data;
                
                const table = this.gameManager.getTable(tableId);
                
                if (!table) {
                    gameLogger.error('SYSTEM', '[TABLE] START_GAME_FAILED', { userId: user.userId, tableId, error: 'Table not found' });
                    return respond({ success: false, error: 'Table not found' });
                }
                
                const result = table.startReadyUp(user.userId);
                
                if (result.success) {
                    // Broadcast ready prompt to all players
                    this.io.to(`table:${tableId}`).emit('ready_prompt', {
                        tableId: tableId,
                        timeLimit: table.readyUpDuration / 1000 // in seconds
                    });
                    
                    // Broadcast updated state
                    this.broadcastTableState(tableId);
                } else {
                    gameLogger.error('SYSTEM', '[TABLE] START_GAME_FAILED', { userId: user.userId, tableId, error: result.error });
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
                console.log(`[SocketHandler] invite_bot received: socketId=${socket.id}, tableId=${data?.tableId}, hasCallback=${!!callback}`);
                gameLogger.info('SYSTEM', '[BOT_INVITE] RECEIVED', { socketId: socket.id, tableId: data?.tableId, hasCallback: !!callback });
                const respond = (response) => {
                    // Always emit response event (Unity listens for this)
                    socket.emit('invite_bot_response', response);
                    // Also call callback if provided
                    if (callback && typeof callback === 'function') {
                        callback(response);
                    }
                };
                
                const user = this.getAuthenticatedUser(socket);
                if (!user) {
                    console.log(`[SocketHandler] invite_bot: Not authenticated, socketId=${socket.id}`);
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
                        this.io.to(`table:${tableId}`).emit('bot_invite_pending', {
                            seatIndex: result.seatIndex,
                            botName: result.bot.name,
                            botPersonality: result.bot.personality,
                            invitedBy: user.username,
                            approvalsNeeded: result.approvalsNeeded
                        });
                    } else {
                        // Auto-approved (only creator at table)
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
                        this.broadcastTableState(tableId);
                        
                        // CRITICAL: Check if bots need to submit items for item ante
                        const table = this.gameManager.getTable(tableId);
                        if (table && table.practiceMode && table.itemAnteEnabled && table.itemAnte && !table.gameStarted) {
                            this.gameManager.botManager.checkBotsItemAnte(tableId);
                        }
                        
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
            
            // Invite a socket bot to a practice table (for testing)
            socket.on('invite_socket_bot', async (data, callback) => {
                console.log(`[SocketHandler] invite_socket_bot received: socketId=${socket.id}, tableId=${data?.tableId}, hasCallback=${!!callback}, data=${JSON.stringify(data)}`);
                gameLogger.info('SYSTEM', '[SOCKET_BOT_INVITE] RECEIVED', { socketId: socket.id, tableId: data?.tableId, hasCallback: !!callback });
                console.log(`[SocketHandler] invite_socket_bot received: tableId=${data?.tableId}, hasCallback=${!!callback}`);
                
                const respond = (response) => {
                    console.log(`[SocketHandler] invite_socket_bot respond: success=${response.success}, botName=${response.botName}, error=${response.error}`);
                    console.log(`[SocketHandler] invite_socket_bot respond: Emitting invite_socket_bot_response to socket ${socket.id}`);
                    // Always emit response event (Unity listens for this)
                    socket.emit('invite_socket_bot_response', response);
                    console.log(`[SocketHandler] invite_socket_bot respond: Response event emitted`);
                    // Also call callback if provided
                    if (callback && typeof callback === 'function') {
                        console.log(`[SocketHandler] invite_socket_bot respond: Calling callback`);
                        callback(response);
                    } else {
                        console.log(`[SocketHandler] invite_socket_bot respond: No callback provided`);
                    }
                };
                
                const user = this.getAuthenticatedUser(socket);
                if (!user) {
                    console.log(`[SocketHandler] invite_socket_bot: Not authenticated, socketId=${socket.id}`);
                    console.log(`[SocketHandler] invite_socket_bot: socketToUser map has ${this.socketToUser.size} entries`);
                    console.log(`[SocketHandler] invite_socket_bot: authenticatedUsers map has ${this.authenticatedUsers.size} entries`);
                    return respond({ success: false, error: 'Not authenticated' });
                }
                
                const { tableId } = data;
                if (!tableId) {
                    console.log(`[SocketHandler] invite_socket_bot: No tableId provided`);
                    return respond({ success: false, error: 'Table ID required' });
                }
                
                const table = this.gameManager.getTable(tableId);
                
                if (!table) {
                    console.log(`[SocketHandler] invite_socket_bot: Table not found: ${tableId}`);
                    return respond({ success: false, error: 'Table not found' });
                }
                
                // Only allow socket bots in practice mode tables
                if (!table.practiceMode) {
                    console.log(`[SocketHandler] invite_socket_bot: Table is not practice mode`);
                    return respond({ success: false, error: 'Socket bots can only be added to practice tables' });
                }
                
                // Only table creator can invite socket bots
                if (table.creatorId !== user.userId) {
                    console.log(`[SocketHandler] invite_socket_bot: User ${user.userId} is not creator ${table.creatorId}`);
                    return respond({ success: false, error: 'Only the table creator can invite socket bots' });
                }
                
                // Can't add bots after game started
                if (table.gameStarted) {
                    console.log(`[SocketHandler] invite_socket_bot: Game already started`);
                    return respond({ success: false, error: 'Cannot add bots after game has started' });
                }
                
                // Check if table is full
                const emptySeat = table.seats.findIndex(s => s === null);
                if (emptySeat === -1) {
                    console.log(`[SocketHandler] invite_socket_bot: Table is full`);
                    return respond({ success: false, error: 'Table is full' });
                }
                
                // Create and add socket bot
                try {
                    console.log(`[SocketHandler] Creating socket bot for table ${tableId}`);
                    const { SocketBot } = require('../testing/SocketBot');
                    const bot = new SocketBot({
                        serverUrl: `http://localhost:${process.env.PORT || 3000}`,
                        name: `NetPlayer_${Date.now()}`,
                        minDelay: 800,
                        maxDelay: 2500,
                        aggressiveness: 0.6 + Math.random() * 0.3,
                        fastMode: false,
                        networkLatency: 80,
                        latencyJitter: 50,
                        disconnectChance: 0.01,
                        reconnectMinTime: 3000,
                        reconnectMaxTime: 15000,
                        enableChaos: false
                    });
                    
                    console.log(`[SocketHandler] Connecting socket bot ${bot.name}...`);
                    await bot.connect();
                    console.log(`[SocketHandler] Registering socket bot ${bot.name}...`);
                    await bot.register();
                    console.log(`[SocketHandler] Joining socket bot ${bot.name} to table ${tableId}...`);
                    await bot.joinTable(tableId, table.buyIn);
                    
                    console.log(`[SocketHandler] Socket bot ${bot.name} joined practice table ${table.name} at seat ${bot.seatIndex}`);
                    
                    // Broadcast state update (this will trigger checkBotsItemAnte via onStateChange)
                    this.broadcastTableState(tableId);
                    
                    // Also manually check bots item ante in case state change didn't trigger it
                    if (table.practiceMode && table.itemAnteEnabled && table.itemAnte) {
                        this.gameManager.botManager.checkBotsItemAnte(tableId);
                    }
                    
                    const response = { 
                        success: true, 
                        botName: bot.name,
                        seatIndex: bot.seatIndex 
                    };
                    console.log(`[SocketHandler] Sending success response for socket bot: ${JSON.stringify(response)}`);
                    respond(response);
                } catch (error) {
                    console.error(`[SocketHandler] Failed to add socket bot:`, error);
                    gameLogger.error('SYSTEM', '[SOCKET_BOT_INVITE] FAILED', { tableId, userId: user.userId, error: error.message, stack: error.stack });
                    respond({ success: false, error: `Failed to add socket bot: ${error.message}` });
                }
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
                    gameLogger.error('SYSTEM', '[FRIENDS] GET_REQUESTS_ERROR', { userId: user.userId, error: error.message, stack: error.stack });
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
                
                // ROOT TRACING: Log item ante start attempt (commented out - use gameLogger for tracing)
                // console.log(`[SocketHandler] [ITEM_ANTE] START_ATTEMPT | userId: ${user.userId} | tableId: ${player.currentTableId} | itemId: ${data.itemId} | itemFound: ${!!item}`);
                
                if (!item) {
                    // console.error(`[SocketHandler] [ITEM_ANTE] START_FAILED | userId: ${user.userId} | error: ITEM_NOT_FOUND | itemId: ${data.itemId}`);
                    gameLogger.gameEvent(player.currentTableId, `[ITEM_ANTE] START_FAILED`, {
                        userId: user.userId,
                        tableId: player.currentTableId,
                        error: 'ITEM_NOT_FOUND',
                        itemId: data.itemId
                    });
                    return callback({ success: false, error: 'Item not found in inventory' });
                }

                const result = table.startItemAnte(user.userId, item);
                
                // Log item ante start result
                console.log(`[ITEM_ANTE] START: userId=${user.userId}, tableId=${player.currentTableId}, success=${result.success}, itemName=${item.name}, itemValue=${item.baseValue}, minimumValue=${result.minimumValue || 'N/A'}, error=${result.error || 'none'}`);
                
                if (result.success) {
                    // CRITICAL: Send formatted item with ALL fields Unity needs (templateId, etc.)
                    const itemAnteState = table.getItemAnteState();
                    const formattedCreatorItem = itemAnteState?.creatorItem || (result.itemAnte.firstItem ? {
                        id: result.itemAnte.firstItem.id || '',
                        templateId: result.itemAnte.firstItem.templateId || '',
                        name: result.itemAnte.firstItem.name || 'Unknown Item',
                        description: result.itemAnte.firstItem.description || '',
                        rarity: result.itemAnte.firstItem.rarity || 'common',
                        type: result.itemAnte.firstItem.type || 'special',
                        icon: result.itemAnte.firstItem.icon || 'default_item',
                        baseValue: result.itemAnte.firstItem.baseValue || 0,
                        isGambleable: result.itemAnte.firstItem.isGambleable !== false,
                        isTradeable: result.itemAnte.firstItem.isTradeable !== false,
                        obtainedFrom: result.itemAnte.firstItem.obtainedFrom || ''
                    } : null);
                    
                    // SYSTEMATIC DEBUG: Log what we're sending to Unity
                    gameLogger.gameEvent(player.currentTableId, `[ITEM_ANTE] SIDE_POT_STARTED_EMIT`, {
                        creatorId: user.userId,
                        creatorItemHasTemplateId: !!formattedCreatorItem?.templateId,
                        creatorItemIcon: formattedCreatorItem?.icon,
                        creatorItemFields: formattedCreatorItem ? Object.keys(formattedCreatorItem) : []
                    });
                    
                    // Broadcast item ante started to all players (keeping old event name for backward compatibility)
                    this.io.to(`table:${player.currentTableId}`).emit('side_pot_started', {
                        creatorId: user.userId,
                        creatorItem: formattedCreatorItem,  // FIX: Send formatted item with all fields
                        minimumValue: result.minimumValue,  // New: minimum value required
                        collectionEndTime: result.itemAnte.collectionEndTime
                    });
                }

                // CRITICAL: Unity client expects BOTH callback AND response event
                if (callback && typeof callback === 'function') {
                    callback(result);
                }
                socket.emit('start_side_pot_response', result);
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
                
                // ROOT TRACING: Log item ante submission attempt (commented out - use gameLogger for tracing)
                // console.log(`[SocketHandler] [ITEM_ANTE] SUBMIT_ATTEMPT | userId: ${user.userId} | tableId: ${player.currentTableId} | itemId: ${data.itemId} | itemFound: ${!!item}`);
                
                if (!item) {
                    // console.error(`[SocketHandler] [ITEM_ANTE] SUBMIT_FAILED | userId: ${user.userId} | error: ITEM_NOT_FOUND | itemId: ${data.itemId}`);
                    gameLogger.gameEvent(player.currentTableId, `[ITEM_ANTE] SUBMIT_FAILED`, {
                        userId: user.userId,
                        tableId: player.currentTableId,
                        error: 'ITEM_NOT_FOUND',
                        itemId: data.itemId
                    });
                    return callback({ success: false, error: 'Item not found in inventory' });
                }

                const result = table.submitToItemAnte(user.userId, item);
                
                // Log item ante submission result
                console.log(`[ITEM_ANTE] SUBMIT: userId=${user.userId}, tableId=${player.currentTableId}, success=${result.success}, itemName=${item.name}, itemValue=${item.baseValue}, minimumValue=${result.minimumValue || 'N/A'}, error=${result.error || 'none'}`);
                
                if (result.success) {
                    // Notify table creator of new submission (keeping old event name for backward compatibility)
                    const creatorAuth = this.authenticatedUsers.get(table.creatorId);
                    if (creatorAuth) {
                        // CRITICAL: Send formatted item with ALL fields Unity needs (templateId, etc.)
                        const formattedItem = {
                            id: item.id || '',
                            templateId: item.templateId || '',  // CRITICAL: Unity needs this for sprites
                            name: item.name || 'Unknown Item',
                            description: item.description || '',
                            rarity: item.rarity || 'common',
                            type: item.type || 'special',
                            icon: item.icon || 'default_item',
                            baseValue: item.baseValue || 0,
                            isGambleable: item.isGambleable !== false,
                            isTradeable: item.isTradeable !== false,
                            obtainedFrom: item.obtainedFrom || ''
                        };
                        
                        // SYSTEMATIC DEBUG: Log what we're sending
                        gameLogger.gameEvent(player.currentTableId, `[ITEM_ANTE] SIDE_POT_SUBMISSION_EMIT`, {
                            userId: user.userId,
                            itemHasTemplateId: !!formattedItem.templateId,
                            itemIcon: formattedItem.icon,
                            itemFields: Object.keys(formattedItem)
                        });
                        
                        this.io.to(creatorAuth.socketId).emit('side_pot_submission', {
                            userId: user.userId,
                            username: user.profile.username,
                            item: formattedItem  // FIX: Send formatted item with all fields
                        });
                    }
                }

                // CRITICAL: Unity client expects BOTH callback AND response event
                if (callback && typeof callback === 'function') {
                    callback(result);
                }
                socket.emit('submit_to_side_pot_response', result);
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

                const result = table.optOutOfItemAnte(user.userId);
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

                const result = table.approveItemAnteItem(user.userId, data.userId);
                
                if (result.success) {
                    // Notify all players of approval (keeping old event name for backward compatibility)
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

                const result = table.declineItemAnteItem(user.userId, data.userId);
                
                if (result.success) {
                    // Notify the declined player (keeping old event name for backward compatibility)
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
                    
                    // Roll for character drop on boss victory (10% boss, 5% normal)
                    try {
                        const CharacterSystem = require('../game/CharacterSystem');
                        const charSystem = new CharacterSystem(require('../database/Database'));
                        const isBoss = result.encounter?.type === 'boss' || result.isBossDefeat;
                        const charDrop = charSystem.rollCharacterDrop(isBoss ? 0.15 : 0.05);
                        if (charDrop) {
                            const grantResult = await charSystem.grantCharacter(user.userId, charDrop, isBoss ? 'boss_drop' : 'adventure_drop');
                            if (grantResult.success) {
                                socket.emit('character_drop', {
                                    character: grantResult.character || { id: charDrop, name: charDrop },
                                    duplicate: grantResult.duplicate || false,
                                    compensation: grantResult.compensation || 0,
                                    message: grantResult.message || `New character unlocked: ${grantResult.character?.name}!`
                                });
                            }
                        }
                    } catch (e) {
                        // Non-critical — don't block victory flow
                        console.log('[CharacterDrop] Error rolling character drop:', e.message);
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
                    gameLogger.error('SYSTEM', '[LEADERBOARD] ERROR', { userId: user.userId, error: error.message, stack: error.stack });
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
                    gameLogger.error('SYSTEM', '[DAILY_REWARD] ERROR', { userId: user.userId, error: error.message, stack: error.stack });
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
                    
                    gameLogger.gameEvent('SYSTEM', `[DAILY_REWARD] CLAIMED`, { userId: user.userId, username: user.username, day: newStreak, chips: reward.chips, xp: reward.xp });
                    
                    respond({
                        success: true,
                        chipsAwarded: reward.chips,
                        xpAwarded: reward.xp,
                        gemsAwarded: reward.gems || 0,
                        bonusItem: reward.bonus || null,
                        newStreak
                    });
                } catch (error) {
                    gameLogger.error('SYSTEM', '[DAILY_REWARD] CLAIM_ERROR', { userId: user.userId, error: error.message, stack: error.stack });
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
                    gameLogger.error('SYSTEM', '[ACHIEVEMENTS] ERROR', { userId: user.userId, error: error.message, stack: error.stack });
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
                    
                    gameLogger.gameEvent('SYSTEM', `[ACHIEVEMENT] UNLOCKED`, { userId: user.userId, username: user.username, achievementId });
                    
                    respond({
                        success: true,
                        achievementId,
                        xpAwarded: result.xpReward || 0
                    });
                } catch (error) {
                    gameLogger.error('SYSTEM', '[ACHIEVEMENT] ERROR', { userId: user.userId, error: error.message, stack: error.stack });
                    respond({ success: false, error: 'Failed to unlock achievement' });
                }
            });

            // ============ Stats & Titles ============

            socket.on('get_player_stats', async (data, callback) => {
                const respond = this._makeResponder(socket, 'get_player_stats', callback);
                try {
                    const StatsEngine = require('../stats/StatsEngine');
                    const targetId = data?.playerId || this.getAuthenticatedUser(socket)?.userId;
                    if (!targetId) return respond({ success: false, error: 'Not authenticated' });
                    const stats = await StatsEngine.getPlayerStats(targetId);
                    respond({ success: true, stats });
                } catch (error) {
                    respond({ success: false, error: error.message });
                }
            });

            socket.on('get_hand_type_stats', async (data, callback) => {
                const respond = this._makeResponder(socket, 'get_hand_type_stats', callback);
                try {
                    const StatsEngine = require('../stats/StatsEngine');
                    const targetId = data?.playerId || this.getAuthenticatedUser(socket)?.userId;
                    if (!targetId) return respond({ success: false, error: 'Not authenticated' });
                    const handTypes = await StatsEngine.getHandTypeStats(targetId);
                    respond({ success: true, handTypes });
                } catch (error) {
                    respond({ success: false, error: error.message });
                }
            });

            socket.on('get_pocket_stats', async (data, callback) => {
                const respond = this._makeResponder(socket, 'get_pocket_stats', callback);
                try {
                    const StatsEngine = require('../stats/StatsEngine');
                    const targetId = data?.playerId || this.getAuthenticatedUser(socket)?.userId;
                    if (!targetId) return respond({ success: false, error: 'Not authenticated' });
                    const pockets = await StatsEngine.getPocketStats(targetId);
                    respond({ success: true, pockets });
                } catch (error) {
                    respond({ success: false, error: error.message });
                }
            });

            socket.on('get_hand_history', async (data, callback) => {
                const respond = this._makeResponder(socket, 'get_hand_history', callback);
                try {
                    const StatsEngine = require('../stats/StatsEngine');
                    const user = this.getAuthenticatedUser(socket);
                    if (!user) return respond({ success: false, error: 'Not authenticated' });
                    const limit = data?.limit || 50;
                    const offset = data?.offset || 0;
                    const history = await StatsEngine.getHandHistory(user.userId, limit, offset);
                    respond({ success: true, history });
                } catch (error) {
                    respond({ success: false, error: error.message });
                }
            });

            socket.on('get_hand_replay', async (data, callback) => {
                const respond = this._makeResponder(socket, 'get_hand_replay', callback);
                try {
                    const StatsEngine = require('../stats/StatsEngine');
                    if (!data?.tableId || !data?.handNumber) return respond({ success: false, error: 'Missing tableId or handNumber' });
                    const replay = await StatsEngine.getHandReplay(data.tableId, data.handNumber);
                    respond({ success: true, replay });
                } catch (error) {
                    respond({ success: false, error: error.message });
                }
            });

            socket.on('get_titles', async (data, callback) => {
                const respond = this._makeResponder(socket, 'get_titles', callback);
                try {
                    const TitleEngine = require('../stats/TitleEngine');
                    const targetId = data?.playerId || this.getAuthenticatedUser(socket)?.userId;
                    if (!targetId) return respond({ success: false, error: 'Not authenticated' });
                    const titles = await TitleEngine.getPlayerTitles(targetId);
                    const activeTitle = await TitleEngine.getActiveTitle(targetId);
                    respond({ success: true, titles, activeTitle });
                } catch (error) {
                    respond({ success: false, error: error.message });
                }
            });

            socket.on('set_active_title', async (data, callback) => {
                const respond = this._makeResponder(socket, 'set_active_title', callback);
                try {
                    const TitleEngine = require('../stats/TitleEngine');
                    const user = this.getAuthenticatedUser(socket);
                    if (!user) return respond({ success: false, error: 'Not authenticated' });
                    await TitleEngine.setActiveTitle(user.userId, data?.titleId || null);
                    respond({ success: true });
                } catch (error) {
                    respond({ success: false, error: error.message });
                }
            });

            socket.on('get_player_profile', async (data, callback) => {
                const respond = this._makeResponder(socket, 'get_player_profile', callback);
                try {
                    const StatsEngine = require('../stats/StatsEngine');
                    const TitleEngine = require('../stats/TitleEngine');
                    const database = require('../database/Database');
                    
                    const targetId = data?.playerId;
                    if (!targetId) return respond({ success: false, error: 'Missing playerId' });

                    const UserRepository = require('../database/UserRepository');
                    const userRepo = new UserRepository();
                    
                    const [stats, titles, activeTitle, user, crewMember, karma] = await Promise.all([
                        StatsEngine.getPlayerStats(targetId),
                        TitleEngine.getPlayerTitles(targetId),
                        TitleEngine.getActiveTitle(targetId),
                        database.queryOne('SELECT username, xp, created_at FROM users WHERE id = ?', [targetId]),
                        database.queryOne(`
                            SELECT cm.role, c.name as crew_name, c.tag as crew_tag 
                            FROM crew_members cm 
                            JOIN crews c ON cm.crew_id = c.id 
                            WHERE cm.player_id = ?
                        `, [targetId]).catch(() => null),
                        userRepo.getKarma(targetId).catch(() => 100)
                    ]);

                    respond({
                        success: true,
                        profile: {
                            playerId: targetId,
                            username: user?.username || 'Unknown',
                            xp: user?.xp || 0,
                            memberSince: user?.created_at,
                            activeTitle: activeTitle?.title_name || null,
                            titleCount: titles.length,
                            crewName: crewMember?.crew_name || null,
                            crewTag: crewMember?.crew_tag || null,
                            crewRole: crewMember?.role || null,
                            karma: karma,
                            heartColor: UserRepository.getHeartColor(karma),
                            heartTier: UserRepository.getHeartTier(karma),
                            stats: {
                                handsPlayed: stats.hands_played,
                                winRate: stats.winRate,
                                vpip: stats.vpip,
                                aggressionFactor: stats.aggressionFactor,
                                bluffSuccessRate: stats.bluffSuccessRate,
                                showdownWinRate: stats.showdownWinRate,
                                netChips: stats.netChips,
                                longestWinStreak: stats.longest_win_streak,
                                currentWinStreak: stats.current_win_streak
                            }
                        }
                    });
                } catch (error) {
                    respond({ success: false, error: error.message });
                }
            });

            // ============ Crews ============

            socket.on('create_crew', async (data, callback) => {
                const respond = this._makeResponder(socket, 'create_crew', callback);
                try {
                    const CrewManager = require('../social/CrewManager');
                    const user = this.getAuthenticatedUser(socket);
                    if (!user) return respond({ success: false, error: 'Not authenticated' });
                    const result = await CrewManager.createCrew(user.userId, data?.name, data?.tag, data?.description, data?.emblemColor);
                    respond(result);
                } catch (error) {
                    respond({ success: false, error: error.message });
                }
            });

            socket.on('get_crew', async (data, callback) => {
                const respond = this._makeResponder(socket, 'get_crew', callback);
                try {
                    const CrewManager = require('../social/CrewManager');
                    const user = this.getAuthenticatedUser(socket);
                    if (!user) return respond({ success: false, error: 'Not authenticated' });
                    const crewId = data?.crewId;
                    const result = crewId ? 
                        await CrewManager.getCrew(crewId) :
                        await CrewManager.getPlayerCrew(user.userId);
                    respond(result);
                } catch (error) {
                    respond({ success: false, error: error.message });
                }
            });

            socket.on('invite_to_crew', async (data, callback) => {
                const respond = this._makeResponder(socket, 'invite_to_crew', callback);
                try {
                    const CrewManager = require('../social/CrewManager');
                    const user = this.getAuthenticatedUser(socket);
                    if (!user) return respond({ success: false, error: 'Not authenticated' });
                    const result = await CrewManager.inviteToCrew(user.userId, data?.targetPlayerId);
                    if (result.success) {
                        // Notify the invited player
                        const targetAuth = this.authenticatedUsers.get(data.targetPlayerId);
                        if (targetAuth) {
                            this.io.to(targetAuth.socketId).emit('crew_invite', {
                                crewId: result.crewId,
                                crewName: result.crewName,
                                crewTag: result.crewTag,
                                invitedBy: user.username
                            });
                        }
                    }
                    respond(result);
                } catch (error) {
                    respond({ success: false, error: error.message });
                }
            });

            socket.on('join_crew', async (data, callback) => {
                const respond = this._makeResponder(socket, 'join_crew', callback);
                try {
                    const CrewManager = require('../social/CrewManager');
                    const user = this.getAuthenticatedUser(socket);
                    if (!user) return respond({ success: false, error: 'Not authenticated' });
                    const result = await CrewManager.joinCrew(user.userId, data?.crewId);
                    respond(result);
                } catch (error) {
                    respond({ success: false, error: error.message });
                }
            });

            socket.on('leave_crew', async (data, callback) => {
                const respond = this._makeResponder(socket, 'leave_crew', callback);
                try {
                    const CrewManager = require('../social/CrewManager');
                    const user = this.getAuthenticatedUser(socket);
                    if (!user) return respond({ success: false, error: 'Not authenticated' });
                    const result = await CrewManager.leaveCrew(user.userId);
                    respond(result);
                } catch (error) {
                    respond({ success: false, error: error.message });
                }
            });

            socket.on('crew_promote', async (data, callback) => {
                const respond = this._makeResponder(socket, 'crew_promote', callback);
                try {
                    const CrewManager = require('../social/CrewManager');
                    const user = this.getAuthenticatedUser(socket);
                    if (!user) return respond({ success: false, error: 'Not authenticated' });
                    const result = await CrewManager.promoteMember(user.userId, data?.targetPlayerId, data?.newRole);
                    respond(result);
                } catch (error) {
                    respond({ success: false, error: error.message });
                }
            });

            socket.on('crew_kick', async (data, callback) => {
                const respond = this._makeResponder(socket, 'crew_kick', callback);
                try {
                    const CrewManager = require('../social/CrewManager');
                    const user = this.getAuthenticatedUser(socket);
                    if (!user) return respond({ success: false, error: 'Not authenticated' });
                    const result = await CrewManager.kickMember(user.userId, data?.targetPlayerId);
                    respond(result);
                } catch (error) {
                    respond({ success: false, error: error.message });
                }
            });

            socket.on('get_crew_leaderboard', async (data, callback) => {
                const respond = this._makeResponder(socket, 'get_crew_leaderboard', callback);
                try {
                    const CrewManager = require('../social/CrewManager');
                    const limit = data?.limit || 20;
                    const leaderboard = await CrewManager.getCrewLeaderboard(limit);
                    respond({ success: true, leaderboard });
                } catch (error) {
                    respond({ success: false, error: error.message });
                }
            });

            // ============ Hand Replay / Saved Hands ============

            socket.on('save_hand', async (data, callback) => {
                const respond = this._makeResponder(socket, 'save_hand', callback);
                try {
                    const database = require('../database/Database');
                    const user = this.getAuthenticatedUser(socket);
                    if (!user) return respond({ success: false, error: 'Not authenticated' });

                    const { handHistoryId, label } = data || {};
                    if (!handHistoryId) return respond({ success: false, error: 'Missing handHistoryId' });

                    await database.query(`
                        INSERT IGNORE INTO saved_hands (player_id, hand_history_id, is_highlight, label)
                        VALUES (?, ?, FALSE, ?)
                    `, [user.userId, handHistoryId, label || null]);

                    respond({ success: true });
                } catch (error) {
                    respond({ success: false, error: error.message });
                }
            });

            socket.on('get_saved_hands', async (data, callback) => {
                const respond = this._makeResponder(socket, 'get_saved_hands', callback);
                try {
                    const database = require('../database/Database');
                    const user = this.getAuthenticatedUser(socket);
                    if (!user) return respond({ success: false, error: 'Not authenticated' });

                    const limit = data?.limit || 50;
                    const savedHands = await database.query(`
                        SELECT sh.*, hh.table_name, hh.hand_number, hh.final_hand_name, 
                               hh.pot_size, hh.chips_won_lost, hh.was_winner, hh.played_at
                        FROM saved_hands sh
                        JOIN hand_history hh ON sh.hand_history_id = hh.id
                        WHERE sh.player_id = ?
                        ORDER BY sh.saved_at DESC LIMIT ?
                    `, [user.userId, limit]);

                    respond({ success: true, savedHands });
                } catch (error) {
                    respond({ success: false, error: error.message });
                }
            });

            socket.on('get_hand_of_the_day', async (data, callback) => {
                const respond = this._makeResponder(socket, 'get_hand_of_the_day', callback);
                try {
                    const database = require('../database/Database');
                    // Find the biggest pot hand in the last 24 hours
                    const handOfDay = await database.queryOne(`
                        SELECT hh.*, u.username as player_name
                        FROM hand_history hh
                        LEFT JOIN users u ON hh.player_id = u.id
                        WHERE hh.was_winner = TRUE AND hh.played_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
                        ORDER BY hh.pot_size DESC
                        LIMIT 1
                    `);

                    respond({ success: true, handOfDay: handOfDay || null });
                } catch (error) {
                    respond({ success: false, error: error.message });
                }
            });

            // ============ Robbery ============

            socket.on('robbery_attempt', async (data, callback) => {
                const respond = this._makeResponder(socket, 'robbery_attempt', callback);
                try {
                    const RobberyManager = require('../game/RobberyManager');
                    const user = this.getAuthenticatedUser(socket);
                    if (!user) return respond({ success: false, error: 'Not authenticated' });
                    const result = await RobberyManager.attemptRobbery(
                        user.userId, data?.victimId, data?.toolTemplateId, data?.targetItemId
                    );
                    respond(result);

                    // Notify victim if robbery happened
                    if (result.stolen || result.blocked) {
                        const victimAuth = this.authenticatedUsers.get(data.victimId);
                        if (victimAuth) {
                            this.io.to(victimAuth.socketId).emit('robbery_notification', {
                                robberId: result.stolen ? user.userId : null,
                                robberName: result.stolen ? user.username : null,
                                itemName: result.itemName || null,
                                itemRarity: result.itemRarity || null,
                                stolen: result.stolen || false,
                                blocked: result.blocked || false,
                                message: result.stolen ? 
                                    `You were robbed! ${user.username} stole your ${result.itemName}!` :
                                    'Someone tried to rob you but your bodyguard blocked it!'
                            });
                        }
                    }
                } catch (error) {
                    respond({ success: false, error: error.message });
                }
            });

            socket.on('robbery_recovery', async (data, callback) => {
                const respond = this._makeResponder(socket, 'robbery_recovery', callback);
                try {
                    const RobberyManager = require('../game/RobberyManager');
                    const user = this.getAuthenticatedUser(socket);
                    if (!user) return respond({ success: false, error: 'Not authenticated' });
                    const result = await RobberyManager.recoverItem(user.userId, data?.robberyLogId);
                    respond(result);
                } catch (error) {
                    respond({ success: false, error: error.message });
                }
            });

            socket.on('get_recoverable_robberies', async (data, callback) => {
                const respond = this._makeResponder(socket, 'get_recoverable_robberies', callback);
                try {
                    const RobberyManager = require('../game/RobberyManager');
                    const user = this.getAuthenticatedUser(socket);
                    if (!user) return respond({ success: false, error: 'Not authenticated' });
                    const robberies = await RobberyManager.getRecoverableRobberies(user.userId);
                    respond({ success: true, robberies });
                } catch (error) {
                    respond({ success: false, error: error.message });
                }
            });

            // ============ Karma / Heart System ============

            socket.on('get_karma', async (data, callback) => {
                const respond = this._makeResponder(socket, 'get_karma', callback);
                try {
                    const UserRepository = require('../database/UserRepository');
                    const user = this.getAuthenticatedUser(socket);
                    if (!user) return respond({ success: false, error: 'Not authenticated' });
                    
                    const userRepo = new UserRepository();
                    const karma = await userRepo.getKarma(user.userId);
                    const heartColor = UserRepository.getHeartColor(karma);
                    const heartTier = UserRepository.getHeartTier(karma);
                    
                    respond({ success: true, karma, heartColor, heartTier });
                } catch (error) {
                    respond({ success: false, error: error.message });
                }
            });

            socket.on('get_karma_history', async (data, callback) => {
                const respond = this._makeResponder(socket, 'get_karma_history', callback);
                try {
                    const UserRepository = require('../database/UserRepository');
                    const user = this.getAuthenticatedUser(socket);
                    if (!user) return respond({ success: false, error: 'Not authenticated' });
                    
                    const userRepo = new UserRepository();
                    const history = await userRepo.getKarmaHistory(user.userId, data?.limit || 20);
                    respond({ success: true, history });
                } catch (error) {
                    respond({ success: false, error: error.message });
                }
            });

            socket.on('get_robbery_targets', async (data, callback) => {
                const respond = this._makeResponder(socket, 'get_robbery_targets', callback);
                try {
                    const RobberyManager = require('../game/RobberyManager');
                    const user = this.getAuthenticatedUser(socket);
                    if (!user) return respond({ success: false, error: 'Not authenticated' });
                    
                    const targets = await RobberyManager.getRobberyTargets(user.userId, data?.limit || 20);
                    respond({ success: true, targets });
                } catch (error) {
                    respond({ success: false, error: error.message });
                }
            });

            // ============ Events ============

            socket.on('get_active_events', async (data, callback) => {
                const respond = this._makeResponder(socket, 'get_active_events', callback);
                try {
                    const eventManager = require('../events/EventManager');
                    const events = eventManager.getActiveEvents();
                    respond({ success: true, events });
                } catch (error) {
                    respond({ success: false, error: error.message });
                }
            });

            // ============ Spectator Odds & Side Bets ============

            socket.on('get_spectator_odds', async (data, callback) => {
                const respond = this._makeResponder(socket, 'get_spectator_odds', callback);
                try {
                    const SpectatorOdds = require('../game/SpectatorOdds');
                    const tableId = data?.tableId;
                    if (!tableId) return respond({ success: false, error: 'Missing tableId' });

                    const table = this.gameManager.getTable(tableId);
                    if (!table) return respond({ success: false, error: 'Table not found' });

                    const odds = SpectatorOdds.getSpectatorOddsForTable(table);
                    respond({ success: true, odds });
                } catch (error) {
                    respond({ success: false, error: error.message });
                }
            });

            socket.on('spectator_bet', async (data, callback) => {
                const respond = this._makeResponder(socket, 'spectator_bet', callback);
                try {
                    const database = require('../database/Database');
                    const user = this.getAuthenticatedUser(socket);
                    if (!user) return respond({ success: false, error: 'Not authenticated' });

                    const { tableId, betOnPlayerId, amount } = data || {};
                    if (!tableId || !betOnPlayerId || !amount || amount <= 0) {
                        return respond({ success: false, error: 'Missing or invalid bet data' });
                    }

                    // Verify user has enough chips
                    const dbUser = await database.queryOne('SELECT chips FROM users WHERE id = ?', [user.userId]);
                    if (!dbUser || dbUser.chips < amount) {
                        return respond({ success: false, error: 'Not enough chips' });
                    }

                    const table = this.gameManager.getTable(tableId);
                    if (!table) return respond({ success: false, error: 'Table not found' });

                    // Deduct chips
                    await database.query('UPDATE users SET chips = chips - ? WHERE id = ?', [amount, user.userId]);

                    // Record bet
                    await database.query(`
                        INSERT INTO spectator_bets (spectator_id, table_id, hand_number, bet_on_player_id, amount)
                        VALUES (?, ?, ?, ?, ?)
                    `, [user.userId, tableId, table.handsPlayed, betOnPlayerId, amount]);

                    respond({ success: true, amount, betOnPlayerId });

                    // Broadcast that a spectator bet was placed
                    this.io.to(`table:${tableId}`).emit('spectator_bet_placed', {
                        spectatorName: user.username,
                        betOnPlayerId,
                        amount
                    });
                } catch (error) {
                    respond({ success: false, error: error.message });
                }
            });

            socket.on('spectator_reaction', (data) => {
                const user = this.getAuthenticatedUser(socket);
                if (!user || !data?.tableId || !data?.reaction) return;

                // Broadcast reaction to table
                this.io.to(`table:${data.tableId}`).emit('spectator_reaction', {
                    spectatorName: user.username,
                    reaction: data.reaction // 👏 😱 🔥 😂
                });
            });

            // ============ Equipment ============

            socket.on('equip_item', async (data, callback) => {
                const respond = this._makeResponder(socket, 'equip_item', callback);
                try {
                    const database = require('../database/Database');
                    const user = this.getAuthenticatedUser(socket);
                    if (!user) return respond({ success: false, error: 'Not authenticated' });
                    
                    const itemId = data?.itemId;
                    if (!itemId) return respond({ success: false, error: 'Missing itemId' });

                    // Verify item belongs to user
                    const item = await database.queryOne(
                        'SELECT * FROM inventory WHERE id = ? AND user_id = ?', [itemId, user.userId]
                    );
                    if (!item) return respond({ success: false, error: 'Item not found' });

                    // Unequip any item in same slot type first
                    await database.query(
                        'UPDATE inventory SET is_equipped = FALSE WHERE user_id = ? AND item_type = ? AND is_equipped = TRUE',
                        [user.userId, item.item_type]
                    );

                    // Equip the item
                    await database.query(
                        'UPDATE inventory SET is_equipped = TRUE WHERE id = ?', [itemId]
                    );

                    respond({ success: true, itemId, equipped: true });
                } catch (error) {
                    respond({ success: false, error: error.message });
                }
            });

            socket.on('unequip_item', async (data, callback) => {
                const respond = this._makeResponder(socket, 'unequip_item', callback);
                try {
                    const database = require('../database/Database');
                    const user = this.getAuthenticatedUser(socket);
                    if (!user) return respond({ success: false, error: 'Not authenticated' });

                    await database.query(
                        'UPDATE inventory SET is_equipped = FALSE WHERE id = ? AND user_id = ?',
                        [data?.itemId, user.userId]
                    );

                    respond({ success: true, equipped: false });
                } catch (error) {
                    respond({ success: false, error: error.message });
                }
            });

            // ============ Characters ============

            socket.on('get_character_catalog', async (data, callback) => {
                const respond = this._makeResponder(socket, 'get_character_catalog', callback);
                try {
                    const CharacterSystem = require('../game/CharacterSystem');
                    const charSystem = new CharacterSystem(require('../database/Database'));
                    const user = this.getAuthenticatedUser(socket);
                    if (!user) return respond({ success: false, error: 'Not authenticated' });

                    const allCharacters = charSystem.getAllCharacters();
                    const owned = await charSystem.getOwnedCharacters(user.userId);
                    const active = await charSystem.getActiveCharacter(user.userId);
                    
                    const ownedIds = new Set(owned.map(o => o.template_id));
                    const catalog = allCharacters.map(c => ({
                        ...c,
                        owned: ownedIds.has(c.id),
                        is_active: active.id === c.id
                    }));

                    respond({ 
                        success: true, 
                        characters: catalog,
                        activeCharacter: active.id,
                        ownedCount: owned.length,
                        totalCount: allCharacters.length
                    });
                } catch (error) {
                    respond({ success: false, error: error.message });
                }
            });

            socket.on('get_owned_characters', async (data, callback) => {
                const respond = this._makeResponder(socket, 'get_owned_characters', callback);
                try {
                    const CharacterSystem = require('../game/CharacterSystem');
                    const charSystem = new CharacterSystem(require('../database/Database'));
                    const user = this.getAuthenticatedUser(socket);
                    if (!user) return respond({ success: false, error: 'Not authenticated' });

                    const owned = await charSystem.getOwnedCharacters(user.userId);
                    const active = await charSystem.getActiveCharacter(user.userId);

                    respond({ 
                        success: true, 
                        characters: owned,
                        activeCharacter: active.id
                    });
                } catch (error) {
                    respond({ success: false, error: error.message });
                }
            });

            socket.on('set_active_character', async (data, callback) => {
                const respond = this._makeResponder(socket, 'set_active_character', callback);
                try {
                    const CharacterSystem = require('../game/CharacterSystem');
                    const charSystem = new CharacterSystem(require('../database/Database'));
                    const user = this.getAuthenticatedUser(socket);
                    if (!user) return respond({ success: false, error: 'Not authenticated' });

                    const result = await charSystem.setActiveCharacter(user.userId, data?.characterId);
                    respond(result);
                } catch (error) {
                    respond({ success: false, error: error.message });
                }
            });

            socket.on('get_character_sounds', async (data, callback) => {
                const respond = this._makeResponder(socket, 'get_character_sounds', callback);
                try {
                    const CharacterSystem = require('../game/CharacterSystem');
                    const charSystem = new CharacterSystem(require('../database/Database'));

                    const charDef = charSystem.getCharacterDef(data?.characterId || 'shadow_hacker');
                    respond({ 
                        success: true, 
                        characterId: charDef.id,
                        sounds: charDef.sounds,
                        personality: charDef.personality
                    });
                } catch (error) {
                    respond({ success: false, error: error.message });
                }
            });

            // ============ Shop ============

            socket.on('get_shop_catalog', async (data, callback) => {
                const respond = this._makeResponder(socket, 'get_shop_catalog', callback);
                try {
                    const Item = require('../models/Item');
                    const database = require('../database/Database');
                    const user = this.getAuthenticatedUser(socket);
                    if (!user) return respond({ success: false, error: 'Not authenticated' });

                    // Build shop catalog from item templates + pricing
                    const shopItems = [
                        // Card Backs
                        { templateId: 'CARD_BACK_FLAME', price: 5000, currency: 'chips', category: 'card_backs' },
                        { templateId: 'CARD_BACK_DIAMOND', price: 50000, currency: 'chips', category: 'card_backs' },
                        { templateId: 'CARD_BACK_HOLOGRAM', price: 250000, currency: 'chips', category: 'card_backs' },
                        // Table Skins
                        { templateId: 'TABLE_SKIN_VELVET', price: 10000, currency: 'chips', category: 'table_skins' },
                        { templateId: 'TABLE_SKIN_GOLD', price: 500000, currency: 'chips', category: 'table_skins' },
                        // Chip Styles
                        { templateId: 'CHIP_STYLE_CASINO', price: 25000, currency: 'chips', category: 'chip_styles' },
                        { templateId: 'CHIP_STYLE_PLATINUM', price: 300000, currency: 'chips', category: 'chip_styles' },
                        // Avatars
                        { templateId: 'AVATAR_WOLF', price: 8000, currency: 'chips', category: 'avatars' },
                        { templateId: 'AVATAR_SHARK', price: 30000, currency: 'chips', category: 'avatars' },
                        { templateId: 'AVATAR_DRAGON', price: 100000, currency: 'chips', category: 'avatars' },
                        // XP Boosts
                        { templateId: 'XP_BOOST_SMALL', price: 1000, currency: 'chips', category: 'consumables' },
                        { templateId: 'XP_BOOST_MEDIUM', price: 4000, currency: 'chips', category: 'consumables' },
                        { templateId: 'XP_BOOST_LARGE', price: 15000, currency: 'chips', category: 'consumables' },
                        { templateId: 'XP_BOOST_MEGA', price: 75000, currency: 'chips', category: 'consumables' },
                        // Gem-purchasable items
                        { templateId: 'CARD_BACK_GOLDEN', price: 50, currency: 'gems', category: 'premium' },
                        { templateId: 'AVATAR_LEGEND', price: 100, currency: 'gems', category: 'premium' },
                        { templateId: 'VEHICLE_YACHT_GOLD', price: 200, currency: 'gems', category: 'premium' },
                        { templateId: 'VEHICLE_JET', price: 150, currency: 'gems', category: 'premium' },
                    ];

                    // Get user's existing inventory to mark owned items
                    let ownedTemplateIds = [];
                    if (database.isConnected) {
                        const owned = await database.query(
                            'SELECT item_template_id FROM inventory WHERE user_id = ?', [user.userId]
                        );
                        ownedTemplateIds = owned.map(r => r.item_template_id);
                    }

                    const catalog = shopItems.map(shopItem => {
                        const template = Item.TEMPLATES[shopItem.templateId];
                        if (!template) return null;
                        const item = new Item(template);
                        return {
                            templateId: shopItem.templateId,
                            name: item.name,
                            description: item.description,
                            type: item.type,
                            rarity: item.rarity,
                            icon: item.icon,
                            powerScore: item.powerScore,
                            price: shopItem.price,
                            currency: shopItem.currency,
                            category: shopItem.category,
                            owned: ownedTemplateIds.includes(shopItem.templateId)
                        };
                    }).filter(Boolean);

                    respond({ success: true, catalog });
                } catch (error) {
                    respond({ success: false, error: error.message });
                }
            });

            socket.on('buy_item', async (data, callback) => {
                const respond = this._makeResponder(socket, 'buy_item', callback);
                try {
                    const Item = require('../models/Item');
                    const database = require('../database/Database');
                    const user = this.getAuthenticatedUser(socket);
                    if (!user) return respond({ success: false, error: 'Not authenticated' });

                    const { templateId } = data || {};
                    if (!templateId) return respond({ success: false, error: 'Missing templateId' });

                    // Find in shop catalog (pricing)
                    const shopPricing = {
                        'CARD_BACK_FLAME': { price: 5000, currency: 'chips' },
                        'CARD_BACK_DIAMOND': { price: 50000, currency: 'chips' },
                        'CARD_BACK_HOLOGRAM': { price: 250000, currency: 'chips' },
                        'TABLE_SKIN_VELVET': { price: 10000, currency: 'chips' },
                        'TABLE_SKIN_GOLD': { price: 500000, currency: 'chips' },
                        'CHIP_STYLE_CASINO': { price: 25000, currency: 'chips' },
                        'CHIP_STYLE_PLATINUM': { price: 300000, currency: 'chips' },
                        'AVATAR_WOLF': { price: 8000, currency: 'chips' },
                        'AVATAR_SHARK': { price: 30000, currency: 'chips' },
                        'AVATAR_DRAGON': { price: 100000, currency: 'chips' },
                        'XP_BOOST_SMALL': { price: 1000, currency: 'chips' },
                        'XP_BOOST_MEDIUM': { price: 4000, currency: 'chips' },
                        'XP_BOOST_LARGE': { price: 15000, currency: 'chips' },
                        'XP_BOOST_MEGA': { price: 75000, currency: 'chips' },
                        'CARD_BACK_GOLDEN': { price: 50, currency: 'gems' },
                        'AVATAR_LEGEND': { price: 100, currency: 'gems' },
                        'VEHICLE_YACHT_GOLD': { price: 200, currency: 'gems' },
                        'VEHICLE_JET': { price: 150, currency: 'gems' }
                    };

                    const pricing = shopPricing[templateId];
                    if (!pricing) return respond({ success: false, error: 'Item not available in shop' });

                    const template = Item.TEMPLATES[templateId];
                    if (!template) return respond({ success: false, error: 'Item template not found' });

                    // Check if already owned (non-consumable)
                    if (template.type !== 'consumable' && template.type !== 'xp_boost') {
                        const existing = await database.queryOne(
                            'SELECT id FROM inventory WHERE user_id = ? AND item_template_id = ?',
                            [user.userId, templateId]
                        );
                        if (existing) return respond({ success: false, error: 'Already owned' });
                    }

                    // Check balance
                    const dbUser = await database.queryOne('SELECT chips, gems FROM users WHERE id = ?', [user.userId]);
                    if (!dbUser) return respond({ success: false, error: 'User not found' });

                    if (pricing.currency === 'chips') {
                        if (dbUser.chips < pricing.price) return respond({ success: false, error: 'Not enough chips' });
                        await database.query('UPDATE users SET chips = chips - ? WHERE id = ?', [pricing.price, user.userId]);
                    } else if (pricing.currency === 'gems') {
                        if ((dbUser.gems || 0) < pricing.price) return respond({ success: false, error: 'Not enough gems' });
                        await database.query('UPDATE users SET gems = gems - ? WHERE id = ?', [pricing.price, user.userId]);
                    }

                    // Create item in inventory
                    const item = new Item({ ...template, source: 'store' });
                    await database.query(`
                        INSERT INTO inventory (user_id, item_template_id, item_name, item_type, item_rarity, 
                                              item_icon, power_score, source, is_gambleable)
                        VALUES (?, ?, ?, ?, ?, ?, ?, 'store', FALSE)
                    `, [user.userId, templateId, item.name, item.type, item.rarity, item.icon, item.powerScore]);

                    respond({
                        success: true,
                        item: { templateId, name: item.name, type: item.type, rarity: item.rarity },
                        newBalance: pricing.currency === 'chips' ? dbUser.chips - pricing.price : undefined,
                        newGems: pricing.currency === 'gems' ? (dbUser.gems || 0) - pricing.price : undefined
                    });
                } catch (error) {
                    respond({ success: false, error: error.message });
                }
            });

            // ============ Spectator Leaderboard ============

            socket.on('get_spectator_leaderboard', async (data, callback) => {
                const respond = this._makeResponder(socket, 'get_spectator_leaderboard', callback);
                try {
                    const StatsCalculator = require('../stats/StatsCalculator');
                    const leaderboard = await StatsCalculator.getSpectatorLeaderboard(data?.limit || 20);
                    respond({ success: true, leaderboard });
                } catch (error) {
                    respond({ success: false, error: error.message });
                }
            });

            // ============ Advanced Stats (StatsCalculator) ============

            socket.on('get_stats_comparison', async (data, callback) => {
                const respond = this._makeResponder(socket, 'get_stats_comparison', callback);
                try {
                    const StatsCalculator = require('../stats/StatsCalculator');
                    const user = this.getAuthenticatedUser(socket);
                    if (!user) return respond({ success: false, error: 'Not authenticated' });

                    const targetId = data?.playerId || user.userId;
                    const result = await StatsCalculator.getStatsWithComparison(targetId);
                    respond({ success: true, ...result });
                } catch (error) {
                    respond({ success: false, error: error.message });
                }
            });

            socket.on('get_hand_type_comparison', async (data, callback) => {
                const respond = this._makeResponder(socket, 'get_hand_type_comparison', callback);
                try {
                    const StatsCalculator = require('../stats/StatsCalculator');
                    const user = this.getAuthenticatedUser(socket);
                    if (!user) return respond({ success: false, error: 'Not authenticated' });

                    const targetId = data?.playerId || user.userId;
                    const result = await StatsCalculator.getHandTypeComparison(targetId);
                    respond({ success: true, handTypes: result });
                } catch (error) {
                    respond({ success: false, error: error.message });
                }
            });

            socket.on('get_pocket_breakdown', async (data, callback) => {
                const respond = this._makeResponder(socket, 'get_pocket_breakdown', callback);
                try {
                    const StatsCalculator = require('../stats/StatsCalculator');
                    const user = this.getAuthenticatedUser(socket);
                    if (!user) return respond({ success: false, error: 'Not authenticated' });

                    const targetId = data?.playerId || user.userId;
                    const result = await StatsCalculator.getPocketBreakdown(targetId);
                    respond({ success: true, ...result });
                } catch (error) {
                    respond({ success: false, error: error.message });
                }
            });

            socket.on('get_trends', async (data, callback) => {
                const respond = this._makeResponder(socket, 'get_trends', callback);
                try {
                    const StatsCalculator = require('../stats/StatsCalculator');
                    const user = this.getAuthenticatedUser(socket);
                    if (!user) return respond({ success: false, error: 'Not authenticated' });

                    const result = await StatsCalculator.getTrends(user.userId, data?.sessionCount || 20);
                    respond({ success: true, ...result });
                } catch (error) {
                    respond({ success: false, error: error.message });
                }
            });

            socket.on('get_rare_hands', async (data, callback) => {
                const respond = this._makeResponder(socket, 'get_rare_hands', callback);
                try {
                    const StatsCalculator = require('../stats/StatsCalculator');
                    const user = this.getAuthenticatedUser(socket);
                    if (!user) return respond({ success: false, error: 'Not authenticated' });

                    const targetId = data?.playerId || user.userId;
                    const hands = await StatsCalculator.getRareHands(targetId);
                    respond({ success: true, rareHands: hands });
                } catch (error) {
                    respond({ success: false, error: error.message });
                }
            });

            socket.on('get_player_profile', async (data, callback) => {
                const respond = this._makeResponder(socket, 'get_player_profile', callback);
                try {
                    const StatsCalculator = require('../stats/StatsCalculator');
                    const user = this.getAuthenticatedUser(socket);
                    if (!user) return respond({ success: false, error: 'Not authenticated' });

                    const targetId = data?.playerId || user.userId;
                    const profile = await StatsCalculator.getPlayerProfile(targetId);
                    respond({ success: true, profile });
                } catch (error) {
                    respond({ success: false, error: error.message });
                }
            });

            // ============ Crew Chat ============

            socket.on('crew_chat', async (data, callback) => {
                const respond = this._makeResponder(socket, 'crew_chat', callback);
                try {
                    const CrewManager = require('../social/CrewManager');
                    const user = this.getAuthenticatedUser(socket);
                    if (!user) return respond({ success: false, error: 'Not authenticated' });

                    const { message } = data || {};
                    if (!message || typeof message !== 'string' || message.trim().length === 0) {
                        return respond({ success: false, error: 'Empty message' });
                    }

                    // Get player's crew
                    const membership = await CrewManager.getPlayerCrew(user.userId);
                    if (!membership) return respond({ success: false, error: 'Not in a crew' });

                    const crewRoomId = `crew:${membership.crew_id}`;
                    const chatMsg = {
                        senderId: user.userId,
                        senderName: user.profile?.username || 'Unknown',
                        message: message.trim().substring(0, 500), // Max 500 chars
                        timestamp: Date.now(),
                        crewId: membership.crew_id
                    };

                    // Broadcast to all online crew members in the crew room
                    this.io.to(crewRoomId).emit('crew_chat_message', chatMsg);
                    respond({ success: true });
                } catch (error) {
                    respond({ success: false, error: error.message });
                }
            });

            socket.on('join_crew_chat', async (callback) => {
                const respond = (response) => {
                    if (callback) callback(response);
                };
                try {
                    const CrewManager = require('../social/CrewManager');
                    const user = this.getAuthenticatedUser(socket);
                    if (!user) return respond({ success: false, error: 'Not authenticated' });

                    const membership = await CrewManager.getPlayerCrew(user.userId);
                    if (!membership) return respond({ success: false, error: 'Not in a crew' });

                    const crewRoomId = `crew:${membership.crew_id}`;
                    socket.join(crewRoomId);
                    respond({ success: true, crewId: membership.crew_id, crewName: membership.crew_name });
                } catch (error) {
                    respond({ success: false, error: error.message });
                }
            });

            socket.on('leave_crew_chat', async () => {
                try {
                    const CrewManager = require('../social/CrewManager');
                    const user = this.getAuthenticatedUser(socket);
                    if (!user) return;

                    const membership = await CrewManager.getPlayerCrew(user.userId);
                    if (membership) {
                        socket.leave(`crew:${membership.crew_id}`);
                    }
                } catch (e) {
                    // Ignore
                }
            });

            // ============ Disconnect ============
            
            socket.on('disconnect', async () => {
                const userId = this.socketToUser.get(socket.id);
                gameLogger.gameEvent('SYSTEM', `[SOCKET] CLIENT_DISCONNECTED`, { socketId: socket.id, userId: userId || 'unknown' });
                
                if (!userId) {
                    // Already cleaned up (user re-logged on new socket)
                    return;
                }
                
                // RACE GUARD: If user already re-authenticated on a DIFFERENT socket,
                // this is a stale disconnect - do NOT touch the new session
                const currentAuth = this.authenticatedUsers.get(userId);
                if (currentAuth && currentAuth.socketId !== socket.id) {
                    gameLogger.gameEvent('SYSTEM', `[SOCKET] STALE_DISCONNECT_IGNORED`, { userId, staleSocketId: socket.id, currentSocketId: currentAuth.socketId });
                    this.socketToUser.delete(socket.id);
                    this.gameManager.socketToPlayer.delete(socket.id);
                    return;
                }
                
                const player = this.gameManager.players.get(userId);
                
                if (player?.currentTableId) {
                    const table = this.gameManager.getTable(player.currentTableId);
                    const seat = table?.seats?.find(s => s?.playerId === userId);
                    if (seat) {
                        seat.isConnected = false;
                        seat.disconnectedAt = Date.now();
                    }
                    
                    socket.to(`table:${player.currentTableId}`).emit('player_disconnected', {
                        playerId: userId,
                        canReconnect: true,
                        timeoutSeconds: 60
                    });
                    
                    this.setReconnectTimeout(userId, player.currentTableId, 60000);
                } else {
                    this.gameManager.removePlayer(userId, socket.id);
                }
                
                this.deauthenticateSocket(socket);
                this.notifyFriendsStatus(userId, false);
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
                
                gameLogger.gameEvent('SYSTEM', `[SOCKET] RECONNECTED_TO_TABLE`, { userId: user.userId, username: user.username, tableId: table.id, tableName: table.name });
                
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

        gameLogger.gameEvent('SYSTEM', `[SOCKET_HANDLER] INITIALIZED`, {});
    }

    // ============ Reconnection Helpers ============
    
    setReconnectTimeout(userId, tableId, timeoutMs) {
        // Clear any existing timeout
        this.clearReconnectTimeout(userId);
        
        const timeout = setTimeout(async () => {
            gameLogger.gameEvent('SYSTEM', `[SOCKET] RECONNECT_TIMEOUT`, { userId });
            
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
        // CRITICAL: Check if this user was already authenticated on a DIFFERENT socket
        const existingAuth = this.authenticatedUsers.get(userId);
        if (existingAuth && existingAuth.socketId !== socket.id) {
            const oldSocketId = existingAuth.socketId;
            gameLogger.gameEvent('SYSTEM', `[SOCKET] STALE_SESSION_CLEANUP`, { userId, oldSocketId, newSocketId: socket.id });
            this.socketToUser.delete(oldSocketId);
            this.gameManager.socketToPlayer.delete(oldSocketId);
            try {
                const oldSocket = this.io.sockets.sockets.get(oldSocketId);
                if (oldSocket) {
                    oldSocket.disconnect(true);
                    gameLogger.gameEvent('SYSTEM', `[SOCKET] FORCE_DISCONNECTED_OLD`, { oldSocketId });
                }
            } catch (e) { /* Old socket may already be gone */ }
            this.clearReconnectTimeout(userId);
        }
        
        this.authenticatedUsers.set(userId, {
            userId: userId,
            socketId: socket.id,
            profile
        });
        this.socketToUser.set(socket.id, userId);
        this.gameManager.registerPlayer(socket.id, profile.username, userId);
        this.notifyFriendsStatus(userId, true);
        gameLogger.gameEvent('SYSTEM', `[SOCKET] USER_AUTHENTICATED`, { userId: profile.userId, username: profile.username });
    }
    
    deauthenticateSocket(socket) {
        const userId = this.socketToUser.get(socket.id);
        if (userId) {
            // Only remove auth if this socket is still the current one for this user
            // (prevents a race where new login clears the old socket's deauth)
            const currentAuth = this.authenticatedUsers.get(userId);
            if (currentAuth && currentAuth.socketId === socket.id) {
                this.authenticatedUsers.delete(userId);
            }
            this.socketToUser.delete(socket.id);
            this.gameManager.socketToPlayer.delete(socket.id);
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
            
            // CRITICAL: In practice mode, check if bots need to submit items for item ante
            if (table.practiceMode && table.itemAnteEnabled && !table.gameStarted && table.itemAnte) {
                this.gameManager.botManager.checkBotsItemAnte(table.id);
            }
        };
        
        // Called when countdown starts/stops/updates
        table.onCountdownUpdate = () => {
            const countdown = table.getStartCountdownRemaining();
            gameLogger.gameEvent(table.id, `[TABLE] COUNTDOWN_UPDATE`, { tableName: table.name, countdown });
            
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
        gameLogger.gameEvent(table.id, `[TABLE] SETUP_GAME_OVER_CALLBACK`, { tableName: table.name, hasOriginalCallback: !!originalOnGameOver });
        gameLogger.gameEvent(table.name, '[SocketHandler] Setting up onGameOver callback', {
            tableId: table.id,
            hasOriginalCallback: !!originalOnGameOver
        });
        table.onGameOver = (winner) => {
            gameLogger.gameEvent(table.id, `[TABLE] GAME_OVER`, { tableName: table.name, winnerId: winner.userId, winnerName: winner.name });
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
                        gameLogger.gameEvent(table.id, `[TABLE] SKIP_GAME_OVER_SPECTATOR`, { playerId: seat.userId, playerName: seat.name });
                        continue;
                    }
                    
                    // Double-check: make sure this user is not in the spectators map
                    if (userId && table.isSpectator(userId)) {
                        gameLogger.gameEvent(table.id, `[TABLE] SKIP_GAME_OVER_SPECTATOR_CONFIRMED`, { playerId: seat.userId, playerName: seat.name });
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
            
            gameLogger.gameEvent(table.id, `[TABLE] GAME_OVER_BROADCAST`, { playersNotified, spectatorCount, informational: true });
            
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
            gameLogger.gameEvent(table.id, `[TABLE] PLAYER_ACTION`, { playerId, action, amount });
            
            this.io.to(`table:${table.id}`).emit('player_action', {
                playerId: playerId,
                action: action,
                amount: amount || 0
            });
        };
        
        // Called when a hand is complete (showdown or all folded)
        table.onHandComplete = (result) => {
            gameLogger.gameEvent(table.id, `[TABLE] HAND_COMPLETE`, { winnerName: result.winnerName, potAmount: result.potAmount, handName: result.handName });
            
            this.io.to(`table:${table.id}`).emit('hand_result', {
                tableId: table.id,
                winnerId: result.winnerId,
                winnerName: result.winnerName,
                handName: result.handName,
                potAmount: result.potAmount,
                potAwards: result.potAwards || []
            });
        };

        // Called when a player's fire status changes (NBA Jam style)
        table.onFireStatusChange = (playerId, playerName, status) => {
            if (status.fireLevel >= 1) {
                const levelNames = ['', 'WARM', 'HOT', 'ON FIRE'];
                this.io.to(`table:${table.id}`).emit('fire_status_change', {
                    tableId: table.id,
                    playerId,
                    playerName,
                    fireLevel: status.fireLevel,
                    coldLevel: status.coldLevel,
                    fireScore: status.fireScore,
                    levelName: levelNames[status.fireLevel] || '',
                    message: `${playerName} ${status.fireLevel === 3 ? 'IS ON FIRE! 🔥🔥🔥' : status.fireLevel === 2 ? 'is on a hot streak! 🔥' : 'is heating up! 🌡️'}`
                });
            }
        };
        
        // Called when a player auto-folds due to timeout
        table.onAutoFold = (playerId, seatIndex) => {
            gameLogger.gameEvent(table.id, `[TABLE] AUTO_FOLD`, { playerId, seatIndex });
            
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
            gameLogger.gameEvent(table.id, `[TABLE] READY_UP_STARTED`, { tableName: table.name });
            
            this.io.to(`table:${table.id}`).emit('ready_prompt', {
                tableId: table.id,
                timeLimit: table.readyUpDuration / 1000 // in seconds
            });
        };
        
        // Called when a player didn't ready in time and becomes spectator
        table.onPlayerNotReady = (playerId, playerName) => {
            gameLogger.gameEvent(table.id, `[TABLE] PLAYER_NOT_READY_MOVED_TO_SPECTATORS`, { playerName, tableName: table.name });
            
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
            gameLogger.gameEvent(table.id, `[TABLE] PLAYER_ELIMINATED`, { playerName: data.playerName, tableName: table.name });
            
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