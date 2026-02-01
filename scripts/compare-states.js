#!/usr/bin/env node
/**
 * Compare simulation state logs to real game state logs
 * 
 * Usage: node scripts/compare-states.js <tableId>
 * 
 * Compares state snapshots from simulation and real game to find differences.
 */

const StateComparator = require('../src/testing/StateComparator');
const StateAnalyzer = require('../src/testing/StateAnalyzer');
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

