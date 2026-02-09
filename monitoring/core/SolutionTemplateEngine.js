/**
 * Solution Template Engine - Reusable Solution Templates
 * 
 * Extracts reusable solution templates from successful fixes.
 * Provides actionable templates with code examples.
 * 
 * Features:
 * - Extract templates from successful fixes
 * - Store reusable templates with code examples
 * - Match problems to templates
 * - Provide actionable suggestions
 */

const EventEmitter = require('events');
const gameLogger = require('../../src/utils/GameLogger');

class SolutionTemplateEngine extends EventEmitter {
    constructor(stateStore, learningEngine) {
        super();
        this.stateStore = stateStore;
        this.learningEngine = learningEngine;
        
        // Solution templates
        this.templates = new Map(); // templateId -> template
        this.templatePatterns = new Map(); // pattern -> [templateIds]
        
        // Template usage tracking
        this.templateUsage = new Map(); // templateId -> { usageCount, successCount, lastUsed }
        
        // Load templates
        this.load();
        
        // Initialize with common templates
        this.initializeCommonTemplates();
    }
    
    /**
     * Initialize common templates from known patterns
     */
    initializeCommonTemplates() {
        // Timing initialization issue template
        this.addTemplate({
            id: 'timing_initialization_issue',
            pattern: 'initialization_race_condition',
            name: 'Timing Initialization Issue',
            description: 'Component accesses dependencies before they are ready',
            template: 'delay_async_with_guards',
            codeExample: `
// Problem: Component starts monitoring before stateStore is ready
startMonitoring() {
    // ❌ BAD: Starts immediately, may fail
    this.interval = setInterval(() => {
        this.stateStore.getState('path'); // May fail!
    }, 1000);
}

// ✅ GOOD: Delay start and add guards
startMonitoring() {
    // Delay start to ensure dependencies are ready
    setImmediate(() => {
        this.interval = setInterval(() => {
            // Guard: Ensure stateStore is ready
            if (!this.stateStore || typeof this.stateStore.getState !== 'function') {
                return; // Skip if not ready
            }
            
            try {
                this.stateStore.getState('path');
            } catch (error) {
                // Silently handle errors
            }
        }, 1000);
    });
}
            `.trim(),
            whenToUse: 'When component starts async operations (setInterval, setTimeout) before dependencies are initialized',
            successRate: 0.95,
            contexts: [
                { component: 'AIIssueDetector', issueType: 'timing_issue', result: 'success' },
                { component: 'ProcessMonitor', issueType: 'initialization_hang', result: 'success' },
                { component: 'PerformanceMonitor', issueType: 'timing_issue', result: 'success' }
            ],
            tags: ['timing', 'initialization', 'async', 'guards', 'setImmediate']
        });
        
        // Circular dependency template
        this.addTemplate({
            id: 'circular_dependency_break',
            pattern: 'circular_dependency',
            name: 'Break Circular Dependency',
            description: 'Break circular synchronous calls by making operations async',
            template: 'make_async_break_cycle',
            codeExample: `
// Problem: Circular synchronous calls
recordSuccess(component) {
    this.stateStore.updateState('health', { status: 'healthy' });
    // updateState internally calls getState, which might call recordSuccess again
}

// ✅ GOOD: Break cycle with async
recordSuccess(component) {
    // Use setImmediate to break synchronous cycle
    setImmediate(() => {
        this.stateStore.updateState('health', { status: 'healthy' });
    });
}
            `.trim(),
            whenToUse: 'When synchronous operations create circular dependencies (A calls B, B calls A)',
            successRate: 0.90,
            contexts: [
                { component: 'ErrorRecovery', issueType: 'circular_dependency', result: 'success' }
            ],
            tags: ['circular', 'dependency', 'async', 'setImmediate']
        });
        
        // PowerShell bracket error misdiagnosis template
        this.addTemplate({
            id: 'powershell_bracket_error_misdiagnosis',
            pattern: 'powershell_bracket_error_misdiagnosis',
            name: 'PowerShell Bracket Error - Check Try/Catch First',
            description: 'PowerShell bracket missing errors are often caused by missing try/catch blocks, not actual missing brackets',
            template: 'check_try_catch_before_brackets',
            codeExample: `
# Problem: PowerShell reports "bracket missing" error
# ❌ WRONG APPROACH: Searching for missing brackets (wastes time)
# This takes forever and usually doesn't fix the issue

# ✅ CORRECT APPROACH: Check try/catch structure first
# Step 1: Search for all 'try {' blocks
$tryBlocks = Select-String -Path "script.ps1" -Pattern "try\s*\{"
$catchBlocks = Select-String -Path "script.ps1" -Pattern "catch\s*\{"
$finallyBlocks = Select-String -Path "script.ps1" -Pattern "finally\s*\{"

# Step 2: Verify each try has matching catch or finally
foreach ($tryBlock in $tryBlocks) {
    $lineNumber = $tryBlock.LineNumber
    # Check if there's a catch or finally after this try
    $hasCatchOrFinally = $catchBlocks | Where-Object { $_.LineNumber -gt $lineNumber } | Select-Object -First 1
    if (-not $hasCatchOrFinally) {
        Write-Host "Missing catch/finally for try at line $lineNumber"
    }
}

# Step 3: Check for unclosed try blocks
# Only then search for bracket mismatches if try/catch is correct

# Common pattern: Missing catch block
try {
    # Some code
    # ❌ Missing: catch { ... }
}

# ✅ Fixed: Add catch block
try {
    # Some code
} catch {
    # Handle error
}
            `.trim(),
            whenToUse: 'When PowerShell reports "bracket missing" or "unexpected" syntax errors',
            successRate: 0.95,
            misdiagnosisPrevention: {
                commonMisdiagnosis: 'Searching for missing brackets throughout the code',
                actualRootCause: 'Missing try or catch block',
                timeWasted: 'High - can take 30+ minutes searching for brackets',
                correctApproach: 'Check try/catch structure first, then brackets'
            },
            contexts: [
                { component: 'PowerShell', issueType: 'powershell_syntax_error', result: 'success' },
                { component: 'BrokenPromise', issueType: 'syntax_error', result: 'success' }
            ],
            tags: ['powershell', 'syntax_error', 'try_catch', 'misdiagnosis', 'brackets']
        });
        
        // Guard before access template
        this.addTemplate({
            id: 'guard_before_access',
            pattern: 'undefined_access',
            name: 'Guard Before Access',
            description: 'Check if object/method exists before accessing',
            template: 'guard_check_before_access',
            codeExample: `
// Problem: Accessing method that may not exist
verifyState() {
    const state = this.stateStore.getState('path'); // May fail if stateStore not ready
}

// ✅ GOOD: Guard before access
verifyState() {
    // Guard: Ensure stateStore is ready
    if (!this.stateStore || typeof this.stateStore.getState !== 'function') {
        return; // Skip if not ready
    }
    
    try {
        const state = this.stateStore.getState('path');
        // ... rest of code
    } catch (error) {
        // Silently handle errors
    }
}
            `.trim(),
            whenToUse: 'When accessing dependencies that may not be initialized yet',
            successRate: 0.98,
            contexts: [
                { component: 'AIIssueDetector', issueType: 'undefined_method', result: 'success' },
                { component: 'AIDecisionEngine', issueType: 'undefined_method', result: 'success' }
            ],
            tags: ['guard', 'undefined', 'access', 'safety']
        });
        
        // Try-catch wrapper template
        this.addTemplate({
            id: 'try_catch_wrapper',
            pattern: 'unhandled_error',
            name: 'Try-Catch Wrapper',
            description: 'Wrap operations in try-catch to prevent crashes',
            template: 'wrap_in_try_catch',
            codeExample: `
// Problem: Unhandled errors crash the system
processData() {
    const result = this.complexOperation(); // May throw
    return result;
}

// ✅ GOOD: Wrap in try-catch
processData() {
    try {
        const result = this.complexOperation();
        return result;
    } catch (error) {
        // Silently handle errors - errors will be caught by UniversalErrorHandler if needed
        return null;
    }
}
            `.trim(),
            whenToUse: 'When operations may throw errors that should be handled gracefully',
            successRate: 0.95,
            contexts: [
                { component: 'AIIssueDetector', issueType: 'unhandled_error', result: 'success' }
            ],
            tags: ['try-catch', 'error-handling', 'safety']
        });
    }
    
