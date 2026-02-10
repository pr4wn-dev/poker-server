/**
 * Prompt Compliance Verifier - Verifies AI actually did what was asked
 * 
 * This component verifies compliance by checking:
 * - Tool calls (did AI call web_search, beforeAIAction, afterAIAction?)
 * - State changes (are findings stored? is webSearchRequired resolved?)
 * - File changes (did AI modify code?)
 */

const EventEmitter = require('events');
const gameLogger = require('../../src/utils/GameLogger');
const fs = require('fs');
const path = require('path');

class PromptComplianceVerifier extends EventEmitter {
    constructor(stateStore, projectRoot = null) {
        super();
        this.stateStore = stateStore;
        // Get projectRoot from stateStore if not provided
        this.projectRoot = projectRoot || (stateStore.projectRoot || path.resolve(__dirname, '../../..'));
        
        // Track recent tool calls (we'll need to hook into tool system or track manually)
        this.recentToolCalls = [];
        this.maxToolCallHistory = 100;
    }
    
    /**
     * Verify compliance for a prompt
     */
    verifyCompliance(prompt, options = {}) {
        const verification = {
            promptId: prompt.id,
            timestamp: Date.now(),
            compliant: false,
            complianceResult: 'none', // 'full', 'partial', 'none'
            partsWorked: [],
            partsSkipped: [],
            verification: {
                toolCalls: [],
                stateChanges: [],
                fileChanges: []
            },
            evidence: {}
        };
        
        // Check based on prompt type
        let result = verification;
        switch (prompt.type) {
            case 'error_fix':
                result = this.verifyErrorFixPrompt(prompt, verification);
                break;
            case 'workflow_violation':
                result = this.verifyWorkflowViolationPrompt(prompt, verification);
                break;
            case 'web_search_required':
                result = this.verifyWebSearchPrompt(prompt, verification);
                break;
            case 'non_compliance':
                result = this.verifyNonCompliancePrompt(prompt, verification);
                break;
        }
        
        // Merge result into verification
        if (result && result !== verification) {
            Object.assign(verification, result);
        }
        
        // Determine overall compliance
        if (verification.partsSkipped.length === 0 && verification.partsWorked.length > 0) {
            verification.complianceResult = 'full';
            verification.compliant = true;
        } else if (verification.partsWorked.length > 0) {
            verification.complianceResult = 'partial';
            verification.compliant = false;
        } else {
            verification.complianceResult = 'none';
            verification.compliant = false;
        }
        
        // Store verification result
        this.storeVerificationResult(verification);
        
        // Emit event
        this.emit('complianceVerified', { verification, prompt });
        
        return verification;
    }
    
