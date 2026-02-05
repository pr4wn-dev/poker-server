# Comprehensive Game Issues Report
**Generated:** 2026-02-05

## Executive Summary

This report documents all potential failure points, edge cases, and known issues in the poker game system. It also addresses the specific issue with the item side pot not displaying in the Unity client.

---

## 🔴 CRITICAL: Item Side Pot Not Displaying

### Issue Description
The item side pot (items gambled before game start) is not showing in the Unity client UI, even though the server is sending the data.

### Root Cause Analysis

**Server Side (✅ WORKING):**
- `Table.getState()` includes `sidePot: this.getSidePotState(forPlayerId)` at line 8617
- `getSidePotState()` calls `this.itemSidePot.getState(forUserId)` which returns full state
- Side pot state includes:
  - `status`: 'inactive' | 'collecting' | 'locked' | 'awarded'
  - `creatorItem`: Item object with name, rarity, icon, etc.
  - `approvedItems`: Array of approved items
  - `approvedCount`: Number of approved items
  - `totalValue`: Total base value of all items
  - `collectionEndTime`: When collection phase ends
  - `pendingSubmissions`: (for creator only)
  - `mySubmission`: (for non-creator players)

**Socket Events (✅ WORKING):**
- `side_pot_started` - Emitted when creator starts side pot
- `side_pot_submission` - Emitted to creator when player submits
- `side_pot_item_approved` - Emitted to all when item approved
- `your_side_pot_approved` - Emitted to player whose item was approved
- `table_state` - Includes `sidePot` field in every state update

**Potential Issues:**

1. **Unity Client Not Reading `sidePot` Field**
   - Check if `NetworkModels.TableState` has `sidePot` field
   - Check if Unity deserializes `sidePot` from JSON
   - Verify field name matches exactly (case-sensitive)

2. **Side Pot Status is INACTIVE**
   - If `itemSidePot.status === 'inactive'`, `getSidePotState()` returns `null`
   - Unity might be checking `if (sidePot == null)` and hiding UI
   - **Solution:** Check if side pot is started before expecting it to show

3. **UI Not Updated on State Changes**
   - Unity might only check side pot on initial table join
   - Side pot might be created AFTER player joins
   - **Solution:** Listen to `table_state` updates and refresh side pot UI

4. **Field Name Mismatch**
   - Server sends: `sidePot` (camelCase)
   - Unity might expect: `SidePot` or `side_pot`
   - **Solution:** Verify JSON deserialization in Unity

### Debugging Steps

1. **Check Server Logs:**
   ```javascript
   // Add logging in Table.getState()
   console.log('[SIDE_POT_DEBUG]', {
       hasSidePot: !!this.itemSidePot,
       status: this.itemSidePot?.status,
       state: this.getSidePotState(forPlayerId)
   });
   ```

2. **Check Unity Console:**
   - Log the received `table_state` JSON
   - Check if `sidePot` field exists
   - Check if `sidePot` is null or has data

3. **Verify Side Pot is Started:**
   - Creator must call `start_side_pot` socket event
   - Side pot must be in 'collecting' or 'locked' status
   - If status is 'inactive', side pot won't show

### Recommended Fixes

1. **Unity Client:**
   - Ensure `TableState` model includes `SidePotState sidePot` field
   - Add null check: `if (tableState.sidePot != null && tableState.sidePot.status != "inactive")`
   - Update UI whenever `table_state` event is received
   - Display side pot items in a visible UI panel

2. **Server:**
   - Ensure side pot state is always included (even if inactive)
   - Add logging when side pot state is requested
   - Emit explicit `side_pot_started` event to all players

---

## 🚨 CRITICAL ISSUES (High Priority)

### 1. Chip Loss During Gameplay
**Status:** Mostly Fixed (monitoring)
**Severity:** CRITICAL
**Description:** Chips disappearing from the system during betting, pot distribution, or player elimination.

**Known Causes:**
- Pot not cleared at hand start (FIXED)
- Pot cleared before awardPot finishes (FIXED)
- Player winning pot at level they didn't contribute to (FIXED)
- totalStartingChips not updated when player joins (FIXED)

**Remaining Risks:**
- Race conditions during rapid actions
- Exception handling clearing pot incorrectly
- Edge cases in all-in scenarios with side pots

