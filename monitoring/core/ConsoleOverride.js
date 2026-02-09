/**
 * Console Override - Enforces Logging Rules
 * 
 * Automatically intercepts console.log/error/warn and routes to gameLogger.
 * Makes it impossible to violate the logging rule.
 * 
 * This is loaded FIRST before any other code runs.
 */

// Lazy load gameLogger to avoid circular dependencies and initialization issues
let gameLogger = null;
function getGameLogger() {
    if (!gameLogger) {
        try {
            gameLogger = require('../../src/utils/GameLogger');
        } catch (error) {
            // If gameLogger isn't available, use a no-op logger
            return {
                warn: () => {},
                error: () => {},
                info: () => {}
            };
        }
    }
    return gameLogger;
}

// Store original console methods
const originalConsole = {
    log: console.log,
    error: console.error,
    warn: console.warn,
    info: console.info,
    debug: console.debug
};

// Track violations for BrokenPromise
const violations = [];

// Callback to record violations with rules enforcer (set after AIMonitorCore initializes)
let recordViolationCallback = null;

/**
 * Set callback to record violations with rules enforcer
 */
function setViolationCallback(callback) {
    recordViolationCallback = callback;
}

/**
 * Record violation with rules enforcer (if available)
 */
function recordViolationWithRulesEnforcer(method, message, stack) {
    if (recordViolationCallback) {
        try {
            // Extract file/context from stack
            const stackLines = stack.split('\n');
            const fileLine = stackLines.find(line => line.includes('monitoring/') || line.includes('src/'));
            const context = fileLine ? fileLine.trim() : 'unknown';
            
            // Record violation with rules enforcer
            recordViolationCallback('BrokenPromise_all_logs_to_gameLogger', context, {
                method,
                message: message.substring(0, 200), // Limit message length
                stack: stackLines.slice(0, 5).join('\n') // First 5 stack lines
            });
        } catch (error) {
            // Don't break if recording fails
        }
    }
}

/**
 * Override console methods to enforce logging rules
 */
function overrideConsole() {
    // Override console.log - route to gameLogger
    console.log = function(...args) {
        // Check if this is CLI JSON output or test file output (allowed exceptions)
        const isCLIOutput = process.argv && (
            process.argv[1] && process.argv[1].includes('BrokenPromise-integration.js') ||
            process.argv[1] && process.argv[1].includes('test-') && (
                args.length === 1 && typeof args[0] === 'string' && args[0].startsWith('{') ||
                args.some(arg => typeof arg === 'string' && (arg.includes('✅') || arg.includes('❌') || arg.includes('Testing') || arg.includes('PASS') || arg.includes('FAIL')))
            )
        );
        
        if (isCLIOutput) {
            // Allow CLI JSON output
            originalConsole.log.apply(console, args);
        } else {
            // Violation - route to gameLogger and log violation
            const message = args.map(arg => 
                typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
            ).join(' ');
            
            // Use lazy-loaded gameLogger
            const logger = getGameLogger();
            logger.warn('BrokenPromise', '[CONSOLE_OVERRIDE] console.log violation detected', {
                message,
                stack: new Error().stack,
                timestamp: Date.now()
            });
            
            const stack = new Error().stack;
            violations.push({
                method: 'log',
                message,
                timestamp: Date.now(),
                stack
            });
            
            // Record violation with rules enforcer (for learning)
            recordViolationWithRulesEnforcer('log', message, stack);
            
            // Also log to gameLogger as info (so BrokenPromise sees it)
            logger.info('BrokenPromise', message, args.length > 1 ? args.slice(1) : null);
        }
    };
    
    // Override console.error - route to gameLogger
    console.error = function(...args) {
        const message = args.map(arg => 
            typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
        ).join(' ');
        
        const logger = getGameLogger();
        logger.error('BrokenPromise', '[CONSOLE_OVERRIDE] console.error violation detected', {
            message,
            stack: new Error().stack,
            timestamp: Date.now()
        });
        
            const stack = new Error().stack;
            violations.push({
                method: 'error',
                message,
                timestamp: Date.now(),
                stack
            });
            
            // Record violation with rules enforcer (for learning)
            recordViolationWithRulesEnforcer('error', message, stack);
            
            // Also log to gameLogger as error
            logger.error('BrokenPromise', message, args.length > 1 ? args.slice(1) : null);
    };
    
    // Override console.warn - route to gameLogger
    console.warn = function(...args) {
        const message = args.map(arg => 
            typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
        ).join(' ');
        
        const logger = getGameLogger();
        logger.warn('BrokenPromise', '[CONSOLE_OVERRIDE] console.warn violation detected', {
            message,
            stack: new Error().stack,
            timestamp: Date.now()
        });
        
            const stack = new Error().stack;
            violations.push({
                method: 'warn',
                message,
                timestamp: Date.now(),
                stack
            });
            
            // Record violation with rules enforcer (for learning)
            recordViolationWithRulesEnforcer('warn', message, stack);
            
            // Also log to gameLogger as warn
            logger.warn('BrokenPromise', message, args.length > 1 ? args.slice(1) : null);
    };
    
    // Override console.info - route to gameLogger
    console.info = function(...args) {
        const message = args.map(arg => 
            typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
        ).join(' ');
        
        const logger = getGameLogger();
        logger.info('BrokenPromise', '[CONSOLE_OVERRIDE] console.info violation detected', {
            message,
            stack: new Error().stack,
            timestamp: Date.now()
        });
        
            const stack = new Error().stack;
            violations.push({
                method: 'info',
                message,
                timestamp: Date.now(),
                stack
            });
            
            // Record violation with rules enforcer (for learning)
            recordViolationWithRulesEnforcer('info', message, stack);
            
            // Also log to gameLogger as info
            logger.info('BrokenPromise', message, args.length > 1 ? args.slice(1) : null);
    };
    
    // Override console.debug - route to gameLogger
    console.debug = function(...args) {
        const message = args.map(arg => 
            typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
        ).join(' ');
        
        const logger = getGameLogger();
        logger.info('BrokenPromise', '[CONSOLE_OVERRIDE] console.debug violation detected', {
            message,
            stack: new Error().stack,
            timestamp: Date.now()
        });
        
            const stack = new Error().stack;
            violations.push({
                method: 'debug',
                message,
                timestamp: Date.now(),
                stack
            });
            
            // Record violation with rules enforcer (for learning)
            recordViolationWithRulesEnforcer('debug', message, stack);
            
            // Also log to gameLogger as info
            logger.info('BrokenPromise', message, args.length > 1 ? args.slice(1) : null);
    };
}

/**
 * Get violations (for BrokenPromise to track)
 */
function getViolations() {
    return violations.slice();
}

/**
 * Clear violations
 */
function clearViolations() {
    violations.length = 0;
}

// Auto-override on load - but do it asynchronously to avoid blocking
// This prevents hangs during module initialization
setImmediate(() => {
    overrideConsole();
});

module.exports = {
    overrideConsole,
    getViolations,
    clearViolations,
    originalConsole,
    setViolationCallback
};
