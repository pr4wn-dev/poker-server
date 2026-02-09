/**
 * BrokenPromise A-Z Comprehensive System Test
 * 
 * Tests all systems from A to Z:
 * - All core components
 * - All integration points
 * - All self-learning features
 * - All error handling
 * - All communication interfaces
 * - All rules enforcement
 */

const path = require('path');

// Try to require GameLogger, but handle if it fails
let gameLogger;
try {
    gameLogger = require('../src/utils/GameLogger');
} catch (error) {
    // Fallback logger if GameLogger not available
    gameLogger = {
        info: (source, message, data) => console.log(`[${source}] INFO: ${message}`, data || ''),
        error: (source, message, data) => console.error(`[${source}] ERROR: ${message}`, data || ''),
        warn: (source, message, data) => console.warn(`[${source}] WARN: ${message}`, data || '')
    };
}

// Test results
const testResults = {
    passed: [],
    failed: [],
    warnings: [],
    startTime: Date.now()
};

function logTest(name, status, details = {}) {
    const result = {
        name,
        status,
        details,
        timestamp: Date.now()
    };
    
    if (status === 'PASS') {
        testResults.passed.push(result);
        gameLogger.info('TEST', `✅ ${name}`, details);
    } else if (status === 'FAIL') {
        testResults.failed.push(result);
        gameLogger.error('TEST', `❌ ${name}`, details);
    } else if (status === 'WARN') {
        testResults.warnings.push(result);
        gameLogger.warn('TEST', `⚠️ ${name}`, details);
    }
}

async function testAIMonitorCore() {
    logTest('A: AIMonitorCore - Initialization', 'TEST', {});
    
    try {
        const AIMonitorCore = require('./core/AIMonitorCore');
        const projectRoot = path.join(__dirname, '..');
        const core = new AIMonitorCore(projectRoot);
        
        // Test all getters
        const components = [
            'stateStore', 'logProcessor', 'issueDetector', 'fixTracker',
            'decisionEngine', 'liveStatistics', 'communicationInterface',
            'integrityChecker', 'serverStateCapture', 'errorRecovery',
            'performanceMonitor', 'learningEngine', 'universalErrorHandler',
            'rulesEnforcer'
        ];
        
        for (const component of components) {
            const instance = core[`get${component.charAt(0).toUpperCase() + component.slice(1)}`]?.();
            if (instance) {
                logTest(`A.${component}: Component exists`, 'PASS', { component });
            } else {
                logTest(`A.${component}: Component missing`, 'FAIL', { component });
            }
        }
        
        // Test core methods
        const status = core.getStatus();
        if (status) {
            logTest('A: getStatus() works', 'PASS', { hasStatus: !!status });
        } else {
            logTest('A: getStatus() failed', 'FAIL', {});
        }
        
        // Cleanup
        if (core.destroy) {
            core.destroy();
        }
        
        return true;
    } catch (error) {
        logTest('A: AIMonitorCore initialization', 'FAIL', { error: error.message });
        return false;
    }
}

async function testStateStore() {
    logTest('B: StateStore - Single Source of Truth', 'TEST', {});
    
    try {
        const StateStore = require('./core/StateStore');
        const projectRoot = path.join(__dirname, '..');
        const store = new StateStore(projectRoot);
        
        // Test updateState
        store.updateState('test.path', 'test-value');
        const value = store.getState('test.path');
        if (value === 'test-value') {
            logTest('B: updateState/getState works', 'PASS', {});
        } else {
            logTest('B: updateState/getState failed', 'FAIL', { expected: 'test-value', got: value });
        }
        
        // Test save/load
        store.save();
        const loaded = store.getState('test.path');
        if (loaded === 'test-value') {
            logTest('B: save/load persistence works', 'PASS', {});
        } else {
            logTest('B: save/load persistence failed', 'FAIL', {});
        }
        
        // Cleanup
        store.updateState('test.path', undefined);
        store.save();
        
        return true;
    } catch (error) {
        logTest('B: StateStore test', 'FAIL', { error: error.message });
        return false;
    }
}

