/**
 * AI Learning Engine - Advanced Problem Solving
 * 
 * Enhances the learning system with:
 * - Pattern recognition across issues
 * - Causal chain analysis
 * - Predictive problem detection
 * - Solution optimization
 * - Cross-issue learning
 */

const EventEmitter = require('events');
const PatternGeneralizer = require('./PatternGeneralizer');
const gameLogger = require('../../src/utils/GameLogger');

class AILearningEngine extends EventEmitter {
    constructor(stateStore, issueDetector, fixTracker) {
        super();
        this.stateStore = stateStore;
        this.issueDetector = issueDetector;
        this.fixTracker = fixTracker;
        
        // Learning patterns
        this.patterns = new Map(); // pattern -> { frequency, successRate, contexts, solutions }
        this.causalChains = new Map(); // issueId -> [causal chain]
        this.solutionOptimization = new Map(); // issueType -> { bestSolution, alternatives, successRate }
        this.crossIssueLearning = new Map(); // pattern -> { relatedIssues, commonSolutions }
        
        // Learning confidence tracking (anti-masking safeguards)
        this.confidenceHistory = []; // Track confidence over time to detect masking
        this.maskingDetected = false;
        this.maskingWarnings = [];
        
        // Initialization hang pattern tracking
        this.initializationTimings = new Map(); // component -> { startTime, endTime, duration, hung }
        this.getterTimings = new Map(); // method -> { calls, totalTime, avgTime, maxTime, hangs }
        this.synchronousOperations = new Map(); // method -> { fileOps, stateOps, blockingOps }
        
        // Critical problem-solving patterns (learned from actual fixes)
        this.circularDependencies = new Map(); // pattern -> { chain: [], frequency, solutions }
        this.blockingChains = new Map(); // pattern -> { chain: [], frequency, solutions }
        this.debuggingPatterns = new Map(); // pattern -> { method: 'manual_debugging', successRate, contexts }
        
        // Generalized patterns (abstracted from specific instances)
        this.generalizedPatterns = new Map(); // generalPattern -> { specificInstances: [], generalSolution: string, successRate: number }
        
        // Pattern generalization rules
        this.generalizationRules = new Map(); // specificPattern -> generalPattern
        
        // Misdiagnosis prevention tracking
        this.misdiagnosisPatterns = new Map(); // pattern -> { symptom, commonMisdiagnosis, actualRootCause, correctApproach, frequency, timeWasted }
        
        // Automatic adjustment thresholds
        this.lowConfidenceThreshold = 50; // Below 50% triggers adjustments
        this.criticalConfidenceThreshold = 30; // Below 30% is critical
        this.minSampleSize = 10; // Minimum samples before trusting success rates
        
        // Load learning data
        this.load();
        
        // Initialize PowerShell misdiagnosis patterns (start with PowerShell, expand later)
        this.initializePowerShellPatterns();
        
        // Start periodic confidence check and auto-adjustment
        this.startConfidenceMonitoring();
    }
    
    /**
     * Initialize PowerShell misdiagnosis patterns
     * Start with PowerShell patterns, expand to other components later
     */
    initializePowerShellPatterns() {
        // PowerShell bracket error misdiagnosis pattern
        const bracketErrorPattern = {
            pattern: 'powershell_bracket_error_misdiagnosis',
            symptom: 'bracket missing|missing closing bracket|unexpected token',
            commonMisdiagnosis: 'Searching for missing brackets throughout the code',
            actualRootCause: 'Missing catch block in try statement',
            correctApproach: 'Check try/catch structure first, then brackets',
            frequency: 0, // Will be updated as system learns
            timeWasted: 0, // Will be updated as system learns
            successRate: 0,
            successes: 0,
            failures: 0,
            component: 'PowerShell',
            issueType: 'powershell_syntax_error'
        };
        
        // Only add if not already exists (don't overwrite learned data)
        if (!this.misdiagnosisPatterns.has('powershell_bracket_error_misdiagnosis')) {
            this.misdiagnosisPatterns.set('powershell_bracket_error_misdiagnosis', bracketErrorPattern);
        }
        
        // Save to state store
        this.stateStore.updateState('learning.misdiagnosisPatterns', 
            Object.fromEntries(this.misdiagnosisPatterns));
    }
    
    /**
     * Learn from fix attempt
     * MISDIAGNOSIS-FIRST: Track wrong approaches first (most valuable learning)
     */
    learnFromAttempt(attempt) {
        // STEP 0: Store the attempt itself for tracking
        this.storeFixAttempt(attempt);
        
        // STEP 1: Track misdiagnosis patterns FIRST (highest priority)
        // This prevents future wasted time - most valuable learning
        this.trackMisdiagnosis(attempt);
        
        // STEP 2: Extract patterns (for general learning)
        const patterns = this.extractPatterns(attempt);
        
        // STEP 3: Update pattern knowledge
        for (const pattern of patterns) {
            this.updatePatternKnowledge(pattern, attempt);
        }
        
        // STEP 4: If successful, learn what worked
        if (attempt.result === 'success') {
            this.analyzeCausalChain(attempt);
            this.optimizeSolution(attempt);
            this.learnCrossIssue(attempt);
            this.generalizePattern(attempt);
        } else {
            // STEP 5: If failed, prioritize learning what NOT to do
            // This is where misdiagnosis patterns are most valuable
            this.learnFromFailure(attempt);
        }
        
        // STEP 6: Save learning immediately (critical data)
        this.save();
    }
    
