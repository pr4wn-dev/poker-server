# Simulation Issues Found - Feb 4, 2026

## Critical Issues Identified

### 1. **MASSIVE MONEY LOSS** (953,173 chips lost)
**Location**: Hand 51, Game 2
- **Expected**: 1,176,000 chips (3 players × 392,000 buy-in)
- **Actual**: 222,827 chips
- **Missing**: 953,173 chips (81% of money lost!)

**Root Cause**: Chips are being lost throughout gameplay, not just at pot awards. This suggests:
- Chips being deducted but not added to pot
- Chips being added to pot but not deducted from players
- Multiple operations happening without proper tracking

**Next Steps**: 
- Check CHIP TRACK logs for the exact operation where money disappears
- Look for operations that modify chips without going through tracked functions

---

### 2. **POT NOT FULLY AWARDED** (126,000 chips lost)
**Location**: Hand 51, Game 2
- **Pot**: 130,000 chips
- **Awarded**: 4,000 chips (to Tex)
- **Lost**: 126,000 chips

**Error Message**: 
```
[POT] ERROR: Pot exists but all eligible players folded
No non-folded contributors for folded pot
```

**Root Cause**: Side pot calculation logic fails when all players fold. The code tries to find "non-folded contributors" but if everyone folded, there are none, so the pot is lost.

**Fix Needed**: When all players fold, award pot to the last remaining player (the one who didn't fold), or if everyone truly folded, award to the player who contributed most.

---

### 3. **PLAYER_JOIN Validation Fails (False Positive)**
**Location**: Before game start
- **Issue**: Chip tracking validates PLAYER_JOIN operations before `totalStartingChips` is set
- **Impact**: Creates noise in logs, but doesn't cause actual problems
- **Fix**: Only validate chip movements after `totalStartingChips > 0` (game has started)

---

### 4. **totalStartingChips Not Updated When Players Leave Mid-Game**
**Location**: Game 2, after NetPlayer_1 left
- **Issue**: When a player leaves mid-game, `totalStartingChips` is decremented, but this creates validation errors because the chips are still in the system (just not with that player)
- **Impact**: False validation failures
- **Fix**: Don't modify `totalStartingChips` when players leave mid-game - only track it at game start

---

## Priority Fix Order

1. **Fix #2 (Pot Award Bug)** - This is causing immediate money loss
2. **Fix #1 (Massive Money Loss)** - This is the biggest problem, need to trace through CHIP TRACK logs
3. **Fix #4 (totalStartingChips on Leave)** - Clean up false positives
4. **Fix #3 (PLAYER_JOIN validation)** - Clean up false positives

---

## How to Debug

1. **Find where money disappears**:
   ```powershell
   Get-Content logs\game.log | Select-String -Pattern "CHIP TRACK.*FAIL|Money.*LOST|Money.*CREATED" | Select-Object -Last 50
   ```

2. **Check pot award failures**:
   ```powershell
   Get-Content logs\game.log | Select-String -Pattern "Pot not fully awarded|all eligible players folded" | Select-Object -Last 20
   ```

3. **Trace a specific hand**:
   ```powershell
   Get-Content logs\game.log | Select-String -Pattern "handNumber.*51" | Select-Object -First 100
   ```

---

## Next Steps

1. Fix the pot award bug first (easiest, immediate impact)
2. Add more detailed logging around chip movements to catch where money disappears
3. Review all chip modification operations to ensure they're all tracked
4. Test with a fresh simulation after fixes
