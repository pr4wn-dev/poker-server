/**
 * State Verification Contracts - Define what "correct" state looks like
 * 
 * BrokenPromise uses contracts to verify that critical operations maintain invariants.
 * Contracts define pre-conditions, post-conditions, and invariants for all critical operations.
 * 
 * This is the foundation of BrokenPromise's detection - if we don't know what's correct,
 * we can't detect what's wrong.
 */

const EventEmitter = require('events');
const gameLogger = require('../../src/utils/GameLogger');

class StateVerificationContracts extends EventEmitter {
    constructor(stateStore, issueDetector) {
        super();
        this.stateStore = stateStore;
        this.issueDetector = issueDetector;
        
        // Contract definitions
        this.contracts = new Map();
        
        // Contract violation history
        this.violations = [];
        this.maxViolationsHistory = 1000;
        
        // Initialize contracts
        this.defineContracts();
        
        // Start contract verification
        this.startVerification();
    }
    
    /**
     * Define all contracts for critical operations
     */
    defineContracts() {
        // ============ GAME STATE CONTRACTS ============
        
        // Contract: Chip integrity - total chips must always equal sum of all player chips + pot
        this.defineContract('chip_integrity', {
            name: 'Chip Integrity',
            description: 'Total chips must equal sum of all player chips + pot + side pots',
            verify: (state) => {
                const gameState = state.game || {};
                const tables = gameState.tables || {};
                
                const violations = [];
                
                for (const [tableId, table] of Object.entries(tables)) {
                    if (!table.seats) continue;
                    
                    // Calculate total chips
                    let playerChips = 0;
                    let pot = table.pot || 0;
                    let sidePots = 0;
                    
                    // Sum player chips
                    for (const seat of table.seats) {
                        if (seat && seat.playerId) {
                            playerChips += seat.chips || 0;
                            playerChips += seat.currentBet || 0;
                        }
                    }
                    
                    // Sum side pots if they exist
                    if (table.sidePots && Array.isArray(table.sidePots)) {
                        for (const sidePot of table.sidePots) {
                            sidePots += sidePot.amount || 0;
                        }
                    }
                    
                    const total = playerChips + pot + sidePots;
                    const expectedTotal = table.startingChips * (table.seats.filter(s => s && s.playerId).length);
                    
                    // Allow small floating point differences
                    if (Math.abs(total - expectedTotal) > 0.01) {
                        violations.push({
                            tableId,
                            expected: expectedTotal,
                            actual: total,
                            playerChips,
                            pot,
                            sidePots,
                            difference: total - expectedTotal
                        });
                    }
                }
                
                return {
                    valid: violations.length === 0,
                    violations
                };
            },
            severity: 'critical'
        });
        
        // Contract: Player state consistency - player can't be in multiple seats
        this.defineContract('player_state_consistency', {
            name: 'Player State Consistency',
            description: 'Each player can only be in one seat at a time',
            verify: (state) => {
                const gameState = state.game || {};
                const tables = gameState.tables || {};
                
                const violations = [];
                const playerSeats = new Map(); // playerId -> [tableId, seatIndex]
                
                for (const [tableId, table] of Object.entries(tables)) {
                    if (!table.seats) continue;
                    
                    for (let i = 0; i < table.seats.length; i++) {
                        const seat = table.seats[i];
                        if (seat && seat.playerId) {
                            if (!playerSeats.has(seat.playerId)) {
                                playerSeats.set(seat.playerId, []);
                            }
                            playerSeats.get(seat.playerId).push({ tableId, seatIndex: i });
                        }
                    }
                }
                
                // Check for players in multiple seats
                for (const [playerId, seats] of playerSeats.entries()) {
                    if (seats.length > 1) {
                        violations.push({
                            playerId,
                            seats,
                            message: `Player ${playerId} is in ${seats.length} seats simultaneously`
                        });
                    }
                }
                
                return {
                    valid: violations.length === 0,
                    violations
                };
            },
            severity: 'critical'
        });
        
        // Contract: Game phase consistency - phase must match game state
        this.defineContract('game_phase_consistency', {
            name: 'Game Phase Consistency',
            description: 'Game phase must match actual game state (cards, bets, etc.)',
            verify: (state) => {
                const gameState = state.game || {};
                const tables = gameState.tables || {};
                
                const violations = [];
                
                for (const [tableId, table] of Object.entries(tables)) {
                    if (!table.phase) continue;
                    
                    const phase = table.phase;
                    const communityCards = table.communityCards || [];
                    const currentBet = table.currentBet || 0;
                    const currentPlayerIndex = table.currentPlayerIndex;
                    
                    // Phase-specific checks
                    if (phase === 'preflop' && communityCards.length > 0) {
                        violations.push({
                            tableId,
                            phase,
                            issue: 'Preflop phase but community cards exist',
                            communityCards: communityCards.length
                        });
                    }
                    
                    if (phase === 'flop' && communityCards.length !== 3) {
                        violations.push({
                            tableId,
                            phase,
                            issue: 'Flop phase but wrong number of community cards',
                            expected: 3,
                            actual: communityCards.length
                        });
                    }
                    
                    if (phase === 'turn' && communityCards.length !== 4) {
                        violations.push({
                            tableId,
                            phase,
                            issue: 'Turn phase but wrong number of community cards',
                            expected: 4,
                            actual: communityCards.length
                        });
                    }
                    
                    if (phase === 'river' && communityCards.length !== 5) {
                        violations.push({
                            tableId,
                            phase,
                            issue: 'River phase but wrong number of community cards',
                            expected: 5,
                            actual: communityCards.length
                        });
                    }
                    
                    // Current player must be valid
                    if (phase !== 'waiting' && phase !== 'showdown' && currentPlayerIndex !== null && currentPlayerIndex !== undefined) {
                        if (!table.seats || !table.seats[currentPlayerIndex] || !table.seats[currentPlayerIndex].playerId) {
                            violations.push({
                                tableId,
                                phase,
                                issue: 'Current player index points to empty seat',
                                currentPlayerIndex
                            });
                        }
                    }
                }
                
                return {
                    valid: violations.length === 0,
                    violations
                };
            },
            severity: 'high'
        });
        
        // ============ SYSTEM STATE CONTRACTS ============
        
        // Contract: Server health - server must respond within timeout
        this.defineContract('server_health', {
            name: 'Server Health',
            description: 'Server must be responsive and healthy',
            verify: (state) => {
                const systemState = state.system || {};
                const server = systemState.server || {};
                
                const violations = [];
                
                // Server must be running
                if (server.status !== 'running') {
                    violations.push({
                        status: server.status,
                        issue: 'Server is not running',
                        expected: 'running'
                    });
                }
                
                // Health must be reasonable
                if (server.health !== null && server.health < 50) {
                    violations.push({
                        health: server.health,
                        issue: 'Server health is below 50%',
                        threshold: 50
                    });
                }
                
                // Error rate must be reasonable
                if (server.metrics) {
                    const errorRate = server.metrics.errors / Math.max(server.metrics.requests, 1);
                    if (errorRate > 0.1) { // More than 10% errors
                        violations.push({
                            errorRate: errorRate * 100,
                            issue: 'Server error rate is too high',
                            threshold: 10,
                            errors: server.metrics.errors,
                            requests: server.metrics.requests
                        });
                    }
                }
                
                return {
                    valid: violations.length === 0,
                    violations
                };
            },
            severity: 'high'
        });
        
        // Contract: Database connectivity - database must be connected
        this.defineContract('database_connectivity', {
            name: 'Database Connectivity',
            description: 'Database must be connected and responsive',
            verify: (state) => {
                const systemState = state.system || {};
                const database = systemState.database || {};
                
                const violations = [];
                
                if (database.status !== 'connected') {
                    violations.push({
                        status: database.status,
                        issue: 'Database is not connected',
                        expected: 'connected'
                    });
                }
                
                // Query response time must be reasonable
                if (database.metrics && database.metrics.responseTime > 1000) {
                    violations.push({
                        responseTime: database.metrics.responseTime,
                        issue: 'Database response time is too high',
                        threshold: 1000
                    });
                }
                
                return {
                    valid: violations.length === 0,
                    violations
                };
            },
            severity: 'critical'
        });
        
        // ============ MONITORING STATE CONTRACTS ============
        
        // Contract: Investigation state consistency
        this.defineContract('investigation_state_consistency', {
            name: 'Investigation State Consistency',
            description: 'Investigation state must be consistent',
            verify: (state) => {
                const monitoringState = state.monitoring || {};
                const investigation = monitoringState.investigation || {};
                
                const violations = [];
                
                // If investigation is active, it must have a start time
                if (investigation.status === 'active' && !investigation.startTime) {
                    violations.push({
                        status: investigation.status,
                        issue: 'Active investigation missing start time'
                    });
                }
                
                // Progress must be 0-100
                if (investigation.progress !== null && investigation.progress !== undefined) {
                    if (investigation.progress < 0 || investigation.progress > 100) {
                        violations.push({
                            progress: investigation.progress,
                            issue: 'Investigation progress out of range',
                            expected: '0-100'
                        });
                    }
                }
                
                return {
                    valid: violations.length === 0,
                    violations
                };
            },
            severity: 'medium'
        });
    }
    
