# Comprehensive Prompt Generation System

## Overview

The system now generates prompts for **ALL errors at ALL phases** - before, during, and after BrokenPromise starts. No error is missed. Every error automatically generates a prompt for the AI to fix it immediately.

## Phases Covered

### 1. **BEFORE BrokenPromise Starts** (Pre-Flight Checks)

**Location**: `monitoring/scripts/pre-flight-check.js`

**Checks Performed**:
- Node.js version
- Required files exist
- Logs directory exists
- NPM dependencies installed
- Database connection works
- Unity path configured
- Ports available

**Prompt Generation**:
- ✅ Every failed check generates a prompt
- ✅ Uses learning system to provide solutions
- ✅ Includes misdiagnosis warnings
- ✅ Shows what NOT to do
- ✅ Provides time savings estimates

**Example**:
```
[CHECK] Database Connection... [FAIL]
      Error: Connection refused
      [LEARNING SYSTEM] Known issue: database_connection_error
      [LEARNING SYSTEM] Solution: Ensure MySQL is running (WAMP/XAMPP)
      [LEARNING SYSTEM] ⚠️  AVOID: Assuming database is broken, reinstalling MySQL
      [PROMPT GENERATED] Check logs\prompts-for-user.txt for prompt to give to AI
```

### 2. **DURING BrokenPromise Startup** (Initialization)

**Location**: `monitoring/BrokenPromise.ps1` bootstrap

**Checks Performed**:
- PowerShell syntax validation
- System verification tests

**Prompt Generation**:
- ✅ Syntax errors generate prompts immediately
- ✅ System verification failures generate prompts
- ✅ All errors written to `logs\prompts-for-user.txt`

### 3. **DURING Runtime** (Continuous Monitoring)

**Location**: `monitoring/core/AIMonitorCore.js`

**Monitored Systems**:

#### A. **Unity Game Issues**
- **Detector**: `IssueDetector`
- **Triggers**: Game errors, UI issues, gameplay problems
- **Prompt**: Generated automatically via `issueDetected` event

#### B. **Server Errors**
- **Detector**: `ServerErrorMonitor` (NEW)
- **Triggers**: Server health check failures, connection errors, timeouts
- **Frequency**: Checks every 5 seconds
- **Prompt**: Generated automatically for all server errors

#### C. **Monitoring System Errors**
- **Detector**: `ErrorRecovery`
- **Triggers**: Internal monitoring system errors
- **Prompt**: Generated automatically via `error` event

#### D. **Workflow Violations**
- **Detector**: `WorkflowViolationDetector`
- **Triggers**: AI violates workflow rules
- **Prompt**: Generated automatically via `violationDetected` event

#### E. **AI Failures**
- **Detector**: `AICollaborationInterface`
- **Triggers**: Fix attempts fail, non-compliance detected
- **Prompt**: Generated automatically via `aiFailure` event

#### F. **Web Search Requirements**
- **Detector**: `AICollaborationInterface`
- **Triggers**: Consecutive failures require web search
- **Prompt**: Generated automatically when web search is required

### 4. **AFTER Fix Attempts** (Verification)

**Location**: `monitoring/core/ComplianceVerifier.js`

**Checks Performed**:
- Tool calls made as claimed
- State changes made as claimed
- File changes made as claimed

**Prompt Generation**:
- ✅ Non-compliance detected → generates prompt
- ✅ Missing tool calls → generates prompt
- ✅ Missing state changes → generates prompt
- ✅ Missing file changes → generates prompt

## Prompt Generation Features

### Learning System Integration

Every prompt includes:
1. **Misdiagnosis Prevention**: What NOT to do (prevents wasted time)
2. **Solution Methods**: What worked before (from learning system)
3. **Success Rates**: How often solutions worked
4. **Time Savings**: Estimated time saved vs wrong approach
5. **Frequency**: How often this issue occurs

### Prompt Content

Each prompt includes:
- **Issue Type**: What kind of error
- **Component**: Where it occurred (Unity, Server, Monitoring, etc.)
- **Phase**: When it occurred (before, during, after startup)
- **Steps to Fix**: Detailed instructions
- **Learning System Guidance**: Solutions and warnings
- **Verification Info**: What system will check

### Prompt Storage

All prompts are:
1. **Written to File**: `logs\prompts-for-user.txt`
2. **Stored in State**: `ai.prompts` state (last 100)
3. **Logged**: GameLogger records all prompt generation
4. **Tracked**: Compliance verifier tracks prompt effectiveness

## Monitoring Coverage

### ✅ Unity Client
- Game errors
- UI issues
- Connection problems
- Performance issues
- All detected via `IssueDetector`

### ✅ Server
- Health check failures
- Connection errors
- Timeout errors
- All detected via `ServerErrorMonitor`

### ✅ BrokenPromise Itself
- PowerShell syntax errors
- System verification failures
- Internal monitoring errors
- All detected via bootstrap and `ErrorRecovery`

### ✅ AI Actions
- Workflow violations
- Non-compliance
- Fix failures
- All detected via `WorkflowViolationDetector` and `ComplianceVerifier`

## How It Works

### 1. Error Detection
```
Error occurs → Detector catches it → Emits event
```

### 2. Prompt Generation
```
Event emitted → PromptGenerator.generatePrompt() → Creates prompt with learning system data
```

### 3. Prompt Delivery
```
Prompt created → Written to file → Stored in state → Logged
```

### 4. AI Fixes
```
User reads prompt → Gives to AI → AI fixes issue → System verifies
```

## Example Flow

### Pre-Flight Check Failure
```
1. Pre-flight check runs
2. Database connection fails
3. Learning system queried for solutions
4. Prompt generated with:
   - Error details
   - Learning system solution
   - Misdiagnosis warning
   - Time savings estimate
5. Prompt written to logs\prompts-for-user.txt
6. BrokenPromise exits (won't start with errors)
7. User reads prompt and gives to AI
8. AI fixes issue using learning system guidance
```

### Runtime Server Error
```
1. ServerErrorMonitor checks server health (every 5s)
2. Server not responding
3. Error detected → event emitted
4. PromptGenerator generates prompt
5. Prompt includes:
   - Server error details
   - Learning system solutions
   - What NOT to do (misdiagnosis prevention)
6. Prompt written to logs\prompts-for-user.txt
7. User notified (via console/logs)
8. User gives prompt to AI
9. AI fixes server issue
```

## Benefits

1. **No Errors Missed**: Every error at every phase generates a prompt
2. **Learning System Integration**: All prompts include past solutions and warnings
3. **Immediate Action**: Prompts ready for AI to fix issues right away
4. **Comprehensive Coverage**: Unity, Server, BrokenPromise, AI actions all monitored
5. **Time Savings**: Misdiagnosis prevention saves hours of wasted time
6. **Continuous Monitoring**: Server errors detected every 5 seconds

## Files

- **Pre-Flight Checks**: `monitoring/scripts/pre-flight-check.js`
- **Server Monitoring**: `monitoring/core/ServerErrorMonitor.js`
- **Prompt Generation**: `monitoring/core/PromptGenerator.js`
- **Integration**: `monitoring/core/AIMonitorCore.js`
- **Prompt Storage**: `logs\prompts-for-user.txt`

## Summary

**Every error at every phase now generates a prompt automatically. The learning system provides solutions and warnings. Nothing is missed. The AI can fix issues immediately using the generated prompts.**
