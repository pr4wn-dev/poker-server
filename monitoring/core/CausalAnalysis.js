/**
 * Causal Analysis - Trace state changes backwards, build causal chains
 * 
 * Cerberus traces state changes backwards to find root causes.
 * Builds causal chains to understand how issues propagate.
 * 
 * Features:
 * - Traces state changes backwards
 * - Builds causal chains
 * - Finds root causes
 * - Understands issue propagation
 */

const EventEmitter = require('events');
const gameLogger = require('../../src/utils/GameLogger');

class CausalAnalysis extends EventEmitter {
    constructor(stateStore, issueDetector, dependencyGraph) {
        super();
        this.stateStore = stateStore;
        this.issueDetector = issueDetector;
        this.dependencyGraph = dependencyGraph;
        
        // State change history
        this.stateHistory = []; // { timestamp, path, oldValue, newValue, trigger }
        this.maxHistorySize = 10000;
        
        // Causal chains
        this.causalChains = new Map(); // issueId -> [causal chain]
        
        // Root cause analysis
        this.rootCauses = new Map(); // issueId -> rootCause
        
        // Start tracking state changes
        this.startTracking();
    }
    
    /**
     * Start tracking state changes
     */
    startTracking() {
        // Listen to state store changes
        this.stateStore.on('stateChanged', (data) => {
            this.recordStateChange(data);
        });
        
        // Listen to issue detection
        this.issueDetector.on('issueDetected', (issue) => {
            this.analyzeIssue(issue);
        });
    }
    
    /**
     * Record state change
     */
    recordStateChange(data) {
        const change = {
            timestamp: Date.now(),
            path: data.path,
            oldValue: data.oldValue,
            newValue: data.newValue,
            trigger: data.trigger || 'unknown'
        };
        
        // Add to history
        this.stateHistory.push(change);
        if (this.stateHistory.length > this.maxHistorySize) {
            this.stateHistory.shift();
        }
    }
    
    /**
     * Analyze issue and find root cause
     */
    analyzeIssue(issue) {
        // Trace backwards to find root cause
        const causalChain = this.traceBackwards(issue);
        
        // Store causal chain
        this.causalChains.set(issue.id, causalChain);
        
        // Find root cause
        const rootCause = this.findRootCause(issue, causalChain);
        
        if (rootCause) {
            this.rootCauses.set(issue.id, rootCause);
            
            // Report root cause
            this.reportRootCause(issue, rootCause, causalChain);
        }
    }
    
    /**
     * Trace backwards from issue to find causal chain
     */
    traceBackwards(issue) {
        const chain = [];
        const visited = new Set();
        const timeWindow = 60000; // Look back 1 minute
        
        // Start from issue timestamp
        const issueTime = issue.timestamp || issue.firstSeen || Date.now();
        const cutoffTime = issueTime - timeWindow;
        
        // Get relevant state changes
        const relevantChanges = this.stateHistory.filter(change => 
            change.timestamp >= cutoffTime && 
            change.timestamp <= issueTime
        );
        
        // Sort by timestamp (oldest first)
        relevantChanges.sort((a, b) => a.timestamp - b.timestamp);
        
        // Build causal chain
        for (const change of relevantChanges) {
            // Check if this change could have caused the issue
            if (this.isRelated(change, issue)) {
                chain.push({
                    timestamp: change.timestamp,
                    path: change.path,
                    oldValue: change.oldValue,
                    newValue: change.newValue,
                    trigger: change.trigger,
                    relationship: this.determineRelationship(change, issue)
                });
            }
        }
        
        return chain;
    }
    
    /**
     * Check if state change is related to issue
     */
    isRelated(change, issue) {
        // Check if change path matches issue details
        const issueDetails = issue.details || {};
        
        // Direct path match
        if (issueDetails.path && change.path === issueDetails.path) {
            return true;
        }
        
        // Component match
        if (issueDetails.component) {
            const changeComponent = this.extractComponent(change.path);
            if (changeComponent === issue.details.component) {
                return true;
            }
        }
        
        // Table match
        if (issueDetails.tableId) {
            if (change.path.includes(issueDetails.tableId)) {
                return true;
            }
        }
        
        // Player match
        if (issueDetails.playerId) {
            if (change.path.includes(issueDetails.playerId)) {
                return true;
            }
        }
        
        // Dependency match (if dependency graph available)
        if (this.dependencyGraph && issueDetails.component) {
            const dependents = this.dependencyGraph.getDependents(issueDetails.component);
            const changeComponent = this.extractComponent(change.path);
            if (dependents.includes(changeComponent)) {
                return true;
            }
        }
        
        return false;
    }
    
    /**
     * Extract component from state path
     */
    extractComponent(path) {
        if (!path) return null;
        
        // Path format: "game.tables.table123.seats.0.chips"
        // Extract component: "table" or "player" or "game"
        const parts = path.split('.');
        if (parts.length > 0) {
            return parts[0]; // First part is usually the component
        }
        return null;
    }
    
