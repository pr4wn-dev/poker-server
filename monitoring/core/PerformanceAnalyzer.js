/**
 * Performance Analyzer - Phase 7
 * 
 * Analyzes system performance:
 * - Analyze detection speed
 * - Analyze fix success rates
 * - Identify improvements
 */

const EventEmitter = require('events');
const gameLogger = require('../../src/utils/GameLogger');

class PerformanceAnalyzer extends EventEmitter {
    constructor(stateStore, issueDetector, fixTracker, learningEngine, performanceMonitor) {
        super();
        this.stateStore = stateStore;
        this.issueDetector = issueDetector;
        this.fixTracker = fixTracker;
        this.learningEngine = learningEngine;
        this.performanceMonitor = performanceMonitor;
        
        // Analysis history
        this.analysisHistory = [];
        this.maxHistory = 50;
        
        // Performance metrics
        this.metrics = {
            detectionSpeed: [],
            fixSuccessRates: [],
            improvements: []
        };
    }
    
    /**
     * Analyze system performance
     */
    async analyzePerformance() {
        const analysis = {
            timestamp: Date.now(),
            detectionSpeed: this.analyzeDetectionSpeed(),
            fixSuccessRates: this.analyzeFixSuccessRates(),
            improvements: this.identifyImprovements(),
            recommendations: []
        };
        
        // Generate recommendations
        analysis.recommendations = this.generateRecommendations(analysis);
        
        // Store analysis
        this.analysisHistory.push(analysis);
        if (this.analysisHistory.length > this.maxHistory) {
            this.analysisHistory.shift();
        }
        
        this.stateStore.updateState('monitoring.performanceAnalysis', {
            latest: analysis,
            history: this.analysisHistory.slice(-20)
        });
        
        this.emit('performanceAnalyzed', analysis);
        
        return analysis;
    }
    
    /**
     * Analyze detection speed
     */
    analyzeDetectionSpeed() {
        if (!this.performanceMonitor) {
            return { avgTime: null, status: 'no_data' };
        }
        
        const report = this.performanceMonitor.getPerformanceReport();
        const detectionOps = report.operations?.detection || {};
        
        const avgTime = detectionOps.avgDuration || 0;
        const maxTime = detectionOps.maxDuration || 0;
        
        let status = 'good';
        if (avgTime > 1000) status = 'slow';
        if (avgTime > 5000) status = 'critical';
        
        return {
            avgTime,
            maxTime,
            status,
            threshold: 1000,
            recommendation: status === 'good' 
                ? null 
                : `Detection speed is ${status} (avg: ${avgTime}ms). Consider optimizing detection operations.`
        };
    }
    
    /**
     * Analyze fix success rates
     */
    analyzeFixSuccessRates() {
        if (!this.fixTracker) {
            return { overallRate: null, status: 'no_data' };
        }
        
        const successRates = this.fixTracker.successRates;
        const rates = Array.from(successRates.values()).map(s => s.rate);
        
        if (rates.length === 0) {
            return { overallRate: null, status: 'no_data' };
        }
        
        const overallRate = rates.reduce((a, b) => a + b, 0) / rates.length;
        
        let status = 'good';
        if (overallRate < 0.5) status = 'poor';
        if (overallRate < 0.3) status = 'critical';
        
        return {
            overallRate,
            status,
            methodCount: rates.length,
            topMethods: Array.from(successRates.entries())
                .sort((a, b) => b[1].rate - a[1].rate)
                .slice(0, 5)
                .map(([method, stats]) => ({ method, rate: stats.rate })),
            bottomMethods: Array.from(successRates.entries())
                .sort((a, b) => a[1].rate - b[1].rate)
                .slice(0, 5)
                .map(([method, stats]) => ({ method, rate: stats.rate })),
            recommendation: status === 'good'
                ? null
                : `Fix success rate is ${status} (${(overallRate * 100).toFixed(1)}%). Review failed fix methods and improve learning.`
        };
    }
    
    /**
     * Identify improvements
     */
    identifyImprovements() {
        const improvements = [];
        
        // Check detection speed
        const detectionSpeed = this.analyzeDetectionSpeed();
        if (detectionSpeed.status !== 'good') {
            improvements.push({
                type: 'DETECTION_SPEED',
                priority: detectionSpeed.status === 'critical' ? 'high' : 'medium',
                description: detectionSpeed.recommendation,
                impact: 'Faster detection improves system responsiveness'
            });
        }
        
        // Check fix success rates
        const fixSuccess = this.analyzeFixSuccessRates();
        if (fixSuccess.status !== 'good') {
            improvements.push({
                type: 'FIX_SUCCESS_RATE',
                priority: fixSuccess.status === 'critical' ? 'high' : 'medium',
                description: fixSuccess.recommendation,
                impact: 'Higher success rates improve system reliability'
            });
        }
        
        // Check learning confidence
        if (this.learningEngine) {
            const confidence = this.learningEngine.getLearningConfidence();
            if (confidence.overall < 50) {
                improvements.push({
                    type: 'LEARNING_CONFIDENCE',
                    priority: 'medium',
                    description: `Learning confidence is low (${confidence.overall.toFixed(1)}%). System needs more data to learn effectively.`,
                    impact: 'Higher confidence improves suggestion quality'
                });
            }
        }
        
        return improvements;
    }
    
    /**
     * Generate recommendations
     */
    generateRecommendations(analysis) {
        const recommendations = [];
        
        for (const improvement of analysis.improvements) {
            recommendations.push({
                type: improvement.type,
                priority: improvement.priority,
                description: improvement.description,
                impact: improvement.impact,
                action: this.getActionForImprovement(improvement.type)
            });
        }
        
        return recommendations;
    }
    
    /**
     * Get action for improvement type
     */
    getActionForImprovement(type) {
        const actions = {
            'DETECTION_SPEED': 'Optimize detection operations - consider caching, batching, or async processing',
            'FIX_SUCCESS_RATE': 'Review failed fix methods - improve learning system with better patterns',
            'LEARNING_CONFIDENCE': 'Provide more training data - let system learn from more successful fixes'
        };
        
        return actions[type] || 'Review and optimize';
    }
    
    /**
     * Start periodic analysis
     */
    startPeriodicAnalysis(intervalMs = 3600000) { // Every hour
        if (this.analysisInterval) {
            clearInterval(this.analysisInterval);
        }
        
        this.analysisInterval = setInterval(async () => {
            try {
                await this.analyzePerformance();
            } catch (error) {
                gameLogger.error('CERBERUS', '[PERFORMANCE_ANALYZER] Periodic analysis error', {
                    error: error.message
                });
            }
        }, intervalMs);
        
        // Run initial analysis
        setImmediate(() => {
            this.analyzePerformance().catch(error => {
                gameLogger.error('CERBERUS', '[PERFORMANCE_ANALYZER] Initial analysis error', {
                    error: error.message
                });
            });
        });
    }
    
    /**
     * Stop periodic analysis
     */
    stopPeriodicAnalysis() {
        if (this.analysisInterval) {
            clearInterval(this.analysisInterval);
            this.analysisInterval = null;
        }
    }
    
    /**
     * Get latest analysis
     */
    getLatestAnalysis() {
        return this.analysisHistory.length > 0
            ? this.analysisHistory[this.analysisHistory.length - 1]
            : null;
    }
}

module.exports = PerformanceAnalyzer;
