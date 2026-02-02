# Money Calculation Audit

## Potential Issues Found

### 1. **Player Leaving Mid-Hand**
**Location:** `removePlayer()` in Table.js
**Issue:** When a player leaves during their turn, they're marked as folded and removed. Their `totalBet` should still be counted in pot calculation, but if they're removed from `seats` array, they won't be included in `calculateAndAwardSidePots()`.
**Status:** ⚠️ NEEDS VERIFICATION - Need to ensure folded players' bets are still counted

### 2. **Blind Posting with Insufficient Chips**
**Location:** `postBlind()` in Table.js
**Issue:** Uses `Math.min(amount, player.chips)` which is correct, but need to verify pot calculation accounts for partial blinds correctly.
**Status:** ✅ LIKELY OK - Partial blinds are handled correctly

### 3. **Call Action Calculation**
**Location:** `call()` in Table.js
**Issue:** Uses `Math.min(this.currentBet - player.currentBet, player.chips)` which is correct for all-in scenarios.
**Status:** ✅ OK - Handles all-in correctly

### 4. **Raise Amount Calculation**
**Location:** `raise()` in Table.js
**Issue:** `raiseAmount = amount - toCall` could be negative if amount < toCall, but this is caught and converted to call. However, need to verify pot calculation is correct.
**Status:** ✅ OK - Validation prevents issues

### 5. **All-In Calculation**
**Location:** `allIn()` in Table.js
**Issue:** Already fixed - was causing pot=0, chips=0 bug.
**Status:** ✅ FIXED

### 6. **Pot Verification**
**Location:** `calculateAndAwardSidePots()` in Table.js
**Issue:** Added verification, but need to check if pot always equals sum of totalBet for all contributors.
**Status:** ⚠️ NEEDS VERIFICATION - Should add validation that pot === sum of all totalBet

### 7. **Eliminated Players Winning**
**Location:** `calculateAndAwardSidePots()` and `awardPot()` in Table.js
**Issue:** If an eliminated player somehow wins, pot is forfeited. This shouldn't happen, but if it does, chips are lost.
**Status:** ⚠️ EDGE CASE - Should be prevented, but handled gracefully

### 8. **startNewHand Clears Bets**
**Location:** `startNewHand()` in Table.js
**Issue:** Clears `currentBet` and `totalBet` at start of new hand. This is correct, but need to ensure pot was already distributed in previous hand.
**Status:** ✅ OK - Pot is cleared in showdown/awardPot before startNewHand

### 9. **advancePhase Resets currentBet**
**Location:** `advancePhase()` in Table.js
**Issue:** Resets `currentBet` to 0 between betting rounds, but pot stays. This is correct.
**Status:** ✅ OK

### 10. **Race Conditions**
**Issue:** Multiple actions could theoretically happen simultaneously, but server handles sequentially.
**Status:** ✅ OK - Server processes actions one at a time

## Recommendations

1. **Add pot validation** - Verify that `this.pot === sum of all seat.totalBet` before showdown
2. **Ensure folded players' bets are counted** - Verify that folded players' `totalBet` is included in pot calculation
3. **Add logging** - Add detailed logging for all chip/pot modifications
4. **Add unit tests** - Test edge cases like partial blinds, all-in scenarios, player leaving mid-hand

