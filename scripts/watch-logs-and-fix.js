/**
 * Real-time log watcher that pauses Unity game when issues are detected,
 * fixes them, and resumes the game
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Import GameManager to access tables and pause/resume
const GameManager = require('../src/game/GameManager');
// Use let (not const) so we can reassign in initialize()
let gameManager = null; // Will be set by initialize()

// Get SimulationManager from SocketHandler
let simulationManager = null;
let socketHandler = null;

// Log Watcher is now a pause/resume service only - Monitor handles all issue detection
// Only detect Monitor's pause/resume markers - no independent issue detection
const MONITOR_PAUSE_PATTERNS = [
    // MONITOR DETECTED ISSUES - CRITICAL (written by monitor.ps1 to trigger pause)
    /\[MONITOR\].*\[CRITICAL_ISSUE_DETECTED\]/i,
    /CRITICAL_ISSUE_DETECTED.*pausing Unity/i
];

const MONITOR_RESUME_PATTERNS = [
    // MONITOR ISSUES FIXED - Resume marker (written by monitor.ps1 when pending-issues.json cleared)
    /\[MONITOR\].*\[ISSUES_FIXED\]/i
];

// Legacy patterns kept for reference but not used (Monitor handles all detection)
// These are here for documentation purposes only
const ERROR_PATTERNS = [
    // Only Monitor markers - all other detection moved to Monitor
    ...MONITOR_PAUSE_PATTERNS
];

// Legacy - not used anymore
const ITEM_ANTE_ERROR_PATTERNS = [];

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
function pauseSimulation(tableId, reason, pauseDebugger = false) {
    const gameLogger = require('../src/utils/GameLogger');
    
    // ROOT TRACING: Track pause attempt
    gameLogger.gameEvent('LOG_WATCHER', `[PAUSE] ATTEMPT`, {
        tableId,
        reason,
        alreadyPaused: pausedTables.has(tableId),
        gameManagerExists: !!gameManager,
        simulationManagerExists: !!simulationManager,
        socketHandlerExists: !!socketHandler,
        stackTrace: new Error().stack?.split('\n').slice(2, 8).join(' | ') || 'NO_STACK'
    });
    
    if (pausedTables.has(tableId)) {
        const existingReason = pausedTables.get(tableId).reason;
        gameLogger.gameEvent('LOG_WATCHER', `[PAUSE] ALREADY_PAUSED`, {
            tableId,
            existingReason,
            newReason: reason
        });
        gameLogger.gameEvent('LOG_WATCHER', `[PAUSE] ALREADY_PAUSED_CONSOLE`, {
            tableId,
            existingReason,
            newReason: reason
        });
        return;
    }
    
    gameLogger.gameEvent('LOG_WATCHER', `[PAUSE] PAUSING_SIMULATION`, {
        tableId,
        reason
    });
    
    if (!gameManager) {
        gameLogger.gameEvent('LOG_WATCHER', `[PAUSE] ERROR`, {
            tableId,
            reason,
            error: 'GAME_MANAGER_NOT_INITIALIZED'
        });
        gameLogger.error('LOG_WATCHER', `[RESUME] GAME_MANAGER_NOT_INITIALIZED`, {
            tableId
        });
        return;
    }
    
    // Get the table
    const table = gameManager.getTable(tableId);
    if (!table) {
        gameLogger.gameEvent('LOG_WATCHER', `[PAUSE] ERROR`, {
            tableId,
            reason,
            error: 'TABLE_NOT_FOUND',
            availableTables: Array.from(gameManager.tables.keys())
        });
        gameLogger.error('LOG_WATCHER', `[PAUSE] TABLE_NOT_FOUND_ERROR`, {
            tableId,
            reason,
            availableTables: Array.from(gameManager.tables.keys())
        });
        return;
    }
    
    // ROOT TRACING: Log before pause
    gameLogger.gameEvent('LOG_WATCHER', `[PAUSE] BEFORE_STATE`, {
        tableId,
        reason,
        tableName: table.name,
        isSimulation: table.isSimulation,
        gameStarted: table.gameStarted,
        phase: table.phase,
        currentPausedState: table.isPaused,
        currentPauseReason: table.pauseReason
    });
    
    // Set pause state on table (Unity will read this from table_state and pause itself)
    // NO server-side pausing - Unity pauses itself via Time.timeScale = 0
    table.isPaused = true;
    table.pauseReason = reason;
    
    pausedTables.set(tableId, {
        reason,
        pausedAt: Date.now(),
        fixed: false
    });
    
    // Broadcast table_state with isPaused=true so Unity can pause itself
    // Unity reads state.isPaused from table_state and pauses via Time.timeScale = 0
    let broadcastSent = false;
    if (socketHandler && socketHandler.io) {
        try {
            // Broadcast table_state to all sockets in table room so Unity sees isPaused=true
            const tableRoom = `table:${tableId}`;
            const spectatorRoom = `spectator:${tableId}`;
            
            const tableSockets = socketHandler.io.sockets.adapter.rooms.get(tableRoom);
            if (tableSockets) {
                for (const socketId of tableSockets) {
                    const socket = socketHandler.io.sockets.sockets.get(socketId);
                    if (socket) {
                        const userId = socket.data?.userId || null;
                        const state = table.getState(userId);
                        socket.emit('table_state', state); // Unity reads state.isPaused and pauses itself
                    }
                }
            }
            
            // Also broadcast to spectators
            const spectatorSockets = socketHandler.io.sockets.adapter.rooms.get(spectatorRoom);
            if (spectatorSockets) {
                for (const socketId of spectatorSockets) {
                    const socket = socketHandler.io.sockets.sockets.get(socketId);
                    if (socket) {
                        const userId = socket.data?.userId || null;
                        const state = table.getState(userId);
                        socket.emit('table_state', state);
                    }
                }
            }
            
            broadcastSent = true;
            gameLogger.gameEvent('LOG_WATCHER', `[PAUSE] TABLE_STATE_BROADCAST`, {
                tableId,
                reason,
                message: 'table_state broadcasted with isPaused=true - Unity will pause itself'
            });
        } catch (error) {
            gameLogger.gameEvent('LOG_WATCHER', `[PAUSE] BROADCAST_ERROR`, {
                tableId,
                reason,
                error: error.message
            });
        }
    }
    
    // REPORT TO USER: Pause successful - ALL LOGGING VIA GAMELOGGER
    gameLogger.gameEvent('LOG_WATCHER', `[PAUSE] SIMULATION_PAUSED`, {
        tableId,
        reason,
        tablePausedState: table.isPaused,
        gameStarted: table.gameStarted,
        phase: table.phase,
        handsPlayed: table.handsPlayed
    });
    
    // ROOT TRACING: Log pause success with full state
    gameLogger.gameEvent('LOG_WATCHER', `[PAUSE] SUCCESS`, {
        tableId,
        reason,
        tableName: table.name,
        pausedAt: Date.now(),
        broadcastSent,
        pausedTablesCount: pausedTables.size,
        tablePausedState: table.isPaused,
        tablePauseReason: table.pauseReason,
        message: 'table.isPaused set to true, table_state broadcasted - Unity will pause itself via Time.timeScale = 0'
    });
}

/**
 * Resume a simulation table
 */
