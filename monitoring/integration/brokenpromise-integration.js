#!/usr/bin/env node
/**
 * Monitor Integration CLI
 * 
 * Command-line interface for PowerShell monitor to interact with AI core
 */

const path = require('path');
const BrokenPromiseIntegration = require('./BrokenPromiseIntegration');
const gameLogger = require('../../src/utils/GameLogger');

// Get project root (parent of monitoring directory)
const projectRoot = path.resolve(__dirname, '../..');

// Initialize integration (CLI mode - don't start sync loop, allow process to exit)
const integration = new BrokenPromiseIntegration(projectRoot, { startSyncLoop: false });

// Handle command line arguments
const command = process.argv[2];
const args = process.argv.slice(3);

// Commands that need longer timeout (startup tests, initialization)
// AI Core initialization can take 20-30s when loading large state files (7.7MB+)
const longTimeoutCommands = ['get-status-report', 'query', 'get-live-statistics'];
const timeoutMs = longTimeoutCommands.includes(command) ? 30000 : 5000; // 30s for startup tests, 5s for others

// Set a global timeout to force exit if command takes too long
const globalTimeout = setTimeout(() => {
    // All errors go to gameLogger - BrokenPromise sees everything
    gameLogger.error('MONITORING', '[MONITOR_INTEGRATION_CLI] Command timeout', {
        command: command,
        timeout: `${timeoutMs}ms`
    });
    // Output JSON error for CLI (PowerShell needs this)
    console.log(JSON.stringify({ error: 'Command timed out', command, timeout: timeoutMs }));
    if (integration && integration.aiCore) {
        try {
            integration.aiCore.destroy();
        } catch (e) {
            // Ignore cleanup errors
        }
    }
    process.exit(1);
}, timeoutMs);

