/**
 * MafiaLoanManager - Handles mafia loan system
 * Players can borrow chips when broke, but must repay with interest
 * Unpaid loans result in enforcer combat challenges
 */

const Database = require('../database/Database');
const { gameLogger } = require('../utils/Logger');

class MafiaLoanManager {
    constructor(userRepository, combatManager) {
        this.userRepo = userRepository;
        this.combatManager = combatManager;
        this.db = Database.getInstance();
        
        // Loan configuration
        this.INTEREST_RATE = 0.20; // 20% interest
        this.LOAN_DURATION_DAYS = 7; // 7 days to repay
        this.MIN_LOAN_AMOUNT = 10000;
        this.MAX_LOAN_AMOUNT = 1000000;
        this.LOAN_INCREMENT = 10000;
    }
    
    /**
     * Check if user is eligible for a loan
     */
    async isEligibleForLoan(userId) {
        const user = await this.userRepo.getById(userId);
        if (!user) return false;
        
        // Must be broke (less than minimum buy-in)
        if (user.chips >= 1000) return false;
        
        // Check for unpaid loans
        const unpaidLoans = await this.getUnpaidLoans(userId);
        
        // Can have max 3 unpaid loans
        return unpaidLoans.length < 3;
    }
    
    /**
     * Get all unpaid loans for a user
     */
    async getUnpaidLoans(userId) {
        const loans = await this.db.query(
            `SELECT * FROM mafia_loans 
             WHERE user_id = ? AND paid = FALSE 
             ORDER BY due_date ASC`,
            [userId]
        );
        return loans || [];
    }
    
    /**
     * Get all overdue loans for a user
     */
    async getOverdueLoans(userId) {
        const loans = await this.db.query(
            `SELECT * FROM mafia_loans 
             WHERE user_id = ? AND paid = FALSE AND due_date < NOW()
             ORDER BY due_date ASC`,
            [userId]
        );
        return loans || [];
    }
    
    /**
     * Take out a loan
     */
    async takeLoan(userId, amount) {
        // Validate amount
        if (amount < this.MIN_LOAN_AMOUNT || amount > this.MAX_LOAN_AMOUNT) {
            return { 
                success: false, 
                error: `Loan must be between ${this.MIN_LOAN_AMOUNT} and ${this.MAX_LOAN_AMOUNT}` 
            };
        }
        
        if (amount % this.LOAN_INCREMENT !== 0) {
            return { 
                success: false, 
                error: `Loan must be in increments of ${this.LOAN_INCREMENT}` 
            };
        }
        
        // Check eligibility
        const eligible = await this.isEligibleForLoan(userId);
        if (!eligible) {
            return { 
                success: false, 
                error: 'Not eligible for loan (too many unpaid loans or sufficient chips)' 
            };
        }
        
        // Calculate amount owed
        const amountOwed = Math.floor(amount * (1 + this.INTEREST_RATE));
        
        // Calculate due date (7 days from now)
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + this.LOAN_DURATION_DAYS);
        
        // Insert loan record
        const result = await this.db.query(
            `INSERT INTO mafia_loans 
             (user_id, amount_borrowed, interest_rate, amount_owed, due_date) 
             VALUES (?, ?, ?, ?, ?)`,
            [userId, amount, this.INTEREST_RATE, amountOwed, dueDate]
        );
        
        // Give chips to user
        await this.userRepo.addChips(userId, amount);
        
        gameLogger.info('LOAN', 'LOAN_TAKEN', {
            userId,
            amount,
            amountOwed,
            dueDate,
            loanId: result.insertId
        });
        
