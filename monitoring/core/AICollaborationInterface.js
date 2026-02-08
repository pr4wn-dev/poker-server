/**
 * AI Collaboration Interface - We Are One
 * 
 * This is the bridge that makes AI and Learning System completely symbiotic.
 * We work together as one unified system.
 * 
 * Features:
 * - Proactive suggestions from learning system
 * - Real-time feedback during problem-solving
 * - AI action tracking and learning
 * - Unified decision-making
 * - Continuous improvement loop
 */

const EventEmitter = require('events');
const gameLogger = require('../../src/utils/GameLogger');

class AICollaborationInterface extends EventEmitter {
    constructor(stateStore, learningEngine, issueDetector, fixTracker, communicationInterface) {
        super();
        this.stateStore = stateStore;
        this.learningEngine = learningEngine;
        this.issueDetector = issueDetector;
        this.fixTracker = fixTracker;
        this.communicationInterface = communicationInterface;
        
        // AI action tracking
        this.aiActions = []; // Track all AI actions for learning
        this.maxActionHistory = 1000;
        
        // Proactive suggestion system
        this.suggestionCache = new Map(); // Cache suggestions to avoid redundant queries
        this.lastSuggestionTime = 0;
        this.suggestionCooldown = 5000; // 5 seconds between proactive suggestions
        
        // Real-time feedback system
        this.feedbackQueue = []; // Queue of feedback to provide to AI
        this.activeProblem = null; // Current problem being solved
        
        // Unified decision tracking
        this.decisions = []; // Track decisions made together
        this.decisionOutcomes = new Map(); // Track outcomes to learn
        
        // Start proactive monitoring
        this.startProactiveMonitoring();
    }
    
    /**
     * AI is about to take an action - get proactive suggestions
     * This is called BEFORE the AI does something
     */
    beforeAIAction(action) {
        const suggestions = {
            warnings: [],
            recommendations: [],
            patterns: [],
            alternatives: [],
            confidence: null
        };
        
        // Track the action
        this.trackAIAction(action);
        
        // Get proactive suggestions from learning system
        if (this.learningEngine) {
            // Check for similar patterns
            const similarPatterns = this.findSimilarPatterns(action);
            if (similarPatterns.length > 0) {
                suggestions.patterns = similarPatterns;
                
                // Check if similar actions failed before
                for (const pattern of similarPatterns) {
                    if (pattern.successRate < 0.5) {
                        suggestions.warnings.push({
                            type: 'LOW_SUCCESS_RATE',
                            message: `Similar actions have low success rate (${(pattern.successRate * 100).toFixed(1)}%)`,
                            pattern: pattern.pattern,
                            recommendation: pattern.bestSolution || 'Consider alternative approach'
                        });
                    }
                }
            }
            
            // Check for circular dependencies
            if (action.type === 'code_change' || action.type === 'fix_attempt') {
                const circularCheck = this.checkForCircularDependencies(action);
                if (circularCheck.detected) {
                    suggestions.warnings.push({
                        type: 'CIRCULAR_DEPENDENCY',
                        message: 'Potential circular dependency detected',
                        chain: circularCheck.chain,
                        recommendation: 'Break cycle by making operations async (use setImmediate)'
                    });
                }
            }
            
            // Check for blocking chains
            if (action.type === 'code_change') {
                const blockingCheck = this.checkForBlockingChains(action);
                if (blockingCheck.detected) {
                    suggestions.warnings.push({
                        type: 'BLOCKING_CHAIN',
                        message: 'Potential blocking chain detected',
                        chain: blockingCheck.chain,
                        recommendation: 'Make operations async to break blocking chain'
                    });
                }
            }
            
            // Get best solution from learning system
            if (action.issueType) {
                const bestSolution = this.learningEngine.getBestSolution(action.issueType);
                if (bestSolution) {
                    suggestions.recommendations.push({
                        type: 'LEARNED_SOLUTION',
                        message: `Learning system suggests: ${bestSolution.description || bestSolution.method}`,
                        solution: bestSolution,
                        confidence: bestSolution.confidence || bestSolution.successRate || 0.8
                    });
                }
            }
            
            // Get manual debugging approach if needed
            if (action.type === 'debugging' || action.type === 'problem_solving') {
                const debuggingApproach = this.learningEngine.getManualDebuggingApproach({
                    component: action.component,
                    type: action.issueType || 'unknown'
                });
                
                if (debuggingApproach) {
                    suggestions.recommendations.push({
                        type: 'DEBUGGING_APPROACH',
                        message: debuggingApproach.description,
                        steps: debuggingApproach.steps,
                        confidence: debuggingApproach.confidence
                    });
                }
            }
            
            // Get learning confidence
            const confidence = this.learningEngine.getLearningConfidence();
            suggestions.confidence = confidence;
        }
        
        // Cache suggestions
        this.suggestionCache.set(action.id || Date.now(), suggestions);
        
        // Emit event
        this.emit('beforeAIAction', { action, suggestions });
        
        return suggestions;
    }
    
