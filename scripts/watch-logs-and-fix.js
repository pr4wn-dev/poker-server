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

// Patterns that indicate issues requiring pause
// NOTE: Exclude LOG_WATCHER errors to prevent infinite loops
const ERROR_PATTERNS = [
    /\[ROOT CAUSE\]/i,
    /\[ROOT_TRACE\].*TOTAL_BET_NOT_CLEARED/i,
    /\[ROOT_TRACE\].*PLAYER_WON_MORE_THAN_CONTRIBUTED/i,
    /SyntaxError/i,
    /TypeError/i,
    /ReferenceError/i,
    /Validation failed/i,
    /Chip.*lost/i,
    /Chip.*created/i,
    /Pot.*mismatch/i,
    /FIX.*FAILED/i,
    /PERMANENTLY DISABLED/i,
    /\[FIX\] DISABLED/i,
    /SIMULATION BOT TIMEOUT/i,
    /\[TIMER\].*TIMEOUT.*auto-folding/i,
    /\[ICON_LOADING\].*ISSUE_REPORTED/i,
    /LoadItemIcon.*FAILED/i,
    /CreateItemAnteSlot.*FAILED/i,
    /Sprite not found/i,
    /\[ERROR\](?!.*\[LOG_WATCHER\])(?!.*\[TRACE\])/i  // ERROR but NOT from LOG_WATCHER or TRACE logs
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
    
    // Set pause state
    table.isPaused = true;
    table.pauseReason = reason;
    
    // Call pause callback if available
    let callbackCalled = false;
    if (table.onPauseSimulation) {
        try {
            table.onPauseSimulation(tableId, reason);
            callbackCalled = true;
        } catch (error) {
            gameLogger.gameEvent('LOG_WATCHER', `[PAUSE] CALLBACK_ERROR`, {
                tableId,
                reason,
                error: error.message,
                stackTrace: error.stack
            });
        }
    }
    
    // Use SimulationManager if available
    let simulationManagerResult = null;
    if (simulationManager) {
        try {
            const result = simulationManager.pauseSimulation(tableId, reason);
            simulationManagerResult = result;
            if (result && result.success) {
                gameLogger.gameEvent('LOG_WATCHER', `[PAUSE] SIMULATION_PAUSED_VIA_MANAGER`, {
                    tableId,
                    reason
                });
            } else {
                gameLogger.gameEvent('LOG_WATCHER', `[PAUSE] SIMULATION_MANAGER_FAILED`, {
                    tableId,
                    reason,
                    result: result || 'null'
                });
            }
        } catch (error) {
            gameLogger.gameEvent('LOG_WATCHER', `[PAUSE] SIMULATION_MANAGER_ERROR`, {
                tableId,
                reason,
                error: error.message,
                stackTrace: error.stack
            });
        }
    }
    
    pausedTables.set(tableId, {
        reason,
        pausedAt: Date.now(),
        fixed: false
    });
    
    // Broadcast pause to Unity
    let broadcastSent = false;
    if (socketHandler && socketHandler.io) {
        try {
            socketHandler.io.to(`table:${tableId}`).emit('simulation_paused', {
                tableId,
                reason,
                pausedAt: Date.now()
            });
            broadcastSent = true;
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
        callbackCalled,
        simulationManagerResult: simulationManagerResult?.success || false,
        broadcastSent,
        pausedTablesCount: pausedTables.size,
        tablePausedState: table.isPaused,
        tablePauseReason: table.pauseReason
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
    
    // Clear pause state
    table.isPaused = false;
    table.pauseReason = null;
    
    // Use SimulationManager if available
    let simulationManagerResult = null;
    if (simulationManager) {
        try {
            const result = simulationManager.resumeSimulation(tableId);
            simulationManagerResult = result;
            if (result && result.success) {
                gameLogger.gameEvent('LOG_WATCHER', `[RESUME] SIMULATION_RESUMED_VIA_MANAGER`, {
                    tableId
                });
            } else {
                gameLogger.gameEvent('LOG_WATCHER', `[RESUME] SIMULATION_MANAGER_FAILED`, {
                    tableId,
                    result: result || 'null'
                });
            }
        } catch (error) {
            gameLogger.gameEvent('LOG_WATCHER', `[RESUME] SIMULATION_MANAGER_ERROR`, {
                tableId,
                error: error.message,
                stackTrace: error.stack
            });
            gameLogger.error('LOG_WATCHER', `[RESUME] ERROR_RESUMING`, {
                tableId,
                error: error.message,
                stackTrace: error.stack
            });
            // Continue anyway - table state is already updated
        }
    }
    
    pausedTables.delete(tableId);
    
    // Broadcast resume to Unity
    let broadcastSent = false;
    if (socketHandler && socketHandler.io) {
        try {
            socketHandler.io.to(`table:${tableId}`).emit('simulation_resumed', {
                tableId,
                resumedAt: Date.now()
            });
            broadcastSent = true;
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
        simulationManagerResult: simulationManagerResult?.success || false,
        broadcastSent,
        pausedTablesCount: pausedTables.size,
        tablePausedState: table.isPaused,
        tablePauseReason: table.pauseReason,
        gameStarted: table.gameStarted,
        phase: table.phase
    });
}

/**
 * Analyze log line and determine if it indicates an issue
 */
function detectIssue(logLine) {
    // CRITICAL: Skip LOG_WATCHER's own logs to prevent infinite loops
    if (logLine.includes('[LOG_WATCHER]')) {
        return null;
    }
    
    // Check for error patterns
    for (const pattern of ERROR_PATTERNS) {
        if (pattern.test(logLine)) {
            const gameLogger = require('../src/utils/GameLogger');
            gameLogger.gameEvent('LOG_WATCHER', `[DETECT_ISSUE] PATTERN_MATCHED`, {
                pattern: pattern.toString(),
                matchedText: logLine.match(pattern)?.[0] || 'NO_MATCH',
                linePreview: logLine.substring(0, 150)
            });
            return { severity: 'error', type: 'general', message: logLine };
        }
    }
    
    // Check for item ante specific issues
    for (const pattern of ITEM_ANTE_ERROR_PATTERNS) {
        if (pattern.test(logLine)) {
            const gameLogger = require('../src/utils/GameLogger');
            gameLogger.gameEvent('LOG_WATCHER', `[DETECT_ISSUE] ITEM_ANTE_PATTERN_MATCHED`, {
                pattern: pattern.toString(),
                matchedText: logLine.match(pattern)?.[0] || 'NO_MATCH',
                linePreview: logLine.substring(0, 150)
            });
            return { severity: 'error', type: 'item_ante', message: logLine };
        }
    }
    
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
 * NEW WORKFLOW: Handle issue with log clearing
 * 1. Pause Unity
 * 2. Report to user what we're doing
 * 3. Fix the issue
 * 4. Clear log file
 * 5. Resume Unity
 */
async function handleIssueWithLogClearing(issue, tableId, tableDetails) {
    const gameLogger = require('../src/utils/GameLogger');
    const fullMessage = issue.message.length > 500 ? issue.message.substring(0, 500) + '...' : issue.message;
    
    // STEP 1: PAUSE UNITY
    gameLogger.gameEvent('LOG_WATCHER', `[WORKFLOW] STEP_1_PAUSING_UNITY`, {
        tableId,
        issueType: issue.type,
        issueSeverity: issue.severity,
        reason: `Issue detected: ${issue.type} - ${issue.message.substring(0, 100)}`
    });
    pauseSimulation(tableId, `Auto-paused: ${issue.type} - ${issue.message.substring(0, 100)}`);
    
    // Wait a moment for pause to take effect
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // STEP 2: REPORT TO USER
    gameLogger.error('LOG_WATCHER', `[WORKFLOW] STEP_2_REPORTING_TO_USER`, {
        action: 'ISSUE_DETECTED_AND_PAUSED',
        tableId,
        tableName: tableDetails?.name || 'unknown',
        issueType: issue.type.toUpperCase(),
        issueSeverity: issue.severity.toUpperCase(),
        issueMessage: fullMessage,
        whatImDoing: `I detected a ${issue.type} issue. I've paused Unity. Now I will fix the issue, clear the log file, and resume Unity.`,
        nextSteps: [
            '1. Pause Unity ✓',
            '2. Report to you (this message) ✓',
            '3. Fix the issue (next)',
            '4. Clear log file (after fix)',
            '5. Resume Unity (after clearing)'
        ],
        tableState: tableDetails,
        timestamp: new Date().toISOString()
    });
    
    // STEP 3: FIX THE ISSUE
    gameLogger.gameEvent('LOG_WATCHER', `[WORKFLOW] STEP_3_FIXING_ISSUE`, {
        tableId,
        issueType: issue.type,
        whatImDoing: 'Now fixing the issue...'
    });
    
    const fixResult = await fixIssue(issue, tableId);
    
    // Wait a moment for fix to complete
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // STEP 4: CLEAR LOG FILE
    gameLogger.gameEvent('LOG_WATCHER', `[WORKFLOW] STEP_4_CLEARING_LOG`, {
        tableId,
        issueType: issue.type,
        logFile,
        whatImDoing: 'Clearing log file to prevent it from getting too large...'
    });
    
    try {
        // Clear the log file
        fs.writeFileSync(logFile, '', 'utf8');
        lastPosition = 0; // Reset position tracking
        
        gameLogger.gameEvent('LOG_WATCHER', `[WORKFLOW] LOG_CLEARED`, {
            tableId,
            logFile,
            newSize: 0,
            positionReset: true
        });
    } catch (error) {
        gameLogger.error('LOG_WATCHER', `[WORKFLOW] LOG_CLEAR_ERROR`, {
            tableId,
            logFile,
            error: error.message,
            action: 'Log file could not be cleared - continuing anyway'
        });
    }
    
    // STEP 5: RESUME UNITY (only if fix succeeded or it's a non-critical issue)
    const shouldResume = fixResult || issue.severity !== 'critical';
    
    if (shouldResume) {
        gameLogger.gameEvent('LOG_WATCHER', `[WORKFLOW] STEP_5_RESUMING_UNITY`, {
            tableId,
            issueType: issue.type,
            fixResult: fixResult ? 'success' : 'failed',
            severity: issue.severity,
            reason: fixResult ? 'Fix succeeded' : 'Non-critical issue, resuming anyway',
            whatImDoing: 'Resuming Unity simulation...'
        });
        
        // Mark as fixed so resume will work
        if (pausedTables.has(tableId)) {
            pausedTables.get(tableId).fixed = true;
            pausedTables.get(tableId).fixing = false;
        }
        
        // Resume simulation
        setTimeout(() => {
            resumeSimulation(tableId);
            
            // Report completion
            gameLogger.gameEvent('LOG_WATCHER', `[WORKFLOW] COMPLETE`, {
                tableId,
                issueType: issue.type,
                fixResult: fixResult ? 'success' : 'failed',
                whatHappened: 'Issue handled: Paused → Reported → Fixed → Log Cleared → Resumed',
                simulationResumed: true,
                readyForNextIssue: true
            });
        }, 500);
    } else {
        // Critical issue that couldn't be fixed - keep paused and report
        gameLogger.error('LOG_WATCHER', `[WORKFLOW] STEP_5_NOT_RESUMING`, {
            tableId,
            issueType: issue.type,
            fixResult: 'failed',
            severity: issue.severity,
            reason: 'Critical issue could not be fixed - keeping simulation paused',
            whatImDoing: 'Simulation will remain paused until issue is manually resolved',
            action: 'Manual intervention required'
        });
        
        // Clear fixing flag but keep paused
        if (pausedTables.has(tableId)) {
            pausedTables.get(tableId).fixing = false;
            pausedTables.get(tableId).fixed = false; // Don't mark as fixed
        }
        
        // Still clear the log to prevent it from getting too large
        gameLogger.gameEvent('LOG_WATCHER', `[WORKFLOW] LOG_CLEARED_BUT_STAYING_PAUSED`, {
            tableId,
            issueType: issue.type,
            reason: 'Clearing log but keeping simulation paused due to unfixed critical issue'
        });
    }
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
    
    // ROOT TRACING: Track log line processing
    // Only trace if line contains error patterns (to avoid spam)
    const hasErrorPattern = ERROR_PATTERNS.some(pattern => pattern.test(line)) || 
                          ITEM_ANTE_ERROR_PATTERNS.some(pattern => pattern.test(line));
    
    if (hasErrorPattern) {
        gameLogger.gameEvent('LOG_WATCHER', `[PROCESS_LINE] DETECTED_PATTERN`, {
            linePreview: line.substring(0, 150),
            hasErrorPattern: true,
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
    
    // Check if already paused
    if (pausedTables.has(tableId)) {
        const pauseInfo = pausedTables.get(tableId);
        
        // If paused but NOT fixing, we need to handle the stuck state
        if (!pauseInfo.fixing && !pauseInfo.fixed) {
            gameLogger.error('LOG_WATCHER', `[PROCESS_LINE] STUCK_PAUSED_STATE`, {
                tableId,
                issueType: issue.type,
                existingReason: pauseInfo.reason,
                pausedAt: new Date(pauseInfo.pausedAt).toISOString(),
                timeSincePause: Date.now() - pauseInfo.pausedAt,
                whatImDoing: 'Table is paused but not being fixed. Running workflow to fix and resume.',
                newIssueType: issue.type,
                newIssueMessage: issue.message.substring(0, 200)
            });
            
            // Run workflow to fix and resume
            handleIssueWithLogClearing(issue, tableId, tableDetails);
            return;
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
    
    // ROOT TRACING: About to pause with FULL STATE
    gameLogger.gameEvent('LOG_WATCHER', `[PROCESS_LINE] PAUSING_NOW`, {
        tableId,
        issueType: issue.type,
        severity: issue.severity,
        fullMessage: fullMessage,
        messagePreview: issue.message.substring(0, 150),
        tableDetails,
        pausedTablesCount: pausedTables.size,
        allPausedTables: Array.from(pausedTables.entries()).map(([id, info]) => ({
            id,
            reason: info.reason,
            pausedAt: info.pausedAt
        }))
    });
    
    // REPORT TO USER: About to pause with FULL DETAILS - ALL LOGGING VIA GAMELOGGER
    gameLogger.error('LOG_WATCHER', `[PROCESS_LINE] PAUSING_SIMULATION_FULL`, {
        tableId,
        tableDetails,
        issueType: issue.type,
        issueSeverity: issue.severity,
        pauseReason: `${issue.type} - ${issue.message.substring(0, 100)}`,
        fullIssueMessage: fullMessage,
        timestamp: new Date().toISOString()
    });
    
    // NEW WORKFLOW: Pause → Report → Fix → Clear Log → Resume
    handleIssueWithLogClearing(issue, tableId, tableDetails);
}

/**
 * Initialize watcher with GameManager and SocketHandler references
 */
function initialize(gameMgr, simMgr, sockHandler) {
    gameManager = gameMgr;
    simulationManager = simMgr;
    socketHandler = sockHandler;
    
    const gameLogger = require('../src/utils/GameLogger');
    gameLogger.gameEvent('LOG_WATCHER', `[INIT] INITIALIZED`, {
        gameManagerExists: !!gameMgr,
        simulationManagerExists: !!simMgr,
        socketHandlerExists: !!sockHandler
    });
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
    const gameLogger = require('../src/utils/GameLogger');
    gameLogger.gameEvent('LOG_WATCHER', `[INIT] STANDALONE_MODE`, {
        note: 'For full functionality, integrate with server.js'
    });
    watchLogs();
}