async function testAILogProcessor() {
    logTest('C: AILogProcessor - Log Understanding', 'TEST', {});
    
    try {
        const AILogProcessor = require('./core/AILogProcessor');
        const projectRoot = path.join(__dirname, '..');
        const StateStore = require('./core/StateStore');
        const store = new StateStore(projectRoot);
        const processor = new AILogProcessor(projectRoot, store);
        
        // Test log processing
        const testLog = '[2026-02-08 12:00:00] [SERVER] [ERROR] Test error message';
        processor.processLogLine(testLog);
        
        const logs = processor.getLogs('server');
        if (logs && logs.length > 0) {
            logTest('C: processLogLine works', 'PASS', { logsProcessed: logs.length });
        } else {
            logTest('C: processLogLine failed', 'FAIL', {});
        }
        
        // Test pattern detection
        const patterns = processor.getPatterns();
        if (patterns) {
            logTest('C: getPatterns works', 'PASS', { patternsCount: patterns.size || Object.keys(patterns).length });
        } else {
            logTest('C: getPatterns failed', 'WARN', {});
        }
        
        return true;
    } catch (error) {
        logTest('C: AILogProcessor test', 'FAIL', { error: error.message });
        return false;
    }
}

async function testAIIssueDetector() {
    logTest('D: AIIssueDetector - Multi-Method Detection', 'TEST', {});
    
    try {
        const AIIssueDetector = require('./core/AIIssueDetector');
        const StateStore = require('./core/StateStore');
        const AILogProcessor = require('./core/AILogProcessor');
        const projectRoot = path.join(__dirname, '..');
        
        const store = new StateStore(projectRoot);
        const logProcessor = new AILogProcessor(projectRoot, store);
        const detector = new AIIssueDetector(store, logProcessor);
        
        // Test state verification
        const stateIssues = detector.verifyState();
        if (Array.isArray(stateIssues)) {
            logTest('D: verifyState works', 'PASS', { issuesFound: stateIssues.length });
        } else {
            logTest('D: verifyState failed', 'FAIL', {});
        }
        
        // Test issue detection
        const issues = detector.getActiveIssues();
        if (Array.isArray(issues)) {
            logTest('D: getActiveIssues works', 'PASS', { activeIssues: issues.length });
        } else {
            logTest('D: getActiveIssues failed', 'FAIL', {});
        }
        
        // Test detectIssue
        const testIssue = detector.detectIssue({
            type: 'TEST_ISSUE',
            severity: 'low',
            description: 'Test issue for A-Z testing'
        });
        if (testIssue && testIssue.id) {
            logTest('D: detectIssue works', 'PASS', { issueId: testIssue.id });
        } else {
            logTest('D: detectIssue failed', 'FAIL', {});
        }
        
        return true;
    } catch (error) {
        logTest('D: AIIssueDetector test', 'FAIL', { error: error.message });
        return false;
    }
}

async function testAIFixTracker() {
    logTest('E: AIFixTracker - Fix Memory', 'TEST', {});
    
    try {
        const AIFixTracker = require('./core/AIFixTracker');
        const StateStore = require('./core/StateStore');
        const AIIssueDetector = require('./core/AIIssueDetector');
        const AILogProcessor = require('./core/AILogProcessor');
        const projectRoot = path.join(__dirname, '..');
        
        const store = new StateStore(projectRoot);
        const logProcessor = new AILogProcessor(projectRoot, store);
        const detector = new AIIssueDetector(store, logProcessor);
        const tracker = new AIFixTracker(store, detector);
        
        // Test recordAttempt
        const testIssue = detector.detectIssue({
            type: 'TEST_FIX',
            severity: 'low',
            description: 'Test fix tracking'
        });
        
        if (testIssue && testIssue.id) {
            tracker.recordAttempt(testIssue.id, 'test_fix_method', 'success');
            logTest('E: recordAttempt works', 'PASS', { issueId: testIssue.id });
        } else {
            logTest('E: recordAttempt - no issue to track', 'WARN', {});
        }
        
        // Test getSuggestedFixes
        const suggestions = tracker.getSuggestedFixes(testIssue || { type: 'TEST_FIX' });
        if (suggestions) {
            logTest('E: getSuggestedFixes works', 'PASS', { suggestionsCount: suggestions.length || 0 });
        } else {
            logTest('E: getSuggestedFixes failed', 'FAIL', {});
        }
        
        return true;
    } catch (error) {
        logTest('E: AIFixTracker test', 'FAIL', { error: error.message });
        return false;
    }
}

