/**
 * Check Before Fix
 * 
 * Warns if you're about to try something that failed before
 * 
 * Usage:
 *   node simple/check-before-fix.js "pot not cleared" "clear pot at hand start"
 */

const fs = require('fs');
const path = require('path');

const HISTORY_FILE = path.join(__dirname, 'fix-history.json');

function loadHistory() {
    if (!fs.existsSync(HISTORY_FILE)) {
        return {};
    }
    try {
        return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
    } catch (e) {
        return {};
    }
}

function checkBeforeFix(issue, fixAttempt) {
    const history = loadHistory();
    
    if (!history[issue]) {
        console.log(JSON.stringify({
            warning: false,
            message: "No previous attempts for this issue - safe to try"
        }, null, 2));
        return;
    }
    
    const issueData = history[issue];
    
    // Check if this exact fix was tried before
    const exactMatch = issueData.attempts.find(a => 
        a.fixAttempt.toLowerCase() === fixAttempt.toLowerCase()
    );
    
    if (exactMatch) {
        if (!exactMatch.success) {
            console.log(JSON.stringify({
                warning: true,
                severity: 'HIGH',
                message: `⚠️  WARNING: This exact fix was tried before and FAILED`,
                previousAttempt: {
                    fixAttempt: exactMatch.fixAttempt,
                    success: false,
                    timestamp: exactMatch.timestamp
                },
                recommendation: "Try a different approach - this one didn't work"
            }, null, 2));
            return;
        } else {
            console.log(JSON.stringify({
                warning: false,
                message: `This fix was tried before and SUCCEEDED`,
                previousAttempt: {
                    fixAttempt: exactMatch.fixAttempt,
                    success: true,
                    timestamp: exactMatch.timestamp
                }
            }, null, 2));
            return;
        }
    }
    
    // Check for similar failed attempts
    const similarFailures = issueData.attempts
        .filter(a => !a.success && 
            (a.fixAttempt.toLowerCase().includes(fixAttempt.toLowerCase().substring(0, 10)) ||
             fixAttempt.toLowerCase().includes(a.fixAttempt.toLowerCase().substring(0, 10))))
        .slice(-3);
    
    if (similarFailures.length > 0) {
        console.log(JSON.stringify({
            warning: true,
            severity: 'MEDIUM',
            message: `⚠️  WARNING: Similar fixes were tried before and FAILED`,
            similarFailures: similarFailures.map(f => ({
                fixAttempt: f.fixAttempt,
                timestamp: f.timestamp
            })),
            recommendation: "Be careful - similar approaches didn't work"
        }, null, 2));
        return;
    }
    
    // Show what worked before
    const successfulAttempts = issueData.attempts
        .filter(a => a.success)
        .slice(-3);
    
    if (successfulAttempts.length > 0) {
        console.log(JSON.stringify({
            warning: false,
            message: "No exact match, but here's what worked before:",
            successfulAttempts: successfulAttempts.map(s => ({
                fixAttempt: s.fixAttempt,
                timestamp: s.timestamp
            }))
        }, null, 2));
        return;
    }
    
    // All attempts failed
    if (issueData.failureCount > 0 && issueData.successCount === 0) {
        console.log(JSON.stringify({
            warning: true,
            severity: 'HIGH',
            message: `⚠️  WARNING: ${issueData.failureCount} attempts failed, none succeeded`,
            recommendation: "Consider a completely different approach"
        }, null, 2));
        return;
    }
    
    console.log(JSON.stringify({
        warning: false,
        message: "No exact match found - safe to try"
    }, null, 2));
}

// Main
const issue = process.argv[2];
const fixAttempt = process.argv[3];

if (!issue || !fixAttempt) {
    console.error('Usage: node check-before-fix.js <issue> <fixAttempt>');
    process.exit(1);
}

checkBeforeFix(issue, fixAttempt);
