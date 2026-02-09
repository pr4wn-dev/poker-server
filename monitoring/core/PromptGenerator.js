/**
 * Prompt Generator - Generates prompts for user to deliver to AI
 * 
 * This component generates specific, actionable prompts based on:
 * - Issue type and context
 * - Failure history
 * - Web search requirements
 * - Learning system knowledge (which prompts worked before)
 */

const EventEmitter = require('events');
const gameLogger = require('../../src/utils/GameLogger');
const { v4: uuidv4 } = require('uuid');

class PromptGenerator extends EventEmitter {
    constructor(stateStore, learningEngine, collaborationInterface) {
        super();
        this.stateStore = stateStore;
        this.learningEngine = learningEngine;
        this.collaborationInterface = collaborationInterface;
        
        // Prompt templates
        this.templates = {
            error_fix: this.generateErrorFixPrompt.bind(this),
            workflow_violation: this.generateWorkflowViolationPrompt.bind(this),
            web_search_required: this.generateWebSearchPrompt.bind(this),
            non_compliance: this.generateNonCompliancePrompt.bind(this)
        };
    }
    
    /**
     * Generate prompt for detected issue
     */
    generatePrompt(issue) {
        const promptType = this.determinePromptType(issue);
        const template = this.templates[promptType];
        
        if (!template) {
            gameLogger.warn('BrokenPromise', '[PROMPT_GENERATOR] Unknown prompt type', { promptType, issue });
            return null;
        }
        
        const prompt = template(issue);
        
        // Store prompt in state for tracking
        this.storePrompt(prompt);
        
        // Emit event
        this.emit('promptGenerated', { prompt, issue });
        
        return prompt;
    }
    
    /**
     * Determine prompt type from issue
     */
    determinePromptType(issue) {
        if (issue.type === 'workflow_violation') {
            return 'workflow_violation';
        }
        
        if (issue.type === 'non_compliance') {
            return 'non_compliance';
        }
        
        const webSearchRequired = this.stateStore.getState('ai.learning.webSearchRequired');
        if (webSearchRequired && !webSearchRequired.resolved) {
            return 'web_search_required';
        }
        
        return 'error_fix';
    }
    
