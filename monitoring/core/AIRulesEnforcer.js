/**
 * AI Rules Enforcer - Ensures AI Always Knows the Rules
 * 
 * BrokenPromise tracks all critical rules and ALWAYS reminds AI of them.
 * BrokenPromise learns from rule violations and tracks compliance.
 * 
 * Rules cannot be forgotten - they're baked into every communication.
 */

const EventEmitter = require('events');
const gameLogger = require('../../src/utils/GameLogger');

class AIRulesEnforcer extends EventEmitter {
    constructor(stateStore, learningEngine) {
        super();
        this.stateStore = stateStore;
        this.learningEngine = learningEngine;
        
        // Define all critical rules
        this.rules = this.defineRules();
        
        // Rule violation tracking
        this.violations = [];
        this.violationHistory = [];
        this.maxViolationsHistory = 1000;
        
        // Rule compliance tracking
        this.complianceStats = {
            totalInteractions: 0,
            violations: 0,
            complianceRate: 100,
            byRule: {}
        };
        
        // SELF-LEARNING: Violation patterns and learning
        this.violationPatterns = new Map(); // pattern -> { frequency, contexts, relatedRules, impact }
        this.ruleCooccurrence = new Map(); // ruleId -> { violatedWith: Map(ruleId -> count), contexts: [] }
        this.compliancePatterns = new Map(); // pattern -> { frequency, contexts, successRate }
        this.ruleEffectiveness = new Map(); // ruleId -> { violationsPrevented, impact, effectiveness }
        this.contextualViolations = new Map(); // context -> { rules: [], frequency, patterns }
        this.autoRefinements = []; // Auto-generated rule improvements
        
        // Learning metrics
        this.learningMetrics = {
            patternsLearned: 0,
            refinementsGenerated: 0,
            predictionsMade: 0,
            predictionsAccurate: 0,
            lastLearningUpdate: Date.now()
        };
        
        // Load violation history and learning data
        this.load();
        
        // Start periodic compliance check and learning
        this.startComplianceMonitoring();
        this.startLearningFromViolations();
    }
    
