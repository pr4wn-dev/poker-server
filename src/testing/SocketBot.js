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
        
        // Fast mode - reduce all delays for rapid simulation
        this.fastMode = options.fastMode || false;
        const speedMultiplier = this.fastMode ? 0.1 : 1; // 10x faster in fast mode
        
        this.minDelay = Math.floor((options.minDelay || 500) * speedMultiplier);  // Min delay before action (ms)
        this.maxDelay = Math.floor((options.maxDelay || 2000) * speedMultiplier); // Max delay before action (ms)
        this.aggressiveness = options.aggressiveness || 0.3; // 0-1, higher = more raises
        
        // Network simulation settings
        this.networkLatency = options.networkLatency || 50; // Base latency in ms
        this.latencyJitter = options.latencyJitter || 100;  // Random variance in ms
        this.disconnectChance = options.disconnectChance || 0.02; // 2% chance per state update to disconnect
        this.reconnectMinTime = options.reconnectMinTime || 3000;  // Min time before reconnect (ms)
        this.reconnectMaxTime = options.reconnectMaxTime || 15000; // Max time before reconnect (ms)
        this.enableChaos = options.enableChaos !== false; // Enable random disconnects
        
        this.socket = null;
        this.userId = null;
        this.tableId = null;
        this.seatIndex = -1;
        this.gameState = null;
        this.isMyTurn = false;
        this.isConnected = false;
        this.chips = 0;
        this.actionScheduled = false; // Track if we've scheduled an action
        this.actionTimeout = null; // Timeout handle for stuck turn detection
        
        // Chaos tracking
        this.disconnectCount = 0;
        this.reconnectCount = 0;
        this.isReconnecting = false;
        this.lastDisconnectTime = null;
        
        // Event verification tracking
        this.eventsReceived = {
            playerJoined: [],
            playerLeft: [],
            playerDisconnected: [],
            playerReconnected: [],
            tableState: 0,
            handResult: 0,
            readyPrompt: 0
        };
        
        // Turn verification tracking
        this.turnTracking = {
            turnHistory: [],           // Array of { currentPlayerId, phase, timestamp, pot }
            myTurnCount: 0,            // How many times it was my turn
            turnAfterDisconnect: null, // Who had turn when I disconnected
            turnOnReconnect: null,     // Who had turn when I reconnected
            stuckTurnDetected: false,  // Same player for too long
            invalidTurnDetected: false, // Turn to folded/disconnected player
            turnSkipDetected: false,   // A player was skipped
            lastSeenPlayers: new Map() // playerId -> last seen state
        };
        
        // Client-side timing markers (for correlating issues with animations/audio)
        this.clientTiming = {
            // Audio timing
            readyToRumbleStart: null,    // When "Ready to Rumble" would start (7 sec duration)
            readyToRumbleEnd: null,      // When it would end
            countdownBeepsStart: null,   // When countdown beeps would start
            
            // Animation timing
            cardDealStart: null,         // When card dealing animation starts
            lastActionTime: null,        // When last action animation played
            showdownStart: null,         // When showdown reveal animation starts
            winnerCelebrationStart: null,// When winner celebration plays
            
            // Critical windows (when issues are likely related to client-side)
            criticalWindows: [],         // Array of { type, start, end, description }
            
            // Error correlation
            errorsInCriticalWindows: []  // Errors that occurred during animations/audio
        };
        
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
    
    /**
     * Simulate network latency
     */
    _getNetworkLatency() {
        return this.networkLatency + Math.floor(Math.random() * this.latencyJitter);
    }
    
    /**
     * Execute action with simulated network latency
     */
    async _withLatency(fn) {
        const latency = this._getNetworkLatency();
        await new Promise(r => setTimeout(r, latency));
        return fn();
    }
    
    /**
     * Check if we should randomly disconnect (chaos mode)
     */
    _shouldDisconnect() {
        if (!this.enableChaos) return false;
        if (this.isReconnecting) return false;
        if (this.disconnectCount >= 3) return false; // Max 3 disconnects per session
        return Math.random() < this.disconnectChance;
    }
    
    /**
     * Simulate a random disconnect and later reconnect
     */
    async _simulateDisconnect() {
        if (this.isReconnecting) return;
        
        this.isReconnecting = true;
        this.disconnectCount++;
        this.lastDisconnectTime = Date.now();
        
        this.log('CHAOS', `Simulating disconnect #${this.disconnectCount}...`);
        
        // Actually disconnect
        if (this.socket) {
            this.socket.disconnect();
        }
        this.isConnected = false;
        this._clearTurnTimeout(); // Clear timeout on disconnect
        
        // Wait random time before reconnecting
        const reconnectDelay = this.reconnectMinTime + 
            Math.floor(Math.random() * (this.reconnectMaxTime - this.reconnectMinTime));
        
        this.log('CHAOS', `Will reconnect in ${reconnectDelay}ms...`);
        
        await new Promise(r => setTimeout(r, reconnectDelay));
        
        // Reconnect
        try {
            await this.reconnect();
            this.reconnectCount++;
            this.log('CHAOS', `Reconnect #${this.reconnectCount} successful!`, {
                disconnectDuration: Date.now() - this.lastDisconnectTime
            });
        } catch (error) {
            this.log('ERROR', `Reconnect failed: ${error.message}`);
        }
        
        this.isReconnecting = false;
    }
    
    /**
     * Reconnect to the server and rejoin the table
     */
    async reconnect() {
        this.log('RECONNECT', 'Attempting to reconnect...');
        
        // Reconnect socket
        await this.connect();
        
        // Login (account already exists)
        await this.login();
        
        // Rejoin the table we were at
        if (this.tableId) {
            this.log('RECONNECT', `Rejoining table ${this.tableId}...`);
            
            return new Promise((resolve, reject) => {
                this.socket.emit('join_table', { 
                    tableId: this.tableId, 
                    oderId: this.oderId, 
                    buyIn: 0 // 0 = rejoin, don't rebuy
                }, (response) => {
                    if (response && response.success) {
                        this.seatIndex = response.seatIndex;
                        this.log('RECONNECT', 'Rejoined table successfully!', { 
                            seatIndex: this.seatIndex 
                        });
                        resolve(response);
                    } else {
                        this.log('ERROR', 'Failed to rejoin table', { error: response?.error });
                        reject(new Error(response?.error || 'Rejoin failed'));
                    }
                });
            });
        }
    }
    
    /**
     * Track client-side timing windows for error correlation
     */
    _trackClientTiming(state) {
        const now = Date.now();
        const phase = state.phase;
        const lastPhase = this.turnTracking.turnHistory.length > 0 
            ? this.turnTracking.turnHistory[this.turnTracking.turnHistory.length - 1].phase 
            : null;
        
        // COUNTDOWN phase started - Ready to Rumble audio would play
        if (phase === 'countdown' && lastPhase !== 'countdown') {
            this.clientTiming.readyToRumbleStart = now;
            this.clientTiming.readyToRumbleEnd = now + 7000; // 7 second audio
            this.clientTiming.countdownBeepsStart = now + 7000; // Beeps after audio
            
            this._addCriticalWindow('AUDIO_READY_TO_RUMBLE', now, now + 7000, 
                'Ready to Rumble audio playing - UI may be blocked');
            this._addCriticalWindow('AUDIO_COUNTDOWN_BEEPS', now + 7000, now + 17000, 
                'Countdown beeps playing (10 seconds)');
                
            this.log('TIMING', 'Countdown started - audio/animation window open', {
                readyToRumble: '0-7s',
                countdownBeeps: '7-17s'
            });
        }
        
        // PREFLOP started - card dealing animation
        if (phase === 'preflop' && lastPhase === 'countdown') {
            // Re-enable chaos now that game has actually started
            this._chaosEnabled = this.enableChaos;
            
            this.clientTiming.cardDealStart = now;
            this._addCriticalWindow('ANIMATION_CARD_DEAL', now, now + 3000, 
                'Card dealing animation - rapid state updates');
                
            this.log('TIMING', 'Cards being dealt - animation window', { duration: '~3s' });
        }
        
        // SHOWDOWN - reveal animations
        if (phase === 'showdown' && lastPhase !== 'showdown') {
            this.clientTiming.showdownStart = now;
            this._addCriticalWindow('ANIMATION_SHOWDOWN', now, now + 5000, 
                'Showdown card reveal animations');
                
            this.log('TIMING', 'Showdown started - reveal animations', { duration: '~5s' });
        }
        
        // Track action timing
        if (state.currentPlayerId && state.currentPlayerId !== this.userId) {
            // Someone else is acting - their action animation will play
            this.clientTiming.lastActionTime = now;
        }
    }
    
    /**
     * Add a critical timing window
     */
    _addCriticalWindow(type, start, end, description) {
        this.clientTiming.criticalWindows.push({ type, start, end, description });
        
        // Keep only last 20 windows
        if (this.clientTiming.criticalWindows.length > 20) {
            this.clientTiming.criticalWindows.shift();
        }
    }
    
    /**
     * Check if current time is in a critical window (for error correlation)
     */
    _isInCriticalWindow() {
        const now = Date.now();
        return this.clientTiming.criticalWindows.filter(w => now >= w.start && now <= w.end);
    }
    
    /**
     * Log an error with critical window correlation
     */
    _logErrorWithCorrelation(errorType, message, data = {}) {
        const activeWindows = this._isInCriticalWindow();
        
        if (activeWindows.length > 0) {
            // Error occurred during a critical animation/audio window
            const correlation = {
                errorType,
                message,
                timestamp: Date.now(),
                activeWindows: activeWindows.map(w => ({
                    type: w.type,
                    description: w.description,
                    timeIntoWindow: Date.now() - w.start
                }))
            };
            
            this.clientTiming.errorsInCriticalWindows.push(correlation);
            
            this.log('ERROR_CORRELATED', `${errorType} during ${activeWindows[0].type}`, {
                ...data,
                correlation: activeWindows.map(w => w.type).join(', '),
                possibleCause: activeWindows[0].description
            });
        } else {
            this.log('ERROR', message, data);
        }
    }
    
    /**
     * Verify turn logic is working correctly
     */
    _verifyTurnLogic(state) {
        const now = Date.now();
        const currentPlayerId = state.currentPlayerId;
        const phase = state.phase;
        
        // Skip non-betting phases
        if (!['preflop', 'flop', 'turn', 'river'].includes(phase)) {
            return;
        }
        
        // Track turn history
        const lastTurn = this.turnTracking.turnHistory[this.turnTracking.turnHistory.length - 1];
        
        // Only add if turn actually changed or first entry
        if (!lastTurn || lastTurn.currentPlayerId !== currentPlayerId || lastTurn.phase !== phase) {
            this.turnTracking.turnHistory.push({
                currentPlayerId,
                phase,
                timestamp: now,
                pot: state.pot
            });
        }
        
        // Count my turns
        if (currentPlayerId === this.userId) {
            this.turnTracking.myTurnCount++;
        }
        
        // Update last seen players
        if (state.seats) {
            for (const seat of state.seats) {
                if (seat && seat.oderId) {
                    this.turnTracking.lastSeenPlayers.set(seat.oderId, {
                        name: seat.name,
                        isFolded: seat.isFolded,
                        isAllIn: seat.isAllIn,
                        isConnected: seat.isConnected,
                        chips: seat.chips
                    });
                }
            }
        }
        
        // VERIFICATION 1: Detect stuck turns (same player for 3+ consecutive states)
        if (this.turnTracking.turnHistory.length >= 3) {
            const last3 = this.turnTracking.turnHistory.slice(-3);
            const allSamePlayer = last3.every(t => t.currentPlayerId === last3[0].currentPlayerId);
            const allSamePhase = last3.every(t => t.phase === last3[0].phase);
            
            if (allSamePlayer && allSamePhase && last3[0].currentPlayerId) {
                const duration = now - last3[0].timestamp;
                if (duration > 5000) { // More than 5 seconds stuck
                    if (!this.turnTracking.stuckTurnDetected) {
                        this.turnTracking.stuckTurnDetected = true;
                        this._logErrorWithCorrelation('STUCK_TURN', 
                            `STUCK TURN DETECTED: ${last3[0].currentPlayerId} for ${duration}ms`, {
                            playerId: last3[0].currentPlayerId,
                            phase: last3[0].phase,
                            duration
                        });
                    }
                }
            }
        }
        
        // VERIFICATION 2: Detect turn to invalid player (folded, disconnected, all-in with no action needed)
        if (currentPlayerId) {
            const playerState = this.turnTracking.lastSeenPlayers.get(currentPlayerId);
            if (playerState) {
                if (playerState.isFolded) {
                    this.turnTracking.invalidTurnDetected = true;
                    this.log('VERIFY_FAIL', `INVALID TURN: It's ${playerState.name}'s turn but they FOLDED`, {
                        playerId: currentPlayerId,
                        playerName: playerState.name
                    });
                }
                
                if (playerState.isConnected === false) {
                    this.log('VERIFY_WARN', `Turn to DISCONNECTED player: ${playerState.name}`, {
                        playerId: currentPlayerId,
                        playerName: playerState.name
                    });
                }
            }
        }
        
        // VERIFICATION 3: After reconnect, check turn is reasonable
        if (this.turnTracking.turnOnReconnect === null && this.reconnectCount > 0) {
            this.turnTracking.turnOnReconnect = currentPlayerId;
            this.log('VERIFY', `Turn on reconnect: ${currentPlayerId}`, {
                wasMyTurnBefore: this.turnTracking.turnAfterDisconnect === this.userId,
                isMyTurnNow: currentPlayerId === this.userId
            });
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
                this._clearTurnTimeout(); // Clear timeout on disconnect
                this.actionScheduled = false; // Reset action flag
                this.log('WARN', 'Disconnected from server', { reason });
            });
            
            // Game events
            this.socket.on('table_state', (state) => this._handleTableState(state));
            this.socket.on('hand_result', (result) => this._handleHandResult(result));
            this.socket.on('game_over', (data) => this._handleGameOver(data));
            this.socket.on('player_eliminated', (data) => this._handlePlayerEliminated(data));
            
            // Player presence events (for verification)
            this.socket.on('player_joined', (data) => {
                this.eventsReceived.playerJoined.push(data);
                this.log('EVENT', `Player joined: ${data.name}`, data);
            });
            
            this.socket.on('player_left', (data) => {
                this.eventsReceived.playerLeft.push(data);
                this.log('EVENT', `Player left: ${data.userId}`, data);
            });
            
            this.socket.on('player_disconnected', (data) => {
                this.eventsReceived.playerDisconnected.push(data);
                this.log('EVENT', `Player disconnected: ${data.playerId}`, data);
            });
            
            this.socket.on('player_reconnected', (data) => {
                this.eventsReceived.playerReconnected.push(data);
                this.log('EVENT', `Player reconnected: ${data.playerId}`, data);
            });
            
            this.socket.on('ready_prompt', (data) => {
                this.eventsReceived.readyPrompt++;
                this.log('EVENT', 'Ready prompt received', data);
            });
            
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
                    // Server returns userId and profile, not user object
                    this.userId = response.userId || response.profile?.id;
                    this.chips = response.profile?.chips || 20000000;
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
                    // Server returns userId and profile, not user object
                    this.userId = response.userId || response.profile?.id;
                    this.chips = response.profile?.chips || 20000000;
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
        try {
            // Track previous state for comparison
            const prevPhase = this.gameState?.phase;
            const prevHandNumber = this.gameState?.handNumber;
            
            this.gameState = state;
            this.eventsReceived.tableState++;
            
            // CLIENT TIMING: Track when animations/audio would be playing
            this._trackClientTiming(state);
            
            // TURN VERIFICATION: Track turn changes
            this._verifyTurnLogic(state);
            
            // CHAOS MODE: Random disconnect check
            if (this._shouldDisconnect()) {
                this.turnTracking.turnAfterDisconnect = state.currentPlayerId;
                this._simulateDisconnect();
                return; // Don't process this state, we're disconnecting
            }
            
            // Check if it's our turn
            const wasMyTurn = this.isMyTurn;
            this.isMyTurn = state.currentPlayerId === this.userId;
            
            // Detect new hand - phase went from showdown/waiting to preflop, or handNumber changed
            const isNewHand = (prevPhase === 'showdown' && state.phase === 'preflop') ||
                              (prevHandNumber !== undefined && state.handNumber !== prevHandNumber) ||
                              (prevPhase && !['preflop', 'flop', 'turn', 'river'].includes(prevPhase) && state.phase === 'preflop');
            
            // Only log state changes that matter (phase changes, turn changes, errors)
            const isActiveBettingPhase = ['preflop', 'flop', 'turn', 'river'].includes(state.phase);
            const phaseChanged = prevPhase !== state.phase;
            const turnChanged = wasMyTurn !== this.isMyTurn;
            
            // Log only on phase changes, turn changes, or if there's an issue
            if (phaseChanged || turnChanged || state.phase === 'ready_up' || state.phase === 'countdown') {
                this.log('STATE', `Phase: ${state.phase}${phaseChanged ? ' (CHANGED)' : ''}, Pot: ${state.pot}, MyTurn: ${this.isMyTurn}${turnChanged ? ' (TURN CHANGED)' : ''}`, {
                    phase: state.phase,
                    pot: state.pot,
                    currentBet: state.currentBet,
                    myTurn: this.isMyTurn,
                    turnTimeRemaining: state.turnTimeRemaining,
                    currentPlayerId: state.currentPlayerId
                });
            }
            
            // If it just became our turn, OR it's a new hand and it's our turn, make a decision
            // CRITICAL FIX: Also check isNewHand to handle back-to-back turns across hands
            if (this.isMyTurn && (!wasMyTurn || isNewHand)) {
                this.log('ACTION', `>>> IT'S MY TURN! Scheduling action with ${this.networkLatency}ms base latency...`, { 
                    reason: !wasMyTurn ? 'turn_started' : 'new_hand_my_turn' 
                });
                this._scheduleAction();
            } else if (this.isMyTurn && wasMyTurn && !this.actionScheduled) {
                // STUCK DETECTION: It's still our turn but we haven't scheduled an action
                // This can happen if action failed or state update was missed
                const lastTurnEntry = this.turnTracking.turnHistory[this.turnTracking.turnHistory.length - 1];
                const timeSinceTurnStart = lastTurnEntry ? (Date.now() - lastTurnEntry.timestamp) : 0;
                if (timeSinceTurnStart > 10000) { // More than 10 seconds stuck
                    // CRITICAL: Log to file for debugging stuck bots
                    this.log('WARN', `STUCK TURN DETECTED - It's been my turn for ${timeSinceTurnStart}ms but no action scheduled. Forcing action...`, {
                        timeSinceTurnStart,
                        phase: state.phase,
                        currentBet: state.currentBet,
                        pot: state.pot,
                        myChips: state.seats?.find(s => s?.playerId === this.userId)?.chips
                    });
                    this._scheduleAction();
                }
            }
            
            // Set up timeout to detect if we're stuck on our turn
            if (this.isMyTurn) {
                this._setupTurnTimeout(state);
            } else {
                this._clearTurnTimeout();
            }
            
            // Auto-ready during ready_up phase (with latency simulation)
            // NOTE: Chaos mode (random disconnects) is disabled until game is actively playing
            // to prevent disrupting the ready-up flow
            if (state.phase === 'ready_up') {
                this._chaosEnabled = false; // Disable chaos during ready-up
                const delay = this._getRandomDelay() + this._getNetworkLatency();
                setTimeout(() => this.ready(), delay);
            }
        } catch (error) {
            this.log('ERROR', `_handleTableState CRASHED: ${error.message}`, { error: error.stack });
        }
    }
    
    /**
     * Schedule an action with random delay (simulates thinking + network)
     */
    _scheduleAction() {
        // Clear any existing timeout
        this._clearTurnTimeout();
        
        // Mark that we've scheduled an action
        this.actionScheduled = true;
        
        const delay = this._getRandomDelay();
        // Removed verbose THINK log - only log when action is actually taken
        
        setTimeout(() => {
            if (this.isMyTurn) {
                this._makeDecision();
                // Reset flag after making decision
                this.actionScheduled = false;
            } else {
                // Turn changed before we could act
                this.actionScheduled = false;
            }
        }, delay);
    }
    
    /**
     * Set up timeout to detect stuck turns
     */
    _setupTurnTimeout(state) {
        // Clear existing timeout
        this._clearTurnTimeout();
        
        // Set timeout to detect if we're stuck (15 seconds in fast mode, 30 seconds normally)
        const timeoutDuration = this.fastMode ? 15000 : 30000;
        
        this.actionTimeout = setTimeout(() => {
            if (this.isMyTurn && !this.actionScheduled) {
                // CRITICAL: Log to file for debugging stuck bots
                this.log('ERROR', `STUCK TURN TIMEOUT - It's been my turn for ${timeoutDuration}ms with no action! Forcing action...`, {
                    phase: state?.phase,
                    currentBet: state?.currentBet,
                    pot: state?.pot,
                    myChips: state?.seats?.find(s => s?.playerId === this.userId)?.chips,
                    timeoutDuration
                });
                this._scheduleAction();
            }
        }, timeoutDuration);
    }
    
    /**
     * Clear turn timeout
     */
    _clearTurnTimeout() {
        if (this.actionTimeout) {
            clearTimeout(this.actionTimeout);
            this.actionTimeout = null;
        }
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
        
        // CRITICAL: Double-check it's still our turn before making decision
        // This prevents race conditions where turn changed between scheduling and execution
        if (!this.isMyTurn || state.currentPlayerId !== this.userId) {
            this.log('DEBUG', 'Skipping decision - not my turn anymore', {
                isMyTurn: this.isMyTurn,
                currentPlayerId: state.currentPlayerId,
                myUserId: this.userId
            });
            return;
        }
        
        // Find my seat info
        const mySeat = state.seats?.find(s => s?.playerId === this.userId);
        if (!mySeat) {
            this.log('ERROR', 'Cannot find my seat!');
            return;
        }
        
        const toCall = state.currentBet - (mySeat.currentBet || 0);
        const myChips = mySeat.chips;
        const potOdds = toCall > 0 ? toCall / (state.pot + toCall) : 0;
        
        // Removed verbose DECISION log - action will be logged when sent
        
        let action, amount = 0;
        
        // Simple decision logic
        // CRITICAL FIX: toCall === 0 means we've matched, but we can only BET if currentBet === 0
        // If currentBet > 0 and toCall === 0, we must CHECK or RAISE (not bet)
        if (toCall === 0) {
            // Can check for free
            if (Math.random() < this.aggressiveness) {
                // Want to be aggressive - check if we can bet or need to raise
                if (state.currentBet === 0) {
                    // No bets yet - we can open with a bet
                    action = 'bet';
                    amount = Math.floor(state.pot * (0.5 + Math.random() * 0.5));
                    amount = Math.min(amount, myChips);
                    amount = Math.max(amount, state.minBet || state.bigBlind || 50);
                } else {
                    // There's already a bet - we must RAISE, not bet
                    action = 'raise';
                    const minRaise = state.minRaise || state.bigBlind || 50;
                    amount = state.currentBet + minRaise + Math.floor(Math.random() * state.pot * 0.5);
                    amount = Math.min(amount, myChips);
                }
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
        // CRITICAL: Final check before sending - verify it's still our turn
        const state = this.gameState;
        if (state && (!this.isMyTurn || state.currentPlayerId !== this.userId)) {
            this.log('DEBUG', `Skipping ${action} - not my turn anymore`, {
                isMyTurn: this.isMyTurn,
                currentPlayerId: state.currentPlayerId,
                myUserId: this.userId
            });
            return;
        }
        
        this.log('ACTION', `Sending: ${action}${amount > 0 ? ' ' + amount : ''}`, { action, amount });
        
        // Server listens for 'action' event, not 'player_action'
        this.socket.emit('action', {
            action,
            amount
        }, (response) => {
            if (response && response.success) {
                this.log('ACTION', `${action} SUCCESS`, response);
            } else {
                // Only log as ERROR if it's a real error, not just "not your turn" (which is expected in race conditions)
                const isExpectedError = response?.error?.includes('Not your turn') || 
                                       response?.error?.includes('No betting during showdown') ||
                                       response?.error?.includes('Game not in progress');
                if (isExpectedError) {
                    this.log('DEBUG', `${action} rejected (expected): ${response?.error}`, { error: response?.error });
                } else {
                    this.log('ERROR', `${action} FAILED`, { error: response?.error });
                    // Try fallback action only for real errors
                    if (action !== 'fold' && action !== 'check') {
                        this._sendAction(this.gameState?.currentBet > 0 ? 'fold' : 'check');
                    }
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
    
    /**
     * Get a summary of this bot's session (for verification)
     */
    getSummary() {
        return {
            name: this.name,
            oderId: this.oderId,
            seatIndex: this.seatIndex,
            isConnected: this.isConnected,
            networkProfile: {
                latency: this.networkLatency,
                jitter: this.latencyJitter,
                disconnectChance: this.disconnectChance
            },
            chaos: {
                disconnects: this.disconnectCount,
                reconnects: this.reconnectCount,
                chaosEnabled: this.enableChaos
            },
            events: {
                statesReceived: this.eventsReceived.tableState,
                handResults: this.eventsReceived.handResult,
                readyPrompts: this.eventsReceived.readyPrompt,
                playerJoins: this.eventsReceived.playerJoined.length,
                playerLeaves: this.eventsReceived.playerLeft.length,
                disconnections: this.eventsReceived.playerDisconnected.length,
                reconnections: this.eventsReceived.playerReconnected.length
            },
            turnVerification: {
                myTurnCount: this.turnTracking.myTurnCount,
                totalTurnChanges: this.turnTracking.turnHistory.length,
                stuckTurnDetected: this.turnTracking.stuckTurnDetected,
                invalidTurnDetected: this.turnTracking.invalidTurnDetected,
                turnAfterDisconnect: this.turnTracking.turnAfterDisconnect,
                turnOnReconnect: this.turnTracking.turnOnReconnect
            },
            clientTimingCorrelation: {
                errorsInCriticalWindows: this.clientTiming.errorsInCriticalWindows.length,
                criticalWindowsTracked: this.clientTiming.criticalWindows.length,
                errorDetails: this.clientTiming.errorsInCriticalWindows
            }
        };
    }
    
    /**
     * Log the full session summary
     */
    logSummary() {
        const summary = this.getSummary();
        this.log('SUMMARY', `Session complete for ${this.name}`, summary);
        
        // Verification checks
        const issues = [];
        
        // Reconnection issues
        if (summary.chaos.disconnects > 0 && summary.chaos.reconnects < summary.chaos.disconnects) {
            issues.push(`RECONNECT_FAIL: Failed to reconnect ${summary.chaos.disconnects - summary.chaos.reconnects} times`);
        }
        
        // Event issues
        if (summary.events.statesReceived === 0) {
            issues.push('NO_STATES: Never received any table state updates');
        }
        
        // Turn verification issues
        if (summary.turnVerification.stuckTurnDetected) {
            issues.push('STUCK_TURN: Same player had turn for too long (game might be stuck)');
        }
        
        if (summary.turnVerification.invalidTurnDetected) {
            issues.push('INVALID_TURN: Turn was given to a folded player');
        }
        
        if (summary.turnVerification.myTurnCount === 0 && summary.events.statesReceived > 10) {
            issues.push('NEVER_MY_TURN: Received many states but never got a turn (might be excluded from game)');
        }
        
        // Disconnect during turn verification
        if (summary.turnVerification.turnAfterDisconnect === this.userId) {
            // I disconnected on my turn - verify game handled it
            if (summary.chaos.reconnects > 0) {
                this.log('VERIFY', 'Disconnected on MY turn, successfully reconnected');
            } else {
                issues.push('DISCONNECT_ON_TURN: Disconnected on my turn and failed to reconnect');
            }
        }
        
        // Client timing correlation issues
        if (summary.clientTimingCorrelation.errorsInCriticalWindows > 0) {
            const errorTypes = summary.clientTimingCorrelation.errorDetails
                .map(e => `${e.errorType} during ${e.activeWindows[0]?.type}`)
                .join(', ');
            issues.push(`ANIMATION_CORRELATED: ${summary.clientTimingCorrelation.errorsInCriticalWindows} errors during animations/audio: ${errorTypes}`);
        }
        
        if (issues.length > 0) {
            this.log('VERIFY_FAIL', `${issues.length} issues found for ${this.name}`, { issues });
        } else {
            this.log('VERIFY_OK', `All ${this._getVerificationCount()} checks passed for ${this.name}`);
        }
        
        return { summary, issues };
    }
    
    _getVerificationCount() {
        // Count how many things we verified
        let count = 0;
        if (this.eventsReceived.tableState > 0) count++;
        if (this.turnTracking.turnHistory.length > 0) count++;
        if (this.disconnectCount > 0) count++; // Verified reconnection
        if (this.turnTracking.myTurnCount > 0) count++; // Verified turn assignment
        return count;
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