    /**
     * Determine relationship between change and issue
     */
    determineRelationship(change, issue) {
        // Direct cause: change directly caused issue
        if (change.path === issue.details?.path) {
            return 'direct';
        }
        
        // Dependency cause: change in dependency caused issue
        if (this.dependencyGraph) {
            const changeComponent = this.extractComponent(change.path);
            const issueComponent = issue.details?.component;
            
            if (changeComponent && issueComponent) {
                const dependents = this.dependencyGraph.getDependents(changeComponent);
                if (dependents.includes(issueComponent)) {
                    return 'dependency';
                }
            }
        }
        
        // Indirect cause: change indirectly related
        return 'indirect';
    }
    
    /**
     * Find root cause from causal chain
     */
    findRootCause(issue, causalChain) {
        if (causalChain.length === 0) {
            return null;
        }
        
        // Root cause is the first (oldest) change in the chain
        const rootChange = causalChain[0];
        
        // Check if root change has dependencies
        if (this.dependencyGraph) {
            const rootComponent = this.extractComponent(rootChange.path);
            if (rootComponent) {
                const dependencies = this.dependencyGraph.getDependencies(rootComponent);
                
                // If root change has dependencies, check if any of them changed
                if (dependencies.length > 0) {
                    const rootTime = rootChange.timestamp;
                    const earlierChanges = this.stateHistory.filter(change => 
                        change.timestamp < rootTime &&
                        dependencies.some(dep => change.path.includes(dep))
                    );
                    
                    if (earlierChanges.length > 0) {
                        // There's an even earlier root cause
                        const earliestChange = earlierChanges.reduce((earliest, change) => 
                            change.timestamp < earliest.timestamp ? change : earliest
                        );
                        
                        return {
                            type: 'state_change',
                            path: earliestChange.path,
                            timestamp: earliestChange.timestamp,
                            value: earliestChange.newValue,
                            trigger: earliestChange.trigger,
                            chain: causalChain.length + 1
                        };
                    }
                }
            }
        }
        
        return {
            type: 'state_change',
            path: rootChange.path,
            timestamp: rootChange.timestamp,
            value: rootChange.newValue,
            trigger: rootChange.trigger,
            chain: causalChain.length
        };
    }
    
    /**
     * Report root cause
     */
    reportRootCause(issue, rootCause, causalChain) {
        // Update issue with root cause
        if (this.issueDetector) {
            const existingIssue = this.issueDetector.issues.get(issue.id);
            if (existingIssue) {
                existingIssue.rootCause = rootCause;
                existingIssue.causalChain = causalChain;
            }
        }
        
        // Emit event
        this.emit('rootCauseFound', {
            issue,
            rootCause,
            causalChain
        });
        
        // Log root cause
        gameLogger.info('CERBERUS', '[CAUSAL_ANALYSIS] ROOT_CAUSE_FOUND', {
            issueId: issue.id,
            issueType: issue.type,
            rootCause: rootCause.path,
            chainLength: causalChain.length,
            timestamp: rootCause.timestamp
        });
    }
    
    /**
     * Get causal chain for issue
     */
    getCausalChain(issueId) {
        return this.causalChains.get(issueId) || [];
    }
    
    /**
     * Get root cause for issue
     */
    getRootCause(issueId) {
        return this.rootCauses.get(issueId) || null;
    }
    
    /**
     * Get all root causes
     */
    getAllRootCauses() {
        const rootCauses = [];
        for (const [issueId, rootCause] of this.rootCauses.entries()) {
            rootCauses.push({
                issueId,
                rootCause,
                chain: this.causalChains.get(issueId) || []
            });
        }
        return rootCauses;
    }
    
    /**
     * Get statistics
     */
    getStatistics() {
        return {
            totalStateChanges: this.stateHistory.length,
            totalCausalChains: this.causalChains.size,
            totalRootCauses: this.rootCauses.size,
            averageChainLength: this.causalChains.size > 0
                ? Array.from(this.causalChains.values())
                    .reduce((sum, chain) => sum + chain.length, 0) / this.causalChains.size
                : 0
        };
    }
    
    /**
     * Build full causal graph (all relationships)
     */
    buildCausalGraph() {
        const graph = {
            nodes: [],
            edges: []
        };
        
        // Add all state changes as nodes
        for (const change of this.stateHistory) {
            graph.nodes.push({
                id: change.path,
                type: 'state_change',
                timestamp: change.timestamp,
                path: change.path
            });
        }
        
        // Add all issues as nodes
        if (this.issueDetector) {
            for (const [issueId, issue] of this.issueDetector.issues.entries()) {
                graph.nodes.push({
                    id: issueId,
                    type: 'issue',
                    timestamp: issue.timestamp || issue.firstSeen,
                    issueType: issue.type
                });
            }
        }
        
        // Add edges from causal chains
        for (const [issueId, chain] of this.causalChains.entries()) {
            // Connect issue to first change in chain
            if (chain.length > 0) {
                graph.edges.push({
                    from: chain[0].path,
                    to: issueId,
                    type: 'causes',
                    relationship: chain[0].relationship
                });
            }
            
            // Connect changes in chain
            for (let i = 0; i < chain.length - 1; i++) {
                graph.edges.push({
                    from: chain[i].path,
                    to: chain[i + 1].path,
                    type: 'leads_to',
                    relationship: chain[i + 1].relationship
                });
            }
        }
        
        return graph;
    }
}

module.exports = CausalAnalysis;
