/**
 * AI Live Statistics - AI Sees Everything
 * 
 * Comprehensive, structured information for AI consumption.
 * AI can see system health, game state, investigation status,
 * active issues, fix attempts, learning, and recommendations.
 * 
 * Much more verbose and informational than human-focused stats.
 */

class AILiveStatistics {
    constructor(stateStore, issueDetector, fixTracker, decisionEngine, logProcessor) {
        this.stateStore = stateStore;
        this.issueDetector = issueDetector;
        this.fixTracker = fixTracker;
        this.decisionEngine = decisionEngine;
        this.logProcessor = logProcessor;
        
        // Statistics cache (update every second)
        this.cache = null;
        this.cacheTime = 0;
        this.cacheInterval = 1000; // 1 second
    }
    
    /**
     * Get complete statistics
     * AI can see everything it needs
     */
    getStatistics() {
        const now = Date.now();
        
        // Use cache if recent
        if (this.cache && (now - this.cacheTime) < this.cacheInterval) {
            return this.cache;
        }
        
        // Generate fresh statistics
        this.cache = this.generateStatistics();
        this.cacheTime = now;
        
        return this.cache;
    }
    
    /**
     * Generate comprehensive statistics
     */
    generateStatistics() {
        return {
            timestamp: Date.now(),
            
            // System Health (for AI to understand)
            system: this.getSystemHealth(),
            
            // Game State (for AI to understand)
            game: this.getGameState(),
            
            // Monitoring State (for AI to understand)
            monitoring: this.getMonitoringState(),
            
            // Issue State (for AI to understand)
            issues: this.getIssueState(),
            
            // Fix State (for AI to understand)
            fixes: this.getFixState(),
            
            // Learning State (for AI to understand)
            learning: this.getLearningState(),
            
            // AI Recommendations (for AI to act on)
            recommendations: this.getRecommendations(),
            
            // Decision State (what AI decided)
            decisions: this.getDecisionState()
        };
    }
    
    /**
     * Get system health statistics
     */
    getSystemHealth() {
        const system = this.stateStore.getState('system');
        const health = this.stateStore.getState('system')?._calculateSystemHealth?.() || {};
        
        return {
            overall: {
                status: health.status || 'unknown',
                health: health.overall || 0,
                timestamp: Date.now()
            },
            server: {
                status: system.server?.status || 'unknown',
                health: system.server?.health || 0,
                metrics: system.server?.metrics || {},
                recentErrors: this.getRecentErrors('server', 10),
                trends: this.getTrends('server'),
                lastCheck: system.server?.lastCheck
            },
            database: {
                status: system.database?.status || 'unknown',
                health: system.database?.health || 0,
                metrics: system.database?.metrics || {},
                recentErrors: this.getRecentErrors('database', 10),
                trends: this.getTrends('database'),
                lastCheck: system.database?.lastCheck
            },
            unity: {
                status: system.unity?.status || 'unknown',
                health: system.unity?.health || 0,
                metrics: system.unity?.metrics || {},
                uiState: this.getUIState(),
                recentErrors: this.getRecentErrors('unity', 10),
                trends: this.getTrends('unity'),
                lastCheck: system.unity?.lastCheck
            }
        };
    }
    
    /**
     * Get game state statistics
     */
    getGameState() {
        const game = this.stateStore.getState('game');
        
        return {
            activeTables: game.tables?.size || 0,
            activePlayers: game.players?.size || 0,
            chipState: {
                total: game.chips?.totalInSystem || 0,
                byTable: this.getChipsByTable(),
                byPlayer: this.getChipsByPlayer(),
                anomalies: this.getChipAnomalies(),
                history: this.getChipHistory(20), // Last 20 movements
                integrity: this.verifyChipIntegrity()
            },
            currentPhase: game.phase || 'unknown',
            hands: {
                current: game.hands?.current || null,
                total: (Array.isArray(game.hands?.history) ? game.hands.history.length : 0),
                recent: (Array.isArray(game.hands?.history) ? game.hands.history.slice(-10) : [])
            },
            recentActivity: this.getRecentActivity(10)
        };
    }
    
