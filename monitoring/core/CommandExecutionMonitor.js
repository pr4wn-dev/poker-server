/**
 * Command Execution Monitor
 * 
 * Monitors command execution to detect:
 * - Stuck/hanging commands
 * - Commands that take too long
 * - User cancellations
 * - Commands that should have completed but didn't
 * 
 * This prevents the AI from not noticing when commands hang or are cancelled.
 */

const EventEmitter = require('events');
const { exec, spawn } = require('child_process');
const gameLogger = require('../../src/utils/GameLogger');

class CommandExecutionMonitor extends EventEmitter {
    constructor(stateStore, issueDetector, learningEngine) {
        super();
        this.stateStore = stateStore;
        this.issueDetector = issueDetector;
        this.learningEngine = learningEngine;
        
        // Track active commands
        this.activeCommands = new Map(); // commandId -> { command, startTime, timeout, pid, cancelled }
        
        // Default timeout (5 minutes)
        this.defaultTimeout = 5 * 60 * 1000;
        
        // Stuck command detection threshold (30 seconds)
        this.stuckThreshold = 30 * 1000;
        
        // Check for stuck commands every 10 seconds
        this.checkInterval = setInterval(() => {
            this.checkStuckCommands();
        }, 10000);
        
        // Load learned patterns
        this.load();
    }
    
    /**
     * Execute command with monitoring
     * @param {string} command - Command to execute
     * @param {Object} options - Execution options
     * @returns {Promise<Object>} Execution result
     */
    async executeCommand(command, options = {}) {
        const commandId = this.generateCommandId();
        const timeout = options.timeout || this.defaultTimeout;
        const startTime = Date.now();
        
        // Track command
        const commandInfo = {
            command,
            startTime,
            timeout,
            pid: null,
            cancelled: false,
            completed: false,
            result: null
        };
        
        this.activeCommands.set(commandId, commandInfo);
        
        // Create promise with timeout
        return new Promise((resolve, reject) => {
            // Set timeout
            const timeoutId = setTimeout(() => {
                if (!commandInfo.completed) {
                    commandInfo.completed = true;
                    this.activeCommands.delete(commandId);
                    
                    // Kill process if still running
                    if (commandInfo.pid) {
                        try {
                            if (process.platform === 'win32') {
                                exec(`taskkill /F /PID ${commandInfo.pid}`, { timeout: 2000 }, () => {});
                            } else {
                                process.kill(commandInfo.pid, 'SIGTERM');
                            }
                        } catch (error) {
                            // Ignore kill errors
                        }
                    }
                    
                    const error = new Error(`Command timeout after ${timeout}ms: ${command}`);
                    error.code = 'COMMAND_TIMEOUT';
                    error.commandId = commandId;
                    error.command = command;
                    error.duration = Date.now() - startTime;
                    
                    // Report to learning system
                    this.reportStuckCommand(command, timeout, error);
                    
                    reject(error);
                }
            }, timeout);
            
            // Execute command
            const childProcess = exec(command, {
                timeout: timeout - 1000, // Slightly less than our timeout
                maxBuffer: options.maxBuffer || 1024 * 1024,
                ...options
            }, (error, stdout, stderr) => {
                clearTimeout(timeoutId);
                
                if (!commandInfo.completed) {
                    commandInfo.completed = true;
                    commandInfo.result = { error, stdout, stderr };
                    this.activeCommands.delete(commandId);
                    
                    const duration = Date.now() - startTime;
                    
                    // Check if command was cancelled (user interrupted)
                    if (error && error.signal === 'SIGINT') {
                        const cancelError = new Error(`Command cancelled by user: ${command}`);
                        cancelError.code = 'COMMAND_CANCELLED';
                        cancelError.commandId = commandId;
                        cancelError.command = command;
                        cancelError.duration = duration;
                        
                        // Report cancellation
                        this.reportCancelledCommand(command, duration);
                        
                        reject(cancelError);
                        return;
                    }
                    
                    // Check if command took too long (stuck detection)
                    if (duration > this.stuckThreshold) {
                        this.reportSlowCommand(command, duration);
                    }
                    
                    if (error) {
                        reject(error);
                    } else {
                        resolve({ stdout, stderr, duration, commandId });
                    }
                }
            });
            
            // Track process ID
            commandInfo.pid = childProcess.pid;
            
            // Handle process events
            childProcess.on('error', (error) => {
                clearTimeout(timeoutId);
                if (!commandInfo.completed) {
                    commandInfo.completed = true;
                    this.activeCommands.delete(commandId);
                    
                    const duration = Date.now() - startTime;
                    error.commandId = commandId;
                    error.command = command;
                    error.duration = duration;
                    
                    reject(error);
                }
            });
            
            // Handle cancellation signal
            process.on('SIGINT', () => {
                if (!commandInfo.completed && commandInfo.pid) {
                    commandInfo.cancelled = true;
                    try {
                        if (process.platform === 'win32') {
                            exec(`taskkill /F /PID ${commandInfo.pid}`, { timeout: 2000 }, () => {});
                        } else {
                            process.kill(commandInfo.pid, 'SIGTERM');
                        }
                    } catch (killError) {
                        // Ignore kill errors
                    }
                }
            });
        });
    }
    
