/**
 * Recover Learning Data from Corrupted State File
 * 
 * This script extracts learning patterns, knowledge, and other critical
 * learning data from a corrupted state file before it's reset.
 */

const fs = require('fs');
const path = require('path');
const StateStoreRecovery = require('./core/StateStoreRecovery');

const projectRoot = path.resolve(__dirname, '..');
const stateFile = path.join(projectRoot, 'logs', 'ai-state-store.json');
const outputFile = path.join(projectRoot, 'logs', 'ai-state-store.recovered.json');

console.log('=== RECOVERING LEARNING DATA ===');
console.log('');

if (!fs.existsSync(stateFile)) {
    console.log('State file not found:', stateFile);
    process.exit(1);
}

const stats = fs.statSync(stateFile);
console.log('State file size:', (stats.size / 1024 / 1024).toFixed(2), 'MB');
console.log('');

const recovered = StateStoreRecovery.extractLearningData(stateFile);

console.log('Recovery Results:');
console.log('  Patterns:', recovered.patterns.length);
console.log('  Knowledge:', recovered.knowledge.length);
console.log('  Improvements:', recovered.improvements.length);
console.log('  Workflow Violations:', recovered.workflowViolations.length);
console.log('  Prompts:', recovered.prompts.length);
console.log('  Compliance Records:', recovered.aiCompliance.length);
console.log('  Success:', recovered.success);
console.log('');

if (recovered.errors.length > 0) {
    console.log('Recovery Errors:');
    recovered.errors.slice(0, 5).forEach(err => console.log('  -', err));
    if (recovered.errors.length > 5) {
        console.log('  ... and', recovered.errors.length - 5, 'more');
    }
    console.log('');
}

if (recovered.success) {
    StateStoreRecovery.saveRecoveredData(recovered, outputFile);
    console.log('✅ Recovered data saved to:', outputFile);
    console.log('');
    console.log('Next steps:');
    console.log('  1. StateStore will automatically restore this data on next load');
    console.log('  2. Learning patterns will be preserved');
    console.log('  3. System will continue learning from where it left off');
} else {
    console.log('⚠️  No recoverable data found');
    console.log('   System will start with fresh learning data');
}
