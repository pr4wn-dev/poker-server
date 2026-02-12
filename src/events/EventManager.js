/**
 * EventManager - Handles seasonal/weekly game events
 * 
 * Events modify XP rates, drop rates, chip rewards, etc. for limited periods.
 * The server checks active events on startup and applies multipliers automatically.
 */

const database = require('../database/Database');
const gameLogger = require('../utils/GameLogger');

// Built-in event types
const EVENT_TYPES = {
    FLUSH_WEEK: {
        type: 'flush_week',
        name: 'Flush Week',
        description: 'Bonus XP for every flush! +50% XP on flush hands.',
        defaultMultipliers: { flush_xp_mult: 1.5 }
    },
    HIGH_ROLLER: {
        type: 'high_roller',
        name: 'High Roller Weekend',
        description: 'Double chip buy-ins available, double chip rewards!',
        defaultMultipliers: { chip_mult: 2.0 }
    },
    BOSS_RUSH: {
        type: 'boss_rush',
        name: 'Boss Rush',
        description: 'Half price boss entries, double drop rates!',
        defaultMultipliers: { boss_entry_mult: 0.5, boss_drop_mult: 2.0 }
    },
    LUCKY_RIVER: {
        type: 'lucky_river',
        name: 'Lucky River',
        description: 'Every river hit grants bonus XP!',
        defaultMultipliers: { river_xp_mult: 1.25 }
    },
    DOUBLE_XP: {
        type: 'double_xp',
        name: 'Double XP Weekend',
        description: 'All XP gains doubled!',
        defaultMultipliers: { xp_mult: 2.0 }
    },
    RARE_DROP: {
        type: 'rare_drop',
        name: 'Rare Drop Event',
        description: 'Legendary item drop rates tripled!',
        defaultMultipliers: { rare_drop_mult: 3.0 }
    },
    ROBBERY_SPREE: {
        type: 'robbery_spree',
        name: 'Robbery Spree',
        description: 'Robbery cooldowns halved, +10% success!',
        defaultMultipliers: { robbery_cooldown_mult: 0.5, robbery_success_bonus: 0.10 }
    },
    CREW_CLASH: {
        type: 'crew_clash',
        name: 'Crew Clash',
        description: 'Crew vs crew competition — top 3 crews win exclusive items!',
        defaultMultipliers: { crew_xp_mult: 2.0 }
    },
    BLUFF_MASTERS: {
        type: 'bluff_masters',
        name: 'Bluff Masters Tournament',
        description: 'Special tournament — bluff success grants bonus chips!',
        defaultMultipliers: { bluff_bonus_chips: 500 }
    }
};

class EventManager {
    constructor() {
        this.activeEvents = [];
        this.cachedMultipliers = {};
    }

    /**
     * Load active events from database
     */
    async loadActiveEvents() {
        if (!database.isConnected) return;

        try {
            const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
            this.activeEvents = await database.query(`
                SELECT * FROM events 
                WHERE is_active = TRUE AND start_date <= ? AND end_date >= ?
                ORDER BY start_date ASC
            `, [now, now]);

            // Pre-compute combined multipliers
            this.cachedMultipliers = {};
            for (const event of this.activeEvents) {
                const multipliers = typeof event.multipliers === 'string' 
                    ? JSON.parse(event.multipliers) 
                    : (event.multipliers || {});
                
                for (const [key, value] of Object.entries(multipliers)) {
                    if (this.cachedMultipliers[key]) {
                        // Stack multiplicatively
                        this.cachedMultipliers[key] *= value;
                    } else {
                        this.cachedMultipliers[key] = value;
                    }
                }
            }

            if (this.activeEvents.length > 0) {
                gameLogger.gameEvent('EVENTS', 'Active events loaded', {
                    count: this.activeEvents.length,
                    events: this.activeEvents.map(e => e.name),
                    multipliers: this.cachedMultipliers
                });
            }
        } catch (err) {
            gameLogger.error('EVENTS', 'Error loading events', { error: err.message });
        }
    }

    /**
     * Get a specific multiplier value (1.0 = no change)
     */
    getMultiplier(key) {
        return this.cachedMultipliers[key] || 1.0;
    }

    /**
     * Apply XP multiplier from active events
     */
    applyXPMultiplier(baseXP) {
        return Math.floor(baseXP * this.getMultiplier('xp_mult'));
    }

    /**
     * Apply drop rate multiplier
     */
    applyDropRateMultiplier(baseRate) {
        return baseRate * this.getMultiplier('rare_drop_mult');
    }

    /**
     * Get all active events (for client display)
     */
    getActiveEvents() {
        return this.activeEvents.map(e => ({
            id: e.id,
            name: e.name,
            description: e.description,
            eventType: e.event_type,
            startDate: e.start_date,
            endDate: e.end_date,
            multipliers: typeof e.multipliers === 'string' ? JSON.parse(e.multipliers) : (e.multipliers || {})
        }));
    }

    /**
     * Create a new event (admin)
     */
    static async createEvent(name, description, eventType, multipliers, startDate, endDate) {
        const { v4: uuidv4 } = require('uuid');
        const eventId = uuidv4();

        await database.query(`
            INSERT INTO events (id, name, description, event_type, multipliers, start_date, end_date)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [eventId, name, description, eventType, JSON.stringify(multipliers), startDate, endDate]);

        gameLogger.gameEvent('EVENTS', 'Event created', { eventId, name, eventType, startDate, endDate });
        return { success: true, eventId };
    }
}

EventManager.EVENT_TYPES = EVENT_TYPES;

// Singleton
const eventManager = new EventManager();
module.exports = eventManager;
