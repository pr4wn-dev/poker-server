#!/usr/bin/env node
/**
 * Query Learning Patterns Directly from Database
 * 
 * Lightweight script that queries database directly without loading full AIMonitorCore
 */

const path = require('path');
const DatabaseManager = require('../core/DatabaseManager');

const projectRoot = path.resolve(__dirname, '../..');

async function queryPatterns(errorMessage, issueType, component) {
    const dbManager = new DatabaseManager(projectRoot);
    
    try {
        await dbManager.initialize();
        const pool = dbManager.getPool();
        
        console.log(`\n[LEARNING SYSTEM] Querying patterns for:`);
        console.log(`  Issue Type: ${issueType || 'error'}`);
        console.log(`  Component: ${component || 'unknown'}`);
        console.log(`  Error: ${errorMessage.substring(0, 80)}...`);
        
        // Query misdiagnosis patterns
        const [misdiagnosisPatterns] = await pool.execute(`
            SELECT * FROM learning_misdiagnosis_patterns 
            WHERE (symptom LIKE ? OR issue_type = ? OR component = ?)
            ORDER BY frequency DESC, time_wasted DESC
            LIMIT 5
        `, [`%${errorMessage.substring(0, 50)}%`, issueType || '', component || '']);
        
        // Query solution patterns
        const [solutionPatterns] = await pool.execute(`
            SELECT * FROM learning_patterns 
            WHERE issue_type = ? OR solution_method LIKE ?
            ORDER BY success_rate DESC, frequency DESC
            LIMIT 5
        `, [issueType || '', `%${issueType || ''}%`]);
        
        // Query failed methods
        const [failedMethods] = await pool.execute(`
            SELECT * FROM learning_failed_methods 
            WHERE issue_type = ?
            ORDER BY frequency DESC, time_wasted DESC
            LIMIT 5
        `, [issueType || '']);
        
        console.log(`\n[MISDIAGNOSIS PREVENTION]`);
        if (misdiagnosisPatterns.length > 0) {
            misdiagnosisPatterns.forEach((pattern, i) => {
                console.log(`\n  ${i + 1}. ${pattern.issue_type || 'Unknown'}`);
                console.log(`     Common Misdiagnosis: ${pattern.common_misdiagnosis}`);
                console.log(`     Actual Root Cause: ${pattern.actual_root_cause}`);
                console.log(`     Correct Approach: ${pattern.correct_approach}`);
                console.log(`     Frequency: ${pattern.frequency}, Time Wasted: ${Math.round(pattern.time_wasted / 1000 / 60)} min`);
            });
        } else {
            console.log(`  No misdiagnosis patterns found`);
        }
        
        console.log(`\n[SOLUTION PATTERNS]`);
        if (solutionPatterns.length > 0) {
            solutionPatterns.forEach((pattern, i) => {
                console.log(`\n  ${i + 1}. ${pattern.issue_type || 'Unknown'}`);
                console.log(`     Solution Method: ${pattern.solution_method}`);
                console.log(`     Success Rate: ${(pattern.success_rate * 100).toFixed(1)}%`);
                console.log(`     Frequency: ${pattern.frequency}`);
                if (pattern.solutions) {
                    try {
                        const solutions = JSON.parse(pattern.solutions);
                        if (Array.isArray(solutions)) {
                            solutions.forEach((sol, j) => {
                                console.log(`       ${j + 1}. ${sol}`);
                            });
                        }
                    } catch (e) {
                        // Not JSON, just print
                    }
                }
            });
        } else {
            console.log(`  No solution patterns found`);
        }
        
        console.log(`\n[WHAT NOT TO DO]`);
        if (failedMethods.length > 0) {
            failedMethods.forEach((method, i) => {
                console.log(`  ${i + 1}. ${method.method}`);
                console.log(`     Failed ${method.frequency} times, wasted ${Math.round(method.time_wasted / 1000 / 60)} min`);
            });
        } else {
            console.log(`  No failed methods recorded`);
        }
        
        return {
            misdiagnosis: misdiagnosisPatterns,
            solutions: solutionPatterns,
            failedMethods: failedMethods
        };
        
    } catch (error) {
        console.error(`[ERROR] Failed to query patterns:`, error.message);
        throw error;
    } finally {
        if (dbManager && dbManager.pool) {
            await dbManager.pool.end();
        }
    }
}

async function main() {
    const errors = [
        {
            errorMessage: 'FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory',
            issueType: 'memory_heap_overflow',
            component: 'Node.js'
        },
        {
            errorMessage: "TypeError: Cannot read properties of null (reading 'status')",
            issueType: 'null_reference_state',
            component: 'AIDecisionEngine'
        },
        {
            errorMessage: 'AI Core not responding (timeout or no response)',
            issueType: 'verification_memory_overflow',
            component: 'Verification'
        }
    ];
    
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  LEARNING SYSTEM PATTERN QUERY');
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    for (const error of errors) {
        await queryPatterns(error.errorMessage, error.issueType, error.component);
        console.log('\n' + '─'.repeat(65) + '\n');
    }
    
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  QUERY COMPLETE - APPLY FIXES BASED ON LEARNING SYSTEM');
    console.log('═══════════════════════════════════════════════════════════════\n');
}

if (require.main === module) {
    main().catch(error => {
        console.error('Failed:', error);
        process.exit(1);
    });
}

module.exports = { queryPatterns };
