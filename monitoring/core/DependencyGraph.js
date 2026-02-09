/**
 * Dependency Graph - Map relationships between components
 * 
 * BrokenPromise uses dependency graphs to understand cascading failures and trace impact.
 * When one component fails, we can trace which other components are affected.
 * 
 * This helps BrokenPromise understand:
 * - What to check first when an issue is detected
 * - What other components might be affected by a failure
 * - Root causes of cascading failures
 */

const EventEmitter = require('events');
const gameLogger = require('../../src/utils/GameLogger');

class DependencyGraph extends EventEmitter {
    constructor(stateStore, issueDetector) {
        super();
        this.stateStore = stateStore;
        this.issueDetector = issueDetector;
        
        // Dependency graph: component -> [dependencies]
        this.dependencies = new Map();
        
        // Reverse graph: component -> [dependents] (who depends on this)
        this.dependents = new Map();
        
        // Component health tracking
        this.componentHealth = new Map(); // component -> { status, lastCheck, failures }
        
        // Initialize graph
        this.buildGraph();
        
        // Start health monitoring
        this.startHealthMonitoring();
    }
    
    /**
     * Build dependency graph
     */
    buildGraph() {
        // ============ CORE COMPONENTS ============
        
        // StateStore - foundation, no dependencies
        this.addComponent('stateStore', {
            name: 'StateStore',
            description: 'Single source of truth for all state',
            dependencies: [],
            critical: true
        });
        
        // AILogProcessor - depends on StateStore
        this.addComponent('logProcessor', {
            name: 'AILogProcessor',
            description: 'Processes and understands all logs',
            dependencies: ['stateStore'],
            critical: true
        });
        
        // AIIssueDetector - depends on StateStore and LogProcessor
        this.addComponent('issueDetector', {
            name: 'AIIssueDetector',
            description: 'Detects issues using multiple methods',
            dependencies: ['stateStore', 'logProcessor'],
            critical: true
        });
        
        // AIFixTracker - depends on StateStore and IssueDetector
        this.addComponent('fixTracker', {
            name: 'AIFixTracker',
            description: 'Tracks fix attempts and learns what works',
            dependencies: ['stateStore', 'issueDetector'],
            critical: true
        });
        
        // AILearningEngine - depends on StateStore, IssueDetector, and FixTracker
        this.addComponent('learningEngine', {
            name: 'AILearningEngine',
            description: 'Learns from patterns and predicts issues',
            dependencies: ['stateStore', 'issueDetector', 'fixTracker'],
            critical: true
        });
        
        // AIDecisionEngine - depends on StateStore, IssueDetector, and FixTracker
        this.addComponent('decisionEngine', {
            name: 'AIDecisionEngine',
            description: 'Makes all decisions automatically',
            dependencies: ['stateStore', 'issueDetector', 'fixTracker'],
            critical: true
        });
        
        // ============ GAME COMPONENTS ============
        
        // GameManager - depends on StateStore
        this.addComponent('gameManager', {
            name: 'GameManager',
            description: 'Manages game state and tables',
            dependencies: ['stateStore'],
            critical: true
        });
        
        // Table - depends on GameManager
        this.addComponent('table', {
            name: 'Table',
            description: 'Individual poker table',
            dependencies: ['gameManager'],
            critical: true
        });
        
        // Player - depends on GameManager and Table
        this.addComponent('player', {
            name: 'Player',
            description: 'Player in the game',
            dependencies: ['gameManager', 'table'],
            critical: true
        });
        
        // ============ SYSTEM COMPONENTS ============
        
        // SocketHandler - depends on GameManager
        this.addComponent('socketHandler', {
            name: 'SocketHandler',
            description: 'Handles WebSocket connections',
            dependencies: ['gameManager'],
            critical: true
        });
        
        // Database - foundation, no dependencies
        this.addComponent('database', {
            name: 'Database',
            description: 'MySQL database',
            dependencies: [],
            critical: true
        });
        
        // UserRepository - depends on Database
        this.addComponent('userRepository', {
            name: 'UserRepository',
            description: 'User data access',
            dependencies: ['database'],
            critical: true
        });
        
        // ============ MONITORING COMPONENTS ============
        
        // ServerStateCapture - depends on StateStore and IssueDetector
        this.addComponent('serverStateCapture', {
            name: 'ServerStateCapture',
            description: 'Captures server health and metrics',
            dependencies: ['stateStore', 'issueDetector'],
            critical: false
        });
        
        // UnityStateReporter - depends on StateStore and IssueDetector
        this.addComponent('unityStateReporter', {
            name: 'UnityStateReporter',
            description: 'Receives and verifies Unity state',
            dependencies: ['stateStore', 'issueDetector'],
            critical: false
        });
        
        // StateVerificationContracts - depends on StateStore and IssueDetector
        this.addComponent('stateVerificationContracts', {
            name: 'StateVerificationContracts',
            description: 'Defines what correct state looks like',
            dependencies: ['stateStore', 'issueDetector'],
            critical: true
        });
        
        // ErrorRecovery - depends on StateStore
        this.addComponent('errorRecovery', {
            name: 'ErrorRecovery',
            description: 'Self-healing system',
            dependencies: ['stateStore'],
            critical: true
        });
        
        // PerformanceMonitor - depends on StateStore
        this.addComponent('performanceMonitor', {
            name: 'PerformanceMonitor',
            description: 'Monitors performance metrics',
            dependencies: ['stateStore'],
            critical: false
        });
    }
    