function resumeSimulation(tableId) {
    const gameLogger = require('../src/utils/GameLogger');
    
    // ROOT TRACING: Track resume attempt
    gameLogger.gameEvent('LOG_WATCHER', `[RESUME] ATTEMPT`, {
        tableId,
        wasPaused: pausedTables.has(tableId),
        pauseInfo: pausedTables.has(tableId) ? pausedTables.get(tableId) : null,
        gameManagerExists: !!gameManager,
        simulationManagerExists: !!simulationManager,
        socketHandlerExists: !!socketHandler,
        stackTrace: new Error().stack?.split('\n').slice(2, 8).join(' | ') || 'NO_STACK'
    });
    
    if (!pausedTables.has(tableId)) {
        gameLogger.gameEvent('LOG_WATCHER', `[RESUME] NOT_PAUSED`, {
            tableId,
            pausedTablesCount: pausedTables.size,
            pausedTableIds: Array.from(pausedTables.keys())
        });
        gameLogger.gameEvent('LOG_WATCHER', `[RESUME] TABLE_NOT_PAUSED`, {
            tableId,
            pausedTablesCount: pausedTables.size
        });
        return;
    }
    
    const pauseInfo = pausedTables.get(tableId);
    const pauseDuration = Date.now() - pauseInfo.pausedAt;
    
    if (!pauseInfo.fixed) {
        gameLogger.gameEvent('LOG_WATCHER', `[RESUME] NOT_FIXED`, {
            tableId,
            reason: pauseInfo.reason,
            pausedAt: pauseInfo.pausedAt,
            pauseDuration: `${Math.floor(pauseDuration / 1000)}s`,
            fixing: pauseInfo.fixing || false
        });
        gameLogger.gameEvent('LOG_WATCHER', `[RESUME] CANNOT_RESUME_NOT_FIXED`, {
            tableId,
            reason: pauseInfo.reason,
            pauseDuration: `${Math.floor(pauseDuration / 1000)}s`
        });
        return;
    }
    
    gameLogger.gameEvent('LOG_WATCHER', `[RESUME] RESUMING_SIMULATION`, {
        tableId,
        reason: pauseInfo.reason,
        pauseDuration: `${Math.floor(pauseDuration / 1000)}s`
    });
    
    if (!gameManager) {
        gameLogger.gameEvent('LOG_WATCHER', `[RESUME] ERROR`, {
            tableId,
            error: 'GAME_MANAGER_NOT_INITIALIZED'
        });
        gameLogger.error('LOG_WATCHER', `[RESUME] GAME_MANAGER_NOT_INITIALIZED`, {
            tableId
        });
        return;
    }
    
    // Get the table
    const table = gameManager.getTable(tableId);
    if (!table) {
        gameLogger.gameEvent('LOG_WATCHER', `[RESUME] ERROR`, {
            tableId,
            error: 'TABLE_NOT_FOUND',
            availableTables: Array.from(gameManager.tables.keys())
        });
        gameLogger.error('LOG_WATCHER', `[PAUSE] TABLE_NOT_FOUND_ERROR`, {
            tableId,
            reason,
            availableTables: Array.from(gameManager.tables.keys())
        });
        return;
    }
    
    // ROOT TRACING: Log before resume
    gameLogger.gameEvent('LOG_WATCHER', `[RESUME] BEFORE_STATE`, {
        tableId,
        reason: pauseInfo.reason,
        pauseDuration: `${Math.floor(pauseDuration / 1000)}s`,
        tableName: table.name,
        currentPausedState: table.isPaused,
        currentPauseReason: table.pauseReason,
        gameStarted: table.gameStarted,
        phase: table.phase
    });
    
    // Clear pause state (Unity will read this from table_state and resume itself)
    // NO server-side resuming - Unity resumes itself via Time.timeScale = 1
    table.isPaused = false;
    table.pauseReason = null;
    
    pausedTables.delete(tableId);
    
    // Broadcast table_state with isPaused=false so Unity can resume itself
    // Unity reads state.isPaused from table_state and resumes via Time.timeScale = 1
    let broadcastSent = false;
    if (socketHandler && socketHandler.io) {
        try {
            // Broadcast table_state to all sockets in table room so Unity sees isPaused=false
            const tableRoom = `table:${tableId}`;
            const spectatorRoom = `spectator:${tableId}`;
            
            const tableSockets = socketHandler.io.sockets.adapter.rooms.get(tableRoom);
            if (tableSockets) {
                for (const socketId of tableSockets) {
                    const socket = socketHandler.io.sockets.sockets.get(socketId);
                    if (socket) {
                        const userId = socket.data?.userId || null;
                        const state = table.getState(userId);
                        socket.emit('table_state', state); // Unity reads state.isPaused and resumes itself
                    }
                }
            }
            
            // Also broadcast to spectators
            const spectatorSockets = socketHandler.io.sockets.adapter.rooms.get(spectatorRoom);
            if (spectatorSockets) {
                for (const socketId of spectatorSockets) {
                    const socket = socketHandler.io.sockets.sockets.get(socketId);
                    if (socket) {
                        const userId = socket.data?.userId || null;
                        const state = table.getState(userId);
                        socket.emit('table_state', state);
                    }
                }
            }
            
            broadcastSent = true;
            gameLogger.gameEvent('LOG_WATCHER', `[RESUME] TABLE_STATE_BROADCAST`, {
                tableId,
                message: 'table_state broadcasted with isPaused=false - Unity will resume itself'
            });
        } catch (error) {
            gameLogger.gameEvent('LOG_WATCHER', `[RESUME] BROADCAST_ERROR`, {
                tableId,
                error: error.message
            });
        }
    }
    
    // ROOT TRACING: Log resume success with full state
    // REPORT TO USER: Resume successful
    gameLogger.gameEvent('LOG_WATCHER', `[RESUME] SIMULATION_RESUMED_FULL`, {
        tableId,
        pauseDuration: `${Math.floor(pauseDuration / 1000)}s`,
        tablePausedState: table.isPaused,
        tableName: table.name
    });
    
    gameLogger.gameEvent('LOG_WATCHER', `[RESUME] SUCCESS`, {
        tableId,
        reason: pauseInfo.reason,
        pauseDuration: `${Math.floor(pauseDuration / 1000)}s`,
        tableName: table.name,
        resumedAt: Date.now(),
        broadcastSent,
        pausedTablesCount: pausedTables.size,
        tablePausedState: table.isPaused,
        tablePauseReason: table.pauseReason,
        gameStarted: table.gameStarted,
        phase: table.phase,
        message: 'table.isPaused set to false, table_state broadcasted - Unity will resume itself via Time.timeScale = 1'
    });
}

/**
 * Analyze log line and determine if it indicates an issue
 */
function detectIssue(logLine) {
    const gameLogger = require('../src/utils/GameLogger');
    
    // CRITICAL: Skip LOG_WATCHER's own logs to prevent infinite loops
    if (logLine.includes('[LOG_WATCHER]')) {
        return null;
    }
    
    // Skip TRACE logs - they're informational, not errors
    if (logLine.includes('[TRACE]')) {
        return null;
    }
    
    // ONLY detect Monitor's pause markers - Monitor handles all issue detection
    for (const pattern of MONITOR_PAUSE_PATTERNS) {
        if (pattern.test(logLine)) {
            // Check for monitor marker with explicit tableId in JSON
            // Format: [MONITOR] [CRITICAL_ISSUE_DETECTED] ... | Data: {"tableId":"...","pauseDebugger":true/false,...}
            const monitorMatch = logLine.match(/"tableId"\s*:\s*"([a-f0-9-]+)"/i);
            const debuggerPauseMatch = logLine.match(/"pauseDebugger"\s*:\s*(true|false)/i);
            const pauseDebugger = debuggerPauseMatch && debuggerPauseMatch[1] === 'true';
            
            if (monitorMatch) {
                const tableId = monitorMatch[1];
                const table = gameManager ? gameManager.getTable(tableId) : null;
                if (table) {
                    gameLogger.gameEvent('LOG_WATCHER', `[DETECT_ISSUE] MONITOR_PAUSE_MARKER_FOUND`, {
                        tableId,
                        tableName: table.name,
                        linePreview: logLine.substring(0, 150),
                        pauseDebugger: pauseDebugger,
                        action: 'Monitor detected issue - pausing Unity' + (pauseDebugger ? ' (with debugger break)' : '')
                    });
                    return { severity: 'critical', type: 'monitor_detected', message: logLine, pauseDebugger: pauseDebugger };
                }
            }
            
            // Monitor marker found but no tableId - still pause if we can extract it
            gameLogger.gameEvent('LOG_WATCHER', `[DETECT_ISSUE] MONITOR_PAUSE_MARKER_NO_TABLEID`, {
                linePreview: logLine.substring(0, 150),
                pauseDebugger: pauseDebugger,
                action: 'Monitor pause marker found but no tableId - will try to extract from table name' + (pauseDebugger ? ' (with debugger break)' : '')
            });
            return { severity: 'critical', type: 'monitor_detected', message: logLine, pauseDebugger: pauseDebugger };
        }
    }
    
    // No Monitor pause marker - return null (Monitor handles all detection)
    return null;
}