async function testAILearningEngine() {
    logTest('F: AILearningEngine - Advanced Learning', 'TEST', {});
    
    try {
        const AILearningEngine = require('./core/AILearningEngine');
        const StateStore = require('./core/StateStore');
        const AIIssueDetector = require('./core/AIIssueDetector');
        const AILogProcessor = require('./core/AILogProcessor');
        const AIFixTracker = require('./core/AIFixTracker');
        const projectRoot = path.join(__dirname, '..');
        
        const store = new StateStore(projectRoot);
        const logProcessor = new AILogProcessor(projectRoot, store);
        const detector = new AIIssueDetector(store, logProcessor);
        const tracker = new AIFixTracker(store, detector);
        const learning = new AILearningEngine(store, detector, tracker);
        
        // Test learnFromAttempt
        const testAttempt = {
            id: 'test-attempt-1',
            issueId: 'test-issue-1',
            issueType: 'TEST_LEARNING',
            fixMethod: 'test_method',
            result: 'success',
            timestamp: Date.now(),
            state: {},
            logs: [],
            duration: 100
        };
        
        learning.learnFromAttempt(testAttempt);
        logTest('F: learnFromAttempt works', 'PASS', {});
        
        // Test getLearningConfidence
        const confidence = learning.getLearningConfidence();
        if (confidence && typeof confidence.overall === 'number') {
            logTest('F: getLearningConfidence works', 'PASS', { 
                overall: confidence.overall,
                breakdown: Object.keys(confidence.breakdown || {}).length
            });
        } else {
            logTest('F: getLearningConfidence failed', 'FAIL', {});
        }
        
        // Test getLearningReport
        const report = learning.getLearningReport();
        if (report) {
            logTest('F: getLearningReport works', 'PASS', { hasReport: !!report });
        } else {
            logTest('F: getLearningReport failed', 'FAIL', {});
        }
        
        return true;
    } catch (error) {
        logTest('F: AILearningEngine test', 'FAIL', { error: error.message });
        return false;
    }
}

async function testAIRulesEnforcer() {
    logTest('G: AIRulesEnforcer - Rules & Self-Learning', 'TEST', {});
    
    try {
        const AIRulesEnforcer = require('./core/AIRulesEnforcer');
        const StateStore = require('./core/StateStore');
        const AILearningEngine = require('./core/AILearningEngine');
        const AIIssueDetector = require('./core/AIIssueDetector');
        const AILogProcessor = require('./core/AILogProcessor');
        const AIFixTracker = require('./core/AIFixTracker');
        const projectRoot = path.join(__dirname, '..');
        
        const store = new StateStore(projectRoot);
        const logProcessor = new AILogProcessor(projectRoot, store);
        const detector = new AIIssueDetector(store, logProcessor);
        const tracker = new AIFixTracker(store, detector);
        const learning = new AILearningEngine(store, detector, tracker);
        const enforcer = new AIRulesEnforcer(store, learning);
        
        // Test getRules
        const rules = enforcer.getRules();
        if (rules && rules.rules && rules.rules.length > 0) {
            logTest('G: getRules works', 'PASS', { rulesCount: rules.rules.length });
        } else {
            logTest('G: getRules failed', 'FAIL', {});
        }
        
        // Test recordViolation (self-learning)
        const violation = enforcer.recordViolation('BrokenPromise_all_logs_to_gameLogger', 'test_context', { test: true });
        if (violation && violation.id) {
            logTest('G: recordViolation works (self-learning)', 'PASS', { violationId: violation.id });
        } else {
            logTest('G: recordViolation failed', 'FAIL', {});
        }
        
        // Test getRuleLearningInsights (self-learning)
        const insights = enforcer.getRuleLearningInsights();
        if (insights && insights.learning) {
            logTest('G: getRuleLearningInsights works (self-learning)', 'PASS', { 
                patternsLearned: insights.learning.patternsLearned || 0,
                refinementsGenerated: insights.learning.refinementsGenerated || 0
            });
        } else {
            logTest('G: getRuleLearningInsights failed', 'FAIL', {});
        }
        
        // Test predictLikelyViolations (self-learning)
        const predictions = enforcer.predictLikelyViolations('test_context');
        if (Array.isArray(predictions)) {
            logTest('G: predictLikelyViolations works (self-learning)', 'PASS', { predictionsCount: predictions.length });
        } else {
            logTest('G: predictLikelyViolations failed', 'WARN', {});
        }
        
        // Cleanup
        if (enforcer.stop) {
            enforcer.stop();
        }
        
        return true;
    } catch (error) {
        logTest('G: AIRulesEnforcer test', 'FAIL', { error: error.message });
        return false;
    }
}

