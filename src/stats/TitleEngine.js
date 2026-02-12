/**
 * TitleEngine - Awards and revokes dynamic titles based on player stats
 * 
 * Titles are evaluated after stats are updated. Players earn titles 
 * when their stats cross thresholds, and lose them when they fall below.
 * Each player chooses one active title to display.
 */

const database = require('../database/Database');
const gameLogger = require('../utils/GameLogger');

// All possible titles and their criteria
const TITLES = {
    // === LUCK TITLES ===
    RIVER_RAT: {
        id: 'RIVER_RAT', name: 'River Rat', category: 'luck',
        description: 'Hits draws on the river more than most',
        check: (stats) => parseFloat(stats.riverLuck) >= 35 && stats.river_draw_attempts >= 20
    },
    LUCKY_DRAW: {
        id: 'LUCKY_DRAW', name: 'Lucky Draw', category: 'luck',
        description: 'Completes draws at an above-average rate',
        check: (stats) => parseFloat(stats.riverLuck) >= 30 && parseFloat(stats.turnLuck) >= 30 && stats.river_draw_attempts >= 15
    },
    BLESSED: {
        id: 'BLESSED', name: 'Blessed', category: 'luck',
        description: 'Gets dealt premium hands more often than expected',
        check: (stats) => parseFloat(stats.premiumHandFrequency) >= 4.5 && stats.total_hands_dealt >= 100
    },
    CURSED: {
        id: 'CURSED', name: 'Cursed', category: 'luck',
        description: 'Suffers bad beats more than most',
        check: (stats) => parseFloat(stats.badBeatRate) >= 40 && stats.bad_beat_opportunities >= 15
    },

    // === SKILL TITLES ===
    BLUFF_MASTER: {
        id: 'BLUFF_MASTER', name: 'Bluff Master', category: 'skill',
        description: 'Successfully bluffs opponents at a high rate',
        check: (stats) => parseFloat(stats.bluffSuccessRate) >= 55 && stats.bluff_attempts >= 20
    },
    HUMAN_LIE_DETECTOR: {
        id: 'HUMAN_LIE_DETECTOR', name: 'Human Lie Detector', category: 'skill',
        description: 'Catches bluffs with uncanny accuracy',
        check: (stats) => parseFloat(stats.bluffDetectionRate) >= 60 && stats.bluff_detection_opportunities >= 15
    },
    STONE_COLD: {
        id: 'STONE_COLD', name: 'Stone Cold', category: 'skill',
        description: 'Tight player who wins big at showdown',
        check: (stats) => parseFloat(stats.vpip) <= 25 && parseFloat(stats.showdownWinRate) >= 60 && stats.hands_played >= 100
    },
    THE_SHARK: {
        id: 'THE_SHARK', name: 'The Shark', category: 'skill',
        description: 'Aggressive and winning — a dangerous player',
        check: (stats) => parseFloat(stats.aggressionFactor) >= 2.5 && parseFloat(stats.winRate) >= 30 && stats.hands_played >= 100
    },
    THE_ROCK: {
        id: 'THE_ROCK', name: 'The Rock', category: 'skill',
        description: 'Ultra tight — barely plays but rarely loses',
        check: (stats) => parseFloat(stats.vpip) <= 18 && parseFloat(stats.winRate) >= 35 && stats.hands_played >= 100
    },

    // === PLAY STYLE TITLES ===
    MANIAC: {
        id: 'MANIAC', name: 'Maniac', category: 'style',
        description: 'Loose and aggressive — plays everything hard',
        check: (stats) => parseFloat(stats.vpip) >= 45 && parseFloat(stats.aggressionFactor) >= 2.0 && stats.hands_played >= 50
    },
    CALLING_STATION: {
        id: 'CALLING_STATION', name: 'Calling Station', category: 'style',
        description: 'Calls everything — hard to bluff',
        check: (stats) => parseFloat(stats.aggressionFactor) <= 0.8 && parseFloat(stats.vpip) >= 35 && stats.hands_played >= 50
    },
    NIT: {
        id: 'NIT', name: 'Nit', category: 'style',
        description: 'Plays very few hands — ultra conservative',
        check: (stats) => parseFloat(stats.vpip) <= 15 && stats.hands_played >= 100
    },
    LAG: {
        id: 'LAG', name: 'LAG', category: 'style',
        description: 'Loose-Aggressive — plays many hands aggressively',
        check: (stats) => parseFloat(stats.vpip) >= 35 && parseFloat(stats.pfr) >= 20 && stats.hands_played >= 50
    },
    TAG: {
        id: 'TAG', name: 'TAG', category: 'style',
        description: 'Tight-Aggressive — the textbook winning style',
        check: (stats) => parseFloat(stats.vpip) >= 20 && parseFloat(stats.vpip) <= 30 && parseFloat(stats.pfr) >= 15 && parseFloat(stats.aggressionFactor) >= 2.0 && stats.hands_played >= 100
    },

    // === HAND TYPE TITLES ===
    FLUSH_KING: {
        id: 'FLUSH_KING', name: 'Flush Royalty', category: 'hands',
        description: 'Makes flushes more than anyone',
        checkHandTypes: (handTypes) => {
            const flush = handTypes.find(h => h.hand_type === 6);
            return flush && flush.times_made >= 25;
        }
    },
    STRAIGHT_SHOOTER: {
        id: 'STRAIGHT_SHOOTER', name: 'Straight Shooter', category: 'hands',
        description: 'A straight magnet',
        checkHandTypes: (handTypes) => {
            const straight = handTypes.find(h => h.hand_type === 5);
            return straight && straight.times_made >= 25;
        }
    },
    FULL_HOUSE_BOSS: {
        id: 'FULL_HOUSE_BOSS', name: 'Full House', category: 'hands',
        description: 'Boats for days',
        checkHandTypes: (handTypes) => {
            const fh = handTypes.find(h => h.hand_type === 7);
            return fh && fh.times_made >= 15;
        }
    },
    QUAD_GOD: {
        id: 'QUAD_GOD', name: 'Quad God', category: 'hands',
        description: 'Has made four of a kind multiple times',
        checkHandTypes: (handTypes) => {
            const quads = handTypes.find(h => h.hand_type === 8);
            return quads && quads.times_made >= 5;
        }
    },

    // === ACHIEVEMENT TITLES ===
    ROYAL: {
        id: 'ROYAL', name: 'Royal', category: 'achievement',
        description: 'Has hit a Royal Flush',
        checkHandTypes: (handTypes) => {
            const royal = handTypes.find(h => h.hand_type === 10);
            return royal && royal.times_made >= 1;
        }
    },
    UNTOUCHABLE: {
        id: 'UNTOUCHABLE', name: 'Untouchable', category: 'achievement',
        description: '10+ hands won in a row',
        check: (stats) => stats.longest_win_streak >= 10
    },
    COMEBACK_KID: {
        id: 'COMEBACK_KID', name: 'Comeback Kid', category: 'achievement',
        description: 'Won from behind on multiple occasions',
        check: (stats) => stats.suckout_wins >= 10
    },
    HIGH_ROLLER: {
        id: 'HIGH_ROLLER', name: 'High Roller', category: 'achievement',
        description: 'Played 1000+ hands',
        check: (stats) => stats.hands_played >= 1000
    },
    VETERAN: {
        id: 'VETERAN', name: 'Veteran', category: 'achievement',
        description: '100+ play sessions',
        check: (stats) => stats.sessions_played >= 100
    },
    GRINDER: {
        id: 'GRINDER', name: 'Grinder', category: 'achievement',
        description: 'Played 5000+ hands',
        check: (stats) => stats.hands_played >= 5000
    },

    // === RARE/SECRET TITLES ===
    GHOST: {
        id: 'GHOST', name: 'Ghost', category: 'rare',
        description: 'Won without ever going to showdown in a session',
        // This is checked differently — via session analysis, not aggregated stats
        check: () => false // Manually awarded
    },
    MARATHON: {
        id: 'MARATHON', name: 'Marathon', category: 'rare',
        description: 'Played an 8+ hour session',
        check: (stats) => stats.total_play_time_seconds >= 28800 // Checked via session records
    }
};

