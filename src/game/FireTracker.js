/**
 * FireTracker - NBA Jam style "On Fire" detection system
 * 
 * Tracks a rolling window of recent hands per player per table.
 * Calculates fire/cold levels based on wins, hand strength, pot sizes, draw completions.
 * Fire level is included in table state broadcasts so all players/spectators see it.
 */

const database = require('../database/Database');
const gameLogger = require('../utils/GameLogger');

const FIRE_LEVEL = {
    NONE: 0,
    WARM: 1,     // Minor streak
    HOT: 2,      // Solid streak
    ON_FIRE: 3   // NBA Jam — full flames
};

const COLD_LEVEL = {
    NONE: 0,
    CHILLY: 1,
    COLD: 2,
    FROZEN: 3
};

// Configuration
const WINDOW_SIZE = 12;        // Rolling window of last N hands
const DECAY_FOLDS = 3;         // Folding this many hands in a row starts cooling
const WARM_THRESHOLD = 0.45;   // Fire score >= this = Warm
const HOT_THRESHOLD = 0.65;    // Fire score >= this = Hot  
const FIRE_THRESHOLD = 0.80;   // Fire score >= this = On Fire
const COLD_THRESHOLD = -0.40;  // Fire score <= this = Chilly
const FROZEN_THRESHOLD = -0.70; // Fire score <= this = Frozen

class FireTracker {
    constructor() {
        // Map of tableId -> Map of playerId -> rolling window array
        this.windows = new Map();
    }

    /**
     * Initialize tracking for a table
     */
    initTable(tableId) {
        if (!this.windows.has(tableId)) {
            this.windows.set(tableId, new Map());
        }
    }

    /**
     * Clean up when table is destroyed
     */
    removeTable(tableId) {
        this.windows.delete(tableId);
    }

    /**
     * Record a hand result for a player at a table
     * Called after every hand by StatsEngine or Table.js
     * 
     * @param {string} tableId
     * @param {string} playerId
     * @param {Object} handResult - Data about this hand
     * @param {boolean} handResult.won - Did the player win?
     * @param {number} handResult.handRank - Final hand rank (0-10)
     * @param {number} handResult.potSize - Pot size
     * @param {number} handResult.bigBlind - Table big blind (for pot ratio)
     * @param {boolean} handResult.folded - Did the player fold?
     * @param {boolean} handResult.drawCompleted - Did a draw complete?
     * @param {boolean} handResult.suckout - Won from behind?
     * @param {number} handResult.chipsWonLost - Chips won/lost
     */
    recordHand(tableId, playerId, handResult) {
        this.initTable(tableId);
        const tableWindows = this.windows.get(tableId);

        if (!tableWindows.has(playerId)) {
            tableWindows.set(playerId, []);
        }

        const window = tableWindows.get(playerId);
        
        // Calculate hand score (-1.0 to +1.0)
        const score = this._calculateHandScore(handResult);

        window.push({
            score,
            won: handResult.won,
            folded: handResult.folded,
            handRank: handResult.handRank,
            potRatio: handResult.bigBlind > 0 ? handResult.potSize / handResult.bigBlind : 1,
            timestamp: Date.now()
        });

        // Trim to window size
        while (window.length > WINDOW_SIZE) {
            window.shift();
        }
    }

    /**
     * Calculate a single hand's contribution to fire score
     */
    _calculateHandScore(result) {
        if (result.folded) return -0.05; // Slight negative for folding (neutral-ish)

        let score = 0;

        // Win/loss is the primary factor
        if (result.won) {
            score += 0.4;

            // Bonus for big pots (>5x big blind)
            if (result.bigBlind > 0 && result.potSize > result.bigBlind * 5) {
                score += 0.15;
            }
            // Bonus for big pots (>15x big blind)
            if (result.bigBlind > 0 && result.potSize > result.bigBlind * 15) {
                score += 0.15;
            }

            // Bonus for strong hands
            if (result.handRank >= 5) score += 0.1;  // Straight or better
            if (result.handRank >= 7) score += 0.1;  // Full house or better
            if (result.handRank >= 9) score += 0.2;  // Straight flush or better

            // Bonus for draws completing
            if (result.drawCompleted) score += 0.1;

            // Bonus for suckouts (winning from behind)
            if (result.suckout) score += 0.15;

        } else {
            score -= 0.3;

            // Extra penalty for losing big pots
            if (result.bigBlind > 0 && result.potSize > result.bigBlind * 10) {
                score -= 0.1;
            }
        }

        return Math.max(-1, Math.min(1, score)); // Clamp
    }

