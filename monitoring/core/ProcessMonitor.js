/**
 * Process Monitor - Detects Resource Leaks and Zombie Processes
 * 
 * Cerberus monitors Node.js processes to detect:
 * - Zombie processes (should have exited but didn't)
 * - Interval leaks (intervals not being cleared)
 * - Memory leaks (processes consuming too much memory)
 * - Process accumulation (too many processes running)
 * 
 * This prevents the system from accumulating zombie processes.
 */

const EventEmitter = require('events');
const { exec } = require('child_process');
const gameLogger = require('../../src/utils/GameLogger');

class ProcessMonitor extends EventEmitter {
    constructor(stateStore, issueDetector) {
        super();
        this.stateStore = stateStore;
        this.issueDetector = issueDetector;
        
        // Process tracking
        this.processHistory = []; // Track process counts over time
        this.maxHistorySize = 100;
        this.processSnapshots = new Map(); // pid -> { startTime, command, memory, cpu }
        
        // Thresholds
        this.maxProcesses = 5; // Alert if more than 5 Node.js processes
        this.maxMemoryPerProcess = 500 * 1024 * 1024; // 500MB per process
        this.maxProcessAge = 30 * 60 * 1000; // 30 minutes - processes older than this are suspicious
        
        // Interval tracking (to detect leaks)
        this.knownIntervals = new Set(); // Track interval IDs we know about
        this.intervalLeaks = []; // Track suspected interval leaks
        
        // Monitoring
        this.monitoringInterval = null;
        this.monitoringActive = false;
        
        // Start monitoring
        this.startMonitoring();
    }
    
    /**
     * Start monitoring processes
     */
    startMonitoring() {
        if (this.monitoringActive) return;
        
        this.monitoringActive = true;
        
        // Monitor every 30 seconds
        this.monitoringInterval = setInterval(() => {
            this.checkProcesses();
        }, 30000);
        
        // Initial check
        this.checkProcesses();
    }
    
