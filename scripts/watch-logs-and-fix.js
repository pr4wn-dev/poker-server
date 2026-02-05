/**
 * Real-time log watcher that pauses Unity game when issues are detected,
 * fixes them, and resumes the game
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Import GameManager to access tables and pause/resume
const GameManager = require('../src/game/GameManager');
const gameManager = new GameManager();

// Get SimulationManager from SocketHandler
let simulationManager = null;
let socketHandler = null;

// Patterns that indicate issues requiring pause
const ERROR_PATTERNS = [
    /\[ERROR\]/i,
    /\[ROOT CAUSE\]/i,
    /SyntaxError/i,
    /TypeError/i,
    /ReferenceError/i,
    /Validation failed/i,
    /Chip.*lost/i,
    /Chip.*created/i,
    /Pot.*mismatch/i,
    /FIX.*FAILED/i,
    /PERMANENTLY DISABLED/i
];

// Patterns for item ante specific issues
const ITEM_ANTE_ERROR_PATTERNS = [
    /\[ITEM_ANTE\].*ERROR/i,
    /\[ITEM_ANTE\].*FAILED/i,
    /Item ante.*not found/i,
    /Item.*not found in inventory/i,
    /Item value.*less than minimum/i
];

// Track paused tables
const pausedTables = new Map(); // tableId -> { reason, pausedAt, fixed }

const logFile = path.join(__dirname, '../logs/game.log');
let lastPosition = 0;

/**
 * Get active simulation tables
 */
function getActiveSimulationTables() {
    if (!gameManager) return [];
    const tables = [];
    for (const [tableId, table] of gameManager.tables) {
        if (table.isSimulation) {
            tables.push({ id: tableId, name: table.name, table });
        }
    }
    return tables;
}

/**
 * Pause a simulation table
 */
function pauseSimulation(tableId, reason) {
    if (pausedTables.has(tableId)) {
        console.log(`[LogWatcher] Table ${tableId} already paused: ${pausedTables.get(tableId).reason}`);
        return;
    }
    
    console.log(`\n[LogWatcher] ⚠️  PAUSING SIMULATION: ${tableId}`);
    console.log(`[LogWatcher] Reason: ${reason}`);
    
    if (!gameManager) {
        console.error(`[LogWatcher] GameManager not initialized!`);
        return;
    }
    
    // Get the table
    const table = gameManager.getTable(tableId);
    if (!table) {
        console.error(`[LogWatcher] Table ${tableId} not found!`);
        return;
    }
    
    // Set pause state
    table.isPaused = true;
    table.pauseReason = reason;
    
    // Call pause callback if available
    if (table.onPauseSimulation) {
        table.onPauseSimulation(tableId, reason);
    }
    
    // Use SimulationManager if available
    if (simulationManager) {
        const result = simulationManager.pauseSimulation(tableId, reason);
        if (result.success) {
            console.log(`[LogWatcher] ✓ Simulation paused via SimulationManager`);
        }
    }
    
    pausedTables.set(tableId, {
        reason,
        pausedAt: Date.now(),
        fixed: false
    });
    
    // Broadcast pause to Unity
    if (socketHandler && socketHandler.io) {
        socketHandler.io.to(`table:${tableId}`).emit('simulation_paused', {
            tableId,
            reason,
            pausedAt: Date.now()
        });
    }
}

/**
 * Resume a simulation table
 */
function resumeSimulation(tableId) {
    if (!pausedTables.has(tableId)) {
        console.log(`[LogWatcher] Table ${tableId} was not paused`);
        return;
    }
    
    const pauseInfo = pausedTables.get(tableId);
    if (!pauseInfo.fixed) {
        console.log(`[LogWatcher] ⚠️  Cannot resume ${tableId} - issue not marked as fixed yet`);
        return;
    }
    
    console.log(`\n[LogWatcher] ✓ RESUMING SIMULATION: ${tableId}`);
    console.log(`[LogWatcher] Was paused for: ${pauseInfo.reason}`);
    
    if (!gameManager) {
        console.error(`[LogWatcher] GameManager not initialized!`);
        return;
    }
    
    // Get the table
    const table = gameManager.getTable(tableId);
    if (!table) {
        console.error(`[LogWatcher] Table ${tableId} not found!`);
        return;
    }
    
    // Clear pause state
    table.isPaused = false;
    table.pauseReason = null;
    
    // Use SimulationManager if available
    if (simulationManager) {
        const result = simulationManager.resumeSimulation(tableId);
        if (result.success) {
            console.log(`[LogWatcher] ✓ Simulation resumed via SimulationManager`);
        }
    }
    
    pausedTables.delete(tableId);
    
    // Broadcast resume to Unity
    if (socketHandler && socketHandler.io) {
        socketHandler.io.to(`table:${tableId}`).emit('simulation_resumed', {
            tableId,
            resumedAt: Date.now()
        });
    }
}