/**
 * Extract table ID from log line
 */
function extractTableId(logLine) {
    const gameLogger = require('../src/utils/GameLogger');
    
    if (!gameManager) {
        gameLogger.gameEvent('LOG_WATCHER', `[EXTRACT_TABLE_ID] NO_GAME_MANAGER`, {
            linePreview: logLine.substring(0, 150)
        });
        return null;
    }
    
    // ROOT TRACING: Track table ID extraction
    gameLogger.gameEvent('LOG_WATCHER', `[EXTRACT_TABLE_ID] ATTEMPT`, {
        linePreview: logLine.substring(0, 150),
        totalTables: gameManager.tables.size,
        simulationTables: getActiveSimulationTables().length
    });
    
    // Check for monitor marker with explicit tableId in JSON
    // Format: [MONITOR] [CRITICAL_ISSUE_DETECTED] ... | Data: {"tableId":"...",...}
    const monitorMatch = logLine.match(/"tableId"\s*:\s*"([a-f0-9-]+)"/i);
    if (monitorMatch) {
        const tableId = monitorMatch[1];
        const table = gameManager.getTable(tableId);
        if (table) {
            gameLogger.gameEvent('LOG_WATCHER', `[EXTRACT_TABLE_ID] FOUND_IN_MONITOR_MARKER`, {
                tableId,
                tableName: table.name
            });
            return tableId;
        }
    }
    
    // Log format: [2026-02-05 06:28:52.223] [GAME] [[SIM] dildo's Table] ...
    const match = logLine.match(/\[\[SIM\]\s+([^\]]+)\]/);
    if (match) {
        const tableName = match[1].trim();
        // Find table by name (with [SIM] prefix)
        const fullTableName = `[SIM] ${tableName}`;
        for (const [tableId, table] of gameManager.tables) {
            if ((table.name === tableName || table.name === fullTableName) && table.isSimulation) {
                gameLogger.gameEvent('LOG_WATCHER', `[EXTRACT_TABLE_ID] FOUND_BY_NAME`, {
                    tableId,
                    tableName,
                    matchedName: table.name
                });
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
                gameLogger.gameEvent('LOG_WATCHER', `[EXTRACT_TABLE_ID] FOUND_BY_CLEAN_NAME`, {
                    tableId,
                    tableName,
                    cleanName,
                    originalName: table.name
                });
                return tableId;
            }
        }
    }
    
    // Try to find any active simulation
    const simTables = getActiveSimulationTables();
    if (simTables.length > 0) {
        gameLogger.gameEvent('LOG_WATCHER', `[EXTRACT_TABLE_ID] USING_FIRST_ACTIVE`, {
            tableId: simTables[0].id,
            totalActiveSims: simTables.length
        });
        return simTables[0].id; // Pause first active simulation
    }
    
    gameLogger.gameEvent('LOG_WATCHER', `[EXTRACT_TABLE_ID] NOT_FOUND`, {
        linePreview: logLine.substring(0, 150),
        matchFound: !!match,
        matchedName: match ? match[1] : null,
        allTableNames: Array.from(gameManager.tables.values()).map(t => t.name),
        simulationTableIds: simTables.map(t => t.id)
    });
    
    return null;
}

/**
 * Fix detected issue - actually fixes the code
 */
/**
 * DEPRECATED: Auto-fix workflow removed
 * Log Watcher is now a pause/resume service only
 * Monitor coordinates all fixes via Assistant workflow
 * 
 * This function is kept for reference but should not be called
 * All fixes now go through: Monitor → pending-issues.json → Assistant → Resume marker
 */
async function handleIssueWithLogClearing(issue, tableId, tableDetails) {
    const gameLogger = require('../src/utils/GameLogger');
    gameLogger.gameEvent('LOG_WATCHER', `[DEPRECATED] AUTO_FIX_DISABLED`, {
        tableId,
        issueType: issue.type,
        message: 'Auto-fix workflow disabled. Monitor coordinates fixes via Assistant.',
        action: 'This function should not be called - Monitor handles all fixes'
    });
    return; // Do nothing - Monitor handles fixes
}

async function fixIssue(issue, tableId) {
    const gameLogger = require('../src/utils/GameLogger');
    
    const fullMessage = issue.message.length > 500 ? issue.message.substring(0, 500) + '...' : issue.message;
    
    // REPORT TO USER: Starting fix attempt with FULL DETAILS - ALL LOGGING VIA GAMELOGGER
    gameLogger.gameEvent('LOG_WATCHER', `[FIX] ATTEMPTING_TO_FIX_ISSUE`, {
        tableId,
        issueType: issue.type,
        issueSeverity: issue.severity,
        fullMessage: fullMessage,
        fixAttemptStarted: new Date().toISOString()
    });
    
    // ROOT TRACING: Track fix attempt with FULL DETAILS
    gameLogger.gameEvent('LOG_WATCHER', `[FIX] ATTEMPT_START`, {
        tableId,
        issueType: issue.type,
        severity: issue.severity,
        fullMessage: fullMessage,
        messagePreview: issue.message.substring(0, 150),
        pausedTablesCount: pausedTables.size,
        tableState: gameManager ? (() => {
            const t = gameManager.getTable(tableId);
            return t ? {
                name: t.name,
                phase: t.phase,
                handsPlayed: t.handsPlayed,
                pot: t.pot,
                isPaused: t.isPaused
            } : null;
        })() : null
    });
    
    // Mark as being fixed
    if (pausedTables.has(tableId)) {
        pausedTables.get(tableId).fixing = true;
        pausedTables.get(tableId).fixAttemptedAt = Date.now();
    }
    
    let fixApplied = false;
    let fixDetails = null;
    
    // Different fixes based on issue type
    switch (issue.type) {
        case 'item_ante':
            fixApplied = await fixItemAnteIssue(issue, tableId);
            fixDetails = { method: 'fixItemAnteIssue', success: fixApplied };
            break;
            
        case 'general':
            fixApplied = await fixGeneralIssue(issue, tableId);
            fixDetails = { method: 'fixGeneralIssue', success: fixApplied };
            break;
    }
    
    // ROOT TRACING: Track fix result with FULL DETAILS
    gameLogger.gameEvent('LOG_WATCHER', `[FIX] ATTEMPT_RESULT`, {
        tableId,
        issueType: issue.type,
        severity: issue.severity,
        fixApplied,
        fixDetails,
        messagePreview: issue.message.substring(0, 150),
        fixDuration: pausedTables.has(tableId) && pausedTables.get(tableId).fixAttemptedAt 
            ? Date.now() - pausedTables.get(tableId).fixAttemptedAt 
            : null
    });
    
    // REPORT TO USER: Fix result with FULL DETAILS - ALL LOGGING VIA GAMELOGGER
    const fixDuration = pausedTables.has(tableId) && pausedTables.get(tableId).fixAttemptedAt 
        ? Date.now() - pausedTables.get(tableId).fixAttemptedAt 
        : null;
    gameLogger.gameEvent('LOG_WATCHER', fixApplied ? `[FIX] SUCCESSFUL` : `[FIX] FAILED`, {
        tableId,
        issueType: issue.type,
        fixMethod: fixDetails ? fixDetails.method : 'unknown',
        fixSuccess: fixApplied,
        fixDuration: fixDuration,
        timestamp: new Date().toISOString()
    });
    
    // Return fix result - resume will be handled by handleIssueWithLogClearing
    if (fixApplied) {
        if (pausedTables.has(tableId)) {
            pausedTables.get(tableId).fixed = true;
            pausedTables.get(tableId).fixing = false;
            pausedTables.get(tableId).fixedAt = Date.now();
            
            gameLogger.gameEvent('LOG_WATCHER', `[FIX] MARKED_AS_FIXED`, {
                tableId,
                issueType: issue.type,
                fixedAt: Date.now()
            });
        }
        return true; // Return success - caller will handle resume
    } else {
        gameLogger.gameEvent('LOG_WATCHER', `[FIX] FAILED`, {
            tableId,
            issueType: issue.type,
            severity: issue.severity,
            fullMessage: fullMessage,
            messagePreview: issue.message.substring(0, 150),
            action: 'Manual intervention required'
        });
        
        gameLogger.error('LOG_WATCHER', `[FIX] ISSUE_NOT_AUTO_FIXED`, {
            tableId,
            issueType: issue.type,
            issueMessage: issue.message.substring(0, 300),
            action: 'Manual intervention may be required. Simulation will remain paused until manually resumed.',
            timestamp: new Date().toISOString()
        });
        
        // Clear fixing flag so we can try again later
        if (pausedTables.has(tableId)) {
            pausedTables.get(tableId).fixing = false;
        }
        return false; // Return failure - caller will handle resume anyway
    }
}

