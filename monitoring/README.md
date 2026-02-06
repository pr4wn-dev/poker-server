# Automated Issue Detection and Fixing System

**COMPLETE REPLACEMENT FOR ALL LOGGING SYSTEMS**

This is the **ONLY** logging system used across the entire game. It replaces all console.log, Debug.Log, and other logging methods with a centralized, powerful system that detects and fixes issues automatically.

---

## 🎯 What This System Does

1. **Monitors ALL logs** from server and Unity continuously
2. **Detects issues** using pattern matching, root tracing, and state analysis
3. **Pauses Unity automatically** when critical issues are found
4. **Logs issues** to `logs/pending-issues.json` for the assistant to fix
5. **Tracks fix attempts** to prevent repeated failures
6. **Resumes Unity** after fixes are applied

---

## 📁 File Structure

```
monitoring/
├── README.md                 # This file - comprehensive documentation
├── monitor.ps1              # Main PowerShell monitoring script (run this)
├── issue-detector.js        # Core issue detection engine
├── fix-tracker.js           # Fix attempt tracking system
└── unity-log-handler.js     # Unity console log capture handler

logs/
├── game.log                 # ALL logs go here (server + Unity)
└── pending-issues.json      # Issues waiting for assistant to fix

fix-attempts.txt             # Fix attempt statistics (root level)
```

---

## 🚀 Quick Start

### 1. Start the Server
```powershell
cd C:\Projects\poker-server
npm start
```

### 2. Start Monitoring
```powershell
.\monitoring\monitor.ps1
```

The monitor will:
- Watch `logs/game.log` continuously
- Detect issues automatically with severity-based detection
- Display **real-time statistics dashboard** (updates every 5 seconds)
- Pause Unity when **critical/high** issues are found
- Log issues to `logs/pending-issues.json`
- Track fix attempts and success rates
- Show comprehensive stats: issues by severity, source, patterns, fix attempts

### 3. When Issue is Found

1. **Monitor detects issue** (CRITICAL or HIGH severity)
   - Dashboard shows issue in "Current Status" section
   - Issue logged to `pending-issues.json`
   - Statistics updated (issues detected, severity, source)
   