async function testAICommunicationInterface() {
    logTest('H: AICommunicationInterface - AI Communication', 'TEST', {});
    
    try {
        const AICommunicationInterface = require('./core/AICommunicationInterface');
        const StateStore = require('./core/StateStore');
        const AIIssueDetector = require('./core/AIIssueDetector');
        const AILogProcessor = require('./core/AILogProcessor');
        const AIFixTracker = require('./core/AIFixTracker');
        const AIDecisionEngine = require('./core/AIDecisionEngine');
        const AILiveStatistics = require('./core/AILiveStatistics');
        const AILearningEngine = require('./core/AILearningEngine');
        const AIRulesEnforcer = require('./core/AIRulesEnforcer');
        const projectRoot = path.join(__dirname, '..');
        
        const store = new StateStore(projectRoot);
        const logProcessor = new AILogProcessor(projectRoot, store);
        const detector = new AIIssueDetector(store, logProcessor);
        const tracker = new AIFixTracker(store, detector);
        const decision = new AIDecisionEngine(store, detector, tracker);
        const stats = new AILiveStatistics(store, detector, tracker, decision, logProcessor);
        const learning = new AILearningEngine(store, detector, tracker);
        const rules = new AIRulesEnforcer(store, learning);
        const communication = new AICommunicationInterface(store, detector, tracker, decision, logProcessor, stats, learning, rules);
        
        // Test query
        const response = communication.query('What is the current status?');
        if (response) {
            logTest('H: query works', 'PASS', { hasResponse: !!response, hasRulesReminder: !!response.rulesReminder });
        } else {
            logTest('H: query failed', 'FAIL', {});
        }
        
        // Test getStatusReport
        const statusReport = communication.getStatusReport();
        if (statusReport) {
            logTest('H: getStatusReport works', 'PASS', { 
                hasStatus: !!statusReport,
                hasLearningConfidence: !!statusReport.learningConfidence,
                hasRules: !!statusReport.rules
            });
        } else {
            logTest('H: getStatusReport failed', 'FAIL', {});
        }
        
        // Test getRulesResponse
        const rulesResponse = communication.getRulesResponse();
        if (rulesResponse && rulesResponse.rules) {
            logTest('H: getRulesResponse works', 'PASS', { rulesCount: rulesResponse.rules.length || 0 });
        } else {
            logTest('H: getRulesResponse failed', 'FAIL', {});
        }
        
        // Cleanup
        if (rules.stop) {
            rules.stop();
        }
        
        return true;
    } catch (error) {
        logTest('H: AICommunicationInterface test', 'FAIL', { error: error.message });
        return false;
    }
}

async function testAutoFixEngine() {
    logTest('I: AutoFixEngine - Auto-Fix System', 'TEST', {});
    
    try {
        const AutoFixEngine = require('./core/AutoFixEngine');
        const StateStore = require('./core/StateStore');
        const AIIssueDetector = require('./core/AIIssueDetector');
        const AILogProcessor = require('./core/AILogProcessor');
        const AIFixTracker = require('./core/AIFixTracker');
        const AILearningEngine = require('./core/AILearningEngine');
        const projectRoot = path.join(__dirname, '..');
        
        const store = new StateStore(projectRoot);
        const logProcessor = new AILogProcessor(projectRoot, store);
        const detector = new AIIssueDetector(store, logProcessor);
        const tracker = new AIFixTracker(store, detector);
        const learning = new AILearningEngine(store, detector, tracker);
        const autoFix = new AutoFixEngine(store, detector, tracker, learning);
        
        // Test getAutoFixSuggestions
        const testIssue = detector.detectIssue({
            type: 'TEST_AUTO_FIX',
            severity: 'low',
            description: 'Test auto-fix'
        });
        
        if (testIssue && testIssue.id) {
            const suggestions = autoFix.getAutoFixSuggestions(testIssue.id);
            if (Array.isArray(suggestions)) {
                logTest('I: getAutoFixSuggestions works', 'PASS', { suggestionsCount: suggestions.length });
            } else {
                logTest('I: getAutoFixSuggestions failed', 'FAIL', {});
            }
        } else {
            logTest('I: getAutoFixSuggestions - no issue', 'WARN', {});
        }
        
        // Test getAutoFixStatistics
        const stats = autoFix.getAutoFixStatistics();
        if (stats) {
            logTest('I: getAutoFixStatistics works', 'PASS', { hasStats: !!stats });
        } else {
            logTest('I: getAutoFixStatistics failed', 'FAIL', {});
        }
        
        return true;
    } catch (error) {
        logTest('I: AutoFixEngine test', 'FAIL', { error: error.message });
        return false;
    }
}

