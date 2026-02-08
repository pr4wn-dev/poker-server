/**
 * AI Issue Detector - AI Knows Everything
 * 
 * Combines multiple detection methods:
 * - State verification (proactive)
 * - Pattern analysis (from logs)
 * - Anomaly detection (statistical)
 * - Causal analysis (root cause)
 * 
 * AI detects, analyzes, and understands all issues automatically.
 */

const EventEmitter = require('events');

class AIIssueDetector extends EventEmitter {
    constructor(stateStore, logProcessor) {
        super();
        this.stateStore = stateStore;
        this.logProcessor = logProcessor;
        
        // Detection methods
        this.detectors = {
            stateVerification: true,
            patternAnalysis: true,
            anomalyDetection: true,
            causalAnalysis: true
        };
        
        // Detected issues
        this.issues = new Map(); // issueId -> issue
        
        // Detection stats
        this.stats = {
            totalDetected: 0,
            byMethod: {
                stateVerification: 0,
                patternAnalysis: 0,
                anomalyDetection: 0,
                causalAnalysis: 0
            },
            falsePositives: 0,
            accuracy: 100
        };
        
        // Start detection
        this.start();
    }
    
    /**
     * State verification interval
     */
    stopStateVerification() {
        if (this.stateVerificationInterval) {
            clearInterval(this.stateVerificationInterval);
            this.stateVerificationInterval = null;
        }
        if (this.anomalyDetectionInterval) {
            clearInterval(this.anomalyDetectionInterval);
            this.anomalyDetectionInterval = null;
        }
    }
    
    /**
     * Start detection
     */
    start() {
        // Continuous state verification
        if (this.detectors.stateVerification) {
            this.startStateVerification();
        }
        
        // Listen to log processor for pattern-based detection
        if (this.detectors.patternAnalysis) {
            this.logProcessor.on('error', (log) => {
                this.detectFromLog(log);
            });
        }
        
        // Anomaly detection
        if (this.detectors.anomalyDetection) {
            this.startAnomalyDetection();
        }
    }
    
    /**
     * Start continuous state verification
     */
    startStateVerification() {
        // Verify state every second
        this.stateVerificationInterval = setInterval(() => {
            this.verifyState();
        }, 1000);
    }
    
    /**
     * Stop state verification
     */
    stopStateVerification() {
        if (this.stateVerificationInterval) {
            clearInterval(this.stateVerificationInterval);
            this.stateVerificationInterval = null;
        }
        if (this.anomalyDetectionInterval) {
            clearInterval(this.anomalyDetectionInterval);
            this.anomalyDetectionInterval = null;
        }
    }
    
    /**
     * Verify state - proactive detection
     */
    verifyState() {
        // Verify chip integrity
        const chipIntegrity = this.stateStore.getState('game.chips');
        if (chipIntegrity) {
            const integrity = this._verifyChipIntegrity(chipIntegrity);
            if (!integrity.valid) {
                this.detectIssue({
                    type: 'CHIP_INTEGRITY_VIOLATION',
                    severity: 'critical',
                    method: 'stateVerification',
                    details: integrity,
                    timestamp: Date.now()
                });
            }
        }
        
        // Verify game state consistency
        this.verifyGameState();
        
        // Verify system health
        this.verifySystemHealth();
    }
    
    /**
     * Verify chip integrity
     */
    _verifyChipIntegrity(chipState) {
        let tableTotal = 0;
        chipState.byTable.forEach(count => {
            tableTotal += count;
        });
        
        let playerTotal = 0;
        chipState.byPlayer.forEach(count => {
            playerTotal += count;
        });
        
        const expected = tableTotal + playerTotal;
        const actual = chipState.totalInSystem;
        const difference = actual - expected;
        
        return {
            valid: Math.abs(difference) < 1, // Allow floating point
            expected,
            actual,
            difference,
            tableTotal,
            playerTotal
        };
    }
    
