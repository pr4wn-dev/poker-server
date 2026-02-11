/**
 * ItemAnte - "For Keeps" item ante system for tables
 * 
 * This is like an ante where each player puts an item in before the game starts,
 * and the winner takes all items. This is NOT related to poker side pots (which
 * are for betting when players go all-in with different amounts).
 * 
 * Flow:
 * 1. First player (creator or first non-spectator) adds their item - sets minimum value
 * 2. Other players submit items - must be equal or greater value than first item
 * 3. Items are auto-approved if value is valid (no manual approval needed)
 * 4. When game starts, item ante is locked
 * 5. Winner of the hand/game takes all items from the ante
 */

const { v4: uuidv4 } = require('uuid');
const gameLogger = require('../utils/GameLogger');

const ITEM_ANTE_STATUS = {
    INACTIVE: 'inactive',       // No item ante
    COLLECTING: 'collecting',   // Accepting submissions
    LOCKED: 'locked',           // Game started, no more changes
    AWARDED: 'awarded'          // Items distributed to winner
};

const SUBMISSION_STATUS = {
    PENDING: 'pending',         // Waiting for value validation
    APPROVED: 'approved',       // Auto-approved (value valid)
    DECLINED: 'declined',       // Declined (value too low)
    OPTED_OUT: 'opted_out'      // Player chose not to participate
};

class ItemAnte {
    constructor(tableId, creatorId) {
        this.id = uuidv4();
        this.tableId = tableId;
        this.creatorId = creatorId;
        this.status = ITEM_ANTE_STATUS.INACTIVE;
        
        // First item sets the minimum value threshold
        this.firstItem = null;
        this.minimumValue = null;  // Minimum baseValue required for subsequent items
        
        // All players' items: userId -> { userId, item, status, submittedAt }
        this.submissions = new Map();
        
        // Final approved items that go to winner
        this.approvedItems = [];  // Array of { userId, item }
        
        // Timer for pre-game
        this.collectionEndTime = null;
        this.collectionTimer = null;
        
        // Winner info
        this.winnerId = null;
        this.awardedAt = null;
    }
    
    /**
     * First player starts the item ante with their item (sets minimum value)
     */
    start(firstItem, userId, collectionDurationMs = 60000) {
        // CRITICAL: This ante is for ITEMS ONLY - no money/chips allowed!
        if (this.status !== ITEM_ANTE_STATUS.INACTIVE) {
            return { success: false, error: 'Item ante already active' };
        }
        
        // CRITICAL: Must be an item object, not money/chips
        if (!firstItem || !firstItem.isGambleable) {
            return { success: false, error: 'Item cannot be gambled' };
        }
        
        // Set first item and minimum value threshold
        this.firstItem = firstItem;
        this.minimumValue = firstItem.baseValue || firstItem.calculateBaseValue?.() || 100;
        this.status = ITEM_ANTE_STATUS.COLLECTING;
        this.collectionEndTime = Date.now() + collectionDurationMs;
        
        // Add first item to approved list
        this.approvedItems.push({
            userId: userId,
            item: firstItem
        });
        
        // Track submission
        this.submissions.set(userId, {
            userId: userId,
            item: firstItem,
            status: SUBMISSION_STATUS.APPROVED,
            submittedAt: Date.now()
        });
        
        // console.log(`[ItemAnte] Started by ${userId} with item: ${firstItem.name} (value: ${this.minimumValue})`);
        
        // ROOT TRACING: Log item ante start with full state
        gameLogger.gameEvent(this.tableId, `[ITEM_ANTE] STARTED`, {
            userId,
            itemId: firstItem.id,
            itemName: firstItem.name,
            itemTemplateId: firstItem.templateId,
            itemRarity: firstItem.rarity,
            minimumValue: this.minimumValue,
            baseValue: firstItem.baseValue,
            collectionEndTime: this.collectionEndTime,
            status: this.status,
            stackTrace: new Error().stack?.split('\n').slice(2, 10).join(' | ') || 'NO_STACK'
        });
        
        return { 
            success: true, 
            itemAnte: this.getState(),
            minimumValue: this.minimumValue
        };
    }
    
