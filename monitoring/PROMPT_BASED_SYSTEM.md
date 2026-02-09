# BrokenPromise - Prompt-Based System

**Date**: 2026-02-08  
**Status**: 📋 **DESIGNED** - Documentation complete, implementation pending

---

## 🎯 Overview

The prompt-based system solves the fundamental problem: **AI ignores passive requirements but follows direct instructions from the user.**

Instead of relying on the AI to:
- Call `beforeAIAction()` before coding
- Check `webSearchRequired` flags
- Search online when required
- Store findings in the learning system

The system now:
1. **Automatically detects** when these actions should happen
2. **Automatically generates** prompts for the user to deliver
3. **Automatically verifies** the AI actually did what was asked
4. **Automatically continues** the cycle until compliance is achieved
5. **Learns from compliance** - Tracks which prompts work, improves over time

---

## 🔄 How It Works

### **Step 1: System Detects Issue**

The system automatically monitors:
- **Monitoring system errors**: PowerShell syntax errors, Node.js runtime errors, execution failures
- **Unity game issues**: State violations, errors, anomalies detected by `AIIssueDetector`
- **AI workflow violations**: AI didn't call `beforeAIAction()`, didn't search when required, didn't store findings
- **Failure patterns**: Consecutive failures, repeated mistakes

**Detection Methods:**
- Exit codes from PowerShell/Node.js execution (via `ErrorRecovery.js`, `UniversalErrorHandler.js`)
- Error logs and stderr output
- State monitoring (Unity game state, server state) via `AIIssueDetector`, `AILogProcessor`, `UnityStateReporter`
- Tool call history (did AI actually call required functions?) - NEW: `AIWorkflowViolationDetector`
- State verification (are findings stored? is workflow followed?)

**Integration with Existing System:**
- Uses existing `AIIssueDetector` for Unity game issues
- Uses existing `ErrorRecovery` and `UniversalErrorHandler` for monitoring system errors
- NEW: `AIWorkflowViolationDetector` extends detection to workflow violations

### **Step 2: System Gathers Context**

When an issue is detected, the system gathers:
- **Failure history**: How many consecutive failures? Is this a repeated mistake? (from `AICollaborationInterface.failureTracking`)
- **Web search requirements**: Is `webSearchRequired: true` set? What search terms are needed? (from `stateStore.getState('ai.learning.webSearchRequired')`)
- **Learning system knowledge**: Does the learning system have solutions for this issue? (from `AILearningEngine`)
- **Recent actions**: What was the AI doing before this error? (from `AICollaborationInterface.aiActions`)
- **Issue context**: What type of error? What component? What file?
- **Prompt effectiveness history**: What prompts worked before? What didn't? (from `learning.aiCompliance` - NEW)

**Integration with Existing System:**
- Uses existing `StateStore` for state access
- Uses existing `AILearningEngine` for learning system knowledge
- Uses existing `AICollaborationInterface` for failure tracking
- NEW: Extends `StateStore` with `learning.aiCompliance` to track prompt effectiveness

### **Step 3: System Generates Prompt**

The system generates a specific prompt for the user to deliver to the AI:

**Prompt Generation Logic:**
- NEW: `PromptGenerator.js` (or extend `AICollaborationInterface`)
- Checks `learning.aiCompliance` for similar past prompts that worked
- Uses what worked (steps/format with high compliance)
- Avoids what didn't (steps/format with low compliance)
- Includes specific instructions based on issue type
- Includes search terms if `webSearchRequired: true`
- Includes verification steps (what system will check)

**Example Prompt (PowerShell Syntax Error):**
```
BrokenPromise failed with a PowerShell syntax error in monitoring/brokenpromise.ps1.

You must:
1. Call beforeAIAction() with context: type='fix_attempt', issueType='powershell_syntax_error', component='BrokenPromise', file='monitoring/brokenpromise.ps1'
2. Check if webSearchRequired is true (it should be after this failure)
3. Search the web for: ['PowerShell', 'syntax error', 'brokenpromise.ps1', 'try catch']
4. Store all findings in the learning system using storeWebSearchKnowledge()
5. Use the learning system's suggestions and solution templates
6. Fix the syntax error
7. Call afterAIAction() with the outcome
8. Work symbiotically with the learning system throughout

System will verify: tool calls (web_search, beforeAIAction, afterAIAction), state (findings stored, webSearchRequired resolved), files (code changes)
```

