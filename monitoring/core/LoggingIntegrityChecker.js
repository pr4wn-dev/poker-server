/**
 * Logging Integrity Checker - Phase 5
 * 
 * Comprehensive logging integrity checking:
 * - Detect inconsistent log formats
 * - Find unparseable logs
 * - Find monitoring interference
 * - Find performance issues
 * - Find missing critical logs
 */

const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');
const gameLogger = require('../../src/utils/GameLogger');

class LoggingIntegrityChecker extends EventEmitter {
    constructor(projectRoot, stateStore, issueDetector) {
        super();
        this.projectRoot = projectRoot;
        this.stateStore = stateStore;
        this.issueDetector = issueDetector;
        
        this.logFile = path.join(projectRoot, 'logs', 'game.log');
        this.maxSampleSize = 1000; // Check last 1000 lines
        
        // Expected log format patterns
        this.expectedPatterns = [
            /^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}\] \[(INFO|WARN|ERROR|GAME_EVENT)\] \[(\w+)\]/,
            /^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}\] \[(INFO|WARN|ERROR|GAME_EVENT)\] \[(\w+)\].*\| Data:/
        ];
        
        // Critical operations that should be logged
        this.criticalOperations = [
            'PLAYER_JOINED',
            'PLAYER_LEFT',
            'CHIP_CHANGE',
            'BET_PLACED',
            'HAND_STARTED',
            'HAND_ENDED',
            'ERROR',
            'EXCEPTION',
            'DATABASE_ERROR',
            'SOCKET_ERROR'
        ];
        
        // Performance thresholds
        this.maxLogLineLength = 10000; // 10KB per line is excessive
        this.maxLogFileSize = 50 * 1024 * 1024; // 50MB max
        this.maxLogEntriesPerSecond = 100; // More than 100 entries/sec is excessive
        
        // Monitoring interference patterns
        this.interferencePatterns = [
            /console\.(log|error|warn)/, // console.* calls (should use gameLogger)
            /process\.stdout\.write/, // Direct stdout writes
            /process\.stderr\.write/ // Direct stderr writes
        ];
    }
    
    /**
     * Run comprehensive logging integrity check
     */
    async checkIntegrity() {
        const results = {
            timestamp: Date.now(),
            overallHealth: 'healthy',
            issues: [],
            formatConsistency: {},
            parseability: {},
            monitoringInterference: {},
            performance: {},
            missingLogs: {},
            recommendations: []
        };
        
        try {
            // Check format consistency
            results.formatConsistency = await this.checkFormatConsistency();
            
            // Check parseability
            results.parseability = await this.checkParseability();
            
            // Check monitoring interference
            results.monitoringInterference = await this.checkMonitoringInterference();
            
            // Check performance issues
            results.performance = await this.checkPerformance();
            
            // Check missing critical logs
            results.missingLogs = await this.checkMissingCriticalLogs();
            
            // Determine overall health
            const issueCount = results.issues.length;
            if (issueCount === 0) {
                results.overallHealth = 'healthy';
            } else if (issueCount <= 3) {
                results.overallHealth = 'warning';
            } else {
                results.overallHealth = 'critical';
            }
            
            // Generate recommendations
            results.recommendations = this.generateRecommendations(results);
            
            // Report issues
            if (results.issues.length > 0) {
                for (const issue of results.issues) {
                    if (this.issueDetector) {
                        this.issueDetector.detectIssue({
                            type: 'LOGGING_INTEGRITY',
                            severity: issue.severity || 'medium',
                            method: 'loggingIntegrityChecker',
                            details: issue
                        });
                    }
                }
            }
            
            // Store results
            this.stateStore.updateState('monitoring.loggingIntegrity', results);
            
            // Emit event
            this.emit('integrityChecked', results);
            
        } catch (error) {
            gameLogger.error('CERBERUS', '[LOGGING_INTEGRITY_CHECKER] CHECK_ERROR', {
                error: error.message,
                stack: error.stack
            });
            
            results.overallHealth = 'error';
            results.issues.push({
                type: 'CHECK_ERROR',
                severity: 'critical',
                message: `Failed to check logging integrity: ${error.message}`
            });
        }
        
        return results;
    }
    
    /**
     * Check log format consistency
     */
    async checkFormatConsistency() {
        const result = {
            consistent: true,
            totalLines: 0,
            consistentLines: 0,
            inconsistentLines: 0,
            inconsistencies: []
        };
        
        if (!fs.existsSync(this.logFile)) {
            return result;
        }
        
        try {
            const content = fs.readFileSync(this.logFile, 'utf8');
            const lines = content.split('\n').filter(l => l.trim()).slice(-this.maxSampleSize);
            result.totalLines = lines.length;
            
            const formatCounts = new Map();
            
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                let matched = false;
                
                for (const pattern of this.expectedPatterns) {
                    if (pattern.test(line)) {
                        matched = true;
                        const format = pattern.source;
                        formatCounts.set(format, (formatCounts.get(format) || 0) + 1);
                        break;
                    }
                }
                
                if (matched) {
                    result.consistentLines++;
                } else {
                    result.inconsistentLines++;
                    if (result.inconsistencies.length < 10) {
                        result.inconsistencies.push({
                            lineNumber: i + 1,
                            preview: line.substring(0, 100)
                        });
                    }
                }
            }
            
            const consistencyRate = result.totalLines > 0 
                ? (result.consistentLines / result.totalLines) * 100 
                : 100;
            
            result.consistencyRate = Math.round(consistencyRate * 100) / 100;
            result.consistent = consistencyRate >= 95; // 95% consistency threshold
            
            if (!result.consistent) {
                this.addIssue('FORMAT_INCONSISTENCY', 'medium', {
                    message: `Log format inconsistency: ${result.consistencyRate}% consistent (target: 95%+)`,
                    inconsistentLines: result.inconsistentLines,
                    totalLines: result.totalLines
                });
            }
            
        } catch (error) {
            this.addIssue('FORMAT_CHECK_ERROR', 'high', {
                message: `Failed to check format consistency: ${error.message}`
            });
        }
        
        return result;
    }
    
    /**
     * Check log parseability
     */
    async checkParseability() {
        const result = {
            parseable: true,
            totalLines: 0,
            parseableLines: 0,
            unparseableLines: 0,
            unparseableExamples: []
        };
        
        if (!fs.existsSync(this.logFile)) {
            return result;
        }
        
        try {
            const content = fs.readFileSync(this.logFile, 'utf8');
            const lines = content.split('\n').filter(l => l.trim()).slice(-this.maxSampleSize);
            result.totalLines = lines.length;
            
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                let parseable = false;
                
                // Try to parse as JSON if it has Data: prefix
                if (line.includes('| Data:')) {
                    try {
                        const dataPart = line.split('| Data:')[1];
                        JSON.parse(dataPart.trim());
                        parseable = true;
                    } catch (e) {
                        // Not valid JSON
                    }
                }
                
                // Check if matches expected pattern
                if (!parseable) {
                    for (const pattern of this.expectedPatterns) {
                        if (pattern.test(line)) {
                            parseable = true;
                            break;
                        }
                    }
                }
                
                if (parseable) {
                    result.parseableLines++;
                } else {
                    result.unparseableLines++;
                    if (result.unparseableExamples.length < 10) {
                        result.unparseableExamples.push({
                            lineNumber: i + 1,
                            preview: line.substring(0, 150)
                        });
                    }
                }
            }
            
            const parseabilityRate = result.totalLines > 0 
                ? (result.parseableLines / result.totalLines) * 100 
                : 100;
            
            result.parseabilityRate = Math.round(parseabilityRate * 100) / 100;
            result.parseable = parseabilityRate >= 90; // 90% parseability threshold
            
            if (!result.parseable) {
                // Initialize currentResults if needed
                if (!this.currentResults) {
                    this.currentResults = { issues: [] };
                }
                this.addIssue('UNPARSEABLE_LOGS', 'high', {
                    message: `Unparseable logs detected: ${result.parseabilityRate}% parseable (target: 90%+)`,
                    unparseableLines: result.unparseableLines,
                    totalLines: result.totalLines
                });
            }
            
        } catch (error) {
            this.addIssue('PARSEABILITY_CHECK_ERROR', 'high', {
                message: `Failed to check parseability: ${error.message}`
            });
        }
        
        return result;
    }
    
    /**
     * Check for monitoring interference
     */
    async checkMonitoringInterference() {
        const result = {
            noInterference: true,
            interferenceFound: [],
            filesChecked: 0
        };
        
        try {
            // Check source files for interference patterns
            const srcDir = path.join(this.projectRoot, 'src');
            const monitoringDir = path.join(this.projectRoot, 'monitoring');
            
            const filesToCheck = [
                ...this.findJSFiles(srcDir),
                ...this.findJSFiles(monitoringDir)
            ];
            
            result.filesChecked = filesToCheck.length;
            
            for (const filePath of filesToCheck) {
                try {
                    const content = fs.readFileSync(filePath, 'utf8');
                    const lines = content.split('\n');
                    
                    for (let i = 0; i < lines.length; i++) {
                        const line = lines[i];
                        
                        for (const pattern of this.interferencePatterns) {
                            if (pattern.test(line)) {
                                // Skip if it's in a comment or string
                            if (this.isInCommentOrString(line, pattern)) continue;
                            
                            result.interferenceFound.push({
                                file: path.relative(this.projectRoot, filePath),
                                line: i + 1,
                                pattern: pattern.source,
                                preview: line.trim().substring(0, 100)
                            });
                            
                            result.noInterference = false;
                            }
                        }
                    }
                } catch (error) {
                    // Skip files that can't be read
                }
            }
            
            if (!result.noInterference) {
                // Initialize currentResults if needed
                if (!this.currentResults) {
                    this.currentResults = { issues: [] };
                }
                this.addIssue('MONITORING_INTERFERENCE', 'high', {
                    message: `Monitoring interference detected: ${result.interferenceFound.length} violations found`,
                    violations: result.interferenceFound.slice(0, 10) // First 10
                });
            }
            
        } catch (error) {
            this.addIssue('INTERFERENCE_CHECK_ERROR', 'medium', {
                message: `Failed to check monitoring interference: ${error.message}`
            });
        }
        
        return result;
    }
    
    /**
     * Check for performance issues
     */
    async checkPerformance() {
        const result = {
            healthy: true,
            issues: []
        };
        
        if (!fs.existsSync(this.logFile)) {
            return result;
        }
        
        try {
            const stats = fs.statSync(this.logFile);
            const fileSizeMB = stats.size / (1024 * 1024);
            
            // Check file size
            if (fileSizeMB > this.maxLogFileSize / (1024 * 1024)) {
                result.issues.push({
                    type: 'FILE_SIZE',
                    severity: 'high',
                    message: `Log file too large: ${fileSizeMB.toFixed(2)}MB (max: ${(this.maxLogFileSize / (1024 * 1024)).toFixed(2)}MB)`
                });
                result.healthy = false;
            }
            
            // Check line lengths
            const content = fs.readFileSync(this.logFile, 'utf8');
            const lines = content.split('\n').filter(l => l.trim()).slice(-100);
            
            let longLines = 0;
            for (const line of lines) {
                if (line.length > this.maxLogLineLength) {
                    longLines++;
                }
            }
            
            if (longLines > 0) {
                result.issues.push({
                    type: 'LONG_LINES',
                    severity: 'medium',
                    message: `${longLines} log lines exceed ${this.maxLogLineLength} characters`
                });
                result.healthy = false;
            }
            
            // Check log rate (entries per second)
            // This would require analyzing timestamps, simplified for now
            const recentLines = lines.slice(-100);
            if (recentLines.length > 0) {
                // Estimate based on line count (simplified)
                const estimatedRate = recentLines.length / 10; // Assume 10 second window
                if (estimatedRate > this.maxLogEntriesPerSecond) {
                    result.issues.push({
                        type: 'HIGH_LOG_RATE',
                        severity: 'medium',
                        message: `High log rate detected: ~${Math.round(estimatedRate)} entries/sec (max: ${this.maxLogEntriesPerSecond})`
                    });
                    result.healthy = false;
                }
            }
            
            if (!result.healthy) {
                // Initialize currentResults if needed
                if (!this.currentResults) {
                    this.currentResults = { issues: [] };
                }
                this.addIssue('LOGGING_PERFORMANCE', 'medium', {
                    message: 'Logging performance issues detected',
                    issues: result.issues
                });
            }
            
        } catch (error) {
            this.addIssue('PERFORMANCE_CHECK_ERROR', 'medium', {
                message: `Failed to check performance: ${error.message}`
            });
        }
        
        return result;
    }
    
    /**
     * Check for missing critical logs
     */
    async checkMissingCriticalLogs() {
        const result = {
            allLogged: true,
            missing: [],
            checked: []
        };
        
        if (!fs.existsSync(this.logFile)) {
            return result;
        }
        
        try {
            const content = fs.readFileSync(this.logFile, 'utf8');
            const lowerContent = content.toLowerCase();
            
            for (const operation of this.criticalOperations) {
                const mentioned = lowerContent.includes(operation.toLowerCase());
                result.checked.push({
                    operation,
                    logged: mentioned
                });
                
                if (!mentioned) {
                    result.missing.push(operation);
                    result.allLogged = false;
                }
            }
            
            // Note: Not necessarily an issue if not mentioned (might not have occurred)
            // But we track it for awareness
            
        } catch (error) {
            this.addIssue('MISSING_LOGS_CHECK_ERROR', 'low', {
                message: `Failed to check missing logs: ${error.message}`
            });
        }
        
        return result;
    }
    
    /**
     * Generate recommendations based on results
     */
    generateRecommendations(results) {
        const recommendations = [];
        
        if (results.formatConsistency && !results.formatConsistency.consistent) {
            recommendations.push({
                type: 'FORMAT_CONSISTENCY',
                priority: 'high',
                message: 'Fix inconsistent log formats - ensure all logs use gameLogger with consistent format',
                action: 'Review and fix log format inconsistencies'
            });
        }
        
        if (results.parseability && !results.parseability.parseable) {
            recommendations.push({
                type: 'PARSEABILITY',
                priority: 'high',
                message: 'Fix unparseable logs - ensure all logs are in valid format',
                action: 'Review and fix unparseable log entries'
            });
        }
        
        if (results.monitoringInterference && !results.monitoringInterference.noInterference) {
            recommendations.push({
                type: 'MONITORING_INTERFERENCE',
                priority: 'high',
                message: 'Remove monitoring interference - replace console.* calls with gameLogger',
                action: 'Replace console.* calls with gameLogger calls'
            });
        }
        
        if (results.performance && !results.performance.healthy) {
            recommendations.push({
                type: 'PERFORMANCE',
                priority: 'medium',
                message: 'Address logging performance issues',
                action: 'Review log file size, line lengths, and log rate'
            });
        }
        
        return recommendations;
    }
    
    /**
     * Helper: Find all JS files in directory
     */
    findJSFiles(dir) {
        const files = [];
        
        if (!fs.existsSync(dir)) {
            return files;
        }
        
        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                
                if (entry.isDirectory()) {
                    // Skip node_modules
                    if (entry.name === 'node_modules') continue;
                    files.push(...this.findJSFiles(fullPath));
                } else if (entry.isFile() && entry.name.endsWith('.js')) {
                    files.push(fullPath);
                }
            }
        } catch (error) {
            // Skip directories that can't be read
        }
        
        return files;
    }
    
    /**
     * Helper: Check if pattern match is in comment or string
     */
    isInCommentOrString(line, pattern) {
        // Simple check - if line starts with // or contains pattern in quotes
        const trimmed = line.trim();
        if (trimmed.startsWith('//')) return true;
        if (trimmed.startsWith('/*')) return true;
        
        // Check if pattern is in quotes (simplified)
        const match = line.match(pattern);
        if (match) {
            const matchIndex = match.index;
            const beforeMatch = line.substring(0, matchIndex);
            const quoteCount = (beforeMatch.match(/['"]/g) || []).length;
            if (quoteCount % 2 === 1) return true; // Inside string
        }
        
        return false;
    }
    
    /**
     * Helper: Add issue to results
     */
    addIssue(type, severity, details) {
        // This will be collected in checkIntegrity()
        if (!this.currentResults) {
            this.currentResults = { issues: [] };
        }
        
        this.currentResults.issues.push({
            type,
            severity,
            ...details
        });
    }
    
    /**
     * Start periodic integrity checks
     */
    startPeriodicChecks(intervalMs = 300000) { // Every 5 minutes
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
        }
        
        this.checkInterval = setInterval(async () => {
            try {
                await this.checkIntegrity();
            } catch (error) {
                gameLogger.error('CERBERUS', '[LOGGING_INTEGRITY_CHECKER] Periodic check error', {
                    error: error.message
                });
            }
        }, intervalMs);
        
        // Run initial check
        setImmediate(() => {
            this.checkIntegrity().catch(error => {
                gameLogger.error('CERBERUS', '[LOGGING_INTEGRITY_CHECKER] Initial check error', {
                    error: error.message
                });
            });
        });
    }
    
    /**
     * Stop periodic checks
     */
    stopPeriodicChecks() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
    }
    
    /**
     * Get last check results
     */
    getLastCheckResults() {
        return this.stateStore.getState('monitoring.loggingIntegrity') || {
            overallHealth: 'unknown',
            timestamp: 0
        };
    }
}

module.exports = LoggingIntegrityChecker;
