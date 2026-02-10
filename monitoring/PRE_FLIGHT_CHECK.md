# Pre-Flight Check System

## Overview

The Pre-Flight Check System runs **BEFORE** BrokenPromise starts to ensure all systems are ready. It uses the learning system to detect and fix issues automatically, preventing errors during startup.

## When It Runs

1. **Before BrokenPromise loads** - Runs as part of bootstrap check
2. **Uses learning system** - Queries database for known issues and fixes
3. **Automatic fixes** - Attempts to fix issues automatically when possible
4. **Blocks startup** - Prevents BrokenPromise from starting if critical issues are found

## Checks Performed

### 1. Node.js Version
- Checks Node.js version >= 18
- **Fix**: Update Node.js if too old

### 2. Required Files
- Verifies all critical files exist:
  - `monitoring/BrokenPromise.ps1`
  - `monitoring/BrokenPromiseIntegration.ps1`
  - `monitoring/integration/BrokenPromise-integration.js`
  - `monitoring/integration/BrokenPromise-integration-http.js`
  - `monitoring/core/AIMonitorCore.js`
  - `monitoring/core/DatabaseManager.js`
  - `src/server.js`
  - `.env`
- **Fix**: Run `git pull` to sync repository

### 3. Logs Directory
- Checks if `logs/` directory exists
- **Auto-Fix**: Creates directory automatically if missing

### 4. NPM Dependencies
- Verifies `package.json` exists
- Verifies `node_modules/` exists
- Checks critical dependencies: `express`, `socket.io`, `mysql2`, `dotenv`
- **Fix**: Run `npm install`

### 5. Database Connection
- Tests MySQL connection
- Verifies database is accessible
- **Fix**: Ensure MySQL is running (WAMP/XAMPP) and credentials are correct in `.env`

### 6. Unity Path
- Checks `BrokenPromise-config.json` exists
- Verifies `unity.executablePath` is configured
- Verifies Unity executable exists at configured path
- **Fix**: Update `unity.executablePath` in config file

### 7. Port Availability
- Checks if ports 3000 (server) and 3001 (integration server) are available
- **Fix**: Kill processes using ports or restart computer

## Learning System Integration

### How It Works

1. **Loads Learning Patterns**: Queries `learning_patterns` and `learning_misdiagnosis_patterns` tables
2. **Matches Issues**: Compares detected issues with known patterns
3. **Provides Solutions**: Shows solutions from learning system with success rates
4. **Warns About Misdiagnosis**: Shows what NOT to do based on past failures
5. **Auto-Fixes**: Attempts automatic fixes when possible

### Example Output

```
  [CHECK] Database Connection... [FAIL]
      Error: Connection refused
      [LEARNING SYSTEM] Known issue: database_connection_error
      [LEARNING SYSTEM] Frequency: 15 occurrences
      [LEARNING SYSTEM] Success rate: 95.0%
      [LEARNING SYSTEM] Solution: Ensure MySQL is running (WAMP/XAMPP) and database credentials are correct in .env
      [LEARNING SYSTEM] ⚠️  AVOID: Assuming database is broken, reinstalling MySQL
      [LEARNING SYSTEM] Time saved: 1800s
      [AUTO-FIX] Attempting fix... [MANUAL FIX REQUIRED]
```

## Automatic Fixes

Currently supports automatic fixes for:

1. **Logs Directory**: Creates `logs/` directory if missing
2. **Other fixes**: Manual intervention required (but learning system provides guidance)

## Usage

### Manual Run
```bash
node monitoring/scripts/pre-flight-check.js
```

### Automatic Run
Runs automatically when starting BrokenPromise:
```powershell
.\monitoring\BrokenPromise.ps1
```

### Skip Pre-Flight Check
```powershell
.\monitoring\BrokenPromise.ps1 -SkipBootstrap
```
⚠️ **Not recommended** - May cause errors during startup

## Exit Codes

- **0**: All checks passed - safe to start BrokenPromise
- **1**: Checks failed - fix issues before starting

## Integration with BrokenPromise

The pre-flight check is integrated into `BrokenPromise.ps1` bootstrap:

1. **Syntax Check**: PowerShell syntax validation
2. **Pre-Flight Check**: System readiness validation
3. **Start BrokenPromise**: Only if both pass

If pre-flight check fails, BrokenPromise exits with error code 1 and shows:
- List of issues found
- Learning system solutions
- What to avoid (misdiagnosis warnings)
- How to fix each issue

## Benefits

1. **Prevents Startup Errors**: Catches issues before BrokenPromise loads
2. **Uses Learning System**: Leverages past experience to fix issues
3. **Saves Time**: Automatic fixes and clear guidance
4. **Prevents Misdiagnosis**: Warns about common mistakes
5. **Comprehensive**: Checks all critical systems