    /**
     * Define a contract
     */
    defineContract(id, contract) {
        if (!contract.verify || typeof contract.verify !== 'function') {
            throw new Error(`Contract ${id} must have a verify function`);
        }
        
        this.contracts.set(id, {
            id,
            ...contract,
            violations: 0,
            lastViolation: null,
            lastCheck: null
        });
    }
    
    /**
     * Start contract verification
     */
    startVerification() {
        // Verify all contracts every 2 seconds
        this.verificationInterval = setInterval(() => {
            this.verifyAllContracts();
        }, 2000);
    }
    
    /**
     * Stop contract verification
     */
    stopVerification() {
        if (this.verificationInterval) {
            clearInterval(this.verificationInterval);
            this.verificationInterval = null;
        }
    }
    
    /**
     * Verify all contracts
     */
    verifyAllContracts() {
        const state = this.stateStore.getState();
        
        for (const [contractId, contract] of this.contracts.entries()) {
            try {
                const result = contract.verify(state);
                contract.lastCheck = Date.now();
                
                if (!result.valid) {
                    // Contract violated
                    contract.violations++;
                    contract.lastViolation = Date.now();
                    
                    // Report violations
                    for (const violation of result.violations) {
                        this.reportViolation(contractId, contract, violation);
                    }
                }
            } catch (error) {
                gameLogger.error('BrokenPromise', '[STATE_CONTRACTS] VERIFY_ERROR', {
                    contractId,
                    error: error.message,
                    stack: error.stack
                });
            }
        }
    }
    
