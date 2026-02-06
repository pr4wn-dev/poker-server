/**
 * Resume a paused simulation
 * Usage: node scripts/resume-simulation.js [tableId]
 */

require('dotenv').config();
const { io } = require('socket.io-client');

const tableId = process.argv[2] || 'e6bfca2f-764b-432e-a3b5-a691901fd805';
const serverUrl = process.env.SERVER_URL || 'http://localhost:3000';

// All logging now goes through gameLogger - no console output
const gameLogger = require('../src/utils/GameLogger');
gameLogger.gameEvent('RESUME_SCRIPT', '[RESUME] CONNECTING', { serverUrl, tableId });

const socket = io(serverUrl, {
    transports: ['websocket'],
    reconnection: false
});

socket.on('connect', () => {
    gameLogger.gameEvent('RESUME_SCRIPT', '[RESUME] CONNECTED', { serverUrl });
    
    // Register first to authenticate
    socket.emit('register', { playerName: 'ResumeBot' }, (registerResponse) => {
        if (!registerResponse.success) {
            gameLogger.error('RESUME_SCRIPT', '[RESUME] REGISTRATION_FAILED', { error: registerResponse.error });
            socket.disconnect();
            process.exit(1);
        }
        
        gameLogger.gameEvent('RESUME_SCRIPT', '[RESUME] REGISTERED', {});
        
        socket.emit('resume_simulation', { tableId }, (response) => {
            gameLogger.gameEvent('RESUME_SCRIPT', '[RESUME] RESPONSE', { response });
            socket.disconnect();
            process.exit(0);
        });
        
        socket.on('resume_simulation_response', (response) => {
            gameLogger.gameEvent('RESUME_SCRIPT', '[RESUME] RESPONSE', { response });
            socket.disconnect();
            process.exit(0);
        });
    });
});

socket.on('connect_error', (error) => {
    gameLogger.error('RESUME_SCRIPT', '[RESUME] CONNECTION_ERROR', { error: error.message });
    process.exit(1);
});

setTimeout(() => {
    gameLogger.error('RESUME_SCRIPT', '[RESUME] TIMEOUT', { message: 'Timeout waiting for response' });
    socket.disconnect();
    process.exit(1);
}, 5000);
