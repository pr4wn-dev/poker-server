/**
 * Performance Monitoring System
 * 
 * Tracks operation timing, memory usage, CPU usage, and performance metrics
 * AI can identify bottlenecks and optimize performance
 */

const EventEmitter = require('events');
const os = require('os');

class PerformanceMonitor extends EventEmitter {
    constructor(stateStore) {
        super();
        this.stateStore = stateStore;
        this.operationTimings = new Map(); // operation -> [timings]
        this.maxTimingsPerOperation = 1000;
        this.memoryHistory = []; // Keep last 100 memory snapshots
        this.cpuHistory = []; // Keep last 100 CPU snapshots
        this.maxHistorySize = 100;
        this.performanceThresholds = {
            slowOperation: 1000, // 1 second
            verySlowOperation: 5000, // 5 seconds
            highMemoryUsage: 0.8, // 80% of total memory
            highCpuUsage: 0.8 // 80% CPU
        };
        
        // Start monitoring
        this.startMonitoring();
    }
    
    /**
     * Start monitoring system resources
     */
    startMonitoring() {
        // Monitor memory and CPU every 5 seconds
        this.monitorInterval = setInterval(() => {
            this.captureSystemMetrics();
        }, 5000);
        
        // Initial capture
        this.captureSystemMetrics();
    }
    
    /**
     * Stop monitoring
     */
    stop() {
        if (this.monitorInterval) {
            clearInterval(this.monitorInterval);
            this.monitorInterval = null;
        }
    }
    
    /**
     * Capture system metrics
     */
    captureSystemMetrics() {
        const memory = process.memoryUsage();
        const totalMemory = os.totalmem();
        const freeMemory = os.freemem();
        const usedMemory = totalMemory - freeMemory;
        const memoryUsage = usedMemory / totalMemory;
        
        // CPU usage (simplified - Node.js doesn't have built-in CPU usage)
        const cpuUsage = process.cpuUsage();
        const cpuPercent = (cpuUsage.user + cpuUsage.system) / 1000000; // Convert to seconds
        
        const metrics = {
            timestamp: Date.now(),
            memory: {
                heapUsed: memory.heapUsed,
                heapTotal: memory.heapTotal,
                rss: memory.rss,
                external: memory.external,
                arrayBuffers: memory.arrayBuffers,
                total: totalMemory,
                free: freeMemory,
                used: usedMemory,
                usagePercent: memoryUsage
            },
            cpu: {
                user: cpuUsage.user,
                system: cpuUsage.system,
                percent: cpuPercent
            }
        };
        
        // Add to history
        this.memoryHistory.push({
            timestamp: metrics.timestamp,
            heapUsed: metrics.memory.heapUsed,
            heapTotal: metrics.memory.heapTotal,
            rss: metrics.memory.rss,
            usagePercent: metrics.memory.usagePercent
        });
        
        this.cpuHistory.push({
            timestamp: metrics.timestamp,
            user: metrics.cpu.user,
            system: metrics.cpu.system,
            percent: metrics.cpu.percent
        });
        
        // Keep only last N entries
        if (this.memoryHistory.length > this.maxHistorySize) {
            this.memoryHistory.shift();
        }
        if (this.cpuHistory.length > this.maxHistorySize) {
            this.cpuHistory.shift();
        }
        
        // Update state store
        this.stateStore.updateState('system.performance', {
            current: metrics,
            memoryHistory: this.memoryHistory.slice(-20), // Last 20
            cpuHistory: this.cpuHistory.slice(-20), // Last 20
            timestamp: Date.now()
        });
        
        // Check thresholds
        this.checkThresholds(metrics);
        
        this.emit('metrics', metrics);
    }
    