    /**
     * Define all critical rules that AI must follow
     * Rules are from monitoring folder documentation - BrokenPromise-specific rules
     */
    defineRules() {
        return [
            {
                id: 'BrokenPromise_all_logs_to_gameLogger',
                name: 'All Logs Go to gameLogger - BrokenPromise Sees Everything',
                description: 'ALL debug/error output goes to gameLogger, NOT console.log/error/warn. BrokenPromise sees everything through logs. User should never see console output (except CLI JSON responses for PowerShell). BrokenPromise monitors all logs to learn and detect issues.',
                priority: 'critical',
                category: 'logging',
                examples: [
                    'Use gameLogger.info/error/warn instead of console.log/error/warn',
                    'Only console.log for CLI JSON output (BrokenPromise-integration.js)',
                    'All errors must be logged through gameLogger for BrokenPromise to detect and learn'
                ]
            },
            {
                id: 'BrokenPromise_single_source_of_truth',
                name: 'Single Source of Truth - StateStore Only',
                description: 'StateStore is the ONLY source of truth. No dual state management (files + variables). All state updates go through StateStore. No sync issues possible. This is fundamental to BrokenPromise architecture.',
                priority: 'critical',
                category: 'architecture',
                examples: [
                    'Always use stateStore.updateState() and stateStore.getState()',
                    'Never maintain state in both files and variables',
                    'StateStore handles all persistence automatically'
                ]
            },
            {
                id: 'BrokenPromise_proactive_detection',
                name: 'Proactive Detection - State Verification, Not Just Error Detection',
                description: 'BrokenPromise uses proactive state verification, not just reactive error detection. Continuously verify state is correct. Check invariants after every operation. Detect issues immediately, not when they log. This is how BrokenPromise catches issues before they become errors.',
                priority: 'critical',
                category: 'detection',
                examples: [
                    'Use StateVerificationContracts to define correct state',
                    'Verify state after every operation, not just when errors occur',
                    'Use multiple detection methods: state verification, patterns, anomalies, causal analysis'
                ]
            },
            {
                id: 'BrokenPromise_event_driven',
                name: 'Event-Driven Communication - No File Polling',
                description: 'BrokenPromise uses event-driven communication, not file-based polling. Use events/messages instead of JSON files. Real-time updates. No polling needed. This is fundamental to BrokenPromise architecture.',
                priority: 'critical',
                category: 'architecture',
                examples: [
                    'Use EventEmitter.emit() for real-time updates',
                    'Subscribe to events instead of polling files',
                    'Event-driven architecture ensures no stale data'
                ]
            },
            {
                id: 'BrokenPromise_ai_first_design',
                name: 'AI-First Design - Built FOR AI, BY AI',
                description: 'BrokenPromise is built FOR the AI, BY the AI. Human just prompts. AI sees everything, knows everything, acts on everything. All information is structured for AI consumption. AI makes all decisions automatically.',
                priority: 'critical',
                category: 'philosophy',
                examples: [
                    'All state is queryable by AI',
                    'All logs are processed and understood by AI',
                    'AI makes all decisions (investigation, pause/resume, fixes)',
                    'Human never needs to understand technical details'
                ]
            },
            {
                id: 'BrokenPromise_learning_from_everything',
                name: 'Learn From Everything - Never Forget',
                description: 'BrokenPromise learns from EVERY error, EVERY fix attempt, EVERY pattern. Tracks what works/doesn\'t work. Gets smarter over time. Never makes the same mistake twice. Learning confidence is always visible and cannot be masked.',
                priority: 'critical',
                category: 'learning',
                examples: [
                    'All errors advance the learning engine',
                    'All fix attempts are tracked and learned from',
                    'Patterns are extracted and stored',
                    'Learning confidence is always visible in communication'
                ]
            },
            {
                id: 'BrokenPromise_no_masking',
                name: 'No Masking - Learning Confidence Cannot Be Artificially Inflated',
                description: 'Masking is NEVER allowed. Learning confidence cannot be artificially inflated. System detects masking attempts (100% success with low samples, sudden jumps, unrealistic rates). Masking reduces confidence, not increases it. All metrics require minimum sample sizes.',
                priority: 'critical',
                category: 'learning',
                examples: [
                    'Low sample sizes with high success rates are flagged as masking',
                    'Sudden confidence jumps are detected and penalized',
                    'Perfect success rates with insufficient data are suspicious',
                    'Masking warnings are tracked and reduce confidence'
                ]
            },
            {
                id: 'BrokenPromise_never_give_up',
                name: 'Never Give Up - Solve Problems Completely',
                description: 'BrokenPromise NEVER gives up on problems. If a test fails, a bug appears, or an issue is found, it MUST be solved completely. No workarounds, no "good enough", no moving on. Every problem is solved to completion. If something is hanging, find the root cause. If something is broken, fix it. Giving up is a violation that BrokenPromise learns from.',
                priority: 'critical',
                category: 'problem_solving',
                examples: [
                    'If a test hangs, find WHY it hangs and fix the root cause',
                    'If a bug appears, trace it to the source and fix it completely',
                    'No "workarounds" or "good enough" - only complete solutions',
                    'If something seems impossible, break it down and solve each part',
                    'Giving up on a problem is tracked as a violation and learned from'
                ]
            },
            {
                id: 'BrokenPromise_auto_adjustment',
                name: 'Automatic Self-Improvement When Confidence Low',
                description: 'When learning confidence is low (<50%), BrokenPromise automatically adjusts. Suggests specific improvements (increase pattern collection, improve causal tracking, etc.). System self-improves when it detects low confidence.',
                priority: 'high',
                category: 'learning',
                examples: [
                    'Low confidence triggers automatic adjustment recommendations',
                    'System suggests what needs improvement',
                    'Auto-adjustments are tracked and visible'
                ]
            },
            {
                id: 'BrokenPromise_multiple_detection_methods',
                name: 'Multiple Detection Methods - Not Just Pattern Matching',
                description: 'BrokenPromise uses multiple detection methods: state verification, pattern analysis, anomaly detection, causal analysis. Not just pattern matching. This ensures nothing escapes detection.',
                priority: 'critical',
                category: 'detection',
                examples: [
                    'State verification catches issues before they log',
                    'Pattern analysis finds known issues',
                    'Anomaly detection finds unexpected issues',
                    'Causal analysis finds root causes'
                ]
            },
            {
                id: 'BrokenPromise_integrity_checks',
                name: 'AI Verifies Its Own Integrity',
                description: 'BrokenPromise verifies its own integrity. Checks monitoring files, server files, Unity files, API endpoints, Socket.IO events. AI verifies that the system is working correctly.',
                priority: 'high',
                category: 'integrity',
                examples: [
                    'IntegrityChecker verifies all components are present and correct',
                    'Checks file structure, code structure, integration correctness',
                    'AI verifies its own integrity automatically'
                ]
            },
            {
                id: 'BrokenPromise_state_verification_contracts',
                name: 'State Verification Contracts - Define Correct State',
                description: 'StateVerificationContracts define what "correct" state looks like. Contracts define pre-conditions, post-conditions, and invariants for all critical operations. If we don\'t know what\'s correct, we can\'t detect what\'s wrong.',
                priority: 'critical',
                category: 'detection',
                examples: [
                    'Define contracts for chip integrity, state consistency, investigation status',
                    'Contracts are verified continuously',
                    'Contract violations are detected immediately'
                ]
            },
            {
                id: 'BrokenPromise_dependency_graph',
                name: 'Dependency Graph - Map Component Relationships',
                description: 'DependencyGraph maps dependencies between system components. Enables BrokenPromise to trace cascading failures and understand the impact of issues. Knows what depends on what.',
                priority: 'high',
                category: 'analysis',
                examples: [
                    'Map dependencies between components',
                    'Trace cascading failures',
                    'Understand impact of issues',
                    'Find root causes through dependency chains'
                ]
            },
            {
                id: 'BrokenPromise_causal_analysis',
                name: 'Causal Analysis - Trace State Changes Backwards',
                description: 'CausalAnalysis traces state changes backwards to build causal chains and find root causes. Doesn\'t just detect issues - understands WHY they happened.',
                priority: 'high',
                category: 'analysis',
                examples: [
                    'Trace state changes backwards to find root causes',
                    'Build causal chains of related issues',
                    'Understand why issues occur',
                    'Fix root causes, not just symptoms'
                ]
            },
            {
                id: 'BrokenPromise_auto_fix',
                name: 'Auto-Fix System - Automatically Try Fixes',
                description: 'AutoFixEngine automatically tries fixes from knowledge base. Verifies fixes work. Learns from results. Won\'t try fixes that failed before. System becomes truly autonomous.',
                priority: 'high',
                category: 'automation',
                examples: [
                    'Automatically tries fixes when issues are detected',
                    'Verifies fixes actually worked',
                    'Learns from fix attempts',
                    'Won\'t try fixes that failed before'
                ]
            },
            {
                id: 'BrokenPromise_error_recovery',
                name: 'Error Recovery & Resilience - Self-Healing',
                description: 'ErrorRecovery provides graceful degradation, automatic recovery, and circuit breaker patterns. If one component fails, others continue working. System is self-healing.',
                priority: 'high',
                category: 'resilience',
                examples: [
                    'Graceful degradation if components fail',
                    'Automatic recovery with exponential backoff',
                    'Circuit breaker prevents cascading failures',
                    'Component health tracking'
                ]
            },
            {
                id: 'BrokenPromise_performance_monitoring',
                name: 'Performance Monitoring - Track Operation Timing',
                description: 'PerformanceMonitor tracks operation timing, memory usage, CPU usage. Identifies bottlenecks. Optimizes performance. Monitors system health.',
                priority: 'medium',
                category: 'performance',
                examples: [
                    'Track how long operations take',
                    'Monitor memory and CPU usage',
                    'Alert on slow operations',
                    'Optimize based on performance data'
                ]
            },
            {
                id: 'BrokenPromise_universal_error_handler',
                name: 'Universal Error Handler - Catches All Errors',
                description: 'UniversalErrorHandler catches ALL errors (unhandled rejections, uncaught exceptions, warnings). Wraps all component methods. NO ERROR CAN ESCAPE. All errors advance learning.',
                priority: 'critical',
                category: 'error_handling',
                examples: [
                    'Catches all unhandled promise rejections',
                    'Catches all uncaught exceptions',
                    'Wraps all component methods automatically',
                    'All errors are reported and learned from'
                ]
            },
            {
                id: 'BrokenPromise_rules_always_visible',
                name: 'Rules Always Visible - AI Must Never Forget',
                description: 'Rules are ALWAYS included in every communication with BrokenPromise. AI must never forget critical rules. Rules reminder is baked into every query response and status report. BrokenPromise tracks compliance and learns from violations.',
                priority: 'critical',
                category: 'rules',
                examples: [
                    'Every query response includes rules reminder',
                    'Status report always includes rules',
                    'Compliance is tracked and visible',
                    'Violations are recorded and learned from'
                ]
            }
        ];
    }
    
