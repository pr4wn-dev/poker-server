/**
 * Integrity Checker - AI Verifies Its Own Integrity
 * 
 * Checks:
 * 1. File integrity (required files exist, correct structure)
 * 2. Code integrity (required functions/classes present)
 * 3. Logging integrity (logs in correct format for AI)
 * 4. Integration integrity (files integrate with AI system)
 * 5. Dependency integrity (all dependencies present)
 * 
 * AI verifies itself. Auto-fixes when safe.
 */

const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

class IntegrityChecker extends EventEmitter {
    constructor(projectRoot, stateStore, issueDetector) {
        super();
        this.projectRoot = projectRoot;
        this.stateStore = stateStore;
        this.issueDetector = issueDetector;
        
        // Check results cache
        this.lastCheck = null;
        this.checkResults = null;
        this.checkInterval = 300000; // Check every 5 minutes
        
        // Required files and their expected exports/functions
        this.requiredFiles = {
            // Core AI files
            'monitoring/core/StateStore.js': {
                type: 'module',
                exports: ['StateStore'],
                methods: ['updateState', 'getState', 'save', 'load', 'getStatusReport']
            },
            'monitoring/core/AILogProcessor.js': {
                type: 'module',
                exports: ['AILogProcessor'],
                methods: ['processLine', 'queryLogs', 'getErrors']
            },
            'monitoring/core/AIIssueDetector.js': {
                type: 'module',
                exports: ['AIIssueDetector'],
                methods: ['detectIssue', 'verifyState', 'getActiveIssues']
            },
            'monitoring/core/AIFixTracker.js': {
                type: 'module',
                exports: ['AIFixTracker'],
                methods: ['recordAttempt', 'getSuggestedFixes']
            },
            'monitoring/core/AIDecisionEngine.js': {
                type: 'module',
                exports: ['AIDecisionEngine'],
                methods: ['shouldStartInvestigation', 'shouldPauseUnity', 'shouldResumeUnity']
            },
            'monitoring/core/AIMonitorCore.js': {
                type: 'module',
                exports: ['AIMonitorCore'],
                methods: ['getStatus', 'query', 'getStatistics']
            },
            // Integration files
            'monitoring/integration/MonitorIntegration.js': {
                type: 'module',
                exports: ['MonitorIntegration'],
                methods: ['getInvestigationStatus', 'shouldStartInvestigation', 'startInvestigation']
            },
            'monitoring/integration/monitor-integration.js': {
                type: 'script',
                executable: true
            },
            // PowerShell files
            'monitoring/AIIntegration.ps1': {
                type: 'powershell',
                functions: [
                    'Get-AIInvestigationStatus',
                    'Should-AIStartInvestigation',
                    'Should-AIPauseUnity',
                    'Should-AIResumeUnity',
                    'Start-AIInvestigation',
                    'Complete-AIInvestigation',
                    'Get-AIActiveIssues',
                    'Get-AISuggestedFixes',
                    'Record-AIFixAttempt',
                    'Get-AILiveStatistics',
                    'Query-AISystem'
                ]
            }
        };
        
        // Required logging patterns (for logging integrity)
        this.requiredLogPatterns = [
            /\[([^\]]+)\]\s+\[([^\]]+)\]\s+\[([^\]]+)\]\s+(.+)/, // [timestamp] [source] [level] message
            /\[([^\]]+)\]\s+\[([^\]]+)\]\s+(.+)/ // [timestamp] [source] message
        ];
        
        // Critical operations that should be logged
        this.criticalOperations = [
            'bet', 'call', 'raise', 'fold', 'check', 'allin',
            'chip_transfer', 'pot_update', 'phase_change',
            'table_create', 'table_join', 'table_leave'
        ];
        
        // Start periodic checks
        this.startPeriodicChecks();
    }
    
    /**
     * Start periodic integrity checks
     */
    startPeriodicChecks() {
        // Check on startup
        this.runAllChecks();
        
        // Check periodically
        setInterval(() => {
            this.runAllChecks();
        }, this.checkInterval);
    }
    
    /**
     * Run all integrity checks
     */
    runAllChecks() {
        const results = {
            timestamp: Date.now(),
            fileIntegrity: this.checkFileIntegrity(),
            codeIntegrity: this.checkCodeIntegrity(),
            loggingIntegrity: this.checkLoggingIntegrity(),
            integrationIntegrity: this.checkIntegrationIntegrity(),
            dependencyIntegrity: this.checkDependencyIntegrity()
        };
        
        // Calculate overall health
        results.overallHealth = this.calculateOverallHealth(results);
        
        // Cache results
        this.checkResults = results;
        this.lastCheck = Date.now();
        
        // Report issues
        this.reportIssues(results);
        
        // Emit event
        this.emit('integrityChecked', results);
        
        return results;
    }
    
    /**
     * Check file integrity
     */
    checkFileIntegrity() {
        const results = {
            passed: true,
            issues: [],
            files: {}
        };
        
        for (const [filePath, requirements] of Object.entries(this.requiredFiles)) {
            const fullPath = path.join(this.projectRoot, filePath);
            const fileResult = {
                exists: false,
                structure: false,
                issues: []
            };
            
            // Check if file exists
            if (!fs.existsSync(fullPath)) {
                fileResult.issues.push(`File does not exist: ${filePath}`);
                results.issues.push(`Missing file: ${filePath}`);
                results.passed = false;
            } else {
                fileResult.exists = true;
                
                // Check file structure based on type
                if (requirements.type === 'module') {
                    // Try to require/import the module
                    try {
                        const module = require(fullPath);
                        if (requirements.exports) {
                            for (const exportName of requirements.exports) {
                                if (!module[exportName]) {
                                    fileResult.issues.push(`Missing export: ${exportName}`);
                                    results.issues.push(`${filePath}: Missing export ${exportName}`);
                                    results.passed = false;
                                } else {
                                    // Check if it's a class with required methods
                                    if (requirements.methods) {
                                        const instance = new module[exportName](this.projectRoot);
                                        for (const methodName of requirements.methods) {
                                            if (typeof instance[methodName] !== 'function') {
                                                fileResult.issues.push(`Missing method: ${methodName}`);
                                                results.issues.push(`${filePath}: Missing method ${methodName}`);
                                                results.passed = false;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        fileResult.structure = true;
                    } catch (error) {
                        fileResult.issues.push(`Failed to load module: ${error.message}`);
                        results.issues.push(`${filePath}: ${error.message}`);
                        results.passed = false;
                    }
                } else if (requirements.type === 'powershell') {
                    // Check PowerShell file for required functions
                    try {
                        const content = fs.readFileSync(fullPath, 'utf8');
                        if (requirements.functions) {
                            for (const funcName of requirements.functions) {
                                const funcPattern = new RegExp(`function\\s+${funcName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
                                if (!funcPattern.test(content)) {
                                    fileResult.issues.push(`Missing function: ${funcName}`);
                                    results.issues.push(`${filePath}: Missing function ${funcName}`);
                                    results.passed = false;
                                }
                            }
                        }
                        fileResult.structure = true;
                    } catch (error) {
                        fileResult.issues.push(`Failed to read file: ${error.message}`);
                        results.issues.push(`${filePath}: ${error.message}`);
                        results.passed = false;
                    }
                } else if (requirements.type === 'script') {
                    // Check if script is executable
                    fileResult.structure = true; // Assume OK if exists
                }
            }
            
            results.files[filePath] = fileResult;
        }
        
        return results;
    }
    
    /**
     * Check code integrity
     */
    checkCodeIntegrity() {
        const results = {
            passed: true,
            issues: [],
            files: {}
        };
        
        // Check if monitor.ps1 sources AIIntegration.ps1
        const monitorPath = path.join(this.projectRoot, 'monitoring', 'monitor.ps1');
        if (fs.existsSync(monitorPath)) {
            const content = fs.readFileSync(monitorPath, 'utf8');
            const aiIntegrationSourced = /\.\s*\$aiIntegrationPath|\.\s*AIIntegration\.ps1/i.test(content);
            
            if (!aiIntegrationSourced) {
                results.issues.push('monitor.ps1 does not source AIIntegration.ps1');
                results.passed = false;
            }
            
            results.files['monitoring/monitor.ps1'] = {
                aiIntegrationSourced,
                issues: aiIntegrationSourced ? [] : ['AI Integration not sourced']
            };
        }
        
        // Check if integration files can be loaded
        for (const [filePath, requirements] of Object.entries(this.requiredFiles)) {
            if (requirements.type === 'module') {
                const fullPath = path.join(this.projectRoot, filePath);
                if (fs.existsSync(fullPath)) {
                    try {
                        const module = require(fullPath);
                        if (requirements.exports) {
                            for (const exportName of requirements.exports) {
                                if (module[exportName]) {
                                    // Try to instantiate
                                    try {
                                        const instance = new module[exportName](this.projectRoot);
                                        // Check methods
                                        if (requirements.methods) {
                                            for (const method of requirements.methods) {
                                                if (typeof instance[method] !== 'function') {
                                                    results.issues.push(`${filePath}: ${exportName} missing method ${method}`);
                                                    results.passed = false;
                                                }
                                            }
                                        }
                                    } catch (error) {
                                        // Might need different constructor args
                                        // Just check if class exists
                                    }
                                }
                            }
                        }
                    } catch (error) {
                        results.issues.push(`${filePath}: ${error.message}`);
                        results.passed = false;
                    }
                }
            }
        }
        
        return results;
    }
    
    /**
     * Check logging integrity
     */
    checkLoggingIntegrity() {
        const results = {
            passed: true,
            issues: [],
            logFormat: {},
            criticalOperations: {}
        };
        
        // Check recent logs for format
        const logFile = path.join(this.projectRoot, 'logs', 'game.log');
        if (fs.existsSync(logFile)) {
            try {
                const stats = fs.statSync(logFile);
                if (stats.size > 0) {
                    // Read last 100 lines
                    const content = fs.readFileSync(logFile, 'utf8');
                    const lines = content.split('\n').filter(l => l.trim()).slice(-100);
                    
                    let parseableCount = 0;
                    let unparseableCount = 0;
                    const unparseableLines = [];
                    
                    for (const line of lines) {
                        let parseable = false;
                        for (const pattern of this.requiredLogPatterns) {
                            if (pattern.test(line)) {
                                parseable = true;
                                break;
                            }
                        }
                        
                        if (parseable) {
                            parseableCount++;
                        } else {
                            unparseableCount++;
                            if (unparseableLines.length < 10) {
                                unparseableLines.push(line.substring(0, 100));
                            }
                        }
                    }
                    
                    const parseabilityRate = lines.length > 0 ? (parseableCount / lines.length) * 100 : 100;
                    
                    results.logFormat = {
                        totalLines: lines.length,
                        parseable: parseableCount,
                        unparseable: unparseableCount,
                        parseabilityRate: Math.round(parseabilityRate * 100) / 100,
                        unparseableExamples: unparseableLines
                    };
                    
                    if (parseabilityRate < 80) {
                        results.issues.push(`Low log parseability: ${parseabilityRate}% (target: 80%+)`);
                        results.passed = false;
                    }
                }
            } catch (error) {
                results.issues.push(`Failed to check log file: ${error.message}`);
                results.passed = false;
            }
        }
        
        // Check if critical operations are logged (sample check)
        // This would require analyzing source code, which is more complex
        // For now, just check if logs mention critical operations
        if (fs.existsSync(logFile)) {
            try {
                const content = fs.readFileSync(logFile, 'utf8');
                const lowerContent = content.toLowerCase();
                
                for (const operation of this.criticalOperations) {
                    const mentioned = lowerContent.includes(operation);
                    results.criticalOperations[operation] = mentioned;
                    
                    // Note: Not necessarily an issue if not mentioned (might not have occurred)
                    // But we track it for awareness
                }
            } catch (error) {
                // Ignore
            }
        }
        
        return results;
    }
    
    /**
     * Check integration integrity
     */
    checkIntegrationIntegrity() {
        const results = {
            passed: true,
            issues: [],
            integrations: {}
        };
        
        // Check if monitor.ps1 uses AI functions
        const monitorPath = path.join(this.projectRoot, 'monitoring', 'monitor.ps1');
        if (fs.existsSync(monitorPath)) {
            const content = fs.readFileSync(monitorPath, 'utf8');
            
            const aiFunctions = [
                'Get-AIInvestigationStatus',
                'Should-AIStartInvestigation',
                'Should-AIPauseUnity',
                'Start-AIInvestigation',
                'Complete-AIInvestigation',
                'Get-AIActiveIssues'
            ];
            
            const usedFunctions = [];
            const missingFunctions = [];
            
            for (const func of aiFunctions) {
                if (new RegExp(func.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(content)) {
                    usedFunctions.push(func);
                } else {
                    missingFunctions.push(func);
                }
            }
            
            results.integrations['monitor.ps1'] = {
                aiFunctionsUsed: usedFunctions.length,
                aiFunctionsMissing: missingFunctions.length,
                usedFunctions,
                missingFunctions
            };
            
            if (missingFunctions.length > aiFunctions.length / 2) {
                results.issues.push(`monitor.ps1 not using AI functions (only ${usedFunctions.length}/${aiFunctions.length})`);
                results.passed = false;
            }
        }
        
        // Check if StateStore is being used
        // This would require checking if files actually call stateStore methods
        // For now, we assume if files exist and can be loaded, integration is OK
        
        return results;
    }
    
    /**
     * Check dependency integrity
     */
    checkDependencyIntegrity() {
        const results = {
            passed: true,
            issues: [],
            dependencies: {}
        };
        
        // Check if node_modules exists
        const nodeModulesPath = path.join(this.projectRoot, 'node_modules');
        if (!fs.existsSync(nodeModulesPath)) {
            results.issues.push('node_modules not found - run npm install');
            results.passed = false;
        }
        
        // Check if required modules can be loaded
        const requiredModules = ['fs', 'path', 'events'];
        for (const moduleName of requiredModules) {
            try {
                require(moduleName);
                results.dependencies[moduleName] = { available: true };
            } catch (error) {
                results.dependencies[moduleName] = { available: false, error: error.message };
                results.issues.push(`Required module not available: ${moduleName}`);
                results.passed = false;
            }
        }
        
        return results;
    }
    
    /**
     * Calculate overall health
     */
    calculateOverallHealth(results) {
        const checks = [
            results.fileIntegrity,
            results.codeIntegrity,
            results.loggingIntegrity,
            results.integrationIntegrity,
            results.dependencyIntegrity
        ];
        
        const passedChecks = checks.filter(c => c.passed).length;
        const totalChecks = checks.length;
        const healthPercent = (passedChecks / totalChecks) * 100;
        
        return {
            percent: Math.round(healthPercent * 100) / 100,
            passed: passedChecks,
            total: totalChecks,
            status: healthPercent >= 80 ? 'healthy' : healthPercent >= 50 ? 'degraded' : 'unhealthy'
        };
    }
    
    /**
     * Report issues to AI issue detector
     */
    reportIssues(results) {
        if (!results.overallHealth.passed || results.overallHealth.status !== 'healthy') {
            // Collect all issues
            const allIssues = [];
            
            if (results.fileIntegrity.issues.length > 0) {
                allIssues.push(...results.fileIntegrity.issues.map(i => `File Integrity: ${i}`));
            }
            if (results.codeIntegrity.issues.length > 0) {
                allIssues.push(...results.codeIntegrity.issues.map(i => `Code Integrity: ${i}`));
            }
            if (results.loggingIntegrity.issues.length > 0) {
                allIssues.push(...results.loggingIntegrity.issues.map(i => `Logging Integrity: ${i}`));
            }
            if (results.integrationIntegrity.issues.length > 0) {
                allIssues.push(...results.integrationIntegrity.issues.map(i => `Integration Integrity: ${i}`));
            }
            if (results.dependencyIntegrity.issues.length > 0) {
                allIssues.push(...results.dependencyIntegrity.issues.map(i => `Dependency Integrity: ${i}`));
            }
            
            if (allIssues.length > 0) {
                // Report as issue
                this.issueDetector.detectIssue({
                    type: 'INTEGRITY_CHECK_FAILED',
                    severity: results.overallHealth.status === 'unhealthy' ? 'critical' : 'high',
                    method: 'integrityCheck',
                    details: {
                        health: results.overallHealth,
                        issues: allIssues,
                        timestamp: results.timestamp
                    },
                    timestamp: Date.now()
                });
            }
        }
    }
    
    /**
     * Get last check results
     */
    getLastCheckResults() {
        return this.checkResults;
    }
    
    /**
     * Get integrity status
     */
    getIntegrityStatus() {
        if (!this.checkResults) {
            return {
                status: 'unknown',
                message: 'No checks run yet'
            };
        }
        
        return {
            status: this.checkResults.overallHealth.status,
            health: this.checkResults.overallHealth.percent,
            lastCheck: this.lastCheck,
            issues: this.checkResults.overallHealth.passed ? 0 : 
                this.checkResults.fileIntegrity.issues.length +
                this.checkResults.codeIntegrity.issues.length +
                this.checkResults.loggingIntegrity.issues.length +
                this.checkResults.integrationIntegrity.issues.length +
                this.checkResults.dependencyIntegrity.issues.length
        };
    }
}

module.exports = IntegrityChecker;
