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
        
        // Decision history - NO LONGER STORED IN MEMORY
        // Stored in database (ai_decisions table)
        this.decisions = []; // Kept for compatibility, but not populated
        
        // Database-backed components helper
        this.dbComponents = null;
        if (this.stateStore && this.stateStore.getDatabaseManager) {
            try {
                const DatabaseBackedComponents = require('./DatabaseBackedComponents');
                const projectRoot = this.stateStore.projectRoot || require('path').resolve(__dirname, '../..');
                this.dbComponents = new DatabaseBackedComponents(projectRoot);
            } catch (error) {
                // Fallback to in-memory if database not available
            }
        }
        
        // Don't start immediately - let AIMonitorCore call start() after all components are ready
        // this.start();
    }
    
    /**
     * Start decision making
     */
    start() {
        // Make decisions every second
        this.decisionInterval = setInterval(() => {
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
     * Stop decision making
     */
    stop() {
        if (this.decisionInterval) {
            clearInterval(this.decisionInterval);
            this.decisionInterval = null;
        }
    }
    
    /**
     * Destroy - alias for stop
     */
    destroy() {
        this.stop();
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
        
        // Store decisions in database instead of in-memory array
        if (this.dbComponents) {
            this.dbComponents.saveDecision({
                type: 'full_decision_set',
                ...decisions,
                timestamp: Date.now()
            }).catch(() => {
                // Fallback to in-memory
                this.decisions.push({
                    timestamp: Date.now(),
                    decisions
                });
                if (this.decisions.length > 1000) {
                    this.decisions = this.decisions.slice(-1000);
                }
            });
        } else {
            // Fallback: Store in memory
            this.decisions.push({
                timestamp: Date.now(),
                decisions
            });
            
            // Keep only last 1000 decisions
            if (this.decisions.length > 1000) {
                this.decisions = this.decisions.slice(-1000);
            }
        }
        
        // Emit decisions
        this.emit('decisionsMade', decisions);
    }
    
    /**
     * Should we start investigation?
     */
    shouldStartInvestigation() {
        // Guard: Ensure issueDetector is ready
        if (!this.issueDetector || typeof this.issueDetector.getActiveIssues !== 'function') {
            return { should: false, reason: 'Issue detector not ready' };
        }
        
        try {
            const activeIssues = this.issueDetector.getActiveIssues();
            const investigation = this.stateStore.getState('monitoring.investigation') || {};
            
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
        } catch (error) {
            // Silently handle errors - issueDetector might not be ready yet
            return { should: false, reason: 'Issue detector error' };
        }
    }
    
    /**
     * Should we pause Unity?
     */
    shouldPauseUnity() {
        if (!this.stateStore || typeof this.stateStore.getState !== 'function') return false;
        if (!this.issueDetector || typeof this.issueDetector.getActiveIssues !== 'function') return false;
        
        const investigation = this.stateStore.getState('monitoring.investigation');
        const unity = this.stateStore.getState('system.unity');
        const activeIssues = this.issueDetector.getActiveIssues();
        
        // Null check: Provide default for unity state
        if (!unity || typeof unity !== 'object') {
            return {
                should: false,
                reason: 'Unity state not available',
                confidence: 0.5
            };
        }
        
        // Already paused
        if (unity.status === 'paused') {
            return {
                should: false,
                reason: 'Unity already paused',
                confidence: 1.0
            };
        }
        
        // Null check: Provide default for investigation state
        if (!investigation || typeof investigation !== 'object') {
            // No investigation state, check other conditions
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
                reason: 'No investigation state, no critical issues',
                confidence: 0.5
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
        // LEARNING SYSTEM FIX: Add null checks before accessing state properties
        // Pattern from shouldPauseUnity() - prevents "Cannot read properties of null" errors
        if (!this.stateStore || typeof this.stateStore.getState !== 'function') {
            return {
                should: false,
                reason: 'StateStore not available',
                confidence: 0
            };
        }
        
        const verification = this.stateStore.getState('monitoring.verification') || {};
        const unity = this.stateStore.getState('system.unity') || {};
        const activeIssues = this.issueDetector ? this.issueDetector.getActiveIssues() : [];
        
        // Null check: Provide default for unity state
        if (!unity || typeof unity !== 'object' || !unity.status) {
            return {
                should: false,
                reason: 'Unity state not available',
                confidence: 0.5
            };
        }
        
        // Not paused
        if (unity.status !== 'paused') {
            return {
                should: false,
                reason: 'Unity not paused',
                confidence: 1.0
            };
        }
        
        // Null check: Provide default for verification state
        if (!verification || typeof verification !== 'object') {
            // No verification state - can't resume yet
            return {
                should: false,
                reason: 'Verification state not available',
                confidence: 0.5
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
     * Should we start the server?
     */
    shouldStartServer() {
        // Guard: Ensure stateStore is ready
        if (!this.stateStore || typeof this.stateStore.getState !== 'function') {
            return { should: false, reason: 'State store not ready' };
        }
        
        try {
            const server = this.stateStore.getState('system.server') || {};
            const unity = this.stateStore.getState('system.unity') || {};
            const game = this.stateStore.getState('game') || {};
            const activeIssues = this.issueDetector.getActiveIssues();
            
            // Server is already running (online or degraded)
            if (server.status === 'running' || server.status === 'degraded') {
                return {
                    should: false,
                    reason: `Server already running (status: ${server.status})`,
                    confidence: 1.0
                };
            }
            
            // Check if Unity needs server (Unity is running or should be running)
            const unityNeedsServer = unity.status === 'running' || unity.status === 'starting' || unity.status === 'connected';
            
            // Check if there are critical issues that might require server restart
            const criticalIssues = activeIssues.filter(i => i.severity === 'critical' && i.source === 'server');
            
            // STARTUP SCENARIO: If server is not running and Unity is not running, start server first
            // This handles the initial startup sequence: Server → Unity → Simulation
            // In simulation mode or when Unity automation is enabled, server must be running first
            const isStartupScenario = server.status !== 'running' && server.status !== 'degraded' && 
                                      unity.status !== 'running' && 
                                      unity.status !== 'starting' && 
                                      unity.status !== 'connected';
            
            // Should start if:
            // 1. Unity needs it (Unity is running/starting/connected)
            // 2. Critical server issues require restart
            // 3. Startup scenario: Server offline and Unity not running (start server first)
            if (unityNeedsServer || criticalIssues.length > 0 || isStartupScenario) {
                let reason = '';
                let priority = 'high';
                
                if (criticalIssues.length > 0) {
                    reason = `${criticalIssues.length} critical server issue(s)`;
                    priority = 'critical';
                } else if (unityNeedsServer) {
                    reason = 'Unity needs server';
                } else if (isStartupScenario) {
                    reason = 'Startup scenario: Server must be online before Unity can start';
                    priority = 'high';
                }
                
                return {
                    should: true,
                    reason: reason,
                    confidence: 0.9,
                    priority: priority
                };
            }
            
            return {
                should: false,
                reason: 'No need to start server',
                confidence: 0.8
            };
        } catch (error) {
            return {
                should: false,
                reason: `Error checking server status: ${error.message}`,
                confidence: 0.0
            };
        }
    }
    
    /**
     * Should we start Unity?
     */
    shouldStartUnity() {
        // Guard: Ensure stateStore is ready
        if (!this.stateStore || typeof this.stateStore.getState !== 'function') {
            return { should: false, reason: 'State store not ready' };
        }
        
        try {
            const unity = this.stateStore.getState('system.unity') || {};
            const server = this.stateStore.getState('system.server') || {};
            const monitoring = this.stateStore.getState('monitoring') || {};
            
            // Unity is already running or connected
            if (unity.status === 'running' || unity.status === 'connected') {
                return {
                    should: false,
                    reason: 'Unity already running',
                    confidence: 1.0
                };
            }
            
            // Check if Unity was just started (grace period check)
            // Unity needs 90 seconds to: start process, load project, enter play mode, initialize, connect, login
            if (unity.status === 'starting' || (unity.lastStartTime && (Date.now() - unity.lastStartTime) < 90000)) {
                return {
                    should: false,
                    reason: 'Unity was just started - waiting for connection (90s grace period)',
                    confidence: 0.9
                };
            }
            
            // Unity is paused (don't start if paused - wait for resume)
            if (monitoring.unity && monitoring.unity.paused) {
                return {
                    should: false,
                    reason: 'Unity is paused (waiting for fix)',
                    confidence: 1.0
                };
            }
            
            // Server must be fully running with database online for Unity to connect
            // Unity needs database for login, so server must be 'running' (not 'degraded')
            // Startup sequence: Database → Server (with DB) → Unity → Simulation
            if (server.status !== 'running') {
                if (server.status === 'degraded') {
                    return {
                        should: false,
                        reason: 'Server is running but database is offline - database must be online before Unity can start',
                        confidence: 0.95
                    };
                }
                return {
                    should: false,
                    reason: `Server is not running (status: ${server.status || 'unknown'})`,
                    confidence: 0.9
                };
            }
            
            // Check database status explicitly (server.database should be true when status is 'running')
            if (server.database !== true) {
                return {
                    should: false,
                    reason: 'Database is not online - database must be started before Unity can start',
                    confidence: 0.95
                };
            }
            
            // Should start Unity if server is fully running with database online
            return {
                should: true,
                reason: 'Server is running with database online, Unity should start',
                confidence: 0.9,
                priority: 'high'
            };
        } catch (error) {
            return {
                should: false,
                reason: `Error checking Unity status: ${error.message}`,
                confidence: 0.0
            };
        }
    }
    
    /**
     * Should we start simulation?
     */
    shouldStartSimulation() {
        // Guard: Ensure stateStore is ready
        if (!this.stateStore || typeof this.stateStore.getState !== 'function') {
            return { should: false, reason: 'State store not ready' };
        }
        
        try {
            const game = this.stateStore.getState('game') || {};
            const unity = this.stateStore.getState('system.unity') || {};
            const server = this.stateStore.getState('system.server') || {};
            const monitoring = this.stateStore.getState('monitoring') || {};
            
            // Simulation already running
            if (game.activeSimulations && game.activeSimulations > 0) {
                return {
                    should: false,
                    reason: 'Simulation already running',
                    confidence: 1.0
                };
            }
            
            // Unity must be connected
            if (unity.status !== 'connected' && unity.status !== 'running') {
                return {
                    should: false,
                    reason: 'Unity not connected',
                    confidence: 0.9
                };
            }
            
            // Server must be running (can be 'running' or 'degraded' - database offline is OK)
            if (server.status !== 'running' && server.status !== 'degraded') {
                return {
                    should: false,
                    reason: `Server not running (status: ${server.status || 'unknown'})`,
                    confidence: 0.9
                };
            }
            
            // Unity must not be paused
            if (monitoring.unity && monitoring.unity.paused) {
                return {
                    should: false,
                    reason: 'Unity is paused',
                    confidence: 1.0
                };
            }
            
            // Should start simulation if all conditions met
            return {
                should: true,
                reason: 'All conditions met for simulation',
                confidence: 0.9,
                priority: 'medium'
            };
        } catch (error) {
            return {
                should: false,
                reason: `Error checking simulation status: ${error.message}`,
                confidence: 0.0
            };
        }
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
        // LEARNING SYSTEM FIX: Add null check before accessing state properties
        const investigation = this.stateStore.getState('monitoring.investigation') || {};
        
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
            // LEARNING SYSTEM FIX: Add null check before accessing state properties
            const investigation = this.stateStore.getState('monitoring.investigation') || {};
            
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
        // LEARNING SYSTEM FIX: Add null check before accessing state properties
        const investigation = this.stateStore.getState('monitoring.investigation') || {};
        const activeIssues = this.issueDetector ? this.issueDetector.getActiveIssues() : [];
        
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
            startTime: investigation.startTime || Date.now(),
            completedAt: Date.now(),
            duration: investigation.startTime ? (Date.now() - investigation.startTime) / 1000 : 0,
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
