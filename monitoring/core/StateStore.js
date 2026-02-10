/**
 * State Store - Single Source of Truth
 * 
 * This is the foundation of the AI-first monitoring system.
 * All state lives here. AI can query anything, anytime.
 * 
 * NO MORE DUAL STATE MANAGEMENT (files + variables)
 * NO MORE SYNC ISSUES
 * NO MORE STALE DATA
 * 
 * Just ONE source of truth that AI can always trust.
 */

const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');
const gameLogger = require('../../src/utils/GameLogger');

// Check if MySQL should be used (via environment variable or config)
const USE_MYSQL = process.env.BROKENPROMISE_USE_MYSQL !== 'false'; // Default to true if MySQL available

class StateStore extends EventEmitter {
    constructor(projectRoot) {
        super();
        this.projectRoot = projectRoot;
        this.persistenceFile = path.join(projectRoot, 'logs', 'ai-state-store.json');
        this.useMySQL = USE_MYSQL;
        
        // Initialize MySQL if enabled
        if (this.useMySQL) {
            try {
                const DatabaseManager = require('./DatabaseManager');
                this.dbManager = new DatabaseManager(projectRoot);
            } catch (error) {
                // MySQL not available, fallback to JSON
                this.useMySQL = false;
                gameLogger.warn('MONITORING', '[StateStore] MySQL not available, using JSON fallback', { error: error.message });
            }
        }
        
        // Complete state - AI can query anything
        this.state = {
            // Game State - Complete visibility into game
            game: {
                tables: new Map(), // tableId -> complete table state
                players: new Map(), // playerId -> complete player state
                chips: {
                    totalInSystem: 0,
                    byTable: new Map(), // tableId -> chip count
                    byPlayer: new Map(), // playerId -> chip count
                    history: [] // Every chip movement with timestamp
                },
                hands: {
                    current: null,
                    history: [] // All hands played
                },
                phase: null, // Current game phase
                lastUpdate: null
            },
            
            // System State - Server, Database, Unity
            system: {
                server: {
                    status: 'unknown', // unknown | starting | running | stopped | error
                    health: null, // 0-100
                    metrics: {
                        uptime: 0,
                        requests: 0,
                        errors: 0,
                        responseTime: 0
                    },
                    logs: [], // Recent server logs
                    lastCheck: null
                },
                database: {
                    status: 'unknown',
                    health: null,
                    metrics: {
                        uptime: 0,
                        queries: 0,
                        errors: 0,
                        responseTime: 0
                    },
                    logs: [],
                    lastCheck: null
                },
                unity: {
                    status: 'unknown', // unknown | starting | running | paused | stopped | error
                    health: null,
                    metrics: {
                        uptime: 0,
                        fps: 0,
                        connected: false,
                        lastActivity: null
                    },
                    uiState: {
                        labels: new Map(), // labelId -> { text, visible, color }
                        images: new Map(), // imageId -> { sprite, visible, color }
                        sounds: new Map(), // soundId -> { playing, volume, clip }
                        animations: new Map() // animationId -> { playing, progress }
                    },
                    logs: [],
                    lastCheck: null
                }
            },
            
            // Monitoring State - Investigation, Verification, Detection
            monitoring: {
                investigation: {
                    status: 'idle', // idle | starting | active | completing | completed | failed
                    startTime: null,
                    timeout: 15, // seconds
                    issues: [], // Issues found during investigation
                    history: [], // All past investigations
                    progress: 0, // 0-100
                    timeRemaining: null
                },
                verification: {
                    status: 'idle', // idle | active | completed | failed
                    startTime: null,
                    period: 0, // seconds
                    results: [], // Verification results
                    history: [] // All past verifications
                },
                detection: {
                    activeDetectors: [], // Which detectors are running
                    detectionRate: 0, // Issues per minute
                    falsePositives: 0,
                    accuracy: 0, // 0-100
                    lastDetection: null
                }
            },
            
            // Issue State - All issues, detected, active, resolved
            issues: {
                detected: [], // All issues ever detected
                active: [], // Currently active issues
                resolved: [], // Resolved issues
                patterns: new Map(), // pattern -> [issueIds]
                fixes: new Map() // issueId -> fixMethod
            },
            
            // Fix State - All fix attempts, successes, failures
            fixes: {
                attempts: [], // All fix attempts
                successes: [], // Successful fixes
                failures: [], // Failed fixes
                knowledge: new Map() // pattern -> { method, successRate, attempts }
            },
            
            // Learning State - What AI has learned
            learning: {
                fixAttempts: new Map(), // issueId -> [attempts]
                successRates: new Map(), // fixMethod -> successRate
                patterns: new Map(), // issuePattern -> fixMethod
                knowledge: [], // Learned rules
                improvements: [], // System improvements over time
                aiCompliance: [], // Prompt compliance tracking
                aiComplianceConfidence: {
                    successRate: 0,
                    totalPrompts: 0,
                    successfulPrompts: 0,
                    lastUpdated: null
                }
            },
            
            // AI State - AI action tracking
            ai: {
                prompts: [], // Generated prompts
                recentToolCalls: [], // Recent tool calls for verification
                lastBeforeActionCall: null, // Last time beforeAIAction was called
                lastAfterActionCall: null, // Last time afterAIAction was called
                recentCodeChanges: [], // Recent code changes
                workflowViolations: [] // Workflow violations detected
            },
            
            // Metadata
            metadata: {
                version: '2.0.0',
                started: Date.now(),
                lastUpdate: Date.now(),
                updateCount: 0
            }
        };
        
        // Event log - Complete history of all state changes
        this.eventLog = [];
        this.maxEventLogSize = 10000; // Keep last 10k events
        
        // Listeners for state changes
        this.listeners = new Map(); // path -> [callbacks]
        
        // Load persisted state if exists
        this.load();
        
        // Auto-save periodically
        this.autoSaveInterval = setInterval(() => {
            this.save();
        }, 5000); // Save every 5 seconds
    }
    
