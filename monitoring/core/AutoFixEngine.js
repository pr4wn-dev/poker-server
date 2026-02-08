/**
 * Auto-Fix Engine - Automatically try fixes from knowledge base
 * 
 * Cerberus automatically tries fixes when issues are detected.
 * Uses the knowledge base to know what fixes work/don't work.
 * 
 * Features:
 * - Automatically tries fixes from knowledge base
 * - Verifies fixes work
 * - Learns from results
 * - Won't try fixes that failed before
 */

const EventEmitter = require('events');
const gameLogger = require('../../src/utils/GameLogger');

class AutoFixEngine extends EventEmitter {
    constructor(stateStore, issueDetector, fixTracker, learningEngine) {
        super();
        this.stateStore = stateStore;
        this.issueDetector = issueDetector;
        this.fixTracker = fixTracker;
        this.learningEngine = learningEngine;
        
        // Auto-fix configuration
        this.enabled = true;
        this.maxAttemptsPerIssue = 3;
        this.cooldownPeriod = 60000; // 1 minute between fix attempts for same issue
        
        // Fix attempt tracking
        this.fixAttempts = new Map(); // issueId -> [attempts]
        this.lastAttemptTime = new Map(); // issueId -> timestamp
        
        // Fix strategies
        this.fixStrategies = new Map();
        this.initializeFixStrategies();
        
        // Listen to issue detection
        this.issueDetector.on('issueDetected', (issue) => {
            if (this.enabled) {
                this.handleIssue(issue);
            }
        });
    }
    
    /**
     * Initialize fix strategies
     */
    initializeFixStrategies() {
        // Strategy: Retry operation
        this.fixStrategies.set('retry', {
            name: 'Retry Operation',
            execute: async (issue) => {
                // Try to retry the operation that caused the issue
                const details = issue.details || {};
                if (details.operation) {
                    // This would need to be implemented based on specific operations
                    return { success: false, reason: 'Retry not implemented for this operation' };
                }
                return { success: false, reason: 'No operation to retry' };
            }
        });
        
        // Strategy: Reset state
        this.fixStrategies.set('reset_state', {
            name: 'Reset State',
            execute: async (issue) => {
                // Reset problematic state to known good state
                const details = issue.details || {};
                if (details.path) {
                    // Get last known good value
                    const history = this.stateStore.getStateHistory(details.path, 300000); // Last 5 minutes
                    if (history.length > 1) {
                        const goodValue = history[history.length - 2].value;
                        this.stateStore.updateState(details.path, goodValue);
                        return { success: true, reason: 'State reset to last known good value' };
                    }
                }
                return { success: false, reason: 'No good state to reset to' };
            }
        });
        
        // Strategy: Restart component
        this.fixStrategies.set('restart_component', {
            name: 'Restart Component',
            execute: async (issue) => {
                // Restart the problematic component
                const details = issue.details || {};
                const component = details.component;
                
                if (component === 'server') {
                    // Would need server restart capability
                    return { success: false, reason: 'Server restart not implemented' };
                } else if (component === 'database') {
                    // Would need database restart capability
                    return { success: false, reason: 'Database restart not implemented' };
                }
                
                return { success: false, reason: 'Component restart not implemented' };
            }
        });
        
        // Strategy: Clear cache
        this.fixStrategies.set('clear_cache', {
            name: 'Clear Cache',
            execute: async (issue) => {
                // Clear relevant caches
                // This would need to be implemented based on what caches exist
                return { success: false, reason: 'Cache clearing not implemented' };
            }
        });
        
        // Strategy: Rollback change
        this.fixStrategies.set('rollback', {
            name: 'Rollback Change',
            execute: async (issue) => {
                // Rollback the state change that caused the issue
                const rootCause = issue.rootCause;
                if (rootCause && rootCause.path) {
                    const history = this.stateStore.getStateHistory(rootCause.path, 300000);
                    if (history.length > 1) {
                        const previousValue = history[history.length - 2].value;
                        this.stateStore.updateState(rootCause.path, previousValue);
                        return { success: true, reason: 'Rolled back to previous state' };
                    }
                }
                return { success: false, reason: 'No previous state to rollback to' };
            }
        });
    }
    