    /**
     * Player submits an item - auto-validates against minimum value
     */
    submitItem(userId, item) {
        // CRITICAL: This ante is for ITEMS ONLY - no money/chips allowed!
        if (this.status !== ITEM_ANTE_STATUS.COLLECTING) {
            return { success: false, error: 'Item ante not accepting submissions' };
        }
        
        // Check if first item hasn't been set yet
        if (!this.firstItem || this.minimumValue === null) {
            return { success: false, error: 'First item must be submitted before others' };
        }
        
        // CRITICAL: Must be an item object, not money/chips
        if (!item || !item.isGambleable) {
            return { success: false, error: 'Item cannot be gambled' };
        }
        
        // Check if already submitted and approved
        if (this.submissions.has(userId)) {
            const existing = this.submissions.get(userId);
            if (existing.status === SUBMISSION_STATUS.APPROVED) {
                return { success: false, error: 'Your item is already in the ante' };
            }
        }
        
        // Validate item value - must be equal or greater than minimum
        const itemValue = item.baseValue || item.calculateBaseValue?.() || 100;
        if (itemValue < this.minimumValue) {
            this.submissions.set(userId, {
                userId: userId,
                item: item,
                status: SUBMISSION_STATUS.DECLINED,
                submittedAt: Date.now()
            });
            
            // console.log(`[ItemAnte] ${userId} submitted item ${item.name} (value: ${itemValue}) - REJECTED (minimum: ${this.minimumValue})`);
            
            // ROOT TRACING: Log rejected submission
            gameLogger.gameEvent(this.tableId, `[ITEM_ANTE] SUBMISSION_REJECTED`, {
                userId,
                itemId: item.id,
                itemName: item.name,
                itemValue,
                minimumValue: this.minimumValue,
                difference: itemValue - this.minimumValue,
                reason: 'VALUE_TOO_LOW',
                status: this.status,
                approvedCount: this.approvedItems.length,
                stackTrace: new Error().stack?.split('\n').slice(2, 10).join(' | ') || 'NO_STACK'
            });
            
            return { 
                success: false, 
                error: `Item value (${itemValue}) is less than minimum required (${this.minimumValue})`
            };
        }
        
        // Auto-approve if value is valid
        this.submissions.set(userId, {
            userId: userId,
            item: item,
            status: SUBMISSION_STATUS.APPROVED,
            submittedAt: Date.now()
        });
        
        // Add to approved items
        this.approvedItems.push({
            userId: userId,
            item: item
        });
        
        // console.log(`[ItemAnte] ${userId} submitted item ${item.name} (value: ${itemValue}) - APPROVED`);
        
        // ROOT TRACING: Log approved submission
        gameLogger.gameEvent(this.tableId, `[ITEM_ANTE] SUBMISSION_APPROVED`, {
            userId,
            itemId: item.id,
            itemName: item.name,
            itemTemplateId: item.templateId,
            itemRarity: item.rarity,
            itemValue,
            minimumValue: this.minimumValue,
            approvedCount: this.approvedItems.length,
            totalSubmissions: this.submissions.size,
            status: this.status,
            stackTrace: new Error().stack?.split('\n').slice(2, 10).join(' | ') || 'NO_STACK'
        });
        
        return { 
            success: true,
            message: 'Item added to ante',
            approvedItems: this.approvedItems.length
        };
    }
    
    /**
     * Player opts out of item ante
     */
    optOut(userId) {
        if (this.status !== ITEM_ANTE_STATUS.COLLECTING) {
            return { success: false, error: 'Item ante not active' };
        }
        
        if (userId === this.creatorId) {
            return { success: false, error: 'Creator cannot opt out' };
        }
        
        this.submissions.set(userId, {
            userId: userId,
            item: null,
            status: SUBMISSION_STATUS.OPTED_OUT,
            submittedAt: Date.now()
        });
        
        return { success: true };
    }
    
    /**
     * Approve item (kept for backward compatibility, but items are now auto-approved)
     * This is a no-op since items are auto-validated in submitItem()
     */
    approveItem(creatorId, userId) {
        const submission = this.submissions.get(userId);
        if (!submission) {
            return { success: false, error: 'No submission from this player' };
        }
        
        if (submission.status === SUBMISSION_STATUS.APPROVED) {
            return { 
                success: true,
                approvedItems: this.approvedItems.length
            };
        }
        
        // If pending, try to validate it
        if (submission.status === SUBMISSION_STATUS.PENDING) {
            const itemValue = submission.item.baseValue || submission.item.calculateBaseValue?.() || 100;
            if (itemValue >= this.minimumValue) {
                submission.status = SUBMISSION_STATUS.APPROVED;
                if (!this.approvedItems.some(e => e.userId === userId)) {
                    this.approvedItems.push({
                        userId: userId,
                        item: submission.item
                    });
                }
                return { 
                    success: true,
                    approvedItems: this.approvedItems.length
                };
            }
        }
        
        return { success: false, error: 'Item does not meet minimum value requirement' };
    }
    
