/**
 * TournamentManager - Manages all tournaments in the game
 */

const Tournament = require('./Tournament');

class TournamentManager {
    constructor(userRepository) {
        this.userRepo = userRepository;
        this.tournaments = new Map();        // tournamentId -> Tournament
        this.playerTournaments = new Map();  // oderId -> tournamentId (active)
    }
    
    /**
     * Create a new tournament
     */
    createTournament(options) {
        const tournament = new Tournament(options);
        this.tournaments.set(tournament.id, tournament);
        
        console.log(`[TournamentManager] Created tournament: ${tournament.name} in ${tournament.areaId}`);
        
        return tournament;
    }
    
    /**
     * Get tournament by ID
     */
    getTournament(tournamentId) {
        return this.tournaments.get(tournamentId) || null;
    }
    
    /**
     * Get all tournaments in an area
     */
    getTournamentsByArea(areaId) {
        return Array.from(this.tournaments.values())
            .filter(t => t.areaId === areaId && t.status === Tournament.STATUS.REGISTERING);
    }
    
    /**
     * Get all active tournaments
     */
    getActiveTournaments() {
        return Array.from(this.tournaments.values())
            .filter(t => t.status === Tournament.STATUS.REGISTERING || 
                        t.status === Tournament.STATUS.IN_PROGRESS);
    }
    
    /**
     * Register player for a tournament
     */
    async registerPlayer(userId, tournamentId, sidePotItemId = null) {
        const tournament = this.getTournament(tournamentId);
        if (!tournament) {
            return { success: false, error: 'Tournament not found' };
        }
        
        // Check if player is already in a tournament
        if (this.playerTournaments.has(userId)) {
            return { success: false, error: 'Already in a tournament' };
        }
        
        // Get player profile and inventory
        const profile = await this.userRepo.getProfile(userId);
        const xpInfo = await this.userRepo.getXPInfo(userId);
        const inventory = await this.userRepo.getInventory(userId);
        
        if (!profile) {
            return { success: false, error: 'Player not found' };
        }
        
        const userProfile = {
            id: userId,
            username: profile.username,
            chips: profile.chips,
            level: xpInfo?.level || 1
        };
        
        // Check entry requirements
        const canEnter = tournament.canEnter(userProfile, inventory);
        if (!canEnter.canEnter) {
            return { 
                success: false, 
                error: canEnter.reason || canEnter.reasons?.join(', ')
            };
        }
        
        // Get side pot item if required
        let sidePotItem = null;
        if (tournament.sidePotRequired && sidePotItemId) {
            sidePotItem = inventory.find(i => i.id === sidePotItemId);
            if (!sidePotItem) {
                return { success: false, error: 'Side pot item not found' };
            }
            
            // Check rarity requirement
            if (tournament.sidePotMinRarity) {
                const rarityOrder = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
                const minIndex = rarityOrder.indexOf(tournament.sidePotMinRarity.toLowerCase());
                const itemIndex = rarityOrder.indexOf(sidePotItem.rarity?.toLowerCase() || 'common');
                if (itemIndex < minIndex) {
                    return { 
                        success: false, 
                        error: `Item must be ${tournament.sidePotMinRarity} rarity or higher`
                    };
                }
            }
            
            // Remove item from inventory (held in escrow)
            await this.userRepo.removeItem(userId, sidePotItemId);
        }
        
        // Deduct entry fee
        if (tournament.entryFee > 0) {
            await this.userRepo.updateChips(userId, -tournament.entryFee);
        }
        
        // Register
        const result = tournament.register(userId, profile.username, sidePotItem);
        
        if (result.success) {
            this.playerTournaments.set(userId, tournamentId);
        }
        
        return result;
    }
    
    /**
     * Unregister player from tournament
     */
    async unregisterPlayer(userId) {
        const tournamentId = this.playerTournaments.get(userId);
        if (!tournamentId) {
            return { success: false, error: 'Not in a tournament' };
        }
        
        const tournament = this.getTournament(tournamentId);
        if (!tournament) {
            this.playerTournaments.delete(userId);
            return { success: false, error: 'Tournament not found' };
        }
        
        const result = tournament.unregister(userId);
        
        if (result.success) {
            this.playerTournaments.delete(userId);
            
            // Refund entry fee
            if (result.refundChips > 0) {
                await this.userRepo.updateChips(userId, result.refundChips);
            }
            
            // Return side pot item
            if (result.returnedItem) {
                await this.userRepo.addItem(userId, result.returnedItem);
            }
        }
        
        return result;
    }
    
    /**
     * Complete tournament and distribute prizes
     */
    async completeTournament(tournamentId) {
        const tournament = this.getTournament(tournamentId);
        if (!tournament) {
            return { success: false, error: 'Tournament not found' };
        }
        
        const winner = tournament.getRemainingPlayers()[0];
        const result = tournament.complete(winner);
        
        // Distribute payouts
        for (const payout of result.payouts) {
            // Award chips
            if (payout.chips > 0) {
                await this.userRepo.updateChips(payout.userId, payout.chips);
            }
            
            // Award XP
            if (payout.xp > 0) {
                await this.userRepo.addXP(payout.userId, payout.xp);
            }
            
            // Award item prizes
            if (payout.itemPrize) {
                await this.userRepo.addItem(payout.userId, payout.itemPrize);
            }
            
            // Award side pot items to winner
            if (payout.sidePotItems) {
                for (const item of payout.sidePotItems) {
                    await this.userRepo.addItem(payout.userId, item);
                }
            }
            
            // Clear player tournament tracking
            this.playerTournaments.delete(payout.userId);
        }
        
        console.log(`[TournamentManager] Tournament ${tournament.name} completed. Winner: ${winner}`);
        
        return result;
    }
    
