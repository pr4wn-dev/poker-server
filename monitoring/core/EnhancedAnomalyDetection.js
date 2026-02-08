/**
 * Enhanced Anomaly Detection - Statistical analysis and pattern learning
 * 
 * Cerberus learns normal patterns and flags deviations.
 * Uses statistical analysis to detect anomalies that might not be obvious.
 * 
 * Features:
 * - Learns normal patterns over time
 * - Detects statistical deviations
 * - Adapts to changing patterns
 * - Flags unexpected behavior
 */

const EventEmitter = require('events');
const gameLogger = require('../../src/utils/GameLogger');

class EnhancedAnomalyDetection extends EventEmitter {
    constructor(stateStore, issueDetector) {
        super();
        this.stateStore = stateStore;
        this.issueDetector = issueDetector;
        
        // Pattern learning
        this.patterns = new Map(); // metric -> { mean, stdDev, samples, history }
        this.minSamples = 20; // Need at least 20 samples before detecting anomalies
        this.anomalyThreshold = 3; // 3 standard deviations = anomaly
        
        // Metric tracking
        this.metrics = {
            responseTime: [],
            errorRate: [],
            chipChanges: [],
            playerActions: [],
            stateChanges: []
        };
        
        // Anomaly history
        this.anomalies = [];
        this.maxAnomaliesHistory = 1000;
        
        // Start monitoring
        this.startMonitoring();
    }
    
    /**
     * Start monitoring metrics
     */
    startMonitoring() {
        // Monitor every 5 seconds
        this.monitoringInterval = setInterval(() => {
            this.collectMetrics();
            this.detectAnomalies();
        }, 5000);
    }
    
