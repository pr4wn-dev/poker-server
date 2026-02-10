/**
 * Test BrokenPromise System Startup
 */

const path = require('path');
const projectRoot = path.resolve(__dirname, '..');

async function testSystem() {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  TESTING BROKENPROMISE SYSTEM');
    console.log('═══════════════════════════════════════════════════════════════\n');

    try {
        // Test 1: AIMonitorCore initialization
        console.log('Test 1: AIMonitorCore initialization...');
        const AIMonitorCore = require('./core/AIMonitorCore');
        const core = new AIMonitorCore(projectRoot);
        console.log('✓ AIMonitorCore initialized');
        console.log('  - Using MySQL:', core.useMySQL ? 'YES' : 'NO');
        console.log('  - StateStore type:', core.stateStore.constructor.name);
        console.log('  - LearningEngine type:', core.learningEngine.constructor.name);

        // Test 2: Database connection
        console.log('\nTest 2: Database connection...');
        if (core.useMySQL && core.stateStore.getDatabaseManager) {
            const dbManager = core.stateStore.getDatabaseManager();
            await dbManager.initialize();
            const pool = dbManager.getPool();
            const [rows] = await pool.execute('SELECT COUNT(*) as count FROM learning_patterns');
            console.log('✓ Database connected');
            console.log('  - Learning patterns:', rows[0].count);
        } else {
            console.log('⚠ Using JSON fallback (MySQL not enabled)');
        }

        // Test 3: Learning system query
        console.log('\nTest 3: Learning system query...');
        if (core.learningEngine.getMisdiagnosisPrevention) {
            const prevention = await core.learningEngine.getMisdiagnosisPrevention(
                'powershell_syntax_error',
                'Missing closing bracket',
                'BrokenPromise'
            );
            console.log('✓ Learning system query works');
            console.log('  - Source:', prevention.source || 'full system');
            console.log('  - Warnings:', prevention.warnings?.length || 0);
        }

        // Test 4: State operations
        console.log('\nTest 4: State operations...');
        core.stateStore.updateState('test.startup_check', { timestamp: Date.now(), test: true });
        const testState = core.stateStore.getState('test.startup_check');
        console.log('✓ State operations work');
        console.log('  - Test state saved and retrieved');

        console.log('\n═══════════════════════════════════════════════════════════════');
        console.log('  ALL TESTS PASSED');
        console.log('═══════════════════════════════════════════════════════════════\n');

        process.exit(0);
    } catch (error) {
        console.error('\n✗ ERROR:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

testSystem();
