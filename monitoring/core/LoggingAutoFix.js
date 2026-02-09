/**
 * Logging Auto-Fix - Phase 5
 * 
 * Automatically fixes logging issues:
 * - Fix format inconsistencies
 * - Fix parseability issues
 * - Fix interference patterns
 * - Add missing logs
 */

const fs = require('fs').promises;
const path = require('path');
const EventEmitter = require('events');
const gameLogger = require('../../src/utils/GameLogger');

class LoggingAutoFix extends EventEmitter {
    constructor(projectRoot, stateStore, issueDetector, loggingIntegrityChecker) {
        super();
        this.projectRoot = projectRoot;
        this.stateStore = stateStore;
        this.issueDetector = issueDetector;
        this.loggingIntegrityChecker = loggingIntegrityChecker;
        
        // Track fix attempts
        this.fixAttempts = [];
        this.maxAttemptHistory = 100;
        
        // Auto-fix enabled flag
        this.autoFixEnabled = false;
    }
    
    /**
     * Enable/disable auto-fix
     */
    setEnabled(enabled) {
        this.autoFixEnabled = enabled;
        gameLogger.info('BrokenPromise', '[LOGGING_AUTO_FIX] Auto-fix', {
            enabled
        });
    }
    
    /**
     * Attempt to fix logging issues
     */
    async attemptFix(issue) {
        if (!this.autoFixEnabled) {
            return { success: false, reason: 'Auto-fix disabled' };
        }
        
        const fixAttempt = {
            id: `fix_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            issue,
            timestamp: Date.now(),
            result: null,
            changes: []
        };
        
        try {
            switch (issue.type) {
                case 'FORMAT_INCONSISTENCY':
                    fixAttempt.result = await this.fixFormatInconsistency(issue);
                    break;
                case 'UNPARSEABLE_LOGS':
                    fixAttempt.result = await this.fixUnparseableLogs(issue);
                    break;
                case 'MONITORING_INTERFERENCE':
                    fixAttempt.result = await this.fixMonitoringInterference(issue);
                    break;
                case 'MISSING_LOGS':
                    fixAttempt.result = await this.fixMissingLogs(issue);
                    break;
                default:
                    fixAttempt.result = { success: false, reason: 'Unknown issue type' };
            }
            
            // Track attempt
            this.fixAttempts.push(fixAttempt);
            if (this.fixAttempts.length > this.maxAttemptHistory) {
                this.fixAttempts.shift();
            }
            
            // Store in state
            this.stateStore.updateState('monitoring.loggingAutoFix.attempts', 
                this.fixAttempts.slice(-50));
            
            // Emit event
            if (fixAttempt.result.success) {
                this.emit('fixSucceeded', fixAttempt);
            } else {
                this.emit('fixFailed', fixAttempt);
            }
            
            return fixAttempt.result;
            
        } catch (error) {
            gameLogger.error('BrokenPromise', '[LOGGING_AUTO_FIX] Fix attempt error', {
                error: error.message,
                issue: issue.type
            });
            
            fixAttempt.result = { success: false, reason: error.message };
            this.fixAttempts.push(fixAttempt);
            
            return fixAttempt.result;
        }
    }
    
    /**
     * Fix format inconsistencies
     */
    async fixFormatInconsistency(issue) {
        // This would analyze code and fix log format calls
        // For now, report what needs to be fixed
        return {
            success: false,
            reason: 'Format inconsistency fixes require manual code review',
            recommendation: 'Review log format inconsistencies and ensure all logs use gameLogger with consistent format'
        };
    }
    
    /**
     * Fix unparseable logs
     */
    async fixUnparseableLogs(issue) {
        // This would fix log entries that can't be parsed
        // For now, report what needs to be fixed
        return {
            success: false,
            reason: 'Unparseable log fixes require manual code review',
            recommendation: 'Review unparseable log entries and ensure they follow expected format'
        };
    }
    
    /**
     * Fix monitoring interference (console.* calls)
     */
    async fixMonitoringInterference(issue) {
        if (!issue.details || !issue.details.violations) {
            return { success: false, reason: 'No violations provided' };
        }
        
        const violations = issue.details.violations;
        const changes = [];
        
        for (const violation of violations.slice(0, 10)) { // Fix first 10
            try {
                const filePath = path.join(this.projectRoot, violation.file);
                const content = await fs.readFile(filePath, 'utf8');
                const lines = content.split('\n');
                
                // Find and replace console.* with gameLogger
                let modified = false;
                const newLines = lines.map((line, index) => {
                    if (index + 1 === violation.line) {
                        // Replace console.log/error/warn with gameLogger
                        let newLine = line;
                        
                        if (line.includes('console.log(')) {
                            newLine = line.replace(/console\.log\(/g, 'gameLogger.info(\'COMPONENT\', ');
                            modified = true;
                        } else if (line.includes('console.error(')) {
                            newLine = line.replace(/console\.error\(/g, 'gameLogger.error(\'COMPONENT\', ');
                            modified = true;
                        } else if (line.includes('console.warn(')) {
                            newLine = line.replace(/console\.warn\(/g, 'gameLogger.warn(\'COMPONENT\', ');
                            modified = true;
                        }
                        
                        if (modified) {
                            changes.push({
                                file: violation.file,
                                line: violation.line,
                                before: line.trim(),
                                after: newLine.trim()
                            });
                        }
                        
                        return newLine;
                    }
                    return line;
                });
                
                if (modified) {
                    await fs.writeFile(filePath, newLines.join('\n'), 'utf8');
                    changes.push({
                        file: violation.file,
                        line: violation.line,
                        action: 'replaced_console_call'
                    });
                }
                
            } catch (error) {
                gameLogger.error('BrokenPromise', '[LOGGING_AUTO_FIX] Fix interference error', {
                    error: error.message,
                    file: violation.file
                });
            }
        }
        
        return {
            success: changes.length > 0,
            changes,
            message: changes.length > 0 
                ? `Fixed ${changes.length} monitoring interference violations`
                : 'No violations could be automatically fixed'
        };
    }
    
    /**
     * Fix missing logs
     */
    async fixMissingLogs(issue) {
        // This would add missing log statements to code
        // For now, report what needs to be added
        return {
            success: false,
            reason: 'Missing log fixes require manual code review',
            recommendation: 'Review missing critical logs and add appropriate logging statements'
        };
    }
    
    /**
     * Get fix statistics
     */
    getFixStatistics() {
        const total = this.fixAttempts.length;
        const successful = this.fixAttempts.filter(a => a.result && a.result.success).length;
        const failed = total - successful;
        
        return {
            total,
            successful,
            failed,
            successRate: total > 0 ? (successful / total) : 0,
            recentAttempts: this.fixAttempts.slice(-10)
        };
    }
}

module.exports = LoggingAutoFix;
