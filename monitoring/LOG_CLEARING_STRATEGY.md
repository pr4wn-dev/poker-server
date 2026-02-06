# Log Clearing Strategy Analysis

## Current Implementation

**Location:** `scripts/watch-logs-and-fix.js` → `handleIssueWithLogClearing()`

**What happens:**
1. Issue detected → Pause Unity
2. Fix issue
3. **Clear entire log file** (`fs.writeFileSync(logFile, '', 'utf8')`)
4. Resume Unity

## Problems with Current Approach

### ❌ What We Lose When Clearing Logs

1. **Fix Attempt History**
   - What fixes were tried
   - Why they succeeded/failed
   - Context around the issue
   - **Partial preservation:** `fix-attempts.txt` has stats, but not full context

2. **Root Trace Information**
   - `[ROOT_TRACE]` entries that show state before/after
   - Stack traces
   - Full error context

3. **Pattern Detection History**
   - Which patterns matched
   - When issues occurred
   - Frequency of issues

4. **Historical Context**
   - What happened before the issue
   - Related events
   - Debugging information

5. **Correlation Data**
   - Can't see if issue repeats
   - Can't track issue trends
   - Can't analyze patterns over time

### ✅ What We Preserve

1. **`fix-attempts.txt`** - Fix statistics (attempts, failures, successes)
2. **`pending-issues.json`** - Current pending issues
3. **Log rotation backups** - `game.log.1`, `game.log.2`, etc. (if rotation happened)

## Better Alternatives

### Option 1: Archive Instead of Clear (Recommended)

**Instead of clearing, archive the log:**

```javascript
// Archive current log before clearing
const archiveDir = path.join(__dirname, '../logs/archived');
if (!fs.existsSync(archiveDir)) {
    fs.mkdirSync(archiveDir, { recursive: true });
}

const archiveFile = path.join(archiveDir, `game_${Date.now()}_issue_${issue.type}.log`);
fs.copyFileSync(logFile, archiveFile);

// Then clear current log
fs.writeFileSync(logFile, '', 'utf8');
```

**Benefits:**
- ✅ Preserves full history
- ✅ Can analyze later
- ✅ Keeps logs organized by issue
- ✅ Still keeps current log slim

**Drawbacks:**
- ⚠️ Uses more disk space
- ⚠️ Need cleanup strategy for old archives

### Option 2: Rotate Instead of Clear

**Use existing log rotation system:**

```javascript
// Instead of clearing, rotate the log
const gameLogger = require('../src/utils/GameLogger');
gameLogger.rotateLog(); // This creates game.log.1, game.log.2, etc.
```

**Benefits:**
- ✅ Uses existing system
- ✅ Preserves history in backups
- ✅ Automatic cleanup (keeps 5 backups)
- ✅ No code changes needed

**Drawbacks:**
- ⚠️ Log might still be large after rotation
- ⚠️ Need to read from backup files for history

### Option 3: Smart Clearing (Keep Important Data)

**Clear but preserve critical information:**

```javascript
// Extract and preserve fix attempt logs before clearing
const logContent = fs.readFileSync(logFile, 'utf8');
const fixAttemptLogs = logContent
    .split('\n')
    .filter(line => line.includes('[FIX_ATTEMPT]') || line.includes('[ROOT_TRACE]'))
    .join('\n');

// Save to separate file
const fixHistoryFile = path.join(__dirname, '../logs/fix-history.log');
fs.appendFileSync(fixHistoryFile, fixAttemptLogs + '\n--- Issue Break ---\n');

// Then clear main log
fs.writeFileSync(logFile, '', 'utf8');
```

**Benefits:**
- ✅ Preserves fix attempts and root traces
- ✅ Keeps main log slim
- ✅ Can analyze fix history separately

**Drawbacks:**
- ⚠️ Still loses some context
- ⚠️ Need to check multiple files

### Option 4: Size-Based Clearing (Best Balance)

**Only clear if log is getting too large:**

