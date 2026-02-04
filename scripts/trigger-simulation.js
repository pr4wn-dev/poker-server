/**
 * Simple script to trigger a simulation via Socket.IO
 */

const io = require('socket.io-client');

const serverUrl = process.env.SERVER_URL || 'http://localhost:3000';
const userId = 'sim-trigger-' + Date.now();

console.log(`Connecting to ${serverUrl}...`);

const socket = io(serverUrl, {
    transports: ['websocket'],
    reconnection: false
});

socket.on('connect', () => {
    console.log('Connected! Registering user...');
    
    // Register first
    socket.emit('register', {
        username: 'SimTrigger',
        password: 'test123'
    }, (response) => {
        if (response.success) {
            console.log('Registered! Starting simulation...');
            
            // Start simulation
            socket.emit('start_simulation', {
                tableName: 'Test Simulation',
                maxPlayers: 5,
                smallBlind: 250,
                bigBlind: 500,
                buyIn: 2000000,
                turnTimeLimit: 100, // Fast for testing
                blindIncreaseInterval: 0,
                socketBotRatio: 0.75
            }, (response) => {
                if (response.success) {
                    console.log('✅ Simulation started!');
                    console.log(`Table ID: ${response.tableId}`);
                    console.log('Simulation will run automatically. Check logs/simulation.log for progress.');
                    
                    // Wait a bit then disconnect
                    setTimeout(() => {
                        socket.disconnect();
                        process.exit(0);
                    }, 2000);
                } else {
                    console.error('❌ Failed to start simulation:', response.error);
                    socket.disconnect();
                    process.exit(1);
                }
            });
        } else {
            console.error('❌ Registration failed:', response.error);
            socket.disconnect();
            process.exit(1);
        }
    });
});

socket.on('connect_error', (error) => {
    console.error('Connection error:', error.message);
    process.exit(1);
});

socket.on('disconnect', () => {
    console.log('Disconnected');
});

// Timeout after 10 seconds
setTimeout(() => {
    console.error('Timeout waiting for connection');
    process.exit(1);
}, 10000);