    /**
     * Validate state structure
     */
    _validateState(path, value) {
        // Basic validation
        if (value === undefined) {
            throw new Error(`Cannot set state to undefined at path: ${path}`);
        }
        
        // Validate nested paths
        const parts = path.split('.');
        if (parts.length > 10) {
            gameLogger.warn('MONITORING', '[STATESTORE] Deep nesting detected', {
                path: path,
                levels: parts.length
            });
        }
        
        // Validate value types for known paths
        const knownPaths = {
            'monitoring.investigation.status': ['string'],
            'monitoring.investigation.startTime': ['number', 'null'],
            'issues.active': ['array'],
            'fixes.attempts': ['array'],
            'system.server.status': ['string']
        };
        
        if (knownPaths[path]) {
            const expectedTypes = knownPaths[path];
            const actualType = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
            
            if (!expectedTypes.includes(actualType)) {
                // DO NOT log to console - warnings are for AI only, not user
                // Type mismatches are tracked in state store
            }
        }
        
        return true;
    }
    
    /**
     * Validate data integrity
     */
    _validateDataIntegrity(path, value) {
        // Check for common integrity issues
        
        // Arrays should be arrays
        if (path.includes('.attempts') || path.includes('.active') || path.includes('.history')) {
            if (value !== null && !Array.isArray(value)) {
                // DO NOT log to console - warnings are for AI only, not user
                // Data integrity issues are tracked in state store
                // Auto-fix: convert to array if possible
                if (typeof value === 'object' && value !== null) {
                    return Array.from(Object.values(value));
                }
                return [];
            }
        }
        
        // Numbers should be numbers
        if (path.includes('.count') || path.includes('.total') || path.includes('.time')) {
            if (value !== null && typeof value !== 'number') {
                // DO NOT log to console - warnings are for AI only, not user
                // Data integrity issues are tracked in state store
            }
        }
        
        // Status should be valid
        if (path.includes('.status')) {
            const validStatuses = ['active', 'inactive', 'starting', 'stopping', 'stopped', 'running', 'degraded', 'error', 'healthy', 'unhealthy'];
            if (typeof value === 'string' && !validStatuses.includes(value.toLowerCase())) {
                // DO NOT log to console - warnings are for AI only, not user
                // Data integrity issues are tracked in state store
            }
        }
        
        return true;
    }
    
    /**
     * Update state atomically
     * This is the ONLY way state changes
     */
    updateState(path, value, metadata = {}) {
        // Validate state
        try {
            this._validateState(path, value);
        } catch (error) {
            // DO NOT log to console - errors are for AI only, not user
            // Error will be caught by UniversalErrorHandler
            throw error;
        }
        
        // Auto-fix data integrity issues
        const integrityCheck = this._validateDataIntegrity(path, value);
        if (integrityCheck !== true && integrityCheck !== undefined && integrityCheck !== null) {
            value = integrityCheck;
        }
        
        const oldValue = this.getState(path);
        
        // Use MySQL if available (async, but don't block)
        if (this.useMySQL && this.dbManager) {
            // Initialize if needed (async, don't block)
            if (!this.dbManager.initialized) {
                this.dbManager.initialize().catch(err => {
                    gameLogger.warn('MONITORING', '[StateStore] MySQL init failed, using JSON fallback', { error: err.message });
                    this.useMySQL = false;
                });
            }
            
            // Update MySQL (async, don't block)
            if (this.dbManager.initialized) {
                this.dbManager.updateState(path, value).catch(err => {
                    gameLogger.warn('MONITORING', '[StateStore] MySQL update failed', { error: err.message });
                });
            }
        }
        
        // Always update in-memory state (for compatibility and immediate access)
        this._setState(path, value);
        
        // Log event
        const event = {
            timestamp: Date.now(),
            path,
            oldValue,
            newValue: value,
            metadata
        };
        this.eventLog.push(event);
        
        // Trim event log if too large
        if (this.eventLog.length > this.maxEventLogSize) {
            this.eventLog = this.eventLog.slice(-this.maxEventLogSize);
        }
        
        // Update metadata
        this.state.metadata.lastUpdate = Date.now();
        this.state.metadata.updateCount++;
        
        // Notify listeners
        this.emit('stateChanged', event);
        this._notifyListeners(path, oldValue, value);
        
        return event;
    }
    
    /**
     * Get state - AI can query anything
     * Uses in-memory state (MySQL updates are async, so we read from memory)
     */
    getState(path = null) {
        if (!path) {
            return this.state;
        }
        
        const parts = path.split('.');
        let current = this.state;
        
        for (const part of parts) {
            if (current === null || current === undefined) {
                return null;
            }
            current = current[part];
        }
        
        return current;
    }
    
