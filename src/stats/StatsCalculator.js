/**
 * StatsCalculator - Computes derived stats, comparisons, and trends
 * 
 * This module provides on-demand stat calculations that go beyond
 * what StatsEngine stores incrementally. It computes:
 * - Compare-to-average (how does this player compare to the population)
 * - Trend analysis (is the player improving or declining)
 * - Session history summaries
 * - Best/worst pocket breakdowns
 * - Hand type analysis with expected rate comparison
 */

const database = require('../database/Database');
const gameLogger = require('../utils/GameLogger');

// Expected hand type frequencies in Texas Hold'em (approximate)
// These are the odds of making each hand type at showdown
const EXPECTED_HAND_RATES = {
    1: 17.4,    // High Card
    2: 43.8,    // Pair
    3: 23.5,    // Two Pair
    4: 4.83,    // Three of a Kind
    5: 4.62,    // Straight
    6: 3.03,    // Flush
    7: 2.60,    // Full House
    8: 0.168,   // Four of a Kind
    9: 0.0279,  // Straight Flush
    10: 0.0032  // Royal Flush
};

const HAND_RANK_NAMES = {
    1: 'High Card', 2: 'Pair', 3: 'Two Pair', 4: 'Three of a Kind',
    5: 'Straight', 6: 'Flush', 7: 'Full House', 8: 'Four of a Kind',
    9: 'Straight Flush', 10: 'Royal Flush'
};

class StatsCalculator {