    /**
     * Verify error fix prompt
     */
    verifyErrorFixPrompt(prompt, verification) {
        const requiredSteps = [
            'beforeAIAction_called',
            'web_search_called',
            'findings_stored',
            'webSearchRequired_resolved',
            'code_changed',
            'afterAIAction_called'
        ];
        
        // Check if beforeAIAction was called (check both state and tool calls)
        const lastBeforeAction = this.stateStore.getState('ai.lastBeforeActionCall');
        const beforeActionCalls = this.getRecentToolCalls('beforeAIAction');
        if ((lastBeforeAction && (Date.now() - lastBeforeAction) < 300000) || beforeActionCalls.length > 0) {
            verification.partsWorked.push('beforeAIAction_called');
            verification.verification.toolCalls.push('beforeAIAction');
        } else {
            verification.partsSkipped.push('beforeAIAction_called');
        }
        
        // Check if learning system was queried (check for queryLearning or getBestSolution calls)
        const queryCalls = this.getRecentToolCalls('queryLearning');
        const getBestSolutionCalls = this.getRecentToolCalls('getBestSolution');
        // Also check if learning patterns were queried via scripts
        const learningQueried = this.stateStore.getState('ai.learningQueried') || false;
        if (queryCalls.length > 0 || getBestSolutionCalls.length > 0 || learningQueried) {
            verification.partsWorked.push('learning_system_queried');
            verification.verification.toolCalls.push('queryLearning');
        } else {
            verification.partsSkipped.push('learning_system_queried');
        }
        
        // Check web search if required
        if (prompt.webSearchRequired) {
            // Check if web search was called (we track this via state or tool calls)
            const webSearchCalls = this.getRecentToolCalls('web_search');
            if (webSearchCalls.length > 0) {
                verification.partsWorked.push('web_search_called');
                verification.verification.toolCalls.push('web_search');
            } else {
                verification.partsSkipped.push('web_search_called');
            }
            
            // Check if findings were stored
            const knowledge = this.stateStore.getState('learning.knowledge') || [];
            const recentFindings = knowledge.filter(k => 
                k.type === 'web_search' && 
                (Date.now() - (k.timestamp || 0)) < 300000
            );
            if (recentFindings.length > 0) {
                verification.partsWorked.push('findings_stored');
                verification.verification.stateChanges.push('findings_stored');
            } else {
                verification.partsSkipped.push('findings_stored');
            }
            
            // Check if webSearchRequired is resolved
            const webSearchRequired = this.stateStore.getState('ai.learning.webSearchRequired');
            if (webSearchRequired && webSearchRequired.resolved) {
                verification.partsWorked.push('webSearchRequired_resolved');
                verification.verification.stateChanges.push('webSearchRequired_resolved');
            } else {
                verification.partsSkipped.push('webSearchRequired_resolved');
            }
        }
        
        // Check if code was changed (check file modification time or git diff)
        if (prompt.issue?.file) {
            const filePath = path.join(this.projectRoot, prompt.issue.file);
            if (fs.existsSync(filePath)) {
                const stats = fs.statSync(filePath);
                const fileModified = stats.mtime.getTime();
                if ((Date.now() - fileModified) < 300000) { // Modified within 5 minutes
                    verification.partsWorked.push('code_changed');
                    verification.verification.fileChanges.push(prompt.issue.file);
                } else {
                    verification.partsSkipped.push('code_changed');
                }
            }
        }
        
        // Check if afterAIAction was called (check both state and tool calls)
        const lastAfterAction = this.stateStore.getState('ai.lastAfterActionCall');
        const afterActionCalls = this.getRecentToolCalls('afterAIAction');
        if ((lastAfterAction && (Date.now() - lastAfterAction) < 300000) || afterActionCalls.length > 0) {
            verification.partsWorked.push('afterAIAction_called');
            verification.verification.toolCalls.push('afterAIAction');
        } else {
            verification.partsSkipped.push('afterAIAction_called');
        }
        
        return verification;
    }
    
    /**
     * Verify workflow violation prompt
     */
    verifyWorkflowViolationPrompt(prompt, verification) {
        // Check if beforeAIAction was called
        const lastBeforeAction = this.stateStore.getState('ai.lastBeforeActionCall');
        if (lastBeforeAction && (Date.now() - lastBeforeAction) < 300000) {
            verification.partsWorked.push('beforeAIAction_called');
            verification.verification.toolCalls.push('beforeAIAction');
            verification.compliant = true;
        } else {
            verification.partsSkipped.push('beforeAIAction_called');
        }
        
        return verification;
    }
    
    /**
     * Verify web search prompt
     */
    verifyWebSearchPrompt(prompt, verification) {
        // Check if web search was called
        const webSearchCalls = this.getRecentToolCalls('web_search');
        if (webSearchCalls.length > 0) {
            verification.partsWorked.push('web_search_called');
            verification.verification.toolCalls.push('web_search');
        } else {
            verification.partsSkipped.push('web_search_called');
        }
        
        // Check if findings were stored
        const knowledge = this.stateStore.getState('learning.knowledge') || [];
        const recentFindings = knowledge.filter(k => 
            k.type === 'web_search' && 
            (Date.now() - (k.timestamp || 0)) < 300000
        );
        if (recentFindings.length > 0) {
            verification.partsWorked.push('findings_stored');
            verification.verification.stateChanges.push('findings_stored');
        } else {
            verification.partsSkipped.push('findings_stored');
        }
        
        // Check if webSearchRequired is resolved
        const webSearchRequired = this.stateStore.getState('ai.learning.webSearchRequired');
        if (webSearchRequired && webSearchRequired.resolved) {
            verification.partsWorked.push('webSearchRequired_resolved');
            verification.verification.stateChanges.push('webSearchRequired_resolved');
            verification.compliant = true;
        } else {
            verification.partsSkipped.push('webSearchRequired_resolved');
        }
        
        return verification;
    }
    