    /**
     * Decline item (kept for backward compatibility)
     */
    declineItem(creatorId, userId) {
        const submission = this.submissions.get(userId);
        if (!submission) {
            return { success: false, error: 'No submission from this player' };
        }
        
        submission.status = SUBMISSION_STATUS.DECLINED;
        
        // Remove from approved items if it was there
        const index = this.approvedItems.findIndex(e => e.userId === userId);
        if (index >= 0) {
            this.approvedItems.splice(index, 1);
        }
        
        // console.log(`[ItemAnte] ${userId}'s item declined`);
        
        return { success: true };
    }
    
    /**
     * Lock the item ante (game is starting)
     */
    lock() {
        if (this.status !== ITEM_ANTE_STATUS.COLLECTING) {
            return { success: false, error: 'Item ante not in collection phase' };
        }
        
        // Clear any pending submissions (shouldn't happen with auto-validation, but just in case)
        for (const [userId, submission] of this.submissions) {
            if (submission.status === SUBMISSION_STATUS.PENDING) {
                // Try to auto-validate one last time
                const itemValue = submission.item?.baseValue || submission.item?.calculateBaseValue?.() || 100;
                if (itemValue >= this.minimumValue) {
                    submission.status = SUBMISSION_STATUS.APPROVED;
                    if (!this.approvedItems.some(e => e.userId === userId)) {
                        this.approvedItems.push({
                            userId: userId,
                            item: submission.item
                        });
                    }
                } else {
                    submission.status = SUBMISSION_STATUS.DECLINED;
                    // console.log(`[ItemAnte] Auto-declined pending submission from ${userId} (value too low)`);
                }
            }
        }
        
        if (this.collectionTimer) {
            clearTimeout(this.collectionTimer);
            this.collectionTimer = null;
        }
        
        this.status = ITEM_ANTE_STATUS.LOCKED;
        
        // console.log(`[ItemAnte] Locked with ${this.approvedItems.length} items`);
        
        // ROOT TRACING: Log item ante lock with icon check
        const itemsWithoutIcons = this.approvedItems.filter(entry => 
            !entry?.item?.icon || entry.item.icon === 'default_item'
        );
        const itemsWithIcons = this.approvedItems.filter(entry => 
            entry?.item?.icon && entry.item.icon !== 'default_item'
        );
        
        gameLogger.gameEvent(this.tableId, `[ITEM_ANTE] LOCKED`, {
            approvedCount: this.approvedItems.length,
            totalSubmissions: this.submissions.size,
            participants: this.approvedItems.map(e => e.userId),
            totalValue: this.approvedItems.reduce((sum, e) => sum + (e.item.baseValue || 0), 0),
            itemsWithIcons: itemsWithIcons.length,
            itemsWithoutIcons: itemsWithoutIcons.length,
            missingIconItems: itemsWithoutIcons.map(entry => ({
                userId: entry.userId,
                itemName: entry.item?.name,
                itemIcon: entry.item?.icon || 'MISSING',
                templateId: entry.item?.templateId
            })),
            allItems: this.approvedItems.map(entry => ({
                userId: entry.userId,
                itemName: entry.item?.name,
                itemIcon: entry.item?.icon || 'MISSING',
                itemValue: entry.item?.baseValue || 0
            })),
            status: this.status,
            stackTrace: new Error().stack?.split('\n').slice(2, 10).join(' | ') || 'NO_STACK'
        });
        
        // ROOT TRACING: Warn if items missing icons
        if (itemsWithoutIcons.length > 0) {
            gameLogger.gameEvent(this.tableId, `[ITEM_ANTE] LOCKED_MISSING_ICONS`, {
                count: itemsWithoutIcons.length,
                items: itemsWithoutIcons.map(entry => ({
                    userId: entry.userId,
                    itemName: entry.item?.name,
                    icon: entry.item?.icon || 'MISSING'
                }))
            });
        }
        
        return { 
            success: true,
            itemCount: this.approvedItems.length
        };
    }
    
