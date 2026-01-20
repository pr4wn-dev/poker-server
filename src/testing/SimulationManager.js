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
        const totalBots = maxPlayers;
        const socketBotCount = Math.floor(totalBots * socketBotRatio);
        const regularBotCount = totalBots - socketBotCount;
        
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
            status: 'starting'
        };
        this.activeSimulations.set(tableId, simulation);
        
        // Add regular bots first
        // Must use creatorId as inviterId - only table creator can invite bots
        const botProfiles = ['tex', 'lazy_larry', 'pickles', 'maxine', 'bluffs', 'shark', 'rookie', 'calculator', 'wildcard'];
        for (let i = 0; i < regularBotCount; i++) {
            const botProfile = botProfiles[i % botProfiles.length];
            const result = await this.gameManager.inviteBot(tableId, botProfile, creatorId, buyIn);
            
            if (result.success && result.seatIndex !== undefined) {
                // Auto-approve bots for simulation
                this.gameManager.approveBot(tableId, result.seatIndex, creatorId);
                this.log('INFO', `Regular bot added: ${botProfile}`, { seatIndex: result.seatIndex });
            } else {
                this.log('WARN', `Failed to add regular bot: ${botProfile}`, { error: result.error });
            }
            
            // Small delay between bot additions
            await new Promise(r => setTimeout(r, 200));
        }
        
        // Add socket bots
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
                this.log('INFO', `Socket bot added: ${bot.name}`, { seatIndex: bot.seatIndex });
                
                // Small delay between connections
                await new Promise(r => setTimeout(r, 300));
            } catch (error) {
                this.log('ERROR', `Failed to add socket bot ${i + 1}`, { error: error.message });
            }
        }
        
        simulation.status = 'ready';
        this.log('INFO', 'All bots added, simulation ready', {
            tableId,
            seatedPlayers: table.getSeatedPlayerCount(),
            maxPlayers
        });
        
        return {
            success: true,
            tableId,
            tableName: table.name,
            regularBots: regularBotCount,
            socketBots: simulation.socketBots.length,
            status: 'ready'
        };
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

