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

class AIMonitorCore {
    constructor(projectRoot) {
        this.projectRoot = projectRoot;
        
        // Initialize core components
        this.stateStore = new StateStore(projectRoot);
        this.logProcessor = new AILogProcessor(projectRoot, this.stateStore);
        this.issueDetector = new AIIssueDetector(this.stateStore, this.logProcessor);
        this.fixTracker = new AIFixTracker(this.stateStore, this.issueDetector);
        this.decisionEngine = new AIDecisionEngine(this.stateStore, this.issueDetector, this.fixTracker);
        this.liveStatistics = new AILiveStatistics(
            this.stateStore,
            this.issueDetector,
            this.fixTracker,
            this.decisionEngine,
            this.logProcessor
        );
        this.communication = new AICommunicationInterface(
            this.stateStore,
            this.issueDetector,
            this.fixTracker,
            this.decisionEngine,
            this.logProcessor,
            this.liveStatistics
        );
        
        // Setup event listeners
        this.setupEventListeners();
        
        console.log('[AI Monitor Core] Initialized - AI sees everything, knows everything, acts on everything');
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
        return this.communication.getStatusReport();
    }
    
    /**
     * Query system - AI can ask anything
     */
    query(question) {
        return this.communication.query(question);
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
        return this.communication.getDetailedAnalysis(issueId);
    }
    
    /**
     * Cleanup
     */
    destroy() {
        this.stateStore.destroy();
        console.log('[AI Monitor Core] Destroyed');
    }
}

module.exports = AIMonitorCore;