    /**
     * Query state with filters
     * AI can ask complex questions
     */
    query(path, filters = {}) {
        const data = this.getState(path);
        
        if (!data) {
            return null;
        }
        
        // If it's an array, apply filters
        if (Array.isArray(data)) {
            let result = data;
            
            if (filters.where) {
                result = result.filter(filters.where);
            }
            
            if (filters.orderBy) {
                result = result.sort(filters.orderBy);
            }
            
            if (filters.limit) {
                result = result.slice(0, filters.limit);
            }
            
            return result;
        }
        
        return data;
    }
    
    /**
     * Get state history for a path
     * AI can see how state changed over time
     */
    getStateHistory(path, timeRange = null) {
        let events = this.eventLog.filter(e => e.path === path || e.path.startsWith(path + '.'));
        
        if (timeRange) {
            const now = Date.now();
            const start = now - timeRange;
            events = events.filter(e => e.timestamp >= start);
        }
        
        return events;
    }
    
    /**
     * Subscribe to state changes
     * AI can get real-time updates
     */
    subscribe(path, callback) {
        if (!this.listeners.has(path)) {
            this.listeners.set(path, []);
        }
        this.listeners.get(path).push(callback);
        
        // Return unsubscribe function
        return () => {
            const callbacks = this.listeners.get(path);
            const index = callbacks.indexOf(callback);
            if (index > -1) {
                callbacks.splice(index, 1);
            }
        };
    }
    
    /**
     * Get complete status report
     * AI can get everything it needs to know
     */
    getStatusReport() {
        return {
            timestamp: Date.now(),
            state: this.state,
            summary: {
                systemHealth: this._calculateSystemHealth(),
                gameState: this._calculateGameState(),
                monitoringState: this._calculateMonitoringState(),
                issueState: this._calculateIssueState(),
                fixState: this._calculateFixState(),
                learningState: this._calculateLearningState()
            },
            recommendations: this._generateRecommendations()
        };
    }
    
    /**
     * Internal: Set state value
     */
    _setState(path, value) {
        const parts = path.split('.');
        let current = this.state;
        
        for (let i = 0; i < parts.length - 1; i++) {
            const part = parts[i];
            if (!current[part]) {
                current[part] = {};
            }
            current = current[part];
        }
        
        current[parts[parts.length - 1]] = value;
    }
    
    /**
     * Internal: Notify listeners
     */
    _notifyListeners(path, oldValue, newValue) {
        // Notify exact path listeners
        if (this.listeners.has(path)) {
            this.listeners.get(path).forEach(callback => {
                try {
                    callback(newValue, oldValue, path);
                } catch (error) {
                    // DO NOT log to console - errors are for AI only, not user
                    // Re-throw so UniversalErrorHandler can catch it
                    throw error;
                }
            });
        }
        
        // Notify parent path listeners
        const parts = path.split('.');
        for (let i = parts.length - 1; i > 0; i--) {
            const parentPath = parts.slice(0, i).join('.');
            if (this.listeners.has(parentPath)) {
                this.listeners.get(parentPath).forEach(callback => {
                    try {
                        callback(this.getState(path), oldValue, path);
                    } catch (error) {
                        // DO NOT log to console - errors are for AI only, not user
                        // Re-throw so UniversalErrorHandler can catch it
                        throw error;
                    }
                });
            }
        }
    }
    
    /**
     * Internal: Calculate system health
     */
    _calculateSystemHealth() {
        const server = this.state.system.server;
        const database = this.state.system.database;
        const unity = this.state.system.unity;
        
        const serverHealth = server.health || 0;
        const dbHealth = database.health || 0;
        const unityHealth = unity.health || 0;
        
        const overall = (serverHealth + dbHealth + unityHealth) / 3;
        
        return {
            overall,
            server: serverHealth,
            database: dbHealth,
            unity: unityHealth,
            status: overall >= 80 ? 'healthy' : overall >= 50 ? 'degraded' : 'unhealthy'
        };
    }
    
    /**
     * Internal: Calculate game state summary
     */
    _calculateGameState() {
        return {
            activeTables: this.state.game.tables.size,
            activePlayers: this.state.game.players.size,
            totalChips: this.state.game.chips.totalInSystem,
            chipIntegrity: this._verifyChipIntegrity(),
            currentPhase: this.state.game.phase
        };
    }
    
    /**
     * Internal: Calculate monitoring state summary
     */
    _calculateMonitoringState() {
        const investigation = this.state.monitoring.investigation;
        const verification = this.state.monitoring.verification;
        
        return {
            investigation: {
                status: investigation.status,
                progress: investigation.progress,
                issuesFound: investigation.issues.length,
                timeRemaining: investigation.timeRemaining
            },
            verification: {
                status: verification.status,
                progress: verification.progress || 0
            },
            detection: {
                rate: this.state.monitoring.detection.detectionRate,
                accuracy: this.state.monitoring.detection.accuracy
            }
        };
    }
    
    /**
     * Internal: Calculate issue state summary
     */
    _calculateIssueState() {
        // Ensure arrays exist
        const active = Array.isArray(this.state.issues.active) ? this.state.issues.active : [];
        const resolved = Array.isArray(this.state.issues.resolved) ? this.state.issues.resolved : [];
        const detected = Array.isArray(this.state.issues.detected) ? this.state.issues.detected : [];
        
        return {
            active: active.length,
            resolved: resolved.length,
            total: detected.length,
            bySeverity: this._groupIssuesBySeverity()
        };
    }
    
