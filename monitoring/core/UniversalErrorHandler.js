/**
 * Universal Error Handler
 * 
 * Catches ALL errors, reports them, learns from them, tracks them.
 * NOTHING goes unnoticed. EVERYTHING advances learning.
 */

const EventEmitter = require('events');

class UniversalErrorHandler extends EventEmitter {
    constructor(stateStore, issueDetector, errorRecovery, learningEngine) {
        super();
        this.stateStore = stateStore;
        this.issueDetector = issueDetector;
        this.errorRecovery = errorRecovery;
        this.learningEngine = learningEngine;
        
        // Error tracking
        this.errorHistory = []; // All errors ever seen
        this.errorPatterns = new Map(); // pattern -> { count, firstSeen, lastSeen, contexts }
        this.componentErrors = new Map(); // component -> { count, errors: [] }
        this.maxHistorySize = 10000; // Keep last 10k errors
        
        // Setup global error handlers
        this.setupGlobalHandlers();
        
        // Load error history
        this.load();
    }
    
    /**
     * Setup global error handlers
     */
    setupGlobalHandlers() {
        // Catch unhandled promise rejections
        process.on('unhandledRejection', (reason, promise) => {
            this.handleError({
                type: 'UNHANDLED_PROMISE_REJECTION',
                error: reason instanceof Error ? reason : new Error(String(reason)),
                component: 'process',
                context: { promise: promise.toString() },
                severity: 'critical'
            });
        });
        
        // Catch uncaught exceptions
        process.on('uncaughtException', (error) => {
            this.handleError({
                type: 'UNCAUGHT_EXCEPTION',
                error: error,
                component: 'process',
                context: {},
                severity: 'critical'
            });
        });
        
        // Catch warnings
        process.on('warning', (warning) => {
            this.handleError({
                type: 'PROCESS_WARNING',
                error: new Error(warning.message),
                component: 'process',
                context: { name: warning.name, stack: warning.stack },
                severity: 'medium'
            });
        });
    }
    
    /**
     * Handle any error - main entry point
     */
    handleError(errorInfo) {
        const {
            type,
            error,
            component = 'unknown',
            context = {},
            severity = 'high',
            operation = null,
            metadata = {}
        } = errorInfo;
        
        // Ensure error is an Error object
        const errorObj = error instanceof Error ? error : new Error(String(error));
        
        // Create error record
        const errorRecord = {
            id: this.generateErrorId(),
            type: type || errorObj.name || 'UNKNOWN_ERROR',
            message: errorObj.message,
            stack: errorObj.stack,
            component,
            context,
            severity,
            operation,
            metadata,
            timestamp: Date.now(),
            pattern: this.extractPattern(errorObj, component, context)
        };
        
        // Add to history
        this.errorHistory.push(errorRecord);
        if (this.errorHistory.length > this.maxHistorySize) {
            this.errorHistory.shift();
        }
        
        // Track by component
        if (!this.componentErrors.has(component)) {
            this.componentErrors.set(component, { count: 0, errors: [] });
        }
        const componentData = this.componentErrors.get(component);
        componentData.count++;
        componentData.errors.push(errorRecord);
        if (componentData.errors.length > 100) {
            componentData.errors.shift();
        }
        
        // Track patterns
        this.trackPattern(errorRecord);
        
        // Report to issue detector
        if (this.issueDetector) {
            try {
                this.issueDetector.detectIssue({
                    type: `ERROR_${errorRecord.type}`,
                    severity: severity,
                    method: 'universalErrorHandler',
                    details: {
                        component: component,
                        error: errorRecord.message,
                        operation: operation,
                        context: context,
                        pattern: errorRecord.pattern
                    },
                    timestamp: errorRecord.timestamp
                });
            } catch (reportError) {
                // Even error reporting can fail - DO NOT log to console
                // Errors are for AI only, not user
            }
        }
        
        // Track with error recovery
        if (this.errorRecovery) {
            try {
                this.errorRecovery.recordError(component, errorObj);
            } catch (recoveryError) {
                // DO NOT log to console - errors are for AI only, not user
            }
        }
        
        // Learn from error
        this.learnFromError(errorRecord);
        
        // Update state store
        this.updateStateStore(errorRecord);
        
        // Emit event
        this.emit('error', errorRecord);
        
        // DO NOT log to console - errors are for AI only, not user
        // All errors are reported to issue detector and learned from
        
        return errorRecord;
    }
    
