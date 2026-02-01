#!/usr/bin/env node
/**
 * Analyze a single state snapshot log for issues
 * 
 * Usage: node scripts/analyze-state.js <tableId> [sim|real]
 * 
 * Analyzes state snapshots to find patterns, bugs, and inconsistencies.
 */

const StateAnalyzer = require('../src/testing/StateAnalyzer');
const StateSnapshot = require('../src/testing/StateSnapshot');
const path = require('path');

const tableId = process.argv[2];
const type = process.argv[3] || 'sim'; // 'sim' or 'real'

if (!tableId) {
    console.error('Usage: node scripts/analyze-state.js <tableId> [sim|real]');
    console.error('Example: node scripts/analyze-state.js table_abc123 sim');
    process.exit(1);
}

const analyzer = new StateAnalyzer();
const files = StateSnapshot.getSnapshotFiles(tableId);
const logPath = type === 'sim' ? files.sim : files.real;

if (!logPath) {
    console.error(`Error: Could not find ${type} snapshot file for table: ${tableId}`);
    process.exit(1);
}

console.log(`Analyzing ${type} state snapshot...`);
console.log(`  File: ${logPath}`);
console.log('');

const analysis = analyzer.analyzeLog(logPath);

if (analysis.error) {
    console.error('Error:', analysis.error);
    process.exit(1);
}

const report = analyzer.generateReport(analysis);
console.log(report);

if (analysis.issueCount > 0) {
    console.log(`\n⚠️  Found ${analysis.issueCount} issues (${analysis.highSeverityIssues} high severity)`);
    process.exit(1);
} else {
    console.log('\n✅ No issues found!');
    process.exit(0);
}

