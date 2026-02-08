/**
 * AI Fix Tracker - AI Remembers Everything
 * 
 * AI tracks every fix attempt.
 * AI learns what works, what doesn't work.
 * AI remembers patterns.
 * AI gets smarter over time.
 * 
 * Human never needs to remember what was tried.
 * AI knows everything.
 */

const EventEmitter = require('events');

class AIFixTracker extends EventEmitter {
    constructor(stateStore, issueDetector) {
        super();
        this.stateStore = stateStore;
        this.issueDetector = issueDetector;
        
        // Fix attempts by issue
        this.attemptsByIssue = new Map(); // issueId -> [attempts]
        
        // Knowledge base - what works for what
        this.knowledge = new Map(); // pattern -> { method, successRate, attempts, lastSuccess }
        
        // Success rates by method
        this.successRates = new Map(); // method -> { successes, failures, rate }
        
        // Load from state store
        this.load();
        
        // Listen to issue detector
        this.issueDetector.on('issueDetected', (issue) => {
            this.onIssueDetected(issue);
        });
    }
    
    /**
     * Record a fix attempt
     */
    recordAttempt(issueId, fixMethod, fixDetails, result) {
        const attempt = {
            id: this.generateAttemptId(),
            issueId,
            issueType: this.getIssueType(issueId),
            fixMethod,
            fixDetails,
            result, // success | failure | partial
            timestamp: Date.now(),
            state: this.stateStore.getState('game'), // State when fix was attempted
            logs: this.getRelevantLogs(issueId), // Relevant logs
            duration: fixDetails.duration || 0 // How long fix took
        };
        
        // Store attempt
        if (!this.attemptsByIssue.has(issueId)) {
            this.attemptsByIssue.set(issueId, []);
        }
        this.attemptsByIssue.get(issueId).push(attempt);
        
        // Update knowledge
        this.updateKnowledge(attempt);
        
        // Update success rates
        this.updateSuccessRate(fixMethod, result);
        
        // Update state store
        this.updateStateStore(attempt);
        
        // Emit event
        this.emit('attemptRecorded', attempt);
        
        // If failed, mark as failed so AI doesn't try again
        if (result === 'failure') {
            this.markFixAsFailed(issueId, fixMethod);
            this.emit('fixFailed', { issueId, fixMethod, attempt });
        }
        
        // If succeeded, mark as success and extract pattern
        if (result === 'success') {
            this.markFixAsSuccess(issueId, fixMethod);
            this.extractPattern(issueId, fixMethod);
            this.emit('fixSucceeded', { issueId, fixMethod, attempt });
        }
        
        return attempt;
    }
    
    /**
     * Get suggested fixes for an issue
     * AI knows what to try based on knowledge
     */
    getSuggestedFixes(issue) {
        const suggestions = {
            shouldTry: [],
            shouldNotTry: [],
            confidence: 0,
            reasoning: []
        };
        
        // Find similar issues
        const similarIssues = this.findSimilarIssues(issue);
        
        // Get fixes that worked for similar issues
        for (const similarIssue of similarIssues) {
            const attempts = this.attemptsByIssue.get(similarIssue.id) || [];
            const successfulAttempts = attempts.filter(a => a.result === 'success');
            
            for (const attempt of successfulAttempts) {
                // Check if we've already tried this and it failed
                const failedAttempts = this.getFailedAttempts(issue.id);
                const alreadyFailed = failedAttempts.some(a => a.fixMethod === attempt.fixMethod);
                
                if (!alreadyFailed) {
                    // Calculate confidence based on success rate
                    const knowledge = this.knowledge.get(this.getPattern(issue));
                    const confidence = knowledge ? knowledge.successRate : 0.5;
                    
                    suggestions.shouldTry.push({
                        method: attempt.fixMethod,
                        details: attempt.fixDetails,
                        confidence,
                        reason: `Worked for similar issue: ${similarIssue.type}`,
                        successRate: this.getSuccessRate(attempt.fixMethod)
                    });
                }
            }
        }
        
        // Get fixes from knowledge base
        const pattern = this.getPattern(issue);
        if (this.knowledge.has(pattern)) {
            const knowledge = this.knowledge.get(pattern);
            if (knowledge.successRate > 0.5) {
                const alreadyInList = suggestions.shouldTry.some(s => s.method === knowledge.method);
                if (!alreadyInList) {
                    suggestions.shouldTry.push({
                        method: knowledge.method,
                        confidence: knowledge.successRate,
                        reason: `Known working fix for this pattern`,
                        successRate: knowledge.successRate
                    });
                }
            }
        }
        
        // Get failed fixes (don't try again)
        const failedAttempts = this.getFailedAttempts(issue.id);
        suggestions.shouldNotTry = failedAttempts.map(a => ({
            method: a.fixMethod,
            reason: `Failed ${a.count || 1} time(s)`,
            lastAttempt: a.timestamp
        }));
        
        // Sort by confidence
        suggestions.shouldTry.sort((a, b) => b.confidence - a.confidence);
        
        // Calculate overall confidence
        if (suggestions.shouldTry.length > 0) {
            suggestions.confidence = suggestions.shouldTry[0].confidence;
        }
        
        return suggestions;
    }
    
