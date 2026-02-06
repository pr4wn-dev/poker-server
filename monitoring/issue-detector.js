/**
 * Issue Detector - Comprehensive issue detection across entire game
 * Detects issues using pattern matching, root tracing, and state analysis
 * 
 * This is the core detection engine used by the monitoring system
 */

const fs = require('fs');
const path = require('path');
const gameLogger = require('../src/utils/GameLogger');

class IssueDetector {
    constructor() {
        this.pendingIssuesFile = path.join(__dirname, '../logs/pending-issues.json');
        this.logFile = path.join(__dirname, '../logs/game.log');
        
        // Comprehensive error patterns - covers ALL possible issues
        // Patterns are organized by severity: CRITICAL, HIGH, MEDIUM, LOW
        this.errorPatterns = {
            // CRITICAL - Pause immediately
            critical: [
                // SERVER CONNECTION ISSUES
                /server.*cannot.*connect/i,
                /ECONNREFUSED/i,
                /EADDRINUSE/i,
                /Port.*already.*in use/i,
                /listen.*EADDRINUSE/i,
                /Error.*listen/i,
                /SERVER.*OFFLINE/i,
                /SERVER.*FAILED/i,
                
                // DATABASE ISSUES
                /Database.*OFFLINE/i,
                /DATABASE.*CONNECTION.*FAILED/i,
                /\[DATABASE\].*\[CONNECTION\].*FAILED/i,
                /MySQL.*error/i,
                /database.*error/i,
                
                // CRITICAL GAME LOGIC ERRORS
                /\[ROOT CAUSE\]/i,
                /\[ROOT_TRACE\].*TOTAL_BET_NOT_CLEARED/i,
                /\[ROOT_TRACE\].*PLAYER_WON_MORE_THAN_CONTRIBUTED/i,
                /CHIPS.*LOST/i,
                /Money.*lost/i,
                /missing.*chips/i,
                // Pot mismatches - but exclude FIX_ATTEMPT SUCCESS logs
                /POT.*MISMATCH(?!.*\[FIX_ATTEMPT\].*SUCCESS)(?!.*SUCCESS)/i,
                /pot.*mismatch.*before.*calculation(?!.*\[FIX_ATTEMPT\].*SUCCESS)(?!.*SUCCESS)/i,
                /Pot.*not.*cleared.*at.*hand.*start/i,
                /Pot.*not.*cleared(?!.*\[FIX_ATTEMPT\].*SUCCESS)(?!.*SUCCESS)/i,
                
                // FIX SYSTEM ERRORS
                /\[FIX\] METHOD_DISABLED/i,
                /\[FIX\] DISABLED/i,
                /METHOD_DISABLED.*TRY_DIFFERENT_APPROACH/i,
                
                // CRITICAL SYNTAX ERRORS
                /SyntaxError/i,
                /TypeError/i,
                /ReferenceError/i,
                /RangeError/i,
                /URIError/i,
                
                // CRITICAL VALIDATION FAILURES
                /\[ERROR\].*\[POT\]/i,
                /\[ERROR\].*\[CHIPS\]/i,
                /\[ERROR\].*\[VALIDATION\]/i,
                /chip.*validation.*failed/i,
                /money.*validation.*failed/i,
                
                // CRITICAL NETWORK ISSUES
                /socket.*error/i,
                /connection.*lost/i,
                /websocket.*error/i,
                /network.*error/i
            ],
            
            // HIGH - Log and may pause
            high: [
                // HIGH PRIORITY GAME LOGIC ERRORS
                // Chip creation - but exclude FIX_ATTEMPT SUCCESS
                /CHIPS.*CREATED(?!.*\[FIX_ATTEMPT\].*SUCCESS)(?!.*SUCCESS)/i,
                // Pot mismatches - but exclude FIX_ATTEMPT SUCCESS
                /pot.*mismatch(?!.*\[FIX_ATTEMPT\].*SUCCESS)(?!.*SUCCESS)/i,
                /Pot.*calculation.*error/i,
                /Betting.*calculation.*error/i,
                /Award.*calculation.*error/i,
                
                // TIMER/TIMEOUT ISSUES
                /SIMULATION BOT TIMEOUT/i,
                /\[TIMER\].*TIMEOUT.*auto-folding/i,
                /timer.*expired/i,
                /timeout.*exceeded/i,
                
                // STATE INCONSISTENCIES
                /state.*inconsistent/i,
                /unexpected.*state/i,
                /invalid.*state/i,
                /Action.*rejected.*Not.*your.*turn/i,
                /Action.*rejected.*Game.*not.*in.*progress/i,
                
                // UNITY CLIENT ISSUES
                /\[ICON_LOADING\].*ISSUE_REPORTED/i,
                /LoadItemIcon.*FAILED/i,
                /CreateItemAnteSlot.*FAILED/i,
                /Sprite not found/i,
                /Unity.*error/i,
                /\[UNITY_CLIENT\].*ERROR/i
            ],
            
            // MEDIUM - Log but continue
            medium: [
                // BETTING ACTION FAILURES
                /Betting.*Action.*Failures/i,
                /Cannot.*bet.*current.*bet/i,
                /Cannot.*check.*need.*to.*call/i,
                /Invalid.*betting.*action/i,
                
                // VALIDATION WARNINGS
                /\[WARNING\].*\[VALIDATION\]/i,
                /\[WARNING\].*\[POT\]/i,
                /\[WARNING\].*\[CHIPS\]/i,
                
                // MEMORY/PERFORMANCE ISSUES
                /memory.*leak/i,
                /heap.*overflow/i,
                /out of memory/i
            ],
            
            // LOW - Log only
            low: [
                // INFINITE LOOP DETECTION
                /stuck.*in.*loop/i,
                /infinite.*loop/i,
                /recursion.*too.*deep/i,
                
                // DEPRECATION WARNINGS
                /deprecated/i,
                /obsolete/i
            ]
        };
        
        // Flatten all patterns for quick lookup (maintains severity info)
        this.allPatterns = [];
        for (const [severity, patterns] of Object.entries(this.errorPatterns)) {
            for (const pattern of patterns) {
                this.allPatterns.push({ pattern, severity });
            }
        }
        
        // Unity-specific error patterns
        this.unityErrorPatterns = [
            /NullReferenceException/i,
            /MissingReferenceException/i,
            /ArgumentNullException/i,
            /InvalidOperationException/i,
            /UnityException/i,
            /\[UNITY\].*ERROR/i,
            /\[UNITY\].*EXCEPTION/i
        ];
        
        // Warning patterns (log but don't pause)
        this.warningPatterns = [
            /\[WARNING\]/i,
            /deprecated/i,
            /obsolete/i
        ];
        
        // Initialize pending issues file if it doesn't exist
        this.ensurePendingIssuesFile();
    }
    
