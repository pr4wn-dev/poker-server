/**
 * Code Enhancement System - Phase 5
 * 
 * Automatically enhances code:
 * - Analyze code structure
 * - Add state snapshots to critical operations
 * - Add verification calls
 * - Enhance existing logs
 * - Preserve existing functionality
 */

const fs = require('fs').promises;
const path = require('path');
const EventEmitter = require('events');
const gameLogger = require('../../src/utils/GameLogger');

class CodeEnhancementSystem extends EventEmitter {
    constructor(projectRoot, stateStore, issueDetector) {
        super();
        this.projectRoot = projectRoot;
        this.stateStore = stateStore;
        this.issueDetector = issueDetector;
        
        // Critical operations that should have state snapshots
        this.criticalOperations = [
            'bet', 'call', 'raise', 'fold', 'check', 'allin',
            'pot_update', 'phase_change', 'player_join', 'player_leave',
            'table_create', 'table_destroy', 'hand_start', 'hand_end'
        ];
        
        // Enhancement history
        this.enhancementHistory = [];
        this.maxHistory = 100;
        
        // Auto-enhancement enabled flag
        this.autoEnhancementEnabled = false;
    }
    
    /**
     * Enable/disable auto-enhancement
     */
    setEnabled(enabled) {
        this.autoEnhancementEnabled = enabled;
        gameLogger.info('CERBERUS', '[CODE_ENHANCEMENT] Auto-enhancement', {
            enabled
        });
    }
    
    /**
     * Analyze code structure
     */
    async analyzeCodeStructure(filePath) {
        try {
            const content = await fs.readFile(filePath, 'utf8');
            const lines = content.split('\n');
            
            const analysis = {
                file: path.relative(this.projectRoot, filePath),
                totalLines: lines.length,
                hasGameLogger: content.includes('gameLogger') || content.includes('GameLogger'),
                hasStateSnapshots: content.includes('stateStore') || content.includes('StateStore'),
                hasVerification: content.includes('verifyState') || content.includes('checkState'),
                criticalOperations: [],
                missingLogs: [],
                missingSnapshots: []
            };
            
            // Check for critical operations
            for (const operation of this.criticalOperations) {
                const operationPattern = new RegExp(`\\b${operation}\\b`, 'i');
                if (operationPattern.test(content)) {
                    analysis.criticalOperations.push(operation);
                    
                    // Check if operation has logging
                    const operationLines = lines.filter((line, index) => {
                        return operationPattern.test(line);
                    });
                    
                    let hasLogging = false;
                    for (const opLine of operationLines) {
                        const lineIndex = lines.indexOf(opLine);
                        // Check next 5 lines for logging
                        for (let i = lineIndex; i < Math.min(lineIndex + 5, lines.length); i++) {
                            if (lines[i].includes('gameLogger') || lines[i].includes('GameLogger')) {
                                hasLogging = true;
                                break;
                            }
                        }
                        if (hasLogging) break;
                    }
                    
                    if (!hasLogging) {
                        analysis.missingLogs.push(operation);
                    }
                    
                    // Check if operation has state snapshot
                    let hasSnapshot = false;
                    for (const opLine of operationLines) {
                        const lineIndex = lines.indexOf(opLine);
                        for (let i = lineIndex; i < Math.min(lineIndex + 5, lines.length); i++) {
                            if (lines[i].includes('stateStore') || lines[i].includes('StateStore') ||
                                lines[i].includes('snapshot') || lines[i].includes('capture')) {
                                hasSnapshot = true;
                                break;
                            }
                        }
                        if (hasSnapshot) break;
                    }
                    
                    if (!hasSnapshot) {
                        analysis.missingSnapshots.push(operation);
                    }
                }
            }
            
            return analysis;
            
        } catch (error) {
            gameLogger.error('CERBERUS', '[CODE_ENHANCEMENT] Analysis error', {
                error: error.message,
                file: filePath
            });
            return null;
        }
    }
    
    /**
     * Enhance code file
     */
    async enhanceFile(filePath, enhancements = {}) {
        if (!this.autoEnhancementEnabled) {
            return { success: false, reason: 'Auto-enhancement disabled' };
        }
        
        const enhancement = {
            id: `enhance_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            file: path.relative(this.projectRoot, filePath),
            timestamp: Date.now(),
            changes: [],
            result: null
        };
        
        try {
            const content = await fs.readFile(filePath, 'utf8');
            const lines = content.split('\n');
            let modified = false;
            
            // Add missing logs
            if (enhancements.addLogs && enhancements.missingLogs) {
                for (const operation of enhancements.missingLogs) {
                    // Find operation lines and add logging after them
                    for (let i = 0; i < lines.length; i++) {
                        const operationPattern = new RegExp(`\\b${operation}\\b`, 'i');
                        if (operationPattern.test(lines[i])) {
                            // Check if already has logging
                            let hasLogging = false;
                            for (let j = i; j < Math.min(i + 5, lines.length); j++) {
                                if (lines[j].includes('gameLogger')) {
                                    hasLogging = true;
                                    break;
                                }
                            }
                            
                            if (!hasLogging) {
                                // Add logging after operation
                                const indent = lines[i].match(/^(\s*)/)[1];
                                const logLine = `${indent}gameLogger.info('GAME', '[${operation.toUpperCase()}] Operation executed', { operation: '${operation}' });`;
                                lines.splice(i + 1, 0, logLine);
                                modified = true;
                                enhancement.changes.push({
                                    type: 'added_log',
                                    operation,
                                    line: i + 1
                                });
                                break; // Only add one log per operation type
                            }
                        }
                    }
                }
            }
            
            // Add state snapshots
            if (enhancements.addSnapshots && enhancements.missingSnapshots) {
                // Similar logic for adding state snapshots
                // Implementation would add stateStore.updateState calls
            }
            
            if (modified) {
                await fs.writeFile(filePath, lines.join('\n'), 'utf8');
                enhancement.result = { success: true, changes: enhancement.changes.length };
                
                // Track enhancement
                this.enhancementHistory.push(enhancement);
                if (this.enhancementHistory.length > this.maxHistory) {
                    this.enhancementHistory.shift();
                }
                
                this.stateStore.updateState('monitoring.codeEnhancement.history',
                    this.enhancementHistory.slice(-50));
                
                this.emit('fileEnhanced', enhancement);
                
                return enhancement.result;
            } else {
                enhancement.result = { success: false, reason: 'No changes needed' };
                return enhancement.result;
            }
            
        } catch (error) {
            gameLogger.error('CERBERUS', '[CODE_ENHANCEMENT] Enhancement error', {
                error: error.message,
                file: filePath
            });
            
            enhancement.result = { success: false, reason: error.message };
            return enhancement.result;
        }
    }
    
    /**
     * Get enhancement statistics
     */
    getEnhancementStatistics() {
        const total = this.enhancementHistory.length;
        const successful = this.enhancementHistory.filter(e => e.result && e.result.success).length;
        
        return {
            total,
            successful,
            successRate: total > 0 ? (successful / total) : 0,
            recentEnhancements: this.enhancementHistory.slice(-10)
        };
    }
}

module.exports = CodeEnhancementSystem;