    /**
     * Find similar issues
     */
    findSimilarIssues(issue) {
        const similar = [];
        
        for (const [issueId, attempts] of this.attemptsByIssue.entries()) {
            const otherIssue = this.issueDetector.getIssue(issueId);
            if (!otherIssue) continue;
            
            // Same type
            if (otherIssue.type === issue.type) {
                similar.push(otherIssue);
                continue;
            }
            
            // Similar details
            if (this.areSimilar(issue, otherIssue)) {
                similar.push(otherIssue);
            }
        }
        
        return similar;
    }
    
    /**
     * Check if issues are similar
     */
    areSimilar(issue1, issue2) {
        // Same table
        if (issue1.details?.tableId && issue2.details?.tableId) {
            if (issue1.details.tableId === issue2.details.tableId) {
                return true;
            }
        }
        
        // Related types
        if (issue1.type.includes('CHIP') && issue2.type.includes('CHIP')) {
            return true;
        }
        if (issue1.type.includes('POT') && issue2.type.includes('POT')) {
            return true;
        }
        
        return false;
    }
    
    /**
     * Get failed attempts for issue
     */
    getFailedAttempts(issueId) {
        const attempts = this.attemptsByIssue.get(issueId) || [];
        const failed = attempts.filter(a => a.result === 'failure');
        
        // Group by method and count
        const grouped = new Map();
        for (const attempt of failed) {
            if (!grouped.has(attempt.fixMethod)) {
                grouped.set(attempt.fixMethod, {
                    fixMethod: attempt.fixMethod,
                    count: 0,
                    timestamp: attempt.timestamp
                });
            }
            const entry = grouped.get(attempt.fixMethod);
            entry.count++;
            if (attempt.timestamp > entry.timestamp) {
                entry.timestamp = attempt.timestamp;
            }
        }
        
        return Array.from(grouped.values());
    }
    
    /**
     * Update knowledge base
     */
    updateKnowledge(attempt) {
        const pattern = this.getPatternFromIssue(attempt.issueType);
        
        if (!this.knowledge.has(pattern)) {
            this.knowledge.set(pattern, {
                method: attempt.fixMethod,
                successes: 0,
                failures: 0,
                attempts: 0,
                successRate: 0,
                lastSuccess: null,
                lastFailure: null
            });
        }
        
        const knowledge = this.knowledge.get(pattern);
        knowledge.attempts++;
        
        if (attempt.result === 'success') {
            knowledge.successes++;
            knowledge.lastSuccess = attempt.timestamp;
        } else if (attempt.result === 'failure') {
            knowledge.failures++;
            knowledge.lastFailure = attempt.timestamp;
        }
        
        knowledge.successRate = knowledge.successes / knowledge.attempts;
        
        // Update state store (ensure knowledge is a Map before converting)
        if (this.knowledge instanceof Map) {
            this.stateStore.updateState('fixes.knowledge', Array.from(this.knowledge.entries()));
        } else {
            // If knowledge is not a Map, convert it
            this.knowledge = new Map(Object.entries(this.knowledge || {}));
            this.stateStore.updateState('fixes.knowledge', Array.from(this.knowledge.entries()));
        }
    }
    
    /**
     * Update success rate for method
     */
    updateSuccessRate(method, result) {
        if (!this.successRates.has(method)) {
            this.successRates.set(method, {
                successes: 0,
                failures: 0,
                rate: 0
            });
        }
        
        const stats = this.successRates.get(method);
        
        if (result === 'success') {
            stats.successes++;
        } else if (result === 'failure') {
            stats.failures++;
        }
        
        const total = stats.successes + stats.failures;
        stats.rate = total > 0 ? stats.successes / total : 0;
    }
    