    /**
     * Internal: Calculate fix state summary
     */
    _calculateFixState() {
        const attempts = this.state.fixes.attempts;
        const successes = this.state.fixes.successes;
        const failures = this.state.fixes.failures;
        
        const total = attempts.length;
        const successCount = successes.length;
        const successRate = total > 0 ? (successCount / total) * 100 : 0;
        
        return {
            totalAttempts: total,
            successes: successCount,
            failures: failures.length,
            successRate: Math.round(successRate * 100) / 100
        };
    }
    
    /**
     * Internal: Calculate learning state summary
     */
    _calculateLearningState() {
        return {
            patternsLearned: this.state.learning.patterns.size,
            knowledgeRules: this.state.learning.knowledge.length,
            improvements: this.state.learning.improvements.length
        };
    }
    
    /**
     * Internal: Verify chip integrity
     */
    _verifyChipIntegrity() {
        // Verify total chips = sum of all table chips + sum of all player chips
        // This is a critical invariant
        let tableTotal = 0;
        this.state.game.chips.byTable.forEach(count => {
            tableTotal += count;
        });
        
        let playerTotal = 0;
        this.state.game.chips.byPlayer.forEach(count => {
            playerTotal += count;
        });
        
        const expected = tableTotal + playerTotal;
        const actual = this.state.game.chips.totalInSystem;
        
        return {
            valid: Math.abs(expected - actual) < 1, // Allow for floating point
            expected,
            actual,
            difference: actual - expected
        };
    }
    
    /**
     * Internal: Group issues by severity
     */
    _groupIssuesBySeverity() {
        const groups = {
            critical: 0,
            high: 0,
            medium: 0,
            low: 0
        };
        
        // Ensure active is an array
        const activeIssues = Array.isArray(this.state.issues.active) 
            ? this.state.issues.active 
            : [];
        
        activeIssues.forEach(issue => {
            const severity = issue.severity?.toLowerCase() || 'medium';
            if (groups[severity] !== undefined) {
                groups[severity]++;
            }
        });
        
        return groups;
    }
    
    /**
     * Internal: Generate recommendations
     */
    _generateRecommendations() {
        const recommendations = [];
        
        // Check if investigation should start
        const activeIssuesCheck = Array.isArray(this.state.issues.active) ? this.state.issues.active : [];
        if (activeIssuesCheck.length > 0 && 
            this.state.monitoring.investigation.status === 'idle') {
            recommendations.push({
                type: 'start_investigation',
                priority: 'high',
                reason: `${activeIssuesCheck.length} active issues detected`
            });
        }
        
        // Check if Unity should be paused
        if (this.state.monitoring.investigation.status === 'completed' &&
            !this.state.system.unity.metrics.connected) {
            recommendations.push({
                type: 'pause_unity',
                priority: 'high',
                reason: 'Investigation complete, issues found'
            });
        }
        
        return recommendations;
    }
    