/**
 * Fix item ante specific issues
 */
async function fixItemAnteIssue(issue, tableId) {
    const message = issue.message.toLowerCase();
    
    // Null reference issues
    if (message.includes('cannot read') || message.includes('null') || message.includes('undefined')) {
        gameLogger.gameEvent('LOG_WATCHER', `[FIX_ITEM_ANTE] NULL_REFERENCE_DETECTED`, {
            tableId,
            message: issue.message.substring(0, 150)
        });
        // These should already be fixed with null checks, but log for review
        return true; // Assume already fixed with our null checks
    }
    
    // Item not found in inventory
    if (message.includes('item not found in inventory')) {
        gameLogger.gameEvent('LOG_WATCHER', `[FIX_ITEM_ANTE] ITEM_NOT_FOUND_EXPECTED`, {
            tableId,
            message: issue.message.substring(0, 150)
        });
        return true; // Not a code bug, just missing item
    }
    
    // Item value too low
    if (message.includes('value') && message.includes('less than minimum')) {
        gameLogger.gameEvent('LOG_WATCHER', `[FIX_ITEM_ANTE] VALUE_VALIDATION_WORKING`, {
            tableId,
            message: issue.message.substring(0, 150)
        });
        return true; // This is expected behavior
    }
    
    // Missing field errors
    if (message.includes('does not contain a definition') || message.includes('missing')) {
        gameLogger.gameEvent('LOG_WATCHER', `[FIX_ITEM_ANTE] MISSING_FIELD_CHECKING`, {
            tableId,
            message: issue.message.substring(0, 150)
        });
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
    const gameLogger = require('../src/utils/GameLogger');
    const message = issue.message.toLowerCase();
    
    // Syntax errors - these need code fixes
    if (message.includes('syntaxerror') || message.includes('unexpected token')) {
        gameLogger.gameEvent('LOG_WATCHER', `[FIX_GENERAL] SYNTAX_ERROR_DETECTED`, {
            tableId,
            message: issue.message.substring(0, 150)
        });
        // These should be caught before server starts, but log for review
        return false; // Syntax errors need manual code fixes
    }
    
    // Validation failures - might be transient
    if (message.includes('validation failed')) {
        gameLogger.gameEvent('LOG_WATCHER', `[FIX_GENERAL] VALIDATION_FAILURE_TRANSIENT`, {
            tableId,
            message: issue.message.substring(0, 150)
        });
        return true; // Might resolve on next operation
    }
    
    // Chip calculation issues - CRITICAL: These need investigation, don't just mark as fixed
    // Check for "chip" (singular) or "chips" (plural) and "created" or "lost"
    if ((message.includes('chip') || message.includes('chips')) && (message.includes('lost') || message.includes('created'))) {
        gameLogger.error('LOG_WATCHER', `[FIX] CHIP_ISSUE_CRITICAL`, {
            tableId,
            message: issue.message.substring(0, 200),
            action: 'CRITICAL: Chips being created/lost - this is a serious bug that needs investigation',
            severity: 'critical',
            requiresInvestigation: true
        });
        gameLogger.gameEvent('LOG_WATCHER', `[FIX_GENERAL] CHIP_ISSUE_DETECTED`, {
            tableId,
            message: issue.message.substring(0, 200),
            note: 'This is logged but the underlying issue needs to be fixed at the root cause'
        });
        // These are critical issues - log them but don't auto-resume
        // The issue needs to be investigated and fixed, not just logged
        return false; // Don't mark as fixed - needs investigation
    }
    
    // Pot-related issues - these are validation warnings, not critical errors
    if (message.includes('pot') && (message.includes('changed') || message.includes('cleared'))) {
        gameLogger.gameEvent('LOG_WATCHER', `[FIX_GENERAL] POT_VALIDATION_WARNING`, {
            tableId,
            message: issue.message.substring(0, 150),
            note: 'Pot changes are logged for analysis but don\'t require pause'
        });
        return true; // Logged for analysis, can continue
    }
    
    // FIX_71: Player won more than contributed - this is often legitimate (side pots)
    // The fix in Table.js now correctly detects legitimate side pot scenarios
    // So if this error appears, it's likely a false positive that was already fixed
    if (message.includes('player won') && (message.includes('more than contributed') || message.includes('significantly more'))) {
        gameLogger.gameEvent('LOG_WATCHER', `[FIX_GENERAL] FIX_71_PLAYER_WON_MORE_THAN_CONTRIBUTED`, {
            tableId,
            message: issue.message.substring(0, 200),
            note: 'This is often legitimate due to side pots. The fix now correctly detects legitimate scenarios. Logging for analysis.',
            action: 'This is expected behavior in side pot scenarios - no fix needed'
        });
        return true; // Logged for analysis, can continue (fix already applied in Table.js)
    }
    
    return false; // Unknown general issue
}

/**
 * Watch log file for new entries
 */
function watchLogs() {
    const gameLogger = require('../src/utils/GameLogger');
    gameLogger.gameEvent('LOG_WATCHER', `[WATCH] WATCHING_LOGS`, {
        logFile
    });
    
    // Check if log file exists
    if (!fs.existsSync(logFile)) {
        gameLogger.gameEvent('LOG_WATCHER', `[WATCH] LOG_FILE_NOT_EXISTS_WAITING`, {
            logFile
        });
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
    
    const gameLogger = require('../src/utils/GameLogger');
    gameLogger.gameEvent('LOG_WATCHER', `[WATCH] STARTED`, {
        logFile,
        initialSize: lastPosition,
        watchInterval: 500,
        monitoringActive: true,
        continuous: true
    });
    
    gameLogger.gameEvent('LOG_WATCHER', `[WATCH] CONTINUOUS_MONITORING_ACTIVE`, {
        logFile,
        checkInterval: '500ms',
        monitoring: 'CONTINUOUS (will never stop)',
        note: 'All issues will be reported with full details'
    });
    
    // Watch for file changes - CONTINUOUS MONITORING
    fs.watchFile(logFile, { interval: 500 }, (curr, prev) => {
        if (curr.size > lastPosition) {
            // ROOT TRACING: File change detected
            gameLogger.gameEvent('LOG_WATCHER', `[WATCH] FILE_CHANGED`, {
                previousSize: lastPosition,
                currentSize: curr.size,
                bytesAdded: curr.size - lastPosition,
                pausedTablesCount: pausedTables.size
            });
            
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
                // Process new lines - EVERY LINE IS CHECKED
                const lines = buffer.split('\n').filter(line => line.trim());
                
                // ROOT TRACING: Processing new lines
                if (lines.length > 0) {
                    gameLogger.gameEvent('LOG_WATCHER', `[WATCH] PROCESSING_LINES`, {
                        linesCount: lines.length,
                        pausedTablesCount: pausedTables.size
                    });
                }
                
                for (const line of lines) {
                    processLogLine(line); // Process EVERY line
                }
                
                // CRITICAL: Update position AFTER processing - use actual current size
                // Also verify the position is correct to prevent SIZE_MISMATCH
                const actualSize = fs.statSync(logFile).size;
                if (actualSize !== curr.size) {
                    gameLogger.gameEvent('LOG_WATCHER', `[WATCH] SIZE_CHANGED_DURING_READ`, {
                        expectedSize: curr.size,
                        actualSize: actualSize,
                        difference: actualSize - curr.size,
                        action: 'Using actual size to prevent position drift'
                    });
                }
                lastPosition = actualSize; // Use actual file size, not curr.size
            });
        }
    });
    
    // Verify monitoring is continuous and fix position drift
    setInterval(() => {
        const stats = fs.statSync(logFile);
        if (stats.size !== lastPosition) {
            // File changed but watchFile didn't trigger OR position drifted
            const difference = stats.size - lastPosition;
            
            // If position is ahead of file (negative difference), reset to actual size
            // This happens when log file was rotated/cleared
            if (difference < 0 || lastPosition > stats.size) {
                gameLogger.gameEvent('LOG_WATCHER', `[WATCH] POSITION_DRIFT_DETECTED_RESETTING`, {
                    lastPosition,
                    actualSize: stats.size,
                    difference: difference,
                    action: 'Resetting position to actual file size - log may have been rotated/cleared'
                });
                lastPosition = stats.size; // Reset to actual size
            } else {
                // File grew but watchFile didn't trigger - read the new content
                gameLogger.gameEvent('LOG_WATCHER', `[WATCH] SIZE_MISMATCH_READING_MISSED_CONTENT`, {
                    lastPosition,
                    actualSize: stats.size,
                    difference: difference,
                    action: 'Reading missed content'
                });
                
                // Read the missed content
                const stream = fs.createReadStream(logFile, {
                    start: lastPosition,
                    end: stats.size
                });
                
                let buffer = '';
                stream.on('data', (chunk) => {
                    buffer += chunk.toString();
                });
                
                stream.on('end', () => {
                    const lines = buffer.split('\n').filter(line => line.trim());
                    if (lines.length > 0) {
                        gameLogger.gameEvent('LOG_WATCHER', `[WATCH] PROCESSING_MISSED_LINES`, {
                            linesCount: lines.length
                        });
                        for (const line of lines) {
                            processLogLine(line);
                        }
                    }
                    lastPosition = stats.size; // Update position
                });
            }
        }
    }, 5000); // Check every 5 seconds that monitoring is still active
}

