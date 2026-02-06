/**
 * Poker Server - Main Entry Point
 * Real-time multiplayer poker server using Socket.IO
 * 
 * PLUG AND PLAY: Just drop on WAMP/XAMPP server, run npm install, npm start
 * Database tables are created automatically on first run.
 */

require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const db = require('./database/Database');
const GameManager = require('./game/GameManager');
const SocketHandler = require('./sockets/SocketHandler');
const path = require('path');
const logWatcher = require(path.join(__dirname, '..', 'scripts', 'watch-logs-and-fix'));

// Configuration
const PORT = process.env.PORT || 3000;
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS === '*' 
    ? true  // Allow all origins
    : (process.env.ALLOWED_ORIGINS?.split(',') || ['*']);

// Express setup
const app = express();
app.use(cors({ origin: ALLOWED_ORIGINS, credentials: true }));
app.use(express.json());

// HTTP server
const server = http.createServer(app);

// Socket.IO setup with CORS for Unity client
const io = new Server(server, {
    cors: {
        origin: ALLOWED_ORIGINS,
        methods: ['GET', 'POST'],
        credentials: true
    },
    pingInterval: parseInt(process.env.WS_PING_INTERVAL) || 25000,
    pingTimeout: parseInt(process.env.WS_PING_TIMEOUT) || 5000
});

// Initialize game manager
const gameManager = new GameManager();

    // Initialize socket handler (will be set up after DB connects)
    let socketHandler = null;
    
    // Auto-resume any paused simulations on server start
    // This ensures simulations don't stay paused after server restart
    function autoResumePausedSimulations() {
        if (socketHandler && socketHandler.simulationManager) {
            for (const [tableId, sim] of socketHandler.simulationManager.activeSimulations) {
                if (sim.isPaused) {
                    gameLogger.gameEvent('SERVER', '[STARTUP] AUTO_RESUME_SIMULATION', { tableId });
                    socketHandler.simulationManager.resumeSimulation(tableId);
                }
            }
        }
    }

// REST API endpoints
app.get('/', (req, res) => {
    res.json({
        name: 'Poker Game Server',
        version: '1.0.0',
        status: db.isConnected ? 'online' : 'database_offline',
        endpoints: {
            health: '/health',
            tables: '/api/tables'
        }
    });
});

app.get('/health', (req, res) => {
    res.json({ 
        status: db.isConnected ? 'ok' : 'database_offline',
        database: db.isConnected,
        timestamp: Date.now(),
        activeTables: gameManager.getActiveTableCount(),
        onlinePlayers: gameManager.getOnlinePlayerCount()
    });
});

app.get('/api/tables', (req, res) => {
    res.json(gameManager.getPublicTableList());
});

// API endpoint to manually save state snapshots for a table
app.post('/api/tables/:tableId/save-snapshot', (req, res) => {
    const tableId = req.params.tableId;
    const table = gameManager.getTable(tableId);
    
    if (!table) {
        return res.status(404).json({ success: false, error: 'Table not found' });
    }
    
    if (!table.stateSnapshot) {
        return res.status(400).json({ 
            success: false, 
            error: 'State snapshots not enabled for this table',
            isSimulation: table.isSimulation,
            hasEnvVar: process.env.ENABLE_STATE_SNAPSHOTS === 'true'
        });
    }
    
    const saved = table.saveStateSnapshots();
    if (saved) {
        res.json({ 
            success: true, 
            message: 'State snapshot saved',
            tableId: table.id,
            tableName: table.name,
            snapshotCount: table.stateSnapshot?.snapshots?.length || 0
        });
    }
});

// API endpoint to resume paused simulations
app.post('/api/simulations/:tableId/resume', (req, res) => {
    if (!socketHandler) {
        return res.status(503).json({ success: false, error: 'Socket handler not initialized' });
    }
    
    const tableId = req.params.tableId;
    const result = socketHandler.simulationManager.resumeSimulation(tableId);
    
    if (result.success) {
        res.json({ success: true, message: 'Simulation resumed', tableId });
    } else {
        res.status(400).json(result);
    }
});

// API endpoint to resume ALL paused simulations
app.post('/api/simulations/resume-all', (req, res) => {
    if (!socketHandler) {
        return res.status(503).json({ success: false, error: 'Socket handler not initialized' });
    }
    
    const resumed = [];
    const failed = [];
    
    for (const [tableId, sim] of socketHandler.simulationManager.activeSimulations) {
        if (sim.isPaused) {
            const result = socketHandler.simulationManager.resumeSimulation(tableId);
            if (result.success) {
                resumed.push(tableId);
            } else {
                failed.push({ tableId, error: result.error });
            }
        }
    }
    
    res.json({ 
        success: true, 
        resumed: resumed.length,
        failed: failed.length,
        resumedTables: resumed,
        failedTables: failed
    });
});

