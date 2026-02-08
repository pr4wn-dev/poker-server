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

## 🏗️ System Architecture

This monitoring system consists of **two integrated but separate components**:

### 1. **Log Watcher** (Built into Server) - **PAUSE/RESUME SERVICE ONLY**
- **Location**: `scripts/watch-logs-and-fix.js`
- **Status**: Runs automatically when server starts
- **Initialized**: `src/server.js` line 19 & 222
- **Purpose**:
  - Reads `game.log` continuously
  - **ONLY detects Monitor's pause/resume markers** (no independent issue detection)
  - Pauses Unity when Monitor writes pause marker
  - Resumes Unity when Monitor writes resume marker
  - Performs log maintenance (archives/clears when >5MB)
- **Important**: Log Watcher **does NOT** auto-fix issues. All fixes go through Monitor → Assistant workflow.

### 2. **Monitor** (Separate PowerShell Script)
- **Location**: `monitoring/monitor.ps1`
- **Status**: You run it manually
- **Modes**: 
  - **Simulation Mode**: Fully automated including table creation and simulation start
  - **Normal Mode**: User creates table manually, everything else automated
- **Purpose**:
  - Reads `game.log` continuously
  - Detects issues using `issue-detector.js`
  - Writes special markers to `game.log` when issues are found
  - Shows real-time statistics dashboard
  - Logs issues to `pending-issues.json`
  - **Automation** (both modes):
    - Auto-restart server if needed
    - Auto-restart database if needed
    - Auto-restart Unity if needed
    - Auto-connect Unity to server
    - Auto-login Unity
  - **Simulation Mode Only**:
    - Auto-create simulation table
    - Auto-start simulation

### How They Work Together

1. **Monitor detects issue** → Writes pause marker to `game.log` with `tableId`
2. **Log Watcher reads `game.log`** → Detects Monitor's pause marker → Pauses Unity
3. **You tell Assistant**: "issue found"
4. **Assistant fixes issues** → Clears `pending-issues.json`
5. **Monitor detects `pending-issues.json` cleared** → Writes resume marker to `game.log`
6. **Log Watcher reads `game.log`** → Detects Monitor's resume marker → Resumes Unity

**Key Point**: Log Watcher is now a **pause/resume service only**. It does NOT detect issues independently or attempt auto-fixes. All issue detection and fixing is coordinated by Monitor → Assistant workflow.

### Pattern Sharing

**Note**: Log Watcher no longer uses error patterns for independent detection. It only responds to Monitor's pause/resume markers. All issue detection patterns are in Monitor:

1. **Monitor patterns**: Edit `monitoring/issue-detector.js` → `errorPatterns` object
2. **Log Watcher**: Only detects Monitor markers (`[MONITOR] [CRITICAL_ISSUE_DETECTED]` and `[MONITOR] [ISSUES_FIXED]`)

---

## 📁 File Structure

```
monitoring/
├── README.md                 # This file - comprehensive documentation
├── monitor.ps1              # Main PowerShell monitoring script (run this)
├── issue-detector.js        # Core issue detection engine
├── fix-tracker.js           # Fix attempt tracking system
└── unity-log-handler.js     # Unity console log capture handler

scripts/
└── watch-logs-and-fix.js    # Server-side log watcher (runs automatically)

logs/
├── game.log                 # ALL logs go here (server + Unity)
├── pending-issues.json      # Issues waiting for assistant to fix (includes focused groups and fix attempts)
├── fix-applied.json         # Fix applied marker (written by assistant, read by Monitor for verification)
└── monitor-status.json      # Persistent monitor status (updated every 5 seconds) - READ BY AI MODEL

fix-attempts.txt             # Fix attempt statistics (root level)
```

---

## 🤖 AI Model Integration - Complete Workflow Documentation

**CRITICAL FOR AI MODELS**: This section explains how the User, Monitor, and AI Model interact to detect, diagnose, and fix issues automatically. **Read this section first** when starting a new session or when the user reports monitor problems.

### Monitor Status File (`logs/monitor-status.json`)

The monitor automatically writes a comprehensive status file that updates every 5 seconds. This file is **the single source of truth** for understanding what the monitor is doing.

**Location**: `logs/monitor-status.json`

**When AI Should Read This File**:
- ✅ User reports "monitor having a problem"
- ✅ User says "monitor not working" or "monitor crashed"
- ✅ User says "debugger not pausing" or "Unity not pausing"
- ✅ User says "issue detector failed"
- ✅ You need to understand current monitor state
- ✅ You need to diagnose why something isn't working
- ✅ **ANY time you need to understand monitor state**

**How to Read**:
```powershell
# Read the status file
$status = Get-Content logs/monitor-status.json -Raw | ConvertFrom-Json

# Check key fields
$status.debuggerBreakStatus      # Current debugger break state
$status.lastError                 # Most recent error
$status.unityStatus.actualStatus  # Unity real status
$status.investigation.active      # Is investigation running?
$status.verification.active       # Is verification running?
```

**What It Contains** (Complete Structure):
```json
{
  "timestamp": "2026-02-07T12:34:56.789Z",
  "monitorRunning": true,
  "monitorStartTime": "2026-02-07T12:00:00.000Z",
  "uptime": 2096.5,
  "serverStatus": "Online",
  "unityStatus": {
    "running": true,
    "connected": true,
    "actualStatus": "ACTIVE"
  },
  "investigation": {
    "active": true,
    "startTime": "2026-02-07T12:34:45.000Z",
    "timeout": 15,
    "timeRemaining": 8.5
  },
  "verification": {
    "active": false,
    "startTime": null,
    "period": 0,
    "timeRemaining": null
  },
  "paused": false,
  "currentIssue": "Error message preview...",
  "pendingIssues": {
    "total": 5,
    "inFocusMode": true,
    "queued": 2,
    "rootIssue": {
      "type": "error",
      "severity": "critical",
      "source": "server",
      "tableId": "table_123"
    },
    "fixAttempts": 1,
    "failedAttempts": 0
  },
  "statistics": {
    "linesProcessed": 12345,
    "issuesDetected": 42,
    "lastIssueTime": "2026-02-07T12:34:50.000Z"
  },
  "debuggerBreaks": {
    "successful": 3,
    "failed": 1
  },
  "lastDebuggerBreakAttempt": "2026-02-07T12:34:55.000Z",
  "debuggerBreakStatus": "success",
  "lastError": null,
  "lastErrorTime": null,
  "issueDetectorStatus": "ok",
  "lastIssueDetectorError": null,
  "lastIssueDetectorErrorTime": null
}
```

**Key Fields for AI Models to Check**:

1. **`debuggerBreakStatus`** - Why debugger didn't pause:
   - `"success"` - Debugger break worked, Unity should be paused
   - `"verifying_unity"` - Monitor is checking Unity status (wait)
   - `"failed_unity_not_running"` - Unity not running (Monitor will auto-restart)
   - `"failed_no_tables"` - Unity not in table room (Monitor will wait)
   - `"failed_exception"` - API call failed (check server status)

