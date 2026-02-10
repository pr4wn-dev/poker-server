/**
 * BrokenPromise Integration - Bridge PowerShell BrokenPromise <-> AI Core
 * 
 * This bridges the existing PowerShell BrokenPromise.ps1 with the new AI-first core.
 * Allows gradual migration while preserving all existing functionality.
 */

const path = require('path');
const AIMonitorCore = require('../core/AIMonitorCore');
const gameLogger = require('../../src/utils/GameLogger');

class BrokenPromiseIntegration {
    constructor(projectRoot, options = {}) {
        this.projectRoot = projectRoot;
        this._aiCore = null; // LEARNING SYSTEM FIX: Lazy initialization to prevent memory overflow
        this._aiCoreInitialized = false;
        
        // Integration state
        this.integrationActive = true;
        this.lastSync = Date.now();
        this.syncInterval = 1000; // Sync every second
        this.syncIntervalId = null; // Store interval ID for cleanup
        
        // Only start sync loop if not in CLI mode (options.startSyncLoop defaults to true for backward compatibility)
        // CLI mode should not start sync loop to allow process to exit
        if (options.startSyncLoop !== false) {
            this.startSyncLoop();
        }
        
        gameLogger.info('MONITORING', '[MONITOR_INTEGRATION] Initialized (lazy AI core)', {
            message: 'Bridging PowerShell monitor with AI core'
        });
    }
    
    /**
     * LEARNING SYSTEM FIX: Lazy getter for aiCore - only creates it when needed
     * This prevents memory overflow during HTTP server startup
     */
    get aiCore() {
        if (!this._aiCore) {
            this._aiCore = new AIMonitorCore(this.projectRoot);
            // Don't initialize here - let it initialize lazily when first used
        }
        return this._aiCore;
    }
    
    /**
     * Start sync loop - Keep AI core and BrokenPromise.ps1 in sync
     */
    startSyncLoop() {
        this.syncIntervalId = setInterval(() => {
            if (this.integrationActive) {
                this.syncWithMonitor();
            }
        }, this.syncInterval);
    }
    
    /**
     * Stop sync loop
     */
    stopSyncLoop() {
        if (this.syncIntervalId) {
            clearInterval(this.syncIntervalId);
            this.syncIntervalId = null;
        }
    }
    
