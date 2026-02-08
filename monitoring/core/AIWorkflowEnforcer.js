/**
 * AI Workflow Enforcer - Integrates Rules into Problem-Solving Workflow
 * 
 * This component ensures that rules are checked BEFORE actions are taken,
 * not just tracked after the fact. It prevents violations proactively.
 * 
 * Features:
 * - Proactive rule checking before code changes
 * - Fix verification before marking as complete
 * - Test change analysis to detect masking
 * - AI mistake tracking and learning
 * - Confidence penalties for low-quality fixes
 */

const EventEmitter = require('events');
const gameLogger = require('../../src/utils/GameLogger');

class AIWorkflowEnforcer extends EventEmitter {
    constructor(stateStore, rulesEnforcer, learningEngine, powerShellSyntaxValidator = null) {
        super();
        this.stateStore = stateStore;
        this.rulesEnforcer = rulesEnforcer;
        this.learningEngine = learningEngine;
        this.powerShellSyntaxValidator = powerShellSyntaxValidator;
        
        // Track workflow actions
        this.actionHistory = [];
        this.maxHistorySize = 1000;
        
        // Load history
        this.load();
    }
    
    /**
     * Check action before execution - PROACTIVE ENFORCEMENT
     * This is called BEFORE any code change or fix
     */
    async checkBeforeAction(action, context) {
        // Check PowerShell syntax if editing PowerShell files
        if (action.type === 'code_change' || action.type === 'fix_attempt') {
            if (action.filePath && action.filePath.endsWith('.ps1') && this.powerShellSyntaxValidator) {
                try {
                    const syntaxResult = await this.powerShellSyntaxValidator.validateScript(
                        action.filePath,
                        action.newContent || null
                    );
                    
                    if (!syntaxResult.valid) {
                        // Block action if syntax errors found
                        const violation = {
                            action,
                            context,
                            violations: [{
                                ruleId: 'syntax_validation',
                                ruleName: 'PowerShell Syntax Validation',
                                severity: 'error',
                                reason: `PowerShell syntax errors detected: ${syntaxResult.errors.length} error(s), ${syntaxResult.structuralIssues.length} structural issue(s)`,
                                details: {
                                    errors: syntaxResult.errors.slice(0, 3),
                                    structuralIssues: syntaxResult.structuralIssues.slice(0, 3),
                                    quoteIssues: syntaxResult.quoteIssues.slice(0, 3)
                                }
                            }],
                            timestamp: Date.now()
                        };
                        
                        // Track as AI mistake
                        this.rulesEnforcer.trackAIMistake({
                            type: 'syntax_error',
                            context: context,
                            details: `Attempted to apply changes with PowerShell syntax errors`,
                            originalProblem: context.originalProblem || 'PowerShell syntax validation',
                            whatHappened: `Changes contain syntax errors: ${syntaxResult.errors.map(e => e.message).join('; ')}`,
                            whatShouldHaveHappened: 'Fix syntax errors before applying changes'
                        });
                        
                        // Emit event
                        this.emit('actionBlocked', violation);
                        
                        gameLogger.warn('CERBERUS', '[WORKFLOW_ENFORCER] Action blocked - syntax errors', {
                            action: action.type,
                            filePath: action.filePath,
                            errorCount: syntaxResult.errors.length,
                            structuralCount: syntaxResult.structuralIssues.length
                        });
                        
                        return {
                            allowed: false,
                            blocked: true,
                            violations: violation.violations,
                            warnings: [],
                            message: `Action blocked: PowerShell syntax errors detected. Fix errors before applying changes.`
                        };
                    }
                } catch (error) {
                    gameLogger.warn('CERBERUS', '[WORKFLOW_ENFORCER] Syntax check error', {
                        filePath: action.filePath,
                        error: error.message
                    });
                    // Don't block on validation error, but log it
                }
            }
        }
        
        // Get rule check results
        const ruleCheck = this.rulesEnforcer.checkActionBeforeExecution(action, context);
        
        // If violations found, block action
        if (!ruleCheck.allowed) {
            const violation = {
                action,
                context,
                violations: ruleCheck.violations,
                timestamp: Date.now()
            };
            
            // Track as AI mistake
            this.rulesEnforcer.trackAIMistake({
                type: 'blocked_violation',
                context: context,
                details: `Action blocked due to rule violations: ${ruleCheck.violations.map(v => v.ruleName).join(', ')}`,
                originalProblem: context.originalProblem,
                whatHappened: `Attempted to ${action.type} which would violate rules`,
                whatShouldHaveHappened: 'Fix root cause instead of violating rules'
            });
            
            // Emit event
            this.emit('actionBlocked', violation);
            
            gameLogger.warn('CERBERUS', '[WORKFLOW_ENFORCER] Action blocked', {
                action: action.type,
                violations: ruleCheck.violations.map(v => v.ruleName),
                reason: 'Rule violations detected - action blocked'
            });
            
            return {
                allowed: false,
                blocked: true,
                violations: ruleCheck.violations,
                warnings: ruleCheck.warnings,
                message: `Action blocked: ${ruleCheck.violations.map(v => v.reason).join('; ')}`
            };
        }
        
        // If warnings found, require verification
        if (ruleCheck.warnings.length > 0 || ruleCheck.mustVerify) {
            return {
                allowed: true,
                blocked: false,
                warnings: ruleCheck.warnings,
                mustVerify: true,
                message: `Action allowed but verification required: ${ruleCheck.warnings.map(w => w.reason).join('; ')}`
            };
        }
        
        return {
            allowed: true,
            blocked: false,
            warnings: [],
            mustVerify: false
        };
    }
    