    /**
     * Award all items to the winner
     */
    award(winnerId) {
        if (this.status !== ITEM_ANTE_STATUS.LOCKED) {
            return { success: false, error: 'Item ante not locked' };
        }
        
        if (this.approvedItems.length === 0) {
            return { success: false, error: 'No items in item ante' };
        }
        
        this.winnerId = winnerId;
        this.awardedAt = Date.now();
        this.status = ITEM_ANTE_STATUS.AWARDED;
        
        // Return the items to be transferred
        const winnings = this.approvedItems.map(entry => entry.item);
        
        // console.log(`[ItemAnte] ${winnerId} won ${winnings.length} items!`);
        
        // ROOT TRACING: Log item ante award with icon check
        const itemsWithoutIcons = winnings.filter(item => !item.icon || item.icon === 'default_item');
        const itemsWithIcons = winnings.filter(item => item.icon && item.icon !== 'default_item');
        
        gameLogger.gameEvent(this.tableId, `[ITEM_ANTE] AWARDED`, {
            winnerId,
            itemCount: winnings.length,
            itemsWithIcons: itemsWithIcons.length,
            itemsWithoutIcons: itemsWithoutIcons.length,
            items: winnings.map(i => ({
                id: i.id,
                name: i.name,
                templateId: i.templateId,
                rarity: i.rarity,
                baseValue: i.baseValue,
                icon: i.icon || 'MISSING'
            })),
            missingIconItems: itemsWithoutIcons.map(i => ({
                id: i.id,
                name: i.name,
                templateId: i.templateId,
                icon: i.icon || 'MISSING'
            })),
            totalValue: winnings.reduce((sum, i) => sum + (i.baseValue || 0), 0),
            originalCount: this.approvedItems.length,
            status: this.status,
            awardedAt: this.awardedAt,
            stackTrace: new Error().stack?.split('\n').slice(2, 10).join(' | ') || 'NO_STACK'
        });
        
        // ROOT TRACING: Warn if awarded items missing icons
        if (itemsWithoutIcons.length > 0) {
            gameLogger.gameEvent(this.tableId, `[ITEM_ANTE] AWARDED_MISSING_ICONS`, {
                winnerId,
                count: itemsWithoutIcons.length,
                items: itemsWithoutIcons.map(i => ({
                    name: i.name,
                    icon: i.icon || 'MISSING'
                }))
            });
        }
        
        return {
            success: true,
            winnerId: winnerId,
            items: winnings
        };
    }
    
    /**
     * Cancel the item ante (return items to owners)
     */
    cancel() {
        if (this.collectionTimer) {
            clearTimeout(this.collectionTimer);
        }
        
        const itemsToReturn = [...this.approvedItems];
        
        this.status = ITEM_ANTE_STATUS.INACTIVE;
        this.firstItem = null;
        this.minimumValue = null;
        this.submissions.clear();
        this.approvedItems = [];
        
        // console.log(`[ItemAnte] Cancelled, returning ${itemsToReturn.length} items`);
        
        return {
            success: true,
            itemsToReturn
        };
    }
    
    /**
     * Check if a player is participating in item ante
     */
    isParticipating(userId) {
        const submission = this.submissions.get(userId);
        return submission?.status === SUBMISSION_STATUS.APPROVED;
    }
    
    /**
     * Check if item ante needs first item (no items submitted yet)
     */
    needsFirstItem() {
        return this.status === ITEM_ANTE_STATUS.INACTIVE || 
               (this.status === ITEM_ANTE_STATUS.COLLECTING && this.approvedItems.length === 0);
    }
    
    /**
     * Check if player has already submitted an item
     */
    hasSubmitted(userId) {
        return this.submissions.has(userId);
    }
    
    /**
     * Get participants (those with approved items)
     */
    getParticipants() {
        return this.approvedItems.map(entry => entry.userId);
    }
    