    /**
     * Verify game state consistency
     */
    verifyGameState() {
        const gameState = this.stateStore.getState('game');
        
        // Check for invalid states
        if (gameState.phase && !['waiting', 'preflop', 'flop', 'turn', 'river', 'showdown'].includes(gameState.phase)) {
            this.detectIssue({
                type: 'INVALID_GAME_PHASE',
                severity: 'high',
                method: 'stateVerification',
                details: { phase: gameState.phase },
                timestamp: Date.now()
            });
        }
        
        // Check for orphaned players
        const tables = gameState.tables;
        const players = gameState.players;
        
        players.forEach((player, playerId) => {
            if (player.currentTableId && !tables.has(player.currentTableId)) {
                this.detectIssue({
                    type: 'ORPHANED_PLAYER',
                    severity: 'medium',
                    method: 'stateVerification',
                    details: { playerId, tableId: player.currentTableId },
                    timestamp: Date.now()
                });
            }
        });
    }
    
    /**
     * Verify system health
     */
    verifySystemHealth() {
        const systemHealth = this.stateStore.getState('system');
        
        // Check server health
        if (systemHealth.server.health !== null && systemHealth.server.health < 50) {
            this.detectIssue({
                type: 'SERVER_HEALTH_DEGRADED',
                severity: 'high',
                method: 'stateVerification',
                details: { health: systemHealth.server.health },
                timestamp: Date.now()
            });
        }
        
        // Check database health
        if (systemHealth.database.health !== null && systemHealth.database.health < 50) {
            this.detectIssue({
                type: 'DATABASE_HEALTH_DEGRADED',
                severity: 'high',
                method: 'stateVerification',
                details: { health: systemHealth.database.health },
                timestamp: Date.now()
            });
        }
        
        // Check Unity health
        if (systemHealth.unity.health !== null && systemHealth.unity.health < 50) {
            this.detectIssue({
                type: 'UNITY_HEALTH_DEGRADED',
                severity: 'high',
                method: 'stateVerification',
                details: { health: systemHealth.unity.health },
                timestamp: Date.now()
            });
        }
    }
    
    /**
     * Detect issue from log
     */
    detectFromLog(log) {
        // Analyze log to extract issue
        const issue = this.analyzeLog(log);
        
        if (issue) {
            this.detectIssue({
                ...issue,
                method: 'patternAnalysis',
                log: log
            });
        }
    }
    
    /**
     * Analyze log to extract issue
     */
    analyzeLog(log) {
        const message = log.message.toLowerCase();
        
        // Chip mismatch
        if (message.includes('chip') && (message.includes('mismatch') || message.includes('error'))) {
            return {
                type: 'CHIP_MISMATCH',
                severity: 'critical',
                details: this.extractChipDetails(log.message)
            };
        }
        
        // Pot mismatch
        if (message.includes('pot') && (message.includes('mismatch') || message.includes('error'))) {
            return {
                type: 'POT_MISMATCH',
                severity: 'high',
                details: this.extractPotDetails(log.message)
            };
        }
        
        // Connection error
        if (message.includes('connection') && (message.includes('failed') || message.includes('error'))) {
            return {
                type: 'CONNECTION_ERROR',
                severity: 'high',
                details: { source: log.source }
            };
        }
        
        // Database error
        if (message.includes('database') && (message.includes('error') || message.includes('failed'))) {
            return {
                type: 'DATABASE_ERROR',
                severity: 'critical',
                details: { source: log.source }
            };
        }
        
        return null;
    }
    
    /**
     * Extract chip details from message
     */
    extractChipDetails(message) {
        const details = {};
        
        // Extract amounts
        const amountMatches = message.match(/(\d+(?:\.\d+)?)/g);
        if (amountMatches) {
            details.amounts = amountMatches.map(parseFloat);
        }
        
        // Extract table ID
        const tableMatch = message.match(/table[:\s]+([a-f0-9-]{36})/i);
        if (tableMatch) {
            details.tableId = tableMatch[1];
        }
        
        return details;
    }
    
