#!/usr/bin/env node
/**
 * Manually save state snapshots for an active table
 * 
 * Usage: node scripts/save-table-snapshot.js <tableId>
 * 
 * This allows saving snapshots for tables that are still active
 * (normally snapshots are only saved when tables close)
 */

const GameManager = require('../src/game/GameManager');
const gameManager = new GameManager();

// This won't work because GameManager is a singleton instance
// We need to access the running server's GameManager instance
// For now, this is a placeholder - we'll need to modify the approach

const tableId = process.argv[2];

if (!tableId) {
    console.error('Usage: node scripts/save-table-snapshot.js <tableId>');
    console.error('Example: node scripts/save-table-snapshot.js table_abc123');
    process.exit(1);
}

console.log('⚠️  This script requires access to the running server\'s GameManager instance.');
console.log('   For now, you need to close the table (leave all players) to save snapshots.');
console.log('');
console.log('   Alternatively, add an API endpoint to the server to manually save snapshots.');
console.log('');
console.log(`   Table ID: ${tableId}`);

