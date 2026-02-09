/**
 * AI Workflow Violation Detector - Detects when AI violates workflow
 * 
 * This component detects:
 * - AI didn't call beforeAIAction() before coding
 * - AI didn't search when webSearchRequired: true
 * - AI didn't store findings
 * - AI didn't call afterAIAction() after actions
 */

const EventEmitter = require('events');
const gameLogger = require('../../src/utils/GameLogger');

class AIWorkflowViolationDetector extends EventEmitter {
    constructor(stateStore, collaborationInterface, complianceVerifier) {
        super();
        this.stateStore = stateStore;
        this.collaborationInterface = collaborationInterface;
        this.complianceVerifier = complianceVerifier;
        
        // Track recent actions
        this.recentCodeChanges = [];
        this.lastBeforeActionCall = null;
        this.lastAfterActionCall = null;
        
        // Start monitoring
        this.startMonitoring();
    }
    
    /**
     * Start monitoring for violations
     */
    startMonitoring() {
        // Check periodically for violations
        this.monitoringInterval = setInterval(() => {
            this.checkForViolations();
        }, 10000); // Check every 10 seconds
    }
    
    /**
     * Stop monitoring
     */
    stopMonitoring() {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }
    }
    
    /**
     * Check for workflow violations
     */
    checkForViolations() {
        // Check if code was changed without beforeAIAction
        this.checkBeforeActionViolations();
        
        // Check if web search was required but not done
        this.checkWebSearchViolations();
        
        // Check if afterAIAction wasn't called after actions
        this.checkAfterActionViolations();
    }
    
    /**
     * Check for beforeAIAction violations
     */
    checkBeforeActionViolations() {
        const lastBeforeAction = this.stateStore.getState('ai.lastBeforeActionCall');
        const recentCodeChanges = this.getRecentCodeChanges();
        
        // If code was changed recently but beforeAIAction wasn't called
        if (recentCodeChanges.length > 0) {
            const latestChange = recentCodeChanges[0];
            const timeSinceChange = Date.now() - latestChange.timestamp;
            
            // If change was within last 5 minutes
            if (timeSinceChange < 300000) {
                // Check if beforeAIAction was called before this change
                if (!lastBeforeAction || lastBeforeAction < latestChange.timestamp) {
                    this.detectViolation({
                        type: 'workflow_violation',
                        violation: 'Code changes made without calling beforeAIAction() first',
                        file: latestChange.file,
                        timestamp: latestChange.timestamp,
                        severity: 'high'
                    });
                }
            }
        }
    }
    
    /**
     * Check for web search violations
     */
    checkWebSearchViolations() {
        const webSearchRequired = this.stateStore.getState('ai.learning.webSearchRequired');
        
        if (webSearchRequired && !webSearchRequired.resolved) {
            const timeSinceRequired = Date.now() - (webSearchRequired.timestamp || Date.now());
            
            // If required for more than 5 minutes and no search happened
            if (timeSinceRequired > 300000) {
                const recentSearches = this.complianceVerifier?.getRecentToolCalls('web_search') || [];
                
                if (recentSearches.length === 0) {
                    this.detectViolation({
                        type: 'workflow_violation',
                        violation: 'Web search required but not performed',
                        webSearchRequired: webSearchRequired,
                        timestamp: Date.now(),
                        severity: 'critical'
                    });
                }
            }
        }
    }
    
    /**
     * Check for afterAIAction violations
     */
    checkAfterActionViolations() {
        const lastAfterAction = this.stateStore.getState('ai.lastAfterActionCall');
        const recentCodeChanges = this.getRecentCodeChanges();
        
        // If code was changed but afterAIAction wasn't called
        if (recentCodeChanges.length > 0) {
            const latestChange = recentCodeChanges[0];
            const timeSinceChange = Date.now() - latestChange.timestamp;
            
            // If change was within last 5 minutes
            if (timeSinceChange < 300000) {
                // Check if afterAIAction was called after this change
                if (!lastAfterAction || lastAfterAction < latestChange.timestamp) {
                    this.detectViolation({
                        type: 'workflow_violation',
                        violation: 'Code changes made without calling afterAIAction() after',
                        file: latestChange.file,
                        timestamp: latestChange.timestamp,
                        severity: 'medium'
                    });
                }
            }
        }
    }
    
    /**
     * Detect a violation
     */
    detectViolation(violation) {
        // Store violation
        const violations = this.stateStore.getState('ai.workflowViolations') || [];
        violations.push({
            ...violation,
            id: `violation_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        });
        
        // Keep only last 100 violations
        if (violations.length > 100) {
            violations.shift();
        }
        
        this.stateStore.updateState('ai.workflowViolations', violations);
        
        // Emit event
        this.emit('violationDetected', violation);
        
        gameLogger.warn('BrokenPromise', '[WORKFLOW_VIOLATION] Violation detected', violation);
    }
    
    /**
     * Get recent code changes (check file modification times)
     */
    getRecentCodeChanges() {
        // This would ideally track actual file changes
        // For now, we'll use a simple approach based on state
        const recentChanges = this.stateStore.getState('ai.recentCodeChanges') || [];
        return recentChanges.filter(change => 
            (Date.now() - change.timestamp) < 300000 // Within 5 minutes
        );
    }
    
    /**
     * Record that code was changed (called when file is modified)
     */
    recordCodeChange(file, changeType = 'modified') {
        const change = {
            file: file,
            type: changeType,
            timestamp: Date.now()
        };
        
        this.recentCodeChanges.push(change);
        
        // Keep only recent changes
        if (this.recentCodeChanges.length > 100) {
            this.recentCodeChanges.shift();
        }
        
        // Store in state
        const recentChanges = this.stateStore.getState('ai.recentCodeChanges') || [];
        recentChanges.push(change);
        
        if (recentChanges.length > 100) {
            recentChanges.shift();
        }
        
        this.stateStore.updateState('ai.recentCodeChanges', recentChanges);
    }
    
    /**
     * Record that beforeAIAction was called
     */
    recordBeforeActionCall() {
        this.lastBeforeActionCall = Date.now();
        this.stateStore.updateState('ai.lastBeforeActionCall', this.lastBeforeActionCall);
    }
    
    /**
     * Record that afterAIAction was called
     */
    recordAfterActionCall() {
        this.lastAfterActionCall = Date.now();
        this.stateStore.updateState('ai.lastAfterActionCall', this.lastAfterActionCall);
    }
}

module.exports = AIWorkflowViolationDetector;