    /**
     * Sync with BrokenPromise.ps1
     * Reads monitor-status.json and updates AI core state
     */
    syncWithMonitor() {
        // LEARNING SYSTEM FIX: Don't sync if aiCore isn't initialized yet
        // This prevents memory overflow during HTTP server startup
        if (!this._aiCore) {
            return; // Skip sync until aiCore is actually needed
        }
        
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
     * Replaces broken investigation logic in BrokenPromise.ps1
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
     * Replaces broken pause logic in BrokenPromise.ps1
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
     * Replaces broken resume logic in BrokenPromise.ps1
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
     * Get AI decision for server start
     */
    shouldStartServer() {
        const decision = this.aiCore.decisionEngine.shouldStartServer();
        return {
            should: decision.should,
            reason: decision.reason,
            confidence: decision.confidence,
            priority: decision.priority
        };
    }
    
    /**
     * Get AI decision for Unity start
     */
    shouldStartUnity() {
        const decision = this.aiCore.decisionEngine.shouldStartUnity();
        return {
            should: decision.should,
            reason: decision.reason,
            confidence: decision.confidence,
            priority: decision.priority
        };
    }
    
    /**
     * Get AI decision for simulation start
     */
    shouldStartSimulation() {
        const decision = this.aiCore.decisionEngine.shouldStartSimulation();
        return {
            should: decision.should,
            reason: decision.reason,
            confidence: decision.confidence,
            priority: decision.priority
        };
    }
    
    /**
     * Get latest prompt for user to deliver
     */
    getLatestPrompt() {
        if (!this.aiCore.promptGenerator) {
            return null;
        }
        
        const prompts = this.aiCore.stateStore.getState('ai.prompts') || [];
        if (prompts.length === 0) {
            return null;
        }
        
        // Get most recent prompt
        const latestPrompt = prompts[prompts.length - 1];
        
        // Check if it's been delivered (we'll track this)
        const deliveredPrompts = this.aiCore.stateStore.getState('ai.deliveredPrompts') || [];
        const isDelivered = deliveredPrompts.includes(latestPrompt.id);
        
        return {
            id: latestPrompt.id,
            type: latestPrompt.type,
            prompt: latestPrompt.prompt,
            timestamp: latestPrompt.timestamp,
            delivered: isDelivered
        };
    }
    
    /**
     * Mark prompt as delivered
     */
    getComplianceVerification(promptId) {
        if (!this.aiCore || !this.aiCore.complianceVerifier) {
            return null;
        }
        
        const prompt = this.aiCore.complianceVerifier.getPromptById(promptId);
        if (!prompt) {
            return null;
        }
        
        // Verify compliance for this prompt
        const verification = this.aiCore.complianceVerifier.verifyCompliance(prompt);
        
        return {
            promptId: verification.promptId,
            timestamp: verification.timestamp,
            compliant: verification.compliant,
            complianceResult: verification.complianceResult,
            partsWorked: verification.partsWorked,
            partsSkipped: verification.partsSkipped,
            verification: verification.verification
        };
    }
    
    markPromptDelivered(promptId) {
        const deliveredPrompts = this.aiCore.stateStore.getState('ai.deliveredPrompts') || [];
        if (!deliveredPrompts.includes(promptId)) {
            deliveredPrompts.push(promptId);
            this.aiCore.stateStore.updateState('ai.deliveredPrompts', deliveredPrompts);
        }
    }
    
    /**
     * Get investigation status from AI core
     * Replaces reading from monitor-status.json
     */
    getInvestigationStatus() {
        const investigation = this.aiCore.stateStore.getState('monitoring.investigation');
        const activeIssues = this.aiCore.issueDetector.getActiveIssues();
        
        // Null check: Provide default for investigation state
        if (!investigation || typeof investigation !== 'object') {
            return {
                active: false,
                status: 'inactive',
                startTime: null,
                timeout: 15,
                progress: 0,
                timeRemaining: 0,
                issues: activeIssues || [],
                issuesCount: (activeIssues || []).length
            };
        }
        
        return {
            active: investigation.status === 'active' || investigation.status === 'starting',
            status: investigation.status || 'inactive',
            startTime: investigation.startTime || null,
            timeout: investigation.timeout || 15,
            progress: investigation.progress || 0,
            timeRemaining: investigation.timeRemaining || 0,
            issues: activeIssues || [],
            issuesCount: (activeIssues || []).length
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
            if (!this.aiCore || !this.aiCore.logProcessor || !this.aiCore.issueDetector) {
                return null; // Fallback to pattern matching
            }
            
            if (!logLine || typeof logLine !== 'string') {
                return null;
            }
            
            // Process log line through AI log processor
            // This parses the line and emits events if it's an error
            let detectedIssue = null;
            let detectionMethod = 'pattern';
            let confidence = 0.5;
            
            // Set up one-time listener for error detection
            const errorHandler = (parsedLog) => {
                try {
                    // Try to detect issue from parsed log
                    const detected = this.aiCore.issueDetector.detectFromLog(parsedLog);
                    if (detected && detected.issue) {
                        detectedIssue = detected.issue;
                        detectionMethod = detected.method || 'pattern';
                        confidence = detected.confidence || 0.8;
                    }
                } catch (error) {
                    gameLogger.error('MONITORING', '[MONITOR_INTEGRATION] Error in error handler', {
                        error: error.message
                    });
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
                        type: detectedIssue.type || 'unknown',
                        severity: detectedIssue.severity || 'medium',
                        source: detectedIssue.source || 'log',
                        message: detectedIssue.message || logLine,
                        confidence: confidence,
                        method: detectionMethod
                    },
                    confidence: confidence,
                    method: detectionMethod
                };
            }
            
            // No issue detected by AI - return null (fallback to pattern matching in BrokenPromise.ps1)
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
        try {
            if (!this.aiCore || !this.aiCore.issueDetector) {
                return { count: 0, issues: [] };
            }
            const issues = this.aiCore.issueDetector.getActiveIssues();
            // Ensure issues is an array
            const issuesArray = Array.isArray(issues) ? issues : [];
            return {
                count: issuesArray.length,
                issues: issuesArray.map(i => ({
                    id: i.id || 'unknown',
                    type: i.type || 'unknown',
                    severity: i.severity || 'medium',
                    priority: i.priority || 0,
                    confidence: i.confidence || 0,
                    rootCause: i.rootCause || null,
                    possibleFixes: i.possibleFixes || [],
                    firstSeen: i.firstSeen || Date.now(),
                    lastSeen: i.lastSeen || Date.now(),
                    count: i.count || 1
                }))
            };
        } catch (error) {
            gameLogger.error('MONITORING', '[MONITOR_INTEGRATION] Get active issues error', {
                error: error.message,
                stack: error.stack
            });
            return { count: 0, issues: [] };
        }
    }
    
    /**
     * Get suggested fixes for an issue
     * Uses AIFixTracker for learning
     */
    getSuggestedFixes(issueId) {
        try {
            if (!this.aiCore || !this.aiCore.issueDetector || !this.aiCore.fixTracker) {
                return {
                    error: 'AI core not available',
                    issueId
                };
            }
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
                shouldTry: Array.isArray(suggestions.shouldTry) ? suggestions.shouldTry : [],
                shouldNotTry: Array.isArray(suggestions.shouldNotTry) ? suggestions.shouldNotTry : [],
                confidence: suggestions.confidence || 0
            };
        } catch (error) {
            gameLogger.error('MONITORING', '[MONITOR_INTEGRATION] Get suggested fixes error', {
                issueId,
                error: error.message,
                stack: error.stack
            });
            return {
                error: error.message,
                issueId
            };
        }
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
     * Replaces Show-Statistics in BrokenPromise.ps1
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
        if (!this.aiCore || !this.aiCore.communicationInterface) {
            return {
                error: 'AI core or communication interface not available',
                question
            };
        }
        return this.aiCore.communicationInterface.query(question);
    }
    
