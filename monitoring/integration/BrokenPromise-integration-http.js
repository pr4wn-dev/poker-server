#!/usr/bin/env node
/**
 * Lightweight HTTP Integration Server
 * 
 * LEARNING SYSTEM FIX: HTTP server that reuses single process
 * Much simpler than stdin/stdout for PowerShell communication
 */

const http = require('http');
const url = require('url');
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
        const parsedUrl = url.parse(req.url, true);
        const command = parsedUrl.pathname.substring(1); // Remove leading /
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

server.listen(PORT, '127.0.0.1', () => {
    gameLogger.info('MONITORING', '[INTEGRATION_HTTP] Server started', {
        port: PORT,
        pid: process.pid
    });
    console.log(JSON.stringify({ 
        type: 'ready', 
        port: PORT,
        pid: process.pid,
        timestamp: Date.now() 
    }));
});

// Handle shutdown
process.on('SIGINT', () => {
    if (integration && integration.aiCore) {
        try {
            integration.aiCore.destroy();
        } catch (e) {}
    }
    server.close(() => process.exit(0));
});

process.on('SIGTERM', () => {
    if (integration && integration.aiCore) {
        try {
            integration.aiCore.destroy();
        } catch (e) {}
    }
    server.close(() => process.exit(0));
});