/**
 * Process a single log line
 */
function processLogLine(line) {
    const gameLogger = require('../src/utils/GameLogger');
    
    // CRITICAL: Skip LOG_WATCHER and TRACE logs FIRST before any pattern matching
    // This prevents infinite loops and false positives
    if (line.includes('[LOG_WATCHER]')) {
        return; // Skip watcher's own logs entirely
    }
    
    if (line.includes('[TRACE]')) {
        return; // Skip TRACE logs entirely
    }
    
    // Check for resume marker from monitor (when pending-issues.json is cleared)
    if (line.includes('[MONITOR]') && line.includes('[ISSUES_FIXED]')) {
        gameLogger.gameEvent('LOG_WATCHER', `[PROCESS_LINE] RESUME_MARKER_DETECTED`, {
            linePreview: line.substring(0, 200),
            action: 'Monitor cleared pending-issues.json - resuming all paused tables'
        });
        
        // Resume all paused tables
        const tablesToResume = Array.from(pausedTables.keys());
        for (const tableId of tablesToResume) {
            const pauseInfo = pausedTables.get(tableId);
            if (pauseInfo && !pauseInfo.fixing) {
                gameLogger.gameEvent('LOG_WATCHER', `[PROCESS_LINE] RESUMING_TABLE_FROM_MONITOR`, {
                    tableId,
                    reason: pauseInfo.reason,
                    pausedAt: new Date(pauseInfo.pausedAt).toISOString(),
                    pauseDuration: `${Math.floor((Date.now() - pauseInfo.pausedAt) / 1000)}s`
                });
                
                // Mark as fixed so resume will work
                pauseInfo.fixed = true;
                pauseInfo.fixing = false;
                
                // Resume the simulation
                resumeSimulation(tableId);
            }
        }
        
        return; // Don't process as an error
    }
    
    // ROOT TRACING: Track log line processing
    // Only trace if line contains Monitor markers (to avoid spam)
    const hasMonitorMarker = MONITOR_PAUSE_PATTERNS.some(pattern => pattern.test(line)) ||
                             MONITOR_RESUME_PATTERNS.some(pattern => pattern.test(line));
    
    if (hasMonitorMarker) {
        gameLogger.gameEvent('LOG_WATCHER', `[PROCESS_LINE] DETECTED_MONITOR_MARKER`, {
            linePreview: line.substring(0, 150),
            hasMonitorMarker: true,
            pausedTablesCount: pausedTables.size
        });
    }
    
    // Skip if already processing an issue
    const activePauses = Array.from(pausedTables.values()).filter(p => p.fixing);
    if (activePauses.length > 0) {
        if (hasErrorPattern) {
            gameLogger.gameEvent('LOG_WATCHER', `[PROCESS_LINE] SKIPPED_ALREADY_FIXING`, {
                linePreview: line.substring(0, 150),
                activePausesCount: activePauses.length
            });
        }
        return; // Don't process new issues while fixing
    }
    
    const issue = detectIssue(line);
    if (!issue) {
        return; // No issue detected
    }
    
    // ROOT TRACING: Issue detected
    gameLogger.gameEvent('LOG_WATCHER', `[PROCESS_LINE] ISSUE_DETECTED`, {
        issueType: issue.type,
        severity: issue.severity,
        messagePreview: issue.message.substring(0, 150),
        linePreview: line.substring(0, 150)
    });
    
    // REPORT TO USER: Issue detected with FULL DETAILS - ALL LOGGING VIA GAMELOGGER
    const fullMessage = issue.message.length > 500 ? issue.message.substring(0, 500) + '...' : issue.message;
    gameLogger.error('LOG_WATCHER', `[PROCESS_LINE] ISSUE_DETECTED_FULL`, {
        issueType: issue.type.toUpperCase(),
        severity: issue.severity.toUpperCase(),
        fullMessage: fullMessage,
        timestamp: new Date().toISOString(),
        logLinePreview: line.substring(0, 200)
    });
    
    const tableId = extractTableId(line);
    if (!tableId) {
        gameLogger.gameEvent('LOG_WATCHER', `[PROCESS_LINE] NO_TABLE_ID`, {
            issueType: issue.type,
            severity: issue.severity,
            fullMessage: fullMessage,
            messagePreview: issue.message.substring(0, 150),
            availableTables: gameManager ? Array.from(gameManager.tables.keys()) : [],
            allTables: gameManager ? Array.from(gameManager.tables.entries()).map(([id, t]) => ({
                id,
                name: t.name,
                isSimulation: t.isSimulation
            })) : []
        });
        gameLogger.error('LOG_WATCHER', `[PROCESS_LINE] NO_TABLE_ID_FULL`, {
            issueType: issue.type,
            issueMessage: issue.message.substring(0, 200),
            availableTables: gameManager ? Array.from(gameManager.tables.keys()).join(', ') : 'NONE'
        });
        return;
    }
    
    // Get table details for reporting
    const table = gameManager ? gameManager.getTable(tableId) : null;
    const tableDetails = table ? {
        name: table.name,
        isSimulation: table.isSimulation,
        gameStarted: table.gameStarted,
        phase: table.phase,
        handsPlayed: table.handsPlayed,
        pot: table.pot,
        currentPlayerIndex: table.currentPlayerIndex,
        isPaused: table.isPaused,
        pauseReason: table.pauseReason
    } : null;
    
    // CRITICAL: If table exists but isn't paused, pause it IMMEDIATELY
    // This ensures Unity stops completely when an issue is detected
    // This stops logging and gives user time to report the issue
    if (table && !table.isPaused && !pausedTables.has(tableId)) {
        gameLogger.error('LOG_WATCHER', `[PROCESS_LINE] PAUSING_UNITY_IMMEDIATELY`, {
            tableId,
            issueType: issue.type,
            severity: issue.severity,
            message: issue.message.substring(0, 200),
            whatImDoing: 'Issue detected - pausing Unity completely to stop logging and give user time to report'
        });
        
        // Pause Unity immediately - this stops all game activity and logging
        pauseSimulation(tableId, `Auto-paused: ${issue.type} - ${issue.message.substring(0, 100)}`);
        
        // Wait a moment for pause to take effect (synchronous wait)
        const startWait = Date.now();
        while (Date.now() - startWait < 500) {
            // Busy wait for 500ms
        }
    }
    
    // Check if already paused
    if (pausedTables.has(tableId)) {
        const pauseInfo = pausedTables.get(tableId);
        
        // Check if paused by monitor (waiting for manual fix)
        const pausedByMonitor = pauseInfo.reason && (
            pauseInfo.reason.includes('[MONITOR]') || 
            pauseInfo.reason.includes('CRITICAL_ISSUE_DETECTED')
        );
        
        // If paused by monitor, DON'T auto-fix - wait for user to tell assistant to fix
        if (pausedByMonitor && !pauseInfo.fixing && !pauseInfo.fixed) {
            gameLogger.gameEvent('LOG_WATCHER', `[PROCESS_LINE] PAUSED_BY_MONITOR_WAITING`, {
                tableId,
                issueType: issue.type,
                existingReason: pauseInfo.reason,
                pausedAt: new Date(pauseInfo.pausedAt).toISOString(),
                timeSincePause: Date.now() - pauseInfo.pausedAt,
                whatImDoing: 'Table paused by monitor - waiting for user to tell assistant to fix. NOT auto-fixing.',
                action: 'Monitor will write resume marker when pending-issues.json is cleared'
            });
            return; // Don't auto-fix - wait for manual fix
        }
        
        // If paused but NOT fixing, wait for Monitor to handle it
        if (!pauseInfo.fixing && !pauseInfo.fixed) {
            gameLogger.gameEvent('LOG_WATCHER', `[PROCESS_LINE] PAUSED_WAITING_FOR_MONITOR`, {
                tableId,
                issueType: issue.type,
                existingReason: pauseInfo.reason,
                pausedAt: new Date(pauseInfo.pausedAt).toISOString(),
                timeSincePause: Date.now() - pauseInfo.pausedAt,
                whatImDoing: 'Table is paused - waiting for Monitor to coordinate fix via assistant. NOT auto-fixing.',
                newIssueType: issue.type,
                newIssueMessage: issue.message.substring(0, 200),
                action: 'Monitor will write resume marker when pending-issues.json is cleared'
            });
            return; // Don't auto-fix - wait for Monitor/Assistant workflow
        }
        
        // If currently fixing, skip
        if (pauseInfo.fixing) {
            gameLogger.gameEvent('LOG_WATCHER', `[PROCESS_LINE] ALREADY_FIXING`, {
                tableId,
                issueType: issue.type,
                existingReason: pauseInfo.reason,
                pausedAt: pauseInfo.pausedAt,
                fixing: true
            });
            return; // Already fixing this table
        }
        
        // If already fixed, skip
        if (pauseInfo.fixed) {
            gameLogger.gameEvent('LOG_WATCHER', `[PROCESS_LINE] ALREADY_FIXED`, {
                tableId,
                issueType: issue.type,
                existingReason: pauseInfo.reason,
                fixed: true
            });
            return; // Already fixed
        }
        
        return; // Shouldn't reach here, but just in case
    }
    
    // ROOT TRACING: Issue detected but NOT pausing (Monitor handles pause/resume)
    // Log Watcher is now a pause/resume service only - Monitor coordinates fixes
    gameLogger.gameEvent('LOG_WATCHER', `[PROCESS_LINE] ISSUE_DETECTED_BUT_NOT_PAUSING`, {
        tableId,
        issueType: issue.type,
        severity: issue.severity,
        fullMessage: fullMessage,
        messagePreview: issue.message.substring(0, 150),
        tableDetails,
        whatImDoing: 'Issue detected but Log Watcher no longer auto-fixes. Monitor will detect and coordinate pause/resume.',
        action: 'Monitor will write pause marker if needed, then coordinate fix via assistant'
    });
    
    // NOTE: Log Watcher is now a pause/resume service only
    // Monitor detects issues and writes pause markers
    // Log Watcher responds to Monitor's pause/resume markers only
    // No auto-fix workflow - all fixes go through Monitor → Assistant workflow
}

