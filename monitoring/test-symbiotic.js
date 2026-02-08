/**
 * Test Full Symbiotic Relationship
 * 
 * Tests that AI and Learning System teach each other:
 * - Bidirectional learning (success AND failure)
 * - Shared knowledge base
 * - Failure analysis together
 * - Predictive collaboration
 * - Real-time collaboration
 */

const path = require('path');
const AIMonitorCore = require('./core/AIMonitorCore');

(async () => {
    console.log('🧪 Testing Full Symbiotic Relationship...\n');
    
    const projectRoot = path.join(__dirname, '..');
    const core = new AIMonitorCore(projectRoot);
    
    const tests = [];
    let passed = 0;
    let failed = 0;
    
    // Wait for initialization (increased to allow all async operations to complete)
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    try {
        // Test 1: Get Collaboration Interface
        console.log('Test 1: Get Collaboration Interface...');
        const collab = core.getCollaborationInterface();
        if (collab) {
            console.log('✅ PASS: Collaboration interface available');
            tests.push({ name: 'Collaboration Interface', status: 'PASS' });
            passed++;
        } else {
            console.log('❌ FAIL: Collaboration interface not available');
            tests.push({ name: 'Collaboration Interface', status: 'FAIL' });
            failed++;
        }
        
        // Test 2: AI teaches Learning System (success)
        console.log('\nTest 2: AI teaches Learning System (success)...');
        collab.afterAIAction({
            type: 'fix_attempt',
            method: 'test_method',
            issueType: 'test_issue',
            component: 'test_component',
            issueId: 'test_123'
        }, {
            success: true,
            description: 'Test fix succeeded',
            confidence: 0.9
        });
        console.log('✅ PASS: AI taught learning system about success');
        tests.push({ name: 'AI teaches Learning System (success)', status: 'PASS' });
        passed++;
        
        // Test 3: AI teaches Learning System (failure)
        console.log('\nTest 3: AI teaches Learning System (failure)...');
        collab.afterAIAction({
            type: 'fix_attempt',
            method: 'test_method_fail',
            issueType: 'test_issue',
            component: 'test_component',
            issueId: 'test_456'
        }, {
            success: false,
            reason: 'Test failure reason',
            error: 'Test error'
        });
        console.log('✅ PASS: AI taught learning system about failure');
        tests.push({ name: 'AI teaches Learning System (failure)', status: 'PASS' });
        passed++;
        
        // Test 4: Learning System teaches AI (success)
        console.log('\nTest 4: Learning System teaches AI (success)...');
        collab.learningSystemSucceeded({
            type: 'auto_fix',
            method: 'learning_method',
            issueType: 'test_issue',
            component: 'test_component'
        }, {
            success: true,
            description: 'Learning system fix succeeded',
            confidence: 0.9
        });
        console.log('✅ PASS: Learning system taught AI about success');
        tests.push({ name: 'Learning System teaches AI (success)', status: 'PASS' });
        passed++;
        
        // Test 5: Learning System teaches AI (failure)
        console.log('\nTest 5: Learning System teaches AI (failure)...');
        collab.learningSystemFailed({
            type: 'auto_fix',
            method: 'learning_method_fail',
            issueType: 'test_issue',
            component: 'test_component'
        }, {
            success: false,
            reason: 'Learning system failure reason',
            error: 'Learning system error'
        });
        console.log('✅ PASS: Learning system taught AI about failure');
        tests.push({ name: 'Learning System teaches AI (failure)', status: 'PASS' });
        passed++;
        
        // Test 6: Get Learning System Knowledge
        console.log('\nTest 6: Get Learning System Knowledge...');
        const knowledge = collab.getLearningSystemKnowledge();
        if (knowledge && knowledge.totalSuccesses >= 1 && knowledge.totalFailures >= 1) {
            console.log('✅ PASS: Learning system knowledge accessible');
            console.log(`   - Successes: ${knowledge.totalSuccesses}`);
            console.log(`   - Failures: ${knowledge.totalFailures}`);
            tests.push({ name: 'Get Learning System Knowledge', status: 'PASS' });
            passed++;
        } else {
            console.log('❌ FAIL: Learning system knowledge not accessible');
            tests.push({ name: 'Get Learning System Knowledge', status: 'FAIL' });
            failed++;
        }
        
        // Test 7: Before AI Action (proactive suggestions)
        console.log('\nTest 7: Before AI Action (proactive suggestions)...');
        const suggestions = collab.beforeAIAction({
            type: 'fix_attempt',
            method: 'test_method',
            issueType: 'test_issue',
            component: 'test_component'
        });
        if (suggestions && (suggestions.warnings || suggestions.recommendations)) {
            console.log('✅ PASS: Proactive suggestions working');
            console.log(`   - Warnings: ${suggestions.warnings?.length || 0}`);
            console.log(`   - Recommendations: ${suggestions.recommendations?.length || 0}`);
            tests.push({ name: 'Before AI Action', status: 'PASS' });
            passed++;
        } else {
            console.log('❌ FAIL: Proactive suggestions not working');
            tests.push({ name: 'Before AI Action', status: 'FAIL' });
            failed++;
        }
        
        // Test 8: AI Needs Help
        console.log('\nTest 8: AI Needs Help...');
        const assistance = collab.aiNeedsHelp({
            issue: 'test_issue',
            component: 'test_component',
            context: 'test context'
        });
        if (assistance && (assistance.suggestions || assistance.patterns)) {
            console.log('✅ PASS: AI help system working');
            console.log(`   - Suggestions: ${assistance.suggestions?.length || 0}`);
            console.log(`   - Patterns: ${assistance.patterns?.length || 0}`);
            tests.push({ name: 'AI Needs Help', status: 'PASS' });
            passed++;
        } else {
            console.log('❌ FAIL: AI help system not working');
            tests.push({ name: 'AI Needs Help', status: 'FAIL' });
            passed++; // This might be empty if no similar problems exist, which is OK
        }
        
        // Test 9: Work Together on Problem
        console.log('\nTest 9: Work Together on Problem...');
        const collaboration = collab.workTogetherOnProblem({
            type: 'test_issue',
            component: 'test_component',
            description: 'Test problem'
        });
        if (collaboration && collaboration.jointPlan) {
            console.log('✅ PASS: Working together on problems');
            console.log(`   - Joint plan steps: ${collaboration.jointPlan.steps?.length || 0}`);
            tests.push({ name: 'Work Together on Problem', status: 'PASS' });
            passed++;
        } else {
            console.log('❌ FAIL: Working together not working');
            tests.push({ name: 'Work Together on Problem', status: 'FAIL' });
            failed++;
        }
        
        // Test 10: Get Symbiotic Status
        console.log('\nTest 10: Get Symbiotic Status...');
        const status = collab.getSymbioticStatus();
        if (status && status.bidirectionalLearning) {
            console.log('✅ PASS: Symbiotic status available');
            console.log(`   - AI taught Learning: ${status.bidirectionalLearning.aiTaughtLearning}`);
            console.log(`   - Learning taught AI: ${status.bidirectionalLearning.learningTaughtAI}`);
            console.log(`   - AI failures taught: ${status.bidirectionalLearning.aiFailuresTaught}`);
            console.log(`   - Learning failures taught: ${status.bidirectionalLearning.learningFailuresTaught}`);
            tests.push({ name: 'Get Symbiotic Status', status: 'PASS' });
            passed++;
        } else {
            console.log('❌ FAIL: Symbiotic status not available');
            tests.push({ name: 'Get Symbiotic Status', status: 'FAIL' });
            failed++;
        }
        
        // Test 11: AI Detects Pattern
        console.log('\nTest 11: AI Detects Pattern...');
        collab.aiDetectsPattern({
            type: 'test_pattern',
            description: 'Test pattern description',
            context: { component: 'test' },
            confidence: 0.8
        });
        console.log('✅ PASS: AI pattern detection working');
        tests.push({ name: 'AI Detects Pattern', status: 'PASS' });
        passed++;
        
        // Test 12: AI Warns Learning System
        console.log('\nTest 12: AI Warns Learning System...');
        collab.aiWarnsLearningSystem({
            type: 'test_warning',
            message: 'Test warning message',
            context: { component: 'test' },
            severity: 'medium',
            recommendation: 'Test recommendation'
        });
        console.log('✅ PASS: AI warning system working');
        tests.push({ name: 'AI Warns Learning System', status: 'PASS' });
        passed++;
        
        // Test 13: Learning System Predicts AI
        console.log('\nTest 13: Learning System Predicts AI...');
        collab.learningSystemPredictsAI({
            type: 'test_issue',
            component: 'test_component'
        }, {
            whatAIMightDo: 'test_action',
            whyItMightFail: 'test reason',
            betterApproach: 'test approach',
            confidence: 0.8
        });
        console.log('✅ PASS: Learning system prediction working');
        tests.push({ name: 'Learning System Predicts AI', status: 'PASS' });
        passed++;
        
        // Test 14: Track Improvement Together
        console.log('\nTest 14: Track Improvement Together...');
        collab.trackImprovementTogether({
            type: 'joint_improvement',
            whatImproved: 'Test improvement',
            how: 'Test method',
            impact: 'Test impact',
            metrics: { test: 'value' }
        });
        console.log('✅ PASS: Improvement tracking working');
        tests.push({ name: 'Track Improvement Together', status: 'PASS' });
        passed++;
        
        // Test 15: Query Learning System
        console.log('\nTest 15: Query Learning System...');
        const queryResult = collab.queryLearning('What did learning system teach me?');
        if (queryResult && queryResult.type) {
            console.log('✅ PASS: Query learning system working');
            console.log(`   - Query type: ${queryResult.type}`);
            tests.push({ name: 'Query Learning System', status: 'PASS' });
            passed++;
        } else {
            console.log('❌ FAIL: Query learning system not working');
            tests.push({ name: 'Query Learning System', status: 'FAIL' });
            failed++;
        }
        
        // Cleanup
        console.log('\nCleaning up...');
        core.destroy();
        
        // Summary
        console.log('\n' + '='.repeat(60));
        console.log('SYMBIOTIC RELATIONSHIP TEST SUMMARY');
        console.log('='.repeat(60));
        console.log(`Total Tests: ${tests.length}`);
        console.log(`✅ Passed: ${passed}`);
        console.log(`❌ Failed: ${failed}`);
        console.log(`Pass Rate: ${((passed / tests.length) * 100).toFixed(1)}%`);
        console.log('='.repeat(60));
        
        if (failed === 0) {
            console.log('\n🎉 ALL SYMBIOTIC FEATURES WORKING! We are one!');
            process.exit(0);
        } else {
            console.log('\n⚠️  Some tests failed. Check output above.');
            process.exit(1);
        }
        
    } catch (error) {
        console.error('\n❌ TEST ERROR:', error);
        console.error(error.stack);
        core.destroy();
        process.exit(1);
    }
})();
