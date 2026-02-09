#!/usr/bin/env node
/**
 * Show Learning System Knowledge
 * 
 * Displays what the learning system has learned so far:
 * - Patterns discovered
 * - Solutions that worked
 * - Fix attempts and success rates
 * - Web search findings
 * - Compliance tracking
 * - Prompt effectiveness
 */

const path = require('path');
const AIMonitorCore = require('./core/AIMonitorCore');
const gameLogger = require('../src/utils/GameLogger');

const projectRoot = path.resolve(__dirname, '..');

async function showLearning() {
    try {
        const core = new AIMonitorCore(projectRoot);
        
        console.log('\n═══════════════════════════════════════════════════════════════');
        console.log('  BROKENPROMISE LEARNING SYSTEM - WHAT HAS BEEN LEARNED');
        console.log('═══════════════════════════════════════════════════════════════\n');
        
        const stateStore = core.stateStore;
        
        // 1. Fix Attempts
        console.log('📊 FIX ATTEMPTS');
        console.log('─────────────────────────────────────────────────────────────');
        const fixAttempts = stateStore.getState('learning.fixAttempts') || {};
        const fixAttemptsCount = Object.keys(fixAttempts).length;
        console.log(`Total Issues with Fix Attempts: ${fixAttemptsCount}`);
        
        if (fixAttemptsCount > 0) {
            let totalAttempts = 0;
            let successfulAttempts = 0;
            
            for (const [issueId, attempts] of Object.entries(fixAttempts)) {
                if (Array.isArray(attempts)) {
                    totalAttempts += attempts.length;
                    successfulAttempts += attempts.filter(a => a.result === 'success').length;
                }
            }
            
            console.log(`Total Fix Attempts: ${totalAttempts}`);
            console.log(`Successful Fixes: ${successfulAttempts}`);
            console.log(`Success Rate: ${totalAttempts > 0 ? ((successfulAttempts / totalAttempts) * 100).toFixed(1) : 0}%`);
            
            // Show recent attempts
            const recentAttempts = [];
            for (const [issueId, attempts] of Object.entries(fixAttempts)) {
                if (Array.isArray(attempts)) {
                    attempts.forEach(attempt => {
                        recentAttempts.push({
                            issueId,
                            issueType: attempt.issueType,
                            fixMethod: attempt.fixMethod,
                            result: attempt.result,
                            timestamp: attempt.timestamp
                        });
                    });
                }
            }
            
            recentAttempts.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
            const last5 = recentAttempts.slice(0, 5);
            
            if (last5.length > 0) {
                console.log('\nRecent Fix Attempts:');
                last5.forEach((attempt, idx) => {
                    const result = attempt.result === 'success' ? '✅' : '❌';
                    const timeAgo = attempt.timestamp ? 
                        `${Math.round((Date.now() - attempt.timestamp) / 1000 / 60)}m ago` : 
                        'unknown';
                    console.log(`  ${idx + 1}. ${result} ${attempt.issueType || 'unknown'} - ${attempt.fixMethod || 'unknown'} (${timeAgo})`);
                });
            }
        } else {
            console.log('No fix attempts recorded yet.');
        }
        
        // 2. Patterns
        console.log('\n\n🔍 PATTERNS DISCOVERED');
        console.log('─────────────────────────────────────────────────────────────');
        const patterns = stateStore.getState('learning.patterns') || {};
        const patternsCount = Object.keys(patterns).length;
        console.log(`Total Patterns: ${patternsCount}`);
        
        if (patternsCount > 0) {
            const patternEntries = Object.entries(patterns).slice(0, 10);
            patternEntries.forEach(([pattern, data]) => {
                const successRate = data.successRate ? (data.successRate * 100).toFixed(1) : 'N/A';
                const frequency = data.frequency || 0;
                console.log(`  • ${pattern}: ${frequency} occurrences, ${successRate}% success rate`);
            });
        } else {
            console.log('No patterns discovered yet.');
        }
        
        // 3. Knowledge Base
        console.log('\n\n📚 KNOWLEDGE BASE');
        console.log('─────────────────────────────────────────────────────────────');
        const knowledge = stateStore.getState('learning.knowledge') || [];
        console.log(`Total Knowledge Entries: ${knowledge.length}`);
        
        if (knowledge.length > 0) {
            const recentKnowledge = knowledge.slice(-10);
            console.log('\nRecent Knowledge:');
            recentKnowledge.forEach((entry, idx) => {
                const type = entry.type || 'unknown';
                const source = entry.source || 'unknown';
                console.log(`  ${idx + 1}. [${type}] from ${source}`);
                if (entry.description) {
                    const desc = entry.description.length > 60 ? 
                        entry.description.substring(0, 57) + '...' : 
                        entry.description;
                    console.log(`     ${desc}`);
                }
            });
        } else {
            console.log('No knowledge entries yet.');
        }
        
        // 4. Web Search Findings
        console.log('\n\n🌐 WEB SEARCH FINDINGS');
        console.log('─────────────────────────────────────────────────────────────');
        const webSearchKnowledge = (knowledge || []).filter(k => k.type === 'web_search');
        console.log(`Total Web Search Findings: ${webSearchKnowledge.length}`);
        
        if (webSearchKnowledge.length > 0) {
            const recentWebSearches = webSearchKnowledge.slice(-5);
            console.log('\nRecent Web Searches:');
            recentWebSearches.forEach((entry, idx) => {
                const searchTerms = entry.searchTerms ? entry.searchTerms.join(', ') : 'unknown';
                const timeAgo = entry.timestamp ? 
                    `${Math.round((Date.now() - entry.timestamp) / 1000 / 60)}m ago` : 
                    'unknown';
                console.log(`  ${idx + 1}. "${searchTerms}" (${timeAgo})`);
            });
        } else {
            console.log('No web search findings yet.');
        }
        
        // 5. Solution Templates
        console.log('\n\n💡 SOLUTION TEMPLATES');
        console.log('─────────────────────────────────────────────────────────────');
        if (core.solutionTemplateEngine) {
            const templates = core.solutionTemplateEngine.getTemplates ? core.solutionTemplateEngine.getTemplates() : [];
            console.log(`Total Solution Templates: ${templates.length}`);
            
            if (templates.length > 0) {
                templates.slice(0, 5).forEach((template, idx) => {
                    console.log(`  ${idx + 1}. ${template.issueType || 'unknown'}: ${template.method || 'unknown'}`);
                });
            }
        } else {
            console.log('Solution template engine not available.');
        }
        
        // 6. Compliance Tracking
        console.log('\n\n✅ COMPLIANCE TRACKING');
        console.log('─────────────────────────────────────────────────────────────');
        const aiCompliance = stateStore.getState('learning.aiCompliance') || [];
        console.log(`Total Compliance Verifications: ${aiCompliance.length}`);
        
        if (aiCompliance.length > 0) {
            const compliant = aiCompliance.filter(c => c.compliant === true).length;
            const partial = aiCompliance.filter(c => c.complianceResult === 'partial').length;
            const nonCompliant = aiCompliance.filter(c => c.compliant === false && c.complianceResult !== 'partial').length;
            const complianceRate = aiCompliance.length > 0 ? ((compliant / aiCompliance.length) * 100).toFixed(1) : 0;
            
            console.log(`  Compliant: ${compliant}`);
            console.log(`  Partial: ${partial}`);
            console.log(`  Non-Compliant: ${nonCompliant}`);
            console.log(`  Compliance Rate: ${complianceRate}%`);
            
            // Show recent compliance
            const recentCompliance = aiCompliance.slice(-5);
            console.log('\nRecent Compliance Checks:');
            recentCompliance.forEach((verification, idx) => {
                const result = verification.compliant ? '✅' : 
                    (verification.complianceResult === 'partial' ? '⚠️' : '❌');
                const promptType = verification.promptType || 'unknown';
                console.log(`  ${idx + 1}. ${result} ${promptType} - ${verification.complianceResult || 'unknown'}`);
            });
        } else {
            console.log('No compliance verifications yet.');
        }
        
        // 7. Prompt Effectiveness
        console.log('\n\n📝 PROMPT EFFECTIVENESS');
        console.log('─────────────────────────────────────────────────────────────');
        const prompts = stateStore.getState('ai.prompts') || [];
        console.log(`Total Prompts Generated: ${prompts.length}`);
        
        if (prompts.length > 0) {
            const deliveredPrompts = stateStore.getState('ai.deliveredPrompts') || [];
            const deliveredCount = deliveredPrompts.length;
            console.log(`  Delivered: ${deliveredCount}`);
            console.log(`  Pending: ${prompts.length - deliveredCount}`);
            
            // Group by type
            const byType = {};
            prompts.forEach(p => {
                const type = p.type || 'unknown';
                byType[type] = (byType[type] || 0) + 1;
            });
            
            console.log('\nPrompts by Type:');
            Object.entries(byType).forEach(([type, count]) => {
                console.log(`  • ${type}: ${count}`);
            });
        } else {
            console.log('No prompts generated yet.');
        }
        
        // 8. Learning Confidence
        console.log('\n\n🎯 LEARNING CONFIDENCE');
        console.log('─────────────────────────────────────────────────────────────');
        if (core.learningEngine) {
            const confidence = core.learningEngine.getLearningConfidence ? core.learningEngine.getLearningConfidence() : null;
            if (confidence) {
                console.log(`Overall Confidence: ${(confidence.overall * 100).toFixed(1)}%`);
                if (confidence.breakdown) {
                    console.log('\nConfidence Breakdown:');
                    Object.entries(confidence.breakdown).forEach(([capability, score]) => {
                        console.log(`  • ${capability}: ${(score * 100).toFixed(1)}%`);
                    });
                }
            } else {
                console.log('Confidence data not available yet.');
            }
        } else {
            console.log('Learning engine not available.');
        }
        
        // 9. Workflow Violations
        console.log('\n\n⚠️  WORKFLOW VIOLATIONS');
        console.log('─────────────────────────────────────────────────────────────');
        const violations = stateStore.getState('ai.workflowViolations') || [];
        console.log(`Total Violations: ${violations.length}`);
        
        if (violations.length > 0) {
            const recentViolations = violations.slice(-5);
            console.log('\nRecent Violations:');
            recentViolations.forEach((violation, idx) => {
                const severity = violation.severity || 'unknown';
                const violationText = violation.violation || 'unknown';
                console.log(`  ${idx + 1}. [${severity}] ${violationText}`);
            });
        } else {
            console.log('No workflow violations detected.');
        }
        
        console.log('\n═══════════════════════════════════════════════════════════════');
        console.log('  END OF LEARNING SYSTEM REPORT');
        console.log('═══════════════════════════════════════════════════════════════\n');
        
        // Cleanup
        core.destroy();
        
    } catch (error) {
        console.error('Error showing learning data:', error);
        gameLogger.error('BrokenPromise', '[SHOW_LEARNING] Error', {
            error: error.message,
            stack: error.stack
        });
        process.exit(1);
    }
}

showLearning();
