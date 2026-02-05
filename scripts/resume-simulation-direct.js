/**
 * Resume a paused simulation directly via SimulationManager
 * Usage: node scripts/resume-simulation-direct.js [tableId]
 */

require('dotenv').config();
const GameManager = require('../src/game/GameManager');
const SimulationManager = require('../src/testing/SimulationManager');

const tableId = process.argv[2] || 'e6bfca2f-764b-432e-a3b5-a691901fd805';

console.log(`Resuming simulation for table: ${tableId}`);

const gameManager = new GameManager();
const simulationManager = new SimulationManager(gameManager);

const result = simulationManager.resumeSimulation(tableId);

console.log('Result:', JSON.stringify(result, null, 2));

if (result.success) {
    console.log('✓ Simulation resumed successfully!');
    process.exit(0);
} else {
    console.error('✗ Failed to resume simulation:', result.error);
    process.exit(1);
}
