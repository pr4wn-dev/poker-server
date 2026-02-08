/**
 * Code Change Tracker - Learn from Actual Code Changes
 * 
 * Tracks what code was actually changed in successful fixes.
 * Learns from code patterns, not just outcomes.
 * 
 * Features:
 * - Track file paths modified in fixes
 * - Track before/after code snippets
 * - Learn code patterns that lead to success
 * - Suggest specific files to modify
 */

const EventEmitter = require('events');
const fs = require('fs').promises;
const path = require('path');
const gameLogger = require('../../src/utils/GameLogger');

class CodeChangeTracker extends EventEmitter {
    constructor(stateStore, projectRoot) {
        super();
        this.stateStore = stateStore;
        this.projectRoot = projectRoot;
        
        // Code changes by fix
        this.codeChanges = new Map(); // fixId -> CodeChange
        
        // Code patterns learned
        this.codePatterns = new Map(); // pattern -> { frequency, successRate, examples }
        
        // File change patterns
        this.filePatterns = new Map(); // filePath -> { changeCount, successRate, lastChanged }
        
        // Load changes
        this.load();
    }
    
    /**
     * Track code change for a fix
     */
    async trackCodeChange(fixId, fixAttempt) {
        if (fixAttempt.result !== 'success') return;
        
        const codeChange = {
            fixId,
            timestamp: Date.now(),
            issueType: fixAttempt.issueType,
            fixMethod: fixAttempt.fixMethod,
            filesChanged: [],
            codePatterns: [],
            result: fixAttempt.result
        };
        
        // Try to detect code changes from fix details
        if (fixAttempt.fixDetails) {
            // Extract file changes from fix details
            if (fixAttempt.fixDetails.files) {
                codeChange.filesChanged = fixAttempt.fixDetails.files;
            }
            
            // Extract code patterns
            if (fixAttempt.fixDetails.codePattern) {
                codeChange.codePatterns.push(fixAttempt.fixDetails.codePattern);
            }
        }
        
        // Store change
        this.codeChanges.set(fixId, codeChange);
        
        // Learn patterns
        this.learnFromCodeChange(codeChange);
        
        // Save
        this.save();
        
        gameLogger.info('CERBERUS', '[CODE_CHANGE_TRACKER] Code change tracked', {
            fixId,
            filesChanged: codeChange.filesChanged.length,
            patterns: codeChange.codePatterns.length
        });
    }
    
    /**
     * Manually record code change (when AI makes a fix)
     */
    recordCodeChange(fixId, change) {
        const codeChange = {
            fixId,
            timestamp: Date.now(),
            issueType: change.issueType,
            fixMethod: change.method,
            filesChanged: change.files || [],
            codePatterns: change.patterns || [],
            result: change.result || 'success'
        };
        
        // Store change
        this.codeChanges.set(fixId, codeChange);
        
        // Learn patterns
        this.learnFromCodeChange(codeChange);
        
        // Save
        this.save();
        
        this.emit('codeChangeRecorded', codeChange);
    }
    
    /**
     * Learn from code change
     */
    learnFromCodeChange(codeChange) {
        // Learn file patterns
        for (const file of codeChange.filesChanged) {
            if (!this.filePatterns.has(file.path)) {
                this.filePatterns.set(file.path, {
                    changeCount: 0,
                    successCount: 0,
                    successRate: 0,
                    lastChanged: null,
                    commonPatterns: []
                });
            }
            
            const pattern = this.filePatterns.get(file.path);
            pattern.changeCount++;
            if (codeChange.result === 'success') {
                pattern.successCount++;
            }
            pattern.successRate = pattern.successCount / pattern.changeCount;
            pattern.lastChanged = Date.now();
            
            // Track common patterns in this file
            for (const codePattern of codeChange.codePatterns) {
                if (!pattern.commonPatterns.find(p => p.type === codePattern.type)) {
                    pattern.commonPatterns.push({
                        type: codePattern.type,
                        frequency: 1,
                        successRate: codeChange.result === 'success' ? 1.0 : 0.0
                    });
                } else {
                    const existing = pattern.commonPatterns.find(p => p.type === codePattern.type);
                    existing.frequency++;
                    if (codeChange.result === 'success') {
                        existing.successRate = (existing.successRate * (existing.frequency - 1) + 1.0) / existing.frequency;
                    }
                }
            }
        }
        
        // Learn code patterns
        for (const codePattern of codeChange.codePatterns) {
            const patternKey = `${codePattern.type}:${codePattern.description || ''}`;
            
            if (!this.codePatterns.has(patternKey)) {
                this.codePatterns.set(patternKey, {
                    type: codePattern.type,
                    description: codePattern.description,
                    frequency: 0,
                    successCount: 0,
                    successRate: 0,
                    examples: [],
                    files: []
                });
            }
            
            const pattern = this.codePatterns.get(patternKey);
            pattern.frequency++;
            if (codeChange.result === 'success') {
                pattern.successCount++;
            }
            pattern.successRate = pattern.successCount / pattern.frequency;
            
            // Add example
            if (codePattern.before && codePattern.after) {
                pattern.examples.push({
                    before: codePattern.before,
                    after: codePattern.after,
                    file: codeChange.filesChanged[0]?.path,
                    timestamp: codeChange.timestamp
                });
                
                // Keep only last 10 examples
                if (pattern.examples.length > 10) {
                    pattern.examples.shift();
                }
            }
            
            // Track files
            for (const file of codeChange.filesChanged) {
                if (!pattern.files.includes(file.path)) {
                    pattern.files.push(file.path);
                }
            }
        }
    }
    
