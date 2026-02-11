/**
 * Simple Error Summary
 * 
 * Shows recent errors from game.log, simulation.log, socketbot.log
 * 
 * Usage:
 *   node simple/error-summary.js
 *   node simple/error-summary.js --last 50
 */

const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '../../logs');
const LOG_FILES = [
    'game.log',
    'simulation.log',
    'socketbot.log'
];

// Parse log line
function parseLogLine(line) {
    // Try to extract timestamp, level, category, message
    const timestampMatch = line.match(/\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}[.\d]*)\]/);
    const levelMatch = line.match(/\[(ERROR|WARN|INFO|DEBUG)\]/);
    const categoryMatch = line.match(/\[([A-Z_]+)\]/);
    
    return {
        timestamp: timestampMatch ? timestampMatch[1] : null,
        level: levelMatch ? levelMatch[1] : null,
        category: categoryMatch ? categoryMatch[1] : null,
        message: line.trim(),
        raw: line
    };
}

// Get recent errors
function getRecentErrors(limit = 20) {
    const errors = [];
    
    for (const logFile of LOG_FILES) {
        const logPath = path.join(LOG_DIR, logFile);
        
        if (!fs.existsSync(logPath)) {
            continue;
        }
        
        try {
            const lines = fs.readFileSync(logPath, 'utf8').split('\n');
            
            // Read last N lines (most recent)
            const recentLines = lines.slice(-limit * 2);
            
            for (const line of recentLines) {
                if (!line.trim()) continue;
                
                const parsed = parseLogLine(line);
                
                // Only include ERROR and WARN
                if (parsed.level === 'ERROR' || parsed.level === 'WARN') {
                    errors.push({
                        ...parsed,
                        source: logFile
                    });
                }
            }
        } catch (e) {
            // Skip if can't read
        }
    }
    
    // Sort by timestamp (most recent first)
    errors.sort((a, b) => {
        if (!a.timestamp && !b.timestamp) return 0;
        if (!a.timestamp) return 1;
        if (!b.timestamp) return -1;
        return b.timestamp.localeCompare(a.timestamp);
    });
    
    return errors.slice(0, limit);
}

// Group errors by type
function groupErrors(errors) {
    const groups = {};
    
    for (const error of errors) {
        // Extract error type from message
        let errorType = 'UNKNOWN';
        
        if (error.message.includes('Pot not cleared')) {
            errorType = 'POT_NOT_CLEARED';
        } else if (error.message.includes('Money lost') || error.message.includes('Missing') || error.message.includes('chips')) {
            errorType = 'MONEY_LOST';
        } else if (error.message.includes('Pot mismatch')) {
            errorType = 'POT_MISMATCH';
        } else if (error.message.includes('Action rejected') || error.message.includes('Not your turn')) {
            errorType = 'ACTION_REJECTED';
        } else if (error.message.includes('Validation')) {
            errorType = 'VALIDATION_FAILURE';
        } else if (error.message.includes('socket') || error.message.includes('connection')) {
            errorType = 'CONNECTION_ERROR';
        } else if (error.message.includes('timeout')) {
            errorType = 'TIMEOUT';
        } else if (error.message.includes('null') || error.message.includes('undefined')) {
            errorType = 'NULL_REFERENCE';
        }
        
        if (!groups[errorType]) {
            groups[errorType] = [];
        }
        
        groups[errorType].push(error);
    }
    
    return groups;
}

// Main
const limit = process.argv.includes('--last') 
    ? parseInt(process.argv[process.argv.indexOf('--last') + 1]) || 20
    : 20;

const errors = getRecentErrors(limit);
const grouped = groupErrors(errors);

console.log(JSON.stringify({
    totalErrors: errors.length,
    byType: Object.keys(grouped).map(type => ({
        type,
        count: grouped[type].length,
        examples: grouped[type].slice(0, 2).map(e => ({
            timestamp: e.timestamp,
            message: e.message.substring(0, 200),
            source: e.source
        }))
    })),
    recent: errors.slice(0, 10).map(e => ({
        timestamp: e.timestamp,
        level: e.level,
        category: e.category,
        message: e.message.substring(0, 200),
        source: e.source
    }))
}, null, 2));
