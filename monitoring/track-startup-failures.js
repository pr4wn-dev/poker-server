#!/usr/bin/env node
/**
 * Track Startup Failures
 * Records startup verification failures to the learning system
 */

const path = require('path');
const AIMonitorCore = require('./core/AIMonitorCore');

const projectRoot = path.resolve(__dirname, '..');

async function trackStartupFailures() {
    const failures = process.argv.slice(2);
    
    if (failures.length === 0) {
        console.log(JSON.stringify({ error: 'No failures provided' }));
        process.exit(1);
    }
    
    try {
        const core = new AIMonitorCore(projectRoot);
        const learningEngine = core.learningEngine;
        
        // Parse failures (format: "TestName:Error message")
        const trackedFailures = [];
        
        for (const failure of failures) {
            const [testName, ...errorParts] = failure.split(':');
            const errorMessage = errorParts.join(':');
            
            // Create fix attempt record for learning system
            const attempt = {
                issueId: `startup-${Date.now()}-${testName}`,
                issueType: 'startup_verification_failure',
                component: 'BrokenPromise',
                fixMethod: 'startup_test',
                fixDetails: {
                    approach: 'startup_verification',
                    testName: testName,
                    errorMessage: errorMessage,
                    timeSpent: 0,
                    wrongApproach: 'System verification test failed',
                    actualRootCause: errorMessage
                },
                result: 'failure',
                timestamp: Date.now(),
                duration: 0,
                errorMessage: errorMessage,
                failureReason: errorMessage
            };
            
            // Learn from this failure
            learningEngine.learnFromAttempt(attempt);
            trackedFailures.push({ test: testName, tracked: true });
        }
        
        // Save immediately
        learningEngine.save();
        
        console.log(JSON.stringify({
            success: true,
            tracked: trackedFailures.length,
            failures: trackedFailures
        }));
        
        core.destroy();
        process.exit(0);
        
    } catch (error) {
        console.log(JSON.stringify({
            success: false,
            error: error.message,
            stack: error.stack
        }));
        process.exit(1);
    }
}

trackStartupFailures();
