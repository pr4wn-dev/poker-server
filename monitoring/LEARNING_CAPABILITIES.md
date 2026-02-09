# Learning System Capabilities

**What the BrokenPromise Learning System Can Learn**

The learning system is designed to learn from every interaction, fix attempt, and pattern it encounters. Here's what it tracks and learns:

---

## 🎯 Core Learning Types

### 1. **Fix Attempt Patterns**
**What it learns:**
- Which fix methods work for which issue types
- Success rates for different fix approaches
- What doesn't work (to avoid repeating failures)
- Context that affects fix success (state, timing, conditions)

**Example:**
- "Using `setImmediate` to break circular dependencies works 95% of the time"
- "Adding null guards for undefined access works 100% of the time"
- "Method X failed 3 times for issue type Y - don't try it again"

**Storage:**
- `learning.patterns` - Pattern -> success rate mapping
- `learning.fixAttempts` - All attempts by issue ID
- `learning.successRates` - Method -> success rate mapping

---

### 2. **Solution Optimization**
**What it learns:**
- Best solution for each issue type
- Alternative solutions ranked by success rate
- When to use which solution
- Solution effectiveness over time

**Example:**
- "For PowerShell syntax errors, the best solution is: check syntax before save (98% success)"
- "Alternative: Use PowerShell parser validation (85% success)"
- "Don't use: Manual regex parsing (12% success)"

**Storage:**
- `learning.solutionOptimization` - Issue type -> best solution

---

### 3. **Pattern Recognition**
**What it learns:**
- Common patterns that lead to issues
- Patterns that indicate successful fixes
- Pattern frequency and context
- Pattern relationships (which patterns occur together)

**Example:**
- "Circular dependency pattern: A calls B, B calls C, C calls A"
- "Blocking chain pattern: Synchronous file operations in sequence"
- "Initialization hang pattern: Component takes >5 seconds to initialize"

**Storage:**
- `learning.patterns` - Pattern frequency and success rates
- `learning.circularDependencies` - Circular dependency patterns
- `learning.blockingChains` - Blocking operation chains
- `learning.initializationTimings` - Component initialization patterns

---

### 4. **Causal Chain Analysis**
**What it learns:**
- Root causes of issues
- How issues cascade (A causes B causes C)
- Which fixes address root causes vs symptoms
- Causal relationships between components

**Example:**
- "Server health issue → Unity connection failure → Game state corruption"
- "Root cause: Server not running (fix this first)"
- "Symptom: Unity can't connect (fixing this won't help)"

**Storage:**
- `learning.causalChains` - Issue ID -> causal chain

---

### 5. **Cross-Issue Learning**
**What it learns:**
- Solutions that work across multiple issue types
- Common patterns across different components
- Universal fixes (work for many issues)
- Issue relationships (similar issues share solutions)

**Example:**
- "Making operations async works for: circular dependencies, blocking chains, initialization hangs"
- "Adding null guards works for: undefined access, missing data, state corruption"
- "Pattern X appears in both Unity and Server issues"

**Storage:**
- `learning.crossIssueLearning` - Pattern -> related issues and solutions

---

### 6. **Generalized Patterns**
**What it learns:**
- Abstract principles from specific instances
- General solutions that apply broadly
- Pattern generalization rules
- When to apply generalized solutions

**Example:**
- Specific: "AIIssueDetector.timing_issue"
- Generalized: "Component initialization timing issue"
- Solution: "Make initialization async or add timeout"

**Storage:**
- `learning.generalizedPatterns` - General pattern -> instances and solutions
- `learning.generalizationRules` - Specific -> general pattern mapping

---

### 7. **Debugging Patterns**
**What it learns:**
- Successful debugging approaches
- Step-by-step debugging methods that work
- Context-specific debugging strategies
- Debugging success rates by method

**Example:**
- "For component hangs: Test each component individually (90% success)"
- "For state corruption: Compare working vs broken state (85% success)"
- "For undefined errors: Add guards at access points (100% success)"

**Storage:**
- `learning.debuggingPatterns` - Pattern -> debugging method and success rate

---

### 8. **Performance Patterns**
**What it learns:**
- Component initialization timings
- Getter method performance
- Synchronous operation patterns
- Performance bottlenecks

**Example:**
- "AIIssueDetector initialization: avg 200ms, max 500ms"
- "StateStore.getState() calls: avg 5ms, max 50ms"
- "File operations: avg 10ms, but can block for 2s"

**Storage:**
- `learning.initializationTimings` - Component -> timing data
- `learning.getterTimings` - Method -> timing data
- `learning.synchronousOperations` - Method -> blocking operation data

---

### 9. **Web Search Knowledge**
**What it learns:**
- External solutions found via web search
- Search terms that lead to useful results
- Authoritative sources for different issue types
- When web search is required vs optional

**Example:**
- "PowerShell syntax error: Search terms ['PowerShell', 'syntax error'] found solution X"
- "Solution from Stack Overflow: Use [System.Management.Automation.Language.Parser]"
- "After 2 failures, web search is required"

**Storage:**
- `learning.knowledge` - Array of web search findings
- `learning.webSearchRequired` - When search is mandatory

---

### 10. **Solution Templates**
**What it learns:**
- Reusable solution code templates
- Template patterns that work
- Code changes that fix issues
- Template success rates

**Example:**
- "Template: Break circular dependency with setImmediate"
- "Code pattern: Add null guard before property access"
- "File pattern: Validate syntax before save"

**Storage:**
- `learning.solutionTemplates` - Template -> code and success rate

---

### 11. **Code Change Patterns**
**What it learns:**
- Actual code changes that fixed issues
- Code patterns that work
- File patterns (which files need which fixes)
- Change effectiveness

