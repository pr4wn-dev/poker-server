# Cerberus - File & Code Integrity Checks

**Cerberus** - The three-headed guardian verifies its own integrity and hunts down ALL errors.

## Current State

### ✅ What We Have
1. **Chip Integrity Checks** - In AI system (StateStore, AIIssueDetector)
   - Verifies chip totals match (table chips + player chips = total)
   - This is for **game state**, not file/code integrity

2. **State Verification** - In AI system
   - Verifies game state consistency
   - Checks for orphaned players, invalid phases, etc.
   - Again, for **game state**, not code

### ❌ What We DON'T Have (But Should)
1. **File Integrity Checks** - Not built yet
   - Does `cerberus.ps1` have required functions?
   - Does `issue-detector.js` have required exports?
   - Does `fix-tracker.js` have required methods?
   - Are integration files present and correct?

2. **Code Integrity Checks** - Not built yet
   - Do files have the code they need to function?
   - Are required functions/classes present?
   - Are required exports/imports correct?
   - Are required integrations in place?

3. **Logging Integrity Checks** - Planned in Phase 5, not built yet
   - Do files log in the format AI can understand?
   - Are critical operations logged?
   - Is logging consistent across files?
   - Does logging interfere with monitoring?

4. **Integration Integrity Checks** - Not built yet
   - Do files integrate properly with AI system?
   - Are required AI functions called?
   - Are state updates happening correctly?
   - Are events being emitted properly?

---

## What Should We Check?

### 1. **File Structure Integrity**
**Check**: Do required files exist and have correct structure?

**Examples**:
- ✅ `monitoring/core/StateStore.js` exists and exports `StateStore` class
- ✅ `monitoring/integration/CerberusIntegration.js` exists and exports `CerberusIntegration` class
- ✅ `monitoring/CerberusIntegration.ps1` exists and has all required functions
- ✅ `monitoring/cerberus.ps1` sources `CerberusIntegration.ps1`

**What to Check**:
```javascript
// File exists
fs.existsSync('monitoring/core/StateStore.js')

// File exports required class
const StateStore = require('./monitoring/core/StateStore.js')
// StateStore should be a class with required methods

// File has required functions (PowerShell)
// Check if CerberusIntegration.ps1 has Get-AIInvestigationStatus, etc.
```

---

### 2. **Code Integrity**
**Check**: Do files have the code they need to function?

**Examples**:
- ✅ `StateStore.js` has `updateState()`, `getState()`, `save()`, `load()` methods
- ✅ `AIIssueDetector.js` has `detectIssue()`, `verifyState()`, `getActiveIssues()` methods
- ✅ `AIFixTracker.js` has `recordAttempt()`, `getSuggestedFixes()` methods
- ✅ `AIDecisionEngine.js` has `shouldStartInvestigation()`, `shouldPauseUnity()` methods
- ✅ `CerberusIntegration.ps1` has all PowerShell helper functions

**What to Check**:
```javascript
// Check if class has required methods
const store = new StateStore(projectRoot);
typeof store.updateState === 'function' // Should be true
typeof store.getState === 'function' // Should be true
typeof store.save === 'function' // Should be true

// Check if PowerShell file has required functions
// Parse PowerShell file, check for function definitions
// Get-AIInvestigationStatus, Should-AIStartInvestigation, etc.
```

---

### 3. **Logging Integrity**
**Check**: Do files log correctly for AI system?

**Examples**:
- ✅ Logs use format: `[timestamp] [source] [level] message`
- ✅ Critical operations are logged
- ✅ Logs are parseable by AILogProcessor
- ✅ No logging that interferes with monitoring

**What to Check**:
```javascript
// Check log format
const logLine = "[2026-02-08 12:00:00] [SERVER] [INFO] Message";
const match = logLine.match(/\[([^\]]+)\]\s+\[([^\]]+)\]\s+\[([^\]]+)\]\s+(.+)/);
// Should match: timestamp, source, level, message

// Check if critical operations log
// Search code for critical operations (bet, call, raise, etc.)
// Verify they have logging calls

// Check for parseability
// Try parsing logs with AILogProcessor
// Verify no unparseable logs
```

---

### 4. **Integration Integrity**
**Check**: Do files integrate properly with AI system?

**Examples**:
- ✅ `cerberus.ps1` sources `CerberusIntegration.ps1`
- ✅ `cerberus.ps1` calls AI functions (not just old broken logic)
- ✅ Files update StateStore when state changes
- ✅ Files emit events when things happen
- ✅ Files call AI functions for decisions

