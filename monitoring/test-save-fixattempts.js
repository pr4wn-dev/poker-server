#!/usr/bin/env node
/**
 * Test Fix Attempts Saving
 */

const path = require('path');
const AIMonitorCore = require('./core/AIMonitorCore');
const fs = require('fs');

const projectRoot = path.resolve(__dirname, '..');

async function testSave() {
    try {
        const core = new AIMonitorCore(projectRoot);
        
        // Create a test attempt
        const attempt = {
            issueId: 'test-save-' + Date.now(),
            issueType: 'startup_verification_failure',
            fixMethod: 'startup_test',
            fixDetails: {
                testName: 'AI Core Initialization',
                errorMessage: 'AI Core not responding'
            },
            result: 'failure',
            timestamp: Date.now(),
            errorMessage: 'AI Core not responding'
        };
        
        console.log('1. Storing fix attempt...');
        core.learningEngine.learnFromAttempt(attempt);
        
        // Wait for save
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Check in-memory
        const inMemory = core.stateStore.getState('learning.fixAttempts') || {};
        console.log('2. In-memory fix attempts:', Object.keys(inMemory).length);
        
        // Check on disk
        const stateFile = path.join(projectRoot, 'logs', 'ai-state-store.json');
        if (fs.existsSync(stateFile)) {
            const content = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
            const onDisk = content.state?.learning?.fixAttempts || {};
            console.log('3. On-disk fix attempts:', Object.keys(onDisk).length);
            
            if (Object.keys(onDisk).length > 0) {
                console.log('✅ SUCCESS - Data saved to disk!');
                const sample = Object.values(onDisk)[0];
                console.log('   Sample:', sample.issueType, '-', sample.fixDetails?.testName);
            } else {
                console.log('❌ FAILED - Data not on disk');
                console.log('   In-memory has:', Object.keys(inMemory).length);
                console.log('   On-disk has:', Object.keys(onDisk).length);
            }
        } else {
            console.log('❌ State file not found');
        }
        
        core.destroy();
        process.exit(0);
        
    } catch (error) {
        console.error('ERROR:', error.message);
        process.exit(1);
    }
}

testSave();