    /**
     * Get code patterns for an issue type
     */
    getCodePatternsForIssue(issueType) {
        const patterns = [];
        
        for (const [patternKey, pattern] of this.codePatterns.entries()) {
            // Check if pattern was used for similar issues
            const relevant = this.codeChanges.values().some(change => 
                change.issueType === issueType && 
                change.codePatterns.some(p => p.type === pattern.type)
            );
            
            if (relevant) {
                patterns.push({
                    pattern,
                    relevance: 1.0,
                    successRate: pattern.successRate
                });
            }
        }
        
        // Sort by success rate
        patterns.sort((a, b) => b.successRate - a.successRate);
        
        return patterns.slice(0, 5);
    }
    
    /**
     * Get files likely to need changes for an issue
     */
    getFilesForIssue(issueType) {
        const fileScores = new Map();
        
        // Find files that were changed for similar issues
        for (const codeChange of this.codeChanges.values()) {
            if (codeChange.issueType === issueType && codeChange.result === 'success') {
                for (const file of codeChange.filesChanged) {
                    if (!fileScores.has(file.path)) {
                        fileScores.set(file.path, {
                            path: file.path,
                            score: 0,
                            successCount: 0,
                            changeCount: 0,
                            lastChanged: null
                        });
                    }
                    
                    const score = fileScores.get(file.path);
                    score.score += 1.0;
                    score.changeCount++;
                    if (codeChange.result === 'success') {
                        score.successCount++;
                    }
                    if (!score.lastChanged || codeChange.timestamp > score.lastChanged) {
                        score.lastChanged = codeChange.timestamp;
                    }
                }
            }
        }
        
        // Convert to array and sort
        const files = Array.from(fileScores.values())
            .sort((a, b) => b.score - a.score)
            .slice(0, 5);
        
        return files;
    }
    
    /**
     * Get code examples for a pattern
     */
    getCodeExamples(patternType) {
        const pattern = Array.from(this.codePatterns.values())
            .find(p => p.type === patternType);
        
        if (!pattern) return [];
        
        return pattern.examples.slice(-5); // Last 5 examples
    }
    
    /**
     * Get all code changes
     */
    getAllCodeChanges() {
        return Array.from(this.codeChanges.values());
    }
    
    /**
     * Get code change by fix ID
     */
    getCodeChange(fixId) {
        return this.codeChanges.get(fixId);
    }
    
    /**
     * Save code changes
     */
    save() {
        const data = {
            codeChanges: Array.from(this.codeChanges.entries()),
            codePatterns: Array.from(this.codePatterns.entries()),
            filePatterns: Array.from(this.filePatterns.entries()),
            lastSaved: Date.now()
        };
        
        this.stateStore.updateState('learning.codeChanges', data);
    }
    
    /**
     * Load code changes
     */
    load() {
        const data = this.stateStore.getState('learning.codeChanges');
        if (!data) return;
        
        try {
            if (data.codeChanges && Array.isArray(data.codeChanges)) {
                this.codeChanges = new Map(data.codeChanges);
            }
            if (data.codePatterns && Array.isArray(data.codePatterns)) {
                this.codePatterns = new Map(data.codePatterns);
            }
            if (data.filePatterns && Array.isArray(data.filePatterns)) {
                this.filePatterns = new Map(data.filePatterns);
            }
        } catch (error) {
            // If load fails, start with empty maps
            gameLogger.error('CERBERUS', '[CODE_CHANGE_TRACKER] Load error', { error: error.message });
        }
    }
}

module.exports = CodeChangeTracker;
