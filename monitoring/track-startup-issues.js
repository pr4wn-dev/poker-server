const path = require('path');
const AIMonitorCore = require('./core/AIMonitorCore');

const projectRoot = path.resolve(__dirname, '..');
const aiCore = new AIMonitorCore(projectRoot);
const learningEngine = aiCore.learningEngine;

// Track PowerShell syntax error fix
const psSyntaxFix = {
    issueId: 'startup-2026-02-09-ps-syntax',
    issueType: 'powershell_syntax_error',
    fixMethod: 'fix_string_multiplication',
    fixDetails: {
        errorMessage: 'The string is missing the terminator: "',
        file: 'Show-BrokenPromiseStatistics.ps1',
        line: 448,
        rootCause: 'PowerShell does not support string multiplication with * operator',
        solution: 'Created New-Separator helper function using -join with ForEach-Object',
        approach: 'Replace all string multiplication with helper function'
    },
    result: 'success',
    timestamp: Date.now(),
    component: 'monitoring_startup'
};

// Track AI Core timeout issue
const aiCoreTimeout = {
    issueId: 'startup-2026-02-09-ai-core-timeout',
    issueType: 'startup_verification_failure',
    fixMethod: 'increase_timeout',
    fixDetails: {
        errorMessage: 'AI Core not responding',
        testName: 'AI Core Initialization',
        rootCause: '5-second timeout too short for AIMonitorCore initialization (6.26 MB state file)',
        solution: 'Increased timeout to 15 seconds for startup test commands (get-status-report, query)',
        approach: 'Use longer timeout for commands that require full initialization'
    },
    result: 'success',
    timestamp: Date.now(),
    component: 'monitoring_startup'
};

// Track Learning Engine timeout issue
const learningEngineTimeout = {
    issueId: 'startup-2026-02-09-learning-timeout',
    issueType: 'startup_verification_failure',
    fixMethod: 'increase_timeout',
    fixDetails: {
        errorMessage: 'Learning Engine not responding',
        testName: 'Learning Engine',
        rootCause: '5-second timeout too short for AIMonitorCore initialization',
        solution: 'Increased timeout to 15 seconds for startup test commands',
        approach: 'Use longer timeout for commands that require full initialization'
    },
    result: 'success',
    timestamp: Date.now(),
    component: 'monitoring_startup'
};

// Learn from all attempts
learningEngine.learnFromAttempt(psSyntaxFix);
learningEngine.learnFromAttempt(aiCoreTimeout);
learningEngine.learnFromAttempt(learningEngineTimeout);

// Save immediately
learningEngine.save();

console.log('✅ Tracked 3 startup issues to learning system:');
console.log('  1. PowerShell syntax error (string multiplication)');
console.log('  2. AI Core timeout (increased to 15s)');
console.log('  3. Learning Engine timeout (increased to 15s)');

process.exit(0);
