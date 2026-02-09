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
     */
    generateErrorFixPrompt(issue) {
        const context = this.gatherContext(issue);
        const webSearchRequired = this.stateStore.getState('ai.learning.webSearchRequired');
        const learningKnowledge = this.getLearningKnowledge(issue);
        
        let prompt = `${issue.errorType || 'Error'} detected in ${issue.component || 'system'}`;
        if (issue.file) {
            prompt += ` (${issue.file})`;
        }
        prompt += '.\n\n';
        
        prompt += 'You must:\n';
        
        // Step 1: Call beforeAIAction
        prompt += `1. Call beforeAIAction() with context: type='fix_attempt', issueType='${issue.issueType || 'error'}', component='${issue.component || 'unknown'}', file='${issue.file || ''}'\n`;
        
        // Step 2: Check web search requirement
        if (webSearchRequired && !webSearchRequired.resolved) {
            prompt += `2. Check if webSearchRequired is true (it should be after ${webSearchRequired.consecutiveFailures} failure(s))\n`;
            prompt += `3. Search the web for: ${JSON.stringify(webSearchRequired.searchTerms || [])}\n`;
            prompt += `4. Store all findings in the learning system using storeWebSearchKnowledge()\n`;
        } else {
            prompt += `2. Check if webSearchRequired is true\n`;
        }
        
        // Step 3: Use learning system
        if (learningKnowledge.hasSolutions) {
            prompt += `${webSearchRequired && !webSearchRequired.resolved ? '5' : '3'}. Use the learning system's suggestions and solution templates\n`;
        }
        
        // Step 4: Fix the issue
        prompt += `${webSearchRequired && !webSearchRequired.resolved ? (learningKnowledge.hasSolutions ? '6' : '5') : (learningKnowledge.hasSolutions ? '4' : '3')}. Fix the ${issue.errorType || 'error'}\n`;
        
        // Step 5: Call afterAIAction
        prompt += `${webSearchRequired && !webSearchRequired.resolved ? (learningKnowledge.hasSolutions ? '7' : '6') : (learningKnowledge.hasSolutions ? '5' : '4')}. Call afterAIAction() with the outcome\n`;
        
        // Step 6: Work symbiotically
        prompt += `${webSearchRequired && !webSearchRequired.resolved ? (learningKnowledge.hasSolutions ? '8' : '7') : (learningKnowledge.hasSolutions ? '6' : '5')}. Work symbiotically with the learning system throughout\n`;
        
        // Verification info
        prompt += '\nSystem will verify: tool calls (web_search, beforeAIAction, afterAIAction), state (findings stored, webSearchRequired resolved), files (code changes)';
        
        return {
            id: uuidv4(),
            type: 'error_fix',
            timestamp: Date.now(),
            prompt: prompt,
            issue: issue,
            context: context,
            webSearchRequired: webSearchRequired && !webSearchRequired.resolved,
            searchTerms: webSearchRequired?.searchTerms || []
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
        prompt += '3. Follow all suggestions and warnings from the learning system\n';
        prompt += '4. Check for webSearchRequired\n';
        prompt += '5. Only then proceed with your code changes\n';
        
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
        prompt += '3. Mark webSearchRequired as resolved\n';
        prompt += '4. Only then proceed with your fix attempt\n';
        
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
     */
    getLearningKnowledge(issue) {
        // Check if learning system has solutions
        const bestSolution = this.learningEngine?.getBestSolution?.(issue.issueType);
        const hasSolutions = !!bestSolution;
        
        // Check prompt effectiveness history
        const aiCompliance = this.stateStore.getState('learning.aiCompliance') || [];
        const similarPrompts = aiCompliance.filter(p => 
            p.promptType === 'error_fix' && 
            p.issue?.issueType === issue.issueType
        );
        
        return {
            hasSolutions,
            bestSolution,
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
