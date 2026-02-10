#!/usr/bin/env node
/**
 * Persistent Integration Server
 * 
 * LEARNING SYSTEM FIX: Reuse single process for all commands instead of spawning new processes
 * This prevents memory heap overflow by maintaining one process that handles all requests
 * 
 * Communication: stdin/stdout JSON-RPC style protocol
 */

const path = require('path');
const BrokenPromiseIntegration = require('./BrokenPromiseIntegration');
const gameLogger = require('../../src/utils/GameLogger');

// Get project root (parent of monitoring directory)
const projectRoot = path.resolve(__dirname, '../..');

// Initialize integration (persistent mode - keep running)
let integration = null;
let isInitializing = false;
let initPromise = null;

// Initialize integration (lazy, only when first command arrives)
async function ensureInitialized() {
    if (integration) return integration;
    if (isInitializing) return initPromise;
    
    isInitializing = true;
    initPromise = (async () => {
        try {
            integration = new BrokenPromiseIntegration(projectRoot, { startSyncLoop: false });
            // Give it a moment to initialize
            await new Promise(resolve => setTimeout(resolve, 1000));
            isInitializing = false;
            return integration;
        } catch (error) {
            isInitializing = false;
            throw error;
        }
    })();
    
    return initPromise;
}

// Handle command from stdin
async function handleCommand(command, args) {
    try {
        // Ensure integration is initialized
        await ensureInitialized();
        
        let result;
        
        switch (command) {
            case 'should-start-investigation':
                result = integration.shouldStartInvestigation();
                break;
                
            case 'should-pause-unity':
                result = integration.shouldPauseUnity();
                break;
                
            case 'should-resume-unity':
                result = integration.shouldResumeUnity();
                break;
                
            case 'should-start-server':
                result = integration.shouldStartServer();
                break;
                
            case 'should-start-unity':
                result = integration.shouldStartUnity();
                break;
                
            case 'should-start-simulation':
                result = integration.shouldStartSimulation();
                break;
                
            case 'get-investigation-status':
                result = integration.getInvestigationStatus();
                break;
                
            case 'start-investigation':
                result = integration.startInvestigation();
                break;
                
            case 'complete-investigation':
                result = integration.completeInvestigation();
                break;
                
            case 'detect-issue':
                const logLine = args.join(' ');
                if (!logLine) {
                    return { error: 'logLine required' };
                }
                result = integration.detectIssue(logLine);
                break;
                
            case 'add-issue':
                const issueDataJson = args.join(' ');
                if (!issueDataJson) {
                    return { error: 'issueData JSON required' };
                }
                try {
                    const issueData = JSON.parse(issueDataJson);
                    result = integration.addIssue(issueData);
                } catch (error) {
                    return { error: 'Invalid JSON', details: error.message };
                }
                break;
                
            case 'get-status-report':
                result = integration.getStatusReport();
                break;
                
            case 'get-live-statistics':
                result = integration.getLiveStatistics();
                break;
                
            case 'get-latest-prompt':
                result = integration.getLatestPrompt();
                break;
                
            case 'query':
                const queryText = args.join(' ');
                if (!queryText) {
                    return { error: 'query text required' };
                }
                result = await integration.query(queryText);
                break;
                
            case 'ping':
                return { success: true, message: 'Server is alive', timestamp: Date.now() };
                
            case 'shutdown':
                if (integration && integration.aiCore) {
                    try {
                        integration.aiCore.destroy();
                    } catch (e) {
                        // Ignore cleanup errors
                    }
                }
                process.exit(0);
                break;
                
            default:
                return { error: `Unknown command: ${command}` };
        }
        
        return result || { success: true };
        
    } catch (error) {
        gameLogger.error('MONITORING', '[INTEGRATION_SERVER] Command error', {
            command: command,
            error: error.message,
            stack: error.stack
        });
        return { 
            error: error.message,
            stack: error.stack
        };
    }
}

// Read commands from stdin (JSON-RPC style)
let inputBuffer = '';
process.stdin.setEncoding('utf8');

process.stdin.on('data', async (chunk) => {
    inputBuffer += chunk;
    
    // Process complete lines (JSON objects)
    const lines = inputBuffer.split('\n');
    inputBuffer = lines.pop() || ''; // Keep incomplete line in buffer
    
    for (const line of lines) {
        if (!line.trim()) continue;
        
        try {
            const request = JSON.parse(line);
            const { command, args = [], id } = request;
            
            const result = await handleCommand(command, args);
            
            // Send response
            const response = {
                id: id,
                result: result,
                timestamp: Date.now()
            };
            
            console.log(JSON.stringify(response));
            
        } catch (error) {
            // Send error response
            const errorResponse = {
                id: request?.id || null,
                error: {
                    message: error.message,
                    code: 'PARSE_ERROR'
                },
                timestamp: Date.now()
            };
            console.log(JSON.stringify(errorResponse));
        }
    }
});

process.stdin.on('end', () => {
    // Cleanup on stdin end
    if (integration && integration.aiCore) {
        try {
            integration.aiCore.destroy();
        } catch (e) {
            // Ignore cleanup errors
        }
    }
    process.exit(0);
});

// Handle process termination
process.on('SIGINT', () => {
    if (integration && integration.aiCore) {
        try {
            integration.aiCore.destroy();
        } catch (e) {
            // Ignore cleanup errors
        }
    }
    process.exit(0);
});

process.on('SIGTERM', () => {
    if (integration && integration.aiCore) {
        try {
            integration.aiCore.destroy();
        } catch (e) {
            // Ignore cleanup errors
        }
    }
    process.exit(0);
});

// Log startup
gameLogger.info('MONITORING', '[INTEGRATION_SERVER] Persistent server started', {
    pid: process.pid,
    projectRoot: projectRoot
});

// Send ready signal
console.log(JSON.stringify({ 
    type: 'ready', 
    pid: process.pid,
    timestamp: Date.now() 
}));