    /**
     * Stop monitoring
     */
    stopMonitoring() {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }
        this.monitoringActive = false;
    }
    
    /**
     * Check for process issues
     */
    async checkProcesses() {
        try {
            const processes = await this.getNodeProcesses();
            const processCount = processes.length;
            
            // Track process count over time
            this.processHistory.push({
                timestamp: Date.now(),
                count: processCount,
                processes: processes.map(p => ({
                    pid: p.pid,
                    memory: p.memory,
                    cpu: p.cpu,
                    startTime: p.startTime
                }))
            });
            
            if (this.processHistory.length > this.maxHistorySize) {
                this.processHistory.shift();
            }
            
            // Update snapshots
            for (const proc of processes) {
                if (!this.processSnapshots.has(proc.pid)) {
                    // New process detected
                    this.processSnapshots.set(proc.pid, {
                        startTime: proc.startTime,
                        command: proc.command,
                        firstSeen: Date.now(),
                        memory: proc.memory,
                        cpu: proc.cpu
                    });
                } else {
                    // Update existing
                    const snapshot = this.processSnapshots.get(proc.pid);
                    snapshot.memory = proc.memory;
                    snapshot.cpu = proc.cpu;
                    snapshot.lastSeen = Date.now();
                }
            }
            
            // Remove processes that no longer exist
            const currentPids = new Set(processes.map(p => p.pid));
            for (const [pid, snapshot] of this.processSnapshots.entries()) {
                if (!currentPids.has(pid)) {
                    this.processSnapshots.delete(pid);
                }
            }
            
            // Check for issues
            this.detectIssues(processes);
            
            // Save state
            this.save();
            
        } catch (error) {
            gameLogger.error('CERBERUS', '[PROCESS_MONITOR] Check processes error', {
                error: error.message
            });
        }
    }
    
    /**
     * Get all Node.js processes
     */
    async getNodeProcesses() {
        return new Promise((resolve, reject) => {
            if (process.platform === 'win32') {
                // Windows: Use PowerShell to get processes
                exec('powershell -Command "Get-Process node -ErrorAction SilentlyContinue | Select-Object Id, @{Name=\'Memory\';Expression={$_.WorkingSet64}}, @{Name=\'CPU\';Expression={$_.CPU}}, StartTime | ConvertTo-Json"', 
                    { timeout: 5000 },
                    (error, stdout, stderr) => {
                        if (error) {
                            resolve([]);
                            return;
                        }
                        
                        try {
                            const data = JSON.parse(stdout);
                            const processes = Array.isArray(data) ? data : [data];
                            resolve(processes.map(p => ({
                                pid: p.Id,
                                memory: p.Memory || 0,
                                cpu: p.CPU || 0,
                                startTime: p.StartTime ? new Date(p.StartTime) : new Date(),
                                command: 'node'
                            })));
                        } catch (parseError) {
                            resolve([]);
                        }
                    });
            } else {
                // Unix: Use ps command
                exec('ps -eo pid,rss,pcpu,etime,comm | grep node | grep -v grep', 
                    { timeout: 5000 },
                    (error, stdout, stderr) => {
                        if (error) {
                            resolve([]);
                            return;
                        }
                        
                        const processes = [];
                        const lines = stdout.trim().split('\n');
                        for (const line of lines) {
                            const parts = line.trim().split(/\s+/);
                            if (parts.length >= 4) {
                                processes.push({
                                    pid: parseInt(parts[0]),
                                    memory: parseInt(parts[1]) * 1024, // Convert KB to bytes
                                    cpu: parseFloat(parts[2]) || 0,
                                    startTime: new Date(), // Unix ps doesn't give exact start time easily
                                    command: parts.slice(4).join(' ')
                                });
                            }
                        }
                        resolve(processes);
                    });
            }
        });
    }
    
    /**
     * Detect process issues
     */
    detectIssues(processes) {
        const issues = [];
        
        // Check for too many processes
        if (processes.length > this.maxProcesses) {
            issues.push({
                type: 'TOO_MANY_PROCESSES',
                severity: 'high',
                message: `Too many Node.js processes running: ${processes.length} (max: ${this.maxProcesses})`,
                count: processes.length,
                maxAllowed: this.maxProcesses,
                processes: processes.map(p => ({
                    pid: p.pid,
                    memory: Math.round(p.memory / 1024 / 1024) + 'MB',
                    age: this.getProcessAge(p)
                }))
            });
        }
        
        // Check for zombie processes (old processes that should have exited)
        const now = Date.now();
        for (const proc of processes) {
            const snapshot = this.processSnapshots.get(proc.pid);
            if (snapshot) {
                const age = now - snapshot.firstSeen;
                
                // Check if process is suspiciously old
                if (age > this.maxProcessAge) {
                    // Check if it's a test/CLI process (should exit quickly)
                    const isTestProcess = snapshot.command && (
                        snapshot.command.includes('test-') ||
                        snapshot.command.includes('cerberus-integration.js') ||
                        snapshot.command.includes('test-simple.js')
                    );
                    
                    if (isTestProcess) {
                        issues.push({
                            type: 'ZOMBIE_PROCESS',
                            severity: 'high',
                            message: `Zombie process detected: PID ${proc.pid} (age: ${Math.round(age / 1000 / 60)} minutes)`,
                            pid: proc.pid,
                            age: age,
                            command: snapshot.command,
                            memory: Math.round(proc.memory / 1024 / 1024) + 'MB'
                        });
                    }
                }
                
                // Check for high memory usage
                if (proc.memory > this.maxMemoryPerProcess) {
                    issues.push({
                        type: 'HIGH_MEMORY_USAGE',
                        severity: 'medium',
                        message: `Process ${proc.pid} using excessive memory: ${Math.round(proc.memory / 1024 / 1024)}MB`,
                        pid: proc.pid,
                        memory: proc.memory,
                        maxAllowed: this.maxMemoryPerProcess
                    });
                }
            }
        }
        
        // Check for process accumulation (processes increasing over time)
        if (this.processHistory.length >= 5) {
            const recent = this.processHistory.slice(-5);
            const older = this.processHistory.slice(-10, -5);
            
            if (older.length > 0) {
                const recentAvg = recent.reduce((sum, h) => sum + h.count, 0) / recent.length;
                const olderAvg = older.reduce((sum, h) => sum + h.count, 0) / older.length;
                
                if (recentAvg > olderAvg * 1.5) {
                    issues.push({
                        type: 'PROCESS_ACCUMULATION',
                        severity: 'high',
                        message: `Process count increasing: ${Math.round(olderAvg)} -> ${Math.round(recentAvg)}`,
                        recentAverage: recentAvg,
                        previousAverage: olderAvg,
                        increase: Math.round(((recentAvg - olderAvg) / olderAvg) * 100) + '%'
                    });
                }
            }
        }
        
        // Report issues to issue detector
        for (const issue of issues) {
            if (this.issueDetector) {
                this.issueDetector.detectIssue({
                    type: issue.type,
                    severity: issue.severity,
                    method: 'processMonitor',
                    details: issue
                });
            }
            
            // Emit event
            this.emit('processIssue', issue);
            
            // Log
            gameLogger.warn('CERBERUS', '[PROCESS_MONITOR] Process issue detected', issue);
        }
    }
    
    /**
     * Get process age in milliseconds
     */
    getProcessAge(process) {
        const snapshot = this.processSnapshots.get(process.pid);
        if (snapshot && snapshot.firstSeen) {
            return Date.now() - snapshot.firstSeen;
        }
        return 0;
    }
    
    /**
     * Register an interval (so we can track if it's cleaned up)
     */
    registerInterval(intervalId, component, description) {
        this.knownIntervals.add(intervalId);
        
        // Store interval info
        const intervalInfo = {
            id: intervalId,
            component,
            description,
            createdAt: Date.now(),
            cleared: false
        };
        
        this.stateStore.updateState(`process.intervals.${intervalId}`, intervalInfo);
    }
    
    /**
     * Unregister an interval (when it's cleared)
     */
    unregisterInterval(intervalId) {
        this.knownIntervals.delete(intervalId);
        
        const intervalInfo = this.stateStore.getState(`process.intervals.${intervalId}`);
        if (intervalInfo) {
            intervalInfo.cleared = true;
            intervalInfo.clearedAt = Date.now();
            this.stateStore.updateState(`process.intervals.${intervalId}`, intervalInfo);
        }
    }
    
    /**
     * Check for interval leaks (intervals that were created but never cleared)
     */
    checkIntervalLeaks() {
        const allIntervals = this.stateStore.getState('process.intervals') || {};
        const leaks = [];
        
        const now = Date.now();
        const maxIntervalAge = 5 * 60 * 1000; // 5 minutes
        
        for (const [intervalId, info] of Object.entries(allIntervals)) {
            if (!info.cleared) {
                const age = now - info.createdAt;
                
                // If interval is old and not cleared, it's a leak
                if (age > maxIntervalAge) {
                    leaks.push({
                        intervalId,
                        component: info.component,
                        description: info.description,
                        age: age,
                        createdAt: info.createdAt
                    });
                }
            }
        }
        
        if (leaks.length > 0) {
            const issue = {
                type: 'INTERVAL_LEAK',
                severity: 'high',
                message: `${leaks.length} interval leak(s) detected - intervals created but never cleared`,
                leaks: leaks
            };
            
            if (this.issueDetector) {
                this.issueDetector.detectIssue({
                    type: 'INTERVAL_LEAK',
                    severity: 'high',
                    method: 'processMonitor',
                    details: issue
                });
            }
            
            this.emit('intervalLeak', issue);
            
            gameLogger.warn('CERBERUS', '[PROCESS_MONITOR] Interval leak detected', issue);
        }
        
        return leaks;
    }
    
    /**
     * Get process report
     */
    getProcessReport() {
        const currentProcesses = Array.from(this.processSnapshots.values());
        const processCount = currentProcesses.length;
        
        // Calculate statistics
        const totalMemory = currentProcesses.reduce((sum, p) => sum + (p.memory || 0), 0);
        const avgMemory = processCount > 0 ? totalMemory / processCount : 0;
        const maxMemory = currentProcesses.length > 0 ? Math.max(...currentProcesses.map(p => p.memory || 0)) : 0;
        
        // Check for issues
        const issues = [];
        if (processCount > this.maxProcesses) {
            issues.push(`Too many processes: ${processCount} (max: ${this.maxProcesses})`);
        }
        
        const zombieProcesses = currentProcesses.filter(p => {
            const age = Date.now() - (p.firstSeen || Date.now());
            return age > this.maxProcessAge;
        });
        
        if (zombieProcesses.length > 0) {
            issues.push(`${zombieProcesses.length} zombie process(es) detected`);
        }
        
        // Check interval leaks
        const intervalLeaks = this.checkIntervalLeaks();
        if (intervalLeaks.length > 0) {
            issues.push(`${intervalLeaks.length} interval leak(s) detected`);
        }
        
        return {
            timestamp: Date.now(),
            processCount,
            totalMemory: Math.round(totalMemory / 1024 / 1024) + 'MB',
            avgMemory: Math.round(avgMemory / 1024 / 1024) + 'MB',
            maxMemory: Math.round(maxMemory / 1024 / 1024) + 'MB',
            processes: currentProcesses.map(p => ({
                pid: p.pid || 'unknown',
                memory: Math.round((p.memory || 0) / 1024 / 1024) + 'MB',
                age: Math.round((Date.now() - (p.firstSeen || Date.now())) / 1000 / 60) + ' minutes',
                command: p.command || 'unknown'
            })),
            issues,
            intervalLeaks: intervalLeaks.length,
            history: {
                recent: this.processHistory.slice(-10).map(h => ({
                    timestamp: h.timestamp,
                    count: h.count
                }))
            }
        };
    }
    
    /**
     * Save state
     */
    save() {
        try {
            this.stateStore.updateState('process.monitor.history', this.processHistory.slice(-50));
            this.stateStore.updateState('process.monitor.snapshots', Object.fromEntries(this.processSnapshots));
        } catch (error) {
            gameLogger.error('CERBERUS', '[PROCESS_MONITOR] Save error', {
                error: error.message
            });
        }
    }
    
    /**
     * Load state
     */
    load() {
        try {
            const savedHistory = this.stateStore.getState('process.monitor.history') || [];
            this.processHistory = savedHistory.slice(-this.maxHistorySize);
            
            const savedSnapshots = this.stateStore.getState('process.monitor.snapshots') || {};
            this.processSnapshots = new Map(Object.entries(savedSnapshots));
        } catch (error) {
            // Ignore load errors
        }
    }
}

module.exports = ProcessMonitor;
