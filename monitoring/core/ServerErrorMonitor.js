/**
 * Server Error Monitor
 * 
 * Monitors server health and errors, generates prompts for all server issues
 * Integrates with prompt generation system
 * 
 * FIXED: Removed url.parse() - now using WHATWG URL API (new URL())
 * Version: 2.0 - url.parse() removed
 */

const EventEmitter = require('events');
const gameLogger = require('../../src/utils/GameLogger');

// Clear require cache to ensure fresh code loads
if (require.cache[__filename]) {
    delete require.cache[__filename];
}

class ServerErrorMonitor extends EventEmitter {
    constructor(stateStore, promptGenerator, serverUrl = 'http://localhost:3000') {
        super();
        this.stateStore = stateStore;
        this.promptGenerator = promptGenerator;
        this.serverUrl = serverUrl;
        this.monitoringInterval = null;
        this.checkInterval = 5000; // Check every 5 seconds
        this.consecutiveErrors = 0;
        this.lastHealthCheck = null;
        this.lastError = null;
    }

    /**
     * Start monitoring server
     */
    start() {
        if (this.monitoringInterval) {
            return; // Already monitoring
        }

        gameLogger.info('MONITORING', '[SERVER_ERROR_MONITOR] Starting server health monitoring');
        
        this.monitoringInterval = setInterval(() => {
            this.checkServerHealth().catch(error => {
                gameLogger.error('MONITORING', '[SERVER_ERROR_MONITOR] Health check error', {
                    error: error.message
                });
            });
        }, this.checkInterval);

        // Initial check
        this.checkServerHealth().catch(() => {});
    }

    /**
     * Stop monitoring server
     */
    stop() {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }
        gameLogger.info('MONITORING', '[SERVER_ERROR_MONITOR] Stopped server health monitoring');
    }

    /**
     * Check server health
     */
    async checkServerHealth() {
        try {
            const http = require('http');
            
            // Use WHATWG URL API instead of deprecated url.parse()
            const urlObj = new URL(`${this.serverUrl}/health`);
            const options = {
                hostname: urlObj.hostname,
                port: urlObj.port || 3000,
                path: urlObj.pathname + urlObj.search,
                method: 'GET',
                timeout: 2000
            };

            const healthCheck = await new Promise((resolve, reject) => {
                const req = http.request(options, (res) => {
                    let data = '';
                    res.on('data', (chunk) => {
                        data += chunk;
                    });
                    res.on('end', () => {
                        if (res.statusCode === 200) {
                            try {
                                const health = JSON.parse(data);
                                resolve({ success: true, health });
                            } catch (e) {
                                resolve({ success: false, error: 'Invalid JSON response' });
                            }
                        } else {
                            resolve({ success: false, error: `HTTP ${res.statusCode}` });
                        }
                    });
                });

                req.on('error', (error) => {
                    resolve({ success: false, error: error.message });
                });

                req.on('timeout', () => {
                    req.destroy();
                    resolve({ success: false, error: 'Request timeout' });
                });

                req.end();
            });

            this.lastHealthCheck = Date.now();

            if (!healthCheck.success) {
                this.consecutiveErrors++;
                const error = {
                    type: 'server_error',
                    errorType: healthCheck.error || 'Server health check failed',
                    component: 'Server',
                    issueType: 'server_health_error',
                    errorMessage: healthCheck.error || 'Server is not responding',
                    timestamp: Date.now(),
                    consecutiveErrors: this.consecutiveErrors
                };

                // Only generate prompt if this is a new error or error persists
                if (!this.lastError || 
                    this.lastError.errorMessage !== error.errorMessage ||
                    (Date.now() - this.lastError.timestamp) > 30000) { // 30 seconds
                    
                    this.lastError = error;
                    this.emit('serverError', error);
                    
                    // Generate prompt for server error
                    if (this.promptGenerator) {
                        const prompt = this.promptGenerator.generatePrompt(error);
                        if (prompt) {
                            gameLogger.warn('MONITORING', '[SERVER_ERROR_MONITOR] Generated prompt for server error', {
                                promptId: prompt.id,
                                error: error.errorMessage,
                                consecutiveErrors: this.consecutiveErrors
                            });
                        }
                    }
                }
            } else {
                // Server is healthy - reset error counter
                if (this.consecutiveErrors > 0) {
                    gameLogger.info('MONITORING', '[SERVER_ERROR_MONITOR] Server recovered', {
                        previousErrors: this.consecutiveErrors
                    });
                    this.consecutiveErrors = 0;
                    this.lastError = null;
                }
            }

            // Update state
            if (this.stateStore) {
                this.stateStore.updateState('system.server', {
                    status: healthCheck.success ? 'online' : 'offline',
                    lastCheck: this.lastHealthCheck,
                    consecutiveErrors: this.consecutiveErrors,
                    lastError: this.lastError
                });
            }

        } catch (error) {
            this.consecutiveErrors++;
            const errorObj = {
                type: 'server_error',
                errorType: 'Server health check exception',
                component: 'Server',
                issueType: 'server_health_error',
                errorMessage: error.message,
                timestamp: Date.now(),
                consecutiveErrors: this.consecutiveErrors
            };

            this.emit('serverError', errorObj);
            
            // Generate prompt for server error
            if (this.promptGenerator) {
                const prompt = this.promptGenerator.generatePrompt(errorObj);
                if (prompt) {
                    gameLogger.warn('MONITORING', '[SERVER_ERROR_MONITOR] Generated prompt for server exception', {
                        promptId: prompt.id,
                        error: error.message
                    });
                }
            }
        }
    }
}

module.exports = ServerErrorMonitor;
