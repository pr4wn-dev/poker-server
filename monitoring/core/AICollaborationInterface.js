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
    constructor(stateStore, learningEngine, issueDetector, fixTracker, communicationInterface, solutionTemplateEngine, codeChangeTracker, powerShellSyntaxValidator = null) {
        super();
        this.stateStore = stateStore;
        this.learningEngine = learningEngine;
        this.issueDetector = issueDetector;
        this.fixTracker = fixTracker;
        this.communicationInterface = communicationInterface;
        this.solutionTemplateEngine = solutionTemplateEngine;
        this.codeChangeTracker = codeChangeTracker;
        this.powerShellSyntaxValidator = powerShellSyntaxValidator;
        
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
        
        // Shared knowledge base - we both contribute and access
        this.sharedKnowledge = {
            successes: [], // What worked (from both of us)
            failures: [], // What didn't work (from both of us)
            patterns: [], // Patterns we've discovered together
            predictions: [], // What we predict will happen
            warnings: [] // Warnings we've given each other
        };
        
        // Pattern detection together
        this.patternDetection = {
            aiPatterns: [], // Patterns I've detected
            learningPatterns: [], // Patterns learning system detected
            sharedPatterns: [] // Patterns we built together
        };
        
        // Predictive collaboration
        this.predictions = {
            aiPredictsLearning: [], // What I predict learning system will suggest
            learningPredictsAI: [] // What learning system predicts I'll do wrong
        };
        
        // Failure analysis together
        this.failureAnalysis = {
            aiFailures: [], // My failures analyzed together
            learningFailures: [], // Learning system failures analyzed together
            jointAnalysis: [] // Analysis we did together
        };
        
        // Continuous improvement tracking
        this.improvementTracking = {
            aiImprovements: [], // How I've improved
            learningImprovements: [], // How learning system improved
            jointImprovements: [] // How we improved together
        };
        
        // Failure tracking for web search enforcement
        this.failureTracking = {
            consecutiveFailures: 0, // Track consecutive failures
            lastFailureTime: null,
            failureHistory: [], // Last 10 failures
            webSearchEnforced: false, // Whether web search was enforced
            webSearchResults: [] // Store web search findings
        };
        
        // Start proactive monitoring
        this.startProactiveMonitoring();
        
        // Listen to AutoFixEngine - when learning system tries something and it works, teach AI
        this.setupLearningSystemListener();
    }
    
    /**
     * Setup listener for learning system actions
     * When learning system (AutoFixEngine) tries something and it works, it teaches AI
     * Note: This is set up in AIMonitorCore.setupEventListeners() after both are initialized
     */
    setupLearningSystemListener() {
        // Listener is set up in AIMonitorCore.setupEventListeners()
        // This method exists for future use if needed
    }
    
    /**
     * Learning system tried something and it worked - teach AI
     * This is called when AutoFixEngine successfully fixes something
     */
    learningSystemSucceeded(action, result) {
        // Create a knowledge update for AI
        const knowledgeUpdate = {
            type: 'LEARNING_SYSTEM_SUCCESS',
            timestamp: Date.now(),
            action: {
                type: action.type || 'auto_fix',
                method: action.method || action.fixMethod,
                issueType: action.issueType,
                component: action.component,
                details: action.details
            },
            result: {
                success: result.success !== false,
                description: result.description || result.reason,
                confidence: result.confidence || 0.9
            },
            lesson: this.extractLesson(action, result)
        };
        
        // Store in shared knowledge
        this.sharedKnowledge.successes.push(knowledgeUpdate);
        if (this.sharedKnowledge.successes.length > 100) {
            this.sharedKnowledge.successes.shift();
        }
        
        // Store in state so AI can query it
        this.stateStore.updateState('ai.knowledge.learningSystemSuccesses', (successes = []) => {
            successes.push(knowledgeUpdate);
            // Keep only last 100
            if (successes.length > 100) {
                successes.shift();
            }
            return successes;
        });
        
        // Track improvement together
        this.trackImprovementTogether({
            type: 'learning_improved',
            whatImproved: `Learning system successfully fixed ${action.issueType} using ${action.method}`,
            how: 'AutoFixEngine tried learned solution and it worked',
            impact: 'Learning system confidence increased',
            metrics: { method: action.method, issueType: action.issueType }
        });
        
        // Emit event so AI can listen
        this.emit('learningSystemTaughtAI', knowledgeUpdate);
        
        gameLogger.info('CERBERUS', '[AI_COLLABORATION] Learning system taught AI', {
            method: action.method || action.fixMethod,
            issueType: action.issueType,
            success: result.success !== false
        });
    }
    
    /**
     * Learning system tried something and it failed - teach AI what not to do
     * We analyze the failure together
     */
    learningSystemFailed(action, result) {
        const knowledgeUpdate = {
            type: 'LEARNING_SYSTEM_FAILURE',
            timestamp: Date.now(),
            action: {
                type: action.type || 'auto_fix',
                method: action.method || action.fixMethod,
                issueType: action.issueType,
                component: action.component,
                details: action.details
            },
            result: {
                success: false,
                reason: result.reason || result.description,
                error: result.error
            },
            lesson: `Don't use ${action.method || action.fixMethod} for ${action.issueType} - it failed: ${result.reason || 'unknown reason'}`
        };
        
        // Store in shared knowledge
        this.sharedKnowledge.failures.push(knowledgeUpdate);
        if (this.sharedKnowledge.failures.length > 100) {
            this.sharedKnowledge.failures.shift();
        }
        
        // Store in state
        this.stateStore.updateState('ai.knowledge.learningSystemFailures', (failures = []) => {
            failures.push(knowledgeUpdate);
            if (failures.length > 100) {
                failures.shift();
            }
            return failures;
        });
        
        // Analyze failure together
        const failureRecord = {
            type: 'LEARNING_SYSTEM_FAILURE',
            timestamp: Date.now(),
            action: {
                type: action.type || 'auto_fix',
                method: action.method || action.fixMethod,
                issueType: action.issueType,
                component: action.component,
                details: action.details
            },
            failure: {
                reason: result.reason || result.description,
                error: result.error
            }
        };
        
        const jointAnalysis = this.analyzeFailureTogether(failureRecord);
        this.failureAnalysis.learningFailures.push(failureRecord);
        this.failureAnalysis.jointAnalysis.push(jointAnalysis);
        
        // Emit event
        this.emit('learningSystemTaughtAI', knowledgeUpdate);
        this.emit('failureAnalyzedTogether', jointAnalysis);
        
        gameLogger.info('CERBERUS', '[AI_COLLABORATION] Learning system taught AI (failure) - analyzed together', {
            method: action.method || action.fixMethod,
            issueType: action.issueType,
            reason: result.reason,
            jointAnalysis: jointAnalysis.insights
        });
    }
    
    /**
     * Extract lesson from learning system action
     */
    extractLesson(action, result) {
        if (result.success !== false) {
            return `Learning system successfully fixed ${action.issueType || 'issue'} using ${action.method || action.fixMethod}. ${result.description || 'This method works for this type of issue.'}`;
        } else {
            return `Learning system tried ${action.method || action.fixMethod} for ${action.issueType || 'issue'} but it failed: ${result.reason || 'unknown reason'}. Don't use this method for similar issues.`;
        }
    }
    
    /**
     * Get what learning system has taught AI
     */
    getLearningSystemKnowledge() {
        const successes = this.stateStore.getState('ai.knowledge.learningSystemSuccesses') || [];
        const failures = this.stateStore.getState('ai.knowledge.learningSystemFailures') || [];
        
        return {
            successes: successes.slice(-20), // Last 20 successes
            failures: failures.slice(-20), // Last 20 failures
            totalSuccesses: successes.length,
            totalFailures: failures.length,
            recentLessons: [...successes, ...failures]
                .sort((a, b) => b.timestamp - a.timestamp)
                .slice(0, 10) // Last 10 lessons
        };
    }
    
    /**
     * AI is about to take an action - get proactive suggestions
     * This is called BEFORE the AI does something
     */
    async beforeAIAction(action) {
        const suggestions = {
            warnings: [],
            recommendations: [],
            patterns: [],
            alternatives: [],
            confidence: null,
            webSearchRequired: false,
            webSearchTerms: []
        };
        
        // CRITICAL: Check if learning system requires web search before action
        const webSearchRequired = this.stateStore.getState('ai.learning.webSearchRequired');
        if (webSearchRequired && !webSearchRequired.resolved) {
            suggestions.webSearchRequired = true;
            suggestions.webSearchTerms = webSearchRequired.searchTerms || [];
            suggestions.warnings.unshift({
                type: 'WEB_SEARCH_REQUIRED',
                priority: 'critical',
                message: webSearchRequired.message || 'Learning system requires web search before continuing.',
                searchTerms: suggestions.webSearchTerms,
                urgency: webSearchRequired.urgency || 'high',
                why: `After ${webSearchRequired.consecutiveFailures} consecutive failure(s), learning system requires online research.`
            });
        }
        
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
            
            // Check PowerShell syntax if editing PowerShell files
            if (action.type === 'code_change' || action.type === 'fix_attempt') {
                if (action.filePath && action.filePath.endsWith('.ps1') && this.powerShellSyntaxValidator) {
                    const syntaxCheck = await this.checkPowerShellSyntax(action);
                    if (syntaxCheck && !syntaxCheck.valid) {
                        suggestions.warnings.push({
                            type: 'POWERSHELL_SYNTAX_ERROR',
                            message: `PowerShell syntax errors detected: ${syntaxCheck.errors.length} error(s), ${syntaxCheck.structuralIssues.length} structural issue(s)`,
                            errors: syntaxCheck.errors.slice(0, 3), // First 3 errors
                            structuralIssues: syntaxCheck.structuralIssues.slice(0, 3),
                            recommendation: 'Fix syntax errors before applying changes'
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
                
                // Check if AI has failed on this before
                const aiFailures = this.sharedKnowledge.failures.filter(f => 
                    f.action.issueType === action.issueType &&
                    f.action.method === action.method
                );
                
                if (aiFailures.length > 0) {
                    suggestions.warnings.push({
                        type: 'AI_FAILED_BEFORE',
                        message: `AI tried ${action.method} for ${action.issueType} before and it failed ${aiFailures.length} time(s)`,
                        failures: aiFailures.slice(0, 3),
                        recommendation: bestSolution ? `Try learning system's suggestion instead: ${bestSolution.method}` : 'Consider alternative approach'
                    });
                }
                
                // Check if learning system failed on this before
                const learningFailures = (this.stateStore.getState('ai.knowledge.learningSystemFailures') || []).filter(f =>
                    f.action.issueType === action.issueType &&
                    f.action.method === action.method
                );
                
                if (learningFailures.length > 0) {
                    suggestions.warnings.push({
                        type: 'LEARNING_FAILED_BEFORE',
                        message: `Learning system tried ${action.method} for ${action.issueType} before and it failed`,
                        failures: learningFailures.slice(0, 3),
                        recommendation: 'Both of us failed - need new approach'
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
     * AI completed an action - learn from it (SUCCESS OR FAILURE)
     * This is called AFTER the AI does something - we learn from BOTH successes and failures
     */
    afterAIAction(action, result) {
        // Track outcome
        this.trackActionOutcome(action, result);
        
        // Learn from the action - SUCCESS OR FAILURE
        if (this.learningEngine && result) {
            const wasSuccess = result.success !== false;
            
            // If it was a fix attempt, learn from it (success OR failure)
            if (action.type === 'fix_attempt' && result.success !== undefined) {
                this.learningEngine.learnFromAttempt({
                    issueId: action.issueId,
                    issueType: action.issueType,
                    fixMethod: action.method,
                    fixDetails: action.details,
                    result: wasSuccess ? 'success' : 'failure',
                    timestamp: Date.now(),
                    // Include failure details so learning system knows WHY it failed
                    failureReason: wasSuccess ? null : (result.reason || result.error || 'Unknown failure reason'),
                    failureContext: wasSuccess ? null : (result.context || action.details)
                });
            }
            
            // Track circular dependency if it was detected and fixed (SUCCESS)
            if (action.type === 'fix_attempt' && action.method === 'make_async' && wasSuccess) {
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
            
            // Track blocking chain if it was detected and fixed (SUCCESS)
            if (action.type === 'fix_attempt' && action.method === 'make_async' && wasSuccess) {
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
            
            // Track manual debugging (SUCCESS OR FAILURE)
            if (action.type === 'debugging') {
                this.learningEngine.trackManualDebugging(
                    {
                        component: action.component,
                        issue: action.issueType || 'unknown'
                    },
                    {
                        result: wasSuccess ? 'success' : 'failure',
                        description: result.description || (wasSuccess ? 'Systematic debugging approach' : 'Debugging attempt failed'),
                        steps: result.steps || [],
                        failureReason: wasSuccess ? null : (result.reason || 'Unknown reason')
                    }
                );
            }
            
            // Track successes in shared knowledge
            if (wasSuccess) {
                const successRecord = {
                    type: 'AI_SUCCESS',
                    timestamp: Date.now(),
                    action: {
                        type: action.type,
                        method: action.method,
                        issueType: action.issueType,
                        component: action.component
                    },
                    result: {
                        description: result.description || 'Action succeeded',
                        confidence: result.confidence || 0.9
                    }
                };
                
                this.sharedKnowledge.successes.push(successRecord);
                if (this.sharedKnowledge.successes.length > 100) {
                    this.sharedKnowledge.successes.shift();
                }
            }
            
            // Track failures specifically - learning system needs to know what NOT to do
            if (!wasSuccess) {
                this.trackAIFailure(action, result);
                // Enforce web search after failures
                this.enforceWebSearchAfterFailure(action, result);
            } else {
                // Reset failure count on success
                this.failureTracking.consecutiveFailures = 0;
                this.failureTracking.webSearchEnforced = false;
            }
        }
        
        // Update decision outcomes (success OR failure)
        if (action.decisionId) {
            this.decisionOutcomes.set(action.decisionId, {
                action,
                result,
                timestamp: Date.now(),
                learned: true
            });
        }
        
        // Emit event
        this.emit('afterAIAction', { action, result });
    }
    
    /**
     * Track AI failure - learning system learns what NOT to do
     * We analyze failures TOGETHER
     */
    trackAIFailure(action, result) {
        if (!this.learningEngine) return;
        
        // CRITICAL: Increment consecutive failure count
        this.failureTracking.consecutiveFailures++;
        this.failureTracking.lastFailureTime = Date.now();
        this.failureTracking.failureHistory.push({
            action,
            result,
            timestamp: Date.now()
        });
        // Keep only last 10 failures
        if (this.failureTracking.failureHistory.length > 10) {
            this.failureTracking.failureHistory.shift();
        }
        
        const failureRecord = {
            type: 'AI_FAILURE',
            timestamp: Date.now(),
            action: {
                type: action.type,
                method: action.method,
                issueType: action.issueType,
                component: action.component,
                details: action.details
            },
            failure: {
                reason: result.reason || result.error || 'Unknown failure reason',
                error: result.error,
                context: result.context,
                whatWentWrong: result.whatWentWrong || 'Action failed',
                whatShouldHaveHappened: result.whatShouldHaveHappened || 'Action should have succeeded'
            },
            lesson: this.extractFailureLesson(action, result),
            consecutiveFailures: this.failureTracking.consecutiveFailures
        };
        
        // Store in shared knowledge
        this.sharedKnowledge.failures.push(failureRecord);
        if (this.sharedKnowledge.failures.length > 100) {
            this.sharedKnowledge.failures.shift();
        }
        
        // Store in state so learning system can query it
        this.stateStore.updateState('ai.knowledge.aiFailures', (failures = []) => {
            failures.push(failureRecord);
            if (failures.length > 100) {
                failures.shift();
            }
            return failures;
        });
        
        // Analyze failure TOGETHER with learning system
        const jointAnalysis = this.analyzeFailureTogether(failureRecord);
        this.failureAnalysis.aiFailures.push(failureRecord);
        this.failureAnalysis.jointAnalysis.push(jointAnalysis);
        
        // Update learning engine's failure patterns
        if (action.issueType) {
            // Track that this method failed for this issue type
            const patternKey = `fixMethod:${action.method}:issueType:${action.issueType}`;
            const existing = this.learningEngine.patterns.get(patternKey) || {
                frequency: 0,
                successes: 0,
                failures: 0,
                contexts: [],
                solutions: []
            };
            
            existing.failures++;
            existing.frequency++;
            existing.contexts.push({
                component: action.component,
                failureReason: result.reason,
                timestamp: Date.now()
            });
            
            existing.successRate = existing.successes / existing.frequency;
            this.learningEngine.patterns.set(patternKey, existing);
            
            // Learning system learns: don't suggest this method for this issue type
            this.learningEngine.learnFromAttempt({
                issueId: action.issueId || 'unknown',
                issueType: action.issueType,
                fixMethod: action.method,
                fixDetails: action.details,
                result: 'failure',
                timestamp: Date.now(),
                failureReason: result.reason,
                learned: 'This method does not work for this issue type'
            });
        }
        
        // Emit event
        this.emit('aiFailure', failureRecord);
        this.emit('failureAnalyzedTogether', jointAnalysis);
        
        gameLogger.warn('CERBERUS', '[AI_COLLABORATION] AI failure tracked and analyzed together - learning system learns what not to do', {
            method: action.method,
            issueType: action.issueType,
            reason: result.reason,
            jointAnalysis: jointAnalysis.insights
        });
    }
    
    /**
     * Enforce web search after failures - CRITICAL: Learning system must tell AI to search online
     */
    enforceWebSearchAfterFailure(action, result) {
        // After 1-2 failures, learning system MUST tell AI to search online
        if (this.failureTracking.consecutiveFailures >= 1 && !this.failureTracking.webSearchEnforced) {
            this.failureTracking.webSearchEnforced = true;
            
            // Generate search terms from failure
            const searchTerms = this.generateSearchTermsFromFailure(action, result);
            
            // Store in learning system that web search is required
            const webSearchRequirement = {
                type: 'web_search_required',
                timestamp: Date.now(),
                consecutiveFailures: this.failureTracking.consecutiveFailures,
                action: {
                    type: action.type,
                    method: action.method,
                    issueType: action.issueType,
                    component: action.component
                },
                failure: {
                    reason: result.reason || result.error || 'Unknown failure reason',
                    error: result.error
                },
                searchTerms: searchTerms,
                urgency: this.failureTracking.consecutiveFailures >= 2 ? 'critical' : 'high',
                message: this.failureTracking.consecutiveFailures >= 2 
                    ? 'CRITICAL: Multiple failures detected. You MUST search online for solutions immediately.'
                    : 'Failure detected. Learning system requires you to search online for solutions before continuing.',
                resolved: false
            };
            
            // Store in state for AI to query
            this.stateStore.updateState('ai.learning.webSearchRequired', webSearchRequirement);
            
            // Emit event that learning system is telling AI to search
            this.emit('learningSystemRequiresWebSearch', webSearchRequirement);
            
            gameLogger.warn('CERBERUS', '[LEARNING_SYSTEM] Web search required after failure', {
                consecutiveFailures: this.failureTracking.consecutiveFailures,
                searchTerms: searchTerms,
                action: 'Learning system enforcing web search - AI must search online'
            });
        }
    }
    
    /**
     * Generate search terms from failure context
     */
    generateSearchTermsFromFailure(action, result) {
        const terms = [];
        
        // Add error message if available
        if (result.error) {
            terms.push(result.error);
        }
        
        // Add issue type
        if (action.issueType) {
            terms.push(action.issueType);
        }
        
        // Add component
        if (action.component) {
            terms.push(action.component);
        }
        
        // Add method that failed
        if (action.method) {
            terms.push(action.method);
        }
        
        // Add failure reason
        if (result.reason) {
            const reasonWords = result.reason.split(/\s+/).filter(w => w.length > 3);
            terms.push(...reasonWords.slice(0, 3)); // Top 3 words from reason
        }
        
        // Remove duplicates and return
        return [...new Set(terms)].slice(0, 5); // Max 5 search terms
    }
    
    /**
     * Analyze failure together - we work together to understand why it failed
     */
    analyzeFailureTogether(failureRecord) {
        const analysis = {
            timestamp: Date.now(),
            failure: failureRecord,
            insights: [],
            rootCause: null,
            recommendations: [],
            patterns: []
        };
        
        if (!this.learningEngine) return analysis;
        
        // Find similar failures
        const similarFailures = this.findSimilarFailures(failureRecord);
        if (similarFailures.length > 0) {
            analysis.insights.push({
                type: 'SIMILAR_FAILURES',
                message: `Found ${similarFailures.length} similar failures - this is a pattern`,
                failures: similarFailures.slice(0, 5)
            });
            
            // Extract pattern
            const pattern = this.extractFailurePattern(failureRecord, similarFailures);
            analysis.patterns.push(pattern);
            this.patternDetection.sharedPatterns.push(pattern);
        }
        
        // Learning system suggests root cause
        if (failureRecord.action.issueType) {
            const bestSolution = this.learningEngine.getBestSolution(failureRecord.action.issueType);
            if (bestSolution) {
                analysis.recommendations.push({
                    type: 'LEARNED_SOLUTION',
                    message: `Learning system suggests trying: ${bestSolution.description || bestSolution.method}`,
                    solution: bestSolution
                });
            }
        }
        
        // Check if this matches known failure patterns
        const knownFailurePatterns = this.getKnownFailurePatterns(failureRecord);
        if (knownFailurePatterns.length > 0) {
            analysis.insights.push({
                type: 'KNOWN_FAILURE_PATTERN',
                message: 'This matches a known failure pattern',
                patterns: knownFailurePatterns
            });
        }
        
        // Determine root cause together
        analysis.rootCause = this.determineRootCauseTogether(failureRecord, similarFailures);
        
        return analysis;
    }
    
    /**
     * Extract lesson from AI failure
     */
    extractFailureLesson(action, result) {
        return `AI tried ${action.method || 'action'} for ${action.issueType || 'issue'} but it failed: ${result.reason || 'unknown reason'}. ${result.whatShouldHaveHappened || 'Consider alternative approach.'}`;
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
            confidence: null,
            webSearchRequired: false,
            webSearchTerms: []
        };
        
        // Set active problem
        this.activeProblem = context;
        
        // CRITICAL: Check if learning system requires web search
        const webSearchRequired = this.stateStore.getState('ai.learning.webSearchRequired');
        if (webSearchRequired && !webSearchRequired.resolved) {
            assistance.webSearchRequired = true;
            assistance.webSearchTerms = webSearchRequired.searchTerms || [];
            assistance.webSearchMessage = webSearchRequired.message || 'Learning system requires web search before continuing.';
            assistance.webSearchUrgency = webSearchRequired.urgency || 'high';
            
            // Add web search as top priority suggestion
            assistance.suggestions.unshift({
                type: 'web_search',
                priority: 'critical',
                message: assistance.webSearchMessage,
                searchTerms: assistance.webSearchTerms,
                why: `After ${webSearchRequired.consecutiveFailures} consecutive failure(s), learning system requires online research for authoritative solutions.`,
                action: 'Search online using the provided search terms and store findings in learning system.'
            });
        }
        
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
            
            // Generate suggestions (web search already added if required)
            const regularSuggestions = this.generateHelpSuggestions(context, similarProblems, relevantPatterns);
            assistance.suggestions.push(...regularSuggestions);
            
            // Learning system predicts what AI might do wrong
            const prediction = this.generateAIMistakePrediction(context);
            if (prediction) {
                assistance.predictions = [prediction];
                this.learningSystemPredictsAI(context, prediction);
            }
        }
        
        // Start working together on this problem
        const collaboration = this.workTogetherOnProblem(context);
        assistance.collaboration = collaboration;
        
        // Emit event
        this.emit('aiNeedsHelp', { context, assistance });
        
        return assistance;
    }
    
    /**
     * Enforce web search after failures - CRITICAL: Learning system must tell AI to search online
     */
    enforceWebSearchAfterFailure(action, result) {
        // After 1-2 failures, learning system MUST tell AI to search online
        if (this.failureTracking.consecutiveFailures >= 1 && !this.failureTracking.webSearchEnforced) {
            this.failureTracking.webSearchEnforced = true;
            
            // Generate search terms from failure
            const searchTerms = this.generateSearchTermsFromFailure(action, result);
            
            // Store in learning system that web search is required
            const webSearchRequirement = {
                type: 'web_search_required',
                timestamp: Date.now(),
                consecutiveFailures: this.failureTracking.consecutiveFailures,
                action: {
                    type: action.type,
                    method: action.method,
                    issueType: action.issueType,
                    component: action.component
                },
                failure: {
                    reason: result.reason || result.error || 'Unknown failure reason',
                    error: result.error
                },
                searchTerms: searchTerms,
                urgency: this.failureTracking.consecutiveFailures >= 2 ? 'critical' : 'high',
                message: this.failureTracking.consecutiveFailures >= 2 
                    ? 'CRITICAL: Multiple failures detected. You MUST search online for solutions immediately.'
                    : 'Failure detected. Learning system requires you to search online for solutions before continuing.'
            };
            
            // Store in state for AI to query
            this.stateStore.updateState('ai.learning.webSearchRequired', webSearchRequirement);
            
            // Emit event that learning system is telling AI to search
            this.emit('learningSystemRequiresWebSearch', webSearchRequirement);
            
            gameLogger.warn('CERBERUS', '[LEARNING_SYSTEM] Web search required after failure', {
                consecutiveFailures: this.failureTracking.consecutiveFailures,
                searchTerms: searchTerms,
                action: 'Learning system enforcing web search - AI must search online'
            });
        }
    }
    
    /**
     * Generate search terms from failure context
     */
    generateSearchTermsFromFailure(action, result) {
        const terms = [];
        
        // Add error message if available
        if (result.error) {
            terms.push(result.error);
        }
        
        // Add issue type
        if (action.issueType) {
            terms.push(action.issueType);
        }
        
        // Add component
        if (action.component) {
            terms.push(action.component);
        }
        
        // Add method that failed
        if (action.method) {
            terms.push(action.method);
        }
        
        // Add failure reason
        if (result.reason) {
            const reasonWords = result.reason.split(/\s+/).filter(w => w.length > 3);
            terms.push(...reasonWords.slice(0, 3)); // Top 3 words from reason
        }
        
        // Remove duplicates and return
        return [...new Set(terms)].slice(0, 5); // Max 5 search terms
    }
    
    /**
     * Generate prediction of what AI might do wrong
     */
    generateAIMistakePrediction(context) {
        if (!this.learningEngine) return null;
        
        // Check if similar problems were solved before
        const aiFailures = this.sharedKnowledge.failures.filter(f => 
            f.action.issueType === context.issue ||
            f.action.component === context.component
        );
        
        if (aiFailures.length > 0) {
            // AI has failed on similar problems before
            const commonMistake = aiFailures[0];
            return {
                whatAIMightDo: commonMistake.action.method,
                whyItMightFail: commonMistake.failure.reason,
                betterApproach: this.learningEngine.getBestSolution(context.issue)?.method || 'Try learned solution',
                confidence: 0.8
            };
        }
        
        return null;
    }
    
    /**
     * Query learning system - unified interface
     */
    queryLearning(question) {
        if (!this.learningEngine) {
            return { error: 'Learning engine not available' };
        }
        
        const lower = question.toLowerCase();
        
        // "What did learning system teach me?"
        if (lower.includes('what did learning') || lower.includes('learning system taught') || lower.includes('what worked for learning')) {
            return {
                type: 'learning_system_knowledge',
                knowledge: this.getLearningSystemKnowledge()
            };
        }
        
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
     * We work together proactively
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
                
                // Learning system predicts what AI might do wrong for this issue
                const prediction = this.generateAIMistakePrediction({
                    issue: issue.type,
                    component: issue.component
                });
                if (prediction) {
                    this.learningSystemPredictsAI(issue, prediction);
                }
                
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
        
        // Check for recent failures that need joint analysis
        const recentFailures = this.sharedKnowledge.failures
            .filter(f => Date.now() - f.timestamp < 60000) // Last minute
            .slice(-5);
        
        if (recentFailures.length > 0) {
            // Proactively analyze failures together
            for (const failure of recentFailures) {
                if (!failure.analyzed) {
                    const analysis = this.analyzeFailureTogether(failure);
                    failure.analyzed = true;
                    this.emit('proactiveFailureAnalysis', analysis);
                }
            }
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
    
    /**
     * Check PowerShell syntax before applying changes
     */
    async checkPowerShellSyntax(action) {
        if (!this.powerShellSyntaxValidator || !action.filePath) {
            return null;
        }
        
        try {
            // If action has newContent, validate that
            if (action.newContent) {
                return await this.powerShellSyntaxValidator.validateScript(action.filePath, action.newContent);
            }
            
            // Otherwise validate the file as-is
            return await this.powerShellSyntaxValidator.validateScript(action.filePath);
        } catch (error) {
            gameLogger.warn('CERBERUS', '[AI_COLLABORATION] Syntax check error', {
                filePath: action.filePath,
                error: error.message
            });
            return null;
        }
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
