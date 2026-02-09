#!/usr/bin/env node
/**
 * Call beforeAIAction - For AI to follow workflow
 */

const path = require('path');
const AIMonitorCore = require('./core/AIMonitorCore');

const projectRoot = path.resolve(__dirname, '..');
const core = new AIMonitorCore(projectRoot);

// Wait for initialization
setTimeout(() => {
    const action = {
        type: 'fix_attempt',
        issueType: 'powershell_syntax_error',
        component: 'BrokenPromise',
        file: 'monitoring/brokenpromise.ps1'
    };
    
    const suggestions = core.beforeAIAction(action);
    console.log(JSON.stringify(suggestions, null, 2));
    
    // Exit after a short delay to allow async operations
    setTimeout(() => {
        core.destroy();
        process.exit(0);
    }, 1000);
}, 500);