    /**
     * Get full player stats with compare-to-average data
     * Returns the player's stats alongside the global average for each metric
     */
    static async getStatsWithComparison(playerId) {
        if (!database.isConnected) return null;

        try {
            // Get player's stats
            const playerStats = await database.queryOne(
                'SELECT * FROM player_stats WHERE player_id = ?', [playerId]
            );

            // Get global averages (players with at least 20 hands to avoid skewing)
            const globalAvg = await database.queryOne(`
                SELECT 
                    AVG(hands_won / GREATEST(hands_played, 1) * 100) as avg_win_rate,
                    AVG(vpip_hands / GREATEST(total_hands_dealt, 1) * 100) as avg_vpip,
                    AVG(pfr_hands / GREATEST(total_hands_dealt, 1) * 100) as avg_pfr,
                    AVG((total_bets + total_raises) / GREATEST(total_calls, 1)) as avg_aggression,
                    AVG(showdown_wins / GREATEST(showdown_hands, 1) * 100) as avg_showdown_win,
                    AVG(cbet_successes / GREATEST(cbet_attempts, 1) * 100) as avg_cbet_success,
                    AVG(steal_successes / GREATEST(steal_attempts, 1) * 100) as avg_steal_success,
                    AVG(bluff_successes / GREATEST(bluff_attempts, 1) * 100) as avg_bluff_success,
                    AVG(bluff_detections / GREATEST(bluff_detection_opportunities, 1) * 100) as avg_bluff_detect,
                    AVG(river_draw_hits / GREATEST(river_draw_attempts, 1) * 100) as avg_river_luck,
                    AVG(suckout_wins / GREATEST(suckout_opportunities, 1) * 100) as avg_suckout_rate,
                    AVG(total_chips_won - total_chips_lost) as avg_net_chips,
                    COUNT(*) as total_players
                FROM player_stats
                WHERE hands_played >= 20
            `);

            if (!playerStats) {
                return {
                    player: null,
                    globalAvg: globalAvg || {},
                    comparisons: {}
                };
            }

            const hp = playerStats.hands_played || 1;
            const td = playerStats.total_hands_dealt || 1;

            // Calculate player's derived stats
            const playerDerived = {
                winRate: (playerStats.hands_won / hp * 100),
                vpip: (playerStats.vpip_hands / td * 100),
                pfr: (playerStats.pfr_hands / td * 100),
                aggression: playerStats.total_calls > 0 ? ((playerStats.total_bets + playerStats.total_raises) / playerStats.total_calls) : 0,
                showdownWin: playerStats.showdown_hands > 0 ? (playerStats.showdown_wins / playerStats.showdown_hands * 100) : 0,
                cbetSuccess: playerStats.cbet_attempts > 0 ? (playerStats.cbet_successes / playerStats.cbet_attempts * 100) : 0,
                stealSuccess: playerStats.steal_attempts > 0 ? (playerStats.steal_successes / playerStats.steal_attempts * 100) : 0,
                bluffSuccess: playerStats.bluff_attempts > 0 ? (playerStats.bluff_successes / playerStats.bluff_attempts * 100) : 0,
                bluffDetect: playerStats.bluff_detection_opportunities > 0 ? (playerStats.bluff_detections / playerStats.bluff_detection_opportunities * 100) : 0,
                riverLuck: playerStats.river_draw_attempts > 0 ? (playerStats.river_draw_hits / playerStats.river_draw_attempts * 100) : 0,
                suckoutRate: playerStats.suckout_opportunities > 0 ? (playerStats.suckout_wins / playerStats.suckout_opportunities * 100) : 0,
                netChips: playerStats.total_chips_won - playerStats.total_chips_lost
            };

            // Build comparisons — positive means above average, negative means below
            const ga = globalAvg || {};
            const comparisons = {
                winRate: { player: playerDerived.winRate, avg: ga.avg_win_rate || 0, diff: playerDerived.winRate - (ga.avg_win_rate || 0) },
                vpip: { player: playerDerived.vpip, avg: ga.avg_vpip || 0, diff: playerDerived.vpip - (ga.avg_vpip || 0) },
                pfr: { player: playerDerived.pfr, avg: ga.avg_pfr || 0, diff: playerDerived.pfr - (ga.avg_pfr || 0) },
                aggression: { player: playerDerived.aggression, avg: ga.avg_aggression || 0, diff: playerDerived.aggression - (ga.avg_aggression || 0) },
                showdownWin: { player: playerDerived.showdownWin, avg: ga.avg_showdown_win || 0, diff: playerDerived.showdownWin - (ga.avg_showdown_win || 0) },
                cbetSuccess: { player: playerDerived.cbetSuccess, avg: ga.avg_cbet_success || 0, diff: playerDerived.cbetSuccess - (ga.avg_cbet_success || 0) },
                stealSuccess: { player: playerDerived.stealSuccess, avg: ga.avg_steal_success || 0, diff: playerDerived.stealSuccess - (ga.avg_steal_success || 0) },
                bluffSuccess: { player: playerDerived.bluffSuccess, avg: ga.avg_bluff_success || 0, diff: playerDerived.bluffSuccess - (ga.avg_bluff_success || 0) },
                bluffDetect: { player: playerDerived.bluffDetect, avg: ga.avg_bluff_detect || 0, diff: playerDerived.bluffDetect - (ga.avg_bluff_detect || 0) },
                riverLuck: { player: playerDerived.riverLuck, avg: ga.avg_river_luck || 0, diff: playerDerived.riverLuck - (ga.avg_river_luck || 0) },
                suckoutRate: { player: playerDerived.suckoutRate, avg: ga.avg_suckout_rate || 0, diff: playerDerived.suckoutRate - (ga.avg_suckout_rate || 0) },
                netChips: { player: playerDerived.netChips, avg: ga.avg_net_chips || 0, diff: playerDerived.netChips - (ga.avg_net_chips || 0) }
            };

            // Round all values
            for (const key of Object.keys(comparisons)) {
                comparisons[key].player = parseFloat(comparisons[key].player.toFixed(2));
                comparisons[key].avg = parseFloat((comparisons[key].avg || 0).toFixed(2));
                comparisons[key].diff = parseFloat(comparisons[key].diff.toFixed(2));
            }

            return {
                player: playerStats,
                derived: playerDerived,
                globalAvg: ga,
                comparisons,
                totalPlayersInPool: ga.total_players || 0
            };

        } catch (err) {
            gameLogger.error('STATS_CALC', 'getStatsWithComparison failed', { error: err.message });
            return null;
        }
    }