2. **`unityStatus.actualStatus`** - Real Unity state:
   - `"ACTIVE"` - Unity connected and actively playing
   - `"CONNECTED"` - Unity connected but not in game scene
   - `"IDLE"` - Unity running but not connected to server
   - `"STOPPED"` - Unity process not running

3. **`issueDetectorStatus`** - Issue detector health:
   - `"ok"` - Issue detector working normally
   - `"failed"` - Check `lastIssueDetectorError` for details
   - `"exception"` - Check `lastIssueDetectorError` for exception details

4. **`investigation.active`** / **`investigation.timeRemaining`** - Investigation phase:
   - If `active: true` - Monitor is gathering related issues
   - Check `timeRemaining` to see how long until pause
   - **Completion Check**: Monitor uses script variables as primary source of truth, with status file as fallback
   - **Safety Check**: Investigation automatically completes if running 2x timeout (prevents stuck investigations)

5. **`verification.active`** / **`verification.timeRemaining`** - Verification phase:
   - If `active: true` - Monitor is verifying a fix
   - Check `timeRemaining` to see verification progress

6. **`lastError`** / **`lastErrorTime`** - Most recent error:
   - Always check this first when user reports problems
   - Contains detailed error message and timestamp

7. **`pendingIssues.rootIssue`** - Current issue being investigated:
   - Type, severity, source, tableId
   - Use this to understand what needs fixing

8. **`pendingIssues.fixAttempts`** / **`failedAttempts`** - Fix history:
   - See what was tried before
   - Avoid repeating failed methods

### Complete Workflow: User → Monitor → AI Model

#### Phase 1: Issue Detection (Automatic - Monitor)

1. **Monitor continuously reads `game.log`**
2. **Monitor detects issue** using `issue-detector.js` patterns
3. **Monitor enters Investigation Phase** (15 seconds default)
   - Gathers related issues
   - Groups by pattern, tableId, stack trace, keywords
   - Queues unrelated issues
4. **Monitor writes to `pending-issues.json`**:
   ```json
   {
     "focusedGroup": {
       "id": "group_123",
       "rootIssue": { "type": "error", "severity": "critical", ... },
       "relatedIssues": [...],
       "fixAttempts": []
     },
     "queuedIssues": [...]
   }
   ```
5. **Investigation completes** → Monitor pauses Unity
   - Calls `/api/simulation/pause` API (sets `table.isPaused = true`)
   - Server broadcasts `table_state` event with `isPaused: true`
   - Unity reads `isPaused` from `table_state` and sets `Time.timeScale = 0`
   - More reliable than `Debug.Break()` (works even without debugger attached)
6. **Monitor updates `monitor-status.json`** with current state

#### Phase 2: User Notification (Manual - User)

**User sees**:
- Monitor console shows "PAUSED (Fix Required)" status
- Statistics dashboard shows investigation details
- Unity debugger is paused (if attached)

**User tells AI**: "monitor found an issue" or "fix the issue"

#### Phase 3: AI Model Diagnosis (Automatic - AI Model)

**AI Model MUST**:
1. **Read `logs/monitor-status.json` FIRST** to understand current state
2. **Read `logs/pending-issues.json`** to see the issue details
3. **Check `paused`** in status file:
   - If `true`: Unity is paused and waiting for fix
   - If `false`: Unity is active (investigation may not have completed yet)
   - Also check `debuggerBreakStatus` (legacy/fallback):
     - If `failed_unity_not_running`: Unity needs restart (Monitor will auto-handle)
     - If `failed_no_tables`: Unity not in table room (Monitor will wait)
     - If `failed_exception`: API call failed (check server status)
     - If `success`: Pause mechanism worked (Unity should be paused)
4. **Check `unityStatus.actualStatus`**:
   - `ACTIVE`: Unity is connected and playing (ready)
   - `CONNECTED`: Unity connected but not in game (may need to join table)
   - `IDLE`: Unity running but not connected (Monitor will auto-restart)
   - `STOPPED`: Unity not running (Monitor will auto-start)
5. **Check `issueDetectorStatus`** in status file:
   - If `failed`: Issue detector had errors
   - Check `lastIssueDetectorError` for details
   - Monitor will auto-retry, but you can fix root cause
6. **Analyze the issue** from `pending-issues.json`:
   - Root issue type, severity, source
   - Related issues (what else is broken)
   - Fix attempts (what was tried before)
   - Failure reasons (why previous attempts failed)

**AI Model SHOULD NOT**:
- ❌ Ask user to check things manually
- ❌ Ask user to describe what happened
- ❌ Ask user to check Unity status
- ❌ Ask user to check server status
- ❌ Ask user to check if debugger is attached

**AI Model SHOULD**:
- ✅ Read status file to see everything automatically
- ✅ Use status file information to diagnose
- ✅ Fix issues automatically based on status file
- ✅ Explain what it found in status file

#### Phase 4: AI Model Fix (Automatic - AI Model)

**AI Model MUST**:
1. **Fix the root issue** in code
2. **Check fix attempts** to avoid repeating failed methods
3. **Write `logs/fix-applied.json`**:
   ```json
   {
     "groupId": "group_123",
     "fixDescription": "Fixed chip calculation in pot distribution",
     "requiredRestarts": ["server"],
     "timestamp": "2026-02-07T12:35:00.000Z"
   }
   ```
4. **Commit and push changes** (automatic)

**Required Restarts**:
- `["server"]` - Server needs restart for fix to take effect
- `["unity"]` - Unity needs restart for fix to take effect
- `["database"]` - Database needs restart for fix to take effect
- `["server", "unity"]` - Both need restart
- `[]` - No restarts needed (fix takes effect immediately)

#### Phase 5: Verification (Automatic - Monitor)

1. **Monitor detects `fix-applied.json`**
2. **Monitor starts Verification Phase**:
   - Calculates verification period (based on severity, restarts, issue type)
   - Performs required service restarts (database, server, Unity)
   - Waits for services to be ready
   - Monitors logs for issue pattern reappearance
3. **Monitor updates `monitor-status.json`** with verification progress
4. **If issue doesn't reappear**:
   - Mark fix as `confirmed` in `pending-issues.json`
   - Clear `fix-applied.json`
   - Move to next queued issue (if any)