    /**
     * Report contract violation
     */
    reportViolation(contractId, contract, violation) {
        const violationRecord = {
            id: `violation-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            contractId,
            contractName: contract.name,
            severity: contract.severity,
            violation,
            timestamp: Date.now()
        };
        
        // Add to history
        this.violations.push(violationRecord);
        if (this.violations.length > this.maxViolationsHistory) {
            this.violations.shift();
        }
        
        // Report to issue detector
        if (this.issueDetector) {
            this.issueDetector.detectIssue({
                type: `CONTRACT_VIOLATION_${contractId.toUpperCase()}`,
                severity: contract.severity,
                method: 'stateVerificationContracts',
                details: {
                    contract: contract.name,
                    description: contract.description,
                    violation
                },
                timestamp: Date.now()
            });
        }
        
        // Emit event
        this.emit('violation', violationRecord);
    }
    
    /**
     * Get contract statistics
     */
    getStatistics() {
        const stats = {
            totalContracts: this.contracts.size,
            violations: this.violations.length,
            contracts: []
        };
        
        for (const [contractId, contract] of this.contracts.entries()) {
            stats.contracts.push({
                id: contractId,
                name: contract.name,
                violations: contract.violations,
                lastViolation: contract.lastViolation,
                lastCheck: contract.lastCheck
            });
        }
        
        return stats;
    }
    
    /**
     * Get recent violations
     */
    getRecentViolations(limit = 50) {
        return this.violations.slice(-limit);
    }
}

module.exports = StateVerificationContracts;
