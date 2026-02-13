/**
 * SpectatorOdds - Monte Carlo win probability calculation for spectators
 * 
 * Calculates real-time win percentages for each player based on known
 * community cards and remaining unknown cards. Uses Monte Carlo simulation
 * to estimate win probability quickly.
 */

const HandEvaluator = require('./HandEvaluator');

// Full deck definition
const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

class SpectatorOdds {
    /**
     * Calculate win probability for each player at the table
     * 
     * @param {Array} players - Array of { playerId, holeCards: [{rank, suit}] }
     * @param {Array} communityCards - Current community cards [{rank, suit}]
     * @param {number} simulations - Number of Monte Carlo simulations (default 1000)
     * @returns {Object} { playerId: winProbability (0.0 - 1.0) }
     */
    static calculateOdds(players, communityCards, simulations = 1000) {
        if (!players || players.length === 0) return {};

        const activePlayers = players.filter(p => p.holeCards && p.holeCards.length === 2);
        if (activePlayers.length === 0) return {};

        // If only one player, they have 100%
        if (activePlayers.length === 1) {
            return { [activePlayers[0].playerId]: 1.0 };
        }

        // Build set of known cards
        const knownCards = new Set();
        for (const card of (communityCards || [])) {
            if (card && card.rank && card.suit) {
                knownCards.add(`${card.rank}${card.suit}`);
            }
        }
        for (const player of activePlayers) {
            for (const card of player.holeCards) {
                if (card && card.rank && card.suit) {
                    knownCards.add(`${card.rank}${card.suit}`);
                }
            }
        }

        // Build remaining deck (cards not yet dealt/shown)
        const remainingDeck = [];
        for (const suit of SUITS) {
            for (const rank of RANKS) {
                const key = `${rank}${suit}`;
                if (!knownCards.has(key)) {
                    remainingDeck.push({ rank, suit });
                }
            }
        }

        const cardsNeeded = 5 - (communityCards || []).length;
        const winCounts = {};
        const tieCounts = {};

        for (const player of activePlayers) {
            winCounts[player.playerId] = 0;
            tieCounts[player.playerId] = 0;
        }

        // Run Monte Carlo simulations
        for (let i = 0; i < simulations; i++) {
            // Random remaining community cards
            const shuffled = SpectatorOdds._shuffle([...remainingDeck]);
            const simCommunity = [...(communityCards || []), ...shuffled.slice(0, cardsNeeded)];

            // Evaluate each player's hand
            let bestRank = -1;
            let bestResult = null;
            const winners = [];

            for (const player of activePlayers) {
                const allCards = [...player.holeCards, ...simCommunity];
                const result = HandEvaluator.evaluate(allCards);
                
                if (!bestResult || HandEvaluator.compare(result, bestResult) > 0) {
                    bestResult = result;
                    winners.length = 0;
                    winners.push(player.playerId);
                } else if (HandEvaluator.compare(result, bestResult) === 0) {
                    winners.push(player.playerId);
                }
            }

            if (winners.length === 1) {
                winCounts[winners[0]]++;
            } else {
                // Tie — split credit
                for (const winnerId of winners) {
                    tieCounts[winnerId]++;
                }
            }
        }

        // Calculate probabilities
        const odds = {};
        for (const player of activePlayers) {
            const wins = winCounts[player.playerId];
            const ties = tieCounts[player.playerId];
            // Full win credit + partial tie credit
            odds[player.playerId] = parseFloat(((wins + ties * 0.5) / simulations).toFixed(4));
        }

        return odds;
    }

    /**
     * Calculate odds with unknown hole cards (spectator who can't see cards)
     * Uses equity calculation based on hand range vs community cards
     * 
     * @param {number} playerCount - Number of active players
     * @param {Array} communityCards - Known community cards
     * @returns {number} Average equity per player (1/N baseline)
     */
    static calculateBlindOdds(playerCount, communityCards) {
        // Without seeing hole cards, each player has ~equal equity
        return 1.0 / playerCount;
    }

    /**
     * Fisher-Yates shuffle
     */
    static _shuffle(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    /**
     * Get the equity for each player and format for broadcast
     * Returns data ready to send to spectators
     */
    static getSpectatorOddsForTable(table) {
        if (!table || !table.seats) return null;

        // Only calculate during active hand phases
        const activePhases = ['preflop', 'flop', 'turn', 'river'];
        if (!activePhases.includes(table.phase)) return null;

        const players = [];
        for (const seat of table.seats) {
            if (seat && seat.isActive && !seat.isFolded && seat.cards && seat.cards.length === 2) {
                players.push({
                    playerId: seat.playerId,
                    playerName: seat.name,
                    holeCards: seat.cards
                });
            }
        }

        if (players.length < 2) return null;

        // Reduce simulations for speed (500 is fast enough for real-time)
        const odds = SpectatorOdds.calculateOdds(
            players,
            table.communityCards || [],
            500
        );

        return {
            phase: table.phase,
            handNumber: table.handsPlayed,
            communityCards: table.communityCards,
            playerOdds: Object.entries(odds).map(([playerId, probability]) => ({
                playerId,
                playerName: players.find(p => p.playerId === playerId)?.playerName || 'Unknown',
                winProbability: probability,
                winPercent: (probability * 100).toFixed(1)
            }))
        };
    }
}

module.exports = SpectatorOdds;