    /**
     * Generate error fix prompt
     * MISDIAGNOSIS-FIRST: Check for misdiagnosis patterns before generating prompt
     */
    generateErrorFixPrompt(issue) {
        const context = this.gatherContext(issue);
        const webSearchRequired = this.stateStore.getState('ai.learning.webSearchRequired');
        const learningKnowledge = this.getLearningKnowledge(issue);
        
        // CRITICAL: Check for misdiagnosis patterns FIRST (prevent wasted time)
        const misdiagnosisPrevention = this.learningEngine?.getMisdiagnosisPrevention?.(
            issue.issueType || issue.errorType,
            issue.errorMessage || issue.message,
            issue.component
        ) || { warnings: [], correctApproach: null, commonMisdiagnosis: null, timeSavings: null };
        
        let prompt = `${issue.errorType || 'Error'} detected in ${issue.component || 'system'}`;
        if (issue.file) {
            prompt += ` (${issue.file})`;
        }
        prompt += '.\n\n';
        
        // MISDIAGNOSIS WARNING (highest priority - prevent wasted time)
        if (misdiagnosisPrevention.warnings.length > 0) {
            const warning = misdiagnosisPrevention.warnings[0]; // Most relevant warning
            prompt += '⚠️  CRITICAL: MISDIAGNOSIS PREVENTION\n';
            prompt += `   DO NOT: ${warning.commonMisdiagnosis || warning.message}\n`;
            prompt += `   This has been tried ${warning.frequency || 0} time(s) and failed\n`;
            if (warning.timeWasted) {
                const minutesWasted = Math.round(warning.timeWasted / 60000);
                prompt += `   This approach wastes ${minutesWasted} minutes per attempt\n`;
            }
            prompt += `   ACTUAL ROOT CAUSE: ${warning.actualRootCause || 'Check learning system'}\n`;
            prompt += `   CORRECT APPROACH: ${warning.correctApproach || misdiagnosisPrevention.correctApproach || 'See steps below'}\n`;
            prompt += '\n';
        }
        
        prompt += 'You must:\n';
        
        // Step 1: Call beforeAIAction
        prompt += `1. Call beforeAIAction() with context: type='fix_attempt', issueType='${issue.issueType || 'error'}', component='${issue.component || 'unknown'}', file='${issue.file || ''}'\n`;
        prompt += `   - The learning system will check for misdiagnosis patterns and warn you\n`;
        prompt += `   - HEED THE WARNINGS - they prevent wasted time\n`;
        
        // Step 2: Check web search requirement
        if (webSearchRequired && !webSearchRequired.resolved) {
            prompt += `2. Check if webSearchRequired is true (it should be after ${webSearchRequired.consecutiveFailures} failure(s))\n`;
            prompt += `3. Search the web for: ${JSON.stringify(webSearchRequired.searchTerms || [])}\n`;
            prompt += `4. Store all findings in the learning system using storeWebSearchKnowledge()\n`;
        } else {
            prompt += `2. Check if webSearchRequired is true\n`;
        }
        
        // Step 3: Query learning system (ALWAYS - it's a tool to save time)
        const stepNum = webSearchRequired && !webSearchRequired.resolved ? '5' : '3';
        prompt += `${stepNum}. QUERY THE LEARNING SYSTEM to find solutions:\n`;
        prompt += `   - Use queryLearning("What solutions worked for ${issue.issueType || 'this issue type'}?") or\n`;
        prompt += `   - Use getBestSolution("${issue.issueType || 'error'}") to get the best known solution\n`;
        prompt += `   - Check for matching patterns that solved similar issues\n`;
        prompt += `   - Check for misdiagnosis patterns (what NOT to do)\n`;
        prompt += `   - The learning system is a tool to save you time - USE IT\n`;
        
        if (learningKnowledge.hasSolutions) {
            prompt += `   - Found solution: ${learningKnowledge.bestSolution?.method || 'check learning system'}\n`;
        }
        
        // Step 4: Fix the issue (with misdiagnosis prevention)
        const fixStepNum = webSearchRequired && !webSearchRequired.resolved ? '6' : '4';
        prompt += `${fixStepNum}. Fix the ${issue.errorType || 'error'} using the learning system's solution\n`;
        if (misdiagnosisPrevention.correctApproach) {
            prompt += `   - Use this approach: ${misdiagnosisPrevention.correctApproach}\n`;
        }
        if (misdiagnosisPrevention.commonMisdiagnosis) {
            prompt += `   - DO NOT: ${misdiagnosisPrevention.commonMisdiagnosis}\n`;
        }
        
        // Step 5: Call afterAIAction
        prompt += `${webSearchRequired && !webSearchRequired.resolved ? '7' : '5'}. Call afterAIAction() with the outcome\n`;
        prompt += `   - Include fixDetails.approach (what you actually did)\n`;
        prompt += `   - Include fixDetails.timeSpent (how long it took)\n`;
        prompt += `   - This helps the system learn and prevent future misdiagnosis\n`;
        
        // Verification info
        prompt += '\nSystem will verify: tool calls (web_search, beforeAIAction, afterAIAction, queryLearning/getBestSolution), state (findings stored, webSearchRequired resolved), files (code changes)';
        
        // Time savings estimate
        if (misdiagnosisPrevention.timeSavings) {
            const minutesSaved = Math.round(misdiagnosisPrevention.timeSavings / 60000);
            prompt += `\n\n⏱️  TIME SAVINGS: Following the correct approach saves ~${minutesSaved} minutes vs the wrong approach`;
        }
        
        return {
            id: uuidv4(),
            type: 'error_fix',
            timestamp: Date.now(),
            prompt: prompt,
            issue: issue,
            context: context,
            webSearchRequired: webSearchRequired && !webSearchRequired.resolved,
            searchTerms: webSearchRequired?.searchTerms || [],
            misdiagnosisPrevention: misdiagnosisPrevention // Include in prompt metadata
        };
    }
    