    /**
     * Get success rate for method
     */
    getSuccessRate(method) {
        const stats = this.successRates.get(method);
        return stats ? stats.rate : 0;
    }
    
    /**
     * Mark fix as failed
     */
    markFixAsFailed(issueId, fixMethod) {
        const failedFixes = this.stateStore.getState('fixes.failures') || [];
        
        // Check if already marked
        const existing = failedFixes.find(f => f.issueId === issueId && f.method === fixMethod);
        if (existing) {
            existing.count++;
            existing.lastAttempt = Date.now();
        } else {
            failedFixes.push({
                issueId,
                method: fixMethod,
                count: 1,
                firstAttempt: Date.now(),
                lastAttempt: Date.now()
            });
        }
        
        this.stateStore.updateState('fixes.failures', failedFixes);
    }
    
    /**
     * Mark fix as success
     */
    markFixAsSuccess(issueId, fixMethod) {
        const successfulFixes = this.stateStore.getState('fixes.successes') || [];
        
        // Check if already marked
        const existing = successfulFixes.find(f => f.issueId === issueId && f.method === fixMethod);
        if (existing) {
            existing.count++;
            existing.lastSuccess = Date.now();
        } else {
            successfulFixes.push({
                issueId,
                method: fixMethod,
                count: 1,
                firstSuccess: Date.now(),
                lastSuccess: Date.now()
            });
        }
        
        this.stateStore.updateState('fixes.successes', successfulFixes);
    }
    
    /**
     * Extract pattern from issue and fix
     */
    extractPattern(issueId, fixMethod) {
        const issue = this.issueDetector.getIssue(issueId);
        if (!issue) return;
        
        const pattern = this.getPattern(issue);
        
        // Update knowledge with this pattern
        if (!this.knowledge.has(pattern)) {
            this.knowledge.set(pattern, {
                method: fixMethod,
                successes: 1,
                failures: 0,
                attempts: 1,
                successRate: 1.0,
                lastSuccess: Date.now(),
                lastFailure: null
            });
        } else {
            const knowledge = this.knowledge.get(pattern);
            if (knowledge.method === fixMethod) {
                knowledge.successes++;
                knowledge.attempts++;
                knowledge.successRate = knowledge.successes / knowledge.attempts;
                knowledge.lastSuccess = Date.now();
            }
        }
        
        // Update state store (ensure knowledge is a Map before converting)
        if (this.knowledge instanceof Map) {
            this.stateStore.updateState('fixes.knowledge', Array.from(this.knowledge.entries()));
        } else {
            // If knowledge is not a Map, convert it
            this.knowledge = new Map(Object.entries(this.knowledge || {}));
            this.stateStore.updateState('fixes.knowledge', Array.from(this.knowledge.entries()));
        }
        this.stateStore.updateState('learning.patterns', Array.from(this.knowledge.entries()));
    }
    
    /**
     * Get pattern from issue
     */
    getPattern(issue) {
        // Create pattern from issue type and key details
        const parts = [issue.type];
        
        if (issue.details?.tableId) {
            parts.push('table');
        }
        if (issue.details?.playerId) {
            parts.push('player');
        }
        if (issue.details?.phase) {
            parts.push(issue.details.phase);
        }
        
        return parts.join('_');
    }
    
    /**
     * Get pattern from issue type
     */
    getPatternFromIssue(issueType) {
        return issueType;
    }
    
    /**
     * Get issue type from ID
     */
    getIssueType(issueId) {
        const issue = this.issueDetector.getIssue(issueId);
        return issue ? issue.type : 'UNKNOWN';
    }
    
    /**
     * Get relevant logs for issue
     */
    getRelevantLogs(issueId) {
        const issue = this.issueDetector.getIssue(issueId);
        if (!issue) return [];
        
        // Get logs around the time issue was detected
        const timeRange = 60000; // 1 minute
        const startTime = issue.firstSeen - timeRange;
        const endTime = issue.firstSeen + timeRange;
        
        // Query log processor for logs in this range
        // This would integrate with AILogProcessor
        return [];
    }
    
    /**
     * On issue detected
     */
    onIssueDetected(issue) {
        // Check if we have knowledge about this issue type
        const pattern = this.getPattern(issue);
        if (this.knowledge.has(pattern)) {
            const knowledge = this.knowledge.get(pattern);
            
            // Emit suggestion
            this.emit('fixSuggestion', {
                issue,
                suggestedFix: {
                    method: knowledge.method,
                    confidence: knowledge.successRate,
                    reason: `Known working fix (${knowledge.successRate * 100}% success rate)`
                }
            });
        }
    }
    