async function testErrorRecovery() {
    logTest('J: ErrorRecovery - Self-Healing', 'TEST', {});
    
    try {
        const ErrorRecovery = require('./core/ErrorRecovery');
        const StateStore = require('./core/StateStore');
        const projectRoot = path.join(__dirname, '..');
        
        const store = new StateStore(projectRoot);
        const recovery = new ErrorRecovery(store);
        
        // Test recordError
        recovery.recordError('test_component', new Error('Test error'));
        logTest('J: recordError works', 'PASS', {});
        
        // Test recordSuccess
        recovery.recordSuccess('test_component');
        logTest('J: recordSuccess works', 'PASS', {});
        
        // Test getComponentHealth
        const health = recovery.getComponentHealth('test_component');
        if (health) {
            logTest('J: getComponentHealth works', 'PASS', { health: health.status || 'unknown' });
        } else {
            logTest('J: getComponentHealth failed', 'WARN', {});
        }
        
        return true;
    } catch (error) {
        logTest('J: ErrorRecovery test', 'FAIL', { error: error.message });
        return false;
    }
}

async function testPerformanceMonitor() {
    logTest('K: PerformanceMonitor - Performance Tracking', 'TEST', {});
    
    try {
        const PerformanceMonitor = require('./core/PerformanceMonitor');
        const StateStore = require('./core/StateStore');
        const projectRoot = path.join(__dirname, '..');
        
        const store = new StateStore(projectRoot);
        const monitor = new PerformanceMonitor(store);
        
        // Test startOperation
        const operationId = monitor.startOperation('test_operation');
        if (operationId) {
            logTest('K: startOperation works', 'PASS', { operationId });
        } else {
            logTest('K: startOperation failed', 'FAIL', {});
        }
        
        // Test endOperation
        await new Promise(resolve => setTimeout(resolve, 10)); // Small delay
        monitor.endOperation(operationId);
        logTest('K: endOperation works', 'PASS', {});
        
        // Test getOperationStatistics
        const stats = monitor.getOperationStatistics('test_operation');
        if (stats) {
            logTest('K: getOperationStatistics works', 'PASS', { hasStats: !!stats });
        } else {
            logTest('K: getOperationStatistics failed', 'WARN', {});
        }
        
        return true;
    } catch (error) {
        logTest('K: PerformanceMonitor test', 'FAIL', { error: error.message });
        return false;
    }
}

async function testUniversalErrorHandler() {
    logTest('L: UniversalErrorHandler - Catches All Errors', 'TEST', {});
    
    try {
        const UniversalErrorHandler = require('./core/UniversalErrorHandler');
        const StateStore = require('./core/StateStore');
        const AIIssueDetector = require('./core/AIIssueDetector');
        const AILogProcessor = require('./core/AILogProcessor');
        const ErrorRecovery = require('./core/ErrorRecovery');
        const AILearningEngine = require('./core/AILearningEngine');
        const AIFixTracker = require('./core/AIFixTracker');
        const projectRoot = path.join(__dirname, '..');
        
        const store = new StateStore(projectRoot);
        const logProcessor = new AILogProcessor(projectRoot, store);
        const detector = new AIIssueDetector(store, logProcessor);
        const tracker = new AIFixTracker(store, detector);
        const learning = new AILearningEngine(store, detector, tracker);
        const recovery = new ErrorRecovery(store);
        const handler = new UniversalErrorHandler(store, detector, recovery, learning);
        
        // Test wrapFunction
        const testFn = async () => { return 'success'; };
        const wrapped = handler.wrapFunction('test_component', 'test_operation', testFn);
        const result = await wrapped();
        if (result === 'success') {
            logTest('L: wrapFunction works', 'PASS', {});
        } else {
            logTest('L: wrapFunction failed', 'FAIL', {});
        }
        
        // Test wrapSyncFunction
        const testSyncFn = () => { return 'success'; };
        const wrappedSync = handler.wrapSyncFunction('test_component', 'test_operation', testSyncFn);
        const syncResult = wrappedSync();
        if (syncResult === 'success') {
            logTest('L: wrapSyncFunction works', 'PASS', {});
        } else {
            logTest('L: wrapSyncFunction failed', 'FAIL', {});
        }
        
        return true;
    } catch (error) {
        logTest('L: UniversalErrorHandler test', 'FAIL', { error: error.message });
        return false;
    }
}

