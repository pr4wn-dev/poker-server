# Simulation vs Real Game Comparison Workflow

This guide explains how to use the state comparison system to ensure real/practice tables work as well as simulations.

## Overview

The comparison system captures detailed state snapshots from both simulation and real games, then programmatically compares them to find:
- **Money calculation differences** (pot, chips, bets)
- **Game flow inconsistencies** (phase transitions, turn order)
- **State synchronization issues** (cards, player status)
- **Logic bugs** that only appear in one environment

## Quick Start

### 1. Enable State Snapshots

**Option A: Environment Variable (Recommended)**
```powershell
# Windows PowerShell
$env:ENABLE_STATE_SNAPSHOTS="true"
npm start

# Or add to .env file:
ENABLE_STATE_SNAPSHOTS=true
```

**Option B: Check Current Status**
```bash
node scripts/run-comparison-test.js
```

### 2. Run a Simulation

1. Start the server with state snapshots enabled
2. In Unity client, create a **SIMULATION** table
3. Let it play at least 5-10 hands
4. Note the table ID from server logs (or Unity console)

### 3. Run a Real/Practice Game

1. With the same server running
2. In Unity client, create a **REAL** or **PRACTICE** table with **IDENTICAL** settings:
   - Same max players
   - Same blinds
   - Same buy-in
   - Same turn time
3. Join with similar number of players (or use bots)
4. Play similar number of hands
5. Note the table ID

### 4. Compare the Snapshots

```bash
# Compare specific tables
npm run compare-states <simTableId> <realTableId>

# Or compare most recent snapshots
npm run compare-states --latest
```

## Detailed Workflow

### Step 1: Prepare Test Environment

```bash
# 1. Ensure state snapshots are enabled
$env:ENABLE_STATE_SNAPSHOTS="true"

# 2. Start server
npm start

# 3. Check snapshot directory exists
ls logs/state_snapshots/
```

### Step 2: Run Simulation

**In Unity Client:**
- Create table with simulation toggle ON
- Use these test settings (or customize):
  - Max Players: 4
  - Small Blind: 50
  - Big Blind: 100
  - Buy-In: 10,000
  - Turn Time: 30s
  - Socket Bot Ratio: 50%

**Let it run:**
- Wait for at least 5-10 hands to complete
- Check server logs for table ID (format: `uuid-uuid-uuid-uuid`)

**Example table ID from logs:**
```
[SimulationManager] Simulation table created | Data: {"tableId":"4ace7c97-b40b-4b72-9e4a-2acf2a630a0d",...}
```

### Step 3: Run Real/Practice Game

**In Unity Client:**
- Create table with simulation toggle OFF
- Use **EXACT SAME** settings as simulation:
  - Max Players: 4
  - Small Blind: 50
  - Big Blind: 100
  - Buy-In: 10,000
  - Turn Time: 30s

**Play the game:**
- Join with 4 players (or use bots)
- Play similar number of hands
- Try to replicate similar betting patterns (if possible)
- Note the table ID from server logs

### Step 4: Compare Results

```bash
# Method 1: Compare specific tables
npm run compare-states 4ace7c97-b40b-4b72-9e4a-2acf2a630a0d abc123-def456-ghi789

# Method 2: Compare most recent (easiest)
npm run compare-states --latest
```

### Step 5: Analyze Differences

The comparison report will show:

**High Severity Issues:**
- Pot mismatches (money calculation errors)
- Phase transition errors
- Missing players or seats
- Card mismatches

**Medium Severity Issues:**
- Bet amount differences
- Turn order differences
- Player status differences

**Low Severity Issues:**
- Timing differences
- Metadata differences

### Step 6: Fix Issues

1. Review the comparison report in `logs/comparisons/`
2. Identify root causes
3. Fix the code
4. Re-run comparison to verify fix

## What Gets Compared

### Money Calculations
- ✅ Pot amount (must match exactly)
- ✅ Current bet amounts
- ✅ Player chip counts
- ✅ Total bets per player

### Game State
- ✅ Phase (waiting, preflop, flop, turn, river, showdown)
- ✅ Hand number
- ✅ Dealer position
- ✅ Current player index

### Cards
- ✅ Community cards (must match)
- ✅ Visible hole cards (showdown only)

### Players
- ✅ Seat positions
- ✅ Folded status
- ✅ All-in status
- ✅ Connection status

## Best Practices

### 1. Use Identical Settings
- Same table configuration for both simulation and real game
- Same number of players
- Same blind structure

### 2. Play Similar Hands
- Try to play similar number of hands
- Similar betting patterns (if possible)
- Don't worry about exact actions - we're comparing state, not actions

### 3. Compare Immediately
- Run comparison right after games complete
- Don't let too much time pass between games

### 4. Focus on High Severity Issues
- Pot mismatches are critical
- Phase transition errors indicate logic bugs
- Missing players indicate state sync issues

### 5. Iterate
- Fix issues found
- Re-run comparison
- Verify fixes work

## Automated Testing

For continuous testing, you can:

1. **Run simulation** → Capture snapshot
2. **Run real game** → Capture snapshot  
3. **Compare automatically** → Report differences
4. **Fix issues** → Repeat

## Troubleshooting

### "No snapshot files found"
- Ensure `ENABLE_STATE_SNAPSHOTS=true` is set
- Check that games actually completed (not just started)
- Verify `logs/state_snapshots/` directory exists

### "Snapshots have different hand counts"
- This is normal if games ended at different times
- Comparison will match by phase and hand number
- Focus on matched snapshots

### "Many differences found"
- Check if settings were truly identical
- Verify both games completed successfully
- Look for patterns in differences (all in one phase? all in one player?)

## Example Output

```
=== STATE COMPARISON REPORT ===
Table: Test Table
Simulation Snapshots: 45
Real Game Snapshots: 43
Total Differences Found: 2
  - High Severity: 1
  - Medium Severity: 1

DIFFERENCES:
============

1. Phase: preflop, Hand: 3
   [HIGH] pot: Sim=500, Real=1000 (diff: 500)
   [MEDIUM] currentBet: Sim=100, Real=200

2. Phase: showdown, Hand: 5
   [HIGH] seats[2].chips: Sim=5000, Real=4500 (diff: 500)
```

This indicates:
- Pot calculation error in hand 3
- Chip award error in hand 5

## Next Steps

After running comparisons:
1. Document any differences found
2. Fix root causes
3. Re-run to verify fixes
4. Add to test suite for regression testing

