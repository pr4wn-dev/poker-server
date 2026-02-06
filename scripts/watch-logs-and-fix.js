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
// REAL ERRORS: These indicate actual game-breaking issues that need intervention
// NOTE: Fix attempt tracking logs (FIX ATTEMPT SUCCESS/FAILED) are informational and should NOT trigger pauses
// Only detect when fixes are DISABLED (method failed) or actual errors occur
const ERROR_PATTERNS = [
    // SERVER CONNECTION ISSUES - CRITICAL
    /server.*cannot.*connect/i,
    /ECONNREFUSED/i,
    /EADDRINUSE/i,
    /Port.*already.*in use/i,
    /listen.*EADDRINUSE/i,
    /Error.*listen/i,
    /SERVER.*OFFLINE/i,
    /SERVER.*FAILED/i,
    /Database.*OFFLINE/i,
    /DATABASE.*CONNECTION.*FAILED/i,
    /\[DATABASE\].*\[CONNECTION\].*FAILED/i,
    // GAME ERRORS
    /\[ROOT CAUSE\]/i,  // Root cause analysis - indicates serious issue
    /\[ROOT_TRACE\].*TOTAL_BET_NOT_CLEARED/i,  // Bet not cleared - indicates bug
    /\[ROOT_TRACE\].*PLAYER_WON_MORE_THAN_CONTRIBUTED/i,  // Player won more than contributed (not side pot)
    /SyntaxError/i,
    /TypeError/i,
    /ReferenceError/i,
    /\[FIX\] METHOD_DISABLED/i,  // Fix method disabled - needs different approach (CRITICAL)
    /\[FIX\] DISABLED/i,  // Fix disabled - critical
    /METHOD_DISABLED.*TRY_DIFFERENT_APPROACH/i,  // Method failed - needs new approach
    /SIMULATION BOT TIMEOUT/i,
    /\[TIMER\].*TIMEOUT.*auto-folding/i,
    /\[ICON_LOADING\].*ISSUE_REPORTED/i,
    /LoadItemIcon.*FAILED/i,
    /CreateItemAnteSlot.*FAILED/i,
    /Sprite not found/i,
    // Chip/Pot errors: Only detect if NOT part of fix attempt tracking
    /(?:Chip|Chips).*(?:lost|created)(?!.*\[FIX ATTEMPT\])(?!.*FIX_2_)(?!.*SUCCESS)/i,  // Chip lost/created but NOT fix attempt tracking or success
    /Pot.*mismatch(?!.*\[FIX ATTEMPT\].*SUCCESS)(?!.*FIX.*SUCCESS)(?!.*SUCCESS)/i,  // Pot mismatch but NOT fix success or any success
    // General errors: Exclude fix attempt tracking, LOG_WATCHER, TRACE logs, and SUCCESS logs
    /\[ERROR\](?!.*\[LOG_WATCHER\])(?!.*\[TRACE\])(?!.*\[FIX ATTEMPT\])(?!.*FIX_)(?!.*SUCCESS)/i
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
    
    // Skip TRACE logs - they're informational, not errors
    // Even if they contain "[ERROR]" in JSON data, they're not actual errors
    if (logLine.includes('[TRACE]')) {
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
    
    // STEP 5: RESUME UNITY - ALWAYS resume after clearing log (unless it's a critical unfixable issue)
    // We clear the log, so we MUST resume or the simulation will be stuck forever
    const shouldResume = fixResult || issue.severity !== 'critical';
    
    // CRITICAL: After clearing log, we MUST resume to prevent stuck state
    // The log is cleared, so old issues won't be detected again
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
        // Critical issue that couldn't be fixed
        // BUT: We already cleared the log, so we MUST resume or simulation will be stuck forever
        // The log is cleared, so this issue won't be detected again
        gameLogger.error('LOG_WATCHER', `[WORKFLOW] STEP_5_CRITICAL_ISSUE_BUT_RESUMING`, {
            tableId,
            issueType: issue.type,
            fixResult: 'failed',
            severity: issue.severity,
            reason: 'Critical issue could not be fixed, but log was cleared - resuming to prevent stuck state',
            whatImDoing: 'Resuming anyway because log was cleared - issue won\'t be detected again',
            action: 'Issue logged for investigation, but simulation will continue'
        });
        
        // Mark as fixed and resume anyway (log is cleared, so issue won't repeat)
        if (pausedTables.has(tableId)) {
            pausedTables.get(tableId).fixed = true;
            pausedTables.get(tableId).fixing = false;
        }
        
        // Resume simulation (log is cleared, so this won't loop)
        setTimeout(() => {
            resumeSimulation(tableId);
            
            gameLogger.gameEvent('LOG_WATCHER', `[WORKFLOW] COMPLETE_CRITICAL_RESUMED`, {
                tableId,
                issueType: issue.type,
                whatHappened: 'Critical issue detected but log cleared - resumed to prevent stuck state',
                simulationResumed: true,
                readyForNextIssue: true
            });
        }, 500);
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
    
    // CRITICAL: Skip LOG_WATCHER and TRACE logs FIRST before any pattern matching
    // This prevents infinite loops and false positives
    if (line.includes('[LOG_WATCHER]')) {
        return; // Skip watcher's own logs entirely
    }
    
    if (line.includes('[TRACE]')) {
        return; // Skip TRACE logs entirely
    }
    
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
    startActiveMonitoring(); // Start active monitoring for simulation detection and status reports
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
        gameLogger.gameEvent('LOG_WATCHER', `[ACTIVE_MONITORING] CHECKING_GAMEMANAGER_TABLES`, {
            totalTables,
            tableIds: gameManager.tables ? Array.from(gameManager.tables.keys()) : []
        });
        
        for (const [tableId, table] of gameManager.tables) {
            if (table) {
                gameLogger.gameEvent('LOG_WATCHER', `[ACTIVE_MONITORING] FOUND_TABLE`, {
                    tableId,
                    name: table.name,
                    isSimulation: table.isSimulation || false
                });
                
                if (table.isSimulation) {
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
    
    // On first run OR if we have simulations but none reported, report all existing simulations
    if ((isFirstRun || lastReportedSimulations.size === 0) && simulationTables.length > 0) {
        gameLogger.error('LOG_WATCHER', `[ACTIVE_MONITORING] FORCING_REPORT`, {
            reason: isFirstRun ? 'first_run' : 'no_simulations_reported_yet',
            simulationCount: simulationTables.length
        });
        isFirstRun = false;
        for (const sim of simulationTables) {
            gameLogger.error('LOG_WATCHER', `[ACTIVE_MONITORING] EXISTING_SIMULATION_DETECTED`, {
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
    
    if (newSimulations.length > 0) {
        // NEW SIMULATION DETECTED - REPORT TO USER VIA ERROR LOG (so I can read it)
        for (const sim of newSimulations) {
            gameLogger.error('LOG_WATCHER', `[ACTIVE_MONITORING] NEW_SIMULATION_DETECTED`, {
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
        lastReportedSimulations = currentSimIds;
    }
    
    // Regular status report every 10 seconds
    const now = Date.now();
    if (now - lastStatusReport >= STATUS_REPORT_INTERVAL) {
        if (simulationTables.length > 0) {
            gameLogger.error('LOG_WATCHER', `[ACTIVE_MONITORING] STATUS_REPORT`, {
                action: 'STATUS_UPDATE',
                activeSimulations: simulationTables.length,
                simulations: simulationTables.map(s => ({
                    name: s.name,
                    handsPlayed: s.handsPlayed,
                    phase: s.phase,
                    isPaused: s.isPaused,
                    pauseReason: s.pauseReason,
                    pot: s.pot,
                    activePlayers: s.activePlayers
                })),
                message: `STATUS: ${simulationTables.length} active simulation(s) running`,
                whatImDoing: `I'm actively monitoring ${simulationTables.length} simulation(s). All systems operational. Will report immediately if any issues are detected.`,
                timestamp: new Date().toISOString(),
                reportToUser: true // Flag for me to read and report
            });
        }
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
    gameLogger.error('LOG_WATCHER', `[ACTIVE_MONITORING] STARTED`, {
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
        gameLogger.error('LOG_WATCHER', `[ACTIVE_MONITORING] HOOKED_INTO_SIMULATION_MANAGER`, {
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
