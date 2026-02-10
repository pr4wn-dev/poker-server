#!/usr/bin/env node
/**
 * Manually record a fix attempt to the learning system
 * Use this when HTTP server isn't running or to record fixes directly
 */

const BrokenPromiseIntegration = require('../integration/BrokenPromiseIntegration');
const path = require('path');

const projectRoot = path.resolve(__dirname, '../..');

const action = {
    type: 'fix_attempt',
    issueType: process.argv[2] || 'terminal_command_error',
    component: process.argv[3] || 'AI_Terminal_Command',
    file: process.argv[4] || 'terminal',
    description: process.argv[5] || 'PowerShell command syntax error fix'
};

const result = {
    success: true,
    result: 'success',
    fixMethod: process.argv[6] || 'simplified_powershell_commands_use_dedicated_scripts',
    duration: parseInt(process.argv[7]) || 180000,
    timeSpent: parseInt(process.argv[7]) || 180000,
    fixDetails: {
        actualRootCause: process.argv[8] || 'Complex PowerShell commands with nested quotes causing syntax errors',
        wrongApproach: process.argv[9] || 'Creating complex inline PowerShell commands with nested Base64 encoding',
        correctApproach: process.argv[10] || 'Use simpler commands, break into variables, use dedicated scripts like analyze-terminal-error.js'
    }
};

(async () => {
    try {
        const integration = new BrokenPromiseIntegration(projectRoot, { startSyncLoop: false });
        
        // Ensure AI Core is initialized
        if (integration.aiCore && integration.aiCore.initialize) {
            await integration.aiCore.initialize();
        }
        
        // Call afterAIAction to record the fix
        const afterResult = integration.afterAIAction(action, result);
        
        console.log('Fix recorded:', JSON.stringify({
            action: action.issueType,
            fixMethod: result.fixMethod,
            success: result.success,
            afterResult: afterResult
        }, null, 2));
        
        // Wait a moment for async operations
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        console.log('Fix attempt has been recorded in the learning system');
        process.exit(0);
    } catch (error) {
        console.error('Error recording fix:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
})();
