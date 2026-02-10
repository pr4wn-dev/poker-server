#!/usr/bin/env node
/**
 * Lightweight HTTP Integration Server
 * 
 * LEARNING SYSTEM FIX: HTTP server that reuses single process
 * Much simpler than stdin/stdout for PowerShell communication
 */

const http = require('http');
const path = require('path');
const BrokenPromiseIntegration = require('./BrokenPromiseIntegration');
const gameLogger = require('../../src/utils/GameLogger');

const projectRoot = path.resolve(__dirname, '../..');
const PORT = 3001; // Different from main server

let integration = null;
let isInitializing = false;

async function ensureInitialized() {
    if (integration) return integration;
    if (isInitializing) {
        // Wait for initialization
        while (isInitializing) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        return integration;
    }
    
    isInitializing = true;
    try {
        integration = new BrokenPromiseIntegration(projectRoot, { startSyncLoop: false });
        // Give it a moment
        await new Promise(resolve => setTimeout(resolve, 1000));
        isInitializing = false;
        return integration;
    } catch (error) {
        isInitializing = false;
        throw error;
    }
}

// LEARNING SYSTEM FIX: Don't initialize in background - causes memory overflow
// Initialize lazily only when a command that needs it is called
// This prevents memory heap overflow during server startup

const server = http.createServer(async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Content-Type', 'application/json');
    
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }
    
    try {
        // Use WHATWG URL API instead of deprecated url.parse()
        const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
        const parsedUrl = {
            pathname: urlObj.pathname,
            query: Object.fromEntries(urlObj.searchParams),
            path: urlObj.pathname + urlObj.search
        };
        const command = parsedUrl.pathname.substring(1); // Remove leading /
        
        // Ping command doesn't need initialization
        if (command === 'ping') {
            res.writeHead(200);
            res.end(JSON.stringify({ 
                success: true, 
                message: 'Server is alive', 
                initialized: integration !== null,
                timestamp: Date.now() 
            }));
            return;
        }
        
        let args = [];
        if (parsedUrl.query.args) {
            try {
                // Try Base64 decode first (PowerShell encoding)
                const decoded = Buffer.from(parsedUrl.query.args, 'base64').toString('utf8');
                args = JSON.parse(decoded);
            } catch {
                // Fall back to URL decode
                try {
                    args = JSON.parse(decodeURIComponent(parsedUrl.query.args));
                } catch {
                    args = [];
                }
            }
        }
        
        // LEARNING SYSTEM FIX: Initialize with timeout to prevent hanging
        // If initialization fails or times out, return error instead of hanging
        let initResult;
        try {
            const initPromise = ensureInitialized();
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Initialization timeout after 10 seconds')), 10000)
            );
            initResult = await Promise.race([initPromise, timeoutPromise]);
        } catch (error) {
            gameLogger.error('MONITORING', '[INTEGRATION_HTTP] Initialization failed or timed out', {
                error: error.message,
                command: command
            });
            res.writeHead(503); // Service Unavailable
            res.end(JSON.stringify({ 
                error: 'AI Core initialization failed or timed out',
                message: error.message,
                suggestion: 'The system may be experiencing memory issues. Try again in a moment.'
            }));
            return;
        }
        
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
                const logLine = args[0] || '';
                result = integration.detectIssue(logLine);
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
                const queryText = args[0] || '';
                result = await integration.query(queryText);
                break;
            case 'before-ai-action':
                const actionData = args[0] || {};
                result = await integration.beforeAIAction(actionData);
                break;
            case 'after-ai-action':
                const actionData2 = args[0] || {};
                const resultData = args[1] || {};
                result = await integration.afterAIAction(actionData2, resultData);
                break;
            case 'monitor-terminal-command':
                // DATABASE APPROACH: Read from temp file (like Add-PendingIssue) to avoid encoding issues
                const fs = require('fs');
                let command, output, exitCode;
                
                if (parsedUrl.query.file) {
                    // Format 1: Temp file path (NEW - preferred)
                    try {
                        const filePath = Buffer.from(parsedUrl.query.file, 'base64').toString('utf8');
                        if (fs.existsSync(filePath)) {
                            const fileContent = fs.readFileSync(filePath, 'utf8');
                            const commandData = JSON.parse(fileContent);
                            command = commandData.command || '';
                            output = commandData.output || '';
                            exitCode = commandData.exitCode !== undefined ? commandData.exitCode : 0;
                            
                            // Store in database for querying/history
                            await integration.storeTerminalCommand(command, output, exitCode);
                        } else {
                            result = { success: false, reason: 'Temp file not found' };
                            break;
                        }
                    } catch (error) {
                        result = { success: false, reason: `Failed to read temp file: ${error.message}` };
                        break;
                    }
                } else if (args.length >= 3) {
                    // Format 2: args is JSON array [command, output, exitCode] (backward compatibility)
                    command = args[0] || '';
                    output = args[1] || '';
                    exitCode = args[2] !== undefined ? args[2] : 0;
                } else {
                    // Format 3: Separate query parameters (legacy)
                    command = args[0] || parsedUrl.query.command || '';
                    if (parsedUrl.query.output) {
                        try {
                            output = Buffer.from(parsedUrl.query.output, 'base64').toString('utf8');
                        } catch {
                            output = decodeURIComponent(parsedUrl.query.output);
                        }
                    } else {
                        output = args[1] || '';
                    }
                    exitCode = parsedUrl.query.exitCode !== undefined ? parseInt(parsedUrl.query.exitCode) : (args[2] !== undefined ? args[2] : 0);
                }
                result = await integration.monitorTerminalCommand(command, output, exitCode);
                break;
            case 'ping':
                result = { success: true, message: 'Server is alive', timestamp: Date.now() };
                break;
            case 'shutdown':
                result = { success: true, message: 'Shutting down' };
                // Schedule shutdown after response
                setTimeout(() => {
                    if (integration && integration.aiCore) {
                        try {
                            integration.aiCore.destroy();
                        } catch (e) {}
                    }
                    server.close(() => process.exit(0));
                }, 100);
                break;
            default:
                result = { error: `Unknown command: ${command}` };
        }
        
        res.writeHead(200);
        res.end(JSON.stringify(result || { success: true }));
        
    } catch (error) {
        gameLogger.error('MONITORING', '[INTEGRATION_HTTP] Request error', {
            url: req.url,
            error: error.message
        });
        res.writeHead(500);
        res.end(JSON.stringify({ 
            error: error.message,
            stack: error.stack
        }));
    }
});

// Start server immediately (before initialization completes)
server.listen(PORT, '127.0.0.1', () => {
    gameLogger.info('MONITORING', '[INTEGRATION_HTTP] Server started (initializing in background)', {
        port: PORT,
        pid: process.pid
    });
    console.log(JSON.stringify({ 
        type: 'ready', 
        port: PORT,
        pid: process.pid,
        timestamp: Date.now(),
        note: 'Initialization happening in background'
    }));
});

// Handle shutdown - ensure all systems are cleaned up
async function gracefulShutdown() {
    try {
        // Stop integration (stops sync loop and destroys AI core)
        if (integration) {
            integration.destroy();
        }
        
        // Close server
        server.close(() => {
            process.exit(0);
        });
        
        // Give server time to close (max 2 seconds)
        setTimeout(() => {
            process.exit(0);
        }, 2000);
    } catch (error) {
        gameLogger.error('MONITORING', '[INTEGRATION_HTTP] Shutdown error', {
            error: error.message
        });
        process.exit(1);
    }
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
