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

---

## 🔄 How It Works

### **Step 1: System Detects Issue**

The system automatically monitors:
- **Monitoring system errors**: PowerShell syntax errors, Node.js runtime errors, execution failures
- **Unity game issues**: State violations, errors, anomalies detected by `AIIssueDetector`
- **AI workflow violations**: AI didn't call `beforeAIAction()`, didn't search when required, didn't store findings
- **Failure patterns**: Consecutive failures, repeated mistakes

**Detection Methods:**
- Exit codes from PowerShell/Node.js execution
- Error logs and stderr output
- State monitoring (Unity game state, server state)
- Tool call history (did AI actually call required functions?)
- State verification (are findings stored? is workflow followed?)

### **Step 2: System Gathers Context**

When an issue is detected, the system gathers:
- **Failure history**: How many consecutive failures? Is this a repeated mistake?
- **Web search requirements**: Is `webSearchRequired: true` set? What search terms are needed?
- **Learning system knowledge**: Does the learning system have solutions for this issue?
- **Recent actions**: What was the AI doing before this error?
- **Issue context**: What type of error? What component? What file?

### **Step 3: System Generates Prompt**

The system generates a specific prompt for the user to deliver to the AI:

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
```

### **Step 4: User Delivers Prompt**

The user:
- Reads the generated prompt (from terminal output, log file, or UI)
- Delivers it to the AI as a direct instruction
- AI treats it as a command from the user (will follow it)

**Where Prompts Are Shown:**
- Terminal output (when running BrokenPromise)
- Log file: `monitoring/logs/prompts-for-user.txt`
- Console output (if system is running)
- Both: Show in terminal AND write to file

### **Step 5: System Verifies Compliance**

The system automatically verifies the AI actually did what was asked:

**Verification Methods:**
- **Tool call history**: Did AI actually call `web_search`? Did AI call `beforeAIAction()`?
- **State checks**: Are findings stored in `learning.knowledge`? Is `webSearchRequired` resolved?
- **File checks**: Did AI actually modify the code? Are changes present?
- **Cross-reference**: What AI claims vs what actually happened

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

### **Step 6: Cycle Continues If Needed**

If AI didn't comply:
- System detects non-compliance
- System generates new prompt: "You claimed to do X but the system shows you didn't. Do it now: [specific steps]"
- User delivers new prompt
- Cycle continues until AI actually does it

---

## 🎯 What Gets Detected

### **Monitoring System Errors**
- PowerShell syntax errors
- Node.js runtime errors
- Execution failures
- Integration errors

### **Unity Game Issues**
- State violations
- Errors detected by `AIIssueDetector`
- Anomalies detected by `EnhancedAnomalyDetection`
- Causal analysis findings

### **AI Workflow Violations**
- AI didn't call `beforeAIAction()` before coding
- AI didn't check `webSearchRequired` when required
- AI didn't search online when required
- AI didn't store findings in learning system
- AI didn't call `afterAIAction()` after actions

### **Failure Patterns**
- Consecutive failures (1+ failures → web search required)
- Repeated mistakes (same error multiple times)
- Workflow violations (ignoring learning system repeatedly)

---

## 🔍 Detection Mechanisms

### **Error Detection**
- **PowerShell/Node.js**: Monitor execution (exit codes, stderr, logs)
- **Unity Game**: Already monitored via `AIIssueDetector`, `AILogProcessor`, `UnityStateReporter`
- **Both**: System already captures state, logs, errors

### **Workflow Violation Detection**
- **Before coding**: Check if AI called `beforeAIAction()` before making code changes
- **Web search**: Check if AI searched when `webSearchRequired: true`
- **Storage**: Check if findings are stored in `learning.knowledge`
- **After actions**: Check if AI called `afterAIAction()` after actions

### **Verification**
- **Tool calls**: Check tool call history (did AI actually call `web_search`?)
- **State**: Check state (are findings stored? is workflow followed?)
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
```

**Workflow Violation Prompt:**
```
Workflow violation detected: [violation description].

You must:
1. Stop what you're doing
2. [Specific workflow steps]
3. Only then proceed
```

**Non-Compliance Prompt:**
```
You claimed to [action] but the system shows you didn't.

You must:
1. [Specific steps to actually do it]
2. System will verify: [what will be checked]
```

---

## ✅ Benefits

1. **System is automatic** - Doesn't rely on AI to trigger it
2. **Prompts come from user** - AI treats them as direct commands (will follow them)
3. **Verification is automatic** - System checks evidence AI can't fake
4. **Works for both scenarios** - Monitoring system errors AND Unity game issues
5. **Cycle continues until done** - If AI doesn't do it, system generates new prompt
6. **Can't be bypassed** - AI can't ignore direct instructions from user
7. **Can't be faked** - Verification checks evidence (tool calls, files, state)

---

## 🚀 Implementation Status

**Documentation**: ✅ Complete  
**Code Implementation**: 📋 Pending

**What Needs to Be Built:**
1. Prompt generation system (detects issues, gathers context, generates prompts)
2. Prompt delivery mechanism (terminal output, log file, UI)
3. Verification system (checks tool calls, state, files)
4. Non-compliance detection (detects when AI didn't do what was asked)
5. Cycle continuation (generates new prompts if needed)

---

## 📚 Related Documentation

- **[AI_MANDATORY_WORKFLOW.md](AI_MANDATORY_WORKFLOW.md)** - Complete workflow details
- **[WORKFLOW.md](WORKFLOW.md)** - AI-Learning System collaboration workflow
- **[README.md](README.md)** - Main documentation

---

**The prompt-based system solves the fundamental problem: AI ignores passive requirements but follows direct instructions from the user. The system does the work automatically, and the user delivers prompts that the AI will actually follow.**
