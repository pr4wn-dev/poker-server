#!/usr/bin/env node
/**
 * Monitor Integration CLI
 * 
 * Command-line interface for PowerShell monitor to interact with AI core
 */

const path = require('path');
const MonitorIntegration = require('./MonitorIntegration');

// Get project root (parent of monitoring directory)
const projectRoot = path.resolve(__dirname, '../..');

// Initialize integration
const integration = new MonitorIntegration(projectRoot);

// Handle command line arguments
const command = process.argv[2];
const args = process.argv.slice(3);

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
                console.log(JSON.stringify(investigationStatus));
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
                    console.error('Error: logLine required');
                    process.exit(1);
                }
                const detected = integration.detectIssue(logLine);
                console.log(JSON.stringify(detected || { issue: null }));
                break;
                
            case 'get-active-issues':
                const issues = integration.getActiveIssues();
                console.log(JSON.stringify(issues));
                break;
                
            case 'get-suggested-fixes':
                const issueId = args[0];
                if (!issueId) {
                    console.error('Error: issueId required');
                    process.exit(1);
                }
                const fixes = integration.getSuggestedFixes(issueId);
                console.log(JSON.stringify(fixes));
                break;
                
            case 'record-fix-attempt':
                const [issueId2, fixMethod, result] = args;
                if (!issueId2 || !fixMethod || !result) {
                    console.error('Error: issueId, fixMethod, and result required');
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
                    console.error('Error: question required');
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
                console.error(`Unknown command: ${command}`);
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
        console.error('Error:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

handleCommand().then(() => {
    // Keep process alive briefly to allow output
    setTimeout(() => {
        process.exit(0);
    }, 100);
}).catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