    /**
     * Handle detected issue
     */
    async handleIssue(issue) {
        // Check if we should attempt fix
        if (!this.shouldAttemptFix(issue)) {
            return;
        }
        
        // Get suggested fixes
        const suggestedFixes = this.getSuggestedFixes(issue);
        
        if (suggestedFixes.length === 0) {
            return; // No fixes to try
        }
        
        // Try fixes in order of confidence
        for (const fix of suggestedFixes) {
            if (this.hasAttemptedFix(issue.id, fix.method)) {
                continue; // Already tried this fix
            }
            
            // Check cooldown
            if (this.isInCooldown(issue.id)) {
                continue; // Still in cooldown
            }
            
            // Try the fix
            const result = await this.tryFix(issue, fix);
            
            // Record attempt
            this.recordAttempt(issue, fix, result);
            
            // If fix succeeded, stop trying
            if (result.success) {
                this.emit('fixSucceeded', { issue, fix, result });
                return;
            }
        }
    }
    
    /**
     * Check if we should attempt fix
     */
    shouldAttemptFix(issue) {
        // Don't auto-fix critical issues (might need human intervention)
        if (issue.severity === 'critical') {
            return false;
        }
        
        // Check if we've exceeded max attempts
        const attempts = this.fixAttempts.get(issue.id) || [];
        if (attempts.length >= this.maxAttemptsPerIssue) {
            return false;
        }
        
        return true;
    }
    
    /**
     * Get suggested fixes for issue
     */
    getSuggestedFixes(issue) {
        const fixes = [];
        
        // Get fixes from learning engine
        if (this.learningEngine) {
            const bestSolution = this.learningEngine.getBestSolution(issue.type);
            if (bestSolution) {
                fixes.push({
                    method: bestSolution.method,
                    confidence: bestSolution.confidence,
                    source: 'learning_engine'
                });
            }
        }
        
        // Get fixes from fix tracker
        if (this.fixTracker) {
            const trackerFixes = this.fixTracker.getSuggestedFixes(issue);
            // trackerFixes is an object with shouldTry array, not an array itself
            if (trackerFixes && Array.isArray(trackerFixes.shouldTry)) {
                for (const fix of trackerFixes.shouldTry) {
                    fixes.push({
                        method: fix.method,
                        confidence: fix.confidence || fix.successRate || 0.5,
                        source: 'fix_tracker'
                    });
                }
            }
        }
        
        // Add generic fixes based on issue type
        const genericFixes = this.getGenericFixes(issue);
        fixes.push(...genericFixes);
        
        // Sort by confidence (highest first)
        fixes.sort((a, b) => b.confidence - a.confidence);
        
        return fixes;
    }
    
    /**
     * Get generic fixes based on issue type
     */
    getGenericFixes(issue) {
        const fixes = [];
        const issueType = issue.type || '';
        
        // Chip-related issues
        if (issueType.includes('CHIP')) {
            fixes.push({
                method: 'reset_state',
                confidence: 0.3,
                source: 'generic'
            });
            fixes.push({
                method: 'rollback',
                confidence: 0.4,
                source: 'generic'
            });
        }
        
        // State-related issues
        if (issueType.includes('STATE') || issueType.includes('CONSISTENCY')) {
            fixes.push({
                method: 'reset_state',
                confidence: 0.5,
                source: 'generic'
            });
        }
        
        // Component failure issues
        if (issueType.includes('FAILURE') || issueType.includes('COMPONENT')) {
            fixes.push({
                method: 'restart_component',
                confidence: 0.6,
                source: 'generic'
            });
        }
        
        // Connection issues
        if (issueType.includes('CONNECTION') || issueType.includes('TIMEOUT')) {
            fixes.push({
                method: 'retry',
                confidence: 0.5,
                source: 'generic'
            });
        }
        
        return fixes;
    }
    
    /**
     * Check if fix has been attempted
     */
    hasAttemptedFix(issueId, fixMethod) {
        const attempts = this.fixAttempts.get(issueId) || [];
        return attempts.some(attempt => attempt.method === fixMethod);
    }
    
