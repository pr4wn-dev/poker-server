#!/usr/bin/env node
/**
 * Migration Script: JSON to MySQL
 * 
 * Migrates existing JSON state file to MySQL database
 * Preserves all data, no loss
 */

const fs = require('fs');
const path = require('path');
const DatabaseManager = require('../core/DatabaseManager');

const projectRoot = path.resolve(__dirname, '../..');
const stateFile = path.join(projectRoot, 'logs', 'ai-state-store.json');

async function migrate() {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  MIGRATING JSON TO MYSQL');
    console.log('═══════════════════════════════════════════════════════════════\n');

    const dbManager = new DatabaseManager(projectRoot);
    
    try {
        // Initialize database
        console.log('Initializing database...');
        await dbManager.initialize();
        console.log('✓ Database initialized\n');

        // Load JSON file
        if (!fs.existsSync(stateFile)) {
            console.log('⚠️  No existing state file found. Starting fresh with MySQL.');
            return;
        }

        console.log('Loading JSON state file...');
        const data = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
        const state = data.state || {};
        console.log('✓ JSON file loaded\n');

        // Migrate state
        console.log('Migrating state to MySQL...');
        let stateCount = 0;
        
        async function migrateObject(obj, prefix = '') {
            for (const [key, value] of Object.entries(obj)) {
                const path = prefix ? `${prefix}.${key}` : key;
                
                if (value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Map)) {
                    await migrateObject(value, path);
                } else {
                    await dbManager.updateState(path, value);
                    stateCount++;
                    if (stateCount % 100 === 0) {
                        process.stdout.write(`  Migrated ${stateCount} state paths...\r`);
                    }
                }
            }
        }

        await migrateObject(state);
        console.log(`\n✓ Migrated ${stateCount} state paths\n`);

        // Migrate learning data
        console.log('Migrating learning data...');
        const learning = state.learning || {};
        const pool = dbManager.getPool();
        
        // Migrate fix attempts
        if (learning.fixAttempts) {
            const fixAttempts = learning.fixAttempts;
            let count = 0;
            for (const [id, attempt] of Object.entries(fixAttempts)) {
                if (!attempt || typeof attempt !== 'object') continue;
                
                await pool.execute(`
                    INSERT INTO learning_fix_attempts 
                    (id, issue_id, issue_type, fix_method, result, time_spent, misdiagnosis, correct_approach, wrong_approach, actual_root_cause, timestamp, component, details)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE
                    result = VALUES(result),
                    time_spent = VALUES(time_spent)
                `, [
                    id || null,
                    attempt.issueId || null,
                    attempt.issueType || null,
                    attempt.fixMethod || null,
                    attempt.result || null,
                    attempt.duration || attempt.timeSpent || 0,
                    attempt.fixDetails?.wrongApproach || null,
                    attempt.fixDetails?.correctApproach || null,
                    attempt.fixDetails?.wrongApproach || null,
                    attempt.fixDetails?.actualRootCause || null,
                    attempt.timestamp || Date.now(),
                    attempt.component || null,
                    JSON.stringify(attempt.fixDetails || {})
                ]);
                count++;
            }
            console.log(`  ✓ Migrated ${count} fix attempts`);
        }

        // Migrate misdiagnosis patterns
        if (learning.misdiagnosisPatterns) {
            const patterns = learning.misdiagnosisPatterns;
            let count = 0;
            for (const [key, pattern] of Object.entries(patterns)) {
                if (!pattern) continue;
                
                // Handle both Map entries and objects
                const patternData = Array.isArray(pattern) ? pattern[1] : pattern;
                if (typeof patternData === 'object' && patternData !== null) {
                    await pool.execute(`
                        INSERT INTO learning_misdiagnosis_patterns 
                        (pattern_key, symptom, common_misdiagnosis, actual_root_cause, correct_approach, frequency, time_wasted, success_rate, successes, failures, component, issue_type, last_updated)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ON DUPLICATE KEY UPDATE
                        frequency = VALUES(frequency),
                        time_wasted = VALUES(time_wasted),
                        success_rate = VALUES(success_rate)
                    `, [
                        key || null,
                        patternData.symptom || null,
                        patternData.commonMisdiagnosis || null,
                        patternData.actualRootCause || null,
                        patternData.correctApproach || null,
                        patternData.frequency || 0,
                        patternData.timeWasted || 0,
                        patternData.successRate || 0,
                        patternData.successes || 0,
                        patternData.failures || 0,
                        patternData.component || null,
                        patternData.issueType || null,
                        Date.now()
                    ]);
                    count++;
                }
            }
            console.log(`  ✓ Migrated ${count} misdiagnosis patterns`);
        }

        // Migrate patterns
        if (learning.patterns) {
            const patterns = learning.patterns;
            let count = 0;
            // Handle both array of entries and object
            const patternEntries = Array.isArray(patterns) ? patterns : Object.entries(patterns);
            
            for (const entry of patternEntries) {
                const [key, patternData] = Array.isArray(entry) ? entry : [entry, patterns[entry]];
                if (typeof patternData === 'object' && patternData !== null) {
                    await pool.execute(`
                        INSERT INTO learning_patterns 
                        (pattern_key, issue_type, solution_method, success_rate, frequency, time_saved, last_updated, details)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        ON DUPLICATE KEY UPDATE
                        success_rate = VALUES(success_rate),
                        frequency = VALUES(frequency)
                    `, [
                        key,
                        patternData.issueType || '',
                        patternData.method || patternData.solutionMethod || '',
                        patternData.successRate || 0,
                        patternData.frequency || 0,
                        patternData.timeSaved || 0,
                        Date.now(),
                        JSON.stringify(patternData)
                    ]);
                    count++;
                }
            }
            console.log(`  ✓ Migrated ${count} patterns`);
        }

        // Migrate compliance
        if (learning.aiCompliance) {
            const compliance = Array.isArray(learning.aiCompliance) ? learning.aiCompliance : [];
            let count = 0;
            for (const record of compliance) {
                await pool.execute(`
                    INSERT INTO learning_compliance 
                    (id, prompt_id, compliant, compliance_result, parts_worked, parts_skipped, timestamp, details)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE
                    compliant = VALUES(compliant),
                    compliance_result = VALUES(compliance_result)
                `, [
                    record.id || `compliance-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    record.promptId,
                    record.compliant ? 1 : 0,
                    record.complianceResult || '',
                    JSON.stringify(record.partsWorked || []),
                    JSON.stringify(record.partsSkipped || []),
                    record.timestamp || Date.now(),
                    JSON.stringify(record)
                ]);
                count++;
            }
            console.log(`  ✓ Migrated ${count} compliance records`);
        }

        // Migrate failed methods
        if (learning.failedMethods) {
            const failedMethods = learning.failedMethods;
            let count = 0;
            for (const [issueType, methods] of Object.entries(failedMethods)) {
                // Handle both array and object
                const methodList = Array.isArray(methods) ? methods : Object.values(methods);
                for (const method of methodList) {
                    await pool.execute(`
                        INSERT INTO learning_failed_methods (issue_type, method, frequency, time_wasted, last_attempt)
                        VALUES (?, ?, ?, ?, ?)
                        ON DUPLICATE KEY UPDATE
                        frequency = frequency + VALUES(frequency),
                        time_wasted = time_wasted + VALUES(time_wasted)
                    `, [
                        issueType,
                        method.method || method,
                        method.frequency || 1,
                        method.timeWasted || 0,
                        method.lastAttempt || Date.now()
                    ]);
                    count++;
                }
            }
            console.log(`  ✓ Migrated ${count} failed methods`);
        }

        console.log('\n✓ Learning data migrated\n');

        // Create backup of JSON file
        const backupFile = stateFile + '.pre-mysql-backup';
        fs.copyFileSync(stateFile, backupFile);
        console.log(`✓ Created backup: ${backupFile}\n`);

        console.log('═══════════════════════════════════════════════════════════════');
        console.log('  MIGRATION COMPLETE');
        console.log('═══════════════════════════════════════════════════════════════\n');
        console.log('Next steps:');
        console.log('1. Test the system to ensure everything works');
        console.log('2. Once verified, you can delete the JSON file (backup created)');
        console.log('3. System will now use MySQL for all state storage\n');

        await dbManager.close();
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    migrate();
}

module.exports = { migrate };