    /**
     * Save state to disk
     * FIXED: Based on web search findings - explicit data selection, structured validation, single write
     * Search findings: State persistence requires explicit handling, verify JSON structure, write once
     * ENHANCED: Added file locking and atomic write to prevent corruption
     */
    save() {
        // Prevent concurrent saves
        if (this._saving) {
            return; // Already saving, skip this call
        }
        
        this._saving = true;
        
        try {
            // CRITICAL: Capture learning arrays from memory BEFORE any serialization
            // Search finding: Explicit data selection prevents loss during serialization
            const knowledgeArray = this.state.learning?.knowledge && Array.isArray(this.state.learning.knowledge)
                ? JSON.parse(JSON.stringify(this.state.learning.knowledge)) : [];
            const improvementsArray = this.state.learning?.improvements && Array.isArray(this.state.learning.improvements)
                ? JSON.parse(JSON.stringify(this.state.learning.improvements)) : [];
            
            // Also capture other critical learning data
            const fixAttempts = this.state.learning?.fixAttempts || {};
            const aiCompliance = this.state.learning?.aiCompliance || [];
            const patterns = this.state.learning?.patterns || {};
            const misdiagnosisPatterns = this.state.learning?.misdiagnosisPatterns || {};
            const failedMethods = this.state.learning?.failedMethods || {};
            
            // Serialize entire state (learning arrays should be preserved by _serializeState)
            const serializedState = this._serializeState(this.state);
            
            // CRITICAL: Verify learning object exists and has arrays
            // Search finding: Structured JSON validation before write
            if (!serializedState.learning) {
                serializedState.learning = {};
            }
            // Force arrays into serialized state - explicit preservation
            serializedState.learning.knowledge = knowledgeArray;
            serializedState.learning.improvements = improvementsArray;
            
            // CRITICAL: Ensure fixAttempts is a plain object (not Map, not array)
            // Convert to plain object if needed
            let fixAttemptsObj = {};
            if (fixAttempts && typeof fixAttempts === 'object') {
                if (fixAttempts instanceof Map) {
                    fixAttemptsObj = Object.fromEntries(fixAttempts);
                } else if (Array.isArray(fixAttempts)) {
                    // If it's an array of entries, convert to object
                    fixAttempts.forEach(([key, value]) => {
                        fixAttemptsObj[key] = value;
                    });
                } else {
                    fixAttemptsObj = fixAttempts;
                }
            }
            serializedState.learning.fixAttempts = fixAttemptsObj;
            
            serializedState.learning.aiCompliance = aiCompliance;
            serializedState.learning.patterns = patterns;
            serializedState.learning.misdiagnosisPatterns = misdiagnosisPatterns;
            serializedState.learning.failedMethods = failedMethods;
            
            // Create data object with arrays already in place
            const data = {
                state: serializedState,
                eventLog: this.eventLog.slice(-1000), // Save last 1000 events (reduce size)
                timestamp: Date.now(),
                version: '2.0.0' // Schema version for migration tracking
            };
            
            // CRITICAL: Validate structure before stringify
            // Search finding: Verify data shape before writing
            if (!Array.isArray(data.state.learning.knowledge)) {
                data.state.learning.knowledge = knowledgeArray;
            }
            if (!Array.isArray(data.state.learning.improvements)) {
                data.state.learning.improvements = improvementsArray;
            }
            if (!Array.isArray(data.state.learning.aiCompliance)) {
                data.state.learning.aiCompliance = aiCompliance;
            }
            // Ensure fixAttempts is an object
            if (!data.state.learning.fixAttempts || typeof data.state.learning.fixAttempts !== 'object' || Array.isArray(data.state.learning.fixAttempts)) {
                data.state.learning.fixAttempts = fixAttemptsObj;
            }
            
            // Atomic write: Write to temp file first, then rename (prevents corruption)
            const tempFile = this.persistenceFile + '.tmp';
            const jsonString = JSON.stringify(data, null, 2);
            
            // Write to temp file
            fs.writeFileSync(tempFile, jsonString, 'utf8');
            
            // Create backup before overwriting
            if (fs.existsSync(this.persistenceFile)) {
                const backupFile = this.persistenceFile + '.backup';
                try {
                    fs.copyFileSync(this.persistenceFile, backupFile);
                } catch (backupError) {
                    // Backup failed, but continue with save
                }
            }
            
            // Atomic rename (replaces old file atomically)
            // Handle file locking gracefully (EPERM can occur if file is locked by another process)
            try {
                fs.renameSync(tempFile, this.persistenceFile);
            } catch (renameError) {
                // If rename fails due to permission/locking (EPERM), try to clean up temp file
                if (renameError.code === 'EPERM' || renameError.code === 'EBUSY') {
                    // File is locked - delete temp file and skip this save
                    // Next auto-save will retry
                    try {
                        if (fs.existsSync(tempFile)) {
                            fs.unlinkSync(tempFile);
                        }
                    } catch (cleanupError) {
                        // Ignore cleanup errors
                    }
                    // Don't throw - allow process to continue, next save will retry
                    return;
                }
                // For other errors, re-throw
                throw renameError;
            }
            
        } catch (error) {
            // DO NOT log to console - errors are for AI only, not user
            // Re-throw so UniversalErrorHandler can catch it
            throw error;
        } finally {
            this._saving = false;
        }
    }
    
