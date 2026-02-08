/**
 * AI Learning Engine - Advanced Problem Solving
 * 
 * Enhances the learning system with:
 * - Pattern recognition across issues
 * - Causal chain analysis
 * - Predictive problem detection
 * - Solution optimization
 * - Cross-issue learning
 */

const EventEmitter = require('events');
const gameLogger = require('../../src/utils/GameLogger');

class AILearningEngine extends EventEmitter {
    constructor(stateStore, issueDetector, fixTracker) {
        super();
        this.stateStore = stateStore;
        this.issueDetector = issueDetector;
        this.fixTracker = fixTracker;
        
        // Learning patterns
        this.patterns = new Map(); // pattern -> { frequency, successRate, contexts, solutions }
        this.causalChains = new Map(); // issueId -> [causal chain]
        this.solutionOptimization = new Map(); // issueType -> { bestSolution, alternatives, successRate }
        this.crossIssueLearning = new Map(); // pattern -> { relatedIssues, commonSolutions }
        
        // Learning confidence tracking (anti-masking safeguards)
        this.confidenceHistory = []; // Track confidence over time to detect masking
        this.maskingDetected = false;
        this.maskingWarnings = [];
        
        // Automatic adjustment thresholds
        this.lowConfidenceThreshold = 50; // Below 50% triggers adjustments
        this.criticalConfidenceThreshold = 30; // Below 30% is critical
        this.minSampleSize = 10; // Minimum samples before trusting success rates
        
        // Load learning data
        this.load();
        
        // Start periodic confidence check and auto-adjustment
        this.startConfidenceMonitoring();
    }
    
    /**
     * Learn from fix attempt
     */
    learnFromAttempt(attempt) {
        // Extract patterns
        const patterns = this.extractPatterns(attempt);
        
        // Update pattern knowledge
        for (const pattern of patterns) {
            this.updatePatternKnowledge(pattern, attempt);
        }
        
        // Analyze causal chain
        if (attempt.result === 'success') {
            this.analyzeCausalChain(attempt);
        }
        
        // Optimize solutions
        this.optimizeSolution(attempt);
        
        // Cross-issue learning
        this.learnCrossIssue(attempt);
        
        // Save learning
        this.save();
    }
    
    /**
     * Extract patterns from fix attempt
     */
    extractPatterns(attempt) {
        const patterns = [];
        
        // Issue type pattern
        if (attempt.issueType) {
            patterns.push({
                type: 'issueType',
                value: attempt.issueType,
                context: attempt.fixDetails
            });
        }
        
        // Fix method pattern
        if (attempt.fixMethod) {
            patterns.push({
                type: 'fixMethod',
                value: attempt.fixMethod,
                context: attempt.fixDetails
            });
        }
        
        // State pattern (if state was involved)
        if (attempt.state) {
            patterns.push({
                type: 'state',
                value: this.extractStatePattern(attempt.state),
                context: attempt.fixDetails
            });
        }
        
        // Log pattern (if logs were involved)
        if (attempt.logs && attempt.logs.length > 0) {
            patterns.push({
                type: 'log',
                value: this.extractLogPattern(attempt.logs),
                context: attempt.fixDetails
            });
        }
        
        return patterns;
    }
    
    /**
     * Extract state pattern
     */
    extractStatePattern(state) {
        // Extract key state features
        const features = [];
        
        if (state.chips) {
            features.push(`chips:${state.chips.total || 0}`);
        }
        if (state.phase) {
            features.push(`phase:${state.phase}`);
        }
        if (state.players) {
            features.push(`players:${Object.keys(state.players || {}).length}`);
        }
        
        return features.join('|');
    }
    
    /**
     * Extract log pattern
     */
    extractLogPattern(logs) {
        // Extract common log patterns
        const patterns = [];
        
        for (const log of logs.slice(0, 5)) { // First 5 logs
            if (log.message) {
                // Extract keywords
                const keywords = log.message.match(/\b(error|fail|exception|timeout|null|undefined)\b/gi);
                if (keywords) {
                    patterns.push(...keywords.map(k => k.toLowerCase()));
                }
            }
        }
        
        return [...new Set(patterns)].join('|');
    }
    
    /**
     * Update pattern knowledge
     */
    updatePatternKnowledge(pattern, attempt) {
        const patternKey = `${pattern.type}:${pattern.value}`;
        const existing = this.patterns.get(patternKey) || {
            frequency: 0,
            successes: 0,
            failures: 0,
            contexts: [],
            solutions: []
        };
        
        existing.frequency++;
        if (attempt.result === 'success') {
            existing.successes++;
        } else {
            existing.failures++;
        }
        
        existing.contexts.push(pattern.context);
        existing.solutions.push({
            method: attempt.fixMethod,
            result: attempt.result,
            timestamp: attempt.timestamp
        });
        
        // Keep only last 100 contexts and solutions
        if (existing.contexts.length > 100) {
            existing.contexts = existing.contexts.slice(-100);
        }
        if (existing.solutions.length > 100) {
            existing.solutions = existing.solutions.slice(-100);
        }
        
        existing.successRate = existing.successes / existing.frequency;
        
        this.patterns.set(patternKey, existing);
    }
    