    /**
     * Get attempts for issue
     */
    getAttempts(issueId) {
        return this.attemptsByIssue.get(issueId) || [];
    }
    
    /**
     * Get recent attempts
     */
    getRecentAttempts(limit = 10) {
        const allAttempts = [];
        
        for (const attempts of this.attemptsByIssue.values()) {
            allAttempts.push(...attempts);
        }
        
        return allAttempts
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, limit);
    }
    
    /**
     * Get knowledge base
     */
    getKnowledge() {
        return Array.from(this.knowledge.entries()).map(([pattern, data]) => ({
            pattern,
            ...data
        }));
    }
    
    /**
     * Get working fixes
     */
    getWorkingFixes() {
        const working = [];
        
        for (const [pattern, knowledge] of this.knowledge.entries()) {
            if (knowledge.successRate > 0.5) {
                working.push({
                    pattern,
                    method: knowledge.method,
                    successRate: knowledge.successRate,
                    attempts: knowledge.attempts
                });
            }
        }
        
        return working.sort((a, b) => b.successRate - a.successRate);
    }
    
    /**
     * Get failed fixes
     */
    getFailedFixes() {
        const failed = this.stateStore.getState('fixes.failures') || [];
        
        // Ensure failed is an array
        if (!Array.isArray(failed)) {
            return [];
        }
        
        // Group by method
        const grouped = new Map();
        for (const failure of failed) {
            if (!failure || !failure.method) continue;
            
            if (!grouped.has(failure.method)) {
                grouped.set(failure.method, {
                    method: failure.method,
                    totalFailures: 0,
                    issues: []
                });
            }
            const entry = grouped.get(failure.method);
            entry.totalFailures += failure.count || 1;
            if (failure.issueId) {
                entry.issues.push(failure.issueId);
            }
        }
        
        return Array.from(grouped.values())
            .sort((a, b) => b.totalFailures - a.totalFailures);
    }
    
    /**
     * Update state store
     */
    updateStateStore(attempt) {
        const attempts = this.stateStore.getState('fixes.attempts') || [];
        attempts.push(attempt);
        
        // Keep only last 1000 attempts
        if (attempts.length > 1000) {
            attempts.splice(0, attempts.length - 1000);
        }
        
        this.stateStore.updateState('fixes.attempts', attempts);
        
        // Update learning state
        const learningAttempts = this.stateStore.getState('learning.fixAttempts') || new Map();
        if (!learningAttempts.has(attempt.issueId)) {
            learningAttempts.set(attempt.issueId, []);
        }
        learningAttempts.get(attempt.issueId).push(attempt);
        this.stateStore.updateState('learning.fixAttempts', Array.from(learningAttempts.entries()));
    }
    
    /**
     * Load from state store
     */
    load() {
        const knowledge = this.stateStore.getState('fixes.knowledge');
        if (knowledge && Array.isArray(knowledge)) {
            this.knowledge = new Map(knowledge);
        }
        
        const attempts = this.stateStore.getState('fixes.attempts');
        // Ensure attempts is an array
        if (Array.isArray(attempts)) {
            for (const attempt of attempts) {
                if (attempt && attempt.issueId) {
                    if (!this.attemptsByIssue.has(attempt.issueId)) {
                        this.attemptsByIssue.set(attempt.issueId, []);
                    }
                    this.attemptsByIssue.get(attempt.issueId).push(attempt);
                }
            }
        }
    }
    
    /**
     * Generate attempt ID
     */
    generateAttemptId() {
        return `attempt_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    }
    
    /**
     * Get stats
     */
    getStats() {
        const totalAttempts = Array.from(this.attemptsByIssue.values())
            .reduce((sum, attempts) => sum + attempts.length, 0);
        
        const successfulAttempts = Array.from(this.attemptsByIssue.values())
            .flat()
            .filter(a => a.result === 'success').length;
        
        const failedAttempts = Array.from(this.attemptsByIssue.values())
            .flat()
            .filter(a => a.result === 'failure').length;
        
        const successRate = totalAttempts > 0 ? (successfulAttempts / totalAttempts) * 100 : 0;
        
        return {
            totalAttempts,
            successfulAttempts,
            failedAttempts,
            successRate: Math.round(successRate * 100) / 100,
            knowledgeBaseSize: this.knowledge.size,
            workingFixes: this.getWorkingFixes().length,
            failedFixes: this.getFailedFixes().length
        };
    }
}

module.exports = AIFixTracker;
