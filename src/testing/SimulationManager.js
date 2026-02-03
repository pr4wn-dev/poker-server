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
            turnTimeLimit: this.fastMode ? Math.min(turnTimeLimit, 5000) : turnTimeLimit, // 5 sec max in fast mode
            blindIncreaseInterval: this.fastMode ? 30000 : blindIncreaseInterval, // 30 sec blind increase in fast mode
            readyUpDuration: this.fastMode ? 5000 : 60000, // 5 sec ready-up in fast mode
            countdownDuration: this.fastMode ? 3000 : 10000, // 3 sec countdown in fast mode
            creatorId,
            isSimulation: true
        });
        
        if (!table || !table.id) {
            this.log('ERROR', 'Failed to create simulation table', { error: 'createTable returned null or invalid table' });
            return { success: false, error: 'Failed to create table' };
        }
        
        // Verify table settings were set correctly
        this.log('INFO', 'Table created with settings', { 
            tableId: table.id, 
            isSimulation: table.isSimulation,
            tableBuyIn: table.buyIn,  // VERIFY this matches our buyIn
            requestedBuyIn: buyIn,
            match: table.buyIn === buyIn
        });
        
        const tableId = table.id;
        
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
            originalBigBlind: bigBlind
        };
        this.activeSimulations.set(tableId, simulation);
        
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
                turnTimeLimit: this.fastMode ? Math.min(turnTimeLimit, 5000) : turnTimeLimit,
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
                    aggressiveness: 0.2 + Math.random() * 0.4,
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
        // So we don't need to call the original - SocketHandler handles that
        const originalOnGameOver = table.onGameOver;
        this.log('INFO', `Setting up auto-restart callback. Original onGameOver: ${originalOnGameOver ? 'EXISTS' : 'NONE'}`, { tableId });
        table.onGameOver = (winner) => {
            // NOTE: If SocketHandler has set up, it will call us AFTER notifying clients
            // If SocketHandler hasn't set up yet, we'll still restart the game
            // (clients will see game over through state updates)
            
            // Check if simulation is still active
            if (!this.activeSimulations.has(tableId)) return;
            
            const currentTable = this.gameManager.tables.get(tableId);
            if (!currentTable) return;
            
            // Game over detected via callback - restart immediately
            simulation.gamesPlayed++;
            
            this.log('INFO', `Game ${simulation.gamesPlayed} COMPLETE - Winner: ${winner.name}`, {
                tableId,
                winner: winner.name,
                winnerChips: winner.chips,
                gamesPlayed: simulation.gamesPlayed
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
        
        // Track current bots
        const currentRegularBots = table.seats.filter(s => s && s.isBot).length;
        const connectedSocketBots = simulation.socketBots.filter(bot => bot.socket && bot.socket.connected);
        const currentSocketBotCount = connectedSocketBots.length;
        
        // Remove excess regular bots if we have too many
        if (currentRegularBots > newRegularBotCount) {
            const regularBotsToRemove = currentRegularBots - newRegularBotCount;
            let removed = 0;
            for (let i = 0; i < table.seats.length && removed < regularBotsToRemove; i++) {
                const seat = table.seats[i];
                if (seat && seat.isBot) {
                    this.log('INFO', `Removing excess regular bot: ${seat.name}`, { seatIndex: i });
                    this.gameManager.leaveTable(seat.playerId, true); // Skip empty check during restart
                    removed++;
                }
            }
        }
        
        // Remove excess socket bots if we have too many
        if (currentSocketBotCount > newSocketBotCount) {
            const socketBotsToRemove = currentSocketBotCount - newSocketBotCount;
            for (let i = 0; i < socketBotsToRemove; i++) {
                const bot = connectedSocketBots[i];
                if (bot) {
                    this.log('INFO', `Disconnecting excess socket bot: ${bot.name}`, { userId: bot.userId });
                    bot.disconnect();
                }
            }
        }
        
        // Clean up disconnected socket bots from simulation tracking
        simulation.socketBots = simulation.socketBots.filter(bot => {
            if (!bot.socket || !bot.socket.connected) {
                return false;
            }
            return true;
        });
        
        // Reset all existing players to new buy-in
        for (let i = 0; i < table.seats.length; i++) {
            const seat = table.seats[i];
            if (!seat) continue;
            
            // Reset the seat
            const oldChips = seat.chips;
            seat.chips = newBuyIn;
            seat.isFolded = false;
            seat.isAllIn = false;
            seat.isActive = true;  // CRITICAL: Re-activate eliminated players!
            seat.currentBet = 0;
            seat.totalBet = 0;
            seat.cards = [];
            // CRITICAL FIX: In simulation, all bots (regular and socket) should auto-ready
            seat.isReady = seat.isBot || (seat.name && seat.name.startsWith('NetPlayer'));
            
            this.log('DEBUG', `Reset chips for ${seat.name}`, { 
                seatIndex: i, 
                oldChips, 
                newChips: seat.chips, 
                buyIn: newBuyIn, 
                isActive: seat.isActive 
            });
        }
        
        // CRITICAL: Wait a bit for bot removals to complete before checking which bots are seated
        await new Promise(r => setTimeout(r, 100));
        
        // Add missing regular bots
        // CRITICAL: Check which bots are already seated to avoid "already at this table" errors
        // Check by both name and by checking if the bot profile is already at the table
        const alreadySeatedBotNames = table.seats
            .filter(s => s && s.isBot)
            .map(s => s.name.toLowerCase());
        
        // Also check by bot profile name (case-insensitive)
        const alreadySeatedProfiles = new Set();
        for (const seat of table.seats) {
            if (seat && seat.isBot) {
                const seatNameLower = seat.name.toLowerCase();
                // Check if this seat matches any bot profile
                for (const profile of botProfiles) {
                    if (seatNameLower === profile.toLowerCase() || 
                        seatNameLower.includes(profile.toLowerCase()) ||
                        profile.toLowerCase().includes(seatNameLower)) {
                        alreadySeatedProfiles.add(profile.toLowerCase());
                        break;
                    }
                }
            }
        }
        
        const currentRegularCount = alreadySeatedBotNames.length;
        if (currentRegularCount < newRegularBotCount) {
            const regularBotsNeeded = newRegularBotCount - currentRegularCount;
            this.log('INFO', `Adding ${regularBotsNeeded} regular bot(s)`, { tableId });
            
            // Filter out bots that are already seated (check both name and profile)
            const availableBots = botProfiles.filter(profile => 
                !alreadySeatedProfiles.has(profile.toLowerCase()) &&
                !alreadySeatedBotNames.some(name => 
                    name === profile.toLowerCase() || 
                    name.includes(profile.toLowerCase()) ||
                    profile.toLowerCase().includes(name)
                )
            );
            
            let added = 0;
            for (let i = 0; i < regularBotsNeeded && i < availableBots.length; i++) {
                const botProfile = availableBots[i];
                const result = await this.gameManager.inviteBot(tableId, botProfile, creatorId, newBuyIn);
                if (result.success) {
                    this.log('INFO', `Added regular bot: ${botProfile}`, { seatIndex: result.seatIndex });
                    added++;
                    // Add to alreadySeatedProfiles to prevent duplicate adds in the same loop
                    alreadySeatedProfiles.add(botProfile.toLowerCase());
                } else {
                    this.log('WARN', `Failed to add regular bot: ${botProfile}`, { error: result.error });
                }
                await new Promise(r => setTimeout(r, 500));
            }
            
            if (added < regularBotsNeeded) {
                this.log('WARN', `Could only add ${added} of ${regularBotsNeeded} regular bots needed`, { 
                    availableBots: availableBots.length,
                    alreadySeated: Array.from(alreadySeatedProfiles)
                });
            }
        }
        
        // Add missing socket bots
        const currentSocketCount = simulation.socketBots.filter(b => b.socket && b.socket.connected).length;
        if (currentSocketCount < newSocketBotCount) {
            const socketBotsNeeded = newSocketBotCount - currentSocketCount;
            this.log('INFO', `Adding ${socketBotsNeeded} socket bot(s)`, { tableId });
            
            await this._addSocketBots(simulation, socketBotsNeeded, newBuyIn);
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
                    aggressiveness: 0.2 + Math.random() * 0.4,
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
            return { success: false, error: 'Simulation not found' };
        }
        
        const table = this.gameManager.tables.get(tableId);
        
        this.log('INFO', 'Stopping simulation', { tableId, reason });
        
        // CRITICAL: Notify spectators that simulation has ended
        // This allows them to leave the table
        if (table && this.io) {
            const spectatorRoom = `spectator:${tableId}`;
            this.io.to(spectatorRoom).emit('simulation_ended', {
                tableId: tableId,
                reason: reason,
                gamesPlayed: simulation.gamesPlayed,
                maxGames: this.maxGames,
                message: reason === 'max_games_reached' 
                    ? `Simulation complete! ${simulation.gamesPlayed} games played.`
                    : 'Simulation has ended.'
            });
            this.log('INFO', 'Notified spectators of simulation end', { 
                tableId, 
                spectatorRoom,
                reason 
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
        
        const duration = Date.now() - simulation.startTime;
        this.log('INFO', 'Simulation stopped', { 
            tableId, 
            duration: `${Math.floor(duration / 1000)}s`,
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

