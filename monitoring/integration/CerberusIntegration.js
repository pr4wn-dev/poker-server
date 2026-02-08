/**
 * Cerberus Integration - Bridge PowerShell Cerberus <-> AI Core
 * 
 * This bridges the existing PowerShell cerberus.ps1 with the new AI-first core.
 * Allows gradual migration while preserving all existing functionality.
 */

const path = require('path');
const AIMonitorCore = require('../core/AIMonitorCore');
const gameLogger = require('../../src/utils/GameLogger');

class CerberusIntegration {
    constructor(projectRoot, options = {}) {
        this.projectRoot = projectRoot;
        this.aiCore = new AIMonitorCore(projectRoot);
        
        // Integration state
        this.integrationActive = true;
        this.lastSync = Date.now();
        this.syncInterval = 1000; // Sync every second
        
        // Only start sync loop if not in CLI mode (options.startSyncLoop defaults to true for backward compatibility)
        // CLI mode should not start sync loop to allow process to exit
        if (options.startSyncLoop !== false) {
            this.startSyncLoop();
        }
        
        gameLogger.info('MONITORING', '[MONITOR_INTEGRATION] Initialized', {
            message: 'Bridging PowerShell monitor with AI core'
        });
    }
    
    /**
     * Start sync loop - Keep AI core and cerberus.ps1 in sync
     */
    startSyncLoop() {
        setInterval(() => {
            this.syncWithMonitor();
        }, this.syncInterval);
    }
    
    /**
     * Sync with cerberus.ps1
     * Reads monitor-status.json and updates AI core state
     */
    syncWithMonitor() {
        try {
            const fs = require('fs');
            const statusFile = path.join(this.projectRoot, 'monitoring', 'monitor-status.json');
            
            if (!fs.existsSync(statusFile)) {
                return;
            }
            
            const status = JSON.parse(fs.readFileSync(statusFile, 'utf8'));
            
            // Sync investigation state
            if (status.investigation) {
                this.syncInvestigationState(status.investigation);
            }
            
            // Sync Unity state
            if (status.unity) {
                this.syncUnityState(status.unity);
            }
            
            // Sync system state
            if (status.system) {
                this.syncSystemState(status.system);
            }
            
            this.lastSync = Date.now();
        } catch (error) {
            gameLogger.error('MONITORING', '[MONITOR_INTEGRATION] Sync error', {
                error: error.message,
                stack: error.stack
            });
        }
    }
    
    /**
     * Sync investigation state
     */
    syncInvestigationState(investigation) {
        const aiInvestigation = this.aiCore.stateStore.getState('monitoring.investigation');
        
        // Update AI core with monitor state
        if (investigation.active !== aiInvestigation.status) {
            if (investigation.active) {
                this.aiCore.stateStore.updateState('monitoring.investigation.status', 'active');
                if (investigation.startTime) {
                    this.aiCore.stateStore.updateState('monitoring.investigation.startTime', investigation.startTime);
                }
            } else {
                this.aiCore.stateStore.updateState('monitoring.investigation.status', 'idle');
            }
        }
        
        // Update progress
        if (investigation.progress !== undefined) {
            this.aiCore.stateStore.updateState('monitoring.investigation.progress', investigation.progress);
        }
        
        // Update time remaining
        if (investigation.timeRemaining !== undefined) {
            this.aiCore.stateStore.updateState('monitoring.investigation.timeRemaining', investigation.timeRemaining);
        }
    }
    
    /**
     * Sync Unity state
     */
    syncUnityState(unity) {
        const aiUnity = this.aiCore.stateStore.getState('system.unity');
        
        // Update status
        if (unity.status && unity.status !== aiUnity.status) {
            this.aiCore.stateStore.updateState('system.unity.status', unity.status);
        }
        
        // Update health
        if (unity.health !== undefined) {
            this.aiCore.stateStore.updateState('system.unity.health', unity.health);
        }
        
        // Update metrics
        if (unity.metrics) {
            this.aiCore.stateStore.updateState('system.unity.metrics', {
                ...aiUnity.metrics,
                ...unity.metrics
            });
        }
    }
    
    /**
     * Sync system state
     */
    syncSystemState(system) {
        // Sync server state
        if (system.server) {
            const aiServer = this.aiCore.stateStore.getState('system.server');
            if (system.server.status && system.server.status !== aiServer.status) {
                this.aiCore.stateStore.updateState('system.server.status', system.server.status);
            }
            if (system.server.health !== undefined) {
                this.aiCore.stateStore.updateState('system.server.health', system.server.health);
            }
        }
        
        // Sync database state
        if (system.database) {
            const aiDatabase = this.aiCore.stateStore.getState('system.database');
            if (system.database.status && system.database.status !== aiDatabase.status) {
                this.aiCore.stateStore.updateState('system.database.status', system.database.status);
            }
            if (system.database.health !== undefined) {
                this.aiCore.stateStore.updateState('system.database.health', system.database.health);
            }
        }
    }
    
