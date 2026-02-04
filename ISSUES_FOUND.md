# Complete List of Issues Found in Simulation Logs

## Summary
Total issues found: **8 distinct categories** with multiple instances each

---

## Issue #1: Pot Not Cleared at Hand Start
**Severity:** HIGH  
**Frequency:** 40+ instances  
**Description:** Pot is not reset to 0 when starting a new hand, causing validation failures and chip accounting errors.

**Example:**
```
[ERROR] [POT] ERROR: Pot not cleared at hand start
```

**Impact:** 
- Pot carries over between hands
- Validation fails because pot + chips != totalStartingChips
- Chips appear to be "missing" when they're actually in the leftover pot

---

## Issue #2: Money Lost (Chip Loss)
**Severity:** CRITICAL  
**Frequency:** Multiple instances with varying amounts  
**Description:** Total chips in system is less than totalStartingChips, indicating chips are being lost.

**Examples:**
- Hand 123: Missing 38,012 chips (totalStartingChips: 294,400, actual: 256,388)
- Hand 121: Missing 35,212 chips (totalStartingChips: 294,400, actual: 259,188)
- Hand 120: Missing 21,076 chips (totalStartingChips: 48,750, actual: 27,674)

**Impact:**
- Chips disappear from the system
- Players lose money they should have
- Game integrity compromised

---

## Issue #3: Pot Mismatch (Chips Lost During Betting)
**Severity:** CRITICAL  
**Frequency:** Multiple instances  
**Description:** Pot is less than sum of all totalBets, indicating chips are lost during betting operations.

**Example:**
```
[POT] ERROR: Pot mismatch before calculation
potBeforeCalculation: 198, sumOfTotalBets: 218, difference: -20
```

**Impact:**
- Chips subtracted from players but not added to pot
- Chips lost during betting operations
- Pot distribution becomes incorrect

---

## Issue #4: Action Rejected - Not Your Turn
**Severity:** MEDIUM  
**Frequency:** 20+ instances  
**Description:** Players trying to act when it's not their turn.

**Example:**
```
[BETTING] Action rejected: Not your turn (seat 2, current 0)
```

**Impact:**
- Bots may be trying to act out of turn
- Could indicate turn management issues
- May cause delays in gameplay

---

## Issue #5: Action Rejected - Game Not in Progress
**Severity:** MEDIUM  
**Frequency:** Multiple instances  
**Description:** Players trying to act when game is in waiting phase.

**Example:**
```
[BETTING] Action rejected: Game not in progress (phase: waiting)
```

**Impact:**
- Bots trying to act between games
- May indicate bot state management issues

---

## Issue #6: Betting Action Failures
**Severity:** MEDIUM  
**Frequency:** Multiple instances  
**Description:** Invalid betting actions attempted.

**Examples:**
- "Cannot bet - current bet is 839. Use raise or call."
- "Cannot check - need to call 200"

**Impact:**
- Bots attempting invalid actions
- May indicate bot AI logic issues
- Could cause gameplay delays

---

## Issue #7: Validation Failures
**Severity:** HIGH  
**Frequency:** 50+ instances  
**Description:** Money validation fails at various points during gameplay.

**Contexts where validation fails:**
- BEFORE_PHASE_ADVANCE
- AFTER_PHASE_ADVANCE
- AFTER_RAISE
- AFTER_BET
- AFTER_AWARD_POT
- AFTER_SIDE_POT_AWARDS

**Impact:**
- Indicates chip accounting is incorrect
- Money is being lost or created
- Game state is inconsistent

---

## Issue #8: Pot Adjustment Workaround Active
**Severity:** MEDIUM (Symptom, not root cause)  
**Frequency:** Multiple instances  
**Description:** Workaround code is adjusting pot when chips are detected as lost.

**Example:**
```
[POT] CRITICAL: Chips lost during betting
[POT] WORKAROUND: Pot adjusted to match sumOfTotalBets
```

**Impact:**
- Masks the root cause of chip loss
- Prevents further loss but doesn't fix the source
- Indicates chips are being lost during betting operations

---

## Root Cause Analysis

### Primary Issues:
1. **Pot not cleared at hand start** - This is causing cascading validation failures
2. **Chips lost during betting** - Pot < sumOfTotalBets indicates chips are subtracted but not added to pot
3. **Cumulative chip loss** - Missing chips accumulate across hands (21K → 35K → 38K)

### Secondary Issues:
4. **Bot action management** - Bots trying to act out of turn or when game not in progress
5. **Betting action validation** - Bots attempting invalid actions

---

## Recommended Fix Priority

1. **CRITICAL:** Fix pot not being cleared at hand start
2. **CRITICAL:** Fix chips lost during betting operations (pot < sumOfTotalBets)
3. **HIGH:** Fix cumulative chip loss (find where chips disappear between hands)
4. **MEDIUM:** Fix bot action management (prevent out-of-turn actions)
5. **MEDIUM:** Fix betting action validation (prevent invalid actions)

---

## Total Issue Count

- **Pot not cleared:** 40+ instances
- **Money lost:** 3+ major instances (with different amounts)
- **Pot mismatch:** 10+ instances
- **Action rejected:** 20+ instances
- **Betting failures:** 5+ instances
- **Validation failures:** 50+ instances
- **Pot adjustment workaround:** 5+ instances

**Total distinct issue categories: 8**
**Total individual error instances: 130+**
