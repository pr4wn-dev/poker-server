#!/usr/bin/env node
/**
 * Compare simulation state logs to real game state logs
 * 
 * Usage: 
 *   node scripts/compare-states.js <simTableId> <realTableId>
 *   node scripts/compare-states.js <tableId>  (if both use same tableId)
 *   node scripts/compare-states.js --latest    (compare most recent snapshots)
 * 
 * Compares state snapshots from simulation and real game to find differences.
 */

const StateComparator = require('../src/testing/StateComparator');
const StateAnalyzer = require('../src/testing/StateAnalyzer');
const StateSnapshot = require('../src/testing/StateSnapshot');
const path = require('path');
const fs = require('fs');

let simTableId = process.argv[2];
let realTableId = process.argv[3];

// Handle --latest flag
if (simTableId === '--latest' || simTableId === '-l') {
    const snapshotDir = path.join(__dirname, '../logs/state_snapshots');
    if (!fs.existsSync(snapshotDir)) {
        console.error('Error: No snapshot directory found. Run some games first!');
        process.exit(1);
    }
    
    const files = fs.readdirSync(snapshotDir);
    const simFiles = files.filter(f => f.endsWith('_sim.json')).sort();
    const realFiles = files.filter(f => f.endsWith('_real.json')).sort();
    
    if (simFiles.length === 0 || realFiles.length === 0) {
        console.error('Error: Need at least one simulation and one real game snapshot');
        console.error(`  Found ${simFiles.length} simulation snapshot(s) and ${realFiles.length} real game snapshot(s)`);
        process.exit(1);
    }
    
    simTableId = simFiles[simFiles.length - 1].replace('_sim.json', '');
    realTableId = realFiles[realFiles.length - 1].replace('_real.json', '');
    
    console.log(`Auto-selected most recent snapshots:`);
    console.log(`  Simulation: ${simTableId}`);
    console.log(`  Real Game: ${realTableId}`);
    console.log('');
}

// If only one tableId provided, assume both use same ID
if (!realTableId) {
    realTableId = simTableId;
}

if (!simTableId) {
    console.error('Usage: node scripts/compare-states.js <simTableId> [realTableId]');
    console.error('   or: node scripts/compare-states.js --latest');
    console.error('');
    console.error('Examples:');
    console.error('  node scripts/compare-states.js table_abc123 table_xyz789');
    console.error('  node scripts/compare-states.js table_abc123  (if both use same ID)');
    console.error('  node scripts/compare-states.js --latest      (compare most recent)');
    process.exit(1);
}

const comparator = new StateComparator();

// Get snapshot files - try multiple methods
let simFile = null;
let realFile = null;

// Method 1: Use getSnapshotFiles helper
const simFiles = StateSnapshot.getSnapshotFiles(simTableId);
const realFiles = StateSnapshot.getSnapshotFiles(realTableId);
simFile = simFiles.sim;
realFile = realFiles.real;

// Method 2: Try with _sim/_real suffixes if not found
const snapshotDir = path.join(__dirname, '../logs/state_snapshots');
if (!simFile && !simTableId.includes('_sim')) {
    const altSimFile = path.join(snapshotDir, `${simTableId}_sim.json`);
    if (fs.existsSync(altSimFile)) {
        simFile = altSimFile;
    }
}

if (!realFile && !realTableId.includes('_real')) {
    const altRealFile = path.join(snapshotDir, `${realTableId}_real.json`);
    if (fs.existsSync(altRealFile)) {
        realFile = altRealFile;
    }
}

// Method 3: Try direct file paths if still not found
if (!simFile) {
    const directSimFile = path.join(snapshotDir, `${simTableId}.json`);
    if (fs.existsSync(directSimFile)) {
        simFile = directSimFile;
    }
}

if (!realFile) {
    const directRealFile = path.join(snapshotDir, `${realTableId}.json`);
    if (fs.existsSync(directRealFile)) {
        realFile = directRealFile;
    }
}

if (!simFile || !fs.existsSync(simFile)) {
    console.error('Error: Could not find simulation snapshot');
    console.error(`  Looked for: ${simTableId}_sim.json or ${simTableId}.json`);
    console.error(`  Directory: ${path.join(__dirname, '../logs/state_snapshots')}`);
    process.exit(1);
}

if (!realFile || !fs.existsSync(realFile)) {
    console.error('Error: Could not find real game snapshot');
    console.error(`  Looked for: ${realTableId}_real.json or ${realTableId}.json`);
    console.error(`  Directory: ${path.join(__dirname, '../logs/state_snapshots')}`);
    process.exit(1);
}

const files = { sim: simFile, real: realFile };

console.log('Comparing state snapshots...');
console.log(`  Simulation: ${files.sim}`);
console.log(`  Real Game: ${files.real}`);
console.log('');

// First, analyze each log individually for issues
const analyzer = new StateAnalyzer();
console.log('Analyzing simulation log...');
const simAnalysis = analyzer.analyzeLog(files.sim);
console.log(analyzer.generateReport(simAnalysis));

console.log('\nAnalyzing real game log...');
const realAnalysis = analyzer.analyzeLog(files.real);
console.log(analyzer.generateReport(realAnalysis));

// Then compare them
console.log('\n' + '='.repeat(50));
console.log('Comparing simulation vs real game...');
console.log('='.repeat(50) + '\n');

const comparison = comparator.compareLogs(files.sim, files.real, {
    tolerance: {
        pot: 0,      // No tolerance for pot (must match exactly)
        bet: 0       // No tolerance for bets (must match exactly)
    }
});

const report = comparator.generateReport(comparison);
console.log(report);

// Show context-aware comparison
const contextComparison = analyzer.compareWithContext(files.sim, files.real);
if (contextComparison.uniqueSimIssues.length > 0 || contextComparison.uniqueRealIssues.length > 0) {
    console.log('\n' + '='.repeat(50));
    console.log('CONTEXT-AWARE ANALYSIS:');
    console.log('='.repeat(50));
    
    if (contextComparison.uniqueSimIssues.length > 0) {
        console.log(`\n⚠️  Issues ONLY in simulation (${contextComparison.uniqueSimIssues.length}):`);
        contextComparison.uniqueSimIssues.slice(0, 5).forEach(issue => {
            console.log(`  - ${issue.type}: ${JSON.stringify(issue).substring(0, 100)}`);
        });
    }
    
    if (contextComparison.uniqueRealIssues.length > 0) {
        console.log(`\n⚠️  Issues ONLY in real game (${contextComparison.uniqueRealIssues.length}):`);
        contextComparison.uniqueRealIssues.slice(0, 5).forEach(issue => {
            console.log(`  - ${issue.type}: ${JSON.stringify(issue).substring(0, 100)}`);
        });
    }
    
    if (contextComparison.commonIssues.length > 0) {
        console.log(`\n✅ Issues in BOTH (likely real bugs) (${contextComparison.commonIssues.length}):`);
        contextComparison.commonIssues.slice(0, 5).forEach(issue => {
            console.log(`  - ${issue.type}`);
        });
    }
}

if (comparison.summary.totalDifferences > 0 || simAnalysis.issueCount > 0 || realAnalysis.issueCount > 0) {
    console.log(`\n📊 Full comparison report saved to: ${comparison.reportPath}`);
    process.exit(1); // Exit with error if differences found
} else {
    console.log('\n✅ No differences or issues found!');
    process.exit(0);
}

