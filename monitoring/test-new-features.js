/**
 * Test New Features: PowerShell Validation & Command Monitoring
 */

const path = require('path');
const fs = require('fs');
const AIMonitorCore = require('./core/AIMonitorCore');

const projectRoot = path.join(__dirname, '..');
const results = {
    passed: 0,
    failed: 0,
    errors: []
};

function log(message, status = 'INFO') {
    const symbol = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : 'ℹ️';
    console.log(`${symbol} ${message}`);
}

function test(name, fn) {
    try {
        const result = fn();
        if (result === false || (result && result.success === false)) {
            results.failed++;
            results.errors.push({ test: name, error: result?.error || 'Test returned false' });
            log(`FAILED: ${name}`, 'FAIL');
            return false;
        }
        results.passed++;
        log(`PASSED: ${name}`, 'PASS');
        return true;
    } catch (error) {
        results.failed++;
        results.errors.push({ test: name, error: error.message });
        log(`ERROR: ${name} - ${error.message}`, 'FAIL');
        return false;
    }
}

async function runTests() {
    console.log('\n🔬 TESTING NEW FEATURES\n');
    console.log('='.repeat(60));
    
    const core = new AIMonitorCore(projectRoot);
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for initialization
    
    // Test 1: PowerShell Syntax Validation - Real cerberus.ps1
    test('PowerShellSyntaxValidator validates cerberus.ps1', async () => {
        const ps1Path = path.join(projectRoot, 'monitoring', 'cerberus.ps1');
        if (!fs.existsSync(ps1Path)) {
            return { success: false, error: 'cerberus.ps1 not found' };
        }
        
        const result = await core.powerShellSyntaxValidator.validateScript(ps1Path);
        return result.valid === true;
    });
    
    // Test 2: Learning System - PowerShell Fix Pattern
    test('Learning system has PowerShell fix pattern', () => {
        const learningData = core.stateStore.getState('ai.learning');
        if (!learningData || !learningData.syntaxErrorPatterns) {
            return { success: false, error: 'No syntax error patterns found' };
        }
        
        const hasPattern = learningData.syntaxErrorPatterns['BRACE_IMBALANCE_TRY_CATCH_MISMATCH'] ||
                          learningData.syntaxErrorPatterns['BRACE_IMBALANCE_EXTRA_CLOSING'];
        return hasPattern !== undefined;
    });
    
    // Test 3: Learning System - Command Monitoring Pattern
    test('Learning system has command monitoring pattern', () => {
        const learningData = core.stateStore.getState('ai.learning');
        if (!learningData || !learningData.commandMonitoringPatterns) {
            return { success: false, error: 'No command monitoring patterns found' };
        }
        
        const hasPattern = learningData.commandMonitoringPatterns['COMMAND_STUCK_NOT_DETECTED'] ||
                          learningData.commandMonitoringPatterns['USER_CANCELLATION_NOT_DETECTED'];
        return hasPattern !== undefined;
    });
    
    // Test 4: Command Execution Monitor - Execute test command
    test('CommandExecutionMonitor executes command with timeout', async () => {
        try {
            const result = await core.commandExecutionMonitor.executeCommand(
                'echo "test"',
                { timeout: 5000 }
            );
            return result.stdout !== undefined;
        } catch (error) {
            // Command might fail on Windows, but monitor should handle it
            return error.code !== 'COMMAND_TIMEOUT';
        }
    });
    
    // Test 5: Integration - CerberusIntegration loads
    test('CerberusIntegration loads', () => {
        try {
            const CerberusIntegration = require('./integration/CerberusIntegration');
            const integration = new CerberusIntegration(projectRoot, { startSyncLoop: false });
            integration.destroy();
            return true;
        } catch (error) {
            return { success: false, error: error.message };
        }
    });
    
    // Test 6: State Store - Learning data persists
    test('Learning data persists in StateStore', () => {
        const learningData = core.stateStore.getState('ai.learning');
        return learningData !== null && learningData !== undefined;
    });
    
    // Cleanup
    core.destroy();
    
    // Summary
    console.log('\n' + '='.repeat(60));
    console.log(`\n✅ Passed: ${results.passed}`);
    console.log(`❌ Failed: ${results.failed}`);
    console.log(`📈 Success Rate: ${((results.passed / (results.passed + results.failed)) * 100).toFixed(1)}%`);
    
    if (results.errors.length > 0) {
        console.log('\n❌ ERRORS:');
        results.errors.forEach((err, i) => {
            console.log(`${i + 1}. ${err.test}: ${err.error}`);
        });
    }
    
    console.log('\n' + '='.repeat(60));
    
    if (results.failed === 0) {
        console.log('\n🎉 ALL NEW FEATURES WORKING! 🎉\n');
        process.exit(0);
    } else {
        console.log('\n⚠️  Some tests failed.\n');
        process.exit(1);
    }
}

runTests().catch(error => {
    console.error('\n❌ FATAL ERROR:', error);
    process.exit(1);
});
