/**
 * SocketBot - A simulated player that connects via Socket.IO
 * 
 * Connects to the server just like a real Unity client would,
 * making it perfect for testing socket-related edge cases.
 * 
 * Features:
 * - Connects via real WebSocket
 * - Registers/logs in like a real player
 * - Joins tables and plays full games
 * - Configurable delays to simulate network latency
 * - Logs all actions for debugging
 */

const { io } = require('socket.io-client');
const fs = require('fs');
const path = require('path');

// Bot names for variety
const BOT_NAMES = [
    'NetPlayer_Alpha', 'NetPlayer_Beta', 'NetPlayer_Gamma', 'NetPlayer_Delta',
    'SimBot_One', 'SimBot_Two', 'SimBot_Three', 'SimBot_Four',
    'TestUser_A', 'TestUser_B', 'TestUser_C', 'TestUser_D',
    'SocketSam', 'SocketSally', 'SocketSteve', 'SocketSara'
];

class SocketBot {
    constructor(options = {}) {
        this.serverUrl = options.serverUrl || 'http://localhost:3000';
        this.name = options.name || BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)] + '_' + Date.now().toString().slice(-4);
        this.minDelay = options.minDelay || 500;  // Min delay before action (ms)
        this.maxDelay = options.maxDelay || 2000; // Max delay before action (ms)
        this.aggressiveness = options.aggressiveness || 0.3; // 0-1, higher = more raises
        
        this.socket = null;
        this.userId = null;
        this.tableId = null;
        this.seatIndex = -1;
        this.gameState = null;
        this.isMyTurn = false;
        this.isConnected = false;
        this.chips = 0;
        
        // Logging
        this.logFile = options.logFile || path.join(__dirname, '../../logs/socketbot.log');
        this.enableLogging = options.enableLogging !== false;
        
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
        const logEntry = `[${timestamp}] [${level}] [${this.name}] ${message}${data ? ' | Data: ' + JSON.stringify(data) : ''}`;
        
        console.log(logEntry);
        
        if (this.enableLogging) {
            fs.appendFileSync(this.logFile, logEntry + '\n');
        }
    }
    
    /**
     * Connect to the server
     */
    async connect() {
        return new Promise((resolve, reject) => {
            this.log('INFO', `Connecting to ${this.serverUrl}...`);
            
            this.socket = io(this.serverUrl, {
                transports: ['websocket'],
                timeout: 10000
            });
            
            this.socket.on('connect', () => {
                this.isConnected = true;
                this.log('INFO', 'Connected to server', { socketId: this.socket.id });
                resolve();
            });
            
            this.socket.on('connect_error', (error) => {
                this.log('ERROR', 'Connection failed', { error: error.message });
                reject(error);
            });
            
            this.socket.on('disconnect', (reason) => {
                this.isConnected = false;
                this.log('WARN', 'Disconnected from server', { reason });
            });
            
            // Game events
            this.socket.on('table_state', (state) => this._handleTableState(state));
            this.socket.on('hand_result', (result) => this._handleHandResult(result));
            this.socket.on('game_over', (data) => this._handleGameOver(data));
            this.socket.on('player_eliminated', (data) => this._handlePlayerEliminated(data));
            
            // Set timeout for connection
            setTimeout(() => {
                if (!this.isConnected) {
                    reject(new Error('Connection timeout'));
                }
            }, 10000);
        });
    }
    
    /**
     * Register a new account
     */
    async register() {
        return new Promise((resolve, reject) => {
            const password = 'testpass123';
            const email = `${this.name.toLowerCase()}@test.com`;
            
            this.log('INFO', 'Registering account...', { username: this.name, email });
            
            this.socket.emit('register', { username: this.name, email, password }, (response) => {
                if (response && response.success) {
                    this.userId = response.user.id;
                    this.chips = response.user.chips;
                    this.log('INFO', 'Registration successful', { userId: this.userId, chips: this.chips });
                    resolve(response);
                } else {
                    // Maybe already exists, try login
                    this.log('WARN', 'Registration failed, trying login...', { error: response?.error });
                    this.login().then(resolve).catch(reject);
                }
            });
        });
    }
    
    /**
     * Login to existing account
     */
    async login() {
        return new Promise((resolve, reject) => {
            const password = 'testpass123';
            
            this.log('INFO', 'Logging in...', { username: this.name });
            
            this.socket.emit('login', { username: this.name, password }, (response) => {
                if (response && response.success) {
                    this.userId = response.user.id;
                    this.chips = response.user.chips;
                    this.log('INFO', 'Login successful', { userId: this.userId, chips: this.chips });
                    resolve(response);
                } else {
                    this.log('ERROR', 'Login failed', { error: response?.error });
                    reject(new Error(response?.error || 'Login failed'));
                }
            });
        });
    }
    
    /**
     * Join a table
     */
    async joinTable(tableId, buyIn = 20000000) {
        return new Promise((resolve, reject) => {
            this.log('INFO', 'Joining table...', { tableId, buyIn });
            
            this.socket.emit('join_table', { tableId, oderId: this.oderId, buyIn }, (response) => {
                if (response && response.success) {
                    this.tableId = tableId;
                    this.seatIndex = response.seatIndex;
                    this.gameState = response.state;
                    this.log('INFO', 'Joined table', { tableId, seatIndex: this.seatIndex });
                    resolve(response);
                } else {
                    this.log('ERROR', 'Failed to join table', { error: response?.error });
                    reject(new Error(response?.error || 'Failed to join table'));
                }
            });
        });
    }
    
    /**
     * Signal ready to play
     */
    async ready() {
        return new Promise((resolve) => {
            this.log('INFO', 'Signaling ready...');
            
            this.socket.emit('player_ready', { tableId: this.tableId }, (response) => {
                this.log('INFO', 'Ready signal sent', { response });
                resolve(response);
            });
        });
    }
    
    /**
     * Handle incoming table state
     */
    _handleTableState(state) {
        this.gameState = state;
        
        // Check if it's our turn
        const wasMyTurn = this.isMyTurn;
        this.isMyTurn = state.currentPlayerId === this.userId;
        
        this.log('STATE', `Phase: ${state.phase}, Pot: ${state.pot}, Current: ${state.currentPlayerId}, MyTurn: ${this.isMyTurn}`, {
            phase: state.phase,
            pot: state.pot,
            currentBet: state.currentBet,
            myTurn: this.isMyTurn,
            turnTimeRemaining: state.turnTimeRemaining
        });
        
        // If it just became our turn, make a decision
        if (this.isMyTurn && !wasMyTurn) {
            this._scheduleAction();
        }
        
        // Auto-ready during ready_up phase
        if (state.phase === 'ready_up') {
            setTimeout(() => this.ready(), this._getRandomDelay());
        }
    }
    
    /**
     * Schedule an action with random delay (simulates thinking + network)
     */
    _scheduleAction() {
        const delay = this._getRandomDelay();
        this.log('THINK', `Thinking for ${delay}ms...`);
        
        setTimeout(() => {
            if (this.isMyTurn) {
                this._makeDecision();
            }
        }, delay);
    }
    
    /**
     * Get random delay between min and max
     */
    _getRandomDelay() {
        return Math.floor(Math.random() * (this.maxDelay - this.minDelay)) + this.minDelay;
    }
    
    /**
     * Make a poker decision based on game state
     */
    _makeDecision() {
        const state = this.gameState;
        if (!state) return;
        
        // Find my seat info
        const mySeat = state.seats?.find(s => s?.playerId === this.userId);
        if (!mySeat) {
            this.log('ERROR', 'Cannot find my seat!');
            return;
        }
        
        const toCall = state.currentBet - (mySeat.currentBet || 0);
        const myChips = mySeat.chips;
        const potOdds = toCall > 0 ? toCall / (state.pot + toCall) : 0;
        
        this.log('DECISION', 'Evaluating...', {
            toCall,
            myChips,
            currentBet: state.currentBet,
            pot: state.pot,
            potOdds: potOdds.toFixed(2)
        });
        
        let action, amount = 0;
        
        // Simple decision logic
        if (toCall === 0) {
            // Can check for free
            if (Math.random() < this.aggressiveness) {
                // Bet
                action = 'bet';
                amount = Math.floor(state.pot * (0.5 + Math.random() * 0.5));
                amount = Math.min(amount, myChips);
                amount = Math.max(amount, state.minBet || state.bigBlind || 50);
            } else {
                action = 'check';
            }
        } else if (toCall >= myChips) {
            // All-in or fold situation
            if (Math.random() < 0.5 || potOdds < 0.3) {
                action = 'allin';
            } else {
                action = 'fold';
            }
        } else if (potOdds > 0.5) {
            // Bad pot odds, usually fold
            if (Math.random() < 0.3) {
                action = 'call';
            } else {
                action = 'fold';
            }
        } else {
            // Decent situation
            const roll = Math.random();
            if (roll < this.aggressiveness * 0.5) {
                // Raise
                action = 'raise';
                const raiseAmount = toCall + Math.floor((state.pot + toCall) * (0.5 + Math.random()));
                amount = Math.min(raiseAmount, myChips);
            } else if (roll < 0.8) {
                action = 'call';
            } else {
                action = 'fold';
            }
        }
        
        this._sendAction(action, amount);
    }
    
    /**
     * Send action to server
     */
    _sendAction(action, amount = 0) {
        this.log('ACTION', `Sending: ${action}${amount > 0 ? ' ' + amount : ''}`, { action, amount });
        
        this.socket.emit('player_action', {
            tableId: this.tableId,
            oderId: this.oderId,
            action,
            amount
        }, (response) => {
            if (response && response.success) {
                this.log('ACTION', `${action} SUCCESS`, response);
            } else {
                this.log('ERROR', `${action} FAILED`, { error: response?.error });
                // Try fallback action
                if (action !== 'fold' && action !== 'check') {
                    this._sendAction(this.gameState?.currentBet > 0 ? 'fold' : 'check');
                }
            }
        });
    }
    
    /**
     * Handle hand result
     */
    _handleHandResult(result) {
        this.log('RESULT', 'Hand complete', {
            winner: result.winnerName,
            hand: result.handName,
            pot: result.potAmount
        });
    }
    
    /**
     * Handle game over
     */
    _handleGameOver(data) {
        this.log('GAME_OVER', 'Game ended!', {
            winner: data.winnerName,
            winnerId: data.winnerId,
            isMe: data.winnerId === this.userId
        });
    }
    
    /**
     * Handle player elimination
     */
    _handlePlayerEliminated(data) {
        const isMe = data.playerId === this.userId;
        this.log('ELIMINATED', isMe ? 'I was eliminated!' : `${data.playerName} eliminated`, data);
        
        if (isMe) {
            this.disconnect();
        }
    }
    
    /**
     * Disconnect from server
     */
    disconnect() {
        if (this.socket) {
            this.log('INFO', 'Disconnecting...');
            this.socket.disconnect();
            this.isConnected = false;
        }
    }
}

