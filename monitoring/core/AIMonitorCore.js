/**
 * AI Monitor Core - The Badass System
 * 
 * This is the main orchestrator that brings everything together.
 * AI sees everything, knows everything, acts on everything.
 * 
 * Human just prompts. AI does everything.
 */

const path = require('path');
const StateStore = require('./StateStore');
const AILogProcessor = require('./AILogProcessor');
const AIIssueDetector = require('./AIIssueDetector');
const AIFixTracker = require('./AIFixTracker');
const AIDecisionEngine = require('./AIDecisionEngine');
const AILiveStatistics = require('./AILiveStatistics');
const AICommunicationInterface = require('./AICommunicationInterface');
const IntegrityChecker = require('./IntegrityChecker');
const ServerStateCapture = require('./ServerStateCapture');
const ErrorRecovery = require('./ErrorRecovery');
const PerformanceMonitor = require('./PerformanceMonitor');

class AIMonitorCore {
    constructor(projectRoot) {
        this.projectRoot = projectRoot;
        
        // Initialize core components
        this.stateStore = new StateStore(projectRoot);
        
        // Initialize error recovery and performance monitor first
        this.errorRecovery = new ErrorRecovery(this.stateStore);
        this.performanceMonitor = new PerformanceMonitor(this.stateStore);
        
        // Initialize core components (with error recovery tracking)
        try {
            this.logProcessor = new AILogProcessor(projectRoot, this.stateStore);
            this.errorRecovery.recordSuccess('logProcessor');
        } catch (error) {
            this.errorRecovery.recordError('logProcessor', error);
            throw error;
        }
        
        try {
            this.issueDetector = new AIIssueDetector(this.stateStore, this.logProcessor);
            this.errorRecovery.recordSuccess('issueDetector');
        } catch (error) {
            this.errorRecovery.recordError('issueDetector', error);
            throw error;
        }
        
        try {
            this.fixTracker = new AIFixTracker(this.stateStore, this.issueDetector);
            this.errorRecovery.recordSuccess('fixTracker');
        } catch (error) {
            this.errorRecovery.recordError('fixTracker', error);
            throw error;
        }
        
        try {
            this.decisionEngine = new AIDecisionEngine(this.stateStore, this.issueDetector, this.fixTracker);
            this.errorRecovery.recordSuccess('decisionEngine');
        } catch (error) {
            this.errorRecovery.recordError('decisionEngine', error);
            throw error;
        }
        
        this.liveStatistics = new AILiveStatistics(
            this.stateStore,
            this.issueDetector,
            this.fixTracker,
            this.decisionEngine,
            this.logProcessor
        );
        this.communicationInterface = new AICommunicationInterface(
            this.stateStore,
            this.issueDetector,
            this.fixTracker,
            this.decisionEngine,
            this.logProcessor,
            this.liveStatistics
        );
        this.integrityChecker = new IntegrityChecker(
            projectRoot,
            this.stateStore,
            this.issueDetector
        );
        
        // Server state capture (captures server health/metrics)
        try {
            this.serverStateCapture = new ServerStateCapture(
                this.stateStore,
                process.env.SERVER_URL || 'http://localhost:3000'
            );
            this.errorRecovery.recordSuccess('serverStateCapture');
        } catch (error) {
            this.errorRecovery.recordError('serverStateCapture', error);
            throw error;
        }
        
        // Start server state capture
        this.serverStateCapture.start();
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Setup error recovery listeners
        this.setupErrorRecoveryListeners();
        
        // Setup performance monitoring listeners
        this.setupPerformanceListeners();
        
        console.log('[AI Monitor Core] Initialized - AI sees everything, knows everything, acts on everything');
        console.log('[AI Monitor Core] Integrity checker active - AI verifies its own integrity');
        console.log('[AI Monitor Core] Error recovery active - System can self-heal');
        console.log('[AI Monitor Core] Performance monitoring active - Tracking system performance');
    }
    
    
    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Issue detected
        this.issueDetector.on('issueDetected', (issue) => {
            console.log(`[AI Monitor] Issue detected: ${issue.type} (${issue.severity})`);
        });
        