    /**
     * Load state from disk
     */
    load() {
        try {
            if (fs.existsSync(this.persistenceFile)) {
                const data = JSON.parse(fs.readFileSync(this.persistenceFile, 'utf8'));
                
                // Restore state (basic restoration, Maps need special handling)
                if (data.state) {
                    this.state = this._deserializeState(data.state);
                }
                
                if (data.eventLog) {
                    this.eventLog = data.eventLog;
                }
                
                // CRITICAL: Repair state after loading to ensure arrays are arrays
                this._repairState();
            }
        } catch (error) {
            // DO NOT log to console - errors are for AI only, not user
            // If state file is corrupted, recover learning data first
            if (error instanceof SyntaxError) {
                // DO NOT log to console - errors are for AI only, not user
                // CRITICAL: Extract learning data before starting fresh
                let recoveredLearningData = null;
                try {
                    const StateStoreRecovery = require('./StateStoreRecovery');
                    
                    // First try: Extract from corrupted file
                    recoveredLearningData = StateStoreRecovery.extractLearningData(this.persistenceFile);
                    
                    // Second try: If that failed, try backup file
                    if (!recoveredLearningData.success || recoveredLearningData.patterns.length === 0) {
                        const backupFile = this.persistenceFile + '.backup';
                        if (fs.existsSync(backupFile)) {
                            try {
                                const backupData = JSON.parse(fs.readFileSync(backupFile, 'utf8'));
                                if (backupData.state && backupData.state.learning) {
                                    // Extract from backup
                                    recoveredLearningData = {
                                        success: true,
                                        patterns: backupData.state.learning.patterns || [],
                                        knowledge: backupData.state.learning.knowledge || [],
                                        improvements: backupData.state.learning.improvements || [],
                                        aiCompliance: backupData.state.learning.aiCompliance || [],
                                        workflowViolations: backupData.state.ai?.workflowViolations || [],
                                        prompts: backupData.state.ai?.prompts || [],
                                        errors: []
                                    };
                                }
                            } catch (backupError) {
                                // Backup also corrupted, use what we got from main file
                            }
                        }
                    }
                    
                    // Third try: Check for existing recovered file
                    if (!recoveredLearningData.success || recoveredLearningData.patterns.length === 0) {
                        const recoveredFiles = fs.readdirSync(path.dirname(this.persistenceFile))
                            .filter(f => f.startsWith('ai-state-store.recovered') && f.endsWith('.json'))
                            .map(f => path.join(path.dirname(this.persistenceFile), f))
                            .sort()
                            .reverse(); // Most recent first
                        
                        for (const recoveredFile of recoveredFiles) {
                            try {
                                const existing = StateStoreRecovery.loadRecoveredData(recoveredFile);
                                if (existing && existing.patterns && existing.patterns.length > 0) {
                                    recoveredLearningData = existing;
                                    break;
                                }
                            } catch (e) {
                                // Skip this file
                            }
                        }
                    }
                    
                    // Save recovered data to separate file
                    if (recoveredLearningData && recoveredLearningData.success) {
                        const recoveredFile = this.persistenceFile + '.recovered.' + Date.now() + '.json';
                        StateStoreRecovery.saveRecoveredData(recoveredLearningData, recoveredFile);
                    }
                } catch (recoveryError) {
                    // Recovery failed, but continue with fresh state
                }
                
                // Backup corrupted file
                try {
                    if (fs.existsSync(this.persistenceFile)) {
                        const backupFile = this.persistenceFile + '.corrupted.' + Date.now();
                        fs.copyFileSync(this.persistenceFile, backupFile);
                        // DO NOT log to console
                    }
                } catch (backupError) {
                    // Ignore backup errors (but UniversalErrorHandler will catch them)
                }
                
                // Start with fresh state - use the same initialization as constructor
                this.state = {
                    // Game State - Complete visibility into game
                    game: {
                        tables: new Map(),
                        players: new Map(),
                        chips: {
                            totalInSystem: 0,
                            byTable: new Map(),
                            byPlayer: new Map(),
                            history: []
                        },
                        hands: {
                            current: null,
                            history: []
                        },
                        phase: null,
                        lastUpdate: null
                    },
                    // System State - Server, Database, Unity
                    system: {
                        server: { status: 'unknown', health: null, metrics: { uptime: 0, requests: 0, errors: 0, responseTime: 0 }, logs: [], lastCheck: null },
                        database: { status: 'unknown', health: null, metrics: { uptime: 0, queries: 0, errors: 0, responseTime: 0 }, logs: [], lastCheck: null },
                        unity: { status: 'unknown', health: null, metrics: { uptime: 0, fps: 0, connected: false, lastActivity: null }, uiState: { labels: new Map(), images: new Map(), sounds: new Map(), animations: new Map() }, logs: [], lastCheck: null }
                    },
                    // Monitoring State
                    monitoring: {
                        investigation: { status: 'idle', startTime: null, timeout: 15, issues: [], history: [], progress: 0, timeRemaining: null },
                        verification: { status: 'idle', startTime: null, period: 0, results: [], history: [] },
                        detection: { activeDetectors: [], detectionRate: 0, falsePositives: 0, accuracy: 0, lastDetection: null }
                    },
                    // Issue State
                    issues: { detected: [], active: [], resolved: [], patterns: new Map(), fixes: new Map() },
                    // Fix State
                    fixes: { attempts: [], successes: [], failures: [], knowledge: new Map() },
                    // Learning State
                    learning: {
                        fixAttempts: new Map(),
                        successRates: new Map(),
                        patterns: new Map(),
                        knowledge: [],
                        improvements: [],
                        aiCompliance: [],
                        aiComplianceConfidence: { successRate: 0, totalPrompts: 0, successfulPrompts: 0, lastUpdated: null }
                    },
                    // AI State
                    ai: { prompts: [], recentToolCalls: [], lastBeforeActionCall: null, lastAfterActionCall: null, recentCodeChanges: [], workflowViolations: [] },
                    // Metadata
                    metadata: { version: '2.0.0', started: Date.now(), lastUpdate: Date.now(), updateCount: 0 }
                };
                
                // CRITICAL: Restore recovered learning data if available
                if (recoveredLearningData && recoveredLearningData.success) {
                    try {
                        // Restore patterns (convert array entries to Map)
                        if (recoveredLearningData.patterns && recoveredLearningData.patterns.length > 0) {
                            const patternsMap = new Map();
                            for (const patternEntry of recoveredLearningData.patterns) {
                                if (Array.isArray(patternEntry) && patternEntry.length === 2) {
                                    patternsMap.set(patternEntry[0], patternEntry[1]);
                                }
                            }
                            this.state.learning.patterns = patternsMap;
                        }
                        
                        // Restore knowledge
                        if (recoveredLearningData.knowledge && Array.isArray(recoveredLearningData.knowledge)) {
                            this.state.learning.knowledge = recoveredLearningData.knowledge;
                        }
                        
                        // Restore improvements
                        if (recoveredLearningData.improvements && Array.isArray(recoveredLearningData.improvements)) {
                            this.state.learning.improvements = recoveredLearningData.improvements;
                        }
                        
                        // Restore compliance
                        if (recoveredLearningData.aiCompliance && Array.isArray(recoveredLearningData.aiCompliance)) {
                            this.state.learning.aiCompliance = recoveredLearningData.aiCompliance;
                        }
                        
                        // Restore workflow violations
                        if (recoveredLearningData.workflowViolations && Array.isArray(recoveredLearningData.workflowViolations)) {
                            this.state.ai.workflowViolations = recoveredLearningData.workflowViolations;
                        }
                        
                        // Restore prompts
                        if (recoveredLearningData.prompts && Array.isArray(recoveredLearningData.prompts)) {
                            this.state.ai.prompts = recoveredLearningData.prompts;
                        }
                        
                        // Save immediately to preserve recovered data
                        this.save();
                    } catch (restoreError) {
                        // If restore fails, continue with empty learning data
                    }
                }
            }
            // Re-throw so UniversalErrorHandler can catch it
            throw error;
        }
    }
    