    /**
     * Calculate string similarity (simple word-based)
     */
    calculateSimilarity(str1, str2) {
        if (str1 === str2) return 1.0;
        if (str1.length === 0 || str2.length === 0) return 0.0;
        
        // Simple similarity: count matching words
        const words1 = str1.split(/\s+/).filter(w => w.length > 2); // Ignore short words
        const words2 = str2.split(/\s+/).filter(w => w.length > 2);
        if (words1.length === 0 || words2.length === 0) return 0.0;
        
        const commonWords = words1.filter(w => words2.includes(w));
        return commonWords.length / Math.max(words1.length, words2.length);
    }
    
    /**
     * Ensure pending issues file exists
     */
    ensurePendingIssuesFile() {
        if (!fs.existsSync(this.pendingIssuesFile)) {
            const dir = path.dirname(this.pendingIssuesFile);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(this.pendingIssuesFile, JSON.stringify({ issues: [], lastUpdated: null }, null, 2));
        }
    }
    
    /**
     * Detect issue from log line
     * Returns issue object if detected, null otherwise
     */
    detectIssue(logLine) {
        // Skip our own logs to prevent infinite loops
        if (logLine.includes('[MONITORING]') || logLine.includes('[ISSUE_DETECTOR]')) {
            return null;
        }
        
        // Skip TRACE logs (they're informational, not errors)
        if (logLine.includes('[TRACE]')) {
            return null;
        }
        
        // Skip FIX_ATTEMPT SUCCESS logs (these are good, not errors)
        if (logLine.includes('[FIX_ATTEMPT]') && (logLine.includes('SUCCESS') || logLine.includes('SUCCEEDED'))) {
            return null;
        }
        
        // Skip FIX_ATTEMPT logs that are just informational (not actual errors)
        // Only detect FIX_ATTEMPT FAILED or METHOD_DISABLED
        if (logLine.includes('[FIX_ATTEMPT]') && !logLine.includes('FAILED') && !logLine.includes('METHOD_DISABLED') && !logLine.includes('DISABLED')) {
            return null;
        }
        
        // Check all patterns with severity mapping
        for (const { pattern, severity } of this.allPatterns) {
            if (pattern.test(logLine)) {
                // Determine source
                let source = 'server';
                if (logLine.includes('[UNITY') || logLine.includes('Unity') || logLine.includes('NullReferenceException')) {
                    source = 'unity';
                } else if (logLine.includes('[DATABASE]') || logLine.includes('MySQL') || logLine.includes('database')) {
                    source = 'database';
                } else if (logLine.includes('socket') || logLine.includes('connection') || logLine.includes('network')) {
                    source = 'network';
                }
                
                // Determine type
                let type = 'error';
                if (severity === 'low' || logLine.includes('[WARNING]')) {
                    type = 'warning';
                }
                
                return this.createIssue(type, severity, logLine, source);
            }
        }
        
        // Check for Unity errors (separate check for exceptions)
        for (const pattern of this.unityErrorPatterns) {
            if (pattern.test(logLine)) {
                return this.createIssue('error', 'critical', logLine, 'unity');
            }
        }
        
        // Check for warnings (log but don't pause)
        for (const pattern of this.warningPatterns) {
            if (pattern.test(logLine)) {
                return this.createIssue('warning', 'medium', logLine, 'server');
            }
        }
        
        return null;
    }
    