    /**
     * Get AI decision for investigation
     * Replaces broken investigation logic in cerberus.ps1
     */
    shouldStartInvestigation() {
        const decision = this.aiCore.decisionEngine.shouldStartInvestigation();
        return {
            should: decision.should,
            reason: decision.reason,
            confidence: decision.confidence,
            priority: decision.priority,
            issues: decision.issues || []
        };
    }
    
    /**
     * Get AI decision for Unity pause
     * Replaces broken pause logic in cerberus.ps1
     */
    shouldPauseUnity() {
        const decision = this.aiCore.decisionEngine.shouldPauseUnity();
        return {
            should: decision.should,
            reason: decision.reason,
            confidence: decision.confidence,
            priority: decision.priority
        };
    }
    
    /**
     * Get AI decision for Unity resume
     * Replaces broken resume logic in cerberus.ps1
     */
    shouldResumeUnity() {
        const decision = this.aiCore.decisionEngine.shouldResumeUnity();
        return {
            should: decision.should,
            reason: decision.reason,
            confidence: decision.confidence,
            priority: decision.priority
        };
    }
    
    /**
     * Get investigation status from AI core
     * Replaces reading from monitor-status.json
     */
    getInvestigationStatus() {
        const investigation = this.aiCore.stateStore.getState('monitoring.investigation');
        const activeIssues = this.aiCore.issueDetector.getActiveIssues();
        
        return {
            active: investigation.status === 'active' || investigation.status === 'starting',
            status: investigation.status,
            startTime: investigation.startTime,
            timeout: investigation.timeout || 15,
            progress: investigation.progress || 0,
            timeRemaining: investigation.timeRemaining || 0,
            issues: activeIssues,
            issuesCount: activeIssues.length
        };
    }
    
    /**
     * Start investigation (via AI decision engine)
     * Replaces broken investigation start logic
     */
    startInvestigation() {
        const decision = this.shouldStartInvestigation();
        if (decision.should) {
            this.aiCore.decisionEngine.startInvestigation(decision);
            return {
                success: true,
                reason: decision.reason
            };
        }
        return {
            success: false,
            reason: decision.reason
        };
    }
    
    /**
     * Complete investigation (via AI decision engine)
     * Replaces broken investigation completion logic
     */
    completeInvestigation() {
        this.aiCore.decisionEngine.completeInvestigation();
        return {
            success: true,
            timestamp: Date.now()
        };
    }
    
    /**
     * Detect issue from log line (AI detection)
     * Uses AI system for detection, falls back to pattern matching
     */
    detectIssue(logLine) {
        try {
            // Process log line through AI log processor
            // This parses the line and emits events if it's an error
            let detectedIssue = null;
            let detectionMethod = 'pattern';
            let confidence = 0.5;
            
            // Set up one-time listener for error detection
            const errorHandler = (parsedLog) => {
                // Try to detect issue from parsed log
                const detected = this.aiCore.issueDetector.detectFromLog(parsedLog);
                if (detected && detected.issue) {
                    detectedIssue = detected.issue;
                    detectionMethod = detected.method || 'pattern';
                    confidence = detected.confidence || 0.8;
                }
            };
            
            // Listen for error events
            this.aiCore.logProcessor.once('error', errorHandler);
            
            // Process the line (this will parse it and emit events)
            this.aiCore.logProcessor.processLine(logLine);
            
            // Remove listener after processing
            this.aiCore.logProcessor.removeListener('error', errorHandler);
            
            // If issue was detected, return it
            if (detectedIssue) {
                return {
                    issue: {
                        type: detectedIssue.type,
                        severity: detectedIssue.severity,
                        source: detectedIssue.source || 'log',
                        message: detectedIssue.message || logLine,
                        confidence: confidence,
                        method: detectionMethod
                    },
                    confidence: confidence,
                    method: detectionMethod
                };
            }
            
            // No issue detected by AI - return null (fallback to pattern matching in cerberus.ps1)
            return null;
        } catch (error) {
            gameLogger.error('MONITORING', '[MONITOR_INTEGRATION] Detect issue error', {
                error: error.message,
                stack: error.stack
            });
            return null;
        }
    }
    
