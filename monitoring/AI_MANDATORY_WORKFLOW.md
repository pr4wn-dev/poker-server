# 🚨 MANDATORY AI WORKFLOW - YOU MUST FOLLOW THIS 🚨

**CRITICAL**: This workflow is NOT optional. You MUST follow it for EVERY action.

**REMINDER: AI Should Never Be Trusted** - The system includes comprehensive compliance verification that checks if you actually followed this workflow. All verification checks are displayed in BrokenPromise statistics under "COMPLIANCE VERIFICATION - DETECTING AI LIES". The system will detect if you lie about following the workflow.

**NEW: Prompt-Based System** - The system now automatically detects when you should follow this workflow and generates prompts for the user to deliver to you. See [PROMPT_BASED_SYSTEM.md](PROMPT_BASED_SYSTEM.md) for details.

**How It Works:**
1. System detects issue/violation → generates prompt for user
2. User delivers prompt to you → you treat it as direct instruction
3. System verifies you did it → checks tool calls, state, files
4. If not done → system generates new prompt, cycle continues

---

## ⚠️ BEFORE EVERY ACTION - MANDATORY CHECKLIST

### **STEP 1: Check for Web Search Requirement (MANDATORY)**

**BEFORE** you attempt ANY fix, code change, or problem-solving action:

```javascript
// 1. Get suggestions from learning system
const suggestions = core.beforeAIAction({
    type: 'fix_attempt', // or 'code_change', 'debugging', etc.
    method: 'your_method',
    issueType: 'your_issue_type',
    component: 'your_component',
    file: 'path/to/file',
    details: { /* your details */ }
});

// 2. CHECK FOR WEB SEARCH REQUIREMENT (MANDATORY)
if (suggestions.webSearchRequired) {
    // LEARNING SYSTEM IS TELLING YOU TO SEARCH ONLINE
    // YOU MUST DO THIS BEFORE CONTINUING
    
    const searchTerms = suggestions.webSearchTerms;
    const urgency = suggestions.webSearchUrgency; // 'high' or 'critical'
    const message = suggestions.warnings.find(w => w.type === 'WEB_SEARCH_REQUIRED')?.message;
    
    // SEARCH ONLINE (MANDATORY)
    const searchResults = await web_search(searchTerms.join(' '));
    
    // STORE FINDINGS IN LEARNING SYSTEM (MANDATORY)
    await storeWebSearchKnowledge(searchResults, searchTerms, {
        issueType: 'your_issue_type',
        component: 'your_component',
        urgency: urgency
    });
    
    // MARK AS RESOLVED
    core.stateStore.updateState('ai.learning.webSearchRequired', {
        ...suggestions.webSearchRequired,
        resolved: true,
        resolvedAt: Date.now(),
        searchResults: searchResults
    });
    
    // DO NOT CONTINUE WITH FIX UNTIL YOU'VE SEARCHED AND STORED FINDINGS
    return; // Stop here until search is complete
}
```

**IF YOU SKIP THIS STEP, YOU ARE VIOLATING THE WORKFLOW.**

---

### **STEP 2: Review Warnings and Recommendations**

After checking web search (or if none required), review all warnings and recommendations:

```javascript
// Check warnings
if (suggestions.warnings.length > 0) {
    // HEED THESE WARNINGS - they're from the learning system
    for (const warning of suggestions.warnings) {
        if (warning.priority === 'critical') {
            // CRITICAL WARNING - DO NOT IGNORE
            // Consider alternative approach
        }
    }
}

// Check recommendations
if (suggestions.recommendations.length > 0) {
    // USE THESE - they're learned solutions that worked before
    const bestRecommendation = suggestions.recommendations[0];
    // Use the recommended approach
}
```

---

### **STEP 3: Take Action**

Only after completing Steps 1 and 2, proceed with your action.

---

### **STEP 4: Report Outcome (MANDATORY)**

**AFTER** every action (success OR failure):

```javascript
// Report outcome to learning system
core.afterAIAction(action, {
    success: true, // or false
    description: 'What happened',
    codeChanges: [/* actual changes made */],
    // If failure:
    reason: 'Why it failed',
    error: errorObject,
    whatWentWrong: 'What went wrong',
    whatShouldHaveHappened: 'What should have happened'
});

// If it failed, learning system will automatically:
// 1. Track the failure
// 2. Increment consecutive failure count
// 3. Require web search for next attempt
```

---

## 🔄 WHEN STUCK - MANDATORY HELP CHECK

