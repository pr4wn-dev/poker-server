/**
 * Simple Fix Tracker
 * 
 * Tracks: issue -> what was tried -> did it work?
 * 
 * Usage:
 *   node simple/fix-tracker.js record "pot not cleared" "clear pot at hand start" false
 *   node simple/fix-tracker.js check "pot not cleared"
 *   node simple/fix-tracker.js list
 */

const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'fix-history.json');

// Load history
function loadHistory() {
    if (!fs.existsSync(DATA_FILE)) {
        return {};
    }
    try {
        return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch (e) {
        return {};
    }
}

// Save history
function saveHistory(history) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(history, null, 2), 'utf8');
}

// Record a fix attempt
function recordFix(issue, fixAttempt, success) {
    const history = loadHistory();
    
    if (!history[issue]) {
        history[issue] = {
            attempts: [],
            lastAttempt: null,
            successCount: 0,
            failureCount: 0
        };
    }
    
    const entry = {
        fixAttempt,
        success: success === 'true' || success === true,
        timestamp: new Date().toISOString()
    };
    
    history[issue].attempts.push(entry);
    history[issue].lastAttempt = entry;
    
    if (entry.success) {
        history[issue].successCount++;
    } else {
        history[issue].failureCount++;
    }
    
    saveHistory(history);
    
    console.log(JSON.stringify({
        recorded: true,
        issue,
        fixAttempt,
        success: entry.success,
        totalAttempts: history[issue].attempts.length,
        successRate: `${history[issue].successCount}/${history[issue].attempts.length}`
    }, null, 2));
}

// Check what was tried before
function checkHistory(issue) {
    const history = loadHistory();
    
    if (!history[issue]) {
        console.log(JSON.stringify({
            issue,
            found: false,
            message: "No previous attempts for this issue"
        }, null, 2));
        return;
    }
    
    const issueData = history[issue];
    const recentFailures = issueData.attempts
        .filter(a => !a.success)
        .slice(-5)
        .map(a => a.fixAttempt);
    
    const recentSuccesses = issueData.attempts
        .filter(a => a.success)
        .slice(-3)
        .map(a => a.fixAttempt);
    
    console.log(JSON.stringify({
        issue,
        found: true,
        totalAttempts: issueData.attempts.length,
        successCount: issueData.successCount,
        failureCount: issueData.failureCount,
        successRate: `${issueData.successCount}/${issueData.attempts.length}`,
        recentFailures,
        recentSuccesses,
        lastAttempt: issueData.lastAttempt
    }, null, 2));
}

// List all issues
function listIssues() {
    const history = loadHistory();
    const issues = Object.keys(history).map(issue => ({
        issue,
        attempts: history[issue].attempts.length,
        successRate: `${history[issue].successCount}/${history[issue].attempts.length}`,
        lastAttempt: history[issue].lastAttempt?.timestamp
    }));
    
    console.log(JSON.stringify({
        totalIssues: issues.length,
        issues
    }, null, 2));
}

// Main
const command = process.argv[2];

if (command === 'record') {
    const issue = process.argv[3];
    const fixAttempt = process.argv[4];
    const success = process.argv[5];
    
    if (!issue || !fixAttempt || success === undefined) {
        console.error('Usage: node fix-tracker.js record <issue> <fixAttempt> <success:true|false>');
        process.exit(1);
    }
    
    recordFix(issue, fixAttempt, success);
} else if (command === 'check') {
    const issue = process.argv[3];
    
    if (!issue) {
        console.error('Usage: node fix-tracker.js check <issue>');
        process.exit(1);
    }
    
    checkHistory(issue);
} else if (command === 'list') {
    listIssues();
} else {
    console.error('Usage:');
    console.error('  node fix-tracker.js record <issue> <fixAttempt> <success:true|false>');
    console.error('  node fix-tracker.js check <issue>');
    console.error('  node fix-tracker.js list');
    process.exit(1);
}