    /**
     * Store fix attempt for tracking and analysis
     */
    storeFixAttempt(attempt) {
        const fixAttempts = this.stateStore.getState('learning.fixAttempts') || {};
        const attemptId = attempt.issueId || `attempt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        fixAttempts[attemptId] = {
            issueId: attempt.issueId,
            issueType: attempt.issueType,
            fixMethod: attempt.fixMethod,
            fixDetails: attempt.fixDetails,
            result: attempt.result,
            timestamp: attempt.timestamp || Date.now(),
            duration: attempt.duration || 0,
            errorMessage: attempt.errorMessage,
            failureReason: attempt.failureReason,
            component: attempt.component
        };
        
        this.stateStore.updateState('learning.fixAttempts', fixAttempts);
    }
    
    /**
     * Learn from failure - focus on misdiagnosis prevention
     */
    learnFromFailure(attempt) {
        // Extract what went wrong
        const wrongApproach = attempt.fixMethod || attempt.fixDetails?.approach || 'unknown';
        const timeWasted = attempt.fixDetails?.timeSpent || attempt.duration || 0;
        
        // Check if this matches a known misdiagnosis pattern
        const pattern = this.detectSpecificPattern(attempt);
        if (pattern && pattern.includes('misdiagnosis')) {
            // This is a known misdiagnosis - update frequency and time wasted
            const misdiagnosisKey = pattern;
            const existing = this.misdiagnosisPatterns.get(misdiagnosisKey);
            if (existing) {
                existing.frequency++;
                existing.timeWasted += timeWasted;
                existing.failures++;
                existing.successRate = existing.successes / existing.frequency;
                this.misdiagnosisPatterns.set(misdiagnosisKey, existing);
            }
        }
        
        // Learn what NOT to try again
        this.learnWhatNotToDo(attempt);
    }
    
    /**
     * Learn what NOT to do (prevent repeating failures)
     */
    learnWhatNotToDo(attempt) {
        const issueType = attempt.issueType || 'unknown';
        const wrongMethod = attempt.fixMethod || 'unknown';
        
        // Track failed methods for this issue type
        const failedMethods = this.stateStore.getState('learning.failedMethods') || {};
        if (!failedMethods[issueType]) {
            failedMethods[issueType] = [];
        }
        
        // Add to failed methods if not already there
        const existingMethod = failedMethods[issueType].find(m => m.method === wrongMethod);
        if (!existingMethod) {
            failedMethods[issueType].push({
                method: wrongMethod,
                frequency: 1,
                lastAttempt: attempt.timestamp,
                timeWasted: attempt.fixDetails?.timeSpent || 0
            });
        } else {
            // Update frequency
            existingMethod.frequency++;
            existingMethod.lastAttempt = attempt.timestamp;
            existingMethod.timeWasted += (attempt.fixDetails?.timeSpent || 0);
        }
        
        this.stateStore.updateState('learning.failedMethods', failedMethods);
    }
    
    /**
     * Generalize pattern - abstract specific pattern to general principle
     */
    generalizePattern(attempt) {
        if (attempt.result !== 'success') return;
        
        // Detect specific pattern
        const specificPattern = this.detectSpecificPattern(attempt);
        if (!specificPattern) return;
        
        // Map to general pattern
        const generalPattern = this.mapToGeneralPattern(specificPattern);
        
        // Update generalized pattern
        if (!this.generalizedPatterns.has(generalPattern)) {
            this.generalizedPatterns.set(generalPattern, {
                generalPattern,
                specificInstances: [],
                generalSolution: this.extractGeneralSolution(attempt),
                successRate: 1.0,
                attempts: 1,
                successes: 1,
                applicableTo: []
            });
        }
        
        const generalized = this.generalizedPatterns.get(generalPattern);
        
        // Add specific instance if not already there
        if (!generalized.specificInstances.includes(specificPattern)) {
            generalized.specificInstances.push(specificPattern);
        }
        
        // Update success rate
        generalized.attempts++;
        generalized.successes++;
        generalized.successRate = generalized.successes / generalized.attempts;
        
        // Update applicable components
        const component = attempt.component || attempt.issueType?.split('.')[0] || 'unknown';
        if (!generalized.applicableTo.includes(component)) {
            generalized.applicableTo.push(component);
        }
        
        // Store generalization rule
        this.generalizationRules.set(specificPattern, generalPattern);
    }
    
    /**
     * Detect specific pattern from attempt
     */
    detectSpecificPattern(attempt) {
        const issueType = attempt.issueType || '';
        const fixMethod = attempt.fixMethod || '';
        const errorMessage = attempt.errorMessage || attempt.failureReason || '';
        const component = attempt.component || '';
        
        // PowerShell bracket error misdiagnosis pattern
        if ((issueType.includes('powershell') || issueType.includes('syntax_error')) && 
            component.includes('PowerShell') || component.includes('ps1')) {
            // Check if error message mentions brackets
            if (errorMessage.toLowerCase().includes('bracket') || 
                errorMessage.toLowerCase().includes('missing') ||
                errorMessage.toLowerCase().includes('unexpected')) {
                // Check if fix method was searching for brackets (misdiagnosis)
                if (fixMethod.includes('search_brackets') || 
                    fixMethod.includes('find_missing_bracket') ||
                    attempt.fixDetails?.approach === 'search_for_brackets') {
                    return 'powershell_bracket_error_misdiagnosis';
                }
                // Check if actual fix was try/catch related (correct diagnosis)
                if (fixMethod.includes('try_catch') || 
                    fixMethod.includes('check_try_catch') ||
                    attempt.fixDetails?.approach === 'check_try_catch_structure') {
                    return 'powershell_bracket_error_try_catch_fix';
                }
            }
        }
        
        // Specific patterns
        if (issueType.includes('AIIssueDetector') && issueType.includes('timing')) {
            return 'AIIssueDetector.timing_issue';
        }
        if (issueType.includes('ProcessMonitor') && issueType.includes('initialization')) {
            return 'ProcessMonitor.initialization_hang';
        }
        if (issueType.includes('circular') || fixMethod.includes('setImmediate')) {
            return 'circular_dependency.synchronous_loop';
        }
        if (issueType.includes('undefined') || fixMethod.includes('guard')) {
            return 'undefined_access.missing_guard';
        }
        
        return null;
    }
    
    /**
     * Map specific pattern to general pattern
     */
    mapToGeneralPattern(specificPattern) {
        // Misdiagnosis patterns
        if (specificPattern.includes('misdiagnosis')) {
            return 'symptom_vs_root_cause_misdiagnosis';
        }
        if (specificPattern.includes('powershell_bracket_error')) {
            return 'error_message_misleading_pattern';
        }
        
        // Mapping rules
        if (specificPattern.includes('timing') || specificPattern.includes('initialization')) {
            return 'initialization_race_condition';
        }
        if (specificPattern.includes('circular') || specificPattern.includes('loop')) {
            return 'synchronous_loop_pattern';
        }
        if (specificPattern.includes('undefined') || specificPattern.includes('guard')) {
            return 'missing_dependency_guard';
        }
        if (specificPattern.includes('hang') || specificPattern.includes('blocking')) {
            return 'blocking_operation_pattern';
        }
        
        return 'general_fix_pattern';
    }
    
    /**
     * Extract general solution from attempt
     */
    extractGeneralSolution(attempt) {
        const fixMethod = attempt.fixMethod || '';
        const pattern = this.detectSpecificPattern(attempt);
        
        // PowerShell bracket error - check try/catch first
        if (pattern === 'powershell_bracket_error_try_catch_fix') {
            return 'For PowerShell bracket errors: Check try/catch structure first, then brackets';
        }
        
        // Misdiagnosis prevention
        if (pattern && pattern.includes('misdiagnosis')) {
            return 'Avoid common misdiagnosis: Check actual root cause before treating symptom';
        }
        
        if (fixMethod.includes('setImmediate')) {
            return 'Delay async operations with setImmediate and add guards';
        }
        if (fixMethod.includes('guard')) {
            return 'Add guards before accessing dependencies';
        }
        if (fixMethod.includes('try') || fixMethod.includes('catch')) {
            return 'Wrap operations in try-catch blocks';
        }
        if (fixMethod.includes('async')) {
            return 'Make operations async to break blocking chains';
        }
        
        return 'Apply learned solution pattern';
    }
    
    /**
     * Get generalized pattern for a specific issue
     */
    getGeneralizedPattern(specificIssue) {
        const specificPattern = this.detectSpecificPattern({ issueType: specificIssue });
        if (!specificPattern) return null;
        
        const generalPattern = this.generalizationRules.get(specificPattern);
        if (!generalPattern) return null;
        
        return this.generalizedPatterns.get(generalPattern);
    }
    
    /**
     * Extract patterns from fix attempt - GENERALIZED
     */
    extractPatterns(attempt) {
        const patterns = [];
        
        // Issue type pattern - keep as-is (already categorical)
        if (attempt.issueType) {
            patterns.push({
                type: 'issueType',
                value: attempt.issueType,
                context: PatternGeneralizer.createMinimalContext(attempt.fixDetails || {}, attempt.issueType)
            });
        }
        
        // Fix method pattern - keep as-is (already categorical)
        if (attempt.fixMethod) {
            patterns.push({
                type: 'fixMethod',
                value: attempt.fixMethod,
                context: PatternGeneralizer.createMinimalContext(attempt.fixDetails || {}, attempt.issueType)
            });
        }
        
        // State pattern - only create if state is relevant to issue
        if (attempt.state && attempt.issueType) {
            const statePattern = PatternGeneralizer.generalizeStatePattern(attempt.state, attempt.issueType);
            if (statePattern) {
                patterns.push({
                    type: 'state',
                    value: statePattern,
                    context: PatternGeneralizer.createMinimalContext(attempt.fixDetails || {}, attempt.issueType)
                });
            }
        }
        
        // Log pattern (if logs were involved) - generalized
        if (attempt.logs && attempt.logs.length > 0) {
            patterns.push({
                type: 'log',
                value: this.extractLogPattern(attempt.logs),
                context: PatternGeneralizer.createMinimalContext(attempt.fixDetails || {}, attempt.issueType)
            });
        }
        
        return patterns;
    }
    
    /**
     * Extract state pattern - DEPRECATED: Use PatternGeneralizer.generalizeStatePattern instead
     * Kept for backward compatibility
     */
    extractStatePattern(state) {
        // Use generalizer for consistency
        return PatternGeneralizer.generalizeStatePattern(state, null) || '';
    }
    
    /**
     * Extract log pattern
     */
    extractLogPattern(logs) {
        // Extract common log patterns
        const patterns = [];
        
        for (const log of logs.slice(0, 5)) { // First 5 logs
            if (log.message) {
                // Extract keywords
                const keywords = log.message.match(/\b(error|fail|exception|timeout|null|undefined)\b/gi);
                if (keywords) {
                    patterns.push(...keywords.map(k => k.toLowerCase()));
                }
            }
        }
        
        return [...new Set(patterns)].join('|');
    }
    
    /**
     * Update pattern knowledge - STORES MINIMAL CONTEXT
     */
    updatePatternKnowledge(pattern, attempt) {
        const patternKey = `${pattern.type}:${pattern.value}`;
        const existing = this.patterns.get(patternKey) || {
            frequency: 0,
            successes: 0,
            failures: 0,
            contexts: [], // Store minimal context only
            solutions: [] // Store solution method only
        };
        
        existing.frequency++;
        if (attempt.result === 'success') {
            existing.successes++;
        } else {
            existing.failures++;
        }
        
        // Store minimal context (generalized, no exact values)
        const minimalContext = pattern.context || {};
        existing.contexts.push(minimalContext);
        
        // Keep only last 5 contexts (not 10, to reduce bloat)
        if (existing.contexts.length > 5) {
            existing.contexts = existing.contexts.slice(-5);
        }
        
        // Store solution method only (no full details)
        existing.solutions.push({
            method: attempt.fixMethod,
            result: attempt.result,
            timestamp: attempt.timestamp
        });
        
        // Keep only last 5 solutions
        if (existing.solutions.length > 5) {
            existing.solutions = existing.solutions.slice(-5);
        }
        
        // Keep only last 100 contexts and solutions
        if (existing.contexts.length > 100) {
            existing.contexts = existing.contexts.slice(-100);
        }
        if (existing.solutions.length > 100) {
            existing.solutions = existing.solutions.slice(-100);
        }
        
        existing.successRate = existing.successes / existing.frequency;
        
        this.patterns.set(patternKey, existing);
    }
    
    /**
     * Analyze causal chain
     */
    analyzeCausalChain(attempt) {
        const issue = this.issueDetector.getIssue(attempt.issueId);
        if (!issue) return;
        
        // Build causal chain
        const chain = [{
            issue: issue.type,
            fix: attempt.fixMethod,
            result: attempt.result,
            timestamp: attempt.timestamp
        }];
        
        // Look for related issues
        const relatedIssues = this.findRelatedIssues(issue);
        for (const related of relatedIssues) {
            chain.push({
                issue: related.type,
                relationship: this.getRelationship(issue, related),
                timestamp: related.firstSeen
            });
        }
        
        this.causalChains.set(attempt.issueId, chain);
    }
    
    /**
     * Find related issues
     */
    findRelatedIssues(issue) {
        const allIssues = this.issueDetector.getActiveIssues();
        const related = [];
        
        for (const other of allIssues) {
            if (other.id === issue.id) continue;
            
            // Same type
            if (other.type === issue.type) {
                related.push(other);
            }
            
            // Same root cause
            if (other.rootCause === issue.rootCause) {
                related.push(other);
            }
            
            // Similar details
            if (this.areSimilar(issue, other)) {
                related.push(other);
            }
        }
        
        return related;
    }
    
    /**
     * Check if two issues are similar
     */
    areSimilar(issue1, issue2) {
        // Check details similarity
        const details1 = JSON.stringify(issue1.details || {});
        const details2 = JSON.stringify(issue2.details || {});
        
        // Simple similarity check (could be improved)
        const commonKeys = Object.keys(issue1.details || {}).filter(k => 
            issue2.details && issue2.details[k] !== undefined
        );
        
        return commonKeys.length > 0;
    }
    
    /**
     * Get relationship between issues
     */
    getRelationship(issue1, issue2) {
        if (issue1.rootCause === issue2.rootCause) {
            return 'same_root_cause';
        }
        if (issue1.type === issue2.type) {
            return 'same_type';
        }
        return 'related';
    }
    
    /**
     * Optimize solution
     */
    optimizeSolution(attempt) {
        if (attempt.result !== 'success') return;
        
        const issueType = attempt.issueType;
        const existing = this.solutionOptimization.get(issueType) || {
            bestSolution: null,
            alternatives: [],
            successRate: 0,
            attempts: 0
        };
        
        existing.attempts++;
        
        // Update best solution if this is better
        const currentSuccessRate = this.fixTracker.getSuccessRate(attempt.fixMethod);
        if (currentSuccessRate > existing.successRate) {
            existing.bestSolution = attempt.fixMethod;
            existing.successRate = currentSuccessRate;
        }
        
        // Add to alternatives if not already there
        if (!existing.alternatives.find(a => a.method === attempt.fixMethod)) {
            existing.alternatives.push({
                method: attempt.fixMethod,
                successRate: currentSuccessRate,
                lastUsed: attempt.timestamp
            });
        }
        
        // Sort alternatives by success rate
        existing.alternatives.sort((a, b) => b.successRate - a.successRate);
        
        this.solutionOptimization.set(issueType, existing);
    }
    
    /**
     * Learn cross-issue patterns
     */
    learnCrossIssue(attempt) {
        const issue = this.issueDetector.getIssue(attempt.issueId);
        if (!issue) return;
        
        // Find issues with similar patterns
        const similarIssues = this.findSimilarIssues(issue);
        
        for (const similar of similarIssues) {
            const patternKey = `${issue.type}:${similar.type}`;
            const existing = this.crossIssueLearning.get(patternKey) || {
                relatedIssues: [],
                commonSolutions: [],
                frequency: 0
            };
            
            existing.frequency++;
            
            // Add to related issues if not already there
            if (!existing.relatedIssues.find(i => i.id === similar.id)) {
                existing.relatedIssues.push({
                    id: similar.id,
                    type: similar.type
                });
            }
            
            // Add solution if successful
            if (attempt.result === 'success') {
                if (!existing.commonSolutions.find(s => s.method === attempt.fixMethod)) {
                    const methodStats = this.fixTracker.successRates.get(attempt.fixMethod);
                    const successRate = methodStats ? methodStats.rate : 0;
                    existing.commonSolutions.push({
                        method: attempt.fixMethod,
                        successRate: successRate,
                        lastUsed: attempt.timestamp
                    });
                }
            }
            
            this.crossIssueLearning.set(patternKey, existing);
        }
    }
    
    /**
     * Find similar issues
     */
    findSimilarIssues(issue) {
        const allIssues = this.issueDetector.getActiveIssues();
        return allIssues.filter(other => 
            other.id !== issue.id && this.areSimilar(issue, other)
        );
    }
    
    /**
     * Get best solution for issue type
     * Enhanced to include circular dependency and blocking chain solutions
     */
    getBestSolution(issueType) {
        // FIRST: Check stored patterns from state.learning.patterns (most reliable)
        const storedPatterns = this.stateStore.getState('learning.patterns') || [];
        if (Array.isArray(storedPatterns) && storedPatterns.length > 0) {
            // Patterns are stored as [key, value] pairs
            for (const patternEntry of storedPatterns) {
                if (Array.isArray(patternEntry) && patternEntry.length >= 2) {
                    const [patternKey, patternData] = patternEntry;
                    
                    // Check if pattern matches issueType
                    if (patternKey && typeof patternKey === 'string') {
                        // Check exact match or contains match
                        if (patternKey === issueType || 
                            patternKey.includes(issueType) || 
                            issueType.includes(patternKey.split(':')[1] || '')) {
                            
                            // Check if pattern has solutions
                            if (patternData && patternData.solutions && Array.isArray(patternData.solutions) && patternData.solutions.length > 0) {
                                const bestSolution = patternData.solutions[0];
                                return {
                                    method: bestSolution.method || patternData.method || 'fix_from_pattern',
                                    successRate: patternData.successRate || 1.0,
                                    frequency: patternData.frequency || 1,
                                    contexts: patternData.contexts || [],
                                    source: 'stored_pattern',
                                    pattern: patternKey
                                };
                            }
                            
                            // If no solutions array, check if patternData itself has method
                            if (patternData && patternData.method) {
                                return {
                                    method: patternData.method,
                                    successRate: patternData.successRate || 1.0,
                                    frequency: patternData.frequency || 1,
                                    source: 'stored_pattern',
                                    pattern: patternKey
                                };
                            }
                        }
                    }
                }
            }
        }
        
        // SECOND: Check in-memory patterns Map (if loaded)
        for (const [patternKey, patternData] of this.patterns.entries()) {
            if (patternKey && typeof patternKey === 'string') {
                if (patternKey === issueType || 
                    patternKey.includes(issueType) || 
                    issueType.includes(patternKey.split(':')[1] || '')) {
                    
                    if (patternData && patternData.solutions && Array.isArray(patternData.solutions) && patternData.solutions.length > 0) {
                        const bestSolution = patternData.solutions[0];
                        return {
                            method: bestSolution.method || patternData.method || 'fix_from_pattern',
                            successRate: patternData.successRate || 1.0,
                            frequency: patternData.frequency || 1,
                            source: 'in_memory_pattern',
                            pattern: patternKey
                        };
                    }
                }
            }
        }
        
        // THIRD: Check for circular dependency patterns
        if (issueType && (issueType.includes('hang') || issueType.includes('circular') || issueType.includes('loop'))) {
            // Try to detect circular dependency
            const circularPattern = this.detectCircularDependency([issueType]);
            if (circularPattern) {
                const solutions = this.getCircularDependencySolutions(circularPattern.chain);
                if (solutions.length > 0) {
                    return {
                        method: solutions[0].method,
                        description: solutions[0].description,
                        confidence: solutions[0].confidence,
                        source: 'circular_dependency_detection'
                    };
                }
            }
        }
        
        // FOURTH: Check for blocking chain patterns
        if (issueType && (issueType.includes('blocking') || issueType.includes('sync') || issueType.includes('hang'))) {
            const blockingPattern = this.detectBlockingChain([{ type: 'sync', method: issueType }]);
            if (blockingPattern) {
                const solutions = this.getBlockingChainSolutions(blockingPattern.chain);
                if (solutions.length > 0) {
                    return {
                        method: solutions[0].method,
                        description: solutions[0].description,
                        confidence: solutions[0].confidence,
                        source: 'blocking_chain_detection'
                    };
                }
            }
        }
        
        // FIFTH: Fall back to original solution optimization
        const optimization = this.solutionOptimization.get(issueType);
        if (optimization && optimization.bestSolution) {
            return {
                method: optimization.bestSolution.method || optimization.bestSolution,
                successRate: optimization.successRate,
                alternatives: optimization.alternatives,
                source: 'solution_optimization'
            };
        }
        
        return null;
    }
    
    /**
     * Extract solution from pattern data (helper method)
     */
    _extractSolutionFromPattern(patternData, patternKey, source, confidence = 1.0) {
        if (patternData && patternData.solutions && Array.isArray(patternData.solutions) && patternData.solutions.length > 0) {
            const bestSolution = patternData.solutions[0];
            return {
                method: bestSolution.method || patternData.method || 'fix_from_pattern',
                successRate: patternData.successRate || (patternData.successes / (patternData.successes + patternData.failures)) || 1.0,
                frequency: patternData.frequency || 1,
                contexts: (patternData.contexts || []).slice(0, 2), // Only return 2 contexts max
                source: source,
                pattern: patternKey,
                confidence: confidence
            };
        }
        
        // If no solutions array, check if patternData itself has method
        if (patternData && patternData.method) {
            return {
                method: patternData.method,
                successRate: patternData.successRate || 1.0,
                frequency: patternData.frequency || 1,
                source: source,
                pattern: patternKey,
                confidence: confidence
            };
        }
        
        return null;
    }
    
    /**
     * Predict likely issues - ENHANCED with proactive prediction
     */
    predictIssues(currentState) {
        const predictions = [];
        
        // Analyze patterns to predict issues
        for (const [patternKey, pattern] of this.patterns.entries()) {
            if (pattern.frequency > 5 && pattern.successRate < 0.3) {
                // Pattern that frequently fails - likely to cause issues
                predictions.push({
                    pattern: patternKey,
                    likelihood: pattern.frequency / 100, // Normalize
                    reason: `Pattern ${patternKey} has high failure rate (${(pattern.successRate * 100).toFixed(1)}%)`,
                    type: 'pattern_based'
                });
            }
        }
        
        // Proactive prediction: Analyze code patterns
        const codePredictions = this.predictFromCodePatterns(currentState);
        predictions.push(...codePredictions);
        
        // Proactive prediction: Analyze state patterns
        const statePredictions = this.predictFromStatePatterns(currentState);
        predictions.push(...statePredictions);
        
        // Sort by likelihood
        predictions.sort((a, b) => b.likelihood - a.likelihood);
        
        return predictions;
    }
    
    /**
     * Predict issues from code patterns (proactive)
     */
    predictFromCodePatterns(currentState) {
        const predictions = [];
        
        // Check for common problematic patterns
        const problematicPatterns = [
            {
                pattern: 'setInterval_in_constructor',
                description: 'setInterval called in constructor without guards',
                likelihood: 0.8,
                suggestion: 'Delay interval start with setImmediate and add guards',
                type: 'code_pattern'
            },
            {
                pattern: 'synchronous_state_access',
                description: 'Synchronous state access without guards',
                likelihood: 0.7,
                suggestion: 'Add guards before stateStore access',
                type: 'code_pattern'
            },
            {
                pattern: 'circular_synchronous_calls',
                description: 'Circular synchronous method calls',
                likelihood: 0.9,
                suggestion: 'Break cycle with setImmediate',
                type: 'code_pattern'
            }
        ];
        
        // Check if current state matches problematic patterns
        for (const problematic of problematicPatterns) {
            // This would be enhanced with actual code analysis
            // For now, check if we've seen this pattern fail before
            const patternData = this.patterns.get(problematic.pattern);
            if (patternData && patternData.successRate < 0.5) {
                predictions.push({
                    pattern: problematic.pattern,
                    likelihood: problematic.likelihood,
                    reason: problematic.description,
                    suggestion: problematic.suggestion,
                    type: problematic.type,
                    confidence: patternData.successRate
                });
            }
        }
        
        return predictions;
    }
    
    /**
     * Predict issues from state patterns (proactive)
     */
    predictFromStatePatterns(currentState) {
        const predictions = [];
        
        if (!currentState) return predictions;
        
        // Check for state patterns that lead to issues
        // Example: If stateStore is accessed before initialization
        if (currentState.initialization && !currentState.initialization.complete) {
            predictions.push({
                pattern: 'state_access_before_init',
                likelihood: 0.75,
                reason: 'State accessed before initialization complete',
                suggestion: 'Add guards to check initialization state',
                type: 'state_pattern'
            });
        }
        
        return predictions;
    }
    
    /**
     * Get learning confidence - overall ability percentage
     * This represents how well BrokenPromise is learning across all capabilities
     * ALWAYS visible - cannot be masked
     */
    getLearningConfidence() {
        const metrics = this.calculateLearningMetrics();
        const confidence = this.calculateOverallConfidence(metrics);
        
        // Detect masking attempts
        this.detectMasking(confidence, metrics);
        
        // Store in history for trend analysis
        this.confidenceHistory.push({
            timestamp: Date.now(),
            confidence,
            metrics,
            maskingDetected: this.maskingDetected
        });
        
        // Keep only last 100 entries
        if (this.confidenceHistory.length > 100) {
            this.confidenceHistory = this.confidenceHistory.slice(-100);
        }
        
        // Auto-adjust if confidence is low
        if (confidence < this.lowConfidenceThreshold) {
            this.autoAdjust(confidence, metrics);
        }
        
        // Calculate AI Compliance capability
        const aiCompliance = this.calculateAICompliance();
        
        return {
            overallConfidence: Math.round(confidence),
            breakdown: {
                patternRecognition: Math.round(metrics.patternRecognition),
                causalAnalysis: Math.round(metrics.causalAnalysis),
                solutionOptimization: Math.round(metrics.solutionOptimization),
                crossIssueLearning: Math.round(metrics.crossIssueLearning),
                predictionAccuracy: Math.round(metrics.predictionAccuracy),
                dataQuality: Math.round(metrics.dataQuality),
                aiCompliance: Math.round(aiCompliance)
            },
            maskingDetected: this.maskingDetected,
            maskingWarnings: this.maskingWarnings.slice(-5), // Last 5 warnings
            autoAdjustments: this.getAutoAdjustments(),
            trend: this.getConfidenceTrend(),
            sampleSizes: {
                patterns: this.patterns.size,
                causalChains: this.causalChains.size,
                solutions: this.solutionOptimization.size,
                crossIssue: this.crossIssueLearning.size
            },
            timestamp: Date.now()
        };
    }
    
    /**
     * Calculate learning metrics for each capability
     */
    calculateLearningMetrics() {
        // Pattern Recognition: Based on pattern frequency and success rate quality
        let patternRecognition = 0;
        if (this.patterns.size > 0) {
            const patternScores = Array.from(this.patterns.values()).map(p => {
                // Score based on frequency (more data = better) and success rate variance (realistic rates)
                const frequencyScore = Math.min(p.frequency / 20, 1) * 50; // Max 50 points for frequency
                const qualityScore = this.assessPatternQuality(p) * 50; // Max 50 points for quality
                return frequencyScore + qualityScore;
            });
            patternRecognition = patternScores.reduce((a, b) => a + b, 0) / patternScores.length;
        }
        
        // Causal Analysis: Based on chain depth and accuracy
        let causalAnalysis = 0;
        if (this.causalChains.size > 0) {
            const chainScores = Array.from(this.causalChains.values()).map(chain => {
                const depthScore = Math.min(chain.length / 5, 1) * 50;
                const completenessScore = (chain.filter(c => c.relationship).length / chain.length) * 50;
                return depthScore + completenessScore;
            });
            causalAnalysis = chainScores.reduce((a, b) => a + b, 0) / chainScores.length;
        }
        
        // Solution Optimization: Based on solution success rates and alternatives
        let solutionOptimization = 0;
        if (this.solutionOptimization.size > 0) {
            const solutionScores = Array.from(this.solutionOptimization.values()).map(sol => {
                const successScore = this.assessSuccessRateQuality(sol.successRate, sol.attempts) * 60;
                const alternativesScore = Math.min(sol.alternatives.length / 3, 1) * 40;
                return successScore + alternativesScore;
            });
            solutionOptimization = solutionScores.reduce((a, b) => a + b, 0) / solutionScores.length;
        }
        
        // Cross-Issue Learning: Based on relationship discovery
        let crossIssueLearning = 0;
        if (this.crossIssueLearning.size > 0) {
            const crossScores = Array.from(this.crossIssueLearning.values()).map(cross => {
                const relationshipScore = Math.min(cross.relatedIssues.length / 5, 1) * 50;
                const solutionScore = Math.min(cross.commonSolutions.length / 3, 1) * 50;
                return relationshipScore + solutionScore;
            });
            crossIssueLearning = crossScores.reduce((a, b) => a + b, 0) / crossScores.length;
        }
        
        // Prediction Accuracy: Based on pattern prediction success (if we track this)
        const predictionAccuracy = this.assessPredictionAccuracy();
        
        // Data Quality: Based on sample sizes and data integrity
        const dataQuality = this.assessDataQuality();
        
        return {
            patternRecognition: Math.max(0, Math.min(100, patternRecognition)),
            causalAnalysis: Math.max(0, Math.min(100, causalAnalysis)),
            solutionOptimization: Math.max(0, Math.min(100, solutionOptimization)),
            crossIssueLearning: Math.max(0, Math.min(100, crossIssueLearning)),
            predictionAccuracy: Math.max(0, Math.min(100, predictionAccuracy)),
            dataQuality: Math.max(0, Math.min(100, dataQuality))
        };
    }
    
    /**
     * Calculate AI Compliance capability
     */
    calculateAICompliance() {
        const aiCompliance = this.stateStore.getState('learning.aiCompliance') || [];
        const complianceConfidence = this.stateStore.getState('learning.aiComplianceConfidence');
        
        if (aiCompliance.length === 0) {
            return 0; // No data yet
        }
        
        // Use stored confidence if available
        if (complianceConfidence && complianceConfidence.successRate !== undefined) {
            return complianceConfidence.successRate * 100;
        }
        
        // Calculate from compliance records
        const successful = aiCompliance.filter(c => c.complianceResult === 'full').length;
        const successRate = successful / aiCompliance.length;
        
        return Math.max(0, Math.min(100, successRate * 100));
    }
    
    /**
     * Calculate overall confidence from metrics
     */
    calculateOverallConfidence(metrics) {
        // Weighted average - all capabilities are important
        const weights = {
            patternRecognition: 0.18,
            causalAnalysis: 0.18,
            solutionOptimization: 0.22,
            crossIssueLearning: 0.13,
            predictionAccuracy: 0.09,
            dataQuality: 0.09,
            aiCompliance: 0.11 // AI Compliance is important
        };
        
        const weightedSum = 
            metrics.patternRecognition * weights.patternRecognition +
            metrics.causalAnalysis * weights.causalAnalysis +
            metrics.solutionOptimization * weights.solutionOptimization +
            metrics.crossIssueLearning * weights.crossIssueLearning +
            metrics.predictionAccuracy * weights.predictionAccuracy +
            metrics.dataQuality * weights.dataQuality +
            metrics.aiCompliance * weights.aiCompliance;
        
        return Math.max(0, Math.min(100, weightedSum));
    }
    
    /**
     * Assess pattern quality - detect masking
     */
    assessPatternQuality(pattern) {
        // Check for suspicious patterns (masking indicators)
        if (pattern.frequency < this.minSampleSize) {
            // Low sample size - don't trust high success rates
            if (pattern.successRate > 0.8) {
                this.flagMasking('pattern', `High success rate (${(pattern.successRate * 100).toFixed(1)}%) with low sample size (${pattern.frequency})`);
                return 0.3; // Penalize low sample sizes with high rates
            }
        }
        
        // Check for unrealistic success rates (100% is suspicious)
        if (pattern.successRate === 1.0 && pattern.frequency < 50) {
            this.flagMasking('pattern', `Perfect success rate (100%) with insufficient samples (${pattern.frequency})`);
            return 0.2; // Heavy penalty for perfect rates with low samples
        }
        
        // Check for sudden jumps (masking attempt)
        if (pattern.solutions.length >= 2) {
            const recent = pattern.solutions.slice(-5);
            const recentSuccessRate = recent.filter(s => s.result === 'success').length / recent.length;
            const overallSuccessRate = pattern.successRate;
            
            if (Math.abs(recentSuccessRate - overallSuccessRate) > 0.5) {
                this.flagMasking('pattern', `Sudden success rate change detected (${(overallSuccessRate * 100).toFixed(1)}% -> ${(recentSuccessRate * 100).toFixed(1)}%)`);
                return 0.4; // Penalize sudden changes
            }
        }
        
        // Normal quality assessment
        const frequencyQuality = Math.min(pattern.frequency / 50, 1);
        const successRateQuality = pattern.successRate; // Realistic success rates are good
        const varianceQuality = this.calculateVarianceQuality(pattern.solutions);
        
        return (frequencyQuality * 0.3 + successRateQuality * 0.4 + varianceQuality * 0.3);
    }
    
    /**
     * Assess success rate quality - detect masking
     */
    assessSuccessRateQuality(successRate, attempts) {
        // Masking detection: 100% success with low attempts is suspicious
        if (successRate === 1.0 && attempts < this.minSampleSize * 2) {
            this.flagMasking('solution', `Perfect success rate (100%) with low attempts (${attempts})`);
            return 0.2;
        }
        
        // Realistic success rates (30-80%) are more trustworthy than extremes
        if (successRate > 0.95 && attempts < 50) {
            this.flagMasking('solution', `Unrealistically high success rate (${(successRate * 100).toFixed(1)}%) with insufficient data`);
            return 0.3;
        }
        
        // Low sample size penalty
        if (attempts < this.minSampleSize) {
            return Math.min(successRate, 0.5); // Cap at 50% for low samples
        }
        
        return successRate;
    }
    
    /**
     * Calculate variance quality - consistent results are better
     */
    calculateVarianceQuality(solutions) {
        if (solutions.length < 3) return 0.5; // Need at least 3 samples
        
        const results = solutions.map(s => s.result === 'success' ? 1 : 0);
        const mean = results.reduce((a, b) => a + b, 0) / results.length;
        const variance = results.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / results.length;
        
        // Low variance (consistent) is good, but too consistent (0 variance) might indicate masking
        if (variance === 0 && results.length < 20) {
            return 0.6; // Slightly penalize perfect consistency with low samples
        }
        
        return 1.0 - Math.min(variance, 0.5); // Prefer consistency
    }
    
    /**
     * Assess prediction accuracy (placeholder - can be enhanced)
     */
    assessPredictionAccuracy() {
        // For now, base on pattern quality
        if (this.patterns.size === 0) return 0;
        
        const avgPatternQuality = Array.from(this.patterns.values())
            .map(p => this.assessPatternQuality(p))
            .reduce((a, b) => a + b, 0) / this.patterns.size;
        
        return avgPatternQuality * 100;
    }
    
    /**
     * Assess data quality
     */
    assessDataQuality() {
        let quality = 0;
        let factors = 0;
        
        // Pattern data quality
        if (this.patterns.size > 0) {
            const avgFrequency = Array.from(this.patterns.values())
                .map(p => p.frequency)
                .reduce((a, b) => a + b, 0) / this.patterns.size;
            quality += Math.min(avgFrequency / 30, 1) * 25;
            factors++;
        }
        
        // Causal chain quality
        if (this.causalChains.size > 0) {
            const avgChainLength = Array.from(this.causalChains.values())
                .map(c => c.length)
                .reduce((a, b) => a + b, 0) / this.causalChains.size;
            quality += Math.min(avgChainLength / 5, 1) * 25;
            factors++;
        }
        
        // Solution optimization quality
        if (this.solutionOptimization.size > 0) {
            const avgAttempts = Array.from(this.solutionOptimization.values())
                .map(s => s.attempts)
                .reduce((a, b) => a + b, 0) / this.solutionOptimization.size;
            quality += Math.min(avgAttempts / 20, 1) * 25;
            factors++;
        }
        
        // Cross-issue learning quality
        if (this.crossIssueLearning.size > 0) {
            const avgFrequency = Array.from(this.crossIssueLearning.values())
                .map(c => c.frequency)
                .reduce((a, b) => a + b, 0) / this.crossIssueLearning.size;
            quality += Math.min(avgFrequency / 10, 1) * 25;
            factors++;
        }
        
        return factors > 0 ? quality / factors : 0;
    }
    
    /**
     * Detect masking attempts
     */
    detectMasking(confidence, metrics) {
        this.maskingDetected = false;
        
        // Check for suspicious patterns across all metrics
        const suspiciousPatterns = [];
        
        // Check for sudden confidence jumps (masking attempt)
        if (this.confidenceHistory.length >= 2) {
            const recent = this.confidenceHistory.slice(-3);
            const avgRecent = recent.reduce((sum, h) => sum + h.confidence, 0) / recent.length;
            const previous = this.confidenceHistory[this.confidenceHistory.length - 4];
            
            if (previous && avgRecent - previous.confidence > 30) {
                suspiciousPatterns.push('Sudden confidence jump detected - possible masking');
                this.maskingDetected = true;
            }
        }
        
        // Check for unrealistic metrics
        if (metrics.solutionOptimization > 95 && this.solutionOptimization.size < 5) {
            suspiciousPatterns.push('Unrealistically high solution optimization with low data');
            this.maskingDetected = true;
        }
        
        if (suspiciousPatterns.length > 0) {
            this.maskingWarnings.push({
                timestamp: Date.now(),
                patterns: suspiciousPatterns,
                confidence,
                metrics
            });
            
            // Keep only last 20 warnings
            if (this.maskingWarnings.length > 20) {
                this.maskingWarnings = this.maskingWarnings.slice(-20);
            }
            
            gameLogger.warn('BrokenPromise', '[LEARNING_ENGINE] Masking detected', {
                patterns: suspiciousPatterns,
                confidence,
                action: 'Masking detected - confidence may be artificially inflated'
            });
        }
    }
    
    /**
     * Flag masking attempt
     */
    flagMasking(source, reason) {
        this.maskingDetected = true;
        this.maskingWarnings.push({
            timestamp: Date.now(),
            source,
            reason,
            severity: 'warning'
        });
        
        gameLogger.warn('BrokenPromise', '[LEARNING_ENGINE] Masking flag', {
            source,
            reason,
            action: 'Masking attempt detected - data quality reduced'
        });
    }
    
    /**
     * Auto-adjust when confidence is low
     */
    autoAdjust(confidence, metrics) {
        const adjustments = [];
        
        // If pattern recognition is low, need more data
        if (metrics.patternRecognition < this.lowConfidenceThreshold) {
            adjustments.push({
                type: 'pattern_recognition',
                action: 'Increase pattern collection - need more fix attempts to learn patterns',
                priority: confidence < this.criticalConfidenceThreshold ? 'critical' : 'high'
            });
        }
        
        // If causal analysis is low, need deeper analysis
        if (metrics.causalAnalysis < this.lowConfidenceThreshold) {
            adjustments.push({
                type: 'causal_analysis',
                action: 'Improve causal chain tracking - need to track more state changes',
                priority: confidence < this.criticalConfidenceThreshold ? 'critical' : 'high'
            });
        }
        
        // If solution optimization is low, need more fix attempts
        if (metrics.solutionOptimization < this.lowConfidenceThreshold) {
            adjustments.push({
                type: 'solution_optimization',
                action: 'Increase fix attempt tracking - need more attempts to optimize solutions',
                priority: confidence < this.criticalConfidenceThreshold ? 'critical' : 'high'
            });
        }
        
        // If data quality is low, need better data collection
        if (metrics.dataQuality < this.lowConfidenceThreshold) {
            adjustments.push({
                type: 'data_quality',
                action: 'Improve data collection - need larger sample sizes and better data integrity',
                priority: 'high'
            });
        }
        
        // Store adjustments
        this.stateStore.updateState('learning.autoAdjustments', adjustments);
        
        // Emit event for monitoring
        this.emit('autoAdjustment', {
            confidence,
            metrics,
            adjustments
        });
        
        gameLogger.info('BrokenPromise', '[LEARNING_ENGINE] Auto-adjustment triggered', {
            confidence: Math.round(confidence),
            adjustments: adjustments.length,
            actions: adjustments.map(a => a.action)
        });
    }
    
    /**
     * Get auto-adjustments
     */
    getAutoAdjustments() {
        return this.stateStore.getState('learning.autoAdjustments') || [];
    }
    
    /**
     * Get confidence trend
     */
    getConfidenceTrend() {
        if (this.confidenceHistory.length < 2) {
            return { direction: 'stable', change: 0 };
        }
        
        const recent = this.confidenceHistory.slice(-5);
        const older = this.confidenceHistory.slice(-10, -5);
        
        if (older.length === 0) {
            return { direction: 'stable', change: 0 };
        }
        
        const recentAvg = recent.reduce((sum, h) => sum + h.confidence, 0) / recent.length;
        const olderAvg = older.reduce((sum, h) => sum + h.confidence, 0) / older.length;
        
        const change = recentAvg - olderAvg;
        
        return {
            direction: change > 5 ? 'improving' : change < -5 ? 'declining' : 'stable',
            change: Math.round(change),
            recentAverage: Math.round(recentAvg),
            previousAverage: Math.round(olderAvg)
        };
    }
    
    /**
     * Start confidence monitoring
     */
    startConfidenceMonitoring() {
        // Check confidence every 5 minutes
        this.confidenceInterval = setInterval(() => {
            this.getLearningConfidence(); // This triggers detection and auto-adjustment
        }, 5 * 60 * 1000);
    }
    
    /**
     * Stop confidence monitoring
     */
    stopConfidenceMonitoring() {
        if (this.confidenceInterval) {
            clearInterval(this.confidenceInterval);
            this.confidenceInterval = null;
        }
    }
    
    // ============================================
    // AI MISTAKE LEARNING & ENHANCED MASKING DETECTION
    // ============================================
    
    /**
     * Learn from AI mistake (giving up, masking, etc.)
     */
    /**
     * Learn from syntax error (PowerShell, JavaScript, etc.)
     */
    learnFromSyntaxError(error) {
        if (!error || !error.type) return;
        
        // Extract pattern
        const pattern = this.extractSyntaxErrorPattern(error);
        
        // Track syntax error pattern
        if (!this.patterns.has(pattern)) {
            this.patterns.set(pattern, {
                frequency: 0,
                successRate: 0,
                contexts: [],
                solutions: []
            });
        }
        
        const patternData = this.patterns.get(pattern);
        patternData.frequency++;
        patternData.contexts.push({
            file: error.filePath,
            line: error.line,
            message: error.message,
            timestamp: Date.now()
        });
        
        // Keep only last 10 contexts
        if (patternData.contexts.length > 10) {
            patternData.contexts.shift();
        }
        
        // Learn solution if provided
        if (error.solution) {
            patternData.solutions.push({
                solution: error.solution,
                timestamp: Date.now()
            });
        }
        
        // Save
        this.save();
        
        gameLogger.info('BrokenPromise', '[LEARNING_ENGINE] Learned from syntax error', {
            pattern,
            file: error.filePath,
            line: error.line
        });
    }
    
    /**
     * Extract pattern from syntax error
     */
    extractSyntaxErrorPattern(error) {
        let pattern = error.type || 'SYNTAX_ERROR';
        
        // Add key indicators
        if (error.message) {
            const keyPhrases = [
                'brace', 'try', 'catch', 'quote', 'syntax', 'unexpected',
                'missing', 'unmatched', 'parse', 'token'
            ];
            
            for (const phrase of keyPhrases) {
                if (error.message.toLowerCase().includes(phrase)) {
                    pattern += `_${phrase}`;
                }
            }
        }
        
        return pattern;
    }
    
    /**
     * Get suggestions for syntax error based on learned patterns
     */
    getSyntaxErrorSuggestions(error) {
        const pattern = this.extractSyntaxErrorPattern(error);
        const patternData = this.patterns.get(pattern);
        
        if (!patternData || patternData.solutions.length === 0) {
            return [];
        }
        
        // Return most recent solutions
        return patternData.solutions
            .slice(-5) // Last 5 solutions
            .map(s => s.solution);
    }
    
    learnFromAIMistake(mistake) {
        // Track mistake pattern
        const mistakePattern = {
            type: mistake.type,
            context: mistake.context || {},
            frequency: 1,
            firstSeen: Date.now(),
            lastSeen: Date.now(),
            examples: [mistake]
        };
        
        const patternKey = `${mistake.type}_${JSON.stringify(mistake.context || {})}`;
        const existing = this.stateStore.getState(`ai.mistakePatterns.${patternKey}`);
        
        if (existing) {
            existing.frequency++;
            existing.lastSeen = Date.now();
            existing.examples.push(mistake);
            if (existing.examples.length > 10) {
                existing.examples.shift();
            }
        } else {
            this.stateStore.updateState(`ai.mistakePatterns.${patternKey}`, mistakePattern);
        }
        
        // Apply confidence penalty
        this.applyMistakePenalty(mistake);
        
        // Learn from mistake
        this.learnFromMistakePattern(mistake);
        
        // Emit event
        this.emit('aiMistakeLearned', mistake);
        
        gameLogger.warn('BrokenPromise', '[LEARNING_ENGINE] Learned from AI mistake', {
            type: mistake.type,
            context: mistake.context,
            action: 'Pattern learned - will prevent similar mistakes'
        });
    }
    
    /**
     * Apply confidence penalty for AI mistake
     */
    applyMistakePenalty(mistake) {
        let penaltyAmount = 5; // Default
        
        if (mistake.type === 'masked_problem') {
            penaltyAmount = 15; // High penalty for masking
        } else if (mistake.type === 'gave_up') {
            penaltyAmount = 20; // Critical penalty for giving up
        } else if (mistake.type === 'superficial_fix') {
            penaltyAmount = 10; // Medium penalty for superficial fixes
        }
        
        // Reduce confidence
        if (this.confidenceHistory.length > 0) {
            const current = this.confidenceHistory[this.confidenceHistory.length - 1];
            const newConfidence = Math.max(0, current.confidence - penaltyAmount);
            
            this.confidenceHistory.push({
                timestamp: Date.now(),
                confidence: newConfidence,
                metrics: current.metrics,
                maskingDetected: true,
                penalty: {
                    reason: mistake.type,
                    amount: penaltyAmount
                }
            });
            
            // Keep only last 100
            if (this.confidenceHistory.length > 100) {
                this.confidenceHistory = this.confidenceHistory.slice(-100);
            }
        }
        
        // Flag masking
        this.flagMasking('ai_mistake', `AI mistake: ${mistake.type} - ${mistake.details || ''}`);
    }
    
    /**
     * Learn from mistake pattern to prevent future mistakes
     */
    learnFromMistakePattern(mistake) {
        // Extract patterns that lead to mistakes
        const patterns = [];
        
        if (mistake.context) {
            // Context patterns
            if (mistake.context.problemType) {
                patterns.push(`problem_${mistake.context.problemType}`);
            }
            if (mistake.context.complexity) {
                patterns.push(`complexity_${mistake.context.complexity}`);
            }
            if (mistake.context.timePressure) {
                patterns.push('time_pressure');
            }
        }
        
        // Store patterns that lead to mistakes
        for (const pattern of patterns) {
            const mistakePatterns = this.stateStore.getState('ai.mistakePatterns') || {};
            if (!mistakePatterns[pattern]) {
                mistakePatterns[pattern] = {
                    pattern,
                    mistakes: [],
                    frequency: 0
                };
            }
            mistakePatterns[pattern].mistakes.push(mistake.type);
            mistakePatterns[pattern].frequency++;
            this.stateStore.updateState('ai.mistakePatterns', mistakePatterns);
        }
    }
    
    /**
     * Detect masking in test changes (enhanced)
     */
    detectTestMasking(oldTest, newTest, context) {
        const maskingIndicators = [];
        
        // Check if test was simplified
        if (oldTest && newTest) {
            // Check if functionality checks were removed
            const oldHasFunctionalityCheck = this.hasFunctionalityCheck(oldTest);
            const newHasFunctionalityCheck = this.hasFunctionalityCheck(newTest);
            
            if (oldHasFunctionalityCheck && !newHasFunctionalityCheck) {
                maskingIndicators.push('Functionality check removed from test');
            }
            
            // Check if execution was removed
            const oldHasExecution = this.hasExecution(oldTest);
            const newHasExecution = this.hasExecution(newTest);
            
            if (oldHasExecution && !newHasExecution) {
                maskingIndicators.push('Test execution removed - test no longer runs functionality');
            }
            
            // Check if assertions were removed
            const oldHasAssertions = this.hasAssertions(oldTest);
            const newHasAssertions = this.hasAssertions(newTest);
            
            if (oldHasAssertions && !newHasAssertions) {
                maskingIndicators.push('Assertions removed from test');
            }
        }
        
        // Check context for masking keywords
        if (context && context.reason) {
            const maskingKeywords = ['simplify', 'easier', 'avoid', 'skip', 'bypass', 'workaround', 'hanging'];
            const reasonLower = context.reason.toLowerCase();
            if (maskingKeywords.some(k => reasonLower.includes(k))) {
                maskingIndicators.push(`Masking keyword in reason: "${context.reason}"`);
            }
        }
        
        if (maskingIndicators.length > 0) {
            this.flagMasking('test_change', `Test masking detected: ${maskingIndicators.join('; ')}`);
            return {
                isMasking: true,
                indicators: maskingIndicators,
                severity: 'critical'
            };
        }
        
        return { isMasking: false, indicators: [] };
    }
    
    /**
     * Check if test has functionality check
     */
    hasFunctionalityCheck(testCode) {
        if (!testCode) return false;
        const code = testCode.toLowerCase();
        return code.includes('result') || 
               code.includes('verify') || 
               code.includes('assert') || 
               code.includes('expect') ||
               code.includes('should') ||
               code.includes('pass') ||
               code.includes('fail') ||
               code.includes('equal') ||
               code.includes('match');
    }
    
    /**
     * Check if test has execution
     */
    hasExecution(testCode) {
        if (!testCode) return false;
        const code = testCode.toLowerCase();
        return code.includes('await') || 
               code.includes('()') || 
               code.includes('call') ||
               code.includes('execute') ||
               code.includes('run') ||
               code.includes('timeoperation') ||
               code.includes('processline') ||
               code.includes('recorderror');
    }
    
    /**
     * Check if test has assertions
     */
    hasAssertions(testCode) {
        if (!testCode) return false;
        const code = testCode.toLowerCase();
        return code.includes('assert') || 
               code.includes('expect') || 
               code.includes('should') ||
               code.includes('equal') ||
               code.includes('match') ||
               code.includes('be') ||
               code.includes('have');
    }
    
    /**
     * Verify fix quality (not just that tests pass)
     */
    verifyFixQuality(fix, originalProblem) {
        const quality = {
            score: 100,
            issues: [],
            warnings: []
        };
        
        // Check if fix addresses root cause
        if (originalProblem && fix) {
            const problemDesc = (originalProblem.description || '').toLowerCase();
            const fixDesc = (fix.description || '').toLowerCase();
            
            // Check if fix mentions the problem
            const problemWords = problemDesc.split(/\s+/).filter(w => w.length > 4);
            const fixWords = fixDesc.split(/\s+/).filter(w => w.length > 4);
            const matchingWords = problemWords.filter(w => fixWords.includes(w));
            
            if (matchingWords.length === 0) {
                quality.issues.push('Fix does not mention original problem');
                quality.score -= 30;
            }
            
            // Check for workaround keywords
            const workaroundKeywords = ['workaround', 'bypass', 'skip', 'avoid', 'ignore', 'simplify', 'easier'];
            if (workaroundKeywords.some(k => fixDesc.includes(k))) {
                quality.issues.push('Fix appears to be a workaround');
                quality.score -= 50;
            }
        }
        
        // Check if test was changed
        if (fix.testChange) {
            const masking = this.detectTestMasking(fix.oldTest, fix.testChange, fix);
            if (masking.isMasking) {
                quality.issues.push(`Test masking detected: ${masking.indicators.join('; ')}`);
                quality.score -= 40;
            }
        }
        
        // Check if fix has verification
        if (!fix.verification || !fix.verification.verified) {
            quality.warnings.push('Fix not verified - may not actually work');
            quality.score -= 10;
        }
        
        quality.score = Math.max(0, quality.score);
        
        // Apply confidence penalty if quality is low
        if (quality.score < 50) {
            this.flagMasking('fix_quality', `Low fix quality: ${quality.issues.join('; ')}`);
        }
        
        return quality;
    }
    
    /**
     * Get learning report (enhanced with confidence)
     */
    getLearningReport() {
        const confidence = this.getLearningConfidence();
        
        return {
            confidence, // ALWAYS include confidence - cannot be masked
            patterns: {
                total: this.patterns.size,
                topPatterns: Array.from(this.patterns.entries())
                    .sort((a, b) => b[1].frequency - a[1].frequency)
                    .slice(0, 10)
                    .map(([key, data]) => ({
                        pattern: key,
                        frequency: data.frequency,
                        successRate: data.successRate,
                        quality: this.assessPatternQuality(data)
                    }))
            },
            causalChains: {
                total: this.causalChains.size,
                recent: Array.from(this.causalChains.entries())
                    .slice(-10)
                    .map(([issueId, chain]) => ({
                        issueId,
                        chainLength: chain.length,
                        chain
                    }))
            },
            solutionOptimization: {
                total: this.solutionOptimization.size,
                optimized: Array.from(this.solutionOptimization.entries())
                    .map(([issueType, data]) => ({
                        issueType,
                        bestSolution: data.bestSolution,
                        successRate: data.successRate,
                        attempts: data.attempts,
                        quality: this.assessSuccessRateQuality(data.successRate, data.attempts),
                        alternatives: data.alternatives.length
                    }))
            },
            crossIssueLearning: {
                total: this.crossIssueLearning.size,
                relationships: Array.from(this.crossIssueLearning.entries())
                    .map(([pattern, data]) => ({
                        pattern,
                        frequency: data.frequency,
                        relatedIssues: data.relatedIssues.length,
                        commonSolutions: data.commonSolutions.length
                    }))
            }
        };
    }
    
    /**
     * Load learning data - WITH CLEANUP
     */
    load() {
        try {
            const patterns = this.stateStore.getState('learning.patterns');
            if (patterns && Array.isArray(patterns)) {
                // Clean up and generalize existing patterns
                const PatternCleanup = require('./PatternCleanup');
                const cleanedPatterns = PatternCleanup.cleanupPatterns(patterns);
                
                // Load cleaned patterns
                for (const [key, value] of cleanedPatterns) {
                    this.patterns.set(key, value);
                }
                
                // Save cleaned patterns back to state store
                if (cleanedPatterns.length !== patterns.length || 
                    JSON.stringify(cleanedPatterns) !== JSON.stringify(patterns)) {
                    // Patterns were cleaned, save them
                    this.stateStore.updateState('learning.patterns', cleanedPatterns);
                }
            }
            
            const causalChains = this.stateStore.getState('learning.causalChains') || {};
            this.causalChains = new Map(Object.entries(causalChains));
            
            const solutionOptimization = this.stateStore.getState('learning.solutionOptimization') || {};
            this.solutionOptimization = new Map(Object.entries(solutionOptimization));
            
            const crossIssueLearning = this.stateStore.getState('learning.crossIssueLearning') || {};
            this.crossIssueLearning = new Map(Object.entries(crossIssueLearning));
            
            const initializationTimings = this.stateStore.getState('learning.initializationTimings') || {};
            this.initializationTimings = new Map(Object.entries(initializationTimings));
            
            const getterTimings = this.stateStore.getState('learning.getterTimings') || {};
            this.getterTimings = new Map(Object.entries(getterTimings));
            
            const synchronousOperations = this.stateStore.getState('learning.synchronousOperations') || {};
            this.synchronousOperations = new Map(Object.entries(synchronousOperations));
            
            const circularDependencies = this.stateStore.getState('learning.circularDependencies') || {};
            this.circularDependencies = new Map(Object.entries(circularDependencies));
            
            const blockingChains = this.stateStore.getState('learning.blockingChains') || {};
            this.blockingChains = new Map(Object.entries(blockingChains));
            
            const debuggingPatterns = this.stateStore.getState('learning.debuggingPatterns') || {};
            this.debuggingPatterns = new Map(Object.entries(debuggingPatterns));
            
            const misdiagnosisPatterns = this.stateStore.getState('learning.misdiagnosisPatterns') || {};
            this.misdiagnosisPatterns = new Map(Object.entries(misdiagnosisPatterns));
            
            const generalizedPatterns = this.stateStore.getState('learning.generalizedPatterns') || [];
            // Handle both array of entries and object format
            if (Array.isArray(generalizedPatterns)) {
                this.generalizedPatterns = new Map(generalizedPatterns);
            } else {
                this.generalizedPatterns = new Map(Object.entries(generalizedPatterns));
            }
            
            const generalizationRules = this.stateStore.getState('learning.generalizationRules') || [];
            // Handle both array of entries and object format
            if (Array.isArray(generalizationRules)) {
                this.generalizationRules = new Map(generalizationRules);
            } else {
                this.generalizationRules = new Map(Object.entries(generalizationRules));
            }
        } catch (error) {
            // DO NOT log to console - errors are for AI only, not user
            // Re-throw so UniversalErrorHandler can catch it
            throw error;
        }
    }
    
    /**
     * Save learning data
     * CRITICAL: Triggers immediate disk save to ensure persistence
     */
    save() {
        try {
            this.stateStore.updateState('learning.patterns', Array.from(this.patterns.entries()));
            this.stateStore.updateState('learning.causalChains', Object.fromEntries(this.causalChains));
            this.stateStore.updateState('learning.solutionOptimization', Object.fromEntries(this.solutionOptimization));
            this.stateStore.updateState('learning.crossIssueLearning', Object.fromEntries(this.crossIssueLearning));
            this.stateStore.updateState('learning.initializationTimings', Object.fromEntries(this.initializationTimings));
            this.stateStore.updateState('learning.getterTimings', Object.fromEntries(this.getterTimings));
            this.stateStore.updateState('learning.synchronousOperations', Object.fromEntries(this.synchronousOperations));
            this.stateStore.updateState('learning.circularDependencies', Object.fromEntries(this.circularDependencies));
            this.stateStore.updateState('learning.blockingChains', Object.fromEntries(this.blockingChains));
            this.stateStore.updateState('learning.debuggingPatterns', Object.fromEntries(this.debuggingPatterns));
            this.stateStore.updateState('learning.generalizedPatterns', Array.from(this.generalizedPatterns.entries()));
            this.stateStore.updateState('learning.generalizationRules', Array.from(this.generalizationRules.entries()));
            this.stateStore.updateState('learning.misdiagnosisPatterns', Object.fromEntries(this.misdiagnosisPatterns));
            
            // Store failed methods (what NOT to do)
            const failedMethods = this.stateStore.getState('learning.failedMethods') || {};
            this.stateStore.updateState('learning.failedMethods', failedMethods);
            
            // CRITICAL: Ensure fixAttempts are saved (they're stored by storeFixAttempt but need to be preserved)
            const fixAttempts = this.stateStore.getState('learning.fixAttempts') || {};
            this.stateStore.updateState('learning.fixAttempts', fixAttempts);
            
            // CRITICAL: Trigger immediate disk save to ensure learning data is persisted
            // Don't wait for auto-save interval - learning data is too valuable to lose
            this.stateStore.save();
        } catch (error) {
            // DO NOT log to console - errors are for AI only, not user
            // Re-throw so UniversalErrorHandler can catch it
            throw error;
        }
    }
    
    // ============================================
    // INITIALIZATION HANG PATTERN DETECTION
    // ============================================
    
    /**
     * Track initialization timing for a component
     * Detects hangs during initialization
     */
    trackInitialization(componentName, startTime, endTime = null) {
        const timing = this.initializationTimings.get(componentName) || {
            component: componentName,
            calls: 0,
            totalTime: 0,
            maxTime: 0,
            hangs: 0,
            lastStart: null,
            lastEnd: null
        };
        
        timing.calls++;
        timing.lastStart = startTime;
        
        if (endTime) {
            const duration = endTime - startTime;
            timing.lastEnd = endTime;
            timing.totalTime += duration;
            timing.maxTime = Math.max(timing.maxTime, duration);
            
            // Detect hang: initialization taking > 5 seconds
            if (duration > 5000) {
                timing.hangs++;
                this.detectInitializationHang(componentName, duration);
            }
        } else {
            // No end time - likely hung
            timing.hangs++;
            this.detectInitializationHang(componentName, null);
        }
        
        this.initializationTimings.set(componentName, timing);
        this.save();
    }
    
    /**
     * Detect initialization hang pattern
     */
    detectInitializationHang(componentName, duration) {
        const pattern = {
            type: 'initialization_hang',
            component: componentName,
            duration: duration,
            timestamp: Date.now(),
            severity: duration && duration > 10000 ? 'critical' : 'high'
        };
        
        // Learn this pattern
        const patternKey = `init_hang:${componentName}`;
        const existing = this.patterns.get(patternKey) || {
            frequency: 0,
            successes: 0,
            failures: 0,
            contexts: [],
            solutions: []
        };
        
        existing.frequency++;
        existing.failures++; // Hangs are failures
        existing.contexts.push({
            duration,
            timestamp: Date.now()
        });
        
        this.patterns.set(patternKey, existing);
        
        // Report to issue detector
        if (this.issueDetector) {
            this.issueDetector.detectIssue({
                type: 'INITIALIZATION_HANG',
                severity: pattern.severity,
                method: 'learningEngine',
                details: pattern
            });
        }
        
        gameLogger.warn('BrokenPromise', '[LEARNING_ENGINE] Initialization hang detected', pattern);
    }
    
    // ============================================
    // GETTER HANG PATTERN DETECTION
    // ============================================
    
    /**
     * Track getter/method call timing
     * Detects "works in constructor but hangs in getter" pattern
     */
    trackGetterCall(methodName, startTime, endTime = null, context = {}) {
        const timing = this.getterTimings.get(methodName) || {
            method: methodName,
            calls: 0,
            totalTime: 0,
            avgTime: 0,
            maxTime: 0,
            hangs: 0,
            contexts: []
        };
        
        timing.calls++;
        
        if (endTime) {
            const duration = endTime - startTime;
            timing.totalTime += duration;
            timing.avgTime = timing.totalTime / timing.calls;
            timing.maxTime = Math.max(timing.maxTime, duration);
            
            // Detect hang: getter taking > 1 second (getters should be instant)
            if (duration > 1000) {
                timing.hangs++;
                this.detectGetterHang(methodName, duration, context);
            }
        } else {
            // No end time - likely hung
            timing.hangs++;
            this.detectGetterHang(methodName, null, context);
        }
        
        timing.contexts.push({
            startTime,
            endTime,
            duration: endTime ? endTime - startTime : null,
            context
        });
        
        // Keep only last 50 contexts
        if (timing.contexts.length > 50) {
            timing.contexts = timing.contexts.slice(-50);
        }
        
        this.getterTimings.set(methodName, timing);
        this.save();
    }
    
    /**
     * Detect getter hang pattern
     * Specifically detects "works in constructor but hangs in getter"
     */
    detectGetterHang(methodName, duration, context) {
        // Check if constructor worked but getter hangs
        const initTiming = this.initializationTimings.get(context.component || 'unknown');
        const pattern = {
            type: 'getter_hang',
            method: methodName,
            duration: duration,
            timestamp: Date.now(),
            constructorWorked: initTiming && initTiming.lastEnd !== null,
            severity: duration && duration > 5000 ? 'critical' : 'high'
        };
        
        // Learn this pattern
        const patternKey = `getter_hang:${methodName}`;
        const existing = this.patterns.get(patternKey) || {
            frequency: 0,
            successes: 0,
            failures: 0,
            contexts: [],
            solutions: []
        };
        
        existing.frequency++;
        existing.failures++; // Hangs are failures
        existing.contexts.push({
            duration,
            constructorWorked: pattern.constructorWorked,
            timestamp: Date.now()
        });
        
        this.patterns.set(patternKey, existing);
        
        // If constructor worked but getter hangs, this is the specific pattern we need to catch
        if (pattern.constructorWorked) {
            const specificPattern = {
                type: 'constructor_works_getter_hangs',
                component: context.component,
                method: methodName,
                timestamp: Date.now(),
                severity: 'critical'
            };
            
            // Learn this specific pattern
            const specificKey = `constructor_works_getter_hangs:${context.component}:${methodName}`;
            const specificExisting = this.patterns.get(specificKey) || {
                frequency: 0,
                successes: 0,
                failures: 0,
                contexts: [],
                solutions: []
            };
            
            specificExisting.frequency++;
            specificExisting.failures++;
            specificExisting.contexts.push(specificPattern);
            
            this.patterns.set(specificKey, specificExisting);
            
            // Report to issue detector
            if (this.issueDetector) {
                this.issueDetector.detectIssue({
                    type: 'CONSTRUCTOR_WORKS_GETTER_HANGS',
                    severity: 'critical',
                    method: 'learningEngine',
                    details: specificPattern
                });
            }
            
            gameLogger.error('BrokenPromise', '[LEARNING_ENGINE] Constructor works but getter hangs', specificPattern);
        }
        
        // Report general getter hang
        if (this.issueDetector) {
            this.issueDetector.detectIssue({
                type: 'GETTER_HANG',
                severity: pattern.severity,
                method: 'learningEngine',
                details: pattern
            });
        }
        
        gameLogger.warn('BrokenPromise', '[LEARNING_ENGINE] Getter hang detected', pattern);
    }
    
    // ============================================
    // SYNCHRONOUS OPERATION DETECTION
    // ============================================
    
    /**
     * Track synchronous file/state operations in getters
     * Detects blocking operations that should be async
     */
    trackSynchronousOperation(methodName, operationType, context = {}) {
        const ops = this.synchronousOperations.get(methodName) || {
            method: methodName,
            fileOps: 0,
            stateOps: 0,
            blockingOps: 0,
            operations: []
        };
        
        if (operationType === 'file') {
            ops.fileOps++;
        } else if (operationType === 'state') {
            ops.stateOps++;
        } else if (operationType === 'blocking') {
            ops.blockingOps++;
        }
        
        ops.operations.push({
            type: operationType,
            timestamp: Date.now(),
            context
        });
        
        // Keep only last 100 operations
        if (ops.operations.length > 100) {
            ops.operations = ops.operations.slice(-100);
        }
        
        this.synchronousOperations.set(methodName, ops);
        
        // Detect pattern: synchronous operations in getters
        if (ops.fileOps > 0 || ops.stateOps > 0 || ops.blockingOps > 0) {
            this.detectSynchronousOperationPattern(methodName, ops);
        }
        
        this.save();
    }
    
    /**
     * Detect synchronous operation pattern
     */
    detectSynchronousOperationPattern(methodName, ops) {
        const pattern = {
            type: 'synchronous_operation_in_getter',
            method: methodName,
            fileOps: ops.fileOps,
            stateOps: ops.stateOps,
            blockingOps: ops.blockingOps,
            timestamp: Date.now(),
            severity: ops.blockingOps > 0 ? 'critical' : ops.fileOps > 0 ? 'high' : 'medium'
        };
        
        // Learn this pattern
        const patternKey = `sync_op_in_getter:${methodName}`;
        const existing = this.patterns.get(patternKey) || {
            frequency: 0,
            successes: 0,
            failures: 0,
            contexts: [],
            solutions: []
        };
        
        existing.frequency++;
        existing.failures++; // Synchronous ops in getters are failures
        existing.contexts.push(pattern);
        
        this.patterns.set(patternKey, existing);
        
        // Report to issue detector
        if (this.issueDetector) {
            this.issueDetector.detectIssue({
                type: 'SYNCHRONOUS_OPERATION_IN_GETTER',
                severity: pattern.severity,
                method: 'learningEngine',
                details: pattern
            });
        }
        
        gameLogger.warn('BrokenPromise', '[LEARNING_ENGINE] Synchronous operation in getter detected', pattern);
    }
    
    /**
     * Get initialization hang patterns
     */
    getInitializationHangPatterns() {
        const hangs = [];
        for (const [component, timing] of this.initializationTimings.entries()) {
            if (timing.hangs > 0) {
                hangs.push({
                    component,
                    hangs: timing.hangs,
                    calls: timing.calls,
                    maxTime: timing.maxTime,
                    avgTime: timing.totalTime / timing.calls,
                    hangRate: timing.hangs / timing.calls
                });
            }
        }
        return hangs.sort((a, b) => b.hangRate - a.hangRate);
    }
    
    /**
     * Get getter hang patterns
     */
    getGetterHangPatterns() {
        const hangs = [];
        for (const [method, timing] of this.getterTimings.entries()) {
            if (timing.hangs > 0) {
                hangs.push({
                    method,
                    hangs: timing.hangs,
                    calls: timing.calls,
                    maxTime: timing.maxTime,
                    avgTime: timing.avgTime,
                    hangRate: timing.hangs / timing.calls
                });
            }
        }
        return hangs.sort((a, b) => b.hangRate - a.hangRate);
    }
    
    /**
     * Get synchronous operation patterns
     */
    getSynchronousOperationPatterns() {
        const patterns = [];
        for (const [method, ops] of this.synchronousOperations.entries()) {
            if (ops.fileOps > 0 || ops.stateOps > 0 || ops.blockingOps > 0) {
                patterns.push({
                    method,
                    fileOps: ops.fileOps,
                    stateOps: ops.stateOps,
                    blockingOps: ops.blockingOps,
                    totalOps: ops.fileOps + ops.stateOps + ops.blockingOps
                });
            }
        }
        return patterns.sort((a, b) => b.totalOps - a.totalOps);
    }
    
    // CRITICAL PROBLEM-SOLVING PATTERNS (learned from actual successful fixes)
    
    /**
     * Track circular dependency pattern
     * Pattern: getState → recordSuccess → updateState → getState (infinite loop)
     * Solution: Break the cycle by making operations async (setImmediate)
     */
    trackCircularDependency(chain, solution) {
        const chainKey = Array.isArray(chain) ? chain.join(' → ') : chain;
        const existing = this.circularDependencies.get(chainKey) || {
            chain: Array.isArray(chain) ? chain : [chain],
            frequency: 0,
            solutions: [],
            firstSeen: Date.now(),
            lastSeen: Date.now()
        };
        
        existing.frequency++;
        existing.lastSeen = Date.now();
        
        // Track successful solutions
        if (solution && !existing.solutions.find(s => s.method === solution.method)) {
            existing.solutions.push({
                method: solution.method,
                description: solution.description || 'Break cycle with async operation',
                successRate: 1.0, // Proven solution
                timestamp: Date.now()
            });
        }
        
        this.circularDependencies.set(chainKey, existing);
        this.save();
        
        gameLogger.info('BrokenPromise', '[LEARNING_ENGINE] Circular dependency tracked', {
            chain: chainKey,
            frequency: existing.frequency,
            solutions: existing.solutions.length
        });
    }
    
    /**
     * Detect circular dependency in method calls
     * Analyzes call stack to find circular patterns
     */
    detectCircularDependency(methodCalls) {
        if (!Array.isArray(methodCalls) || methodCalls.length < 3) {
            return null;
        }
        
        // Look for patterns like: getState → recordSuccess → updateState → getState
        for (let i = 0; i < methodCalls.length - 2; i++) {
            const start = methodCalls[i];
            const middle = methodCalls[i + 1];
            const end = methodCalls[i + 2];
            
            // Check if we loop back to start
            if (end === start || (i + 3 < methodCalls.length && methodCalls[i + 3] === start)) {
                const chain = methodCalls.slice(i, i + (end === start ? 3 : 4));
                const pattern = {
                    type: 'CIRCULAR_DEPENDENCY',
                    chain: chain,
                    severity: 'critical',
                    solution: {
                        method: 'make_async',
                        description: 'Break circular dependency by making operations async (use setImmediate)',
                        confidence: 0.95
                    }
                };
                
                // Track this pattern
                this.trackCircularDependency(chain, pattern.solution);
                
                return pattern;
            }
        }
        
        return null;
    }
    
    /**
     * Track blocking chain pattern
     * Pattern: Synchronous operations that block execution
     * Solution: Make operations async (setImmediate, async/await)
     */
    trackBlockingChain(chain, solution) {
        const chainKey = Array.isArray(chain) ? chain.join(' → ') : chain;
        const existing = this.blockingChains.get(chainKey) || {
            chain: Array.isArray(chain) ? chain : [chain],
            frequency: 0,
            solutions: [],
            firstSeen: Date.now(),
            lastSeen: Date.now()
        };
        
        existing.frequency++;
        existing.lastSeen = Date.now();
        
        // Track successful solutions
        if (solution && !existing.solutions.find(s => s.method === solution.method)) {
            existing.solutions.push({
                method: solution.method,
                description: solution.description || 'Make operations async to break blocking chain',
                successRate: 1.0, // Proven solution
                timestamp: Date.now()
            });
        }
        
        this.blockingChains.set(chainKey, existing);
        this.save();
        
        gameLogger.info('BrokenPromise', '[LEARNING_ENGINE] Blocking chain tracked', {
            chain: chainKey,
            frequency: existing.frequency,
            solutions: existing.solutions.length
        });
    }
    
    /**
     * Detect blocking chain in operations
     * Identifies synchronous operations that should be async
     */
    detectBlockingChain(operations) {
        if (!Array.isArray(operations)) {
            return null;
        }
        
        // Look for patterns of synchronous operations that block
        const blockingOps = operations.filter(op => 
            op.type === 'sync' || 
            op.blocking === true || 
            (op.method && (op.method.includes('Sync') || op.method.includes('readFileSync') || op.method.includes('writeFileSync')))
        );
        
        if (blockingOps.length >= 2) {
            const chain = blockingOps.map(op => op.method || op.type);
            const pattern = {
                type: 'BLOCKING_CHAIN',
                chain: chain,
                severity: 'high',
                solution: {
                    method: 'make_async',
                    description: 'Break blocking chain by making operations async (setImmediate, async/await)',
                    confidence: 0.9
                }
            };
            
            // Track this pattern
            this.trackBlockingChain(chain, pattern.solution);
            
            return pattern;
        }
        
        return null;
    }
    
    /**
     * Track manual debugging pattern
     * Pattern: Testing what worked vs. what hung to identify root cause
     * Solution: Systematic testing approach
     */
    trackManualDebugging(context, solution) {
        const contextKey = `${context.component || 'unknown'}:${context.issue || 'unknown'}`;
        const existing = this.debuggingPatterns.get(contextKey) || {
            method: 'manual_debugging',
            frequency: 0,
            successes: 0,
            failures: 0,
            contexts: [],
            solutions: [],
            firstSeen: Date.now(),
            lastSeen: Date.now()
        };
        
        existing.frequency++;
        existing.lastSeen = Date.now();
        existing.contexts.push(context);
        
        if (solution && solution.result === 'success') {
            existing.successes++;
            if (!existing.solutions.find(s => s.description === solution.description)) {
                existing.solutions.push({
                    description: solution.description,
                    steps: solution.steps || [],
                    result: 'success',
                    timestamp: Date.now()
                });
            }
        } else {
            existing.failures++;
        }
        
        existing.successRate = existing.successes / existing.frequency;
        this.debuggingPatterns.set(contextKey, existing);
        this.save();
        
        gameLogger.info('BrokenPromise', '[LEARNING_ENGINE] Manual debugging pattern tracked', {
            context: contextKey,
            frequency: existing.frequency,
            successRate: existing.successRate
        });
    }
    
    /**
     * Get solutions for circular dependency issues
     */
    getCircularDependencySolutions(chain) {
        const chainKey = Array.isArray(chain) ? chain.join(' → ') : chain;
        const pattern = this.circularDependencies.get(chainKey);
        
        if (pattern && pattern.solutions.length > 0) {
            return pattern.solutions.map(s => ({
                method: s.method,
                description: s.description,
                confidence: s.successRate,
                source: 'circular_dependency_pattern'
            }));
        }
        
        // Default solution if pattern not found
        return [{
            method: 'make_async',
            description: 'Break circular dependency by making operations async (use setImmediate to break the cycle)',
            confidence: 0.85,
            source: 'learned_pattern'
        }];
    }
    
    /**
     * Get solutions for blocking chain issues
     */
    getBlockingChainSolutions(chain) {
        const chainKey = Array.isArray(chain) ? chain.join(' → ') : chain;
        const pattern = this.blockingChains.get(chainKey);
        
        if (pattern && pattern.solutions.length > 0) {
            return pattern.solutions.map(s => ({
                method: s.method,
                description: s.description,
                confidence: s.successRate,
                source: 'blocking_chain_pattern'
            }));
        }
        
        // Default solution if pattern not found
        return [{
            method: 'make_async',
            description: 'Break blocking chain by making operations async (use setImmediate or async/await)',
            confidence: 0.85,
            source: 'learned_pattern'
        }];
    }
    
    /**
     * Get manual debugging approach for an issue
     */
    getManualDebuggingApproach(issue) {
        const contextKey = `${issue.component || 'unknown'}:${issue.type || 'unknown'}`;
        const pattern = this.debuggingPatterns.get(contextKey);
        
        if (pattern && pattern.solutions.length > 0) {
            // Return the most successful debugging approach
            const bestSolution = pattern.solutions.sort((a, b) => {
                // Prefer solutions with more steps (more detailed)
                return (b.steps?.length || 0) - (a.steps?.length || 0);
            })[0];
            
            return {
                method: 'manual_debugging',
                description: bestSolution.description,
                steps: bestSolution.steps || [],
                confidence: pattern.successRate,
                source: 'debugging_pattern'
            };
        }
        
        // Default debugging approach
        return {
            method: 'manual_debugging',
            description: 'Systematic testing: Test what works vs. what hangs to identify root cause',
            steps: [
                '1. Test each component individually to isolate the issue',
                '2. Compare working vs. hanging scenarios',
                '3. Identify the specific operation that causes the hang',
                '4. Check for circular dependencies or blocking operations',
                '5. Apply fix (make async, break cycle, etc.)',
                '6. Verify fix resolves the issue'
            ],
            confidence: 0.8,
            source: 'learned_approach'
        };
    }
    
    // ============================================
    // MISDIAGNOSIS PREVENTION
    // ============================================
    
    /**
     * Track misdiagnosis patterns
     * Learns from wrong approaches to prevent repeating them
     */
    trackMisdiagnosis(attempt) {
        const pattern = this.detectSpecificPattern(attempt);
        
        // Check if this is a misdiagnosis pattern
        if (pattern && pattern.includes('misdiagnosis')) {
            const misdiagnosisKey = pattern;
            const existing = this.misdiagnosisPatterns.get(misdiagnosisKey) || {
                pattern: misdiagnosisKey,
                symptom: attempt.errorMessage || attempt.issueType || '',
                commonMisdiagnosis: attempt.fixMethod || attempt.fixDetails?.wrongApproach || '',
                actualRootCause: attempt.fixDetails?.actualRootCause || '',
                correctApproach: attempt.fixDetails?.correctApproach || '',
                frequency: 0,
                timeWasted: 0,
                successRate: 0,
                successes: 0,
                failures: 0
            };
            
            existing.frequency++;
            
            // Track time wasted (if provided)
            if (attempt.fixDetails?.timeWasted) {
                existing.timeWasted += attempt.fixDetails.timeWasted;
            }
            
            // Track success/failure
            if (attempt.result === 'success') {
                existing.successes++;
            } else {
                existing.failures++;
            }
            
            existing.successRate = existing.successes / existing.frequency;
            
            // Update actual root cause and correct approach if this was a successful fix
            if (attempt.result === 'success' && attempt.fixDetails) {
                if (attempt.fixDetails.actualRootCause) {
                    existing.actualRootCause = attempt.fixDetails.actualRootCause;
                }
                if (attempt.fixDetails.correctApproach) {
                    existing.correctApproach = attempt.fixDetails.correctApproach;
                }
            }
            
            this.misdiagnosisPatterns.set(misdiagnosisKey, existing);
            
            // Save to state store
            this.stateStore.updateState('learning.misdiagnosisPatterns', 
                Object.fromEntries(this.misdiagnosisPatterns));
        }
    }
    
    /**
     * Get misdiagnosis prevention advice for an issue
     * MISDIAGNOSIS-FIRST: Core prevention mechanism
     */
    getMisdiagnosisPrevention(issueType, errorMessage, component) {
        const prevention = {
            warnings: [],
            correctApproach: null,
            commonMisdiagnosis: null,
            timeSavings: null,
            failedMethods: []
        };
        
        // Check for matching misdiagnosis patterns
        for (const [patternKey, pattern] of this.misdiagnosisPatterns.entries()) {
            // Check if symptom matches (flexible matching)
            let symptomMatch = false;
            if (pattern.symptom) {
                const symptomPatterns = pattern.symptom.split('|');
                const searchText = (errorMessage || issueType || '').toLowerCase();
                symptomMatch = symptomPatterns.some(sp => searchText.includes(sp.trim().toLowerCase()));
            }
            
            // Check if component matches
            const componentMatch = !component || 
                !pattern.component || 
                pattern.component === component || 
                pattern.component === 'any' ||
                (component.toLowerCase().includes('powershell') && pattern.component === 'PowerShell');
            
            // Check if issue type matches
            const issueTypeMatch = !issueType || 
                !pattern.issueType ||
                issueType.toLowerCase().includes(pattern.issueType.toLowerCase()) ||
                pattern.issueType.toLowerCase().includes(issueType.toLowerCase());
            
            // Match if symptom OR issue type matches, and component matches
            if ((symptomMatch || issueTypeMatch) && componentMatch) {
                // Even if frequency is 0 (initialized pattern), still warn (it's a known pattern)
                const shouldWarn = pattern.frequency >= 1 || (pattern.frequency === 0 && pattern.actualRootCause);
                
                if (shouldWarn) {
                    prevention.warnings.push({
                        type: 'MISDIAGNOSIS_WARNING',
                        message: `Common misdiagnosis detected: ${pattern.commonMisdiagnosis}`,
                        actualRootCause: pattern.actualRootCause,
                        correctApproach: pattern.correctApproach,
                        frequency: pattern.frequency || 0,
                        timeWasted: pattern.timeWasted || 0,
                        successRate: pattern.successRate || 0,
                        pattern: patternKey
                    });
                    
                    if (!prevention.correctApproach && pattern.correctApproach) {
                        prevention.correctApproach = pattern.correctApproach;
                    }
                    if (!prevention.commonMisdiagnosis && pattern.commonMisdiagnosis) {
                        prevention.commonMisdiagnosis = pattern.commonMisdiagnosis;
                    }
                    if (!prevention.timeSavings) {
                        prevention.timeSavings = pattern.timeWasted || 0;
                    }
                }
            }
        }
        
        // Also check failed methods for this issue type
        const failedMethods = this.stateStore.getState('learning.failedMethods') || {};
        const issueFailedMethods = failedMethods[issueType] || [];
        if (issueFailedMethods.length > 0) {
            prevention.failedMethods = issueFailedMethods.map(m => ({
                method: m.method,
                frequency: m.frequency,
                timeWasted: m.timeWasted,
                lastAttempt: m.lastAttempt
            }));
        }
        
        return prevention;
    }
    
    // ============================================
    // PATTERN LEARNER IMPROVEMENTS (Phase 7)
    // ============================================
    
    /**
     * Improve contracts based on learned patterns
     */
    improveContracts() {
        const improvements = [];
        
        // Analyze successful fixes to improve contracts
        for (const [patternKey, pattern] of this.patterns.entries()) {
            if (pattern.successRate > 0.8 && pattern.frequency > 10) {
                // High success rate pattern - can be used to improve contracts
                improvements.push({
                    pattern: patternKey,
                    successRate: pattern.successRate,
                    suggestion: `Use pattern ${patternKey} in contracts (${(pattern.successRate * 100).toFixed(1)}% success)`
                });
            }
        }
        
        // Store improvements
        this.stateStore.updateState('learning.contractImprovements', improvements);
        
        return improvements;
    }
    
    /**
     * Improve detection patterns based on learned patterns
     */
    improveDetectionPatterns() {
        const improvements = [];
        
        // Analyze which patterns lead to successful detection
        for (const [patternKey, pattern] of this.patterns.entries()) {
            if (pattern.frequency > 5) {
                // Frequently occurring pattern - should be in detection
                improvements.push({
                    pattern: patternKey,
                    frequency: pattern.frequency,
                    suggestion: `Add pattern ${patternKey} to detection (occurs ${pattern.frequency} times)`
                });
            }
        }
        
        // Store improvements
        this.stateStore.updateState('learning.detectionPatternImprovements', improvements);
        
        return improvements;
    }
    
    /**
     * Generate new test cases based on learned patterns
     */
    generateTestCases() {
        const testCases = [];
        
        // Generate test cases for high-frequency patterns
        for (const [patternKey, pattern] of this.patterns.entries()) {
            if (pattern.frequency > 5 && pattern.successRate < 0.5) {
                // High frequency, low success - needs testing
                testCases.push({
                    pattern: patternKey,
                    description: `Test pattern: ${patternKey}`,
                    expectedBehavior: 'Should handle this pattern correctly',
                    testCode: this.generateTestCodeForPattern(patternKey, pattern)
                });
            }
        }
        
        // Store test cases
        this.stateStore.updateState('learning.generatedTestCases', testCases);
        
        return testCases;
    }
    
    /**
     * Generate test code for a pattern
     */
    generateTestCodeForPattern(patternKey, pattern) {
        // Generate basic test structure
        return `
describe('Pattern: ${patternKey}', () => {
    it('should handle ${patternKey} correctly', async () => {
        // Test pattern: ${patternKey}
        // Frequency: ${pattern.frequency}
        // Success rate: ${(pattern.successRate * 100).toFixed(1)}%
        // TODO: Implement test based on pattern
    });
});
        `.trim();
    }
    
    /**
     * Run all pattern learner improvements (Phase 7)
     */
    runPatternLearnerImprovements() {
        const results = {
            timestamp: Date.now(),
            contractImprovements: this.improveContracts(),
            detectionPatternImprovements: this.improveDetectionPatterns(),
            generatedTestCases: this.generateTestCases()
        };
        
        // Store results
        this.stateStore.updateState('learning.patternLearnerImprovements', results);
        
        // Emit event
        this.emit('patternLearnerImproved', results);
        
        return results;
    }
}

module.exports = AILearningEngine;
