/**
 * AI Communication Interface - AI Can Query Anything
 * 
 * AI can ask any question, get any information.
 * Natural language queries, structured data responses.
 * AI talks to itself through this interface.
 * 
 * Human never needs to understand technical details.
 * AI handles everything.
 */

class AICommunicationInterface {
    constructor(stateStore, issueDetector, fixTracker, decisionEngine, logProcessor, liveStatistics) {
        this.stateStore = stateStore;
        this.issueDetector = issueDetector;
        this.fixTracker = fixTracker;
        this.decisionEngine = decisionEngine;
        this.logProcessor = logProcessor;
        this.liveStatistics = liveStatistics;
    }
    
    /**
     * Query the system - AI can ask anything
     */
    query(question) {
        const lower = question.toLowerCase();
        
        // "What's the current state?"
        if (lower.includes('current state') || lower.includes('what is the state')) {
            return this.getCurrentState();
        }
        
        // "What issues are active?"
        if (lower.includes('active issue') || lower.includes('what issue')) {
            return this.getActiveIssues();
        }
        
        // "What fixes have been tried?"
        if (lower.includes('fix attempt') || lower.includes('what fix')) {
            return this.getFixAttempts(question);
        }
        
        // "What's the investigation status?"
        if (lower.includes('investigation')) {
            return this.getInvestigationStatus();
        }
        
        // "What errors occurred?"
        if (lower.includes('error') && (lower.includes('occurred') || lower.includes('happened'))) {
            return this.getErrors(question);
        }
        
        // "What's the system health?"
        if (lower.includes('system health') || lower.includes('health')) {
            return this.getSystemHealth();
        }
        
        // "What should I do?"
        if (lower.includes('what should') || lower.includes('recommendation')) {
            return this.getRecommendations();
        }
        
        // "Why did X fail?"
        if (lower.includes('why') && lower.includes('fail')) {
            return this.analyzeFailure(question);
        }
        
        // "What patterns lead to Y?"
        if (lower.includes('pattern') && lower.includes('lead')) {
            return this.getPatterns(question);
        }
        
        // Default: search everything
        return this.search(question);
    }
    
    /**
     * Get current state
     */
    getCurrentState() {
        return {
            type: 'state',
            data: this.stateStore.getStatusReport(),
            timestamp: Date.now()
        };
    }
    
    /**
     * Get active issues
     */
    getActiveIssues() {
        const issues = this.issueDetector.getActiveIssues();
        
        return {
            type: 'issues',
            count: issues.length,
            issues: issues.map(i => ({
                id: i.id,
                type: i.type,
                severity: i.severity,
                priority: i.priority,
                confidence: i.confidence,
                rootCause: i.rootCause,
                possibleFixes: i.possibleFixes,
                relatedIssues: i.relatedIssues.length
            })),
            bySeverity: this.groupBySeverity(issues),
            timestamp: Date.now()
        };
    }
    
    /**
     * Get fix attempts
     */
    getFixAttempts(question) {
        // Extract issue ID or type from question
        const issueMatch = question.match(/(?:issue|for)\s+([a-z0-9_-]+)/i);
        
        if (issueMatch) {
            const issueId = issueMatch[1];
            const attempts = this.fixTracker.getAttempts(issueId);
            
            return {
                type: 'fixAttempts',
                issueId,
                count: attempts.length,
                attempts: attempts.map(a => ({
                    method: a.fixMethod,
                    result: a.result,
                    timestamp: a.timestamp,
                    duration: a.duration
                })),
                successRate: this.calculateSuccessRate(attempts),
                timestamp: Date.now()
            };
        }
        
        // Get all recent attempts
        const recent = this.fixTracker.getRecentAttempts(20);
        
        return {
            type: 'fixAttempts',
            count: recent.length,
            attempts: recent,
            timestamp: Date.now()
        };
    }
    
    /**
     * Get investigation status
     */
    getInvestigationStatus() {
        const investigation = this.stateStore.getState('monitoring.investigation');
        const activeIssues = this.issueDetector.getActiveIssues();
        
        return {
            type: 'investigation',
            status: investigation.status,
            progress: investigation.progress || 0,
            timeRemaining: investigation.timeRemaining || 0,
            issuesFound: investigation.issues?.length || activeIssues.length,
            startTime: investigation.startTime,
            timeout: investigation.timeout || 15,
            history: investigation.history || [],
            timestamp: Date.now()
        };
    }
    
    /**
     * Get errors
     */
    getErrors(question) {
        // Extract time range
        const timeRange = this.extractTimeRange(question);
        
        const errors = this.logProcessor.getErrors(timeRange);
        
        return {
            type: 'errors',
            count: errors.length,
            errors: errors.map(e => ({
                timestamp: e.timestamp,
                source: e.source,
                level: e.level,
                message: e.message,
                details: e.details
            })),
            bySource: this.groupBySource(errors),
            timeRange,
            timestamp: Date.now()
        };
    }
    
