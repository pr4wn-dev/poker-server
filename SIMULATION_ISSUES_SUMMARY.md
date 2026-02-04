# Simulation Issues Found - Feb 4, 2026

## ✅ FIXED Issues

### 1. **RAISE Operation Bug** ✅ FIXED
**Problem**: Subtracted full bet amount from chips but only added additional bet to pot
**Fix**: Only subtract `additionalBet` from chips (previous bet already in pot)
**Commit**: `c3d3a23`

### 2. **Pot Calculation Bug** ✅ FIXED
**Problem**: Used theoretical pot amounts instead of actual pot, creating money
**Fix**: Use actual pot amount, scale awards proportionally if pot < sumOfTotalBets
**Commit**: Multiple commits

### 3. **Pot Not Fully Awarded** ✅ FIXED
**Problem**: Side pot calculation failed when all players at a bet level folded
**Fix**: Award pot to best non-folded contributor when all eligible players fold
**Commit**: Multiple commits

### 4. **Eliminated Player Chip Tracking** ✅ FIXED
**Problem**: Eliminated players' buy-ins weren't subtracted from `totalStartingChips`
**Fix**: Adjust `totalStartingChips` when eliminated players are removed
**Commit**: `50fe510`, `8d7943e`

### 5. **Socket Bot Chip Tracking** ✅ FIXED
**Problem**: Only regular bots had buy-ins subtracted, socket bots didn't
**Fix**: Apply `totalStartingChips` adjustment to ALL eliminated players
**Commit**: `8d7943e`

### 6. **Active Player Validation** ✅ FIXED
**Problem**: Validation counted all players (including eliminated), causing simulation to stop
**Fix**: Only count active players in `_validateMoney` and `_getChipState`
**Commit**: `34d092c`

### 7. **Bot Timeout Issue** ✅ FIXED
**Problem**: Bots timed out after game restarts because they weren't in `activeBots` map
**Fix**: Re-sync bots from seats when not found in `activeBots` map
**Commit**: `c8d09b2`

### 8. **Simulation "Not Enough Players" Error** ✅ FIXED
**Problem**: Eliminated players weren't removed, preventing new bots from being added
**Fix**: Explicitly clear all seats before restart, disconnect socket bots first
**Commit**: `31f9eda`

### 9. **Leave Table for Spectators/Creator** ✅ FIXED
**Problem**: Leave table button didn't work for spectators or table creator
**Fix**: Search all tables if `currentTableId` not set, handle both spectators and creators
**Commit**: `9aab65b`

---

## ⚠️ REMAINING Issues

### 1. **Money Creation During Pot Awards** (NEW)
**Location**: Hand 89, Game 9
- **Expected**: 148,800 chips
- **Actual**: 297,600 chips (pot: 148,800)
- **Created**: 148,800 chips (100% money creation!)

**Symptoms**: 
- `expected: 148800, actual: 297600, missing: -148800`
- Pot is 148,800, but totalChipsInSystem is 297,600
- All players have 0 chips except winner (148,800 chips)

**Possible Root Cause**: 
- Pot might be counted twice (in both `currentTotalChips` and `pot`)
- Or chips are being added to winner without subtracting from pot
- Need to check `awardPot` and `calculateAndAwardSidePots` logic

**Next Steps**:
- Check if pot is being cleared after awards
- Verify winner chips are added correctly
- Check if pot is counted in both places during validation

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