    /**
     * Analyze causal chain
     */
    analyzeCausalChain(attempt) {
        const issue = this.issueDetector.getIssue(attempt.issueId);
        if (!issue) return;
        
        // Build causal chain
        const chain = [{
            issue: issue.type,
            fix: attempt.fixMethod,
            result: attempt.result,
            timestamp: attempt.timestamp
        }];
        
        // Look for related issues
        const relatedIssues = this.findRelatedIssues(issue);
        for (const related of relatedIssues) {
            chain.push({
                issue: related.type,
                relationship: this.getRelationship(issue, related),
                timestamp: related.firstSeen
            });
        }
        
        this.causalChains.set(attempt.issueId, chain);
    }
    
    /**
     * Find related issues
     */
    findRelatedIssues(issue) {
        const allIssues = this.issueDetector.getActiveIssues();
        const related = [];
        
        for (const other of allIssues) {
            if (other.id === issue.id) continue;
            
            // Same type
            if (other.type === issue.type) {
                related.push(other);
            }
            
            // Same root cause
            if (other.rootCause === issue.rootCause) {
                related.push(other);
            }
            
            // Similar details
            if (this.areSimilar(issue, other)) {
                related.push(other);
            }
        }
        
        return related;
    }
    
    /**
     * Check if two issues are similar
     */
    areSimilar(issue1, issue2) {
        // Check details similarity
        const details1 = JSON.stringify(issue1.details || {});
        const details2 = JSON.stringify(issue2.details || {});
        
        // Simple similarity check (could be improved)
        const commonKeys = Object.keys(issue1.details || {}).filter(k => 
            issue2.details && issue2.details[k] !== undefined
        );
        
        return commonKeys.length > 0;
    }
    
    /**
     * Get relationship between issues
     */
    getRelationship(issue1, issue2) {
        if (issue1.rootCause === issue2.rootCause) {
            return 'same_root_cause';
        }
        if (issue1.type === issue2.type) {
            return 'same_type';
        }
        return 'related';
    }
    
    /**
     * Optimize solution
     */
    optimizeSolution(attempt) {
        if (attempt.result !== 'success') return;
        
        const issueType = attempt.issueType;
        const existing = this.solutionOptimization.get(issueType) || {
            bestSolution: null,
            alternatives: [],
            successRate: 0,
            attempts: 0
        };
        
        existing.attempts++;
        
        // Update best solution if this is better
        const currentSuccessRate = this.fixTracker.getSuccessRate(attempt.fixMethod);
        if (currentSuccessRate > existing.successRate) {
            existing.bestSolution = attempt.fixMethod;
            existing.successRate = currentSuccessRate;
        }
        
        // Add to alternatives if not already there
        if (!existing.alternatives.find(a => a.method === attempt.fixMethod)) {
            existing.alternatives.push({
                method: attempt.fixMethod,
                successRate: currentSuccessRate,
                lastUsed: attempt.timestamp
            });
        }
        
        // Sort alternatives by success rate
        existing.alternatives.sort((a, b) => b.successRate - a.successRate);
        
        this.solutionOptimization.set(issueType, existing);
    }
    
    /**
     * Learn cross-issue patterns
     */
    learnCrossIssue(attempt) {
        const issue = this.issueDetector.getIssue(attempt.issueId);
        if (!issue) return;
        
        // Find issues with similar patterns
        const similarIssues = this.findSimilarIssues(issue);
        
        for (const similar of similarIssues) {
            const patternKey = `${issue.type}:${similar.type}`;
            const existing = this.crossIssueLearning.get(patternKey) || {
                relatedIssues: [],
                commonSolutions: [],
                frequency: 0
            };
            
            existing.frequency++;
            
            // Add to related issues if not already there
            if (!existing.relatedIssues.find(i => i.id === similar.id)) {
                existing.relatedIssues.push({
                    id: similar.id,
                    type: similar.type
                });
            }
            
            // Add solution if successful
            if (attempt.result === 'success') {
                if (!existing.commonSolutions.find(s => s.method === attempt.fixMethod)) {
                    const methodStats = this.fixTracker.successRates.get(attempt.fixMethod);
                    const successRate = methodStats ? methodStats.rate : 0;
                    existing.commonSolutions.push({
                        method: attempt.fixMethod,
                        successRate: successRate,
                        lastUsed: attempt.timestamp
                    });
                }
            }
            
            this.crossIssueLearning.set(patternKey, existing);
        }
    }
    
    /**
     * Find similar issues
     */
    findSimilarIssues(issue) {
        const allIssues = this.issueDetector.getActiveIssues();
        return allIssues.filter(other => 
            other.id !== issue.id && this.areSimilar(issue, other)
        );
    }
    
