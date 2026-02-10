#!/usr/bin/env node
/**
 * Verify workflow test results
 */

const DatabaseManager = require('../core/DatabaseManager');
const path = require('path');

const projectRoot = path.resolve(__dirname, '../..');

(async () => {
    const dm = new DatabaseManager(projectRoot);
    await dm.initialize();
    const pool = dm.getPool();
    
    const [attempts] = await pool.execute(
        'SELECT issue_type, fix_method, result, timestamp FROM learning_fix_attempts WHERE issue_type = ? ORDER BY timestamp DESC LIMIT 1',
        ['test_workflow_issue']
    );
    
    const [patterns] = await pool.execute(
        'SELECT pattern_key, frequency, success_rate FROM learning_patterns WHERE issue_type = ? AND solution_method = ?',
        ['test_workflow_issue', 'test_workflow_fix']
    );
    
    console.log('=== Workflow Test Results ===');
    if (attempts.length > 0) {
        console.log('✓ Fix attempt recorded:', attempts[0].issue_type, '->', attempts[0].fix_method, '(', attempts[0].result, ')');
    } else {
        console.log('✗ Fix attempt NOT recorded');
    }
    
    if (patterns.length > 0) {
        console.log('✓ Pattern created:', patterns[0].pattern_key, '(freq:', patterns[0].frequency + ', success:', (patterns[0].success_rate * 100).toFixed(1) + '%)');
    } else {
        console.log('✗ Pattern NOT created');
    }
    
    process.exit(0);
})().catch(error => {
    console.error('Error:', error.message);
    process.exit(1);
});