    /**
     * Get the current fire level for a player at a table
     * Returns { fireLevel: 0-3, coldLevel: 0-3, fireScore: number }
     */
    getFireStatus(tableId, playerId) {
        const tableWindows = this.windows.get(tableId);
        if (!tableWindows || !tableWindows.has(playerId)) {
            return { fireLevel: FIRE_LEVEL.NONE, coldLevel: COLD_LEVEL.NONE, fireScore: 0 };
        }

        const window = tableWindows.get(playerId);
        if (window.length < 3) {
            return { fireLevel: FIRE_LEVEL.NONE, coldLevel: COLD_LEVEL.NONE, fireScore: 0 };
        }

        // Calculate weighted average (recent hands count more)
        let weightedSum = 0;
        let totalWeight = 0;
        for (let i = 0; i < window.length; i++) {
            // More recent = higher weight (exponential)
            const recency = (i + 1) / window.length;
            const weight = Math.pow(recency, 1.5); // Recent hands weighted more
            weightedSum += window[i].score * weight;
            totalWeight += weight;
        }

        const fireScore = totalWeight > 0 ? weightedSum / totalWeight : 0;

        // Check for fold decay (many consecutive folds cools you down)
        let consecutiveFolds = 0;
        for (let i = window.length - 1; i >= 0; i--) {
            if (window[i].folded) consecutiveFolds++;
            else break;
        }
        const foldDecayPenalty = consecutiveFolds >= DECAY_FOLDS ? (consecutiveFolds - DECAY_FOLDS + 1) * 0.1 : 0;
        const adjustedScore = fireScore - foldDecayPenalty;

        // Determine fire level
        let fireLevel = FIRE_LEVEL.NONE;
        if (adjustedScore >= FIRE_THRESHOLD) fireLevel = FIRE_LEVEL.ON_FIRE;
        else if (adjustedScore >= HOT_THRESHOLD) fireLevel = FIRE_LEVEL.HOT;
        else if (adjustedScore >= WARM_THRESHOLD) fireLevel = FIRE_LEVEL.WARM;

        // Determine cold level
        let coldLevel = COLD_LEVEL.NONE;
        if (adjustedScore <= FROZEN_THRESHOLD) coldLevel = COLD_LEVEL.FROZEN;
        else if (adjustedScore <= COLD_THRESHOLD) coldLevel = COLD_LEVEL.COLD;
        else if (adjustedScore <= COLD_THRESHOLD * 0.7) coldLevel = COLD_LEVEL.CHILLY;

        return { fireLevel, coldLevel, fireScore: parseFloat(adjustedScore.toFixed(3)) };
    }

    /**
     * Get fire status for all players at a table
     * Returns Map of playerId -> { fireLevel, coldLevel, fireScore }
     */
    getTableFireStatus(tableId) {
        const result = {};
        const tableWindows = this.windows.get(tableId);
        if (!tableWindows) return result;

        for (const [playerId] of tableWindows) {
            result[playerId] = this.getFireStatus(tableId, playerId);
        }
        return result;
    }

    /**
     * Log a fire level change to the database
     */
    async logFireEvent(playerId, tableId, fireLevel, handsInStreak) {
        try {
            if (database.isConnected) {
                await database.query(
                    'INSERT INTO fire_events (player_id, table_id, fire_level, hands_in_streak) VALUES (?, ?, ?, ?)',
                    [playerId, tableId, fireLevel, handsInStreak]
                );
            }
        } catch (err) {
            gameLogger.error('FIRE', 'Error logging fire event', { error: err.message });
        }
    }

    /**
     * Check for fire level changes and return any announcements needed
     * Call this after recordHand to detect transitions
     */
    checkFireTransition(tableId, playerId, previousFireLevel) {
        const current = this.getFireStatus(tableId, playerId);
        
        if (current.fireLevel !== previousFireLevel) {
            const window = this.windows.get(tableId)?.get(playerId);
            const handsInWindow = window ? window.length : 0;

            // Log significant fire events
            if (current.fireLevel >= FIRE_LEVEL.HOT) {
                this.logFireEvent(playerId, tableId, current.fireLevel, handsInWindow);
            }

            return {
                changed: true,
                previousLevel: previousFireLevel,
                currentLevel: current.fireLevel,
                coldLevel: current.coldLevel,
                fireScore: current.fireScore,
                announcement: this._getAnnouncement(current.fireLevel, previousFireLevel)
            };
        }

        return { changed: false, ...current };
    }

    /**
     * Get announcement text for fire level change
     */
    _getAnnouncement(newLevel, oldLevel) {
        if (newLevel > oldLevel) {
            switch (newLevel) {
                case FIRE_LEVEL.WARM: return 'is heating up!';
                case FIRE_LEVEL.HOT: return 'is on a hot streak! 🔥';
                case FIRE_LEVEL.ON_FIRE: return 'IS ON FIRE! 🔥🔥🔥';
            }
        } else if (newLevel < oldLevel && newLevel === FIRE_LEVEL.NONE) {
            return 'has cooled down.';
        }
        return null;
    }

    /**
     * Remove a player from table tracking (when they leave)
     */
    removePlayer(tableId, playerId) {
        const tableWindows = this.windows.get(tableId);
        if (tableWindows) {
            tableWindows.delete(playerId);
        }
    }
}

// Export constants too
FireTracker.FIRE_LEVEL = FIRE_LEVEL;
FireTracker.COLD_LEVEL = COLD_LEVEL;

// Singleton
const fireTracker = new FireTracker();
module.exports = fireTracker;