    /**
     * Get best solution for issue type
     */
    getBestSolution(issueType) {
        const optimization = this.solutionOptimization.get(issueType);
        if (!optimization) return null;
        
        return {
            method: optimization.bestSolution,
            successRate: optimization.successRate,
            alternatives: optimization.alternatives
        };
    }
    
    /**
     * Predict likely issues
     */
    predictIssues(currentState) {
        const predictions = [];
        
        // Analyze patterns to predict issues
        for (const [patternKey, pattern] of this.patterns.entries()) {
            if (pattern.frequency > 5 && pattern.successRate < 0.3) {
                // Pattern that frequently fails - likely to cause issues
                predictions.push({
                    pattern: patternKey,
                    likelihood: pattern.frequency / 100, // Normalize
                    reason: `Pattern ${patternKey} has high failure rate (${(pattern.successRate * 100).toFixed(1)}%)`
                });
            }
        }
        
        return predictions;
    }
    
    /**
     * Get learning confidence - overall ability percentage
     * This represents how well Cerberus is learning across all capabilities
     * ALWAYS visible - cannot be masked
     */
    getLearningConfidence() {
        const metrics = this.calculateLearningMetrics();
        const confidence = this.calculateOverallConfidence(metrics);
        
        // Detect masking attempts
        this.detectMasking(confidence, metrics);
        
        // Store in history for trend analysis
        this.confidenceHistory.push({
            timestamp: Date.now(),
            confidence,
            metrics,
            maskingDetected: this.maskingDetected
        });
        
        // Keep only last 100 entries
        if (this.confidenceHistory.length > 100) {
            this.confidenceHistory = this.confidenceHistory.slice(-100);
        }
        
        // Auto-adjust if confidence is low
        if (confidence < this.lowConfidenceThreshold) {
            this.autoAdjust(confidence, metrics);
        }
        
        return {
            overallConfidence: Math.round(confidence),
            breakdown: {
                patternRecognition: Math.round(metrics.patternRecognition),
                causalAnalysis: Math.round(metrics.causalAnalysis),
                solutionOptimization: Math.round(metrics.solutionOptimization),
                crossIssueLearning: Math.round(metrics.crossIssueLearning),
                predictionAccuracy: Math.round(metrics.predictionAccuracy),
                dataQuality: Math.round(metrics.dataQuality)
            },
            maskingDetected: this.maskingDetected,
            maskingWarnings: this.maskingWarnings.slice(-5), // Last 5 warnings
            autoAdjustments: this.getAutoAdjustments(),
            trend: this.getConfidenceTrend(),
            sampleSizes: {
                patterns: this.patterns.size,
                causalChains: this.causalChains.size,
                solutions: this.solutionOptimization.size,
                crossIssue: this.crossIssueLearning.size
            },
            timestamp: Date.now()
        };
    }
    
    /**
     * Calculate learning metrics for each capability
     */
    calculateLearningMetrics() {
        // Pattern Recognition: Based on pattern frequency and success rate quality
        let patternRecognition = 0;
        if (this.patterns.size > 0) {
            const patternScores = Array.from(this.patterns.values()).map(p => {
                // Score based on frequency (more data = better) and success rate variance (realistic rates)
                const frequencyScore = Math.min(p.frequency / 20, 1) * 50; // Max 50 points for frequency
                const qualityScore = this.assessPatternQuality(p) * 50; // Max 50 points for quality
                return frequencyScore + qualityScore;
            });
            patternRecognition = patternScores.reduce((a, b) => a + b, 0) / patternScores.length;
        }
        
        // Causal Analysis: Based on chain depth and accuracy
        let causalAnalysis = 0;
        if (this.causalChains.size > 0) {
            const chainScores = Array.from(this.causalChains.values()).map(chain => {
                const depthScore = Math.min(chain.length / 5, 1) * 50;
                const completenessScore = (chain.filter(c => c.relationship).length / chain.length) * 50;
                return depthScore + completenessScore;
            });
            causalAnalysis = chainScores.reduce((a, b) => a + b, 0) / chainScores.length;
        }
        
        // Solution Optimization: Based on solution success rates and alternatives
        let solutionOptimization = 0;
        if (this.solutionOptimization.size > 0) {
            const solutionScores = Array.from(this.solutionOptimization.values()).map(sol => {
                const successScore = this.assessSuccessRateQuality(sol.successRate, sol.attempts) * 60;
                const alternativesScore = Math.min(sol.alternatives.length / 3, 1) * 40;
                return successScore + alternativesScore;
            });
            solutionOptimization = solutionScores.reduce((a, b) => a + b, 0) / solutionScores.length;
        }
        
        // Cross-Issue Learning: Based on relationship discovery
        let crossIssueLearning = 0;
        if (this.crossIssueLearning.size > 0) {
            const crossScores = Array.from(this.crossIssueLearning.values()).map(cross => {
                const relationshipScore = Math.min(cross.relatedIssues.length / 5, 1) * 50;
                const solutionScore = Math.min(cross.commonSolutions.length / 3, 1) * 50;
                return relationshipScore + solutionScore;
            });
            crossIssueLearning = crossScores.reduce((a, b) => a + b, 0) / crossScores.length;
        }
        
        // Prediction Accuracy: Based on pattern prediction success (if we track this)
        const predictionAccuracy = this.assessPredictionAccuracy();
        
        // Data Quality: Based on sample sizes and data integrity
        const dataQuality = this.assessDataQuality();
        
        return {
            patternRecognition: Math.max(0, Math.min(100, patternRecognition)),
            causalAnalysis: Math.max(0, Math.min(100, causalAnalysis)),
            solutionOptimization: Math.max(0, Math.min(100, solutionOptimization)),
            crossIssueLearning: Math.max(0, Math.min(100, crossIssueLearning)),
            predictionAccuracy: Math.max(0, Math.min(100, predictionAccuracy)),
            dataQuality: Math.max(0, Math.min(100, dataQuality))
        };
    }
    
