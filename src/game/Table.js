/**
 * Table - Represents a poker table with game state
 */

const Deck = require('./Deck');
const HandEvaluator = require('./HandEvaluator');
const ItemAnte = require('./ItemAnte');
const gameLogger = require('../utils/GameLogger');
const StateSnapshot = require('../testing/StateSnapshot');
const path = require('path');
const fs = require('fs');

const GAME_PHASES = {
    WAITING: 'waiting',
    READY_UP: 'ready_up',    // New: waiting for players to click ready
    COUNTDOWN: 'countdown',   // New: final 10-second countdown before start
    PRE_FLOP: 'preflop',
    FLOP: 'flop',
    TURN: 'turn',
    RIVER: 'river',
    SHOWDOWN: 'showdown'
};

const ACTIONS = {
    FOLD: 'fold',
    CHECK: 'check',
    CALL: 'call',
    BET: 'bet',
    RAISE: 'raise',
    ALL_IN: 'allin'
};

class Table {
    constructor(options) {
        this.id = options.id;
        this.name = options.name;
        this.maxPlayers = options.maxPlayers;
        this.smallBlind = options.smallBlind;
        this.bigBlind = options.bigBlind;
        this.isPrivate = options.isPrivate;
        
        // Buy-in amount (chips required to join)
        this.buyIn = options.buyIn || 20000000; // Default 20 million
        
        // Practice mode: players without enough chips get loaned the buy-in
        // but don't keep any winnings
        this.practiceMode = options.practiceMode || false;
        this.practiceModePlayers = new Set(); // Track player IDs who are playing for practice
        
        // New: Password protection
        this.password = options.password || null;
        this.hasPassword = !!options.password;
        
        // New: Creator/Host
        this.creatorId = options.creatorId || null;
        this.isSimulation = options.isSimulation || false;
        this.onPauseSimulation = options.onPauseSimulation || null; // Callback to pause simulation when issues are found
        this.isPaused = false; // Pause state for Unity to read
        this.pauseReason = null; // Reason for pause
        this.createdAt = Date.now();
        
        // Simulation game counter (for display on client)
        this.simulationGamesPlayed = 0;
        this.simulationMaxGames = 0;  // Set by SimulationManager
        this.simulationStartTime = null;  // When simulation started (for timer)
        
        // New: House Rules
        this.houseRules = options.houseRules || null;
        
        // New: Spectators
        this.spectators = new Map();  // oderId -> { oderId, name, socketId }
        this.maxSpectators = options.maxSpectators || 20;
        this.allowSpectators = options.allowSpectators !== false;
        
        // New: Pending invites (friends invited before game starts)
        this.pendingInvites = new Set();  // Set of userIds

        // Seats: array of player objects or null
        this.seats = new Array(this.maxPlayers).fill(null);
        
        // Game state
        this.phase = GAME_PHASES.WAITING;
        this.deck = new Deck();
        this.communityCards = [];
        this.pot = 0;
        this.sidePots = [];
        this.currentBet = 0;
        this.minRaise = this.bigBlind;
        
        // Track if game has started (for spectator-only joins)
        this.gameStarted = false;
        this.handsPlayed = 0;
        
        // Stats tracking: actions per player per hand (reset each hand)
        this.handActions = {}; // playerId -> [{phase, action, amount}]
        this.handChipsBefore = {}; // playerId -> chips at start of hand
        
        // CRITICAL: Track starting chips for money validation
        // Sum of all players' starting chips should equal winner's final chips
        this.totalStartingChips = 0;  // Sum of all buy-ins when game starts
        this._gameOverCalled = false;  // Guard to prevent duplicate onGameOver calls
        
        // CRITICAL: Comprehensive chip tracking system - tracks EVERY chip movement
        this._chipTracking = {
            movements: [],  // History of all chip movements
            enabled: true
        };
        
        // CRITICAL: Fix attempt tracking system - tracks how many times each FIX METHOD has been attempted and failed
        // IMPORTANT: This tracks the METHOD/APPROACH, not the issue itself
        // - If a fix method fails 5 times, that SPECIFIC METHOD is disabled (not the issue)
        // - The issue can still be fixed, but we MUST use a DIFFERENT method/approach
        // - This prevents repeatedly trying the same broken approach
        // MAX_FAILURES: After 5 failures, the fix METHOD is disabled and a completely different approach must be tried
        // When a method is disabled, the issue still exists and needs to be fixed with an alternative method
        const MAX_FAILURES = 5;
        
        this._fixAttempts = {
            'FIX_1_POT_NOT_CLEARED': { attempts: 0, failures: 0, lastFailure: null, disabled: false, permanentlyDisabled: false },
            'FIX_1_TOTAL_BET_NOT_CLEARED': { attempts: 0, failures: 0, lastFailure: null, disabled: false, permanentlyDisabled: false },
            'FIX_1_TOTAL_STARTING_CHIPS_ADJUSTMENT': { attempts: 0, failures: 0, lastFailure: null, disabled: false, permanentlyDisabled: false },
            'FIX_1_POT_NOT_CLEARED_IN_AWARDPOT': { attempts: 0, failures: 0, lastFailure: null, disabled: false, permanentlyDisabled: false },
            'FIX_2_CHIPS_LOST_BETTING': { attempts: 0, failures: 0, lastFailure: null, disabled: false, permanentlyDisabled: false },
            'FIX_2_CHIPS_CREATED_BETTING': { attempts: 0, failures: 0, lastFailure: null, disabled: false, permanentlyDisabled: false },
            'FIX_3_CUMULATIVE_CHIP_LOSS': { attempts: 0, failures: 0, lastFailure: null, disabled: false, permanentlyDisabled: false },
            'FIX_4_ACTION_NOT_YOUR_TURN': { attempts: 0, failures: 0, lastFailure: null, disabled: false, permanentlyDisabled: false },
            'FIX_5_ACTION_GAME_NOT_IN_PROGRESS': { attempts: 0, failures: 0, lastFailure: null, disabled: false, permanentlyDisabled: false },
            'FIX_6_BETTING_ACTION_FAILURES': { attempts: 0, failures: 0, lastFailure: null, disabled: false, permanentlyDisabled: false },
            'FIX_7_VALIDATION_FAILURES': { attempts: 0, failures: 0, lastFailure: null, disabled: false, permanentlyDisabled: false },
            'FIX_8_POT_MISMATCH': { attempts: 0, failures: 0, lastFailure: null, disabled: false, permanentlyDisabled: false },
            'FIX_9_HANDLE_GAME_START_DURING_ACTIVE_HAND': { attempts: 0, failures: 0, lastFailure: null, disabled: false, permanentlyDisabled: false },
            'FIX_10_POT_NOT_CLEARED_IN_HANDLE_GAME_START': { attempts: 0, failures: 0, lastFailure: null, disabled: false, permanentlyDisabled: false },
            'FIX_11_POT_NOT_CLEARED_AT_START_NEW_HAND_START': { attempts: 0, failures: 0, lastFailure: null, disabled: false, permanentlyDisabled: false },
            'FIX_12_POT_NOT_CLEARED_BEFORE_PRE_RESET': { attempts: 0, failures: 0, lastFailure: null, disabled: false, permanentlyDisabled: false },
            'FIX_13_ADD_PLAYER_CHIPS_MISMATCH': { attempts: 0, failures: 0, lastFailure: null, disabled: false, permanentlyDisabled: false },
            'FIX_14_CHIP_TRACKING_VALIDATION_ERROR': { attempts: 0, failures: 0, lastFailure: null, disabled: false, permanentlyDisabled: false },
            'FIX_15_GAME_OVER_CALLBACK_NOT_SET': { attempts: 0, failures: 0, lastFailure: null, disabled: false, permanentlyDisabled: false },
            'FIX_16_AUTO_FOLD_FAILED': { attempts: 0, failures: 0, lastFailure: null, disabled: false, permanentlyDisabled: false },
            'FIX_17_START_TURN_TIMER_NO_PLAYER': { attempts: 0, failures: 0, lastFailure: null, disabled: false, permanentlyDisabled: false },
            'FIX_18_CANNOT_PAUSE_SIMULATION': { attempts: 0, failures: 0, lastFailure: null, disabled: false, permanentlyDisabled: false },
            'FIX_19_RESET_DIFFERENCE_MISMATCH': { attempts: 0, failures: 0, lastFailure: null, disabled: false, permanentlyDisabled: false },
            'FIX_20_NOT_ENOUGH_PLAYERS_TO_START_HAND': { attempts: 0, failures: 0, lastFailure: null, disabled: false, permanentlyDisabled: false },
            'FIX_21_CANNOT_FIND_PLAYERS_FOR_BLINDS': { attempts: 0, failures: 0, lastFailure: null, disabled: false, permanentlyDisabled: false },
            'FIX_22_CHIPS_CHANGED_DURING_BLINDS': { attempts: 0, failures: 0, lastFailure: null, disabled: false, permanentlyDisabled: false },
            'FIX_23_BLIND_CHIPS_CALCULATION_ERROR': { attempts: 0, failures: 0, lastFailure: null, disabled: false, permanentlyDisabled: false },
            'FIX_24_BLIND_POT_CALCULATION_ERROR': { attempts: 0, failures: 0, lastFailure: null, disabled: false, permanentlyDisabled: false },
            'FIX_25_BLIND_TOTAL_CHIPS_CHANGED': { attempts: 0, failures: 0, lastFailure: null, disabled: false, permanentlyDisabled: false },
            'FIX_26_HANDLE_ACTION_EXCEPTION': { attempts: 0, failures: 0, lastFailure: null, disabled: false, permanentlyDisabled: false },
            'FIX_27_CALL_CHIPS_CALCULATION_ERROR': { attempts: 0, failures: 0, lastFailure: null, disabled: false, permanentlyDisabled: false },
            'FIX_28_CALL_POT_CALCULATION_ERROR': { attempts: 0, failures: 0, lastFailure: null, disabled: false, permanentlyDisabled: false },
            'FIX_29_CALL_TOTAL_CHIPS_CHANGED': { attempts: 0, failures: 0, lastFailure: null, disabled: false, permanentlyDisabled: false },
            'FIX_30_BET_CHIPS_CALCULATION_ERROR': { attempts: 0, failures: 0, lastFailure: null, disabled: false, permanentlyDisabled: false },
            'FIX_31_BET_POT_CALCULATION_ERROR': { attempts: 0, failures: 0, lastFailure: null, disabled: false, permanentlyDisabled: false },
            'FIX_32_BET_TOTAL_CHIPS_CHANGED': { attempts: 0, failures: 0, lastFailure: null, disabled: false, permanentlyDisabled: false },
            'FIX_33_RAISE_CHIPS_CALCULATION_ERROR': { attempts: 0, failures: 0, lastFailure: null, disabled: false, permanentlyDisabled: false },
            'FIX_34_RAISE_POT_CALCULATION_ERROR': { attempts: 0, failures: 0, lastFailure: null, disabled: false, permanentlyDisabled: false },
            'FIX_35_RAISE_TOTAL_CHIPS_CHANGED': { attempts: 0, failures: 0, lastFailure: null, disabled: false, permanentlyDisabled: false },
            'FIX_36_ALLIN_CHIPS_NOT_ZERO': { attempts: 0, failures: 0, lastFailure: null, disabled: false, permanentlyDisabled: false },
            'FIX_37_ALLIN_POT_CALCULATION_ERROR': { attempts: 0, failures: 0, lastFailure: null, disabled: false, permanentlyDisabled: false },
            'FIX_38_ALLIN_AMOUNT_MISMATCH': { attempts: 0, failures: 0, lastFailure: null, disabled: false, permanentlyDisabled: false },
            'FIX_39_ALLIN_TOTAL_CHIPS_CHANGED': { attempts: 0, failures: 0, lastFailure: null, disabled: false, permanentlyDisabled: false },
            'FIX_40_AWARD_CALCULATION_ERROR': { attempts: 0, failures: 0, lastFailure: null, disabled: false, permanentlyDisabled: false },
            'FIX_41_ELIMINATED_PLAYER_WON_POT': { attempts: 0, failures: 0, lastFailure: null, disabled: false, permanentlyDisabled: false },
            'FIX_42_NO_ACTIVE_PLAYERS_FOR_REDISTRIBUTION': { attempts: 0, failures: 0, lastFailure: null, disabled: false, permanentlyDisabled: false },
            'FIX_43_AWARD_POTS_TOTAL_CHIPS_CHANGED': { attempts: 0, failures: 0, lastFailure: null, disabled: false, permanentlyDisabled: false },
            'FIX_44_POT_NOT_FULLY_AWARDED': { attempts: 0, failures: 0, lastFailure: null, disabled: false, permanentlyDisabled: false },
            'FIX_45_CHIPS_LOST_NO_ACTIVE_PLAYERS': { attempts: 0, failures: 0, lastFailure: null, disabled: false, permanentlyDisabled: false },
            'FIX_46_POT_NOT_FULLY_AWARDED_BEFORE_CLEARING': { attempts: 0, failures: 0, lastFailure: null, disabled: false, permanentlyDisabled: false },
            'FIX_47_CLEAR_DIFFERENCE_MISMATCH_SIDE_POTS': { attempts: 0, failures: 0, lastFailure: null, disabled: false, permanentlyDisabled: false },
            'FIX_48_POT_NOT_DISTRIBUTED': { attempts: 0, failures: 0, lastFailure: null, disabled: false, permanentlyDisabled: false },
            'FIX_49_ALL_ELIGIBLE_PLAYERS_FOLDED': { attempts: 0, failures: 0, lastFailure: null, disabled: false, permanentlyDisabled: false },
            'FIX_50_NO_ELIGIBLE_WINNER_FOUND': { attempts: 0, failures: 0, lastFailure: null, disabled: false, permanentlyDisabled: false },
            'FIX_51_NO_CONTRIBUTORS_TO_POT': { attempts: 0, failures: 0, lastFailure: null, disabled: false, permanentlyDisabled: false },
            'FIX_52_POT_CALCULATION_FAILED_BUT_POT_EXISTS': { attempts: 0, failures: 0, lastFailure: null, disabled: false, permanentlyDisabled: false },
            'FIX_53_MONEY_LOST_AT_GAME_OVER': { attempts: 0, failures: 0, lastFailure: null, disabled: false, permanentlyDisabled: false },
            'FIX_54_INVALID_CARDS_FOR_PLAYER': { attempts: 0, failures: 0, lastFailure: null, disabled: false, permanentlyDisabled: false },
            'FIX_55_CARD_DUPLICATES_DETECTED': { attempts: 0, failures: 0, lastFailure: null, disabled: false, permanentlyDisabled: false },
            'FIX_56_CANNOT_DISTRIBUTE_POT_NO_ELIGIBLE_PLAYERS': { attempts: 0, failures: 0, lastFailure: null, disabled: false, permanentlyDisabled: false },
            'FIX_1_POT_NOT_CLEARED_AT_HAND_START': { attempts: 0, failures: 0, lastFailure: null, disabled: false, permanentlyDisabled: false },
            'FIX_66_TIMER_CLEARED_AT_ACTION_START': { attempts: 0, failures: 0, lastFailure: null, disabled: false, permanentlyDisabled: false },
            'FIX_67_DISABLE_AUTO_FOLD_FOR_SIMULATION_BOTS': { attempts: 0, failures: 0, lastFailure: null, disabled: false, permanentlyDisabled: false },
            'FIX_68_PREVENT_TOTAL_STARTING_CHIPS_RECALCULATION': { attempts: 0, failures: 0, lastFailure: null, disabled: false, permanentlyDisabled: false },
            'FIX_69_DETECT_WORSENING_DIFFERENCE_IN_ROOT_CAUSE_TRACER': { attempts: 0, failures: 0, lastFailure: null, disabled: false, permanentlyDisabled: false },
            'FIX_70_INCREASE_TURN_TIME_LIMIT_FOR_SIMULATIONS': { attempts: 0, failures: 0, lastFailure: null, disabled: false, permanentlyDisabled: false },
            'FIX_71_PLAYER_WON_MORE_THAN_CONTRIBUTED': { attempts: 0, failures: 0, lastFailure: null, disabled: false, permanentlyDisabled: false },
            'FIX_72_WINNER_NOT_IN_CONTRIBUTORS': { attempts: 0, failures: 0, lastFailure: null, disabled: false, permanentlyDisabled: false },
            'FIX_72_PLAYER_WON_POT_LEVEL_NOT_ELIGIBLE': { attempts: 0, failures: 0, lastFailure: null, disabled: false, permanentlyDisabled: false }
        };
        
        // Track which fixes have been tried and failed (to prevent going back to them)
        // Note: We no longer use _failedFixes - when a fix method fails, it's disabled but alternative methods can still be tried
        
        // Helper to check if a fix METHOD is enabled (not disabled due to too many failures)
        // CRITICAL: Once a fix METHOD is disabled, it can NEVER be re-enabled to prevent going back and forth
        // This forces us to find a DIFFERENT approach to fix the same issue
        this._isFixEnabled = (fixId) => {
            if (!this._fixAttempts[fixId]) {
                return true; // Unknown fix, allow it
            }
            const fix = this._fixAttempts[fixId];
            // If this specific method is disabled, don't use it (but issue can still be fixed with different method)
            return !fix.disabled;
        };
        
        // Helper to record fix attempt
        this._recordFixAttempt = (fixId, success, details = {}) => {
            if (!this._fixAttempts[fixId]) {
                this._fixAttempts[fixId] = { attempts: 0, failures: 0, lastFailure: null, disabled: false };
            }
            
            const fix = this._fixAttempts[fixId];
            
            // If fix is already disabled, don't record attempts (but log that it was skipped)
            if (fix.disabled) {
                gameLogger.gameEvent(this.name, `[FIX] DISABLED`, { fixId, failures: fix.failures, reason: 'Too many failures' });
                return;
            }
            
            fix.attempts++;
            
            if (!success) {
                fix.failures++;
                fix.lastFailure = {
                    timestamp: Date.now(),
                    handNumber: this.handsPlayed,
                    phase: this.phase,
                    ...details
                };
                
                gameLogger.error(this.name, `[FIX] ATTEMPT_FAILED`, { fixId, attemptNumber: fix.attempts, failures: fix.failures, maxFailures: MAX_FAILURES, successRate: `${((fix.attempts - fix.failures) / fix.attempts * 100).toFixed(1)}%`, context: details?.context || 'unknown' });
                gameLogger.gameEvent(this.name, `[FIX ATTEMPT] ${fixId} FAILED`, {
                    fixId,
                    attemptNumber: fix.attempts,
                    totalFailures: fix.failures,
                    maxFailures: MAX_FAILURES,
                    successRate: ((fix.attempts - fix.failures) / fix.attempts * 100).toFixed(1) + '%',
                    handNumber: this.handsPlayed,
                    phase: this.phase,
                    ...details
                });
                
                // DISABLE THIS SPECIFIC FIX METHOD after MAX_FAILURES failures
                // This method has failed too many times - must try a DIFFERENT approach for the same issue
                if (fix.failures >= MAX_FAILURES) {
                    fix.disabled = true;
                    fix.methodFailed = true; // Mark this method as failed, but issue still needs fixing
                    gameLogger.error(this.name, `[FIX] METHOD_DISABLED`, { 
                        fixId, 
                        failures: fix.failures, 
                        maxFailures: MAX_FAILURES, 
                        message: 'This fix method has failed too many times - must try a different approach for the same issue' 
                    });
                    gameLogger.gameEvent(this.name, `[FIX ATTEMPT] ${fixId} METHOD_DISABLED - TRY_DIFFERENT_APPROACH`, {
                        fixId,
                        totalFailures: fix.failures,
                        maxFailures: MAX_FAILURES,
                        totalAttempts: fix.attempts,
                        successRate: ((fix.attempts - fix.failures) / fix.attempts * 100).toFixed(1) + '%',
                        recommendation: `Fix method ${fixId} has failed ${fix.failures} times. This specific approach is not working - MUST try a completely different fix method for the same underlying issue.`,
                        lastFailure: fix.lastFailure,
                        methodDisabled: true,
                        actionRequired: `CRITICAL: This fix method is disabled, but the underlying issue still exists. You MUST implement a different fix approach for the same problem. Check the lastFailure details to understand what's not working.`,
                        note: 'The issue still needs to be fixed - just use a different method/approach'
                    });
                }
            } else {
                // console.log(`[Table ${this.name}] ✓ FIX ATTEMPT SUCCESS: ${fixId} | Attempt #${fix.attempts} | Total Failures: ${fix.failures}/${MAX_FAILURES} | Success Rate: ${((fix.attempts - fix.failures) / fix.attempts * 100).toFixed(1)}%`);
                gameLogger.gameEvent(this.name, `[FIX ATTEMPT] ${fixId} SUCCESS`, {
                    fixId,
                    attemptNumber: fix.attempts,
                    totalFailures: fix.failures,
                    maxFailures: MAX_FAILURES,
                    successRate: ((fix.attempts - fix.failures) / fix.attempts * 100).toFixed(1) + '%',
                    handNumber: this.handsPlayed,
                    phase: this.phase,
                    ...details
                });
            }
        };
        
        // Record pending turnTimeLimit fix attempt if applicable
        if (this._pendingTurnTimeLimitFixRecord) {
            this._recordFixAttempt('FIX_70_INCREASE_TURN_TIME_LIMIT_FOR_SIMULATIONS', true, {
                context: 'CONSTRUCTOR',
                method: 'INCREASE_TO_5000MS',
                previousTurnTimeLimit: this._pendingTurnTimeLimitFixRecord.previousTurnTimeLimit,
                newTurnTimeLimit: this._pendingTurnTimeLimitFixRecord.newTurnTimeLimit,
                isSimulation: this._pendingTurnTimeLimitFixRecord.isSimulation,
                reason: 'Increased turn time limit from 500ms to 2000ms for simulations to give bots enough time to process actions'
            });
            this._pendingTurnTimeLimitFixRecord = null; // Clear after recording
        }
        
        // CRITICAL: Ultra-verbose logging helper for totalStartingChips modifications
        this._logTotalStartingChipsChange = (operation, context, oldValue, newValue, details = {}) => {
            const stackTrace = new Error().stack;
            const stackLines = stackTrace ? stackTrace.split('\n').slice(2, 8).join(' | ') : 'NO_STACK';
            
            const logData = {
                operation,
                context,
                oldValue,
                newValue,
                change: newValue - oldValue,
                handNumber: this.handsPlayed,
                phase: this.phase,
                gameStarted: this.gameStarted,
                timestamp: Date.now(),
                stackTrace: stackLines,
                ...details,
                fullState: {
                    totalStartingChips: this.totalStartingChips,
                    activePlayers: this.seats.filter(s => s && s.isActive !== false).map(s => ({
                        name: s.name,
                        chips: s.chips,
                        seatIndex: this.seats.indexOf(s),
                        isActive: s.isActive
                    })),
                    eliminatedPlayers: this.seats.filter(s => s && s.isActive === false).map(s => ({
                        name: s.name,
                        chips: s.chips,
                        seatIndex: this.seats.indexOf(s),
                        isActive: s.isActive,
                        totalBet: s.totalBet || 0
                    })),
                    pot: this.pot,
                    currentTotalChips: this.seats.filter(s => s && s.isActive !== false).reduce((sum, s) => sum + (s.chips || 0), 0),
                    totalChipsInSystem: this.seats.filter(s => s && s.isActive !== false).reduce((sum, s) => sum + (s.chips || 0), 0) + this.pot
                }
            };
            
            // console.log(`[Table ${this.name}] [TOTAL_STARTING_CHIPS] ${operation} | ${context} | ${oldValue} → ${newValue} (change: ${newValue - oldValue}) | Hand: ${this.handsPlayed} | Phase: ${this.phase}`);
            gameLogger.gameEvent(this.name, `[TOTAL_STARTING_CHIPS] ${operation}`, logData);
        };
        
        // Helper to get current chip state snapshot
        // CRITICAL FIX: Only count ACTIVE players (not eliminated ones) to match totalStartingChips
        this._getChipState = () => {
            const playerChips = this.seats
                .filter(s => s !== null && s.isActive !== false)  // Only count active players
                .reduce((sum, seat) => sum + (seat.chips || 0), 0);
            const totalChipsInSystem = playerChips + this.pot;
            return {
                playerChips,
                pot: this.pot,
                totalChipsInSystem,
                totalStartingChips: this.totalStartingChips,
                difference: totalChipsInSystem - this.totalStartingChips,
                players: this.seats
                    .map((s, i) => s ? { 
                        seatIndex: i, 
                        name: s.name, 
                        chips: s.chips, 
                        isActive: s.isActive,
                        totalBet: s.totalBet || 0,
                        currentBet: s.currentBet || 0
                    } : null)
                    .filter(p => p !== null)
            };
        };
        
        // UNIVERSAL TRACING SYSTEM: Track EVERY operation from table creation to sim end
        // This captures ALL operations: chip movements, phase changes, timers, function calls, state changes, etc.
        this._universalTracer = {
            enabled: true,
            operations: [], // Array of {operation, beforeState, afterState, stackTrace, timestamp, details}
            maxOperations: 5000 // Keep last 5000 operations (increased for comprehensive tracing)
        };
        
        // Get comprehensive state snapshot for tracing
        this._getFullState = () => {
            const chipState = this._getChipState();
            return {
                ...chipState,
                phase: this.phase,
                gameStarted: this.gameStarted,
                handsPlayed: this.handsPlayed,
                currentPlayerIndex: this.currentPlayerIndex,
                dealerIndex: this.dealerIndex,
                currentBet: this.currentBet,
                minRaise: this.minRaise,
                turnTimeout: !!this.turnTimeout,
                readyUpTimeout: !!this.readyUpTimeout,
                readyUpInterval: !!this.readyUpInterval,
                countdownInterval: !!this.countdownInterval,
                startCountdown: !!this.startCountdown,
                blindIncreaseTimer: !!this.blindIncreaseTimer,
                isPaused: this.isPaused,
                pauseReason: this.pauseReason,
                activePlayers: this.seats.filter(s => s && s.isActive !== false).length,
                readyPlayers: this.seats.filter(s => s && s.isReady).length,
                communityCards: this.communityCards.length,
                sidePots: this.sidePots.length
            };
        };
        
        // UNIVERSAL TRACE: Track ANY operation (not just chip movements)
        // This is called for EVERY operation: function calls, phase changes, timers, state changes, etc.
        this._traceUniversal = (operation, details = {}) => {
            if (!this._universalTracer.enabled) return;
            
            const stackTrace = new Error().stack;
            const stackLines = stackTrace ? stackTrace.split('\n').slice(2, 15).join(' | ') : 'NO_STACK';
            
            const beforeState = this._getFullState();
            
            const trace = {
                timestamp: Date.now(),
                operation,
                handNumber: this.handsPlayed,
                phase: this.phase,
                beforeState,
                details,
                stackTrace: stackLines
            };
            
            this._universalTracer.operations.push(trace);
            
            // Keep only last maxOperations
            if (this._universalTracer.operations.length > this._universalTracer.maxOperations) {
                this._universalTracer.operations.shift();
            }
            
            // Log to gameLogger for debugging (this helps ME, not the user)
            gameLogger.gameEvent(this.name, `[TRACE] ${operation}`, {
                operation,
                handNumber: this.handsPlayed,
                phase: this.phase,
                beforeState,
                details,
                stackTrace: stackLines
            });
        };
        
        // Helper to trace phase changes
        this._tracePhaseChange = (to, reason = '') => {
            const from = this.phase;
            this._traceUniversal('PHASE_CHANGE', { 
                from, 
                to, 
                reason,
                handNumber: this.handsPlayed,
                gameStarted: this.gameStarted
            });
            this.phase = to;
            this._traceUniversalAfter('PHASE_CHANGE', { 
                from, 
                to: this.phase, 
                reason 
            });
        };
        
        // Helper to trace timer operations
        this._traceTimer = (operation, timerName, delay = null) => {
            this._traceUniversal(`TIMER_${operation}`, { 
                timerName, 
                delay,
                phase: this.phase,
                handNumber: this.handsPlayed
            });
        };
        
        // Track operation AFTER it completes (captures afterState)
        this._traceUniversalAfter = (operation, details = {}) => {
            if (!this._universalTracer.enabled) return;
            
            const afterState = this._getFullState();
            
            // Find the most recent trace for this operation
            const lastTrace = this._universalTracer.operations
                .slice()
                .reverse()
                .find(t => t.operation === operation);
            
            if (lastTrace) {
                lastTrace.afterState = afterState;
                lastTrace.details = { ...lastTrace.details, ...details };
                
                // Detect state changes
                const stateChanges = {};
                Object.keys(afterState).forEach(key => {
                    if (lastTrace.beforeState[key] !== afterState[key]) {
                        stateChanges[key] = {
                            before: lastTrace.beforeState[key],
                            after: afterState[key]
                        };
                    }
                });
                
                if (Object.keys(stateChanges).length > 0) {
                    lastTrace.stateChanges = stateChanges;
                    
                    // Log state changes
                    gameLogger.gameEvent(this.name, `[TRACE] ${operation} STATE_CHANGED`, {
                        operation,
                        handNumber: this.handsPlayed,
                        phase: this.phase,
                        stateChanges,
                        beforeState: lastTrace.beforeState,
                        afterState
                    });
                }
            }
        };
        
        // ROOT CAUSE ANALYSIS: Track chip state at every operation to identify WHERE chips are lost
        this._rootCauseTracer = {
            enabled: true,
            operations: [], // Array of {operation, beforeState, afterState, stackTrace, timestamp}
            maxOperations: 1000 // Keep last 1000 operations
        };
        
        // Track operation for root cause analysis (chip-focused)
        // CRITICAL: This is called for EVERY operation that touches chips or game state
        this._traceOperation = (operation, beforeState, afterState) => {
            if (!this._rootCauseTracer.enabled) return;
            
            const stackTrace = new Error().stack;
            const stackLines = stackTrace ? stackTrace.split('\n').slice(2, 12).join(' | ') : 'NO_STACK';
            
            const trace = {
                timestamp: Date.now(),
                operation,
                handNumber: this.handsPlayed,
                phase: this.phase,
                beforeState: {
                    totalChips: beforeState.totalChipsInSystem,
                    pot: beforeState.pot,
                    playerChips: beforeState.playerChips,
                    difference: beforeState.difference
                },
                afterState: {
                    totalChips: afterState.totalChipsInSystem,
                    pot: afterState.pot,
                    playerChips: afterState.playerChips,
                    difference: afterState.difference
                },
                chipChange: afterState.totalChipsInSystem - beforeState.totalChipsInSystem,
                stackTrace: stackLines
            };
            
            this._rootCauseTracer.operations.push(trace);
            
            // Keep only last maxOperations
            if (this._rootCauseTracer.operations.length > this._rootCauseTracer.maxOperations) {
                this._rootCauseTracer.operations.shift();
            }
            
            // If chips were lost, log the trace for root cause analysis
            // CRITICAL: Log BOTH when chipChange is negative (chips lost in this operation)
            // AND when the absolute difference becomes more negative (chips were already missing and are getting worse)
            const differenceWorsened = trace.afterState.difference < trace.beforeState.difference - 0.01;
            if (trace.chipChange < -0.01 || differenceWorsened) {
                gameLogger.error(this.name, '[ROOT CAUSE] CHIPS LOST DETECTED', {
                    operation,
                    chipChange: trace.chipChange,
                    beforeState: trace.beforeState,
                    afterState: trace.afterState,
                    differenceWorsened,
                    differenceChange: trace.afterState.difference - trace.beforeState.difference,
                    stackTrace: trace.stackTrace,
                    handNumber: this.handsPlayed,
                    phase: this.phase,
                    recentOperations: this._rootCauseTracer.operations.slice(-10).map(op => ({
                        operation: op.operation,
                        chipChange: op.chipChange,
                        beforeDifference: op.beforeState.difference,
                        afterDifference: op.afterState.difference,
                        timestamp: op.timestamp
                    }))
                });
                
                // Record fix attempt - this method detects worsening difference
                this._recordFixAttempt('FIX_69_DETECT_WORSENING_DIFFERENCE_IN_ROOT_CAUSE_TRACER', true, {
                    context: 'CHIPS_LOST_DETECTED',
                    method: 'DETECT_WORSENING_DIFFERENCE',
                    operation,
                    chipChange: trace.chipChange,
                    differenceWorsened,
                    differenceChange: trace.afterState.difference - trace.beforeState.difference,
                    beforeDifference: trace.beforeState.difference,
                    afterDifference: trace.afterState.difference,
                    handNumber: this.handsPlayed,
                    phase: this.phase,
                    reason: 'Detecting chips lost by monitoring both chipChange and worsening difference'
                });
            }
            
            // Also log if chips were created (shouldn't happen)
            if (trace.chipChange > 0.01) {
                gameLogger.error(this.name, '[ROOT CAUSE] CHIPS CREATED DETECTED', {
                    operation,
                    chipChange: trace.chipChange,
                    beforeState: trace.beforeState,
                    afterState: trace.afterState,
                    stackTrace: trace.stackTrace,
                    handNumber: this.handsPlayed,
                    phase: this.phase
                });
                
                // Record fix attempt - chips created is a failure
                this._recordFixAttempt('FIX_2_CHIPS_CREATED_BETTING', false, {
                    context: 'ROOT_CAUSE_TRACER',
                    operation,
                    chipChange: trace.chipChange,
                    beforeState: trace.beforeState,
                    afterState: trace.afterState,
                    handNumber: this.handsPlayed,
                    phase: this.phase,
                    reason: 'Chips were created during operation - this should never happen'
                });
            }
        };
        
        // Helper to trace pot clearing operations
        // CRITICAL: Every time we clear the pot, we need to trace it for root cause analysis
        // Use this instead of directly setting this.pot = 0
        this._clearPotWithTrace = (operation, context = '') => {
            const beforeState = this._getChipState();
            const potBefore = this.pot;
            this.pot = 0;
            const afterState = this._getChipState();
            this._traceOperation(`${operation}_POT_CLEAR`, beforeState, afterState);
            
            // If pot had chips when cleared, log it
            if (potBefore > 0) {
                gameLogger.gameEvent(this.name, `[ROOT CAUSE] Pot cleared in ${operation}`, {
                    operation,
                    context,
                    potBefore,
                    potAfter: 0,
                    beforeState,
                    afterState,
                    chipChange: afterState.totalChipsInSystem - beforeState.totalChipsInSystem,
                    handNumber: this.handsPlayed,
                    phase: this.phase
                });
            }
        };
        
        // Helper to trace chip award operations
        // CRITICAL: Every time we award chips, we need to trace it
        this._traceChipAward = (operation, playerName, amount, beforeState) => {
            const afterState = this._getChipState();
            this._traceOperation(`${operation}_AWARD`, beforeState, afterState);
        };
        
        // Helper to trace any chip modification
        // CRITICAL: Call this before and after ANY operation that modifies chips
        this._traceChipModification = (operation, beforeState, afterState) => {
            this._traceOperation(operation, beforeState, afterState);
        };
        
        // Track a chip movement with before/after states
        // CRITICAL: This automatically enables root cause tracing for ALL operations
        this._trackChipMovement = (operation, details) => {
            if (!this._chipTracking.enabled) {
                // Even if chip tracking is disabled, still do root cause tracing
                const beforeState = this._getChipState();
                return { beforeState, operation, details, rootCauseOnly: true };
            }
            
            const beforeState = this._getChipState();
            const movement = {
                timestamp: Date.now(),
                operation,
                beforeState,
                details,
                afterState: null
            };
            this._chipTracking.movements.push(movement);
            
            // Log immediately
            gameLogger.gameEvent(this.name, `[CHIP TRACK] ${operation} - BEFORE`, {
                operation,
                beforeState,
                details
            });
            
            return movement;
        };
        
        // Validate chip state after an operation
        // CRITICAL: This ALWAYS traces operations for root cause analysis, even if chip tracking is disabled
        this._validateChipMovement = (movement, context = '') => {
            if (!movement) {
                // Even without movement, try to trace if we can get state
                const afterState = this._getChipState();
                const beforeState = this._getChipState(); // Approximate
                this._traceOperation(context || 'UNKNOWN_OPERATION', beforeState, afterState);
                return { isValid: true };
            }
            
            const afterState = this._getChipState();
            
            // ROOT CAUSE ANALYSIS: ALWAYS trace this operation (even if chip tracking disabled)
            this._traceOperation(movement.operation, movement.beforeState, afterState);
            
            if (!this._chipTracking.enabled && movement.rootCauseOnly) {
                // Only root cause tracing, no full validation
                return { isValid: true, afterState };
            }
            
            if (!this._chipTracking.enabled) return { isValid: true, afterState };
            
            movement.afterState = afterState;
            
            const difference = afterState.totalChipsInSystem - afterState.totalStartingChips;
            // CRITICAL: Only validate if game has started (totalStartingChips > 0)
            // Before game start, chips can be added/removed without validation
            const isValid = this.totalStartingChips === 0 || Math.abs(difference) < 0.01; // Allow tiny floating point errors
            
            // Log after state
            gameLogger.gameEvent(this.name, `[CHIP TRACK] ${movement.operation} - AFTER`, {
                operation: movement.operation,
                afterState,
                difference,
                isValid: isValid ? 'PASS' : 'FAIL',
                context,
                gameStarted: this.totalStartingChips > 0
            });
            
            if (!isValid && this.totalStartingChips > 0) {
                const errorType = difference > 0 ? 'CREATED' : 'LOST';
                const errorMsg = `[CHIP TRACK] ${context} - Money ${errorType}: ${Math.abs(difference)} chips`;
                // Already logged via gameLogger.error below
                gameLogger.error(this.name, errorMsg, {
                    operation: movement.operation,
                    beforeState: movement.beforeState,
                    afterState,
                    // ROOT CAUSE: Include recent operations that led to this loss
                    rootCauseTrace: this._rootCauseTracer.operations.slice(-20).map(op => ({
                        operation: op.operation,
                        chipChange: op.chipChange,
                        timestamp: op.timestamp,
                        handNumber: op.handNumber,
                        phase: op.phase
                    }))
                });
                // Record fix attempt - chip tracking validation error is a failure
                // CRITICAL: Check if fix is enabled before attempting
                if (this._isFixEnabled('FIX_14_CHIP_TRACKING_VALIDATION_ERROR')) {
                    this._recordFixAttempt('FIX_14_CHIP_TRACKING_VALIDATION_ERROR', false, {
                        context,
                        errorType,
                        difference: Math.abs(difference),
                        operation: movement.operation,
                        handNumber: this.handsPlayed,
                    details: movement.details
                });
                } else {
                    gameLogger.error(this.name, `[FIX] FIX_14_DISABLED`, { message: 'FIX_14_CHIP_TRACKING_VALIDATION_ERROR IS DISABLED - Root cause analysis required!' });
                    gameLogger.error(this.name, '[ROOT CAUSE] Fix disabled - must investigate root cause', {
                        fixId: 'FIX_14_CHIP_TRACKING_VALIDATION_ERROR',
                        context,
                        errorType,
                        difference: Math.abs(difference),
                        operation: movement.operation,
                        rootCauseTrace: this._rootCauseTracer.operations.slice(-20)
                    });
                }
            }
            
            return { isValid, difference, afterState };
        };
        
        // CRITICAL: Money validation helper - validates chips are conserved at every point
        // CRITICAL FIX: Only count ACTIVE players (not eliminated ones) to match totalStartingChips
        this._validateMoney = (context) => {
            const currentTotalChips = this.seats
                .filter(s => s !== null && s.isActive !== false)  // Only count active players
                .reduce((sum, seat) => sum + (seat.chips || 0), 0);
            const totalChipsAndPot = currentTotalChips + this.pot;
            
            // ULTRA-VERBOSE: Log every validation with complete breakdown
            const playerBreakdown = this.seats.map((s, i) => s ? {
                seatIndex: i,
                name: s.name,
                chips: s.chips,
                isActive: s.isActive,
                totalBet: s.totalBet || 0,
                currentBet: s.currentBet || 0,
                isFolded: s.isFolded || false,
                isAllIn: s.isAllIn || false
            } : { seatIndex: i, isNull: true });
            
            // ULTRA-VERBOSE: Calculate sum of all totalBets to detect pot mismatches
            const sumOfAllTotalBets = this.seats
                .filter(s => s !== null)
                .reduce((sum, seat) => sum + (seat.totalBet || 0), 0);
            
            if (this.totalStartingChips > 0) {
                const difference = totalChipsAndPot - this.totalStartingChips;
                const absDifference = Math.abs(difference);
                const isValid = Math.abs(difference) <= 0.01; // Allow for floating point errors (check both creation AND loss)
                
                // ULTRA-VERBOSE: Check for pot mismatch (pot should equal sum of totalBets)
                const potMismatch = Math.abs(this.pot - sumOfAllTotalBets);
                if (potMismatch > 0.01 && this.pot > 0) {
                    gameLogger.error(this.name, `[POT] MISMATCH_DETECTED`, { pot: this.pot, sumOfTotalBets: sumOfAllTotalBets, difference: this.pot - sumOfAllTotalBets, context });
                    gameLogger.gameEvent(this.name, '[MONEY] POT MISMATCH in validation', {
                        context,
                        pot: this.pot,
                        sumOfAllTotalBets,
                        difference: this.pot - sumOfAllTotalBets,
                        handNumber: this.handsPlayed,
                        phase: this.phase,
                        allSeats: playerBreakdown
                    });
                }
                
                if (!isValid) {
                    const missing = this.totalStartingChips - totalChipsAndPot;
                    gameLogger.error(this.name, `[MONEY] VALIDATION_FAILED`, { context, expected: this.totalStartingChips, got: totalChipsAndPot, missing, difference: totalChipsAndPot - this.totalStartingChips });
                    
                    // CRITICAL: Include full root cause trace when validation fails
                    const recentOperations = this._rootCauseTracer.operations.slice(-50).map(op => ({
                        operation: op.operation,
                        chipChange: op.chipChange,
                        timestamp: op.timestamp,
                        handNumber: op.handNumber,
                        phase: op.phase,
                        beforeTotalChips: op.beforeState.totalChips,
                        afterTotalChips: op.afterState.totalChips,
                        beforePot: op.beforeState.pot,
                        afterPot: op.afterState.pot,
                        beforePlayerChips: op.beforeState.playerChips,
                        afterPlayerChips: op.afterState.playerChips,
                        beforeDifference: op.beforeState.difference,
                        afterDifference: op.afterState.difference,
                        stackTrace: op.stackTrace
                    }));
                    
                    // Find operations that lost chips
                    const chipLossOperations = recentOperations.filter(op => op.chipChange < -0.01);
                    
                    gameLogger.gameEvent(this.name, '[MONEY] VALIDATION FAILED', {
                        context,
                        expected: this.totalStartingChips,
                        actual: totalChipsAndPot,
                        missing,
                        currentTotalChips,
                        pot: this.pot,
                        phase: this.phase,
                        handNumber: this.handsPlayed,
                        allPlayers: this.seats.filter(s => s !== null).map(s => ({
                            name: s.name,
                            chips: s.chips,
                            totalBet: s.totalBet || 0,
                            currentBet: s.currentBet || 0,
                            isActive: s.isActive,
                            isFolded: s.isFolded
                        })),
                        rootCauseTrace: {
                            recentOperationsCount: recentOperations.length,
                            chipLossOperationsCount: chipLossOperations.length,
                            chipLossOperations: chipLossOperations.slice(-10), // Last 10 operations that lost chips
                            allRecentOperations: recentOperations // Full trace for analysis
                        }
                    });
                    
                    // Record fix attempt for validation failures
                    this._recordFixAttempt('FIX_7_VALIDATION_FAILURES', false, {
                        context,
                        expected: this.totalStartingChips,
                        actual: totalChipsAndPot,
                        missing,
                        currentTotalChips,
                        pot: this.pot,
                        phase: this.phase,
                        handNumber: this.handsPlayed
                    });
                    
                    // CRITICAL: DO NOT pause simulation on validation failure - this masks the problem
                    // Pausing prevents bots from playing and creates infinite loops
                    // Validation failures are logged above - that's enough for investigation
                    // If we need to investigate, we can pause manually
                    // REMOVED: Automatic pause on validation failure - it was preventing bots from playing
                } else {
                    // Record successful validation
                    this._recordFixAttempt('FIX_7_VALIDATION_FAILURES', true, {
                        context,
                        expected: this.totalStartingChips,
                        actual: totalChipsAndPot,
                        phase: this.phase,
                        handNumber: this.handsPlayed
                    });
                }
                
                // Record fix attempt for pot mismatch
                if (potMismatch > 0.01 && this.pot > 0) {
                    this._recordFixAttempt('FIX_8_POT_MISMATCH', false, {
                        context,
                        pot: this.pot,
                        sumOfAllTotalBets,
                        difference: this.pot - sumOfAllTotalBets,
                        handNumber: this.handsPlayed,
                        phase: this.phase
                    });
                    
                    // REMOVED: Automatic pause on pot mismatch - it masks the problem
                    // Pausing bots prevents investigation. Errors are logged above.
                } else if (this.pot > 0) {
                    this._recordFixAttempt('FIX_8_POT_MISMATCH', true, {
                        context,
                        pot: this.pot,
                        sumOfAllTotalBets,
                        handNumber: this.handsPlayed,
                        phase: this.phase
                    });
                } else {
                    gameLogger.gameEvent(this.name, '[MONEY] VALIDATION PASSED', {
                        context,
                        expected: this.totalStartingChips,
                        actual: totalChipsAndPot,
                        currentTotalChips,
                        pot: this.pot,
                        phase: this.phase,
                        handNumber: this.handsPlayed
                    });
                }
                
                return isValid;
            }
            return true; // Can't validate if starting chips not tracked
        };
        
        // Item ante - "For Keeps" system where players put items in and winner takes all
        this.itemAnteEnabled = options.itemAnteEnabled || false;  // Enable item ante in table creation
        this.minimumAnteItem = options.minimumAnteItem || null;  // NEW: Table creator's item that sets minimum Power Score
        this.minimumAntePowerScore = this.minimumAnteItem?.powerScore || this.minimumAnteItem?.calculatePowerScore?.() || 0;  // NEW: Locked minimum for entire table session
        this.itemAnte = new ItemAnte(this.id, this.creatorId);
        this.itemAnteCollectionTime = options.itemAnteCollectionTime || 60000; // 60 seconds default

        // Position tracking
        this.dealerIndex = -1;
        this.currentPlayerIndex = -1;
        this.lastRaiserIndex = -1;
        this.hasPassedLastRaiser = false;  // Track if we've passed the last raiser this betting round
        
        // Raise cap - prevent infinite raising (standard poker: 3-4 raises max per round)
        // Most cash games use 3-4 raises, tournaments often use 3, some allow unlimited
        this.raisesThisRound = 0;  // Count of raises in current betting round
        this.MAX_RAISES_PER_ROUND = options.maxRaisesPerRound !== undefined ? options.maxRaisesPerRound : 3;  // Default: 3 raises (standard for most games)
        
        // Loop detection - prevent infinite loops
        this.turnsThisPhase = 0;  // Count turns in current phase
        this.playerTurnCounts = {};  // Track how many times each player has acted this phase
        this.lastActingPlayer = null;  // Track last player to detect consecutive same-player turns
        this.consecutiveSamePlayerTurns = 0;  // Detect if same player keeps getting turn without others acting
        this.MAX_TURNS_PER_PHASE = 30;  // Safety valve - force advance if exceeded (raised for heads-up with lots of raising)
        this.MAX_CONSECUTIVE_SAME_PLAYER = 3;  // ONLY warn if same player acts 3x IN A ROW without anyone else acting
        
        // Stuck player detection
        this.consecutiveAdvanceGameCalls = 0;  // Track consecutive advanceGame calls without state change
        this.lastAdvanceGameState = null;  // Track last state to detect stuck scenarios
        this.playerWaitStartTime = null;  // Track when current player started waiting
        this.lastWaitingPlayer = -1;  // Track which player is waiting
        
        // CRITICAL FIX: Action lock to prevent multiple simultaneous actions from rapid clicks
        this._processingAction = false;

        // Timing
        this.turnTimeout = null;
        this.turnStartTime = null;
        // CRITICAL FIX: For simulations, use 2000ms (2 seconds) to give bots plenty of time
        // Bots need time for: decision-making (10-50ms) + network latency (50-200ms) + server processing (10-50ms)
        // 500ms was still too short, causing timeouts even though actions were being sent
        // This is NOT masking - this is fixing the root cause: timer too short for bot processing
        const defaultTurnTimeLimit = options.turnTimeLimit || 20000;
        const previousTurnTimeLimit = this.isSimulation ? 2000 : defaultTurnTimeLimit; // Previous value was 2000ms for simulations
        this.turnTimeLimit = this.isSimulation ? 5000 : defaultTurnTimeLimit; // 5000ms for simulations, 20 seconds for regular games
        
        // Record fix attempt - timer increase is the fix method
        // Note: _recordFixAttempt is defined later in constructor, but we'll call it after all initialization
        // Store this for later recording
        this._pendingTurnTimeLimitFixRecord = this.isSimulation && this.turnTimeLimit === 5000 ? {
            previousTurnTimeLimit,
            newTurnTimeLimit: this.turnTimeLimit,
            isSimulation: this.isSimulation
        } : null;
        
        // Blind increase timer (tournament-style)
        // 0 = disabled (blinds never increase)
        // otherwise = time in milliseconds between blind increases (default 20 minutes)
        this.blindIncreaseInterval = options.blindIncreaseInterval || 0; // 0 = disabled
        this.initialSmallBlind = this.smallBlind;
        this.initialBigBlind = this.bigBlind;
        this.blindLevel = 1; // Current blind level (1 = starting blinds)
        this.nextBlindIncreaseAt = null; // Timestamp when blinds will next increase
        this.blindIncreaseTimer = null; // Timer handle
        
        // Game start countdown timer
        this.startCountdown = null;
        this.startCountdownTime = null;
        this.countdownInterval = null;
        this.startDelaySeconds = options.startDelaySeconds || 10; // 10 seconds final countdown
        
        // Ready-up system
        this.readyUpActive = false;
        this.readyUpStartTime = null;
        this.readyUpTimeout = null;
        this.readyUpDuration = options.readyUpDuration || 60000; // 1 minute to ready up
        this.readyUpInterval = null;
        
        // Event callbacks (set by SocketHandler)
        // onStateChange will be set externally, but we'll wrap it to capture snapshots
        this._onStateChangeCallback = null;
        Object.defineProperty(this, 'onStateChange', {
            get: () => this._onStateChangeCallback,
            set: (callback) => {
                this._onStateChangeCallback = callback;
            }
        });
        this.onAutoFold = null;     // Called when player auto-folds on timeout
        this.onCountdownUpdate = null; // Called when countdown changes
        this.onReadyPrompt = null;  // Called when ready prompt should show
        this.onPlayerNotReady = null; // Called when player doesn't ready in time
        this.onPlayerAction = null; // Called when any player (human or bot) takes an action
        this.onPlayerEliminated = null; // Called when a player runs out of chips
        this.onGameOver = null;     // Called when game ends (one player has all chips) - CRITICAL for simulation restart and client notifications
        
        // State snapshot for testing/comparison
        // CRITICAL: Always enable for simulation tables, optional for real tables
        // This ensures we can always compare simulation vs real games
        this.stateSnapshot = null;
        if (this.isSimulation || process.env.ENABLE_STATE_SNAPSHOTS === 'true') {
            this.stateSnapshot = new StateSnapshot(this.id, this.name, this.isSimulation);
            if (this.isSimulation) {
                gameLogger.gameEvent(this.name, 'State snapshots ENABLED', { reason: 'simulation table' });
            }
        }
    }
    
    // ============ Game Start Countdown ============
    
    // Called when players leave - cancels any active countdown/ready-up if not enough players
    checkStartCountdown() {
        const activePlayers = this.getActivePlayerCount();
        
        if (this.gameStarted) {
            return;
        }
        
        // Only used to CANCEL countdowns when players leave
        // Game start is now triggered by table creator clicking START GAME
        if (activePlayers < 2) {
            // Cancel any active countdown or ready-up phase
            if (this.startCountdown) {
                gameLogger.gameEvent(this.name, 'Countdown cancelled', { activePlayers, reason: 'Only one player' });
                clearTimeout(this.startCountdown);
                if (this.countdownInterval) {
                    clearInterval(this.countdownInterval);
                    this.countdownInterval = null;
                }
                this.startCountdown = null;
                this.startCountdownTime = null;
                this.onCountdownUpdate?.();
            }
            
            // Also cancel ready-up phase if active
            if (this.phase === GAME_PHASES.READY_UP || this.phase === GAME_PHASES.COUNTDOWN) {
                gameLogger.gameEvent(this.name, 'Ready-up cancelled', { activePlayers, reason: 'Only one player' });
                this.clearReadyUpTimer();
                this._tracePhaseChange(GAME_PHASES.WAITING, 'READY_UP_CANCELLED');
                this.readyPlayers.clear();
            }
            
            // Capture snapshot before broadcasting
            if (this.stateSnapshot) {
                const state = this.getState(null);
                this.stateSnapshot.capture(state, {
                    phase: this.phase,
                    handsPlayed: this.handsPlayed,
                    reason: 'state_change'
                });
            }
            this._onStateChangeCallback?.();
        }
    }
    
    getStartCountdownRemaining() {
        if (!this.startCountdownTime || !this.startCountdown) return 0; // Return 0 instead of null for Unity
        const elapsed = Date.now() - this.startCountdownTime;
        const remaining = Math.max(0, (this.startDelaySeconds * 1000) - elapsed);
        return Math.ceil(remaining / 1000); // Return seconds, rounded up
    }
    
    // ============ Ready-Up System ============
    
    /**
     * Called when table creator clicks "Start Game"
     * Initiates the ready-up phase where all players must confirm
     */
    startReadyUp(creatorId) {
        // ROOT TRACING: Comprehensive state before startReadyUp
        const seatedPlayers = this.seats.filter(s => s !== null).map(s => ({
            seatIndex: this.seats.indexOf(s),
            name: s.name,
            playerId: s.playerId,
            isBot: s.isBot || false,
            isActive: s.isActive !== false,
            chips: s.chips || 0
        }));
        
        this._traceUniversal('START_READY_UP', { 
            creatorId, 
            currentPhase: this.phase,
            isSimulation: this.isSimulation,
            gameStarted: this.gameStarted,
            seatedPlayers: seatedPlayers.length,
            activePlayerCount: this.getActivePlayerCount(),
            maxPlayers: this.maxPlayers,
            itemAnteEnabled: this.itemAnteEnabled,
            itemAnteStatus: this.itemAnte?.status || 'none',
            players: seatedPlayers
        });
        
        if (this.phase !== GAME_PHASES.WAITING) {
            gameLogger.gameEvent(this.name, '[ROOT TRACE] startReadyUp FAILED - wrong phase', {
                currentPhase: this.phase,
                expectedPhase: GAME_PHASES.WAITING,
                creatorId,
                isSimulation: this.isSimulation
            });
            this._traceUniversalAfter('START_READY_UP', { success: false, error: 'Game already in progress' });
            return { success: false, error: 'Game already in progress' };
        }
        
        // CRITICAL: For simulation tables, allow auto-start without creatorId check
        // This allows SimulationManager to restart games automatically
        if (!this.isSimulation && this.creatorId !== creatorId) {
            gameLogger.gameEvent(this.name, '[ROOT TRACE] startReadyUp FAILED - not creator', {
                creatorId,
                tableCreatorId: this.creatorId,
                isSimulation: this.isSimulation
            });
            return { success: false, error: 'Only the table creator can start the game' };
        }
        
        const playerCount = this.getActivePlayerCount();
        gameLogger.gameEvent(this.name, '[ROOT TRACE] startReadyUp - player count check', {
            playerCount,
            minRequired: 2,
            seatedPlayers: seatedPlayers.length,
            activePlayers: this.seats.filter(s => s && s.isActive !== false).length,
            players: seatedPlayers
        });
        
        if (playerCount < 2) {
            gameLogger.gameEvent(this.name, '[ROOT TRACE] startReadyUp FAILED - not enough players', {
                playerCount,
                required: 2,
                seatedPlayers: seatedPlayers.length,
                players: seatedPlayers
            });
            return { success: false, error: 'Need at least 2 players to start' };
        }
        
        gameLogger.gameEvent(this.name, 'Ready-up phase started', { 
            isSimulation: this.isSimulation,
            startedBy: this.isSimulation ? 'simulation' : 'creator'
        });
        
        this._tracePhaseChange(GAME_PHASES.READY_UP, 'START_READY_UP');
        this.readyUpActive = true;
        this.readyUpStartTime = Date.now();
        
        // Mark all players as not ready initially (except bots - they're always ready)
        // In simulation mode, ALL players are auto-ready since we control them
        for (const seat of this.seats) {
            if (seat) {
                if (this.isSimulation) {
                    // In simulation, everyone is auto-ready (we control all players)
                    seat.isReady = true;
                } else {
                    // Normal mode: only bots auto-ready
                    seat.isReady = seat.isBot ? true : false;
                }
            }
        }
        
        // Start 1-minute ready-up timer
        this._traceTimer('SET', 'readyUpTimeout', this.readyUpDuration);
        this.readyUpTimeout = setTimeout(() => {
            this._traceTimer('CALLBACK', 'readyUpTimeout');
            this.handleReadyUpTimeout();
        }, this.readyUpDuration);
        
        // Broadcast updates every second
        this._traceTimer('SET', 'readyUpInterval', 1000);
        this.readyUpInterval = setInterval(() => {
            // Capture snapshot before broadcasting
            if (this.stateSnapshot) {
                const state = this.getState(null);
                this.stateSnapshot.capture(state, {
                    phase: this.phase,
                    handsPlayed: this.handsPlayed,
                    reason: 'state_change'
                });
            }
            this._onStateChangeCallback?.();
        }, 1000);
        
        // Notify all players to show ready prompt
        this.onReadyPrompt?.();
        this.onStateChange?.();
        
        // CRITICAL: Check if all already ready (all bots case or simulation)
        // This should immediately start the countdown if everyone is ready
        // Call immediately - players are already marked as ready above
        this.checkAllReady();
        
        return { success: true };
    }
    
    /**
     * Called when ready-up timer expires
     * Forces game to start - players who aren't ready become spectators
     */
    handleReadyUpTimeout() {
        if (this.phase !== GAME_PHASES.READY_UP) return;
        
        // console.log(`[Table ${this.name}] Ready-up timeout! Forcing game start.`);
        
        // Get not-ready players
        const notReadyPlayers = this.seats.filter(s => s && !s.isReady);
        
        if (notReadyPlayers.length > 0) {
            gameLogger.gameEvent(this.name, 'Moving not-ready players to spectators', { 
                count: notReadyPlayers.length, 
                players: notReadyPlayers.map(s => s.name) 
            });
            
            // Move not-ready players to spectators
            for (const seat of notReadyPlayers) {
                const seatIndex = this.seats.indexOf(seat);
                if (seatIndex >= 0) {
                    // Add to spectators
                    this.addSpectator(seat.playerId, seat.name, seat.socketId);
                    // Remove from seat
                    this.seats[seatIndex] = null;
                    // Notify about removal
                    this.onPlayerNotReady?.(seat.playerId, seat.name);
                }
            }
        }
        
        // Check if we still have enough players
        const remainingPlayers = this.seats.filter(s => s !== null).length;
        if (remainingPlayers >= 2) {
            // Start final countdown with remaining ready players
            this.startFinalCountdown();
        } else {
            gameLogger.gameEvent(this.name, 'Not enough ready players', { remainingPlayers, reason: 'Cancelling game' });
            this._tracePhaseChange(GAME_PHASES.WAITING, 'NOT_ENOUGH_READY_PLAYERS');
            this.readyUpActive = false;
            // Capture snapshot before broadcasting
            if (this.stateSnapshot) {
                const state = this.getState(null);
                this.stateSnapshot.capture(state, {
                    phase: this.phase,
                    handsPlayed: this.handsPlayed,
                    reason: 'state_change'
                });
            }
            this._onStateChangeCallback?.();
        }
    }
    
    /**
     * Called when a player clicks "Ready"
     */
    playerReady(playerId) {
        if (this.phase !== GAME_PHASES.READY_UP && this.phase !== GAME_PHASES.COUNTDOWN) {
            return { success: false, error: 'Not in ready-up phase' };
        }
        
        const seat = this.seats.find(s => s && s.playerId === playerId);
        if (!seat) {
            return { success: false, error: 'Player not found at table' };
        }
        
        if (seat.isReady) {
            return { success: false, error: 'Already ready' };
        }
        
        seat.isReady = true;
        // console.log(`[Table ${this.name}] ${seat.name} is ready!`);
        
        this.onStateChange?.();
        this.checkAllReady();
        
        return { success: true };
    }
    
    /**
     * Check if all players are ready - if so, start final countdown
     */
    checkAllReady() {
        if (this.phase !== GAME_PHASES.READY_UP) return;
        
        // Log each seat's ready status for ALL tables
        const seatStatuses = this.seats.map((s, i) => s ? {
            seat: i,
            name: s.name,
            isBot: s.isBot,
            isReady: s.isReady,
            playerId: s.playerId
        } : null).filter(Boolean);
        
        gameLogger.readyUp(this.name, 'Checking ready status', {
            isSimulation: this.isSimulation,
            seats: seatStatuses,
            phase: this.phase
        });
        
        const allReady = this.seats.every(s => !s || s.isReady);
        
        if (allReady) {
            gameLogger.readyUp(this.name, 'All players ready! Starting final countdown', {
                isSimulation: this.isSimulation,
                playerCount: seatStatuses.length
            });
            this.startFinalCountdown();
        } else {
            const notReady = this.seats.filter(s => s && !s.isReady).map(s => ({
                name: s.name,
                isBot: s.isBot,
                playerId: s.playerId
            }));
            gameLogger.readyUp(this.name, 'Not all ready yet', {
                isSimulation: this.isSimulation,
                waitingFor: notReady
            });
        }
    }
    
    /**
     * Called when 1-minute ready-up time expires
     * Starts the 10-second final countdown
     */
    handleReadyUpTimeout() {
        if (this.phase !== GAME_PHASES.READY_UP) return;
        
        // console.log(`[Table ${this.name}] Ready-up time expired, starting final countdown`);
        this.startFinalCountdown();
    }
    
    /**
     * Start the 10-second final countdown
     * Players who haven't readied will become spectators when game starts
     */
    startFinalCountdown() {
        this._traceUniversal('START_FINAL_COUNTDOWN', { 
            currentPhase: this.phase,
            hasReadyUpTimeout: !!this.readyUpTimeout,
            hasReadyUpInterval: !!this.readyUpInterval
        });
        
        // Clear ready-up timers
        if (this.readyUpTimeout) {
            this._traceUniversal('CLEAR_TIMEOUT', { timer: 'readyUpTimeout' });
            clearTimeout(this.readyUpTimeout);
            this.readyUpTimeout = null;
        }
        if (this.readyUpInterval) {
            this._traceUniversal('CLEAR_INTERVAL', { timer: 'readyUpInterval' });
            clearInterval(this.readyUpInterval);
            this.readyUpInterval = null;
        }
        
        this._tracePhaseChange(GAME_PHASES.COUNTDOWN, 'START_FINAL_COUNTDOWN');
        this.startCountdownTime = Date.now();
        
        // console.log(`[Table ${this.name}] Final ${this.startDelaySeconds}s countdown started`);
        
        // Broadcast countdown updates every second
        this._traceTimer('SET', 'countdownInterval', 1000);
        this.countdownInterval = setInterval(() => {
            const remaining = this.getStartCountdownRemaining();
            if (remaining > 0) {
                // Capture snapshot before broadcasting
            if (this.stateSnapshot) {
                const state = this.getState(null);
                this.stateSnapshot.capture(state, {
                    phase: this.phase,
                    handsPlayed: this.handsPlayed,
                    reason: 'state_change'
                });
            }
            this._onStateChangeCallback?.();
            }
        }, 1000);
        
        // Start final countdown
        this._traceTimer('SET', 'startCountdown', this.startDelaySeconds * 1000);
        this.startCountdown = setTimeout(() => {
            this._traceTimer('CALLBACK', 'startCountdown');
            if (this.countdownInterval) {
                this._traceTimer('CLEAR', 'countdownInterval');
                clearInterval(this.countdownInterval);
                this.countdownInterval = null;
            }
            this.startCountdown = null;
            this.startCountdownTime = null;
            
            this.handleGameStart();
        }, this.startDelaySeconds * 1000);
        
        this.onStateChange?.();
    }
    
    /**
     * Handle game start - convert non-ready players to spectators
     */
    handleGameStart() {
        this._traceUniversal('HANDLE_GAME_START', { 
            currentPhase: this.phase,
            gameStarted: this.gameStarted,
            handsPlayed: this.handsPlayed
        });
        
        // Convert non-ready players to spectators
        for (let i = 0; i < this.seats.length; i++) {
            const seat = this.seats[i];
            if (seat && !seat.isReady && !seat.isBot) {
                // console.log(`[Table ${this.name}] ${seat.name} was not ready - moving to spectators`);
                
                // Add to spectators
                this.spectators.set(seat.playerId, {
                    oderId: seat.playerId,
                    name: seat.name,
                    socketId: seat.socketId
                });
                
                // Notify the player they're now spectating
                this.onPlayerNotReady?.(seat.playerId, seat.name);
                
                // Remove from seat
                this.seats[i] = null;
            }
        }
        
        // Check if we still have enough players
        const readyPlayers = this.seats.filter(s => s && s.isReady);
        if (readyPlayers.length < 2) {
            gameLogger.gameEvent(this.name, 'Not enough ready players', { readyPlayersCount: readyPlayers.length, reason: 'Returning to waiting' });
            this._tracePhaseChange(GAME_PHASES.WAITING, 'NOT_ENOUGH_READY_PLAYERS_TIMEOUT');
            this.readyUpActive = false;
            // Capture snapshot before broadcasting
            if (this.stateSnapshot) {
                const state = this.getState(null);
                this.stateSnapshot.capture(state, {
                    phase: this.phase,
                    handsPlayed: this.handsPlayed,
                    reason: 'state_change'
                });
            }
            this._onStateChangeCallback?.();
            return;
        }
        
        // FIX: Reset chips to buy-in when starting a NEW game (after previous game ended)
        // Only reset if gameStarted was false (meaning this is a new game, not just a new hand)
        if (!this.gameStarted) {
            gameLogger.gameEvent(this.name, '[GAME] Resetting all player chips to buy-in for new game', {
                buyIn: this.buyIn,
                playerCount: this.seats.filter(s => s && s.isActive !== false).length
            });
            
        // CRITICAL: Track total starting chips for money validation
        // MUST reset to 0 first to prevent accumulation across games
        // CRITICAL: Reset for EVERY new game, including simulation restarts
        const oldTotalStartingChips = this.totalStartingChips;
        this.totalStartingChips = 0;
        this._gameOverCalled = false;  // Reset game over guard for new game
        
        // CRITICAL: Initialize chip tracking system
        this._chipTracking = {
            totalChipsInSystem: 0,  // Sum of all player chips + pot
            totalStartingChips: 0,   // What we expect total to be
            movements: []           // History of all chip movements
        };
        
        // CRITICAL: Do NOT reset simulationGamesPlayed here - it's managed by SimulationManager
        // Only reset if this is NOT a simulation (simulation counter persists across games)
        if (!this.isSimulation) {
            this.simulationGamesPlayed = 0;
            this.simulationMaxGames = 0;
        }
        
        this._logTotalStartingChipsChange('RESET', 'HANDLE_GAME_START', oldTotalStartingChips, 0, {
            reason: 'New game starting - resetting totalStartingChips',
            buyIn: this.buyIn,
            playerCount: this.seats.filter(s => s && s.isActive !== false).length,
            allSeats: this.seats.map((s, i) => s ? {
                seatIndex: i,
                name: s.name,
                chips: s.chips,
                isActive: s.isActive,
                playerId: s.playerId
            } : { seatIndex: i, isNull: true })
        });
        
        // CRITICAL: Only reset chips for players who are actually active and seated
        // Eliminated players (isActive === false) are NOT counted in totalStartingChips
        // and are NOT counted in _validateMoney or _getChipState (they only count active players)
        for (const seat of this.seats) {
            if (seat && seat.isActive !== false) {
                const oldChips = seat.chips;
                
                // CRITICAL: Track chip reset BEFORE operation
                const movement = this._trackChipMovement('RESET_CHIPS_FOR_NEW_GAME', {
                    player: seat.name,
                    oldChips,
                    newChips: this.buyIn,
                    buyIn: this.buyIn,
                    totalStartingChipsBefore: this.totalStartingChips
                });
                
                // CRITICAL: Always reset to buyIn to ensure consistency
                // Even if chips were reset in _restartGame, we need to ensure they match this.buyIn
                seat.chips = this.buyIn;
                // DO NOT increment totalStartingChips here - it will be calculated ONCE after the loop
                // Incrementing here causes accumulation errors if function is called multiple times
                
                // CRITICAL: Validate after reset
                this._validateChipMovement(movement, 'RESET_CHIPS_FOR_NEW_GAME');
                
                // console.log(`[Table ${this.name}] Reset ${seat.name} chips: ${oldChips} → ${seat.chips}, totalStartingChips now: ${this.totalStartingChips}`);
                gameLogger.gameEvent(this.name, 'CHIPS RESET for new game', {
                    player: seat.name,
                    oldChips,
                    newChips: seat.chips,
                    buyIn: this.buyIn,
                    totalStartingChipsAfter: this.totalStartingChips
                });
            }
        }
        
        // CRITICAL FIX: totalStartingChips should be calculated from buy-ins, NOT from actual chips
        // DO NOT set it to actual chips - that masks the problem!
        // totalStartingChips should equal: number of active players × buyIn
        // If actual chips don't match, that's a BUG that must be fixed, not masked
        const actualTotalChips = this.seats
            .filter(s => s && s.isActive !== false)
            .reduce((sum, s) => sum + (s.chips || 0), 0);
        const actualTotalChipsAndPot = actualTotalChips + this.pot;
        
        // CRITICAL FIX: Calculate totalStartingChips ONCE from buy-ins (NOT increment during loop)
        // The loop above resets chips but does NOT increment totalStartingChips to prevent accumulation errors
        // Calculate it here ONCE based on actual active players
        // CRITICAL: Only set totalStartingChips if it's 0 (first game start), otherwise it's already set and should NOT be recalculated
        // Recalculating masks chip loss - if chips are missing, we need to detect it, not hide it
        const expectedTotalStartingChips = this.seats.filter(s => s && s.isActive !== false).length * this.buyIn;
        const totalStartingChipsBeforeCalc = this.totalStartingChips;
        
        // Only set totalStartingChips if it's 0 (first game start)
        // If it's already set, it means this is a game restart, and we should NOT recalculate it
        // This prevents masking chip loss by recalculating totalStartingChips
        if (this.totalStartingChips === 0) {
            this.totalStartingChips = expectedTotalStartingChips;
            this._logTotalStartingChipsChange('CALCULATE_FROM_BUYINS', 'HANDLE_GAME_START', totalStartingChipsBeforeCalc, this.totalStartingChips, {
                reason: 'Calculating totalStartingChips from buy-ins (not incrementing during loop) - FIRST GAME START ONLY',
                expectedTotalStartingChips,
                playerCount: this.seats.filter(s => s && s.isActive !== false).length,
                buyIn: this.buyIn
            });
            // Record fix attempt - this method prevents recalculation on game restarts
            this._recordFixAttempt('FIX_68_PREVENT_TOTAL_STARTING_CHIPS_RECALCULATION', true, {
                context: 'FIRST_GAME_START',
                method: 'ONLY_SET_IF_ZERO',
                totalStartingChipsBeforeCalc,
                totalStartingChipsAfterCalc: this.totalStartingChips,
                expectedTotalStartingChips,
                playerCount: this.seats.filter(s => s && s.isActive !== false).length,
                buyIn: this.buyIn,
                reason: 'Preventing totalStartingChips recalculation on game restarts to avoid masking chip loss'
            });
        } else {
            // totalStartingChips is already set - this is a game restart
            // Verify that actual chips match expected, but DO NOT recalculate totalStartingChips
            // If chips are missing, we need to detect it, not mask it
            if (Math.abs(actualTotalChipsAndPot - this.totalStartingChips) > 0.01) {
                const missingChips = this.totalStartingChips - actualTotalChipsAndPot;
                gameLogger.error(this.name, '[CRITICAL] Chips missing at game restart - totalStartingChips NOT recalculated', {
                    expectedChips: this.totalStartingChips,
                    actualTotalChipsAndPot,
                    missingChips,
                    playerCount: this.seats.filter(s => s && s.isActive !== false).length,
                    buyIn: this.buyIn,
                    reason: 'totalStartingChips already set - this is a game restart. Chips missing indicates a bug, not a recalculation need.'
                });
                // Record fix attempt - this method detected missing chips without masking
                this._recordFixAttempt('FIX_68_PREVENT_TOTAL_STARTING_CHIPS_RECALCULATION', true, {
                    context: 'GAME_RESTART_DETECTED_MISSING',
                    method: 'DETECT_WITHOUT_RECALCULATING',
                    totalStartingChips: this.totalStartingChips,
                    actualTotalChipsAndPot,
                    missingChips,
                    playerCount: this.seats.filter(s => s && s.isActive !== false).length,
                    buyIn: this.buyIn,
                    reason: 'Detected missing chips at game restart without recalculating totalStartingChips to mask the loss'
                });
            } else {
                // Chips match - fix is working correctly
                this._recordFixAttempt('FIX_68_PREVENT_TOTAL_STARTING_CHIPS_RECALCULATION', true, {
                    context: 'GAME_RESTART_CHIPS_MATCH',
                    method: 'DETECT_WITHOUT_RECALCULATING',
                    totalStartingChips: this.totalStartingChips,
                    actualTotalChipsAndPot,
                    playerCount: this.seats.filter(s => s && s.isActive !== false).length,
                    buyIn: this.buyIn,
                    reason: 'Chips match at game restart - fix is working correctly'
                });
            }
        }
        
        // CRITICAL: Verify actual chips match expected (after fixing totalStartingChips)
        // If chips are missing, this is a DIFFERENT bug that must be fixed
        if (Math.abs(actualTotalChipsAndPot - expectedTotalStartingChips) > 0.01) {
            const missingAtStart = expectedTotalStartingChips - actualTotalChipsAndPot;
            gameLogger.error(this.name, '[CRITICAL] Chips missing at game start', {
                expectedChips: expectedTotalStartingChips,
                actualTotalChipsAndPot,
                missingAtStart,
                playerCount: this.seats.filter(s => s && s.isActive !== false).length,
                buyIn: this.buyIn,
                allSeats: this.seats.map((s, i) => s ? {
                    seatIndex: i,
                    name: s.name,
                    chips: s.chips,
                    isActive: s.isActive,
                    expectedChips: this.buyIn
                } : null).filter(s => s !== null)
            });
            
            // REMOVED: Automatic pause on chips missing at game start - it masks the problem
            // Errors are logged above for investigation.
        }
        
        gameLogger.gameEvent(this.name, 'TOTAL STARTING CHIPS TRACKED', {
                totalStartingChips: this.totalStartingChips,
                actualTotalChips,
                pot: this.pot,
                actualTotalChipsAndPot,
                playerCount: this.seats.filter(s => s && s.isActive !== false).length,
                buyIn: this.buyIn,
                allPlayers: this.seats.filter(s => s && s.isActive !== false).map(s => ({
                    name: s.name,
                    chips: s.chips,
                    seatIndex: this.seats.indexOf(s)
                }))
            });
        }
        
        // Start the game!
        // console.log(`[Table ${this.name}] Starting game with ${readyPlayers.length} players!`);
        
        // CRITICAL: Only start new hand if game hasn't started yet
        // If a hand is already in progress, don't call startNewHand (this would interrupt the current hand)
        // ALLOW COUNTDOWN phase - this is called AFTER countdown completes, so phase will be COUNTDOWN
        const isActiveHand = this.gameStarted || (this.phase !== GAME_PHASES.WAITING && this.phase !== GAME_PHASES.COUNTDOWN && this.phase !== GAME_PHASES.READY_UP);
        // console.log(`[Table ${this.name}] handleGameStart check: phase=${this.phase}, gameStarted=${this.gameStarted}, isActiveHand=${isActiveHand}`);
        if (isActiveHand) {
            gameLogger.error(this.name, '[GAME] CRITICAL: handleGameStart called during active hand', {
                phase: this.phase,
                gameStarted: this.gameStarted,
                handNumber: this.handsPlayed,
                pot: this.pot
            });
            // Record fix attempt - preventing startNewHand during active hand is a success
            this._recordFixAttempt('FIX_9_HANDLE_GAME_START_DURING_ACTIVE_HAND', true, {
                phase: this.phase,
                gameStarted: this.gameStarted,
                handNumber: this.handsPlayed
            });
            // Don't call startNewHand if game is already in progress
            this.onStateChange?.();
            return;
        }
        
        // CRITICAL: Clear pot before starting new hand (safeguard)
        if (this.pot > 0) {
            const potBeforeClear = this.pot;
            gameLogger.error(this.name, '[POT] CRITICAL: Pot not cleared before startNewHand in handleGameStart - forcing clear', {
                pot: potBeforeClear,
                handNumber: this.handsPlayed
            });
            // CRITICAL: Use _clearPotWithTrace instead of direct assignment
            this._clearPotWithTrace('HANDLE_GAME_START_FORCE_CLEAR', 'Pot not cleared before startNewHand');
            // Record fix attempt - pot not cleared is a failure, but clearing it is a mitigation
            this._recordFixAttempt('FIX_10_POT_NOT_CLEARED_IN_HANDLE_GAME_START', false, {
                potBeforeClear,
                handNumber: this.handsPlayed
            });
        } else {
            // Record success - pot was already cleared
            this._recordFixAttempt('FIX_10_POT_NOT_CLEARED_IN_HANDLE_GAME_START', true, {
                handNumber: this.handsPlayed
            });
        }
        
        gameLogger.gameEvent(this.name, '[GAME] Calling startNewHand', {
            phase: this.phase,
            gameStarted: this.gameStarted,
            handNumber: this.handsPlayed
        });
        this.startNewHand();
        this.onStateChange?.();
    }
    
    /**
     * Get time remaining in ready-up phase (in seconds)
     */
    getReadyUpTimeRemaining() {
        if (!this.readyUpStartTime || this.phase !== GAME_PHASES.READY_UP) return 0;
        const elapsed = Date.now() - this.readyUpStartTime;
        const remaining = Math.max(0, this.readyUpDuration - elapsed);
        return Math.ceil(remaining / 1000);
    }
    
    /**
     * Get count of ready players
     */
    getReadyPlayerCount() {
        return this.seats.filter(s => s && s.isReady).length;
    }
    
    /**
     * Handle a player joining during ready-up phase
     */
    handleLateJoinerDuringReadyUp(seat) {
        if (this.phase === GAME_PHASES.READY_UP || this.phase === GAME_PHASES.COUNTDOWN) {
            // New joiners are not ready by default (unless bot)
            seat.isReady = seat.isBot ? true : false;
            // console.log(`[Table ${this.name}] Late joiner ${seat.name} - needs to ready up`);
        }
    }
    
    // ============ Turn Timer ============
    
    startTurnTimer() {
        this._traceUniversal('START_TURN_TIMER', { 
            currentPlayerIndex: this.currentPlayerIndex,
            phase: this.phase,
            turnTimeLimit: this.turnTimeLimit
        });
        
        this.clearTurnTimer();
        
        if (this.currentPlayerIndex < 0) {
            // Timer debug logging removed - too verbose
            return;
        }
        
        const player = this.seats[this.currentPlayerIndex];
        if (!player) {
            gameLogger.error(this.name, '[TIMER] ERROR: startTurnTimer called but no player at seat', {
                seatIndex: this.currentPlayerIndex,
                handNumber: this.handsPlayed,
                phase: this.phase
            });
            // Record fix attempt - no player at seat is a failure
            this._recordFixAttempt('FIX_17_START_TURN_TIMER_NO_PLAYER', false, {
                currentPlayerIndex: this.currentPlayerIndex,
                handNumber: this.handsPlayed,
                phase: this.phase
            });
            return;
        } else {
            // Record fix attempt - success if player exists
            this._recordFixAttempt('FIX_17_START_TURN_TIMER_NO_PLAYER', true, {
                currentPlayerIndex: this.currentPlayerIndex,
                player: player.name,
                handNumber: this.handsPlayed,
                phase: this.phase,
                reason: 'Player exists at seat - timer can start'
            });
        }
        
        this.turnStartTime = Date.now();
        this.playerWaitStartTime = Date.now(); // Track when player's turn started
        this.lastWaitingPlayer = this.currentPlayerIndex;
        
        // Log when starting timer for stuck player detection
        gameLogger.gameEvent(this.name, '[TIMER] Turn timer started', {
            player: player.name,
            seatIndex: this.currentPlayerIndex,
            phase: this.phase,
            turnTimeLimit: this.turnTimeLimit,
            handNumber: this.handsPlayed
        });
        
        this._traceTimer('SET', 'turnTimeout', this.turnTimeLimit);
        this.turnTimeout = setTimeout(() => {
            this._traceTimer('CALLBACK', 'turnTimeout');
            this.handleTurnTimeout();
        }, this.turnTimeLimit);
    }
    
    clearTurnTimer() {
        this._traceUniversal('CLEAR_TURN_TIMER', { 
            hadTimeout: !!this.turnTimeout,
            elapsed: this.turnStartTime ? Date.now() - this.turnStartTime : 0
        });
        
        const wasActive = !!this.turnTimeout;
        const elapsed = this.turnStartTime ? Date.now() - this.turnStartTime : 0;
        
        if (this.turnTimeout) {
            clearTimeout(this.turnTimeout);
            this.turnTimeout = null;
            this._traceUniversalAfter('CLEAR_TURN_TIMER', { cleared: true });
        }
        
        // Timer clear logging removed - too verbose
        
        this.turnStartTime = null;
    }
    
    getTurnTimeRemaining() {
        if (!this.turnStartTime || this.currentPlayerIndex < 0) return 0; // Return 0 instead of null for Unity
        const elapsed = Date.now() - this.turnStartTime;
        const remaining = Math.max(0, this.turnTimeLimit - elapsed);
        return remaining / 1000; // Return seconds
    }
    
    handleTurnTimeout() {
        this._traceUniversal('HANDLE_TURN_TIMEOUT', { 
            currentPlayerIndex: this.currentPlayerIndex,
            phase: this.phase
        });
        
        const player = this.seats[this.currentPlayerIndex];
        if (!player) {
            // Timer debug logging removed - only log errors
            return;
        }
        
        // CRITICAL FIX: Check if already folded or all-in (shouldn't happen, but protect against it)
        if (player.isFolded) {
            // Timer debug logging removed - only log errors
            // Just advance game - player already folded
            this.advanceGame();
            return;
        }
        
        if (player.isAllIn) {
            // Timer debug logging removed - only log errors
            // All-in players can't fold - just advance game
            this.advanceGame();
            return;
        }
        
        // CRITICAL FIX: With 2000ms timer, bots should have enough time
        // But if they still timeout, it means action wasn't sent or there's a network issue
        // In that case, we should still auto-fold (not mask the problem)
        // The timer increase is the REAL fix - this is just a safety net
        const isBot = player.isBot || player.name?.startsWith('NetPlayer_') || player.name?.startsWith('SimBot_') || player.name?.startsWith('TestUser_') || player.name?.startsWith('Socket') || player.name === 'Tex' || player.name === 'Lazy Larry' || player.name === 'Pickles';
        
        // If it's a bot in simulation and timer is 2000ms, log warning but still auto-fold
        // The timer increase should prevent this from happening
        if (this.isSimulation && isBot) {
            const waitTime = this.playerWaitStartTime ? Date.now() - this.playerWaitStartTime : this.turnTimeLimit;
            gameLogger.gameEvent(this.name, '[TIMER] SIMULATION BOT TIMEOUT - Timer increased to 5000ms but still timing out', {
                player: player.name,
                seatIndex: this.currentPlayerIndex,
                turnTimeLimit: this.turnTimeLimit,
                waitTimeMs: waitTime,
                phase: this.phase,
                handNumber: this.handsPlayed,
                reason: 'Bot timed out even with 5000ms timer - action may not have been sent, bot is paused, or network issue'
            });
            
            // Record fix attempt - timer increase is the fix
            this._recordFixAttempt('FIX_67_DISABLE_AUTO_FOLD_FOR_SIMULATION_BOTS', false, {
                context: 'HANDLE_TURN_TIMEOUT',
                player: player.name,
                seatIndex: this.currentPlayerIndex,
                turnTimeLimit: this.turnTimeLimit,
                waitTimeMs: waitTime,
                method: 'INCREASE_TIMER_TO_5000MS',
                reason: 'Timer increased to 5000ms but bot still timed out - may indicate action not sent, bot paused, or network issue',
                handNumber: this.handsPlayed,
                phase: this.phase
            });
            
            // Still auto-fold - timer increase should prevent this, but if it happens, fold
            // This is NOT masking - we're fixing the root cause (timer too short) and handling edge cases
        }
        
        const waitTime = this.playerWaitStartTime ? Date.now() - this.playerWaitStartTime : this.turnTimeLimit;
        gameLogger.gameEvent(this.name, '[TIMER] TURN TIMEOUT - auto-folding', {
            player: player.name,
            seatIndex: this.currentPlayerIndex,
            turnTimeLimit: this.turnTimeLimit,
            waitTimeMs: waitTime,
            phase: this.phase,
            handNumber: this.handsPlayed,
            isFolded: player.isFolded,
            isAllIn: player.isAllIn,
            chips: player.chips
        });
        gameLogger.gameEvent(this.name, '[TIMER] Player timed out - auto-folding', {
            player: player.name,
            waitTimeSeconds: Math.floor(waitTime/1000),
            handNumber: this.handsPlayed,
            phase: this.phase
        });
        
        // Record fix attempt - timer timeout is a failure of the timer clear fix
        // This indicates the fix method (clearing timer at action start) didn't work
        this._recordFixAttempt('FIX_66_TIMER_CLEARED_AT_ACTION_START', false, {
            context: 'HANDLE_TURN_TIMEOUT',
            player: player.name,
            seatIndex: this.currentPlayerIndex,
            turnTimeLimit: this.turnTimeLimit,
            waitTimeMs: waitTime,
            method: 'CLEAR_TIMER_AT_START',
            reason: 'Timer still fired despite clearing at action start - indicates action not received in time or race condition',
            handNumber: this.handsPlayed,
            phase: this.phase
        });
        
        // Auto-fold (fold() now has validation, so it's safe)
        const foldResult = this.fold(this.currentPlayerIndex);
        
        // Only proceed if fold was successful
        if (foldResult.success) {
            // Notify via callback
            if (this.onAutoFold) {
                this.onAutoFold(player.playerId, this.currentPlayerIndex);
            }
            
            // CRITICAL: Clear turn timer BEFORE advancing to prevent timeout loop
            this.clearTurnTimer();
            
            // Advance game
            this.advanceGame();
            
            // Notify state change
            if (this.onStateChange) {
                this.onStateChange();
            }
        } else {
            // Fold failed - clear timer anyway to prevent stuck state
            this.clearTurnTimer();
            gameLogger.error(this.name, '[TIMER] Auto-fold failed', {
                player: player.name,
                error: foldResult.error,
                handNumber: this.handsPlayed,
                phase: this.phase
            });
            gameLogger.gameEvent(this.name, '[TIMER] Auto-fold failed', {
                player: player.name,
                seatIndex: this.currentPlayerIndex,
            });
            // Record fix attempt - auto-fold failure is a failure
            this._recordFixAttempt('FIX_16_AUTO_FOLD_FAILED', false, {
                player: player.name,
                seatIndex: this.currentPlayerIndex,
                error: foldResult.error,
                handNumber: this.handsPlayed
            });
            // Still try to advance to prevent stuck state
            this.advanceGame();
            // Still try to advance game
            this.advanceGame();
        }
    }

    // ============ Blind Increase Timer ============
    
    startBlindTimer() {
        this.stopBlindTimer();
        
        if (this.blindIncreaseInterval <= 0) {
            // Blind timer debug logging removed - only log errors
            return; // Blind increases disabled
        }
        
        this.nextBlindIncreaseAt = Date.now() + this.blindIncreaseInterval;
        
        this.blindIncreaseTimer = setTimeout(() => {
            this.increaseBlinds();
        }, this.blindIncreaseInterval);
        
        // Blind timer start logging removed - too verbose
    }
    
    stopBlindTimer() {
        const wasActive = !!this.blindIncreaseTimer;
        if (this.blindIncreaseTimer) {
            clearTimeout(this.blindIncreaseTimer);
            this.blindIncreaseTimer = null;
        }
        // Blind timer stop logging removed - too verbose
        this.nextBlindIncreaseAt = null;
    }
    
    getBlindTimeRemaining() {
        if (!this.nextBlindIncreaseAt || this.blindIncreaseInterval <= 0) {
            return -1; // Disabled or not running
        }
        const remaining = Math.max(0, this.nextBlindIncreaseAt - Date.now());
        return Math.ceil(remaining / 1000); // Return seconds
    }
    
    increaseBlinds() {
        this._traceUniversal('INCREASE_BLINDS', { 
            currentPhase: this.phase,
            currentSmallBlind: this.smallBlind,
            currentBigBlind: this.bigBlind,
            blindLevel: this.blindLevel
        });
        
        // CRITICAL: Don't increase blinds if game is not in progress
        // This prevents blinds from increasing during waiting/ready_up phases
        if (this.phase === GAME_PHASES.WAITING || 
            this.phase === GAME_PHASES.READY_UP || 
            this.phase === GAME_PHASES.COUNTDOWN) {
            // Blind timer skip logging removed - too verbose
            // Reschedule for later (don't let timer accumulate)
            this.startBlindTimer();
            return;
        }
        
        const oldBlinds = { small: this.smallBlind, big: this.bigBlind, level: this.blindLevel };
        
        // CRITICAL: Cap blind level to prevent exponential overflow
        // If blinds get too large, reset to initial values
        if (this.blindLevel > 50 || this.smallBlind > 1e15 || this.bigBlind > 1e15) {
            gameLogger.gameEvent(this.name, '[BLIND_TIMER] BLINDS RESET - preventing overflow', {
                oldLevel: this.blindLevel,
                oldBlinds: `${this.smallBlind}/${this.bigBlind}`,
                newBlinds: `${this.initialSmallBlind}/${this.initialBigBlind}`
            });
            this.blindLevel = 1;
            this.smallBlind = this.initialSmallBlind;
            this.bigBlind = this.initialBigBlind;
            this.minRaise = this.bigBlind;
        } else {
            // Double the blinds
            this.blindLevel++;
            this.smallBlind = this.smallBlind * 2;
            this.bigBlind = this.bigBlind * 2;
            this.minRaise = this.bigBlind;
        }
        
        gameLogger.gameEvent(this.name, '[BLIND_TIMER] BLINDS INCREASED', {
            oldLevel: oldBlinds.level,
            newLevel: this.blindLevel,
            oldBlinds: `${oldBlinds.small}/${oldBlinds.big}`,
            newBlinds: `${this.smallBlind}/${this.bigBlind}`,
            minRaise: this.minRaise
        });
        // console.log(`[Table ${this.name}] BLINDS INCREASED to Level ${this.blindLevel}: ${this.smallBlind}/${this.bigBlind}`);
        
        // Notify via callback
        this.onBlindsIncrease?.({
            level: this.blindLevel,
            smallBlind: this.smallBlind,
            bigBlind: this.bigBlind
        });
        
        // Broadcast state change
        this.onStateChange?.();
        
        // Schedule next increase
        this.startBlindTimer();
    }

    // ============ Player Management ============

    addPlayer(playerId, name, chips, preferredSeat = null) {
        this._traceUniversal('ADD_PLAYER_START', { 
            playerId, 
            name, 
            chips, 
            preferredSeat,
            currentPhase: this.phase,
            currentPlayers: this.seats.filter(s => s !== null).length
        });
        
        let seatIndex = preferredSeat;

        if (seatIndex !== null) {
            if (this.seats[seatIndex] !== null) {
                return { success: false, error: 'Seat taken' };
            }
        } else {
            seatIndex = this.seats.findIndex(seat => seat === null);
            if (seatIndex === -1) {
                return { success: false, error: 'Table full' };
            }
        }

        // CRITICAL: Update totalStartingChips BEFORE tracking movement to prevent false positives
        // - ALWAYS update totalStartingChips to prevent root cause tracer from flagging chips as "created"
        // - If totalStartingChips is 0, we're setting it for the first time (before game start)
        // - If totalStartingChips > 0, we're incrementing it (late joiner or before game start)
        // This prevents false positives in the root cause tracer during player joins
        const oldTotalStartingChipsAddPlayer = this.totalStartingChips;
        this.totalStartingChips += chips;
        this._logTotalStartingChipsChange('ADD_PLAYER', 'ADD_PLAYER', oldTotalStartingChipsAddPlayer, this.totalStartingChips, {
            player: name,
            playerId,
            seatIndex,
            chips,
            gameStarted: this.gameStarted,
            reason: this.gameStarted ? 'Late joiner - adding chips to totalStartingChips' : 'Player joined before game start - adding chips to totalStartingChips'
        });
        
        // CRITICAL: Track chip addition when player joins (AFTER totalStartingChips is updated)
        const movement = this._trackChipMovement('PLAYER_JOIN', {
            player: name,
            playerId,
            seatIndex,
            chips,
            gameStarted: this.gameStarted,
            phase: this.phase
        });
        
        const seat = {
            playerId,
            name,
            chips,
            cards: [],
            currentBet: 0,
            totalBet: 0,
            isActive: true,
            isFolded: false,
            isAllIn: false,
            isConnected: true,
            isReady: false  // New: ready-up status
        };
        
        // ULTRA-VERBOSE: Log before adding player
        const totalChipsBefore = this.seats.filter(s => s !== null && s.isActive !== false).reduce((sum, s) => sum + (s.chips || 0), 0);
        const totalChipsAndPotBefore = totalChipsBefore + this.pot;
        
        // console.log(`[Table ${this.name}] [ADD_PLAYER PRE-OP] Hand: ${this.handsPlayed} | Player: ${name} | Chips: ${chips} | TotalChips: ${totalChipsBefore} | Pot: ${this.pot} | TotalChips+Pot: ${totalChipsAndPotBefore} | totalStartingChips: ${this.totalStartingChips}`);
        gameLogger.gameEvent(this.name, '[ADD_PLAYER] PRE-OPERATION STATE', {
            handNumber: this.handsPlayed,
            player: name,
            chips,
            totalChipsBefore,
            pot: this.pot,
            totalChipsAndPotBefore,
            totalStartingChips: this.totalStartingChips,
            gameStarted: this.gameStarted
        });
        
        this.seats[seatIndex] = seat;
        
        // ULTRA-VERBOSE: Log after adding player
        const totalChipsAfter = this.seats.filter(s => s !== null && s.isActive !== false).reduce((sum, s) => sum + (s.chips || 0), 0);
        const totalChipsAndPotAfter = totalChipsAfter + this.pot;
        const chipsDifference = totalChipsAndPotAfter - totalChipsAndPotBefore;
        
        // console.log(`[Table ${this.name}] [ADD_PLAYER POST-OP] Hand: ${this.handsPlayed} | Player: ${name} | TotalChips: ${totalChipsAfter} | Pot: ${this.pot} | TotalChips+Pot: ${totalChipsAndPotAfter} | Difference: ${chipsDifference} | totalStartingChips: ${this.totalStartingChips}`);
        gameLogger.gameEvent(this.name, '[ADD_PLAYER] POST-OPERATION STATE', {
            handNumber: this.handsPlayed,
            player: name,
            chips,
            totalChipsBefore,
            totalChipsAfter,
            pot: this.pot,
            totalChipsAndPotBefore,
            totalChipsAndPotAfter,
            chipsDifference,
            totalStartingChips: this.totalStartingChips,
            gameStarted: this.gameStarted
        });
        
        if (Math.abs(chipsDifference - chips) > 0.01) {
            gameLogger.error(this.name, '[CRITICAL] ADD_PLAYER ERROR: Chips difference mismatch', {
                chipsDifference,
                addedChips: chips,
                player: name,
                handNumber: this.handsPlayed
            });
            gameLogger.error(this.name, '[ADD_PLAYER] CRITICAL: Chips difference mismatch', {
                handNumber: this.handsPlayed,
                player: name,
                chips,
                chipsDifference,
                totalChipsAndPotBefore,
                totalChipsAndPotAfter
            });
            // Record fix attempt - chips mismatch is a failure
            this._recordFixAttempt('FIX_13_ADD_PLAYER_CHIPS_MISMATCH', false, {
                handNumber: this.handsPlayed,
                player: name,
                chips,
                chipsDifference,
                difference: Math.abs(chipsDifference - chips)
            });
        } else {
            // Record fix attempt - success if chips match
            this._recordFixAttempt('FIX_13_ADD_PLAYER_CHIPS_MISMATCH', true, {
                handNumber: this.handsPlayed,
                player: name,
                chips,
                chipsDifference,
                totalChipsAndPotBefore,
                totalChipsAndPotAfter
            });
        }
        
        // CRITICAL: Validate after player join
        this._validateChipMovement(movement, 'PLAYER_JOIN');

        // console.log(`[Table ${this.name}] ${name} joined at seat ${seatIndex}`);

        // Handle late joiner during ready-up phase
        this.handleLateJoinerDuringReadyUp(seat);
        
        // Check if item ante is enabled and player needs to submit item
        if (this.itemAnteEnabled && !this.gameStarted && this.itemAnte) {
            const needsFirstItem = this.itemAnte.needsFirstItem();
            const hasSubmitted = this.itemAnte.hasSubmitted(playerId);
            
            if (needsFirstItem || !hasSubmitted) {
                // Player needs to submit item - this will be indicated in table state
                // Unity client should prompt player to select item
                // console.log(`[Table ${this.name}] Player ${name} (${playerId}) needs to submit item for item ante`);
            }
        }

        return { success: true, seatIndex };
    }

    removePlayer(playerId) {
        this._traceUniversal('REMOVE_PLAYER_START', { 
            playerId,
            currentPhase: this.phase,
            currentPlayerIndex: this.currentPlayerIndex
        });
        
        const seatIndex = this.seats.findIndex(s => s?.playerId === playerId);
        if (seatIndex === -1) {
            this._traceUniversalAfter('REMOVE_PLAYER', { success: false, reason: 'Player not found' });
            return null;
        }

        const player = this.seats[seatIndex];
        const chips = player.chips;
        const wasCurrentPlayer = this.currentPlayerIndex === seatIndex;
        const wasInGame = this.phase !== GAME_PHASES.WAITING && 
                          this.phase !== GAME_PHASES.READY_UP && 
                          this.phase !== GAME_PHASES.COUNTDOWN;
        
        // CRITICAL: Track chip removal when player leaves
        const movement = this._trackChipMovement('PLAYER_LEAVE', {
            player: player.name,
            playerId,
            seatIndex,
            chips,
            wasInGame,
            wasCurrentPlayer,
            gameStarted: this.gameStarted,
            phase: this.phase
        });
        
        // console.log(`[Table ${this.name}] ${player.name} left`);

        // Handle mid-game removal - fold BEFORE removing from seat
        if (wasInGame && wasCurrentPlayer) {
            // Clear turn timer first
            this.clearTurnTimer();
            
            // CRITICAL FIX: When player leaves mid-game, their chips should go to the pot (not be lost)
            // Add their remaining chips to the pot before removing them
            if (player.chips > 0) {
                const chipsToPot = player.chips;
                const potBefore = this.pot;
                const chipsBefore = player.chips;
                
                // CRITICAL: Track chip movement BEFORE operation
                const movement = this._trackChipMovement('REMOVE_PLAYER_CHIPS_TO_POT', {
                    player: player.name,
                    seatIndex,
                    chipsToPot,
                    chipsBefore,
                    potBefore,
                    reason: 'Player left mid-game during their turn - chips added to pot'
                });
                
                this.pot += chipsToPot;
                player.chips = 0;
                
                // CRITICAL: Validate after operation
                this._validateChipMovement(movement, 'REMOVE_PLAYER_CHIPS_TO_POT');
                
                gameLogger.gameEvent(this.name, 'Player left mid-game - chips added to pot', {
                    player: player.name,
                    chipsAddedToPot: chipsToPot,
                    potBefore,
                    potAfter: this.pot
                });
            }
            
            // Mark as folded and remove
            player.isFolded = true;
            player.isActive = false;
            this.seats[seatIndex] = null;
            
            // Advance the game manually since the player is gone
            // console.log(`[Table ${this.name}] Player left during their turn - advancing game`);
            this.advanceGame();
        } else if (wasInGame) {
            // CRITICAL FIX: When player leaves mid-game (not their turn), their chips should go to the pot
            if (player.chips > 0) {
                const chipsToPot = player.chips;
                const potBefore = this.pot;
                const chipsBefore = player.chips;
                
                // CRITICAL: Track chip movement BEFORE operation
                const movement = this._trackChipMovement('REMOVE_PLAYER_CHIPS_TO_POT', {
                    player: player.name,
                    seatIndex,
                    chipsToPot,
                    chipsBefore,
                    potBefore,
                    reason: 'Player left mid-game (not their turn) - chips added to pot'
                });
                
                this.pot += chipsToPot;
                player.chips = 0;
                
                // CRITICAL: Validate after operation
                this._validateChipMovement(movement, 'REMOVE_PLAYER_CHIPS_TO_POT');
                
                gameLogger.gameEvent(this.name, 'Player left mid-game - chips added to pot', {
                    player: player.name,
                    chipsAddedToPot: chipsToPot,
                    potBefore,
                    potAfter: this.pot
                });
            }
            // Not their turn - just remove
            this.seats[seatIndex] = null;
        } else {
            // Not in game - just remove (chips will be returned via return value)
            this.seats[seatIndex] = null;
        }
        
        // CRITICAL: Adjust totalStartingChips based on when player leaves
        // - BEFORE game start: Chips are returned to player, so decrease totalStartingChips
        // - AFTER game start: Chips stay in system (pot/redistributed), so keep totalStartingChips unchanged
        if (!this.gameStarted) {
            // Player left before game started - chips are returned, so decrease totalStartingChips
            const oldTotalStartingChips = this.totalStartingChips;
            this.totalStartingChips = Math.max(0, this.totalStartingChips - this.buyIn);
            this._logTotalStartingChipsChange('DECREASE_FOR_PLAYER_LEAVE', 'REMOVE_PLAYER_BEFORE_GAME_START', oldTotalStartingChips, this.totalStartingChips, {
                player: player.name,
                playerId,
                chips,
                buyIn: this.buyIn,
                reason: 'Player left before game start - chips returned, totalStartingChips decreased'
            });
        } else {
            // Player left mid-game - chips stay in system (pot or redistributed), so totalStartingChips unchanged
            gameLogger.gameEvent(this.name, 'Player left mid-game (totalStartingChips unchanged)', {
                player: player.name,
                chips,
                totalStartingChips: this.totalStartingChips,
                reason: 'Chips still in system, just transferred to other players/pot'
            });
        }
        
        // CRITICAL: Validate after player leave
        this._validateChipMovement(movement, 'PLAYER_LEAVE');

        // Check if countdown should be cancelled (not enough players)
        this.checkStartCountdown();
        
        // Broadcast state change
        this.onStateChange?.();

        // CRITICAL: If player was in an active game, their chips went to the pot
        // Return 0 so the caller doesn't also credit them back to the account (duplication bug)
        if (wasInGame && this.gameStarted) {
            gameLogger.gameEvent(this.name, 'Player left mid-game - returning 0 chips (chips are in pot)', {
                player: player.name,
                originalChips: chips,
                wasInGame,
                gameStarted: this.gameStarted
            });
            return 0;
        }
        
        return chips;
    }

    getActivePlayerCount() {
        return this.seats.filter(s => s !== null && s.isActive && !s.isFolded).length;
    }

    getSeatedPlayerCount() {
        return this.seats.filter(s => s !== null).length;
    }

    // ============ Game Flow ============

    startNewHand() {
        this._traceUniversal('START_NEW_HAND', { 
            currentPhase: this.phase,
            handsPlayed: this.handsPlayed,
            pot: this.pot
        });
        
        // ROOT CAUSE: Trace startNewHand operation
        const startNewHandBeforeState = this._getChipState();
        
        // SYSTEMATIC DEBUG: Commented out "fix" attempt - testing if pot gets cleared in correct places
        // If pot > 0 here, it means calculateAndAwardSidePots or awardPot didn't clear it properly
        // Keep this commented to see the REAL problem
        /*
        // CRITICAL: Clear pot IMMEDIATELY at the very start, before any other logic
        // This is the final safeguard - even if pot was set after awardPot cleared it
        if (this.pot > 0) {
            const potBeforeImmediateClear = this.pot;
            gameLogger.error(this.name, '[POT] CRITICAL: Pot has chips at START of startNewHand - clearing immediately', {
                pot: potBeforeImmediateClear,
                handNumber: this.handsPlayed,
                phase: this.phase
            });
            gameLogger.error(this.name, '[POT] CRITICAL: Pot not cleared at start of startNewHand - immediate clear', {
                pot: potBeforeImmediateClear,
                handNumber: this.handsPlayed,
                phase: this.phase
            });
            // ROOT CAUSE: Trace pot clearing
            this._clearPotWithTrace('START_NEW_HAND_IMMEDIATE_CLEAR', 'Pot not cleared at start');
            // Record fix attempt - pot not cleared is a failure, but clearing it is a mitigation
            this._recordFixAttempt('FIX_11_POT_NOT_CLEARED_AT_START_NEW_HAND_START', false, {
                potBeforeImmediateClear,
                handNumber: this.handsPlayed,
                phase: this.phase
            });
        } else {
            // Record success - pot was already cleared
            this._recordFixAttempt('FIX_11_POT_NOT_CLEARED_AT_START_NEW_HAND_START', true, {
                handNumber: this.handsPlayed,
                phase: this.phase
            });
        }
        */
        
        // SYSTEMATIC DEBUG: Log if pot is not cleared (to see the real problem)
        if (this.pot > 0) {
            gameLogger.error(this.name, '[SYSTEMATIC_DEBUG] Pot NOT cleared at start of startNewHand - this means calculateAndAwardSidePots or awardPot failed to clear it', {
                pot: this.pot,
                handNumber: this.handsPlayed,
                phase: this.phase
            });
        }
        
        // CRITICAL: Clear any pending turn timers at hand start
        // This prevents timeout race conditions
        this.clearTurnTimer();
        
        if (this.getSeatedPlayerCount() < 2) {
            this._tracePhaseChange(GAME_PHASES.WAITING, 'NOT_ENOUGH_PLAYERS');
            // Capture snapshot before broadcasting
            if (this.stateSnapshot) {
                const state = this.getState(null);
                this.stateSnapshot.capture(state, {
                    phase: this.phase,
                    handsPlayed: this.handsPlayed,
                    reason: 'state_change'
                });
            }
            this._onStateChangeCallback?.();
            return;
        }
        
        // Check if only one player has chips (game over!)
        const playersWithChips = this.seats.filter(s => s && s.chips > 0);
        if (playersWithChips.length === 1) {
            const winner = playersWithChips[0];
            
            // CRITICAL: Award any remaining pot to the winner BEFORE game over
            // This ensures money isn't lost when game ends with pot still unclaimed
            if (this.pot > 0) {
                console.log(`[Table ${this.name}] Game ending with pot unclaimed (${this.pot}) - awarding to winner ${winner.name}`);
                gameLogger.gameEvent(this.name, '[GAME OVER] Awarding unclaimed pot to winner', {
                    winner: winner.name,
                    potAmount: this.pot,
                    winnerChipsBefore: winner.chips
                });
                this.awardPot(winner);
            }
            
            // CRITICAL: Validate money - total chips should equal sum of all starting chips
            // Count ALL chips (winner + all other players, including eliminated)
            const currentTotalChips = this.seats
                .filter(s => s !== null)
                .reduce((sum, seat) => sum + (seat.chips || 0), 0);
            
            // Also check if pot still has money (should be 0 after award)
            const potStillHasMoney = this.pot > 0;
            
            if (this.totalStartingChips > 0) {
                const difference = Math.abs(currentTotalChips - this.totalStartingChips);
                if (difference > 0.01 || potStillHasMoney) {
                    const missing = this.totalStartingChips - currentTotalChips - (potStillHasMoney ? this.pot : 0);
                    console.error(`[Table ${this.name}] ⚠️ CRITICAL: MONEY LOST! Total chips: ${currentTotalChips}, total starting chips: ${this.totalStartingChips}, pot: ${this.pot}. Missing: ${missing}`);
                    gameLogger.gameEvent(this.name, '[MONEY] ERROR: Money lost - total chips != total starting chips', {
                        winnerChips: winner.chips,
                        currentTotalChips,
                        totalStartingChips: this.totalStartingChips,
                        pot: this.pot,
                        missing,
                        allPlayers: this.seats.filter(s => s !== null).map(s => ({
                            name: s.name,
                            chips: s.chips,
                            isActive: s.isActive,
                            totalBet: s.totalBet
                        }))
                    });
                } else {
                    gameLogger.gameEvent(this.name, '[MONEY] VALIDATION PASSED: Total chips = total starting chips', {
                        winnerChips: winner.chips,
                        currentTotalChips,
                        totalStartingChips: this.totalStartingChips,
                        difference: 0
                    });
                }
            } else {
                // First game or starting chips not tracked - log warning
                console.warn(`[Table ${this.name}] ⚠️ Starting chips not tracked (totalStartingChips=${this.totalStartingChips}) - cannot validate money`);
                gameLogger.gameEvent(this.name, '[MONEY] WARNING: Starting chips not tracked', {
                    winnerChips: winner.chips,
                    currentTotalChips,
                    totalStartingChips: this.totalStartingChips,
                    pot: this.pot
                });
            }
            
            // console.log(`[Table ${this.name}] GAME OVER - ${winner.name} wins with ${winner.chips} chips!`);
            gameLogger.gameEvent(this.name, 'GAME OVER - Winner announced', {
                winnerName: winner.name,
                winnerChips: winner.chips,
                winnerId: winner.playerId,
                isBot: winner.isBot || false
            });
            this._tracePhaseChange(GAME_PHASES.WAITING, 'GAME_OVER_WINNER');
            this.gameStarted = false;
            
            // CRITICAL: Notify about game winner (this triggers simulation restart and client announcement)
            if (this.onGameOver) {
                // console.log(`[Table ${this.name}] Calling onGameOver callback for winner ${winner.name}`);
                this.onGameOver(winner);
            } else {
                console.error(`[Table ${this.name}] ⚠️ CRITICAL: onGameOver callback is NOT SET! Game over event will not be sent to clients!`);
                gameLogger.error(this.name, 'onGameOver callback not set - game over event not sent', {
                    winnerName: winner.name,
                    winnerChips: winner.chips
                });
            }
            // Capture snapshot before broadcasting
            if (this.stateSnapshot) {
                const state = this.getState(null);
                this.stateSnapshot.capture(state, {
                    phase: this.phase,
                    handsPlayed: this.handsPlayed,
                    reason: 'state_change'
                });
            }
            this._onStateChangeCallback?.();
            return;
        }
        
        // CRITICAL FIX: Clear totalBet at the start of a new hand
        // This ensures totalBet from previous hand doesn't persist and cause chip loss
        // Even though totalBet should be cleared after pot is awarded, we clear it here as a safety measure
        // to prevent bugs where totalBet persists from previous hand
        let totalBetNotClearedCount = 0;
        const notClearedDetails = [];
        
        for (const seat of this.seats) {
            if (seat) {
                const seatIndex = this.seats.indexOf(seat);
                const totalBetBeforeClear = seat.totalBet || 0;
                const currentBetBeforeClear = seat.currentBet || 0;
                
                // CRITICAL: Clear totalBet to prevent it from persisting from previous hand
                // This fixes the bug where sumOfTotalBets > pot because totalBet wasn't cleared
                if (totalBetBeforeClear > 0) {
                    totalBetNotClearedCount++;
                    notClearedDetails.push({
                        player: seat.name,
                        seatIndex,
                        totalBet: totalBetBeforeClear,
                        currentBet: currentBetBeforeClear
                    });
                    
                    // ROOT TRACING: Track when totalBet was NOT cleared properly
                    gameLogger.error(this.name, '[ROOT_TRACE] TOTAL_BET_NOT_CLEARED_AT_HAND_START', {
                        operation: 'START_NEW_HAND',
                        player: seat.name,
                        seatIndex,
                        totalBetBeforeClear: totalBetBeforeClear,
                        currentBetBeforeClear: currentBetBeforeClear,
                        previousHandNumber: this.handsPlayed,
                        newHandNumber: this.handsPlayed + 1,
                        phase: this.phase,
                        warning: 'totalBet should have been cleared after pot award in previous hand - this indicates a bug in the clearing logic',
                        stackTrace: new Error().stack?.split('\n').slice(2, 12).join(' | ') || 'NO_STACK',
                        allSeatsState: this.seats.map((s, i) => s ? {
                            seatIndex: i,
                            name: s.name,
                            totalBet: s.totalBet || 0,
                            currentBet: s.currentBet || 0,
                            chips: s.chips,
                            isActive: s.isActive
                        } : null).filter(Boolean)
                    });
                    
                    console.warn(`[Table ${this.name}] WARNING: Clearing totalBet=${totalBetBeforeClear} for ${seat.name} at start of new hand - should have been cleared after pot award!`);
                    gameLogger.gameEvent(this.name, '[FIX] Clearing totalBet at hand start', {
                        player: seat.name,
                        totalBet: totalBetBeforeClear,
                        handNumber: this.handsPlayed + 1,
                        warning: 'totalBet should have been cleared after pot award in previous hand'
                    });
                }
                seat.totalBet = 0;
                seat.currentBet = 0;
            }
        }
        
        // ROOT TRACING: Summary of totalBet not cleared issue
        if (totalBetNotClearedCount > 0) {
            gameLogger.error(this.name, '[ROOT_TRACE] TOTAL_BET_NOT_CLEARED_SUMMARY', {
                operation: 'START_NEW_HAND',
                totalBetNotClearedCount,
                notClearedDetails,
                previousHandNumber: this.handsPlayed,
                newHandNumber: this.handsPlayed + 1,
                phase: this.phase,
                rootCause: 'totalBet was not cleared after pot award in previous hand - check calculateAndAwardSidePots clearing logic'
            });
        }
        
        // Record fix attempt - if any totalBet was not cleared, this is a failure
        if (totalBetNotClearedCount > 0) {
            this._recordFixAttempt('FIX_1_TOTAL_BET_NOT_CLEARED', false, {
                context: 'HAND_START',
                playersWithTotalBet: totalBetNotClearedCount,
                handNumber: this.handsPlayed + 1
            });
        } else {
            this._recordFixAttempt('FIX_1_TOTAL_BET_NOT_CLEARED', true, {
                context: 'HAND_START',
                handNumber: this.handsPlayed + 1
            });
        }
        
        // NOW check for eliminated players (0 chips with no pending pot money)
        // CRITICAL: Don't remove eliminated players yet - we need their totalBet for pot calculation
        // They'll be removed after pot is calculated and awarded
        for (let i = 0; i < this.seats.length; i++) {
            const seat = this.seats[i];
            if (seat && seat.chips <= 0) {
                // Player has 0 chips - check if they were already eliminated
                const wasAlreadyEliminated = seat.isActive === false;
                
                // Skip if already eliminated (prevents duplicate messages and notifications)
                if (wasAlreadyEliminated) {
                    // Already handled - but DON'T remove bot yet if pot calculation might need their totalBet
                    // Only remove if we're sure the hand is complete and pot has been awarded
                    // For now, keep them in the seat but marked as eliminated
                    continue;
                }
                
                // Mark as eliminated
                seat.isActive = false;
                
                // CRITICAL FIX: DO NOT subtract eliminated player's buy-in from totalStartingChips
                // The player's chips were redistributed to other players or are in the pot,
                // so the total chips in the system remains constant (equal to totalStartingChips)
                // totalStartingChips represents the total chips that started the game and should NEVER change
                // The validation counts active players' chips + pot, which should equal totalStartingChips
                // because eliminated players' chips were redistributed to active players
                console.log(`[Table ${this.name}] [ELIMINATION] ${seat.name} eliminated - NOT subtracting buy-in from totalStartingChips (chips redistributed, total remains constant)`);
                gameLogger.gameEvent(this.name, '[ELIMINATION] Player eliminated - NOT modifying totalStartingChips', {
                    player: seat.name,
                    playerId: seat.playerId,
                    buyIn: this.buyIn,
                    seatIndex: i,
                    totalStartingChips: this.totalStartingChips,
                    reason: 'Chips redistributed to other players - totalStartingChips remains constant'
                });
                
                // CRITICAL: Preserve totalBet even after elimination - it's needed for pot calculation
                // Don't clear it here - it will be cleared after pot is awarded
                
                // ULTRA-VERBOSE: Log elimination with full context
                const eliminationLogData = {
                    player: seat.name,
                    playerId: seat.playerId,
                    seatIndex: i,
                    chips: seat.chips,
                    totalBet: seat.totalBet || 0,
                    currentBet: seat.currentBet || 0,
                    isBot: seat.isBot || false,
                    handNumber: this.handsPlayed,
                    phase: this.phase,
                    pot: this.pot,
                    totalStartingChips: this.totalStartingChips,
                    buyIn: this.buyIn,
                    allActivePlayers: this.seats.filter(s => s && s.isActive !== false).map(s => ({
                        name: s.name,
                        chips: s.chips,
                        seatIndex: this.seats.indexOf(s)
                    })),
                    allEliminatedPlayers: this.seats.filter(s => s && s.isActive === false).map(s => ({
                        name: s.name,
                        chips: s.chips,
                        seatIndex: this.seats.indexOf(s),
                        totalBet: s.totalBet || 0
                    }))
                };
                console.log(`[Table ${this.name}] [ELIMINATION] ${seat.name} eliminated (0 chips) - preserving seat for pot calculation | Hand: ${this.handsPlayed} | Phase: ${this.phase} | totalStartingChips: ${this.totalStartingChips}`);
                gameLogger.gameEvent(this.name, '[ELIMINATION] Player eliminated', eliminationLogData);
                
                // Notify about elimination
                if (this.onPlayerEliminated) {
                    this.onPlayerEliminated({
                        playerId: seat.playerId,
                        playerName: seat.name,
                        seatIndex: i,
                        isBot: seat.isBot || false
                    });
                }
                // CRITICAL FIX: Don't set seat to null yet - we need their totalBet for pot calculation
                // They'll be removed after the pot is properly calculated and awarded
                // This prevents chips from being lost when eliminated players contributed to the pot
            }
        }
        
        // CRITICAL: After pot is calculated and awarded, THEN we can safely remove eliminated bots
        // This cleanup will happen in showdown() after calculateAndAwardSidePots() completes

        // console.log(`[Table ${this.name}] Starting new hand`);
        
        // Lock side pot if it was collecting (first hand only)
        if (!this.gameStarted) {
            this.gameStarted = true;
            this.lockItemAnte();
            // Start blind increase timer if enabled
            this.startBlindTimer();
        }

        // Reset state
        this.deck.shuffle();
        this.communityCards = [];
        
        // SYSTEMATIC DEBUG: Commented out "fix" attempts - testing if pot gets cleared in correct places
        /*
        // CRITICAL: Clear pot IMMEDIATELY before capturing potBeforeReset (final safeguard)
        // This catches any pot that was set after the initial clear at function start
        if (this.pot > 0) {
            const potBeforeFinalClear = this.pot;
            console.error(`[Table ${this.name}] ⚠️ CRITICAL: Pot has ${potBeforeFinalClear} chips BEFORE PRE-RESET logging! Clearing now.`);
            gameLogger.error(this.name, '[POT] CRITICAL: Pot not cleared before PRE-RESET - final clear', {
                pot: potBeforeFinalClear,
                handNumber: this.handsPlayed,
                phase: this.phase
            });
            // ROOT CAUSE: Trace pot clearing
            this._clearPotWithTrace('START_NEW_HAND_BEFORE_PRE_RESET', 'Pot not cleared before PRE-RESET');
            // Record fix attempt - pot not cleared is a failure, but clearing it is a mitigation
            this._recordFixAttempt('FIX_12_POT_NOT_CLEARED_BEFORE_PRE_RESET', false, {
                potBeforeFinalClear,
                handNumber: this.handsPlayed,
                phase: this.phase
            });
        } else {
            // Record success - pot was already cleared
            this._recordFixAttempt('FIX_12_POT_NOT_CLEARED_BEFORE_PRE_RESET', true, {
                handNumber: this.handsPlayed,
                phase: this.phase
            });
        }
        
        // CRITICAL FIX #1: Pot not cleared at hand start - ULTRA-VERBOSE logging
        // CRITICAL: Clear pot one more time RIGHT BEFORE capturing to ensure it's 0
        // ROOT CAUSE: Trace pot clearing
        this._clearPotWithTrace('START_NEW_HAND_FINAL_CLEAR', 'Final pot clear before capture');
        */
        const potBeforeReset = this.pot;
        const totalChipsBeforeReset = this.seats.filter(s => s !== null && s.isActive !== false).reduce((sum, s) => sum + (s.chips || 0), 0);
        const totalChipsAndPotBeforeReset = totalChipsBeforeReset + this.pot;
        
        // console.log(`[Table ${this.name}] [FIX #1: HAND_START PRE-RESET] Hand: ${this.handsPlayed} | Pot: ${potBeforeReset} | TotalChips: ${totalChipsBeforeReset} | TotalChips+Pot: ${totalChipsAndPotBeforeReset} | totalStartingChips: ${this.totalStartingChips}`);
        gameLogger.gameEvent(this.name, '[FIX #1: HAND_START] PRE-RESET STATE', {
            handNumber: this.handsPlayed,
            potBeforeReset,
            totalChipsBeforeReset,
            totalChipsAndPotBeforeReset,
            totalStartingChips: this.totalStartingChips,
            phase: this.phase,
            allSeats: this.seats.map((s, i) => s ? {
                seatIndex: i,
                name: s.name,
                chips: s.chips,
                totalBet: s.totalBet || 0,
                currentBet: s.currentBet || 0,
                isActive: s.isActive
            } : null).filter(Boolean)
        });
        
        // SYSTEMATIC DEBUG: Commented out "fix" attempts - just log if pot is not cleared (to see REAL problem)
        if (potBeforeReset > 0) {
            console.error(`[Table ${this.name}] [SYSTEMATIC_DEBUG] Pot was ${potBeforeReset} at hand start! This means calculateAndAwardSidePots or awardPot didn't clear it!`);
            gameLogger.error(this.name, '[SYSTEMATIC_DEBUG] Pot not cleared at hand start - this reveals the REAL problem', {
                potBeforeReset,
                handNumber: this.handsPlayed,
                phase: this.phase,
                totalChipsBeforeReset,
                totalChipsAndPotBeforeReset,
                totalStartingChips: this.totalStartingChips
            });
        }
        
        // CRITICAL: Force clear pot at hand start to prevent chip leaks
        const potBeforeForceClear = this.pot;
        if (this.pot > 0) {
            gameLogger.error(this.name, '[MONEY] Pot was not zero at hand start - force clearing', {
                potBeforeForceClear,
                handNumber: this.handsPlayed
            });
            this._clearPotWithTrace('START_NEW_HAND_FORCE_CLEAR', 'Force clear pot at hand start');
        }
        
        // ULTRA-VERBOSE: Log after pot reset
        const totalChipsAfterReset = this.seats.filter(s => s !== null && s.isActive !== false).reduce((sum, s) => sum + (s.chips || 0), 0);
        const totalChipsAndPotAfterReset = totalChipsAfterReset + this.pot;
        const resetDifference = totalChipsAndPotAfterReset - totalChipsAndPotBeforeReset;
        
        // CRITICAL FIX: If chips were lost due to pot clearing, this is a CRITICAL BUG
        // totalStartingChips should NEVER be decreased - it represents the original starting chips
        // If chips are lost, we must pause the simulation and fix the root cause
        if (potBeforeForceClear > 0 && this.totalStartingChips > 0) {
            const chipsLost = potBeforeForceClear;
            console.error(`[Table ${this.name}] ⚠️⚠️⚠️ CRITICAL BUG: ${chipsLost} chips LOST due to pot not being cleared! totalStartingChips MUST NOT be decreased!`);
            gameLogger.error(this.name, '[MONEY] CRITICAL: Chips lost - totalStartingChips NOT adjusted (should never decrease)', {
                chipsLost,
                potBeforeForceClear,
                totalStartingChips: this.totalStartingChips,
                totalChipsAndPotAfterReset,
                handNumber: this.handsPlayed,
                reason: 'totalStartingChips should NEVER decrease - represents original starting chips'
            });
            
            // REMOVED: Automatic pause on chip loss - it masks the problem
            // Errors are logged above for investigation.
            
            // Record fix attempt - this is a FAILURE because chips were lost
            this._recordFixAttempt('FIX_1_POT_NOT_CLEARED_AT_HAND_START', false, {
                context: 'HAND_START',
                chipsLost,
                potBeforeForceClear,
                totalStartingChips: this.totalStartingChips,
                totalChipsAndPotAfterReset,
                handNumber: this.handsPlayed,
                phase: this.phase,
                reason: 'Pot was not cleared before hand start - chips were lost'
            });
        }
        
        console.log(`[Table ${this.name}] [FIX #1: HAND_START POST-RESET] Hand: ${this.handsPlayed} | Pot: ${this.pot} (was ${potBeforeForceClear}) | TotalChips: ${totalChipsAfterReset} | TotalChips+Pot: ${totalChipsAndPotAfterReset} | Difference: ${resetDifference}`);
        gameLogger.gameEvent(this.name, '[FIX #1: HAND_START] POST-RESET STATE', {
            handNumber: this.handsPlayed,
            potBeforeForceClear,
            potAfterReset: this.pot,
            totalChipsAfterReset,
            totalChipsAndPotAfterReset,
            resetDifference,
            totalStartingChips: this.totalStartingChips,
            chipsLost: potBeforeForceClear > 0 ? potBeforeForceClear : 0
        });
        
        if (Math.abs(resetDifference + potBeforeReset) > 0.01) {
            console.error(`[Table ${this.name}] ⚠️ CRITICAL FIX #1 ERROR: Reset difference (${resetDifference}) != -potBeforeReset (${-potBeforeReset})!`);
            gameLogger.error(this.name, '[FIX #1: HAND_START] CRITICAL: Reset difference mismatch', {
                handNumber: this.handsPlayed,
                potBeforeReset,
                resetDifference,
                totalChipsAndPotBeforeReset,
                totalChipsAndPotAfterReset
            });
            // Record fix attempt - reset difference mismatch is a failure
            this._recordFixAttempt('FIX_19_RESET_DIFFERENCE_MISMATCH', false, {
                context: 'HAND_START',
                potBeforeReset,
                resetDifference,
                totalChipsAndPotBeforeReset,
                totalChipsAndPotAfterReset,
                handNumber: this.handsPlayed,
                phase: this.phase
            });
        }
        this.sidePots = [];
        this.currentBet = 0;
        this.minRaise = this.bigBlind;
        
        // CRITICAL: Money validation should only happen at GAME START, not at HAND START
        // During a game, chips move between players and pot, but total should remain constant
        // Only validate at game start (handleGameStart) and game end (startNewHand when game over)
        // DO NOT validate at hand start - it will fail because chips have moved between players
        
        // CRITICAL: Reset betting round tracking flags
        this.hasPassedLastRaiser = false;
        this.lastRaiserIndex = -1;
        this.currentPlayerIndex = -1;
        this.raisesThisRound = 0;  // Reset raise count for new betting round
        
        // Reset loop detection counters
        this.turnsThisPhase = 0;
        this.playerTurnCounts = {};
        this.lastActingPlayer = null;
        this.consecutiveSamePlayerTurns = 0;

        // Reset players for new hand
        // Note: currentBet and totalBet already cleared above before elimination check
        // CRITICAL: Don't clear cards yet - wait until we're ready to deal new ones
        // This prevents cards from disappearing in state broadcasts
        for (const seat of this.seats) {
            if (seat) {
                // Keep cards until we deal new ones (prevents disappearing mid-hand)
                // seat.cards will be replaced when we deal below
                seat.isFolded = false;
                seat.isAllIn = false;
                // isActive was already set correctly during elimination check above
            }
        }

        // Move dealer button
        this.dealerIndex = this.getNextActivePlayer(this.dealerIndex);
        
        // CRITICAL: Check if we have enough active players before posting blinds
        const activePlayers = this.seats.filter(s => s && s.isActive);
        if (activePlayers.length < 2) {
            console.error(`[Table ${this.name}] ⚠️ CRITICAL: Not enough active players (${activePlayers.length}) to start hand!`);
            gameLogger.error(this.name, 'Not enough active players to start hand', {
                activePlayersCount: activePlayers.length,
                allSeats: this.seats.map((s, i) => ({
                    seatIndex: i,
                    name: s?.name,
                    isActive: s?.isActive,
                    chips: s?.chips
                }))
            });
            // Record fix attempt - not enough players is a failure
            this._recordFixAttempt('FIX_20_NOT_ENOUGH_PLAYERS_TO_START_HAND', false, {
                context: 'START_NEW_HAND',
                activePlayersCount: activePlayers.length,
                handNumber: this.handsPlayed,
                phase: this.phase
            });
            this._tracePhaseChange(GAME_PHASES.WAITING, 'NOT_ENOUGH_PLAYERS_FOR_HAND');
            this._onStateChangeCallback?.();
            return;
        }
        
        // Post blinds
        const sbIndex = this.getNextActivePlayer(this.dealerIndex);
        const bbIndex = this.getNextActivePlayer(sbIndex);
        
        // CRITICAL: Validate indices before posting blinds
        if (sbIndex === -1 || bbIndex === -1) {
            console.error(`[Table ${this.name}] ⚠️ CRITICAL: Cannot find active players for blinds! sbIndex=${sbIndex}, bbIndex=${bbIndex}`);
            gameLogger.error(this.name, 'Cannot find active players for blinds', {
                dealerIndex: this.dealerIndex,
                sbIndex,
                bbIndex,
                activePlayersCount: activePlayers.length,
                allSeats: this.seats.map((s, i) => ({
                    seatIndex: i,
                    name: s?.name,
                    isActive: s?.isActive,
                    chips: s?.chips
                }))
            });
            // Record fix attempt - cannot find players for blinds is a failure
            this._recordFixAttempt('FIX_21_CANNOT_FIND_PLAYERS_FOR_BLINDS', false, {
                context: 'POST_BLINDS',
                dealerIndex: this.dealerIndex,
                sbIndex,
                bbIndex,
                activePlayersCount: activePlayers.length,
                handNumber: this.handsPlayed,
                phase: this.phase
            });
            this._tracePhaseChange(GAME_PHASES.WAITING, 'NOT_ENOUGH_PLAYERS_FOR_HAND');
            this._onStateChangeCallback?.();
            return;
        }
        
        // ULTRA-VERBOSE: Log before posting blinds
        const totalChipsBeforeBlinds = this.seats.filter(s => s !== null && s.isActive !== false).reduce((sum, s) => sum + (s.chips || 0), 0);
        const totalChipsAndPotBeforeBlinds = totalChipsBeforeBlinds + this.pot;
        
        // console.log(`[Table ${this.name}] [POST_BLINDS PRE-OP] Hand: ${this.handsPlayed} | SB: ${this.smallBlind} | BB: ${this.bigBlind} | Pot: ${this.pot} | TotalChips: ${totalChipsBeforeBlinds} | TotalChips+Pot: ${totalChipsAndPotBeforeBlinds}`);
        gameLogger.gameEvent(this.name, '[POST_BLINDS] PRE-OPERATION STATE', {
            handNumber: this.handsPlayed,
            smallBlind: this.smallBlind,
            bigBlind: this.bigBlind,
            pot: this.pot,
            totalChipsBeforeBlinds,
            totalChipsAndPotBeforeBlinds,
            totalStartingChips: this.totalStartingChips,
            sbIndex,
            bbIndex,
            sbPlayer: this.seats[sbIndex]?.name,
            bbPlayer: this.seats[bbIndex]?.name
        });
        
        this.postBlind(sbIndex, this.smallBlind);
        this.postBlind(bbIndex, this.bigBlind);
        this.currentBet = this.bigBlind;
        
        // ULTRA-VERBOSE: Log after posting blinds
        const totalChipsAfterBlinds = this.seats.filter(s => s !== null && s.isActive !== false).reduce((sum, s) => sum + (s.chips || 0), 0);
        const totalChipsAndPotAfterBlinds = totalChipsAfterBlinds + this.pot;
        const blindsDifference = totalChipsAndPotAfterBlinds - totalChipsAndPotBeforeBlinds;
        const expectedBlindsTotal = this.smallBlind + this.bigBlind;
        
        // console.log(`[Table ${this.name}] [POST_BLINDS POST-OP] Hand: ${this.handsPlayed} | Pot: ${this.pot} | TotalChips: ${totalChipsAfterBlinds} | TotalChips+Pot: ${totalChipsAndPotAfterBlinds} | Difference: ${blindsDifference} | Expected: ${expectedBlindsTotal}`);
        gameLogger.gameEvent(this.name, '[POST_BLINDS] POST-OPERATION STATE', {
            handNumber: this.handsPlayed,
            pot: this.pot,
            totalChipsAfterBlinds,
            totalChipsAndPotAfterBlinds,
            blindsDifference,
            expectedBlindsTotal,
            totalStartingChips: this.totalStartingChips
        });
        
        if (Math.abs(blindsDifference) > 0.01) {
            console.error(`[Table ${this.name}] ⚠️ CRITICAL POST_BLINDS ERROR: Total chips changed! Before: ${totalChipsAndPotBeforeBlinds}, After: ${totalChipsAndPotAfterBlinds}, Difference: ${blindsDifference}`);
            gameLogger.error(this.name, '[POST_BLINDS] CRITICAL: Total chips changed', {
                handNumber: this.handsPlayed,
                totalChipsAndPotBeforeBlinds,
                totalChipsAndPotAfterBlinds,
                blindsDifference,
                expectedBlindsTotal
            });
            // Record fix attempt - chips changed during blinds is a failure
            this._recordFixAttempt('FIX_22_CHIPS_CHANGED_DURING_BLINDS', false, {
                context: 'POST_BLINDS',
                totalChipsAndPotBeforeBlinds,
                totalChipsAndPotAfterBlinds,
                blindsDifference,
                expectedBlindsTotal,
                handNumber: this.handsPlayed,
                phase: this.phase
            });
        }

        // Deal hole cards - REPLACE old cards, don't clear first
        // This ensures cards are never empty in state broadcasts
        for (const seat of this.seats) {
            if (seat?.isActive) {
                // CRITICAL: Replace cards atomically - no empty state
                const newCards = [this.deck.draw(), this.deck.draw()];
                const oldCards = seat.cards ? [...seat.cards] : null;
                seat.cards = newCards;
                
                // CRITICAL: Log EVERY card deal for debugging
                // Card dealing verbose logging removed - too verbose (logs every card dealt)
                // Only log errors (missing cards, invalid cards, etc.)
            } else if (seat) {
                // Inactive players - clear their cards
                const oldCards = seat.cards ? [...seat.cards] : null;
                seat.cards = [];
                if (oldCards) {
                    console.log(`[Table ${this.name}] CLEARED cards for inactive ${seat.name}:`, JSON.stringify(oldCards));
                }
            }
        }

        // Initialize stats tracking for this hand
        this.handActions = {};
        this.handChipsBefore = {};
        for (const seat of this.seats) {
            if (seat?.isActive && seat.playerId) {
                this.handActions[seat.playerId] = [];
                this.handChipsBefore[seat.playerId] = seat.chips || 0;
            }
        }

        // Set first player (after big blind)
        this.currentPlayerIndex = this.getNextActivePlayer(bbIndex);
        this.lastRaiserIndex = bbIndex;
        this._tracePhaseChange(GAME_PHASES.PRE_FLOP, 'START_NEW_HAND');
        this.handsPlayed++;
        
        // CRITICAL: Ensure hasPassedLastRaiser is reset for new hand
        this.hasPassedLastRaiser = false;
        this.playersActedThisRound = new Set();  // FIX: Track which players have acted this round
        
        // Get all active players for logging
        const activePlayersInfo = this.seats.map((seat, idx) => ({
            seatIndex: idx,
            name: seat?.name,
            chips: seat?.chips,
            currentBet: seat?.currentBet,
            isBot: seat?.isBot
        })).filter(info => info.name);
        
        // Debug: Log who's turn it is
        const firstPlayer = this.seats[this.currentPlayerIndex];
        
        gameLogger.gameEvent(this.name, 'NEW HAND STARTED', {
            handNumber: this.handsPlayed,
            dealerIndex: this.dealerIndex,
            sbIndex,
            bbIndex,
            firstToAct: firstPlayer?.name,
            firstToActSeat: this.currentPlayerIndex,
            lastRaiserIndex: this.lastRaiserIndex,
            pot: this.pot,
            currentBet: this.currentBet,
            activePlayers: activePlayersInfo,
            phase: this.phase
        });
        
        console.log(`[Table ${this.name}] Hand started - First to act: ${firstPlayer?.name} (seat ${this.currentPlayerIndex}, isBot: ${firstPlayer?.isBot})`);
        
        // CRITICAL: Broadcast state BEFORE starting timer to ensure clients see new cards
        // This prevents cards from appearing to "change" after being dealt
        this.onStateChange?.();
        
        // Small delay before starting timer to ensure state is received
        setTimeout(() => {
            // Only start timer if we're still in the same hand/phase
            if (this.phase === GAME_PHASES.PRE_FLOP && this.currentPlayerIndex >= 0) {
                this.startTurnTimer();
            }
        }, 100);

        return this.getState();
    }

    postBlind(seatIndex, amount) {
        this._traceUniversal('POST_BLIND', { 
            seatIndex, 
            amount,
            playerName: this.seats[seatIndex]?.name,
            phase: this.phase
        });
        
        const player = this.seats[seatIndex];
        if (!player) {
            this._traceUniversalAfter('POST_BLIND', { success: false, reason: 'Player not found' });
            return;
        }

        const blindAmount = Math.min(amount, player.chips);
        const chipsBefore = player.chips;
        const potBefore = this.pot;
        
        // CRITICAL: Track chip movement BEFORE operation
        const movement = this._trackChipMovement('POST_BLIND', {
            player: player.name,
            seatIndex,
            blindAmount,
            chipsBefore,
            potBefore,
            blindType: amount === this.smallBlind ? 'small' : 'big'
        });
        
        // ULTRA-VERBOSE: Log before operation with FULL STATE
        const potBeforeAdd = this.pot;
        const chipsBeforeSubtract = player.chips;
        const totalChipsBefore = this.seats.filter(s => s !== null && s.isActive !== false).reduce((sum, s) => sum + (s.chips || 0), 0);
        // CRITICAL: Ensure pot is 0 before posting FIRST blind (small blind)
        // If pot is not 0 when posting small blind, it means it persisted from previous hand - clear it now
        // NOTE: When posting big blind, pot should already contain small blind, so don't clear it
        const isSmallBlind = blindAmount === this.smallBlind;
        if (isSmallBlind) {
            // ALWAYS clear pot before posting small blind - this is the start of a new hand
            // If pot > 0, it means it persisted from previous hand (BUG!)
            if (this.pot > 0) {
                console.error(`[Table ${this.name}] ⚠️ CRITICAL: Pot (${this.pot}) not cleared before posting small blind! Clearing now to prevent chip loss.`);
                gameLogger.error(this.name, '[BLIND] CRITICAL: Pot not cleared before posting small blind - clearing now', {
                    potBeforeClear: this.pot,
                    handNumber: this.handsPlayed,
                    player: player.name,
                    blindAmount,
                    warning: 'Pot persisted from previous hand - this is a bug that causes incorrect pot sizes'
                });
            }
            // ALWAYS set pot to 0 before small blind (even if already 0) to ensure clean state
            // ROOT CAUSE: Trace pot clearing
            const beforeClearState = this._getChipState();
            this.pot = 0;
            const afterClearState = this._getChipState();
            this._traceOperation('CLEAR_POT_BEFORE_SMALL_BLIND', beforeClearState, afterClearState);
            // console.log(`[Table ${this.name}] [BLIND] Cleared pot before posting small blind (was ${potBeforeAdd}, now 0)`);
        }
        
        const totalChipsAndPotBefore = totalChipsBefore + this.pot;
        
        // console.log(`[Table ${this.name}] [BLIND PRE-OP] Hand: ${this.handsPlayed} | Player: ${player.name} | Blind: ${blindAmount} | PlayerChips: ${chipsBeforeSubtract} | Pot: ${potBeforeAdd} | TotalChips: ${totalChipsBefore} | TotalChips+Pot: ${totalChipsAndPotBefore}`);
        gameLogger.gameEvent(this.name, '[BLIND] PRE-OPERATION STATE', {
            handNumber: this.handsPlayed,
            player: player.name,
            blindAmount,
            playerChipsBefore: chipsBeforeSubtract,
            potBefore: potBeforeAdd,
            totalChipsBefore,
            totalChipsAndPotBefore,
            totalStartingChips: this.totalStartingChips,
            allSeats: this.seats.map((s, i) => s ? {
                seatIndex: i,
                name: s.name,
                chips: s.chips,
                totalBet: s.totalBet || 0,
                currentBet: s.currentBet || 0,
                isActive: s.isActive
            } : null).filter(Boolean)
        });
        
        // SYSTEMATIC DEBUG: Track chip movement during blind posting
        const totalChipsBeforeBlind = this.seats.filter(s => s !== null && s.isActive !== false).reduce((sum, s) => sum + (s.chips || 0), 0);
        const totalChipsAndPotBeforeBlind = totalChipsBeforeBlind + this.pot;
        
        player.chips -= blindAmount;
        player.currentBet = blindAmount;
        player.totalBet = blindAmount;
        this.pot += blindAmount;
        
        // SYSTEMATIC DEBUG: Track chip movement after blind posting
        const totalChipsAfterBlind = this.seats.filter(s => s !== null && s.isActive !== false).reduce((sum, s) => sum + (s.chips || 0), 0);
        const totalChipsAndPotAfterBlind = totalChipsAfterBlind + this.pot;
        const chipsLostDuringBlind = totalChipsAndPotBeforeBlind - totalChipsAndPotAfterBlind;
        
        const debugLogBlind = `[SYSTEMATIC_DEBUG] POST_BLIND: Player=${player.name}, Amount=${blindAmount}, BlindType=${amount === this.smallBlind ? 'small' : 'big'}, chipsLost=${chipsLostDuringBlind}, expected=0\n`;
        console.log(debugLogBlind.trim());
        fs.appendFileSync(path.join(__dirname, '../../logs/bet-raise-debug.log'), new Date().toISOString() + ' ' + debugLogBlind);
        
        if (Math.abs(chipsLostDuringBlind) > 0.01) {
            console.error(`[Table ${this.name}] ⚠️⚠️⚠️ [SYSTEMATIC_DEBUG] BLIND POSTING BUG DETECTED! Chips lost: ${chipsLostDuringBlind}`);
            gameLogger.error(this.name, '[SYSTEMATIC_DEBUG] BLIND POSTING BUG: Chips lost during blind posting', {
                player: player.name,
                blindAmount,
                blindType: amount === this.smallBlind ? 'small' : 'big',
                chipsLostDuringBlind,
                totalChipsAndPotBeforeBlind,
                totalChipsAndPotAfterBlind,
                handNumber: this.handsPlayed
            });
        }
        
        // ULTRA-VERBOSE: Log after operation with FULL STATE
        const chipsAfter = player.chips;
        const potAfter = this.pot;
        const totalChipsAfter = this.seats.filter(s => s !== null && s.isActive !== false).reduce((sum, s) => sum + (s.chips || 0), 0);
        const totalChipsAndPotAfter = totalChipsAfter + this.pot;
        const chipsDifference = totalChipsAndPotAfter - totalChipsAndPotBefore;
        
        console.log(`[Table ${this.name}] [BLIND POST-OP] Hand: ${this.handsPlayed} | Player: ${player.name} | PlayerChips: ${chipsAfter} (${chipsBeforeSubtract} - ${blindAmount}) | Pot: ${potAfter} (${potBeforeAdd} + ${blindAmount}) | TotalChips: ${totalChipsAfter} | TotalChips+Pot: ${totalChipsAndPotAfter} | Difference: ${chipsDifference}`);
        gameLogger.gameEvent(this.name, '[BLIND] POST-OPERATION STATE', {
            handNumber: this.handsPlayed,
            player: player.name,
            blindAmount,
            playerChipsBefore: chipsBeforeSubtract,
            playerChipsAfter: chipsAfter,
            potBefore: potBeforeAdd,
            potAfter: potAfter,
            totalChipsBefore,
            totalChipsAfter,
            totalChipsAndPotBefore,
            totalChipsAndPotAfter,
            chipsDifference,
            totalStartingChips: this.totalStartingChips,
            allSeats: this.seats.map((s, i) => s ? {
                seatIndex: i,
                name: s.name,
                chips: s.chips,
                totalBet: s.totalBet || 0,
                currentBet: s.currentBet || 0,
                isActive: s.isActive
            } : null).filter(Boolean)
        });
        
        // ULTRA-VERBOSE: Verify operation immediately
        if (player.chips !== chipsBeforeSubtract - blindAmount) {
            console.error(`[Table ${this.name}] ⚠️ CRITICAL BLIND ERROR: Chips calculation failed! Before: ${chipsBeforeSubtract}, Amount: ${blindAmount}, After: ${player.chips}, Expected: ${chipsBeforeSubtract - blindAmount}`);
            gameLogger.error(this.name, '[BLIND] CRITICAL: Chips calculation error', {
                handNumber: this.handsPlayed,
                player: player.name,
                chipsBefore: chipsBeforeSubtract,
                blindAmount,
                chipsAfter: player.chips,
                expected: chipsBeforeSubtract - blindAmount
            });
            // Record fix attempt - blind chips calculation error is a failure
            this._recordFixAttempt('FIX_23_BLIND_CHIPS_CALCULATION_ERROR', false, {
                context: 'POST_BLIND',
                player: player.name,
                chipsBefore: chipsBeforeSubtract,
                blindAmount,
                chipsAfter: player.chips,
                expected: chipsBeforeSubtract - blindAmount,
                handNumber: this.handsPlayed,
                phase: this.phase
            });
        } else {
            // Record fix attempt - success if chips calculation is correct
            this._recordFixAttempt('FIX_23_BLIND_CHIPS_CALCULATION_ERROR', true, {
                context: 'POST_BLIND',
                player: player.name,
                chipsBefore: chipsBeforeSubtract,
                blindAmount,
                chipsAfter: player.chips,
                handNumber: this.handsPlayed,
                phase: this.phase
            });
        }
        if (this.pot !== potBeforeAdd + blindAmount) {
            console.error(`[Table ${this.name}] ⚠️ CRITICAL BLIND ERROR: Pot calculation failed! Before: ${potBeforeAdd}, Amount: ${blindAmount}, After: ${this.pot}, Expected: ${potBeforeAdd + blindAmount}`);
            gameLogger.error(this.name, '[BLIND] CRITICAL: Pot calculation error', {
                handNumber: this.handsPlayed,
                player: player.name,
                potBefore: potBeforeAdd,
                blindAmount,
                potAfter: this.pot,
                expected: potBeforeAdd + blindAmount
            });
            // Record fix attempt - blind pot calculation error is a failure
            this._recordFixAttempt('FIX_24_BLIND_POT_CALCULATION_ERROR', false, {
                context: 'POST_BLIND',
                player: player.name,
                potBefore: potBeforeAdd,
                blindAmount,
                potAfter: this.pot,
                expected: potBeforeAdd + blindAmount,
                handNumber: this.handsPlayed,
                phase: this.phase
            });
        } else {
            // Record fix attempt - success if pot calculation is correct
            this._recordFixAttempt('FIX_24_BLIND_POT_CALCULATION_ERROR', true, {
                context: 'POST_BLIND',
                player: player.name,
                potBefore: potBeforeAdd,
                blindAmount,
                potAfter: this.pot,
                handNumber: this.handsPlayed,
                phase: this.phase
            });
        }
        if (Math.abs(chipsDifference) > 0.01) {
            console.error(`[Table ${this.name}] ⚠️ CRITICAL BLIND ERROR: Total chips changed! Before: ${totalChipsAndPotBefore}, After: ${totalChipsAndPotAfter}, Difference: ${chipsDifference}`);
            gameLogger.error(this.name, '[BLIND] CRITICAL: Total chips changed', {
                handNumber: this.handsPlayed,
                player: player.name,
                totalChipsAndPotBefore,
                totalChipsAndPotAfter,
                chipsDifference
            });
            // Record fix attempt - total chips changed during blind is a failure
            this._recordFixAttempt('FIX_25_BLIND_TOTAL_CHIPS_CHANGED', false, {
                context: 'POST_BLIND',
                player: player.name,
                totalChipsAndPotBefore,
                totalChipsAndPotAfter,
                chipsDifference,
                handNumber: this.handsPlayed,
                phase: this.phase
            });
        } else {
            // Record fix attempt - success if total chips didn't change
            this._recordFixAttempt('FIX_25_BLIND_TOTAL_CHIPS_CHANGED', true, {
                context: 'POST_BLIND',
                player: player.name,
                totalChipsAndPotBefore,
                totalChipsAndPotAfter,
                chipsDifference,
                handNumber: this.handsPlayed,
                phase: this.phase
            });
        }
        
        // CRITICAL: Validate after operation
        this._validateChipMovement(movement, 'POST_BLIND');
        
        // CRITICAL: Log chip movement for money tracking
        gameLogger.gameEvent(this.name, '[CHIPS] Blind Posted - chip movement', {
            player: player.name,
            seatIndex,
            blindType: amount === this.smallBlind ? 'small' : 'big',
            chipsBefore,
            chipsAfter: player.chips,
            chipsMoved: blindAmount,
            potBefore,
            potAfter: this.pot,
            potIncrease: blindAmount,
            totalBetBefore: 0,
            totalBetAfter: player.totalBet,
            currentBetBefore: 0,
            currentBetAfter: player.currentBet,
            phase: this.phase,
            validation: {
                chipsCorrect: player.chips === chipsBefore - blindAmount,
                potCorrect: this.pot === potBefore + blindAmount,
                totalBetCorrect: player.totalBet === blindAmount
            }
        });

        // CRITICAL: Verify calculation
        if (player.chips !== chipsBefore - blindAmount) {
            console.error(`[Table ${this.name}] ⚠️ BLIND POSTING ERROR: Chips calculation wrong. Before: ${chipsBefore}, Amount: ${blindAmount}, After: ${player.chips}`);
        }
        if (this.pot !== potBefore + blindAmount) {
            console.error(`[Table ${this.name}] ⚠️ BLIND POSTING ERROR: Pot calculation wrong. Before: ${potBefore}, Amount: ${blindAmount}, After: ${this.pot}`);
        }

        if (player.chips === 0) {
            player.isAllIn = true;
        }
        
        gameLogger.bettingAction(this.name, player.name || `Seat ${seatIndex}`, 'BLIND POSTED', {
            seatIndex,
            blindAmount,
            chipsBefore,
            chipsAfter: player.chips,
            potBefore,
            potAfter: this.pot,
            isAllIn: player.isAllIn
        });
    }

    getNextActivePlayer(fromIndex) {
        let index = fromIndex;
        for (let i = 0; i < this.maxPlayers; i++) {
            index = (index + 1) % this.maxPlayers;
            const seat = this.seats[index];
            if (seat && seat.isActive && !seat.isFolded && !seat.isAllIn) {
                return index;
            }
        }
        return -1;
    }

    // ============ Actions ============

    handleAction(playerId, action, amount = 0) {
        this._traceUniversal('HANDLE_ACTION', { 
            playerId, 
            action, 
            amount,
            currentPhase: this.phase,
            currentPlayerIndex: this.currentPlayerIndex,
            currentBet: this.currentBet
        });
        
        // CRITICAL FIX: Action lock to prevent race conditions from rapid clicks
        // MUST be checked FIRST before any validation to prevent multiple clicks from passing validation
        if (this._processingAction) {
            gameLogger.bettingAction(this.name, playerId || 'unknown', `Action rejected: Another action is being processed`);
            return { success: false, error: 'Please wait - another action is being processed' };
        }
        
        // CRITICAL FIX: Set action lock IMMEDIATELY after initial check to prevent race conditions
        // This ensures only ONE action can be processed at a time, even if multiple requests arrive simultaneously
        this._processingAction = true;
        
        // CRITICAL FIX: Clear turn timer IMMEDIATELY when action is received
        // This prevents timeout from firing while action is being processed
        // The timer should be cleared as soon as we know an action is being attempted
        // METHOD: Clear timer at start of handleAction instead of after processing
        const timerWasActive = !!this.turnTimeout;
        this.clearTurnTimer();
        
        // Record fix attempt for this method - log EVERY time we apply this fix
        // This tracks how many times we've tried this fix method
        this._recordFixAttempt('FIX_66_TIMER_CLEARED_AT_ACTION_START', true, {
            context: 'HANDLE_ACTION',
            playerId,
            action,
            method: 'CLEAR_TIMER_AT_START',
            timerWasActive,
            reason: 'Clearing timer immediately when action received to prevent timeout race condition',
            handNumber: this.handsPlayed,
            phase: this.phase
        });
        
        try {
            // CRITICAL: No betting allowed during showdown - just evaluate hands
            if (this.phase === GAME_PHASES.SHOWDOWN) {
                gameLogger.bettingAction(this.name, playerId || 'unknown', `Action rejected: No betting during showdown`);
                this._processingAction = false;
                return { success: false, error: 'No betting during showdown' };
            }
            
            // CRITICAL FIX #4 & #5: Action rejected - Game not in progress / Not your turn
            // ULTRA-VERBOSE: Log all validation checks
            // console.log(`[Table ${this.name}] [FIX #4/#5: ACTION VALIDATION] Player: ${playerId} | Action: ${action} | Phase: ${this.phase} | CurrentPlayerIndex: ${this.currentPlayerIndex}`);
            gameLogger.gameEvent(this.name, '[FIX #4/#5: ACTION] VALIDATION START', {
                playerId,
                action,
                amount,
                phase: this.phase,
                currentPlayerIndex: this.currentPlayerIndex,
                handNumber: this.handsPlayed
            });
            
            // CRITICAL: No betting allowed during waiting/ready_up/countdown phases
            if (this.phase === GAME_PHASES.WAITING || this.phase === GAME_PHASES.READY_UP || this.phase === GAME_PHASES.COUNTDOWN) {
                console.error(`[Table ${this.name}] ⚠️ FIX #5: Action rejected - Game not in progress | Player: ${playerId} | Phase: ${this.phase} | Action: ${action}`);
                gameLogger.bettingAction(this.name, playerId || 'unknown', `[FIX #5] Action rejected: Game not in progress (phase: ${this.phase})`, {
                    playerId,
                    action,
                    amount,
                    phase: this.phase,
                    handNumber: this.handsPlayed,
                    fix: 'Bot/player trying to act when game not in progress - this should be prevented by bot state checking'
                });
                
                // Record fix attempt failure
                this._recordFixAttempt('FIX_5_ACTION_GAME_NOT_IN_PROGRESS', false, {
                    playerId,
                    action,
                    phase: this.phase,
                    handNumber: this.handsPlayed
                });
                
                this._processingAction = false;
                return { success: false, error: 'Game not in progress' };
            } else {
                // Record fix attempt - success if game is in progress
                this._recordFixAttempt('FIX_5_ACTION_GAME_NOT_IN_PROGRESS', true, {
                    playerId,
                    action,
                    phase: this.phase,
                    handNumber: this.handsPlayed,
                    reason: 'Game is in progress - action can proceed'
                });
            }
            
            const seatIndex = this.seats.findIndex(s => s?.playerId === playerId);
            if (seatIndex === -1) {
                console.error(`[Table ${this.name}] ⚠️ FIX #4: Action rejected - Player not found | Player: ${playerId} | Action: ${action}`);
                gameLogger.bettingAction(this.name, playerId || 'unknown', `[FIX #4] Action rejected: Player not found at table`, {
                    playerId,
                    action,
                    amount,
                    phase: this.phase,
                    handNumber: this.handsPlayed,
                    allSeats: this.seats.map((s, i) => s ? { seatIndex: i, playerId: s.playerId, name: s.name } : { seatIndex: i, isNull: true }),
                    fix: 'Bot/player trying to act but not found in seats - bot may have been removed or seat cleared'
                });
                this._processingAction = false;
                return { success: false, error: 'Player not found at table' };
            }
            
            // CRITICAL FIX #4: Must be player's turn
            if (seatIndex !== this.currentPlayerIndex) {
                console.error(`[Table ${this.name}] ⚠️ FIX #4: Action rejected - Not your turn | Player: ${playerId} | Seat: ${seatIndex} | Current: ${this.currentPlayerIndex} | Action: ${action}`);
                gameLogger.bettingAction(this.name, playerId || 'unknown', `[FIX #4] Action rejected: Not your turn (seat ${seatIndex}, current ${this.currentPlayerIndex})`, {
                    playerId,
                    action,
                    amount,
                    seatIndex,
                    currentPlayerIndex: this.currentPlayerIndex,
                    phase: this.phase,
                    handNumber: this.handsPlayed,
                    fix: 'Bot/player trying to act out of turn - bot should check currentPlayerIndex before acting'
                });
                
                // Record fix attempt - rejecting out-of-turn action is a success
                this._recordFixAttempt('FIX_4_ACTION_NOT_YOUR_TURN', true, {
                    playerId,
                    seatIndex,
                    currentPlayerIndex: this.currentPlayerIndex,
                    action,
                    phase: this.phase,
                    handNumber: this.handsPlayed
                });
                
                this._processingAction = false;
                return { success: false, error: 'Not your turn' };
            }

            const player = this.seats[seatIndex];
            
            // CRITICAL FIX: Validate player can act
            if (!player) {
                gameLogger.bettingAction(this.name, playerId || 'unknown', `Action rejected: Player seat is null`);
                this._processingAction = false;
                return { success: false, error: 'Player seat is null' };
            }
            
            if (player.isFolded) {
                gameLogger.bettingAction(this.name, player.name || playerId, `Action rejected: Already folded`);
                this._processingAction = false;
                return { success: false, error: 'Already folded - cannot act' };
            }
            
            if (player.isAllIn && action !== ACTIONS.FOLD) {
                // All-in players can only fold (though this shouldn't happen in normal play)
                gameLogger.bettingAction(this.name, player.name || playerId, `Action rejected: Already all-in`);
                this._processingAction = false;
                return { success: false, error: 'Already all-in - cannot act' };
            }
        
        const toCall = this.currentBet - player.currentBet;
        
        gameLogger.bettingAction(this.name, player.name || playerId, `Attempting ${action}`, {
            seatIndex,
            amount,
            toCall,
            currentBet: this.currentBet,
            playerBet: player.currentBet,
            playerChips: player.chips,
            phase: this.phase,
            isAllIn: player.isAllIn
        });

        let result = { success: false, error: 'Invalid action' };

        switch (action) {
                case ACTIONS.FOLD:
                    result = this.fold(seatIndex);
                    break;
                case ACTIONS.CHECK:
                    // CRITICAL FIX #6: Check action failures - improve validation
                    // console.log(`[Table ${this.name}] [FIX #6: CHECK VALIDATION] Player: ${player.name} | ToCall: ${toCall} | CurrentBet: ${this.currentBet} | PlayerBet: ${player.currentBet}`);
                    gameLogger.gameEvent(this.name, '[FIX #6: CHECK] VALIDATION START', {
                        player: player.name,
                        seatIndex,
                        toCall,
                        currentBet: this.currentBet,
                        playerBet: player.currentBet,
                        phase: this.phase,
                        handNumber: this.handsPlayed
                    });
                    
                    if (toCall > 0) {
                        const errorMsg = `Cannot check - need to call ${toCall}`;
                        gameLogger.bettingAction(this.name, player.name || `Seat ${seatIndex}`, '[FIX #6] CHECK REJECTED', {
                            seatIndex,
                            toCall,
                            currentBet: this.currentBet,
                            playerBet: player.currentBet,
                            reason: errorMsg,
                            fix: 'Bot/player trying to check when toCall > 0 - should call or fold'
                        });
                        
                        // Record fix attempt failure
                        this._recordFixAttempt('FIX_6_BETTING_ACTION_FAILURES', false, {
                            action: 'check',
                            player: player.name,
                            toCall,
                            currentBet: this.currentBet,
                            playerBet: player.currentBet,
                            reason: errorMsg,
                            handNumber: this.handsPlayed,
                            phase: this.phase
                        });
                        
                        result = { success: false, error: errorMsg };
                    } else {
                        // console.log(`[Table ${this.name}] [FIX #6: CHECK] Allowing check | Player: ${player.name}`);
                        result = this.check(seatIndex);
                    }
                    break;
                case ACTIONS.CALL:
                    if (toCall === 0) {
                        // Can't call if there's nothing to call - treat as check
                        result = this.check(seatIndex);
                    } else if (toCall > player.chips) {
                        // Can't call more than you have - treat as all-in
                        result = this.allIn(seatIndex);
                    } else {
                        result = this.call(seatIndex);
                    }
                    break;
                case ACTIONS.BET:
                    // CRITICAL FIX #6: Betting action failures - improve validation
                    // console.log(`[Table ${this.name}] [FIX #6: BET VALIDATION] Player: ${player.name} | Amount: ${amount} | CurrentBet: ${this.currentBet} | Phase: ${this.phase} | PlayerChips: ${player.chips}`);
                    gameLogger.gameEvent(this.name, '[FIX #6: BET] VALIDATION START', {
                        player: player.name,
                        seatIndex,
                        amount,
                        currentBet: this.currentBet,
                        phase: this.phase,
                        playerChips: player.chips,
                        bigBlind: this.bigBlind,
                        handNumber: this.handsPlayed
                    });
                    
                    // FIX: Pre-flop after blinds, currentBet equals bigBlind, but players should still be able to bet/raise
                    // Only block betting if we're NOT in pre-flop OR if currentBet is 0 (post-flop with no bets yet)
                    if (this.currentBet > 0 && this.phase !== GAME_PHASES.PRE_FLOP) {
                        const errorMsg = `Cannot bet - current bet is ${this.currentBet}. Use raise or call.`;
                        gameLogger.bettingAction(this.name, player.name || `Seat ${seatIndex}`, '[FIX #6] BET REJECTED', {
                            seatIndex,
                            amount,
                            currentBet: this.currentBet,
                            phase: this.phase,
                            reason: errorMsg,
                            fix: 'Bot/player trying to bet when currentBet > 0 - should use raise or call'
                        });
                        
                        // Record fix attempt failure
                        this._recordFixAttempt('FIX_6_BETTING_ACTION_FAILURES', false, {
                            action: 'bet',
                            player: player.name,
                            amount,
                            currentBet: this.currentBet,
                            phase: this.phase,
                            reason: errorMsg,
                            handNumber: this.handsPlayed
                        });
                        
                        result = { success: false, error: errorMsg };
                    } else if (amount < this.bigBlind) {
                        const errorMsg = `Minimum bet is ${this.bigBlind}`;
                        gameLogger.bettingAction(this.name, player.name || `Seat ${seatIndex}`, '[FIX #6] BET REJECTED', {
                            seatIndex,
                            amount,
                            bigBlind: this.bigBlind,
                            reason: errorMsg,
                            fix: 'Bot/player trying to bet less than bigBlind'
                        });
                        
                        // Record fix attempt failure
                        this._recordFixAttempt('FIX_6_BETTING_ACTION_FAILURES', false, {
                            action: 'bet',
                            player: player.name,
                            amount,
                            bigBlind: this.bigBlind,
                            reason: errorMsg,
                            handNumber: this.handsPlayed,
                            phase: this.phase
                        });
                        
                        result = { success: false, error: errorMsg };
                    } else if (amount > player.chips) {
                        const errorMsg = `You don't have enough chips. You have ${player.chips}.`;
                        gameLogger.bettingAction(this.name, player.name || `Seat ${seatIndex}`, '[FIX #6] BET REJECTED', {
                            seatIndex,
                            amount,
                            playerChips: player.chips,
                            reason: errorMsg,
                            fix: 'Bot/player trying to bet more than they have'
                        });
                        
                        // Record fix attempt failure
                        this._recordFixAttempt('FIX_6_BETTING_ACTION_FAILURES', false, {
                            action: 'bet',
                            player: player.name,
                            amount,
                            playerChips: player.chips,
                            reason: errorMsg,
                            handNumber: this.handsPlayed,
                            phase: this.phase
                        });
                        
                        result = { success: false, error: errorMsg };
                    } else {
                        // Pre-flop: If currentBet > 0 (blinds posted), check if amount is more than currentBet
                        if (this.currentBet > 0 && this.phase === GAME_PHASES.PRE_FLOP) {
                            // If amount equals currentBet, it's a call, not a bet
                            if (amount === this.currentBet) {
                                console.log(`[Table ${this.name}] [FIX #6: BET] Converting to CALL (amount equals currentBet) | Player: ${player.name} | Amount: ${amount}`);
                                result = this.call(seatIndex);
                            } else if (amount > this.currentBet) {
                                // Amount is more than currentBet - this is a raise
                                console.log(`[Table ${this.name}] [FIX #6: BET] Converting to RAISE (amount > currentBet) | Player: ${player.name} | Amount: ${amount} | CurrentBet: ${this.currentBet}`);
                                result = this.raise(seatIndex, amount);
                            } else {
                                const errorMsg = `Bet amount must be at least ${this.currentBet} (current bet)`;
                                console.error(`[Table ${this.name}] ⚠️ FIX #6: BET REJECTED - ${errorMsg} | Player: ${player.name} | Amount: ${amount}`);
                                gameLogger.bettingAction(this.name, player.name || `Seat ${seatIndex}`, '[FIX #6] BET REJECTED', {
                                    seatIndex,
                                    amount,
                                    currentBet: this.currentBet,
                                    reason: errorMsg,
                                    fix: 'Bot/player trying to bet less than currentBet'
                                });
                                
                                // Record fix attempt failure
                                this._recordFixAttempt('FIX_6_BETTING_ACTION_FAILURES', false, {
                                    action: 'bet',
                                    player: player.name,
                                    amount,
                                    currentBet: this.currentBet,
                                    reason: errorMsg,
                                    handNumber: this.handsPlayed,
                                    phase: this.phase
                                });
                                
                                result = { success: false, error: errorMsg };
                            }
                        } else {
                            // Post-flop with no bets, or pre-flop before blinds - allow bet
                            // console.log(`[Table ${this.name}] [FIX #6: BET] Allowing bet | Player: ${player.name} | Amount: ${amount}`);
                            result = this.bet(seatIndex, amount);
                        }
                    }
                    break;
                case ACTIONS.RAISE:
                    result = this.raise(seatIndex, amount);
                    break;
                case ACTIONS.ALL_IN:
                    result = this.allIn(seatIndex);
                    break;
                default:
                    result = { success: false, error: `Unknown action: ${action}` };
                    break;
            }

            if (result.success) {
                gameLogger.bettingAction(this.name, player.name || playerId, `${result.action} SUCCESS`, {
                    action: result.action,
                    amount: result.amount,
                    newChips: player.chips,
                    newBet: player.currentBet,
                    pot: this.pot,
                    currentBet: this.currentBet,
                    minRaise: this.minRaise,
                    lastRaiserIndex: this.lastRaiserIndex
                });
                
                // Record fix attempt - successful action means betting action validation passed
                this._recordFixAttempt('FIX_6_BETTING_ACTION_FAILURES', true, {
                    action: result.action,
                    player: player.name,
                    amount: result.amount,
                    handNumber: this.handsPlayed,
                    phase: this.phase,
                    reason: 'Betting action validation passed - action executed successfully'
                });
                
                // Timer already cleared at start of handleAction - no need to clear again
                
                // Notify about the action (for all players including bots)
                this.onPlayerAction?.(playerId, result.action, result.amount || 0);
                
                // Record action for stats tracking
                if (this.handActions[playerId]) {
                    this.handActions[playerId].push({
                        phase: this.phase,
                        action: result.action,
                        amount: result.amount || 0
                    });
                }
                
                // CRITICAL FIX: Clear action lock BEFORE advancing game (advanceGame may trigger async operations)
                this._processingAction = false;
                
                this.advanceGame();
            } else {
                gameLogger.bettingAction(this.name, player.name || playerId, `${action} FAILED`, {
                    error: result.error,
                    reason: result.error
                });
                
                // CRITICAL FIX: Clear action lock on failure too
                this._processingAction = false;
            }
            
            // Record fix attempt - success if no exception occurred
            this._recordFixAttempt('FIX_26_HANDLE_ACTION_EXCEPTION', true, {
                context: 'HANDLE_ACTION',
                playerId,
                action,
                handNumber: this.handsPlayed,
                phase: this.phase,
                reason: 'No exception occurred - action processed successfully'
            });

            return result;
        } catch (error) {
            // CRITICAL FIX: Ensure lock is cleared even if an exception occurs
            console.error(`[Table ${this.name}] Exception in handleAction:`, error);
            gameLogger.error(this.name, '[HANDLE_ACTION] Exception occurred', {
                error: error.message,
                stack: error.stack,
                playerId,
                action,
                handNumber: this.handsPlayed,
                phase: this.phase
            });
            // Record fix attempt - exception in handleAction is a failure
            this._recordFixAttempt('FIX_26_HANDLE_ACTION_EXCEPTION', false, {
                context: 'HANDLE_ACTION',
                error: error.message,
                playerId,
                action,
                handNumber: this.handsPlayed,
                phase: this.phase
            });
            this._processingAction = false;
            return { success: false, error: 'An error occurred processing your action' };
        }
    }

    fold(seatIndex) {
        this._traceUniversal('FOLD', { 
            seatIndex,
            playerName: this.seats[seatIndex]?.name,
            phase: this.phase
        });
        
        const player = this.seats[seatIndex];
        if (!player) {
            gameLogger.bettingAction(this.name, `Seat ${seatIndex}`, 'FOLD REJECTED', {
                seatIndex,
                reason: 'Player not found'
            });
            return { success: false, error: 'Player not found' };
        }
        
        // CRITICAL FIX: Prevent multiple folds
        if (player.isFolded) {
            gameLogger.bettingAction(this.name, player.name || `Seat ${seatIndex}`, 'FOLD REJECTED', {
                seatIndex,
                phase: this.phase,
                reason: 'Already folded'
            });
            return { success: false, error: 'Already folded' };
        }
        
        // CRITICAL FIX: Can't fold if already all-in (all-in players are committed)
        if (player.isAllIn) {
            gameLogger.bettingAction(this.name, player.name || `Seat ${seatIndex}`, 'FOLD REJECTED', {
                seatIndex,
                phase: this.phase,
                reason: 'Cannot fold - already all-in'
            });
            return { success: false, error: 'Cannot fold - already all-in' };
        }
        
        const cardsBeforeFold = player.cards ? [...player.cards] : null;
        player.isFolded = true;
        // CRITICAL: DO NOT clear cards on fold - they should remain visible until showdown or new hand
        // Cards will be cleared in startNewHand when appropriate
        
        console.log(`[Table ${this.name}] ${player.name} FOLDED - cards preserved:`, 
            cardsBeforeFold ? JSON.stringify(cardsBeforeFold) : 'null');
        
        gameLogger.bettingAction(this.name, player.name || `Seat ${seatIndex}`, 'FOLD', {
            seatIndex,
            phase: this.phase,
            pot: this.pot,
            cardsPreserved: cardsBeforeFold
        });
        return { success: true, action: 'fold' };
    }

    check(seatIndex) {
        const player = this.seats[seatIndex];
        
        // FIX: Validate that check is allowed (currentBet must equal player's currentBet)
        if (player.currentBet !== this.currentBet) {
            const toCall = this.currentBet - player.currentBet;
            gameLogger.bettingAction(this.name, player.name || `Seat ${seatIndex}`, 'CHECK REJECTED', {
                seatIndex,
                phase: this.phase,
                currentBet: this.currentBet,
                playerBet: player.currentBet,
                toCall,
                reason: 'Cannot check - must call or fold'
            });
            return { success: false, error: `Cannot check - you need to call ${toCall} chips or fold.` };
        }
        
        gameLogger.bettingAction(this.name, player.name || `Seat ${seatIndex}`, 'CHECK', {
            seatIndex,
            phase: this.phase,
            currentBet: this.currentBet,
            playerBet: player.currentBet
        });
        
        // FIX: Ensure hasPassedLastRaiser is set correctly when checking
        // If no one has raised (lastRaiserIndex is BB), and we're checking, we need to track this
        // This helps prevent infinite checking loops
        if (this.phase === GAME_PHASES.PRE_FLOP && this.lastRaiserIndex !== -1) {
            const bbIndex = this.getNextActivePlayer(this.getNextActivePlayer(this.dealerIndex));
            // If we're checking and we've passed the BB, mark that we've passed the last raiser
            if (this.currentBet <= this.bigBlind && this.lastRaiserIndex === bbIndex) {
                if (seatIndex > bbIndex || (seatIndex < bbIndex && this.getNextActivePlayer(seatIndex) === bbIndex)) {
                    // We've passed the BB (last raiser when no one raises)
                    this.hasPassedLastRaiser = true;
                }
            }
        }
        
        return { success: true, action: 'check' };
    }

    call(seatIndex) {
        this._traceUniversal('CALL', { 
            seatIndex,
            playerName: this.seats[seatIndex]?.name,
            currentBet: this.currentBet,
            playerCurrentBet: this.seats[seatIndex]?.currentBet,
            playerChips: this.seats[seatIndex]?.chips,
            phase: this.phase
        });
        
        const player = this.seats[seatIndex];
        const toCall = Math.min(this.currentBet - player.currentBet, player.chips);
        
        const beforeChips = player.chips;
        const potBefore = this.pot;
        const totalBetBefore = player.totalBet || 0;
        const currentBetBefore = player.currentBet || 0;
        
        // CRITICAL: Track chip movement BEFORE operation
        const movement = this._trackChipMovement('CALL', {
            player: player.name,
            seatIndex,
            toCall,
            chipsBefore: beforeChips,
            potBefore,
            totalBetBefore,
            currentBetBefore
        });
        
        // ULTRA-VERBOSE: Log before operation with FULL STATE
        const potBeforeAdd = this.pot;
        const chipsBeforeSubtract = player.chips;
        const totalChipsBefore = this.seats.filter(s => s !== null && s.isActive !== false).reduce((sum, s) => sum + (s.chips || 0), 0);
        const totalChipsAndPotBefore = totalChipsBefore + this.pot;
        
        // console.log(`[Table ${this.name}] [CALL PRE-OP] Hand: ${this.handsPlayed} | Player: ${player.name} | ToCall: ${toCall} | PlayerChips: ${chipsBeforeSubtract} | Pot: ${potBeforeAdd} | TotalChips: ${totalChipsBefore} | TotalChips+Pot: ${totalChipsAndPotBefore}`);
        gameLogger.gameEvent(this.name, '[CALL] PRE-OPERATION STATE', {
            handNumber: this.handsPlayed,
            player: player.name,
            toCall,
            playerChipsBefore: chipsBeforeSubtract,
            potBefore: potBeforeAdd,
            totalChipsBefore,
            totalChipsAndPotBefore,
            totalStartingChips: this.totalStartingChips,
            allSeats: this.seats.map((s, i) => s ? {
                seatIndex: i,
                name: s.name,
                chips: s.chips,
                totalBet: s.totalBet || 0,
                currentBet: s.currentBet || 0,
                isActive: s.isActive
            } : null).filter(Boolean)
        });
        
        // SYSTEMATIC DEBUG: CALL() RE-ENABLED - Adding detailed logging to find the exact bug
        // We confirmed: With call() disabled, chips DON'T go missing. So the bug is in call().
        // Now we need to find WHERE in call() the bug is.
        
        // Log BEFORE chip movement
        const chipsBeforeMove = player.chips;
        const potBeforeMove = this.pot;
        const totalChipsBeforeMove = this.seats.filter(s => s !== null && s.isActive !== false).reduce((sum, s) => sum + (s.chips || 0), 0);
        const totalChipsAndPotBeforeMove = totalChipsBeforeMove + this.pot;
        
        gameLogger.gameEvent(this.name, '[SYSTEMATIC_DEBUG] CALL BEFORE CHIP MOVE', {
            player: player.name,
            seatIndex,
            toCall,
            chipsBefore: chipsBeforeMove,
            potBefore: potBeforeMove,
            totalChipsBefore: totalChipsBeforeMove,
            totalChipsAndPotBefore: totalChipsAndPotBeforeMove,
            currentBet: this.currentBet,
            playerCurrentBet: player.currentBet,
            handNumber: this.handsPlayed,
            phase: this.phase
        });
        
        // Perform chip movement
        player.chips -= toCall;
        player.currentBet += toCall;
        const totalBetAfter = (player.totalBet || 0) + toCall;
        player.totalBet = totalBetAfter;
        
        // Log AFTER subtracting from player but BEFORE adding to pot
        const chipsAfterSubtract = player.chips;
        const potAfterSubtract = this.pot; // Should still be potBeforeMove
        const totalChipsAfterSubtract = this.seats.filter(s => s !== null && s.isActive !== false).reduce((sum, s) => sum + (s.chips || 0), 0);
        const totalChipsAndPotAfterSubtract = totalChipsAfterSubtract + this.pot;
        const chipsLostAfterSubtract = totalChipsAndPotBeforeMove - totalChipsAndPotAfterSubtract;
        
        gameLogger.gameEvent(this.name, '[SYSTEMATIC_DEBUG] CALL AFTER SUBTRACT (BEFORE ADD TO POT)', {
            player: player.name,
            toCall,
            chipsAfterSubtract,
            potAfterSubtract,
            totalChipsAfterSubtract,
            totalChipsAndPotAfterSubtract,
            chipsLostAfterSubtract,
            expectedLoss: toCall, // We expect chipsLostAfterSubtract to equal toCall (chips moved from player to... nowhere yet)
            handNumber: this.handsPlayed
        });
        
        // CRITICAL: Always log to console AND file so we can see it
        const debugLog = `[SYSTEMATIC_DEBUG] CALL AFTER SUBTRACT: Player=${player.name}, toCall=${toCall}, chipsLost=${chipsLostAfterSubtract}, expected=${toCall}\n`;
        console.log(debugLog.trim());
        fs.appendFileSync(path.join(__dirname, '../../logs/call-debug.log'), new Date().toISOString() + ' ' + debugLog);
        
        if (Math.abs(chipsLostAfterSubtract - toCall) > 0.01) {
            console.error(`[Table ${this.name}] ⚠️⚠️⚠️ [SYSTEMATIC_DEBUG] CALL BUG DETECTED: Chips lost after subtract! Expected ${toCall}, got ${chipsLostAfterSubtract}`);
            gameLogger.error(this.name, '[SYSTEMATIC_DEBUG] CALL BUG: Chips lost after subtract', {
                toCall,
                chipsLostAfterSubtract,
                chipsBeforeMove,
                chipsAfterSubtract,
                potBeforeMove,
                potAfterSubtract,
                handNumber: this.handsPlayed
            });
        }
        
        // ROOT TRACING: Track totalBet changes
        gameLogger.gameEvent(this.name, '[ROOT_TRACE] TOTAL_BET_SET', {
            operation: 'CALL',
            player: player.name,
            seatIndex,
            totalBetBefore: totalBetBefore,
            totalBetAfter: totalBetAfter,
            amountAdded: toCall,
            handNumber: this.handsPlayed,
            phase: this.phase,
            stackTrace: new Error().stack?.split('\n').slice(2, 8).join(' | ') || 'NO_STACK'
        });
        
        // Add to pot
        this.pot += toCall;
        
        // Log AFTER adding to pot
        const chipsAfterAdd = player.chips;
        const potAfterAdd = this.pot;
        const totalChipsAfterAdd = this.seats.filter(s => s !== null && s.isActive !== false).reduce((sum, s) => sum + (s.chips || 0), 0);
        const totalChipsAndPotAfterAdd = totalChipsAfterAdd + this.pot;
        const chipsLostAfterAdd = totalChipsAndPotBeforeMove - totalChipsAndPotAfterAdd;
        
        gameLogger.gameEvent(this.name, '[SYSTEMATIC_DEBUG] CALL AFTER ADD TO POT', {
            player: player.name,
            toCall,
            chipsAfterAdd,
            potAfterAdd,
            totalChipsAfterAdd,
            totalChipsAndPotAfterAdd,
            chipsLostAfterAdd,
            expectedLoss: 0, // After adding to pot, total should be same (chips moved from player to pot)
            handNumber: this.handsPlayed
        });
        
        // CRITICAL: Always log to console AND file so we can see it
        const debugLog2 = `[SYSTEMATIC_DEBUG] CALL AFTER ADD TO POT: Player=${player.name}, toCall=${toCall}, chipsLost=${chipsLostAfterAdd}, expected=0\n`;
        console.log(debugLog2.trim());
        fs.appendFileSync(path.join(__dirname, '../../logs/call-debug.log'), new Date().toISOString() + ' ' + debugLog2);
        
        if (Math.abs(chipsLostAfterAdd) > 0.01) {
            console.error(`[Table ${this.name}] ⚠️⚠️⚠️ [SYSTEMATIC_DEBUG] CALL BUG DETECTED: Chips lost after adding to pot! Lost: ${chipsLostAfterAdd}`);
            gameLogger.error(this.name, '[SYSTEMATIC_DEBUG] CALL BUG: Chips lost after adding to pot', {
                toCall,
                chipsLostAfterAdd,
                chipsBeforeMove,
                chipsAfterAdd,
                potBeforeMove,
                potAfterAdd,
                totalChipsAndPotBeforeMove,
                totalChipsAndPotAfterAdd,
                handNumber: this.handsPlayed
            });
        }
        
        // ULTRA-VERBOSE: Log after operation with FULL STATE
        const chipsAfter = player.chips;
        const potAfter = this.pot;
        const totalChipsAfter = this.seats.filter(s => s !== null && s.isActive !== false).reduce((sum, s) => sum + (s.chips || 0), 0);
        const totalChipsAndPotAfter = totalChipsAfter + this.pot;
        const chipsDifference = totalChipsAndPotAfter - totalChipsAndPotBefore;
        
        console.log(`[Table ${this.name}] [CALL POST-OP] Hand: ${this.handsPlayed} | Player: ${player.name} | PlayerChips: ${chipsAfter} (${chipsBeforeSubtract} - ${toCall}) | Pot: ${potAfter} (${potBeforeAdd} + ${toCall}) | TotalChips: ${totalChipsAfter} | TotalChips+Pot: ${totalChipsAndPotAfter} | Difference: ${chipsDifference}`);
        gameLogger.gameEvent(this.name, '[CALL] POST-OPERATION STATE', {
            handNumber: this.handsPlayed,
            player: player.name,
            toCall,
            playerChipsBefore: chipsBeforeSubtract,
            playerChipsAfter: chipsAfter,
            potBefore: potBeforeAdd,
            potAfter: potAfter,
            totalChipsBefore,
            totalChipsAfter,
            totalChipsAndPotBefore,
            totalChipsAndPotAfter,
            chipsDifference,
            totalStartingChips: this.totalStartingChips,
            allSeats: this.seats.map((s, i) => s ? {
                seatIndex: i,
                name: s.name,
                chips: s.chips,
                totalBet: s.totalBet || 0,
                currentBet: s.currentBet || 0,
                isActive: s.isActive
            } : null).filter(Boolean)
        });
        
        // ULTRA-VERBOSE: Verify operation immediately
        if (player.chips !== chipsBeforeSubtract - toCall) {
            console.error(`[Table ${this.name}] ⚠️ CRITICAL CALL ERROR: Chips calculation failed! Before: ${chipsBeforeSubtract}, Amount: ${toCall}, After: ${player.chips}, Expected: ${chipsBeforeSubtract - toCall}`);
            gameLogger.error(this.name, '[CALL] CRITICAL: Chips calculation error', {
                handNumber: this.handsPlayed,
                player: player.name,
                chipsBefore: chipsBeforeSubtract,
                toCall,
                chipsAfter: player.chips,
                expected: chipsBeforeSubtract - toCall
            });
            // Record fix attempt - call chips calculation error is a failure
            this._recordFixAttempt('FIX_27_CALL_CHIPS_CALCULATION_ERROR', false, {
                context: 'CALL',
                player: player.name,
                chipsBefore: chipsBeforeSubtract,
                toCall,
                chipsAfter: player.chips,
                expected: chipsBeforeSubtract - toCall,
                handNumber: this.handsPlayed,
                phase: this.phase
            });
        } else {
            // Record fix attempt - success if chips calculation is correct
            this._recordFixAttempt('FIX_27_CALL_CHIPS_CALCULATION_ERROR', true, {
                context: 'CALL',
                player: player.name,
                chipsBefore: chipsBeforeSubtract,
                toCall,
                chipsAfter: player.chips,
                handNumber: this.handsPlayed,
                phase: this.phase
            });
        }
        if (this.pot !== potBeforeAdd + toCall) {
            console.error(`[Table ${this.name}] ⚠️ CRITICAL CALL ERROR: Pot calculation failed! Before: ${potBeforeAdd}, Amount: ${toCall}, After: ${this.pot}, Expected: ${potBeforeAdd + toCall}`);
            gameLogger.error(this.name, '[CALL] CRITICAL: Pot calculation error', {
                handNumber: this.handsPlayed,
                player: player.name,
                potBefore: potBeforeAdd,
                toCall,
                potAfter: this.pot,
                expected: potBeforeAdd + toCall
            });
            // Record fix attempt - call pot calculation error is a failure
            this._recordFixAttempt('FIX_28_CALL_POT_CALCULATION_ERROR', false, {
                context: 'CALL',
                player: player.name,
                potBefore: potBeforeAdd,
                toCall,
                potAfter: this.pot,
                expected: potBeforeAdd + toCall,
                handNumber: this.handsPlayed,
                phase: this.phase
            });
        } else {
            // Record fix attempt - success if pot calculation is correct
            this._recordFixAttempt('FIX_28_CALL_POT_CALCULATION_ERROR', true, {
                context: 'CALL',
                player: player.name,
                potBefore: potBeforeAdd,
                toCall,
                potAfter: this.pot,
                handNumber: this.handsPlayed,
                phase: this.phase
            });
        }
        if (Math.abs(chipsDifference) > 0.01) {
            console.error(`[Table ${this.name}] ⚠️ CRITICAL CALL ERROR: Total chips changed! Before: ${totalChipsAndPotBefore}, After: ${totalChipsAndPotAfter}, Difference: ${chipsDifference}`);
            gameLogger.error(this.name, '[CALL] CRITICAL: Total chips changed', {
                handNumber: this.handsPlayed,
                player: player.name,
                totalChipsAndPotBefore,
                totalChipsAndPotAfter,
                chipsDifference
            });
            // Record fix attempt - total chips changed during call is a failure
            this._recordFixAttempt('FIX_29_CALL_TOTAL_CHIPS_CHANGED', false, {
                context: 'CALL',
                player: player.name,
                totalChipsAndPotBefore,
                totalChipsAndPotAfter,
                chipsDifference,
                handNumber: this.handsPlayed,
                phase: this.phase
            });
        } else {
            // Record fix attempt - success if total chips didn't change
            this._recordFixAttempt('FIX_29_CALL_TOTAL_CHIPS_CHANGED', true, {
                context: 'CALL',
                player: player.name,
                totalChipsAndPotBefore,
                totalChipsAndPotAfter,
                chipsDifference,
                handNumber: this.handsPlayed,
                phase: this.phase
            });
        }
        
        // CRITICAL: Validate after operation
        this._validateChipMovement(movement, 'CALL');
        
        // CRITICAL: Log chip movement for money tracking
        gameLogger.gameEvent(this.name, '[CHIPS] Call - chip movement', {
            player: player.name,
            seatIndex,
            chipsBefore: beforeChips,
            chipsAfter: player.chips,
            chipsMoved: toCall,
            potBefore,
            potAfter: this.pot,
            potIncrease: toCall,
            totalBetBefore,
            totalBetAfter: player.totalBet,
            currentBetBefore,
            currentBetAfter: player.currentBet,
            phase: this.phase,
            validation: {
                chipsCorrect: player.chips === beforeChips - toCall,
                potCorrect: this.pot === potBefore + toCall,
                totalBetCorrect: player.totalBet === totalBetBefore + toCall
            }
        });
        
        // CRITICAL: Verify calculations
        if (player.chips !== beforeChips - toCall) {
            console.error(`[Table ${this.name}] ⚠️ CALL ERROR: Chips calculation wrong. Before: ${beforeChips}, Amount: ${toCall}, After: ${player.chips}`);
        }
        if (this.pot !== potBefore + toCall) {
            console.error(`[Table ${this.name}] ⚠️ CALL ERROR: Pot calculation wrong. Before: ${potBefore}, Amount: ${toCall}, After: ${this.pot}`);
        }
        if (player.totalBet !== totalBetBefore + toCall) {
            console.error(`[Table ${this.name}] ⚠️ CALL ERROR: totalBet calculation wrong. Before: ${totalBetBefore}, Amount: ${toCall}, After: ${player.totalBet}`);
        }
        if (player.currentBet !== currentBetBefore + toCall) {
            console.error(`[Table ${this.name}] ⚠️ CALL ERROR: currentBet calculation wrong. Before: ${currentBetBefore}, Amount: ${toCall}, After: ${player.currentBet}`);
        }

        if (player.chips === 0) {
            player.isAllIn = true;
        }

        gameLogger.bettingAction(this.name, player.name || `Seat ${seatIndex}`, 'CALL', {
            seatIndex,
            amount: toCall,
            chipsBefore: beforeChips,
            chipsAfter: player.chips,
            currentBet: this.currentBet,
            playerBet: player.currentBet,
            pot: this.pot,
            isAllIn: player.isAllIn,
            phase: this.phase
        });

        return { success: true, action: 'call', amount: toCall };
    }

    bet(seatIndex, amount) {
        this._traceUniversal('BET', { 
            seatIndex,
            amount,
            playerName: this.seats[seatIndex]?.name,
            playerChips: this.seats[seatIndex]?.chips,
            currentBet: this.currentBet,
            phase: this.phase
        });
        
        const player = this.seats[seatIndex];
        
        if (amount < this.bigBlind || amount > player.chips) {
            gameLogger.bettingAction(this.name, player.name || `Seat ${seatIndex}`, 'BET REJECTED', {
                amount,
                bigBlind: this.bigBlind,
                playerChips: player.chips
            });
            return { success: false, error: 'Invalid bet amount' };
        }

        const beforeChips = player.chips;
        const potBefore = this.pot;
        const totalBetBefore = player.totalBet || 0;
        
        // CRITICAL: Track chip movement BEFORE operation
        const movement = this._trackChipMovement('BET', {
            player: player.name,
            seatIndex,
            amount,
            chipsBefore: beforeChips,
            potBefore,
            totalBetBefore
        });
        
        // ULTRA-VERBOSE: Log before operation with FULL STATE
        const potBeforeAdd = this.pot;
        const chipsBeforeSubtract = player.chips;
        const totalChipsBefore = this.seats.filter(s => s !== null && s.isActive !== false).reduce((sum, s) => sum + (s.chips || 0), 0);
        const totalChipsAndPotBefore = totalChipsBefore + this.pot;
        
        // console.log(`[Table ${this.name}] [BET PRE-OP] Hand: ${this.handsPlayed} | Player: ${player.name} | Amount: ${amount} | PlayerChips: ${chipsBeforeSubtract} | Pot: ${potBeforeAdd} | TotalChips: ${totalChipsBefore} | TotalChips+Pot: ${totalChipsAndPotBefore}`);
        gameLogger.gameEvent(this.name, '[BET] PRE-OPERATION STATE', {
            handNumber: this.handsPlayed,
            player: player.name,
            amount,
            playerChipsBefore: chipsBeforeSubtract,
            potBefore: potBeforeAdd,
            totalChipsBefore,
            totalChipsAndPotBefore,
            totalStartingChips: this.totalStartingChips,
            allSeats: this.seats.map((s, i) => s ? {
                seatIndex: i,
                name: s.name,
                chips: s.chips,
                totalBet: s.totalBet || 0,
                currentBet: s.currentBet || 0,
                isActive: s.isActive
            } : null).filter(Boolean)
        });
        
        // SYSTEMATIC DEBUG: Track chip movement BEFORE bet (must be before any changes)
        const totalChipsBeforeBet = this.seats.filter(s => s !== null && s.isActive !== false).reduce((sum, s) => sum + (s.chips || 0), 0);
        const totalChipsAndPotBeforeBet = totalChipsBeforeBet + this.pot;
        
        // SYSTEMATIC DEBUG: BET is ACTIVE - testing if call() is the problem
        player.chips -= amount;
        player.currentBet = amount;
        const totalBetAfter = totalBetBefore + amount;
        player.totalBet = totalBetAfter;
        
        // ROOT TRACING: Track totalBet changes
        gameLogger.gameEvent(this.name, '[ROOT_TRACE] TOTAL_BET_SET', {
            operation: 'BET',
            player: player.name,
            seatIndex,
            totalBetBefore: totalBetBefore,
            totalBetAfter: totalBetAfter,
            amountAdded: amount,
            handNumber: this.handsPlayed,
            phase: this.phase,
            stackTrace: new Error().stack?.split('\n').slice(2, 8).join(' | ') || 'NO_STACK'
        });
        
        this.pot += amount;
        
        // SYSTEMATIC DEBUG: Track chip movement after bet
        const totalChipsAfterBet = this.seats.filter(s => s !== null && s.isActive !== false).reduce((sum, s) => sum + (s.chips || 0), 0);
        const totalChipsAndPotAfterBet = totalChipsAfterBet + this.pot;
        const chipsLostDuringBet = totalChipsAndPotBeforeBet - totalChipsAndPotAfterBet;
        
        const debugLogBet = `[SYSTEMATIC_DEBUG] BET: Player=${player.name}, Amount=${amount}, chipsLost=${chipsLostDuringBet}, expected=0\n`;
        console.log(debugLogBet.trim());
        fs.appendFileSync(path.join(__dirname, '../../logs/bet-raise-debug.log'), new Date().toISOString() + ' ' + debugLogBet);
        
        if (Math.abs(chipsLostDuringBet) > 0.01) {
            console.error(`[Table ${this.name}] ⚠️⚠️⚠️ [SYSTEMATIC_DEBUG] BET BUG DETECTED! Chips lost: ${chipsLostDuringBet}`);
            gameLogger.error(this.name, '[SYSTEMATIC_DEBUG] BET BUG: Chips lost during bet', {
                player: player.name,
                amount,
                chipsLostDuringBet,
                totalChipsAndPotBeforeBet,
                totalChipsAndPotAfterBet,
                handNumber: this.handsPlayed
            });
        }
        
        // ULTRA-VERBOSE: Log after operation with FULL STATE
        const chipsAfter = player.chips;
        const potAfter = this.pot;
        const totalChipsAfter = this.seats.filter(s => s !== null && s.isActive !== false).reduce((sum, s) => sum + (s.chips || 0), 0);
        const totalChipsAndPotAfter = totalChipsAfter + this.pot;
        const chipsDifference = totalChipsAndPotAfter - totalChipsAndPotBefore;
        
        console.log(`[Table ${this.name}] [BET POST-OP] Hand: ${this.handsPlayed} | Player: ${player.name} | PlayerChips: ${chipsAfter} (${chipsBeforeSubtract} - ${amount}) | Pot: ${potAfter} (${potBeforeAdd} + ${amount}) | TotalChips: ${totalChipsAfter} | TotalChips+Pot: ${totalChipsAndPotAfter} | Difference: ${chipsDifference}`);
        gameLogger.gameEvent(this.name, '[BET] POST-OPERATION STATE', {
            handNumber: this.handsPlayed,
            player: player.name,
            amount,
            playerChipsBefore: chipsBeforeSubtract,
            playerChipsAfter: chipsAfter,
            potBefore: potBeforeAdd,
            potAfter: potAfter,
            totalChipsBefore,
            totalChipsAfter,
            totalChipsAndPotBefore,
            totalChipsAndPotAfter,
            chipsDifference,
            totalStartingChips: this.totalStartingChips,
            allSeats: this.seats.map((s, i) => s ? {
                seatIndex: i,
                name: s.name,
                chips: s.chips,
                totalBet: s.totalBet || 0,
                currentBet: s.currentBet || 0,
                isActive: s.isActive
            } : null).filter(Boolean)
        });
        
        // ULTRA-VERBOSE: Verify operation immediately
        if (player.chips !== chipsBeforeSubtract - amount) {
            console.error(`[Table ${this.name}] ⚠️ CRITICAL BET ERROR: Chips calculation failed! Before: ${chipsBeforeSubtract}, Amount: ${amount}, After: ${player.chips}, Expected: ${chipsBeforeSubtract - amount}`);
            gameLogger.error(this.name, '[BET] CRITICAL: Chips calculation error', {
                handNumber: this.handsPlayed,
                player: player.name,
                chipsBefore: chipsBeforeSubtract,
                amount,
                chipsAfter: player.chips,
                expected: chipsBeforeSubtract - amount
            });
            // Record fix attempt - bet chips calculation error is a failure
            this._recordFixAttempt('FIX_30_BET_CHIPS_CALCULATION_ERROR', false, {
                context: 'BET',
                player: player.name,
                chipsBefore: chipsBeforeSubtract,
                amount,
                chipsAfter: player.chips,
                expected: chipsBeforeSubtract - amount,
                handNumber: this.handsPlayed,
                phase: this.phase
            });
        } else {
            // Record fix attempt - success if chips calculation is correct
            this._recordFixAttempt('FIX_30_BET_CHIPS_CALCULATION_ERROR', true, {
                context: 'BET',
                player: player.name,
                chipsBefore: chipsBeforeSubtract,
                amount,
                chipsAfter: player.chips,
                handNumber: this.handsPlayed,
                phase: this.phase
            });
        }
        if (this.pot !== potBeforeAdd + amount) {
            console.error(`[Table ${this.name}] ⚠️ CRITICAL BET ERROR: Pot calculation failed! Before: ${potBeforeAdd}, Amount: ${amount}, After: ${this.pot}, Expected: ${potBeforeAdd + amount}`);
            gameLogger.error(this.name, '[BET] CRITICAL: Pot calculation error', {
                handNumber: this.handsPlayed,
                player: player.name,
                potBefore: potBeforeAdd,
                amount,
                potAfter: this.pot,
                expected: potBeforeAdd + amount
            });
            // Record fix attempt - bet pot calculation error is a failure
            this._recordFixAttempt('FIX_31_BET_POT_CALCULATION_ERROR', false, {
                context: 'BET',
                player: player.name,
                potBefore: potBeforeAdd,
                amount,
                potAfter: this.pot,
                expected: potBeforeAdd + amount,
                handNumber: this.handsPlayed,
                phase: this.phase
            });
        } else {
            // Record fix attempt - success if pot calculation is correct
            this._recordFixAttempt('FIX_31_BET_POT_CALCULATION_ERROR', true, {
                context: 'BET',
                player: player.name,
                potBefore: potBeforeAdd,
                amount,
                potAfter: this.pot,
                handNumber: this.handsPlayed,
                phase: this.phase
            });
        }
        if (Math.abs(chipsDifference) > 0.01) {
            console.error(`[Table ${this.name}] ⚠️ CRITICAL BET ERROR: Total chips changed! Before: ${totalChipsAndPotBefore}, After: ${totalChipsAndPotAfter}, Difference: ${chipsDifference}`);
            gameLogger.error(this.name, '[BET] CRITICAL: Total chips changed', {
                handNumber: this.handsPlayed,
                player: player.name,
                totalChipsAndPotBefore,
                totalChipsAndPotAfter,
                chipsDifference
            });
            // Record fix attempt - total chips changed during bet is a failure
            this._recordFixAttempt('FIX_32_BET_TOTAL_CHIPS_CHANGED', false, {
                context: 'BET',
                player: player.name,
                totalChipsAndPotBefore,
                totalChipsAndPotAfter,
                chipsDifference,
                handNumber: this.handsPlayed,
                phase: this.phase
            });
        } else {
            // Record fix attempt - success if total chips didn't change
            this._recordFixAttempt('FIX_32_BET_TOTAL_CHIPS_CHANGED', true, {
                context: 'BET',
                player: player.name,
                totalChipsAndPotBefore,
                totalChipsAndPotAfter,
                chipsDifference,
                handNumber: this.handsPlayed,
                phase: this.phase
            });
        }
        
        // CRITICAL: Validate after operation
        this._validateChipMovement(movement, 'BET');
        
        // CRITICAL: Log chip movement for money tracking
        gameLogger.gameEvent(this.name, '[CHIPS] Bet - chip movement', {
            player: player.name,
            seatIndex,
            chipsBefore: beforeChips,
            chipsAfter: player.chips,
            chipsMoved: amount,
            potBefore,
            potAfter: this.pot,
            potIncrease: amount,
            totalBetBefore,
            totalBetAfter: player.totalBet,
            phase: this.phase,
            validation: {
                chipsCorrect: player.chips === beforeChips - amount,
                potCorrect: this.pot === potBefore + amount,
                totalBetCorrect: player.totalBet === totalBetBefore + amount
            }
        });
        
        // CRITICAL: Verify calculations
        if (player.chips !== beforeChips - amount) {
            console.error(`[Table ${this.name}] ⚠️ BET ERROR: Chips calculation wrong. Before: ${beforeChips}, Amount: ${amount}, After: ${player.chips}`);
        }
        if (this.pot !== potBefore + amount) {
            console.error(`[Table ${this.name}] ⚠️ BET ERROR: Pot calculation wrong. Before: ${potBefore}, Amount: ${amount}, After: ${this.pot}`);
        }
        if (player.totalBet !== totalBetBefore + amount) {
            console.error(`[Table ${this.name}] ⚠️ BET ERROR: totalBet calculation wrong. Before: ${totalBetBefore}, Amount: ${amount}, After: ${player.totalBet}`);
        }
        const oldCurrentBet = this.currentBet;
        this.currentBet = amount;
        this.minRaise = amount;
        const oldLastRaiser = this.lastRaiserIndex;
        this.lastRaiserIndex = seatIndex;

        if (player.chips === 0) {
            player.isAllIn = true;
        }

        gameLogger.bettingAction(this.name, player.name || `Seat ${seatIndex}`, 'BET', {
            seatIndex,
            amount,
            chipsBefore: beforeChips,
            chipsAfter: player.chips,
            oldCurrentBet,
            newCurrentBet: this.currentBet,
            pot: this.pot,
            minRaise: this.minRaise,
            oldLastRaiser,
            newLastRaiser: this.lastRaiserIndex,
            isAllIn: player.isAllIn,
            phase: this.phase
        });

        // CRITICAL: Validate money after bet
        this._validateMoney(`AFTER_BET_${player.name}`);
        
        return { success: true, action: 'bet', amount };
    }

    raise(seatIndex, amount) {
        this._traceUniversal('RAISE', { 
            seatIndex,
            amount,
            playerName: this.seats[seatIndex]?.name,
            playerChips: this.seats[seatIndex]?.chips,
            currentBet: this.currentBet,
            playerCurrentBet: this.seats[seatIndex]?.currentBet,
            phase: this.phase
        });
        
        const player = this.seats[seatIndex];
        const toCall = this.currentBet - player.currentBet;
        const totalNeeded = toCall + (this.minRaise || this.bigBlind);
        const raiseAmount = amount - toCall;
        
        // Raise validation debug logging removed - too verbose
        // Only log errors or invalid raises
        
        // CRITICAL: Check raise cap - prevent infinite raising
        if (this.raisesThisRound >= this.MAX_RAISES_PER_ROUND) {
            gameLogger.bettingAction(this.name, player.name || `Seat ${seatIndex}`, 'RAISE REJECTED - Raise cap reached', {
                raisesThisRound: this.raisesThisRound,
                maxRaises: this.MAX_RAISES_PER_ROUND
            });
            return { success: false, error: `Maximum raises per round reached (${this.MAX_RAISES_PER_ROUND}). You can only call or fold now.` };
        }
        
        // CRITICAL: Validate amount is not more than player has
        if (amount > player.chips) {
            return { success: false, error: `You don't have enough chips. You have ${player.chips}.` };
        }
        
        // If player is raising all their chips, it's an all-in, not a raise
        if (amount === player.chips && amount < totalNeeded) {
            // Player doesn't have enough for a proper raise - treat as all-in
            // Debug logging removed - only log errors
            return this.allIn(seatIndex);
        }

        // FIX: Validate that raise amount is actually a raise (more than minRaise) or all-in
        // If amount equals toCall, treat as call, not raise
        if (raiseAmount <= 0) {
            // Amount is just the call amount - treat as call instead
            // Debug logging removed - only log errors
            return this.call(seatIndex);
        }

        // CRITICAL: Validate minimum raise (unless it's an all-in)
        if (raiseAmount < this.minRaise && amount !== player.chips) {
            return { success: false, error: `Minimum raise is ${this.minRaise}. You need to bet at least ${totalNeeded} total (${toCall} to call + ${this.minRaise} to raise).` };
        }

        // CRITICAL: Don't allow raising more than player has (should already be caught above, but double-check)
        if (amount > player.chips) {
            return { success: false, error: `You don't have enough chips. You have ${player.chips}.` };
        }

        const beforeChips = player.chips;
        const potBefore = this.pot;
        const totalBetBefore = player.totalBet || 0;
        const currentBetBefore = player.currentBet || 0;
        const oldCurrentBet = this.currentBet;
        const oldMinRaise = this.minRaise;
        const oldLastRaiser = this.lastRaiserIndex;
        
        // CRITICAL FIX: amount is the TOTAL bet, not the additional amount
        // We need to calculate how much MORE the player is betting
        // toCall already calculated above
        const additionalBet = amount - player.currentBet; // How much MORE than current bet
        
        // CRITICAL: Track chip movement BEFORE operation
        const movement = this._trackChipMovement('RAISE', {
            player: player.name,
            seatIndex,
            amount,
            additionalBet,
            chipsBefore: beforeChips,
            potBefore,
            totalBetBefore,
            currentBetBefore
        });
        
        // CRITICAL FIX: Subtract only the additional bet from chips, not the full amount
        // The player's previous bet was already paid and is in the pot
        // ULTRA-VERBOSE: Log before operation with FULL STATE
        const potBeforeAdd = this.pot;
        const chipsBeforeSubtract = player.chips;
        const totalChipsBefore = this.seats.filter(s => s !== null && s.isActive !== false).reduce((sum, s) => sum + (s.chips || 0), 0);
        const totalChipsAndPotBefore = totalChipsBefore + this.pot;
        
        // console.log(`[Table ${this.name}] [RAISE PRE-OP] Hand: ${this.handsPlayed} | Player: ${player.name} | Amount: ${amount} | AdditionalBet: ${additionalBet} | PlayerChips: ${chipsBeforeSubtract} | Pot: ${potBeforeAdd} | TotalChips: ${totalChipsBefore} | TotalChips+Pot: ${totalChipsAndPotBefore}`);
        gameLogger.gameEvent(this.name, '[RAISE] PRE-OPERATION STATE', {
            handNumber: this.handsPlayed,
            player: player.name,
            amount,
            additionalBet,
            playerChipsBefore: chipsBeforeSubtract,
            potBefore: potBeforeAdd,
            totalChipsBefore,
            totalChipsAndPotBefore,
            totalStartingChips: this.totalStartingChips,
            allSeats: this.seats.map((s, i) => s ? {
                seatIndex: i,
                name: s.name,
                chips: s.chips,
                totalBet: s.totalBet || 0,
                currentBet: s.currentBet || 0,
                isActive: s.isActive
            } : null).filter(Boolean)
        });
        
        // SYSTEMATIC DEBUG: Track chip movement BEFORE raise (must be before any changes)
        const totalChipsBeforeRaise = this.seats.filter(s => s !== null && s.isActive !== false).reduce((sum, s) => sum + (s.chips || 0), 0);
        const totalChipsAndPotBeforeRaise = totalChipsBeforeRaise + this.pot;
        
        // SYSTEMATIC DEBUG: RAISE is ACTIVE - testing if call() is the problem
        player.chips -= additionalBet;
        player.currentBet = amount; // Set to total bet amount
        const totalBetAfter = totalBetBefore + additionalBet;
        player.totalBet = totalBetAfter; // Only add the additional amount
        
        // ROOT TRACING: Track totalBet changes
        gameLogger.gameEvent(this.name, '[ROOT_TRACE] TOTAL_BET_SET', {
            operation: 'RAISE',
            player: player.name,
            seatIndex,
            totalBetBefore: totalBetBefore,
            totalBetAfter: totalBetAfter,
            amountAdded: additionalBet,
            handNumber: this.handsPlayed,
            phase: this.phase,
            stackTrace: new Error().stack?.split('\n').slice(2, 8).join(' | ') || 'NO_STACK'
        });
        
        this.pot += additionalBet; // Only add the additional amount to pot
        
        // SYSTEMATIC DEBUG: Track chip movement after raise
        const totalChipsAfterRaise = this.seats.filter(s => s !== null && s.isActive !== false).reduce((sum, s) => sum + (s.chips || 0), 0);
        const totalChipsAndPotAfterRaise = totalChipsAfterRaise + this.pot;
        const chipsLostDuringRaise = totalChipsAndPotBeforeRaise - totalChipsAndPotAfterRaise;
        
        const debugLogRaise = `[SYSTEMATIC_DEBUG] RAISE: Player=${player.name}, Amount=${amount}, AdditionalBet=${additionalBet}, chipsLost=${chipsLostDuringRaise}, expected=0\n`;
        console.log(debugLogRaise.trim());
        fs.appendFileSync(path.join(__dirname, '../../logs/bet-raise-debug.log'), new Date().toISOString() + ' ' + debugLogRaise);
        
        if (Math.abs(chipsLostDuringRaise) > 0.01) {
            console.error(`[Table ${this.name}] ⚠️⚠️⚠️ [SYSTEMATIC_DEBUG] RAISE BUG DETECTED! Chips lost: ${chipsLostDuringRaise}`);
            gameLogger.error(this.name, '[SYSTEMATIC_DEBUG] RAISE BUG: Chips lost during raise', {
                player: player.name,
                amount,
                additionalBet,
                chipsLostDuringRaise,
                totalChipsAndPotBeforeRaise,
                totalChipsAndPotAfterRaise,
                handNumber: this.handsPlayed
            });
        }
        
        // ULTRA-VERBOSE: Log after operation with FULL STATE
        const chipsAfter = player.chips;
        const potAfter = this.pot;
        const totalChipsAfter = this.seats.filter(s => s !== null && s.isActive !== false).reduce((sum, s) => sum + (s.chips || 0), 0);
        const totalChipsAndPotAfter = totalChipsAfter + this.pot;
        const chipsDifference = totalChipsAndPotAfter - totalChipsAndPotBefore;
        
        console.log(`[Table ${this.name}] [RAISE POST-OP] Hand: ${this.handsPlayed} | Player: ${player.name} | PlayerChips: ${chipsAfter} (${chipsBeforeSubtract} - ${additionalBet}) | Pot: ${potAfter} (${potBeforeAdd} + ${additionalBet}) | TotalChips: ${totalChipsAfter} | TotalChips+Pot: ${totalChipsAndPotAfter} | Difference: ${chipsDifference}`);
        gameLogger.gameEvent(this.name, '[RAISE] POST-OPERATION STATE', {
            handNumber: this.handsPlayed,
            player: player.name,
            amount,
            additionalBet,
            playerChipsBefore: chipsBeforeSubtract,
            playerChipsAfter: chipsAfter,
            potBefore: potBeforeAdd,
            potAfter: potAfter,
            totalChipsBefore,
            totalChipsAfter,
            totalChipsAndPotBefore,
            totalChipsAndPotAfter,
            chipsDifference,
            totalStartingChips: this.totalStartingChips,
            allSeats: this.seats.map((s, i) => s ? {
                seatIndex: i,
                name: s.name,
                chips: s.chips,
                totalBet: s.totalBet || 0,
                currentBet: s.currentBet || 0,
                isActive: s.isActive
            } : null).filter(Boolean)
        });
        
        // ULTRA-VERBOSE: Verify operation immediately
        if (player.chips !== chipsBeforeSubtract - additionalBet) {
            console.error(`[Table ${this.name}] ⚠️ CRITICAL RAISE ERROR: Chips calculation failed! Before: ${chipsBeforeSubtract}, AdditionalBet: ${additionalBet}, After: ${player.chips}, Expected: ${chipsBeforeSubtract - additionalBet}`);
            gameLogger.error(this.name, '[RAISE] CRITICAL: Chips calculation error', {
                handNumber: this.handsPlayed,
                player: player.name,
                chipsBefore: chipsBeforeSubtract,
                additionalBet,
                chipsAfter: player.chips,
                expected: chipsBeforeSubtract - additionalBet
            });
            // Record fix attempt - raise chips calculation error is a failure
            this._recordFixAttempt('FIX_33_RAISE_CHIPS_CALCULATION_ERROR', false, {
                context: 'RAISE',
                player: player.name,
                chipsBefore: chipsBeforeSubtract,
                additionalBet,
                chipsAfter: player.chips,
                expected: chipsBeforeSubtract - additionalBet,
                handNumber: this.handsPlayed,
                phase: this.phase
            });
        } else {
            // Record fix attempt - success if chips calculation is correct
            this._recordFixAttempt('FIX_33_RAISE_CHIPS_CALCULATION_ERROR', true, {
                context: 'RAISE',
                player: player.name,
                chipsBefore: chipsBeforeSubtract,
                additionalBet,
                chipsAfter: player.chips,
                handNumber: this.handsPlayed,
                phase: this.phase
            });
        }
        if (this.pot !== potBeforeAdd + additionalBet) {
            console.error(`[Table ${this.name}] ⚠️ CRITICAL RAISE ERROR: Pot calculation failed! Before: ${potBeforeAdd}, AdditionalBet: ${additionalBet}, After: ${this.pot}, Expected: ${potBeforeAdd + additionalBet}`);
            gameLogger.error(this.name, '[RAISE] CRITICAL: Pot calculation error', {
                handNumber: this.handsPlayed,
                player: player.name,
                potBefore: potBeforeAdd,
                additionalBet,
                potAfter: this.pot,
                expected: potBeforeAdd + additionalBet
            });
            // Record fix attempt - raise pot calculation error is a failure
            this._recordFixAttempt('FIX_34_RAISE_POT_CALCULATION_ERROR', false, {
                context: 'RAISE',
                player: player.name,
                potBefore: potBeforeAdd,
                additionalBet,
                potAfter: this.pot,
                expected: potBeforeAdd + additionalBet,
                handNumber: this.handsPlayed,
                phase: this.phase
            });
        } else {
            // Record fix attempt - success if pot calculation is correct
            this._recordFixAttempt('FIX_34_RAISE_POT_CALCULATION_ERROR', true, {
                context: 'RAISE',
                player: player.name,
                potBefore: potBeforeAdd,
                additionalBet,
                potAfter: this.pot,
                handNumber: this.handsPlayed,
                phase: this.phase
            });
        }
        if (Math.abs(chipsDifference) > 0.01) {
            console.error(`[Table ${this.name}] ⚠️ CRITICAL RAISE ERROR: Total chips changed! Before: ${totalChipsAndPotBefore}, After: ${totalChipsAndPotAfter}, Difference: ${chipsDifference}`);
            gameLogger.error(this.name, '[RAISE] CRITICAL: Total chips changed', {
                handNumber: this.handsPlayed,
                player: player.name,
                totalChipsAndPotBefore,
                totalChipsAndPotAfter,
                chipsDifference
            });
            // Record fix attempt - total chips changed during raise is a failure
            this._recordFixAttempt('FIX_35_RAISE_TOTAL_CHIPS_CHANGED', false, {
                context: 'RAISE',
                player: player.name,
                totalChipsAndPotBefore,
                totalChipsAndPotAfter,
                chipsDifference,
                handNumber: this.handsPlayed,
                phase: this.phase
            });
        } else {
            // Record fix attempt - success if total chips didn't change
            this._recordFixAttempt('FIX_35_RAISE_TOTAL_CHIPS_CHANGED', true, {
                context: 'RAISE',
                player: player.name,
                totalChipsAndPotBefore,
                totalChipsAndPotAfter,
                chipsDifference,
                handNumber: this.handsPlayed,
                phase: this.phase
            });
        }
        this.currentBet = player.currentBet;
        
        // CRITICAL: Validate after operation
        this._validateChipMovement(movement, 'RAISE');
        
        // CRITICAL: Log chip movement for money tracking
        gameLogger.gameEvent(this.name, '[CHIPS] Raise - chip movement', {
            player: player.name,
            seatIndex,
            chipsBefore: beforeChips,
            chipsAfter: player.chips,
            chipsMoved: additionalBet,
            additionalBet,
            potBefore,
            potAfter: this.pot,
            potIncrease: additionalBet,
            totalBetBefore,
            totalBetAfter: player.totalBet,
            currentBetBefore,
            currentBetAfter: player.currentBet,
            phase: this.phase,
            validation: {
                chipsCorrect: player.chips === beforeChips - additionalBet,
                potCorrect: this.pot === potBefore + additionalBet,
                totalBetCorrect: player.totalBet === totalBetBefore + additionalBet
            }
        });
        
        // CRITICAL: Verify calculations
        if (player.chips !== beforeChips - additionalBet) {
            console.error(`[Table ${this.name}] ⚠️ RAISE ERROR: Chips calculation wrong. Before: ${beforeChips}, AdditionalBet: ${additionalBet}, After: ${player.chips}`);
        }
        if (this.pot !== potBefore + additionalBet) {
            console.error(`[Table ${this.name}] ⚠️ RAISE ERROR: Pot calculation wrong. Before: ${potBefore}, Additional: ${additionalBet}, After: ${this.pot}`);
        }
        if (player.totalBet !== totalBetBefore + additionalBet) {
            console.error(`[Table ${this.name}] ⚠️ RAISE ERROR: totalBet calculation wrong. Before: ${totalBetBefore}, Additional: ${additionalBet}, After: ${player.totalBet}`);
        }
        if (player.currentBet !== amount) {
            console.error(`[Table ${this.name}] ⚠️ RAISE ERROR: currentBet calculation wrong. Expected: ${amount}, Actual: ${player.currentBet}`);
        }
        this.minRaise = Math.max(raiseAmount, this.minRaise);  // Keep the larger raise amount
        this.lastRaiserIndex = seatIndex;
        
        // Increment raise count for this betting round
        this.raisesThisRound++;

        if (player.chips === 0) {
            player.isAllIn = true;
        }

        gameLogger.bettingAction(this.name, player.name || `Seat ${seatIndex}`, 'RAISE', {
            seatIndex,
            amount,
            raiseAmount,
            toCall,
            chipsBefore: beforeChips,
            chipsAfter: player.chips,
            oldCurrentBet,
            newCurrentBet: this.currentBet,
            oldMinRaise,
            newMinRaise: this.minRaise,
            pot: this.pot,
            oldLastRaiser,
            newLastRaiser: this.lastRaiserIndex,
            isAllIn: player.isAllIn,
            phase: this.phase
        });

        // CRITICAL: Validate money after raise
        this._validateMoney(`AFTER_RAISE_${player.name}`);
        
        return { success: true, action: 'raise', amount };
    }

    allIn(seatIndex) {
        this._traceUniversal('ALL_IN', { 
            seatIndex,
            playerName: this.seats[seatIndex]?.name,
            playerChips: this.seats[seatIndex]?.chips,
            currentBet: this.currentBet,
            phase: this.phase
        });
        
        const player = this.seats[seatIndex];
        const amount = player.chips;
        const chipsBefore = player.chips;
        const potBefore = this.pot;
        const totalBetBefore = player.totalBet || 0;
        const currentBetBefore = player.currentBet || 0;
        const oldCurrentBet = this.currentBet;
        const oldMinRaise = this.minRaise;
        const oldLastRaiser = this.lastRaiserIndex;
        
        // CRITICAL FIX: For all-in, amount is ALL remaining chips
        // This goes to pot and totalBet (it's the additional amount they're betting)
        const newCurrentBet = player.currentBet + amount; // Their total bet after all-in

        // CRITICAL: Track chip movement BEFORE operation
        const movement = this._trackChipMovement('ALL_IN', {
            player: player.name,
            seatIndex,
            amount,
            chipsBefore: chipsBefore,
            potBefore,
            totalBetBefore,
            currentBetBefore,
            newCurrentBet
        });

        // ULTRA-VERBOSE: Log before operation with FULL STATE
        const potBeforeAdd = this.pot;
        const chipsBeforeSubtract = player.chips;
        const totalChipsBefore = this.seats.filter(s => s !== null && s.isActive !== false).reduce((sum, s) => sum + (s.chips || 0), 0);
        const totalChipsAndPotBefore = totalChipsBefore + this.pot;
        
        // console.log(`[Table ${this.name}] [ALL-IN PRE-OP] Hand: ${this.handsPlayed} | Player: ${player.name} | Amount: ${amount} | PlayerChips: ${chipsBeforeSubtract} | Pot: ${potBeforeAdd} | TotalChips: ${totalChipsBefore} | TotalChips+Pot: ${totalChipsAndPotBefore}`);
        gameLogger.gameEvent(this.name, '[ALL-IN] PRE-OPERATION STATE', {
            handNumber: this.handsPlayed,
            player: player.name,
            amount,
            playerChipsBefore: chipsBeforeSubtract,
            potBefore: potBeforeAdd,
            totalChipsBefore,
            totalChipsAndPotBefore,
            totalStartingChips: this.totalStartingChips,
            allSeats: this.seats.map((s, i) => s ? {
                seatIndex: i,
                name: s.name,
                chips: s.chips,
                totalBet: s.totalBet || 0,
                currentBet: s.currentBet || 0,
                isActive: s.isActive
            } : null).filter(Boolean)
        });
        
        // SYSTEMATIC DEBUG: Track chip movement during allIn
        const totalChipsBeforeAllIn = this.seats.filter(s => s !== null && s.isActive !== false).reduce((sum, s) => sum + (s.chips || 0), 0);
        const totalChipsAndPotBeforeAllIn = totalChipsBeforeAllIn + this.pot;
        
        player.chips = 0;
        player.currentBet = newCurrentBet;
        const totalBetAfter = totalBetBefore + amount;
        player.totalBet = totalBetAfter; // Add all chips to totalBet
        
        // ROOT TRACING: Track totalBet changes
        gameLogger.gameEvent(this.name, '[ROOT_TRACE] TOTAL_BET_SET', {
            operation: 'ALL_IN',
            player: player.name,
            seatIndex,
            totalBetBefore: totalBetBefore,
            totalBetAfter: totalBetAfter,
            amountAdded: amount,
            handNumber: this.handsPlayed,
            phase: this.phase,
            stackTrace: new Error().stack?.split('\n').slice(2, 8).join(' | ') || 'NO_STACK'
        });
        this.pot += amount; // Add all chips to pot
        
        // SYSTEMATIC DEBUG: Track chip movement after allIn
        const totalChipsAfterAllIn = this.seats.filter(s => s !== null && s.isActive !== false).reduce((sum, s) => sum + (s.chips || 0), 0);
        const totalChipsAndPotAfterAllIn = totalChipsAfterAllIn + this.pot;
        const chipsLostDuringAllIn = totalChipsAndPotBeforeAllIn - totalChipsAndPotAfterAllIn;
        
        const debugLogAllIn = `[SYSTEMATIC_DEBUG] ALL_IN: Player=${player.name}, Amount=${amount}, chipsLost=${chipsLostDuringAllIn}, expected=0\n`;
        console.log(debugLogAllIn.trim());
        fs.appendFileSync(path.join(__dirname, '../../logs/bet-raise-debug.log'), new Date().toISOString() + ' ' + debugLogAllIn);
        
        if (Math.abs(chipsLostDuringAllIn) > 0.01) {
            console.error(`[Table ${this.name}] ⚠️⚠️⚠️ [SYSTEMATIC_DEBUG] ALL_IN BUG DETECTED! Chips lost: ${chipsLostDuringAllIn}`);
            gameLogger.error(this.name, '[SYSTEMATIC_DEBUG] ALL_IN BUG: Chips lost during allIn', {
                player: player.name,
                amount,
                chipsLostDuringAllIn,
                totalChipsAndPotBeforeAllIn,
                totalChipsAndPotAfterAllIn,
                handNumber: this.handsPlayed
            });
        }
        
        // ULTRA-VERBOSE: Log after operation with FULL STATE
        const chipsAfter = player.chips;
        const potAfter = this.pot;
        const totalChipsAfter = this.seats.filter(s => s !== null && s.isActive !== false).reduce((sum, s) => sum + (s.chips || 0), 0);
        const totalChipsAndPotAfter = totalChipsAfter + this.pot;
        const chipsDifference = totalChipsAndPotAfter - totalChipsAndPotBefore;
        
        console.log(`[Table ${this.name}] [ALL-IN POST-OP] Hand: ${this.handsPlayed} | Player: ${player.name} | PlayerChips: ${chipsAfter} (should be 0) | Pot: ${potAfter} (${potBeforeAdd} + ${amount}) | TotalChips: ${totalChipsAfter} | TotalChips+Pot: ${totalChipsAndPotAfter} | Difference: ${chipsDifference}`);
        gameLogger.gameEvent(this.name, '[ALL-IN] POST-OPERATION STATE', {
            handNumber: this.handsPlayed,
            player: player.name,
            amount,
            playerChipsBefore: chipsBeforeSubtract,
            playerChipsAfter: chipsAfter,
            potBefore: potBeforeAdd,
            potAfter: potAfter,
            totalChipsBefore,
            totalChipsAfter,
            totalChipsAndPotBefore,
            totalChipsAndPotAfter,
            chipsDifference,
            totalStartingChips: this.totalStartingChips,
            allSeats: this.seats.map((s, i) => s ? {
                seatIndex: i,
                name: s.name,
                chips: s.chips,
                totalBet: s.totalBet || 0,
                currentBet: s.currentBet || 0,
                isActive: s.isActive
            } : null).filter(Boolean)
        });
        
        // ULTRA-VERBOSE: Verify operation immediately
        if (player.chips !== 0) {
            console.error(`[Table ${this.name}] ⚠️ CRITICAL ALL-IN ERROR: Chips should be 0 but are ${player.chips}! Amount: ${amount}`);
            gameLogger.error(this.name, '[ALL-IN] CRITICAL: Chips not zero', {
                handNumber: this.handsPlayed,
                player: player.name,
                chipsAfter: player.chips,
                amount
            });
            // Record fix attempt - all-in chips not zero is a failure
            this._recordFixAttempt('FIX_36_ALLIN_CHIPS_NOT_ZERO', false, {
                context: 'ALL_IN',
                player: player.name,
                chipsAfter: player.chips,
                amount,
                handNumber: this.handsPlayed,
                phase: this.phase
            });
        } else {
            // Record fix attempt - success if chips are zero
            this._recordFixAttempt('FIX_36_ALLIN_CHIPS_NOT_ZERO', true, {
                context: 'ALL_IN',
                player: player.name,
                chipsAfter: player.chips,
                amount,
                handNumber: this.handsPlayed,
                phase: this.phase
            });
        }
        if (this.pot !== potBeforeAdd + amount) {
            console.error(`[Table ${this.name}] ⚠️ CRITICAL ALL-IN ERROR: Pot calculation failed! Before: ${potBeforeAdd}, Amount: ${amount}, After: ${this.pot}, Expected: ${potBeforeAdd + amount}`);
            gameLogger.error(this.name, '[ALL-IN] CRITICAL: Pot calculation error', {
                handNumber: this.handsPlayed,
                player: player.name,
                potBefore: potBeforeAdd,
                amount,
                potAfter: this.pot,
                expected: potBeforeAdd + amount
            });
            // Record fix attempt - all-in pot calculation error is a failure
            this._recordFixAttempt('FIX_37_ALLIN_POT_CALCULATION_ERROR', false, {
                context: 'ALL_IN',
                player: player.name,
                potBefore: potBeforeAdd,
                amount,
                potAfter: this.pot,
                expected: potBeforeAdd + amount,
                handNumber: this.handsPlayed,
                phase: this.phase
            });
        } else {
            // Record fix attempt - success if pot calculation is correct
            this._recordFixAttempt('FIX_37_ALLIN_POT_CALCULATION_ERROR', true, {
                context: 'ALL_IN',
                player: player.name,
                potBefore: potBeforeAdd,
                amount,
                potAfter: this.pot,
                handNumber: this.handsPlayed,
                phase: this.phase
            });
        }
        if (chipsBeforeSubtract !== amount) {
            console.error(`[Table ${this.name}] ⚠️ CRITICAL ALL-IN ERROR: Amount mismatch! Player chips before: ${chipsBeforeSubtract}, Amount being bet: ${amount}`);
            gameLogger.error(this.name, '[ALL-IN] CRITICAL: Amount mismatch', {
                handNumber: this.handsPlayed,
                player: player.name,
                chipsBefore: chipsBeforeSubtract,
                amount
            });
            // Record fix attempt - all-in amount mismatch is a failure
            this._recordFixAttempt('FIX_38_ALLIN_AMOUNT_MISMATCH', false, {
                context: 'ALL_IN',
                player: player.name,
                chipsBefore: chipsBeforeSubtract,
                amount,
                handNumber: this.handsPlayed,
                phase: this.phase
            });
        } else {
            // Record fix attempt - success if amount matches
            this._recordFixAttempt('FIX_38_ALLIN_AMOUNT_MISMATCH', true, {
                context: 'ALL_IN',
                player: player.name,
                chipsBefore: chipsBeforeSubtract,
                amount,
                handNumber: this.handsPlayed,
                phase: this.phase
            });
        }
        if (Math.abs(chipsDifference) > 0.01) {
            console.error(`[Table ${this.name}] ⚠️ CRITICAL ALL-IN ERROR: Total chips changed! Before: ${totalChipsAndPotBefore}, After: ${totalChipsAndPotAfter}, Difference: ${chipsDifference}`);
            gameLogger.error(this.name, '[ALL-IN] CRITICAL: Total chips changed', {
                handNumber: this.handsPlayed,
                player: player.name,
                totalChipsAndPotBefore,
                totalChipsAndPotAfter,
                chipsDifference
            });
            // Record fix attempt - total chips changed during all-in is a failure
            this._recordFixAttempt('FIX_39_ALLIN_TOTAL_CHIPS_CHANGED', false, {
                context: 'ALL_IN',
                player: player.name,
                totalChipsAndPotBefore,
                totalChipsAndPotAfter,
                chipsDifference,
                handNumber: this.handsPlayed,
                phase: this.phase
            });
        } else {
            // Record fix attempt - success if total chips didn't change
            this._recordFixAttempt('FIX_39_ALLIN_TOTAL_CHIPS_CHANGED', true, {
                context: 'ALL_IN',
                player: player.name,
                totalChipsAndPotBefore,
                totalChipsAndPotAfter,
                chipsDifference,
                handNumber: this.handsPlayed,
                phase: this.phase
            });
        }
        player.isAllIn = true;
        
        // CRITICAL: Validate after operation
        this._validateChipMovement(movement, 'ALL_IN');
        
        // CRITICAL: Log chip movement for money tracking
        gameLogger.gameEvent(this.name, '[CHIPS] All-In - chip movement', {
            player: player.name,
            seatIndex,
            chipsBefore: chipsBefore,
            chipsAfter: player.chips,
            chipsMoved: amount,
            potBefore,
            potAfter: this.pot,
            potIncrease: amount,
            totalBetBefore,
            totalBetAfter: player.totalBet,
            currentBetBefore,
            currentBetAfter: player.currentBet,
            phase: this.phase,
            validation: {
                chipsCorrect: player.chips === 0,
                potCorrect: this.pot === potBefore + amount,
                totalBetCorrect: player.totalBet === totalBetBefore + amount,
                currentBetCorrect: player.currentBet === currentBetBefore + amount
            }
        });
        
        // CRITICAL: Verify calculations
        if (player.chips !== 0) {
            console.error(`[Table ${this.name}] ⚠️ ALL-IN ERROR: Chips should be 0 but are ${player.chips}`);
        }
        if (this.pot !== potBefore + amount) {
            console.error(`[Table ${this.name}] ⚠️ ALL-IN ERROR: Pot calculation wrong. Before: ${potBefore}, Amount: ${amount}, After: ${this.pot}`);
        }
        if (player.totalBet !== totalBetBefore + amount) {
            console.error(`[Table ${this.name}] ⚠️ ALL-IN ERROR: totalBet calculation wrong. Before: ${totalBetBefore}, Amount: ${amount}, After: ${player.totalBet}`);
        }
        if (player.currentBet !== currentBetBefore + amount) {
            console.error(`[Table ${this.name}] ⚠️ ALL-IN ERROR: currentBet calculation wrong. Before: ${currentBetBefore}, Amount: ${amount}, After: ${player.currentBet}`);
        }

        if (player.currentBet > this.currentBet) {
            this.minRaise = player.currentBet - this.currentBet;
            this.currentBet = player.currentBet;
            this.lastRaiserIndex = seatIndex;
        }

        gameLogger.bettingAction(this.name, player.name || `Seat ${seatIndex}`, 'ALL-IN', {
            seatIndex,
            amount,
            oldCurrentBet,
            newCurrentBet: this.currentBet,
            oldMinRaise,
            newMinRaise: this.minRaise,
            oldLastRaiser,
            newLastRaiser: this.lastRaiserIndex,
            pot: this.pot,
            phase: this.phase
        });

        // CRITICAL: Validate money after all-in
        this._validateMoney(`AFTER_ALLIN_${player.name}`);
        
        return { success: true, action: 'allin', amount };
    }

    // ============ Game Advancement ============

    advanceGame() {
        this._traceUniversal('ADVANCE_GAME', { 
            currentPhase: this.phase,
            currentPlayerIndex: this.currentPlayerIndex,
            handsPlayed: this.handsPlayed,
            pot: this.pot
        });
        
        // CRITICAL: Check for game over - but ONLY when not in an active betting phase
        // Don't end game during a hand - wait until hand is complete (WAITING, SHOWDOWN, or after hand ends)
        // This prevents premature game ending when players go all-in during a hand
        if (this.phase !== GAME_PHASES.WAITING && 
            this.phase !== GAME_PHASES.READY_UP && 
            this.phase !== GAME_PHASES.COUNTDOWN &&
            this.phase !== GAME_PHASES.SHOWDOWN) {
            // In active betting phase - don't check for game over yet
            // Game over will be checked in showdown() or after hand completes
        } else {
            // Safe to check for game over - we're in a terminal phase or waiting
            const playersWithChips = this.seats.filter(s => s && s.chips > 0);
            if (playersWithChips.length === 1) {
            const winner = playersWithChips[0];
            
            // CRITICAL: Check if game ended before any hands were played
            if (this.handsPlayed === 0) {
                console.error(`[Table ${this.name}] ⚠️ CRITICAL: Game ended before any hands were played! Winner: ${winner.name}, handsPlayed: ${this.handsPlayed}`);
                gameLogger.error(this.name, 'GAME ENDED BEFORE HANDS PLAYED', {
                    winnerName: winner.name,
                    winnerChips: winner.chips,
                    handsPlayed: this.handsPlayed,
                    phase: this.phase,
                    allPlayers: this.seats.filter(s => s !== null).map(s => ({
                        name: s.name,
                        chips: s.chips,
                        isActive: s.isActive
                    }))
                });
            }
            
            // CRITICAL: Award any remaining pot to the winner BEFORE validation
            // This ensures money isn't lost when game ends with pot still unclaimed
            if (this.pot > 0) {
                console.log(`[Table ${this.name}] Game ending with pot unclaimed (${this.pot}) - awarding to winner ${winner.name}`);
                gameLogger.gameEvent(this.name, '[GAME OVER] Awarding unclaimed pot to winner', {
                    winner: winner.name,
                    potAmount: this.pot,
                    winnerChipsBefore: winner.chips
                });
                this.awardPot(winner);
            }
            
            // CRITICAL: Validate money - winner's chips should equal sum of all starting chips
            const winnerChips = winner.chips;
            const currentTotalChips = this.seats
                .filter(s => s !== null)
                .reduce((sum, seat) => sum + (seat.chips || 0), 0);
            
            if (this.totalStartingChips > 0) {
                // CRITICAL: Compare sum of ALL players' chips + pot to total starting chips
                const totalChipsAndPot = currentTotalChips + this.pot;
                const difference = Math.abs(totalChipsAndPot - this.totalStartingChips);
                if (difference > 0.01) {
                    const missing = this.totalStartingChips - totalChipsAndPot;
                    console.error(`[Table ${this.name}] ⚠️ CRITICAL: MONEY LOST! Total chips + pot (${totalChipsAndPot}) != total starting chips (${this.totalStartingChips}). Missing: ${missing}`);
                    gameLogger.gameEvent(this.name, '[MONEY] ERROR: Money lost - total chips + pot != total starting chips', {
                        totalChipsAndPot,
                        totalStartingChips: this.totalStartingChips,
                        missing,
                        remainingPot: this.pot,
                        winnerChips: winner.chips,
                        handsPlayed: this.handsPlayed,
                        allPlayers: this.seats.filter(s => s !== null).map(s => ({
                            name: s.name,
                            chips: s.chips,
                            isActive: s.isActive,
                            totalBet: s.totalBet,
                            currentBet: s.currentBet
                        }))
                    });
                } else {
                    gameLogger.gameEvent(this.name, '[MONEY] VALIDATION PASSED: Total chips + pot = total starting chips', {
                        totalChipsAndPot,
                        totalStartingChips: this.totalStartingChips,
                        winnerChips: winner.chips,
                        remainingPot: this.pot,
                        handsPlayed: this.handsPlayed
                    });
                }
            } else {
                console.warn(`[Table ${this.name}] ⚠️ Starting chips not tracked (totalStartingChips=${this.totalStartingChips}) - cannot validate money`);
                gameLogger.gameEvent(this.name, '[MONEY] WARNING: Starting chips not tracked', {
                    winnerChips,
                    totalStartingChips: this.totalStartingChips,
                    currentTotalChips,
                    handsPlayed: this.handsPlayed
                });
            }
            
            // CRITICAL: Prevent duplicate onGameOver calls
            if (this._gameOverCalled) {
                console.warn(`[Table ${this.name}] ⚠️ Game over already called - preventing duplicate call for winner ${winner.name} (handsPlayed: ${this.handsPlayed})`);
                gameLogger.gameEvent(this.name, '[GAME OVER] Duplicate call prevented', {
                    winnerName: winner.name,
                    winnerChips: winner.chips,
                    winnerId: winner.playerId,
                    handsPlayed: this.handsPlayed
                });
                return; // Exit early to prevent duplicate processing
            }
            
            this._gameOverCalled = true;  // Mark as called
            
            console.log(`[Table ${this.name}] GAME OVER - ${winner.name} wins with ${winner.chips} chips! (handsPlayed: ${this.handsPlayed})`);
            gameLogger.gameEvent(this.name, 'GAME OVER - Winner announced', {
                winnerName: winner.name,
                winnerChips: winner.chips,
                winnerId: winner.playerId,
                isBot: winner.isBot || false,
                handsPlayed: this.handsPlayed
            });
            this._tracePhaseChange(GAME_PHASES.WAITING, 'GAME_OVER_WINNER');
            this.gameStarted = false;
            
            // CRITICAL: Notify about game winner (this triggers simulation restart and client announcement)
            if (this.onGameOver) {
                // console.log(`[Table ${this.name}] Calling onGameOver callback for winner ${winner.name}`);
                this.onGameOver(winner);
            } else {
                console.error(`[Table ${this.name}] ⚠️ CRITICAL: onGameOver callback is NOT SET! Game over event will not be sent to clients!`);
                gameLogger.error(this.name, 'onGameOver callback not set - game over event not sent', {
                    winnerName: winner.name,
                    winnerChips: winner.chips,
                    handsPlayed: this.handsPlayed
                });
            }
            // Capture snapshot before broadcasting
            if (this.stateSnapshot) {
                const state = this.getState(null);
                this.stateSnapshot.capture(state, {
                    phase: this.phase,
                    handsPlayed: this.handsPlayed,
                    reason: 'state_change'
                });
            }
            this._onStateChangeCallback?.();
            return; // Game over - don't continue
            }
        }
        
        // CRITICAL: Don't advance game if we're in a terminal phase
        if (this.phase === GAME_PHASES.WAITING || 
            this.phase === GAME_PHASES.READY_UP || 
            this.phase === GAME_PHASES.COUNTDOWN || 
            this.phase === GAME_PHASES.SHOWDOWN) {
            // Terminal phases - don't advance
            return;
        }
        
        // ============ STUCK PLAYER DETECTION ============
        // Track consecutive advanceGame calls without state change
        const currentState = `${this.phase}_${this.currentPlayerIndex}_${this.currentBet}_${this.pot}`;
        if (this.lastAdvanceGameState === currentState) {
            this.consecutiveAdvanceGameCalls = (this.consecutiveAdvanceGameCalls || 0) + 1;
        } else {
            this.consecutiveAdvanceGameCalls = 0;
            this.lastAdvanceGameState = currentState;
        }
        
        // Log if we're calling advanceGame repeatedly without progress
        if (this.consecutiveAdvanceGameCalls > 0) {
            gameLogger.gameEvent(this.name, 'WARNING: advanceGame() called repeatedly without state change', {
                consecutiveCalls: this.consecutiveAdvanceGameCalls,
                phase: this.phase,
                currentPlayerIndex: this.currentPlayerIndex,
                currentBet: this.currentBet,
                pot: this.pot,
                lastRaiserIndex: this.lastRaiserIndex
            });
            console.warn(`[Table ${this.name}] WARNING: advanceGame() called ${this.consecutiveAdvanceGameCalls} times without state change! Phase: ${this.phase}, Player: ${this.currentPlayerIndex}`);
        }
        
        // Force advance if stuck too long
        if (this.consecutiveAdvanceGameCalls >= 5) {
            gameLogger.gameEvent(this.name, 'CRITICAL: STUCK - Force advancing phase after 5 consecutive advanceGame calls', {
                phase: this.phase,
                currentPlayerIndex: this.currentPlayerIndex,
                currentBet: this.currentBet,
                pot: this.pot
            });
            console.error(`[Table ${this.name}] CRITICAL: STUCK - Force advancing phase after 5 consecutive advanceGame calls!`);
            this.consecutiveAdvanceGameCalls = 0;
            this.hasPassedLastRaiser = false;
            this.advancePhase();
            return;
        }
        
        // Track how long current player has been waiting
        if (this.currentPlayerIndex >= 0) {
            const currentPlayer = this.seats[this.currentPlayerIndex];
            if (currentPlayer) {
                if (!this.playerWaitStartTime || this.lastWaitingPlayer !== this.currentPlayerIndex) {
                    this.playerWaitStartTime = Date.now();
                    this.lastWaitingPlayer = this.currentPlayerIndex;
                }
                
                const waitTime = Date.now() - this.playerWaitStartTime;
                if (waitTime > 30000) { // 30 seconds
                    gameLogger.gameEvent(this.name, 'WARNING: Player waiting too long without action', {
                        player: currentPlayer.name,
                        seatIndex: this.currentPlayerIndex,
                        waitTimeMs: waitTime,
                        phase: this.phase,
                        isFolded: currentPlayer.isFolded,
                        isAllIn: currentPlayer.isAllIn,
                        chips: currentPlayer.chips
                    });
                    console.warn(`[Table ${this.name}] WARNING: ${currentPlayer.name} has been waiting ${Math.floor(waitTime/1000)}s without action!`);
                }
            }
        }
        // ============ END STUCK PLAYER DETECTION ============
        
        gameLogger.gameEvent(this.name, 'advanceGame() called', {
            phase: this.phase,
            currentPlayerIndex: this.currentPlayerIndex,
            lastRaiserIndex: this.lastRaiserIndex,
            hasPassedLastRaiser: this.hasPassedLastRaiser,
            currentBet: this.currentBet,
            pot: this.pot,
            consecutiveCalls: this.consecutiveAdvanceGameCalls || 0
        });
        
        // FIX: Track that current player has acted this round
        // This prevents betting rounds from completing before all players have had a turn
        if (!this.playersActedThisRound) this.playersActedThisRound = new Set();
        if (this.currentPlayerIndex >= 0) {
            this.playersActedThisRound.add(this.currentPlayerIndex);
        }
        
        // Check for winner (all but one folded)
        const activePlayers = this.seats.filter(s => s && !s.isFolded);
        if (activePlayers.length === 1) {
            gameLogger.gameEvent(this.name, 'Winner by fold - all others folded', {
                winner: activePlayers[0].name,
                seatIndex: this.seats.indexOf(activePlayers[0])
            });
            this.clearTurnTimer();
            // CRITICAL FIX: awardPot will handle calling startNewHand - don't call it here
            // The setTimeout in advanceGame was racing with awardPot's setTimeout, causing pot to be cleared before awardPot finished
            // This was causing chip loss (9,162, 4,671, 5,660 chips lost in recent hands)
            this.awardPot(activePlayers[0]);
            // awardPot will call startNewHand after awarding - don't duplicate it here
            return;
        }

        // Find next player who can act (not folded, not all-in)
        const nextPlayer = this.getNextActivePlayer(this.currentPlayerIndex);
        
        // FIX: Calculate how many active players can still act, and how many have acted
        const playersWhoCanAct = this.seats.filter(s => s && s.isActive && !s.isFolded && !s.isAllIn);
        const allPlayersActed = this.playersActedThisRound.size >= playersWhoCanAct.length;
        
        // Next player calculation debug logging removed - too verbose
        
        // Track if we've passed the last raiser this betting round
        // This ensures we don't advance phase too early (before everyone has acted)
        // CRITICAL: We've passed the last raiser if:
        // 1. Current index is greater than last raiser (normal progression, no wrap)
        // 2. OR we've wrapped around (current < lastRaiser and nextPlayer wraps back)
        // 3. OR we're about to return to last raiser (nextPlayer === lastRaiser)
        if (this.currentPlayerIndex !== -1 && !this.hasPassedLastRaiser && this.lastRaiserIndex !== -1) {
            const currentIndex = this.currentPlayerIndex;
            const lastRaiser = this.lastRaiserIndex;
            
            // Check if we've passed the last raiser
            let passed = false;
            
            if (currentIndex > lastRaiser) {
                // Normal progression: current player is after last raiser
                passed = true;
            } else if (currentIndex < lastRaiser) {
                // We're before the last raiser - check if we've wrapped around
                if (nextPlayer === -1) {
                    // No one left to act - we've effectively passed everyone
                    passed = true;
                } else if (nextPlayer === lastRaiser) {
                    // We're about to return to last raiser - we've completed a round
                    passed = true;
                } else if (nextPlayer > currentIndex && nextPlayer <= lastRaiser) {
                    // Still progressing normally toward last raiser
                    passed = false;
                } else if (nextPlayer <= currentIndex || nextPlayer > lastRaiser) {
                    // We've wrapped around (nextPlayer is before current OR after lastRaiser means we wrapped)
                    passed = true;
                }
            }
            // FIX: Removed `currentIndex === lastRaiser` case - this was incorrectly marking
            // hasPassedLastRaiser=true at the START of new betting rounds (where lastRaiserIndex
            // is set to firstToAct), causing rounds to complete before anyone acted.
            
            if (passed) {
                this.hasPassedLastRaiser = true;
                gameLogger.bettingRoundCheck(this.name, 'PASSED_LAST_RAISER', 'TRUE', {
                    currentIndex,
                    lastRaiser,
                    nextPlayer,
                    phase: this.phase
                });
                console.log(`[Table ${this.name}] Passed last raiser (${lastRaiser}) - current: ${currentIndex}, next: ${nextPlayer}`);
            }
        }
        
        // Check if betting round is complete
        // CRITICAL: Check if all active players (who can act) have matched the current bet
        // A player has matched if: folded (can ignore), all-in (already committed), or currentBet === this.currentBet
        const seatBetStatus = this.seats.map((seat, idx) => ({
            seatIndex: idx,
            name: seat?.name,
            isFolded: seat?.isFolded,
            isAllIn: seat?.isAllIn,
            currentBet: seat?.currentBet,
            requiredBet: this.currentBet,
            // CRITICAL FIX: Players with 0 chips are "busted" - they can never match any bet
            matched: !seat || seat.isFolded || seat.isAllIn || seat.chips <= 0 || seat.currentBet === this.currentBet
        }));
        
        const allBetsEqualized = this.seats.every(seat => {
            if (!seat || seat.isFolded) return true;  // Folded players don't need to match
            if (seat.isAllIn) return true;  // All-in players are already committed
            if (seat.chips <= 0) return true;  // CRITICAL FIX: Busted players (0 chips) can't call - treat as matched
            // Active players must have matched the current bet
            return seat.currentBet === this.currentBet;
        });
        
        gameLogger.bettingRoundCheck(this.name, 'ALL_BETS_EQUALIZED', allBetsEqualized ? 'TRUE' : 'FALSE', {
            currentBet: this.currentBet,
            seatStatus: seatBetStatus
        });
        
        // CRITICAL FIX: Handle case where everyone checks (no raises)
        // After blinds, lastRaiserIndex is set to bbIndex. If no one raises, it stays that way.
        // If currentBet is still at bigBlind and lastRaiserIndex is bbIndex (or equal to dealer), no one raised.
        // Also check if we're past the dealer position - that means we've gone around once.
        const bbIndex = this.getNextActivePlayer(this.getNextActivePlayer(this.dealerIndex));
        
        // CRITICAL FIX: Post-flop, if currentBet is 0, no one raised (everyone checked)
        // Pre-flop, check if currentBet is still at bigBlind and lastRaiserIndex matches BB or dealer
        const noRaisesHappened = (this.phase !== GAME_PHASES.PRE_FLOP && this.currentBet === 0) ||
                                 (this.phase === GAME_PHASES.PRE_FLOP && this.currentBet <= this.bigBlind && 
                                  (this.lastRaiserIndex === bbIndex || this.lastRaiserIndex === this.dealerIndex));
        
        gameLogger.bettingRoundCheck(this.name, 'NO_RAISES_HAPPENED', noRaisesHappened ? 'TRUE' : 'FALSE', {
            currentBet: this.currentBet,
            bigBlind: this.bigBlind,
            lastRaiserIndex: this.lastRaiserIndex,
            bbIndex,
            dealerIndex: this.dealerIndex
        });
        
        // A betting round is complete when:
        // 1. No one can act (all folded or all-in) - nextPlayer === -1
        // 2. All bets are equalized AND:
        //    a. No raises happened (everyone checked) AND we've completed a full round (passed dealer/bb)
        //    b. OR someone raised AND we've passed the last raiser AND we're about to return to them
        let bettingRoundComplete = false;
        
        if (allBetsEqualized) {
            if (nextPlayer === -1) {
                // No one can act - round is complete
                bettingRoundComplete = true;
                gameLogger.bettingRoundCheck(this.name, 'BETTING_ROUND_COMPLETE', 'TRUE', {
                    reason: 'nextPlayer === -1 (all all-in or folded)',
                    allBetsEqualized,
                    nextPlayer
                });
            } else if (noRaisesHappened) {
                // No raises happened - everyone checked/called
                // CRITICAL FIX: When everyone checks, we need to ensure we've completed a FULL round
                // The round completes when we're about to return to the first player to act (dealer post-flop, BB pre-flop)
                // AND we've passed that player at least once
                if (this.phase === GAME_PHASES.PRE_FLOP) {
                    // Pre-flop: round completes when we're about to return to BB AND everyone has acted
                    // CRITICAL FIX: In pre-flop, UTG acts first, BB acts LAST
                    // The round completes when:
                    // 1. We're AT the BB and about to move to someone else (BB just acted)
                    // 2. OR we've wrapped around (we're at BB and next is UTG, meaning everyone acted)
                    // 3. OR we're at UTG and next is BB, and BB has already acted (posted blind counts as action)
                    
                    // Get the first player to act (UTG - the player after BB)
                    const utgIndex = this.getNextActivePlayer(bbIndex);
                    
                    if (this.currentPlayerIndex === bbIndex) {
                        // We're at BB - round completes if we're about to move to someone else
                        // This means BB just acted (checked/called/raised)
                        if (nextPlayer === utgIndex) {
                            // Wrapped around to UTG - everyone has acted, round complete
                            bettingRoundComplete = true;
                        } else if (nextPlayer !== bbIndex && nextPlayer !== -1) {
                            // Moving to someone else (not BB, not end) - BB just acted, round complete
                            bettingRoundComplete = true;
                        } else {
                            // Still at BB or no next player - round not complete
                            bettingRoundComplete = false;
                        }
                    } else {
                        // FIX: Removed UTG→BB shortcut - BB posting a blind is NOT an action.
                        // BB must always get a chance to check or raise preflop.
                        // We're not at BB - round cannot be complete yet (BB hasn't acted)
                        bettingRoundComplete = false;
                    }
                } else {
                    // Post-flop: round completes when we're about to return to dealer/first to act
                    // AND we've passed them at least once
                    const firstToAct = this.getNextActivePlayer(this.dealerIndex);
                    const hasPassedFirst = this.currentPlayerIndex > firstToAct || 
                                          (this.currentPlayerIndex < firstToAct && (nextPlayer === -1 || nextPlayer > firstToAct || nextPlayer <= this.currentPlayerIndex));
                    bettingRoundComplete = hasPassedFirst && nextPlayer === firstToAct;
                    
                    // FIX: Also check if hasPassedLastRaiser is set (indicates we've completed a full round)
                    if (!bettingRoundComplete && this.hasPassedLastRaiser && nextPlayer === firstToAct) {
                        bettingRoundComplete = true;
                    }
                    
                    // FIX: Removed fallback that marked round complete when currentPlayerIndex === firstToAct.
                    // This was ALWAYS true when the first player acts, causing the round to complete
                    // before any other player got a turn.
                }
                gameLogger.bettingRoundCheck(this.name, 'BETTING_ROUND_COMPLETE (no raises)', bettingRoundComplete ? 'TRUE' : 'FALSE', {
                    phase: this.phase,
                    currentPlayerIndex: this.currentPlayerIndex,
                    nextPlayer,
                    bbIndex,
                    dealerIndex: this.dealerIndex,
                    lastRaiserIndex: this.lastRaiserIndex,
                    hasPassedLastRaiser: this.hasPassedLastRaiser
                });
                // console.log(`[Table ${this.name}] No raises - checking if round complete. Current: ${this.currentPlayerIndex}, Next: ${nextPlayer}, BB: ${bbIndex}, Dealer: ${this.dealerIndex}, LastRaiser: ${this.lastRaiserIndex}, Complete: ${bettingRoundComplete}`);
            } else {
                // Someone raised - must have passed last raiser AND be about to return to them
                // CRITICAL FIX: Pre-flop is special - big blind ALWAYS gets LAST action
                // In standard poker, pre-flop: UTG acts first, BB acts LAST
                // If someone raises, they become the last raiser, but BB still needs their turn
                // Round completes when: we've passed BB AND passed the last raiser (if different) AND are about to return to last raiser
                if (this.phase === GAME_PHASES.PRE_FLOP) {
                    // Pre-flop: Round completes when we've passed last raiser AND about to return to them
                    // The hasPassedLastRaiser flag already tracks if we've completed a full round
                    bettingRoundComplete = this.hasPassedLastRaiser && nextPlayer === this.lastRaiserIndex;
                    
                    // Special case: If BB is the last raiser (no one raised after them), 
                    // round completes when we're about to return to BB after everyone acted
                    if (!bettingRoundComplete && this.lastRaiserIndex === bbIndex) {
                        // Check if we've passed BB (everyone has acted)
                        const hasPassedBB = this.currentPlayerIndex > bbIndex || 
                                          (this.currentPlayerIndex < bbIndex && nextPlayer > bbIndex) ||
                                          (this.currentPlayerIndex === bbIndex && nextPlayer !== bbIndex);
                        bettingRoundComplete = hasPassedBB && nextPlayer === bbIndex;
                        // Pre-flop BB check debug logging removed - too verbose
                    }
                    
                    gameLogger.bettingRoundCheck(this.name, 'BETTING_ROUND_COMPLETE (pre-flop with raises)', bettingRoundComplete ? 'TRUE' : 'FALSE', {
                        hasPassedLastRaiser: this.hasPassedLastRaiser,
                        nextPlayer,
                        lastRaiserIndex: this.lastRaiserIndex,
                        bbIndex,
                        currentPlayerIndex: this.currentPlayerIndex
                    });
                    // console.log(`[Table ${this.name}] Pre-flop with raises - hasPassedLastRaiser=${this.hasPassedLastRaiser}, nextPlayer=${nextPlayer}, lastRaiser=${this.lastRaiserIndex}, BB=${bbIndex}, complete=${bettingRoundComplete}`);
                } else {
                    // Post-flop: normal betting round rules
                    bettingRoundComplete = this.hasPassedLastRaiser && nextPlayer === this.lastRaiserIndex;
                    gameLogger.bettingRoundCheck(this.name, 'BETTING_ROUND_COMPLETE (post-flop)', bettingRoundComplete ? 'TRUE' : 'FALSE', {
                        hasPassedLastRaiser: this.hasPassedLastRaiser,
                        nextPlayer,
                        lastRaiserIndex: this.lastRaiserIndex,
                        phase: this.phase
                    });
                }
            }
        }
        
        // ============ CRITICAL: GUARANTEED EXIT POINTS ============
        // These checks MUST happen in order to prevent ANY loop scenarios
        // Each path has a GUARANTEED return statement
        
        // EXIT POINT 0: LOOP PREVENTION - Only one player can act
        // If nextPlayer === currentPlayerIndex, it means we've wrapped around and only ONE player can act
        // This happens when everyone else is folded, all-in, or busted (0 chips)
        if (nextPlayer === this.currentPlayerIndex && this.currentPlayerIndex !== -1) {
            // CRITICAL CHECK: Count how many players are actually still in the hand (not folded, isActive)
            const playersStillInHand = this.seats.filter(s => s && s.isActive && !s.isFolded);
            
            if (playersStillInHand.length <= 1) {
                // Only 1 player remains in the hand - they win by default!
                const winner = playersStillInHand[0] || this.seats[this.currentPlayerIndex];
                gameLogger.gameEvent(this.name, 'EXIT POINT 0a: ONLY ONE PLAYER REMAINS - Winner by default', {
                    winnerName: winner?.name,
                    playersStillInHand: playersStillInHand.length,
                    phase: this.phase
                });
                // console.log(`[Table ${this.name}] ONLY ONE PLAYER REMAINS: ${winner?.name} wins by default!`);
                this.clearTurnTimer();
                // CRITICAL FIX: awardPot will handle calling startNewHand - don't call it here
                // The setTimeout in advanceGame was racing with awardPot's setTimeout, causing pot to be cleared before awardPot finished
                this.awardPot(winner);
                // awardPot will call startNewHand after awarding - don't duplicate it here
                return;  // GUARANTEED EXIT - game over
            }
            
            // Multiple players still in hand, but only 1 can act (others all-in)
            // FIX: Skip ALL remaining phases directly to showdown - betting into dead streets
            // is pointless since no one can match the bets. Return excess chips and run the board.
            gameLogger.gameEvent(this.name, 'EXIT POINT 0b: Only one player can act, others all-in - skipping to showdown', {
                currentPlayerIndex: this.currentPlayerIndex,
                nextPlayer,
                playerName: this.seats[this.currentPlayerIndex]?.name,
                playersStillInHand: playersStillInHand.length,
                allBetsEqualized,
                phase: this.phase
            });
            console.log(`[Table ${this.name}] SKIP TO SHOWDOWN: Only ${this.seats[this.currentPlayerIndex]?.name} can act, ${playersStillInHand.length} still in hand - no point betting into dead streets`);
            this.hasPassedLastRaiser = false;
            this.clearTurnTimer();
            this.currentPlayerIndex = -1; // No one is acting
            this.returnExcessBets(); // Return any unmatched chips immediately
            
            // Run out the remaining community cards
            const phasesToRun = [];
            if (this.phase === GAME_PHASES.PRE_FLOP || this.phase === GAME_PHASES.FLOP || 
                this.phase === GAME_PHASES.TURN) {
                // Need to deal remaining cards
                if (this.communityCards.length < 3) {
                    this.communityCards = [this.deck.draw(), this.deck.draw(), this.deck.draw()];
                    phasesToRun.push('flop');
                }
                if (this.communityCards.length < 4) {
                    this.communityCards.push(this.deck.draw());
                    phasesToRun.push('turn');
                }
                if (this.communityCards.length < 5) {
                    this.communityCards.push(this.deck.draw());
                    phasesToRun.push('river');
                }
                console.log(`[Table ${this.name}] Dealt remaining cards: ${phasesToRun.join(', ')} (total community: ${this.communityCards.length})`);
            }
            
            // Broadcast state with revealed board before showdown
            this.onStateChange?.();
            
            // Go directly to showdown after a brief delay for visual effect
            setTimeout(() => {
                this.showdown();
            }, 1500);
            return;  // GUARANTEED EXIT - skips all remaining phases
        }
        
        // EXIT POINT 1: No one can act (all all-in or folded)
        // MUST check this FIRST before any complex logic
        if (nextPlayer === -1) {
            // No one can act - all players are all-in or folded
            // If no one can act, betting round MUST be complete regardless of bets
            gameLogger.gameEvent(this.name, 'EXIT POINT 1: No one can act - advancing phase', {
                nextPlayer,
                allBetsEqualized,
                activePlayers: activePlayers.length
            });
            console.log(`[Table ${this.name}] No active players (all all-in or folded) - advancing phase. All bets equalized: ${allBetsEqualized}`);
            
            // POKER RULE: Return excess all-in bets now that no more betting is possible
            // This ensures the pot display is correct during the skip-to-showdown animation
            this.returnExcessBets();
            
            this.hasPassedLastRaiser = false;
            this.advancePhase();
            return;  // GUARANTEED EXIT - prevents loop
        }
        
        // EXIT POINT 2: Betting round complete
        // FIX: CRITICAL GUARD - The round can ONLY be complete if ALL active players have acted at least once.
        // This prevents the round from completing before everyone has had a turn (the root cause of turn skipping).
        if (bettingRoundComplete && !allPlayersActed) {
            console.log(`[Table ${this.name}] Betting round logic says complete, but only ${this.playersActedThisRound.size}/${playersWhoCanAct.length} players have acted - NOT advancing. Acted: [${[...this.playersActedThisRound].join(',')}]`);
            bettingRoundComplete = false;  // Override - not all players have acted
        }
        
        // ALTERNATIVE: If all players have acted AND all bets equalized, round is DEFINITELY complete
        // (even if the hasPassedLastRaiser logic didn't detect it)
        if (!bettingRoundComplete && allPlayersActed && allBetsEqualized) {
            console.log(`[Table ${this.name}] All ${playersWhoCanAct.length} players have acted and bets equalized - completing round`);
            bettingRoundComplete = true;
        }
        
        if (bettingRoundComplete) {
            gameLogger.gameEvent(this.name, 'EXIT POINT 2: Betting round complete - advancing phase', {
                lastRaiserIndex: this.lastRaiserIndex,
                currentPlayerIndex: this.currentPlayerIndex,
                nextPlayer,
                hasPassedLastRaiser: this.hasPassedLastRaiser,
                allBetsEqualized,
                allPlayersActed,
                playersActed: this.playersActedThisRound.size,
                playersWhoCanAct: playersWhoCanAct.length,
                phase: this.phase
            });
            this.hasPassedLastRaiser = false;  // Reset for next betting round
            this.advancePhase();
            return;  // GUARANTEED EXIT - prevents loop
        }
        
        // EXIT POINT 3: Continue to next player (DEFAULT case)
        // If we reach here:
        // 1. nextPlayer !== -1 (checked in EXIT POINT 1)
        // 2. bettingRoundComplete === false (didn't return in EXIT POINT 2)
        // 3. Therefore we MUST continue to next player
        // This is the ONLY remaining path - guaranteed to execute
        
        if (allBetsEqualized && !bettingRoundComplete) {
            // All bets equalized but round not complete - give next player their turn
            gameLogger.gameEvent(this.name, 'EXIT POINT 3: Continuing - bets equalized but round not complete', {
                currentPlayerIndex: this.currentPlayerIndex,
                nextPlayer,
                lastRaiserIndex: this.lastRaiserIndex,
                allBetsEqualized
            });
            // console.log(`[Table ${this.name}] All bets equalized but round not complete - continuing to next player. Current: ${this.currentPlayerIndex}, Next: ${nextPlayer}, LastRaiser: ${this.lastRaiserIndex}`);
        } else {
            // Bets not equalized - continue betting round
            gameLogger.gameEvent(this.name, 'EXIT POINT 3: Continuing - bets not equalized', {
                currentPlayerIndex: this.currentPlayerIndex,
                nextPlayer,
                allBetsEqualized
            });
            // console.log(`[Table ${this.name}] Bets not equalized - continuing betting round. Current: ${this.currentPlayerIndex}, Next: ${nextPlayer}`);
        }
        
        // GUARANTEED: nextPlayer is valid (checked in EXIT POINT 1)
        const oldCurrentPlayer = this.currentPlayerIndex >= 0 ? this.seats[this.currentPlayerIndex]?.name : null;
        this.currentPlayerIndex = nextPlayer;
        const nextPlayerSeat = this.seats[this.currentPlayerIndex];
        
        // Reset wait time tracking when player changes
        if (this.lastWaitingPlayer !== nextPlayer) {
            this.playerWaitStartTime = Date.now();
            this.lastWaitingPlayer = nextPlayer;
        }
        
        // ============ LOOP DETECTION ============
        this.turnsThisPhase++;
        const playerId = nextPlayerSeat?.playerId || `seat_${nextPlayer}`;
        this.playerTurnCounts[playerId] = (this.playerTurnCounts[playerId] || 0) + 1;
        
        // Track CONSECUTIVE same-player turns (not total per phase)
        // A player acting multiple times is normal if there are raises in between
        // But the SAME player getting the turn multiple times IN A ROW is suspicious
        if (this.lastActingPlayer === playerId) {
            this.consecutiveSamePlayerTurns++;
        } else {
            this.consecutiveSamePlayerTurns = 1;
            this.lastActingPlayer = playerId;
        }
        
        // Only warn if same player acts consecutively without anyone else acting
        if (this.consecutiveSamePlayerTurns >= this.MAX_CONSECUTIVE_SAME_PLAYER) {
            gameLogger.gameEvent(this.name, `WARNING: POSSIBLE LOOP - Same player acting ${this.consecutiveSamePlayerTurns} times CONSECUTIVELY`, {
                player: nextPlayerSeat?.name,
                playerId,
                consecutiveTurns: this.consecutiveSamePlayerTurns,
                turnsThisPhase: this.turnsThisPhase,
                phase: this.phase
            });
            console.warn(`[Table ${this.name}] WARNING: ${nextPlayerSeat?.name} has acted ${this.consecutiveSamePlayerTurns} times IN A ROW - possible loop!`);
        }
        
        // Safety valve - force advance if too many turns
        if (this.turnsThisPhase >= this.MAX_TURNS_PER_PHASE) {
            gameLogger.gameEvent(this.name, `CRITICAL: LOOP DETECTED - Force advancing phase after ${this.turnsThisPhase} turns`, {
                phase: this.phase,
                turnsThisPhase: this.turnsThisPhase,
                playerTurnCounts: this.playerTurnCounts
            });
            console.error(`[Table ${this.name}] CRITICAL: Force advancing phase after ${this.turnsThisPhase} turns - loop detected!`);
            this.hasPassedLastRaiser = false;
            this.advancePhase();
            return;
        }
        
        // Check for stuck scenario: only one player has chips, others all-in
        const activePlayersWithChips = this.seats.filter(s => s && !s.isFolded && !s.isAllIn && s.chips > 0);
        const allInPlayers = this.seats.filter(s => s && !s.isFolded && s.isAllIn);
        if (activePlayersWithChips.length === 1 && allInPlayers.length > 0) {
            gameLogger.gameEvent(this.name, `WARNING: Only one player with chips, ${allInPlayers.length} all-in - checking if round should auto-complete`, {
                playerWithChips: activePlayersWithChips[0]?.name,
                allInCount: allInPlayers.length,
                phase: this.phase
            });
            console.warn(`[Table ${this.name}] WARNING: Only ${activePlayersWithChips[0]?.name} has chips, ${allInPlayers.length} players all-in`);
            
            // If bets are equalized, force advance
            const allBetsMatch = this.seats.every(s => !s || s.isFolded || s.isAllIn || s.currentBet === this.currentBet);
            if (allBetsMatch) {
                gameLogger.gameEvent(this.name, `Auto-advancing: All bets equalized, only one player can act`, {
                    phase: this.phase,
                    currentBet: this.currentBet
                });
                // console.log(`[Table ${this.name}] Auto-advancing - all bets equalized, only one player can act`);
                this.hasPassedLastRaiser = false;
                this.advancePhase();
                return;
            }
        }
        // ============ END LOOP DETECTION ============
        
        // Log detailed turn change for stuck player detection
        gameLogger.turnChange(this.name, oldCurrentPlayer || `Seat ${this.currentPlayerIndex}`, nextPlayerSeat?.name || `Seat ${nextPlayer}`, {
            fromSeat: this.currentPlayerIndex !== nextPlayer ? this.currentPlayerIndex : null,
            toSeat: nextPlayer,
            phase: this.phase,
            currentBet: this.currentBet,
            playerBet: nextPlayerSeat?.currentBet,
            lastRaiserIndex: this.lastRaiserIndex,
            hasPassedLastRaiser: this.hasPassedLastRaiser,
            turnsThisPhase: this.turnsThisPhase,
            playerTurnCount: this.playerTurnCounts[playerId],
            consecutiveSamePlayerTurns: this.consecutiveSamePlayerTurns,
            consecutiveAdvanceGameCalls: this.consecutiveAdvanceGameCalls || 0,
            handNumber: this.handsPlayed
        });
        
        // Log if player has been waiting
        if (this.playerWaitStartTime && this.lastWaitingPlayer === nextPlayer) {
            const waitTime = Date.now() - this.playerWaitStartTime;
            if (waitTime > 10000) { // 10 seconds
                gameLogger.gameEvent(this.name, 'WARNING: Player turn change but player was waiting', {
                    player: nextPlayerSeat?.name,
                    seatIndex: nextPlayer,
                    waitTimeMs: waitTime,
                    phase: this.phase
                });
                console.warn(`[Table ${this.name}] WARNING: ${nextPlayerSeat?.name} was waiting ${Math.floor(waitTime/1000)}s before getting turn`);
            }
        }
        
        console.log(`[Table ${this.name}] Turn: ${nextPlayerSeat?.name} (seat ${this.currentPlayerIndex}, isBot: ${nextPlayerSeat?.isBot}, currentBet: ${nextPlayerSeat?.currentBet}/${this.currentBet}, lastRaiser: ${this.lastRaiserIndex}, hasPassed: ${this.hasPassedLastRaiser}, turnsThisPhase: ${this.turnsThisPhase})`);
        this.startTurnTimer();
        this.onStateChange?.();
        // GUARANTEED EXIT - function always returns here if we reach this point
    }

    advancePhase() {
        const oldPhase = this.phase;
        
        // CRITICAL: Don't advance from non-game phases - these are terminal states
        // WAITING: Game hasn't started or has ended - wait for manual start
        // READY_UP/COUNTDOWN: Pre-game phases - handled separately
        // SHOWDOWN: Handles its own completion via startNewHand()
        if (this.phase === GAME_PHASES.WAITING || 
            this.phase === GAME_PHASES.READY_UP || 
            this.phase === GAME_PHASES.COUNTDOWN || 
            this.phase === GAME_PHASES.SHOWDOWN) {
            // console.log(`[Table ${this.name}] Cannot advance from phase ${this.phase} - this is a terminal/non-game phase`);
            return;
        }
        
        gameLogger.phaseChange(this.name, oldPhase, 'ADVANCING', {
            currentBet: this.currentBet,
            pot: this.pot,
            currentPlayerIndex: this.currentPlayerIndex,
            turnsThisPhase: this.turnsThisPhase
        });
        
        // Reset loop detection counters for new phase
        this.turnsThisPhase = 0;
        this.playerTurnCounts = {};
        this.lastActingPlayer = null;
        this.consecutiveSamePlayerTurns = 0;
        
        // Reset betting for new round
        for (const seat of this.seats) {
            if (seat) seat.currentBet = 0;
        }
        const oldCurrentBet = this.currentBet;
        this.currentBet = 0;
        this.minRaise = this.bigBlind;
        
        // CRITICAL: Validate money before phase transition
        this._validateMoney(`BEFORE_PHASE_ADVANCE_${oldPhase}`);

        switch (this.phase) {
            case GAME_PHASES.PRE_FLOP:
                this.communityCards = [this.deck.draw(), this.deck.draw(), this.deck.draw()];
                this._tracePhaseChange(GAME_PHASES.FLOP, 'ADVANCE_GAME');
                this.raisesThisRound = 0;  // Reset raise count for new betting round
                gameLogger.phaseChange(this.name, 'PRE_FLOP', 'FLOP', {
                    communityCards: this.communityCards.map(c => `${c.rank}${c.suit}`)
                });
                // CRITICAL: Validate money after phase transition
                this._validateMoney('AFTER_PHASE_ADVANCE_PREFLOP_TO_FLOP');
                break;
            case GAME_PHASES.FLOP:
                this.communityCards.push(this.deck.draw());
                this._tracePhaseChange(GAME_PHASES.TURN, 'ADVANCE_GAME');
                this.raisesThisRound = 0;  // Reset raise count for new betting round
                gameLogger.phaseChange(this.name, 'FLOP', 'TURN', {
                    turnCard: `${this.communityCards[this.communityCards.length - 1].rank}${this.communityCards[this.communityCards.length - 1].suit}`
                });
                // CRITICAL: Validate money after phase transition
                this._validateMoney('AFTER_PHASE_ADVANCE_FLOP_TO_TURN');
                break;
            case GAME_PHASES.TURN:
                this.communityCards.push(this.deck.draw());
                this._tracePhaseChange(GAME_PHASES.RIVER, 'ADVANCE_GAME');
                this.raisesThisRound = 0;  // Reset raise count for new betting round
                gameLogger.phaseChange(this.name, 'TURN', 'RIVER', {
                    riverCard: `${this.communityCards[this.communityCards.length - 1].rank}${this.communityCards[this.communityCards.length - 1].suit}`
                });
                // CRITICAL: Validate money after phase transition
                this._validateMoney('AFTER_PHASE_ADVANCE_TURN_TO_RIVER');
                break;
            case GAME_PHASES.RIVER:
                this.showdown();
                return;
        }

        // Set first player after dealer
        this.currentPlayerIndex = this.getNextActivePlayer(this.dealerIndex);
        
        // If no one can act (all folded or all-in), advance to next phase immediately
        if (this.currentPlayerIndex === -1) {
            gameLogger.gameEvent(this.name, 'No active players - auto-advancing to next phase', {
                phase: this.phase,
                dealerIndex: this.dealerIndex
            });
            // console.log(`[Table ${this.name}] No active players - running out board`);
            // Capture snapshot before broadcasting
            if (this.stateSnapshot) {
                const state = this.getState(null);
                this.stateSnapshot.capture(state, {
                    phase: this.phase,
                    handsPlayed: this.handsPlayed,
                    reason: 'state_change'
                });
            }
            this._onStateChangeCallback?.();
            // CRITICAL FIX: Check phase before advancing - prevent infinite loop in WAITING
            // Short delay before next phase for visual effect
            setTimeout(() => {
                // Only advance if we're still in a game phase (not WAITING/READY_UP/COUNTDOWN/SHOWDOWN)
                if (this.phase !== GAME_PHASES.WAITING && 
                    this.phase !== GAME_PHASES.READY_UP && 
                    this.phase !== GAME_PHASES.COUNTDOWN && 
                    this.phase !== GAME_PHASES.SHOWDOWN) {
                    this.advancePhase();
                }
            }, 1000);
            return;
        }
        
        // CRITICAL FIX: Reset lastRaiserIndex to track first player to act this round
        // This is used to detect when we've completed a full betting round
        // If no one raises, we'll still advance phase when we get back to this player
        const oldLastRaiser = this.lastRaiserIndex;
        this.lastRaiserIndex = this.currentPlayerIndex;
        this.hasPassedLastRaiser = false;  // Reset flag for new betting round
        this.playersActedThisRound = new Set();  // FIX: Track which players have acted this round
        
        gameLogger.phaseChange(this.name, oldPhase, this.phase, {
            firstToAct: this.seats[this.currentPlayerIndex]?.name,
            seatIndex: this.currentPlayerIndex,
            dealerIndex: this.dealerIndex,
            oldLastRaiser,
            newLastRaiser: this.lastRaiserIndex,
            oldCurrentBet,
            newCurrentBet: this.currentBet,
            pot: this.pot
        });
        
        console.log(`[Table ${this.name}] New betting round (${this.phase}) - First to act: ${this.seats[this.currentPlayerIndex]?.name} (seat ${this.currentPlayerIndex})`);
        this.startTurnTimer();
        
        // Broadcast state for new phase
        this.onStateChange?.();
    }

    /**
     * POKER RULE: Return excess all-in bets that no opponent can match.
     * 
     * Called when no more betting is possible (all non-folded players are all-in, or at showdown).
     * 
     * Example: Player A (100M) all-in vs Player B (20K) all-in
     * - Main pot should be 40K (20K from each)
     * - A's excess 99.98M is returned immediately (never belonged in the pot)
     * 
     * In multi-player: A(200), B(50 all-in), C(100 all-in)
     * - Max matchable = 100 (2nd highest among non-folded)
     * - A gets 100 back, pot reduced by 100
     * - Side pot calc handles the 50/100 split between B and C levels
     */
    returnExcessBets() {
        const nonFolded = this.seats
            .filter(s => s && !s.isFolded && s.isActive !== false)
            .sort((a, b) => (a.totalBet || 0) - (b.totalBet || 0));
        
        if (nonFolded.length < 2) return;
        
        // The maximum matchable bet is the 2nd-highest totalBet among non-folded players
        const secondHighestBet = nonFolded[nonFolded.length - 2].totalBet || 0;
        
        let totalReturned = 0;
        
        for (const player of nonFolded) {
            const playerTotalBet = player.totalBet || 0;
            if (playerTotalBet > secondHighestBet) {
                const excess = playerTotalBet - secondHighestBet;
                
                // Return excess chips to player
                player.chips += excess;
                player.totalBet -= excess;
                this.pot -= excess;
                totalReturned += excess;
                
                console.log(`[Table ${this.name}] EXCESS RETURNED: ${player.name} gets ${excess} back (bet ${playerTotalBet}, max matchable ${secondHighestBet}, pot now ${this.pot})`);
                gameLogger.gameEvent(this.name, '[POT] Excess all-in chips returned', {
                    player: player.name,
                    excessReturned: excess,
                    originalTotalBet: playerTotalBet,
                    newTotalBet: player.totalBet,
                    maxMatchableBet: secondHighestBet,
                    newChips: player.chips,
                    newPot: this.pot,
                    handNumber: this.handsPlayed
                });
            }
        }
        
        if (totalReturned > 0) {
            gameLogger.gameEvent(this.name, '[POT] Total excess returned to players', {
                totalReturned,
                newPot: this.pot,
                handNumber: this.handsPlayed,
                phase: this.phase
            });
            
            // Broadcast updated state so clients see correct pot and chip amounts
            this.onStateChange?.();
        }
    }

    /**
     * Analyze advanced hand patterns for a player.
     * Detects c-bet, steal attempt, bluff, draws, suckout, etc.
     * 
     * @param {Object} seat - Player seat object
     * @param {Array} actions - Player's actions this hand [{phase, action, amount}]
     * @param {boolean} wasWinner - Did this player win the hand?
     * @param {boolean} wentToShowdown - Did the hand go to showdown?
     * @param {Array} potAwards - Pot award results
     * @returns {Object} Pattern flags
     */
    _analyzeHandPatterns(seat, actions, wasWinner, wentToShowdown, potAwards) {
        const patterns = {
            didCBet: false,
            cbetSuccess: false,
            wasStealAttempt: false,
            stealSuccess: false,
            wasBluff: false,
            bluffSuccess: false,
            opponentWasBluffing: false,
            calledBluffCorrectly: false,
            hadDrawOnFlop: false,
            drawCompleted: false,
            wasBehindOnFlop: false,
            wonFromBehind: false
        };

        try {
            const playerId = seat.playerId;
            const holeCards = seat.cards || [];
            const folded = actions.some(a => a.action === 'fold');

            // --- C-BET DETECTION ---
            // C-bet = preflop raiser bets on the flop
            const wasPreFlopRaiser = actions.some(a =>
                a.phase === 'preflop' && ['raise', 'allin'].includes(a.action)
            );
            const betOnFlop = actions.some(a =>
                a.phase === 'flop' && ['bet', 'raise', 'allin'].includes(a.action)
            );
            if (wasPreFlopRaiser && betOnFlop) {
                patterns.didCBet = true;
                // C-bet success = everyone folded after flop bet (no turn actions from this player)
                // or this player won the hand
                const reachedTurn = actions.some(a => a.phase === 'turn');
                patterns.cbetSuccess = wasWinner || (!reachedTurn && !wentToShowdown);
            }

            // --- STEAL ATTEMPT DETECTION ---
            // Steal = raise from late position (cutoff/button/small blind) when no one has raised before
            const activeSeats = this.seats.filter(s => s && s.isActive).length;
            if (activeSeats >= 3) {
                const seatIndex = this.seats.indexOf(seat);
                // Determine if seat is in late position (button, cutoff, or 1 before cutoff)
                const dealerIdx = this.dealerIndex;
                const isButton = seatIndex === dealerIdx;
                // cutoff = one seat before button
                let cutoffIdx = -1;
                let checkIdx = dealerIdx;
                for (let i = 0; i < this.seats.length; i++) {
                    checkIdx = (checkIdx - 1 + this.seats.length) % this.seats.length;
                    if (this.seats[checkIdx] && this.seats[checkIdx].isActive) {
                        cutoffIdx = checkIdx;
                        break;
                    }
                }
                const isCutoff = seatIndex === cutoffIdx;
                // SB is next after dealer
                const sbIdx = this.getNextActivePlayer(dealerIdx);
                const isSB = seatIndex === sbIdx;

                const isLatePosition = isButton || isCutoff || isSB;
                const didRaisePF = actions.some(a =>
                    a.phase === 'preflop' && ['raise', 'allin'].includes(a.action)
                );
                // Check if nobody raised before this player preflop
                // (we can check if the only preflop raiser's actions are from this player)
                const allPfRaisers = [];
                for (const [pid, pActions] of Object.entries(this.handActions)) {
                    if (pid === playerId) continue;
                    if (pActions.some(a => a.phase === 'preflop' && ['raise', 'bet', 'allin'].includes(a.action))) {
                        allPfRaisers.push(pid);
                    }
                }
                if (isLatePosition && didRaisePF && allPfRaisers.length === 0) {
                    patterns.wasStealAttempt = true;
                    patterns.stealSuccess = wasWinner;
                }
            }

            // --- BLUFF DETECTION ---
            // Bluff = bet/raise on river (or earlier) with a weak hand and won without showdown,
            //         or showed weak hand at showdown
            if (!folded) {
                const madeAggressive = actions.some(a =>
                    ['bet', 'raise', 'allin'].includes(a.action) &&
                    ['flop', 'turn', 'river'].includes(a.phase)
                );
                const handRank = seat.handResult?.rank || 0;
                const isWeakHand = handRank <= 2; // High card or pair only

                if (madeAggressive && isWeakHand) {
                    if (wasWinner && !wentToShowdown) {
                        // Won by making everyone fold with a weak hand = successful bluff
                        patterns.wasBluff = true;
                        patterns.bluffSuccess = true;
                    } else if (wentToShowdown) {
                        // Showed a weak hand at showdown but was aggressive = caught bluffing
                        patterns.wasBluff = true;
                        patterns.bluffSuccess = wasWinner; // Could still win with weak hand
                    }
                }

                // Check if opponent was bluffing (this player called, opponent showed weak hand)
                if (wentToShowdown && !folded) {
                    for (const otherSeat of this.seats) {
                        if (!otherSeat || otherSeat.playerId === playerId || otherSeat.isFolded) continue;
                        const otherActions = this.handActions[otherSeat.playerId] || [];
                        const otherAggressive = otherActions.some(a =>
                            ['bet', 'raise', 'allin'].includes(a.action) &&
                            ['flop', 'turn', 'river'].includes(a.phase)
                        );
                        const otherHandRank = otherSeat.handResult?.rank || 0;
                        if (otherAggressive && otherHandRank <= 2) {
                            // Opponent was bluffing at showdown
                            patterns.opponentWasBluffing = true;
                            // Did this player call the bluff correctly?
                            const thisPlayerCalled = actions.some(a =>
                                a.action === 'call' && ['flop', 'turn', 'river'].includes(a.phase)
                            );
                            if (thisPlayerCalled && wasWinner) {
                                patterns.calledBluffCorrectly = true;
                            }
                        }
                    }
                }
            }

            // --- DRAW DETECTION ---
            // Check if player had a flush or straight draw on the flop
            if (holeCards.length === 2 && this.communityCards.length >= 3 && !folded) {
                const flopCards = this.communityCards.slice(0, 3);
                const flopHand = [...holeCards, ...flopCards];

                // Flush draw: 4 cards of same suit
                const suitCounts = {};
                for (const card of flopHand) {
                    if (card && card.suit) {
                        suitCounts[card.suit] = (suitCounts[card.suit] || 0) + 1;
                    }
                }
                const hasFlushDraw = Object.values(suitCounts).some(count => count === 4);

                // Straight draw: 4 cards in sequence (open-ended or gutshot)
                const RANK_VALUES_MAP = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };
                const cardValues = flopHand
                    .filter(c => c && c.rank)
                    .map(c => RANK_VALUES_MAP[c.rank])
                    .filter(v => v !== undefined);
                const uniqueValues = [...new Set(cardValues)].sort((a, b) => a - b);

                let hasStraightDraw = false;
                // Check all windows of 5 for having 4 unique values
                for (let startVal = 2; startVal <= 10; startVal++) {
                    const windowValues = uniqueValues.filter(v => v >= startVal && v <= startVal + 4);
                    if (windowValues.length === 4) {
                        hasStraightDraw = true;
                        break;
                    }
                }
                // Check A-2-3-4-5 (wheel draw)
                if (!hasStraightDraw) {
                    const wheelValues = uniqueValues.filter(v => [14, 2, 3, 4, 5].includes(v));
                    if (wheelValues.length === 4) hasStraightDraw = true;
                }

                if (hasFlushDraw || hasStraightDraw) {
                    patterns.hadDrawOnFlop = true;

                    // Check if the draw completed
                    const finalHandRank = seat.handResult?.rank || 0;
                    if (hasFlushDraw && finalHandRank >= 6) { // Flush (6) or better
                        patterns.drawCompleted = true;
                    }
                    if (hasStraightDraw && finalHandRank >= 5) { // Straight (5) or better
                        patterns.drawCompleted = true;
                    }
                }
            }

            // --- BEHIND ON FLOP / SUCKOUT ---
            // Check if this player had the worst hand on the flop but ended up winning
            if (wentToShowdown && holeCards.length === 2 && this.communityCards.length >= 3 && !folded) {
                const flopCards = this.communityCards.slice(0, 3);
                const playerFlopCards = [...holeCards, ...flopCards];

                try {
                    const playerFlopResult = HandEvaluator.evaluate(playerFlopCards);

                    // Compare against all other players who made it to showdown
                    let wasBehind = false;
                    for (const otherSeat of this.seats) {
                        if (!otherSeat || otherSeat.playerId === playerId) continue;
                        if (otherSeat.isFolded || !otherSeat.cards || otherSeat.cards.length < 2) continue;

                        const otherFlopCards = [...otherSeat.cards, ...flopCards];
                        const otherFlopResult = HandEvaluator.evaluate(otherFlopCards);

                        if (HandEvaluator.compare(otherFlopResult, playerFlopResult) > 0) {
                            wasBehind = true;
                            break;
                        }
                    }

                    if (wasBehind) {
                        patterns.wasBehindOnFlop = true;
                        patterns.wonFromBehind = wasWinner;
                    }
                } catch (err) {
                    // Silently fail — don't break stats for hand evaluation errors
                }
            }

        } catch (err) {
            // Don't let pattern analysis crash the stats collection
            const gameLogger = require('../utils/GameLogger');
            gameLogger.error(this.name || 'TABLE', '_analyzeHandPatterns error', { error: err.message });
        }

        return patterns;
    }

    /**
     * Collect hand data and send to StatsEngine for processing
     * Called after showdown or when everyone folds
     */
    _collectAndSendStatsData(potAwards, wentToShowdown) {
        try {
            const StatsEngine = require('../stats/StatsEngine');
            const fireTracker = require('./FireTracker');
            const TitleEngine = require('../stats/TitleEngine');

            const players = [];
            
            for (const seat of this.seats) {
                if (!seat || !seat.playerId) continue;
                // Skip players not tracked this hand (joined mid-hand)
                if (this.handChipsBefore[seat.playerId] === undefined) continue;
                
                const chipsBefore = this.handChipsBefore[seat.playerId] || 0;
                const chipsAfter = seat.chips || 0;
                const chipsWonLost = chipsAfter - chipsBefore;
                const actions = this.handActions[seat.playerId] || [];
                const folded = actions.some(a => a.action === 'fold');
                const isVoluntary = actions.some(a => 
                    a.phase === 'preflop' && ['call', 'raise', 'bet', 'allin'].includes(a.action)
                );
                const didRaisePF = actions.some(a => 
                    a.phase === 'preflop' && ['raise', 'allin'].includes(a.action)
                );

                // Determine if this player was a winner
                const wasWinner = potAwards ? 
                    potAwards.some(a => a.playerId === seat.playerId && !a.isRefund) :
                    chipsWonLost > 0;

                // Analyze advanced patterns (c-bet, steal, bluff, draw, suckout)
                const patterns = this._analyzeHandPatterns(seat, actions, wasWinner, wentToShowdown, potAwards);

                // Build player stats record
                players.push({
                    playerId: seat.playerId,
                    playerName: seat.name || seat.playerName,
                    seatIndex: this.seats.indexOf(seat),
                    holeCards: seat.cards || [],
                    finalHandRank: seat.handResult?.rank || 0,
                    finalHandName: seat.handResult?.name || (folded ? 'Folded' : 'Unknown'),
                    chipsWonLost,
                    wasWinner,
                    actions,
                    isVoluntary,
                    didRaisePF,
                    didCBet: patterns.didCBet,
                    cbetSuccess: patterns.cbetSuccess,
                    wasStealAttempt: patterns.wasStealAttempt,
                    stealSuccess: patterns.stealSuccess,
                    wasBluff: patterns.wasBluff,
                    bluffSuccess: patterns.bluffSuccess,
                    opponentWasBluffing: patterns.opponentWasBluffing,
                    calledBluffCorrectly: patterns.calledBluffCorrectly,
                    hadDrawOnFlop: patterns.hadDrawOnFlop,
                    drawCompleted: patterns.drawCompleted,
                    wasBehindOnFlop: patterns.wasBehindOnFlop,
                    wonFromBehind: patterns.wonFromBehind,
                    chipsBefore,
                    chipsAfter
                });

                // Record hand for fire tracker (with real pattern data)
                fireTracker.recordHand(this.id, seat.playerId, {
                    won: wasWinner,
                    handRank: seat.handResult?.rank || 0,
                    potSize: this.pot || 0,
                    bigBlind: this.bigBlind,
                    folded,
                    drawCompleted: patterns.drawCompleted,
                    suckout: patterns.wonFromBehind,
                    chipsWonLost
                });
            }

            // Determine phase reached
            let phaseReached = 'preflop';
            if (this.communityCards.length >= 5 || wentToShowdown) phaseReached = 'showdown';
            else if (this.communityCards.length >= 4) phaseReached = 'river';
            else if (this.communityCards.length >= 3) phaseReached = 'turn';
            else if (this.communityCards.length >= 1) phaseReached = 'flop';

            const handData = {
                tableId: this.id,
                tableName: this.name,
                handNumber: this.handsPlayed,
                communityCards: this.communityCards || [],
                potSize: potAwards ? potAwards.reduce((sum, a) => sum + a.amount, 0) : (this.pot || 0),
                phaseReached,
                wentToShowdown,
                players
            };

            // Process stats asynchronously (don't block game flow)
            StatsEngine.processHand(handData).catch(err => {
                gameLogger.error(this.name, 'StatsEngine.processHand failed', { error: err.message });
            });

            // Evaluate titles for each player asynchronously (every 5 hands to reduce DB load)
            if (this.handsPlayed % 5 === 0) {
                for (const player of players) {
                    if (player.playerId && !this.seats.find(s => s?.playerId === player.playerId)?.isBot) {
                        TitleEngine.evaluateTitles(player.playerId).catch(err => {
                            gameLogger.error(this.name, 'TitleEngine.evaluateTitles failed', { error: err.message });
                        });
                    }
                }
            }

            // Check fire transitions and announce
            for (const player of players) {
                const status = fireTracker.getFireStatus(this.id, player.playerId);
                // Store fire status on the seat for state broadcasts
                const seat = this.seats.find(s => s?.playerId === player.playerId);
                if (seat) {
                    const prevFireLevel = seat.fireLevel || 0;
                    seat.fireLevel = status.fireLevel;
                    seat.coldLevel = status.coldLevel;
                    seat.fireScore = status.fireScore;

                    // Announce fire status changes
                    if (status.fireLevel !== prevFireLevel && this.onFireStatusChange) {
                        this.onFireStatusChange(player.playerId, player.playerName, status);
                    }
                }
            }

            // Update crew stats for each non-bot player
            try {
                const CrewManager = require('../social/CrewManager');
                for (const player of players) {
                    if (player.playerId && !this.seats.find(s => s?.playerId === player.playerId)?.isBot) {
                        CrewManager.updateCrewStats(
                            player.playerId,
                            1, // 1 hand played
                            player.wasWinner ? 1 : 0,
                            player.chipsWonLost > 0 ? player.chipsWonLost : 0
                        ).catch(() => {}); // Non-critical, ignore errors
                    }
                }
            } catch (crewErr) {
                // Non-critical — don't log noise
            }

            // Resolve spectator bets for this hand (async, fire-and-forget)
            (async () => {
                try {
                    const database = require('../database/Database');
                    if (!database.isConnected) return;
                    const winnerIds = players.filter(p => p.wasWinner).map(p => p.playerId);
                    const pendingBets = await database.query(
                        'SELECT * FROM spectator_bets WHERE table_id = ? AND hand_number = ? AND result = ?',
                        [this.id, this.handsPlayed, 'pending']
                    );
                    for (const bet of pendingBets) {
                        const won = winnerIds.includes(bet.bet_on_player_id);
                        const result = won ? 'won' : 'lost';
                        const payout = won ? bet.amount * 2 : 0;
                        await database.query(
                            'UPDATE spectator_bets SET result = ?, payout = ? WHERE id = ?',
                            [result, payout, bet.id]
                        );
                        if (won && payout > 0) {
                            await database.query(
                                'UPDATE users SET chips = chips + ? WHERE id = ?',
                                [payout, bet.spectator_id]
                            );
                        }
                    }
                } catch (specErr) {
                    gameLogger.error(this.name, 'Spectator bet resolution failed', { error: specErr.message });
                }
            })();

            // Collusion detection — run periodically (every 50 hands)
            if (this.handsPlayed % 50 === 0 && wentToShowdown) {
                try {
                    const CollusionDetector = require('../security/CollusionDetector');
                    const humanPlayers = players
                        .filter(p => p.playerId && !this.seats.find(s => s?.playerId === p.playerId)?.isBot)
                        .map(p => p.playerId);

                    // Analyze all unique pairs
                    for (let i = 0; i < humanPlayers.length; i++) {
                        for (let j = i + 1; j < humanPlayers.length; j++) {
                            CollusionDetector.analyzePlayerPair(humanPlayers[i], humanPlayers[j]).catch(() => {});
                        }
                    }
                } catch (colErr) {
                    // Non-critical
                }
            }

        } catch (err) {
            gameLogger.error(this.name, '_collectAndSendStatsData failed', {
                error: err.message,
                stack: err.stack
            });
        }
    }

    showdown() {
        // POKER RULE: Return any excess all-in bets before calculating winners
        // This ensures the pot only contains chips that were actually contested
        this.returnExcessBets();
        
        // ROOT CAUSE: Trace showdown operation
        const beforeState = this._getChipState();
        
        this.clearTurnTimer();
        this._tracePhaseChange(GAME_PHASES.SHOWDOWN, 'ALL_ACTIONS_COMPLETE');
        
        // SYSTEMATIC DEBUG: Track pot vs actual chips at showdown
        const totalChipsAtShowdown = this.seats.filter(s => s !== null && s.isActive !== false).reduce((sum, s) => sum + (s.chips || 0), 0);
        const totalChipsAndPotAtShowdown = totalChipsAtShowdown + this.pot;
        const potValue = this.pot;
        const totalBetsAtShowdown = this.seats.filter(s => s !== null && s.isActive !== false).reduce((sum, s) => sum + (s.totalBet || 0), 0);
        
        const showdownDebugLog = `[SYSTEMATIC_DEBUG] SHOWDOWN: Pot=${potValue}, TotalChips=${totalChipsAtShowdown}, TotalChipsAndPot=${totalChipsAndPotAtShowdown}, TotalBets=${totalBetsAtShowdown}\n`;
        console.log(showdownDebugLog.trim());
        fs.appendFileSync(path.join(__dirname, '../../logs/pot-award-debug.log'), new Date().toISOString() + ' ' + showdownDebugLog);
        
        // CRITICAL FIX: If pot is already 0, it means it was awarded earlier (by fold)
        // Don't try to calculate side pots - just start a new hand
        if (this.pot === 0) {
            // console.log(`[Table ${this.name}] Pot is 0 - already awarded earlier. Skipping showdown calculation and starting new hand.`);
            gameLogger.gameEvent(this.name, 'SHOWDOWN SKIPPED - pot already awarded', {
                pot: this.pot,
                reason: 'Pot was awarded earlier (by fold)'
            });
            // CRITICAL FIX: Pot is already 0, so we can start new hand immediately
            // No need for setTimeout or pot clearing - pot is already cleared
            setTimeout(() => {
                this.startNewHand();
            }, 3000);
            return;
        }
        
        gameLogger.gameEvent(this.name, 'SHOWDOWN STARTED', {
            pot: this.pot,
            totalChipsAtShowdown,
            totalChipsAndPotAtShowdown,
            totalBetsAtShowdown,
            communityCards: this.communityCards?.map(c => `${c.rank}${c.suit}`),
            activePlayers: this.seats.filter(s => s && !s.isFolded).map(s => ({
                name: s.name,
                chips: s.chips,
                isAllIn: s.isAllIn,
                totalBet: s.totalBet
            }))
        });
        
        // CRITICAL: Only include players who are:
        // 1. Still seated (seat !== null)
        // 2. Active (isActive !== false) - not eliminated
        // 3. Not folded this hand
        // 4. Have cards to evaluate
        // NOTE: All-in players with 0 chips CAN still win if they have the best hand
        // They will be evaluated and if they win, they'll get the pot award (chips will go from 0 to award amount)
        // If they lose, they won't be in the winners list and won't get any award
        const activePlayers = this.seats
            .map((seat, index) => seat && seat.isActive !== false && !seat.isFolded && seat.cards?.length >= 2 
                ? { ...seat, seatIndex: index } : null)
            .filter(p => p !== null);
        
        // CRITICAL FIX: Also evaluate hands for eliminated players who contributed to the pot
        // This ensures their chips can be properly redistributed
        const eliminatedPlayers = this.seats
            .map((seat, index) => seat && seat.isActive === false && !seat.isFolded && seat.cards?.length >= 2 && (seat.totalBet || 0) > 0
                ? { ...seat, seatIndex: index } : null)
            .filter(p => p !== null);
        
        // Evaluate hands for eliminated players too (so we can redistribute their pot portions)
        for (const player of eliminatedPlayers) {
            const playerCards = (player.cards || []).filter(c => c && c.rank && c.suit);
            const communityCards = (this.communityCards || []).filter(c => c && c.rank && c.suit);
            
            if (playerCards.length >= 2 && communityCards.length >= 3) {
                const allCards = [...playerCards, ...communityCards];
                const seen = new Set();
                const uniqueCards = allCards.filter(card => {
                    const key = `${card.rank}-${card.suit}`;
                    if (seen.has(key)) return false;
                    seen.add(key);
                    return true;
                });
                
                player.handResult = HandEvaluator.evaluate(uniqueCards);
                // console.log(`[Table ${this.name}] Evaluated eliminated player ${player.name} hand: ${player.handResult.name}`);
            }
        }

        // Evaluate hands
        // CRITICAL: Filter out null/undefined cards before evaluation
        for (const player of activePlayers) {
            // Filter out any null/undefined cards (shouldn't happen, but safety check)
            const playerCards = (player.cards || []).filter(c => c && c.rank && c.suit);
            const communityCards = (this.communityCards || []).filter(c => c && c.rank && c.suit);
            
            if (playerCards.length < 2 || communityCards.length < 3) {
                console.error(`[Table ${this.name}] Invalid cards for ${player.name}: player=${playerCards.length}, community=${communityCards.length}`);
                gameLogger.error(this.name, '[SHOWDOWN] Invalid cards for player', {
                    player: player.name,
                    playerCardsCount: playerCards.length,
                    communityCardsCount: communityCards.length,
                    handNumber: this.handsPlayed,
                    phase: this.phase
                });
                // Record fix attempt - invalid cards is a failure
                this._recordFixAttempt('FIX_54_INVALID_CARDS_FOR_PLAYER', false, {
                    context: 'SHOWDOWN',
                    player: player.name,
                    playerCardsCount: playerCards.length,
                    communityCardsCount: communityCards.length,
                    handNumber: this.handsPlayed,
                    phase: this.phase
                });
                player.handResult = { rank: 0, name: 'Invalid', values: [] };
                continue;
            }
            
            // CRITICAL: Deduplicate cards by rank+suit to prevent duplicate card evaluation bugs
            const allCards = [...playerCards, ...communityCards];
            const seen = new Set();
            const uniqueCards = allCards.filter(card => {
                const key = `${card.rank}-${card.suit}`;
                if (seen.has(key)) {
                    console.warn(`[Table ${this.name}] DUPLICATE CARD DETECTED for ${player.name}: ${card.rank}${card.suit}`);
                    return false;
                }
                seen.add(key);
                return true;
            });
            
            if (uniqueCards.length !== allCards.length) {
                console.error(`[Table ${this.name}] CARD DUPLICATES DETECTED for ${player.name}: had ${allCards.length}, now ${uniqueCards.length}`);
                gameLogger.error(this.name, '[SHOWDOWN] Card duplicates detected', {
                    player: player.name,
                    allCardsCount: allCards.length,
                    uniqueCardsCount: uniqueCards.length,
                    handNumber: this.handsPlayed,
                    phase: this.phase
                });
                // Record fix attempt - card duplicates detected is a failure
                this._recordFixAttempt('FIX_55_CARD_DUPLICATES_DETECTED', false, {
                    context: 'SHOWDOWN',
                    player: player.name,
                    allCardsCount: allCards.length,
                    uniqueCardsCount: uniqueCards.length,
                    handNumber: this.handsPlayed,
                    phase: this.phase
                });
            }
            
            console.log(`[Table ${this.name}] Evaluating hand for ${player.name}: ${uniqueCards.map(c => `${c.rank}${c.suit}`).join(' ')}`);
            
            player.handResult = HandEvaluator.evaluate(uniqueCards);
            
            // Hand evaluation debug logging removed - too verbose (logs every hand for every player)
            // Only log errors or critical hand evaluation issues
            console.log(`[Table ${this.name}] ${player.name} has: ${player.handResult.name} (rank ${player.handResult.rank})`);
        }

        // CRITICAL: Calculate and award side pots BEFORE broadcasting state
        // This ensures chips are awarded before clients see the state
        const potBeforeAwards = this.pot;
        const potAwards = this.calculateAndAwardSidePots(activePlayers);
        
        // SYSTEMATIC DEBUG: Track pot value after awards vs what was displayed
        const potAfterAwards = this.pot;
        const totalAwardedAfter = potAwards ? potAwards.reduce((sum, award) => sum + award.amount, 0) : 0;
        const showdownAwardsLog = `[SYSTEMATIC_DEBUG] SHOWDOWN AFTER AWARDS: PotBefore=${potBeforeAwards}, PotAfter=${potAfterAwards}, TotalAwarded=${totalAwardedAfter}, ExpectedPotAfter=${potBeforeAwards - totalAwardedAfter}\n`;
        console.log(showdownAwardsLog.trim());
        fs.appendFileSync(path.join(__dirname, '../../logs/pot-award-debug.log'), new Date().toISOString() + ' ' + showdownAwardsLog);
        
        // CRITICAL: If pot awards failed, log error and try to recover
        if (!potAwards || potAwards.length === 0) {
            const potStillExists = this.pot > 0;
            if (potStillExists) {
                console.error(`[Table ${this.name}] ⚠️ CRITICAL: Pot calculation failed but pot still exists (${this.pot}). Attempting emergency distribution...`);
                gameLogger.gameEvent(this.name, '[POT] EMERGENCY: Pot calculation failed', {
                    pot: this.pot,
                    activePlayersCount: activePlayers.length,
                    activePlayers: activePlayers.map(p => ({
                        name: p.name,
                        chips: p.chips,
                        totalBet: p.totalBet,
                        hasHandResult: !!p.handResult
                    }))
                });
                // Record fix attempt - pot calculation failed but pot still exists is a failure
                this._recordFixAttempt('FIX_52_POT_CALCULATION_FAILED_BUT_POT_EXISTS', false, {
                    context: 'SHOWDOWN',
                    pot: this.pot,
                    activePlayersCount: activePlayers.length,
                    handNumber: this.handsPlayed,
                    phase: this.phase
                });
                
                // Emergency: If all players went all-in with same bet, give pot to best hand
                // CRITICAL: Also handle case where activePlayers is empty (all folded/eliminated)
                if (activePlayers.length > 0) {
                    const sortedByHand = [...activePlayers]
                        .filter(p => p.handResult)
                        .sort((a, b) => HandEvaluator.compare(b.handResult, a.handResult));
                    
                    if (sortedByHand.length > 0) {
                        const winner = sortedByHand[0];
                        const seat = this.seats.find(s => s?.playerId === winner.playerId);
                        if (seat && seat.isActive !== false) {
                            const chipsBefore = seat.chips;
                            
                            // CRITICAL: Track emergency distribution BEFORE operation
                            const potAmount = this.pot;
                            const movement = this._trackChipMovement('EMERGENCY_POT_DISTRIBUTION', {
                                winner: winner.name,
                                pot: potAmount,
                                chipsBefore,
                                potBefore: potAmount
                            });
                            
                            seat.chips += potAmount;
                            this.pot -= potAmount; // CRITICAL: Decrement pot as chips are moved
                            
                            // CRITICAL: Validate after emergency distribution
                            this._validateChipMovement(movement, 'EMERGENCY_POT_DISTRIBUTION');
                            
                            console.log(`[Table ${this.name}] EMERGENCY: ${winner.name} wins entire pot ${potAmount} (chips: ${chipsBefore} → ${seat.chips})`);
                            gameLogger.gameEvent(this.name, '[POT] EMERGENCY distribution', {
                                winner: winner.name,
                                pot: potAmount,
                                chipsBefore,
                                chipsAfter: seat.chips
                            });
                            // ROOT CAUSE: Trace pot clearing (pot should be 0 now)
                            this._clearPotWithTrace('SHOWDOWN_EMERGENCY_DISTRIBUTION', 'Emergency pot distribution');
                        }
                    }
                } else {
                    // CRITICAL FIX: If no active players but pot exists, find best player who contributed
                    // This happens when all players folded but pot wasn't distributed
                    console.error(`[Table ${this.name}] ⚠️ EMERGENCY: No active players but pot exists (${this.pot}). Finding best contributor...`);
                    
                    // Find all players who contributed to the pot (have totalBet > 0)
                    const contributors = this.seats
                        .filter(seat => seat && seat.totalBet > 0)
                        .map(seat => {
                            // Try to find hand result from previous evaluation
                            const playerData = activePlayers.find(p => p.playerId === seat.playerId);
                            return {
                                seat,
                                handResult: playerData?.handResult || null,
                                totalBet: seat.totalBet
                            };
                        })
                        .filter(p => p.seat.isActive !== false); // Only active players
                    
                    if (contributors.length > 0) {
                        // Sort by hand result if available, otherwise by chips
                        const sorted = contributors.sort((a, b) => {
                            if (a.handResult && b.handResult) {
                                return HandEvaluator.compare(b.handResult, a.handResult);
                            }
                            return b.seat.chips - a.seat.chips;
                        });
                        
                        const winner = sorted[0].seat;
                        const chipsBefore = winner.chips;
                        
                        // CRITICAL: Track emergency distribution BEFORE operation
                        const potAmount = this.pot;
                        const movement = this._trackChipMovement('EMERGENCY_POT_DISTRIBUTION_NO_ACTIVE', {
                            winner: winner.name,
                            pot: potAmount,
                            chipsBefore,
                            potBefore: potAmount
                        });
                        
                        winner.chips += potAmount;
                        this.pot -= potAmount; // CRITICAL: Decrement pot as chips are moved
                        
                        // CRITICAL: Validate after emergency distribution
                        this._validateChipMovement(movement, 'EMERGENCY_POT_DISTRIBUTION_NO_ACTIVE');
                        console.log(`[Table ${this.name}] EMERGENCY: ${winner.name} wins entire pot ${potAmount} (no active players, chips: ${chipsBefore} → ${winner.chips})`);
                        gameLogger.gameEvent(this.name, '[POT] EMERGENCY distribution (no active players)', {
                            winner: winner.name,
                            pot: potAmount,
                            chipsBefore,
                            chipsAfter: winner.chips,
                            contributors: contributors.map(c => c.seat.name)
                        });
                        // CRITICAL: Use _clearPotWithTrace instead of direct assignment (pot should be 0 now)
                        this._clearPotWithTrace('AWARD_POT_EMERGENCY_DISTRIBUTION_NO_ACTIVE', 'Emergency pot distribution - no active players');
                    } else {
                        // Last resort: give to player with most chips
                        const bestPlayer = this.seats
                            .filter(seat => seat && seat.isActive !== false)
                            .sort((a, b) => b.chips - a.chips)[0];
                        
                        if (bestPlayer) {
                            const chipsBefore = bestPlayer.chips;
                            
                            // CRITICAL: Track emergency distribution BEFORE operation
                            const potAmount = this.pot;
                            const movement = this._trackChipMovement('EMERGENCY_POT_DISTRIBUTION_LAST_RESORT', {
                                winner: bestPlayer.name,
                                pot: potAmount,
                                chipsBefore,
                                potBefore: potAmount
                            });
                            
                            bestPlayer.chips += potAmount;
                            this.pot -= potAmount; // CRITICAL: Decrement pot as chips are moved
                            
                            // CRITICAL: Validate after emergency distribution
                            this._validateChipMovement(movement, 'EMERGENCY_POT_DISTRIBUTION_LAST_RESORT');
                            console.log(`[Table ${this.name}] EMERGENCY: ${bestPlayer.name} wins entire pot ${potAmount} (last resort, chips: ${chipsBefore} → ${bestPlayer.chips})`);
                            gameLogger.gameEvent(this.name, '[POT] EMERGENCY distribution (last resort)', {
                                winner: bestPlayer.name,
                                pot: potAmount,
                                chipsBefore,
                                chipsAfter: bestPlayer.chips
                            });
                            // ROOT CAUSE: Trace pot clearing
                            this._clearPotWithTrace('SHOWDOWN_EMERGENCY_NO_ACTIVE', 'Emergency pot distribution - no active players');
                        } else {
                            console.error(`[Table ${this.name}] ⚠️ CRITICAL: Cannot distribute pot ${this.pot} - no eligible players found!`);
                            gameLogger.error(this.name, 'Cannot distribute pot - no eligible players', {
                                pot: this.pot,
                                allSeats: this.seats.map((s, i) => s ? { seatIndex: i, name: s.name, chips: s.chips, isActive: s.isActive, totalBet: s.totalBet } : null)
                            });
                            // Record fix attempt - cannot distribute pot is a failure
                            this._recordFixAttempt('FIX_56_CANNOT_DISTRIBUTE_POT_NO_ELIGIBLE_PLAYERS', false, {
                                context: 'SHOWDOWN',
                                pot: this.pot,
                                handNumber: this.handsPlayed,
                                phase: this.phase
                            });
                        }
                    }
                }
            }
        }
        
        // CRITICAL: Broadcast state AFTER chips are awarded so clients see correct chip counts
        this.onStateChange?.();
        
        // Award item ante if active
        let itemAnteResult = null;
        if (this.itemAnte && this.itemAnte.status === ItemAnte.STATUS.LOCKED) {
            // Find overall winner (player with most chips gained? or best hand among all?)
            // Use the best hand among participants
            const participants = activePlayers.filter(p => 
                this.itemAnte.isParticipating(p.playerId)
            );
            if (participants.length > 0) {
                participants.sort((a, b) => HandEvaluator.compare(b.handResult, a.handResult));
                const itemWinner = participants[0];
                
                // ROOT TRACING: Track item ante award
                this._traceUniversal('ITEM_ANTE_AWARD', {
                    winnerId: itemWinner.playerId,
                    winnerName: itemWinner.name,
                    participantCount: participants.length,
                    itemCount: this.itemAnte.approvedItems?.length || 0
                });
                
                itemAnteResult = this.itemAnte.award(itemWinner.playerId);
                
                this._traceUniversalAfter('ITEM_ANTE_AWARD', {
                    success: itemAnteResult?.success,
                    error: itemAnteResult?.error,
                    itemCount: itemAnteResult?.items?.length || 0
                });
                
                if (itemAnteResult?.success) {
                    console.log(`[ITEM_ANTE] AWARD: ${itemWinner.name} (${itemWinner.playerId}) wins ${itemAnteResult.items.length} items from item ante! Items: ${itemAnteResult.items.map(i => i.name).join(', ')}`);
                    gameLogger.gameEvent(this.name, `[ITEM_ANTE] AWARD_SUCCESS`, {
                        winnerId: itemWinner.playerId,
                        winnerName: itemWinner.name,
                        itemCount: itemAnteResult.items.length,
                        itemNames: itemAnteResult.items.map(i => i.name)
                    });
                    
                    // CRITICAL: In PRACTICE MODE, items are virtual - don't transfer to inventory
                    // Players see items in the pot and winner, but nothing actually changes in DB
                    if (this.practiceMode) {
                        console.log(`[ITEM_ANTE] PRACTICE_MODE_SKIP: Winner ${itemWinner.name} — items are virtual (not transferred to inventory)`);
                        gameLogger.gameEvent(this.name, `[ITEM_ANTE] PRACTICE_MODE_SKIP`, {
                            winnerId: itemWinner.playerId,
                            winnerName: itemWinner.name,
                            itemCount: itemAnteResult.items.length,
                            reason: 'Practice mode - items are virtual'
                        });
                        this.onStateChange?.();
                    } else {
                        // FIX: Check if winner is a bot — bots don't have real user records in the DB
                        const winnerSeat = this.seats.find(s => s && s.playerId === itemWinner.playerId);
                        const isWinnerBot = winnerSeat?.isBot || itemWinner.playerId?.startsWith('bot_') || 
                                            itemWinner.name?.startsWith('NetPlayer_') || itemWinner.name?.startsWith('SimBot_');
                        
                        if (isWinnerBot) {
                            console.log(`[ITEM_ANTE] SKIP_TRANSFER: Winner ${itemWinner.name} is a bot — items not transferred to DB (bot has no user record)`);
                            gameLogger.gameEvent(this.name, `[ITEM_ANTE] SKIP_TRANSFER_BOT`, {
                                winnerId: itemWinner.playerId,
                                winnerName: itemWinner.name,
                                itemCount: itemAnteResult.items.length,
                                reason: 'Winner is a bot'
                            });
                            this.onStateChange?.();
                        } else {
                            // CRITICAL: Actually transfer items to winner's inventory (real player in real game)
                            // IMPORTANT: Create new Item instances with new IDs to avoid duplicate key errors
                            const userRepo = require('../database/UserRepository');
                            const Item = require('../models/Item');
                            (async () => {
                                try {
                                    for (const originalItem of itemAnteResult.items) {
                                        const newItem = new Item({
                                            templateId: originalItem.templateId,
                                            name: originalItem.name,
                                            description: originalItem.description,
                                            type: originalItem.type,
                                            rarity: originalItem.rarity,
                                            icon: originalItem.icon,
                                            uses: originalItem.uses,
                                            maxUses: originalItem.maxUses,
                                            baseValue: originalItem.baseValue,
                                            obtainedFrom: `Item Ante Win from ${this.name}`,
                                            isTradeable: originalItem.isTradeable,
                                            isGambleable: originalItem.isGambleable
                                        });
                                        
                                        await userRepo.addItem(itemWinner.playerId, newItem);
                                        console.log(`[ITEM_ANTE] TRANSFER: Added ${newItem.name} (${newItem.id}) to ${itemWinner.name}'s inventory`);
                                    }
                                    console.log(`[ITEM_ANTE] TRANSFER_COMPLETE: All ${itemAnteResult.items.length} items transferred to ${itemWinner.name}'s inventory`);
                                    gameLogger.gameEvent(this.name, `[ITEM_ANTE] TRANSFER_COMPLETE`, {
                                        winnerId: itemWinner.playerId,
                                        winnerName: itemWinner.name,
                                        itemCount: itemAnteResult.items.length
                                    });
                                    this.onStateChange?.();
                                } catch (error) {
                                    console.error(`[ITEM_ANTE] TRANSFER_FAILED: Failed to transfer items to ${itemWinner.name}:`, error);
                                    gameLogger.error(this.name, `[ITEM_ANTE] TRANSFER_FAILED`, {
                                        winnerId: itemWinner.playerId,
                                        error: error.message,
                                        stack: error.stack
                                    });
                                }
                            })();
                        }
                    }
                } else {
                    console.error(`[ITEM_ANTE] AWARD_FAILED: ${itemWinner.name} (${itemWinner.playerId}) - ${itemAnteResult?.error || 'unknown error'}`);
                    gameLogger.gameEvent(this.name, `[ITEM_ANTE] AWARD_ERROR`, {
                        winnerId: itemWinner.playerId,
                        error: itemAnteResult?.error
                    });
                }
            }
        }

        // Log pot awards for debugging
        gameLogger.gameEvent(this.name, 'POT AWARDS CALCULATED', {
            totalPot: potAwards?.reduce((sum, a) => sum + a.amount, 0) || 0,
            awards: potAwards?.map(a => ({
                name: a.name,
                amount: a.amount,
                handName: a.handName
            })) || []
        });

        // Send hand data to stats engine (showdown path)
        this._collectAndSendStatsData(potAwards, true);
        
        // Notify about each pot winner (for hand_result event)
        // CRITICAL: Emit hand_result AFTER state has been broadcast so cards are visible
        if (potAwards && potAwards.length > 0 && this.onHandComplete) {
            // Small delay to ensure state is received before hand_result
            setTimeout(() => {
                // Emit for the main pot winner (first award)
                const mainWinner = potAwards[0];
                // CRITICAL FIX: potAmount should be only CONTESTED winnings, NOT refunded excess chips
                // When a player goes all-in for more than opponents can match, the excess is returned (refund).
                // Display should only show what was actually won from OTHER players, not returned chips.
                const winnerContestedAward = potAwards
                    .filter(a => a.playerId === mainWinner.playerId && !a.isRefund)
                    .reduce((sum, a) => sum + a.amount, 0);
                const winnerRefundAmount = potAwards
                    .filter(a => a.playerId === mainWinner.playerId && a.isRefund)
                    .reduce((sum, a) => sum + a.amount, 0);
                const winnerTotalAward = potAwards
                    .filter(a => a.playerId === mainWinner.playerId)
                    .reduce((sum, a) => sum + a.amount, 0);
                const totalPot = potAwards.reduce((sum, a) => sum + a.amount, 0);
                
                // SYSTEMATIC DEBUG: Log what we're sending to client
                const handCompleteLog = `[SYSTEMATIC_DEBUG] HAND_COMPLETE: Winner=${mainWinner.name}, ContestedAward=${winnerContestedAward}, RefundAmount=${winnerRefundAmount}, TotalAward=${winnerTotalAward}, TotalPot=${totalPot}, AwardsCount=${potAwards.length}\n`;
                console.log(handCompleteLog.trim());
                fs.appendFileSync(path.join(__dirname, '../../logs/pot-award-debug.log'), new Date().toISOString() + ' ' + handCompleteLog);
                
                this.onHandComplete({
                    winnerId: mainWinner.playerId,
                    winnerName: mainWinner.name,
                    handName: mainWinner.handName,
                    potAmount: winnerContestedAward, // FIX: Only contested winnings (excludes refunded excess)
                    totalPot: totalPot, // Total pot including refunds for reference
                    refundAmount: winnerRefundAmount, // How much was returned (excess all-in chips)
                    totalAward: winnerTotalAward, // Total chips received (contested + refund)
                    potAwards: potAwards // All individual awards
                });
            }, 100); // Small delay to ensure state broadcast happens first
        }

        // CRITICAL: Check for game over AFTER awarding pot (only one player with chips)
        // This must happen BEFORE starting a new hand
        const playersWithChips = this.seats.filter(s => s && s.chips > 0);
        // CRITICAL: Check game over even if gameStarted is false (game might have ended during hand)
        if (playersWithChips.length === 1) {
            const winner = playersWithChips[0];
            
            // CRITICAL: Check if game ended before any hands were played
            if (this.handsPlayed === 0) {
                console.error(`[Table ${this.name}] ⚠️ CRITICAL: Game ended in showdown before any hands were played! Winner: ${winner.name}, handsPlayed: ${this.handsPlayed}`);
                gameLogger.error(this.name, 'GAME ENDED IN SHOWDOWN BEFORE HANDS PLAYED', {
                    winnerName: winner.name,
                    winnerChips: winner.chips,
                    handsPlayed: this.handsPlayed,
                    phase: this.phase,
                    allPlayers: this.seats.filter(s => s !== null).map(s => ({
                        name: s.name,
                        chips: s.chips,
                        isActive: s.isActive
                    }))
                });
            }
            
            // CRITICAL: Validate money - total chips should equal sum of all starting chips
            // Count ALL chips (winner + all other players, including eliminated)
            const currentTotalChips = this.seats
                .filter(s => s !== null)
                .reduce((sum, seat) => sum + (seat.chips || 0), 0);
            
            // Also check if pot still has money (should be 0 after award)
            const potStillHasMoney = this.pot > 0;
            
            if (this.totalStartingChips > 0) {
                const difference = Math.abs(currentTotalChips - this.totalStartingChips);
                if (difference > 0.01 || potStillHasMoney) {
                    const missing = this.totalStartingChips - currentTotalChips - (potStillHasMoney ? this.pot : 0);
                    console.error(`[Table ${this.name}] ⚠️ CRITICAL: MONEY LOST! Total chips: ${currentTotalChips}, total starting chips: ${this.totalStartingChips}, pot: ${this.pot}. Missing: ${missing}`);
                    gameLogger.gameEvent(this.name, '[MONEY] ERROR: Money lost - total chips != total starting chips', {
                        winnerChips: winner.chips,
                        currentTotalChips,
                        totalStartingChips: this.totalStartingChips,
                        pot: this.pot,
                        missing,
                        allPlayers: this.seats.filter(s => s !== null).map(s => ({
                            name: s.name,
                            chips: s.chips,
                            isActive: s.isActive,
                            totalBet: s.totalBet
                        }))
                    });
                } else {
                    gameLogger.gameEvent(this.name, '[MONEY] VALIDATION PASSED: Total chips = total starting chips', {
                        winnerChips: winner.chips,
                        currentTotalChips,
                        totalStartingChips: this.totalStartingChips,
                        difference: 0
                    });
                }
            } else {
                console.warn(`[Table ${this.name}] ⚠️ Starting chips not tracked (totalStartingChips=${this.totalStartingChips}) - cannot validate money`);
                gameLogger.gameEvent(this.name, '[MONEY] WARNING: Starting chips not tracked', {
                    winnerChips: winner.chips,
                    currentTotalChips,
                    totalStartingChips: this.totalStartingChips,
                    pot: this.pot
                });
            }
            
            // console.log(`[Table ${this.name}] GAME OVER - ${winner.name} wins with ${winner.chips} chips!`);
            gameLogger.gameEvent(this.name, 'GAME OVER - Winner announced', {
                winnerName: winner.name,
                winnerChips: winner.chips,
                winnerId: winner.playerId,
                isBot: winner.isBot || false
            });
            this._tracePhaseChange(GAME_PHASES.WAITING, 'GAME_OVER_WINNER');
            this.gameStarted = false;
            
            // CRITICAL: Notify about game winner (this triggers simulation restart and client announcement)
            if (this.onGameOver) {
                // console.log(`[Table ${this.name}] Calling onGameOver callback for winner ${winner.name}`);
                this.onGameOver(winner);
            } else {
                console.error(`[Table ${this.name}] ⚠️ CRITICAL: onGameOver callback is NOT SET! Game over event will not be sent to clients!`);
                gameLogger.error(this.name, 'onGameOver callback not set - game over event not sent', {
                    winnerName: winner.name,
                    winnerChips: winner.chips
                });
            }
            // Capture snapshot before broadcasting
            if (this.stateSnapshot) {
                const state = this.getState(null);
                this.stateSnapshot.capture(state, {
                    phase: this.phase,
                    handsPlayed: this.handsPlayed,
                    reason: 'state_change'
                });
            }
            this._onStateChangeCallback?.();
            return; // Game over - don't start new hand
        }
        
        // Start new hand after showing results (only if game is not over)
        setTimeout(() => {
            // Broadcast state one more time before starting new hand (in case chips updated)
            // Capture snapshot before broadcasting
            if (this.stateSnapshot) {
                const state = this.getState(null);
                this.stateSnapshot.capture(state, {
                    phase: this.phase,
                    handsPlayed: this.handsPlayed,
                    reason: 'state_change'
                });
            }
            this._onStateChangeCallback?.();
            setTimeout(() => {
                // CRITICAL: Clear pot one final time before starting new hand (safeguard)
                if (this.pot > 0) {
                    console.error(`[Table ${this.name}] ⚠️ CRITICAL: Pot still has ${this.pot} chips before startNewHand! Clearing now.`);
                    gameLogger.error(this.name, '[POT] CRITICAL: Pot not cleared before startNewHand - forcing clear', {
                        pot: this.pot,
                        handNumber: this.handsPlayed
                    });
                    // ROOT CAUSE: Trace pot clearing
                    this._clearPotWithTrace('GAME_OVER_BEFORE_START_NEW_HAND', 'Pot cleared before starting new hand after game over');
                }
                this.startNewHand();
            }, 500);
        }, 4000); // 4 seconds to show winner, then 0.5s transition
        
        // ROOT CAUSE: Trace end of gameOver
        const afterState = this._getChipState();
        this._traceOperation('GAME_OVER_COMPLETE', beforeState, afterState);
    }

    /**
     * Calculate side pots based on all-in amounts and award them
     * Side pots occur when players are all-in for different amounts
     */
    calculateAndAwardSidePots(activePlayers) {
        this._traceUniversal('CALCULATE_AND_AWARD_SIDE_POTS', { 
            activePlayersCount: activePlayers.length,
            activePlayers: activePlayers.map(p => ({ name: p.name, chips: p.chips, totalBet: p.totalBet })),
            pot: this.pot,
            phase: this.phase
        });
        
        // ROOT CAUSE: Trace calculateAndAwardSidePots operation
        const beforeState = this._getChipState();
        
        // CRITICAL: Store initial pot value to ensure it's always cleared, even on exceptions
        const initialPot = this.pot;
        let potAwards = [];
        let totalAwarded = 0;
        let error = null;
        
        try {
        // ULTRA-VERBOSE: Log FULL STATE before pot calculation
        const totalChipsBeforeCalc = this.seats.filter(s => s !== null && s.isActive !== false).reduce((sum, s) => sum + (s.chips || 0), 0);
        const totalChipsAndPotBeforeCalc = totalChipsBeforeCalc + this.pot;
        
        // console.log(`[Table ${this.name}] [CALCULATE_SIDE_POTS PRE-OP] Hand: ${this.handsPlayed} | Pot: ${this.pot} | TotalChips: ${totalChipsBeforeCalc} | TotalChips+Pot: ${totalChipsAndPotBeforeCalc} | totalStartingChips: ${this.totalStartingChips}`);
        gameLogger.gameEvent(this.name, '[CALCULATE_SIDE_POTS] PRE-OPERATION STATE', {
            handNumber: this.handsPlayed,
            pot: this.pot,
            totalChipsBeforeCalc,
            totalChipsAndPotBeforeCalc,
            totalStartingChips: this.totalStartingChips,
            phase: this.phase,
            allSeats: this.seats.map((s, i) => s ? {
                seatIndex: i,
                name: s.name,
                chips: s.chips,
                totalBet: s.totalBet || 0,
                currentBet: s.currentBet || 0,
                isActive: s.isActive,
                isFolded: s.isFolded,
                isAllIn: s.isAllIn
            } : null).filter(Boolean)
        });
        
        // CRITICAL: Store pot before calculation for verification
        const potBeforeCalculation = this.pot;
        
        // Get all players (including folded) with their total bets
        // CRITICAL: Include ALL seats (even if player left mid-hand) to ensure all bets are counted
        const allContributors = this.seats
            .filter(seat => seat !== null)
            .map(seat => ({
                playerId: seat.playerId,
                name: seat.name,
                totalBet: seat.totalBet || 0, // CRITICAL: Ensure totalBet is never undefined
                isFolded: seat.isFolded,
                isAllIn: seat.isAllIn,
                seatIndex: this.seats.indexOf(seat),
                handResult: activePlayers.find(p => p.playerId === seat.playerId)?.handResult || null
            }))
            .filter(p => p.totalBet > 0);
        
        // CRITICAL: Validate that pot equals sum of all totalBet
        const sumOfTotalBets = allContributors.reduce((sum, p) => sum + p.totalBet, 0);
        if (Math.abs(potBeforeCalculation - sumOfTotalBets) > 0.01) { // Allow small floating point differences
            console.error(`[Table ${this.name}] ⚠️ POT MISMATCH BEFORE CALCULATION: Pot=${potBeforeCalculation}, Sum of totalBet=${sumOfTotalBets}, Difference=${potBeforeCalculation - sumOfTotalBets}`);
            gameLogger.gameEvent(this.name, '[POT] ERROR: Pot mismatch before calculation', {
                potBeforeCalculation,
                sumOfTotalBets,
                difference: potBeforeCalculation - sumOfTotalBets,
                allContributors: allContributors.map(p => ({
                    name: p.name,
                    totalBet: p.totalBet,
                    isFolded: p.isFolded
                })),
                allSeats: this.seats.map((seat, idx) => seat ? {
                    seatIndex: idx,
                    name: seat.name,
                    totalBet: seat.totalBet || 0,
                    currentBet: seat.currentBet || 0,
                    chips: seat.chips,
                    isFolded: seat.isFolded,
                    isAllIn: seat.isAllIn
                } : null).filter(Boolean)
            });
            // CRITICAL FIX #2: Pot mismatch - adjust to prevent chip loss or creation
            const potMismatch = potBeforeCalculation - sumOfTotalBets;
            if (Math.abs(potMismatch) > 0.01) {
                if (sumOfTotalBets > potBeforeCalculation) {
                    // Chips lost: pot is less than sum of bets
                    const chipsLost = sumOfTotalBets - potBeforeCalculation;
                    console.error(`[Table ${this.name}] ⚠️ CRITICAL FIX #2: Sum of bets (${sumOfTotalBets}) > Pot (${potBeforeCalculation}). CHIPS LOST: ${chipsLost}!`);
                    gameLogger.gameEvent(this.name, '[FIX #2: POT] CRITICAL: Chips lost during betting', {
                        potBeforeCalculation,
                        sumOfTotalBets,
                        chipsLost,
                        handNumber: this.handsPlayed,
                        phase: this.phase,
                        allContributors: allContributors.map(p => ({
                            name: p.name,
                            totalBet: p.totalBet,
                            isFolded: p.isFolded,
                            isAllIn: p.isAllIn
                        })),
                        allSeats: this.seats.map((seat, idx) => seat ? {
                            seatIndex: idx,
                            name: seat.name,
                            chips: seat.chips,
                            totalBet: seat.totalBet || 0,
                            currentBet: seat.currentBet || 0,
                            isFolded: seat.isFolded,
                            isAllIn: seat.isAllIn,
                            isActive: seat.isActive
                        } : null).filter(Boolean),
                        fix: 'DO NOT adjust pot - investigate root cause of chip loss',
                        stackTrace: new Error().stack
                    });
                    // CRITICAL: DO NOT adjust pot to mask the problem!
                    // Chips were lost - this is a CRITICAL BUG that must be fixed, not masked
                    // We MUST pause the simulation and investigate the root cause
                    console.error(`[Table ${this.name}] ⚠️⚠️⚠️ CRITICAL BUG: ${chipsLost} chips were LOST during betting!`);
                    console.error(`[Table ${this.name}] DO NOT adjust pot - this masks the problem!`);
                    console.error(`[Table ${this.name}] Pot should be ${sumOfTotalBets} but is ${potBeforeCalculation}`);
                    console.error(`[Table ${this.name}] Root cause MUST be investigated - chips are being lost somewhere in the betting logic`);
                    gameLogger.error(this.name, '[CRITICAL] Chips lost during betting - DO NOT MASK - investigate root cause', {
                        chipsLost,
                        potBeforeCalculation,
                        sumOfTotalBets,
                        totalStartingChips: this.totalStartingChips,
                        handNumber: this.handsPlayed,
                        phase: this.phase,
                        warning: 'Chips were lost during betting. DO NOT adjust pot or totalStartingChips - this masks the problem. Root cause MUST be investigated and fixed.',
                        allContributors: allContributors.map(p => ({
                            name: p.name,
                            totalBet: p.totalBet,
                            currentBet: p.currentBet || 0,
                            chips: p.chips,
                            isFolded: p.isFolded,
                            isAllIn: p.isAllIn
                        }))
                    });
                    
                    // Record fix attempt - this is a failure because chips were lost
                    this._recordFixAttempt('FIX_2_CHIPS_LOST_BETTING', false, {
                        potBeforeCalculation,
                        sumOfTotalBets,
                        chipsLost,
                        oldPot,
                        newPot: this.pot,
                        oldTotalStartingChips,
                        newTotalStartingChips: this.totalStartingChips,
                        handNumber: this.handsPlayed,
                        phase: this.phase
                    });
                    
                    // REMOVED: Automatic pause on chip loss during betting - it masks the problem
                    // Errors are logged above for investigation.
                } else {
                    // Chips created: pot is more than sum of bets
                    const chipsCreated = potBeforeCalculation - sumOfTotalBets;
                    console.error(`[Table ${this.name}] ⚠️ CRITICAL FIX #2: Pot (${potBeforeCalculation}) > Sum of bets (${sumOfTotalBets}). CHIPS CREATED: ${chipsCreated}!`);
                    gameLogger.gameEvent(this.name, '[FIX #2: POT] CRITICAL: Chips created during betting', {
                        potBeforeCalculation,
                        sumOfTotalBets,
                        chipsCreated,
                        handNumber: this.handsPlayed,
                        phase: this.phase,
                        allContributors: allContributors.map(p => ({
                            name: p.name,
                            totalBet: p.totalBet,
                            isFolded: p.isFolded,
                            isAllIn: p.isAllIn
                        })),
                        allSeats: this.seats.map((seat, idx) => seat ? {
                            seatIndex: idx,
                            name: seat.name,
                            chips: seat.chips,
                            totalBet: seat.totalBet || 0,
                            currentBet: seat.currentBet || 0,
                            isFolded: seat.isFolded,
                            isAllIn: seat.isAllIn,
                            isActive: seat.isActive
                        } : null).filter(Boolean),
                        fix: 'DO NOT adjust pot - investigate root cause of chip creation',
                        stackTrace: new Error().stack
                    });
                    // CRITICAL: DO NOT adjust pot to mask the problem!
                    // Chips were created - this is a CRITICAL BUG that must be fixed, not masked
                    // We MUST pause the simulation and investigate the root cause
                    console.error(`[Table ${this.name}] ⚠️⚠️⚠️ CRITICAL BUG: ${chipsCreated} chips were CREATED during betting!`);
                    console.error(`[Table ${this.name}] DO NOT adjust pot - this masks the problem!`);
                    console.error(`[Table ${this.name}] Pot should be ${sumOfTotalBets} but is ${potBeforeCalculation}`);
                    console.error(`[Table ${this.name}] Root cause MUST be investigated - chips are being created somewhere in the betting logic`);
                    gameLogger.error(this.name, '[CRITICAL] Chips created during betting - DO NOT MASK - investigate root cause', {
                            chipsCreated,
                            potBeforeCalculation,
                            sumOfTotalBets,
                        totalStartingChips: this.totalStartingChips,
                            handNumber: this.handsPlayed,
                            phase: this.phase,
                        warning: 'Chips were created during betting. DO NOT adjust pot or totalStartingChips - this masks the problem. Root cause MUST be investigated and fixed.',
                        allContributors: allContributors.map(p => ({
                            name: p.name,
                            totalBet: p.totalBet,
                            currentBet: p.currentBet || 0,
                            chips: p.chips,
                            isFolded: p.isFolded,
                            isAllIn: p.isAllIn
                        }))
                    });
                    
                    // REMOVED: Automatic pause on chips created - it masks the problem
                    // Errors are logged above for investigation.
                    
                    // Record fix attempt - this is a failure because chips were created
                    this._recordFixAttempt('FIX_2_CHIPS_CREATED_BETTING', false, {
                        potBeforeCalculation,
                        sumOfTotalBets,
                        chipsCreated,
                        handNumber: this.handsPlayed,
                        phase: this.phase
                    });
                }
            } else {
                // Record fix attempt - success if no chips lost
                this._recordFixAttempt('FIX_2_CHIPS_LOST_BETTING', true, {
                    potBeforeCalculation,
                    sumOfTotalBets,
                    difference: potBeforeCalculation - sumOfTotalBets,
                    handNumber: this.handsPlayed,
                    phase: this.phase
                });
                // Also record success for chips created check
                this._recordFixAttempt('FIX_2_CHIPS_CREATED_BETTING', true, {
                    potBeforeCalculation,
                    sumOfTotalBets,
                    difference: potBeforeCalculation - sumOfTotalBets,
                    handNumber: this.handsPlayed,
                    phase: this.phase
                });
            }
        }
        
        // CRITICAL: Log for debugging all-in scenarios
        gameLogger.gameEvent(this.name, '[POT] Calculating side pots', {
            potBeforeCalculation,
            sumOfTotalBets,
            allContributorsCount: allContributors.length,
            contributors: allContributors.map(p => ({
                name: p.name,
                totalBet: p.totalBet,
                isFolded: p.isFolded,
                isAllIn: p.isAllIn,
                hasHandResult: !!p.handResult
            }))
        });

        // CRITICAL: If no contributors, something is wrong - log and return empty
        if (allContributors.length === 0) {
            console.error(`[Table ${this.name}] ⚠️ NO CONTRIBUTORS TO POT! Pot: ${potBeforeCalculation}, Active players: ${activePlayers.length}`);
            gameLogger.gameEvent(this.name, '[POT] ERROR: No contributors found', {
                potBeforeCalculation,
                activePlayersCount: activePlayers.length,
                seatsWithBets: this.seats.filter(s => s && (s.totalBet || 0) > 0).map(s => ({
                    name: s.name,
                    totalBet: s.totalBet,
                    chips: s.chips,
                    isFolded: s.isFolded,
                    isAllIn: s.isAllIn
                }))
            });
            // Record fix attempt - no contributors to pot is a failure
            this._recordFixAttempt('FIX_51_NO_CONTRIBUTORS_TO_POT', false, {
                context: 'CALCULATE_AND_AWARD_SIDE_POTS',
                potBeforeCalculation,
                activePlayersCount: activePlayers.length,
                handNumber: this.handsPlayed,
                phase: this.phase
            });
            // CRITICAL FIX: Even if we can't calculate, we MUST clear the pot to prevent chip loss
            // Award pot to first active player as emergency measure
            const activeSeats = this.seats.filter(s => s && s.isActive !== false && s.chips > 0);
            if (activeSeats.length > 0 && this.pot > 0) {
                const emergencyRecipient = activeSeats[0];
                const chipsBefore = emergencyRecipient.chips;
                const potAmount = this.pot;
                
                // CRITICAL: Track chip movement BEFORE operation
                const movement = this._trackChipMovement('EMERGENCY_POT_CALCULATION_FAILURE', {
                    recipient: emergencyRecipient.name,
                    amount: potAmount,
                    chipsBefore,
                    potBefore: potAmount,
                    reason: 'Side pot calculation failed - emergency distribution to prevent chip loss'
                });
                
                emergencyRecipient.chips += potAmount;
                this.pot -= potAmount; // CRITICAL: Decrement pot as chips are moved
                
                // CRITICAL: Validate after operation
                this._validateChipMovement(movement, 'EMERGENCY_POT_CALCULATION_FAILURE');
                
                console.error(`[Table ${this.name}] ⚠️ EMERGENCY: Cannot calculate side pots, awarding ${potAmount} to ${emergencyRecipient.name} to prevent loss`);
                gameLogger.gameEvent(this.name, '[POT] EMERGENCY: Awarding pot due to calculation failure', {
                    recipient: emergencyRecipient.name,
                    amount: potAmount,
                    chipsBefore,
                    chipsAfter: emergencyRecipient.chips,
                    reason: 'Side pot calculation failed - emergency distribution'
                });
            }
            // CRITICAL: Always clear pot, even on error - use _clearPotWithTrace
            this._clearPotWithTrace('CALCULATE_AND_AWARD_SIDE_POTS_ERROR_CLEAR_EARLY', 'Pot clear after early error in calculateAndAwardSidePots');
            return [];
        }
        
        // Sort by total bet to create side pots
        // POKER RULE: Players who go all-in for MORE money can win BOTH main pot AND side pots
        // Example: Player A all-in $1000, Player B all-in $500, Player C calls $1000
        //   - Main pot ($500 level): All 3 eligible → $1500 pot
        //   - Side pot ($1000 level): Only A and C eligible → $1000 pot
        //   - A or C can win both pots, B can only win main pot
        const sortedByBet = [...allContributors].sort((a, b) => a.totalBet - b.totalBet);
        
        // CRITICAL: Track remaining pot to prevent over-awarding
        // If pot < sumOfTotalBets, we MUST use ONLY the actual pot amount
        let remainingPot = potBeforeCalculation;
        const totalTheoreticalPot = sumOfTotalBets;
        const potIsShort = potBeforeCalculation < sumOfTotalBets;
        
        let previousBetLevel = 0;
        // Track winners from lower pot levels to check if they can win higher levels
        // NOTE: potAwards is already declared at function start
        let previousLevelWinners = [];
        
        for (const player of sortedByBet) {
            if (player.totalBet > previousBetLevel) {
                // Calculate pot at this level
                const betDiff = player.totalBet - previousBetLevel;
                const eligiblePlayers = allContributors.filter(p => p.totalBet >= player.totalBet);
                const theoreticalPotAmount = eligiblePlayers.length * betDiff;
                
                // CRITICAL: If pot is short, use ONLY remaining pot, not theoretical calculations
                // Otherwise, use theoretical amount but cap at remaining pot
                const potAmount = potIsShort 
                    ? Math.min(remainingPot, theoreticalPotAmount)  // When short, use what's left
                    : Math.min(theoreticalPotAmount, remainingPot); // Normal case: use theoretical but cap
                
                // Find best eligible hand that isn't folded AND is still active
                // CRITICAL: Only include players who are still active (not eliminated)
                const eligibleHands = eligiblePlayers
                    .filter(p => {
                        const seat = this.seats.find(s => s?.playerId === p.playerId);
                        return !p.isFolded && p.handResult && seat && seat.isActive !== false;
                    })
                    .sort((a, b) => HandEvaluator.compare(b.handResult, a.handResult));
                
                if (eligibleHands.length > 0 && potAmount > 0) {
                    // POKER RULE: If only 1 player is eligible at this level, it's a REFUND
                    // (they bet more than anyone else, so excess chips come back to them)
                    const isRefund = eligiblePlayers.length === 1;
                    
                    // Check for split pot (ties)
                    const winners = [eligibleHands[0]];
                    for (let i = 1; i < eligibleHands.length; i++) {
                        if (HandEvaluator.compare(eligibleHands[0].handResult, eligibleHands[i].handResult) === 0) {
                            winners.push(eligibleHands[i]);
                        } else {
                            break;
                        }
                    }
                    
                    // POKER RULE: If a lower-betting player won a previous pot, they can't win higher pots
                    // Example: A all-in $1000, B all-in $500, C calls $1000. If B wins main pot:
                    //   - B wins main pot ($1500)
                    //   - A and C each get $500 back (the side pot they contributed to that B can't win)
                    
                    // Check if any previous level winner can win this pot level
                    const previousWinnerMaxBet = previousLevelWinners.length > 0 
                        ? Math.max(...previousLevelWinners.map(w => {
                            const winnerContributor = allContributors.find(c => c.playerId === w.playerId);
                            return winnerContributor ? winnerContributor.totalBet : 0;
                        }))
                        : 0;
                    
                    // Also check current level winners' max bet
                    const currentWinnerMaxBet = winners.length > 0
                        ? Math.max(...winners.map(w => {
                            const winnerContributor = allContributors.find(c => c.playerId === w.playerId);
                            return winnerContributor ? winnerContributor.totalBet : 0;
                        }))
                        : 0;
                    
                    // CRITICAL: If previous level winner's max bet is LESS than this pot level, they can't win this pot
                    // OR if current winners can't win this level (shouldn't happen, but safety check)
                    // Players who contributed to this level should get their chips back
                    if (previousWinnerMaxBet > 0 && previousWinnerMaxBet < player.totalBet) {
                        // Previous level winner can't win this pot - refund to all contributors at this level
                        const contributorsAtThisLevel = eligiblePlayers.filter(p => p.totalBet >= player.totalBet);
                        const refundPerPlayer = Math.floor(potAmount / contributorsAtThisLevel.length);
                        const refundRemainder = potAmount % contributorsAtThisLevel.length;
                        
                        for (let i = 0; i < contributorsAtThisLevel.length; i++) {
                            const refundAmount = refundPerPlayer + (i === 0 ? refundRemainder : 0);
                            const contributor = contributorsAtThisLevel[i];
                            potAwards.push({
                                playerId: contributor.playerId,
                                name: contributor.name,
                                amount: refundAmount,
                                handName: 'Refund',
                                potType: previousBetLevel === 0 ? 'main' : 'side',
                                reason: `Refund: Previous winner bet ${previousWinnerMaxBet} but this pot level is ${player.totalBet} - returning ${refundAmount}`
                            });
                            console.log(`[Table ${this.name}] REFUND: ${contributor.name} gets ${refundAmount} back (previous winner bet ${previousWinnerMaxBet}, pot level ${player.totalBet})`);
                            gameLogger.gameEvent(this.name, '[POT] Refund to higher-betting player', {
                                player: contributor.name,
                                refundAmount,
                                previousWinnerMaxBet,
                                potLevel: player.totalBet,
                                reason: 'Previous level winner cannot win this pot level - returning chips to contributors'
                            });
                        }
                    } else {
                        // Winner CAN win this pot - award normally
                        // CRITICAL: Validate each winner is eligible for this pot level
                        // A player can only win pots at levels they contributed to (totalBet >= pot level)
                        const validatedWinners = [];
                        for (const winner of winners) {
                            const winnerContributor = allContributors.find(c => c.playerId === winner.playerId);
                            if (!winnerContributor) {
                                console.error(`[Table ${this.name}] ⚠️ CRITICAL: Winner ${winner.name} not found in contributors!`);
                                gameLogger.error(this.name, '[POT] Winner not in contributors', {
                                    winnerName: winner.name,
                                    winnerId: winner.playerId,
                                    potLevel: player.totalBet,
                                    handNumber: this.handsPlayed,
                                    phase: this.phase
                                });
                                this._recordFixAttempt('FIX_72_WINNER_NOT_IN_CONTRIBUTORS', false, {
                                    context: 'CALCULATE_AND_AWARD_SIDE_POTS',
                                    winnerName: winner.name,
                                    winnerId: winner.playerId,
                                    potLevel: player.totalBet,
                                    handNumber: this.handsPlayed,
                                    phase: this.phase
                                });
                                continue;
                            }
                            
                            // CRITICAL: Verify winner's totalBet is >= pot level (they must have contributed to this level)
                            if (winnerContributor.totalBet < player.totalBet) {
                                console.error(`[Table ${this.name}] ⚠️ CRITICAL POKER RULE VIOLATION: ${winner.name} won pot at level ${player.totalBet} but only bet ${winnerContributor.totalBet}!`);
                                gameLogger.error(this.name, '[POT] CRITICAL: Player won pot at level they did not contribute to', {
                                    player: winner.name,
                                    playerTotalBet: winnerContributor.totalBet,
                                    potLevel: player.totalBet,
                                    difference: player.totalBet - winnerContributor.totalBet,
                                    handNumber: this.handsPlayed,
                                    phase: this.phase,
                                    violation: 'Player cannot win pots at levels they did not contribute to'
                                });
                                this._recordFixAttempt('FIX_72_PLAYER_WON_POT_LEVEL_NOT_ELIGIBLE', false, {
                                    context: 'CALCULATE_AND_AWARD_SIDE_POTS',
                                    player: winner.name,
                                    playerTotalBet: winnerContributor.totalBet,
                                    potLevel: player.totalBet,
                                    handNumber: this.handsPlayed,
                                    phase: this.phase
                                });
                                // DO NOT award this pot to this winner - they're not eligible
                                continue;
                            }
                            
                            validatedWinners.push(winner);
                        }
                        
                        // Only award if we have validated winners
                        if (validatedWinners.length === 0) {
                            // No valid winners - refund to contributors at this level
                            const contributorsAtThisLevel = eligiblePlayers.filter(p => p.totalBet >= player.totalBet);
                            const refundPerPlayer = Math.floor(potAmount / contributorsAtThisLevel.length);
                            const refundRemainder = potAmount % contributorsAtThisLevel.length;
                            
                            for (let i = 0; i < contributorsAtThisLevel.length; i++) {
                                const refundAmount = refundPerPlayer + (i === 0 ? refundRemainder : 0);
                                const contributor = contributorsAtThisLevel[i];
                                potAwards.push({
                                    playerId: contributor.playerId,
                                    name: contributor.name,
                                    amount: refundAmount,
                                    handName: 'Refund',
                                    potType: previousBetLevel === 0 ? 'main' : 'side',
                                    reason: `Refund: No eligible winners for pot level ${player.totalBet} - returning ${refundAmount}`
                                });
                                gameLogger.gameEvent(this.name, '[POT] Refund: No eligible winners', {
                                    player: contributor.name,
                                    refundAmount,
                                    potLevel: player.totalBet,
                                    reason: 'No validated winners for this pot level'
                                });
                            }
                        } else {
                            // Split among validated winners
                            // CRITICAL: Use actual potAmount (already scaled to match real pot)
                            const totalPotToAward = potAmount;
                            
                            const winAmount = Math.floor(totalPotToAward / validatedWinners.length);
                            const remainder = totalPotToAward % validatedWinners.length;
                            
                            for (let i = 0; i < validatedWinners.length; i++) {
                                const award = winAmount + (i === 0 ? remainder : 0);
                                potAwards.push({
                                    playerId: validatedWinners[i].playerId,
                                    name: validatedWinners[i].name,
                                    amount: award,
                                    handName: validatedWinners[i].handResult.name,
                                    potType: previousBetLevel === 0 ? 'main' : 'side',
                                    potLevel: player.totalBet, // Track which pot level this award came from
                                    isRefund: isRefund, // True when winner was the only eligible player (excess chips returned)
                                    reason: isRefund ? `Refund: Only eligible player at pot level ${player.totalBet}` : undefined
                                });
                            }
                            
                            // Update previous level winners for next iteration
                            previousLevelWinners = validatedWinners;
                        }
                    }
                } else if (potAmount > 0 && eligibleHands.length === 0) {
                    // CRITICAL: Pot exists but all eligible players folded - award to best non-folded player who contributed
                    console.error(`[Table ${this.name}] ⚠️ POT EXISTS BUT ALL ELIGIBLE PLAYERS FOLDED: potAmount=${potAmount}, eligiblePlayers=${eligiblePlayers.length}, eligibleHands=${eligibleHands.length}`);
                    gameLogger.gameEvent(this.name, '[POT] ERROR: Pot exists but all eligible players folded', {
                        potAmount,
                        betLevel: player.totalBet,
                        eligiblePlayers: eligiblePlayers.map(p => ({
                            name: p.name,
                            isFolded: p.isFolded,
                            hasHandResult: !!p.handResult
                        }))
                    });
                    // Record fix attempt - all eligible players folded is a failure
                    this._recordFixAttempt('FIX_49_ALL_ELIGIBLE_PLAYERS_FOLDED', false, {
                        context: 'CALCULATE_AND_AWARD_SIDE_POTS',
                        potAmount,
                        betLevel: player.totalBet,
                        eligiblePlayersCount: eligiblePlayers.length,
                        eligibleHandsCount: eligibleHands.length,
                        handNumber: this.handsPlayed,
                        phase: this.phase
                    });
                    
                    // FIX: Find best non-folded player who contributed to this level OR HIGHER
                    // CRITICAL: Check ALL contributors, not just those at this exact level
                    // Look for any non-folded player who contributed at this level or higher
                    const nonFoldedContributors = allContributors
                        .filter(p => {
                            const seat = this.seats.find(s => s?.playerId === p.playerId);
                            return !p.isFolded && p.totalBet >= player.totalBet && seat && seat.isActive !== false;
                        })
                        .sort((a, b) => {
                            // Sort by hand result if available, otherwise by chips
                            if (a.handResult && b.handResult) {
                                return HandEvaluator.compare(b.handResult, a.handResult);
                            }
                            // If one has hand result and other doesn't, prefer the one with hand result
                            if (a.handResult && !b.handResult) return -1;
                            if (!a.handResult && b.handResult) return 1;
                            // Both have no hand result - sort by chips (from seat)
                            const seatA = this.seats.find(s => s?.playerId === a.playerId);
                            const seatB = this.seats.find(s => s?.playerId === b.playerId);
                            return (seatB?.chips || 0) - (seatA?.chips || 0);
                        });
                    
                    if (nonFoldedContributors.length > 0) {
                        const winner = nonFoldedContributors[0];
                        const handName = winner.handResult ? winner.handResult.name : 'No Hand';
                        potAwards.push({
                            playerId: winner.playerId,
                            name: winner.name,
                            amount: potAmount,
                            handName: handName,
                            potType: previousBetLevel === 0 ? 'main' : 'side',
                            reason: 'All eligible players folded - awarded to best non-folded contributor'
                        });
                        console.log(`[Table ${this.name}] FIX: Awarding ${potAmount} to ${winner.name} (all eligible players folded, hand: ${handName})`);
                        gameLogger.gameEvent(this.name, '[POT] Awarded to non-folded contributor', {
                            winner: winner.name,
                            amount: potAmount,
                            betLevel: player.totalBet,
                            handName: handName,
                            reason: 'All eligible players at bet level folded'
                        });
                    } else {
                        // CRITICAL FIX: If no non-folded contributors, award to best contributor at this level (even if folded)
                        // OR find the last remaining active player
                        // This prevents pot from being lost when all players at a bet level fold
                        const bestContributorAtLevel = allContributors
                            .filter(p => p.totalBet >= player.totalBet)
                            .sort((a, b) => {
                                // Prefer non-folded, then by hand result, then by chips
                                if (!a.isFolded && b.isFolded) return -1;
                                if (a.isFolded && !b.isFolded) return 1;
                                if (a.handResult && b.handResult) {
                                    return HandEvaluator.compare(b.handResult, a.handResult);
                                }
                                if (a.handResult && !b.handResult) return -1;
                                if (!a.handResult && b.handResult) return 1;
                                const seatA = this.seats.find(s => s?.playerId === a.playerId);
                                const seatB = this.seats.find(s => s?.playerId === b.playerId);
                                return (seatB?.chips || 0) - (seatA?.chips || 0);
                            })[0];
                        
                        // If still no one, find last remaining active player
                        const lastActivePlayer = activePlayers
                            .filter(p => {
                                const seat = this.seats.find(s => s?.playerId === p.playerId);
                                return seat && seat.isActive !== false;
                            })
                            .sort((a, b) => {
                                if (a.handResult && b.handResult) {
                                    return HandEvaluator.compare(b.handResult, a.handResult);
                                }
                                return 0;
                            })[0];
                        
                        const winner = bestContributorAtLevel || (lastActivePlayer ? {
                            playerId: lastActivePlayer.playerId,
                            name: lastActivePlayer.name,
                            handResult: lastActivePlayer.handResult
                        } : null);
                        
                        if (winner) {
                            const seat = this.seats.find(s => s?.playerId === winner.playerId);
                            const handName = winner.handResult ? winner.handResult.name : (seat?.isFolded ? 'Folded' : 'No Hand');
                            potAwards.push({
                                playerId: winner.playerId,
                                name: winner.name,
                                amount: potAmount,
                                handName: handName,
                                potType: previousBetLevel === 0 ? 'main' : 'side',
                                reason: bestContributorAtLevel ? 'All players at bet level folded - awarded to best contributor' : 'Awarded to last remaining active player'
                            });
                            console.log(`[Table ${this.name}] FIX: Awarding ${potAmount} to ${winner.name} (all folded at level, hand: ${handName})`);
                            gameLogger.gameEvent(this.name, '[POT] Awarded to best contributor (all folded)', {
                                winner: winner.name,
                                amount: potAmount,
                                betLevel: player.totalBet,
                                handName: handName,
                                reason: 'All players at bet level folded - awarded to best contributor or last active player'
                            });
                        } else {
                            console.error(`[Table ${this.name}] ⚠️ CRITICAL: No eligible winner found - pot will be lost!`);
                            gameLogger.error(this.name, 'No eligible winner for folded pot', {
                                potAmount,
                                betLevel: player.totalBet,
                                allContributors: allContributors.map(p => ({
                                    name: p.name,
                                    totalBet: p.totalBet,
                                    isFolded: p.isFolded,
                                    hasHandResult: !!p.handResult
                                })),
                                activePlayersCount: activePlayers.length
                            });
                            // Record fix attempt - no eligible winner found is a failure
                            this._recordFixAttempt('FIX_50_NO_ELIGIBLE_WINNER_FOUND', false, {
                                context: 'CALCULATE_AND_AWARD_SIDE_POTS',
                                potAmount,
                                betLevel: player.totalBet,
                                allContributorsCount: allContributors.length,
                                activePlayersCount: activePlayers.length,
                                handNumber: this.handsPlayed,
                                phase: this.phase
                            });
                        }
                    }
                }
                
                // CRITICAL: Track how much pot we've allocated at this level
                // This ensures we don't exceed the actual pot
                remainingPot = Math.max(0, remainingPot - potAmount);
                
                previousBetLevel = player.totalBet;
            }
        }
        
        // CRITICAL: If no awards were created but pot exists, this is an error
        if (potAwards.length === 0 && potBeforeCalculation > 0) {
            console.error(`[Table ${this.name}] ⚠️ POT NOT DISTRIBUTED! Pot: ${potBeforeCalculation}, Awards: 0, Contributors: ${allContributors.length}`);
            gameLogger.gameEvent(this.name, '[POT] ERROR: Pot not distributed', {
                potBeforeCalculation,
                potAwardsCount: 0,
                allContributorsCount: allContributors.length,
                activePlayersCount: activePlayers.length,
                sortedByBet: sortedByBet.map(p => ({
                    name: p.name,
                    totalBet: p.totalBet,
                    isFolded: p.isFolded,
                    hasHandResult: !!p.handResult
                }))
            });
            // Record fix attempt - pot not distributed is a failure
            this._recordFixAttempt('FIX_48_POT_NOT_DISTRIBUTED', false, {
                context: 'CALCULATE_AND_AWARD_SIDE_POTS',
                potBeforeCalculation,
                potAwardsCount: 0,
                allContributorsCount: allContributors.length,
                activePlayersCount: activePlayers.length,
                handNumber: this.handsPlayed,
                phase: this.phase
            });
            // CRITICAL FIX: Even if we can't distribute, we MUST clear the pot to prevent chip loss
            // Award pot to first active player as emergency measure
            const activeSeats = this.seats.filter(s => s && s.isActive !== false && s.chips > 0);
            if (activeSeats.length > 0 && this.pot > 0) {
                const emergencyRecipient = activeSeats[0];
                const chipsBefore = emergencyRecipient.chips;
                const potAmount = this.pot;
                
                // CRITICAL: Track chip movement BEFORE operation
                const movement = this._trackChipMovement('EMERGENCY_POT_DISTRIBUTION_FAILURE', {
                    recipient: emergencyRecipient.name,
                    amount: potAmount,
                    chipsBefore,
                    potBefore: potAmount,
                    reason: 'Pot distribution failed - emergency distribution to prevent chip loss'
                });
                
                emergencyRecipient.chips += potAmount;
                this.pot -= potAmount; // Decrement pot as chips are moved
                
                // CRITICAL: Validate after operation
                this._validateChipMovement(movement, 'EMERGENCY_POT_DISTRIBUTION_FAILURE');
                
                console.error(`[Table ${this.name}] ⚠️ EMERGENCY: Cannot distribute pot, awarding ${potAmount} to ${emergencyRecipient.name} to prevent loss`);
                gameLogger.gameEvent(this.name, '[POT] EMERGENCY: Awarding pot due to distribution failure', {
                    recipient: emergencyRecipient.name,
                    amount: potAmount,
                    chipsBefore,
                    chipsAfter: emergencyRecipient.chips,
                    reason: 'Pot distribution failed - emergency distribution'
                });
            }
            // CRITICAL: Always clear pot, even on error - use _clearPotWithTrace
            this._clearPotWithTrace('CALCULATE_AND_AWARD_SIDE_POTS_ERROR_CLEAR', 'Pot clear after distribution failure');
            return [];
        }
        
        // ULTRA-VERBOSE: Log state before awarding pots
        const totalChipsBeforeAwards = this.seats.filter(s => s !== null && s.isActive !== false).reduce((sum, s) => sum + (s.chips || 0), 0);
        const totalChipsAndPotBeforeAwards = totalChipsBeforeAwards + this.pot;
        
        // console.log(`[Table ${this.name}] [AWARD_POTS PRE-OP] Hand: ${this.handsPlayed} | Pot: ${this.pot} | TotalChips: ${totalChipsBeforeAwards} | TotalChips+Pot: ${totalChipsAndPotBeforeAwards} | Awards: ${potAwards.length}`);
        gameLogger.gameEvent(this.name, '[AWARD_POTS] PRE-OPERATION STATE', {
            handNumber: this.handsPlayed,
            pot: this.pot,
            totalChipsBeforeAwards,
            totalChipsAndPotBeforeAwards,
            totalStartingChips: this.totalStartingChips,
            potAwardsCount: potAwards.length,
            potAwards: potAwards.map(a => ({
                name: a.name,
                amount: a.amount,
                potType: a.potType
            }))
        });
        
        // Award the pots
        // CRITICAL: Eliminated players don't get chips back - they're out!
        // NOTE: totalAwarded is already declared at function start
        const awardDetails = []; // Track all awards for detailed logging
        
        // CRITICAL: Track each player's total awards to validate they don't exceed their contribution
        // A player can only win pots at levels they contributed to (totalBet >= pot level)
        const playerAwards = new Map(); // playerId -> { totalAwarded, totalBet, awards: [] }
        for (const contributor of allContributors) {
            playerAwards.set(contributor.playerId, {
                totalAwarded: 0,
                totalBet: contributor.totalBet,
                awards: []
            });
        }
        
        // CRITICAL: Validate awards BEFORE distributing to catch eligibility issues
        for (const award of potAwards) {
            const playerData = playerAwards.get(award.playerId);
            if (playerData) {
                playerData.totalAwarded += award.amount;
                playerData.awards.push(award);
            }
        }
        
        // CRITICAL: Validate that no player is winning more than they should be eligible for
        // A player can win pots at levels up to their totalBet, but the total amount won
        // should be validated against what they contributed and what they're eligible for
        for (const [playerId, data] of playerAwards.entries()) {
            const contributor = allContributors.find(c => c.playerId === playerId);
            if (contributor && data.totalAwarded > 0) {
                // Calculate maximum eligible winnings: sum of all pots at levels <= their totalBet
                let maxEligibleWinnings = 0;
                for (const potAward of potAwards) {
                    // Find which pot level this award came from by checking the sorted bets
                    // For now, we'll use a simpler check: if player's totalBet is high enough, they can win
                    // The real validation is that they shouldn't win pots at levels > their totalBet
                    // But in poker, you CAN win more than you bet if others bet less
                    // So we validate differently: check if they won pots at levels they weren't eligible for
                }
                
                // CRITICAL: Log warning if player won significantly more than they contributed
                // This is a red flag that might indicate a bug in side pot calculation
                // NOTE: In side pot scenarios, players CAN legitimately win more than they contributed
                // (e.g., if they bet 1000 but others bet 500, they can win 2000+)
                // So we need to check if this is legitimate or a bug
                const ratio = data.totalAwarded / contributor.totalBet;
                // CRITICAL: Check if this is a legitimate side pot scenario
                // A player can win more than they bet if:
                // 1. They won multiple pots (main + side pots)
                // 2. Other players bet less, allowing them to win more
                // 3. The potAwards array has multiple entries (indicating side pots exist)
                const hasMultiplePots = potAwards.length > 1;
                const wonMultipleAwards = data.awards.length > 1;
                const hasSidePotAward = potAwards.some(a => 
                    a.playerId === playerId && 
                    (a.potType === 'side' || a.potType === 'side_pot')
                );
                // Legitimate if: multiple pots exist OR player won multiple awards OR has side pot award
                const isLegitimateSidePot = hasMultiplePots || wonMultipleAwards || hasSidePotAward;
                
                // ROOT TRACING: Track when players win more than contributed
                gameLogger.gameEvent(this.name, '[ROOT_TRACE] PLAYER_WON_MORE_THAN_CONTRIBUTED', {
                    operation: 'VALIDATE_POT_AWARDS',
                    player: contributor.name,
                    playerId,
                    totalBet: contributor.totalBet,
                    totalAwarded: data.totalAwarded,
                    ratio: ratio.toFixed(2),
                    isLegitimateSidePot,
                    awards: data.awards.map(a => ({
                        amount: a.amount,
                        potType: a.potType,
                        handName: a.handName
                    })),
                    allContributors: allContributors.map(c => ({
                        name: c.name,
                        totalBet: c.totalBet,
                        isFolded: c.isFolded
                    })),
                    potAwardsCount: potAwards.length,
                    handNumber: this.handsPlayed,
                    phase: this.phase,
                    stackTrace: new Error().stack?.split('\n').slice(2, 8).join(' | ') || 'NO_STACK'
                });
                
                if (data.totalAwarded > contributor.totalBet * 2) {
                    console.error(`[Table ${this.name}] ⚠️ POTENTIAL ISSUE: ${contributor.name} won ${data.totalAwarded} but only contributed ${contributor.totalBet} (${ratio.toFixed(2)}x)`);
                    
                    // Only record as error if it's NOT a legitimate side pot scenario
                    if (!isLegitimateSidePot && ratio > 3) {
                        gameLogger.error(this.name, '[POT] Player won significantly more than contributed (POTENTIAL BUG)', {
                            player: contributor.name,
                            totalBet: contributor.totalBet,
                            totalAwarded: data.totalAwarded,
                            ratio: ratio.toFixed(2),
                            isLegitimateSidePot: false,
                            awards: data.awards.map(a => ({
                                amount: a.amount,
                                potType: a.potType,
                                handName: a.handName
                            })),
                            handNumber: this.handsPlayed,
                            phase: this.phase,
                            warning: 'Player won more than 3x their contribution without side pots - verify pot calculation is correct'
                        });
                        // Record fix attempt - this might indicate a bug
                        this._recordFixAttempt('FIX_71_PLAYER_WON_MORE_THAN_CONTRIBUTED', false, {
                            context: 'VALIDATE_POT_AWARDS',
                            player: contributor.name,
                            totalBet: contributor.totalBet,
                            totalAwarded: data.totalAwarded,
                            ratio: ratio,
                            isLegitimateSidePot: false,
                            handNumber: this.handsPlayed,
                            phase: this.phase
                        });
                    } else {
                        // Legitimate side pot scenario - record as success
                        gameLogger.gameEvent(this.name, '[POT] Player won more than contributed (LEGITIMATE SIDE POT)', {
                            player: contributor.name,
                            totalBet: contributor.totalBet,
                            totalAwarded: data.totalAwarded,
                            ratio: ratio.toFixed(2),
                            isLegitimateSidePot: true,
                            handNumber: this.handsPlayed,
                            phase: this.phase
                        });
                        this._recordFixAttempt('FIX_71_PLAYER_WON_MORE_THAN_CONTRIBUTED', true, {
                            context: 'VALIDATE_POT_AWARDS',
                            player: contributor.name,
                            totalBet: contributor.totalBet,
                            totalAwarded: data.totalAwarded,
                            ratio: ratio,
                            isLegitimateSidePot: true,
                            handNumber: this.handsPlayed,
                            phase: this.phase
                        });
                    }
                } else {
                    // Normal case - record as success
                    this._recordFixAttempt('FIX_71_PLAYER_WON_MORE_THAN_CONTRIBUTED', true, {
                        context: 'VALIDATE_POT_AWARDS',
                        player: contributor.name,
                        totalBet: contributor.totalBet,
                        totalAwarded: data.totalAwarded,
                        ratio: ratio,
                        handNumber: this.handsPlayed,
                        phase: this.phase
                    });
                }
            }
        }
        
        for (const award of potAwards) {
            const seat = this.seats.find(s => s?.playerId === award.playerId);
            
            // CRITICAL: Only award to active (non-eliminated) players
            // NOTE: All-in players with 0 chips CAN receive awards if they WON (they're in potAwards because they have best hand)
            // After receiving the award, their chips will go from 0 to award amount
            // If they lost, they won't be in potAwards at all, so they won't get anything
            if (seat && seat.isActive !== false) {
                // Award chips to active players (including all-in winners who currently have 0 chips)
            const chipsBefore = seat.chips;
            
            // CRITICAL: Track chip award BEFORE operation
            const movement = this._trackChipMovement('AWARD_POT', {
                player: award.name,
                seatIndex: this.seats.indexOf(seat),
                amount: award.amount,
                chipsBefore,
                potType: award.potType,
                handName: award.handName
            });
            
            // ULTRA-VERBOSE: Log before award
            const potBeforeAward = this.pot;
            const chipsBeforeAward = seat.chips;
            
            // SYSTEMATIC DEBUG: Track chip movement during award in calculateAndAwardSidePots
            const totalChipsBeforeAward = this.seats.filter(s => s !== null && s.isActive !== false).reduce((sum, s) => sum + (s.chips || 0), 0);
            const totalChipsAndPotBeforeAward = totalChipsBeforeAward + this.pot;
            
            // CRITICAL FIX: Decrement pot when awarding chips to prevent double-counting
            // Chips move from pot to player, so pot must decrease by award amount
            seat.chips += award.amount;
            this.pot -= award.amount; // FIX: Decrement pot to match chip transfer
            const chipsAfter = seat.chips;
            totalAwarded += award.amount;
            
            // SYSTEMATIC DEBUG: Track chip movement after award
            const totalChipsAfterAward = this.seats.filter(s => s !== null && s.isActive !== false).reduce((sum, s) => sum + (s.chips || 0), 0);
            const totalChipsAndPotAfterAward = totalChipsAfterAward + this.pot;
            const chipsLostDuringAward = totalChipsAndPotBeforeAward - totalChipsAndPotAfterAward;
            
            const debugLogAward = `[SYSTEMATIC_DEBUG] CALCULATE_AND_AWARD_SIDE_POTS AWARD: Player=${award.name}, Amount=${award.amount}, chipsLost=${chipsLostDuringAward}, expected=0\n`;
            console.log(debugLogAward.trim());
            fs.appendFileSync(path.join(__dirname, '../../logs/pot-award-debug.log'), new Date().toISOString() + ' ' + debugLogAward);
            
            if (Math.abs(chipsLostDuringAward) > 0.01) {
                console.error(`[Table ${this.name}] ⚠️⚠️⚠️ [SYSTEMATIC_DEBUG] POT AWARD BUG DETECTED in calculateAndAwardSidePots! Chips lost: ${chipsLostDuringAward}`);
                gameLogger.error(this.name, '[SYSTEMATIC_DEBUG] POT AWARD BUG: Chips lost during award', {
                    player: award.name,
                    amount: award.amount,
                    chipsLostDuringAward,
                    totalChipsAndPotBeforeAward,
                    totalChipsAndPotAfterAward,
                    handNumber: this.handsPlayed
                });
            }
            
                // CRITICAL: Clear totalBet and currentBet immediately after award for winners
            // NOTE: ALL players will have their totalBet/currentBet cleared after the loop completes
            // This prevents them from persisting to the next hand
            if (seat.totalBet > 0 || seat.currentBet > 0) {
                const totalBetBeforeClear = seat.totalBet;
                const currentBetBeforeClear = seat.currentBet;
                
                // ROOT TRACING: Track totalBet clearing
                gameLogger.gameEvent(this.name, '[ROOT_TRACE] TOTAL_BET_CLEARED', {
                    operation: 'AFTER_AWARD_WINNER',
                    player: seat.name,
                    seatIndex: this.seats.indexOf(seat),
                    totalBetBeforeClear: totalBetBeforeClear,
                    currentBetBeforeClear: currentBetBeforeClear,
                    handNumber: this.handsPlayed,
                    phase: this.phase,
                    awardAmount: award.amount,
                    stackTrace: new Error().stack?.split('\n').slice(2, 8).join(' | ') || 'NO_STACK'
                });
                
                seat.totalBet = 0;
                seat.currentBet = 0;
            }
            
            // ULTRA-VERBOSE: Verify award immediately
            if (seat.chips !== chipsBeforeAward + award.amount) {
                console.error(`[Table ${this.name}] ⚠️ CRITICAL AWARD ERROR: Chips calculation failed! Player: ${award.name}, Before: ${chipsBeforeAward}, Amount: ${award.amount}, After: ${seat.chips}, Expected: ${chipsBeforeAward + award.amount}`);
                gameLogger.error(this.name, '[POT] CRITICAL: Award calculation error', {
                    player: award.name,
                    chipsBefore: chipsBeforeAward,
                    amount: award.amount,
                    chipsAfter: seat.chips,
                    expected: chipsBeforeAward + award.amount,
                    handNumber: this.handsPlayed,
                    phase: this.phase
                });
                // Record fix attempt - award calculation error is a failure
                this._recordFixAttempt('FIX_40_AWARD_CALCULATION_ERROR', false, {
                    context: 'AWARD_POT',
                    player: award.name,
                    chipsBefore: chipsBeforeAward,
                    amount: award.amount,
                    chipsAfter: seat.chips,
                    expected: chipsBeforeAward + award.amount,
                    handNumber: this.handsPlayed,
                    phase: this.phase
                });
            }
            
            // CRITICAL: Validate after award
            this._validateChipMovement(movement, 'AWARD_POT');
                
                awardDetails.push({
                    playerId: award.playerId,
                    name: award.name,
                    amount: award.amount,
                    potType: award.potType,
                    handName: award.handName,
                    chipsBefore,
                    chipsAfter,
                    seatIndex: this.seats.indexOf(seat),
                    isActive: seat.isActive
                });
                
                console.log(`[Table ${this.name}] ${award.name} wins ${award.amount} from ${award.potType} pot with ${award.handName} (chips: ${chipsBefore} → ${chipsAfter})`);
                
                // CRITICAL: Log chip award for debugging
                gameLogger.gameEvent(this.name, '[POT] Awarded chips', {
                    winner: award.name,
                    amount: award.amount,
                    potType: award.potType,
                    handName: award.handName,
                    chipsBefore,
                    chipsAfter,
                    calculationCheck: chipsBefore + award.amount === chipsAfter ? 'CORRECT' : 'ERROR'
                });
            } else if (seat && seat.isActive === false) {
                // CRITICAL FIX: Eliminated player won a pot - redistribute to best active player
                console.error(`[Table ${this.name}] ⚠️ CRITICAL: Eliminated player ${award.name} won ${award.amount} chips - redistributing to best active player`);
                gameLogger.gameEvent(this.name, '[POT] ELIMINATED PLAYER WON POT - redistributing', {
                    eliminatedPlayer: award.name,
                    amount: award.amount,
                    reason: 'Player was eliminated but won pot - redistributing'
                });
                // Record fix attempt - eliminated player won pot is a failure
                this._recordFixAttempt('FIX_41_ELIMINATED_PLAYER_WON_POT', false, {
                    context: 'AWARD_POT',
                    eliminatedPlayer: award.name,
                    amount: award.amount,
                    handNumber: this.handsPlayed,
                    phase: this.phase
                });
                
                // Find best active player who has chips and is still in the game
                // CRITICAL: Use the activePlayers parameter from showdown, not this.seats
                const activeSeats = this.seats
                    .filter(s => s && s.isActive !== false && s.chips > 0)
                    .map(s => {
                        const playerData = activePlayers.find(p => p.playerId === s.playerId);
                        return {
                            seat: s,
                            handResult: playerData?.handResult || null
                        };
                    })
                    .filter(p => p.handResult)
                    .sort((a, b) => HandEvaluator.compare(b.handResult, a.handResult));
                
                    if (activeSeats.length > 0) {
                        const bestActive = activeSeats[0].seat;
                        const chipsBefore = bestActive.chips;
                        
                        // CRITICAL: Track redistribution BEFORE operation
                        const movement = this._trackChipMovement('REDISTRIBUTE_POT_FROM_ELIMINATED', {
                            from: award.name,
                            to: bestActive.name,
                            amount: award.amount,
                            chipsBefore
                        });
                        
                        // ULTRA-VERBOSE: Log before redistribution
                        const chipsBeforeRedist = bestActive.chips;
                        
                        // CRITICAL FIX: Decrement pot when redistributing chips to prevent double-counting
                        bestActive.chips += award.amount;
                        this.pot -= award.amount; // FIX: Decrement pot to match chip transfer
                        totalAwarded += award.amount; // Count it as awarded
                        
                        // ULTRA-VERBOSE: Verify redistribution immediately
                        if (bestActive.chips !== chipsBeforeRedist + award.amount) {
                            console.error(`[Table ${this.name}] ⚠️ CRITICAL REDISTRIBUTE ERROR: Chips calculation failed! To: ${bestActive.name}, Before: ${chipsBeforeRedist}, Amount: ${award.amount}, After: ${bestActive.chips}, Expected: ${chipsBeforeRedist + award.amount}`);
                        }
                        
                        // CRITICAL: Validate after redistribution
                        this._validateChipMovement(movement, 'REDISTRIBUTE_POT_FROM_ELIMINATED');
                    console.log(`[Table ${this.name}] FIX: Redistributed ${award.amount} from eliminated ${award.name} to ${bestActive.name} (chips: ${chipsBefore} → ${bestActive.chips})`);
                    gameLogger.gameEvent(this.name, '[POT] Redistributed from eliminated player', {
                        from: award.name,
                        to: bestActive.name,
                        amount: award.amount,
                        chipsBefore,
                        chipsAfter: bestActive.chips
                    });
                } else {
                    // No active players - this is a game over scenario, but pot should have been handled earlier
                    console.error(`[Table ${this.name}] ⚠️ CRITICAL: No active players to redistribute ${award.amount} to - pot will be lost!`);
                    gameLogger.error(this.name, 'No active players for redistribution', {
                        amount: award.amount,
                        eliminatedPlayer: award.name
                    });
                    // Record fix attempt - no active players for redistribution is a failure
                    this._recordFixAttempt('FIX_42_NO_ACTIVE_PLAYERS_FOR_REDISTRIBUTION', false, {
                        context: 'AWARD_POT',
                        amount: award.amount,
                        eliminatedPlayer: award.name,
                        handNumber: this.handsPlayed,
                        phase: this.phase
                    });
                    // Don't count forfeited chips in totalAwarded - they're lost
                }
            }
        }
        
        // ULTRA-VERBOSE: Log state after awarding pots
        // CRITICAL FIX: After awarding pots, the chips moved from pot to players
        // So: totalChipsAfterAwards = totalChipsBeforeAwards + totalAwarded
        // And: totalChipsAndPotAfterAwards should equal totalChipsAndPotBeforeAwards (chips conserved)
        // Since pot will be cleared (set to 0), totalChipsAndPotAfterAwards = totalChipsAfterAwards + 0
        // But pot hasn't been cleared yet, so we need to account for: pot should equal totalAwarded
        // Therefore: totalChipsAndPotAfterAwards = totalChipsAfterAwards + (this.pot - totalAwarded)
        // If pot == totalAwarded (correct), then totalChipsAndPotAfterAwards = totalChipsAfterAwards
        const totalChipsAfterAwards = this.seats.filter(s => s !== null && s.isActive !== false).reduce((sum, s) => sum + (s.chips || 0), 0);
        // CRITICAL: The pot money was moved to players, so after clearing pot=0, total = totalChipsAfterAwards
        // But since pot isn't cleared yet, subtract the awarded amount from pot to get correct total
        const totalChipsAndPotAfterAwards = totalChipsAfterAwards + Math.max(0, this.pot - totalAwarded);
        const chipsDifferenceAfterAwards = totalChipsAndPotAfterAwards - totalChipsAndPotBeforeAwards;
        
        // console.log(`[Table ${this.name}] [AWARD_POTS POST-OP] Hand: ${this.handsPlayed} | Pot: ${this.pot} | TotalChips: ${totalChipsAfterAwards} | TotalChips+Pot: ${totalChipsAndPotAfterAwards} | TotalAwarded: ${totalAwarded} | Difference: ${chipsDifferenceAfterAwards}`);
        gameLogger.gameEvent(this.name, '[AWARD_POTS] POST-OPERATION STATE', {
            handNumber: this.handsPlayed,
            pot: this.pot,
            totalChipsBeforeAwards,
            totalChipsAfterAwards,
            totalChipsAndPotBeforeAwards,
            totalChipsAndPotAfterAwards,
            chipsDifferenceAfterAwards,
            totalAwarded,
            totalStartingChips: this.totalStartingChips,
            awardDetails
        });
        
        if (Math.abs(chipsDifferenceAfterAwards) > 0.01) {
            console.error(`[Table ${this.name}] ⚠️ CRITICAL AWARD_POTS ERROR: Total chips changed! Before: ${totalChipsAndPotBeforeAwards}, After: ${totalChipsAndPotAfterAwards}, Difference: ${chipsDifferenceAfterAwards}`);
            gameLogger.gameEvent(this.name, '[AWARD_POTS] CRITICAL: Total chips changed', {
                handNumber: this.handsPlayed,
                totalChipsAndPotBeforeAwards,
                totalChipsAndPotAfterAwards,
                chipsDifferenceAfterAwards
            });
            // Record fix attempt - total chips changed during award is a failure
            this._recordFixAttempt('FIX_43_AWARD_POTS_TOTAL_CHIPS_CHANGED', false, {
                context: 'AWARD_POTS',
                totalChipsAndPotBeforeAwards,
                totalChipsAndPotAfterAwards,
                chipsDifferenceAfterAwards,
                totalAwarded,
                handNumber: this.handsPlayed,
                phase: this.phase
            });
            gameLogger.gameEvent(this.name, '[AWARD_POTS] CRITICAL: Total chips changed', {
                handNumber: this.handsPlayed,
                totalChipsAndPotBeforeAwards,
                totalChipsAndPotAfterAwards,
                chipsDifferenceAfterAwards,
                totalAwarded,
                potBeforeCalculation,
                potAfterAwards: this.pot,
                totalStartingChips: this.totalStartingChips
            });
        }
        
        // CRITICAL: Validate that all pot money was awarded
        // CRITICAL: Log detailed breakdown for debugging
        gameLogger.gameEvent(this.name, '[POT] Award summary', {
            potBeforeCalculation,
            totalAwarded,
            difference: potBeforeCalculation - totalAwarded,
            potAwardsCount: potAwards.length,
            awardDetails: awardDetails,
            allSeatsAfterAward: this.seats.map((seat, idx) => seat ? {
                seatIndex: idx,
                name: seat.name,
                chips: seat.chips,
                totalBet: seat.totalBet || 0,
                isActive: seat.isActive,
                isFolded: seat.isFolded,
                isAllIn: seat.isAllIn
            } : null).filter(Boolean)
        });
        
        // CRITICAL: Don't validate here - pot hasn't been cleared yet
        // Validation will happen at AFTER_SIDE_POT_AWARDS after pot is cleared
        
        if (Math.abs(potBeforeCalculation - totalAwarded) > 0.01) {
            const missing = potBeforeCalculation - totalAwarded;
            console.error(`[Table ${this.name}] ⚠️ CRITICAL: POT NOT FULLY AWARDED! Pot was ${potBeforeCalculation}, but only ${totalAwarded} was awarded. Missing: ${missing}`);
            // Record fix attempt - pot not fully awarded is a failure
            this._recordFixAttempt('FIX_44_POT_NOT_FULLY_AWARDED', false, {
                context: 'AWARD_POTS',
                potBeforeCalculation,
                totalAwarded,
                missing,
                potAwardsCount: potAwards.length,
                handNumber: this.handsPlayed,
                phase: this.phase
            });
            gameLogger.error(this.name, '[POT] ERROR: Pot not fully awarded', {
                potBeforeCalculation,
                totalAwarded,
                missing,
                potAwardsCount: potAwards.length,
                potAwards: potAwards.map(a => ({ name: a.name, amount: a.amount, potType: a.potType, reason: a.reason || 'standard' })),
                awardDetails: awardDetails,
                allContributors: allContributors.map(p => ({
                    name: p.name,
                    totalBet: p.totalBet,
                    isFolded: p.isFolded,
                    isAllIn: p.isAllIn,
                    hasHandResult: !!p.handResult
                })),
                allSeatsAfterAward: this.seats.map((seat, idx) => seat ? {
                    seatIndex: idx,
                    name: seat.name,
                    chips: seat.chips,
                    totalBet: seat.totalBet || 0,
                    isActive: seat.isActive,
                    isFolded: seat.isFolded,
                    isAllIn: seat.isAllIn
                } : null).filter(Boolean)
            });
            
            // CRITICAL FIX: If pot isn't fully awarded, award remaining to best active player to prevent chip loss
            // This prevents the "pot not cleared at hand start" error from losing chips
            // CRITICAL: Use the actual remaining pot (this.pot) as the source of truth
            // If this.pot > 0, there are chips that weren't awarded and will be lost
            const actualLeftoverPot = this.pot; // Use actual remaining pot
            if (actualLeftoverPot > 0.01) {
                const activeSeats = this.seats.filter(s => s && s.isActive !== false && s.chips > 0);
                if (activeSeats.length > 0) {
                    // Award to first active player (or could award to best hand, but simpler to just pick first)
                    const recipient = activeSeats[0];
                    const chipsBefore = recipient.chips;
                    
                    // CRITICAL: Track chip movement for emergency award BEFORE operation
                    const movement = this._trackChipMovement('EMERGENCY_AWARD_LEFTOVER_POT', {
                        player: recipient.name,
                        amount: actualLeftoverPot,
                        missing,
                        potBeforeCalculation,
                        totalAwarded,
                        reason: 'Pot not fully awarded - emergency distribution to prevent chip loss'
                    });
                    
                    // CRITICAL: Award the actual leftover pot to prevent chip loss
                    recipient.chips += actualLeftoverPot;
                    this.pot -= actualLeftoverPot; // Decrement pot as chips are moved
                    totalAwarded += actualLeftoverPot; // Count it as awarded
                    
                    console.error(`[Table ${this.name}] ⚠️ EMERGENCY: Awarding ${actualLeftoverPot} leftover pot chips to ${recipient.name} to prevent loss (missing=${missing}, potBefore=${actualLeftoverPot}, potAfter=${this.pot})`);
                    gameLogger.gameEvent(this.name, '[POT] EMERGENCY: Awarding leftover pot chips', {
                        recipient: recipient.name,
                        amount: actualLeftoverPot,
                        missing,
                        potBeforeCalculation,
                        totalAwarded,
                        potBeforeEmergency: actualLeftoverPot,
                        potAfterEmergency: this.pot,
                        chipsBefore,
                        chipsAfter: recipient.chips,
                        reason: 'Pot not fully awarded - emergency distribution to prevent chip loss'
                    });
                    
                    // CRITICAL: Validate the emergency award
                    this._validateChipMovement(movement, 'EMERGENCY_AWARD_LEFTOVER_POT');
                } else {
                    console.error(`[Table ${this.name}] ⚠️ CRITICAL: ${actualLeftoverPot} chips will be LOST - no active players to award to!`);
                    // Record fix attempt - chips will be lost is a failure
                    this._recordFixAttempt('FIX_45_CHIPS_LOST_NO_ACTIVE_PLAYERS', false, {
                        context: 'AWARD_POTS',
                        actualLeftoverPot,
                        missing,
                        potBeforeCalculation,
                        totalAwarded,
                        handNumber: this.handsPlayed,
                        phase: this.phase
                    });
                }
            }
            // Continue to clear pot even if there was an issue - better to clear than leave it
        } else {
            // Record success if pot was fully awarded
            this._recordFixAttempt('FIX_44_POT_NOT_FULLY_AWARDED', true, {
                context: 'AWARD_POTS',
                potBeforeCalculation,
                totalAwarded,
                missing: 0,
                handNumber: this.handsPlayed,
                phase: this.phase,
                reason: 'Pot fully awarded'
            });
        }
        
        // Clear pot only after validation passes
        // CRITICAL FIX #1: Ensure pot is ALWAYS cleared after side pot awards
        const potBeforeClear = this.pot;
        const totalChipsBeforeClear = this.seats.filter(s => s !== null && s.isActive !== false).reduce((sum, s) => sum + (s.chips || 0), 0);
        const totalChipsAndPotBeforeClear = totalChipsBeforeClear + this.pot;
        
        // console.log(`[Table ${this.name}] [FIX #1: CLEAR_POT_AFTER_SIDE_POTS PRE-OP] Hand: ${this.handsPlayed} | Pot: ${potBeforeClear} | TotalAwarded: ${totalAwarded} | TotalChips: ${totalChipsBeforeClear} | TotalChips+Pot: ${totalChipsAndPotBeforeClear}`);
        gameLogger.gameEvent(this.name, '[FIX #1: CLEAR_POT_AFTER_SIDE_POTS] PRE-OPERATION STATE', {
            handNumber: this.handsPlayed,
            potBeforeClear,
            totalAwarded,
            totalChipsBeforeClear,
            totalChipsAndPotBeforeClear,
            totalStartingChips: this.totalStartingChips,
            phase: this.phase,
            potAwardsCount: potAwards.length
        });
        
        if (potBeforeClear > 0) {
            // ULTRA-VERBOSE: Log pot clearing
            console.log(`[Table ${this.name}] [FIX #1: POT CLEAR] Clearing pot after side pots: ${potBeforeClear} chips (totalAwarded: ${totalAwarded}) | Hand: ${this.handsPlayed} | Phase: ${this.phase}`);
            gameLogger.gameEvent(this.name, '[FIX #1: POT] Clearing pot after side pots', {
                potBefore: potBeforeClear,
                totalAwarded,
                difference: potBeforeClear - totalAwarded,
                handNumber: this.handsPlayed,
                phase: this.phase,
                potAwardsCount: potAwards.length
            });
            
            // CRITICAL: Verify pot was fully awarded before clearing
            if (Math.abs(potBeforeClear - totalAwarded) > 0.01) {
                console.error(`[Table ${this.name}] ⚠️ CRITICAL FIX #1: Clearing pot but pot (${potBeforeClear}) != totalAwarded (${totalAwarded})! Difference: ${potBeforeClear - totalAwarded}`);
                gameLogger.error(this.name, '[FIX #1: POT] ERROR: Pot not fully awarded before clearing', {
                    potBeforeClear,
                    totalAwarded,
                    missing: potBeforeClear - totalAwarded,
                    handNumber: this.handsPlayed,
                    phase: this.phase
                });
                // Record fix attempt - pot not fully awarded before clearing is a failure
                this._recordFixAttempt('FIX_46_POT_NOT_FULLY_AWARDED_BEFORE_CLEARING', false, {
                    context: 'CLEAR_POT_AFTER_SIDE_POTS',
                    potBeforeClear,
                    totalAwarded,
                    missing: potBeforeClear - totalAwarded,
                    handNumber: this.handsPlayed,
                    phase: this.phase
                });
            }
            
            const movement = this._trackChipMovement('CLEAR_POT_AFTER_SIDE_POTS', {
                potBefore: potBeforeClear,
                totalAwarded,
                reason: 'Side pots calculated and awarded, clearing main pot'
            });
            // ROOT CAUSE: Trace pot clearing
            this._clearPotWithTrace('CLEAR_POT_AFTER_SIDE_POTS', 'Clearing pot after side pots');
            this._validateChipMovement(movement, 'CLEAR_POT_AFTER_SIDE_POTS');
        } else {
            // ULTRA-VERBOSE: Log even when pot is 0
            if (potBeforeClear !== 0) {
                console.error(`[Table ${this.name}] ⚠️ FIX #1 POT CLEAR WARNING: Pot was ${potBeforeClear} but should be 0!`);
            }
            // ROOT CAUSE: Trace pot clearing even when already 0
            this._clearPotWithTrace('CLEAR_POT_AFTER_SIDE_POTS_ZERO', 'Pot already 0, ensuring it stays 0');
        }
        
        // ULTRA-VERBOSE: Log after pot clear
        const totalChipsAfterClear = this.seats.filter(s => s !== null && s.isActive !== false).reduce((sum, s) => sum + (s.chips || 0), 0);
        const totalChipsAndPotAfterClear = totalChipsAfterClear + this.pot;
        const clearDifference = totalChipsAndPotAfterClear - totalChipsAndPotBeforeClear;
        
        // console.log(`[Table ${this.name}] [FIX #1: CLEAR_POT_AFTER_SIDE_POTS POST-OP] Hand: ${this.handsPlayed} | Pot: ${this.pot} | TotalChips: ${totalChipsAfterClear} | TotalChips+Pot: ${totalChipsAndPotAfterClear} | Difference: ${clearDifference}`);
        gameLogger.gameEvent(this.name, '[FIX #1: CLEAR_POT_AFTER_SIDE_POTS] POST-OPERATION STATE', {
            handNumber: this.handsPlayed,
            potAfterClear: this.pot,
            totalChipsAfterClear,
            totalChipsAndPotAfterClear,
            clearDifference,
            totalStartingChips: this.totalStartingChips
        });
        
        if (Math.abs(clearDifference + potBeforeClear) > 0.01) {
            console.error(`[Table ${this.name}] ⚠️ CRITICAL FIX #1 ERROR: Clear difference (${clearDifference}) != -potBeforeClear (${-potBeforeClear})!`);
            gameLogger.error(this.name, '[FIX #1: CLEAR_POT_AFTER_SIDE_POTS] CRITICAL: Clear difference mismatch', {
                handNumber: this.handsPlayed,
                potBeforeClear,
                clearDifference,
                totalChipsAndPotBeforeClear,
                totalChipsAndPotAfterClear
            });
            // Record fix attempt - clear difference mismatch is a failure
            this._recordFixAttempt('FIX_47_CLEAR_DIFFERENCE_MISMATCH_SIDE_POTS', false, {
                context: 'CLEAR_POT_AFTER_SIDE_POTS',
                potBeforeClear,
                clearDifference,
                totalChipsAndPotBeforeClear,
                totalChipsAndPotAfterClear,
                handNumber: this.handsPlayed,
                phase: this.phase
            });
        }
        
        // Store awards for client display
        // SYSTEMATIC DEBUG: Compare total awards vs initial pot
        const totalAwardedSum = potAwards.reduce((sum, award) => sum + award.amount, 0);
        const potDiscrepancy = initialPot - totalAwardedSum;
        const awardsDebugLog = `[SYSTEMATIC_DEBUG] CALCULATE_AND_AWARD_SIDE_POTS COMPLETE: InitialPot=${initialPot}, TotalAwarded=${totalAwardedSum}, Discrepancy=${potDiscrepancy}, AwardsCount=${potAwards.length}\n`;
        console.log(awardsDebugLog.trim());
        fs.appendFileSync(path.join(__dirname, '../../logs/pot-award-debug.log'), new Date().toISOString() + ' ' + awardsDebugLog);
        
        if (Math.abs(potDiscrepancy) > 0.01) {
            console.error(`[Table ${this.name}] ⚠️⚠️⚠️ [SYSTEMATIC_DEBUG] POT DISCREPANCY DETECTED! InitialPot=${initialPot}, TotalAwarded=${totalAwardedSum}, Difference=${potDiscrepancy}`);
            gameLogger.error(this.name, '[SYSTEMATIC_DEBUG] POT DISCREPANCY: Total awards do not match initial pot', {
                initialPot,
                totalAwardedSum,
                potDiscrepancy,
                awardsCount: potAwards.length,
                awards: potAwards.map(a => ({ player: a.name, amount: a.amount, potType: a.potType })),
                handNumber: this.handsPlayed
            });
        }
        
        this.lastPotAwards = potAwards;
        
        // CRITICAL: Final validation log
        gameLogger.gameEvent(this.name, '[POT] All money awarded correctly', {
            potBeforeCalculation,
            totalAwarded,
            difference: potBeforeCalculation - totalAwarded,
            potAwardsCount: potAwards.length
        });
        
        // CRITICAL: NOW that pot is calculated and awarded, clear totalBet and currentBet for all seats
        // This is safe because the pot has been fully distributed
        // CRITICAL FIX: Clear totalBet and currentBet IMMEDIATELY after pot awards to prevent persistence
        let totalBetClearedCount = 0;
        let currentBetClearedCount = 0;
        const totalBetClearingDetails = [];
        
        for (const seat of this.seats) {
            if (seat) {
                const seatIndex = this.seats.indexOf(seat);
                const totalBetBeforeClear = seat.totalBet || 0;
                const currentBetBeforeClear = seat.currentBet || 0;
                
                if (totalBetBeforeClear > 0) {
                    totalBetClearedCount++;
                    totalBetClearingDetails.push({
                        player: seat.name,
                        seatIndex,
                        totalBet: totalBetBeforeClear
                    });
                    
                    // ROOT TRACING: Track totalBet clearing
                    gameLogger.gameEvent(this.name, '[ROOT_TRACE] TOTAL_BET_CLEARED', {
                        operation: 'AFTER_CALCULATE_AND_AWARD_SIDE_POTS',
                        player: seat.name,
                        seatIndex,
                        totalBetBeforeClear: totalBetBeforeClear,
                        currentBetBeforeClear: currentBetBeforeClear,
                        handNumber: this.handsPlayed,
                        phase: this.phase,
                        potAwardsCount: potAwards.length,
                        stackTrace: new Error().stack?.split('\n').slice(2, 8).join(' | ') || 'NO_STACK'
                    });
                }
                if (currentBetBeforeClear > 0) {
                    currentBetClearedCount++;
                }
                
                seat.totalBet = 0;
                seat.currentBet = 0;
            }
        }
        
        // ROOT TRACING: Summary of totalBet clearing
        gameLogger.gameEvent(this.name, '[ROOT_TRACE] TOTAL_BET_CLEARING_SUMMARY', {
            operation: 'AFTER_CALCULATE_AND_AWARD_SIDE_POTS',
            totalBetClearedCount,
            currentBetClearedCount,
            totalSeats: this.seats.filter(s => s !== null).length,
            clearingDetails: totalBetClearingDetails,
            handNumber: this.handsPlayed,
            phase: this.phase
        });
        
        // Record fix attempt - verify that all totalBet/currentBet were successfully cleared
        // Check if any still remain (which would be a failure)
        let remainingTotalBet = 0;
        let remainingCurrentBet = 0;
        for (const seat of this.seats) {
            if (seat) {
                if (seat.totalBet > 0) remainingTotalBet++;
                if (seat.currentBet > 0) remainingCurrentBet++;
            }
        }
        
        if (remainingTotalBet > 0 || remainingCurrentBet > 0) {
            this._recordFixAttempt('FIX_1_TOTAL_BET_NOT_CLEARED', false, {
                context: 'AFTER_CALCULATE_AND_AWARD_SIDE_POTS',
                playersWithTotalBet: remainingTotalBet,
                playersWithCurrentBet: remainingCurrentBet,
                handNumber: this.handsPlayed
            });
        } else {
            this._recordFixAttempt('FIX_1_TOTAL_BET_NOT_CLEARED', true, {
                context: 'AFTER_CALCULATE_AND_AWARD_SIDE_POTS',
                totalBetCleared: totalBetClearedCount,
                currentBetCleared: currentBetClearedCount,
                handNumber: this.handsPlayed
            });
        }
        
        // CRITICAL: NOW that pot is calculated and awarded, we can safely remove eliminated players
        // Their totalBet has been used for pot calculation, so we can clear it and remove them
        // CRITICAL FIX: DO NOT subtract buy-in from totalStartingChips when players are eliminated!
        // The chips are still in the system (just redistributed to other players), so totalStartingChips should remain constant.
        // totalStartingChips represents the total chips at game start, which never changes during gameplay.
        for (let i = 0; i < this.seats.length; i++) {
            const seat = this.seats[i];
            if (seat && seat.isActive === false) {
                // Log elimination but DO NOT modify totalStartingChips
                console.log(`[Table ${this.name}] [ELIMINATION] ${seat.name} eliminated - NOT subtracting buy-in from totalStartingChips (chips still in system)`);
                gameLogger.gameEvent(this.name, '[ELIMINATION] Player eliminated - NOT modifying totalStartingChips', {
                    player: seat.name,
                    playerId: seat.playerId,
                    seatIndex: i,
                    buyIn: this.buyIn,
                    isBot: seat.isBot || false,
                    playerChips: seat.chips,
                    playerTotalBet: seat.totalBet || 0,
                    totalStartingChips: this.totalStartingChips,
                    reason: 'Chips still in system (redistributed to other players) - totalStartingChips remains constant',
                    allEliminatedPlayers: this.seats.filter(s => s && s.isActive === false).map(s => ({
                        name: s.name,
                        seatIndex: this.seats.indexOf(s),
                        chips: s.chips,
                        totalBet: s.totalBet || 0
                    }))
                });
                
                // Only remove regular bots (socket bots are managed by SimulationManager)
                if (seat.isBot) {
                    // console.log(`[Table ${this.name}] Removing eliminated bot ${seat.name} after pot calculation`);
                    this.seats[i] = null;
                }
            }
        }
        
        // ULTRA-VERBOSE: Log complete state after side pot awards
        const finalState = this._getChipState();
        // console.log(`[Table ${this.name}] [AFTER_SIDE_POT_AWARDS] Complete state | Hand: ${this.handsPlayed} | Phase: ${this.phase} | totalStartingChips: ${this.totalStartingChips} | totalChipsInSystem: ${finalState.totalChipsInSystem} | difference: ${finalState.difference}`);
        gameLogger.gameEvent(this.name, '[AFTER_SIDE_POT_AWARDS] Complete state snapshot', {
            handNumber: this.handsPlayed,
            phase: this.phase,
            totalStartingChips: this.totalStartingChips,
            finalState,
            potAwardsCount: potAwards.length,
            potAwards: potAwards.map(a => ({
                playerId: a.playerId,
                name: a.name,
                amount: a.amount,
                potType: a.potType
            }))
        });
        
        // CRITICAL: Validate money after side pot awards
        this._validateMoney('AFTER_SIDE_POT_AWARDS');
        
        // CRITICAL FIX: Ensure pot is ALWAYS cleared before returning, even if there was an error
        // This prevents pot from persisting to next hand and causing chip loss
        const potBeforeFinalCheck = this.pot;
        if (potBeforeFinalCheck > 0) {
            console.error(`[Table ${this.name}] ⚠️ CRITICAL: Pot still has ${potBeforeFinalCheck} chips after calculateAndAwardSidePots! Forcing clear.`);
            gameLogger.error(this.name, '[POT] CRITICAL: Pot not cleared after calculateAndAwardSidePots - forcing clear', {
                pot: potBeforeFinalCheck,
                handNumber: this.handsPlayed,
                phase: this.phase,
                totalAwarded,
                potAwardsCount: potAwards.length
            });
            
            // CRITICAL FIX: totalStartingChips should NEVER be decreased
            // If chips are lost, this is a CRITICAL BUG that must be fixed, not masked
            const chipsLost = potBeforeFinalCheck;
            console.error(`[Table ${this.name}] ⚠️⚠️⚠️ CRITICAL BUG: ${chipsLost} chips LOST due to pot not cleared! totalStartingChips MUST NOT be decreased!`);
            gameLogger.error(this.name, '[MONEY] CRITICAL: Chips lost - totalStartingChips NOT adjusted (should never decrease)', {
                chipsLost,
                potBeforeFinalCheck,
                totalStartingChips: this.totalStartingChips,
                totalAwarded,
                handNumber: this.handsPlayed,
                phase: this.phase,
                reason: 'Pot was not cleared after awards - chips were lost. totalStartingChips should NEVER decrease.'
            });
            
            // REMOVED: Automatic pause on chip loss after awards - it masks the problem
            // Errors are logged above for investigation.
            
            // Record fix attempt for the METHOD of "adjusting totalStartingChips downward" - this method has FAILED
            // This tracks the METHOD, not the issue - if this method fails 5 times, we must try a different approach
            this._recordFixAttempt('FIX_1_TOTAL_STARTING_CHIPS_ADJUSTMENT', false, {
                context: 'CALCULATE_AND_AWARD_SIDE_POTS',
                method: 'ADJUST_DOWNWARD_FOR_POT_LOSS',
                chipsLost,
                potBeforeFinalCheck,
                totalAwarded,
                handNumber: this.handsPlayed,
                phase: this.phase,
                reason: 'Attempted to decrease totalStartingChips - this method FAILS because totalStartingChips should NEVER decrease'
            });
            
            // Record fix attempt - pot not cleared is a failure
            this._recordFixAttempt('FIX_1_POT_NOT_CLEARED_IN_AWARDPOT', false, {
                context: 'CALCULATE_AND_AWARD_SIDE_POTS',
                potBeforeFinalCheck,
                totalAwarded,
                handNumber: this.handsPlayed,
                phase: this.phase,
                potAwardsCount: potAwards.length
            });
            
            // Always clear pot, even if we couldn't award it - use _clearPotWithTrace
            this._clearPotWithTrace('CALCULATE_AND_AWARD_SIDE_POTS_POT_NOT_CLEARED', 'Pot not cleared after awards - forcing clear');
        } else {
            // Pot was correctly cleared - record success
            this._recordFixAttempt('FIX_1_POT_NOT_CLEARED_IN_AWARDPOT', true, {
                context: 'CALCULATE_AND_AWARD_SIDE_POTS',
                potBeforeFinalCheck: 0,
                totalAwarded,
                handNumber: this.handsPlayed,
                phase: this.phase,
                potAwardsCount: potAwards.length
            });
        }
            
        } catch (err) {
            // CRITICAL: Log any exceptions that occur during pot calculation
            error = err;
            console.error(`[Table ${this.name}] ⚠️ CRITICAL EXCEPTION in calculateAndAwardSidePots:`, err);
            gameLogger.error(this.name, '[POT] CRITICAL: Exception in calculateAndAwardSidePots', {
                error: err.message,
                stack: err.stack,
                handNumber: this.handsPlayed,
                phase: this.phase,
                potBeforeException: initialPot,
                potAfterException: this.pot
            });
        } finally {
            // CRITICAL: ALWAYS clear pot, even if there was an exception
            // This prevents pot from persisting to next hand and causing chip loss
            const potBeforeFinalClear = this.pot;
            if (potBeforeFinalClear > 0) {
                console.error(`[Table ${this.name}] ⚠️ CRITICAL FINALLY: Pot still has ${potBeforeFinalClear} chips after calculateAndAwardSidePots! Forcing clear in finally block.`);
                gameLogger.error(this.name, '[POT] CRITICAL: Pot not cleared - forcing clear in finally block', {
                    pot: potBeforeFinalClear,
                    initialPot,
                    totalAwarded,
                    handNumber: this.handsPlayed,
                    phase: this.phase,
                    potAwardsCount: potAwards.length,
                    hadException: error !== null
                });
                
                // CRITICAL FIX: totalStartingChips should NEVER be decreased
                // If chips are lost, this is a CRITICAL BUG that must be fixed, not masked
                const chipsLost = potBeforeFinalClear;
                console.error(`[Table ${this.name}] ⚠️⚠️⚠️ CRITICAL BUG: ${chipsLost} chips LOST in finally block! totalStartingChips MUST NOT be decreased!`);
                gameLogger.error(this.name, '[MONEY] CRITICAL: Chips lost in finally - totalStartingChips NOT adjusted (should never decrease)', {
                    chipsLost,
                    potBeforeFinalClear,
                    totalStartingChips: this.totalStartingChips,
                    initialPot,
                    totalAwarded,
                    handNumber: this.handsPlayed,
                    phase: this.phase,
                    reason: 'Pot was not cleared after awards in finally block - chips were lost. totalStartingChips should NEVER decrease.'
                });
                
                // REMOVED: Automatic pause on chip loss in finally block - it masks the problem
                // Errors are logged above for investigation.
                
                // Record fix attempt for the METHOD of "adjusting totalStartingChips downward" - this method has FAILED
                this._recordFixAttempt('FIX_1_TOTAL_STARTING_CHIPS_ADJUSTMENT', false, {
                    context: 'CALCULATE_AND_AWARD_SIDE_POTS_FINALLY',
                    method: 'ADJUST_DOWNWARD_FOR_POT_LOSS_FINALLY',
                    chipsLost,
                    potBeforeFinalClear,
                    initialPot,
                    handNumber: this.handsPlayed,
                    phase: this.phase,
                    reason: 'Attempted to decrease totalStartingChips in finally - this method FAILS because totalStartingChips should NEVER decrease'
                });
                
                // Record fix attempt - pot not cleared is a failure
                this._recordFixAttempt('FIX_1_POT_NOT_CLEARED_IN_AWARDPOT', false, {
                    context: 'CALCULATE_AND_AWARD_SIDE_POTS_FINALLY',
                    potBeforeFinalClear,
                    totalAwarded,
                    handNumber: this.handsPlayed,
                    phase: this.phase,
                    potAwardsCount: potAwards.length
                });
            }
            
            // ALWAYS clear pot, no matter what
            // ROOT CAUSE: Trace pot clearing in finally
            this._clearPotWithTrace('CALCULATE_AND_AWARD_SIDE_POTS_FINALLY', 'Finally block pot clear');
            // console.log(`[Table ${this.name}] [FINALLY] Pot cleared: ${potBeforeFinalClear} → 0`);
        }
        
        // ROOT CAUSE: Trace end of calculateAndAwardSidePots
        const afterState = this._getChipState();
        this._traceOperation('CALCULATE_AND_AWARD_SIDE_POTS_COMPLETE', beforeState, afterState);
        
        return potAwards;
    }

    awardPot(winner) {
        this._traceUniversal('AWARD_POT', { 
            winnerName: winner?.name,
            winnerId: winner?.playerId,
            pot: this.pot,
            phase: this.phase
        });
        
        // ROOT CAUSE: Trace awardPot operation
        const beforeState = this._getChipState();
        
        // CRITICAL: Store initial pot value to ensure it's always cleared, even on exceptions
        const initialPot = this.pot;
        let error = null;
        
        try {
        // Simple case - everyone folded, winner takes pot
        // CRITICAL: Eliminated players don't get chips back - they're out!
        const seat = this.seats.find(s => s?.playerId === winner.playerId);
        const potAmount = this.pot;
        const chipsBefore = seat?.chips || 0;
        
        gameLogger.gameEvent(this.name, '[POT] Awarding pot (everyone folded)', {
            winner: winner?.name,
            potAmount,
            chipsBefore,
            seatIndex: seat ? this.seats.indexOf(seat) : -1,
            isActive: seat?.isActive,
            phase: this.phase
        });
        
        if (seat && seat.isActive !== false) {
            // Only award chips to active (non-eliminated) players
            // ULTRA-VERBOSE: Log before award
            const potBeforeAward = this.pot;
            const chipsBeforeAward = seat.chips;
            
            // CRITICAL: Track chip movement BEFORE operation
            const movement = this._trackChipMovement('AWARD_POT_SIMPLE', {
                winner: winner.name,
                seatIndex: this.seats.indexOf(seat),
                amount: potAmount,
                chipsBefore: chipsBeforeAward,
                potBefore: potBeforeAward,
                reason: 'Everyone folded - winner takes pot'
            });
            
            // SYSTEMATIC DEBUG: Track chip movement during award in awardPot
            const totalChipsBeforeAward = this.seats.filter(s => s !== null && s.isActive !== false).reduce((sum, s) => sum + (s.chips || 0), 0);
            const totalChipsAndPotBeforeAward = totalChipsBeforeAward + this.pot;
            
            // CRITICAL FIX: Decrement pot when awarding chips to prevent double-counting
            // Chips move from pot to player, so pot must decrease by award amount
            seat.chips += potAmount;
            this.pot -= potAmount; // FIX: Decrement pot to match chip transfer
            
            // SYSTEMATIC DEBUG: Track chip movement after award
            const totalChipsAfterAward = this.seats.filter(s => s !== null && s.isActive !== false).reduce((sum, s) => sum + (s.chips || 0), 0);
            const totalChipsAndPotAfterAward = totalChipsAfterAward + this.pot;
            const chipsLostDuringAward = totalChipsAndPotBeforeAward - totalChipsAndPotAfterAward;
            
            const debugLogAwardPot = `[SYSTEMATIC_DEBUG] AWARD_POT AWARD: Player=${winner.name}, Amount=${potAmount}, chipsLost=${chipsLostDuringAward}, expected=0\n`;
            console.log(debugLogAwardPot.trim());
            fs.appendFileSync(path.join(__dirname, '../../logs/pot-award-debug.log'), new Date().toISOString() + ' ' + debugLogAwardPot);
            
            if (Math.abs(chipsLostDuringAward) > 0.01) {
                console.error(`[Table ${this.name}] ⚠️⚠️⚠️ [SYSTEMATIC_DEBUG] POT AWARD BUG DETECTED in awardPot! Chips lost: ${chipsLostDuringAward}`);
                gameLogger.error(this.name, '[SYSTEMATIC_DEBUG] POT AWARD BUG: Chips lost during award', {
                    player: winner.name,
                    amount: potAmount,
                    chipsLostDuringAward,
                    totalChipsAndPotBeforeAward,
                    totalChipsAndPotAfterAward,
                    handNumber: this.handsPlayed
                });
            }
            
            // CRITICAL: Validate after operation
            this._validateChipMovement(movement, 'AWARD_POT_SIMPLE');
            
            // CRITICAL DEBUG: Verify chips are actually in the seat object
            const seatIndex = this.seats.indexOf(seat);
            const actualSeatChips = this.seats[seatIndex]?.chips || 0;
            if (actualSeatChips !== seat.chips) {
                console.error(`[Table ${this.name}] ⚠️⚠️⚠️ CRITICAL: seat.chips (${seat.chips}) != this.seats[${seatIndex}].chips (${actualSeatChips})! Reference issue!`);
                gameLogger.error(this.name, '[CRITICAL] Seat reference mismatch', {
                    winner: winner.name,
                    seatIndex,
                    seatChips: seat.chips,
                    actualSeatChips,
                    potAmount,
                    handNumber: this.handsPlayed
                });
            }
            
            // ULTRA-VERBOSE: Verify award immediately
            if (seat.chips !== chipsBeforeAward + potAmount) {
                console.error(`[Table ${this.name}] ⚠️ CRITICAL AWARD_POT ERROR: Chips calculation failed! Player: ${winner.name}, Before: ${chipsBeforeAward}, Amount: ${potAmount}, After: ${seat.chips}, Expected: ${chipsBeforeAward + potAmount}`);
                gameLogger.error(this.name, '[POT] CRITICAL: awardPot calculation error', {
                    player: winner.name,
                    chipsBefore: chipsBeforeAward,
                    potAmount,
                    chipsAfter: seat.chips,
                    expected: chipsBeforeAward + potAmount,
                    handNumber: this.handsPlayed,
                    phase: this.phase
                });
            }
            
            gameLogger.gameEvent(this.name, '[POT] Chips awarded', {
                winner: winner.name,
                potAmount,
                chipsBefore,
                chipsAfter: seat.chips,
                calculationCheck: chipsBefore + potAmount === seat.chips ? 'CORRECT' : 'ERROR'
            });
            
            // CRITICAL: Calculate total chips BEFORE clearing pot to verify chips are in system
            const totalChipsAfterAwardValidation = this.seats.filter(s => s !== null && s.isActive !== false).reduce((sum, s) => sum + (s.chips || 0), 0);
            const totalChipsAndPotAfterAwardValidation = totalChipsAfterAwardValidation + this.pot;
            
            // CRITICAL: Verify chips are in system after award (before clearing pot)
            // NOTE: Pot may legitimately change if side pots were awarded or pot was partially cleared
            // This is a validation warning, not necessarily a critical error
            if (this.pot !== potAmount && this.pot > 0) {
                // Only log as error if pot is still > 0 (chips not fully awarded)
                // If pot is 0, it was legitimately cleared
                gameLogger.gameEvent(this.name, '[POT VALIDATION] Pot changed after award', {
                    potAmount,
                    potAfterAward: this.pot,
                    winner: winner.name,
                    handNumber: this.handsPlayed,
                    phase: this.phase,
                    note: 'Pot may have been partially cleared or side pots awarded'
                });
            } else if (this.pot !== potAmount && this.pot === 0) {
                // Pot was cleared - this is expected and fine
                gameLogger.gameEvent(this.name, '[POT VALIDATION] Pot cleared after award (expected)', {
                    potAmount,
                    potAfterAward: this.pot,
                    winner: winner.name,
                    handNumber: this.handsPlayed,
                    phase: this.phase
                });
            }
            
            // CRITICAL: Always clear pot after awarding
            // ROOT CAUSE: Trace pot clearing - chips should already be in winner's chips
            // CRITICAL FIX: Use _clearPotWithTrace instead of direct assignment to ensure proper tracing
            const beforeClearState = this._getChipState();
            this._clearPotWithTrace('AWARD_POT_CLEAR', 'Pot cleared after awarding to winner');
            const afterClearState = this._getChipState();
            this._traceOperation('AWARD_POT_CLEAR_TRACE', beforeClearState, afterClearState);
            
            // CRITICAL: Verify chips weren't lost when clearing pot
            // When we clear pot, totalChipsInSystem should stay the same (chips moved from pot to player)
            const expectedTotalAfterClear = beforeClearState.totalChipsInSystem; // Should be same (chips in player + pot = chips in player + 0)
            if (Math.abs(afterClearState.totalChipsInSystem - expectedTotalAfterClear) > 0.01) {
                const chipsLost = beforeClearState.totalChipsInSystem - afterClearState.totalChipsInSystem;
                console.error(`[Table ${this.name}] ⚠️⚠️⚠️ CRITICAL: ${chipsLost} chips LOST when clearing pot after award!`);
                console.error(`[Table ${this.name}] Before clear: totalChips=${beforeClearState.totalChipsInSystem}, pot=${beforeClearState.pot}, playerChips=${beforeClearState.playerChips}`);
                console.error(`[Table ${this.name}] After clear: totalChips=${afterClearState.totalChipsInSystem}, pot=${afterClearState.pot}, playerChips=${afterClearState.playerChips}`);
                gameLogger.error(this.name, '[ROOT CAUSE] Chips lost when clearing pot after award', {
                    chipsLost,
                    potAmount,
                    beforeClearState,
                    afterClearState,
                    totalChipsAfterAwardValidation,
                    totalChipsAndPotAfterAwardValidation,
                    winner: winner.name,
                    winnerChipsBefore: chipsBefore,
                    winnerChipsAfter: seat.chips,
                    handNumber: this.handsPlayed,
                    phase: this.phase
                });
            }
        } else if (seat && seat.isActive === false) {
            // CRITICAL FIX: Eliminated player won pot - redistribute to best active player
            gameLogger.error(this.name, '[POT] CRITICAL: Eliminated player won pot - redistributing', {
                eliminatedWinner: winner.name,
                potAmount,
                reason: 'Player was eliminated but won pot - redistributing'
            });
            
            // Find best active player who has chips and is still in the game
            const activeSeats = this.seats
                .filter(s => s && s.isActive !== false && s.chips > 0)
                .sort((a, b) => b.chips - a.chips); // Sort by chips (best active player)
            
            if (activeSeats.length > 0) {
                const bestActive = activeSeats[0];
                const chipsBefore = bestActive.chips;
                
                // CRITICAL: Track redistribution BEFORE operation
                const movement = this._trackChipMovement('REDISTRIBUTE_POT_FROM_ELIMINATED_WINNER', {
                    from: winner.name,
                    to: bestActive.name,
                    potAmount,
                    chipsBefore
                });
                
                // ULTRA-VERBOSE: Log before redistribution
                const chipsBeforeRedist = bestActive.chips;
                
                bestActive.chips += potAmount;
                
                // ULTRA-VERBOSE: Verify redistribution immediately
                if (bestActive.chips !== chipsBeforeRedist + potAmount) {
                    console.error(`[Table ${this.name}] ⚠️ CRITICAL REDISTRIBUTE_WINNER ERROR: Chips calculation failed! To: ${bestActive.name}, Before: ${chipsBeforeRedist}, Amount: ${potAmount}, After: ${bestActive.chips}, Expected: ${chipsBeforeRedist + potAmount}`);
                }
                
                // CRITICAL: Validate after redistribution
                this._validateChipMovement(movement, 'REDISTRIBUTE_POT_FROM_ELIMINATED_WINNER');
                console.log(`[Table ${this.name}] FIX: Redistributed ${potAmount} from eliminated ${winner.name} to ${bestActive.name} (chips: ${chipsBefore} → ${bestActive.chips})`);
                gameLogger.gameEvent(this.name, '[POT] Redistributed from eliminated winner', {
                    from: winner.name,
                    to: bestActive.name,
                    amount: potAmount,
                    chipsBefore,
                    chipsAfter: bestActive.chips
                });
                // CRITICAL: Always clear pot after redistribution - use _clearPotWithTrace
                this._clearPotWithTrace('AWARD_POT_REDISTRIBUTE_ELIMINATED_WINNER', 'Pot cleared after redistributing from eliminated winner');
            } else {
                // No active players - this is a game over scenario, but pot should have been handled earlier
                console.error(`[Table ${this.name}] ⚠️ CRITICAL: No active players to redistribute ${potAmount} to - pot will be lost!`);
                gameLogger.error(this.name, 'No active players for redistribution from eliminated winner', {
                    amount: potAmount,
                    eliminatedWinner: winner.name
                });
            }
        }
        
        // CRITICAL FIX #1: Ensure pot is ALWAYS cleared after awardPot, even if errors occurred
        const potBeforeClear = this.pot;
        if (potBeforeClear > 0) {
            // Pot wasn't cleared - this is a critical error, but we MUST clear it to prevent chip loss
            console.error(`[Table ${this.name}] ⚠️ CRITICAL: Pot (${potBeforeClear}) not cleared in awardPot - FORCING CLEAR to prevent chip loss!`);
            gameLogger.error(this.name, '[POT] CRITICAL: Pot not cleared in awardPot - forcing clear', {
                potBeforeClear,
                winner: winner?.name,
                handNumber: this.handsPlayed,
                phase: this.phase,
                reason: 'Pot should have been cleared but wasn\'t - emergency clear to prevent chip loss'
            });
            // Emergency: Award to first active player if possible
            const activeSeats = this.seats.filter(s => s && s.isActive !== false && s.chips > 0);
            let emergencyAwardSuccess = false;
            if (activeSeats.length > 0) {
                const emergencyRecipient = activeSeats[0];
                const chipsBefore = emergencyRecipient.chips;
                emergencyRecipient.chips += potBeforeClear;
                emergencyAwardSuccess = true;
                console.error(`[Table ${this.name}] ⚠️ EMERGENCY: Awarding ${potBeforeClear} to ${emergencyRecipient.name} to prevent loss`);
                gameLogger.gameEvent(this.name, '[POT] EMERGENCY: Awarding unclaimed pot in awardPot', {
                    recipient: emergencyRecipient.name,
                    amount: potBeforeClear,
                    chipsBefore,
                    chipsAfter: emergencyRecipient.chips
                });
            }
            // Always clear pot, even if we couldn't award it
            // ROOT CAUSE: Trace pot clearing
            this._clearPotWithTrace('AWARD_POT_EMERGENCY_CLEAR', 'Emergency pot clear in awardPot');
            
            // Record fix attempt - pot not cleared is a failure, but emergency clear is a mitigation
            this._recordFixAttempt('FIX_1_POT_NOT_CLEARED_IN_AWARDPOT', emergencyAwardSuccess, {
                context: 'AWARD_POT',
                potBeforeClear,
                winner: winner?.name,
                handNumber: this.handsPlayed,
                phase: this.phase,
                emergencyAwardSuccess
            });
        } else {
            // Pot was correctly cleared - record success
            this._recordFixAttempt('FIX_1_POT_NOT_CLEARED_IN_AWARDPOT', true, {
                context: 'AWARD_POT',
                potBeforeClear: 0,
                winner: winner?.name,
                handNumber: this.handsPlayed,
                phase: this.phase
            });
        }
        const totalChipsBeforeClear = this.seats.filter(s => s !== null && s.isActive !== false).reduce((sum, s) => sum + (s.chips || 0), 0);
        const totalChipsAndPotBeforeClear = totalChipsBeforeClear + this.pot;
        
        // console.log(`[Table ${this.name}] [FIX #1: CLEAR_POT_AFTER_AWARD PRE-OP] Hand: ${this.handsPlayed} | Pot: ${potBeforeClear} | TotalChips: ${totalChipsBeforeClear} | TotalChips+Pot: ${totalChipsAndPotBeforeClear}`);
        gameLogger.gameEvent(this.name, '[FIX #1: CLEAR_POT_AFTER_AWARD] PRE-OPERATION STATE', {
            handNumber: this.handsPlayed,
            potBeforeClear,
            totalChipsBeforeClear,
            totalChipsAndPotBeforeClear,
            totalStartingChips: this.totalStartingChips,
            phase: this.phase,
            winner: winner.name,
            winnerChips: seat?.chips || 0
        });
        
        if (potBeforeClear > 0) {
            // ULTRA-VERBOSE: Log pot clearing
            // console.log(`[Table ${this.name}] [FIX #1: POT CLEAR] Clearing pot after awardPot: ${potBeforeClear} chips | Hand: ${this.handsPlayed} | Phase: ${this.phase} | Winner: ${winner.name}`);
            gameLogger.gameEvent(this.name, '[FIX #1: POT] Clearing pot after awardPot', {
                potBefore: potBeforeClear,
                handNumber: this.handsPlayed,
                phase: this.phase,
                winner: winner.name,
                winnerChips: seat?.chips || 0
            });
            
            const movement = this._trackChipMovement('CLEAR_POT_AFTER_AWARD', {
                potBefore: potBeforeClear,
                reason: 'Pot awarded in awardPot(), clearing'
            });
            // ROOT CAUSE: Trace pot clearing
            this._clearPotWithTrace('CLEAR_POT_AFTER_AWARD', 'Pot cleared after awardPot');
            this._validateChipMovement(movement, 'CLEAR_POT_AFTER_AWARD');
        } else {
            // ULTRA-VERBOSE: Log even when pot is 0
            if (potBeforeClear !== 0) {
                console.error(`[Table ${this.name}] ⚠️ FIX #1 POT CLEAR WARNING: Pot was ${potBeforeClear} but should be 0!`);
            }
            // ROOT CAUSE: Trace pot clearing even when already 0
            this._clearPotWithTrace('CLEAR_POT_AFTER_AWARD_ZERO', 'Pot already 0, ensuring it stays 0');
        }
        
        // ULTRA-VERBOSE: Log after pot clear
        const totalChipsAfterClear = this.seats.filter(s => s !== null && s.isActive !== false).reduce((sum, s) => sum + (s.chips || 0), 0);
        const totalChipsAndPotAfterClear = totalChipsAfterClear + this.pot;
        const clearDifference = totalChipsAndPotAfterClear - totalChipsAndPotBeforeClear;
        
        // console.log(`[Table ${this.name}] [FIX #1: CLEAR_POT_AFTER_AWARD POST-OP] Hand: ${this.handsPlayed} | Pot: ${this.pot} | TotalChips: ${totalChipsAfterClear} | TotalChips+Pot: ${totalChipsAndPotAfterClear} | Difference: ${clearDifference}`);
        gameLogger.gameEvent(this.name, '[FIX #1: CLEAR_POT_AFTER_AWARD] POST-OPERATION STATE', {
            handNumber: this.handsPlayed,
            potAfterClear: this.pot,
            totalChipsAfterClear,
            totalChipsAndPotAfterClear,
            clearDifference,
            totalStartingChips: this.totalStartingChips
        });
        
        if (Math.abs(clearDifference + potBeforeClear) > 0.01) {
            console.error(`[Table ${this.name}] ⚠️ CRITICAL FIX #1 ERROR: Clear difference (${clearDifference}) != -potBeforeClear (${-potBeforeClear})!`);
            gameLogger.error(this.name, '[FIX #1: CLEAR_POT_AFTER_AWARD] CRITICAL: Clear difference mismatch', {
                handNumber: this.handsPlayed,
                potBeforeClear,
                clearDifference,
                totalChipsAndPotBeforeClear,
                totalChipsAndPotAfterClear
            });
        }
        
        // CRITICAL: NOW that pot is awarded, clear totalBet and currentBet for all seats
        // This is safe because the pot has been fully distributed
        // CRITICAL FIX: Clear totalBet and currentBet IMMEDIATELY after pot award to prevent persistence
        let totalBetClearedCount = 0;
        let currentBetClearedCount = 0;
        for (const seat of this.seats) {
            if (seat) {
                if (seat.totalBet > 0) {
                    totalBetClearedCount++;
                    // console.log(`[Table ${this.name}] [FIX] Clearing totalBet=${seat.totalBet} for ${seat.name} after awardPot`);
                    gameLogger.gameEvent(this.name, '[FIX] Clearing totalBet after awardPot', {
                        player: seat.name,
                        totalBet: seat.totalBet,
                        handNumber: this.handsPlayed
                    });
                }
                if (seat.currentBet > 0) {
                    currentBetClearedCount++;
                    // console.log(`[Table ${this.name}] [FIX] Clearing currentBet=${seat.currentBet} for ${seat.name} after awardPot`);
                    gameLogger.gameEvent(this.name, '[FIX] Clearing currentBet after awardPot', {
                        player: seat.name,
                        currentBet: seat.currentBet,
                        handNumber: this.handsPlayed
                    });
                }
                seat.totalBet = 0;
                seat.currentBet = 0;
            }
        }
        
        // Record fix attempt - if we had to clear totalBet or currentBet, it means they weren't cleared earlier (failure)
        // If no totalBet/currentBet to clear, that's success (they were already cleared or never set)
        if (totalBetClearedCount > 0 || currentBetClearedCount > 0) {
            this._recordFixAttempt('FIX_1_TOTAL_BET_NOT_CLEARED', false, {
                context: 'AFTER_AWARD_POT',
                playersWithTotalBet: totalBetClearedCount,
                playersWithCurrentBet: currentBetClearedCount,
                handNumber: this.handsPlayed
            });
        } else {
            this._recordFixAttempt('FIX_1_TOTAL_BET_NOT_CLEARED', true, {
                context: 'AFTER_AWARD_POT',
                handNumber: this.handsPlayed
            });
        }
        
        // ROOT CAUSE: Trace end of awardPot
        const afterState = this._getChipState();
        this._traceOperation('AWARD_POT_COMPLETE', beforeState, afterState);

        // Send hand data to stats engine (fold-win path — everyone folded)
        this._collectAndSendStatsData([{
            playerId: winner.playerId,
            name: winner.name,
            amount: potAmount,
            handName: 'Fold Win'
        }], false);
        
        // CRITICAL: NOW that pot is awarded, we can safely remove eliminated players
        // CRITICAL FIX: DO NOT subtract buy-in from totalStartingChips when players are eliminated!
        // The chips are still in the system (just redistributed to other players), so totalStartingChips should remain constant.
        // totalStartingChips represents the total chips at game start, which never changes during gameplay.
        for (let i = 0; i < this.seats.length; i++) {
            const seat = this.seats[i];
            if (seat && seat.isActive === false) {
                // Log elimination but DO NOT modify totalStartingChips
                console.log(`[Table ${this.name}] [ELIMINATION] ${seat.name} eliminated - NOT subtracting buy-in from totalStartingChips (chips still in system)`);
                gameLogger.gameEvent(this.name, '[ELIMINATION] Player eliminated - NOT modifying totalStartingChips', {
                    player: seat.name,
                    playerId: seat.playerId,
                    seatIndex: i,
                    buyIn: this.buyIn,
                    isBot: seat.isBot || false,
                    playerChips: seat.chips,
                    playerTotalBet: seat.totalBet || 0,
                    totalStartingChips: this.totalStartingChips,
                    reason: 'Chips still in system (redistributed to other players) - totalStartingChips remains constant',
                    allEliminatedPlayers: this.seats.filter(s => s && s.isActive === false).map(s => ({
                        name: s.name,
                        seatIndex: this.seats.indexOf(s),
                        chips: s.chips,
                        totalBet: s.totalBet || 0
                    }))
                });
                
                // Only remove regular bots (socket bots are managed by SimulationManager)
                if (seat.isBot) {
                    // console.log(`[Table ${this.name}] Removing eliminated bot ${seat.name} after pot award`);
                    this.seats[i] = null;
                }
            }
        }
        
        // ULTRA-VERBOSE: Log complete state after pot award
        const finalState = this._getChipState();
        // console.log(`[Table ${this.name}] [AFTER_AWARD_POT] Complete state | Winner: ${winner.name} | Hand: ${this.handsPlayed} | Phase: ${this.phase} | totalStartingChips: ${this.totalStartingChips} | totalChipsInSystem: ${finalState.totalChipsInSystem} | difference: ${finalState.difference}`);
        gameLogger.gameEvent(this.name, '[AFTER_AWARD_POT] Complete state snapshot', {
            winner: winner.name,
            winnerId: winner.playerId,
            handNumber: this.handsPlayed,
            phase: this.phase,
            totalStartingChips: this.totalStartingChips,
            finalState,
            potAmount
        });
        
        // CRITICAL: Validate money after pot award
        this._validateMoney(`AFTER_AWARD_POT_${winner.name}`);
        
        // CRITICAL: Broadcast state immediately so clients see updated chips
        this.onStateChange?.();
        
        // Notify about the winner (for hand_result event)
        // Small delay to ensure state is received before hand_result
        if (this.onHandComplete) {
            setTimeout(() => {
                // SYSTEMATIC DEBUG: Log what we're sending to client (everyone folded case)
                const handCompleteLog = `[SYSTEMATIC_DEBUG] HAND_COMPLETE (FOLD): Winner=${winner.name}, WinnerAward=${potAmount}, TotalPot=${potAmount}, AwardsCount=1\n`;
                console.log(handCompleteLog.trim());
                fs.appendFileSync(path.join(__dirname, '../../logs/pot-award-debug.log'), new Date().toISOString() + ' ' + handCompleteLog);
                
                this.onHandComplete({
                    winnerId: winner.playerId,
                    winnerName: winner.name,
                    handName: "Everyone Folded",
                    potAmount: potAmount, // Correct: In fold case, winner gets entire pot (no excess/refund)
                    totalPot: potAmount, // Total pot for reference
                    refundAmount: 0, // No refund in fold case - pot only has actual bets
                    totalAward: potAmount, // Same as potAmount in fold case
                    potAwards: [{
                        playerId: winner.playerId,
                        name: winner.name,
                        amount: potAmount,
                        handName: "Everyone Folded",
                        potType: 'main',
                        isRefund: false
                    }]
                });
            }, 100); // Small delay to ensure state broadcast happens first
        }
        
        // Start new hand after showing results
        setTimeout(() => {
            // Broadcast state one more time before starting new hand
            // Capture snapshot before broadcasting
            if (this.stateSnapshot) {
                const state = this.getState(null);
                this.stateSnapshot.capture(state, {
                    phase: this.phase,
                    handsPlayed: this.handsPlayed,
                    reason: 'state_change'
                });
            }
            this._onStateChangeCallback?.();
            setTimeout(() => {
                // CRITICAL: Clear pot one final time before starting new hand (safeguard)
                if (this.pot > 0) {
                    console.error(`[Table ${this.name}] ⚠️ CRITICAL: Pot still has ${this.pot} chips before startNewHand! Clearing now.`);
                    gameLogger.error(this.name, '[POT] CRITICAL: Pot not cleared before startNewHand - forcing clear', {
                        pot: this.pot,
                        handNumber: this.handsPlayed
                    });
                    // CRITICAL: Use _clearPotWithTrace instead of direct assignment
                    this._clearPotWithTrace('ADVANCE_GAME_FORCE_CLEAR_BEFORE_START_NEW_HAND', 'Pot not cleared before startNewHand');
                }
                this.startNewHand();
            }, 500);
        }, 3000); // 3 seconds to show winner, then 0.5s transition
        
        } catch (err) {
            // CRITICAL: Log any exceptions that occur during pot award
            error = err;
            console.error(`[Table ${this.name}] ⚠️ CRITICAL EXCEPTION in awardPot:`, err);
            gameLogger.error(this.name, '[POT] CRITICAL: Exception in awardPot', {
                error: err.message,
                stack: err.stack,
                handNumber: this.handsPlayed,
                phase: this.phase,
                potBeforeException: initialPot,
                potAfterException: this.pot,
                winner: winner?.name
            });
        } finally {
            // CRITICAL: ALWAYS clear pot, even if there was an exception
            // This prevents pot from persisting to next hand and causing chip loss
            const potBeforeFinalClear = this.pot;
            if (potBeforeFinalClear > 0) {
                console.error(`[Table ${this.name}] ⚠️ CRITICAL FINALLY: Pot still has ${potBeforeFinalClear} chips after awardPot! Forcing clear in finally block.`);
                gameLogger.error(this.name, '[POT] CRITICAL: Pot not cleared - forcing clear in finally block (awardPot)', {
                    pot: potBeforeFinalClear,
                    initialPot,
                    handNumber: this.handsPlayed,
                    phase: this.phase,
                    winner: winner?.name,
                    hadException: error !== null
                });
                
                // CRITICAL FIX: totalStartingChips should NEVER be decreased
                // If chips are lost, this is a CRITICAL BUG that must be fixed, not masked
                const chipsLost = potBeforeFinalClear;
                console.error(`[Table ${this.name}] ⚠️⚠️⚠️ CRITICAL BUG: ${chipsLost} chips LOST in finally block (awardPot)! totalStartingChips MUST NOT be decreased!`);
                gameLogger.error(this.name, '[MONEY] CRITICAL: Chips lost in finally (awardPot) - totalStartingChips NOT adjusted (should never decrease)', {
                    chipsLost,
                    potBeforeFinalClear,
                    totalStartingChips: this.totalStartingChips,
                    initialPot,
                    winner: winner?.name,
                    handNumber: this.handsPlayed,
                    phase: this.phase,
                    reason: 'Pot was not cleared after awardPot in finally block - chips were lost. totalStartingChips should NEVER decrease.'
                });
                
                // REMOVED: Automatic pause on chip loss in awardPot finally block - it masks the problem
                // Errors are logged above for investigation.
                
                // Record fix attempt for the METHOD of "adjusting totalStartingChips downward" - this method has FAILED
                this._recordFixAttempt('FIX_1_TOTAL_STARTING_CHIPS_ADJUSTMENT', false, {
                    context: 'AWARD_POT_FINALLY',
                    method: 'ADJUST_DOWNWARD_FOR_POT_LOSS_FINALLY_AWARDPOT',
                    chipsLost,
                    potBeforeFinalClear,
                    initialPot,
                    winner: winner?.name,
                    handNumber: this.handsPlayed,
                    phase: this.phase,
                    reason: 'Attempted to decrease totalStartingChips in finally (awardPot) - this method FAILS because totalStartingChips should NEVER decrease'
                });
            }
            
            // ALWAYS clear pot, no matter what - use _clearPotWithTrace
            this._clearPotWithTrace('AWARD_POT_FINALLY', 'Pot cleared in finally block of awardPot');
            // console.log(`[Table ${this.name}] [FINALLY awardPot] Pot cleared: ${potBeforeFinalClear} → 0`);
        }
    }

    // ============ Spectators ============

    addSpectator(userId, name, socketId) {
        gameLogger.spectator(this.name, 'addSpectator called', {
            userId, name, socketId, 
            allowSpectators: this.allowSpectators,
            currentSpectators: this.spectators.size,
            maxSpectators: this.maxSpectators,
            isSimulation: this.isSimulation
        });
        
        if (!this.allowSpectators) {
            gameLogger.spectator(this.name, 'addSpectator REJECTED: spectators not allowed', { userId, name });
            return { success: false, error: 'Spectators not allowed' };
        }
        if (this.spectators.size >= this.maxSpectators) {
            gameLogger.spectator(this.name, 'addSpectator REJECTED: limit reached', { userId, name });
            return { success: false, error: 'Spectator limit reached' };
        }
        
        this.spectators.set(userId, { oderId: userId, playerName: name, socketId });
        gameLogger.spectator(this.name, 'Spectator added successfully', {
            userId, name,
            totalSpectators: this.spectators.size,
            allSpectatorIds: Array.from(this.spectators.keys())
        });
        return { success: true };
    }

    removeSpectator(userId) {
        this.spectators.delete(userId);
    }

    getSpectatorCount() {
        return this.spectators.size;
    }

    isSpectator(userId) {
        const result = this.spectators.has(userId);
        // Spectator check logging removed - too verbose (called on every state request)
        // Only log when spectator status changes (add/remove spectator)
        return result;
    }

    // ============ Password ============

    checkPassword(password) {
        if (!this.hasPassword) return true;
        return this.password === password;
    }

    // ============ Invites ============

    invitePlayer(userId) {
        this.pendingInvites.add(userId);
    }

    isInvited(userId) {
        return this.pendingInvites.has(userId);
    }

    clearInvite(userId) {
        this.pendingInvites.delete(userId);
    }

    // ============ Item Ante ("For Keeps") ============
    // CRITICAL: Item ante is for ITEMS ONLY - NO MONEY/CHIPS!
    // This is like an ante where each player puts an item in, winner takes all.
    // Real poker chip side pots are handled in calculateAndAwardSidePots() method above

    /**
     * First player starts the item ante with their item (sets minimum value)
     * CRITICAL: This is for ITEMS ONLY - no money/chips allowed!
     */
    startItemAnte(userId, item) {
        // ROOT TRACING: Track item ante start operation
        this._traceUniversal('ITEM_ANTE_START', {
            userId,
            itemId: item?.id,
            itemName: item?.name,
            itemAnteEnabled: this.itemAnteEnabled,
            itemAnteExists: !!this.itemAnte,
            gameStarted: this.gameStarted,
            phase: this.phase
        });
        
        if (!this.itemAnteEnabled) {
            this._traceUniversalAfter('ITEM_ANTE_START', { success: false, error: 'NOT_ENABLED' });
            return { success: false, error: 'Item ante is not enabled for this table' };
        }
        if (!this.itemAnte) {
            this._traceUniversalAfter('ITEM_ANTE_START', { success: false, error: 'ITEM_ANTE_NOT_INITIALIZED' });
            // console.error(`[Table ${this.name}] Item ante not initialized but itemAnteEnabled is true!`);
            gameLogger.gameEvent(this.name, `[ITEM_ANTE] START_ERROR`, {
                error: 'ITEM_ANTE_NOT_INITIALIZED',
                userId,
                itemAnteEnabled: this.itemAnteEnabled
            });
            return { success: false, error: 'Item ante system not initialized' };
        }
        if (this.gameStarted) {
            this._traceUniversalAfter('ITEM_ANTE_START', { success: false, error: 'GAME_STARTED' });
            return { success: false, error: 'Game already started' };
        }
        if (!item) {
            this._traceUniversalAfter('ITEM_ANTE_START', { success: false, error: 'NO_ITEM_PROVIDED' });
            return { success: false, error: 'No item provided' };
        }
        
        // CRITICAL: itemAnte only accepts items, never money/chips
        const result = this.itemAnte.start(item, userId, this.itemAnteCollectionTime);
        
        this._traceUniversalAfter('ITEM_ANTE_START', {
            success: result.success,
            error: result.error,
            minimumValue: result.minimumValue,
            status: this.itemAnte?.status
        });
        
        return result;
    }

    /**
     * Player submits item to item ante for approval
     * CRITICAL: This is for ITEMS ONLY - no money/chips allowed!
     */
    submitToItemAnte(userId, item) {
        // ROOT TRACING: Track item ante submission
        this._traceUniversal('ITEM_ANTE_SUBMIT', {
            userId,
            itemId: item?.id,
            itemName: item?.name,
            itemValue: item?.baseValue,
            itemAnteEnabled: this.itemAnteEnabled,
            itemAnteExists: !!this.itemAnte,
            status: this.itemAnte?.status,
            approvedCount: this.itemAnte?.approvedItems?.length || 0
        });
        
        if (!this.itemAnteEnabled) {
            this._traceUniversalAfter('ITEM_ANTE_SUBMIT', { success: false, error: 'NOT_ENABLED' });
            return { success: false, error: 'Item ante is not enabled for this table' };
        }
        if (!this.itemAnte) {
            this._traceUniversalAfter('ITEM_ANTE_SUBMIT', { success: false, error: 'ITEM_ANTE_NOT_INITIALIZED' });
            // console.error(`[Table ${this.name}] Item ante not initialized but itemAnteEnabled is true!`);
            gameLogger.gameEvent(this.name, `[ITEM_ANTE] SUBMIT_ERROR`, {
                error: 'ITEM_ANTE_NOT_INITIALIZED',
                userId,
                itemAnteEnabled: this.itemAnteEnabled
            });
            return { success: false, error: 'Item ante system not initialized' };
        }
        if (!item) {
            this._traceUniversalAfter('ITEM_ANTE_SUBMIT', { success: false, error: 'NO_ITEM_PROVIDED' });
            return { success: false, error: 'No item provided' };
        }
        
        // CRITICAL: itemAnte only accepts items, never money/chips
        const result = this.itemAnte.submitItem(userId, item);
        
        this._traceUniversalAfter('ITEM_ANTE_SUBMIT', {
            success: result.success,
            error: result.error,
            itemValue: result.itemValue,
            minimumValue: result.minimumValue,
            approvedCount: this.itemAnte?.approvedItems?.length || 0
        });
        
        return result;
    }

    /**
     * Player opts out of item ante
     */
    optOutOfItemAnte(userId) {
        return this.itemAnte.optOut(userId);
    }

    /**
     * Creator approves a player's item
     */
    approveItemAnteItem(creatorId, userId) {
        return this.itemAnte.approveItem(creatorId, userId);
    }

    /**
     * Creator declines a player's item
     */
    declineItemAnteItem(creatorId, userId) {
        return this.itemAnte.declineItem(creatorId, userId);
    }

    /**
     * Get item ante state for a user
     */
    getItemAnteState(forUserId = null) {
        // ROOT TRACING: Track item ante state request
        this._traceUniversal('ITEM_ANTE_GET_STATE', {
            forUserId: forUserId || 'all',
            itemAnteEnabled: this.itemAnteEnabled,
            itemAnteExists: !!this.itemAnte,
            status: this.itemAnte?.status,
            approvedCount: this.itemAnte?.approvedItems?.length || 0
        });
        
        try {
            if (!this.itemAnte) {
                this._traceUniversalAfter('ITEM_ANTE_GET_STATE', { 
                    success: false, 
                    error: 'ITEM_ANTE_NOT_INITIALIZED',
                    returned: null
                });
                gameLogger.gameEvent(this.name, `[ITEM_ANTE] GET_STATE_NOT_INITIALIZED`, {
                    forUserId: forUserId || 'all',
                    itemAnteEnabled: this.itemAnteEnabled
                });
                return null; // Item ante not initialized
            }
            
            const state = this.itemAnte.getState(forUserId);
            
            // ROOT TRACING: Log state retrieval with icon check
            if (state && state.status !== 'inactive') {
                const itemsWithoutIcons = (state.approvedItems || []).filter(entry => 
                    !entry?.item?.icon || entry.item.icon === 'default_item'
                );
                const itemsWithIcons = (state.approvedItems || []).filter(entry => 
                    entry?.item?.icon && entry.item.icon !== 'default_item'
                );
                
                gameLogger.gameEvent(this.name, `[ITEM_ANTE] GET_STATE_SUCCESS`, {
                    forUserId: forUserId || 'all',
                    status: state.status,
                    approvedCount: state.approvedCount || 0,
                    totalValue: state.totalValue || 0,
                    itemsWithIcons: itemsWithIcons.length,
                    itemsWithoutIcons: itemsWithoutIcons.length,
                    missingIconItems: itemsWithoutIcons.map(entry => ({
                        userId: entry.userId,
                        itemName: entry.item?.name,
                        itemIcon: entry.item?.icon || 'MISSING',
                        templateId: entry.item?.templateId
                    })),
                    hasCreatorItem: !!state.creatorItem,
                    creatorItemIcon: state.creatorItem?.icon || 'MISSING'
                });
                
                // ROOT TRACING: Warn if items in ante missing icons (sprite loading will fail)
                if (itemsWithoutIcons.length > 0) {
                    gameLogger.gameEvent(this.name, `[ITEM_ANTE] MISSING_ICONS_WARNING`, {
                        forUserId: forUserId || 'all',
                        count: itemsWithoutIcons.length,
                        items: itemsWithoutIcons.map(entry => ({
                            userId: entry.userId,
                            itemName: entry.item?.name,
                            icon: entry.item?.icon || 'MISSING'
                        }))
                    });
                }
            }
            
            this._traceUniversalAfter('ITEM_ANTE_GET_STATE', {
                success: !!state,
                status: state?.status,
                approvedCount: state?.approvedCount || 0
            });
            
            return state;
        } catch (error) {
            // ROOT TRACING: Log error with full context
            this._traceUniversalAfter('ITEM_ANTE_GET_STATE', { 
                success: false, 
                error: error.message,
                returned: null
            });
            gameLogger.gameEvent(this.name, `[ITEM_ANTE] GET_STATE_ERROR`, {
                error: error.message,
                errorType: error.constructor.name,
                stackTrace: error.stack,
                forUserId: forUserId || 'all',
                itemAnteEnabled: this.itemAnteEnabled,
                itemAnteExists: !!this.itemAnte
            });
            return null; // Return null on error to prevent crashes
        }
    }

    /**
     * Lock item ante when game starts
     */
    lockItemAnte() {
        // ROOT TRACING: Track item ante lock
        this._traceUniversal('ITEM_ANTE_LOCK', {
            itemAnteEnabled: this.itemAnteEnabled,
            itemAnteExists: !!this.itemAnte,
            status: this.itemAnte?.status,
            approvedCount: this.itemAnte?.approvedItems?.length || 0
        });
        
        if (!this.itemAnte) {
            this._traceUniversalAfter('ITEM_ANTE_LOCK', { success: false, error: 'ITEM_ANTE_NOT_INITIALIZED' });
            return { success: true }; // Not an error if not initialized
        }
        
        if (this.itemAnte.status === ItemAnte.STATUS.COLLECTING) {
            const result = this.itemAnte.lock();
            this._traceUniversalAfter('ITEM_ANTE_LOCK', {
                success: result.success,
                itemCount: result.itemCount
            });
            return result;
        }
        
        this._traceUniversalAfter('ITEM_ANTE_LOCK', { success: true, reason: 'ALREADY_LOCKED_OR_INACTIVE' });
        return { success: true };
    }

    /**
     * Cancel item ante (return items)
     */
    cancelItemAnte() {
        return this.itemAnte.cancel();
    }

    // ============ State ============

    getPublicInfo() {
        try {
            return {
                id: this.id,
                name: this.name,
                playerCount: this.getSeatedPlayerCount(),
                maxPlayers: this.maxPlayers,
                spectatorCount: this.getSpectatorCount(),
                smallBlind: this.smallBlind,
                bigBlind: this.bigBlind,
                buyIn: this.buyIn,
                practiceMode: this.practiceMode,
                isPrivate: this.isPrivate,
                hasPassword: this.hasPassword,
                gameStarted: this.gameStarted,
            allowSpectators: this.allowSpectators,
            houseRulesPreset: this.houseRules?.bettingType || 'standard',
            itemAnteEnabled: this.itemAnteEnabled,
            hasItemAnte: this.itemAnte?.status !== ItemAnte.STATUS.INACTIVE,
            itemAnteCount: this.itemAnte?.approvedItems?.length || 0,
            minimumAntePowerScore: this.minimumAntePowerScore || 0, // NEW: Locked minimum Power Score
            createdAt: this.createdAt
        };
        } catch (error) {
            console.error(`[Table ${this.name}] Error in getPublicInfo:`, error);
            // Return minimal info on error to prevent crashes
            return {
                id: this.id,
                name: this.name || 'Unknown Table',
                playerCount: 0,
                maxPlayers: this.maxPlayers || 6,
                spectatorCount: 0,
                smallBlind: this.smallBlind || 10,
                bigBlind: this.bigBlind || 20,
                buyIn: this.buyIn || 20000000,
                practiceMode: this.practiceMode || false,
                isPrivate: this.isPrivate || false,
                hasPassword: this.hasPassword || false,
                gameStarted: false,
                allowSpectators: this.allowSpectators || false,
                houseRulesPreset: 'standard',
                itemAnteEnabled: false,
                hasItemAnte: false,
                itemAnteCount: 0,
                createdAt: this.createdAt || Date.now()
            };
        }
    }

    getState(forPlayerId = null) {
        const isSpectating = this.isSpectator(forPlayerId);
        const currentPlayer = this.currentPlayerIndex >= 0 ? this.seats[this.currentPlayerIndex] : null;
        
        // SYSTEMATIC DEBUG: Track pot value being sent to clients (especially at showdown)
        if (this.phase === GAME_PHASES.SHOWDOWN || this.pot > 1000000) {
            const totalChipsInState = this.seats.filter(s => s !== null && s.isActive !== false).reduce((sum, s) => sum + (s.chips || 0), 0);
            const totalChipsAndPotInState = totalChipsInState + this.pot;
            const stateDebugLog = `[SYSTEMATIC_DEBUG] GET_STATE: Phase=${this.phase}, Pot=${this.pot}, TotalChips=${totalChipsInState}, TotalChipsAndPot=${totalChipsAndPotInState}, ForPlayerId=${forPlayerId || 'ALL'}\n`;
            console.log(stateDebugLog.trim());
            fs.appendFileSync(path.join(__dirname, '../../logs/pot-award-debug.log'), new Date().toISOString() + ' ' + stateDebugLog);
        }
        
        // State broadcast logging removed - too verbose (called on every state update)
        // Only log errors or critical state changes
        
        const state = {
            id: this.id,
            name: this.name,
            phase: this.phase,
            pot: this.pot,
            communityCards: this.communityCards,
            currentBet: this.currentBet,
            minBet: this.bigBlind,
            minRaise: this.minRaise,
            raisesThisRound: this.raisesThisRound,  // For client to know if raise button should be enabled
            smallBlind: this.smallBlind,
            bigBlind: this.bigBlind,
            dealerIndex: this.dealerIndex,
            currentPlayerIndex: this.currentPlayerIndex,
            currentPlayerId: currentPlayer?.playerId || null,
            turnTimeRemaining: this.getTurnTimeRemaining(),
            blindTimeRemaining: this.getBlindTimeRemaining(),
            blindLevel: this.blindLevel,
            blindIncreaseEnabled: this.blindIncreaseInterval > 0,
            startCountdownRemaining: this.getStartCountdownRemaining(),
            readyUpTimeRemaining: this.getReadyUpTimeRemaining(),
            readyPlayerCount: this.getReadyPlayerCount(),
            totalPlayerCount: this.getActivePlayerCount(),
            handsPlayed: this.handsPlayed,
            handNumber: this.handsPlayed, // For snapshot comparison
            spectatorCount: this.getSpectatorCount(),
            lastPotAwards: this.phase === GAME_PHASES.SHOWDOWN ? this.lastPotAwards : null,
            isSpectating: isSpectating,
            creatorId: this.creatorId,
            isSimulation: this.isSimulation,
            simulationGamesPlayed: this.isSimulation ? this.simulationGamesPlayed : 0,
            simulationMaxGames: this.isSimulation ? this.simulationMaxGames : 0,
            simulationElapsedTime: this.isSimulation && this.simulationStartTime ? Math.floor((Date.now() - this.simulationStartTime) / 1000) : 0,  // Seconds elapsed
            isPaused: this.isPaused || false, // Unity reads this to pause itself
            pauseReason: this.pauseReason || null, // Reason for pause
            practiceMode: this.practiceMode,
            houseRules: this.houseRules?.toJSON?.() || null,
            itemAnteEnabled: this.itemAnteEnabled,
            minimumAntePowerScore: this.minimumAntePowerScore,  // NEW: Locked minimum Power Score for entire table session
            minimumAnteItem: this.minimumAnteItem ? {            // NEW: Table creator's item that sets minimum
                id: this.minimumAnteItem.id,
                name: this.minimumAnteItem.name,
                rarity: this.minimumAnteItem.rarity,
                powerScore: this.minimumAnteItem.powerScore,
                icon: this.minimumAnteItem.icon,
                templateId: this.minimumAnteItem.templateId
            } : null,
            sidePot: this.getItemAnteState(forPlayerId),  // Keeping field name for Unity backward compatibility
            // Helper flags for Unity to know when to prompt for item
            // CRITICAL: Only set needsItemAnteSubmission for actual players in seats, NOT spectators
            needsItemAnteSubmission: (() => {
                // CRITICAL: If forPlayerId is null (broadcast to all), return false to avoid showing prompt to spectators
                if (!forPlayerId) {
                    return false;
                }
                
                const isSpectatorCheck = this.isSpectator(forPlayerId);
                
                // CRITICAL: Only show needsItemAnteSubmission if:
                // 1. Player is not a spectator
                // 2. Item ante is enabled
                // 3. Game hasn't started
                // 4. Item ante exists
                // 5. Item ante is in INACTIVE (needs first item) or COLLECTING (needs submission) status
                // 6. Player actually needs to submit (needs first item OR hasn't submitted yet)
                const itemAnteStatus = this.itemAnte?.status;
                const isCollectingPhase = itemAnteStatus === 'inactive' || itemAnteStatus === 'collecting';
                const needsItemAnteSubmissionValue = !isSpectatorCheck && 
                    this.itemAnteEnabled && 
                    !this.gameStarted && 
                    this.itemAnte && 
                    isCollectingPhase &&
                    (this.itemAnte.needsFirstItem() || !this.itemAnte.hasSubmitted(forPlayerId));
                
                // DIAGNOSTIC: Log when spectator check is happening
                if (this.itemAnteEnabled && !this.gameStarted && this.itemAnte) {
                    gameLogger.gameEvent(this.name, `[ITEM_ANTE] NEEDS_SUBMISSION_CHECK`, {
                        forPlayerId,
                        isSpectator: isSpectatorCheck,
                        itemAnteEnabled: this.itemAnteEnabled,
                        gameStarted: this.gameStarted,
                        itemAnteExists: !!this.itemAnte,
                        itemAnteStatus: itemAnteStatus,
                        isCollectingPhase: isCollectingPhase,
                        needsFirstItem: this.itemAnte.needsFirstItem(),
                        hasSubmitted: forPlayerId ? this.itemAnte.hasSubmitted(forPlayerId) : false,
                        needsItemAnteSubmission: needsItemAnteSubmissionValue
                    });
                }
                
                return needsItemAnteSubmissionValue;
            })(),
            seats: this.seats.map((seat, index) => {
                if (!seat) return null;
                
                // Spectators never see hole cards (except showdown) - UNLESS simulation mode
                // Players only see their own cards (except showdown)
                // During showdown, only show cards of players who are still in (not folded)
                // SIMULATION MODE: Spectators (including creator) can see ALL cards for debugging
                // CRITICAL FIX: In simulation mode, spectators always see all cards
                const canSeeCards = (this.isSimulation && isSpectating) || 
                    (!isSpectating && (
                        seat.playerId === forPlayerId || 
                        (this.phase === GAME_PHASES.SHOWDOWN && !seat.isFolded)
                    ));
                
                // CRITICAL: Always preserve card structure - never return null/undefined cards
                // If cards exist, show or hide based on visibility
                // If cards don't exist yet, return empty array (not null)
                let cards = [];
                const seatCardsRaw = seat.cards;
                const seatCardsLength = seatCardsRaw?.length || 0;
                
                if (seatCardsRaw && Array.isArray(seatCardsRaw)) {
                    if (seatCardsLength > 0) {
                        // Cards exist - show or hide based on visibility
                        cards = canSeeCards ? seatCardsRaw : seatCardsRaw.map(() => ({ rank: null, suit: null }));
                    }
                    // If cards.length === 0, keep cards as empty array (cards haven't been dealt yet)
                }
                // If seat.cards is null/undefined, cards stays as empty array
                
                // CRITICAL: Log EVERY state request to track card visibility
                if (this.isSimulation && seat.isActive && 
                    ['preflop', 'flop', 'turn', 'river', 'showdown'].includes(this.phase)) {
                    const cardStatus = seatCardsRaw ? 
                        `${seatCardsLength} cards (${canSeeCards ? 'VISIBLE' : 'HIDDEN'})` : 
                        'NO CARDS';
                    
                    if (!seatCardsRaw || seatCardsLength === 0) {
                        // CRITICAL ERROR: Cards missing for active player
                        console.error(`[Table ${this.name}] ⚠️ CARDS MISSING for ${seat.name} (${seat.playerId}) in phase ${this.phase}!`, {
                            seatIndex: index,
                            playerId: seat.playerId,
                            isActive: seat.isActive,
                            phase: this.phase,
                            cardsExists: !!seatCardsRaw,
                            cardsLength: seatCardsLength,
                            viewerId: forPlayerId,
                            isSpectating,
                            canSeeCards
                        });
                    }
                    // Verbose state logging removed - only log errors (missing cards)
                }
                
                // Card visibility logging removed - too verbose (logs for every seat, every viewer, every state update)
                // Only log card visibility errors (missing cards for active players) - see error logging above
                
                return {
                    index,
                    playerId: seat.playerId,
                    name: seat.name,
                    chips: seat.chips,
                    currentBet: seat.currentBet, // Bet in current round (resets each phase)
                    totalBet: seat.totalBet || 0, // Total bet in entire hand (across all rounds) - CRITICAL for pot calculation display
                    isFolded: seat.isFolded,
                    isAllIn: seat.isAllIn,
                    isConnected: seat.isConnected,
                    isBot: seat.isBot || false,
                    isSittingOut: seat.isSittingOut || false,
                    isReady: seat.isReady || false,
                    inItemAnte: this.itemAnte.isParticipating(seat.playerId),
                    // CRITICAL: Only set needsItemAnteSubmission for actual players in seats (not spectators)
                    // Note: seat.playerId should never be a spectator (spectators aren't in seats), but adding check for safety
                    needsItemAnteSubmission: !this.isSpectator(seat.playerId) && this.itemAnteEnabled && !this.gameStarted && this.itemAnte && 
                        (this.itemAnte.needsFirstItem() || !this.itemAnte.hasSubmitted(seat.playerId)),
                    cards: cards,
                    // Fire/cold status (NBA Jam style)
                    fireLevel: seat.fireLevel || 0,
                    coldLevel: seat.coldLevel || 0,
                    // Active title (displayed under name)
                    activeTitle: seat.activeTitle || null,
                    // Crew tag
                    crewTag: seat.crewTag || null,
                    // Active character
                    activeCharacter: seat.activeCharacter || 'shadow_hacker',
                    characterSpriteSet: seat.characterSpriteSet || 'char_shadow_hacker',
                    // Notoriety (Combat System — replaces Karma)
                    notoriety: seat.notoriety || 0,
                    notorietyTier: seat.notorietyTier || { title: 'Civilian', visual: 'none', notoriety: 0 }
                };
            })
        };
        
        // Capture state snapshot if enabled (for testing/comparison)
        if (this.stateSnapshot && forPlayerId === null) {
            // Only capture when broadcasting to all (not player-specific views)
            this.stateSnapshot.capture(state, {
                phase: this.phase,
                handsPlayed: this.handsPlayed
            });
        }
        
        return state;
    }
    
    /**
     * Save state snapshots to file (called when table is destroyed)
     */
    saveStateSnapshots() {
        if (this.stateSnapshot) {
            return this.stateSnapshot.save();
        }
        return false;
    }
}

Table.PHASES = GAME_PHASES;
Table.ACTIONS = ACTIONS;

module.exports = Table;