**Example:**
- "Adding `if (!value) return null;` before property access fixes undefined errors"
- "Wrapping in `setImmediate(() => { ... })` fixes circular dependencies"
- "File: monitoring/BrokenPromise.ps1 needs syntax validation"

**Storage:**
- `learning.codeChanges` - Code patterns and file patterns

---

### 12. **AI Compliance Tracking**
**What it learns:**
- Which prompts work to get AI compliance
- Prompt effectiveness by type
- What AI actually does vs what it's asked
- Compliance patterns (what works, what doesn't)

**Example:**
- "Error fix prompts: 85% compliance rate"
- "Workflow violation prompts: 60% compliance rate"
- "Prompts with specific steps: 90% compliance"
- "Prompts without verification: 40% compliance"

**Storage:**
- `learning.aiCompliance` - Prompt -> compliance result
- `learning.aiComplianceConfidence` - Overall compliance statistics

---

### 13. **Workflow Violations**
**What it learns:**
- Common workflow violations
- When violations occur (context, timing)
- Violation patterns
- What leads to violations

**Example:**
- "Code changes without beforeAIAction: 5 occurrences"
- "Web search required but not performed: 3 occurrences"
- "Violations occur more often when fixing PowerShell files"

**Storage:**
- `ai.workflowViolations` - Violation records with context

---

### 14. **Prompt Effectiveness**
**What it learns:**
- Which prompt types work best
- Prompt format effectiveness
- What makes prompts successful
- Prompt delivery patterns

**Example:**
- "Error fix prompts: 3 generated, 0 delivered"
- "Workflow violation prompts: 1 generated, 0 delivered"
- "Prompts with verification info: Higher compliance"

**Storage:**
- `ai.prompts` - All generated prompts
- `ai.deliveredPrompts` - Which prompts were delivered

---

### 15. **System Improvements**
**What it learns:**
- How the system has improved over time
- What improvements worked
- Improvement effectiveness
- System evolution patterns

**Example:**
- "Added syntax validation: Reduced PowerShell errors by 80%"
- "Implemented atomic writes: Eliminated file corruption"
- "Added compliance tracking: Increased AI compliance by 25%"

**Storage:**
- `learning.improvements` - Improvement records

---

### 16. **Misdiagnosis Prevention** ⭐ NEW
**What it learns:**
- Common wrong approaches that waste time
- What doesn't work (to avoid repeating)
- Actual root causes vs symptoms
- Correct approaches that work
- Time wasted by misdiagnosis

**Example:**
- **Symptom**: "PowerShell bracket missing error"
- **Common Misdiagnosis**: "Search for missing brackets" (wastes 30-40 min, doesn't work)
- **Actual Root Cause**: "Missing catch block in try statement"
- **Correct Approach**: "Check try/catch structure first, then brackets" (5 min, works)
- **Time Saved**: 35 minutes per occurrence

**How It Works:**
1. Tracks failed approaches (misdiagnosis)
2. Tracks successful approaches (correct diagnosis)
3. Learns actual root cause from successful fixes
4. Warns AI before misdiagnosis happens
5. Provides correct approach automatically

**Storage:**
- `learning.misdiagnosisPatterns` - Pattern -> misdiagnosis data
- Includes: symptom, common misdiagnosis, actual root cause, correct approach, frequency, time wasted

**Integration:**
- Automatically checked in `beforeAIAction()`
- Provides warnings to prevent wasted time
- Shows correct approach as recommendation
- Estimates time savings

---

## 🔄 Learning Process

### **How Learning Happens:**

1. **Fix Attempt** → System records attempt with context
2. **Pattern Extraction** → System identifies patterns in the attempt
3. **Success/Failure Analysis** → System learns what worked/didn't work
4. **Pattern Generalization** → System abstracts to general principles
5. **Solution Optimization** → System ranks solutions by effectiveness
6. **Cross-Issue Learning** → System finds common solutions
7. **Knowledge Storage** → System saves to permanent storage
8. **Future Application** → System uses learned knowledge for new issues

---

## 📊 Learning Confidence

The system tracks its own learning effectiveness:

- **Pattern Recognition Confidence** - How well it identifies patterns
- **Causal Analysis Confidence** - How well it finds root causes
- **Solution Optimization Confidence** - How well it ranks solutions
- **Cross-Issue Learning Confidence** - How well it finds common solutions
- **Prediction Accuracy** - How well it predicts issues
- **Data Quality** - How reliable the learning data is
- **AI Compliance Confidence** - How well prompts work

**Low confidence triggers:**
- Automatic adjustments to learning algorithms
- More data collection
- Pattern refinement
- Solution re-evaluation

---

## 🎯 What Makes Learning Effective

1. **Immediate Persistence** - Learning data saved immediately (not lost)
2. **Pattern Generalization** - Learns principles, not just instances
3. **Cross-Issue Learning** - Applies solutions across contexts
4. **Failure Learning** - Learns what NOT to do (just as important)
5. **Misdiagnosis Prevention** - Prevents repeating wrong approaches (saves time)
6. **Context Awareness** - Considers state, timing, conditions
7. **Confidence Tracking** - Knows when it's uncertain
8. **Continuous Improvement** - Gets smarter over time

---

## 🚀 Future Learning Capabilities

The system is designed to learn:

- **Predictive Patterns** - Predict issues before they occur
- **Auto-Fix Patterns** - Automatically apply learned fixes
- **Self-Improvement** - Improve its own detection and learning
- **User Behavior** - Learn from how users interact with the system
- **System Evolution** - Adapt as the codebase changes

---

**The learning system is the memory of BrokenPromise. It remembers everything, learns from everything, and gets smarter with every interaction.**