    /**
     * Calculate overall confidence from metrics
     */
    calculateOverallConfidence(metrics) {
        // Weighted average - all capabilities are important
        const weights = {
            patternRecognition: 0.20,
            causalAnalysis: 0.20,
            solutionOptimization: 0.25,
            crossIssueLearning: 0.15,
            predictionAccuracy: 0.10,
            dataQuality: 0.10
        };
        
        const weightedSum = 
            metrics.patternRecognition * weights.patternRecognition +
            metrics.causalAnalysis * weights.causalAnalysis +
            metrics.solutionOptimization * weights.solutionOptimization +
            metrics.crossIssueLearning * weights.crossIssueLearning +
            metrics.predictionAccuracy * weights.predictionAccuracy +
            metrics.dataQuality * weights.dataQuality;
        
        return Math.max(0, Math.min(100, weightedSum));
    }
    
    /**
     * Assess pattern quality - detect masking
     */
    assessPatternQuality(pattern) {
        // Check for suspicious patterns (masking indicators)
        if (pattern.frequency < this.minSampleSize) {
            // Low sample size - don't trust high success rates
            if (pattern.successRate > 0.8) {
                this.flagMasking('pattern', `High success rate (${(pattern.successRate * 100).toFixed(1)}%) with low sample size (${pattern.frequency})`);
                return 0.3; // Penalize low sample sizes with high rates
            }
        }
        
        // Check for unrealistic success rates (100% is suspicious)
        if (pattern.successRate === 1.0 && pattern.frequency < 50) {
            this.flagMasking('pattern', `Perfect success rate (100%) with insufficient samples (${pattern.frequency})`);
            return 0.2; // Heavy penalty for perfect rates with low samples
        }
        
        // Check for sudden jumps (masking attempt)
        if (pattern.solutions.length >= 2) {
            const recent = pattern.solutions.slice(-5);
            const recentSuccessRate = recent.filter(s => s.result === 'success').length / recent.length;
            const overallSuccessRate = pattern.successRate;
            
            if (Math.abs(recentSuccessRate - overallSuccessRate) > 0.5) {
                this.flagMasking('pattern', `Sudden success rate change detected (${(overallSuccessRate * 100).toFixed(1)}% -> ${(recentSuccessRate * 100).toFixed(1)}%)`);
                return 0.4; // Penalize sudden changes
            }
        }
        
        // Normal quality assessment
        const frequencyQuality = Math.min(pattern.frequency / 50, 1);
        const successRateQuality = pattern.successRate; // Realistic success rates are good
        const varianceQuality = this.calculateVarianceQuality(pattern.solutions);
        
        return (frequencyQuality * 0.3 + successRateQuality * 0.4 + varianceQuality * 0.3);
    }
    
    /**
     * Assess success rate quality - detect masking
     */
    assessSuccessRateQuality(successRate, attempts) {
        // Masking detection: 100% success with low attempts is suspicious
        if (successRate === 1.0 && attempts < this.minSampleSize * 2) {
            this.flagMasking('solution', `Perfect success rate (100%) with low attempts (${attempts})`);
            return 0.2;
        }
        
        // Realistic success rates (30-80%) are more trustworthy than extremes
        if (successRate > 0.95 && attempts < 50) {
            this.flagMasking('solution', `Unrealistically high success rate (${(successRate * 100).toFixed(1)}%) with insufficient data`);
            return 0.3;
        }
        
        // Low sample size penalty
        if (attempts < this.minSampleSize) {
            return Math.min(successRate, 0.5); // Cap at 50% for low samples
        }
        
        return successRate;
    }
    
    /**
     * Calculate variance quality - consistent results are better
     */
    calculateVarianceQuality(solutions) {
        if (solutions.length < 3) return 0.5; // Need at least 3 samples
        
        const results = solutions.map(s => s.result === 'success' ? 1 : 0);
        const mean = results.reduce((a, b) => a + b, 0) / results.length;
        const variance = results.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / results.length;
        
        // Low variance (consistent) is good, but too consistent (0 variance) might indicate masking
        if (variance === 0 && results.length < 20) {
            return 0.6; // Slightly penalize perfect consistency with low samples
        }
        
        return 1.0 - Math.min(variance, 0.5); // Prefer consistency
    }
    
