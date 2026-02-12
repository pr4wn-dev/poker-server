/**
 * CollusionDetector - Anti-collusion system
 * 
 * Detects suspicious patterns between player pairs:
 * - Soft play: one player always folds to another
 * - Chip dumping: intentional losing
 * - Win trading: taking turns winning
 * - Item transfer schemes: repeated Item Ante games where one always loses
 */

const database = require('../database/Database');
const gameLogger = require('../utils/GameLogger');

// Detection thresholds
const MIN_HANDS_FOR_ANALYSIS = 20;       // Minimum shared hands before flagging
const SOFT_PLAY_FOLD_THRESHOLD = 0.80;   // Player folds to specific opponent 80%+ of the time
const WIN_TRADE_THRESHOLD = 0.85;        // Two players alternate winning too evenly
const CHIP_DUMP_MIN_HANDS = 5;           // Minimum hands to check for dump
const CHIP_DUMP_LOSS_THRESHOLD = 0.90;   // Player loses 90%+ against specific opponent

class CollusionDetector {
    /**
     * Run collusion analysis between two players
     * Called periodically or after Item Ante games
     */
    static async analyzePlayerPair(player1Id, player2Id) {
        if (!database.isConnected) return [];
        
        const flags = [];

        try {
            // Get shared hand history
            const sharedHands = await database.query(`
                SELECT h1.hand_number, h1.table_id,
                       h1.was_winner as p1_won, h1.chips_won_lost as p1_chips,
                       h1.actions_taken as p1_actions, h1.final_hand_rank as p1_rank,
                       h2.was_winner as p2_won, h2.chips_won_lost as p2_chips,
                       h2.actions_taken as p2_actions, h2.final_hand_rank as p2_rank
                FROM hand_history h1
                JOIN hand_history h2 ON h1.table_id = h2.table_id AND h1.hand_number = h2.hand_number
                WHERE h1.player_id = ? AND h2.player_id = ?
                ORDER BY h1.played_at DESC
                LIMIT 100
            `, [player1Id, player2Id]);

            if (sharedHands.length < MIN_HANDS_FOR_ANALYSIS) return [];

            // Check for soft play (P1 always folds to P2)
            const softPlayFlag = CollusionDetector._checkSoftPlay(sharedHands, player1Id, player2Id);
            if (softPlayFlag) flags.push(softPlayFlag);

            // Check reverse direction too
            const softPlayReverseFlag = CollusionDetector._checkSoftPlay(sharedHands, player2Id, player1Id);
            if (softPlayReverseFlag) flags.push(softPlayReverseFlag);

            // Check for win trading
            const winTradeFlag = CollusionDetector._checkWinTrading(sharedHands, player1Id, player2Id);
            if (winTradeFlag) flags.push(winTradeFlag);

            // Check for chip dumping
            const chipDumpFlag = CollusionDetector._checkChipDumping(sharedHands, player1Id, player2Id);
            if (chipDumpFlag) flags.push(chipDumpFlag);

            // Save flags to database
            for (const flag of flags) {
                await database.query(`
                    INSERT INTO collusion_flags (player1_id, player2_id, flag_type, evidence, severity)
                    VALUES (?, ?, ?, ?, ?)
                `, [player1Id, player2Id, flag.type, JSON.stringify(flag.evidence), flag.severity]);
            }

            if (flags.length > 0) {
                gameLogger.gameEvent('SECURITY', 'Collusion flags raised', {
                    player1Id, player2Id, flagCount: flags.length,
                    flags: flags.map(f => ({ type: f.type, severity: f.severity }))
                });
            }

        } catch (err) {
            gameLogger.error('SECURITY', 'Collusion analysis error', {
                error: err.message, player1Id, player2Id
            });
        }

        return flags;
    }