    /**
     * Get complete status report
     */
    getStatusReport() {
        if (!this.aiCore || !this.aiCore.communicationInterface) {
            return {
                error: 'AI core or communication interface not available',
                timestamp: Date.now()
            };
        }
        return this.aiCore.communicationInterface.getStatusReport();
    }
    
    /**
     * Get issue by ID
     */
    getIssue(issueId) {
        try {
            if (!this.aiCore || !this.aiCore.issueDetector) {
                return null;
            }
            return this.aiCore.issueDetector.getIssue(issueId);
        } catch (error) {
            gameLogger.error('MONITORING', '[MONITOR_INTEGRATION] Get issue error', {
                issueId,
                error: error.message,
                stack: error.stack
            });
            return null;
        }
    }
    
    /**
     * Get comprehensive system report
     */
    getSystemReport() {
        try {
            if (!this.aiCore) {
                return { error: 'AI core not available', timestamp: Date.now() };
            }
            return this.aiCore.getSystemReport();
        } catch (error) {
            gameLogger.error('MONITORING', '[MONITOR_INTEGRATION] Get system report error', {
                error: error.message,
                stack: error.stack
            });
            return { error: error.message, timestamp: Date.now() };
        }
    }
    
    /**
     * Get component health
     */
    getComponentHealth() {
        try {
            if (!this.aiCore) {
                return { error: 'AI core not available', timestamp: Date.now() };
            }
            return this.aiCore.getComponentHealth();
        } catch (error) {
            gameLogger.error('MONITORING', '[MONITOR_INTEGRATION] Get component health error', {
                error: error.message,
                stack: error.stack
            });
            return { error: error.message, timestamp: Date.now() };
        }
    }
    
