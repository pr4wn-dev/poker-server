# Unity & Server Lifecycle Management

## Current Status

### ✅ Server Lifecycle Management
- **Graceful Shutdown**: Handles SIGTERM and SIGINT signals
- **Cleanup**: Closes HTTP server and Socket.IO connections
- **Location**: `src/server.js` lines 432-443

### ⚠️ Unity Lifecycle Management
- **No Built-in Cleanup**: Unity process is killed by PowerShell but Unity itself doesn't have cleanup hooks
- **Process Management**: PowerShell manages Unity process lifecycle
- **Crash Detection**: Checks if process is responding

### ⚠️ Restart Loop Prevention (BEFORE FIX)
- **Server**: 60-second cooldown (fixed)
- **Unity**: 90-second grace period (fixed)
- **No Max Attempts**: Could restart infinitely
- **No Exponential Backoff**: Fixed cooldown periods

## Issues Identified

1. **Infinite Restart Loops**: No max restart attempts
2. **No Exponential Backoff**: Fixed cooldown periods don't scale
3. **No Crash Detection**: Only checks if process exists, not if it's healthy
4. **No Unity Cleanup**: Unity process killed without graceful shutdown
5. **No Server Cleanup Tracking**: Server restarts don't track success/failure

## Fixes Applied

### 1. **Restart Attempt Tracking** ✅
- Track consecutive restart attempts for both Unity and server
- Reset counter after 5 minutes of stability
- Max 5 attempts before backing off

### 2. **Exponential Backoff** ✅
- Server: 60s → 120s → 240s → 480s (max)
- Unity: 60s → 120s → 240s → 480s (max)
- Prevents restart storms

### 3. **Crash Detection** ✅
- Checks if Unity process is responding (not just existing)
- Detects hung/crashed processes
- Location: `Get-UnityActualStatus()` checks `process.Responding`

### 4. **Success Tracking** ✅
- Resets restart counter when Unity/server successfully starts
- Tracks last restart time for cooldown calculations
- Prevents false positives

## Remaining Gaps

### 1. **Unity Cleanup Hooks** ❌
- Unity doesn't have cleanup code to run on shutdown
- Process is killed forcefully
- **Recommendation**: Add Unity cleanup script/component

### 2. **Server Cleanup Verification** ⚠️
- Server has graceful shutdown but no verification it completed
- **Recommendation**: Add shutdown verification

### 3. **Crash Recovery** ⚠️
- Detects crashes but doesn't analyze crash logs
- **Recommendation**: Add crash log analysis

### 4. **Health Monitoring** ⚠️
- Basic health checks but no deep health monitoring
- **Recommendation**: Add comprehensive health checks
