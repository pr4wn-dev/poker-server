# Testing Guide

This project uses a comprehensive testing system that combines unit tests, simulation testing, and state comparison.

## Test Framework

### Unit Tests (Jest)

Run unit tests for core game logic:

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run test:coverage # With coverage report
```

**Test Files:**
- `src/__tests__/HandEvaluator.test.js` - Tests for hand evaluation logic

## Simulation vs Real Game Comparison

The simulation system captures structured state snapshots that can be compared to real game states to find bugs and inconsistencies.

### How It Works

1. **State Snapshots**: Both simulation and real games capture state at every state change
2. **Structured Logging**: State is saved as JSON for programmatic comparison
3. **Automatic Comparison**: Compare simulation logs to real game logs to find differences

### Enabling State Snapshots

Set environment variable before starting server:

```bash
# Windows PowerShell
$env:ENABLE_STATE_SNAPSHOTS="true"; npm start

# Linux/Mac
ENABLE_STATE_SNAPSHOTS=true npm start
```

### Comparing States

After running a simulation and a real game with the same table ID:

```bash
npm run compare-states <tableId>
```

Example:
```bash
npm run compare-states table_abc123
```

This will:
1. Load simulation snapshot from `logs/state_snapshots/<tableId>_sim.json`
2. Load real game snapshot from `logs/state_snapshots/<tableId>_real.json`
3. Compare all snapshots and report differences
4. Save comparison report to `logs/comparisons/comparison_<tableId>_<timestamp>.json`

### What Gets Compared

- **Phase** - Game phase (waiting, preflop, flop, etc.)
- **Pot** - Total pot amount (must match exactly)
- **Bets** - Current bet amounts
- **Blinds** - Small/big blind values
- **Community Cards** - Board cards
- **Seats** - Player positions, chips, bets, folded status
- **Turn Order** - Current player index and dealer position

### Comparison Report

The report shows:
- Total differences found
- Severity (high/medium/low)
- Specific field differences
- Phase and hand number where differences occurred

**Example Output:**
```
=== STATE COMPARISON REPORT ===
Table: Test Table (table_abc123)
Simulation Snapshots: 45
Real Game Snapshots: 45
Total Differences Found: 2
  - High Severity: 1
  - Medium Severity: 1

DIFFERENCES:
============

1. Phase: preflop, Hand: 1
   [HIGH] pot: Sim=500, Real=1000 (diff: 500)
   [MEDIUM] currentBet: Sim=100, Real=200
```

## Simulation Testing

The simulation system runs automated games with bots to test:
- Network conditions (latency, disconnects)
- Turn logic and state transitions
- Pot calculations
- Card dealing and visibility
- Multiple game scenarios

### Running Simulations

1. Start server with state snapshots enabled
2. Create a simulation table from Unity client
3. Let simulation run (auto-plays multiple games)
4. Stop simulation
5. Compare with a real game using the same table settings

## Best Practices

1. **Always enable snapshots** when testing new features
2. **Run simulations** before manual testing to catch obvious bugs
3. **Compare states** after fixing bugs to verify the fix
4. **Check comparison reports** for unexpected differences
5. **Add unit tests** for new game logic functions

## Log Files

- `logs/state_snapshots/` - State snapshot JSON files
- `logs/comparisons/` - Comparison reports
- `logs/simulation.log` - Simulation execution log
- `logs/socketbot.log` - Socket bot activity log
- `logs/game.log` - General game event log