If you're stuck or unsure:

```javascript
// Get help from learning system
const help = core.aiNeedsHelp({
    component: 'your_component',
    issue: 'your_issue',
    context: { /* your context */ }
});

// CHECK FOR WEB SEARCH REQUIREMENT (MANDATORY)
if (help.webSearchRequired) {
    // SAME AS STEP 1 ABOVE - SEARCH ONLINE
    // DO NOT CONTINUE UNTIL SEARCHED
}

// Use suggestions from help
// help.suggestions - what to do
// help.solutions - solutions that worked before
// help.patterns - similar problems
```

---

## 🚨 FAILURE TRACKING

The learning system automatically tracks:
- **Consecutive failures**: After 1 failure → web search required, After 2+ failures → CRITICAL web search required
- **Failure patterns**: What methods failed for what issues
- **Success patterns**: What methods worked for what issues

**YOU CANNOT BYPASS THIS.** The learning system enforces web search after failures.

---

## ✅ SUCCESS TRACKING

When you succeed:
- Learning system learns what worked
- Failure count resets
- System confidence increases
- Next time: faster resolution using learned knowledge

---

## 📋 QUICK REFERENCE

**BEFORE ACTION:**
1. ✅ Call `beforeAIAction()`
2. ✅ Check `webSearchRequired` - if true, SEARCH ONLINE FIRST
3. ✅ Review warnings and recommendations
4. ✅ Proceed with action

**AFTER ACTION:**
1. ✅ Call `afterAIAction()` with outcome
2. ✅ If failed, learning system will require web search for next attempt

**WHEN STUCK:**
1. ✅ Call `aiNeedsHelp()`
2. ✅ Check `webSearchRequired` - if true, SEARCH ONLINE FIRST
3. ✅ Use suggestions and solutions provided

---

## 🚫 WHAT NOT TO DO

- ❌ **DO NOT** skip `beforeAIAction()` check
- ❌ **DO NOT** ignore `webSearchRequired: true`
- ❌ **DO NOT** attempt fixes without checking learning system first
- ❌ **DO NOT** skip `afterAIAction()` reporting
- ❌ **DO NOT** bypass web search when required

**VIOLATING THESE RULES = WASTING USER'S TIME AND MONEY**

---

## 🔄 NEW: PROMPT-BASED ENFORCEMENT

**The system now automatically enforces this workflow:**

1. **System detects** when you should follow this workflow (before coding, after failures, etc.)
   - Monitors tool calls (did you call `beforeAIAction()` before coding?)
   - Monitors state (is `webSearchRequired` resolved?)
   - Monitors failures (consecutive failures trigger web search requirement)
   - Uses existing `AIIssueDetector`, `ErrorRecovery`, `UniversalErrorHandler` for error detection
   - NEW: `AIWorkflowViolationDetector` detects workflow violations

2. **System generates** a prompt for the user to deliver to you
   - NEW: `PromptGenerator` creates specific instructions
   - Uses learning system knowledge (`learning.aiCompliance`) to find prompts that worked
   - Includes context, requirements, specific steps, verification info
   - Shown in BrokenPromise terminal UI and log file

3. **User delivers** the prompt as a direct instruction
   - User reads prompt from terminal or log file
   - User gives you the prompt as direct command
   - You treat it as instruction from user (will follow it)

4. **You follow** it because it's a direct instruction from the user
   - You ignore passive requirements (system flags, docs)
   - You follow direct instructions from the user
   - Prompts come from user, not system

5. **System verifies** you actually did it (checks tool calls, state, files)
   - NEW: `PromptComplianceVerifier` checks evidence
   - Tool calls: Did you call `web_search`? `beforeAIAction()`? `afterAIAction()`?
   - State: Are findings stored? Is `webSearchRequired` resolved?
   - Files: Did you modify code?
   - Cross-reference: What you claim vs what actually happened

6. **Learning system learns** from compliance
   - Records compliance in `learning.aiCompliance`
   - Tracks which prompts work, which don't
   - Updates confidence scores
   - Improves prompt generation over time

7. **If not done** → system generates new prompt, cycle continues
   - System detects non-compliance
   - Generates new prompt with verification evidence
   - User delivers new prompt
   - Cycle continues until compliance

**This solves the problem: You ignore passive requirements but follow direct instructions from the user. The learning system learns how to prompt you effectively over time.**

**See [PROMPT_BASED_SYSTEM.md](PROMPT_BASED_SYSTEM.md) for complete details.**