    /**
     * Assess prediction accuracy (placeholder - can be enhanced)
     */
    assessPredictionAccuracy() {
        // For now, base on pattern quality
        if (this.patterns.size === 0) return 0;
        
        const avgPatternQuality = Array.from(this.patterns.values())
            .map(p => this.assessPatternQuality(p))
            .reduce((a, b) => a + b, 0) / this.patterns.size;
        
        return avgPatternQuality * 100;
    }
    
    /**
     * Assess data quality
     */
    assessDataQuality() {
        let quality = 0;
        let factors = 0;
        
        // Pattern data quality
        if (this.patterns.size > 0) {
            const avgFrequency = Array.from(this.patterns.values())
                .map(p => p.frequency)
                .reduce((a, b) => a + b, 0) / this.patterns.size;
            quality += Math.min(avgFrequency / 30, 1) * 25;
            factors++;
        }
        
        // Causal chain quality
        if (this.causalChains.size > 0) {
            const avgChainLength = Array.from(this.causalChains.values())
                .map(c => c.length)
                .reduce((a, b) => a + b, 0) / this.causalChains.size;
            quality += Math.min(avgChainLength / 5, 1) * 25;
            factors++;
        }
        
        // Solution optimization quality
        if (this.solutionOptimization.size > 0) {
            const avgAttempts = Array.from(this.solutionOptimization.values())
                .map(s => s.attempts)
                .reduce((a, b) => a + b, 0) / this.solutionOptimization.size;
            quality += Math.min(avgAttempts / 20, 1) * 25;
            factors++;
        }
        
        // Cross-issue learning quality
        if (this.crossIssueLearning.size > 0) {
            const avgFrequency = Array.from(this.crossIssueLearning.values())
                .map(c => c.frequency)
                .reduce((a, b) => a + b, 0) / this.crossIssueLearning.size;
            quality += Math.min(avgFrequency / 10, 1) * 25;
            factors++;
        }
        
        return factors > 0 ? quality / factors : 0;
    }
    
    /**
     * Detect masking attempts
     */
    detectMasking(confidence, metrics) {
        this.maskingDetected = false;
        
        // Check for suspicious patterns across all metrics
        const suspiciousPatterns = [];
        
        // Check for sudden confidence jumps (masking attempt)
        if (this.confidenceHistory.length >= 2) {
            const recent = this.confidenceHistory.slice(-3);
            const avgRecent = recent.reduce((sum, h) => sum + h.confidence, 0) / recent.length;
            const previous = this.confidenceHistory[this.confidenceHistory.length - 4];
            
            if (previous && avgRecent - previous.confidence > 30) {
                suspiciousPatterns.push('Sudden confidence jump detected - possible masking');
                this.maskingDetected = true;
            }
        }
        
        // Check for unrealistic metrics
        if (metrics.solutionOptimization > 95 && this.solutionOptimization.size < 5) {
            suspiciousPatterns.push('Unrealistically high solution optimization with low data');
            this.maskingDetected = true;
        }
        
        if (suspiciousPatterns.length > 0) {
            this.maskingWarnings.push({
                timestamp: Date.now(),
                patterns: suspiciousPatterns,
                confidence,
                metrics
            });
            
            // Keep only last 20 warnings
            if (this.maskingWarnings.length > 20) {
                this.maskingWarnings = this.maskingWarnings.slice(-20);
            }
            
            gameLogger.warn('CERBERUS', '[LEARNING_ENGINE] Masking detected', {
                patterns: suspiciousPatterns,
                confidence,
                action: 'Masking detected - confidence may be artificially inflated'
            });
        }
    }
    
    /**
     * Flag masking attempt
     */
    flagMasking(source, reason) {
        this.maskingDetected = true;
        this.maskingWarnings.push({
            timestamp: Date.now(),
            source,
            reason,
            severity: 'warning'
        });
        
        gameLogger.warn('CERBERUS', '[LEARNING_ENGINE] Masking flag', {
            source,
            reason,
            action: 'Masking attempt detected - data quality reduced'
        });
    }
    
