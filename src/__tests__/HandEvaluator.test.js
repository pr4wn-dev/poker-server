/**
 * Unit tests for HandEvaluator
 */

const HandEvaluator = require('../game/HandEvaluator');

describe('HandEvaluator', () => {
    describe('evaluateFiveCards', () => {
        test('should detect royal flush', () => {
            const hand = [
                { rank: '10', suit: 'hearts' },
                { rank: 'J', suit: 'hearts' },
                { rank: 'Q', suit: 'hearts' },
                { rank: 'K', suit: 'hearts' },
                { rank: 'A', suit: 'hearts' }
            ];
            const result = HandEvaluator.evaluateFiveCards(hand);
            expect(result.rank).toBe(10); // Royal flush
            expect(result.name).toBe('Royal Flush');
        });
        
        test('should detect straight flush', () => {
            const hand = [
                { rank: '5', suit: 'clubs' },
                { rank: '6', suit: 'clubs' },
                { rank: '7', suit: 'clubs' },
                { rank: '8', suit: 'clubs' },
                { rank: '9', suit: 'clubs' }
            ];
            const result = HandEvaluator.evaluateFiveCards(hand);
            expect(result.rank).toBe(9); // Straight flush
            expect(result.name).toBe('Straight Flush');
        });
        
        test('should detect four of a kind', () => {
            const hand = [
                { rank: 'A', suit: 'hearts' },
                { rank: 'A', suit: 'diamonds' },
                { rank: 'A', suit: 'clubs' },
                { rank: 'A', suit: 'spades' },
                { rank: 'K', suit: 'hearts' }
            ];
            const result = HandEvaluator.evaluateFiveCards(hand);
            expect(result.rank).toBe(8); // Four of a kind
            expect(result.name).toBe('Four of a Kind');
        });
        
        test('should detect full house', () => {
            const hand = [
                { rank: 'K', suit: 'hearts' },
                { rank: 'K', suit: 'diamonds' },
                { rank: 'K', suit: 'clubs' },
                { rank: 'Q', suit: 'hearts' },
                { rank: 'Q', suit: 'diamonds' }
            ];
            const result = HandEvaluator.evaluateFiveCards(hand);
            expect(result.rank).toBe(7); // Full house
            expect(result.name).toBe('Full House');
        });
        
        test('should detect flush', () => {
            const hand = [
                { rank: '2', suit: 'hearts' },
                { rank: '5', suit: 'hearts' },
                { rank: '7', suit: 'hearts' },
                { rank: '9', suit: 'hearts' },
                { rank: 'K', suit: 'hearts' }
            ];
            const result = HandEvaluator.evaluateFiveCards(hand);
            expect(result.rank).toBe(6); // Flush
            expect(result.name).toBe('Flush');
        });
        
        test('should detect straight', () => {
            const hand = [
                { rank: '5', suit: 'hearts' },
                { rank: '6', suit: 'diamonds' },
                { rank: '7', suit: 'clubs' },
                { rank: '8', suit: 'spades' },
                { rank: '9', suit: 'hearts' }
            ];
            const result = HandEvaluator.evaluateFiveCards(hand);
            expect(result.rank).toBe(5); // Straight
            expect(result.name).toBe('Straight');
        });
        
        test('should detect three of a kind', () => {
            const hand = [
                { rank: 'J', suit: 'hearts' },
                { rank: 'J', suit: 'diamonds' },
                { rank: 'J', suit: 'clubs' },
                { rank: 'K', suit: 'hearts' },
                { rank: 'A', suit: 'hearts' }
            ];
            const result = HandEvaluator.evaluateFiveCards(hand);
            expect(result.rank).toBe(4); // Three of a kind
            expect(result.name).toBe('Three of a Kind');
        });
        
        test('should detect two pair', () => {
            const hand = [
                { rank: '10', suit: 'hearts' },
                { rank: '10', suit: 'diamonds' },
                { rank: 'K', suit: 'clubs' },
                { rank: 'K', suit: 'spades' },
                { rank: 'A', suit: 'hearts' }
            ];
            const result = HandEvaluator.evaluateFiveCards(hand);
            expect(result.rank).toBe(3); // Two pair
            expect(result.name).toBe('Two Pair');
        });
        
        test('should detect one pair', () => {
            const hand = [
                { rank: '7', suit: 'hearts' },
                { rank: '7', suit: 'diamonds' },
                { rank: 'K', suit: 'clubs' },
                { rank: 'Q', suit: 'spades' },
                { rank: 'A', suit: 'hearts' }
            ];
            const result = HandEvaluator.evaluateFiveCards(hand);
            expect(result.rank).toBe(2); // One pair
            expect(result.name).toBe('Pair');
        });
        
        test('should detect high card', () => {
            const hand = [
                { rank: '2', suit: 'hearts' },
                { rank: '5', suit: 'diamonds' },
                { rank: '7', suit: 'clubs' },
                { rank: 'K', suit: 'spades' },
                { rank: 'A', suit: 'hearts' }
            ];
            const result = HandEvaluator.evaluateFiveCards(hand);
            expect(result.rank).toBe(1); // High card
            expect(result.name).toBe('High Card');
        });
    });
    
    describe('compare', () => {
        test('should correctly compare hands', () => {
            const royalFlush = HandEvaluator.evaluateFiveCards([
                { rank: '10', suit: 'hearts' },
                { rank: 'J', suit: 'hearts' },
                { rank: 'Q', suit: 'hearts' },
                { rank: 'K', suit: 'hearts' },
                { rank: 'A', suit: 'hearts' }
            ]);
            
            const pair = HandEvaluator.evaluateFiveCards([
                { rank: 'A', suit: 'hearts' },
                { rank: 'A', suit: 'diamonds' },
                { rank: 'K', suit: 'clubs' },
                { rank: 'Q', suit: 'spades' },
                { rank: 'J', suit: 'hearts' }
            ]);
            
            const result = HandEvaluator.compare(royalFlush, pair);
            expect(result).toBeGreaterThan(0); // royalFlush wins
        });
        
        test('should handle ties correctly', () => {
            const pair1 = HandEvaluator.evaluateFiveCards([
                { rank: 'A', suit: 'hearts' },
                { rank: 'A', suit: 'diamonds' },
                { rank: 'K', suit: 'clubs' },
                { rank: 'Q', suit: 'spades' },
                { rank: 'J', suit: 'hearts' }
            ]);
            
            const pair2 = HandEvaluator.evaluateFiveCards([
                { rank: 'A', suit: 'clubs' },
                { rank: 'A', suit: 'spades' },
                { rank: 'K', suit: 'hearts' },
                { rank: 'Q', suit: 'diamonds' },
                { rank: 'J', suit: 'clubs' }
            ]);
            
            const result = HandEvaluator.compare(pair1, pair2);
            expect(result).toBe(0); // Tie
        });
    });
});

