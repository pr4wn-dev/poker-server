/**
 * Server State Capture
 * 
 * Periodically captures server state and updates StateStore
 * AI needs to see server health, metrics, and status
 */

const http = require('http');

class ServerStateCapture {
    constructor(stateStore, serverUrl = 'http://localhost:3000') {
        this.stateStore = stateStore;
        this.serverUrl = serverUrl;
        this.captureInterval = 5000; // Capture every 5 seconds
        this.captureIntervalId = null;
        this.lastCaptureTime = null;
        this.captureHistory = []; // Keep last 100 captures for trends
        this.maxHistorySize = 100;
    }
    
    /**
     * Start capturing server state
     */
    start() {
        // Capture immediately
        this.captureState();
        
        // Then capture periodically
        this.captureIntervalId = setInterval(() => {
            this.captureState();
        }, this.captureInterval);
        
        console.log('[ServerStateCapture] Started - Capturing server state every 5s');
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
                database: healthData?.database || false
            });
            
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
            
        } catch (error) {
            console.error('[ServerStateCapture] Error capturing state:', error.message);
            
            // Update StateStore with error state
            this.stateStore.updateState('system.server', {
                status: 'error',
                health: 0,
                metrics: {
                    uptime: 0,
                    requests: this.captureHistory.length,
                    errors: this.captureHistory.filter(c => c.status === 'error' || c.status === 'stopped').length + 1,
                    responseTime: 0
                },
                lastCheck: Date.now(),
                error: error.message
            });
        }
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
