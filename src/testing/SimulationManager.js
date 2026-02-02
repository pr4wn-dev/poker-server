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
        this.activeSimulations = new Map(); // tableId -> simulation data
        this.logFile = path.join(__dirname, '../../logs/simulation.log');
        
        // Default settings - simulations always run in fast mode
        this.fastMode = true;       // Fast forward mode (10x speed) - ON by default for simulations
        this.autoRestart = true;    // Auto-start new game when one ends
        this.maxGames = 10;         // Max games per simulation before auto-stop (10 for testing)
        
        this._ensureLogDir();
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
            originalSmallBlind: smallBlind,  // Store original blinds for reset
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
        
        // Hook into the game over scenario
        // CRITICAL: Only check for game over when in WAITING phase (hand fully completed)
        // Don't interrupt hands in progress - players with 0 chips may be all-in with money in pot
        const checkGameOver = () => {
            if (!this.activeSimulations.has(tableId)) return; // Simulation stopped
            
            const currentTable = this.gameManager.tables.get(tableId);
            if (!currentTable) return;
            
            // CRITICAL FIX: Only check during waiting phase (hand complete, no active game)
            // During active phases, players may have 0 chips but still be all-in
            if (currentTable.phase !== 'waiting') {
                // Hand in progress - check again later
                const checkInterval = simulation.fastMode ? 500 : 2000;
                setTimeout(checkGameOver, checkInterval);
                return;
            }
            
            // Count ACTIVE players with chips (not eliminated, not spectating)
            // A player is "out of the game" only if chips = 0 AND isActive = false
            // CRITICAL: Use Table's getActivePlayerCount() method instead of manual filtering
            // This ensures we use the same logic the game uses
            const activePlayerCount = currentTable.getActivePlayerCount();
            const allSeatedPlayers = currentTable.seats.filter(s => s);
            const playersWithChips = allSeatedPlayers.filter(s => s && s.chips > 0);
            const sortedByChips = [...allSeatedPlayers].sort((a, b) => (b.chips || 0) - (a.chips || 0));
            const likelyWinner = sortedByChips[0];
            
            this.log('DEBUG', 'Game over check', {
                tableId,
                phase: currentTable.phase,
                activePlayers: activePlayerCount,
                playersWithChips: playersWithChips.length,
                likelyWinner: likelyWinner?.name,
                likelyWinnerChips: likelyWinner?.chips,
                playerDetails: allSeatedPlayers.map(s => ({ 
                    name: s.name, 
                    chips: s.chips, 
                    isActive: s.isActive,
                    isFolded: s.isFolded,
                    isAllIn: s.isAllIn,
                    isSittingOut: s.isSittingOut
                }))
            });
            
            // Game is over when only 1 player has chips (winner determined)
            // CRITICAL: Check if game was actually started (not just waiting for players)
            // Also check that we have at least 2 seated players to avoid false positives
            const seatedCount = allSeatedPlayers.length;
            const gameWasStarted = currentTable.gameStarted || simulation.gamesPlayed > 0;
            
            if (playersWithChips.length === 1 && seatedCount >= 2 && gameWasStarted) {
                // Game over - one winner!
                simulation.gamesPlayed++;
                
                // Get winner name
                const winnerName = playersWithChips[0]?.name || 'Unknown';
                
                this.log('INFO', `Game ${simulation.gamesPlayed} COMPLETE - Resetting for next game`, {
                    tableId,
                    winner: winnerName,
                    winnerChips: playersWithChips[0]?.chips,
                    gamesPlayed: simulation.gamesPlayed,
                    seatedCount,
                    activePlayerCount
                });
                
                if (simulation.gamesPlayed >= this.maxGames) {
                    this.log('INFO', `Reached max games (${this.maxGames}), stopping simulation`, { tableId });
                    this.stopSimulation(tableId);
                    return;
                }
                
                // Reset all players to starting chips
                const restartDelay = simulation.fastMode ? 1000 : 3000;
                setTimeout(() => this._restartGame(simulation), restartDelay);
                return; // Stop checking - game over detected
            } else if (playersWithChips.length === 0 && seatedCount >= 2 && gameWasStarted) {
                // Edge case: No players with chips (shouldn't happen, but handle it)
                this.log('WARN', 'Game over detected but no players with chips - resetting anyway', {
                    tableId,
                    seatedCount,
                    activePlayerCount
                });
                simulation.gamesPlayed++;
                const restartDelay = simulation.fastMode ? 1000 : 3000;
                setTimeout(() => this._restartGame(simulation), restartDelay);
                return;
            } else {
                // Check again in a bit
                const checkInterval = simulation.fastMode ? 500 : 2000;
                setTimeout(checkGameOver, checkInterval);
            }
        };
        
        // Start checking after first game begins
        const initialDelay = simulation.fastMode ? 5000 : 15000;
        setTimeout(checkGameOver, initialDelay);
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
        
        // Calculate NEW bot distribution for this game
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
        
        // Update table settings
        table.maxPlayers = newMaxPlayers;
        table.smallBlind = newSmallBlind;
        table.bigBlind = newBigBlind;
        table.buyIn = newBuyIn;
        table.turnTimeLimit = newTurnTimeLimit;
        table.blindIncreaseInterval = newBlindIncreaseInterval;
        table.minRaise = newBigBlind;
        
        // CRITICAL: Reset blind level and initial blinds to prevent exponential growth
        table.blindLevel = 1;
        table.initialSmallBlind = newSmallBlind;
        table.initialBigBlind = newBigBlind;
        
        // Update simulation tracking
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
                            this.gameManager.removePlayerFromTable(tableId, seat.playerId);
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
                    this.gameManager.removePlayerFromTable(tableId, seat.playerId);
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
        
        // Add missing regular bots
        const currentRegularCount = table.seats.filter(s => s && s.isBot).length;
        if (currentRegularCount < newRegularBotCount) {
            const regularBotsNeeded = newRegularBotCount - currentRegularCount;
            this.log('INFO', `Adding ${regularBotsNeeded} regular bot(s)`, { tableId });
            
            for (let i = 0; i < regularBotsNeeded; i++) {
                const profileIndex = currentRegularCount + i;
                if (profileIndex < botProfiles.length) {
                    const botProfile = botProfiles[profileIndex];
                    const result = await this.gameManager.inviteBot(tableId, botProfile, creatorId, newBuyIn);
                    if (result.success) {
                        this.log('INFO', `Added regular bot: ${botProfile}`, { seatIndex: result.seatIndex });
                    } else {
                        this.log('WARN', `Failed to add regular bot: ${botProfile}`, { error: result.error });
                    }
                    await new Promise(r => setTimeout(r, 500));
                }
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
        const startDelay = simulation.fastMode ? 1000 : 3000;
        setTimeout(() => {
            if (table.phase === 'waiting') {
                const result = table.startReadyUp(creatorId);
                if (result.success) {
                    this.log('INFO', `Game ${simulation.gamesPlayed + 1} starting with new settings...`, { 
                        tableId,
                        maxPlayers: newMaxPlayers,
                        blinds: `${newSmallBlind}/${newBigBlind}`,
                        buyIn: newBuyIn,
                        bots: `${newRegularBotCount} regular + ${newSocketBotCount} socket`
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
    stopSimulation(tableId) {
        const simulation = this.activeSimulations.get(tableId);
        if (!simulation) {
            return { success: false, error: 'Simulation not found' };
        }
        
        this.log('INFO', 'Stopping simulation', { tableId });
        
        // Disconnect all socket bots
        for (const bot of simulation.socketBots) {
            bot.disconnect();
        }
        
        // Close the table
        this.gameManager.closeTable(tableId);
        
        // Remove from active simulations
        this.activeSimulations.delete(tableId);
        
        const duration = Date.now() - simulation.startTime;
        this.log('INFO', 'Simulation stopped', { 
            tableId, 
            duration: `${Math.floor(duration / 1000)}s` 
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

