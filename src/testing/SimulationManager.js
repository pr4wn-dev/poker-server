/**
 * SimulationManager - Handles creation and management of simulation games
 * 
 * When a simulation is requested:
 * 1. Creates a practice mode table
 * 2. Spawns a mix of regular bots and socket bots
 * 3. Creator joins as spectator
 * 4. Game runs automatically to completion
 * 5. All actions are logged for debugging
 */

const { SocketBot } = require('./SocketBot');
const fs = require('fs');
const path = require('path');

class SimulationManager {
    constructor(gameManager, serverUrl = 'http://localhost:3000') {
        this.gameManager = gameManager;
        this.serverUrl = serverUrl;
        this.io = null; // Will be set by SocketHandler
        this.activeSimulations = new Map(); // tableId -> simulation data
        this.logFile = path.join(__dirname, '../../logs/simulation.log');
        
        // Default settings - simulations always run in fast mode
        this.fastMode = true;       // Fast forward mode (10x speed) - ON by default for simulations
        this.autoRestart = true;    // Auto-start new game when one ends
        this.maxGames = 10;         // Max games per simulation before auto-stop (10 for testing)
        this.isPaused = false;      // Pause flag - when true, bots won't take actions
        
        this._ensureLogDir();
    }
    
    /**
     * Set the Socket.IO instance (called by SocketHandler)
     */
    setIO(io) {
        this.io = io;
    }
    
    /**
     * Enable/disable fast mode for all future simulations
     */
    setFastMode(enabled) {
        this.fastMode = enabled;
        this.log('INFO', `Fast mode ${enabled ? 'ENABLED (10x speed)' : 'DISABLED'}`);
        
        // Update existing socket bots
        for (const [tableId, sim] of this.activeSimulations) {
            for (const bot of sim.socketBots) {
                bot.fastMode = enabled;
                if (enabled) {
                    bot.minDelay = 50;
                    bot.maxDelay = 200;
                } else {
                    bot.minDelay = 500;
                    bot.maxDelay = 2000;
                }
            }
        }
    }
    
