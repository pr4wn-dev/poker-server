/**
 * AI Monitor Core - The Badass System
 * 
 * This is the main orchestrator that brings everything together.
 * AI sees everything, knows everything, acts on everything.
 * 
 * Human just prompts. AI does everything.
 */

// CRITICAL: Load console override FIRST to enforce logging rules
// But don't call overrideConsole() immediately - let it happen lazily
// This prevents blocking during module load
const ConsoleOverrideModule = require('./ConsoleOverride');
// Override will happen when the module loads (it calls overrideConsole() at module load time)

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
const CausalAnalysis = require('./CausalAnalysis');
const AutoFixEngine = require('./AutoFixEngine');
const AIRulesEnforcer = require('./AIRulesEnforcer');
const gameLogger = require('../../src/utils/GameLogger');

class AIMonitorCore {
    constructor(projectRoot) {
        this.projectRoot = projectRoot;
        
        // Use MySQL if available, otherwise JSON
        const USE_MYSQL = process.env.BROKENPROMISE_USE_MYSQL !== 'false';
        if (USE_MYSQL) {
            try {
                const StateStoreMySQL = require('./StateStoreMySQL');
                this.stateStore = new StateStoreMySQL(projectRoot);
                this.useMySQL = true;
            } catch (error) {
                // Fallback to JSON
                this.stateStore = new StateStore(projectRoot);
                this.useMySQL = false;
            }
        } else {
            this.stateStore = new StateStore(projectRoot);
            this.useMySQL = false;
        }
        
        // Initialize error recovery and performance monitor first
        this.errorRecovery = new ErrorRecovery(this.stateStore);
        this.performanceMonitor = new PerformanceMonitor(this.stateStore);
        
        // Initialize process monitor (needs issueDetector, will be set after issueDetector is created)
        this.processMonitor = null;
        
        // Rules enforcer needs learningEngine for self-learning - will be initialized after learningEngine
        this.rulesEnforcer = null;
        this.workflowEnforcer = null;
        
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
            
            // Initialize process monitor (needs issueDetector)
            const ProcessMonitor = require('./ProcessMonitor');
            this.processMonitor = new ProcessMonitor(this.stateStore, this.issueDetector);
            this.errorRecovery.recordSuccess('processMonitor');
        } catch (error) {
            this.errorRecovery.recordError('issueDetector', error);
            throw error;
        }
        
