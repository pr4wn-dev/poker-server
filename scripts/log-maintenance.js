/**
 * Simple log maintenance - archives/clears game.log when it exceeds 5MB
 * This replaces the full log watcher which is no longer needed
 */

const fs = require('fs');
const path = require('path');
const gameLogger = require('../src/utils/GameLogger');

const logFile = path.join(__dirname, '../logs/game.log');
const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5MB
const CHECK_INTERVAL = 5 * 60 * 1000; // Check every 5 minutes

/**
 * Perform log maintenance: archive and clear if > 5MB
 */
function performLogMaintenance() {
    try {
        if (!fs.existsSync(logFile)) {
            return;
        }
        
        const stats = fs.statSync(logFile);
        const logSize = stats.size;
        
        if (logSize > MAX_LOG_SIZE) {
            gameLogger.gameEvent('LOG_MAINTENANCE', `[ARCHIVING_AND_CLEARING]`, {
                logFile,
                logSize,
                maxSize: MAX_LOG_SIZE,
                whatImDoing: 'Log file exceeded 5MB, archiving before clearing to preserve history...'
            });
            
            // Archive current log before clearing
            const archiveDir = path.join(__dirname, '../logs/archived');
            if (!fs.existsSync(archiveDir)) {
                fs.mkdirSync(archiveDir, { recursive: true });
            }
            
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
            const archiveFile = path.join(archiveDir, `game_${timestamp}_maintenance.log`);
            
            // Copy log to archive
            fs.copyFileSync(logFile, archiveFile);
            
            gameLogger.gameEvent('LOG_MAINTENANCE', `[LOG_ARCHIVED]`, {
                archiveFile,
                originalSize: logSize,
                reason: 'Log file exceeded 5MB, archived to preserve full history'
            });
            
            // Clear the log file
            fs.writeFileSync(logFile, '', 'utf8');
            
            gameLogger.gameEvent('LOG_MAINTENANCE', `[LOG_CLEARED]`, {
                logFile,
                archiveFile,
                originalSize: logSize,
                newSize: 0
            });
        }
    } catch (error) {
        gameLogger.error('LOG_MAINTENANCE', `[ERROR]`, {
            logFile,
            error: error.message,
            action: 'Log maintenance failed - continuing anyway'
        });
    }
}

/**
 * Initialize log maintenance (runs periodically)
 */
function initialize() {
    gameLogger.gameEvent('LOG_MAINTENANCE', `[INIT] INITIALIZED`, {
        checkInterval: '5 minutes',
        maxLogSize: '5MB',
        message: 'Log maintenance started - will archive and clear game.log when it exceeds 5MB'
    });
    
    // Perform initial check
    performLogMaintenance();
    
    // Check every 5 minutes
    setInterval(() => {
        performLogMaintenance();
    }, CHECK_INTERVAL);
}

module.exports = {
    initialize,
    performLogMaintenance
};

// If run directly, just do one maintenance check
if (require.main === module) {
    performLogMaintenance();
}