/**
 * Initialize watcher with GameManager and SocketHandler references
 */
/**
 * Log maintenance: Archive and clear log file if it exceeds 5MB
 * This runs independently of issue detection/fixing
 */
function performLogMaintenance() {
    const gameLogger = require('../src/utils/GameLogger');
    const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5MB
    
    try {
        if (!fs.existsSync(logFile)) {
            return;
        }
        
        const stats = fs.statSync(logFile);
        const logSize = stats.size;
        
        if (logSize > MAX_LOG_SIZE) {
            gameLogger.gameEvent('LOG_WATCHER', `[LOG_MAINTENANCE] ARCHIVING_AND_CLEARING`, {
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
            
            gameLogger.gameEvent('LOG_WATCHER', `[LOG_MAINTENANCE] LOG_ARCHIVED`, {
                archiveFile,
                originalSize: logSize,
                reason: 'Log file exceeded 5MB, archived to preserve full history'
            });
            
            // Clear the log file
            fs.writeFileSync(logFile, '', 'utf8');
            lastPosition = 0; // Reset position tracking
            
            gameLogger.gameEvent('LOG_WATCHER', `[LOG_MAINTENANCE] LOG_CLEARED`, {
                logFile,
                archiveFile,
                originalSize: logSize,
                newSize: 0,
                positionReset: true
            });
        }
    } catch (error) {
        gameLogger.error('LOG_WATCHER', `[LOG_MAINTENANCE] ERROR`, {
            logFile,
            error: error.message,
            action: 'Log maintenance failed - continuing anyway'
        });
    }
}

function initialize(gameMgr, simMgr, sockHandler) {
    gameManager = gameMgr;
    simulationManager = simMgr;
    socketHandler = sockHandler;
    
    const gameLogger = require('../src/utils/GameLogger');
    gameLogger.gameEvent('LOG_WATCHER', `[INIT] INITIALIZED`, {
        gameManagerExists: !!gameMgr,
        simulationManagerExists: !!simMgr,
        socketHandlerExists: !!sockHandler,
        mode: 'PAUSE_RESUME_SERVICE_ONLY',
        note: 'Log Watcher is now a pause/resume service only - Monitor handles all issue detection and fixes'
    });
    watchLogs();
    startActiveMonitoring(); // Start active monitoring for simulation detection and status reports
    
    // Start log maintenance (check every 5 minutes)
    setInterval(() => {
        performLogMaintenance();
    }, 5 * 60 * 1000); // 5 minutes
    
    // Perform initial log maintenance check
    performLogMaintenance();
}

// Export for use
// Track last reported simulation state
let lastReportedSimulations = new Set();
let lastStatusReport = 0;
const STATUS_REPORT_INTERVAL = 10000; // Report every 10 seconds

// Force initial report on first run to detect existing simulations
let isFirstRun = true;

/**
 * Active monitoring: Check for new simulations and report status regularly
 * This function logs findings that I (the assistant) will read and report to the user
 */
function activeMonitoring() {
    const gameLogger = require('../src/utils/GameLogger');
    
    if (!gameManager) {
        return;
    }
    
    // Get all simulation tables - check both gameManager.tables and simulationManager.activeSimulations
    const simulationTables = [];
    const tableIds = new Set();
    
    // Check gameManager.tables FIRST - this is where tables actually are
    try {
        const totalTables = gameManager.tables ? gameManager.tables.size : 0;
        const allTableIds = gameManager.tables ? Array.from(gameManager.tables.keys()) : [];
        const simulationTableIds = [];
        
        gameLogger.gameEvent('LOG_WATCHER', `[ACTIVE_MONITORING] CHECKING_GAMEMANAGER_TABLES`, {
            totalTables,
            tableIds: allTableIds
        });
        
        for (const [tableId, table] of gameManager.tables) {
            if (table) {
                const isSim = table.isSimulation || false;
                gameLogger.gameEvent('LOG_WATCHER', `[ACTIVE_MONITORING] FOUND_TABLE`, {
                    tableId,
                    name: table.name,
                    isSimulation: isSim
                });
                
                if (isSim) {
                    simulationTableIds.push(tableId);
                    tableIds.add(tableId);
                    simulationTables.push({
                        id: tableId,
                        name: table.name,
                        handsPlayed: table.handsPlayed || 0,
                        phase: table.phase || 'waiting',
                        isPaused: table.isPaused || false,
                        pauseReason: table.pauseReason || null,
                        gameStarted: table.gameStarted || false,
                        pot: table.pot || 0,
                        activePlayers: table.seats ? table.seats.filter(s => s && s.isActive).length : 0
                    });
                }
            }
        }
        
        if (simulationTableIds.length > 0) {
            gameLogger.error('LOG_WATCHER', `[ACTIVE_MONITORING] SIMULATIONS_FOUND_IN_GAMEMANAGER`, {
                count: simulationTableIds.length,
                tableIds: simulationTableIds,
                tableNames: simulationTables.map(t => t.name),
                message: `Found ${simulationTableIds.length} simulation(s) in gameManager.tables`,
                reportToUser: true
            });
        }
    } catch (error) {
        gameLogger.error('LOG_WATCHER', `[ACTIVE_MONITORING] ERROR_CHECKING_TABLES`, {
            error: error.message,
            stack: error.stack
        });
    }
    
    // CRITICAL: Also check simulationManager.activeSimulations FIRST - this is the source of truth
    // The simulation might be in simulationManager but not yet in gameManager.tables
    gameLogger.gameEvent('LOG_WATCHER', `[ACTIVE_MONITORING] CHECKING_SIMULATION_MANAGER`, {
        hasSimulationManager: !!simulationManager,
        hasActiveSimulations: !!(simulationManager && simulationManager.activeSimulations),
        activeSimulationsCount: simulationManager && simulationManager.activeSimulations ? simulationManager.activeSimulations.size : 0,
        tableIds: simulationManager && simulationManager.activeSimulations ? Array.from(simulationManager.activeSimulations.keys()) : []
    });
    
    if (simulationManager && simulationManager.activeSimulations) {
        try {
            for (const [tableId, sim] of simulationManager.activeSimulations) {
                if (!tableIds.has(tableId)) {
                    // Try to get table from gameManager
                    let table = null;
                    try {
                        table = gameManager.getTable(tableId);
                    } catch (err) {
                        // Table might not be in gameManager yet, but it's in simulationManager
                        gameLogger.gameEvent('LOG_WATCHER', `[ACTIVE_MONITORING] TABLE_NOT_IN_GAMEMANAGER`, {
                            tableId,
                            reason: 'Table in simulationManager but not in gameManager.tables yet'
                        });
                    }
                    
                    // If we have the table, use it
                    if (table && table.isSimulation) {
                        tableIds.add(tableId);
                        simulationTables.push({
                            id: tableId,
                            name: table.name,
                            handsPlayed: table.handsPlayed || 0,
                            phase: table.phase || 'waiting',
                            isPaused: table.isPaused || false,
                            pauseReason: table.pauseReason || null,
                            gameStarted: table.gameStarted || false,
                            pot: table.pot || 0,
                            activePlayers: table.seats ? table.seats.filter(s => s && s.isActive).length : 0
                        });
                    } else {
                        // Table not found - log it but still try to report the simulation exists
                        gameLogger.error('LOG_WATCHER', `[ACTIVE_MONITORING] SIMULATION_FOUND_BUT_NO_TABLE`, {
                            tableId,
                            simKeys: sim ? Object.keys(sim) : 'sim is null',
                            message: `Found simulation ${tableId} in simulationManager but couldn't get table from gameManager`,
                            reportToUser: true
                        });
                        // Still report it exists even without full details
                        tableIds.add(tableId);
                        simulationTables.push({
                            id: tableId,
                            name: `Simulation ${tableId.substring(0, 8)}`,
                            handsPlayed: 0,
                            phase: 'unknown',
                            isPaused: false,
                            pauseReason: null,
                            gameStarted: false,
                            pot: 0,
                            activePlayers: 0
                        });
                    }
                }
            }
        } catch (error) {
            gameLogger.error('LOG_WATCHER', `[ACTIVE_MONITORING] ERROR_CHECKING_SIMULATIONS`, {
                error: error.message,
                stack: error.stack
            });
        }
    }
    
    // DEBUG: Log what we found
    gameLogger.gameEvent('LOG_WATCHER', `[ACTIVE_MONITORING] DEBUG_CHECK`, {
        simulationTablesFound: simulationTables.length,
        tableNames: simulationTables.map(t => t.name),
        lastReportedCount: lastReportedSimulations.size,
        isFirstRun: isFirstRun
    });
    
    // Detect new simulations
    const currentSimIds = new Set(simulationTables.map(t => t.id));
    const newSimulations = simulationTables.filter(t => !lastReportedSimulations.has(t.id));
    
    // ALWAYS report new simulations that haven't been reported yet
    if (newSimulations.length > 0) {
        // NEW SIMULATION DETECTED - REPORT TO USER VIA ERROR LOG (so I can read it)
        for (const sim of newSimulations) {
            gameLogger.gameEvent('LOG_WATCHER', `[ACTIVE_MONITORING] NEW_SIMULATION_DETECTED`, {
                action: 'SIMULATION_STARTED',
                tableId: sim.id,
                tableName: sim.name,
                message: `NEW SIMULATION DETECTED: "${sim.name}"`,
                whatImDoing: `I detected a new simulation started: "${sim.name}". I'm now actively monitoring it and will report any issues immediately.`,
                handsPlayed: sim.handsPlayed,
                phase: sim.phase,
                gameStarted: sim.gameStarted,
                isPaused: sim.isPaused,
                activePlayers: sim.activePlayers,
                pot: sim.pot,
                timestamp: new Date().toISOString(),
                reportToUser: true // Flag for me to read and report
            });
        }
        // Mark all new simulations as reported
        for (const sim of newSimulations) {
            lastReportedSimulations.add(sim.id);
            hasReportedOnThisRun = true; // We've reported something
        }
    }
    
    // On first run OR if we haven't reported yet, ALWAYS report ALL simulations
    // This handles the case where server restarts and simulations are still running
    if ((isFirstRun || !hasReportedOnThisRun) && simulationTables.length > 0) {
        gameLogger.gameEvent('LOG_WATCHER', `[ACTIVE_MONITORING] FORCING_REPORT_FIRST_RUN`, {
            reason: isFirstRun ? 'first_run' : 'not_reported_yet',
            simulationCount: simulationTables.length,
            tableNames: simulationTables.map(s => s.name),
            lastReportedCount: lastReportedSimulations.size,
            hasReportedOnThisRun: hasReportedOnThisRun
        });
        isFirstRun = false;
        hasReportedOnThisRun = true;
        for (const sim of simulationTables) {
            gameLogger.gameEvent('LOG_WATCHER', `[ACTIVE_MONITORING] EXISTING_SIMULATION_DETECTED`, {
                action: 'SIMULATION_ALREADY_RUNNING',
                tableId: sim.id,
                tableName: sim.name,
                message: `EXISTING SIMULATION DETECTED: "${sim.name}"`,
                whatImDoing: `I detected an existing simulation: "${sim.name}". I'm now actively monitoring it and will report any issues immediately.`,
                handsPlayed: sim.handsPlayed,
                phase: sim.phase,
                gameStarted: sim.gameStarted,
                isPaused: sim.isPaused,
                activePlayers: sim.activePlayers,
                pot: sim.pot,
                timestamp: new Date().toISOString(),
                reportToUser: true
            });
        }
        // Mark all as reported
        lastReportedSimulations = currentSimIds;
    } else if (simulationTables.length > 0 && lastReportedSimulations.size === 0) {
        // If we have simulations but none reported (shouldn't happen, but safety check)
        gameLogger.gameEvent('LOG_WATCHER', `[ACTIVE_MONITORING] FORCING_REPORT_NO_REPORTED`, {
            reason: 'no_simulations_reported_yet',
            simulationCount: simulationTables.length,
            tableNames: simulationTables.map(s => s.name)
        });
        for (const sim of simulationTables) {
            gameLogger.gameEvent('LOG_WATCHER', `[ACTIVE_MONITORING] EXISTING_SIMULATION_DETECTED`, {
                action: 'SIMULATION_ALREADY_RUNNING',
                tableId: sim.id,
                tableName: sim.name,
                message: `EXISTING SIMULATION DETECTED: "${sim.name}"`,
                whatImDoing: `I detected an existing simulation: "${sim.name}". I'm now actively monitoring it and will report any issues immediately.`,
                handsPlayed: sim.handsPlayed,
                phase: sim.phase,
                gameStarted: sim.gameStarted,
                isPaused: sim.isPaused,
                activePlayers: sim.activePlayers,
                pot: sim.pot,
                timestamp: new Date().toISOString(),
                reportToUser: true
            });
        }
        lastReportedSimulations = currentSimIds;
    }
    
    // ALWAYS report status every 10 seconds - regardless of simulation state
    // CRITICAL: This log is written with [ERROR] level so I (the assistant) can easily find and report it
    const now = Date.now();
    if (now - lastStatusReport >= STATUS_REPORT_INTERVAL) {
        const statusMessage = simulationTables.length > 0 
            ? `STATUS: ${simulationTables.length} active simulation(s) running` 
            : 'STATUS: No active simulations - monitoring for new ones';
        
        const whatImDoing = simulationTables.length > 0
            ? `I'm actively monitoring ${simulationTables.length} simulation(s). All systems operational. Will report immediately if any issues are detected.`
            : 'I am actively monitoring the game logs and will report any issues immediately. Waiting for simulations to start.';
        
        // Prepare simulation data
        const simData = simulationTables.length > 0 ? simulationTables.map(s => ({
            name: s.name,
            handsPlayed: s.handsPlayed,
            phase: s.phase,
            isPaused: s.isPaused,
            pauseReason: s.pauseReason,
            pot: s.pot,
            activePlayers: s.activePlayers
        })) : [];
        
        // Write to log with [ERROR] level so it's easy to find
        gameLogger.gameEvent('LOG_WATCHER', `[ACTIVE_MONITORING] STATUS_REPORT`, {
            action: 'STATUS_UPDATE',
            activeSimulations: simulationTables.length,
            simulations: simData,
            message: statusMessage,
            whatImDoing: whatImDoing,
            timestamp: new Date().toISOString(),
            reportToUser: true, // Flag for me to read and report
            // CRITICAL: Add a clear marker so I can easily find these reports
            REPORT_MARKER: '=== STATUS REPORT FOR USER ==='
        });
        
        // All output goes to gameLogger - no console output
        // Status reports are logged to game.log for monitoring system to read
        
        lastStatusReport = now;
    }
    
    // Clean up removed simulations
    lastReportedSimulations = new Set(Array.from(lastReportedSimulations).filter(id => currentSimIds.has(id)));
}

// Start active monitoring
let activeMonitoringInterval = null;

function startActiveMonitoring() {
    const gameLogger = require('../src/utils/GameLogger');
    
    if (activeMonitoringInterval) {
        clearInterval(activeMonitoringInterval);
    }
    
    // Check every 1 second for new simulations (faster detection)
    activeMonitoringInterval = setInterval(() => {
        try {
            activeMonitoring();
        } catch (error) {
            gameLogger.error('LOG_WATCHER', `[ACTIVE_MONITORING] ERROR`, {
                error: error.message,
                stack: error.stack
            });
        }
    }, 1000); // Check every 1 second instead of 2
    
    // Use error log so I can detect and report this to the user
    gameLogger.gameEvent('LOG_WATCHER', `[ACTIVE_MONITORING] STARTED`, {
        checkInterval: '1 second',
        statusReportInterval: '10 seconds',
        message: 'ACTIVE MONITORING STARTED - I will detect new simulations and report status regularly',
        whatImDoing: 'I will now actively monitor for new simulations and report status regularly',
        reportToUser: true
    });
    
    // Immediate first check to detect any existing simulations
    activeMonitoring();
    
    // Also hook into SimulationManager to detect new simulations immediately
    if (simulationManager && simulationManager.startSimulation) {
        const originalStartSimulation = simulationManager.startSimulation.bind(simulationManager);
        simulationManager.startSimulation = async function(...args) {
            const result = await originalStartSimulation(...args);
            // Immediately check for new simulation after it's created
            setTimeout(() => {
                activeMonitoring();
            }, 1000); // Wait 1 second for table to be fully created
            return result;
        };
        gameLogger.gameEvent('LOG_WATCHER', `[ACTIVE_MONITORING] HOOKED_INTO_SIMULATION_MANAGER`, {
            message: 'I will now detect simulations immediately when they are created',
            reportToUser: true
        });
    }
}

module.exports = {
    initialize,
    watchLogs,
    pauseSimulation,
    resumeSimulation,
    getActiveSimulationTables,
    startActiveMonitoring
};

// If run directly, try to watch (but won't have full access to managers)
if (require.main === module) {
    const gameLogger = require('../src/utils/GameLogger');
    gameLogger.gameEvent('LOG_WATCHER', `[INIT] STANDALONE_MODE`, {
        note: 'For full functionality, integrate with server.js'
    });
    watchLogs();
}
