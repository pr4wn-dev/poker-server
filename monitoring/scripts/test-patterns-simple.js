#!/usr/bin/env node
/**
 * Simple test of learning patterns system
 */

const DatabaseManager = require('../core/DatabaseManager');
const path = require('path');

const projectRoot = path.resolve(__dirname, '../..');

(async () => {
    console.log('=== Learning Patterns System Test ===\n');
    
    const dbManager = new DatabaseManager(projectRoot);
    await dbManager.initialize();
    const pool = dbManager.getPool();
    
    // Get statistics
    const [stats] = await pool.execute(`
        SELECT 
            COUNT(*) as total_patterns, 
            COUNT(DISTINCT issue_type) as unique_issues, 
            SUM(frequency) as total_uses,
            AVG(success_rate) as avg_success_rate
        FROM learning_patterns
    `);
    
    console.log('=== Statistics ===');
    console.log('Total patterns:', stats[0].total_patterns);
    console.log('Unique issue types:', stats[0].unique_issues);
    console.log('Total uses:', stats[0].total_uses);
    console.log('Average success rate:', (stats[0].avg_success_rate * 100).toFixed(1) + '%');
    
    // Get recent patterns
    const [recent] = await pool.execute(`
        SELECT issue_type, solution_method, frequency, success_rate, last_updated 
        FROM learning_patterns 
        ORDER BY last_updated DESC 
        LIMIT 5
    `);
    
    console.log('\n=== Most Recent Patterns ===');
    recent.forEach(p => {
        const date = new Date(parseInt(p.last_updated));
        console.log(`  ${p.issue_type} -> ${p.solution_method}`);
        console.log(`    Frequency: ${p.frequency}, Success: ${(p.success_rate * 100).toFixed(1)}%, Updated: ${date.toISOString()}`);
    });
    
    // Get recent fix attempts
    const [attempts] = await pool.execute(`
        SELECT issue_type, fix_method, result, timestamp 
        FROM learning_fix_attempts 
        ORDER BY timestamp DESC 
        LIMIT 5
    `);
    
    console.log('\n=== Most Recent Fix Attempts ===');
    attempts.forEach(a => {
        const date = new Date(parseInt(a.timestamp));
        console.log(`  ${a.issue_type} -> ${a.fix_method} (${a.result}) at ${date.toISOString()}`);
    });
    
    // Check if patterns match attempts
    console.log('\n=== Pattern-Attempt Correlation ===');
    const [correlation] = await pool.execute(`
        SELECT 
            lp.issue_type,
            lp.solution_method,
            lp.frequency as pattern_frequency,
            COUNT(la.id) as attempt_count,
            SUM(CASE WHEN la.result = 'success' THEN 1 ELSE 0 END) as success_count
        FROM learning_patterns lp
        LEFT JOIN learning_fix_attempts la 
            ON lp.issue_type = la.issue_type 
            AND lp.solution_method = la.fix_method
        GROUP BY lp.issue_type, lp.solution_method, lp.frequency
        ORDER BY lp.last_updated DESC
        LIMIT 5
    `);
    
    correlation.forEach(c => {
        console.log(`  ${c.issue_type} -> ${c.solution_method}`);
        console.log(`    Pattern frequency: ${c.pattern_frequency}, Attempts: ${c.attempt_count}, Successes: ${c.success_count}`);
    });
    
    console.log('\n=== Test Complete ===');
    console.log('Learning patterns system is operational!');
    process.exit(0);
})().catch(error => {
    console.error('Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
});