    /**
     * Get monitoring state statistics
     */
    getMonitoringState() {
        const monitoring = this.stateStore.getState('monitoring');
        const investigation = monitoring.investigation || {};
        const verification = monitoring.verification || {};
        const detection = monitoring.detection || {};
        
        return {
            investigation: {
                status: investigation.status || 'idle',
                progress: investigation.progress || 0,
                timeRemaining: investigation.timeRemaining || 0,
                issuesFound: investigation.issues?.length || 0,
                startTime: investigation.startTime,
                timeout: investigation.timeout || 15,
                history: investigation.history || [],
                recentHistory: (Array.isArray(investigation.history) ? investigation.history.slice(-5) : [])
            },
            verification: {
                status: verification.status || 'idle',
                progress: verification.progress || 0,
                startTime: verification.startTime,
                period: verification.period || 0,
                results: verification.results || [],
                history: verification.history || []
            },
            detection: {
                activeDetectors: detection.activeDetectors || [],
                detectionRate: detection.detectionRate || 0,
                falsePositives: detection.falsePositives || 0,
                accuracy: detection.accuracy || 0,
                lastDetection: detection.lastDetection,
                stats: this.issueDetector.getStats()
            }
        };
    }
    
    /**
     * Get issue state statistics
     */
    getIssueState() {
        const activeIssues = this.issueDetector.getActiveIssues();
        const allIssues = this.stateStore.getState('issues.detected') || [];
        const resolvedIssues = this.stateStore.getState('issues.resolved') || [];
        
        // Ensure all are arrays
        const activeIssuesArray = Array.isArray(activeIssues) ? activeIssues : [];
        const allIssuesArray = Array.isArray(allIssues) ? allIssues : [];
        const resolvedIssuesArray = Array.isArray(resolvedIssues) ? resolvedIssues : [];
        
        return {
            active: {
                count: activeIssuesArray.length,
                bySeverity: this.groupIssuesBySeverity(activeIssuesArray),
                byType: this.groupIssuesByType(activeIssuesArray),
                issues: activeIssuesArray.map(i => ({
                    id: i.id,
                    type: i.type,
                    severity: i.severity,
                    priority: i.priority,
                    confidence: i.confidence,
                    rootCause: i.rootCause,
                    firstSeen: i.firstSeen,
                    lastSeen: i.lastSeen,
                    count: i.count
                }))
            },
            resolved: {
                count: resolvedIssuesArray.length,
                recent: resolvedIssuesArray.slice(-10)
            },
            total: {
                count: allIssuesArray.length,
                bySeverity: this.groupIssuesBySeverity(allIssuesArray),
                byType: this.groupIssuesByType(allIssuesArray)
            },
            patterns: this.getIssuePatterns()
        };
    }
    
    /**
     * Get fix state statistics
     */
    getFixState() {
        const stats = this.fixTracker.getStats();
        const recentAttempts = this.fixTracker.getRecentAttempts(10);
        const workingFixes = this.fixTracker.getWorkingFixes();
        let failedFixes = [];
        try {
            failedFixes = this.fixTracker.getFailedFixes() || [];
            // Ensure it's an array
            if (!Array.isArray(failedFixes)) {
                failedFixes = [];
            }
        } catch (error) {
            failedFixes = [];
        }
        
        return {
            attempts: {
                total: stats.totalAttempts,
                successes: stats.successfulAttempts,
                failures: stats.failedAttempts,
                successRate: stats.successRate,
                recent: recentAttempts.map(a => ({
                    id: a.id,
                    issueId: a.issueId,
                    issueType: a.issueType,
                    method: a.fixMethod,
                    result: a.result,
                    timestamp: a.timestamp
                }))
            },
            workingFixes: workingFixes.map(f => ({
                pattern: f.pattern,
                method: f.method,
                successRate: f.successRate,
                attempts: f.attempts
            })),
            failedFixes: failedFixes.map(f => ({
                method: f.method,
                totalFailures: f.totalFailures,
                issues: f.issues.length
            })),
            knowledge: {
                size: stats.knowledgeBaseSize,
                working: stats.workingFixes,
                failed: stats.failedFixes
            }
        };
    }
    
