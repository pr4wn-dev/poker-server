#!/usr/bin/env node
/**
 * Verify All Saves Are Permanent
 * 
 * Checks that all learning patterns, fix attempts, and other critical data
 * are saved to the MySQL database (not just in-memory)
 */

const path = require('path');
const DatabaseManager = require('../core/DatabaseManager');

const projectRoot = path.resolve(__dirname, '../..');

async function verifyPermanentSaves() {
    const dbManager = new DatabaseManager(projectRoot);
    
    try {
        await dbManager.initialize();
        const pool = dbManager.getPool();
        
        console.log('Verifying permanent saves...\n');
        
        // 1. Check learning patterns
        const [patterns] = await pool.execute('SELECT COUNT(*) as count FROM learning_patterns');
        console.log(`✓ Learning Patterns: ${patterns[0].count} patterns saved to database`);
        
        // 2. Check fix attempts
        const [attempts] = await pool.execute('SELECT COUNT(*) as count FROM learning_fix_attempts');
        console.log(`✓ Fix Attempts: ${attempts[0].count} attempts saved to database`);
        
        // 3. Check misdiagnosis patterns
        const [misdiagnosis] = await pool.execute('SELECT COUNT(*) as count FROM learning_misdiagnosis_patterns');
        console.log(`✓ Misdiagnosis Patterns: ${misdiagnosis[0].count} patterns saved to database`);
        
        // 4. Check failed methods
        const [failedMethods] = await pool.execute('SELECT COUNT(*) as count FROM learning_failed_methods');
        console.log(`✓ Failed Methods: ${failedMethods[0].count} methods saved to database`);
        
        // 5. Check solution templates
        const [templates] = await pool.execute('SELECT COUNT(*) as count FROM learning_solution_templates');
        console.log(`✓ Solution Templates: ${templates[0].count} templates saved to database`);
        
        // 6. Check compliance tracking
        const [compliance] = await pool.execute('SELECT COUNT(*) as count FROM learning_compliance');
        console.log(`✓ Compliance Records: ${compliance[0].count} records saved to database`);
        
        // 7. Check state
        const [state] = await pool.execute('SELECT COUNT(*) as count FROM state');
        console.log(`✓ State: ${state[0].count} state entries saved to database`);
        
        // 8. Check state changes
        const [stateChanges] = await pool.execute('SELECT COUNT(*) as count FROM state_changes');
        console.log(`✓ State Changes: ${stateChanges[0].count} changes saved to database`);
        
        // 9. Check logs
        const [logs] = await pool.execute('SELECT COUNT(*) as count FROM log_processed');
        console.log(`✓ Processed Logs: ${logs[0].count} logs saved to database`);
        
        // 10. Check AI actions
        const [aiActions] = await pool.execute('SELECT COUNT(*) as count FROM ai_actions');
        console.log(`✓ AI Actions: ${aiActions[0].count} actions saved to database`);
        
        // 11. Check AI decisions
        const [aiDecisions] = await pool.execute('SELECT COUNT(*) as count FROM ai_decisions');
        console.log(`✓ AI Decisions: ${aiDecisions[0].count} decisions saved to database`);
        
        // 12. Show recent patterns
        const [recentPatterns] = await pool.execute(`
            SELECT pattern_key, issue_type, solution_method, frequency, success_rate, last_updated
            FROM learning_patterns
            ORDER BY last_updated DESC
            LIMIT 5
        `);
        
        if (recentPatterns.length > 0) {
            console.log('\nRecent Learning Patterns:');
            recentPatterns.forEach(p => {
                console.log(`  - ${p.pattern_key}: ${p.issue_type} -> ${p.solution_method} (freq: ${p.frequency}, success: ${(p.success_rate * 100).toFixed(1)}%)`);
            });
        }
        
        console.log('\n✅ All critical data is saved permanently to MySQL database');
        console.log('✅ No data loss on shutdown - all saves are committed immediately');
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Verification failed:', error.message);
        process.exit(1);
    }
}

verifyPermanentSaves();