**What to Check**:
```javascript
// Check if cerberus.ps1 sources CerberusIntegration.ps1
// Search for: . $aiIntegrationPath or . CerberusIntegration.ps1

// Check if cerberus.ps1 calls AI functions
// Search for: Get-AIInvestigationStatus, Should-AIStartInvestigation, etc.

// Check if files update StateStore
// Search for: stateStore.updateState(...)

// Check if files emit events
// Search for: this.emit(...) or integration.emit(...)
```

---

### 5. **Dependency Integrity**
**Check**: Are all dependencies present and correct?

**Examples**:
- ✅ All required Node.js modules installed
- ✅ All required files can be imported/required
- ✅ All required functions are available
- ✅ No circular dependencies

**What to Check**:
```javascript
// Check if modules can be required
try {
    const StateStore = require('./monitoring/core/StateStore.js');
    // Success
} catch (error) {
    // Missing or broken
}

// Check if dependencies are installed
// Check package.json, node_modules, etc.
```

---

## Proposed Solution: Integrity Checker System

### **Component 1: File Integrity Checker**
```javascript
class FileIntegrityChecker {
    checkFileExists(path) { }
    checkFileStructure(path, expectedExports) { }
    checkFileHasRequiredCode(path, requiredFunctions) { }
}
```

### **Component 2: Code Integrity Checker**
```javascript
class CodeIntegrityChecker {
    checkClassHasMethods(classInstance, requiredMethods) { }
    checkFunctionExists(filePath, functionName) { }
    checkExports(filePath, expectedExports) { }
}
```

### **Component 3: Logging Integrity Checker**
```javascript
class LoggingIntegrityChecker {
    checkLogFormat(logLine) { }
    checkCriticalOperationsLogged(filePath, operations) { }
    checkLogParseability(logs) { }
    checkLoggingInterference(filePath) { }
}
```

### **Component 4: Integration Integrity Checker**
```javascript
class IntegrationIntegrityChecker {
    checkAIIntegrationSourced(monitorPath) { }
    checkAIFunctionsCalled(filePath, requiredCalls) { }
    checkStateStoreUpdates(filePath) { }
    checkEventEmissions(filePath) { }
}
```

### **Component 5: Dependency Integrity Checker**
```javascript
class DependencyIntegrityChecker {
    checkModulesInstalled(requiredModules) { }
    checkImportsWork(filePath) { }
    checkNoCircularDependencies() { }
}
```

---

## How It Would Work

### **1. Automated Checks**
Run integrity checks:
- On monitor startup
- Periodically (every 5 minutes)
- Before critical operations
- After code changes

### **2. Issue Detection**
If integrity check fails:
- Detect as issue (via AIIssueDetector)
- Report what's missing/broken
- Suggest fixes

### **3. Auto-Fix (Future)**
If integrity check fails:
- Try to fix automatically (if safe)
- Add missing code
- Fix broken integrations
- Update logging

---

## What Should We Build First?

### **Option 1: Basic Integrity Checker** (Quick Win)
- Check if required files exist
- Check if required functions exist
- Check if AI integration is sourced
- Report issues

### **Option 2: Comprehensive Integrity Checker** (Full Solution)
- All checks above
- Logging integrity
- Code structure analysis
- Auto-fix capabilities

### **Option 3: Integration-Focused** (Most Important)
- Check if AI integration is used
- Check if broken systems are replaced
- Check if state updates happen
- Check if events are emitted

---

## Questions for Discussion

1. **What's Most Important?**
   - File existence?
   - Code structure?
   - Logging format?
   - Integration correctness?

2. **When Should We Check?**
   - On startup?
   - Periodically?
   - Before operations?
   - After changes?

3. **What Should We Do When Checks Fail?**
   - Just report?
   - Try to fix automatically?
   - Block operations?
   - Alert AI?

4. **Should This Be Part of AI System?**
   - Yes - AI should verify its own integrity
   - No - Separate system
   - Both - AI checks itself + separate system

---

## Recommendation

**Build Integration-Focused Integrity Checker First**:

1. **Check AI Integration** - Is it sourced? Are functions called?
2. **Check State Updates** - Are files updating StateStore?
3. **Check Event Emissions** - Are events being emitted?
4. **Check Required Functions** - Do files have what they need?

This ensures the AI system actually works, which is the most important thing.

Then add:
- Logging integrity (so AI can read logs)
- Code structure (so everything functions)
- Auto-fix (so it fixes itself)

---

**What do you think? What's most important to check first?**