    /**
     * Generate workflow violation prompt
     */
    generateWorkflowViolationPrompt(issue) {
        let prompt = `Workflow violation detected: ${issue.violation || 'You violated the workflow'}.\n\n`;
        
        prompt += 'You must:\n';
        prompt += '1. Stop what you\'re doing\n';
        prompt += `2. Call beforeAIAction() with the context of what you were trying to do\n`;
        prompt += '3. QUERY THE LEARNING SYSTEM using queryLearning() or getBestSolution() to find solutions\n';
        prompt += '   - Ask "What solutions worked for this issue type?"\n';
        prompt += '   - The learning system is a tool to save you time - USE IT\n';
        prompt += '4. Follow all suggestions and warnings from the learning system\n';
        prompt += '5. Check for webSearchRequired\n';
        prompt += '6. Only then proceed with your code changes\n';
        
        prompt += '\nSystem will verify: beforeAIAction() was called, workflow was followed';
        
        return {
            id: uuidv4(),
            type: 'workflow_violation',
            timestamp: Date.now(),
            prompt: prompt,
            issue: issue,
            violation: issue.violation
        };
    }
    
    /**
     * Generate web search required prompt
     */
    generateWebSearchPrompt(issue) {
        const webSearchRequired = this.stateStore.getState('ai.learning.webSearchRequired');
        
        let prompt = `Web search required after ${webSearchRequired?.consecutiveFailures || 1} consecutive failure(s).\n\n`;
        
        prompt += 'You must:\n';
        prompt += `1. Search the web for: ${JSON.stringify(webSearchRequired?.searchTerms || [])}\n`;
        prompt += '2. Store all findings in the learning system using storeWebSearchKnowledge()\n';
        prompt += '3. QUERY THE LEARNING SYSTEM using queryLearning() or getBestSolution() to find solutions\n';
        prompt += '   - The learning system may have solutions from previous fixes - CHECK IT\n';
        prompt += '4. Mark webSearchRequired as resolved\n';
        prompt += '5. Only then proceed with your fix attempt\n';
        
        prompt += '\nSystem will verify: web_search tool call, findings stored in learning.knowledge, webSearchRequired resolved';
        
        return {
            id: uuidv4(),
            type: 'web_search_required',
            timestamp: Date.now(),
            prompt: prompt,
            issue: issue,
            searchTerms: webSearchRequired?.searchTerms || [],
            consecutiveFailures: webSearchRequired?.consecutiveFailures || 1
        };
    }
    
    /**
     * Generate non-compliance prompt
     */
    generateNonCompliancePrompt(issue) {
        let prompt = `You claimed to ${issue.claimedAction || 'do something'} but the system shows you didn't.\n\n`;
        
        if (issue.verification) {
            prompt += 'Verification results:\n';
            if (issue.verification.missingToolCalls && issue.verification.missingToolCalls.length > 0) {
                prompt += `- Missing tool calls: ${issue.verification.missingToolCalls.join(', ')}\n`;
            }
            if (issue.verification.missingStateChanges && issue.verification.missingStateChanges.length > 0) {
                prompt += `- Missing state changes: ${issue.verification.missingStateChanges.join(', ')}\n`;
            }
            if (issue.verification.missingFileChanges && issue.verification.missingFileChanges.length > 0) {
                prompt += `- Missing file changes: ${issue.verification.missingFileChanges.join(', ')}\n`;
            }
            prompt += '\n';
        }
        
        prompt += 'You must:\n';
        prompt += `1. ${issue.requiredSteps?.[0] || 'Actually do what you claimed to do'}\n`;
        if (issue.requiredSteps && issue.requiredSteps.length > 1) {
            issue.requiredSteps.slice(1).forEach((step, idx) => {
                prompt += `${idx + 2}. ${step}\n`;
            });
        }
        
        prompt += '\nSystem will verify: ' + (issue.verificationInfo || 'tool calls, state, files');
        
        return {
            id: uuidv4(),
            type: 'non_compliance',
            timestamp: Date.now(),
            prompt: prompt,
            issue: issue,
            previousPromptId: issue.previousPromptId
        };
    }
    
