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
        
        // LEARNING SYSTEM FIX: Lazy initialization - only create lightweight components in constructor
        // All heavy components are created via getters on first access
        
        // Use MySQL if available, otherwise JSON
        const USE_MYSQL = process.env.BROKENPROMISE_USE_MYSQL !== 'false';
        if (USE_MYSQL) {
            try {
                const StateStoreMySQL = require('./StateStoreMySQL');
                this._stateStore = new StateStoreMySQL(projectRoot);
                this.useMySQL = true;
            } catch (error) {
                // Fallback to JSON
                this._stateStore = new StateStore(projectRoot);
                this.useMySQL = false;
            }
        } else {
            this._stateStore = new StateStore(projectRoot);
            this.useMySQL = false;
        }
        
        // Initialize error recovery and performance monitor first (lightweight)
        this._errorRecovery = new ErrorRecovery(this._stateStore);
        this._performanceMonitor = new PerformanceMonitor(this._stateStore);
        
        // LEARNING SYSTEM FIX: All other components are lazy - stored in _private properties
        // Access via getters that create on-demand
        this._logProcessor = null;
        this._issueDetector = null;
        this._processMonitor = null;
        this._fixTracker = null;
        this._learningEngine = null;
        this._rulesEnforcer = null;
        this._workflowEnforcer = null;
        this._universalErrorHandler = null;
        this._decisionEngine = null;
        this._liveStatistics = null;
        this._communicationInterface = null;
        this._solutionTemplateEngine = null;
        this._codeChangeTracker = null;
        this._collaborationInterface = null;
        this._promptGenerator = null;
        this._complianceVerifier = null;
        this._codeAnalysis = null;
        this._workflowViolationDetector = null;
        this._serverErrorMonitor = null;
        this._powerShellSyntaxValidator = null;
        this._commandExecutionMonitor = null;
        this._integrityChecker = null;
        this._loggingIntegrityChecker = null;
        this._loggingAutoFix = null;
        this._codeEnhancementSystem = null;
        this._performanceAnalyzer = null;
        this._serverStateCapture = null;
        this._unityStateReporter = null;
        this._stateVerificationContracts = null;
        this._dependencyGraph = null;
        this._enhancedAnomalyDetection = null;
        this._causalAnalysis = null;
        this._autoFixEngine = null;
        
        // Track which components have been initialized (for event listener setup)
        this._initializedComponents = new Set();
        this._eventListenersSetup = false;
        
        gameLogger.info('MONITORING', '[AI_MONITOR_CORE] Constructor complete (lazy initialization)', {
            message: 'Components will be created on-demand to prevent memory overflow'
        });
    }
    
    /**
     * LEARNING SYSTEM FIX: Lazy getter for stateStore
     */
    get stateStore() {
        return this._stateStore;
    }
    
    /**
     * LEARNING SYSTEM FIX: Lazy getter for errorRecovery
     */
    get errorRecovery() {
        return this._errorRecovery;
    }
    
    /**
     * LEARNING SYSTEM FIX: Lazy getter for performanceMonitor
     */
    get performanceMonitor() {
        return this._performanceMonitor;
    }
    
    /**
     * LEARNING SYSTEM FIX: Lazy getter for logProcessor
     */
    get logProcessor() {
        if (!this._logProcessor) {
            try {
                this._logProcessor = new AILogProcessor(this.projectRoot, this._stateStore);
                this._errorRecovery.recordSuccess('logProcessor');
                this._initializedComponents.add('logProcessor');
            } catch (error) {
                this._errorRecovery.recordError('logProcessor', error);
                throw error;
            }
        }
        return this._logProcessor;
    }
    
    /**
     * LEARNING SYSTEM FIX: Lazy getter for issueDetector
     */
    get issueDetector() {
        if (!this._issueDetector) {
            try {
                this._issueDetector = new AIIssueDetector(this._stateStore, this.logProcessor);
                this._errorRecovery.recordSuccess('issueDetector');
                this._initializedComponents.add('issueDetector');
                
                // Initialize process monitor (needs issueDetector)
                if (!this._processMonitor) {
                    const ProcessMonitor = require('./ProcessMonitor');
                    this._processMonitor = new ProcessMonitor(this._stateStore, this._issueDetector);
                    this._errorRecovery.recordSuccess('processMonitor');
                    this._initializedComponents.add('processMonitor');
                }
                
                // Setup event listeners if not already done
                this._setupComponentEventListeners();
            } catch (error) {
                this._errorRecovery.recordError('issueDetector', error);
                throw error;
            }
        }
        return this._issueDetector;
    }
    
    /**
     * LEARNING SYSTEM FIX: Lazy getter for processMonitor
     */
    get processMonitor() {
        if (!this._processMonitor) {
            // Ensure issueDetector is created first (processMonitor depends on it)
            this.issueDetector; // This will create processMonitor too
        }
        return this._processMonitor;
    }
    
    /**
     * LEARNING SYSTEM FIX: Lazy getter for fixTracker
     */
    get fixTracker() {
        if (!this._fixTracker) {
            try {
                this._fixTracker = new AIFixTracker(this._stateStore, this.issueDetector);
                this._errorRecovery.recordSuccess('fixTracker');
                this._initializedComponents.add('fixTracker');
                
                // Connect learning engine to fix tracker (if learning engine exists)
                if (this._learningEngine) {
                    this._fixTracker.on('attemptRecorded', (attempt) => {
                        this._learningEngine.learnFromAttempt(attempt);
                    });
                }
                
                this._setupComponentEventListeners();
            } catch (error) {
                this._errorRecovery.recordError('fixTracker', error);
                throw error;
            }
        }
        return this._fixTracker;
    }
    
    /**
     * LEARNING SYSTEM FIX: Lazy getter for learningEngine
     */
    get learningEngine() {
        if (!this._learningEngine) {
            try {
                // Ensure fixTracker is created first
                this.fixTracker;
                
                // Use MySQL version if MySQL is enabled
                if (this.useMySQL) {
                    try {
                        const AILearningEngineMySQL = require('./AILearningEngineMySQL');
                        this._learningEngine = new AILearningEngineMySQL(this._stateStore, this.issueDetector, this._fixTracker);
                        this._errorRecovery.recordSuccess('learningEngine');
                        
                        // Seed initial error patterns (non-blocking)
                        this._learningEngine.seedInitialPatterns().catch(err => {
                            gameLogger.warn('BrokenPromise', '[LEARNING] Failed to seed initial patterns', { error: err.message });
                        });
                    } catch (error) {
                        // Fallback to JSON version
                        this._learningEngine = new AILearningEngine(this._stateStore, this.issueDetector, this._fixTracker);
                        this._errorRecovery.recordSuccess('learningEngine');
                    }
                } else {
                    this._learningEngine = new AILearningEngine(this._stateStore, this.issueDetector, this._fixTracker);
                    this._errorRecovery.recordSuccess('learningEngine');
                }
                
                this._initializedComponents.add('learningEngine');
                
                // Connect learning engine to fix tracker
                this._fixTracker.on('attemptRecorded', (attempt) => {
                    this._learningEngine.learnFromAttempt(attempt);
                });
                
                this._setupComponentEventListeners();
            } catch (error) {
                this._errorRecovery.recordError('learningEngine', error);
                throw error;
            }
        }
        return this._learningEngine;
    }
    
    /**
     * LEARNING SYSTEM FIX: Lazy getter for rulesEnforcer
     */
    get rulesEnforcer() {
        if (!this._rulesEnforcer) {
            try {
                // Ensure learningEngine is created first
                this.learningEngine;
                
                this._rulesEnforcer = new AIRulesEnforcer(this._stateStore, this._learningEngine);
                this._errorRecovery.recordSuccess('rulesEnforcer');
                this._initializedComponents.add('rulesEnforcer');
                
                // Connect ConsoleOverride to rules enforcer
                const ConsoleOverride = require('./ConsoleOverride');
                ConsoleOverride.setViolationCallback((ruleId, context, details) => {
                    if (this._rulesEnforcer) {
                        this._rulesEnforcer.recordViolation(ruleId, context, details);
                    }
                });
                
                this._setupComponentEventListeners();
            } catch (error) {
                this._errorRecovery.recordError('rulesEnforcer', error);
                throw error;
            }
        }
        return this._rulesEnforcer;
    }
    
    /**
     * LEARNING SYSTEM FIX: Lazy getter for universalErrorHandler
     */
    get universalErrorHandler() {
        if (!this._universalErrorHandler) {
            try {
                // Ensure dependencies are created
                this.issueDetector;
                this.learningEngine;
                
                this._universalErrorHandler = new UniversalErrorHandler(
                    this._stateStore,
                    this._issueDetector,
                    this._errorRecovery,
                    this._learningEngine
                );
                this._errorRecovery.recordSuccess('universalErrorHandler');
                this._initializedComponents.add('universalErrorHandler');
                
                this._setupComponentEventListeners();
            } catch (error) {
                this._errorRecovery.recordError('universalErrorHandler', error);
                throw error;
            }
        }
        return this._universalErrorHandler;
    }
    
    /**
     * LEARNING SYSTEM FIX: Lazy getter for decisionEngine
     */
    get decisionEngine() {
        if (!this._decisionEngine) {
            try {
                // Ensure dependencies are created
                this.issueDetector;
                this.fixTracker;
                
                this._decisionEngine = new AIDecisionEngine(this._stateStore, this._issueDetector, this._fixTracker);
                this._errorRecovery.recordSuccess('decisionEngine');
                this._initializedComponents.add('decisionEngine');
                
                // Start decision engine (after all components are initialized)
                this._decisionEngine.start();
                
                this._setupComponentEventListeners();
            } catch (error) {
                this._errorRecovery.recordError('decisionEngine', error);
                throw error;
            }
        }
        return this._decisionEngine;
    }
    
    /**
     * LEARNING SYSTEM FIX: Helper method to setup component event listeners
     * Called when components are first created
     */
    _setupComponentEventListeners() {
        if (this._eventListenersSetup) return;
        
        // Only setup listeners that don't require all components
        // Full event listener setup happens when all components are accessed
    }
    
    /**
     * LEARNING SYSTEM FIX: Lazy getter for liveStatistics
     */
    get liveStatistics() {
        if (!this._liveStatistics) {
            // Ensure dependencies are created
            this.issueDetector;
            this.fixTracker;
            this.decisionEngine;
            this.logProcessor;
            
            this._liveStatistics = new AILiveStatistics(
                this._stateStore,
                this._issueDetector,
                this._fixTracker,
                this._decisionEngine,
                this._logProcessor
            );
            this._initializedComponents.add('liveStatistics');
        }
        return this._liveStatistics;
    }
    
    /**
     * LEARNING SYSTEM FIX: Lazy getter for communicationInterface
     */
    get communicationInterface() {
        if (!this._communicationInterface) {
            // Ensure dependencies are created
            this.issueDetector;
            this.fixTracker;
            this.decisionEngine;
            this.logProcessor;
            this.liveStatistics;
            this.learningEngine;
            this.rulesEnforcer;
            
            this._communicationInterface = new AICommunicationInterface(
                this._stateStore,
                this._issueDetector,
                this._fixTracker,
                this._decisionEngine,
                this._logProcessor,
                this._liveStatistics,
                this._learningEngine,
                this._rulesEnforcer
            );
            this._initializedComponents.add('communicationInterface');
        }
        return this._communicationInterface;
    }
    
    /**
     * LEARNING SYSTEM FIX: Lazy getter for solutionTemplateEngine
     */
    get solutionTemplateEngine() {
        if (!this._solutionTemplateEngine) {
            try {
                // Ensure learningEngine is created
                this.learningEngine;
                
                const SolutionTemplateEngine = require('./SolutionTemplateEngine');
                this._solutionTemplateEngine = new SolutionTemplateEngine(
                    this._stateStore,
                    this._learningEngine
                );
                this._errorRecovery.recordSuccess('solutionTemplateEngine');
                this._initializedComponents.add('solutionTemplateEngine');
            } catch (error) {
                this._errorRecovery.recordError('solutionTemplateEngine', error);
                throw error;
            }
        }
        return this._solutionTemplateEngine;
    }
    
    /**
     * LEARNING SYSTEM FIX: Lazy getter for codeChangeTracker
     */
    get codeChangeTracker() {
        if (!this._codeChangeTracker) {
            try {
                const CodeChangeTracker = require('./CodeChangeTracker');
                this._codeChangeTracker = new CodeChangeTracker(
                    this._stateStore,
                    this.projectRoot
                );
                this._errorRecovery.recordSuccess('codeChangeTracker');
                this._initializedComponents.add('codeChangeTracker');
                
                // Hook up code change tracker to workflow violation detector (if it exists)
                if (this._workflowViolationDetector) {
                    this._codeChangeTracker.on('codeChanged', (data) => {
                        if (this._workflowViolationDetector && data.file) {
                            this._workflowViolationDetector.recordCodeChange(data.file, data.changeType || 'modified');
                        }
                    });
                }
            } catch (error) {
                this._errorRecovery.recordError('codeChangeTracker', error);
                throw error;
            }
        }
        return this._codeChangeTracker;
    }
    
    /**
     * LEARNING SYSTEM FIX: Lazy getter for powerShellSyntaxValidator
     */
    get powerShellSyntaxValidator() {
        if (!this._powerShellSyntaxValidator) {
            try {
                // Ensure dependencies are created
                this.issueDetector;
                this.learningEngine;
                
                const PowerShellSyntaxValidator = require('./PowerShellSyntaxValidator');
                this._powerShellSyntaxValidator = new PowerShellSyntaxValidator(
                    this.projectRoot,
                    this._stateStore,
                    this._issueDetector,
                    this._learningEngine
                );
                this._errorRecovery.recordSuccess('powerShellSyntaxValidator');
                this._initializedComponents.add('powerShellSyntaxValidator');
            } catch (error) {
                this._errorRecovery.recordError('powerShellSyntaxValidator', error);
                throw error;
            }
        }
        return this._powerShellSyntaxValidator;
    }
    
    /**
     * LEARNING SYSTEM FIX: Lazy getter for collaborationInterface
     */
    get collaborationInterface() {
        if (!this._collaborationInterface) {
            try {
                // Ensure dependencies are created
                this.learningEngine;
                this.issueDetector;
                this.fixTracker;
                this.communicationInterface;
                this.solutionTemplateEngine;
                this.codeChangeTracker;
                this.powerShellSyntaxValidator;
                
                const AICollaborationInterface = require('./AICollaborationInterface');
                this._collaborationInterface = new AICollaborationInterface(
                    this._stateStore,
                    this._learningEngine,
                    this._issueDetector,
                    this._fixTracker,
                    this._communicationInterface,
                    this._solutionTemplateEngine,
                    this._codeChangeTracker,
                    this._powerShellSyntaxValidator
                );
                this._errorRecovery.recordSuccess('collaborationInterface');
                this._initializedComponents.add('collaborationInterface');
                
                // Hook up event listeners
                this._setupCollaborationInterfaceListeners();
            } catch (error) {
                this._errorRecovery.recordError('collaborationInterface', error);
                throw error;
            }
        }
        return this._collaborationInterface;
    }
    
    /**
     * LEARNING SYSTEM FIX: Setup collaboration interface event listeners
     */
    _setupCollaborationInterfaceListeners() {
        if (!this._collaborationInterface) return;
        
        // Hook up violation detector to record beforeAIAction/afterAIAction calls
        if (this._workflowViolationDetector) {
            this._collaborationInterface.on('beforeAIAction', () => {
                this._workflowViolationDetector.recordBeforeActionCall();
            });
            this._collaborationInterface.on('afterAIAction', () => {
                this._workflowViolationDetector.recordAfterActionCall();
            });
        }
        
        // Hook up tool call tracking to compliance verifier
        if (this._complianceVerifier) {
            this._collaborationInterface.on('toolCall', (toolCall) => {
                this._complianceVerifier.trackToolCall(toolCall.tool, toolCall.params);
            });
        }
        
        // Hook up failure tracking to prompt generator
        this._collaborationInterface.on('aiFailure', (failureRecord) => {
            if (this._promptGenerator) {
                const webSearchRequired = this._stateStore.getState('ai.learning.webSearchRequired');
                if (webSearchRequired && !webSearchRequired.resolved) {
                    const prompt = this._promptGenerator.generatePrompt({
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
                    const prompt = this._promptGenerator.generatePrompt({
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
            }
        });
        
        // Hook up tool call tracking for compliance verification
        this._collaborationInterface.on('toolCall', (toolCall) => {
            if (this._complianceVerifier) {
                const prompts = this._stateStore.getState('ai.prompts') || [];
                const pendingPrompts = prompts.filter(p => !p.delivered && (Date.now() - (p.timestamp || 0)) < 600000);
                
                for (const prompt of pendingPrompts) {
                    if (this._isToolCallRelevant(prompt, toolCall)) {
                        setTimeout(() => {
                            this.verifyPromptCompliance(prompt, { quickCheck: true });
                        }, 5000);
                    }
                }
            }
        });
    }
    
    /**
     * LEARNING SYSTEM FIX: Lazy getter for complianceVerifier
     */
    get complianceVerifier() {
        if (!this._complianceVerifier) {
            try {
                const PromptComplianceVerifier = require('./PromptComplianceVerifier');
                this._complianceVerifier = new PromptComplianceVerifier(
                    this._stateStore,
                    this.projectRoot
                );
                this._errorRecovery.recordSuccess('complianceVerifier');
                this._initializedComponents.add('complianceVerifier');
            } catch (error) {
                this._errorRecovery.recordError('complianceVerifier', error);
                throw error;
            }
        }
        return this._complianceVerifier;
    }
    
    /**
     * LEARNING SYSTEM FIX: Lazy getter for promptGenerator
     */
    get promptGenerator() {
        if (!this._promptGenerator) {
            try {
                // Ensure dependencies are created
                this.learningEngine;
                this.collaborationInterface;
                
                const PromptGenerator = require('./PromptGenerator');
                this._promptGenerator = new PromptGenerator(
                    this._stateStore,
                    this._learningEngine,
                    this._collaborationInterface
                );
                this._errorRecovery.recordSuccess('promptGenerator');
                this._initializedComponents.add('promptGenerator');
                
                // Hook up prompt generator event listeners
                this._setupPromptGeneratorListeners();
            } catch (error) {
                this._errorRecovery.recordError('promptGenerator', error);
                throw error;
            }
        }
        return this._promptGenerator;
    }
    
    /**
     * LEARNING SYSTEM FIX: Setup prompt generator event listeners
     */
    _setupPromptGeneratorListeners() {
        if (!this._promptGenerator) return;
        
        // Hook up prompt generator to verify compliance after prompts are delivered
        this._promptGenerator.on('promptGenerated', ({ prompt }) => {
            const verificationTimeout = setTimeout(() => {
                this.verifyPromptCompliance(prompt);
            }, 300000);
            prompt._verificationTimeout = verificationTimeout;
        });
        
        // Hook up error detection to prompt generator
        if (this._errorRecovery) {
            this._errorRecovery.on('error', ({ component, error }) => {
                const prompt = this._promptGenerator.generatePrompt({
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
        if (this._issueDetector) {
            this._issueDetector.on('issueDetected', (issue) => {
                const prompt = this._promptGenerator.generatePrompt({
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
        
        // Hook up violation detector to prompt generator
        if (this._workflowViolationDetector) {
            this._workflowViolationDetector.on('violationDetected', (violation) => {
                const prompt = this._promptGenerator.generatePrompt({
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
        }
        
        // Verify compliance when prompt is marked as delivered
        this._stateStore.on('stateChanged', (event) => {
            if (event.path === 'ai.deliveredPrompts') {
                const deliveredPrompts = this._stateStore.getState('ai.deliveredPrompts') || [];
                if (deliveredPrompts.length > 0) {
                    const latestDeliveredId = deliveredPrompts[deliveredPrompts.length - 1];
                    const prompts = this._stateStore.getState('ai.prompts') || [];
                    const prompt = prompts.find(p => p.id === latestDeliveredId);
                    if (prompt) {
                        if (prompt._verificationTimeout) {
                            clearTimeout(prompt._verificationTimeout);
                        }
                        setTimeout(() => {
                            this.verifyPromptCompliance(prompt);
                        }, 30000);
                    }
                }
            }
        });
    }
    
    /**
     * LEARNING SYSTEM FIX: Lazy getter for codeAnalysis
     */
    get codeAnalysis() {
        if (!this._codeAnalysis) {
            try {
                // Ensure learningEngine is created
                this.learningEngine;
                
                const CodeAnalysisInstrumentation = require('./CodeAnalysisInstrumentation');
                this._codeAnalysis = new CodeAnalysisInstrumentation(
                    this.projectRoot,
                    this._stateStore,
                    this._learningEngine
                );
                this._errorRecovery.recordSuccess('codeAnalysis');
                this._initializedComponents.add('codeAnalysis');
            } catch (error) {
                this._errorRecovery.recordError('codeAnalysis', error);
                // Don't throw - code analysis is optional
            }
        }
        return this._codeAnalysis;
    }
    
    /**
     * LEARNING SYSTEM FIX: Lazy getter for workflowViolationDetector
     */
    get workflowViolationDetector() {
        if (!this._workflowViolationDetector) {
            try {
                // Ensure dependencies are created
                this.collaborationInterface;
                this.complianceVerifier;
                
                const AIWorkflowViolationDetector = require('./AIWorkflowViolationDetector');
                this._workflowViolationDetector = new AIWorkflowViolationDetector(
                    this._stateStore,
                    this._collaborationInterface,
                    this._complianceVerifier
                );
                this._errorRecovery.recordSuccess('workflowViolationDetector');
                this._initializedComponents.add('workflowViolationDetector');
                
                // Hook up code change tracker to workflow violation detector
                if (this._codeChangeTracker) {
                    this._codeChangeTracker.on('codeChanged', (data) => {
                        if (this._workflowViolationDetector && data.file) {
                            this._workflowViolationDetector.recordCodeChange(data.file, data.changeType || 'modified');
                        }
                    });
                }
            } catch (error) {
                this._errorRecovery.recordError('workflowViolationDetector', error);
                throw error;
            }
        }
        return this._workflowViolationDetector;
    }
    
    /**
     * LEARNING SYSTEM FIX: Lazy getter for serverErrorMonitor
     */
    get serverErrorMonitor() {
        if (!this._serverErrorMonitor) {
            try {
                // Ensure promptGenerator is created
                this.promptGenerator;
                
                const ServerErrorMonitor = require('./ServerErrorMonitor');
                this._serverErrorMonitor = new ServerErrorMonitor(
                    this._stateStore,
                    this._promptGenerator,
                    process.env.SERVER_URL || 'http://localhost:3000'
                );
                this._serverErrorMonitor.on('serverError', (error) => {
                    gameLogger.warn('BrokenPromise', '[PROMPT_SYSTEM] Server error detected, prompt generated', {
                        error: error.errorMessage,
                        consecutiveErrors: error.consecutiveErrors
                    });
                });
                this._serverErrorMonitor.start();
                this._initializedComponents.add('serverErrorMonitor');
            } catch (error) {
                this._errorRecovery.recordError('serverErrorMonitor', error);
                throw error;
            }
        }
        return this._serverErrorMonitor;
    }
    
    /**
     * LEARNING SYSTEM FIX: Lazy getter for commandExecutionMonitor
     */
    get commandExecutionMonitor() {
        if (!this._commandExecutionMonitor) {
            try {
                // Ensure dependencies are created
                this.issueDetector;
                this.learningEngine;
                
                const CommandExecutionMonitor = require('./CommandExecutionMonitor');
                this._commandExecutionMonitor = new CommandExecutionMonitor(
                    this._stateStore,
                    this._issueDetector,
                    this._learningEngine
                );
                this._errorRecovery.recordSuccess('commandExecutionMonitor');
                this._initializedComponents.add('commandExecutionMonitor');
            } catch (error) {
                this._errorRecovery.recordError('commandExecutionMonitor', error);
                throw error;
            }
        }
        return this._commandExecutionMonitor;
    }
    
    /**
     * LEARNING SYSTEM FIX: Lazy getter for workflowEnforcer
     */
    get workflowEnforcer() {
        if (!this._workflowEnforcer) {
            try {
                // Ensure dependencies are created
                this.rulesEnforcer;
                this.learningEngine;
                this.powerShellSyntaxValidator;
                
                const AIWorkflowEnforcer = require('./AIWorkflowEnforcer');
                this._workflowEnforcer = new AIWorkflowEnforcer(
                    this._stateStore,
                    this._rulesEnforcer,
                    this._learningEngine,
                    this._powerShellSyntaxValidator
                );
                this._errorRecovery.recordSuccess('workflowEnforcer');
                this._initializedComponents.add('workflowEnforcer');
            } catch (error) {
                this._errorRecovery.recordError('workflowEnforcer', error);
                throw error;
            }
        }
        return this._workflowEnforcer;
    }
    
    /**
     * LEARNING SYSTEM FIX: Lazy getter for integrityChecker
     */
    get integrityChecker() {
        if (!this._integrityChecker) {
            try {
                // Ensure issueDetector is created
                this.issueDetector;
                
                this._integrityChecker = new IntegrityChecker(
                    this.projectRoot,
                    this._stateStore,
                    this._issueDetector
                );
                this._initializedComponents.add('integrityChecker');
            } catch (error) {
                this._errorRecovery.recordError('integrityChecker', error);
                throw error;
            }
        }
        return this._integrityChecker;
    }
    
    /**
     * LEARNING SYSTEM FIX: Lazy getter for loggingIntegrityChecker
     */
    get loggingIntegrityChecker() {
        if (!this._loggingIntegrityChecker) {
            try {
                // Ensure issueDetector is created
                this.issueDetector;
                
                const LoggingIntegrityChecker = require('./LoggingIntegrityChecker');
                this._loggingIntegrityChecker = new LoggingIntegrityChecker(
                    this.projectRoot,
                    this._stateStore,
                    this._issueDetector
                );
                this._errorRecovery.recordSuccess('loggingIntegrityChecker');
                this._initializedComponents.add('loggingIntegrityChecker');
                
                // Start logging integrity checks
                this._loggingIntegrityChecker.startPeriodicChecks();
            } catch (error) {
                this._errorRecovery.recordError('loggingIntegrityChecker', error);
                throw error;
            }
        }
        return this._loggingIntegrityChecker;
    }
    
    /**
     * LEARNING SYSTEM FIX: Lazy getter for loggingAutoFix
     */
    get loggingAutoFix() {
        if (!this._loggingAutoFix) {
            try {
                // Ensure dependencies are created
                this.issueDetector;
                this.loggingIntegrityChecker;
                
                const LoggingAutoFix = require('./LoggingAutoFix');
                this._loggingAutoFix = new LoggingAutoFix(
                    this.projectRoot,
                    this._stateStore,
                    this._issueDetector,
                    this._loggingIntegrityChecker
                );
                this._errorRecovery.recordSuccess('loggingAutoFix');
                this._initializedComponents.add('loggingAutoFix');
            } catch (error) {
                this._errorRecovery.recordError('loggingAutoFix', error);
                throw error;
            }
        }
        return this._loggingAutoFix;
    }
    
    /**
     * LEARNING SYSTEM FIX: Lazy getter for codeEnhancementSystem
     */
    get codeEnhancementSystem() {
        if (!this._codeEnhancementSystem) {
            try {
                // Ensure issueDetector is created
                this.issueDetector;
                
                const CodeEnhancementSystem = require('./CodeEnhancementSystem');
                this._codeEnhancementSystem = new CodeEnhancementSystem(
                    this.projectRoot,
                    this._stateStore,
                    this._issueDetector
                );
                this._errorRecovery.recordSuccess('codeEnhancementSystem');
                this._initializedComponents.add('codeEnhancementSystem');
            } catch (error) {
                this._errorRecovery.recordError('codeEnhancementSystem', error);
                throw error;
            }
        }
        return this._codeEnhancementSystem;
    }
    
    /**
     * LEARNING SYSTEM FIX: Lazy getter for performanceAnalyzer
     */
    get performanceAnalyzer() {
        if (!this._performanceAnalyzer) {
            try {
                // Ensure dependencies are created
                this.issueDetector;
                this.fixTracker;
                this.learningEngine;
                
                const PerformanceAnalyzer = require('./PerformanceAnalyzer');
                this._performanceAnalyzer = new PerformanceAnalyzer(
                    this._stateStore,
                    this._issueDetector,
                    this._fixTracker,
                    this._learningEngine,
                    this._performanceMonitor
                );
                this._errorRecovery.recordSuccess('performanceAnalyzer');
                this._initializedComponents.add('performanceAnalyzer');
                
                // Start performance analysis
                this._performanceAnalyzer.startPeriodicAnalysis();
            } catch (error) {
                this._errorRecovery.recordError('performanceAnalyzer', error);
                throw error;
            }
        }
        return this._performanceAnalyzer;
    }
    
    /**
     * LEARNING SYSTEM FIX: Lazy getter for serverStateCapture
     */
    get serverStateCapture() {
        if (!this._serverStateCapture) {
            try {
                // Ensure dependencies are created
                this.issueDetector;
                
                this._serverStateCapture = new ServerStateCapture(
                    this._stateStore,
                    process.env.SERVER_URL || 'http://localhost:3000',
                    this._issueDetector,
                    this._errorRecovery
                );
                this._errorRecovery.recordSuccess('serverStateCapture');
                this._initializedComponents.add('serverStateCapture');
                
                // Start server state capture
                this._serverStateCapture.start();
            } catch (error) {
                this._errorRecovery.recordError('serverStateCapture', error);
                throw error;
            }
        }
        return this._serverStateCapture;
    }
    
    /**
     * LEARNING SYSTEM FIX: Lazy getter for unityStateReporter
     */
    get unityStateReporter() {
        if (!this._unityStateReporter) {
            try {
                // Ensure issueDetector is created
                this.issueDetector;
                
                this._unityStateReporter = new UnityStateReporter(
                    this._stateStore,
                    this._issueDetector
                );
                this._errorRecovery.recordSuccess('unityStateReporter');
                this._initializedComponents.add('unityStateReporter');
            } catch (error) {
                this._errorRecovery.recordError('unityStateReporter', error);
                throw error;
            }
        }
        return this._unityStateReporter;
    }
    
    /**
     * LEARNING SYSTEM FIX: Lazy getter for stateVerificationContracts
     */
    get stateVerificationContracts() {
        if (!this._stateVerificationContracts) {
            try {
                // Ensure issueDetector is created
                this.issueDetector;
                
                this._stateVerificationContracts = new StateVerificationContracts(
                    this._stateStore,
                    this._issueDetector
                );
                this._errorRecovery.recordSuccess('stateVerificationContracts');
                this._initializedComponents.add('stateVerificationContracts');
            } catch (error) {
                this._errorRecovery.recordError('stateVerificationContracts', error);
                throw error;
            }
        }
        return this._stateVerificationContracts;
    }
    
    /**
     * LEARNING SYSTEM FIX: Lazy getter for dependencyGraph
     */
    get dependencyGraph() {
        if (!this._dependencyGraph) {
            try {
                // Ensure issueDetector is created
                this.issueDetector;
                
                this._dependencyGraph = new DependencyGraph(
                    this._stateStore,
                    this._issueDetector
                );
                this._errorRecovery.recordSuccess('dependencyGraph');
                this._initializedComponents.add('dependencyGraph');
            } catch (error) {
                this._errorRecovery.recordError('dependencyGraph', error);
                throw error;
            }
        }
        return this._dependencyGraph;
    }
    
    /**
     * LEARNING SYSTEM FIX: Lazy getter for enhancedAnomalyDetection
     */
    get enhancedAnomalyDetection() {
        if (!this._enhancedAnomalyDetection) {
            try {
                // Ensure issueDetector is created
                this.issueDetector;
                
                this._enhancedAnomalyDetection = new EnhancedAnomalyDetection(
                    this._stateStore,
                    this._issueDetector
                );
                this._errorRecovery.recordSuccess('enhancedAnomalyDetection');
                this._initializedComponents.add('enhancedAnomalyDetection');
            } catch (error) {
                this._errorRecovery.recordError('enhancedAnomalyDetection', error);
                throw error;
            }
        }
        return this._enhancedAnomalyDetection;
    }
    
    /**
     * LEARNING SYSTEM FIX: Lazy getter for causalAnalysis
     */
    get causalAnalysis() {
        if (!this._causalAnalysis) {
            try {
                // Ensure dependencies are created
                this.issueDetector;
                this.dependencyGraph;
                
                this._causalAnalysis = new CausalAnalysis(
                    this._stateStore,
                    this._issueDetector,
                    this._dependencyGraph
                );
                this._errorRecovery.recordSuccess('causalAnalysis');
                this._initializedComponents.add('causalAnalysis');
            } catch (error) {
                this._errorRecovery.recordError('causalAnalysis', error);
                throw error;
            }
        }
        return this._causalAnalysis;
    }
    
    /**
     * LEARNING SYSTEM FIX: Lazy getter for autoFixEngine
     */
    get autoFixEngine() {
        if (!this._autoFixEngine) {
            try {
                // Ensure dependencies are created
                this.issueDetector;
                this.fixTracker;
                this.learningEngine;
                
                this._autoFixEngine = new AutoFixEngine(
                    this._stateStore,
                    this._issueDetector,
                    this._fixTracker,
                    this._learningEngine
                );
                this._errorRecovery.recordSuccess('autoFixEngine');
                this._initializedComponents.add('autoFixEngine');
                
                // Connect AutoFixEngine to collaboration interface
                if (this._collaborationInterface) {
                    this._setupAutoFixEngineListeners();
                }
            } catch (error) {
                this._errorRecovery.recordError('autoFixEngine', error);
                throw error;
            }
        }
        return this._autoFixEngine;
    }
    
    /**
     * LEARNING SYSTEM FIX: Setup auto-fix engine event listeners
     */
    _setupAutoFixEngineListeners() {
        if (!this._autoFixEngine || !this._collaborationInterface) return;
        
        // When learning system successfully fixes something, teach AI
        this._autoFixEngine.on('fixSucceeded', (data) => {
            const { issue, fix, result } = data;
            this._collaborationInterface.learningSystemSucceeded({
                type: 'auto_fix',
                method: fix.method,
                issueType: issue.type,
                result: result,
                timestamp: Date.now()
            });
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
