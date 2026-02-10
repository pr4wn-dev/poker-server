#!/usr/bin/env node
/**
 * Seed Error Patterns into Learning System
 * 
 * Inserts critical error patterns with misdiagnosis prevention data
 * Run this after database setup to populate initial learning patterns
 */

const path = require('path');
const DatabaseManager = require('../core/DatabaseManager');

const projectRoot = path.resolve(__dirname, '../..');

async function seedPatterns() {
    const dbManager = new DatabaseManager(projectRoot);
    
    try {
        await dbManager.initialize();
        const pool = dbManager.getPool();
        
        console.log('Seeding error patterns into learning system...');
        
        const patterns = [
            // Pattern 1: JavaScript Heap Out of Memory
            {
                pattern_key: 'memory_heap_overflow',
                issue_type: 'memory_heap_overflow',
                solution_method: 'fix_lazy_loading_reuse_processes',
                misdiagnosis_method: 'increase_heap_size_add_ram',
                success_rate: 0.95,
                frequency: 10,
                time_saved: 3600000, // 1 hour saved per occurrence
                time_wasted: 1800000, // 30 min wasted per misdiagnosis
                contexts: JSON.stringify(['verification', 'startup', 'initialization', 'AIMonitorCore', 'StateStore']),
                solutions: JSON.stringify([
                    'Fix lazy loading in StateStore/StateStoreMySQL',
                    'Reuse single process for verification tests',
                    'Use streaming queries instead of loading full datasets',
                    'Check initialization order - only load when queried',
                    'Add process reuse in BrokenPromiseIntegration.ps1'
                ]),
                details: JSON.stringify({
                    symptoms: ['FATAL ERROR: Reached heap limit', 'Mark-Compact', 'Scavenge', 'allocation failure', '~4GB heap limit exceeded'],
                    components: ['Node.js', 'AIMonitorCore', 'StateStore', 'Verification'],
                    misdiagnosis_examples: [
                        'Increase Node.js heap size with --max-old-space-size',
                        'Add more memory to the system',
                        'The database is too large'
                    ],
                    correct_approach: 'Fix lazy loading, reuse processes, stream queries, check initialization order'
                }),
                last_updated: Date.now()
            },
            // Pattern 2: Null Reference in State Access
            {
                pattern_key: 'null_reference_state',
                issue_type: 'null_reference_state',
                solution_method: 'add_null_checks_provide_defaults',
                misdiagnosis_method: 'state_store_broken_state_not_saved',
                success_rate: 0.98,
                frequency: 5,
                time_saved: 900000, // 15 min saved per occurrence
                time_wasted: 600000, // 10 min wasted per misdiagnosis
                contexts: JSON.stringify(['AIDecisionEngine', 'BrokenPromiseIntegration', 'state access', 'getState']),
                solutions: JSON.stringify([
                    'Add null checks before accessing state properties',
                    'Provide default values for missing state',
                    'Use optional chaining (?.) where appropriate',
                    'Check if state exists before accessing properties',
                    'Return safe defaults when state is null'
                ]),
                details: JSON.stringify({
                    symptoms: ['Cannot read properties of null', "reading 'status'", "reading 'property'", 'TypeError'],
                    components: ['AIDecisionEngine', 'BrokenPromiseIntegration'],
                    misdiagnosis_examples: [
                        'StateStore is broken',
                        'State is not being saved',
                        'Database connection issue'
                    ],
                    correct_approach: 'Add null checks, provide defaults, use optional chaining',
                    affected_files: [
                        'monitoring/core/AIDecisionEngine.js:210',
                        'monitoring/integration/BrokenPromiseIntegration.js:330'
                    ]
                }),
                last_updated: Date.now()
            },
            // Pattern 3: Verification System Memory Issue
            {
                pattern_key: 'verification_memory_overflow',
                issue_type: 'verification_memory_overflow',
                solution_method: 'reuse_process_lightweight_checks',
                misdiagnosis_method: 'isolate_tests_need_more_memory',
                success_rate: 0.90,
                frequency: 8,
                time_saved: 2400000, // 40 min saved per occurrence
                time_wasted: 1200000, // 20 min wasted per misdiagnosis
                contexts: JSON.stringify(['verification', 'startup', 'testing', 'BrokenPromiseIntegration.ps1']),
                solutions: JSON.stringify([
                    'Reuse single process for all verification tests',
                    'Use lightweight health check endpoints',
                    'Skip full initialization for verification tests',
                    'Create shared initialization context',
                    'Use process pooling for verification'
                ]),
                details: JSON.stringify({
                    symptoms: ['Multiple processes', 'Each hitting heap limit', 'Verification failures', '5+ processes spawned'],
                    components: ['BrokenPromiseIntegration.ps1', 'BrokenPromise-integration.js'],
                    misdiagnosis_examples: [
                        'Each test needs its own process',
                        'Tests need to be isolated',
                        'System needs more memory'
                    ],
                    correct_approach: 'Reuse single process, lightweight health checks, skip full init',
                    root_cause: 'Verification spawning full processes instead of lightweight checks'
                }),
                last_updated: Date.now()
            }
        ];
        
        // Insert into learning_patterns
        for (const pattern of patterns) {
            await pool.execute(`
                INSERT INTO learning_patterns 
                (pattern_key, issue_type, solution_method, misdiagnosis_method, success_rate, frequency, 
                 time_saved, time_wasted, contexts, solutions, details, last_updated)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                solution_method = VALUES(solution_method),
                misdiagnosis_method = VALUES(misdiagnosis_method),
                success_rate = VALUES(success_rate),
                frequency = VALUES(frequency),
                time_saved = VALUES(time_saved),
                time_wasted = VALUES(time_wasted),
                contexts = VALUES(contexts),
                solutions = VALUES(solutions),
                details = VALUES(details),
                last_updated = VALUES(last_updated)
            `, [
                pattern.pattern_key,
                pattern.issue_type,
                pattern.solution_method,
                pattern.misdiagnosis_method,
                pattern.success_rate,
                pattern.frequency,
                pattern.time_saved,
                pattern.time_wasted,
                pattern.contexts,
                pattern.solutions,
                pattern.details,
                pattern.last_updated
            ]);
        }
        
        // Insert into learning_misdiagnosis_patterns
        const misdiagnosisPatterns = [
            {
                pattern_key: 'memory_heap_overflow_misdiagnosis',
                symptom: 'FATAL ERROR: Reached heap limit|Mark-Compact|Scavenge|allocation failure|heap limit exceeded',
                common_misdiagnosis: 'Increase Node.js heap size with --max-old-space-size or add more RAM to system',
                actual_root_cause: 'Verification system spawning full processes, components loading all data upfront instead of lazy loading',
                correct_approach: 'Fix lazy loading in StateStore, reuse single process for verification, use streaming queries, check initialization order',
                frequency: 10,
                time_wasted: 1800000,
                success_rate: 0.95,
                component: 'Node.js',
                issue_type: 'memory_heap_overflow',
                last_updated: Date.now()
            },
            {
                pattern_key: 'null_reference_state_misdiagnosis',
                symptom: 'Cannot read properties of null|reading status|TypeError',
                common_misdiagnosis: 'StateStore is broken, state is not being saved, or database connection issue',
                actual_root_cause: 'Missing null checks in code, assumption that state always exists',
                correct_approach: 'Add null checks before accessing properties, provide default values, use optional chaining',
                frequency: 5,
                time_wasted: 600000,
                success_rate: 0.98,
                component: 'AIDecisionEngine',
                issue_type: 'null_reference_state',
                last_updated: Date.now()
            },
            {
                pattern_key: 'verification_memory_overflow_misdiagnosis',
                symptom: 'Multiple processes|Each hitting heap limit|Verification failures',
                common_misdiagnosis: 'Each test needs its own process for isolation, or system needs more memory',
                actual_root_cause: 'Verification spawning full processes instead of lightweight checks or process reuse',
                correct_approach: 'Reuse single process for all tests, use lightweight health check endpoints, skip full initialization',
                frequency: 8,
                time_wasted: 1200000,
                success_rate: 0.90,
                component: 'Verification',
                issue_type: 'verification_memory_overflow',
                last_updated: Date.now()
            }
        ];
        
        for (const pattern of misdiagnosisPatterns) {
            await pool.execute(`
                INSERT INTO learning_misdiagnosis_patterns 
                (pattern_key, symptom, common_misdiagnosis, actual_root_cause, correct_approach, 
                 frequency, time_wasted, success_rate, component, issue_type, last_updated)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                common_misdiagnosis = VALUES(common_misdiagnosis),
                actual_root_cause = VALUES(actual_root_cause),
                correct_approach = VALUES(correct_approach),
                frequency = VALUES(frequency),
                time_wasted = VALUES(time_wasted),
                success_rate = VALUES(success_rate),
                last_updated = VALUES(last_updated)
            `, [
                pattern.pattern_key,
                pattern.symptom,
                pattern.common_misdiagnosis,
                pattern.actual_root_cause,
                pattern.correct_approach,
                pattern.frequency,
                pattern.time_wasted,
                pattern.success_rate,
                pattern.component,
                pattern.issue_type,
                pattern.last_updated
            ]);
        }
        
        // Insert into learning_failed_methods (what NOT to do)
        const failedMethods = [
            {
                issue_type: 'memory_heap_overflow',
                method: 'increase_heap_size_with_max_old_space_size',
                frequency: 10,
                time_wasted: 1800000
            },
            {
                issue_type: 'memory_heap_overflow',
                method: 'add_more_ram_to_system',
                frequency: 8,
                time_wasted: 1500000
            },
            {
                issue_type: 'null_reference_state',
                method: 'assume_state_store_is_broken',
                frequency: 5,
                time_wasted: 600000
            },
            {
                issue_type: 'verification_memory_overflow',
                method: 'spawn_separate_process_per_test',
                frequency: 8,
                time_wasted: 1200000
            }
        ];
        
        for (const method of failedMethods) {
            await pool.execute(`
                INSERT INTO learning_failed_methods 
                (issue_type, method, frequency, time_wasted, last_attempt)
                VALUES (?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                frequency = frequency + VALUES(frequency),
                time_wasted = time_wasted + VALUES(time_wasted),
                last_attempt = VALUES(last_attempt)
            `, [
                method.issue_type,
                method.method,
                method.frequency,
                method.time_wasted,
                Date.now()
            ]);
        }
        
        console.log(`✓ Seeded ${patterns.length} error patterns`);
        console.log(`✓ Seeded ${misdiagnosisPatterns.length} misdiagnosis patterns`);
        console.log(`✓ Seeded ${failedMethods.length} failed methods`);
        console.log('Learning system ready to prevent misdiagnosis!');
        
    } catch (error) {
        console.error('Error seeding patterns:', error);
        throw error;
    } finally {
        if (dbManager && dbManager.pool) {
            await dbManager.pool.end();
        }
    }
}

// Run if called directly
if (require.main === module) {
    seedPatterns().then(() => {
        process.exit(0);
    }).catch(error => {
        console.error('Failed to seed patterns:', error);
        process.exit(1);
    });
}

module.exports = seedPatterns;
