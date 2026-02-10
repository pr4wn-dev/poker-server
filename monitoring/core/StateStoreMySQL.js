/**
 * State Store - MySQL Backend
 * 
 * Single source of truth using MySQL database
 * Replaces JSON file storage with indexed database queries
 * 
 * Serves the soul: Learning data for misdiagnosis prevention, patterns, compliance tracking
 */

const EventEmitter = require('events');
const DatabaseManager = require('./DatabaseManager');
const gameLogger = require('../../src/utils/GameLogger');

class StateStoreMySQL extends EventEmitter {
    constructor(projectRoot) {
        super();
        this.projectRoot = projectRoot;
        this.dbManager = new DatabaseManager(projectRoot);
        this.initialized = false;
        
        // In-memory cache for frequently accessed state (optional optimization)
        this.cache = new Map();
        this.cacheTimeout = 5000; // 5 seconds cache
        
        // State structure (for compatibility)
        this.state = {
            game: {},
            system: {},
            monitoring: {},
            issues: {},
            fixes: {},
            learning: {},
            ai: {},
            metadata: {},
            rules: {},
            process: {}
        };
    }

    /**
     * Initialize database connection
     */
    async initialize() {
        if (this.initialized) return;
        
        try {
            await this.dbManager.initialize();
            await this.loadCoreState(); // Load only core state (game, system, monitoring)
            this.initialized = true;
            this.emit('initialized');
        } catch (error) {
            gameLogger.error('MONITORING', '[StateStoreMySQL] Initialization failed', { error: error.message });
            throw error;
        }
    }

    /**
     * Load only core state (game, system, monitoring) - lazy load rest
     */
    async loadCoreState() {
        const corePaths = ['game', 'system', 'monitoring', 'issues', 'fixes', 'ai', 'metadata', 'rules', 'process'];
        
        for (const path of corePaths) {
            const value = await this.dbManager.getState(path);
            if (value !== null) {
                this.state[path] = value;
            }
        }
    }

    /**
     * Get state value by path (supports dot notation)
     * Synchronous for compatibility, uses cache
     */
    getState(path = null) {
        if (!path) {
            // Return in-memory state structure
            return this.state;
        }
        
        // Check cache first
        if (this.cache.has(path)) {
            const cached = this.cache.get(path);
            if (Date.now() - cached.timestamp < this.cacheTimeout) {
                return cached.value;
            }
            this.cache.delete(path);
        }
        
        // Try in-memory state first
        const parts = path.split('.');
        let current = this.state;
        for (const part of parts) {
            if (current === null || current === undefined) {
                return null;
            }
            current = current[part];
        }
        
        if (current !== undefined) {
            return current;
        }
        
        // If not in memory, return null (will be loaded on demand if needed)
        return null;
    }
    
    /**
     * Async get state from database (for explicit database queries)
     */
    async getStateAsync(path) {
        if (!this.initialized) await this.initialize();
        
        // Check cache first
        if (this.cache.has(path)) {
            const cached = this.cache.get(path);
            if (Date.now() - cached.timestamp < this.cacheTimeout) {
                return cached.value;
            }
            this.cache.delete(path);
        }
        
        // Get from database
        const value = await this.dbManager.getState(path);
        
        // Cache it and update in-memory
        if (value !== null) {
            this.cache.set(path, { value, timestamp: Date.now() });
            this._setNestedState(path, value);
        }
        
        return value;
    }

    /**
     * Update state value by path
     * Synchronous for compatibility, async database update
     */
    updateState(path, value, metadata = {}) {
        // Get old value for change tracking
        const oldValue = this.getState(path);
        
        // Update in-memory immediately (for compatibility)
        this._setNestedState(path, value);
        
        // Clear cache
        this.cache.delete(path);
        
        // Update database async (don't block)
        if (!this.initialized) {
            this.initialize().then(() => {
                this.dbManager.updateState(path, value).catch(err => {
                    gameLogger.warn('MONITORING', '[StateStoreMySQL] Database update failed', { error: err.message });
                });
            }).catch(err => {
                gameLogger.warn('MONITORING', '[StateStoreMySQL] Database init failed', { error: err.message });
            });
        } else {
            this.dbManager.updateState(path, value).catch(err => {
                gameLogger.warn('MONITORING', '[StateStoreMySQL] Database update failed', { error: err.message });
            });
        }
        
        // Emit state change event
        this.emit('stateChanged', { path, oldValue, newValue: value, metadata });
        
        // Update metadata
        if (!this.state.metadata) this.state.metadata = {};
        this.state.metadata.lastUpdate = Date.now();
        this.state.metadata.updateCount = (this.state.metadata.updateCount || 0) + 1;
        
        return { path, oldValue, newValue: value, metadata, timestamp: Date.now() };
    }

    /**
     * Set nested state value (helper for dot notation)
     */
    _setNestedState(path, value) {
        const parts = path.split('.');
        let current = this.state;
        
        for (let i = 0; i < parts.length - 1; i++) {
            if (!current[parts[i]]) {
                current[parts[i]] = {};
            }
            current = current[parts[i]];
        }
        
        current[parts[parts.length - 1]] = value;
    }

    /**
     * Get state history (replaces EventLog - on-demand generation)
     */
    async getStateHistory(path, timeRange = null) {
        if (!this.initialized) await this.initialize();
        
        const history = await this.dbManager.getStateHistory(path, timeRange);
        
        // Convert to EventLog format for compatibility
        return history.map(change => ({
            timestamp: change.timestamp,
            path: change.path,
            oldValue: change.old_value_hash ? { hash: change.old_value_hash } : null,
            newValue: change.new_value_hash ? { hash: change.new_value_hash } : null,
            metadata: change.metadata ? JSON.parse(change.metadata) : {},
            correlatedIssueId: change.correlated_issue_id
        }));
    }

    /**
     * Save state (for compatibility - now just updates metadata)
     */
    async save() {
        if (!this.initialized) await this.initialize();
        
        // State is already saved in database via updateState
        // Just update metadata timestamp
        await this.updateState('metadata.lastUpdate', Date.now());
    }

    /**
     * Load state (for compatibility - now loads from database)
     */
    async load() {
        if (!this.initialized) {
            await this.initialize();
        }
    }

    /**
     * Get all state (for compatibility - loads from database)
     */
    async getAllState() {
        if (!this.initialized) await this.initialize();
        
        // Load all paths from database
        const paths = await this.dbManager.getAllStatePaths();
        const state = {};
        
        for (const path of paths) {
            const value = await this.getState(path);
            this._setNestedState(path, value);
        }
        
        return this.state;
    }

    /**
     * Close database connection
     */
    async close() {
        await this.dbManager.close();
        this.initialized = false;
    }

    /**
     * Get database manager (for direct queries)
     */
    getDatabaseManager() {
        return this.dbManager;
    }
}

module.exports = StateStoreMySQL;