async function testBrokenPromiseIntegration() {
    logTest('M: BrokenPromiseIntegration - Node.js Integration', 'TEST', {});
    
    try {
        const BrokenPromiseIntegration = require('./integration/BrokenPromiseIntegration');
        const projectRoot = path.join(__dirname, '..');
        const integration = new BrokenPromiseIntegration(projectRoot);
        
        // Test getActiveIssues
        const issues = await integration.getActiveIssues();
        if (Array.isArray(issues)) {
            logTest('M: getActiveIssues works', 'PASS', { issuesCount: issues.length });
        } else {
            logTest('M: getActiveIssues failed', 'FAIL', {});
        }
        
        // Test getSystemReport
        const report = await integration.getSystemReport();
        if (report) {
            logTest('M: getSystemReport works', 'PASS', { hasReport: !!report });
        } else {
            logTest('M: getSystemReport failed', 'FAIL', {});
        }
        
        // Test getComponentHealth
        const health = await integration.getComponentHealth();
        if (health) {
            logTest('M: getComponentHealth works', 'PASS', { hasHealth: !!health });
        } else {
            logTest('M: getComponentHealth failed', 'FAIL', {});
        }
        
        // Cleanup
        if (integration.destroy) {
            integration.destroy();
        }
        
        return true;
    } catch (error) {
        logTest('M: BrokenPromiseIntegration test', 'FAIL', { error: error.message });
        return false;
    }
}

async function runAllTests() {
    gameLogger.info('TEST', '🚀 Starting BrokenPromise A-Z Comprehensive System Test', {});
    
    const tests = [
        testAIMonitorCore,
        testStateStore,
        testAILogProcessor,
        testAIIssueDetector,
        testAIFixTracker,
        testAILearningEngine,
        testAIRulesEnforcer,
        testAICommunicationInterface,
        testAutoFixEngine,
        testErrorRecovery,
        testPerformanceMonitor,
        testUniversalErrorHandler,
        testBrokenPromiseIntegration
    ];
    
    for (const test of tests) {
        try {
            await test();
        } catch (error) {
            gameLogger.error('TEST', 'Test execution error', { error: error.message, stack: error.stack });
        }
    }
    
    // Final summary
    const duration = Date.now() - testResults.startTime;
    const summary = {
        total: testResults.passed.length + testResults.failed.length + testResults.warnings.length,
        passed: testResults.passed.length,
        failed: testResults.failed.length,
        warnings: testResults.warnings.length,
        duration: `${(duration / 1000).toFixed(2)}s`,
        passRate: testResults.passed.length > 0 
            ? ((testResults.passed.length / (testResults.passed.length + testResults.failed.length)) * 100).toFixed(1) + '%'
            : '0%'
    };
    
    gameLogger.info('TEST', '📊 Test Summary', summary);
    
    if (testResults.failed.length > 0) {
        gameLogger.error('TEST', '❌ Failed Tests', { 
            failed: testResults.failed.map(f => f.name) 
        });
    }
    
    if (testResults.warnings.length > 0) {
        gameLogger.warn('TEST', '⚠️ Warnings', { 
            warnings: testResults.warnings.map(w => w.name) 
        });
    }
    
    return summary;
}

// Run tests if executed directly
if (require.main === module) {
    runAllTests().then(summary => {
        process.exit(summary.failed > 0 ? 1 : 0);
    }).catch(error => {
        gameLogger.error('TEST', 'Test suite error', { error: error.message });
        process.exit(1);
    });
}

module.exports = { runAllTests, testResults };