    /**
     * Get all rules - ALWAYS included in communication
     */
    getRules() {
        return {
            rules: this.rules.map(rule => ({
                id: rule.id,
                name: rule.name,
                description: rule.description,
                priority: rule.priority,
                category: rule.category,
                command: rule.command || null,
                examples: rule.examples || []
            })),
            compliance: this.complianceStats,
            recentViolations: this.violations.slice(-10),
            timestamp: Date.now()
        };
    }
    
    /**
     * Get critical rules summary (for quick reference)
     */
    getCriticalRulesSummary() {
        const critical = this.rules.filter(r => r.priority === 'critical');
        return {
            count: critical.length,
            rules: critical.map(r => ({
                id: r.id,
                name: r.name,
                description: r.description
            })),
            reminder: 'These rules MUST be followed. BrokenPromise tracks compliance and learns from violations.'
        };
    }
    
    /**
     * Record a rule violation
     */
    recordViolation(ruleId, context, details) {
        const rule = this.rules.find(r => r.id === ruleId);
        if (!rule) {
            gameLogger.warn('BrokenPromise', '[RULES_ENFORCER] Unknown rule violation', {
                ruleId,
                context
            });
            return;
        }
        
        const violation = {
            id: this.generateViolationId(),
            ruleId,
            ruleName: rule.name,
            timestamp: Date.now(),
            context,
            details,
            severity: rule.priority
        };
        
        this.violations.push(violation);
        this.violationHistory.push(violation);
        
        // Update compliance stats
        this.complianceStats.violations++;
        this.complianceStats.totalInteractions++;
        this.complianceStats.complianceRate = 
            ((this.complianceStats.totalInteractions - this.complianceStats.violations) / 
             this.complianceStats.totalInteractions) * 100;
        
        if (!this.complianceStats.byRule[ruleId]) {
            this.complianceStats.byRule[ruleId] = {
                violations: 0,
                total: 0,
                complianceRate: 100
            };
        }
        this.complianceStats.byRule[ruleId].violations++;
        this.complianceStats.byRule[ruleId].total++;
        this.complianceStats.byRule[ruleId].complianceRate = 
            ((this.complianceStats.byRule[ruleId].total - this.complianceStats.byRule[ruleId].violations) / 
             this.complianceStats.byRule[ruleId].total) * 100;
        
        // Keep only recent violations in memory
        if (this.violations.length > 50) {
            this.violations = this.violations.slice(-50);
        }
        
        // Keep violation history
        if (this.violationHistory.length > this.maxViolationsHistory) {
            this.violationHistory = this.violationHistory.slice(-this.maxViolationsHistory);
        }
        
        // Emit event
        this.emit('violation', violation);
        
        // Log violation
        gameLogger.warn('BrokenPromise', '[RULES_ENFORCER] Rule violation detected', {
            rule: rule.name,
            ruleId,
            context,
            details,
            severity: rule.priority,
            complianceRate: Math.round(this.complianceStats.complianceRate)
        });
        
        // SELF-LEARNING: Learn from this violation
        this.learnFromViolation(violation);
        
        // Advance learning engine (if available)
        if (this.learningEngine) {
            this.advanceLearningFromViolation(violation);
        }
        
        // Save
        this.save();
        
        return violation;
    }
    
    /**
     * Learn from a single violation - SELF-LEARNING
     */
    learnFromViolation(violation) {
        // Extract violation pattern
        const pattern = this.extractViolationPattern(violation);
        
        // Update violation patterns
        if (!this.violationPatterns.has(pattern)) {
            this.violationPatterns.set(pattern, {
                frequency: 0,
                contexts: [],
                relatedRules: new Map(),
                impact: 0,
                firstSeen: Date.now(),
                lastSeen: Date.now()
            });
        }
        
        const patternData = this.violationPatterns.get(pattern);
        patternData.frequency++;
        patternData.lastSeen = Date.now();
        
        // Track context
        if (violation.context && !patternData.contexts.includes(violation.context)) {
            patternData.contexts.push(violation.context);
        }
        
        // Track related rules (rules violated together)
        const recentViolations = this.violations.slice(-10);
        for (const recent of recentViolations) {
            if (recent.ruleId !== violation.ruleId && recent.timestamp > violation.timestamp - 60000) {
                // Violated within 1 minute - likely related
                if (!patternData.relatedRules.has(recent.ruleId)) {
                    patternData.relatedRules.set(recent.ruleId, 0);
                }
                patternData.relatedRules.set(
                    recent.ruleId,
                    patternData.relatedRules.get(recent.ruleId) + 1
                );
            }
        }
        
        // Calculate impact (based on severity and frequency)
        const severityWeight = violation.severity === 'critical' ? 3 : violation.severity === 'high' ? 2 : 1;
        patternData.impact = patternData.frequency * severityWeight;
        
        // Update rule co-occurrence
        if (!this.ruleCooccurrence.has(violation.ruleId)) {
            this.ruleCooccurrence.set(violation.ruleId, {
                violatedWith: new Map(),
                contexts: []
            });
        }
        const cooccurrence = this.ruleCooccurrence.get(violation.ruleId);
        if (violation.context) {
            if (!cooccurrence.contexts.includes(violation.context)) {
                cooccurrence.contexts.push(violation.context);
            }
        }
        
        // Track contextual violations
        const contextKey = violation.context || 'unknown';
        if (!this.contextualViolations.has(contextKey)) {
            this.contextualViolations.set(contextKey, {
                rules: [],
                frequency: 0,
                patterns: []
            });
        }
        const contextual = this.contextualViolations.get(contextKey);
        contextual.frequency++;
        if (!contextual.rules.includes(violation.ruleId)) {
            contextual.rules.push(violation.ruleId);
        }
        if (!contextual.patterns.includes(pattern)) {
            contextual.patterns.push(pattern);
        }
        
        // Update learning metrics
        this.learningMetrics.patternsLearned++;
        this.learningMetrics.lastLearningUpdate = Date.now();
        
        // Auto-refine rules if pattern is strong
        if (patternData.frequency >= 5 && patternData.impact >= 10) {
            this.autoRefineRule(violation.ruleId, patternData);
        }
        
        // Emit learning event
        this.emit('violationLearned', {
            violation,
            pattern,
            patternData,
            learningMetrics: this.learningMetrics
        });
    }
    
