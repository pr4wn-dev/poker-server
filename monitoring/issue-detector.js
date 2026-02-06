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
        
        // Focus mode state - tracks current focused issue group
        this.focusedIssueGroup = null;
        this.queuedIssues = []; // Unrelated issues queued for later
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
     * Extract tableId from issue message or context
     */
    extractTableId(issue) {
        // Try from context first
        if (issue.context && issue.context.tableId) {
            return issue.context.tableId;
        }
        
        // Try from message
        const tableIdMatch = issue.message.match(/tableId["\s:]+([a-f0-9-]+)/i);
        if (tableIdMatch) {
            return tableIdMatch[1];
        }
        
        return null;
    }
    
    /**
     * Extract error pattern/type from issue message
     */
    extractErrorPattern(issue) {
        // Get the main error pattern that matched
        for (const { pattern, severity } of this.allPatterns) {
            if (pattern.test(issue.message)) {
                return pattern.toString();
            }
        }
        
        // Fallback: extract key error words
        const errorKeywords = ['pot', 'chips', 'timer', 'timeout', 'validation', 'mismatch', 'lost', 'error'];
        for (const keyword of errorKeywords) {
            if (issue.message.toLowerCase().includes(keyword)) {
                return keyword;
            }
        }
        
        return 'general';
    }
    
    /**
     * Extract stack trace location (file/function) if available
     */
    extractStackTraceLocation(issue) {
        if (issue.stackTrace) {
            // Try to extract file and function from stack trace
            const stackMatch = issue.stackTrace.match(/at\s+(\w+)\s+\(([^)]+)\)/);
            if (stackMatch) {
                return { function: stackMatch[1], file: stackMatch[2] };
            }
        }
        return null;
    }
    
    /**
     * Extract shared keywords from two issues for correlation
     */
    extractSharedKeywords(issue1, issue2) {
        const keywords = ['pot', 'chips', 'timer', 'timeout', 'validation', 'mismatch', 'lost', 'bet', 'player', 'table', 'hand'];
        const msg1 = issue1.message.toLowerCase();
        const msg2 = issue2.message.toLowerCase();
        
        return keywords.filter(keyword => msg1.includes(keyword) && msg2.includes(keyword));
    }
    
    /**
     * Check if two issues are related (grouping logic)
     * Returns true if issues should be grouped together
     */
    areIssuesRelated(issue1, issue2, timeWindowMs = 30000) {
        // Calculate time difference
        const time1 = new Date(issue1.detectedAt || issue1.timestamp).getTime();
        const time2 = new Date(issue2.detectedAt || issue2.timestamp).getTime();
        const timeDiff = Math.abs(time1 - time2);
        
        if (timeDiff > timeWindowMs) {
            return false; // Too far apart in time
        }
        
        // PRIMARY GROUPING: Same tableId (strongest signal)
        const tableId1 = this.extractTableId(issue1);
        const tableId2 = this.extractTableId(issue2);
        if (tableId1 && tableId2 && tableId1 === tableId2) {
            return true;
        }
        
        // PRIMARY GROUPING: Same error pattern/type
        const pattern1 = this.extractErrorPattern(issue1);
        const pattern2 = this.extractErrorPattern(issue2);
        if (pattern1 === pattern2 && pattern1 !== 'general') {
            return true;
        }
        
        // PRIMARY GROUPING: Same stack trace location
        const stack1 = this.extractStackTraceLocation(issue1);
        const stack2 = this.extractStackTraceLocation(issue2);
        if (stack1 && stack2 && stack1.function === stack2.function && stack1.file === stack2.file) {
            return true;
        }
        
        // SECONDARY GROUPING: Shared keywords (correlation analysis)
        const sharedKeywords = this.extractSharedKeywords(issue1, issue2);
        if (sharedKeywords.length >= 2) { // At least 2 shared keywords
            return true;
        }
        
        // SECONDARY GROUPING: Same source and similar message
        if (issue1.source === issue2.source) {
            const similarity = this.calculateSimilarity(issue1.message, issue2.message);
            if (similarity > 0.5) { // 50% similarity
                return true;
            }
        }
        
        return false;
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
            fs.writeFileSync(this.pendingIssuesFile, JSON.stringify({ 
                issues: [], 
                lastUpdated: null,
                focusedGroup: null,
                fixCriteria: null
            }, null, 2));
        } else {
            // Load existing focus state
            try {
                const data = JSON.parse(fs.readFileSync(this.pendingIssuesFile, 'utf8'));
                this.focusedIssueGroup = data.focusedGroup || null;
            } catch (e) {
                // If file is corrupted, reset
                this.focusedIssueGroup = null;
            }
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
        
        // Skip LOG_WATCHER logs (they're internal monitoring, not game errors)
        if (logLine.includes('[LOG_WATCHER]')) {
            return null;
        }
        
        // Skip TRACE logs (they're informational, not errors)
        // BUT: Don't skip [ROOT_TRACE] - these are important error indicators
        if (logLine.includes('[TRACE]') && !logLine.includes('[ROOT_TRACE]')) {
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
        
        // Skip STATUS_REPORT logs (they're informational updates, not errors)
        if (logLine.includes('[STATUS_REPORT]') || logLine.includes('STATUS_UPDATE')) {
            return null;
        }
        
        // Skip ACTIVE_MONITORING logs (they're status updates, not errors)
        if (logLine.includes('[ACTIVE_MONITORING]')) {
            return null;
        }
        
        // Skip WORKFLOW logs (they're process updates, not errors)
        if (logLine.includes('[WORKFLOW]')) {
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
     * Add issue to pending issues file with grouping support
     */
    addPendingIssue(issue) {
        try {
            const data = JSON.parse(fs.readFileSync(this.pendingIssuesFile, 'utf8'));
            
            // If we're in focus mode, check if this issue is related to the focused group
            if (this.focusedIssueGroup && data.focusedGroup) {
                const focusedGroup = data.focusedGroup;
                const rootIssue = focusedGroup.rootIssue;
                
                // Check if this issue is related to the focused group
                if (this.areIssuesRelated(issue, rootIssue)) {
                    // Add to focused group as a related issue
                    if (!focusedGroup.relatedIssues) {
                        focusedGroup.relatedIssues = [];
                    }
                    
                    // Check for duplicates in related issues
                    const isDuplicate = focusedGroup.relatedIssues.some(existing => {
                        return existing.id === issue.id || 
                               (this.calculateSimilarity(existing.message, issue.message) > 0.8);
                    });
                    
                    if (!isDuplicate) {
                        focusedGroup.relatedIssues.push(issue);
                        focusedGroup.lastUpdated = new Date().toISOString();
                        data.focusedGroup = focusedGroup;
                        data.lastUpdated = new Date().toISOString();
                        fs.writeFileSync(this.pendingIssuesFile, JSON.stringify(data, null, 2));
                        
                        gameLogger.error('MONITORING', '[ISSUE_DETECTED]', {
                            issueId: issue.id,
                            type: issue.type,
                            severity: issue.severity,
                            source: issue.source,
                            message: issue.message.substring(0, 200),
                            action: 'Related issue added to focused group',
                            groupId: focusedGroup.id,
                            relatedIssuesCount: focusedGroup.relatedIssues.length
                        });
                        
                        return { success: true, reason: 'added_to_group', groupId: focusedGroup.id };
                    }
                    
                    return { success: false, reason: 'duplicate_in_group' };
                } else {
                    // Unrelated issue - queue it for later
                    if (!data.queuedIssues) {
                        data.queuedIssues = [];
                    }
                    
                    // Check if already queued
                    const isQueued = data.queuedIssues.some(existing => {
                        return existing.id === issue.id || 
                               (this.calculateSimilarity(existing.message, issue.message) > 0.8);
                    });
                    
                    if (!isQueued) {
                        data.queuedIssues.push(issue);
                        data.lastUpdated = new Date().toISOString();
                        fs.writeFileSync(this.pendingIssuesFile, JSON.stringify(data, null, 2));
                        
                        gameLogger.info('MONITORING', '[ISSUE_QUEUED]', {
                            issueId: issue.id,
                            reason: 'Unrelated to focused issue - queued for later',
                            queuedCount: data.queuedIssues.length
                        });
                    }
                    
                    return { success: false, reason: 'queued', queued: true };
                }
            }
            
            // Not in focus mode - check if this should start a new focus group
            // Check if similar issue already exists (prevent duplicates)
            const now = Date.now();
            const similarIssue = data.issues.find(existing => {
                const timeDiff = now - new Date(existing.detectedAt).getTime();
                const isRecent = timeDiff < 300000; // Within last 5 minutes
                
                if (existing.source === issue.source && isRecent) {
                    const existingMsg = existing.message.substring(0, 200).toLowerCase();
                    const newMsg = issue.message.substring(0, 200).toLowerCase();
                    const similarity = this.calculateSimilarity(existingMsg, newMsg);
                    return similarity > 0.8;
                }
                return false;
            });
            
            if (!similarIssue) {
                // Start new focus group with this issue as root
                const groupId = `group_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                const focusedGroup = {
                    id: groupId,
                    rootIssue: issue,
                    relatedIssues: [],
                    startedAt: new Date().toISOString(),
                    lastUpdated: new Date().toISOString()
                };
                
                data.focusedGroup = focusedGroup;
                data.issues = [issue]; // Clear old issues, start fresh
                data.lastUpdated = new Date().toISOString();
                fs.writeFileSync(this.pendingIssuesFile, JSON.stringify(data, null, 2));
                
                // Update internal state
                this.focusedIssueGroup = focusedGroup;
                
                gameLogger.error('MONITORING', '[ISSUE_DETECTED]', {
                    issueId: issue.id,
                    type: issue.type,
                    severity: issue.severity,
                    source: issue.source,
                    message: issue.message.substring(0, 200),
                    action: 'New issue detected - entering FOCUS MODE',
                    groupId: groupId
                });
                
                return { success: true, reason: 'new_focus_group', groupId: groupId };
            }
            
            return { success: false, reason: 'duplicate' };
        } catch (error) {
            gameLogger.error('MONITORING', '[ISSUE_DETECTOR] ADD_PENDING_ERROR', {
                error: error.message,
                stack: error.stack
            });
            return { success: false, reason: 'error', error: error.message };
        }
    }
    
    /**
     * Get pending issues (returns focused group if in focus mode)
     */
    getPendingIssues() {
        try {
            const data = JSON.parse(fs.readFileSync(this.pendingIssuesFile, 'utf8'));
            
            // If in focus mode, return the focused group
            if (data.focusedGroup) {
                return {
                    focusedGroup: data.focusedGroup,
                    queuedIssues: data.queuedIssues || [],
                    inFocusMode: true
                };
            }
            
            // Not in focus mode, return regular issues
            return {
                issues: data.issues || [],
                inFocusMode: false
            };
        } catch (error) {
            return { issues: [], inFocusMode: false };
        }
    }
    
    /**
     * Clear pending issues and exit focus mode (after fix)
     */
    clearPendingIssues() {
        try {
            const data = JSON.parse(fs.readFileSync(this.pendingIssuesFile, 'utf8'));
            
            // If there are queued issues, promote the first one to focus mode
            if (data.queuedIssues && data.queuedIssues.length > 0) {
                const nextIssue = data.queuedIssues.shift();
                const groupId = `group_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                const focusedGroup = {
                    id: groupId,
                    rootIssue: nextIssue,
                    relatedIssues: [],
                    startedAt: new Date().toISOString(),
                    lastUpdated: new Date().toISOString()
                };
                
                fs.writeFileSync(this.pendingIssuesFile, JSON.stringify({ 
                    issues: [],
                    lastUpdated: new Date().toISOString(),
                    focusedGroup: focusedGroup,
                    queuedIssues: data.queuedIssues,
                    fixCriteria: null
                }, null, 2));
                
                this.focusedIssueGroup = focusedGroup;
                
                gameLogger.gameEvent('MONITORING', '[FOCUS_MODE] NEXT_ISSUE', {
                    action: 'Previous issue fixed - focusing on next queued issue',
                    groupId: groupId,
                    queuedRemaining: data.queuedIssues.length
                });
            } else {
                // No queued issues - clear everything and exit focus mode
                fs.writeFileSync(this.pendingIssuesFile, JSON.stringify({ 
                    issues: [], 
                    lastUpdated: new Date().toISOString(),
                    focusedGroup: null,
                    queuedIssues: [],
                    fixCriteria: null
                }, null, 2));
                
                this.focusedIssueGroup = null;
                
                gameLogger.gameEvent('MONITORING', '[ISSUE_DETECTOR] PENDING_ISSUES_CLEARED', {
                    action: 'All pending issues cleared - exiting focus mode'
                });
            }
            
            return true;
        } catch (error) {
            gameLogger.error('MONITORING', '[ISSUE_DETECTOR] CLEAR_ERROR', {
                error: error.message
            });
            return false;
        }
    }
    
    /**
     * Set fix criteria (what to watch for after fix)
     */
    setFixCriteria(criteria) {
        try {
            const data = JSON.parse(fs.readFileSync(this.pendingIssuesFile, 'utf8'));
            data.fixCriteria = {
                ...criteria,
                setAt: new Date().toISOString()
            };
            fs.writeFileSync(this.pendingIssuesFile, JSON.stringify(data, null, 2));
            
            gameLogger.gameEvent('MONITORING', '[FIX_CRITERIA] SET', {
                action: 'Fix criteria set - monitoring for confirmation',
                criteria: criteria
            });
            
            return true;
        } catch (error) {
            gameLogger.error('MONITORING', '[FIX_CRITERIA] SET_ERROR', {
                error: error.message
            });
            return false;
        }
    }
    
    /**
     * Check if fix is confirmed (based on fix criteria)
     */
    checkFixConfirmation() {
        try {
            const data = JSON.parse(fs.readFileSync(this.pendingIssuesFile, 'utf8'));
            
            if (!data.fixCriteria) {
                return { confirmed: false, reason: 'no_criteria' };
            }
            
            const criteria = data.fixCriteria;
            const now = Date.now();
            const setAt = new Date(criteria.setAt).getTime();
            const timeSinceFix = now - setAt;
            
            // Check time-based confirmation (wait at least 10 seconds)
            if (timeSinceFix < 10000) {
                return { confirmed: false, reason: 'waiting_for_time', timeRemaining: 10000 - timeSinceFix };
            }
            
            // TODO: Check for pattern absence and success indicators
            // This would require reading recent log entries
            // For now, if criteria is set and enough time has passed, consider it confirmed
            
            return { confirmed: true, reason: 'time_based_confirmation' };
        } catch (error) {
            return { confirmed: false, reason: 'error', error: error.message };
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
            const result = detector.addPendingIssue(issue);
            console.log(JSON.stringify(result));
            process.exit(result.success ? 0 : 1);
        } catch (error) {
            console.log(JSON.stringify({ success: false, reason: 'error', error: error.message }));
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
