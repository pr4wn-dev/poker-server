/**
 * GameLogger - Highly verbose logging for poker game events
 * Saves to MySQL database (if available) or logs/game.log file (fallback)
 */

const fs = require('fs');
const path = require('path');

// Check if database logging should be used
const USE_DB_LOGGING = process.env.BROKENPROMISE_USE_DB_LOGGING !== 'false';

class GameLogger {
    constructor() {
        this.logDir = path.join(__dirname, '../../logs');
        this.logFile = path.join(this.logDir, 'game.log');
        this.maxLogSize = 10 * 1024 * 1024; // 10MB max log file size
        this.backupCount = 5; // Keep 5 backup files
        this.useDatabase = USE_DB_LOGGING;
        this.dbLogger = null;
        
        // Initialize database logger if enabled
        if (this.useDatabase) {
            try {
                const DatabaseLogger = require('../../monitoring/core/DatabaseLogger');
                this.dbLogger = new DatabaseLogger(path.join(__dirname, '../..'));
            } catch (error) {
                // Fallback to file logging
                this.useDatabase = false;
            }
        }
        
        // Ensure log directory exists (for fallback)
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }
        
        // Clear log on startup (optional - comment out to keep logs)
        // this.clearLog();
    }
    
    /**
     * Get formatted timestamp
     */
    getTimestamp() {
        const now = new Date();
        return now.toISOString().replace('T', ' ').substring(0, 23);
    }
    
    /**
     * Rotate log file if it's too large
     */
    rotateLog() {
        try {
            // Skip rotation if log file doesn't exist
            if (!fs.existsSync(this.logFile)) {
                return;
            }
            
            const stats = fs.statSync(this.logFile);
            if (stats.size > this.maxLogSize) {
                // Rotate existing backups
                for (let i = this.backupCount - 1; i >= 1; i--) {
                    const oldBackup = `${this.logFile}.${i}`;
                    const newBackup = `${this.logFile}.${i + 1}`;
                    if (fs.existsSync(oldBackup)) {
                        try {
                            if (fs.existsSync(newBackup)) {
                                fs.unlinkSync(newBackup);
                            }
                            fs.renameSync(oldBackup, newBackup);
                        } catch (err) {
                            // Ignore rotation errors - don't block logging
                        }
                    }
                }
                
                // Move current log to backup.1
                try {
                    if (fs.existsSync(`${this.logFile}.1`)) {
                        fs.unlinkSync(`${this.logFile}.1`);
                    }
                    fs.renameSync(this.logFile, `${this.logFile}.1`);
                } catch (err) {
                    // Ignore rotation errors - don't block logging
                }
            }
        } catch (error) {
            // Silently ignore rotation errors - don't block logging or hang commands
            // Don't write to stderr as it causes command hangs
        }
    }
    
    /**
     * Write log entry to file
     */
    writeLog(level, category, message, data = null) {
        try {
            // CRITICAL: Skip CARDS category logging - too verbose, clogs logs
            if (category === 'CARDS') {
                return; // Don't log card visibility entries
            }
            
            // Use database if available
            if (this.useDatabase && this.dbLogger) {
                // Async write to database (don't block)
                this.dbLogger.writeLog(level, category, message, data).catch(() => {
                    // Fallback to file if database fails
                    this._writeToFile(level, category, message, data);
                });
                return;
            }
            
            // Fallback to file logging
            this._writeToFile(level, category, message, data);
        } catch (error) {
            // Can't use gameLogger here (would cause infinite loop), use minimal error handling
            // Write directly to stderr as last resort
            process.stderr.write(`[GameLogger] Error writing log: ${error.message}\n`);
        }
    }

    /**
     * Write log entry to file (fallback method)
     */
    _writeToFile(level, category, message, data = null) {
        try {
            this.rotateLog();
            
            const timestamp = this.getTimestamp();
            let logEntry = `[${timestamp}] [${level}] [${category}] ${message}`;
            
            if (data) {
                logEntry += ` | Data: ${JSON.stringify(data)}`;
            }
            
            logEntry += '\n';
            
            // Use fs.appendFile with file sharing flags to allow concurrent reads
            // This prevents EBUSY errors when monitor.ps1 is reading the file
            try {
                const fd = fs.openSync(this.logFile, 'a', 0o666); // Open for append with read/write permissions
                fs.writeSync(fd, logEntry);
                fs.closeSync(fd);
            } catch (writeError) {
                // Fallback to appendFileSync if writeSync fails
                fs.appendFileSync(this.logFile, logEntry, { flag: 'a' });
            }
        } catch (error) {
            // Silently fail
        }
    }
    
    /**
     * Clear the log file
     */
    clearLog() {
        try {
            if (fs.existsSync(this.logFile)) {
                fs.writeFileSync(this.logFile, '');
                // Log to file that it was cleared
                this.writeLog('GAME', 'GAMELOGGER', 'Log file cleared', {});
            }
        } catch (error) {
            // Can't use gameLogger here (would cause infinite loop), use minimal error handling
            process.stderr.write(`[GameLogger] Error clearing log: ${error.message}\n`);
        }
    }
    
    /**
     * Log game event
     */
    gameEvent(tableName, event, data = null) {
        this.writeLog('GAME', tableName, event, data);
    }
    
    /**
     * Log betting action
     */
    bettingAction(tableName, playerName, action, data = null) {
        this.writeLog('BETTING', tableName, `${playerName}: ${action}`, data);
    }
    
    /**
     * Log turn change
     */
    turnChange(tableName, fromPlayer, toPlayer, data = null) {
        this.writeLog('TURN', tableName, `${fromPlayer} → ${toPlayer}`, data);
    }
    
    /**
     * Log phase change
     */
    phaseChange(tableName, fromPhase, toPhase, data = null) {
        this.writeLog('PHASE', tableName, `${fromPhase} → ${toPhase}`, data);
    }
    
    /**
     * Log betting round completion check
     */
    bettingRoundCheck(tableName, checkType, result, data = null) {
        this.writeLog('BETTING_ROUND', tableName, `${checkType}: ${result}`, data);
    }
    
    /**
     * Log state snapshot
     */
    stateSnapshot(tableName, snapshot, data = null) {
        this.writeLog('STATE', tableName, snapshot, data);
    }
    
    /**
     * Log error/warning
     */
    error(tableName, message, error = null) {
        const data = error ? { message: error.message, stack: error.stack } : null;
        this.writeLog('ERROR', tableName, message, data);
    }
    
    /**
     * Log info message
     */
    info(tableName, message, data = null) {
        this.writeLog('INFO', tableName, message, data);
    }
    
    /**
     * Log warning message
     */
    warn(tableName, message, data = null) {
        this.writeLog('WARN', tableName, message, data);
    }
    
    /**
     * Log debug info
     */
    debug(tableName, message, data = null) {
        this.writeLog('DEBUG', tableName, message, data);
    }
    
    /**
     * Log card visibility (who can see what)
     * DISABLED - too verbose, clogs logs
     */
    cardVisibility(tableName, message, data = null) {
        // Disabled - card visibility logging is too verbose
        // Only log errors (missing cards) - see error logging in Table.js
    }
    
    /**
     * Log state broadcast (when state is sent to clients)
     */
    stateBroadcast(tableName, message, data = null) {
        this.writeLog('BROADCAST', tableName, message, data);
    }
    
    /**
     * Log player connection events
     */
    playerConnection(tableName, message, data = null) {
        this.writeLog('CONNECTION', tableName, message, data);
    }
    
    /**
     * Log ready-up events
     */
    readyUp(tableName, message, data = null) {
        this.writeLog('READY', tableName, message, data);
    }
    
    /**
     * Log visual/animation timing events
     */
    visual(tableName, message, data = null) {
        this.writeLog('VISUAL', tableName, message, data);
    }
    
    /**
     * Log spectator events
     */
    spectator(tableName, message, data = null) {
        this.writeLog('SPECTATOR', tableName, message, data);
    }
}

// Singleton instance
const gameLogger = new GameLogger();

module.exports = gameLogger;