    /**
     * Get hand type stats with comparison to expected rates
     * Shows if a player is a "flush magnet", "straight machine", etc.
     */
    static async getHandTypeComparison(playerId) {
        if (!database.isConnected) return [];

        try {
            const rows = await database.query(
                'SELECT * FROM player_hand_type_stats WHERE player_id = ? ORDER BY hand_type ASC',
                [playerId]
            );

            const totalMade = rows.reduce((sum, r) => sum + r.times_made, 0) || 1;

            return rows.map(row => {
                const playerRate = (row.times_made / totalMade * 100);
                const expectedRate = EXPECTED_HAND_RATES[row.hand_type] || 0;
                const diff = playerRate - expectedRate;
                const netChips = row.total_chips_won - row.total_chips_lost;
                const winRate = row.times_made > 0 ? (row.times_won / row.times_made * 100) : 0;

                return {
                    handType: row.hand_type,
                    handTypeName: HAND_RANK_NAMES[row.hand_type] || row.hand_type_name,
                    timesMade: row.times_made,
                    timesWon: row.times_won,
                    timesLost: row.times_lost,
                    winRate: parseFloat(winRate.toFixed(1)),
                    playerRate: parseFloat(playerRate.toFixed(2)),
                    expectedRate: parseFloat(expectedRate.toFixed(2)),
                    rateDiff: parseFloat(diff.toFixed(2)),
                    isAboveAverage: diff > 0.5,
                    isBelowAverage: diff < -0.5,
                    netChips,
                    chipsPerHand: row.times_made > 0 ? Math.round((row.total_chips_won - row.total_chips_lost) / row.times_made) : 0,
                    lastHitAt: row.last_hit_at
                };
            });

        } catch (err) {
            gameLogger.error('STATS_CALC', 'getHandTypeComparison failed', { error: err.message });
            return [];
        }
    }

    /**
     * Get best and worst pockets (top 5 / bottom 5 by win rate, min 10 hands)
     */
    static async getPocketBreakdown(playerId) {
        if (!database.isConnected) return { best: [], worst: [], mostProfitable: [], mostPlayed: [] };

        try {
            const rows = await database.query(
                'SELECT * FROM player_pocket_stats WHERE player_id = ? ORDER BY times_dealt DESC',
                [playerId]
            );

            const enriched = rows.map(r => ({
                pocket: r.pocket_category,
                timesDealt: r.times_dealt,
                timesPlayed: r.times_played,
                timesWon: r.times_won,
                timesFolded: r.times_folded,
                winRate: r.times_played > 0 ? parseFloat((r.times_won / r.times_played * 100).toFixed(1)) : 0,
                playRate: r.times_dealt > 0 ? parseFloat((r.times_played / r.times_dealt * 100).toFixed(1)) : 0,
                netChips: r.total_chips_won - r.total_chips_lost,
                chipsPerHand: r.times_played > 0 ? Math.round((r.total_chips_won - r.total_chips_lost) / r.times_played) : 0
            }));

            // Best by win rate (min 10 played)
            const qualified = enriched.filter(p => p.timesPlayed >= 10);
            const best = [...qualified].sort((a, b) => b.winRate - a.winRate).slice(0, 5);
            const worst = [...qualified].sort((a, b) => a.winRate - b.winRate).slice(0, 5);

            // Most profitable by net chips (no minimum)
            const mostProfitable = [...enriched].sort((a, b) => b.netChips - a.netChips).slice(0, 5);

            // Most played
            const mostPlayed = [...enriched].sort((a, b) => b.timesDealt - a.timesDealt).slice(0, 10);

            return { best, worst, mostProfitable, mostPlayed, all: enriched };

        } catch (err) {
            gameLogger.error('STATS_CALC', 'getPocketBreakdown failed', { error: err.message });
            return { best: [], worst: [], mostProfitable: [], mostPlayed: [], all: [] };
        }
    }