    /**
     * Check if issue is in cooldown
     */
    isInCooldown(issueId) {
        const lastAttempt = this.lastAttemptTime.get(issueId);
        if (!lastAttempt) {
            return false;
        }
        
        return Date.now() - lastAttempt < this.cooldownPeriod;
    }
    
    /**
     * Try a fix
     */
    async tryFix(issue, fix) {
        const strategy = this.fixStrategies.get(fix.method);
        if (!strategy) {
            return {
                success: false,
                reason: `Fix strategy '${fix.method}' not found`
            };
        }
        
        try {
            gameLogger.info('CERBERUS', '[AUTO_FIX] ATTEMPTING_FIX', {
                issueId: issue.id,
                issueType: issue.type,
                fixMethod: fix.method,
                confidence: fix.confidence
            });
            
            const result = await strategy.execute(issue);
            
            // Verify fix worked
            if (result.success) {
                // Wait a bit and check if issue is resolved
                await this.wait(2000);
                const isResolved = await this.verifyFix(issue);
                
                if (isResolved) {
                    return {
                        success: true,
                        reason: result.reason || 'Fix verified successful',
                        method: fix.method
                    };
                } else {
                    return {
                        success: false,
                        reason: 'Fix appeared to work but issue not resolved',
                        method: fix.method
                    };
                }
            }
            
            return {
                success: false,
                reason: result.reason || 'Fix failed',
                method: fix.method
            };
            
        } catch (error) {
            gameLogger.error('CERBERUS', '[AUTO_FIX] FIX_ERROR', {
                issueId: issue.id,
                fixMethod: fix.method,
                error: error.message,
                stack: error.stack
            });
            
            return {
                success: false,
                reason: `Fix error: ${error.message}`,
                method: fix.method
            };
        }
    }
    
    /**
     * Verify fix worked
     */
    async verifyFix(issue) {
        // Check if issue is still active
        const activeIssues = this.issueDetector.getActiveIssues();
        const issueStillActive = activeIssues.some(activeIssue => activeIssue.id === issue.id);
        
        return !issueStillActive;
    }
    
    /**
     * Record fix attempt
     */
    recordAttempt(issue, fix, result) {
        // Track attempt
        if (!this.fixAttempts.has(issue.id)) {
            this.fixAttempts.set(issue.id, []);
        }
        this.fixAttempts.get(issue.id).push({
            method: fix.method,
            result: result.success ? 'success' : 'failure',
            timestamp: Date.now(),
            reason: result.reason
        });
        
        this.lastAttemptTime.set(issue.id, Date.now());
        
        // Record in fix tracker
        if (this.fixTracker) {
            this.fixTracker.recordAttempt({
                issueId: issue.id,
                issueType: issue.type,
                fixMethod: fix.method,
                result: result.success ? 'success' : 'failure',
                timestamp: Date.now(),
                details: {
                    reason: result.reason,
                    confidence: fix.confidence
                }
            });
        }
        
        // Emit event
        this.emit('fixAttempted', {
            issue,
            fix,
            result
        });
    }
    
    /**
     * Wait utility
     */
    wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    /**
     * Enable auto-fix
     */
    enable() {
        this.enabled = true;
    }
    
    /**
     * Disable auto-fix
     */
    disable() {
        this.enabled = false;
    }
    
    /**
     * Get statistics
     */
    getStatistics() {
        const stats = {
            enabled: this.enabled,
            totalAttempts: 0,
            successful: 0,
            failed: 0,
            byMethod: {},
            byIssueType: {}
        };
        
        for (const [issueId, attempts] of this.fixAttempts.entries()) {
            stats.totalAttempts += attempts.length;
            
            for (const attempt of attempts) {
                if (attempt.result === 'success') {
                    stats.successful++;
                } else {
                    stats.failed++;
                }
                
                if (!stats.byMethod[attempt.method]) {
                    stats.byMethod[attempt.method] = { total: 0, successful: 0, failed: 0 };
                }
                stats.byMethod[attempt.method].total++;
                if (attempt.result === 'success') {
                    stats.byMethod[attempt.method].successful++;
                } else {
                    stats.byMethod[attempt.method].failed++;
                }
            }
        }
        
        return stats;
    }
}

module.exports = AutoFixEngine;
