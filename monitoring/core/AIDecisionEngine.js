/**
 * AI Decision Engine - AI Acts on Everything
 * 
 * AI makes all decisions automatically based on complete information.
 * AI knows what to do, when to do it, what to try, what to avoid.
 * 
 * Human just prompts. AI does everything.
 */

const EventEmitter = require('events');

class AIDecisionEngine extends EventEmitter {
    constructor(stateStore, issueDetector, fixTracker) {
        super();
        this.stateStore = stateStore;
        this.issueDetector = issueDetector;
        this.fixTracker = fixTracker;
        
        // Decision history
        this.decisions = [];
        
        // Start decision making
        this.start();
    }
    
    /**
     * Start decision making
     */
    start() {
        // Make decisions every second
        setInterval(() => {
            this.makeDecisions();
        }, 1000);
        
        // Listen to events
        this.stateStore.on('stateChanged', (event) => {
            this.onStateChanged(event);
        });
        
        this.issueDetector.on('issueDetected', (issue) => {
            this.onIssueDetected(issue);
        });
    }
    
    /**
     * Make all decisions
     */
    makeDecisions() {
        const decisions = {
            investigation: this.shouldStartInvestigation(),
            pause: this.shouldPauseUnity(),
            resume: this.shouldResumeUnity(),
            fixes: this.whatFixesToTry(),
            avoid: this.whatToAvoid(),
            priority: this.whatsThePriority()
        };
        
        // Execute decisions
        this.executeDecisions(decisions);
        
        // Store decisions
        this.decisions.push({
            timestamp: Date.now(),
            decisions
        });
        
        // Keep only last 1000 decisions
        if (this.decisions.length > 1000) {
            this.decisions = this.decisions.slice(-1000);
        }
        
        // Emit decisions
        this.emit('decisionsMade', decisions);
    }
    
    /**
     * Should we start investigation?
     */
    shouldStartInvestigation() {
        const activeIssues = this.issueDetector.getActiveIssues();
        const investigation = this.stateStore.getState('monitoring.investigation');
        
        // Already investigating
        if (investigation.status === 'active' || investigation.status === 'starting') {
            return {
                should: false,
                reason: 'Investigation already in progress',
                confidence: 1.0
            };
        }
        
        // No active issues
        if (activeIssues.length === 0) {
            return {
                should: false,
                reason: 'No active issues',
                confidence: 1.0
            };
        }
        
        // Check cooldown (don't start immediately after completion)
        if (investigation.status === 'completed') {
            const completedTime = investigation.history[investigation.history.length - 1]?.completedAt;
            if (completedTime) {
                const timeSinceCompletion = Date.now() - completedTime;
                if (timeSinceCompletion < 5000) { // 5 second cooldown
                    return {
                        should: false,
                        reason: 'Cooldown period after last investigation',
                        confidence: 1.0
                    };
                }
            }
        }
        
        // Should start investigation
        const criticalIssues = activeIssues.filter(i => i.severity === 'critical');
        const highIssues = activeIssues.filter(i => i.severity === 'high');
        
        let priority = 'medium';
        let confidence = 0.7;
        
        if (criticalIssues.length > 0) {
            priority = 'critical';
            confidence = 0.95;
        } else if (highIssues.length > 0) {
            priority = 'high';
            confidence = 0.85;
        }
        
        return {
            should: true,
            reason: `${activeIssues.length} active issue(s) detected (${criticalIssues.length} critical, ${highIssues.length} high)`,
            confidence,
            priority,
            issues: activeIssues
        };
    }
    
    /**
     * Should we pause Unity?
     */
    shouldPauseUnity() {
        const investigation = this.stateStore.getState('monitoring.investigation');
        const unity = this.stateStore.getState('system.unity');
        const activeIssues = this.issueDetector.getActiveIssues();
        
        // Already paused
        if (unity.status === 'paused') {
            return {
                should: false,
                reason: 'Unity already paused',
                confidence: 1.0
            };
        }
        
        // Investigation just completed with issues
        if (investigation.status === 'completed' && activeIssues.length > 0) {
            return {
                should: true,
                reason: `Investigation complete, ${activeIssues.length} issue(s) found`,
                confidence: 0.95,
                priority: 'high'
            };
        }
        
        // Critical issue detected
        const criticalIssues = activeIssues.filter(i => i.severity === 'critical');
        if (criticalIssues.length > 0) {
            return {
                should: true,
                reason: `${criticalIssues.length} critical issue(s) detected`,
                confidence: 0.9,
                priority: 'critical'
            };
        }
        
        return {
            should: false,
            reason: 'No reason to pause',
            confidence: 1.0
        };
    }
    