    /**
     * Get trend data — performance over last N sessions
     * Shows if player is improving or declining
     */
    static async getTrends(playerId, sessionCount = 20) {
        if (!database.isConnected) return { sessions: [], trend: 'neutral' };

        try {
            // Get recent sessions
            const sessions = await database.query(`
                SELECT session_id, table_id, start_time, end_time, hands_played,
                       chips_start, chips_end, profit_loss
                FROM player_sessions
                WHERE player_id = ? AND end_time IS NOT NULL
                ORDER BY start_time DESC
                LIMIT ?
            `, [playerId, sessionCount]);

            if (sessions.length < 2) {
                return { sessions, trend: 'insufficient_data', trendScore: 0 };
            }

            // Calculate trend (compare first half avg profit to second half)
            const mid = Math.floor(sessions.length / 2);
            const recentHalf = sessions.slice(0, mid);
            const olderHalf = sessions.slice(mid);

            const recentAvgProfit = recentHalf.reduce((s, ses) => s + (ses.profit_loss || 0), 0) / (recentHalf.length || 1);
            const olderAvgProfit = olderHalf.reduce((s, ses) => s + (ses.profit_loss || 0), 0) / (olderHalf.length || 1);

            const trendScore = recentAvgProfit - olderAvgProfit;
            let trend = 'neutral';
            if (trendScore > 500) trend = 'improving';
            else if (trendScore > 2000) trend = 'hot_streak';
            else if (trendScore < -500) trend = 'declining';
            else if (trendScore < -2000) trend = 'cold_streak';

            // Win rate trend from recent hand_history
            const recentWinRate = await database.queryOne(`
                SELECT 
                    COUNT(*) as total,
                    SUM(was_winner) as wins
                FROM hand_history
                WHERE player_id = ?
                ORDER BY played_at DESC
                LIMIT 100
            `, [playerId]);

            const last100WinRate = recentWinRate && recentWinRate.total > 0 
                ? parseFloat((recentWinRate.wins / recentWinRate.total * 100).toFixed(1))
                : 0;

            return {
                sessions: sessions.map(s => ({
                    sessionId: s.session_id,
                    startTime: s.start_time,
                    endTime: s.end_time,
                    handsPlayed: s.hands_played,
                    chipsStart: s.chips_start,
                    chipsEnd: s.chips_end,
                    profitLoss: s.profit_loss,
                    durationMinutes: s.end_time && s.start_time 
                        ? Math.round((new Date(s.end_time) - new Date(s.start_time)) / 60000)
                        : 0
                })),
                trend,
                trendScore: Math.round(trendScore),
                recentAvgProfit: Math.round(recentAvgProfit),
                olderAvgProfit: Math.round(olderAvgProfit),
                last100WinRate
            };

        } catch (err) {
            gameLogger.error('STATS_CALC', 'getTrends failed', { error: err.message });
            return { sessions: [], trend: 'error', trendScore: 0 };
        }
    }

    /**
     * Get rarest hands hit — lifetime quads, straight flushes, royals with timestamps
     */
    static async getRareHands(playerId) {
        if (!database.isConnected) return [];

        try {
            return await database.query(`
                SELECT hand_number, table_name, final_hand_rank, final_hand_name,
                       hole_cards, community_cards, pot_size, chips_won_lost, played_at
                FROM hand_history
                WHERE player_id = ? AND final_hand_rank >= 8
                ORDER BY final_hand_rank DESC, played_at DESC
                LIMIT 50
            `, [playerId]);
        } catch (err) {
            gameLogger.error('STATS_CALC', 'getRareHands failed', { error: err.message });
            return [];
        }
    }

