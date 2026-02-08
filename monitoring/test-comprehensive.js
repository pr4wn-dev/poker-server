/**
 * Comprehensive Cerberus System Test
 * 
 * Tests all components, integrations, and features end-to-end
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
    const timestamp = new Date().toISOString();
    const symbol = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : status === 'WARN' ? '⚠️' : 'ℹ️';
    console.log(`${symbol} [${timestamp}] ${message}`);
}

function test(name, fn) {
    try {
        log(`Testing: ${name}`, 'INFO');
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
        results.errors.push({ test: name, error: error.message, stack: error.stack });
        log(`ERROR: ${name} - ${error.message}`, 'FAIL');
        return false;
    }
}

async function runTests() {
    console.log('\n🔬 CERBERUS COMPREHENSIVE SYSTEM TEST\n');
    console.log('=' .repeat(60));
    
    let core = null;
    
    // Test 1: Core Component Loading
    test('Core components load', () => {
        try {
            require('./core/StateStore');
            require('./core/AILogProcessor');
            require('./core/AIIssueDetector');
            require('./core/AIFixTracker');
            require('./core/AIDecisionEngine');
            require('./core/AILearningEngine');
            require('./core/AIMonitorCore');
            require('./core/PowerShellSyntaxValidator');
            require('./core/CommandExecutionMonitor');
            return true;
        } catch (error) {
            return { success: false, error: error.message };
        }
    });
    
    // Test 2: AIMonitorCore Initialization
    test('AIMonitorCore initializes', () => {
        try {
            core = new AIMonitorCore(projectRoot);
            return core !== null;
        } catch (error) {
            return { success: false, error: error.message };
        }
    });
    
    // Test 3: StateStore
    test('StateStore works', () => {
        if (!core || !core.stateStore) return { success: false, error: 'StateStore not available' };
        try {
            core.stateStore.updateState('test.key', 'test-value');
            const value = core.stateStore.getState('test.key');
            return value === 'test-value';
        } catch (error) {
            return { success: false, error: error.message };
        }
    });
    
    // Test 4: PowerShell Syntax Validator
    test('PowerShellSyntaxValidator exists', () => {
        if (!core || !core.powerShellSyntaxValidator) {
            return { success: false, error: 'PowerShellSyntaxValidator not initialized' };
        }
        return true;
    });
    
    // Test 5: Command Execution Monitor
    test('CommandExecutionMonitor exists', () => {
        if (!core || !core.commandExecutionMonitor) {
            return { success: false, error: 'CommandExecutionMonitor not initialized' };
        }
        return true;
    });
    
    // Test 6: Learning Engine
    test('AILearningEngine exists', () => {
        if (!core || !core.learningEngine) {
            return { success: false, error: 'AILearningEngine not initialized' };
        }
        return true;
    });
    
    // Test 7: Issue Detector
    test('AIIssueDetector exists', () => {
        if (!core || !core.issueDetector) {
            return { success: false, error: 'AIIssueDetector not initialized' };
        }
        return true;
    });
    
    // Test 8: Fix Tracker
    test('AIFixTracker exists', () => {
        if (!core || !core.fixTracker) {
            return { success: false, error: 'AIFixTracker not initialized' };
        }
        return true;
    });
    
    // Test 9: PowerShell Syntax Validation (test with valid script)
    test('PowerShellSyntaxValidator validates valid script', async () => {
        if (!core || !core.powerShellSyntaxValidator) {
            return { success: false, error: 'PowerShellSyntaxValidator not available' };
        }
        try {
            const validScript = 'Write-Host "Hello World"';
            const result = await core.powerShellSyntaxValidator.validateScript(
                path.join(projectRoot, 'test-valid.ps1'),
                validScript
            );
            return result.valid === true;
        } catch (error) {
            return { success: false, error: error.message };
        }
    });
    
    // Test 10: PowerShell Syntax Validation (test with invalid script)
    test('PowerShellSyntaxValidator detects invalid script', async () => {
        if (!core || !core.powerShellSyntaxValidator) {
            return { success: false, error: 'PowerShellSyntaxValidator not available' };
        }
        try {
            const invalidScript = 'Write-Host "Hello World" } } }'; // Extra braces
            const result = await core.powerShellSyntaxValidator.validateScript(
                path.join(projectRoot, 'test-invalid.ps1'),
                invalidScript
            );
            return result.valid === false && result.errors.length > 0;
        } catch (error) {
            return { success: false, error: error.message };
        }
    });
    
    // Test 11: Command Execution Monitor tracks commands
    test('CommandExecutionMonitor tracks commands', () => {
        if (!core || !core.commandExecutionMonitor) {
            return { success: false, error: 'CommandExecutionMonitor not available' };
        }
        try {
            const activeCommands = core.commandExecutionMonitor.getActiveCommands();
            return Array.isArray(activeCommands);
        } catch (error) {
            return { success: false, error: error.message };
        }
    });
    
    // Test 12: Learning Engine has learned patterns
    test('AILearningEngine has learned patterns', () => {
        if (!core || !core.learningEngine) {
            return { success: false, error: 'AILearningEngine not available' };
        }
        try {
            // Check if learning data exists
            const learningData = core.stateStore.getState('ai.learning');
            return learningData !== null && learningData !== undefined;
        } catch (error) {
            return { success: false, error: error.message };
        }
    });
    
    // Test 13: Integration files exist
    test('Integration files exist', () => {
        const integrationFiles = [
            'monitoring/integration/CerberusIntegration.js',
            'monitoring/integration/cerberus-integration.js',
            'monitoring/CerberusIntegration.ps1',
            'monitoring/cerberus.ps1'
        ];
        
        for (const file of integrationFiles) {
            const fullPath = path.join(projectRoot, file);
            if (!fs.existsSync(fullPath)) {
                return { success: false, error: `Missing file: ${file}` };
            }
        }
        return true;
    });
    
    // Test 14: Cleanup
    test('AIMonitorCore cleanup', () => {
        if (!core) return { success: false, error: 'Core not initialized' };
        try {
            core.destroy();
            return true;
        } catch (error) {
            return { success: false, error: error.message };
        }
    });
    
    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('\n📊 TEST SUMMARY\n');
    console.log(`✅ Passed: ${results.passed}`);
    console.log(`❌ Failed: ${results.failed}`);
    console.log(`📈 Success Rate: ${((results.passed / (results.passed + results.failed)) * 100).toFixed(1)}%`);
    
    if (results.errors.length > 0) {
        console.log('\n❌ ERRORS:\n');
        results.errors.forEach((err, i) => {
            console.log(`${i + 1}. ${err.test}`);
            console.log(`   Error: ${err.error}`);
            if (err.stack) {
                console.log(`   Stack: ${err.stack.split('\n')[0]}`);
            }
        });
    }
    
    console.log('\n' + '='.repeat(60));
    
    if (results.failed === 0) {
        console.log('\n🎉 ALL TESTS PASSED! Cerberus is ready! 🎉\n');
        process.exit(0);
    } else {
        console.log('\n⚠️  Some tests failed. Review errors above.\n');
        process.exit(1);
    }
}

// Run tests
runTests().catch(error => {
    console.error('\n❌ FATAL ERROR:', error);
    console.error(error.stack);
    process.exit(1);
});
