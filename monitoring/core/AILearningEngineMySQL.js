/**
 * AI Learning Engine - MySQL Backend
 * 
 * Learning system using MySQL database
 * Serves the soul: Misdiagnosis prevention, patterns, compliance tracking
 */

const EventEmitter = require('events');
const DatabaseManager = require('./DatabaseManager');
const gameLogger = require('../../src/utils/GameLogger');

class AILearningEngineMySQL extends EventEmitter {
    constructor(stateStore, issueDetector, fixTracker) {
        super();
        this.stateStore = stateStore;
        this.issueDetector = issueDetector;
        this.fixTracker = fixTracker;
        // Get database manager safely (avoid circular dependency)
        try {
            this.dbManager = stateStore.getDatabaseManager ? stateStore.getDatabaseManager() : null;
        } catch (error) {
            this.dbManager = null;
        }
        this.initialized = false;
    }

    /**
     * Initialize (just verify database connection)
     */
    async initialize() {
        if (this.initialized) return;
        if (!this.dbManager) {
            throw new Error('Database manager not available');
        }
        await this.dbManager.initialize();
        this.initialized = true;
    }

    /**
     * Get misdiagnosis prevention (CORE - serves the soul)
     */
    async getMisdiagnosisPrevention(issueType, errorMessage, component) {
        if (!this.initialized) await this.initialize();
        
        const pool = this.dbManager.getPool();
        
        // LEARNING SYSTEM FIX: Check if pool is closed before using it
        if (!pool || pool._closed) {
            return { warnings: [], correctApproach: null, commonMisdiagnosis: null, timeSavings: null, failedMethods: [], source: 'mysql' };
        }
        
        try {
            // Query misdiagnosis patterns (indexed, instant results)
            const [patterns] = await pool.execute(`
            SELECT * FROM learning_misdiagnosis_patterns 
            WHERE (symptom LIKE ? OR issue_type = ? OR component = ?)
            AND (frequency > 0 OR actual_root_cause IS NOT NULL)
            ORDER BY frequency DESC, time_wasted DESC
            LIMIT 10
        `, [`%${errorMessage || ''}%`, issueType || '', component || '']);
        
        const result = {
            warnings: [],
            correctApproach: null,
            commonMisdiagnosis: null,
            timeSavings: null,
            failedMethods: [],
            source: 'mysql'
        };

        for (const pattern of patterns) {
            // Check symptom match (pattern.symptom is pipe-separated)
            let symptomMatch = false;
            if (pattern.symptom) {
                const symptomPatterns = pattern.symptom.split('|');
                const searchText = (errorMessage || issueType || '').toLowerCase();
                symptomMatch = symptomPatterns.some(sp => searchText.includes(sp.trim().toLowerCase()));
            }
            
            // Check component match
            const componentMatch = !component || !pattern.component || 
                pattern.component === component || pattern.component === 'any' ||
                (component.toLowerCase().includes('powershell') && pattern.component === 'PowerShell');

            if (symptomMatch || (issueType && pattern.issue_type === issueType) || componentMatch) {
                result.warnings.push({
                    type: 'MISDIAGNOSIS_WARNING',
                    message: `Common misdiagnosis: ${pattern.common_misdiagnosis}`,
                    actualRootCause: pattern.actual_root_cause,
                    correctApproach: pattern.correct_approach,
                    frequency: pattern.frequency || 0,
                    timeWasted: pattern.time_wasted || 0
                });

                if (!result.correctApproach && pattern.correct_approach) {
                    result.correctApproach = pattern.correct_approach;
                }
                if (!result.commonMisdiagnosis && pattern.common_misdiagnosis) {
                    result.commonMisdiagnosis = pattern.common_misdiagnosis;
                }
                if (pattern.time_wasted) {
                    result.timeSavings = (result.timeSavings || 0) + pattern.time_wasted;
                }
            }
        }

        // Get failed methods (what NOT to do)
        if (issueType) {
            const [failedMethods] = await pool.execute(`
                SELECT * FROM learning_failed_methods 
                WHERE issue_type = ?
                ORDER BY frequency DESC, time_wasted DESC
                LIMIT 10
            `, [issueType]);
            
            result.failedMethods = failedMethods.map(fm => ({
                method: fm.method,
                frequency: fm.frequency,
                timeWasted: fm.time_wasted
            }));
        }

            return result;
        } catch (error) {
            // LEARNING SYSTEM FIX: Handle pool closed errors gracefully
            if (error.message && error.message.includes('Pool is closed')) {
                return { warnings: [], correctApproach: null, commonMisdiagnosis: null, timeSavings: null, failedMethods: [], source: 'mysql' };
            }
            throw error; // Re-throw other errors
        }
    }