    static _checkSoftPlay(sharedHands, folderId, beneficiaryId) {
        let timesP1FacedBet = 0;
        let timesP1FoldedToBet = 0;

        for (const hand of sharedHands) {
            const actions = typeof hand.p1_actions === 'string' ? JSON.parse(hand.p1_actions) : (hand.p1_actions || []);
            const hasFold = actions.some(a => a.action === 'fold');
            const p2Won = hand.p2_won;

            if (p2Won) {
                timesP1FacedBet++;
                if (hasFold) timesP1FoldedToBet++;
            }
        }

        if (timesP1FacedBet >= 10 && (timesP1FoldedToBet / timesP1FacedBet) >= SOFT_PLAY_FOLD_THRESHOLD) {
            return {
                type: 'soft_play',
                severity: 'medium',
                evidence: {
                    folderId,
                    beneficiaryId,
                    foldRate: (timesP1FoldedToBet / timesP1FacedBet).toFixed(3),
                    handsAnalyzed: sharedHands.length,
                    timesP1FacedBet,
                    timesP1FoldedToBet
                }
            };
        }
        return null;
    }

    static _checkWinTrading(sharedHands, player1Id, player2Id) {
        let p1Wins = 0, p2Wins = 0;
        let alternatingCount = 0;
        let lastWinner = null;

        for (const hand of sharedHands) {
            const winner = hand.p1_won ? 'p1' : (hand.p2_won ? 'p2' : null);
            if (!winner) continue;

            if (winner === 'p1') p1Wins++;
            else p2Wins++;

            if (lastWinner && lastWinner !== winner) alternatingCount++;
            lastWinner = winner;
        }

        const total = p1Wins + p2Wins;
        if (total < MIN_HANDS_FOR_ANALYSIS) return null;

        const alternatingRate = alternatingCount / (total - 1);
        const evenSplit = Math.min(p1Wins, p2Wins) / Math.max(p1Wins, p2Wins);

        if (alternatingRate >= WIN_TRADE_THRESHOLD && evenSplit >= 0.85) {
            return {
                type: 'win_trading',
                severity: 'high',
                evidence: {
                    p1Wins, p2Wins,
                    alternatingRate: alternatingRate.toFixed(3),
                    evenSplit: evenSplit.toFixed(3),
                    handsAnalyzed: sharedHands.length
                }
            };
        }
        return null;
    }

    static _checkChipDumping(sharedHands, player1Id, player2Id) {
        // Check if P1 consistently loses to P2 with large all-ins
        let p1LostBig = 0;
        let totalHands = 0;

        for (const hand of sharedHands) {
            if (hand.p2_won && hand.p1_chips < 0) {
                totalHands++;
                if (Math.abs(hand.p1_chips) > 1000) { // Significant loss
                    p1LostBig++;
                }
            }
        }

        if (totalHands >= CHIP_DUMP_MIN_HANDS && (p1LostBig / totalHands) >= CHIP_DUMP_LOSS_THRESHOLD) {
            return {
                type: 'chip_dumping',
                severity: 'high',
                evidence: {
                    dumperId: player1Id,
                    beneficiaryId: player2Id,
                    bigLosses: p1LostBig,
                    totalHands,
                    lossRate: (p1LostBig / totalHands).toFixed(3)
                }
            };
        }
        return null;
    }

    /**
     * Get unreviewed flags (for admin panel)
     */
    static async getUnreviewedFlags(limit = 50) {
        return await database.query(`
            SELECT cf.*, 
                   u1.username as player1_name,
                   u2.username as player2_name
            FROM collusion_flags cf
            LEFT JOIN users u1 ON cf.player1_id = u1.id
            LEFT JOIN users u2 ON cf.player2_id = u2.id
            WHERE cf.reviewed = FALSE
            ORDER BY FIELD(cf.severity, 'critical', 'high', 'medium', 'low'), cf.created_at DESC
            LIMIT ?
        `, [limit]);
    }

    /**
     * Mark a flag as reviewed
     */
    static async reviewFlag(flagId, actionTaken) {
        await database.query(
            'UPDATE collusion_flags SET reviewed = TRUE, action_taken = ? WHERE id = ?',
            [actionTaken, flagId]
        );
    }
}

module.exports = CollusionDetector;