    /**
     * Check performance thresholds
     */
    checkThresholds(metrics) {
        // Check memory usage
        if (metrics.memory.usagePercent > this.performanceThresholds.highMemoryUsage) {
            this.emit('highMemoryUsage', {
                usagePercent: metrics.memory.usagePercent,
                threshold: this.performanceThresholds.highMemoryUsage,
                metrics
            });
        }
        
        // Check CPU usage (simplified)
        if (metrics.cpu.percent > this.performanceThresholds.highCpuUsage) {
            this.emit('highCpuUsage', {
                usagePercent: metrics.cpu.percent,
                threshold: this.performanceThresholds.highCpuUsage,
                metrics
            });
        }
    }
    
    /**
     * Time an operation
     */
    async timeOperation(operationName, operation) {
        const startTime = process.hrtime.bigint();
        const startMemory = process.memoryUsage().heapUsed;
        
        try {
            const result = await operation();
            const endTime = process.hrtime.bigint();
            const endMemory = process.memoryUsage().heapUsed;
            
            const duration = Number(endTime - startTime) / 1000000; // Convert to milliseconds
            const memoryDelta = endMemory - startMemory;
            
            this.recordTiming(operationName, duration, memoryDelta);
            
            // Check if operation is slow
            if (duration > this.performanceThresholds.verySlowOperation) {
                this.emit('verySlowOperation', {
                    operation: operationName,
                    duration,
                    threshold: this.performanceThresholds.verySlowOperation
                });
            } else if (duration > this.performanceThresholds.slowOperation) {
                this.emit('slowOperation', {
                    operation: operationName,
                    duration,
                    threshold: this.performanceThresholds.slowOperation
                });
            }
            
            return result;
        } catch (error) {
            const endTime = process.hrtime.bigint();
            const duration = Number(endTime - startTime) / 1000000;
            
            this.recordTiming(operationName, duration, 0, error);
            throw error;
        }
    }
    
    /**
     * Record operation timing
     */
    recordTiming(operationName, duration, memoryDelta = 0, error = null) {
        const timings = this.operationTimings.get(operationName) || [];
        
        timings.push({
            duration,
            memoryDelta,
            error: error ? error.message : null,
            timestamp: Date.now()
        });
        
        // Keep only last N timings
        if (timings.length > this.maxTimingsPerOperation) {
            timings.shift();
        }
        
        this.operationTimings.set(operationName, timings);
        
        // Update state store
        const stats = this.getOperationStats(operationName);
        this.stateStore.updateState(`system.performance.operations.${operationName}`, {
            stats,
            recent: timings.slice(-10) // Last 10
        });
    }
    
    /**
     * Get operation statistics
     */
    getOperationStats(operationName) {
        const timings = this.operationTimings.get(operationName) || [];
        
        if (timings.length === 0) {
            return {
                count: 0,
                avgDuration: 0,
                minDuration: 0,
                maxDuration: 0,
                errorRate: 0
            };
        }
        
        const durations = timings.map(t => t.duration);
        const errors = timings.filter(t => t.error !== null);
        
        return {
            count: timings.length,
            avgDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
            minDuration: Math.min(...durations),
            maxDuration: Math.max(...durations),
            errorRate: errors.length / timings.length,
            lastDuration: timings[timings.length - 1].duration,
            lastError: timings[timings.length - 1].error
        };
    }
    
    /**
     * Get all operation statistics
     */
    getAllOperationStats() {
        const stats = {};
        for (const operationName of this.operationTimings.keys()) {
            stats[operationName] = this.getOperationStats(operationName);
        }
        return stats;
    }
    
    /**
     * Get performance report
     */
    getPerformanceReport() {
        return {
            system: {
                memory: this.memoryHistory[this.memoryHistory.length - 1] || null,
                cpu: this.cpuHistory[this.cpuHistory.length - 1] || null,
                memoryHistory: this.memoryHistory.slice(-20),
                cpuHistory: this.cpuHistory.slice(-20)
            },
            operations: this.getAllOperationStats(),
            thresholds: this.performanceThresholds,
            timestamp: Date.now()
        };
    }
}

module.exports = PerformanceMonitor;