    /**
     * Get state for clients
     */
    getState(forUserId = null) {
        const state = {
            id: this.id,
            status: this.status,
            creatorId: this.creatorId,
            // Unity expects creatorItem (not firstItem) for backward compatibility
            // CRITICAL: Include ALL fields Unity needs for sprite/asset loading
            // CRITICAL: Add null checks and default values to prevent null reference errors
            creatorItem: this.firstItem ? {
                id: this.firstItem.id || '',
                templateId: this.firstItem.templateId || '',
                name: this.firstItem.name || 'Unknown Item',
                description: this.firstItem.description || '',
                rarity: this.firstItem.rarity || 'common',
                type: this.firstItem.type || 'special',
                icon: this.firstItem.icon || 'default_item',
                baseValue: this.firstItem.baseValue || 0,
                isGambleable: this.firstItem.isGambleable !== false,
                isTradeable: this.firstItem.isTradeable !== false,
                obtainedFrom: this.firstItem.obtainedFrom || ''
            } : null,
            firstItem: this.firstItem ? {
                id: this.firstItem.id || '',
                templateId: this.firstItem.templateId || '',
                name: this.firstItem.name || 'Unknown Item',
                description: this.firstItem.description || '',
                rarity: this.firstItem.rarity || 'common',
                type: this.firstItem.type || 'special',
                icon: this.firstItem.icon || 'default_item',
                baseValue: this.firstItem.baseValue || 0,
                isGambleable: this.firstItem.isGambleable !== false,
                isTradeable: this.firstItem.isTradeable !== false,
                obtainedFrom: this.firstItem.obtainedFrom || ''
            } : null,
            minimumValue: this.minimumValue,
            collectionEndTime: this.collectionEndTime,
            approvedCount: this.approvedItems.length,
            totalValue: this.approvedItems.reduce((sum, e) => sum + (e.item?.baseValue || 0), 0)
        };
        
        // Show approved items list
        // Unity expects oderId (not userId) for backward compatibility
        // CRITICAL: Include ALL fields Unity needs for sprite/asset loading (templateId, description, etc.)
        // CRITICAL: Add null checks to prevent null reference errors
        state.approvedItems = this.approvedItems
            .filter(entry => entry && entry.item)  // Filter out null entries
            .map(entry => ({
                userId: entry.userId,
                oderId: entry.userId,  // Unity compatibility
                item: {
                    id: entry.item.id || '',
                    templateId: entry.item.templateId || '',  // CRITICAL: Unity needs this to load sprites/assets
                    name: entry.item.name || 'Unknown Item',
                    description: entry.item.description || '',  // Include description
                    rarity: entry.item.rarity || 'common',
                    type: entry.item.type || 'special',
                    icon: entry.item.icon || 'default_item',
                    baseValue: entry.item.baseValue || 0,
                    isGambleable: entry.item.isGambleable !== false,
                    isTradeable: entry.item.isTradeable !== false,
                    obtainedFrom: entry.item.obtainedFrom || ''
                }
            }));
        
        // Show declined submissions (for debugging/transparency)
        state.declinedSubmissions = [];
        for (const [userId, sub] of this.submissions) {
            if (sub.status === SUBMISSION_STATUS.DECLINED) {
                state.declinedSubmissions.push({
                    userId: userId,
                    item: sub.item ? {
                        id: sub.item.id,
                        name: sub.item.name,
                        rarity: sub.item.rarity,
                        baseValue: sub.item.baseValue
                    } : null,
                    reason: `Value ${sub.item?.baseValue || 0} is less than minimum ${this.minimumValue}`
                });
            }
        }
        
        // Show user's own submission status
        if (forUserId) {
            const mySub = this.submissions.get(forUserId);
            state.mySubmission = mySub ? {
                status: mySub.status,
                item: mySub.item ? {
                    id: mySub.item.id,
                    templateId: mySub.item.templateId,  // Include templateId for Unity
                    name: mySub.item.name,
                    description: mySub.item.description || '',
                    rarity: mySub.item.rarity,
                    type: mySub.item.type,
                    icon: mySub.item.icon,
                    baseValue: mySub.item.baseValue,
                    isGambleable: mySub.item.isGambleable,
                    isTradeable: mySub.item.isTradeable
                } : null
            } : null;
        }
        
        // If awarded, show winner
        if (this.status === ITEM_ANTE_STATUS.AWARDED) {
            state.winnerId = this.winnerId;
        }
        
        return state;
    }
}

ItemAnte.STATUS = ITEM_ANTE_STATUS;
ItemAnte.SUBMISSION_STATUS = SUBMISSION_STATUS;

module.exports = ItemAnte;