    /**
     * Should we resume Unity?
     */
    shouldResumeUnity() {
        const verification = this.stateStore.getState('monitoring.verification');
        const unity = this.stateStore.getState('system.unity');
        const activeIssues = this.issueDetector.getActiveIssues();
        
        // Not paused
        if (unity.status !== 'paused') {
            return {
                should: false,
                reason: 'Unity not paused',
                confidence: 1.0
            };
        }
        
        // Verification passed (no issues reappeared)
        if (verification.status === 'completed' && activeIssues.length === 0) {
            return {
                should: true,
                reason: 'Verification passed, no issues detected',
                confidence: 0.95,
                priority: 'high'
            };
        }
        
        return {
            should: false,
            reason: 'Waiting for verification or issues still active',
            confidence: 0.8
        };
    }
    
    /**
     * What fixes should we try?
     */
    whatFixesToTry() {
        const activeIssues = this.issueDetector.getActiveIssues();
        const fixes = [];
        
        for (const issue of activeIssues) {
            const suggestions = this.fixTracker.getSuggestedFixes(issue);
            
            fixes.push({
                issue,
                suggestions: suggestions.shouldTry,
                avoid: suggestions.shouldNotTry,
                confidence: suggestions.confidence
            });
        }
        
        // Sort by priority
        fixes.sort((a, b) => {
            const aPriority = a.issue.priority || 0;
            const bPriority = b.issue.priority || 0;
            return bPriority - aPriority;
        });
        
        return fixes;
    }
    
    /**
     * What should we NOT try?
     */
    whatToAvoid() {
        const activeIssues = this.issueDetector.getActiveIssues();
        const avoid = new Map();
        
        for (const issue of activeIssues) {
            const suggestions = this.fixTracker.getSuggestedFixes(issue);
            
            for (const failed of suggestions.shouldNotTry) {
                if (!avoid.has(failed.method)) {
                    avoid.set(failed.method, {
                        method: failed.method,
                        reason: failed.reason,
                        issues: []
                    });
                }
                avoid.get(failed.method).issues.push(issue);
            }
        }
        
        return Array.from(avoid.values());
    }
    
    /**
     * What's the priority?
     */
    whatsThePriority() {
        const activeIssues = this.issueDetector.getActiveIssues();
        
        if (activeIssues.length === 0) {
            return {
                priority: 'low',
                action: 'monitor',
                reason: 'No active issues'
            };
        }
        
        const criticalIssues = activeIssues.filter(i => i.severity === 'critical');
        const highIssues = activeIssues.filter(i => i.severity === 'high');
        
        if (criticalIssues.length > 0) {
            return {
                priority: 'critical',
                action: 'investigate_and_fix',
                reason: `${criticalIssues.length} critical issue(s)`,
                issues: criticalIssues
            };
        }
        
        if (highIssues.length > 0) {
            return {
                priority: 'high',
                action: 'investigate',
                reason: `${highIssues.length} high severity issue(s)`,
                issues: highIssues
            };
        }
        
        return {
            priority: 'medium',
            action: 'monitor',
            reason: `${activeIssues.length} issue(s) detected`,
            issues: activeIssues
        };
    }
    
    /**
     * Execute decisions
     */
    executeDecisions(decisions) {
        // Start investigation if needed
        if (decisions.investigation.should) {
            this.startInvestigation(decisions.investigation);
        }
        
        // Pause Unity if needed
        if (decisions.pause.should) {
            this.pauseUnity(decisions.pause);
        }
        
        // Resume Unity if needed
        if (decisions.resume.should) {
            this.resumeUnity(decisions.resume);
        }
        
        // Emit fix suggestions
        if (decisions.fixes.length > 0) {
            this.emit('fixSuggestions', decisions.fixes);
        }
    }
    
    /**
     * Start investigation
     */
    startInvestigation(decision) {
        const investigation = this.stateStore.getState('monitoring.investigation');
        
        // Already starting or active
        if (investigation.status === 'starting' || investigation.status === 'active') {
            return;
        }
        
        // Update state
        this.stateStore.updateState('monitoring.investigation', {
            ...investigation,
            status: 'starting',
            startTime: Date.now(),
            issues: decision.issues || [],
            progress: 0
        });
        
        // Transition to active after brief delay
        setTimeout(() => {
            this.stateStore.updateState('monitoring.investigation.status', 'active');
        }, 100);
        
        this.emit('investigationStarted', decision);
    }
    
    /**
     * Pause Unity
     */
    pauseUnity(decision) {
        // This would call the Unity pause API
        // For now, just update state
        this.stateStore.updateState('system.unity.status', 'paused');
        this.stateStore.updateState('system.unity.metrics.pausedReason', decision.reason);
        this.stateStore.updateState('system.unity.metrics.pausedAt', Date.now());
        
        this.emit('unityPauseRequested', decision);
    }
    
