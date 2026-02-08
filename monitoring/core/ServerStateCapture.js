/**
 * Server State Capture
 * 
 * Periodically captures server state and updates StateStore
 * AI needs to see server health, metrics, and status
 */

const http = require('http');
const gameLogger = require('../../src/utils/GameLogger');

class ServerStateCapture {
    constructor(stateStore, serverUrl = 'http://localhost:3000', issueDetector = null, errorRecovery = null) {
        this.stateStore = stateStore;
        this.serverUrl = serverUrl;
        this.issueDetector = issueDetector;
        this.errorRecovery = errorRecovery;
        this.captureInterval = 5000; // Capture every 5 seconds
        this.captureIntervalId = null;
        this.lastCaptureTime = null;
        this.captureHistory = []; // Keep last 100 captures for trends
        this.maxHistorySize = 100;
        this.consecutiveErrors = 0;
        this.maxConsecutiveErrors = 3; // After 3 consecutive errors, report as issue
    }
    
    /**
     * Start capturing server state
     */
    start() {
        // Initial capture - ASYNC, don't block initialization
        setImmediate(() => {
            this.captureState();
        });
        
        // Then capture periodically
        this.captureIntervalId = setInterval(() => {
            this.captureState();
        }, this.captureInterval);
        
        gameLogger.info('MONITORING', '[SERVER_STATE_CAPTURE] Started', {
            message: 'Capturing server state every 5s',
            interval: this.captureInterval + 'ms'
        });
    }
    
    /**
     * Stop capturing
     */
    stop() {
        if (this.captureIntervalId) {
            clearInterval(this.captureIntervalId);
            this.captureIntervalId = null;
        }
    }
    
    /**
     * Destroy - alias for stop (for consistency with other components)
     */
    destroy() {
        this.stop();
    }
    
    /**
     * Capture current server state
     */
    async captureState() {
        try {
            const startTime = Date.now();
            
            // Get health endpoint
            const healthData = await this.getHealthData();
            
            // Calculate response time
            const responseTime = Date.now() - startTime;
            
            // Determine server status
            let status = 'unknown';
            let health = null;
            
            if (healthData) {
                if (healthData.status === 'ok' && healthData.database) {
                    status = 'running';
                    health = 100;
                } else if (healthData.status === 'database_offline') {
                    status = 'degraded';
                    health = 50;
                } else {
                    status = 'error';
                    health = 0;
                }
            } else {
                status = 'stopped';
                health = 0;
            }
            
            // Get detailed table information
            let tablesInfo = [];
            try {
                const tablesData = await this.getTablesData();
                if (tablesData && Array.isArray(tablesData)) {
                    tablesInfo = tablesData.map(table => ({
                        id: table.id,
                        name: table.name,
                        playerCount: table.playerCount || 0,
                        maxPlayers: table.maxPlayers || 0,
                        isPrivate: table.isPrivate || false,
                        isSimulation: table.isSimulation || false
                    }));
                }
            } catch (error) {
                // Tables endpoint might not be available, continue without it
            }
            
            // Update StateStore
            const now = Date.now();
            this.stateStore.updateState('system.server', {
                status: status,
                health: health,
                metrics: {
                    uptime: healthData?.uptime || 0,
                    requests: (this.captureHistory.length + 1),
                    errors: this.captureHistory.filter(c => c.status === 'error' || c.status === 'stopped').length,
                    responseTime: responseTime
                },
                lastCheck: now,
                activeTables: healthData?.activeTables || 0,
                onlinePlayers: healthData?.onlinePlayers || 0,
                activeSimulations: healthData?.activeSimulations || 0,
                database: healthData?.database || false,
                tables: tablesInfo // Detailed table information
            });
            
            // Update game state with table information
            if (tablesInfo.length > 0) {
                const gameState = this.stateStore.getState('game') || {};
                const tablesMap = gameState.tables || new Map();
                
                // Update tables map
                for (const tableInfo of tablesInfo) {
                    const existingTable = tablesMap.get(tableInfo.id);
                    if (existingTable) {
                        // Update existing table
                        existingTable.playerCount = tableInfo.playerCount;
                        existingTable.maxPlayers = tableInfo.maxPlayers;
                        existingTable.lastUpdate = now;
                    } else {
                        // Add new table
                        tablesMap.set(tableInfo.id, {
                            id: tableInfo.id,
                            name: tableInfo.name,
                            playerCount: tableInfo.playerCount,
                            maxPlayers: tableInfo.maxPlayers,
                            isPrivate: tableInfo.isPrivate,
                            isSimulation: tableInfo.isSimulation,
                            firstSeen: now,
                            lastUpdate: now
                        });
                    }
                }
                
                // Remove tables that no longer exist
                for (const [tableId, table] of tablesMap.entries()) {
                    if (!tablesInfo.find(t => t.id === tableId)) {
                        tablesMap.delete(tableId);
                    }
                }
                
                this.stateStore.updateState('game.tables', tablesMap);
                this.stateStore.updateState('game.lastUpdate', now);
            }
            
            // Add to history
            this.captureHistory.push({
                timestamp: now,
                status: status,
                health: health,
                responseTime: responseTime,
                activeTables: healthData?.activeTables || 0,
                activeSimulations: healthData?.activeSimulations || 0
            });
            
            // Keep history size manageable
            if (this.captureHistory.length > this.maxHistorySize) {
                this.captureHistory.shift();
            }
            
            this.lastCaptureTime = now;
            
            // Reset consecutive errors on success
            if (this.consecutiveErrors > 0) {
                this.consecutiveErrors = 0;
                // Record success with error recovery
                if (this.errorRecovery) {
                    this.errorRecovery.recordSuccess('serverStateCapture');
                }
            }
            
        } catch (error) {
            this.consecutiveErrors++;
            const errorMessage = error.message || 'Unknown error';
            const errorCode = error.code || '';
            
            // DO NOT log to console - errors are for AI only, not user
            
            // Check if this is "server not running" (ECONNREFUSED) vs actual connection problem
            const isServerNotRunning = errorCode === 'ECONNREFUSED' || 
                                      errorMessage.includes('ECONNREFUSED') ||
                                      errorMessage.includes('connect ECONNREFUSED');
            
            // Only record as error if it's not just "server not running"
            // Server not running is expected behavior, not an error
            if (!isServerNotRunning && this.errorRecovery) {
                this.errorRecovery.recordError('serverStateCapture', error);
            }
            
            // Only report to issue detector if:
            // 1. We have too many consecutive errors AND
            // 2. It's not just "server not running" (which is expected)
            // OR it's been failing for a very long time (5+ errors) which might indicate server should be running
            if (this.consecutiveErrors >= this.maxConsecutiveErrors && this.issueDetector) {
                // If server not running but we've had many failures, check if server should be running
                if (isServerNotRunning) {
                    // Only report if we've had many failures (5+) - might indicate server should be running
                    if (this.consecutiveErrors >= 5) {
                        this.issueDetector.detectIssue({
                            type: 'SERVER_NOT_RUNNING',
                            severity: 'medium', // Lower severity - server not running is expected
                            method: 'serverStateCapture',
                            details: {
                                error: 'Server is not running (ECONNREFUSED)',
                                consecutiveErrors: this.consecutiveErrors,
                                serverUrl: this.serverUrl,
                                lastCaptureTime: this.lastCaptureTime,
                                note: 'This may be expected if server is intentionally stopped'
                            },
                            timestamp: Date.now()
                        });
                    }
                } else {
                    // Actual connection problem (not ECONNREFUSED)
                    this.issueDetector.detectIssue({
                        type: 'SERVER_STATE_CAPTURE_FAILED',
                        severity: this.consecutiveErrors >= 5 ? 'critical' : 'high',
                        method: 'serverStateCapture',
                        details: {
                            error: errorMessage,
                            errorCode: errorCode,
                            consecutiveErrors: this.consecutiveErrors,
                            serverUrl: this.serverUrl,
                            lastCaptureTime: this.lastCaptureTime
                        },
                        timestamp: Date.now()
                    });
                }
            }
            
            // Update StateStore with error state
            // Use 'stopped' status for ECONNREFUSED (server not running), 'error' for actual problems
            const serverStatus = isServerNotRunning ? 'stopped' : 'error';
            this.stateStore.updateState('system.server', {
                status: serverStatus,
                health: 0,
                metrics: {
                    uptime: 0,
                    requests: this.captureHistory.length,
                    errors: this.captureHistory.filter(c => c.status === 'error' || c.status === 'stopped').length + 1,
                    responseTime: 0,
                    consecutiveErrors: this.consecutiveErrors
                },
                lastCheck: Date.now(),
                error: isServerNotRunning ? 'Server not running' : errorMessage
            });
        }
    }
    