    /**
     * Auto-adjust when confidence is low
     */
    autoAdjust(confidence, metrics) {
        const adjustments = [];
        
        // If pattern recognition is low, need more data
        if (metrics.patternRecognition < this.lowConfidenceThreshold) {
            adjustments.push({
                type: 'pattern_recognition',
                action: 'Increase pattern collection - need more fix attempts to learn patterns',
                priority: confidence < this.criticalConfidenceThreshold ? 'critical' : 'high'
            });
        }
        
        // If causal analysis is low, need deeper analysis
        if (metrics.causalAnalysis < this.lowConfidenceThreshold) {
            adjustments.push({
                type: 'causal_analysis',
                action: 'Improve causal chain tracking - need to track more state changes',
                priority: confidence < this.criticalConfidenceThreshold ? 'critical' : 'high'
            });
        }
        
        // If solution optimization is low, need more fix attempts
        if (metrics.solutionOptimization < this.lowConfidenceThreshold) {
            adjustments.push({
                type: 'solution_optimization',
                action: 'Increase fix attempt tracking - need more attempts to optimize solutions',
                priority: confidence < this.criticalConfidenceThreshold ? 'critical' : 'high'
            });
        }
        
        // If data quality is low, need better data collection
        if (metrics.dataQuality < this.lowConfidenceThreshold) {
            adjustments.push({
                type: 'data_quality',
                action: 'Improve data collection - need larger sample sizes and better data integrity',
                priority: 'high'
            });
        }
        
        // Store adjustments
        this.stateStore.updateState('learning.autoAdjustments', adjustments);
        
        // Emit event for monitoring
        this.emit('autoAdjustment', {
            confidence,
            metrics,
            adjustments
        });
        
        gameLogger.info('CERBERUS', '[LEARNING_ENGINE] Auto-adjustment triggered', {
            confidence: Math.round(confidence),
            adjustments: adjustments.length,
            actions: adjustments.map(a => a.action)
        });
    }
    
    /**
     * Get auto-adjustments
     */
    getAutoAdjustments() {
        return this.stateStore.getState('learning.autoAdjustments') || [];
    }
    
    /**
     * Get confidence trend
     */
    getConfidenceTrend() {
        if (this.confidenceHistory.length < 2) {
            return { direction: 'stable', change: 0 };
        }
        
        const recent = this.confidenceHistory.slice(-5);
        const older = this.confidenceHistory.slice(-10, -5);
        
        if (older.length === 0) {
            return { direction: 'stable', change: 0 };
        }
        
        const recentAvg = recent.reduce((sum, h) => sum + h.confidence, 0) / recent.length;
        const olderAvg = older.reduce((sum, h) => sum + h.confidence, 0) / older.length;
        
        const change = recentAvg - olderAvg;
        
        return {
            direction: change > 5 ? 'improving' : change < -5 ? 'declining' : 'stable',
            change: Math.round(change),
            recentAverage: Math.round(recentAvg),
            previousAverage: Math.round(olderAvg)
        };
    }
    
    /**
     * Start confidence monitoring
     */
    startConfidenceMonitoring() {
        // Check confidence every 5 minutes
        this.confidenceInterval = setInterval(() => {
            this.getLearningConfidence(); // This triggers detection and auto-adjustment
        }, 5 * 60 * 1000);
    }
    
    /**
     * Stop confidence monitoring
     */
    stopConfidenceMonitoring() {
        if (this.confidenceInterval) {
            clearInterval(this.confidenceInterval);
            this.confidenceInterval = null;
        }
    }
    
    // ============================================
    // AI MISTAKE LEARNING & ENHANCED MASKING DETECTION
    // ============================================
    
    /**
     * Learn from AI mistake (giving up, masking, etc.)
     */
    learnFromAIMistake(mistake) {
        // Track mistake pattern
        const mistakePattern = {
            type: mistake.type,
            context: mistake.context || {},
            frequency: 1,
            firstSeen: Date.now(),
            lastSeen: Date.now(),
            examples: [mistake]
        };
        
        const patternKey = `${mistake.type}_${JSON.stringify(mistake.context || {})}`;
        const existing = this.stateStore.getState(`ai.mistakePatterns.${patternKey}`);
        
        if (existing) {
            existing.frequency++;
            existing.lastSeen = Date.now();
            existing.examples.push(mistake);
            if (existing.examples.length > 10) {
                existing.examples.shift();
            }
        } else {
            this.stateStore.updateState(`ai.mistakePatterns.${patternKey}`, mistakePattern);
        }
        
        // Apply confidence penalty
        this.applyMistakePenalty(mistake);
        
        // Learn from mistake
        this.learnFromMistakePattern(mistake);
        
        // Emit event
        this.emit('aiMistakeLearned', mistake);
        
        gameLogger.warn('CERBERUS', '[LEARNING_ENGINE] Learned from AI mistake', {
            type: mistake.type,
            context: mistake.context,
            action: 'Pattern learned - will prevent similar mistakes'
        });
    }
    
    /**
     * Apply confidence penalty for AI mistake
     */
    applyMistakePenalty(mistake) {
        let penaltyAmount = 5; // Default
        
        if (mistake.type === 'masked_problem') {
            penaltyAmount = 15; // High penalty for masking
        } else if (mistake.type === 'gave_up') {
            penaltyAmount = 20; // Critical penalty for giving up
        } else if (mistake.type === 'superficial_fix') {
            penaltyAmount = 10; // Medium penalty for superficial fixes
        }
        
        // Reduce confidence
        if (this.confidenceHistory.length > 0) {
            const current = this.confidenceHistory[this.confidenceHistory.length - 1];
            const newConfidence = Math.max(0, current.confidence - penaltyAmount);
            
            this.confidenceHistory.push({
                timestamp: Date.now(),
                confidence: newConfidence,
                metrics: current.metrics,
                maskingDetected: true,
                penalty: {
                    reason: mistake.type,
                    amount: penaltyAmount
                }
            });
            
            // Keep only last 100
            if (this.confidenceHistory.length > 100) {
                this.confidenceHistory = this.confidenceHistory.slice(-100);
            }
        }
        
        // Flag masking
        this.flagMasking('ai_mistake', `AI mistake: ${mistake.type} - ${mistake.details || ''}`);
    }
    