**Example Prompt (Unity Game Issue):**
```
Unity game issue detected: State violation in TableManager.

You must:
1. Call beforeAIAction() with context: type='fix_attempt', issueType='state_violation', component='TableManager'
2. Check if webSearchRequired is true
3. If required, search the web for: ['Unity', 'state violation', 'TableManager', 'state management']
4. Store findings in learning system
5. Use learning system suggestions
6. Fix the state violation
7. Call afterAIAction() with outcome

System will verify: tool calls, state, files
```

**Example Prompt (Workflow Violation):**
```
Workflow violation detected: You attempted to make code changes without calling beforeAIAction() first.

You must:
1. Stop what you're doing
2. Call beforeAIAction() with the context of what you were trying to do
3. Follow all suggestions and warnings from the learning system
4. Check for webSearchRequired
5. Only then proceed with your code changes

System will verify: beforeAIAction() was called, workflow was followed
```

**Integration with Learning System:**
- `PromptGenerator` uses `AILearningEngine.getLearningConfidence()` to assess system confidence
- `PromptGenerator` queries `learning.aiCompliance` for prompt effectiveness history
- Learning system learns from prompt outcomes (success/failure, compliance/non-compliance)

### **Step 4: Prompt Display in BrokenPromise Terminal**

Prompts are displayed in the BrokenPromise terminal UI:

**Display Location:**
- BrokenPromise terminal UI (via `Show-BrokenPromiseStatistics.ps1` or new prompt display section)
- Log file: `monitoring/logs/prompts-for-user.txt`
- Both: Show in terminal AND write to file

**Display Format:**
```
═══════════════════════════════════════════════════════════════
  PROMPT FOR USER TO DELIVER TO AI
═══════════════════════════════════════════════════════════════

[Generated prompt text here - copy and paste to AI]

═══════════════════════════════════════════════════════════════
```

**Integration with Existing UI:**
- Extends `Show-BrokenPromiseStatistics.ps1` to include prompt display section
- Or creates new prompt display section in `brokenpromise.ps1`
- Prompts are written to log file for persistence

### **Step 5: User Delivers Prompt**

The user:
- Reads the generated prompt (from terminal output, log file, or UI)
- Delivers it to the AI as a direct instruction
- AI treats it as a command from the user (will follow it)

**Why This Works:**
- AI ignores passive requirements (system flags, workflow docs)
- AI follows direct instructions from the user
- Prompts come from the user, not the system
- AI can't ignore direct commands from the user

### **Step 6: System Verifies Compliance**

The system automatically verifies the AI actually did what was asked:

**Verification Methods:**
- **Tool call history**: Did AI actually call `web_search`? Did AI call `beforeAIAction()`? (check tool call logs)
- **State checks**: Are findings stored in `learning.knowledge`? Is `webSearchRequired` resolved? (check `StateStore`)
- **File checks**: Did AI actually modify the code? Are changes present? (check git diff, file timestamps)
- **Cross-reference**: What AI claims vs what actually happened

**Verification Component:**
- NEW: `PromptComplianceVerifier.js` (or extend existing verification)
- Checks tool calls, state, files automatically
- Compares what was asked vs what was done
- Records compliance result in `learning.aiCompliance`

**Example Verification:**
```
Prompt asked AI to: "Search the web for ['PowerShell', 'syntax error']"

Verification:
- ✅ Tool call found: web_search("PowerShell syntax error")
- ✅ Findings stored in learning.knowledge
- ✅ webSearchRequired marked as resolved
- ✅ Code changes detected in brokenpromise.ps1

Result: COMPLIANT
```

**Example Non-Compliance:**
```
Prompt asked AI to: "Search the web for ['PowerShell', 'syntax error']"

Verification:
- ❌ No tool call found: web_search
- ❌ No findings in learning.knowledge
- ❌ webSearchRequired still true
- ✅ Code changes detected (but workflow not followed)

Result: NON-COMPLIANT - Generate new prompt
```

**Integration with Existing System:**
- Uses existing `StateStore` for state verification
- Uses existing tool call logging (if available) or extends it
- Uses existing file change tracking (git, file system)

### **Step 7: Learning System Learns from Compliance**

The learning system tracks prompt effectiveness:

**What Gets Tracked:**
- Prompt type (error fix, workflow violation, web search requirement)
- Prompt content (what was asked)
- Compliance result (full compliance, partial, non-compliance)
- Which parts worked (which steps AI followed)
- Which parts didn't (which steps AI skipped)
- Verification evidence (tool calls, state, files)

