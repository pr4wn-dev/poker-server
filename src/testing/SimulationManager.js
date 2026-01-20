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
        
        this._ensureLogDir();
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
        const {
            creatorId,
            tableName = 'Simulation Table',
            maxPlayers = 6,
            smallBlind = 25,
            bigBlind = 50,
            buyIn = 20000000,
            turnTimeLimit = 5000, // Faster for simulation
            socketBotRatio = 0.5
        } = options;
        
        this.log('INFO', 'Starting simulation...', options);
        
        // Create the table in practice mode
        // GameManager.createTable returns the table object directly (not { success, tableId, table })
        const table = this.gameManager.createTable({
            name: `[SIM] ${tableName}`,
            maxPlayers,
            smallBlind,
            bigBlind,
            buyIn,
            isPrivate: true,
            practiceMode: true,
            turnTimeLimit,
            blindIncreaseInterval: 0, // No blind increases for simulation
            creatorId
        });
        
        if (!table || !table.id) {
            this.log('ERROR', 'Failed to create simulation table', { error: 'createTable returned null or invalid table' });
            return { success: false, error: 'Failed to create table' };
        }
        
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
            status: 'spawning'
        };
        this.activeSimulations.set(tableId, simulation);
        
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
        for (let i = 0; i < socketBotCount; i++) {
            try {
                const bot = new SocketBot({
                    serverUrl: this.serverUrl,
                    name: `NetPlayer_${i + 1}`,
                    minDelay: 800,
                    maxDelay: 2500,
                    aggressiveness: 0.2 + Math.random() * 0.4,
                    logFile: path.join(__dirname, '../../logs/socketbot.log')
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
        this.log('INFO', 'All bots joined, waiting for game start', {
            tableId,
            seatedPlayers: table?.getSeatedPlayerCount() || 0,
            regularBots: regularAdded,
            socketBots: socketAdded
        });
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
}

module.exports = SimulationManager;

