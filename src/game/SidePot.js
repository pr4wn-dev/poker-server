/**
 * SidePot - Item gambling side pot for tables
 * 
 * CRITICAL: This side pot is for ITEMS ONLY - NO MONEY/CHIPS!
 * Real poker chip side pots are handled separately in Table.js calculateAndAwardSidePots()
 * 
 * Flow:
 * 1. Table creator starts side pot with their item
 * 2. Other players submit items for approval
 * 3. Creator approves/declines each submission
 * 4. When game starts (or timer ends), side pot is locked
 * 5. Winner of the hand/game takes all side pot items
 */

const { v4: uuidv4 } = require('uuid');

const SIDE_POT_STATUS = {
    INACTIVE: 'inactive',       // No side pot
    COLLECTING: 'collecting',   // Accepting submissions
    LOCKED: 'locked',           // Game started, no more changes
    AWARDED: 'awarded'          // Items distributed to winner
};

const SUBMISSION_STATUS = {
    PENDING: 'pending',         // Waiting for dealer approval
    APPROVED: 'approved',       // Dealer approved
    DECLINED: 'declined',       // Dealer declined
    OPTED_OUT: 'opted_out'      // Player chose not to participate
};

class SidePot {
    constructor(tableId, creatorId) {
        this.id = uuidv4();
        this.tableId = tableId;
        this.creatorId = creatorId;  // Table creator who manages approvals
        this.status = SIDE_POT_STATUS.INACTIVE;
        
        // Creator's item (the "anchor" item)
        this.creatorItem = null;
        
        // Other players' submissions: userId -> { userId, item, status, submittedAt }
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
     * Creator starts the side pot with their item
     */
    start(creatorItem, collectionDurationMs = 60000) {
        // CRITICAL: This side pot is for ITEMS ONLY - no money/chips allowed!
        if (this.status !== SIDE_POT_STATUS.INACTIVE) {
            return { success: false, error: 'Side pot already active' };
        }
        
        // CRITICAL: Must be an item object, not money/chips
        if (!creatorItem || !creatorItem.isGambleable) {
            return { success: false, error: 'Item cannot be gambled' };
        }
        
        this.creatorItem = creatorItem;
        this.status = SIDE_POT_STATUS.COLLECTING;
        this.collectionEndTime = Date.now() + collectionDurationMs;
        
        // Add creator's item to approved list
        this.approvedItems.push({
            userId: this.creatorId,
            item: creatorItem
        });
        
        console.log(`[SidePot] Started by creator with item: ${creatorItem.name}`);
        
        return { 
            success: true, 
            sidePot: this.getState()
        };
    }
    
    /**
     * Player submits an item for approval
     */
    submitItem(userId, item) {
        // CRITICAL: This side pot is for ITEMS ONLY - no money/chips allowed!
        if (this.status !== SIDE_POT_STATUS.COLLECTING) {
            return { success: false, error: 'Side pot not accepting submissions' };
        }
        
        if (userId === this.creatorId) {
            return { success: false, error: 'Creator already has item in pot' };
        }
        
        // CRITICAL: Must be an item object, not money/chips
        if (!item || !item.isGambleable) {
            return { success: false, error: 'Item cannot be gambled' };
        }
        
        // Check if already submitted
        if (this.submissions.has(userId)) {
            const existing = this.submissions.get(userId);
            if (existing.status === SUBMISSION_STATUS.APPROVED) {
                return { success: false, error: 'Your item is already approved' };
            }
        }
        
        this.submissions.set(userId, {
            userId: userId,
            item: item,
            status: SUBMISSION_STATUS.PENDING,
            submittedAt: Date.now()
        });
        
        console.log(`[SidePot] ${userId} submitted item: ${item.name}`);
        
        return { 
            success: true,
            message: 'Item submitted for approval'
        };
    }
    
    /**
     * Player opts out of side pot
     */
    optOut(userId) {
        if (this.status !== SIDE_POT_STATUS.COLLECTING) {
            return { success: false, error: 'Side pot not active' };
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
     * Creator approves a player's item
     */
    approveItem(creatorId, userId) {
        if (creatorId !== this.creatorId) {
            return { success: false, error: 'Only creator can approve items' };
        }
        
        if (this.status !== SIDE_POT_STATUS.COLLECTING) {
            return { success: false, error: 'Side pot not accepting approvals' };
        }
        
        const submission = this.submissions.get(userId);
        if (!submission) {
            return { success: false, error: 'No submission from this player' };
        }
        
        if (submission.status !== SUBMISSION_STATUS.PENDING) {
            return { success: false, error: 'Submission already processed' };
        }
        
        submission.status = SUBMISSION_STATUS.APPROVED;
        
        // Add to approved items
        this.approvedItems.push({
            userId: userId,
            item: submission.item
        });
        
        console.log(`[SidePot] Creator approved ${userId}'s item: ${submission.item.name}`);
        
        return { 
            success: true,
            approvedItems: this.approvedItems.length
        };
    }
    
    /**
     * Creator declines a player's item
     */
    declineItem(creatorId, userId) {
        if (creatorId !== this.creatorId) {
            return { success: false, error: 'Only creator can decline items' };
        }
        
        if (this.status !== SIDE_POT_STATUS.COLLECTING) {
            return { success: false, error: 'Side pot not active' };
        }
        
        const submission = this.submissions.get(userId);
        if (!submission) {
            return { success: false, error: 'No submission from this player' };
        }
        
        submission.status = SUBMISSION_STATUS.DECLINED;
        
        console.log(`[SidePot] Creator declined ${userId}'s item`);
        
        return { success: true };
    }
    
    /**
     * Lock the side pot (game is starting)
     */
    lock() {
        if (this.status !== SIDE_POT_STATUS.COLLECTING) {
            return { success: false, error: 'Side pot not in collection phase' };
        }
        
        // Clear any pending submissions (not approved in time)
        for (const [userId, submission] of this.submissions) {
            if (submission.status === SUBMISSION_STATUS.PENDING) {
                submission.status = SUBMISSION_STATUS.DECLINED;
                console.log(`[SidePot] Auto-declined pending submission from ${userId}`);
            }
        }
        
        if (this.collectionTimer) {
            clearTimeout(this.collectionTimer);
            this.collectionTimer = null;
        }
        
        this.status = SIDE_POT_STATUS.LOCKED;
        
        console.log(`[SidePot] Locked with ${this.approvedItems.length} items`);
        
        return { 
            success: true,
            itemCount: this.approvedItems.length
        };
    }
    
    /**
     * Award all items to the winner
     */
    award(winnerId) {
        if (this.status !== SIDE_POT_STATUS.LOCKED) {
            return { success: false, error: 'Side pot not locked' };
        }
        
        if (this.approvedItems.length === 0) {
            return { success: false, error: 'No items in side pot' };
        }
        
        this.winnerId = winnerId;
        this.awardedAt = Date.now();
        this.status = SIDE_POT_STATUS.AWARDED;
        
        // Return the items to be transferred
        const winnings = this.approvedItems.map(entry => entry.item);
        
        console.log(`[SidePot] ${winnerId} won ${winnings.length} items!`);
        
        return {
            success: true,
            winnerId: winnerId,
            items: winnings
        };
    }
    
    /**
     * Cancel the side pot (return items to owners)
     */
    cancel() {
        if (this.collectionTimer) {
            clearTimeout(this.collectionTimer);
        }
        
        const itemsToReturn = [...this.approvedItems];
        
        this.status = SIDE_POT_STATUS.INACTIVE;
        this.creatorItem = null;
        this.submissions.clear();
        this.approvedItems = [];
        
        console.log(`[SidePot] Cancelled, returning ${itemsToReturn.length} items`);
        
        return {
            success: true,
            itemsToReturn
        };
    }
    
    /**
     * Check if a player is participating in side pot
     */
    isParticipating(userId) {
        if (userId === this.creatorId && this.creatorItem) {
            return true;
        }
        const submission = this.submissions.get(userId);
        return submission?.status === SUBMISSION_STATUS.APPROVED;
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
            creatorItem: this.creatorItem ? {
                id: this.creatorItem.id,
                name: this.creatorItem.name,
                rarity: this.creatorItem.rarity,
                type: this.creatorItem.type,
                icon: this.creatorItem.icon,
                baseValue: this.creatorItem.baseValue
            } : null,
            collectionEndTime: this.collectionEndTime,
            approvedCount: this.approvedItems.length,
            totalValue: this.approvedItems.reduce((sum, e) => sum + (e.item?.baseValue || 0), 0)
        };
        
        // Show approved items list
        state.approvedItems = this.approvedItems.map(entry => ({
            userId: entry.userId,
            item: {
                id: entry.item.id,
                name: entry.item.name,
                rarity: entry.item.rarity,
                type: entry.item.type,
                icon: entry.item.icon
            }
        }));
        
        // If creator, show all submissions
        if (forUserId === this.creatorId) {
            state.pendingSubmissions = [];
            for (const [userId, sub] of this.submissions) {
                if (sub.status === SUBMISSION_STATUS.PENDING) {
                    state.pendingSubmissions.push({
                        userId: userId,
                        item: sub.item ? {
                            id: sub.item.id,
                            name: sub.item.name,
                            rarity: sub.item.rarity,
                            type: sub.item.type,
                            icon: sub.item.icon,
                            baseValue: sub.item.baseValue
                        } : null,
                        submittedAt: sub.submittedAt
                    });
                }
            }
        }
        
        // Show user's own submission status
        if (forUserId && forUserId !== this.creatorId) {
            const mySub = this.submissions.get(forUserId);
            state.mySubmission = mySub ? {
                status: mySub.status,
                item: mySub.item ? {
                    id: mySub.item.id,
                    name: mySub.item.name
                } : null
            } : null;
        }
        
        // If awarded, show winner
        if (this.status === SIDE_POT_STATUS.AWARDED) {
            state.winnerId = this.winnerId;
        }
        
        return state;
    }
}

SidePot.STATUS = SIDE_POT_STATUS;
SidePot.SUBMISSION_STATUS = SUBMISSION_STATUS;

module.exports = SidePot;