class TitleEngine {
    /**
     * Evaluate all titles for a player based on current stats
     * Called after StatsEngine updates stats
     * 
     * @param {string} playerId
     * @returns {Object} { awarded: [title_ids], revoked: [title_ids] }
     */
    static async evaluateTitles(playerId) {
        if (!database.isConnected) return { awarded: [], revoked: [] };

        try {
            const StatsEngine = require('./StatsEngine');
            const stats = await StatsEngine.getPlayerStats(playerId);
            const handTypes = await StatsEngine.getHandTypeStats(playerId);

            // Get current titles
            const currentTitles = await database.query(
                'SELECT title_id FROM player_titles WHERE player_id = ?',
                [playerId]
            );
            const currentTitleIds = new Set(currentTitles.map(t => t.title_id));

            const awarded = [];
            const revoked = [];

            for (const [titleId, title] of Object.entries(TITLES)) {
                let earned = false;

                // Check stat-based criteria
                if (title.check) {
                    earned = title.check(stats);
                }

                // Check hand-type-based criteria
                if (title.checkHandTypes && !earned) {
                    earned = title.checkHandTypes(handTypes);
                }

                if (earned && !currentTitleIds.has(titleId)) {
                    // Award new title
                    await database.query(`
                        INSERT IGNORE INTO player_titles (player_id, title_id, title_name, title_category, is_active)
                        VALUES (?, ?, ?, ?, FALSE)
                    `, [playerId, titleId, title.name, title.category]);
                    awarded.push(titleId);

                    gameLogger.gameEvent('TITLES', 'Title awarded', {
                        playerId, titleId, titleName: title.name
                    });

                } else if (!earned && currentTitleIds.has(titleId) && title.category !== 'achievement' && title.category !== 'rare') {
                    // Revoke non-achievement titles (achievements are permanent)
                    await database.query(
                        'DELETE FROM player_titles WHERE player_id = ? AND title_id = ?',
                        [playerId, titleId]
                    );
                    revoked.push(titleId);

                    gameLogger.gameEvent('TITLES', 'Title revoked', {
                        playerId, titleId, titleName: title.name
                    });
                }
            }

            return { awarded, revoked };

        } catch (err) {
            gameLogger.error('TITLES', 'Error evaluating titles', {
                error: err.message, playerId
            });
            return { awarded: [], revoked: [] };
        }
    }