    /**
     * Extract pot details from message
     */
    extractPotDetails(message) {
        const details = {};
        
        // Extract pot amounts
        const potMatches = message.match(/pot[:\s]+(\d+(?:\.\d+)?)/gi);
        if (potMatches) {
            details.potAmounts = potMatches.map(m => parseFloat(m.match(/(\d+(?:\.\d+)?)/)[1]));
        }
        
        // Extract expected vs actual
        const expectedMatch = message.match(/expected[:\s]+(\d+(?:\.\d+)?)/i);
        if (expectedMatch) {
            details.expected = parseFloat(expectedMatch[1]);
        }
        
        const actualMatch = message.match(/actual[:\s]+(\d+(?:\.\d+)?)/i);
        if (actualMatch) {
            details.actual = parseFloat(actualMatch[1]);
        }
        
        return details;
    }
    
    /**
     * Start anomaly detection
     */
    startAnomalyDetection() {
        // Detect anomalies every 5 seconds
        this.anomalyDetectionInterval = setInterval(() => {
            this.detectAnomalies();
        }, 5000);
    }
    
    /**
     * Detect anomalies using statistical analysis
     */
    detectAnomalies() {
        // Analyze chip movements
        this.analyzeChipMovements();
        
        // Analyze response times
        this.analyzeResponseTimes();
        
        // Analyze error rates
        this.analyzeErrorRates();
    }
    
    /**
     * Analyze chip movements for anomalies
     */
    analyzeChipMovements() {
        const chipHistory = this.stateStore.getState('game.chips.history');
        
        if (!chipHistory || chipHistory.length < 10) {
            return;
        }
        
        // Calculate average movement
        // Ensure chipHistory is an array
        if (!Array.isArray(chipHistory)) {
            return [];
        }
        const movements = chipHistory.slice(-100).map(h => Math.abs(h.change || 0));
        const avg = movements.reduce((a, b) => a + b, 0) / movements.length;
        const stdDev = this.calculateStdDev(movements, avg);
        
        // Check for anomalies (3 standard deviations)
        const recent = chipHistory.slice(-10);
        for (const entry of recent) {
            const movement = Math.abs(entry.change || 0);
            if (movement > avg + (3 * stdDev)) {
                this.detectIssue({
                    type: 'ANOMALOUS_CHIP_MOVEMENT',
                    severity: 'medium',
                    method: 'anomalyDetection',
                    details: {
                        movement,
                        average: avg,
                        stdDev,
                        entry
                    },
                    timestamp: Date.now()
                });
            }
        }
    }
    
    /**
     * Analyze response times
     */
    analyzeResponseTimes() {
        const server = this.stateStore.getState('system.server');
        
        if (server && server.metrics && server.metrics.responseTime) {
            // If response time is unusually high
            if (server.metrics.responseTime > 1000) { // 1 second
                this.detectIssue({
                    type: 'HIGH_RESPONSE_TIME',
                    severity: 'medium',
                    method: 'anomalyDetection',
                    details: { responseTime: server.metrics.responseTime },
                    timestamp: Date.now()
                });
            }
        }
    }
    
    /**
     * Analyze error rates
     */
    analyzeErrorRates() {
        const server = this.stateStore.getState('system.server');
        
        if (server && server.metrics) {
            const errorRate = server.metrics.errors / Math.max(server.metrics.requests, 1);
            
            // If error rate is high (> 5%)
            if (errorRate > 0.05) {
                this.detectIssue({
                    type: 'HIGH_ERROR_RATE',
                    severity: 'high',
                    method: 'anomalyDetection',
                    details: { errorRate: errorRate * 100 },
                    timestamp: Date.now()
                });
            }
        }
    }
    
    /**
     * Calculate standard deviation
     */
    calculateStdDev(values, mean) {
        const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
        const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
        return Math.sqrt(avgSquaredDiff);
    }
    
    /**
     * Detect issue from log line (alias for detectIssue for compatibility)
     */
    detectFromLogLine(logLine) {
        // Parse log line and detect issue
        const issue = this.analyzeLog({ message: logLine, level: 'error', timestamp: Date.now() });
        if (issue) {
            return this.detectIssue({
                ...issue,
                method: 'patternAnalysis',
                log: logLine
            });
        }
        return null;
    }
    
