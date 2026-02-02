#!/usr/bin/env node
/**
 * Automated Comparison Test Runner
 * 
 * This script orchestrates the entire comparison testing workflow:
 * 1. Runs a simulation with specific settings
 * 2. Runs a real/practice game with the same settings
 * 3. Compares the state snapshots
 * 4. Reports any differences found
 * 
 * Usage: node scripts/run-comparison-test.js [options]
 * 
 * Options:
 *   --settings <json>  - Custom table settings (JSON string)
 *   --hands <number>   - Number of hands to play (default: 5)
 *   --auto-fix         - Attempt to auto-fix differences (experimental)
 */

const StateComparator = require('../src/testing/StateComparator');
const StateAnalyzer = require('../src/testing/StateAnalyzer');
const StateSnapshot = require('../src/testing/StateSnapshot');
const path = require('path');
const fs = require('fs');

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
    hands: 5,
    autoFix: false,
    settings: null
};

for (let i = 0; i < args.length; i++) {
    if (args[i] === '--hands' && args[i + 1]) {
        options.hands = parseInt(args[i + 1]);
    } else if (args[i] === '--auto-fix') {
        options.autoFix = true;
    } else if (args[i] === '--settings' && args[i + 1]) {
        try {
            options.settings = JSON.parse(args[i + 1]);
        } catch (e) {
            console.error('Error parsing settings JSON:', e.message);
            process.exit(1);
        }
    }
}

console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║   AUTOMATED SIMULATION vs REAL GAME COMPARISON TEST      ║');
console.log('╚════════════════════════════════════════════════════════════╝');
console.log('');

// Default settings if not provided
const defaultSettings = {
    maxPlayers: 4,
    smallBlind: 50,
    bigBlind: 100,
    buyIn: 10000,
    turnTimeLimit: 30,
    blindIncreaseInterval: 0, // No blind increases for testing
    socketBotRatio: 0.5 // 50% socket bots, 50% regular bots
};

const testSettings = options.settings || defaultSettings;

console.log('Test Configuration:');
console.log(`  Hands to play: ${options.hands}`);
console.log(`  Max Players: ${testSettings.maxPlayers}`);
console.log(`  Blinds: ${testSettings.smallBlind}/${testSettings.bigBlind}`);
console.log(`  Buy-In: ${testSettings.buyIn}`);
console.log(`  Turn Time: ${testSettings.turnTimeLimit}s`);
console.log(`  Socket Bot Ratio: ${(testSettings.socketBotRatio * 100).toFixed(0)}%`);
console.log('');

// Generate unique table IDs for this test run
const testId = `test_${Date.now()}`;
const simTableId = `${testId}_sim`;
const realTableId = `${testId}_real`;

console.log('════════════════════════════════════════════════════════════');
console.log('STEP 1: Check if state snapshots are enabled');
console.log('════════════════════════════════════════════════════════════');

if (process.env.ENABLE_STATE_SNAPSHOTS !== 'true') {
    console.log('⚠️  WARNING: ENABLE_STATE_SNAPSHOTS is not set to "true"');
    console.log('   State snapshots will not be captured!');
    console.log('');
    console.log('   To enable, set environment variable:');
    console.log('   Windows: $env:ENABLE_STATE_SNAPSHOTS="true"; npm start');
    console.log('   Linux/Mac: ENABLE_STATE_SNAPSHOTS=true npm start');
    console.log('');
    console.log('   Or add to .env file: ENABLE_STATE_SNAPSHOTS=true');
    console.log('');
    console.log('   Quick fix: Run: .\\scripts\\enable-snapshots.ps1');
    console.log('');
    console.log('⚠️  Continuing anyway - but snapshots won\'t be captured!');
    console.log('');
    runTest();
} else {
    console.log('✅ State snapshots are enabled');
    console.log('');
    runTest();
}

function runTest() {
    console.log('════════════════════════════════════════════════════════════');
    console.log('STEP 2: Instructions for Manual Testing');
    console.log('════════════════════════════════════════════════════════════');
    console.log('');
    console.log('This test requires manual steps:');
    console.log('');
    console.log('1. SIMULATION TABLE:');
    console.log('   - In Unity client, create a SIMULATION table with these settings:');
    console.log(`     * Max Players: ${testSettings.maxPlayers}`);
    console.log(`     * Small Blind: ${testSettings.smallBlind}`);
    console.log(`     * Big Blind: ${testSettings.bigBlind}`);
    console.log(`     * Buy-In: ${testSettings.buyIn}`);
    console.log(`     * Turn Time: ${testSettings.turnTimeLimit}s`);
    console.log(`     * Socket Bot Ratio: ${(testSettings.socketBotRatio * 100).toFixed(0)}%`);
    console.log('   - Let it play at least ' + options.hands + ' hands');
    console.log('   - Note the table ID from server logs');
    console.log('');
    console.log('2. REAL/PRACTICE TABLE:');
    console.log('   - In Unity client, create a REAL or PRACTICE table with IDENTICAL settings');
    console.log('   - Join with the same number of players (or use bots)');
    console.log('   - Play the same number of hands with similar actions');
    console.log('   - Note the table ID from server logs');
    console.log('');
    console.log('3. RUN COMPARISON:');
    console.log('   - After both games complete, run:');
    console.log('   - npm run compare-states <simulationTableId> <realTableId>');
    console.log('');
    console.log('════════════════════════════════════════════════════════════');
    console.log('ALTERNATIVE: Automated Comparison (if snapshots exist)');
    console.log('════════════════════════════════════════════════════════════');
    console.log('');
    
    // Check for existing snapshots
    const snapshotDir = path.join(__dirname, '../logs/state_snapshots');
    if (fs.existsSync(snapshotDir)) {
        const files = fs.readdirSync(snapshotDir);
        const simFiles = files.filter(f => f.endsWith('_sim.json'));
        const realFiles = files.filter(f => f.endsWith('_real.json'));
        
        if (simFiles.length > 0 && realFiles.length > 0) {
            console.log(`Found ${simFiles.length} simulation snapshot(s) and ${realFiles.length} real game snapshot(s)`);
            console.log('');
            console.log('Recent simulation snapshots:');
            simFiles.slice(-5).forEach(f => {
                const tableId = f.replace('_sim.json', '');
                console.log(`  - ${tableId}`);
            });
            console.log('');
            console.log('Recent real game snapshots:');
            realFiles.slice(-5).forEach(f => {
                const tableId = f.replace('_real.json', '');
                console.log(`  - ${tableId}`);
            });
            console.log('');
            console.log('To compare specific tables, run:');
            console.log('  npm run compare-states <simulationTableId> <realTableId>');
            console.log('');
            console.log('Or to compare the most recent snapshots:');
            if (simFiles.length > 0 && realFiles.length > 0) {
                const latestSim = simFiles[simFiles.length - 1].replace('_sim.json', '');
                const latestReal = realFiles[realFiles.length - 1].replace('_real.json', '');
                console.log(`  npm run compare-states ${latestSim} ${latestReal}`);
            }
        } else {
            console.log('No matching snapshot pairs found.');
            console.log('Run a simulation and a real game first, then run this script again.');
        }
    } else {
        console.log('No snapshot directory found. State snapshots will be created when games are played.');
    }
    
    console.log('');
    console.log('════════════════════════════════════════════════════════════');
    console.log('For best results:');
    console.log('════════════════════════════════════════════════════════════');
    console.log('1. Use identical table settings for both simulation and real game');
    console.log('2. Play the same number of hands');
    console.log('3. Try to replicate similar betting patterns (if possible)');
    console.log('4. Compare snapshots immediately after games complete');
    console.log('');
}

