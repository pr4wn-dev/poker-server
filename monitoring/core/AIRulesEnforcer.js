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
     */
    defineRules() {
        return [
            {
                id: 'law_1_pull_repos',
                name: 'LAW 1: Pull All Repos First',
                description: 'Pull EVERY repo in the project before doing anything. This happens BEFORE you respond. BEFORE anything else. FIRST.',
                command: 'git pull',
                priority: 'critical',
                category: 'workflow',
                examples: ['Always run git pull on both poker-server AND poker-client-unity before starting work']
            },
            {
                id: 'law_2_check_past_problems',
                name: 'LAW 2: Check Past Problems First',
                description: 'Before solving ANY problem, search the project log/docs for matching issues. The solution probably already exists. Don\'t reinvent. CHECK FIRST.',
                priority: 'critical',
                category: 'problem_solving',
                examples: ['Search INSTALL_LOG.md for similar issues before implementing fixes']
            },
            {
                id: 'law_3_document_fixes',
                name: 'LAW 3: Document Fixes Immediately',
                description: 'When you fix ANY bug → document it BEFORE moving on. Not later. NOW. Add to INSTALL_LOG.md immediately.',
                priority: 'critical',
                category: 'documentation',
                examples: ['After fixing a bug, immediately add it to INSTALL_LOG.md with solution']
            },
            {
                id: 'law_4_commit_automatically',
                name: 'LAW 4: Commit Automatically',
                description: 'After code changes: git add -A; git commit -m "message"; git push. Don\'t wait to be asked.',
                command: 'git add -A; git commit -m "message"; git push',
                priority: 'critical',
                category: 'workflow',
                examples: ['Always commit and push after making code changes']
            },
            {
                id: 'law_5_no_bandaids',
                name: 'LAW 5: No Band-Aids',
                description: 'Fix root causes. Install real dependencies. No mock mode. No workarounds.',
                priority: 'high',
                category: 'problem_solving',
                examples: ['Don\'t disable features to fix errors - fix the root cause']
            },
            {
                id: 'law_6_one_log_file',
                name: 'LAW 6: One Log File',
                description: 'All notes go in one central log file. Not scattered across multiple files.',
                priority: 'high',
                category: 'documentation',
                examples: ['Use INSTALL_LOG.md as the single source of truth for all issues and fixes']
            },
            {
                id: 'law_7_when_stuck_reset',
                name: 'LAW 7: When Stuck, Reset',
                description: 'If patching errors for >15 minutes, STOP. Find last working commit: git log --oneline. Reset to it: git reset --hard <commit>. Don\'t waste hours on what takes 30 seconds.',
                priority: 'medium',
                category: 'problem_solving',
                examples: ['If stuck for >15 minutes, reset to last working commit instead of continuing to patch']
            },
            {
                id: 'law_8_grep_both_sides',
                name: 'LAW 8: Grep Both Sides to Find Mismatches',
                description: 'When client/server or multi-component systems don\'t connect: grep both sides. Pattern: When one side works but the other is stuck → MISMATCH. Grep both sides, compare exact strings.',
                priority: 'high',
                category: 'problem_solving',
                examples: ['When client/server mismatch, grep both sides to find exact string differences']
            },
            {
                id: 'law_9_simulation_logs_say_it_all',
                name: 'LAW 9: Simulation/Logs Say It All - Never Ask User to Describe',
                description: 'If you have to ask "what happened?" → YOU HAVE FAILED. Check server console logs, application logs (simulation.log, socketbot.log, game.log), Unity console output. Grep the codebase for the exact feature/flag involved. Trace the data flow from creation → storage → broadcast → client.',
                priority: 'critical',
                category: 'problem_solving',
                examples: ['Never ask user to describe errors - check logs, grep codebase, trace data flow']
            },
            {
                id: 'law_10_never_delete_features',
                name: 'LAW 10: Never Delete Features to "Fix" Problems',
                description: 'Disabling or removing existing functionality is NOT a fix. It\'s theft. NEVER disable a feature to make an error go away. NEVER comment out working code to avoid debugging it. If something is broken, FIX THE ROOT CAUSE.',
                priority: 'critical',
                category: 'problem_solving',
                examples: ['Never disable or remove features - always fix the root cause']
            },
            {
                id: 'logging_all_to_gameLogger',
                name: 'All Debug/Error Output Goes to gameLogger',
                description: 'ALL debug/error output goes to gameLogger, NOT console.log/error/warn. Cerberus sees everything through logs. User should never see console output (except CLI JSON responses).',
                priority: 'critical',
                category: 'logging',
                examples: ['Use gameLogger.info/error/warn instead of console.log/error/warn', 'Only console.log for CLI JSON output']
            },
            {
                id: 'cerberus_sees_everything',
                name: 'Cerberus Sees Everything Through Logs',
                description: 'Cerberus monitors all logs. All errors must go through gameLogger so Cerberus can learn from them. No silent errors.',
                priority: 'critical',
                category: 'logging',
                examples: ['All errors must be logged through gameLogger for Cerberus to detect and learn']
            },
            {
                id: 'read_install_log_first',
                name: 'Read INSTALL_LOG.md First',
                description: 'INSTALL_LOG.md in poker-server is the MASTER PROJECT LOG. MUST read this COMPLETELY at the start of EVERY session. Contains mandatory pre-flight checklist, 100+ documented issues with solutions, and session progress tracking.',
                priority: 'critical',
                category: 'workflow',
                examples: ['Always read INSTALL_LOG.md completely at session start']
            },
            {
                id: 'pull_both_repos',
                name: 'Pull Both Repos at Session Start',
                description: 'CRITICAL: PULL BOTH REPOS AT SESSION START - Always run git pull on BOTH poker-server AND poker-client-unity before doing ANY work. Failure to do this caused Issue #102 where 627 lines of work were lost.',
                priority: 'critical',
                category: 'workflow',
                examples: ['Always git pull on both poker-server and poker-client-unity before starting']
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