    /**
     * Create contextual error message
     */
    _createErrorContext(operation, context = {}) {
        const errorCode = `AIID-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        return {
            errorCode,
            operation,
            context: {
                ...context,
                timestamp: Date.now(),
                state: {
                    issuesCount: this.issues.size,
                    activeIssues: this.getActiveIssues().length
                }
            }
        };
    }
    
    /**
     * Detect an issue
     */
    detectIssue(issueData) {
        // Validate input
        if (!issueData || !issueData.type) {
            const errorContext = this._createErrorContext('detectIssue', { issueData });
            throw new Error(`[AIIssueDetector] Invalid issue data: ${JSON.stringify(errorContext)}`);
        }
        
        // Generate unique ID
        const issueId = this.generateIssueId(issueData);
        
        // Check if we already have this issue
        if (this.issues.has(issueId)) {
            const existing = this.issues.get(issueId);
            existing.count++;
            existing.lastSeen = Date.now();
            return existing;
        }
        
        // Analyze issue
        const analyzed = this.analyzeIssue(issueData);
        
        // Store issue
        this.issues.set(issueId, analyzed);
        
        // Update stats
        this.stats.totalDetected++;
        this.stats.byMethod[issueData.method]++;
        
        // Update state store
        this.updateStateStore(analyzed);
        
        // Emit event
        this.emit('issueDetected', analyzed);
        
        return analyzed;
    }
    
    /**
     * Analyze issue - AI understands everything about it
     */
    analyzeIssue(issueData) {
        const issue = {
            id: this.generateIssueId(issueData),
            ...issueData,
            firstSeen: Date.now(),
            lastSeen: Date.now(),
            count: 1,
            
            // AI analysis
            rootCause: this.findRootCause(issueData),
            possibleFixes: this.suggestFixes(issueData),
            historicalFixes: this.getHistoricalFixes(issueData),
            confidence: this.calculateConfidence(issueData),
            priority: this.calculatePriority(issueData),
            
            // Related issues
            relatedIssues: []
        };
        
        // Find related issues
        issue.relatedIssues = this.findRelatedIssues(issue);
        
        return issue;
    }
    
    /**
     * Find root cause
     */
    findRootCause(issue) {
        // Analyze state history to find what caused this
        const stateHistory = this.stateStore.getStateHistory(null, 60000); // Last minute
        
        // Look for state changes that might have caused this
        for (const event of stateHistory.reverse()) {
            if (this.isLikelyCause(event, issue)) {
                return {
                    event,
                    reason: this.explainCause(event, issue)
                };
            }
        }
        
        return {
            reason: 'Root cause not yet identified',
            method: issue.method
        };
    }
    
    /**
     * Check if event is likely cause of issue
     */
    isLikelyCause(event, issue) {
        // Simple heuristic - can be enhanced
        if (issue.type.includes('CHIP') && event.path.includes('chips')) {
            return true;
        }
        if (issue.type.includes('POT') && event.path.includes('pot')) {
            return true;
        }
        return false;
    }
    
    /**
     * Explain cause
     */
    explainCause(event, issue) {
        return `State change in ${event.path} likely caused ${issue.type}`;
    }
    
    /**
     * Suggest fixes
     */
    suggestFixes(issue) {
        // Get fixes from knowledge base
        const knowledge = this.stateStore.getState('fixes.knowledge');
        
        if (!knowledge) {
            return [];
        }
        
        const suggestions = [];
        
        // Handle different knowledge formats
        let knowledgeEntries = [];
        if (knowledge instanceof Map) {
            knowledgeEntries = Array.from(knowledge.entries());
        } else if (Array.isArray(knowledge)) {
            // Array of [pattern, data] entries
            knowledgeEntries = knowledge;
        } else if (typeof knowledge === 'object') {
            knowledgeEntries = Object.entries(knowledge);
        } else {
            return [];
        }
        
        // Look for similar issues in knowledge base
        for (const [pattern, data] of knowledgeEntries) {
            if (!pattern || !data || !issue.type) continue;
            
            try {
                if (pattern.includes(issue.type) || issue.type.includes(pattern)) {
                    const successRate = data.successRate || 0;
                    if (successRate > 0.5) {
                        suggestions.push({
                            method: data.method || 'unknown',
                            successRate: successRate,
                            attempts: data.attempts || 0,
                            confidence: successRate
                        });
                    }
                }
            } catch (error) {
                // Skip invalid entries
                continue;
            }
        }
        
        return suggestions.sort((a, b) => b.successRate - a.successRate);
    }
    
    /**
     * Get historical fixes
     */
    getHistoricalFixes(issue) {
        const fixes = this.stateStore.getState('fixes.attempts') || [];
        
        // Ensure fixes is an array
        if (!Array.isArray(fixes)) {
            return [];
        }
        
        return fixes
            .filter(f => f && (f.issueId === issue.id || f.issueType === issue.type))
            .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    }
    
    /**
     * Calculate confidence
     */
    calculateConfidence(issue) {
        let confidence = 0.5; // Base confidence
        
        // Higher confidence if detected by multiple methods
        if (issue.method === 'stateVerification') {
            confidence += 0.3; // State verification is very reliable
        }
        
        // Higher confidence if we've seen this before
        if (issue.count > 1) {
            confidence += 0.2;
        }
        
        return Math.min(confidence, 1.0);
    }
    
    /**
     * Calculate priority
     */
    calculatePriority(issue) {
        const severityWeights = {
            critical: 10,
            high: 7,
            medium: 4,
            low: 1
        };
        
        const severityWeight = severityWeights[issue.severity] || 5;
        const confidenceWeight = issue.confidence * 5;
        const countWeight = Math.min(issue.count / 10, 1) * 5;
        
        return severityWeight + confidenceWeight + countWeight;
    }
    
    /**
     * Find related issues
     */
    findRelatedIssues(issue) {
        const related = [];
        
        for (const [id, otherIssue] of this.issues.entries()) {
            if (id === issue.id) continue;
            
            if (this.areRelated(issue, otherIssue)) {
                related.push(otherIssue);
            }
        }
        
        return related;
    }
    
    /**
     * Check if issues are related
     */
    areRelated(issue1, issue2) {
        // Same type
        if (issue1.type === issue2.type) return true;
        
        // Same table/player
        if (issue1.details?.tableId && issue2.details?.tableId) {
            if (issue1.details.tableId === issue2.details.tableId) return true;
        }
        
        // Related types (chip and pot issues are related)
        if (issue1.type.includes('CHIP') && issue2.type.includes('POT')) return true;
        if (issue1.type.includes('POT') && issue2.type.includes('CHIP')) return true;
        
        return false;
    }
    
    /**
     * Generate unique issue ID
     */
    generateIssueId(issueData) {
        const key = `${issueData.type}_${issueData.method}_${JSON.stringify(issueData.details)}`;
        return Buffer.from(key).toString('base64').substring(0, 16);
    }
    
    /**
     * Update state store
     */
    updateStateStore(issue) {
        // Add to active issues
        const activeIssues = this.stateStore.getState('issues.active') || [];
        
        // Ensure activeIssues is an array
        const activeIssuesArray = Array.isArray(activeIssues) ? activeIssues : [];
        
        // Remove if already exists
        const filtered = activeIssuesArray.filter(i => i && i.id !== issue.id);
        
        // Add new issue
        filtered.push(issue);
        
        // Update state
        this.stateStore.updateState('issues.active', filtered);
        
        // Add to detected
        const detected = this.stateStore.getState('issues.detected') || [];
        // Ensure detected is an array
        const detectedArray = Array.isArray(detected) ? detected : [];
        detectedArray.push(issue);
        this.stateStore.updateState('issues.detected', detectedArray);
    }
    
    /**
     * Get active issues
     */
    getActiveIssues() {
        return Array.from(this.issues.values())
            .filter(issue => {
                // Issue is active if seen in last 5 minutes
                return (Date.now() - issue.lastSeen) < 300000;
            })
            .sort((a, b) => b.priority - a.priority);
    }
    
    /**
     * Get issue by ID
     */
    getIssue(issueId) {
        return this.issues.get(issueId);
    }
    
    /**
     * Get detection stats
     */
    getStats() {
        return {
            ...this.stats,
            activeIssues: this.getActiveIssues().length,
            totalIssues: this.issues.size
        };
    }
}

module.exports = AIIssueDetector;
