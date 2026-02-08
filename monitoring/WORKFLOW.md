# Cerberus - AI Workflow Documentation

**Date**: 2026-02-08  
**Status**: ✅ **CURRENT** - Complete workflow for AI and Learning System collaboration

---

## 🎯 Overview

This document describes how the AI (you) and the Learning System (Cerberus) work together as one unified entity. The workflow is designed to be proactive, intelligent, and continuously improving.

---

## 🔄 Core Workflow

### **1. Before AI Takes Action**

When you're about to fix an issue, call `beforeAIAction()`:

```javascript
const suggestions = core.beforeAIAction({
    type: 'fix_attempt',
    method: 'make_async',
    issueType: 'initialization_hang',
    component: 'ProcessMonitor',
    file: 'monitoring/core/ProcessMonitor.js',
    lineNumber: 45,
    details: { chain: ['getState', 'recordSuccess', 'updateState'] }
});
```

**What You Get**:
- **Warnings**: Circular dependencies, blocking chains, known failure patterns
- **Recommendations**: Learned solutions with code examples
- **Solution Templates**: Reusable templates matching your problem
- **Patterns**: Similar situations and their outcomes
- **Confidence Scores**: How likely each approach is to succeed

**Example Response**:
```javascript
{
    warnings: [
        {
            type: 'CIRCULAR_DEPENDENCY',
            message: 'This creates a circular synchronous call chain',
            chain: ['getState', 'recordSuccess', 'updateState', 'getState']
        }
    ],
    recommendations: [
        {
            type: 'SOLUTION_TEMPLATE',
            template: {
                name: 'Timing Initialization Issue',
                codeExample: `
setImmediate(() => {
    if (!this.stateStore || typeof this.stateStore.getState !== 'function') {
        return;
    }
    // Your code here
});
                `,
                whenToUse: 'When component starts async operations before dependencies are initialized',
                successRate: 0.95
            },
            matchScore: 0.92,
            matchReason: 'Matches pattern: initialization_race_condition'
        },
        {
            type: 'LEARNED_SOLUTION',
            solution: {
                method: 'Delay async operations with setImmediate and add guards',
                codeExample: 'setImmediate(() => { if (!this.dependency) return; ... })',
                file: 'monitoring/core/ErrorRecovery.js',
                lineNumber: 88,
                confidence: 0.95
            }
        }
    ],
    patterns: [
        {
            pattern: 'initialization_race_condition',
            frequency: 15,
            successRate: 0.93,
            contexts: ['ProcessMonitor', 'AIIssueDetector', 'PerformanceMonitor']
        }
    ],
    confidence: 0.92
}
```

---

### **2. During Problem Solving**

When you need help or suggestions:

```javascript
const assistance = core.aiNeedsHelp({
    component: 'ProcessMonitor',
    issue: 'initialization_hang',
    context: 'Component hangs during initialization',
    file: 'monitoring/core/ProcessMonitor.js'
});
```

**What You Get**:
- **Similar Problems**: Past issues and their solutions
- **Code Changes**: What files were modified for similar fixes
- **Patterns**: Relevant patterns and their success rates
- **Templates**: Matching solution templates
- **Code Examples**: Actual code that worked before

---

### **3. After AI Completes Action**

Always call `afterAIAction()` after doing something:

```javascript
core.afterAIAction(action, {
    success: true,
    description: 'Fixed initialization hang by delaying async operations',
    codeChanges: [
        {
            file: 'monitoring/core/ProcessMonitor.js',
            changes: [
                {
                    type: 'added_guard',
                    before: 'this.stateStore.getState("health")',
                    after: 'if (!this.stateStore || typeof this.stateStore.getState !== "function") return;\nthis.stateStore.getState("health")',
                    lineNumber: 45
                }
            ]
        }
    ]
});
```

**What Happens**:
- **Learning System Learns**: Extracts patterns, templates, and code changes
- **Templates Created**: Successful fixes become reusable templates
- **Code Changes Tracked**: Actual modifications are recorded
- **Patterns Generalized**: Specific fixes abstracted to general principles
- **Success Rates Updated**: Confidence scores adjusted

---

### **4. Proactive Predictions**

The learning system proactively predicts issues:

```javascript
// Learning system automatically checks for potential issues
const predictions = core.predictIssues();

// Example predictions:
[
    {
        pattern: 'setInterval_in_constructor',
        likelihood: 0.8,
        reason: 'setInterval called in constructor without guards',
        suggestion: 'Delay interval start with setImmediate and add guards',
        type: 'code_pattern',
        confidence: 0.75
    }
]
```

**What You Should Do**:
- Review predictions before they become issues
- Apply preventive fixes proactively
- Learn from predictions to improve detection

---

## 🎓 Learning System Capabilities

### **Solution Templates**

The learning system maintains reusable solution templates:

```javascript
// Get best template for a problem
const templateMatch = core.getSolutionTemplateEngine().getBestTemplate({
    issueType: 'initialization_hang',
    component: 'ProcessMonitor'
});

// Template includes:
// - Name and description
// - Code example (ready to use)
// - When to use guidance
// - Success rate
// - Match score
```

### **Code Change Tracking**

The learning system tracks what code was actually changed:

```javascript
// Get code changes for an issue type
const changes = core.getCodeChangeTracker().getCodePatternsForIssue('initialization_hang');

// Returns:
// - Code patterns that worked
// - Files that were modified
// - Before/after code snippets
// - Success rates
```

### **Pattern Generalization**

Specific fixes are abstracted to general principles:

```javascript
// Specific: "AIIssueDetector.timing_issue"
// Generalized: "initialization_race_condition"
// Solution: "Delay async operations with setImmediate and add guards"
// Applies to: Any component with async initialization
```

### **Proactive Prediction**

Issues are predicted before they happen:

```javascript
// Predicts issues from:
// - Code patterns (setInterval in constructor, etc.)
// - State patterns (access before initialization, etc.)
// - Historical patterns (high failure rates, etc.)
```

### **Context-Aware Suggestions**

Suggestions include specific guidance:

```javascript
{
    method: 'Add guard before stateStore access',
    file: 'monitoring/core/Component.js',
    lineNumber: 45,
    codeExample: `
if (!this.stateStore || typeof this.stateStore.getState !== 'function') {
    return;
}
    `,
    why: 'Prevents "getState is not a function" errors when component initializes before stateStore',
    confidence: 0.95
}
```

---

## 🔍 Querying the Learning System

You can query the learning system directly:

```javascript
// "What solutions worked for timing issues?"
const answer = core.queryLearning('What solutions worked for timing issues?');

// Returns:
{
    type: 'solution',
    solution: {
        method: 'Delay async operations with setImmediate and add guards',
        codeExample: '...',
        file: '...',
        confidence: 0.95
    },
    templates: [
        {
            name: 'Timing Initialization Issue',
            codeExample: '...',
            successRate: 0.95
        }
    ],
    codeExamples: ['...']
}

// "What templates are available?"
const templates = core.queryLearning('What templates are available?');

// "What code changes were made?"
const changes = core.queryLearning('What code changes were made for initialization issues?');
```

---

## 📊 Symbiotic Status

Check how well you're working together:

```javascript
const status = core.getSymbioticStatus();

// Returns:
{
    bidirectionalLearning: {
        aiTaughtLearning: 45,
        learningTaughtAI: 38,
        aiFailuresTaught: 12,
        learningFailuresTaught: 8
    },
    solutionTemplates: {
        total: 4,
        usageCount: 23
    },
    codeChanges: {
        total: 15,
        patterns: 8
    },
    generalizedPatterns: 5,
    // ... more stats
}
```

---

## 🎯 Best Practices

### **1. Always Call `beforeAIAction()`**
- Get warnings before making mistakes
- Learn from past failures
- Use proven templates

### **2. Always Call `afterAIAction()`**
- Teach the learning system
- Create reusable templates
- Track code changes

### **3. Use Solution Templates**
- Don't reinvent the wheel
- Apply proven patterns
- Get code examples ready to use

### **4. Track Code Changes**
- Record what you actually changed
- Help future similar fixes
- Build knowledge base

### **5. Learn from Predictions**
- Review proactive predictions
- Apply preventive fixes
- Improve detection over time

### **6. Query When Stuck**
- Ask the learning system
- Get similar problems and solutions
- Use templates and code examples

---

## 🚀 Example: Complete Fix Workflow

```javascript
// 1. Before fixing - get suggestions
const suggestions = core.beforeAIAction({
    type: 'fix_attempt',
    issueType: 'initialization_hang',
    component: 'ProcessMonitor',
    file: 'monitoring/core/ProcessMonitor.js'
});

// 2. Review warnings and recommendations
if (suggestions.warnings.length > 0) {
    // Heed warnings - they're based on past failures
}

// 3. Use solution template if available
if (suggestions.recommendations.find(r => r.type === 'SOLUTION_TEMPLATE')) {
    const template = suggestions.recommendations.find(r => r.type === 'SOLUTION_TEMPLATE').template;
    // Apply template code example
}

// 4. Make the fix
// ... apply fix using template or learned solution ...

// 5. After fixing - teach learning system
core.afterAIAction({
    type: 'fix_attempt',
    issueType: 'initialization_hang',
    component: 'ProcessMonitor',
    method: 'delay_async_with_guards',
    file: 'monitoring/core/ProcessMonitor.js',
    details: { /* fix details */ }
}, {
    success: true,
    description: 'Fixed by delaying async operations with setImmediate and adding guards',
    codeChanges: [
        {
            file: 'monitoring/core/ProcessMonitor.js',
            changes: [
                {
                    type: 'added_guard',
                    before: '...',
                    after: '...',
                    lineNumber: 45
                }
            ]
        }
    ]
});

// 6. Learning system automatically:
// - Extracts solution template
// - Tracks code changes
// - Generalizes pattern
// - Updates success rates
// - Creates reusable knowledge
```

---

## 💡 Key Insights

1. **You and the Learning System are ONE** - Work together, not separately
2. **Proactive > Reactive** - Get suggestions before making mistakes
3. **Templates > Generic Advice** - Use code examples, not just descriptions
4. **Track Everything** - Code changes, patterns, outcomes
5. **Learn from Both Successes and Failures** - Both teach valuable lessons
6. **Predict and Prevent** - Don't just fix, prevent issues

---

**The workflow is designed to make you and the learning system continuously improve together. Use it, and you'll both get smarter over time.**