    /**
     * Get full player profile card data (for tap-to-view at table)
     */
    static async getPlayerProfile(playerId) {
        if (!database.isConnected) return null;

        try {
            const [stats, handTypes, pockets, user, titles, crew] = await Promise.all([
                database.queryOne('SELECT * FROM player_stats WHERE player_id = ?', [playerId]),
                database.query('SELECT * FROM player_hand_type_stats WHERE player_id = ? ORDER BY total_chips_won - total_chips_lost DESC LIMIT 1', [playerId]),
                database.query('SELECT * FROM player_pocket_stats WHERE player_id = ? AND times_played >= 5 ORDER BY times_won / GREATEST(times_played, 1) DESC LIMIT 1', [playerId]),
                database.queryOne('SELECT id, username, level, xp, chips, archetype, gender FROM users WHERE id = ?', [playerId]),
                database.queryOne('SELECT title_name FROM player_titles WHERE player_id = ? AND is_active = 1 LIMIT 1', [playerId]),
                database.queryOne(`
                    SELECT c.name as crew_name, c.tag as crew_tag, cm.role
                    FROM crew_members cm
                    JOIN crews c ON cm.crew_id = c.id
                    WHERE cm.player_id = ?
                    LIMIT 1
                `, [playerId])
            ]);

            const hp = stats?.hands_played || 1;
            const td = stats?.total_hands_dealt || 1;

            return {
                userId: playerId,
                username: user?.username || 'Unknown',
                level: user?.level || 1,
                xp: user?.xp || 0,
                chips: user?.chips || 0,
                archetype: user?.archetype || null,
                gender: user?.gender || null,
                activeTitle: titles?.title_name || null,
                crewName: crew?.crew_name || null,
                crewTag: crew?.crew_tag || null,
                crewRole: crew?.role || null,
                stats: stats ? {
                    handsPlayed: stats.hands_played,
                    winRate: parseFloat((stats.hands_won / hp * 100).toFixed(1)),
                    vpip: parseFloat((stats.vpip_hands / td * 100).toFixed(1)),
                    aggressionFactor: stats.total_calls > 0 ? parseFloat(((stats.total_bets + stats.total_raises) / stats.total_calls).toFixed(2)) : 0,
                    bluffSuccessRate: stats.bluff_attempts > 0 ? parseFloat((stats.bluff_successes / stats.bluff_attempts * 100).toFixed(1)) : 0,
                    showdownWinRate: stats.showdown_hands > 0 ? parseFloat((stats.showdown_wins / stats.showdown_hands * 100).toFixed(1)) : 0,
                    biggestPotWon: stats.biggest_pot_won,
                    longestWinStreak: stats.longest_win_streak,
                    netChips: stats.total_chips_won - stats.total_chips_lost
                } : null,
                favoriteHandType: handTypes.length > 0 ? handTypes[0].hand_type_name : null,
                bestPocket: pockets.length > 0 ? pockets[0].pocket_category : null
            };

        } catch (err) {
            gameLogger.error('STATS_CALC', 'getPlayerProfile failed', { error: err.message });
            return null;
        }
    }

    /**
     * Get spectator leaderboard — best predictors by side bet accuracy
     */
    static async getSpectatorLeaderboard(limit = 20) {
        if (!database.isConnected) return [];

        try {
            return await database.query(`
                SELECT 
                    sb.spectator_id,
                    u.username,
                    COUNT(*) as total_bets,
                    SUM(CASE WHEN sb.result = 'won' THEN 1 ELSE 0 END) as bets_won,
                    SUM(CASE WHEN sb.result = 'lost' THEN 1 ELSE 0 END) as bets_lost,
                    SUM(sb.amount) as total_wagered,
                    SUM(sb.payout) as total_payout,
                    SUM(sb.payout) - SUM(sb.amount) as net_profit,
                    ROUND(SUM(CASE WHEN sb.result = 'won' THEN 1 ELSE 0 END) / COUNT(*) * 100, 1) as accuracy
                FROM spectator_bets sb
                LEFT JOIN users u ON sb.spectator_id = u.id
                WHERE sb.result != 'pending'
                GROUP BY sb.spectator_id, u.username
                HAVING total_bets >= 5
                ORDER BY accuracy DESC, net_profit DESC
                LIMIT ?
            `, [limit]);
        } catch (err) {
            gameLogger.error('STATS_CALC', 'getSpectatorLeaderboard failed', { error: err.message });
            return [];
        }
    }
}

module.exports = StatsCalculator;