    /**
     * Add a solution template
     */
    addTemplate(template) {
        this.templates.set(template.id, {
            ...template,
            createdAt: Date.now(),
            lastUsed: null,
            usageCount: 0,
            successCount: 0
        });
        
        // Index by pattern
        if (!this.templatePatterns.has(template.pattern)) {
            this.templatePatterns.set(template.pattern, []);
        }
        this.templatePatterns.get(template.pattern).push(template.id);
        
        // Save
        this.save();
        
        gameLogger.info('BrokenPromise', '[SOLUTION_TEMPLATE] Template added', {
            id: template.id,
            pattern: template.pattern,
            name: template.name
        });
    }
    
    /**
     * Extract template from successful fix
     */
    extractTemplateFromFix(fixAttempt) {
        if (fixAttempt.result !== 'success') return null;
        
        // Analyze the fix to extract template
        const template = {
            id: `template_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            pattern: this.detectPattern(fixAttempt),
            name: this.generateTemplateName(fixAttempt),
            description: fixAttempt.fixDetails?.description || 'Solution template extracted from successful fix',
            template: this.extractTemplateCode(fixAttempt),
            codeExample: this.extractCodeExample(fixAttempt),
            whenToUse: this.generateWhenToUse(fixAttempt),
            successRate: 1.0, // Initial success
            contexts: [{
                component: fixAttempt.component || 'unknown',
                issueType: fixAttempt.issueType,
                result: 'success'
            }],
            tags: this.extractTags(fixAttempt)
        };
        
        this.addTemplate(template);
        return template;
    }
    
    /**
     * Detect pattern from fix attempt
     */
    detectPattern(fixAttempt) {
        const method = fixAttempt.fixMethod || '';
        const issueType = fixAttempt.issueType || '';
        
        // Pattern detection logic
        if (method.includes('setImmediate') || method.includes('async')) {
            if (issueType.includes('timing') || issueType.includes('initialization')) {
                return 'initialization_race_condition';
            }
            if (issueType.includes('circular') || issueType.includes('dependency')) {
                return 'circular_dependency';
            }
        }
        
        if (method.includes('guard') || method.includes('check')) {
            return 'undefined_access';
        }
        
        if (method.includes('try') || method.includes('catch')) {
            return 'unhandled_error';
        }
        
        return 'general_fix';
    }
    
    /**
     * Generate template name
     */
    generateTemplateName(fixAttempt) {
        const pattern = this.detectPattern(fixAttempt);
        const names = {
            'initialization_race_condition': 'Timing Initialization Issue',
            'circular_dependency': 'Break Circular Dependency',
            'undefined_access': 'Guard Before Access',
            'unhandled_error': 'Try-Catch Wrapper',
            'general_fix': 'General Solution Template'
        };
        return names[pattern] || 'Solution Template';
    }
    
    /**
     * Extract template code pattern
     */
    extractTemplateCode(fixAttempt) {
        const method = fixAttempt.fixMethod || '';
        if (method.includes('setImmediate')) return 'delay_async_with_guards';
        if (method.includes('guard')) return 'guard_check_before_access';
        if (method.includes('try')) return 'wrap_in_try_catch';
        return 'general_solution';
    }
    
    /**
     * Extract code example (from fixDetails if available)
     */
    extractCodeExample(fixAttempt) {
        if (fixAttempt.fixDetails?.codeExample) {
            return fixAttempt.fixDetails.codeExample;
        }
        
        // Generate example based on pattern
        const pattern = this.detectPattern(fixAttempt);
        const template = this.templates.get(`template_${pattern}`);
        if (template) {
            return template.codeExample;
        }
        
        return '// Code example not available';
    }
    
    /**
     * Generate "when to use" guidance
     */
    generateWhenToUse(fixAttempt) {
        const pattern = this.detectPattern(fixAttempt);
        const guidance = {
            'initialization_race_condition': 'When component starts async operations before dependencies are initialized',
            'circular_dependency': 'When synchronous operations create circular dependencies',
            'undefined_access': 'When accessing dependencies that may not be initialized yet',
            'unhandled_error': 'When operations may throw errors that should be handled gracefully'
        };
        return guidance[pattern] || 'When similar issue occurs';
    }
    
    /**
     * Extract tags from fix attempt
     */
    extractTags(fixAttempt) {
        const tags = [];
        const method = (fixAttempt.fixMethod || '').toLowerCase();
        const issueType = (fixAttempt.issueType || '').toLowerCase();
        
        if (method.includes('async') || method.includes('setimmediate')) tags.push('async');
        if (method.includes('guard') || method.includes('check')) tags.push('guard');
        if (method.includes('try') || method.includes('catch')) tags.push('error-handling');
        if (issueType.includes('timing')) tags.push('timing');
        if (issueType.includes('circular')) tags.push('circular');
        if (issueType.includes('initialization')) tags.push('initialization');
        
        return tags;
    }
    
    /**
     * Find matching templates for a problem
     */
    findMatchingTemplates(problem) {
        const matches = [];
        
        // Match by pattern
        const pattern = this.detectPattern({ issueType: problem.issueType, fixMethod: problem.method });
        const patternTemplates = this.templatePatterns.get(pattern) || [];
        
        for (const templateId of patternTemplates) {
            const template = this.templates.get(templateId);
            if (template) {
                matches.push({
                    template,
                    matchScore: this.calculateMatchScore(template, problem),
                    matchReason: `Matches pattern: ${pattern}`
                });
            }
        }
        
        // Match by tags
        for (const [templateId, template] of this.templates.entries()) {
            if (patternTemplates.includes(templateId)) continue; // Already matched
            
            const tagMatch = this.matchByTags(template, problem);
            if (tagMatch.score > 0.5) {
                matches.push({
                    template,
                    matchScore: tagMatch.score,
                    matchReason: tagMatch.reason
                });
            }
        }
        
        // Sort by match score
        matches.sort((a, b) => b.matchScore - a.matchScore);
        
        return matches.slice(0, 5); // Top 5 matches
    }
    
    /**
     * Calculate match score between template and problem
     */
    calculateMatchScore(template, problem) {
        let score = 0;
        
        // Pattern match
        const problemPattern = this.detectPattern({ issueType: problem.issueType, fixMethod: problem.method });
        if (template.pattern === problemPattern) {
            score += 0.5;
        }
        
        // Issue type match
        if (template.contexts.some(c => c.issueType === problem.issueType)) {
            score += 0.3;
        }
        
        // Component match
        if (template.contexts.some(c => c.component === problem.component)) {
            score += 0.2;
        }
        
        // Success rate bonus
        score += template.successRate * 0.2;
        
        return Math.min(score, 1.0);
    }
    
    /**
     * Match by tags
     */
    matchByTags(template, problem) {
        const problemTags = this.extractTags({ issueType: problem.issueType, fixMethod: problem.method });
        const commonTags = template.tags.filter(tag => problemTags.includes(tag));
        
        if (commonTags.length === 0) {
            return { score: 0, reason: '' };
        }
        
        const score = commonTags.length / Math.max(template.tags.length, problemTags.length);
        return {
            score,
            reason: `Matches tags: ${commonTags.join(', ')}`
        };
    }
    
    /**
     * Get best template for a problem
     */
    getBestTemplate(problem) {
        const matches = this.findMatchingTemplates(problem);
        if (matches.length === 0) return null;
        
        const best = matches[0];
        
        // Track usage
        this.trackTemplateUsage(best.template.id, problem);
        
        return {
            template: best.template,
            matchScore: best.matchScore,
            matchReason: best.matchReason,
            alternatives: matches.slice(1, 3).map(m => m.template)
        };
    }
    
    /**
     * Track template usage
     */
    trackTemplateUsage(templateId, problem) {
        const template = this.templates.get(templateId);
        if (!template) return;
        
        template.usageCount = (template.usageCount || 0) + 1;
        template.lastUsed = Date.now();
        
        // Update usage tracking
        if (!this.templateUsage.has(templateId)) {
            this.templateUsage.set(templateId, {
                usageCount: 0,
                successCount: 0,
                lastUsed: null
            });
        }
        
        const usage = this.templateUsage.get(templateId);
        usage.usageCount++;
        usage.lastUsed = Date.now();
        
        this.save();
    }
    
    /**
     * Record template success/failure
     */
    recordTemplateResult(templateId, success) {
        const template = this.templates.get(templateId);
        if (!template) return;
        
        if (success) {
            template.successCount = (template.successCount || 0) + 1;
            // Update success rate
            template.successRate = template.successCount / template.usageCount;
        }
        
        // Update usage tracking
        if (this.templateUsage.has(templateId)) {
            const usage = this.templateUsage.get(templateId);
            if (success) {
                usage.successCount++;
            }
        }
        
        this.save();
    }
    
    /**
     * Get all templates
     */
    getAllTemplates() {
        return Array.from(this.templates.values());
    }
    
    /**
     * Get templates by pattern
     */
    getTemplatesByPattern(pattern) {
        const templateIds = this.templatePatterns.get(pattern) || [];
        return templateIds.map(id => this.templates.get(id)).filter(Boolean);
    }
    
    /**
     * Save templates
     */
    save() {
        const data = {
            templates: Array.from(this.templates.entries()),
            templatePatterns: Array.from(this.templatePatterns.entries()),
            templateUsage: Array.from(this.templateUsage.entries()),
            lastSaved: Date.now()
        };
        
        this.stateStore.updateState('learning.solutionTemplates', data);
    }
    
    /**
     * Load templates
     */
    load() {
        const data = this.stateStore.getState('learning.solutionTemplates');
        if (!data) return;
        
        try {
            if (data.templates && Array.isArray(data.templates)) {
                this.templates = new Map(data.templates);
            }
            if (data.templatePatterns && Array.isArray(data.templatePatterns)) {
                this.templatePatterns = new Map(data.templatePatterns);
            }
            if (data.templateUsage && Array.isArray(data.templateUsage)) {
                this.templateUsage = new Map(data.templateUsage);
            }
        } catch (error) {
            // If load fails, start with empty maps (will be initialized with common templates)
            gameLogger.error('BrokenPromise', '[SOLUTION_TEMPLATE] Load error', { error: error.message });
        }
    }
}

module.exports = SolutionTemplateEngine;