**Storage:**
- NEW: `learning.aiCompliance` in `StateStore`
- Structure:
  ```javascript
  {
    promptId: 'uuid',
    timestamp: Date.now(),
    promptType: 'error_fix' | 'workflow_violation' | 'web_search_required',
    promptContent: '...',
    complianceResult: 'full' | 'partial' | 'none',
    partsWorked: ['step1', 'step3'], // which steps AI followed
    partsSkipped: ['step2', 'step4'], // which steps AI ignored
    verification: {
      toolCalls: [...], // what AI actually called
      stateChanges: [...], // what changed in state
      fileChanges: [...], // what files changed
    },
    confidence: 0.85 // how confident system is this prompt type works
  }
  ```

**Learning System Integration:**
- Extends `AILearningEngine` to include "AI Compliance" capability
- Calculates prompt effectiveness: `(successfulPrompts / totalPrompts) * 100`
- Includes in overall confidence calculation (like pattern recognition, causal analysis)
- Uses pattern matching: when generating new prompt, finds similar past prompts that worked
- Uses what worked: includes steps/format with high compliance
- Avoids what didn't: skips steps/format with low compliance

**Confidence Tracking:**
- Extends existing `getLearningConfidence()` to include "AI Compliance" capability
- Calculates: `(successfulPrompts / totalPrompts) * 100`
- Includes in overall confidence breakdown (like pattern recognition, causal analysis)
- Tracks over time to detect trends (is AI getting better/worse at compliance?)
- Uses same masking detection (can't fake tool calls, file changes)

### **Step 8: Cycle Continues If Needed**

If AI didn't comply:
- System detects non-compliance via `PromptComplianceVerifier`
- System generates new prompt:
  - "You claimed to do X but the system shows you didn't. Do it now: [specific steps]"
  - Includes verification evidence (what was checked, what was missing)
  - Escalates if repeated (more direct, stricter)
- Learning system records:
  - Non-compliance event in `learning.aiCompliance`
  - What AI claimed vs what AI did
  - Updates prompt effectiveness tracking
- Cycle continues:
  - New prompt generated
  - User delivers it
  - System verifies again
  - Repeat until compliance

---

## 🎯 What Gets Detected

### **Monitoring System Errors**
- PowerShell syntax errors (via `ErrorRecovery`, `UniversalErrorHandler`)
- Node.js runtime errors
- Execution failures
- Integration errors

### **Unity Game Issues**
- State violations (via `AIIssueDetector`)
- Errors detected by `AIIssueDetector`
- Anomalies detected by `EnhancedAnomalyDetection`
- Causal analysis findings (via `CausalAnalysis`)

### **AI Workflow Violations**
- AI didn't call `beforeAIAction()` before coding (NEW: `AIWorkflowViolationDetector`)
- AI didn't check `webSearchRequired` when required
- AI didn't search online when required
- AI didn't store findings in learning system
- AI didn't call `afterAIAction()` after actions

### **Failure Patterns**
- Consecutive failures (1+ failures → web search required) (from `AICollaborationInterface.failureTracking`)
- Repeated mistakes (same error multiple times)
- Workflow violations (ignoring learning system repeatedly)

---

## 🔍 Detection Mechanisms

### **Error Detection**
- **PowerShell/Node.js**: Monitor execution (exit codes, stderr, logs) via `ErrorRecovery.js`, `UniversalErrorHandler.js`
- **Unity Game**: Already monitored via `AIIssueDetector`, `AILogProcessor`, `UnityStateReporter`
- **Both**: System already captures state, logs, errors

### **Workflow Violation Detection**
- **Before coding**: Check if AI called `beforeAIAction()` before making code changes (NEW: `AIWorkflowViolationDetector`)
- **Web search**: Check if AI searched when `webSearchRequired: true`
- **Storage**: Check if findings are stored in `learning.knowledge`
- **After actions**: Check if AI called `afterAIAction()` after actions

### **Verification**
- **Tool calls**: Check tool call history (did AI actually call `web_search`?)
- **State**: Check state (are findings stored? is workflow followed?) via `StateStore`
- **Files**: Check files (did AI actually modify code?)
- **Cross-reference**: Compare claims vs evidence

---

## 📋 Prompt Generation Logic

### **When Prompts Are Generated**

1. **After error detection**: System detects error → generates prompt
2. **After workflow violation**: System detects AI didn't follow workflow → generates prompt
3. **After failure**: System detects failure → generates prompt with web search requirement
4. **After non-compliance**: System detects AI didn't do what was asked → generates new prompt

### **What Prompts Include**

1. **Context**: What error occurred? What was being attempted?
2. **Requirements**: What must AI do? (call beforeAIAction, search web, store findings, etc.)
3. **Specific instructions**: Step-by-step what AI must do
4. **Search terms**: If web search required, what terms to search
5. **Verification**: What system will check to verify compliance

### **Prompt Templates**

**Error Fix Prompt:**
```
[Error Type] detected in [Component/File].

You must:
1. Call beforeAIAction() with context: [context]
2. Check if webSearchRequired is true
3. [If required] Search the web for: [search terms]
4. Store findings in learning system
5. Use learning system suggestions
6. Fix the [error type]
7. Call afterAIAction() with outcome

System will verify: [what will be checked]
```

**Workflow Violation Prompt:**
```
Workflow violation detected: [violation description].

You must:
1. Stop what you're doing
2. [Specific workflow steps]
3. Only then proceed

System will verify: [what will be checked]
```

**Non-Compliance Prompt:**
```
You claimed to [action] but the system shows you didn't.

You must:
1. [Specific steps to actually do it]
2. System will verify: [what will be checked]
```

### **Learning System Integration**

**Prompt Generation Uses Learning System:**
- Queries `learning.aiCompliance` for similar past prompts
- Uses prompts with high compliance rates
- Avoids prompts with low compliance rates
- Adjusts format/steps based on what worked

**Learning System Learns from Prompts:**
- Tracks prompt effectiveness in `learning.aiCompliance`
- Updates confidence scores based on compliance
- Improves prompt generation over time
- Includes "AI Compliance" in overall confidence calculation

---

## ✅ Benefits

1. **System is automatic** - Doesn't rely on AI to trigger it
2. **Prompts come from user** - AI treats them as direct commands (will follow them)
3. **Verification is automatic** - System checks evidence AI can't fake
4. **Works for both scenarios** - Monitoring system errors AND Unity game issues
5. **Cycle continues until done** - If AI doesn't do it, system generates new prompt
6. **Can't be bypassed** - AI can't ignore direct instructions from user
7. **Can't be faked** - Verification checks evidence (tool calls, files, state)
8. **Learning system learns** - Gets better at prompting AI over time
9. **Confidence tracking** - Shows how reliable prompts are
10. **Integrated with existing system** - Uses all existing components, extends them

---

## 🏗️ Implementation Plan

### **New Components to Build**

1. **`PromptGenerator.js`** (or extend `AICollaborationInterface`)
   - Detects issues, gathers context, generates prompts
   - Uses learning system knowledge (`learning.aiCompliance`)
   - Integrates with `AILearningEngine` for confidence

2. **`PromptComplianceVerifier.js`** (or extend existing verification)
   - Verifies AI actually did what was asked
   - Checks tool calls, state, files
   - Records compliance in `learning.aiCompliance`

3. **`AIWorkflowViolationDetector.js`** (or extend `AIIssueDetector`)
   - Detects when AI violates workflow
   - Checks if AI called `beforeAIAction()`, `afterAIAction()`, etc.
   - Triggers prompt generation

4. **Prompt Display in BrokenPromise UI**
   - Extend `Show-BrokenPromiseStatistics.ps1` or `brokenpromise.ps1`
   - Display prompts in terminal
   - Write prompts to log file

5. **Extend `StateStore`**
   - Add `learning.aiCompliance` structure
   - Store prompt effectiveness data

6. **Extend `AILearningEngine`**
   - Add "AI Compliance" capability
   - Include in confidence calculation
   - Track prompt effectiveness

### **Integration Points**

- **Detection**: Uses existing `AIIssueDetector`, `ErrorRecovery`, `UniversalErrorHandler`
- **State**: Uses existing `StateStore`
- **Learning**: Extends existing `AILearningEngine`
- **UI**: Extends existing `Show-BrokenPromiseStatistics.ps1` or `brokenpromise.ps1`
- **Collaboration**: Extends existing `AICollaborationInterface`

---

## 🚀 Implementation Status

**Documentation**: ✅ Complete  
**Code Implementation**: 📋 Pending

**What Needs to Be Built:**
1. `PromptGenerator.js` - Prompt generation system
2. `PromptComplianceVerifier.js` - Verification system
3. `AIWorkflowViolationDetector.js` - Workflow violation detection
4. Prompt display in BrokenPromise UI
5. Extend `StateStore` with `learning.aiCompliance`
6. Extend `AILearningEngine` with AI Compliance capability

---

## 📚 Related Documentation

- **[AI_MANDATORY_WORKFLOW.md](AI_MANDATORY_WORKFLOW.md)** - Complete workflow details
- **[WORKFLOW.md](WORKFLOW.md)** - AI-Learning System collaboration workflow
- **[README.md](README.md)** - Main documentation

---

**The prompt-based system solves the fundamental problem: AI ignores passive requirements but follows direct instructions from the user. The system does the work automatically, the user delivers prompts that the AI will actually follow, and the learning system learns how to prompt the AI effectively over time.**