/**
 * Run multiple socket bots to fill a table
 */
async function runSimulation(options = {}) {
    const {
        serverUrl = 'http://localhost:3000',
        tableId,
        botCount = 4,
        minDelay = 500,
        maxDelay = 2000
    } = options;
    
    console.log(`\n=== Starting Socket Bot Simulation ===`);
    console.log(`Server: ${serverUrl}`);
    console.log(`Table: ${tableId}`);
    console.log(`Bots: ${botCount}`);
    console.log(`Delay: ${minDelay}-${maxDelay}ms\n`);
    
    const bots = [];
    
    for (let i = 0; i < botCount; i++) {
        const bot = new SocketBot({
            serverUrl,
            name: `SimBot_${i + 1}_${Date.now().toString().slice(-4)}`,
            minDelay,
            maxDelay,
            aggressiveness: 0.2 + Math.random() * 0.4 // 0.2-0.6
        });
        
        try {
            await bot.connect();
            await bot.register();
            await bot.joinTable(tableId);
            bots.push(bot);
            console.log(`Bot ${i + 1}/${botCount} joined`);
            
            // Small delay between joins
            await new Promise(r => setTimeout(r, 500));
        } catch (error) {
            console.error(`Bot ${i + 1} failed:`, error.message);
        }
    }
    
    console.log(`\n${bots.length} bots active. Simulation running...`);
    console.log('Press Ctrl+C to stop.\n');
    
    // Keep running until interrupted
    process.on('SIGINT', () => {
        console.log('\nStopping simulation...');
        bots.forEach(bot => bot.disconnect());
        process.exit(0);
    });
}

module.exports = { SocketBot, runSimulation };

// CLI usage
if (require.main === module) {
    const args = process.argv.slice(2);
    const tableId = args[0];
    const botCount = parseInt(args[1]) || 4;
    
    if (!tableId) {
        console.log('Usage: node SocketBot.js <tableId> [botCount]');
        console.log('Example: node SocketBot.js abc123 4');
        process.exit(1);
    }
    
    runSimulation({ tableId, botCount });
}

