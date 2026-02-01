#!/usr/bin/env node
/**
 * Compare simulation state logs to real game state logs
 * 
 * Usage: node scripts/compare-states.js <tableId>
 * 
 * Compares state snapshots from simulation and real game to find differences.
 */

const StateComparator = require('../src/testing/StateComparator');
const StateSnapshot = require('../src/testing/StateSnapshot');
const path = require('path');

const tableId = process.argv[2];

if (!tableId) {
    console.error('Usage: node scripts/compare-states.js <tableId>');
    console.error('Example: node scripts/compare-states.js table_abc123');
    process.exit(1);
}

const comparator = new StateComparator();
const files = StateSnapshot.getSnapshotFiles(tableId);

if (!files.sim || !files.real) {
    console.error('Error: Could not find snapshot files for table:', tableId);
    if (!files.sim) console.error('  Missing: simulation snapshot');
    if (!files.real) console.error('  Missing: real game snapshot');
    process.exit(1);
}

console.log('Comparing state snapshots...');
console.log(`  Simulation: ${files.sim}`);
console.log(`  Real Game: ${files.real}`);
console.log('');

const comparison = comparator.compareLogs(files.sim, files.real, {
    tolerance: {
        pot: 0,      // No tolerance for pot (must match exactly)
        bet: 0       // No tolerance for bets (must match exactly)
    }
});

const report = comparator.generateReport(comparison);
console.log(report);

if (comparison.summary.totalDifferences > 0) {
    console.log(`\n📊 Full comparison report saved to: ${comparison.reportPath}`);
    process.exit(1); // Exit with error if differences found
} else {
    console.log('\n✅ No differences found!');
    process.exit(0);
}

