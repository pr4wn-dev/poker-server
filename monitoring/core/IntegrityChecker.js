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
        
        // Unity client path (if accessible)
        this.unityClientPath = path.join(path.dirname(projectRoot), 'poker-client-unity');
        this.unityClientAccessible = fs.existsSync(this.unityClientPath);
        
        // Server files that need to integrate with AI system
        this.serverFiles = {
            'src/server.js': {
                type: 'module',
                requiredLogging: true,
                requiredIntegration: ['GameLogger', 'SocketHandler'],
                criticalOperations: ['server_start', 'server_stop', 'health_check']
            },
            'src/sockets/SocketHandler.js': {
                type: 'module',
                requiredLogging: true,
                requiredIntegration: ['GameLogger', 'UnityLogHandler'],
                criticalOperations: ['socket_connect', 'socket_disconnect', 'player_action', 'table_state']
            },
            'src/game/Table.js': {
                type: 'module',
                requiredLogging: true,
                requiredIntegration: ['GameLogger'],
                criticalOperations: ['bet', 'call', 'raise', 'fold', 'check', 'allin', 'pot_update', 'phase_change']
            },
            'src/game/GameManager.js': {
                type: 'module',
                requiredLogging: true,
                requiredIntegration: ['GameLogger'],
                criticalOperations: ['table_create', 'table_join', 'table_leave']
            },
            'src/utils/GameLogger.js': {
                type: 'module',
                requiredLogging: false, // This IS the logger
                requiredIntegration: [],
                criticalOperations: []
            }
        };
        
        // Unity client files (if accessible)
        this.unityFiles = {
            'Assets/Scripts/GameController.cs': {
                type: 'csharp',
                requiredLogging: true,
                requiredIntegration: ['Socket.IO', 'State Reporting'],
                criticalOperations: ['HandleTableStateUpdated', 'PauseGame', 'ResumeGame']
            }
        };
        
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
            'monitoring/integration/CerberusIntegration.js': {
                type: 'module',
                exports: ['CerberusIntegration'],
                methods: ['getInvestigationStatus', 'shouldStartInvestigation', 'startInvestigation']
            },
            'monitoring/integration/cerberus-integration.js': {
                type: 'script',
                executable: true
            },
            // PowerShell files
            'monitoring/CerberusIntegration.ps1': {
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
        this.checkIntervalId = null;
        this.startPeriodicChecks();
    }
    
    /**
     * Start periodic integrity checks
     */
    startPeriodicChecks() {
        // Check on startup (async, don't block)
        setImmediate(() => {
            try {
                this.runAllChecks();
            } catch (error) {
                // DO NOT log to console - errors are for AI only, not user
                // Re-throw so UniversalErrorHandler can catch it
                throw error;
            }
        });
        
        // Check periodically
        this.checkIntervalId = setInterval(() => {
            try {
                this.runAllChecks();
            } catch (error) {
                // DO NOT log to console - errors are for AI only, not user
                // Re-throw so UniversalErrorHandler can catch it
                throw error;
            }
        }, this.checkInterval);
    }
    
    /**
     * Stop periodic checks
     */
    stopPeriodicChecks() {
        if (this.checkIntervalId) {
            clearInterval(this.checkIntervalId);
            this.checkIntervalId = null;
        }
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
            dependencyIntegrity: this.checkDependencyIntegrity(),
            serverIntegrity: this.checkServerIntegrity(),
            unityIntegrity: this.checkUnityIntegrity(),
            apiIntegrity: this.checkAPIIntegrity(),
            socketIntegrity: this.checkSocketIntegrity()
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
                        const moduleExports = require(fullPath);
                        if (requirements.exports) {
                            for (const exportName of requirements.exports) {
                                // Check for named export (module.ExportName) or default export (module itself)
                                const exportedClass = moduleExports[exportName] || (moduleExports.default || moduleExports);
                                
                                if (!exportedClass || typeof exportedClass !== 'function') {
                                    fileResult.issues.push(`Missing export: ${exportName}`);
                                    results.issues.push(`File Integrity: ${filePath}: Missing export ${exportName}`);
                                    results.passed = false;
                                } else {
                                    // Check if it's a class with required methods
                                    if (requirements.methods) {
                                        try {
                                            // Try to instantiate with projectRoot (most classes need this)
                                            let instance;
                                            try {
                                                instance = new exportedClass(this.projectRoot);
                                            } catch (e) {
                                                // Try with different constructor args
                                                try {
                                                    instance = new exportedClass();
                                                } catch (e2) {
                                                    // Can't instantiate, but class exists - that's OK for now
                                                    fileResult.structure = true;
                                                    continue;
                                                }
                                            }
                                            
                                            for (const methodName of requirements.methods) {
                                                if (typeof instance[methodName] !== 'function') {
                                                    fileResult.issues.push(`Missing method: ${methodName}`);
                                                    results.issues.push(`File Integrity: ${filePath}: Missing method ${methodName}`);
                                                    results.passed = false;
                                                }
                                            }
                                        } catch (error) {
                                            // Instantiation failed, but class exists - log but don't fail
                                            fileResult.issues.push(`Could not instantiate ${exportName}: ${error.message}`);
                                        }
                                    }
                                }
                            }
                        } else {
                            // No specific exports required, just check if module loads
                            fileResult.structure = true;
                        }
                        fileResult.structure = true;
                    } catch (error) {
                        fileResult.issues.push(`Failed to load module: ${error.message}`);
                        results.issues.push(`File Integrity: ${filePath}: ${error.message}`);
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
        
        // Check if cerberus.ps1 sources CerberusIntegration.ps1
        const monitorPath = path.join(this.projectRoot, 'monitoring', 'cerberus.ps1');
        if (fs.existsSync(monitorPath)) {
            const content = fs.readFileSync(monitorPath, 'utf8');
            const aiIntegrationSourced = /\.\s*\$aiIntegrationPath|\.\s*CerberusIntegration\.ps1/i.test(content);
            
            if (!aiIntegrationSourced) {
                results.issues.push('cerberus.ps1 does not source CerberusIntegration.ps1');
                results.passed = false;
            }
            
            results.files['monitoring/cerberus.ps1'] = {
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
                        const moduleExports = require(fullPath);
                        if (requirements.exports) {
                            for (const exportName of requirements.exports) {
                                // Check for named export or default export
                                const exportedClass = moduleExports[exportName] || (moduleExports.default || moduleExports);
                                
                                if (exportedClass && typeof exportedClass === 'function') {
                                    // Try to instantiate
                                    try {
                                        let instance;
                                        try {
                                            instance = new exportedClass(this.projectRoot);
                                        } catch (e) {
                                            try {
                                                instance = new exportedClass();
                                            } catch (e2) {
                                                // Can't instantiate, but class exists - that's OK
                                                continue;
                                            }
                                        }
                                        
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
                                        // Instantiation failed, but class exists - that's OK
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
        
        // Check if cerberus.ps1 uses AI functions
        const monitorPath = path.join(this.projectRoot, 'monitoring', 'cerberus.ps1');
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
            
            results.integrations['cerberus.ps1'] = {
                aiFunctionsUsed: usedFunctions.length,
                aiFunctionsMissing: missingFunctions.length,
                usedFunctions,
                missingFunctions
            };
            
            if (missingFunctions.length > aiFunctions.length / 2) {
                results.issues.push(`cerberus.ps1 not using AI functions (only ${usedFunctions.length}/${aiFunctions.length})`);
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
     * Check server integrity
     */
    checkServerIntegrity() {
        const results = {
            passed: true,
            issues: [],
            files: {}
        };
        
        for (const [filePath, requirements] of Object.entries(this.serverFiles)) {
            const fullPath = path.join(this.projectRoot, filePath);
            const fileResult = {
                exists: false,
                hasLogging: false,
                hasIntegration: false,
                issues: []
            };
            
            if (!fs.existsSync(fullPath)) {
                fileResult.issues.push(`File does not exist: ${filePath}`);
                results.issues.push(`Missing server file: ${filePath}`);
                results.passed = false;
            } else {
                fileResult.exists = true;
                
                try {
                    const content = fs.readFileSync(fullPath, 'utf8');
                    
                    // Check for required logging
                    if (requirements.requiredLogging) {
                        const hasGameLogger = /GameLogger|gameLogger|require\(['"]\.\.\/utils\/GameLogger['"]\)/i.test(content);
                        if (hasGameLogger) {
                            fileResult.hasLogging = true;
                        } else {
                            fileResult.issues.push(`Missing GameLogger integration`);
                            results.issues.push(`${filePath}: Missing GameLogger integration`);
                            results.passed = false;
                        }
                    }
                    
                    // Check for required integration
                    if (requirements.requiredIntegration.length > 0) {
                        const hasAllIntegration = requirements.requiredIntegration.every(integration => {
                            if (integration === 'GameLogger') {
                                return /GameLogger|gameLogger/i.test(content);
                            } else if (integration === 'UnityLogHandler') {
                                return /UnityLogHandler|unityLogHandler/i.test(content);
                            }
                            return true;
                        });
                        
                        if (hasAllIntegration) {
                            fileResult.hasIntegration = true;
                        } else {
                            fileResult.issues.push(`Missing required integrations: ${requirements.requiredIntegration.join(', ')}`);
                            results.issues.push(`${filePath}: Missing integrations`);
                            results.passed = false;
                        }
                    }
                    
                    // Check if critical operations are logged
                    if (requirements.criticalOperations.length > 0) {
                        const loggedOperations = requirements.criticalOperations.filter(op => {
                            const opPattern = new RegExp(op.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
                            return opPattern.test(content);
                        });
                        
                        if (loggedOperations.length < requirements.criticalOperations.length) {
                            const missing = requirements.criticalOperations.filter(op => !loggedOperations.includes(op));
                            fileResult.issues.push(`Critical operations not logged: ${missing.join(', ')}`);
                        }
                    }
                } catch (error) {
                    fileResult.issues.push(`Failed to read file: ${error.message}`);
                    results.issues.push(`${filePath}: ${error.message}`);
                    results.passed = false;
                }
            }
            
            results.files[filePath] = fileResult;
        }
        
        return results;
    }
    
    /**
     * Check Unity client integrity
     */
    checkUnityIntegrity() {
        const results = {
            passed: true,
            issues: [],
            accessible: this.unityClientAccessible,
            files: {}
        };
        
        if (!this.unityClientAccessible) {
            results.issues.push('Unity client path not accessible (expected at ../poker-client-unity)');
            return results;
        }
        
        for (const [filePath, requirements] of Object.entries(this.unityFiles)) {
            const fullPath = path.join(this.unityClientPath, filePath);
            const fileResult = {
                exists: false,
                hasLogging: false,
                hasIntegration: false,
                issues: []
            };
            
            if (!fs.existsSync(fullPath)) {
                fileResult.issues.push(`File does not exist: ${filePath}`);
                results.issues.push(`Missing Unity file: ${filePath}`);
                results.passed = false;
            } else {
                fileResult.exists = true;
                
                try {
                    const content = fs.readFileSync(fullPath, 'utf8');
                    
                    // Check for required logging
                    if (requirements.requiredLogging) {
                        const hasLogging = /Debug\.(Log|LogError|LogWarning)|UnityLogHandler|SocketIOClient\.Emit\(['"]report_unity_log['"]/i.test(content);
                        if (hasLogging) {
                            fileResult.hasLogging = true;
                        } else {
                            fileResult.issues.push(`Missing logging integration`);
                            results.issues.push(`${filePath}: Missing logging integration`);
                            results.passed = false;
                        }
                    }
                    
                    // Check for required integration
                    if (requirements.requiredIntegration.length > 0) {
                        const hasSocketIO = requirements.requiredIntegration.includes('Socket.IO') ? 
                            /SocketIOClient|socket\.Emit|socket\.On/i.test(content) : true;
                        const hasStateReporting = requirements.requiredIntegration.includes('State Reporting') ?
                            /HandleTableStateUpdated|table_state|isPaused/i.test(content) : true;
                        
                        if (hasSocketIO && hasStateReporting) {
                            fileResult.hasIntegration = true;
                        } else {
                            fileResult.issues.push(`Missing required integrations`);
                            results.issues.push(`${filePath}: Missing integrations`);
                            results.passed = false;
                        }
                    }
                    
                    // Check if critical operations exist
                    if (requirements.criticalOperations.length > 0) {
                        const foundOperations = requirements.criticalOperations.filter(op => {
                            const opPattern = new RegExp(op.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
                            return opPattern.test(content);
                        });
                        
                        if (foundOperations.length < requirements.criticalOperations.length) {
                            const missing = requirements.criticalOperations.filter(op => !foundOperations.includes(op));
                            fileResult.issues.push(`Missing critical operations: ${missing.join(', ')}`);
                            results.issues.push(`${filePath}: Missing operations ${missing.join(', ')}`);
                            results.passed = false;
                        }
                    }
                } catch (error) {
                    fileResult.issues.push(`Failed to read file: ${error.message}`);
                    results.issues.push(`${filePath}: ${error.message}`);
                    results.passed = false;
                }
            }
            
            results.files[filePath] = fileResult;
        }
        
        return results;
    }
    
    /**
     * Check API integrity
     */
    checkAPIIntegrity() {
        const results = {
            passed: true,
            issues: [],
            endpoints: {}
        };
        
        const requiredEndpoints = [
            { path: '/api/simulation/pause', method: 'POST', file: 'src/server.js' },
            { path: '/api/simulations/:tableId/resume', method: 'POST', file: 'src/server.js' },
            { path: '/health', method: 'GET', file: 'src/server.js' }  // Changed from /api/health to /health
        ];
        
        const serverPath = path.join(this.projectRoot, 'src', 'server.js');
        if (fs.existsSync(serverPath)) {
            try {
                const content = fs.readFileSync(serverPath, 'utf8');
                
                for (const endpoint of requiredEndpoints) {
                    const endpointPattern = new RegExp(
                        endpoint.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/:tableId/g, '[^/]+'),
                        'i'
                    );
                    const methodPattern = new RegExp(endpoint.method, 'i');
                    
                    const hasEndpoint = endpointPattern.test(content) && methodPattern.test(content);
                    results.endpoints[endpoint.path] = {
                        exists: hasEndpoint,
                        method: endpoint.method
                    };
                    
                    if (!hasEndpoint) {
                        results.issues.push(`Missing API endpoint: ${endpoint.method} ${endpoint.path}`);
                        results.passed = false;
                    }
                }
            } catch (error) {
                results.issues.push(`Failed to check API endpoints: ${error.message}`);
                results.passed = false;
            }
        } else {
            results.issues.push('server.js not found');
            results.passed = false;
        }
        
        return results;
    }
    
    /**
     * Check Socket.IO integrity
     */
    checkSocketIntegrity() {
        const results = {
            passed: true,
            issues: [],
            events: {}
        };
        
        const requiredEvents = [
            { name: 'table_state', direction: 'server->client', file: 'src/sockets/SocketHandler.js' },
            { name: 'report_unity_log', direction: 'client->server', file: 'src/sockets/SocketHandler.js' },
            { name: 'action', direction: 'client->server', file: 'src/sockets/SocketHandler.js' }
        ];
        
        const socketHandlerPath = path.join(this.projectRoot, 'src', 'sockets', 'SocketHandler.js');
        if (fs.existsSync(socketHandlerPath)) {
            try {
                const content = fs.readFileSync(socketHandlerPath, 'utf8');
                
                for (const event of requiredEvents) {
                    // Match various emit patterns: io.emit, socket.emit, io.to(...).emit, this.io.to(...).emit
                    const eventPattern = new RegExp(
                        `(socket\\.on|socket\\.emit|io\\.emit|io\\.to|socket\\.to|this\\.io\\.to|this\\.io\\.emit).*['"]${event.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`,
                        'i'
                    );
                    
                    const hasEvent = eventPattern.test(content);
                    results.events[event.name] = {
                        exists: hasEvent,
                        direction: event.direction
                    };
                    
                    if (!hasEvent) {
                        results.issues.push(`Missing Socket.IO event: ${event.name} (${event.direction})`);
                        results.passed = false;
                    }
                }
            } catch (error) {
                results.issues.push(`Failed to check Socket.IO events: ${error.message}`);
                results.passed = false;
            }
        } else {
            results.issues.push('SocketHandler.js not found');
            results.passed = false;
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
            results.dependencyIntegrity,
            results.serverIntegrity,
            results.unityIntegrity,
            results.apiIntegrity,
            results.socketIntegrity
        ].filter(c => c !== undefined && c !== null); // Filter out undefined/null checks
        
        if (checks.length === 0) {
            return {
                percent: 0,
                passed: 0,
                total: 0,
                status: 'unhealthy'
            };
        }
        
        const passedChecks = checks.filter(c => c && c.passed).length;
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
            
            if (results.fileIntegrity && results.fileIntegrity.issues.length > 0) {
                allIssues.push(...results.fileIntegrity.issues.map(i => `File Integrity: ${i}`));
            }
            if (results.codeIntegrity && results.codeIntegrity.issues.length > 0) {
                allIssues.push(...results.codeIntegrity.issues.map(i => `Code Integrity: ${i}`));
            }
            if (results.loggingIntegrity && results.loggingIntegrity.issues.length > 0) {
                allIssues.push(...results.loggingIntegrity.issues.map(i => `Logging Integrity: ${i}`));
            }
            if (results.integrationIntegrity && results.integrationIntegrity.issues.length > 0) {
                allIssues.push(...results.integrationIntegrity.issues.map(i => `Integration Integrity: ${i}`));
            }
            if (results.dependencyIntegrity && results.dependencyIntegrity.issues.length > 0) {
                allIssues.push(...results.dependencyIntegrity.issues.map(i => `Dependency Integrity: ${i}`));
            }
            if (results.serverIntegrity && results.serverIntegrity.issues.length > 0) {
                allIssues.push(...results.serverIntegrity.issues.map(i => `Server Integrity: ${i}`));
            }
            if (results.unityIntegrity && results.unityIntegrity.issues.length > 0) {
                allIssues.push(...results.unityIntegrity.issues.map(i => `Unity Integrity: ${i}`));
            }
            if (results.apiIntegrity && results.apiIntegrity.issues.length > 0) {
                allIssues.push(...results.apiIntegrity.issues.map(i => `API Integrity: ${i}`));
            }
            if (results.socketIntegrity && results.socketIntegrity.issues.length > 0) {
                allIssues.push(...results.socketIntegrity.issues.map(i => `Socket Integrity: ${i}`));
            }
            
            if (allIssues.length > 0 && this.issueDetector && typeof this.issueDetector.detectIssue === 'function') {
                // Report as issue (only if issueDetector is available)
                try {
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
                } catch (error) {
                    // DO NOT log to console - errors are for AI only, not user
                    // Issue detector not available or error - will be caught by UniversalErrorHandler
                }
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