    /**
     * Get learning state statistics
     */
    getLearningState() {
        const learning = this.stateStore.getState('learning') || {};
        
        return {
            patternsLearned: learning.patterns?.size || 0,
            knowledgeRules: learning.knowledge?.length || 0,
            improvements: learning.improvements?.length || 0,
            recentImprovements: (Array.isArray(learning.improvements) ? learning.improvements.slice(-5) : []),
            fixAttempts: {
                total: Object.keys(learning.fixAttempts || {}).length,
                byIssue: this.getFixAttemptsByIssue()
            },
            successRates: this.getSuccessRatesByMethod()
        };
    }
    
    /**
     * Get AI recommendations
     */
    getRecommendations() {
        const decisions = this.decisionEngine;
        
        return {
            investigation: decisions.shouldStartInvestigation(),
            pause: decisions.shouldPauseUnity(),
            resume: decisions.shouldResumeUnity(),
            fixes: decisions.whatFixesToTry(),
            avoid: decisions.whatToAvoid(),
            priority: decisions.whatsThePriority()
        };
    }
    
    /**
     * Get decision state
     */
    getDecisionState() {
        const recent = this.decisionEngine.getRecentDecisions(5);
        const stats = this.decisionEngine.getStats();
        
        return {
            recent: recent.map(d => ({
                timestamp: d.timestamp,
                investigation: d.decisions.investigation.should,
                pause: d.decisions.pause.should,
                resume: d.decisions.resume.should,
                fixesCount: d.decisions.fixes.length
            })),
            stats
        };
    }
    
    /**
     * Helper: Get recent errors
     */
    getRecentErrors(source, limit = 10) {
        const logs = this.logProcessor.logs[source] || [];
        return logs
            .filter(log => log.level === 'error')
            .slice(-limit)
            .reverse();
    }
    
    /**
     * Helper: Get trends
     */
    getTrends(source) {
        // Simple trend calculation
        const logs = this.logProcessor.logs[source] || [];
        const recent = logs.slice(-100);
        
        const errors = recent.filter(l => l.level === 'error').length;
        const warnings = recent.filter(l => l.level === 'warning').length;
        
        return {
            errorRate: errors / recent.length,
            warningRate: warnings / recent.length,
            trend: errors > 5 ? 'increasing' : errors < 2 ? 'decreasing' : 'stable'
        };
    }
    
    /**
     * Helper: Get UI state
     */
    getUIState() {
        const unity = this.stateStore.getState('system.unity');
        return unity?.uiState || {};
    }
    
    /**
     * Helper: Get chips by table
     */
    getChipsByTable() {
        const chips = this.stateStore.getState('game.chips');
        if (!chips || !chips.byTable) return {};
        
        const result = {};
        chips.byTable.forEach((count, tableId) => {
            result[tableId] = count;
        });
        return result;
    }
    
    /**
     * Helper: Get chips by player
     */
    getChipsByPlayer() {
        const chips = this.stateStore.getState('game.chips');
        if (!chips || !chips.byPlayer) return {};
        
        const result = {};
        chips.byPlayer.forEach((count, playerId) => {
            result[playerId] = count;
        });
        return result;
    }
    
    /**
     * Helper: Get chip anomalies
     */
    getChipAnomalies() {
        // Check for anomalies in chip movements
        const history = this.stateStore.getState('game.chips.history') || [];
        // Ensure history is an array
        if (!Array.isArray(history)) {
            return [];
        }
        const recent = history.slice(-20);
        
        const anomalies = [];
        for (const entry of recent) {
            if (Math.abs(entry.change || 0) > 1000000) { // Large movement
                anomalies.push(entry);
            }
        }
        
        return anomalies;
    }
    
    /**
     * Helper: Get chip history
     */
    getChipHistory(limit = 20) {
        const history = this.stateStore.getState('game.chips.history') || [];
        // Ensure history is an array
        if (!Array.isArray(history)) {
            return [];
        }
        return history.slice(-limit).reverse();
    }
    
    /**
     * Helper: Verify chip integrity
     */
    verifyChipIntegrity() {
        const chips = this.stateStore.getState('game.chips');
        if (!chips) return { valid: false, reason: 'No chip state' };
        
        let tableTotal = 0;
        chips.byTable?.forEach(count => { tableTotal += count; });
        
        let playerTotal = 0;
        chips.byPlayer?.forEach(count => { playerTotal += count; });
        
        const expected = tableTotal + playerTotal;
        const actual = chips.totalInSystem || 0;
        const difference = actual - expected;
        
        return {
            valid: Math.abs(difference) < 1,
            expected,
            actual,
            difference,
            tableTotal,
            playerTotal
        };
    }
    