    /**
     * Get tables data from server
     */
    async getTablesData() {
        return new Promise((resolve, reject) => {
            const url = new URL('/api/tables', this.serverUrl);
            
            const req = http.get(url, { timeout: 2000 }, (res) => {
                let data = '';
                
                res.on('data', (chunk) => {
                    data += chunk;
                });
                
                res.on('end', () => {
                    try {
                        const tablesData = JSON.parse(data);
                        resolve(tablesData);
                    } catch (error) {
                        reject(new Error(`Failed to parse tables response: ${error.message}`));
                    }
                });
            });
            
            req.on('error', (error) => {
                reject(error);
            });
            
            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Tables check timeout'));
            });
            
            req.setTimeout(2000);
        });
    }
    
    /**
     * Get health data from server
     */
    async getHealthData() {
        return new Promise((resolve, reject) => {
            const url = new URL('/health', this.serverUrl);
            
            const req = http.get(url, { timeout: 2000 }, (res) => {
                let data = '';
                
                res.on('data', (chunk) => {
                    data += chunk;
                });
                
                res.on('end', () => {
                    try {
                        const healthData = JSON.parse(data);
                        resolve(healthData);
                    } catch (error) {
                        reject(new Error(`Failed to parse health response: ${error.message}`));
                    }
                });
            });
            
            req.on('error', (error) => {
                reject(error);
            });
            
            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Health check timeout'));
            });
            
            req.setTimeout(2000);
        });
    }
    
    /**
     * Get capture history
     */
    getHistory(limit = 20) {
        return this.captureHistory.slice(-limit);
    }
    
    /**
     * Get trends (health over time)
     */
    getTrends() {
        if (this.captureHistory.length < 2) {
            return { trend: 'stable', change: 0 };
        }
        
        const recent = this.captureHistory.slice(-10);
        const older = this.captureHistory.slice(-20, -10);
        
        const recentAvg = recent.reduce((sum, c) => sum + (c.health || 0), 0) / recent.length;
        const olderAvg = older.length > 0 
            ? older.reduce((sum, c) => sum + (c.health || 0), 0) / older.length 
            : recentAvg;
        
        const change = recentAvg - olderAvg;
        
        let trend = 'stable';
        if (change > 10) {
            trend = 'improving';
        } else if (change < -10) {
            trend = 'degrading';
        }
        
        return { trend, change: Math.round(change) };
    }
}

module.exports = ServerStateCapture;