**Monitoring:**
- Comprehensive tracing system tracks all chip movements
- Validation checks run after every operation
- Fix attempts tracked and logged

### 2. Pot Distribution Errors
**Status:** Fixed with validation
**Severity:** CRITICAL
**Description:** Players winning more chips than they contributed, or winning pots at levels they didn't participate in.

**Fixes Applied:**
- Validation: `player.totalBet >= potLevel` before awarding
- Side pot calculation verified before distribution
- Emergency pot distribution if calculation fails

**Remaining Risks:**
- Complex all-in scenarios with multiple side pots
- Player leaving mid-hand edge cases

### 3. Card Visibility Issues
**Status:** Fixed
**Severity:** HIGH
**Description:** Cards disappearing or not showing correctly.

**Fixes Applied:**
- Cards preserved during hand transitions
- Atomic card replacement
- Proper visibility logic for spectators vs players

**Remaining Risks:**
- Network latency causing card state desync
- Client-side rendering issues

---

## ⚠️ HIGH PRIORITY ISSUES

### 4. Timer Management
**Status:** Fixed
**Severity:** MEDIUM
**Description:** Turn timers not clearing properly, causing multiple timers to run.

**Fixes Applied:**
- Timer cleared before starting new one
- Proper cleanup on action/phase change
- Validation prevents timer on invalid player

### 5. Action Validation
**Status:** Fixed
**Severity:** MEDIUM
**Description:** Players attempting actions when not their turn or game not in progress.

**Fixes Applied:**
- Turn validation before action
- Game state validation
- Proper error messages

**Remaining Risks:**
- Bot AI trying invalid actions
- Network race conditions

### 6. Player State Management
**Status:** Mostly Fixed
**Severity:** MEDIUM
**Description:** Players in wrong state (folded but still active, etc.)

**Fixes Applied:**
- State flags reset properly
- Validation on state transitions
- Proper cleanup on player removal

---

## 🔍 MEDIUM PRIORITY ISSUES

### 7. Bot Behavior Issues
**Status:** Partially Fixed
**Severity:** MEDIUM
**Description:** Bots attempting invalid actions, acting out of turn.

**Known Issues:**
- Bots trying to act when game not in progress
- Bots attempting invalid betting actions
- Bots not respecting turn order

**Mitigation:**
- Server validates all actions
- Auto-fold on timeout for bots
- Proper error handling

### 8. Network/Connection Issues
**Status:** Handled
**Severity:** MEDIUM
**Description:** Player disconnections, reconnections, network latency.

**Handling:**
- Reconnection support
- Auto-fold on disconnect
- State synchronization on reconnect

**Remaining Risks:**
- State desync after long disconnection
- Rapid connect/disconnect causing issues

### 9. Simulation Mode Issues
**Status:** Working
**Severity:** LOW
**Description:** Issues specific to simulation mode.

**Known Issues:**
- High-speed simulations may cause timing issues
- Bot AI may not be optimal for simulations

**Mitigation:**
- Pause on errors
- Comprehensive logging
- State snapshots for debugging

---

## 🐛 EDGE CASES & POTENTIAL FAILURES

### 10. All-In Scenarios
**Risk Level:** MEDIUM
**Description:** Complex all-in situations with multiple players and side pots.

**Potential Issues:**
- Side pot calculation errors
- Player winning more than contributed
- Pot distribution order issues

**Mitigation:**
- Comprehensive side pot calculation
- Validation before distribution
- Emergency fallback distribution

### 11. Player Elimination
**Risk Level:** MEDIUM
**Description:** Player eliminated mid-hand or between hands.

**Potential Issues:**
- Chips lost if not properly distributed
- Pot calculation errors
- State cleanup issues

**Mitigation:**
- Proper chip tracking
- Validation on elimination
- Emergency pot distribution

### 12. Rapid Actions
**Risk Level:** LOW
**Description:** Multiple actions in quick succession.

**Potential Issues:**
- Race conditions
- State desync
- Timer conflicts

**Mitigation:**
- Sequential action processing
- State validation
- Proper locking

### 13. Table Destruction
**Risk Level:** LOW
**Description:** Table destroyed while game in progress.

**Potential Issues:**
- Items not returned from side pot
- Chips lost
- State not saved

