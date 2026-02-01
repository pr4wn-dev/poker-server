/**
 * StateSnapshot - Captures structured game state for comparison
 * 
 * Used by both simulation and real games to log state in a format
 * that can be programmatically compared to find differences.
 */

const fs = require('fs');
const path = require('path');

class StateSnapshot {
    constructor(tableId, tableName, isSimulation = false) {
        this.tableId = tableId;
        this.tableName = tableName;
        this.isSimulation = isSimulation;
        this.timestamp = Date.now();
        this.snapshots = [];
        this.logDir = path.join(__dirname, '../../logs/state_snapshots');
        this.logFile = path.join(this.logDir, `${tableId}_${isSimulation ? 'sim' : 'real'}.json`);
        
        // Ensure log directory exists
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }
    }
    
    /**
     * Capture a state snapshot at a specific point in the game
     */
    capture(state, metadata = {}) {
        const snapshot = {
            timestamp: Date.now(),
            phase: state.phase,
            handNumber: state.handNumber || 0,
            pot: state.pot || 0,
            currentBet: state.currentBet || 0,
            smallBlind: state.smallBlind || 0,
            bigBlind: state.bigBlind || 0,
            dealerIndex: state.dealerIndex,
            currentPlayerIndex: state.currentPlayerIndex,
            currentPlayerId: state.currentPlayerId,
            communityCards: this._sanitizeCards(state.communityCards || []),
            seats: this._sanitizeSeats(state.seats || []),
            turnTimeRemaining: state.turnTimeRemaining,
            blindLevel: state.blindLevel || 1,
            metadata: {
                ...metadata,
                isSimulation: this.isSimulation
            }
        };
        
        this.snapshots.push(snapshot);
        return snapshot;
    }
    
    /**
     * Sanitize cards for comparison (hide hole cards, keep structure)
     */
    _sanitizeCards(cards) {
        if (!Array.isArray(cards)) return [];
        return cards.map(card => {
            if (!card || (!card.rank && !card.suit)) return null;
            return {
                rank: card.rank || null,
                suit: card.suit || null
            };
        });
    }
    
    /**
     * Sanitize seats for comparison (normalize structure, hide sensitive data)
     */
    _sanitizeSeats(seats) {
        if (!Array.isArray(seats)) return [];
        return seats.map((seat, index) => {
            if (!seat || !seat.playerId) return null;
            
            return {
                index: seat.index !== undefined ? seat.index : index,
                playerId: seat.playerId,
                name: seat.name || 'Unknown',
                chips: seat.chips || 0,
                currentBet: seat.currentBet || 0,
                isFolded: seat.isFolded || false,
                isAllIn: seat.isAllIn || false,
                isConnected: seat.isConnected !== false,
                isReady: seat.isReady || false,
                // Cards: only include if visible (showdown or own cards)
                cards: this._sanitizeCards(seat.cards || []),
                // Don't include sensitive data like socketId, oderId
            };
        });
    }
    
    /**
     * Save snapshots to file
     */
    save() {
        const data = {
            tableId: this.tableId,
            tableName: this.tableName,
            isSimulation: this.isSimulation,
            startTime: this.timestamp,
            endTime: Date.now(),
            snapshotCount: this.snapshots.length,
            snapshots: this.snapshots
        };
        
        try {
            fs.writeFileSync(this.logFile, JSON.stringify(data, null, 2));
            return true;
        } catch (error) {
            console.error('[StateSnapshot] Error saving snapshots:', error.message);
            return false;
        }
    }
    
    /**
     * Load snapshots from file
     */
    static load(filePath) {
        try {
            const data = fs.readFileSync(filePath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            console.error('[StateSnapshot] Error loading snapshots:', error.message);
            return null;
        }
    }
    
    /**
     * Get all snapshot files for a table
     */
    static getSnapshotFiles(tableId) {
        const logDir = path.join(__dirname, '../../logs/state_snapshots');
        if (!fs.existsSync(logDir)) return { sim: null, real: null };
        
        const simFile = path.join(logDir, `${tableId}_sim.json`);
        const realFile = path.join(logDir, `${tableId}_real.json`);
        
        return {
            sim: fs.existsSync(simFile) ? simFile : null,
            real: fs.existsSync(realFile) ? realFile : null
        };
    }
}

module.exports = StateSnapshot;