    /**
     * Learn from mistake pattern to prevent future mistakes
     */
    learnFromMistakePattern(mistake) {
        // Extract patterns that lead to mistakes
        const patterns = [];
        
        if (mistake.context) {
            // Context patterns
            if (mistake.context.problemType) {
                patterns.push(`problem_${mistake.context.problemType}`);
            }
            if (mistake.context.complexity) {
                patterns.push(`complexity_${mistake.context.complexity}`);
            }
            if (mistake.context.timePressure) {
                patterns.push('time_pressure');
            }
        }
        
        // Store patterns that lead to mistakes
        for (const pattern of patterns) {
            const mistakePatterns = this.stateStore.getState('ai.mistakePatterns') || {};
            if (!mistakePatterns[pattern]) {
                mistakePatterns[pattern] = {
                    pattern,
                    mistakes: [],
                    frequency: 0
                };
            }
            mistakePatterns[pattern].mistakes.push(mistake.type);
            mistakePatterns[pattern].frequency++;
            this.stateStore.updateState('ai.mistakePatterns', mistakePatterns);
        }
    }
    
    /**
     * Detect masking in test changes (enhanced)
     */
    detectTestMasking(oldTest, newTest, context) {
        const maskingIndicators = [];
        
        // Check if test was simplified
        if (oldTest && newTest) {
            // Check if functionality checks were removed
            const oldHasFunctionalityCheck = this.hasFunctionalityCheck(oldTest);
            const newHasFunctionalityCheck = this.hasFunctionalityCheck(newTest);
            
            if (oldHasFunctionalityCheck && !newHasFunctionalityCheck) {
                maskingIndicators.push('Functionality check removed from test');
            }
            
            // Check if execution was removed
            const oldHasExecution = this.hasExecution(oldTest);
            const newHasExecution = this.hasExecution(newTest);
            
            if (oldHasExecution && !newHasExecution) {
                maskingIndicators.push('Test execution removed - test no longer runs functionality');
            }
            
            // Check if assertions were removed
            const oldHasAssertions = this.hasAssertions(oldTest);
            const newHasAssertions = this.hasAssertions(newTest);
            
            if (oldHasAssertions && !newHasAssertions) {
                maskingIndicators.push('Assertions removed from test');
            }
        }
        
        // Check context for masking keywords
        if (context && context.reason) {
            const maskingKeywords = ['simplify', 'easier', 'avoid', 'skip', 'bypass', 'workaround', 'hanging'];
            const reasonLower = context.reason.toLowerCase();
            if (maskingKeywords.some(k => reasonLower.includes(k))) {
                maskingIndicators.push(`Masking keyword in reason: "${context.reason}"`);
            }
        }
        
        if (maskingIndicators.length > 0) {
            this.flagMasking('test_change', `Test masking detected: ${maskingIndicators.join('; ')}`);
            return {
                isMasking: true,
                indicators: maskingIndicators,
                severity: 'critical'
            };
        }
        
        return { isMasking: false, indicators: [] };
    }
    
    /**
     * Check if test has functionality check
     */
    hasFunctionalityCheck(testCode) {
        if (!testCode) return false;
        const code = testCode.toLowerCase();
        return code.includes('result') || 
               code.includes('verify') || 
               code.includes('assert') || 
               code.includes('expect') ||
               code.includes('should') ||
               code.includes('pass') ||
               code.includes('fail') ||
               code.includes('equal') ||
               code.includes('match');
    }
    
    /**
     * Check if test has execution
     */
    hasExecution(testCode) {
        if (!testCode) return false;
        const code = testCode.toLowerCase();
        return code.includes('await') || 
               code.includes('()') || 
               code.includes('call') ||
               code.includes('execute') ||
               code.includes('run') ||
               code.includes('timeoperation') ||
               code.includes('processline') ||
               code.includes('recorderror');
    }
    
    /**
     * Check if test has assertions
     */
    hasAssertions(testCode) {
        if (!testCode) return false;
        const code = testCode.toLowerCase();
        return code.includes('assert') || 
               code.includes('expect') || 
               code.includes('should') ||
               code.includes('equal') ||
               code.includes('match') ||
               code.includes('be') ||
               code.includes('have');
    }
    