    /**
     * Stop monitoring
     */
    stopMonitoring() {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }
    }
    
    /**
     * Collect metrics from state
     */
    collectMetrics() {
        const state = this.stateStore.getState();
        
        // Response time metrics
        const system = state.system || {};
        if (system.server && system.server.metrics) {
            const responseTime = system.server.metrics.responseTime || 0;
            this.recordMetric('responseTime', responseTime);
        }
        
        // Error rate metrics
        if (system.server && system.server.metrics) {
            const requests = system.server.metrics.requests || 0;
            const errors = system.server.metrics.errors || 0;
            const errorRate = requests > 0 ? errors / requests : 0;
            this.recordMetric('errorRate', errorRate);
        }
        
        // Chip change metrics
        const game = state.game || {};
        if (game.tables) {
            let totalChipChanges = 0;
            for (const table of Object.values(game.tables)) {
                if (table.seats) {
                    for (const seat of table.seats) {
                        if (seat && seat.chips !== undefined) {
                            totalChipChanges += Math.abs(seat.chips || 0);
                        }
                    }
                }
            }
            this.recordMetric('chipChanges', totalChipChanges);
        }
        
        // Player action metrics
        const monitoring = state.monitoring || {};
        const detection = monitoring.detection || {};
        const detectionRate = detection.detectionRate || 0;
        this.recordMetric('playerActions', detectionRate);
        
        // State change metrics
        const eventLog = state.eventLog || [];
        const recentEvents = eventLog.slice(-10);
        this.recordMetric('stateChanges', recentEvents.length);
    }
    
    /**
     * Record a metric value
     */
    recordMetric(metricName, value) {
        if (!this.metrics[metricName]) {
            this.metrics[metricName] = [];
        }
        
        // Add to history (keep last 1000 samples)
        this.metrics[metricName].push({
            value,
            timestamp: Date.now()
        });
        
        if (this.metrics[metricName].length > 1000) {
            this.metrics[metricName].shift();
        }
        
        // Update pattern
        this.updatePattern(metricName, value);
    }
    
    /**
     * Update pattern for a metric
     */
    updatePattern(metricName, value) {
        if (!this.patterns.has(metricName)) {
            this.patterns.set(metricName, {
                mean: 0,
                stdDev: 0,
                samples: [],
                history: [],
                lastUpdate: Date.now()
            });
        }
        
        const pattern = this.patterns.get(metricName);
        pattern.samples.push(value);
        pattern.history.push({ value, timestamp: Date.now() });
        
        // Keep last 1000 samples
        if (pattern.samples.length > 1000) {
            pattern.samples.shift();
        }
        if (pattern.history.length > 1000) {
            pattern.history.shift();
        }
        
        // Recalculate statistics if we have enough samples
        if (pattern.samples.length >= this.minSamples) {
            this.calculateStatistics(metricName);
        }
    }
    
    /**
     * Calculate statistics for a metric
     */
    calculateStatistics(metricName) {
        const pattern = this.patterns.get(metricName);
        if (!pattern || pattern.samples.length < this.minSamples) {
            return;
        }
        
        const samples = pattern.samples;
        
        // Calculate mean
        const sum = samples.reduce((a, b) => a + b, 0);
        pattern.mean = sum / samples.length;
        
        // Calculate standard deviation
        const variance = samples.reduce((sum, val) => {
            return sum + Math.pow(val - pattern.mean, 2);
        }, 0) / samples.length;
        pattern.stdDev = Math.sqrt(variance);
        
        pattern.lastUpdate = Date.now();
    }
    
    /**
     * Detect anomalies
     */
    detectAnomalies() {
        for (const [metricName, pattern] of this.patterns.entries()) {
            if (pattern.samples.length < this.minSamples) {
                continue; // Not enough data yet
            }
            
            // Check recent values
            const recentSamples = pattern.samples.slice(-10);
            for (const value of recentSamples) {
                const zScore = this.calculateZScore(value, pattern.mean, pattern.stdDev);
                
                if (Math.abs(zScore) > this.anomalyThreshold) {
                    this.reportAnomaly(metricName, value, pattern, zScore);
                }
            }
        }
    }
    
    /**
     * Calculate Z-score (standard deviations from mean)
     */
    calculateZScore(value, mean, stdDev) {
        if (stdDev === 0) {
            return 0; // No variation
        }
        return (value - mean) / stdDev;
    }
    
    /**
     * Report anomaly
     */
    reportAnomaly(metricName, value, pattern, zScore) {
        // Check if we've already reported this anomaly recently (avoid spam)
        const recentAnomaly = this.anomalies.find(a => 
            a.metric === metricName && 
            Date.now() - a.timestamp < 60000 // Within last minute
        );
        
        if (recentAnomaly) {
            return; // Already reported recently
        }
        
        const anomaly = {
            id: `anomaly-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            metric: metricName,
            value,
            expected: {
                mean: pattern.mean,
                stdDev: pattern.stdDev,
                range: [pattern.mean - (this.anomalyThreshold * pattern.stdDev), 
                        pattern.mean + (this.anomalyThreshold * pattern.stdDev)]
            },
            zScore: Math.abs(zScore),
            deviation: value - pattern.mean,
            severity: this.calculateSeverity(zScore),
            timestamp: Date.now()
        };
        
        // Add to history
        this.anomalies.push(anomaly);
        if (this.anomalies.length > this.maxAnomaliesHistory) {
            this.anomalies.shift();
        }
        
        // Report to issue detector
        if (this.issueDetector) {
            this.issueDetector.detectIssue({
                type: `ANOMALY_${metricName.toUpperCase()}`,
                severity: anomaly.severity,
                method: 'enhancedAnomalyDetection',
                details: {
                    metric: metricName,
                    value,
                    expected: pattern.mean,
                    deviation: anomaly.deviation,
                    zScore: anomaly.zScore,
                    samples: pattern.samples.length
                },
                timestamp: Date.now()
            });
        }
        
        // Emit event
        this.emit('anomaly', anomaly);
    }
    
    /**
     * Calculate severity based on Z-score
     */
    calculateSeverity(zScore) {
        const absZScore = Math.abs(zScore);
        
        if (absZScore >= 5) {
            return 'critical'; // 5+ standard deviations
        } else if (absZScore >= 4) {
            return 'high'; // 4-5 standard deviations
        } else if (absZScore >= 3) {
            return 'medium'; // 3-4 standard deviations
        } else {
            return 'low'; // Less than 3 standard deviations (shouldn't happen due to threshold)
        }
    }
    
    /**
     * Get pattern for a metric
     */
    getPattern(metricName) {
        return this.patterns.get(metricName) || null;
    }
    
    /**
     * Get all patterns
     */
    getAllPatterns() {
        const patterns = {};
        for (const [metricName, pattern] of this.patterns.entries()) {
            patterns[metricName] = {
                mean: pattern.mean,
                stdDev: pattern.stdDev,
                samples: pattern.samples.length,
                lastUpdate: pattern.lastUpdate
            };
        }
        return patterns;
    }
    
    /**
     * Get recent anomalies
     */
    getRecentAnomalies(limit = 50) {
        return this.anomalies.slice(-limit);
    }
    
    /**
     * Get anomaly statistics
     */
    getStatistics() {
        const stats = {
            totalAnomalies: this.anomalies.length,
            byMetric: {},
            bySeverity: {
                critical: 0,
                high: 0,
                medium: 0,
                low: 0
            },
            patterns: this.getAllPatterns()
        };
        
        // Count by metric
        for (const anomaly of this.anomalies) {
            if (!stats.byMetric[anomaly.metric]) {
                stats.byMetric[anomaly.metric] = 0;
            }
            stats.byMetric[anomaly.metric]++;
            
            // Count by severity
            stats.bySeverity[anomaly.severity]++;
        }
        
        return stats;
    }
    
    /**
     * Reset pattern for a metric (useful when system behavior changes)
     */
    resetPattern(metricName) {
        if (this.patterns.has(metricName)) {
            this.patterns.delete(metricName);
        }
        if (this.metrics[metricName]) {
            this.metrics[metricName] = [];
        }
    }
    
    /**
     * Adapt threshold based on false positive rate
     */
    adaptThreshold(metricName, falsePositiveRate) {
        // If too many false positives, increase threshold
        // If too few detections, decrease threshold
        if (falsePositiveRate > 0.1) {
            this.anomalyThreshold = Math.min(this.anomalyThreshold + 0.5, 5);
        } else if (falsePositiveRate < 0.05) {
            this.anomalyThreshold = Math.max(this.anomalyThreshold - 0.1, 2);
        }
    }
}

module.exports = EnhancedAnomalyDetection;
