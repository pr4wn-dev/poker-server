#!/usr/bin/env node
/**
 * Monitor Integration CLI
 * 
 * Command-line interface for PowerShell monitor to interact with AI core
 */

const path = require('path');
const CerberusIntegration = require('./CerberusIntegration');
const gameLogger = require('../../src/utils/GameLogger');

// Get project root (parent of monitoring directory)
const projectRoot = path.resolve(__dirname, '../..');

// Initialize integration (CLI mode - don't start sync loop, allow process to exit)
const integration = new CerberusIntegration(projectRoot, { startSyncLoop: false });

// Handle command line arguments
const command = process.argv[2];
const args = process.argv.slice(3);

// Set a global timeout to force exit if command takes too long (5 seconds max)
const globalTimeout = setTimeout(() => {
    const errorMsg = 'Error: Command timed out';
    console.error(errorMsg); // CLI user feedback
    gameLogger.error('MONITORING', '[MONITOR_INTEGRATION_CLI] Command timeout', {
        command: command,
        timeout: '5000ms'
    });
    if (integration && integration.aiCore) {
        try {
            integration.aiCore.destroy();
        } catch (e) {
            // Ignore cleanup errors
        }
    }
    process.exit(1);
}, 5000);

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
                    console.error('Error: logLine required'); // CLI user feedback
                    gameLogger.error('MONITORING', '[MONITOR_INTEGRATION_CLI] Missing logLine', {
                        command: 'detect-issue'
                    });
                    process.exit(1);
                }
                const detected = integration.detectIssue(logLine);
                console.log(JSON.stringify(detected || { issue: null }));
                break;
                
            case 'add-issue':
                const issueDataJson = args.join(' ');
                if (!issueDataJson) {
                    console.error('Error: issueData JSON required'); // CLI user feedback
                    gameLogger.error('MONITORING', '[MONITOR_INTEGRATION_CLI] Missing issueData', {
                        command: 'add-issue'
                    });
                    process.exit(1);
                }
                try {
                    const issueData = JSON.parse(issueDataJson);
                    const addResult = integration.addIssue(issueData);
                    console.log(JSON.stringify(addResult));
                } catch (error) {
                    console.error('Error: Invalid JSON'); // CLI user feedback
                    gameLogger.error('MONITORING', '[MONITOR_INTEGRATION_CLI] Invalid JSON', {
                        command: 'add-issue',
                        error: error.message
                    });
                    process.exit(1);
                }
                break;
                
            case 'add-issue-file':
                const fs = require('fs');
                const issueFilePath = args[0];
                if (!issueFilePath) {
                    console.error('Error: issue file path required'); // CLI user feedback
                    gameLogger.error('MONITORING', '[MONITOR_INTEGRATION_CLI] Missing file path', {
                        command: 'add-issue-file'
                    });
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
                    console.error('Error: Failed to read or parse issue file'); // CLI user feedback
                    gameLogger.error('MONITORING', '[MONITOR_INTEGRATION_CLI] File read error', {
                        command: 'add-issue-file',
                        error: error.message
                    });
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
                    console.error('Error: issueId required'); // CLI user feedback
                    gameLogger.error('MONITORING', '[MONITOR_INTEGRATION_CLI] Missing issueId', {
                        command: 'get-suggested-fixes'
                    });
                    process.exit(1);
                }
                const fixes = integration.getSuggestedFixes(issueId);
                console.log(JSON.stringify(fixes));
                break;
                
            case 'record-fix-attempt':
                const [issueId2, fixMethod, result] = args;
                if (!issueId2 || !fixMethod || !result) {
                    console.error('Error: issueId, fixMethod, and result required'); // CLI user feedback
                    gameLogger.error('MONITORING', '[MONITOR_INTEGRATION_CLI] Missing required args', {
                        command: 'record-fix-attempt',
                        provided: { issueId: !!issueId2, fixMethod: !!fixMethod, result: !!result }
                    });
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
                    console.error('Error: question required'); // CLI user feedback
                    gameLogger.error('MONITORING', '[MONITOR_INTEGRATION_CLI] Missing question', {
                        command: 'query'
                    });
                    process.exit(1);
                }
                const answer = integration.query(question);
                console.log(JSON.stringify(answer));
                break;
                
            case 'get-status-report':
                const report = integration.getStatusReport();
                console.log(JSON.stringify(report));
                break;
                
            default:
                console.error(`Unknown command: ${command}`); // CLI user feedback
                gameLogger.warn('MONITORING', '[MONITOR_INTEGRATION_CLI] Unknown command', {
                    command: command
                });
                console.log('Available commands:');
                console.log('  should-start-investigation');
                console.log('  should-pause-unity');
                console.log('  should-resume-unity');
                console.log('  get-investigation-status');
                console.log('  start-investigation');
                console.log('  complete-investigation');
                console.log('  detect-issue <logLine>');
                console.log('  get-active-issues');
                console.log('  get-suggested-fixes <issueId>');
                console.log('  record-fix-attempt <issueId> <fixMethod> <result> [fixDetails]');
                console.log('  get-live-statistics');
                console.log('  get-formatted-statistics');
                console.log('  update-monitor-status');
                console.log('  query <question>');
                console.log('  get-status-report');
                process.exit(1);
        }
    } catch (error) {
        console.error('Error:', error.message); // CLI user feedback
        console.error(error.stack); // CLI user feedback
        gameLogger.error('MONITORING', '[MONITOR_INTEGRATION_CLI] Command error', {
            command: command,
            error: error.message,
            stack: error.stack
        });
        process.exit(1);
    }
}

handleCommand().then(() => {
    // Cleanup before exiting
    clearTimeout(globalTimeout);
    if (integration && integration.aiCore) {
        integration.aiCore.destroy();
    }
    // Small delay to allow cleanup to complete
    setTimeout(() => {
        process.exit(0);
    }, 100);
}).catch(error => {
    clearTimeout(globalTimeout);
    if (integration && integration.aiCore) {
        integration.aiCore.destroy();
    }
    console.error('Fatal error:', error); // CLI user feedback
    gameLogger.error('MONITORING', '[MONITOR_INTEGRATION_CLI] Fatal error', {
        error: error.message,
        stack: error.stack
    });
    setTimeout(() => {
        process.exit(1);
    }, 100);
});