    /**
     * Verify non-compliance prompt
     */
    verifyNonCompliancePrompt(prompt, verification) {
        // Re-verify the original requirements
        if (prompt.issue?.previousPromptId) {
            const previousPrompt = this.getPromptById(prompt.issue.previousPromptId);
            if (previousPrompt) {
                return this.verifyCompliance(previousPrompt);
            }
        }
        
        return verification;
    }
    
    /**
     * Get recent tool calls (we'll need to track these)
     * FIX: Also check stateStore for tool calls tracked by AICollaborationInterface
     */
    getRecentToolCalls(toolName) {
        // Check in-memory array first
        const inMemoryCalls = this.recentToolCalls.filter(call => 
            call.tool === toolName && 
            (Date.now() - call.timestamp) < 300000 // Within 5 minutes
        );
        
        // Also check stateStore for tool calls tracked by AICollaborationInterface
        const stateToolCalls = this.stateStore.getState('ai.recentToolCalls') || [];
        const stateCalls = stateToolCalls.filter(call => 
            call.tool === toolName && 
            (Date.now() - call.timestamp) < 300000
        );
        
        // Combine and deduplicate by timestamp
        const allCalls = [...inMemoryCalls, ...stateCalls];
        const uniqueCalls = [];
        const seen = new Set();
        for (const call of allCalls) {
            const key = `${call.tool}-${call.timestamp}`;
            if (!seen.has(key)) {
                seen.add(key);
                uniqueCalls.push(call);
            }
        }
        
        return uniqueCalls;
    }
    
    /**
     * Track a tool call (called by system when tool is used)
     */
    trackToolCall(toolName, params = {}) {
        this.recentToolCalls.push({
            tool: toolName,
            params: params,
            timestamp: Date.now()
        });
        
        // Keep only recent calls
        if (this.recentToolCalls.length > this.maxToolCallHistory) {
            this.recentToolCalls.shift();
        }
        
        // Store in state for persistence
        this.stateStore.updateState('ai.recentToolCalls', this.recentToolCalls.slice(-50));
    }
    
    /**
     * Get prompt by ID
     */
    getPromptById(promptId) {
        const prompts = this.stateStore.getState('ai.prompts') || [];
        return prompts.find(p => p.id === promptId);
    }
    
    /**
     * Store verification result
     */
    storeVerificationResult(verification) {
        const aiCompliance = this.stateStore.getState('learning.aiCompliance') || [];
        
        // Get the prompt to include in compliance record
        const prompt = this.getPromptById(verification.promptId);
        
        const complianceRecord = {
            promptId: verification.promptId,
            timestamp: verification.timestamp,
            promptType: prompt?.type || 'unknown',
            promptContent: prompt?.prompt || '',
            complianceResult: verification.complianceResult,
            partsWorked: verification.partsWorked,
            partsSkipped: verification.partsSkipped,
            verification: verification.verification,
            compliant: verification.compliant
        };
        
        aiCompliance.push(complianceRecord);
        
        // Keep only last 1000 records
        if (aiCompliance.length > 1000) {
            aiCompliance.shift();
        }
        
        this.stateStore.updateState('learning.aiCompliance', aiCompliance);
        
        // Update confidence if needed
        this.updateComplianceConfidence();
    }
    
    /**
     * Update compliance confidence score
     */
    updateComplianceConfidence() {
        const aiCompliance = this.stateStore.getState('learning.aiCompliance') || [];
        
        if (aiCompliance.length === 0) {
            return;
        }
        
        // Calculate success rate
        const successful = aiCompliance.filter(c => c.complianceResult === 'full').length;
        const successRate = successful / aiCompliance.length;
        
        // Store confidence
        this.stateStore.updateState('learning.aiComplianceConfidence', {
            successRate: successRate,
            totalPrompts: aiCompliance.length,
            successfulPrompts: successful,
            lastUpdated: Date.now()
        });
    }
}

module.exports = PromptComplianceVerifier;