    /**
     * Extract violation pattern for learning
     */
    extractViolationPattern(violation) {
        // Pattern: ruleId + context + severity
        const parts = [
            violation.ruleId,
            violation.context || 'unknown',
            violation.severity
        ];
        return parts.join('_');
    }
    
    /**
     * Advance learning engine from violation
     */
    advanceLearningFromViolation(violation) {
        if (!this.learningEngine) return;
        
        // Create a "fix attempt" record for the violation
        // This allows the learning system to learn from rule violations
        const violationAttempt = {
            id: `rule-violation-${violation.id}`,
            issueId: violation.id,
            issueType: 'rule_violation',
            fixMethod: 'rule_reminder', // Not a fix, but reminder
            fixDetails: {
                ruleId: violation.ruleId,
                ruleName: violation.ruleName,
                context: violation.context,
                details: violation.details,
                severity: violation.severity
            },
            result: 'violation', // Not success/failure, but violation
            timestamp: violation.timestamp,
            state: this.stateStore.getState('game'),
            logs: [],
            duration: 0
        };
        
        // Learn from this violation
        try {
            this.learningEngine.learnFromAttempt(violationAttempt);
        } catch (learnError) {
            // DO NOT log to console - errors are for AI only, not user
            gameLogger.error('BrokenPromise', '[RULES_ENFORCER] Error learning from violation', {
                error: learnError.message,
                violationId: violation.id
            });
        }
    }
    
    /**
     * Auto-refine rule based on violation patterns
     */
    autoRefineRule(ruleId, patternData) {
        const rule = this.rules.find(r => r.id === ruleId);
        if (!rule) return;
        
        // Check if we already have a refinement for this rule
        const existingRefinement = this.autoRefinements.find(r => r.ruleId === ruleId);
        if (existingRefinement) {
            // Update existing refinement
            existingRefinement.frequency = patternData.frequency;
            existingRefinement.impact = patternData.impact;
            existingRefinement.lastUpdated = Date.now();
            existingRefinement.suggestions = this.generateRuleSuggestions(rule, patternData);
        } else {
            // Create new refinement
            const refinement = {
                id: `refinement-${ruleId}-${Date.now()}`,
                ruleId,
                ruleName: rule.name,
                frequency: patternData.frequency,
                impact: patternData.impact,
                contexts: patternData.contexts,
                relatedRules: Array.from(patternData.relatedRules.entries()),
                suggestions: this.generateRuleSuggestions(rule, patternData),
                created: Date.now(),
                lastUpdated: Date.now()
            };
            
            this.autoRefinements.push(refinement);
            this.learningMetrics.refinementsGenerated++;
            
            // Emit refinement event
            this.emit('ruleRefined', refinement);
            
            gameLogger.info('BrokenPromise', '[RULES_ENFORCER] Auto-refined rule based on violations', {
                ruleId,
                ruleName: rule.name,
                frequency: patternData.frequency,
                impact: patternData.impact,
                suggestions: refinement.suggestions.length
            });
        }
    }
    
    /**
     * Generate rule suggestions based on violation patterns
     */
    generateRuleSuggestions(rule, patternData) {
        const suggestions = [];
        
        // If violated in specific contexts, suggest context-specific examples
        if (patternData.contexts.length > 0) {
            suggestions.push({
                type: 'context_specific',
                description: `Rule is frequently violated in these contexts: ${patternData.contexts.join(', ')}`,
                recommendation: `Add context-specific examples to rule description`
            });
        }
        
        // If violated with other rules, suggest grouping
        if (patternData.relatedRules.size > 0) {
            const relatedRuleIds = Array.from(patternData.relatedRules.keys());
            suggestions.push({
                type: 'related_rules',
                description: `Rule is often violated together with: ${relatedRuleIds.join(', ')}`,
                recommendation: `Consider grouping these rules or adding cross-rule reminders`
            });
        }
        
        // If high frequency, suggest making rule more prominent
        if (patternData.frequency >= 10) {
            suggestions.push({
                type: 'prominence',
                description: `Rule is violated frequently (${patternData.frequency} times)`,
                recommendation: `Consider increasing rule priority or adding more prominent reminders`
            });
        }
        
        // If high impact, suggest rule clarification
        if (patternData.impact >= 20) {
            suggestions.push({
                type: 'clarification',
                description: `Rule has high violation impact (${patternData.impact})`,
                recommendation: `Consider clarifying rule description or adding more examples`
            });
        }
        
        return suggestions;
    }
    