    /**
     * Get player's current tournament
     */
    getPlayerTournament(userId) {
        const tournamentId = this.playerTournaments.get(userId);
        if (!tournamentId) return null;
        return this.getTournament(tournamentId);
    }
    
    /**
     * Clean up completed/cancelled tournaments older than 1 hour
     */
    cleanup() {
        const oneHourAgo = Date.now() - (60 * 60 * 1000);
        
        for (const [id, tournament] of this.tournaments) {
            if ((tournament.status === Tournament.STATUS.COMPLETED ||
                 tournament.status === Tournament.STATUS.CANCELLED) &&
                tournament.endedAt < oneHourAgo) {
                this.tournaments.delete(id);
            }
        }
    }
}

// Predefined tournament templates for each area
TournamentManager.AREA_TOURNAMENTS = {
    // Downtown Casino - Beginner tournaments
    'area_downtown': [
        {
            name: 'Downtown Daily',
            type: Tournament.TYPE.SIT_N_GO,
            minPlayers: 6,
            maxPlayers: 9,
            startingChips: 5000,
            entryFee: 500,
            minLevel: 2,
            xpPrizePool: 500
        },
        {
            name: 'Downtown Showdown',
            type: Tournament.TYPE.SIT_N_GO,
            minPlayers: 6,
            maxPlayers: 9,
            startingChips: 10000,
            entryFee: 2000,
            minLevel: 3,
            minChips: 5000,
            xpPrizePool: 1000
        }
    ],
    
    // The Highrise - Mid-level tournaments
    'area_highrise': [
        {
            name: 'Highrise High Stakes',
            type: Tournament.TYPE.SIT_N_GO,
            minPlayers: 6,
            maxPlayers: 9,
            startingChips: 15000,
            entryFee: 5000,
            minLevel: 5,
            minChips: 10000,
            xpPrizePool: 2000
        },
        {
            name: 'Elite Invitational',
            type: Tournament.TYPE.SIT_N_GO,
            minPlayers: 4,
            maxPlayers: 6,
            startingChips: 20000,
            entryFee: 10000,
            minLevel: 7,
            minChips: 25000,
            xpPrizePool: 3500,
            sidePotRequired: true,
            sidePotMinRarity: 'uncommon'
        }
    ],
    
    // The Underground - High stakes with item requirements
    'area_underground': [
        {
            name: 'Underground Championship',
            type: Tournament.TYPE.SIT_N_GO,
            minPlayers: 6,
            maxPlayers: 9,
            startingChips: 25000,
            entryFee: 25000,
            minLevel: 8,
            minChips: 50000,
            xpPrizePool: 5000,
            sidePotRequired: true,
            sidePotMinRarity: 'rare'
        },
        {
            name: 'Shadow Stakes',
            type: Tournament.TYPE.SIT_N_GO,
            minPlayers: 4,
            maxPlayers: 6,
            startingChips: 40000,
            entryFee: 50000,
            minLevel: 10,
            minChips: 100000,
            xpPrizePool: 8000,
            sidePotRequired: true,
            sidePotMinRarity: 'rare'
        }
    ],
    
    // The Golden Yacht - Exclusive item-gated
    'area_yacht': [
        {
            name: 'Captain\'s Table',
            type: Tournament.TYPE.SIT_N_GO,
            minPlayers: 4,
            maxPlayers: 6,
            startingChips: 50000,
            entryFee: 50000,
            minLevel: 10,
            minChips: 100000,
            xpPrizePool: 10000,
            sidePotRequired: true,
            sidePotMinRarity: 'epic'
        },
        {
            name: 'Golden Gala',
            type: Tournament.TYPE.SIT_N_GO,
            minPlayers: 4,
            maxPlayers: 6,
            startingChips: 100000,
            entryFee: 100000,
            minLevel: 12,
            minChips: 250000,
            xpPrizePool: 20000,
            sidePotRequired: true,
            sidePotMinRarity: 'epic'
        }
    ],
    
    // Private Island - Ultra high stakes
    'area_island': [
        {
            name: 'Island Masters',
            type: Tournament.TYPE.SIT_N_GO,
            minPlayers: 4,
            maxPlayers: 6,
            startingChips: 150000,
            entryFee: 200000,
            minLevel: 15,
            minChips: 500000,
            xpPrizePool: 35000,
            sidePotRequired: true,
            sidePotMinRarity: 'legendary'
        },
        {
            name: 'Oracle\'s Challenge',
            type: Tournament.TYPE.SIT_N_GO,
            minPlayers: 4,
            maxPlayers: 6,
            startingChips: 250000,
            entryFee: 500000,
            minLevel: 18,
            minChips: 1000000,
            xpPrizePool: 75000,
            sidePotRequired: true,
            sidePotMinRarity: 'legendary'
        }
    ],
    
    // The Penthouse - Final area
    'area_penthouse': [
        {
            name: 'The Grand Finale',
            type: Tournament.TYPE.SIT_N_GO,
            minPlayers: 4,
            maxPlayers: 6,
            startingChips: 500000,
            entryFee: 1000000,
            minLevel: 20,
            minChips: 2000000,
            xpPrizePool: 150000,
            sidePotRequired: true,
            sidePotMinRarity: 'legendary'
        }
    ],
    
    // Secret Lounge - ???
    'area_secret_lounge': [
        {
            name: '???',
            type: Tournament.TYPE.SIT_N_GO,
            minPlayers: 4,
            maxPlayers: 6,
            startingChips: 1000000,
            entryFee: 2000000,
            minLevel: 22,
            minChips: 5000000,
            xpPrizePool: 500000,
            sidePotRequired: true,
            sidePotMinRarity: 'legendary'
        }
    ]
};

module.exports = TournamentManager;