    /**
     * Get system health
     */
    getSystemHealth() {
        const stats = this.liveStatistics.getStatistics();
        
        return {
            type: 'systemHealth',
            overall: stats.system.overall,
            server: stats.system.server,
            database: stats.system.database,
            unity: stats.system.unity,
            timestamp: Date.now()
        };
    }
    
    /**
     * Get recommendations
     */
    getRecommendations() {
        const stats = this.liveStatistics.getStatistics();
        
        return {
            type: 'recommendations',
            investigation: stats.recommendations.investigation,
            pause: stats.recommendations.pause,
            resume: stats.recommendations.resume,
            fixes: stats.recommendations.fixes,
            avoid: stats.recommendations.avoid,
            priority: stats.recommendations.priority,
            timestamp: Date.now()
        };
    }
    
    /**
     * Analyze failure
     */
    analyzeFailure(question) {
        // Extract what failed from question
        const failureMatch = question.match(/why did (.+?) fail/i);
        
        if (failureMatch) {
            const failedThing = failureMatch[1];
            
            // Try to find related fix attempts
            const recentAttempts = this.fixTracker.getRecentAttempts(50);
            const related = recentAttempts.filter(a => 
                a.fixMethod.toLowerCase().includes(failedThing.toLowerCase()) ||
                a.issueType.toLowerCase().includes(failedThing.toLowerCase())
            );
            
            const failed = related.filter(a => a.result === 'failure');
            
            return {
                type: 'failureAnalysis',
                query: failedThing,
                relatedAttempts: related.length,
                failedAttempts: failed.length,
                failures: failed.map(f => ({
                    method: f.fixMethod,
                    issue: f.issueType,
                    timestamp: f.timestamp,
                    state: f.state,
                    logs: f.logs
                })),
                analysis: this.analyzeFailures(failed),
                timestamp: Date.now()
            };
        }
        
        return {
            type: 'failureAnalysis',
            error: 'Could not parse failure query',
            timestamp: Date.now()
        };
    }
    
    /**
     * Get patterns
     */
    getPatterns(question) {
        // Extract issue from question
        const issueMatch = question.match(/lead to (.+)/i);
        
        if (issueMatch) {
            const issue = issueMatch[1];
            const patterns = this.logProcessor.getPatternsForIssue(issue);
            
            return {
                type: 'patterns',
                issue,
                patterns: patterns.map(p => ({
                    pattern: p.pattern,
                    count: p.data.count,
                    firstSeen: p.data.firstSeen,
                    lastSeen: p.data.lastSeen,
                    examples: p.data.examples.slice(0, 3)
                })),
                timestamp: Date.now()
            };
        }
        
        // Get all patterns
        const allPatterns = Array.from(this.logProcessor.patterns.entries());
        
        return {
            type: 'patterns',
            count: allPatterns.length,
            patterns: allPatterns.map(([pattern, data]) => ({
                pattern,
                count: data.count,
                firstSeen: data.firstSeen,
                lastSeen: data.lastSeen
            })),
            timestamp: Date.now()
        };
    }
    
    /**
     * Search everything
     */
    search(query) {
        const results = {
            type: 'search',
            query,
            results: []
        };
        
        // Search logs
        const logResults = this.logProcessor.searchLogs(query);
        if (logResults.length > 0) {
            results.results.push({
                source: 'logs',
                count: logResults.length,
                items: logResults.slice(0, 10)
            });
        }
        
        // Search issues
        const issues = this.issueDetector.getActiveIssues();
        const matchingIssues = issues.filter(i => 
            i.type.toLowerCase().includes(query.toLowerCase()) ||
            i.message?.toLowerCase().includes(query.toLowerCase())
        );
        if (matchingIssues.length > 0) {
            results.results.push({
                source: 'issues',
                count: matchingIssues.length,
                items: matchingIssues
            });
        }
        
        // Search state
        const stateResults = this.searchState(query);
        if (stateResults.length > 0) {
            results.results.push({
                source: 'state',
                count: stateResults.length,
                items: stateResults
            });
        }
        
        return results;
    }
    
    /**
     * Get complete status report
     * AI gets everything it needs to know
     */
    getStatusReport() {
        return {
            timestamp: Date.now(),
            statistics: this.liveStatistics.getStatistics(),
            state: this.stateStore.getStatusReport(),
            issues: this.getActiveIssues(),
            fixes: {
                recent: this.fixTracker.getRecentAttempts(10),
                working: this.fixTracker.getWorkingFixes(),
                failed: this.fixTracker.getFailedFixes(),
                stats: this.fixTracker.getStats()
            },
            decisions: this.decisionEngine.getRecentDecisions(5),
            recommendations: this.getRecommendations()
        };
    }
    