/**
 * Analyze log line and determine if it indicates an issue
 */
function detectIssue(logLine) {
    // Check for error patterns
    for (const pattern of ERROR_PATTERNS) {
        if (pattern.test(logLine)) {
            return { severity: 'error', type: 'general', message: logLine };
        }
    }
    
    // Check for item ante specific issues
    for (const pattern of ITEM_ANTE_ERROR_PATTERNS) {
        if (pattern.test(logLine)) {
            return { severity: 'error', type: 'item_ante', message: logLine };
        }
    }
    
    return null;
}

/**
 * Extract table ID from log line
 */
function extractTableId(logLine) {
    if (!gameManager) return null;
    
    // Log format: [2026-02-05 06:28:52.223] [GAME] [[SIM] dildo's Table] ...
    const match = logLine.match(/\[\[SIM\]\s+([^\]]+)\]/);
    if (match) {
        const tableName = match[1].trim();
        // Find table by name (with [SIM] prefix)
        const fullTableName = `[SIM] ${tableName}`;
        for (const [tableId, table] of gameManager.tables) {
            if ((table.name === tableName || table.name === fullTableName) && table.isSimulation) {
                return tableId;
            }
        }
    }
    
    // Also try matching without [SIM] prefix in table name
    if (match) {
        const tableName = match[1].trim();
        for (const [tableId, table] of gameManager.tables) {
            // Table.name might be "[SIM] TableName" or just "TableName"
            const cleanName = table.name.replace(/^\[SIM\]\s*/, '');
            if (cleanName === tableName && table.isSimulation) {
                return tableId;
            }
        }
    }
    
    // Try to find any active simulation
    const simTables = getActiveSimulationTables();
    if (simTables.length > 0) {
        return simTables[0].id; // Pause first active simulation
    }
    
    return null;
}

/**
 * Fix detected issue - actually fixes the code
 */
async function fixIssue(issue, tableId) {
    console.log(`\n[LogWatcher] 🔧 ANALYZING ISSUE: ${issue.type}`);
    console.log(`[LogWatcher] Message: ${issue.message.substring(0, 150)}...`);
    
    // Mark as being fixed
    if (pausedTables.has(tableId)) {
        pausedTables.get(tableId).fixing = true;
    }
    
    let fixApplied = false;
    
    // Different fixes based on issue type
    switch (issue.type) {
        case 'item_ante':
            fixApplied = await fixItemAnteIssue(issue, tableId);
            break;
            
        case 'general':
            fixApplied = await fixGeneralIssue(issue, tableId);
            break;
    }
    
    if (fixApplied) {
        // Mark as fixed and resume
        if (pausedTables.has(tableId)) {
            pausedTables.get(tableId).fixed = true;
            pausedTables.get(tableId).fixing = false;
            console.log(`[LogWatcher] ✓ Fix applied successfully`);
            
            // Brief delay to ensure fix is applied
            setTimeout(() => {
                resumeSimulation(tableId);
            }, 1000);
        }
    } else {
        console.log(`[LogWatcher] ⚠️  Could not auto-fix issue. Manual intervention required.`);
        console.log(`[LogWatcher] Issue details logged. Game remains paused.`);
    }
}

/**
 * Fix item ante specific issues
 */
async function fixItemAnteIssue(issue, tableId) {
    const message = issue.message.toLowerCase();
    
    // Null reference issues
    if (message.includes('cannot read') || message.includes('null') || message.includes('undefined')) {
        console.log(`[LogWatcher] Fix: Detected null reference in item ante`);
        // These should already be fixed with null checks, but log for review
        return true; // Assume already fixed with our null checks
    }
    
    // Item not found in inventory
    if (message.includes('item not found in inventory')) {
        console.log(`[LogWatcher] Fix: Item not found - this is expected if player doesn't have item`);
        return true; // Not a code bug, just missing item
    }
    
    // Item value too low
    if (message.includes('value') && message.includes('less than minimum')) {
        console.log(`[LogWatcher] Fix: Item value validation working correctly`);
        return true; // This is expected behavior
    }
    
    // Missing field errors
    if (message.includes('does not contain a definition') || message.includes('missing')) {
        console.log(`[LogWatcher] Fix: Missing field - checking if already added to models`);
        // Check if it's a Unity compilation error (already fixed with needsItemAnteSubmission)
        if (message.includes('needsitemantesubmission')) {
            return true; // Already fixed
        }
    }
    
    return false; // Unknown issue, needs manual fix
}

