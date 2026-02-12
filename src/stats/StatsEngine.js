/**
 * StatsEngine - Processes completed hands and records all stats
 * 
 * This is the heart of the stats system. After every hand completes,
 * Table.js calls StatsEngine.processHand() with full hand data.
 * The engine writes to hand_history and updates all aggregated stats.
 */

const database = require('../database/Database');
const gameLogger = require('../utils/GameLogger');

// Hand rank constants (must match HandEvaluator)
const HAND_RANK_NAMES = {
    1: 'High Card',
    2: 'Pair',
    3: 'Two Pair',
    4: 'Three of a Kind',
    5: 'Straight',
    6: 'Flush',
    7: 'Full House',
    8: 'Four of a Kind',
    9: 'Straight Flush',
    10: 'Royal Flush'
};

// Premium starting hands
const PREMIUM_HANDS = ['AA', 'KK', 'QQ', 'JJ', 'AKs', 'AKo', 'AQs'];

class StatsEngine {
    /**
     * Process a completed hand — called by Table.js after every hand ends
     * 
     * @param {Object} handData - Full hand data from Table
     * @param {string} handData.tableId - Table ID
     * @param {string} handData.tableName - Table name
     * @param {number} handData.handNumber - Hand number at this table
     * @param {Array} handData.communityCards - Community cards [{rank, suit}, ...]
     * @param {number} handData.potSize - Total pot size
     * @param {string} handData.phaseReached - Last phase reached (preflop/flop/turn/river/showdown)
     * @param {boolean} handData.wentToShowdown - Whether hand went to showdown
     * @param {Array} handData.players - Array of player data for this hand:
     *   {
     *     playerId, playerName, seatIndex, holeCards, 
     *     finalHandRank, finalHandName, chipsWonLost, wasWinner,
     *     actions: [{phase, action, amount}],
     *     isVoluntary, didRaisePF, didCBet, cbetSuccess,
     *     wasStealAttempt, stealSuccess, chipsBefore, chipsAfter,
     *     hadDrawOnFlop, drawCompleted, wasBehindOnFlop, wonFromBehind,
     *     wasBluff, bluffSuccess, opponentWasBluffing, calledBluffCorrectly
     *   }
     */
    static async processHand(handData) {
        if (!database.isConnected) {
            gameLogger.error('STATS', 'Database not connected, skipping stats processing', {});
            return;
        }

        try {
            const {
                tableId, tableName, handNumber, communityCards,
                potSize, phaseReached, wentToShowdown, players
            } = handData;

            // Write hand_history record for each player
            for (const player of players) {
                if (!player.playerId) continue;

                const pocketCategory = StatsEngine.categorizePocket(player.holeCards);

                await database.query(`
                    INSERT INTO hand_history (
                        table_id, table_name, hand_number, player_id, player_name,
                        seat_index, hole_cards, community_cards, actions_taken,
                        final_hand_rank, final_hand_name, pot_size, chips_won_lost,
                        was_winner, went_to_showdown, phase_reached,
                        starting_hand_category, is_voluntary, did_raise_preflop,
                        did_cbet, cbet_success, was_steal_attempt, steal_success,
                        was_bluff, bluff_success, opponent_was_bluffing,
                        called_bluff_correctly, had_draw_on_flop, draw_completed,
                        was_behind_on_flop, won_from_behind
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    tableId, tableName, handNumber, player.playerId, player.playerName,
                    player.seatIndex,
                    JSON.stringify(player.holeCards || []),
                    JSON.stringify(communityCards || []),
                    JSON.stringify(player.actions || []),
                    player.finalHandRank || 0,
                    player.finalHandName || 'Folded',
                    potSize || 0,
                    player.chipsWonLost || 0,
                    player.wasWinner ? 1 : 0,
                    wentToShowdown ? 1 : 0,
                    phaseReached || 'preflop',
                    pocketCategory,
                    player.isVoluntary ? 1 : 0,
                    player.didRaisePF ? 1 : 0,
                    player.didCBet ? 1 : 0,
                    player.cbetSuccess ? 1 : 0,
                    player.wasStealAttempt ? 1 : 0,
                    player.stealSuccess ? 1 : 0,
                    player.wasBluff ? 1 : 0,
                    player.bluffSuccess ? 1 : 0,
                    player.opponentWasBluffing ? 1 : 0,
                    player.calledBluffCorrectly ? 1 : 0,
                    player.hadDrawOnFlop ? 1 : 0,
                    player.drawCompleted ? 1 : 0,
                    player.wasBehindOnFlop ? 1 : 0,
                    player.wonFromBehind ? 1 : 0
                ]);

                // Update aggregated player stats
                await StatsEngine.updatePlayerStats(player, wentToShowdown, potSize);

                // Update hand type stats (only if hand went to showdown or player won)
                if (player.finalHandRank > 0 && (wentToShowdown || player.wasWinner)) {
                    await StatsEngine.updateHandTypeStats(player);
                }

                // Update pocket stats
                if (pocketCategory) {
                    await StatsEngine.updatePocketStats(player, pocketCategory);
                }
            }

            gameLogger.gameEvent('STATS', 'Hand processed', {
                tableId, handNumber, playerCount: players.length, potSize
            });

        } catch (err) {
            gameLogger.error('STATS', 'Error processing hand', {
                error: err.message,
                stack: err.stack,
                handData: { tableId: handData.tableId, handNumber: handData.handNumber }
            });
        }
    }

    /**
     * Update aggregated player stats from a single hand
     */
    static async updatePlayerStats(player, wentToShowdown, potSize) {
        const playerId = player.playerId;
        const chipsWon = player.chipsWonLost > 0 ? player.chipsWonLost : 0;
        const chipsLost = player.chipsWonLost < 0 ? Math.abs(player.chipsWonLost) : 0;

        // Count action types from this hand
        let bets = 0, raises = 0, calls = 0, folds = 0;
        for (const action of (player.actions || [])) {
            switch (action.action) {
                case 'bet': bets++; break;
                case 'raise': raises++; break;
                case 'call': calls++; break;
                case 'fold': folds++; break;
                case 'allin':
                    // All-in counts as a raise/bet
                    raises++;
                    break;
            }
        }

        // Upsert player_stats
        await database.query(`
            INSERT INTO player_stats (player_id, hands_played, hands_won,
                total_chips_won, total_chips_lost, biggest_pot_won, biggest_pot_lost,
                current_win_streak, current_lose_streak, longest_win_streak, longest_lose_streak,
                vpip_hands, pfr_hands, total_bets, total_raises, total_calls, total_folds,
                showdown_hands, showdown_wins,
                cbet_attempts, cbet_successes, steal_attempts, steal_successes,
                bluff_attempts, bluff_successes,
                bluff_detection_opportunities, bluff_detections,
                fold_to_bet_count, fold_to_bet_opportunities,
                river_draw_attempts, river_draw_hits,
                turn_draw_attempts, turn_draw_hits,
                flop_connect_hands, flop_total_hands,
                suckout_opportunities, suckout_wins,
                bad_beat_opportunities, bad_beat_losses,
                premium_hands_dealt, total_hands_dealt)
            VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                hands_played = hands_played + 1,
                hands_won = hands_won + VALUES(hands_won),
                total_chips_won = total_chips_won + VALUES(total_chips_won),
                total_chips_lost = total_chips_lost + VALUES(total_chips_lost),
                biggest_pot_won = GREATEST(biggest_pot_won, VALUES(biggest_pot_won)),
                biggest_pot_lost = GREATEST(biggest_pot_lost, VALUES(biggest_pot_lost)),
                current_win_streak = IF(VALUES(hands_won) > 0, current_win_streak + 1, 0),
                current_lose_streak = IF(VALUES(hands_won) = 0 AND VALUES(total_chips_lost) > 0, current_lose_streak + 1, 0),
                longest_win_streak = GREATEST(longest_win_streak, IF(VALUES(hands_won) > 0, current_win_streak + 1, current_win_streak)),
                longest_lose_streak = GREATEST(longest_lose_streak, IF(VALUES(hands_won) = 0 AND VALUES(total_chips_lost) > 0, current_lose_streak + 1, current_lose_streak)),
                vpip_hands = vpip_hands + VALUES(vpip_hands),
                pfr_hands = pfr_hands + VALUES(pfr_hands),
                total_bets = total_bets + VALUES(total_bets),
                total_raises = total_raises + VALUES(total_raises),
                total_calls = total_calls + VALUES(total_calls),
                total_folds = total_folds + VALUES(total_folds),
                showdown_hands = showdown_hands + VALUES(showdown_hands),
                showdown_wins = showdown_wins + VALUES(showdown_wins),
                cbet_attempts = cbet_attempts + VALUES(cbet_attempts),
                cbet_successes = cbet_successes + VALUES(cbet_successes),
                steal_attempts = steal_attempts + VALUES(steal_attempts),
                steal_successes = steal_successes + VALUES(steal_successes),
                bluff_attempts = bluff_attempts + VALUES(bluff_attempts),
                bluff_successes = bluff_successes + VALUES(bluff_successes),
                bluff_detection_opportunities = bluff_detection_opportunities + VALUES(bluff_detection_opportunities),
                bluff_detections = bluff_detections + VALUES(bluff_detections),
                fold_to_bet_count = fold_to_bet_count + VALUES(fold_to_bet_count),
                fold_to_bet_opportunities = fold_to_bet_opportunities + VALUES(fold_to_bet_opportunities),
                river_draw_attempts = river_draw_attempts + VALUES(river_draw_attempts),
                river_draw_hits = river_draw_hits + VALUES(river_draw_hits),
                turn_draw_attempts = turn_draw_attempts + VALUES(turn_draw_attempts),
                turn_draw_hits = turn_draw_hits + VALUES(turn_draw_hits),
                flop_connect_hands = flop_connect_hands + VALUES(flop_connect_hands),
                flop_total_hands = flop_total_hands + VALUES(flop_total_hands),
                suckout_opportunities = suckout_opportunities + VALUES(suckout_opportunities),
                suckout_wins = suckout_wins + VALUES(suckout_wins),
                bad_beat_opportunities = bad_beat_opportunities + VALUES(bad_beat_opportunities),
                bad_beat_losses = bad_beat_losses + VALUES(bad_beat_losses),
                premium_hands_dealt = premium_hands_dealt + VALUES(premium_hands_dealt),
                total_hands_dealt = total_hands_dealt + 1,
                updated_at = CURRENT_TIMESTAMP
        `, [
            playerId,
            player.wasWinner ? 1 : 0,
            chipsWon, chipsLost,
            player.wasWinner ? potSize : 0,
            !player.wasWinner ? chipsLost : 0,
            // Initial streak values
            player.wasWinner ? 1 : 0,
            (!player.wasWinner && chipsLost > 0) ? 1 : 0,
            player.wasWinner ? 1 : 0,
            (!player.wasWinner && chipsLost > 0) ? 1 : 0,
            // Play style
            player.isVoluntary ? 1 : 0,
            player.didRaisePF ? 1 : 0,
            bets, raises, calls, folds,
            // Showdown
            wentToShowdown ? 1 : 0,
            (wentToShowdown && player.wasWinner) ? 1 : 0,
            // C-bet
            player.didCBet ? 1 : 0,
            (player.didCBet && player.cbetSuccess) ? 1 : 0,
            // Steal
            player.wasStealAttempt ? 1 : 0,
            (player.wasStealAttempt && player.stealSuccess) ? 1 : 0,
            // Bluff
            player.wasBluff ? 1 : 0,
            (player.wasBluff && player.bluffSuccess) ? 1 : 0,
            // Bluff detection
            player.opponentWasBluffing ? 1 : 0,
            (player.opponentWasBluffing && player.calledBluffCorrectly) ? 1 : 0,
            // Fold equity (opponent facing our bet folded)
            0, 0, // Fold equity tracked differently
            // River draws
            (player.hadDrawOnFlop && player.actions?.some(a => a.phase === 'river')) ? 1 : 0,
            (player.hadDrawOnFlop && player.drawCompleted && player.actions?.some(a => a.phase === 'river')) ? 1 : 0,
            // Turn draws
            (player.hadDrawOnFlop && player.actions?.some(a => a.phase === 'turn')) ? 1 : 0,
            (player.hadDrawOnFlop && player.drawCompleted && !player.actions?.some(a => a.phase === 'river')) ? 1 : 0,
            // Flop connect
            (player.finalHandRank >= 2 && player.actions?.some(a => a.phase === 'flop')) ? 1 : 0,
            player.actions?.some(a => a.phase === 'flop') ? 1 : 0,
            // Suckout
            player.wasBehindOnFlop ? 1 : 0,
            (player.wasBehindOnFlop && player.wonFromBehind) ? 1 : 0,
            // Bad beat (had strong hand but lost)
            (!player.wasWinner && player.finalHandRank >= 3) ? 1 : 0,
            (!player.wasWinner && player.finalHandRank >= 3) ? 1 : 0,
            // Premium hands
            StatsEngine.isPremiumHand(player.holeCards) ? 1 : 0,
            1 // total hands dealt always 1
        ]);
    }

    /**
     * Update hand type stats (how often player makes each hand type)
     */
    static async updateHandTypeStats(player) {
        if (!player.finalHandRank || player.finalHandRank <= 0) return;

        const handTypeName = HAND_RANK_NAMES[player.finalHandRank] || 'Unknown';
        const chipsWon = player.chipsWonLost > 0 ? player.chipsWonLost : 0;
        const chipsLost = player.chipsWonLost < 0 ? Math.abs(player.chipsWonLost) : 0;

        await database.query(`
            INSERT INTO player_hand_type_stats (player_id, hand_type, hand_type_name, times_made, times_won, times_lost, total_chips_won, total_chips_lost, last_hit_at)
            VALUES (?, ?, ?, 1, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON DUPLICATE KEY UPDATE
                times_made = times_made + 1,
                times_won = times_won + VALUES(times_won),
                times_lost = times_lost + VALUES(times_lost),
                total_chips_won = total_chips_won + VALUES(total_chips_won),
                total_chips_lost = total_chips_lost + VALUES(total_chips_lost),
                last_hit_at = CURRENT_TIMESTAMP
        `, [
            player.playerId,
            player.finalHandRank,
            handTypeName,
            player.wasWinner ? 1 : 0,
            !player.wasWinner ? 1 : 0,
            chipsWon,
            chipsLost
        ]);
    }

    /**
     * Update pocket/starting hand stats
     */
    static async updatePocketStats(player, pocketCategory) {
        const chipsWon = player.chipsWonLost > 0 ? player.chipsWonLost : 0;
        const chipsLost = player.chipsWonLost < 0 ? Math.abs(player.chipsWonLost) : 0;
        const folded = player.actions?.some(a => a.action === 'fold') || false;

        await database.query(`
            INSERT INTO player_pocket_stats (player_id, pocket_category, times_dealt, times_played, times_won, times_folded, total_chips_won, total_chips_lost)
            VALUES (?, ?, 1, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                times_dealt = times_dealt + 1,
                times_played = times_played + VALUES(times_played),
                times_won = times_won + VALUES(times_won),
                times_folded = times_folded + VALUES(times_folded),
                total_chips_won = total_chips_won + VALUES(total_chips_won),
                total_chips_lost = total_chips_lost + VALUES(total_chips_lost)
        `, [
            player.playerId,
            pocketCategory,
            folded ? 0 : 1,
            player.wasWinner ? 1 : 0,
            folded ? 1 : 0,
            chipsWon,
            chipsLost
        ]);
    }

    /**
     * Categorize a pocket hand (e.g., AA, AKs, AKo, 72o)
     */
    static categorizePocket(holeCards) {
        if (!holeCards || holeCards.length < 2) return null;

        const card1 = holeCards[0];
        const card2 = holeCards[1];
        if (!card1 || !card2 || !card1.rank || !card2.rank) return null;

        const RANK_ORDER = { 'A': 14, 'K': 13, 'Q': 12, 'J': 11, '10': 10, '9': 9, '8': 8, '7': 7, '6': 6, '5': 5, '4': 4, '3': 3, '2': 2 };
        
        const r1 = RANK_ORDER[card1.rank] || 0;
        const r2 = RANK_ORDER[card2.rank] || 0;
        const suited = card1.suit === card2.suit;

        // Sort higher rank first
        let high, low;
        if (r1 >= r2) {
            high = card1.rank;
            low = card2.rank;
        } else {
            high = card2.rank;
            low = card1.rank;
        }

        // Pair
        if (high === low) return `${high}${low}`;

        // Suited or offsuit
        return `${high}${low}${suited ? 's' : 'o'}`;
    }

    /**
     * Check if a hand is a premium starting hand
     */
    static isPremiumHand(holeCards) {
        const category = StatsEngine.categorizePocket(holeCards);
        if (!category) return false;
        return PREMIUM_HANDS.includes(category);
    }

    /**
     * Get player stats summary for display
     */
    static async getPlayerStats(playerId) {
        const stats = await database.queryOne('SELECT * FROM player_stats WHERE player_id = ?', [playerId]);
        if (!stats) return StatsEngine.getDefaultStats(playerId);

        // Calculate derived percentages
        return {
            ...stats,
            winRate: stats.hands_played > 0 ? (stats.hands_won / stats.hands_played * 100).toFixed(1) : 0,
            vpip: stats.total_hands_dealt > 0 ? (stats.vpip_hands / stats.total_hands_dealt * 100).toFixed(1) : 0,
            pfr: stats.total_hands_dealt > 0 ? (stats.pfr_hands / stats.total_hands_dealt * 100).toFixed(1) : 0,
            aggressionFactor: stats.total_calls > 0 ? ((stats.total_bets + stats.total_raises) / stats.total_calls).toFixed(2) : 0,
            showdownWinRate: stats.showdown_hands > 0 ? (stats.showdown_wins / stats.showdown_hands * 100).toFixed(1) : 0,
            cbetSuccessRate: stats.cbet_attempts > 0 ? (stats.cbet_successes / stats.cbet_attempts * 100).toFixed(1) : 0,
            stealSuccessRate: stats.steal_attempts > 0 ? (stats.steal_successes / stats.steal_attempts * 100).toFixed(1) : 0,
            bluffSuccessRate: stats.bluff_attempts > 0 ? (stats.bluff_successes / stats.bluff_attempts * 100).toFixed(1) : 0,
            bluffDetectionRate: stats.bluff_detection_opportunities > 0 ? (stats.bluff_detections / stats.bluff_detection_opportunities * 100).toFixed(1) : 0,
            foldEquity: stats.fold_to_bet_opportunities > 0 ? (stats.fold_to_bet_count / stats.fold_to_bet_opportunities * 100).toFixed(1) : 0,
            riverLuck: stats.river_draw_attempts > 0 ? (stats.river_draw_hits / stats.river_draw_attempts * 100).toFixed(1) : 0,
            turnLuck: stats.turn_draw_attempts > 0 ? (stats.turn_draw_hits / stats.turn_draw_attempts * 100).toFixed(1) : 0,
            flopConnectRate: stats.flop_total_hands > 0 ? (stats.flop_connect_hands / stats.flop_total_hands * 100).toFixed(1) : 0,
            suckoutRate: stats.suckout_opportunities > 0 ? (stats.suckout_wins / stats.suckout_opportunities * 100).toFixed(1) : 0,
            badBeatRate: stats.bad_beat_opportunities > 0 ? (stats.bad_beat_losses / stats.bad_beat_opportunities * 100).toFixed(1) : 0,
            premiumHandFrequency: stats.total_hands_dealt > 0 ? (stats.premium_hands_dealt / stats.total_hands_dealt * 100).toFixed(1) : 0,
            netChips: stats.total_chips_won - stats.total_chips_lost
        };
    }

    /**
     * Get hand type stats for a player
     */
    static async getHandTypeStats(playerId) {
        const rows = await database.query(
            'SELECT * FROM player_hand_type_stats WHERE player_id = ? ORDER BY hand_type ASC',
            [playerId]
        );
        return rows;
    }

    /**
     * Get pocket/starting hand stats for a player
     */
    static async getPocketStats(playerId) {
        const rows = await database.query(
            'SELECT * FROM player_pocket_stats WHERE player_id = ? ORDER BY times_dealt DESC',
            [playerId]
        );

        // Calculate win rate and profit per pocket
        return rows.map(row => ({
            ...row,
            winRate: row.times_played > 0 ? (row.times_won / row.times_played * 100).toFixed(1) : 0,
            netChips: row.total_chips_won - row.total_chips_lost,
            playRate: row.times_dealt > 0 ? (row.times_played / row.times_dealt * 100).toFixed(1) : 0
        }));
    }

    /**
     * Get hand history for a player (paginated)
     */
    static async getHandHistory(playerId, limit = 50, offset = 0) {
        return await database.query(
            'SELECT * FROM hand_history WHERE player_id = ? ORDER BY played_at DESC LIMIT ? OFFSET ?',
            [playerId, limit, offset]
        );
    }

    /**
     * Get a specific hand for replay (all player records for that hand)
     */
    static async getHandReplay(tableId, handNumber) {
        return await database.query(
            'SELECT * FROM hand_history WHERE table_id = ? AND hand_number = ? ORDER BY seat_index ASC',
            [tableId, handNumber]
        );
    }

    /**
     * Default stats for a player with no history
     */
    static getDefaultStats(playerId) {
        return {
            player_id: playerId,
            hands_played: 0, hands_won: 0,
            total_chips_won: 0, total_chips_lost: 0,
            biggest_pot_won: 0, biggest_pot_lost: 0,
            current_win_streak: 0, current_lose_streak: 0,
            longest_win_streak: 0, longest_lose_streak: 0,
            sessions_played: 0, total_play_time_seconds: 0,
            winRate: 0, vpip: 0, pfr: 0, aggressionFactor: 0,
            showdownWinRate: 0, cbetSuccessRate: 0, stealSuccessRate: 0,
            bluffSuccessRate: 0, bluffDetectionRate: 0, foldEquity: 0,
            riverLuck: 0, turnLuck: 0, flopConnectRate: 0,
            suckoutRate: 0, badBeatRate: 0, premiumHandFrequency: 0,
            netChips: 0
        };
    }
}

module.exports = StatsEngine;
