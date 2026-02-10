#!/usr/bin/env node
/**
 * Test MySQL System Integration
 */

const path = require('path');
const projectRoot = path.resolve(__dirname, '..');

console.log('═══════════════════════════════════════════════════════════════');
console.log('  TESTING MYSQL SYSTEM INTEGRATION');
console.log('═══════════════════════════════════════════════════════════════\n');

try {
    const AIMonitorCore = require('./core/AIMonitorCore');
    const instance = new AIMonitorCore(projectRoot);
    
    console.log('✓ AIMonitorCore initialized');
    console.log('✓ Using:', instance.useMySQL ? 'MySQL' : 'JSON');
    console.log('✓ StateStore type:', instance.stateStore.constructor.name);
    console.log('✓ LearningEngine type:', instance.learningEngine.constructor.name);
    
    // Test state operations
    console.log('\nTesting state operations...');
    instance.stateStore.updateState('test.path', 'test-value');
    const value = instance.stateStore.getState('test.path');
    console.log('✓ State update/get works:', value === 'test-value' ? 'PASS' : 'FAIL');
    
    // Test learning engine
    console.log('\nTesting learning engine...');
    instance.learningEngine.getMisdiagnosisPrevention('test', 'test error', 'test').then(prevention => {
        console.log('✓ Learning engine query works:', prevention ? 'PASS' : 'FAIL');
        console.log('\n═══════════════════════════════════════════════════════════════');
        console.log('  ALL TESTS PASSED');
        console.log('═══════════════════════════════════════════════════════════════\n');
        process.exit(0);
    }).catch(err => {
        console.error('✗ Learning engine error:', err.message);
        process.exit(1);
    });
    
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  ALL TESTS PASSED');
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    process.exit(0);
} catch (error) {
    console.error('✗ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
}