```javascript
const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5MB
const stats = fs.statSync(logFile);

if (stats.size > MAX_LOG_SIZE) {
    // Archive before clearing
    const archiveFile = path.join(archiveDir, `game_${Date.now()}.log`);
    fs.copyFileSync(logFile, archiveFile);
    
    // Clear current log
    fs.writeFileSync(logFile, '', 'utf8');
} else {
    // Don't clear - log is still manageable
    // Just reset position tracking
    lastPosition = stats.size;
}
```

**Benefits:**
- ✅ Only clears when necessary
- ✅ Preserves history when log is small
- ✅ Prevents disk space issues
- ✅ Best balance of history vs. performance

**Drawbacks:**
- ⚠️ Log might grow between issues
- ⚠️ Need to track log size

## Recommendation: Hybrid Approach

**Combine Option 1 (Archive) + Option 4 (Size-Based):**

```javascript
async function handleIssueWithLogClearing(issue, tableId, tableDetails) {
    // ... pause, report, fix ...
    
    // STEP 4: ARCHIVE AND CLEAR LOG (if needed)
    const stats = fs.statSync(logFile);
    const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5MB
    
    if (stats.size > MAX_LOG_SIZE) {
        // Archive current log
        const archiveDir = path.join(__dirname, '../logs/archived');
        if (!fs.existsSync(archiveDir)) {
            fs.mkdirSync(archiveDir, { recursive: true });
        }
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const archiveFile = path.join(archiveDir, `game_${timestamp}_${issue.type}.log`);
        
        try {
            fs.copyFileSync(logFile, archiveFile);
            gameLogger.gameEvent('LOG_WATCHER', `[WORKFLOW] LOG_ARCHIVED`, {
                archiveFile,
                originalSize: stats.size,
                reason: 'Log file exceeded 5MB, archiving before clearing'
            });
        } catch (error) {
            gameLogger.error('LOG_WATCHER', `[WORKFLOW] ARCHIVE_ERROR`, { error: error.message });
        }
        
        // Clear current log
        fs.writeFileSync(logFile, '', 'utf8');
        lastPosition = 0;
    } else {
        // Log is still small - just reset position
        // This preserves history for correlation analysis
        lastPosition = stats.size;
        gameLogger.gameEvent('LOG_WATCHER', `[WORKFLOW] LOG_NOT_CLEARED`, {
            reason: 'Log file is still manageable (<5MB), preserving history',
            currentSize: stats.size
        });
    }
    
    // ... resume ...
}
```

**Benefits:**
- ✅ Preserves history when log is small (can see what was tried)
- ✅ Archives before clearing (full history preserved)
- ✅ Only clears when necessary (prevents disk issues)
- ✅ Best of both worlds

## What Information Do We Actually Need?

### Critical to Preserve:
1. **Fix attempt results** - What worked, what didn't
2. **Root traces** - State before/after fixes
3. **Issue patterns** - Which patterns matched
4. **Fix statistics** - Already in `fix-attempts.txt`

### Can Be Cleared:
1. **Verbose game events** - Normal gameplay logs
2. **Repeated patterns** - If we've seen it before
3. **Old state snapshots** - If not related to current issue

## Implementation Priority

1. **High Priority:** Archive before clearing (preserve history)
2. **High Priority:** Size-based clearing (only clear when needed)
3. **Medium Priority:** Extract fix attempts before clearing
4. **Low Priority:** Automatic archive cleanup (delete old archives)

## Conclusion

**Current approach (always clear) is too aggressive.** We should:

1. ✅ **Archive logs before clearing** - Preserve full history
2. ✅ **Only clear when log is large** - Preserve history when small
3. ✅ **Keep fix attempt logs separate** - Easy to analyze
4. ✅ **Use existing rotation system** - Leverage what we have

This gives us:
- ✅ Slim logs for real-time monitoring
- ✅ Full history for analysis
- ✅ Fix attempt tracking preserved
- ✅ No loss of debugging information