    /**
     * Learn from fix attempt (CORE - serves the soul)
     */
    async learnFromAttempt(attempt) {
        if (!this.initialized) await this.initialize();
        
        const pool = this.dbManager.getPool();
        
        // LEARNING SYSTEM FIX: Check if pool is closed before using it
        // Prevents "Pool is closed" errors when pool is destroyed during cleanup
        if (!pool || pool._closed) {
            gameLogger.warn('MONITORING', '[AILearningEngineMySQL] Cannot learn from attempt - pool is closed', {
                issueType: attempt.issueType,
                fixMethod: attempt.fixMethod
            });
            return; // Silently skip if pool is closed
        }
        
        try {
            // Store fix attempt
            await pool.execute(`
            INSERT INTO learning_fix_attempts 
            (id, issue_id, issue_type, fix_method, result, time_spent, misdiagnosis, correct_approach, wrong_approach, actual_root_cause, timestamp, component, details)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
            result = VALUES(result),
            time_spent = VALUES(time_spent),
            misdiagnosis = VALUES(misdiagnosis),
            correct_approach = VALUES(correct_approach),
            wrong_approach = VALUES(wrong_approach),
            actual_root_cause = VALUES(actual_root_cause)
        `, [
            attempt.issueId || `attempt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            attempt.issueId,
            attempt.issueType,
            attempt.fixMethod,
            attempt.result,
            attempt.duration || attempt.timeSpent || 0,
            attempt.fixDetails?.wrongApproach || attempt.fixDetails?.misdiagnosis,
            attempt.fixDetails?.correctApproach,
            attempt.fixDetails?.wrongApproach,
            attempt.fixDetails?.actualRootCause,
            attempt.timestamp || Date.now(),
            attempt.component,
            JSON.stringify(attempt.fixDetails || {})
        ]);

            // Track misdiagnosis patterns
            if (attempt.result === 'failure' && attempt.fixDetails?.wrongApproach) {
                await this.trackMisdiagnosis(attempt);
            }

            // Track failed methods
            if (attempt.result === 'failure' && attempt.fixMethod) {
                await this.trackFailedMethod(attempt);
            }

            // Learn patterns
            if (attempt.result === 'success') {
                await this.learnPattern(attempt);
            }
        } catch (error) {
            // LEARNING SYSTEM FIX: Handle pool closed errors gracefully
            // Don't trigger console.error which would cause a cascade
            if (error.message && error.message.includes('Pool is closed')) {
                // Silently skip - pool is being destroyed, can't learn right now
                return;
            }
            // For other errors, log but don't throw (don't break the system)
            const gameLogger = require('../../src/utils/GameLogger');
            gameLogger.warn('MONITORING', '[AILearningEngineMySQL] Error learning from attempt', {
                error: error.message,
                issueType: attempt.issueType
            });
        }
    }

    /**
     * Track misdiagnosis pattern (CORE - serves the soul)
     */
    async trackMisdiagnosis(attempt) {
        if (!this.initialized) await this.initialize();
        
        const pool = this.dbManager.getPool();
        
        // LEARNING SYSTEM FIX: Check if pool is closed before using it
        if (!pool || pool._closed) {
            return; // Silently skip if pool is closed
        }
        const patternKey = `misdiagnosis_${attempt.issueType}_${attempt.fixMethod}`;
        
        // Get or create pattern
        const [existing] = await pool.execute(
            'SELECT * FROM learning_misdiagnosis_patterns WHERE pattern_key = ?',
            [patternKey]
        );

        const timeWasted = attempt.duration || attempt.timeSpent || 0;
        const frequency = existing.length > 0 ? (existing[0].frequency + 1) : 1;
        const totalTimeWasted = existing.length > 0 ? (existing[0].time_wasted + timeWasted) : timeWasted;
        const successes = existing.length > 0 ? existing[0].successes : 0;
        const failures = existing.length > 0 ? (existing[0].failures + 1) : 1;
        const successRate = (successes / (successes + failures)) || 0;

        await pool.execute(`
            INSERT INTO learning_misdiagnosis_patterns 
            (pattern_key, symptom, common_misdiagnosis, actual_root_cause, correct_approach, frequency, time_wasted, success_rate, successes, failures, component, issue_type, last_updated)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
            frequency = VALUES(frequency),
            time_wasted = VALUES(time_wasted),
            success_rate = VALUES(success_rate),
            successes = VALUES(successes),
            failures = VALUES(failures),
            last_updated = VALUES(last_updated)
        `, [
            patternKey,
            attempt.errorMessage || attempt.issueType || '',
            attempt.fixDetails?.wrongApproach || attempt.fixMethod,
            attempt.fixDetails?.actualRootCause,
            attempt.fixDetails?.correctApproach,
            frequency,
            totalTimeWasted,
            successRate,
            successes,
            failures,
            attempt.component,
            attempt.issueType,
            Date.now()
        ]);
    }

    /**
     * Track failed method (what NOT to do)
     */
    async trackFailedMethod(attempt) {
        if (!this.initialized) await this.initialize();
        
        const pool = this.dbManager.getPool();
        
        // LEARNING SYSTEM FIX: Check if pool is closed before using it
        if (!pool || pool._closed) {
            return; // Silently skip if pool is closed
        }
        
        try {
            await pool.execute(`
            INSERT INTO learning_failed_methods (issue_type, method, frequency, time_wasted, last_attempt)
            VALUES (?, ?, 1, ?, ?)
            ON DUPLICATE KEY UPDATE
            frequency = frequency + 1,
            time_wasted = time_wasted + ?,
            last_attempt = VALUES(last_attempt)
        `, [
            attempt.issueType,
            attempt.fixMethod,
            attempt.duration || attempt.timeSpent || 0,
            Date.now(),
            attempt.duration || attempt.timeSpent || 0
        ]);
        } catch (error) {
            // LEARNING SYSTEM FIX: Handle pool closed errors gracefully
            if (error.message && error.message.includes('Pool is closed')) {
                return; // Silently skip if pool is closed
            }
            throw error; // Re-throw other errors
        }
    }

    /**
     * Learn pattern (what works) - Enhanced with misdiagnosis context
     */
    async learnPattern(attempt) {
        if (!this.initialized) await this.initialize();
        
        const pool = this.dbManager.getPool();
        
        // LEARNING SYSTEM FIX: Check if pool is closed before using it
        if (!pool || pool._closed) {
            return; // Silently skip if pool is closed
        }
        
        try {
        const patternKey = `pattern_${attempt.issueType}_${attempt.fixMethod}`;
        
        // Get previous failed attempts for this issue to capture misdiagnosis context
        const [failedAttempts] = await pool.execute(`
            SELECT fix_method, time_spent, misdiagnosis, wrong_approach
            FROM learning_fix_attempts
            WHERE issue_id = ? AND result = 'failure'
            ORDER BY timestamp DESC
            LIMIT 5
        `, [attempt.issueId || '']);
        
        // Calculate misdiagnosis context
        let misdiagnosisMethod = null;
        let totalTimeWasted = 0;
        
        if (failedAttempts.length > 0) {
            // Get the most recent failed method as the misdiagnosis
            misdiagnosisMethod = failedAttempts[0].fix_method || failedAttempts[0].wrong_approach || failedAttempts[0].misdiagnosis;
            // Sum time wasted on all failed attempts
            totalTimeWasted = failedAttempts.reduce((sum, fa) => sum + (fa.time_spent || 0), 0);
        }
        
        // Also check fixDetails for misdiagnosis info
        if (attempt.fixDetails?.wrongApproach && !misdiagnosisMethod) {
            misdiagnosisMethod = attempt.fixDetails.wrongApproach;
        }
        if (attempt.fixDetails?.timeWastedOnMisdiagnosis) {
            totalTimeWasted += attempt.fixDetails.timeWastedOnMisdiagnosis;
        }
        
        const [existing] = await pool.execute(
            'SELECT * FROM learning_patterns WHERE pattern_key = ?',
            [patternKey]
        );

        const frequency = existing.length > 0 ? (existing[0].frequency + 1) : 1;
        const timeSaved = attempt.duration || attempt.timeSpent || 0;
        const totalTimeSaved = existing.length > 0 ? (existing[0].time_saved + timeSaved) : timeSaved;
        const existingTimeWasted = existing.length > 0 ? (existing[0].time_wasted || 0) : 0;
        const totalTimeWastedFinal = existingTimeWasted + totalTimeWasted;
        const successes = existing.length > 0 ? (existing[0].successes || 0) + 1 : 1;
        const failures = existing.length > 0 ? (existing[0].failures || 0) : 0;
        const successRate = successes / (successes + failures);

        await pool.execute(`
            INSERT INTO learning_patterns 
            (pattern_key, issue_type, solution_method, misdiagnosis_method, success_rate, frequency, time_saved, time_wasted, last_updated, details)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
            solution_method = VALUES(solution_method),
            misdiagnosis_method = COALESCE(VALUES(misdiagnosis_method), misdiagnosis_method),
            success_rate = VALUES(success_rate),
            frequency = VALUES(frequency),
            time_saved = VALUES(time_saved),
            time_wasted = VALUES(time_wasted),
            last_updated = VALUES(last_updated)
        `, [
            patternKey,
            attempt.issueType,
            attempt.fixMethod,
            misdiagnosisMethod,
            successRate,
            frequency,
            totalTimeSaved,
            totalTimeWastedFinal,
            Date.now(),
            JSON.stringify(attempt.fixDetails || {})
        ]);
        } catch (error) {
            // LEARNING SYSTEM FIX: Handle pool closed errors gracefully
            if (error.message && error.message.includes('Pool is closed')) {
                return; // Silently skip if pool is closed
            }
            throw error; // Re-throw other errors
        }
    }

    /**
     * Get best solution for issue type
     */
    async getBestSolution(issueType) {
        if (!this.initialized) await this.initialize();
        
        const pool = this.dbManager.getPool();
        
        // LEARNING SYSTEM FIX: Check if pool is closed before using it
        if (!pool || pool._closed) {
            return null; // Return null if pool is closed
        }
        
        try {
            const [rows] = await pool.execute(`
            SELECT * FROM learning_patterns 
            WHERE issue_type = ?
            ORDER BY success_rate DESC, frequency DESC
            LIMIT 1
        `, [issueType]);
        
            if (rows.length === 0) return null;
            
            const pattern = rows[0];
            return {
                method: pattern.solution_method,
                successRate: pattern.success_rate,
                frequency: pattern.frequency,
                timeSaved: pattern.time_saved,
                source: 'mysql'
            };
        } catch (error) {
            // LEARNING SYSTEM FIX: Handle pool closed errors gracefully
            if (error.message && error.message.includes('Pool is closed')) {
                return null; // Return null if pool is closed
            }
            throw error; // Re-throw other errors
        }
    }

    /**
     * Save (for compatibility - data already in database)
     */
    async save() {
        // Data is already saved in database via learnFromAttempt
        // This method exists for compatibility
    }

    /**
     * Seed initial error patterns if they don't exist
     * Called during initialization to ensure critical patterns are available
     */
    async seedInitialPatterns() {
        if (!this.initialized) await this.initialize();
        
        const pool = this.dbManager.getPool();
        
        // LEARNING SYSTEM FIX: Check if pool is closed before using it
        if (!pool || pool._closed) {
            gameLogger.warn('MONITORING', '[AILearningEngineMySQL] Cannot seed patterns - pool is closed');
            return; // Silently skip if pool is closed
        }
        
        try {
            // Check if patterns already exist
            const [existing] = await pool.execute(`
                SELECT COUNT(*) as count FROM learning_patterns 
                WHERE pattern_key IN ('memory_heap_overflow', 'null_reference_state', 'verification_memory_overflow')
            `);
            
            if (existing[0].count >= 3) {
                // Patterns already seeded
                return;
            }
            
            // Import and run seeding script
            const seedPatterns = require('../../scripts/seed-error-patterns');
            await seedPatterns();
            
            this.emit('patterns-seeded');
        } catch (error) {
            // LEARNING SYSTEM FIX: Use gameLogger instead of console.error to avoid triggering ConsoleOverride
            // ConsoleOverride would trigger learning system which tries to use the pool, causing cascade
            // Don't fail initialization if seeding fails
            gameLogger.warn('MONITORING', '[AILearningEngineMySQL] Failed to seed initial patterns', {
                error: error.message
            });
        }
    }
}

module.exports = AILearningEngineMySQL;
