/**
 * AdventureManager - Handles single-player Adventure mode with XP progression
 */

const Boss = require('./Boss');
const WorldMap = require('./WorldMap');
const Item = require('../models/Item');
const AdventurePokerGame = require('./AdventurePokerGame');

class AdventureManager {
    constructor(userRepository) {
        this.userRepo = userRepository;
        this.activeSessions = new Map();  // userId -> AdventureSession
        this.activeGames = new Map();     // userId -> AdventurePokerGame
        this.worldMap = new WorldMap();
    }
    
    /**
     * Get the world map state for a player
     */
    async getMapState(userId) {
        const xpInfo = await this.userRepo.getXPInfo(userId);
        const bossesDefeated = await this.userRepo.getBossesDefeated(userId);
        const inventory = await this.userRepo.getInventory(userId);
        const user = await this.userRepo.getById(userId);
        
        if (!user) return null;
        
        const userProgress = {
            level: xpInfo?.level || 1,
            chips: user.chips,
            bossesDefeated,
            inventory: inventory.map(i => ({ templateId: i.template_id }))
        };
        
        return {
            playerLevel: xpInfo?.level || 1,
            playerXP: xpInfo?.xp || 0,
            xpProgress: xpInfo?.xpProgress || 0,
            xpForNextLevel: xpInfo?.xpForNextLevel,
            maxLevel: WorldMap.MAX_LEVEL,
            areas: this.worldMap.getMapState(userProgress)
        };
    }
    
    /**
     * Get bosses available in an area
     */
    async getBossesInArea(userId, areaId) {
        const xpInfo = await this.userRepo.getXPInfo(userId);
        const user = await this.userRepo.getById(userId);
        const defeatCounts = await this.userRepo.getAllBossDefeatCounts(userId);
        
        const bosses = Boss.getByArea(areaId);
        const playerLevel = xpInfo?.level || 1;
        const playerChips = user?.chips || 0;
        
        return bosses.map(boss => {
            const canChallenge = boss.canChallenge(playerLevel, playerChips);
            const defeatCount = defeatCounts[boss.id] || 0;
            
            return {
                id: boss.id,
                name: boss.name,
                avatar: boss.avatar,
                description: boss.description,
                difficulty: boss.difficulty,
                minLevel: boss.minLevel,
                entryFee: boss.entryFee,
                canChallenge: canChallenge.canChallenge,
                challengeBlockedReason: canChallenge.reason,
                defeatCount: defeatCount,
                rewards: boss.getRewardPreview()
            };
        });
    }
    
    /**
     * Start a new adventure session for a player
     */
    async startSession(userId, bossId) {
        // Check if already in session
        if (this.activeSessions.has(userId)) {
            return { success: false, error: 'Already in a session. Forfeit first.' };
        }
        
        const boss = Boss.getById(bossId);
        if (!boss) {
            return { success: false, error: 'Boss not found' };
        }
        
        // Check requirements
        const xpInfo = await this.userRepo.getXPInfo(userId);
        const user = await this.userRepo.getById(userId);
        
        if (!user) {
            return { success: false, error: 'User not found' };
        }
        
        const playerLevel = xpInfo?.level || 1;
        const canChallenge = boss.canChallenge(playerLevel, user.chips);
        
        if (!canChallenge.canChallenge) {
            return { success: false, error: canChallenge.reason };
        }
        
        // Deduct entry fee
        if (boss.entryFee > 0) {
            await this.userRepo.updateChips(userId, -boss.entryFee);
        }
        
        // Get defeat count for drop calculations
        const defeatCount = await this.userRepo.getBossDefeatCount(userId, bossId);
        
        const session = {
            userId: userId,
            boss: boss,
            bossId: bossId,
            defeatCount: defeatCount,
            userChips: 10000,  // Starting stack for adventure
            bossChips: boss.chips,
            entryFee: boss.entryFee,
            handsPlayed: 0,
            startedAt: Date.now()
        };
        
        this.activeSessions.set(userId, session);
        
        console.log(`[Adventure] ${userId} started battle with ${boss.name} (defeat count: ${defeatCount})`);
        
        // Start first hand
        const handState = this.startNewHand(userId);
        
        return {
            success: true,
            session: this.getSessionState(userId),
            hand: handState
        };
    }
    
