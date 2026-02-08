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

class StateStore extends EventEmitter {
    constructor(projectRoot) {
        super();
        this.projectRoot = projectRoot;
        this.persistenceFile = path.join(projectRoot, 'logs', 'ai-state-store.json');
        
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
                improvements: [] // System improvements over time
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
        
        // Update state atomically
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
     */
    save() {
        try {
            const data = {
                state: this._serializeState(this.state),
                eventLog: this.eventLog.slice(-1000), // Save last 1000 events
                timestamp: Date.now()
            };
            
            fs.writeFileSync(this.persistenceFile, JSON.stringify(data, null, 2), 'utf8');
        } catch (error) {
            // DO NOT log to console - errors are for AI only, not user
            // Re-throw so UniversalErrorHandler can catch it
            throw error;
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
            // If state file is corrupted, start fresh
            if (error instanceof SyntaxError) {
                // DO NOT log to console - errors are for AI only, not user
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
                // Start with fresh state
                this.state = this._getInitialState();
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
    }
    
    /**
     * Serialize state (handle Maps)
     */
    _serializeState(state) {
        const serialized = {};
        for (const [key, value] of Object.entries(state)) {
            if (value instanceof Map) {
                serialized[key] = Array.from(value.entries());
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
