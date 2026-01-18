/**
 * Deck - Standard 52-card deck with shuffle and draw
 */

const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

class Deck {
    constructor() {
        this.cards = [];
        this.reset();
    }

    reset() {
        this.cards = [];
        for (const suit of SUITS) {
            for (const rank of RANKS) {
                this.cards.push({ rank, suit });
            }
        }
    }

    shuffle() {
        this.reset();
        // Fisher-Yates shuffle
        for (let i = this.cards.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
        }
    }

    draw() {
        return this.cards.pop();
    }

    drawMultiple(count) {
        const drawn = [];
        for (let i = 0; i < count; i++) {
            drawn.push(this.draw());
        }
        return drawn;
    }

    remaining() {
        return this.cards.length;
    }
}

module.exports = Deck;