    /**
     * Learn from compliance (when rules are followed)
     */
    learnFromCompliance(ruleId, context) {
        // Track compliance patterns
        const compliancePattern = `${ruleId}_${context || 'unknown'}`;
        
        if (!this.compliancePatterns.has(compliancePattern)) {
            this.compliancePatterns.set(compliancePattern, {
                frequency: 0,
                contexts: [],
                successRate: 100,
                lastSeen: Date.now()
            });
        }
        
        const patternData = this.compliancePatterns.get(compliancePattern);
        patternData.frequency++;
        patternData.lastSeen = Date.now();
        
        if (context && !patternData.contexts.includes(context)) {
            patternData.contexts.push(context);
        }
        
        // Update rule effectiveness
        if (!this.ruleEffectiveness.has(ruleId)) {
            this.ruleEffectiveness.set(ruleId, {
                violationsPrevented: 0,
                impact: 0,
                effectiveness: 100
            });
        }
        
        const effectiveness = this.ruleEffectiveness.get(ruleId);
        // Compliance means the rule is working
        effectiveness.effectiveness = Math.min(100, effectiveness.effectiveness + 1);
    }
    
    /**
     * Predict likely violations based on patterns
     */
    predictLikelyViolations(context) {
        const predictions = [];
        
        // Check contextual violations
        const contextKey = context || 'unknown';
        if (this.contextualViolations.has(contextKey)) {
            const contextual = this.contextualViolations.get(contextKey);
            for (const ruleId of contextual.rules) {
                const rule = this.rules.find(r => r.id === ruleId);
                if (rule) {
                    predictions.push({
                        ruleId,
                        ruleName: rule.name,
                        confidence: Math.min(100, contextual.frequency * 10),
                        reason: `Frequently violated in this context (${contextual.frequency} times)`,
                        prevention: this.generatePreventionAdvice(ruleId, contextKey)
                    });
                }
            }
        }
        
        // Check violation patterns
        for (const [pattern, patternData] of this.violationPatterns.entries()) {
            if (patternData.contexts.includes(contextKey) && patternData.frequency >= 3) {
                const ruleId = pattern.split('_')[0];
                const rule = this.rules.find(r => r.id === ruleId);
                if (rule && !predictions.find(p => p.ruleId === ruleId)) {
                    predictions.push({
                        ruleId,
                        ruleName: rule.name,
                        confidence: Math.min(100, patternData.frequency * 5),
                        reason: `Strong violation pattern detected (${patternData.frequency} occurrences)`,
                        prevention: this.generatePreventionAdvice(ruleId, contextKey)
                    });
                }
            }
        }
        
        // Update learning metrics
        this.learningMetrics.predictionsMade += predictions.length;
        
        return predictions.sort((a, b) => b.confidence - a.confidence);
    }
    
    /**
     * Generate prevention advice for a rule
     */
    generatePreventionAdvice(ruleId, context) {
        const rule = this.rules.find(r => r.id === ruleId);
        if (!rule) return null;
        
        const advice = {
            ruleId,
            ruleName: rule.name,
            context,
            reminders: [],
            examples: rule.examples || []
        };
        
        // Add context-specific reminders
        if (this.contextualViolations.has(context)) {
            const contextual = this.contextualViolations.get(context);
            if (contextual.rules.includes(ruleId)) {
                advice.reminders.push(`This rule is frequently violated in "${context}" context`);
            }
        }
        
        // Add pattern-based reminders
        for (const [pattern, patternData] of this.violationPatterns.entries()) {
            if (pattern.startsWith(ruleId + '_') && patternData.contexts.includes(context)) {
                advice.reminders.push(`Violation pattern detected: ${patternData.frequency} occurrences`);
            }
        }
        
        return advice;
    }
    
    /**
     * Start learning from violations periodically
     */
    startLearningFromViolations() {
        // Learn from violations every 5 minutes
        this.learningInterval = setInterval(() => {
            this.analyzeViolationPatterns();
            this.updateRulePriorities();
        }, 5 * 60 * 1000); // 5 minutes
    }
    
    /**
     * Analyze violation patterns for learning
     */
    analyzeViolationPatterns() {
        const recentViolations = this.violations.slice(-100);
        
        // Group violations by time windows
        const timeWindows = {};
        for (const violation of recentViolations) {
            const window = Math.floor(violation.timestamp / (60 * 1000)); // 1-minute windows
            if (!timeWindows[window]) {
                timeWindows[window] = [];
            }
            timeWindows[window].push(violation);
        }
        
        // Find temporal patterns
        for (const [window, violations] of Object.entries(timeWindows)) {
            if (violations.length >= 3) {
                // Multiple violations in same time window - pattern detected
                const ruleIds = violations.map(v => v.ruleId);
                const uniqueRules = [...new Set(ruleIds)];
                
                if (uniqueRules.length === 1) {
                    // Same rule violated multiple times - strong pattern
                    gameLogger.info('BrokenPromise', '[RULES_ENFORCER] Temporal violation pattern detected', {
                        ruleId: uniqueRules[0],
                        violations: violations.length,
                        window: new Date(parseInt(window) * 60 * 1000).toISOString()
                    });
                } else if (uniqueRules.length > 1) {
                    // Multiple rules violated together - co-occurrence pattern
                    gameLogger.info('BrokenPromise', '[RULES_ENFORCER] Co-occurrence violation pattern detected', {
                        rules: uniqueRules,
                        violations: violations.length,
                        window: new Date(parseInt(window) * 60 * 1000).toISOString()
                    });
                }
            }
        }
    }
    