    /**
     * Verify fix before marking as complete
     */
    verifyFixBeforeComplete(fix, originalProblem) {
        // Get fix verification from rules enforcer
        const verification = this.rulesEnforcer.verifyFix(fix, originalProblem);
        
        // Get fix quality from learning engine
        const quality = this.learningEngine.verifyFixQuality(fix, originalProblem);
        
        // Combine results
        const combined = {
            verified: verification.verified && quality.score >= 70,
            issues: [...verification.issues, ...quality.issues],
            warnings: [...verification.warnings, ...quality.warnings],
            qualityScore: quality.score,
            canMarkComplete: verification.verified && quality.score >= 70
        };
        
        // If fix quality is low, apply penalty
        if (quality.score < 50) {
            this.rulesEnforcer.applyConfidencePenalty(
                `Low fix quality: ${quality.issues.join('; ')}`,
                'high'
            );
        }
        
        // If not verified, track as mistake
        if (!combined.verified) {
            this.rulesEnforcer.trackAIMistake({
                type: 'superficial_fix',
                context: { fix, originalProblem },
                details: `Fix marked as complete but not verified: ${combined.issues.join('; ')}`,
                originalProblem: originalProblem,
                whatHappened: 'Fix marked as complete without proper verification',
                whatShouldHaveHappened: 'Verify fix actually works before marking complete'
            });
        }
        
        return combined;
    }
    
    /**
     * Analyze test change to detect masking
     */
    analyzeTestChange(oldTest, newTest, context) {
        // Check with rules enforcer
        const isSimplification = this.rulesEnforcer.isTestSimplification(
            { type: 'test_change', oldTest, newTest },
            context
        );
        
        // Check with learning engine
        const masking = this.learningEngine.detectTestMasking(oldTest, newTest, context);
        
        // If masking detected, block and track mistake
        if (isSimplification || masking.isMasking) {
            this.rulesEnforcer.trackAIMistake({
                type: 'masked_problem',
                context: context,
                details: `Test simplified instead of fixing problem: ${masking.indicators.join('; ')}`,
                originalProblem: context.originalProblem,
                whatHappened: 'Test was simplified to make it pass instead of fixing the root cause',
                whatShouldHaveHappened: 'Fix the root cause that made the test hang/fail, not simplify the test'
            });
            
            // Apply confidence penalty
            this.rulesEnforcer.applyConfidencePenalty(
                'Test masking detected - test simplified instead of fixing problem',
                'critical'
            );
            
            return {
                isMasking: true,
                blocked: true,
                indicators: masking.indicators,
                severity: 'critical',
                message: 'Test change blocked: Test was simplified instead of fixing the root cause'
            };
        }
        
        return {
            isMasking: false,
            blocked: false,
            indicators: []
        };
    }
    
    /**
     * Record action for learning
     */
    recordAction(action, context, result) {
        const actionRecord = {
            id: `action_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            action,
            context,
            result,
            timestamp: Date.now()
        };
        
        this.actionHistory.push(actionRecord);
        if (this.actionHistory.length > this.maxHistorySize) {
            this.actionHistory.shift();
        }
        
        // Save
        this.save();
        
        return actionRecord;
    }
    
    /**
     * Get action history
     */
    getActionHistory(limit = 50) {
        return this.actionHistory.slice(-limit);
    }
    
    /**
     * Get AI mistake patterns
     */
    getAIMistakePatterns() {
        const mistakes = this.stateStore.getState('ai.mistakes') || [];
        const patterns = {};
        
        for (const mistake of mistakes) {
            const type = mistake.type;
            if (!patterns[type]) {
                patterns[type] = {
                    type,
                    count: 0,
                    examples: []
                };
            }
            patterns[type].count++;
            if (patterns[type].examples.length < 5) {
                patterns[type].examples.push(mistake);
            }
        }
        
        return patterns;
    }
    
    /**
     * Load history
     */
    load() {
        try {
            const saved = this.stateStore.getState('workflow.actionHistory') || [];
            this.actionHistory = saved.slice(-this.maxHistorySize);
        } catch (error) {
            // Ignore load errors
        }
    }
    
    /**
     * Save history
     */
    save() {
        try {
            this.stateStore.updateState('workflow.actionHistory', this.actionHistory);
        } catch (error) {
            gameLogger.error('CERBERUS', '[WORKFLOW_ENFORCER] Save error', {
                error: error.message
            });
        }
    }
}

module.exports = AIWorkflowEnforcer;