    /**
     * Get detailed analysis for an issue
     */
    getDetailedAnalysis(issueId) {
        const issue = this.issueDetector.getIssue(issueId);
        if (!issue) {
            return {
                error: 'Issue not found',
                issueId
            };
        }
        
        return {
            issue,
            rootCause: issue.rootCause,
            stateHistory: this.stateStore.getStateHistory(null, issue.firstSeen),
            logHistory: this.getLogHistory(issue),
            fixAttempts: this.fixTracker.getAttempts(issueId),
            suggestedFixes: this.fixTracker.getSuggestedFixes(issue),
            similarIssues: this.findSimilarIssues(issue),
            relatedIssues: issue.relatedIssues
        };
    }
    
    /**
     * Helper: Group by severity
     */
    groupBySeverity(issues) {
        const groups = { critical: 0, high: 0, medium: 0, low: 0 };
        issues.forEach(issue => {
            const severity = issue.severity?.toLowerCase() || 'medium';
            if (groups[severity] !== undefined) {
                groups[severity]++;
            }
        });
        return groups;
    }
    
    /**
     * Helper: Group by source
     */
    groupBySource(items) {
        const groups = {};
        items.forEach(item => {
            const source = item.source || 'unknown';
            groups[source] = (groups[source] || 0) + 1;
        });
        return groups;
    }
    
    /**
     * Helper: Extract time range
     */
    extractTimeRange(question) {
        const lower = question.toLowerCase();
        
        if (lower.includes('last hour')) return 3600000;
        if (lower.includes('last minute')) return 60000;
        if (lower.includes('last day')) return 86400000;
        
        const minuteMatch = question.match(/(\d+)\s*minute/);
        if (minuteMatch) return parseInt(minuteMatch[1]) * 60000;
        
        const hourMatch = question.match(/(\d+)\s*hour/);
        if (hourMatch) return parseInt(hourMatch[1]) * 3600000;
        
        return null;
    }
    
    /**
     * Helper: Calculate success rate
     */
    calculateSuccessRate(attempts) {
        if (attempts.length === 0) return 0;
        const successes = attempts.filter(a => a.result === 'success').length;
        return (successes / attempts.length) * 100;
    }
    
    /**
     * Helper: Analyze failures
     */
    analyzeFailures(failures) {
        if (failures.length === 0) {
            return { message: 'No failures to analyze' };
        }
        
        // Group by method
        const byMethod = {};
        failures.forEach(f => {
            if (!byMethod[f.fixMethod]) {
                byMethod[f.fixMethod] = [];
            }
            byMethod[f.fixMethod].push(f);
        });
        
        // Find common patterns
        const commonPatterns = [];
        for (const [method, methodFailures] of Object.entries(byMethod)) {
            if (methodFailures.length > 1) {
                commonPatterns.push({
                    method,
                    count: methodFailures.length,
                    reason: `Failed ${methodFailures.length} times`
                });
            }
        }
        
        return {
            totalFailures: failures.length,
            byMethod,
            commonPatterns,
            recommendation: commonPatterns.length > 0 
                ? `Avoid: ${commonPatterns.map(p => p.method).join(', ')}`
                : 'No clear pattern'
        };
    }
    
    /**
     * Helper: Search state
     */
    searchState(query) {
        const results = [];
        const state = this.stateStore.getState();
        
        // Simple search - can be enhanced
        const searchInObject = (obj, path = '') => {
            for (const [key, value] of Object.entries(obj)) {
                const currentPath = path ? `${path}.${key}` : key;
                
                if (typeof value === 'string' && value.toLowerCase().includes(query.toLowerCase())) {
                    results.push({ path: currentPath, value });
                } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                    searchInObject(value, currentPath);
                }
            }
        };
        
        searchInObject(state);
        return results;
    }
    
    /**
     * Helper: Get log history for issue
     */
    getLogHistory(issue) {
        const timeRange = 60000; // 1 minute
        const startTime = issue.firstSeen - timeRange;
        const endTime = issue.firstSeen + timeRange;
        
        // Get logs from log processor
        const allLogs = [];
        for (const source of Object.keys(this.logProcessor.logs)) {
            const logs = this.logProcessor.logs[source];
            const relevant = logs.filter(log => 
                log.timestamp >= startTime && log.timestamp <= endTime
            );
            allLogs.push(...relevant);
        }
        
        return allLogs.sort((a, b) => a.timestamp - b.timestamp);
    }
    
    /**
     * Helper: Find similar issues
     */
    findSimilarIssues(issue) {
        const allIssues = this.issueDetector.getActiveIssues();
        return allIssues.filter(i => 
            i.id !== issue.id &&
            (i.type === issue.type || 
             (i.details?.tableId && issue.details?.tableId && i.details.tableId === issue.details.tableId))
        );
    }
}

module.exports = AICommunicationInterface;