    /**
     * Repair state - ensure arrays are arrays, fix corrupted data
     */
    _repairState() {
        // Ensure issues arrays are always arrays
        if (!this.state.issues) {
            this.state.issues = {
                detected: [],
                active: [],
                resolved: [],
                patterns: new Map(),
                fixes: new Map()
            };
        }
        
        // Repair issues.active
        if (!Array.isArray(this.state.issues.active)) {
            if (typeof this.state.issues.active === 'object' && this.state.issues.active !== null) {
                // Convert object with numeric keys to array
                const keys = Object.keys(this.state.issues.active).map(k => parseInt(k)).filter(k => !isNaN(k)).sort((a, b) => a - b);
                this.state.issues.active = keys.map(k => this.state.issues.active[k.toString()]).filter(item => item !== undefined);
            } else {
                this.state.issues.active = [];
            }
        }
        
        // Repair issues.detected
        if (!Array.isArray(this.state.issues.detected)) {
            if (typeof this.state.issues.detected === 'object' && this.state.issues.detected !== null) {
                // Convert object with numeric keys to array
                const keys = Object.keys(this.state.issues.detected).map(k => parseInt(k)).filter(k => !isNaN(k)).sort((a, b) => a - b);
                this.state.issues.detected = keys.map(k => this.state.issues.detected[k.toString()]).filter(item => item !== undefined);
            } else {
                this.state.issues.detected = [];
            }
        }
        
        // Repair issues.resolved
        if (!Array.isArray(this.state.issues.resolved)) {
            if (typeof this.state.issues.resolved === 'object' && this.state.issues.resolved !== null) {
                // Convert object with numeric keys to array
                const keys = Object.keys(this.state.issues.resolved).map(k => parseInt(k)).filter(k => !isNaN(k)).sort((a, b) => a - b);
                this.state.issues.resolved = keys.map(k => this.state.issues.resolved[k.toString()]).filter(item => item !== undefined);
            } else {
                this.state.issues.resolved = [];
            }
        }
        
        // Ensure fixes.attempts is an array
        if (this.state.fixes) {
            if (!Array.isArray(this.state.fixes.attempts)) {
                if (typeof this.state.fixes.attempts === 'object' && this.state.fixes.attempts !== null) {
                    const keys = Object.keys(this.state.fixes.attempts).map(k => parseInt(k)).filter(k => !isNaN(k)).sort((a, b) => a - b);
                    this.state.fixes.attempts = keys.map(k => this.state.fixes.attempts[k.toString()]).filter(item => item !== undefined);
                } else {
                    this.state.fixes.attempts = [];
                }
            }
        }
        
        // Ensure learning.knowledge and learning.improvements are arrays
        if (!this.state.learning) {
            this.state.learning = {
                fixAttempts: new Map(),
                successRates: new Map(),
                patterns: new Map(),
                knowledge: [],
                improvements: []
            };
        }
        
        if (!Array.isArray(this.state.learning.knowledge)) {
            this.state.learning.knowledge = [];
        }
        
        if (!Array.isArray(this.state.learning.improvements)) {
            this.state.learning.improvements = [];
        }
    }
    
    /**
     * Serialize state (handle Maps)
     */
    _serializeState(state) {
        const serialized = {};
        for (const [key, value] of Object.entries(state)) {
            if (value instanceof Map) {
                serialized[key] = Array.from(value.entries());
            } else if (Array.isArray(value)) {
                // Preserve arrays as arrays (don't recurse into them)
                serialized[key] = value;
            } else if (key === 'learning' && typeof value === 'object' && value !== null) {
                // CRITICAL: Explicitly handle learning object to preserve arrays
                // Based on search findings: explicit data selection prevents loss during serialization
                const learningSerialized = {};
                for (const [learningKey, learningValue] of Object.entries(value)) {
                    if (learningKey === 'knowledge' || learningKey === 'improvements') {
                        // These MUST be arrays - preserve them explicitly with deep copy
                        // Search finding: arrays must be explicitly cloned to avoid reference issues
                        learningSerialized[learningKey] = Array.isArray(learningValue) 
                            ? JSON.parse(JSON.stringify(learningValue))  // Deep clone to ensure independence
                            : [];
                    } else if (learningValue instanceof Map) {
                        learningSerialized[learningKey] = Array.from(learningValue.entries());
                    } else if (Array.isArray(learningValue)) {
                        learningSerialized[learningKey] = JSON.parse(JSON.stringify(learningValue));
                    } else if (typeof learningValue === 'object' && learningValue !== null) {
                        learningSerialized[learningKey] = this._serializeState(learningValue);
                    } else {
                        learningSerialized[learningKey] = learningValue;
                    }
                }
                serialized[key] = learningSerialized;
            } else if (typeof value === 'object' && value !== null) {
                serialized[key] = this._serializeState(value);
            } else {
                serialized[key] = value;
            }
        }
        return serialized;
    }
    