    /**
     * Check for stuck commands
     */
    checkStuckCommands() {
        const now = Date.now();
        
        for (const [commandId, commandInfo] of this.activeCommands.entries()) {
            const elapsed = now - commandInfo.startTime;
            
            // Check if command is stuck (taking longer than threshold)
            if (elapsed > this.stuckThreshold && !commandInfo.completed) {
                // Report stuck command
                this.reportStuckCommand(
                    commandInfo.command,
                    elapsed,
                    new Error(`Command appears stuck: ${commandInfo.command} (running for ${elapsed}ms)`)
                );
                
                // Emit event
                this.emit('commandStuck', {
                    commandId,
                    command: commandInfo.command,
                    elapsed,
                    pid: commandInfo.pid
                });
            }
            
            // Check if command exceeded timeout
            if (elapsed > commandInfo.timeout && !commandInfo.completed) {
                // This should have been caught by timeout, but double-check
                commandInfo.completed = true;
                this.activeCommands.delete(commandId);
                
                // Kill process
                if (commandInfo.pid) {
                    try {
                        if (process.platform === 'win32') {
                            exec(`taskkill /F /PID ${commandInfo.pid}`, { timeout: 2000 }, () => {});
                        } else {
                            process.kill(commandInfo.pid, 'SIGTERM');
                        }
                    } catch (error) {
                        // Ignore kill errors
                    }
                }
            }
        }
    }
    
    /**
     * Report stuck command to learning system
     */
    reportStuckCommand(command, duration, error) {
        gameLogger.warn('CERBERUS', '[COMMAND_MONITOR] Command stuck', {
            command,
            duration,
            error: error.message
        });
        
        // Report to issue detector
        if (this.issueDetector) {
            this.issueDetector.detectIssue({
                type: 'COMMAND_STUCK',
                severity: 'high',
                method: 'commandExecutionMonitor',
                details: {
                    command,
                    duration,
                    error: error.message
                }
            });
        }
        
        // Learn from stuck command
        if (this.learningEngine) {
            this.learningEngine.learnFromSyntaxError({
                type: 'COMMAND_STUCK',
                filePath: null,
                line: null,
                message: `Command stuck: ${command} (${duration}ms)`,
                solution: `Add timeout to command execution. Check for hanging operations. Use process monitoring.`,
                pattern: 'COMMAND_STUCK_TIMEOUT'
            });
        }
        
        // Store pattern
        const patterns = this.stateStore.getState('monitoring.commandPatterns') || {};
        if (!patterns.stuckCommands) {
            patterns.stuckCommands = [];
        }
        patterns.stuckCommands.push({
            command,
            duration,
            timestamp: Date.now()
        });
        
        // Keep only last 50
        if (patterns.stuckCommands.length > 50) {
            patterns.stuckCommands = patterns.stuckCommands.slice(-50);
        }
        
        this.stateStore.updateState('monitoring.commandPatterns', patterns);
    }
    
