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
        
        // Load learning data
        this.load();
    }
    
    /**
     * Learn from fix attempt
     */
    learnFromAttempt(attempt) {
        // Extract patterns
        const patterns = this.extractPatterns(attempt);
        
        // Update pattern knowledge
        for (const pattern of patterns) {
            this.updatePatternKnowledge(pattern, attempt);
        }
        
        // Analyze causal chain
        if (attempt.result === 'success') {
            this.analyzeCausalChain(attempt);
        }
        
        // Optimize solutions
        this.optimizeSolution(attempt);
        
        // Cross-issue learning
        this.learnCrossIssue(attempt);
        
        // Save learning
        this.save();
    }
    
    /**
     * Extract patterns from fix attempt
     */
    extractPatterns(attempt) {
        const patterns = [];
        
        // Issue type pattern
        if (attempt.issueType) {
            patterns.push({
                type: 'issueType',
                value: attempt.issueType,
                context: attempt.fixDetails
            });
        }
        
        // Fix method pattern
        if (attempt.fixMethod) {
            patterns.push({
                type: 'fixMethod',
                value: attempt.fixMethod,
                context: attempt.fixDetails
            });
        }
        
        // State pattern (if state was involved)
        if (attempt.state) {
            patterns.push({
                type: 'state',
                value: this.extractStatePattern(attempt.state),
                context: attempt.fixDetails
            });
        }
        
        // Log pattern (if logs were involved)
        if (attempt.logs && attempt.logs.length > 0) {
            patterns.push({
                type: 'log',
                value: this.extractLogPattern(attempt.logs),
                context: attempt.fixDetails
            });
        }
        
        return patterns;
    }
    
    /**
     * Extract state pattern
     */
    extractStatePattern(state) {
        // Extract key state features
        const features = [];
        
        if (state.chips) {
            features.push(`chips:${state.chips.total || 0}`);
        }
        if (state.phase) {
            features.push(`phase:${state.phase}`);
        }
        if (state.players) {
            features.push(`players:${Object.keys(state.players || {}).length}`);
        }
        
        return features.join('|');
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
     * Update pattern knowledge
     */
    updatePatternKnowledge(pattern, attempt) {
        const patternKey = `${pattern.type}:${pattern.value}`;
        const existing = this.patterns.get(patternKey) || {
            frequency: 0,
            successes: 0,
            failures: 0,
            contexts: [],
            solutions: []
        };
        
        existing.frequency++;
        if (attempt.result === 'success') {
            existing.successes++;
        } else {
            existing.failures++;
        }
        
        existing.contexts.push(pattern.context);
        existing.solutions.push({
            method: attempt.fixMethod,
            result: attempt.result,
            timestamp: attempt.timestamp
        });
        
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
     */
    getBestSolution(issueType) {
        const optimization = this.solutionOptimization.get(issueType);
        if (!optimization) return null;
        
        return {
            method: optimization.bestSolution,
            successRate: optimization.successRate,
            alternatives: optimization.alternatives
        };
    }
    
    /**
     * Predict likely issues
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
                    reason: `Pattern ${patternKey} has high failure rate (${(pattern.successRate * 100).toFixed(1)}%)`
                });
            }
        }
        
        return predictions;
    }
    
    /**
     * Get learning report
     */
    getLearningReport() {
        return {
            patterns: {
                total: this.patterns.size,
                topPatterns: Array.from(this.patterns.entries())
                    .sort((a, b) => b[1].frequency - a[1].frequency)
                    .slice(0, 10)
                    .map(([key, data]) => ({
                        pattern: key,
                        frequency: data.frequency,
                        successRate: data.successRate
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
     * Load learning data
     */
    load() {
        try {
            const patterns = this.stateStore.getState('learning.patterns');
            if (patterns && Array.isArray(patterns)) {
                for (const [key, value] of patterns) {
                    this.patterns.set(key, value);
                }
            }
            
            const causalChains = this.stateStore.getState('learning.causalChains') || {};
            this.causalChains = new Map(Object.entries(causalChains));
            
            const solutionOptimization = this.stateStore.getState('learning.solutionOptimization') || {};
            this.solutionOptimization = new Map(Object.entries(solutionOptimization));
            
            const crossIssueLearning = this.stateStore.getState('learning.crossIssueLearning') || {};
            this.crossIssueLearning = new Map(Object.entries(crossIssueLearning));
        } catch (error) {
            // DO NOT log to console - errors are for AI only, not user
            // Re-throw so UniversalErrorHandler can catch it
            throw error;
        }
    }
    
    /**
     * Save learning data
     */
    save() {
        try {
            this.stateStore.updateState('learning.patterns', Array.from(this.patterns.entries()));
            this.stateStore.updateState('learning.causalChains', Object.fromEntries(this.causalChains));
            this.stateStore.updateState('learning.solutionOptimization', Object.fromEntries(this.solutionOptimization));
            this.stateStore.updateState('learning.crossIssueLearning', Object.fromEntries(this.crossIssueLearning));
        } catch (error) {
            // DO NOT log to console - errors are for AI only, not user
            // Re-throw so UniversalErrorHandler can catch it
            throw error;
        }
    }
}

module.exports = AILearningEngine;