        return {
            success: true,
            loanId: result.insertId,
            amountBorrowed: amount,
            amountOwed,
            interestRate: this.INTEREST_RATE,
            dueDate
        };
    }
    
    /**
     * Repay a loan
     */
    async repayLoan(userId, loanId) {
        // Get loan
        const loan = await this.db.queryOne(
            'SELECT * FROM mafia_loans WHERE id = ? AND user_id = ?',
            [loanId, userId]
        );
        
        if (!loan) {
            return { success: false, error: 'Loan not found' };
        }
        
        if (loan.paid) {
            return { success: false, error: 'Loan already paid' };
        }
        
        // Check if user has enough chips
        const user = await this.userRepo.getById(userId);
        if (user.chips < loan.amount_owed) {
            return { 
                success: false, 
                error: `Insufficient chips. Need ${loan.amount_owed}, have ${user.chips}` 
            };
        }
        
        // Deduct chips
        await this.userRepo.removeChips(userId, loan.amount_owed);
        
        // Mark loan as paid
        await this.db.query(
            'UPDATE mafia_loans SET paid = TRUE, paid_at = NOW() WHERE id = ?',
            [loanId]
        );
        
        gameLogger.info('LOAN', 'LOAN_REPAID', {
            userId,
            loanId,
            amountPaid: loan.amount_owed
        });
        
        return {
            success: true,
            amountPaid: loan.amount_owed,
            remainingChips: user.chips - loan.amount_owed
        };
    }
    
    /**
     * Check for overdue loans and send enforcers
     * Called periodically (e.g., every hour)
     */
    async processOverdueLoans() {
        const overdueLoans = await this.db.query(
            `SELECT DISTINCT user_id FROM mafia_loans 
             WHERE paid = FALSE AND due_date < NOW()`
        );
        
        for (const { user_id } of overdueLoans) {
            await this.sendEnforcer(user_id);
        }
    }
    
    /**
     * Send an enforcer to challenge the user
     * This creates a forced combat scenario
     */
    async sendEnforcer(userId) {
        const overdueLoans = await this.getOverdueLoans(userId);
        if (overdueLoans.length === 0) return;
        
        // Create enforcer NPC profile
        const enforcerId = `enforcer_${userId}_${Date.now()}`;
        const enforcerProfile = {
            id: enforcerId,
            username: 'Mafia Enforcer',
            isNPC: true,
            combatStats: {
                atk: 15,
                def: 15,
                spd: 10
            }
        };
        
        gameLogger.info('LOAN', 'ENFORCER_SENT', {
            userId,
            overdueLoans: overdueLoans.length,
            totalOwed: overdueLoans.reduce((sum, l) => sum + l.amount_owed, 0)
        });
        
        // Return enforcer data for client notification
        return {
            enforcerId,
            enforcerProfile,
            overdueLoans: overdueLoans.map(l => ({
                loanId: l.id,
                amountOwed: l.amount_owed,
                dueDate: l.due_date
            }))
        };
    }
    
    /**
     * Handle enforcer combat result
     */
    async handleEnforcerCombatResult(userId, won) {
        const overdueLoans = await this.getOverdueLoans(userId);
        
        if (won) {
            // User beat the enforcer - all overdue loans forgiven
            for (const loan of overdueLoans) {
                await this.db.query(
                    'UPDATE mafia_loans SET paid = TRUE, paid_at = NOW() WHERE id = ?',
                    [loan.id]
                );
            }
            
            gameLogger.info('LOAN', 'ENFORCER_DEFEATED', {
                userId,
                loansForgiven: overdueLoans.length
            });
            
            return {
                success: true,
                loansForgiven: overdueLoans.length,
                message: 'You defeated the enforcer! All overdue loans forgiven.'
            };
        } else {
            // User lost - debts DOUBLE
            for (const loan of overdueLoans) {
                const newAmount = loan.amount_owed * 2;
                await this.db.query(
                    'UPDATE mafia_loans SET amount_owed = ? WHERE id = ?',
                    [newAmount, loan.id]
                );
            }
            
            // Also increase Heat
            const currentHeat = (await this.userRepo.getById(userId)).heat || 0;
            await this.userRepo.updateHeat(userId, currentHeat + 10);
            
            gameLogger.info('LOAN', 'ENFORCER_WON', {
                userId,
                loansDoubled: overdueLoans.length
            });
            
            return {
                success: true,
                loansDoubled: overdueLoans.length,
                heatGained: 10,
                message: 'You lost to the enforcer. All debts DOUBLED. Heat increased.'
            };
        }
    }
    
    /**
     * Get loan summary for a user
     */
    async getLoanSummary(userId) {
        const unpaidLoans = await this.getUnpaidLoans(userId);
        const overdueLoans = await this.getOverdueLoans(userId);
        
        const totalOwed = unpaidLoans.reduce((sum, l) => sum + l.amount_owed, 0);
        const totalOverdue = overdueLoans.reduce((sum, l) => sum + l.amount_owed, 0);
        
        return {
            unpaidLoans: unpaidLoans.map(l => ({
                loanId: l.id,
                amountBorrowed: l.amount_borrowed,
                amountOwed: l.amount_owed,
                dueDate: l.due_date,
                isOverdue: new Date(l.due_date) < new Date()
            })),
            totalOwed,
            totalOverdue,
            canBorrowMore: await this.isEligibleForLoan(userId),
            maxLoanAmount: this.MAX_LOAN_AMOUNT,
            minLoanAmount: this.MIN_LOAN_AMOUNT
        };
    }
}

module.exports = MafiaLoanManager;