    /**
     * Get all titles for a player
     */
    static async getPlayerTitles(playerId) {
        return await database.query(
            'SELECT * FROM player_titles WHERE player_id = ? ORDER BY earned_at DESC',
            [playerId]
        );
    }

    /**
     * Get active (displayed) title for a player
     */
    static async getActiveTitle(playerId) {
        return await database.queryOne(
            'SELECT * FROM player_titles WHERE player_id = ? AND is_active = TRUE',
            [playerId]
        );
    }

    /**
     * Set which title a player displays
     */
    static async setActiveTitle(playerId, titleId) {
        // Deactivate all titles first
        await database.query(
            'UPDATE player_titles SET is_active = FALSE WHERE player_id = ?',
            [playerId]
        );

        if (titleId) {
            // Activate the selected one
            await database.query(
                'UPDATE player_titles SET is_active = TRUE WHERE player_id = ? AND title_id = ?',
                [playerId, titleId]
            );
        }

        return { success: true };
    }

    /**
     * Get title definition
     */
    static getTitleInfo(titleId) {
        return TITLES[titleId] || null;
    }

    /**
     * Get all title definitions (for client display)
     */
    static getAllTitleDefinitions() {
        return Object.entries(TITLES).map(([id, title]) => ({
            id,
            name: title.name,
            category: title.category,
            description: title.description
        }));
    }
}

TitleEngine.TITLES = TITLES;

module.exports = TitleEngine;