    /**
     * Add issue to AI detector
     * Replaces issue-detector.js --add-issue-file functionality
     */
    addIssue(issueData) {
        try {
            // Create issue object
            const issue = {
                type: issueData.type || 'error',
                severity: issueData.severity || 'critical',
                method: 'manual',
                details: {
                    message: issueData.message || '',
                    source: issueData.source || 'server',
                    tableId: issueData.tableId || null
                },
                timestamp: Date.now()
            };
            
            // Detect issue via AI system
            const detected = this.aiCore.issueDetector.detectIssue(issue);
            
            return {
                success: true,
                issueId: detected.id,
                issue: detected
            };
        } catch (error) {
            gameLogger.error('MONITORING', '[MONITOR_INTEGRATION] Add issue error', {
                error: error.message,
                stack: error.stack
            });
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    /**
     * Get active issues from AI detector
     * Replaces reading from pending-issues.json
     */
    getActiveIssues() {
        const issues = this.aiCore.issueDetector.getActiveIssues();
        // Ensure issues is an array
        const issuesArray = Array.isArray(issues) ? issues : [];
        return {
            count: issuesArray.length,
            issues: issuesArray.map(i => ({
                id: i.id,
                type: i.type,
                severity: i.severity,
                priority: i.priority,
                confidence: i.confidence,
                rootCause: i.rootCause,
                possibleFixes: i.possibleFixes,
                firstSeen: i.firstSeen,
                lastSeen: i.lastSeen,
                count: i.count
            }))
        };
    }
    
    /**
     * Get suggested fixes for an issue
     * Enhances existing fix-tracker.js
     */
    getSuggestedFixes(issueId) {
        const issue = this.aiCore.issueDetector.getIssue(issueId);
        if (!issue) {
            return {
                error: 'Issue not found',
                issueId
            };
        }
        
        const suggestions = this.aiCore.fixTracker.getSuggestedFixes(issue);
        return {
            issue,
            shouldTry: suggestions.shouldTry,
            shouldNotTry: suggestions.shouldNotTry,
            confidence: suggestions.confidence
        };
    }
    
    /**
     * Record fix attempt
     * Enhances existing fix tracking
     */
    recordFixAttempt(issueId, fixMethod, fixDetails, result) {
        return this.aiCore.fixTracker.recordAttempt(issueId, fixMethod, fixDetails, result);
    }
    
    /**
     * Get live statistics
     * Replaces Show-Statistics in cerberus.ps1
     */
    getLiveStatistics() {
        return this.aiCore.liveStatistics.getStatistics();
    }
    
    /**
     * Get formatted statistics for display
     * Human-readable version
     */
    getFormattedStatistics() {
        return this.aiCore.liveStatistics.formatForDisplay();
    }
    
    /**
     * Query AI system
     * AI can answer any question
     */
    query(question) {
        return this.aiCore.communication.query(question);
    }
    
    /**
     * Get complete status report
     */
    getStatusReport() {
        return this.aiCore.communication.getStatusReport();
    }
    
    /**
     * Update monitor-status.json with AI core state
     * Keeps cerberus.ps1 in sync
     */
    updateMonitorStatus() {
        try {
            const fs = require('fs');
            const statusFile = path.join(this.projectRoot, 'monitoring', 'monitor-status.json');
            
            const investigation = this.getInvestigationStatus();
            const issues = this.getActiveIssues();
            const stats = this.getLiveStatistics();
            
            const status = {
                timestamp: Date.now(),
                investigation: {
                    active: investigation.active,
                    status: investigation.status,
                    startTime: investigation.startTime,
                    timeout: investigation.timeout,
                    progress: investigation.progress,
                    timeRemaining: investigation.timeRemaining,
                    issuesCount: issues.count
                },
                issues: {
                    active: issues.count,
                    list: issues.issues.slice(0, 10) // Top 10
                },
                system: {
                    server: stats.system.server,
                    database: stats.system.database,
                    unity: stats.system.unity
                },
                recommendations: stats.recommendations,
                aiCore: {
                    active: true,
                    lastSync: this.lastSync
                }
            };
            
            fs.writeFileSync(statusFile, JSON.stringify(status, null, 2), 'utf8');
            
            return status;
        } catch (error) {
            gameLogger.error('MONITORING', '[MONITOR_INTEGRATION] Update status error', {
                error: error.message,
                stack: error.stack
            });
            return null;
        }
    }
    
    /**
     * Cleanup
     */
    destroy() {
        this.integrationActive = false;
        this.aiCore.destroy();
    }
}

module.exports = CerberusIntegration;
