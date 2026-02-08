/**
 * AI Rules Enforcer - Ensures AI Always Knows the Rules
 * 
 * Cerberus tracks all critical rules and ALWAYS reminds AI of them.
 * Cerberus learns from rule violations and tracks compliance.
 * 
 * Rules cannot be forgotten - they're baked into every communication.
 */

const EventEmitter = require('events');
const gameLogger = require('../../src/utils/GameLogger');

class AIRulesEnforcer extends EventEmitter {
    constructor(stateStore) {
        super();
        this.stateStore = stateStore;
        
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
        
        // Load violation history
        this.load();
        
        // Start periodic compliance check
        this.startComplianceMonitoring();
    }
    
    /**
     * Define all critical rules that AI must follow
     * Rules are from monitoring folder documentation - Cerberus-specific rules
     */
    defineRules() {
        return [
            {
                id: 'cerberus_all_logs_to_gameLogger',
                name: 'All Logs Go to gameLogger - Cerberus Sees Everything',
                description: 'ALL debug/error output goes to gameLogger, NOT console.log/error/warn. Cerberus sees everything through logs. User should never see console output (except CLI JSON responses for PowerShell). Cerberus monitors all logs to learn and detect issues.',
                priority: 'critical',
                category: 'logging',
                examples: [
                    'Use gameLogger.info/error/warn instead of console.log/error/warn',
                    'Only console.log for CLI JSON output (cerberus-integration.js)',
                    'All errors must be logged through gameLogger for Cerberus to detect and learn'
                ]
            },
            {
                id: 'cerberus_single_source_of_truth',
                name: 'Single Source of Truth - StateStore Only',
                description: 'StateStore is the ONLY source of truth. No dual state management (files + variables). All state updates go through StateStore. No sync issues possible. This is fundamental to Cerberus architecture.',
                priority: 'critical',
                category: 'architecture',
                examples: [
                    'Always use stateStore.updateState() and stateStore.getState()',
                    'Never maintain state in both files and variables',
                    'StateStore handles all persistence automatically'
                ]
            },
            {
                id: 'cerberus_proactive_detection',
                name: 'Proactive Detection - State Verification, Not Just Error Detection',
                description: 'Cerberus uses proactive state verification, not just reactive error detection. Continuously verify state is correct. Check invariants after every operation. Detect issues immediately, not when they log. This is how Cerberus catches issues before they become errors.',
                priority: 'critical',
                category: 'detection',
                examples: [
                    'Use StateVerificationContracts to define correct state',
                    'Verify state after every operation, not just when errors occur',
                    'Use multiple detection methods: state verification, patterns, anomalies, causal analysis'
                ]
            },
            {
                id: 'cerberus_event_driven',
                name: 'Event-Driven Communication - No File Polling',
                description: 'Cerberus uses event-driven communication, not file-based polling. Use events/messages instead of JSON files. Real-time updates. No polling needed. This is fundamental to Cerberus architecture.',
                priority: 'critical',
                category: 'architecture',
                examples: [
                    'Use EventEmitter.emit() for real-time updates',
                    'Subscribe to events instead of polling files',
                    'Event-driven architecture ensures no stale data'
                ]
            },
            {
                id: 'cerberus_ai_first_design',
                name: 'AI-First Design - Built FOR AI, BY AI',
                description: 'Cerberus is built FOR the AI, BY the AI. Human just prompts. AI sees everything, knows everything, acts on everything. All information is structured for AI consumption. AI makes all decisions automatically.',
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
                id: 'cerberus_learning_from_everything',
                name: 'Learn From Everything - Never Forget',
                description: 'Cerberus learns from EVERY error, EVERY fix attempt, EVERY pattern. Tracks what works/doesn\'t work. Gets smarter over time. Never makes the same mistake twice. Learning confidence is always visible and cannot be masked.',
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
                id: 'cerberus_no_masking',
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
                id: 'cerberus_auto_adjustment',
                name: 'Automatic Self-Improvement When Confidence Low',
                description: 'When learning confidence is low (<50%), Cerberus automatically adjusts. Suggests specific improvements (increase pattern collection, improve causal tracking, etc.). System self-improves when it detects low confidence.',
                priority: 'high',
                category: 'learning',
                examples: [
                    'Low confidence triggers automatic adjustment recommendations',
                    'System suggests what needs improvement',
                    'Auto-adjustments are tracked and visible'
                ]
            },
            {
                id: 'cerberus_multiple_detection_methods',
                name: 'Multiple Detection Methods - Not Just Pattern Matching',
                description: 'Cerberus uses multiple detection methods: state verification, pattern analysis, anomaly detection, causal analysis. Not just pattern matching. This ensures nothing escapes detection.',
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
                id: 'cerberus_integrity_checks',
                name: 'AI Verifies Its Own Integrity',
                description: 'Cerberus verifies its own integrity. Checks monitoring files, server files, Unity files, API endpoints, Socket.IO events. AI verifies that the system is working correctly.',
                priority: 'high',
                category: 'integrity',
                examples: [
                    'IntegrityChecker verifies all components are present and correct',
                    'Checks file structure, code structure, integration correctness',
                    'AI verifies its own integrity automatically'
                ]
            },
            {
                id: 'cerberus_state_verification_contracts',
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
                id: 'cerberus_dependency_graph',
                name: 'Dependency Graph - Map Component Relationships',
                description: 'DependencyGraph maps dependencies between system components. Enables Cerberus to trace cascading failures and understand the impact of issues. Knows what depends on what.',
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
                id: 'cerberus_causal_analysis',
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
                id: 'cerberus_auto_fix',
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
                id: 'cerberus_error_recovery',
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
                id: 'cerberus_performance_monitoring',
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
                id: 'cerberus_universal_error_handler',
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
                id: 'cerberus_rules_always_visible',
                name: 'Rules Always Visible - AI Must Never Forget',
                description: 'Rules are ALWAYS included in every communication with Cerberus. AI must never forget critical rules. Rules reminder is baked into every query response and status report. Cerberus tracks compliance and learns from violations.',
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
            reminder: 'These rules MUST be followed. Cerberus tracks compliance and learns from violations.'
        };
    }
    
    /**
     * Record a rule violation
     */
    recordViolation(ruleId, context, details) {
        const rule = this.rules.find(r => r.id === ruleId);
        if (!rule) {
            gameLogger.warn('CERBERUS', '[RULES_ENFORCER] Unknown rule violation', {
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
        gameLogger.warn('CERBERUS', '[RULES_ENFORCER] Rule violation detected', {
            rule: rule.name,
            ruleId,
            context,
            details,
            severity: rule.priority,
            complianceRate: Math.round(this.complianceStats.complianceRate)
        });
        
        // Save
        this.save();
        
        return violation;
    }
    
    /**
     * Record rule compliance (when rule is followed)
     */
    recordCompliance(ruleId) {
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
     * Get rule learning insights
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
        
        return {
            overallCompliance: Math.round(this.complianceStats.complianceRate),
            frequentlyViolatedRules: frequentlyViolated.frequentlyViolated,
            commonViolationPatterns: commonPatterns.map(([pattern, count]) => ({
                pattern,
                frequency: count
            })),
            recommendations: this.generateRecommendations(),
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
            v.ruleId === 'cerberus_sees_everything'
        );
        if (loggingViolations.length > 0) {
            recommendations.push({
                type: 'logging',
                message: 'Multiple logging rule violations detected. Ensure all errors go through gameLogger, not console.',
                priority: 'high',
                affectedRules: ['logging_all_to_gameLogger', 'cerberus_sees_everything']
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
            gameLogger.warn('CERBERUS', '[RULES_ENFORCER] Low compliance rate', {
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
            gameLogger.error('CERBERUS', '[RULES_ENFORCER] Save error', {
                error: error.message
            });
        }
    }
}

module.exports = AIRulesEnforcer;
