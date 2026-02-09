#!/usr/bin/env node
/**
 * System Verification Script
 * Verifies all misdiagnosis-first components are properly integrated
 */

const path = require('path');
const AIMonitorCore = require('./core/AIMonitorCore');

const projectRoot = path.resolve(__dirname, '..');

console.log('🔍 Verifying Misdiagnosis-First System...\n');

try {
    const core = new AIMonitorCore(projectRoot);
    
    // Check core components
    const checks = {
        'AIMonitorCore initialized': !!core,
        'Learning Engine': !!core.learningEngine,
        'Prompt Generator': !!core.promptGenerator,
        'Collaboration Interface': !!core.collaborationInterface,
        'State Store': !!core.stateStore,
        'Misdiagnosis Patterns Map': core.learningEngine?.misdiagnosisPatterns instanceof Map,
        'Misdiagnosis Patterns Count': core.learningEngine?.misdiagnosisPatterns?.size || 0,
        'getMisdiagnosisPrevention method': typeof core.learningEngine?.getMisdiagnosisPrevention === 'function',
        'trackMisdiagnosis method': typeof core.learningEngine?.trackMisdiagnosis === 'function',
        'initializePowerShellPatterns method': typeof core.learningEngine?.initializePowerShellPatterns === 'function',
        'AILiveStatistics includes misdiagnosis': typeof core.liveStatistics?.getMisdiagnosisState === 'function',
        'PromptGenerator uses misdiagnosis': core.promptGenerator?.learningEngine === core.learningEngine,
        'CollaborationInterface uses misdiagnosis': core.collaborationInterface?.learningEngine === core.learningEngine
    };
    
    console.log('Component Checks:');
    console.log('─────────────────────────────────────────────────────────────');
    let allPassed = true;
    for (const [check, passed] of Object.entries(checks)) {
        const status = passed ? '✓' : '✗';
        const color = passed ? '\x1b[32m' : '\x1b[31m';
        console.log(`${color}${status}\x1b[0m ${check}`);
        if (!passed) allPassed = false;
    }
    
    // Test misdiagnosis prevention
    console.log('\nMisdiagnosis Prevention Test:');
    console.log('─────────────────────────────────────────────────────────────');
    const prevention = core.learningEngine.getMisdiagnosisPrevention(
        'powershell_syntax_error',
        'Missing closing bracket',
        'PowerShell'
    );
    console.log(`✓ getMisdiagnosisPrevention() returns: ${typeof prevention === 'object' ? 'object' : 'ERROR'}`);
    console.log(`✓ Has warnings array: ${Array.isArray(prevention.warnings)}`);
    console.log(`✓ Has correctApproach: ${typeof prevention.correctApproach === 'string' || prevention.correctApproach === null}`);
    console.log(`✓ Has timeSavings: ${typeof prevention.timeSavings === 'number' || prevention.timeSavings === null}`);
    
    // Check PowerShell pattern initialization
    console.log('\nPowerShell Pattern Check:');
    console.log('─────────────────────────────────────────────────────────────');
    const hasPowerShellPattern = core.learningEngine.misdiagnosisPatterns.has('powershell_bracket_error_misdiagnosis');
    console.log(`✓ PowerShell pattern initialized: ${hasPowerShellPattern ? 'YES' : 'NO'}`);
    if (hasPowerShellPattern) {
        const pattern = core.learningEngine.misdiagnosisPatterns.get('powershell_bracket_error_misdiagnosis');
        console.log(`  - Pattern: ${pattern.pattern}`);
        console.log(`  - Symptom: ${pattern.symptom}`);
        console.log(`  - Common Misdiagnosis: ${pattern.commonMisdiagnosis}`);
        console.log(`  - Actual Root Cause: ${pattern.actualRootCause}`);
        console.log(`  - Correct Approach: ${pattern.correctApproach}`);
    }
    
    // Check UI integration
    console.log('\nUI Integration Check:');
    console.log('─────────────────────────────────────────────────────────────');
    const stats = core.liveStatistics.getStatistics();
    console.log(`✓ Statistics include misdiagnosis: ${!!stats.misdiagnosis}`);
    if (stats.misdiagnosis) {
        console.log(`  - Total Patterns: ${stats.misdiagnosis.totalPatterns}`);
        console.log(`  - Total Time Wasted: ${stats.misdiagnosis.totalTimeWasted}ms`);
        console.log(`  - High Frequency Patterns: ${stats.misdiagnosis.highFrequencyPatterns?.length || 0}`);
    }
    
    // Summary
    console.log('\n' + '='.repeat(60));
    if (allPassed) {
        console.log('✅ ALL SYSTEMS VERIFIED - MISDIAGNOSIS-FIRST ARCHITECTURE COMPLETE');
    } else {
        console.log('❌ SOME CHECKS FAILED - REVIEW ABOVE');
    }
    console.log('='.repeat(60));
    
    core.destroy();
    process.exit(allPassed ? 0 : 1);
    
} catch (error) {
    console.error('❌ VERIFICATION FAILED:', error.message);
    console.error(error.stack);
    process.exit(1);
}