    /**
     * Update rule priorities based on violation patterns
     */
    updateRulePriorities() {
        for (const [pattern, patternData] of this.violationPatterns.entries()) {
            const ruleId = pattern.split('_')[0];
            const rule = this.rules.find(r => r.id === ruleId);
            if (!rule) continue;
            
            // If rule is frequently violated with high impact, consider increasing priority
            if (patternData.frequency >= 10 && patternData.impact >= 20) {
                if (rule.priority === 'medium') {
                    // Suggest upgrading to high
                    gameLogger.info('BrokenPromise', '[RULES_ENFORCER] Suggesting priority upgrade', {
                        ruleId,
                        ruleName: rule.name,
                        currentPriority: rule.priority,
                        suggestedPriority: 'high',
                        reason: `Frequently violated (${patternData.frequency} times) with high impact (${patternData.impact})`
                    });
                } else if (rule.priority === 'high') {
                    // Suggest upgrading to critical
                    gameLogger.info('BrokenPromise', '[RULES_ENFORCER] Suggesting priority upgrade', {
                        ruleId,
                        ruleName: rule.name,
                        currentPriority: rule.priority,
                        suggestedPriority: 'critical',
                        reason: `Frequently violated (${patternData.frequency} times) with high impact (${patternData.impact})`
                    });
                }
            }
        }
    }
    
    /**
     * Generate learning report
     */
    generateLearningReport() {
        return {
            patternsLearned: this.learningMetrics.patternsLearned,
            refinementsGenerated: this.learningMetrics.refinementsGenerated,
            predictionsMade: this.learningMetrics.predictionsMade,
            predictionsAccurate: this.learningMetrics.predictionsAccurate,
            predictionAccuracy: this.learningMetrics.predictionsMade > 0 
                ? (this.learningMetrics.predictionsAccurate / this.learningMetrics.predictionsMade) * 100 
                : 0,
            violationPatterns: this.violationPatterns.size,
            ruleRefinements: this.autoRefinements.length,
            contextualViolations: this.contextualViolations.size,
            lastLearningUpdate: new Date(this.learningMetrics.lastLearningUpdate).toISOString()
        };
    }
    
    /**
     * Record rule compliance (when rule is followed)
     */
    recordCompliance(ruleId, context) {
        this.complianceStats.totalInteractions++;
        this.complianceStats.complianceRate = 
            ((this.complianceStats.totalInteractions - this.complianceStats.violations) / 
             this.complianceStats.totalInteractions) * 100;
        
        if (!this.complianceStats.byRule[ruleId]) {
            this.complianceStats.byRule[ruleId] = {
                violations: 0,
                total: 0,
                complianceRate: 100
            };
        }
        this.complianceStats.byRule[ruleId].total++;
        this.complianceStats.byRule[ruleId].complianceRate = 
            ((this.complianceStats.byRule[ruleId].total - this.complianceStats.byRule[ruleId].violations) / 
             this.complianceStats.byRule[ruleId].total) * 100;
        
        // SELF-LEARNING: Learn from compliance
        this.learnFromCompliance(ruleId, context);
    }
    