    /**
     * Create issue object
     */
    createIssue(type, severity, message, source) {
        const issueId = `issue_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Extract additional context from log line
        let context = {};
        try {
            // Try to parse JSON data from log line
            const dataMatch = message.match(/\| Data: ({.*})/);
            if (dataMatch) {
                context = JSON.parse(dataMatch[1]);
            }
        } catch (e) {
            // If parsing fails, just use the message
        }
        
        // Extract timestamp
        const timestampMatch = message.match(/\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?)\]/);
        const timestamp = timestampMatch ? timestampMatch[1] : new Date().toISOString();
        
        return {
            id: issueId,
            type: type,
            severity: severity,
            message: message.substring(0, 1000), // Limit message length
            source: source, // 'server', 'unity', 'network', 'database'
            timestamp: timestamp,
            detectedAt: new Date().toISOString(),
            context: context,
            stackTrace: context.stack || null,
            gameState: context.gameState || null,
            needsManualFix: false,
            fixAttempts: 0
        };
    }
    
    /**
     * Add issue to pending issues file
     */
    addPendingIssue(issue) {
        try {
            const data = JSON.parse(fs.readFileSync(this.pendingIssuesFile, 'utf8'));
            
            // Check if similar issue already exists (prevent duplicates)
            // Improved: Check message similarity (not exact match) and extend time window
            const now = Date.now();
            const similarIssue = data.issues.find(existing => {
                const timeDiff = now - new Date(existing.detectedAt).getTime();
                const isRecent = timeDiff < 300000; // Within last 5 minutes (was 1 minute)
                
                // Check if same source and similar message (not exact match)
                if (existing.source === issue.source && isRecent) {
                    // Compare message similarity (first 200 chars)
                    const existingMsg = existing.message.substring(0, 200).toLowerCase();
                    const newMsg = issue.message.substring(0, 200).toLowerCase();
                    
                    // If messages are very similar (80% match), consider duplicate
                    const similarity = calculateSimilarity(existingMsg, newMsg);
                    return similarity > 0.8;
                }
                return false;
            });
            
            if (!similarIssue) {
                data.issues.push(issue);
                data.lastUpdated = new Date().toISOString();
                fs.writeFileSync(this.pendingIssuesFile, JSON.stringify(data, null, 2));
                
                // Log to game.log so I can see it
                gameLogger.error('MONITORING', '[ISSUE_DETECTED]', {
                    issueId: issue.id,
                    type: issue.type,
                    severity: issue.severity,
                    source: issue.source,
                    message: issue.message.substring(0, 200),
                    pendingIssuesCount: data.issues.length,
                    action: 'Issue added to pending-issues.json - waiting for assistant to fix'
                });
                
                return true;
            }
            
            return false; // Duplicate issue
        } catch (error) {
            gameLogger.error('MONITORING', '[ISSUE_DETECTOR] ADD_PENDING_ERROR', {
                error: error.message,
                stack: error.stack
            });
            return false;
        }
    }
    
    /**
     * Get pending issues
     */
    getPendingIssues() {
        try {
            const data = JSON.parse(fs.readFileSync(this.pendingIssuesFile, 'utf8'));
            return data.issues || [];
        } catch (error) {
            return [];
        }
    }
    
    /**
     * Clear pending issues (after fix)
     */
    clearPendingIssues() {
        try {
            fs.writeFileSync(this.pendingIssuesFile, JSON.stringify({ issues: [], lastUpdated: null }, null, 2));
            gameLogger.gameEvent('MONITORING', '[ISSUE_DETECTOR] PENDING_ISSUES_CLEARED', {
                action: 'All pending issues cleared after fix'
            });
            return true;
        } catch (error) {
            gameLogger.error('MONITORING', '[ISSUE_DETECTOR] CLEAR_ERROR', {
                error: error.message
            });
            return false;
        }
    }
    
    /**
     * Mark issue as needing manual fix
     */
    markNeedsManualFix(issueId) {
        try {
            const data = JSON.parse(fs.readFileSync(this.pendingIssuesFile, 'utf8'));
            const issue = data.issues.find(i => i.id === issueId);
            if (issue) {
                issue.needsManualFix = true;
                fs.writeFileSync(this.pendingIssuesFile, JSON.stringify(data, null, 2));
                return true;
            }
            return false;
        } catch (error) {
            return false;
        }
    }
}

// If run as CLI tool (from PowerShell)
if (require.main === module) {
    const detector = new IssueDetector();
    const args = process.argv.slice(2);
    
    if (args[0] === '--check' && args[1]) {
        // Check a single log line
        const issue = detector.detectIssue(args[1]);
        if (issue) {
            console.log(JSON.stringify(issue));
            process.exit(0);
        } else {
            process.exit(1); // No issue detected
        }
    } else if (args[0] === '--add-issue' && args[1]) {
        // Add issue from JSON string
        try {
            const issueData = JSON.parse(args[1]);
            const issue = detector.createIssue(
                issueData.type || 'error',
                issueData.severity || 'critical',
                issueData.message || '',
                issueData.source || 'server'
            );
            if (detector.addPendingIssue(issue)) {
                console.log(JSON.stringify({ success: true, issueId: issue.id }));
                process.exit(0);
            } else {
                console.log(JSON.stringify({ success: false, reason: 'duplicate' }));
                process.exit(1);
            }
        } catch (error) {
            console.log(JSON.stringify({ success: false, error: error.message }));
            process.exit(1);
        }
    } else if (args[0] === '--get-pending') {
        // Get all pending issues
        const issues = detector.getPendingIssues();
        console.log(JSON.stringify(issues));
        process.exit(0);
    } else if (args[0] === '--clear') {
        // Clear pending issues
        if (detector.clearPendingIssues()) {
            console.log(JSON.stringify({ success: true }));
            process.exit(0);
        } else {
            process.exit(1);
        }
    } else {
        console.error('Usage: node issue-detector.js --check <logLine> | --add-issue <json> | --get-pending | --clear');
        process.exit(1);
    }
}

module.exports = IssueDetector;