    /**
     * AI completed an action - learn from it
     * This is called AFTER the AI does something
     */
    afterAIAction(action, result) {
        // Track outcome
        this.trackActionOutcome(action, result);
        
        // Learn from the action
        if (this.learningEngine && result) {
            // If it was a fix attempt, learn from it
            if (action.type === 'fix_attempt' && result.success !== undefined) {
                this.learningEngine.learnFromAttempt({
                    issueId: action.issueId,
                    issueType: action.issueType,
                    fixMethod: action.method,
                    fixDetails: action.details,
                    result: result.success ? 'success' : 'failure',
                    timestamp: Date.now()
                });
            }
            
            // Track circular dependency if it was detected and fixed
            if (action.type === 'fix_attempt' && action.method === 'make_async' && result.success) {
                if (action.details && action.details.chain) {
                    this.learningEngine.trackCircularDependency(
                        action.details.chain,
                        {
                            method: 'make_async',
                            description: 'Break circular dependency by making operations async'
                        }
                    );
                }
            }
            
            // Track blocking chain if it was detected and fixed
            if (action.type === 'fix_attempt' && action.method === 'make_async' && result.success) {
                if (action.details && action.details.chain) {
                    this.learningEngine.trackBlockingChain(
                        action.details.chain,
                        {
                            method: 'make_async',
                            description: 'Break blocking chain by making operations async'
                        }
                    );
                }
            }
            
            // Track manual debugging if it was successful
            if (action.type === 'debugging' && result.success) {
                this.learningEngine.trackManualDebugging(
                    {
                        component: action.component,
                        issue: action.issueType || 'unknown'
                    },
                    {
                        result: 'success',
                        description: result.description || 'Systematic debugging approach',
                        steps: result.steps || []
                    }
                );
            }
        }
        
        // Update decision outcomes
        if (action.decisionId) {
            this.decisionOutcomes.set(action.decisionId, {
                action,
                result,
                timestamp: Date.now()
            });
        }
        
        // Emit event
        this.emit('afterAIAction', { action, result });
    }
    
    /**
     * AI is stuck or needs help - get proactive assistance
     */
    aiNeedsHelp(context) {
        const assistance = {
            suggestions: [],
            patterns: [],
            similarProblems: [],
            solutions: [],
            confidence: null
        };
        
        // Set active problem
        this.activeProblem = context;
        
        // Get suggestions from learning system
        if (this.learningEngine) {
            // Find similar problems
            const similarProblems = this.findSimilarProblems(context);
            assistance.similarProblems = similarProblems;
            
            // Get solutions that worked for similar problems
            for (const problem of similarProblems) {
                if (problem.solutions && problem.solutions.length > 0) {
                    assistance.solutions.push(...problem.solutions);
                }
            }
            
            // Get patterns that might help
            const relevantPatterns = this.findRelevantPatterns(context);
            assistance.patterns = relevantPatterns;
            
            // Get learning confidence
            const confidence = this.learningEngine.getLearningConfidence();
            assistance.confidence = confidence;
            
            // Generate suggestions
            assistance.suggestions = this.generateHelpSuggestions(context, similarProblems, relevantPatterns);
        }
        
        // Emit event
        this.emit('aiNeedsHelp', { context, assistance });
        
        return assistance;
    }
    