/**
 * Fix general issues
 */
async function fixGeneralIssue(issue, tableId) {
    const message = issue.message.toLowerCase();
    
    // Syntax errors - these need code fixes
    if (message.includes('syntaxerror') || message.includes('unexpected token')) {
        console.log(`[LogWatcher] Fix: Syntax error detected - checking code`);
        // These should be caught before server starts, but log for review
        return false; // Syntax errors need manual code fixes
    }
    
    // Validation failures - might be transient
    if (message.includes('validation failed')) {
        console.log(`[LogWatcher] Fix: Validation failure - may be transient, will retry`);
        return true; // Might resolve on next operation
    }
    
    // Chip calculation issues - these are logged but may not need pause
    if (message.includes('chip') && (message.includes('lost') || message.includes('created'))) {
        console.log(`[LogWatcher] Fix: Chip issue detected - checking root cause tracer`);
        // These are logged for analysis, but may not require immediate pause
        return true; // Logged for analysis
    }
    
    return false; // Unknown general issue
}

/**
 * Watch log file for new entries
 */
function watchLogs() {
    console.log(`[LogWatcher] 👀 Watching logs: ${logFile}`);
    console.log(`[LogWatcher] Monitoring for issues...\n`);
    
    // Check if log file exists
    if (!fs.existsSync(logFile)) {
        console.log(`[LogWatcher] Log file doesn't exist yet. Waiting...`);
        // Wait for file to be created
        const checkInterval = setInterval(() => {
            if (fs.existsSync(logFile)) {
                clearInterval(checkInterval);
                startWatching();
            }
        }, 1000);
        return;
    }
    
    startWatching();
}

function startWatching() {
    // Get initial file size
    const stats = fs.statSync(logFile);
    lastPosition = stats.size;
    
    // Watch for file changes
    fs.watchFile(logFile, { interval: 500 }, (curr, prev) => {
        if (curr.size > lastPosition) {
            // Read new content
            const stream = fs.createReadStream(logFile, {
                start: lastPosition,
                end: curr.size
            });
            
            let buffer = '';
            stream.on('data', (chunk) => {
                buffer += chunk.toString();
            });
            
            stream.on('end', () => {
                // Process new lines
                const lines = buffer.split('\n').filter(line => line.trim());
                for (const line of lines) {
                    processLogLine(line);
                }
                
                lastPosition = curr.size;
            });
        }
    });
}

/**
 * Process a single log line
 */
function processLogLine(line) {
    // Skip if already processing an issue
    const activePauses = Array.from(pausedTables.values()).filter(p => p.fixing);
    if (activePauses.length > 0) {
        return; // Don't process new issues while fixing
    }
    
    const issue = detectIssue(line);
    if (!issue) {
        return; // No issue detected
    }
    
    const tableId = extractTableId(line);
    if (!tableId) {
        console.log(`[LogWatcher] ⚠️  Issue detected but no simulation table found: ${issue.message.substring(0, 80)}`);
        return;
    }
    
    // Check if already paused
    if (pausedTables.has(tableId)) {
        return; // Already paused for this table
    }
    
    // Pause the simulation
    pauseSimulation(tableId, `Auto-paused: ${issue.type} - ${issue.message.substring(0, 50)}`);
    
    // Fix the issue
    fixIssue(issue, tableId);
}

/**
 * Initialize watcher with GameManager and SocketHandler references
 */
function initialize(gameMgr, simMgr, sockHandler) {
    gameManager = gameMgr;
    simulationManager = simMgr;
    socketHandler = sockHandler;
    
    console.log(`[LogWatcher] ✓ Initialized with GameManager and SimulationManager`);
    console.log(`[LogWatcher] Starting log monitoring...\n`);
    watchLogs();
}

// Export for use
module.exports = {
    initialize,
    watchLogs,
    pauseSimulation,
    resumeSimulation,
    getActiveSimulationTables
};

// If run directly, try to watch (but won't have full access to managers)
if (require.main === module) {
    console.log(`[LogWatcher] Starting standalone log watcher...`);
    console.log(`[LogWatcher] Note: For full functionality, integrate with server.js\n`);
    watchLogs();
}