async function handleCommand() {
    try {
        switch (command) {
            case 'should-start-investigation':
                const investigationDecision = integration.shouldStartInvestigation();
                console.log(JSON.stringify(investigationDecision));
                break;
                
            case 'should-pause-unity':
                const pauseDecision = integration.shouldPauseUnity();
                console.log(JSON.stringify(pauseDecision));
                break;
                
            case 'should-resume-unity':
                const resumeDecision = integration.shouldResumeUnity();
                console.log(JSON.stringify(resumeDecision));
                break;
                
            case 'should-start-server':
                const serverDecision = integration.shouldStartServer();
                console.log(JSON.stringify(serverDecision));
                break;
                
            case 'should-start-unity':
                const unityStartDecision = integration.shouldStartUnity();
                console.log(JSON.stringify(unityStartDecision));
                break;
                
            case 'should-start-simulation':
                const simDecision = integration.shouldStartSimulation();
                console.log(JSON.stringify(simDecision));
                break;
                
            case 'get-investigation-status':
                const investigationStatus = integration.getInvestigationStatus();
                // Use stdout.write to ensure output is flushed
                process.stdout.write(JSON.stringify(investigationStatus) + '\n');
                break;
                
            case 'start-investigation':
                const startResult = integration.startInvestigation();
                console.log(JSON.stringify(startResult));
                break;
                
            case 'complete-investigation':
                const completeResult = integration.completeInvestigation();
                console.log(JSON.stringify(completeResult));
                break;
                
            case 'detect-issue':
                const logLine = args.join(' ');
                if (!logLine) {
                    gameLogger.error('MONITORING', '[MONITOR_INTEGRATION_CLI] Missing logLine', {
                        command: 'detect-issue'
                    });
                    console.log(JSON.stringify({ error: 'logLine required' }));
                    process.exit(1);
                }
                const detected = integration.detectIssue(logLine);
                console.log(JSON.stringify(detected || { issue: null }));
                break;
                
            case 'add-issue':
                const issueDataJson = args.join(' ');
                if (!issueDataJson) {
                    gameLogger.error('MONITORING', '[MONITOR_INTEGRATION_CLI] Missing issueData', {
                        command: 'add-issue'
                    });
                    console.log(JSON.stringify({ error: 'issueData JSON required' }));
                    process.exit(1);
                }
                try {
                    const issueData = JSON.parse(issueDataJson);
                    const addResult = integration.addIssue(issueData);
                    console.log(JSON.stringify(addResult));
                } catch (error) {
                    gameLogger.error('MONITORING', '[MONITOR_INTEGRATION_CLI] Invalid JSON', {
                        command: 'add-issue',
                        error: error.message
                    });
                    console.log(JSON.stringify({ error: 'Invalid JSON', details: error.message }));
                    process.exit(1);
                }
                break;
                
            case 'add-issue-file':
                const fs = require('fs');
                const issueFilePath = args[0];
                if (!issueFilePath) {
                    gameLogger.error('MONITORING', '[MONITOR_INTEGRATION_CLI] Missing file path', {
                        command: 'add-issue-file'
                    });
                    console.log(JSON.stringify({ error: 'issue file path required' }));
                    process.exit(1);
                }
                try {
                    const fileContent = fs.readFileSync(issueFilePath, 'utf8');
                    const issueData = JSON.parse(fileContent);
                    const addResult = integration.addIssue(issueData);
                    console.log(JSON.stringify(addResult));
                    // Clean up temp file
                    try {
                        fs.unlinkSync(issueFilePath);
                    } catch (e) {
                        // Ignore cleanup errors
                    }
                } catch (error) {
                    gameLogger.error('MONITORING', '[MONITOR_INTEGRATION_CLI] File read error', {
                        command: 'add-issue-file',
                        error: error.message
                    });
                    console.log(JSON.stringify({ error: 'Failed to read or parse issue file', details: error.message }));
                    process.exit(1);
                }
                break;
                
            case 'get-active-issues':
                const issues = integration.getActiveIssues();
                console.log(JSON.stringify(issues));
                break;
                
            case 'get-suggested-fixes':
                const issueId = args[0];
                if (!issueId) {
                    gameLogger.error('MONITORING', '[MONITOR_INTEGRATION_CLI] Missing issueId', {
                        command: 'get-suggested-fixes'
                    });
                    console.log(JSON.stringify({ error: 'issueId required' }));
                    process.exit(1);
                }
                const fixes = integration.getSuggestedFixes(issueId);
                console.log(JSON.stringify(fixes));
                break;
                
            case 'record-fix-attempt':
                const [issueId2, fixMethod, result] = args;
                if (!issueId2 || !fixMethod || !result) {
                    gameLogger.error('MONITORING', '[MONITOR_INTEGRATION_CLI] Missing required args', {
                        command: 'record-fix-attempt',
                        provided: { issueId: !!issueId2, fixMethod: !!fixMethod, result: !!result }
                    });
                    console.log(JSON.stringify({ error: 'issueId, fixMethod, and result required' }));
                    process.exit(1);
                }
                const fixDetails = args[3] ? JSON.parse(args[3]) : {};
                const attempt = integration.recordFixAttempt(issueId2, fixMethod, fixDetails, result);
                console.log(JSON.stringify(attempt));
                break;
                
            case 'get-live-statistics':
                const stats = integration.getLiveStatistics();
                console.log(JSON.stringify(stats));
                break;
                
            case 'get-formatted-statistics':
                const formattedStats = integration.getFormattedStatistics();
                console.log(JSON.stringify(formattedStats));
                break;
                
            case 'update-monitor-status':
                const status = integration.updateMonitorStatus();
                console.log(JSON.stringify(status));
                break;
                
            case 'query':
                const question = args.join(' ');
                if (!question) {
                    gameLogger.error('MONITORING', '[MONITOR_INTEGRATION_CLI] Missing question', {
                        command: 'query'
                    });
                    console.log(JSON.stringify({ error: 'question required' }));
                    process.exit(1);
                }
                const answer = integration.query(question);
                console.log(JSON.stringify(answer));
                break;
                
            case 'get-status-report':
                const report = integration.getStatusReport();
                console.log(JSON.stringify(report));
                break;
                
            case 'get-issue':
                const issueId3 = args[0];
                if (!issueId3) {
                    gameLogger.error('MONITORING', '[MONITOR_INTEGRATION_CLI] Missing issueId', {
                        command: 'get-issue'
                    });
                    console.log(JSON.stringify({ error: 'issueId required' }));
                    process.exit(1);
                }
                const issue = integration.getIssue(issueId3);
                console.log(JSON.stringify(issue || { error: 'Issue not found' }));
                break;
                
            case 'get-system-report':
                const systemReport = integration.getSystemReport();
                console.log(JSON.stringify(systemReport));
                break;
                
            case 'get-component-health':
                const health = integration.getComponentHealth();
                console.log(JSON.stringify(health));
                break;
                
            case 'attempt-auto-fix':
                const issueId4 = args[0];
                if (!issueId4) {
                    gameLogger.error('MONITORING', '[MONITOR_INTEGRATION_CLI] Missing issueId', {
                        command: 'attempt-auto-fix'
                    });
                    console.log(JSON.stringify({ error: 'issueId required' }));
                    process.exit(1);
                }
                const fixResult = await integration.attemptAutoFix(issueId4);
                console.log(JSON.stringify(fixResult));
                break;
                
            case 'get-auto-fix-statistics':
                const autoFixStats = integration.getAutoFixStatistics();
                console.log(JSON.stringify(autoFixStats));
                break;
                
            case 'get-auto-fix-suggestions':
                const issueId5 = args[0];
                if (!issueId5) {
                    gameLogger.error('MONITORING', '[MONITOR_INTEGRATION_CLI] Missing issueId', {
                        command: 'get-auto-fix-suggestions'
                    });
                    console.log(JSON.stringify({ error: 'issueId required' }));
                    process.exit(1);
                }
                const suggestions = integration.getAutoFixSuggestions(issueId5);
                console.log(JSON.stringify(suggestions));
                break;
                
            case 'set-auto-fix-enabled':
                const enabled = args[0] === 'true' || args[0] === '1';
                integration.setAutoFixEnabled(enabled);
                console.log(JSON.stringify({ success: true, enabled }));
                break;
                
            case 'get-latest-prompt':
                const prompt = integration.getLatestPrompt();
                console.log(JSON.stringify(prompt || { error: 'No prompt available' }));
                break;
                
            case 'mark-prompt-delivered':
                const promptId = args[0];
                if (!promptId) {
                    gameLogger.error('MONITORING', '[MONITOR_INTEGRATION_CLI] Missing promptId', {
                        command: 'mark-prompt-delivered'
                    });
                    console.log(JSON.stringify({ error: 'promptId required' }));
                    process.exit(1);
                }
                integration.markPromptDelivered(promptId);
                console.log(JSON.stringify({ success: true, promptId }));
                break;
                
            case 'get-compliance-verification':
                const promptId2 = args[0];
                if (!promptId2) {
                    gameLogger.error('MONITORING', '[MONITOR_INTEGRATION_CLI] Missing promptId', {
                        command: 'get-compliance-verification'
                    });
                    console.log(JSON.stringify({ error: 'promptId required' }));
                    process.exit(1);
                }
                const verification = integration.getComplianceVerification(promptId2);
                console.log(JSON.stringify(verification || { error: 'Verification not found' }));
                break;
                
            default:
                gameLogger.warn('MONITORING', '[MONITOR_INTEGRATION_CLI] Unknown command', {
                    command: command
                });
                // Output JSON error with available commands
                console.log(JSON.stringify({
                    error: `Unknown command: ${command}`,
                    availableCommands: [
                        'should-start-investigation',
                        'should-pause-unity',
                        'should-resume-unity',
                        'should-start-server',
                        'should-start-unity',
                        'should-start-simulation',
                        'get-investigation-status',
                        'start-investigation',
                        'complete-investigation',
                        'detect-issue <logLine>',
                        'get-active-issues',
                        'get-suggested-fixes <issueId>',
                        'record-fix-attempt <issueId> <fixMethod> <result> [fixDetails]',
                        'get-live-statistics',
                        'get-formatted-statistics',
                        'update-monitor-status',
                        'query <question>',
                        'get-status-report',
                        'get-issue <issueId>',
                        'get-system-report',
                        'get-component-health',
                        'attempt-auto-fix <issueId>',
                        'get-auto-fix-statistics',
                        'get-auto-fix-suggestions <issueId>',
                        'set-auto-fix-enabled <true|false>',
                        'get-latest-prompt',
                        'mark-prompt-delivered <promptId>'
                    ]
                }));
                process.exit(1);
        }
    } catch (error) {
        // All errors go to gameLogger - BrokenPromise sees everything
        gameLogger.error('MONITORING', '[MONITOR_INTEGRATION_CLI] Command error', {
            command: command,
            error: error.message,
            stack: error.stack
        });
        // Output JSON error for CLI (PowerShell needs this)
        console.log(JSON.stringify({ error: error.message, stack: error.stack }));
        process.exit(1);
    }
}

handleCommand().then(() => {
    // Cleanup before exiting
    clearTimeout(globalTimeout);
    if (integration) {
        // Destroy integration (stops all intervals)
        integration.destroy();
    }
    // CRITICAL: Force exit after cleanup - don't wait for intervals
    // Use setImmediate to allow destroy() to complete, then force exit
    setImmediate(() => {
        // Force exit - intervals may keep process alive otherwise
        process.exit(0);
    });
}).catch(error => {
    clearTimeout(globalTimeout);
    if (integration) {
        // Destroy integration even on error
        integration.destroy();
    }
    // All errors go to gameLogger - BrokenPromise sees everything
    gameLogger.error('MONITORING', '[MONITOR_INTEGRATION_CLI] Fatal error', {
        error: error.message,
        stack: error.stack
    });
    // Output JSON error for CLI (PowerShell needs this)
    console.log(JSON.stringify({ error: 'Fatal error', message: error.message, stack: error.stack }));
    // CRITICAL: Force exit after cleanup
    setImmediate(() => {
        process.exit(1);
    });
});
