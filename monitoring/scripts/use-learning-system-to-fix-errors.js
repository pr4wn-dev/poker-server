#!/usr/bin/env node
/**
 * Use Learning System to Fix Errors
 * 
 * This script queries the learning system for misdiagnosis prevention
 * and solution templates when errors occur during BrokenPromise startup
 */

const path = require('path');
const BrokenPromiseIntegration = require('../integration/BrokenPromiseIntegration');

const projectRoot = path.resolve(__dirname, '../..');
const integration = new BrokenPromiseIntegration(projectRoot, { startSyncLoop: false });

async function queryLearningSystem(errorMessage, issueType, component) {
    try {
        console.log(`\n[LEARNING SYSTEM] Querying for: ${issueType || 'error'}`);
        console.log(`  Component: ${component || 'unknown'}`);
        console.log(`  Error: ${errorMessage.substring(0, 100)}...`);
        
        // Query learning system for misdiagnosis prevention
        const query = `What misdiagnosis patterns and solutions exist for: ${errorMessage}? Issue type: ${issueType || 'error'}, Component: ${component || 'unknown'}`;
        const result = await integration.query(query);
        
        if (result && result.answer) {
            console.log(`\n[LEARNING SYSTEM RESPONSE]`);
            console.log(result.answer);
            
            // Also get misdiagnosis prevention directly
            if (integration.aiCore && integration.aiCore.learningEngine) {
                const misdiagnosis = await integration.aiCore.learningEngine.getMisdiagnosisPrevention(
                    issueType,
                    errorMessage,
                    component
                );
                
                if (misdiagnosis && misdiagnosis.warnings && misdiagnosis.warnings.length > 0) {
                    console.log(`\n[MISDIAGNOSIS PREVENTION WARNINGS]`);
                    misdiagnosis.warnings.forEach((warning, i) => {
                        console.log(`  ${i + 1}. ${warning.message}`);
                        if (warning.actualRootCause) {
                            console.log(`     Actual root cause: ${warning.actualRootCause}`);
                        }
                        if (warning.correctApproach) {
                            console.log(`     Correct approach: ${warning.correctApproach}`);
                        }
                    });
                }
                
                if (misdiagnosis && misdiagnosis.correctApproach) {
                    console.log(`\n[CORRECT APPROACH]`);
                    console.log(`  ${misdiagnosis.correctApproach}`);
                }
                
                if (misdiagnosis && misdiagnosis.failedMethods && misdiagnosis.failedMethods.length > 0) {
                    console.log(`\n[WHAT NOT TO DO]`);
                    misdiagnosis.failedMethods.forEach((method, i) => {
                        console.log(`  ${i + 1}. ${method.method} (failed ${method.frequency} times, wasted ${Math.round(method.timeWasted / 1000 / 60)} min)`);
                    });
                }
            }
        }
        
        return result;
    } catch (error) {
        console.error(`[ERROR] Failed to query learning system:`, error.message);
        return null;
    }
}

// Common errors from the paste
const errors = [
    {
        errorMessage: 'FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory',
        issueType: 'memory_heap_overflow',
        component: 'Node.js'
    },
    {
        errorMessage: "TypeError: Cannot read properties of null (reading 'status')",
        issueType: 'null_reference_state',
        component: 'AIDecisionEngine'
    },
    {
        errorMessage: 'AI Core not responding (timeout or no response)',
        issueType: 'verification_memory_overflow',
        component: 'Verification'
    }
];

async function main() {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  USING LEARNING SYSTEM TO FIX ERRORS');
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    // Wait for integration to initialize
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    for (const error of errors) {
        await queryLearningSystem(error.errorMessage, error.issueType, error.component);
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  LEARNING SYSTEM QUERIES COMPLETE');
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    process.exit(0);
}

if (require.main === module) {
    main().catch(error => {
        console.error('Failed:', error);
        process.exit(1);
    });
}

module.exports = { queryLearningSystem };
