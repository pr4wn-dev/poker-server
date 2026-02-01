/**
 * StateComparator - Compares simulation state to real game state
 * 
 * Finds differences between simulation and real game logs to identify
 * bugs, inconsistencies, or logic errors.
 */

const StateSnapshot = require('./StateSnapshot');
const fs = require('fs');
const path = require('path');

class StateComparator {
    constructor() {
        this.differences = [];
        this.logDir = path.join(__dirname, '../../logs/comparisons');
        
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }
    }
    
    /**
     * Compare two state snapshots
     */
    compare(simSnapshot, realSnapshot, tolerance = {}) {
        const diff = {
            timestamp: Date.now(),
            phase: null,
            handNumber: null,
            differences: []
        };
        
        // Compare phase
        if (simSnapshot.phase !== realSnapshot.phase) {
            diff.differences.push({
                field: 'phase',
                sim: simSnapshot.phase,
                real: realSnapshot.phase,
                severity: 'high'
            });
        }
        
        // Compare hand number
        if (simSnapshot.handNumber !== realSnapshot.handNumber) {
            diff.differences.push({
                field: 'handNumber',
                sim: simSnapshot.handNumber,
                real: realSnapshot.handNumber,
                severity: 'high'
            });
        }
        
        // Compare pot (with tolerance for rounding)
        const potTolerance = tolerance.pot || 0;
        if (Math.abs(simSnapshot.pot - realSnapshot.pot) > potTolerance) {
            diff.differences.push({
                field: 'pot',
                sim: simSnapshot.pot,
                real: realSnapshot.pot,
                diff: Math.abs(simSnapshot.pot - realSnapshot.pot),
                severity: 'high'
            });
        }
        
        // Compare current bet
        const betTolerance = tolerance.bet || 0;
        if (Math.abs(simSnapshot.currentBet - realSnapshot.currentBet) > betTolerance) {
            diff.differences.push({
                field: 'currentBet',
                sim: simSnapshot.currentBet,
                real: realSnapshot.currentBet,
                diff: Math.abs(simSnapshot.currentBet - realSnapshot.currentBet),
                severity: 'medium'
            });
        }
        
        // Compare blinds
        if (simSnapshot.smallBlind !== realSnapshot.smallBlind) {
            diff.differences.push({
                field: 'smallBlind',
                sim: simSnapshot.smallBlind,
                real: realSnapshot.smallBlind,
                severity: 'high'
            });
        }
        
        if (simSnapshot.bigBlind !== realSnapshot.bigBlind) {
            diff.differences.push({
                field: 'bigBlind',
                sim: simSnapshot.bigBlind,
                real: realSnapshot.bigBlind,
                severity: 'high'
            });
        }
        
        // Compare dealer/current player indices
        if (simSnapshot.dealerIndex !== realSnapshot.dealerIndex) {
            diff.differences.push({
                field: 'dealerIndex',
                sim: simSnapshot.dealerIndex,
                real: realSnapshot.dealerIndex,
                severity: 'medium'
            });
        }
        
        if (simSnapshot.currentPlayerIndex !== realSnapshot.currentPlayerIndex) {
            diff.differences.push({
                field: 'currentPlayerIndex',
                sim: simSnapshot.currentPlayerIndex,
                real: realSnapshot.currentPlayerIndex,
                severity: 'high'
            });
        }
        
        // Compare community cards
        const communityDiff = this._compareCards(simSnapshot.communityCards, realSnapshot.communityCards);
        if (communityDiff.length > 0) {
            diff.differences.push({
                field: 'communityCards',
                differences: communityDiff,
                severity: 'high'
            });
        }
        
        // Compare seats
        const seatDiff = this._compareSeats(simSnapshot.seats, realSnapshot.seats);
        if (seatDiff.length > 0) {
            diff.differences.push({
                field: 'seats',
                differences: seatDiff,
                severity: 'high'
            });
        }
        
        return diff;
    }
    
    /**
     * Compare two card arrays
     */
    _compareCards(simCards, realCards) {
        const differences = [];
        
        if (simCards.length !== realCards.length) {
            differences.push({
                type: 'length_mismatch',
                sim: simCards.length,
                real: realCards.length
            });
            return differences;
        }
        
        for (let i = 0; i < simCards.length; i++) {
            const simCard = simCards[i];
            const realCard = realCards[i];
            
            if (!simCard && !realCard) continue;
            if (!simCard || !realCard) {
                differences.push({
                    type: 'card_missing',
                    index: i,
                    sim: simCard,
                    real: realCard
                });
                continue;
            }
            
            if (simCard.rank !== realCard.rank || simCard.suit !== realCard.suit) {
                differences.push({
                    type: 'card_mismatch',
                    index: i,
                    sim: simCard,
                    real: realCard
                });
            }
        }
        
        return differences;
    }
    
    /**
     * Compare two seat arrays
     */
    _compareSeats(simSeats, realSeats) {
        const differences = [];
        
        const maxLength = Math.max(simSeats.length, realSeats.length);
        
        for (let i = 0; i < maxLength; i++) {
            const simSeat = simSeats[i];
            const realSeat = realSeats[i];
            
            // Both empty - skip
            if (!simSeat && !realSeat) continue;
            
            // One empty, one not
            if (!simSeat || !realSeat) {
                differences.push({
                    type: 'seat_missing',
                    index: i,
                    sim: simSeat ? 'present' : 'missing',
                    real: realSeat ? 'present' : 'missing'
                });
                continue;
            }
            
            // Compare seat properties
            const seatDiff = [];
            
            if (simSeat.playerId !== realSeat.playerId) {
                seatDiff.push({ field: 'playerId', sim: simSeat.playerId, real: realSeat.playerId });
            }
            
            if (simSeat.chips !== realSeat.chips) {
                seatDiff.push({ field: 'chips', sim: simSeat.chips, real: realSeat.chips });
            }
            
            if (simSeat.currentBet !== realSeat.currentBet) {
                seatDiff.push({ field: 'currentBet', sim: simSeat.currentBet, real: realSeat.currentBet });
            }
            
            if (simSeat.isFolded !== realSeat.isFolded) {
                seatDiff.push({ field: 'isFolded', sim: simSeat.isFolded, real: realSeat.isFolded });
            }
            
            if (simSeat.isAllIn !== realSeat.isAllIn) {
                seatDiff.push({ field: 'isAllIn', sim: simSeat.isAllIn, real: realSeat.isAllIn });
            }
            
            if (simSeat.isConnected !== realSeat.isConnected) {
                seatDiff.push({ field: 'isConnected', sim: simSeat.isConnected, real: realSeat.isConnected });
            }
            
            // Compare cards (only if visible)
            const cardDiff = this._compareCards(simSeat.cards || [], realSeat.cards || []);
            if (cardDiff.length > 0) {
                seatDiff.push({ field: 'cards', differences: cardDiff });
            }
            
            if (seatDiff.length > 0) {
                differences.push({
                    seatIndex: i,
                    differences: seatDiff
                });
            }
        }
        
        return differences;
    }
    
    /**
     * Compare entire game logs (all snapshots)
     */
    compareLogs(simLogPath, realLogPath, options = {}) {
        const simData = StateSnapshot.load(simLogPath);
        const realData = StateSnapshot.load(realLogPath);
        
        if (!simData || !realData) {
            return {
                error: 'Could not load one or both log files',
                simLoaded: !!simData,
                realLoaded: !!realData
            };
        }
        
        const comparison = {
            tableId: simData.tableId,
            tableName: simData.tableName,
            timestamp: Date.now(),
            simSnapshotCount: simData.snapshotCount,
            realSnapshotCount: realData.snapshotCount,
            comparisons: [],
            summary: {
                totalDifferences: 0,
                highSeverity: 0,
                mediumSeverity: 0,
                lowSeverity: 0
            }
        };
        
        // Match snapshots by phase and hand number
        const simByKey = new Map();
        simData.snapshots.forEach(snap => {
            const key = `${snap.phase}_${snap.handNumber}`;
            if (!simByKey.has(key)) {
                simByKey.set(key, []);
            }
            simByKey.get(key).push(snap);
        });
        
        const realByKey = new Map();
        realData.snapshots.forEach(snap => {
            const key = `${snap.phase}_${snap.handNumber}`;
            if (!realByKey.has(key)) {
                realByKey.set(key, []);
            }
            realByKey.get(key).push(snap);
        });
        
        // Compare matching snapshots
        for (const [key, simSnaps] of simByKey.entries()) {
            const realSnaps = realByKey.get(key) || [];
            
            // Compare first snapshot of each phase/hand
            if (simSnaps.length > 0 && realSnaps.length > 0) {
                const diff = this.compare(simSnaps[0], realSnaps[0], options.tolerance || {});
                if (diff.differences.length > 0) {
                    diff.phase = simSnaps[0].phase;
                    diff.handNumber = simSnaps[0].handNumber;
                    comparison.comparisons.push(diff);
                    
                    // Update summary
                    diff.differences.forEach(d => {
                        comparison.summary.totalDifferences++;
                        if (d.severity === 'high') comparison.summary.highSeverity++;
                        else if (d.severity === 'medium') comparison.summary.mediumSeverity++;
                        else comparison.summary.lowSeverity++;
                    });
                }
            }
        }
        
        // Save comparison report
        const reportPath = path.join(this.logDir, `comparison_${simData.tableId}_${Date.now()}.json`);
        fs.writeFileSync(reportPath, JSON.stringify(comparison, null, 2));
        
        return {
            ...comparison,
            reportPath
        };
    }
    
    /**
     * Generate human-readable comparison report
     */
    generateReport(comparison) {
        let report = `\n=== STATE COMPARISON REPORT ===\n`;
        report += `Table: ${comparison.tableName} (${comparison.tableId})\n`;
        report += `Simulation Snapshots: ${comparison.simSnapshotCount}\n`;
        report += `Real Game Snapshots: ${comparison.realSnapshotCount}\n`;
        report += `Total Differences Found: ${comparison.summary.totalDifferences}\n`;
        report += `  - High Severity: ${comparison.summary.highSeverity}\n`;
        report += `  - Medium Severity: ${comparison.summary.mediumSeverity}\n`;
        report += `  - Low Severity: ${comparison.summary.lowSeverity}\n\n`;
        
        if (comparison.comparisons.length === 0) {
            report += `✅ No differences found! Simulation matches real game.\n`;
            return report;
        }
        
        report += `DIFFERENCES:\n`;
        report += `============\n\n`;
        
        comparison.comparisons.forEach((comp, idx) => {
            report += `${idx + 1}. Phase: ${comp.phase}, Hand: ${comp.handNumber}\n`;
            comp.differences.forEach(diff => {
                report += `   [${diff.severity.toUpperCase()}] ${diff.field}: `;
                if (diff.sim !== undefined && diff.real !== undefined) {
                    report += `Sim=${diff.sim}, Real=${diff.real}`;
                    if (diff.diff !== undefined) {
                        report += ` (diff: ${diff.diff})`;
                    }
                } else if (diff.differences) {
                    report += `${diff.differences.length} sub-differences`;
                }
                report += `\n`;
            });
            report += `\n`;
        });
        
        return report;
    }
}

module.exports = StateComparator;