    /**
     * Verify fix quality (not just that tests pass)
     */
    verifyFixQuality(fix, originalProblem) {
        const quality = {
            score: 100,
            issues: [],
            warnings: []
        };
        
        // Check if fix addresses root cause
        if (originalProblem && fix) {
            const problemDesc = (originalProblem.description || '').toLowerCase();
            const fixDesc = (fix.description || '').toLowerCase();
            
            // Check if fix mentions the problem
            const problemWords = problemDesc.split(/\s+/).filter(w => w.length > 4);
            const fixWords = fixDesc.split(/\s+/).filter(w => w.length > 4);
            const matchingWords = problemWords.filter(w => fixWords.includes(w));
            
            if (matchingWords.length === 0) {
                quality.issues.push('Fix does not mention original problem');
                quality.score -= 30;
            }
            
            // Check for workaround keywords
            const workaroundKeywords = ['workaround', 'bypass', 'skip', 'avoid', 'ignore', 'simplify', 'easier'];
            if (workaroundKeywords.some(k => fixDesc.includes(k))) {
                quality.issues.push('Fix appears to be a workaround');
                quality.score -= 50;
            }
        }
        
        // Check if test was changed
        if (fix.testChange) {
            const masking = this.detectTestMasking(fix.oldTest, fix.testChange, fix);
            if (masking.isMasking) {
                quality.issues.push(`Test masking detected: ${masking.indicators.join('; ')}`);
                quality.score -= 40;
            }
        }
        
        // Check if fix has verification
        if (!fix.verification || !fix.verification.verified) {
            quality.warnings.push('Fix not verified - may not actually work');
            quality.score -= 10;
        }
        
        quality.score = Math.max(0, quality.score);
        
        // Apply confidence penalty if quality is low
        if (quality.score < 50) {
            this.flagMasking('fix_quality', `Low fix quality: ${quality.issues.join('; ')}`);
        }
        
        return quality;
    }
    
    /**
     * Get learning report (enhanced with confidence)
     */
    getLearningReport() {
        const confidence = this.getLearningConfidence();
        
        return {
            confidence, // ALWAYS include confidence - cannot be masked
            patterns: {
                total: this.patterns.size,
                topPatterns: Array.from(this.patterns.entries())
                    .sort((a, b) => b[1].frequency - a[1].frequency)
                    .slice(0, 10)
                    .map(([key, data]) => ({
                        pattern: key,
                        frequency: data.frequency,
                        successRate: data.successRate,
                        quality: this.assessPatternQuality(data)
                    }))
            },
            causalChains: {
                total: this.causalChains.size,
                recent: Array.from(this.causalChains.entries())
                    .slice(-10)
                    .map(([issueId, chain]) => ({
                        issueId,
                        chainLength: chain.length,
                        chain
                    }))
            },
            solutionOptimization: {
                total: this.solutionOptimization.size,
                optimized: Array.from(this.solutionOptimization.entries())
                    .map(([issueType, data]) => ({
                        issueType,
                        bestSolution: data.bestSolution,
                        successRate: data.successRate,
                        attempts: data.attempts,
                        quality: this.assessSuccessRateQuality(data.successRate, data.attempts),
                        alternatives: data.alternatives.length
                    }))
            },
            crossIssueLearning: {
                total: this.crossIssueLearning.size,
                relationships: Array.from(this.crossIssueLearning.entries())
                    .map(([pattern, data]) => ({
                        pattern,
                        frequency: data.frequency,
                        relatedIssues: data.relatedIssues.length,
                        commonSolutions: data.commonSolutions.length
                    }))
            }
        };
    }
    
    /**
     * Load learning data
     */
    load() {
        try {
            const patterns = this.stateStore.getState('learning.patterns');
            if (patterns && Array.isArray(patterns)) {
                for (const [key, value] of patterns) {
                    this.patterns.set(key, value);
                }
            }
            
            const causalChains = this.stateStore.getState('learning.causalChains') || {};
            this.causalChains = new Map(Object.entries(causalChains));
            
            const solutionOptimization = this.stateStore.getState('learning.solutionOptimization') || {};
            this.solutionOptimization = new Map(Object.entries(solutionOptimization));
            
            const crossIssueLearning = this.stateStore.getState('learning.crossIssueLearning') || {};
            this.crossIssueLearning = new Map(Object.entries(crossIssueLearning));
        } catch (error) {
            // DO NOT log to console - errors are for AI only, not user
            // Re-throw so UniversalErrorHandler can catch it
            throw error;
        }
    }
    
    /**
     * Save learning data
     */
    save() {
        try {
            this.stateStore.updateState('learning.patterns', Array.from(this.patterns.entries()));
            this.stateStore.updateState('learning.causalChains', Object.fromEntries(this.causalChains));
            this.stateStore.updateState('learning.solutionOptimization', Object.fromEntries(this.solutionOptimization));
            this.stateStore.updateState('learning.crossIssueLearning', Object.fromEntries(this.crossIssueLearning));
        } catch (error) {
            // DO NOT log to console - errors are for AI only, not user
            // Re-throw so UniversalErrorHandler can catch it
            throw error;
        }
    }
}

module.exports = AILearningEngine;
