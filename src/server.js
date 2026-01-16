/**
 * Poker Server - Main Entry Point
 * Real-time multiplayer poker server using Socket.IO
 */

require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const GameManager = require('./game/GameManager');
const SocketHandler = require('./sockets/SocketHandler');

// Configuration
const PORT = process.env.PORT || 3000;
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS?.split(',') || ['*'];

// Express setup
const app = express();
app.use(cors({ origin: ALLOWED_ORIGINS }));
app.use(express.json());

// HTTP server
const server = http.createServer(app);

// Socket.IO setup with CORS for Unity client
const io = new Server(server, {
    cors: {
        origin: ALLOWED_ORIGINS,
        methods: ['GET', 'POST']
    },
    pingInterval: parseInt(process.env.WS_PING_INTERVAL) || 25000,
    pingTimeout: parseInt(process.env.WS_PING_TIMEOUT) || 5000
});

// Initialize game manager
const gameManager = new GameManager();

// Initialize socket handler
const socketHandler = new SocketHandler(io, gameManager);
socketHandler.initialize();

// REST API endpoints for health checks and lobby info
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: Date.now(),
        activeTables: gameManager.getActiveTableCount(),
        onlinePlayers: gameManager.getOnlinePlayerCount()
    });
});

app.get('/api/tables', (req, res) => {
    res.json(gameManager.getPublicTableList());
});

// Start server
server.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║                    POKER SERVER STARTED                       ║
╠══════════════════════════════════════════════════════════════╣
║  Port: ${PORT.toString().padEnd(54)}║
║  Environment: ${(process.env.NODE_ENV || 'development').padEnd(47)}║
║  WebSocket: Ready for connections                             ║
╚══════════════════════════════════════════════════════════════╝
    `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully...');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

