/**
 * Teach Learning System About PowerShell Syntax Fix
 * 
 * This script records the successful fix pattern for PowerShell syntax errors
 * so the learning system knows how to solve similar problems in the future.
 */

const path = require('path');
const fs = require('fs');
const StateStore = require('./core/StateStore');
const AILearningEngine = require('./core/AILearningEngine');
const AILogProcessor = require('./core/AILogProcessor');
const AIIssueDetector = require('./core/AIIssueDetector');

async function teachLearningSystem() {
    const projectRoot = path.join(__dirname, '..');
    
    try {
        // Initialize components
        const stateStore = new StateStore(projectRoot);
        const logProcessor = new AILogProcessor(projectRoot, stateStore);
        const issueDetector = new AIIssueDetector(stateStore, logProcessor);
        
        // Wait a bit for initialization
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Create a fix attempt record
        const fixAttempt = {
            id: `powershell-syntax-fix-${Date.now()}`,
            issueId: 'powershell-syntax-error-BrokenPromise-ps1',
            issueType: 'POWERSHELL_SYNTAX_ERROR',
            fixMethod: 'powerShellSyntaxValidator_structural_analysis',
            fixDetails: {
                filePath: 'monitoring/BrokenPromise.ps1',
                problem: 'PowerShell script had syntax errors: extra closing braces, try/catch mismatches',
                approach: [
                    '1. Used PowerShell parser to get actual errors (not just brace counting)',
                    '2. Analyzed structural issues: try/catch pairing (136 try blocks vs 133 catch blocks)',
                    '3. Found brace imbalances: -7 final brace count (7 extra closing braces)',
                    '4. Identified specific problem lines: 3423 (extra }), 5873-5874 (two extra })',
                    '5. Removed extra braces at identified locations',
                    '6. Validated with PowerShell parser to confirm fix'
                ],
                solution: [
                    'Removed extra closing brace at line 3423 (after try/catch block)',
                    'Removed two extra closing braces at lines 5873-5874 (end of script)',
                    'Result: PowerShell parser validation passed'
                ],
                keyInsights: [
                    'Simple brace counting is insufficient - need structural analysis',
                    'PowerShell parser is the most reliable validation method',
                    'Try/catch pairing must be checked separately from brace counting',
                    'Always validate with actual parser before declaring fix complete',
                    'Look for specific error messages from parser, not just assumptions'
                ],
                duration: 0,
                timestamp: Date.now()
            },
            result: 'success',
            state: stateStore.getState('game'),
            logs: []
        };
        
        // Initialize learning engine (needs fixTracker, but we'll create a minimal one)
        // Actually, let's just directly update the state store with the learning pattern
        const learningData = stateStore.getState('ai.learning') || {};
        
        // Record the successful fix pattern
        if (!learningData.powerShellSyntaxFixes) {
            learningData.powerShellSyntaxFixes = [];
        }
        
        learningData.powerShellSyntaxFixes.push({
            pattern: 'BRACE_IMBALANCE_TRY_CATCH_MISMATCH',
            solution: 'Use PowerShell parser for validation, check try/catch pairing separately, remove extra braces at identified lines',
            success: true,
            timestamp: Date.now(),
            details: fixAttempt.fixDetails
        });
        
        // Keep only last 50 patterns
        if (learningData.powerShellSyntaxFixes.length > 50) {
            learningData.powerShellSyntaxFixes = learningData.powerShellSyntaxFixes.slice(-50);
        }
        
        // Store syntax error patterns
        if (!learningData.syntaxErrorPatterns) {
            learningData.syntaxErrorPatterns = {};
        }
        
        learningData.syntaxErrorPatterns['BRACE_IMBALANCE_TRY_CATCH_MISMATCH'] = {
            count: 1,
            contexts: [{
                filePath: 'monitoring/BrokenPromise.ps1',
                line: 3423,
                message: 'Extra closing brace after try/catch block',
                solution: 'Remove extra closing brace. Check try/catch pairing separately from brace counting. Use PowerShell parser for validation.',
                timestamp: Date.now()
            }],
            solutions: [{
                solution: 'Use PowerShell parser to get actual errors, check try/catch pairing (136 try vs 133 catch), remove extra braces at identified lines',
                timestamp: Date.now()
            }],
            firstSeen: Date.now(),
            lastSeen: Date.now()
        };
        
        learningData.syntaxErrorPatterns['BRACE_IMBALANCE_EXTRA_CLOSING'] = {
            count: 1,
            contexts: [{
                filePath: 'monitoring/BrokenPromise.ps1',
                line: 5873,
                message: 'Extra closing braces at end of script',
                solution: 'Remove extra closing braces. Validate with PowerShell parser to confirm correct structure.',
                timestamp: Date.now()
            }],
            solutions: [{
                solution: 'Remove extra closing braces at end of script. Always validate with PowerShell parser before declaring fix complete.',
                timestamp: Date.now()
            }],
            firstSeen: Date.now(),
            lastSeen: Date.now()
        };
        
        // Store problem-solving approach
        if (!learningData.problemSolvingApproaches) {
            learningData.problemSolvingApproaches = [];
        }
        
        learningData.problemSolvingApproaches.push({
            problemType: 'POWERSHELL_SYNTAX_ERROR',
            approach: [
                '1. Use PowerShell parser to get actual errors (not just brace counting)',
                '2. Analyze structural issues: try/catch pairing, brace imbalances',
                '3. Identify specific problem lines from parser errors',
                '4. Fix issues at identified locations',
                '5. Validate with PowerShell parser to confirm fix'
            ],
            success: true,
            timestamp: Date.now()
        });
        
        // Keep only last 100 approaches
        if (learningData.problemSolvingApproaches.length > 100) {
            learningData.problemSolvingApproaches = learningData.problemSolvingApproaches.slice(-100);
        }
        
        // Update state store
        stateStore.updateState('ai.learning', learningData);
        stateStore.save();
        
        console.log('✅ Successfully recorded PowerShell syntax fix pattern in learning system!');
        console.log('\n   The system now knows:');
        console.log('   - Use PowerShell parser for validation (not just brace counting)');
        console.log('   - Check try/catch pairing separately (136 try vs 133 catch)');
        console.log('   - Look for structural issues, not just brace balance');
        console.log('   - Always validate with parser before declaring fix complete');
        console.log('   - Remove extra braces at specific identified lines');
        
        process.exit(0);
        
    } catch (error) {
        console.error('❌ Error teaching learning system:', error);
        console.error(error.stack);
        process.exit(1);
    }
}

// Run
teachLearningSystem();