5. **If issue reappears**:
   - Mark fix as `failed` in `pending-issues.json`
   - Record failure details and insights
   - Stay focused on same issue (don't move to next)
   - Update `monitor-status.json` with failure

#### Phase 6: Next Issue (Automatic - Monitor)

1. **Monitor promotes next queued issue** to `focusedGroup`
2. **Starts new Investigation Phase**
3. **Process repeats**

### AI Model Best Practices

#### When User Reports "Monitor Problem"

**ALWAYS do this first**:
```powershell
# 1. Read monitor status file
$status = Get-Content logs/monitor-status.json -Raw | ConvertFrom-Json

# 2. Check for errors
if ($status.lastError) {
    Write-Host "Last Error: $($status.lastError) at $($status.lastErrorTime)"
}

# 3. Check Unity pause status
Write-Host "Unity Paused: $($status.paused)"
Write-Host "Debugger Break Status (legacy): $($status.debuggerBreakStatus)"

# 4. Check Unity status
Write-Host "Unity Status: $($status.unityStatus.actualStatus)"

# 5. Check issue detector status
Write-Host "Issue Detector Status: $($status.issueDetectorStatus)"
```

**Diagnose automatically**:
- If `paused = false` but investigation completed: Check if `/api/simulation/pause` call failed (check server logs)
- If `paused = true`: Unity is correctly paused, waiting for `fix-applied.json`
- If `debuggerBreakStatus = "failed_unity_not_running"` (legacy): Monitor will auto-restart Unity, but you can verify Unity path in config
- If `debuggerBreakStatus = "failed_no_tables"` (legacy): Unity not in table room - Monitor will wait, but you can check if Unity should join table
- If `issueDetectorStatus = "failed"`: Check `lastIssueDetectorError` - fix the root cause (file permissions, Node.js, etc.)
- If `investigation.active = true` but stuck: 
  - Check `investigation.timeRemaining` - should complete automatically when <= 0
  - Monitor uses script variables as primary source (more reliable than status file)
  - Safety check forces completion if investigation runs 2x timeout (30s for 15s timeout)
  - Check `logs/monitor-diagnostics.log` for detailed completion check diagnostics

**Fix automatically**:
- Don't ask user to check things
- Use status file information to fix directly
- Status file shows exactly what's wrong

#### When User Says "Fix the Issue"

**ALWAYS do this**:
1. Read `logs/pending-issues.json` to see the issue
2. Read `logs/monitor-status.json` to see current state
3. Check `pendingIssues.fixAttempts` to see what was tried
4. Fix the root issue in code
5. Write `logs/fix-applied.json` with required restarts
6. Monitor automatically verifies the fix

#### When Debugger Doesn't Pause

**Check status file**:
1. Read `logs/monitor-status.json`
2. Check `paused` status:
   - `true`: Unity is paused and waiting for fix (correct state)
   - `false`: Unity is active (investigation may not have completed or Unity didn't receive pause)
   - Also check `debuggerBreakStatus` (legacy/fallback):
     - `verifying_unity`: Monitor is checking (wait)
     - `failed_unity_not_running`: Monitor will auto-restart Unity
     - `failed_no_tables`: Unity not in table room (Monitor will wait)
     - `failed_exception`: API call failed (check server)
     - `success`: Pause mechanism worked (Unity should be paused)
3. Check `unityStatus.actualStatus`:
   - `STOPPED`: Monitor will auto-restart Unity
   - `IDLE`: Monitor will wait for connection
   - `ACTIVE`: Unity is ready, debugger break should work
4. Fix automatically based on status file information

#### When Issue Detector Fails

**Check status file**:
1. Read `logs/monitor-status.json`
2. Check `issueDetectorStatus`:
   - `ok`: Issue detector is working
   - `failed`: Check `lastIssueDetectorError`
   - `exception`: Check `lastIssueDetectorError`
3. Check `lastIssueDetectorError` for details
4. Fix automatically:
   - If file locked: Monitor will retry automatically
   - If JSON parse error: Check `pending-issues.json` format
   - If Node.js error: Check Node.js installation

### Key Principles for AI Models

1. **Always read `monitor-status.json` first** when user reports problems
2. **Never ask user to check things manually** - status file has everything
3. **Use status file to diagnose automatically** - don't ask user to describe
4. **Fix issues automatically** based on status file information
5. **Monitor handles retries and restarts automatically** - you just need to fix root causes
6. **Status file updates every 5 seconds** - always current
7. **Status file persists** - you can read it anytime, even in new sessions

---

## 🚀 Quick Start

### 1. Kill Any Existing Node Processes
```powershell
# Kill all Node.js processes (servers might still be running)
taskkill /F /IM node.exe 2>$null
```

### 2. Start the Server
```powershell
cd C:\Projects\poker-server
npm start
```

**Wait for:** `Server listening on port 3000` message

### 3. Start Monitoring

**Normal Mode** (default - user creates table manually):
```powershell
.\monitoring\monitor.ps1
# or explicitly:
.\monitoring\monitor.ps1 -Mode normal
```

**Simulation Mode** (fully automated including table creation):
```powershell
.\monitoring\monitor.ps1 -Mode simulation
```

The monitor will:
- Watch `logs/game.log` continuously
- Detect issues automatically with severity-based detection
- Display **real-time statistics dashboard** (updates every 5 seconds)
- Pause Unity when **critical/high** issues are found
- Log issues to `logs/pending-issues.json`
- Track fix attempts and success rates
- Show comprehensive stats: issues by severity, source, patterns, fix attempts

**Automation Features** (both modes):
- ✅ Auto-restart server if needed
- ✅ Auto-restart database (MySQL) if needed
- ✅ Auto-restart Unity if needed (runs in normal visible window)
- ✅ Unity auto-connects to server (via command-line args)
- ✅ Unity auto-logs in (via command-line args)

**Simulation Mode Only**:
- ✅ Unity auto-creates simulation table (handled by Unity)
- ✅ Unity auto-starts simulation (handled by Unity)

**Important**: Unity runs in **normal visible window** - you can watch everything happen. Unity receives command-line args (`-autoMode simulation` or `-autoMode normal`) and handles all automation internally.

**Note:** The server also runs `scripts/watch-logs-and-fix.js` automatically, which is now a **pause/resume service only**. It responds to Monitor's pause/resume markers and handles log maintenance (archiving/clearing when >5MB). It does NOT auto-fix issues.

### 3. When Issue is Found - Complete Workflow

#### Phase 1: Investigation (Gathering Related Issues)

1. **Monitor detects issue** (CRITICAL or HIGH severity)
   - Dashboard shows "INVESTIGATING" status (Yellow)
   - Monitor enters investigation phase (default: 15 seconds, configurable)
   - Gathers related issues during this period
   - Groups related issues together based on:
     - Same tableId
     - Same error pattern/type
     - Same stack trace location
     - Shared keywords (3+ keywords)
     - Similar messages from same source (70%+ similarity)
   - Issue logged to `pending-issues.json` with focused group
   - Statistics updated (issues detected, severity, source)
   
2. **Investigation completes** → Monitor pauses Unity
   - Dashboard status changes to "PAUSED (Fix Required)" (Red)
   - Shows investigation summary:
     - Root issue type and severity
     - Number of related issues found
     - Group ID for tracking
   - Monitor calls `/api/simulation/pause` which sets `table.isPaused = true`
   - Server broadcasts `table_state` event with `isPaused: true`
   - Unity reads `isPaused` from `table_state` and sets `Time.timeScale = 0`
   - Monitor waits for you to review and fix

#### Phase 2: Fix Application

3. **You message assistant**: **"fix this issue"** or **"issue found"**
   
4. **Assistant fixes issues**:
   - Reads `pending-issues.json` to understand the issue
   - Reviews related issues and context
   - Makes code changes to fix the issue
   - **Writes `logs/fix-applied.json`** with:
     ```json
     {
       "groupId": "group_123...",
       "fixedAt": "2026-02-07T...",
       "requiredRestarts": ["server"],  // or ["unity"], ["database"], ["server", "unity"], or []
       "fixDescription": "Fixed pot calculation bug in GameManager.js line 234"
     }
     ```
   - **Does NOT clear `pending-issues.json` yet** (Monitor will do this after verification)

#### Phase 3: Verification (Ensuring Fix Works)

5. **Monitor detects `fix-applied.json`** → Starts verification phase
   - Dashboard status changes to "VERIFYING FIX" (Cyan)
   - Calculates verification period dynamically:
     - Base time: Critical (90s), High (60s), Medium (45s)
     - +15 seconds per required restart
     - +30 seconds for game logic issues (wait for hand cycle)
     - +20 seconds for network issues (wait for reconnection)
   - **Performs required restarts** (if any):
     - Restarts services in order: database → server → Unity
     - Waits for each service to be ready (max 60s timeout)
   - **Waits for services to be ready** before starting verification
   - **Starts monitoring logs** for the exact issue pattern:
     - Matches same `type`, `source`, and `tableId` (if applicable)
     - If pattern reappears → Fix failed
     - If pattern doesn't reappear during full period → Fix confirmed

6. **Verification result**:

   **If Fix Confirmed** (issue doesn't reappear):
   - Monitor shows: "VERIFICATION PASSED: Issue did not reappear"
   - Clears `fix-applied.json`
   - Clears `pending-issues.json` (moves to next queued issue if any)
   - Dashboard status returns to "ACTIVE" (Green)
   - Monitor continues automatically
   
   **If Fix Failed** (issue reappears):
   - Monitor shows: "VERIFICATION FAILED: Issue reappeared"
   - Records fix attempt in `pending-issues.json` with:
     - What was tried
     - What restarts were done
     - Failure reason
     - New logs showing issue
     - Insights for next attempt
   - Clears `fix-applied.json`
   - **Re-enters investigation mode** (does NOT move to next issue)
   - Waits for you to prompt assistant again with more context

#### Phase 4: Next Issue (Only After Current is Resolved)

7. **Monitor only moves to next issue when current is fully resolved**:
   - Queued issues remain queued until current investigation is complete
   - If verification fails, Monitor stays focused on current issue
   - Only when verification passes does Monitor move to next queued issue
   - If no queued issues, Monitor waits for next issue detection

**Key Points:**
- ✅ **Investigation phase** gathers related issues before pausing
- ✅ **Fix verification** ensures fixes actually work before moving on
- ✅ **Never moves to next issue** until current is fully resolved
- ✅ **Fix attempt tracking** helps understand what didn't work
- ✅ **Automatic restarts** handled by Monitor during verification

---

## ⚙️ Configuration

Monitor uses `monitoring/monitor-config.json` for all settings. Edit this file to configure:

### Configuration File Structure

```json
{
  "mode": "simulation",
  "automation": {
    "autoRestartServer": true,
    "autoRestartDatabase": true,
    "autoRestartUnity": true,
    "autoConnectUnity": true,
    "autoLogin": true
  },
  "unity": {
    "executablePath": "C:\\Program Files\\Unity\\Hub\\Editor\\6000.3.4f1\\Editor\\Unity.exe",
    "projectPath": "C:\\Projects\\poker-client-unity",
    "autoConnectOnStartup": true,
    "serverUrl": "http://localhost:3000",
    "pauseDebuggerOnIssue": true,
    "comment": "pauseDebuggerOnIssue: If true, Unity will pause when investigation completes. Monitor calls /api/simulation/pause which sets table.isPaused=true. Unity reads isPaused from table_state event and sets Time.timeScale=0"
  },
  "login": {
    "username": "monitor_user",
    "password": "monitor_pass",
    "comment": "Password can be set via environment variable MONITOR_PASSWORD for security (overrides this value)"
  },
  "simulation": {
    "enabled": true,
    "tableName": "Auto Simulation",
    "maxPlayers": 9,
    "startingChips": 10000,
    "smallBlind": 50,
    "bigBlind": 100,
    "autoStartSimulation": true,
    "itemAnteEnabled": true,
    "comment": "itemAnteEnabled: If true, enables item ante (For Keeps) system for monitor-created simulation tables"
  },
  "investigation": {
    "enabled": true,
    "timeoutSeconds": 15,
    "comment": "Investigation phase: Monitor waits this many seconds to gather related issues before pausing debugger. Set to 0 to pause immediately."
  }
}
```

### Important Configuration Notes

1. **Unity Executable Path**: Must point to the correct Unity version installed on your system. Monitor will check if the path exists before starting Unity.

2. **Auto-Login Credentials**: 
   - Default username: `monitor_user`
   - Default password: `monitor_pass`
   - The user `monitor_user` is automatically created in the database on first run
   - For security, you can set `MONITOR_PASSWORD` environment variable instead of storing password in config

3. **Server URL**: Use `http://localhost:3000` for local development, or your server's IP address for remote connections.

4. **Pause on Issue** (`pauseDebuggerOnIssue`):
   - Default: `true`
   - If enabled, Unity will pause when investigation completes
   - Monitor calls `/api/simulation/pause` which sets `table.isPaused = true`
   - Server broadcasts `table_state` event with `isPaused: true`
   - Unity reads `isPaused` from `table_state` event and sets `Time.timeScale = 0`
   - Works even without debugger attached (more reliable than `Debug.Break()`)
   - Set to `false` to disable automatic pausing
   - **UPDATED (2026-02-07)**: Changed from `/api/debugger/break` (deprecated) to `/api/simulation/pause` for more reliable pausing

5. **Investigation Phase** (`investigation`):
   - `enabled`: Default `true` - Enable investigation phase before pausing
   - `timeoutSeconds`: Default `15` - Seconds to gather related issues before pausing
   - Set `timeoutSeconds: 0` to pause immediately (skip investigation)
   - During investigation, Monitor groups related issues together
   - Investigation completes → Monitor pauses debugger and shows summary
   - **Completion Check**: Uses script variables as primary source, status file as fallback
   - **Safety Check**: Automatically completes if investigation runs 2x timeout (prevents stuck investigations)
   - **Elapsed Time Check**: Primary completion trigger (more reliable than status file `timeRemaining`)

---

## 🤖 Unity Auto-Mode Implementation

Monitor passes command-line arguments to Unity, and Unity handles all automation internally. Unity runs in a **normal visible window** so you can watch everything happen.

### Unity Auto-Start Play Mode

Unity automatically enters play mode when started by the monitor via an Editor script (`Assets/Scripts/Editor/AutoPlayMode.cs`) that uses `[InitializeOnLoad]`. This means:
- Unity Editor starts normally
- Automatically enters play mode when the project loads
- No manual intervention needed
- Debugger can attach normally

### Command-Line Arguments Unity Receives

When Monitor starts Unity, it passes:
- `-projectPath [path]` - Unity project path
- `-debugCodeOptimization` - Enables debugger attachment
- `-autoMode [simulation|normal]` - Automation mode
- `-serverUrl [url]` - Server URL for auto-connect
- `-autoLogin [username]` - Username for auto-login
- `-autoPassword [password]` - Password for auto-login (if configured)

### Scene Backup Cleanup

Monitor automatically cleans up Unity backup files before starting Unity to prevent dialog prompts that would block automatic startup. Backup files in `[Project]/Temp/` are removed automatically.

### What Unity Needs to Implement

**1. Command-Line Argument Parsing:**
```csharp
// In Unity startup code (e.g., GameManager or NetworkManager)
string[] args = Environment.GetCommandLineArgs();
string autoMode = GetCommandLineArg(args, "-autoMode"); // "simulation" or "normal"
string serverUrl = GetCommandLineArg(args, "-serverUrl");
string autoLogin = GetCommandLineArg(args, "-autoLogin");
string autoPassword = GetCommandLineArg(args, "-autoPassword");
```

**2. Auto-Connect on Startup:**
```csharp
if (!string.IsNullOrEmpty(serverUrl)) {
    ConnectToServer(serverUrl);
}
```

**3. Auto-Login:**
```csharp
if (!string.IsNullOrEmpty(autoLogin)) {
    Login(autoLogin, autoPassword);
}
```

**4. Auto-Create Table (Simulation Mode Only):**
```csharp
if (autoMode == "simulation") {
    // Wait for login to complete
    OnLoginSuccess += () => {
        CreateSimulationTable(new TableConfig {
            name = "Auto Simulation",
            maxPlayers = 9,
            startingChips = 10000,
            smallBlind = 50,
            bigBlind = 100,
            isSimulation = true
        });
    };
}
```

**5. Auto-Start Simulation (Simulation Mode Only):**
```csharp
if (autoMode == "simulation") {
    OnTableCreated += (tableId) => {
        StartSimulation(tableId);
    };
}
```

**6. Normal Mode:**
```csharp
if (autoMode == "normal") {
    // Auto-connect and auto-login, but wait for user to create table
    // User creates table manually, then plays normally
}
```

**7. Table State Pause Handler (Required - if pauseDebuggerOnIssue is enabled):**
```csharp
// Listen for table_state event from server
_socket.On("table_state", (data) => {
    var state = data.GetValue<TableState>();
    if (state.isPaused && !_isPaused) {
        _isPaused = true;
        Time.timeScale = 0f; // Pauses all time-based updates
        Debug.Log($"[MONITOR] Game paused: {state.pauseReason}");
    } else if (!state.isPaused && _isPaused) {
        _isPaused = false;
        Time.timeScale = 1f; // Resumes game
        Debug.Log("[MONITOR] Game resumed");
    }
});
```

### Benefits of This Approach

- ✅ **Unity runs normally** - Visible window, you can watch everything
- ✅ **Uses existing code** - Same socket events as normal gameplay
- ✅ **Easy to debug** - All logic in Unity, can step through code
- ✅ **No new APIs needed** - Uses existing `create_table` and `start_simulation` events
- ✅ **Realistic testing** - Unity acts exactly like a real player/bot

### Monitor's Role

Monitor just:
1. Restarts Unity with command-line args if needed
2. Watches logs and fixes issues (same as always)
3. Unity handles all the automation internally

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

The system tracks fix attempts at two levels:

### 1. Fix Method Tracking (Historical)
- **Tracks**: Attempts, failures, successes per fix method
- **Disables**: Fix methods after 5 failures (forces different approach)
- **Stores**: Statistics in `fix-attempts.txt`
- **Logs**: All attempts to `logs/game.log` with `[FIX_ATTEMPT]` prefix

### Fix ID Format
- `FIX_1_POT_NOT_CLEARED` - Pot not cleared issue
- `FIX_2_CHIPS_LOST_BETTING` - Chips lost during betting
- `FIX_66_TIMER_CLEARED_AT_ACTION_START` - Timer cleared on action
- And 70+ more fix IDs

### 2. Investigation Fix Attempt Tracking (New)
- **Tracks**: Fix attempts per investigation group in `pending-issues.json`
- **Records**: What was tried, restarts done, failure reason, insights
- **Purpose**: Helps assistant understand what didn't work for next attempt
- **Structure**: Each focused group has `fixAttempts` array:
  ```json
  {
    "focusedGroup": {
      "id": "group_123...",
      "rootIssue": {...},
      "relatedIssues": [...],
      "fixAttempts": [
        {
          "attemptNumber": 1,
          "timestamp": "2026-02-07T...",
          "fixDescription": "Fixed pot calculation in GameManager.js",
          "requiredRestarts": ["server"],
          "restartsCompleted": ["server"],
          "verificationPeriod": 90,
          "result": "failed",
          "failureReason": "Issue reappeared after 45 seconds",
          "newLogs": ["[2026-02-07...] POT MISMATCH detected again..."],
          "insights": "Fix didn't address root cause - pot still not cleared between hands"
        }
      ]
    }
  }
  ```

### Benefits
- **Prevents repeated failures**: Assistant can see what was tried before
- **Provides context**: Failure reasons and insights guide next attempt
- **Tracks progress**: Each investigation can have multiple fix attempts
- **Never gives up**: System stays focused until issue is resolved

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
   - Current status:
     - **ACTIVE** (Green) - Monitoring normally
     - **INVESTIGATING** (Yellow) - Gathering related issues
     - **VERIFYING FIX** (Cyan) - Verifying fix after restarts
     - **PAUSED (Fix Required)** (Red) - Debugger paused, waiting for fix
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

## 🔄 Complete Workflow Diagram

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
         │ Issue detected (CRITICAL/HIGH)
         ▼
┌─────────────────────────┐
│ INVESTIGATION PHASE     │
│ (15 seconds default)    │
│ - Gather related issues │
│ - Group by pattern      │
│ - Log to pending-issues  │
└─────────────────────────┘
         │
         │ Investigation complete
         ▼
┌─────────────────────────┐
│ PAUSE DEBUGGER          │
│ - Call Debug.Break()    │
│ - Status: PAUSED        │
│ - Show investigation    │
│   summary               │
└─────────────────────────┘
         │
         │ User: "fix this issue"
         ▼
┌─────────────────────────┐
│ ASSISTANT FIXES         │
│ - Reads pending-issues  │
│ - Reviews context       │
│ - Fixes code            │
│ - Writes fix-applied.json│
│   (with requiredRestarts)│
└─────────────────────────┘
         │
         │ Monitor detects fix-applied.json
         ▼
┌─────────────────────────┐
│ VERIFICATION PHASE      │
│ - Calculate period      │
│ - Restart services      │
│ - Wait for ready        │
│ - Monitor logs for      │
│   issue pattern         │
└─────────────────────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌─────────┐ ┌─────────┐
│ PASSED  │ │ FAILED  │
│         │ │         │
│ Clear   │ │ Record  │
│ files   │ │ attempt │
│ Move to │ │ Re-enter│
│ next    │ │ invest. │
└─────────┘ └─────────┘
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
1. **Server starts** → Automatically runs `scripts/watch-logs-and-fix.js` (handles Unity pause/resume)
2. **Monitor watches** `logs/game.log` continuously
3. **Detects issues** using patterns + root tracing
4. **Pauses Unity** automatically (via server's log watcher), logs to `pending-issues.json`
5. **You message assistant**: "issue found"
6. **Assistant fixes**:
   - Reads `pending-issues.json`
   - Fixes all issues
   - Clears `pending-issues.json`
   - Kills Node processes (`taskkill /F /IM node.exe`)
   - Restarts server (`npm start`)
   - Unity resumes automatically
7. **Monitor continues** automatically

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
5. **Log clearing strategy** - Logs are archived (not deleted) when >5MB, preserving history
6. **Fix attempts tracked** - Prevents infinite retry loops
7. **Unity auto-pauses** - When critical issues detected (via `scripts/watch-logs-and-fix.js`)
8. **Assistant fixes** - You just message "issue found", assistant does the rest
9. **Server restart process** - Always kill Node processes first (`taskkill /F /IM node.exe`) before restarting
10. **Restart handling** - See "Restart Scenarios" section below for different restart requirements

---

## 🔄 Restart Scenarios

When fixes require restarts, here's what happens:

### Current Behavior

**Server Restart (Node.js code changes):**
- ✅ **Handled automatically** by Assistant:
  1. Assistant kills Node processes: `taskkill /F /IM node.exe`
  2. Assistant restarts server: `npm start`
  3. Server auto-resumes paused simulations on startup (see `src/server.js` line 52-63)
  4. Unity reconnects automatically (Socket.IO handles reconnection)
  5. Monitor detects resume marker → Unity resumes

**Unity Restart (Unity code changes or disconnection):**
- ✅ **Automatically handled** by Monitor:
  1. Unity is paused (via Log Watcher) if issue detected
  2. Monitor automatically restarts Unity if not running or disconnected
  3. Unity automatically enters play mode and reconnects to server
  4. Unity auto-connects and auto-logs in using command-line arguments
  5. Server state is preserved (tables, players, chips)
  6. Simulation resumes from where it paused (if resume marker is written)

**Database Restart (MySQL/WAMP/XAMPP):**
- ✅ **Automatically handled** by Monitor (if `autoRestartDatabase` is enabled in config):
  1. Monitor detects MySQL service is not running
  2. Monitor automatically restarts MySQL service
  3. Server will reconnect automatically when database is back
  4. Unity remains paused until you tell Assistant to resume (if paused due to issue)

### What Happens During Restart

**Server Restart:**
- ✅ Paused simulations are **auto-resumed** on server startup
- ✅ Unity **reconnects automatically** (Socket.IO reconnection)
- ✅ Game state is **preserved** (tables, players, chips in memory)
- ⚠️ Active WebSocket connections are **dropped** (Unity reconnects)

**Unity Restart:**
- ✅ Server state is **preserved** (tables, players, chips)
- ✅ Unity **reconnects automatically** when restarted
- ✅ Unity **automatically enters play mode** via InitializeOnLoad Editor script
- ✅ Unity **auto-connects and auto-logs in** using command-line arguments
- ⚠️ Simulation remains **paused** until resume marker is written
- ✅ Monitor automatically restarts Unity if not running or disconnected (no manual intervention needed)

**Database Restart:**
- ✅ Server detects database offline and logs errors
- ✅ Monitor **automatically restarts MySQL service** if `autoRestartDatabase` is enabled
- ✅ Server **auto-reconnects** when database is back
- ⚠️ Unity remains **paused** during database downtime (if paused due to issue)

### Completed Automation Features ✅

**Service Restart Automation:**
- ✅ **Server Restart**: Monitor automatically restarts server if offline
- ✅ **Database Restart**: Monitor automatically restarts MySQL service if offline
- ✅ **Unity Restart**: Monitor automatically restarts Unity if not running or disconnected
- ✅ **Service Health Checks**: Monitor checks all services every 30 seconds

**Unity Automation:**
- ✅ **Auto-Start Play Mode**: Unity automatically enters play mode via `InitializeOnLoad` Editor script
- ✅ **Auto-Connect**: Unity receives `-serverUrl` command-line arg and auto-connects
- ✅ **Auto-Login**: Unity receives `-autoLogin` and `-autoPassword` args for auto-login
- ✅ **Auto-Mode**: Unity receives `-autoMode simulation` or `-autoMode normal` for automation
- ✅ **Scene Backup Cleanup**: Monitor automatically removes Unity backup files to prevent dialog prompts
- ✅ **Debugger Support**: Unity starts with `-debugCodeOptimization` flag for debugger attachment
- ✅ **Debugger Pause on Issue**: Monitor can trigger `Debug.Break()` in Unity when critical issues are detected (configurable via `pauseDebuggerOnIssue`)

**Grace Periods and Cooldowns:**
- ✅ **Unity Startup Grace Period**: 45 seconds after Unity starts before checking for connections (allows time for play mode, initialization, connection, login)
- ✅ **Server Restart Cooldown**: 60 seconds after server restart - Unity restarts and orphaned simulation checks are skipped during this period
- ✅ **Connection Attempt Detection**: Monitor checks for recent connection attempts in logs (within 30 seconds) before restarting Unity

### Future Enhancements (Optional)

1. **Fix Confirmation Enhancement:**
   - Currently uses time-based confirmation (10 seconds)
   - Could add pattern absence checks (verify error patterns don't reappear)
   - Could add success indicators (check for positive confirmation patterns in logs)

2. **State Preservation:**
   - Server could save table state to database before restart
   - Server could restore table state after restart
   - Unity could save local state before restart

3. **Advanced Unity Detection:**
   - Monitor could detect when Unity needs restart due to code changes
   - Monitor could display: "Unity restart required - code changes detected"

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

### Unity not starting?
- **Check Unity executable path**: Verify `monitor-config.json` has correct path to Unity.exe
- **Check Unity version**: Ensure the version in the path matches your installed Unity version
- **Check project path**: Verify `projectPath` in config points to your Unity project
- **Check for dialogs**: Unity may be waiting for user input (scene backup dialog, etc.) - Monitor cleans these up automatically
- **Check logs**: Look for "Unity not running, starting..." messages in monitor output

### Unity stuck at login?
- **Check user exists**: The `monitor_user` account is created automatically, but verify it exists in database
- **Check password**: Verify password in `monitor-config.json` matches the database password
- **Check environment variable**: If using `MONITOR_PASSWORD`, ensure it's set: `$env:MONITOR_PASSWORD = "your_password"`
- **Check server logs**: Look for login attempts and errors in `game.log`

### Server restart loops?
- **Check cooldown**: Monitor has a 60-second cooldown after server restart - wait for it to complete
- **Check health checks**: Server health checks respect the cooldown period
- **Check orphaned simulations**: Orphaned simulation detection also respects the cooldown

### Orphaned simulations not being stopped?
- **Check health endpoint**: Monitor uses server's `/health` endpoint for actual simulation count
- **Check API calls**: Monitor calls `/api/simulations/stop-all` to stop orphaned simulations
- **Check process killing**: If API fails, monitor kills processes on port 3000 and all Node.js processes
- **Check logs**: Look for "orphaned simulation" messages and API call results

---

## 📚 Related Systems

- **`scripts/watch-logs-and-fix.js`** - Server-side log watcher (runs automatically with server)
  - **Built into server**: Initialized in `src/server.js` line 19 & 222
  - **Runs automatically**: No manual start required
  - Handles Unity pause/resume
  - Clears logs when >5MB (archives first)
  - Active monitoring for simulation detection
  - **Integrates with monitor**: Detects markers written by `monitor.ps1`
  - **Pattern sharing**: Uses `ERROR_PATTERNS` array (similar to monitor's patterns)
  - **To update patterns**: Edit `scripts/watch-logs-and-fix.js` → `ERROR_PATTERNS` array
- **`src/game/Table.js`** - Root tracing system (`_traceUniversal`)
- **`src/utils/GameLogger.js`** - Centralized logging system
- **`fix-attempts.txt`** - Fix attempt statistics
- **`logs/archived/`** - Archived logs (created when log >5MB)

## 📋 Quick Reference for Assistant (Fresh Session)

**When user says "issue found" or starts a new session:**

1. **Read pending issues:**
   ```powershell
   Get-Content logs/pending-issues.json
   ```

2. **Check fix attempts:**
   ```powershell
   Get-Content fix-attempts.txt
   ```

3. **Review recent logs:**
   ```powershell
   Get-Content logs/game.log -Tail 100
   ```

4. **After fixing, restart server:**
   ```powershell
   taskkill /F /IM node.exe 2>$null
   npm start
   ```

5. **Clear pending issues (after fix):**
   ```powershell
   node monitoring/issue-detector.js --clear
   ```

**Key Files to Check:**
- `logs/pending-issues.json` - Current issues waiting for fix
- `logs/game.log` - All logs (check for `[ISSUE_DETECTED]`, `[FIX_ATTEMPT]`, `[WORKFLOW]`)
- `fix-attempts.txt` - Fix attempt statistics
- `logs/archived/` - Archived logs (if log was cleared)

**Important Workflows:**
- **Log Clearing:** Logs are archived (not deleted) when >5MB. Check `logs/archived/` for history.
- **Unity Pause/Resume:** Handled automatically by `scripts/watch-logs-and-fix.js` (runs with server)
- **Active Monitoring:** Server automatically detects new simulations and reports status every 10 seconds

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

## 🔧 System Adjustability

The logging system is **highly adjustable and easy to modify**.

**IMPORTANT**: Both the monitor and log watcher use error patterns. When adding/updating patterns, you should update **both systems** to keep them in sync:

1. **Monitor patterns** (`monitoring/issue-detector.js`):
   - Edit `errorPatterns` object (organized by severity: critical, high, medium, low)
   - More comprehensive with severity mapping
   - Used by `monitor.ps1` for detection

2. **Log watcher patterns** (`scripts/watch-logs-and-fix.js`):
   - Edit `ERROR_PATTERNS` array (flat array)
   - Simpler format, used for Unity pause/resume
   - Must include monitor marker pattern: `/\[MONITOR\].*\[CRITICAL_ISSUE_DETECTED\]/i`

### Adding New Error Patterns

**For Monitor** - Edit `monitoring/issue-detector.js`:
```javascript
this.errorPatterns = {
    critical: [
        /YOUR_NEW_PATTERN/i,  // Add here
        // ... existing patterns
    ]
};
```

**For Log Watcher** - Edit `scripts/watch-logs-and-fix.js`:
```javascript
const ERROR_PATTERNS = [
    /YOUR_NEW_PATTERN/i,  // Add here
    // ... existing patterns
];
```

**Best Practice**: Add the pattern to both files with the same regex to ensure consistent detection.

### Changing Pattern Severity

**For Monitor** - Move patterns between severity levels in `monitoring/issue-detector.js`:
```javascript
// Move from 'high' to 'critical':
// Cut from high: []
// Paste to critical: []
```

**For Log Watcher** - Patterns are in a flat array, so severity is determined by when they're detected (critical patterns checked first).

### Modifying Detection Logic

**For Monitor** - Edit `monitoring/issue-detector.js` → `detectIssue()` method:
```javascript
detectIssue(logLine) {
    // Add your custom detection here
    if (customCheck(logLine)) {
        return this.createIssue('error', 'critical', logLine, 'server');
    }
    // ... existing detection
}
```

**For Log Watcher** - Edit `scripts/watch-logs-and-fix.js` → `detectIssue()` function:

Both systems have similar detection logic but are independent. Changes to one don't automatically affect the other.

### Adjusting Statistics Display
Edit `monitoring/monitor.ps1`:
- Change `$statsUpdateInterval` for refresh rate
- Modify `Show-Statistics()` for different metrics
- Add new stat tracking in the main loop

**No compilation needed** - Just edit and restart!

---

## 🎮 GPU Acceleration (Optional Enhancement)

**Question:** Can we use GPU power to find issues that are hard to detect?

**Answer:** Yes! GPU can help with advanced analysis, but it's best as an **optional enhancement** for batch analysis, not real-time monitoring.

### What GPU Can Do Better

1. **Batch Log Analysis** (Best Use Case)
   - Analyze entire log history (millions of lines) in seconds
   - Find patterns across multiple sessions
   - Identify recurring issues

2. **Anomaly Detection**
   - Find unusual patterns we haven't defined
   - Detect subtle issues like gradual performance degradation
   - Learn "normal" vs "abnormal" behavior

3. **Correlation Analysis**
   - Link related events across time
   - Example: "Every time X happens, Y follows 30 seconds later"
   - Find root causes that aren't obvious

4. **Pattern Learning**
   - Learn from past fixes
   - Suggest new patterns automatically
   - Improve detection over time

### Implementation Options

**Option 1: GPU.js (JavaScript)**
- Pure JavaScript, easy integration
- Best for parallel pattern matching
- Use case: Batch log analysis

**Option 2: Python + CUDA**
- Full GPU power, ML capabilities
- Best for anomaly detection
- Use case: Complex analysis, ML models

**Option 3: Hybrid (Recommended)**
- GPU.js for batch analysis
- Python for ML-based detection
- Best of both worlds

### Recommendation

**Start Simple:**
- Keep real-time monitoring as-is (already fast enough)
- Add GPU as **optional batch analyzer** for deep log analysis
- Use when investigating complex issues or analyzing large logs

**See `monitoring/GPU_ACCELERATION.md` for detailed GPU implementation guide.**

---

## 📄 Additional Documentation

- **`monitoring/GPU_ACCELERATION.md`** - GPU acceleration guide (optional enhancement)
- **`monitoring/LOG_CLEARING_STRATEGY.md`** - Log clearing strategy and archiving details

---

---

## 📋 Recent Changes (2026-02-06)

### Fixed Issues:
1. **False positives before Unity starts**: Monitor now skips internal logs (`[LOG_WATCHER]`, `[STATUS_REPORT]`, `[ACTIVE_MONITORING]`, `[WORKFLOW]`, `[FIX_ATTEMPT] SUCCESS`)
2. **Stats dashboard scrolling**: Stats now stay fixed at top (line 0), updates in place, no scrolling
3. **Console output overlapping stats**: Console output now writes below stats (line 25+), no overlap
4. **Screen flashing**: Stats updates are paused when console output is written (prevents flashing)
5. **`[ROOT_TRACE]` logs being skipped**: Monitor now detects `[ROOT_TRACE]` errors (important error indicators)
6. **Monitor not reporting**: Added console output showing issues detected, table ID, pause marker status
7. **Unity not pausing**: Monitor writes pause markers to `game.log`, log watcher detects them and pauses Unity

### Current Features:
- **Real-time stats dashboard**: Fixed at top (line 0), shows detection stats, issues by severity/source, fix attempts, pause markers
- **Console reporting**: Shows issues detected in real-time below stats dashboard (line 25+)
- **Auto-start/restart server**: Monitor automatically starts and restarts server if offline
- **Pause marker tracking**: Shows how many pause markers were written, errors if any
- **No scrolling**: Stats stay at top, console output below, no overlapping or flashing
- **Issue detection**: Detects `[ROOT_TRACE]` errors (like `PLAYER_WON_MORE_THAN_CONTRIBUTED`)

### Display Layout:
```
[Stats Dashboard - Fixed at Top - Line 0]
+==============================================================================+
| Status, Uptime, Server, Detection Stats, Issues by Severity, etc.
+==============================================================================+

[Console Output Area - Below Stats - Line 25+]
[HH:mm:ss] ISSUE DETECTED: [type] ([severity])
  Message: [preview]
  Table ID: [tableId]
  Pause marker written to game.log
  Waiting for log watcher to pause Unity...
```

---

## 🆕 Latest Features (2026-02-07)

### Investigation Phase
- Monitor gathers related issues before pausing (15 seconds default, configurable)
- Groups related issues by pattern, tableId, stack trace, keywords
- Shows investigation summary when complete
- Queues unrelated issues until current investigation is resolved
- **Robust Completion Check** (2026-02-07):
  - Uses script variables as primary source of truth (more reliable)
  - Falls back to status file if script variables not set
  - Elapsed time calculation is primary completion trigger
  - Safety check forces completion if investigation runs 2x timeout
  - Works even if status file read fails

### Fix Verification System
- Monitor verifies fixes actually work before moving on
- Automatic service restarts during verification
- Dynamic verification period based on severity, restarts, issue type
- Pattern-based verification (exact match: type, source, tableId)
- Fix attempt tracking in investigations (what was tried, what failed, insights)

### Never Moves to Next Issue Until Resolved
- Monitor stays focused on current investigation until verification passes
- Queued issues remain queued until current is fully resolved
- If verification fails, Monitor re-enters investigation mode
- Fix attempts are recorded to help understand what didn't work

### Unity Pause Mechanism (2026-02-07)
- Monitor calls `/api/simulation/pause` endpoint (replaces deprecated `/api/debugger/break`)
- Server sets `table.isPaused = true` and broadcasts table state
- Unity reads `isPaused` from `table_state` event and sets `Time.timeScale = 0`
- More reliable than `Debug.Break()` approach (works even without debugger attached)
- Falls back to old method if new endpoint fails

### Investigation Completion Check Improvements (2026-02-07)
- **Prioritizes Script Variables**: Completion check uses script variables as primary source, not status file
- **Elapsed Time Primary**: Elapsed time calculation is the primary completion trigger (more reliable)
- **Status File Fallback**: Falls back to status file if script variables not set
- **Safety Check**: Automatically completes if investigation runs 2x timeout (30s for 15s timeout)
- **Forced Completion**: If status file shows investigation active for 2x timeout but script variables are out of sync, forces completion
- **TimeRemaining Check**: Also checks `timeRemaining <= 0` from status file as completion trigger
- **Robust Error Handling**: Works even if status file read fails
- **Better Diagnostics**: All completion check logic logged to `logs/monitor-diagnostics.log`
- **Prevents Stuck Investigations**: Multiple completion triggers ensure investigation always completes

---

**Last Updated**: 2026-02-07
**Version**: 2.2.0
**Status**: Complete with Investigation Phase, Fix Verification System, Fix Attempt Tracking, Robust Completion Checks, Unity Pause Improvements, and All Previous Features

### Recent Fixes (2026-02-07)

**Investigation Completion Check Fixes**:
- Fixed investigation getting stuck by prioritizing script variables over status file
- Added safety check to force completion if investigation runs 2x timeout
- Made elapsed time calculation the primary completion trigger
- Added forced completion check for `timeRemaining <= 0` when script variables are out of sync
- Improved error handling for status file reads
- Added comprehensive diagnostic logging to `logs/monitor-diagnostics.log`
- Completion check now works even if status file read fails

**Investigation Completion - Get-PendingIssuesInfo Fallback (2026-02-07)**:
- Added fallback to read `pending-issues.json` directly if `Get-PendingIssuesInfo` returns false
- Prevents Unity from not pausing when investigation completes due to function returning incorrect values
- Ensures focused group is always detected even if function has timing/parsing issues
- Similar fallback logic already existed in investigation start - now also in completion

**Investigation Start Logic - Unity Pause Check (2026-02-07)**:
- Fixed issue where new investigations would start even when Unity is paused
- Now checks both local `$isPaused` variable AND status file's `paused` field
- Prevents investigation loop when Unity is waiting for fix to be applied
- Ensures monitor waits for `fix-applied.json` before starting new investigations

**Unity Pause Mechanism Update (2026-02-07)**:
- Changed from `/api/debugger/break` (deprecated) to `/api/simulation/pause`
- New endpoint sets `table.isPaused = true` and broadcasts table state
- Unity reads pause state from `table_state` event instead of `debugger_break` event
- More reliable - works even without debugger attached
- Falls back to old method if new endpoint fails
