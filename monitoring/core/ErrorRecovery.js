/**
 * Error Recovery & Resilience System
 * 
 * Provides graceful degradation, automatic recovery, and self-healing capabilities
 * AI system can recover from errors automatically
 */

const EventEmitter = require('events');

class ErrorRecovery extends EventEmitter {
    constructor(stateStore) {
        super();
        this.stateStore = stateStore;
        this.componentHealth = new Map(); // component -> { status, lastError, retryCount, lastRetry }
        this.retryConfig = {
            maxRetries: 3,
            baseDelay: 1000, // 1 second
            maxDelay: 30000, // 30 seconds
            backoffMultiplier: 2
        };
        this.circuitBreaker = new Map(); // component -> { state: 'closed'|'open'|'half-open', failures: 0, lastFailure: null }
    }
    
    /**
     * Record component error
     */
    recordError(component, error) {
        const health = this.componentHealth.get(component) || {
            status: 'healthy',
            lastError: null,
            retryCount: 0,
            lastRetry: null,
            errorCount: 0
        };
        
        health.status = 'unhealthy';
        health.lastError = {
            message: error.message,
            stack: error.stack,
            timestamp: Date.now()
        };
        health.errorCount++;
        
        this.componentHealth.set(component, health);
        
        // Update state store
        this.stateStore.updateState(`system.health.${component}`, {
            status: 'unhealthy',
            lastError: health.lastError,
            errorCount: health.errorCount,
            timestamp: Date.now()
        });
        
        // Check circuit breaker
        this.checkCircuitBreaker(component);
        
        this.emit('error', { component, error });
    }
    
    /**
     * Record component success
     */
    recordSuccess(component) {
        const health = this.componentHealth.get(component) || {
            status: 'healthy',
            lastError: null,
            retryCount: 0,
            lastRetry: null,
            errorCount: 0
        };
        
        health.status = 'healthy';
        health.retryCount = 0; // Reset retry count on success
        
        this.componentHealth.set(component, health);
        
        // Update state store ASYNC to avoid blocking/circular calls
        // This prevents hangs when getState -> recordSuccess -> updateState -> getState
        setImmediate(() => {
            try {
                this.stateStore.updateState(`system.health.${component}`, {
                    status: 'healthy',
                    errorCount: health.errorCount,
                    timestamp: Date.now()
                });
            } catch (error) {
                // Ignore errors in async update - non-critical
            }
        });
        
        // Reset circuit breaker
        this.resetCircuitBreaker(component);
        
        this.emit('success', { component });
    }
    
    /**
     * Check if component should retry
     */
    shouldRetry(component) {
        const health = this.componentHealth.get(component);
        if (!health || health.status === 'healthy') {
            return false;
        }
        
        // Check circuit breaker
        const breaker = this.circuitBreaker.get(component);
        if (breaker && breaker.state === 'open') {
            // Check if we should try half-open
            const timeSinceLastFailure = Date.now() - breaker.lastFailure;
            if (timeSinceLastFailure > 60000) { // 1 minute
                breaker.state = 'half-open';
                return true;
            }
            return false;
        }
        
        // Check retry count
        if (health.retryCount >= this.retryConfig.maxRetries) {
            return false;
        }
        
        return true;
    }
    
    /**
     * Get retry delay with exponential backoff
     */
    getRetryDelay(component) {
        const health = this.componentHealth.get(component);
        if (!health) {
            return this.retryConfig.baseDelay;
        }
        
        const delay = Math.min(
            this.retryConfig.baseDelay * Math.pow(this.retryConfig.backoffMultiplier, health.retryCount),
            this.retryConfig.maxDelay
        );
        
        return delay;
    }
    
    /**
     * Retry operation with exponential backoff
     */
    async retryOperation(component, operation, context = {}) {
        const health = this.componentHealth.get(component) || {
            status: 'healthy',
            retryCount: 0,
            lastRetry: null
        };
        
        if (!this.shouldRetry(component)) {
            throw new Error(`Component ${component} is unhealthy and max retries exceeded`);
        }
        
        health.retryCount++;
        health.lastRetry = Date.now();
        this.componentHealth.set(component, health);
        
        const delay = this.getRetryDelay(component);
        
        this.emit('retry', { component, attempt: health.retryCount, delay, context });
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, delay));
        
        try {
            const result = await operation();
            this.recordSuccess(component);
            return result;
        } catch (error) {
            this.recordError(component, error);
            
            // If still should retry, try again
            if (this.shouldRetry(component)) {
                return this.retryOperation(component, operation, context);
            }
            
            throw error;
        }
    }
    
    /**
     * Circuit breaker - prevent cascading failures
     */
    checkCircuitBreaker(component) {
        const breaker = this.circuitBreaker.get(component) || {
            state: 'closed',
            failures: 0,
            lastFailure: null
        };
        
        breaker.failures++;
        breaker.lastFailure = Date.now();
        
        // Open circuit if too many failures
        if (breaker.failures >= 5) {
            breaker.state = 'open';
            this.emit('circuitOpen', { component, failures: breaker.failures });
        }
        
        this.circuitBreaker.set(component, breaker);
    }
    
    /**
     * Reset circuit breaker
     */
    resetCircuitBreaker(component) {
        const breaker = this.circuitBreaker.get(component);
        if (breaker) {
            breaker.state = 'closed';
            breaker.failures = 0;
            this.circuitBreaker.set(component, breaker);
        }
    }
    
    /**
     * Get component health
     */
    getComponentHealth(component) {
        return this.componentHealth.get(component) || {
            status: 'healthy',
            errorCount: 0
        };
    }
    
    /**
     * Get all component health
     */
    getAllHealth() {
        const health = {};
        for (const [component, data] of this.componentHealth.entries()) {
            health[component] = {
                status: data.status,
                errorCount: data.errorCount,
                lastError: data.lastError ? {
                    message: data.lastError.message,
                    timestamp: data.lastError.timestamp
                } : null
            };
        }
        return health;
    }
    
    /**
     * Wrap function with error recovery
     */
    wrapWithRecovery(component, fn) {
        return async (...args) => {
            try {
                const result = await fn(...args);
                this.recordSuccess(component);
                return result;
            } catch (error) {
                this.recordError(component, error);
                
                // Try to recover
                if (this.shouldRetry(component)) {
                    return this.retryOperation(component, () => fn(...args));
                }
                
                throw error;
            }
        };
    }
}

module.exports = ErrorRecovery;