**Mitigation:**
- Proper cleanup on destruction
- Item return logic
- State snapshot saving

### 14. Database Failures
**Risk Level:** LOW
**Description:** Database operations fail during gameplay.

**Potential Issues:**
- Item awards not saved
- User data not updated
- Inventory desync

**Mitigation:**
- Error handling
- Retry logic
- Transaction support

### 15. Memory Leaks
**Risk Level:** LOW
**Description:** Memory not released properly.

**Potential Issues:**
- Timers not cleared
- Event listeners not removed
- Large state objects retained

**Mitigation:**
- Proper cleanup
- Timer management
- State size limits

---

## 📊 SYSTEM ARCHITECTURE RISKS

### 16. Scalability Issues
**Risk Level:** MEDIUM
**Description:** System performance under load.

**Potential Issues:**
- Too many concurrent tables
- Large state objects
- Database query performance

**Mitigation:**
- State optimization
- Database indexing
- Connection pooling

### 17. Security Vulnerabilities
**Risk Level:** HIGH
**Description:** Potential security issues.

**Potential Issues:**
- Authentication bypass
- Cheating/hacking
- Data manipulation

**Mitigation:**
- Server-side validation
- Authentication checks
- Input sanitization

### 18. Data Consistency
**Risk Level:** MEDIUM
**Description:** Data inconsistencies between systems.

**Potential Issues:**
- Inventory desync
- Chip balance errors
- Item duplication/loss

**Mitigation:**
- Validation checks
- Transaction support
- Audit logging

---

## 🔧 RECOMMENDED IMPROVEMENTS

### 19. Enhanced Logging
- Add more detailed error logging
- Track all state changes
- Log all chip movements

### 20. Unit Tests
- Test all edge cases
- Test all betting scenarios
- Test all pot distribution scenarios

### 21. Integration Tests
- Test full game flow
- Test multiple players
- Test network issues

### 22. Monitoring & Alerts
- Alert on chip loss
- Alert on validation failures
- Alert on high error rates

### 23. Documentation
- Document all edge cases
- Document all failure modes
- Document recovery procedures

---

## 📝 SPECIFIC ITEM SIDE POT DEBUGGING CHECKLIST

### Server-Side Checks:
- [ ] Verify `itemSidePot` is initialized in Table constructor
- [ ] Check `getSidePotState()` returns non-null when side pot is active
- [ ] Verify `table_state` event includes `sidePot` field
- [ ] Check side pot status is 'collecting' or 'locked' (not 'inactive')
- [ ] Verify `side_pot_started` event is emitted to all players
- [ ] Check logs for side pot operations

### Unity Client Checks:
- [ ] Verify `TableState` model has `SidePotState sidePot` field
- [ ] Check JSON deserialization includes `sidePot`
- [ ] Verify UI listens to `table_state` updates
- [ ] Check UI shows side pot when `sidePot.status != "inactive"`
- [ ] Verify side pot items are displayed correctly
- [ ] Check creator sees pending submissions
- [ ] Verify non-creators see approved items

### Testing Steps:
1. Create table
2. Start side pot with item (creator)
3. Check Unity receives `side_pot_started` event
4. Check Unity receives `table_state` with `sidePot` field
5. Verify UI displays side pot
6. Submit item (player)
7. Approve item (creator)
8. Verify UI updates

---

## 🎯 PRIORITY ACTION ITEMS

1. **IMMEDIATE:** Fix item side pot display in Unity client
2. **HIGH:** Continue monitoring chip loss (validation working)
3. **HIGH:** Test all edge cases in pot distribution
4. **MEDIUM:** Improve bot AI to prevent invalid actions
5. **MEDIUM:** Add more comprehensive error handling
6. **LOW:** Performance optimization
7. **LOW:** Enhanced logging and monitoring

---

## 📚 RELATED DOCUMENTATION

- `CHANGELOG.md` - Historical issues and fixes
- `MONEY_CALCULATION_AUDIT.md` - Chip tracking audit
- `SIMULATION_ISSUES_SUMMARY.md` - Simulation-specific issues
- `ISSUES_FOUND.md` - Complete list of found issues
- `TESTING.md` - Testing procedures

---

**Report Generated:** 2026-02-05
**Last Updated:** 2026-02-05
