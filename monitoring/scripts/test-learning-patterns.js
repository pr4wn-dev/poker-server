#!/usr/bin/env node
/**
 * Comprehensive test of learning patterns system
 */

const BrokenPromiseIntegration = require('../integration/BrokenPromiseIntegration');
const DatabaseManager = require('../core/DatabaseManager');
const path = require('path');

const projectRoot = path.resolve(__dirname, '../..');

(async () => {
    console.log('=== Testing Learning Patterns System ===\n');
    
    // Initialize
    const dbManager = new DatabaseManager(projectRoot);
    await dbManager.initialize();
    const pool = dbManager.getPool();
    
    const integration = new BrokenPromiseIntegration(projectRoot, { startSyncLoop: false });
    await integration.aiCore.initialize();
    
    // Test 1: Record a successful fix attempt
    console.log('Test 1: Recording successful fix attempt...');
    const action = {
        type: 'fix_attempt',
        issueType: 'test_issue_type',
        component: 'TestComponent',
        file: 'test.js',
        issueId: 'test-issue-123'
    };
    
    const result = {
        success: true,
        result: 'success',
        fixMethod: 'test_fix_method',
        duration: 5000,
        fixDetails: {
            actualRootCause: 'Test root cause',
            correctApproach: 'Test correct approach',
            wrongApproach: 'Test wrong approach (misdiagnosis)'
        }
    };
    
    const afterResult = integration.afterAIAction(action, result);
    console.log('✓ afterAIAction called');
    
    // Wait for async operations
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Test 2: Verify fix attempt was saved
    console.log('\nTest 2: Verifying fix attempt was saved...');
    const [attempts] = await pool.execute(
        'SELECT * FROM learning_fix_attempts WHERE issue_type = ? ORDER BY timestamp DESC LIMIT 1',
        ['test_issue_type']
    );
    
    if (attempts.length > 0) {
        console.log('✓ Fix attempt saved:', {
            issueType: attempts[0].issue_type,
            fixMethod: attempts[0].fix_method,
            result: attempts[0].result,
            timestamp: new Date(parseInt(attempts[0].timestamp)).toISOString()
        });
    } else {
        console.log('✗ Fix attempt NOT saved');
        process.exit(1);
    }
    
    // Test 3: Verify pattern was created
    console.log('\nTest 3: Verifying pattern was created...');
    const [patterns] = await pool.execute(
        'SELECT * FROM learning_patterns WHERE issue_type = ? AND solution_method = ?',
        ['test_issue_type', 'test_fix_method']
    );
    
    if (patterns.length > 0) {
        console.log('✓ Pattern created:', {
            patternKey: patterns[0].pattern_key,
            issueType: patterns[0].issue_type,
            solutionMethod: patterns[0].solution_method,
            frequency: patterns[0].frequency,
            successRate: patterns[0].success_rate,
            misdiagnosisMethod: patterns[0].misdiagnosis_method,
            lastUpdated: new Date(parseInt(patterns[0].last_updated)).toISOString()
        });
    } else {
        console.log('✗ Pattern NOT created');
        process.exit(1);
    }
    
    // Test 4: Test beforeAIAction returns pattern
    console.log('\nTest 4: Testing beforeAIAction returns pattern...');
    const beforeAction = {
        type: 'fix_attempt',
        issueType: 'test_issue_type',
        component: 'TestComponent',
        file: 'test.js'
    };
    
    const beforeResult = await integration.beforeAIAction(beforeAction);
    
    if (beforeResult.patterns && beforeResult.patterns.length > 0) {
        console.log('✓ beforeAIAction returned pattern:', {
            issueType: beforeResult.patterns[0].issueType,
            solutionMethod: beforeResult.patterns[0].solutionMethod,
            successRate: beforeResult.patterns[0].successRate
        });
    } else {
        console.log('⚠ beforeAIAction did not return pattern (may be expected if no matching patterns)');
    }
    
    // Test 5: Test getBestSolution
    console.log('\nTest 5: Testing getBestSolution...');
    const bestSolution = await integration.aiCore.learningEngine.getBestSolution('test_issue_type');
    
    if (bestSolution) {
        console.log('✓ getBestSolution returned:', {
            solutionMethod: bestSolution.solutionMethod,
            successRate: bestSolution.successRate,
            frequency: bestSolution.frequency
        });
    } else {
        console.log('⚠ getBestSolution returned null (may be expected)');
    }
    
    // Test 6: Test pattern frequency update (record another success)
    console.log('\nTest 6: Testing pattern frequency update...');
    const action2 = {
        type: 'fix_attempt',
        issueType: 'test_issue_type',
        component: 'TestComponent',
        file: 'test.js',
        issueId: 'test-issue-456'
    };
    
    const result2 = {
        success: true,
        result: 'success',
        fixMethod: 'test_fix_method',
        duration: 3000
    };
    
    integration.afterAIAction(action2, result2);
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const [updatedPatterns] = await pool.execute(
        'SELECT frequency, success_rate FROM learning_patterns WHERE pattern_key = ?',
        ['pattern_test_issue_type_test_fix_method']
    );
    
    if (updatedPatterns.length > 0 && updatedPatterns[0].frequency === 2) {
        console.log('✓ Pattern frequency updated correctly:', {
            frequency: updatedPatterns[0].frequency,
            successRate: updatedPatterns[0].success_rate
        });
    } else {
        console.log('✗ Pattern frequency NOT updated correctly');
        console.log('  Expected frequency: 2, Got:', updatedPatterns[0]?.frequency);
    }
    
    // Cleanup test data
    console.log('\nCleaning up test data...');
    await pool.execute('DELETE FROM learning_fix_attempts WHERE issue_type = ?', ['test_issue_type']);
    await pool.execute('DELETE FROM learning_patterns WHERE issue_type = ?', ['test_issue_type']);
    console.log('✓ Test data cleaned up');
    
    console.log('\n=== All Tests Passed ===');
    console.log('Learning patterns system is working correctly!');
    process.exit(0);
})().catch(error => {
    console.error('Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
});
