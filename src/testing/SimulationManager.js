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
        
        // Generate random table settings for simulation
        const randomSettings = this._generateRandomSettings();
        
        // Use random settings (ignore user-provided values for simulation)
        const tableName = randomSettings.tableName;
        const maxPlayers = randomSettings.maxPlayers;
        const smallBlind = randomSettings.smallBlind;
        const bigBlind = randomSettings.bigBlind;
        const buyIn = randomSettings.buyIn;
        const turnTimeLimit = randomSettings.turnTimeLimit;
        const blindIncreaseInterval = randomSettings.blindIncreaseInterval;
        
        this.log('INFO', 'Starting simulation with RANDOM settings...', {
            creatorId,
            ...randomSettings,
            socketBotRatio
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
        
        // Verify isSimulation flag was set
        this.log('INFO', 'Table isSimulation flag', { tableId: table.id, isSimulation: table.isSimulation });
        
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
            status: 'spawning' // Bots are joining in background
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
        // Check periodically if only 1 player has chips (game over)
        const checkGameOver = () => {
            if (!this.activeSimulations.has(tableId)) return; // Simulation stopped
            
            const currentTable = this.gameManager.tables.get(tableId);
            if (!currentTable) return;
            
            // Count players with chips
            const playersWithChips = currentTable.seats.filter(s => s && s.chips > 0);
            
            if (playersWithChips.length <= 1 && currentTable.phase !== 'waiting') {
                // Game over - one winner!
                simulation.gamesPlayed++;
                this.log('INFO', `Game ${simulation.gamesPlayed} COMPLETE - Resetting for next game`, {
                    tableId,
                    winner: playersWithChips[0]?.name || 'Unknown',
                    gamesPlayed: simulation.gamesPlayed
                });
                
                if (simulation.gamesPlayed >= this.maxGames) {
                    this.log('INFO', `Reached max games (${this.maxGames}), stopping simulation`, { tableId });
                    this.stopSimulation(tableId);
                    return;
                }
                
                // Reset all players to starting chips
                const restartDelay = simulation.fastMode ? 1000 : 3000;
                setTimeout(() => this._restartGame(simulation), restartDelay);
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
     */
    _restartGame(simulation) {
        const { tableId, buyIn, creatorId } = simulation;
        const table = this.gameManager.tables.get(tableId);
        
        if (!table) {
            this.log('ERROR', 'Cannot restart - table not found', { tableId });
            return;
        }
        
        this.log('INFO', 'Restarting game - resetting all chips', { tableId, buyIn });
        
        // Store original blinds (before any increases)
        const originalSmallBlind = simulation.originalSmallBlind || table.smallBlind;
        const originalBigBlind = simulation.originalBigBlind || table.bigBlind;
        if (!simulation.originalSmallBlind) {
            simulation.originalSmallBlind = table.smallBlind;
            simulation.originalBigBlind = table.bigBlind;
        }
        
        // Reset all players to starting buy-in
        for (const seat of table.seats) {
            if (seat) {
                seat.chips = buyIn;
                seat.isFolded = false;
                seat.isAllIn = false;
                seat.currentBet = 0;
                seat.cards = [];
                seat.isReady = false; // Reset ready status for new game
            }
        }
        
        // Reset table state completely
        table.phase = 'waiting';
        table.pot = 0;
        table.currentBet = 0;
        table.communityCards = [];
        table.currentPlayerIndex = -1;
        table.dealerIndex = (table.dealerIndex + 1) % table.maxPlayers; // Rotate dealer
        table.lastRaiserIndex = -1;
        table.smallBlind = originalSmallBlind; // Reset blinds to original
        table.bigBlind = originalBigBlind;
        table.blindLevel = 1; // Reset blind level
        
        // Clear any pending timers
        if (table.turnTimer) {
            clearTimeout(table.turnTimer);
            table.turnTimer = null;
        }
        if (table.blindTimer) {
            clearInterval(table.blindTimer);
            table.blindTimer = null;
        }
        
        // Broadcast reset to spectators
        if (table.onStateChange) {
            table.onStateChange();
        }
        
        // Auto-start the new game and continue checking for game over
        const startDelay = simulation.fastMode ? 500 : 2000;
        setTimeout(() => {
            if (table.phase === 'waiting') {
                const result = table.startReadyUp(creatorId);
                if (result.success) {
                    this.log('INFO', `Game ${simulation.gamesPlayed + 1} starting...`, { tableId });
                    // Continue the game-over check loop
                    this._setupAutoRestart(table, simulation);
                } else {
                    this.log('ERROR', `Failed to start game ${simulation.gamesPlayed + 1}`, { error: result.error });
                }
            }
        }, startDelay);
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