    /**
     * Start a new poker hand in the adventure session
     */
    startNewHand(userId) {
        const session = this.activeSessions.get(userId);
        if (!session) return null;
        
        // Create or reset the poker game
        const game = new AdventurePokerGame(session, session.boss);
        this.activeGames.set(userId, game);
        
        // Start the hand
        const state = game.startHand();
        session.handsPlayed++;
        
        // If it's boss's turn, get their action
        if (!state.isPlayerTurn && !state.isHandComplete) {
            return this.processBossTurn(userId);
        }
        
        return state;
    }
    
    /**
     * Process player's poker action
     */
    handlePlayerAction(userId, action, amount = 0) {
        const session = this.activeSessions.get(userId);
        const game = this.activeGames.get(userId);
        
        if (!session || !game) {
            return { success: false, error: 'No active game' };
        }
        
        // Process player action
        const result = game.handlePlayerAction(action, amount);
        if (!result.success) {
            return result;
        }
        
        // Check if hand is complete
        if (game.isHandComplete()) {
            return this.handleHandComplete(userId);
        }
        
        // If it's boss's turn, process boss action
        if (!game.isPlayerTurn) {
            return this.processBossTurn(userId);
        }
        
        return {
            success: true,
            action: result.action,
            amount: result.amount,
            state: game.getState()
        };
    }
    
    /**
     * Process boss AI turn
     */
    processBossTurn(userId) {
        const session = this.activeSessions.get(userId);
        const game = this.activeGames.get(userId);
        
        if (!session || !game) return null;
        
        const bossActions = [];
        
        // Boss may take multiple actions if player is all-in
        while (!game.isPlayerTurn && !game.isHandComplete()) {
            const bossResult = game.getBossAction();
            if (bossResult && bossResult.success) {
                bossActions.push({
                    action: bossResult.action,
                    amount: bossResult.amount,
                    taunt: bossResult.taunt
                });
                game.advanceGame();
            } else {
                break;
            }
        }
        
        // Check if hand is complete
        if (game.isHandComplete()) {
            return this.handleHandComplete(userId, bossActions);
        }
        
        return {
            success: true,
            bossActions: bossActions,
            state: game.getState()
        };
    }
    
    /**
     * Handle end of a poker hand
     */
    handleHandComplete(userId, bossActions = []) {
        const session = this.activeSessions.get(userId);
        const game = this.activeGames.get(userId);
        
        if (!session || !game) return null;
        
        // Update session chip counts
        session.userChips = game.playerChips;
        session.bossChips = game.bossChips;
        
        const state = game.getState();
        
        // Check if game is over
        if (game.isGameOver()) {
            if (session.userChips <= 0) {
                return this.handleDefeat(userId, state, bossActions);
            } else {
                return this.handleVictory(userId, state, bossActions);
            }
        }
        
        return {
            success: true,
            handComplete: true,
            winner: state.winner,
            bossActions: bossActions,
            state: state,
            session: this.getSessionState(userId)
        };
    }
    
