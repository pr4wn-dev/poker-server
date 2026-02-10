#!/usr/bin/env node
/**
 * Check if learning patterns are being updated
 */

const DatabaseManager = require('../core/DatabaseManager');
const path = require('path');

const projectRoot = path.resolve(__dirname, '../..');

(async () => {
    const dm = new DatabaseManager(projectRoot);
    await dm.initialize();
    const pool = dm.getPool();
    
    // Get recent fix attempts
    const [recentAttempts] = await pool.execute(`
        SELECT issue_type, fix_method, result, timestamp 
        FROM learning_fix_attempts 
        ORDER BY timestamp DESC 
        LIMIT 10
    `);
    
    console.log('=== Recent Fix Attempts ===');
    recentAttempts.forEach(a => {
        const date = new Date(parseInt(a.timestamp));
        console.log(`  ${a.issue_type} -> ${a.fix_method} (${a.result}) at ${date.toISOString()}`);
    });
    
    // Get patterns updated in last hour
    const oneHourAgo = Date.now() - 3600000;
    const [newPatterns] = await pool.execute(`
        SELECT pattern_key, issue_type, solution_method, frequency, last_updated 
        FROM learning_patterns 
        WHERE last_updated > ? 
        ORDER BY last_updated DESC
    `, [oneHourAgo]);
    
    console.log('\n=== Patterns Updated in Last Hour ===');
    console.log(`Count: ${newPatterns.length}`);
    if (newPatterns.length > 0) {
        newPatterns.forEach(p => {
            const date = new Date(parseInt(p.last_updated));
            console.log(`  ${p.pattern_key}: ${p.issue_type} -> ${p.solution_method} (freq: ${p.frequency}) updated ${date.toISOString()}`);
        });
    } else {
        console.log('  No patterns updated in the last hour');
    }
    
    // Check if successful attempts are creating patterns
    const [successfulAttempts] = await pool.execute(`
        SELECT issue_type, fix_method, COUNT(*) as count
        FROM learning_fix_attempts 
        WHERE result = 'success' 
        AND timestamp > ?
        GROUP BY issue_type, fix_method
    `, [oneHourAgo]);
    
    console.log('\n=== Successful Attempts in Last Hour ===');
    console.log(`Count: ${successfulAttempts.length}`);
    successfulAttempts.forEach(a => {
        console.log(`  ${a.issue_type} -> ${a.fix_method} (${a.count} attempts)`);
    });
    
    // Check if patterns exist for these successful attempts
    console.log('\n=== Pattern Creation Status ===');
    for (const attempt of successfulAttempts) {
        const [patterns] = await pool.execute(`
            SELECT pattern_key, frequency, last_updated
            FROM learning_patterns
            WHERE issue_type = ? AND solution_method = ?
        `, [attempt.issue_type, attempt.fix_method]);
        
        if (patterns.length > 0) {
            const date = new Date(parseInt(patterns[0].last_updated));
            console.log(`  ✓ Pattern exists: ${attempt.issue_type} -> ${attempt.fix_method} (freq: ${patterns[0].frequency}, updated: ${date.toISOString()})`);
        } else {
            console.log(`  ✗ Pattern MISSING: ${attempt.issue_type} -> ${attempt.fix_method} (${attempt.count} successful attempts but no pattern)`);
        }
    }
    
    process.exit(0);
})().catch(error => {
    console.error('Error:', error.message);
    process.exit(1);
});