    /**
     * Resume Unity
     */
    resumeUnity(decision) {
        // This would call the Unity resume API
        // For now, just update state
        this.stateStore.updateState('system.unity.status', 'running');
        this.stateStore.updateState('system.unity.metrics.pausedReason', null);
        this.stateStore.updateState('system.unity.metrics.pausedAt', null);
        
        this.emit('unityResumeRequested', decision);
    }
    
    /**
     * On state changed
     */
    onStateChanged(event) {
        // React to important state changes
        if (event.path.includes('investigation')) {
            this.checkInvestigationState(event);
        }
        
        if (event.path.includes('unity.status')) {
            this.checkUnityState(event);
        }
    }
    
    /**
     * On issue detected
     */
    onIssueDetected(issue) {
        // Check if we should start investigation
        const decision = this.shouldStartInvestigation();
        if (decision.should) {
            this.startInvestigation(decision);
        }
        
        // Check if we should pause
        const pauseDecision = this.shouldPauseUnity();
        if (pauseDecision.should && issue.severity === 'critical') {
            this.pauseUnity(pauseDecision);
        }
    }
    
    /**
     * Check investigation state
     */
    checkInvestigationState(event) {
        // Prevent infinite loops - don't update state in response to state changes
        if (this._checkingState) {
            return;
        }
        
        this._checkingState = true;
        
        try {
            const investigation = this.stateStore.getState('monitoring.investigation');
            
            // Check if investigation should complete
            if (investigation.status === 'active' && investigation.startTime) {
                const elapsed = (Date.now() - investigation.startTime) / 1000;
                const timeout = investigation.timeout || 15;
                
                if (elapsed >= timeout) {
                    // Investigation complete
                    this.completeInvestigation();
                } else {
                    // Only update if values actually changed to prevent loops
                    const currentProgress = investigation.progress || 0;
                    const currentTimeRemaining = investigation.timeRemaining || timeout;
                    const newProgress = (elapsed / timeout) * 100;
                    const newTimeRemaining = timeout - elapsed;
                    
                    // Only update if changed significantly (avoid micro-updates causing loops)
                    if (Math.abs(currentProgress - newProgress) > 1 || Math.abs(currentTimeRemaining - newTimeRemaining) > 0.5) {
                        // Use setTimeout to break the synchronous update chain
                        setTimeout(() => {
                            this.stateStore.updateState('monitoring.investigation.progress', newProgress);
                            this.stateStore.updateState('monitoring.investigation.timeRemaining', newTimeRemaining);
                        }, 0);
                    }
                }
            }
        } finally {
            this._checkingState = false;
        }
    }
    
    /**
     * Complete investigation
     */
    completeInvestigation() {
        const investigation = this.stateStore.getState('monitoring.investigation');
        const activeIssues = this.issueDetector.getActiveIssues();
        
        // Update state
        this.stateStore.updateState('monitoring.investigation', {
            ...investigation,
            status: 'completed',
            progress: 100,
            timeRemaining: 0,
            issues: activeIssues
        });
        
        // Add to history
        const history = investigation.history || [];
        history.push({
            startTime: investigation.startTime,
            completedAt: Date.now(),
            duration: (Date.now() - investigation.startTime) / 1000,
            issuesFound: activeIssues.length
        });
        this.stateStore.updateState('monitoring.investigation.history', history);
        
        // Check if we should pause
        const pauseDecision = this.shouldPauseUnity();
        if (pauseDecision.should) {
            this.pauseUnity(pauseDecision);
        }
        
        this.emit('investigationCompleted', {
            issues: activeIssues,
            duration: (Date.now() - investigation.startTime) / 1000
        });
    }
    
    /**
     * Check Unity state
     */
    checkUnityState(event) {
        // React to Unity state changes
        if (event.newValue === 'paused') {
            this.emit('unityPaused', event);
        } else if (event.newValue === 'running') {
            this.emit('unityResumed', event);
        }
    }
    
    /**
     * Get recent decisions
     */
    getRecentDecisions(limit = 10) {
        return this.decisions
            .slice(-limit)
            .reverse();
    }
    
    /**
     * Get decision stats
     */
    getStats() {
        const recent = this.decisions.slice(-100);
        
        const investigationStarted = recent.filter(d => d.decisions.investigation.should).length;
        const unityPaused = recent.filter(d => d.decisions.pause.should).length;
        const unityResumed = recent.filter(d => d.decisions.resume.should).length;
        const fixesSuggested = recent.filter(d => d.decisions.fixes.length > 0).length;
        
        return {
            totalDecisions: this.decisions.length,
            recentDecisions: recent.length,
            investigationStarted,
            unityPaused,
            unityResumed,
            fixesSuggested
        };
    }
}

module.exports = AIDecisionEngine;