    /**
     * Helper: Get recent activity
     */
    getRecentActivity(limit = 10) {
        const history = this.stateStore.getState('game.chips.history') || [];
        // Ensure history is an array
        if (!Array.isArray(history)) {
            return [];
        }
        return history.slice(-limit).reverse();
    }
    
    /**
     * Helper: Group issues by severity
     */
    groupIssuesBySeverity(issues) {
        const groups = { critical: 0, high: 0, medium: 0, low: 0 };
        // Ensure issues is an array
        if (!Array.isArray(issues)) {
            return groups;
        }
        issues.forEach(issue => {
            const severity = issue.severity?.toLowerCase() || 'medium';
            if (groups[severity] !== undefined) {
                groups[severity]++;
            }
        });
        return groups;
    }
    
    /**
     * Helper: Group issues by type
     */
    groupIssuesByType(issues) {
        const groups = {};
        // Ensure issues is an array
        if (!Array.isArray(issues)) {
            return groups;
        }
        issues.forEach(issue => {
            const type = issue.type || 'UNKNOWN';
            groups[type] = (groups[type] || 0) + 1;
        });
        return groups;
    }
    
    /**
     * Helper: Get issue patterns
     */
    getIssuePatterns() {
        const patterns = this.stateStore.getState('issues.patterns');
        if (!patterns) return {};
        
        const result = {};
        
        // Handle Map
        if (patterns instanceof Map) {
            patterns.forEach((issueIds, pattern) => {
                result[pattern] = Array.isArray(issueIds) ? issueIds.length : 0;
            });
        }
        // Handle array
        else if (Array.isArray(patterns)) {
            patterns.forEach(p => {
                const pattern = p.pattern || p;
                const issueIds = p.issueIds || [];
                result[pattern] = Array.isArray(issueIds) ? issueIds.length : 0;
            });
        }
        // Handle object
        else if (typeof patterns === 'object') {
            for (const [pattern, issueIds] of Object.entries(patterns)) {
                result[pattern] = Array.isArray(issueIds) ? issueIds.length : 0;
            }
        }
        
        return result;
    }
    
    /**
     * Helper: Get fix attempts by issue
     */
    getFixAttemptsByIssue() {
        const learning = this.stateStore.getState('learning.fixAttempts');
        if (!learning) return {};
        
        const result = {};
        
        // Handle Map
        if (learning instanceof Map) {
            learning.forEach((attempts, issueId) => {
                result[issueId] = Array.isArray(attempts) ? attempts.length : 0;
            });
        }
        // Handle array of entries
        else if (Array.isArray(learning)) {
            learning.forEach(entry => {
                if (Array.isArray(entry) && entry.length >= 2) {
                    const [issueId, attempts] = entry;
                    result[issueId] = Array.isArray(attempts) ? attempts.length : 0;
                }
            });
        }
        // Handle object
        else if (typeof learning === 'object') {
            for (const [issueId, attempts] of Object.entries(learning)) {
                result[issueId] = Array.isArray(attempts) ? attempts.length : 0;
            }
        }
        
        return result;
    }
    
    /**
     * Helper: Get success rates by method
     */
    getSuccessRatesByMethod() {
        const rates = this.fixTracker.successRates;
        const result = {};
        
        rates.forEach((stats, method) => {
            result[method] = {
                successes: stats.successes,
                failures: stats.failures,
                rate: stats.rate
            };
        });
        
        return result;
    }
    
    /**
     * Format statistics for display
     * Human-readable summary (AI sees full stats above)
     */
    formatForDisplay() {
        const stats = this.getStatistics();
        
        return {
            summary: {
                systemHealth: stats.system.overall.health,
                activeIssues: stats.issues.active.count,
                investigationStatus: stats.monitoring.investigation.status,
                fixSuccessRate: stats.fixes.attempts.successRate
            },
            recommendations: stats.recommendations.priority
        };
    }
}

module.exports = AILiveStatistics;