    /**
     * Report cancelled command
     */
    reportCancelledCommand(command, duration) {
        gameLogger.warn('CERBERUS', '[COMMAND_MONITOR] Command cancelled by user', {
            command,
            duration
        });
        
        // Report to issue detector
        if (this.issueDetector) {
            this.issueDetector.detectIssue({
                type: 'COMMAND_CANCELLED',
                severity: 'medium',
                method: 'commandExecutionMonitor',
                details: {
                    command,
                    duration,
                    reason: 'User cancelled command (SIGINT)'
                }
            });
        }
        
        // Learn from cancellation
        if (this.learningEngine) {
            this.learningEngine.learnFromSyntaxError({
                type: 'COMMAND_CANCELLED',
                filePath: null,
                line: null,
                message: `Command cancelled: ${command} (${duration}ms)`,
                solution: `Command was cancelled by user. Should have detected cancellation earlier. Add cancellation detection.`,
                pattern: 'COMMAND_CANCELLED_USER'
            });
        }
        
        // Store pattern
        const patterns = this.stateStore.getState('monitoring.commandPatterns') || {};
        if (!patterns.cancelledCommands) {
            patterns.cancelledCommands = [];
        }
        patterns.cancelledCommands.push({
            command,
            duration,
            timestamp: Date.now()
        });
        
        // Keep only last 50
        if (patterns.cancelledCommands.length > 50) {
            patterns.cancelledCommands = patterns.cancelledCommands.slice(-50);
        }
        
        this.stateStore.updateState('monitoring.commandPatterns', patterns);
    }
    
    /**
     * Report slow command
     */
    reportSlowCommand(command, duration) {
        gameLogger.info('CERBERUS', '[COMMAND_MONITOR] Command took longer than expected', {
            command,
            duration,
            threshold: this.stuckThreshold
        });
        
        // Store pattern for learning
        const patterns = this.stateStore.getState('monitoring.commandPatterns') || {};
        if (!patterns.slowCommands) {
            patterns.slowCommands = [];
        }
        patterns.slowCommands.push({
            command,
            duration,
            timestamp: Date.now()
        });
        
        // Keep only last 50
        if (patterns.slowCommands.length > 50) {
            patterns.slowCommands = patterns.slowCommands.slice(-50);
        }
        
        this.stateStore.updateState('monitoring.commandPatterns', patterns);
    }
    
    /**
     * Generate unique command ID
     */
    generateCommandId() {
        return `cmd-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
    
    /**
     * Get active commands
     */
    getActiveCommands() {
        return Array.from(this.activeCommands.entries()).map(([id, info]) => ({
            id,
            command: info.command,
            elapsed: Date.now() - info.startTime,
            pid: info.pid,
            cancelled: info.cancelled
        }));
    }
    
    /**
     * Load learned patterns
     */
    load() {
        // Patterns are loaded from state store as needed
    }
    
    /**
     * Stop monitoring
     */
    stop() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
        
        // Kill all active commands
        for (const [commandId, commandInfo] of this.activeCommands.entries()) {
            if (commandInfo.pid && !commandInfo.completed) {
                try {
                    if (process.platform === 'win32') {
                        exec(`taskkill /F /PID ${commandInfo.pid}`, { timeout: 2000 }, () => {});
                    } else {
                        process.kill(commandInfo.pid, 'SIGTERM');
                    }
                } catch (error) {
                    // Ignore kill errors
                }
            }
        }
        
        this.activeCommands.clear();
    }
}

module.exports = CommandExecutionMonitor;
