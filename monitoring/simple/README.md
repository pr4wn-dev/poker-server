# Simple Monitoring Tools

**Goal**: Help AI solve problems faster by preventing repeated failed attempts.

## The Problem

When debugging poker game issues (money vanishing, pot not cleared, validation failures, etc.), the AI would:
- Try the same fixes over and over
- Not remember what failed before
- Waste time on approaches that don't work

## The Solution

Three simple tools:

### 1. `fix-tracker.js` - Track What Was Tried

Records: issue → fix attempt → success/failure

```bash
# Record a fix attempt
node simple/fix-tracker.js record "pot not cleared" "clear pot at hand start" false

# Check what was tried before
node simple/fix-tracker.js check "pot not cleared"

# List all issues
node simple/fix-tracker.js list
```

### 2. `error-summary.js` - See Recent Errors

Shows recent errors from game.log, simulation.log, socketbot.log

```bash
# Show last 20 errors
node simple/error-summary.js

# Show last 50 errors
node simple/error-summary.js --last 50
```

### 3. `check-before-fix.js` - Warn Before Repeating Failures

Checks if you're about to try something that failed before

```bash
node simple/check-before-fix.js "pot not cleared" "clear pot at hand start"
```

## Workflow

1. **See what's broken**: `node simple/error-summary.js`
2. **Before fixing**: `node simple/check-before-fix.js "issue" "proposed fix"`
3. **After fixing**: `node simple/fix-tracker.js record "issue" "what you tried" true/false`

## Data Storage

All data stored in `simple/fix-history.json` - one simple JSON file.

No MySQL, no 39 components, no learning engines - just simple tracking.

## Common Issues

Based on logs, common issues are:
- `POT_NOT_CLEARED` - Pot not cleared at hand start
- `MONEY_LOST` - Chips vanishing
- `POT_MISMATCH` - Pot < sum of bets
- `ACTION_REJECTED` - Not your turn errors
- `VALIDATION_FAILURE` - Chip accounting failures
