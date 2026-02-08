/**
 * Console Override - Enforces Logging Rules
 * 
 * Automatically intercepts console.log/error/warn and routes to gameLogger.
 * Makes it impossible to violate the logging rule.
 * 
 * This is loaded FIRST before any other code runs.
 */

const gameLogger = require('../../src/utils/GameLogger');

// Store original console methods
const originalConsole = {
    log: console.log,
    error: console.error,
    warn: console.warn,
    info: console.info,
    debug: console.debug
};

// Track violations for Cerberus
const violations = [];

/**
 * Override console methods to enforce logging rules
 */
function overrideConsole() {
    // Override console.log - route to gameLogger
    console.log = function(...args) {
        // Check if this is CLI JSON output (allowed exception)
        const isCLIOutput = process.argv && (
            process.argv[1] && process.argv[1].includes('cerberus-integration.js') ||
            process.argv[1] && process.argv[1].includes('test-') && args.length === 1 && typeof args[0] === 'string' && args[0].startsWith('{')
        );
        
        if (isCLIOutput) {
            // Allow CLI JSON output
            originalConsole.log.apply(console, args);
        } else {
            // Violation - route to gameLogger and log violation
            const message = args.map(arg => 
                typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
            ).join(' ');
            
            gameLogger.warn('CERBERUS', '[CONSOLE_OVERRIDE] console.log violation detected', {
                message,
                stack: new Error().stack,
                timestamp: Date.now()
            });
            
            violations.push({
                method: 'log',
                message,
                timestamp: Date.now(),
                stack: new Error().stack
            });
            
            // Also log to gameLogger as info (so Cerberus sees it)
            gameLogger.info('CERBERUS', message, args.length > 1 ? args.slice(1) : null);
        }
    };
    
    // Override console.error - route to gameLogger
    console.error = function(...args) {
        const message = args.map(arg => 
            typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
        ).join(' ');
        
        gameLogger.error('CERBERUS', '[CONSOLE_OVERRIDE] console.error violation detected', {
            message,
            stack: new Error().stack,
            timestamp: Date.now()
        });
        
        violations.push({
            method: 'error',
            message,
            timestamp: Date.now(),
            stack: new Error().stack
        });
        
        // Also log to gameLogger as error
        gameLogger.error('CERBERUS', message, args.length > 1 ? args.slice(1) : null);
    };
    
    // Override console.warn - route to gameLogger
    console.warn = function(...args) {
        const message = args.map(arg => 
            typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
        ).join(' ');
        
        gameLogger.warn('CERBERUS', '[CONSOLE_OVERRIDE] console.warn violation detected', {
            message,
            stack: new Error().stack,
            timestamp: Date.now()
        });
        
        violations.push({
            method: 'warn',
            message,
            timestamp: Date.now(),
            stack: new Error().stack
        });
        
        // Also log to gameLogger as warn
        gameLogger.warn('CERBERUS', message, args.length > 1 ? args.slice(1) : null);
    };
    
    // Override console.info - route to gameLogger
    console.info = function(...args) {
        const message = args.map(arg => 
            typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
        ).join(' ');
        
        gameLogger.info('CERBERUS', '[CONSOLE_OVERRIDE] console.info violation detected', {
            message,
            stack: new Error().stack,
            timestamp: Date.now()
        });
        
        violations.push({
            method: 'info',
            message,
            timestamp: Date.now(),
            stack: new Error().stack
        });
        
        // Also log to gameLogger as info
        gameLogger.info('CERBERUS', message, args.length > 1 ? args.slice(1) : null);
    };
    
    // Override console.debug - route to gameLogger
    console.debug = function(...args) {
        const message = args.map(arg => 
            typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
        ).join(' ');
        
        gameLogger.info('CERBERUS', '[CONSOLE_OVERRIDE] console.debug violation detected', {
            message,
            stack: new Error().stack,
            timestamp: Date.now()
        });
        
        violations.push({
            method: 'debug',
            message,
            timestamp: Date.now(),
            stack: new Error().stack
        });
        
        // Also log to gameLogger as info
        gameLogger.info('CERBERUS', message, args.length > 1 ? args.slice(1) : null);
    };
}

/**
 * Get violations (for Cerberus to track)
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

// Auto-override on load
overrideConsole();

module.exports = {
    overrideConsole,
    getViolations,
    clearViolations,
    originalConsole
};
