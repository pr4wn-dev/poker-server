/**
 * Fix Tracker - Tracks fix attempts and success rates
 * Extends the existing fix attempt system from Table.js
 * 
 * This tracks ALL fix attempts across the entire game, not just Table-specific fixes
 */

const fs = require('fs');
const path = require('path');
const gameLogger = require('../src/utils/GameLogger');

class FixTracker {
    constructor() {
        this.fixAttemptsFile = path.join(__dirname, '..', 'fix-attempts.txt');
        this.maxFailures = 5; // After 5 failures, disable the fix method
        
        // Track fix attempts in memory
        this.fixAttempts = new Map(); // fixId -> { attempts: 0, failures: 0, successes: 0, disabled: false, lastAttempt: null }
        
        // Load existing fix attempts from file
        this.loadFixAttempts();
    }
    
    /**
     * Load fix attempts from file
     */
    loadFixAttempts() {
        try {
            if (fs.existsSync(this.fixAttemptsFile)) {
                const content = fs.readFileSync(this.fixAttemptsFile, 'utf8');
                const lines = content.split('\n').filter(line => line.trim());
                
                for (const line of lines) {
                    // Parse format: "FIX_ID: attempts=X, failures=Y, successes=Z, disabled=bool"
                    const match = line.match(/(\w+):\s*attempts=(\d+),\s*failures=(\d+),\s*successes=(\d+),\s*disabled=(\w+)/);
                    if (match) {
                        const [, fixId, attempts, failures, successes, disabled] = match;
                        this.fixAttempts.set(fixId, {
                            attempts: parseInt(attempts),
                            failures: parseInt(failures),
                            successes: parseInt(successes),
                            disabled: disabled === 'true',
                            lastAttempt: null
                        });
                    }
                }
            }
        } catch (error) {
            gameLogger.error('MONITORING', '[FIX_TRACKER] LOAD_ERROR', {
                error: error.message
            });
        }
    }
    
    /**
     * Record a fix attempt
     */
    recordFixAttempt(fixId, success, details = {}) {
        if (!this.fixAttempts.has(fixId)) {
            this.fixAttempts.set(fixId, {
                attempts: 0,
                failures: 0,
                successes: 0,
                disabled: false,
                lastAttempt: null
            });
        }
        
        const fix = this.fixAttempts.get(fixId);
        fix.attempts++;
        fix.lastAttempt = new Date().toISOString();
        
        if (success) {
            fix.successes++;
            gameLogger.gameEvent('MONITORING', `[FIX_ATTEMPT] ${fixId} SUCCESS`, {
                fixId,
                attempts: fix.attempts,
                successes: fix.successes,
                failures: fix.failures,
                successRate: `${Math.round((fix.successes / fix.attempts) * 100)}%`,
                details
            });
        } else {
            fix.failures++;
            
            // Disable fix method after MAX_FAILURES
            if (fix.failures >= this.maxFailures && !fix.disabled) {
                fix.disabled = true;
                gameLogger.error('MONITORING', `[FIX_ATTEMPT] ${fixId} METHOD_DISABLED`, {
                    fixId,
                    attempts: fix.attempts,
                    failures: fix.failures,
                    maxFailures: this.maxFailures,
                    message: 'Fix method disabled after repeated failures - must use different approach',
                    details
                });
            } else {
                gameLogger.error('MONITORING', `[FIX_ATTEMPT] ${fixId} FAILED`, {
                    fixId,
                    attempts: fix.attempts,
                    failures: fix.failures,
                    maxFailures: this.maxFailures,
                    details
                });
            }
        }
        
        // Save to file
        this.saveFixAttempts();
    }
    
    /**
     * Check if a fix method is enabled
     */
    isFixEnabled(fixId) {
        const fix = this.fixAttempts.get(fixId);
        if (!fix) {
            return true; // Unknown fix, allow it
        }
        return !fix.disabled;
    }
    
    /**
     * Get fix statistics
     */
    getFixStats(fixId) {
        return this.fixAttempts.get(fixId) || null;
    }
    
    /**
     * Get all fix statistics
     */
    getAllFixStats() {
        const stats = {};
        for (const [fixId, fix] of this.fixAttempts.entries()) {
            stats[fixId] = {
                attempts: fix.attempts,
                failures: fix.failures,
                successes: fix.successes,
                disabled: fix.disabled,
                successRate: fix.attempts > 0 ? Math.round((fix.successes / fix.attempts) * 100) : 0,
                lastAttempt: fix.lastAttempt
            };
        }
        return stats;
    }
    
    /**
     * Save fix attempts to file
     */
    saveFixAttempts() {
        try {
            const lines = [];
            for (const [fixId, fix] of this.fixAttempts.entries()) {
                lines.push(`${fixId}: attempts=${fix.attempts}, failures=${fix.failures}, successes=${fix.successes}, disabled=${fix.disabled}`);
            }
            fs.writeFileSync(this.fixAttemptsFile, lines.join('\n') + '\n');
        } catch (error) {
            gameLogger.error('MONITORING', '[FIX_TRACKER] SAVE_ERROR', {
                error: error.message
            });
        }
    }
    
    /**
     * Reset a fix (for testing or after code changes)
     */
    resetFix(fixId) {
        if (this.fixAttempts.has(fixId)) {
            this.fixAttempts.delete(fixId);
            this.saveFixAttempts();
            gameLogger.gameEvent('MONITORING', `[FIX_TRACKER] ${fixId} RESET`, {
                fixId,
                message: 'Fix statistics reset'
            });
            return true;
        }
        return false;
    }
}

module.exports = FixTracker;