    /**
     * Add component to graph
     */
    addComponent(id, config) {
        this.dependencies.set(id, {
            id,
            ...config,
            status: 'healthy',
            lastCheck: Date.now(),
            failures: 0
        });
        
        // Build reverse graph (dependents)
        for (const dep of config.dependencies || []) {
            if (!this.dependents.has(dep)) {
                this.dependents.set(dep, []);
            }
            this.dependents.get(dep).push(id);
        }
        
        // Initialize health tracking
        this.componentHealth.set(id, {
            status: 'healthy',
            lastCheck: Date.now(),
            failures: 0,
            lastFailure: null
        });
    }
    
    /**
     * Get component dependencies
     */
    getDependencies(componentId) {
        const component = this.dependencies.get(componentId);
        if (!component) {
            return [];
        }
        return component.dependencies || [];
    }
    
    /**
     * Get component dependents (who depends on this)
     */
    getDependents(componentId) {
        return this.dependents.get(componentId) || [];
    }
    
    /**
     * Trace impact of component failure
     */
    traceImpact(componentId) {
        const impact = {
            component: componentId,
            directDependents: this.getDependents(componentId),
            allAffected: [],
            criticalPath: []
        };
        
        // Recursively find all affected components
        const visited = new Set();
        const queue = [componentId];
        
        while (queue.length > 0) {
            const current = queue.shift();
            if (visited.has(current)) continue;
            visited.add(current);
            
            const dependents = this.getDependents(current);
            for (const dependent of dependents) {
                if (!visited.has(dependent)) {
                    impact.allAffected.push(dependent);
                    queue.push(dependent);
                }
            }
        }
        
        // Find critical path (components that are critical)
        for (const affected of impact.allAffected) {
            const component = this.dependencies.get(affected);
            if (component && component.critical) {
                impact.criticalPath.push(affected);
            }
        }
        
        return impact;
    }
    
    /**
     * Find root cause of cascading failure
     */
    findRootCause(componentId) {
        const component = this.dependencies.get(componentId);
        if (!component) {
            return null;
        }
        
        // Check if any dependencies are failing
        const failingDependencies = [];
        for (const dep of component.dependencies || []) {
            const depHealth = this.componentHealth.get(dep);
            if (depHealth && depHealth.status !== 'healthy') {
                failingDependencies.push({
                    component: dep,
                    status: depHealth.status,
                    lastFailure: depHealth.lastFailure
                });
            }
        }
        
        if (failingDependencies.length > 0) {
            // This component is failing because its dependencies are failing
            // Recursively find root cause
            const rootCauses = [];
            for (const failingDep of failingDependencies) {
                const rootCause = this.findRootCause(failingDep.component);
                if (rootCause) {
                    rootCauses.push(rootCause);
                } else {
                    rootCauses.push(failingDep);
                }
            }
            return {
                component: componentId,
                reason: 'dependency_failure',
                failingDependencies,
                rootCauses
            };
        }
        
        // No failing dependencies - this is the root cause
        return {
            component: componentId,
            reason: 'direct_failure',
            status: this.componentHealth.get(componentId)?.status
        };
    }
    