    /**
     * Attempt auto-fix for an issue
     */
    async attemptAutoFix(issueId) {
        try {
            if (!this.aiCore) {
                return { success: false, reason: 'AI core not available' };
            }
            return await this.aiCore.attemptAutoFix(issueId);
        } catch (error) {
            gameLogger.error('MONITORING', '[MONITOR_INTEGRATION] Attempt auto-fix error', {
                issueId,
                error: error.message,
                stack: error.stack
            });
            return { success: false, reason: error.message };
        }
    }
    
    /**
     * Get auto-fix statistics
     */
    getAutoFixStatistics() {
        try {
            if (!this.aiCore) {
                return { enabled: false, totalAttempts: 0, successful: 0, failed: 0 };
            }
            return this.aiCore.getAutoFixStatistics();
        } catch (error) {
            gameLogger.error('MONITORING', '[MONITOR_INTEGRATION] Get auto-fix statistics error', {
                error: error.message,
                stack: error.stack
            });
            return { enabled: false, totalAttempts: 0, successful: 0, failed: 0, error: error.message };
        }
    }
    
    /**
     * Get auto-fix suggestions for an issue
     */
    getAutoFixSuggestions(issueId) {
        try {
            if (!this.aiCore) {
                return [];
            }
            return this.aiCore.getAutoFixSuggestions(issueId);
        } catch (error) {
            gameLogger.error('MONITORING', '[MONITOR_INTEGRATION] Get auto-fix suggestions error', {
                issueId,
                error: error.message,
                stack: error.stack
            });
            return [];
        }
    }
    
    /**
     * Enable/disable auto-fix
     */
    setAutoFixEnabled(enabled) {
        try {
            if (this.aiCore) {
                this.aiCore.setAutoFixEnabled(enabled);
            }
        } catch (error) {
            gameLogger.error('MONITORING', '[MONITOR_INTEGRATION] Set auto-fix enabled error', {
                enabled,
                error: error.message,
                stack: error.stack
            });
        }
    }
    
    /**
     * Update monitor-status.json with AI core state
     * Keeps BrokenPromise.ps1 in sync
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
     * Call beforeAIAction - Check for misdiagnosis patterns and get suggestions
     */
    async beforeAIAction(action) {
        try {
            if (!this.aiCore) {
                return { 
                    warnings: [], 
                    recommendations: [], 
                    patterns: [], 
                    alternatives: [], 
                    confidence: null,
                    webSearchRequired: false,
                    webSearchTerms: []
                };
            }
            return await this.aiCore.beforeAIAction(action);
        } catch (error) {
            gameLogger.error('MONITORING', '[MONITOR_INTEGRATION] beforeAIAction error', {
                error: error.message,
                stack: error.stack
            });
            return { 
                warnings: [{ type: 'ERROR', message: error.message }], 
                recommendations: [], 
                patterns: [], 
                alternatives: [], 
                confidence: null,
                webSearchRequired: false,
                webSearchTerms: []
            };
        }
    }
    
    /**
     * Call afterAIAction - Record outcome for learning
     */
    async afterAIAction(action, result) {
        try {
            if (!this.aiCore) {
                return { success: false, reason: 'AI core not available' };
            }
            return await this.aiCore.afterAIAction(action, result);
        } catch (error) {
            gameLogger.error('MONITORING', '[MONITOR_INTEGRATION] afterAIAction error', {
                error: error.message,
                stack: error.stack
            });
            return { success: false, reason: error.message };
        }
    }
    
    /**
     * Cleanup
     */
    destroy() {
        this.integrationActive = false;
        
        // CRITICAL: Stop sync loop interval to prevent zombie processes
        this.stopSyncLoop();
        
        // Destroy AI core (stops all its intervals)
        // LEARNING SYSTEM FIX: Check _aiCore instead of aiCore getter to avoid creating it just to destroy it
        if (this._aiCore) {
            this._aiCore.destroy();
        }
    }
}

module.exports = BrokenPromiseIntegration;
