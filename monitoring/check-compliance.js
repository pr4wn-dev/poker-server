#!/usr/bin/env node
const path = require('path');
const fs = require('fs');

const stateFile = path.join(__dirname, '..', 'logs', 'ai-state-store.json');

if (!fs.existsSync(stateFile)) {
    console.log('State file not found');
    process.exit(1);
}

const data = JSON.parse(fs.readFileSync(stateFile, 'utf8'));

// Check compliance records
const aiCompliance = data.state?.learning?.aiCompliance || [];
console.log('═══════════════════════════════════════════════════════════════');
console.log('  COMPLIANCE VERIFICATION CHECK');
console.log('═══════════════════════════════════════════════════════════════\n');
console.log(`Total compliance records: ${aiCompliance.length}\n`);

if (aiCompliance.length > 0) {
    console.log('Recent compliance records (last 5):');
    aiCompliance.slice(-5).forEach((record, i) => {
        console.log(`\n${i + 1}. Prompt ID: ${record.promptId || 'unknown'}`);
        console.log(`   Compliant: ${record.compliant}`);
        console.log(`   Result: ${record.complianceResult || 'unknown'}`);
        console.log(`   Parts Worked: ${record.partsWorked?.length || 0}`);
        console.log(`   Parts Skipped: ${record.partsSkipped?.length || 0}`);
        if (record.partsSkipped && record.partsSkipped.length > 0) {
            console.log(`   Skipped: ${record.partsSkipped.join(', ')}`);
        }
        if (record.partsWorked && record.partsWorked.length > 0) {
            console.log(`   Worked: ${record.partsWorked.join(', ')}`);
        }
        console.log(`   Timestamp: ${new Date(record.timestamp).toISOString()}`);
    });
} else {
    console.log('No compliance records found');
}

// Check AI state
console.log('\n═══════════════════════════════════════════════════════════════');
console.log('  AI STATE (Tool Call Tracking)');
console.log('═══════════════════════════════════════════════════════════════\n');

const aiState = data.state?.ai || {};
console.log('lastBeforeActionCall:', aiState.lastBeforeActionCall ? new Date(aiState.lastBeforeActionCall).toISOString() : 'never');
console.log('lastAfterActionCall:', aiState.lastAfterActionCall ? new Date(aiState.lastAfterActionCall).toISOString() : 'never');
console.log('recentToolCalls:', aiState.recentToolCalls?.length || 0);

if (aiState.recentToolCalls && aiState.recentToolCalls.length > 0) {
    console.log('\nRecent tool calls (last 5):');
    aiState.recentToolCalls.slice(-5).forEach((call, i) => {
        console.log(`  ${i + 1}. ${call.tool || 'unknown'} at ${new Date(call.timestamp || 0).toISOString()}`);
    });
}

// Summary
console.log('\n═══════════════════════════════════════════════════════════════');
console.log('  SUMMARY');
console.log('═══════════════════════════════════════════════════════════════\n');

if (aiCompliance.length === 0) {
    console.log('⚠️  No compliance records - verification may not be running');
} else {
    const compliant = aiCompliance.filter(r => r.compliant).length;
    const nonCompliant = aiCompliance.filter(r => !r.compliant).length;
    const partial = aiCompliance.filter(r => r.complianceResult === 'partial').length;
    
    console.log(`Compliant: ${compliant}`);
    console.log(`Non-Compliant: ${nonCompliant}`);
    console.log(`Partial: ${partial}`);
    
    if (nonCompliant > 0 || partial > 0) {
        console.log('\n⚠️  Non-compliance detected!');
    }
}

if (!aiState.lastBeforeActionCall) {
    console.log('\n⚠️  beforeAIAction() has never been called');
}

if (!aiState.lastAfterActionCall) {
    console.log('⚠️  afterAIAction() has never been called');
}