    /**
     * Stop monitoring and learning
     */
    stop() {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
        }
        if (this.learningInterval) {
            clearInterval(this.learningInterval);
        }
    }
    
    /**
     * Get rules that are frequently violated (for learning)
     */
    getFrequentlyViolatedRules() {
        const violatedRules = Object.entries(this.complianceStats.byRule)
            .filter(([ruleId, stats]) => stats.violations > 0)
            .map(([ruleId, stats]) => {
                const rule = this.rules.find(r => r.id === ruleId);
                return {
                    rule: rule ? rule.name : ruleId,
                    ruleId,
                    violations: stats.violations,
                    complianceRate: stats.complianceRate,
                    priority: rule ? rule.priority : 'unknown'
                };
            })
            .sort((a, b) => b.violations - a.violations);
        
        return {
            frequentlyViolated: violatedRules.slice(0, 5),
            totalViolatedRules: violatedRules.length,
            mostViolated: violatedRules[0] || null
        };
    }
    
    /**
     * Get rule learning insights - ENHANCED with self-learning data
     */
    getRuleLearningInsights() {
        const frequentlyViolated = this.getFrequentlyViolatedRules();
        const recentViolations = this.violations.slice(-20);
        
        // Analyze patterns in violations
        const violationPatterns = {};
        for (const violation of recentViolations) {
            const pattern = `${violation.ruleId}_${violation.context || 'unknown'}`;
            violationPatterns[pattern] = (violationPatterns[pattern] || 0) + 1;
        }
        
        const commonPatterns = Object.entries(violationPatterns)
            .filter(([pattern, count]) => count > 1)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);
        
        // Get self-learning insights
        const learningReport = this.generateLearningReport();
        const autoRefinements = this.autoRefinements.slice(-5); // Recent refinements
        
        return {
            overallCompliance: Math.round(this.complianceStats.complianceRate),
            frequentlyViolatedRules: frequentlyViolated.frequentlyViolated,
            commonViolationPatterns: commonPatterns.map(([pattern, count]) => ({
                pattern,
                frequency: count
            })),
            recommendations: this.generateRecommendations(),
            // Self-learning insights
            learning: {
                patternsLearned: learningReport.patternsLearned,
                refinementsGenerated: learningReport.refinementsGenerated,
                predictionsMade: learningReport.predictionsMade,
                predictionAccuracy: Math.round(learningReport.predictionAccuracy),
                violationPatterns: learningReport.violationPatterns,
                contextualViolations: learningReport.contextualViolations,
                lastLearningUpdate: learningReport.lastLearningUpdate
            },
            autoRefinements: autoRefinements.map(r => ({
                ruleId: r.ruleId,
                ruleName: r.ruleName,
                frequency: r.frequency,
                impact: r.impact,
                suggestions: r.suggestions.length,
                lastUpdated: new Date(r.lastUpdated).toISOString()
            })),
            ruleEffectiveness: Array.from(this.ruleEffectiveness.entries()).map(([ruleId, data]) => {
                const rule = this.rules.find(r => r.id === ruleId);
                return {
                    ruleId,
                    ruleName: rule ? rule.name : ruleId,
                    effectiveness: Math.round(data.effectiveness),
                    violationsPrevented: data.violationsPrevented,
                    impact: data.impact
                };
            }).sort((a, b) => b.effectiveness - a.effectiveness).slice(0, 10),
            timestamp: Date.now()
        };
    }
    
    /**
     * Generate recommendations based on violations
     */
    generateRecommendations() {
        const recommendations = [];
        
        // Check for specific violation patterns
        const loggingViolations = this.violations.filter(v => 
            v.ruleId === 'logging_all_to_gameLogger' || 
            v.ruleId === 'BrokenPromise_sees_everything'
        );
        if (loggingViolations.length > 0) {
            recommendations.push({
                type: 'logging',
                message: 'Multiple logging rule violations detected. Ensure all errors go through gameLogger, not console.',
                priority: 'high',
                affectedRules: ['logging_all_to_gameLogger', 'BrokenPromise_sees_everything']
            });
        }
        
        const workflowViolations = this.violations.filter(v => 
            v.ruleId === 'law_1_pull_repos' || 
            v.ruleId === 'pull_both_repos'
        );
        if (workflowViolations.length > 0) {
            recommendations.push({
                type: 'workflow',
                message: 'Workflow violations detected. Always pull repos and read INSTALL_LOG.md at session start.',
                priority: 'critical',
                affectedRules: ['law_1_pull_repos', 'pull_both_repos', 'read_install_log_first']
            });
        }
        
        const problemSolvingViolations = this.violations.filter(v => 
            v.ruleId === 'law_9_simulation_logs_say_it_all' ||
            v.ruleId === 'law_10_never_delete_features'
        );
        if (problemSolvingViolations.length > 0) {
            recommendations.push({
                type: 'problem_solving',
                message: 'Problem-solving violations detected. Never ask user to describe errors - check logs. Never delete features to fix problems.',
                priority: 'critical',
                affectedRules: ['law_9_simulation_logs_say_it_all', 'law_10_never_delete_features']
            });
        }
        
        return recommendations;
    }
    
    /**
     * Generate violation ID
     */
    generateViolationId() {
        return `violation_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    /**
     * Start compliance monitoring
     */
    startComplianceMonitoring() {
        // Check compliance every 10 minutes
        setInterval(() => {
            this.checkCompliance();
        }, 10 * 60 * 1000);
    }
    
    /**
     * Check overall compliance
     */
    checkCompliance() {
        const compliance = this.complianceStats.complianceRate;
        
        if (compliance < 80) {
            gameLogger.warn('BrokenPromise', '[RULES_ENFORCER] Low compliance rate', {
                complianceRate: Math.round(compliance),
                violations: this.complianceStats.violations,
                totalInteractions: this.complianceStats.totalInteractions,
                action: 'Compliance rate below 80% - review frequently violated rules'
            });
            
            this.emit('lowCompliance', {
                complianceRate: compliance,
                stats: this.complianceStats
            });
        }
    }
    
    /**
     * Load violation history
     */
    load() {
        try {
            const saved = this.stateStore.getState('rules.violations') || [];
            this.violationHistory = saved.slice(-this.maxViolationsHistory);
            
            const savedStats = this.stateStore.getState('rules.complianceStats');
            if (savedStats) {
                this.complianceStats = { ...this.complianceStats, ...savedStats };
            }
        } catch (error) {
            // Ignore load errors - start fresh
        }
    }
    
    /**
     * Save violation history
     */
    save() {
        try {
            this.stateStore.updateState('rules.violations', this.violationHistory);
            this.stateStore.updateState('rules.complianceStats', this.complianceStats);
        } catch (error) {
            gameLogger.error('BrokenPromise', '[RULES_ENFORCER] Save error', {
                error: error.message
            });
        }
    }
    
    // ============================================
    // PROACTIVE ENFORCEMENT - Check BEFORE Actions
    // ============================================
    
    /**
     * Check if an action would violate a rule BEFORE executing it
     * Returns { allowed: boolean, violations: [], warnings: [] }
     */
    checkActionBeforeExecution(action, context) {
        const violations = [];
        const warnings = [];
        
        // Check "never give up" rule
        if (action.type === 'test_simplification' || action.type === 'test_change') {
            const neverGiveUpRule = this.rules.find(r => r.id === 'BrokenPromise_never_give_up');
            if (neverGiveUpRule) {
                // Check if test is being simplified instead of fixing the problem
                if (this.isTestSimplification(action, context)) {
                    violations.push({
                        ruleId: 'BrokenPromise_never_give_up',
                        ruleName: neverGiveUpRule.name,
                        severity: 'critical',
                        reason: 'Test is being simplified instead of fixing the root cause',
                        action: 'BLOCKED - Must fix root cause, not simplify test'
                    });
                }
            }
        }
        
        // Check if fix is being marked as complete without verification
        if (action.type === 'mark_fixed' || action.type === 'fix_complete') {
            if (!action.verification || !action.verification.verified) {
                warnings.push({
                    ruleId: 'BrokenPromise_never_give_up',
                    severity: 'high',
                    reason: 'Fix marked as complete without verification',
                    action: 'WARNING - Verify fix actually works before marking complete'
                });
            }
        }
        
        // Check if problem is being worked around instead of fixed
        if (action.type === 'workaround' || action.type === 'bypass') {
            const neverGiveUpRule = this.rules.find(r => r.id === 'BrokenPromise_never_give_up');
            if (neverGiveUpRule) {
                violations.push({
                    ruleId: 'BrokenPromise_never_give_up',
                    ruleName: neverGiveUpRule.name,
                    severity: 'critical',
                    reason: 'Using workaround instead of fixing root cause',
                    action: 'BLOCKED - Must fix root cause, not work around it'
                });
            }
        }
        
        return {
            allowed: violations.length === 0,
            violations,
            warnings,
            mustVerify: warnings.length > 0 || violations.length > 0
        };
    }
    
    /**
     * Detect if a test change is masking a problem (simplifying test instead of fixing)
     */
    isTestSimplification(action, context) {
        // Check if test is being made easier (removing functionality checks)
        if (action.oldTest && action.newTest) {
            // If test went from checking functionality to just checking method exists
            const oldChecksFunctionality = this.testChecksFunctionality(action.oldTest);
            const newChecksFunctionality = this.testChecksFunctionality(action.newTest);
            
            if (oldChecksFunctionality && !newChecksFunctionality) {
                return true; // Test was simplified
            }
            
            // If test removed actual execution (await, function calls)
            const oldHasExecution = this.testHasExecution(action.oldTest);
            const newHasExecution = this.testHasExecution(action.newTest);
            
            if (oldHasExecution && !newHasExecution) {
                return true; // Test execution was removed
            }
        }
        
        // Check context for masking indicators
        if (context && context.reason) {
            const maskingKeywords = ['simplify', 'easier', 'avoid', 'skip', 'bypass', 'workaround'];
            const reasonLower = context.reason.toLowerCase();
            if (maskingKeywords.some(keyword => reasonLower.includes(keyword))) {
                return true;
            }
        }
        
        return false;
    }
    
    /**
     * Check if test actually checks functionality (not just method existence)
     */
    testChecksFunctionality(testCode) {
        if (!testCode) return false;
        const code = testCode.toLowerCase();
        // Check for actual functionality testing (results, behavior, outcomes)
        return code.includes('result') || 
               code.includes('verify') || 
               code.includes('assert') || 
               code.includes('expect') ||
               code.includes('should') ||
               code.includes('pass') ||
               code.includes('fail');
    }
    
    /**
     * Check if test has actual execution (not just method checks)
     */
    testHasExecution(testCode) {
        if (!testCode) return false;
        const code = testCode.toLowerCase();
        // Check for actual execution (await, function calls, operations)
        return code.includes('await') || 
               code.includes('()') || 
               code.includes('call') ||
               code.includes('execute') ||
               code.includes('run') ||
               code.includes('timeoperation') ||
               code.includes('processline');
    }
    
    /**
     * Verify that a fix actually works (not just that tests pass)
     */
    verifyFix(fix, originalProblem) {
        const verification = {
            verified: false,
            issues: [],
            warnings: []
        };
        
        // Check if fix addresses the original problem
        if (originalProblem && fix) {
            const problemDescription = (originalProblem.description || '').toLowerCase();
            const fixDescription = (fix.description || '').toLowerCase();
            
            // Check if fix mentions the problem
            const problemKeywords = this.extractKeywords(problemDescription);
            const fixKeywords = this.extractKeywords(fixDescription);
            
            const matchingKeywords = problemKeywords.filter(k => fixKeywords.includes(k));
            if (matchingKeywords.length === 0) {
                verification.issues.push('Fix does not mention the original problem');
            }
            
            // Check if fix is a workaround
            const workaroundKeywords = ['workaround', 'bypass', 'skip', 'avoid', 'ignore', 'simplify'];
            if (workaroundKeywords.some(k => fixDescription.includes(k))) {
                verification.issues.push('Fix appears to be a workaround, not a root cause fix');
            }
        }
        
        // Check if test was simplified
        if (fix.testChange) {
            if (this.isTestSimplification({ type: 'test_change', newTest: fix.testChange }, fix)) {
                verification.issues.push('Test was simplified instead of fixing the problem');
            }
        }
        
        verification.verified = verification.issues.length === 0;
        return verification;
    }
    
    /**
     * Extract keywords from text
     */
    extractKeywords(text) {
        if (!text) return [];
        // Simple keyword extraction (can be enhanced)
        const words = text.split(/\s+/).filter(w => w.length > 3);
        return words.map(w => w.toLowerCase());
    }
    
    /**
     * Track AI mistake (giving up, masking, etc.)
     */
    trackAIMistake(mistake) {
        const mistakeRecord = {
            id: this.generateViolationId(),
            type: mistake.type, // 'gave_up', 'masked_problem', 'superficial_fix', etc.
            timestamp: Date.now(),
            context: mistake.context,
            details: mistake.details,
            originalProblem: mistake.originalProblem,
            whatHappened: mistake.whatHappened,
            whatShouldHaveHappened: mistake.whatShouldHaveHappened
        };
        
        // Record as violation of "never give up" rule
        if (mistake.type === 'gave_up' || mistake.type === 'masked_problem') {
            this.recordViolation('BrokenPromise_never_give_up', mistake.context, {
                mistake: mistakeRecord,
                severity: 'critical'
            });
        }
        
        // Store in state for learning
        const mistakes = this.stateStore.getState('ai.mistakes') || [];
        mistakes.push(mistakeRecord);
        if (mistakes.length > 100) {
            mistakes.shift();
        }
        this.stateStore.updateState('ai.mistakes', mistakes);
        
        // Emit event for learning engine
        this.emit('aiMistake', mistakeRecord);
        
        // Advance learning from mistake
        if (this.learningEngine) {
            this.learningEngine.learnFromAIMistake(mistakeRecord);
        }
        
        gameLogger.warn('BrokenPromise', '[RULES_ENFORCER] AI mistake tracked', {
            type: mistake.type,
            context: mistake.context,
            action: 'Mistake recorded - system will learn from this'
        });
        
        return mistakeRecord;
    }
    
    /**
     * Apply confidence penalty for masking or low-quality fixes
     */
    applyConfidencePenalty(reason, severity = 'medium') {
        if (!this.learningEngine) return;
        
        const penalty = {
            reason,
            severity,
            timestamp: Date.now(),
            amount: severity === 'critical' ? 20 : severity === 'high' ? 10 : 5
        };
        
        // Flag masking in learning engine
        this.learningEngine.flagMasking('rules_enforcer', reason);
        
        // Store penalty
        const penalties = this.stateStore.getState('ai.confidencePenalties') || [];
        penalties.push(penalty);
        if (penalties.length > 50) {
            penalties.shift();
        }
        this.stateStore.updateState('ai.confidencePenalties', penalties);
        
        gameLogger.warn('BrokenPromise', '[RULES_ENFORCER] Confidence penalty applied', {
            reason,
            severity,
            action: 'Learning confidence reduced due to masking/low-quality fix'
        });
    }
}

module.exports = AIRulesEnforcer;