    _ensureLogDir() {
        const logDir = path.dirname(this.logFile);
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }
    }
    
    log(level, message, data = null) {
        const timestamp = new Date().toISOString();
        const logEntry = `[${timestamp}] [SIM] [${level}] ${message}${data ? ' | Data: ' + JSON.stringify(data) : ''}`;
        
        console.log(logEntry);
        fs.appendFileSync(this.logFile, logEntry + '\n');
    }
    
    /**
     * Generate random table settings for simulation
     * Always uses practice mode so bots get chips
     */
    _generateRandomSettings() {
        // Random table names
        const tableNames = [
            'Chaos Test', 'Bot Battle', 'Stress Test', 'Showdown', 'All-In Madness',
            'High Stakes', 'Low Roller', 'Mixed Nuts', 'River Rats', 'Bluff City',
            'Fold Mountain', 'Call Station', 'Raise Factory', 'Check Valley', 'Pot Luck'
        ];
        
        // Random max players (3-9)
        const maxPlayers = Math.floor(Math.random() * 7) + 3; // 3 to 9
        
        // Random blind levels
        const blindLevels = [
            { small: 5, big: 10 },
            { small: 10, big: 20 },
            { small: 25, big: 50 },
            { small: 50, big: 100 },
            { small: 100, big: 200 },
            { small: 250, big: 500 },
            { small: 500, big: 1000 },
            { small: 1000, big: 2000 }
        ];
        const blindLevel = blindLevels[Math.floor(Math.random() * blindLevels.length)];
        
        // Random buy-in (20x to 200x big blind)
        const buyInMultiplier = Math.floor(Math.random() * 181) + 20; // 20 to 200
        const buyIn = blindLevel.big * buyInMultiplier;
        
        // Random turn time (5-30 seconds)
        const turnTimeSeconds = Math.floor(Math.random() * 26) + 5; // 5 to 30
        const turnTimeLimit = turnTimeSeconds * 1000;
        
        // Blind increase interval - ALWAYS enabled for simulation to test timer functionality
        // Use shorter intervals (1-5 minutes) for simulation so changes are visible during testing
        const blindIncreaseMinutes = Math.floor(Math.random() * 5) + 1; // 1 to 5 minutes
        const blindIncreaseInterval = blindIncreaseMinutes * 60 * 1000;
        
        return {
            tableName: tableNames[Math.floor(Math.random() * tableNames.length)],
            maxPlayers,
            smallBlind: blindLevel.small,
            bigBlind: blindLevel.big,
            buyIn,
            turnTimeLimit,
            blindIncreaseInterval
        };
    }
    
    /**
     * Start a simulation
     * @param {Object} options - Simulation options
     * @param {string} options.creatorId - User ID of the creator (will spectate)
     * @param {string} options.tableName - Name for the table
     * @param {number} options.maxPlayers - Number of seats (3-9)
     * @param {number} options.smallBlind - Small blind amount
     * @param {number} options.bigBlind - Big blind amount
     * @param {number} options.buyIn - Buy-in amount per player
     * @param {number} options.turnTimeLimit - Turn time in ms
     * @param {number} options.socketBotRatio - Ratio of socket bots (0-1, e.g. 0.5 = 50% socket bots)
     */
    async startSimulation(options) {
        const { creatorId, socketBotRatio = 0.5 } = options;
        
        // Generate random table settings as FALLBACK only
        const randomSettings = this._generateRandomSettings();
        
        // USE client-provided values if they exist, otherwise use random
        // Client UI randomizes values and shows them to user - we use THOSE values
        const tableName = options.tableName || randomSettings.tableName;
        const maxPlayers = options.maxPlayers || randomSettings.maxPlayers;
        const smallBlind = options.smallBlind || randomSettings.smallBlind;
        const bigBlind = options.bigBlind || randomSettings.bigBlind;
        const buyIn = options.buyIn || randomSettings.buyIn;
        const turnTimeLimit = options.turnTimeLimit || randomSettings.turnTimeLimit;
        const blindIncreaseInterval = options.blindIncreaseInterval !== undefined 
            ? options.blindIncreaseInterval : randomSettings.blindIncreaseInterval;
        
        // Log ACTUAL values being used (not randomSettings which may differ!)
        this.log('INFO', 'Starting simulation with ACTUAL settings...', {
            creatorId,
            tableName,
            maxPlayers,
            smallBlind,
            bigBlind,
            buyIn,  // ACTUAL buy-in being used
            turnTimeLimit,
            blindIncreaseInterval,
            socketBotRatio,
            source: {
                tableName: options.tableName ? 'client' : 'random',
                maxPlayers: options.maxPlayers ? 'client' : 'random',
                smallBlind: options.smallBlind ? 'client' : 'random',
                bigBlind: options.bigBlind ? 'client' : 'random',
                buyIn: options.buyIn ? 'client' : 'random',
                turnTimeLimit: options.turnTimeLimit ? 'client' : 'random'
            }
        });
        
        // Create the table in practice mode
        // GameManager.createTable returns the table object directly (not { success, tableId, table })
        // In fast mode, shorten all timers significantly
        const table = this.gameManager.createTable({
            name: `[SIM] ${tableName}`,
            maxPlayers,
            smallBlind,
            bigBlind,
            buyIn,
            isPrivate: true,
            practiceMode: true,
            turnTimeLimit: this.fastMode ? 100 : turnTimeLimit, // 100ms for fast mode simulations (10x faster)
            blindIncreaseInterval: this.fastMode ? 30000 : blindIncreaseInterval, // 30 sec blind increase in fast mode
            readyUpDuration: this.fastMode ? 5000 : 60000, // 5 sec ready-up in fast mode
            countdownDuration: this.fastMode ? 3000 : 10000, // 3 sec countdown in fast mode
            creatorId,
            isSimulation: true,
            onPauseSimulation: null // Will be set after table is created
        });
        
        if (!table || !table.id) {
            this.log('ERROR', 'Failed to create simulation table', { error: 'createTable returned null or invalid table' });
            return { success: false, error: 'Failed to create table' };
        }
        
        const tableId = table.id;
        
        // Set the pause callback now that we have the tableId
        table.onPauseSimulation = (reason) => {
            // Pause simulation when issues are detected
            this.pauseSimulation(tableId, reason);
        };
        
        // Verify table settings were set correctly
        this.log('INFO', 'Table created with settings', { 
            tableId: table.id, 
            isSimulation: table.isSimulation,
            tableBuyIn: table.buyIn,  // VERIFY this matches our buyIn
            requestedBuyIn: buyIn,
            match: table.buyIn === buyIn
        });
        
        this.log('INFO', 'Simulation table created', { tableId, tableName: table.name });
        
        // Calculate bot distribution
        // NOTE: Only 3 regular bot profiles exist (tex, lazy_larry, pickles)
        // So we cap regular bots at 3 and fill the rest with socket bots
        const totalBots = maxPlayers;
        const idealRegularBots = Math.floor(totalBots * (1 - socketBotRatio));
        const regularBotCount = Math.min(idealRegularBots, 3); // Cap at 3 available profiles
        const socketBotCount = totalBots - regularBotCount;
        
        this.log('INFO', 'Bot distribution', { 
            totalBots, 
            socketBots: socketBotCount, 
            regularBots: regularBotCount 
        });
        
        // Store simulation data
        const simulation = {
            tableId,
            creatorId,
            startTime: Date.now(),
            socketBots: [],
            regularBotCount,
            socketBotCount,
            buyIn,
            status: 'spawning',
            gamesPlayed: 0,
            fastMode: this.fastMode,
            originalSmallBlind: smallBlind,  // Store original blinds for reference
            originalBigBlind: bigBlind,
            isRestarting: false,  // Guard to prevent multiple simultaneous restarts
            isPaused: false,      // Pause flag
            pauseReason: null,    // Reason for pause
            pausedAt: null        // When paused
        };
        this.activeSimulations.set(tableId, simulation);
        
        // CRITICAL: Initialize simulation counters on table for client display
        table.simulationGamesPlayed = 0;
        table.simulationMaxGames = this.maxGames;
        table.simulationStartTime = Date.now();  // Start timer for client display
        
        // Set up auto-restart callback on the table
        this._setupAutoRestart(table, simulation);
        
        // Spawn bots in BACKGROUND - don't wait, return immediately so user sees the table
        // Bots will join one by one with visible delays
        this._spawnBotsInBackground(simulation, creatorId, buyIn);
        
        return {
            success: true,
            tableId,
            tableName: table.name,
            regularBots: regularBotCount,
            socketBots: socketBotCount,
            status: 'spawning', // Bots are joining in background
            // CRITICAL: Send actual random values so client can display them
            settings: {
                maxPlayers,
                smallBlind,
                bigBlind,
                buyIn,
                turnTimeLimit: this.fastMode ? 100 : turnTimeLimit, // 100ms for fast mode simulations
                blindIncreaseInterval: this.fastMode ? 30000 : blindIncreaseInterval
            }
        };
    }
    
    /**
     * Spawn bots in background with visible delays
     * Called after startSimulation returns so user sees bots join one by one
     */
    async _spawnBotsInBackground(simulation, creatorId, buyIn) {
        const { tableId, regularBotCount, socketBotCount } = simulation;
        // Only these 3 bot profiles exist in BotPlayer.js
        const botProfiles = ['tex', 'lazy_larry', 'pickles'];
        
        this.log('INFO', 'Starting background bot spawn', { tableId, regularBots: regularBotCount, socketBots: socketBotCount });
        
        // IMPORTANT: Add regular bots FIRST before socket bots join
        // This is because socket bots count as "human players" and would block bot approval
        // Regular bots auto-approve when only the creator is at the table
        
        let regularAdded = 0;
        let socketAdded = 0;
        
        // Phase 1: Add all regular bots first
        for (let i = 0; i < regularBotCount && i < botProfiles.length; i++) {
            const botProfile = botProfiles[i % botProfiles.length];
            const result = await this.gameManager.inviteBot(tableId, botProfile, creatorId, buyIn);
            
            if (result.success && result.seatIndex !== undefined) {
                // For simulation tables, bots auto-approve when only creator exists
                this.log('INFO', `Regular bot joined: ${botProfile}`, { seatIndex: result.seatIndex });
                regularAdded++;
            } else {
                this.log('WARN', `Failed to add regular bot: ${botProfile}`, { error: result.error });
            }
            
            // Small delay between bots
            await new Promise(r => setTimeout(r, 800 + Math.random() * 500));
        }
        
        // Phase 2: Add socket bots after regular bots
        // Each bot gets different network conditions to simulate real-world variety
        const networkProfiles = [
            { name: 'GoodConnection', latency: 30, jitter: 20, disconnectChance: 0.005 },
            { name: 'AverageConnection', latency: 80, jitter: 50, disconnectChance: 0.01 },
            { name: 'PoorConnection', latency: 150, jitter: 100, disconnectChance: 0.02 },
            { name: 'MobileConnection', latency: 200, jitter: 150, disconnectChance: 0.03 },
            { name: 'UnstableConnection', latency: 100, jitter: 200, disconnectChance: 0.05 },
            { name: 'VPNConnection', latency: 250, jitter: 80, disconnectChance: 0.015 },
        ];
        
        for (let i = 0; i < socketBotCount; i++) {
            // Assign network profile (cycles through profiles)
            const profile = networkProfiles[i % networkProfiles.length];
            
            try {
                const bot = new SocketBot({
                    serverUrl: this.serverUrl,
                    name: `NetPlayer_${i + 1}`,
                    minDelay: simulation.fastMode ? 50 : 800,
                    maxDelay: simulation.fastMode ? 200 : 2500,
                    aggressiveness: 0.4 + Math.random() * 0.4,  // Increased from 0.2-0.6 to 0.4-0.8 (more aggressive, fold less)
                    fastMode: simulation.fastMode,
                    // Network simulation (reduced in fast mode)
                    networkLatency: simulation.fastMode ? 10 : profile.latency,
                    latencyJitter: simulation.fastMode ? 5 : profile.jitter,
                    disconnectChance: simulation.fastMode ? 0 : profile.disconnectChance, // No chaos in fast mode
                    reconnectMinTime: 3000,
                    reconnectMaxTime: 15000,
                    enableChaos: !simulation.fastMode, // Disable chaos in fast mode for speed
                    logFile: path.join(__dirname, '../../logs/socketbot.log')
                });
                
                this.log('INFO', `Creating socket bot with ${profile.name} profile`, {
                    name: bot.name,
                    latency: profile.latency,
                    jitter: profile.jitter,
                    disconnectChance: `${(profile.disconnectChance * 100).toFixed(1)}%`
                });
                
                await bot.connect();
                await bot.register();
                await bot.joinTable(tableId, buyIn);
                
                simulation.socketBots.push(bot);
                this.log('INFO', `Socket bot joined: ${bot.name}`, { seatIndex: bot.seatIndex });
                socketAdded++;
            } catch (error) {
                this.log('ERROR', `Failed to add socket bot`, { error: error.message });
            }
            
            // 1-2 second delay between socket bots
            await new Promise(r => setTimeout(r, 1000 + Math.random() * 1000));
        }
        
        simulation.status = 'ready';
        const table = this.gameManager.tables.get(tableId);
        this.log('INFO', 'All bots joined, auto-starting game...', {
            tableId,
            seatedPlayers: table?.getSeatedPlayerCount() || 0,
            regularBots: regularAdded,
            socketBots: socketAdded
        });
        
        // Auto-start the game after a short delay for spectators to see all bots
        const startDelay = simulation.fastMode ? 500 : 2000;
        setTimeout(() => {
            if (table && table.phase === 'waiting') {
                // Start ready-up phase (bots and socket bots will auto-ready)
                const result = table.startReadyUp(creatorId);
                if (result.success) {
                    this.log('INFO', 'Ready-up phase started automatically', { tableId });
                } else {
                    this.log('WARN', 'Failed to auto-start ready-up', { error: result.error });
                }
            }
        }, startDelay);
    }
    
    /**
     * Set up auto-restart when a game ends (winner determined)
     * This allows simulation to play multiple games continuously
     */
    _setupAutoRestart(table, simulation) {
        if (!this.autoRestart) return;
        
        const tableId = table.id;
        
        // CRITICAL: Hook into onGameOver callback instead of polling
        // This is more reliable and immediate
        // NOTE: SocketHandler will wrap this callback and call it after notifying clients
        // SocketHandler preserves existing callbacks, so we need to check if it's already set up
        const existingOnGameOver = table.onGameOver;
        this.log('INFO', `Setting up auto-restart callback. Existing onGameOver: ${existingOnGameOver ? 'EXISTS' : 'NONE'}`, { tableId });
        
        // CRITICAL: Create our callback function
        const simulationCallback = (winner) => {
            // Check if simulation is still active
            if (!this.activeSimulations.has(tableId)) {
                this.log('WARN', 'Simulation no longer active, skipping restart', { tableId });
                return;
            }
            
            const currentTable = this.gameManager.tables.get(tableId);
            if (!currentTable) {
                this.log('WARN', 'Table not found, skipping restart', { tableId });
                return;
            }
            
            // CRITICAL: Prevent multiple simultaneous restarts
            if (simulation.isRestarting) {
                this.log('WARN', 'Restart already in progress, skipping duplicate callback', { tableId });
                return;
            }
            
            // Game over detected via callback - restart immediately
            simulation.gamesPlayed++;
            
            // CRITICAL: Update table's simulation counter for client display
            currentTable.simulationGamesPlayed = simulation.gamesPlayed;
            currentTable.simulationMaxGames = this.maxGames;
            this.log('INFO', `Updated simulation counter on table: ${simulation.gamesPlayed}/${this.maxGames}`, {
                tableId,
                gamesPlayed: simulation.gamesPlayed,
                maxGames: this.maxGames
            });
            // Broadcast state update so client sees new counter
            // CRITICAL: Force immediate state broadcast to ensure counter is visible
            if (currentTable.onStateChange) {
                this.log('DEBUG', 'Calling onStateChange to broadcast counter update', {
                    tableId,
                    gamesPlayed: simulation.gamesPlayed,
                    maxGames: this.maxGames,
                    tableSimulationGamesPlayed: currentTable.simulationGamesPlayed,
                    tableSimulationMaxGames: currentTable.simulationMaxGames
                });
                currentTable.onStateChange();
            } else {
                this.log('WARN', 'onStateChange callback not available - counter may not update', { tableId });
            }
            
            this.log('INFO', `Game ${simulation.gamesPlayed} COMPLETE - Winner: ${winner.name}`, {
                tableId,
                winner: winner.name,
                winnerChips: winner.chips,
                gamesPlayed: simulation.gamesPlayed,
                maxGames: this.maxGames,
                progress: `${simulation.gamesPlayed}/${this.maxGames}`
            });
            
            if (simulation.gamesPlayed >= this.maxGames) {
                this.log('INFO', `Reached max games (${this.maxGames}), stopping simulation`, { tableId });
                this.stopSimulation(tableId);
                return;
            }
            
            // Reset all players to starting chips and start new game
            const restartDelay = simulation.fastMode ? 1000 : 3000;
            setTimeout(() => this._restartGame(simulation), restartDelay);
        };
        
        // CRITICAL: If SocketHandler has already set up (existingOnGameOver exists and is not our callback),
        // we need to wrap it. SocketHandler will call originalOnGameOver, so we set ours as the "original"
        // and wrap SocketHandler's callback to call ours.
        // If we set up first, SocketHandler will preserve our callback.
        // CRITICAL: Only set up if not already set up to prevent duplicate callbacks
        if (existingOnGameOver && existingOnGameOver !== simulationCallback) {
            // Check if it's already wrapped (contains our callback)
            const isAlreadyWrapped = existingOnGameOver.toString().includes('simulationCallback') || 
                                    existingOnGameOver.toString().includes('_restartGame');
            if (isAlreadyWrapped) {
                this.log('INFO', 'Auto-restart callback already wrapped, skipping setup', { tableId });
                return;
            }
            
            // SocketHandler's callback exists - we need to ensure both are called
            // SocketHandler calls originalOnGameOver, so we set ours as original and wrap SocketHandler's
            const socketHandlerCallback = existingOnGameOver;
            table.onGameOver = (winner) => {
                // Call SocketHandler's callback first (notifies clients)
                socketHandlerCallback(winner);
                // Then call our callback (restarts game)
                simulationCallback(winner);
            };
        } else if (!existingOnGameOver || existingOnGameOver === simulationCallback) {
            // No existing callback or it's already ours - just set it
            table.onGameOver = simulationCallback;
        } else {
            // Already set up with a different callback - don't override
            this.log('WARN', 'onGameOver already set with different callback, not overriding', { tableId });
        }
        
        this.log('INFO', 'Auto-restart callback set up', { tableId });
    }
    
    /**
     * Restart the game with fresh chips for everyone
     * NEW: Randomizes settings and bot count for each new game
     */
    async _restartGame(simulation) {
        const { tableId, creatorId } = simulation;
        const table = this.gameManager.tables.get(tableId);
        
        if (!table) {
            this.log('ERROR', 'Cannot restart - table not found', { tableId });
            return;
        }
        
        // CRITICAL: Guard against multiple simultaneous restarts
        if (simulation.isRestarting) {
            this.log('WARN', 'Restart already in progress, skipping duplicate restart', { tableId });
            return;
        }
        
        simulation.isRestarting = true;
        
        try {
            this.log('INFO', `Restarting game ${simulation.gamesPlayed + 1} - randomizing settings and bots`, { tableId });
        
        // Generate NEW random settings for this game
        const newSettings = this._generateRandomSettings();
        const newMaxPlayers = newSettings.maxPlayers;
        const newBuyIn = newSettings.buyIn;
        const newSmallBlind = newSettings.smallBlind;
        const newBigBlind = newSettings.bigBlind;
        const newTurnTimeLimit = newSettings.turnTimeLimit;
        const newBlindIncreaseInterval = newSettings.blindIncreaseInterval;
        
        // Randomize socket bot ratio for this game (0.3 to 0.7)
        const newSocketBotRatio = 0.3 + Math.random() * 0.4;
        
        // Keep original bot distribution
        const newTotalBots = newMaxPlayers;
        const botProfiles = ['tex', 'lazy_larry', 'pickles'];
        const idealRegularBots = Math.floor(newTotalBots * (1 - newSocketBotRatio));
        const newRegularBotCount = Math.min(idealRegularBots, botProfiles.length);
        const newSocketBotCount = newTotalBots - newRegularBotCount;
        
        this.log('INFO', 'New game settings', {
            gameNumber: simulation.gamesPlayed + 1,
            maxPlayers: newMaxPlayers,
            smallBlind: newSmallBlind,
            bigBlind: newBigBlind,
            buyIn: newBuyIn,
            regularBots: newRegularBotCount,
            socketBots: newSocketBotCount,
            socketBotRatio: newSocketBotRatio.toFixed(2)
        });
        
        // Update table settings with new random values
        table.maxPlayers = newMaxPlayers;
        table.smallBlind = newSmallBlind;
        table.bigBlind = newBigBlind;
        table.buyIn = newBuyIn;
        table.turnTimeLimit = newTurnTimeLimit;
        table.blindIncreaseInterval = newBlindIncreaseInterval;
        table.minRaise = newBigBlind;
        
        // CRITICAL: Preserve fast mode settings for simulations
        // Fast mode shortens ready-up and countdown timers for faster games
        if (this.fastMode) {
            table.readyUpDuration = 5000; // 5 sec ready-up in fast mode
            table.startDelaySeconds = 3; // 3 sec countdown in fast mode
            // Also cap turn time at 5 seconds in fast mode
            if (table.turnTimeLimit > 5000) {
                table.turnTimeLimit = 5000;
            }
            // Use 30 sec blind increase in fast mode
            if (table.blindIncreaseInterval > 30000) {
                table.blindIncreaseInterval = 30000;
            }
        }
        
        // CRITICAL: Reset blind level and initial blinds to prevent exponential growth
        table.blindLevel = 1;
        table.initialSmallBlind = newSmallBlind;
        table.initialBigBlind = newBigBlind;
        
        // Update simulation tracking (for reference, but won't be used on next restart)
        simulation.buyIn = newBuyIn;
        simulation.originalSmallBlind = newSmallBlind;
        simulation.originalBigBlind = newBigBlind;
        
        // Update simulation tracking (for reference, but won't be used on next restart)
        simulation.buyIn = newBuyIn;
        simulation.originalSmallBlind = newSmallBlind;
        simulation.originalBigBlind = newBigBlind;
        
        // Adjust table seats array size if maxPlayers changed
        if (table.seats.length !== newMaxPlayers) {
            if (table.seats.length > newMaxPlayers) {
                // Remove excess seats (from the end)
                for (let i = newMaxPlayers; i < table.seats.length; i++) {
                    const seat = table.seats[i];
                    if (seat) {
                        // If it's a socket bot, disconnect it
                        if (!seat.isBot && seat.name && seat.name.startsWith('NetPlayer')) {
                            const bot = simulation.socketBots.find(b => b.userId === seat.playerId);
                            if (bot) {
                                this.log('INFO', `Disconnecting excess socket bot: ${seat.name}`, { seatIndex: i });
                                bot.disconnect();
                            }
                        }
                        // If it's a regular bot, remove it
                        if (seat.isBot) {
                            this.log('INFO', `Removing excess regular bot: ${seat.name}`, { seatIndex: i });
                            this.gameManager.leaveTable(seat.playerId, true); // Skip empty check during restart
                        }
                    }
                }
                table.seats = table.seats.slice(0, newMaxPlayers);
            } else {
                // Expand seats array if maxPlayers increased
                while (table.seats.length < newMaxPlayers) {
                    table.seats.push(null);
                }
            }
        }
        
        // CRITICAL: Clear ALL seats before restart to ensure clean state
        // This prevents "already at this table" errors and ensures bots are properly reset
        // We need to explicitly clear seats because eliminated players might not be removed by leaveTable
        this.log('INFO', 'Clearing all seats before restart', { tableId });
        
        // Disconnect ALL socket bots first (we'll add the correct ones back)
        const connectedSocketBots = simulation.socketBots.filter(bot => bot.socket && bot.socket.connected);
        for (const bot of connectedSocketBots) {
            if (bot) {
                this.log('INFO', `Disconnecting socket bot before restart: ${bot.name}`, { userId: bot.userId });
                bot.disconnect();
            }
        }
        
        // Clean up disconnected socket bots from simulation tracking
        simulation.socketBots = simulation.socketBots.filter(bot => {
            if (!bot.socket || !bot.socket.connected) {
                return false;
            }
            return true;
        });
        
        // CRITICAL: Explicitly clear ALL seats (set to null) before trying to add new bots
        // This ensures eliminated players and old bots are completely removed
        // NOTE: Spectators are stored separately in table.spectators (Map), NOT in table.seats
        // Clearing seats does NOT affect spectators - they remain untouched
        const spectatorCountBefore = table.spectators.size;
        for (let i = 0; i < table.seats.length; i++) {
            const seat = table.seats[i];
            if (seat) {
                this.log('DEBUG', `Clearing seat ${i}: ${seat.name}`, { 
                    isBot: seat.isBot, 
                    isActive: seat.isActive,
                    isSocketBot: seat.name && seat.name.startsWith('NetPlayer')
                });
                // For regular bots, also call leaveTable to clean up BotManager state
                if (seat.isBot) {
                    this.gameManager.leaveTable(seat.playerId, true);
                }
                // Explicitly clear the seat
                table.seats[i] = null;
            }
        }
        // Verify spectators are preserved
        if (table.spectators.size !== spectatorCountBefore) {
            this.log('WARN', `Spectator count changed during seat clearing! Before: ${spectatorCountBefore}, After: ${table.spectators.size}`, { tableId });
        } else {
            this.log('DEBUG', `Spectators preserved: ${spectatorCountBefore} spectators remain`, { tableId });
        }
        
        // CRITICAL: Wait for bot removals to complete before proceeding
        // This ensures seats are cleared and BotManager state is updated
        await new Promise(r => setTimeout(r, 200));
        
        // CRITICAL: Clear BotManager state for this table to prevent "already at this table" errors
        this.gameManager.botManager.clearPendingBots(tableId);
        const tableBots = this.gameManager.botManager.activeBots.get(tableId);
        if (tableBots) {
            tableBots.clear();
            this.log('DEBUG', 'Cleared BotManager activeBots for table', { tableId });
        }
        
        // CRITICAL: DO NOT reset chips here - let handleGameStart() do it!
        // handleGameStart() will:
        // 1. Reset totalStartingChips to 0
        // 2. Reset chips to this.buyIn for all active players
        // 3. Calculate totalStartingChips correctly
        // If we reset chips here, we might reset them to the wrong value or before buyIn is updated
        // Just reset game state, but let handleGameStart() handle chip resets
        for (let i = 0; i < table.seats.length; i++) {
            const seat = table.seats[i];
            if (!seat) continue;
            
            // Reset game state only - DON'T reset chips here!
            seat.isFolded = false;
            seat.isAllIn = false;
            // CRITICAL: Only set isActive = true if the seat was already active
            // Don't re-activate eliminated players - let handleGameStart() handle that
            // This prevents counting eliminated players (with 0 chips) in totalStartingChips
            if (seat.isActive !== false) {
                seat.isActive = true;  // Keep active players active
            }
            seat.currentBet = 0;
            seat.totalBet = 0;
            seat.cards = [];
            // CRITICAL FIX: In simulation, all bots (regular and socket) should auto-ready
            seat.isReady = seat.isBot || (seat.name && seat.name.startsWith('NetPlayer'));
            
            this.log('DEBUG', `Reset game state for ${seat.name} (chips will be reset by handleGameStart)`, { 
                seatIndex: i, 
                currentChips: seat.chips, 
                buyIn: newBuyIn, 
                isActive: seat.isActive 
            });
        }
        
        // CRITICAL: Wait a bit for bot removals to complete before checking which bots are seated
        await new Promise(r => setTimeout(r, 100));
        
        // Add regular bots
        // CRITICAL: All bots were removed above, so we can add the correct number now
        const { BOT_PROFILES } = require('../game/BotPlayer');
        const availableBotProfiles = ['tex', 'lazy_larry', 'pickles']; // Available bot profiles
        
        if (newRegularBotCount > 0) {
            this.log('INFO', `Adding ${newRegularBotCount} regular bot(s)`, { tableId });
            
            let added = 0;
            for (let i = 0; i < newRegularBotCount && i < availableBotProfiles.length; i++) {
                const botProfile = availableBotProfiles[i];
                const result = await this.gameManager.inviteBot(tableId, botProfile, creatorId, newBuyIn);
                if (result.success) {
                    this.log('INFO', `Added regular bot: ${botProfile}`, { seatIndex: result.seatIndex });
                    added++;
                } else {
                    this.log('WARN', `Failed to add regular bot: ${botProfile}`, { error: result.error });
                }
                // Small delay between bot additions to prevent race conditions
                await new Promise(r => setTimeout(r, 300));
            }
            
            if (added < newRegularBotCount) {
                this.log('WARN', `Could only add ${added} of ${newRegularBotCount} regular bots needed`, { 
                    availableBots: availableBotProfiles.length
                });
            }
        }
        
        // Add socket bots
        // CRITICAL: All socket bots were disconnected above, so we can add the correct number now
        if (newSocketBotCount > 0) {
            this.log('INFO', `Adding ${newSocketBotCount} socket bot(s)`, { tableId });
            await this._addSocketBots(simulation, newSocketBotCount, newBuyIn);
        }
        
        // Update simulation tracking
        simulation.regularBotCount = newRegularBotCount;
        simulation.socketBotCount = newSocketBotCount;
        
        // CRITICAL: Clear pending bots before resetting table
        // This prevents "already pending approval" errors on restart
        this.gameManager.botManager.clearPendingBots(tableId);
        
        // Reset table state completely
        table.phase = 'waiting';
        table.pot = 0;
        table.currentBet = 0;
        table.communityCards = [];
        table.currentPlayerIndex = -1;
        table.dealerIndex = (table.dealerIndex + 1) % newMaxPlayers; // Rotate dealer
        table.lastRaiserIndex = -1;
        // CRITICAL: Update buyIn to match new game settings
        table.buyIn = newBuyIn;
        // CRITICAL: Reset gameStarted flag so handleGameStart() will reset chips properly
        table.gameStarted = false;
        this.log('DEBUG', 'Reset gameStarted to false and updated buyIn for new game', { 
            tableId, 
            oldBuyIn: table.buyIn, 
            newBuyIn 
        });
        
        // CRITICAL: Reset blind level and initial blinds BEFORE clearing timers
        // This prevents the blind timer from using old values if it fires during reset
        table.blindLevel = 1;
        table.initialSmallBlind = newSmallBlind;
        table.initialBigBlind = newBigBlind;
        table.smallBlind = newSmallBlind; // Ensure current blinds match new settings
        table.bigBlind = newBigBlind;
        table.minRaise = newBigBlind;
        
        // Clear any pending timers (must be done AFTER resetting blind values)
        if (table.turnTimeout) {
            clearTimeout(table.turnTimeout);
            table.turnTimeout = null;
        }
        if (table.blindIncreaseTimer) {
            clearTimeout(table.blindIncreaseTimer);
            table.blindIncreaseTimer = null;
        }
        table.nextBlindIncreaseAt = null;
        
        this.log('INFO', 'Timers cleared, table reset', {
            tableId,
            newBlinds: `${newSmallBlind}/${newBigBlind}`,
            blindLevel: table.blindLevel
        });
        
        // Broadcast reset to spectators
        if (table.onStateChange) {
            table.onStateChange();
        }
        
        // Auto-start the new game after bots are added
        // CRITICAL: Wait for all bots to be seated before starting
        const startDelay = simulation.fastMode ? 2000 : 5000;
        setTimeout(async () => {
            if (table.phase === 'waiting') {
                // Verify we have enough players before starting
                const seatedCount = table.seats.filter(s => s !== null).length;
                const requiredPlayers = Math.min(2, newMaxPlayers);
                
                if (seatedCount < requiredPlayers) {
                    this.log('WARN', `Not enough players to start game ${simulation.gamesPlayed + 1}`, {
                        seatedCount,
                        requiredPlayers,
                        expectedRegular: newRegularBotCount,
                        expectedSocket: newSocketBotCount
                    });
                    // Retry after a delay
                    setTimeout(() => {
                        if (table.phase === 'waiting') {
                            const retryResult = table.startReadyUp(creatorId);
                            if (retryResult.success) {
                                this.log('INFO', `Game ${simulation.gamesPlayed + 1} started on retry`, { tableId });
                                this._setupAutoRestart(table, simulation);
                            } else {
                                this.log('ERROR', `Failed to start game ${simulation.gamesPlayed + 1} on retry`, { error: retryResult.error });
                            }
                        }
                    }, 2000);
                    return;
                }
                
                const result = table.startReadyUp(creatorId);
                if (result.success) {
                    this.log('INFO', `Game ${simulation.gamesPlayed + 1} starting with new settings...`, { 
                        tableId,
                        maxPlayers: newMaxPlayers,
                        blinds: `${newSmallBlind}/${newBigBlind}`,
                        buyIn: newBuyIn,
                        bots: `${newRegularBotCount} regular + ${newSocketBotCount} socket`,
                        seatedPlayers: seatedCount
                    });
                    // Continue the game-over check loop
                    this._setupAutoRestart(table, simulation);
                } else {
                    this.log('ERROR', `Failed to start game ${simulation.gamesPlayed + 1}`, { error: result.error });
                }
            }
        }, startDelay);
        
        // CRITICAL: Reset restart guard after a delay to allow restart to complete
        setTimeout(() => {
            simulation.isRestarting = false;
        }, startDelay + 5000);
        } catch (error) {
            this.log('ERROR', 'Error during restart', { tableId, error: error.message });
            simulation.isRestarting = false;
        }
    }
    
    /**
     * Add socket bots to a simulation table
     */
    async _addSocketBots(simulation, count, buyIn) {
        const { tableId } = simulation;
        const networkProfiles = [
            { name: 'GoodConnection', latency: 30, jitter: 20, disconnectChance: 0.005 },
            { name: 'AverageConnection', latency: 80, jitter: 50, disconnectChance: 0.01 },
            { name: 'PoorConnection', latency: 150, jitter: 100, disconnectChance: 0.02 },
            { name: 'MobileConnection', latency: 200, jitter: 150, disconnectChance: 0.03 },
            { name: 'UnstableConnection', latency: 100, jitter: 200, disconnectChance: 0.05 },
            { name: 'VPNConnection', latency: 250, jitter: 80, disconnectChance: 0.015 },
        ];
        
        const currentSocketCount = simulation.socketBots.filter(b => b.socket && b.socket.connected).length;
        
        for (let i = 0; i < count; i++) {
            const profileIndex = (currentSocketCount + i) % networkProfiles.length;
            const profile = networkProfiles[profileIndex];
            
            try {
                const bot = new SocketBot({
                    serverUrl: this.serverUrl,
                    name: `NetPlayer_${currentSocketCount + i + 1}`,
                    minDelay: simulation.fastMode ? 50 : 800,
                    maxDelay: simulation.fastMode ? 200 : 2500,
                    aggressiveness: 0.4 + Math.random() * 0.4,  // Increased from 0.2-0.6 to 0.4-0.8 (more aggressive, fold less)
                    fastMode: simulation.fastMode,
                    networkLatency: simulation.fastMode ? 10 : profile.latency,
                    latencyJitter: simulation.fastMode ? 5 : profile.jitter,
                    disconnectChance: simulation.fastMode ? 0 : profile.disconnectChance,
                    reconnectMinTime: 3000,
                    reconnectMaxTime: 15000,
                    enableChaos: !simulation.fastMode,
                    logFile: path.join(__dirname, '../../logs/socketbot.log')
                });
                
                await bot.connect();
                await bot.register();
                await bot.joinTable(tableId, buyIn);
                
                simulation.socketBots.push(bot);
                this.log('INFO', `Added socket bot: ${bot.name}`, { seatIndex: bot.seatIndex });
            } catch (error) {
                this.log('ERROR', `Failed to add socket bot`, { error: error.message });
            }
            
            // Small delay between bots
            await new Promise(r => setTimeout(r, 500 + Math.random() * 500));
        }
    }
    
    /**
     * Stop a simulation and clean up
     */
    stopSimulation(tableId, reason = 'max_games_reached') {
        const simulation = this.activeSimulations.get(tableId);
        if (!simulation) {
            this.log('WARN', 'Cannot stop simulation - not found', { tableId, reason });
            return { success: false, error: 'Simulation not found' };
        }
        
        const table = this.gameManager.tables.get(tableId);
        const duration = Date.now() - simulation.startTime;
        
        this.log('INFO', 'Stopping simulation', { 
            tableId, 
            reason, 
            gamesPlayed: simulation.gamesPlayed,
            maxGames: this.maxGames,
            duration: `${Math.floor(duration / 1000)}s`,
            durationMs: duration
        });
        
        // CRITICAL: Notify spectators that simulation has ended
        // This allows them to leave the table or restart
        if (table && this.io) {
            const spectatorRoom = `spectator:${tableId}`;
            const spectatorSockets = this.io.sockets.adapter.rooms.get(spectatorRoom);
            const spectatorCount = spectatorSockets ? spectatorSockets.size : 0;
            
            this.log('INFO', 'Emitting simulation_ended event to spectators', {
                tableId,
                spectatorRoom,
                spectatorCount,
                reason,
                gamesPlayed: simulation.gamesPlayed,
                maxGames: this.maxGames,
                duration: Math.floor(duration / 1000)
            });
            
            const endMessage = reason === 'max_games_reached' 
                ? `Simulation complete! ${simulation.gamesPlayed} games played in ${Math.floor(duration / 1000)}s.`
                : `Simulation has ended: ${reason}.`;
            
            this.io.to(spectatorRoom).emit('simulation_ended', {
                tableId: tableId,
                reason: reason,
                gamesPlayed: simulation.gamesPlayed,
                maxGames: this.maxGames,
                duration: Math.floor(duration / 1000),
                message: endMessage
            });
            
            this.log('INFO', 'simulation_ended event emitted successfully', { 
                tableId, 
                spectatorRoom,
                spectatorCount,
                reason,
                eventSent: true
            });
        } else {
            this.log('WARN', 'Cannot emit simulation_ended - table or io not available', {
                tableId,
                hasTable: !!table,
                hasIO: !!this.io
            });
        }
        
        // Disconnect all socket bots
        for (const bot of simulation.socketBots) {
            bot.disconnect();
        }
        
        // CRITICAL: Notify spectators via table_closed event before removing table
        // This allows them to leave gracefully
        if (table && this.io) {
            // Get all spectator user IDs
            const spectatorUserIds = Array.from(table.spectators.keys());
            for (const userId of spectatorUserIds) {
                const spectator = table.spectators.get(userId);
                if (spectator && spectator.socketId) {
                    this.io.to(spectator.socketId).emit('table_closed', {
                        tableId: tableId,
                        reason: 'simulation_ended',
                        message: 'Simulation has ended. You can now leave the table.'
                    });
                }
            }
        }
        
        // Remove the table from GameManager
        // Note: GameManager doesn't have closeTable, so we'll just delete it
        // But first, we need to clean up bots and notify
        if (table) {
            // Remove all bots
            for (const seat of table.seats) {
                if (seat && seat.isBot) {
                    table.removePlayer(seat.playerId);
                }
            }
        }
        
        // Delete table from GameManager
        this.gameManager.tables.delete(tableId);
        
        // Remove from active simulations
        this.activeSimulations.delete(tableId);
        
        const simDuration = Date.now() - simulation.startTime;
        this.log('INFO', 'Simulation stopped', { 
            tableId, 
            duration: `${Math.floor(simDuration / 1000)}s`,
            gamesPlayed: simulation.gamesPlayed,
            reason
        });
        
        return { success: true };
    }
    
    /**
     * Get simulation status
     */
    getSimulationStatus(tableId) {
        const simulation = this.activeSimulations.get(tableId);
        if (!simulation) {
            return null;
        }
        
        const table = this.gameManager.tables.get(tableId);
        
        return {
            tableId,
            status: simulation.status,
            socketBots: simulation.socketBots.length,
            regularBots: simulation.regularBotCount,
            duration: Date.now() - simulation.startTime,
            tablePhase: table?.phase,
            handsPlayed: table?.handsPlayed
        };
    }
    
    /**
     * Get all active simulations
     */
    getActiveSimulations() {
        const simulations = [];
        for (const [tableId, sim] of this.activeSimulations) {
            simulations.push(this.getSimulationStatus(tableId));
        }
        return simulations;
    }
    
    /**
     * Pause a simulation - bots will stop taking actions
     */
    pauseSimulation(tableId, reason = 'manual_pause') {
        const simulation = this.activeSimulations.get(tableId);
        if (!simulation) {
            this.log('WARN', 'Cannot pause simulation - not found', { tableId });
            return { success: false, error: 'Simulation not found' };
        }
        
        simulation.isPaused = true;
        simulation.pauseReason = reason;
        simulation.pausedAt = Date.now();
        
        // Set pause state on Table so Unity can read it from table_state
        const table = this.gameManager.tables.get(tableId);
        if (table) {
            table.isPaused = true;
            table.pauseReason = reason;
            
            // CRITICAL: Broadcast table state immediately so Unity sees isPaused in table_state
            if (this.io) {
                // Broadcast to all sockets in table room
                const tableRoom = `table:${tableId}`;
                const spectatorRoom = `spectator:${tableId}`;
                
                // Get state and broadcast to all connected sockets
                const tableSockets = this.io.sockets.adapter.rooms.get(tableRoom);
                if (tableSockets) {
                    for (const socketId of tableSockets) {
                        const socket = this.io.sockets.sockets.get(socketId);
                        if (socket) {
                            // Get userId from socket if available
                            const userId = socket.userId || null;
                            const state = table.getState(userId);
                            socket.emit('table_state', state);
                        }
                    }
                }
                
                // Also broadcast to spectators
                const spectatorSockets = this.io.sockets.adapter.rooms.get(spectatorRoom);
                if (spectatorSockets) {
                    for (const socketId of spectatorSockets) {
                        const socket = this.io.sockets.sockets.get(socketId);
                        if (socket) {
                            const userId = socket.userId || null;
                            const state = table.getState(userId);
                            socket.emit('table_state', state);
                        }
                    }
                }
                
                console.log(`[SimulationManager] Table state broadcasted with isPaused=true to Unity clients`);
            }
        }
        
        // Notify all socket bots to pause
        for (const bot of simulation.socketBots) {
            bot.isPaused = true;
        }
        
        this.log('INFO', 'Simulation paused', { tableId, reason });
        
        // Also emit simulation_paused event for backwards compatibility
        if (this.io) {
            const pauseEvent = {
                tableId,
                reason,
                pausedAt: simulation.pausedAt
            };
            
            const tableRoom = `table:${tableId}`;
            const spectatorRoom = `spectator:${tableId}`;
            this.io.to(tableRoom).emit('simulation_paused', pauseEvent);
            this.io.to(spectatorRoom).emit('simulation_paused', pauseEvent);
        }
        
        return { success: true, reason };
    }
    
    /**
     * Resume a paused simulation
     */
    resumeSimulation(tableId) {
        const simulation = this.activeSimulations.get(tableId);
        if (!simulation) {
            this.log('WARN', 'Cannot resume simulation - not found', { tableId });
            return { success: false, error: 'Simulation not found' };
        }
        
        if (!simulation.isPaused) {
            this.log('WARN', 'Cannot resume simulation - not paused', { tableId });
            return { success: false, error: 'Simulation is not paused' };
        }
        
        const pauseDuration = Date.now() - simulation.pausedAt;
        simulation.isPaused = false;
        simulation.pauseReason = null;
        simulation.pausedAt = null;
        
        // Clear pause state on Table so Unity can resume
        if (table) {
            table.isPaused = false;
            table.pauseReason = null;
        }
        
        // Notify all socket bots to resume
        for (const bot of simulation.socketBots) {
            bot.isPaused = false;
        }
        
        this.log('INFO', 'Simulation resumed', { tableId, pauseDuration: `${Math.floor(pauseDuration / 1000)}s` });
        
        // Notify Unity clients and spectators
        if (this.io) {
            const table = this.gameManager.tables.get(tableId);
            if (table) {
                const resumeEvent = {
                    tableId,
                    pauseDuration
                };
                
                // Emit to table room (where Unity clients are)
                const tableRoom = `table:${tableId}`;
                this.io.to(tableRoom).emit('simulation_resumed', resumeEvent);
                
                // Also emit to spectator room
                const spectatorRoom = `spectator:${tableId}`;
                this.io.to(spectatorRoom).emit('simulation_resumed', resumeEvent);
                
                console.log(`[SimulationManager] Resume event emitted to table:${tableId} and spectator:${tableId}`);
            }
        }
        
        return { success: true, pauseDuration };
    }
    
    /**
     * Check if a simulation is paused
     */
    isSimulationPaused(tableId) {
        const simulation = this.activeSimulations.get(tableId);
        return simulation ? simulation.isPaused : false;
    }
    
    /**
     * Get full simulation report with verification results
     */
    getSimulationReport(tableId) {
        const simulation = this.activeSimulations.get(tableId);
        if (!simulation) {
            return { success: false, error: 'Simulation not found' };
        }
        
        const table = this.gameManager.tables.get(tableId);
        const botSummaries = [];
        let totalIssues = [];
        
        // Collect summaries from all socket bots
        for (const bot of simulation.socketBots) {
            const result = bot.logSummary();
            botSummaries.push(result.summary);
            if (result.issues.length > 0) {
                totalIssues.push({
                    bot: bot.name,
                    issues: result.issues
                });
            }
        }
        
        const report = {
            tableId,
            tableName: table?.name,
            duration: Date.now() - simulation.startTime,
            handsPlayed: table?.handsPlayed || 0,
            status: simulation.status,
            bots: {
                regular: simulation.regularBotCount,
                socket: simulation.socketBots.length
            },
            verification: {
                passed: totalIssues.length === 0,
                issueCount: totalIssues.length,
                issues: totalIssues
            },
            socketBotSummaries: botSummaries
        };
        
        this.log('REPORT', 'Simulation report generated', {
            tableId,
            handsPlayed: report.handsPlayed,
            duration: `${Math.floor(report.duration / 1000)}s`,
            issues: totalIssues.length
        });
        
        return report;
    }
}

module.exports = SimulationManager;

