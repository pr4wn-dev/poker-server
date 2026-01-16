/**
 * AdventureManager - Handles single-player Adventure mode
 */

const Boss = require('./Boss');
const Item = require('../models/Item');

class AdventureManager {
    constructor() {
        this.activeSessions = new Map();  // oderId -> AdventureSession
    }
    
    /**
     * Start a new adventure session for a player
     */
    startSession(user, level = null) {
        const targetLevel = level || user.adventureProgress.currentLevel;
        const boss = Boss.getForLevel(targetLevel);
        
        if (!boss) {
            return { success: false, error: 'Invalid level' };
        }
        
        const session = {
            oderId: user.id,
            boss: boss,
            level: targetLevel,
            userChips: 10000,  // Starting stack for adventure
            bossChips: boss.chips,
            handsPlayed: 0,
            startedAt: Date.now()
        };
        
        this.activeSessions.set(user.id, session);
        
        return {
            success: true,
            session: this.getSessionState(user.id)
        };
    }
    
    /**
     * Get session state for client
     */
    getSessionState(userId) {
        const session = this.activeSessions.get(userId);
        if (!session) return null;
        
        return {
            oderId: session.userId,
            level: session.level,
            boss: {
                id: session.boss.id,
                name: session.boss.name,
                avatar: session.boss.avatar,
                chips: session.bossChips,
                difficulty: session.boss.difficulty,
                description: session.boss.description,
                taunt: session.boss.getRandomTaunt()
            },
            userChips: session.userChips,
            handsPlayed: session.handsPlayed
        };
    }
    
    /**
     * Process the result of an adventure hand
     */
    processHandResult(userId, result) {
        const session = this.activeSessions.get(userId);
        if (!session) return null;
        
        session.handsPlayed++;
        
        // Update chips based on hand result
        if (result.winner === 'user') {
            session.userChips += result.pot;
            session.bossChips -= result.pot / 2;  // Boss lost their contribution
        } else if (result.winner === 'boss') {
            session.userChips -= result.userBet;
            session.bossChips += result.pot;
        }
        // Ties return bets
        
        // Check win/loss conditions
        if (session.bossChips <= 0) {
            return this.handleVictory(userId);
        }
        
        if (session.userChips <= 0) {
            return this.handleDefeat(userId);
        }
        
        return {
            status: 'ongoing',
            session: this.getSessionState(userId)
        };
    }
    
    /**
     * Handle boss defeat
     */
    handleVictory(userId) {
        const session = this.activeSessions.get(userId);
        if (!session) return null;
        
        // Calculate rewards
        const drops = session.boss.rollDrops();
        const coinReward = session.boss.coinReward;
        
        // Clean up
        this.activeSessions.delete(userId);
        
        return {
            status: 'victory',
            level: session.level,
            boss: session.boss.name,
            rewards: {
                coins: coinReward,
                items: drops
            },
            handsPlayed: session.handsPlayed
        };
    }
    
    /**
     * Handle player defeat
     */
    handleDefeat(userId) {
        const session = this.activeSessions.get(userId);
        if (!session) return null;
        
        this.activeSessions.delete(userId);
        
        return {
            status: 'defeat',
            level: session.level,
            boss: session.boss.name,
            handsPlayed: session.handsPlayed,
            message: session.boss.getWinQuote()
        };
    }
    
    /**
     * Get level select info
     */
    static getLevelList(userProgress) {
        const levels = [];
        const maxAvailable = userProgress.highestLevel + 1;
        
        for (let i = 1; i <= Math.min(maxAvailable, Boss.MAX_LEVEL); i++) {
            const boss = Boss.getForLevel(i);
            const isDefeated = userProgress.bossesDefeated.includes(boss.id);
            
            levels.push({
                level: i,
                bossId: boss.id,
                bossName: boss.name,
                bossAvatar: boss.avatar,
                difficulty: boss.difficulty,
                isUnlocked: i <= maxAvailable,
                isDefeated: isDefeated,
                rewards: boss.getRewardPreview()
            });
        }
        
        return levels;
    }
    
    /**
     * Forfeit current session
     */
    forfeit(userId) {
        if (this.activeSessions.has(userId)) {
            this.activeSessions.delete(userId);
            return { success: true };
        }
        return { success: false, error: 'No active session' };
    }
}

module.exports = AdventureManager;