    /**
     * Mark component as failed
     */
    markFailed(componentId, error) {
        const health = this.componentHealth.get(componentId);
        if (health) {
            health.status = 'failed';
            health.failures++;
            health.lastFailure = Date.now();
            health.lastError = error;
        }
        
        // Trace impact
        const impact = this.traceImpact(componentId);
        
        // Report to issue detector
        if (this.issueDetector) {
            this.issueDetector.detectIssue({
                type: 'COMPONENT_FAILURE',
                severity: 'critical',
                method: 'dependencyGraph',
                details: {
                    component: componentId,
                    error: error?.message || 'Unknown error',
                    impact: {
                        directDependents: impact.directDependents.length,
                        allAffected: impact.allAffected.length,
                        criticalPath: impact.criticalPath
                    }
                },
                timestamp: Date.now()
            });
        }
        
        // Emit event
        this.emit('componentFailed', {
            component: componentId,
            impact,
            rootCause: this.findRootCause(componentId)
        });
    }
    
    /**
     * Mark component as healthy
     */
    markHealthy(componentId) {
        const health = this.componentHealth.get(componentId);
        if (health) {
            health.status = 'healthy';
            health.lastCheck = Date.now();
        }
    }
    
    /**
     * Start health monitoring
     */
    startHealthMonitoring() {
        // Monitor component health every 5 seconds
        this.healthMonitoringInterval = setInterval(() => {
            this.checkComponentHealth();
        }, 5000);
    }
    
    /**
     * Stop health monitoring
     */
    stopHealthMonitoring() {
        if (this.healthMonitoringInterval) {
            clearInterval(this.healthMonitoringInterval);
            this.healthMonitoringInterval = null;
        }
    }
    
    /**
     * Check component health
     */
    checkComponentHealth() {
        const state = this.stateStore.getState();
        
        // Check system components
        const system = state.system || {};
        
        // Database health
        if (system.database) {
            if (system.database.status === 'connected') {
                this.markHealthy('database');
            } else {
                this.markFailed('database', new Error('Database not connected'));
            }
        }
        
        // Server health
        if (system.server) {
            if (system.server.status === 'running' && system.server.health > 50) {
                this.markHealthy('socketHandler');
            } else {
                this.markFailed('socketHandler', new Error('Server unhealthy'));
            }
        }
        
        // Update health timestamps
        for (const [componentId, health] of this.componentHealth.entries()) {
            health.lastCheck = Date.now();
        }
    }
    
    /**
     * Get dependency graph statistics
     */
    getStatistics() {
        const stats = {
            totalComponents: this.dependencies.size,
            healthy: 0,
            failed: 0,
            critical: 0,
            components: []
        };
        
        for (const [componentId, component] of this.dependencies.entries()) {
            const health = this.componentHealth.get(componentId);
            const status = health?.status || 'unknown';
            
            if (status === 'healthy') stats.healthy++;
            if (status === 'failed') stats.failed++;
            if (component.critical) stats.critical++;
            
            stats.components.push({
                id: componentId,
                name: component.name,
                status,
                critical: component.critical,
                dependencies: component.dependencies.length,
                dependents: this.getDependents(componentId).length,
                failures: health?.failures || 0
            });
        }
        
        return stats;
    }
    
    /**
     * Get component dependency chain
     */
    getDependencyChain(componentId) {
        const chain = [];
        const visited = new Set();
        
        const traverse = (id, depth = 0) => {
            if (visited.has(id)) return;
            visited.add(id);
            
            const component = this.dependencies.get(id);
            if (component) {
                chain.push({
                    component: id,
                    name: component.name,
                    depth,
                    critical: component.critical
                });
                
                for (const dep of component.dependencies || []) {
                    traverse(dep, depth + 1);
                }
            }
        };
        
        traverse(componentId);
        return chain;
    }
}

module.exports = DependencyGraph;
