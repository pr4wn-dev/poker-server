/**
 * HandEvaluator - Evaluates poker hands and compares them
 */

const HAND_RANKS = {
    HIGH_CARD: 1,
    PAIR: 2,
    TWO_PAIR: 3,
    THREE_OF_A_KIND: 4,
    STRAIGHT: 5,
    FLUSH: 6,
    FULL_HOUSE: 7,
    FOUR_OF_A_KIND: 8,
    STRAIGHT_FLUSH: 9,
    ROYAL_FLUSH: 10
};

const RANK_VALUES = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, 
    '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14
};

class HandEvaluator {
    /**
     * Evaluate the best 5-card hand from 7 cards
     */
    static evaluate(cards) {
        if (cards.length < 5) {
            return { rank: 0, name: 'Invalid', values: [] };
        }

        // Get all 5-card combinations
        const combinations = this.getCombinations(cards, 5);
        
        let bestHand = null;
        for (const combo of combinations) {
            const hand = this.evaluateFiveCards(combo);
            if (!bestHand || this.compare(hand, bestHand) > 0) {
                bestHand = hand;
            }
        }

        return bestHand;
    }

    /**
     * Evaluate exactly 5 cards
     */
    static evaluateFiveCards(cards) {
        const values = cards.map(c => RANK_VALUES[c.rank]).sort((a, b) => b - a);
        const suits = cards.map(c => c.suit);
        
        const isFlush = suits.every(s => s === suits[0]);
        const isStraight = this.checkStraight(values);
        const counts = this.getCounts(values);

        // Check for wheel (A-2-3-4-5)
        const isWheel = values.join(',') === '14,5,4,3,2';

        if (isFlush && isStraight) {
            if (values[0] === 14 && values[1] === 13) {
                return { rank: HAND_RANKS.ROYAL_FLUSH, name: 'Royal Flush', values };
            }
            return { rank: HAND_RANKS.STRAIGHT_FLUSH, name: 'Straight Flush', values: isWheel ? [5,4,3,2,1] : values };
        }

        if (counts.four) {
            return { rank: HAND_RANKS.FOUR_OF_A_KIND, name: 'Four of a Kind', values: [counts.four, ...counts.kickers] };
        }

        if (counts.three && counts.pairs.length > 0) {
            return { rank: HAND_RANKS.FULL_HOUSE, name: 'Full House', values: [counts.three, counts.pairs[0]] };
        }

        if (isFlush) {
            return { rank: HAND_RANKS.FLUSH, name: 'Flush', values };
        }

        if (isStraight) {
            return { rank: HAND_RANKS.STRAIGHT, name: 'Straight', values: isWheel ? [5,4,3,2,1] : values };
        }

        if (counts.three) {
            return { rank: HAND_RANKS.THREE_OF_A_KIND, name: 'Three of a Kind', values: [counts.three, ...counts.kickers] };
        }

        if (counts.pairs.length >= 2) {
            return { rank: HAND_RANKS.TWO_PAIR, name: 'Two Pair', values: [...counts.pairs.slice(0, 2), counts.kickers[0]] };
        }

        if (counts.pairs.length === 1) {
            return { rank: HAND_RANKS.PAIR, name: 'Pair', values: [counts.pairs[0], ...counts.kickers.slice(0, 3)] };
        }

        return { rank: HAND_RANKS.HIGH_CARD, name: 'High Card', values };
    }

    static checkStraight(values) {
        const sorted = [...new Set(values)].sort((a, b) => b - a);
        if (sorted.length < 5) return false;

        // Normal straight check
        for (let i = 0; i <= sorted.length - 5; i++) {
            if (sorted[i] - sorted[i + 4] === 4) return true;
        }

        // Wheel (A-2-3-4-5)
        if (sorted.includes(14) && sorted.includes(5) && sorted.includes(4) && sorted.includes(3) && sorted.includes(2)) {
            return true;
        }

        return false;
    }

    static getCounts(values) {
        const counts = {};
        for (const v of values) {
            counts[v] = (counts[v] || 0) + 1;
        }

        let four = null;
        let three = null;
        const pairs = [];
        const kickers = [];

        const sortedValues = Object.entries(counts)
            .sort((a, b) => b[1] - a[1] || b[0] - a[0]);

        for (const [value, count] of sortedValues) {
            const v = parseInt(value);
            if (count === 4) four = v;
            else if (count === 3) three = v;
            else if (count === 2) pairs.push(v);
            else kickers.push(v);
        }

        pairs.sort((a, b) => b - a);
        kickers.sort((a, b) => b - a);

        return { four, three, pairs, kickers };
    }

    /**
     * Compare two hands: returns positive if hand1 > hand2, negative if hand1 < hand2, 0 if equal
     */
    static compare(hand1, hand2) {
        if (hand1.rank !== hand2.rank) {
            return hand1.rank - hand2.rank;
        }

        // Same rank, compare kickers
        for (let i = 0; i < hand1.values.length; i++) {
            if (hand1.values[i] !== hand2.values[i]) {
                return hand1.values[i] - hand2.values[i];
            }
        }

        return 0;
    }

    /**
     * Get all k-combinations from array
     */
    static getCombinations(arr, k) {
        if (k === 1) return arr.map(el => [el]);
        if (k === arr.length) return [arr];

        const combinations = [];
        for (let i = 0; i <= arr.length - k; i++) {
            const head = arr.slice(i, i + 1);
            const tailCombos = this.getCombinations(arr.slice(i + 1), k - 1);
            for (const tail of tailCombos) {
                combinations.push([...head, ...tail]);
            }
        }
        return combinations;
    }
}

module.exports = HandEvaluator;