    /**
     * Query learning system - unified interface
     */
    queryLearning(question) {
        if (!this.learningEngine) {
            return { error: 'Learning engine not available' };
        }
        
        const lower = question.toLowerCase();
        
        // "What patterns match this problem?"
        if (lower.includes('pattern') || lower.includes('similar')) {
            return {
                type: 'patterns',
                patterns: this.findRelevantPatterns({ query: question })
            };
        }
        
        // "What solutions worked for X?"
        if (lower.includes('solution') || lower.includes('what worked')) {
            const issueType = this.extractIssueType(question);
            const solution = this.learningEngine.getBestSolution(issueType);
            return {
                type: 'solution',
                solution: solution,
                alternatives: this.getAlternativeSolutions(issueType)
            };
        }
        
        // "How confident is the learning system?"
        if (lower.includes('confidence') || lower.includes('how well')) {
            return {
                type: 'confidence',
                confidence: this.learningEngine.getLearningConfidence()
            };
        }
        
        // "What should I do?"
        if (lower.includes('what should') || lower.includes('recommend')) {
            return {
                type: 'recommendations',
                recommendations: this.getProactiveRecommendations()
            };
        }
        
        // Default: search learning data
        return {
            type: 'search',
            results: this.searchLearningData(question)
        };
    }
    
    /**
     * Get proactive recommendations - learning system suggests what to do
     */
    getProactiveRecommendations() {
        const recommendations = [];
        
        if (!this.learningEngine) {
            return recommendations;
        }
        
        // Get learning confidence
        const confidence = this.learningEngine.getLearningConfidence();
        
        // If confidence is low, suggest improvements
        if (confidence.overallConfidence < 50) {
            recommendations.push({
                type: 'IMPROVE_LEARNING',
                priority: 'high',
                message: 'Learning system confidence is low - focus on successful fixes to improve',
                details: confidence
            });
        }
        
        // Get patterns with low success rates
        const lowSuccessPatterns = this.getLowSuccessPatterns();
        if (lowSuccessPatterns.length > 0) {
            recommendations.push({
                type: 'INVESTIGATE_PATTERNS',
                priority: 'medium',
                message: `${lowSuccessPatterns.length} patterns have low success rates - investigate and improve`,
                patterns: lowSuccessPatterns
            });
        }
        
        // Get recent failures
        const recentFailures = this.getRecentFailures();
        if (recentFailures.length > 0) {
            recommendations.push({
                type: 'LEARN_FROM_FAILURES',
                priority: 'high',
                message: `${recentFailures.length} recent failures - analyze and learn from them`,
                failures: recentFailures
            });
        }
        
        return recommendations;
    }
    
    /**
     * Start proactive monitoring - learning system actively helps
     */
    startProactiveMonitoring() {
        // Monitor for issues and proactively suggest solutions
        setInterval(() => {
            this.proactiveCheck();
        }, 30000); // Check every 30 seconds
    }
    
    /**
     * Proactive check - learning system looks for opportunities to help
     */
    proactiveCheck() {
        if (!this.learningEngine || !this.issueDetector) {
            return;
        }
        
        // Get active issues
        const activeIssues = this.issueDetector.getActiveIssues();
        
        // For each active issue, check if learning system has solutions
        for (const issue of activeIssues) {
            const solution = this.learningEngine.getBestSolution(issue.type);
            if (solution && !this.suggestionCache.has(`issue_${issue.id}`)) {
                // Proactively suggest solution
                this.emit('proactiveSuggestion', {
                    issue,
                    solution,
                    type: 'LEARNED_SOLUTION',
                    message: `Learning system has a solution for this issue: ${solution.description || solution.method}`
                });
                
                // Cache to avoid spam
                this.suggestionCache.set(`issue_${issue.id}`, solution);
            }
        }
        
        // Check learning confidence
        const confidence = this.learningEngine.getLearningConfidence();
        if (confidence.overallConfidence < 30) {
            this.emit('proactiveSuggestion', {
                type: 'LOW_CONFIDENCE',
                priority: 'high',
                message: 'Learning system confidence is critically low - focus on successful fixes',
                confidence
            });
        }
    }
    