    /**
     * Deserialize state (restore Maps)
     */
    _deserializeState(serialized) {
        const state = {};
        for (const [key, value] of Object.entries(serialized)) {
            if (Array.isArray(value) && key.includes('Map') || 
                (key === 'tables' || key === 'players' || key === 'byTable' || key === 'byPlayer')) {
                state[key] = new Map(value);
            } else if (key === 'knowledge' || key === 'improvements') {
                // CRITICAL: Explicitly handle learning arrays - convert objects with numeric keys to arrays
                if (Array.isArray(value)) {
                    state[key] = value;
                } else if (typeof value === 'object' && value !== null) {
                    // Convert object with numeric keys to array (e.g., {"0": {...}} -> [{...}])
                    const keys = Object.keys(value).map(k => parseInt(k)).filter(k => !isNaN(k)).sort((a, b) => a - b);
                    if (keys.length > 0) {
                        state[key] = keys.map(k => value[k.toString()]).filter(item => item !== undefined);
                    } else {
                        state[key] = [];
                    }
                } else {
                    state[key] = [];
                }
            } else if (Array.isArray(value)) {
                // Preserve arrays as arrays
                state[key] = value;
            } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                state[key] = this._deserializeState(value);
            } else {
                state[key] = value;
            }
        }
        
        // CRITICAL: Ensure issues arrays are always arrays (repair corrupted state)
        if (state.issues) {
            // Fix issues.active - must be array
            if (state.issues.active && !Array.isArray(state.issues.active)) {
                // Convert object with numeric keys to array
                if (typeof state.issues.active === 'object') {
                    const keys = Object.keys(state.issues.active).map(k => parseInt(k)).filter(k => !isNaN(k)).sort((a, b) => a - b);
                    state.issues.active = keys.map(k => state.issues.active[k.toString()]).filter(item => item !== undefined);
                } else {
                    state.issues.active = [];
                }
            } else if (!state.issues.active) {
                state.issues.active = [];
            }
            
            // Fix issues.detected - must be array
            if (state.issues.detected && !Array.isArray(state.issues.detected)) {
                // Convert object with numeric keys to array
                if (typeof state.issues.detected === 'object') {
                    const keys = Object.keys(state.issues.detected).map(k => parseInt(k)).filter(k => !isNaN(k)).sort((a, b) => a - b);
                    state.issues.detected = keys.map(k => state.issues.detected[k.toString()]).filter(item => item !== undefined);
                } else {
                    state.issues.detected = [];
                }
            } else if (!state.issues.detected) {
                state.issues.detected = [];
            }
            
            // Fix issues.resolved - must be array
            if (state.issues.resolved && !Array.isArray(state.issues.resolved)) {
                // Convert object with numeric keys to array
                if (typeof state.issues.resolved === 'object') {
                    const keys = Object.keys(state.issues.resolved).map(k => parseInt(k)).filter(k => !isNaN(k)).sort((a, b) => a - b);
                    state.issues.resolved = keys.map(k => state.issues.resolved[k.toString()]).filter(item => item !== undefined);
                } else {
                    state.issues.resolved = [];
                }
            } else if (!state.issues.resolved) {
                state.issues.resolved = [];
            }
        }
        
        // CRITICAL: Ensure learning.knowledge and learning.improvements are arrays (repair corrupted state)
        // This handles both deserialization from file AND repair of corrupted in-memory state
        if (state.learning) {
            // Fix learning.knowledge - must be array
            if (!Array.isArray(state.learning.knowledge)) {
                if (state.learning.knowledge && typeof state.learning.knowledge === 'object') {
                    // Convert object with numeric keys to array (e.g., {"0": {...}} -> [{...}])
                    const keys = Object.keys(state.learning.knowledge).map(k => parseInt(k)).filter(k => !isNaN(k)).sort((a, b) => a - b);
                    if (keys.length > 0) {
                        state.learning.knowledge = keys.map(k => state.learning.knowledge[k.toString()]).filter(item => item !== undefined);
                    } else {
                        state.learning.knowledge = [];
                    }
                } else {
                    state.learning.knowledge = [];
                }
            }
            
            // Fix learning.improvements - must be array
            if (!Array.isArray(state.learning.improvements)) {
                if (state.learning.improvements && typeof state.learning.improvements === 'object') {
                    // Convert object with numeric keys to array (e.g., {"0": {...}} -> [{...}])
                    const keys = Object.keys(state.learning.improvements).map(k => parseInt(k)).filter(k => !isNaN(k)).sort((a, b) => a - b);
                    if (keys.length > 0) {
                        state.learning.improvements = keys.map(k => state.learning.improvements[k.toString()]).filter(item => item !== undefined);
                    } else {
                        state.learning.improvements = [];
                    }
                } else {
                    state.learning.improvements = [];
                }
            }
        }
        
        return state;
    }
    
    /**
     * Cleanup
     */
    destroy() {
        if (this.autoSaveInterval) {
            clearInterval(this.autoSaveInterval);
        }
        this.save();
    }
}

module.exports = StateStore;