// Server info endpoint - returns local IP and public IP for remote connections
app.get('/api/server-info', async (req, res) => {
    const localIP = getLocalIP();
    let publicIP = null;
    
    // Try to get public IP from external service
    try {
        const https = require('https');
        publicIP = await new Promise((resolve, reject) => {
            https.get('https://api.ipify.org', { timeout: 3000 }, (response) => {
                let data = '';
                response.on('data', chunk => data += chunk);
                response.on('end', () => resolve(data.trim()));
            }).on('error', () => resolve(null));
        });
    } catch (err) {
        gameLogger.error('SERVER', '[STARTUP] PUBLIC_IP_FETCH_FAILED', { error: err.message });
    }
    
    res.json({
        localIP: localIP,
        publicIP: publicIP,
        port: PORT,
        name: 'Poker Game Server'
    });
});

/**
 * Start the server
 */
async function start() {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║              POKER SERVER - STARTING UP                      ║
╚══════════════════════════════════════════════════════════════╝
    `);

    // Initialize database (creates tables if they don't exist)
    console.log('[Server] Connecting to database...');
    const dbConnected = await db.initialize();
    
    if (!dbConnected) {
        const gameLogger = require('./utils/GameLogger');
        gameLogger.error('SERVER', '[DATABASE] CONNECTION_FAILED', { error: 'Database connection failed - server will start but authentication will not work' });
        gameLogger.error('SERVER', '[DATABASE] CONNECTION_FAILED_DETAILS', { message: 'Make sure MySQL is running (WAMP/XAMPP) and check .env settings' });
        console.log('');
    } else {
        console.log('[Server] Database connected and tables ready');
    }

    // Initialize socket handler with database access
    socketHandler = new SocketHandler(io, gameManager);
    socketHandler.initialize();
    
    // Initialize log watcher for automatic issue detection and fixing
    logWatcher.initialize(gameManager, socketHandler.simulationManager, socketHandler);
    
    // Auto-resume any paused simulations on server start
    // This ensures simulations don't stay paused after server restart
    setTimeout(() => {
        if (socketHandler && socketHandler.simulationManager) {
            for (const [tableId, sim] of socketHandler.simulationManager.activeSimulations) {
                if (sim.isPaused) {
                    gameLogger.gameEvent('SERVER', '[STARTUP] AUTO_RESUME_SIMULATION', { tableId });
                    socketHandler.simulationManager.resumeSimulation(tableId);
                }
            }
        }
    }, 2000); // Wait 2 seconds for everything to initialize

    // Start listening with error handling
    server.listen(PORT, '0.0.0.0', () => {
        const gameLogger = require('./utils/GameLogger');
        const localIP = getLocalIP();
        gameLogger.gameEvent('SERVER', '[STARTUP] SERVER_RUNNING', {
            port: PORT,
            localUrl: `http://localhost:${PORT}`,
            networkUrl: `http://${localIP}:${PORT}`,
            localIP: localIP,
            databaseConnected: dbConnected,
            message: 'SERVER STARTED SUCCESSFULLY'
        });
    });
}

/**
 * Get local IP address for display
 */
function getLocalIP() {
    const { networkInterfaces } = require('os');
    const nets = networkInterfaces();
    
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                return net.address;
            }
        }
    }
    return 'localhost';
}

// Graceful shutdown
process.on('SIGTERM', async () => {
    gameLogger.gameEvent('SERVER', '[SHUTDOWN] SIGTERM_RECEIVED', { message: 'Shutting down gracefully...' });
    await db.close();
    server.close(() => {
        gameLogger.gameEvent('SERVER', '[SHUTDOWN] SERVER_CLOSED', {});
        process.exit(0);
    });
});

process.on('SIGINT', async () => {
    gameLogger.gameEvent('SERVER', '[SHUTDOWN] SHUTTING_DOWN', {});
    await db.close();
    server.close(() => {
        gameLogger.gameEvent('SERVER', '[SHUTDOWN] SERVER_CLOSED', {});
        process.exit(0);
    });
});

// Handle uncaught errors
const gameLogger = require('./utils/GameLogger');

process.on('uncaughtException', (err) => {
    const errorMsg = `[Server] Uncaught Exception: ${err.message}\n${err.stack}`;
    gameLogger.error('SERVER', '[SHUTDOWN] UNCAUGHT_EXCEPTION', { error: errorMsg });
    gameLogger.error('SERVER', 'Uncaught Exception', { 
        message: err.message, 
        stack: err.stack,
        name: err.name
    });
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    const errorMsg = `[Server] Unhandled Rejection: ${reason}`;
    gameLogger.error('SERVER', '[SHUTDOWN] UNCAUGHT_EXCEPTION', { error: errorMsg });
    gameLogger.error('SERVER', 'Unhandled Rejection', { 
        reason: reason?.toString() || String(reason),
        stack: reason?.stack || 'No stack trace',
        name: reason?.name || 'Unknown'
    });
    process.exit(1);
});

// Start the server
start();