    /**
     * Extract error pattern
     */
    extractPattern(error, component, context) {
        const parts = [];
        
        // Component
        parts.push(`component:${component}`);
        
        // Error type
        if (error.name) {
            parts.push(`type:${error.name}`);
        }
        
        // Error message keywords
        const message = error.message || '';
        const keywords = message.match(/\b(error|fail|exception|timeout|null|undefined|not found|cannot|unable)\b/gi);
        if (keywords) {
            parts.push(...keywords.map(k => `keyword:${k.toLowerCase()}`));
        }
        
        // Context keys
        if (context && typeof context === 'object') {
            for (const [key, value] of Object.entries(context)) {
                if (typeof value === 'string' && value.length < 50) {
                    parts.push(`ctx:${key}:${value.substring(0, 20)}`);
                }
            }
        }
        
        return parts.join('|');
    }
    
    /**
     * Track error pattern
     */
    trackPattern(errorRecord) {
        const pattern = errorRecord.pattern;
        
        if (!this.errorPatterns.has(pattern)) {
            this.errorPatterns.set(pattern, {
                count: 0,
                firstSeen: errorRecord.timestamp,
                lastSeen: errorRecord.timestamp,
                contexts: [],
                components: new Set(),
                severities: new Map()
            });
        }
        
        const patternData = this.errorPatterns.get(pattern);
        patternData.count++;
        patternData.lastSeen = errorRecord.timestamp;
        patternData.components.add(errorRecord.component);
        
        // Track severity
        if (!patternData.severities.has(errorRecord.severity)) {
            patternData.severities.set(errorRecord.severity, 0);
        }
        patternData.severities.set(errorRecord.severity, patternData.severities.get(errorRecord.severity) + 1);
        
        // Track context (keep last 10)
        if (errorRecord.context && Object.keys(errorRecord.context).length > 0) {
            patternData.contexts.push(errorRecord.context);
            if (patternData.contexts.length > 10) {
                patternData.contexts.shift();
            }
        }
    }
    
    /**
     * Learn from error
     */
    learnFromError(errorRecord) {
        if (!this.learningEngine) return;
        
        // Create a "fix attempt" record for the error (even though we didn't try to fix it)
        // This allows the learning system to learn from errors
        const errorAttempt = {
            id: `error-${errorRecord.id}`,
            issueId: errorRecord.id,
            issueType: errorRecord.type,
            fixMethod: 'error_detected', // Not a fix, but detection
            fixDetails: {
                detected: true,
                reported: true,
                learned: true,
                component: errorRecord.component,
                operation: errorRecord.operation
            },
            result: 'detected', // Not success/failure, but detected
            timestamp: errorRecord.timestamp,
            state: this.stateStore.getState('game'),
            logs: [],
            duration: 0
        };
        
        // Learn from this error
        try {
            this.learningEngine.learnFromAttempt(errorAttempt);
        } catch (learnError) {
            // DO NOT log to console - errors are for AI only, not user
        }
    }
    
    /**
     * Wrap function to catch all errors
     */
    wrapFunction(component, operation, fn) {
        return async (...args) => {
            try {
                const result = await fn(...args);
                // Record success
                if (this.errorRecovery) {
                    this.errorRecovery.recordSuccess(component);
                }
                return result;
            } catch (error) {
                // Handle error
                this.handleError({
                    type: 'FUNCTION_ERROR',
                    error: error,
                    component: component,
                    operation: operation,
                    context: { args: args.map(a => String(a).substring(0, 100)) },
                    severity: 'high'
                });
                throw error; // Re-throw so caller knows it failed
            }
        };
    }
    
