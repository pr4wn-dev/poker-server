/**
 * Resume a paused simulation
 * Usage: node scripts/resume-simulation.js [tableId]
 */

require('dotenv').config();
const { io } = require('socket.io-client');

const tableId = process.argv[2] || 'e6bfca2f-764b-432e-a3b5-a691901fd805';
const serverUrl = process.env.SERVER_URL || 'http://localhost:3000';

console.log(`Connecting to ${serverUrl}...`);
console.log(`Resuming simulation for table: ${tableId}`);

const socket = io(serverUrl, {
    transports: ['websocket'],
    reconnection: false
});

socket.on('connect', () => {
    console.log('Connected! Registering as admin...');
    
    // Register first to authenticate
    socket.emit('register', { playerName: 'ResumeBot' }, (registerResponse) => {
        if (!registerResponse.success) {
            console.error('Registration failed:', registerResponse.error);
            socket.disconnect();
            process.exit(1);
        }
        
        console.log('Registered! Sending resume_simulation...');
        
        socket.emit('resume_simulation', { tableId }, (response) => {
            console.log('Response:', JSON.stringify(response, null, 2));
            socket.disconnect();
            process.exit(0);
        });
        
        socket.on('resume_simulation_response', (response) => {
            console.log('Response:', JSON.stringify(response, null, 2));
            socket.disconnect();
            process.exit(0);
        });
    });
});

socket.on('connect_error', (error) => {
    console.error('Connection error:', error.message);
    process.exit(1);
});

setTimeout(() => {
    console.error('Timeout waiting for response');
    socket.disconnect();
    process.exit(1);
}, 5000);