    /**
     * Get session state for client
     */
    getSessionState(userId) {
        const session = this.activeSessions.get(userId);
        if (!session) return null;
        
        return {
            userId: session.userId,
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
            handsPlayed: session.handsPlayed,
            entryFee: session.entryFee
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
    async handleVictory(userId, finalState = null, bossActions = []) {
        const session = this.activeSessions.get(userId);
        if (!session) return null;
        
        const boss = session.boss;
        
        // Clean up game
        this.activeGames.delete(userId);
        
        // Record the defeat and get new count
        const newDefeatCount = await this.userRepo.recordBossDefeat(userId, boss.id);
        
        // Check if this is first defeat (for guaranteed drops)
        const isFirstDefeat = newDefeatCount === 1;
        
        // Roll for drops based on defeat count
        const drops = boss.rollDrops(newDefeatCount);
        
        // Add guaranteed drops if first time
        if (isFirstDefeat && boss.guaranteedDrops.length > 0) {
            for (const templateId of boss.guaranteedDrops) {
                const template = Item.TEMPLATES[templateId];
                if (template) {
                    const item = new Item({
                        ...template,
                        obtainedFrom: boss.name
                    });
                    drops.push(item);
                }
            }
        }
        
        // Award XP
        const newXP = await this.userRepo.addXP(userId, boss.xpReward);
        const xpInfo = await this.userRepo.getXPInfo(userId);
        
        // Award coins
        await this.userRepo.updateAdventureCoins(userId, boss.coinReward);
        
        // Award bonus chips
        if (boss.chipReward > 0) {
            await this.userRepo.updateChips(userId, boss.chipReward);
        }
        
        // Add dropped items to inventory
        for (const item of drops) {
            await this.userRepo.addItem(userId, item);
        }
        
        // Update adventure stats
        await this.userRepo.updateAdventureProgress(userId, {
            won: true,
            bossId: boss.id
        });
        
        // Clean up
        this.activeSessions.delete(userId);
        
        const gameLogger = require('../utils/GameLogger');
        gameLogger.gameEvent('ADVENTURE', '[BOSS_BATTLE] DEFEATED', { userId, bossId, bossName: boss.name, xpReward: boss.xpReward, dropsCount: drops.length });
        
        return {
            status: 'victory',
            success: true,
            boss: {
                id: boss.id,
                name: boss.name,
                loseQuote: boss.getLoseQuote()
            },
            rewards: {
                xp: boss.xpReward,
                coins: boss.coinReward,
                chips: boss.chipReward,
                items: drops.map(d => d.getPublicInfo())
            },
            playerXP: newXP,
            playerLevel: xpInfo?.level || 1,
            xpProgress: xpInfo?.xpProgress || 0,
            defeatCount: newDefeatCount,
            isFirstDefeat: isFirstDefeat,
            handsPlayed: session.handsPlayed,
            finalState: finalState,
            bossActions: bossActions
        };
    }
    
    /**
     * Handle player defeat
     */
    async handleDefeat(userId, finalState = null, bossActions = []) {
        const session = this.activeSessions.get(userId);
        if (!session) return null;
        
        // Clean up game
        this.activeGames.delete(userId);
        
        // Still give some XP for trying (10% of normal)
        const consolationXP = Math.floor(session.boss.xpReward * 0.1);
        if (consolationXP > 0) {
            await this.userRepo.addXP(userId, consolationXP);
        }
        
        // Update adventure stats
        await this.userRepo.updateAdventureProgress(userId, {
            lost: true,
            bossId: session.boss.id
        });
        
        this.activeSessions.delete(userId);
        
        const gameLogger = require('../utils/GameLogger');
        gameLogger.gameEvent('ADVENTURE', '[BOSS_BATTLE] DEFEATED_BY_BOSS', { userId, bossId: session.boss.id, bossName: session.boss.name });
        
        return {
            status: 'defeat',
            success: true,
            boss: {
                id: session.boss.id,
                name: session.boss.name,
                winQuote: session.boss.getWinQuote()
            },
            consolationXP: consolationXP,
            entryFeeLost: session.entryFee,
            handsPlayed: session.handsPlayed,
            message: session.boss.getWinQuote(),
            finalState: finalState,
            bossActions: bossActions
        };
    }
    
    /**
     * Forfeit current session
     */
    async forfeit(userId) {
        const session = this.activeSessions.get(userId);
        if (!session) {
            return { success: false, error: 'No active session' };
        }
        
        // Entry fee is not refunded
        this.activeSessions.delete(userId);
        this.activeGames.delete(userId);
        
        const gameLogger = require('../utils/GameLogger');
        gameLogger.gameEvent('ADVENTURE', '[BOSS_BATTLE] FORFEITED', { userId, bossId: session.boss.id, bossName: session.boss.name });
        
        return { 
            success: true,
            entryFeeLost: session.entryFee
        };
    }
    
    /**
     * Get active session if any
     */
    getActiveSession(userId) {
        return this.activeSessions.has(userId) ? this.getSessionState(userId) : null;
    }
}

module.exports = AdventureManager;