    /**
     * Wrap sync function to catch all errors
     */
    wrapSyncFunction(component, operation, fn) {
        return (...args) => {
            try {
                const result = fn(...args);
                // Record success
                if (this.errorRecovery) {
                    this.errorRecovery.recordSuccess(component);
                }
                return result;
            } catch (error) {
                // Handle error
                this.handleError({
                    type: 'SYNC_FUNCTION_ERROR',
                    error: error,
                    component: component,
                    operation: operation,
                    context: { args: args.map(a => String(a).substring(0, 100)) },
                    severity: 'high'
                });
                throw error; // Re-throw so caller knows it failed
            }
        };
    }
    
    /**
     * Get error statistics
     */
    getErrorStatistics() {
        return {
            totalErrors: this.errorHistory.length,
            errorsByComponent: Object.fromEntries(
                Array.from(this.componentErrors.entries()).map(([component, data]) => [
                    component,
                    { count: data.count, recent: data.errors.slice(-10) }
                ])
            ),
            errorPatterns: Array.from(this.errorPatterns.entries())
                .sort((a, b) => b[1].count - a[1].count)
                .slice(0, 20)
                .map(([pattern, data]) => ({
                    pattern,
                    count: data.count,
                    firstSeen: data.firstSeen,
                    lastSeen: data.lastSeen,
                    components: Array.from(data.components),
                    severities: Object.fromEntries(data.severities)
                })),
            recentErrors: this.errorHistory.slice(-20)
        };
    }
    
    /**
     * Get errors by component
     */
    getErrorsByComponent(component, limit = 10) {
        const componentData = this.componentErrors.get(component);
        if (!componentData) {
            return [];
        }
        return componentData.errors.slice(-limit);
    }
    
    /**
     * Get error patterns
     */
    getErrorPatterns(limit = 10) {
        return Array.from(this.errorPatterns.entries())
            .sort((a, b) => b[1].count - a[1].count)
            .slice(0, limit)
            .map(([pattern, data]) => ({
                pattern,
                count: data.count,
                firstSeen: data.firstSeen,
                lastSeen: data.lastSeen,
                components: Array.from(data.components),
                severities: Object.fromEntries(data.severities)
            }));
    }
    
    /**
     * Generate unique error ID
     */
    generateErrorId() {
        return `ERR-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
    
    /**
     * Update state store
     */
    updateStateStore(errorRecord) {
        try {
            // Update error statistics
            const stats = this.getErrorStatistics();
            this.stateStore.updateState('system.errors', {
                total: stats.totalErrors,
                byComponent: stats.errorsByComponent,
                recent: stats.recentErrors.slice(-10),
                timestamp: Date.now()
            });
            
            // Update error patterns
            this.stateStore.updateState('system.errorPatterns', stats.errorPatterns);
        } catch (error) {
            // Even state store updates can fail - DO NOT log to console
            // Errors are for AI only, not user
        }
    }
    
    /**
     * Load error history
     */
    load() {
        try {
            const errors = this.stateStore.getState('system.errors.history') || [];
            if (Array.isArray(errors) && errors.length > 0) {
                // Restore last 1000 errors
                this.errorHistory = errors.slice(-1000);
            }
            
            const patterns = this.stateStore.getState('system.errorPatterns') || [];
            if (Array.isArray(patterns)) {
                for (const patternData of patterns) {
                    if (patternData.pattern) {
                        this.errorPatterns.set(patternData.pattern, {
                            count: patternData.count || 0,
                            firstSeen: patternData.firstSeen || Date.now(),
                            lastSeen: patternData.lastSeen || Date.now(),
                            contexts: patternData.contexts || [],
                            components: new Set(patternData.components || []),
                            severities: new Map(Object.entries(patternData.severities || {}))
                        });
                    }
                }
            }
        } catch (error) {
            // DO NOT log to console - errors are for AI only, not user
        }
    }
    
    /**
     * Save error history
     */
    save() {
        try {
            this.stateStore.updateState('system.errors.history', this.errorHistory.slice(-1000));
            this.stateStore.updateState('system.errorPatterns', this.getErrorPatterns(100));
        } catch (error) {
            // DO NOT log to console - errors are for AI only, not user
        }
    }
}

module.exports = UniversalErrorHandler;
