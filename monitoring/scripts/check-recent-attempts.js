#!/usr/bin/env node
const DatabaseManager = require('../core/DatabaseManager');
const path = require('path');

const projectRoot = path.resolve(__dirname, '../..');

(async () => {
    const dm = new DatabaseManager(projectRoot);
    await dm.initialize();
    const pool = dm.getPool();
    
    // Check recent fix attempts
    const [attempts] = await pool.execute(`
        SELECT id, issue_type, fix_method, result, timestamp, details
        FROM learning_fix_attempts 
        WHERE issue_type LIKE '%http%' OR fix_method LIKE '%http%'
        ORDER BY timestamp DESC 
        LIMIT 5
    `);
    
    console.log('Recent HTTP-related fix attempts:');
    console.log(JSON.stringify(attempts, null, 2));
    
    // Check all recent patterns
    const [patterns] = await pool.execute(`
        SELECT pattern_key, issue_type, solution_method, frequency, success_rate, last_updated
        FROM learning_patterns
        ORDER BY last_updated DESC
        LIMIT 10
    `);
    
    console.log('\nMost recent learning patterns:');
    patterns.forEach(p => {
        console.log(`  ${p.pattern_key}: ${p.issue_type} -> ${p.solution_method} (freq: ${p.frequency}, success: ${(p.success_rate * 100).toFixed(1)}%)`);
    });
    
    process.exit(0);
})();