2. **Unity pauses automatically** (via server's log watcher)
   - Dashboard status changes to "PAUSED (Issue Detected)"
   - Current issue preview shown
   
3. **You message assistant**: **"issue found"**
   
4. **Assistant fixes issues**:
   - Reads `pending-issues.json`
   - Fixes all issues
   - Clears `pending-issues.json`
   - Restarts server
   - Resumes Unity
   
5. **Monitor continues automatically**:
   - Dashboard status returns to "MONITORING ACTIVE"
   - Statistics continue tracking
   - Ready for next issue

---

## 🔍 How Issue Detection Works

### Detection Methods

1. **Severity-Based Pattern Matching** - Detects known error patterns organized by severity:
   
   **CRITICAL Patterns** (Pauses Unity immediately):
   - Server errors (SyntaxError, TypeError, ReferenceError)
   - Connection issues (ECONNREFUSED, EADDRINUSE)
   - Database errors
   - Chip loss (`CHIPS.*LOST`, `Money.*lost`, `missing.*chips`)
   - Pot not cleared (`Pot.*not.*cleared.*at.*hand.*start`)
   - Pot mismatches (`POT.*MISMATCH`, `pot.*mismatch.*before.*calculation`)
   - Fix system errors (`[FIX].*DISABLED`)
   - Network failures
   
   **HIGH Patterns** (Logs and may pause):
   - Unity errors (NullReferenceException, MissingReferenceException)
   - Timer/timeout issues (`SIMULATION BOT TIMEOUT`)
   - Action rejected (`Action.*rejected.*Not.*your.*turn`)
   - State inconsistencies
   - Icon loading failures
   
   **MEDIUM Patterns** (Logs but continues):
   - Betting action failures (`Cannot.*bet.*current.*bet`)
   - Validation warnings
   - Memory/performance issues
   
   **LOW Patterns** (Logs only):
   - Infinite loop detection
   - Deprecation warnings

2. **Root Tracing** - Uses `_traceUniversal` pattern from `Table.js`:
   - Tracks ALL operations with before/after state
   - Detects unexpected state changes
   - Captures stack traces automatically
   - Logs with `[TRACE]` prefix

3. **State Analysis** - Detects inconsistencies:
   - Chip validation failures
   - Pot calculation errors
   - Player state mismatches
   - Game phase inconsistencies

### Issue Severity Levels

- **Critical** - Pauses Unity immediately (errors, exceptions, crashes, chip loss, pot issues)
- **High** - Logs and may pause (state inconsistencies, validation failures, action rejections)
- **Medium** - Logs but continues (warnings, betting failures, deprecations)
- **Low** - Logs only (informational, loop detection)

**Only CRITICAL and HIGH severity issues pause Unity. MEDIUM and LOW are logged for analysis but don't interrupt gameplay.**

---

## 📊 Fix Attempt Tracking

The system tracks fix attempts to prevent repeated failures:

- **Tracks**: Attempts, failures, successes per fix method
- **Disables**: Fix methods after 5 failures (forces different approach)
- **Stores**: Statistics in `fix-attempts.txt`
- **Logs**: All attempts to `logs/game.log` with `[FIX_ATTEMPT]` prefix

### Fix ID Format
- `FIX_1_POT_NOT_CLEARED` - Pot not cleared issue
- `FIX_2_CHIPS_LOST_BETTING` - Chips lost during betting
- `FIX_66_TIMER_CLEARED_AT_ACTION_START` - Timer cleared on action
- And 70+ more fix IDs

---

## 🎮 Unity Log Capture

**ALL Unity console logs are captured automatically:**

1. Unity sends logs via `report_unity_log` socket event
2. Server receives and logs via `gameLogger`
3. Issue detector processes from `game.log`
4. Issues are detected and logged to `pending-issues.json`

### Unity Integration Required

Unity must send ALL `Debug.Log`, `Debug.LogError`, `Debug.LogWarning` to server:

```csharp
// In Unity - send all logs to server
void OnEnable() {
    Application.logMessageReceived += HandleUnityLog;
}

void HandleUnityLog(string logString, string stackTrace, LogType type) {
    _gameService.ReportUnityLog(new Dictionary<string, object> {
        { "level", type.ToString() },
        { "message", logString },
        { "stackTrace", stackTrace },
        { "context", GetCurrentContext() }
    });
}
```

---

## 📝 Logging Standards

### ✅ DO THIS:
```javascript
// Use gameLogger for ALL logging
const gameLogger = require('../utils/GameLogger');

gameLogger.gameEvent('CATEGORY', 'EVENT_NAME', { data });
gameLogger.error('CATEGORY', 'ERROR_MESSAGE', { error });
gameLogger.debug('CATEGORY', 'DEBUG_INFO', { data });
```

### ❌ NEVER DO THIS:
```javascript
// NO console.log, console.error, console.warn
console.log('Something happened');  // ❌ WRONG

// NO Debug.Log in Unity (send to server instead)
Debug.Log("Something happened");  // ❌ WRONG
```

### All Logs Go To:
- **Single file**: `logs/game.log`
- **Format**: `[timestamp] [level] [category] message | Data: {...}`
- **Rotation**: Auto-rotates at 10MB, keeps 5 backups

---

## 🔧 Issue Detection Patterns

### CRITICAL Severity Patterns (Pauses Unity)

**Server Errors:**
- `SyntaxError`, `TypeError`, `ReferenceError`, `RangeError`, `URIError`
- `ECONNREFUSED`, `EADDRINUSE`, `Port.*already.*in use`
- `SERVER.*FAILED`, `SERVER.*OFFLINE`

**Database Errors:**
- `DATABASE.*CONNECTION.*FAILED`, `Database.*OFFLINE`
- `MySQL.*error`, `database.*error`

**Chip/Pot Issues:**
- `CHIPS.*LOST`, `Money.*lost`, `missing.*chips`
- `POT.*MISMATCH`, `pot.*mismatch.*before.*calculation`
- `Pot.*not.*cleared.*at.*hand.*start`, `Pot.*not.*cleared`
- `chip.*validation.*failed`, `money.*validation.*failed`

**Game Logic Errors:**
- `[ROOT CAUSE]` - Root cause analysis markers
- `[ROOT_TRACE].*TOTAL_BET_NOT_CLEARED`
- `[ROOT_TRACE].*PLAYER_WON_MORE_THAN_CONTRIBUTED`
- `[ERROR].*[POT]`, `[ERROR].*[CHIPS]`, `[ERROR].*[VALIDATION]`

**Fix System Errors:**
- `[FIX].*DISABLED` - Fix method disabled
- `METHOD_DISABLED.*TRY_DIFFERENT_APPROACH`

**Network Errors:**
- `socket.*error`, `connection.*lost`, `websocket.*error`, `network.*error`

### HIGH Severity Patterns (May Pause)

**Unity Errors:**
- `NullReferenceException`, `MissingReferenceException`
- `ArgumentNullException`, `InvalidOperationException`
- `[UNITY].*ERROR`, `[UNITY].*EXCEPTION`

**Timer/Timeout Issues:**
- `SIMULATION BOT TIMEOUT`
- `[TIMER].*TIMEOUT.*auto-folding`, `timer.*expired`

**Action Validation:**
- `Action.*rejected.*Not.*your.*turn`
- `Action.*rejected.*Game.*not.*in.*progress`

**State Issues:**
- `state.*inconsistent`, `unexpected.*state`, `invalid.*state`

**Unity Client Issues:**
- `[ICON_LOADING].*ISSUE_REPORTED`
- `LoadItemIcon.*FAILED`, `CreateItemAnteSlot.*FAILED`
- `Sprite not found`

### MEDIUM Severity Patterns (Logs Only)

**Betting Failures:**
- `Cannot.*bet.*current.*bet`
- `Cannot.*check.*need.*to.*call`
- `Invalid.*betting.*action`, `Betting.*Action.*Failures`

**Validation Warnings:**
- `[WARNING].*[VALIDATION]`, `[WARNING].*[POT]`, `[WARNING].*[CHIPS]`

**Performance:**
- `memory.*leak`, `heap.*overflow`, `out of memory`

### LOW Severity Patterns (Logs Only)

**Loop Detection:**
- `stuck.*in.*loop`, `infinite.*loop`, `recursion.*too.*deep`

**Deprecation:**
- `deprecated`, `obsolete`

---

## 📊 Real-Time Statistics Dashboard

The PowerShell monitor displays a **live statistics dashboard** that updates every 5 seconds:

### Dashboard Sections

1. **Monitoring Status**
   - Current status (Active/Paused)
   - Uptime (HH:MM:SS format)
   - Server status (Online/Offline)

2. **Detection Statistics**
   - Total lines processed
   - Total issues detected
   - Unique patterns found
   - Log file size (MB)
   - Last issue timestamp

3. **Issues by Severity**
   - Critical count (red)
   - High count (yellow)
   - Medium count (yellow/gray)
   - Low count (gray)

4. **Issues by Source**
   - Server issues count
   - Unity issues count
   - Database issues count
   - Network issues count

5. **Fix Attempts Statistics**
   - Total fix attempts
   - Successful fixes (green)
   - Failed fixes (red)
   - Success rate percentage (color-coded: green ≥80%, yellow ≥50%, red <50%)

6. **Current Status**
   - Pending issues count
   - Current issue preview (if paused)

### Dashboard Features

- **Auto-refresh**: Updates every 5 seconds automatically
- **Color-coded**: Green = good, Yellow = warning, Red = critical
- **Formatted layout**: Clean box-drawing characters for easy reading
- **Real-time tracking**: All stats update as issues are detected

### Viewing Statistics

Simply run the monitor - statistics are displayed automatically:
```powershell
.\monitoring\monitor.ps1
```

The dashboard will show immediately and refresh every 5 seconds. Press `Ctrl+C` to stop.

## 🛠️ Manual Operations

### Check Pending Issues
```powershell
node monitoring/issue-detector.js --get-pending
```

### Clear Pending Issues (after fix)
```powershell
node monitoring/issue-detector.js --clear
```

### Check Fix Statistics
```powershell
Get-Content fix-attempts.txt
```

### View Real-Time Stats
The monitor automatically displays stats. For detailed analysis:
- Check `logs/game.log` for full issue details
- Check `logs/pending-issues.json` for pending issues
- Check `fix-attempts.txt` for fix attempt history

---

## 🔄 Workflow Diagram

```
┌─────────────────┐
│  Unity Game     │──┐
│  (Running)      │  │
└─────────────────┘  │
                     │
┌─────────────────┐  │  All logs
│  Server         │──┼──> logs/game.log
│  (Node.js)      │  │
└─────────────────┘  │
                     │
┌─────────────────┐  │
│  monitor.ps1    │──┘
│  (Watching)     │
└─────────────────┘
         │
         │ Issue detected
         ▼
┌─────────────────┐
│ Pause Unity     │
│ Log to          │
│ pending-issues  │
└─────────────────┘
         │
         │ User: "issue found"
         ▼
┌─────────────────┐
│ Assistant       │
│ Reads issues    │
│ Fixes code      │
│ Clears file     │
│ Restarts server │
└─────────────────┘
         │
         │ Resume Unity
         ▼
┌─────────────────┐
│ Continue        │
│ Monitoring      │
└─────────────────┘
```

---

## 📋 For New Sessions / Catching Up

If you're starting a fresh session and need to understand this system:

### What It Is
- **Complete logging replacement** - Replaces ALL console.log, Debug.Log, etc.
- **Automated issue detection** - Detects problems across entire game
- **Auto-pause/resume** - Pauses Unity when issues found, resumes after fix
- **Fix tracking** - Tracks which fixes work and which don't

### Key Files
- `monitoring/monitor.ps1` - Run this to start monitoring
- `monitoring/issue-detector.js` - Core detection engine
- `logs/game.log` - ALL logs go here (single source of truth)
- `logs/pending-issues.json` - Issues waiting for fix
- `fix-attempts.txt` - Fix attempt statistics

### How It Works
1. Monitor watches `logs/game.log` continuously
2. Detects issues using patterns + root tracing
3. Pauses Unity, logs to `pending-issues.json`
4. You message assistant: "issue found"
5. Assistant fixes, clears file, restarts server, resumes Unity
6. Monitor continues

### Integration Points
- **Server**: All code uses `gameLogger` (no console.log)
- **Unity**: Sends logs via `report_unity_log` socket event
- **Existing**: Integrates with `scripts/watch-logs-and-fix.js`
- **Tracking**: Extends fix attempt system from `Table.js`

### What Makes It Powerful
- **Root Tracing**: Tracks every operation with before/after state
- **Pattern Matching**: 50+ error patterns detected automatically
- **Fix Tracking**: Prevents repeated failures, forces new approaches
- **Centralized**: ALL logs in one place (`logs/game.log`)
- **Comprehensive**: Detects server, Unity, network, database issues

---

## 🚨 Important Notes

1. **NO console.log anywhere** - All logging goes through `gameLogger`
2. **NO Debug.Log in Unity** - Send all logs to server via socket
3. **Single log file** - Everything goes to `logs/game.log`
4. **Auto-rotation** - Log file rotates at 10MB, keeps 5 backups
5. **Fix attempts tracked** - Prevents infinite retry loops
6. **Unity auto-pauses** - When critical issues detected
7. **Assistant fixes** - You just message "issue found", assistant does the rest

---

## 🔍 Troubleshooting

### Monitor not detecting issues?
- Check `logs/game.log` exists and is being written to
- Verify Node.js is installed (`node --version`)
- Check PowerShell execution policy: `Get-ExecutionPolicy`

### Issues not being logged?
- Check `logs/pending-issues.json` exists
- Verify issue matches detection patterns
- Check `logs/game.log` for `[ISSUE_DETECTED]` entries

### Unity not pausing?
- Check server's `scripts/watch-logs-and-fix.js` is running
- Verify Unity receives `simulation_paused` event
- Check `table.isPaused` flag in Unity

### Fixes not working?
- Check `fix-attempts.txt` for disabled fix methods
- Review fix attempt logs in `logs/game.log`
- Try different fix approach if method is disabled

---

## 📚 Related Systems

- **`scripts/watch-logs-and-fix.js`** - Existing log watcher (integrates with this)
- **`src/game/Table.js`** - Root tracing system (`_traceUniversal`)
- **`src/utils/GameLogger.js`** - Centralized logging system
- **`fix-attempts.txt`** - Fix attempt statistics

---

## 🎯 Success Criteria

This system is working correctly when:
- ✅ All logs go to `logs/game.log` (no console output)
- ✅ Issues are detected automatically
- ✅ Unity pauses when critical issues found
- ✅ Issues logged to `pending-issues.json`
- ✅ Assistant can read and fix issues
- ✅ Unity resumes after fixes
- ✅ Fix attempts are tracked and prevent loops

---

## 📚 Known Issues Reference

This section documents historical issues and their solutions from `CHANGELOG.md` and other project documentation. These patterns are automatically detected by the monitoring system.

### Critical Issues (Auto-Detected)

1. **Socket.IO Response Format Issues**
   - **Pattern**: Unity receives default values instead of actual data
   - **Solution**: Use `JsonUtility.FromJson<T>()` instead of `GetValue<T>()`
   - **Detection**: Unity deserialization errors

2. **Pot Not Cleared at Hand Start**
   - **Pattern**: `Pot not cleared at hand start`
   - **Impact**: Pot carries over between hands, validation fails
   - **Detection**: `[ERROR] [POT] ERROR: Pot not cleared at hand start`

3. **Chip Loss During Gameplay**
   - **Pattern**: `CHIPS.*LOST`, `Money.*lost`, `missing.*chips`
   - **Impact**: Chips disappear from system
   - **Detection**: Validation failures, chip accounting errors

4. **Pot Mismatch**
   - **Pattern**: `POT.*MISMATCH`, `pot.*mismatch.*before.*calculation`
   - **Impact**: Pot < sum of totalBets, chips lost during betting
   - **Detection**: Pot calculation validation errors

### High Priority Issues (Auto-Detected)

1. **Action Rejected - Not Your Turn**
   - **Pattern**: `Action.*rejected.*Not.*your.*turn`
   - **Impact**: Bots trying to act out of turn
   - **Detection**: Action validation errors

2. **Action Rejected - Game Not in Progress**
   - **Pattern**: `Action.*rejected.*Game.*not.*in.*progress`
   - **Impact**: Actions attempted during waiting phase
   - **Detection**: Game state validation errors

3. **Betting Action Failures**
   - **Pattern**: `Cannot.*bet.*current.*bet`, `Cannot.*check.*need.*to.*call`
   - **Impact**: Invalid betting actions attempted
   - **Detection**: Betting validation errors

4. **Timer/Timeout Issues**
   - **Pattern**: `SIMULATION BOT TIMEOUT`, `timer.*expired`
   - **Impact**: Bots timing out, auto-folding
   - **Detection**: Timer expiration logs

### Medium Priority Issues (Logged but Continue)

1. **Validation Warnings**
   - **Pattern**: `[WARNING].*[VALIDATION]`, `[WARNING].*[POT]`
   - **Impact**: Non-critical validation issues
   - **Detection**: Warning-level logs

2. **Memory/Performance Issues**
   - **Pattern**: `memory.*leak`, `heap.*overflow`
   - **Impact**: Performance degradation
   - **Detection**: Performance monitoring

### Historical Fixes (Reference Only)

- **Issue #1**: SocketIOUnity GetValue<T>() Returns Default Values → Use JsonUtility
- **Issue #21**: SOCKET_IO_AVAILABLE Only Defined for Android → Add to Standalone platform
- **Issue #26**: Response Classes ONLY in NetworkModels.cs → Centralize response classes
- **Card Visibility**: Cards disappearing → Atomic card replacement, position locking
- **Pot Distribution**: Players winning more than contributed → Validation added

**See `CHANGELOG.md` for complete historical issue list and solutions.**

---

## 📈 Statistics Tracking

The monitoring system tracks comprehensive statistics:

### Detection Metrics
- **Total Lines Processed**: All log lines analyzed
- **Issues Detected**: Total issues found (all severities)
- **Unique Patterns**: Number of distinct issue patterns detected
- **Log File Size**: Current size of `logs/game.log` in MB

### Issue Breakdown
- **By Severity**: Critical, High, Medium, Low counts
- **By Source**: Server, Unity, Database, Network counts
- **By Pattern**: Tracks which patterns are most common

### Fix Performance
- **Total Attempts**: All fix attempts across all fixes
- **Success Rate**: Percentage of successful fixes
- **Success/Failure Counts**: Detailed breakdown

### Real-Time Updates
- Statistics update as issues are detected
- Dashboard refreshes every 5 seconds
- All metrics are cumulative (reset on monitor restart)

---

**Last Updated**: 2026-02-06
**Version**: 1.1.0
**Status**: Complete with Enhanced Statistics, Severity Mapping, and Real-Time Dashboard