    // Helper methods
    
    trackAIAction(action) {
        this.aiActions.push({
            ...action,
            timestamp: Date.now()
        });
        
        // Keep only last N actions
        if (this.aiActions.length > this.maxActionHistory) {
            this.aiActions.shift();
        }
    }
    
    trackActionOutcome(action, result) {
        // Find the action in history and update it
        const actionIndex = this.aiActions.findIndex(a => a.id === action.id);
        if (actionIndex >= 0) {
            this.aiActions[actionIndex].result = result;
            this.aiActions[actionIndex].completedAt = Date.now();
        }
    }
    
    findSimilarPatterns(action) {
        if (!this.learningEngine) return [];
        
        // This would use learning engine's pattern matching
        // Simplified for now
        return [];
    }
    
    checkForCircularDependencies(action) {
        if (!this.learningEngine) return { detected: false };
        
        // Check if action might create circular dependency
        if (action.details && action.details.methodCalls) {
            const circular = this.learningEngine.detectCircularDependency(action.details.methodCalls);
            if (circular) {
                return {
                    detected: true,
                    chain: circular.chain
                };
            }
        }
        
        return { detected: false };
    }
    
    checkForBlockingChains(action) {
        if (!this.learningEngine) return { detected: false };
        
        // Check if action might create blocking chain
        if (action.details && action.details.operations) {
            const blocking = this.learningEngine.detectBlockingChain(action.details.operations);
            if (blocking) {
                return {
                    detected: true,
                    chain: blocking.chain
                };
            }
        }
        
        return { detected: false };
    }
    
    findSimilarProblems(context) {
        // Find problems in learning system that are similar
        // This would use learning engine's pattern matching
        return [];
    }
    
    findRelevantPatterns(context) {
        // Find relevant patterns from learning system
        // This would query learning engine
        return [];
    }
    
    generateHelpSuggestions(context, similarProblems, patterns) {
        const suggestions = [];
        
        // If similar problems were solved, suggest those solutions
        for (const problem of similarProblems) {
            if (problem.solutions && problem.solutions.length > 0) {
                suggestions.push({
                    type: 'SIMILAR_PROBLEM_SOLUTION',
                    message: `Similar problem was solved using: ${problem.solutions[0].method}`,
                    solution: problem.solutions[0]
                });
            }
        }
        
        return suggestions;
    }
    
    extractIssueType(question) {
        // Extract issue type from question
        // Simplified for now
        return question;
    }
    
    getAlternativeSolutions(issueType) {
        if (!this.learningEngine) return [];
        
        // Get alternatives from learning engine
        const optimization = this.learningEngine.solutionOptimization.get(issueType);
        return optimization ? (optimization.alternatives || []) : [];
    }
    
    getLowSuccessPatterns() {
        if (!this.learningEngine) return [];
        
        const lowSuccess = [];
        for (const [patternKey, pattern] of this.learningEngine.patterns.entries()) {
            if (pattern.successRate < 0.5 && pattern.frequency > 5) {
                lowSuccess.push({
                    pattern: patternKey,
                    successRate: pattern.successRate,
                    frequency: pattern.frequency
                });
            }
        }
        
        return lowSuccess;
    }
    
    getRecentFailures() {
        // Get recent failed actions
        return this.aiActions
            .filter(a => a.result && !a.result.success)
            .slice(-10)
            .map(a => ({
                action: a,
                timestamp: a.completedAt || a.timestamp
            }));
    }
    
    searchLearningData(query) {
        // Search learning system data
        // This would search patterns, solutions, etc.
        return [];
    }
}

module.exports = AICollaborationInterface;
