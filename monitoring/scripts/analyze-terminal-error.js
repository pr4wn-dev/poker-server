#!/usr/bin/env node
/**
 * Analyze Terminal Error
 * 
 * Analyzes terminal command output for errors and generates prompts
 * Usage: node analyze-terminal-error.js "<command>" "<output>" <exitCode>
 */

const path = require('path');
const BrokenPromiseIntegration = require('../integration/BrokenPromiseIntegration');

const projectRoot = path.resolve(__dirname, '../..');

async function analyzeTerminalError() {
    const command = process.argv[2] || '';
    const output = process.argv[3] || '';
    const exitCode = process.argv[4] ? parseInt(process.argv[4]) : 0;
    
    if (!command) {
        console.error('Usage: node analyze-terminal-error.js "<command>" "<output>" <exitCode>');
        process.exit(1);
    }
    
    try {
        const integration = new BrokenPromiseIntegration(projectRoot, { startSyncLoop: false });
        // Initialize AI Core if needed (it's lazy, so accessing aiCore will create it)
        if (integration.aiCore && integration.aiCore.initialize && typeof integration.aiCore.initialize === 'function') {
            await integration.aiCore.initialize();
        }
        
        const errors = await integration.aiCore.monitorTerminalCommand(command, output, exitCode);
        
        if (errors.length > 0) {
            console.log(JSON.stringify({
                success: true,
                errorsDetected: errors.length,
                errors: errors,
                promptFile: path.join(projectRoot, 'logs', 'prompts-for-user.txt')
            }, null, 2));
        } else {
            console.log(JSON.stringify({
                success: true,
                errorsDetected: 0,
                message: 'No errors detected in terminal output'
            }, null, 2));
        }
        
        process.exit(0);
    } catch (error) {
        console.error(JSON.stringify({
            success: false,
            error: error.message,
            stack: error.stack
        }, null, 2));
        process.exit(1);
    }
}

analyzeTerminalError();
