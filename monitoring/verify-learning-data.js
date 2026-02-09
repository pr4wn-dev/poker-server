#!/usr/bin/env node
/**
 * Verify Learning Data - Comprehensive Check
 * Verifies all learning data is captured and saved permanently
 */

const path = require('path');
const AIMonitorCore = require('./core/AIMonitorCore');
const fs = require('fs');

const projectRoot = path.resolve(__dirname, '..');

console.log('═══════════════════════════════════════════════════════════════');
console.log('  LEARNING SYSTEM VERIFICATION REPORT');
console.log('═══════════════════════════════════════════════════════════════\n');

try {
    const core = new AIMonitorCore(projectRoot);
    const learningEngine = core.learningEngine;
    const stateStore = core.stateStore;
    
    // Get learning state
    const state = stateStore.getState('learning') || {};
    
    console.log('1. MISDIAGNOSIS PATTERNS:');
    console.log('─────────────────────────────────────────────────────────────');
    const misdiagnosis = state.misdiagnosisPatterns || {};
    const misdiagnosisKeys = Object.keys(misdiagnosis);
    console.log(`   Total Patterns: ${misdiagnosisKeys.length}`);
    if (misdiagnosisKeys.length > 0) {
        misdiagnosisKeys.forEach(key => {
            const pattern = misdiagnosis[key];
            const minutesWasted = Math.round((pattern.timeWasted || 0) / 60000);
            console.log(`   - ${key}:`);
            console.log(`     Frequency: ${pattern.frequency || 0} occurrences`);
            console.log(`     Time Wasted: ${minutesWasted} minutes`);
            console.log(`     Success Rate: ${((pattern.successRate || 0) * 100).toFixed(1)}%`);
            console.log(`     Common Misdiagnosis: ${pattern.commonMisdiagnosis || 'N/A'}`);
            console.log(`     Actual Root Cause: ${pattern.actualRootCause || 'N/A'}`);
            console.log(`     Correct Approach: ${pattern.correctApproach || 'N/A'}`);
        });
    } else {
        console.log('   No misdiagnosis patterns yet');
    }
    
    console.log('\n2. FAILED METHODS (What NOT to do):');
    console.log('─────────────────────────────────────────────────────────────');
    const failedMethods = state.failedMethods || {};
    const failedKeys = Object.keys(failedMethods);
    console.log(`   Total Issue Types with Failed Methods: ${failedKeys.length}`);
    if (failedKeys.length > 0) {
        failedKeys.forEach(issueType => {
            const methods = failedMethods[issueType] || [];
            console.log(`   - ${issueType}:`);
            methods.forEach(method => {
                const minutesWasted = Math.round((method.timeWasted || 0) / 60000);
                console.log(`     * ${method.method}: ${method.frequency} failures, ${minutesWasted} min wasted`);
            });
        });
    } else {
        console.log('   No failed methods tracked yet');
    }
    
    console.log('\n3. FIX ATTEMPTS:');
    console.log('─────────────────────────────────────────────────────────────');
    const fixAttempts = state.fixAttempts || {};
    const attemptKeys = Object.keys(fixAttempts);
    console.log(`   Total Fix Attempts: ${attemptKeys.length}`);
    
    // Group by issue type
    const byIssueType = {};
    attemptKeys.forEach(key => {
        const attempt = fixAttempts[key];
        if (attempt && attempt.issueType) {
            if (!byIssueType[attempt.issueType]) {
                byIssueType[attempt.issueType] = [];
            }
            byIssueType[attempt.issueType].push(attempt);
        }
    });
    
    Object.entries(byIssueType).forEach(([issueType, attempts]) => {
        console.log(`   - ${issueType}: ${attempts.length} attempt(s)`);
        attempts.slice(-3).forEach(attempt => {
            const result = attempt.result === 'success' ? '[OK]' : '[FAIL]';
            const testName = attempt.fixDetails?.testName || attempt.fixMethod || 'unknown';
            console.log(`     ${result} ${testName}: ${attempt.errorMessage || attempt.failureReason || attempt.result}`);
        });
    });
    
    console.log('\n4. PATTERNS LEARNED:');
    console.log('─────────────────────────────────────────────────────────────');
    console.log(`   Total Patterns: ${learningEngine.patterns.size}`);
    const topPatterns = Array.from(learningEngine.patterns.entries())
        .sort((a, b) => b[1].frequency - a[1].frequency)
        .slice(0, 5);
    if (topPatterns.length > 0) {
        topPatterns.forEach(([key, pattern]) => {
            console.log(`   - ${key}: ${pattern.frequency} occurrences, ${((pattern.successRate || 0) * 100).toFixed(1)}% success`);
        });
    }
    
    console.log('\n5. DATA PERSISTENCE VERIFICATION:');
    console.log('─────────────────────────────────────────────────────────────');
    const stateFile = path.join(projectRoot, 'logs', 'ai-state-store.json');
    if (fs.existsSync(stateFile)) {
        const stats = fs.statSync(stateFile);
        const fileSize = (stats.size / 1024 / 1024).toFixed(2);
        const fileContent = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
        const fileLearning = fileContent.state?.learning || {};
        
        console.log(`   State Store File: ${stateFile}`);
        console.log(`   File Size: ${fileSize} MB`);
        console.log(`   Last Modified: ${new Date(stats.mtime).toISOString()}`);
        console.log(`   Data in File:`);
        console.log(`     - Fix Attempts: ${Object.keys(fileLearning.fixAttempts || {}).length}`);
        console.log(`     - Misdiagnosis Patterns: ${Object.keys(fileLearning.misdiagnosisPatterns || {}).length}`);
        console.log(`     - Failed Methods: ${Object.keys(fileLearning.failedMethods || {}).length}`);
        console.log(`     - Patterns: ${fileLearning.patterns ? (Array.isArray(fileLearning.patterns) ? fileLearning.patterns.length : Object.keys(fileLearning.patterns).length) : 0}`);
        console.log(`   ✅ Data is saved permanently`);
    } else {
        console.log(`   ⚠️  State store file not found`);
    }
    
    console.log('\n6. STARTUP FAILURES TRACKED:');
    console.log('─────────────────────────────────────────────────────────────');
    const startupFailures = Object.values(fixAttempts).filter(a => 
        a && a.issueType === 'startup_verification_failure'
    );
    console.log(`   Total Startup Failures: ${startupFailures.length}`);
    if (startupFailures.length > 0) {
        startupFailures.forEach(failure => {
            console.log(`   - ${failure.fixDetails?.testName || 'unknown'}: ${failure.errorMessage || failure.failureReason}`);
            console.log(`     Timestamp: ${new Date(failure.timestamp).toISOString()}`);
        });
    } else {
        console.log('   No startup failures tracked yet (or not saved yet)');
    }
    
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  VERIFICATION COMPLETE');
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    core.destroy();
    process.exit(0);
    
} catch (error) {
    console.error('VERIFICATION FAILED:', error.message);
    console.error(error.stack);
    process.exit(1);
}