        // Fix attempt recorded
        this.fixTracker.on('attemptRecorded', (attempt) => {
            console.log(`[AI Monitor] Fix attempt recorded: ${attempt.fixMethod} - ${attempt.result}`);
        });
        
        // Fix succeeded
        this.fixTracker.on('fixSucceeded', (data) => {
            console.log(`[AI Monitor] Fix succeeded: ${data.fixMethod} for issue ${data.issueId}`);
        });
        
        // Fix failed
        this.fixTracker.on('fixFailed', (data) => {
            console.log(`[AI Monitor] Fix failed: ${data.fixMethod} for issue ${data.issueId} - won't try again`);
        });
        
        // Decisions made
        this.decisionEngine.on('decisionsMade', (decisions) => {
            if (decisions.investigation.should) {
                console.log(`[AI Monitor] Decision: Start investigation - ${decisions.investigation.reason}`);
            }
            if (decisions.pause.should) {
                console.log(`[AI Monitor] Decision: Pause Unity - ${decisions.pause.reason}`);
            }
            if (decisions.resume.should) {
                console.log(`[AI Monitor] Decision: Resume Unity - ${decisions.resume.reason}`);
            }
        });
        
        // Investigation started
        this.decisionEngine.on('investigationStarted', (decision) => {
            console.log(`[AI Monitor] Investigation started: ${decision.reason}`);
        });
        
        // Investigation completed
        this.decisionEngine.on('investigationCompleted', (data) => {
            console.log(`[AI Monitor] Investigation completed: ${data.issues.length} issue(s) found in ${data.duration.toFixed(1)}s`);
        });
    }
    
    /**
     * Get complete status - AI can see everything
     */
    getStatus() {
        return this.communicationInterface.getStatusReport();
    }
    
    /**
     * Query system - AI can ask anything
     */
    query(question) {
        return this.communicationInterface.query(question);
    }
    
    /**
     * Get live statistics - AI sees comprehensive info
     */
    getStatistics() {
        return this.liveStatistics.getStatistics();
    }
    
    /**
     * Record fix attempt - AI tracks everything
     */
    recordFixAttempt(issueId, fixMethod, fixDetails, result) {
        return this.fixTracker.recordAttempt(issueId, fixMethod, fixDetails, result);
    }
    
    /**
     * Get suggested fixes - AI knows what to try
     */
    getSuggestedFixes(issue) {
        return this.fixTracker.getSuggestedFixes(issue);
    }
    
    /**
     * Get active issues - AI sees all issues
     */
    getActiveIssues() {
        return this.issueDetector.getActiveIssues();
    }
    
    /**
     * Get detailed analysis - AI understands everything
     */
    getDetailedAnalysis(issueId) {
        return this.communicationInterface.getDetailedAnalysis(issueId);
    }
    
    /**
     * Get integrity status
     */
    getIntegrityStatus() {
        return this.integrityChecker.getIntegrityStatus();
    }
    
    /**
     * Run integrity checks
     */
    runIntegrityChecks() {
        return this.integrityChecker.runAllChecks();
    }
    
    /**
     * Get last integrity check results
     */
    getIntegrityCheckResults() {
        return this.integrityChecker.getLastCheckResults();
    }
    
    /**
     * Cleanup - Stop all background processes
     */
    destroy() {
        // Stop all background intervals
        if (this.serverStateCapture) {
            this.serverStateCapture.stop();
        }
        if (this.integrityChecker) {
            this.integrityChecker.stopPeriodicChecks();
        }
        if (this.logProcessor) {
            this.logProcessor.stopWatching();
        }
        if (this.issueDetector) {
            this.issueDetector.stopStateVerification();
        }
        if (this.stateStore) {
            this.stateStore.destroy();
        }
        console.log('[AI Monitor Core] Destroyed - All background processes stopped');
    }
}

module.exports = AIMonitorCore;