    /**
     * Gather context for prompt generation
     */
    gatherContext(issue) {
        const failureHistory = this.collaborationInterface?.failureTracking || {};
        const recentActions = this.collaborationInterface?.aiActions?.slice(-5) || [];
        
        return {
            failureCount: failureHistory.consecutiveFailures || 0,
            recentActions: recentActions,
            issueType: issue.issueType,
            component: issue.component,
            file: issue.file
        };
    }
    
    /**
     * Get learning system knowledge for this issue
     * MISDIAGNOSIS-FIRST: Prioritize misdiagnosis patterns
     */
    getLearningKnowledge(issue) {
        // CRITICAL: Check misdiagnosis patterns FIRST (most valuable)
        const misdiagnosisPrevention = this.learningEngine?.getMisdiagnosisPrevention?.(
            issue.issueType || issue.errorType,
            issue.errorMessage || issue.message,
            issue.component
        ) || { warnings: [], correctApproach: null };
        
        // Check if learning system has solutions
        const bestSolution = this.learningEngine?.getBestSolution?.(issue.issueType);
        const hasSolutions = !!bestSolution;
        
        // Check failed methods (what NOT to do)
        const failedMethods = this.stateStore.getState('learning.failedMethods') || {};
        const issueFailedMethods = failedMethods[issue.issueType] || [];
        
        // Check prompt effectiveness history
        const aiCompliance = this.stateStore.getState('learning.aiCompliance') || [];
        const similarPrompts = aiCompliance.filter(p => 
            p.promptType === 'error_fix' && 
            p.issue?.issueType === issue.issueType
        );
        
        return {
            hasSolutions,
            bestSolution,
            misdiagnosisPrevention, // Include misdiagnosis data
            failedMethods: issueFailedMethods, // What NOT to do
            similarPrompts: similarPrompts.slice(-5), // Last 5 similar prompts
            averageCompliance: similarPrompts.length > 0 
                ? similarPrompts.reduce((sum, p) => sum + (p.complianceResult === 'full' ? 1 : 0), 0) / similarPrompts.length
                : null
        };
    }
    
    /**
     * Store prompt in state
     */
    storePrompt(prompt) {
        const prompts = this.stateStore.getState('ai.prompts') || [];
        prompts.push({
            id: prompt.id,
            type: prompt.type,
            timestamp: prompt.timestamp,
            prompt: prompt.prompt,
            issue: prompt.issue
        });
        
        // Keep only last 100 prompts
        if (prompts.length > 100) {
            prompts.shift();
        }
        
        this.stateStore.updateState('ai.prompts', prompts);
        
        // Write to log file for user
        this.writePromptToFile(prompt);
    }
    
    /**
     * Write prompt to file for user to read
     */
    writePromptToFile(prompt) {
        const fs = require('fs');
        const path = require('path');
        const promptFile = path.join(this.stateStore.projectRoot, 'logs', 'prompts-for-user.txt');
        
        const promptText = `═══════════════════════════════════════════════════════════════
  PROMPT FOR USER TO DELIVER TO AI
  Generated: ${new Date(prompt.timestamp).toISOString()}
  Type: ${prompt.type}
═══════════════════════════════════════════════════════════════

${prompt.prompt}

═══════════════════════════════════════════════════════════════
`;
        
        try {
            fs.appendFileSync(promptFile, promptText, 'utf8');
        } catch (error) {
            gameLogger.error('BrokenPromise', '[PROMPT_GENERATOR] Failed to write prompt to file', {
                error: error.message,
                promptId: prompt.id
            });
        }
    }
}

module.exports = PromptGenerator;
