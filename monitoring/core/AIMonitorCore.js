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
const AILearningEngine = require('./AILearningEngine');
const UniversalErrorHandler = require('./UniversalErrorHandler');
const UnityStateReporter = require('./UnityStateReporter');
const StateVerificationContracts = require('./StateVerificationContracts');
const DependencyGraph = require('./DependencyGraph');
const EnhancedAnomalyDetection = require('./EnhancedAnomalyDetection');
const gameLogger = require('../../src/utils/GameLogger');

class AIMonitorCore {
    constructor(projectRoot) {
        this.projectRoot = projectRoot;
        
        // Initialize core components
        this.stateStore = new StateStore(projectRoot);
        
        // Initialize error recovery and performance monitor first
        this.errorRecovery = new ErrorRecovery(this.stateStore);
        this.performanceMonitor = new PerformanceMonitor(this.stateStore);
        
        // Initialize universal error handler (needs to be early, but after errorRecovery)
        // Will be fully initialized after issueDetector and learningEngine are ready
        this.universalErrorHandler = null; // Will be set after components are ready
        
        // Initialize learning engine (after fixTracker is ready)
        
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
            
            // Initialize learning engine (needs fixTracker)
            this.learningEngine = new AILearningEngine(this.stateStore, this.issueDetector, this.fixTracker);
            this.errorRecovery.recordSuccess('learningEngine');
            
            // Connect learning engine to fix tracker
            this.fixTracker.on('attemptRecorded', (attempt) => {
                this.learningEngine.learnFromAttempt(attempt);
            });
            
            // NOW initialize universal error handler (needs issueDetector, errorRecovery, learningEngine)
            this.universalErrorHandler = new UniversalErrorHandler(
                this.stateStore,
                this.issueDetector,
                this.errorRecovery,
                this.learningEngine
            );
            this.errorRecovery.recordSuccess('universalErrorHandler');
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
                process.env.SERVER_URL || 'http://localhost:3000',
                this.issueDetector, // Pass issue detector so it can report errors
                this.errorRecovery  // Pass error recovery so it can track errors
            );
            this.errorRecovery.recordSuccess('serverStateCapture');
        } catch (error) {
            this.errorRecovery.recordError('serverStateCapture', error);
            throw error;
        }
        
        // Unity state reporter (handles Unity UI/audio state reports)
        try {
            this.unityStateReporter = new UnityStateReporter(
                this.stateStore,
                this.issueDetector
            );
            this.errorRecovery.recordSuccess('unityStateReporter');
        } catch (error) {
            this.errorRecovery.recordError('unityStateReporter', error);
            throw error;
        }
        
        // State verification contracts (defines what "correct" state looks like)
        try {
            this.stateVerificationContracts = new StateVerificationContracts(
                this.stateStore,
                this.issueDetector
            );
            this.errorRecovery.recordSuccess('stateVerificationContracts');
        } catch (error) {
            this.errorRecovery.recordError('stateVerificationContracts', error);
            throw error;
        }
        
        // Dependency graph (maps relationships between components)
        try {
            this.dependencyGraph = new DependencyGraph(
                this.stateStore,
                this.issueDetector
            );
            this.errorRecovery.recordSuccess('dependencyGraph');
        } catch (error) {
            this.errorRecovery.recordError('dependencyGraph', error);
            throw error;
        }
        
        // Enhanced anomaly detection (statistical analysis and pattern learning)
        try {
            this.enhancedAnomalyDetection = new EnhancedAnomalyDetection(
                this.stateStore,
                this.issueDetector
            );
            this.errorRecovery.recordSuccess('enhancedAnomalyDetection');
        } catch (error) {
            this.errorRecovery.recordError('enhancedAnomalyDetection', error);
            throw error;
        }
        
        // Wrap all components with error handler (AFTER all components are created)
        this.wrapAllComponents();
        
        // Start server state capture
        this.serverStateCapture.start();
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Setup error recovery listeners
        this.setupErrorRecoveryListeners();
        
        // Setup performance monitoring listeners
        this.setupPerformanceListeners();
        
        // Log initialization - all debug goes to log, not console
        gameLogger.info('MONITORING', '[AI_MONITOR_CORE] Initialized', {
            message: 'AI sees everything, knows everything, acts on everything',
            integrityChecker: 'active',
            errorRecovery: 'active',
            performanceMonitoring: 'active'
        });
    }
    
    
    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Issue detected
        this.issueDetector.on('issueDetected', (issue) => {
            gameLogger.info('MONITORING', '[AI_MONITOR] Issue detected', {
                type: issue.type,
                severity: issue.severity,
                issueId: issue.id
            });
        });
        
        // Fix attempt recorded
        this.fixTracker.on('attemptRecorded', (attempt) => {
            gameLogger.info('MONITORING', '[AI_MONITOR] Fix attempt recorded', {
                fixMethod: attempt.fixMethod,
                result: attempt.result,
                issueId: attempt.issueId
            });
        });
        
        // Fix succeeded
        this.fixTracker.on('fixSucceeded', (data) => {
            gameLogger.info('MONITORING', '[AI_MONITOR] Fix succeeded', {
                fixMethod: data.fixMethod,
                issueId: data.issueId
            });
        });
        
        // Fix failed
        this.fixTracker.on('fixFailed', (data) => {
            gameLogger.info('MONITORING', '[AI_MONITOR] Fix failed', {
                fixMethod: data.fixMethod,
                issueId: data.issueId,
                note: 'Won\'t try again'
            });
        });
        
        // Decisions made
        this.decisionEngine.on('decisionsMade', (decisions) => {
            if (decisions.investigation.should) {
                gameLogger.info('MONITORING', '[AI_MONITOR] Decision: Start investigation', {
                    reason: decisions.investigation.reason
                });
            }
            if (decisions.pause.should) {
                gameLogger.info('MONITORING', '[AI_MONITOR] Decision: Pause Unity', {
                    reason: decisions.pause.reason
                });
            }
            if (decisions.resume.should) {
                gameLogger.info('MONITORING', '[AI_MONITOR] Decision: Resume Unity', {
                    reason: decisions.resume.reason
                });
            }
        });
        
        // Investigation started
        this.decisionEngine.on('investigationStarted', (decision) => {
            gameLogger.info('MONITORING', '[AI_MONITOR] Investigation started', {
                reason: decision.reason
            });
        });
        
        // Investigation completed
        this.decisionEngine.on('investigationCompleted', (data) => {
            gameLogger.info('MONITORING', '[AI_MONITOR] Investigation completed', {
                issuesFound: data.issues.length,
                duration: data.duration.toFixed(1) + 's'
            });
        });
    }
    
    /**
     * Setup error recovery listeners
     */
    setupErrorRecoveryListeners() {
        if (!this.errorRecovery) return;
        
        this.errorRecovery.on('error', ({ component, error }) => {
            // DO NOT log to console - errors are for AI only, not user
            // Error is already tracked by errorRecovery and reported to issueDetector
        });
        
        this.errorRecovery.on('success', ({ component }) => {
            gameLogger.info('MONITORING', '[ERROR_RECOVERY] Component recovered', {
                component: component
            });
        });
        
        this.errorRecovery.on('retry', ({ component, attempt, delay }) => {
            gameLogger.info('MONITORING', '[ERROR_RECOVERY] Retrying component', {
                component: component,
                attempt: attempt,
                delay: delay + 'ms'
            });
        });
        
        this.errorRecovery.on('circuitOpen', ({ component, failures }) => {
            // DO NOT log to console - errors are for AI only, not user
            // Circuit breaker status is tracked in state store
        });
    }
    
    /**
     * Setup performance monitoring listeners
     */
    setupPerformanceListeners() {
        if (!this.performanceMonitor) return;
        
        this.performanceMonitor.on('slowOperation', ({ operation, duration, threshold }) => {
            // DO NOT log to console - errors are for AI only, not user
            // Performance issues are tracked in state store
        });
        
        this.performanceMonitor.on('verySlowOperation', ({ operation, duration, threshold }) => {
            // DO NOT log to console - errors are for AI only, not user
            // Performance issues are tracked in state store and reported to issue detector
        });
        
        this.performanceMonitor.on('highMemoryUsage', ({ usagePercent, threshold }) => {
            // DO NOT log to console - errors are for AI only, not user
            // Performance issues are tracked in state store
        });
        
        this.performanceMonitor.on('highCpuUsage', ({ usagePercent, threshold }) => {
            // DO NOT log to console - errors are for AI only, not user
            // Performance issues are tracked in state store
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
     * Get error recovery status
     */
    getErrorRecoveryStatus() {
        if (!this.errorRecovery) {
            return { componentHealth: {}, timestamp: Date.now() };
        }
        return {
            componentHealth: this.errorRecovery.getAllHealth(),
            timestamp: Date.now()
        };
    }
    
    /**
     * Get performance report
     */
    getPerformanceReport() {
        if (!this.performanceMonitor) {
            return { system: {}, operations: {}, thresholds: {}, timestamp: Date.now() };
        }
        return this.performanceMonitor.getPerformanceReport();
    }
    
    /**
     * Get learning report
     */
    getLearningReport() {
        if (!this.learningEngine) {
            return { patterns: {}, causalChains: {}, solutionOptimization: {}, crossIssueLearning: {} };
        }
        return this.learningEngine.getLearningReport();
    }
    
    /**
     * Get best solution for issue type
     */
    getBestSolution(issueType) {
        if (!this.learningEngine) {
            return null;
        }
        return this.learningEngine.getBestSolution(issueType);
    }
    
    /**
     * Get Unity state reporter
     */
    getUnityStateReporter() {
        return this.unityStateReporter;
    }
    
    /**
     * Predict likely issues
     */
    predictIssues(currentState = null) {
        if (!this.learningEngine) {
            return [];
        }
        const state = currentState || this.stateStore.getState('game');
        return this.learningEngine.predictIssues(state);
    }
    
    /**
     * Wrap all components with error handler
     * Ensures all errors are caught, reported, and learned from
     */
    wrapAllComponents() {
        if (!this.universalErrorHandler) return;
        
        const handler = this.universalErrorHandler;
        
        // Wrap StateStore methods
        if (this.stateStore) {
            const originalUpdateState = this.stateStore.updateState.bind(this.stateStore);
            this.stateStore.updateState = handler.wrapSyncFunction('stateStore', 'updateState', originalUpdateState);
            
            const originalGetState = this.stateStore.getState.bind(this.stateStore);
            this.stateStore.getState = handler.wrapSyncFunction('stateStore', 'getState', originalGetState);
            
            const originalSave = this.stateStore.save.bind(this.stateStore);
            this.stateStore.save = handler.wrapFunction('stateStore', 'save', originalSave);
            
            const originalLoad = this.stateStore.load.bind(this.stateStore);
            this.stateStore.load = handler.wrapFunction('stateStore', 'load', originalLoad);
        }
        
        // Wrap AILogProcessor methods
        if (this.logProcessor) {
            const originalProcessLine = this.logProcessor.processLine.bind(this.logProcessor);
            this.logProcessor.processLine = handler.wrapSyncFunction('logProcessor', 'processLine', originalProcessLine);
            
            const originalCheckForNewLogs = this.logProcessor.checkForNewLogs.bind(this.logProcessor);
            this.logProcessor.checkForNewLogs = handler.wrapFunction('logProcessor', 'checkForNewLogs', originalCheckForNewLogs);
        }
        
        // Wrap AIIssueDetector methods
        if (this.issueDetector) {
            const originalDetectIssue = this.issueDetector.detectIssue.bind(this.issueDetector);
            this.issueDetector.detectIssue = handler.wrapSyncFunction('issueDetector', 'detectIssue', originalDetectIssue);
            
            const originalVerifyState = this.issueDetector.verifyState.bind(this.issueDetector);
            this.issueDetector.verifyState = handler.wrapFunction('issueDetector', 'verifyState', originalVerifyState);
            
            const originalGetActiveIssues = this.issueDetector.getActiveIssues.bind(this.issueDetector);
            this.issueDetector.getActiveIssues = handler.wrapSyncFunction('issueDetector', 'getActiveIssues', originalGetActiveIssues);
        }
        
        // Wrap AIFixTracker methods
        if (this.fixTracker) {
            const originalRecordAttempt = this.fixTracker.recordAttempt.bind(this.fixTracker);
            this.fixTracker.recordAttempt = handler.wrapSyncFunction('fixTracker', 'recordAttempt', originalRecordAttempt);
            
            const originalGetSuggestedFixes = this.fixTracker.getSuggestedFixes.bind(this.fixTracker);
            this.fixTracker.getSuggestedFixes = handler.wrapSyncFunction('fixTracker', 'getSuggestedFixes', originalGetSuggestedFixes);
        }
        
        // Wrap AIDecisionEngine methods
        if (this.decisionEngine) {
            const originalShouldStartInvestigation = this.decisionEngine.shouldStartInvestigation.bind(this.decisionEngine);
            this.decisionEngine.shouldStartInvestigation = handler.wrapSyncFunction('decisionEngine', 'shouldStartInvestigation', originalShouldStartInvestigation);
            
            const originalStartInvestigation = this.decisionEngine.startInvestigation.bind(this.decisionEngine);
            this.decisionEngine.startInvestigation = handler.wrapFunction('decisionEngine', 'startInvestigation', originalStartInvestigation);
            
            const originalCompleteInvestigation = this.decisionEngine.completeInvestigation.bind(this.decisionEngine);
            this.decisionEngine.completeInvestigation = handler.wrapFunction('decisionEngine', 'completeInvestigation', originalCompleteInvestigation);
        }
        
        // Wrap AILiveStatistics methods
        if (this.liveStatistics) {
            const originalGetStatistics = this.liveStatistics.getStatistics.bind(this.liveStatistics);
            this.liveStatistics.getStatistics = handler.wrapSyncFunction('liveStatistics', 'getStatistics', originalGetStatistics);
        }
        
        // Wrap AICommunicationInterface methods
        if (this.communicationInterface) {
            const originalQuery = this.communicationInterface.query.bind(this.communicationInterface);
            this.communicationInterface.query = handler.wrapFunction('communicationInterface', 'query', originalQuery);
            
            const originalGetStatusReport = this.communicationInterface.getStatusReport.bind(this.communicationInterface);
            this.communicationInterface.getStatusReport = handler.wrapSyncFunction('communicationInterface', 'getStatusReport', originalGetStatusReport);
        }
        
        // Wrap AILearningEngine methods
        if (this.learningEngine) {
            const originalLearnFromAttempt = this.learningEngine.learnFromAttempt.bind(this.learningEngine);
            this.learningEngine.learnFromAttempt = handler.wrapSyncFunction('learningEngine', 'learnFromAttempt', originalLearnFromAttempt);
            
            const originalGetBestSolution = this.learningEngine.getBestSolution.bind(this.learningEngine);
            this.learningEngine.getBestSolution = handler.wrapSyncFunction('learningEngine', 'getBestSolution', originalGetBestSolution);
        }
        
        // Note: ErrorRecovery and PerformanceMonitor don't need wrapping as they're already error-aware
        // IntegrityChecker already reports to issueDetector
        // ServerStateCapture already reports errors
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
        gameLogger.info('MONITORING', '[AI_MONITOR_CORE] Destroyed', {
            message: 'All background processes stopped'
        });
    }
}

module.exports = AIMonitorCore;