        try {
            this.fixTracker = new AIFixTracker(this.stateStore, this.issueDetector);
            this.errorRecovery.recordSuccess('fixTracker');
            
            // Initialize learning engine (needs fixTracker)
            // Use MySQL version if MySQL is enabled
            if (this.useMySQL) {
                try {
                    const AILearningEngineMySQL = require('./AILearningEngineMySQL');
                    this.learningEngine = new AILearningEngineMySQL(this.stateStore, this.issueDetector, this.fixTracker);
                    this.errorRecovery.recordSuccess('learningEngine');
                    
                    // Seed initial error patterns (non-blocking)
                    this.learningEngine.seedInitialPatterns().catch(err => {
                        gameLogger.warn('BrokenPromise', '[LEARNING] Failed to seed initial patterns', { error: err.message });
                    });
                } catch (error) {
                    // Fallback to JSON version
                    this.learningEngine = new AILearningEngine(this.stateStore, this.issueDetector, this.fixTracker);
                    this.errorRecovery.recordSuccess('learningEngine');
                }
            } else {
                this.learningEngine = new AILearningEngine(this.stateStore, this.issueDetector, this.fixTracker);
                this.errorRecovery.recordSuccess('learningEngine');
            }
            
            // Connect learning engine to fix tracker
            this.fixTracker.on('attemptRecorded', (attempt) => {
                this.learningEngine.learnFromAttempt(attempt);
            });
            
            // NOW initialize rules enforcer (needs learningEngine for self-learning)
            this.rulesEnforcer = new AIRulesEnforcer(this.stateStore, this.learningEngine);
            this.errorRecovery.recordSuccess('rulesEnforcer');
            
            // Initialize workflow enforcer (needs rulesEnforcer and learningEngine)
            // Note: powerShellSyntaxValidator will be set after it's initialized
            const AIWorkflowEnforcer = require('./AIWorkflowEnforcer');
            this.workflowEnforcer = null; // Will be set after powerShellSyntaxValidator is initialized
            this.errorRecovery.recordSuccess('workflowEnforcer');
            
            // Connect ConsoleOverride to rules enforcer (so violations are learned from)
            const ConsoleOverride = require('./ConsoleOverride');
            ConsoleOverride.setViolationCallback((ruleId, context, details) => {
                if (this.rulesEnforcer) {
                    this.rulesEnforcer.recordViolation(ruleId, context, details);
                }
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
        // Communication interface needs learning engine for confidence and rules enforcer - create after learning engine
        this.communicationInterface = new AICommunicationInterface(
            this.stateStore,
            this.issueDetector,
            this.fixTracker,
            this.decisionEngine,
            this.logProcessor,
            this.liveStatistics,
            this.learningEngine, // Pass learning engine for confidence tracking
            this.rulesEnforcer // Pass rules enforcer - AI must never forget rules
        );
        
        // Solution Template Engine (reusable solution templates)
        try {
            const SolutionTemplateEngine = require('./SolutionTemplateEngine');
            this.solutionTemplateEngine = new SolutionTemplateEngine(
                this.stateStore,
                this.learningEngine
            );
            this.errorRecovery.recordSuccess('solutionTemplateEngine');
        } catch (error) {
            this.errorRecovery.recordError('solutionTemplateEngine', error);
            throw error;
        }
        
        // Code Change Tracker (learn from actual code changes)
        try {
            const CodeChangeTracker = require('./CodeChangeTracker');
            this.codeChangeTracker = new CodeChangeTracker(
                this.stateStore,
                this.projectRoot
            );
            this.errorRecovery.recordSuccess('codeChangeTracker');
        } catch (error) {
            this.errorRecovery.recordError('codeChangeTracker', error);
            throw error;
        }
        
        // AI Collaboration Interface - WE ARE ONE
        // This makes AI and Learning System completely symbiotic
        const AICollaborationInterface = require('./AICollaborationInterface');
        this.collaborationInterface = new AICollaborationInterface(
            this.stateStore,
            this.learningEngine,
            this.issueDetector,
            this.fixTracker,
            this.communicationInterface,
            this.solutionTemplateEngine,
            this.codeChangeTracker,
            this.powerShellSyntaxValidator
        );
        this.errorRecovery.recordSuccess('collaborationInterface');
        
        // Prompt-Based System Components
        const PromptGenerator = require('./PromptGenerator');
        const PromptComplianceVerifier = require('./PromptComplianceVerifier');
        const AIWorkflowViolationDetector = require('./AIWorkflowViolationDetector');
        
        // Initialize prompt generator
        this.promptGenerator = new PromptGenerator(
            this.stateStore,
            this.learningEngine,
            this.collaborationInterface
        );
        this.errorRecovery.recordSuccess('promptGenerator');
        
        // Initialize compliance verifier
        this.complianceVerifier = new PromptComplianceVerifier(
            this.stateStore,
            this.projectRoot
        );
        this.errorRecovery.recordSuccess('complianceVerifier');
        
        // Track tool calls (we'll need to hook into tool system or track manually)
        // For now, we'll track via state updates
        // Note: setupToolCallTracking will be implemented when we have tool system hooks
        
        // Code Analysis Instrumentation (automatic logging injection)
        try {
            const CodeAnalysisInstrumentation = require('./CodeAnalysisInstrumentation');
            this.codeAnalysis = new CodeAnalysisInstrumentation(
                this.projectRoot,
                this.stateStore,
                this.learningEngine
            );
            this.errorRecovery.recordSuccess('codeAnalysis');
        } catch (error) {
            this.errorRecovery.recordError('codeAnalysis', error);
            // Don't throw - code analysis is optional
        }
        
        // Initialize workflow violation detector
        this.workflowViolationDetector = new AIWorkflowViolationDetector(
            this.stateStore,
            this.collaborationInterface,
            this.complianceVerifier
        );
        this.errorRecovery.recordSuccess('workflowViolationDetector');
        
        // Hook up code change tracker to workflow violation detector
        if (this.codeChangeTracker) {
            this.codeChangeTracker.on('codeChanged', (data) => {
                if (this.workflowViolationDetector && data.file) {
                    this.workflowViolationDetector.recordCodeChange(data.file, data.changeType || 'modified');
                }
            });
        }
        
        // Hook up violation detector to record beforeAIAction/afterAIAction calls
        this.collaborationInterface.on('beforeAIAction', () => {
            this.workflowViolationDetector.recordBeforeActionCall();
        });
        this.collaborationInterface.on('afterAIAction', () => {
            this.workflowViolationDetector.recordAfterActionCall();
        });
        
        // Hook up tool call tracking to compliance verifier
        this.collaborationInterface.on('toolCall', (toolCall) => {
            if (this.complianceVerifier) {
                this.complianceVerifier.trackToolCall(toolCall.tool, toolCall.params);
            }
        });
        
        // Hook up violation detector to prompt generator
        this.workflowViolationDetector.on('violationDetected', (violation) => {
            const prompt = this.promptGenerator.generatePrompt({
                type: 'workflow_violation',
                violation: violation.violation,
                file: violation.file,
                timestamp: violation.timestamp
            });
            if (prompt) {
                gameLogger.warn('BrokenPromise', '[PROMPT_SYSTEM] Generated prompt for workflow violation', {
                    promptId: prompt.id,
                    violation: violation.violation
                });
            }
        });
        
        // Hook up error detection to prompt generator
        if (this.errorRecovery) {
            this.errorRecovery.on('error', ({ component, error }) => {
                // Generate prompt for monitoring system errors
                const prompt = this.promptGenerator.generatePrompt({
                    type: 'error_fix',
                    errorType: error.message || 'Error',
                    component: component,
                    issueType: 'monitoring_system_error',
                    timestamp: Date.now()
                });
                if (prompt) {
                    gameLogger.warn('BrokenPromise', '[PROMPT_SYSTEM] Generated prompt for monitoring system error', {
                        promptId: prompt.id,
                        component: component
                    });
                }
            });
        }
        
        // Hook up issue detection to prompt generator
        if (this.issueDetector) {
            this.issueDetector.on('issueDetected', (issue) => {
                // Generate prompt for Unity game issues
                const prompt = this.promptGenerator.generatePrompt({
                    type: 'error_fix',
                    errorType: issue.type || 'Issue',
                    component: issue.component || 'Unity',
                    issueType: issue.issueType || 'game_issue',
                    file: issue.file,
                    timestamp: Date.now()
                });
                if (prompt) {
                    gameLogger.warn('BrokenPromise', '[PROMPT_SYSTEM] Generated prompt for Unity game issue', {
                        promptId: prompt.id,
                        issueType: issue.issueType
                    });
                }
            });
        }

        // Hook up server error monitoring to prompt generator
        const ServerErrorMonitor = require('./ServerErrorMonitor');
        this.serverErrorMonitor = new ServerErrorMonitor(
            this.stateStore,
            this.promptGenerator,
            process.env.SERVER_URL || 'http://localhost:3000'
        );
        this.serverErrorMonitor.on('serverError', (error) => {
            // Prompt already generated by ServerErrorMonitor
            gameLogger.warn('BrokenPromise', '[PROMPT_SYSTEM] Server error detected, prompt generated', {
                error: error.errorMessage,
                consecutiveErrors: error.consecutiveErrors
            });
        });
        this.serverErrorMonitor.start();
        
        // Hook up failure tracking to prompt generator (after failures)
        if (this.collaborationInterface) {
            this.collaborationInterface.on('aiFailure', (failureRecord) => {
                // After failure, check if web search is required
                const webSearchRequired = this.stateStore.getState('ai.learning.webSearchRequired');
                if (webSearchRequired && !webSearchRequired.resolved) {
                    const prompt = this.promptGenerator.generatePrompt({
                        type: 'web_search_required',
                        consecutiveFailures: webSearchRequired.consecutiveFailures,
                        searchTerms: webSearchRequired.searchTerms,
                        issueType: failureRecord.action?.issueType,
                        component: failureRecord.action?.component,
                        timestamp: Date.now()
                    });
                    if (prompt) {
                        gameLogger.warn('BrokenPromise', '[PROMPT_SYSTEM] Generated prompt for web search requirement', {
                            promptId: prompt.id,
                            consecutiveFailures: webSearchRequired.consecutiveFailures
                        });
                    }
                } else {
                    // Generate error fix prompt for the failure
                    const prompt = this.promptGenerator.generatePrompt({
                        type: 'error_fix',
                        errorType: failureRecord.failure?.reason || 'Failure',
                        component: failureRecord.action?.component || 'unknown',
                        issueType: failureRecord.action?.issueType || 'fix_failure',
                        timestamp: Date.now()
                    });
                    if (prompt) {
                        gameLogger.warn('BrokenPromise', '[PROMPT_SYSTEM] Generated prompt for fix failure', {
                            promptId: prompt.id,
                            issueType: failureRecord.action?.issueType
                        });
                    }
                }
            });
        }
        
        // Hook up prompt generator to verify compliance after prompts are delivered
        this.promptGenerator.on('promptGenerated', ({ prompt }) => {
            // Schedule verification after a delay (give AI time to act)
            const verificationTimeout = setTimeout(() => {
                this.verifyPromptCompliance(prompt);
            }, 300000); // Check after 5 minutes
            
            // Store timeout so we can cancel if prompt is delivered early
            prompt._verificationTimeout = verificationTimeout;
        });
        
        // Verify compliance when prompt is marked as delivered
        this.stateStore.on('stateChanged', (event) => {
            if (event.path === 'ai.deliveredPrompts') {
                // A prompt was marked as delivered - verify immediately
                const deliveredPrompts = this.stateStore.getState('ai.deliveredPrompts') || [];
                if (deliveredPrompts.length > 0) {
                    const latestDeliveredId = deliveredPrompts[deliveredPrompts.length - 1];
                    const prompts = this.stateStore.getState('ai.prompts') || [];
                    const prompt = prompts.find(p => p.id === latestDeliveredId);
                    if (prompt) {
                        // Cancel scheduled verification and verify now
                        if (prompt._verificationTimeout) {
                            clearTimeout(prompt._verificationTimeout);
                        }
                        // Verify after a short delay to allow AI to complete actions
                        setTimeout(() => {
                            this.verifyPromptCompliance(prompt);
                        }, 30000); // 30 seconds after delivery
                    }
                }
            }
        });
        
        // Verify compliance when tool calls are made (real-time verification)
        this.collaborationInterface.on('toolCall', (toolCall) => {
            // Check if there's a pending prompt that requires this tool
            const prompts = this.stateStore.getState('ai.prompts') || [];
            const pendingPrompts = prompts.filter(p => !p.delivered && (Date.now() - (p.timestamp || 0)) < 600000); // Last 10 minutes
            
            for (const prompt of pendingPrompts) {
                // Check if this tool call satisfies part of the prompt
                if (this._isToolCallRelevant(prompt, toolCall)) {
                    // Schedule a quick verification check
                    setTimeout(() => {
                        this.verifyPromptCompliance(prompt, { quickCheck: true });
                    }, 5000); // 5 seconds after relevant tool call
                }
            }
        });
        
        // Initialize PowerShell syntax validator (needs issueDetector and learningEngine)
        const PowerShellSyntaxValidator = require('./PowerShellSyntaxValidator');
        this.powerShellSyntaxValidator = new PowerShellSyntaxValidator(
            this.projectRoot,
            this.stateStore,
            this.issueDetector,
            this.learningEngine
        );
        this.errorRecovery.recordSuccess('powerShellSyntaxValidator');
        
        // Initialize command execution monitor (needs issueDetector and learningEngine)
        const CommandExecutionMonitor = require('./CommandExecutionMonitor');
        this.commandExecutionMonitor = new CommandExecutionMonitor(
            this.stateStore,
            this.issueDetector,
            this.learningEngine
        );
        this.errorRecovery.recordSuccess('commandExecutionMonitor');
        
        // NOW initialize workflow enforcer (needs powerShellSyntaxValidator)
        if (!this.workflowEnforcer) {
            const AIWorkflowEnforcer = require('./AIWorkflowEnforcer');
            this.workflowEnforcer = new AIWorkflowEnforcer(
                this.stateStore,
                this.rulesEnforcer,
                this.learningEngine,
                this.powerShellSyntaxValidator
            );
        }
        
        this.integrityChecker = new IntegrityChecker(
            projectRoot,
            this.stateStore,
            this.issueDetector
        );
        
        // Logging Integrity Checker (Phase 5)
        try {
            const LoggingIntegrityChecker = require('./LoggingIntegrityChecker');
            this.loggingIntegrityChecker = new LoggingIntegrityChecker(
                projectRoot,
                this.stateStore,
                this.issueDetector
            );
            this.errorRecovery.recordSuccess('loggingIntegrityChecker');
        } catch (error) {
            this.errorRecovery.recordError('loggingIntegrityChecker', error);
            throw error;
        }
        
        // Logging Auto-Fix (Phase 5)
        try {
            const LoggingAutoFix = require('./LoggingAutoFix');
            this.loggingAutoFix = new LoggingAutoFix(
                projectRoot,
                this.stateStore,
                this.issueDetector,
                this.loggingIntegrityChecker
            );
            this.errorRecovery.recordSuccess('loggingAutoFix');
        } catch (error) {
            this.errorRecovery.recordError('loggingAutoFix', error);
            throw error;
        }
        
        // Code Enhancement System (Phase 5)
        try {
            const CodeEnhancementSystem = require('./CodeEnhancementSystem');
            this.codeEnhancementSystem = new CodeEnhancementSystem(
                projectRoot,
                this.stateStore,
                this.issueDetector
            );
            this.errorRecovery.recordSuccess('codeEnhancementSystem');
        } catch (error) {
            this.errorRecovery.recordError('codeEnhancementSystem', error);
            throw error;
        }
        
        // Performance Analyzer (Phase 7)
        try {
            const PerformanceAnalyzer = require('./PerformanceAnalyzer');
            this.performanceAnalyzer = new PerformanceAnalyzer(
                this.stateStore,
                this.issueDetector,
                this.fixTracker,
                this.learningEngine,
                this.performanceMonitor
            );
            this.errorRecovery.recordSuccess('performanceAnalyzer');
        } catch (error) {
            this.errorRecovery.recordError('performanceAnalyzer', error);
            throw error;
        }
        
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
        
        // Causal analysis (trace state changes backwards, build causal chains)
        try {
            this.causalAnalysis = new CausalAnalysis(
                this.stateStore,
                this.issueDetector,
                this.dependencyGraph
            );
            this.errorRecovery.recordSuccess('causalAnalysis');
        } catch (error) {
            this.errorRecovery.recordError('causalAnalysis', error);
            throw error;
        }
        
        // Auto-fix engine (automatically tries fixes from knowledge base)
        try {
            this.autoFixEngine = new AutoFixEngine(
                this.stateStore,
                this.issueDetector,
                this.fixTracker,
                this.learningEngine
            );
            this.errorRecovery.recordSuccess('autoFixEngine');
        } catch (error) {
            this.errorRecovery.recordError('autoFixEngine', error);
            throw error;
        }
        
        // Connect AutoFixEngine to collaboration interface - when learning system succeeds, it teaches AI
        // This happens after collaborationInterface is created (which happens after communicationInterface)
        // So we'll set this up in setupEventListeners()
        
        // Wrap all components with error handler (AFTER all components are created)
        this.wrapAllComponents();
        
        // Start server state capture
        this.serverStateCapture.start();
        
        // Start decision engine (after all components are initialized)
        this.decisionEngine.start();
        
        // Start logging integrity checks (Phase 5)
        if (this.loggingIntegrityChecker) {
            this.loggingIntegrityChecker.startPeriodicChecks();
        }
        
        // Start performance analysis (Phase 7)
        if (this.performanceAnalyzer) {
            this.performanceAnalyzer.startPeriodicAnalysis();
        }
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Setup error recovery listeners
        this.setupErrorRecoveryListeners();
        
        // Setup performance monitoring listeners
        this.setupPerformanceListeners();
        
        // Setup logging integrity listeners (Phase 5)
        this.setupLoggingIntegrityListeners();
        
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
        
        // LEARNING SYSTEM TEACHES AI - When AutoFixEngine tries something and it works/fails
        // This is the bidirectional learning - learning system teaches AI
        if (this.autoFixEngine && this.collaborationInterface) {
            // When learning system successfully fixes something, teach AI
            this.autoFixEngine.on('fixSucceeded', (data) => {
                const { issue, fix, result } = data;
                this.collaborationInterface.learningSystemSucceeded({
                    type: 'auto_fix',
                    method: fix.method,
                    issueType: issue.type,
                    component: issue.component,
                    details: {
                        issueId: issue.id,
                        confidence: fix.confidence,
                        source: fix.source
                    }
                }, {
                    success: true,
                    description: result.reason || `Successfully fixed ${issue.type} using ${fix.method}`,
                    confidence: fix.confidence || 0.9
                });
            });
            
            // When learning system tries something and it fails, teach AI what not to do
            this.autoFixEngine.on('fixAttempted', (data) => {
                const { issue, fix, result } = data;
                if (!result.success) {
                    this.collaborationInterface.learningSystemFailed({
                        type: 'auto_fix',
                        method: fix.method,
                        issueType: issue.type,
                        component: issue.component,
                        details: {
                            issueId: issue.id,
                            confidence: fix.confidence,
                            source: fix.source
                        }
                    }, {
                        success: false,
                        reason: result.reason || `Failed to fix ${issue.type} using ${fix.method}`,
                        error: result.error
                    });
                }
            });
        }
        
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
     * Setup logging integrity listeners (Phase 5)
     */
    setupLoggingIntegrityListeners() {
        if (!this.loggingIntegrityChecker) return;
        
        // When integrity check completes, attempt auto-fix if enabled
        this.loggingIntegrityChecker.on('integrityChecked', async (results) => {
            if (this.loggingAutoFix && results.issues && results.issues.length > 0) {
                // Attempt to fix issues automatically
                for (const issue of results.issues.slice(0, 5)) { // Fix first 5 issues
                    try {
                        await this.loggingAutoFix.attemptFix(issue);
                    } catch (error) {
                        gameLogger.error('MONITORING', '[LOGGING_AUTO_FIX] Auto-fix error', {
                            error: error.message,
                            issue: issue.type
                        });
                    }
                }
            }
        });
    }
    
    /**
     * Get complete status - AI can see everything
     */
    getStatus() {
        if (!this.communicationInterface) {
            return { error: 'Communication interface not available', timestamp: Date.now() };
        }
        try {
            return this.communicationInterface.getStatusReport();
        } catch (error) {
            gameLogger.error('MONITORING', '[AI_MONITOR_CORE] Get status error', {
                error: error.message,
                stack: error.stack
            });
            return { error: error.message, timestamp: Date.now() };
        }
    }
    
    /**
     * Query system - AI can ask anything
     */
    query(question) {
        if (!this.communicationInterface) {
            return { error: 'Communication interface not available', answer: null };
        }
        try {
            return this.communicationInterface.query(question);
        } catch (error) {
            gameLogger.error('MONITORING', '[AI_MONITOR_CORE] Query error', {
                question,
                error: error.message,
                stack: error.stack
            });
            return { error: error.message, answer: null };
        }
    }
    
    /**
     * Get live statistics - AI sees comprehensive info
     */
    getStatistics() {
        if (!this.liveStatistics) {
            return { error: 'Live statistics not available', timestamp: Date.now() };
        }
        try {
            return this.liveStatistics.getStatistics();
        } catch (error) {
            gameLogger.error('MONITORING', '[AI_MONITOR_CORE] Get statistics error', {
                error: error.message,
                stack: error.stack
            });
            return { error: error.message, timestamp: Date.now() };
        }
    }
    
    /**
     * Record fix attempt - AI tracks everything
     */
    recordFixAttempt(issueId, fixMethod, fixDetails, result) {
        if (!this.fixTracker) {
            return { success: false, reason: 'Fix tracker not available' };
        }
        try {
            return this.fixTracker.recordAttempt(issueId, fixMethod, fixDetails, result);
        } catch (error) {
            gameLogger.error('MONITORING', '[AI_MONITOR_CORE] Record fix attempt error', {
                issueId,
                fixMethod,
                error: error.message,
                stack: error.stack
            });
            return { success: false, reason: error.message };
        }
    }
    
    /**
     * Get suggested fixes - AI knows what to try
     */
    getSuggestedFixes(issue) {
        if (!this.fixTracker || !issue) {
            return { shouldTry: [], shouldNotTry: [], confidence: 0 };
        }
        return this.fixTracker.getSuggestedFixes(issue);
    }
    
    /**
     * Get active issues - AI sees all issues
     */
    getActiveIssues() {
        if (!this.issueDetector) {
            return [];
        }
        const issues = this.issueDetector.getActiveIssues();
        return Array.isArray(issues) ? issues : [];
    }
    
    /**
     * Get issue by ID
     */
    getIssue(issueId) {
        if (!this.issueDetector) {
            return null;
        }
        return this.issueDetector.getIssue(issueId) || null;
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
     * Get auto-fix engine
     */
    getAutoFixEngine() {
        return this.autoFixEngine;
    }
    
    /**
     * Get rules enforcer
     */
    getRulesEnforcer() {
        return this.rulesEnforcer;
    }
    
    /**
     * Get workflow enforcer
     */
    getWorkflowEnforcer() {
        return this.workflowEnforcer;
    }
    
    /**
     * Get process monitor
     */
    getProcessMonitor() {
        return this.processMonitor;
    }
    
    /**
     * Get AI collaboration interface - WE ARE ONE
     * This is the bridge that makes AI and Learning System completely symbiotic
     */
    getCollaborationInterface() {
        return this.collaborationInterface;
    }
    
    /**
     * Before AI action - get proactive suggestions from learning system
     * Call this BEFORE taking any action to get warnings, recommendations, patterns
     */
    beforeAIAction(action) {
        if (!this.collaborationInterface) {
            return { warnings: [], recommendations: [], patterns: [], alternatives: [], confidence: null };
        }
        return this.collaborationInterface.beforeAIAction(action);
    }
    
    /**
     * After AI action - learn from the result
     * Call this AFTER taking any action so learning system can learn from it
     */
    afterAIAction(action, result) {
        if (!this.collaborationInterface) {
            return;
        }
        this.collaborationInterface.afterAIAction(action, result);
    }
    
    /**
     * AI needs help - get proactive assistance from learning system
     * Call this when stuck or need suggestions
     */
    aiNeedsHelp(context) {
        if (!this.collaborationInterface) {
            return { suggestions: [], patterns: [], similarProblems: [], solutions: [], confidence: null };
        }
        return this.collaborationInterface.aiNeedsHelp(context);
    }
    
    /**
     * Query learning system - unified interface
     * Ask the learning system anything
     */
    queryLearning(question) {
        if (!this.collaborationInterface) {
            return { error: 'Collaboration interface not available' };
        }
        return this.collaborationInterface.queryLearning(question);
    }
    
    /**
     * AI warns learning system - bidirectional warnings
     */
    aiWarnsLearningSystem(warning) {
        if (!this.collaborationInterface) {
            return { error: 'Collaboration interface not available' };
        }
        return this.collaborationInterface.aiWarnsLearningSystem(warning);
    }
    
    /**
     * AI detects pattern and shares with learning system
     */
    aiDetectsPattern(pattern) {
        if (!this.collaborationInterface) {
            return { error: 'Collaboration interface not available' };
        }
        return this.collaborationInterface.aiDetectsPattern(pattern);
    }
    
    /**
     * Work together on a problem
     */
    workTogetherOnProblem(problem) {
        if (!this.collaborationInterface) {
            return { error: 'Collaboration interface not available' };
        }
        return this.collaborationInterface.workTogetherOnProblem(problem);
    }
    
    /**
     * Get symbiotic status - how well we're working together
     */
    getSymbioticStatus() {
        if (!this.collaborationInterface) {
            return { error: 'Collaboration interface not available' };
        }
        return this.collaborationInterface.getSymbioticStatus();
    }
    
    /**
     * Track improvement together
     */
    trackImprovementTogether(improvement) {
        if (!this.collaborationInterface) {
            return { error: 'Collaboration interface not available' };
        }
        return this.collaborationInterface.trackImprovementTogether(improvement);
    }
    
    /**
     * Get state verification contracts
     */
    getStateVerificationContracts() {
        return this.stateVerificationContracts;
    }
    
    /**
     * Get dependency graph
     */
    getDependencyGraph() {
        return this.dependencyGraph;
    }
    
    /**
     * Get enhanced anomaly detection
     */
    getEnhancedAnomalyDetection() {
        return this.enhancedAnomalyDetection;
    }
    
    /**
     * Get causal analysis
     */
    getCausalAnalysis() {
        return this.causalAnalysis;
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
     * Attempt auto-fix for an issue
     */
    async attemptAutoFix(issueId) {
        if (!this.autoFixEngine) {
            return { success: false, reason: 'Auto-fix engine not available' };
        }
        const issue = this.issueDetector.getIssue(issueId);
        if (!issue) {
            return { success: false, reason: 'Issue not found' };
        }
        // AutoFixEngine handles issues automatically, but we can trigger it manually
        return await this.autoFixEngine.handleIssue(issue);
    }
    
    /**
     * Get auto-fix statistics
     */
    getAutoFixStatistics() {
        if (!this.autoFixEngine) {
            return { enabled: false, totalAttempts: 0, successful: 0, failed: 0 };
        }
        return this.autoFixEngine.getStatistics();
    }
    
    /**
     * Enable/disable auto-fix
     */
    setAutoFixEnabled(enabled) {
        if (this.autoFixEngine) {
            if (enabled) {
                this.autoFixEngine.enable();
            } else {
                this.autoFixEngine.disable();
            }
        }
    }
    
    /**
     * Get auto-fix suggested fixes for an issue
     */
    getAutoFixSuggestions(issueId) {
        if (!this.autoFixEngine) {
            return [];
        }
        const issue = this.issueDetector.getIssue(issueId);
        if (!issue) {
            return [];
        }
        return this.autoFixEngine.getSuggestedFixes(issue);
    }
    
    /**
     * Get component health summary
     */
    getComponentHealth() {
        try {
            const health = {
                timestamp: Date.now(),
                components: {}
            };
            
            // Get error recovery health
            if (this.errorRecovery) {
                try {
                    health.components = this.errorRecovery.getAllHealth();
                } catch (error) {
                    gameLogger.error('MONITORING', '[AI_MONITOR_CORE] Get error recovery health error', {
                        error: error.message
                    });
                    health.components = {};
                }
            }
            
            // Add component status
            health.status = {
                stateStore: !!this.stateStore,
                logProcessor: !!this.logProcessor,
                issueDetector: !!this.issueDetector,
                fixTracker: !!this.fixTracker,
                decisionEngine: !!this.decisionEngine,
                liveStatistics: !!this.liveStatistics,
                communicationInterface: !!this.communicationInterface,
                integrityChecker: !!this.integrityChecker,
                serverStateCapture: !!this.serverStateCapture,
                unityStateReporter: !!this.unityStateReporter,
                stateVerificationContracts: !!this.stateVerificationContracts,
                dependencyGraph: !!this.dependencyGraph,
                enhancedAnomalyDetection: !!this.enhancedAnomalyDetection,
                causalAnalysis: !!this.causalAnalysis,
                autoFixEngine: !!this.autoFixEngine,
                learningEngine: !!this.learningEngine,
                errorRecovery: !!this.errorRecovery,
                performanceMonitor: !!this.performanceMonitor,
                universalErrorHandler: !!this.universalErrorHandler,
                processMonitor: !!this.processMonitor,
                workflowEnforcer: !!this.workflowEnforcer,
                loggingIntegrityChecker: !!this.loggingIntegrityChecker,
                loggingAutoFix: !!this.loggingAutoFix,
                codeEnhancementSystem: !!this.codeEnhancementSystem,
                performanceAnalyzer: !!this.performanceAnalyzer
            };
            
            // Calculate overall health
            const componentCount = Object.keys(health.status).length;
            const activeCount = Object.values(health.status).filter(v => v === true).length;
            health.overallHealth = {
                active: activeCount,
                total: componentCount,
                percentage: componentCount > 0 ? Math.round((activeCount / componentCount) * 100) : 0
            };
            
            return health;
        } catch (error) {
            gameLogger.error('MONITORING', '[AI_MONITOR_CORE] Get component health error', {
                error: error.message,
                stack: error.stack
            });
            return {
                timestamp: Date.now(),
                error: error.message,
                components: {},
                status: {},
                overallHealth: { active: 0, total: 0, percentage: 0 }
            };
        }
    }
    
    /**
     * Get comprehensive system report
     */
    getSystemReport() {
        return {
            timestamp: Date.now(),
            status: this.getStatus(),
            statistics: this.getStatistics(),
            activeIssues: this.getActiveIssues(),
            integrity: this.getIntegrityStatus(),
            errorRecovery: this.getErrorRecoveryStatus(),
            performance: this.getPerformanceReport(),
            learning: this.getLearningReport(),
            autoFix: this.getAutoFixStatistics(),
            componentHealth: this.getComponentHealth(),
            processes: this.processMonitor ? this.processMonitor.getProcessReport() : null
        };
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
        if (this.serverErrorMonitor) {
            this.serverErrorMonitor.stop();
        }
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
        if (this.stateVerificationContracts && this.stateVerificationContracts.stopVerification) {
            this.stateVerificationContracts.stopVerification();
        }
        if (this.enhancedAnomalyDetection && this.enhancedAnomalyDetection.stopMonitoring) {
            this.enhancedAnomalyDetection.stopMonitoring();
        }
        if (this.causalAnalysis && this.causalAnalysis.stop) {
            this.causalAnalysis.stop();
        }
        if (this.performanceMonitor && this.performanceMonitor.stop) {
            this.performanceMonitor.stop();
        }
        if (this.rulesEnforcer && this.rulesEnforcer.stop) {
            this.rulesEnforcer.stop();
        }
        if (this.learningEngine && this.learningEngine.stopConfidenceMonitoring) {
            this.learningEngine.stopConfidenceMonitoring();
        }
        if (this.universalErrorHandler && this.universalErrorHandler.stopErrorRateMonitoring) {
            this.universalErrorHandler.stopErrorRateMonitoring();
        }
        if (this.processMonitor && this.processMonitor.stopMonitoring) {
            this.processMonitor.stopMonitoring();
        }
        
        // Stop logging integrity checks (Phase 5)
        if (this.loggingIntegrityChecker && this.loggingIntegrityChecker.stopPeriodicChecks) {
            this.loggingIntegrityChecker.stopPeriodicChecks();
        }
        
        // Stop performance analysis (Phase 7)
        if (this.performanceAnalyzer && this.performanceAnalyzer.stopPeriodicAnalysis) {
            this.performanceAnalyzer.stopPeriodicAnalysis();
        }
        
        // Stop PowerShell syntax validator
        if (this.powerShellSyntaxValidator && this.powerShellSyntaxValidator.stop) {
            this.powerShellSyntaxValidator.stop();
        }
        
        // Stop command execution monitor
        if (this.commandExecutionMonitor && this.commandExecutionMonitor.stop) {
            this.commandExecutionMonitor.stop();
        }
        
        // Run pattern learner improvements (Phase 7) before shutdown
        if (this.learningEngine && this.learningEngine.runPatternLearnerImprovements) {
            try {
                this.learningEngine.runPatternLearnerImprovements();
            } catch (error) {
                gameLogger.error('MONITORING', '[AI_MONITOR_CORE] Pattern learner improvements error', {
                    error: error.message
                });
            }
        }
        
        // Stop collaboration interface (remove listeners to prevent memory leaks)
        if (this.collaborationInterface) {
            this.collaborationInterface.removeAllListeners();
        }
        
        // Save solution templates
        if (this.solutionTemplateEngine) {
            this.solutionTemplateEngine.save();
        }
        
        // Save code changes
        if (this.codeChangeTracker) {
            this.codeChangeTracker.save();
        }
        
        if (this.stateStore) {
            // StateStoreMySQL.destroy() is async, but we can't await in destroy()
            // Handle it non-blocking - database connections will be closed
            try {
                const result = this.stateStore.destroy();
                if (result && typeof result.then === 'function') {
                    // Async - handle it but don't block shutdown
                    result.catch(err => {
                        gameLogger.error('MONITORING', '[AI_MONITOR_CORE] StateStore destroy error', {
                            error: err.message
                        });
                    });
                }
            } catch (err) {
                gameLogger.error('MONITORING', '[AI_MONITOR_CORE] StateStore destroy error', {
                    error: err.message
                });
            }
        }
        
        // CRITICAL: Also stop workflow enforcer if it has any intervals
        if (this.workflowEnforcer && this.workflowEnforcer.stop) {
            this.workflowEnforcer.stop();
        }
        
        gameLogger.info('MONITORING', '[AI_MONITOR_CORE] Destroyed', {
            message: 'All background processes stopped'
        });
        
        // Stop workflow violation detector
        if (this.workflowViolationDetector) {
            this.workflowViolationDetector.stopMonitoring();
        }
        
        // Note: AIMonitorCore doesn't extend EventEmitter, so we can't emit
        // If external cleanup is needed, it should be handled by the caller
    }
    
    /**
     * Verify prompt compliance (helper method)
     */
    verifyPromptCompliance(prompt, options = {}) {
        if (!this.complianceVerifier || !prompt) {
            return null;
        }
        
        const verification = this.complianceVerifier.verifyCompliance(prompt, options);
        
        if (!verification.compliant && !options.quickCheck) {
            // Generate non-compliance prompt
            const nonCompliancePrompt = this.promptGenerator.generatePrompt({
                type: 'non_compliance',
                claimedAction: 'follow the prompt',
                previousPromptId: prompt.id,
                verification: verification.verification,
                requiredSteps: this._extractRequiredSteps(prompt.prompt)
            });
            if (nonCompliancePrompt) {
                gameLogger.warn('BrokenPromise', '[PROMPT_SYSTEM] Generated non-compliance prompt', {
                    promptId: nonCompliancePrompt.id,
                    previousPromptId: prompt.id,
                    complianceResult: verification.complianceResult
                });
            }
        }
        
        return verification;
    }
    
    /**
     * Check if a tool call is relevant to a prompt
     */
    _isToolCallRelevant(prompt, toolCall) {
        if (!prompt || !toolCall) {
            return false;
        }
        
        const promptText = prompt.prompt || '';
        const toolName = toolCall.tool;
        
        // Check if prompt requires this tool
        if (toolName === 'web_search' && promptText.includes('Search the web')) {
            return true;
        }
        if (toolName === 'beforeAIAction' && promptText.includes('beforeAIAction()')) {
            return true;
        }
        if (toolName === 'afterAIAction' && promptText.includes('afterAIAction()')) {
            return true;
        }
        
        return false;
    }
    
    /**
     * Extract required steps from prompt text
     */
    _extractRequiredSteps(promptText) {
        const steps = [];
        const lines = promptText.split('\n');
        let inStepsSection = false;
        
        for (const line of lines) {
            if (line.includes('You must:')) {
                inStepsSection = true;
                continue;
            }
            
            if (inStepsSection) {
                // Match numbered steps (1., 2., etc.)
                const stepMatch = line.match(/^\d+\.\s*(.+)$/);
                if (stepMatch) {
                    steps.push(stepMatch[1].trim());
                } else if (line.trim() === '' || line.includes('System will verify')) {
                    // End of steps section
                    break;
                }
            }
        }
        
        return steps;
    }
}

module.exports = AIMonitorCore;
