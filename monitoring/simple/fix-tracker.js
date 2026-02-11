/**
 * Simple Fix Tracker - MySQL Backend
 * 
 * Uses existing MySQL tables: learning_fix_attempts, learning_failed_methods
 * 
 * Usage:
 *   node simple/fix-tracker.js record "pot not cleared" "clear pot at hand start" false
 *   node simple/fix-tracker.js check "pot not cleared"
 *   node simple/fix-tracker.js list
 */

const path = require('path');
const DatabaseManager = require('../core/DatabaseManager');

const projectRoot = path.resolve(__dirname, '../..');

async function recordFix(issueType, fixMethod, success) {
    const dbManager = new DatabaseManager(projectRoot);
    await dbManager.initialize();
    const pool = dbManager.getPool();
    
    const attemptId = `attempt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const timestamp = Date.now();
    const result = success === 'true' || success === true ? 'success' : 'failure';
    
    try {
        // Record fix attempt
        await pool.execute(`
            INSERT INTO learning_fix_attempts 
            (id, issue_type, fix_method, result, timestamp)
            VALUES (?, ?, ?, ?, ?)
        `, [attemptId, issueType, fixMethod, result, timestamp]);
        
        // Update failed methods if it failed
        if (result === 'failure') {
            await pool.execute(`
                INSERT INTO learning_failed_methods (issue_type, method, frequency, time_wasted, last_attempt)
                VALUES (?, ?, 1, 0, ?)
                ON DUPLICATE KEY UPDATE 
                    frequency = frequency + 1,
                    last_attempt = ?
            `, [issueType, fixMethod, timestamp, timestamp]);
        }
        
        // Get stats
        const [attempts] = await pool.execute(`
            SELECT COUNT(*) as total, 
                   SUM(CASE WHEN result = 'success' THEN 1 ELSE 0 END) as successes
            FROM learning_fix_attempts
            WHERE issue_type = ?
        `, [issueType]);
        
        const stats = attempts[0];
        
        console.log(JSON.stringify({
            recorded: true,
            issueType,
            fixMethod,
            success: result === 'success',
            totalAttempts: stats.total,
            successRate: `${stats.successes}/${stats.total}`
        }, null, 2));
    } finally {
        await dbManager.close();
    }
}

async function checkHistory(issueType) {
    const dbManager = new DatabaseManager(projectRoot);
    await dbManager.initialize();
    const pool = dbManager.getPool();
    
    try {
        // Get recent attempts
        const [attempts] = await pool.execute(`
            SELECT fix_method, result, timestamp
            FROM learning_fix_attempts
            WHERE issue_type = ?
            ORDER BY timestamp DESC
            LIMIT 10
        `, [issueType]);
        
        // Get failed methods
        const [failedMethods] = await pool.execute(`
            SELECT method, frequency, time_wasted
            FROM learning_failed_methods
            WHERE issue_type = ?
            ORDER BY frequency DESC
            LIMIT 5
        `, [issueType]);
        
        // Get stats
        const [stats] = await pool.execute(`
            SELECT COUNT(*) as total,
                   SUM(CASE WHEN result = 'success' THEN 1 ELSE 0 END) as successes,
                   SUM(CASE WHEN result = 'failure' THEN 1 ELSE 0 END) as failures
            FROM learning_fix_attempts
            WHERE issue_type = ?
        `, [issueType]);
        
        const stat = stats[0];
        
        if (stat.total === 0) {
            console.log(JSON.stringify({
                issueType,
                found: false,
                message: "No previous attempts for this issue"
            }, null, 2));
            return;
        }
        
        const recentFailures = attempts
            .filter(a => a.result === 'failure')
            .slice(0, 5)
            .map(a => a.fix_method);
        
        const recentSuccesses = attempts
            .filter(a => a.result === 'success')
            .slice(0, 3)
            .map(a => a.fix_method);
        
        console.log(JSON.stringify({
            issueType,
            found: true,
            totalAttempts: stat.total,
            successCount: stat.successes,
            failureCount: stat.failures,
            successRate: `${stat.successes}/${stat.total}`,
            recentFailures,
            recentSuccesses,
            failedMethods: failedMethods.map(fm => ({
                method: fm.method,
                frequency: fm.frequency
            }))
        }, null, 2));
    } finally {
        await dbManager.close();
    }
}

async function listIssues() {
    const dbManager = new DatabaseManager(projectRoot);
    await dbManager.initialize();
    const pool = dbManager.getPool();
    
    try {
        const [issues] = await pool.execute(`
            SELECT issue_type,
                   COUNT(*) as attempts,
                   SUM(CASE WHEN result = 'success' THEN 1 ELSE 0 END) as successes,
                   MAX(timestamp) as last_attempt
            FROM learning_fix_attempts
            GROUP BY issue_type
            ORDER BY last_attempt DESC
        `);
        
        console.log(JSON.stringify({
            totalIssues: issues.length,
            issues: issues.map(i => ({
                issueType: i.issue_type,
                attempts: i.attempts,
                successRate: `${i.successes}/${i.attempts}`,
                lastAttempt: new Date(parseInt(i.last_attempt)).toISOString()
            }))
        }, null, 2));
    } finally {
        await dbManager.close();
    }
}

// Main
const command = process.argv[2];

if (command === 'record') {
    const issueType = process.argv[3];
    const fixMethod = process.argv[4];
    const success = process.argv[5];
    
    if (!issueType || !fixMethod || success === undefined) {
        console.error('Usage: node fix-tracker.js record <issueType> <fixMethod> <success:true|false>');
        process.exit(1);
    }
    
    recordFix(issueType, fixMethod, success).catch(err => {
        console.error(JSON.stringify({ error: err.message }, null, 2));
        process.exit(1);
    });
} else if (command === 'check') {
    const issueType = process.argv[3];
    
    if (!issueType) {
        console.error('Usage: node fix-tracker.js check <issueType>');
        process.exit(1);
    }
    
    checkHistory(issueType).catch(err => {
        console.error(JSON.stringify({ error: err.message }, null, 2));
        process.exit(1);
    });
} else if (command === 'list') {
    listIssues().catch(err => {
        console.error(JSON.stringify({ error: err.message }, null, 2));
        process.exit(1);
    });
} else {
    console.error('Usage:');
    console.error('  node fix-tracker.js record <issueType> <fixMethod> <success:true|false>');
    console.error('  node fix-tracker.js check <issueType>');
    console.error('  node fix-tracker.js list');
    process.exit(1);
}
