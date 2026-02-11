/**
 * Check Before Fix - MySQL Backend
 * 
 * Warns if you're about to try something that failed before
 * Uses existing MySQL tables: learning_fix_attempts, learning_failed_methods
 * 
 * Usage:
 *   node simple/check-before-fix.js "pot not cleared" "clear pot at hand start"
 */

const path = require('path');
const DatabaseManager = require('../core/DatabaseManager');

const projectRoot = path.resolve(__dirname, '../..');

async function checkBeforeFix(issueType, fixMethod) {
    const dbManager = new DatabaseManager(projectRoot);
    await dbManager.initialize();
    const pool = dbManager.getPool();
    
    try {
        // Check if this exact fix was tried before
        const [exactMatches] = await pool.execute(`
            SELECT result, timestamp
            FROM learning_fix_attempts
            WHERE issue_type = ? AND fix_method = ?
            ORDER BY timestamp DESC
            LIMIT 1
        `, [issueType, fixMethod]);
        
        if (exactMatches.length > 0) {
            const match = exactMatches[0];
            if (match.result === 'failure') {
                console.log(JSON.stringify({
                    warning: true,
                    severity: 'HIGH',
                    message: `⚠️  WARNING: This exact fix was tried before and FAILED`,
                    previousAttempt: {
                        fixMethod: fixMethod,
                        success: false,
                        timestamp: new Date(parseInt(match.timestamp)).toISOString()
                    },
                    recommendation: "Try a different approach - this one didn't work"
                }, null, 2));
                return;
            } else {
                console.log(JSON.stringify({
                    warning: false,
                    message: `This fix was tried before and SUCCEEDED`,
                    previousAttempt: {
                        fixMethod: fixMethod,
                        success: true,
                        timestamp: new Date(parseInt(match.timestamp)).toISOString()
                    }
                }, null, 2));
                return;
            }
        }
        
        // Check for similar failed attempts (substring match)
        const [similarFailures] = await pool.execute(`
            SELECT fix_method, timestamp
            FROM learning_fix_attempts
            WHERE issue_type = ? 
            AND result = 'failure'
            AND (fix_method LIKE ? OR ? LIKE CONCAT('%', fix_method, '%'))
            ORDER BY timestamp DESC
            LIMIT 3
        `, [issueType, `%${fixMethod.substring(0, 10)}%`, fixMethod]);
        
        if (similarFailures.length > 0) {
            console.log(JSON.stringify({
                warning: true,
                severity: 'MEDIUM',
                message: `⚠️  WARNING: Similar fixes were tried before and FAILED`,
                similarFailures: similarFailures.map(f => ({
                    fixMethod: f.fix_method,
                    timestamp: new Date(parseInt(f.timestamp)).toISOString()
                })),
                recommendation: "Be careful - similar approaches didn't work"
            }, null, 2));
            return;
        }
        
        // Check failed methods for this issue type
        const [failedMethods] = await pool.execute(`
            SELECT method, frequency
            FROM learning_failed_methods
            WHERE issue_type = ?
            AND (method LIKE ? OR ? LIKE CONCAT('%', method, '%'))
            ORDER BY frequency DESC
            LIMIT 3
        `, [issueType, `%${fixMethod.substring(0, 10)}%`, fixMethod]);
        
        if (failedMethods.length > 0) {
            console.log(JSON.stringify({
                warning: true,
                severity: 'MEDIUM',
                message: `⚠️  WARNING: Similar methods failed ${failedMethods[0].frequency} time(s)`,
                failedMethods: failedMethods.map(fm => ({
                    method: fm.method,
                    frequency: fm.frequency
                })),
                recommendation: "Consider a different approach"
            }, null, 2));
            return;
        }
        
        // Show what worked before
        const [successfulAttempts] = await pool.execute(`
            SELECT fix_method, timestamp
            FROM learning_fix_attempts
            WHERE issue_type = ? AND result = 'success'
            ORDER BY timestamp DESC
            LIMIT 3
        `, [issueType]);
        
        if (successfulAttempts.length > 0) {
            console.log(JSON.stringify({
                warning: false,
                message: "No exact match, but here's what worked before:",
                successfulAttempts: successfulAttempts.map(s => ({
                    fixMethod: s.fix_method,
                    timestamp: new Date(parseInt(s.timestamp)).toISOString()
                }))
            }, null, 2));
            return;
        }
        
        // Check if all attempts failed
        const [allAttempts] = await pool.execute(`
            SELECT COUNT(*) as total,
                   SUM(CASE WHEN result = 'failure' THEN 1 ELSE 0 END) as failures,
                   SUM(CASE WHEN result = 'success' THEN 1 ELSE 0 END) as successes
            FROM learning_fix_attempts
            WHERE issue_type = ?
        `, [issueType]);
        
        if (allAttempts.length > 0 && allAttempts[0].total > 0) {
            const stats = allAttempts[0];
            if (stats.failures > 0 && stats.successes === 0) {
                console.log(JSON.stringify({
                    warning: true,
                    severity: 'HIGH',
                    message: `⚠️  WARNING: ${stats.failures} attempts failed, none succeeded`,
                    recommendation: "Consider a completely different approach"
                }, null, 2));
                return;
            }
        }
        
        console.log(JSON.stringify({
            warning: false,
            message: "No exact match found - safe to try"
        }, null, 2));
    } finally {
        await dbManager.close();
    }
}

// Main
const issueType = process.argv[2];
const fixMethod = process.argv[3];

if (!issueType || !fixMethod) {
    console.error('Usage: node check-before-fix.js <issueType> <fixMethod>');
    process.exit(1);
}

checkBeforeFix(issueType, fixMethod).catch(err => {
    console.error(JSON.stringify({ error: err.message }, null, 2));
    process.exit(1);
});
